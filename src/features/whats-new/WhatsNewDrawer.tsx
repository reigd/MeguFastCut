import React from 'react';
import { useUiStore } from '../../stores/ui';
import { useSettingsStore } from '../../stores/settings';
import { CHANGELOG, resolve } from '../../shared/changelog';
import { formatDate, t } from '../../shared/i18n';
import { CloseIcon, SparkleIcon, PlusIcon, CheckIcon, AlertIcon, TrashIcon } from '../../components/icons';

export const WhatsNewDrawer: React.FC = () => {
  const { isWhatsNewOpen, setWhatsNewOpen } = useUiStore();
  const { locale, setLastSeenVersion } = useSettingsStore();

  if (!isWhatsNewOpen) return null;

  const latest = CHANGELOG[0];

  const handleClose = () => {
    if (latest) {
      setLastSeenVersion(latest.version);
    }
    setWhatsNewOpen(false);
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
        animation: 'fadeIn 200ms ease-out forwards',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('whats_new.title')}
        style={{
          width: '380px',
          maxWidth: '100vw',
          height: '100%',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-3)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideOver 220ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <SparkleIcon size={20} style={{ color: 'var(--accent)' }} />
            <h2 style={{ fontSize: 'var(--text-16)', fontWeight: 600 }}>
              {t('whats_new.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 'var(--space-1)',
              display: 'flex',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: 'var(--space-6)',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-6)',
          }}
        >
          {CHANGELOG.map((entry) => (
            <div
              key={entry.version}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                paddingBottom: 'var(--space-6)',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 'var(--text-16)',
                    fontWeight: 700,
                    color: 'var(--accent)',
                  }}
                >
                  v{entry.version}
                </span>
                <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-muted)' }}>
                  {formatDate(entry.date, locale)}
                </span>
              </div>

              {entry.title && (
                <h3 style={{ fontSize: 'var(--text-14)', fontWeight: 600 }}>
                  {resolve(entry.title, locale)}
                </h3>
              )}

              {entry.highlight && (
                <p
                  style={{
                    fontSize: 'var(--text-13)',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    padding: 'var(--space-3)',
                    background: 'var(--bg-inset)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {resolve(entry.highlight, locale)}
                </p>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {entry.changes.map((change, idx) => {
                  let badgeColor = 'var(--accent)';
                  let icon = <PlusIcon size={14} />;
                  let label = t('whats_new.added');

                  if (change.kind === 'improved') {
                    badgeColor = 'var(--success)';
                    icon = <CheckIcon size={14} />;
                    label = t('whats_new.improved');
                  } else if (change.kind === 'fixed') {
                    badgeColor = 'var(--warning)';
                    icon = <AlertIcon size={14} />;
                    label = t('whats_new.fixed');
                  } else if (change.kind === 'removed') {
                    badgeColor = 'var(--danger)';
                    icon = <TrashIcon size={14} />;
                    label = t('whats_new.removed');
                  }

                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--space-2)',
                        fontSize: 'var(--text-13)',
                        lineHeight: 1.4,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          color: badgeColor,
                          padding: '1px 6px',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--bg-inset)',
                          fontSize: 'var(--text-11)',
                          fontWeight: 600,
                          flexShrink: 0,
                          marginTop: '2px',
                        }}
                        title={label}
                      >
                        {icon}
                      </span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {resolve(change.text, locale)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideOver {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes slideOver {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        }
      `}</style>
    </div>
  );
};
