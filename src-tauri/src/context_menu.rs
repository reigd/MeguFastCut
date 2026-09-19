#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "ts", "m4v", "3gp",
    "m2ts", "mts", "vob", "ogv", "mpeg", "mpg",
];

const MENU_TITLE: &str = "Редактировать в Megu FastCut";

#[cfg(windows)]
pub fn register_context_menu() -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = current_exe.to_str().ok_or("Invalid exe path")?;
    let cmd_str = format!("\"{}\" \"%1\"", exe_str);
    let icon_str = format!("\"{}\",0", exe_str);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (classes, _) = hkcu
        .create_subkey(r"Software\Classes")
        .map_err(|e| format!("Failed to open HKCU\\Software\\Classes: {}", e))?;

    // 1. SystemFileAssociations\video\shell\MeguFastCut
    let (video_verb, _) = classes
        .create_subkey(r"SystemFileAssociations\video\shell\MeguFastCut")
        .map_err(|e| format!("Failed to create video shell key: {}", e))?;
    let _ = video_verb.set_value("", &MENU_TITLE);
    let _ = video_verb.set_value("MUIVerb", &MENU_TITLE);
    let _ = video_verb.set_value("Icon", &icon_str);

    let (video_cmd, _) = video_verb
        .create_subkey("command")
        .map_err(|e| format!("Failed to create video command key: {}", e))?;
    let _ = video_cmd.set_value("", &cmd_str);

    // 2. Register for each specific video extension
    for ext in VIDEO_EXTENSIONS {
        let ext_shell_path = format!(r"SystemFileAssociations\.{}\shell\MeguFastCut", ext);
        if let Ok((ext_verb, _)) = classes.create_subkey(&ext_shell_path) {
            let _ = ext_verb.set_value("", &MENU_TITLE);
            let _ = ext_verb.set_value("MUIVerb", &MENU_TITLE);
            let _ = ext_verb.set_value("Icon", &icon_str);
            if let Ok((ext_cmd, _)) = ext_verb.create_subkey("command") {
                let _ = ext_cmd.set_value("", &cmd_str);
            }
        }

        let ext_openwith_path = format!(r".{}\OpenWithList\megu-fastcut.exe", ext);
        if let Ok((ow_key, _)) = classes.create_subkey(&ext_openwith_path) {
            let _ = ow_key.set_value("", &"");
        }
    }

    // 3. Applications\megu-fastcut.exe
    if let Ok((app_key, _)) = classes.create_subkey(r"Applications\megu-fastcut.exe") {
        let _ = app_key.set_value("FriendlyAppName", &"Megu FastCut");
        if let Ok((app_cmd, _)) = app_key.create_subkey(r"shell\open\command") {
            let _ = app_cmd.set_value("", &cmd_str);
        }
        if let Ok((supp_key, _)) = app_key.create_subkey("SupportedTypes") {
            for ext in VIDEO_EXTENSIONS {
                let _ = supp_key.set_value(&format!(".{}", ext), &"");
            }
        }
    }

    // 4. SystemFileAssociations\video\OpenWithList\megu-fastcut.exe
    if let Ok((ow_video, _)) = classes.create_subkey(r"SystemFileAssociations\video\OpenWithList\megu-fastcut.exe") {
        let _ = ow_video.set_value("", &"");
    }

    // Notify Windows Explorer to reload association cache
    unsafe {
        windows::Win32::UI::Shell::SHChangeNotify(
            windows::Win32::UI::Shell::SHCNE_ASSOCCHANGED,
            windows::Win32::UI::Shell::SHCNF_IDLIST,
            None,
            None,
        );
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn register_context_menu() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn unregister_context_menu() -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(classes) = hkcu.open_subkey_with_flags(r"Software\Classes", KEY_ALL_ACCESS) {
        let _ = classes.delete_subkey_all(r"SystemFileAssociations\video\shell\MeguFastCut");

        for ext in VIDEO_EXTENSIONS {
            let ext_shell_path = format!(r"SystemFileAssociations\.{}\shell\MeguFastCut", ext);
            let _ = classes.delete_subkey_all(&ext_shell_path);

            let ext_openwith_path = format!(r".{}\OpenWithList\megu-fastcut.exe", ext);
            let _ = classes.delete_subkey_all(&ext_openwith_path);
        }

        let _ = classes.delete_subkey_all(r"Applications\megu-fastcut.exe");
        let _ = classes.delete_subkey_all(r"SystemFileAssociations\video\OpenWithList\megu-fastcut.exe");
    }

    unsafe {
        windows::Win32::UI::Shell::SHChangeNotify(
            windows::Win32::UI::Shell::SHCNE_ASSOCCHANGED,
            windows::Win32::UI::Shell::SHCNF_IDLIST,
            None,
            None,
        );
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn unregister_context_menu() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn is_context_menu_registered() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(cmd_key) = hkcu.open_subkey(r"Software\Classes\SystemFileAssociations\video\shell\MeguFastCut\command") {
        if let Ok(val) = cmd_key.get_value::<String, _>("") {
            return !val.is_empty();
        }
    }
    false
}

#[cfg(not(windows))]
pub fn is_context_menu_registered() -> bool {
    false
}
