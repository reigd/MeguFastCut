import React, { useRef } from 'react';
import { useProjectStore } from '../../stores/project';
import { Slider } from '../../components/Slider/Slider';
import { Button } from '../../components/Button/Button';
import {
  SparkleIcon,
  UndoIcon,
  LightningIcon,
  GaugeIcon,
  InfoIcon,
} from '../../components/icons';
import { t } from '../../shared/i18n';

const SHARPNESS_PRESETS: { pct: number; labelKey: string }[] = [
  { pct: 0, labelKey: 'video_edit.sharpness_off' },
  { pct: 25, labelKey: 'video_edit.sharpness_subtle' },
  { pct: 50, labelKey: 'video_edit.sharpness_medium' },
  { pct: 80, labelKey: 'video_edit.sharpness_strong' },
];

export const VideoEditPanel: React.FC = () => {
  const { project, activeClipId, setClipSharpness, applySharpnessToAll } = useProjectStore();
  const dragHistoryRecordedRef = useRef(false);

  const targetClip = project.clips.find((c) => c.id === activeClipId) || project.clips[0];
  const sharpness = targetClip?.sharpness ?? 0;
  const sharpnessPct = Math.round(sharpness * 100);
  const isDefault = sharpnessPct === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        userSelect: 'none',
      }}
    >
      {/* Header & Mode Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <h3 style={{ fontSize: 'var(--text-14)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('video_edit.title')}
        </h3>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            background: isDefault ? 'var(--accent-muted)' : 'var(--bg-inset)',
            border: isDefault ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-full)',
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            color: isDefault ? 'var(--accent)' : 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {isDefault ? <LightningIcon size={12} /> : <GaugeIcon size={12} />}
          <span>{isDefault ? t('video_edit.mode_original') : t('video_edit.mode_reencode')}</span>
        </div>
      </div>

      {!targetClip ? (
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            lineHeight: 1.4,
          }}
        >
          {t('video_edit.no_clip_hint')}
        </div>
      ) : (
        <>
          {/* Sharpness (AMD FidelityFX CAS) Card */}
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
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <SparkleIcon
                  size={14}
                  style={{ color: isDefault ? 'var(--text-secondary)' : 'var(--accent)', flexShrink: 0 }}
                />
                <span style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('video_edit.sharpness')}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => setClipSharpness(targetClip.id, 0, true)}
                    title={t('video_edit.sharpness_reset')}
                    aria-label={t('video_edit.sharpness_reset')}
                    data-testid="sharpness-reset-btn"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      height: '24px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-sm)',
                      padding: '0 6px',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--text-11)',
                      cursor: 'pointer',
                    }}
                  >
                    <UndoIcon size={11} />
                    <span>0%</span>
                  </button>
                )}

                <span
                  className="timecode"
                  data-testid="sharpness-readout"
                  style={{
                    padding: '2px 6px',
                    borderRadius: 'var(--r-sm)',
                    background: isDefault ? 'var(--bg-surface)' : 'var(--accent-muted)',
                    border: `1px solid ${isDefault ? 'var(--border-subtle)' : 'var(--accent)'}`,
                    color: isDefault ? 'var(--text-primary)' : 'var(--accent)',
                    fontSize: 'var(--text-12)',
                    fontWeight: 600,
                  }}
                >
                  {sharpnessPct}%
                </span>
              </div>
            </div>

            {/* Sharpness Slider (records single Undo entry per drag gesture) */}
            <div
              onPointerDown={() => {
                dragHistoryRecordedRef.current = false;
              }}
            >
              <Slider
                value={sharpnessPct}
                min={0}
                max={100}
                step={1}
                unit="%"
                hideValue={true}
                onChange={(val) => {
                  const shouldRecord = !dragHistoryRecordedRef.current;
                  dragHistoryRecordedRef.current = true;
                  setClipSharpness(targetClip.id, val / 100, shouldRecord);
                }}
              />
            </div>

            {/* Scale labels */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-11)',
                color: 'var(--text-secondary)',
                marginTop: '-4px',
              }}
            >
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>

            {/* Quick Presets */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '4px',
              }}
            >
              {SHARPNESS_PRESETS.map((preset) => {
                const isSelected = sharpnessPct === preset.pct;
                return (
                  <button
                    key={preset.pct}
                    type="button"
                    data-testid={`sharpness-preset-${preset.pct}`}
                    onClick={() => setClipSharpness(targetClip.id, preset.pct / 100, true)}
                    style={{
                      minHeight: '28px',
                      padding: '3px 4px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '1px',
                      background: isSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--r-sm)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 'var(--text-11)',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      transition: 'all var(--dur-fast) var(--ease-out)',
                    }}
                  >
                    <span>{t(preset.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Apply to All Clips Button (when project has multiple clips) */}
          {project.clips.length > 1 && (
            <Button
              variant="secondary"
              onClick={applySharpnessToAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
              }}
            >
              <SparkleIcon size={15} />
              <span>{t('video_edit.apply_to_all')}</span>
            </Button>
          )}

          {/* Method & Export Info Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-11)',
              lineHeight: 1.45,
            }}
          >
            <InfoIcon size={14} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent)' }} />
            <span>{t('video_edit.sharpness_hint')}</span>
          </div>
        </>
      )}
    </div>
  );
};
