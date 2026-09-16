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
} from '../shared/types';
import { probeFile } from '../shared/ipc';

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
  removeRecentFile: (path: string) => void;
  clearRecentFiles: () => void;
  setActiveClipId: (id: string | null) => void;
  setAspect: (aspect: AspectSetting) => void;
  setFitMode: (mode: FitMode) => void;
  setCrop: (crop: CropRect) => void;
  setPadding: (padding: PadSetting) => void;
  setOutput: (output: Partial<OutputSettings>) => void;
  setAudio: (audio: Partial<AudioSettings>) => void;
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
const initialPadding: PadSetting = { mode: 'blur', blurStrength: 40 };
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
    const [moved] = clips.splice(fromIndex, 1);
    clips.splice(toIndex, 0, moved);
    set((s) => ({ project: { ...s.project, clips } }));
  },

  removeClip: (clipId: string) => {
    const clips = get().project.clips.filter((c) => c.id !== clipId);
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
    const clips = get().project.clips.map((c) =>
      c.id === clipId ? { ...c, enabled: !c.enabled } : c
    );
    set((s) => ({ project: { ...s.project, clips } }));
  },

  duplicateClip: (clipId: string) => {
    const clips = [...get().project.clips];
    const index = clips.findIndex((c) => c.id === clipId);
    if (index === -1) return;
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
  setOutput: (output) => set((s) => ({ project: { ...s.project, output: { ...s.project.output, ...output } } })),
  setAudio: (audio) => set((s) => ({ project: { ...s.project, audio: { ...s.project.audio, ...audio } } })),
}));
