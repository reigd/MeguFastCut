import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import {
  ensureProxy,
  getCachedProxyPath,
  recoverBrokenProxy,
  resolvePreviewFilePath,
  proxyStatusKey,
} from '../../shared/proxy-manager';
import {
  computeGeometry,
  buildCssTransform,
  resolveAspectRatio,
  computeDefaultOverlayBounds,
} from '../../shared/geometry';
import {
  getClipDurationMs,
  getClipStartMs,
  getClipTrackIndex,
  getTimelineTotalDurationMs,
  isImageSource,
  safeConvertFileSrc,
} from '../../shared/media-formats';
import { getDraggingSourceId, setDraggingSourceId } from '../../shared/drag-state';
import { Clip, PreviewQuality, SourceFile } from '../../shared/types';
import { CropOverlay, NormalizedBounds } from '../transform/CropOverlay';
import { t } from '../../shared/i18n';
import { SparkleIcon, FilmIcon, LayersIcon } from '../../components/icons';

interface OverlayLayerItemProps {
  clip: Clip;
  source: SourceFile;
  localTimeMs: number;
  isPlaying: boolean;
  isAudioMuted: boolean;
  masterVolume: number;
  projectVolumeDb: number;
  previewQuality: PreviewQuality;
  containerW: number;
  containerH: number;
  zIndex: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
}

const OverlayLayerItem: React.FC<OverlayLayerItemProps> = ({
  clip,
  source,
  localTimeMs,
  isPlaying,
  isAudioMuted,
  masterVolume,
  projectVolumeDb,
  previewQuality,
  containerW,
  containerH,
  zIndex,
  isSelected,
  onSelect,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isImage = isImageSource(source);

  const hasCachedProxy = Boolean(
    isImage ? source.imagePreviewPath : getCachedProxyPath(source, previewQuality)
  );

  useEffect(() => {
    void ensureProxy(source, previewQuality);
  }, [source.id, source.probe, hasCachedProxy, previewQuality]);

  const resolvedPath = resolvePreviewFilePath(source, previewQuality);
  const mediaUrl = useMemo(() => safeConvertFileSrc(resolvedPath), [resolvedPath]);

  // Sync overlay video playback, seeking, rate, and audio gain
  useEffect(() => {
    if (isImage) return;
    const el = videoRef.current;
    if (!el) return;

    const totalDb = projectVolumeDb + (clip.volumeDb || 0);
    const gainLinear = Math.pow(10, totalDb / 20);
    el.muted = isAudioMuted;
    el.volume = Math.max(0, Math.min(1, masterVolume * gainLinear));

    const targetRate = Math.max(0.0625, Math.min(16, clip.speed || 1.0));
    if (Math.abs(el.playbackRate - targetRate) > 0.001) {
      try {
        el.playbackRate = targetRate;
      } catch {
        // ignore unsupported rate
      }
    }

    const targetSec = Math.max(0, localTimeMs / 1000);
    if (isPlaying) {
      if (el.readyState >= 1 && Math.abs(el.currentTime - targetSec) > 0.18) {
        el.currentTime = targetSec;
      }
      if (el.paused) {
        el.play().catch(() => {});
      }
    } else {
      if (!el.paused) el.pause();
      if (el.readyState >= 1 && Math.abs(el.currentTime - targetSec) > 0.03) {
        el.currentTime = targetSec;
      }
    }
  }, [
    isImage,
    mediaUrl,
    localTimeMs,
    isPlaying,
    isAudioMuted,
    masterVolume,
    projectVolumeDb,
    clip.volumeDb,
    clip.speed,
  ]);

  const bounds = useMemo(() => {
    if (clip.overlayBounds) return clip.overlayBounds;
    return computeDefaultOverlayBounds(
      source.probe.video?.width || 640,
      source.probe.video?.height || 360,
      containerW || 1920,
      containerH || 1080,
      clip.rotate,
      0.6
    );
  }, [clip.overlayBounds, clip.rotate, source.probe.video?.width, source.probe.video?.height, containerW, containerH]);

  const boxLeft = Math.round(bounds.x * containerW);
  const boxTop = Math.round(bounds.y * containerH);
  const boxW = Math.max(2, Math.round(bounds.width * containerW));
  const boxH = Math.max(2, Math.round(bounds.height * containerH));

  const isQuarter = clip.rotate === 90 || clip.rotate === 270;
  const innerW = isQuarter ? boxH : boxW;
  const innerH = isQuarter ? boxW : boxH;
  const cssTransform = buildCssTransform(clip.rotate || 0, clip.flipH || false, clip.flipV || false);
  const fullTransform = cssTransform === 'none'
    ? 'translate(-50%, -50%)'
    : `translate(-50%, -50%) ${cssTransform}`;

  const sharpness = Math.max(0, Math.min(1, clip.sharpness ?? 0));
  const filterId = `megu-ov-sharpen-${clip.id}`;
  const kernelMatrix = useMemo(() => {
    if (sharpness <= 0.001) return null;
    const k = Number((sharpness * 0.65).toFixed(4));
    const center = Number((1 + 4 * k).toFixed(4));
    return `0 ${-k} 0 ${-k} ${center} ${-k} 0 ${-k} 0`;
  }, [sharpness]);

  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${innerW}px`,
    height: `${innerH}px`,
    transform: fullTransform,
    objectFit: 'fill',
    filter: kernelMatrix ? `url(#${filterId})` : undefined,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <div
      className="video-click-target overlay-layer-item"
      data-clip-id={clip.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(clip.id);
      }}
      style={{
        position: 'absolute',
        left: `${boxLeft}px`,
        top: `${boxTop}px`,
        width: `${boxW}px`,
        height: `${boxH}px`,
        zIndex,
        overflow: 'hidden',
        cursor: isSelected ? 'grab' : 'pointer',
        pointerEvents: 'auto',
      }}
    >
      {kernelMatrix && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feConvolveMatrix
                order="3"
                kernelMatrix={kernelMatrix}
                preserveAlpha="true"
                edgeMode="duplicate"
              />
            </filter>
          </defs>
        </svg>
      )}

      {mediaUrl ? (
        isImage ? (
          <img
            src={mediaUrl}
            alt={source.filename}
            draggable={false}
            onError={() => {
              void recoverBrokenProxy(source, previewQuality, resolvedPath);
            }}
            style={mediaStyle}
          />
        ) : (
          <video
            ref={videoRef}
            src={mediaUrl}
            preload="auto"
            playsInline
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              if (source.probe.video && el.videoWidth === 0 && el.videoHeight === 0) {
                if (resolvedPath !== source.path) {
                  void recoverBrokenProxy(source, previewQuality, resolvedPath);
                } else {
                  void ensureProxy(source, previewQuality, { forceCodecFallback: true });
                }
              }
              el.currentTime = Math.max(0, localTimeMs / 1000);
              if (isPlaying) {
                el.play().catch(() => {});
              }
            }}
            onError={() => {
              if (resolvedPath !== source.path) {
                void recoverBrokenProxy(source, previewQuality, resolvedPath);
              } else if (source.probe.video) {
                void ensureProxy(source, previewQuality, { forceCodecFallback: true });
              }
            }}
            style={mediaStyle}
          />
        )
      ) : null}
    </div>
  );
};

export const VideoPlayer: React.FC = () => {
  const {
    project,
    sources,
    activeClipId,
    setActiveClipId,
    setFitBounds,
    setStretchBounds,
    setClipOverlayBounds,
    addClipFromSource,
    addFilesAsOverlay,
    addFiles,
  } = useProjectStore();
  const {
    currentTimeMs,
    isPlaying,
    isMuted,
    volume,
    showOriginalAspect,
    isFullscreen,
    seek,
    pause,
    previewQuality,
    proxyStatus,
    isCropEditing,
    setCropEditing,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isResizingCrop, setIsResizingCrop] = useState(false);
  const [isViewportDragOver, setIsViewportDragOver] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Main track clips (V1, trackIndex === 0)
  const mainClips = useMemo(
    () =>
      project.clips
        .filter((c) => c.enabled && getClipTrackIndex(c) === 0)
        .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0)),
    [project.clips]
  );

  // Active clip on main track V1 at currentTimeMs
  const { currentClip, currentSource, currentClipIndex, clipLocalTimeMs, isGap } = useMemo(() => {
    for (let i = 0; i < mainClips.length; i++) {
      const clip = mainClips[i];
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
      const clipDuration = getClipDurationMs(clip);
      const clipStart = getClipStartMs(clip, project.clips);
      const clipEnd = clipStart + clipDuration;
      const nextClipStart = mainClips[i + 1]
        ? getClipStartMs(mainClips[i + 1], project.clips)
        : clipEnd;
      const isAtClipEnd =
        clipDuration > 0 &&
        currentTimeMs === clipEnd &&
        (i === mainClips.length - 1 || nextClipStart > clipEnd);

      if (currentTimeMs >= clipStart && (currentTimeMs < clipEnd || isAtClipEnd)) {
        const localTimelineProgress = Math.min(clipDuration, currentTimeMs - clipStart);
        const localSourceTime = clip.inMs + localTimelineProgress * speed;
        const src = sources.find((s) => s.id === clip.sourceId);
        return {
          currentClip: clip,
          currentSource: src,
          currentClipIndex: i,
          clipLocalTimeMs: Math.min(clip.outMs, Math.max(clip.inMs, localSourceTime)),
          isGap: false,
        };
      }
    }

    return {
      currentClip: undefined,
      currentSource: undefined,
      currentClipIndex: -1,
      clipLocalTimeMs: 0,
      isGap: true,
    };
  }, [mainClips, project.clips, sources, currentTimeMs]);

  const isCurrentMainImage = isImageSource(currentSource);
  const totalDurationMs = useMemo(() => getTimelineTotalDurationMs(project.clips), [project.clips]);

  // Visible overlay clips (V2, V3, ...) sorted bottom-to-top by trackIndex
  const visibleOverlays = useMemo(() => {
    const items: { clip: Clip; source: SourceFile; localTimeMs: number; trackIndex: number }[] = [];
    for (const clip of project.clips) {
      if (!clip.enabled) continue;
      const trackIndex = getClipTrackIndex(clip);
      if (trackIndex === 0) continue;
      const src = sources.find((s) => s.id === clip.sourceId);
      if (!src) continue;
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
      const clipDuration = getClipDurationMs(clip);
      const clipStart = getClipStartMs(clip, project.clips);
      const clipEnd = clipStart + clipDuration;
      const isAtEnd =
        clipDuration > 0 && currentTimeMs === clipEnd && clipEnd >= totalDurationMs;
      if (currentTimeMs >= clipStart && (currentTimeMs < clipEnd || isAtEnd)) {
        const localProgress = Math.min(clipDuration, currentTimeMs - clipStart);
        const localSourceTime = clip.inMs + localProgress * speed;
        items.push({
          clip,
          source: src,
          localTimeMs: Math.min(clip.outMs, Math.max(clip.inMs, localSourceTime)),
          trackIndex,
        });
      }
    }
    items.sort((a, b) => a.trackIndex - b.trackIndex);
    return items;
  }, [project.clips, sources, currentTimeMs, totalDurationMs]);

  // Synchronized refs for 60fps playback loop
  const currentClipRef = useRef(currentClip);
  currentClipRef.current = currentClip;
  const isCurrentMainImageRef = useRef(isCurrentMainImage);
  isCurrentMainImageRef.current = isCurrentMainImage;
  const isGapRef = useRef(isGap);
  isGapRef.current = isGap;
  const currentTimeMsRef = useRef(currentTimeMs);
  currentTimeMsRef.current = currentTimeMs;
  const currentClipIndexRef = useRef(currentClipIndex);
  currentClipIndexRef.current = currentClipIndex;
  const clipLocalTimeMsRef = useRef(clipLocalTimeMs);
  clipLocalTimeMsRef.current = clipLocalTimeMs;
  const mainClipsRef = useRef(mainClips);
  mainClipsRef.current = mainClips;
  const allClipsRef = useRef(project.clips);
  allClipsRef.current = project.clips;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const lastEmittedTimeMsRef = useRef<number>(currentTimeMs);

  const nextClip = useMemo(() => mainClips[currentClipIndex + 1], [mainClips, currentClipIndex]);
  const nextSource = useMemo(() => {
    if (!nextClip) return undefined;
    return sources.find((s) => s.id === nextClip.sourceId);
  }, [nextClip, sources]);
  const isNextMainImage = isImageSource(nextSource);

  // Trigger proxy generation for current & next V1 sources
  const currentSourceId = currentSource?.id;
  const currentSourceProbe = currentSource?.probe;
  const currentHasCachedProxy = Boolean(
    currentSource &&
      (isCurrentMainImage
        ? currentSource.imagePreviewPath
        : getCachedProxyPath(currentSource, previewQuality))
  );
  const nextSourceId = nextSource?.id;
  const nextSourceProbe = nextSource?.probe;
  const nextHasCachedProxy = Boolean(
    nextSource &&
      (isNextMainImage
        ? nextSource.imagePreviewPath
        : getCachedProxyPath(nextSource, previewQuality))
  );

  useEffect(() => {
    if (currentSource) {
      void ensureProxy(currentSource, previewQuality);
    }
    if (nextSource) {
      void ensureProxy(nextSource, previewQuality);
    }
  }, [
    currentSourceId,
    currentSourceProbe,
    currentHasCachedProxy,
    nextSourceId,
    nextSourceProbe,
    nextHasCachedProxy,
    previewQuality,
  ]);

  const currentMediaPath = useMemo(() => {
    if (!currentSource) return '';
    return resolvePreviewFilePath(currentSource, previewQuality);
  }, [currentSource, previewQuality]);

  const currentMediaUrl = useMemo(() => {
    if (!currentMediaPath) return '';
    return safeConvertFileSrc(currentMediaPath);
  }, [currentMediaPath]);

  const currentVideoSrc = isCurrentMainImage ? '' : currentMediaUrl;

  const nextVideoSrc = useMemo(() => {
    if (!nextSource || isNextMainImage) return '';
    const filePath = resolvePreviewFilePath(nextSource, previewQuality);
    return safeConvertFileSrc(filePath);
  }, [nextSource, isNextMainImage, previewQuality]);

  // Sync active <video> src for V1 video clips
  useEffect(() => {
    const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
    if (!activeEl) return;

    if (currentVideoSrc) {
      if (activeEl.getAttribute('data-raw-src') !== currentVideoSrc) {
        activeEl.src = currentVideoSrc;
        activeEl.setAttribute('data-raw-src', currentVideoSrc);
        activeEl.load();
        const targetSec = clipLocalTimeMsRef.current / 1000;
        if (targetSec > 0) {
          activeEl.currentTime = targetSec;
        }
        if (bgVideoRef.current) {
          bgVideoRef.current.currentTime = targetSec;
        }
        if (isPlayingRef.current && !isGapRef.current && !isCurrentMainImageRef.current) {
          activeEl.play().catch((err) => console.error('Active play error after src change:', err));
        }
      }
    } else if (mainClips.length === 0 || isCurrentMainImage) {
      for (const el of [videoARef.current, videoBRef.current]) {
        if (el && !el.paused) {
          el.pause();
        }
        if (mainClips.length === 0 && el && (el.hasAttribute('src') || el.hasAttribute('data-raw-src'))) {
          el.removeAttribute('src');
          el.removeAttribute('data-raw-src');
          el.load();
        }
      }
    }
  }, [activeSlot, currentVideoSrc, mainClips.length, isCurrentMainImage]);

  // Preload next V1 video clip in passive element
  useEffect(() => {
    const passiveEl = activeSlot === 'A' ? videoBRef.current : videoARef.current;
    if (!passiveEl) return;

    if (nextVideoSrc && nextClip) {
      if (passiveEl.getAttribute('data-raw-src') !== nextVideoSrc) {
        passiveEl.src = nextVideoSrc;
        passiveEl.setAttribute('data-raw-src', nextVideoSrc);
        passiveEl.load();
        passiveEl.currentTime = nextClip.inMs / 1000;
        passiveEl.pause();
      }
    } else if (passiveEl.hasAttribute('src') || passiveEl.hasAttribute('data-raw-src')) {
      passiveEl.pause();
      passiveEl.removeAttribute('src');
      passiveEl.removeAttribute('data-raw-src');
      passiveEl.load();
    }
  }, [activeSlot, nextVideoSrc, nextClip?.id, nextClip?.inMs]);

  const isAudioMuted = isMuted || project.audio.muted;

  // Sync V1 video play/pause & volume
  useEffect(() => {
    const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
    if (!activeEl) return;
    const totalDb = project.audio.volumeDb + (currentClip?.volumeDb || 0);
    const gainLinear = Math.pow(10, totalDb / 20);
    activeEl.muted = isAudioMuted;
    activeEl.volume = Math.max(0, Math.min(1, volume * gainLinear));

    if (isPlaying && !isGap && !isCurrentMainImage && currentVideoSrc) {
      activeEl.play().catch((err) => {
        console.error('Video play error:', err);
        pause();
      });
      bgVideoRef.current?.play().catch(() => {});
    } else {
      activeEl.pause();
      bgVideoRef.current?.pause();
    }
  }, [
    activeSlot,
    currentVideoSrc,
    isPlaying,
    isGap,
    isCurrentMainImage,
    isAudioMuted,
    volume,
    project.audio.volumeDb,
    currentClip?.volumeDb,
    pause,
  ]);

  // Set V1 video playbackRate
  useEffect(() => {
    const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
    if (activeEl && currentClip && !isCurrentMainImage) {
      const targetRate = Math.max(0.0625, Math.min(16, currentClip.speed || 1.0));
      if (Math.abs(activeEl.playbackRate - targetRate) > 0.001) {
        try {
          activeEl.playbackRate = targetRate;
        } catch (e) {
          console.warn('Could not set playbackRate:', e);
        }
      }
    }
  }, [activeSlot, currentVideoSrc, currentClip?.id, currentClip?.speed, isCurrentMainImage]);

  // Seeking sync when paused
  useEffect(() => {
    const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
    if (!activeEl || isPlaying || !currentVideoSrc || isCurrentMainImage) return;
    if (activeEl.readyState < 1) return;
    const targetSec = clipLocalTimeMs / 1000;
    if (Math.abs(activeEl.currentTime - targetSec) > 0.03) {
      activeEl.currentTime = targetSec;
      if (bgVideoRef.current && bgVideoRef.current.readyState >= 1) {
        bgVideoRef.current.currentTime = targetSec;
      }
    }
  }, [activeSlot, currentVideoSrc, clipLocalTimeMs, isPlaying, isCurrentMainImage]);

  // External seek during playback
  useEffect(() => {
    const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
    if (!activeEl || !isPlaying || !currentVideoSrc || isCurrentMainImage) return;
    const diff = Math.abs(currentTimeMs - lastEmittedTimeMsRef.current);
    if (diff > 400) {
      const targetSec = clipLocalTimeMs / 1000;
      activeEl.currentTime = targetSec;
      lastEmittedTimeMsRef.current = currentTimeMs;
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = targetSec;
      }
    }
  }, [activeSlot, currentVideoSrc, currentTimeMs, clipLocalTimeMs, isPlaying, isCurrentMainImage]);

  // Smooth 60fps Multi-Track Playback Engine (supports V1 videos, V1 images, gaps, and overlays past V1)
  useEffect(() => {
    if (!isPlaying) return;

    let animFrameId: number;
    let isSubscribed = true;
    let lastTickTime = performance.now();

    const onTick = () => {
      if (!isSubscribed) return;

      const activeEl = activeSlot === 'A' ? videoARef.current : videoBRef.current;
      const passiveEl = activeSlot === 'A' ? videoBRef.current : videoARef.current;

      const now = performance.now();
      const deltaMs = now - lastTickTime;
      lastTickTime = now;

      const allClips = allClipsRef.current;
      const v1Clips = mainClipsRef.current;
      const totalDuration = getTimelineTotalDurationMs(allClips);

      // Clock-driven mode: when in a V1 gap OR playing a still image on V1 (or overlay-only timeline)
      if (isGapRef.current || !currentClipRef.current || isCurrentMainImageRef.current) {
        if (activeEl && !activeEl.paused) {
          activeEl.pause();
        }
        const currTime = currentTimeMsRef.current;
        const nextTime = currTime + deltaMs;

        if (totalDuration > 0 && nextTime >= totalDuration) {
          if (usePlayerStore.getState().isLooping) {
            lastEmittedTimeMsRef.current = 0;
            seek(0);
          } else {
            pause();
            seek(0);
            return;
          }
        } else {
          // Check if nextTime enters a V1 video clip
          const matchingClip = v1Clips.find((c) => {
            const dur = getClipDurationMs(c);
            const cStart = getClipStartMs(c, allClips);
            return nextTime >= cStart && nextTime < cStart + dur;
          });

          if (matchingClip && activeEl) {
            const matchSrc = sourcesRef.current.find((s) => s.id === matchingClip.sourceId);
            if (!isImageSource(matchSrc)) {
              const cSpeed = matchingClip.speed && matchingClip.speed > 0 ? matchingClip.speed : 1.0;
              const localOffset = nextTime - getClipStartMs(matchingClip, allClips);
              const targetSec = (matchingClip.inMs + localOffset * cSpeed) / 1000;
              activeEl.currentTime = targetSec;
              activeEl.play().catch(() => {});
            }
          }

          lastEmittedTimeMsRef.current = nextTime;
          seek(nextTime);
        }

        animFrameId = requestAnimationFrame(onTick);
        return;
      }

      // Video-clock-driven mode: inside a V1 video clip
      const currClip = currentClipRef.current;
      if (!currClip || !activeEl) {
        animFrameId = requestAnimationFrame(onTick);
        return;
      }

      const vidTimeMs = activeEl.currentTime * 1000;
      const speed = currClip.speed && currClip.speed > 0 ? currClip.speed : 1.0;
      const clipStart = getClipStartMs(currClip, allClips);
      const currentClipDur = getClipDurationMs(currClip);
      const currentClipEnd = clipStart + currentClipDur;
      const newGlobalTime =
        clipStart + Math.max(0, Math.round((vidTimeMs - currClip.inMs) / speed));

      if (vidTimeMs >= currClip.outMs || activeEl.ended || newGlobalTime >= currentClipEnd) {
        const nextIdx = currentClipIndexRef.current + 1;
        const nextV1 = v1Clips[nextIdx];

        if (nextV1) {
          const nextStart = getClipStartMs(nextV1, allClips);
          const nextSrc = sourcesRef.current.find((s) => s.id === nextV1.sourceId);
          if (nextStart <= currentClipEnd && passiveEl && !isImageSource(nextSrc)) {
            passiveEl.play().catch((err) => console.error('Passive play error:', err));
            setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'));
            lastEmittedTimeMsRef.current = nextStart;
            seek(nextStart);
            return;
          }
          activeEl.pause();
          lastEmittedTimeMsRef.current = currentClipEnd;
          seek(currentClipEnd);
          animFrameId = requestAnimationFrame(onTick);
          return;
        }

        // If overlay tracks extend past the end of V1, keep advancing through the tail!
        if (currentClipEnd < totalDuration) {
          activeEl.pause();
          lastEmittedTimeMsRef.current = currentClipEnd;
          seek(currentClipEnd);
          animFrameId = requestAnimationFrame(onTick);
          return;
        }

        if (usePlayerStore.getState().isLooping) {
          activeEl.pause();
          lastEmittedTimeMsRef.current = 0;
          seek(0);
        } else {
          pause();
          seek(0);
          return;
        }
      }

      lastEmittedTimeMsRef.current = newGlobalTime;
      seek(newGlobalTime);

      if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - activeEl.currentTime) > 0.15) {
        bgVideoRef.current.currentTime = activeEl.currentTime;
      }

      animFrameId = requestAnimationFrame(onTick);
    };

    animFrameId = requestAnimationFrame(onTick);
    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animFrameId);
    };
  }, [activeSlot, isPlaying, seek, pause]);

  const handleVideoLoadedMetadata = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    if (slot !== activeSlot) return;

    if (
      currentSource &&
      !isCurrentMainImage &&
      currentSource.probe.video &&
      videoEl.videoWidth === 0 &&
      videoEl.videoHeight === 0
    ) {
      const resolvedPath = resolvePreviewFilePath(currentSource, previewQuality);
      if (resolvedPath !== currentSource.path) {
        void recoverBrokenProxy(currentSource, previewQuality, resolvedPath);
      } else {
        void ensureProxy(currentSource, previewQuality, { forceCodecFallback: true });
      }
    }

    const targetSec = clipLocalTimeMsRef.current / 1000;
    videoEl.currentTime = targetSec;
    const speed = currentClipRef.current?.speed || 1.0;
    const clampedRate = Math.max(0.0625, Math.min(16, speed));
    try {
      videoEl.playbackRate = clampedRate;
    } catch {
      // ignore unsupported rate
    }
    const totalDb = project.audio.volumeDb + (currentClipRef.current?.volumeDb || 0);
    const gainLinear = Math.pow(10, totalDb / 20);
    videoEl.muted = isAudioMuted;
    videoEl.volume = Math.max(0, Math.min(1, volume * gainLinear));
    if (isPlayingRef.current && !isGapRef.current && !isCurrentMainImageRef.current) {
      videoEl.play().catch(() => {});
    }
  };

  const handleVideoError = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    const rawSrc = videoEl.getAttribute('data-raw-src');
    if (!rawSrc) return;

    console.error(`Video ${slot} load error:`, videoEl.error?.message, videoEl.error?.code, rawSrc);

    if (slot === activeSlot && currentSource && !isCurrentMainImage) {
      const resolvedPath = resolvePreviewFilePath(currentSource, previewQuality);
      if (resolvedPath !== currentSource.path) {
        void recoverBrokenProxy(currentSource, previewQuality, resolvedPath);
      } else if (currentSource.probe.video) {
        void ensureProxy(currentSource, previewQuality, { forceCodecFallback: true });
      }
    }
  };

  // Reference source dimensions for canvas ratio (fall back to first video/image source if V1 is currently in a gap)
  const canvasRefSource =
    currentSource ||
    sources.find((s) => s.id === mainClips[0]?.sourceId) ||
    sources.find((s) => s.probe.video) ||
    sources[0];

  const srcW = canvasRefSource?.probe.video?.width || 1920;
  const srcH = canvasRefSource?.probe.video?.height || 1080;

  const targetRatio = useMemo(() => {
    if (showOriginalAspect) {
      return srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
    }
    return resolveAspectRatio(project.aspect, srcW, srcH);
  }, [showOriginalAspect, project.aspect, srcW, srcH]);

  const viewportDims = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { width: '92%', height: 'auto' };
    }
    const maxW = containerSize.width * 0.94;
    const maxH = containerSize.height * 0.94;
    const containerRatio = maxW / maxH;

    if (containerRatio > targetRatio) {
      const h = maxH;
      const w = h * targetRatio;
      return { width: `${Math.round(w)}px`, height: `${Math.round(h)}px` };
    } else {
      const w = maxW;
      const h = w / targetRatio;
      return { width: `${Math.round(w)}px`, height: `${Math.round(h)}px` };
    }
  }, [containerSize, targetRatio]);

  const containerW = parseInt(viewportDims.width, 10) || 800;
  const containerH = parseInt(viewportDims.height, 10) || 450;

  const mainSrcW = currentSource?.probe.video?.width || srcW;
  const mainSrcH = currentSource?.probe.video?.height || srcH;

  const fitBounds = useMemo(() => {
    if (containerW <= 0 || containerH <= 0 || mainSrcW <= 0 || mainSrcH <= 0) {
      return { left: 0, top: 0, width: containerW, height: containerH };
    }
    const canvasRatio = containerW / containerH;
    const crop = project.crop;
    const isCropped =
      project.fitMode === 'crop' &&
      !isCropEditing &&
      crop &&
      crop.width > 0 &&
      crop.height > 0 &&
      (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0);
    const effectiveW = isCropped ? mainSrcW * crop.width : mainSrcW;
    const effectiveH = isCropped ? mainSrcH * crop.height : mainSrcH;
    const videoRatio = effectiveW > 0 && effectiveH > 0 ? effectiveW / effectiveH : mainSrcW / mainSrcH;

    if (videoRatio > canvasRatio) {
      const w = containerW;
      const h = Math.max(1, Math.round(containerW / videoRatio));
      return { left: 0, top: Math.round((containerH - h) / 2), width: w, height: h };
    } else {
      const h = containerH;
      const w = Math.max(1, Math.round(containerH * videoRatio));
      return { left: Math.round((containerW - w) / 2), top: 0, width: w, height: h };
    }
  }, [containerW, containerH, mainSrcW, mainSrcH, project.fitMode, project.crop, isCropEditing]);

  const defaultBounds = useMemo<NormalizedBounds>(() => {
    if (showOriginalAspect || project.fitMode === 'stretch') {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    if (containerW <= 0 || containerH <= 0) return { x: 0, y: 0, width: 1, height: 1 };
    return {
      x: fitBounds.left / containerW,
      y: fitBounds.top / containerH,
      width: fitBounds.width / containerW,
      height: fitBounds.height / containerH,
    };
  }, [showOriginalAspect, project.fitMode, containerW, containerH, fitBounds]);

  const activeCustomBounds =
    !showOriginalAspect && project.fitMode === 'fit'
      ? project.fitBounds
      : !showOriginalAspect && project.fitMode === 'stretch'
        ? project.stretchBounds
        : null;

  const activeBounds = activeCustomBounds || defaultBounds;

  const pixelBounds = useMemo(
    () => ({
      left: Math.round(activeBounds.x * containerW),
      top: Math.round(activeBounds.y * containerH),
      width: Math.max(1, Math.round(activeBounds.width * containerW)),
      height: Math.max(1, Math.round(activeBounds.height * containerH)),
    }),
    [activeBounds, containerW, containerH]
  );

  const hasLetterbox = useMemo(() => {
    const crop = project.crop;
    const isCropped =
      project.fitMode === 'crop' &&
      !isCropEditing &&
      crop &&
      crop.width > 0 &&
      crop.height > 0 &&
      (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0);
    const effectiveW = isCropped ? mainSrcW * crop.width : mainSrcW;
    const effectiveH = isCropped ? mainSrcH * crop.height : mainSrcH;
    const effectiveVideoRatio =
      effectiveW > 0 && effectiveH > 0 ? effectiveW / effectiveH : mainSrcW / mainSrcH;
    return (
      Math.abs(targetRatio - effectiveVideoRatio) > 0.02 ||
      (activeCustomBounds != null &&
        (activeCustomBounds.width < 0.98 || activeCustomBounds.height < 0.98))
    );
  }, [targetRatio, mainSrcW, mainSrcH, project.fitMode, project.crop, isCropEditing, activeCustomBounds]);

  const geometry = useMemo(() => {
    return computeGeometry(
      mainSrcW,
      mainSrcH,
      showOriginalAspect ? { id: 'original' } : project.aspect,
      showOriginalAspect ? 'fit' : project.fitMode,
      project.crop,
      project.output.resolutionMode,
      activeCustomBounds
    );
  }, [
    mainSrcW,
    mainSrcH,
    showOriginalAspect,
    project.aspect,
    project.fitMode,
    project.crop,
    project.output.resolutionMode,
    activeCustomBounds,
  ]);

  const innerVideoBounds = useMemo(() => {
    if (showOriginalAspect || isCropEditing || project.fitMode !== 'crop') {
      return { left: 0, top: 0, width: pixelBounds.width, height: pixelBounds.height };
    }
    const crop = project.crop;
    const hasCrop =
      crop &&
      crop.width > 0 &&
      crop.height > 0 &&
      (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0);

    if (!hasCrop) {
      return { left: 0, top: 0, width: pixelBounds.width, height: pixelBounds.height };
    }

    const videoWidth = Math.max(1, Math.round(pixelBounds.width / crop.width));
    const videoHeight = Math.max(1, Math.round(pixelBounds.height / crop.height));
    const videoLeft = Math.round(-crop.x * videoWidth);
    const videoTop = Math.round(-crop.y * videoHeight);
    return { left: videoLeft, top: videoTop, width: videoWidth, height: videoHeight };
  }, [showOriginalAspect, isCropEditing, project.fitMode, project.crop, pixelBounds]);

  const cssTransform = useMemo(() => {
    return buildCssTransform(
      currentClip?.rotate || 0,
      currentClip?.flipH || false,
      currentClip?.flipV || false
    );
  }, [currentClip?.rotate, currentClip?.flipH, currentClip?.flipV]);

  const currentClipSharpness = Math.max(0, Math.min(1, currentClip?.sharpness ?? 0));
  const sharpenKernel = useMemo(() => {
    if (currentClipSharpness <= 0.001) return null;
    const k = Number((currentClipSharpness * 0.65).toFixed(4));
    const center = Number((1 + 4 * k).toFixed(4));
    return `0 ${-k} 0 ${-k} ${center} ${-k} 0 ${-k} 0`;
  }, [currentClipSharpness]);
  const videoFilterCss = sharpenKernel ? 'url(#megu-video-sharpen)' : undefined;

  const isProxyGenerating = currentSource
    ? proxyStatus[proxyStatusKey(currentSource.id, previewQuality)] === 'generating'
    : false;
  const isMainSelected = !!activeClipId && currentClip?.id === activeClipId;

  // Check if the currently selected clip is one of the visible overlay clips
  const activeOverlayEntry = useMemo(
    () => visibleOverlays.find((ov) => ov.clip.id === activeClipId) || null,
    [visibleOverlays, activeClipId]
  );

  const activeOverlayNormBounds = useMemo(() => {
    if (!activeOverlayEntry) return null;
    if (activeOverlayEntry.clip.overlayBounds) return activeOverlayEntry.clip.overlayBounds;
    return computeDefaultOverlayBounds(
      activeOverlayEntry.source.probe.video?.width || 640,
      activeOverlayEntry.source.probe.video?.height || 360,
      containerW || 1920,
      containerH || 1080,
      activeOverlayEntry.clip.rotate,
      0.6
    );
  }, [activeOverlayEntry, containerW, containerH]);

  const activeOverlayPx = useMemo(() => {
    if (!activeOverlayNormBounds) return null;
    return {
      left: Math.round(activeOverlayNormBounds.x * containerW),
      top: Math.round(activeOverlayNormBounds.y * containerH),
      width: Math.max(2, Math.round(activeOverlayNormBounds.width * containerW)),
      height: Math.max(2, Math.round(activeOverlayNormBounds.height * containerH)),
    };
  }, [activeOverlayNormBounds, containerW, containerH]);

  // Drag & Drop directly onto Preview Canvas -> adds as Overlay above main track at playhead!
  const handlePreviewDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setIsViewportDragOver(true);
  };

  const handlePreviewDragLeave = (e: React.DragEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsViewportDragOver(false);
    }
  };

  const handlePreviewDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsViewportDragOver(false);

    const sourceId = e.dataTransfer.getData('megu/source-id') || getDraggingSourceId();
    setDraggingSourceId(null);

    if (sourceId) {
      addClipFromSource(sourceId, {
        atTimeMs: project.clips.length > 0 ? currentTimeMs : 0,
        asOverlay: project.clips.length > 0,
      });
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path || '')
        .filter(Boolean);
      if (paths.length > 0) {
        if (project.clips.length > 0) {
          await addFilesAsOverlay(paths, currentTimeMs, 1);
        } else {
          await addFiles(paths);
        }
      }
    }
  };

  return (
    <div
      ref={containerRef}
      data-drop-zone="preview"
      className={`preview-area ${isFullscreen ? 'preview-fullscreen' : ''}`}
      onDragOver={handlePreviewDragOver}
      onDragLeave={handlePreviewDragLeave}
      onDrop={handlePreviewDrop}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        minHeight: '260px',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-inset)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onClick={(e) => {
        if (!viewportRef.current || !viewportRef.current.contains(e.target as Node)) {
          if (project.fitMode !== 'crop') {
            setActiveClipId(null);
            setCropEditing(false);
          }
        }
      }}
    >
      {/* Hidden SVG GPU Filter for Main Track Preview Sharpening */}
      {sharpenKernel && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
        >
          <defs>
            <filter id="megu-video-sharpen" colorInterpolationFilters="sRGB">
              <feConvolveMatrix
                order="3"
                kernelMatrix={sharpenKernel}
                preserveAlpha="true"
                edgeMode="duplicate"
              />
            </filter>
          </defs>
        </svg>
      )}

      {/* Proxy Preparation Indicator */}
      {isProxyGenerating && (
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '6px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-full)',
            boxShadow: 'var(--shadow-2)',
            fontSize: 'var(--text-12)',
            fontWeight: 500,
            color: 'var(--accent)',
          }}
        >
          <SparkleIcon size={16} />
          <span>
            {t('common.preparing_proxy')} (
            {previewQuality === 'original' ? t('player.quality_original') : previewQuality})
          </span>
        </div>
      )}

      {/* Blurred background ONLY when letterboxing exists on V1 and blur mode is active */}
      {!showOriginalAspect &&
        !isGap &&
        project.fitMode === 'fit' &&
        project.padding.mode === 'blur' &&
        hasLetterbox && (
          <div
            style={{
              position: 'absolute',
              inset: '-20px',
              zIndex: 1,
              overflow: 'hidden',
              filter: `blur(${project.padding.blurStrength}px) brightness(0.65)`,
              transform: 'scale(1.15)',
              pointerEvents: 'none',
            }}
          >
            {isCurrentMainImage ? (
              <img
                src={currentMediaUrl || undefined}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <video
                ref={bgVideoRef}
                src={currentVideoSrc || undefined}
                preload="auto"
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>
        )}

      {/* Aspect Ratio Bounding Viewport */}
      <div
        ref={viewportRef}
        className="preview-viewport"
        data-target-w={geometry.targetWidth}
        data-target-h={geometry.targetHeight}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const isInsideCrop = !!target.closest('.crop-overlay-root');
          const isInsideClickTarget = !!target.closest('.video-click-target');
          if (!isInsideCrop && !isInsideClickTarget) {
            if (project.fitMode !== 'crop') {
              setActiveClipId(null);
              setCropEditing(false);
            }
          }
        }}
        style={{
          position: 'relative',
          zIndex: 2,
          width: viewportDims.width,
          height: viewportDims.height,
          aspectRatio: `${targetRatio}`,
          maxWidth: '94%',
          maxHeight: '94%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: project.padding.mode === 'color' ? project.padding.color || '#000000' : '#000000',
          boxShadow: isViewportDragOver
            ? '0 0 0 2px var(--accent), 0 8px 32px rgba(0,0,0,0.6)'
            : '0 8px 32px rgba(0,0,0,0.5)',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          transition: isResizingCrop
            ? 'none'
            : 'width var(--dur-fast) var(--ease-out), height var(--dur-fast) var(--ease-out)',
        }}
      >
        {/* Main Track (V1) Video & Still Image Container */}
        <div
          className="video-bounds-container"
          style={{
            position: 'absolute',
            left: `${pixelBounds.left}px`,
            top: `${pixelBounds.top}px`,
            width: `${pixelBounds.width}px`,
            height: `${pixelBounds.height}px`,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          {/* Video Element A */}
          <video
            ref={videoARef}
            preload="auto"
            playsInline
            onLoadedMetadata={(e) => handleVideoLoadedMetadata('A', e)}
            onError={(e) => handleVideoError('A', e)}
            style={{
              position: 'absolute',
              left: `${innerVideoBounds.left}px`,
              top: `${innerVideoBounds.top}px`,
              width: `${innerVideoBounds.width}px`,
              height: `${innerVideoBounds.height}px`,
              objectFit: 'fill',
              objectPosition: 'center',
              transform: cssTransform,
              filter: videoFilterCss,
              opacity: !isGap && !isCurrentMainImage && activeSlot === 'A' ? 1 : 0,
              transition: isResizingCrop ? 'none' : 'opacity var(--dur-fast) var(--ease-out)',
              pointerEvents: 'none',
            }}
          />

          {/* Video Element B */}
          <video
            ref={videoBRef}
            preload="auto"
            playsInline
            onLoadedMetadata={(e) => handleVideoLoadedMetadata('B', e)}
            onError={(e) => handleVideoError('B', e)}
            style={{
              position: 'absolute',
              left: `${innerVideoBounds.left}px`,
              top: `${innerVideoBounds.top}px`,
              width: `${innerVideoBounds.width}px`,
              height: `${innerVideoBounds.height}px`,
              objectFit: 'fill',
              objectPosition: 'center',
              transform: cssTransform,
              filter: videoFilterCss,
              opacity: !isGap && !isCurrentMainImage && activeSlot === 'B' ? 1 : 0,
              transition: isResizingCrop ? 'none' : 'opacity var(--dur-fast) var(--ease-out)',
              pointerEvents: 'none',
            }}
          />

          {/* Main Track Still Image (when a photo is placed on V1) */}
          {!isGap && isCurrentMainImage && currentMediaUrl && (
            <img
              src={currentMediaUrl}
              alt={currentSource?.filename || ''}
              draggable={false}
              onError={() => {
                if (currentSource) {
                  void recoverBrokenProxy(currentSource, previewQuality, currentMediaPath);
                }
              }}
              style={{
                position: 'absolute',
                left: `${innerVideoBounds.left}px`,
                top: `${innerVideoBounds.top}px`,
                width: `${innerVideoBounds.width}px`,
                height: `${innerVideoBounds.height}px`,
                objectFit: 'fill',
                objectPosition: 'center',
                transform: cssTransform,
                filter: videoFilterCss,
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* Click-to-select Main Track V1 area */}
        {(!isMainSelected || (project.fitMode === 'crop' && !isCropEditing)) &&
          currentClip &&
          !isGap && (
            <div
              className="video-click-target"
              onClick={(e) => {
                e.stopPropagation();
                setActiveClipId(currentClip.id);
                if (project.fitMode === 'crop') {
                  setCropEditing(true);
                }
              }}
              title={
                project.fitMode === 'crop'
                  ? t('transform.edit_crop')
                  : t('editor.select_clip')
              }
              style={{
                position: 'absolute',
                left: `${pixelBounds.left}px`,
                top: `${pixelBounds.top}px`,
                width: `${pixelBounds.width}px`,
                height: `${pixelBounds.height}px`,
                zIndex: 4,
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            />
          )}

        {/* Stacked Overlay Tracks (V2, V3, ...) rendered ON TOP of Main Track V1 */}
        {visibleOverlays.map((ov) => (
          <OverlayLayerItem
            key={ov.clip.id}
            clip={ov.clip}
            source={ov.source}
            localTimeMs={ov.localTimeMs}
            isPlaying={isPlaying}
            isAudioMuted={isAudioMuted}
            masterVolume={volume}
            projectVolumeDb={project.audio.volumeDb}
            previewQuality={previewQuality}
            containerW={containerW}
            containerH={containerH}
            zIndex={5 + ov.trackIndex}
            isSelected={ov.clip.id === activeClipId}
            onSelect={(id) => {
              setCropEditing(false);
              setActiveClipId(id);
            }}
          />
        ))}

        {/* Interactive Transform/Crop Overlay for Main Track V1 */}
        {!showOriginalAspect &&
          !isGap &&
          !activeOverlayEntry &&
          (project.fitMode === 'crop' || isMainSelected) && (
            <div
              className="crop-overlay-root"
              style={{
                position: 'absolute',
                left: `${pixelBounds.left}px`,
                top: `${pixelBounds.top}px`,
                width: `${pixelBounds.width}px`,
                height: `${pixelBounds.height}px`,
                zIndex: 20,
                pointerEvents: 'none',
              }}
            >
              <CropOverlay
                width={pixelBounds.width}
                height={pixelBounds.height}
                canvasWidth={containerW}
                canvasHeight={containerH}
                normalizedBounds={activeBounds}
                sourceWidth={mainSrcW}
                sourceHeight={mainSrcH}
                onResizeChange={setIsResizingCrop}
                onBoundsChange={(bounds) => {
                  if (project.fitMode === 'fit') {
                    setFitBounds(bounds);
                  } else if (project.fitMode === 'stretch') {
                    setStretchBounds(bounds);
                  }
                }}
              />
            </div>
          )}

        {/* Interactive Move/Resize/Rotate Handles for Active Overlay Clip (V2+) */}
        {!showOriginalAspect && activeOverlayEntry && activeOverlayPx && activeOverlayNormBounds && (
          <div
            className="crop-overlay-root"
            style={{
              position: 'absolute',
              left: `${activeOverlayPx.left}px`,
              top: `${activeOverlayPx.top}px`,
              width: `${activeOverlayPx.width}px`,
              height: `${activeOverlayPx.height}px`,
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            <CropOverlay
              width={activeOverlayPx.width}
              height={activeOverlayPx.height}
              canvasWidth={containerW}
              canvasHeight={containerH}
              normalizedBounds={activeOverlayNormBounds}
              sourceWidth={activeOverlayEntry.source.probe.video?.width || 640}
              sourceHeight={activeOverlayEntry.source.probe.video?.height || 360}
              isOverlayMode
              onResizeChange={setIsResizingCrop}
              onBoundsChange={(bounds) => {
                setClipOverlayBounds(activeOverlayEntry.clip.id, bounds, false);
              }}
            />
          </div>
        )}

        {/* Drag-to-Overlay Hint on Preview Canvas */}
        {isViewportDragOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(235, 94, 40, 0.14)',
              border: '2px dashed var(--accent)',
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent)',
                padding: '6px 14px',
                borderRadius: 'var(--r-full)',
                color: 'var(--accent)',
                fontSize: 'var(--text-12)',
                fontWeight: 600,
                boxShadow: 'var(--shadow-2)',
              }}
            >
              <LayersIcon size={15} />
              <span>
                {project.clips.length > 0
                  ? t('player.drop_as_overlay')
                  : t('media_library.drop_hint')}
              </span>
            </div>
          </div>
        )}

        {/* Empty Canvas Hint */}
        {project.clips.length === 0 && !isViewportDragOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            <FilmIcon size={36} opacity={0.35} />
            <span
              style={{
                fontSize: 'var(--text-13)',
                opacity: 0.6,
                fontWeight: 500,
                letterSpacing: '0.01em',
              }}
            >
              {t('player.empty_canvas_hint')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
