export interface TimelineViewport {
  pixelsPerMs: number;
  scrollOffsetMs: number;
  width: number;
  height: number;
}

export interface TimelineClipSegment {
  clipId: string;
  sourceId: string;
  filename: string;
  inMs: number;
  outMs: number;
  sourceDurationMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  trackIndex: number;
  isImage: boolean;
  hasAudio: boolean;
  enabled: boolean;
  color: string;
  keyframes: number[];
  speed: number;
}

export interface SnapCandidate {
  timeMs: number;
  type: 'zero' | 'end' | 'clip-start' | 'clip-end' | 'keyframe';
  description?: string;
}

export interface TrackLaneLayout {
  trackIndex: number;
  y: number;
  height: number;
  label: string;
}

export interface TimelineTracksLayout {
  rulerHeight: number;
  gutterWidth: number;
  addZoneY: number;
  addZoneHeight: number;
  newTrackIndex: number;
  lanes: TrackLaneLayout[]; // top-to-bottom: highest overlay track down to V1 (trackIndex 0)
  totalContentHeight: number;
}

export const TRACK_GUTTER_WIDTH = 46;
export const RULER_HEIGHT = 26;
export const ADD_ZONE_HEIGHT = 24;
export const MAIN_TRACK_MIN_HEIGHT = 54;
export const OVERLAY_TRACK_HEIGHT = 42;
export const TRACK_GAP = 4;

/**
 * Computes deterministic vertical lane positions for the multi-track timeline.
 * Overlay tracks (V2, V3, ...) stack ABOVE the main track (V1 at bottom),
 * with a slim "+ V{n}" drop zone at the very top for spawning new overlay lanes.
 */
export function computeTracksLayout(
  maxTrackIndex: number,
  canvasHeight: number,
  verticalScrollPx = 0
): TimelineTracksLayout {
  const safeMax = Math.max(0, Math.floor(maxTrackIndex));
  const lanes: TrackLaneLayout[] = [];

  const availableH = Math.max(80, canvasHeight - RULER_HEIGHT - 6);
  const overlayCount = safeMax;
  const fixedNonMainH =
    ADD_ZONE_HEIGHT +
    TRACK_GAP +
    overlayCount * (OVERLAY_TRACK_HEIGHT + TRACK_GAP);

  // Give V1 extra breathing room when space permits, while guaranteeing minimum height
  const mainTrackH = Math.max(
    MAIN_TRACK_MIN_HEIGHT,
    Math.min(84, availableH - fixedNonMainH)
  );

  let cursorY = RULER_HEIGHT + 3 - verticalScrollPx;
  const addZoneY = cursorY;
  cursorY += ADD_ZONE_HEIGHT + TRACK_GAP;

  // Stack overlay tracks from top (highest trackIndex) down to 1
  for (let t = safeMax; t >= 1; t--) {
    lanes.push({
      trackIndex: t,
      y: cursorY,
      height: OVERLAY_TRACK_HEIGHT,
      label: `V${t + 1}`,
    });
    cursorY += OVERLAY_TRACK_HEIGHT + TRACK_GAP;
  }

  // Main track V1 always sits at the bottom
  lanes.push({
    trackIndex: 0,
    y: cursorY,
    height: mainTrackH,
    label: 'V1',
  });
  cursorY += mainTrackH + 6;

  return {
    rulerHeight: RULER_HEIGHT,
    gutterWidth: TRACK_GUTTER_WIDTH,
    addZoneY,
    addZoneHeight: ADD_ZONE_HEIGHT,
    newTrackIndex: safeMax + 1,
    lanes,
    totalContentHeight: cursorY + verticalScrollPx - RULER_HEIGHT,
  };
}

/**
 * Resolves which track index a pointer Y coordinate hits, or `layout.newTrackIndex`
 * when pointing at the top "+ V{n}" overlay creation drop zone.
 */
export function hitTestTrackAtY(layout: TimelineTracksLayout, y: number): number {
  if (y <= layout.addZoneY + layout.addZoneHeight + TRACK_GAP / 2) {
    return layout.newTrackIndex;
  }
  for (const lane of layout.lanes) {
    if (y >= lane.y - TRACK_GAP / 2 && y <= lane.y + lane.height + TRACK_GAP / 2) {
      return lane.trackIndex;
    }
  }
  return 0;
}

export function timeToPixel(timeMs: number, scrollOffsetMs: number, pixelsPerMs: number): number {
  return (timeMs - scrollOffsetMs) * pixelsPerMs;
}

export function pixelToTime(pixelX: number, scrollOffsetMs: number, pixelsPerMs: number): number {
  return Math.max(0, scrollOffsetMs + pixelX / pixelsPerMs);
}

export function findSnapTarget(
  targetTimeMs: number,
  candidates: SnapCandidate[],
  pixelsPerMs: number,
  thresholdPx = 8
): SnapCandidate | null {
  let closest: SnapCandidate | null = null;
  let minDistancePx = thresholdPx;

  for (const candidate of candidates) {
    const distancePx = Math.abs(candidate.timeMs - targetTimeMs) * pixelsPerMs;
    if (distancePx <= minDistancePx) {
      minDistancePx = distancePx;
      closest = candidate;
    }
  }

  return closest;
}
