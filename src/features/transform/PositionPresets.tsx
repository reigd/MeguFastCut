import React from 'react';
import { useProjectStore } from '../../stores/project';
import { Button } from '../../components/Button/Button';
import { ResizeIcon } from '../../components/icons';
import { getClipTrackIndex } from '../../shared/media-formats';
import { t } from '../../shared/i18n';

export const PositionPresets: React.FC = () => {
  const { project, activeClipId, setCropPosition, fitOverlayToCanvas } = useProjectStore();
  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const isOverlaySelected = Boolean(activeClip && getClipTrackIndex(activeClip) > 0);

  const positions: { id: 'center' | 'top' | 'bottom' | 'left' | 'right'; label: string }[] = [
    { id: 'center', label: t('transform.pos_center') },
    { id: 'left', label: t('transform.pos_left') },
    { id: 'right', label: t('transform.pos_right') },
    { id: 'top', label: t('transform.pos_top') },
    { id: 'bottom', label: t('transform.pos_bottom') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('transform.position')}
        </label>
        {isOverlaySelected && activeClip && (
          <button
            type="button"
            onClick={() => fitOverlayToCanvas(activeClip.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: '24px',
              padding: '3px 8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--accent)',
              fontSize: 'var(--text-10)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ResizeIcon size={11} />
            <span>{t('transform.fit_overlay_canvas')}</span>
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '4px',
        }}
      >
        {positions.map((pos) => (
          <Button
            key={pos.id}
            size="sm"
            variant="secondary"
            onClick={() => setCropPosition(pos.id)}
            style={{
              padding: '4px 2px',
              fontSize: 'var(--text-11)',
              justifyContent: 'center',
            }}
          >
            {pos.label}
          </Button>
        ))}
      </div>
    </div>
  );
};
