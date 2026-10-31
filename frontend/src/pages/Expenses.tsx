import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import api from '../lib/axios';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useAppStore } from '../store/appStore';

export default function Expenses() {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    category: 'Rent',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    payment_method: 'cash',
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const res = await api.get('/api/expenses');
      return res.data?.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/expenses', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      addToast('success', 'Expense recorded successfully');
      setIsModalOpen(false);
      setFormData({
        category: 'Rent',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        payment_method: 'cash',
      });
    },
    onError: (err: any) => {
      addToast('error', err.message || 'Failed to add expense');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || Number(formData.amount) <= 0) {
      addToast('error', 'Please enter a valid amount');
      return;
    }
    createMutation.mutate({
      ...formData,
      amount: Number(formData.amount),
    });
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val || 0);

  const totalExpense = expenses.reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500">Track and categorize business expenditures</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-1" /> Add Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Expenses</p>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalExpense)}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Expense Count</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">{expenses.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by category or notes..."
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
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">Loading expenses...</td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-gray-400">No expenses recorded yet.</td>
                </tr>
              ) : (
                expenses.map((exp: any) => (
                  <tr key={exp.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{exp.date}</td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{exp.category}</td>
                    <td className="py-3 px-4 text-gray-600">{exp.description || '-'}</td>
                    <td className="py-3 px-4 uppercase text-xs text-gray-500">{exp.payment_method}</td>
                    <td className="py-3 px-4 text-right font-bold text-red-600">{formatCurrency(exp.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Business Expense">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Category"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            options={[
              { value: 'Rent', label: 'Rent' },
              { value: 'Salaries', label: 'Salaries & Wages' },
              { value: 'Electricity & Utilities', label: 'Electricity & Utilities' },
              { value: 'Travel & Transport', label: 'Travel & Transport' },
              { value: 'Office Supplies', label: 'Office Supplies' },
              { value: 'Marketing & Advertising', label: 'Marketing & Advertising' },
              { value: 'Maintenance', label: 'Maintenance' },
              { value: 'Other', label: 'Other' },
            ]}
          />
          <Input
            label="Amount (₹)"
            type="number"
            required
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            placeholder="0.00"
          />
          <Input
            label="Date"
            type="date"
            required
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
          <Select
            label="Payment Mode"
            value={formData.payment_method}
            onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank', label: 'Bank Transfer' },
              { value: 'upi', label: 'UPI' },
              { value: 'cheque', label: 'Cheque' },
            ]}
          />
          <Input
            label="Description / Note"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="e.g. Paid monthly shop rent"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save Expense'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
