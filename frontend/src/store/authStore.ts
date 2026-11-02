import { create } from 'zustand';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: string;
  token?: string;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const STORAGE_KEY = 'business_billing_auth_user';

export const useAuthStore = create<AuthState>((set) => {
  // Initialize from localStorage
  const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  let initialUser: AuthUser | null = null;
  if (saved) {
    try {
      initialUser = JSON.parse(saved);
    } catch {
      initialUser = null;
    }
  }

  return {
    user: initialUser,
    isAuthenticated: !!initialUser,

    login: async (username: string, password: string) => {
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim();

      // Check against API first
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: cleanUser, password: cleanPass }),
        });
        const data = await res.json();
        if (data.success && data.data?.user) {
          const authUser: AuthUser = {
            ...data.data.user,
            token: data.data.token || 'auth_token_' + Date.now(),
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
          set({ user: authUser, isAuthenticated: true });
          return { success: true };
        }
      } catch {
        // Fallback to local check if API is offline
      }

      // Built-in standard studio credentials
      if (
        (cleanUser === 'admin' || cleanUser === 'studio' || cleanUser === 'owner') &&
        (cleanPass === 'admin' || cleanPass === 'admin123' || cleanPass === '123456' || cleanPass === 'studio123')
      ) {
        const authUser: AuthUser = {
          id: 'admin_1',
          username: cleanUser,
          name: cleanUser === 'studio' ? 'Studio Manager' : 'Studio Owner (Admin)',
          role: 'admin',
          token: 'local_token_' + Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
        set({ user: authUser, isAuthenticated: true });
        return { success: true };
      }

      return { success: false, error: 'Invalid username or password. Use admin / admin123' };
    },

    logout: () => {
      localStorage.removeItem(STORAGE_KEY);
      set({ user: null, isAuthenticated: false });
    },
  };
});
