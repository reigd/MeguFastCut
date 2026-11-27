import type React from 'react';
import {
  Clip,
  ClipTransition,
  TransitionAudioMode,
  TransitionCategory,
  TransitionDirection,
  TransitionEasing,
  TransitionType,
} from './types';

export interface TransitionPresetMeta {
  type: Exclude<TransitionType, 'none'>;
  category: Exclude<TransitionCategory, 'all'>;
  nameKey: string;
  descKey: string;
  directions: TransitionDirection[];
  defaultDirection?: TransitionDirection;
  supportsSoftness: boolean;
  supportsColor: boolean;
  defaultColor?: string;
}

export const TRANSITION_CATALOG: TransitionPresetMeta[] = [
  // Light & Fades
  {
    type: 'fadeblack',
    category: 'light',
    nameKey: 'transitions.items.fadeblack',
    descKey: 'transitions.items_desc.fadeblack',
    directions: [],
    supportsSoftness: false,
    supportsColor: true,
    defaultColor: '#000000',
  },
  {
    type: 'fadewhite',
    category: 'light',
    nameKey: 'transitions.items.fadewhite',
    descKey: 'transitions.items_desc.fadewhite',
    directions: [],
    supportsSoftness: false,
    supportsColor: true,
    defaultColor: '#FFFFFF',
  },
  {
    type: 'dipcolor',
    category: 'light',
    nameKey: 'transitions.items.dipcolor',
    descKey: 'transitions.items_desc.dipcolor',
    directions: [],
    supportsSoftness: false,
    supportsColor: true,
    defaultColor: '#0F172A',
  },
  {
    type: 'fade',
    category: 'light',
    nameKey: 'transitions.items.fade',
    descKey: 'transitions.items_desc.fade',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'hblur',
    category: 'light',
    nameKey: 'transitions.items.hblur',
    descKey: 'transitions.items_desc.hblur',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'fadegrays',
    category: 'light',
    nameKey: 'transitions.items.fadegrays',
    descKey: 'transitions.items_desc.fadegrays',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },

  // Motion
  {
    type: 'smooth',
    category: 'motion',
    nameKey: 'transitions.items.smooth',
    descKey: 'transitions.items_desc.smooth',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'slide',
    category: 'motion',
    nameKey: 'transitions.items.slide',
    descKey: 'transitions.items_desc.slide',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'cover',
    category: 'motion',
    nameKey: 'transitions.items.cover',
    descKey: 'transitions.items_desc.cover',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'reveal',
    category: 'motion',
    nameKey: 'transitions.items.reveal',
    descKey: 'transitions.items_desc.reveal',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'zoomin',
    category: 'motion',
    nameKey: 'transitions.items.zoomin',
    descKey: 'transitions.items_desc.zoomin',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },

  // Geometric
  {
    type: 'wipe',
    category: 'geometric',
    nameKey: 'transitions.items.wipe',
    descKey: 'transitions.items_desc.wipe',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: true,
    supportsColor: false,
  },
  {
    type: 'diagwipe',
    category: 'geometric',
    nameKey: 'transitions.items.diagwipe',
    descKey: 'transitions.items_desc.diagwipe',
    directions: ['tl', 'tr', 'bl', 'br'],
    defaultDirection: 'tl',
    supportsSoftness: true,
    supportsColor: false,
  },
  {
    type: 'circle',
    category: 'geometric',
    nameKey: 'transitions.items.circle',
    descKey: 'transitions.items_desc.circle',
    directions: ['open', 'close'],
    defaultDirection: 'open',
    supportsSoftness: true,
    supportsColor: false,
  },
  {
    type: 'shutter',
    category: 'geometric',
    nameKey: 'transitions.items.shutter',
    descKey: 'transitions.items_desc.shutter',
    directions: ['horzopen', 'horzclose', 'vertopen', 'vertclose'],
    defaultDirection: 'horzopen',
    supportsSoftness: true,
    supportsColor: false,
  },
  {
    type: 'squeeze',
    category: 'geometric',
    nameKey: 'transitions.items.squeeze',
    descKey: 'transitions.items_desc.squeeze',
    directions: ['horizontal', 'vertical'],
    defaultDirection: 'horizontal',
    supportsSoftness: false,
    supportsColor: false,
  },

  // Creative
  {
    type: 'dissolve',
    category: 'creative',
    nameKey: 'transitions.items.dissolve',
    descKey: 'transitions.items_desc.dissolve',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'pixelize',
    category: 'creative',
    nameKey: 'transitions.items.pixelize',
    descKey: 'transitions.items_desc.pixelize',
    directions: [],
    supportsSoftness: false,
    supportsColor: false,
  },
  {
    type: 'slice',
    category: 'creative',
    nameKey: 'transitions.items.slice',
    descKey: 'transitions.items_desc.slice',
    directions: ['left', 'right', 'up', 'down'],
    defaultDirection: 'left',
    supportsSoftness: false,
    supportsColor: false,
  },
];

export const TRANSITION_COLOR_SWATCHES = [
  '#000000',
  '#FFFFFF',
  '#0F172A',
  '#EB5E28',
  '#DC2626',
];

export function getTransitionMeta(type: TransitionType): TransitionPresetMeta | undefined {
  if (type === 'none') return undefined;
  return TRANSITION_CATALOG.find((m) => m.type === type);
}

export function isActiveTransition(tr?: ClipTransition | null): tr is ClipTransition {
  return Boolean(tr && tr.type !== 'none' && Number.isFinite(tr.durationMs) && tr.durationMs >= 50);
}

export function hasAnyActiveTransition(clips: Clip[]): boolean {
  return clips.some(
    (c) => c.enabled && (isActiveTransition(c.transitionIn) || isActiveTransition(c.transitionOut))
  );
}

export function createDefaultTransition(
  type: TransitionType,
  prev?: ClipTransition | null
): ClipTransition {
  if (type === 'none') {
    return { type: 'none', durationMs: 0 };
  }

  const meta = getTransitionMeta(type);
  const durationMs =
    prev && prev.type !== 'none' && prev.durationMs >= 100 && prev.durationMs <= 3000
      ? prev.durationMs
      : 600;
  const easing: TransitionEasing = prev?.easing || 'smooth';
  const audioMode: TransitionAudioMode = prev?.audioMode || 'crossfade';
  const softness =
    meta?.supportsSoftness
      ? prev?.softness !== undefined
        ? prev.softness
        : 0.15
      : 0;

  let direction: TransitionDirection | undefined;
  if (meta && meta.directions.length > 0) {
    direction =
      prev?.direction && meta.directions.includes(prev.direction)
        ? prev.direction
        : meta.defaultDirection || meta.directions[0];
  }

  const color = meta?.supportsColor
    ? type === 'fadeblack'
      ? '#000000'
      : type === 'fadewhite'
        ? '#FFFFFF'
        : prev?.color || meta.defaultColor || '#000000'
    : undefined;

  return {
    type,
    durationMs,
    direction,
    easing,
    softness,
    color,
    audioMode,
  };
}

export function evaluateEasing(p: number, easing: TransitionEasing = 'smooth'): number {
  const t = Math.max(0, Math.min(1, p));
  switch (easing) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'sharp':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'smooth':
    default:
      return t * t * (3 - 2 * t);
  }
}

export interface MainClipTiming {
  clip: Clip;
  index: number;
  rawStartMs: number;
  durationMs: number;
  gapBeforeMs: number;
  isContiguousWithPrev: boolean;
  overlapInMs: number;
  introDurationMs: number;
  outroDurationMs: number;
  playStartMs: number;
  playEndMs: number;
  visualStartMs: number;
  visualEndMs: number;
}

export interface MainTrackTimingResult {
  items: MainClipTiming[];
  totalMainDurationMs: number;
}

function getLocalClipTrackIndex(clip: Pick<Clip, 'trackIndex'>): number {
  const raw = clip.trackIndex ?? 0;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

function getLocalClipDurationMs(clip: Pick<Clip, 'inMs' | 'outMs' | 'speed'>): number {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
  return Math.max(0, Math.round((clip.outMs - clip.inMs) / speed));
}

export function computeMainTrackTiming(clips: Clip[]): MainTrackTimingResult {
  const enabledMain = clips.filter((c) => c.enabled && getLocalClipTrackIndex(c) === 0);
  if (enabledMain.length === 0) {
    return { items: [], totalMainDurationMs: 0 };
  }

  const hasExplicitStart = enabledMain.some((c) => c.startMs !== undefined);
  const sorted = hasExplicitStart
    ? [...enabledMain].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
    : [...enabledMain];

  const items: MainClipTiming[] = [];
  let rawCursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    const dur = getLocalClipDurationMs(clip);
    const rawStart = clip.startMs !== undefined ? Math.max(0, Math.round(clip.startMs)) : rawCursor;
    const gapBefore = i === 0 ? rawStart : Math.max(0, rawStart - rawCursor);
    rawCursor = Math.max(rawCursor, rawStart + dur);

    const prev = i > 0 ? items[i - 1] : undefined;
    const isContiguousWithPrev = Boolean(prev && gapBefore <= 5);

    let overlapInMs = 0;
    let introDurationMs = 0;

    if (isContiguousWithPrev && prev && isActiveTransition(clip.transitionIn)) {
      const prevUsedStart = prev.overlapInMs > 0 ? prev.overlapInMs : prev.introDurationMs;
      const maxFromPrev = Math.max(
        0,
        Math.min(Math.floor(prev.durationMs * 0.8), prev.durationMs - prevUsedStart - 60)
      );
      const maxFromCurr = Math.max(0, Math.min(Math.floor(dur * 0.8), dur - 60));
      const maxAllowed = Math.min(maxFromPrev, maxFromCurr);
      const clamped = Math.min(Math.round(clip.transitionIn.durationMs), maxAllowed);
      overlapInMs = clamped >= 50 ? clamped : 0;
    } else if (!isContiguousWithPrev && isActiveTransition(clip.transitionIn)) {
      const maxAllowed = Math.max(0, dur - 60);
      const clamped = Math.min(Math.round(clip.transitionIn.durationMs), maxAllowed);
      introDurationMs = clamped >= 50 ? clamped : 0;
    }

    const playStartMs =
      i === 0
        ? gapBefore
        : isContiguousWithPrev && prev
          ? prev.playEndMs - overlapInMs
          : (prev?.playEndMs ?? 0) + gapBefore;
    const playEndMs = playStartMs + dur;

    items.push({
      clip,
      index: i,
      rawStartMs: rawStart,
      durationMs: dur,
      gapBeforeMs: gapBefore,
      isContiguousWithPrev,
      overlapInMs,
      introDurationMs,
      outroDurationMs: 0,
      playStartMs,
      playEndMs,
      visualStartMs: playStartMs,
      visualEndMs: playEndMs,
    });
  }

  // Resolve outroDurationMs (only at the end of a contiguous run) and single-lane visual boxes
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const next = items[i + 1];
    const isEndOfRun = !next || !next.isContiguousWithPrev;

    if (isEndOfRun && isActiveTransition(item.clip.transitionOut)) {
      const usedStart = item.overlapInMs > 0 ? item.overlapInMs : item.introDurationMs;
      const maxAllowed = Math.max(0, item.durationMs - usedStart - 60);
      const clamped = Math.min(Math.round(item.clip.transitionOut.durationMs), maxAllowed);
      item.outroDurationMs = clamped >= 50 ? clamped : 0;
    }

    const halfIn = item.isContiguousWithPrev ? Math.round(item.overlapInMs / 2) : 0;
    const halfOut = next && next.isContiguousWithPrev ? Math.round(next.overlapInMs / 2) : 0;
    item.visualStartMs = item.playStartMs + halfIn;
    item.visualEndMs = Math.max(item.visualStartMs + 20, item.playEndMs - halfOut);
  }

  const totalMainDurationMs = items.length > 0 ? items[items.length - 1].playEndMs : 0;
  return { items, totalMainDurationMs };
}

export interface TransitionPreviewResult {
  outStyle: React.CSSProperties;
  inStyle: React.CSSProperties;
  dipOverlayColor: string | null;
  dipOverlayOpacity: number;
  outAudioGain: number;
  inAudioGain: number;
}

function getLinearWipeMask(
  axis: 'x' | 'y',
  reverse: boolean,
  easedP: number,
  softness: number
): string | undefined {
  if (softness <= 0.01) return undefined;
  const f = Math.min(0.45, softness * 0.35);
  const edge = easedP * (1 + f);
  const s0 = Math.max(0, edge - f) * 100;
  const s1 = Math.min(1, edge) * 100;
  const deg =
    axis === 'x' ? (reverse ? '270deg' : '90deg') : reverse ? '0deg' : '180deg';
  return `linear-gradient(${deg}, rgba(0,0,0,1) ${s0.toFixed(1)}%, rgba(0,0,0,0) ${s1.toFixed(1)}%)`;
}

export function computeTransitionPreviewLayers(
  transition: ClipTransition,
  rawProgress: number,
  mode: 'junction' | 'intro' | 'outro'
): TransitionPreviewResult {
  const p = Math.max(0, Math.min(1, rawProgress));
  const e = evaluateEasing(p, transition.easing || 'smooth');
  const softness = Math.max(0, Math.min(1, transition.softness ?? 0));
  const dir = transition.direction;
  const audioMode = transition.audioMode || 'crossfade';

  let outAudioGain = 1;
  let inAudioGain = 1;
  if (mode === 'intro') {
    outAudioGain = 0;
    inAudioGain = p;
  } else if (mode === 'outro') {
    outAudioGain = 1 - p;
    inAudioGain = 0;
  } else if (audioMode === 'dip') {
    outAudioGain = p < 0.5 ? 1 - p * 2 : 0;
    inAudioGain = p > 0.5 ? (p - 0.5) * 2 : 0;
  } else if (audioMode === 'cut') {
    outAudioGain = p < 0.5 ? 1 : 0;
    inAudioGain = p >= 0.5 ? 1 : 0;
  } else {
    outAudioGain = Math.cos(p * Math.PI * 0.5);
    inAudioGain = Math.sin(p * Math.PI * 0.5);
  }

  let outStyle: React.CSSProperties = { opacity: 1 };
  let inStyle: React.CSSProperties = { opacity: 1 };
  let dipOverlayColor: string | null = null;
  let dipOverlayOpacity = 0;

  switch (transition.type) {
    case 'fadeblack':
    case 'fadewhite':
    case 'dipcolor': {
      const color =
        transition.color ||
        (transition.type === 'fadewhite'
          ? '#FFFFFF'
          : transition.type === 'dipcolor'
            ? '#0F172A'
            : '#000000');
      if (mode === 'intro') {
        outStyle = { opacity: 0 };
        inStyle = { opacity: 1 };
        dipOverlayColor = color;
        dipOverlayOpacity = 1 - e;
      } else if (mode === 'outro') {
        outStyle = { opacity: 1 };
        inStyle = { opacity: 0 };
        dipOverlayColor = color;
        dipOverlayOpacity = e;
      } else {
        outStyle = { opacity: e < 0.5 ? 1 : 0 };
        inStyle = { opacity: e >= 0.5 ? 1 : 0 };
        dipOverlayColor = color;
        dipOverlayOpacity = e < 0.5 ? e * 2 : (1 - e) * 2;
      }
      break;
    }

    case 'hblur': {
      const blurAmount = Math.sin(e * Math.PI) * 18;
      if (mode === 'intro') {
        outStyle = { opacity: 0 };
        inStyle = { opacity: e, filter: `blur(${((1 - e) * 18).toFixed(1)}px)` };
      } else if (mode === 'outro') {
        outStyle = { opacity: 1 - e, filter: `blur(${(e * 18).toFixed(1)}px)` };
        inStyle = { opacity: 0 };
      } else {
        outStyle = { opacity: 1 - e, filter: `blur(${blurAmount.toFixed(1)}px)` };
        inStyle = { opacity: e, filter: `blur(${blurAmount.toFixed(1)}px)` };
      }
      break;
    }

    case 'fadegrays': {
      if (mode === 'intro') {
        outStyle = { opacity: 0 };
        inStyle = { opacity: e, filter: `grayscale(${((1 - e) * 100).toFixed(0)}%)` };
      } else if (mode === 'outro') {
        outStyle = { opacity: 1 - e, filter: `grayscale(${(e * 100).toFixed(0)}%)` };
        inStyle = { opacity: 0 };
      } else {
        const gray = Math.sin(e * Math.PI) * 100;
        outStyle = { opacity: 1 - e, filter: `grayscale(${gray.toFixed(0)}%)` };
        inStyle = { opacity: e, filter: `grayscale(${gray.toFixed(0)}%)` };
      }
      break;
    }

    case 'smooth':
    case 'slide': {
      const d = dir || 'left';
      const isHoriz = d === 'left' || d === 'right';
      const sign = d === 'left' || d === 'up' ? -1 : 1;
      const outPos = (e * 100 * sign).toFixed(2);
      const inPos = ((e - 1) * 100 * sign).toFixed(2);
      const blurPx = transition.type === 'smooth' ? (Math.sin(e * Math.PI) * 3.5).toFixed(1) : '0';
      const filter = transition.type === 'smooth' ? `blur(${blurPx}px)` : undefined;
      outStyle = {
        transform: isHoriz ? `translate3d(${outPos}%, 0, 0)` : `translate3d(0, ${outPos}%, 0)`,
        filter,
      };
      inStyle = {
        transform: isHoriz ? `translate3d(${inPos}%, 0, 0)` : `translate3d(0, ${inPos}%, 0)`,
        filter,
      };
      break;
    }

    case 'cover': {
      const d = dir || 'left';
      const isHoriz = d === 'left' || d === 'right';
      const sign = d === 'left' || d === 'up' ? -1 : 1;
      const inPos = ((e - 1) * 100 * sign).toFixed(2);
      outStyle = { opacity: 1 };
      inStyle = {
        transform: isHoriz ? `translate3d(${inPos}%, 0, 0)` : `translate3d(0, ${inPos}%, 0)`,
      };
      break;
    }

    case 'reveal': {
      const d = dir || 'left';
      const isHoriz = d === 'left' || d === 'right';
      const sign = d === 'left' || d === 'up' ? -1 : 1;
      const outPos = (e * 100 * sign).toFixed(2);
      inStyle = { opacity: 1 };
      outStyle = {
        transform: isHoriz ? `translate3d(${outPos}%, 0, 0)` : `translate3d(0, ${outPos}%, 0)`,
        zIndex: 2,
      };
      break;
    }

    case 'zoomin': {
      if (mode === 'intro') {
        outStyle = { opacity: 0 };
        inStyle = { opacity: e, transform: `scale(${(0.75 + 0.25 * e).toFixed(3)})` };
      } else if (mode === 'outro') {
        outStyle = { opacity: 1 - e, transform: `scale(${(1 + 0.35 * e).toFixed(3)})` };
        inStyle = { opacity: 0 };
      } else {
        outStyle = {
          opacity: Math.max(0, 1 - e * 1.15),
          transform: `scale(${(1 + 0.45 * e).toFixed(3)})`,
        };
        inStyle = {
          opacity: e,
          transform: `scale(${(0.75 + 0.25 * e).toFixed(3)})`,
        };
      }
      break;
    }

    case 'wipe': {
      const d = dir || 'left';
      const pct = (e * 100).toFixed(2);
      const mask =
        d === 'left'
          ? getLinearWipeMask('x', true, e, softness)
          : d === 'right'
            ? getLinearWipeMask('x', false, e, softness)
            : d === 'up'
              ? getLinearWipeMask('y', true, e, softness)
              : getLinearWipeMask('y', false, e, softness);

      if (mask) {
        inStyle = { maskImage: mask, WebkitMaskImage: mask };
      } else {
        const clipPath =
          d === 'left'
            ? `inset(0 0 0 ${(100 - e * 100).toFixed(2)}%)`
            : d === 'right'
              ? `inset(0 ${(100 - e * 100).toFixed(2)}% 0 0)`
              : d === 'up'
                ? `inset(${(100 - e * 100).toFixed(2)}% 0 0 0)`
                : `inset(0 0 ${(100 - e * 100).toFixed(2)}% 0)`;
        inStyle = { clipPath, opacity: 1 };
      }
      if (mode === 'intro') {
        outStyle = { opacity: 0 };
      } else if (mode === 'outro') {
        inStyle = { opacity: 0 };
        const invPct = ((1 - e) * 100).toFixed(2);
        outStyle = {
          clipPath:
            d === 'left'
              ? `inset(0 ${pct}% 0 0)`
              : d === 'right'
                ? `inset(0 0 0 ${pct}%)`
                : `inset(0 0 ${invPct}% 0)`,
        };
      }
      break;
    }

    case 'diagwipe': {
      const d = dir || 'tl';
      const f = softness > 0.01 ? Math.min(0.4, softness * 0.3) : 0.002;
      const edge = e * (1 + f);
      const s0 = Math.max(0, edge - f) * 100;
      const s1 = Math.min(1, edge) * 100;
      const angle =
        d === 'tl' ? '135deg' : d === 'tr' ? '225deg' : d === 'bl' ? '45deg' : '315deg';
      const mask = `linear-gradient(${angle}, rgba(0,0,0,1) ${s0.toFixed(1)}%, rgba(0,0,0,0) ${s1.toFixed(1)}%)`;
      inStyle = { maskImage: mask, WebkitMaskImage: mask };
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') {
        inStyle = { opacity: 0 };
        outStyle = { opacity: 1 - e };
      }
      break;
    }

    case 'circle': {
      const isClose = dir === 'close';
      const radiusPct = (isClose ? (1 - e) * 75 : e * 75).toFixed(2);
      if (softness > 0.01) {
        const feather = Math.max(1, softness * 22);
        const rInner = Math.max(0, parseFloat(radiusPct) - feather);
        const mask = isClose
          ? `radial-gradient(circle at center, rgba(0,0,0,1) ${rInner.toFixed(1)}%, rgba(0,0,0,0) ${radiusPct}%)`
          : `radial-gradient(circle at center, rgba(0,0,0,1) ${rInner.toFixed(1)}%, rgba(0,0,0,0) ${radiusPct}%)`;
        if (isClose) {
          outStyle = { maskImage: mask, WebkitMaskImage: mask, zIndex: 2 };
          inStyle = { opacity: 1 };
        } else {
          inStyle = { maskImage: mask, WebkitMaskImage: mask };
        }
      } else {
        if (isClose) {
          outStyle = { clipPath: `circle(${radiusPct}% at 50% 50%)`, zIndex: 2 };
          inStyle = { opacity: 1 };
        } else {
          inStyle = { clipPath: `circle(${radiusPct}% at 50% 50%)` };
        }
      }
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') {
        inStyle = { opacity: 0 };
        outStyle = { clipPath: `circle(${((1 - e) * 75).toFixed(2)}% at 50% 50%)` };
      }
      break;
    }

    case 'shutter': {
      const d = dir || 'horzopen';
      const isVert = d === 'vertopen' || d === 'vertclose';
      const isClose = d === 'horzclose' || d === 'vertclose';
      const halfClosed = isClose ? e * 50 : (1 - e) * 50;
      if (isClose) {
        outStyle = {
          clipPath: isVert
            ? `inset(${halfClosed.toFixed(2)}% 0 ${halfClosed.toFixed(2)}% 0)`
            : `inset(0 ${halfClosed.toFixed(2)}% 0 ${halfClosed.toFixed(2)}%)`,
          zIndex: 2,
        };
        inStyle = { opacity: 1 };
      } else {
        inStyle = {
          clipPath: isVert
            ? `inset(${halfClosed.toFixed(2)}% 0 ${halfClosed.toFixed(2)}% 0)`
            : `inset(0 ${halfClosed.toFixed(2)}% 0 ${halfClosed.toFixed(2)}%)`,
        };
      }
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') {
        inStyle = { opacity: 0 };
        const closePct = (e * 50).toFixed(2);
        outStyle = {
          clipPath: isVert ? `inset(${closePct}% 0 ${closePct}% 0)` : `inset(0 ${closePct}% 0 ${closePct}%)`,
        };
      }
      break;
    }

    case 'squeeze': {
      const isVert = dir === 'vertical';
      const outScale = Math.max(0.01, 1 - e).toFixed(3);
      const inScale = Math.max(0.01, e).toFixed(3);
      outStyle = {
        transform: isVert ? `scaleY(${outScale})` : `scaleX(${outScale})`,
        transformOrigin: isVert ? 'top center' : 'left center',
      };
      inStyle = {
        transform: isVert ? `scaleY(${inScale})` : `scaleX(${inScale})`,
        transformOrigin: isVert ? 'bottom center' : 'right center',
      };
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') inStyle = { opacity: 0 };
      break;
    }

    case 'dissolve':
    case 'pixelize': {
      const blur = transition.type === 'pixelize' ? Math.sin(e * Math.PI) * 8 : 0;
      const contrast = transition.type === 'dissolve' ? 100 + Math.sin(e * Math.PI) * 28 : 100;
      outStyle = {
        opacity: 1 - e,
        filter: blur > 0 ? `blur(${blur.toFixed(1)}px)` : `contrast(${contrast.toFixed(0)}%)`,
      };
      inStyle = {
        opacity: e,
        filter: blur > 0 ? `blur(${blur.toFixed(1)}px)` : `contrast(${contrast.toFixed(0)}%)`,
      };
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') inStyle = { opacity: 0 };
      break;
    }

    case 'slice': {
      const d = dir || 'left';
      const isHoriz = d === 'left' || d === 'right';
      const offset = Math.sin(e * Math.PI) * 8;
      const pct = ((1 - e) * 100).toFixed(1);
      outStyle = {
        opacity: 1 - e,
        transform: isHoriz
          ? `translate3d(${(d === 'left' ? -offset : offset).toFixed(1)}px, 0, 0)`
          : `translate3d(0, ${(d === 'up' ? -offset : offset).toFixed(1)}px, 0)`,
      };
      inStyle = {
        clipPath: isHoriz
          ? d === 'left'
            ? `inset(0 0 0 ${pct}%)`
            : `inset(0 ${pct}% 0 0)`
          : d === 'up'
            ? `inset(${pct}% 0 0 0)`
            : `inset(0 0 ${pct}% 0)`,
      };
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') inStyle = { opacity: 0 };
      break;
    }

    case 'fade':
    default: {
      outStyle = { opacity: 1 - e };
      inStyle = { opacity: e };
      if (mode === 'intro') outStyle = { opacity: 0 };
      if (mode === 'outro') inStyle = { opacity: 0 };
      break;
    }
  }

  return {
    outStyle,
    inStyle,
    dipOverlayColor,
    dipOverlayOpacity,
    outAudioGain,
    inAudioGain,
  };
}
