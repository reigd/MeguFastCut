import React from 'react';

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  badge,
  children,
  className = '',
}) => {
  return (
    <div
      className={`megu-field ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
        width: '100%',
      }}
    >
      {(label || badge) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          {label && (
            <label
              style={{
                fontSize: 'var(--text-12)',
                fontWeight: 500,
                color: 'var(--text-secondary)',
              }}
            >
              {label}
            </label>
          )}
          {badge}
        </div>
      )}

      {children}

      {hint && !error && (
        <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>
          {hint}
        </span>
      )}

      {error && (
        <span style={{ fontSize: 'var(--text-11)', color: 'var(--danger)', fontWeight: 500 }}>
          {error}
        </span>
      )}
    </div>
  );
};
