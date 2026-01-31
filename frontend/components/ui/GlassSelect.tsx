/**
 * GlassSelect - 自定义毛玻璃下拉选择组件
 * v1.1 - 多选支持：
 *   - 新增 multiple 属性支持多选模式
 *   - 多选时 value 为数组，onChange 返回数组
 *   - 多选时点击选项切换选中状态，不关闭下拉框
 *   - 显示已选数量和选项标签
 *
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

// 单选模式的 props
interface SingleSelectProps {
  multiple?: false;
  value: string | number | undefined;
  onChange: (value: string | number | undefined) => void;
}

// 多选模式的 props
interface MultiSelectProps {
  multiple: true;
  value: (string | number)[];
  onChange: (value: (string | number)[]) => void;
}

// 基础 props
interface BaseProps {
  /** 选项列表 */
  options: GlassSelectOption[];
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

export type GlassSelectProps = BaseProps & (SingleSelectProps | MultiSelectProps);

export const GlassSelect: React.FC<GlassSelectProps> = (props) => {
  const {
    options,
    placeholder = '请选择',
    size = 'default',
    searchable = false,
    searchPlaceholder = '搜索...',
    className,
    disabled = false,
    multiple = false,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 获取当前选中的选项标签
  const getDisplayLabel = () => {
    if (multiple) {
      const multiProps = props as BaseProps & MultiSelectProps;
      const selectedValues = multiProps.value || [];
      if (selectedValues.length === 0) return placeholder;
      if (selectedValues.length === 1) {
        const opt = options.find((o) => o.value === selectedValues[0]);
        return opt?.label || placeholder;
      }
      return `已选 ${selectedValues.length} 项`;
    } else {
      const singleProps = props as BaseProps & SingleSelectProps;
      const selectedOption = options.find((opt) => opt.value === singleProps.value);
      return selectedOption?.label || placeholder;
    }
  };

  const displayLabel = getDisplayLabel();
  const hasSelection = multiple
    ? ((props as BaseProps & MultiSelectProps).value || []).length > 0
    : (props as BaseProps & SingleSelectProps).value !== undefined;

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

  // 选择选项（单选）
  const handleSingleSelect = useCallback((optionValue: string | number | undefined) => {
    if (!multiple) {
      const singleProps = props as BaseProps & SingleSelectProps;
      singleProps.onChange(optionValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  }, [multiple, props]);

  // 选择选项（多选）
  const handleMultiSelect = useCallback((optionValue: string | number) => {
    if (multiple) {
      const multiProps = props as BaseProps & MultiSelectProps;
      const currentValues = multiProps.value || [];
      const isSelected = currentValues.includes(optionValue);
      if (isSelected) {
        multiProps.onChange(currentValues.filter((v) => v !== optionValue));
      } else {
        multiProps.onChange([...currentValues, optionValue]);
      }
      // 多选模式不关闭下拉框
    }
  }, [multiple, props]);

  // 清除所有选择（多选）
  const handleClearAll = useCallback(() => {
    if (multiple) {
      const multiProps = props as BaseProps & MultiSelectProps;
      multiProps.onChange([]);
    }
  }, [multiple, props]);

  // 检查是否选中（多选）
  const isOptionSelected = (optionValue: string | number) => {
    if (multiple) {
      const multiProps = props as BaseProps & MultiSelectProps;
      return (multiProps.value || []).includes(optionValue);
    }
    const singleProps = props as BaseProps & SingleSelectProps;
    return singleProps.value === optionValue;
  };

  // 按钮样式
  const buttonClass = clsx(
    'flex items-center justify-between gap-2 cursor-pointer transition-all',
    'bg-white/10 border border-white/20 text-white',
    'focus:outline-none focus:ring-1 focus:ring-ios-blue',
    size === 'small'
      ? 'px-3 py-1.5 text-xs rounded-lg min-w-[100px]'
      : 'px-3 py-2 text-sm rounded-lg min-w-[140px]',
    disabled && 'opacity-50 cursor-not-allowed',
    !hasSelection && 'text-white/60'
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

          {/* 多选时的清除按钮 */}
          {multiple && hasSelection && (
            <div className="px-3 py-1.5 border-b border-white/10 flex justify-between items-center">
              <span className="text-xs text-white/50">
                已选 {((props as BaseProps & MultiSelectProps).value || []).length} 项
              </span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-ios-blue hover:text-ios-blue/80"
              >
                清除全部
              </button>
            </div>
          )}

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto py-1">
            {/* 空选项（清除选择）- 仅单选模式 */}
            {!multiple && placeholder && (
              <button
                type="button"
                onClick={() => handleSingleSelect(undefined)}
                className={clsx(
                  'w-full px-3 py-2 text-left transition-colors',
                  size === 'small' ? 'text-xs' : 'text-sm',
                  !hasSelection
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
              filteredOptions.map((option) => {
                const isSelected = isOptionSelected(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => multiple ? handleMultiSelect(option.value) : handleSingleSelect(option.value)}
                    className={clsx(
                      'w-full px-3 py-2 text-left transition-colors flex items-center gap-2',
                      size === 'small' ? 'text-xs' : 'text-sm',
                      isSelected
                        ? 'bg-ios-blue/20 text-ios-blue'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    {multiple ? (
                      // 多选模式显示复选框
                      <span className={clsx(
                        'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                        isSelected
                          ? 'bg-ios-blue border-ios-blue'
                          : 'border-white/30'
                      )}>
                        {isSelected && <Icons.Check className="w-3 h-3 text-white" />}
                      </span>
                    ) : (
                      // 单选模式显示勾选图标
                      isSelected && <Icons.Check className="w-3 h-3 flex-shrink-0" />
                    )}
                    <span className={clsx(!multiple && !isSelected && 'ml-5')}>
                      {option.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlassSelect;
