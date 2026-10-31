import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = path.resolve(__dirname, '../../vyapaar.db');

let db: Database;

const SCHEMA_SQL = `
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

-- Default Photo Studio Profile
INSERT OR IGNORE INTO business_settings (id, name, gstin, address, phone, email, state_code)
VALUES ('biz_1', 'Royal Photo Studio', '23AAAAA0000A1Z5', 'Shop No. 5, Near City Plaza, Main Road', '+91 98765 43210', 'info@royalphotostudio.com', '23');

-- Default Photo Studio Categories
INSERT OR IGNORE INTO item_categories (id, name) VALUES ('cat_1', 'Studio & Portrait Services');
INSERT OR IGNORE INTO item_categories (id, name) VALUES ('cat_2', 'Event & Outdoor Shoots');
INSERT OR IGNORE INTO item_categories (id, name) VALUES ('cat_3', 'Frames, Prints & Albums');

-- Default Photo Studio Services & Products
INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_1', 'Passport Size Photos (8 Pcs)', 'PASSPORT-8', 'cat_1', 'Pcs', 20, 100, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_2', 'Urgent Passport Photo (10 Min)', 'PASSPORT-URGENT', 'cat_1', 'Pcs', 30, 150, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_3', 'Studio Portrait / Profile Shoot', 'STUDIO-PORTRAIT', 'cat_1', 'Session', 100, 500, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_4', 'Pre-Wedding / Outdoor Shoot (Full Day)', 'PRE-WED-DAY', 'cat_2', 'Day', 3000, 15000, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_5', 'Wedding Photography & Videography Package', 'WED-PKG', 'cat_2', 'Event', 10000, 35000, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_6', 'Photo Framing (12x18 inch Laminated)', 'FRAME-12X18', 'cat_3', 'Pcs', 350, 850, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_7', 'Candid Birthday / Anniversary Shoot', 'EVENT-BIRTHDAY', 'cat_2', 'Event', 1200, 5000, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_8', 'Canvera HD Glossy Album (30 Pages)', 'ALBUM-30P', 'cat_3', 'Pcs', 1800, 4500, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_9', 'Maternity Shoot', 'MATERNITY', 'cat_2', 'Session', 0, 3500, 18, 999);

INSERT OR IGNORE INTO items (id, name, sku, category_id, unit, purchase_price, sale_price, tax_rate, stock_qty)
VALUES ('item_10', 'Others / Custom Service', 'OTHERS', 'cat_1', 'Pcs', 0, 0, 18, 999);
`;

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database');
  }

  db.run('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA_SQL);
  saveDb();
  console.log('[DB] Schema initialized');
}

export function saveDb(): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

export function getDb(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export { db };
