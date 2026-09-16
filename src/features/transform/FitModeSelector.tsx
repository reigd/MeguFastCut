import React from 'react';
import { useProjectStore } from '../../stores/project';
import { FitMode } from '../../shared/types';
import { Slider } from '../../components/Slider/Slider';
import { BlurIcon, PaletteIcon, AlertIcon } from '../../components/icons';
import { t } from '../../shared/i18n';

export const FitModeSelector: React.FC = () => {
  const { project, setFitMode, setPadding } = useProjectStore();
  const currentMode = project.fitMode;
  const padding = project.padding;

  const modes: { id: FitMode; label: string }[] = [
    { id: 'fit', label: t('transform.fit_fit') },
    { id: 'crop', label: t('transform.fit_crop') },
    { id: 'stretch', label: t('transform.fit_stretch') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('transform.fit_mode')}
        </label>

        {/* Segmented Mode Picker */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            background: 'var(--bg-inset)',
            padding: '3px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {modes.map((m) => {
            const isSelected = currentMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setFitMode(m.id)}
                style={{
                  height: '28px',
                  background: isSelected ? 'var(--bg-surface)' : 'transparent',
                  border: isSelected ? '1px solid var(--border-subtle)' : 'none',
                  borderRadius: 'var(--r-sm)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-12)',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: 'pointer',
                  boxShadow: isSelected ? 'var(--shadow-1)' : 'none',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stretch Warning */}
      {currentMode === 'stretch' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--warning)',
            borderRadius: 'var(--r-md)',
            color: 'var(--warning)',
            fontSize: 'var(--text-11)',
          }}
        >
          <AlertIcon size={16} />
          <span>{t('transform.fit_stretch_warning')}</span>
        </div>
      )}

      {/* Fit Padding Background Options */}
      {currentMode === 'fit' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {/* Blur vs Solid Color Toggle */}
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => setPadding({ ...padding, mode: 'blur' })}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '28px',
                background: padding.mode === 'blur' ? 'var(--bg-elevated)' : 'transparent',
                border: padding.mode === 'blur' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)',
                color: padding.mode === 'blur' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 'var(--text-11)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <BlurIcon size={14} />
              <span>{t('transform.blur_bg')}</span>
            </button>

            <button
              type="button"
              onClick={() => setPadding({ ...padding, mode: 'color' })}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                height: '28px',
                background: padding.mode === 'color' ? 'var(--bg-elevated)' : 'transparent',
                border: padding.mode === 'color' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)',
                color: padding.mode === 'color' ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 'var(--text-11)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <PaletteIcon size={14} />
              <span>{t('transform.solid_bg')}</span>
            </button>
          </div>

          {/* Blur Strength Slider */}
          {padding.mode === 'blur' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                <span>{t('transform.blur_strength')}</span>
                <span className="tnum">{padding.blurStrength}px</span>
              </div>
              <Slider
                value={padding.blurStrength}
                min={0}
                max={100}
                step={5}
                onChange={(v) => setPadding({ ...padding, blurStrength: v })}
              />
            </div>
          )}

          {/* Solid Color Presets */}
          {padding.mode === 'color' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                {t('transform.fill_color')}:
              </span>
              {['#000000', '#15171C', '#FFFFFF'].map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setPadding({ ...padding, color: hex })}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: 'var(--r-sm)',
                    background: hex,
                    border: padding.color === hex ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                />
              ))}
              <input
                type="color"
                value={padding.color || '#000000'}
                onChange={(e) => setPadding({ ...padding, color: e.target.value })}
                style={{
                  width: '26px',
                  height: '24px',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
