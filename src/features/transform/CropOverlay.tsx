import React, { useRef } from 'react';
import { useProjectStore } from '../../stores/project';

interface CropOverlayProps {
  width: number;
  height: number;
}

export const CropOverlay: React.FC<CropOverlayProps> = ({ width, height }) => {
  const { project, setCrop } = useProjectStore();
  const crop = project.crop;

  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ mouseX: 0, mouseY: 0, cropX: crop.x, cropY: crop.y });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startPosRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      cropX: crop.x,
      cropY: crop.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || width <= 0 || height <= 0) return;

    const deltaX = (e.clientX - startPosRef.current.mouseX) / width;
    const deltaY = (e.clientY - startPosRef.current.mouseY) / height;

    const maxX = Math.max(0, 1 - crop.width);
    const maxY = Math.max(0, 1 - crop.height);

    const newX = Math.max(0, Math.min(maxX, startPosRef.current.cropX + deltaX));
    const newY = Math.max(0, Math.min(maxY, startPosRef.current.cropY + deltaY));

    setCrop({
      ...crop,
      x: newX,
      y: newY,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        cursor: 'move',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      {/* Rule-of-Thirds Grid Overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '1.5px solid var(--accent)',
          borderRadius: 'var(--r-sm)',
          boxShadow: '0 0 0 9999px var(--crop-overlay)',
          pointerEvents: 'none',
        }}
      >
        {/* Horizontal Thirds Lines */}
        <div
          style={{
            position: 'absolute',
            top: '33.333%',
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--crop-guide)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '66.666%',
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--crop-guide)',
          }}
        />

        {/* Vertical Thirds Lines */}
        <div
          style={{
            position: 'absolute',
            left: '33.333%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--crop-guide)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '66.666%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--crop-guide)',
          }}
        />

        {/* 4 Corner Crop Markers */}
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            left: '-2px',
            width: '12px',
            height: '12px',
            borderTop: '3px solid var(--handle)',
            borderLeft: '3px solid var(--handle)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '-2px',
            right: '-2px',
            width: '12px',
            height: '12px',
            borderTop: '3px solid var(--handle)',
            borderRight: '3px solid var(--handle)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-2px',
            left: '-2px',
            width: '12px',
            height: '12px',
            borderBottom: '3px solid var(--handle)',
            borderLeft: '3px solid var(--handle)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-2px',
            right: '-2px',
            width: '12px',
            height: '12px',
            borderBottom: '3px solid var(--handle)',
            borderRight: '3px solid var(--handle)',
          }}
        />
      </div>
    </div>
  );
};
