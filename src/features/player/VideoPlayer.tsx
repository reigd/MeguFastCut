import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
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
import {
  MainClipTiming,
  computeMainTrackTiming,
  computeTransitionPreviewLayers,
  isActiveTransition,
} from '../../shared/transitions';
import { getDraggingSourceId, setDraggingSourceId } from '../../shared/drag-state';
import { Clip, PreviewQuality, SourceFile } from '../../shared/types';
import { CropOverlay, NormalizedBounds } from '../transform/CropOverlay';
import { VideoFrameOverlays, VideoSvgFilterDefs } from '../video/VideoFilterDefs';
import {
  DEFAULT_VIDEO_ADJUSTMENTS,
  computePreviewFilterSpec,
  hasActiveVideoAdjustments,
  resolveClipVideoAdjustments,
} from '../../shared/video-fx';
import { t } from '../../shared/i18n';
import { SparkleIcon, FilmIcon, LayersIcon, CompareSplitIcon } from '../../components/icons';

interface OverlayLayerItemProps {
  clip: Clip;
  source: SourceFile;
  localTimeMs: number;
  clipDurationMs: number;
  timelineOffsetMs: number;
  isPlaying: boolean;
  isAudioMuted: boolean;
  masterVolume: number;
  projectVolumeDb: number;
  previewQuality: PreviewQuality;
  containerW: number;
  containerH: number;
  zIndex: number;
  isSelected: boolean;
  bypassVideoFx: boolean;
  onSelect: (clipId: string) => void;
}

const OverlayLayerItem: React.FC<OverlayLayerItemProps> = ({
  clip,
  source,
  localTimeMs,
  clipDurationMs,
  timelineOffsetMs,
  isPlaying,
  isAudioMuted,
  masterVolume,
  projectVolumeDb,
  previewQuality,
  containerW,
  containerH,
  zIndex,
  isSelected,
  bypassVideoFx,
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

  const overlayFadeGain = useMemo(() => {
    let gain = 1;
    if (isActiveTransition(clip.transitionIn)) {
      const dur = Math.min(clip.transitionIn.durationMs, Math.max(0, clipDurationMs - 40));
      if (dur > 0 && timelineOffsetMs < dur) {
        gain = Math.min(gain, Math.max(0, timelineOffsetMs / dur));
      }
    }
    if (isActiveTransition(clip.transitionOut)) {
      const dur = Math.min(clip.transitionOut.durationMs, Math.max(0, clipDurationMs - 40));
      const rem = clipDurationMs - timelineOffsetMs;
      if (dur > 0 && rem < dur) {
        gain = Math.min(gain, Math.max(0, rem / dur));
      }
    }
    return gain;
  }, [clip.transitionIn, clip.transitionOut, clipDurationMs, timelineOffsetMs]);

  // Sync overlay video playback, seeking, rate, and audio gain
  useEffect(() => {
    if (isImage) return;
    const el = videoRef.current;
    if (!el) return;

    const totalDb = projectVolumeDb + (clip.volumeDb || 0);
    const gainLinear = Math.pow(10, totalDb / 20);
    el.muted = isAudioMuted;
    el.volume = Math.max(0, Math.min(1, masterVolume * gainLinear * overlayFadeGain));

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
    overlayFadeGain,
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
  }, [
    clip.overlayBounds,
    clip.rotate,
    source.probe.video?.width,
    source.probe.video?.height,
    containerW,
    containerH,
  ]);

  const boxLeft = Math.round(bounds.x * containerW);
  const boxTop = Math.round(bounds.y * containerH);
  const boxW = Math.max(2, Math.round(bounds.width * containerW));
  const boxH = Math.max(2, Math.round(bounds.height * containerH));

  const isQuarter = clip.rotate === 90 || clip.rotate === 270;
  const innerW = isQuarter ? boxH : boxW;
  const innerH = isQuarter ? boxW : boxH;
  const cssTransform = buildCssTransform(clip.rotate || 0, clip.flipH || false, clip.flipV || false);
  const fullTransform =
    cssTransform === 'none'
      ? 'translate(-50%, -50%)'
      : `translate(-50%, -50%) ${cssTransform}`;

  const filterId = `megu-ov-fx-${clip.id}`;
  const fxSpec = useMemo(() => {
    const adj = bypassVideoFx
      ? DEFAULT_VIDEO_ADJUSTMENTS
      : resolveClipVideoAdjustments(clip);
    return computePreviewFilterSpec(adj, boxW, boxH);
  }, [bypassVideoFx, clip, boxW, boxH]);

  const mediaStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${innerW}px`,
    height: `${innerH}px`,
    transform: fullTransform,
    objectFit: 'fill',
    filter: fxSpec.hasSvgFilter ? `url(#${filterId})` : undefined,
    opacity: fxSpec.opacityFactor,
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
        opacity: overlayFadeGain,
        cursor: isSelected ? 'grab' : 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <VideoSvgFilterDefs filterId={filterId} spec={fxSpec} />

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

      <VideoFrameOverlays spec={fxSpec} />
    </div>
  );
};

interface SlotActiveConfig {
  item: MainClipTiming;
  source?: SourceFile;
  localTimeMs: number;
  mediaPath: string;
  mediaUrl: string;
  videoSrc: string;
  isImage: boolean;
  audioGainMultiplier: number;
  layerStyle: React.CSSProperties;
  zIndex: number;
}

interface SlotPreloadConfig {
  item: MainClipTiming;
  source?: SourceFile;
  videoSrc: string;
}

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
    bypassVideoFx,
    isCropEditing,
    setCropEditing,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

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

  const mainTiming = useMemo(() => computeMainTrackTiming(project.clips), [project.clips]);
  const mainItems = mainTiming.items;
  const totalDurationMs = useMemo(() => getTimelineTotalDurationMs(project.clips), [project.clips]);

  // Resolve active V1 item(s) at currentTimeMs (supports solo playback AND dual-layer junction overlap!)
  const v1FrameState = useMemo(() => {
    const active: MainClipTiming[] = [];
    for (let i = 0; i < mainItems.length; i++) {
      const it = mainItems[i];
      const next = mainItems[i + 1];
      const isAtClipEnd =
        it.durationMs > 0 &&
        currentTimeMs === it.playEndMs &&
        (!next || next.playStartMs > it.playEndMs);
      if (currentTimeMs >= it.playStartMs && (currentTimeMs < it.playEndMs || isAtClipEnd)) {
        active.push(it);
      }
    }

    if (active.length === 0) {
      return {
        isGap: true,
        leader: undefined as MainClipTiming | undefined,
        outgoing: undefined as MainClipTiming | undefined,
        incoming: undefined as MainClipTiming | undefined,
        solo: undefined as MainClipTiming | undefined,
        dipOverlayColor: null as string | null,
        dipOverlayOpacity: 0,
        outStyle: {} as React.CSSProperties,
        inStyle: {} as React.CSSProperties,
        outAudioGain: 1,
        inAudioGain: 1,
      };
    }

    if (active.length >= 2) {
      const outgoing = active[0];
      const incoming = active[active.length - 1];
      const overlap = Math.max(1, incoming.overlapInMs);
      const progress = Math.max(0, Math.min(1, (currentTimeMs - incoming.playStartMs) / overlap));
      const tr = incoming.clip.transitionIn!;
      const layers = computeTransitionPreviewLayers(tr, progress, 'junction');
      return {
        isGap: false,
        leader: incoming,
        outgoing,
        incoming,
        solo: undefined,
        dipOverlayColor: layers.dipOverlayColor,
        dipOverlayOpacity: layers.dipOverlayOpacity,
        outStyle: layers.outStyle,
        inStyle: layers.inStyle,
        outAudioGain: layers.outAudioGain,
        inAudioGain: layers.inAudioGain,
      };
    }

    const solo = active[0];
    if (
      solo.introDurationMs > 0 &&
      isActiveTransition(solo.clip.transitionIn) &&
      currentTimeMs < solo.playStartMs + solo.introDurationMs
    ) {
      const progress = Math.max(
        0,
        Math.min(1, (currentTimeMs - solo.playStartMs) / solo.introDurationMs)
      );
      const layers = computeTransitionPreviewLayers(solo.clip.transitionIn, progress, 'intro');
      return {
        isGap: false,
        leader: solo,
        outgoing: undefined,
        incoming: undefined,
        solo,
        dipOverlayColor: layers.dipOverlayColor,
        dipOverlayOpacity: layers.dipOverlayOpacity,
        outStyle: {} as React.CSSProperties,
        inStyle: layers.inStyle,
        outAudioGain: 0,
        inAudioGain: layers.inAudioGain,
      };
    }

    if (
      solo.outroDurationMs > 0 &&
      isActiveTransition(solo.clip.transitionOut) &&
      currentTimeMs >= solo.playEndMs - solo.outroDurationMs
    ) {
      const outroStart = solo.playEndMs - solo.outroDurationMs;
      const progress = Math.max(0, Math.min(1, (currentTimeMs - outroStart) / solo.outroDurationMs));
      const layers = computeTransitionPreviewLayers(solo.clip.transitionOut, progress, 'outro');
      return {
        isGap: false,
        leader: solo,
        outgoing: undefined,
        incoming: undefined,
        solo,
        dipOverlayColor: layers.dipOverlayColor,
        dipOverlayOpacity: layers.dipOverlayOpacity,
        outStyle: layers.outStyle,
        inStyle: {} as React.CSSProperties,
        outAudioGain: layers.outAudioGain,
        inAudioGain: 0,
      };
    }

    return {
      isGap: false,
      leader: solo,
      outgoing: undefined,
      incoming: undefined,
      solo,
      dipOverlayColor: null,
      dipOverlayOpacity: 0,
      outStyle: {} as React.CSSProperties,
      inStyle: {} as React.CSSProperties,
      outAudioGain: 1,
      inAudioGain: 1,
    };
  }, [mainItems, currentTimeMs]);

  const computeLocalSourceMs = useCallback((item: MainClipTiming, globalMs: number): number => {
    const speed = item.clip.speed && item.clip.speed > 0 ? item.clip.speed : 1.0;
    const progress = Math.max(0, Math.min(item.durationMs, globalMs - item.playStartMs));
    const sourceMs = item.clip.inMs + progress * speed;
    return Math.min(item.clip.outMs, Math.max(item.clip.inMs, sourceMs));
  }, []);

  const buildActiveSlotConfig = useCallback(
    (
      item: MainClipTiming,
      layerStyle: React.CSSProperties,
      audioGainMultiplier: number,
      baseZ: number
    ): SlotActiveConfig => {
      const source = sources.find((s) => s.id === item.clip.sourceId);
      const isImg = isImageSource(source);
      const mediaPath = source ? resolvePreviewFilePath(source, previewQuality) : '';
      const mediaUrl = mediaPath ? safeConvertFileSrc(mediaPath) : '';
      const explicitZ = typeof layerStyle.zIndex === 'number' ? layerStyle.zIndex : 0;
      return {
        item,
        source,
        localTimeMs: computeLocalSourceMs(item, currentTimeMs),
        mediaPath,
        mediaUrl,
        videoSrc: isImg ? '' : mediaUrl,
        isImage: isImg,
        audioGainMultiplier,
        layerStyle,
        zIndex: baseZ + explicitZ,
      };
    },
    [sources, previewQuality, computeLocalSourceMs, currentTimeMs]
  );

  // Assign deterministic slots A (even index) and B (odd index)
  const { slotAConfig, slotBConfig, preloadA, preloadB } = useMemo(() => {
    let cfgA: SlotActiveConfig | null = null;
    let cfgB: SlotActiveConfig | null = null;

    if (v1FrameState.outgoing && v1FrameState.incoming) {
      const outCfg = buildActiveSlotConfig(
        v1FrameState.outgoing,
        v1FrameState.outStyle,
        v1FrameState.outAudioGain,
        2
      );
      const inCfg = buildActiveSlotConfig(
        v1FrameState.incoming,
        v1FrameState.inStyle,
        v1FrameState.inAudioGain,
        3
      );
      if (v1FrameState.outgoing.index % 2 === 0) {
        cfgA = outCfg;
        cfgB = inCfg;
      } else {
        cfgB = outCfg;
        cfgA = inCfg;
      }
    } else if (v1FrameState.solo) {
      const solo = v1FrameState.solo;
      const isOutro =
        solo.outroDurationMs > 0 && currentTimeMs >= solo.playEndMs - solo.outroDurationMs;
      const style = isOutro ? v1FrameState.outStyle : v1FrameState.inStyle;
      const gain = isOutro ? v1FrameState.outAudioGain : v1FrameState.inAudioGain;
      const soloCfg = buildActiveSlotConfig(solo, style, gain, 2);
      if (solo.index % 2 === 0) {
        cfgA = soloCfg;
      } else {
        cfgB = soloCfg;
      }
    }

    // Preload next V1 video clip into whichever slot is currently idle
    let preA: SlotPreloadConfig | null = null;
    let preB: SlotPreloadConfig | null = null;
    const leaderIdx = v1FrameState.leader?.index ?? -1;
    const nextItem =
      leaderIdx >= 0
        ? mainItems[leaderIdx + 1]
        : mainItems.find((it) => it.playStartMs > currentTimeMs);

    if (nextItem) {
      const nextSrc = sources.find((s) => s.id === nextItem.clip.sourceId);
      if (nextSrc && !isImageSource(nextSrc)) {
        const nextUrl = safeConvertFileSrc(resolvePreviewFilePath(nextSrc, previewQuality));
        const pre: SlotPreloadConfig = { item: nextItem, source: nextSrc, videoSrc: nextUrl };
        if (nextItem.index % 2 === 0 && !cfgA) {
          preA = pre;
        } else if (nextItem.index % 2 === 1 && !cfgB) {
          preB = pre;
        }
      }
    }

    return { slotAConfig: cfgA, slotBConfig: cfgB, preloadA: preA, preloadB: preB };
  }, [v1FrameState, mainItems, sources, previewQuality, currentTimeMs, buildActiveSlotConfig]);

  const leaderItem = v1FrameState.leader;
  const currentClip = leaderItem?.clip;
  const currentSource = useMemo(
    () => (currentClip ? sources.find((s) => s.id === currentClip.sourceId) : undefined),
    [currentClip, sources]
  );
  const isCurrentMainImage = isImageSource(currentSource);
  const isGap = v1FrameState.isGap;
  const leaderSlot: 'A' | 'B' = leaderItem && leaderItem.index % 2 === 1 ? 'B' : 'A';
  const currentMediaPath = useMemo(
    () => (currentSource ? resolvePreviewFilePath(currentSource, previewQuality) : ''),
    [currentSource, previewQuality]
  );
  const currentMediaUrl = useMemo(
    () => (currentMediaPath ? safeConvertFileSrc(currentMediaPath) : ''),
    [currentMediaPath]
  );
  const currentVideoSrc = isCurrentMainImage ? '' : currentMediaUrl;

  // Trigger proxy generation for active & upcoming V1 sources
  useEffect(() => {
    const candidates = [
      slotAConfig?.source,
      slotBConfig?.source,
      preloadA?.source,
      preloadB?.source,
    ];
    for (const src of candidates) {
      if (src) {
        void ensureProxy(src, previewQuality);
      }
    }
  }, [
    slotAConfig?.source?.id,
    slotBConfig?.source?.id,
    preloadA?.source?.id,
    preloadB?.source?.id,
    previewQuality,
  ]);

  // Visible overlay clips (V2, V3, ...) sorted bottom-to-top by trackIndex
  const visibleOverlays = useMemo(() => {
    const items: {
      clip: Clip;
      source: SourceFile;
      localTimeMs: number;
      clipDurationMs: number;
      timelineOffsetMs: number;
      trackIndex: number;
    }[] = [];
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
          clipDurationMs: clipDuration,
          timelineOffsetMs: localProgress,
          trackIndex,
        });
      }
    }
    items.sort((a, b) => a.trackIndex - b.trackIndex);
    return items;
  }, [project.clips, sources, currentTimeMs, totalDurationMs]);

  const isAudioMuted = isMuted || project.audio.muted;

  // Refs for 60fps playback loop
  const slotAConfigRef = useRef(slotAConfig);
  slotAConfigRef.current = slotAConfig;
  const slotBConfigRef = useRef(slotBConfig);
  slotBConfigRef.current = slotBConfig;
  const leaderItemRef = useRef(leaderItem);
  leaderItemRef.current = leaderItem;
  const mainItemsRef = useRef(mainItems);
  mainItemsRef.current = mainItems;
  const totalDurationMsRef = useRef(totalDurationMs);
  totalDurationMsRef.current = totalDurationMs;
  const currentTimeMsRef = useRef(currentTimeMs);
  currentTimeMsRef.current = currentTimeMs;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const lastEmittedTimeMsRef = useRef<number>(currentTimeMs);

  // Sync each <video> slot (A & B) with its active config or passive preload
  const syncSlotElement = useCallback(
    (
      el: HTMLVideoElement | null,
      activeCfg: SlotActiveConfig | null,
      preloadCfg: SlotPreloadConfig | null
    ) => {
      if (!el) return;
      const desiredSrc = activeCfg?.videoSrc || preloadCfg?.videoSrc || '';

      if (!desiredSrc) {
        if (!el.paused) el.pause();
        if (el.hasAttribute('src') || el.hasAttribute('data-raw-src')) {
          el.removeAttribute('src');
          el.removeAttribute('data-raw-src');
          el.load();
        }
        return;
      }

      if (el.getAttribute('data-raw-src') !== desiredSrc) {
        el.src = desiredSrc;
        el.setAttribute('data-raw-src', desiredSrc);
        el.load();
        const initSec = activeCfg
          ? activeCfg.localTimeMs / 1000
          : (preloadCfg?.item.clip.inMs ?? 0) / 1000;
        if (initSec > 0) {
          el.currentTime = initSec;
        }
      }

      if (activeCfg) {
        const totalDb = project.audio.volumeDb + (activeCfg.item.clip.volumeDb || 0);
        const gainLinear = Math.pow(10, totalDb / 20);
        el.muted = isAudioMuted;
        el.volume = Math.max(
          0,
          Math.min(1, volume * gainLinear * activeCfg.audioGainMultiplier)
        );

        const targetRate = Math.max(0.0625, Math.min(16, activeCfg.item.clip.speed || 1.0));
        if (Math.abs(el.playbackRate - targetRate) > 0.001) {
          try {
            el.playbackRate = targetRate;
          } catch {
            // ignore unsupported rate
          }
        }

        const targetSec = activeCfg.localTimeMs / 1000;
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
      } else if (preloadCfg) {
        if (!el.paused) el.pause();
        const preSec = preloadCfg.item.clip.inMs / 1000;
        if (el.readyState >= 1 && Math.abs(el.currentTime - preSec) > 0.05) {
          el.currentTime = preSec;
        }
      }
    },
    [isAudioMuted, volume, project.audio.volumeDb, isPlaying]
  );

  useEffect(() => {
    syncSlotElement(videoARef.current, slotAConfig, preloadA);
  }, [slotAConfig, preloadA, syncSlotElement]);

  useEffect(() => {
    syncSlotElement(videoBRef.current, slotBConfig, preloadB);
  }, [slotBConfig, preloadB, syncSlotElement]);

  // Sync blurred background video
  useEffect(() => {
    const bgEl = bgVideoRef.current;
    if (!bgEl) return;
    if (isPlaying && !isGap && !isCurrentMainImage && currentVideoSrc) {
      bgEl.play().catch(() => {});
    } else {
      bgEl.pause();
    }
  }, [isPlaying, isGap, isCurrentMainImage, currentVideoSrc]);

  // 60fps Multi-Track & Transition-Aware Playback Engine
  useEffect(() => {
    if (!isPlaying) return;

    let animFrameId: number;
    let isSubscribed = true;
    let lastTickTime = performance.now();

    const onTick = () => {
      if (!isSubscribed) return;

      const now = performance.now();
      const deltaMs = now - lastTickTime;
      lastTickTime = now;

      const items = mainItemsRef.current;
      const totalDur = totalDurationMsRef.current;
      const leader = leaderItemRef.current;
      const leaderSlotCfg = leader
        ? leader.index % 2 === 0
          ? slotAConfigRef.current
          : slotBConfigRef.current
        : null;
      const leaderEl = leader
        ? leader.index % 2 === 0
          ? videoARef.current
          : videoBRef.current
        : null;

      // Clock-driven mode: gap OR still image OR missing video element
      if (!leader || !leaderSlotCfg || leaderSlotCfg.isImage || !leaderEl) {
        const currTime = currentTimeMsRef.current;
        const nextTime = currTime + deltaMs;

        if (totalDur > 0 && nextTime >= totalDur) {
          if (usePlayerStore.getState().isLooping) {
            lastEmittedTimeMsRef.current = 0;
            seek(0);
          } else {
            pause();
            seek(0);
            return;
          }
        } else {
          lastEmittedTimeMsRef.current = nextTime;
          seek(nextTime);
        }

        animFrameId = requestAnimationFrame(onTick);
        return;
      }

      // Video-clock-driven mode
      const vidTimeMs = leaderEl.currentTime * 1000;
      const speed = leader.clip.speed && leader.clip.speed > 0 ? leader.clip.speed : 1.0;
      const newGlobalTime =
        leader.playStartMs + Math.max(0, Math.round((vidTimeMs - leader.clip.inMs) / speed));

      if (vidTimeMs >= leader.clip.outMs || leaderEl.ended || newGlobalTime >= leader.playEndMs) {
        const nextItem = items[leader.index + 1];
        if (nextItem) {
          lastEmittedTimeMsRef.current = leader.playEndMs;
          seek(leader.playEndMs);
          animFrameId = requestAnimationFrame(onTick);
          return;
        }

        if (leader.playEndMs < totalDur) {
          lastEmittedTimeMsRef.current = leader.playEndMs;
          seek(leader.playEndMs);
          animFrameId = requestAnimationFrame(onTick);
          return;
        }

        if (usePlayerStore.getState().isLooping) {
          leaderEl.pause();
          lastEmittedTimeMsRef.current = 0;
          seek(0);
        } else {
          pause();
          seek(0);
          return;
        }
      } else {
        lastEmittedTimeMsRef.current = newGlobalTime;
        seek(newGlobalTime);
      }

      if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - leaderEl.currentTime) > 0.15) {
        bgVideoRef.current.currentTime = leaderEl.currentTime;
      }

      animFrameId = requestAnimationFrame(onTick);
    };

    animFrameId = requestAnimationFrame(onTick);
    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animFrameId);
    };
  }, [isPlaying, seek, pause]);

  const handleVideoLoadedMetadata = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    const cfg = slot === 'A' ? slotAConfigRef.current : slotBConfigRef.current;
    const pre = slot === 'A' ? preloadA : preloadB;
    const targetSrc = cfg?.source || pre?.source;

    if (
      targetSrc &&
      !isImageSource(targetSrc) &&
      targetSrc.probe.video &&
      videoEl.videoWidth === 0 &&
      videoEl.videoHeight === 0
    ) {
      const resolvedPath = resolvePreviewFilePath(targetSrc, previewQuality);
      if (resolvedPath !== targetSrc.path) {
        void recoverBrokenProxy(targetSrc, previewQuality, resolvedPath);
      } else {
        void ensureProxy(targetSrc, previewQuality, { forceCodecFallback: true });
      }
    }

    if (cfg) {
      videoEl.currentTime = cfg.localTimeMs / 1000;
      const speed = cfg.item.clip.speed || 1.0;
      try {
        videoEl.playbackRate = Math.max(0.0625, Math.min(16, speed));
      } catch {
        // ignore
      }
      const totalDb = project.audio.volumeDb + (cfg.item.clip.volumeDb || 0);
      const gainLinear = Math.pow(10, totalDb / 20);
      videoEl.muted = isAudioMuted;
      videoEl.volume = Math.max(0, Math.min(1, volume * gainLinear * cfg.audioGainMultiplier));
      if (isPlayingRef.current && !cfg.isImage) {
        videoEl.play().catch(() => {});
      }
    } else if (pre) {
      videoEl.currentTime = pre.item.clip.inMs / 1000;
      videoEl.pause();
    }
  };

  const handleVideoError = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLVideoElement>) => {
    const videoEl = e.currentTarget;
    const rawSrc = videoEl.getAttribute('data-raw-src');
    if (!rawSrc) return;
    const cfg = slot === 'A' ? slotAConfigRef.current : slotBConfigRef.current;
    if (cfg?.source && !cfg.isImage) {
      if (cfg.mediaPath !== cfg.source.path) {
        void recoverBrokenProxy(cfg.source, previewQuality, cfg.mediaPath);
      } else if (cfg.source.probe.video) {
        void ensureProxy(cfg.source, previewQuality, { forceCodecFallback: true });
      }
    }
  };

  // Reference source dimensions for canvas ratio
  const canvasRefSource =
    currentSource ||
    sources.find((s) => s.id === mainItems[0]?.clip.sourceId) ||
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

  const computeBoundsForDims = useCallback(
    (itemSrcW: number, itemSrcH: number, clip?: Clip) => {
      const safeW = itemSrcW > 0 ? itemSrcW : 1920;
      const safeH = itemSrcH > 0 ? itemSrcH : 1080;
      const canvasRatio = containerW / containerH;
      const crop = clip?.cropOverride ?? project.crop;
      const customBounds =
        !showOriginalAspect && project.fitMode === 'fit'
          ? (clip?.fitBounds ?? project.fitBounds)
          : !showOriginalAspect && project.fitMode === 'stretch'
            ? (clip?.stretchBounds ?? project.stretchBounds)
            : null;
      const isCropped =
        project.fitMode === 'crop' &&
        !isCropEditing &&
        crop &&
        crop.width > 0 &&
        crop.height > 0 &&
        (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0);
      const effectiveW = isCropped ? safeW * crop.width : safeW;
      const effectiveH = isCropped ? safeH * crop.height : safeH;
      const videoRatio =
        effectiveW > 0 && effectiveH > 0 ? effectiveW / effectiveH : safeW / safeH;

      const fBounds =
        videoRatio > canvasRatio
          ? {
              left: 0,
              top: Math.round((containerH - Math.max(1, Math.round(containerW / videoRatio))) / 2),
              width: containerW,
              height: Math.max(1, Math.round(containerW / videoRatio)),
            }
          : {
              left: Math.round((containerW - Math.max(1, Math.round(containerH * videoRatio))) / 2),
              top: 0,
              width: Math.max(1, Math.round(containerH * videoRatio)),
              height: containerH,
            };

      const defNorm: NormalizedBounds =
        showOriginalAspect || project.fitMode === 'stretch' || containerW <= 0 || containerH <= 0
          ? { x: 0, y: 0, width: 1, height: 1 }
          : {
              x: fBounds.left / containerW,
              y: fBounds.top / containerH,
              width: fBounds.width / containerW,
              height: fBounds.height / containerH,
            };

      const actNorm = customBounds || defNorm;
      const pxBounds = {
        left: Math.round(actNorm.x * containerW),
        top: Math.round(actNorm.y * containerH),
        width: Math.max(1, Math.round(actNorm.width * containerW)),
        height: Math.max(1, Math.round(actNorm.height * containerH)),
      };

      let inner = { left: 0, top: 0, width: pxBounds.width, height: pxBounds.height };
      if (!showOriginalAspect && !isCropEditing && project.fitMode === 'crop') {
        const hasCrop =
          crop &&
          crop.width > 0 &&
          crop.height > 0 &&
          (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0);
        if (hasCrop) {
          const vw = Math.max(1, Math.round(pxBounds.width / crop.width));
          const vh = Math.max(1, Math.round(pxBounds.height / crop.height));
          inner = {
            left: Math.round(-crop.x * vw),
            top: Math.round(-crop.y * vh),
            width: vw,
            height: vh,
          };
        }
      }

      return { defNorm, actNorm, pxBounds, inner };
    },
    [
      containerW,
      containerH,
      project.fitMode,
      project.crop,
      project.fitBounds,
      project.stretchBounds,
      isCropEditing,
      showOriginalAspect,
    ]
  );

  const mainSrcW = currentSource?.probe.video?.width || srcW;
  const mainSrcH = currentSource?.probe.video?.height || srcH;
  const currentMainCrop = currentClip?.cropOverride ?? project.crop;
  const currentMainCustomBounds =
    !showOriginalAspect && project.fitMode === 'fit'
      ? (currentClip?.fitBounds ?? project.fitBounds)
      : !showOriginalAspect && project.fitMode === 'stretch'
        ? (currentClip?.stretchBounds ?? project.stretchBounds)
        : null;

  const { actNorm: activeBounds, pxBounds: pixelBounds } = useMemo(
    () => computeBoundsForDims(mainSrcW, mainSrcH, currentClip),
    [computeBoundsForDims, mainSrcW, mainSrcH, currentClip]
  );

  const slotALayout = useMemo(() => {
    const w = slotAConfig?.source?.probe.video?.width || mainSrcW;
    const h = slotAConfig?.source?.probe.video?.height || mainSrcH;
    return computeBoundsForDims(w, h, slotAConfig?.item.clip);
  }, [
    slotAConfig?.source?.probe.video?.width,
    slotAConfig?.source?.probe.video?.height,
    slotAConfig?.item.clip,
    mainSrcW,
    mainSrcH,
    computeBoundsForDims,
  ]);

  const slotBLayout = useMemo(() => {
    const w = slotBConfig?.source?.probe.video?.width || mainSrcW;
    const h = slotBConfig?.source?.probe.video?.height || mainSrcH;
    return computeBoundsForDims(w, h, slotBConfig?.item.clip);
  }, [
    slotBConfig?.source?.probe.video?.width,
    slotBConfig?.source?.probe.video?.height,
    slotBConfig?.item.clip,
    mainSrcW,
    mainSrcH,
    computeBoundsForDims,
  ]);

  const hasLetterbox = useMemo(() => {
    const crop = currentMainCrop;
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
      (currentMainCustomBounds != null &&
        (currentMainCustomBounds.width < 0.98 || currentMainCustomBounds.height < 0.98))
    );
  }, [targetRatio, mainSrcW, mainSrcH, project.fitMode, currentMainCrop, isCropEditing, currentMainCustomBounds]);

  const geometry = useMemo(() => {
    return computeGeometry(
      mainSrcW,
      mainSrcH,
      showOriginalAspect ? { id: 'original' } : project.aspect,
      showOriginalAspect ? 'fit' : project.fitMode,
      currentMainCrop,
      project.output.resolutionMode,
      currentMainCustomBounds
    );
  }, [
    mainSrcW,
    mainSrcH,
    showOriginalAspect,
    project.aspect,
    project.fitMode,
    currentMainCrop,
    project.output.resolutionMode,
    currentMainCustomBounds,
  ]);

  const renderSlotVisuals = (
    slot: 'A' | 'B',
    cfg: SlotActiveConfig | null,
    layout: { pxBounds: { left: number; top: number; width: number; height: number }; inner: { left: number; top: number; width: number; height: number } },
    videoRef: React.RefObject<HTMLVideoElement | null>
  ) => {
    const filterId = `megu-video-fx-${slot}`;
    const adj =
      !cfg || bypassVideoFx
        ? DEFAULT_VIDEO_ADJUSTMENTS
        : resolveClipVideoAdjustments(cfg.item.clip);
    const fxSpec = computePreviewFilterSpec(adj, layout.inner.width, layout.inner.height);
    const transform = buildCssTransform(
      cfg?.item.clip.rotate || 0,
      cfg?.item.clip.flipH || false,
      cfg?.item.clip.flipV || false
    );
    const isVisible = Boolean(cfg);

    return (
      <div
        key={`slot-${slot}`}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: cfg ? cfg.zIndex : 1,
          opacity: isVisible ? 1 : 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          ...(cfg ? cfg.layerStyle : {}),
        }}
      >
        <VideoSvgFilterDefs filterId={filterId} spec={fxSpec} />

        <div
          className="video-bounds-container"
          style={{
            position: 'absolute',
            left: `${layout.pxBounds.left}px`,
            top: `${layout.pxBounds.top}px`,
            width: `${layout.pxBounds.width}px`,
            height: `${layout.pxBounds.height}px`,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <video
            ref={videoRef}
            preload="auto"
            playsInline
            onLoadedMetadata={(e) => handleVideoLoadedMetadata(slot, e)}
            onError={(e) => handleVideoError(slot, e)}
            style={{
              position: 'absolute',
              left: `${layout.inner.left}px`,
              top: `${layout.inner.top}px`,
              width: `${layout.inner.width}px`,
              height: `${layout.inner.height}px`,
              objectFit: 'fill',
              objectPosition: 'center',
              transform,
              filter: fxSpec.hasSvgFilter ? `url(#${filterId})` : undefined,
              opacity: cfg && !cfg.isImage ? fxSpec.opacityFactor : 0,
              pointerEvents: 'none',
            }}
          />

          {cfg && cfg.isImage && cfg.mediaUrl && (
            <img
              src={cfg.mediaUrl}
              alt={cfg.source?.filename || ''}
              draggable={false}
              onError={() => {
                if (cfg.source) {
                  void recoverBrokenProxy(cfg.source, previewQuality, cfg.mediaPath);
                }
              }}
              style={{
                position: 'absolute',
                left: `${layout.inner.left}px`,
                top: `${layout.inner.top}px`,
                width: `${layout.inner.width}px`,
                height: `${layout.inner.height}px`,
                objectFit: 'fill',
                objectPosition: 'center',
                transform,
                filter: fxSpec.hasSvgFilter ? `url(#${filterId})` : undefined,
                opacity: fxSpec.opacityFactor,
                pointerEvents: 'none',
              }}
            />
          )}

          {cfg && <VideoFrameOverlays spec={fxSpec} />}
        </div>
      </div>
    );
  };

  const isProxyGenerating = currentSource
    ? proxyStatus[proxyStatusKey(currentSource.id, previewQuality)] === 'generating'
    : false;
  const isMainSelected = !!activeClipId && currentClip?.id === activeClipId;

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
        data-leader-slot={leaderSlot}
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
        {/* Dual-Layer Main Track Slots (supports seamless 60fps transitions & preloading) */}
        {renderSlotVisuals('A', slotAConfig, slotALayout, videoARef)}
        {renderSlotVisuals('B', slotBConfig, slotBLayout, videoBRef)}

        {/* Color Dip Transition Overlay (Fade to Black / White / Custom Color) */}
        {v1FrameState.dipOverlayColor && v1FrameState.dipOverlayOpacity > 0.001 && (
          <div
            data-testid="preview-transition-dip-overlay"
            style={{
              position: 'absolute',
              inset: 0,
              background: v1FrameState.dipOverlayColor,
              opacity: v1FrameState.dipOverlayOpacity,
              zIndex: 4,
              pointerEvents: 'none',
            }}
          />
        )}

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
                zIndex: 5,
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
            clipDurationMs={ov.clipDurationMs}
            timelineOffsetMs={ov.timelineOffsetMs}
            isPlaying={isPlaying}
            isAudioMuted={isAudioMuted}
            masterVolume={volume}
            projectVolumeDb={project.audio.volumeDb}
            previewQuality={previewQuality}
            containerW={containerW}
            containerH={containerH}
            zIndex={6 + ov.trackIndex}
            isSelected={ov.clip.id === activeClipId}
            bypassVideoFx={bypassVideoFx}
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
                clipId={currentClip?.id}
                onResizeChange={setIsResizingCrop}
                onBoundsChange={(bounds) => {
                  if (!currentClip) return;
                  if (project.fitMode === 'fit') {
                    setFitBounds(bounds, currentClip.id);
                  } else if (project.fitMode === 'stretch') {
                    setStretchBounds(bounds, currentClip.id);
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

        {/* Before/After Compare Badge when bypassing Video FX */}
        {bypassVideoFx &&
          (hasActiveVideoAdjustments(currentClip) ||
            visibleOverlays.some((ov) => hasActiveVideoAdjustments(ov.clip))) && (
            <div
              data-testid="preview-fx-bypass-badge"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 35,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--r-full)',
                boxShadow: 'var(--shadow-2)',
                color: 'var(--accent)',
                fontSize: 'var(--text-11)',
                fontWeight: 600,
                pointerEvents: 'none',
              }}
            >
              <CompareSplitIcon size={12} />
              <span>{t('video_edit.comparing_original')}</span>
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
