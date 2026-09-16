use crate::ffmpeg::encoder_detect::{detect_capabilities, Capabilities};
use crate::media::keyframes::extract_keyframes;
use crate::media::probe::{probe_media_file, ProbeResult};

#[tauri::command]
pub async fn probe_file(path: String) -> Result<ProbeResult, String> {
    tokio::task::spawn_blocking(move || probe_media_file(&path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_keyframes(path: String) -> Result<Vec<u64>, String> {
    tokio::task::spawn_blocking(move || extract_keyframes(&path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_capabilities() -> Result<Capabilities, String> {
    tokio::task::spawn_blocking(move || Ok(detect_capabilities().clone()))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}
