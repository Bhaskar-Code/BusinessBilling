import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Printer, Save, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import api from '../lib/axios';
import type { Party, Item, TransactionItem, Transaction } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { useAppStore } from '../store/appStore';

interface LineItem extends Partial<TransactionItem> {
  _key: string;
}

const TAX_RATES = [0, 5, 12, 18, 28];

const emptyLine = (): LineItem => ({
  _key: Date.now().toString() + Math.random(),
  item_id: undefined,
  item_name: '',
  quantity: 1,
  unit: 'pcs',
  price: 0,
  discount_percent: 0,
  discount_amount: 0,
  tax_rate: 18,
  cgst_amount: 0,
  sgst_amount: 0,
  igst_amount: 0,
  amount: 0,
});

const computeLine = (line: LineItem, isInterstate: boolean): LineItem => {
  const qty = line.quantity || 0;
  const price = line.price || 0;
  const discPct = line.discount_percent || 0;
  const taxRate = line.tax_rate || 0;
  const discAmt = (price * qty * discPct) / 100;
  const taxable = price * qty - discAmt;
  const taxAmt = (taxable * taxRate) / 100;
  const cgst = isInterstate ? 0 : taxAmt / 2;
  const sgst = isInterstate ? 0 : taxAmt / 2;
  const igst = isInterstate ? taxAmt : 0;
  return {
    ...line,
    discount_amount: discAmt,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    amount: taxable + taxAmt,
  };
};

export const SaleInvoice: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast, businessSettings } = useAppStore();

  const [partyId, setPartyId] = useState<number | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState('');
  const [isGst, setIsGst] = useState(true);
  const [isInterstate, setIsInterstate] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentRef, setPaymentRef] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [savedReceiptData, setSavedReceiptData] = useState<any>(null);

  const quickCustomerMutation = useMutation({
    mutationFn: (data: { name: string; phone: string }) =>
      api.post('/api/parties', { ...data, type: 'customer', opening_balance: 0 }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['parties-all'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      const party = res.data;
      if (party?.id) {
        setPartyId(party.id);
      }
      setShowQuickCustomer(false);
      setQuickCustName('');
      setQuickCustPhone('');
      addToast('success', 'Customer added & selected');
    },
    onError: (err: any) => addToast('error', err.message),
  });

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties-all'],
    queryFn: async () => {
      const res = await api.get<Party[]>('/api/parties');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await api.get<Item[]>('/api/items');
      return Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: existingTx } = useQuery<Transaction>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      const res = await api.get<Transaction>(`/api/transactions/${id}`);
      return res.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (existingTx) {
      setPartyId(existingTx.party_id);
      setInvoiceNumber(existingTx.invoice_number);
      setInvoiceDate(existingTx.invoice_date);
      setDueDate(existingTx.due_date || '');
      setIsGst(existingTx.is_gst);
      setIsInterstate(existingTx.is_interstate);
      setNotes(existingTx.notes || '');
      setAmountPaid(existingTx.amount_paid);
      setLines(
        existingTx.items.map((item) => ({
          ...item,
          _key: String(item.id || Math.random()),
        }))
      );
    }
  }, [existingTx]);

  // Auto-detect interstate
  useEffect(() => {
    const party = parties.find((p) => p.id === partyId);
    if (party && businessSettings) {
      setIsInterstate(
        !!party.state_code &&
          !!businessSettings.state_code &&
          party.state_code !== businessSettings.state_code
      );
    }
  }, [partyId, parties, businessSettings]);

  const updateLine = useCallback(
    (key: string, updates: Partial<LineItem>) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l._key !== key) return l;
          const updated = { ...l, ...updates };
          return computeLine(updated, isInterstate);
        })
      );
    },
    [isInterstate]
  );

  const setItemOnLine = (key: string, itemId: number | null) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const updated: LineItem = {
          ...l,
          item_id: item.id,
          item_name: item.name,
          price: item.sale_price,
          unit: item.unit,
          tax_rate: item.tax_rate,
        };
        return computeLine(updated, isInterstate);
      })
    );
  };

  const recomputeAll = useCallback(
    (interstate: boolean) => {
      setLines((prev) => prev.map((l) => computeLine(l, interstate)));
    },
    []
  );

  useEffect(() => {
    recomputeAll(isInterstate);
  }, [isInterstate, recomputeAll]);

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l._key !== key));

  // Totals
  const subtotal = lines.reduce((s, l) => s + (l.quantity || 0) * (l.price || 0), 0);
  const totalDiscount = lines.reduce((s, l) => s + (l.discount_amount || 0), 0);
  const taxableAmount = subtotal - totalDiscount;
  const totalCgst = isGst ? lines.reduce((s, l) => s + (l.cgst_amount || 0), 0) : 0;
  const totalSgst = isGst ? lines.reduce((s, l) => s + (l.sgst_amount || 0), 0) : 0;
  const totalIgst = isGst ? lines.reduce((s, l) => s + (l.igst_amount || 0), 0) : 0;
  const totalTax = totalCgst + totalSgst + totalIgst;
  const rawTotal = taxableAmount + totalTax;
  const roundOff = Math.round(rawTotal) - rawTotal;
  const grandTotal = rawTotal + roundOff;
  const balanceDue = grandTotal - amountPaid;

  const saveMutation = useMutation({
    mutationFn: async (draft: boolean) => {
      const validLines = lines.filter((l) => l.item_name && l.item_name.trim());
      if (validLines.length === 0) {
        throw new Error('Please select or enter at least one service/item');
      }

      const selectedCustomer = parties.find((p) => p.id === partyId);

      const payload = {
        type: 'sale',
        number: invoiceNumber,
        invoice_number: invoiceNumber,
        date: invoiceDate,
        invoice_date: invoiceDate,
        due_date: dueDate,
        party_id: partyId || null,
        party_name: selectedCustomer?.name || 'Walk-in Customer',
        is_gst: isGst ? 1 : 0,
        is_interstate: isInterstate,
        subtotal,
        discount_amount: totalDiscount,
        taxable_amount: taxableAmount,
        cgst_amount: totalCgst,
        sgst_amount: totalSgst,
        igst_amount: totalIgst,
        total_tax: totalTax,
        round_off: roundOff,
        grand_total: grandTotal,
        total: grandTotal,
        amount_paid: amountPaid,
        paid_amount: amountPaid,
        payment_method: paymentMethod,
        balance_due: balanceDue,
        status: draft ? 'draft' : amountPaid >= grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'pending',
        notes,
        items: validLines.map((l) => ({
          item_id: l.item_id,
          item_name: l.item_name,
          quantity: l.quantity,
          unit: l.unit,
          price: l.price,
          discount_pct: l.discount_percent || 0,
          discount_percent: l.discount_percent || 0,
          discount_amt: l.discount_amount || 0,
          discount_amount: l.discount_amount || 0,
          tax_rate: l.tax_rate,
          cgst_amount: l.cgst_amount,
          sgst_amount: l.sgst_amount,
          igst_amount: l.igst_amount,
          amount: l.amount,
        })),
        payments: amountPaid > 0
          ? [{ amount: amountPaid, payment_date: invoiceDate, method: paymentMethod, reference: paymentRef }]
          : [],
      };
      if (id) {
        return api.put(`/api/transactions/${id}`, payload);
      }
      return api.post('/api/transactions', payload);
    },
    onSuccess: (res: any, draft) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      addToast('success', draft ? 'Invoice saved as draft' : 'Invoice & Receipt generated successfully');
      if (draft) {
        navigate('/transactions?type=sale');
      } else {
        const selectedParty = parties.find((p) => p.id === partyId);
        setSavedReceiptData({
          invoiceNumber: invoiceNumber || res.data?.number || 'INV-0001',
          invoiceDate,
          customerName: selectedParty?.name || 'Walk-in Customer',
          customerPhone: selectedParty?.phone || '',
          lines,
          subtotal,
          totalDiscount,
          taxableAmount,
          totalCgst,
          totalSgst,
          totalIgst,
          grandTotal,
          amountPaid,
          balanceDue,
          paymentMethod,
          isGst,
        });
        setShowReceipt(true);
      }
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const partyOptions = parties
    .filter((p) => p.type === 'customer' || p.type === 'both')
    .map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.phone || p.gstin || '',
    }));

  const itemOptions = items.map((i) => ({
    value: i.id,
    label: i.name,
    sublabel: `Stock: ${i.current_stock} ${i.unit} | ₹${i.sale_price}`,
  }));

  return (
    <div className="flex flex-col gap-5 max-w-5xl mx-auto">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {id ? 'Edit Sale Invoice' : 'New Sale Invoice'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => navigate('/transactions?type=sale')}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Save size={15} />}
            onClick={() => saveMutation.mutate(true)}
            loading={saveMutation.isPending}
          >
            Save Draft
          </Button>
          <Button
            size="sm"
            leftIcon={<Printer size={15} />}
            onClick={() => saveMutation.mutate(false)}
            loading={saveMutation.isPending}
          >
            Save & Print
          </Button>
        </div>
      </div>

      {/* Invoice Details */}
      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <Input
            label="Invoice Number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Auto-generated"
            hint="Leave blank to auto-generate"
          />
          <Input
            label="Invoice Date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700">Customer (or Walk-in)</label>
              <button
                type="button"
                onClick={() => setShowQuickCustomer(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
              >
                <UserPlus size={13} /> + Quick Add Customer
              </button>
            </div>
            <SearchableSelect
              options={partyOptions}
              value={partyId}
              onChange={(v) => setPartyId(v as number | null)}
              placeholder="Search and select customer..."
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">GST Settings</label>
            <div className="flex items-center gap-4 mt-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  className={`w-10 h-5 rounded-full transition-colors ${isGst ? 'bg-blue-600' : 'bg-gray-300'}`}
                  onClick={() => setIsGst((g) => !g)}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isGst ? 'translate-x-5' : ''}`}
                  />
                </div>
                <span className="text-sm text-gray-700">GST Invoice</span>
              </label>
              {isGst && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors ${isInterstate ? 'bg-purple-600' : 'bg-gray-300'}`}
                    onClick={() => setIsInterstate((v) => !v)}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isInterstate ? 'translate-x-5' : ''}`}
                    />
                  </div>
                  <span className="text-sm text-gray-700">Interstate (IGST)</span>
                </label>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Line Items */}
      <Card padding="none">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Items</h3>
          <Button variant="ghost" size="sm" leftIcon={<Plus size={15} />} onClick={addLine}>
            Add Row
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">Item</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Qty</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 w-20">Unit</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-24">Price</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Disc%</th>
                {isGst && (
                  <th className="px-3 py-2 text-right font-medium text-gray-500 w-20">Tax%</th>
                )}
                <th className="px-3 py-2 text-right font-medium text-gray-500 w-24">Amount</th>
                <th className="px-3 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line._key} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-400 text-xs">{index + 1}</td>
                  <td className="px-3 py-2 min-w-[200px]">
                    <SearchableSelect
                      options={itemOptions}
                      value={line.item_id || null}
                      onChange={(v) => setItemOnLine(line._key, v as number | null)}
                      placeholder="Select item..."
                    />
                    {line.item_id && (
                      <input
                        value={line.item_name}
                        onChange={(e) => updateLine(line._key, { item_name: e.target.value })}
                        className="mt-1 w-full text-xs text-gray-500 border-0 focus:outline-none"
                        placeholder="Item name"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={line.quantity}
                      onChange={(e) => updateLine(line._key, { quantity: Number(e.target.value) })}
                      className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={line.unit}
                      onChange={(e) => updateLine(line._key, { unit: e.target.value })}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={line.price}
                      onChange={(e) => updateLine(line._key, { price: Number(e.target.value) })}
                      className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={line.discount_percent}
                      onChange={(e) =>
                        updateLine(line._key, { discount_percent: Number(e.target.value) })
                      }
                      className="w-full text-right border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      min="0"
                      max="100"
                    />
                  </td>
                  {isGst && (
                    <td className="px-3 py-2">
                      <select
                        value={line.tax_rate}
                        onChange={(e) =>
                          updateLine(line._key, { tax_rate: Number(e.target.value) })
                        }
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {TAX_RATES.map((r) => (
                          <option key={r} value={r}>{r}%</option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    ₹{(line.amount || 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    {lines.length > 1 && (
                      <button
                        onClick={() => removeLine(line._key)}
                        className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3">
          <Button variant="ghost" size="sm" leftIcon={<Plus size={14} />} onClick={addLine}>
            Add Item Row
          </Button>
        </div>
      </Card>

      {/* Totals + Payment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Notes */}
        <Card padding="md">
          <label className="text-sm font-medium text-gray-700 block mb-2">Notes / Terms</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Payment terms, notes, thank you message..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {/* Payment section */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment Received</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount Paid (₹)"
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(Number(e.target.value))}
                min="0"
              />
              <Select
                label="Payment Method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                options={[
                  { value: 'cash', label: 'Cash' },
                  { value: 'bank', label: 'Bank Transfer' },
                  { value: 'upi', label: 'UPI' },
                  { value: 'cheque', label: 'Cheque' },
                  { value: 'card', label: 'Card' },
                ]}
              />
              <Input
                label="Reference / UTR"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Transaction ID, cheque no..."
                wrapperClassName="col-span-2"
              />
            </div>
          </div>
        </Card>

        {/* Summary */}
        <Card padding="md">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Invoice Summary</h4>
          <div className="space-y-2.5">
            {[
              { label: 'Subtotal', value: subtotal },
              { label: 'Total Discount', value: -totalDiscount, color: totalDiscount > 0 ? 'text-green-600' : '' },
              { label: 'Taxable Amount', value: taxableAmount },
              ...(isGst
                ? isInterstate
                  ? [{ label: 'IGST', value: totalIgst }]
                  : [
                      { label: 'CGST', value: totalCgst },
                      { label: 'SGST', value: totalSgst },
                    ]
                : []),
              { label: 'Round Off', value: roundOff },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{row.label}</span>
                <span className={(row as {color?: string}).color || 'text-gray-800'}>
                  ₹{Math.abs(row.value).toFixed(2)}
                  {row.value < 0 ? ' (-)' : ''}
                </span>
              </div>
            ))}
            <div className="border-t border-gray-200 pt-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">Grand Total</span>
                <span className="text-xl font-bold text-blue-600">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Amount Paid</span>
              <span className="text-green-600 font-medium">₹{amountPaid.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-semibold text-gray-800">Balance Due</span>
              <span
                className={`font-bold text-base ${balanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}
              >
                ₹{Math.abs(balanceDue).toFixed(2)}
                {balanceDue < 0 ? ' (Advance)' : ''}
              </span>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => saveMutation.mutate(true)}
              loading={saveMutation.isPending}
            >
              Save Draft
            </Button>
            <Button
              className="flex-1"
              leftIcon={<Printer size={15} />}
              onClick={() => saveMutation.mutate(false)}
              loading={saveMutation.isPending}
            >
              Save & Print Bill
            </Button>
          </div>
        </Card>
      </div>

      {/* Quick Add Customer Modal */}
      <Modal
        isOpen={showQuickCustomer}
        onClose={() => setShowQuickCustomer(false)}
        title="Quick Add Customer"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!quickCustName.trim()) return;
            quickCustomerMutation.mutate({ name: quickCustName.trim(), phone: quickCustPhone.trim() });
          }}
          className="space-y-4"
        >
          <Input
            label="Customer Name *"
            required
            placeholder="e.g. Rahul Sharma"
            value={quickCustName}
            onChange={(e) => setQuickCustName(e.target.value)}
          />
          <Input
            label="Mobile Number"
            type="tel"
            placeholder="e.g. 9876543210"
            value={quickCustPhone}
            onChange={(e) => setQuickCustPhone(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowQuickCustomer(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={quickCustomerMutation.isPending}>
              Add & Select Customer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Studio Printable Receipt / Tax Invoice Modal */}
      {showReceipt && savedReceiptData && (
        <Modal
          isOpen={showReceipt}
          onClose={() => setShowReceipt(false)}
          title="Studio Bill & Payment Receipt"
          size="lg"
        >
          <div className="space-y-4">
            <div id="printable-receipt" className="p-6 bg-white border border-gray-200 rounded-xl space-y-4 text-gray-800 font-sans">
              {/* Studio Header */}
              <div className="text-center border-b border-gray-200 pb-3">
                <h3 className="text-2xl font-black text-gray-900 tracking-wide uppercase">
                  {businessSettings?.business_name || 'ROYAL PHOTO STUDIO'}
                </h3>
                <p className="text-xs text-gray-600 mt-1">
                  {businessSettings?.address || 'Shop No. 5, Near City Plaza, Main Road'} {businessSettings?.phone ? `• Tel: ${businessSettings.phone}` : ''}
                </p>
                {businessSettings?.gstin && (
                  <p className="text-xs font-mono font-medium text-gray-700 mt-0.5">GSTIN: {businessSettings.gstin}</p>
                )}
                <div className="inline-block mt-2 px-3 py-0.5 bg-gray-100 rounded text-xs font-bold uppercase tracking-wider text-gray-700">
                  {savedReceiptData.isGst ? 'Tax Invoice / Payment Receipt' : 'Studio Cash Receipt'}
                </div>
              </div>

              {/* Invoice & Customer Meta */}
              <div className="flex justify-between items-start text-xs border-b border-gray-200 pb-3">
                <div>
                  <p className="text-gray-500 font-semibold uppercase text-[10px]">Customer Details</p>
                  <p className="text-sm font-bold text-gray-900 mt-0.5">{savedReceiptData.customerName}</p>
                  {savedReceiptData.customerPhone && (
                    <p className="text-gray-600 font-medium">Mob: {savedReceiptData.customerPhone}</p>
                  )}
                </div>
                <div className="text-right">
                  <p><span className="text-gray-500">Receipt No:</span> <span className="font-mono font-bold text-gray-900">{savedReceiptData.invoiceNumber}</span></p>
                  <p><span className="text-gray-500">Date:</span> <span className="font-medium text-gray-800">{savedReceiptData.invoiceDate}</span></p>
                  <p><span className="text-gray-500">Mode:</span> <span className="uppercase font-semibold text-blue-600">{savedReceiptData.paymentMethod}</span></p>
                </div>
              </div>

              {/* Items Table */}
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="py-2 px-2 text-gray-600">#</th>
                    <th className="py-2 px-2 text-gray-600">Service / Description</th>
                    <th className="py-2 px-2 text-right text-gray-600">Qty</th>
                    <th className="py-2 px-2 text-right text-gray-600">Rate</th>
                    {savedReceiptData.isGst && <th className="py-2 px-2 text-right text-gray-600">GST</th>}
                    <th className="py-2 px-2 text-right text-gray-600">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {savedReceiptData.lines.map((l: any, idx: number) => (
                    <tr key={idx}>
                      <td className="py-2 px-2 text-gray-500">{idx + 1}</td>
                      <td className="py-2 px-2 font-medium text-gray-900">{l.item_name}</td>
                      <td className="py-2 px-2 text-right text-gray-700">{l.quantity}</td>
                      <td className="py-2 px-2 text-right text-gray-700">₹{Number(l.price).toFixed(2)}</td>
                      {savedReceiptData.isGst && (
                        <td className="py-2 px-2 text-right text-gray-500">{l.tax_rate}%</td>
                      )}
                      <td className="py-2 px-2 text-right font-semibold text-gray-900">₹{Number(l.amount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals & Tax Summary */}
              <div className="border-t border-gray-200 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium text-gray-900">₹{savedReceiptData.subtotal.toFixed(2)}</span>
                </div>
                {savedReceiptData.isGst && (
                  <>
                    <div className="flex justify-between text-gray-600">
                      <span>CGST (9%):</span>
                      <span>₹{savedReceiptData.totalCgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>SGST (9%):</span>
                      <span>₹{savedReceiptData.totalSgst.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-1.5 text-gray-900">
                  <span>Grand Total:</span>
                  <span className="text-blue-600 font-extrabold text-base">₹{savedReceiptData.grandTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-green-700 font-semibold">
                  <span>Amount Paid:</span>
                  <span>₹{savedReceiptData.amountPaid.toFixed(2)}</span>
                </div>
                <div className={`flex justify-between text-sm font-bold p-2.5 rounded-lg border ${
                  savedReceiptData.balanceDue > 0
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-green-50 text-green-700 border-green-200'
                }`}>
                  <span>{savedReceiptData.balanceDue > 0 ? 'Balance Due (To Collect):' : 'Payment Status:'}</span>
                  <span className="text-base">
                    {savedReceiptData.balanceDue > 0
                      ? `₹${savedReceiptData.balanceDue.toFixed(2)}`
                      : 'PAID IN FULL'}
                  </span>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center text-[11px] text-gray-500 border-t border-gray-100 pt-3">
                Thank you for visiting! Please bring this receipt when collecting photos/albums.
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowReceipt(false);
                  navigate('/transactions?type=sale');
                }}
              >
                Close & Next
              </Button>
              <Button
                leftIcon={<Printer size={16} />}
                onClick={() => {
                  window.print();
                }}
              >
                Print Receipt
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
