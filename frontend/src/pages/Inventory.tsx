import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  AlertTriangle,
  Package,
  Filter,
  ArrowUpDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../lib/axios';
import type { Item, ItemCategory } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { useAppStore } from '../store/appStore';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);

const EMPTY_ITEM: Partial<Item> = {
  name: '',
  sku: '',
  barcode: '',
  unit: 'pcs',
  purchase_price: 0,
  sale_price: 0,
  mrp: 0,
  tax_rate: 18,
  opening_stock: 0,
  current_stock: 0,
  low_stock_alert: 5,
  description: '',
  is_active: true,
};

const UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'box', 'bag', 'roll', 'set', 'pair', 'm', 'cm', 'ft', 'dozen'];
const TAX_RATES = [0, 0.25, 1, 3, 5, 12, 18, 28];

export const Inventory: React.FC = () => {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Partial<Item>>(EMPTY_ITEM);
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustReason, setAdjustReason] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Item | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: items = [], isLoading } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const res = await api.get<Item[]>('/api/items');
      return res.data;
    },
  });

  const { data: categories = [] } = useQuery<ItemCategory[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<ItemCategory[]>('/api/categories');
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (item: Partial<Item>) => {
      if (item.id) return api.put(`/api/items/${item.id}`, item);
      return api.post('/api/items', item);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setIsItemModalOpen(false);
      setEditItem(EMPTY_ITEM);
      addToast('success', `Item ${editItem.id ? 'updated' : 'created'} successfully`);
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setDeleteConfirm(null);
      addToast('success', 'Item deleted successfully');
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustItem) return;
      return api.post(`/api/items/${adjustItem.id}/adjust-stock`, {
        quantity: adjustType === 'add' ? adjustQty : -adjustQty,
        reason: adjustReason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setIsAdjustModalOpen(false);
      setAdjustItem(null);
      addToast('success', 'Stock adjusted successfully');
    },
    onError: (err: Error) => addToast('error', err.message),
  });

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!editItem.name?.trim()) errors.name = 'Name is required';
    if ((editItem.sale_price || 0) <= 0) errors.sale_price = 'Sale price must be positive';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const filtered = items.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku?.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode?.includes(search);
    const matchCategory = !categoryFilter || String(item.category_id) === categoryFilter;
    const matchLow = !lowStockOnly || item.current_stock <= item.low_stock_alert;
    return matchSearch && matchCategory && matchLow;
  });

  const totalItems = items.length;
  const lowStockItems = items.filter((i) => i.current_stock > 0 && i.current_stock <= i.low_stock_alert).length;
  const outOfStock = items.filter((i) => i.current_stock <= 0).length;
  const totalValue = items.reduce((sum, i) => sum + i.current_stock * i.purchase_price, 0);

  const handleEdit = (item: Item) => {
    setEditItem({ ...item });
    setFormErrors({});
    setIsItemModalOpen(true);
  };

  const handleAdd = () => {
    setEditItem({ ...EMPTY_ITEM });
    setFormErrors({});
    setIsItemModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Inventory</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage products and stock levels</p>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={handleAdd}>
          Add Item
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total Items', value: totalItems, icon: <Package size={20} className="text-blue-600" />, bg: 'bg-blue-50' },
          { label: 'Low Stock', value: lowStockItems, icon: <AlertTriangle size={20} className="text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Out of Stock', value: outOfStock, icon: <AlertTriangle size={20} className="text-red-500" />, bg: 'bg-red-50' },
          { label: 'Total Value', value: formatCurrency(totalValue), icon: <ArrowUpDown size={20} className="text-green-600" />, bg: 'bg-green-50' },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center shrink-0`}>
              {stat.icon}
            </div>
            <div>
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-gray-100">
          <div className="relative flex-1 min-w-48">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, SKU, barcode..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => setLowStockOnly((v) => !v)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors',
              lowStockOnly
                ? 'border-amber-400 bg-amber-50 text-amber-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            )}
          >
            <Filter size={14} />
            Low Stock Only
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium text-gray-500">Item</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">SKU</th>
                <th className="px-5 py-3 text-left font-medium text-gray-500">Category</th>
                <th className="px-5 py-3 text-center font-medium text-gray-500">Unit</th>
                <th className="px-5 py-3 text-right font-medium text-gray-500">Stock</th>
                <th className="px-5 py-3 text-right font-medium text-gray-500">Purchase Price</th>
                <th className="px-5 py-3 text-right font-medium text-gray-500">Sale Price</th>
                <th className="px-5 py-3 text-center font-medium text-gray-500">Tax</th>
                <th className="px-5 py-3 text-center font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-4 bg-gray-100 animate-pulse rounded" />
                        </td>
                      ))}
                    </tr>
                  ))
                : filtered.length === 0
                ? (
                    <tr>
                      <td colSpan={9} className="px-5 py-12 text-center text-gray-400">
                        No items found
                      </td>
                    </tr>
                  )
                : filtered.map((item) => {
                    const isLow = item.current_stock > 0 && item.current_stock <= item.low_stock_alert;
                    const isOut = item.current_stock <= 0;
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-gray-400 truncate max-w-xs">{item.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">{item.sku || '—'}</td>
                        <td className="px-5 py-3 text-gray-600">{item.category?.name || '—'}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{item.unit}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className={clsx(
                                'font-semibold',
                                isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'
                              )}
                            >
                              {item.current_stock}
                            </span>
                            {isOut && <Badge variant="error">Out</Badge>}
                            {isLow && !isOut && <Badge variant="warning">Low</Badge>}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-700">{formatCurrency(item.purchase_price)}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{formatCurrency(item.sale_price)}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{item.tax_rate}%</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setAdjustItem(item);
                                setAdjustQty(0);
                                setAdjustReason('');
                                setIsAdjustModalOpen(true);
                              }}
                              className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors text-xs"
                              title="Adjust Stock"
                            >
                              <ArrowUpDown size={15} />
                            </button>
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(item)}
                              className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Item Modal */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editItem.id ? 'Edit Item' : 'Add New Item'}
        size="2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsItemModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (validate()) saveMutation.mutate(editItem);
              }}
              loading={saveMutation.isPending}
            >
              {editItem.id ? 'Update Item' : 'Add Item'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Item Name"
            required
            value={editItem.name || ''}
            onChange={(e) => setEditItem((p) => ({ ...p, name: e.target.value }))}
            error={formErrors.name}
            placeholder="Product name"
            wrapperClassName="sm:col-span-2"
          />
          <Input
            label="SKU / Item Code"
            value={editItem.sku || ''}
            onChange={(e) => setEditItem((p) => ({ ...p, sku: e.target.value }))}
            placeholder="Auto-generate if empty"
          />
          <Input
            label="Barcode"
            value={editItem.barcode || ''}
            onChange={(e) => setEditItem((p) => ({ ...p, barcode: e.target.value }))}
            placeholder="Scan or enter barcode"
          />
          <Select
            label="Category"
            value={editItem.category_id || ''}
            onChange={(e) => setEditItem((p) => ({ ...p, category_id: Number(e.target.value) }))}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select category"
          />
          <Select
            label="Unit"
            value={editItem.unit || 'pcs'}
            onChange={(e) => setEditItem((p) => ({ ...p, unit: e.target.value }))}
            options={UNITS.map((u) => ({ value: u, label: u.toUpperCase() }))}
          />
          <Input
            label="Secondary Unit"
            value={editItem.secondary_unit || ''}
            onChange={(e) => setEditItem((p) => ({ ...p, secondary_unit: e.target.value }))}
            placeholder="e.g. box"
            hint="Optional secondary unit"
          />
          <Input
            label="Conversion Rate"
            type="number"
            value={editItem.conversion_rate || ''}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, conversion_rate: Number(e.target.value) }))
            }
            placeholder="e.g. 12 (1 box = 12 pcs)"
            hint="How many primary units = 1 secondary unit"
          />
          <Input
            label="Purchase Price (₹)"
            type="number"
            required
            value={editItem.purchase_price || 0}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, purchase_price: Number(e.target.value) }))
            }
          />
          <Input
            label="Sale Price (₹)"
            type="number"
            required
            value={editItem.sale_price || 0}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, sale_price: Number(e.target.value) }))
            }
            error={formErrors.sale_price}
          />
          <Input
            label="MRP (₹)"
            type="number"
            value={editItem.mrp || 0}
            onChange={(e) => setEditItem((p) => ({ ...p, mrp: Number(e.target.value) }))}
          />
          <Select
            label="Tax Rate (GST %)"
            value={editItem.tax_rate ?? 18}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, tax_rate: Number(e.target.value) }))
            }
            options={TAX_RATES.map((r) => ({
              value: r,
              label: r === 0 ? 'Exempt (0%)' : `${r}% GST`,
            }))}
          />
          <Input
            label="Opening Stock"
            type="number"
            value={editItem.opening_stock || 0}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, opening_stock: Number(e.target.value) }))
            }
          />
          <Input
            label="Low Stock Alert"
            type="number"
            value={editItem.low_stock_alert || 5}
            onChange={(e) =>
              setEditItem((p) => ({ ...p, low_stock_alert: Number(e.target.value) }))
            }
            hint="Alert when stock falls below this"
          />
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
            <textarea
              value={editItem.description || ''}
              onChange={(e) => setEditItem((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Optional description..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={`Adjust Stock — ${adjustItem?.name}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => adjustMutation.mutate()}
              loading={adjustMutation.isPending}
              variant={adjustType === 'add' ? 'success' : 'danger'}
            >
              {adjustType === 'add' ? 'Add Stock' : 'Remove Stock'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
            <span className="text-sm text-gray-600">Current Stock</span>
            <span className="font-bold text-gray-900">
              {adjustItem?.current_stock} {adjustItem?.unit}
            </span>
          </div>
          <Select
            label="Adjustment Type"
            value={adjustType}
            onChange={(e) => setAdjustType(e.target.value as 'add' | 'subtract')}
            options={[
              { value: 'add', label: 'Add Stock (Incoming)' },
              { value: 'subtract', label: 'Remove Stock (Write-off)' },
            ]}
          />
          <Input
            label="Quantity"
            type="number"
            value={adjustQty}
            onChange={(e) => setAdjustQty(Number(e.target.value))}
            placeholder="Enter quantity"
          />
          <Input
            label="Reason"
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="e.g. Physical stock count, damage..."
          />
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Item"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
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
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
};
