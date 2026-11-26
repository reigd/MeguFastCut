import { convertFileSrc } from '@tauri-apps/api/core';
import { Clip, MediaKind, SourceFile } from './types';

export const DEFAULT_IMAGE_DURATION_MS = 5000;
export const MAX_IMAGE_CLIP_DURATION_MS = 3_600_000; // 1 hour max for stretched photo clips

export const VIDEO_EXTENSIONS = [
  'mp4', 'mov', 'mkv', 'webm', 'avi', 'ts', 'm2ts', 'mts', 'm4v', 'flv',
  'wmv', 'mpg', 'mpeg', '3gp', '3g2', 'ogv', 'vob', 'mxf', 'asf', 'rm',
  'rmvb', 'f4v', 'gif', 'apng',
];

export const IMAGE_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'bmp', 'dib', 'tif', 'tiff',
  'heic', 'heif', 'avif', 'jxl', 'jp2', 'j2k', 'jpf', 'tga', 'psd', 'ico',
  'cur', 'exr', 'dds', 'qoi', 'pcx', 'ppm', 'pgm', 'pbm', 'pnm', 'hdr',
  'sgi', 'wbmp', 'svg',
];

export const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'alac',
];

export const ALL_MEDIA_EXTENSIONS = Array.from(
  new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS])
);

const BROWSER_NATIVE_IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'jfif', 'jpe', 'webp', 'gif', 'bmp', 'avif', 'ico', 'svg', 'apng',
]);

const STILL_IMAGE_EXTS = new Set(IMAGE_EXTENSIONS);

export function getFileExtension(path: string): string {
  const clean = path.replace(/\\/g, '/');
  const name = clean.slice(clean.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function isSvgPath(path: string): boolean {
  return getFileExtension(path) === 'svg';
}

export function isBrowserNativeImagePath(path: string): boolean {
  return BROWSER_NATIVE_IMAGE_EXTS.has(getFileExtension(path));
}

export function getSourceMediaKind(source?: SourceFile | null): MediaKind {
  if (!source) return 'video';
  if (source.probe.mediaKind === 'image' || source.probe.mediaKind === 'video' || source.probe.mediaKind === 'audio') {
    return source.probe.mediaKind;
  }
  if (!source.probe.video && source.probe.audio.length > 0) {
    return 'audio';
  }
  const container = (source.probe.container || '').toLowerCase();
  if (container.includes('_pipe') || container === 'image2') {
    return 'image';
  }
  if (STILL_IMAGE_EXTS.has(getFileExtension(source.path)) && source.probe.audio.length === 0 && source.probe.durationMs <= 100) {
    return 'image';
  }
  return 'video';
}

export function isImageSource(source?: SourceFile | null): boolean {
  return getSourceMediaKind(source) === 'image';
}

export function isAudioOnlySource(source?: SourceFile | null): boolean {
  return getSourceMediaKind(source) === 'audio';
}

export function getClipTrackIndex(clip: Pick<Clip, 'trackIndex'>): number {
  const raw = clip.trackIndex ?? 0;
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function getClipDurationMs(clip: Pick<Clip, 'inMs' | 'outMs' | 'speed'>): number {
  const speed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
  return Math.max(0, Math.round((clip.outMs - clip.inMs) / speed));
}

export function getClipStartMs(clip: Clip, clips?: Clip[]): number {
  if (clip.startMs !== undefined && Number.isFinite(clip.startMs)) {
    return Math.max(0, clip.startMs);
  }
  if (!clips) return 0;
  const track = getClipTrackIndex(clip);
  let acc = 0;
  for (const c of clips) {
    if (getClipTrackIndex(c) !== track) continue;
    if (c.id === clip.id) return acc;
    if (c.enabled) {
      const start = c.startMs ?? acc;
      acc = Math.max(acc, start + getClipDurationMs(c));
    }
  }
  return acc;
}

export function getTimelineTotalDurationMs(clips: Clip[]): number {
  let mainAcc = 0;
  let maxEnd = 0;

  for (const clip of clips) {
    if (!clip.enabled) continue;
    const track = getClipTrackIndex(clip);
    const dur = getClipDurationMs(clip);
    const start =
      clip.startMs !== undefined
        ? Math.max(0, clip.startMs)
        : track === 0
          ? mainAcc
          : 0;
    const end = start + dur;
    if (track === 0) {
      mainAcc = Math.max(mainAcc, end);
    }
    maxEnd = Math.max(maxEnd, end);
  }

  return maxEnd;
}

export function getMaxTrackIndex(clips: Clip[]): number {
  let maxTrack = 0;
  for (const c of clips) {
    const t = getClipTrackIndex(c);
    if (t > maxTrack) maxTrack = t;
  }
  return maxTrack;
}

/**
 * Checks whether `[startMs, endMs)` overlaps any existing clip on `trackIndex`.
 */
export function hasTrackOverlap(
  clips: Clip[],
  trackIndex: number,
  startMs: number,
  endMs: number,
  excludeClipId?: string
): boolean {
  const toleranceMs = 2;
  for (const clip of clips) {
    if (clip.id === excludeClipId) continue;
    if (getClipTrackIndex(clip) !== trackIndex) continue;
    const cStart = getClipStartMs(clip, clips);
    const cEnd = cStart + getClipDurationMs(clip);
    if (startMs < cEnd - toleranceMs && endMs > cStart + toleranceMs) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the lowest overlay track (`>= Math.max(1, preferredTrack)`) that does not overlap `[startMs, endMs)`.
 */
export function findFreeOverlayTrack(
  clips: Clip[],
  startMs: number,
  endMs: number,
  preferredTrack = 1,
  excludeClipId?: string
): number {
  let track = Math.max(1, Math.floor(preferredTrack));
  while (hasTrackOverlap(clips, track, startMs, endMs, excludeClipId)) {
    track += 1;
  }
  return track;
}

/**
 * Removes empty intermediate/trailing overlay tracks while preserving V1 (`trackIndex = 0`)
 * and relative z-order of all overlay layers (`1, 2, 3, ...`).
 */
export function compactOverlayTracks(clips: Clip[]): Clip[] {
  const usedOverlayTracks = Array.from(
    new Set(
      clips
        .map((c) => getClipTrackIndex(c))
        .filter((t) => t > 0)
    )
  ).sort((a, b) => a - b);

  if (usedOverlayTracks.length === 0) {
    return clips;
  }

  let needsRemap = false;
  const remap = new Map<number, number>();
  usedOverlayTracks.forEach((oldIdx, idx) => {
    const nextIdx = idx + 1;
    remap.set(oldIdx, nextIdx);
    if (oldIdx !== nextIdx) {
      needsRemap = true;
    }
  });

  if (!needsRemap) {
    return clips;
  }

  return clips.map((c) => {
    const t = getClipTrackIndex(c);
    if (t === 0) return c;
    return { ...c, trackIndex: remap.get(t) ?? t };
  });
}

/**
 * Converts a local filesystem path into a WebView2 asset URL safely.
 * Passes through `data:`, `blob:`, `http:`, and `https:` URLs unchanged, and
 * gracefully returns an empty string when running outside a Tauri WebView.
 */
export function safeConvertFileSrc(path?: string | null): string {
  if (!path) return '';
  if (/^(data:|blob:|https?:)/i.test(path)) {
    return path;
  }
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return '';
  }
  try {
    return convertFileSrc(path);
  } catch {
    return '';
  }
}

/**
 * Rasterizes a local SVG file in WebView2 to a crisp transparent PNG data URL
 * so FFmpeg can probe and composite SVG graphics identically to raster images.
 */
export async function rasterizeSvgFileToPngDataUrl(path: string): Promise<string> {
  const url = safeConvertFileSrc(path);
  if (!url) {
    throw new Error(`Unable to resolve SVG asset URL: ${path}`);
  }
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 1024;
      const natH = img.naturalHeight || 1024;
      const maxDim = Math.max(natW, natH);
      // Upscale small icons/logos so vector artwork stays crisp in 1080p/4K exports
      const scale = maxDim < 1024 ? Math.min(8, 1024 / Math.max(1, maxDim)) : maxDim > 2048 ? 2048 / maxDim : 1;
      const outW = Math.max(2, Math.round((natW * scale) / 2) * 2);
      const outH = Math.max(2, Math.round((natH * scale) / 2) * 2);

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable for SVG rasterization'));
        return;
      }
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(img, 0, 0, outW, outH);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load SVG for rasterization: ${path}`));
    img.src = url;
  });
}
