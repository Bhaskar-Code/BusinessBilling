import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import api from '../lib/axios';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { useAppStore } from '../store/appStore';

export default function Payments() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const paymentType = searchParams.get('type') || 'payment_in';
  const { addToast } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: paymentType,
    party_id: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'cash',
    reference: '',
    notes: '',
  });

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', paymentType],
    queryFn: async () => {
      const res = await api.get(`/api/payments?type=${paymentType}`);
      return res.data?.data || [];
    },
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: async () => {
      const res = await api.get('/api/parties');
      return res.data?.data || [];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/api/payments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      addToast('success', 'Payment recorded successfully');
      setIsModalOpen(false);
      setFormData({
        type: paymentType,
        party_id: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        method: 'cash',
        reference: '',
        notes: '',
      });
    },
    onError: (err: any) => {
      addToast('error', err.message || 'Failed to record payment');
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

  const isIn = paymentType === 'payment_in';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isIn ? 'Payment In (Receipts)' : 'Payment Out (Disbursements)'}
          </h1>
          <p className="text-sm text-gray-500">
            {isIn ? 'Record payments received from customers' : 'Record payments made to suppliers'}
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus size={16} className="mr-1" /> {isIn ? 'Record Receipt' : 'Record Payment'}
        </Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Party</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Reference #</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">Loading payments...</td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">No payment records found.</td>
                </tr>
              ) : (
                payments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{p.date}</td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{p.party_name || '-'}</td>
                    <td className="py-3 px-4 uppercase text-xs text-gray-500">{p.method}</td>
                    <td className="py-3 px-4 text-gray-600 font-mono text-xs">{p.reference || '-'}</td>
                    <td className="py-3 px-4 text-gray-500">{p.notes || '-'}</td>
                    <td className={`py-3 px-4 text-right font-bold ${isIn ? 'text-green-600' : 'text-red-600'}`}>
                      {isIn ? '+' : '-'}{formatCurrency(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={isIn ? 'Record Payment In' : 'Record Payment Out'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Party"
            value={formData.party_id}
            onChange={(e) => setFormData({ ...formData, party_id: e.target.value })}
            options={[
              { value: '', label: '-- Select Party --' },
              ...parties.map((pt: any) => ({ value: pt.id, label: `${pt.name} (${pt.type})` })),
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
            value={formData.method}
            onChange={(e) => setFormData({ ...formData, method: e.target.value })}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank', label: 'Bank Transfer' },
              { value: 'upi', label: 'UPI' },
              { value: 'cheque', label: 'Cheque' },
            ]}
          />
          <Input
            label="Reference # / Transaction ID"
            value={formData.reference}
            onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
            placeholder="e.g. UPI Ref / Cheque No."
          />
          <Input
            label="Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Optional remarks"
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Saving...' : 'Save Payment'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
