import { SourceFile, Clip } from './types';

export interface PropertyDiff {
  property: string;
  isMismatch: boolean;
  values: { sourceId: string; filename: string; value: string }[];
}

export interface CompatibilityCheck {
  isCompatible: boolean;
  mismatchCount: number;
  diffs: PropertyDiff[];
}

export function checkClipsCompatibility(
  clips: Clip[],
  sources: SourceFile[]
): CompatibilityCheck {
  const enabledClips = clips.filter((c) => c.enabled);
  if (enabledClips.length <= 1) {
    return { isCompatible: true, mismatchCount: 0, diffs: [] };
  }

  // Get distinct sources used by enabled clips
  const usedSourceIds = Array.from(new Set(enabledClips.map((c) => c.sourceId)));
  const usedSources = usedSourceIds
    .map((id) => sources.find((s) => s.id === id))
    .filter((s): s is SourceFile => s !== undefined);

  if (usedSources.length <= 1) {
    return { isCompatible: true, mismatchCount: 0, diffs: [] };
  }

  const diffs: PropertyDiff[] = [];

  // 1. Video Codec
  const codecValues = usedSources.map((s) => ({
    sourceId: s.id,
    filename: s.filename,
    value: s.probe.video?.codec.toUpperCase() || 'NONE',
  }));
  const isCodecMismatch = new Set(codecValues.map((v) => v.value)).size > 1;
  diffs.push({ property: 'Codec', isMismatch: isCodecMismatch, values: codecValues });

  // 2. Resolution
  const resValues = usedSources.map((s) => ({
    sourceId: s.id,
    filename: s.filename,
    value: s.probe.video ? `${s.probe.video.width}×${s.probe.video.height}` : 'NONE',
  }));
  const isResMismatch = new Set(resValues.map((v) => v.value)).size > 1;
  diffs.push({ property: 'Resolution', isMismatch: isResMismatch, values: resValues });

  // 3. Framerate
  const fpsValues = usedSources.map((s) => {
    const fps = s.probe.video
      ? (s.probe.video.fpsNum / s.probe.video.fpsDen).toFixed(2)
      : 'NONE';
    return {
      sourceId: s.id,
      filename: s.filename,
      value: `${fps} fps`,
    };
  });
  const isFpsMismatch = new Set(fpsValues.map((v) => v.value)).size > 1;
  diffs.push({ property: 'Framerate', isMismatch: isFpsMismatch, values: fpsValues });

  // 4. Pixel format
  const pixFmtValues = usedSources.map((s) => ({
    sourceId: s.id,
    filename: s.filename,
    value: s.probe.video?.pixFmt || 'NONE',
  }));
  const isPixMismatch = new Set(pixFmtValues.map((v) => v.value)).size > 1;
  diffs.push({ property: 'Pixel Format', isMismatch: isPixMismatch, values: pixFmtValues });

  // 5. Audio Codec & Parameters
  const audioValues = usedSources.map((s) => {
    const a = s.probe.audio[0];
    const val = a ? `${a.codec.toUpperCase()} (${a.sampleRate / 1000} kHz ${a.channelLayout})` : 'NO AUDIO';
    return {
      sourceId: s.id,
      filename: s.filename,
      value: val,
    };
  });
  const isAudioMismatch = new Set(audioValues.map((v) => v.value)).size > 1;
  diffs.push({ property: 'Audio', isMismatch: isAudioMismatch, values: audioValues });

  const mismatches = diffs.filter((d) => d.isMismatch).length;

  return {
    isCompatible: mismatches === 0,
    mismatchCount: mismatches,
    diffs,
  };
}
