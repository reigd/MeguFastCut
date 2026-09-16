use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

static FFMPEG_PATH: OnceLock<PathBuf> = OnceLock::new();
static FFPROBE_PATH: OnceLock<PathBuf> = OnceLock::new();

fn find_binary(bin_name: &str) -> PathBuf {
    // 1. Look relative to current executable (production bundle or debug target)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            // Check direct executable in current folder
            let p1 = parent.join(format!("{}.exe", bin_name));
            if p1.exists() {
                return p1;
            }
            // Check target triple naming
            let p2 = parent.join(format!("{}-x86_64-pc-windows-msvc.exe", bin_name));
            if p2.exists() {
                return p2;
            }
            // Check relative to target/debug or target/release back to src-tauri/binaries
            let p3 = parent.join(format!("../../../binaries/{}-x86_64-pc-windows-msvc.exe", bin_name));
            if p3.exists() {
                if let Ok(canonical) = p3.canonicalize() {
                    return canonical;
                }
            }
        }
    }

    // 2. Look in workspace binaries folder directly
    let direct = Path::new("binaries").join(format!("{}-x86_64-pc-windows-msvc.exe", bin_name));
    if direct.exists() {
        if let Ok(canonical) = direct.canonicalize() {
            return canonical;
        }
    }

    let direct_src_tauri = Path::new("src-tauri/binaries").join(format!("{}-x86_64-pc-windows-msvc.exe", bin_name));
    if direct_src_tauri.exists() {
        if let Ok(canonical) = direct_src_tauri.canonicalize() {
            return canonical;
        }
    }

    // 3. Fallback to system PATH
    PathBuf::from(format!("{}.exe", bin_name))
}

pub fn get_ffmpeg_path() -> &'static PathBuf {
    FFMPEG_PATH.get_or_init(|| find_binary("ffmpeg"))
}

pub fn get_ffprobe_path() -> &'static PathBuf {
    FFPROBE_PATH.get_or_init(|| find_binary("ffprobe"))
}

/// Create a std::process::Command for FFmpeg with array of arguments and no console window
pub fn create_ffmpeg_command<I, S>(args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut cmd = Command::new(get_ffmpeg_path());
    cmd.args(args);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Create a std::process::Command for FFprobe with array of arguments and no console window
pub fn create_ffprobe_command<I, S>(args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
    let mut cmd = Command::new(get_ffprobe_path());
    cmd.args(args);
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
