import {
  TransitionAudioMode,
  TransitionDirection,
  TransitionEasing,
  TransitionType,
  VideoAdjustments,
} from '../../shared/types';

export interface ExportTransition {
  type: TransitionType;
  durationMs: number;
  direction?: TransitionDirection;
  easing?: TransitionEasing;
  softness?: number;
  color?: string;
  audioMode?: TransitionAudioMode;
}

export interface ExportSource {
  id: string;
  path: string;
  filename: string;
  durationMs: number;
  width?: number;
  height?: number;
  fpsNum?: number;
  fpsDen?: number;
  codec?: string;
  audioCodec?: string;
  isImage?: boolean;
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
  sharpness?: number;
  videoAdjustments?: VideoAdjustments;
  startMs?: number;
  trackIndex?: number;
  overlayBounds?: ExportCrop;
  canvasBounds?: ExportCrop;
  crop?: ExportCrop;
  transitionIn?: ExportTransition;
  transitionOut?: ExportTransition;
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
  canvasBounds?: ExportCrop;
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
