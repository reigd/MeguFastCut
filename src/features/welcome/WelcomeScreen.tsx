import React, { useState } from 'react';
import { useProjectStore, RecentItem } from '../../stores/project';
import { openVideoFileDialog } from '../../shared/ipc';
import { t, formatTimecode, formatFileSize } from '../../shared/i18n';
import { Button } from '../../components/Button/Button';
import {
  FilmIcon,
  FolderOpenIcon,
  ClockIcon,
  TrashIcon,
  KeyboardIcon,
  CloseIcon,
} from '../../components/icons';

export const WelcomeScreen: React.FC = () => {
  const { addFiles, recentFiles, removeRecentFile, clearRecentFiles, isLoading, loadingMessage } = useProjectStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleOpenDialog = async () => {
    const paths = await openVideoFileDialog();
    if (paths && paths.length > 0) {
      await addFiles(paths);
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
      // In Tauri / WebView2, file objects have a path property
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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        height: 'calc(100vh - var(--titlebar-height))',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-6)',
        position: 'relative',
        background: 'var(--bg-base)',
      }}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--r-full)',
              border: '3px solid var(--accent-muted)',
              borderTopColor: 'var(--accent)',
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: 'var(--text-14)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {loadingMessage || t('common.loading')}
          </span>
        </div>
      )}

      {/* Main Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '920px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* Large Drag & Drop Card */}
        <div
          onClick={handleOpenDialog}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            background: isDragOver ? 'var(--accent-muted)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
            border: `1px solid ${isDragOver ? 'var(--accent)' : isHovered ? 'var(--accent)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--r-xl)',
            padding: 'var(--space-8) var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            cursor: 'pointer',
            boxShadow: isHovered ? 'var(--shadow-3)' : 'var(--shadow-2)',
            transition: 'all var(--dur-fast) var(--ease-out)',
          }}
        >
          {/* Custom Hero SVG Illustration */}
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: 'var(--r-xl)',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <svg
              viewBox="0 0 64 64"
              width="52"
              height="52"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="8" y="12" width="48" height="40" rx="6" stroke="var(--border-strong)" />
              <line x1="8" y1="24" x2="56" y2="24" stroke="var(--border-subtle)" />
              <circle cx="16" cy="18" r="2" fill="var(--text-muted)" stroke="none" />
              <circle cx="24" cy="18" r="2" fill="var(--text-muted)" stroke="none" />
              <circle cx="32" cy="18" r="2" fill="var(--text-muted)" stroke="none" />
              {/* Play triangle with scissors line */}
              <polygon points="26 32 38 40 26 48 26 32" fill="var(--accent-muted)" stroke="var(--accent)" />
              <line x1="38" y1="28" x2="30" y2="52" stroke="var(--handle)" strokeDasharray="3 3" />
            </svg>
          </div>

          <h2
            style={{
              fontSize: 'var(--text-20)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-1)',
            }}
          >
            {t('welcome.title')}
          </h2>

          <p
            style={{
              fontSize: 'var(--text-14)',
              color: 'var(--text-secondary)',
              maxWidth: '460px',
              marginBottom: 'var(--space-6)',
              lineHeight: 1.5,
            }}
          >
            {t('welcome.subtitle')}
          </p>

          <Button
            size="lg"
            variant="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDialog();
            }}
          >
            <FolderOpenIcon size={20} />
            <span>{t('welcome.open_files')}</span>
          </Button>
        </div>

        {/* Recents & Shortcuts Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: recentFiles.length > 0 ? '1.5fr 1fr' : '1fr',
            gap: 'var(--space-6)',
          }}
        >
          {/* Recent Files List */}
          {recentFiles.length > 0 && (
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--r-lg)',
                padding: 'var(--space-4) var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <ClockIcon size={16} style={{ color: 'var(--accent)' }} />
                  <h3 style={{ fontSize: 'var(--text-13)', fontWeight: 600 }}>
                    {t('welcome.recent_projects')} ({recentFiles.length})
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={clearRecentFiles}
                  title={t('welcome.clear_recent')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 'var(--text-11)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <TrashIcon size={13} />
                  <span>{t('common.delete')}</span>
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {recentFiles.map((item) => (
                  <RecentFileCard
                    key={item.path}
                    item={item}
                    onOpen={() => addFiles([item.path])}
                    onRemove={() => removeRecentFile(item.path)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Shortcuts Info Box */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-lg)',
              padding: 'var(--space-4) var(--space-6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <KeyboardIcon size={16} style={{ color: 'var(--accent)' }} />
              <h3 style={{ fontSize: 'var(--text-13)', fontWeight: 600 }}>
                {t('welcome.shortcuts_title')}
              </h3>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-12)',
              }}
            >
              {[
                { key: 'Ctrl+O', desc: t('welcome.shortcut_open') },
                { key: 'Space', desc: t('welcome.shortcut_play') },
                { key: 'S', desc: t('welcome.shortcut_split') },
                { key: 'Ctrl+E', desc: t('welcome.shortcut_export') },
              ].map((s) => (
                <div
                  key={s.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2)',
                    background: 'var(--bg-inset)',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)' }}>{s.desc}</span>
                  <kbd
                    style={{
                      padding: '2px 6px',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-strong)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-11)',
                      color: 'var(--accent)',
                    }}
                  >
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RecentFileCard: React.FC<{
  item: RecentItem;
  onOpen: () => void;
  onRemove: () => void;
}> = ({ item, onOpen, onRemove }) => {
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-2) var(--space-3)',
        background: 'var(--bg-inset)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--r-md)',
        cursor: 'pointer',
        transition: 'all var(--dur-fast) var(--ease-out)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--r-sm)',
            background: 'var(--bg-elevated)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'var(--accent)',
          }}
        >
          <FilmIcon size={16} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span
            style={{
              fontSize: 'var(--text-13)',
              fontWeight: 500,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={item.filename}
          >
            {item.filename}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-11)',
              color: 'var(--text-muted)',
            }}
          >
            <span className="timecode">{formatTimecode(item.durationMs)}</span>
            {item.width && item.height && <span>{item.width}×{item.height}</span>}
            <span>{formatFileSize(item.sizeBytes)}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          borderRadius: 'var(--r-sm)',
        }}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
};
