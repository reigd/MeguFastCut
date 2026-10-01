import { create } from 'zustand';

const STORAGE_AUTO_ALIGN_KEY = 'megu-fastcut-auto-align';

function loadStoredAutoAlign(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_AUTO_ALIGN_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {
    // ignore
  }
  return true;
}

interface PlayerState {
  currentTimeMs: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number; // 0..1
  isLooping: boolean;
  showOriginalAspect: boolean;
  isFullscreen: boolean;
  autoAlignEnabled: boolean;
  activeClipIndex: number;
  proxyStatus: Record<string, 'ready' | 'generating' | 'error'>;

  // Actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (ms: number) => void;
  stepFrame: (direction: -1 | 1, fps?: number) => void;
  skipSeconds: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
  toggleOriginalAspect: () => void;
  setFullscreen: (fullscreen: boolean) => void;
  toggleAutoAlign: () => void;
  setAutoAlign: (enabled: boolean) => void;
  setActiveClipIndex: (idx: number) => void;
  setProxyStatus: (sourceId: string, status: 'ready' | 'generating' | 'error') => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTimeMs: 0,
  isPlaying: false,
  isMuted: false,
  volume: 1,
  isLooping: false,
  showOriginalAspect: false,
  isFullscreen: false,
  autoAlignEnabled: loadStoredAutoAlign(),
  activeClipIndex: 0,
  proxyStatus: {},

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  seek: (ms: number) => {
    set({ currentTimeMs: Math.max(0, ms) });
  },

  stepFrame: (direction: -1 | 1, fps = 30) => {
    const frameDurationMs = 1000 / (fps || 30);
    const nextTime = Math.max(0, get().currentTimeMs + direction * frameDurationMs);
    set({ currentTimeMs: nextTime, isPlaying: false });
  },

  skipSeconds: (seconds: number) => {
    const nextTime = Math.max(0, get().currentTimeMs + seconds * 1000);
    set({ currentTimeMs: nextTime });
  },

  setVolume: (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    set({ volume: clamped, isMuted: clamped === 0 });
  },

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleLoop: () => set((s) => ({ isLooping: !s.isLooping })),
  toggleOriginalAspect: () => set((s) => ({ showOriginalAspect: !s.showOriginalAspect })),
  setFullscreen: (isFullscreen: boolean) => set({ isFullscreen }),
  toggleAutoAlign: () =>
    set((s) => {
      const next = !s.autoAlignEnabled;
      try {
        localStorage.setItem(STORAGE_AUTO_ALIGN_KEY, String(next));
      } catch {
        // ignore
      }
      return { autoAlignEnabled: next };
    }),
  setAutoAlign: (autoAlignEnabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_AUTO_ALIGN_KEY, String(autoAlignEnabled));
    } catch {
      // ignore
    }
    set({ autoAlignEnabled });
  },
  setActiveClipIndex: (activeClipIndex: number) => set({ activeClipIndex }),

  setProxyStatus: (sourceId: string, status: 'ready' | 'generating' | 'error') => {
    set((s) => ({
      proxyStatus: { ...s.proxyStatus, [sourceId]: status },
    }));
  },
}));
