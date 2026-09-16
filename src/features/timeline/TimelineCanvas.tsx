import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { useTimelineStore } from '../../stores/timeline';
import { useHistoryStore } from '../../stores/history';
import { Clip } from '../../shared/types';
import {
  TimelineClipSegment,
  SnapCandidate,
  timeToPixel,
  pixelToTime,
  findSnapTarget,
} from './timeline-types';
import { drawTimelineRuler } from './TimelineRuler';
import { getSourceWaveform, drawClipWaveform } from './waveform-generator';
import { formatTimecode } from '../../shared/i18n';

interface DragState {
  type: 'scrub' | 'trim-in' | 'trim-out';
  clipId?: string;
  startX: number;
  initialInMs?: number;
  initialOutMs?: number;
  initialClips?: Clip[];
}

export const TimelineCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [activeSnapTime, setActiveSnapTime] = useState<number | null>(null);
  const [trimTooltip, setTrimTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { project, sources, activeClipId, setActiveClipId, trimClip } = useProjectStore();
  const { pixelsPerMs, scrollOffsetMs, snappingEnabled, timelineHeight, setScrollOffsetMs, zoomBy } =
    useTimelineStore();

  // Compute sequential clip segments on timeline
  const { segments, totalDurationMs, snapCandidates } = useMemo(() => {
    let accumulatedMs = 0;
    const segs: TimelineClipSegment[] = [];
    const candidates: SnapCandidate[] = [{ timeMs: 0, type: 'zero' }];

    // Colors matching clip badges
    const palette = ['#38BDF8', '#818CF8', '#34D399', '#F472B6', '#FBBF24', '#A78BFA'];

    project.clips.forEach((clip, index) => {
      const src = sources.find((s) => s.id === clip.sourceId);
      const filename = src?.filename || `Clip ${index + 1}`;
      const srcDuration = src?.probe.durationMs || (clip.outMs - clip.inMs);
      const clipDuration = Math.max(0, clip.outMs - clip.inMs);
      const timelineStartMs = accumulatedMs;
      const timelineEndMs = accumulatedMs + clipDuration;

      const seg: TimelineClipSegment = {
        clipId: clip.id,
        sourceId: clip.sourceId,
        filename,
        inMs: clip.inMs,
        outMs: clip.outMs,
        sourceDurationMs: srcDuration,
        timelineStartMs,
        timelineEndMs,
        enabled: clip.enabled,
        color: palette[index % palette.length],
        keyframes: src?.probe.keyframes || [],
      };

      segs.push(seg);

      // Snap candidates: clip boundary
      candidates.push({ timeMs: timelineStartMs, type: 'clip-start' });
      candidates.push({ timeMs: timelineEndMs, type: 'clip-end' });

      // Keyframes inside clip segment
      seg.keyframes.forEach((kfMs) => {
        if (kfMs >= clip.inMs && kfMs <= clip.outMs) {
          const kfTimelineMs = timelineStartMs + (kfMs - clip.inMs);
          candidates.push({ timeMs: kfTimelineMs, type: 'keyframe' });
        }
      });

      if (clip.enabled) {
        accumulatedMs += clipDuration;
      }
    });

    candidates.push({ timeMs: accumulatedMs, type: 'end' });

    return {
      segments: segs,
      totalDurationMs: accumulatedMs,
      snapCandidates: candidates,
    };
  }, [project.clips, sources]);

  // Redraw canvas imperative function
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Read colors from theme tokens
    const computed = getComputedStyle(canvas);
    const bgInset = computed.getPropertyValue('--bg-inset').trim() || '#090A0C';
    const trackBg = computed.getPropertyValue('--timeline-track').trim() || '#181A20';
    const clipBorder = computed.getPropertyValue('--clip-border').trim() || '#38BDF8';
    const playheadColor = computed.getPropertyValue('--playhead').trim() || '#38BDF8';
    const handleColor = computed.getPropertyValue('--handle').trim() || '#FFFFFF';
    const keyframeColor = computed.getPropertyValue('--keyframe-mark').trim() || 'rgba(255, 255, 255, 0.45)';
    const waveformColor = computed.getPropertyValue('--waveform').trim() || '#0284C7';
    const trimmedDimColor = computed.getPropertyValue('--timeline-trimmed').trim() || 'rgba(0, 0, 0, 0.65)';
    const textPrimary = computed.getPropertyValue('--text-primary').trim() || '#F3F4F6';
    const textMuted = computed.getPropertyValue('--text-muted').trim() || '#6B7280';
    const borderSubtle = computed.getPropertyValue('--border-subtle').trim() || 'rgba(255, 255, 255, 0.08)';

    // 1. Clear background
    ctx.fillStyle = bgInset;
    ctx.fillRect(0, 0, width, height);

    const rulerHeight = 26;
    const trackY = rulerHeight + 4;
    const trackHeight = Math.max(30, height - trackY - 8);

    // 2. Track background
    ctx.fillStyle = trackBg;
    ctx.fillRect(0, trackY, width, trackHeight);

    // Subtle track boundary border
    ctx.strokeStyle = borderSubtle;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, trackY - 0.5, width, trackHeight);

    // 3. Render Clip Segments
    segments.forEach((seg) => {
      const startX = timeToPixel(seg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const endX = timeToPixel(seg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const clipWidth = Math.max(2, endX - startX);

      if (endX < 0 || startX > width) return; // culling

      const isSelected = seg.clipId === activeClipId;
      const clipGap = 2;
      const rectX = startX + clipGap / 2;
      const rectW = Math.max(4, clipWidth - clipGap);
      const rectY = trackY + 2;
      const rectH = trackHeight - 4;

      ctx.save();

      // Clip block background
      ctx.fillStyle = '#1D2027';
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, 4);
      ctx.fill();

      // Audio Waveform
      const samples = getSourceWaveform(seg.sourceId, seg.sourceDurationMs);
      drawClipWaveform(
        ctx,
        rectX,
        rectY,
        rectW,
        rectH,
        samples,
        seg.inMs,
        seg.outMs,
        seg.sourceDurationMs,
        waveformColor
      );

      // Clip Title & source badge
      if (rectW > 24) {
        ctx.beginPath();
        ctx.arc(rectX + 10, rectY + 12, 4, 0, Math.PI * 2);
        ctx.fillStyle = seg.color;
        ctx.fill();

        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = textPrimary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const titleX = rectX + 18;
        const maxTitleW = rectW - 24;
        if (maxTitleW > 20) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(titleX, rectY, maxTitleW, 24);
          ctx.clip();
          ctx.fillText(seg.filename, titleX, rectY + 12);
          ctx.restore();
        }
      }

      // Keyframe tick marks
      if (seg.keyframes && seg.keyframes.length > 0) {
        ctx.fillStyle = keyframeColor;
        ctx.strokeStyle = keyframeColor;
        ctx.lineWidth = 1;

        seg.keyframes.forEach((kfMs) => {
          if (kfMs >= seg.inMs && kfMs <= seg.outMs) {
            const kfTimelineMs = seg.timelineStartMs + (kfMs - seg.inMs);
            const kfX = Math.round(timeToPixel(kfTimelineMs, scrollOffsetMs, pixelsPerMs)) + 0.5;
            if (kfX >= rectX && kfX <= rectX + rectW) {
              // Draw small diamond mark at bottom edge
              const markY = rectY + rectH - 5;
              ctx.beginPath();
              ctx.moveTo(kfX, markY - 4);
              ctx.lineTo(kfX + 3, markY);
              ctx.lineTo(kfX, markY + 4);
              ctx.lineTo(kfX - 3, markY);
              ctx.closePath();
              ctx.fill();
            }
          }
        });
      }

      // Trimmed portions indication (ghosted or border)
      if (seg.inMs > 0 || seg.outMs < seg.sourceDurationMs) {
        // Subtle indicator dot that clip is trimmed
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(rectX, rectY, 3, rectH);
        ctx.fillRect(rectX + rectW - 3, rectY, 3, rectH);
      }

      // Selected clip border & trim handles
      if (isSelected) {
        ctx.strokeStyle = clipBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.stroke();

        // Left Trim Handle
        const handleW = 10;
        ctx.fillStyle = handleColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, handleW, rectH, [4, 0, 0, 4]);
        ctx.fill();

        // Left handle chevron / grip lines
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rectX + 6, rectY + rectH / 2 - 6);
        ctx.lineTo(rectX + 3, rectY + rectH / 2);
        ctx.lineTo(rectX + 6, rectY + rectH / 2 + 6);
        ctx.stroke();

        // Right Trim Handle
        ctx.fillStyle = handleColor;
        ctx.beginPath();
        ctx.roundRect(rectX + rectW - handleW, rectY, handleW, rectH, [0, 4, 4, 0]);
        ctx.fill();

        // Right handle chevron / grip lines
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rectX + rectW - 6, rectY + rectH / 2 - 6);
        ctx.lineTo(rectX + rectW - 3, rectY + rectH / 2);
        ctx.lineTo(rectX + rectW - 6, rectY + rectH / 2 + 6);
        ctx.stroke();
      } else {
        // Subtle outline for inactive clips
        ctx.strokeStyle = borderSubtle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.stroke();
      }

      // If clip is disabled, dim it at 35% opacity
      if (!seg.enabled) {
        ctx.fillStyle = trimmedDimColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.fill();
      }

      ctx.restore();
    });

    // 4. Render Ruler at top
    drawTimelineRuler(
      ctx,
      width,
      rulerHeight,
      scrollOffsetMs,
      pixelsPerMs,
      textMuted,
      borderSubtle,
      borderSubtle
    );

    // 5. Render Active Snap Guide Line
    if (activeSnapTime !== null) {
      const snapX = Math.round(timeToPixel(activeSnapTime, scrollOffsetMs, pixelsPerMs)) + 0.5;
      if (snapX >= 0 && snapX <= width) {
        ctx.strokeStyle = '#F59E0B'; // Gold snapping highlight
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(snapX, 0);
        ctx.lineTo(snapX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 6. Render Playhead with triangular cap
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = Math.round(timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs)) + 0.5;

    if (playheadX >= -10 && playheadX <= width + 10) {
      // Playhead vertical line
      ctx.strokeStyle = playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, rulerHeight);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Triangular cap in ruler
      const capW = 12;
      const capH = 14;
      ctx.fillStyle = playheadColor;
      ctx.beginPath();
      ctx.moveTo(playheadX - capW / 2, 0);
      ctx.lineTo(playheadX + capW / 2, 0);
      ctx.lineTo(playheadX, capH);
      ctx.closePath();
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(playheadX, 4, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [
    segments,
    activeClipId,
    pixelsPerMs,
    scrollOffsetMs,
    activeSnapTime,
  ]);

  // Request continuous redraw on animation frames during playback
  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [draw]);

  // Resize canvas on window or container size change
  useEffect(() => {
    const handleResize = () => {
      draw();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  // Mouse Interaction: Scrubbing & Trimming
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clickTimeMs = pixelToTime(mouseX, scrollOffsetMs, pixelsPerMs);

    // Check if clicked on active clip's trim handles
    const activeSeg = segments.find((s) => s.clipId === activeClipId);
    if (activeSeg) {
      const startX = timeToPixel(activeSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const endX = timeToPixel(activeSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const hitDistance = 14;

      // Left handle (In)
      if (Math.abs(mouseX - startX) <= hitDistance) {
        dragStateRef.current = {
          type: 'trim-in',
          clipId: activeSeg.clipId,
          startX: mouseX,
          initialInMs: activeSeg.inMs,
          initialOutMs: activeSeg.outMs,
          initialClips: JSON.parse(JSON.stringify(project.clips)),
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // Right handle (Out)
      if (Math.abs(mouseX - endX) <= hitDistance) {
        dragStateRef.current = {
          type: 'trim-out',
          clipId: activeSeg.clipId,
          startX: mouseX,
          initialInMs: activeSeg.inMs,
          initialOutMs: activeSeg.outMs,
          initialClips: JSON.parse(JSON.stringify(project.clips)),
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }

    // Check if clicked inside a clip segment on track to select it
    if (mouseY > 26) {
      const clickedSeg = segments.find(
        (s) => clickTimeMs >= s.timelineStartMs && clickTimeMs <= s.timelineEndMs
      );
      if (clickedSeg && clickedSeg.clipId !== activeClipId) {
        setActiveClipId(clickedSeg.clipId);
      }
    }

    // Start playhead scrub
    dragStateRef.current = {
      type: 'scrub',
      startX: mouseX,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // Snap playhead if enabled
    let targetMs = clickTimeMs;
    if (snappingEnabled) {
      const snap = findSnapTarget(clickTimeMs, snapCandidates, pixelsPerMs);
      if (snap) {
        targetMs = snap.timeMs;
        setActiveSnapTime(snap.timeMs);
      } else {
        setActiveSnapTime(null);
      }
    }

    usePlayerStore.getState().seek(targetMs);
    draw();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const currentTimeAtMouse = pixelToTime(mouseX, scrollOffsetMs, pixelsPerMs);

    const state = dragStateRef.current;

    // Handle Active Drag
    if (state) {
      if (state.type === 'scrub') {
        let targetMs = currentTimeAtMouse;
        if (snappingEnabled) {
          const snap = findSnapTarget(currentTimeAtMouse, snapCandidates, pixelsPerMs);
          if (snap) {
            targetMs = snap.timeMs;
            setActiveSnapTime(snap.timeMs);
          } else {
            setActiveSnapTime(null);
          }
        } else {
          setActiveSnapTime(null);
        }
        usePlayerStore.getState().seek(targetMs);
        draw();
        return;
      }

      if (state.type === 'trim-in' && state.clipId && state.initialInMs !== undefined && state.initialOutMs !== undefined) {
        const deltaMs = (mouseX - state.startX) / pixelsPerMs;
        let newInMs = Math.max(0, Math.min(state.initialOutMs - 100, Math.round(state.initialInMs + deltaMs)));

        // Snap to keyframes or 0
        if (snappingEnabled) {
          const seg = segments.find((s) => s.clipId === state.clipId);
          if (seg) {
            const snapKfs = [{ timeMs: 0, type: 'zero' as const }, ...seg.keyframes.map((k) => ({ timeMs: k, type: 'keyframe' as const }))];
            const snap = findSnapTarget(newInMs, snapKfs, pixelsPerMs);
            if (snap && snap.timeMs < state.initialOutMs - 100) {
              newInMs = snap.timeMs;
              setActiveSnapTime(seg.timelineStartMs);
            } else {
              setActiveSnapTime(null);
            }
          }
        }

        trimClip(state.clipId, newInMs, state.initialOutMs);

        // Preview frame at In point
        const activeSeg = segments.find((s) => s.clipId === state.clipId);
        if (activeSeg) {
          usePlayerStore.getState().seek(activeSeg.timelineStartMs);
        }

        setTrimTooltip({
          text: `In: ${formatTimecode(newInMs)}`,
          x: mouseX,
          y: Math.max(10, mouseY - 28),
        });
        draw();
        return;
      }

      if (state.type === 'trim-out' && state.clipId && state.initialInMs !== undefined && state.initialOutMs !== undefined) {
        const deltaMs = (mouseX - state.startX) / pixelsPerMs;
        let newOutMs = Math.max(state.initialInMs + 100, Math.round(state.initialOutMs + deltaMs));

        const seg = segments.find((s) => s.clipId === state.clipId);
        if (seg) {
          newOutMs = Math.min(seg.sourceDurationMs, newOutMs);
          if (snappingEnabled) {
            const snapKfs = [{ timeMs: seg.sourceDurationMs, type: 'end' as const }, ...seg.keyframes.map((k) => ({ timeMs: k, type: 'keyframe' as const }))];
            const snap = findSnapTarget(newOutMs, snapKfs, pixelsPerMs);
            if (snap && snap.timeMs > state.initialInMs + 100) {
              newOutMs = snap.timeMs;
              setActiveSnapTime(seg.timelineEndMs);
            } else {
              setActiveSnapTime(null);
            }
          }
        }

        trimClip(state.clipId, state.initialInMs, newOutMs);

        // Preview frame at Out point
        if (seg) {
          usePlayerStore.getState().seek(seg.timelineStartMs + (newOutMs - state.initialInMs));
        }

        setTrimTooltip({
          text: `Out: ${formatTimecode(newOutMs)}`,
          x: mouseX,
          y: Math.max(10, mouseY - 28),
        });
        draw();
        return;
      }
    }

    // Hover Cursor Management (ew-resize on trim handles)
    const activeSeg = segments.find((s) => s.clipId === activeClipId);
    if (activeSeg && mouseY > 26) {
      const startX = timeToPixel(activeSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const endX = timeToPixel(activeSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const hitDistance = 12;

      if (Math.abs(mouseX - startX) <= hitDistance || Math.abs(mouseX - endX) <= hitDistance) {
        canvas.style.cursor = 'ew-resize';
        return;
      }
    }

    canvas.style.cursor = mouseY <= 26 ? 'pointer' : 'default';
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current) {
      const state = dragStateRef.current;
      if (state.initialClips && (state.type === 'trim-in' || state.type === 'trim-out')) {
        const currentClips = useProjectStore.getState().project.clips;
        const activeCurrent = currentClips.find((c) => c.id === state.clipId);
        if (
          activeCurrent &&
          (activeCurrent.inMs !== state.initialInMs || activeCurrent.outMs !== state.initialOutMs)
        ) {
          useHistoryStore.getState().recordChange(state.initialClips, 'Trim clip');
        }
      }

      dragStateRef.current = null;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setActiveSnapTime(null);
      setTrimTooltip(null);
      draw();
    }
  };

  // Zooming & Scrolling Wheel listener
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      zoomBy(factor, mouseX, canvas.clientWidth, totalDurationMs);
      draw();
    } else {
      // Horizontal pan
      const delta = e.shiftKey ? e.deltaY : (e.deltaX || e.deltaY);
      const deltaMs = delta / pixelsPerMs;
      const maxScroll = Math.max(0, totalDurationMs - canvas.clientWidth / pixelsPerMs);
      const nextOffset = Math.max(0, Math.min(maxScroll + 1000, scrollOffsetMs + deltaMs));
      setScrollOffsetMs(nextOffset);
      draw();
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: `${timelineHeight}px`,
        background: 'var(--bg-inset)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Floating Trim Timecode Tooltip */}
      {trimTooltip && (
        <div
          className="timecode"
          style={{
            position: 'absolute',
            left: `${trimTooltip.x}px`,
            top: `${trimTooltip.y}px`,
            transform: 'translate(-50%, -100%)',
            background: 'var(--bg-elevated)',
            color: 'var(--accent)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-sm)',
            padding: '2px 8px',
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            boxShadow: 'var(--shadow-2)',
            pointerEvents: 'none',
            zIndex: 40,
            whiteSpace: 'nowrap',
          }}
        >
          {trimTooltip.text}
        </div>
      )}
    </div>
  );
};
