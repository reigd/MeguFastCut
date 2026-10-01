import React, { useRef, useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { useHistoryStore } from '../../stores/history';
import { usePlayerStore } from '../../stores/player';
import { AutoAlignIcon } from '../../components/icons';
import { t } from '../../shared/i18n';
import { makeEven } from '../../shared/geometry';

export interface NormalizedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayProps {
  width: number;
  height: number;
  canvasWidth?: number;
  canvasHeight?: number;
  normalizedBounds?: NormalizedBounds;
  sourceWidth?: number;
  sourceHeight?: number;
  onResizeChange?: (isResizing: boolean) => void;
  onBoundsChange?: (bounds: NormalizedBounds) => void;
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
  startNormX: number;
  startNormY: number;
  startNormW: number;
  startNormH: number;
  containerW: number;
  containerH: number;
  canvasW: number;
  canvasH: number;
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
  canvasWidth,
  canvasHeight,
  normalizedBounds,
  sourceWidth,
  sourceHeight,
  onResizeChange,
  onBoundsChange,
}) => {
  const { project, setCrop } = useProjectStore();
  const { autoAlignEnabled, toggleAutoAlign } = usePlayerStore();
  const crop = project.crop;
  const isCropMode = project.fitMode === 'crop';

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

  // In fit/stretch modes, ensure crop remains full frame
  React.useEffect(() => {
    if (!isCropMode) {
      if (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1) {
        setCrop({ x: 0, y: 0, width: 1, height: 1 });
      }
    }
  }, [isCropMode, crop.x, crop.y, crop.width, crop.height, setCrop]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, handle: HandleType) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const currentCrop = project.crop;
    const cW = canvasWidth || width;
    const cH = canvasHeight || height;
    const norm = normalizedBounds || {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    };

    sessionRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCropX: currentCrop.x,
      startCropY: currentCrop.y,
      startCropW: currentCrop.width,
      startCropH: currentCrop.height,
      startNormX: norm.x,
      startNormY: norm.y,
      startNormW: norm.width,
      startNormH: norm.height,
      containerW: width,
      containerH: height,
      canvasW: cW,
      canvasH: cH,
      srcW,
      srcH,
    };

    setActiveHandle(handle);

    if (handle !== 'move') {
      onResizeChange?.(true);
      const pxW = Math.round(norm.width * cW);
      const pxH = Math.round(norm.height * cH);
      setHudInfo({
        visible: true,
        label: isCropMode
          ? (project.aspect.label || `${((currentCrop.width * srcW) / (currentCrop.height * srcH)).toFixed(2)}:1`)
          : (project.fitMode === 'fit' ? (t('transform.fit') || 'Fit') : (t('transform.stretch') || 'Stretch')),
        ratio: isCropMode ? (currentCrop.width * srcW) / (currentCrop.height * srcH) : (pxW / (pxH || 1)),
        snapped: false,
        width: isCropMode ? Math.round(srcW * currentCrop.width) : pxW,
        height: isCropMode ? Math.round(srcH * currentCrop.height) : pxH,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.canvasW <= 0 || session.canvasH <= 0) return;

    if (!isCropMode) {
      const deltaPxX = e.clientX - session.startX;
      const deltaPxY = e.clientY - session.startY;
      const ndx = deltaPxX / session.canvasW;
      const ndy = deltaPxY / session.canvasH;

      let newNormX = session.startNormX;
      let newNormY = session.startNormY;
      let newNormW = session.startNormW;
      let newNormH = session.startNormH;

      const bypassSnap = e.altKey || e.ctrlKey;

      if (session.handle === 'move') {
        let proposedX = session.startNormX + ndx;
        let proposedY = session.startNormY + ndy;

        let snappedX = false;
        let snappedY = false;

        if (autoAlignEnabled && !bypassSnap) {
          const snapThresholdX = 12 / session.canvasW;
          const snapThresholdY = 12 / session.canvasH;

          // Center snapping
          const centerX = (1 - session.startNormW) / 2;
          const centerY = (1 - session.startNormH) / 2;

          if (Math.abs(proposedX - centerX) < snapThresholdX) {
            proposedX = centerX;
            snappedX = true;
          } else if (Math.abs(proposedX) < snapThresholdX) {
            proposedX = 0;
            snappedX = true;
          } else if (Math.abs(proposedX - (1 - session.startNormW)) < snapThresholdX) {
            proposedX = 1 - session.startNormW;
            snappedX = true;
          }

          if (Math.abs(proposedY - centerY) < snapThresholdY) {
            proposedY = centerY;
            snappedY = true;
          } else if (Math.abs(proposedY) < snapThresholdY) {
            proposedY = 0;
            snappedY = true;
          } else if (Math.abs(proposedY - (1 - session.startNormH)) < snapThresholdY) {
            proposedY = 1 - session.startNormH;
            snappedY = true;
          }
        }

        newNormX = proposedX;
        newNormY = proposedY;

        onBoundsChange?.({
          x: newNormX,
          y: newNormY,
          width: newNormW,
          height: newNormH,
        });

        const pxW = Math.round(newNormW * session.canvasW);
        const pxH = Math.round(newNormH * session.canvasH);

        setHudInfo({
          visible: true,
          label: t('transform.position') || 'Position',
          ratio: pxW / (pxH || 1),
          snapped: snappedX || snappedY,
          width: pxW,
          height: pxH,
        });
        return;
      }

      // Handle corner and edge resizing in fit and stretch modes
      if (project.fitMode === 'fit') {
        // Fit preserves aspect ratio of video
        const videoRatio = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
        const ratioFactor = session.canvasW / (session.canvasH * videoRatio);

        let proposedW = session.startNormW;

        if (session.handle === 'se') {
          proposedW = Math.max(0.05, session.startNormW + ndx);
          const proposedH = proposedW * ratioFactor;
          newNormW = proposedW;
          newNormH = proposedH;
          newNormX = session.startNormX;
          newNormY = session.startNormY;
        } else if (session.handle === 'nw') {
          const fixedRight = session.startNormX + session.startNormW;
          const fixedBottom = session.startNormY + session.startNormH;
          proposedW = Math.max(0.05, session.startNormW - ndx);
          const proposedH = proposedW * ratioFactor;
          newNormW = proposedW;
          newNormH = proposedH;
          newNormX = fixedRight - newNormW;
          newNormY = fixedBottom - newNormH;
        } else if (session.handle === 'ne') {
          const fixedLeft = session.startNormX;
          const fixedBottom = session.startNormY + session.startNormH;
          proposedW = Math.max(0.05, session.startNormW + ndx);
          const proposedH = proposedW * ratioFactor;
          newNormW = proposedW;
          newNormH = proposedH;
          newNormX = fixedLeft;
          newNormY = fixedBottom - newNormH;
        } else if (session.handle === 'sw') {
          const fixedRight = session.startNormX + session.startNormW;
          const fixedTop = session.startNormY;
          proposedW = Math.max(0.05, session.startNormW - ndx);
          const proposedH = proposedW * ratioFactor;
          newNormW = proposedW;
          newNormH = proposedH;
          newNormX = fixedRight - newNormW;
          newNormY = fixedTop;
        }
      } else {
        // Stretch mode: independent width and height scaling
        if (session.handle.includes('e')) {
          newNormW = Math.max(0.05, session.startNormW + ndx);
        } else if (session.handle.includes('w')) {
          const fixedRight = session.startNormX + session.startNormW;
          newNormW = Math.max(0.05, session.startNormW - ndx);
          newNormX = fixedRight - newNormW;
        }

        if (session.handle.includes('s')) {
          newNormH = Math.max(0.05, session.startNormH + ndy);
        } else if (session.handle.includes('n')) {
          const fixedBottom = session.startNormY + session.startNormH;
          newNormH = Math.max(0.05, session.startNormH - ndy);
          newNormY = fixedBottom - newNormH;
        }
      }

      onBoundsChange?.({
        x: newNormX,
        y: newNormY,
        width: newNormW,
        height: newNormH,
      });

      const pxW = Math.round(newNormW * session.canvasW);
      const pxH = Math.round(newNormH * session.canvasH);

      setHudInfo({
        visible: true,
        label: project.fitMode === 'fit' ? (t('transform.fit') || 'Fit') : (t('transform.stretch') || 'Stretch'),
        ratio: pxW / (pxH || 1),
        snapped: false,
        width: pxW,
        height: pxH,
      });
      return;
    }

    // Normalised delta (0..1) relative to container dimensions for crop
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
    let activePresetLabel = `${currentRatio.toFixed(2)}:1`;

    const bypassSnap = e.altKey || e.ctrlKey;

    // Snap to standard presets only if auto-alignment is enabled and not bypassed
    if (autoAlignEnabled && !bypassSnap) {
      for (const preset of SNAP_PRESETS) {
        if (Math.abs(currentRatio - preset.ratio) / preset.ratio < 0.035) {
          currentRatio = preset.ratio;
          snapped = true;
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

    setHudInfo({
      visible: true,
      label: snapped ? activePresetLabel : `${pixelW}×${pixelH}`,
      ratio: currentRatio,
      snapped,
      width: pixelW,
      height: pixelH,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sessionRef.current) {
      const wasResize = sessionRef.current.handle !== 'move';
      const dist = Math.hypot(e.clientX - sessionRef.current.startX, e.clientY - sessionRef.current.startY);
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
      if (wasResize) {
        useHistoryStore.getState().recordChange(project.clips, isCropMode ? 'Crop adjusted' : 'Transform adjusted');
      } else if (!isCropMode && dist < 5) {
        usePlayerStore.getState().togglePlay();
      }
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
        if (e.target !== e.currentTarget) return;
        if (!isCropMode) {
          useProjectStore.getState().setActiveClipId(null);
          return;
        }
        // Clicking on the dimmed area centers the crop box at that position
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
        overflow: isCropMode ? 'hidden' : 'visible',
      }}
    >
      {/* Active Selection / Crop Box */}
      <div
        onPointerDown={(e) => handleHandleDown(e, 'move')}
        style={{
          position: 'absolute',
          left: isCropMode ? `${crop.x * 100}%` : 0,
          top: isCropMode ? `${crop.y * 100}%` : 0,
          width: isCropMode ? `${crop.width * 100}%` : '100%',
          height: isCropMode ? `${crop.height * 100}%` : '100%',
          border: isCropMode ? '1.5px solid var(--accent)' : '1.5px solid #ffffff',
          borderRadius: '2px',
          boxShadow: isCropMode ? '0 0 0 9999px rgba(0, 0, 0, 0.65)' : 'none',
          cursor: activeHandle === 'move' ? 'grabbing' : 'grab',
          pointerEvents: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Rule-of-Thirds Grid ONLY in crop mode */}
        {isCropMode && (
          <>
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
          </>
        )}

        {/* CapCut style Deselect 'X' Button at top-left */}
        {!isCropMode && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              useProjectStore.getState().setActiveClipId(null);
            }}
            title={t('common.close') || 'Deselect'}
            style={{
              position: 'absolute',
              top: '-13px',
              left: '-13px',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid rgba(0, 0, 0, 0.25)',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 35,
              pointerEvents: 'auto',
              color: '#111827',
              transition: 'transform 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
        )}

        {/* CapCut style Rotation Button at bottom-center */}
        {!isCropMode && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              useProjectStore.getState().rotateActiveClip('cw');
            }}
            title={t('transform.rotate_cw') || 'Rotate 90°'}
            style={{
              position: 'absolute',
              bottom: '-32px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid rgba(0, 0, 0, 0.25)',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 35,
              pointerEvents: 'auto',
              color: '#111827',
              transition: 'transform 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateX(-50%) scale(1.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateX(-50%) scale(1)';
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24" />
              <path d="M21 3v6h-6" />
            </svg>
          </div>
        )}

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
            width: '26px',
            height: '26px',
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            pointerEvents: 'auto',
          }}
        >
          {isCropMode ? (
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
          ) : (
            <div
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                background: activeHandle === 'nw' || hoveredHandle === 'nw' ? 'var(--accent)' : '#ffffff',
                border: '1.5px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
                transition: 'all 0.15s ease',
              }}
            />
          )}
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
            width: '26px',
            height: '26px',
            cursor: 'nesw-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            pointerEvents: 'auto',
          }}
        >
          {isCropMode ? (
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
          ) : (
            <div
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                background: activeHandle === 'ne' || hoveredHandle === 'ne' ? 'var(--accent)' : '#ffffff',
                border: '1.5px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
                transition: 'all 0.15s ease',
              }}
            />
          )}
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
            width: '26px',
            height: '26px',
            cursor: 'nesw-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            pointerEvents: 'auto',
          }}
        >
          {isCropMode ? (
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
          ) : (
            <div
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                background: activeHandle === 'sw' || hoveredHandle === 'sw' ? 'var(--accent)' : '#ffffff',
                border: '1.5px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
                transition: 'all 0.15s ease',
              }}
            />
          )}
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
            width: '26px',
            height: '26px',
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            pointerEvents: 'auto',
          }}
        >
          {isCropMode ? (
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
          ) : (
            <div
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                background: activeHandle === 'se' || hoveredHandle === 'se' ? 'var(--accent)' : '#ffffff',
                border: '1.5px solid rgba(0, 0, 0, 0.35)',
                boxShadow: '0 1px 4px rgba(0, 0, 0, 0.6)',
                transition: 'all 0.15s ease',
              }}
            />
          )}
        </div>

        {/* 4 Edge Handles (Only in crop or stretch modes, fit mode preserves locked aspect with 4 corners) */}
        {(isCropMode || project.fitMode === 'stretch') && (
          <>
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
                  width: isCropMode ? '32px' : '18px',
                  height: '4px',
                  borderRadius: 'var(--r-full)',
                  background: activeHandle === 'n' || hoveredHandle === 'n' ? 'var(--accent)' : (isCropMode ? 'var(--handle)' : 'rgba(255, 255, 255, 0.9)'),
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
                  width: isCropMode ? '32px' : '18px',
                  height: '4px',
                  borderRadius: 'var(--r-full)',
                  background: activeHandle === 's' || hoveredHandle === 's' ? 'var(--accent)' : (isCropMode ? 'var(--handle)' : 'rgba(255, 255, 255, 0.9)'),
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
                  height: isCropMode ? '32px' : '18px',
                  borderRadius: 'var(--r-full)',
                  background: activeHandle === 'w' || hoveredHandle === 'w' ? 'var(--accent)' : (isCropMode ? 'var(--handle)' : 'rgba(255, 255, 255, 0.9)'),
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
                  height: isCropMode ? '32px' : '18px',
                  borderRadius: 'var(--r-full)',
                  background: activeHandle === 'e' || hoveredHandle === 'e' ? 'var(--accent)' : (isCropMode ? 'var(--handle)' : 'rgba(255, 255, 255, 0.9)'),
                  boxShadow: activeHandle === 'e' || hoveredHandle === 'e' ? '0 0 8px var(--accent)' : '0 1px 3px rgba(0,0,0,0.6)',
                  transition: 'background-color 0.15s ease, box-shadow 0.15s ease',
                }}
              />
            </div>
          </>
        )}
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
