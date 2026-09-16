import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { LightningIcon } from '../../components/icons';
import { useExportStore } from '../../stores/export';
import { t } from '../../shared/i18n';

function formatSeconds(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const ExportProgressModal: React.FC = () => {
  const { isProgressModalOpen, progress, cancelCurrentExport } = useExportStore();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isProgressModalOpen) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isProgressModalOpen]);

  const percentage = progress ? progress.percentage : 0;
  const speed = progress?.speed || '1.0x';
  const fps = progress ? progress.fps.toFixed(1) : '0.0';
  const etaSeconds = progress?.etaSeconds || 0;

  return (
    <Modal
      isOpen={isProgressModalOpen}
      onClose={() => {
        // Prevent accidental closing without cancel
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <LightningIcon size={18} />
          <span>{t('export.progress_title')}</span>
        </div>
      }
      width="480px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="danger" onClick={cancelCurrentExport}>
            {t('export.cancel')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', padding: 'var(--space-2) 0' }}>
        {/* Phase description */}
        <div style={{ fontSize: 'var(--text-13)', color: 'var(--text-secondary)' }}>
          {t('export.phase_encoding')}
        </div>

        {/* Progress Bar Container */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div
            style={{
              width: '100%',
              height: '10px',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-full)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: `${percentage}%`,
                height: '100%',
                background: 'var(--accent)',
                borderRadius: 'var(--r-full)',
                transition: 'width 200ms ease',
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 'var(--text-12)',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-14)' }}>
              {percentage.toFixed(1)}%
            </span>
            <span>{speed}</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* FPS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
              {t('export.fps')}
            </span>
            <span style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {fps}
            </span>
          </div>

          {/* Elapsed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
              {t('export.elapsed')}
            </span>
            <span style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {formatSeconds(elapsedSeconds)}
            </span>
          </div>

          {/* ETA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
              {t('export.eta')}
            </span>
            <span style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {etaSeconds > 0 ? formatSeconds(etaSeconds) : '...'}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
};
