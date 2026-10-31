import React from 'react';
import { clsx } from 'clsx';

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'gray' | 'purple';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700 border-green-200',
  error: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-blue-100 text-blue-700 border-blue-200',
  gray: 'bg-gray-100 text-gray-600 border-gray-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
};

const dotClasses: Record<BadgeVariant, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
  gray: 'bg-gray-400',
  purple: 'bg-purple-500',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'gray',
  children,
  className,
  dot = false,
}) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variantClasses[variant],
        className
      )}
    >
      {dot && (
        <span className={clsx('w-1.5 h-1.5 rounded-full', dotClasses[variant])} />
      )}
      {children}
    </span>
  );
};

export const statusVariantMap: Record<string, BadgeVariant> = {
  paid: 'success',
  partial: 'warning',
  pending: 'error',
  draft: 'gray',
  cancelled: 'gray',
  active: 'success',
  inactive: 'gray',
};
