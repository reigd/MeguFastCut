import React, { useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { TransformPanel } from '../transform/TransformPanel';
import { VideoEditPanel } from '../video/VideoEditPanel';
import { AudioPanel } from '../audio/AudioPanel';
import { Button } from '../../components/Button/Button';
import {
  PlusIcon,
  AspectRatioIcon,
  SlidersIcon,
  MusicIcon,
} from '../../components/icons';
import { openVideoFileDialog } from '../../shared/ipc';
import { getClipTrackIndex, isImageSource } from '../../shared/media-formats';
import { t } from '../../shared/i18n';

type TabType = 'transform' | 'video' | 'audio';

export const PropertiesPanel: React.FC = () => {
  const { project, sources, activeClipId, addFiles } = useProjectStore();
  const [activeTab, setActiveTab] = useState<TabType>('transform');

  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const activeSource = activeClip ? sources.find((s) => s.id === activeClip.sourceId) : sources[0];
  const activeTrackIndex = activeClip ? getClipTrackIndex(activeClip) : 0;
  const activeIsImage = isImageSource(activeSource);

  return (
    <aside
      aria-label={t('editor.properties')}
      style={{
        width: 'var(--properties-width)',
        background: 'var(--bg-surface)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        padding: 'var(--space-4)',
        overflowY: 'auto',
        flexShrink: 0,
        gap: 'var(--space-4)',
      }}
    >
      {/* Header with Title & Add Clip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 'var(--text-14)', fontWeight: 600 }}>
          {t('editor.properties')}
        </h2>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const paths = await openVideoFileDialog();
            if (paths && paths.length > 0) {
              await addFiles(paths);
            }
          }}
        >
          <PlusIcon size={14} />
          <span>{t('editor.add_clip')}</span>
        </Button>
      </div>

      {/* Active Clip Summary Card */}
      <div
        style={{
          padding: 'var(--space-3)',
          background: 'var(--bg-inset)',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          {activeTrackIndex > 0 && (
            <span
              className="timecode"
              style={{
                flexShrink: 0,
                fontSize: 'var(--text-10)',
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 'var(--r-xs)',
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)',
              }}
            >
              V{activeTrackIndex + 1}
            </span>
          )}
          <span
            style={{
              fontSize: 'var(--text-12)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {activeSource?.filename || sources[0]?.filename}
          </span>
        </div>
        {activeSource?.probe.video && (
          <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-secondary)' }}>
            {activeSource.probe.video.width}×{activeSource.probe.video.height} ·{' '}
            {activeSource.probe.video.codec.toUpperCase()} ·{' '}
            {activeIsImage
              ? t('media_library.filter_photo')
              : `${(activeSource.probe.video.fpsNum / activeSource.probe.video.fpsDen).toFixed(2)} fps`}
          </span>
        )}
      </div>

      {/* Section Tabs Switcher */}
      <div
        role="tablist"
        aria-label={t('editor.properties')}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          background: 'var(--bg-inset)',
          padding: '3px',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-subtle)',
          gap: '2px',
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'transform'}
          data-testid="properties-tab-transform"
          title={t('transform.title')}
          onClick={() => setActiveTab('transform')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            height: '28px',
            padding: '0 6px',
            background: activeTab === 'transform' ? 'var(--bg-surface)' : 'transparent',
            border: activeTab === 'transform' ? '1px solid var(--border-subtle)' : '1px solid transparent',
            borderRadius: 'var(--r-sm)',
            color: activeTab === 'transform' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            fontWeight: activeTab === 'transform' ? 600 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: activeTab === 'transform' ? 'var(--shadow-1)' : 'none',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          <AspectRatioIcon size={13} style={{ flexShrink: 0 }} />
          <span>{t('properties.tab_framing')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'video'}
          data-testid="properties-tab-video"
          title={t('video_edit.title')}
          onClick={() => setActiveTab('video')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            height: '28px',
            padding: '0 6px',
            background: activeTab === 'video' ? 'var(--bg-surface)' : 'transparent',
            border: activeTab === 'video' ? '1px solid var(--border-subtle)' : '1px solid transparent',
            borderRadius: 'var(--r-sm)',
            color: activeTab === 'video' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            fontWeight: activeTab === 'video' ? 600 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: activeTab === 'video' ? 'var(--shadow-1)' : 'none',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          <SlidersIcon size={13} style={{ flexShrink: 0 }} />
          <span>{t('properties.tab_video')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'audio'}
          data-testid="properties-tab-audio"
          title={t('audio.title')}
          onClick={() => setActiveTab('audio')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            height: '28px',
            padding: '0 6px',
            background: activeTab === 'audio' ? 'var(--bg-surface)' : 'transparent',
            border: activeTab === 'audio' ? '1px solid var(--border-subtle)' : '1px solid transparent',
            borderRadius: 'var(--r-sm)',
            color: activeTab === 'audio' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            fontWeight: activeTab === 'audio' ? 600 : 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: activeTab === 'audio' ? 'var(--shadow-1)' : 'none',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          <MusicIcon size={13} style={{ flexShrink: 0 }} />
          <span>{t('properties.tab_audio')}</span>
        </button>
      </div>

      {/* Active Tab Panel */}
      {activeTab === 'transform' && <TransformPanel />}
      {activeTab === 'video' && <VideoEditPanel />}
      {activeTab === 'audio' && <AudioPanel />}
    </aside>
  );
};
