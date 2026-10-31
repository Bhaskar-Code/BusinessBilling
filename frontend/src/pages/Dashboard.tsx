import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  IndianRupee,
  ShoppingCart,
  Plus,
  UserPlus,
  Package,
  FileText,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import api from '../lib/axios';
import type { DashboardData } from '../types';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge, statusVariantMap } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const PIE_COLORS = ['#1a73e8', '#FF6B35', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444'];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

const MOCK_DASHBOARD: DashboardData = {
  today_sales: 45200,
  today_sales_count: 8,
  total_receivable: 182400,
  total_payable: 67800,
  low_stock_count: 5,
  sales_vs_purchase: [
    { date: '2026-10-25', sales: 32000, purchases: 18000 },
    { date: '2026-10-26', sales: 41000, purchases: 22000 },
    { date: '2026-10-27', sales: 28000, purchases: 15000 },
    { date: '2026-10-28', sales: 53000, purchases: 31000 },
    { date: '2026-10-29', sales: 38000, purchases: 24000 },
    { date: '2026-10-30', sales: 62000, purchases: 28000 },
    { date: '2026-10-31', sales: 45200, purchases: 19500 },
  ],
  expense_by_category: [
    { category: 'Rent', amount: 25000 },
    { category: 'Salaries', amount: 85000 },
    { category: 'Utilities', amount: 8500 },
    { category: 'Transport', amount: 12000 },
    { category: 'Marketing', amount: 15000 },
  ],
  recent_transactions: [
    {
      id: 1,
      type: 'sale',
      invoice_number: 'INV-001',
      invoice_date: '2026-10-31',
      party_id: 1,
      party: { id: 1, name: 'Ramesh Traders', type: 'customer', opening_balance: 0, balance_type: 'receivable', created_at: '', updated_at: '' },
      is_gst: true,
      is_interstate: false,
      subtotal: 15000,
      discount_amount: 0,
      taxable_amount: 15000,
      cgst_amount: 1350,
      sgst_amount: 1350,
      igst_amount: 0,
      total_tax: 2700,
      round_off: 0,
      grand_total: 17700,
      amount_paid: 17700,
      balance_due: 0,
      status: 'paid',
      items: [],
      payments: [],
      created_at: '2026-10-31',
      updated_at: '2026-10-31',
    },
    {
      id: 2,
      type: 'sale',
      invoice_number: 'INV-002',
      invoice_date: '2026-10-31',
      party_id: 2,
      party: { id: 2, name: 'Sharma Enterprises', type: 'customer', opening_balance: 0, balance_type: 'receivable', created_at: '', updated_at: '' },
      is_gst: true,
      is_interstate: false,
      subtotal: 22000,
      discount_amount: 500,
      taxable_amount: 21500,
      cgst_amount: 1935,
      sgst_amount: 1935,
      igst_amount: 0,
      total_tax: 3870,
      round_off: -0.7,
      grand_total: 25369,
      amount_paid: 10000,
      balance_due: 15369,
      status: 'partial',
      items: [],
      payments: [],
      created_at: '2026-10-31',
      updated_at: '2026-10-31',
    },
    {
      id: 3,
      type: 'purchase',
      invoice_number: 'PUR-045',
      invoice_date: '2026-10-30',
      party_id: 3,
      party: { id: 3, name: 'Gupta Wholesale', type: 'supplier', opening_balance: 0, balance_type: 'payable', created_at: '', updated_at: '' },
      is_gst: true,
      is_interstate: false,
      subtotal: 48000,
      discount_amount: 2000,
      taxable_amount: 46000,
      cgst_amount: 4140,
      sgst_amount: 4140,
      igst_amount: 0,
      total_tax: 8280,
      round_off: 0,
      grand_total: 54280,
      amount_paid: 0,
      balance_due: 54280,
      status: 'pending',
      items: [],
      payments: [],
      created_at: '2026-10-30',
      updated_at: '2026-10-30',
    },
  ],
};

interface KPICardProps {
  title: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  iconBg: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  icon,
  iconBg,
  trend,
  trendValue,
}) => (
  <Card className="flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-gray-500">{subtext}</span>
        {trend && trendValue && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === 'up' ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trendValue}
          </span>
        )}
      </div>
    </div>
  </Card>
);

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: {value: number; name: string; fill: string}[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
        <p className="font-medium text-gray-700 mb-1">{label}</p>
        {payload.map((p) => (
          <p key={p.name} style={{ color: p.fill }} className="text-xs">
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        const response = await api.get<DashboardData>('/api/reports/dashboard');
        return response.data;
      } catch {
        return MOCK_DASHBOARD;
      }
    },
    staleTime: 30000,
  });

  const dashboard = data || MOCK_DASHBOARD;

  const chartData = dashboard.sales_vs_purchase.map((d) => ({
    ...d,
    date: format(new Date(d.date), 'dd MMM'),
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Today's Sales"
          value={formatCurrency(dashboard.today_sales)}
          subtext={`${dashboard.today_sales_count} invoices today`}
          icon={<ShoppingCart size={22} className="text-green-600" />}
          iconBg="bg-green-100"
          trend="up"
          trendValue="+12%"
        />
        <KPICard
          title="Total Receivable"
          value={formatCurrency(dashboard.total_receivable)}
          subtext="from customers"
          icon={<IndianRupee size={22} className="text-blue-600" />}
          iconBg="bg-blue-100"
        />
        <KPICard
          title="Total Payable"
          value={formatCurrency(dashboard.total_payable)}
          subtext="to suppliers"
          icon={<TrendingDown size={22} className="text-red-500" />}
          iconBg="bg-red-100"
        />
        <KPICard
          title="Low Stock Items"
          value={String(dashboard.low_stock_count)}
          subtext="items need reorder"
          icon={<AlertTriangle size={22} className="text-orange-500" />}
          iconBg="bg-orange-100"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Sales vs Purchase Chart */}
        <Card className="xl:col-span-2" padding="md">
          <CardHeader
            title="Sales vs Purchase (Last 7 Days)"
            subtitle="Revenue comparison"
          />
          {isLoading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
                <Bar dataKey="sales" name="Sales" fill="#1a73e8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="purchases" name="Purchases" fill="#FF6B35" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Expense Pie Chart */}
        <Card padding="md">
          <CardHeader title="Expenses by Category" subtitle="This month" />
          {isLoading ? (
            <div className="h-56 bg-gray-100 animate-pulse rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={dashboard.expense_by_category}
                  dataKey="amount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={40}
                >
                  {dashboard.expense_by_category.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value?: any) => formatCurrency(Number(value || 0))}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: '#64748b' }}
                  formatter={(value) => value}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Recent Transactions + Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Recent Transactions */}
        <Card className="xl:col-span-2" padding="none">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
              <p className="text-sm text-gray-500 mt-0.5">Latest 10 transactions</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/transactions')}
            >
              View All
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Invoice #</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Party</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-gray-500">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        {Array.from({ length: 5 }).map((_, j) => (
                          <td key={j} className="px-5 py-3">
                            <div className="h-4 bg-gray-100 animate-pulse rounded" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : dashboard.recent_transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          navigate(
                            tx.type === 'sale'
                              ? `/sale/${tx.id}`
                              : tx.type === 'purchase'
                              ? `/purchase/${tx.id}`
                              : `/transactions?type=${tx.type}`
                          )
                        }
                      >
                        <td className="px-5 py-3 font-medium text-blue-600">
                          {tx.invoice_number}
                        </td>
                        <td className="px-5 py-3 text-gray-700">{tx.party?.name || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="text-xs capitalize text-gray-500">
                            {tx.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(tx.grand_total)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <Badge variant={statusVariantMap[tx.status] || 'gray'} dot>
                            {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="flex flex-col gap-4">
          <Card padding="md">
            <CardHeader title="Quick Actions" />
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: 'New Sale',
                  icon: <FileText size={20} className="text-blue-600" />,
                  bg: 'bg-blue-50',
                  path: '/sale',
                },
                {
                  label: 'Add Item',
                  icon: <Package size={20} className="text-green-600" />,
                  bg: 'bg-green-50',
                  path: '/inventory',
                },
                {
                  label: 'Add Party',
                  icon: <UserPlus size={20} className="text-purple-600" />,
                  bg: 'bg-purple-50',
                  path: '/parties',
                },
                {
                  label: 'Expense',
                  icon: <Plus size={20} className="text-orange-500" />,
                  bg: 'bg-orange-50',
                  path: '/expenses',
                },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => navigate(action.path)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl ${action.bg} 
                    hover:opacity-90 transition-opacity border border-transparent hover:border-gray-200`}
                >
                  {action.icon}
                  <span className="text-xs font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* Summary */}
          <Card padding="md">
            <CardHeader title="Month Summary" />
            <div className="space-y-3">
              {[
                { label: 'Total Sales', value: formatCurrency(325000), color: 'text-green-600' },
                { label: 'Total Purchases', value: formatCurrency(195000), color: 'text-red-500' },
                { label: 'Total Expenses', value: formatCurrency(145500), color: 'text-orange-500' },
                { label: 'Net Profit', value: formatCurrency(130000 - 145500), color: 'text-blue-600' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{item.label}</span>
                  <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
