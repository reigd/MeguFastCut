import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/project';
import { openVideoFileDialog, getClipThumbnail } from '../../shared/ipc';
import { SourceFile } from '../../shared/types';
import { t, formatTimecode, formatFileSize } from '../../shared/i18n';
import {
  FilmIcon,
  PlusIcon,
  FolderOpenIcon,
  TrashIcon,
  VolumeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/icons';
import { Tooltip } from '../../components/Tooltip/Tooltip';

interface SourceCardProps {
  source: SourceFile;
  usageCount: number;
  onAdd: (sourceId: string) => void;
  onRemove: (sourceId: string) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({ source, usageCount, onAdd, onRemove }) => {
  const [thumb, setThumb] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let active = true;
    if (source.probe.video) {
      getClipThumbnail(source.path, 0)
        .then((data) => {
          if (active && data) setThumb(data);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [source.path, source.probe.video]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('megu/source-id', source.id);
    e.dataTransfer.setData('text/plain', source.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const isAudioOnly = !source.probe.video && source.probe.audio.length > 0;
  const resolutionLabel = source.probe.video
    ? source.probe.video.height >= 2160
      ? '4K'
      : source.probe.video.height >= 1440
        ? '1440p'
        : source.probe.video.height >= 1080
          ? '1080p'
          : `${source.probe.video.height}p`
    : 'AUDIO';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-elevated)',
        border: `1px solid ${isHovered ? 'var(--accent)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        cursor: 'grab',
        transition: 'all 0.15s ease',
        boxShadow: isHovered ? 'var(--shadow-2)' : 'none',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Thumbnail Area with 16:9 ratio */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          background: 'var(--bg-base)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {thumb ? (
          <img
            src={thumb}
            alt={source.filename}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {isAudioOnly ? <VolumeIcon size={24} /> : <FilmIcon size={24} />}
          </div>
        )}

        {/* Resolution Badge (top-left) */}
        <span
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-10)',
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 'var(--r-xs)',
          }}
        >
          {resolutionLabel}
        </span>

        {/* Timeline usage count badge (top-right, if on timeline) */}
        {usageCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'var(--accent)',
              color: '#ffffff',
              fontSize: 'var(--text-10)',
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 'var(--r-full)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
            title={t('media_library.on_timeline', { count: usageCount })}
          >
            {usageCount}×
          </span>
        )}

        {/* Duration badge (bottom-right) */}
        <span
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
            color: '#ffffff',
            fontSize: 'var(--text-10)',
            fontFamily: 'var(--font-mono)',
            padding: '1px 4px',
            borderRadius: 'var(--r-xs)',
          }}
        >
          {formatTimecode(source.probe.durationMs).replace(/^00:/, '')}
        </span>

        {/* Hover Action Overlay */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              animation: 'fadeIn 0.1s ease',
            }}
          >
            <Tooltip content={t('media_library.add_to_timeline')}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(source.id);
                }}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <PlusIcon size={18} />
              </button>
            </Tooltip>

            <Tooltip content={t('media_library.remove_from_project')}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(source.id);
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--r-full)',
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'transform 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <TrashIcon size={14} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Info details */}
      <div
        style={{
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        <span
          title={source.filename}
          style={{
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {source.filename}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--text-10)',
            color: 'var(--text-muted)',
          }}
        >
          <span>{formatFileSize(source.probe.sizeBytes)}</span>
          {source.probe.video && source.probe.video.fpsDen > 0 && (
            <span>{Math.round(source.probe.video.fpsNum / source.probe.video.fpsDen)} fps</span>
          )}
        </div>
      </div>
    </div>
  );
};

export const MediaLibrary: React.FC = () => {
  const { sources, project, importSources, addClipFromSource, removeSource } = useProjectStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleOpenDialog = async () => {
    const paths = await openVideoFileDialog();
    if (paths && paths.length > 0) {
      await importSources(paths);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const paths = files
        .map((f) => (f as unknown as { path?: string }).path || f.name)
        .filter(Boolean);
      if (paths.length > 0) {
        await importSources(paths);
      }
    }
  };

  // Count usages per sourceId
  const usageCounts = project.clips.reduce<Record<string, number>>((acc, clip) => {
    acc[clip.sourceId] = (acc[clip.sourceId] || 0) + 1;
    return acc;
  }, {});

  if (isCollapsed) {
    return (
      <div
        style={{
          width: '36px',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 'var(--space-2)',
          flexShrink: 0,
        }}
      >
        <Tooltip content={t('media_library.expand')}>
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--r-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRightIcon size={16} />
          </button>
        </Tooltip>
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 'var(--text-11)',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginTop: 'var(--space-4)',
            letterSpacing: '1px',
          }}
        >
          {t('media_library.title')} ({sources.length})
        </span>
      </div>
    );
  }

  return (
    <aside
      aria-label="Media Library"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: '270px',
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          height: '42px',
          padding: '0 var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FilmIcon size={15} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 'var(--text-13)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {t('media_library.title')}
          </h3>
          <span
            style={{
              fontSize: 'var(--text-10)',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: 'var(--r-full)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {sources.length}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Import Button */}
          <button
            type="button"
            onClick={handleOpenDialog}
            title={t('media_library.import_btn')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: 'var(--accent-muted)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--r-md)',
              color: 'var(--accent)',
              fontSize: 'var(--text-11)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-muted)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
          >
            <FolderOpenIcon size={13} />
            <span>{t('media_library.import_btn')}</span>
          </button>

          {/* Collapse Button */}
          <Tooltip content={t('media_library.collapse')}>
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeftIcon size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Sources Grid or Empty State Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          background: isDragOver ? 'var(--accent-muted)' : 'transparent',
          transition: 'background 0.15s ease',
        }}
      >
        {sources.length === 0 ? (
          <div
            onClick={handleOpenDialog}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 'var(--space-4)',
              border: '1.5px dashed var(--border-strong)',
              borderRadius: 'var(--r-lg)',
              cursor: 'pointer',
              background: 'var(--bg-elevated)',
              gap: 'var(--space-2)',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--r-full)',
                background: 'var(--bg-base)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
              }}
            >
              <FolderOpenIcon size={20} />
            </div>

            <span
              style={{
                fontSize: 'var(--text-12)',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {t('media_library.empty_title')}
            </span>

            <span
              style={{
                fontSize: 'var(--text-10)',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
                maxWidth: '180px',
              }}
            >
              {t('media_library.empty_hint')}
            </span>

            <button
              type="button"
              style={{
                marginTop: 'var(--space-2)',
                padding: '4px 10px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                color: '#ffffff',
                fontSize: 'var(--text-11)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <PlusIcon size={14} />
              <span>{t('media_library.import_btn')}</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                usageCount={usageCounts[source.id] || 0}
                onAdd={addClipFromSource}
                onRemove={removeSource}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drag Over Hint Overlay */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(235, 94, 40, 0.15)',
            border: '2px dashed var(--accent)',
            borderRadius: 'var(--r-md)',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'var(--bg-elevated)',
              padding: '6px 12px',
              borderRadius: 'var(--r-full)',
              color: 'var(--accent)',
              fontSize: 'var(--text-12)',
              fontWeight: 600,
              boxShadow: 'var(--shadow-2)',
            }}
          >
            {t('media_library.drop_hint')}
          </div>
        </div>
      )}
    </aside>
  );
};
