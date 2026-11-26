import React, { useState, useEffect, useMemo } from 'react';
import { useProjectStore } from '../../stores/project';
import { openVideoFileDialog, getClipThumbnail } from '../../shared/ipc';
import { SourceFile } from '../../shared/types';
import { t, formatTimecode, formatFileSize } from '../../shared/i18n';
import {
  getFileExtension,
  getSourceMediaKind,
  isAudioOnlySource,
  isBrowserNativeImagePath,
  isImageSource,
  safeConvertFileSrc,
} from '../../shared/media-formats';
import { setDraggingSourceId } from '../../shared/drag-state';
import {
  FilmIcon,
  ImageIcon,
  LayersIcon,
  PlusIcon,
  FolderOpenIcon,
  TrashIcon,
  VolumeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '../../components/icons';
import { Tooltip } from '../../components/Tooltip/Tooltip';

type MediaFilter = 'all' | 'video' | 'image' | 'audio';

interface SourceCardProps {
  source: SourceFile;
  usageCount: number;
  hasClipsOnTimeline: boolean;
  onAddMain: (sourceId: string) => void;
  onAddOverlay: (sourceId: string) => void;
  onRemove: (sourceId: string) => void;
}

const SourceCard: React.FC<SourceCardProps> = ({
  source,
  usageCount,
  hasClipsOnTimeline,
  onAddMain,
  onAddOverlay,
  onRemove,
}) => {
  const isImage = isImageSource(source);
  const isAudioOnly = isAudioOnlySource(source);
  const [thumb, setThumb] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Use direct WebView2 rendering for native images (instant + alpha channel!),
  // cached PNG preview proxy for exotic images (HEIC, TIFF, PSD, EXR, JXL), or FFmpeg thumb for videos.
  useEffect(() => {
    let active = true;

    if (isImage) {
      if (source.imagePreviewPath) {
        const url = safeConvertFileSrc(source.imagePreviewPath);
        if (url) {
          setThumb(url);
          return;
        }
      }
      if (source.rasterizedPath) {
        const url = safeConvertFileSrc(source.rasterizedPath);
        if (url) {
          setThumb(url);
          return;
        }
      }
      if (isBrowserNativeImagePath(source.path)) {
        const url = safeConvertFileSrc(source.path);
        if (url) {
          setThumb(url);
          return;
        }
      }
      getClipThumbnail(source.path, 0)
        .then((data) => {
          if (active && data) setThumb(data);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }

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
  }, [source.path, source.imagePreviewPath, source.rasterizedPath, source.probe.video, isImage]);

  const handleDragStart = (e: React.DragEvent) => {
    setDraggingSourceId(source.id);
    e.dataTransfer.setData('megu/source-id', source.id);
    e.dataTransfer.setData('text/plain', source.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragEnd = () => {
    setDraggingSourceId(null);
  };

  const extLabel = getFileExtension(source.path).toUpperCase() || 'IMG';
  const badgeLabel = isImage
    ? extLabel
    : source.probe.video
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
      onDragEnd={handleDragEnd}
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
        transition: 'border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
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
          background: isImage
            ? 'repeating-conic-gradient(var(--bg-inset) 0% 25%, var(--bg-surface) 0% 50%) 50% / 12px 12px'
            : 'var(--bg-base)',
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
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: isImage ? 'contain' : 'cover',
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
            {isAudioOnly ? (
              <VolumeIcon size={24} />
            ) : isImage ? (
              <ImageIcon size={24} />
            ) : (
              <FilmIcon size={24} />
            )}
          </div>
        )}

        {/* Format / Resolution Badge (top-left) */}
        <span
          style={{
            position: 'absolute',
            top: '4px',
            left: '4px',
            background: isImage ? 'rgba(16, 185, 129, 0.85)' : 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            color: '#ffffff',
            fontSize: 'var(--text-10)',
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 'var(--r-xs)',
            letterSpacing: '0.02em',
          }}
        >
          {badgeLabel}
        </span>

        {/* Timeline usage count badge (top-right, if on timeline) */}
        {usageCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
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

        {/* Duration / Photo badge (bottom-right) */}
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
          {isImage
            ? t('media_library.photo_badge')
            : formatTimecode(source.probe.durationMs).replace(/^00:/, '')}
        </span>

        {/* Hover Action Overlay: Add to V1, Add as Overlay (V2+), Remove */}
        {isHovered && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Tooltip content={t('media_library.add_to_timeline')}>
              <button
                type="button"
                aria-label={t('media_library.add_to_timeline')}
                onClick={(e) => {
                  e.stopPropagation();
                  onAddMain(source.id);
                }}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--accent)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  transition: 'transform var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <PlusIcon size={16} />
              </button>
            </Tooltip>

            {!isAudioOnly && (
              <Tooltip
                content={
                  hasClipsOnTimeline
                    ? t('media_library.add_as_overlay')
                    : t('media_library.add_as_overlay_hint')
                }
              >
                <button
                  type="button"
                  aria-label={t('media_library.add_as_overlay')}
                  data-testid={`add-overlay-${source.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddOverlay(source.id);
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--r-full)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                    transition: 'transform var(--dur-fast) var(--ease-out)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <LayersIcon size={14} />
                </button>
              </Tooltip>
            )}

            <Tooltip content={t('media_library.remove_from_project')}>
              <button
                type="button"
                aria-label={t('media_library.remove_from_project')}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(source.id);
                }}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: 'var(--r-full)',
                  background: 'rgba(239, 68, 68, 0.85)',
                  color: '#ffffff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                  transition: 'transform var(--dur-fast) var(--ease-out)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <TrashIcon size={13} />
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
            gap: '4px',
            fontSize: 'var(--text-10)',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ flexShrink: 0 }}>{formatFileSize(source.probe.sizeBytes)}</span>
          {isImage && source.probe.video ? (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {source.probe.video.width}×{source.probe.video.height}
            </span>
          ) : source.probe.video && source.probe.video.fpsDen > 0 ? (
            <span style={{ flexShrink: 0 }}>
              {Math.round(source.probe.video.fpsNum / source.probe.video.fpsDen)} fps
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const MediaLibrary: React.FC = () => {
  const { sources, project, importSources, addClipFromSource, removeSource } = useProjectStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [filter, setFilter] = useState<MediaFilter>('all');

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
        .map((f) => (f as unknown as { path?: string }).path || '')
        .filter(Boolean);
      if (paths.length > 0) {
        await importSources(paths);
      }
    }
  };

  const usageCounts = useMemo(
    () =>
      project.clips.reduce<Record<string, number>>((acc, clip) => {
        acc[clip.sourceId] = (acc[clip.sourceId] || 0) + 1;
        return acc;
      }, {}),
    [project.clips]
  );

  const kindCounts = useMemo(() => {
    let video = 0;
    let image = 0;
    let audio = 0;
    for (const s of sources) {
      const k = getSourceMediaKind(s);
      if (k === 'image') image += 1;
      else if (k === 'audio') audio += 1;
      else video += 1;
    }
    return { video, image, audio };
  }, [sources]);

  const filteredSources = useMemo(() => {
    if (filter === 'all') return sources;
    return sources.filter((s) => getSourceMediaKind(s) === filter);
  }, [sources, filter]);

  const hasMultipleKinds =
    Number(kindCounts.video > 0) + Number(kindCounts.image > 0) + Number(kindCounts.audio > 0) > 1;

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
      data-drop-zone="media-library"
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
          <button
            type="button"
            onClick={handleOpenDialog}
            title={t('media_library.import_btn')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              minHeight: '26px',
              padding: '4px 9px',
              background: 'var(--accent-muted)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--r-md)',
              color: 'var(--accent)',
              fontSize: 'var(--text-11)',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent-contrast)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-muted)';
              e.currentTarget.style.color = 'var(--accent)';
            }}
          >
            <FolderOpenIcon size={13} />
            <span>{t('media_library.import_btn')}</span>
          </button>

          <Tooltip content={t('media_library.collapse')}>
            <button
              type="button"
              aria-label={t('media_library.collapse')}
              onClick={() => setIsCollapsed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                width: '26px',
                height: '26px',
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

      {/* Media Kind Filter Pills (shown when library contains mixed media types) */}
      {hasMultipleKinds && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'all' as const, label: t('media_library.filter_all'), count: sources.length },
              ...(kindCounts.video > 0
                ? [{ id: 'video' as const, label: t('media_library.filter_video'), count: kindCounts.video }]
                : []),
              ...(kindCounts.image > 0
                ? [{ id: 'image' as const, label: t('media_library.filter_photo'), count: kindCounts.image }]
                : []),
              ...(kindCounts.audio > 0
                ? [{ id: 'audio' as const, label: t('media_library.filter_audio'), count: kindCounts.audio }]
                : []),
            ]
          ).map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                style={{
                  minHeight: '24px',
                  padding: '3px 8px',
                  borderRadius: 'var(--r-full)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: active ? 'var(--accent-muted)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-10)',
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                }}
              >
                {item.label} ({item.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Sources Grid or Empty State */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          background: isDragOver ? 'var(--accent-muted)' : 'transparent',
          transition: 'background var(--dur-fast) var(--ease-out)',
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
              transition: 'border-color var(--dur-fast) var(--ease-out)',
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
                maxWidth: '190px',
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
            {filteredSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                usageCount={usageCounts[source.id] || 0}
                hasClipsOnTimeline={project.clips.length > 0}
                onAddMain={(id) => addClipFromSource(id)}
                onAddOverlay={(id) => addClipFromSource(id, { asOverlay: true })}
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
