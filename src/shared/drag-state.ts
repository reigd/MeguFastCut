/**
 * Ephemeral in-app drag state shared between MediaLibrary, TimelineCanvas, and VideoPlayer.
 * Needed because Chromium/WebView2 restricts reading custom dataTransfer payloads during `dragover`.
 */
let activeDraggingSourceId: string | null = null;

export function setDraggingSourceId(sourceId: string | null): void {
  activeDraggingSourceId = sourceId;
}

export function getDraggingSourceId(): string | null {
  return activeDraggingSourceId;
}
