import React from 'react';
import { useProjectStore } from '../../stores/project';
import { Slider } from '../../components/Slider/Slider';
import { Select } from '../../components/Select/Select';
import {
  VolumeIcon,
  VolumeMuteIcon,
  LightningIcon,
  GaugeIcon,
  InfoIcon,
} from '../../components/icons';
import { t } from '../../shared/i18n';

export const AudioPanel: React.FC = () => {
  const { project, sources, activeClipId, setAudio, setClipVolume } = useProjectStore();

  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const activeSource = activeClip
    ? sources.find((s) => s.id === activeClip.sourceId)
    : sources[0];

  const audioSettings = project.audio;
  const audioStreams = activeSource?.probe.audio || [];
  const hasAudio = audioStreams.length > 0;

  // Track select options
  const trackOptions = audioStreams.map((stream, idx) => {
    const lang = stream.language ? ` (${stream.language.toUpperCase()})` : '';
    const title = stream.title ? ` - ${stream.title}` : '';
    const channels = stream.channels === 2 ? 'Stereo' : stream.channels === 1 ? 'Mono' : `${stream.channels}ch`;
    const label = `Track ${idx + 1}: ${channels}, ${stream.sampleRate}Hz, ${stream.codec.toUpperCase()}${lang}${title}`;
    return {
      value: idx.toString(),
      label,
    };
  });

  const isCopyMode =
    !audioSettings.muted &&
    audioSettings.volumeDb === 0 &&
    audioSettings.normalization === 'off';

  const handleVolumeChange = (volDb: number) => {
    setAudio({ volumeDb: volDb });
    if (activeClipId) {
      setClipVolume(activeClipId, volDb);
    }
  };

  const normOptions: { id: 'off' | 'web' | 'broadcast' | 'cinema'; label: string; desc: string }[] = [
    { id: 'off', label: t('audio.norm_off'), desc: 'Original dynamic range' },
    { id: 'web', label: t('audio.norm_web'), desc: 'YouTube, Spotify, TikTok' },
    { id: 'broadcast', label: t('audio.norm_broadcast'), desc: 'EBU R128 TV standard' },
    { id: 'cinema', label: t('audio.norm_cinema'), desc: 'Theatrical dynamic range' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        userSelect: 'none',
      }}
    >
      {/* Header & Mode Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 'var(--text-14)', fontWeight: 600, color: 'var(--text-primary)' }}>
          {t('audio.title')}
        </h3>

        {/* Lossless Copy vs Re-encode badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            background: isCopyMode ? 'var(--accent-muted)' : 'var(--bg-inset)',
            border: isCopyMode ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-full)',
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            color: isCopyMode ? 'var(--accent)' : 'var(--text-secondary)',
          }}
        >
          {isCopyMode ? <LightningIcon size={12} /> : <GaugeIcon size={12} />}
          <span>{isCopyMode ? t('audio.mode_copy') : t('audio.mode_reencode')}</span>
        </div>
      </div>

      {!hasAudio ? (
        <div
          style={{
            padding: 'var(--space-4)',
            background: 'var(--bg-inset)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-subtle)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-12)',
          }}
        >
          No audio tracks in this video file
        </div>
      ) : (
        <>
          {/* Audio Track Selection */}
          {audioStreams.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {t('audio.track_select')}
              </label>
              <Select
                value={audioSettings.trackIndex.toString()}
                options={trackOptions}
                onChange={(v) => setAudio({ trackIndex: parseInt(v, 10) || 0 })}
              />
            </div>
          )}

          {/* Volume Slider & dB readout */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              background: 'var(--bg-inset)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t('audio.volume')}
                </span>
                <button
                  type="button"
                  onClick={() => setAudio({ muted: !audioSettings.muted })}
                  aria-label={t('audio.mute_audio')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: audioSettings.muted ? 'var(--danger)' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  {audioSettings.muted ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
                </button>
              </div>

              {/* dB readout & reset button */}
              <button
                type="button"
                onClick={() => handleVolumeChange(0)}
                title="Reset volume to 0.0 dB"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--r-sm)',
                  padding: '2px 6px',
                  color: audioSettings.volumeDb !== 0 ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-11)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {audioSettings.volumeDb > 0 ? `+${audioSettings.volumeDb.toFixed(1)}` : audioSettings.volumeDb.toFixed(1)} dB
              </button>
            </div>

            <Slider
              value={audioSettings.volumeDb}
              min={-30}
              max={12}
              step={0.5}
              snapZero={true}
              snapThreshold={0.5}
              disabled={audioSettings.muted}
              onChange={handleVolumeChange}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--text-11)',
                color: 'var(--text-muted)',
              }}
            >
              <span>-30 dB</span>
              <span style={{ color: 'var(--text-secondary)' }}>0 dB (Normal)</span>
              <span>+12 dB</span>
            </div>
          </div>

          {/* Mute / Remove Audio Track Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              cursor: 'pointer',
              fontSize: 'var(--text-12)',
              color: audioSettings.muted ? 'var(--danger)' : 'var(--text-primary)',
            }}
          >
            <input
              type="checkbox"
              checked={audioSettings.muted}
              onChange={(e) => setAudio({ muted: e.target.checked })}
              style={{ accentColor: 'var(--danger)' }}
            />
            <span>{t('audio.mute_audio')}</span>
          </label>

          {/* Audio Normalization (EBU R128) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('audio.normalization')}
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {normOptions.map((opt) => {
                const isSelected = audioSettings.normalization === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudio({ normalization: opt.id })}
                    disabled={audioSettings.muted}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)',
                      background: isSelected ? 'var(--accent-muted)' : 'var(--bg-inset)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-md)',
                      cursor: audioSettings.muted ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                      transition: 'all var(--dur-fast) var(--ease-out)',
                      opacity: audioSettings.muted ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span
                        style={{
                          fontSize: 'var(--text-12)',
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                        }}
                      >
                        {opt.label}
                      </span>
                      <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>
                        {opt.desc}
                      </span>
                    </div>

                    {/* Radio indicator */}
                    <div
                      style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: 'var(--r-full)',
                        border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border-strong)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && (
                        <div
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: 'var(--r-full)',
                            background: 'var(--accent)',
                          }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Educational Hint Box */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--bg-inset)',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-11)',
                lineHeight: 1.4,
                marginTop: 'var(--space-1)',
              }}
            >
              <InfoIcon size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
              <span>{t('audio.norm_hint')}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
