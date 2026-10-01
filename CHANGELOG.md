# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-09-29

### Added
- Independent per-clip speed slider with wide range from 0.01x ultra slow-motion up to 999x timelapse.
- Quick speed presets (0.25x, 0.5x, 1x, 2x, 4x, 8x), precise numeric input, and instant 1.0x reset button.

### Improved
- Timeline canvas segments, playhead scrubbing, and timecode calculations dynamically reflect each clip's speed.
- Export pipeline applies PTS scaling (`setpts`) and chained audio tempo filters (`atempo`) across extreme speed ranges.

## [1.0.1] - 2026-09-20

### Added
- Windows Explorer context menu integration: open and edit any video format directly from right-click.
- Dynamic "Add Megu FastCut to context menu" and "Remove from context menu" controls in Settings.
- Single-instance argument passing and cold/warm start video loading.

### Fixed
- Fixed custom titlebar close button and ensured instant process termination with zero ghost processes in Task Manager.
- Removed unintended preview blur overlay when displaying videos in original aspect ratio.

## [1.0.0] - 2026-09-16

### Added
- Initial release of Megu FastCut for Windows 10/11 x64.
- Single-track multi-clip workflow with split, trim, ripple delete, and reorder.
- Three export processing modes: Fast (lossless copy), Precise (smart GOP cut), and Re-encode.
- Real-time aspect ratio presets (16:9, 9:16, 1:1, 4:5, 4:3, 21:9, 2:3, Custom) and fit modes (Crop, Fit with blur/color, Stretch).
- Lossless 90°/180°/270° rotation via display matrix and horizontal/vertical flipping.
- Native WebView2 video preview with automatic background H.264 proxy generation for unsupported formats.
- Safe "Replace Current Video" flow with atomic temp file creation, ffprobe verification, and Windows Recycle Bin protection with 10s undo toast.
- 5 interface themes: Dark, Snow, Blackout, Rose, and RGB animated accent.
- Complete localization support for `en-US`, `en-GB`, and `uk` (Ukrainian).
