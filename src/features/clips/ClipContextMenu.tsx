import React, { useEffect } from 'react';
import { Clip, SourceFile } from '../../shared/types';
import { useProjectStore } from '../../stores/project';
import { revealInExplorer } from '../../shared/ipc';
import { t } from '../../shared/i18n';
import {
  ScissorsIcon,
  PlusIcon,
  TrashIcon,
  FolderIcon,
  EyeIcon,
  EyeOffIcon,
} from '../../components/icons';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ClipContextMenuProps {
  clip: Clip;
  source?: SourceFile;
  position: ContextMenuPosition;
  onClose: () => void;
}

export const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  clip,
  source,
  position,
  onClose,
}) => {
  const { duplicateClip, removeClip, toggleClipEnabled } = useProjectStore();

  useEffect(() => {
    const handleGlobalClick = () => onClose();
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, [onClose]);

  return (
    <div
      role="menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 2000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r-md)',
        boxShadow: 'var(--shadow-3)',
        padding: 'var(--space-1)',
        minWidth: '180px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Enable / Disable */}
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          toggleClipEnabled(clip.id);
          onClose();
        }}
      >
        {clip.enabled ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        <span>{clip.enabled ? t('clips.disable_clip') : t('clips.enable_clip')}</span>
      </button>

      {/* Duplicate */}
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          duplicateClip(clip.id);
          onClose();
        }}
      >
        <PlusIcon size={14} />
        <span>{t('clips.duplicate')}</span>
      </button>

      {/* Split */}
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          const mid = clip.inMs + Math.floor((clip.outMs - clip.inMs) / 2);
          useProjectStore.getState().splitClip(clip.id, mid);
          onClose();
        }}
      >
        <ScissorsIcon size={14} />
        <span>{t('clips.split_here')}</span>
      </button>

      {/* Reveal in Explorer */}
      {source && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            revealInExplorer(source.path);
            onClose();
          }}
        >
          <FolderIcon size={14} />
          <span>{t('clips.reveal')}</span>
        </button>
      )}

      <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />

      {/* Remove */}
      <button
        type="button"
        className="menu-item danger"
        onClick={() => {
          removeClip(clip.id);
          onClose();
        }}
      >
        <TrashIcon size={14} />
        <span>{t('clips.remove')}</span>
      </button>

      <style>{`
        .menu-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 6px 10px;
          border-radius: var(--r-sm);
          background: transparent;
          border: none;
          color: var(--text-primary);
          font-size: var(--text-12);
          cursor: pointer;
          width: 100%;
          text-align: left;
          transition: background var(--dur-fast) var(--ease-out);
        }
        .menu-item:hover {
          background: var(--bg-inset);
          color: var(--accent);
        }
        .menu-item.danger:hover {
          background: var(--accent-muted);
          color: var(--danger);
        }
      `}</style>
    </div>
  );
};
