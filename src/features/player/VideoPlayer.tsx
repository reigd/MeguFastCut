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

  // Next clip for seamless preloading
  const nextClip = useMemo(() => {
    const clips = project.clips.filter((c) => c.enabled);
    return clips[currentClipIndex + 1];
  }, [project.clips, currentClipIndex]);

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
        activeVideo.currentTime = clipLocalTimeMs / 1000;
        if (isPlaying) {
          activeVideo.play().catch(() => {});
        }
      }
    }
  }, [activeVideo, currentVideoSrc, clipLocalTimeMs, isPlaying]);

  // Preload next clip in passive video element
  useEffect(() => {
    if (passiveVideo && nextVideoSrc && nextClip) {
      if (passiveVideo.getAttribute('data-raw-src') !== nextVideoSrc) {
        passiveVideo.src = nextVideoSrc;
        passiveVideo.setAttribute('data-raw-src', nextVideoSrc);
        passiveVideo.currentTime = nextClip.inMs / 1000;
        passiveVideo.pause();
      }
    }
  }, [passiveVideo, nextVideoSrc, nextClip]);

  // Sync playback state
  useEffect(() => {
    if (!activeVideo) return;
    const isAudioMuted = isMuted || project.audio.muted;
    const gainLinear = Math.pow(10, project.audio.volumeDb / 20);
    activeVideo.muted = isAudioMuted;
    activeVideo.volume = Math.max(0, Math.min(1, volume * gainLinear));

    if (isPlaying) {
      activeVideo.play().catch(() => pause());
    } else {
      activeVideo.pause();
    }
  }, [activeVideo, isPlaying, isMuted, volume, project.audio.muted, project.audio.volumeDb, pause]);

  // Seeking sync
  useEffect(() => {
    if (!activeVideo) return;
    const targetSec = clipLocalTimeMs / 1000;
    if (Math.abs(activeVideo.currentTime - targetSec) > 0.15) {
      activeVideo.currentTime = targetSec;
    }
  }, [activeVideo, clipLocalTimeMs]);

  // Update current time during playback with requestVideoFrameCallback or timeupdate
  useEffect(() => {
    if (!activeVideo) return;

    let handle: number;
    let isSubscribed = true;

    const onFrame = () => {
      if (!isSubscribed || !activeVideo) return;

      const vidTimeMs = activeVideo.currentTime * 1000;

      // Check if clip boundary reached
      if (currentClip && vidTimeMs >= currentClip.outMs) {
        // Transition to next clip seamlessly!
        if (nextClip && passiveVideo) {
          passiveVideo.play().catch(() => {});
          setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'));
          seek(currentTimeMs + (currentClip.outMs - clipLocalTimeMs));
        } else {
          // End of sequence
          pause();
          seek(0);
        }
      }

      if ('requestVideoFrameCallback' in activeVideo) {
        handle = (activeVideo as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }).requestVideoFrameCallback(onFrame);
      }
    };

    if ('requestVideoFrameCallback' in activeVideo) {
      handle = (activeVideo as HTMLVideoElement & {
        requestVideoFrameCallback: (cb: () => void) => number;
      }).requestVideoFrameCallback(onFrame);
    }

    const onTimeUpdate = () => {
      if (!activeVideo || !currentClip) return;
      const vidTimeMs = activeVideo.currentTime * 1000;
      // Calculate global time
      let accumulated = 0;
      const clips = project.clips.filter((c) => c.enabled);
      for (let i = 0; i < currentClipIndex; i++) {
        accumulated += clips[i].outMs - clips[i].inMs;
      }
      const newGlobalTime = accumulated + (vidTimeMs - currentClip.inMs);
      seek(newGlobalTime);
    };

    activeVideo.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      isSubscribed = false;
      activeVideo.removeEventListener('timeupdate', onTimeUpdate);
      if (handle && 'cancelVideoFrameCallback' in activeVideo) {
        (activeVideo as HTMLVideoElement & {
          cancelVideoFrameCallback: (id: number) => void;
        }).cancelVideoFrameCallback(handle);
      }
    };
  }, [activeVideo, passiveVideo, currentClip, nextClip, currentClipIndex, clipLocalTimeMs, currentTimeMs, project.clips, seek, pause]);

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
            src={currentVideoSrc}
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
          playsInline
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
          playsInline
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
