import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { useUiStore } from '../../stores/ui';
import { useVideoPresetsStore } from '../../stores/video-presets';
import { Slider } from '../../components/Slider/Slider';
import { Button } from '../../components/Button/Button';
import {
  ApertureIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CompareSplitIcon,
  DropletIcon,
  EditPencilIcon,
  GaugeIcon,
  InfoIcon,
  LightningIcon,
  PlusIcon,
  SparkleIcon,
  SunIcon,
  TrashIcon,
  UndoIcon,
} from '../../components/icons';
import { VideoFxCategory } from '../../shared/types';
import {
  VIDEO_LOOK_PRESETS,
  VIDEO_PARAM_SPECS,
  CustomVideoPreset,
  VideoAdjustmentKey,
  VideoFxSectionKey,
  VideoParamSpec,
  countActiveVideoAdjustments,
  detectMatchingCustomPreset,
  detectMatchingLookPreset,
  isVideoAdjustmentModified,
  resolveClipVideoAdjustments,
} from '../../shared/video-fx';
import { t } from '../../shared/i18n';

const CATEGORY_TABS: { id: VideoFxCategory; labelKey: string }[] = [
  { id: 'all', labelKey: 'video_edit.cat_all' },
  { id: 'light', labelKey: 'video_edit.cat_light' },
  { id: 'color', labelKey: 'video_edit.cat_color' },
  { id: 'detail', labelKey: 'video_edit.cat_detail' },
  { id: 'effects', labelKey: 'video_edit.cat_effects' },
];

const SECTIONS: {
  id: VideoFxSectionKey;
  titleKey: string;
  renderIcon: (active: boolean) => React.ReactNode;
}[] = [
  {
    id: 'light',
    titleKey: 'video_edit.sec_light',
    renderIcon: (active) => (
      <SunIcon
        size={13}
        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}
      />
    ),
  },
  {
    id: 'color',
    titleKey: 'video_edit.sec_color',
    renderIcon: (active) => (
      <DropletIcon
        size={13}
        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}
      />
    ),
  },
  {
    id: 'detail',
    titleKey: 'video_edit.sec_detail',
    renderIcon: (active) => (
      <SparkleIcon
        size={13}
        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}
      />
    ),
  },
  {
    id: 'effects',
    titleKey: 'video_edit.sec_effects',
    renderIcon: (active) => (
      <ApertureIcon
        size={13}
        style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)', flexShrink: 0 }}
      />
    ),
  },
];

interface ParamRowProps {
  spec: VideoParamSpec;
  value: number;
  modified: boolean;
  onSliderStart: () => void;
  onParamChange: (key: VideoAdjustmentKey, val: number) => void;
  onParamReset: (key: VideoAdjustmentKey, defaultValue: number) => void;
}

const ParamRow: React.FC<ParamRowProps> = React.memo(({
  spec,
  value,
  modified,
  onSliderStart,
  onParamChange,
  onParamReset,
}) => {
  const handleReset = useCallback(() => {
    onParamReset(spec.key as VideoAdjustmentKey, spec.defaultValue);
  }, [onParamReset, spec.defaultValue, spec.key]);

  const handleChange = useCallback(
    (val: number) => {
      onParamChange(spec.key as VideoAdjustmentKey, val);
    },
    [onParamChange, spec.key],
  );

  return (
    <div
      data-testid={`video-param-${spec.key}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          minHeight: '24px',
        }}
      >
        <span
          onDoubleClick={handleReset}
          title={modified ? t('video_edit.reset_param') : undefined}
          style={{
            fontSize: 'var(--text-12)',
            fontWeight: modified ? 600 : 500,
            color: modified ? 'var(--text-primary)' : 'var(--text-secondary)',
            flex: 1,
            minWidth: 0,
            lineHeight: 1.25,
          }}
        >
          {t(spec.labelKey)}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          {modified && (
            <button
              type="button"
              onClick={handleReset}
              title={t('video_edit.reset_param')}
              aria-label={`${t('video_edit.reset_param')}: ${t(spec.labelKey)}`}
              data-testid={`video-param-reset-${spec.key}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '24px',
                minHeight: '24px',
                padding: '0 4px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <UndoIcon size={11} />
            </button>
          )}

          <span
            className="timecode"
            data-testid={`video-param-value-${spec.key}`}
            style={{
              minWidth: '42px',
              textAlign: 'right',
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
              background: modified ? 'var(--accent-muted)' : 'var(--bg-surface)',
              border: `1px solid ${modified ? 'var(--accent)' : 'var(--border-subtle)'}`,
              color: modified ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: 'var(--text-11)',
              fontWeight: 600,
            }}
          >
            {spec.formatValue(value)}
          </span>
        </div>
      </div>

      <div onPointerDown={onSliderStart}>
        <Slider
          value={value}
          min={spec.min}
          max={spec.max}
          step={spec.step}
          bipolar={spec.bipolar}
          snapZero={false}
          unit={spec.unit}
          hideValue={true}
          ariaLabel={t(spec.labelKey)}
          onChange={handleChange}
          onDoubleClick={handleReset}
        />
      </div>
    </div>
  );
});

export const VideoEditPanel: React.FC = () => {
  const {
    project,
    activeClipId,
    setClipVideoAdjustment,
    setClipVideoAdjustments,
    resetClipVideoAdjustments,
    applyVideoAdjustmentsToAll,
  } = useProjectStore();
  const { bypassVideoFx, setBypassVideoFx } = usePlayerStore();
  const addToast = useUiStore((s) => s.addToast);
  const {
    presets: customPresets,
    saveCustomPreset,
    renameCustomPreset,
    deleteCustomPreset,
    restoreCustomPreset,
  } = useVideoPresetsStore();

  const [category, setCategory] = useState<VideoFxCategory>('all');
  const [collapsed, setCollapsed] = useState<Record<VideoFxSectionKey, boolean>>({
    light: false,
    color: false,
    detail: false,
    effects: false,
  });
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const dragHistoryRecordedRef = useRef(false);

  const targetClip = project.clips.find((c) => c.id === activeClipId) || project.clips[0];
  const targetClipIdRef = useRef<string | undefined>(targetClip?.id);
  targetClipIdRef.current = targetClip?.id;

  const adj = useMemo(() => resolveClipVideoAdjustments(targetClip), [targetClip]);
  const activeCount = useMemo(() => countActiveVideoAdjustments(adj), [adj]);
  const activePresetId = useMemo(() => detectMatchingLookPreset(adj), [adj]);
  const activeCustomPresetId = useMemo(
    () => detectMatchingCustomPreset(adj, customPresets),
    [adj, customPresets],
  );
  const isDefault = activeCount === 0;

  const visibleSections = useMemo(
    () => (category === 'all' ? SECTIONS : SECTIONS.filter((s) => s.id === category)),
    [category]
  );

  const handleSliderStart = useCallback(() => {
    dragHistoryRecordedRef.current = false;
  }, []);

  const handleParamChange = useCallback(
    (key: VideoAdjustmentKey, nextVal: number) => {
      const clipId = targetClipIdRef.current;
      if (!clipId) return;
      const shouldRecord = !dragHistoryRecordedRef.current;
      dragHistoryRecordedRef.current = true;
      setClipVideoAdjustment(clipId, key, nextVal, shouldRecord);
    },
    [setClipVideoAdjustment],
  );

  const handleParamReset = useCallback(
    (key: VideoAdjustmentKey, defaultValue: number) => {
      const clipId = targetClipIdRef.current;
      if (!clipId) return;
      setClipVideoAdjustment(clipId, key, defaultValue, true);
    },
    [setClipVideoAdjustment],
  );

  const handleApplyPreset = (presetId: string) => {
    if (!targetClip) return;
    const preset = VIDEO_LOOK_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.id === 'original') {
      resetClipVideoAdjustments(targetClip.id);
      return;
    }
    // Build full target state so switching presets replaces prior look cleanly in 1 undo step
    const fullPatch: Record<string, number> = {};
    for (const spec of VIDEO_PARAM_SPECS) {
      fullPatch[spec.key] = preset.values[spec.key] ?? spec.defaultValue;
    }
    setClipVideoAdjustments(targetClip.id, fullPatch, `Apply look preset: ${preset.id}`, true);
  };

  const handleOpenSavePreset = () => {
    setRenamingPresetId(null);
    setNewPresetName('');
    setIsSavingPreset(true);
  };

  const handleConfirmSavePreset = () => {
    const saved = saveCustomPreset(newPresetName, adj);
    if (!saved) return;
    setIsSavingPreset(false);
    setNewPresetName('');
    addToast({
      message: t('video_edit.preset_saved', { name: saved.name }),
      durationMs: 3000,
    });
  };

  const handleApplyCustomPreset = (preset: CustomVideoPreset) => {
    if (!targetClip) return;
    const fullPatch: Record<string, number> = {};
    for (const spec of VIDEO_PARAM_SPECS) {
      fullPatch[spec.key] = preset.values[spec.key] ?? spec.defaultValue;
    }
    setClipVideoAdjustments(targetClip.id, fullPatch, `Apply custom preset: ${preset.name}`, true);
  };

  const handleStartRename = (preset: CustomVideoPreset) => {
    setIsSavingPreset(false);
    setRenamingPresetId(preset.id);
    setRenameValue(preset.name);
  };

  const handleConfirmRename = () => {
    if (!renamingPresetId) return;
    if (renameCustomPreset(renamingPresetId, renameValue)) {
      setRenamingPresetId(null);
      setRenameValue('');
    }
  };

  const handleDeleteCustomPreset = (preset: CustomVideoPreset, index: number) => {
    const removed = deleteCustomPreset(preset.id);
    if (!removed) return;
    if (renamingPresetId === preset.id) {
      setRenamingPresetId(null);
      setRenameValue('');
    }
    addToast({
      message: t('video_edit.preset_deleted', { name: removed.name }),
      durationMs: 6000,
      undoAction: () => restoreCustomPreset(removed, index),
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        userSelect: 'none',
      }}
    >
      {/* Header & Mode Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <h3 style={{ fontSize: 'var(--text-14)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('video_edit.title')}
          </h3>
          {activeCount > 0 && (
            <span
              className="timecode"
              data-testid="video-fx-active-count"
              style={{
                padding: '1px 6px',
                borderRadius: 'var(--r-full)',
                background: 'var(--accent-muted)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                fontSize: 'var(--text-11)',
                fontWeight: 600,
              }}
            >
              {activeCount}
            </span>
          )}
        </div>

        <div
          data-testid="video-fx-mode-badge"
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
          {/* Compare (Before/After) & Reset All Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-2)',
            }}
          >
            <button
              type="button"
              data-testid="video-fx-compare-btn"
              aria-pressed={bypassVideoFx}
              disabled={isDefault && !bypassVideoFx}
              onClick={() => setBypassVideoFx(!bypassVideoFx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                minHeight: '30px',
                padding: '4px 8px',
                background: bypassVideoFx ? 'var(--accent-muted)' : 'var(--bg-inset)',
                border: `1px solid ${bypassVideoFx ? 'var(--accent)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--r-md)',
                color: bypassVideoFx ? 'var(--accent)' : 'var(--text-primary)',
                fontSize: 'var(--text-12)',
                fontWeight: bypassVideoFx ? 600 : 500,
                cursor: isDefault && !bypassVideoFx ? 'not-allowed' : 'pointer',
                opacity: isDefault && !bypassVideoFx ? 0.5 : 1,
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              <CompareSplitIcon size={13} />
              <span>{t('video_edit.compare_btn')}</span>
            </button>

            <button
              type="button"
              data-testid="video-fx-reset-all-btn"
              disabled={isDefault}
              onClick={() => {
                setBypassVideoFx(false);
                resetClipVideoAdjustments(targetClip.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                minHeight: '30px',
                padding: '4px 8px',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-md)',
                color: isDefault ? 'var(--text-muted)' : 'var(--text-primary)',
                fontSize: 'var(--text-12)',
                fontWeight: 500,
                cursor: isDefault ? 'not-allowed' : 'pointer',
                opacity: isDefault ? 0.5 : 1,
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              <UndoIcon size={13} />
              <span>{t('video_edit.reset_all')}</span>
            </button>
          </div>

          {/* Quick Look Presets & Custom Presets */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              padding: 'var(--space-2)',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
              }}
            >
              <span style={{ fontSize: 'var(--text-11)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('video_edit.presets_label')}
              </span>
              {!isSavingPreset && (
                <button
                  type="button"
                  data-testid="video-save-preset-btn"
                  onClick={handleOpenSavePreset}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    minHeight: '24px',
                    padding: '2px 8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-11)',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <PlusIcon size={11} />
                  <span>{t('video_edit.save_preset')}</span>
                </button>
              )}
            </div>

            {isSavingPreset && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <input
                  type="text"
                  autoFocus
                  maxLength={48}
                  value={newPresetName}
                  placeholder={t('video_edit.preset_name_placeholder')}
                  aria-label={t('video_edit.preset_name_placeholder')}
                  data-testid="video-preset-name-input"
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleConfirmSavePreset();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsSavingPreset(false);
                      setNewPresetName('');
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: '24px',
                    padding: '2px 8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-11)',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  data-testid="video-preset-save-confirm"
                  aria-label={t('video_edit.save_btn')}
                  title={t('video_edit.save_btn')}
                  disabled={!newPresetName.trim()}
                  onClick={handleConfirmSavePreset}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '24px',
                    minHeight: '24px',
                    padding: '0 6px',
                    background: newPresetName.trim() ? 'var(--accent)' : 'var(--bg-surface)',
                    border: `1px solid ${newPresetName.trim() ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--r-sm)',
                    color: newPresetName.trim() ? 'var(--accent-fg, #09090b)' : 'var(--text-muted)',
                    cursor: newPresetName.trim() ? 'pointer' : 'default',
                  }}
                >
                  <CheckIcon size={12} />
                </button>
                <button
                  type="button"
                  data-testid="video-preset-save-cancel"
                  aria-label={t('video_edit.cancel_btn')}
                  title={t('video_edit.cancel_btn')}
                  onClick={() => {
                    setIsSavingPreset(false);
                    setNewPresetName('');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '24px',
                    minHeight: '24px',
                    padding: '0 6px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: '3px',
              }}
            >
              {VIDEO_LOOK_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`video-preset-${preset.id}`}
                    onClick={() => handleApplyPreset(preset.id)}
                    style={{
                      minHeight: '24px',
                      padding: '2px 6px',
                      background: isSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                      border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--r-sm)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 'var(--text-11)',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      transition: 'all var(--dur-fast) var(--ease-out)',
                    }}
                  >
                    {t(preset.labelKey)}
                  </button>
                );
              })}
            </div>

            {customPresets.length > 0 && (
              <div
                data-testid="video-custom-presets-list"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  marginTop: '4px',
                  paddingTop: '6px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: 'var(--text-11)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('video_edit.custom_presets_label')}
                </span>
                {customPresets.map((preset, index) => {
                  const isSelected = activeCustomPresetId === preset.id;
                  const isRenaming = renamingPresetId === preset.id;

                  if (isRenaming) {
                    return (
                      <div
                        key={preset.id}
                        data-testid={`video-custom-preset-${preset.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <input
                          type="text"
                          autoFocus
                          maxLength={48}
                          value={renameValue}
                          aria-label={t('video_edit.rename_preset')}
                          data-testid="video-custom-preset-rename-input"
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleConfirmRename();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setRenamingPresetId(null);
                              setRenameValue('');
                            }
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            minHeight: '24px',
                            padding: '2px 8px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--accent)',
                            borderRadius: 'var(--r-sm)',
                            color: 'var(--text-primary)',
                            fontSize: 'var(--text-11)',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          data-testid="video-custom-preset-rename-confirm"
                          aria-label={t('video_edit.save_btn')}
                          title={t('video_edit.save_btn')}
                          disabled={!renameValue.trim()}
                          onClick={handleConfirmRename}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '24px',
                            minHeight: '24px',
                            padding: '0 6px',
                            background: renameValue.trim() ? 'var(--accent)' : 'var(--bg-surface)',
                            border: `1px solid ${renameValue.trim() ? 'var(--accent)' : 'var(--border-subtle)'}`,
                            borderRadius: 'var(--r-sm)',
                            color: renameValue.trim() ? 'var(--accent-fg, #09090b)' : 'var(--text-muted)',
                            cursor: renameValue.trim() ? 'pointer' : 'default',
                          }}
                        >
                          <CheckIcon size={12} />
                        </button>
                        <button
                          type="button"
                          data-testid="video-custom-preset-rename-cancel"
                          aria-label={t('video_edit.cancel_btn')}
                          title={t('video_edit.cancel_btn')}
                          onClick={() => {
                            setRenamingPresetId(null);
                            setRenameValue('');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '24px',
                            minHeight: '24px',
                            padding: '0 6px',
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--r-sm)',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <CloseIcon size={12} />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={preset.id}
                      data-testid={`video-custom-preset-${preset.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        minHeight: '26px',
                        padding: '1px 2px',
                        background: isSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                        border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--r-sm)',
                      }}
                    >
                      <button
                        type="button"
                        data-testid={`video-custom-preset-apply-${preset.id}`}
                        onClick={() => handleApplyCustomPreset(preset)}
                        title={preset.name}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: '24px',
                          padding: '2px 6px',
                          background: 'transparent',
                          border: 'none',
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontSize: 'var(--text-11)',
                          fontWeight: isSelected ? 600 : 500,
                          textAlign: 'left',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        data-testid={`video-custom-preset-rename-${preset.id}`}
                        aria-label={`${t('video_edit.rename_preset')}: ${preset.name}`}
                        title={t('video_edit.rename_preset')}
                        onClick={() => handleStartRename(preset)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          minHeight: '24px',
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <EditPencilIcon size={11} />
                      </button>
                      <button
                        type="button"
                        data-testid={`video-custom-preset-delete-${preset.id}`}
                        aria-label={`${t('video_edit.delete_preset')}: ${preset.name}`}
                        title={t('video_edit.delete_preset')}
                        onClick={() => handleDeleteCustomPreset(preset, index)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          minHeight: '24px',
                          padding: 0,
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <TrashIcon size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Filter Pills */}
          <div
            role="tablist"
            aria-label={t('video_edit.title')}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              padding: '3px',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {CATEGORY_TABS.map((tab) => {
              const isSelected = category === tab.id;
              const catCount =
                tab.id === 'all' ? activeCount : countActiveVideoAdjustments(adj, tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`video-cat-${tab.id}`}
                  onClick={() => setCategory(tab.id)}
                  style={{
                    flex: '1 1 auto',
                    minHeight: '26px',
                    padding: '3px 7px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    background: isSelected ? 'var(--bg-surface)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--border-subtle)' : 'transparent'}`,
                    borderRadius: 'var(--r-sm)',
                    color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 'var(--text-11)',
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all var(--dur-fast) var(--ease-out)',
                  }}
                >
                  <span>{t(tab.labelKey)}</span>
                  {tab.id !== 'all' && catCount > 0 && (
                    <span
                      className="timecode"
                      style={{
                        fontSize: 'var(--text-11)',
                        color: 'var(--accent)',
                        fontWeight: 700,
                      }}
                    >
                      {catCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Grouped Parameter Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {visibleSections.map((section) => {
              const sectionSpecs = VIDEO_PARAM_SPECS.filter((s) => s.category === section.id);
              const sectionActiveCount = countActiveVideoAdjustments(adj, section.id);
              const isCollapsed = category === 'all' && collapsed[section.id];

              return (
                <div
                  key={section.id}
                  data-testid={`video-section-${section.id}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isCollapsed ? 0 : 'var(--space-2)',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--bg-inset)',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '6px',
                      minHeight: '26px',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (category === 'all') {
                          setCollapsed((prev) => ({ ...prev, [section.id]: !prev[section.id] }));
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flex: 1,
                        minWidth: 0,
                        minHeight: '24px',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: 'var(--text-primary)',
                        cursor: category === 'all' ? 'pointer' : 'default',
                        textAlign: 'left',
                      }}
                    >
                      {category === 'all' &&
                        (isCollapsed ? (
                          <ChevronRightIcon size={13} style={{ color: 'var(--text-secondary)' }} />
                        ) : (
                          <ChevronDownIcon size={13} style={{ color: 'var(--text-secondary)' }} />
                        ))}
                      {section.renderIcon(sectionActiveCount > 0)}
                      <span
                        style={{
                          fontSize: 'var(--text-12)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {t(section.titleKey)}
                      </span>
                      {sectionActiveCount > 0 && (
                        <span
                          className="timecode"
                          style={{
                            padding: '0 5px',
                            borderRadius: 'var(--r-full)',
                            background: 'var(--accent-muted)',
                            color: 'var(--accent)',
                            fontSize: 'var(--text-11)',
                            fontWeight: 600,
                          }}
                        >
                          {sectionActiveCount}
                        </span>
                      )}
                    </button>

                    {sectionActiveCount > 0 && (
                      <button
                        type="button"
                        onClick={() => resetClipVideoAdjustments(targetClip.id, section.id)}
                        title={t('video_edit.reset_section')}
                        aria-label={`${t('video_edit.reset_section')}: ${t(section.titleKey)}`}
                        data-testid={`video-section-reset-${section.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '24px',
                          minHeight: '24px',
                          padding: '0 4px',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--r-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <UndoIcon size={11} />
                      </button>
                    )}
                  </div>

                  {!isCollapsed && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                        paddingTop: '2px',
                      }}
                    >
                      {sectionSpecs.map((spec) => {
                        const val = adj[spec.key];
                        const modified = isVideoAdjustmentModified(adj, spec.key);
                        return (
                          <ParamRow
                            key={spec.key}
                            spec={spec}
                            value={val}
                            modified={modified}
                            onSliderStart={handleSliderStart}
                            onParamChange={handleParamChange}
                            onParamReset={handleParamReset}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Apply to All Clips Button (when project has multiple clips) */}
          {project.clips.length > 1 && (
            <Button
              variant="secondary"
              onClick={applyVideoAdjustmentsToAll}
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
            <span>{t('video_edit.adjustments_hint')}</span>
          </div>
        </>
      )}
    </div>
  );
};
