import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../stores/project';
import { openVideoFileDialog } from '../../shared/ipc';
import { t } from '../../shared/i18n';
import { ClipCard } from './ClipCard';
import { CompatibilityBanner } from './CompatibilityBanner';
import { PlusIcon } from '../../components/icons';

export const ClipStrip: React.FC = () => {
  const { project, sources, addFiles, reorderClips } = useProjectStore();
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragTargetIdx, setDragTargetIdx] = useState<number | null>(null);
  const [isStripDragOver, setIsStripDragOver] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

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
        {/* Render clips cards */}
        {project.clips.map((clip, index) => {
          const source = sources.find((s) => s.id === clip.sourceId);
          return (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={index}
              source={source}
              allSources={sources}
              onDragStart={handleDragStart}
              onDragOver={handleDragOverCard}
              onDrop={handleDropOnCard}
              isDragTarget={dragTargetIdx === index}
            />
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
            border: '1px dashed var(--border-strong)',
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
