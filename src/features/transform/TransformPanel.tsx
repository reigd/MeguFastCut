import React from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { AspectPresets } from './AspectPresets';
import { FitModeSelector } from './FitModeSelector';
import { PositionPresets } from './PositionPresets';
import { RotationFlipControls } from './RotationFlipControls';
import { SpeedControl } from './SpeedControl';
import { Button } from '../../components/Button/Button';
import { SparkleIcon, AutoAlignIcon } from '../../components/icons';
import { t } from '../../shared/i18n';

export const TransformPanel: React.FC = () => {
  const { project, applyTransformToAll } = useProjectStore();
  const { autoAlignEnabled, toggleAutoAlign } = usePlayerStore();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-14)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('transform.title')}
        </h3>
      </div>

      {/* Aspect Ratio Presets */}
      <AspectPresets />

      {/* Fit Mode Selector */}
      <FitModeSelector />

      {/* Position Presets & Auto-alignment for interactive handles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <PositionPresets />

        <div
          onClick={toggleAutoAlign}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-card)',
            border: `1px solid ${autoAlignEnabled ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            userSelect: 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <AutoAlignIcon size={15} style={{ color: autoAlignEnabled ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('transform.auto_align')}
              </span>
              <span style={{ fontSize: 'var(--text-10)', color: 'var(--text-secondary)' }}>
                {t('transform.auto_align_hint')}
              </span>
            </div>
          </div>
          <input
            type="checkbox"
            checked={autoAlignEnabled}
            onChange={() => {}}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
        </div>
      </div>

      {/* Rotation & Flip Controls */}
      <RotationFlipControls />

      {/* Per-Clip Speed Control */}
      <SpeedControl />

      {/* Apply to All Clips Button */}
      {project.clips.length > 1 && (
        <Button
          variant="secondary"
          onClick={applyTransformToAll}
          style={{
            marginTop: 'var(--space-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <SparkleIcon size={16} />
          <span>{t('transform.apply_to_all')}</span>
        </Button>
      )}
    </div>
  );
};
