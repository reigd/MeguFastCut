import React from 'react';

export interface SegmentedOption<T = string> {
  value: T;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}

export interface SegmentedProps<T = string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string | number = string>({
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      className={`megu-segmented megu-segmented-${size} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        borderRadius: 'var(--r-md)',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border-subtle)',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-1)',
              padding: size === 'sm' ? '3px 8px' : '5px 12px',
              height: size === 'sm' ? '24px' : '30px',
              borderRadius: 'var(--r-sm)',
              border: 'none',
              outline: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: size === 'sm' ? 'var(--text-12)' : 'var(--text-13)',
              fontWeight: isSelected ? 600 : 400,
              color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isSelected ? 'var(--bg-elevated)' : 'transparent',
              boxShadow: isSelected ? 'var(--shadow-1)' : 'none',
              transition: 'all var(--dur-fast) var(--ease-out)',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.icon}
            {opt.label && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
