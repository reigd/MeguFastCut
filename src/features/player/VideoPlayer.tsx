import React, { useEffect, useRef, useState, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { ensureProxy } from '../../shared/proxy-manager';
import { computeGeometry, buildCssTransform, resolveAspectRatio } from '../../shared/geometry';
import { CropOverlay } from '../transform/CropOverlay';
import { t } from '../../shared/i18n';
import { SparkleIcon } from '../../components/icons';

export const VideoPlayer: React.FC = () => {
  const { project, sources } = useProjectStore();
  const {
    currentTimeMs,
    isPlaying,
    isMuted,
    volume,
    showOriginalAspect,
    isFullscreen,
    seek,
    pause,
    play,
    proxyStatus,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, []);

  // Compute active clip based on currentTimeMs
  const { currentClip, currentSource, currentClipIndex, clipLocalTimeMs } = useMemo(() => {
    let accumulatedMs = 0;
    const clips = project.clips.filter((c) => c.enabled);

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const clipDuration = clip.outMs - clip.inMs;

      if (currentTimeMs >= accumulatedMs && (currentTimeMs < accumulatedMs + clipDuration || i === clips.length - 1)) {
        const localTime = clip.inMs + (currentTimeMs - accumulatedMs);
        const src = sources.find((s) => s.id === clip.sourceId);
        return {
          currentClip: clip,
          currentSource: src,
          currentClipIndex: i,
          clipLocalTimeMs: Math.min(clip.outMs, Math.max(clip.inMs, localTime)),
        };
      }
      accumulatedMs += clipDuration;
    }

    const firstClip = clips[0];
    const src = firstClip ? sources.find((s) => s.id === firstClip.sourceId) : undefined;
    return {
      currentClip: firstClip,
      currentSource: src,
      currentClipIndex: 0,
      clipLocalTimeMs: firstClip ? firstClip.inMs : 0,
    };
  }, [project.clips, sources, currentTimeMs]);

  // Synchronized state refs for 60fps playback loop
  const currentClipRef = useRef(currentClip);
  currentClipRef.current = currentClip;
  const nextClipRef = useRef<typeof nextClip>(undefined);
  const currentClipIndexRef = useRef(currentClipIndex);
  currentClipIndexRef.current = currentClipIndex;
  const clipLocalTimeMsRef = useRef(clipLocalTimeMs);
  clipLocalTimeMsRef.current = clipLocalTimeMs;
  const projectClipsRef = useRef(project.clips);
  projectClipsRef.current = project.clips;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const lastEmittedTimeMsRef = useRef<number>(currentTimeMs);

  // Next clip for seamless preloading
  const nextClip = useMemo(() => {
    const clips = project.clips.filter((c) => c.enabled);
    return clips[currentClipIndex + 1];
  }, [project.clips, currentClipIndex]);
  nextClipRef.current = nextClip;

  const nextSource = useMemo(() => {
    if (!nextClip) return undefined;
    return sources.find((s) => s.id === nextClip.sourceId);
  }, [nextClip, sources]);

  // Check and trigger proxy generation if needed
  useEffect(() => {
    if (currentSource) {
      ensureProxy(currentSource);
    }
    if (nextSource) {
      ensureProxy(nextSource);
    }
  }, [currentSource, nextSource]);

  // Determine media URLs
  const currentVideoSrc = useMemo(() => {
    if (!currentSource) return '';
    const filePath = currentSource.proxyPath || currentSource.path;
    return convertFileSrc(filePath);
  }, [currentSource]);

  const nextVideoSrc = useMemo(() => {
    if (!nextSource) return '';
    const filePath = nextSource.proxyPath || nextSource.path;
    return convertFileSrc(filePath);
  }, [nextSource]);

  // Video element references
  const activeVideo = activeSlot === 'A' ? videoARef.current : videoBRef.current;
  const passiveVideo = activeSlot === 'A' ? videoBRef.current : videoARef.current;

  // Sync active video src & volume
  useEffect(() => {
    if (activeVideo && currentVideoSrc) {
      if (activeVideo.getAttribute('data-raw-src') !== currentVideoSrc) {
        activeVideo.src = currentVideoSrc;
        activeVideo.setAttribute('data-raw-src', currentVideoSrc);
        activeVideo.load();
        const targetSec = clipLocalTimeMsRef.current / 1000;
        activeVideo.currentTime = targetSec;
        if (bgVideoRef.current) {
          bgVideoRef.current.currentTime = targetSec;
        }
        if (isPlayingRef.current) {
          activeVideo.play().catch((err) => console.error('Active play error after src change:', err));
        }
      }
    }
  }, [activeVideo, currentVideoSrc]);

  // Preload next clip in passive video element
  useEffect(() => {
    if (passiveVideo && nextVideoSrc && nextClip) {
      if (passiveVideo.getAttribute('data-raw-src') !== nextVideoSrc) {
        passiveVideo.src = nextVideoSrc;
        passiveVideo.setAttribute('data-raw-src', nextVideoSrc);
        passiveVideo.load();
        passiveVideo.currentTime = nextClip.inMs / 1000;
        passiveVideo.pause();
      }
    }
  }, [passiveVideo, nextVideoSrc, nextClip]);

  // Sync playback play/pause state
  useEffect(() => {
    if (!activeVideo) return;
    const isAudioMuted = isMuted || project.audio.muted;
    const gainLinear = Math.pow(10, project.audio.volumeDb / 20);
    activeVideo.muted = isAudioMuted;
    activeVideo.volume = Math.max(0, Math.min(1, volume * gainLinear));

    if (isPlaying) {
      activeVideo.play().catch((err) => {
        console.error('Video play error:', err);
        pause();
      });
      bgVideoRef.current?.play().catch(() => {});
    } else {
      activeVideo.pause();
      bgVideoRef.current?.pause();
    }
  }, [activeVideo, isPlaying, isMuted, volume, project.audio.muted, project.audio.volumeDb, pause]);

  // Seeking sync when paused (scrubbing & timeline clicking)
  useEffect(() => {
    if (!activeVideo || isPlaying) return;
    const targetSec = clipLocalTimeMs / 1000;
    if (Math.abs(activeVideo.currentTime - targetSec) > 0.03) {
      activeVideo.currentTime = targetSec;
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = targetSec;
      }
    }
  }, [activeVideo, clipLocalTimeMs, isPlaying]);

  // External seek during active playback (e.g. user jumped via hotkey or transport button)
  useEffect(() => {
    if (!activeVideo || !isPlaying) return;
    const diff = Math.abs(currentTimeMs - lastEmittedTimeMsRef.current);
    if (diff > 400) {
      const targetSec = clipLocalTimeMs / 1000;
      activeVideo.currentTime = targetSec;
      lastEmittedTimeMsRef.current = currentTimeMs;
      if (bgVideoRef.current) {
        bgVideoRef.current.currentTime = targetSec;
      }
    }
  }, [activeVideo, currentTimeMs, clipLocalTimeMs, isPlaying]);

  // Smooth 60fps Playback Engine
  useEffect(() => {
    if (!activeVideo || !isPlaying) return;

    let animFrameId: number;
    let isSubscribed = true;

    const onTick = () => {
      if (!isSubscribed || !activeVideo) return;

      const currentClip = currentClipRef.current;
      if (!currentClip) return;

      const vidTimeMs = activeVideo.currentTime * 1000;

      // Check if current clip has reached its out point
      if (vidTimeMs >= currentClip.outMs) {
        const clips = projectClipsRef.current.filter((c) => c.enabled);
        const nextIdx = currentClipIndexRef.current + 1;
        const nextClip = clips[nextIdx];

        if (nextClip && passiveVideo) {
          // Transition seamlessly to next clip
          passiveVideo.play().catch((err) => console.error('Passive play error:', err));
          setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'));

          let nextAcc = 0;
          for (let i = 0; i < nextIdx; i++) {
            nextAcc += clips[i].outMs - clips[i].inMs;
          }
          lastEmittedTimeMsRef.current = nextAcc;
          seek(nextAcc);
          return;
        } else {
          // End of timeline reached
          if (usePlayerStore.getState().isLooping) {
            activeVideo.currentTime = currentClip.inMs / 1000;
            activeVideo.play().catch(() => {});
            lastEmittedTimeMsRef.current = 0;
            seek(0);
          } else {
            pause();
            seek(0);
            return;
          }
        }
      }

      // Compute global timeline position
      const clips = projectClipsRef.current.filter((c) => c.enabled);
      let accumulated = 0;
      for (let i = 0; i < currentClipIndexRef.current && i < clips.length; i++) {
        accumulated += clips[i].outMs - clips[i].inMs;
      }
      const newGlobalTime = accumulated + Math.max(0, vidTimeMs - currentClip.inMs);

      lastEmittedTimeMsRef.current = newGlobalTime;
      seek(newGlobalTime);

      // Keep background blur video in sync if active
      if (bgVideoRef.current && Math.abs(bgVideoRef.current.currentTime - activeVideo.currentTime) > 0.15) {
        bgVideoRef.current.currentTime = activeVideo.currentTime;
      }

      animFrameId = requestAnimationFrame(onTick);
    };

    animFrameId = requestAnimationFrame(onTick);

    return () => {
      isSubscribed = false;
      cancelAnimationFrame(animFrameId);
    };
  }, [activeVideo, passiveVideo, isPlaying, seek, pause]);

  // Calculate Geometry & Transforms
  const srcW = currentSource?.probe.video?.width || 1920;
  const srcH = currentSource?.probe.video?.height || 1080;

  const targetRatio = resolveAspectRatio(
    showOriginalAspect ? { id: 'original' } : project.aspect,
    srcW,
    srcH
  );

  const geometry = useMemo(() => {
    return computeGeometry(
      srcW,
      srcH,
      showOriginalAspect ? { id: 'original' } : project.aspect,
      showOriginalAspect ? 'fit' : project.fitMode,
      project.crop
    );
  }, [srcW, srcH, showOriginalAspect, project.aspect, project.fitMode, project.crop]);

  const cssTransform = useMemo(() => {
    return buildCssTransform(
      currentClip?.rotate || 0,
      currentClip?.flipH || false,
      currentClip?.flipV || false
    );
  }, [currentClip?.rotate, currentClip?.flipH, currentClip?.flipV]);

  const isProxyGenerating = currentSource ? proxyStatus[currentSource.id] === 'generating' : false;

  const objectPosition = useMemo(() => {
    if (showOriginalAspect || project.fitMode !== 'crop') return 'center';
    const spanX = 1 - project.crop.width;
    const spanY = 1 - project.crop.height;
    const pctX = spanX > 0.001 ? Math.max(0, Math.min(100, (project.crop.x / spanX) * 100)) : 50;
    const pctY = spanY > 0.001 ? Math.max(0, Math.min(100, (project.crop.y / spanY) * 100)) : 50;
    return `${pctX.toFixed(2)}% ${pctY.toFixed(2)}%`;
  }, [showOriginalAspect, project.fitMode, project.crop]);

  return (
    <div
      ref={containerRef}
      className={`preview-area ${isFullscreen ? 'preview-fullscreen' : ''}`}
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
      onClick={() => {
        if (isPlaying) pause();
        else play();
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
          <span>{t('common.preparing_proxy')}</span>
        </div>
      )}

      {/* Blurred background when in Fit mode with blur enabled */}
      {!showOriginalAspect && project.fitMode === 'fit' && project.padding.mode === 'blur' && (
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
          <video
            ref={bgVideoRef}
            src={currentVideoSrc}
            preload="auto"
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      )}

      {/* Aspect Ratio Bounding Viewport with 200ms smooth transition */}
      <div
        ref={viewportRef}
        className="preview-viewport"
        data-target-w={geometry.targetWidth}
        data-target-h={geometry.targetHeight}
        style={{
          position: 'relative',
          zIndex: 2,
          aspectRatio: `${targetRatio}`,
          maxWidth: '92%',
          maxHeight: '92%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: project.padding.mode === 'color' ? project.padding.color || '#000000' : 'transparent',
          boxShadow: 'var(--shadow-3)',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          transition: 'aspect-ratio var(--dur-base) var(--ease-out)',
        }}
      >
        {/* Video Element A */}
        <video
          ref={videoARef}
          preload="auto"
          playsInline
          onLoadedMetadata={(e) => {
            if (activeSlot === 'A') {
              e.currentTarget.currentTime = clipLocalTimeMs / 1000;
              if (isPlaying) e.currentTarget.play().catch(() => {});
            }
          }}
          onError={(e) => {
            console.error('Video A load error:', e.currentTarget.error?.message, e.currentTarget.error?.code);
          }}
          style={{
            position: 'absolute',
            width: project.fitMode === 'stretch' ? '100%' : '100%',
            height: project.fitMode === 'stretch' ? '100%' : '100%',
            objectFit: project.fitMode === 'stretch' ? 'fill' : project.fitMode === 'crop' ? 'cover' : 'contain',
            objectPosition,
            transform: cssTransform,
            opacity: activeSlot === 'A' ? 1 : 0,
            transition: 'opacity var(--dur-fast) var(--ease-out)',
            pointerEvents: 'none',
          }}
        />

        {/* Video Element B (Preload buffer for seamless multi-clip cuts) */}
        <video
          ref={videoBRef}
          preload="auto"
          playsInline
          onLoadedMetadata={(e) => {
            if (activeSlot === 'B') {
              e.currentTarget.currentTime = clipLocalTimeMs / 1000;
              if (isPlaying) e.currentTarget.play().catch(() => {});
            }
          }}
          onError={(e) => {
            console.error('Video B load error:', e.currentTarget.error?.message, e.currentTarget.error?.code);
          }}
          style={{
            position: 'absolute',
            width: project.fitMode === 'stretch' ? '100%' : '100%',
            height: project.fitMode === 'stretch' ? '100%' : '100%',
            objectFit: project.fitMode === 'stretch' ? 'fill' : project.fitMode === 'crop' ? 'cover' : 'contain',
            objectPosition,
            transform: cssTransform,
            opacity: activeSlot === 'B' ? 1 : 0,
            transition: 'opacity var(--dur-fast) var(--ease-out)',
            pointerEvents: 'none',
          }}
        />

        {/* Interactive Crop Overlay */}
        {!showOriginalAspect && project.fitMode === 'crop' && (
          <CropOverlay width={viewportSize.width} height={viewportSize.height} />
        )}
      </div>
    </div>
  );
};
