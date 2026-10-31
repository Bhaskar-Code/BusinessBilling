export interface Party {
  id: number;
  name: string;
  type: 'customer' | 'supplier' | 'both';
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  gstin?: string;
  opening_balance: number;
  balance_type: 'receivable' | 'payable';
  credit_limit?: number;
  balance?: number;
  created_at: string;
  updated_at: string;
}

export interface ItemCategory {
  id: number;
  name: string;
  description?: string;
}

export interface Item {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  category_id?: number;
  category?: ItemCategory;
  unit: string;
  secondary_unit?: string;
  conversion_rate?: number;
  purchase_price: number;
  sale_price: number;
  mrp?: number;
  tax_rate: number;
  opening_stock: number;
  current_stock: number;
  low_stock_alert: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionItem {
  id?: number;
  transaction_id?: number;
  item_id: number;
  item?: Item;
  item_name: string;
  quantity: number;
  unit: string;
  price: number;
  discount_percent: number;
  discount_amount: number;
  tax_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  amount: number;
}

export interface Payment {
  id?: number;
  transaction_id?: number;
  amount: number;
  payment_date: string;
  method: 'cash' | 'bank' | 'upi' | 'cheque' | 'card';
  reference?: string;
  notes?: string;
}

export type TransactionType =
  | 'sale'
  | 'purchase'
  | 'quotation'
  | 'delivery_challan'
  | 'credit_note'
  | 'debit_note'
  | 'payment_in'
  | 'payment_out';

export type TransactionStatus = 'draft' | 'pending' | 'partial' | 'paid' | 'cancelled';

export interface Transaction {
  id: number;
  type: TransactionType;
  invoice_number: string;
  invoice_date: string;
  due_date?: string;
  party_id: number;
  party?: Party;
  is_gst: boolean;
  supply_place?: string;
  is_interstate: boolean;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  status: TransactionStatus;
  notes?: string;
  items: TransactionItem[];
  payments: Payment[];
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: number;
  category: string;
  description?: string;
  amount: number;
  expense_date: string;
  payment_method: 'cash' | 'bank' | 'upi' | 'cheque' | 'card';
  reference?: string;
  notes?: string;
  created_at: string;
}

export interface BankAccount {
  id: number;
  name: string;
  account_number?: string;
  ifsc?: string;
  bank_name?: string;
  branch?: string;
  opening_balance: number;
  current_balance: number;
  is_default: boolean;
}

export interface BusinessSettings {
  id?: number;
  business_name: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  state_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  invoice_prefix?: string;
  invoice_start_number?: number;
  terms_and_conditions?: string;
  bank_details?: string;
  financial_year_start?: string;
}

export interface DashboardData {
  today_sales: number;
  today_sales_count: number;
  total_receivable: number;
  total_payable: number;
  low_stock_count: number;
  sales_vs_purchase: Array<{ date: string; sales: number; purchases: number }>;
  expense_by_category: Array<{ category: string; amount: number }>;
  recent_transactions: Transaction[];
}

export interface StockSummaryItem {
  id: number;
  name: string;
  sku?: string;
  unit: string;
  current_stock: number;
  purchase_price: number;
  sale_price: number;
  stock_value: number;
  low_stock_alert: number;
  is_low_stock: boolean;
}

export interface GSTReport {
  period: string;
  gstr1: {
    b2b: Array<{
      party_name: string;
      gstin: string;
      invoice_number: string;
      invoice_date: string;
      taxable_value: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    }>;
    b2c: Array<{
      invoice_number: string;
      invoice_date: string;
      taxable_value: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    }>;
    total_taxable: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_tax: number;
  };
  gstr3b: {
    outward_taxable: number;
    inward_itc: number;
    net_payable: number;
    cgst_payable: number;
    sgst_payable: number;
    igst_payable: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}
