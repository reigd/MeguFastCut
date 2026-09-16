import React from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { useTimelineStore } from '../../stores/timeline';
import { useHistoryStore } from '../../stores/history';
import { Button } from '../../components/Button/Button';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { ClipTimeInputs } from './ClipTimeInputs';
import {
  ScissorsIcon,
  UndoIcon,
  RedoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  ResizeIcon,
  MagnetIcon,
} from '../../components/icons';
import { t, formatTimecode } from '../../shared/i18n';

export const TimelineToolbar: React.FC = () => {
  const { project, activeClipId, splitClip, undo, redo } = useProjectStore();
  const { currentTimeMs } = usePlayerStore();
  const { canUndo, canRedo } = useHistoryStore();
  const {
    pixelsPerMs,
    snappingEnabled,
    toggleSnapping,
    zoomBy,
    fitToProject,
  } = useTimelineStore();

  const totalDurationMs = project.clips.reduce(
    (sum, c) => (c.enabled ? sum + (c.outMs - c.inMs) : sum),
    0
  );

  const handleSplit = () => {
    if (!activeClipId) return;
    let accumulated = 0;
    const activeClip = project.clips.find((c) => c.id === activeClipId);
    if (!activeClip) return;

    for (const c of project.clips) {
      if (!c.enabled) continue;
      const duration = c.outMs - c.inMs;
      if (c.id === activeClipId) {
        if (currentTimeMs > accumulated && currentTimeMs < accumulated + duration) {
          const splitOffsetMs = currentTimeMs - accumulated;
          const splitSourceTime = activeClip.inMs + splitOffsetMs;
          splitClip(activeClipId, splitSourceTime);
        }
        break;
      }
      accumulated += duration;
    }
  };

  const handleFit = () => {
    const canvasWidth = window.innerWidth - 312;
    fitToProject(totalDurationMs, Math.max(300, canvasWidth));
  };

  return (
    <div
      style={{
        height: '32px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-3)',
        userSelect: 'none',
      }}
    >
      {/* Left Action: Split, Undo, Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <Tooltip content={`${t('timeline.split_at_playhead')} (S)`}>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSplit}
            disabled={!activeClipId}
            aria-label={t('timeline.split_at_playhead')}
            style={{ padding: '4px 8px' }}
          >
            <ScissorsIcon size={14} />
            <span style={{ fontSize: 'var(--text-12)', fontWeight: 500 }}>
              {t('editor.split')}
            </span>
          </Button>
        </Tooltip>

        <div
          style={{
            width: '1px',
            height: '14px',
            background: 'var(--border-subtle)',
            margin: '0 2px',
          }}
        />

        <Tooltip content={`${t('common.undo')} (Ctrl+Z)`}>
          <Button
            size="sm"
            variant="ghost"
            onClick={undo}
            disabled={!canUndo}
            aria-label={t('common.undo')}
            style={{ padding: '4px 6px' }}
          >
            <UndoIcon size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={`${t('common.redo')} (Ctrl+Shift+Z)`}>
          <Button
            size="sm"
            variant="ghost"
            onClick={redo}
            disabled={!canRedo}
            aria-label={t('common.redo')}
            style={{ padding: '4px 6px' }}
          >
            <RedoIcon size={14} />
          </Button>
        </Tooltip>
      </div>

      {/* Center: Active Clip Numeric In/Out Inputs OR Sequence Timecode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {activeClipId ? (
          <ClipTimeInputs />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span
              className="timecode"
              style={{
                fontSize: 'var(--text-12)',
                color: 'var(--text-primary)',
                fontWeight: 600,
              }}
            >
              {formatTimecode(currentTimeMs)}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-12)' }}>/</span>
            <span
              className="timecode"
              style={{
                fontSize: 'var(--text-12)',
                color: 'var(--text-secondary)',
              }}
            >
              {formatTimecode(totalDurationMs)}
            </span>
          </div>
        )}
      </div>

      {/* Right Actions: Snapping & Zoom Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <Tooltip content={`${t('timeline.snap')} (N)`}>
          <Button
            size="sm"
            variant={snappingEnabled ? 'secondary' : 'ghost'}
            onClick={toggleSnapping}
            aria-label={t('timeline.snap')}
            style={{
              color: snappingEnabled ? 'var(--accent)' : 'var(--text-muted)',
              padding: '4px 8px',
            }}
          >
            <MagnetIcon size={14} />
          </Button>
        </Tooltip>

        <div
          style={{
            width: '1px',
            height: '14px',
            background: 'var(--border-subtle)',
            margin: '0 var(--space-1)',
          }}
        />

        <Tooltip content={t('timeline.zoom_out')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => zoomBy(0.8, 400, 800, totalDurationMs)}
            aria-label={t('timeline.zoom_out')}
            style={{ padding: '4px 6px' }}
          >
            <ZoomOutIcon size={14} />
          </Button>
        </Tooltip>

        <span
          className="tnum"
          style={{
            fontSize: 'var(--text-11)',
            color: 'var(--text-muted)',
            minWidth: '38px',
            textAlign: 'center',
          }}
        >
          {Math.round(pixelsPerMs * 1000)}px/s
        </span>

        <Tooltip content={t('timeline.zoom_in')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => zoomBy(1.25, 400, 800, totalDurationMs)}
            aria-label={t('timeline.zoom_in')}
            style={{ padding: '4px 6px' }}
          >
            <ZoomInIcon size={14} />
          </Button>
        </Tooltip>

        <Tooltip content={t('timeline.fit')}>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleFit}
            aria-label={t('timeline.fit')}
            style={{ padding: '4px 6px' }}
          >
            <ResizeIcon size={14} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
