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
import { usePlayerStore } from './player';
import { resolveAspectRatio } from '../shared/geometry';

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
  importSources: (paths: string[]) => Promise<void>;
  addClipFromSource: (sourceId: string, atTimeMs?: number) => void;
  removeSource: (sourceId: string) => void;
  addFiles: (paths: string[]) => Promise<void>;
  openRecentProject: (item: RecentItem) => Promise<void>;
  closeProject: () => void;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearProject: () => void;
  reorderClips: (fromIndex: number, toIndex: number) => void;
  moveClip: (clipId: string, newStartMs: number) => void;
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
  setAspect: (aspect: AspectSetting, syncCrop?: boolean) => void;
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
  setClipSpeed: (clipId: string, speed: number) => void;
  updateSourceAfterReplace: (sourceId: string, newProbe: ProbeResult) => void;
}

const RECENTS_KEY = 'megu-fastcut-recent-files';
const DRAFT_KEY = 'megu-fastcut-project-draft';

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
      return parsed;
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
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }
  } catch (err) {
    console.error('Failed to persist project draft:', err);
  }
}

function loadRecentFiles(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (raw) {
      const items = JSON.parse(raw) as RecentItem[];
      const draft = loadProjectDraft();
      if (draft && draft.sources && draft.sources.length > 0) {
        return items.map((it) => {
          if (!it.draft && draft.sources.some((s) => s.path === it.path)) {
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

const initialDraft = loadProjectDraft();

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

  importSources: async (paths: string[]) => {
    if (paths.length === 0) return;
    set({ isLoading: true, loadingMessage: 'Importing media...' });

    const newSources: SourceFile[] = [];
    const currentSources = [...get().sources];

    for (const p of paths) {
      if (currentSources.some((s) => s.path === p)) {
        continue;
      }
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

    set({
      sources: [...currentSources, ...newSources],
      isProjectOpen: true,
      isLoading: false,
      loadingMessage: '',
    });
  },

  addClipFromSource: (sourceId: string, atTimeMs?: number) => {
    const source = get().sources.find((s) => s.id === sourceId);
    if (!source) return;

    useHistoryStore.getState().recordChange(get().project.clips, 'Add clip from media library');

    const currentClips = [...get().project.clips];
    let nextStartMs = 0;

    if (atTimeMs !== undefined && atTimeMs >= 0) {
      nextStartMs = atTimeMs;
    } else {
      nextStartMs = currentClips.reduce((max, c) => {
        const dur = Math.round((c.outMs - c.inMs) / (c.speed || 1.0));
        return Math.max(max, (c.startMs ?? 0) + dur);
      }, 0);
    }

    const newClip: Clip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceId,
      inMs: 0,
      outMs: source.probe.durationMs,
      startMs: nextStartMs,
      enabled: true,
      rotate: 0,
      flipH: false,
      flipV: false,
      volumeDb: 0,
      speed: 1.0,
    };

    set({
      project: {
        ...get().project,
        clips: [...currentClips, newClip],
      },
      activeClipId: newClip.id,
      isProjectOpen: true,
    });
    usePlayerStore.getState().seek(nextStartMs);
  },

  removeSource: (sourceId: string) => {
    const currentClips = get().project.clips;
    const remainingClips = currentClips.filter((c) => c.sourceId !== sourceId);
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

  addFiles: async (paths: string[]) => {
    if (paths.length === 0) return;

    // If opening a single file from the Welcome Screen, check if it has a saved project draft
    if (get().sources.length === 0 && paths.length === 1) {
      const p = paths[0];
      const matchingRecent = get().recentFiles.find((r) => r.path === p);
      if (matchingRecent?.draft && matchingRecent.draft.project.clips.length > 0) {
        await get().openRecentProject(matchingRecent);
        return;
      }
      const globalDraft = get().draft || loadProjectDraft();
      if (
        globalDraft &&
        globalDraft.sources.length === 1 &&
        globalDraft.sources[0].path === p &&
        globalDraft.project.clips.length > 0
      ) {
        get().restoreDraft();
        return;
      }
    }

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

        let nextStartMs = currentClips.reduce((max, c) => {
          const dur = Math.round((c.outMs - c.inMs) / (c.speed || 1.0));
          return Math.max(max, (c.startMs ?? 0) + dur);
        }, 0);
        for (const nc of newClips) {
          const dur = Math.round((nc.outMs - nc.inMs) / (nc.speed || 1.0));
          nextStartMs = Math.max(nextStartMs, (nc.startMs ?? 0) + dur);
        }

        const clip: Clip = {
          id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          sourceId,
          inMs: 0,
          outMs: probe.durationMs,
          startMs: nextStartMs,
          enabled: true,
          rotate: 0,
          flipH: false,
          flipV: false,
          volumeDb: 0,
          speed: 1.0,
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
      isProjectOpen: true,
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

  openRecentProject: async (item: RecentItem) => {
    let draftToRestore = item.draft;
    if (!draftToRestore) {
      const globalDraft = get().draft || loadProjectDraft();
      if (globalDraft && globalDraft.sources.some((s) => s.path === item.path)) {
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
      set({
        isProjectOpen: true,
        sources: draftToRestore.sources,
        project: draftToRestore.project,
        activeClipId: draftToRestore.activeClipId || draftToRestore.project.clips[0]?.id || null,
        draft: draftToRestore,
        isLoading: false,
        loadingMessage: '',
      });
      useHistoryStore.getState().clearHistory();
      usePlayerStore.getState().pause();
      if (draftToRestore.currentTimeMs > 0) {
        usePlayerStore.getState().seek(draftToRestore.currentTimeMs);
      } else {
        usePlayerStore.getState().seek(0);
      }

      // Bump to front of recents
      const currentRecents = get().recentFiles;
      const existingIndex = currentRecents.findIndex((r) => r.path === item.path);
      let updatedRecents: RecentItem[];
      if (existingIndex >= 0) {
        const existing = currentRecents[existingIndex];
        const updatedItem: RecentItem = {
          ...existing,
          lastOpened: Date.now(),
          draft: draftToRestore,
        };
        updatedRecents = [
          updatedItem,
          ...currentRecents.filter((_, idx) => idx !== existingIndex),
        ].slice(0, 8);
      } else {
        updatedRecents = [
          { ...item, lastOpened: Date.now(), draft: draftToRestore },
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
    const { sources, project, activeClipId, recentFiles } = get();
    let currentDraft: ProjectDraft | null = null;
    if (project.clips.length > 0 && sources.length > 0) {
      currentDraft = {
        version: 1,
        sources,
        project,
        activeClipId,
        currentTimeMs: usePlayerStore.getState().currentTimeMs,
        savedAt: Date.now(),
      };
      persistProjectDraft(currentDraft);

      // Save draft into the corresponding recentFiles item
      const primaryPath = sources[0].path;
      const existingIndex = recentFiles.findIndex((r) => r.path === primaryPath);
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
    const draft = get().draft || loadProjectDraft();
    if (!draft || !draft.project || draft.project.clips.length === 0) return;
    set({
      isProjectOpen: true,
      sources: draft.sources,
      project: draft.project,
      activeClipId: draft.activeClipId || draft.project.clips[0]?.id || null,
      draft,
    });
    useHistoryStore.getState().clearHistory();
    usePlayerStore.getState().pause();
    if (draft.currentTimeMs > 0) {
      usePlayerStore.getState().seek(draft.currentTimeMs);
    } else {
      usePlayerStore.getState().seek(0);
    }
  },

  discardDraft: () => {
    persistProjectDraft(null);
    const draft = get().draft;
    if (draft && draft.sources.length > 0) {
      const primaryPath = draft.sources[0].path;
      const updated = get().recentFiles.map((r) =>
        r.path === primaryPath ? { ...r, draft: undefined } : r
      );
      persistRecentFiles(updated);
      set({ draft: null, recentFiles: updated });
    } else {
      set({ draft: null });
    }
  },

  clearProject: () => {
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

  moveClip: (clipId: string, newStartMs: number) => {
    const previousClips = get().project.clips;
    useHistoryStore.getState().recordChange(previousClips, 'Move clip');
    const clampedStartMs = Math.max(0, Math.round(newStartMs));
    const clips = previousClips.map((c) =>
      c.id === clipId ? { ...c, startMs: clampedStartMs } : c
    );
    clips.sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    set((s) => ({ project: { ...s.project, clips } }));
  },

  removeClip: (clipId: string) => {
    const previousClips = get().project.clips;
    useHistoryStore.getState().recordChange(previousClips, 'Remove clip');
    const index = previousClips.findIndex((c) => c.id === clipId);
    const clips = previousClips.filter((c) => c.id !== clipId);
    let activeClipId = get().activeClipId;
    if (activeClipId === clipId) {
      if (clips.length === 0) {
        activeClipId = null;
      } else if (index !== -1 && index < clips.length) {
        activeClipId = clips[index].id;
      } else {
        activeClipId = clips[clips.length - 1].id;
      }
    }
    if (clips.length === 0) {
      usePlayerStore.getState().pause();
      usePlayerStore.getState().seek(0);
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
    const origSpeed = original.speed && original.speed > 0 ? original.speed : 1.0;
    const origDur = Math.round((original.outMs - original.inMs) / origSpeed);
    const origStart = original.startMs ?? 0;
    const duplicate: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      startMs: origStart + origDur,
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

    const origSpeed = original.speed && original.speed > 0 ? original.speed : 1.0;
    const splitOffsetMs = Math.round((splitTimeMs - original.inMs) / origSpeed);
    const origStartMs = original.startMs ?? 0;

    const firstClip: Clip = {
      ...original,
      outMs: splitTimeMs,
      startMs: origStartMs,
    };

    const secondClip: Clip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      inMs: splitTimeMs,
      startMs: origStartMs + splitOffsetMs,
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
    if (!syncCrop) {
      set((s) => ({ project: { ...s.project, aspect } }));
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
    set((s) => ({ project: { ...s.project, aspect, crop } }));
  },
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
      speed: activeClip.speed ?? 1.0,
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
        let accBefore = 0;
        for (const c of currentClips) {
          if (!c.enabled) continue;
          if (c.id === clipId) break;
          accBefore += Math.round((c.outMs - c.inMs) / (c.speed || 1.0));
        }
        const oldDuration = Math.round((oldClip.outMs - oldClip.inMs) / oldSpeed);
        if (currMs >= accBefore && currMs <= accBefore + oldDuration) {
          const offset = currMs - accBefore;
          const sourceOffset = offset * oldSpeed;
          const newOffset = Math.round(sourceOffset / clamped);
          player.seek(accBefore + newOffset);
          return;
        }
      }
      const totalDuration = clips.reduce(
        (sum, c) => (c.enabled ? sum + Math.round((c.outMs - c.inMs) / (c.speed || 1.0)) : sum),
        0
      );
      if (currMs > totalDuration && totalDuration > 0) {
        player.seek(totalDuration);
      }
    } catch {
      // Player store not ready yet
    }
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

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

useProjectStore.subscribe((state, prevState) => {
  if (
    state.project !== prevState.project ||
    state.sources !== prevState.sources ||
    state.activeClipId !== prevState.activeClipId
  ) {
    if (state.project.clips.length > 0 && state.sources.length > 0) {
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        const draft: ProjectDraft = {
          version: 1,
          sources: state.sources,
          project: state.project,
          activeClipId: state.activeClipId,
          currentTimeMs: usePlayerStore.getState().currentTimeMs,
          savedAt: Date.now(),
        };
        persistProjectDraft(draft);

        // Also update matching recentFiles entry with the latest draft
        const primaryPath = state.sources[0]?.path;
        if (primaryPath) {
          const recents = useProjectStore.getState().recentFiles;
          const idx = recents.findIndex((r) => r.path === primaryPath);
          if (idx >= 0) {
            const updated = recents.map((r, i) => (i === idx ? { ...r, draft } : r));
            persistRecentFiles(updated);
            useProjectStore.setState({ recentFiles: updated, draft });
          }
        }
      }, 400);
    }
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const state = useProjectStore.getState();
    if (state.project.clips.length > 0 && state.sources.length > 0) {
      const draft: ProjectDraft = {
        version: 1,
        sources: state.sources,
        project: state.project,
        activeClipId: state.activeClipId,
        currentTimeMs: usePlayerStore.getState().currentTimeMs,
        savedAt: Date.now(),
      };
      persistProjectDraft(draft);

      const primaryPath = state.sources[0]?.path;
      if (primaryPath) {
        const recents = state.recentFiles;
        const idx = recents.findIndex((r) => r.path === primaryPath);
        if (idx >= 0) {
          const updated = recents.map((r, i) => (i === idx ? { ...r, draft } : r));
          persistRecentFiles(updated);
        }
      }
    }
  });
}
