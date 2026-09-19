use crate::ffmpeg::encoder_detect::{detect_capabilities, Capabilities};
use crate::media::keyframes::extract_keyframes;
use crate::media::probe::{probe_media_file, ProbeResult};
use crate::media::proxy::{generate_proxy_file, needs_proxy};
use crate::media::replace::{
    check_replace_eligibility as check_replace_elig,
    finalize_replace as final_replace,
    generate_replace_temp_path as gen_replace_temp,
};
use crate::media::thumbnails::extract_thumbnail_base64;

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

#[tauri::command]
pub async fn check_needs_proxy(codec: String) -> Result<bool, String> {
    Ok(needs_proxy(&codec))
}

#[tauri::command]
pub async fn generate_proxy(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || generate_proxy_file(&path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn get_clip_thumbnail(path: String, time_ms: u64) -> Result<String, String> {
    tokio::task::spawn_blocking(move || extract_thumbnail_base64(&path, time_ms))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn reveal_in_explorer(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut cmd = std::process::Command::new("explorer.exe");
            cmd.arg("/select,").arg(&path);
            let _ = cmd.spawn();
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn start_export(app: tauri::AppHandle, job: crate::export::ExportJob) -> Result<(), String> {
    tokio::task::spawn_blocking(move || crate::export::runner::run_export(app, job))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn cancel_export() -> Result<(), String> {
    tokio::task::spawn_blocking(crate::export::runner::cancel_export)
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut cmd = std::process::Command::new("explorer.exe");
            cmd.arg(&path);
            let _ = cmd.spawn();
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut cmd = std::process::Command::new("explorer.exe");
            cmd.arg(&path);
            let _ = cmd.spawn();
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn check_replace_eligibility(original_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || check_replace_elig(&original_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn generate_replace_temp_path(original_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        gen_replace_temp(&original_path).map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn finalize_replace(
    temp_path: String,
    original_path: String,
) -> Result<ProbeResult, String> {
    tokio::task::spawn_blocking(move || final_replace(&temp_path, &original_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
    std::process::exit(0);
}


