import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqlValue } from 'sql.js';
import { execQuery, execRun, saveDb, r, Params } from '../db/helpers';

const router = Router();

// GET /api/payments
router.get('/', (req: Request, res: Response) => {
  try {
    const { party_id, type, from_date, to_date } = req.query;
    let sql = `SELECT p.*, pa.name as party_name FROM payments p LEFT JOIN parties pa ON pa.id = p.party_id WHERE 1=1`;
    const params: Params = {};

    if (party_id) { sql += ` AND p.party_id = :party_id`; params[':party_id'] = party_id as string; }
    if (type) { sql += ` AND p.type = :type`; params[':type'] = type as string; }
    if (from_date) { sql += ` AND p.date >= :from_date`; params[':from_date'] = from_date as string; }
    if (to_date) { sql += ` AND p.date <= :to_date`; params[':to_date'] = to_date as string; }

    sql += ` ORDER BY p.date DESC, p.created_at DESC`;
    const payments = execQuery(sql, params);
    res.json({ success: true, data: payments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/payments
router.post('/', (req: Request, res: Response) => {
  try {
    const { transaction_id, party_id, type, amount, method = 'cash', date, reference, notes } = req.body;

    if (!type || amount == null || !date) {
      res.status(400).json({ success: false, error: 'type, amount, and date are required' });
      return;
    }
    if (!['payment_in', 'payment_out'].includes(type)) {
      res.status(400).json({ success: false, error: 'type must be payment_in or payment_out' });
      return;
    }

    const amt = r(Number(amount));
    if (amt <= 0) {
      res.status(400).json({ success: false, error: 'amount must be positive' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    execRun(`
      INSERT INTO payments (id, transaction_id, party_id, type, amount, method, date, reference, notes, created_at)
      VALUES (:id, :transaction_id, :party_id, :type, :amount, :method, :date, :reference, :notes, :created_at)
    `, {
      ':id': id,
      ':transaction_id': transaction_id ?? null,
      ':party_id': party_id ?? null,
      ':type': type as string,
      ':amount': amt,
      ':method': method as string,
      ':date': date as string,
      ':reference': reference ?? null,
      ':notes': notes ?? null,
      ':created_at': now,
    });

    if (transaction_id) {
      const txRows = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': transaction_id as string });
      if (txRows.length) {
        const tx = txRows[0] as Record<string, SqlValue>;
        const newPaid = r(Number(tx.paid_amount) + amt);
        const newBalance = r(Number(tx.total) - newPaid);
        const newStatus = newBalance <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
        execRun(`
          UPDATE transactions SET paid_amount = :paid, balance_due = :balance, status = :status, updated_at = :now WHERE id = :id
        `, {
          ':paid': newPaid,
          ':balance': Math.max(0, newBalance),
          ':status': newStatus,
          ':now': now,
          ':id': transaction_id as string,
        });
      }
    }

    saveDb();
    const created = execQuery(`SELECT * FROM payments WHERE id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: created[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/payments/:id (reverse payment)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payRows = execQuery(`SELECT * FROM payments WHERE id = :id`, { ':id': id });
    if (!payRows.length) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    const payment = payRows[0] as Record<string, SqlValue>;
    const now = new Date().toISOString();

    if (payment.transaction_id) {
      const txRows = execQuery(`SELECT * FROM transactions WHERE id = :id`, { ':id': payment.transaction_id as string });
      if (txRows.length) {
        const tx = txRows[0] as Record<string, SqlValue>;
        const newPaid = r(Math.max(0, Number(tx.paid_amount) - Number(payment.amount)));
        const newBalance = r(Number(tx.total) - newPaid);
        const newStatus = newBalance <= 0 ? 'paid' : (newPaid > 0 ? 'partial' : 'pending');
        execRun(`
          UPDATE transactions SET paid_amount = :paid, balance_due = :balance, status = :status, updated_at = :now WHERE id = :id
        `, {
          ':paid': newPaid, ':balance': newBalance, ':status': newStatus,
          ':now': now, ':id': payment.transaction_id as string,
        });
      }
    }

    execRun(`DELETE FROM payments WHERE id = :id`, { ':id': id });
    saveDb();
    res.json({ success: true, message: 'Payment reversed successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
