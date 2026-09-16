import React, { useState } from 'react';
import { useProjectStore } from '../../stores/project';
import { TransformPanel } from '../transform/TransformPanel';
import { AudioPanel } from '../audio/AudioPanel';
import { Button } from '../../components/Button/Button';
import {
  PlusIcon,
  AspectRatioIcon,
  MusicIcon,
} from '../../components/icons';
import { openVideoFileDialog } from '../../shared/ipc';
import { t } from '../../shared/i18n';

type TabType = 'transform' | 'audio';

export const PropertiesPanel: React.FC = () => {
  const { project, sources, activeClipId, addFiles } = useProjectStore();
  const [activeTab, setActiveTab] = useState<TabType>('transform');

  const activeClip = project.clips.find((c) => c.id === activeClipId);
  const activeSource = activeClip ? sources.find((s) => s.id === activeClip.sourceId) : sources[0];

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
        {activeSource?.probe.video && (
          <span style={{ fontSize: 'var(--text-11)', color: 'var(--text-muted)' }}>
            {activeSource.probe.video.width}×{activeSource.probe.video.height} ·{' '}
            {activeSource.probe.video.codec.toUpperCase()} ·{' '}
            {(activeSource.probe.video.fpsNum / activeSource.probe.video.fpsDen).toFixed(2)} fps
          </span>
        )}
      </div>

      {/* Section Tabs Switcher */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          background: 'var(--bg-inset)',
          padding: '3px',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border-subtle)',
          gap: '2px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('transform')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '28px',
            background: activeTab === 'transform' ? 'var(--bg-surface)' : 'transparent',
            border: activeTab === 'transform' ? '1px solid var(--border-subtle)' : 'none',
            borderRadius: 'var(--r-sm)',
            color: activeTab === 'transform' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            fontWeight: activeTab === 'transform' ? 600 : 500,
            cursor: 'pointer',
            boxShadow: activeTab === 'transform' ? 'var(--shadow-1)' : 'none',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          <AspectRatioIcon size={14} />
          <span>{t('transform.title')}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audio')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '28px',
            background: activeTab === 'audio' ? 'var(--bg-surface)' : 'transparent',
            border: activeTab === 'audio' ? '1px solid var(--border-subtle)' : 'none',
            borderRadius: 'var(--r-sm)',
            color: activeTab === 'audio' ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 'var(--text-12)',
            fontWeight: activeTab === 'audio' ? 600 : 500,
            cursor: 'pointer',
            boxShadow: activeTab === 'audio' ? 'var(--shadow-1)' : 'none',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          <MusicIcon size={14} />
          <span>{t('audio.title')}</span>
        </button>
      </div>

      {/* Active Tab Panel */}
      {activeTab === 'transform' ? <TransformPanel /> : <AudioPanel />}
    </aside>
  );
};
