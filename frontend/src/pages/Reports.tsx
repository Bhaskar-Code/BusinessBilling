import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/axios';

export default function Reports() {
  const [tab, setTab] = useState<'pnl' | 'daybook' | 'gstr1' | 'stock'>('pnl');

  const { data: pnlData } = useQuery({
    queryKey: ['report-pnl'],
    queryFn: async () => {
      const res = await api.get('/api/reports/pnl');
      return res.data?.data || {};
    },
    enabled: tab === 'pnl',
  });

  const { data: daybookData, isLoading: daybookLoading } = useQuery({
    queryKey: ['report-daybook'],
    queryFn: async () => {
      const res = await api.get('/api/reports/daybook');
      return res.data?.data || [];
    },
    enabled: tab === 'daybook',
  });

  const { data: gstr1Data } = useQuery({
    queryKey: ['report-gstr1'],
    queryFn: async () => {
      const res = await api.get('/api/reports/gstr1');
      return res.data?.data || {};
    },
    enabled: tab === 'gstr1',
  });

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['report-stock'],
    queryFn: async () => {
      const res = await api.get('/api/reports/stock-summary');
      return res.data?.data || [];
    },
    enabled: tab === 'stock',
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val || 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financial Reports & GST</h1>
          <p className="text-sm text-gray-500">View Profit & Loss, Daybook, GSTR-1, and Stock summaries</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 space-x-8">
        {[
          { id: 'pnl', label: 'Profit & Loss' },
          { id: 'daybook', label: 'Daybook' },
          { id: 'gstr1', label: 'GSTR-1 (Sales GST)' },
          { id: 'stock', label: 'Stock Summary' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {tab === 'pnl' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Total Sales</p>
              <p className="text-2xl font-bold text-green-600 mt-2">{formatCurrency(pnlData?.total_sales)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Cost of Goods / Purchases</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(pnlData?.total_purchases)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Operating Expenses</p>
              <p className="text-2xl font-bold text-red-600 mt-2">{formatCurrency(pnlData?.total_expenses)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase">Net Profit</p>
              <p className={`text-2xl font-bold mt-2 ${(pnlData?.net_profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(pnlData?.net_profit)}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'daybook' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 font-semibold text-gray-800">
            Daily Financial Entries
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-600 uppercase border-b border-gray-200">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Ref # / ID</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Party / Description</th>
                  <th className="p-3 text-right">Inflow (Credit)</th>
                  <th className="p-3 text-right">Outflow (Debit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {daybookLoading ? (
                  <tr><td colSpan={6} className="p-6 text-center text-gray-500">Loading daybook...</td></tr>
                ) : !daybookData?.length ? (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-400">No daybook entries today.</td></tr>
                ) : (
                  daybookData.map((d: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 font-mono text-xs">{d.number || d.reference || '-'}</td>
                      <td className="p-3 uppercase text-xs font-medium text-gray-600">{d.type}</td>
                      <td className="p-3">{d.party_name || d.description || '-'}</td>
                      <td className="p-3 text-right font-medium text-green-600">
                        {d.inflow > 0 ? formatCurrency(d.inflow) : '-'}
                      </td>
                      <td className="p-3 text-right font-medium text-red-600">
                        {d.outflow > 0 ? formatCurrency(d.outflow) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'gstr1' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-900">GSTR-1 Tax Summary</h2>
              <p className="text-xs text-gray-500">Outward supplies summary for GST filing</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 font-semibold">Taxable Amount</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(gstr1Data?.taxable_amount)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 font-semibold">CGST</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(gstr1Data?.cgst)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 font-semibold">SGST</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(gstr1Data?.sgst)}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 font-semibold">IGST</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(gstr1Data?.igst)}</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'stock' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase border-b border-gray-200">
              <tr>
                <th className="p-3">Item Name</th>
                <th className="p-3">SKU</th>
                <th className="p-3 text-right">Current Stock</th>
                <th className="p-3 text-right">Purchase Rate</th>
                <th className="p-3 text-right">Stock Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stockLoading ? (
                <tr><td colSpan={5} className="p-6 text-center text-gray-500">Loading stock summary...</td></tr>
              ) : !stockData?.length ? (
                <tr><td colSpan={5} className="p-8 text-center text-gray-400">No stock data available.</td></tr>
              ) : (
                stockData.map((s: any) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-3 font-semibold text-gray-800">{s.name}</td>
                    <td className="p-3 font-mono text-xs text-gray-500">{s.sku || '-'}</td>
                    <td className="p-3 text-right font-medium">{s.stock_qty} {s.unit}</td>
                    <td className="p-3 text-right text-gray-600">{formatCurrency(s.purchase_price)}</td>
                    <td className="p-3 text-right font-bold text-gray-900">
                      {formatCurrency(s.stock_qty * s.purchase_price)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
