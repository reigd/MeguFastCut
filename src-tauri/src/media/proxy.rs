use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;
use crate::ffmpeg::sidecar::create_ffmpeg_command;

static PROXY_GEN_MUTEX: Mutex<()> = Mutex::new(());

pub fn needs_proxy(codec: &str) -> bool {
    let lower = codec.to_lowercase();
    matches!(
        lower.as_str(),
        "hevc" | "h265" | "prores" | "dnxhd" | "mpeg2video" | "vc1" | "wmv3" | "vp6" | "rawvideo"
    )
}

pub fn generate_proxy_file(input_path: &str) -> Result<String, String> {
    let in_path = Path::new(input_path);
    if !in_path.exists() {
        return Err(format!("Source video file not found: {}", input_path));
    }

    // Ensure only one proxy generation runs at a time to prevent process storm
    let _lock = PROXY_GEN_MUTEX.lock().unwrap();

    let temp_dir = std::env::temp_dir();
    let proxy_filename = format!(".megufastcut-proxy-{}.mp4", Uuid::new_v4());
    let proxy_path: PathBuf = temp_dir.join(proxy_filename);
    let proxy_path_str = proxy_path.to_string_lossy().to_string();

    // Fast H.264 720p proxy with faststart (limited to 2 threads for system stability)
    let output = create_ffmpeg_command([
        "-y",
        "-threads",
        "2",
        "-i",
        input_path,
        "-vf",
        "scale=-2:min(720\\,ih)",
        "-c:v",
        "libx264",
        "-crf",
        "28",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        &proxy_path_str,
    ])
    .output()
    .map_err(|e| format!("Failed to execute proxy generation: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Proxy generation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(proxy_path_str)
}
