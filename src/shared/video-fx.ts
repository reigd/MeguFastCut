import type { Clip, VideoAdjustments, VideoFxCategory } from './types.ts';

export type VideoAdjustmentKey = keyof VideoAdjustments;
export type VideoFxSectionKey = Exclude<VideoFxCategory, 'all'>;

export interface VideoParamSpec {
  key: VideoAdjustmentKey;
  category: VideoFxSectionKey;
  labelKey: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  bipolar: boolean;
  unit: string;
  formatValue: (v: number) => string;
}

export interface VideoLookPreset {
  id: string;
  labelKey: string;
  values: Partial<VideoAdjustments>;
}

export interface PreviewFilterSpec {
  hasSvgFilter: boolean;
  aberrationPx: number;
  colorMatrixValues: string | null;
  toneTableValues: string | null;
  denoiseMix: number;
  denoiseSigma: number;
  clarityAmount: number;
  clarityRadius: number;
  sharpnessKernel: string | null;
  blurSigma: number;
  opacityFactor: number;
  vignetteCss: string | null;
  grainOpacity: number;
}

export const DEFAULT_VIDEO_ADJUSTMENTS: Readonly<VideoAdjustments> = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  gamma: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  hue: 0,
  sharpness: 0,
  clarity: 0,
  denoise: 0,
  deband: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  blur: 0,
  aberration: 0,
  opacity: 100,
};

function formatSigned(v: number): string {
  const rounded = Math.round(v);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatPercent(v: number): string {
  return `${Math.round(v)}%`;
}

function formatDegrees(v: number): string {
  const rounded = Math.round(v);
  return rounded > 0 ? `+${rounded}°` : `${rounded}°`;
}

export const VIDEO_PARAM_SPECS: readonly VideoParamSpec[] = [
  // Light & Tone (8)
  {
    key: 'exposure',
    category: 'light',
    labelKey: 'video_edit.params.exposure',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'brightness',
    category: 'light',
    labelKey: 'video_edit.params.brightness',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'contrast',
    category: 'light',
    labelKey: 'video_edit.params.contrast',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'highlights',
    category: 'light',
    labelKey: 'video_edit.params.highlights',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'shadows',
    category: 'light',
    labelKey: 'video_edit.params.shadows',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'whites',
    category: 'light',
    labelKey: 'video_edit.params.whites',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'blacks',
    category: 'light',
    labelKey: 'video_edit.params.blacks',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'gamma',
    category: 'light',
    labelKey: 'video_edit.params.gamma',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  // Color & White Balance (5)
  {
    key: 'temperature',
    category: 'color',
    labelKey: 'video_edit.params.temperature',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'tint',
    category: 'color',
    labelKey: 'video_edit.params.tint',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'saturation',
    category: 'color',
    labelKey: 'video_edit.params.saturation',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'vibrance',
    category: 'color',
    labelKey: 'video_edit.params.vibrance',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'hue',
    category: 'color',
    labelKey: 'video_edit.params.hue',
    min: -180,
    max: 180,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '°',
    formatValue: formatDegrees,
  },
  // Detail & Cleanup (4)
  {
    key: 'sharpness',
    category: 'detail',
    labelKey: 'video_edit.params.sharpness',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'clarity',
    category: 'detail',
    labelKey: 'video_edit.params.clarity',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'denoise',
    category: 'detail',
    labelKey: 'video_edit.params.denoise',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'deband',
    category: 'detail',
    labelKey: 'video_edit.params.deband',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  // Optics & Effects (6)
  {
    key: 'fade',
    category: 'effects',
    labelKey: 'video_edit.params.fade',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'vignette',
    category: 'effects',
    labelKey: 'video_edit.params.vignette',
    min: -100,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: true,
    unit: '',
    formatValue: formatSigned,
  },
  {
    key: 'grain',
    category: 'effects',
    labelKey: 'video_edit.params.grain',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'blur',
    category: 'effects',
    labelKey: 'video_edit.params.blur',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'aberration',
    category: 'effects',
    labelKey: 'video_edit.params.aberration',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 0,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
  {
    key: 'opacity',
    category: 'effects',
    labelKey: 'video_edit.params.opacity',
    min: 0,
    max: 100,
    step: 1,
    defaultValue: 100,
    bipolar: false,
    unit: '%',
    formatValue: formatPercent,
  },
];

const SPEC_MAP: Record<VideoAdjustmentKey, VideoParamSpec> = VIDEO_PARAM_SPECS.reduce(
  (acc, spec) => {
    acc[spec.key] = spec;
    return acc;
  },
  {} as Record<VideoAdjustmentKey, VideoParamSpec>
);

export const VIDEO_LOOK_PRESETS: readonly VideoLookPreset[] = [
  {
    id: 'original',
    labelKey: 'video_edit.presets.original',
    values: {},
  },
  {
    id: 'clean_game',
    labelKey: 'video_edit.presets.clean_game',
    values: {
      contrast: 12,
      shadows: 14,
      vibrance: 22,
      sharpness: 35,
      clarity: 18,
    },
  },
  {
    id: 'cinema',
    labelKey: 'video_edit.presets.cinema',
    values: {
      contrast: 18,
      highlights: -15,
      shadows: -8,
      blacks: -10,
      temperature: -8,
      saturation: -10,
      vibrance: 16,
      vignette: 26,
      fade: 12,
    },
  },
  {
    id: 'vivid',
    labelKey: 'video_edit.presets.vivid',
    values: {
      exposure: 6,
      contrast: 16,
      whites: 10,
      saturation: 22,
      vibrance: 32,
      clarity: 20,
      sharpness: 20,
    },
  },
  {
    id: 'warm_film',
    labelKey: 'video_edit.presets.warm_film',
    values: {
      contrast: 10,
      highlights: -12,
      temperature: 24,
      tint: 6,
      saturation: -6,
      fade: 22,
      grain: 18,
      vignette: 20,
    },
  },
  {
    id: 'cool_night',
    labelKey: 'video_edit.presets.cool_night',
    values: {
      exposure: -8,
      contrast: 15,
      shadows: 12,
      blacks: -8,
      temperature: -28,
      tint: -6,
      vibrance: 15,
      denoise: 25,
      deband: 30,
    },
  },
  {
    id: 'noir',
    labelKey: 'video_edit.presets.noir',
    values: {
      contrast: 36,
      highlights: 12,
      blacks: -22,
      saturation: -100,
      clarity: 28,
      grain: 22,
      vignette: 34,
    },
  },
  {
    id: 'dreamy',
    labelKey: 'video_edit.presets.dreamy',
    values: {
      exposure: 8,
      highlights: -20,
      shadows: 18,
      temperature: 14,
      clarity: -26,
      fade: 28,
      blur: 8,
      vignette: 14,
    },
  },
];

export function clampVideoAdjustment(key: VideoAdjustmentKey, value: number): number {
  const spec = SPEC_MAP[key];
  if (!Number.isFinite(value)) return spec.defaultValue;
  return Math.max(spec.min, Math.min(spec.max, Math.round(value)));
}

export function resolveClipVideoAdjustments(
  clip?: Pick<Clip, 'sharpness' | 'videoAdjustments'> | null
): VideoAdjustments {
  const raw = clip?.videoAdjustments;
  const result: VideoAdjustments = { ...DEFAULT_VIDEO_ADJUSTMENTS };
  for (const spec of VIDEO_PARAM_SPECS) {
    const k = spec.key;
    if (raw && typeof raw[k] === 'number' && Number.isFinite(raw[k])) {
      result[k] = clampVideoAdjustment(k, raw[k]);
    } else if (k === 'sharpness' && typeof clip?.sharpness === 'number' && Number.isFinite(clip.sharpness)) {
      result.sharpness = clampVideoAdjustment('sharpness', clip.sharpness * 100);
    }
  }
  return result;
}

export function isVideoAdjustmentModified(
  adj: VideoAdjustments,
  key: VideoAdjustmentKey
): boolean {
  return Math.abs(adj[key] - SPEC_MAP[key].defaultValue) > 0.01;
}

export function countActiveVideoAdjustments(
  adj: VideoAdjustments,
  category?: VideoFxSectionKey
): number {
  let count = 0;
  for (const spec of VIDEO_PARAM_SPECS) {
    if (category && spec.category !== category) continue;
    if (Math.abs(adj[spec.key] - spec.defaultValue) > 0.01) {
      count += 1;
    }
  }
  return count;
}

export function hasActiveVideoAdjustments(
  clipOrAdj?: Pick<Clip, 'sharpness' | 'videoAdjustments'> | VideoAdjustments | null
): boolean {
  if (!clipOrAdj) return false;
  const adj =
    'exposure' in clipOrAdj
      ? (clipOrAdj as VideoAdjustments)
      : resolveClipVideoAdjustments(clipOrAdj as Pick<Clip, 'sharpness' | 'videoAdjustments'>);
  return countActiveVideoAdjustments(adj) > 0;
}

export function detectMatchingLookPreset(adj: VideoAdjustments): string | null {
  for (const preset of VIDEO_LOOK_PRESETS) {
    let matches = true;
    for (const spec of VIDEO_PARAM_SPECS) {
      const target = preset.values[spec.key] ?? spec.defaultValue;
      if (Math.abs(adj[spec.key] - target) > 0.01) {
        matches = false;
        break;
      }
    }
    if (matches) return preset.id;
  }
  return null;
}

export interface CustomVideoPreset {
  id: string;
  name: string;
  values: VideoAdjustments;
  createdAt: number;
  updatedAt: number;
}

export function detectMatchingCustomPreset(
  adj: VideoAdjustments,
  presets: readonly CustomVideoPreset[],
): string | null {
  for (const preset of presets) {
    let matches = true;
    for (const spec of VIDEO_PARAM_SPECS) {
      const target = preset.values[spec.key] ?? spec.defaultValue;
      if (Math.abs(adj[spec.key] - target) > 0.01) {
        matches = false;
        break;
      }
    }
    if (matches) return preset.id;
  }
  return null;
}

export function evaluateToneCurveSample(x: number, adj: VideoAdjustments): number {
  let v = Math.max(0, Math.min(1, x));

  // 1. Exposure with soft highlight shoulder roll-off
  const ev = (adj.exposure / 100) * 1.5;
  if (Math.abs(ev) > 1e-4) {
    const g = Math.pow(2, ev);
    if (g > 1) {
      v = (v * g) / (1 + (g - 1) * Math.pow(v, 3) * 0.55);
    } else {
      v = v * g;
    }
  }

  // 2. Brightness linear offset
  if (Math.abs(adj.brightness) > 1e-4) {
    v += (adj.brightness / 100) * 0.32;
  }

  // 3. Contrast pivot around mid-grey 0.5
  if (Math.abs(adj.contrast) > 1e-4) {
    const c =
      adj.contrast >= 0
        ? 1 + (adj.contrast / 100) * 0.85
        : 1 + (adj.contrast / 100) * 0.65;
    v = 0.5 + (v - 0.5) * c;
  }

  // 4. Gamma power curve
  v = Math.max(0, Math.min(1, v));
  if (Math.abs(adj.gamma) > 1e-4) {
    const G = Math.pow(2, (adj.gamma / 100) * 0.75);
    v = v > 0 ? Math.pow(v, 1 / G) : 0;
  }

  // 5. Shadows & Highlights selective bell regions
  const sh = adj.shadows / 100;
  const hl = adj.highlights / 100;
  if (Math.abs(sh) > 1e-4 || Math.abs(hl) > 1e-4) {
    const wS = Math.pow(1 - v, 2) * (0.35 + 2.6 * v);
    const wH = Math.pow(v, 2) * (0.35 + 2.6 * (1 - v));
    v += sh * 0.24 * wS + hl * 0.24 * wH;
    v = Math.max(0, Math.min(1, v));
  }

  // 6. Blacks & Whites endpoint curves
  const bl = adj.blacks / 100;
  const wh = adj.whites / 100;
  if (Math.abs(bl) > 1e-4 || Math.abs(wh) > 1e-4) {
    const wB = Math.pow(1 - v, 3);
    const wW = Math.pow(v, 3);
    v += bl * 0.20 * wB + wh * 0.20 * wW;
    v = Math.max(0, Math.min(1, v));
  }

  // 7. Matte fade black-floor lift
  if (adj.fade > 1e-4) {
    const fd = Math.max(0, Math.min(1, adj.fade / 100));
    const floor = fd * 0.14;
    const ceil = 1.0 - fd * 0.04;
    v = floor + v * (ceil - floor);
  }

  return Math.max(0, Math.min(1, v));
}

export function hasToneCurveAdjustments(adj: VideoAdjustments): boolean {
  return (
    Math.abs(adj.exposure) > 0.01 ||
    Math.abs(adj.brightness) > 0.01 ||
    Math.abs(adj.contrast) > 0.01 ||
    Math.abs(adj.highlights) > 0.01 ||
    Math.abs(adj.shadows) > 0.01 ||
    Math.abs(adj.whites) > 0.01 ||
    Math.abs(adj.blacks) > 0.01 ||
    Math.abs(adj.gamma) > 0.01 ||
    adj.fade > 0.01
  );
}

export function buildToneCurveTableValues(adj: VideoAdjustments, samples = 33): string | null {
  if (!hasToneCurveAdjustments(adj)) return null;
  const vals: string[] = [];
  const denom = Math.max(1, samples - 1);
  for (let i = 0; i < samples; i++) {
    const x = i / denom;
    const y = evaluateToneCurveSample(x, adj);
    vals.push(y.toFixed(4));
  }
  return vals.join(' ');
}

function mulMat3(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function computeColorMatrix3x3(
  adj: VideoAdjustments,
  includeVibranceAssist: boolean
): [number, number, number, number, number, number, number, number, number] | null {
  const hasMatrix =
    Math.abs(adj.temperature) > 0.01 ||
    Math.abs(adj.tint) > 0.01 ||
    Math.abs(adj.saturation) > 0.01 ||
    Math.abs(adj.hue) > 0.01 ||
    (includeVibranceAssist && Math.abs(adj.vibrance) > 0.01);

  if (!hasMatrix) return null;

  const LR = 0.2126;
  const LG = 0.7152;
  const LB = 0.0722;

  // 1. White balance diagonal (luma-preserving)
  const temp = adj.temperature / 100;
  const tn = adj.tint / 100;
  const rawR = Math.max(0.1, 1 + 0.22 * temp + 0.09 * tn);
  const rawG = Math.max(0.1, 1 + 0.02 * temp - 0.14 * tn);
  const rawB = Math.max(0.1, 1 - 0.22 * temp + 0.09 * tn);
  const luma = Math.max(0.2, LR * rawR + LG * rawG + LB * rawB);
  const gR = rawR / luma;
  const gG = rawG / luma;
  const gB = rawB / luma;
  const mWb = [gR, 0, 0, 0, gG, 0, 0, 0, gB];

  // 2. Saturation (+ preview vibrance assist)
  const sBase = Math.max(0, 1 + adj.saturation / 100);
  const s =
    includeVibranceAssist && Math.abs(adj.vibrance) > 0.01 && sBase > 0
      ? Math.max(0, sBase * (1 + (adj.vibrance / 100) * 0.55))
      : sBase;
  const invS = 1 - s;
  const mSat = [
    LR * invS + s,
    LG * invS,
    LB * invS,
    LR * invS,
    LG * invS + s,
    LB * invS,
    LR * invS,
    LG * invS,
    LB * invS + s,
  ];

  // 3. Hue rotation (W3C SVG hueRotate matrix)
  const rad = (adj.hue * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const mHue = [
    LR + cosA * (1 - LR) + sinA * -LR,
    LG + cosA * -LG + sinA * -LG,
    LB + cosA * -LB + sinA * (1 - LB),
    LR + cosA * -LR + sinA * 0.143,
    LG + cosA * (1 - LG) + sinA * 0.14,
    LB + cosA * -LB + sinA * -0.283,
    LR + cosA * -LR + sinA * -(1 - LR),
    LG + cosA * -LG + sinA * LG,
    LB + cosA * (1 - LB) + sinA * LB,
  ];

  const combined = mulMat3(mHue, mulMat3(mSat, mWb));
  return [
    Math.max(-2, Math.min(2, combined[0])),
    Math.max(-2, Math.min(2, combined[1])),
    Math.max(-2, Math.min(2, combined[2])),
    Math.max(-2, Math.min(2, combined[3])),
    Math.max(-2, Math.min(2, combined[4])),
    Math.max(-2, Math.min(2, combined[5])),
    Math.max(-2, Math.min(2, combined[6])),
    Math.max(-2, Math.min(2, combined[7])),
    Math.max(-2, Math.min(2, combined[8])),
  ];
}

export function buildSvgColorMatrixValues(adj: VideoAdjustments): string | null {
  const m = computeColorMatrix3x3(adj, true);
  if (!m) return null;
  const f = (n: number) => n.toFixed(4);
  return `${f(m[0])} ${f(m[1])} ${f(m[2])} 0 0 ${f(m[3])} ${f(m[4])} ${f(m[5])} 0 0 ${f(m[6])} ${f(m[7])} ${f(m[8])} 0 0 0 0 0 1 0`;
}

export function computePreviewFilterSpec(
  adj: VideoAdjustments,
  refWidth: number,
  refHeight: number
): PreviewFilterSpec {
  const safeW = Math.max(1, refWidth);
  const safeH = Math.max(1, refHeight);

  const aberrationPx =
    adj.aberration > 0.01
      ? Number(((adj.aberration / 100) * 6 * (safeW / 1920)).toFixed(2))
      : 0;

  const colorMatrixValues = buildSvgColorMatrixValues(adj);
  const toneTableValues = buildToneCurveTableValues(adj, 33);

  const denoiseMix = adj.denoise > 0.01 ? Number(((adj.denoise / 100) * 0.48).toFixed(3)) : 0;
  const denoiseSigma =
    adj.denoise > 0.01
      ? Number(((0.55 + (adj.denoise / 100) * 1.1) * (safeH / 1080)).toFixed(2))
      : 0;

  const clarityAmount =
    Math.abs(adj.clarity) > 0.01
      ? Number(
          (adj.clarity >= 0
            ? (adj.clarity / 100) * 0.55
            : (adj.clarity / 100) * 0.42
          ).toFixed(3)
        )
      : 0;
  const clarityRadius = Number(Math.max(1.5, 6 * (safeH / 1080)).toFixed(2));

  let sharpnessKernel: string | null = null;
  if (adj.sharpness > 0.1) {
    const k = Number(((adj.sharpness / 100) * 0.65).toFixed(4));
    const center = Number((1 + 4 * k).toFixed(4));
    sharpnessKernel = `0 ${-k} 0 ${-k} ${center} ${-k} 0 ${-k} 0`;
  }

  const blurSigma =
    adj.blur > 0.01
      ? Number(Math.min(120, Math.max(0.15, (adj.blur / 100) * 18 * (safeH / 1080))).toFixed(2))
      : 0;

  const hasSvgFilter =
    aberrationPx > 0.05 ||
    colorMatrixValues !== null ||
    toneTableValues !== null ||
    denoiseMix > 0.001 ||
    Math.abs(clarityAmount) > 0.001 ||
    sharpnessKernel !== null ||
    blurSigma > 0.05;

  const opacityFactor = Math.max(0, Math.min(1, adj.opacity / 100));

  let vignetteCss: string | null = null;
  if (Math.abs(adj.vignette) > 0.01) {
    const strength = Math.min(1, Math.abs(adj.vignette) / 100);
    const alpha = (strength * 0.82).toFixed(3);
    const midAlpha = (strength * 0.28).toFixed(3);
    const rgb = adj.vignette >= 0 ? '0, 0, 0' : '255, 255, 255';
    const innerStop = Math.round(52 - strength * 18);
    vignetteCss = `radial-gradient(ellipse at center, rgba(${rgb}, 0) ${innerStop}%, rgba(${rgb}, ${midAlpha}) 76%, rgba(${rgb}, ${alpha}) 100%)`;
  }

  const grainOpacity =
    adj.grain > 0.01 ? Number(((adj.grain / 100) * 0.38).toFixed(3)) : 0;

  return {
    hasSvgFilter,
    aberrationPx,
    colorMatrixValues,
    toneTableValues,
    denoiseMix,
    denoiseSigma,
    clarityAmount,
    clarityRadius,
    sharpnessKernel,
    blurSigma,
    opacityFactor,
    vignetteCss,
    grainOpacity,
  };
}
