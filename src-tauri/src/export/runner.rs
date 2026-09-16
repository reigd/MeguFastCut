use super::args::build_export_arguments;
use super::{ExportJob, ExportProgress};
use crate::ffmpeg::sidecar::create_ffmpeg_command;
use std::io::{BufRead, BufReader};
use std::process::Stdio;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{AppHandle, Emitter};

static ACTIVE_EXPORT_PID: Mutex<Option<u32>> = Mutex::new(None);
static IS_CANCELLED: Mutex<bool> = Mutex::new(false);

pub fn cancel_export() -> Result<(), String> {
    *IS_CANCELLED.lock().unwrap() = true;

    if let Some(pid) = *ACTIVE_EXPORT_PID.lock().unwrap() {
        #[cfg(windows)]
        {
            use std::process::Command;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F", "/T"])
                .spawn();
        }
        *ACTIVE_EXPORT_PID.lock().unwrap() = None;
    }
    Ok(())
}

pub fn run_export(app: AppHandle, job: ExportJob) -> Result<(), String> {
    *IS_CANCELLED.lock().unwrap() = false;

    // Build FFmpeg command arguments
    let args = build_export_arguments(&job)?;

    // Spawn sidecar process
    let mut cmd = create_ffmpeg_command(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let pid = child.id();
    *ACTIVE_EXPORT_PID.lock().unwrap() = Some(pid);

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let start_time = Instant::now();
    let total_duration_ms = job.total_duration_ms.max(1);

    let app_clone = app.clone();
    let output_path = job.output.output_path.clone();
    let open_folder = job.output.open_folder_after;

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut current_fps = 0.0;
        let mut current_speed = "1.0x".to_string();
        let mut current_out_ms = 0u64;

        for line in reader.lines().map_while(Result::ok) {
            if *IS_CANCELLED.lock().unwrap() {
                break;
            }

            let trimmed = line.trim();
            if let Some(val) = trimmed.strip_prefix("fps=") {
                current_fps = val.trim().parse::<f64>().unwrap_or(current_fps);
            } else if let Some(val) = trimmed.strip_prefix("speed=") {
                current_speed = val.trim().to_string();
            } else if let Some(val) = trimmed.strip_prefix("out_time_us=") {
                if let Ok(us) = val.trim().parse::<u64>() {
                    current_out_ms = us / 1000;
                }
            } else if let Some(val) = trimmed.strip_prefix("out_time_ms=") {
                if let Ok(ms) = val.trim().parse::<u64>() {
                    current_out_ms = ms / 1000;
                }
            } else if trimmed == "progress=continue" || trimmed == "progress=end" {
                let percentage = ((current_out_ms as f64 / total_duration_ms as f64) * 100.0).clamp(0.0, 99.5);

                let elapsed_sec = start_time.elapsed().as_secs();
                let eta_sec = if percentage > 1.0 {
                    let total_est_sec = (elapsed_sec as f64 / (percentage / 100.0)) as u64;
                    total_est_sec.saturating_sub(elapsed_sec)
                } else {
                    0
                };

                let _ = app_clone.emit(
                    "export-progress",
                    ExportProgress {
                        percentage,
                        fps: current_fps,
                        speed: current_speed.clone(),
                        out_time_ms: current_out_ms,
                        total_duration_ms,
                        eta_seconds: eta_sec,
                        status: "running".into(),
                        error_message: None,
                    },
                );
            }
        }

        let exit_status = child.wait();
        *ACTIVE_EXPORT_PID.lock().unwrap() = None;

        if *IS_CANCELLED.lock().unwrap() {
            let _ = app_clone.emit(
                "export-progress",
                ExportProgress {
                    percentage: 0.0,
                    fps: 0.0,
                    speed: "0x".into(),
                    out_time_ms: 0,
                    total_duration_ms,
                    eta_seconds: 0,
                    status: "cancelled".into(),
                    error_message: None,
                },
            );
            return;
        }

        match exit_status {
            Ok(status) if status.success() => {
                let _ = app_clone.emit(
                    "export-progress",
                    ExportProgress {
                        percentage: 100.0,
                        fps: current_fps,
                        speed: current_speed,
                        out_time_ms: total_duration_ms,
                        total_duration_ms,
                        eta_seconds: 0,
                        status: "complete".into(),
                        error_message: None,
                    },
                );

                if open_folder {
                    let _ = reveal_in_explorer(&output_path);
                }
            }
            Ok(status) => {
                let _ = app_clone.emit(
                    "export-progress",
                    ExportProgress {
                        percentage: 0.0,
                        fps: 0.0,
                        speed: "0x".into(),
                        out_time_ms: 0,
                        total_duration_ms,
                        eta_seconds: 0,
                        status: "error".into(),
                        error_message: Some(format!("FFmpeg failed with exit code: {:?}", status.code())),
                    },
                );
            }
            Err(err) => {
                let _ = app_clone.emit(
                    "export-progress",
                    ExportProgress {
                        percentage: 0.0,
                        fps: 0.0,
                        speed: "0x".into(),
                        out_time_ms: 0,
                        total_duration_ms,
                        eta_seconds: 0,
                        status: "error".into(),
                        error_message: Some(err.to_string()),
                    },
                );
            }
        }
    });

    Ok(())
}

fn reveal_in_explorer(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(["/select,", path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
