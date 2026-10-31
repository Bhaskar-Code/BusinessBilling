import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { useAppStore } from '../store/appStore';

const INDIAN_STATES = [
  { value: '01', label: '01 - Jammu & Kashmir' },
  { value: '02', label: '02 - Himachal Pradesh' },
  { value: '03', label: '03 - Punjab' },
  { value: '04', label: '04 - Chandigarh' },
  { value: '05', label: '05 - Uttarakhand' },
  { value: '06', label: '06 - Haryana' },
  { value: '07', label: '07 - Delhi' },
  { value: '08', label: '08 - Rajasthan' },
  { value: '09', label: '09 - Uttar Pradesh' },
  { value: '10', label: '10 - Bihar' },
  { value: '19', label: '19 - West Bengal' },
  { value: '24', label: '24 - Gujarat' },
  { value: '27', label: '27 - Maharashtra' },
  { value: '29', label: '29 - Karnataka' },
  { value: '33', label: '33 - Tamil Nadu' },
  { value: '36', label: '36 - Telangana' },
  { value: '37', label: '37 - Andhra Pradesh' },
];

export default function Settings() {
  const queryClient = useQueryClient();
  const { addToast } = useAppStore();
  const [formData, setFormData] = useState({
    name: 'My Business Enterprises',
    gstin: '',
    address: '',
    phone: '',
    email: '',
    state_code: '27',
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/api/settings');
      return res.data?.data || null;
    },
  });

  useEffect(() => {
    if (settingsData) {
      setFormData({
        name: settingsData.name || '',
        gstin: settingsData.gstin || '',
        address: settingsData.address || '',
        phone: settingsData.phone || '',
        email: settingsData.email || '',
        state_code: settingsData.state_code || '27',
      });
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/api/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      addToast('success', 'Business settings updated successfully');
    },
    onError: (err: any) => {
      addToast('error', err.message || 'Failed to update settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Profile & Settings</h1>
        <p className="text-sm text-gray-500">Configure your business details, GSTIN, and default tax state</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Business / Trade Name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Apex Hardware & Electricals"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="GSTIN (Goods and Services Tax Number)"
              value={formData.gstin}
              onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
              placeholder="e.g. 27AAAAA0000A1Z5"
            />
            <Select
              label="Registered State (GST State Code)"
              value={formData.state_code}
              onChange={(e) => setFormData({ ...formData, state_code: e.target.value })}
              options={INDIAN_STATES}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 9876543210"
            />
            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@mybusiness.com"
            />
          </div>
          <Input
            label="Business Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            placeholder="Shop No. 12, Main Market, Mumbai"
          />

          <div className="pt-4 flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
