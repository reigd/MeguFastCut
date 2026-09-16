import React, { useState, useRef } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delayMs?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  delayMs = 300,
  side = 'top',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (!content) {
    return <>{children}</>;
  }

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 1100,
            whiteSpace: 'nowrap',
            padding: '4px 8px',
            fontSize: 'var(--text-11)',
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-2)',
            pointerEvents: 'none',
            ...(side === 'top' && {
              bottom: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
            }),
            ...(side === 'bottom' && {
              top: 'calc(100% + 6px)',
              left: '50%',
              transform: 'translateX(-50%)',
            }),
            ...(side === 'left' && {
              right: 'calc(100% + 6px)',
              top: '50%',
              transform: 'translateY(-50%)',
            }),
            ...(side === 'right' && {
              left: 'calc(100% + 6px)',
              top: '50%',
              transform: 'translateY(-50%)',
            }),
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
