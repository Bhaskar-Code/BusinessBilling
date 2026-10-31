import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqlValue } from 'sql.js';
import { execQuery, execRun, saveDb, r, Params } from '../db/helpers';

const router = Router();

// GET /api/parties
router.get('/', (req: Request, res: Response) => {
  try {
    const { type } = req.query;
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
    const params: Params = {};
    if (type) {
      sql += ` WHERE p.type = :type`;
      params[':type'] = type as string;
    }
    sql += ` ORDER BY p.name ASC`;
    const parties = execQuery(sql, params);
    res.json({ success: true, data: parties });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/parties/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parties = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    if (!parties.length) {
      res.status(404).json({ success: false, error: 'Party not found' });
      return;
    }
    const party = parties[0];

    const txSummary = execQuery(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'sale' THEN balance_due ELSE 0 END), 0) AS total_receivable,
        COALESCE(SUM(CASE WHEN type = 'purchase' THEN balance_due ELSE 0 END), 0) AS total_payable
      FROM transactions
      WHERE party_id = :id AND status != 'cancelled'
    `, { ':id': id });

    res.json({
      success: true,
      data: {
        ...party,
        total_receivable: r(Number(txSummary[0]?.total_receivable ?? 0)),
        total_payable: r(Number(txSummary[0]?.total_payable ?? 0)),
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/parties/:id/ledger
router.get('/:id/ledger', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const parties = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    if (!parties.length) {
      res.status(404).json({ success: false, error: 'Party not found' });
      return;
    }

    const transactions = execQuery(`
      SELECT id, type, number, date, total, paid_amount, balance_due, status, notes
      FROM transactions WHERE party_id = :id
      ORDER BY date DESC, created_at DESC
    `, { ':id': id });

    const payments = execQuery(`
      SELECT id, type, amount, method, date, reference, notes
      FROM payments WHERE party_id = :id
      ORDER BY date DESC, created_at DESC
    `, { ':id': id });

    const summary = execQuery(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'sale' AND status != 'cancelled' THEN total ELSE 0 END), 0) AS total_sales,
        COALESCE(SUM(CASE WHEN type = 'purchase' AND status != 'cancelled' THEN total ELSE 0 END), 0) AS total_purchases,
        COALESCE(SUM(CASE WHEN type = 'sale' AND status != 'cancelled' THEN balance_due ELSE 0 END), 0) AS total_receivable,
        COALESCE(SUM(CASE WHEN type = 'purchase' AND status != 'cancelled' THEN balance_due ELSE 0 END), 0) AS total_payable
      FROM transactions WHERE party_id = :id
    `, { ':id': id });

    res.json({
      success: true,
      data: { party: parties[0], transactions, payments, summary: summary[0] ?? {} }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/parties
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name, type, phone, email, address, gstin,
      opening_balance = 0, balance_type = 'receivable',
      credit_limit = 0, state_code
    } = req.body;

    if (!name || !type) {
      res.status(400).json({ success: false, error: 'name and type are required' });
      return;
    }
    if (!['customer', 'supplier'].includes(type)) {
      res.status(400).json({ success: false, error: 'type must be customer or supplier' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    execRun(`
      INSERT INTO parties (id, name, type, phone, email, address, gstin, opening_balance, balance_type, credit_limit, state_code, created_at, updated_at)
      VALUES (:id, :name, :type, :phone, :email, :address, :gstin, :opening_balance, :balance_type, :credit_limit, :state_code, :created_at, :updated_at)
    `, {
      ':id': id, ':name': name, ':type': type,
      ':phone': phone ?? null, ':email': email ?? null,
      ':address': address ?? null, ':gstin': gstin ?? null,
      ':opening_balance': r(Number(opening_balance)),
      ':balance_type': balance_type,
      ':credit_limit': r(Number(credit_limit)),
      ':state_code': state_code ?? null,
      ':created_at': now, ':updated_at': now,
    });

    saveDb();
    const created = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: created[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/parties/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Party not found' });
      return;
    }

    const current = existing[0] as Record<string, SqlValue>;
    const { name, type, phone, email, address, gstin, opening_balance, balance_type, credit_limit, state_code } = req.body;
    const now = new Date().toISOString();

    execRun(`
      UPDATE parties SET
        name = :name, type = :type, phone = :phone, email = :email,
        address = :address, gstin = :gstin,
        opening_balance = :opening_balance, balance_type = :balance_type,
        credit_limit = :credit_limit, state_code = :state_code, updated_at = :updated_at
      WHERE id = :id
    `, {
      ':id': id,
      ':name': name ?? current.name,
      ':type': type ?? current.type,
      ':phone': phone ?? current.phone ?? null,
      ':email': email ?? current.email ?? null,
      ':address': address ?? current.address ?? null,
      ':gstin': gstin ?? current.gstin ?? null,
      ':opening_balance': opening_balance != null ? r(Number(opening_balance)) : Number(current.opening_balance),
      ':balance_type': balance_type ?? current.balance_type,
      ':credit_limit': credit_limit != null ? r(Number(credit_limit)) : Number(current.credit_limit),
      ':state_code': state_code ?? current.state_code ?? null,
      ':updated_at': now,
    });

    saveDb();
    const updated = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    res.json({ success: true, data: updated[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/parties/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM parties WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Party not found' });
      return;
    }

    const txCheck = execQuery(`SELECT COUNT(*) as count FROM transactions WHERE party_id = :id`, { ':id': id });
    const txCount = Number(txCheck[0]?.count ?? 0);
    if (txCount > 0) {
      res.status(400).json({ success: false, error: `Cannot delete party with ${txCount} transaction(s). Remove transactions first.` });
      return;
    }

    execRun(`DELETE FROM parties WHERE id = :id`, { ':id': id });
    saveDb();
    res.json({ success: true, message: 'Party deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
