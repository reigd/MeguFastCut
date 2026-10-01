import React, { useState, useEffect } from 'react';
import { Clip, SourceFile } from '../../shared/types';
import { useProjectStore } from '../../stores/project';
import { usePlayerStore } from '../../stores/player';
import { getClipThumbnail } from '../../shared/ipc';
import { truncateMiddle, getSourceColor } from '../../shared/string-utils';
import { formatTimecode } from '../../shared/i18n';
import { ClipContextMenu, ContextMenuPosition } from './ClipContextMenu';
import {
  FilmIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  DragHandleIcon,
} from '../../components/icons';

export interface ClipCardProps {
  clip: Clip;
  index: number;
  source?: SourceFile;
  allSources: SourceFile[];
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  isDragTarget?: boolean;
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  index,
  source,
  allSources,
  onDragStart,
  onDragOver,
  onDrop,
  isDragTarget = false,
}) => {
  const { activeClipId, setActiveClipId, removeClip, toggleClipEnabled, project } = useProjectStore();
  const { seek } = usePlayerStore();

  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<ContextMenuPosition | null>(null);

  const isSelected = activeClipId === clip.id;
  const sourceColor = source ? getSourceColor(source.id, allSources) : 'var(--accent)';
  const speed = clip.speed ?? 1.0;
  const rawDurationMs = clip.outMs - clip.inMs;
  const effectiveDurationMs = Math.round(rawDurationMs / speed);

  // Fetch thumbnail for the clip's start point (debounced to avoid FFmpeg process storm during timeline dragging)
  useEffect(() => {
    let active = true;
    if (!source?.path) return;

    const timer = setTimeout(() => {
      getClipThumbnail(source.path, clip.inMs)
        .then((data) => {
          if (active) setThumbnail(data);
        })
        .catch(() => {});
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source?.path, clip.inMs]);

  // Handle double click: seek player to start of clip in global timeline
  const handleDoubleClick = () => {
    let accumulatedMs = 0;
    for (let i = 0; i < index; i++) {
      const c = project.clips[i];
      accumulatedMs += Math.round((c.outMs - c.inMs) / (c.speed ?? 1.0));
    }
    seek(accumulatedMs);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, index)}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={(e) => onDrop(e, index)}
        onClick={() => setActiveClipId(clip.id)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        style={{
          position: 'relative',
          height: '56px',
          minWidth: '150px',
          maxWidth: '220px',
          flex: '0 0 auto',
          background: isSelected ? 'var(--bg-elevated)' : 'var(--bg-surface)',
          border: `1px solid ${isSelected ? 'var(--clip-border)' : isDragTarget ? 'var(--accent)' : 'var(--border-subtle)'}`,
          borderLeft: `4px solid ${sourceColor}`,
          borderRadius: 'var(--r-md)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '4px 8px 4px 6px',
          cursor: 'pointer',
          userSelect: 'none',
          boxShadow: isSelected ? '0 0 0 1px var(--clip-border), var(--shadow-1)' : 'var(--shadow-1)',
          opacity: clip.enabled ? 1 : 0.45,
          transition: 'transform 150ms var(--ease-out), border-color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)',
          transform: isDragTarget ? 'scale(1.02)' : 'none',
        }}
      >
        {/* Drag grip icon */}
        <div style={{ color: 'var(--text-muted)', cursor: 'grab', display: 'flex' }}>
          <DragHandleIcon size={14} />
        </div>

        {/* Thumbnail or Fallback Film Icon */}
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--bg-inset)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid var(--border-subtle)',
          }}
        >
          {thumbnail ? (
            <img
              src={thumbnail}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <FilmIcon size={18} style={{ color: sourceColor }} />
          )}
        </div>

        {/* Meta Info */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <span
            style={{
              fontSize: 'var(--text-12)',
              fontWeight: isSelected ? 600 : 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={source?.filename || clip.id}
          >
            {source?.filename ? truncateMiddle(source.filename, 16) : clip.id}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
            <span
              className="timecode"
              style={{
                fontSize: 'var(--text-11)',
                color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              {formatTimecode(effectiveDurationMs)}
            </span>
            {Math.abs(speed - 1.0) >= 0.01 && (
              <span
                style={{
                  fontSize: 'var(--text-10)',
                  fontWeight: 600,
                  padding: '0 4px',
                  borderRadius: 'var(--r-sm)',
                  background: 'var(--accent-muted)',
                  color: 'var(--accent)',
                  lineHeight: '14px',
                }}
              >
                {speed}x
              </span>
            )}
          </div>
        </div>

        {/* Action Controls: Eye toggle + Close */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: 'auto' }}>
          {/* Eye Toggle */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleClipEnabled(clip.id);
            }}
            title={clip.enabled ? 'Disable clip' : 'Enable clip'}
            style={{
              background: 'transparent',
              border: 'none',
              color: clip.enabled ? 'var(--text-muted)' : 'var(--text-primary)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            {clip.enabled ? <EyeIcon size={13} /> : <EyeOffIcon size={13} />}
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeClip(clip.id);
            }}
            title="Remove clip"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            <CloseIcon size={13} />
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {menuPos && (
        <ClipContextMenu
          clip={clip}
          source={source}
          position={menuPos}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  );
};
