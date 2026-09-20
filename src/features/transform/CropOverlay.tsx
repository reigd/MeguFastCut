import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { useHistoryStore } from '../../stores/history';
import { makeEven, resolveAspectRatio } from '../../shared/geometry';

interface CropOverlayProps {
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  onResizeChange?: (isResizing: boolean) => void;
}

type HandleType = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move';

interface DragSession {
  handle: HandleType;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startCropX: number;
  startCropY: number;
  startCropW: number;
  startCropH: number;
  startRatio: number;
  srcW: number;
  srcH: number;
}

interface HudState {
  visible: boolean;
  label: string;
  ratio: number;
  snapped: boolean;
  width: number;
  height: number;
}

const SNAP_PRESETS = [
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '1:1', label: '1:1', ratio: 1.0 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '21:9', label: '21:9', ratio: 21 / 9 },
];

export const CropOverlay: React.FC<CropOverlayProps> = ({
  width,
  height,
  sourceWidth,
  sourceHeight,
  onResizeChange,
}) => {
  const { project, setCrop, setAspect } = useProjectStore();
  const crop = project.crop;

  const sessionRef = useRef<DragSession | null>(null);
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<HandleType | null>(null);
  const [hudInfo, setHudInfo] = useState<HudState>({
    visible: false,
    label: '',
    ratio: 1,
    snapped: false,
    width: 0,
    height: 0,
  });

  const srcW = sourceWidth || 1920;
  const srcH = sourceHeight || 1080;
  const originalRatio = srcW / srcH;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const currentRatio = resolveAspectRatio(project.aspect, srcW, srcH);

    sessionRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startW: width,
      startH: height,
      startCropX: crop.x,
      startCropY: crop.y,
      startCropW: crop.width,
      startCropH: crop.height,
      startRatio: currentRatio,
      srcW,
      srcH,
    };

    setActiveHandle(handle);

    if (handle !== 'move') {
      onResizeChange?.(true);
      setHudInfo({
        visible: true,
        label: project.aspect.label || `${currentRatio.toFixed(2)}:1`,
        ratio: currentRatio,
        snapped: project.aspect.id !== 'custom',
        width: Math.round(srcH * currentRatio),
        height: srcH,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || width <= 0 || height <= 0) return;

    if (session.handle === 'move') {
      // Panning video inside crop frame
      const currentCrop = project.crop;
      const srcRatio = session.srcW / session.srcH;
      const viewportRatio = width / height;

      let renderedVideoW = width;
      let renderedVideoH = height;
      if (srcRatio > viewportRatio) {
        renderedVideoH = height;
        renderedVideoW = height * srcRatio;
      } else {
        renderedVideoW = width;
        renderedVideoH = width / srcRatio;
      }

      // Delta in source video fraction
      const deltaX = (e.clientX - session.startX) / renderedVideoW;
      const deltaY = (e.clientY - session.startY) / renderedVideoH;

      const maxX = Math.max(0, 1 - session.startCropW);
      const maxY = Math.max(0, 1 - session.startCropH);

      // Mouse drag to right shifts crop box left (revealing left content)
      const newX = Math.max(0, Math.min(maxX, session.startCropX - deltaX));
      const newY = Math.max(0, Math.min(maxY, session.startCropY - deltaY));

      setCrop({
        ...currentCrop,
        x: newX,
        y: newY,
      });
      return;
    }

    // Handle resizing proportions (aspect ratio)
    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    let targetW = session.startW;
    let targetH = session.startH;

    switch (session.handle) {
      case 'e':
        targetW = session.startW + 2 * dx;
        break;
      case 'w':
        targetW = session.startW - 2 * dx;
        break;
      case 's':
        targetH = session.startH + 2 * dy;
        break;
      case 'n':
        targetH = session.startH - 2 * dy;
        break;
      case 'se':
        targetW = session.startW + 2 * dx;
        targetH = session.startH + 2 * dy;
        break;
      case 'sw':
        targetW = session.startW - 2 * dx;
        targetH = session.startH + 2 * dy;
        break;
      case 'ne':
        targetW = session.startW + 2 * dx;
        targetH = session.startH - 2 * dy;
        break;
      case 'nw':
        targetW = session.startW - 2 * dx;
        targetH = session.startH - 2 * dy;
        break;
    }

    targetW = Math.max(80, targetW);
    targetH = Math.max(80, targetH);

    let newRatio: number;
    if (e.shiftKey) {
      newRatio = session.startRatio;
    } else {
      newRatio = targetW / targetH;
    }

    newRatio = Math.max(0.2, Math.min(5.0, newRatio));

    // Preset snapping check (within 3.5% threshold)
    let snapped = false;
    let activePresetId = 'custom';
    let activePresetLabel = `${newRatio.toFixed(2)}:1`;

    if (Math.abs(newRatio - originalRatio) / originalRatio < 0.035) {
      newRatio = originalRatio;
      snapped = true;
      activePresetId = 'original';
      activePresetLabel = 'Original';
    } else {
      for (const preset of SNAP_PRESETS) {
        if (Math.abs(newRatio - preset.ratio) / preset.ratio < 0.035) {
          newRatio = preset.ratio;
          snapped = true;
          activePresetId = preset.id;
          activePresetLabel = preset.label;
          break;
        }
      }
    }

    const calcW = newRatio >= 1 ? makeEven(Math.round(session.srcH * newRatio)) : makeEven(session.srcW);
    const calcH = newRatio >= 1 ? makeEven(session.srcH) : makeEven(Math.round(session.srcW / newRatio));

    if (snapped) {
      setAspect({
        id: activePresetId,
        label: activePresetLabel,
        ratio: newRatio,
      });
    } else {
      setAspect({
        id: 'custom',
        label: `${calcW}:${calcH}`,
        customW: calcW,
        customH: calcH,
        ratio: newRatio,
      });
    }

    setHudInfo({
      visible: true,
      label: activePresetLabel,
      ratio: newRatio,
      snapped,
      width: calcW,
      height: calcH,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sessionRef.current) {
      const wasResize = sessionRef.current.handle !== 'move';
      sessionRef.current = null;
      setActiveHandle(null);
      if (wasResize) {
        onResizeChange?.(false);
      }
      setHudInfo((prev) => ({ ...prev, visible: false }));
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      useHistoryStore.getState().recordChange(project.clips, 'Crop proportions adjusted');
    }
  };

  const handleHandleDown = (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
    handlePointerDown(e, handle);
  };

  return (
    <div
      onPointerDown={(e) => handlePointerDown(e, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        cursor: activeHandle === 'move' ? 'grabbing' : 'grab',
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
      </div>

      {/* Floating HUD Tooltip */}
      {hudInfo.visible && (
        <div
          style={{
            position: 'absolute',
            top: '14px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '5px 12px',
            background: 'rgba(15, 17, 23, 0.90)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${hudInfo.snapped ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--r-full)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
            fontSize: 'var(--text-12)',
            fontWeight: 600,
            color: hudInfo.snapped ? 'var(--accent)' : 'var(--text-primary)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{hudInfo.label}</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
            {hudInfo.width}×{hudInfo.height}
          </span>
          {hudInfo.snapped && (
            <span
              style={{
                fontSize: 'var(--text-10)',
                padding: '1px 5px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--accent)',
                letterSpacing: '0.5px',
              }}
            >
              SNAP
            </span>
          )}
        </div>
      )}

      {/* 4 Interactive Corner Handles */}
      {/* Top-Left */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'nw')}
        onMouseEnter={() => setHoveredHandle('nw')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          top: '-12px',
          left: '-12px',
          width: '28px',
          height: '28px',
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderTop: `3.5px solid ${activeHandle === 'nw' || hoveredHandle === 'nw' ? 'var(--accent)' : 'var(--handle)'}`,
            borderLeft: `3.5px solid ${activeHandle === 'nw' || hoveredHandle === 'nw' ? 'var(--accent)' : 'var(--handle)'}`,
            filter: activeHandle === 'nw' || hoveredHandle === 'nw' ? 'drop-shadow(0 0 6px var(--accent))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            transition: 'border-color 0.15s ease, filter 0.15s ease',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* Top-Right */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'ne')}
        onMouseEnter={() => setHoveredHandle('ne')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          top: '-12px',
          right: '-12px',
          width: '28px',
          height: '28px',
          cursor: 'nesw-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderTop: `3.5px solid ${activeHandle === 'ne' || hoveredHandle === 'ne' ? 'var(--accent)' : 'var(--handle)'}`,
            borderRight: `3.5px solid ${activeHandle === 'ne' || hoveredHandle === 'ne' ? 'var(--accent)' : 'var(--handle)'}`,
            filter: activeHandle === 'ne' || hoveredHandle === 'ne' ? 'drop-shadow(0 0 6px var(--accent))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            transition: 'border-color 0.15s ease, filter 0.15s ease',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* Bottom-Left */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'sw')}
        onMouseEnter={() => setHoveredHandle('sw')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          bottom: '-12px',
          left: '-12px',
          width: '28px',
          height: '28px',
          cursor: 'nesw-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderBottom: `3.5px solid ${activeHandle === 'sw' || hoveredHandle === 'sw' ? 'var(--accent)' : 'var(--handle)'}`,
            borderLeft: `3.5px solid ${activeHandle === 'sw' || hoveredHandle === 'sw' ? 'var(--accent)' : 'var(--handle)'}`,
            filter: activeHandle === 'sw' || hoveredHandle === 'sw' ? 'drop-shadow(0 0 6px var(--accent))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            transition: 'border-color 0.15s ease, filter 0.15s ease',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* Bottom-Right */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'se')}
        onMouseEnter={() => setHoveredHandle('se')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          bottom: '-12px',
          right: '-12px',
          width: '28px',
          height: '28px',
          cursor: 'nwse-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 30,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            borderBottom: `3.5px solid ${activeHandle === 'se' || hoveredHandle === 'se' ? 'var(--accent)' : 'var(--handle)'}`,
            borderRight: `3.5px solid ${activeHandle === 'se' || hoveredHandle === 'se' ? 'var(--accent)' : 'var(--handle)'}`,
            filter: activeHandle === 'se' || hoveredHandle === 'se' ? 'drop-shadow(0 0 6px var(--accent))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            transition: 'border-color 0.15s ease, filter 0.15s ease',
            borderRadius: '1px',
          }}
        />
      </div>

      {/* 4 Interactive Edge Handles */}
      {/* Top Edge */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'n')}
        onMouseEnter={() => setHoveredHandle('n')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          top: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '56px',
          height: '20px',
          cursor: 'ns-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 28,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '4px',
            borderRadius: 'var(--r-full)',
            background: activeHandle === 'n' || hoveredHandle === 'n' ? 'var(--accent)' : 'var(--handle)',
            boxShadow: activeHandle === 'n' || hoveredHandle === 'n' ? '0 0 8px var(--accent)' : '0 1px 3px rgba(0,0,0,0.6)',
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      </div>

      {/* Bottom Edge */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 's')}
        onMouseEnter={() => setHoveredHandle('s')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          bottom: '-10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '56px',
          height: '20px',
          cursor: 'ns-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 28,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '4px',
            borderRadius: 'var(--r-full)',
            background: activeHandle === 's' || hoveredHandle === 's' ? 'var(--accent)' : 'var(--handle)',
            boxShadow: activeHandle === 's' || hoveredHandle === 's' ? '0 0 8px var(--accent)' : '0 1px 3px rgba(0,0,0,0.6)',
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      </div>

      {/* Left Edge */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'w')}
        onMouseEnter={() => setHoveredHandle('w')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          left: '-10px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '20px',
          height: '56px',
          cursor: 'ew-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 28,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '4px',
            height: '32px',
            borderRadius: 'var(--r-full)',
            background: activeHandle === 'w' || hoveredHandle === 'w' ? 'var(--accent)' : 'var(--handle)',
            boxShadow: activeHandle === 'w' || hoveredHandle === 'w' ? '0 0 8px var(--accent)' : '0 1px 3px rgba(0,0,0,0.6)',
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      </div>

      {/* Right Edge */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'e')}
        onMouseEnter={() => setHoveredHandle('e')}
        onMouseLeave={() => setHoveredHandle(null)}
        style={{
          position: 'absolute',
          right: '-10px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '20px',
          height: '56px',
          cursor: 'ew-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 28,
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '4px',
            height: '32px',
            borderRadius: 'var(--r-full)',
            background: activeHandle === 'e' || hoveredHandle === 'e' ? 'var(--accent)' : 'var(--handle)',
            boxShadow: activeHandle === 'e' || hoveredHandle === 'e' ? '0 0 8px var(--accent)' : '0 1px 3px rgba(0,0,0,0.6)',
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
          }}
        />
      </div>
    </div>
  );
};
