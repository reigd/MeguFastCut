import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { TransitionPlacement, useUiStore } from '../../stores/ui';
import { Slider } from '../../components/Slider/Slider';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import {
  ArrowDownIcon,
  ArrowDownLeftIcon,
  ArrowDownRightIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIrisIcon,
  CloseIcon,
  InfoIcon,
  PlayIcon,
  SplitShutterIcon,
  TransitionIcon,
} from '../../components/icons';
import {
  Clip,
  ClipTransition,
  TransitionAudioMode,
  TransitionCategory,
  TransitionDirection,
  TransitionEasing,
  TransitionType,
} from '../../shared/types';
import {
  TRANSITION_CATALOG,
  TRANSITION_COLOR_SWATCHES,
  TransitionPresetMeta,
  computeMainTrackTiming,
  computeTransitionPreviewLayers,
  createDefaultTransition,
  getTransitionMeta,
  isActiveTransition,
} from '../../shared/transitions';
import { setDraggingTransitionType } from '../../shared/drag-state';
import { getClipTrackIndex } from '../../shared/media-formats';
import { t } from '../../shared/i18n';

const DURATION_PRESETS_MS = [250, 600, 1000, 1600];
const EASING_OPTIONS: TransitionEasing[] = ['smooth', 'linear', 'easeIn', 'easeOut', 'sharp'];
const AUDIO_MODES: TransitionAudioMode[] = ['crossfade', 'dip', 'cut'];

const CATEGORIES: { id: TransitionCategory; labelKey: string }[] = [
  { id: 'all', labelKey: 'transitions.cat_all' },
  { id: 'light', labelKey: 'transitions.cat_light' },
  { id: 'motion', labelKey: 'transitions.cat_motion' },
  { id: 'geometric', labelKey: 'transitions.cat_geometric' },
  { id: 'creative', labelKey: 'transitions.cat_creative' },
];

function renderDirectionIcon(dir: TransitionDirection) {
  switch (dir) {
    case 'left':
      return <ArrowLeftIcon size={13} />;
    case 'right':
      return <ArrowRightIcon size={13} />;
    case 'up':
      return <ArrowUpIcon size={13} />;
    case 'down':
      return <ArrowDownIcon size={13} />;
    case 'tl':
      return <ArrowUpLeftIcon size={13} />;
    case 'tr':
      return <ArrowUpRightIcon size={13} />;
    case 'bl':
      return <ArrowDownLeftIcon size={13} />;
    case 'br':
      return <ArrowDownRightIcon size={13} />;
    case 'open':
    case 'close':
      return <CircleIrisIcon size={13} />;
    case 'horzopen':
    case 'horzclose':
    case 'vertopen':
    case 'vertclose':
      return <SplitShutterIcon size={13} />;
    case 'horizontal':
      return <ArrowRightIcon size={13} />;
    case 'vertical':
      return <ArrowDownIcon size={13} />;
    default:
      return <ArrowRightIcon size={13} />;
  }
}

interface TransitionPreviewCardProps {
  meta: TransitionPresetMeta;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (type: TransitionType) => void;
}

const TransitionPreviewCard: React.FC<TransitionPreviewCardProps> = ({
  meta,
  isSelected,
  disabled,
  onSelect,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0.45);
  const prefersReducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    if (prefersReducedMotion || (!isHovered && !isSelected)) {
      setProgress(0.45);
      return;
    }

    let rafId = 0;
    const start = performance.now();
    const cycleMs = 1500;

    const tick = (now: number) => {
      const elapsed = (now - start) % cycleMs;
      // Pause briefly at start & end so the transition effect reads clearly
      const raw = elapsed / cycleMs;
      const p = raw < 0.15 ? 0 : raw > 0.85 ? 1 : (raw - 0.15) / 0.7;
      setProgress(p);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isHovered, isSelected, prefersReducedMotion]);

  const previewTransition = useMemo(
    () => createDefaultTransition(meta.type),
    [meta.type]
  );

  const layers = useMemo(
    () => computeTransitionPreviewLayers(previewTransition, progress, 'junction'),
    [previewTransition, progress]
  );

  const handleDragStart = (e: React.DragEvent) => {
    setDraggingTransitionType(meta.type);
    e.dataTransfer.setData('megu/transition-type', meta.type);
    e.dataTransfer.setData('text/plain', meta.type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setDraggingTransitionType(null);
  };

  return (
    <button
      type="button"
      draggable
      data-testid={`transition-card-${meta.type}`}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => onSelect(meta.type)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={t(meta.descKey)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        background: isSelected ? 'var(--accent-muted)' : 'var(--bg-elevated)',
        border: `1px solid ${isSelected || isHovered ? 'var(--accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        cursor: disabled ? 'pointer' : 'grab',
        textAlign: 'left',
        transition: 'border-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out)',
        boxShadow: isSelected ? 'var(--shadow-1)' : 'none',
        opacity: disabled ? 0.72 : 1,
      }}
    >
      {/* Miniature 16:9 Live Preview Stage */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          background: 'var(--bg-base)',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Outgoing Scene A (Cool geometric landscape) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, var(--bg-inset) 0%, var(--bg-surface) 100%)',
            ...layers.outStyle,
          }}
        >
          <div
            style={{
              width: '26px',
              height: '26px',
              borderRadius: 'var(--r-full)',
              border: '2px solid var(--text-secondary)',
              opacity: 0.4,
              position: 'absolute',
              bottom: '16%',
              right: '18%',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: '6px',
              left: '8px',
              fontSize: 'var(--text-10)',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
            }}
          >
            A
          </span>
        </div>

        {/* Incoming Scene B (Accent-tinted frame) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, var(--accent-muted) 0%, var(--bg-elevated) 100%)',
            ...layers.inStyle,
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: 'var(--r-sm)',
              border: '2px solid var(--accent)',
              opacity: 0.7,
              position: 'absolute',
              top: '16%',
              left: '18%',
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: '6px',
              right: '8px',
              fontSize: 'var(--text-10)',
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.06em',
            }}
          >
            B
          </span>
        </div>

        {/* Dip Color Overlay */}
        {layers.dipOverlayColor && layers.dipOverlayOpacity > 0.001 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: layers.dipOverlayColor,
              opacity: layers.dipOverlayOpacity,
              zIndex: 4,
            }}
          />
        )}
      </div>

      {/* Card Label */}
      <div
        style={{
          padding: '5px 7px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-11)',
            fontWeight: isSelected ? 600 : 500,
            color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t(meta.nameKey)}
        </span>
      </div>
    </button>
  );
};

export const TransitionsPanel: React.FC = () => {
  const {
    project,
    sources,
    activeClipId,
    setActiveClipId,
    setClipTransitionIn,
    setClipTransitionOut,
    applyTransitionToAllCuts,
  } = useProjectStore();
  const { seek, play } = usePlayerStore();
  const { transitionPlacement, setTransitionPlacement } = useUiStore();
  const [category, setCategory] = useState<TransitionCategory>('all');
  const dragHistoryRecordedRef = useRef(false);

  const mainTiming = useMemo(() => computeMainTrackTiming(project.clips), [project.clips]);
  const mainItems = mainTiming.items;
  const junctionItems = useMemo(
    () => mainItems.filter((it) => it.index > 0 && it.isContiguousWithPrev),
    [mainItems]
  );

  // Resolve effective placement: if user is on 'junction' with < 2 contiguous clips, still allow 'intro'/'outro' cleanly
  const hasJunctions = junctionItems.length > 0;
  const effectivePlacement: TransitionPlacement =
    transitionPlacement === 'junction' && !hasJunctions && mainItems.length === 1
      ? 'intro'
      : transitionPlacement;

  // Resolve target clip for the selected placement
  const targetInfo = useMemo(() => {
    if (mainItems.length === 0) {
      // Allow targeting an overlay clip for intro/outro if V1 is empty
      const activeOverlay = project.clips.find(
        (c) => c.enabled && c.id === activeClipId && getClipTrackIndex(c) > 0
      );
      if (activeOverlay) {
        return {
          clip: activeOverlay,
          mode: effectivePlacement === 'outro' ? ('outro' as const) : ('intro' as const),
          junctionIndex: -1,
          prevClip: undefined as Clip | undefined,
          effectiveDurationMs: 0,
          previewTimeMs: activeOverlay.startMs ?? 0,
        };
      }
      return null;
    }

    if (effectivePlacement === 'junction' && junctionItems.length > 0) {
      const matchedIdx = junctionItems.findIndex((it) => it.clip.id === activeClipId);
      const chosenIdx = matchedIdx >= 0 ? matchedIdx : 0;
      const item = junctionItems[chosenIdx];
      const prevItem = mainItems[item.index - 1];
      return {
        clip: item.clip,
        mode: 'junction' as const,
        junctionIndex: chosenIdx,
        prevClip: prevItem?.clip,
        effectiveDurationMs: item.overlapInMs,
        previewTimeMs: Math.max(0, item.playStartMs - 350),
      };
    }

    const activeMainIdx = mainItems.findIndex((it) => it.clip.id === activeClipId);
    const fallbackIdx = effectivePlacement === 'outro' ? mainItems.length - 1 : 0;
    const item = mainItems[activeMainIdx >= 0 ? activeMainIdx : fallbackIdx];

    if (effectivePlacement === 'outro') {
      return {
        clip: item.clip,
        mode: 'outro' as const,
        junctionIndex: -1,
        prevClip: undefined,
        effectiveDurationMs: item.outroDurationMs,
        previewTimeMs: Math.max(0, item.playEndMs - Math.max(item.outroDurationMs, 500) - 350),
      };
    }

    return {
      clip: item.clip,
      mode: 'intro' as const,
      junctionIndex: -1,
      prevClip: undefined,
      effectiveDurationMs: item.introDurationMs,
      previewTimeMs: Math.max(0, item.playStartMs - 200),
    };
  }, [mainItems, junctionItems, project.clips, activeClipId, effectivePlacement]);

  const currentTransition: ClipTransition | null = targetInfo
    ? targetInfo.mode === 'outro'
      ? targetInfo.clip.transitionOut || null
      : targetInfo.clip.transitionIn || null
    : null;

  const activeType: TransitionType = isActiveTransition(currentTransition)
    ? currentTransition.type
    : 'none';
  const activeMeta = activeType !== 'none' ? getTransitionMeta(activeType) : undefined;

  const commitTransition = (next: ClipTransition | null, recordHistory = true) => {
    if (!targetInfo) return;
    if (targetInfo.mode === 'outro') {
      setClipTransitionOut(targetInfo.clip.id, next, recordHistory);
    } else {
      setClipTransitionIn(targetInfo.clip.id, next, recordHistory);
    }
  };

  const handleSelectType = (type: TransitionType) => {
    if (!targetInfo) return;
    if (type === 'none') {
      commitTransition(null, true);
      return;
    }
    const next = createDefaultTransition(type, currentTransition);
    commitTransition(next, true);
  };

  const handlePreviewTransition = () => {
    if (!targetInfo) return;
    seek(targetInfo.previewTimeMs);
    play();
  };

  const handleStepJunction = (delta: number) => {
    if (junctionItems.length <= 1 || !targetInfo || targetInfo.junctionIndex < 0) return;
    const nextIdx =
      (targetInfo.junctionIndex + delta + junctionItems.length) % junctionItems.length;
    const nextClip = junctionItems[nextIdx];
    setActiveClipId(nextClip.clip.id);
    seek(Math.max(0, nextClip.playStartMs - 300));
  };

  const filteredCatalog = useMemo(() => {
    if (category === 'all') return TRANSITION_CATALOG;
    return TRANSITION_CATALOG.filter((item) => item.category === category);
  }, [category]);

  const prevFilename = targetInfo?.prevClip
    ? sources.find((s) => s.id === targetInfo.prevClip?.sourceId)?.filename || ''
    : '';
  const currFilename = targetInfo
    ? sources.find((s) => s.id === targetInfo.clip.sourceId)?.filename || ''
    : '';

  return (
    <div
      data-testid="transitions-panel"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        padding: 'var(--space-3)',
        gap: 'var(--space-3)',
        userSelect: 'none',
      }}
    >
      {/* Placement Selector (Between clips / Intro / Outro) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: 'var(--text-11)', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {t('transitions.placement_label')}
        </span>

        <div
          role="group"
          aria-label={t('transitions.placement_label')}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '3px',
            padding: '2px',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
          }}
        >
          {(
            [
              { id: 'junction' as const, label: t('transitions.place_between') },
              { id: 'intro' as const, label: t('transitions.place_intro') },
              { id: 'outro' as const, label: t('transitions.place_outro') },
            ]
          ).map((item) => {
            const isSelected = effectivePlacement === item.id;
            const isDisabled = item.id === 'junction' && !hasJunctions;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`transition-place-${item.id}`}
                disabled={isDisabled}
                onClick={() => setTransitionPlacement(item.id)}
                style={{
                  minHeight: '26px',
                  padding: '3px 4px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                  color: isSelected
                    ? 'var(--accent)'
                    : 'var(--text-secondary)',
                  opacity: isDisabled ? 0.65 : 1,
                  fontSize: 'var(--text-11)',
                  fontWeight: isSelected ? 600 : 500,
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  boxShadow: isSelected ? 'var(--shadow-1)' : 'none',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Active target indicator & junction stepper */}
        {targetInfo ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '6px',
              padding: '4px 8px',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-11)',
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
              title={
                targetInfo.mode === 'junction'
                  ? `${prevFilename} → ${currFilename}`
                  : currFilename
              }
            >
              {targetInfo.mode === 'junction'
                ? `${t('transitions.cut_label', {
                    index: targetInfo.junctionIndex + 1,
                    total: junctionItems.length,
                  })}: ${prevFilename} → ${currFilename}`
                : currFilename}
            </span>

            {targetInfo.mode === 'junction' && junctionItems.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <button
                  type="button"
                  aria-label={t('transitions.prev_cut')}
                  onClick={() => handleStepJunction(-1)}
                  style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeftIcon size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t('transitions.next_cut')}
                  onClick={() => handleStepJunction(1)}
                  style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRightIcon size={13} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              padding: '6px 8px',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border-subtle)',
              fontSize: 'var(--text-11)',
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
            }}
          >
            <InfoIcon size={13} style={{ color: 'var(--accent)', flexShrink: 0, marginTop: '2px' }} />
            <span>{t('transitions.no_clips_hint')}</span>
          </div>
        )}
      </div>

      {/* Active Transition Flexible Parameters Card */}
      {targetInfo && activeMeta && currentTransition && (
        <div
          data-testid="transition-settings-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-md)',
          }}
        >
          {/* Active Transition Header + Preview & Clear */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flex: '1 1 auto' }}>
              <TransitionIcon size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 'var(--text-12)',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                {t(activeMeta.nameKey)}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <Tooltip content={t('transitions.preview_btn')}>
                <button
                  type="button"
                  data-testid="transition-preview-btn"
                  onClick={handlePreviewTransition}
                  style={{
                    minHeight: '24px',
                    padding: '2px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: 'var(--accent-muted)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--accent)',
                    fontSize: 'var(--text-11)',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <PlayIcon size={11} />
                  <span>{t('transitions.preview_short')}</span>
                </button>
              </Tooltip>

              <Tooltip content={t('transitions.remove_btn')}>
                <button
                  type="button"
                  aria-label={t('transitions.remove_btn')}
                  data-testid="transition-clear-btn"
                  onClick={() => commitTransition(null, true)}
                  style={{
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* 1. Duration / Speed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                {t('transitions.duration')}
              </span>
              <span
                className="timecode"
                data-testid="transition-duration-readout"
                style={{ fontSize: 'var(--text-11)', fontWeight: 600, color: 'var(--accent)' }}
              >
                {(currentTransition.durationMs / 1000).toFixed(2)}s
              </span>
            </div>

            <div
              onPointerDown={() => {
                dragHistoryRecordedRef.current = false;
              }}
            >
              <Slider
                value={Number((currentTransition.durationMs / 1000).toFixed(2))}
                min={0.1}
                max={3.0}
                step={0.05}
                unit="s"
                hideValue
                onChange={(sec) => {
                  const shouldRecord = !dragHistoryRecordedRef.current;
                  dragHistoryRecordedRef.current = true;
                  commitTransition(
                    { ...currentTransition, durationMs: Math.round(sec * 1000) },
                    shouldRecord
                  );
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {DURATION_PRESETS_MS.map((ms) => {
                const selected = Math.abs(currentTransition.durationMs - ms) < 15;
                return (
                  <button
                    key={ms}
                    type="button"
                    data-testid={`transition-dur-${ms}`}
                    onClick={() => commitTransition({ ...currentTransition, durationMs: ms }, true)}
                    style={{
                      minHeight: '24px',
                      background: selected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--r-sm)',
                      color: selected ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 'var(--text-10)',
                      fontWeight: selected ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {(ms / 1000).toFixed(2).replace(/0$/, '')}s
                  </button>
                );
              })}
            </div>

            {targetInfo.effectiveDurationMs > 0 &&
              targetInfo.effectiveDurationMs + 10 < currentTransition.durationMs && (
                <span style={{ fontSize: 'var(--text-10)', color: 'var(--text-muted)' }}>
                  {t('transitions.clamped_note', {
                    sec: (targetInfo.effectiveDurationMs / 1000).toFixed(2),
                  })}
                </span>
              )}
          </div>

          {/* 2. Direction / Mode (when supported) */}
          {activeMeta.directions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                {t('transitions.direction')}
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {activeMeta.directions.map((dir) => {
                  const isDirSelected =
                    (currentTransition.direction || activeMeta.defaultDirection) === dir;
                  return (
                    <Tooltip key={dir} content={t(`transitions.dir_${dir}`)}>
                      <button
                        type="button"
                        aria-label={t(`transitions.dir_${dir}`)}
                        data-testid={`transition-dir-${dir}`}
                        onClick={() =>
                          commitTransition({ ...currentTransition, direction: dir }, true)
                        }
                        style={{
                          minHeight: '26px',
                          minWidth: '28px',
                          padding: '2px 7px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          background: isDirSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                          border: `1px solid ${isDirSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--r-sm)',
                          color: isDirSelected ? 'var(--accent)' : 'var(--text-primary)',
                          fontSize: 'var(--text-10)',
                          fontWeight: isDirSelected ? 600 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {renderDirectionIcon(dir)}
                        {activeMeta.directions.length <= 2 && (
                          <span>{t(`transitions.dir_${dir}`)}</span>
                        )}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Easing Curve */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
              {t('transitions.easing')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {EASING_OPTIONS.map((ease) => {
                const isEaseSelected = (currentTransition.easing || 'smooth') === ease;
                return (
                  <button
                    key={ease}
                    type="button"
                    data-testid={`transition-ease-${ease}`}
                    onClick={() =>
                      commitTransition({ ...currentTransition, easing: ease }, true)
                    }
                    style={{
                      minHeight: '24px',
                      padding: '2px 7px',
                      background: isEaseSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                      border: `1px solid ${isEaseSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--r-sm)',
                      color: isEaseSelected ? 'var(--accent)' : 'var(--text-primary)',
                      fontSize: 'var(--text-10)',
                      fontWeight: isEaseSelected ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {t(`transitions.ease_${ease}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Edge Softness / Feather (for geometric wipes) */}
          {activeMeta.supportsSoftness && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                  {t('transitions.softness')}
                </span>
                <span className="timecode" style={{ fontSize: 'var(--text-11)', color: 'var(--text-primary)' }}>
                  {Math.round((currentTransition.softness ?? 0.15) * 100)}%
                </span>
              </div>
              <div
                onPointerDown={() => {
                  dragHistoryRecordedRef.current = false;
                }}
              >
                <Slider
                  value={Math.round((currentTransition.softness ?? 0.15) * 100)}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  hideValue
                  onChange={(pct) => {
                    const shouldRecord = !dragHistoryRecordedRef.current;
                    dragHistoryRecordedRef.current = true;
                    commitTransition(
                      { ...currentTransition, softness: pct / 100 },
                      shouldRecord
                    );
                  }}
                />
              </div>
            </div>
          )}

          {/* 5. Dip Color (for color fades) */}
          {activeMeta.supportsColor && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                {t('transitions.dip_color')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {TRANSITION_COLOR_SWATCHES.map((hex) => {
                  const activeHex = (
                    currentTransition.color ||
                    activeMeta.defaultColor ||
                    '#000000'
                  ).toUpperCase();
                  const isHexSelected = activeHex === hex.toUpperCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={hex}
                      onClick={() =>
                        commitTransition({ ...currentTransition, color: hex }, true)
                      }
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: 'var(--r-full)',
                        background: hex,
                        border: isHexSelected
                          ? '2px solid var(--accent)'
                          : '1px solid var(--border-strong)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  );
                })}
                <input
                  type="color"
                  aria-label={t('transitions.dip_color')}
                  value={currentTransition.color || activeMeta.defaultColor || '#000000'}
                  onChange={(e) =>
                    commitTransition({ ...currentTransition, color: e.target.value }, true)
                  }
                  style={{
                    width: '24px',
                    height: '24px',
                    padding: 0,
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-sm)',
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>
          )}

          {/* 6. Audio Transition Mode (between clips) */}
          {targetInfo.mode === 'junction' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
                {t('transitions.audio_mode')}
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {AUDIO_MODES.map((mode) => {
                  const isAudioSelected = (currentTransition.audioMode || 'crossfade') === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      data-testid={`transition-audio-${mode}`}
                      onClick={() =>
                        commitTransition({ ...currentTransition, audioMode: mode }, true)
                      }
                      style={{
                        minHeight: '24px',
                        padding: '2px 4px',
                        background: isAudioSelected ? 'var(--accent-muted)' : 'var(--bg-surface)',
                        border: `1px solid ${isAudioSelected ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        borderRadius: 'var(--r-sm)',
                        color: isAudioSelected ? 'var(--accent)' : 'var(--text-primary)',
                        fontSize: 'var(--text-10)',
                        fontWeight: isAudioSelected ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {t(`transitions.audio_${mode}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Apply to All Cuts button */}
          {junctionItems.length >= 2 && (
            <button
              type="button"
              data-testid="transition-apply-all-btn"
              onClick={() => applyTransitionToAllCuts(currentTransition)}
              style={{
                minHeight: '28px',
                marginTop: '2px',
                padding: '4px 8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-primary)',
                fontSize: 'var(--text-11)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'border-color var(--dur-fast) var(--ease-out)',
              }}
            >
              {t('transitions.apply_all_cuts')}
            </button>
          )}
        </div>
      )}

      {/* Category Filter Pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px',
        }}
      >
        {CATEGORIES.map((cat) => {
          const isCatActive = category === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              data-testid={`transition-cat-${cat.id}`}
              onClick={() => setCategory(cat.id)}
              style={{
                minHeight: '24px',
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                border: `1px solid ${isCatActive ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: isCatActive ? 'var(--accent-muted)' : 'transparent',
                color: isCatActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 'var(--text-10)',
                fontWeight: isCatActive ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              {t(cat.labelKey)}
            </button>
          );
        })}
      </div>

      {/* 2-Column Transition Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-2)',
        }}
      >
        {/* None Card */}
        <button
          type="button"
          data-testid="transition-card-none"
          onClick={() => handleSelectType('none')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: 0,
            background: activeType === 'none' && targetInfo ? 'var(--accent-muted)' : 'var(--bg-elevated)',
            border: `1px solid ${activeType === 'none' && targetInfo ? 'var(--accent)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--r-md)',
            overflow: 'hidden',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              width: '100%',
              aspectRatio: '16/9',
              background: 'var(--bg-inset)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: activeType === 'none' && targetInfo ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            <CloseIcon size={18} />
          </div>
          <div style={{ padding: '5px 7px' }}>
            <span
              style={{
                fontSize: 'var(--text-11)',
                fontWeight: activeType === 'none' && targetInfo ? 600 : 500,
                color: activeType === 'none' && targetInfo ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              {t('transitions.items.none')}
            </span>
          </div>
        </button>

        {filteredCatalog.map((meta) => (
          <TransitionPreviewCard
            key={meta.type}
            meta={meta}
            isSelected={activeType === meta.type}
            disabled={!targetInfo}
            onSelect={handleSelectType}
          />
        ))}
      </div>
    </div>
  );
};
