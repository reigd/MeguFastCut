use tauri::{Emitter, Manager};

pub mod commands;
pub mod context_menu;
pub mod export;
pub mod ffmpeg;
pub mod media;

pub struct LaunchState(pub std::sync::Mutex<Option<String>>);

pub fn find_video_arg(args: &[String]) -> Option<String> {
    for arg in args.iter().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let p = std::path::Path::new(arg);
        if p.is_file() {
            return Some(arg.clone());
        }
        if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
            let ext_lower = ext.to_lowercase();
            if context_menu::VIDEO_EXTENSIONS.contains(&ext_lower.as_str()) {
                return Some(arg.clone());
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let initial_file = find_video_arg(&args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(file_path) = find_video_arg(&args) {
                let _ = app.emit("open-file", file_path);
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            let _ = context_menu::register_context_menu();
            Ok(())
        })
        .manage(LaunchState(std::sync::Mutex::new(initial_file)))
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
            commands::get_initial_file,
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
    fn test_find_video_arg_skips_binary_and_flags() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--flag".to_string(),
            "-v".to_string(),
        ];
        assert_eq!(find_video_arg(&args), None);
    }

    #[test]
    fn test_find_video_arg_detects_video_extensions() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "--some-flag".to_string(),
            "C:\\Videos\\sample.MP4".to_string(),
        ];
        assert_eq!(
            find_video_arg(&args),
            Some("C:\\Videos\\sample.MP4".to_string())
        );

        let args_mkv = vec![
            "megu-fastcut.exe".to_string(),
            "D:\\Media\\clip.mkv".to_string(),
        ];
        assert_eq!(
            find_video_arg(&args_mkv),
            Some("D:\\Media\\clip.mkv".to_string())
        );
    }

    #[test]
    fn test_find_video_arg_ignores_non_video_files() {
        let args = vec![
            "megu-fastcut.exe".to_string(),
            "C:\\Docs\\notes.txt".to_string(),
        ];
        assert_eq!(find_video_arg(&args), None);
    }
}
