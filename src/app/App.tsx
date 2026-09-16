import React, { useEffect, useState } from 'react';
import { Titlebar } from './Titlebar';
import { ToastContainer } from '../components/Toast/ToastContainer';
import { WhatsNewDrawer } from '../features/whats-new/WhatsNewDrawer';
import { SettingsModal } from '../features/settings/SettingsModal';
import { Button } from '../components/Button/Button';
import { Slider } from '../components/Slider/Slider';
import { Select } from '../components/Select/Select';
import { Segmented } from '../components/Segmented/Segmented';
import { Field } from '../components/Field/Field';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { useUiStore } from '../stores/ui';
import { useSettingsStore } from '../stores/settings';
import { Theme, Locale } from '../shared/types';
import { t, subscribeLocale } from '../shared/i18n';
import * as Icons from '../components/icons';

export const App: React.FC = () => {
  const [, setLocaleTick] = useState(0);
  const { theme, locale, setTheme, setLocale } = useSettingsStore();
  const { addToast, setWhatsNewOpen, setSettingsOpen } = useUiStore();

  const [sliderVal, setSliderVal] = useState(0);
  const [segmentedVal, setSegmentedVal] = useState('crop');

  // Re-render on locale changes
  useEffect(() => {
    return subscribeLocale(() => {
      setLocaleTick((t) => t + 1);
    });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-base)',
      }}
    >
      {/* Custom Titlebar */}
      <Titlebar clipCount={3} totalDurationMs={252000} />

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* Stage 1 Header Card */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--space-6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Icons.LightningIcon size={24} style={{ color: 'var(--accent)' }} />
              <h1 style={{ fontSize: 'var(--text-20)', fontWeight: 700 }}>
                {t('app.name')} — Stage 1 Foundation
              </h1>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
              {t('app.tagline')}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <Button
              variant="secondary"
              onClick={() => {
                addToast({
                  message: t('replace.toast_replaced'),
                  undoAction: () => addToast({ message: 'Undo executed' }),
                });
              }}
            >
              <Icons.SparkleIcon size={16} />
              Trigger 10s Toast
            </Button>

            <Button variant="primary" onClick={() => setWhatsNewOpen(true)}>
              <Icons.SparkleIcon size={16} />
              Open What's New
            </Button>

            <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
              <Icons.SettingsIcon size={16} />
              {t('titlebar.settings')}
            </Button>
          </div>
        </div>

        {/* Theme & Locale Interactive Controls */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-6)',
          }}
        >
          {/* Themes Panel */}
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
              <Icons.PaletteIcon size={18} style={{ color: 'var(--accent)' }} />
              <h2 style={{ fontSize: 'var(--text-14)', fontWeight: 600 }}>
                {t('settings.theme')} (5 Themes)
              </h2>
            </div>
            <Segmented<Theme>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'dark', label: t('settings.theme_dark') },
                { value: 'snow', label: t('settings.theme_snow') },
                { value: 'blackout', label: t('settings.theme_blackout') },
                { value: 'rose', label: t('settings.theme_rose') },
                { value: 'rgb', label: t('settings.theme_rgb') },
              ]}
            />
          </div>

          {/* Locales Panel */}
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
              <Icons.GlobeIcon size={18} style={{ color: 'var(--accent)' }} />
              <h2 style={{ fontSize: 'var(--text-14)', fontWeight: 600 }}>
                {t('settings.language')} (3 Locales)
              </h2>
            </div>
            <Segmented<Locale>
              value={locale}
              onChange={setLocale}
              options={[
                { value: 'en-US', label: 'English (US)' },
                { value: 'en-GB', label: 'English (UK)' },
                { value: 'uk', label: 'Українська' },
              ]}
            />
          </div>
        </div>

        {/* UI Kit Showcase */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <h2 style={{ fontSize: 'var(--text-16)', fontWeight: 600 }}>
            UI-Kit Components
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-6)',
              alignItems: 'start',
            }}
          >
            {/* Buttons */}
            <Field label="Button Variants">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <Button variant="primary">
                  <Icons.ExportIcon size={16} />
                  Primary
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">
                  <Icons.TrashIcon size={16} />
                  Danger
                </Button>
              </div>
            </Field>

            {/* Slider with Zero Snap */}
            <Field label="Volume Slider (Zero-snap -30..+12 dB)" hint="Snaps cleanly to 0 dB near center">
              <Slider
                min={-30}
                max={12}
                step={0.5}
                snapZero
                unit=" dB"
                value={sliderVal}
                onChange={setSliderVal}
              />
            </Field>

            {/* Select dropdown */}
            <Field label="Custom Dropdown Select">
              <Select
                value={segmentedVal}
                onChange={setSegmentedVal}
                options={[
                  { value: 'crop', label: t('transform.fit_crop'), description: 'Crops video edges' },
                  { value: 'fit', label: t('transform.fit_fit'), description: 'Pads with blur/solid color' },
                  { value: 'stretch', label: t('transform.fit_stretch'), description: 'Distorts proportions' },
                ]}
              />
            </Field>

            {/* Tooltip demo */}
            <Field label="Tooltip & Keyboard Badges">
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <Tooltip content="Tooltip message popup">
                  <Button variant="secondary">Hover for Tooltip</Button>
                </Tooltip>
                <kbd
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-12)',
                    color: 'var(--accent)',
                  }}
                >
                  Ctrl+E
                </kbd>
              </div>
            </Field>
          </div>
        </div>

        {/* SVG Icons Showcase */}
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--r-lg)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 'var(--text-16)', fontWeight: 600 }}>
              Custom Stroke-Based SVG Icons (61 Icons)
            </h2>
            <span style={{ fontSize: 'var(--text-12)', color: 'var(--text-muted)' }}>
              100% custom stroke SVGs · zero external icon packs · zero emojis
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 'var(--space-2)',
            }}
          >
            {Object.entries(Icons)
              .filter(([name]) => name.endsWith('Icon'))
              .map(([name, IconComponent]) => {
                const Icon = IconComponent as React.FC<Icons.IconProps>;
                const cleanName = name.replace('Icon', '');
                return (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-3)',
                      background: 'var(--bg-inset)',
                      borderRadius: 'var(--r-md)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <Icon size={22} style={{ color: 'var(--accent)' }} />
                    <span
                      style={{
                        fontSize: 'var(--text-11)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                        textAlign: 'center',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%',
                      }}
                      title={cleanName}
                    >
                      {cleanName}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </main>

      {/* Global Drawers & Modals */}
      <WhatsNewDrawer />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
};
