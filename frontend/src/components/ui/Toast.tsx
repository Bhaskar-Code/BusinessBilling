import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import type { ToastMessage } from '../../types';

const iconMap = {
  success: <CheckCircle size={18} className="text-green-500" />,
  error: <XCircle size={18} className="text-red-500" />,
  warning: <AlertTriangle size={18} className="text-amber-500" />,
  info: <Info size={18} className="text-blue-500" />,
};

const bgMap: Record<ToastMessage['type'], string> = {
  success: 'border-l-4 border-green-500 bg-white',
  error: 'border-l-4 border-red-500 bg-white',
  warning: 'border-l-4 border-amber-500 bg-white',
  info: 'border-l-4 border-blue-500 bg-white',
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useAppStore();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg pointer-events-auto
            min-w-[280px] max-w-[380px] ${bgMap[toast.type]}`}
        >
          {iconMap[toast.type]}
          <span className="flex-1 text-sm text-gray-800">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};
