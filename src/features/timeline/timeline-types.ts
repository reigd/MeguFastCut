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
  enabled: boolean;
  color: string;
  keyframes: number[];
}

export interface SnapCandidate {
  timeMs: number;
  type: 'zero' | 'end' | 'clip-start' | 'clip-end' | 'keyframe';
  description?: string;
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
