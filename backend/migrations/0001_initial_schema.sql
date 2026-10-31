-- Cloudflare D1 SQLite Schema Migration: 0001_initial_schema.sql

CREATE TABLE IF NOT EXISTS business_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  state_code TEXT DEFAULT '27',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('customer', 'supplier')),
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  opening_balance REAL DEFAULT 0,
  balance_type TEXT DEFAULT 'receivable' CHECK(balance_type IN ('receivable', 'payable')),
  credit_limit REAL DEFAULT 0,
  state_code TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT UNIQUE,
  barcode TEXT,
  category_id TEXT REFERENCES item_categories(id),
  unit TEXT DEFAULT 'Nos',
  secondary_unit TEXT,
  conversion_rate REAL DEFAULT 1,
  purchase_price REAL DEFAULT 0,
  sale_price REAL DEFAULT 0,
  mrp REAL DEFAULT 0,
  tax_rate REAL DEFAULT 18,
  stock_qty REAL DEFAULT 0,
  low_stock_alert REAL DEFAULT 10,
  has_batches INTEGER DEFAULT 0,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('sale', 'purchase', 'expense', 'payment_in', 'payment_out', 'credit_note', 'debit_note', 'quotation', 'proforma', 'delivery_challan')),
  number TEXT NOT NULL,
  date TEXT NOT NULL,
  party_id TEXT REFERENCES parties(id),
  party_name TEXT,
  subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  round_off REAL DEFAULT 0,
  total REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'partial', 'paid', 'cancelled')),
  is_gst INTEGER DEFAULT 1,
  supply_state TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id),
  item_name TEXT NOT NULL,
  sku TEXT,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'Nos',
  price REAL NOT NULL,
  discount_pct REAL DEFAULT 0,
  discount_amt REAL DEFAULT 0,
  tax_rate REAL DEFAULT 18,
  cgst_rate REAL DEFAULT 9,
  sgst_rate REAL DEFAULT 9,
  igst_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total REAL NOT NULL,
  batch_number TEXT,
  expiry_date TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  transaction_id TEXT REFERENCES transactions(id),
  party_id TEXT REFERENCES parties(id),
  type TEXT NOT NULL CHECK(type IN ('payment_in', 'payment_out')),
  amount REAL NOT NULL,
  method TEXT DEFAULT 'cash',
  date TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT 'cash',
  party_id TEXT REFERENCES parties(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  ifsc TEXT,
  opening_balance REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  transaction_id TEXT REFERENCES transactions(id),
  type TEXT NOT NULL CHECK(type IN ('in', 'out', 'adjustment')),
  quantity REAL NOT NULL,
  date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sequences (
  key TEXT PRIMARY KEY,
  value INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO sequences VALUES ('sale', 0);
INSERT OR IGNORE INTO sequences VALUES ('purchase', 0);
INSERT OR IGNORE INTO sequences VALUES ('expense', 0);
INSERT OR IGNORE INTO sequences VALUES ('payment_in', 0);
INSERT OR IGNORE INTO sequences VALUES ('payment_out', 0);
INSERT OR IGNORE INTO sequences VALUES ('quotation', 0);
INSERT OR IGNORE INTO sequences VALUES ('proforma', 0);
INSERT OR IGNORE INTO sequences VALUES ('delivery_challan', 0);
INSERT OR IGNORE INTO sequences VALUES ('credit_note', 0);
INSERT OR IGNORE INTO sequences VALUES ('debit_note', 0);
