import React, { useEffect, useState } from 'react';
import { useUiStore } from '../../stores/ui';
import { useSettingsStore } from '../../stores/settings';
import { Modal } from '../../components/Modal/Modal';
import { Button } from '../../components/Button/Button';
import { Select } from '../../components/Select/Select';
import { Segmented } from '../../components/Segmented/Segmented';
import { Field } from '../../components/Field/Field';
import { Theme, Locale } from '../../shared/types';
import { t } from '../../shared/i18n';
import { CHANGELOG } from '../../shared/changelog';
import { PaletteIcon, KeyboardIcon, InfoIcon, FolderIcon, PlusIcon, TrashIcon } from '../../components/icons';
import { isContextMenuRegistered, registerContextMenu, unregisterContextMenu } from '../../shared/ipc';

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, addToast } = useUiStore();
  const {
    theme,
    locale,
    hwAcceleration,
    alwaysConfirmReplace,
    defaultOutputDir,
    setTheme,
    setLocale,
    setHwAcceleration,
    setAlwaysConfirmReplace,
    setDefaultOutputDir,
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<'general' | 'shortcuts' | 'about'>('general');
  const [isContextMenuActive, setIsContextMenuActive] = useState<boolean>(true);

  useEffect(() => {
    if (isSettingsOpen) {
      isContextMenuRegistered().then(setIsContextMenuActive);
    }
  }, [isSettingsOpen]);

  const handleToggleContextMenu = async (checked: boolean) => {
    try {
      if (checked) {
        await registerContextMenu();
        setIsContextMenuActive(true);
        addToast({ message: t('settings.context_menu_enabled'), durationMs: 3000 });
      } else {
        await unregisterContextMenu();
        setIsContextMenuActive(false);
        addToast({ message: t('settings.context_menu_disabled'), durationMs: 3000 });
      }
    } catch (e) {
      console.error('Failed to toggle context menu:', e);
    }
  };


  const themeOptions = [
    { value: 'dark', label: t('settings.theme_dark') },
    { value: 'snow', label: t('settings.theme_snow') },
    { value: 'blackout', label: t('settings.theme_blackout') },
    { value: 'rose', label: t('settings.theme_rose') },
    { value: 'rgb', label: t('settings.theme_rgb') },
  ];

  const localeOptions = [
    { value: 'en-US', label: 'English (US)' },
    { value: 'en-GB', label: 'English (UK)' },
    { value: 'uk', label: 'Українська' },
  ];

  const hwOptions = [
    { value: 'auto', label: 'Auto (Recommended)' },
    { value: 'nvenc', label: 'NVIDIA NVENC' },
    { value: 'qsv', label: 'Intel Quick Sync' },
    { value: 'amf', label: 'AMD AMF' },
    { value: 'cpu', label: 'Software CPU (Fallback)' },
  ];

  const handleBrowseDefaultDir = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultOutputDir || undefined,
      });
      if (selected && typeof selected === 'string') {
        setDefaultOutputDir(selected);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  return (
    <Modal
      isOpen={isSettingsOpen}
      onClose={() => setSettingsOpen(false)}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span>{t('settings.title')}</span>
        </div>
      }
      footer={
        <Button variant="primary" onClick={() => setSettingsOpen(false)}>
          {t('common.close')}
        </Button>
      }
      width="600px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {/* Settings Tabs */}
        <Segmented
          value={activeTab}
          onChange={(val) => setActiveTab(val as 'general' | 'shortcuts' | 'about')}
          options={[
            { value: 'general', label: t('settings.appearance'), icon: <PaletteIcon size={16} /> },
            { value: 'shortcuts', label: t('settings.shortcuts'), icon: <KeyboardIcon size={16} /> },
            { value: 'about', label: t('settings.about'), icon: <InfoIcon size={16} /> },
          ]}
        />

        {activeTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Theme selection */}
            <Field label={t('settings.theme')}>
              <Select<Theme>
                value={theme}
                options={themeOptions as { value: Theme; label: string }[]}
                onChange={setTheme}
              />
            </Field>

            {/* Language selection */}
            <Field label={t('settings.language')}>
              <Select<Locale>
                value={locale}
                options={localeOptions as { value: Locale; label: string }[]}
                onChange={setLocale}
              />
            </Field>

            {/* Hardware Acceleration */}
            <Field label={t('settings.hw_acceleration')}>
              <Select<'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu'>
                value={hwAcceleration}
                options={hwOptions as { value: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu'; label: string }[]}
                onChange={setHwAcceleration}
              />
            </Field>

            {/* Default output directory */}
            <Field label={t('settings.default_output_dir')}>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <input
                  type="text"
                  readOnly
                  placeholder="Original video folder"
                  value={defaultOutputDir}
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--r-md)',
                    color: 'var(--text-primary)',
                    fontSize: 'var(--text-12)',
                    padding: 'var(--space-2) var(--space-3)',
                    outline: 'none',
                    textOverflow: 'ellipsis',
                  }}
                />
                <Button variant="secondary" onClick={handleBrowseDefaultDir}>
                  <FolderIcon size={14} />
                  <span>{t('export.browse')}</span>
                </Button>
                {defaultOutputDir && (
                  <Button variant="secondary" onClick={() => setDefaultOutputDir('')}>
                    <span>Reset</span>
                  </Button>
                )}
              </div>
            </Field>

            {/* Replace behavior */}
            <Field label={t('settings.replace_behavior')}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  fontSize: 'var(--text-13)',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={alwaysConfirmReplace}
                  onChange={(e) => setAlwaysConfirmReplace(e.target.checked)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span>{t('settings.always_confirm_replace')}</span>
              </label>
            </Field>

            {/* Context Menu Integration */}
            <Field label={t('settings.context_menu')}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-secondary)' }}>
                  {t('settings.context_menu_desc')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  {isContextMenuActive ? (
                    <Button
                      variant="secondary"
                      onClick={() => handleToggleContextMenu(false)}
                      style={{
                        borderColor: 'var(--accent-danger, #ef4444)',
                        color: 'var(--accent-danger, #ef4444)',
                      }}
                    >
                      <TrashIcon size={14} />
                      <span>{t('settings.context_menu_remove_btn')}</span>
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() => handleToggleContextMenu(true)}
                    >
                      <PlusIcon size={14} />
                      <span>{t('settings.context_menu_add_btn')}</span>
                    </Button>
                  )}
                  <span
                    style={{
                      fontSize: 'var(--text-12)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      color: isContextMenuActive
                        ? 'var(--accent-success, #22c55e)'
                        : 'var(--text-muted, #888888)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isContextMenuActive
                          ? 'var(--accent-success, #22c55e)'
                          : 'var(--text-muted, #888888)',
                        display: 'inline-block',
                      }}
                    />
                    {isContextMenuActive
                      ? t('settings.context_menu_status_active')
                      : t('settings.context_menu_status_inactive')}
                  </span>
                </div>
              </div>
            </Field>
          </div>
        )}

        {activeTab === 'shortcuts' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-3)',
              fontSize: 'var(--text-13)',
            }}
          >
            {[
              { key: 'Space', desc: 'Play / Pause' },
              { key: 'S', desc: 'Split clip at playhead' },
              { key: 'Ctrl+Shift+S', desc: 'Replace current video' },
              { key: 'Ctrl+E', desc: 'Export video' },
              { key: 'Ctrl+O', desc: 'Open files' },
              { key: 'Ctrl+Z', desc: 'Undo' },
              { key: 'Ctrl+Shift+Z / Ctrl+Y', desc: 'Redo' },
              { key: 'Ctrl+,', desc: 'Settings' },
              { key: 'J / K / L', desc: 'Reverse / Pause / Forward 10s' },
              { key: 'Left / Right', desc: 'Step frame (-1 / +1)' },
              { key: 'Shift+Left / Right', desc: 'Skip 1 second' },
              { key: 'Home / End', desc: 'Seek to start / end' },
              { key: 'N', desc: 'Toggle timeline snapping' },
              { key: '+ / -', desc: 'Zoom timeline in / out' },
              { key: 'F', desc: 'Toggle fullscreen preview' },
              { key: 'M', desc: 'Toggle mute audio' },
            ].map((sc) => (
              <div
                key={sc.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--bg-inset)',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ color: 'var(--text-secondary)' }}>{sc.desc}</span>
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
                  {sc.key}
                </kbd>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'about' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-18)', fontWeight: 700, color: 'var(--accent)' }}>
                {t('app.name')} v{CHANGELOG[0]?.version}
              </div>
              <p style={{ fontSize: 'var(--text-13)', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {t('app.tagline')}
              </p>
            </div>

            <div
              style={{
                padding: 'var(--space-4)',
                borderRadius: 'var(--r-md)',
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-12)',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                {t('settings.license_title')}
              </div>
              <p>{t('settings.license_desc')}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
