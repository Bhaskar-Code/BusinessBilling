import React, { useState, useRef, useEffect, useCallback } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, X, Search } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value?: string | number | null;
  onChange: (value: string | number | null, option?: Option) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
  clearable?: boolean;
  loading?: boolean;
  className?: string;
  wrapperClassName?: string;
  required?: boolean;
  onSearch?: (query: string) => void;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  label,
  error,
  disabled,
  clearable = true,
  loading = false,
  className,
  wrapperClassName,
  required,
  onSearch,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      o.sublabel?.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (opt: Option) => {
    onChange(opt.value, opt);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  useEffect(() => {
    if (onSearch) onSearch(search);
  }, [search, onSearch]);

  return (
    <div className={clsx('flex flex-col gap-1', wrapperClassName)} ref={wrapperRef}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div
        className={clsx(
          'relative w-full rounded-lg border px-3 py-2 flex items-center cursor-pointer',
          'text-sm transition-colors duration-150',
          disabled && 'bg-gray-100 cursor-not-allowed opacity-70',
          isOpen
            ? 'border-blue-500 ring-2 ring-blue-500'
            : error
            ? 'border-red-400 bg-red-50'
            : 'border-gray-300 bg-white hover:border-gray-400',
          className
        )}
        onClick={handleOpen}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
      >
        <span className={clsx('flex-1 truncate', !selectedOption && 'text-gray-400')}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2">
          {clearable && selectedOption && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={clsx('text-gray-400 transition-transform', isOpen && 'rotate-180')}
          />
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-md">
                <Search size={14} className="text-gray-400 shrink-0" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Type to search..."
                  className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              {loading ? (
                <div className="px-3 py-4 text-center text-gray-400 text-sm">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-gray-400 text-sm">No options found</div>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(opt);
                    }}
                    className={clsx(
                      'px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors',
                      opt.value === value && 'bg-blue-50 text-blue-700 font-medium'
                    )}
                  >
                    <div className="text-sm">{opt.label}</div>
                    {opt.sublabel && (
                      <div className="text-xs text-gray-400 mt-0.5">{opt.sublabel}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};
