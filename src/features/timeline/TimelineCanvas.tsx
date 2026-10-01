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
import { formatTimecode, t } from '../../shared/i18n';

interface DragState {
  type: 'scrub' | 'trim-in' | 'trim-out' | 'clip-pending' | 'clip-move' | 'clip-slip';
  clipId?: string;
  sourceId?: string;
  startX: number;
  currentX?: number;
  grabOffsetX?: number;
  clipWidth?: number;
  clipDurationMs?: number;
  initialStartMs?: number;
  newStartMs?: number;
  fromIndex?: number;
  initialInMs?: number;
  initialOutMs?: number;
  sourceDurationMs?: number;
  clipSpeed?: number;
  isAlt?: boolean;
  initialClips?: Clip[];
}

export const TimelineCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [activeSnapTime, setActiveSnapTime] = useState<number | null>(null);
  const [trimTooltip, setTrimTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { project, sources, activeClipId, setActiveClipId, trimClip, moveClip } = useProjectStore();
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
      const clipSpeed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
      const rawDuration = Math.max(0, clip.outMs - clip.inMs);
      const clipDuration = Math.round(rawDuration / clipSpeed);
      const timelineStartMs = clip.startMs !== undefined ? clip.startMs : accumulatedMs;
      const timelineEndMs = timelineStartMs + clipDuration;

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
        speed: clipSpeed,
      };

      segs.push(seg);

      // Snap candidates: clip boundary
      candidates.push({ timeMs: timelineStartMs, type: 'clip-start' });
      candidates.push({ timeMs: timelineEndMs, type: 'clip-end' });

      // Keyframes inside clip segment
      seg.keyframes.forEach((kfMs) => {
        if (kfMs >= clip.inMs && kfMs <= clip.outMs) {
          const kfTimelineMs = timelineStartMs + Math.round((kfMs - clip.inMs) / clipSpeed);
          candidates.push({ timeMs: kfTimelineMs, type: 'keyframe' });
        }
      });

      if (clip.enabled) {
        accumulatedMs = Math.max(accumulatedMs, timelineEndMs);
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

    const isMoving = dragStateRef.current?.type === 'clip-move';
    const draggedClipId = isMoving ? dragStateRef.current?.clipId : null;

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

      // If this clip is currently being reordered/dragged, render a dashed placeholder ghost in its original slot
      if (seg.clipId === draggedClipId) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        return;
      }

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
          const displayTitle = Math.abs(seg.speed - 1.0) >= 0.01 ? `${seg.filename} (${seg.speed}x)` : seg.filename;
          ctx.fillText(displayTitle, titleX, rectY + 12);
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
            const kfTimelineMs = seg.timelineStartMs + Math.round((kfMs - seg.inMs) / seg.speed);
            const kfX = Math.round(timeToPixel(kfTimelineMs, scrollOffsetMs, pixelsPerMs)) + 0.5;
            if (kfX >= rectX && kfX <= rectX + rectW) {
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

      // Trimmed portions indication
      if (seg.inMs > 0 || seg.outMs < seg.sourceDurationMs) {
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

        // Left handle chevron
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

        // Right handle chevron
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rectX + rectW - 6, rectY + rectH / 2 - 6);
        ctx.lineTo(rectX + rectW - 3, rectY + rectH / 2);
        ctx.lineTo(rectX + rectW - 6, rectY + rectH / 2 + 6);
        ctx.stroke();
      } else {
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

    // 4. Render Floating Dragged Clip (elevation preview)
    if (isMoving && draggedClipId) {
      const draggedSeg = segments.find((s) => s.clipId === draggedClipId);
      const ds = dragStateRef.current;
      if (
        draggedSeg &&
        ds &&
        ds.clipWidth !== undefined
      ) {
        const floatX = ds.newStartMs !== undefined
          ? Math.round(timeToPixel(ds.newStartMs, scrollOffsetMs, pixelsPerMs))
          : Math.round((ds.currentX || 0) - (ds.grabOffsetX || 0));
        const floatW = ds.clipWidth;
        const floatY = trackY + 2;
        const floatH = trackHeight - 4;

        ctx.save();
        // Elevation drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        ctx.fillStyle = 'rgba(29, 32, 39, 0.95)';
        ctx.beginPath();
        ctx.roundRect(floatX, floatY, floatW, floatH, 4);
        ctx.fill();

        ctx.shadowColor = 'transparent';

        // Waveform preview in floating clip
        const samples = getSourceWaveform(draggedSeg.sourceId, draggedSeg.sourceDurationMs);
        drawClipWaveform(
          ctx,
          floatX,
          floatY,
          floatW,
          floatH,
          samples,
          draggedSeg.inMs,
          draggedSeg.outMs,
          draggedSeg.sourceDurationMs,
          waveformColor
        );

        // Highlight border
        ctx.strokeStyle = clipBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(floatX, floatY, floatW, floatH, 4);
        ctx.stroke();

        // Clip Title & badge
        if (floatW > 24) {
          ctx.beginPath();
          ctx.arc(floatX + 10, floatY + 12, 4, 0, Math.PI * 2);
          ctx.fillStyle = draggedSeg.color;
          ctx.fill();

          ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const titleX = floatX + 18;
          const maxTitleW = floatW - 24;
          if (maxTitleW > 20) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(titleX, floatY, maxTitleW, 24);
            ctx.clip();
            const displayTitle =
              Math.abs(draggedSeg.speed - 1.0) >= 0.01
                ? `${draggedSeg.filename} (${draggedSeg.speed}x)`
                : draggedSeg.filename;
            ctx.fillText(displayTitle, titleX, floatY + 12);
            ctx.restore();
          }
        }
        ctx.restore();
      }
    }

    // 6. Render Ruler at top
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

    // 7. Render Active Snap Guide Line
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

    // 8. Render Playhead with triangular cap
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = Math.round(timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs)) + 0.5;

    if (playheadX >= -10 && playheadX <= width + 10) {
      ctx.strokeStyle = playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, rulerHeight);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      const capW = 12;
      const capH = 14;
      ctx.fillStyle = playheadColor;
      ctx.beginPath();
      ctx.moveTo(playheadX - capW / 2, 0);
      ctx.lineTo(playheadX + capW / 2, 0);
      ctx.lineTo(playheadX, capH);
      ctx.closePath();
      ctx.fill();

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
    project.clips.length,
  ]);

  // Continuous redraw on animation frames during playback
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

  // Mouse Interaction: Scrubbing, Trimming & Dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (e.button !== 0) return; // Left mouse button only

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const clickTimeMs = pixelToTime(mouseX, scrollOffsetMs, pixelsPerMs);

    // 1. Click on Ruler (top 26px): scrub playhead
    if (mouseY <= 26) {
      dragStateRef.current = {
        type: 'scrub',
        startX: mouseX,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

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
      return;
    }

    // 2. Click directly on playhead vertical line or cap
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs);
    if (Math.abs(mouseX - playheadX) <= 6) {
      dragStateRef.current = {
        type: 'scrub',
        startX: mouseX,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 3. Check active clip trim handles (< and >)
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

    // 4. Click inside ANY clip segment on track -> prepare drag / selection
    const clickedIndex = segments.findIndex(
      (s) => clickTimeMs >= s.timelineStartMs && clickTimeMs <= s.timelineEndMs
    );

    if (clickedIndex !== -1) {
      const clickedSeg = segments[clickedIndex];
      const clipStartX = timeToPixel(clickedSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const clipEndX = timeToPixel(clickedSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const clipW = Math.max(4, clipEndX - clipStartX);

      dragStateRef.current = {
        type: 'clip-pending',
        clipId: clickedSeg.clipId,
        sourceId: clickedSeg.sourceId,
        fromIndex: clickedIndex,
        startX: mouseX,
        currentX: mouseX,
        grabOffsetX: mouseX - clipStartX,
        clipWidth: clipW,
        clipDurationMs: Math.max(0, clickedSeg.timelineEndMs - clickedSeg.timelineStartMs),
        initialStartMs: clickedSeg.timelineStartMs,
        newStartMs: clickedSeg.timelineStartMs,
        initialInMs: clickedSeg.inMs,
        initialOutMs: clickedSeg.outMs,
        sourceDurationMs: clickedSeg.sourceDurationMs,
        clipSpeed: clickedSeg.speed,
        initialClips: JSON.parse(JSON.stringify(project.clips)),
        isAlt: e.altKey,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 5. Click on empty track area outside clips -> scrub playhead
    dragStateRef.current = {
      type: 'scrub',
      startX: mouseX,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

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
    const width = canvas.clientWidth;
    const currentTimeAtMouse = pixelToTime(mouseX, scrollOffsetMs, pixelsPerMs);

    const state = dragStateRef.current;

    // Handle Active Drag
    if (state) {
      // Transition from pending to active drag once movement exceeds threshold (4px)
      if (state.type === 'clip-pending') {
        const dist = Math.abs(mouseX - state.startX);
        if (dist >= 4) {
          usePlayerStore.getState().pause();
          const isTrimmed =
            (state.initialInMs !== undefined && state.initialInMs > 0) ||
            (state.initialOutMs !== undefined &&
              state.sourceDurationMs !== undefined &&
              state.initialOutMs < state.sourceDurationMs);
          const wantsSlip = state.isAlt && isTrimmed;

          if (wantsSlip) {
            state.type = 'clip-slip';
          } else {
            state.type = 'clip-move';
          }
          if (state.clipId) {
            setActiveClipId(state.clipId);
          }
        } else {
          return;
        }
      }

      // 1. Scrub Playhead
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

      // 2. Trim In Handle
      if (
        state.type === 'trim-in' &&
        state.clipId &&
        state.initialInMs !== undefined &&
        state.initialOutMs !== undefined
      ) {
        const seg = segments.find((s) => s.clipId === state.clipId);
        const clipSpeed = seg?.speed || 1.0;
        const deltaMs = ((mouseX - state.startX) / pixelsPerMs) * clipSpeed;
        let newInMs = Math.max(0, Math.min(state.initialOutMs - 100, Math.round(state.initialInMs + deltaMs)));

        if (snappingEnabled && seg) {
          const snapKfs = [
            { timeMs: 0, type: 'zero' as const },
            ...seg.keyframes.map((k) => ({ timeMs: k, type: 'keyframe' as const })),
          ];
          const snap = findSnapTarget(newInMs, snapKfs, pixelsPerMs / clipSpeed);
          if (snap && snap.timeMs < state.initialOutMs - 100) {
            newInMs = snap.timeMs;
            setActiveSnapTime(seg.timelineStartMs);
          } else {
            setActiveSnapTime(null);
          }
        }

        trimClip(state.clipId, newInMs, state.initialOutMs);

        if (seg) {
          usePlayerStore.getState().seek(seg.timelineStartMs);
        }

        setTrimTooltip({
          text: `In: ${formatTimecode(newInMs)}`,
          x: mouseX,
          y: Math.max(10, mouseY - 28),
        });
        draw();
        return;
      }

      // 3. Trim Out Handle
      if (
        state.type === 'trim-out' &&
        state.clipId &&
        state.initialInMs !== undefined &&
        state.initialOutMs !== undefined
      ) {
        const seg = segments.find((s) => s.clipId === state.clipId);
        const clipSpeed = seg?.speed || 1.0;
        const deltaMs = ((mouseX - state.startX) / pixelsPerMs) * clipSpeed;
        let newOutMs = Math.max(state.initialInMs + 100, Math.round(state.initialOutMs + deltaMs));

        if (seg) {
          newOutMs = Math.min(seg.sourceDurationMs, newOutMs);
          if (snappingEnabled) {
            const snapKfs = [
              { timeMs: seg.sourceDurationMs, type: 'end' as const },
              ...seg.keyframes.map((k) => ({ timeMs: k, type: 'keyframe' as const })),
            ];
            const snap = findSnapTarget(newOutMs, snapKfs, pixelsPerMs / clipSpeed);
            if (snap && snap.timeMs > state.initialInMs + 100) {
              newOutMs = snap.timeMs;
              setActiveSnapTime(seg.timelineEndMs);
            } else {
              setActiveSnapTime(null);
            }
          }
        }

        trimClip(state.clipId, state.initialInMs, newOutMs);

        if (seg) {
          usePlayerStore
            .getState()
            .seek(seg.timelineStartMs + Math.round((newOutMs - state.initialInMs) / clipSpeed));
        }

        setTrimTooltip({
          text: `Out: ${formatTimecode(newOutMs)}`,
          x: mouseX,
          y: Math.max(10, mouseY - 28),
        });
        draw();
        return;
      }

      // 4. Clip Move (dragging clip freely along the timeline track)
      if (state.type === 'clip-move' && state.clipId) {
        state.currentX = mouseX;

        // Auto-scroll when dragging near viewport edges
        const edgeMargin = 40;
        if (mouseX > width - edgeMargin) {
          const maxScroll = Math.max(0, totalDurationMs - width / pixelsPerMs);
          const nextOffset = Math.min(maxScroll + 1000, scrollOffsetMs + 40);
          setScrollOffsetMs(nextOffset);
        } else if (mouseX < edgeMargin && scrollOffsetMs > 0) {
          const nextOffset = Math.max(0, scrollOffsetMs - 40);
          setScrollOffsetMs(nextOffset);
        }

        const grabOffset = state.grabOffsetX || 0;
        const clipPixelLeft = mouseX - grabOffset;
        const rawTargetStartMs = Math.max(0, Math.round(pixelToTime(clipPixelLeft, scrollOffsetMs, pixelsPerMs)));
        const clipDurMs = state.clipDurationMs || 0;
        let snappedStartMs = rawTargetStartMs;
        let snapIndicatorTime: number | null = null;

        if (snappingEnabled) {
          const currentPlayhead = usePlayerStore.getState().currentTimeMs;
          const otherSegments = segments.filter((s) => s.clipId !== state.clipId);

          const snapPoints: number[] = [0, currentPlayhead];
          otherSegments.forEach((seg) => {
            snapPoints.push(seg.timelineStartMs);
            snapPoints.push(seg.timelineEndMs);
          });

          let bestDist = Infinity;
          const snapThresholdMs = 12 / pixelsPerMs;

          for (const sp of snapPoints) {
            // Check snapping to start
            const distStart = Math.abs(rawTargetStartMs - sp);
            if (distStart < snapThresholdMs && distStart < bestDist) {
              bestDist = distStart;
              snappedStartMs = sp;
              snapIndicatorTime = sp;
            }
            // Check snapping to end
            const targetEndMs = rawTargetStartMs + clipDurMs;
            const distEnd = Math.abs(targetEndMs - sp);
            if (distEnd < snapThresholdMs && distEnd < bestDist) {
              bestDist = distEnd;
              snappedStartMs = Math.max(0, sp - clipDurMs);
              snapIndicatorTime = sp;
            }
          }
        }

        setActiveSnapTime(snapIndicatorTime);
        state.newStartMs = snappedStartMs;

        setTrimTooltip({
          text: `${t('common.in')}: ${formatTimecode(snappedStartMs)}`,
          x: Math.max(60, Math.min(width - 60, mouseX)),
          y: Math.max(10, mouseY - 32),
        });

        draw();
        return;
      }

      // 5. Clip Slip (sliding trimmed range along source media)
      if (
        state.type === 'clip-slip' &&
        state.clipId &&
        state.initialInMs !== undefined &&
        state.initialOutMs !== undefined &&
        state.sourceDurationMs !== undefined
      ) {
        const seg = segments.find((s) => s.clipId === state.clipId);
        const clipSpeed = seg?.speed || 1.0;
        const clipDur = state.initialOutMs - state.initialInMs;
        const maxShift = state.sourceDurationMs - state.initialOutMs;
        const minShift = -state.initialInMs;

        const rawDeltaMs = ((mouseX - state.startX) / pixelsPerMs) * clipSpeed;
        const shiftMs = Math.max(minShift, Math.min(maxShift, Math.round(rawDeltaMs)));

        const newInMs = state.initialInMs + shiftMs;
        const newOutMs = newInMs + clipDur;

        trimClip(state.clipId, newInMs, newOutMs);

        if (seg) {
          usePlayerStore.getState().seek(seg.timelineStartMs);
        }

        const deltaSec = (shiftMs / 1000).toFixed(2);
        const sign = shiftMs >= 0 ? '+' : '';
        setTrimTooltip({
          text: t('timeline.slip_clip', {
            delta: `${sign}${deltaSec}s`,
            in: formatTimecode(newInMs),
            out: formatTimecode(newOutMs),
          }),
          x: Math.max(60, Math.min(width - 60, mouseX)),
          y: Math.max(10, mouseY - 32),
        });
        draw();
        return;
      }
    }

    // Dynamic Hover Cursor Management
    if (state) {
      if (state.type === 'clip-move') {
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (state.type === 'clip-slip' || state.type === 'trim-in' || state.type === 'trim-out') {
        canvas.style.cursor = 'ew-resize';
        return;
      }
      if (state.type === 'scrub') {
        canvas.style.cursor = 'pointer';
        return;
      }
    }

    if (mouseY <= 26) {
      canvas.style.cursor = 'pointer';
      return;
    }

    // Playhead line/cap hover
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs);
    if (Math.abs(mouseX - playheadX) <= 6) {
      canvas.style.cursor = 'ew-resize';
      return;
    }

    // Active clip trim handles hover
    const activeSeg = segments.find((s) => s.clipId === activeClipId);
    if (activeSeg) {
      const startX = timeToPixel(activeSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const endX = timeToPixel(activeSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const hitDistance = 14;

      if (Math.abs(mouseX - startX) <= hitDistance || Math.abs(mouseX - endX) <= hitDistance) {
        canvas.style.cursor = 'ew-resize';
        return;
      }
    }

    // Hover over any clip on the track
    const hoveredSeg = segments.find(
      (s) => currentTimeAtMouse >= s.timelineStartMs && currentTimeAtMouse <= s.timelineEndMs
    );
    if (hoveredSeg) {
      canvas.style.cursor = 'grab';
      return;
    }

    canvas.style.cursor = 'default';
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragStateRef.current) {
      const state = dragStateRef.current;

      // If pending clip click without drag: select clip and seek playhead
      if (state.type === 'clip-pending') {
        if (state.clipId) {
          setActiveClipId(state.clipId);
        }
        const clickTimeMs = pixelToTime(state.startX, scrollOffsetMs, pixelsPerMs);
        let targetMs = clickTimeMs;
        if (snappingEnabled) {
          const snap = findSnapTarget(clickTimeMs, snapCandidates, pixelsPerMs);
          if (snap) targetMs = snap.timeMs;
        }
        usePlayerStore.getState().seek(targetMs);
      } else if (state.type === 'clip-move') {
        if (state.clipId && state.newStartMs !== undefined) {
          moveClip(state.clipId, state.newStartMs);
          setActiveClipId(state.clipId);
          usePlayerStore.getState().seek(state.newStartMs);
        }
      } else if (state.type === 'clip-slip') {
        if (state.initialClips && state.clipId) {
          const currentClips = useProjectStore.getState().project.clips;
          const current = currentClips.find((c) => c.id === state.clipId);
          if (
            current &&
            (current.inMs !== state.initialInMs || current.outMs !== state.initialOutMs)
          ) {
            useHistoryStore.getState().recordChange(state.initialClips, 'Slip clip');
          }
        }
      } else if (state.type === 'trim-in' || state.type === 'trim-out') {
        if (state.initialClips && state.clipId) {
          const currentClips = useProjectStore.getState().project.clips;
          const activeCurrent = currentClips.find((c) => c.id === state.clipId);
          if (
            activeCurrent &&
            (activeCurrent.inMs !== state.initialInMs || activeCurrent.outMs !== state.initialOutMs)
          ) {
            useHistoryStore.getState().recordChange(state.initialClips, 'Trim clip');
          }
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
      const delta = e.shiftKey ? e.deltaY : e.deltaX || e.deltaY;
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

      {/* Floating Timecode / Drag Tooltip */}
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
