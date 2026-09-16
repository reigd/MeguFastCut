import React, { useEffect, useState } from 'react';
import { Titlebar } from './Titlebar';
import { ToastContainer } from '../components/Toast/ToastContainer';
import { WhatsNewDrawer } from '../features/whats-new/WhatsNewDrawer';
import { SettingsModal } from '../features/settings/SettingsModal';
import { WelcomeScreen } from '../features/welcome/WelcomeScreen';
import { useProjectStore } from '../stores/project';
import { useUiStore } from '../stores/ui';
import { openVideoFileDialog } from '../shared/ipc';
import { t, subscribeLocale, formatTimecode } from '../shared/i18n';
import { Button } from '../components/Button/Button';
import { PlusIcon, TrashIcon, FilmIcon } from '../components/icons';

export const App: React.FC = () => {
  const [, setLocaleTick] = useState(0);
  const { project, addFiles, clearProject } = useProjectStore();
  const { setSettingsOpen } = useUiStore();

  // Re-render on locale changes
  useEffect(() => {
    return subscribeLocale(() => {
      setLocaleTick((t) => t + 1);
    });
  }, []);

  // Global keyboard shortcuts (Ctrl+O, Ctrl+,, etc.)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        const paths = await openVideoFileDialog();
        if (paths && paths.length > 0) {
          await addFiles(paths);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addFiles, setSettingsOpen]);

  const totalDurationMs = project.clips.reduce((sum, c) => sum + (c.outMs - c.inMs), 0);
  const isWelcomeScreen = project.clips.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {/* Custom Titlebar with dynamic clips count & duration */}
      <Titlebar clipCount={project.clips.length} totalDurationMs={totalDurationMs} />

      {/* Screen Views */}
      {isWelcomeScreen ? (
        <WelcomeScreen />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 'var(--space-6)',
            gap: 'var(--space-4)',
          }}
        >
          {/* Active project clips placeholder ready for Stage 3 & 4 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-4) var(--space-6)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <FilmIcon size={20} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 style={{ fontSize: 'var(--text-14)', fontWeight: 600 }}>
                  {t('titlebar.clips_count', { count: project.clips.length })}
                </h2>
                <span className="timecode" style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>
                  {t('titlebar.total_duration', { time: formatTimecode(totalDurationMs) })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const paths = await openVideoFileDialog();
                  if (paths && paths.length > 0) {
                    await addFiles(paths);
                  }
                }}
              >
                <PlusIcon size={16} />
                {t('editor.add_clip')}
              </Button>

              <Button size="sm" variant="ghost" onClick={clearProject}>
                <TrashIcon size={16} />
                {t('common.close')}
              </Button>
            </div>
          </div>

          {/* Clips List */}
          <div
            style={{
              flex: 1,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              padding: 'var(--space-4)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {project.clips.map((clip, idx) => {
              const src = useProjectStore.getState().sources.find((s) => s.id === clip.sourceId);
              return (
                <div
                  key={clip.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-muted)', minWidth: '24px' }}>
                      #{idx + 1}
                    </span>
                    <FilmIcon size={18} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 500, fontSize: 'var(--text-13)' }}>
                      {src?.filename || clip.id}
                    </span>
                    {src?.probe.video && (
                      <span
                        style={{
                          fontSize: 'var(--text-11)',
                          color: 'var(--text-muted)',
                          background: 'var(--bg-inset)',
                          padding: '2px 6px',
                          borderRadius: 'var(--r-sm)',
                        }}
                      >
                        {src.probe.video.width}×{src.probe.video.height} · {src.probe.video.codec.toUpperCase()} · {(src.probe.video.fpsNum / src.probe.video.fpsDen).toFixed(2)} fps
                      </span>
                    )}
                  </div>

                  <span className="timecode" style={{ fontSize: 'var(--text-12)', color: 'var(--accent)' }}>
                    {formatTimecode(clip.outMs - clip.inMs)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Global Drawers & Modals */}
      <WhatsNewDrawer />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
};
