#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::{RegKey, RegValue};

pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "mov", "avi", "webm", "flv", "wmv", "ts", "m4v", "3gp",
    "m2ts", "mts", "vob", "ogv", "mpeg", "mpg",
];

pub const ADD_CLIPS_FLAG: &str = "--add-clips";

const MENU_TITLE: &str = "Редактировать в Megu FastCut";
const MENU_CLIPS_TITLE: &str = "Редактировать фрагменты в Megu FastCut";

#[cfg(windows)]
const VERB_OPEN: &str = "MeguFastCut";
#[cfg(windows)]
const VERB_ADD_CLIPS: &str = "MeguFastCutClips";

pub fn build_open_command(exe_str: &str) -> String {
    format!("\"{}\" \"%1\"", exe_str)
}

pub fn build_add_clips_command(exe_str: &str) -> String {
    format!("\"{}\" {} \"%1\"", exe_str, ADD_CLIPS_FLAG)
}

#[cfg(windows)]
fn set_reg_sz(key: &RegKey, name: &str, val: &str) -> std::io::Result<()> {
    let mut bytes: Vec<u8> = Vec::new();
    for u in val.encode_utf16() {
        bytes.extend_from_slice(&u.to_le_bytes());
    }
    bytes.extend_from_slice(&0u16.to_le_bytes());
    let reg_val = RegValue {
        vtype: REG_SZ,
        bytes: bytes.into(),
    };
    key.set_raw_value(name, &reg_val)
}

#[cfg(windows)]
fn write_shell_verb(
    classes: &RegKey,
    subkey_path: &str,
    title: &str,
    icon_str: &str,
    cmd_str: &str,
    multi_select_model: &str,
) -> Result<(), String> {
    let (verb_key, _) = classes
        .create_subkey(subkey_path)
        .map_err(|e| format!("Failed to create shell key {}: {}", subkey_path, e))?;
    let _ = set_reg_sz(&verb_key, "", title);
    let _ = set_reg_sz(&verb_key, "MUIVerb", title);
    let _ = set_reg_sz(&verb_key, "Icon", icon_str);
    let _ = set_reg_sz(&verb_key, "MultiSelectModel", multi_select_model);

    let (cmd_key, _) = verb_key
        .create_subkey("command")
        .map_err(|e| format!("Failed to create command key for {}: {}", subkey_path, e))?;
    let _ = set_reg_sz(&cmd_key, "", cmd_str);
    Ok(())
}

#[cfg(windows)]
pub fn register_context_menu() -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = current_exe.to_str().ok_or("Invalid exe path")?;
    let cmd_str = build_open_command(exe_str);
    let clips_cmd_str = build_add_clips_command(exe_str);
    let icon_str = format!("\"{}\",0", exe_str);

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (classes, _) = hkcu
        .create_subkey(r"Software\Classes")
        .map_err(|e| format!("Failed to open HKCU\\Software\\Classes: {}", e))?;

    // 1. SystemFileAssociations\video\shell verbs
    // Single-file edit verb hides automatically when 2+ files are selected.
    write_shell_verb(
        &classes,
        &format!(r"SystemFileAssociations\video\shell\{}", VERB_OPEN),
        MENU_TITLE,
        &icon_str,
        &cmd_str,
        "Single",
    )?;
    // Multi-file clips verb supports up to 100 selected videos across mixed extensions.
    write_shell_verb(
        &classes,
        &format!(r"SystemFileAssociations\video\shell\{}", VERB_ADD_CLIPS),
        MENU_CLIPS_TITLE,
        &icon_str,
        &clips_cmd_str,
        "Player",
    )?;

    // 2. Register both verbs for each specific video extension
    for ext in VIDEO_EXTENSIONS {
        let ext_open_path = format!(r"SystemFileAssociations\.{}\shell\{}", ext, VERB_OPEN);
        let _ = write_shell_verb(
            &classes,
            &ext_open_path,
            MENU_TITLE,
            &icon_str,
            &cmd_str,
            "Single",
        );

        let ext_clips_path = format!(r"SystemFileAssociations\.{}\shell\{}", ext, VERB_ADD_CLIPS);
        let _ = write_shell_verb(
            &classes,
            &ext_clips_path,
            MENU_CLIPS_TITLE,
            &icon_str,
            &clips_cmd_str,
            "Player",
        );

        let ext_openwith_path = format!(r".{}\OpenWithList\megu-fastcut.exe", ext);
        if let Ok((ow_key, _)) = classes.create_subkey(&ext_openwith_path) {
            let _ = set_reg_sz(&ow_key, "", "");
        }
    }

    // 3. Applications\megu-fastcut.exe
    if let Ok((app_key, _)) = classes.create_subkey(r"Applications\megu-fastcut.exe") {
        let _ = set_reg_sz(&app_key, "FriendlyAppName", "Megu FastCut");
        if let Ok((app_cmd, _)) = app_key.create_subkey(r"shell\open\command") {
            let _ = set_reg_sz(&app_cmd, "", &cmd_str);
        }
        if let Ok((supp_key, _)) = app_key.create_subkey("SupportedTypes") {
            for ext in VIDEO_EXTENSIONS {
                let _ = set_reg_sz(&supp_key, &format!(".{}", ext), "");
            }
        }
    }

    // 4. SystemFileAssociations\video\OpenWithList\megu-fastcut.exe
    if let Ok((ow_video, _)) = classes.create_subkey(r"SystemFileAssociations\video\OpenWithList\megu-fastcut.exe") {
        let _ = set_reg_sz(&ow_video, "", "");
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
        let _ = classes.delete_subkey_all(format!(r"SystemFileAssociations\video\shell\{}", VERB_OPEN));
        let _ = classes.delete_subkey_all(format!(r"SystemFileAssociations\video\shell\{}", VERB_ADD_CLIPS));

        for ext in VIDEO_EXTENSIONS {
            let ext_open_path = format!(r"SystemFileAssociations\.{}\shell\{}", ext, VERB_OPEN);
            let _ = classes.delete_subkey_all(&ext_open_path);

            let ext_clips_path = format!(r"SystemFileAssociations\.{}\shell\{}", ext, VERB_ADD_CLIPS);
            let _ = classes.delete_subkey_all(&ext_clips_path);

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
fn is_verb_registered(hkcu: &RegKey, verb: &str) -> bool {
    let path = format!(
        r"Software\Classes\SystemFileAssociations\video\shell\{}\command",
        verb
    );
    if let Ok(cmd_key) = hkcu.open_subkey(&path) {
        if let Ok(raw) = cmd_key.get_raw_value("") {
            return !raw.bytes.is_empty();
        }
    }
    false
}

#[cfg(windows)]
pub fn is_context_menu_registered() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    is_verb_registered(&hkcu, VERB_OPEN) && is_verb_registered(&hkcu, VERB_ADD_CLIPS)
}

#[cfg(not(windows))]
pub fn is_context_menu_registered() -> bool {
    false
}

#[cfg(windows)]
pub fn has_any_context_menu_registered() -> bool {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    is_verb_registered(&hkcu, VERB_OPEN) || is_verb_registered(&hkcu, VERB_ADD_CLIPS)
}

#[cfg(not(windows))]
pub fn has_any_context_menu_registered() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_open_command_quotes_paths_with_spaces() {
        let cmd = build_open_command(r"C:\Program Files\Megu FastCut\megu-fastcut.exe");
        assert_eq!(
            cmd,
            "\"C:\\Program Files\\Megu FastCut\\megu-fastcut.exe\" \"%1\""
        );
    }

    #[test]
    fn test_build_add_clips_command_includes_flag_and_quotes() {
        let cmd = build_add_clips_command(r"D:\Src\Megu FastCut\megu-fastcut.exe");
        assert_eq!(
            cmd,
            "\"D:\\Src\\Megu FastCut\\megu-fastcut.exe\" --add-clips \"%1\""
        );
    }
}
