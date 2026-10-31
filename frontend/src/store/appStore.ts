import { create } from 'zustand';
import type { BusinessSettings, ToastMessage } from '../types';
import api from '../lib/axios';

interface AppState {
  businessSettings: BusinessSettings | null;
  isLoading: boolean;
  toasts: ToastMessage[];
  sidebarExpanded: boolean;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: BusinessSettings) => Promise<void>;
  addToast: (type: ToastMessage['type'], message: string) => void;
  removeToast: (id: string) => void;
  setSidebarExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  businessSettings: null,
  isLoading: false,
  toasts: [],
  sidebarExpanded: true,

  fetchSettings: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get<BusinessSettings>('/api/settings');
      set({ businessSettings: response.data, isLoading: false });
    } catch {
      // Use defaults if no settings
      set({
        businessSettings: {
          business_name: 'My Business',
          state_code: '27',
        },
        isLoading: false,
      });
    }
  },

  updateSettings: async (settings: BusinessSettings) => {
    set({ isLoading: true });
    try {
      const response = await api.post<BusinessSettings>('/api/settings', settings);
      set({ businessSettings: response.data, isLoading: false });
      get().addToast('success', 'Settings saved successfully');
    } catch (error: unknown) {
      set({ isLoading: false });
      get().addToast('error', error instanceof Error ? error.message : 'Failed to save settings');
      throw error;
    }
  },

  addToast: (type: ToastMessage['type'], message: string) => {
    const id = Date.now().toString();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, 4000);
  },

  removeToast: (id: string) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  setSidebarExpanded: (expanded: boolean) => {
    set({ sidebarExpanded: expanded });
  },
}));
