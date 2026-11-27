import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { useTimelineStore } from '../../stores/timeline';
import { useHistoryStore } from '../../stores/history';
import { useUiStore } from '../../stores/ui';
import { Clip, TransitionType } from '../../shared/types';
import {
  TimelineClipSegment,
  SnapCandidate,
  TRACK_GUTTER_WIDTH,
  RULER_HEIGHT,
  computeTracksLayout,
  hitTestTrackAtY,
  timeToPixel,
  pixelToTime,
  findSnapTarget,
} from './timeline-types';
import { drawTimelineRuler } from './TimelineRuler';
import { getSourceWaveform, drawClipWaveform } from './waveform-generator';
import { formatTimecode, t } from '../../shared/i18n';
import {
  DEFAULT_IMAGE_DURATION_MS,
  MAX_IMAGE_CLIP_DURATION_MS,
  findFreeOverlayTrack,
  getClipDurationMs,
  getClipTrackIndex,
  getMaxTrackIndex,
  hasTrackOverlap,
  isImageSource,
} from '../../shared/media-formats';
import {
  getDraggingSourceId,
  getDraggingTransitionType,
  setDraggingSourceId,
  setDraggingTransitionType,
} from '../../shared/drag-state';
import {
  computeMainTrackTiming,
  createDefaultTransition,
} from '../../shared/transitions';

interface DragState {
  type: 'scrub' | 'trim-in' | 'trim-out' | 'clip-pending' | 'clip-move' | 'clip-slip';
  clipId?: string;
  sourceId?: string;
  startX: number;
  startY: number;
  currentX?: number;
  currentY?: number;
  grabOffsetX?: number;
  clipWidth?: number;
  clipDurationMs?: number;
  initialStartMs?: number;
  newStartMs?: number;
  initialTrackIndex?: number;
  newTrackIndex?: number;
  fromIndex?: number;
  initialInMs?: number;
  initialOutMs?: number;
  sourceDurationMs?: number;
  isImage?: boolean;
  clipSpeed?: number;
  isAlt?: boolean;
  initialClips?: Clip[];
}

interface DropGhostState {
  startMs: number;
  durationMs: number;
  trackIndex: number;
  createsNewTrack: boolean;
  label: string;
  isImage: boolean;
}

function drawMiniImageIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = 5.5;
  ctx.beginPath();
  ctx.roundRect(cx - s, cy - s + 1, s * 2, s * 2 - 2, 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s + 1.5, cy + s - 2);
  ctx.lineTo(cx - 1, cy);
  ctx.lineTo(cx + 1.5, cy + 2);
  ctx.lineTo(cx + 3.5, cy - 0.5);
  ctx.lineTo(cx + s - 1.5, cy + s - 2);
  ctx.stroke();
  ctx.restore();
}

export const TimelineCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const dropGhostRef = useRef<DropGhostState | null>(null);
  const verticalScrollRef = useRef(0);

  const [activeSnapTime, setActiveSnapTime] = useState<number | null>(null);
  const [trimTooltip, setTrimTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const {
    project,
    sources,
    activeClipId,
    setActiveClipId,
    trimClip,
    moveClip,
    addClipFromSource,
    addFiles,
    addFilesAsOverlay,
    setClipTransitionIn,
    setClipTransitionOut,
  } = useProjectStore();
  const {
    pixelsPerMs,
    scrollOffsetMs,
    snappingEnabled,
    timelineHeight,
    setScrollOffsetMs,
    setTimelineHeight,
    zoomBy,
  } = useTimelineStore();

  const maxTrackIndex = useMemo(() => getMaxTrackIndex(project.clips), [project.clips]);

  // Smoothly auto-expand timeline height when user adds their first overlay track(s)
  const prevMaxTrackRef = useRef(maxTrackIndex);
  useEffect(() => {
    if (maxTrackIndex > prevMaxTrackRef.current) {
      const neededHeight = Math.min(380, RULER_HEIGHT + 34 + 62 + maxTrackIndex * 46);
      if (timelineHeight < neededHeight) {
        setTimelineHeight(neededHeight);
      }
    }
    prevMaxTrackRef.current = maxTrackIndex;
  }, [maxTrackIndex, timelineHeight, setTimelineHeight]);

  // Compute all multi-track clip segments + V1 transition timing
  const { segments, totalDurationMs, snapCandidates, transitionMarkers } = useMemo(() => {
    const mainTiming = computeMainTrackTiming(project.clips);
    const mainTimingMap = new Map(mainTiming.items.map((it) => [it.clip.id, it]));
    let maxEndMs = mainTiming.totalMainDurationMs;
    const segs: TimelineClipSegment[] = [];
    const candidates: SnapCandidate[] = [{ timeMs: 0, type: 'zero' }];
    const markers: {
      clipId: string;
      placement: 'junction' | 'intro' | 'outro';
      centerMs: number;
      startMs: number;
      endMs: number;
      durationMs: number;
    }[] = [];

    const videoPalette = ['#38BDF8', '#818CF8', '#60A5FA', '#F472B6', '#FBBF24', '#A78BFA'];
    const imageColor = '#34D399';

    project.clips.forEach((clip, index) => {
      const src = sources.find((s) => s.id === clip.sourceId);
      const filename = src?.filename || `Clip ${index + 1}`;
      const isImg = isImageSource(src);
      const hasAudio = Boolean(src && !isImg && src.probe.audio.length > 0);
      const srcDuration = isImg
        ? MAX_IMAGE_CLIP_DURATION_MS
        : src?.probe.durationMs || (clip.outMs - clip.inMs);
      const clipSpeed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
      const clipDuration = getClipDurationMs(clip);
      const trackIndex = getClipTrackIndex(clip);
      const mainInfo = trackIndex === 0 ? mainTimingMap.get(clip.id) : undefined;
      const timelineStartMs = mainInfo
        ? mainInfo.visualStartMs
        : clip.startMs !== undefined
          ? Math.max(0, clip.startMs)
          : 0;
      const timelineEndMs = mainInfo ? mainInfo.visualEndMs : timelineStartMs + clipDuration;

      const seg: TimelineClipSegment = {
        clipId: clip.id,
        sourceId: clip.sourceId,
        filename,
        inMs: clip.inMs,
        outMs: clip.outMs,
        sourceDurationMs: srcDuration,
        timelineStartMs,
        timelineEndMs,
        trackIndex,
        isImage: isImg,
        hasAudio,
        enabled: clip.enabled,
        color: isImg ? imageColor : videoPalette[index % videoPalette.length],
        keyframes: isImg ? [] : src?.probe.keyframes || [],
        speed: clipSpeed,
      };

      segs.push(seg);

      candidates.push({ timeMs: timelineStartMs, type: 'clip-start' });
      candidates.push({ timeMs: timelineEndMs, type: 'clip-end' });

      seg.keyframes.forEach((kfMs) => {
        if (kfMs >= clip.inMs && kfMs <= clip.outMs) {
          const kfTimelineMs = timelineStartMs + Math.round((kfMs - clip.inMs) / clipSpeed);
          candidates.push({ timeMs: kfTimelineMs, type: 'keyframe' });
        }
      });

      if (mainInfo) {
        if (mainInfo.overlapInMs > 0) {
          markers.push({
            clipId: clip.id,
            placement: 'junction',
            centerMs: mainInfo.visualStartMs,
            startMs: mainInfo.playStartMs,
            endMs: mainInfo.playStartMs + mainInfo.overlapInMs,
            durationMs: mainInfo.overlapInMs,
          });
        } else if (mainInfo.introDurationMs > 0) {
          markers.push({
            clipId: clip.id,
            placement: 'intro',
            centerMs: mainInfo.playStartMs + Math.round(mainInfo.introDurationMs / 2),
            startMs: mainInfo.playStartMs,
            endMs: mainInfo.playStartMs + mainInfo.introDurationMs,
            durationMs: mainInfo.introDurationMs,
          });
        }
        if (mainInfo.outroDurationMs > 0) {
          markers.push({
            clipId: clip.id,
            placement: 'outro',
            centerMs: mainInfo.playEndMs - Math.round(mainInfo.outroDurationMs / 2),
            startMs: mainInfo.playEndMs - mainInfo.outroDurationMs,
            endMs: mainInfo.playEndMs,
            durationMs: mainInfo.outroDurationMs,
          });
        }
      }

      if (clip.enabled && trackIndex > 0) {
        maxEndMs = Math.max(maxEndMs, timelineEndMs);
      }
    });

    candidates.push({ timeMs: maxEndMs, type: 'end' });

    return {
      segments: segs,
      totalDurationMs: maxEndMs,
      snapCandidates: candidates,
      transitionMarkers: markers,
    };
  }, [project.clips, sources]);

  // Redraw canvas imperative function (60fps, zero React re-renders on scrub/drag)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Read theme CSS tokens
    const computed = getComputedStyle(canvas);
    const bgInset = computed.getPropertyValue('--bg-inset').trim() || '#090A0C';
    const bgSurface = computed.getPropertyValue('--bg-surface').trim() || '#111318';
    const bgElevated = computed.getPropertyValue('--bg-elevated').trim() || '#1A1D24';
    const trackBg = computed.getPropertyValue('--timeline-track').trim() || '#181A20';
    const accentColor = computed.getPropertyValue('--accent').trim() || '#EB5E28';
    const clipBorder = computed.getPropertyValue('--clip-border').trim() || '#38BDF8';
    const playheadColor = computed.getPropertyValue('--playhead').trim() || '#38BDF8';
    const handleColor = computed.getPropertyValue('--handle').trim() || '#FFFFFF';
    const keyframeColor =
      computed.getPropertyValue('--keyframe-mark').trim() || 'rgba(255, 255, 255, 0.45)';
    const waveformColor = computed.getPropertyValue('--waveform').trim() || '#0284C7';
    const trimmedDimColor =
      computed.getPropertyValue('--timeline-trimmed').trim() || 'rgba(0, 0, 0, 0.65)';
    const textPrimary = computed.getPropertyValue('--text-primary').trim() || '#F3F4F6';
    const textSecondary = computed.getPropertyValue('--text-secondary').trim() || '#9CA3AF';
    const textMuted = computed.getPropertyValue('--text-muted').trim() || '#6B7280';
    const borderSubtle =
      computed.getPropertyValue('--border-subtle').trim() || 'rgba(255, 255, 255, 0.08)';
    const borderStrong =
      computed.getPropertyValue('--border-strong').trim() || 'rgba(255, 255, 255, 0.16)';

    // Clamp vertical scroll
    const rawLayout = computeTracksLayout(maxTrackIndex, height, 0);
    const maxVScroll = Math.max(0, rawLayout.totalContentHeight - (height - RULER_HEIGHT));
    if (verticalScrollRef.current > maxVScroll) verticalScrollRef.current = maxVScroll;
    if (verticalScrollRef.current < 0) verticalScrollRef.current = 0;

    const layout = computeTracksLayout(maxTrackIndex, height, verticalScrollRef.current);
    const gutterW = layout.gutterWidth;
    const timelineW = Math.max(1, width - gutterW);

    // 1. Clear background
    ctx.fillStyle = bgInset;
    ctx.fillRect(0, 0, width, height);

    const ds = dragStateRef.current;
    const isMoving = ds?.type === 'clip-move';
    const draggedClipId = isMoving ? ds?.clipId : null;
    const dropGhost = dropGhostRef.current;
    const isDraggingIntoNewTrack =
      (isMoving && ds?.newTrackIndex === layout.newTrackIndex) ||
      Boolean(dropGhost && dropGhost.createsNewTrack);

    // Clip vertical region below ruler for lanes & clips
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, layout.rulerHeight, width, height - layout.rulerHeight);
    ctx.clip();

    // 2. Top "+ Overlay Track (V{n})" drop zone above the highest track
    const addY = layout.addZoneY;
    const addH = layout.addZoneHeight;
    ctx.save();
    ctx.fillStyle = isDraggingIntoNewTrack ? 'rgba(235, 94, 40, 0.14)' : 'rgba(255, 255, 255, 0.015)';
    ctx.fillRect(gutterW, addY, timelineW, addH);
    ctx.strokeStyle = isDraggingIntoNewTrack ? accentColor : borderSubtle;
    ctx.lineWidth = isDraggingIntoNewTrack ? 1.5 : 1;
    ctx.setLineDash(isDraggingIntoNewTrack ? [5, 4] : [3, 5]);
    ctx.strokeRect(gutterW + 0.5, addY + 0.5, timelineW - 1, addH - 1);
    ctx.setLineDash([]);

    // Hint text inside top drop zone
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = isDraggingIntoNewTrack ? accentColor : textMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const addHint = isDraggingIntoNewTrack
      ? t('timeline.drop_new_overlay_active', { track: `V${layout.newTrackIndex + 1}` })
      : t('timeline.drop_new_overlay_hint', { track: `V${layout.newTrackIndex + 1}` });
    ctx.fillText(addHint, gutterW + 10, addY + addH / 2);
    ctx.restore();

    // 3. Draw Track Lanes (V{max} ... V2 above V1)
    for (const lane of layout.lanes) {
      const isHighlightedTarget =
        (isMoving && ds?.newTrackIndex === lane.trackIndex) ||
        (dropGhost !== null && !dropGhost.createsNewTrack && dropGhost.trackIndex === lane.trackIndex);

      ctx.fillStyle = lane.trackIndex === 0 ? trackBg : bgSurface;
      ctx.fillRect(gutterW, lane.y, timelineW, lane.height);

      if (isHighlightedTarget) {
        ctx.fillStyle = 'rgba(235, 94, 40, 0.08)';
        ctx.fillRect(gutterW, lane.y, timelineW, lane.height);
      }

      ctx.strokeStyle = isHighlightedTarget ? accentColor : borderSubtle;
      ctx.lineWidth = 1;
      ctx.strokeRect(gutterW + 0.5, lane.y + 0.5, timelineW - 1, lane.height - 1);
    }

    // 4. Render Clip Segments (clipped horizontally to x >= gutterW)
    ctx.save();
    ctx.beginPath();
    ctx.rect(gutterW, layout.rulerHeight, timelineW, height - layout.rulerHeight);
    ctx.clip();

    const laneMap = new Map(layout.lanes.map((l) => [l.trackIndex, l]));

    segments.forEach((seg) => {
      const lane = laneMap.get(seg.trackIndex);
      if (!lane) return;

      const startX = gutterW + timeToPixel(seg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const endX = gutterW + timeToPixel(seg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const clipWidth = Math.max(4, endX - startX);

      if (endX < gutterW || startX > width) return;

      const isSelected = seg.clipId === activeClipId;
      const clipGap = 2;
      const rectX = startX + clipGap / 2;
      const rectW = Math.max(6, clipWidth - clipGap);
      const rectY = lane.y + 2;
      const rectH = lane.height - 4;

      if (seg.clipId === draggedClipId) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.save();

      // Clip block background (subtle visual distinction for image vs overlay vs main video)
      ctx.fillStyle = seg.isImage
        ? '#1A2724'
        : seg.trackIndex > 0
          ? '#202230'
          : bgElevated;
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, rectW, rectH, 4);
      ctx.fill();

      // Left colored layer accent strip
      ctx.fillStyle = seg.color;
      ctx.beginPath();
      ctx.roundRect(rectX, rectY, 3, rectH, [4, 0, 0, 4]);
      ctx.fill();

      // Audio Waveform ONLY for non-image clips with audio.
      // Confine waveform below the top label band so overlay clip titles stay readable.
      if (seg.hasAudio) {
        const samples = getSourceWaveform(seg.sourceId, seg.sourceDurationMs);
        const waveTop = rectY + (rectH <= 42 ? 15 : 18);
        const waveH = Math.max(8, rectY + rectH - waveTop - 2);
        drawClipWaveform(
          ctx,
          rectX,
          waveTop,
          rectW,
          waveH,
          samples,
          seg.inMs,
          seg.outMs,
          seg.sourceDurationMs,
          waveformColor
        );
      }

      // Clip icon + title (offset past white trim handles when selected so brackets never touch text)
      if (rectW > 26) {
        const handleW = isSelected ? Math.min(10, Math.max(5, Math.floor(rectW / 4))) : 0;
        const leftPad = isSelected ? handleW + 5 : 7;
        const rightPad = isSelected ? handleW + 5 : 7;
        const labelMidY =
          seg.isImage && rectH <= 42 ? rectY + rectH / 2 : rectY + (rectH <= 42 ? 10 : 13);
        const iconCenterX = rectX + leftPad + 5;
        if (seg.isImage) {
          drawMiniImageIcon(ctx, iconCenterX, labelMidY, seg.color);
        } else {
          ctx.beginPath();
          ctx.arc(iconCenterX, labelMidY, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = seg.color;
          ctx.fill();
        }

        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillStyle = textPrimary;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const titleX = rectX + leftPad + 14;
        const maxTitleW = rectW - leftPad - 14 - rightPad;
        if (maxTitleW > 18) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(titleX, rectY, maxTitleW, rectH);
          ctx.clip();
          const displayTitle =
            !seg.isImage && Math.abs(seg.speed - 1.0) >= 0.01
              ? `${seg.filename} (${seg.speed}x)`
              : seg.filename;
          ctx.fillText(displayTitle, titleX, labelMidY);
          ctx.restore();
        }
      }

      // Keyframe diamond marks on main video clips
      if (!seg.isImage && seg.keyframes.length > 0 && rectH >= 42) {
        ctx.fillStyle = keyframeColor;
        seg.keyframes.forEach((kfMs) => {
          if (kfMs >= seg.inMs && kfMs <= seg.outMs) {
            const kfTimelineMs = seg.timelineStartMs + Math.round((kfMs - seg.inMs) / seg.speed);
            const kfX = gutterW + Math.round(timeToPixel(kfTimelineMs, scrollOffsetMs, pixelsPerMs)) + 0.5;
            if (kfX >= rectX + 10 && kfX <= rectX + rectW - 10) {
              const markY = rectY + rectH - 5;
              ctx.beginPath();
              ctx.moveTo(kfX, markY - 3.5);
              ctx.lineTo(kfX + 3, markY);
              ctx.lineTo(kfX, markY + 3.5);
              ctx.lineTo(kfX - 3, markY);
              ctx.closePath();
              ctx.fill();
            }
          }
        });
      }

      // Selected clip border & trim handles
      if (isSelected) {
        ctx.strokeStyle = clipBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.stroke();

        const handleW = Math.min(10, Math.max(5, Math.floor(rectW / 4)));
        ctx.fillStyle = handleColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, handleW, rectH, [4, 0, 0, 4]);
        ctx.fill();

        if (handleW >= 8) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rectX + 6, rectY + rectH / 2 - 5);
          ctx.lineTo(rectX + 3, rectY + rectH / 2);
          ctx.lineTo(rectX + 6, rectY + rectH / 2 + 5);
          ctx.stroke();
        }

        ctx.fillStyle = handleColor;
        ctx.beginPath();
        ctx.roundRect(rectX + rectW - handleW, rectY, handleW, rectH, [0, 4, 4, 0]);
        ctx.fill();

        if (handleW >= 8) {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(rectX + rectW - 6, rectY + rectH / 2 - 5);
          ctx.lineTo(rectX + rectW - 3, rectY + rectH / 2);
          ctx.lineTo(rectX + rectW - 6, rectY + rectH / 2 + 5);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = borderStrong;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.stroke();
      }

      if (!seg.enabled) {
        ctx.fillStyle = trimmedDimColor;
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.fill();
      }

      ctx.restore();
    });

    // 4b. Render V1 Transition Zones & Clickable Bowtie Badges
    const mainLane = laneMap.get(0);
    if (mainLane && transitionMarkers.length > 0) {
      for (const m of transitionMarkers) {
        const zStartX = gutterW + timeToPixel(m.startMs, scrollOffsetMs, pixelsPerMs);
        const zEndX = gutterW + timeToPixel(m.endMs, scrollOffsetMs, pixelsPerMs);
        const centerX = gutterW + timeToPixel(m.centerMs, scrollOffsetMs, pixelsPerMs);
        if (zEndX < gutterW || zStartX > width) continue;

        ctx.save();
        // Shaded transition span on V1
        const zoneW = Math.max(4, zEndX - zStartX);
        ctx.fillStyle = 'rgba(235, 94, 40, 0.22)';
        ctx.fillRect(zStartX, mainLane.y + 3, zoneW, mainLane.height - 6);

        // Diagonal fade wedge for intro/outro
        if (m.placement === 'intro' || m.placement === 'outro') {
          ctx.strokeStyle = accentColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          if (m.placement === 'intro') {
            ctx.moveTo(zStartX, mainLane.y + mainLane.height - 4);
            ctx.lineTo(zEndX, mainLane.y + 4);
          } else {
            ctx.moveTo(zStartX, mainLane.y + 4);
            ctx.lineTo(zEndX, mainLane.y + mainLane.height - 4);
          }
          ctx.stroke();
        }

        // Bowtie badge centered at junction / intro / outro
        const badgeSize = 18;
        const bx = Math.round(centerX - badgeSize / 2);
        const by = Math.round(mainLane.y + (mainLane.height - badgeSize) / 2);
        ctx.fillStyle = bgElevated;
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeSize, badgeSize, 4);
        ctx.fill();
        ctx.stroke();

        // Stroke bowtie inside badge
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(bx + 4, by + 5);
        ctx.lineTo(bx + 9, by + 9);
        ctx.lineTo(bx + 4, by + 13);
        ctx.closePath();
        ctx.moveTo(bx + 14, by + 5);
        ctx.lineTo(bx + 9, by + 9);
        ctx.lineTo(bx + 14, by + 13);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 5. Render Drop Ghost when dragging a photo/video from MediaLibrary onto timeline
    if (dropGhost) {
      const ghostX = gutterW + timeToPixel(dropGhost.startMs, scrollOffsetMs, pixelsPerMs);
      const ghostW = Math.max(24, dropGhost.durationMs * pixelsPerMs);
      let ghostY: number;
      let ghostH: number;
      if (dropGhost.createsNewTrack) {
        ghostY = layout.addZoneY + 2;
        ghostH = layout.addZoneHeight - 4;
      } else {
        const targetLane = laneMap.get(dropGhost.trackIndex);
        ghostY = targetLane ? targetLane.y + 2 : layout.addZoneY + 2;
        ghostH = targetLane ? targetLane.height - 4 : layout.addZoneHeight - 4;
      }

      ctx.save();
      ctx.fillStyle = dropGhost.isImage ? 'rgba(52, 211, 153, 0.25)' : 'rgba(235, 94, 40, 0.25)';
      ctx.beginPath();
      ctx.roundRect(ghostX, ghostY, ghostW, ghostH, 4);
      ctx.fill();
      ctx.strokeStyle = dropGhost.isImage ? '#34D399' : accentColor;
      ctx.lineWidth = 1.75;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = textPrimary;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.beginPath();
      ctx.rect(ghostX + 6, ghostY, Math.max(0, ghostW - 10), ghostH);
      ctx.clip();
      ctx.fillText(
        `V${dropGhost.trackIndex + 1} · ${dropGhost.label}`,
        ghostX + 6,
        ghostY + ghostH / 2
      );
      ctx.restore();
      ctx.restore();
    }

    // 6. Render Floating Dragged Clip (horizontal + vertical track move preview)
    if (isMoving && draggedClipId && ds && ds.clipWidth !== undefined) {
      const draggedSeg = segments.find((s) => s.clipId === draggedClipId);
      if (draggedSeg) {
        const floatX =
          ds.newStartMs !== undefined
            ? gutterW + Math.round(timeToPixel(ds.newStartMs, scrollOffsetMs, pixelsPerMs))
            : Math.round((ds.currentX || 0) - (ds.grabOffsetX || 0));
        const floatW = ds.clipWidth;
        const targetTrack = ds.newTrackIndex ?? draggedSeg.trackIndex;
        const targetLane = laneMap.get(targetTrack);
        const floatY = targetLane ? targetLane.y + 2 : layout.addZoneY + 2;
        const floatH = targetLane ? targetLane.height - 4 : layout.addZoneHeight - 4;

        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 5;

        ctx.fillStyle = draggedSeg.isImage ? 'rgba(26, 39, 36, 0.96)' : 'rgba(29, 32, 39, 0.96)';
        ctx.beginPath();
        ctx.roundRect(floatX, floatY, floatW, floatH, 4);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = targetTrack === layout.newTrackIndex ? accentColor : clipBorder;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(floatX, floatY, floatW, floatH, 4);
        ctx.stroke();

        if (floatW > 24) {
          ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = textPrimary;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.save();
          ctx.beginPath();
          ctx.rect(floatX + 8, floatY, Math.max(0, floatW - 14), floatH);
          ctx.clip();
          ctx.fillText(`V${targetTrack + 1} · ${draggedSeg.filename}`, floatX + 8, floatY + floatH / 2);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    ctx.restore(); // end horizontal timeline clip

    // 7. Left Track Header Gutter (V1, V2, V3, + V{n})
    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, layout.rulerHeight, gutterW, height - layout.rulerHeight);
    ctx.strokeStyle = borderSubtle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gutterW - 0.5, layout.rulerHeight);
    ctx.lineTo(gutterW - 0.5, height);
    ctx.stroke();

    // "+ V{n}" header badge in gutter
    ctx.save();
    ctx.fillStyle = isDraggingIntoNewTrack ? accentColor : textMuted;
    ctx.font = '600 10px "SF Mono", "Segoe UI Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`+V${layout.newTrackIndex + 1}`, gutterW / 2, addY + addH / 2);
    ctx.restore();

    for (const lane of layout.lanes) {
      const isMain = lane.trackIndex === 0;
      const pillW = 30;
      const pillH = 18;
      const pillX = Math.round((gutterW - pillW) / 2);
      const pillY = Math.round(lane.y + (lane.height - pillH) / 2);

      ctx.fillStyle = isMain ? 'rgba(235, 94, 40, 0.16)' : bgElevated;
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 4);
      ctx.fill();

      ctx.strokeStyle = isMain ? accentColor : borderStrong;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '600 10px "SF Mono", "Segoe UI Mono", Consolas, monospace';
      ctx.fillStyle = isMain ? accentColor : textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lane.label, gutterW / 2, lane.y + lane.height / 2 + 0.5);
    }

    ctx.restore(); // end below-ruler clip

    // 8. Top-Left Corner Box + Ruler
    ctx.fillStyle = bgSurface;
    ctx.fillRect(0, 0, gutterW, layout.rulerHeight);
    ctx.strokeStyle = borderSubtle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, layout.rulerHeight - 0.5);
    ctx.lineTo(gutterW, layout.rulerHeight - 0.5);
    ctx.moveTo(gutterW - 0.5, 0);
    ctx.lineTo(gutterW - 0.5, layout.rulerHeight);
    ctx.stroke();

    // Layers glyph inside top-left gutter corner
    ctx.save();
    ctx.strokeStyle = textMuted;
    ctx.lineWidth = 1.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lx = gutterW / 2;
    const ly = layout.rulerHeight / 2;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 5);
    ctx.lineTo(lx + 6, ly - 2);
    ctx.lineTo(lx, ly + 1);
    ctx.lineTo(lx - 6, ly - 2);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly + 2);
    ctx.lineTo(lx, ly + 5);
    ctx.lineTo(lx + 6, ly + 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(gutterW, 0, timelineW, layout.rulerHeight);
    ctx.clip();
    ctx.translate(gutterW, 0);
    drawTimelineRuler(
      ctx,
      timelineW,
      layout.rulerHeight,
      scrollOffsetMs,
      pixelsPerMs,
      textMuted,
      borderSubtle,
      borderSubtle
    );
    ctx.restore();

    // 9. Active Snap Guide Line
    if (activeSnapTime !== null) {
      const snapX = gutterW + Math.round(timeToPixel(activeSnapTime, scrollOffsetMs, pixelsPerMs)) + 0.5;
      if (snapX >= gutterW && snapX <= width) {
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(snapX, 0);
        ctx.lineTo(snapX, height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 10. Playhead
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = gutterW + Math.round(timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs)) + 0.5;

    if (playheadX >= gutterW - 6 && playheadX <= width + 10) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(gutterW - 6, 0, timelineW + 16, height);
      ctx.clip();

      ctx.strokeStyle = playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, layout.rulerHeight);
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
      ctx.restore();
    }

    ctx.restore();
  }, [
    segments,
    transitionMarkers,
    activeClipId,
    pixelsPerMs,
    scrollOffsetMs,
    activeSnapTime,
    maxTrackIndex,
    project.clips.length,
  ]);

  // Continuous 60fps animation frame draw loop
  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const getTracksLayout = useCallback(() => {
    const canvas = canvasRef.current;
    const height = canvas?.clientHeight || timelineHeight;
    return computeTracksLayout(maxTrackIndex, height, verticalScrollRef.current);
  }, [maxTrackIndex, timelineHeight]);

  // Helper: find clip segment under (mouseX, mouseY)
  const hitTestSegment = useCallback(
    (mouseX: number, mouseY: number) => {
      if (mouseX < TRACK_GUTTER_WIDTH || mouseY <= RULER_HEIGHT) return null;
      const layout = getTracksLayout();
      const lane = layout.lanes.find((l) => mouseY >= l.y && mouseY <= l.y + l.height);
      if (!lane) return null;
      const clickTimeMs = pixelToTime(mouseX - TRACK_GUTTER_WIDTH, scrollOffsetMs, pixelsPerMs);
      const idx = segments.findIndex(
        (s) =>
          s.trackIndex === lane.trackIndex &&
          clickTimeMs >= s.timelineStartMs &&
          clickTimeMs <= s.timelineEndMs
      );
      if (idx === -1) return null;
      return { segment: segments[idx], index: idx, lane };
    },
    [getTracksLayout, scrollOffsetMs, pixelsPerMs, segments]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || e.button !== 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    if (mouseX < TRACK_GUTTER_WIDTH) return;

    const timelineX = mouseX - TRACK_GUTTER_WIDTH;
    const clickTimeMs = pixelToTime(timelineX, scrollOffsetMs, pixelsPerMs);
    const layout = getTracksLayout();

    // 1. Click on Ruler: scrub playhead
    if (mouseY <= layout.rulerHeight) {
      dragStateRef.current = { type: 'scrub', startX: mouseX, startY: mouseY };
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

    // 2. Click directly on playhead vertical line
    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = TRACK_GUTTER_WIDTH + timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs);
    if (Math.abs(mouseX - playheadX) <= 6) {
      dragStateRef.current = { type: 'scrub', startX: mouseX, startY: mouseY };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 2.5 Click directly on a V1 Transition Badge -> focus Transitions tab on that slot
    const mainLane = layout.lanes.find((l) => l.trackIndex === 0);
    if (mainLane && mouseY >= mainLane.y && mouseY <= mainLane.y + mainLane.height) {
      for (const m of transitionMarkers) {
        const badgeX = TRACK_GUTTER_WIDTH + timeToPixel(m.centerMs, scrollOffsetMs, pixelsPerMs);
        if (Math.abs(mouseX - badgeX) <= 11) {
          setActiveClipId(m.clipId);
          useUiStore.getState().focusTransitionSlot(m.placement);
          usePlayerStore.getState().seek(Math.max(0, m.startMs - 200));
          draw();
          return;
        }
      }
    }

    // 3. Check active clip trim handles (< and >) on its specific track lane
    const activeSeg = segments.find((s) => s.clipId === activeClipId);
    if (activeSeg) {
      const activeLane = layout.lanes.find((l) => l.trackIndex === activeSeg.trackIndex);
      if (activeLane && mouseY >= activeLane.y && mouseY <= activeLane.y + activeLane.height) {
        const startX = TRACK_GUTTER_WIDTH + timeToPixel(activeSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
        const endX = TRACK_GUTTER_WIDTH + timeToPixel(activeSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
        const hitDistance = 12;

        if (Math.abs(mouseX - startX) <= hitDistance) {
          dragStateRef.current = {
            type: 'trim-in',
            clipId: activeSeg.clipId,
            startX: mouseX,
            startY: mouseY,
            initialStartMs: activeSeg.timelineStartMs,
            initialInMs: activeSeg.inMs,
            initialOutMs: activeSeg.outMs,
            initialTrackIndex: activeSeg.trackIndex,
            isImage: activeSeg.isImage,
            clipSpeed: activeSeg.speed,
            initialClips: JSON.parse(JSON.stringify(project.clips)),
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }

        if (Math.abs(mouseX - endX) <= hitDistance) {
          dragStateRef.current = {
            type: 'trim-out',
            clipId: activeSeg.clipId,
            startX: mouseX,
            startY: mouseY,
            initialStartMs: activeSeg.timelineStartMs,
            initialInMs: activeSeg.inMs,
            initialOutMs: activeSeg.outMs,
            initialTrackIndex: activeSeg.trackIndex,
            isImage: activeSeg.isImage,
            clipSpeed: activeSeg.speed,
            initialClips: JSON.parse(JSON.stringify(project.clips)),
          };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
      }
    }

    // 4. Click inside ANY clip segment on ANY track
    const hit = hitTestSegment(mouseX, mouseY);
    if (hit) {
      const clickedSeg = hit.segment;
      setActiveClipId(clickedSeg.clipId);
      const clipStartX =
        TRACK_GUTTER_WIDTH + timeToPixel(clickedSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
      const clipEndX =
        TRACK_GUTTER_WIDTH + timeToPixel(clickedSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
      const clipW = Math.max(6, clipEndX - clipStartX);

      dragStateRef.current = {
        type: 'clip-pending',
        clipId: clickedSeg.clipId,
        sourceId: clickedSeg.sourceId,
        fromIndex: hit.index,
        startX: mouseX,
        startY: mouseY,
        currentX: mouseX,
        currentY: mouseY,
        grabOffsetX: mouseX - clipStartX,
        clipWidth: clipW,
        clipDurationMs: Math.max(0, clickedSeg.timelineEndMs - clickedSeg.timelineStartMs),
        initialStartMs: clickedSeg.timelineStartMs,
        newStartMs: clickedSeg.timelineStartMs,
        initialTrackIndex: clickedSeg.trackIndex,
        newTrackIndex: clickedSeg.trackIndex,
        initialInMs: clickedSeg.inMs,
        initialOutMs: clickedSeg.outMs,
        sourceDurationMs: clickedSeg.sourceDurationMs,
        isImage: clickedSeg.isImage,
        clipSpeed: clickedSeg.speed,
        initialClips: JSON.parse(JSON.stringify(project.clips)),
        isAlt: e.altKey,
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // 5. Click on empty track area -> scrub & deselect
    setActiveClipId(null);
    dragStateRef.current = { type: 'scrub', startX: mouseX, startY: mouseY };
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
    const timelineX = Math.max(0, mouseX - TRACK_GUTTER_WIDTH);
    const currentTimeAtMouse = pixelToTime(timelineX, scrollOffsetMs, pixelsPerMs);
    const layout = getTracksLayout();

    const state = dragStateRef.current;

    if (state) {
      if (state.type === 'clip-pending') {
        const dist = Math.hypot(mouseX - state.startX, mouseY - state.startY);
        if (dist >= 4) {
          usePlayerStore.getState().pause();
          const isTrimmed =
            !state.isImage &&
            ((state.initialInMs !== undefined && state.initialInMs > 0) ||
              (state.initialOutMs !== undefined &&
                state.sourceDurationMs !== undefined &&
                state.initialOutMs < state.sourceDurationMs));
          const wantsSlip = state.isAlt && isTrimmed;

          state.type = wantsSlip ? 'clip-slip' : 'clip-move';
          if (state.clipId) setActiveClipId(state.clipId);
        } else {
          return;
        }
      }

      // 1. Scrub
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
        const clipSpeed = state.clipSpeed || seg?.speed || 1.0;
        const deltaTimelineMs = Math.round((mouseX - state.startX) / pixelsPerMs);

        if (state.isImage) {
          // For still images, dragging left edge shifts startMs and adjusts duration while keeping right edge fixed!
          const initialStart = state.initialStartMs ?? 0;
          const initialDur = Math.round((state.initialOutMs - state.initialInMs) / clipSpeed);
          const fixedEnd = initialStart + initialDur;
          const newStart = Math.max(0, Math.min(fixedEnd - 100, initialStart + deltaTimelineMs));
          const newDur = Math.max(100, fixedEnd - newStart);
          const newOut = state.initialInMs + Math.round(newDur * clipSpeed);
          trimClip(state.clipId, state.initialInMs, newOut, false, newStart);
          usePlayerStore.getState().seek(newStart);
          setTrimTooltip({
            text: `${t('common.duration')}: ${formatTimecode(newDur)}`,
            x: Math.max(60, Math.min(width - 60, mouseX)),
            y: Math.max(10, mouseY - 28),
          });
          draw();
          return;
        }

        const deltaSourceMs = deltaTimelineMs * clipSpeed;
        let newInMs = Math.max(
          0,
          Math.min(state.initialOutMs - 100, Math.round(state.initialInMs + deltaSourceMs))
        );

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

        // On overlay tracks, anchor the right edge by shifting startMs along with inMs
        let updatedStartMs: number | undefined;
        if ((state.initialTrackIndex ?? 0) > 0 && state.initialStartMs !== undefined) {
          const actualTrimTimelineDelta = Math.round((newInMs - state.initialInMs) / clipSpeed);
          updatedStartMs = Math.max(0, state.initialStartMs + actualTrimTimelineDelta);
        }

        trimClip(state.clipId, newInMs, state.initialOutMs, false, updatedStartMs);
        if (updatedStartMs !== undefined) {
          usePlayerStore.getState().seek(updatedStartMs);
        } else if (seg) {
          usePlayerStore.getState().seek(seg.timelineStartMs);
        }

        setTrimTooltip({
          text: `${t('common.in')}: ${formatTimecode(newInMs)}`,
          x: Math.max(60, Math.min(width - 60, mouseX)),
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
        const clipSpeed = state.clipSpeed || seg?.speed || 1.0;
        const deltaMs = ((mouseX - state.startX) / pixelsPerMs) * clipSpeed;
        let newOutMs = Math.max(state.initialInMs + 100, Math.round(state.initialOutMs + deltaMs));

        if (seg) {
          const maxAllowed = state.isImage ? MAX_IMAGE_CLIP_DURATION_MS : seg.sourceDurationMs;
          newOutMs = Math.min(maxAllowed, newOutMs);
          if (snappingEnabled) {
            const timelineEndCandidate =
              seg.timelineStartMs + Math.round((newOutMs - state.initialInMs) / clipSpeed);
            const otherSnapCandidates = snapCandidates.filter(
              (c) => c.type !== 'keyframe'
            );
            const snap = findSnapTarget(timelineEndCandidate, otherSnapCandidates, pixelsPerMs);
            if (snap && snap.timeMs > seg.timelineStartMs + 100) {
              const snappedOut =
                state.initialInMs + Math.round((snap.timeMs - seg.timelineStartMs) * clipSpeed);
              if (snappedOut <= maxAllowed && snappedOut >= state.initialInMs + 100) {
                newOutMs = snappedOut;
                setActiveSnapTime(snap.timeMs);
              } else {
                setActiveSnapTime(null);
              }
            } else {
              setActiveSnapTime(null);
            }
          }
        }

        trimClip(state.clipId, state.initialInMs, newOutMs);

        if (seg) {
          const newDur = Math.round((newOutMs - state.initialInMs) / clipSpeed);
          usePlayerStore.getState().seek(seg.timelineStartMs + newDur);
          setTrimTooltip({
            text: state.isImage
              ? `${t('common.duration')}: ${formatTimecode(newDur)}`
              : `${t('common.out')}: ${formatTimecode(newOutMs)}`,
            x: Math.max(60, Math.min(width - 60, mouseX)),
            y: Math.max(10, mouseY - 28),
          });
        }
        draw();
        return;
      }

      // 4. Clip Move (horizontal time + vertical track switching / new track creation!)
      if (state.type === 'clip-move' && state.clipId) {
        state.currentX = mouseX;
        state.currentY = mouseY;

        const edgeMargin = 40;
        const timelineW = Math.max(1, width - TRACK_GUTTER_WIDTH);
        if (mouseX > width - edgeMargin) {
          const maxScroll = Math.max(0, totalDurationMs - timelineW / pixelsPerMs);
          setScrollOffsetMs(Math.min(maxScroll + 1000, scrollOffsetMs + 40));
        } else if (mouseX < TRACK_GUTTER_WIDTH + edgeMargin && scrollOffsetMs > 0) {
          setScrollOffsetMs(Math.max(0, scrollOffsetMs - 40));
        }

        const grabOffset = state.grabOffsetX || 0;
        const clipPixelLeft = mouseX - TRACK_GUTTER_WIDTH - grabOffset;
        const rawTargetStartMs = Math.max(
          0,
          Math.round(pixelToTime(clipPixelLeft, scrollOffsetMs, pixelsPerMs))
        );
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
            const distStart = Math.abs(rawTargetStartMs - sp);
            if (distStart < snapThresholdMs && distStart < bestDist) {
              bestDist = distStart;
              snappedStartMs = sp;
              snapIndicatorTime = sp;
            }
            const targetEndMs = rawTargetStartMs + clipDurMs;
            const distEnd = Math.abs(targetEndMs - sp);
            if (distEnd < snapThresholdMs && distEnd < bestDist) {
              bestDist = distEnd;
              snappedStartMs = Math.max(0, sp - clipDurMs);
              snapIndicatorTime = sp;
            }
          }
        }

        const targetTrack = hitTestTrackAtY(layout, mouseY);
        setActiveSnapTime(snapIndicatorTime);
        state.newStartMs = snappedStartMs;
        state.newTrackIndex = targetTrack;

        setTrimTooltip({
          text: `V${targetTrack + 1} · ${formatTimecode(snappedStartMs)}`,
          x: Math.max(70, Math.min(width - 70, mouseX)),
          y: Math.max(10, mouseY - 32),
        });

        draw();
        return;
      }

      // 5. Clip Slip
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
        if (seg) usePlayerStore.getState().seek(seg.timelineStartMs);

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

    // Dynamic Hover Cursor
    if (mouseX < TRACK_GUTTER_WIDTH) {
      canvas.style.cursor = 'default';
      return;
    }

    if (mouseY <= layout.rulerHeight) {
      canvas.style.cursor = 'pointer';
      return;
    }

    const currentMs = usePlayerStore.getState().currentTimeMs;
    const playheadX = TRACK_GUTTER_WIDTH + timeToPixel(currentMs, scrollOffsetMs, pixelsPerMs);
    if (Math.abs(mouseX - playheadX) <= 6) {
      canvas.style.cursor = 'ew-resize';
      return;
    }

    const activeSeg = segments.find((s) => s.clipId === activeClipId);
    if (activeSeg) {
      const activeLane = layout.lanes.find((l) => l.trackIndex === activeSeg.trackIndex);
      if (activeLane && mouseY >= activeLane.y && mouseY <= activeLane.y + activeLane.height) {
        const startX =
          TRACK_GUTTER_WIDTH + timeToPixel(activeSeg.timelineStartMs, scrollOffsetMs, pixelsPerMs);
        const endX =
          TRACK_GUTTER_WIDTH + timeToPixel(activeSeg.timelineEndMs, scrollOffsetMs, pixelsPerMs);
        if (Math.abs(mouseX - startX) <= 12 || Math.abs(mouseX - endX) <= 12) {
          canvas.style.cursor = 'ew-resize';
          return;
        }
      }
    }

    const hit = hitTestSegment(mouseX, mouseY);
    if (hit) {
      canvas.style.cursor = 'grab';
      return;
    }

    canvas.style.cursor = 'default';
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current) return;
    const state = dragStateRef.current;

    if (state.type === 'clip-pending') {
      if (state.clipId) setActiveClipId(state.clipId);
      const clickTimeMs = pixelToTime(
        Math.max(0, state.startX - TRACK_GUTTER_WIDTH),
        scrollOffsetMs,
        pixelsPerMs
      );
      let targetMs = clickTimeMs;
      if (snappingEnabled) {
        const snap = findSnapTarget(clickTimeMs, snapCandidates, pixelsPerMs);
        if (snap) targetMs = snap.timeMs;
      }
      usePlayerStore.getState().seek(targetMs);
    } else if (state.type === 'clip-move') {
      if (state.clipId && state.newStartMs !== undefined) {
        moveClip(state.clipId, state.newStartMs, state.newTrackIndex);
        setActiveClipId(state.clipId);
        usePlayerStore.getState().seek(state.newStartMs);
      }
    } else if (state.type === 'clip-slip') {
      if (state.initialClips && state.clipId) {
        const current = useProjectStore.getState().project.clips.find((c) => c.id === state.clipId);
        if (current && (current.inMs !== state.initialInMs || current.outMs !== state.initialOutMs)) {
          useHistoryStore.getState().recordChange(state.initialClips, 'Slip clip');
        }
      }
    } else if (state.type === 'trim-in' || state.type === 'trim-out') {
      if (state.initialClips && state.clipId) {
        const current = useProjectStore.getState().project.clips.find((c) => c.id === state.clipId);
        if (
          current &&
          (current.inMs !== state.initialInMs ||
            current.outMs !== state.initialOutMs ||
            current.startMs !== state.initialStartMs)
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
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const timelineW = Math.max(1, canvas.clientWidth - TRACK_GUTTER_WIDTH);

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.25 : 0.8;
      zoomBy(factor, Math.max(0, mouseX - TRACK_GUTTER_WIDTH), timelineW, totalDurationMs);
      draw();
      return;
    }

    // Scroll tracks vertically when hovering left gutter or holding Alt with multiple overlay tracks
    const rawLayout = computeTracksLayout(maxTrackIndex, canvas.clientHeight, 0);
    const maxVScroll = Math.max(0, rawLayout.totalContentHeight - (canvas.clientHeight - RULER_HEIGHT));
    if (maxVScroll > 0 && (mouseX < TRACK_GUTTER_WIDTH || e.altKey)) {
      e.preventDefault();
      verticalScrollRef.current = Math.max(0, Math.min(maxVScroll, verticalScrollRef.current + e.deltaY * 0.6));
      draw();
      return;
    }

    const delta = e.shiftKey ? e.deltaY : e.deltaX || e.deltaY;
    const deltaMs = delta / pixelsPerMs;
    const maxScroll = Math.max(0, totalDurationMs - timelineW / pixelsPerMs);
    const nextOffset = Math.max(0, Math.min(maxScroll + 1000, scrollOffsetMs + deltaMs));
    setScrollOffsetMs(nextOffset);
    draw();
  };

  // Compute drop target (trackIndex + snapped startMs) for MediaLibrary / File drag-over
  const resolveDropTarget = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const layout = getTracksLayout();

    const rawMs = Math.max(
      0,
      Math.round(pixelToTime(Math.max(0, mouseX - TRACK_GUTTER_WIDTH), scrollOffsetMs, pixelsPerMs))
    );
    let snappedMs = rawMs;
    if (snappingEnabled) {
      const snap = findSnapTarget(rawMs, snapCandidates, pixelsPerMs, 10);
      if (snap) snappedMs = snap.timeMs;
    }

    const draggedSourceId = getDraggingSourceId();
    const draggedSource = draggedSourceId
      ? sources.find((s) => s.id === draggedSourceId)
      : undefined;
    const durMs = Math.max(
      100,
      Math.round(draggedSource?.probe.durationMs || DEFAULT_IMAGE_DURATION_MS)
    );
    const isImg = isImageSource(draggedSource);

    let hitTrack = hitTestTrackAtY(layout, mouseY);
    let createsNewTrack = hitTrack >= layout.newTrackIndex;

    // If hovering V1 over an existing clip, automatically lift drop target to a free overlay track above V1!
    if (hitTrack === 0 && hasTrackOverlap(project.clips, 0, snappedMs, snappedMs + durMs)) {
      hitTrack = findFreeOverlayTrack(project.clips, snappedMs, snappedMs + durMs, 1);
      createsNewTrack = hitTrack >= layout.newTrackIndex;
    } else if (hitTrack > 0 && !createsNewTrack) {
      if (hasTrackOverlap(project.clips, hitTrack, snappedMs, snappedMs + durMs)) {
        hitTrack = findFreeOverlayTrack(project.clips, snappedMs, snappedMs + durMs, hitTrack);
        createsNewTrack = hitTrack >= layout.newTrackIndex;
      }
    }

    return {
      startMs: snappedMs,
      durationMs: durMs,
      trackIndex: hitTrack,
      createsNewTrack,
      label: draggedSource?.filename || t('timeline.new_clip_label'),
      isImage: isImg,
    };
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (getDraggingTransitionType()) {
      dropGhostRef.current = null;
      return;
    }
    const target = resolveDropTarget(e.clientX, e.clientY);
    dropGhostRef.current = target;
    draw();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      dropGhostRef.current = null;
      draw();
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const transitionTypeRaw =
      e.dataTransfer.getData('megu/transition-type') || getDraggingTransitionType();
    setDraggingTransitionType(null);
    if (transitionTypeRaw && transitionTypeRaw !== 'none') {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const hit = hitTestSegment(mouseX, mouseY);
        const targetSeg = hit?.segment || segments.find((s) => s.trackIndex === 0);
        if (targetSeg) {
          const mainSegs = segments.filter((s) => s.trackIndex === 0 && s.enabled);
          const mainIdx = mainSegs.findIndex((s) => s.clipId === targetSeg.clipId);
          const isCloserToEnd =
            mouseX >
            TRACK_GUTTER_WIDTH +
              timeToPixel(
                (targetSeg.timelineStartMs + targetSeg.timelineEndMs) / 2,
                scrollOffsetMs,
                pixelsPerMs
              );
          const tr = createDefaultTransition(transitionTypeRaw as TransitionType);
          if (targetSeg.trackIndex === 0 && mainSegs.length > 1) {
            if (isCloserToEnd && mainIdx >= 0 && mainIdx < mainSegs.length - 1) {
              const nextSeg = mainSegs[mainIdx + 1];
              setClipTransitionIn(nextSeg.clipId, tr, true);
              setActiveClipId(nextSeg.clipId);
              useUiStore.getState().focusTransitionSlot('junction');
            } else if (mainIdx > 0) {
              setClipTransitionIn(targetSeg.clipId, tr, true);
              setActiveClipId(targetSeg.clipId);
              useUiStore.getState().focusTransitionSlot('junction');
            } else {
              setClipTransitionIn(targetSeg.clipId, tr, true);
              setActiveClipId(targetSeg.clipId);
              useUiStore.getState().focusTransitionSlot('intro');
            }
          } else {
            if (isCloserToEnd) {
              setClipTransitionOut(targetSeg.clipId, tr, true);
              useUiStore.getState().focusTransitionSlot('outro');
            } else {
              setClipTransitionIn(targetSeg.clipId, tr, true);
              useUiStore.getState().focusTransitionSlot('intro');
            }
            setActiveClipId(targetSeg.clipId);
          }
        }
      }
      dropGhostRef.current = null;
      draw();
      return;
    }

    const target = resolveDropTarget(e.clientX, e.clientY);
    dropGhostRef.current = null;
    draw();

    const sourceId = e.dataTransfer.getData('megu/source-id') || getDraggingSourceId();
    setDraggingSourceId(null);

    if (sourceId) {
      addClipFromSource(sourceId, {
        atTimeMs: target?.startMs ?? 0,
        trackIndex: target?.trackIndex ?? 0,
        asOverlay: (target?.trackIndex ?? 0) > 0,
      });
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path || '')
        .filter(Boolean);
      if (paths.length > 0) {
        if (target && target.trackIndex > 0) {
          await addFilesAsOverlay(paths, target.startMs, target.trackIndex);
        } else {
          await addFiles(paths);
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      data-drop-zone="timeline"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
