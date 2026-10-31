import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import api from '../lib/axios';
import { Button } from '../components/ui/Button';
import { Badge, statusVariantMap } from '../components/ui/Badge';

export default function Transactions() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const txType = searchParams.get('type') || '';
  const [search, setSearch] = React.useState('');

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions', txType],
    queryFn: async () => {
      const url = txType ? `/api/transactions?type=${txType}` : '/api/transactions';
      const res = await api.get(url);
      return res.data?.data || [];
    },
  });

  const filtered = transactions.filter((tx: any) => {
    const q = search.toLowerCase();
    return (
      (tx.number || '').toLowerCase().includes(q) ||
      (tx.party_name || '').toLowerCase().includes(q)
    );
  });

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val || 0);

  const getTitle = () => {
    switch (txType) {
      case 'sale': return 'Sales Invoices';
      case 'purchase': return 'Purchase Bills';
      case 'quotation': return 'Quotations / Estimates';
      case 'delivery_challan': return 'Delivery Challans';
      case 'credit_note': return 'Credit Notes';
      case 'debit_note': return 'Debit Notes';
      default: return 'All Transactions';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{getTitle()}</h1>
          <p className="text-sm text-gray-500">View and manage business transactions</p>
        </div>
        <div className="flex gap-2">
          {txType === 'purchase' ? (
            <Button onClick={() => navigate('/purchase')}>
              <Plus size={16} className="mr-1" /> New Purchase Bill
            </Button>
          ) : (
            <Button onClick={() => navigate('/sale')}>
              <Plus size={16} className="mr-1" /> New Sale Invoice
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-3 justify-between items-center bg-gray-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by invoice # or party..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Party</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Balance Due</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">Loading transactions...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No transactions found. Click the button above to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((tx: any) => (
                  <tr key={tx.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{tx.date}</td>
                    <td className="py-3 px-4 font-medium text-blue-600 whitespace-nowrap">{tx.number}</td>
                    <td className="py-3 px-4 font-medium text-gray-800">{tx.party_name || 'Cash Sale'}</td>
                    <td className="py-3 px-4 uppercase text-xs text-gray-500">{tx.type}</td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900">{formatCurrency(tx.total)}</td>
                    <td className="py-3 px-4 text-right font-medium text-red-600">
                      {tx.balance_due > 0 ? formatCurrency(tx.balance_due) : '₹0'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge variant={statusVariantMap[tx.status as keyof typeof statusVariantMap] || 'default'}>
                        {tx.status}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
