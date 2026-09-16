import React, { useEffect, useState } from 'react';
import { Titlebar } from './Titlebar';
import { ToastContainer } from '../components/Toast/ToastContainer';
import { WhatsNewDrawer } from '../features/whats-new/WhatsNewDrawer';
import { SettingsModal } from '../features/settings/SettingsModal';
import { WelcomeScreen } from '../features/welcome/WelcomeScreen';
import { VideoPlayer } from '../features/player/VideoPlayer';
import { TransportControls } from '../features/player/TransportControls';
import { ClipStrip } from '../features/clips/ClipStrip';
import { Timeline } from '../features/timeline/Timeline';
import { PropertiesPanel } from '../features/properties/PropertiesPanel';
import { useProjectStore } from '../stores/project';
import { usePlayerStore } from '../stores/player';
import { useTimelineStore } from '../stores/timeline';
import { useUiStore } from '../stores/ui';
import { openVideoFileDialog } from '../shared/ipc';
import { subscribeLocale, formatTimecode, t } from '../../src/shared/i18n';
import { Button } from '../components/Button/Button';
import { TrashIcon, FilmIcon, LightningIcon } from '../components/icons';

export const App: React.FC = () => {
  const [, setLocaleTick] = useState(0);
  const {
    project,
    sources,
    activeClipId,
    addFiles,
    clearProject,
    splitClip,
    undo,
    redo,
  } = useProjectStore();
  const { toggleSnapping, zoomBy } = useTimelineStore();
  const {
    isFullscreen,
    togglePlay,
    pause,
    stepFrame,
    skipSeconds,
    seek,
    toggleMute,
    setFullscreen,
  } = usePlayerStore();
  const { setSettingsOpen } = useUiStore();

  // Re-render on locale changes
  useEffect(() => {
    return subscribeLocale(() => {
      setLocaleTick((t) => t + 1);
    });
  }, []);

  const totalDurationMs = project.clips.reduce(
    (sum, c) => (c.enabled ? sum + (c.outMs - c.inMs) : sum),
    0
  );

  // Keyboard navigation & Shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger transport shortcuts if an input/textarea is focused
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        const paths = await openVideoFileDialog();
        if (paths && paths.length > 0) {
          await addFiles(paths);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        pause();
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault();
        skipSeconds(-10);
      } else if (e.key.toLowerCase() === 'l') {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) skipSeconds(-1);
        else stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) skipSeconds(1);
        else stepFrame(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        seek(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        const total = project.clips.reduce((sum, c) => sum + (c.outMs - c.inMs), 0);
        seek(total);
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFullscreen(!isFullscreen);
      } else if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        setFullscreen(false);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleMute();
      } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (activeClipId) {
          const currentMs = usePlayerStore.getState().currentTimeMs;
          let accumulated = 0;
          for (const c of project.clips) {
            if (!c.enabled) continue;
            const duration = c.outMs - c.inMs;
            if (c.id === activeClipId) {
              if (currentMs > accumulated && currentMs < accumulated + duration) {
                const splitOffsetMs = currentMs - accumulated;
                splitClip(activeClipId, c.inMs + splitOffsetMs);
              }
              break;
            }
            accumulated += duration;
          }
        }
      } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleSnapping();
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(1.25, 400, 800, totalDurationMs);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomBy(0.8, 400, 800, totalDurationMs);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    addFiles,
    setSettingsOpen,
    togglePlay,
    pause,
    skipSeconds,
    stepFrame,
    seek,
    toggleMute,
    isFullscreen,
    setFullscreen,
    project.clips,
    activeClipId,
    splitClip,
    undo,
    redo,
    toggleSnapping,
    zoomBy,
    totalDurationMs,
  ]);

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
      {/* Titlebar (hidden in fullscreen preview mode) */}
      {!isFullscreen && (
        <Titlebar clipCount={project.clips.length} totalDurationMs={totalDurationMs} />
      )}

      {/* Main View Area */}
      {isWelcomeScreen ? (
        <WelcomeScreen />
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* Upper Section: Preview + Properties Panel */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {/* Center Preview Viewport */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <VideoPlayer />
            </div>

            {/* Properties Panel (Transform & Audio tabs) */}
            {!isFullscreen && <PropertiesPanel />}
          </div>

          {/* Transport Controls Bar (44px) */}
          <TransportControls />

          {/* Canvas-Based Timeline */}
          {!isFullscreen && <Timeline />}

          {/* Clips Strip (72px + banner) */}
          {!isFullscreen && <ClipStrip />}

          {/* Bottom Footer Action Bar (56px) (hidden in fullscreen) */}
          {!isFullscreen && (
            <footer
              style={{
                height: 'var(--footer-height)',
                background: 'var(--bg-surface)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--space-6)',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              {/* Left Result Summary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 'var(--text-13)', color: 'var(--text-secondary)' }}>
                  {t('editor.result_summary')}:
                </span>
                <span className="timecode" style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formatTimecode(totalDurationMs)}
                </span>
                <span>·</span>
                <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>
                  {sources[0]?.probe.video ? `${sources[0].probe.video.width}×${sources[0].probe.video.height}` : 'Auto'}
                </span>
              </div>

              {/* Mode Badge & Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    background: 'var(--bg-inset)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-full)',
                    color: 'var(--accent)',
                    fontSize: 'var(--text-12)',
                    fontWeight: 600,
                  }}
                >
                  <LightningIcon size={14} />
                  <span>{t('editor.fast_badge')}</span>
                </div>

                <Button variant="secondary" onClick={clearProject}>
                  <TrashIcon size={16} />
                  <span>{t('common.close')}</span>
                </Button>

                <Button variant="primary">
                  <FilmIcon size={16} />
                  <span>{t('editor.export_btn')}</span>
                </Button>
              </div>
            </footer>
          )}
        </div>
      )}

      {/* Global Drawers & Modals */}
      <WhatsNewDrawer />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
};
