import { create } from 'zustand';
import { Clip } from '../shared/types';

interface HistoryState {
  past: { clips: Clip[]; description: string }[];
  future: { clips: Clip[]; description: string }[];
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  recordChange: (previousClips: Clip[], description: string) => void;
  undo: (currentClips: Clip[]) => Clip[] | null;
  redo: (currentClips: Clip[]) => Clip[] | null;
  clearHistory: () => void;
}

const MAX_HISTORY_DEPTH = 100;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  recordChange: (previousClips: Clip[], description: string) => {
    const cloned = JSON.parse(JSON.stringify(previousClips));
    set((s) => {
      const nextPast = [...s.past, { clips: cloned, description }].slice(-MAX_HISTORY_DEPTH);
      return {
        past: nextPast,
        future: [], // New action clears future redo branch
        canUndo: nextPast.length > 0,
        canRedo: false,
      };
    });
  },

  undo: (currentClips: Clip[]) => {
    const { past, future } = get();
    if (past.length === 0) return null;

    const currentCloned = JSON.parse(JSON.stringify(currentClips));
    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const newFuture = [{ clips: currentCloned, description: previous.description }, ...future];

    set({
      past: newPast,
      future: newFuture,
      canUndo: newPast.length > 0,
      canRedo: true,
    });

    return JSON.parse(JSON.stringify(previous.clips));
  },

  redo: (currentClips: Clip[]) => {
    const { past, future } = get();
    if (future.length === 0) return null;

    const currentCloned = JSON.parse(JSON.stringify(currentClips));
    const next = future[0];
    const newFuture = future.slice(1);
    const newPast = [...past, { clips: currentCloned, description: next.description }];

    set({
      past: newPast,
      future: newFuture,
      canUndo: true,
      canRedo: newFuture.length > 0,
    });

    return JSON.parse(JSON.stringify(next.clips));
  },

  clearHistory: () => {
    set({
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
  },
}));
