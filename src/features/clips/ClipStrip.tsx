import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { useUiStore } from '../../stores/ui';
import { openVideoFileDialog } from '../../shared/ipc';
import { t } from '../../shared/i18n';
import { ClipCard } from './ClipCard';
import { CompatibilityBanner } from './CompatibilityBanner';
import { PlusIcon, TransitionIcon } from '../../components/icons';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { getClipTrackIndex } from '../../shared/media-formats';
import {
  computeMainTrackTiming,
  createDefaultTransition,
  isActiveTransition,
} from '../../shared/transitions';
import { getDraggingTransitionType, setDraggingTransitionType } from '../../shared/drag-state';
import { TransitionType } from '../../shared/types';

export const ClipStrip: React.FC = () => {
  const { project, sources, addFiles, reorderClips, setActiveClipId, setClipTransitionIn } =
    useProjectStore();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragTargetIdx, setDragTargetIdx] = useState<number | null>(null);
  const [isStripDragOver, setIsStripDragOver] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mainTiming = computeMainTrackTiming(project.clips);
  const timingMap = new Map(mainTiming.items.map((it) => [it.clip.id, it]));

  // Clip Reordering Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOverCard = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdx !== null && draggedIdx !== index) {
      setDragTargetIdx(index);
    }
  };

  const handleDropOnCard = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIdx !== null && draggedIdx !== targetIndex) {
      reorderClips(draggedIdx, targetIndex);
    }
    setDraggedIdx(null);
    setDragTargetIdx(null);
  };

  // Dropping new files into the strip
  const handleStripDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsStripDragOver(true);
  };

  const handleStripDragLeave = () => {
    setIsStripDragOver(false);
  };

  const handleStripDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsStripDragOver(false);
    setDraggedIdx(null);
    setDragTargetIdx(null);

    // Check if source from MediaLibrary was dropped
    const sourceId = e.dataTransfer.getData('megu/source-id');
    if (sourceId) {
      useProjectStore.getState().addClipFromSource(sourceId);
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path || f.name)
        .filter(Boolean);
      if (paths.length > 0) {
        await addFiles(paths);
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: '0 var(--space-4)',
        background: 'var(--bg-base)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Compatibility Banner (if clips have mismatching parameters) */}
      <CompatibilityBanner />

      {/* Horizontal Clips Strip (72px) */}
      <div
        ref={containerRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            useProjectStore.getState().setActiveClipId(null);
          }
        }}
        onDragOver={handleStripDragOver}
        onDragLeave={handleStripDragLeave}
        onDrop={handleStripDrop}
        style={{
          height: 'var(--cliplist-height)',
          background: isStripDragOver ? 'var(--accent-muted)' : 'var(--bg-surface)',
          border: `1px solid ${isStripDragOver ? 'var(--accent)' : 'var(--border-subtle)'}`,
          borderRadius: 'var(--r-lg)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-3)',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          overflowY: 'hidden',
          transition: 'background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)',
        }}
      >
        {/* Render clips cards + interactive transition connectors between contiguous V1 clips */}
        {project.clips.map((clip, index) => {
          const source = sources.find((s) => s.id === clip.sourceId);
          const mainInfo = getClipTrackIndex(clip) === 0 ? timingMap.get(clip.id) : undefined;
          const showConnectorBefore = Boolean(mainInfo && mainInfo.index > 0 && mainInfo.isContiguousWithPrev);
          const activeTr = isActiveTransition(clip.transitionIn) ? clip.transitionIn : null;

          return (
            <React.Fragment key={clip.id}>
              {showConnectorBefore && mainInfo && (
                <Tooltip
                  content={
                    activeTr
                      ? `${t(`transitions.items.${activeTr.type}`)} (${(mainInfo.overlapInMs / 1000).toFixed(2)}s)`
                      : t('transitions.add_between_tooltip')
                  }
                >
                  <button
                    type="button"
                    data-testid={`clipstrip-transition-${clip.id}`}
                    aria-label={t('transitions.add_between_tooltip')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveClipId(clip.id);
                      useUiStore.getState().focusTransitionSlot('junction');
                      usePlayerStore.getState().seek(Math.max(0, mainInfo.playStartMs - 250));
                    }}
                    onDragOver={(e) => {
                      if (getDraggingTransitionType()) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={(e) => {
                      const trType =
                        e.dataTransfer.getData('megu/transition-type') ||
                        getDraggingTransitionType();
                      if (trType && trType !== 'none') {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingTransitionType(null);
                        setClipTransitionIn(clip.id, createDefaultTransition(trType as TransitionType), true);
                        setActiveClipId(clip.id);
                        useUiStore.getState().focusTransitionSlot('junction');
                      }
                    }}
                    style={{
                      minWidth: activeTr ? '38px' : '24px',
                      height: '28px',
                      padding: activeTr ? '0 6px' : '0',
                      borderRadius: 'var(--r-sm)',
                      background: activeTr ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                      border: `1px solid ${activeTr ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      color: activeTr ? 'var(--accent)' : 'var(--text-muted)',
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '1px',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all var(--dur-fast) var(--ease-out)',
                    }}
                  >
                    <TransitionIcon size={12} />
                    {activeTr && (
                      <span
                        className="timecode"
                        style={{ fontSize: '9px', fontWeight: 700, lineHeight: 1 }}
                      >
                        {(mainInfo.overlapInMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </button>
                </Tooltip>
              )}
              <ClipCard
                clip={clip}
                index={index}
                source={source}
                allSources={sources}
                onDragStart={handleDragStart}
                onDragOver={handleDragOverCard}
                onDrop={handleDropOnCard}
                isDragTarget={dragTargetIdx === index}
              />
            </React.Fragment>
          );
        })}

        {/* "+ Add video" button */}
        <button
          type="button"
          onClick={async () => {
            const paths = await openVideoFileDialog();
            if (paths && paths.length > 0) {
              await addFiles(paths);
            }
          }}
          title={t('editor.add_clip')}
          style={{
            height: '56px',
            minWidth: '84px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            fontSize: 'var(--text-11)',
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
            e.currentTarget.style.color = 'var(--accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-strong)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <PlusIcon size={16} />
          <span>Add</span>
        </button>
      </div>
    </div>
  );
};
