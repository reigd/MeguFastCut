import { create } from 'zustand';
import {
  Project,
  SourceFile,
  Clip,
  AspectSetting,
  FitMode,
  CropRect,
  PadSetting,
  OutputSettings,
  AudioSettings,
  RotateAngle,
  ProbeResult,
} from '../shared/types';
import { probeFile, generateImageProxy, saveRasterizedSvg } from '../shared/ipc';
import { useHistoryStore } from './history';
import { usePlayerStore } from './player';
import { useUiStore } from './ui';
import {
  resolveAspectRatio,
  calculateTargetDimensions,
  computeDefaultOverlayBounds,
} from '../shared/geometry';
import {
  DEFAULT_IMAGE_DURATION_MS,
  MAX_IMAGE_CLIP_DURATION_MS,
  compactOverlayTracks,
  findFreeOverlayTrack,
  getClipDurationMs,
  getClipStartMs,
  getClipTrackIndex,
  getTimelineTotalDurationMs,
  hasTrackOverlap,
  isBrowserNativeImagePath,
  isImageSource,
  isSvgPath,
  rasterizeSvgFileToPngDataUrl,
} from '../shared/media-formats';
import { t } from '../shared/i18n';

export interface RecentItem {
  path: string;
  filename: string;
  durationMs: number;
  width?: number;
  height?: number;
  sizeBytes: number;
  lastOpened: number;
  draft?: ProjectDraft;
}

export interface ProjectDraft {
  version: 1;
  sources: SourceFile[];
  project: Project;
  activeClipId: string | null;
  currentTimeMs: number;
  savedAt: number;
}

export interface AddClipOptions {
  atTimeMs?: number;
  trackIndex?: number;
  asOverlay?: boolean;
  overlayBounds?: CropRect;
}

interface ProjectState {
  isProjectOpen: boolean;
  sources: SourceFile[];
  project: Project;
  activeClipId: string | null;
  draft: ProjectDraft | null;
  recentFiles: RecentItem[];
  isLoading: boolean;
  loadingMessage: string;

  // Actions
  createProject: () => void;
  importSources: (paths: string[]) => Promise<SourceFile[]>;
  addClipFromSource: (sourceId: string, options?: number | AddClipOptions) => void;
  addFilesAsOverlay: (paths: string[], atTimeMs?: number, preferredTrack?: number) => Promise<number>;
  removeSource: (sourceId: string) => void;
  addFiles: (paths: string[], options?: { skipDraftRestore?: boolean }) => Promise<number>;
  openRecentProject: (item: RecentItem) => Promise<void>;
  closeProject: () => void;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearProject: () => void;
  reorderClips: (fromIndex: number, toIndex: number) => void;
  moveClip: (clipId: string, newStartMs: number, newTrackIndex?: number) => void;
  moveClipToTrack: (clipId: string, target: 'overlay' | 'main' | 'up' | 'down') => void;
  setClipOverlayBounds: (clipId: string, bounds: CropRect, recordHistory?: boolean) => void;
  fitOverlayToCanvas: (clipId: string) => void;
  removeClip: (clipId: string) => void;
  toggleClipEnabled: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClip: (clipId: string, splitTimeMs: number) => void;
  trimClip: (
    clipId: string,
    inMs: number,
    outMs: number,
    recordHistory?: boolean,
    newStartMs?: number
  ) => void;
  undo: () => void;
  redo: () => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  setActiveClipId: (id: string | null) => void;
  setAspect: (aspect: AspectSetting, syncCrop?: boolean) => void;
  setFitMode: (mode: FitMode) => void;
  setCrop: (crop: CropRect) => void;
  setFitBounds: (bounds: CropRect | null) => void;
  setStretchBounds: (bounds: CropRect | null) => void;
  setPadding: (padding: PadSetting) => void;
  setRotate: (clipId: string, rotate: RotateAngle) => void;
  rotateActiveClip: (direction: 'cw' | 'ccw') => void;
  toggleFlipH: (clipId: string) => void;
  toggleFlipV: (clipId: string) => void;
  applyTransformToAll: () => void;
  setCropPosition: (pos: 'center' | 'top' | 'bottom' | 'left' | 'right') => void;
  setOutput: (output: Partial<OutputSettings>) => void;
  setAudio: (audio: Partial<AudioSettings>) => void;
  setClipVolume: (clipId: string, volumeDb: number) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setClipSharpness: (clipId: string, sharpness: number, recordHistory?: boolean) => void;
  applySharpnessToAll: () => void;
  updateSourceAfterReplace: (sourceId: string, newProbe: ProbeResult) => void;
}

const RECENTS_KEY = 'megu-fastcut-recent-files';
const DRAFT_KEY = 'megu-fastcut-project-draft';

/** Strips session-ephemeral proxy temp paths so drafts never point to deleted files after restart. */
export function stripSourceTransientPaths(source: SourceFile): SourceFile {
  return {
    id: source.id,
    path: source.path,
    filename: source.filename,
    probe: source.probe,
  };
}

export function sanitizeProjectDraft(draft: ProjectDraft): ProjectDraft {
  return {
    ...draft,
    sources: draft.sources.map(stripSourceTransientPaths),
  };
}

export function loadProjectDraft(): ProjectDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectDraft;
    if (
      parsed &&
      Array.isArray(parsed.sources) &&
      parsed.sources.length > 0 &&
      parsed.project &&
      Array.isArray(parsed.project.clips) &&
      parsed.project.clips.length > 0
    ) {
      return sanitizeProjectDraft(parsed);
    }
  } catch (err) {
    console.error('Failed to load project draft:', err);
  }
  return null;
}

export function persistProjectDraft(draft: ProjectDraft | null) {
  try {
    if (!draft || !draft.project || !draft.project.clips || draft.project.clips.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
    } else {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(sanitizeProjectDraft(draft)));
    }
  } catch (err) {
    console.error('Failed to persist project draft:', err);
  }
}

function loadRecentFiles(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) {
      const items = (JSON.parse(raw) as RecentItem[]).map((it) =>
        it.draft && Array.isArray(it.draft.sources)
          ? { ...it, draft: sanitizeProjectDraft(it.draft) }
          : it
      );
      const draft = loadProjectDraft();
      if (draft && draft.sources && draft.sources.length > 0) {
        return items.map((it) => {
          if (!it.draft && draft.sources.some((s) => normalizePathKey(s.path) === normalizePathKey(it.path))) {
            return { ...it, draft };
          }
          return it;
        });
      }
      return items;
    }
  } catch {
    // ignore
  }
  return [];
}

function persistRecentFiles(items: RecentItem[]) {
  try {
    const sanitized = items.slice(0, 8).map((it) =>
      it.draft && Array.isArray(it.draft.sources)
        ? { ...it, draft: sanitizeProjectDraft(it.draft) }
        : it
    );
    localStorage.setItem(RECENTS_KEY, JSON.stringify(sanitized));
  } catch {
    // ignore
  }
}

/** Natural comparison for strings with numbers (e.g. clip2 before clip10) */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Case-insensitive path key for Windows deduplication */
function normalizePathKey(path: string): string {
  return path.replace(/\//g, '\\').toLowerCase();
}

function getCanvasDimensionsForProject(project: Project, sources: SourceFile[]): { width: number; height: number } {
  const firstMain = project.clips.find((c) => c.enabled && getClipTrackIndex(c) === 0);
  const firstAny = project.clips.find((c) => c.enabled);
  const primaryClip = firstMain || firstAny;
  const primarySource = primaryClip
    ? sources.find((s) => s.id === primaryClip.sourceId)
    : sources.find((s) => s.probe.video) || sources[0];

  const srcW = primarySource?.probe.video?.width || 1920;
  const srcH = primarySource?.probe.video?.height || 1080;
  const targetRatio = resolveAspectRatio(project.aspect, srcW, srcH);
  const { targetW, targetH } = calculateTargetDimensions(
    srcW,
    srcH,
    targetRatio,
    project.output.resolutionMode
  );
  return { width: targetW, height: targetH };
}

function sortClipsByTrackAndStart(clips: Clip[]): Clip[] {
  return [...clips].sort((a, b) => {
    const trackDiff = getClipTrackIndex(a) - getClipTrackIndex(b);
    if (trackDiff !== 0) return trackDiff;
    return (a.startMs ?? 0) - (b.startMs ?? 0);
  });
}

async function probeAndPrepareMediaPath(
  p: string
): Promise<{ probe: ProbeResult; rasterizedPath?: string; imagePreviewPath?: string }> {
  if (isSvgPath(p)) {
    const pngDataUrl = await rasterizeSvgFileToPngDataUrl(p);
    const rasterizedPath = await saveRasterizedSvg(p, pngDataUrl);
    const probe = await probeFile(rasterizedPath);
    return {
      probe: {
        ...probe,
        mediaKind: 'image',
        durationMs: probe.durationMs > 0 ? probe.durationMs : DEFAULT_IMAGE_DURATION_MS,
      },
      rasterizedPath,
      imagePreviewPath: rasterizedPath,
    };
  }

  const probe = await probeFile(p);
  return { probe };
}

function triggerBackgroundImagePreview(source: SourceFile) {
  if (!isImageSource(source) || isBrowserNativeImagePath(source.path) || source.imagePreviewPath || source.rasterizedPath) {
    return;
  }
  generateImageProxy(source.path)
    .then((previewPath) => {
      useProjectStore.setState((state) => ({
        sources: state.sources.map((s) =>
          s.id === source.id ? { ...s, imagePreviewPath: previewPath } : s
        ),
      }));
    })
    .catch((err) => {
      console.error(`Failed to generate image preview for ${source.filename}:`, err);
    });
}

/** Re-prepares transient preview/rasterized paths for SVG or exotic image sources restored from drafts. */
function hydrateRestoredSources(sources: SourceFile[]) {
  for (const src of sources) {
    if (isSvgPath(src.path) && !src.rasterizedPath) {
      rasterizeSvgFileToPngDataUrl(src.path)
        .then((dataUrl) => saveRasterizedSvg(src.path, dataUrl))
        .then((rasterizedPath) => {
          useProjectStore.setState((state) => ({
            sources: state.sources.map((s) =>
              s.id === src.id
                ? { ...s, rasterizedPath, imagePreviewPath: rasterizedPath }
                : s
            ),
          }));
        })
        .catch((err) => console.error(`Failed to re-rasterize SVG ${src.filename}:`, err));
    } else {
      triggerBackgroundImagePreview(src);
    }
  }
}

const initialCrop: CropRect = { x: 0, y: 0, width: 1, height: 1 };
const initialAspect: AspectSetting = { id: 'original', label: 'Original' };
const initialPadding: PadSetting = { mode: 'color', color: '#000000', blurStrength: 40 };
const initialAudio: AudioSettings = {
  trackIndex: 0,
  volumeDb: 0,
  muted: false,
  normalization: 'off',
  reencodeAudio: false,
};
const initialOutput: OutputSettings = {
  format: 'mp4_h264',
  quality: 'balanced',
  crf: 23,
  resolutionMode: 'auto',
  fpsMode: 'original',
  hardwareAccel: 'auto',
  outputPath: '',
  filenameTemplate: '{name}_fastcut{ext}',
  openFolderAfter: true,
};

const initialDraft = loadProjectDraft();

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingAutoSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  isProjectOpen: false,
  sources: [],
  project: {
    clips: [],
    aspect: initialAspect,
    fitMode: 'fit',
    crop: initialCrop,
    padding: initialPadding,
    output: initialOutput,
    audio: initialAudio,
  },
  activeClipId: null,
  draft: initialDraft,
  recentFiles: loadRecentFiles(),
  isLoading: false,
  loadingMessage: '',

  createProject: () => {
    useHistoryStore.getState().clearHistory();
    usePlayerStore.getState().pause();
    usePlayerStore.getState().seek(0);
    set({
      isProjectOpen: true,
      sources: [],
      project: {
        clips: [],
        aspect: initialAspect,
        fitMode: 'fit',
        crop: initialCrop,
        padding: initialPadding,
        output: initialOutput,
        audio: initialAudio,
      },
      activeClipId: null,
    });
  },

  importSources: async (paths: string[]): Promise<SourceFile[]> => {
    if (paths.length === 0) return [];
    set({ isLoading: true, loadingMessage: t('media_library.importing') });

    const importedOrExisting: SourceFile[] = [];
    const newSources: SourceFile[] = [];
    const failedNames: string[] = [];
    const currentSources = [...get().sources];

    for (const p of paths) {
      const key = normalizePathKey(p);
      const existing =
        currentSources.find((s) => normalizePathKey(s.path) === key) ||
        newSources.find((s) => normalizePathKey(s.path) === key);
      if (existing) {
        importedOrExisting.push(existing);
        continue;
      }

      const filename = p.split(/[/\\]/).pop() || p;
      try {
        const { probe, rasterizedPath, imagePreviewPath } = await probeAndPrepareMediaPath(p);
        const sourceId = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const source: SourceFile = {
          id: sourceId,
          path: p,
          filename,
          probe,
          rasterizedPath,
          imagePreviewPath,
        };
        newSources.push(source);
        importedOrExisting.push(source);

        // Kick off background PNG preview conversion for non-browser images (HEIC, TIFF, PSD, TGA, EXR, JXL...)
        triggerBackgroundImagePreview(source);

        const currentRecents = get().recentFiles.filter((r) => normalizePathKey(r.path) !== key);
        const updatedRecents: RecentItem[] = [
          {
            path: p,
            filename,
            durationMs: probe.durationMs,
            width: probe.video?.width,
            height: probe.video?.height,
            sizeBytes: probe.sizeBytes,
            lastOpened: Date.now(),
          },
          ...currentRecents,
        ].slice(0, 8);

        persistRecentFiles(updatedRecents);
        set({ recentFiles: updatedRecents });
      } catch (err) {
        console.error(`Failed to probe ${p}:`, err);
        failedNames.push(filename);
      }
    }

    if (failedNames.length > 0) {
      useUiStore.getState().addToast({
        message: t('media_library.import_failed', { name: failedNames[0] }),
        durationMs: 4000,
      });
    }

    set({
      sources: [...currentSources, ...newSources],
      isProjectOpen: true,
      isLoading: false,
      loadingMessage: '',
    });

    return importedOrExisting;
  },

  addClipFromSource: (sourceId: string, options?: number | AddClipOptions) => {
    const source = get().sources.find((s) => s.id === sourceId);
    if (!source) return;

    const opts: AddClipOptions =
      typeof options === 'number' ? { atTimeMs: options } : options || {};

    const currentProject = get().project;
    const currentClips = [...currentProject.clips];
    const clipDurMs = Math.max(
      100,
      Math.round(source.probe.durationMs || (isImageSource(source) ? DEFAULT_IMAGE_DURATION_MS : 5000))
    );

    const wantsOverlay = Boolean(opts.asOverlay) || (opts.trackIndex !== undefined && opts.trackIndex > 0);
    let targetTrack = opts.trackIndex !== undefined ? Math.max(0, Math.floor(opts.trackIndex)) : 0;
    let nextStartMs = 0;

    if (wantsOverlay) {
      nextStartMs =
        opts.atTimeMs !== undefined && opts.atTimeMs >= 0
          ? Math.round(opts.atTimeMs)
          : Math.max(0, Math.round(usePlayerStore.getState().currentTimeMs));
      targetTrack = findFreeOverlayTrack(
        currentClips,
        nextStartMs,
        nextStartMs + clipDurMs,
        Math.max(1, targetTrack || 1)
      );
    } else if (opts.atTimeMs !== undefined && opts.atTimeMs >= 0) {
      nextStartMs = Math.round(opts.atTimeMs);
      if (hasTrackOverlap(currentClips, 0, nextStartMs, nextStartMs + clipDurMs)) {
        // Dropping onto an occupied spot on V1 lifts the clip to a free overlay track above V1
        targetTrack = findFreeOverlayTrack(currentClips, nextStartMs, nextStartMs + clipDurMs, 1);
      } else {
        targetTrack = 0;
      }
    } else {
      // Append to end of main track V1
      targetTrack = 0;
      nextStartMs = currentClips
        .filter((c) => getClipTrackIndex(c) === 0)
        .reduce((max, c) => {
          const start = getClipStartMs(c, currentClips);
          return Math.max(max, start + getClipDurationMs(c));
        }, 0);
    }

    useHistoryStore.getState().recordChange(currentClips, 'Add clip from media library');

    let overlayBounds: CropRect | undefined;
    if (targetTrack > 0) {
      if (opts.overlayBounds) {
        overlayBounds = opts.overlayBounds;
      } else {
        const { width: canvasW, height: canvasH } = getCanvasDimensionsForProject(
          currentProject,
          get().sources
        );
        const srcW = source.probe.video?.width || 640;
        const srcH = source.probe.video?.height || 360;
        overlayBounds = computeDefaultOverlayBounds(srcW, srcH, canvasW, canvasH, 0, 0.6);
      }
    }

    const newClip: Clip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceId,
      inMs: 0,
      outMs: clipDurMs,
      startMs: nextStartMs,
      trackIndex: targetTrack,
      overlayBounds,
      enabled: true,
      rotate: 0,
      flipH: false,
      flipV: false,
      volumeDb: 0,
      speed: 1.0,
      sharpness: 0,
    };

    const nextClips = sortClipsByTrackAndStart(compactOverlayTracks([...currentClips, newClip]));

    set({
      project: {
        ...currentProject,
        clips: nextClips,
      },
      activeClipId: newClip.id,
      isProjectOpen: true,
    });

    const playhead = usePlayerStore.getState().currentTimeMs;
    if (targetTrack === 0 || playhead < nextStartMs || playhead >= nextStartMs + clipDurMs) {
      usePlayerStore.getState().seek(nextStartMs);
    }
  },

  addFilesAsOverlay: async (
    paths: string[],
    atTimeMs?: number,
    preferredTrack = 1
  ): Promise<number> => {
    if (paths.length === 0) return 0;
    const imported = await get().importSources(paths);
    if (imported.length === 0) return 0;

    const baseTime =
      atTimeMs !== undefined && atTimeMs >= 0
        ? Math.round(atTimeMs)
        : Math.max(0, Math.round(usePlayerStore.getState().currentTimeMs));

    let added = 0;
    for (let i = 0; i < imported.length; i++) {
      const src = imported[i];
      get().addClipFromSource(src.id, {
        atTimeMs: baseTime,
        trackIndex: Math.max(1, preferredTrack + i),
        asOverlay: true,
      });
      added += 1;
    }
    return added;
  },

  removeSource: (sourceId: string) => {
    const currentClips = get().project.clips;
    const remainingClips = compactOverlayTracks(
      currentClips.filter((c) => c.sourceId !== sourceId)
    );
    if (remainingClips.length !== currentClips.length) {
      useHistoryStore.getState().recordChange(currentClips, 'Remove media source');
    }
    const remainingSources = get().sources.filter((s) => s.id !== sourceId);
    let nextActiveId = get().activeClipId;
    if (nextActiveId && !remainingClips.some((c) => c.id === nextActiveId)) {
      nextActiveId = remainingClips[0]?.id || null;
    }
    set({
      sources: remainingSources,
      project: {
        ...get().project,
        clips: remainingClips,
      },
      activeClipId: nextActiveId,
    });
  },

  addFiles: async (paths: string[], options?: { skipDraftRestore?: boolean }): Promise<number> => {
    if (paths.length === 0) return 0;

    // Deduplicate incoming batch while preserving first occurrence
    const seenIncoming = new Set<string>();
    const uniquePaths: string[] = [];
    for (const p of paths) {
      const key = normalizePathKey(p);
      if (!seenIncoming.has(key)) {
        seenIncoming.add(key);
        uniquePaths.push(p);
      }
    }
    if (uniquePaths.length === 0) return 0;

    // If opening a single file from the Welcome Screen, check if it has a saved project draft
    if (!options?.skipDraftRestore && get().sources.length === 0 && uniquePaths.length === 1) {
      const p = uniquePaths[0];
      const matchingRecent = get().recentFiles.find((r) => normalizePathKey(r.path) === normalizePathKey(p));
      if (matchingRecent?.draft && matchingRecent.draft.project.clips.length > 0) {
        await get().openRecentProject(matchingRecent);
        return get().project.clips.length;
      }
      const globalDraft = get().draft || loadProjectDraft();
      if (
        globalDraft &&
        globalDraft.sources.length === 1 &&
        normalizePathKey(globalDraft.sources[0].path) === normalizePathKey(p) &&
        globalDraft.project.clips.length > 0
      ) {
        get().restoreDraft();
        return get().project.clips.length;
      }
    }

    set({ isLoading: true, loadingMessage: t('media_library.importing') });

    // Natural sort paths
    const sortedPaths = [...uniquePaths].sort((a, b) => {
      const nameA = a.split(/[/\\]/).pop() || a;
      const nameB = b.split(/[/\\]/).pop() || b;
      return naturalSort(nameA, nameB);
    });

    const probedItems: {
      path: string;
      filename: string;
      probe: ProbeResult;
      rasterizedPath?: string;
      imagePreviewPath?: string;
    }[] = [];
    const failedNames: string[] = [];

    try {
      for (const p of sortedPaths) {
        const filename = p.split(/[/\\]/).pop() || p;
        try {
          const prepared = await probeAndPrepareMediaPath(p);
          probedItems.push({ path: p, filename, ...prepared });
        } catch (err) {
          console.error(`Failed to probe ${p}:`, err);
          failedNames.push(filename);
        }
      }
    } catch (err) {
      set({ isLoading: false, loadingMessage: '' });
      throw err;
    }

    if (failedNames.length > 0) {
      useUiStore.getState().addToast({
        message: t('media_library.import_failed', { name: failedNames[0] }),
        durationMs: 4000,
      });
    }

    if (probedItems.length === 0) {
      set({ isLoading: false, loadingMessage: '' });
      return 0;
    }

    let addedClipsCount = 0;
    const sourcesToPreviewProxy: SourceFile[] = [];

    set((state) => {
      const currentClips = state.project.clips;
      if (currentClips.length > 0) {
        useHistoryStore.getState().recordChange(currentClips, 'Add clips');
      }

      const mergedSources = [...state.sources];
      const newClips: Clip[] = [];
      let nextStartMs = currentClips
        .filter((c) => getClipTrackIndex(c) === 0)
        .reduce((max, c) => {
          const start = getClipStartMs(c, currentClips);
          return Math.max(max, start + getClipDurationMs(c));
        }, 0);

      let updatedRecents = [...state.recentFiles];

      for (const item of probedItems) {
        const key = normalizePathKey(item.path);
        const existingSource = mergedSources.find((s) => normalizePathKey(s.path) === key);
        let sourceId: string;

        if (existingSource) {
          sourceId = existingSource.id;
        } else {
          sourceId = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const newSrc: SourceFile = {
            id: sourceId,
            path: item.path,
            filename: item.filename,
            probe: item.probe,
            rasterizedPath: item.rasterizedPath,
            imagePreviewPath: item.imagePreviewPath,
          };
          mergedSources.push(newSrc);
          if (isImageSource(newSrc) && !isBrowserNativeImagePath(newSrc.path) && !newSrc.imagePreviewPath) {
            sourcesToPreviewProxy.push(newSrc);
          }
        }

        const clipDurationMs = Math.max(
          100,
          Math.round(
            item.probe.durationMs || (item.probe.mediaKind === 'image' ? DEFAULT_IMAGE_DURATION_MS : 5000)
          )
        );

        const clip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sourceId,
          inMs: 0,
          outMs: clipDurationMs,
          startMs: nextStartMs,
          trackIndex: 0,
          enabled: true,
          rotate: 0,
          flipH: false,
          flipV: false,
          volumeDb: 0,
          speed: 1.0,
          sharpness: 0,
        };
        newClips.push(clip);
        nextStartMs += clipDurationMs;

        updatedRecents = [
          {
            path: item.path,
            filename: item.filename,
            durationMs: item.probe.durationMs,
            width: item.probe.video?.width,
            height: item.probe.video?.height,
            sizeBytes: item.probe.sizeBytes,
            lastOpened: Date.now(),
          },
          ...updatedRecents.filter((r) => normalizePathKey(r.path) !== key),
        ].slice(0, 8);
      }

      persistRecentFiles(updatedRecents);
      addedClipsCount = newClips.length;
      const allClips = sortClipsByTrackAndStart([...currentClips, ...newClips]);

      return {
        isProjectOpen: true,
        sources: mergedSources,
        project: {
          ...state.project,
          clips: allClips,
        },
        activeClipId: state.activeClipId || allClips[0]?.id || null,
        recentFiles: updatedRecents,
        isLoading: false,
        loadingMessage: '',
      };
    });

    for (const src of sourcesToPreviewProxy) {
      triggerBackgroundImagePreview(src);
    }

    return addedClipsCount;
  },

  openRecentProject: async (item: RecentItem) => {
    cancelPendingAutoSave();
    let draftToRestore = item.draft;
    if (!draftToRestore) {
      const globalDraft = get().draft || loadProjectDraft();
      if (globalDraft && globalDraft.sources.some((s) => normalizePathKey(s.path) === normalizePathKey(item.path))) {
        draftToRestore = globalDraft;
      }
    }

    if (
      draftToRestore &&
      draftToRestore.sources &&
      draftToRestore.sources.length > 0 &&
      draftToRestore.project &&
      draftToRestore.project.clips &&
      draftToRestore.project.clips.length > 0
    ) {
      const cleanDraft = sanitizeProjectDraft(draftToRestore);
      set({
        isProjectOpen: true,
        sources: cleanDraft.sources,
        project: cleanDraft.project,
        activeClipId: cleanDraft.activeClipId || cleanDraft.project.clips[0]?.id || null,
        draft: cleanDraft,
        isLoading: false,
        loadingMessage: '',
      });
      hydrateRestoredSources(cleanDraft.sources);
      useHistoryStore.getState().clearHistory();
      usePlayerStore.getState().pause();
      if (cleanDraft.currentTimeMs > 0) {
        usePlayerStore.getState().seek(cleanDraft.currentTimeMs);
      } else {
        usePlayerStore.getState().seek(0);
      }

      // Bump to front of recents
      const currentRecents = get().recentFiles;
      const existingIndex = currentRecents.findIndex(
        (r) => normalizePathKey(r.path) === normalizePathKey(item.path)
      );
      let updatedRecents: RecentItem[];
      if (existingIndex >= 0) {
        const existing = currentRecents[existingIndex];
        const updatedItem: RecentItem = {
          ...existing,
          lastOpened: Date.now(),
          draft: cleanDraft,
        };
        updatedRecents = [
          updatedItem,
          ...currentRecents.filter((_, idx) => idx !== existingIndex),
        ].slice(0, 8);
      } else {
        updatedRecents = [
          { ...item, lastOpened: Date.now(), draft: cleanDraft },
          ...currentRecents,
        ].slice(0, 8);
      }
      persistRecentFiles(updatedRecents);
      set({ recentFiles: updatedRecents });
      return;
    }

    // Fallback if no draft
    await get().addFiles([item.path]);
  },

  closeProject: () => {
    cancelPendingAutoSave();
    const { sources, project, activeClipId, recentFiles } = get();
    let currentDraft: ProjectDraft | null = null;
    if (project.clips.length > 0 && sources.length > 0) {
      currentDraft = sanitizeProjectDraft({
        version: 1,
        sources,
        project,
        activeClipId,
        currentTimeMs: usePlayerStore.getState().currentTimeMs,
        savedAt: Date.now(),
      });
      persistProjectDraft(currentDraft);

      // Save draft into the corresponding recentFiles item
      const primaryPath = sources[0].path;
      const existingIndex = recentFiles.findIndex(
        (r) => normalizePathKey(r.path) === normalizePathKey(primaryPath)
      );
      let updatedRecents: RecentItem[];
      if (existingIndex >= 0) {
        updatedRecents = recentFiles.map((r, i) =>
          i === existingIndex ? { ...r, lastOpened: Date.now(), draft: currentDraft! } : r
        );
      } else {
        const probe = sources[0].probe;
        const newItem: RecentItem = {
          path: primaryPath,
          filename: sources[0].filename,
          durationMs: probe.durationMs,
          width: probe.video?.width,
          height: probe.video?.height,
          sizeBytes: probe.sizeBytes,
          lastOpened: Date.now(),
          draft: currentDraft,
        };
        updatedRecents = [newItem, ...recentFiles].slice(0, 8);
      }
      persistRecentFiles(updatedRecents);
      set({ recentFiles: updatedRecents });
    }

    usePlayerStore.getState().pause();
    usePlayerStore.getState().seek(0);
    useHistoryStore.getState().clearHistory();
    set({
      isProjectOpen: false,
      sources: [],
      project: {
        clips: [],
        aspect: initialAspect,
        fitMode: 'fit',
        crop: initialCrop,
        padding: initialPadding,
        output: initialOutput,
        audio: initialAudio,
      },
      activeClipId: null,
      draft: currentDraft,
    });
  },

  restoreDraft: () => {
    cancelPendingAutoSave();
    const draft = get().draft || loadProjectDraft();
    if (!draft || !draft.project || draft.project.clips.length === 0) return;
    const cleanDraft = sanitizeProjectDraft(draft);
    set({
      isProjectOpen: true,
      sources: cleanDraft.sources,
      project: cleanDraft.project,
      activeClipId: cleanDraft.activeClipId || cleanDraft.project.clips[0]?.id || null,
      draft: cleanDraft,
    });
    hydrateRestoredSources(cleanDraft.sources);
    useHistoryStore.getState().clearHistory();
    usePlayerStore.getState().pause();
    if (cleanDraft.currentTimeMs > 0) {
      usePlayerStore.getState().seek(cleanDraft.currentTimeMs);
    } else {
      usePlayerStore.getState().seek(0);
    }
  },

  discardDraft: () => {
    cancelPendingAutoSave();
    persistProjectDraft(null);
    const draft = get().draft;
    if (draft && draft.sources.length > 0) {
      const primaryPath = draft.sources[0].path;
      const updated = get().recentFiles.map((r) =>
        normalizePathKey(r.path) === normalizePathKey(primaryPath) ? { ...r, draft: undefined } : r
      );
      persistRecentFiles(updated);
      set({ draft: null, recentFiles: updated });
    } else {
      set({ draft: null });
    }
  },

  clearProject: () => {
    cancelPendingAutoSave();
    persistProjectDraft(null);
    usePlayerStore.getState().pause();
    usePlayerStore.getState().seek(0);
    useHistoryStore.getState().clearHistory();
    set({
      isProjectOpen: false,
      sources: [],
      project: {
        clips: [],
        aspect: initialAspect,
        fitMode: 'fit',
        crop: initialCrop,
        padding: initialPadding,
        output: initialOutput,
        audio: initialAudio,
      },
      activeClipId: null,
      draft: null,
    });
  },

  reorderClips: (fromIndex: number, toIndex: number) => {
    const clips = [...get().project.clips];
    if (fromIndex < 0 || fromIndex >= clips.length || toIndex < 0 || toIndex >= clips.length) return;
    useHistoryStore.getState().recordChange(clips, 'Reorder clips');
    const [moved] = clips.splice(fromIndex, 1);
    clips.splice(toIndex, 0, moved);
    set((s) => ({ project: { ...s.project, clips } }));
  },

  moveClip: (clipId: string, newStartMs: number, newTrackIndex?: number) => {
    const state = get();
    const previousClips = state.project.clips;
    const targetClip = previousClips.find((c) => c.id === clipId);
    if (!targetClip) return;

    useHistoryStore.getState().recordChange(previousClips, 'Move clip');

    const clampedStartMs = Math.max(0, Math.round(newStartMs));
    const clipDurMs = getClipDurationMs(targetClip);
    const oldTrack = getClipTrackIndex(targetClip);
    let resolvedTrack = newTrackIndex !== undefined ? Math.max(0, Math.floor(newTrackIndex)) : oldTrack;

    // Avoid invisible stacking when moving onto an occupied slot on a track
    if (hasTrackOverlap(previousClips, resolvedTrack, clampedStartMs, clampedStartMs + clipDurMs, clipId)) {
      if (resolvedTrack > 0 || newTrackIndex !== undefined) {
        resolvedTrack = findFreeOverlayTrack(
          previousClips,
          clampedStartMs,
          clampedStartMs + clipDurMs,
          Math.max(1, resolvedTrack),
          clipId
        );
      }
    }

    let nextOverlayBounds = targetClip.overlayBounds;
    if (resolvedTrack > 0 && !nextOverlayBounds) {
      const src = state.sources.find((s) => s.id === targetClip.sourceId);
      const { width: canvasW, height: canvasH } = getCanvasDimensionsForProject(
        state.project,
        state.sources
      );
      nextOverlayBounds = computeDefaultOverlayBounds(
        src?.probe.video?.width || 640,
        src?.probe.video?.height || 360,
        canvasW,
        canvasH,
        targetClip.rotate,
        0.6
      );
    }

    const updated = previousClips.map((c) =>
      c.id === clipId
        ? {
            ...c,
            startMs: clampedStartMs,
            trackIndex: resolvedTrack,
            overlayBounds: resolvedTrack > 0 ? nextOverlayBounds : c.overlayBounds,
          }
        : c
    );

    const compacted = sortClipsByTrackAndStart(compactOverlayTracks(updated));
    set((s) => ({ project: { ...s.project, clips: compacted } }));
  },

  moveClipToTrack: (clipId: string, target: 'overlay' | 'main' | 'up' | 'down') => {
    const state = get();
    const clip = state.project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const currentTrack = getClipTrackIndex(clip);
    const currentStart = getClipStartMs(clip, state.project.clips);

    if (target === 'overlay') {
      state.moveClip(clipId, currentStart, Math.max(1, currentTrack + 1));
    } else if (target === 'up') {
      state.moveClip(clipId, currentStart, currentTrack + 1);
    } else if (target === 'down') {
      if (currentTrack === 0) return;
      state.moveClip(clipId, currentStart, currentTrack - 1);
    } else if (target === 'main') {
      if (currentTrack === 0) return;
      // Place at current start if V1 is free there, else append to end of V1
      const dur = getClipDurationMs(clip);
      const freeOnMain = !hasTrackOverlap(state.project.clips, 0, currentStart, currentStart + dur, clipId);
      const destStart = freeOnMain
        ? currentStart
        : state.project.clips
            .filter((c) => c.id !== clipId && getClipTrackIndex(c) === 0)
            .reduce((max, c) => Math.max(max, getClipStartMs(c, state.project.clips) + getClipDurationMs(c)), 0);
      state.moveClip(clipId, destStart, 0);
    }
  },

  setClipOverlayBounds: (clipId: string, bounds: CropRect, recordHistory = false) => {
    const currentClips = get().project.clips;
    if (recordHistory) {
      useHistoryStore.getState().recordChange(currentClips, 'Adjust overlay transform');
    }
    const clips = currentClips.map((c) =>
      c.id === clipId ? { ...c, overlayBounds: { ...bounds } } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  fitOverlayToCanvas: (clipId: string) => {
    const state = get();
    const clip = state.project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const src = state.sources.find((s) => s.id === clip.sourceId);
    const { width: canvasW, height: canvasH } = getCanvasDimensionsForProject(
      state.project,
      state.sources
    );
    const fitted = computeDefaultOverlayBounds(
      src?.probe.video?.width || 640,
      src?.probe.video?.height || 360,
      canvasW,
      canvasH,
      clip.rotate,
      1.0
    );
    state.setClipOverlayBounds(clipId, fitted, true);
  },

  removeClip: (clipId: string) => {
    const previousClips = get().project.clips;
    const index = previousClips.findIndex((c) => c.id === clipId);
    if (index === -1) return;
    useHistoryStore.getState().recordChange(previousClips, 'Remove clip');

    const removed = previousClips[index];
    const removedTrack = getClipTrackIndex(removed);
    const removedDurationMs = getClipDurationMs(removed);
    const removedStartMs = getClipStartMs(removed, previousClips);

    // Ripple-shift ONLY subsequent main-track (V1) clips when removing a V1 clip.
    // Removing an overlay clip leaves all other clips' positions untouched and collapses empty overlay lanes.
    const rawRemaining = previousClips
      .filter((c) => c.id !== clipId)
      .map((c) => {
        if (
          removedTrack === 0 &&
          getClipTrackIndex(c) === 0 &&
          c.startMs !== undefined &&
          c.startMs >= removedStartMs
        ) {
          return { ...c, startMs: Math.max(0, c.startMs - removedDurationMs) };
        }
        return c;
      });

    const clips = sortClipsByTrackAndStart(compactOverlayTracks(rawRemaining));

    let activeClipId = get().activeClipId;
    if (activeClipId === clipId) {
      if (clips.length === 0) {
        activeClipId = null;
      } else if (index < clips.length) {
        activeClipId = clips[index].id;
      } else {
        activeClipId = clips[clips.length - 1].id;
      }
    }
    if (clips.length === 0) {
      usePlayerStore.getState().pause();
      usePlayerStore.getState().seek(0);
    } else {
      const newTotalDuration = getTimelineTotalDurationMs(clips);
      if (usePlayerStore.getState().currentTimeMs > newTotalDuration) {
        usePlayerStore.getState().seek(newTotalDuration);
      }
    }
    set((s) => ({
      project: { ...s.project, clips },
      activeClipId,
    }));
  },

  toggleClipEnabled: (clipId: string) => {
    const previousClips = get().project.clips;
    useHistoryStore.getState().recordChange(previousClips, 'Toggle clip');
    const clips = previousClips.map((c) =>
      c.id === clipId ? { ...c, enabled: !c.enabled } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  duplicateClip: (clipId: string) => {
    const clips = [...get().project.clips];
    const index = clips.findIndex((c) => c.id === clipId);
    if (index === -1) return;
    useHistoryStore.getState().recordChange(clips, 'Duplicate clip');
    const original = clips[index];
    const origDur = getClipDurationMs(original);
    const origStart = getClipStartMs(original, clips);
    const origTrack = getClipTrackIndex(original);
    const duplicateStart = origStart + origDur;
    const duplicateTrack =
      origTrack > 0 && hasTrackOverlap(clips, origTrack, duplicateStart, duplicateStart + origDur)
        ? findFreeOverlayTrack(clips, duplicateStart, duplicateStart + origDur, origTrack + 1)
        : origTrack;

    const duplicate: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      startMs: duplicateStart,
      trackIndex: duplicateTrack,
      overlayBounds: original.overlayBounds ? { ...original.overlayBounds } : undefined,
    };
    clips.splice(index + 1, 0, duplicate);
    set((s) => ({
      project: { ...s.project, clips: sortClipsByTrackAndStart(clips) },
      activeClipId: duplicate.id,
    }));
  },

  splitClip: (clipId: string, splitTimeMs: number) => {
    const clips = [...get().project.clips];
    const index = clips.findIndex((c) => c.id === clipId);
    if (index === -1) return;
    const original = clips[index];

    if (splitTimeMs <= original.inMs || splitTimeMs >= original.outMs) return;
    useHistoryStore.getState().recordChange(clips, 'Split clip');

    const origSpeed = original.speed && original.speed > 0 ? original.speed : 1.0;
    const splitOffsetMs = Math.round((splitTimeMs - original.inMs) / origSpeed);
    const origStartMs = getClipStartMs(original, clips);

    const firstClip: Clip = {
      ...original,
      outMs: splitTimeMs,
      startMs: origStartMs,
      overlayBounds: original.overlayBounds ? { ...original.overlayBounds } : undefined,
    };

    const secondClip: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      inMs: splitTimeMs,
      startMs: origStartMs + splitOffsetMs,
      overlayBounds: original.overlayBounds ? { ...original.overlayBounds } : undefined,
    };

    clips.splice(index, 1, firstClip, secondClip);
    set((s) => ({
      project: { ...s.project, clips: sortClipsByTrackAndStart(clips) },
      activeClipId: secondClip.id,
    }));
  },

  trimClip: (
    clipId: string,
    inMs: number,
    outMs: number,
    recordHistory = false,
    newStartMs?: number
  ) => {
    if (recordHistory) {
      useHistoryStore.getState().recordChange(get().project.clips, 'Trim clip');
    }
    const clips = get().project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const src = get().sources.find((s) => s.id === c.sourceId);
      const isImg = isImageSource(src);
      const maxDuration = isImg
        ? MAX_IMAGE_CLIP_DURATION_MS
        : src
          ? Math.round(src.probe.durationMs)
          : Math.round(Math.max(outMs, c.outMs));
      const roundedIn = Math.round(inMs);
      const roundedOut = Math.round(outMs);
      const clampedIn = Math.max(0, Math.min(roundedIn, roundedOut - 50));
      const clampedOut = Math.min(maxDuration, Math.max(clampedIn + 50, roundedOut));
      return {
        ...c,
        inMs: clampedIn,
        outMs: clampedOut,
        ...(newStartMs !== undefined ? { startMs: Math.max(0, Math.round(newStartMs)) } : {}),
      };
    });
    set((s) => ({ project: { ...s.project, clips } }));
  },

  undo: () => {
    const currentClips = get().project.clips;
    const restoredClips = useHistoryStore.getState().undo(currentClips);
    if (restoredClips) {
      set((s) => ({
        project: { ...s.project, clips: restoredClips },
        activeClipId: restoredClips.find((c) => c.id === s.activeClipId)?.id || restoredClips[0]?.id || null,
      }));
    }
  },

  redo: () => {
    const currentClips = get().project.clips;
    const nextClips = useHistoryStore.getState().redo(currentClips);
    if (nextClips) {
      set((s) => ({
        project: { ...s.project, clips: nextClips },
        activeClipId: nextClips.find((c) => c.id === s.activeClipId)?.id || nextClips[0]?.id || null,
      }));
    }
  },

  removeRecentFile: (path: string) => {
    const updated = get().recentFiles.filter((r) => r.path !== path);
    persistRecentFiles(updated);
    const draft = get().draft;
    const isSameDraft = draft && draft.sources.some((s) => s.path === path);
    if (isSameDraft) {
      persistProjectDraft(null);
      set({ recentFiles: updated, draft: null });
    } else {
      set({ recentFiles: updated });
    }
  },

  clearRecentFiles: () => {
    persistRecentFiles([]);
    persistProjectDraft(null);
    set({ recentFiles: [], draft: null });
  },

  setActiveClipId: (id) => set({ activeClipId: id }),

  setAspect: (aspect, syncCrop = false) => {
    if (!syncCrop || get().project.fitMode !== 'crop') {
      set((s) => ({
        project: {
          ...s.project,
          aspect,
          fitBounds: null,
          stretchBounds: null,
        },
      }));
      return;
    }
    const activeId = get().activeClipId;
    const activeClip = get().project.clips.find((c) => c.id === activeId);
    const source = activeClip ? get().sources.find((s) => s.id === activeClip.sourceId) : get().sources[0];
    const srcW = source?.probe.video?.width || 1920;
    const srcH = source?.probe.video?.height || 1080;
    const targetRatio = resolveAspectRatio(aspect, srcW, srcH);
    const srcRatio = srcW / srcH;

    let crop: CropRect;
    if (srcRatio > targetRatio) {
      const widthRatio = Math.max(0.01, Math.min(1, targetRatio / srcRatio));
      crop = { x: (1 - widthRatio) / 2, y: 0, width: widthRatio, height: 1 };
    } else {
      const heightRatio = Math.max(0.01, Math.min(1, srcRatio / targetRatio));
      crop = { x: 0, y: (1 - heightRatio) / 2, width: 1, height: heightRatio };
    }
    set((s) => ({
      project: {
        ...s.project,
        aspect,
        crop,
        fitBounds: null,
        stretchBounds: null,
      },
    }));
  },

  setFitMode: (fitMode) => {
    const currentProject = get().project;
    if (
      fitMode === 'crop' &&
      currentProject.aspect.id !== 'original' &&
      currentProject.crop.x === 0 &&
      currentProject.crop.y === 0 &&
      currentProject.crop.width === 1 &&
      currentProject.crop.height === 1
    ) {
      const activeId = get().activeClipId;
      const activeClip = currentProject.clips.find((c) => c.id === activeId);
      const source = activeClip ? get().sources.find((s) => s.id === activeClip.sourceId) : get().sources[0];
      const srcW = source?.probe.video?.width || 1920;
      const srcH = source?.probe.video?.height || 1080;
      const targetRatio = resolveAspectRatio(currentProject.aspect, srcW, srcH);
      const srcRatio = srcW / srcH;

      let crop: CropRect;
      if (srcRatio > targetRatio) {
        const widthRatio = Math.max(0.01, Math.min(1, targetRatio / srcRatio));
        crop = { x: (1 - widthRatio) / 2, y: 0, width: widthRatio, height: 1 };
      } else {
        const heightRatio = Math.max(0.01, Math.min(1, srcRatio / targetRatio));
        crop = { x: 0, y: (1 - heightRatio) / 2, width: 1, height: heightRatio };
      }
      set((s) => ({
        project: {
          ...s.project,
          fitMode,
          crop,
        },
      }));
      return;
    }

    set((s) => ({
      project: {
        ...s.project,
        fitMode,
      },
    }));
  },

  setCrop: (crop) => set((s) => ({ project: { ...s.project, crop } })),
  setFitBounds: (fitBounds) => set((s) => ({ project: { ...s.project, fitBounds } })),
  setStretchBounds: (stretchBounds) => set((s) => ({ project: { ...s.project, stretchBounds } })),
  setPadding: (padding) => set((s) => ({ project: { ...s.project, padding } })),

  setRotate: (clipId: string, rotate: RotateAngle) => {
    const state = get();
    const target = state.project.clips.find((c) => c.id === clipId);
    if (!target) return;
    useHistoryStore.getState().recordChange(state.project.clips, 'Rotate clip');

    const wasQuarter = target.rotate === 90 || target.rotate === 270;
    const isQuarter = rotate === 90 || rotate === 270;
    const flippedAxes = wasQuarter !== isQuarter;

    let updatedBounds = target.overlayBounds;
    if (getClipTrackIndex(target) > 0 && flippedAxes && target.overlayBounds) {
      const { width: canvasW, height: canvasH } = getCanvasDimensionsForProject(
        state.project,
        state.sources
      );
      const pxW = target.overlayBounds.width * canvasW;
      const pxH = target.overlayBounds.height * canvasH;
      const newNormW = Math.max(0.05, Math.min(1, pxH / canvasW));
      const newNormH = Math.max(0.05, Math.min(1, pxW / canvasH));
      const cx = target.overlayBounds.x + target.overlayBounds.width / 2;
      const cy = target.overlayBounds.y + target.overlayBounds.height / 2;
      updatedBounds = {
        x: cx - newNormW / 2,
        y: cy - newNormH / 2,
        width: newNormW,
        height: newNormH,
      };
    }

    const clips = state.project.clips.map((c) =>
      c.id === clipId ? { ...c, rotate, overlayBounds: updatedBounds } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  rotateActiveClip: (direction: 'cw' | 'ccw') => {
    const activeId = get().activeClipId;
    if (!activeId) return;
    const clip = get().project.clips.find((c) => c.id === activeId);
    if (!clip) return;
    const current = clip.rotate || 0;
    const delta = direction === 'cw' ? 90 : 270;
    const nextRotate = ((current + delta) % 360) as RotateAngle;
    get().setRotate(activeId, nextRotate);
  },

  toggleFlipH: (clipId: string) => {
    useHistoryStore.getState().recordChange(get().project.clips, 'Flip clip horizontally');
    const clips = get().project.clips.map((c) =>
      c.id === clipId ? { ...c, flipH: !c.flipH } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  toggleFlipV: (clipId: string) => {
    useHistoryStore.getState().recordChange(get().project.clips, 'Flip clip vertically');
    const clips = get().project.clips.map((c) =>
      c.id === clipId ? { ...c, flipV: !c.flipV } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  applyTransformToAll: () => {
    const activeId = get().activeClipId;
    const activeClip = get().project.clips.find((c) => c.id === activeId);
    if (!activeClip) return;
    useHistoryStore.getState().recordChange(get().project.clips, 'Apply transform to all clips');
    const clips = get().project.clips.map((c) => ({
      ...c,
      rotate: activeClip.rotate,
      flipH: activeClip.flipH,
      flipV: activeClip.flipV,
      cropOverride: activeClip.cropOverride ? { ...activeClip.cropOverride } : undefined,
      speed: activeClip.speed ?? 1.0,
    }));
    set((s) => ({ project: { ...s.project, clips } }));
  },

  setCropPosition: (pos: 'center' | 'top' | 'bottom' | 'left' | 'right') => {
    const activeId = get().activeClipId;
    const currentProject = get().project;
    const activeClip = currentProject.clips.find((c) => c.id === activeId);

    // If an overlay clip is selected, align its overlayBounds on the canvas
    if (activeClip && getClipTrackIndex(activeClip) > 0) {
      const src = get().sources.find((s) => s.id === activeClip.sourceId);
      const { width: canvasW, height: canvasH } = getCanvasDimensionsForProject(
        currentProject,
        get().sources
      );
      const baseBounds =
        activeClip.overlayBounds ||
        computeDefaultOverlayBounds(
          src?.probe.video?.width || 640,
          src?.probe.video?.height || 360,
          canvasW,
          canvasH,
          activeClip.rotate,
          0.6
        );
      let x = (1 - baseBounds.width) / 2;
      let y = (1 - baseBounds.height) / 2;
      if (pos === 'left') x = 0;
      else if (pos === 'right') x = 1 - baseBounds.width;
      if (pos === 'top') y = 0;
      else if (pos === 'bottom') y = 1 - baseBounds.height;
      get().setClipOverlayBounds(activeClip.id, { ...baseBounds, x, y }, true);
      return;
    }

    const source = activeClip ? get().sources.find((s) => s.id === activeClip.sourceId) : get().sources[0];
    const srcW = source?.probe.video?.width || 1920;
    const srcH = source?.probe.video?.height || 1080;
    const targetRatio = resolveAspectRatio(currentProject.aspect, srcW, srcH);
    const srcRatio = srcW / srcH;

    if (currentProject.fitMode === 'fit') {
      let baseBounds = currentProject.fitBounds;
      if (!baseBounds) {
        if (srcRatio > targetRatio) {
          const h = targetRatio / srcRatio;
          baseBounds = { x: 0, y: (1 - h) / 2, width: 1, height: h };
        } else {
          const w = srcRatio / targetRatio;
          baseBounds = { x: (1 - w) / 2, y: 0, width: w, height: 1 };
        }
      }
      let x = (1 - baseBounds.width) / 2;
      let y = (1 - baseBounds.height) / 2;
      if (pos === 'left') x = 0;
      else if (pos === 'right') x = 1 - baseBounds.width;
      if (pos === 'top') y = 0;
      else if (pos === 'bottom') y = 1 - baseBounds.height;
      set((s) => ({
        project: {
          ...s.project,
          fitBounds: { ...baseBounds!, x, y },
        },
      }));
      return;
    }

    if (currentProject.fitMode === 'stretch') {
      const baseBounds = currentProject.stretchBounds || { x: 0, y: 0, width: 1, height: 1 };
      let x = (1 - baseBounds.width) / 2;
      let y = (1 - baseBounds.height) / 2;
      if (pos === 'left') x = 0;
      else if (pos === 'right') x = 1 - baseBounds.width;
      if (pos === 'top') y = 0;
      else if (pos === 'bottom') y = 1 - baseBounds.height;
      set((s) => ({
        project: {
          ...s.project,
          stretchBounds: { ...baseBounds, x, y },
        },
      }));
      return;
    }

    const currentCrop = currentProject.crop;
    const hasCustomCrop =
      currentCrop &&
      currentCrop.width > 0 &&
      currentCrop.height > 0 &&
      (currentCrop.width < 1 || currentCrop.height < 1 || currentCrop.x > 0 || currentCrop.y > 0);

    if (hasCustomCrop) {
      let x = (1 - currentCrop.width) / 2;
      let y = (1 - currentCrop.height) / 2;
      if (pos === 'left') x = 0;
      else if (pos === 'right') x = 1 - currentCrop.width;
      if (pos === 'top') y = 0;
      else if (pos === 'bottom') y = 1 - currentCrop.height;
      set((s) => ({
        project: {
          ...s.project,
          crop: { ...currentCrop, x, y },
        },
      }));
      return;
    }

    let crop: CropRect;
    if (srcRatio > targetRatio) {
      const widthRatio = targetRatio / srcRatio;
      let x = (1 - widthRatio) / 2;
      if (pos === 'left') x = 0;
      else if (pos === 'right') x = 1 - widthRatio;
      crop = { x, y: 0, width: widthRatio, height: 1 };
    } else {
      const heightRatio = srcRatio / targetRatio;
      let y = (1 - heightRatio) / 2;
      if (pos === 'top') y = 0;
      else if (pos === 'bottom') y = 1 - heightRatio;
      crop = { x: 0, y, width: 1, height: heightRatio };
    }
    set((s) => ({ project: { ...s.project, crop } }));
  },

  setOutput: (output) => set((s) => ({ project: { ...s.project, output: { ...s.project.output, ...output } } })),
  setAudio: (audio) => set((s) => ({ project: { ...s.project, audio: { ...s.project.audio, ...audio } } })),
  setClipVolume: (clipId: string, volumeDb: number) => {
    useHistoryStore.getState().recordChange(get().project.clips, 'Adjust clip volume');
    const clips = get().project.clips.map((c) =>
      c.id === clipId ? { ...c, volumeDb } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  setClipSpeed: (clipId: string, speed: number) => {
    const clamped = Math.max(0.01, Math.min(999, Number.isFinite(speed) ? speed : 1.0));
    useHistoryStore.getState().recordChange(get().project.clips, 'Adjust clip speed');
    const currentClips = get().project.clips;
    const oldClip = currentClips.find((c) => c.id === clipId);
    const oldSpeed = oldClip?.speed || 1.0;

    const clips = currentClips.map((c) =>
      c.id === clipId ? { ...c, speed: clamped } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));

    // Keep playhead on the same visual frame and within new duration bounds
    try {
      const player = usePlayerStore.getState();
      const currMs = player.currentTimeMs;
      if (oldClip && oldClip.enabled && Math.abs(oldSpeed - clamped) > 0.0001) {
        const clipStart = getClipStartMs(oldClip, currentClips);
        const oldDuration = Math.round((oldClip.outMs - oldClip.inMs) / oldSpeed);
        if (currMs >= clipStart && currMs <= clipStart + oldDuration) {
          const offset = currMs - clipStart;
          const sourceOffset = offset * oldSpeed;
          const newOffset = Math.round(sourceOffset / clamped);
          player.seek(clipStart + newOffset);
          return;
        }
      }
      const totalDuration = getTimelineTotalDurationMs(clips);
      if (currMs > totalDuration && totalDuration > 0) {
        player.seek(totalDuration);
      }
    } catch {
      // Player store not ready yet
    }
  },

  setClipSharpness: (clipId: string, sharpness: number, recordHistory = true) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(sharpness) ? Math.round(sharpness * 100) / 100 : 0));
    const currentClips = get().project.clips;
    const target = currentClips.find((c) => c.id === clipId);
    if (!target) return;
    if (Math.abs((target.sharpness ?? 0) - clamped) < 0.001) return;

    if (recordHistory) {
      useHistoryStore.getState().recordChange(currentClips, 'Adjust clip sharpness');
    }
    const clips = currentClips.map((c) =>
      c.id === clipId ? { ...c, sharpness: clamped } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  applySharpnessToAll: () => {
    const { project, activeClipId } = get();
    const sourceClip = project.clips.find((c) => c.id === activeClipId) || project.clips[0];
    if (!sourceClip || project.clips.length <= 1) return;

    const targetSharpness = sourceClip.sharpness ?? 0;
    useHistoryStore.getState().recordChange(project.clips, 'Apply sharpness to all clips');
    const clips = project.clips.map((c) => ({ ...c, sharpness: targetSharpness }));
    set((s) => ({ project: { ...s.project, clips } }));
  },

  updateSourceAfterReplace: (sourceId: string, newProbe: ProbeResult) => {
    set((state) => {
      const updatedSources = state.sources.map((s) =>
        s.id === sourceId ? { ...stripSourceTransientPaths(s), probe: newProbe } : s
      );
      const updatedClips = state.project.clips.map((c) =>
        c.sourceId === sourceId
          ? { ...c, inMs: 0, outMs: newProbe.durationMs }
          : c
      );
      return {
        ...state,
        sources: updatedSources,
        project: {
          ...state.project,
          clips: updatedClips,
        },
      };
    });
  },
}));

useProjectStore.subscribe((state, prevState) => {
  if (
    state.project !== prevState.project ||
    state.sources !== prevState.sources ||
    state.activeClipId !== prevState.activeClipId
  ) {
    if (state.project.clips.length > 0 && state.sources.length > 0) {
      cancelPendingAutoSave();
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        const latest = useProjectStore.getState();
        if (latest.project.clips.length === 0 || latest.sources.length === 0) {
          return;
        }
        const draft = sanitizeProjectDraft({
          version: 1,
          sources: latest.sources,
          project: latest.project,
          activeClipId: latest.activeClipId,
          currentTimeMs: usePlayerStore.getState().currentTimeMs,
          savedAt: Date.now(),
        });
        persistProjectDraft(draft);

        const primaryPath = latest.sources[0]?.path;
        if (primaryPath) {
          const recents = latest.recentFiles;
          const idx = recents.findIndex(
            (r) => normalizePathKey(r.path) === normalizePathKey(primaryPath)
          );
          if (idx >= 0) {
            const updated = recents.map((r, i) => (i === idx ? { ...r, draft } : r));
            persistRecentFiles(updated);
            useProjectStore.setState({ recentFiles: updated, draft });
          }
        }
      }, 400);
    } else {
      cancelPendingAutoSave();
    }
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cancelPendingAutoSave();
    const state = useProjectStore.getState();
    if (state.project.clips.length > 0 && state.sources.length > 0) {
      const draft = sanitizeProjectDraft({
        version: 1,
        sources: state.sources,
        project: state.project,
        activeClipId: state.activeClipId,
        currentTimeMs: usePlayerStore.getState().currentTimeMs,
        savedAt: Date.now(),
      });
      persistProjectDraft(draft);

      const primaryPath = state.sources[0]?.path;
      if (primaryPath) {
        const recents = state.recentFiles;
        const idx = recents.findIndex(
          (r) => normalizePathKey(r.path) === normalizePathKey(primaryPath)
        );
        if (idx >= 0) {
          const updated = recents.map((r, i) => (i === idx ? { ...r, draft } : r));
          persistRecentFiles(updated);
        }
      }
    }
  });
}
