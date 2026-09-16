pub mod commands;
pub mod export;
pub mod ffmpeg;
pub mod media;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            commands::open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Megu FastCut application");
}
