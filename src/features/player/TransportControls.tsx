import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../../stores/player';
import { useProjectStore } from '../../stores/project';
import { formatTimecode, t } from '../../shared/i18n';
import { Slider } from '../../components/Slider/Slider';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  SkipStartIcon,
  SkipEndIcon,
  StepBackIcon,
  StepForwardIcon,
  RewindIcon,
  ForwardIcon,
  LoopIcon,
  VolumeIcon,
  VolumeMuteIcon,
  FullscreenIcon,
  FullscreenExitIcon,
  AspectRatioIcon,
  AutoAlignIcon,
} from '../../components/icons';

interface AspectPresetItem {
  id: string;
  label: string;
  sublabel: string;
  w: number;
  h: number;
  ratio?: number;
}

const CANVAS_ASPECTS: AspectPresetItem[] = [
  { id: '16:9', label: '16:9', sublabel: 'YouTube · TV', w: 16, h: 9, ratio: 16 / 9 },
  { id: '9:16', label: '9:16', sublabel: 'Shorts · TikTok', w: 9, h: 16, ratio: 9 / 16 },
  { id: '1:1', label: '1:1', sublabel: 'Square · Feed', w: 12, h: 12, ratio: 1.0 },
  { id: '4:5', label: '4:5', sublabel: 'Instagram portrait', w: 10, h: 12.5, ratio: 4 / 5 },
  { id: '4:3', label: '4:3', sublabel: 'Classic 4:3', w: 14, h: 10.5, ratio: 4 / 3 },
  { id: '21:9', label: '21:9', sublabel: 'Ultrawide cinema', w: 20, h: 8.5, ratio: 21 / 9 },
  { id: 'original', label: 'Original', sublabel: 'Source aspect', w: 16, h: 10, ratio: undefined },
];

export const TransportControls: React.FC = () => {
  const { project, sources, setAspect } = useProjectStore();
  const {
    currentTimeMs,
    isPlaying,
    isMuted,
    volume,
    isLooping,
    showOriginalAspect,
    isFullscreen,
    autoAlignEnabled,
    togglePlay,
    pause,
    seek,
    stepFrame,
    skipSeconds,
    toggleMute,
    setVolume,
    toggleLoop,
    toggleOriginalAspect,
    toggleAutoAlign,
    setFullscreen,
  } = usePlayerStore();

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showAspectMenu, setShowAspectMenu] = useState(false);
  const aspectMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showAspectMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (aspectMenuRef.current && !aspectMenuRef.current.contains(e.target as Node)) {
        setShowAspectMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [showAspectMenu]);

  // Total project duration taking per-clip speeds and enabled states into account
  const totalDurationMs = project.clips.reduce(
    (sum, c) => (c.enabled ? sum + Math.round((c.outMs - c.inMs) / (c.speed || 1.0)) : sum),
    0
  );

  // Keep playhead within bounds if duration shrinks
  useEffect(() => {
    if (totalDurationMs > 0 && currentTimeMs > totalDurationMs) {
      seek(totalDurationMs);
    }
  }, [totalDurationMs, currentTimeMs, seek]);

  // Approximate framerate from current clip source
  const currentSource = sources[0];
  const fps = currentSource?.probe.video
    ? currentSource.probe.video.fpsNum / currentSource.probe.video.fpsDen
    : 30;

  const currentFrame = Math.floor((currentTimeMs / 1000) * fps);

  return (
    <div
      style={{
        height: 'var(--transport-height)',
        background: 'var(--bg-surface)',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-4)',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Left Group: Playback Navigation Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        {/* Skip to project start */}
        <button
          type="button"
          onClick={() => seek(0)}
          title={t('player.rewind')}
          className="transport-btn"
        >
          <SkipStartIcon size={16} />
        </button>

        {/* Step 1 frame back */}
        <button
          type="button"
          onClick={() => stepFrame(-1, fps)}
          title={t('player.step_back')}
          className="transport-btn"
        >
          <StepBackIcon size={16} />
        </button>

        {/* -10s rewind */}
        <button
          type="button"
          onClick={() => skipSeconds(-10)}
          title={t('player.rewind')}
          className="transport-btn"
        >
          <RewindIcon size={16} />
        </button>

        {/* Play / Pause Main Button */}
        <button
          type="button"
          onClick={togglePlay}
          title={isPlaying ? t('player.pause') : t('player.play')}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--r-md)',
            background: 'var(--accent)',
            color: 'var(--accent-contrast)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-1)',
            margin: '0 var(--space-1)',
          }}
        >
          {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>

        {/* Stop button */}
        <button
          type="button"
          onClick={() => {
            pause();
            seek(0);
          }}
          title={t('player.stop')}
          className="transport-btn"
        >
          <StopIcon size={16} />
        </button>

        {/* +10s forward */}
        <button
          type="button"
          onClick={() => skipSeconds(10)}
          title={t('player.forward')}
          className="transport-btn"
        >
          <ForwardIcon size={16} />
        </button>

        {/* Step 1 frame forward */}
        <button
          type="button"
          onClick={() => stepFrame(1, fps)}
          title={t('player.step_forward')}
          className="transport-btn"
        >
          <StepForwardIcon size={16} />
        </button>

        {/* Skip to end */}
        <button
          type="button"
          onClick={() => seek(totalDurationMs)}
          title={t('player.forward')}
          className="transport-btn"
        >
          <SkipEndIcon size={16} />
        </button>
      </div>

      {/* Center Group: Monospace Timecode & Frame Number */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div
          className="timecode"
          style={{
            fontSize: 'var(--text-13)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}
        >
          <span style={{ color: 'var(--text-primary)' }}>{formatTimecode(currentTimeMs)}</span>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ color: 'var(--text-secondary)' }}>{formatTimecode(totalDurationMs)}</span>
        </div>

        <span
          className="timecode"
          style={{
            fontSize: 'var(--text-11)',
            color: 'var(--text-muted)',
            background: 'var(--bg-inset)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-sm)',
            padding: '2px 6px',
          }}
        >
          {t('player.frame_label')} {currentFrame}
        </span>

        {/* Canvas Ratio Selector Button (CapCut style) */}
        <div style={{ position: 'relative' }} ref={aspectMenuRef}>
          <button
            type="button"
            onClick={() => setShowAspectMenu((prev) => !prev)}
            title={t('transform.aspect_ratio') || 'Canvas aspect ratio'}
            className={`transport-btn ${showAspectMenu ? 'active' : ''}`}
            style={{
              width: 'auto',
              minWidth: '68px',
              height: '24px',
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              fontSize: 'var(--text-11)',
              borderRadius: 'var(--r-sm)',
              border: showAspectMenu ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              background: showAspectMenu ? 'var(--accent-muted)' : 'var(--bg-inset)',
              color: showAspectMenu ? 'var(--accent)' : 'var(--text-primary)',
              cursor: 'pointer',
              userSelect: 'none',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
          >
            <AspectRatioIcon size={13} style={{ color: 'var(--accent)' }} />
            <span>{project.aspect.label || project.aspect.id || '16:9'}</span>
            <span style={{ fontSize: '8px', opacity: 0.7 }}>▼</span>
          </button>

          {showAspectMenu && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '190px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-lg)',
                boxShadow: 'var(--shadow-3)',
                padding: 'var(--space-1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                zIndex: 100,
                backdropFilter: 'blur(16px)',
              }}
            >
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: 'var(--text-10)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-subtle)',
                  marginBottom: '2px',
                }}
              >
                {t('transform.aspect_ratio') || 'Canvas Ratio'}
              </div>
              {CANVAS_ASPECTS.map((p) => {
                const isActive = project.aspect.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setAspect({ id: p.id, label: p.label, ratio: p.ratio }, true);
                      setShowAspectMenu(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 'var(--r-md)',
                      background: isActive ? 'var(--accent-muted)' : 'transparent',
                      border: 'none',
                      color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-12)',
                      fontWeight: isActive ? 600 : 400,
                      textAlign: 'left',
                      transition: 'background var(--dur-fast) ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: `${Math.round(p.w * 0.85)}px`,
                          height: `${Math.round(p.h * 0.85)}px`,
                          border: `1.5px solid ${isActive ? 'var(--accent)' : 'var(--text-muted)'}`,
                          borderRadius: '1px',
                          display: 'inline-block',
                          flexShrink: 0,
                        }}
                      />
                      <span>{p.label}</span>
                    </div>
                    {isActive && <span style={{ fontSize: 'var(--text-12)', color: 'var(--accent)' }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Group: Auto-align (Snapping), Aspect Toggle, Volume, Loop, Fullscreen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        {/* Auto-alignment / Snapping Toggle */}
        <button
          type="button"
          onClick={toggleAutoAlign}
          title={autoAlignEnabled ? t('player.auto_align_on') : t('player.auto_align_off')}
          className={`transport-btn ${autoAlignEnabled ? 'active' : ''}`}
          aria-label={t('player.auto_align')}
        >
          <AutoAlignIcon size={16} />
        </button>

        {/* Toggle applied aspect vs original aspect */}
        <button
          type="button"
          onClick={toggleOriginalAspect}
          title={showOriginalAspect ? t('player.fit_preview') : t('player.original_preview')}
          className={`transport-btn ${showOriginalAspect ? 'active' : ''}`}
        >
          <AspectRatioIcon size={16} />
        </button>

        {/* Loop toggle */}
        <button
          type="button"
          onClick={toggleLoop}
          title={t('player.loop')}
          className={`transport-btn ${isLooping ? 'active' : ''}`}
        >
          <LoopIcon size={16} />
        </button>

        {/* Volume slider container */}
        <div
          style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
          onMouseEnter={() => setShowVolumeSlider(true)}
          onMouseLeave={() => setShowVolumeSlider(false)}
        >
          <button
            type="button"
            onClick={toggleMute}
            title={isMuted ? t('player.unmute') : t('player.mute')}
            className="transport-btn"
          >
            {isMuted || volume === 0 ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
          </button>

          {showVolumeSlider && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '120px',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-md)',
                boxShadow: 'var(--shadow-2)',
                zIndex: 100,
              }}
            >
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={setVolume}
              />
            </div>
          )}
        </div>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={() => setFullscreen(!isFullscreen)}
          title={isFullscreen ? t('player.exit_fullscreen') : t('player.fullscreen')}
          className="transport-btn"
        >
          {isFullscreen ? <FullscreenExitIcon size={16} /> : <FullscreenIcon size={16} />}
        </button>
      </div>

      <style>{`
        .transport-btn {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          border-radius: var(--r-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
        }
        .transport-btn:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }
        .transport-btn.active {
          color: var(--accent);
          background: var(--accent-muted);
        }
      `}</style>
    </div>
  );
};
