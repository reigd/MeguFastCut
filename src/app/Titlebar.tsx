import React, { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useUiStore } from '../stores/ui';
import { useSettingsStore } from '../stores/settings';
import { t } from '../shared/i18n';
import { CHANGELOG } from '../shared/changelog';
import { SparkleIcon, SettingsIcon } from '../components/icons';

export interface TitlebarProps {
  clipCount?: number;
  totalDurationMs?: number;
}

export const Titlebar: React.FC<TitlebarProps> = ({
  clipCount = 0,
  totalDurationMs = 0,
}) => {
  const { setWhatsNewOpen, setSettingsOpen } = useUiStore();
  const { lastSeenVersion } = useSettingsStore();
  const [isMaximized, setIsMaximized] = useState(false);

  const currentVersion = CHANGELOG[0]?.version || '1.0.1';
  const hasUnreadWhatsNew = lastSeenVersion !== currentVersion;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const initTauriWindow = async () => {
      try {
        const appWindow = getCurrentWindow();
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
        unlisten = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });
      } catch {
        // Not running inside native Tauri runtime (e.g. standard browser)
      }
    };
    initTauriWindow();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.error('Minimize error:', err);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (err) {
      console.error('Maximize error:', err);
    }
  };

  const handleClose = async () => {
    try {
      await invoke('exit_app');
    } catch {
      try {
        await getCurrentWindow().destroy();
      } catch {
        window.close();
      }
    }
  };

  const formatTotalTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <header
      data-tauri-drag-region
      style={{
        height: 'var(--titlebar-height)',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 'var(--space-3)',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left: App Logo, Name & Project Status */}
      <div
        data-tauri-drag-region
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          cursor: 'default',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <polygon points="5 3 19 12 5 21 5 3" fill="var(--accent-muted)" />
          <line x1="14" y1="2" x2="10" y2="22" stroke="var(--text-primary)" />
        </svg>

        <span
          style={{
            fontWeight: 700,
            fontSize: 'var(--text-14)',
            letterSpacing: '-0.01em',
            color: 'var(--text-primary)',
          }}
        >
          {t('app.name')}
        </span>

        {clipCount > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-12)',
              color: 'var(--text-secondary)',
              borderLeft: '1px solid var(--border-subtle)',
              paddingLeft: 'var(--space-3)',
            }}
          >
            <span>{t('titlebar.clips_count', { count: clipCount })}</span>
            <span>·</span>
            <span className="timecode">
              {t('titlebar.total_duration', { time: formatTotalTime(totalDurationMs) })}
            </span>
          </div>
        )}
      </div>

      {/* Right: What's New, Settings, Window Controls */}
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        {/* What's New button with unread dot */}
        <button
          type="button"
          onClick={() => setWhatsNewOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            padding: '4px 10px',
            marginRight: 'var(--space-2)',
            height: '28px',
            borderRadius: 'var(--r-full)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-12)',
            fontWeight: 500,
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <SparkleIcon size={14} style={{ color: 'var(--accent)' }} />
          <span>{t('titlebar.whats_new', { version: currentVersion })}</span>
          {hasUnreadWhatsNew && (
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: 'var(--r-full)',
                background: 'var(--accent)',
                boxShadow: '0 0 6px var(--accent)',
              }}
            />
          )}
        </button>

        {/* Settings button */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={t('titlebar.settings')}
          style={{
            width: '36px',
            height: '36px',
            marginRight: 'var(--space-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            borderRadius: 'var(--r-md)',
          }}
        >
          <SettingsIcon size={18} />
        </button>

        {/* Window controls: Minimize, Maximize, Close */}
        <div style={{ display: 'flex', height: '100%' }}>
          <button
            type="button"
            onClick={handleMinimize}
            aria-label={t('titlebar.minimize')}
            style={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg viewBox="0 0 10 1" width="10" height="1" fill="currentColor">
              <rect width="10" height="1" />
            </svg>
          </button>

          <button
            type="button"
            onClick={handleMaximize}
            aria-label={isMaximized ? t('titlebar.restore') : t('titlebar.maximize')}
            style={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-elevated)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {isMaximized ? (
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2.5" y="0.5" width="7" height="7" />
                <polyline points="0.5 2.5 0.5 9.5 7.5 9.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="0.5" width="9" height="9" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={handleClose}
            aria-label={t('titlebar.close')}
            style={{
              width: '46px',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--danger)';
              e.currentTarget.style.color = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2">
              <line x1="0" y1="0" x2="10" y2="10" />
              <line x1="10" y1="0" x2="0" y2="10" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
};
