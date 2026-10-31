import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SqlValue } from 'sql.js';
import { execQuery, execRun, saveDb, r, Params } from '../db/helpers';

const router = Router();

// GET /api/items/categories - must be before /:id
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = execQuery(`SELECT * FROM item_categories ORDER BY name ASC`);
    res.json({ success: true, data: categories });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/items/categories
router.post('/categories', (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }
    const id = uuidv4();
    const now = new Date().toISOString();
    execRun(`INSERT INTO item_categories (id, name, created_at) VALUES (:id, :name, :created_at)`, {
      ':id': id, ':name': name, ':created_at': now,
    });
    saveDb();
    const created = execQuery(`SELECT * FROM item_categories WHERE id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: created[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/items
router.get('/', (req: Request, res: Response) => {
  try {
    const { category, low_stock } = req.query;
    let sql = `
      SELECT i.*, c.name as category_name
      FROM items i
      LEFT JOIN item_categories c ON c.id = i.category_id
      WHERE 1=1
    `;
    const params: Params = {};

    if (category) {
      sql += ` AND i.category_id = :category`;
      params[':category'] = category as string;
    }
    if (low_stock === 'true') {
      sql += ` AND i.stock_qty <= i.low_stock_alert`;
    }
    sql += ` ORDER BY i.name ASC`;

    const items = execQuery(sql, params);
    res.json({ success: true, data: items });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/items/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const items = execQuery(`
      SELECT i.*, c.name as category_name
      FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
      WHERE i.id = :id
    `, { ':id': id });

    if (!items.length) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    const movements = execQuery(`
      SELECT * FROM stock_movements WHERE item_id = :id ORDER BY date DESC, created_at DESC LIMIT 50
    `, { ':id': id });

    res.json({ success: true, data: { ...items[0], recent_movements: movements } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/items
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name, sku, barcode, category_id, unit = 'Nos',
      secondary_unit, conversion_rate = 1,
      purchase_price = 0, sale_price = 0, mrp = 0,
      tax_rate = 18, stock_qty = 0, low_stock_alert = 10,
      has_batches = 0, description
    } = req.body;

    if (!name) {
      res.status(400).json({ success: false, error: 'name is required' });
      return;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    execRun(`
      INSERT INTO items (
        id, name, sku, barcode, category_id, unit, secondary_unit, conversion_rate,
        purchase_price, sale_price, mrp, tax_rate, stock_qty, low_stock_alert,
        has_batches, description, created_at, updated_at
      ) VALUES (
        :id, :name, :sku, :barcode, :category_id, :unit, :secondary_unit, :conversion_rate,
        :purchase_price, :sale_price, :mrp, :tax_rate, :stock_qty, :low_stock_alert,
        :has_batches, :description, :created_at, :updated_at
      )
    `, {
      ':id': id, ':name': name,
      ':sku': sku ?? null, ':barcode': barcode ?? null,
      ':category_id': category_id ?? null, ':unit': unit,
      ':secondary_unit': secondary_unit ?? null,
      ':conversion_rate': r(Number(conversion_rate)),
      ':purchase_price': r(Number(purchase_price)),
      ':sale_price': r(Number(sale_price)),
      ':mrp': r(Number(mrp)),
      ':tax_rate': r(Number(tax_rate)),
      ':stock_qty': r(Number(stock_qty)),
      ':low_stock_alert': r(Number(low_stock_alert)),
      ':has_batches': has_batches ? 1 : 0,
      ':description': description ?? null,
      ':created_at': now, ':updated_at': now,
    });

    if (Number(stock_qty) > 0) {
      const movId = uuidv4();
      execRun(`
        INSERT INTO stock_movements (id, item_id, transaction_id, type, quantity, date, notes, created_at)
        VALUES (:id, :item_id, NULL, 'in', :quantity, :date, 'Opening stock', :created_at)
      `, {
        ':id': movId, ':item_id': id,
        ':quantity': r(Number(stock_qty)),
        ':date': now.split('T')[0], ':created_at': now,
      });
    }

    saveDb();
    const created = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    res.status(201).json({ success: true, data: created[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// PUT /api/items/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    const current = existing[0] as Record<string, SqlValue>;
    const {
      name, sku, barcode, category_id, unit,
      secondary_unit, conversion_rate,
      purchase_price, sale_price, mrp,
      tax_rate, low_stock_alert, has_batches, description
    } = req.body;

    const now = new Date().toISOString();

    execRun(`
      UPDATE items SET
        name = :name, sku = :sku, barcode = :barcode, category_id = :category_id,
        unit = :unit, secondary_unit = :secondary_unit, conversion_rate = :conversion_rate,
        purchase_price = :purchase_price, sale_price = :sale_price, mrp = :mrp,
        tax_rate = :tax_rate, low_stock_alert = :low_stock_alert,
        has_batches = :has_batches, description = :description, updated_at = :updated_at
      WHERE id = :id
    `, {
      ':id': id,
      ':name': name ?? current.name,
      ':sku': sku ?? current.sku ?? null,
      ':barcode': barcode ?? current.barcode ?? null,
      ':category_id': category_id ?? current.category_id ?? null,
      ':unit': unit ?? current.unit,
      ':secondary_unit': secondary_unit ?? current.secondary_unit ?? null,
      ':conversion_rate': conversion_rate != null ? r(Number(conversion_rate)) : Number(current.conversion_rate),
      ':purchase_price': purchase_price != null ? r(Number(purchase_price)) : Number(current.purchase_price),
      ':sale_price': sale_price != null ? r(Number(sale_price)) : Number(current.sale_price),
      ':mrp': mrp != null ? r(Number(mrp)) : Number(current.mrp),
      ':tax_rate': tax_rate != null ? r(Number(tax_rate)) : Number(current.tax_rate),
      ':low_stock_alert': low_stock_alert != null ? r(Number(low_stock_alert)) : Number(current.low_stock_alert),
      ':has_batches': has_batches != null ? (has_batches ? 1 : 0) : Number(current.has_batches),
      ':description': description ?? current.description ?? null,
      ':updated_at': now,
    });

    saveDb();
    const updated = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    res.json({ success: true, data: updated[0] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// DELETE /api/items/:id (soft delete)
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    const current = existing[0] as Record<string, SqlValue>;
    const now = new Date().toISOString();
    const existingDesc = current.description ? String(current.description) : '';
    execRun(`
      UPDATE items SET description = :description, updated_at = :updated_at, stock_qty = 0 WHERE id = :id
    `, {
      ':id': id,
      ':description': '[DELETED] ' + existingDesc,
      ':updated_at': now,
    });

    saveDb();
    res.json({ success: true, message: 'Item soft-deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/items/:id/adjust-stock
router.post('/:id/adjust-stock', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    if (!existing.length) {
      res.status(404).json({ success: false, error: 'Item not found' });
      return;
    }

    const { quantity, type = 'adjustment', notes, date } = req.body;
    if (quantity == null) {
      res.status(400).json({ success: false, error: 'quantity is required' });
      return;
    }

    const qty = r(Number(quantity));
    const currentStock = Number(existing[0].stock_qty ?? 0);
    let newStock: number;

    if (type === 'adjustment') {
      newStock = qty;
    } else if (type === 'in') {
      newStock = r(currentStock + qty);
    } else if (type === 'out') {
      newStock = r(currentStock - qty);
    } else {
      res.status(400).json({ success: false, error: 'type must be in, out, or adjustment' });
      return;
    }

    const now = new Date().toISOString();
    const adjDate: string = date ?? now.split('T')[0];

    execRun(`UPDATE items SET stock_qty = :stock_qty, updated_at = :updated_at WHERE id = :id`, {
      ':id': id, ':stock_qty': newStock, ':updated_at': now,
    });

    const movId = uuidv4();
    const movQty = type === 'adjustment' ? Math.abs(qty - currentStock) : Math.abs(qty);
    execRun(`
      INSERT INTO stock_movements (id, item_id, transaction_id, type, quantity, date, notes, created_at)
      VALUES (:id, :item_id, NULL, :type, :quantity, :date, :notes, :created_at)
    `, {
      ':id': movId, ':item_id': id,
      ':type': type as string,
      ':quantity': movQty,
      ':date': adjDate,
      ':notes': (notes ?? 'Manual stock adjustment') as string,
      ':created_at': now,
    });

    saveDb();
    const updated = execQuery(`SELECT * FROM items WHERE id = :id`, { ':id': id });
    res.json({ success: true, data: updated[0], new_stock: newStock });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
