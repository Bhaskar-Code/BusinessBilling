import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Truck,
  Receipt,
  Wallet,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  FileText,
  FileMinus,
  FileOutput,
  FileInput,
  ArrowDownCircle,
  ArrowUpCircle,
  LogOut,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../store/authStore';
import { ToastContainer } from './ui/Toast';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; icon: React.ReactNode; path: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/' },
  { label: 'Parties', icon: <Users size={20} />, path: '/parties' },
  { label: 'Inventory', icon: <Package size={20} />, path: '/inventory' },
  {
    label: 'Sale',
    icon: <ShoppingCart size={20} />,
    children: [
      { label: 'Sales Invoice', icon: <FileText size={16} />, path: '/sale' },
      { label: 'All Sales', icon: <FileOutput size={16} />, path: '/transactions?type=sale' },
      { label: 'Quotation', icon: <FileMinus size={16} />, path: '/transactions?type=quotation' },
      {
        label: 'Delivery Challan',
        icon: <FileOutput size={16} />,
        path: '/transactions?type=delivery_challan',
      },
      {
        label: 'Credit Note',
        icon: <FileMinus size={16} />,
        path: '/transactions?type=credit_note',
      },
    ],
  },
  {
    label: 'Purchase',
    icon: <Truck size={20} />,
    children: [
      { label: 'Purchase Bill', icon: <FileInput size={16} />, path: '/purchase' },
      { label: 'All Purchases', icon: <FileInput size={16} />, path: '/transactions?type=purchase' },
      {
        label: 'Debit Note',
        icon: <FileMinus size={16} />,
        path: '/transactions?type=debit_note',
      },
    ],
  },
  { label: 'Expenses', icon: <Receipt size={20} />, path: '/expenses' },
  {
    label: 'Payments',
    icon: <Wallet size={20} />,
    children: [
      {
        label: 'Payment In',
        icon: <ArrowDownCircle size={16} />,
        path: '/payments?type=payment_in',
      },
      {
        label: 'Payment Out',
        icon: <ArrowUpCircle size={16} />,
        path: '/payments?type=payment_out',
      },
    ],
  },
  { label: 'Reports', icon: <BarChart2 size={20} />, path: '/reports' },
  { label: 'Settings', icon: <Settings size={20} />, path: '/settings' },
];

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/parties': 'Parties',
  '/inventory': 'Inventory',
  '/sale': 'New Sale Invoice',
  '/purchase': 'New Purchase Bill',
  '/transactions': 'Transactions',
  '/expenses': 'Expenses',
  '/payments': 'Payments',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

const SidebarItem: React.FC<{
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}> = ({ item, collapsed, onNavigate }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => {
    if (item.children) {
      return item.children.some((c) => location.pathname + location.search === c.path || location.pathname === c.path.split('?')[0]);
    }
    return false;
  });

  const isChildActive = item.children?.some(
    (c) =>
      location.pathname + location.search === c.path ||
      location.pathname === c.path.split('?')[0]
  );

  if (!item.children) {
    return (
      <NavLink
        to={item.path!}
        end={item.path === '/'}
        onClick={onNavigate}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 transition-all duration-150 group',
            isActive
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          )
        }
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          if (collapsed) {
            navigate(item.children![0].path);
          } else {
            setOpen((o) => !o);
          }
        }}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mx-2 transition-all duration-150',
          isChildActive
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
          'pr-0' // full width minus mx-2
        )}
        style={{ width: 'calc(100% - 16px)' }}
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 text-sm font-medium text-left truncate">{item.label}</span>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </>
        )}
      </button>
      {!collapsed && open && (
        <div className="ml-6 mt-1 mb-1 flex flex-col gap-0.5 border-l-2 border-gray-100 pl-3">
          {item.children.map((child) => {
            const childPath = child.path.split('?')[0];
            const childSearch = child.path.includes('?') ? '?' + child.path.split('?')[1] : '';
            const isActive =
              location.pathname === childPath &&
              (!childSearch || location.search === childSearch);

            return (
              <NavLink
                key={child.path}
                to={child.path}
                onClick={onNavigate}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                {child.icon}
                <span>{child.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const pageTitle =
    pageTitles[location.pathname] ||
    (location.pathname.includes('/sale/') ? 'Edit Sale Invoice' : '') ||
    (location.pathname.includes('/purchase/') ? 'Edit Purchase Bill' : '') ||
    'Vyapaar';

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50',
          'flex flex-col transition-all duration-300 shadow-sm',
          // Desktop
          'hidden lg:flex',
          desktopCollapsed ? 'lg:w-16' : 'lg:w-60',
          // Mobile
          mobileOpen ? 'flex w-72' : 'hidden'
        )}
      >
        {/* Logo */}
        <div
          className={clsx(
            'flex items-center h-16 border-b border-gray-100 shrink-0',
            desktopCollapsed ? 'justify-center px-2' : 'px-4 gap-3'
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          {!desktopCollapsed && (
            <div>
              <span className="font-bold text-gray-900 text-lg leading-none">Vyapaar</span>
              <p className="text-xs text-gray-400 leading-none mt-0.5">Business ERP</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto flex flex-col gap-0.5">
          {navItems.map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              collapsed={desktopCollapsed}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="p-3 border-t border-gray-100 hidden lg:block">
          <button
            onClick={() => setDesktopCollapsed((c) => !c)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-xs"
          >
            {desktopCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronDown size={16} className="rotate-90" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar (full) */}
      <aside
        className={clsx(
          'fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50 w-72',
          'flex flex-col transition-all duration-300 shadow-xl lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">Vyapaar</span>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto flex flex-col gap-0.5">
          {navItems.map((item) => (
            <SidebarItem
              key={item.label}
              item={item}
              collapsed={false}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div
        className={clsx(
          'flex-1 flex flex-col min-w-0 transition-all duration-300',
          desktopCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0 shadow-sm">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <h1 className="font-semibold text-gray-900 text-lg flex-1">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {(user?.username || 'A')[0].toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-gray-900 leading-none">
                  {user?.name || 'Studio Owner'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{user?.role || 'Admin'}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
            >
              <LogOut size={18} />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};
