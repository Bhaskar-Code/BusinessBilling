import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface Column<T> {
  key: keyof T | string;
  title: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: keyof T | ((row: T) => string | number);
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  className?: string;
  stickyHeader?: boolean;
}

type SortDirection = 'asc' | 'desc' | null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function Table<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyMessage = 'No data found',
  onRowClick,
  className,
  stickyHeader = false,
}: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === bVal) return 0;
      const cmp = aVal < bVal ? -1 : 1;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const getRowKey = (row: T, index: number): string | number => {
    if (typeof rowKey === 'function') return rowKey(row);
    return (row[rowKey] as string | number) ?? index;
  };

  return (
    <div className={clsx('w-full overflow-auto', className)}>
      <table className="w-full text-sm border-collapse">
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr className="bg-gray-50 border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                style={{ width: col.width }}
                className={clsx(
                  'px-4 py-3 font-medium text-gray-600 whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  !col.align && 'text-left',
                  col.sortable && 'cursor-pointer select-none hover:text-gray-900'
                )}
                onClick={() => col.sortable && handleSort(String(col.key))}
              >
                <div
                  className={clsx(
                    'flex items-center gap-1',
                    col.align === 'right' && 'justify-end',
                    col.align === 'center' && 'justify-center'
                  )}
                >
                  {col.title}
                  {col.sortable && (
                    <span className="flex flex-col">
                      <ChevronUp
                        size={12}
                        className={sortKey === col.key && sortDir === 'asc' ? 'text-blue-600' : 'text-gray-300'}
                      />
                      <ChevronDown
                        size={12}
                        className={sortKey === col.key && sortDir === 'desc' ? 'text-blue-600' : 'text-gray-300'}
                      />
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-gray-100">
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3">
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </td>
                ))}
              </tr>
            ))
          ) : sortedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-gray-400 text-sm"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedData.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                className={clsx(
                  'border-b border-gray-100 transition-colors',
                  onRowClick
                    ? 'cursor-pointer hover:bg-blue-50'
                    : 'hover:bg-gray-50'
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={clsx(
                      'px-4 py-3 text-gray-800',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.render
                      ? col.render(row, index)
                      : (row[String(col.key)] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
