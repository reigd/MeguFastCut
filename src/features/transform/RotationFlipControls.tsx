import React from 'react';
import { useProjectStore } from '../../stores/project';
import { Button } from '../../components/Button/Button';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import {
  RotateCwIcon,
  RotateCcwIcon,
  FlipHIcon,
  FlipVIcon,
} from '../../components/icons';
import { t } from '../../shared/i18n';

export const RotationFlipControls: React.FC = () => {
  const { project, activeClipId, rotateActiveClip, toggleFlipH, toggleFlipV } = useProjectStore();
  const activeClip = project.clips.find((c) => c.id === activeClipId);

  const rotate = activeClip?.rotate || 0;
  const flipH = activeClip?.flipH || false;
  const flipV = activeClip?.flipV || false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
        {t('transform.rotate')} & {t('transform.flip')}
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* Rotate CCW */}
        <Tooltip content="Rotate 90° counter-clockwise">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => rotateActiveClip('ccw')}
            disabled={!activeClipId}
            aria-label="Rotate CCW"
            style={{ flex: 1 }}
          >
            <RotateCcwIcon size={16} />
            <span style={{ fontSize: 'var(--text-11)' }}>-90°</span>
          </Button>
        </Tooltip>

        {/* Current Angle Badge */}
        <div
          style={{
            padding: '4px 8px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            color: rotate !== 0 ? 'var(--accent)' : 'var(--text-muted)',
            minWidth: '40px',
            textAlign: 'center',
          }}
        >
          {rotate}°
        </div>

        {/* Rotate CW */}
        <Tooltip content="Rotate 90° clockwise">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => rotateActiveClip('cw')}
            disabled={!activeClipId}
            aria-label="Rotate CW"
            style={{ flex: 1 }}
          >
            <RotateCwIcon size={16} />
            <span style={{ fontSize: 'var(--text-11)' }}>+90°</span>
          </Button>
        </Tooltip>

        <div style={{ width: '1px', height: '20px', background: 'var(--border-subtle)', margin: '0 2px' }} />

        {/* Flip H */}
        <Tooltip content={t('transform.flip_h')}>
          <Button
            size="sm"
            variant={flipH ? 'primary' : 'secondary'}
            onClick={() => activeClipId && toggleFlipH(activeClipId)}
            disabled={!activeClipId}
            aria-label={t('transform.flip_h')}
            style={{ padding: '6px 10px' }}
          >
            <FlipHIcon size={16} />
          </Button>
        </Tooltip>

        {/* Flip V */}
        <Tooltip content={t('transform.flip_v')}>
          <Button
            size="sm"
            variant={flipV ? 'primary' : 'secondary'}
            onClick={() => activeClipId && toggleFlipV(activeClipId)}
            disabled={!activeClipId}
            aria-label={t('transform.flip_v')}
            style={{ padding: '6px 10px' }}
          >
            <FlipVIcon size={16} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
