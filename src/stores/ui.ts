import { create } from 'zustand';

export interface ToastItem {
  id: string;
  message: string;
  undoAction?: () => void;
  durationMs?: number;
}

interface UiState {
  screen: 'welcome' | 'editor';
  isExportOpen: boolean;
  isSettingsOpen: boolean;
  isWhatsNewOpen: boolean;
  isReplaceConfirmOpen: boolean;
  isShortcutsOpen: boolean;
  isFullscreenPreview: boolean;
  isMaximized: boolean;
  toasts: ToastItem[];

  setScreen: (screen: 'welcome' | 'editor') => void;
  setExportOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setWhatsNewOpen: (open: boolean) => void;
  setReplaceConfirmOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setFullscreenPreview: (fullscreen: boolean) => void;
  setIsMaximized: (maximized: boolean) => void;
  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  removeToast: (id: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  screen: 'welcome',
  isExportOpen: false,
  isSettingsOpen: false,
  isWhatsNewOpen: false,
  isReplaceConfirmOpen: false,
  isShortcutsOpen: false,
  isFullscreenPreview: false,
  isMaximized: false,
  toasts: [],

  setScreen: (screen) => set({ screen }),
  setExportOpen: (isExportOpen) => set({ isExportOpen }),
  setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setWhatsNewOpen: (isWhatsNewOpen) => set({ isWhatsNewOpen }),
  setReplaceConfirmOpen: (isReplaceConfirmOpen) => set({ isReplaceConfirmOpen }),
  setShortcutsOpen: (isShortcutsOpen) => set({ isShortcutsOpen }),
  setFullscreenPreview: (isFullscreenPreview) => set({ isFullscreenPreview }),
  setIsMaximized: (isMaximized) => set({ isMaximized }),

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { ...toast, id, durationMs: toast.durationMs ?? 10000 };
    set((state) => ({ toasts: [...state.toasts, item] }));
    return id;
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));
