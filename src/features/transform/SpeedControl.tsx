import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/project';
import { GaugeIcon, UndoIcon } from '../../components/icons';
import { t, formatTimecode } from '../../shared/i18n';

/** Maps speed value [0.01 .. 999] to slider position [0 .. 100] */
function speedToSlider(speed: number): number {
  const clamped = Math.max(0.01, Math.min(999, speed));
  if (clamped <= 1.0) {
    // 0..40 maps 0.01..1.0 logarithmically
    const ratio = Math.log10(clamped / 0.01) / 2; // log10(100) = 2
    return Math.max(0, Math.min(40, ratio * 40));
  } else {
    // 40..100 maps 1.0..999 logarithmically
    const ratio = Math.log10(clamped) / Math.log10(999);
    return Math.max(40, Math.min(100, 40 + ratio * 60));
  }
}

/** Maps slider position [0 .. 100] to speed value [0.01 .. 999] */
function sliderToSpeed(pos: number): number {
  // Magnetic snap to exactly 1.0x around 40
  if (Math.abs(pos - 40) < 1.5) {
    return 1.0;
  }
  if (pos < 40) {
    const ratio = pos / 40;
    const raw = 0.01 * Math.pow(100, ratio);
    return Math.round(raw * 100) / 100;
  } else {
    const ratio = (pos - 40) / 60;
    const raw = Math.pow(999, ratio);
    if (raw < 10) return Math.round(raw * 100) / 100;
    if (raw < 100) return Math.round(raw * 10) / 10;
    return Math.round(raw);
  }
}

function formatSpeedText(speed: number): string {
  if (speed >= 100) return `${Math.round(speed)}x`;
  if (speed >= 10) return `${speed.toFixed(1).replace(/\.0$/, '')}x`;
  return `${speed.toFixed(2).replace(/\.?0+$/, (m) => (m === '.00' ? '' : m))}x`;
}

export const SpeedControl: React.FC = () => {
  const { project, activeClipId, setClipSpeed } = useProjectStore();

  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const currentSpeed = activeClip?.speed ?? 1.0;

  const [inputVal, setInputVal] = useState<string>(currentSpeed.toString());

  useEffect(() => {
    setInputVal(currentSpeed.toString());
  }, [currentSpeed, activeClipId]);

  if (!activeClip) return null;

  const presets = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 4.0, 8.0];
  const isDefaultSpeed = Math.abs(currentSpeed - 1.0) < 0.001;

  const rawDurationMs = Math.max(0, activeClip.outMs - activeClip.inMs);
  const effectiveDurationMs = Math.round(rawDurationMs / currentSpeed);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    const newSpeed = sliderToSpeed(pos);
    setClipSpeed(activeClip.id, newSpeed);
  };

  const handleInputCommit = () => {
    const parsed = parseFloat(inputVal);
    if (isNaN(parsed) || parsed <= 0) {
      setInputVal(currentSpeed.toString());
      return;
    }
    const clamped = Math.max(0.01, Math.min(999, parsed));
    setClipSpeed(activeClip.id, clamped);
    setInputVal(clamped.toString());
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-3)',
        background: 'var(--bg-inset)',
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Title & Speed readout */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <GaugeIcon size={14} style={{ color: isDefaultSpeed ? 'var(--text-secondary)' : 'var(--accent)' }} />
          <span style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('transform.speed')}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {!isDefaultSpeed && (
            <button
              type="button"
              onClick={() => setClipSpeed(activeClip.id, 1.0)}
              title={t('transform.speed_reset')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)',
                padding: '2px 6px',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-11)',
                cursor: 'pointer',
              }}
            >
              <UndoIcon size={11} />
              <span>1.0x</span>
            </button>
          )}

          <span
            className="timecode"
            style={{
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
              background: isDefaultSpeed ? 'var(--bg-surface)' : 'var(--accent-muted)',
              border: `1px solid ${isDefaultSpeed ? 'var(--border-subtle)' : 'var(--accent)'}`,
              color: isDefaultSpeed ? 'var(--text-primary)' : 'var(--accent)',
              fontSize: 'var(--text-12)',
              fontWeight: 600,
            }}
          >
            {formatSpeedText(currentSpeed)}
          </span>
        </div>
      </div>

      {/* Slider & Numeric Input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={100}
            step={0.2}
            value={speedToSlider(currentSpeed)}
            onChange={handleSliderChange}
            aria-label={t('transform.speed')}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Direct numeric input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <input
            type="number"
            min={0.01}
            max={999}
            step={0.01}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={handleInputCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleInputCommit();
            }}
            title={t('transform.speed_custom')}
            style={{
              width: '56px',
              height: '24px',
              padding: '0 4px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-11)',
              textAlign: 'center',
            }}
          />
          <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>x</span>
        </div>
      </div>

      {/* Range min/center/max tick labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 'var(--text-10)',
          color: 'var(--text-muted)',
          padding: '0 2px',
        }}
      >
        <span>0.01x</span>
        <span style={{ color: isDefaultSpeed ? 'var(--accent)' : 'var(--text-secondary)' }}>1.0x (Normal)</span>
        <span>999x</span>
      </div>

      {/* Speed Presets Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '3px',
          marginTop: 'var(--space-1)',
        }}
      >
        {presets.slice(0, 5).map((p) => {
          const isSelected = Math.abs(currentSpeed - p) < 0.01;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setClipSpeed(activeClip.id, p)}
              style={{
                height: '22px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--r-sm)',
                color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: 'var(--text-11)',
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {p}x
            </button>
          );
        })}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '3px',
        }}
      >
        {presets.slice(5).map((p) => {
          const isSelected = Math.abs(currentSpeed - p) < 0.01;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setClipSpeed(activeClip.id, p)}
              style={{
                height: '22px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--r-sm)',
                color: isSelected ? '#FFFFFF' : 'var(--text-secondary)',
                fontSize: 'var(--text-11)',
                fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {p}x
            </button>
          );
        })}
      </div>

      {/* Duration comparison & re-encode notice */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          padding: '4px 6px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border-subtle)',
          marginTop: 'var(--space-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-11)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('transform.speed_duration_preview')}:</span>
          <span className="timecode" style={{ color: isDefaultSpeed ? 'var(--text-primary)' : 'var(--accent)', fontWeight: 600 }}>
            {formatTimecode(effectiveDurationMs)}
          </span>
        </div>

        {!isDefaultSpeed && (
          <span style={{ fontSize: 'var(--text-10)', color: 'var(--text-muted)', lineHeight: 1.3 }}>
            {t('transform.speed_reencode_hint')}
          </span>
        )}
      </div>
    </div>
  );
};
