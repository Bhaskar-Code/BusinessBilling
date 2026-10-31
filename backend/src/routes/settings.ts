import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, saveDb } from '../db/database';

const router = Router();

function execQuery(sql: string, params: Record<string, unknown> = {}): Record<string, unknown>[] {
  const db = getDb();
  const results: Record<string, unknown>[] = [];
  const stmt = db.prepare(sql);
  stmt.bind(params as any);
  while (stmt.step()) {
    results.push(stmt.getAsObject() as Record<string, unknown>);
  }
  stmt.free();
  return results;
}

function execRun(sql: string, params: Record<string, unknown> = {}): void {
  const db = getDb();
  const stmt = db.prepare(sql);
  stmt.run(params as any);
  stmt.free();
}

// GET /api/settings
router.get('/', (_req: Request, res: Response) => {
  try {
    const settings = execQuery(`SELECT * FROM business_settings LIMIT 1`);
    if (!settings.length) {
      res.json({ success: true, data: null, message: 'No business settings configured yet' });
      return;
    }
    res.json({ success: true, data: settings[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/settings
router.put('/', (req: Request, res: Response) => {
  try {
    const { name, gstin, address, phone, email, logo_url, state_code } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: 'Business name is required' });
      return;
    }

    const existing = execQuery(`SELECT * FROM business_settings LIMIT 1`);

    if (existing.length) {
      const current = existing[0] as Record<string, unknown>;
      execRun(`
        UPDATE business_settings SET
          name = :name,
          gstin = :gstin,
          address = :address,
          phone = :phone,
          email = :email,
          logo_url = :logo_url,
          state_code = :state_code
        WHERE id = :id
      `, {
        ':id': current.id,
        ':name': name,
        ':gstin': gstin ?? current.gstin ?? null,
        ':address': address ?? current.address ?? null,
        ':phone': phone ?? current.phone ?? null,
        ':email': email ?? current.email ?? null,
        ':logo_url': logo_url ?? current.logo_url ?? null,
        ':state_code': state_code ?? current.state_code ?? '27',
      });
    } else {
      const id = uuidv4();
      const now = new Date().toISOString();
      execRun(`
        INSERT INTO business_settings (id, name, gstin, address, phone, email, logo_url, state_code, created_at)
        VALUES (:id, :name, :gstin, :address, :phone, :email, :logo_url, :state_code, :created_at)
      `, {
        ':id': id,
        ':name': name,
        ':gstin': gstin ?? null,
        ':address': address ?? null,
        ':phone': phone ?? null,
        ':email': email ?? null,
        ':logo_url': logo_url ?? null,
        ':state_code': state_code ?? '27',
        ':created_at': now,
      });
    }

    saveDb();
    const updated = execQuery(`SELECT * FROM business_settings LIMIT 1`);
    res.json({ success: true, data: updated[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
