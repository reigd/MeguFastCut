import React, { useEffect } from 'react';
import { useUiStore, ToastItem } from '../../stores/ui';
import { Button } from '../Button/Button';
import { CloseIcon, UndoIcon } from '../icons';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useUiStore();

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(var(--footer-height) + 16px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.durationMs ?? 10000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div
      role="status"
      style={{
        pointerEvents: 'auto',
        minWidth: '320px',
        maxWidth: '480px',
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-3)',
        padding: 'var(--space-3) var(--space-4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        animation: 'toastSlideUp 200ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
      }}
    >
      <span style={{ fontSize: 'var(--text-13)', fontWeight: 500 }}>
        {toast.message}
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {toast.undoAction && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              toast.undoAction?.();
              onDismiss();
            }}
          >
            <UndoIcon size={14} />
            Undo
          </Button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <style>{`
        @keyframes toastSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
