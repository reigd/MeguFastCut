import { TransitionType } from './types';

/**
 * Ephemeral in-app drag state shared between MediaLibrary, TransitionsPanel, TimelineCanvas, ClipStrip, and VideoPlayer.
 * Needed because Chromium/WebView2 restricts reading custom dataTransfer payloads during `dragover`.
 */
let activeDraggingSourceId: string | null = null;
let activeDraggingTransitionType: TransitionType | null = null;

export function setDraggingSourceId(sourceId: string | null): void {
  activeDraggingSourceId = sourceId;
}

export function getDraggingSourceId(): string | null {
  return activeDraggingSourceId;
}

export function setDraggingTransitionType(type: TransitionType | null): void {
  activeDraggingTransitionType = type;
}

export function getDraggingTransitionType(): TransitionType | null {
  return activeDraggingTransitionType;
}
