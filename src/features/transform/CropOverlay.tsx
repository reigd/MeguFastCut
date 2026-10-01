import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { useHistoryStore } from '../../stores/history';
import { usePlayerStore } from '../../stores/player';
import { AutoAlignIcon } from '../../components/icons';
import { t } from '../../shared/i18n';
import { makeEven } from '../../shared/geometry';

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
  startCropX: number;
  startCropY: number;
  startCropW: number;
  startCropH: number;
  containerW: number;
  containerH: number;
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
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '1:1', label: '1:1', ratio: 1.0 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
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
  const { autoAlignEnabled, toggleAutoAlign } = usePlayerStore();
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const currentCrop = project.crop;
    const currentRatio = (currentCrop.width * srcW) / (currentCrop.height * srcH);

    sessionRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCropX: currentCrop.x,
      startCropY: currentCrop.y,
      startCropW: currentCrop.width,
      startCropH: currentCrop.height,
      containerW: width,
      containerH: height,
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
        width: Math.round(srcW * currentCrop.width),
        height: Math.round(srcH * currentCrop.height),
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.containerW <= 0 || session.containerH <= 0) return;

    // Normalised delta (0..1) relative to container dimensions
    const dx = (e.clientX - session.startX) / session.containerW;
    const dy = (e.clientY - session.startY) / session.containerH;

    let newX = session.startCropX;
    let newY = session.startCropY;
    let newW = session.startCropW;
    let newH = session.startCropH;

    if (session.handle === 'move') {
      let proposedX = session.startCropX + dx;
      let proposedY = session.startCropY + dy;

      const bypassSnap = e.altKey || e.ctrlKey;
      if (autoAlignEnabled && !bypassSnap) {
        const centerX = (1 - session.startCropW) / 2;
        const centerY = (1 - session.startCropH) / 2;
        const threshold = 0.02; // 2% snap threshold

        if (Math.abs(proposedX - centerX) < threshold) {
          proposedX = centerX;
        } else if (Math.abs(proposedX) < threshold) {
          proposedX = 0;
        } else if (Math.abs(proposedX - (1 - session.startCropW)) < threshold) {
          proposedX = 1 - session.startCropW;
        }

        if (Math.abs(proposedY - centerY) < threshold) {
          proposedY = centerY;
        } else if (Math.abs(proposedY) < threshold) {
          proposedY = 0;
        } else if (Math.abs(proposedY - (1 - session.startCropH)) < threshold) {
          proposedY = 1 - session.startCropH;
        }
      }

      newX = Math.max(0, Math.min(1 - session.startCropW, proposedX));
      newY = Math.max(0, Math.min(1 - session.startCropH, proposedY));
      setCrop({
        x: newX,
        y: newY,
        width: session.startCropW,
        height: session.startCropH,
      });
      return;
    }

    switch (session.handle) {
      case 'e': {
        // Only change width (right edge)
        newW = Math.max(0.04, Math.min(1 - session.startCropX, session.startCropW + dx));
        break;
      }
      case 'w': {
        // Only change x and width (left edge)
        const proposedX = session.startCropX + dx;
        const proposedW = session.startCropW - dx;
        if (proposedX < 0) {
          newX = 0;
          newW = session.startCropX + session.startCropW;
        } else if (proposedW < 0.04) {
          newX = session.startCropX + session.startCropW - 0.04;
          newW = 0.04;
        } else {
          newX = proposedX;
          newW = proposedW;
        }
        break;
      }
      case 's': {
        // Only change height (bottom edge)
        newH = Math.max(0.04, Math.min(1 - session.startCropY, session.startCropH + dy));
        break;
      }
      case 'n': {
        // Only change y and height (top edge)
        const proposedY = session.startCropY + dy;
        const proposedH = session.startCropH - dy;
        if (proposedY < 0) {
          newY = 0;
          newH = session.startCropY + session.startCropH;
        } else if (proposedH < 0.04) {
          newY = session.startCropY + session.startCropH - 0.04;
          newH = 0.04;
        } else {
          newY = proposedY;
          newH = proposedH;
        }
        break;
      }
      case 'se': {
        newW = Math.max(0.04, Math.min(1 - session.startCropX, session.startCropW + dx));
        newH = Math.max(0.04, Math.min(1 - session.startCropY, session.startCropH + dy));
        break;
      }
      case 'sw': {
        const proposedX = session.startCropX + dx;
        const proposedW = session.startCropW - dx;
        if (proposedX < 0) {
          newX = 0;
          newW = session.startCropX + session.startCropW;
        } else if (proposedW < 0.04) {
          newX = session.startCropX + session.startCropW - 0.04;
          newW = 0.04;
        } else {
          newX = proposedX;
          newW = proposedW;
        }
        newH = Math.max(0.04, Math.min(1 - session.startCropY, session.startCropH + dy));
        break;
      }
      case 'ne': {
        newW = Math.max(0.04, Math.min(1 - session.startCropX, session.startCropW + dx));
        const proposedY = session.startCropY + dy;
        const proposedH = session.startCropH - dy;
        if (proposedY < 0) {
          newY = 0;
          newH = session.startCropY + session.startCropH;
        } else if (proposedH < 0.04) {
          newY = session.startCropY + session.startCropH - 0.04;
          newH = 0.04;
        } else {
          newY = proposedY;
          newH = proposedH;
        }
        break;
      }
      case 'nw': {
        const proposedX = session.startCropX + dx;
        const proposedW = session.startCropW - dx;
        if (proposedX < 0) {
          newX = 0;
          newW = session.startCropX + session.startCropW;
        } else if (proposedW < 0.04) {
          newX = session.startCropX + session.startCropW - 0.04;
          newW = 0.04;
        } else {
          newX = proposedX;
          newW = proposedW;
        }
        const proposedY = session.startCropY + dy;
        const proposedH = session.startCropH - dy;
        if (proposedY < 0) {
          newY = 0;
          newH = session.startCropY + session.startCropH;
        } else if (proposedH < 0.04) {
          newY = session.startCropY + session.startCropH - 0.04;
          newH = 0.04;
        } else {
          newY = proposedY;
          newH = proposedH;
        }
        break;
      }
    }

    // Shift key locks the initial aspect ratio
    if (e.shiftKey) {
      const initialRatio = (session.startCropW * session.srcW) / (session.startCropH * session.srcH);
      if (session.handle === 'e' || session.handle === 'w') {
        newH = Math.min(1 - newY, (newW * session.srcW) / (initialRatio * session.srcH));
      } else {
        newW = Math.min(1 - newX, (initialRatio * newH * session.srcH) / session.srcW);
      }
    }

    let currentRatio = (newW * session.srcW) / (newH * session.srcH);
    let snapped = false;
    let activePresetId = 'custom';
    let activePresetLabel = `${currentRatio.toFixed(2)}:1`;

    const bypassSnap = e.altKey || e.ctrlKey;

    // Snap to standard presets only if auto-alignment is enabled and not bypassed
    if (autoAlignEnabled && !bypassSnap) {
      for (const preset of SNAP_PRESETS) {
        if (Math.abs(currentRatio - preset.ratio) / preset.ratio < 0.035) {
          currentRatio = preset.ratio;
          snapped = true;
          activePresetId = preset.id;
          activePresetLabel = preset.label;

          if (session.handle === 'e' || session.handle === 'w') {
            const snappedW = (preset.ratio * newH * session.srcH) / session.srcW;
            if (newX + snappedW <= 1) {
              newW = snappedW;
            }
          } else if (session.handle === 's' || session.handle === 'n') {
            const snappedH = (newW * session.srcW) / (preset.ratio * session.srcH);
            if (newY + snappedH <= 1) {
              newH = snappedH;
            }
          }
          break;
        }
      }
    }

    const pixelW = makeEven(Math.round(newW * session.srcW));
    const pixelH = makeEven(Math.round(newH * session.srcH));

    setCrop({
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    });

    if (snapped) {
      setAspect({
        id: activePresetId,
        label: activePresetLabel,
        ratio: currentRatio,
      }, false);
    } else {
      setAspect({
        id: 'custom',
        label: `${pixelW}:${pixelH}`,
        customW: pixelW,
        customH: pixelH,
        ratio: currentRatio,
      }, false);
    }

    setHudInfo({
      visible: true,
      label: activePresetLabel,
      ratio: currentRatio,
      snapped,
      width: pixelW,
      height: pixelH,
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
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={(e) => {
        // Clicking on the dimmed area centers the crop box at that position
        if (e.target !== e.currentTarget) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;
        const newX = Math.max(0, Math.min(1 - crop.width, clickX - crop.width / 2));
        const newY = Math.max(0, Math.min(1 - crop.height, clickY - crop.height / 2));
        setCrop({ ...crop, x: newX, y: newY });
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: 'auto',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Active Crop Box with dark outer dimming shadow */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'move')}
        style={{
          position: 'absolute',
          left: `${crop.x * 100}%`,
          top: `${crop.y * 100}%`,
          width: `${crop.width * 100}%`,
          height: `${crop.height * 100}%`,
          border: '1.5px solid var(--accent)',
          borderRadius: '2px',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
          cursor: activeHandle === 'move' ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Rule-of-Thirds Grid */}
        <div
          style={{
            position: 'absolute',
            top: '33.333%',
            left: 0,
            right: 0,
            height: '1px',
            background: 'var(--crop-guide)',
            pointerEvents: 'none',
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
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '33.333%',
            top: 0,
            bottom: 0,
            width: '1px',
            background: 'var(--crop-guide)',
            pointerEvents: 'none',
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
            pointerEvents: 'none',
          }}
        />

        {/* 4 Corner Handles */}
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

        {/* 4 Edge Handles */}
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

      {/* Quick Auto-alignment indicator button (bottom-left) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleAutoAlign();
        }}
        title={autoAlignEnabled ? t('player.auto_align_on') : t('player.auto_align_off')}
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          background: autoAlignEnabled ? 'rgba(235, 94, 40, 0.22)' : 'rgba(15, 17, 23, 0.85)',
          border: `1px solid ${autoAlignEnabled ? 'var(--accent)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--r-full)',
          color: autoAlignEnabled ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: 'var(--text-11)',
          fontWeight: 600,
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.15s ease',
          userSelect: 'none',
        }}
      >
        <AutoAlignIcon size={13} />
        <span>{t('transform.auto_align')}: {autoAlignEnabled ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
};
