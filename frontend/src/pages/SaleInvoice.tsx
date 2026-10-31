import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Printer, Save } from 'lucide-react';
import { format } from 'date-fns';
import api from '../lib/axios';
import type { Party, Item, TransactionItem, Transaction } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { Card } from '../components/ui/Card';
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

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ['parties-all'],
    queryFn: async () => {
      const res = await api.get<Party[]>('/api/parties');
      return res.data;
    },
  });

  const { data: items = [] } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await api.get<Item[]>('/api/items');
      return res.data;
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
      const payload = {
        type: 'sale',
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        party_id: partyId,
        is_gst: isGst,
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
        amount_paid: amountPaid,
        balance_due: balanceDue,
        status: draft ? 'draft' : amountPaid >= grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'pending',
        notes,
        items: lines.map((l) => ({
          item_id: l.item_id,
          item_name: l.item_name,
          quantity: l.quantity,
          unit: l.unit,
          price: l.price,
          discount_percent: l.discount_percent,
          discount_amount: l.discount_amount,
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
    onSuccess: (_, draft) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      addToast('success', draft ? 'Invoice saved as draft' : 'Invoice saved successfully');
      if (!draft) navigate('/transactions?type=sale');
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
          <SearchableSelect
            label="Customer"
            options={partyOptions}
            value={partyId}
            onChange={(v) => setPartyId(v as number | null)}
            placeholder="Search and select customer..."
            required
          />
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
              Save & Print
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
