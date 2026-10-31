import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Trash2, Eye, Phone, Mail, Building } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../lib/axios';
import type { Party } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useAppStore } from '../store/appStore';

const INDIAN_STATES = [
  { value: '01', label: 'Jammu & Kashmir' },
  { value: '02', label: 'Himachal Pradesh' },
  { value: '03', label: 'Punjab' },
  { value: '04', label: 'Chandigarh' },
  { value: '05', label: 'Uttarakhand' },
  { value: '06', label: 'Haryana' },
  { value: '07', label: 'Delhi' },
  { value: '08', label: 'Rajasthan' },
  { value: '09', label: 'Uttar Pradesh' },
  { value: '10', label: 'Bihar' },
  { value: '11', label: 'Sikkim' },
  { value: '12', label: 'Arunachal Pradesh' },
  { value: '13', label: 'Nagaland' },
  { value: '14', label: 'Manipur' },
  { value: '15', label: 'Mizoram' },
  { value: '16', label: 'Tripura' },
  { value: '17', label: 'Meghalaya' },
  { value: '18', label: 'Assam' },
  { value: '19', label: 'West Bengal' },
  { value: '20', label: 'Jharkhand' },
  { value: '21', label: 'Odisha' },
  { value: '22', label: 'Chhattisgarh' },
  { value: '23', label: 'Madhya Pradesh' },
  { value: '24', label: 'Gujarat' },
  { value: '27', label: 'Maharashtra' },
  { value: '29', label: 'Karnataka' },
  { value: '32', label: 'Kerala' },
  { value: '33', label: 'Tamil Nadu' },
  { value: '36', label: 'Telangana' },
  { value: '37', label: 'Andhra Pradesh' },
];

const EMPTY_PARTY: Partial<Party> = {
  name: '',
  type: 'customer',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  state_code: '',
  gstin: '',
  opening_balance: 0,
  balance_type: 'receivable',
  credit_limit: 0,
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));

export const Parties: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [tab, setTab] = useState<'customer' | 'supplier'>('customer');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [editParty, setEditParty] = useState<Partial<Party>>(EMPTY_PARTY);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Party | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: parties = [], isLoading } = useQuery<Party[]>({
    queryKey: ['parties', tab],
    queryFn: async () => {
      const res = await api.get<Party[]>(`/api/parties?type=${tab}`);
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (party: Partial<Party>) => {
      if (party.id) {
        return api.put(`/api/parties/${party.id}`, party);
      }
      return api.post('/api/parties', party);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      setIsModalOpen(false);
      setEditParty(EMPTY_PARTY);
      addToast('success', `Party ${editParty.id ? 'updated' : 'created'} successfully`);
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/parties/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      setDeleteConfirm(null);
      addToast('success', 'Party deleted successfully');
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ['party-ledger', selectedParty?.id],
    queryFn: async () => {
      const res = await api.get(`/api/parties/${selectedParty?.id}/ledger`);
      return res.data;
    },
    enabled: !!selectedParty,
  });

  const filtered = parties.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search) ||
      p.gstin?.toLowerCase().includes(search.toLowerCase())
  );

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!editParty.name?.trim()) errors.name = 'Name is required';
    if (editParty.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(editParty.gstin)) {
      errors.gstin = 'Invalid GSTIN format';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;
    saveMutation.mutate(editParty);
  };

  const handleEdit = (party: Party) => {
    setEditParty({ ...party });
    setFormErrors({});
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditParty({ ...EMPTY_PARTY, type: tab });
    setFormErrors({});
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Parties</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your customers and suppliers</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={handleAdd}>
          Add Party
        </Button>
      </div>

      {/* Tab + Search */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5">
          <div className="flex">
            {(['customer', 'supplier'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-5 py-4 text-sm font-medium border-b-2 transition-colors capitalize',
                  tab === t
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {t === 'customer' ? 'Customers' : 'Suppliers'}
              </button>
            ))}
          </div>
          <div className="relative w-60">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium text-gray-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Phone</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">GSTIN</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">City</th>
                <th className="px-5 py-3 text-right font-medium text-gray-500">Balance</th>
                <th className="px-5 py-3 text-center font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {[1, 2, 3, 4, 5, 6].map((j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 bg-gray-100 animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-gray-400">
                        No {tab}s found
                      </td>
                    </tr>
                  )
                : filtered.map((party) => (
                    <tr key={party.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                            <span className="text-blue-600 font-semibold text-xs">
                              {party.name[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{party.name}</p>
                            {party.email && (
                              <p className="text-xs text-gray-400">{party.email}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {party.phone ? (
                          <a href={`tel:${party.phone}`} className="flex items-center gap-1 hover:text-blue-600">
                            <Phone size={13} /> {party.phone}
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-600 font-mono text-xs">
                        {party.gstin || '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{party.city || '—'}</td>
                      <td className="px-5 py-3 text-right">
                        {party.balance !== undefined && party.balance !== 0 ? (
                          <div>
                            <p
                              className={clsx(
                                'font-semibold',
                                party.balance_type === 'receivable'
                                  ? 'text-green-600'
                                  : 'text-red-500'
                              )}
                            >
                              {formatCurrency(party.balance || 0)}
                            </p>
                            <p className="text-xs text-gray-400 capitalize">{party.balance_type}</p>
                          </div>
                        ) : (
                          <Badge variant="gray">Settled</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setSelectedParty(party);
                              setIsLedgerOpen(true);
                            }}
                            className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                            title="View Ledger"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => handleEdit(party)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(party)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editParty.id ? 'Edit Party' : 'Add New Party'}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saveMutation.isPending}>
              {editParty.id ? 'Update Party' : 'Create Party'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Party Name"
            required
            value={editParty.name || ''}
            onChange={(e) => setEditParty((p) => ({ ...p, name: e.target.value }))}
            error={formErrors.name}
            placeholder="Enter full name or business name"
          />
          <Select
            label="Type"
            value={editParty.type || 'customer'}
            onChange={(e) => setEditParty((p) => ({ ...p, type: e.target.value as Party['type'] }))}
            options={[
              { value: 'customer', label: 'Customer' },
              { value: 'supplier', label: 'Supplier' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <Input
            label="Phone"
            value={editParty.phone || ''}
            onChange={(e) => setEditParty((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+91 99999 99999"
            leftAddon={<Phone size={14} />}
          />
          <Input
            label="Email"
            type="email"
            value={editParty.email || ''}
            onChange={(e) => setEditParty((p) => ({ ...p, email: e.target.value }))}
            placeholder="email@example.com"
            leftAddon={<Mail size={14} />}
          />
          <Input
            label="GSTIN"
            value={editParty.gstin || ''}
            onChange={(e) =>
              setEditParty((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))
            }
            error={formErrors.gstin}
            placeholder="22AAAAA0000A1Z5"
            hint="15-digit GST Identification Number"
          />
          <Select
            label="State"
            value={editParty.state_code || ''}
            onChange={(e) => {
              const state = INDIAN_STATES.find((s) => s.value === e.target.value);
              setEditParty((p) => ({
                ...p,
                state_code: e.target.value,
                state: state?.label || '',
              }));
            }}
            options={INDIAN_STATES}
            placeholder="Select State"
          />
          <Input
            label="City"
            value={editParty.city || ''}
            onChange={(e) => setEditParty((p) => ({ ...p, city: e.target.value }))}
            leftAddon={<Building size={14} />}
          />
          <Input
            label="Credit Limit (₹)"
            type="number"
            value={editParty.credit_limit || 0}
            onChange={(e) =>
              setEditParty((p) => ({ ...p, credit_limit: Number(e.target.value) }))
            }
            hint="Set 0 for no limit"
          />
          <Input
            label="Opening Balance (₹)"
            type="number"
            value={editParty.opening_balance || 0}
            onChange={(e) =>
              setEditParty((p) => ({ ...p, opening_balance: Number(e.target.value) }))
            }
          />
          <Select
            label="Balance Type"
            value={editParty.balance_type || 'receivable'}
            onChange={(e) =>
              setEditParty((p) => ({
                ...p,
                balance_type: e.target.value as Party['balance_type'],
              }))
            }
            options={[
              { value: 'receivable', label: 'Receivable (Customer owes you)' },
              { value: 'payable', label: 'Payable (You owe them)' },
            ]}
          />
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 block mb-1">Address</label>
            <textarea
              value={editParty.address || ''}
              onChange={(e) => setEditParty((p) => ({ ...p, address: e.target.value }))}
              rows={2}
              placeholder="Full address..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal
        isOpen={isLedgerOpen}
        onClose={() => {
          setIsLedgerOpen(false);
          setSelectedParty(null);
        }}
        title={`Ledger — ${selectedParty?.name}`}
        size="2xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Particulars</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Debit</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Credit</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ledger.map((entry: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-4 py-3">{entry.date}</td>
                    <td className="px-4 py-3">{entry.particulars}</td>
                    <td className="px-4 py-3 text-right text-red-500">
                      {entry.debit ? formatCurrency(entry.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {entry.credit ? formatCurrency(entry.credit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatCurrency(entry.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Party"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be
          undone.
        </p>
      </Modal>
    </div>
  );
};
