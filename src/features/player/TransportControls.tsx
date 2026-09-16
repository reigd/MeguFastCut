import React, { useState } from 'react';
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
} from '../../components/icons';

export const TransportControls: React.FC = () => {
  const { project, sources } = useProjectStore();
  const {
    currentTimeMs,
    isPlaying,
    isMuted,
    volume,
    isLooping,
    showOriginalAspect,
    isFullscreen,
    togglePlay,
    pause,
    seek,
    stepFrame,
    skipSeconds,
    toggleMute,
    setVolume,
    toggleLoop,
    toggleOriginalAspect,
    setFullscreen,
  } = usePlayerStore();

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  // Total project duration
  const totalDurationMs = project.clips.reduce((sum, c) => sum + (c.outMs - c.inMs), 0);

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
      </div>

      {/* Right Group: Aspect Toggle, Volume, Loop, Fullscreen */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
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
