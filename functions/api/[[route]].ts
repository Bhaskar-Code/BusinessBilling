// Cloudflare Pages Functions - Full API Router connecting to Cloudflare D1

interface Env {
  DB: any;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateInvoiceNumber(type: string, seq: number): string {
  const prefixMap: Record<string, string> = {
    sale: 'INV',
    purchase: 'PUR',
    expense: 'EXP',
    payment_in: 'PAY-IN',
    payment_out: 'PAY-OUT',
    quotation: 'QTN',
    proforma: 'PI',
    delivery_challan: 'DC',
    credit_note: 'CN',
    debit_note: 'DN',
  };
  const prefix = prefixMap[type] || 'TXN';
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const seqStr = String(seq).padStart(4, '0');
  return `${prefix}-${year}${month}-${seqStr}`;
}

function calculateLineItemGST(input: {
  price: number;
  quantity: number;
  discountPct?: number;
  discountAmt?: number;
  taxRate: number;
  isSameState: boolean;
}) {
  const grossAmount = r(input.price * input.quantity);
  const discountAmt = input.discountAmt != null
    ? r(input.discountAmt)
    : r(grossAmount * (input.discountPct ?? 0) / 100);

  const taxableAmount = r(grossAmount - discountAmt);
  let cgst = 0, sgst = 0, igst = 0, totalTax = 0;

  if (input.isSameState) {
    const halfRate = input.taxRate / 2;
    cgst = r(taxableAmount * halfRate / 100);
    sgst = r(taxableAmount * halfRate / 100);
    totalTax = r(cgst + sgst);
  } else {
    igst = r(taxableAmount * input.taxRate / 100);
    totalTax = igst;
  }

  const cgstRate = input.isSameState ? input.taxRate / 2 : 0;
  const sgstRate = input.isSameState ? input.taxRate / 2 : 0;
  const igstRate = input.isSameState ? 0 : input.taxRate;

  return {
    taxableAmount,
    discountAmt,
    cgst,
    sgst,
    igst,
    cgstRate,
    sgstRate,
    igstRate,
    taxAmount: totalTax,
    lineTotal: r(taxableAmount + totalTax),
  };
}

// Database helper functions using context.env.DB
async function queryAll(db: any, sql: string, params: any[] = []): Promise<any[]> {
  const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const res = await stmt.all();
  return res.results || [];
}

async function queryFirst(db: any, sql: string, params: any[] = []): Promise<any | null> {
  const rows = await queryAll(db, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function execute(db: any, sql: string, params: any[] = []): Promise<any> {
  const stmt = params.length > 0 ? db.prepare(sql).bind(...params) : db.prepare(sql);
  return await stmt.run();
}

export async function onRequest(context: any): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const segments = path.split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const db = env.DB;
  if (!db) {
    return jsonResponse({ success: false, error: 'Database binding (DB) not configured' }, 500);
  }

  try {
    // 1. HEALTH
    if (segments[0] === 'health') {
      return jsonResponse({ success: true, message: 'Vyapaar Cloudflare Pages API is running', timestamp: new Date().toISOString() });
    }

    // 2. D1 STATUS
    if (segments[0] === 'd1' && segments[1] === 'status') {
      const tables = await queryAll(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'");
      return jsonResponse({
        success: true,
        data: {
          configured: true,
          connected: true,
          database_name: 'vyapaar-db',
          table_count: tables.length,
          tables: tables.map(t => t.name)
        }
      });
    }

    // 3. SETTINGS
    if (segments[0] === 'settings') {
      if (method === 'GET') {
        const row = await queryFirst(db, "SELECT * FROM business_settings LIMIT 1");
        return jsonResponse({ success: true, data: row });
      }
      if (method === 'PUT' || method === 'POST') {
        const body = await request.json();
        const existing = await queryFirst(db, "SELECT id FROM business_settings LIMIT 1");
        const id = existing?.id || 'biz_1';
        if (existing) {
          await execute(db, `
            UPDATE business_settings 
            SET name = ?, gstin = ?, address = ?, phone = ?, email = ?, state_code = ?, logo_url = ?
            WHERE id = ?
          `, [body.name ?? '', body.gstin ?? '', body.address ?? '', body.phone ?? '', body.email ?? '', body.state_code ?? '27', body.logo_url ?? null, id]);
        } else {
          await execute(db, `
            INSERT INTO business_settings (id, name, gstin, address, phone, email, state_code, logo_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [id, body.name ?? '', body.gstin ?? '', body.address ?? '', body.phone ?? '', body.email ?? '', body.state_code ?? '27', body.logo_url ?? null]);
        }
        const updated = await queryFirst(db, "SELECT * FROM business_settings WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: updated });
      }
    }

    // 4. PARTIES
    if (segments[0] === 'parties') {
      // GET /api/parties/:id/ledger
      if (segments[1] && segments[2] === 'ledger' && method === 'GET') {
        const partyId = segments[1];
        const party = await queryFirst(db, "SELECT * FROM parties WHERE id = ?", [partyId]);
        const transactions = await queryAll(db, "SELECT * FROM transactions WHERE party_id = ? ORDER BY date DESC", [partyId]);
        const payments = await queryAll(db, "SELECT * FROM payments WHERE party_id = ? ORDER BY date DESC", [partyId]);
        return jsonResponse({ success: true, data: { party, transactions, payments } });
      }

      // GET /api/parties/:id
      if (segments[1] && method === 'GET') {
        const row = await queryFirst(db, "SELECT * FROM parties WHERE id = ?", [segments[1]]);
        if (!row) return jsonResponse({ success: false, error: 'Party not found' }, 404);
        return jsonResponse({ success: true, data: row });
      }

      // GET /api/parties
      if (method === 'GET') {
        const type = url.searchParams.get('type');
        let sql = `
          SELECT 
            p.*,
            COALESCE(
              (SELECT SUM(CASE WHEN t.type = 'sale' THEN t.balance_due ELSE -t.balance_due END) 
               FROM transactions t WHERE t.party_id = p.id AND t.status != 'cancelled'), 
              0
            ) + COALESCE(p.opening_balance, 0) as balance
          FROM parties p
        `;
        const params: any[] = [];
        if (type) {
          sql += ` WHERE p.type = ?`;
          params.push(type);
        }
        sql += ` ORDER BY p.name ASC`;
        const list = await queryAll(db, sql, params);
        return jsonResponse({ success: true, data: list });
      }

      // POST /api/parties
      if (method === 'POST') {
        const body = await request.json();
        const id = body.id || generateUuid();
        const now = new Date().toISOString();
        await execute(db, `
          INSERT INTO parties (id, name, type, phone, email, address, gstin, opening_balance, balance_type, credit_limit, state_code, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, body.name, body.type || 'customer', body.phone || '', body.email || '',
          body.address || '', body.gstin || '', Number(body.opening_balance || 0),
          body.balance_type || 'receivable', Number(body.credit_limit || 0),
          body.state_code || '23', now, now
        ]);
        const created = await queryFirst(db, "SELECT * FROM parties WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: { ...created, balance: created?.opening_balance || 0 } }, 201);
      }

      // PUT /api/parties/:id
      if (segments[1] && method === 'PUT') {
        const id = segments[1];
        const body = await request.json();
        const now = new Date().toISOString();
        await execute(db, `
          UPDATE parties SET 
            name = ?, type = ?, phone = ?, email = ?, address = ?, gstin = ?,
            opening_balance = ?, balance_type = ?, credit_limit = ?, state_code = ?, updated_at = ?
          WHERE id = ?
        `, [
          body.name, body.type || 'customer', body.phone || '', body.email || '',
          body.address || '', body.gstin || '', Number(body.opening_balance || 0),
          body.balance_type || 'receivable', Number(body.credit_limit || 0),
          body.state_code || '23', now, id
        ]);
        const updated = await queryFirst(db, "SELECT * FROM parties WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: updated });
      }

      // DELETE /api/parties/:id
      if (segments[1] && method === 'DELETE') {
        await execute(db, "DELETE FROM parties WHERE id = ?", [segments[1]]);
        return jsonResponse({ success: true, message: 'Party deleted successfully' });
      }
    }

    // 5. ITEMS & CATEGORIES
    if (segments[0] === 'items') {
      // GET /api/items/categories
      if (segments[1] === 'categories' && method === 'GET') {
        const categories = await queryAll(db, "SELECT * FROM item_categories ORDER BY name ASC");
        return jsonResponse({ success: true, data: categories });
      }

      // POST /api/items/:id/adjust-stock
      if (segments[1] && segments[2] === 'adjust-stock' && method === 'POST') {
        const id = segments[1];
        const body = await request.json();
        const qty = Number(body.quantity || 0);
        const type = body.type || 'in'; // in, out, adjustment
        const now = new Date().toISOString();
        if (type === 'adjustment') {
          await execute(db, "UPDATE items SET stock_qty = ?, updated_at = ? WHERE id = ?", [qty, now, id]);
        } else if (type === 'out') {
          await execute(db, "UPDATE items SET stock_qty = stock_qty - ?, updated_at = ? WHERE id = ?", [qty, now, id]);
        } else {
          await execute(db, "UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?", [qty, now, id]);
        }
        await execute(db, `
          INSERT INTO stock_movements (id, item_id, type, quantity, date, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [generateUuid(), id, type, Math.abs(qty), body.date || now.split('T')[0], body.notes || 'Manual adjustment', now]);

        const updated = await queryFirst(db, "SELECT * FROM items WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: updated });
      }

      // GET /api/items/:id
      if (segments[1] && method === 'GET') {
        const item = await queryFirst(db, `
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN item_categories c ON i.category_id = c.id
          WHERE i.id = ?
        `, [segments[1]]);
        if (!item) return jsonResponse({ success: false, error: 'Item not found' }, 404);
        return jsonResponse({ success: true, data: item });
      }

      // GET /api/items
      if (method === 'GET') {
        const categoryId = url.searchParams.get('category_id');
        const search = url.searchParams.get('search');
        let sql = `
          SELECT i.*, c.name as category_name
          FROM items i LEFT JOIN item_categories c ON i.category_id = c.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (categoryId) {
          sql += ` AND i.category_id = ?`;
          params.push(categoryId);
        }
        if (search) {
          sql += ` AND (i.name LIKE ? OR i.sku LIKE ?)`;
          params.push(`%${search}%`, `%${search}%`);
        }
        sql += ` ORDER BY i.name ASC`;
        const items = await queryAll(db, sql, params);
        return jsonResponse({ success: true, data: items });
      }

      // POST /api/items
      if (method === 'POST') {
        const body = await request.json();
        const id = body.id || generateUuid();
        const now = new Date().toISOString();
        await execute(db, `
          INSERT INTO items (
            id, name, sku, barcode, category_id, unit, secondary_unit,
            conversion_rate, purchase_price, sale_price, mrp, tax_rate,
            stock_qty, low_stock_alert, has_batches, description, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, body.name, body.sku || null, body.barcode || null, body.category_id || null,
          body.unit || 'Nos', body.secondary_unit || null, Number(body.conversion_rate || 1),
          Number(body.purchase_price || 0), Number(body.sale_price || 0), Number(body.mrp || 0),
          Number(body.tax_rate ?? 18), Number(body.stock_qty || 0), Number(body.low_stock_alert || 10),
          body.has_batches ? 1 : 0, body.description || null, now, now
        ]);
        const created = await queryFirst(db, "SELECT * FROM items WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: created }, 201);
      }

      // PUT /api/items/:id
      if (segments[1] && method === 'PUT') {
        const id = segments[1];
        const body = await request.json();
        const now = new Date().toISOString();
        await execute(db, `
          UPDATE items SET
            name = ?, sku = ?, barcode = ?, category_id = ?, unit = ?, secondary_unit = ?,
            conversion_rate = ?, purchase_price = ?, sale_price = ?, mrp = ?, tax_rate = ?,
            stock_qty = ?, low_stock_alert = ?, has_batches = ?, description = ?, updated_at = ?
          WHERE id = ?
        `, [
          body.name, body.sku || null, body.barcode || null, body.category_id || null,
          body.unit || 'Nos', body.secondary_unit || null, Number(body.conversion_rate || 1),
          Number(body.purchase_price || 0), Number(body.sale_price || 0), Number(body.mrp || 0),
          Number(body.tax_rate ?? 18), Number(body.stock_qty || 0), Number(body.low_stock_alert || 10),
          body.has_batches ? 1 : 0, body.description || null, now, id
        ]);
        const updated = await queryFirst(db, "SELECT * FROM items WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: updated });
      }

      // DELETE /api/items/:id
      if (segments[1] && method === 'DELETE') {
        await execute(db, "DELETE FROM items WHERE id = ?", [segments[1]]);
        return jsonResponse({ success: true, message: 'Item deleted' });
      }
    }

    // 6. TRANSACTIONS (Sale, Purchase, Invoices)
    if (segments[0] === 'transactions') {
      // GET /api/transactions/next-number/:type
      if (segments[1] === 'next-number' && segments[2]) {
        let type = segments[2];
        if (type === 'sale_invoice') type = 'sale';
        const seqRow = await queryFirst(db, "SELECT value FROM sequences WHERE key = ?", [type]);
        const nextSeq = Number(seqRow?.value ?? 0) + 1;
        const number = generateInvoiceNumber(type, nextSeq);
        return jsonResponse({ success: true, data: { next_number: number, sequence: nextSeq } });
      }

      // GET /api/transactions/:id
      if (segments[1] && method === 'GET') {
        const id = segments[1];
        const tx = await queryFirst(db, "SELECT * FROM transactions WHERE id = ?", [id]);
        if (!tx) return jsonResponse({ success: false, error: 'Transaction not found' }, 404);
        const items = await queryAll(db, "SELECT * FROM transaction_items WHERE transaction_id = ?", [id]);
        const payments = await queryAll(db, "SELECT * FROM payments WHERE transaction_id = ?", [id]);
        return jsonResponse({ success: true, data: { ...tx, items, payments } });
      }

      // GET /api/transactions
      if (method === 'GET') {
        const type = url.searchParams.get('type');
        const partyId = url.searchParams.get('party_id');
        const fromDate = url.searchParams.get('from_date');
        const toDate = url.searchParams.get('to_date');
        const status = url.searchParams.get('status');

        let sql = `SELECT * FROM transactions WHERE 1=1`;
        const params: any[] = [];
        if (type) { sql += ` AND type = ?`; params.push(type === 'sale_invoice' ? 'sale' : type); }
        if (partyId) { sql += ` AND party_id = ?`; params.push(partyId); }
        if (fromDate) { sql += ` AND date >= ?`; params.push(fromDate); }
        if (toDate) { sql += ` AND date <= ?`; params.push(toDate); }
        if (status) { sql += ` AND status = ?`; params.push(status); }

        sql += ` ORDER BY date DESC, created_at DESC LIMIT 100`;
        const txs = await queryAll(db, sql, params);
        return jsonResponse({ success: true, data: txs });
      }

      // POST /api/transactions
      if (method === 'POST') {
        const body = await request.json();
        let {
          type, date: rawDate, invoice_date, party_id, party_name,
          items: lineItems = [],
          discount_amount = 0, round_off = 0,
          paid_amount, amount_paid, payment_method = 'cash',
          notes, status = 'pending', is_gst = 1, supply_state,
        } = body;

        if (type === 'sale_invoice') type = 'sale';
        if (type === 'purchase_invoice') type = 'purchase';
        const date = rawDate || invoice_date || new Date().toISOString().split('T')[0];

        if (!type || !date) {
          return jsonResponse({ success: false, error: 'type and date are required' }, 400);
        }

        const bizRow = await queryFirst(db, "SELECT state_code FROM business_settings LIMIT 1");
        const bizStateCode = String(bizRow?.state_code ?? '23');

        let partyStateCode = supply_state || null;
        if (!partyStateCode && party_id) {
          const pRow = await queryFirst(db, "SELECT state_code FROM parties WHERE id = ?", [party_id]);
          partyStateCode = pRow?.state_code ? String(pRow.state_code) : null;
        }

        const isSameState = !partyStateCode || partyStateCode === bizStateCode;
        let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalTax = 0;
        const processedItems: any[] = [];

        for (const item of lineItems) {
          const itemPrice = Number(item.price ?? item.unit_price ?? 0);
          const gstCalc = calculateLineItemGST({
            price: itemPrice,
            quantity: Number(item.quantity ?? 1),
            discountPct: item.discount_pct != null ? Number(item.discount_pct) : (item.discount_percent != null ? Number(item.discount_percent) : 0),
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

        const discountAmt = r(Number(discount_amount || 0));
        const roundOffVal = r(Number(round_off || 0));
        const total = r(subtotal + totalTax - discountAmt + roundOffVal);
        const paidAmt = r(Number(paid_amount ?? amount_paid ?? 0));
        const balanceDue = r(total - paidAmt);
        const txStatus = paidAmt >= total ? 'paid' : (paidAmt > 0 ? 'partial' : status);

        const id = generateUuid();
        const now = new Date().toISOString();

        // Increment sequence
        await execute(db, `
          INSERT INTO sequences (key, value) VALUES (?, 1)
          ON CONFLICT(key) DO UPDATE SET value = value + 1
        `, [type]);
        const seqRow = await queryFirst(db, "SELECT value FROM sequences WHERE key = ?", [type]);
        const seq = Number(seqRow?.value ?? 1);
        const number = body.number || body.invoice_number || generateInvoiceNumber(type, seq);

        let resolvedPartyName = party_name || null;
        if (!resolvedPartyName && party_id) {
          const pRow = await queryFirst(db, "SELECT name FROM parties WHERE id = ?", [party_id]);
          resolvedPartyName = pRow?.name ? String(pRow.name) : null;
        }

        await execute(db, `
          INSERT INTO transactions (
            id, type, number, date, party_id, party_name,
            subtotal, discount_amount, cgst, sgst, igst, total_tax,
            round_off, total, paid_amount, balance_due, payment_method,
            notes, status, is_gst, supply_state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, type, number, date, party_id || null, resolvedPartyName,
          subtotal, discountAmt, totalCgst, totalSgst, totalIgst, totalTax,
          roundOffVal, total, paidAmt, balanceDue, payment_method,
          notes || null, txStatus, is_gst ? 1 : 0, partyStateCode, now, now
        ]);

        for (const item of processedItems) {
          const tiId = generateUuid();
          await execute(db, `
            INSERT INTO transaction_items (
              id, transaction_id, item_id, item_name, sku, quantity, unit,
              price, discount_pct, discount_amt, tax_rate, cgst_rate, sgst_rate, igst_rate,
              tax_amount, total, batch_number, expiry_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            tiId, id, item.item_id || null, item.item_name, item.sku || null,
            r(Number(item.quantity)), item.unit || 'Nos', r(Number(item.price)),
            r(Number(item.discount_pct || 0)), item.discount_amt,
            r(Number(item.tax_rate ?? 18)), item.cgst_rate, item.sgst_rate, item.igst_rate,
            item.tax_amount, item.total, item.batch_number || null, item.expiry_date || null
          ]);

          if (item.item_id) {
            const stockDelta = (type === 'sale' || type === 'delivery_challan')
              ? -Math.abs(Number(item.quantity))
              : (type === 'purchase' ? Math.abs(Number(item.quantity)) : 0);
            if (stockDelta !== 0) {
              await execute(db, "UPDATE items SET stock_qty = stock_qty + ?, updated_at = ? WHERE id = ?", [stockDelta, now, item.item_id]);
              await execute(db, `
                INSERT INTO stock_movements (id, item_id, transaction_id, type, quantity, date, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `, [generateUuid(), item.item_id, id, stockDelta > 0 ? 'in' : 'out', Math.abs(stockDelta), date, `Auto: ${type} ${number}`, now]);
            }
          }
        }

        if (paidAmt > 0) {
          const payType = (type === 'sale' || type === 'credit_note') ? 'payment_in' : 'payment_out';
          await execute(db, `
            INSERT INTO payments (id, transaction_id, party_id, type, amount, method, date, reference, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [generateUuid(), id, party_id || null, payType, paidAmt, payment_method, date, number, `Payment for ${type} ${number}`, now]);
        }

        const created = await queryFirst(db, "SELECT * FROM transactions WHERE id = ?", [id]);
        const createdItems = await queryAll(db, "SELECT * FROM transaction_items WHERE transaction_id = ?", [id]);
        return jsonResponse({ success: true, data: { ...created, items: createdItems } }, 201);
      }

      // DELETE /api/transactions/:id
      if (segments[1] && method === 'DELETE') {
        const id = segments[1];
        await execute(db, "UPDATE transactions SET status = 'cancelled', updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
        return jsonResponse({ success: true, message: 'Transaction cancelled' });
      }
    }

    // 7. PAYMENTS
    if (segments[0] === 'payments') {
      if (method === 'GET') {
        const type = url.searchParams.get('type');
        let sql = `
          SELECT p.*, pt.name as party_name, t.number as transaction_number
          FROM payments p
          LEFT JOIN parties pt ON p.party_id = pt.id
          LEFT JOIN transactions t ON p.transaction_id = t.id
          WHERE 1=1
        `;
        const params: any[] = [];
        if (type) {
          sql += ` AND p.type = ?`;
          params.push(type);
        }
        sql += ` ORDER BY p.date DESC, p.created_at DESC LIMIT 100`;
        const payments = await queryAll(db, sql, params);
        return jsonResponse({ success: true, data: payments });
      }

      if (method === 'POST') {
        const body = await request.json();
        const id = generateUuid();
        const now = new Date().toISOString();
        const date = body.date || body.payment_date || now.split('T')[0];
        const amount = Number(body.amount || 0);
        await execute(db, `
          INSERT INTO payments (id, transaction_id, party_id, type, amount, method, date, reference, notes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, body.transaction_id || null, body.party_id || null,
          body.type || 'payment_in', amount, body.method || body.payment_method || 'cash',
          date, body.reference || body.payment_ref || null, body.notes || null, now
        ]);

        if (body.transaction_id) {
          await execute(db, `
            UPDATE transactions 
            SET paid_amount = paid_amount + ?, balance_due = MAX(0, balance_due - ?),
                status = CASE WHEN balance_due - ? <= 0 THEN 'paid' ELSE 'partial' END,
                updated_at = ?
            WHERE id = ?
          `, [amount, amount, amount, now, body.transaction_id]);
        }
        const created = await queryFirst(db, "SELECT * FROM payments WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: created }, 201);
      }

      if (segments[1] && method === 'DELETE') {
        await execute(db, "DELETE FROM payments WHERE id = ?", [segments[1]]);
        return jsonResponse({ success: true, message: 'Payment deleted' });
      }
    }

    // 8. EXPENSES
    if (segments[0] === 'expenses') {
      if (method === 'GET') {
        const rows = await queryAll(db, "SELECT * FROM expenses ORDER BY date DESC, created_at DESC LIMIT 100");
        return jsonResponse({ success: true, data: rows });
      }
      if (method === 'POST') {
        const body = await request.json();
        const id = generateUuid();
        const now = new Date().toISOString();
        await execute(db, `
          INSERT INTO expenses (id, category, amount, date, payment_method, notes, reference, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, body.category || 'General', Number(body.amount || 0),
          body.date || now.split('T')[0], body.payment_method || 'cash',
          body.notes || null, body.reference || null, now
        ]);
        const created = await queryFirst(db, "SELECT * FROM expenses WHERE id = ?", [id]);
        return jsonResponse({ success: true, data: created }, 201);
      }
      if (segments[1] && method === 'DELETE') {
        await execute(db, "DELETE FROM expenses WHERE id = ?", [segments[1]]);
        return jsonResponse({ success: true, message: 'Expense deleted' });
      }
    }

    // 9. REPORTS
    if (segments[0] === 'reports') {
      // /api/reports/dashboard
      if (segments[1] === 'dashboard') {
        const salesRow = await queryFirst(db, `
          SELECT COALESCE(SUM(total), 0) as total_sales,
                 COALESCE(SUM(paid_amount), 0) as total_collected,
                 COALESCE(SUM(balance_due), 0) as total_receivable
          FROM transactions WHERE type = 'sale' AND status != 'cancelled'
        `);
        const purchasesRow = await queryFirst(db, `
          SELECT COALESCE(SUM(total), 0) as total_purchases,
                 COALESCE(SUM(balance_due), 0) as total_payable
          FROM transactions WHERE type = 'purchase' AND status != 'cancelled'
        `);
        const expensesRow = await queryFirst(db, `SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses`);
        const recentSales = await queryAll(db, `
          SELECT * FROM transactions WHERE type = 'sale' AND status != 'cancelled'
          ORDER BY date DESC, created_at DESC LIMIT 5
        `);
        const lowStock = await queryAll(db, `
          SELECT * FROM items WHERE stock_qty <= low_stock_alert ORDER BY stock_qty ASC LIMIT 5
        `);

        return jsonResponse({
          success: true,
          data: {
            sales: salesRow?.total_sales || 0,
            purchases: purchasesRow?.total_purchases || 0,
            receivables: salesRow?.total_receivable || 0,
            payables: purchasesRow?.total_payable || 0,
            expenses: expensesRow?.total_expenses || 0,
            cash_in_hand: (salesRow?.total_collected || 0) - (expensesRow?.total_expenses || 0),
            recent_sales: recentSales,
            low_stock_items: lowStock,
            monthly_sales: [
              { month: 'Current', sales: salesRow?.total_sales || 0 }
            ]
          }
        });
      }

      // /api/reports/pnl
      if (segments[1] === 'pnl') {
        const sales = (await queryFirst(db, "SELECT COALESCE(SUM(total), 0) as v FROM transactions WHERE type = 'sale' AND status != 'cancelled'"))?.v || 0;
        const purchases = (await queryFirst(db, "SELECT COALESCE(SUM(total), 0) as v FROM transactions WHERE type = 'purchase' AND status != 'cancelled'"))?.v || 0;
        const expenses = (await queryFirst(db, "SELECT COALESCE(SUM(amount), 0) as v FROM expenses"))?.v || 0;
        return jsonResponse({
          success: true,
          data: {
            gross_sales: sales,
            cost_of_goods_sold: purchases,
            gross_profit: sales - purchases,
            operating_expenses: expenses,
            net_profit: sales - purchases - expenses
          }
        });
      }

      // /api/reports/daybook
      if (segments[1] === 'daybook') {
        const today = new Date().toISOString().split('T')[0];
        const txs = await queryAll(db, "SELECT * FROM transactions WHERE date = ? ORDER BY created_at DESC", [today]);
        const pays = await queryAll(db, "SELECT * FROM payments WHERE date = ? ORDER BY created_at DESC", [today]);
        return jsonResponse({ success: true, data: { transactions: txs, payments: pays } });
      }

      // /api/reports/gstr1
      if (segments[1] === 'gstr1') {
        const b2c = await queryAll(db, `
          SELECT t.*, p.gstin as party_gstin
          FROM transactions t LEFT JOIN parties p ON t.party_id = p.id
          WHERE t.type = 'sale' AND t.status != 'cancelled' AND (p.gstin IS NULL OR p.gstin = '')
        `);
        const b2b = await queryAll(db, `
          SELECT t.*, p.gstin as party_gstin
          FROM transactions t LEFT JOIN parties p ON t.party_id = p.id
          WHERE t.type = 'sale' AND t.status != 'cancelled' AND (p.gstin IS NOT NULL AND p.gstin != '')
        `);
        return jsonResponse({ success: true, data: { b2b, b2c } });
      }

      // /api/reports/stock-summary
      if (segments[1] === 'stock-summary') {
        const rows = await queryAll(db, `
          SELECT i.id, i.name, i.sku, i.stock_qty, i.purchase_price, i.sale_price,
                 (i.stock_qty * i.purchase_price) as stock_value,
                 c.name as category_name
          FROM items i LEFT JOIN item_categories c ON i.category_id = c.id
          ORDER BY i.name ASC
        `);
        return jsonResponse({ success: true, data: rows });
      }
    }

    return jsonResponse({ success: false, error: `Endpoint not found: /api/${path}` }, 404);
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message || 'Internal Server Error' }, 500);
  }
}
