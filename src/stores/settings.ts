import { create } from 'zustand';
import { Theme, Locale } from '../shared/types';
import { setLocale as setI18nLocale } from '../shared/i18n';

interface SettingsState {
  theme: Theme;
  locale: Locale;
  defaultOutputDir: string;
  hwAcceleration: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu';
  alwaysConfirmReplace: boolean;
  lastSeenVersion: string;
  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  setDefaultOutputDir: (dir: string) => void;
  setHwAcceleration: (hw: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu') => void;
  setAlwaysConfirmReplace: (confirm: boolean) => void;
  setLastSeenVersion: (version: string) => void;
}

const STORAGE_KEY = 'megu-fastcut-settings';

function loadInitialSettings(): Partial<SettingsState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // fallback
  }
  return {};
}

function persistSettings(state: Partial<SettingsState>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

const initial = loadInitialSettings();
const initialTheme = (initial.theme as Theme) || 'dark';
const initialLocale = (initial.locale as Locale) || 'en-US';

// Apply initial DOM theme and locale
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', initialTheme);
}
setI18nLocale(initialLocale);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  theme: initialTheme,
  locale: initialLocale,
  defaultOutputDir: initial.defaultOutputDir || '',
  hwAcceleration: initial.hwAcceleration || 'auto',
  alwaysConfirmReplace: initial.alwaysConfirmReplace !== undefined ? initial.alwaysConfirmReplace : true,
  lastSeenVersion: initial.lastSeenVersion || '',

  setTheme: (theme: Theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
    persistSettings({ ...get(), theme });
  },

  setLocale: (locale: Locale) => {
    setI18nLocale(locale);
    set({ locale });
    persistSettings({ ...get(), locale });
  },

  setDefaultOutputDir: (defaultOutputDir: string) => {
    set({ defaultOutputDir });
    persistSettings({ ...get(), defaultOutputDir });
  },

  setHwAcceleration: (hwAcceleration) => {
    set({ hwAcceleration });
    persistSettings({ ...get(), hwAcceleration });
  },

  setAlwaysConfirmReplace: (alwaysConfirmReplace) => {
    set({ alwaysConfirmReplace });
    persistSettings({ ...get(), alwaysConfirmReplace });
  },

  setLastSeenVersion: (lastSeenVersion) => {
    set({ lastSeenVersion });
    persistSettings({ ...get(), lastSeenVersion });
  },
}));
