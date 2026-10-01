export interface ExportSource {
  id: string;
  path: string;
  filename: string;
  durationMs: number;
  width?: number;
  height?: number;
  codec?: string;
  audioCodec?: string;
}

export interface ExportClip {
  id: string;
  sourceId: string;
  inMs: number;
  outMs: number;
  enabled: boolean;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  volumeDb: number;
  speed?: number;
  startMs?: number;
}

export interface ExportAspect {
  id: string;
  ratio?: number;
  customW?: number;
  customH?: number;
}

export interface ExportCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportPadding {
  mode: string;
  color?: string;
  blurStrength: number;
}

export interface ExportOutput {
  format: string;
  quality: string;
  crf?: number;
  bitrateKbps?: number;
  resolutionMode: string;
  fpsMode: string;
  hardwareAccel: string;
  outputPath: string;
  openFolderAfter: boolean;
  exportVideo?: boolean;
  exportAudio?: boolean;
  videoOutputPath?: string;
  audioOutputPath?: string;
  videoContainer?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioFormat?: string;
  audioBitrate?: string;
}

export interface ExportAudio {
  trackIndex: number;
  volumeDb: number;
  muted: boolean;
  normalization: string;
}

export interface ExportJob {
  sources: ExportSource[];
  clips: ExportClip[];
  aspect: ExportAspect;
  fitMode: string;
  crop: ExportCrop;
  padding: ExportPadding;
  output: ExportOutput;
  audio: ExportAudio;
  totalDurationMs: number;
}

export interface ExportProgress {
  percentage: number;
  fps: number;
  speed: string;
  outTimeMs: number;
  totalDurationMs: number;
  etaSeconds: number;
  status: 'running' | 'complete' | 'cancelled' | 'error';
  errorMessage?: string;
}
