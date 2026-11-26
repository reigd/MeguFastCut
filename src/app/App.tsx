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
import { MediaLibrary } from '../features/media/MediaLibrary';
import { useProjectStore } from '../stores/project';
import { usePlayerStore } from '../stores/player';
import { useTimelineStore } from '../stores/timeline';
import { useUiStore } from '../stores/ui';
import { useHistoryStore } from '../stores/history';
import { openVideoFileDialog, getInitialLaunch, ExternalOpenPayload } from '../shared/ipc';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { subscribeLocale, formatTimecode, t } from '../../src/shared/i18n';
import {
  getClipDurationMs,
  getClipStartMs,
  getClipTrackIndex,
  getMaxTrackIndex,
  getTimelineTotalDurationMs,
  isImageSource,
} from '../shared/media-formats';
import {
  TRACK_GUTTER_WIDTH,
  computeTracksLayout,
  hitTestTrackAtY,
  pixelToTime,
} from '../features/timeline/timeline-types';
import { Button } from '../components/Button/Button';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { FilmIcon, LightningIcon, ReplaceIcon, CloseIcon, LayersIcon } from '../components/icons';
import { ExportModal } from '../features/export/ExportModal';
import { ExportProgressModal } from '../features/export/ExportProgressModal';
import { ExportCompleteModal } from '../features/export/ExportCompleteModal';
import { ReplaceConfirmModal } from '../features/replace/ReplaceConfirmModal';
import { useExportStore } from '../stores/export';

let externalOpenQueue: Promise<void> = Promise.resolve();
let initialLaunchConsumed = false;

export const App: React.FC = () => {
  const [, setLocaleTick] = useState(0);
  const {
    project,
    sources,
    activeClipId,
    isProjectOpen,
    createProject,
    addFiles,
    closeProject,
    splitClip,
    removeClip,
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
  const { setSettingsOpen, setReplaceConfirmOpen, addToast } = useUiStore();
  const { openExportModal } = useExportStore();

  const handleExternalOpen = React.useCallback((payload: ExternalOpenPayload) => {
    const validPaths = payload.paths.filter(Boolean);
    if (validPaths.length === 0) return;

    externalOpenQueue = externalOpenQueue
      .then(async () => {
        if (payload.mode === 'open') {
          useProjectStore.getState().clearProject();
          useHistoryStore.getState().clearHistory();
          usePlayerStore.getState().pause();
          usePlayerStore.getState().seek(0);
          await useProjectStore.getState().addFiles(validPaths);
        } else {
          const addedCount = await useProjectStore
            .getState()
            .addFiles(validPaths, { skipDraftRestore: true });
          if (addedCount > 0) {
            useUiStore.getState().addToast({
              message: t('clips.added_from_explorer', { count: addedCount }),
              durationMs: 3000,
            });
          }
        }
      })
      .catch((err) => {
        console.error('Failed to process external open request:', err);
      });
  }, []);

  // Attach single-instance listener before draining any cold-start launch batch
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen<ExternalOpenPayload>('external-open', (event) => {
      if (event.payload) {
        handleExternalOpen(event.payload);
      }
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        unlistenFn = unlisten;
        if (!initialLaunchConsumed) {
          initialLaunchConsumed = true;
          getInitialLaunch().then((payload) => {
            if (payload) {
              handleExternalOpen(payload);
            }
          });
        }
      })
      .catch((err) => {
        console.error('Failed to attach external-open listener:', err);
      });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [handleExternalOpen]);

  const [osDragZone, setOsDragZone] = useState<'media-library' | 'preview' | 'timeline' | 'window' | null>(null);

  // Native Tauri v2 OS file Drag & Drop (supports any photo, video, or audio file from Windows Explorer)
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    const resolveZoneAt = (physX: number, physY: number) => {
      const dpr = window.devicePixelRatio || 1;
      const x = physX / dpr;
      const y = physY / dpr;
      const el = document.elementFromPoint(x, y);
      const zoneEl = el?.closest('[data-drop-zone]') as HTMLElement | null;
      const zoneName = zoneEl?.getAttribute('data-drop-zone');
      return { x, y, zoneEl, zoneName };
    };

    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (cancelled) return;
          const payload = event.payload;
          if (payload.type === 'enter' || payload.type === 'over') {
            const { zoneName } = resolveZoneAt(payload.position.x, payload.position.y);
            if (zoneName === 'media-library' || zoneName === 'preview' || zoneName === 'timeline') {
              setOsDragZone(zoneName);
            } else {
              setOsDragZone('window');
            }
          } else if (payload.type === 'leave') {
            setOsDragZone(null);
          } else if (payload.type === 'drop') {
            setOsDragZone(null);
            const paths = payload.paths.filter(Boolean);
            if (paths.length === 0) return;

            const { x, y, zoneEl, zoneName } = resolveZoneAt(payload.position.x, payload.position.y);
            const projState = useProjectStore.getState();
            const isWelcome =
              !projState.isProjectOpen &&
              projState.project.clips.length === 0 &&
              projState.sources.length === 0;

            if (isWelcome) {
              void projState.addFiles(paths);
              return;
            }

            if (zoneName === 'media-library') {
              void projState.importSources(paths);
              return;
            }

            if (zoneName === 'preview') {
              if (projState.project.clips.length > 0) {
                const playheadMs = usePlayerStore.getState().currentTimeMs;
                void projState.addFilesAsOverlay(paths, playheadMs, 1);
              } else {
                void projState.addFiles(paths);
              }
              return;
            }

            if (zoneName === 'timeline' && zoneEl) {
              const rect = zoneEl.getBoundingClientRect();
              const localX = Math.max(0, x - rect.left - TRACK_GUTTER_WIDTH);
              const localY = y - rect.top;
              const tlState = useTimelineStore.getState();
              const dropTimeMs = Math.round(
                pixelToTime(localX, tlState.scrollOffsetMs, tlState.pixelsPerMs)
              );
              const maxTrack = getMaxTrackIndex(projState.project.clips);
              const layout = computeTracksLayout(maxTrack, rect.height, 0);
              const hitTrack = hitTestTrackAtY(layout, localY);

              if (hitTrack > 0) {
                void projState.addFilesAsOverlay(paths, dropTimeMs, hitTrack);
              } else {
                void projState.addFiles(paths);
              }
              return;
            }

            // Default fallback inside an open project: import into project Media Library
            void projState.importSources(paths);
          }
        })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
          } else {
            unlistenFn = unlisten;
          }
        })
        .catch(() => {
          // Running outside Tauri native webview (e.g. plain browser dev preview)
        });
    } catch {
      // Ignore outside Tauri runtime
    }

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, []);

  const handleReplaceClick = () => {
    const hasOverlays = project.clips.some((c) => getClipTrackIndex(c) > 0);
    if (sources.length !== 1 || hasOverlays || isImageSource(sources[0])) {
      addToast({
        message: t('replace.err_single_source_only'),
        durationMs: 4000,
      });
      return;
    }
    setReplaceConfirmOpen(true);
  };

  // Re-render on locale changes
  useEffect(() => {
    return subscribeLocale(() => {
      setLocaleTick((t) => t + 1);
    });
  }, []);

  const totalDurationMs = getTimelineTotalDurationMs(project.clips);

  const hasOverlays = project.clips.some((c) => c.enabled && getClipTrackIndex(c) > 0);
  const hasImages = project.clips.some((c) => {
    if (!c.enabled) return false;
    const src = sources.find((s) => s.id === c.sourceId);
    return isImageSource(src);
  });
  const enabledMainClips = project.clips.filter((c) => c.enabled && getClipTrackIndex(c) === 0);
  const isFastLosslessEligible =
    !hasOverlays &&
    !hasImages &&
    enabledMainClips.length === 1 &&
    project.aspect.id === 'original' &&
    project.fitMode === 'fit' &&
    !project.fitBounds &&
    !project.stretchBounds &&
    project.output.resolutionMode === 'auto' &&
    enabledMainClips[0].rotate === 0 &&
    !enabledMainClips[0].flipH &&
    !enabledMainClips[0].flipV &&
    Math.abs((enabledMainClips[0].speed ?? 1) - 1) < 0.001 &&
    (enabledMainClips[0].sharpness ?? 0) <= 0.001 &&
    Math.abs(project.audio.volumeDb) < 0.1 &&
    Math.abs(enabledMainClips[0].volumeDb) < 0.1 &&
    !project.audio.muted &&
    project.audio.normalization === 'off';


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

      const isKey = (code: string, keyChar?: string) =>
        e.code === code || (keyChar ? e.key.toLowerCase() === keyChar.toLowerCase() : false);
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;

      if (isCmdOrCtrl && isKey('KeyZ', 'z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (isCmdOrCtrl && isKey('KeyZ', 'z') && e.shiftKey) ||
        (isCmdOrCtrl && isKey('KeyY', 'y'))
      ) {
        e.preventDefault();
        redo();
      } else if (isCmdOrCtrl && isKey('KeyN', 'n')) {
        e.preventDefault();
        createProject();
      } else if (isCmdOrCtrl && isKey('KeyO', 'o')) {
        e.preventDefault();
        const paths = await openVideoFileDialog();
        if (paths && paths.length > 0) {
          await addFiles(paths);
        }
      } else if (isCmdOrCtrl && e.shiftKey && isKey('KeyS', 's')) {
        e.preventDefault();
        if (project.clips.length > 0) {
          handleReplaceClick();
        }
      } else if (isCmdOrCtrl && isKey('KeyE', 'e')) {
        e.preventDefault();
        if (project.clips.length > 0) {
          openExportModal();
        }
      } else if (isCmdOrCtrl && (e.code === 'Comma' || e.key === ',')) {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (isKey('KeyK', 'k')) {
        e.preventDefault();
        pause();
      } else if (isKey('KeyJ', 'j')) {
        e.preventDefault();
        skipSeconds(-10);
      } else if (isKey('KeyL', 'l')) {
        e.preventDefault();
        skipSeconds(10);
      } else if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) skipSeconds(-1);
        else stepFrame(-1);
      } else if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) skipSeconds(1);
        else stepFrame(1);
      } else if (e.code === 'Home' || e.key === 'Home') {
        e.preventDefault();
        seek(0);
      } else if (e.code === 'End' || e.key === 'End') {
        e.preventDefault();
        seek(totalDurationMs);
      } else if (isKey('KeyF', 'f')) {
        e.preventDefault();
        setFullscreen(!isFullscreen);
      } else if (e.code === 'Escape' || e.key === 'Escape') {
        if (isFullscreen) {
          e.preventDefault();
          setFullscreen(false);
        } else if (activeClipId) {
          e.preventDefault();
          useProjectStore.getState().setActiveClipId(null);
        }
      } else if (isKey('KeyM', 'm')) {
        e.preventDefault();
        toggleMute();
      } else if (isKey('KeyS', 's') && !isCmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        if (activeClipId) {
          const currentMs = usePlayerStore.getState().currentTimeMs;
          const targetClip = project.clips.find((c) => c.id === activeClipId && c.enabled);
          if (targetClip) {
            const cSpeed = targetClip.speed && targetClip.speed > 0 ? targetClip.speed : 1.0;
            const duration = getClipDurationMs(targetClip);
            const clipStart = getClipStartMs(targetClip, project.clips);
            if (currentMs > clipStart && currentMs < clipStart + duration) {
              const splitOffsetMs = currentMs - clipStart;
              const splitSourceTime = targetClip.inMs + Math.round(splitOffsetMs * cSpeed);
              splitClip(activeClipId, splitSourceTime);
            }
          }
        }
      } else if (isKey('KeyN', 'n') && !isCmdOrCtrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleSnapping();
      } else if (e.code === 'Equal' || e.key === '=' || e.key === '+') {
        e.preventDefault();
        zoomBy(1.25, 400, 800, totalDurationMs);
      } else if (e.code === 'Minus' || e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomBy(0.8, 400, 800, totalDurationMs);
      } else if (e.code === 'Delete' || e.code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') {
        if (!isCmdOrCtrl && !e.altKey && activeClipId) {
          const { isSettingsOpen, isExportOpen, isReplaceConfirmOpen, isShortcutsOpen, isWhatsNewOpen } =
            useUiStore.getState();
          if (!isSettingsOpen && !isExportOpen && !isReplaceConfirmOpen && !isShortcutsOpen && !isWhatsNewOpen) {
            e.preventDefault();
            removeClip(activeClipId);
          }
        }
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
    removeClip,
    undo,
    redo,
    toggleSnapping,
    zoomBy,
    totalDurationMs,
    openExportModal,
    createProject,
  ]);

  const isWelcomeScreen = !isProjectOpen && project.clips.length === 0 && sources.length === 0;

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
          {/* Upper Section: Media Library + Preview + Properties Panel */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {/* Left Media Library Panel (CapCut-style asset pool) */}
            {!isFullscreen && <MediaLibrary />}

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
                    color: isFastLosslessEligible ? 'var(--accent)' : 'var(--text-secondary)',
                    fontSize: 'var(--text-12)',
                    fontWeight: 600,
                  }}
                >
                  {isFastLosslessEligible ? <LightningIcon size={14} /> : <LayersIcon size={14} />}
                  <span>
                    {isFastLosslessEligible ? t('editor.fast_badge') : t('editor.reencode_badge')}
                  </span>
                </div>

                <Tooltip content={t('editor.close_tooltip')}>
                  <Button variant="secondary" onClick={closeProject}>
                    <CloseIcon size={16} />
                    <span>{t('common.close')}</span>
                  </Button>
                </Tooltip>

                <Tooltip
                  content={
                    sources.length !== 1 || hasOverlays || isImageSource(sources[0])
                      ? t('replace.err_single_source_only')
                      : 'Ctrl+Shift+S'
                  }
                >
                  <Button
                    variant="secondary"
                    disabled={
                      sources.length !== 1 ||
                      project.clips.length === 0 ||
                      hasOverlays ||
                      isImageSource(sources[0])
                    }
                    onClick={handleReplaceClick}
                  >
                    <ReplaceIcon size={16} />
                    <span>{t('editor.replace_btn')}</span>
                  </Button>
                </Tooltip>

                <Button variant="primary" onClick={openExportModal}>
                  <FilmIcon size={16} />
                  <span>{t('editor.export_btn')}</span>
                </Button>
              </div>
            </footer>
          )}
        </div>
      )}

      {/* Global OS Drag & Drop Indicator Banner */}
      {osDragZone && (
        <div
          style={{
            position: 'fixed',
            bottom: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2500,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '8px 16px',
            background: 'var(--bg-elevated)',
            border: '1.5px solid var(--accent)',
            borderRadius: 'var(--r-full)',
            boxShadow: 'var(--shadow-3)',
            color: 'var(--accent)',
            fontSize: 'var(--text-12)',
            fontWeight: 600,
          }}
        >
          <LayersIcon size={15} />
          <span>
            {osDragZone === 'preview' && project.clips.length > 0
              ? t('player.drop_as_overlay')
              : osDragZone === 'timeline'
                ? t('timeline.drop_os_hint')
                : t('media_library.drop_hint')}
          </span>
        </div>
      )}

      {/* Global Drawers & Modals */}
      <WhatsNewDrawer />
      <SettingsModal />
      <ExportModal />
      <ExportProgressModal />
      <ExportCompleteModal />
      <ReplaceConfirmModal />
      <ToastContainer />
    </div>
  );
};
