# Megu FastCut

High-performance desktop video editor for Windows 10/11 x64.
Open files, trim, change aspect ratio, crop, rotate, and export — in under a minute.

## Tech Stack

- **Rust**: Core file operations, media probe, FFmpeg sidecar orchestration, task queue, atomic safe replacement.
- **TypeScript + React**: Strict type checking (`noImplicitAny`, `strict: true`), Zustand store, Canvas-based timeline, zero-rerender scrubbing.
- **Tauri v2**: Windows shell, custom titlebar, IPC, sidecars, file drag-and-drop.

## Licensing

The original source code of **Megu FastCut** is licensed under the [MIT License](LICENSE).

This application bundles pre-compiled binary executables of **FFmpeg** and **FFprobe** under the **GNU General Public License v3 (GPLv3)**. FFmpeg is executed strictly as an external independent sidecar process via command-line arguments and standard input/output pipes (`-progress pipe:1`). No FFmpeg libraries (`libavcodec`, `libavformat`, etc.) are linked into the application binary, nor are any internal FFmpeg data structures shared in memory.

Under copyright law and the terms of the GPL, this distribution constitutes an **aggregation** of independent programs.
- The full GPLv3 license text is included in `COPYING.GPLv3` alongside the bundled binaries.
- The build flags and exact commit hash for the bundled FFmpeg are documented in `ffmpeg-build.txt`.
- Corresponding source code for the exact FFmpeg build used is made available on our official release page.
- Additional third-party open-source components and their respective licenses are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
