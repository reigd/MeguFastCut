import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';
import { ExportJob, ExportProgress, ExportSource, ExportClip } from '../features/export/export-types';
import { startExport, cancelExport } from '../shared/ipc';
import { useProjectStore } from './project';
import { useSettingsStore } from './settings';
import {
  getClipTrackIndex,
  getTimelineTotalDurationMs,
  isImageSource,
} from '../shared/media-formats';
import { isActiveTransition } from '../shared/transitions';
import {
  hasActiveVideoAdjustments,
  resolveClipVideoAdjustments,
} from '../shared/video-fx';

export interface ExportState {
  isExportModalOpen: boolean;
  isProgressModalOpen: boolean;
  isCompleteModalOpen: boolean;
  isExporting: boolean;
  progress: ExportProgress | null;
  lastExportedPath: string;
  lastExportDurationMs: number;
  errorMessage: string | null;

  // Actions
  openExportModal: () => void;
  closeExportModal: () => void;
  closeProgressModal: () => void;
  closeCompleteModal: () => void;
  startExportJob: (customOutputPath?: string, customAudioPath?: string) => Promise<void>;
  cancelCurrentExport: () => Promise<void>;
}

export function getFormatExtension(format: string): string {
  switch (format) {
    case 'webm_vp9':
    case 'webm_av1':
    case 'webm':
      return 'webm';
    case 'mov':
      return 'mov';
    case 'mkv':
      return 'mkv';
    case 'avi':
      return 'avi';
    case 'gif':
      return 'gif';
    case 'audio_mp3':
      return 'mp3';
    case 'audio_wav':
      return 'wav';
    case 'audio_flac':
      return 'flac';
    case 'audio_aac':
      return 'm4a';
    case 'mp4_h264':
    case 'mp4_hevc':
    case 'mp4':
    case 'copy':
    default:
      return 'mp4';
  }
}

export function getAudioExtension(format: string): string {
  switch (format) {
    case 'audio_wav':
    case 'wav':
      return 'wav';
    case 'audio_flac':
    case 'flac':
      return 'flac';
    case 'audio_aac':
    case 'm4a':
    case 'aac':
      return 'm4a';
    case 'audio_ogg':
    case 'ogg':
    case 'opus':
      return 'ogg';
    case 'audio_mp3':
    case 'mp3':
    default:
      return 'mp3';
  }
}

export function generateDefaultAudioOutputPath(
  sourcePath: string,
  audioFormat: string,
  configuredDir?: string
): string {
  const ext = getAudioExtension(audioFormat);
  const normalized = sourcePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = configuredDir && configuredDir.trim().length > 0
    ? configuredDir.replace(/\\/g, '/')
    : lastSlash !== -1
    ? normalized.slice(0, lastSlash)
    : '';

  const fullFilename = lastSlash !== -1 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = fullFilename.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? fullFilename.slice(0, dotIndex) : fullFilename;

  const outputFilename = `${baseName}_fastcut_audio.${ext}`;
  return dir ? `${dir}/${outputFilename}` : outputFilename;
}

export function generateDefaultOutputPath(
  sourcePath: string,
  format: string,
  configuredDir?: string
): string {
  const ext = getFormatExtension(format);
  const normalized = sourcePath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const dir = configuredDir && configuredDir.trim().length > 0
    ? configuredDir.replace(/\\/g, '/')
    : lastSlash !== -1
    ? normalized.slice(0, lastSlash)
    : '';

  const fullFilename = lastSlash !== -1 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = fullFilename.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? fullFilename.slice(0, dotIndex) : fullFilename;

  const outputFilename = `${baseName}_fastcut.${ext}`;
  return dir ? `${dir}/${outputFilename}` : outputFilename;
}

let hasRegisteredListener = false;

function setupExportEventListener(set: (fn: (state: ExportState) => Partial<ExportState>) => void) {
  if (hasRegisteredListener || typeof window === 'undefined') return;
  hasRegisteredListener = true;

  listen<ExportProgress>('export-progress', (event) => {
    const payload = event.payload;
    if (payload.status === 'running') {
      set((state) => ({
        ...state,
        progress: payload,
      }));
    } else if (payload.status === 'complete') {
      set((state) => ({
        ...state,
        isExporting: false,
        isProgressModalOpen: false,
        isCompleteModalOpen: true,
        progress: payload,
      }));
    } else if (payload.status === 'cancelled') {
      set((state) => ({
        ...state,
        isExporting: false,
        isProgressModalOpen: false,
        progress: null,
      }));
    } else if (payload.status === 'error') {
      set((state) => ({
        ...state,
        isExporting: false,
        isProgressModalOpen: false,
        errorMessage: payload.errorMessage || 'Export failed',
        progress: null,
      }));
    }
  }).catch((err) => {
    console.error('Failed to register export progress listener:', err);
  });
}

export const useExportStore = create<ExportState>((set) => {
  setupExportEventListener(set);

  return {
    isExportModalOpen: false,
    isProgressModalOpen: false,
    isCompleteModalOpen: false,
    isExporting: false,
    progress: null,
    lastExportedPath: '',
    lastExportDurationMs: 0,
    errorMessage: null,

    openExportModal: () => {
      set({ isExportModalOpen: true, errorMessage: null });
    },

    closeExportModal: () => {
      set({ isExportModalOpen: false });
    },

    closeProgressModal: () => {
      set({ isProgressModalOpen: false });
    },

    closeCompleteModal: () => {
      set({ isCompleteModalOpen: false });
    },

    cancelCurrentExport: async () => {
      try {
        await cancelExport();
      } finally {
        set({ isExporting: false, isProgressModalOpen: false });
      }
    },

    startExportJob: async (customOutputPath?: string, customAudioPath?: string) => {
      const { project, sources } = useProjectStore.getState();
      const { defaultOutputDir } = useSettingsStore.getState();

      const enabledClips = project.clips
        .filter((c) => c.enabled)
        .sort((a, b) => {
          const trackDiff = getClipTrackIndex(a) - getClipTrackIndex(b);
          if (trackDiff !== 0) return trackDiff;
          return (a.startMs ?? 0) - (b.startMs ?? 0);
        });
      if (enabledClips.length === 0 || sources.length === 0) {
        throw new Error('No clips available for export');
      }

      const firstMainClip = enabledClips.find((c) => getClipTrackIndex(c) === 0) || enabledClips[0];
      const firstSource =
        sources.find((s) => s.id === firstMainClip?.sourceId) || sources[0];
      const exportVideo = project.output.exportVideo ?? true;
      const exportAudio = project.output.exportAudio ?? false;

      const videoTarget =
        (exportVideo && customOutputPath) ||
        project.output.videoOutputPath ||
        project.output.outputPath ||
        generateDefaultOutputPath(
          firstSource.path,
          project.output.videoContainer || project.output.format,
          defaultOutputDir
        );

      const audioTarget =
        customAudioPath ||
        (!exportVideo && customOutputPath) ||
        project.output.audioOutputPath ||
        generateDefaultAudioOutputPath(
          firstSource.path,
          project.output.audioFormat || 'mp3',
          defaultOutputDir
        );

      const targetPath = exportVideo ? videoTarget : audioTarget;

      const totalDurationMs = getTimelineTotalDurationMs(enabledClips);

      const exportSources: ExportSource[] = sources.map((s) => ({
        id: s.id,
        path: s.rasterizedPath || s.path,
        filename: s.filename,
        durationMs: s.probe.durationMs,
        width: s.probe.video?.width,
        height: s.probe.video?.height,
        fpsNum: s.probe.video?.fpsNum,
        fpsDen: s.probe.video?.fpsDen,
        codec: s.probe.video?.codec,
        audioCodec: s.probe.audio?.[0]?.codec,
        isImage: isImageSource(s),
      }));

      const exportClips: ExportClip[] = enabledClips.map((c) => {
        const inMs = Math.max(0, Math.round(c.inMs));
        const outMs = Math.max(inMs + 1, Math.round(c.outMs));
        const trackIndex = getClipTrackIndex(c);
        const resolvedAdj = resolveClipVideoAdjustments(c);
        const clipBounds =
          trackIndex === 0
            ? project.fitMode === 'fit'
              ? (c.fitBounds ?? project.fitBounds)
              : project.fitMode === 'stretch'
                ? (c.stretchBounds ?? project.stretchBounds)
                : null
            : null;
        return {
          id: c.id,
          sourceId: c.sourceId,
          inMs,
          outMs,
          enabled: c.enabled,
          rotate: c.rotate,
          flipH: c.flipH,
          flipV: c.flipV,
          volumeDb: c.volumeDb || 0,
          speed: c.speed || 1.0,
          sharpness: resolvedAdj.sharpness / 100,
          videoAdjustments: hasActiveVideoAdjustments(resolvedAdj) ? resolvedAdj : undefined,
          startMs: c.startMs !== undefined ? Math.max(0, Math.round(c.startMs)) : undefined,
          trackIndex,
          overlayBounds:
            trackIndex > 0 && c.overlayBounds
              ? {
                  x: c.overlayBounds.x,
                  y: c.overlayBounds.y,
                  width: c.overlayBounds.width,
                  height: c.overlayBounds.height,
                }
              : undefined,
          canvasBounds: clipBounds
            ? {
                x: clipBounds.x,
                y: clipBounds.y,
                width: clipBounds.width,
                height: clipBounds.height,
              }
            : undefined,
          crop:
            trackIndex === 0 && c.cropOverride
              ? {
                  x: c.cropOverride.x,
                  y: c.cropOverride.y,
                  width: c.cropOverride.width,
                  height: c.cropOverride.height,
                }
              : undefined,
          transitionIn: isActiveTransition(c.transitionIn) ? { ...c.transitionIn } : undefined,
          transitionOut: isActiveTransition(c.transitionOut) ? { ...c.transitionOut } : undefined,
        };
      });

      const job: ExportJob = {
        sources: exportSources,
        clips: exportClips,
        aspect: {
          id: project.aspect.id,
          ratio: project.aspect.ratio,
          customW: project.aspect.customW,
          customH: project.aspect.customH,
        },
        fitMode: project.fitMode,
        crop: {
          x: project.crop.x,
          y: project.crop.y,
          width: project.crop.width,
          height: project.crop.height,
        },
        canvasBounds: undefined,
        padding: {
          mode: project.padding.mode,
          color: project.padding.color,
          blurStrength: project.padding.blurStrength,
        },
        output: {
          format: project.output.format,
          quality: project.output.quality,
          crf: project.output.crf,
          bitrateKbps: project.output.bitrateKbps,
          resolutionMode: project.output.resolutionMode,
          fpsMode: project.output.fpsMode,
          hardwareAccel: project.output.hardwareAccel,
          outputPath: targetPath,
          openFolderAfter: project.output.openFolderAfter,
          exportVideo,
          exportAudio,
          videoOutputPath: videoTarget,
          audioOutputPath: audioTarget,
          videoContainer: project.output.videoContainer,
          videoCodec: project.output.videoCodec,
          audioCodec: project.output.audioCodec,
          audioFormat: project.output.audioFormat,
          audioBitrate: project.output.audioBitrate,
        },
        audio: {
          trackIndex: project.audio.trackIndex,
          volumeDb: project.audio.volumeDb,
          muted: project.audio.muted,
          normalization: project.audio.normalization,
        },
        totalDurationMs,
      };

      set({
        isExportModalOpen: false,
        isProgressModalOpen: true,
        isExporting: true,
        lastExportedPath: targetPath,
        lastExportDurationMs: totalDurationMs,
        errorMessage: null,
        progress: {
          percentage: 0,
          fps: 0,
          speed: '0x',
          outTimeMs: 0,
          totalDurationMs,
          etaSeconds: 0,
          status: 'running',
        },
      });

      try {
        await startExport(job);
      } catch (err) {
        set({
          isExporting: false,
          isProgressModalOpen: false,
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
});
