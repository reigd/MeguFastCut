export type Theme = 'dark' | 'snow' | 'blackout' | 'rose' | 'rgb';
export type Locale = 'en-US' | 'en-GB' | 'uk';

export type FitMode = 'crop' | 'fit' | 'stretch';
export type RotateAngle = 0 | 90 | 180 | 270;
export type ProcessingMode = 'fast' | 'precise' | 'reencode';

export interface CropRect {
  x: number;      // normalized 0..1 or pixel value depending on context
  y: number;
  width: number;
  height: number;
}

export interface AspectSetting {
  id: string;     // 'original' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '21:9' | '2:3' | 'custom'
  ratio?: number; // width / height
  label?: string;
  customW?: number;
  customH?: number;
}

export interface PadSetting {
  mode: 'blur' | 'color';
  color?: string;       // hex e.g. '#000000'
  blurStrength: number; // 0..100, default 40
}

export interface AudioSettings {
  trackIndex: number;
  volumeDb: number;     // -30..+12, step 0.5, default 0
  muted: boolean;
  normalization: 'off' | 'web' | 'broadcast' | 'cinema'; // off, -14 LUFS, -23 LUFS, -27 LUFS
  reencodeAudio: boolean;
}

export interface OutputSettings {
  format: 'mp4_h264' | 'mp4_hevc' | 'webm_vp9' | 'webm_av1' | 'mov' | 'mkv' | 'avi' | 'gif' | 'audio_mp3' | 'audio_wav' | 'audio_aac' | 'audio_flac' | 'audio_ogg' | 'copy' | (string & {});
  quality: 'high' | 'balanced' | 'small' | 'custom';
  crf?: number;
  bitrateKbps?: number;
  resolutionMode: 'auto' | '2160p' | '1440p' | '1080p' | '720p' | '480p';
  customWidth?: number;
  customHeight?: number;
  fpsMode: 'original' | '60' | '30' | '24';
  hardwareAccel: 'auto' | 'nvenc' | 'qsv' | 'amf' | 'cpu';
  outputPath: string;
  filenameTemplate: string; // e.g. "{name}_fastcut{ext}"
  openFolderAfter: boolean;

  // Multi-target & granular codec selection:
  exportVideo?: boolean;
  exportAudio?: boolean;
  videoOutputPath?: string;
  audioOutputPath?: string;
  videoContainer?: 'mp4' | 'mkv' | 'mov' | 'webm' | 'avi' | 'gif' | (string & {});
  videoCodec?: 'h264' | 'hevc' | 'av1' | 'vp9' | 'prores' | 'copy' | 'gif' | (string & {});
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'pcm' | 'copy' | (string & {});
  audioFormat?: 'mp3' | 'wav' | 'flac' | 'aac' | 'ogg' | 'm4a' | (string & {});
  audioBitrate?: '320k' | '256k' | '192k' | '128k' | 'lossless' | (string & {});
}

export interface VideoStreamProbe {
  codec: string;
  width: number;
  height: number;
  fpsNum: number;
  fpsDen: number;
  pixFmt: string;
  durationMs: number;
  bitrate?: number;
  rotation?: number;
}

export interface AudioStreamProbe {
  index: number;
  codec: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;
  bitrate?: number;
  language?: string;
  title?: string;
}

export interface ProbeResult {
  durationMs: number;
  sizeBytes: number;
  container: string;
  video?: VideoStreamProbe;
  audio: AudioStreamProbe[];
  keyframes?: number[]; // PTS in ms
}

export interface SourceFile {
  id: string;
  path: string;
  filename: string;
  probe: ProbeResult;
  proxyPath?: string;
}

export interface Clip {
  id: string;
  sourceId: string;
  inMs: number;                // inclusive
  outMs: number;               // exclusive
  startMs?: number;            // timeline start position in ms
  enabled: boolean;
  rotate: RotateAngle;         // clockwise
  flipH: boolean;
  flipV: boolean;
  cropOverride?: CropRect;
  volumeDb: number;            // 0 default
  speed?: number;              // 0.01..999, default 1.0
}

export interface Project {
  clips: Clip[];
  aspect: AspectSetting;
  fitMode: FitMode;
  crop: CropRect;
  padding: PadSetting;
  output: OutputSettings;
  audio: AudioSettings;
}
