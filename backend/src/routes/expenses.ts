import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqlValue } from 'sql.js';
import { execQuery, execRun, saveDb, r, Params } from '../db/helpers';

const router = Router();

// GET /api/expenses
router.get('/', (req: Request, res: Response) => {
  try {
    const { from_date, to_date, category, party_id } = req.query;
    let sql = `
      SELECT e.*, p.name as party_name
      FROM expenses e LEFT JOIN parties p ON p.id = e.party_id WHERE 1=1
    `;
    const params: Params = {};

    if (from_date) { sql += ` AND e.date >= :from_date`; params[':from_date'] = from_date as string; }
    if (to_date) { sql += ` AND e.date <= :to_date`; params[':to_date'] = to_date as string; }
    if (category) { sql += ` AND e.category = :category`; params[':category'] = category as string; }
    if (party_id) { sql += ` AND e.party_id = :party_id`; params[':party_id'] = party_id as string; }

    sql += ` ORDER BY e.date DESC, e.created_at DESC`;
    const expenses = execQuery(sql, params);

    const summaryParams: Params = {};
    let summaryWhere = `1=1`;
    if (from_date) { summaryWhere += ` AND date >= :from_date`; summaryParams[':from_date'] = from_date as string; }
    if (to_date) { summaryWhere += ` AND date <= :to_date`; summaryParams[':to_date'] = to_date as string; }

    const summaryRows = execQuery(`
      SELECT category, ROUND(SUM(amount), 2) as total
      FROM expenses WHERE ${summaryWhere}
      GROUP BY category ORDER BY total DESC
    `, summaryParams);

    res.json({ success: true, data: expenses, summary: summaryRows });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/expenses
router.post('/', (req: Request, res: Response) => {
  try {
    const { category, amount, date, description, payment_method = 'cash', party_id } = req.body;

    if (!category || amount == null || !date) {
      res.status(400).json({ success: false, error: 'category, amount, and date are required' });
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
      INSERT INTO expenses (id, category, amount, date, description, payment_method, party_id, created_at)
      VALUES (:id, :category, :amount, :date, :description, :payment_method, :party_id, :created_at)
    `, {
      ':id': id, ':category': category as string,
      ':amount': amt, ':date': date as string,
      ':description': description ?? null,
      ':payment_method': payment_method as string,
      ':party_id': party_id ?? null,
      ':created_at': now,
    });

    saveDb();
    const created = execQuery(`SELECT * FROM expenses WHERE id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: created[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM expenses WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Expense not found' });
      return;
    }

    const current = existing[0] as Record<string, SqlValue>;
    const { category, amount, date, description, payment_method, party_id } = req.body;

    execRun(`
      UPDATE expenses SET
        category = :category, amount = :amount, date = :date,
        description = :description, payment_method = :payment_method, party_id = :party_id
      WHERE id = :id
    `, {
      ':id': id,
      ':category': category ?? current.category,
      ':amount': amount != null ? r(Number(amount)) : Number(current.amount),
      ':date': date ?? current.date,
      ':description': description ?? current.description ?? null,
      ':payment_method': payment_method ?? current.payment_method,
      ':party_id': party_id ?? current.party_id ?? null,
    });

    saveDb();
    const updated = execQuery(`SELECT * FROM expenses WHERE id = :id`, { ':id': id });
    res.json({ success: true, data: updated[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM expenses WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Expense not found' });
      return;
    }

    execRun(`DELETE FROM expenses WHERE id = :id`, { ':id': id });
    saveDb();
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
