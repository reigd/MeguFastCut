import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'secondary',
      size = 'md',
      iconOnly = false,
      loading = false,
      disabled = false,
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-2)',
      borderRadius: 'var(--r-md)',
      fontFamily: 'inherit',
      fontSize: size === 'sm' ? 'var(--text-12)' : size === 'lg' ? 'var(--text-16)' : 'var(--text-14)',
      fontWeight: 500,
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1,
      transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
      outline: 'none',
      border: '1px solid transparent',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
      padding: iconOnly
        ? size === 'sm' ? '4px' : size === 'lg' ? '12px' : '8px'
        : size === 'sm' ? '4px 10px' : size === 'lg' ? '10px 20px' : '7px 14px',
      height: size === 'sm' ? '28px' : size === 'lg' ? '42px' : '36px',
      minWidth: iconOnly ? (size === 'sm' ? '28px' : size === 'lg' ? '42px' : '36px') : undefined,
    };

    let variantStyle: React.CSSProperties = {};
    if (variant === 'primary') {
      variantStyle = {
        background: 'var(--accent)',
        color: 'var(--accent-contrast)',
        borderColor: 'transparent',
      };
    } else if (variant === 'secondary') {
      variantStyle = {
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        borderColor: 'var(--border-subtle)',
      };
    } else if (variant === 'ghost') {
      variantStyle = {
        background: 'transparent',
        color: 'var(--text-primary)',
        borderColor: 'transparent',
      };
    } else if (variant === 'danger') {
      variantStyle = {
        background: 'var(--danger)',
        color: '#FFFFFF',
        borderColor: 'transparent',
      };
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`megu-button megu-button-${variant} megu-button-${size} ${className}`}
        style={{ ...baseStyle, ...variantStyle, ...style }}
        {...props}
      >
        {loading ? (
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
