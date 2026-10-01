import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { Select, SelectOption } from '../../components/Select/Select';
import { Segmented } from '../../components/Segmented/Segmented';
import { Slider } from '../../components/Slider/Slider';
import { FilmIcon, FolderIcon, LightningIcon, MusicIcon } from '../../components/icons';
import { useProjectStore } from '../../stores/project';
import { useSettingsStore } from '../../stores/settings';
import {
  useExportStore,
  generateDefaultOutputPath,
  generateDefaultAudioOutputPath,
  getFormatExtension,
  getAudioExtension,
} from '../../stores/export';
import { saveExportFileDialog, getCapabilities, Capabilities } from '../../shared/ipc';
import { t } from '../../shared/i18n';
import { OutputSettings } from '../../shared/types';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, closeExportModal, startExportJob } = useExportStore();
  const { project, sources, setOutput } = useProjectStore();
  const { defaultOutputDir } = useSettingsStore();

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  const firstSource = sources[0];

  const exportVideo = project.output.exportVideo ?? !project.output.format.startsWith('audio_');
  const exportAudio = project.output.exportAudio ?? project.output.format.startsWith('audio_');

  const videoContainer =
    project.output.videoContainer ||
    (project.output.format === 'gif'
      ? 'gif'
      : project.output.format.startsWith('webm')
      ? 'webm'
      : project.output.format === 'mov'
      ? 'mov'
      : project.output.format === 'mkv'
      ? 'mkv'
      : project.output.format === 'avi'
      ? 'avi'
      : 'mp4');

  const videoCodec =
    project.output.videoCodec ||
    (project.output.format === 'mp4_hevc'
      ? 'hevc'
      : project.output.format === 'webm_av1'
      ? 'av1'
      : project.output.format === 'webm_vp9'
      ? 'vp9'
      : project.output.format === 'mov'
      ? 'prores'
      : project.output.format === 'copy'
      ? 'copy'
      : project.output.format === 'gif'
      ? 'gif'
      : 'h264');

  const audioCodec =
    project.output.audioCodec || (videoContainer === 'webm' ? 'opus' : 'aac');

  const audioFormat =
    project.output.audioFormat ||
    (project.output.format === 'audio_wav'
      ? 'wav'
      : project.output.format === 'audio_flac'
      ? 'flac'
      : project.output.format === 'audio_aac'
      ? 'm4a'
      : project.output.format === 'audio_ogg'
      ? 'ogg'
      : 'mp3');

  const audioBitrate = project.output.audioBitrate || '320k';

  const [videoPath, setVideoPath] = useState('');
  const [audioPath, setAudioPath] = useState('');

  useEffect(() => {
    getCapabilities().then(setCapabilities).catch(console.error);
  }, []);

  // Initialize paths on modal open
  useEffect(() => {
    if (isExportModalOpen && firstSource) {
      const vPath =
        project.output.videoOutputPath ||
        project.output.outputPath ||
        generateDefaultOutputPath(firstSource.path, videoContainer, defaultOutputDir);
      setVideoPath(vPath);

      const aPath =
        project.output.audioOutputPath ||
        generateDefaultAudioOutputPath(firstSource.path, audioFormat, defaultOutputDir);
      setAudioPath(aPath);
    }
  }, [
    isExportModalOpen,
    firstSource,
    videoContainer,
    audioFormat,
    defaultOutputDir,
    project.output.videoOutputPath,
    project.output.audioOutputPath,
    project.output.outputPath,
  ]);

  const handleToggleVideo = (nextVal: boolean) => {
    if (!nextVal && !exportAudio) return; // Prevent disabling both targets
    setOutput({ exportVideo: nextVal });
  };

  const handleToggleAudio = (nextVal: boolean) => {
    if (!nextVal && !exportVideo) return; // Prevent disabling both targets
    setOutput({ exportAudio: nextVal });
  };

  const containerOptions: SelectOption<string>[] = [
    { value: 'mp4', label: 'MP4 (.mp4)' },
    { value: 'mkv', label: 'MKV (.mkv)' },
    { value: 'mov', label: 'MOV (.mov)' },
    { value: 'webm', label: 'WebM (.webm)' },
    { value: 'avi', label: 'AVI (.avi)' },
    { value: 'gif', label: 'GIF Animation (.gif)' },
  ];

  const getVideoCodecOptions = (container: string): SelectOption<string>[] => {
    switch (container) {
      case 'webm':
        return [
          { value: 'vp9', label: 'VP9 (Web Standard)' },
          { value: 'av1', label: 'AV1 (Next-Gen)' },
        ];
      case 'mov':
        return [
          { value: 'h264', label: 'H.264 / AVC' },
          { value: 'hevc', label: 'H.265 / HEVC' },
          { value: 'prores', label: 'Apple ProRes 422 HQ' },
          { value: 'copy', label: 'Stream Copy (No Re-encode)' },
        ];
      case 'mkv':
        return [
          { value: 'h264', label: 'H.264 / AVC' },
          { value: 'hevc', label: 'H.265 / HEVC' },
          { value: 'av1', label: 'AV1' },
          { value: 'prores', label: 'Apple ProRes 422 HQ' },
          { value: 'copy', label: 'Stream Copy (No Re-encode)' },
        ];
      case 'avi':
        return [
          { value: 'h264', label: 'H.264' },
          { value: 'copy', label: 'Stream Copy (No Re-encode)' },
        ];
      case 'gif':
        return [{ value: 'gif', label: 'GIF Palette' }];
      case 'mp4':
      default:
        return [
          { value: 'h264', label: 'H.264 / AVC' },
          { value: 'hevc', label: 'H.265 / HEVC' },
          { value: 'av1', label: 'AV1' },
          { value: 'copy', label: 'Stream Copy (No Re-encode)' },
        ];
    }
  };

  const getVideoAudioCodecOptions = (container: string): SelectOption<string>[] => {
    switch (container) {
      case 'webm':
        return [{ value: 'opus', label: 'Opus' }];
      case 'mov':
        return [
          { value: 'aac', label: 'AAC (Default)' },
          { value: 'pcm', label: 'PCM 16-bit (Lossless)' },
          { value: 'copy', label: 'Stream Copy' },
        ];
      case 'mkv':
        return [
          { value: 'aac', label: 'AAC (Default)' },
          { value: 'opus', label: 'Opus' },
          { value: 'pcm', label: 'PCM 16-bit (Lossless)' },
          { value: 'mp3', label: 'MP3' },
          { value: 'copy', label: 'Stream Copy' },
        ];
      case 'avi':
        return [
          { value: 'mp3', label: 'MP3 (Default)' },
          { value: 'pcm', label: 'PCM 16-bit (Lossless)' },
          { value: 'copy', label: 'Stream Copy' },
        ];
      case 'mp4':
      default:
        return [
          { value: 'aac', label: 'AAC (Default)' },
          { value: 'mp3', label: 'MP3' },
          { value: 'opus', label: 'Opus' },
          { value: 'copy', label: 'Stream Copy' },
        ];
    }
  };

  const audioFormatOptions: SelectOption<string>[] = [
    { value: 'mp3', label: 'MP3 (.mp3)' },
    { value: 'wav', label: 'WAV (.wav) — PCM Lossless' },
    { value: 'flac', label: 'FLAC (.flac) — Lossless' },
    { value: 'm4a', label: 'AAC / M4A (.m4a)' },
    { value: 'ogg', label: 'OGG / Opus (.ogg)' },
  ];

  const audioBitrateOptions: SelectOption<string>[] = [
    { value: '320k', label: '320 kbps (High Quality)' },
    { value: '256k', label: '256 kbps (Very Good)' },
    { value: '192k', label: '192 kbps (Standard)' },
    { value: '128k', label: '128 kbps (Voice / Compact)' },
  ];

  const resolutionOptions: SelectOption<OutputSettings['resolutionMode']>[] = [
    { value: 'auto', label: t('transform.res_auto') },
    { value: '2160p', label: '4K UHD (2160p)' },
    { value: '1440p', label: '2K QHD (1440p)' },
    { value: '1080p', label: 'Full HD (1080p)' },
    { value: '720p', label: 'HD (720p)' },
    { value: '480p', label: 'SD (480p)' },
  ];

  const hwOptions: SelectOption<OutputSettings['hardwareAccel']>[] = [
    {
      value: 'auto',
      label: `Auto (${capabilities ? capabilities.recommended_hw.toUpperCase() : 'Detecting'})`,
    },
    { value: 'nvenc', label: 'NVIDIA NVENC' },
    { value: 'qsv', label: 'Intel QuickSync (QSV)' },
    { value: 'amf', label: 'AMD AMF' },
    { value: 'cpu', label: 'Software (CPU)' },
  ];

  const handleContainerChange = (newContainer: string) => {
    const validCodecs = getVideoCodecOptions(newContainer).map((o) => o.value);
    const validCodec = validCodecs.includes(videoCodec) ? videoCodec : validCodecs[0];

    const validAudioCodecs = getVideoAudioCodecOptions(newContainer).map((o) => o.value);
    const validAudioCodec = validAudioCodecs.includes(audioCodec) ? audioCodec : validAudioCodecs[0];

    const ext = getFormatExtension(newContainer);
    const newVideoPath = videoPath
      ? videoPath.replace(/\.[^/.\\]+$/, `.${ext}`)
      : firstSource
      ? generateDefaultOutputPath(firstSource.path, newContainer, defaultOutputDir)
      : '';

    setVideoPath(newVideoPath);
    setOutput({
      videoContainer: newContainer,
      videoCodec: validCodec,
      audioCodec: validAudioCodec,
      videoOutputPath: newVideoPath,
      format: newContainer === 'gif' ? 'gif' : `${newContainer}_${validCodec}`,
    });
  };

  const handleAudioFormatChange = (newFormat: string) => {
    const ext = getAudioExtension(newFormat);
    const newAudioPath = audioPath
      ? audioPath.replace(/\.[^/.\\]+$/, `.${ext}`)
      : firstSource
      ? generateDefaultAudioOutputPath(firstSource.path, newFormat, defaultOutputDir)
      : '';

    setAudioPath(newAudioPath);
    setOutput({
      audioFormat: newFormat,
      audioOutputPath: newAudioPath,
    });
  };

  const handleBrowseVideo = async () => {
    const ext = getFormatExtension(videoContainer);
    const chosen = await saveExportFileDialog(videoPath, ext);
    if (chosen) {
      setVideoPath(chosen);
      setOutput({ videoOutputPath: chosen });
    }
  };

  const handleBrowseAudio = async () => {
    const ext = getAudioExtension(audioFormat);
    const chosen = await saveExportFileDialog(audioPath, ext);
    if (chosen) {
      setAudioPath(chosen);
      setOutput({ audioOutputPath: chosen });
    }
  };

  const handleStartExport = async () => {
    setOutput({
      exportVideo,
      exportAudio,
      videoContainer,
      videoCodec,
      audioCodec,
      audioFormat,
      audioBitrate,
      videoOutputPath: videoPath,
      audioOutputPath: audioPath,
      outputPath: exportVideo ? videoPath : audioPath,
      format: exportVideo
        ? videoContainer === 'gif'
          ? 'gif'
          : `${videoContainer}_${videoCodec}`
        : `audio_${audioFormat}`,
    });
    await startExportJob(videoPath, audioPath);
  };

  const isGif = videoContainer === 'gif';
  const isVideoCopy = videoCodec === 'copy';
  const isAudioLossless = audioFormat === 'wav' || audioFormat === 'flac';

  const buttonText =
    exportVideo && exportAudio
      ? t('export.start_export_both')
      : exportAudio
      ? t('export.start_export_audio')
      : t('export.start_export_video');

  return (
    <Modal
      isOpen={isExportModalOpen}
      onClose={closeExportModal}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FilmIcon size={18} />
          <span>{t('export.title')}</span>
        </div>
      }
      width="580px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={closeExportModal}>
            {t('export.cancel')}
          </Button>
          <Button variant="primary" onClick={handleStartExport}>
            <LightningIcon size={16} />
            <span>{buttonText}</span>
          </Button>
        </div>
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          padding: 'var(--space-1) 0',
          maxHeight: '72vh',
          overflowY: 'auto',
          paddingRight: 'var(--space-2)',
        }}
      >
        {/* Target Selection: Video / Audio / Both */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('export.targets_title')}
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
            {/* Target 1: Video (with audio) */}
            <div
              onClick={() => handleToggleVideo(!exportVideo)}
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${exportVideo ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: exportVideo ? 'var(--accent-subtle, rgba(235, 94, 40, 0.08))' : 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={exportVideo}
                onChange={(e) => handleToggleVideo(e.target.checked)}
                style={{ accentColor: 'var(--accent)', marginTop: '2px', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: 'var(--text-13)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <FilmIcon size={15} />
                  <span>{t('export.target_video')}</span>
                </div>
                <div style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {t('export.target_video_desc')}
                </div>
              </div>
            </div>

            {/* Target 2: Audio Only */}
            <div
              onClick={() => handleToggleAudio(!exportAudio)}
              style={{
                padding: 'var(--space-3)',
                borderRadius: 'var(--r-md)',
                border: `1px solid ${exportAudio ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: exportAudio ? 'var(--accent-subtle, rgba(235, 94, 40, 0.08))' : 'var(--bg-card)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                transition: 'all 0.15s ease',
              }}
            >
              <input
                type="checkbox"
                checked={exportAudio}
                onChange={(e) => handleToggleAudio(e.target.checked)}
                style={{ accentColor: 'var(--accent)', marginTop: '2px', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 600,
                    fontSize: 'var(--text-13)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <MusicIcon size={15} />
                  <span>{t('export.target_audio')}</span>
                </div>
                <div style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {t('export.target_audio_desc')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: Video Settings (if exportVideo enabled) */}
        {exportVideo && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-13)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 'var(--space-2)',
              }}
            >
              <FilmIcon size={15} />
              <span>{t('export.video_section')}</span>
            </div>

            {/* Container and Video Codec side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.video_container')}
                </label>
                <Select
                  value={videoContainer}
                  options={containerOptions}
                  onChange={handleContainerChange}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.video_codec')}
                </label>
                <Select
                  value={videoCodec}
                  options={getVideoCodecOptions(videoContainer)}
                  onChange={(val) => {
                    setOutput({
                      videoCodec: val,
                      format: videoContainer === 'gif' ? 'gif' : `${videoContainer}_${val}`,
                    });
                  }}
                />
              </div>
            </div>

            {/* Video Audio Codec (if not GIF and not copy) */}
            {!isGif && !isVideoCopy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.video_audio_codec')}
                </label>
                <Select
                  value={audioCodec}
                  options={getVideoAudioCodecOptions(videoContainer)}
                  onChange={(val) => setOutput({ audioCodec: val })}
                />
              </div>
            )}

            {/* Video Quality (CRF) - hidden for copy and GIF */}
            {!isVideoCopy && !isGif && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.quality')}
                </label>
                <Segmented
                  value={project.output.quality}
                  options={[
                    { value: 'high', label: t('export.quality_high') },
                    { value: 'balanced', label: t('export.quality_balanced') },
                    { value: 'small', label: t('export.quality_small') },
                    { value: 'custom', label: t('export.quality_custom') },
                  ]}
                  onChange={(val) => setOutput({ quality: val as OutputSettings['quality'] })}
                />

                {project.output.quality === 'custom' && (
                  <div style={{ marginTop: 'var(--space-2)' }}>
                    <div style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      CRF: {project.output.crf ?? 23}
                    </div>
                    <Slider
                      min={10}
                      max={45}
                      step={1}
                      value={project.output.crf ?? 23}
                      unit=""
                      onChange={(val) => setOutput({ crf: val })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Resolution Mode - hidden for copy and GIF */}
            {!isVideoCopy && !isGif && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('transform.output_resolution')}
                </label>
                <Select
                  value={project.output.resolutionMode}
                  options={resolutionOptions}
                  onChange={(val) => setOutput({ resolutionMode: val })}
                />
              </div>
            )}

            {/* Hardware Acceleration - hidden for copy and GIF */}
            {!isVideoCopy && !isGif && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.hw_accel')}
                </label>
                <Select
                  value={project.output.hardwareAccel}
                  options={hwOptions}
                  onChange={(val) => setOutput({ hardwareAccel: val })}
                />
              </div>
            )}

            {/* Video Output Path */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('export.video_output_path')}
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  readOnly
                  value={videoPath}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-12)',
                    padding: 'var(--space-2) var(--space-3)',
                    textOverflow: 'ellipsis',
                    outline: 'none',
                  }}
                />
                <Button variant="secondary" onClick={handleBrowseVideo}>
                  <FolderIcon size={14} />
                  <span>{t('export.browse')}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: Standalone Audio Settings (if exportAudio enabled) */}
        {exportAudio && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-13)',
                fontWeight: 600,
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 'var(--space-2)',
              }}
            >
              <MusicIcon size={15} />
              <span>{t('export.audio_section')}</span>
            </div>

            {/* Audio Format and Bitrate side-by-side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.audio_format')}
                </label>
                <Select
                  value={audioFormat}
                  options={audioFormatOptions}
                  onChange={handleAudioFormatChange}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {t('export.audio_bitrate')}
                </label>
                {isAudioLossless ? (
                  <div
                    style={{
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0 var(--space-3)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--r-md)',
                      fontSize: 'var(--text-12)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {t('export.audio_bitrate_lossless')}
                  </div>
                ) : (
                  <Select
                    value={audioBitrate}
                    options={audioBitrateOptions}
                    onChange={(val) => setOutput({ audioBitrate: val })}
                  />
                )}
              </div>
            </div>

            {/* Audio Output Path */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {t('export.audio_output_path')}
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  readOnly
                  value={audioPath}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-12)',
                    padding: 'var(--space-2) var(--space-3)',
                    textOverflow: 'ellipsis',
                    outline: 'none',
                  }}
                />
                <Button variant="secondary" onClick={handleBrowseAudio}>
                  <FolderIcon size={14} />
                  <span>{t('export.browse')}</span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Open folder after export checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-13)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            userSelect: 'none',
            marginTop: 'var(--space-1)',
          }}
        >
          <input
            type="checkbox"
            checked={project.output.openFolderAfter}
            onChange={(e) => setOutput({ openFolderAfter: e.target.checked })}
            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
          <span>{t('export.open_folder_after')}</span>
        </label>
      </div>
    </Modal>
  );
};
