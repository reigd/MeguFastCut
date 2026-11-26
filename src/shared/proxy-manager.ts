import { invoke } from '@tauri-apps/api/core';
import { PreviewQuality, SourceFile } from './types';
import { usePlayerStore } from '../stores/player';
import { useProjectStore } from '../stores/project';
import {
  getFileExtension,
  isBrowserNativeImagePath,
  isImageSource,
} from './media-formats';
import { generateImageProxy } from './ipc';

const PROXY_CODECS = [
  'hevc',
  'h265',
  'prores',
  'dnxhd',
  'mpeg2video',
  'mpeg1video',
  'mpeg4',
  'msmpeg4v3',
  'msmpeg4v2',
  'vc1',
  'wmv1',
  'wmv2',
  'wmv3',
  'flv1',
  'vp6',
  'vp6f',
  'rawvideo',
  'mjpeg',
  'gif',
  'apng',
  'qtrle',
  'utvideo',
  'ffv1',
  'huffyuv',
  'theora',
  'h263',
  'cinepak',
];

const NON_WEB_VIDEO_EXTENSIONS = new Set([
  'avi',
  'flv',
  'wmv',
  'asf',
  'ts',
  'm2ts',
  'mts',
  'mpg',
  'mpeg',
  'vob',
  'mxf',
  'rm',
  'rmvb',
  'f4v',
  'gif',
  'apng',
]);

const inFlightProxies = new Map<string, Promise<string | undefined>>();
const inFlightImageProxies = new Map<string, Promise<string | undefined>>();
const failedProxies = new Set<string>();
const failedImageProxies = new Set<string>();
const recoveredProxyPaths = new Set<string>();
const runtimeFallbackProxySourceIds = new Set<string>();

export interface EnsureProxyOptions {
  forceRebuild?: boolean;
  forceCodecFallback?: boolean;
}

export function resetProxyManagerState(): void {
  failedProxies.clear();
  failedImageProxies.clear();
  recoveredProxyPaths.clear();
  runtimeFallbackProxySourceIds.clear();
}

function clearSourceProxyTracking(sourceId: string): void {
  const prefix = `${sourceId}:`;
  for (const key of Array.from(failedProxies)) {
    if (key.startsWith(prefix)) failedProxies.delete(key);
  }
  for (const key of Array.from(recoveredProxyPaths)) {
    if (key.startsWith(prefix)) recoveredProxyPaths.delete(key);
  }
  failedImageProxies.delete(sourceId);
  runtimeFallbackProxySourceIds.delete(sourceId);
}

useProjectStore.subscribe((state, prevState) => {
  if (state.sources.length === 0 && prevState.sources.length > 0) {
    resetProxyManagerState();
    return;
  }
  for (const src of state.sources) {
    const prev = prevState.sources.find((p) => p.id === src.id);
    if (prev && prev.probe !== src.probe) {
      clearSourceProxyTracking(src.id);
    }
  }
});

export function proxyStatusKey(sourceId: string, quality: PreviewQuality): string {
  return `${sourceId}:${quality}`;
}

export function imageNeedsPreviewProxy(source: SourceFile): boolean {
  if (!isImageSource(source)) return false;
  if (source.rasterizedPath) return false;
  return !isBrowserNativeImagePath(source.path);
}

export function fileNeedsProxy(source: SourceFile): boolean {
  if (isImageSource(source)) return false;
  if (runtimeFallbackProxySourceIds.has(source.id)) return true;
  const codec = source.probe.video?.codec.toLowerCase() || '';
  if (PROXY_CODECS.includes(codec)) return true;
  const ext = getFileExtension(source.path);
  return NON_WEB_VIDEO_EXTENSIONS.has(ext);
}

function getQualityShortSideCap(quality: PreviewQuality): number | null {
  switch (quality) {
    case '1080p':
      return 1080;
    case '720p':
      return 720;
    case '480p':
      return 480;
    case 'original':
    default:
      return null;
  }
}

export function needsProxyForQuality(source: SourceFile, quality: PreviewQuality): boolean {
  if (isImageSource(source)) return false;
  const video = source.probe.video;
  if (!video) return false;
  if (fileNeedsProxy(source)) return true;

  const cap = getQualityShortSideCap(quality);
  if (cap === null) return false;

  const shortSide = Math.min(video.width, video.height);
  return shortSide > cap;
}

export function getCachedProxyPath(source: SourceFile, quality: PreviewQuality): string | undefined {
  const cached = source.proxyPaths?.[quality];
  if (cached) return cached;
  if (quality === '720p' && source.proxyPath) return source.proxyPath;
  return undefined;
}

export function resolvePreviewFilePath(source: SourceFile, quality: PreviewQuality): string {
  if (isImageSource(source)) {
    if (source.imagePreviewPath) return source.imagePreviewPath;
    if (source.rasterizedPath) return source.rasterizedPath;
    return source.path;
  }

  if (!needsProxyForQuality(source, quality)) {
    return source.path;
  }

  const exact = getCachedProxyPath(source, quality);
  if (exact) return exact;

  // Keep playing a valid source while the requested quality proxy is generating
  if (!fileNeedsProxy(source)) {
    return source.path;
  }

  const fallbackProxy =
    source.proxyPaths?.original ||
    source.proxyPaths?.['1080p'] ||
    source.proxyPaths?.['720p'] ||
    source.proxyPaths?.['480p'] ||
    source.proxyPath;

  return fallbackProxy || source.path;
}

export async function ensureImagePreviewProxy(source: SourceFile): Promise<string | undefined> {
  if (!imageNeedsPreviewProxy(source)) {
    return source.imagePreviewPath || source.rasterizedPath || source.path;
  }
  if (source.imagePreviewPath) {
    return source.imagePreviewPath;
  }
  if (failedImageProxies.has(source.id)) {
    return undefined;
  }

  const existing = inFlightImageProxies.get(source.id);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    try {
      const previewPath = await generateImageProxy(source.path);
      useProjectStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === source.id ? { ...s, imagePreviewPath: previewPath } : s
        ),
      }));
      return previewPath;
    } catch (err) {
      console.error(`Image preview conversion failed for ${source.filename}:`, err);
      failedImageProxies.add(source.id);
      return undefined;
    } finally {
      inFlightImageProxies.delete(source.id);
    }
  })();

  inFlightImageProxies.set(source.id, promise);
  return promise;
}

export async function ensureProxy(
  source: SourceFile,
  quality: PreviewQuality,
  options?: EnsureProxyOptions
): Promise<string | undefined> {
  if (isImageSource(source)) {
    return ensureImagePreviewProxy(source);
  }

  const forceRebuild = Boolean(options?.forceRebuild);
  const forceCodecFallback = Boolean(options?.forceCodecFallback);

  if (forceCodecFallback && source.probe.video) {
    runtimeFallbackProxySourceIds.add(source.id);
  }

  if (!needsProxyForQuality(source, quality)) return undefined;

  if (!forceRebuild) {
    const existingCached = getCachedProxyPath(source, quality);
    if (existingCached) return existingCached;
  }

  const key = proxyStatusKey(source.id, quality);
  if (forceRebuild) {
    failedProxies.delete(key);
  } else if (failedProxies.has(key)) {
    return undefined;
  }

  const existingInFlight = inFlightProxies.get(key);
  if (existingInFlight) {
    return existingInFlight;
  }

  const promise = (async () => {
    usePlayerStore.getState().setProxyStatus(key, 'generating');

    try {
      const proxyPath = await invoke<string>('generate_proxy', {
        path: source.path,
        quality,
        sourceWidth: source.probe.video?.width ?? null,
        sourceHeight: source.probe.video?.height ?? null,
        force: forceRebuild,
      });

      // Atomically update latest sources state without overwriting concurrent additions
      useProjectStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === source.id
            ? {
                ...s,
                proxyPath: quality === '720p' ? proxyPath : s.proxyPath,
                proxyPaths: {
                  ...(s.proxyPaths || {}),
                  [quality]: proxyPath,
                },
              }
            : s
        ),
      }));

      usePlayerStore.getState().setProxyStatus(key, 'ready');
      return proxyPath;
    } catch (err) {
      console.error(`Proxy generation (${quality}) failed for ${source.filename}:`, err);
      failedProxies.add(key);
      usePlayerStore.getState().setProxyStatus(key, 'error');
      return undefined;
    } finally {
      inFlightProxies.delete(key);
    }
  })();

  inFlightProxies.set(key, promise);
  return promise;
}

/**
 * Invalidates a missing or unreadable cached proxy path and rebuilds it once per broken path.
 */
export async function recoverBrokenProxy(
  source: SourceFile,
  quality: PreviewQuality,
  brokenPath: string
): Promise<string | undefined> {
  if (isImageSource(source)) {
    failedImageProxies.delete(source.id);
    useProjectStore.setState((state) => ({
      sources: state.sources.map((s) =>
        s.id === source.id ? { ...s, imagePreviewPath: undefined } : s
      ),
    }));
    const latest = useProjectStore.getState().sources.find((s) => s.id === source.id);
    return latest ? ensureImagePreviewProxy(latest) : undefined;
  }

  const recoveryKey = `${source.id}:${quality}:${brokenPath}`;
  if (recoveredProxyPaths.has(recoveryKey)) {
    return undefined;
  }
  recoveredProxyPaths.add(recoveryKey);

  useProjectStore.setState((state) => ({
    sources: state.sources.map((s) => {
      if (s.id !== source.id) return s;
      const nextProxyPaths: Partial<Record<PreviewQuality, string>> = {};
      if (s.proxyPaths) {
        for (const [q, p] of Object.entries(s.proxyPaths) as [PreviewQuality, string | undefined][]) {
          if (p && p !== brokenPath && q !== quality) {
            nextProxyPaths[q] = p;
          }
        }
      }
      const nextLegacyProxy =
        s.proxyPath && s.proxyPath !== brokenPath && quality !== '720p' ? s.proxyPath : undefined;
      return {
        ...s,
        proxyPath: nextLegacyProxy,
        proxyPaths: Object.keys(nextProxyPaths).length > 0 ? nextProxyPaths : undefined,
      };
    }),
  }));

  const latestSource = useProjectStore.getState().sources.find((s) => s.id === source.id);
  if (!latestSource) return undefined;

  return ensureProxy(latestSource, quality, { forceRebuild: true });
}
