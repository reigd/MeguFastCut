import { invoke } from '@tauri-apps/api/core';
import { SourceFile } from './types';
import { usePlayerStore } from '../stores/player';
import { useProjectStore } from '../stores/project';

const PROXY_CODECS = ['hevc', 'h265', 'prores', 'dnxhd', 'mpeg2video', 'vc1', 'wmv3', 'rawvideo'];

const inFlightProxies = new Map<string, Promise<string | undefined>>();
const failedProxies = new Set<string>();

export function fileNeedsProxy(source: SourceFile): boolean {
  const codec = source.probe.video?.codec.toLowerCase() || '';
  return PROXY_CODECS.includes(codec);
}

export async function ensureProxy(source: SourceFile): Promise<string | undefined> {
  if (source.proxyPath) return source.proxyPath;
  if (!fileNeedsProxy(source)) return undefined;
  if (failedProxies.has(source.id)) return undefined;

  const existing = inFlightProxies.get(source.id);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const playerStore = usePlayerStore.getState();
    const projectStore = useProjectStore.getState();

    playerStore.setProxyStatus(source.id, 'generating');

    try {
      const proxyPath = await invoke<string>('generate_proxy', { path: source.path });
      // Update source in project store
      const updatedSources = projectStore.sources.map((s) =>
        s.id === source.id ? { ...s, proxyPath } : s
      );
      useProjectStore.setState({ sources: updatedSources });
      playerStore.setProxyStatus(source.id, 'ready');
      return proxyPath;
    } catch (err) {
      console.error(`Proxy generation failed for ${source.filename}:`, err);
      failedProxies.add(source.id);
      playerStore.setProxyStatus(source.id, 'error');
      return undefined;
    } finally {
      inFlightProxies.delete(source.id);
    }
  })();

  inFlightProxies.set(source.id, promise);
  return promise;
}
