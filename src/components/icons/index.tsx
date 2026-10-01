import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

const BaseIcon = ({
  size = 20,
  strokeWidth = 'var(--icon-stroke, 1.5)',
  children,
  className = '',
  ...props
}: IconProps & { children: React.ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`megu-icon ${className}`}
    {...props}
  >
    {children}
  </svg>
);

export const PlayIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="6 4 20 12 6 20 6 4" />
  </BaseIcon>
);

export const PauseIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="7" y1="5" x2="7" y2="19" />
    <line x1="17" y1="5" x2="17" y2="19" />
  </BaseIcon>
);

export const StopIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </BaseIcon>
);

export const SkipStartIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="5" y1="5" x2="5" y2="19" />
    <polygon points="19 5 9 12 19 19 19 5" />
  </BaseIcon>
);

export const SkipEndIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="5 5 15 12 5 19 5 5" />
    <line x1="19" y1="5" x2="19" y2="19" />
  </BaseIcon>
);

export const StepBackIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="6" y1="6" x2="6" y2="18" />
    <polyline points="18 6 12 12 18 18" />
  </BaseIcon>
);

export const StepForwardIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="6 6 12 12 6 18" />
    <line x1="18" y1="6" x2="18" y2="18" />
  </BaseIcon>
);

export const RewindIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="11 19 2 12 11 5 11 19" />
    <polygon points="22 19 13 12 22 5 22 19" />
  </BaseIcon>
);

export const ForwardIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="13 19 22 12 13 5 13 19" />
    <polygon points="2 19 11 12 2 5 2 19" />
  </BaseIcon>
);

export const LoopIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M17 2l4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </BaseIcon>
);

export const VolumeIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </BaseIcon>
);

export const VolumeMuteIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="22" y1="9" x2="16" y2="15" />
    <line x1="16" y1="9" x2="22" y2="15" />
  </BaseIcon>
);

export const FullscreenIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <polyline points="21 15 21 21 15 21" />
    <polyline points="3 9 3 3 9 3" />
  </BaseIcon>
);

export const FullscreenExitIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="4 14 10 14 10 20" />
    <polyline points="20 10 14 10 14 4" />
    <polyline points="14 20 14 14 20 14" />
    <polyline points="10 4 10 10 4 10" />
  </BaseIcon>
);

export const ScissorsIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <line x1="20" y1="4" x2="8.12" y2="15.88" />
    <line x1="14.47" y1="14.48" x2="20" y2="20" />
    <line x1="8.12" y1="8.12" x2="12" y2="12" />
  </BaseIcon>
);

export const TrimLeftIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="4" y1="4" x2="4" y2="20" />
    <polyline points="8 8 16 12 8 16" />
    <line x1="16" y1="12" x2="20" y2="12" />
  </BaseIcon>
);

export const TrimRightIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="20" y1="4" x2="20" y2="20" />
    <polyline points="16 8 8 12 16 16" />
    <line x1="8" y1="12" x2="4" y2="12" />
  </BaseIcon>
);

export const CropIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </BaseIcon>
);

export const AspectRatioIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <polyline points="7 9 9 9 9 7" />
    <polyline points="17 15 15 15 15 17" />
  </BaseIcon>
);

export const ResizeIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="14" y1="10" x2="3" y2="21" />
  </BaseIcon>
);

export const RotateCwIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M21 12a9 9 0 1 1-3.15-6.85L21 8" />
    <polyline points="21 3 21 8 16 8" />
  </BaseIcon>
);

export const RotateCcwIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M3 12a9 9 0 1 0 3.15-6.85L3 8" />
    <polyline points="3 3 3 8 8 8" />
  </BaseIcon>
);

export const FlipHIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="3 3" />
    <polyline points="8 7 3 12 8 17" />
    <polyline points="16 7 21 12 16 17" />
  </BaseIcon>
);

export const FlipVIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="3 3" />
    <polyline points="7 8 12 3 17 8" />
    <polyline points="7 16 12 21 17 16" />
  </BaseIcon>
);

export const BlurIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <path d="M12 5.5a6.5 6.5 0 0 1 0 13" />
    <path d="M12 8.5a3.5 3.5 0 0 1 0 7" />
  </BaseIcon>
);

export const PaletteIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="13.5" cy="6.5" r="1" fill="currentColor" />
    <circle cx="17.5" cy="10.5" r="1" fill="currentColor" />
    <circle cx="8.5" cy="7.5" r="1" fill="currentColor" />
    <circle cx="6.5" cy="12.5" r="1" fill="currentColor" />
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.38 0 2.5-1.12 2.5-2.5 0-.61-.23-1.2-.64-1.67-.4-.46-.61-1.04-.61-1.66 0-1.38 1.12-2.5 2.5-2.5H18c2.21 0 4-1.79 4-4 0-5.52-4.48-9.67-10-9.67z" />
  </BaseIcon>
);

export const EyedropperIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M2 22s2-1 4-1 2 1 4 1l10-10-4-4L6 18c0 2-1 4-4 4z" />
    <path d="M15 5l4 4" />
    <line x1="19" y1="2" x2="22" y2="5" />
  </BaseIcon>
);

export const ExportIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </BaseIcon>
);

export const ReplaceIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </BaseIcon>
);

export const FolderIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </BaseIcon>
);

export const FolderOpenIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M2 5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v2H6.5a2 2 0 0 0-1.9 1.4L2 19V5z" />
    <path d="M4.6 19.4L6.5 12H22l-3.2 7.4a2 2 0 0 1-1.8 1.2H6.4a2 2 0 0 1-1.8-1.2z" />
  </BaseIcon>
);

export const FileVideoIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <polygon points="10 11 15 14 10 17 10 11" />
  </BaseIcon>
);

export const PlusIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </BaseIcon>
);

export const CloseIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </BaseIcon>
);

export const CheckIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="20 6 9 17 4 12" />
  </BaseIcon>
);

export const ChevronDownIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="6 9 12 15 18 9" />
  </BaseIcon>
);

export const ChevronLeftIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="15 18 9 12 15 6" />
  </BaseIcon>
);

export const ChevronRightIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="9 18 15 12 9 6" />
  </BaseIcon>
);

export const SettingsIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </BaseIcon>
);

export const SparkleIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    <path d="M19 18l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
  </BaseIcon>
);

export const GlobeIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </BaseIcon>
);

export const KeyboardIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <line x1="6" y1="8" x2="6.01" y2="8" strokeWidth="2" />
    <line x1="10" y1="8" x2="10.01" y2="8" strokeWidth="2" />
    <line x1="14" y1="8" x2="14.01" y2="8" strokeWidth="2" />
    <line x1="18" y1="8" x2="18.01" y2="8" strokeWidth="2" />
    <line x1="6" y1="12" x2="6.01" y2="12" strokeWidth="2" />
    <line x1="10" y1="12" x2="10.01" y2="12" strokeWidth="2" />
    <line x1="14" y1="12" x2="14.01" y2="12" strokeWidth="2" />
    <line x1="18" y1="12" x2="18.01" y2="12" strokeWidth="2" />
    <line x1="8" y1="16" x2="16" y2="16" />
  </BaseIcon>
);

export const InfoIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" strokeWidth="2" />
  </BaseIcon>
);

export const AlertIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2" />
  </BaseIcon>
);

export const TrashIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </BaseIcon>
);

export const UndoIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </BaseIcon>
);

export const RedoIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </BaseIcon>
);

export const ZoomInIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </BaseIcon>
);

export const ZoomOutIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </BaseIcon>
);

export const LightningIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </BaseIcon>
);

export const GaugeIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M12 2v2" />
    <path d="M19.07 4.93l-1.41 1.41" />
    <path d="M20 12h2" />
    <path d="M17.66 17.66l-1.41-1.41" />
    <path d="M12 20a8 8 0 1 1 8-8" />
    <line x1="12" y1="12" x2="16" y2="9" />
  </BaseIcon>
);

export const CpuIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <line x1="9" y1="1" x2="9" y2="4" />
    <line x1="15" y1="1" x2="15" y2="4" />
    <line x1="9" y1="20" x2="9" y2="23" />
    <line x1="15" y1="20" x2="15" y2="23" />
    <line x1="20" y1="9" x2="23" y2="9" />
    <line x1="20" y1="15" x2="23" y2="15" />
    <line x1="1" y1="9" x2="4" y2="9" />
    <line x1="1" y1="15" x2="4" y2="15" />
  </BaseIcon>
);

export const FilmIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="2" y="2" width="20" height="20" rx="2.18" />
    <line x1="7" y1="2" x2="7" y2="22" />
    <line x1="17" y1="2" x2="17" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <line x1="2" y1="7" x2="7" y2="7" />
    <line x1="2" y1="17" x2="7" y2="17" />
    <line x1="17" y1="17" x2="22" y2="17" />
    <line x1="17" y1="7" x2="22" y2="7" />
  </BaseIcon>
);

export const MusicIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </BaseIcon>
);

export const ImageIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </BaseIcon>
);

export const DragHandleIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="9" cy="5" r="1" fill="currentColor" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="9" cy="19" r="1" fill="currentColor" />
    <circle cx="15" cy="5" r="1" fill="currentColor" />
    <circle cx="15" cy="12" r="1" fill="currentColor" />
    <circle cx="15" cy="19" r="1" fill="currentColor" />
  </BaseIcon>
);

export const EyeIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </BaseIcon>
);

export const EyeOffIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </BaseIcon>
);

export const MoreHorizontalIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
    <circle cx="5" cy="12" r="1" fill="currentColor" />
  </BaseIcon>
);

export const WaveformIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M3 10v4" />
    <path d="M6 7v10" />
    <path d="M9 4v16" />
    <path d="M12 2v20" />
    <path d="M15 6v12" />
    <path d="M18 9v6" />
    <path d="M21 11v2" />
  </BaseIcon>
);

export const ClockIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </BaseIcon>
);

export const LayersIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </BaseIcon>
);

export const MagnetIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <path d="M4 7V4h4v3a4 4 0 0 0 8 0V4h4v3a8 8 0 0 1-16 0z" />
    <line x1="4" y1="8" x2="8" y2="8" />
    <line x1="16" y1="8" x2="20" y2="8" />
  </BaseIcon>
);

export const AutoAlignIcon: React.FC<IconProps> = (p) => (
  <BaseIcon {...p}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <rect x="3" y="5" width="18" height="5" rx="1.5" />
    <rect x="6" y="14" width="12" height="5" rx="1.5" />
  </BaseIcon>
);

