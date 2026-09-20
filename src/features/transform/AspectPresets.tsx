import React, { useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { AspectSetting } from '../../shared/types';
import { t } from '../../shared/i18n';

interface PresetDef {
  id: string;
  label: string;
  sublabel: string;
  w: number;
  h: number;
}

const PRESETS: PresetDef[] = [
  { id: 'original', label: 'Original', sublabel: 'Source aspect', w: 16, h: 10 },
  { id: '16:9', label: '16:9', sublabel: 'YouTube · TV', w: 16, h: 9 },
  { id: '9:16', label: '9:16', sublabel: 'Shorts · Reels · TikTok', w: 9, h: 16 },
  { id: '1:1', label: '1:1', sublabel: 'Square · Feed', w: 12, h: 12 },
  { id: '4:5', label: '4:5', sublabel: 'Instagram portrait', w: 10, h: 12.5 },
  { id: '4:3', label: '4:3', sublabel: 'Classic 4:3', w: 14, h: 10.5 },
  { id: '21:9', label: '21:9', sublabel: 'Ultrawide cinema', w: 20, h: 8.5 },
];

export const AspectPresets: React.FC = () => {
  const { project, setAspect } = useProjectStore();
  const currentAspect = project.aspect;

  const [customW, setCustomW] = useState(currentAspect.customW || 1080);
  const [customH, setCustomH] = useState(currentAspect.customH || 1080);

  React.useEffect(() => {
    if (currentAspect.customW) setCustomW(currentAspect.customW);
    if (currentAspect.customH) setCustomH(currentAspect.customH);
  }, [currentAspect.customW, currentAspect.customH]);

  const handleSelectPreset = (p: PresetDef) => {
    const setting: AspectSetting = {
      id: p.id,
      label: p.label,
    };
    setAspect(setting, true);
  };

  const handleCustomApply = () => {
    const w = Math.max(100, Math.min(7680, customW));
    const h = Math.max(100, Math.min(7680, customH));
    const setting: AspectSetting = {
      id: 'custom',
      label: `${w}:${h}`,
      customW: w,
      customH: h,
      ratio: w / h,
    };
    setAspect(setting, true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
        {t('transform.aspect_ratio')}
      </label>

      {/* Grid of standard presets */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--space-2)',
        }}
      >
        {PRESETS.map((p) => {
          const isSelected = currentAspect.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectPreset(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2)',
                background: isSelected ? 'var(--accent-muted)' : 'var(--bg-inset)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                textAlign: 'left',
                color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {/* Miniature aspect box icon */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: `${Math.round(p.w)}px`,
                    height: `${Math.round(p.h)}px`,
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--text-muted)'}`,
                    borderRadius: '2px',
                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 'var(--text-12)',
                    fontWeight: isSelected ? 600 : 500,
                    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                  }}
                >
                  {p.label}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-11)',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.sublabel}
                </span>
              </div>
            </button>
          );
        })}

        {/* Custom Preset Button */}
        <button
          type="button"
          onClick={() => {
            const setting: AspectSetting = {
              id: 'custom',
              label: 'Custom',
              customW,
              customH,
              ratio: customW / customH,
            };
            setAspect(setting, true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2)',
            background: currentAspect.id === 'custom' ? 'var(--accent-muted)' : 'var(--bg-inset)',
            border: currentAspect.id === 'custom' ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
            cursor: 'pointer',
            textAlign: 'left',
            color: currentAspect.id === 'custom' ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '16px',
                height: '16px',
                border: `1.5px dashed ${currentAspect.id === 'custom' ? 'var(--accent)' : 'var(--text-muted)'}`,
                borderRadius: '2px',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 'var(--text-12)',
                fontWeight: currentAspect.id === 'custom' ? 600 : 500,
                color: currentAspect.id === 'custom' ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              {t('transform.aspect_custom')}
            </span>
            <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>
              {customW}×{customH}
            </span>
          </div>
        </button>
      </div>

      {/* Custom Dimensions Form */}
      {currentAspect.id === 'custom' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
            marginTop: 'var(--space-1)',
          }}
        >
          <input
            type="number"
            value={customW}
            min={100}
            max={7680}
            step={2}
            onChange={(e) => setCustomW(parseInt(e.target.value, 10) || 100)}
            onBlur={handleCustomApply}
            aria-label="Custom width"
            style={{
              width: '70px',
              height: '28px',
              padding: '0 6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-12)',
              textAlign: 'center',
            }}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-12)' }}>×</span>
          <input
            type="number"
            value={customH}
            min={100}
            max={7680}
            step={2}
            onChange={(e) => setCustomH(parseInt(e.target.value, 10) || 100)}
            onBlur={handleCustomApply}
            aria-label="Custom height"
            style={{
              width: '70px',
              height: '28px',
              padding: '0 6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-12)',
              textAlign: 'center',
            }}
          />
        </div>
      )}
    </div>
  );
};
