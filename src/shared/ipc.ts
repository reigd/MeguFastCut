import { invoke } from '@tauri-apps/api/core';
import { ProbeResult } from './types';
import { ExportJob } from '../features/export/export-types';

export interface Capabilities {
  has_nvenc_h264: boolean;
  has_nvenc_hevc: boolean;
  has_qsv_h264: boolean;
  has_qsv_hevc: boolean;
  has_amf_h264: boolean;
  has_amf_hevc: boolean;
  has_libx264: boolean;
  has_libx265: boolean;
  has_libvpx_vp9: boolean;
  has_libsvtav1: boolean;
  has_aac: boolean;
  has_libopus: boolean;
  has_libmp3lame: boolean;
  has_flac: boolean;
  recommended_hw: string;
}

export async function probeFile(path: string): Promise<ProbeResult> {
  try {
    return await invoke<ProbeResult>('probe_file', { path });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

export async function getKeyframes(path: string): Promise<number[]> {
  try {
    return await invoke<number[]>('get_keyframes', { path });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

export async function getCapabilities(): Promise<Capabilities> {
  try {
    return await invoke<Capabilities>('get_capabilities');
  } catch (err) {
    // Default fallback if running outside native tauri
    return {
      has_nvenc_h264: false,
      has_nvenc_hevc: false,
      has_qsv_h264: false,
      has_qsv_hevc: false,
      has_amf_h264: false,
      has_amf_hevc: false,
      has_libx264: true,
      has_libx265: true,
      has_libvpx_vp9: true,
      has_libsvtav1: true,
      has_aac: true,
      has_libopus: true,
      has_libmp3lame: true,
      has_flac: true,
      recommended_hw: 'cpu',
    };
  }
}

export async function getClipThumbnail(path: string, timeMs: number): Promise<string> {
  try {
    return await invoke<string>('get_clip_thumbnail', { path, timeMs });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

export async function revealInExplorer(path: string): Promise<void> {
  try {
    await invoke('reveal_in_explorer', { path });
  } catch (err) {
    console.error('Failed to reveal file in explorer:', err);
  }
}

export async function openVideoFileDialog(): Promise<string[] | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: 'Video & Audio files',
          extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'ts', 'm4v', 'flv', 'mp3', 'wav', 'aac', 'flac', 'm4a'],
        },
        {
          name: 'All files',
          extensions: ['*'],
        },
      ],
    });

    if (!selected) return null;
    if (Array.isArray(selected)) {
      return selected.map((s) => (typeof s === 'string' ? s : (s as { path: string }).path));
    }
    return [typeof selected === 'string' ? selected : (selected as { path: string }).path];
  } catch {
    return null;
  }
}

export async function saveExportFileDialog(
  defaultPath: string,
  extension: string
): Promise<string | null> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const selected = await save({
      defaultPath,
      filters: [
        {
          name: `${extension.toUpperCase()} file`,
          extensions: [extension],
        },
        {
          name: 'All files',
          extensions: ['*'],
        },
      ],
    });
    return selected || null;
  } catch {
    return null;
  }
}

export async function startExport(job: ExportJob): Promise<void> {
  try {
    await invoke('start_export', { job });
  } catch (err) {
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
}

export async function cancelExport(): Promise<void> {
  try {
    await invoke('cancel_export');
  } catch (err) {
    console.error('Failed to cancel export:', err);
  }
}

export async function openFile(path: string): Promise<void> {
  try {
    await invoke('open_file', { path });
  } catch (err) {
    console.error('Failed to open file:', err);
  }
}

export async function openFolder(path: string): Promise<void> {
  try {
    await invoke('open_folder', { path });
  } catch (err) {
    console.error('Failed to open folder:', err);
  }
}

