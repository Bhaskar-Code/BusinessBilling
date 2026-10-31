import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

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

function r(n: number) {
  return Math.round(n * 100) / 100;
}

// GET /api/reports/dashboard
router.get('/dashboard', (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's sales
    const todaySalesRows = execQuery(`
      SELECT COALESCE(SUM(total), 0) as today_sales, COUNT(*) as today_invoices
      FROM transactions
      WHERE type = 'sale' AND date = :today AND status != 'cancelled'
    `, { ':today': today });

    // Today's purchases
    const todayPurchasesRows = execQuery(`
      SELECT COALESCE(SUM(total), 0) as today_purchases
      FROM transactions
      WHERE type = 'purchase' AND date = :today AND status != 'cancelled'
    `, { ':today': today });

    // Total receivable
    const receivableRows = execQuery(`
      SELECT COALESCE(SUM(balance_due), 0) as total_receivable
      FROM transactions
      WHERE type = 'sale' AND status IN ('pending', 'partial')
    `);

    // Total payable
    const payableRows = execQuery(`
      SELECT COALESCE(SUM(balance_due), 0) as total_payable
      FROM transactions
      WHERE type = 'purchase' AND status IN ('pending', 'partial')
    `);

    // Low stock count
    const lowStockRows = execQuery(`
      SELECT COUNT(*) as low_stock_count
      FROM items
      WHERE stock_qty <= low_stock_alert
    `);

    // This month sales
    const thisMonth = today.substring(0, 7);
    const monthSalesRows = execQuery(`
      SELECT COALESCE(SUM(total), 0) as month_sales
      FROM transactions
      WHERE type = 'sale' AND strftime('%Y-%m', date) = :month AND status != 'cancelled'
    `, { ':month': thisMonth });

    // This month expenses
    const monthExpensesRows = execQuery(`
      SELECT COALESCE(SUM(amount), 0) as month_expenses
      FROM expenses
      WHERE strftime('%Y-%m', date) = :month
    `, { ':month': thisMonth });

    // Total parties
    const partiesRows = execQuery(`
      SELECT
        COUNT(*) as total_parties,
        SUM(CASE WHEN type = 'customer' THEN 1 ELSE 0 END) as total_customers,
        SUM(CASE WHEN type = 'supplier' THEN 1 ELSE 0 END) as total_suppliers
      FROM parties
    `);

    // Total items
    const itemsRows = execQuery(`SELECT COUNT(*) as total_items FROM items`);

    // Recent transactions (last 10)
    const recentTx = execQuery(`
      SELECT id, type, number as invoice_number, date as invoice_date, party_name, total as grand_total, status
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 10
    `);

    // Last 7 days sales vs purchase
    const last7Days: { date: string; sales: number; purchases: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const s = execQuery(`SELECT COALESCE(SUM(total), 0) as total FROM transactions WHERE type = 'sale' AND date = :day AND status != 'cancelled'`, { ':day': dayStr });
      const p = execQuery(`SELECT COALESCE(SUM(total), 0) as total FROM transactions WHERE type = 'purchase' AND date = :day AND status != 'cancelled'`, { ':day': dayStr });
      last7Days.push({
        date: dayStr,
        sales: r(Number(s[0]?.total ?? 0)),
        purchases: r(Number(p[0]?.total ?? 0)),
      });
    }

    // Expense by category
    const expenseByCatRows = execQuery(`
      SELECT category, COALESCE(SUM(amount), 0) as amount
      FROM expenses
      GROUP BY category
      ORDER BY amount DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      data: {
        today_sales: r((todaySalesRows[0]?.today_sales as number) ?? 0),
        today_invoices: (todaySalesRows[0]?.today_invoices as number) ?? 0,
        today_purchases: r((todayPurchasesRows[0]?.today_purchases as number) ?? 0),
        total_receivable: r((receivableRows[0]?.total_receivable as number) ?? 0),
        total_payable: r((payableRows[0]?.total_payable as number) ?? 0),
        low_stock_count: (lowStockRows[0]?.low_stock_count as number) ?? 0,
        month_sales: r((monthSalesRows[0]?.month_sales as number) ?? 0),
        month_expenses: r((monthExpensesRows[0]?.month_expenses as number) ?? 0),
        total_parties: (partiesRows[0]?.total_parties as number) ?? 0,
        total_customers: (partiesRows[0]?.total_customers as number) ?? 0,
        total_suppliers: (partiesRows[0]?.total_suppliers as number) ?? 0,
        total_items: (itemsRows[0]?.total_items as number) ?? 0,
        sales_vs_purchase: last7Days,
        expense_by_category: expenseByCatRows,
        recent_transactions: recentTx,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/profit-loss?from=&to=
router.get('/profit-loss', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const params: Record<string, unknown> = {};
    let dateFilter = `1=1`;

    if (from) { dateFilter += ` AND date >= :from`; params[':from'] = from; }
    if (to) { dateFilter += ` AND date <= :to`; params[':to'] = to; }

    const salesRows = execQuery(`
      SELECT
        COALESCE(SUM(subtotal), 0) as gross_sales,
        COALESCE(SUM(total), 0) as net_sales,
        COALESCE(SUM(discount_amount), 0) as total_discounts,
        COALESCE(SUM(total_tax), 0) as total_tax_collected
      FROM transactions
      WHERE type = 'sale' AND status != 'cancelled' AND ${dateFilter}
    `, params);

    const purchaseRows = execQuery(`
      SELECT
        COALESCE(SUM(subtotal), 0) as gross_purchases,
        COALESCE(SUM(total), 0) as net_purchases,
        COALESCE(SUM(total_tax), 0) as total_tax_paid
      FROM transactions
      WHERE type = 'purchase' AND status != 'cancelled' AND ${dateFilter}
    `, params);

    const expenseRows = execQuery(`
      SELECT
        COALESCE(SUM(amount), 0) as total_expenses,
        category,
        COALESCE(SUM(amount), 0) as category_total
      FROM expenses
      WHERE ${from ? `date >= '${from}'` : '1=1'}
        ${to ? `AND date <= '${to}'` : ''}
      GROUP BY category
    `);

    const totalExpenses = execQuery(`
      SELECT COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE ${from ? `date >= '${from}'` : '1=1'}
        ${to ? `AND date <= '${to}'` : ''}
    `);

    const grossSales = r((salesRows[0]?.gross_sales as number) ?? 0);
    const netPurchases = r((purchaseRows[0]?.net_purchases as number) ?? 0);
    const grossProfit = r(grossSales - netPurchases);
    const totalExpAmt = r((totalExpenses[0]?.total as number) ?? 0);
    const netProfit = r(grossProfit - totalExpAmt);

    res.json({
      success: true,
      data: {
        period: { from: from ?? 'All time', to: to ?? 'Today' },
        income: {
          gross_sales: grossSales,
          net_sales: r((salesRows[0]?.net_sales as number) ?? 0),
          total_discounts: r((salesRows[0]?.total_discounts as number) ?? 0),
          total_tax_collected: r((salesRows[0]?.total_tax_collected as number) ?? 0),
        },
        cost_of_goods: {
          gross_purchases: r((purchaseRows[0]?.gross_purchases as number) ?? 0),
          net_purchases: netPurchases,
          total_tax_paid: r((purchaseRows[0]?.total_tax_paid as number) ?? 0),
        },
        gross_profit: grossProfit,
        expenses: {
          total: totalExpAmt,
          by_category: expenseRows,
        },
        net_profit: netProfit,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/daybook?date=
router.get('/daybook', (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const transactions = execQuery(`
      SELECT * FROM transactions
      WHERE date = :date
      ORDER BY created_at ASC
    `, { ':date': targetDate });

    const expenses = execQuery(`
      SELECT * FROM expenses
      WHERE date = :date
      ORDER BY created_at ASC
    `, { ':date': targetDate });

    const payments = execQuery(`
      SELECT p.*, pa.name as party_name
      FROM payments p
      LEFT JOIN parties pa ON pa.id = p.party_id
      WHERE p.date = :date
      ORDER BY p.created_at ASC
    `, { ':date': targetDate });

    // Totals for the day
    const summary = execQuery(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'sale' AND status != 'cancelled' THEN total ELSE 0 END), 0) as total_sales,
        COALESCE(SUM(CASE WHEN type = 'purchase' AND status != 'cancelled' THEN total ELSE 0 END), 0) as total_purchases,
        COALESCE(SUM(CASE WHEN type = 'payment_in' THEN total ELSE 0 END), 0) as total_payment_in,
        COALESCE(SUM(CASE WHEN type = 'payment_out' THEN total ELSE 0 END), 0) as total_payment_out
      FROM transactions
      WHERE date = :date
    `, { ':date': targetDate });

    const expSummary = execQuery(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses WHERE date = :date
    `, { ':date': targetDate });

    res.json({
      success: true,
      data: {
        date: targetDate,
        transactions,
        expenses,
        payments,
        summary: {
          ...summary[0],
          total_expenses: (expSummary[0]?.total_expenses as number) ?? 0,
        }
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/stock-summary
router.get('/stock-summary', (_req: Request, res: Response) => {
  try {
    const items = execQuery(`
      SELECT
        i.id, i.name, i.sku, i.unit,
        i.stock_qty, i.purchase_price, i.sale_price, i.low_stock_alert,
        ROUND(i.stock_qty * i.purchase_price, 2) as stock_value,
        c.name as category_name,
        CASE WHEN i.stock_qty <= i.low_stock_alert THEN 1 ELSE 0 END as is_low_stock
      FROM items i
      LEFT JOIN item_categories c ON c.id = i.category_id
      ORDER BY i.name ASC
    `);

    const summary = execQuery(`
      SELECT
        COUNT(*) as total_items,
        SUM(CASE WHEN stock_qty <= low_stock_alert THEN 1 ELSE 0 END) as low_stock_items,
        SUM(CASE WHEN stock_qty = 0 THEN 1 ELSE 0 END) as out_of_stock_items,
        ROUND(SUM(stock_qty * purchase_price), 2) as total_stock_value
      FROM items
    `);

    res.json({
      success: true,
      data: {
        items,
        summary: summary[0] ?? {},
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/gst-summary?from=&to=&return_type=gstr1|gstr3b
router.get('/gst-summary', (req: Request, res: Response) => {
  try {
    const { from, to, return_type = 'gstr1' } = req.query;
    const params: Record<string, unknown> = {};
    let dateFilter = `1=1`;

    if (from) { dateFilter += ` AND t.date >= :from`; params[':from'] = from; }
    if (to) { dateFilter += ` AND t.date <= :to`; params[':to'] = to; }

    if (return_type === 'gstr1') {
      // GSTR-1: Outward supplies (sales)
      const salesRows = execQuery(`
        SELECT
          t.id, t.number, t.date, t.party_name,
          p.gstin as party_gstin, p.state_code as party_state,
          t.subtotal as taxable_value,
          t.cgst, t.sgst, t.igst, t.total_tax,
          t.total, t.supply_state,
          CASE WHEN t.igst > 0 THEN 'interstate' ELSE 'intrastate' END as supply_type
        FROM transactions t
        LEFT JOIN parties p ON p.id = t.party_id
        WHERE t.type = 'sale' AND t.is_gst = 1 AND t.status != 'cancelled' AND ${dateFilter}
        ORDER BY t.date ASC
      `, params);

      const gstr1Summary = execQuery(`
        SELECT
          CASE WHEN t.igst > 0 THEN 'interstate' ELSE 'intrastate' END as supply_type,
          ROUND(SUM(t.subtotal), 2) as taxable_value,
          ROUND(SUM(t.cgst), 2) as total_cgst,
          ROUND(SUM(t.sgst), 2) as total_sgst,
          ROUND(SUM(t.igst), 2) as total_igst,
          ROUND(SUM(t.total_tax), 2) as total_tax,
          COUNT(*) as invoice_count
        FROM transactions t
        WHERE t.type = 'sale' AND t.is_gst = 1 AND t.status != 'cancelled' AND ${dateFilter}
        GROUP BY supply_type
      `, params);

      res.json({
        success: true,
        data: {
          return_type: 'GSTR-1',
          period: { from: from ?? 'All time', to: to ?? 'Today' },
          invoices: salesRows,
          summary: gstr1Summary,
        }
      });
    } else {
      // GSTR-3B: Summary return
      const outwardRows = execQuery(`
        SELECT
          ROUND(SUM(subtotal), 2) as taxable_value,
          ROUND(SUM(cgst), 2) as cgst,
          ROUND(SUM(sgst), 2) as sgst,
          ROUND(SUM(igst), 2) as igst,
          ROUND(SUM(total_tax), 2) as total_tax
        FROM transactions
        WHERE type = 'sale' AND is_gst = 1 AND status != 'cancelled' AND ${dateFilter}
      `, params);

      const inwardRows = execQuery(`
        SELECT
          ROUND(SUM(subtotal), 2) as taxable_value,
          ROUND(SUM(cgst), 2) as cgst,
          ROUND(SUM(sgst), 2) as sgst,
          ROUND(SUM(igst), 2) as igst,
          ROUND(SUM(total_tax), 2) as total_tax
        FROM transactions
        WHERE type = 'purchase' AND is_gst = 1 AND status != 'cancelled' AND ${dateFilter}
      `, params);

      const outward = outwardRows[0] ?? {};
      const inward = inwardRows[0] ?? {};

      const gstPayable = r(
        ((outward.total_tax as number) ?? 0) - ((inward.total_tax as number) ?? 0)
      );

      res.json({
        success: true,
        data: {
          return_type: 'GSTR-3B',
          period: { from: from ?? 'All time', to: to ?? 'Today' },
          outward_supplies: outward,
          inward_supplies: inward,
          net_gst_payable: Math.max(0, gstPayable),
          itc_available: inward.total_tax ?? 0,
        }
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/sales-summary?from=&to=
router.get('/sales-summary', (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const params: Record<string, unknown> = {};
    let dateFilter = `type = 'sale' AND status != 'cancelled'`;

    if (from) { dateFilter += ` AND date >= :from`; params[':from'] = from; }
    if (to) { dateFilter += ` AND date <= :to`; params[':to'] = to; }

    const byParty = execQuery(`
      SELECT
        party_id, party_name,
        COUNT(*) as invoice_count,
        ROUND(SUM(subtotal), 2) as taxable_amount,
        ROUND(SUM(total_tax), 2) as total_tax,
        ROUND(SUM(total), 2) as total_amount,
        ROUND(SUM(paid_amount), 2) as paid_amount,
        ROUND(SUM(balance_due), 2) as balance_due
      FROM transactions
      WHERE ${dateFilter}
      GROUP BY party_id, party_name
      ORDER BY total_amount DESC
    `, params);

    const overall = execQuery(`
      SELECT
        COUNT(*) as total_invoices,
        ROUND(SUM(subtotal), 2) as gross_sales,
        ROUND(SUM(discount_amount), 2) as total_discounts,
        ROUND(SUM(total_tax), 2) as total_tax,
        ROUND(SUM(total), 2) as net_sales,
        ROUND(SUM(paid_amount), 2) as total_collected,
        ROUND(SUM(balance_due), 2) as total_pending
      FROM transactions
      WHERE ${dateFilter}
    `, params);

    res.json({
      success: true,
      data: {
        period: { from: from ?? 'All time', to: to ?? 'Today' },
        by_party: byParty,
        overall: overall[0] ?? {},
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// GET /api/reports/top-items?from=&to=
router.get('/top-items', (req: Request, res: Response) => {
  try {
    const { from, to, limit = '10' } = req.query;
    let dateFilter = `t.type = 'sale' AND t.status != 'cancelled'`;
    const params: Record<string, unknown> = {};

    if (from) { dateFilter += ` AND t.date >= :from`; params[':from'] = from; }
    if (to) { dateFilter += ` AND t.date <= :to`; params[':to'] = to; }

    params[':limit'] = Number(limit);

    const topItems = execQuery(`
      SELECT
        ti.item_id, ti.item_name, ti.sku,
        ROUND(SUM(ti.quantity), 2) as total_qty_sold,
        ROUND(SUM(ti.total), 2) as total_revenue,
        ROUND(AVG(ti.price), 2) as avg_price,
        COUNT(DISTINCT t.id) as num_transactions
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      WHERE ${dateFilter}
      GROUP BY ti.item_id, ti.item_name, ti.sku
      ORDER BY total_revenue DESC
      LIMIT :limit
    `, params);

    res.json({
      success: true,
      data: {
        period: { from: from ?? 'All time', to: to ?? 'Today' },
        top_items: topItems,
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
