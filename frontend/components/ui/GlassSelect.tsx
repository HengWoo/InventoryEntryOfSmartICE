/**
 * GlassSelect - 自定义毛玻璃下拉选择组件
 * v1.0 - 初始版本：
 *   - 完全自定义样式的下拉框，替代原生 <select>
 *   - 支持搜索过滤选项
 *   - Storm Glass 毛玻璃风格
 *   - 支持 small/default 两种尺寸
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { Icons } from '../../constants';

export interface GlassSelectOption {
  value: string | number;
  label: string;
}

export interface GlassSelectProps {
  /** 选项列表 */
  options: GlassSelectOption[];
  /** 当前选中值 */
  value: string | number | undefined;
  /** 值变化回调 */
  onChange: (value: string | number | undefined) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 尺寸变体 */
  size?: 'small' | 'default';
  /** 是否显示搜索框 */
  searchable?: boolean;
  /** 搜索框占位文本 */
  searchPlaceholder?: string;
  /** 容器类名 */
  className?: string;
  /** 禁用状态 */
  disabled?: boolean;
}

export const GlassSelect: React.FC<GlassSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = '请选择',
  size = 'default',
  searchable = false,
  searchPlaceholder = '搜索...',
  className,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 获取当前选中的选项标签
  const selectedOption = options.find((opt: GlassSelectOption) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;

  // 过滤选项
  const filteredOptions = searchable && searchQuery
    ? options.filter((opt: GlassSelectOption) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : options;

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // 切换下拉框
  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev: boolean) => !prev);
    if (isOpen) {
      setSearchQuery('');
    }
  }, [disabled, isOpen]);

  // 选择选项
  const handleSelect = useCallback((optionValue: string | number | undefined) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  }, [onChange]);

  // 按钮样式
  const buttonClass = clsx(
    'flex items-center justify-between gap-2 cursor-pointer transition-all',
    'bg-white/10 border border-white/20 text-white',
    'focus:outline-none focus:ring-1 focus:ring-ios-blue',
    size === 'small'
      ? 'px-3 py-1.5 text-xs rounded-lg min-w-[100px]'
      : 'px-3 py-2 text-sm rounded-lg min-w-[140px]',
    disabled && 'opacity-50 cursor-not-allowed',
    !selectedOption && 'text-white/60'
  );

  return (
    <div ref={containerRef} className={clsx('relative inline-block', className)}>
      {/* 触发按钮 */}
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={disabled}
        className={buttonClass}
      >
        <span className="truncate">{displayLabel}</span>
        <Icons.ChevronDown
          className={clsx(
            'w-4 h-4 text-white/50 transition-transform flex-shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* 下拉面板 */}
      {isOpen && (
        <div
          className={clsx(
            'absolute left-0 z-[100] mt-1 min-w-full',
            'rounded-lg overflow-hidden',
            'border border-white/15'
          )}
          style={{
            background: 'rgba(25, 25, 30, 0.95)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {/* 搜索框 */}
          {searchable && (
            <div className="p-2 border-b border-white/10">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className={clsx(
                  'w-full px-2 py-1.5 text-xs',
                  'bg-white/10 border border-white/20 rounded',
                  'text-white placeholder-white/40',
                  'focus:outline-none focus:ring-1 focus:ring-ios-blue'
                )}
              />
            </div>
          )}

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto py-1">
            {/* 空选项（清除选择） */}
            {placeholder && (
              <button
                type="button"
                onClick={() => handleSelect(undefined)}
                className={clsx(
                  'w-full px-3 py-2 text-left transition-colors',
                  size === 'small' ? 'text-xs' : 'text-sm',
                  value === undefined
                    ? 'bg-ios-blue/20 text-ios-blue'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                )}
              >
                {placeholder}
              </button>
            )}

            {/* 选项 */}
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-white/40 text-center">
                无匹配结果
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleSelect(option.value)}
                  className={clsx(
                    'w-full px-3 py-2 text-left transition-colors flex items-center gap-2',
                    size === 'small' ? 'text-xs' : 'text-sm',
                    value === option.value
                      ? 'bg-ios-blue/20 text-ios-blue'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {value === option.value && (
                    <Icons.Check className="w-3 h-3 flex-shrink-0" />
                  )}
                  <span className={clsx(value !== option.value && 'ml-5')}>
                    {option.label}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlassSelect;
