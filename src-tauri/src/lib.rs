use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

pub mod commands;
pub mod context_menu;
pub mod export;
pub mod ffmpeg;
pub mod media;

const MULTI_FILE_BATCH_DEBOUNCE_MS: u64 = 120;
const MULTI_FILE_BATCH_MAX_WAIT_MS: u64 = 450;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchMode {
    Open,
    AddClips,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalOpenPayload {
    pub mode: LaunchMode,
    pub paths: Vec<String>,
}

struct LaunchQueue {
    frontend_ready: bool,
    pending: Option<ExternalOpenPayload>,
    flush_generation: u64,
    batch_started_at: Option<Instant>,
}

#[derive(Debug, PartialEq, Eq)]
enum PushAction {
    BufferedForColdStart,
    EmitImmediately(ExternalOpenPayload),
    ScheduleDebounce { generation: u64, delay_ms: u64 },
}

#[derive(Clone)]
pub struct LaunchState(Arc<Mutex<LaunchQueue>>);

impl LaunchState {
    pub fn new(initial: Option<ExternalOpenPayload>) -> Self {
        Self(Arc::new(Mutex::new(LaunchQueue {
            frontend_ready: false,
            pending: initial,
            flush_generation: 0,
            batch_started_at: None,
        })))
    }

    pub fn take_initial_and_mark_ready(&self) -> Option<ExternalOpenPayload> {
        let mut lock = self.0.lock().unwrap_or_else(|e| e.into_inner());
        lock.frontend_ready = true;
        lock.batch_started_at = None;
        lock.flush_generation = lock.flush_generation.wrapping_add(1);
        lock.pending.take()
    }

    fn push_incoming(&self, incoming: ExternalOpenPayload) -> PushAction {
        let mut lock = self.0.lock().unwrap_or_else(|e| e.into_inner());
        lock.pending = Some(merge_payload(lock.pending.take(), incoming));

        if !lock.frontend_ready {
            return PushAction::BufferedForColdStart;
        }

        let is_instant_single_open = lock
            .pending
            .as_ref()
            .is_some_and(|p| p.mode == LaunchMode::Open && p.paths.len() == 1)
            && lock.batch_started_at.is_none();

        if is_instant_single_open {
            lock.flush_generation = lock.flush_generation.wrapping_add(1);
            if let Some(payload) = lock.pending.take() {
                return PushAction::EmitImmediately(payload);
            }
        }

        let now = Instant::now();
        let started = *lock.batch_started_at.get_or_insert(now);
        let elapsed_ms = now.saturating_duration_since(started).as_millis() as u64;

        if elapsed_ms >= MULTI_FILE_BATCH_MAX_WAIT_MS {
            lock.batch_started_at = None;
            lock.flush_generation = lock.flush_generation.wrapping_add(1);
            if let Some(payload) = lock.pending.take() {
                return PushAction::EmitImmediately(payload);
            }
        }

        lock.flush_generation = lock.flush_generation.wrapping_add(1);
        let generation = lock.flush_generation;
        let remaining_cap = MULTI_FILE_BATCH_MAX_WAIT_MS.saturating_sub(elapsed_ms);
        let delay_ms = MULTI_FILE_BATCH_DEBOUNCE_MS.min(remaining_cap).max(1);
        PushAction::ScheduleDebounce {
            generation,
            delay_ms,
        }
    }

    fn take_if_generation(&self, expected_generation: u64) -> Option<ExternalOpenPayload> {
        let mut lock = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if lock.flush_generation == expected_generation {
            lock.batch_started_at = None;
            lock.pending.take()
        } else {
            None
        }
    }
}

fn normalize_path_key(path: &str) -> String {
    #[cfg(windows)]
    {
        path.replace('/', "\\").to_lowercase()
    }
    #[cfg(not(windows))]
    {
        path.to_string()
    }
}

fn merge_payload(
    existing: Option<ExternalOpenPayload>,
    incoming: ExternalOpenPayload,
) -> ExternalOpenPayload {
    let Some(mut current) = existing else {
        return incoming;
    };

    if incoming.mode == LaunchMode::Open && current.mode == LaunchMode::AddClips {
        return incoming;
    }

    let mut seen: HashSet<String> = current.paths.iter().map(|p| normalize_path_key(p)).collect();
    for path in incoming.paths {
        let key = normalize_path_key(&path);
        if seen.insert(key) {
            current.paths.push(path);
        }
    }
    current
}

fn is_video_path(path: &Path) -> bool {
    if path.is_file() {
        return true;
    }
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        if context_menu::VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
            return true;
        }
    }
    false
}

pub fn parse_launch_args(args: &[String], cwd: Option<&str>) -> Option<ExternalOpenPayload> {
    let mut mode = LaunchMode::Open;
    let mut paths = Vec::new();
    let mut seen = HashSet::new();

    for arg in args.iter().skip(1) {
        if arg == context_menu::ADD_CLIPS_FLAG {
            mode = LaunchMode::AddClips;
            continue;
        }
        if arg.starts_with('-') && !Path::new(arg).is_file() {
            continue;
        }

        let raw_path = Path::new(arg);
        let resolved: PathBuf = if !raw_path.is_absolute() {
            if let Some(base) = cwd {
                let joined = Path::new(base).join(raw_path);
                if joined.is_file() {
                    joined
                } else {
                    raw_path.to_path_buf()
                }
            } else {
                raw_path.to_path_buf()
            }
        } else {
            raw_path.to_path_buf()
        };

        if !is_video_path(&resolved) {
            continue;
        }

        let resolved_str = resolved.to_string_lossy().to_string();
        let key = normalize_path_key(&resolved_str);
        if seen.insert(key) {
            paths.push(resolved_str);
        }
    }

    if paths.is_empty() {
        None
    } else {
        Some(ExternalOpenPayload { mode, paths })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial_cwd = std::env::current_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string());
    let initial_launch = parse_launch_args(&args, initial_cwd.as_deref());
    let launch_state = LaunchState::new(initial_launch);
    let launch_for_single_instance = launch_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(move |app, args, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(payload) = parse_launch_args(&args, Some(&cwd)) {
                match launch_for_single_instance.push_incoming(payload) {
                    PushAction::BufferedForColdStart => {}
                    PushAction::EmitImmediately(ready) => {
                        let _ = app.emit("external-open", ready);
                    }
                    PushAction::ScheduleDebounce {
                        generation,
                        delay_ms,
                    } => {
                        let state_clone = launch_for_single_instance.clone();
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                            if let Some(ready) = state_clone.take_if_generation(generation) {
                                let _ = app_handle.emit("external-open", ready);
                            }
                        });
                    }
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            if context_menu::has_any_context_menu_registered() {
                let _ = context_menu::register_context_menu();
            }
            std::thread::spawn(media::proxy::ensure_startup_cleanup);
            Ok(())
        })
        .manage(launch_state)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
                std::process::exit(0);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::probe_file,
            commands::get_keyframes,
            commands::get_capabilities,
            commands::check_needs_proxy,
            commands::generate_proxy,
            commands::generate_image_proxy,
            commands::save_rasterized_svg,
            commands::get_clip_thumbnail,
            commands::reveal_in_explorer,
            commands::start_export,
            commands::cancel_export,
            commands::open_file,
            commands::open_folder,
            commands::check_replace_eligibility,
            commands::generate_replace_temp_path,
            commands::finalize_replace,
            commands::exit_app,
            commands::get_initial_launch,
            commands::register_context_menu,
            commands::unregister_context_menu,
            commands::is_context_menu_registered
        ])
        .run(tauri::generate_context!())
        .expect("error while running Megu FastCut application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_launch_args_skips_binary_and_flags() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--flag".to_string(),
            "-v".to_string(),
        ];
        assert_eq!(parse_launch_args(&args, None), None);
    }

    #[test]
    fn test_parse_launch_args_detects_single_video() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--some-flag".to_string(),
            "C:\\Videos\\sample.MP4".to_string(),
        ];
        assert_eq!(
            parse_launch_args(&args, None),
            Some(ExternalOpenPayload {
                mode: LaunchMode::Open,
                paths: vec!["C:\\Videos\\sample.MP4".to_string()],
            })
        );
    }

    #[test]
    fn test_parse_launch_args_add_clips_with_multiple_and_cyrillic_paths() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--add-clips".to_string(),
            "D:\\Мои видео\\клип 1.mp4".to_string(),
            "D:\\Мои видео\\клип 2.mkv".to_string(),
            "D:\\Мои видео\\КЛИП 1.MP4".to_string(),
        ];
        let parsed = parse_launch_args(&args, None);
        assert_eq!(
            parsed,
            Some(ExternalOpenPayload {
                mode: LaunchMode::AddClips,
                paths: vec![
                    "D:\\Мои видео\\клип 1.mp4".to_string(),
                    "D:\\Мои видео\\клип 2.mkv".to_string(),
                ],
            })
        );
    }

    #[test]
    fn test_parse_launch_args_ignores_non_video_files() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--add-clips".to_string(),
            "C:\\Docs\\notes.txt".to_string(),
        ];
        assert_eq!(parse_launch_args(&args, None), None);
    }

    #[test]
    fn test_launch_state_buffers_all_cold_start_clips_until_frontend_ready() {
        let state = LaunchState::new(Some(ExternalOpenPayload {
            mode: LaunchMode::AddClips,
            paths: vec!["D:\\v1.mp4".to_string()],
        }));

        assert_eq!(
            state.push_incoming(ExternalOpenPayload {
                mode: LaunchMode::AddClips,
                paths: vec!["D:\\v2.mp4".to_string()],
            }),
            PushAction::BufferedForColdStart
        );
        assert_eq!(
            state.push_incoming(ExternalOpenPayload {
                mode: LaunchMode::AddClips,
                paths: vec!["D:\\v3.mkv".to_string()],
            }),
            PushAction::BufferedForColdStart
        );

        let initial = state.take_initial_and_mark_ready();
        assert_eq!(
            initial,
            Some(ExternalOpenPayload {
                mode: LaunchMode::AddClips,
                paths: vec![
                    "D:\\v1.mp4".to_string(),
                    "D:\\v2.mp4".to_string(),
                    "D:\\v3.mkv".to_string(),
                ],
            })
        );
        assert_eq!(state.take_initial_and_mark_ready(), None);
    }

    #[test]
    fn test_launch_state_warm_start_emits_single_open_immediately_and_batches_add_clips() {
        let state = LaunchState::new(None);
        assert_eq!(state.take_initial_and_mark_ready(), None);

        // Single open flushes immediately with zero delay
        let open_action = state.push_incoming(ExternalOpenPayload {
            mode: LaunchMode::Open,
            paths: vec!["D:\\single.mp4".to_string()],
        });
        assert_eq!(
            open_action,
            PushAction::EmitImmediately(ExternalOpenPayload {
                mode: LaunchMode::Open,
                paths: vec!["D:\\single.mp4".to_string()],
            })
        );

        // Multi-file add-clips arrivals debounce and merge into one payload
        let first = state.push_incoming(ExternalOpenPayload {
            mode: LaunchMode::AddClips,
            paths: vec!["D:\\part2.mp4".to_string()],
        });
        let first_gen = match first {
            PushAction::ScheduleDebounce { generation, .. } => generation,
            other => panic!("expected debounce, got {:?}", other),
        };

        let second = state.push_incoming(ExternalOpenPayload {
            mode: LaunchMode::AddClips,
            paths: vec!["D:\\part1.mp4".to_string()],
        });
        let second_gen = match second {
            PushAction::ScheduleDebounce { generation, .. } => generation,
            other => panic!("expected debounce, got {:?}", other),
        };
        assert_ne!(first_gen, second_gen);

        // Stale timer does not flush
        assert_eq!(state.take_if_generation(first_gen), None);

        // Latest timer flushes both paths merged
        assert_eq!(
            state.take_if_generation(second_gen),
            Some(ExternalOpenPayload {
                mode: LaunchMode::AddClips,
                paths: vec!["D:\\part2.mp4".to_string(), "D:\\part1.mp4".to_string()],
            })
        );
    }
}
