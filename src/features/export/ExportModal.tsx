import React, { useState, useEffect } from 'react';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { Select, SelectOption } from '../../components/Select/Select';
import { Segmented } from '../../components/Segmented/Segmented';
import { Slider } from '../../components/Slider/Slider';
import { FilmIcon, FolderIcon, LightningIcon } from '../../components/icons';
import { useProjectStore } from '../../stores/project';
import { useSettingsStore } from '../../stores/settings';
import { useExportStore, generateDefaultOutputPath, getFormatExtension } from '../../stores/export';
import { saveExportFileDialog, getCapabilities, Capabilities } from '../../shared/ipc';
import { t } from '../../shared/i18n';
import { OutputSettings } from '../../shared/types';

export const ExportModal: React.FC = () => {
  const { isExportModalOpen, closeExportModal, startExportJob } = useExportStore();
  const { project, sources, setOutput } = useProjectStore();
  const { defaultOutputDir } = useSettingsStore();

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [selectedPath, setSelectedPath] = useState('');

  const firstSource = sources[0];

  useEffect(() => {
    getCapabilities().then(setCapabilities).catch(console.error);
  }, []);

  // Compute default path on modal open
  useEffect(() => {
    if (isExportModalOpen && firstSource) {
      const defaultPath =
        project.output.outputPath ||
        generateDefaultOutputPath(firstSource.path, project.output.format, defaultOutputDir);
      setSelectedPath(defaultPath);
    }
  }, [isExportModalOpen, firstSource, project.output.outputPath, project.output.format, defaultOutputDir]);

  const formatOptions: SelectOption<OutputSettings['format']>[] = [
    { value: 'mp4_h264', label: 'MP4 (H.264 / AVC)' },
    { value: 'mp4_hevc', label: 'MP4 (H.265 / HEVC)' },
    { value: 'webm_vp9', label: 'WebM (VP9)' },
    { value: 'webm_av1', label: 'WebM (AV1)' },
    { value: 'mov', label: 'QuickTime MOV (ProRes)' },
    { value: 'gif', label: 'GIF Animation' },
    { value: 'audio_mp3', label: 'MP3 Audio (.mp3)' },
    { value: 'audio_wav', label: 'WAV Lossless Audio (.wav)' },
    { value: 'audio_flac', label: 'FLAC Lossless Audio (.flac)' },
    { value: 'audio_aac', label: 'AAC Audio (.m4a)' },
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

  const handleFormatChange = (newFormat: OutputSettings['format']) => {
    setOutput({ format: newFormat });
    if (firstSource) {
      const updatedPath = generateDefaultOutputPath(firstSource.path, newFormat, defaultOutputDir);
      setSelectedPath(updatedPath);
      setOutput({ outputPath: updatedPath });
    }
  };

  const handleBrowse = async () => {
    const ext = getFormatExtension(project.output.format);
    const chosen = await saveExportFileDialog(selectedPath, ext);
    if (chosen) {
      setSelectedPath(chosen);
      setOutput({ outputPath: chosen });
    }
  };

  const handleStartExport = async () => {
    setOutput({ outputPath: selectedPath });
    await startExportJob(selectedPath);
  };

  const isAudioOnly = project.output.format.startsWith('audio_');
  const isGif = project.output.format === 'gif';

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
      width="540px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <Button variant="secondary" onClick={closeExportModal}>
            {t('export.cancel')}
          </Button>
          <Button variant="primary" onClick={handleStartExport}>
            <LightningIcon size={16} />
            <span>{t('export.start_export')}</span>
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', padding: 'var(--space-2) 0' }}>
        {/* Format */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('export.format')}
          </label>
          <Select
            value={project.output.format}
            options={formatOptions}
            onChange={handleFormatChange}
          />
        </div>

        {/* Video Quality (CRF) - hidden for audio-only and GIF */}
        {!isAudioOnly && !isGif && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

        {/* Resolution Mode - hidden for audio-only */}
        {!isAudioOnly && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

        {/* Hardware Acceleration - hidden for audio-only and GIF */}
        {!isAudioOnly && !isGif && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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

        {/* Destination Output Path */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-12)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('export.output_path')}
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <input
              type="text"
              readOnly
              value={selectedPath}
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
            <Button variant="secondary" onClick={handleBrowse}>
              <FolderIcon size={14} />
              <span>{t('export.browse')}</span>
            </Button>
          </div>
        </div>

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
