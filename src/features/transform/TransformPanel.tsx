import React from 'react';
import { useProjectStore } from '../../stores/project';
import { AspectPresets } from './AspectPresets';
import { FitModeSelector } from './FitModeSelector';
import { PositionPresets } from './PositionPresets';
import { RotationFlipControls } from './RotationFlipControls';
import { Button } from '../../components/Button/Button';
import { SparkleIcon } from '../../components/icons';
import { t } from '../../shared/i18n';

export const TransformPanel: React.FC = () => {
  const { project, applyTransformToAll } = useProjectStore();

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

      {/* Position Presets when in Crop Mode */}
      {project.fitMode === 'crop' && <PositionPresets />}

      {/* Rotation & Flip Controls */}
      <RotationFlipControls />

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
