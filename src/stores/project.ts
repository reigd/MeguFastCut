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
import { probeFile } from '../shared/ipc';
import { useHistoryStore } from './history';
import { resolveAspectRatio } from '../shared/geometry';

export interface RecentItem {
  path: string;
  filename: string;
  durationMs: number;
  width?: number;
  height?: number;
  sizeBytes: number;
  lastOpened: number;
}

interface ProjectState {
  sources: SourceFile[];
  project: Project;
  activeClipId: string | null;
  recentFiles: RecentItem[];
  isLoading: boolean;
  loadingMessage: string;

  // Actions
  addFiles: (paths: string[]) => Promise<void>;
  clearProject: () => void;
  reorderClips: (fromIndex: number, toIndex: number) => void;
  removeClip: (clipId: string) => void;
  toggleClipEnabled: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  splitClip: (clipId: string, splitTimeMs: number) => void;
  trimClip: (clipId: string, inMs: number, outMs: number, recordHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  setActiveClipId: (id: string | null) => void;
  setAspect: (aspect: AspectSetting) => void;
  setFitMode: (mode: FitMode) => void;
  setCrop: (crop: CropRect) => void;
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
  updateSourceAfterReplace: (sourceId: string, newProbe: ProbeResult) => void;
}

const RECENTS_KEY = 'megu-fastcut-recent-files';

function loadRecentFiles(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function persistRecentFiles(items: RecentItem[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // ignore
  }
}

/** Natural comparison for strings with numbers (e.g. clip2 before clip10) */
function naturalSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
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

export const useProjectStore = create<ProjectState>((set, get) => ({
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
  recentFiles: loadRecentFiles(),
  isLoading: false,
  loadingMessage: '',

  addFiles: async (paths: string[]) => {
    if (paths.length === 0) return;

    set({ isLoading: true, loadingMessage: 'Analyzing media...' });

    // Natural sort paths
    const sortedPaths = [...paths].sort((a, b) => {
      const nameA = a.split(/[/\\]/).pop() || a;
      const nameB = b.split(/[/\\]/).pop() || b;
      return naturalSort(nameA, nameB);
    });

    const newSources: SourceFile[] = [];
    const newClips: Clip[] = [];
    const currentSources = [...get().sources];
    const currentClips = [...get().project.clips];

    for (const p of sortedPaths) {
      const filename = p.split(/[/\\]/).pop() || p;
      try {
        const probe = await probeFile(p);
        const sourceId = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const source: SourceFile = {
          id: sourceId,
          path: p,
          filename,
          probe,
        };
        newSources.push(source);

        const clip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sourceId,
          inMs: 0,
          outMs: probe.durationMs,
          enabled: true,
          rotate: 0,
          flipH: false,
          flipV: false,
          volumeDb: 0,
        };
        newClips.push(clip);

        // Update recents
        const currentRecents = get().recentFiles.filter((r) => r.path !== p);
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
      }
    }

    const allSources = [...currentSources, ...newSources];
    const allClips = [...currentClips, ...newClips];

    set({
      sources: allSources,
      project: {
        ...get().project,
        clips: allClips,
      },
      activeClipId: get().activeClipId || allClips[0]?.id || null,
      isLoading: false,
      loadingMessage: '',
    });
  },

  clearProject: () => {
    set({
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

  reorderClips: (fromIndex: number, toIndex: number) => {
    const clips = [...get().project.clips];
    if (fromIndex < 0 || fromIndex >= clips.length || toIndex < 0 || toIndex >= clips.length) return;
    useHistoryStore.getState().recordChange(clips, 'Reorder clips');
    const [moved] = clips.splice(fromIndex, 1);
    clips.splice(toIndex, 0, moved);
    set((s) => ({ project: { ...s.project, clips } }));
  },

  removeClip: (clipId: string) => {
    const previousClips = get().project.clips;
    useHistoryStore.getState().recordChange(previousClips, 'Remove clip');
    const clips = previousClips.filter((c) => c.id !== clipId);
    let activeClipId = get().activeClipId;
    if (activeClipId === clipId) {
      activeClipId = clips[0]?.id || null;
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
    const duplicate: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };
    clips.splice(index + 1, 0, duplicate);
    set((s) => ({
      project: { ...s.project, clips },
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

    const firstClip: Clip = {
      ...original,
      outMs: splitTimeMs,
    };

    const secondClip: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      inMs: splitTimeMs,
    };

    clips.splice(index, 1, firstClip, secondClip);
    set((s) => ({
      project: { ...s.project, clips },
      activeClipId: secondClip.id,
    }));
  },

  trimClip: (clipId: string, inMs: number, outMs: number, recordHistory = false) => {
    if (recordHistory) {
      useHistoryStore.getState().recordChange(get().project.clips, 'Trim clip');
    }
    const clips = get().project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const src = get().sources.find((s) => s.id === c.sourceId);
      const maxDuration = src ? src.probe.durationMs : Math.max(outMs, c.outMs);
      const clampedIn = Math.max(0, Math.min(inMs, outMs - 50));
      const clampedOut = Math.min(maxDuration, Math.max(clampedIn + 50, outMs));
      return {
        ...c,
        inMs: clampedIn,
        outMs: clampedOut,
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
    set({ recentFiles: updated });
  },

  clearRecentFiles: () => {
    persistRecentFiles([]);
    set({ recentFiles: [] });
  },

  setActiveClipId: (id) => set({ activeClipId: id }),
  setAspect: (aspect) => set((s) => ({ project: { ...s.project, aspect } })),
  setFitMode: (fitMode) => set((s) => ({ project: { ...s.project, fitMode } })),
  setCrop: (crop) => set((s) => ({ project: { ...s.project, crop } })),
  setPadding: (padding) => set((s) => ({ project: { ...s.project, padding } })),

  setRotate: (clipId: string, rotate: RotateAngle) => {
    useHistoryStore.getState().recordChange(get().project.clips, 'Rotate clip');
    const clips = get().project.clips.map((c) =>
      c.id === clipId ? { ...c, rotate } : c
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
    }));
    set((s) => ({ project: { ...s.project, clips } }));
  },

  setCropPosition: (pos: 'center' | 'top' | 'bottom' | 'left' | 'right') => {
    const activeId = get().activeClipId;
    const activeClip = get().project.clips.find((c) => c.id === activeId);
    const source = activeClip ? get().sources.find((s) => s.id === activeClip.sourceId) : get().sources[0];
    const srcW = source?.probe.video?.width || 1920;
    const srcH = source?.probe.video?.height || 1080;
    const targetRatio = resolveAspectRatio(get().project.aspect, srcW, srcH);
    const srcRatio = srcW / srcH;

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

  updateSourceAfterReplace: (sourceId: string, newProbe: ProbeResult) => {
    set((state) => {
      const updatedSources = state.sources.map((s) =>
        s.id === sourceId ? { ...s, probe: newProbe } : s
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
