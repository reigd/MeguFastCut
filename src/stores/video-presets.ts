import { create } from 'zustand';
import {
  DEFAULT_VIDEO_ADJUSTMENTS,
  VIDEO_PARAM_SPECS,
  clampVideoAdjustment,
  type CustomVideoPreset,
} from '../shared/video-fx';
import type { VideoAdjustments } from '../shared/types';

export const VIDEO_PRESETS_STORAGE_KEY = 'megu-fastcut-video-presets';
const MAX_PRESET_NAME_LEN = 48;

function sanitizePresetValues(raw: unknown): VideoAdjustments {
  const result: VideoAdjustments = { ...DEFAULT_VIDEO_ADJUSTMENTS };
  if (!raw || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;
  for (const spec of VIDEO_PARAM_SPECS) {
    const val = record[spec.key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      result[spec.key] = clampVideoAdjustment(spec.key, val);
    }
  }
  return result;
}

function sanitizePresetName(name: string): string {
  return name.trim().slice(0, MAX_PRESET_NAME_LEN);
}

function loadCustomPresets(): CustomVideoPreset[] {
  try {
    const raw = localStorage.getItem(VIDEO_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: CustomVideoPreset[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (typeof obj.id !== 'string' || typeof obj.name !== 'string') continue;
      const cleanName = sanitizePresetName(obj.name);
      if (!cleanName) continue;
      const createdAt = typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)
        ? obj.createdAt
        : Date.now();
      const updatedAt = typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt)
        ? obj.updatedAt
        : createdAt;
      valid.push({
        id: obj.id,
        name: cleanName,
        values: sanitizePresetValues(obj.values),
        createdAt,
        updatedAt,
      });
    }
    return valid;
  } catch {
    return [];
  }
}

function persistCustomPresets(presets: CustomVideoPreset[]): void {
  try {
    localStorage.setItem(VIDEO_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (err) {
    console.warn('Failed to persist custom video presets:', err);
  }
}

function generatePresetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `vp_${crypto.randomUUID()}`;
  }
  return `vp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface VideoPresetsState {
  presets: CustomVideoPreset[];
  saveCustomPreset: (name: string, values: VideoAdjustments) => CustomVideoPreset | null;
  renameCustomPreset: (id: string, newName: string) => boolean;
  deleteCustomPreset: (id: string) => CustomVideoPreset | null;
  restoreCustomPreset: (preset: CustomVideoPreset, index?: number) => void;
}

export const useVideoPresetsStore = create<VideoPresetsState>((set, get) => ({
  presets: loadCustomPresets(),

  saveCustomPreset: (name, values) => {
    const cleanName = sanitizePresetName(name);
    if (!cleanName) return null;
    const now = Date.now();
    const preset: CustomVideoPreset = {
      id: generatePresetId(),
      name: cleanName,
      values: sanitizePresetValues(values),
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().presets, preset];
    persistCustomPresets(next);
    set({ presets: next });
    return preset;
  },

  renameCustomPreset: (id, newName) => {
    const cleanName = sanitizePresetName(newName);
    if (!cleanName) return false;
    const current = get().presets;
    const idx = current.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    const now = Date.now();
    const next = current.map((p) =>
      p.id === id ? { ...p, name: cleanName, updatedAt: now } : p,
    );
    persistCustomPresets(next);
    set({ presets: next });
    return true;
  },

  deleteCustomPreset: (id) => {
    const current = get().presets;
    const removed = current.find((p) => p.id === id) ?? null;
    if (!removed) return null;
    const next = current.filter((p) => p.id !== id);
    persistCustomPresets(next);
    set({ presets: next });
    return removed;
  },

  restoreCustomPreset: (preset, index) => {
    const current = get().presets;
    if (current.some((p) => p.id === preset.id)) return;
    const next = [...current];
    if (typeof index === 'number' && index >= 0 && index <= next.length) {
      next.splice(index, 0, preset);
    } else {
      next.push(preset);
    }
    persistCustomPresets(next);
    set({ presets: next });
  },
}));
