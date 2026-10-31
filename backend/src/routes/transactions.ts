import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqlValue } from 'sql.js';
import { execQuery, execRun, saveDb, r, Params } from '../db/helpers';
import { calculateLineItemGST } from '../services/gst';

const router = Router();

function getNextSequence(txType: string): number {
  const { getDb } = require('../db/database');
  const db = getDb();
  db.run(`UPDATE sequences SET value = value + 1 WHERE key = ?`, [txType]);
  const result = execQuery(`SELECT value FROM sequences WHERE key = :key`, { ':key': txType });
  return Number(result[0]?.value ?? 1);
}

function generateInvoiceNumber(type: string, seq: number): string {
  const prefixMap: Record<string, string> = {
    sale: 'INV', purchase: 'PUR', expense: 'EXP',
    payment_in: 'PIN', payment_out: 'POT', quotation: 'QUO',
    proforma: 'PRO', delivery_challan: 'DCH',
    credit_note: 'CRN', debit_note: 'DBN',
  };
  const prefix = prefixMap[type] ?? 'TXN';
  const year = new Date().getFullYear().toString().slice(-2);
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  return `${prefix}-${year}${month}-${String(seq).padStart(4, '0')}`;
}

interface TransactionItemInput {
  item_id?: string;
  item_name: string;
  sku?: string;
  quantity: number;
  unit?: string;
  price: number;
  discount_pct?: number;
  discount_amt?: number;
  tax_rate?: number;
  batch_number?: string;
  expiry_date?: string;
}

interface ProcessedItem extends TransactionItemInput {
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  tax_amount: number;
  discount_amt: number;
  total: number;
}

// GET /api/transactions/next-number/:type - must be before /:id
router.get('/next-number/:type', (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const seqRows = execQuery(`SELECT value FROM sequences WHERE key = :key`, { ':key': type });
    const nextSeq = Number(seqRows[0]?.value ?? 0) + 1;
    const number = generateInvoiceNumber(String(type), nextSeq);
    res.json({ success: true, data: { next_number: number, sequence: nextSeq } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/transactions
router.get('/', (req: Request, res: Response) => {
  try {
    const { type, party_id, from_date, to_date, status, limit = '100', offset = '0' } = req.query;
    let sql = `SELECT * FROM transactions WHERE 1=1`;
    const params: Params = {};

    if (type) { sql += ` AND type = :type`; params[':type'] = type as string; }
    if (party_id) { sql += ` AND party_id = :party_id`; params[':party_id'] = party_id as string; }
    if (from_date) { sql += ` AND date >= :from_date`; params[':from_date'] = from_date as string; }
    if (to_date) { sql += ` AND date <= :to_date`; params[':to_date'] = to_date as string; }
    if (status) { sql += ` AND status = :status`; params[':status'] = status as string; }

    sql += ` ORDER BY date DESC, created_at DESC LIMIT :limit OFFSET :offset`;
    params[':limit'] = Number(limit);
    params[':offset'] = Number(offset);

    const transactions = execQuery(sql, params);
    res.json({ success: true, data: transactions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/transactions/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const txRows = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': id });
    if (!txRows.length) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }
    const items = execQuery(`SELECT * FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    const paymentsRows = execQuery(`SELECT * FROM payments WHERE transaction_id = :id`, { ':id': id });
    res.json({ success: true, data: { ...txRows[0], items, payments: paymentsRows } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/transactions
router.post('/', (req: Request, res: Response) => {
  try {
    let {
      type, date: rawDate, invoice_date, party_id, party_name,
      items: lineItems = [],
      discount_amount = 0, round_off = 0,
      paid_amount, amount_paid, payment_method = 'cash',
      notes, status = 'pending', is_gst = 1, supply_state,
    } = req.body;

    if (type === 'sale_invoice') type = 'sale';
    if (type === 'purchase_invoice') type = 'purchase';

    const date = rawDate || invoice_date || new Date().toISOString().split('T')[0];

    if (!type || !date) {
      res.status(400).json({ success: false, error: 'type and date are required' });
      return;
    }

    const bizRows = execQuery(`SELECT state_code FROM business_settings LIMIT 1`);
    const bizStateCode = String(bizRows[0]?.state_code ?? '27');

    let partyStateCode: string | null = supply_state ?? null;
    if (!partyStateCode && party_id) {
      const partyRows = execQuery(`SELECT state_code FROM parties WHERE id = :id`, { ':id': party_id as string });
      partyStateCode = partyRows[0]?.state_code ? String(partyRows[0].state_code) : null;
    }

    const isSameState = !partyStateCode || partyStateCode === bizStateCode;

    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;
    const processedItems: ProcessedItem[] = [];

    for (const item of lineItems as TransactionItemInput[]) {
      const itemPrice = Number(item.price ?? (item as any).unit_price ?? 0);
      const gstCalc = calculateLineItemGST({
        price: itemPrice,
        quantity: Number(item.quantity ?? 1),
        discountPct: item.discount_pct != null ? Number(item.discount_pct) : 0,
        discountAmt: item.discount_amt != null ? Number(item.discount_amt) : undefined,
        taxRate: Number(item.tax_rate ?? 18),
        isSameState: is_gst ? isSameState : true,
      });
      subtotal = r(subtotal + gstCalc.taxableAmount);
      totalCgst = r(totalCgst + gstCalc.cgst);
      totalSgst = r(totalSgst + gstCalc.sgst);
      totalIgst = r(totalIgst + gstCalc.igst);
      totalTax = r(totalTax + gstCalc.taxAmount);
      processedItems.push({
        ...item,
        price: itemPrice,
        cgst_rate: gstCalc.cgstRate,
        sgst_rate: gstCalc.sgstRate,
        igst_rate: gstCalc.igstRate,
        tax_amount: gstCalc.taxAmount,
        discount_amt: gstCalc.discountAmt,
        total: gstCalc.lineTotal,
      });
    }

    const discountAmt = r(Number(discount_amount));
    const roundOff = r(Number(round_off));
    const total = r(subtotal + totalTax - discountAmt + roundOff);
    const paidAmt = r(Number(paid_amount ?? amount_paid ?? 0));
    const balanceDue = r(total - paidAmt);
    const txStatus = paidAmt >= total ? 'paid' : (paidAmt > 0 ? 'partial' : status);

    const id = uuidv4();
    const now = new Date().toISOString();
    const seq = getNextSequence(type as string);
    const number = generateInvoiceNumber(type as string, seq);

    let resolvedPartyName: string | null = party_name ?? null;
    if (!resolvedPartyName && party_id) {
      const partyRows = execQuery(`SELECT name FROM parties WHERE id = :id`, { ':id': party_id as string });
      resolvedPartyName = partyRows[0]?.name ? String(partyRows[0].name) : null;
    }

    execRun(`
      INSERT INTO transactions (
        id, type, number, date, party_id, party_name,
        subtotal, discount_amount, cgst, sgst, igst, total_tax,
        round_off, total, paid_amount, balance_due, payment_method,
        notes, status, is_gst, supply_state, created_at, updated_at
      ) VALUES (
        :id, :type, :number, :date, :party_id, :party_name,
        :subtotal, :discount_amount, :cgst, :sgst, :igst, :total_tax,
        :round_off, :total, :paid_amount, :balance_due, :payment_method,
        :notes, :status, :is_gst, :supply_state, :created_at, :updated_at
      )
    `, {
      ':id': id, ':type': type as string, ':number': number, ':date': date as string,
      ':party_id': party_id ?? null, ':party_name': resolvedPartyName,
      ':subtotal': subtotal, ':discount_amount': discountAmt,
      ':cgst': totalCgst, ':sgst': totalSgst, ':igst': totalIgst,
      ':total_tax': totalTax, ':round_off': roundOff,
      ':total': total, ':paid_amount': paidAmt, ':balance_due': balanceDue,
      ':payment_method': payment_method as string, ':notes': notes ?? null,
      ':status': txStatus as string, ':is_gst': is_gst ? 1 : 0,
      ':supply_state': partyStateCode,
      ':created_at': now, ':updated_at': now,
    });

    for (const item of processedItems) {
      const tiId = uuidv4();
      execRun(`
        INSERT INTO transaction_items (
          id, transaction_id, item_id, item_name, sku, quantity, unit,
          price, discount_pct, discount_amt, tax_rate, cgst_rate, sgst_rate, igst_rate,
          tax_amount, total, batch_number, expiry_date
        ) VALUES (
          :id, :transaction_id, :item_id, :item_name, :sku, :quantity, :unit,
          :price, :discount_pct, :discount_amt, :tax_rate, :cgst_rate, :sgst_rate, :igst_rate,
          :tax_amount, :total, :batch_number, :expiry_date
        )
      `, {
        ':id': tiId, ':transaction_id': id,
        ':item_id': item.item_id ?? null,
        ':item_name': item.item_name,
        ':sku': item.sku ?? null,
        ':quantity': r(Number(item.quantity)),
        ':unit': item.unit ?? 'Nos',
        ':price': r(Number(item.price)),
        ':discount_pct': r(Number(item.discount_pct ?? 0)),
        ':discount_amt': item.discount_amt,
        ':tax_rate': r(Number(item.tax_rate ?? 18)),
        ':cgst_rate': item.cgst_rate,
        ':sgst_rate': item.sgst_rate,
        ':igst_rate': item.igst_rate,
        ':tax_amount': item.tax_amount,
        ':total': item.total,
        ':batch_number': item.batch_number ?? null,
        ':expiry_date': item.expiry_date ?? null,
      });

      if (item.item_id) {
        const stockDelta = (type === 'sale' || type === 'delivery_challan')
          ? -Math.abs(Number(item.quantity))
          : (type === 'purchase' ? Math.abs(Number(item.quantity)) : 0);

        if (stockDelta !== 0) {
          execRun(`UPDATE items SET stock_qty = stock_qty + :delta, updated_at = :now WHERE id = :id`, {
            ':delta': stockDelta, ':now': now, ':id': item.item_id,
          });
          const movId = uuidv4();
          execRun(`
            INSERT INTO stock_movements (id, item_id, transaction_id, type, quantity, date, notes, created_at)
            VALUES (:id, :item_id, :transaction_id, :type, :quantity, :date, :notes, :created_at)
          `, {
            ':id': movId, ':item_id': item.item_id, ':transaction_id': id,
            ':type': stockDelta > 0 ? 'in' : 'out',
            ':quantity': Math.abs(stockDelta),
            ':date': date as string,
            ':notes': `Auto: ${type} ${number}`,
            ':created_at': now,
          });
        }
      }
    }

    // Record initial payment if paid_amount > 0
    if (paidAmt > 0) {
      const payId = uuidv4();
      const payType = (type === 'sale' || type === 'credit_note') ? 'payment_in' : 'payment_out';
      execRun(`
        INSERT INTO payments (id, transaction_id, party_id, type, amount, method, date, reference, notes, created_at)
        VALUES (:id, :transaction_id, :party_id, :type, :amount, :method, :date, :reference, :notes, :created_at)
      `, {
        ':id': payId, ':transaction_id': id,
        ':party_id': party_id ?? null,
        ':type': payType,
        ':amount': paidAmt,
        ':method': payment_method as string,
        ':date': date as string,
        ':reference': number,
        ':notes': `Payment with ${type} ${number}`,
        ':created_at': now,
      });
    }

    saveDb();
    const created = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': id });
    const createdItems = execQuery(`SELECT * FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: { ...created[0], items: createdItems } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/transactions/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }

    const tx = existing[0] as Record<string, SqlValue>;
    if (tx.status === 'cancelled') {
      res.status(400).json({ success: false, error: 'Cannot update a cancelled transaction' });
      return;
    }

    const now = new Date().toISOString();
    const txType = String(tx.type);

    // Reverse old stock movements for this transaction
    const oldItems = execQuery(`SELECT * FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    for (const oldItem of oldItems) {
      if (oldItem.item_id) {
        const reverseStockDelta = (txType === 'sale' || txType === 'delivery_challan')
          ? Math.abs(Number(oldItem.quantity))
          : (txType === 'purchase' ? -Math.abs(Number(oldItem.quantity)) : 0);
        if (reverseStockDelta !== 0) {
          execRun(`UPDATE items SET stock_qty = stock_qty + :delta, updated_at = :now WHERE id = :id`, {
            ':delta': reverseStockDelta, ':now': now, ':id': oldItem.item_id as string,
          });
        }
      }
    }

    execRun(`DELETE FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    execRun(`DELETE FROM stock_movements WHERE transaction_id = :id`, { ':id': id });

    const {
      date: rawDate, invoice_date, party_id, party_name, items: lineItems = [],
      discount_amount = 0, round_off = 0, paid_amount, amount_paid,
      payment_method, notes, is_gst = 1, supply_state,
    } = req.body;

    const date = rawDate || invoice_date || tx.date;

    const bizRows = execQuery(`SELECT state_code FROM business_settings LIMIT 1`);
    const bizStateCode = String(bizRows[0]?.state_code ?? '27');

    let partyStateCode: string | null = supply_state ?? null;
    const pId = party_id ?? tx.party_id;
    if (!partyStateCode && pId) {
      const partyRows = execQuery(`SELECT state_code FROM parties WHERE id = :id`, { ':id': pId as string });
      partyStateCode = partyRows[0]?.state_code ? String(partyRows[0].state_code) : null;
    }

    const isSameState = !partyStateCode || partyStateCode === bizStateCode;

    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;
    const processedItems: ProcessedItem[] = [];

    for (const item of lineItems as TransactionItemInput[]) {
      const itemPrice = Number(item.price ?? (item as any).unit_price ?? 0);
      const gstCalc = calculateLineItemGST({
        price: itemPrice,
        quantity: Number(item.quantity ?? 1),
        discountPct: item.discount_pct != null ? Number(item.discount_pct) : 0,
        discountAmt: item.discount_amt != null ? Number(item.discount_amt) : undefined,
        taxRate: Number(item.tax_rate ?? 18),
        isSameState: is_gst ? isSameState : true,
      });
      subtotal = r(subtotal + gstCalc.taxableAmount);
      totalCgst = r(totalCgst + gstCalc.cgst);
      totalSgst = r(totalSgst + gstCalc.sgst);
      totalIgst = r(totalIgst + gstCalc.igst);
      totalTax = r(totalTax + gstCalc.taxAmount);
      processedItems.push({
        ...item,
        price: itemPrice,
        cgst_rate: gstCalc.cgstRate, sgst_rate: gstCalc.sgstRate,
        igst_rate: gstCalc.igstRate, tax_amount: gstCalc.taxAmount,
        discount_amt: gstCalc.discountAmt, total: gstCalc.lineTotal,
      });
    }

    const discountAmt = r(Number(discount_amount));
    const roundOff = r(Number(round_off));
    const total = r(subtotal + totalTax - discountAmt + roundOff);

    const payRows = execQuery(`SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE transaction_id = :id`, { ':id': id });
    const paidInput = paid_amount ?? amount_paid;
    const totalPaid = paidInput != null ? r(Number(paidInput)) : r(Number(payRows[0]?.total_paid ?? 0));
    const balanceDue = r(total - totalPaid);
    const txStatus = totalPaid >= total ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending');

    let resolvedPartyName: string | null = party_name ?? (tx.party_name ? String(tx.party_name) : null);
    if (!resolvedPartyName && pId) {
      const partyRows = execQuery(`SELECT name FROM parties WHERE id = :id`, { ':id': pId as string });
      resolvedPartyName = partyRows[0]?.name ? String(partyRows[0].name) : null;
    }

    execRun(`
      UPDATE transactions SET
        date = :date, party_id = :party_id, party_name = :party_name,
        subtotal = :subtotal, discount_amount = :discount_amount,
        cgst = :cgst, sgst = :sgst, igst = :igst, total_tax = :total_tax,
        round_off = :round_off, total = :total,
        paid_amount = :paid_amount, balance_due = :balance_due,
        payment_method = :payment_method, notes = :notes, status = :status,
        is_gst = :is_gst, supply_state = :supply_state, updated_at = :updated_at
      WHERE id = :id
    `, {
      ':id': id,
      ':date': date ?? String(tx.date),
      ':party_id': pId ?? null,
      ':party_name': resolvedPartyName,
      ':subtotal': subtotal, ':discount_amount': discountAmt,
      ':cgst': totalCgst, ':sgst': totalSgst, ':igst': totalIgst,
      ':total_tax': totalTax, ':round_off': roundOff,
      ':total': total, ':paid_amount': totalPaid, ':balance_due': balanceDue,
      ':payment_method': payment_method ?? String(tx.payment_method),
      ':notes': notes ?? tx.notes ?? null,
      ':status': txStatus,
      ':is_gst': is_gst ? 1 : 0,
      ':supply_state': partyStateCode,
      ':updated_at': now,
    });

    for (const item of processedItems) {
      const tiId = uuidv4();
      execRun(`
        INSERT INTO transaction_items (
          id, transaction_id, item_id, item_name, sku, quantity, unit,
          price, discount_pct, discount_amt, tax_rate, cgst_rate, sgst_rate, igst_rate,
          tax_amount, total, batch_number, expiry_date
        ) VALUES (
          :id, :transaction_id, :item_id, :item_name, :sku, :quantity, :unit,
          :price, :discount_pct, :discount_amt, :tax_rate, :cgst_rate, :sgst_rate, :igst_rate,
          :tax_amount, :total, :batch_number, :expiry_date
        )
      `, {
        ':id': tiId, ':transaction_id': id,
        ':item_id': item.item_id ?? null,
        ':item_name': item.item_name,
        ':sku': item.sku ?? null,
        ':quantity': r(Number(item.quantity)),
        ':unit': item.unit ?? 'Nos',
        ':price': r(Number(item.price)),
        ':discount_pct': r(Number(item.discount_pct ?? 0)),
        ':discount_amt': item.discount_amt,
        ':tax_rate': r(Number(item.tax_rate ?? 18)),
        ':cgst_rate': item.cgst_rate, ':sgst_rate': item.sgst_rate,
        ':igst_rate': item.igst_rate, ':tax_amount': item.tax_amount,
        ':total': item.total,
        ':batch_number': item.batch_number ?? null,
        ':expiry_date': item.expiry_date ?? null,
      });

      if (item.item_id) {
        const stockDelta = (txType === 'sale' || txType === 'delivery_challan')
          ? -Math.abs(Number(item.quantity))
          : (txType === 'purchase' ? Math.abs(Number(item.quantity)) : 0);

        if (stockDelta !== 0) {
          execRun(`UPDATE items SET stock_qty = stock_qty + :delta, updated_at = :now WHERE id = :id`, {
            ':delta': stockDelta, ':now': now, ':id': item.item_id,
          });
          const movId = uuidv4();
          const numRows = execQuery(`SELECT number FROM transactions WHERE id = :id`, { ':id': id });
          execRun(`
            INSERT INTO stock_movements (id, item_id, transaction_id, type, quantity, date, notes, created_at)
            VALUES (:id, :item_id, :transaction_id, :type, :quantity, :date, :notes, :created_at)
          `, {
            ':id': movId, ':item_id': item.item_id, ':transaction_id': id,
            ':type': stockDelta > 0 ? 'in' : 'out',
            ':quantity': Math.abs(stockDelta),
            ':date': date ?? String(tx.date),
            ':notes': `Auto: ${txType} ${numRows[0]?.number ?? id}`,
            ':created_at': now,
          });
        }
      }
    }

    saveDb();
    const updated = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': id });
    const updatedItems = execQuery(`SELECT * FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    res.json({ success: true, data: { ...updated[0], items: updatedItems } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/transactions/:id (cancel)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }

    const tx = existing[0] as Record<string, SqlValue>;
    if (tx.status === 'cancelled') {
      res.status(400).json({ success: false, error: 'Transaction already cancelled' });
      return;
    }

    const now = new Date().toISOString();
    const txType = String(tx.type);

    const items = execQuery(`SELECT * FROM transaction_items WHERE transaction_id = :id`, { ':id': id });
    for (const item of items) {
      if (item.item_id) {
        const reverseStockDelta = (txType === 'sale' || txType === 'delivery_challan')
          ? Math.abs(Number(item.quantity))
          : (txType === 'purchase' ? -Math.abs(Number(item.quantity)) : 0);
        if (reverseStockDelta !== 0) {
          execRun(`UPDATE items SET stock_qty = stock_qty + :delta, updated_at = :now WHERE id = :id`, {
            ':delta': reverseStockDelta, ':now': now, ':id': item.item_id as string,
          });
        }
      }
    }

    execRun(`UPDATE transactions SET status = 'cancelled', updated_at = :now WHERE id = :id`, {
      ':now': now, ':id': id,
    });

    saveDb();
    res.json({ success: true, message: 'Transaction cancelled successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
