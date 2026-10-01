import React, { useRef } from 'react';
import { TimelineToolbar } from './TimelineToolbar';
import { TimelineCanvas } from './TimelineCanvas';
import { useTimelineStore } from '../../stores/timeline';
import { useProjectStore } from '../../stores/project';

export const Timeline: React.FC = () => {
  const { timelineHeight, setTimelineHeight } = useTimelineStore();
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(timelineHeight);

  const handlePointerDownResize = (e: React.PointerEvent) => {
    isResizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = timelineHeight;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMoveResize = (e: React.PointerEvent) => {
    if (!isResizingRef.current) return;
    const deltaY = startYRef.current - e.clientY; // Dragging up increases height
    const newHeight = Math.max(100, Math.min(360, startHeightRef.current + deltaY));
    setTimelineHeight(newHeight);
  };

  const handlePointerUpResize = (e: React.PointerEvent) => {
    if (isResizingRef.current) {
      isResizingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  return (
    <section
      aria-label="Timeline"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('megu/source-id');
        if (sourceId) {
          useProjectStore.getState().addClipFromSource(sourceId);
          return;
        }
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          const paths = files
            .map((f) => (f as unknown as { path?: string }).path || f.name)
            .filter(Boolean);
          if (paths.length > 0) {
            useProjectStore.getState().addFiles(paths);
          }
        }
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        position: 'relative',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Top Resize Handle Bar */}
      <div
        onPointerDown={handlePointerDownResize}
        onPointerMove={handlePointerMoveResize}
        onPointerUp={handlePointerUpResize}
        onPointerCancel={handlePointerUpResize}
        style={{
          position: 'absolute',
          top: '-3px',
          left: 0,
          right: 0,
          height: '6px',
          cursor: 'ns-resize',
          zIndex: 50,
          background: 'transparent',
        }}
      />

      <TimelineToolbar />
      <TimelineCanvas />
    </section>
  );
};
