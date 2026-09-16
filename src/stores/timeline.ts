import { create } from 'zustand';

interface TimelineState {
  pixelsPerMs: number;
  scrollOffsetMs: number;
  snappingEnabled: boolean;
  timelineHeight: number;

  // Actions
  setPixelsPerMs: (pixelsPerMs: number) => void;
  setScrollOffsetMs: (offsetMs: number) => void;
  toggleSnapping: () => void;
  setTimelineHeight: (height: number) => void;
  zoomBy: (factor: number, centerPixelX: number, viewportWidth: number, totalDurationMs: number) => void;
  fitToProject: (totalDurationMs: number, viewportWidth: number) => void;
}

const STORAGE_HEIGHT_KEY = 'megu-fastcut-timeline-height';

function loadStoredHeight(): number {
  try {
    const val = localStorage.getItem(STORAGE_HEIGHT_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed >= 100 && parsed <= 400) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return 140;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  pixelsPerMs: 0.05, // 50px per second default
  scrollOffsetMs: 0,
  snappingEnabled: true,
  timelineHeight: loadStoredHeight(),

  setPixelsPerMs: (pixelsPerMs) => set({ pixelsPerMs: Math.max(0.0001, Math.min(10, pixelsPerMs)) }),
  setScrollOffsetMs: (scrollOffsetMs) => set({ scrollOffsetMs: Math.max(0, scrollOffsetMs) }),
  toggleSnapping: () => set((s) => ({ snappingEnabled: !s.snappingEnabled })),

  setTimelineHeight: (height) => {
    const clamped = Math.max(100, Math.min(400, height));
    try {
      localStorage.setItem(STORAGE_HEIGHT_KEY, clamped.toString());
    } catch {
      // ignore
    }
    set({ timelineHeight: clamped });
  },

  zoomBy: (factor, centerPixelX, viewportWidth, totalDurationMs) => {
    const { pixelsPerMs: oldPxPerMs, scrollOffsetMs: oldOffset } = get();

    // 10 frames at 30fps is ~333ms. At max zoom, 333ms fills viewportWidth -> maxPx = viewportWidth / 333
    const maxPxPerMs = Math.max(1, viewportWidth / 333);
    const minPxPerMs = Math.max(0.00005, (viewportWidth - 40) / Math.max(1000, totalDurationMs));

    const newPxPerMs = Math.max(minPxPerMs, Math.min(maxPxPerMs, oldPxPerMs * factor));
    if (Math.abs(newPxPerMs - oldPxPerMs) < 0.000001) return;

    // Center zoom around centerPixelX
    const timeAtCenter = oldOffset + centerPixelX / oldPxPerMs;
    const newOffset = Math.max(0, timeAtCenter - centerPixelX / newPxPerMs);

    set({
      pixelsPerMs: newPxPerMs,
      scrollOffsetMs: newOffset,
    });
  },

  fitToProject: (totalDurationMs, viewportWidth) => {
    if (totalDurationMs <= 0 || viewportWidth <= 0) return;
    const paddingPx = 60;
    const availableWidth = Math.max(100, viewportWidth - paddingPx);
    const fitPxPerMs = Math.max(0.00005, availableWidth / totalDurationMs);

    set({
      pixelsPerMs: fitPxPerMs,
      scrollOffsetMs: 0,
    });
  },
}));
