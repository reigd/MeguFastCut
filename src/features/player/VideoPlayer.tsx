import React, { useEffect, useRef, useState, useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { ensureProxy } from '../../shared/proxy-manager';
import { computeGeometry, buildCssTransform, resolveAspectRatio } from '../../shared/geometry';
import { CropOverlay } from '../transform/CropOverlay';
import { t } from '../../shared/i18n';
import { SparkleIcon, FilmIcon } from '../../components/icons';

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
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isResizingCrop, setIsResizingCrop] = useState(false);

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

  // Compute active clip based on currentTimeMs
  const { currentClip, currentSource, currentClipIndex, clipLocalTimeMs, isGap } = useMemo(() => {
    const clips = project.clips.filter((c) => c.enabled);

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const speed = clip.speed && clip.speed > 0 ? clip.speed : 1.0;
      const clipDuration = Math.round((clip.outMs - clip.inMs) / speed);
      const clipStart = clip.startMs ?? 0;
      const clipEnd = clipStart + clipDuration;

      if (currentTimeMs >= clipStart && currentTimeMs < clipEnd) {
        const localTimelineProgress = currentTimeMs - clipStart;
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
  }, [project.clips, sources, currentTimeMs]);

  // Synchronized state refs for 60fps playback loop
  const currentClipRef = useRef(currentClip);
  currentClipRef.current = currentClip;
  const isGapRef = useRef(isGap);
  isGapRef.current = isGap;
  const currentTimeMsRef = useRef(currentTimeMs);
  currentTimeMsRef.current = currentTimeMs;
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

  // Check and trigger proxy generation if needed (keyed by ID to avoid 60fps effect re-triggers)
  const currentSourceId = currentSource?.id;
  const nextSourceId = nextSource?.id;
  useEffect(() => {
    if (currentSource) {
      ensureProxy(currentSource);
    }
    if (nextSource) {
      ensureProxy(nextSource);
    }
  }, [currentSourceId, nextSourceId]);

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

    if (isPlaying && !isGap) {
      activeVideo.play().catch((err) => {
        console.error('Video play error:', err);
        pause();
      });
      bgVideoRef.current?.play().catch(() => {});
    } else {
      activeVideo.pause();
      bgVideoRef.current?.pause();
    }
  }, [activeVideo, isPlaying, isGap, isMuted, volume, project.audio.muted, project.audio.volumeDb, pause]);

  // Set video playbackRate according to clip.speed (safely clamped for HTML5 video)
  useEffect(() => {
    if (activeVideo && currentClip) {
      const targetRate = Math.max(0.0625, Math.min(16, currentClip.speed || 1.0));
      if (Math.abs(activeVideo.playbackRate - targetRate) > 0.001) {
        try {
          activeVideo.playbackRate = targetRate;
        } catch (e) {
          console.warn('Could not set playbackRate:', e);
        }
      }
    }
  }, [activeVideo, currentClip?.id, currentClip?.speed]);

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
    if (!isPlaying) return;

    let animFrameId: number;
    let isSubscribed = true;
    let lastTickTime = performance.now();

    const onTick = () => {
      if (!isSubscribed) return;

      const now = performance.now();
      const deltaMs = now - lastTickTime;
      lastTickTime = now;

      const clips = projectClipsRef.current.filter((c) => c.enabled);
      const totalDuration = clips.reduce((max, c) => {
        const cSpeed = c.speed && c.speed > 0 ? c.speed : 1.0;
        const dur = Math.round((c.outMs - c.inMs) / cSpeed);
        return Math.max(max, (c.startMs ?? 0) + dur);
      }, 0);

      // Case 1: In a gap (no clip currently playing)
      if (isGapRef.current || !currentClipRef.current) {
        if (activeVideo && !activeVideo.paused) {
          activeVideo.pause();
        }
        const currTime = currentTimeMsRef.current;
        const nextTime = currTime + deltaMs;

        if (nextTime >= totalDuration && totalDuration > 0) {
          if (usePlayerStore.getState().isLooping) {
            lastEmittedTimeMsRef.current = 0;
            seek(0);
          } else {
            pause();
            seek(0);
            return;
          }
        } else {
          // Check if nextTime enters a clip
          const matchingClip = clips.find((c) => {
            const cSpeed = c.speed && c.speed > 0 ? c.speed : 1.0;
            const dur = Math.round((c.outMs - c.inMs) / cSpeed);
            const cStart = c.startMs ?? 0;
            return nextTime >= cStart && nextTime < cStart + dur;
          });

          if (matchingClip && activeVideo) {
            const cSpeed = matchingClip.speed && matchingClip.speed > 0 ? matchingClip.speed : 1.0;
            const localOffset = nextTime - (matchingClip.startMs ?? 0);
            const targetSec = (matchingClip.inMs + localOffset * cSpeed) / 1000;
            activeVideo.currentTime = targetSec;
            activeVideo.play().catch(() => {});
          }

          lastEmittedTimeMsRef.current = nextTime;
          seek(nextTime);
        }

        animFrameId = requestAnimationFrame(onTick);
        return;
      }

      // Case 2: Inside an active clip
      const currentClip = currentClipRef.current;
      if (!currentClip || !activeVideo) {
        animFrameId = requestAnimationFrame(onTick);
        return;
      }

      const vidTimeMs = activeVideo.currentTime * 1000;

      // Check if current clip has reached its out point
      if (vidTimeMs >= currentClip.outMs) {
        const cSpeed = currentClip.speed && currentClip.speed > 0 ? currentClip.speed : 1.0;
        const currentClipDur = Math.round((currentClip.outMs - currentClip.inMs) / cSpeed);
        const currentClipEnd = (currentClip.startMs ?? 0) + currentClipDur;

        const nextIdx = currentClipIndexRef.current + 1;
        const nextClip = clips[nextIdx];

        if (nextClip) {
          const nextStart = nextClip.startMs ?? currentClipEnd;
          if (nextStart <= currentClipEnd && passiveVideo) {
            // Seamless transition to next clip
            passiveVideo.play().catch((err) => console.error('Passive play error:', err));
            setActiveSlot((prev) => (prev === 'A' ? 'B' : 'A'));
            lastEmittedTimeMsRef.current = nextStart;
            seek(nextStart);
            return;
          } else {
            // Gap before next clip: pause active video and enter gap
            activeVideo.pause();
            lastEmittedTimeMsRef.current = currentClipEnd;
            seek(currentClipEnd);
            animFrameId = requestAnimationFrame(onTick);
            return;
          }
        } else {
          // End of timeline reached
          if (usePlayerStore.getState().isLooping) {
            activeVideo.pause();
            lastEmittedTimeMsRef.current = 0;
            seek(0);
          } else {
            pause();
            seek(0);
            return;
          }
        }
      }

      // Progress within clip
      const speed = currentClip.speed && currentClip.speed > 0 ? currentClip.speed : 1.0;
      const clipStart = currentClip.startMs ?? 0;
      const newGlobalTime = clipStart + Math.max(0, Math.round((vidTimeMs - currentClip.inMs) / speed));

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

  const targetRatio = useMemo(() => {
    if (showOriginalAspect || project.fitMode === 'crop') {
      return srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
    }
    return resolveAspectRatio(project.aspect, srcW, srcH);
  }, [showOriginalAspect, project.fitMode, project.aspect, srcW, srcH]);

  const hasLetterbox = Math.abs(targetRatio - (srcW / srcH)) > 0.02;

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

  const videoBounds = useMemo(() => {
    const containerW = parseInt(viewportDims.width, 10) || 800;
    const containerH = parseInt(viewportDims.height, 10) || 450;
    if (showOriginalAspect || project.fitMode === 'stretch' || project.fitMode === 'crop') {
      return {
        left: 0,
        top: 0,
        width: containerW,
        height: containerH,
      };
    }
    // In 'fit' mode: video is contained inside containerW x containerH
    const srcRatio = srcW > 0 && srcH > 0 ? srcW / srcH : 16 / 9;
    const containerRatio = containerW / containerH;
    if (srcRatio > containerRatio) {
      // Letterbox top/bottom
      const w = containerW;
      const h = Math.max(1, Math.round(containerW / srcRatio));
      return {
        left: 0,
        top: Math.round((containerH - h) / 2),
        width: w,
        height: h,
      };
    } else {
      // Pillarbox left/right
      const h = containerH;
      const w = Math.max(1, Math.round(containerH * srcRatio));
      return {
        left: Math.round((containerW - w) / 2),
        top: 0,
        width: w,
        height: h,
      };
    }
  }, [viewportDims.width, viewportDims.height, showOriginalAspect, project.fitMode, srcW, srcH]);

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

      {/* Blurred background ONLY when letterboxing actually exists and user opted into blur */}
      {!showOriginalAspect && !isGap && project.fitMode === 'fit' && project.padding.mode === 'blur' && hasLetterbox && (
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

      {/* Aspect Ratio Bounding Viewport with explicit pixel-perfect sizing */}
      <div
        ref={viewportRef}
        className="preview-viewport"
        data-target-w={geometry.targetWidth}
        data-target-h={geometry.targetHeight}
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
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          transition: isResizingCrop
            ? 'none'
            : 'width var(--dur-fast) var(--ease-out), height var(--dur-fast) var(--ease-out)',
        }}
      >
        {/* Video Element A */}
        <video
          ref={videoARef}
          src={activeSlot === 'A' ? currentVideoSrc : ''}
          preload="auto"
          playsInline
          onLoadedMetadata={(e) => {
            if (activeSlot === 'A') {
              const targetSec = clipLocalTimeMsRef.current / 1000;
              e.currentTarget.currentTime = targetSec;
              if (isPlayingRef.current) e.currentTarget.play().catch(() => {});
            }
          }}
          onError={(e) => {
            console.error('Video A load error:', e.currentTarget.error?.message, e.currentTarget.error?.code);
          }}
          style={{
            position: 'absolute',
            width: project.fitMode === 'stretch' ? '100%' : '100%',
            height: project.fitMode === 'stretch' ? '100%' : '100%',
            objectFit: project.fitMode === 'stretch' ? 'fill' : 'contain',
            objectPosition: 'center',
            transform: cssTransform,
            opacity: !isGap && activeSlot === 'A' ? 1 : 0,
            transition: 'opacity var(--dur-fast) var(--ease-out)',
            pointerEvents: 'none',
          }}
        />

        {/* Video Element B (Preload buffer for seamless multi-clip cuts) */}
        <video
          ref={videoBRef}
          src={activeSlot === 'B' ? currentVideoSrc : nextVideoSrc}
          preload="auto"
          playsInline
          onLoadedMetadata={(e) => {
            if (activeSlot === 'B') {
              const targetSec = clipLocalTimeMsRef.current / 1000;
              e.currentTarget.currentTime = targetSec;
              if (isPlayingRef.current) e.currentTarget.play().catch(() => {});
            }
          }}
          onError={(e) => {
            console.error('Video B load error:', e.currentTarget.error?.message, e.currentTarget.error?.code);
          }}
          style={{
            position: 'absolute',
            width: project.fitMode === 'stretch' ? '100%' : '100%',
            height: project.fitMode === 'stretch' ? '100%' : '100%',
            objectFit: project.fitMode === 'stretch' ? 'fill' : 'contain',
            objectPosition: 'center',
            transform: cssTransform,
            opacity: !isGap && activeSlot === 'B' ? 1 : 0,
            transition: 'opacity var(--dur-fast) var(--ease-out)',
            pointerEvents: 'none',
          }}
        />

        {/* Interactive Transform/Crop Overlay on selected video (crop, fit, stretch) */}
        {!showOriginalAspect && !isGap && (
          <div
            style={{
              position: 'absolute',
              left: `${videoBounds.left}px`,
              top: `${videoBounds.top}px`,
              width: `${videoBounds.width}px`,
              height: `${videoBounds.height}px`,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <CropOverlay
              width={videoBounds.width}
              height={videoBounds.height}
              sourceWidth={srcW}
              sourceHeight={srcH}
              onResizeChange={setIsResizingCrop}
            />
          </div>
        )}

        {/* Empty Canvas Watermark / Hint when project has no clips */}
        {project.clips.length === 0 && (
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
