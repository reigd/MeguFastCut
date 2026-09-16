use std::path::{Path, PathBuf};
use crate::media::probe::{probe_media_file, ProbeResult};
use uuid::Uuid;

pub fn generate_replace_temp_path(original_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(original_path);
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Invalid original file stem".to_string())?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp4");

    let unique_id = Uuid::new_v4();
    let temp_name = format!(".{}_megu_temp_{}.{}", stem, unique_id, ext);
    Ok(parent.join(temp_name))
}

pub fn check_replace_eligibility(original_path: &str) -> Result<(), String> {
    // Check UNC or network path
    if original_path.starts_with(r"\\") || original_path.starts_with("//") {
        return Err("Replace is not supported on network drives".to_string());
    }

    let path = Path::new(original_path);
    if !path.exists() {
        return Err("Original file does not exist".to_string());
    }

    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Storage::FileSystem::GetDriveTypeW;

        if let Some(prefix) = path.components().next() {
            let root = format!("{}\\", prefix.as_os_str().to_string_lossy());
            let wide: Vec<u16> = OsStr::new(&root).encode_wide().chain(std::iter::once(0)).collect();
            let drive_type = unsafe { GetDriveTypeW(PCWSTR(wide.as_ptr())) };
            // DRIVE_REMOTE = 4 in Win32 API
            if drive_type == 4 {
                return Err("Replace is not supported on network drives".to_string());
            }
        }
    }

    // Check read-only permission
    let metadata = std::fs::metadata(path).map_err(|e| format!("Failed to read file attributes: {}", e))?;
    if metadata.permissions().readonly() {
        return Err("Original file is read-only".to_string());
    }

    // Check if file is locked / open exclusively by another process
    let lock_check = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path);

    if let Err(e) = lock_check {
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            return Err("Original file is locked by another program".to_string());
        }
    }

    Ok(())
}

pub fn move_to_recycle_bin(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::UI::Shell::{
            SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT,
            FO_DELETE, SHFILEOPSTRUCTW,
        };

        // SHFileOperationW requires a double-null-terminated buffer
        let mut wide: Vec<u16> = OsStr::new(path).encode_wide().collect();
        wide.push(0);
        wide.push(0);

        let mut op = SHFILEOPSTRUCTW {
            hwnd: Default::default(),
            wFunc: FO_DELETE,
            pFrom: PCWSTR(wide.as_ptr()),
            pTo: PCWSTR::null(),
            fFlags: (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI).0 as u16,
            fAnyOperationsAborted: Default::default(),
            hNameMappings: Default::default(),
            lpszProgressTitle: PCWSTR::null(),
        };

        let result = unsafe { SHFileOperationW(&mut op) };
        if result != 0 {
            return Err(format!("Failed to move file to Recycle Bin (error code: {})", result));
        }
        if op.fAnyOperationsAborted.as_bool() {
            return Err("Operation was cancelled or aborted".to_string());
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::fs::remove_file(path).map_err(|e| format!("Failed to remove file: {}", e))
    }
}

pub fn finalize_replace(temp_path: &str, original_path: &str) -> Result<ProbeResult, String> {
    let temp_p = Path::new(temp_path);
    if !temp_p.exists() {
        return Err("Temporary exported file was not found".to_string());
    }

    // Step 1: Probe temporary file to verify validity
    let probe = probe_media_file(temp_path)?;
    if probe.duration_ms == 0 {
        let _ = std::fs::remove_file(temp_p);
        return Err("Exported file is empty or corrupted".to_string());
    }

    // Step 2: Safely move original to Windows Recycle Bin
    if let Err(e) = move_to_recycle_bin(original_path) {
        let _ = std::fs::remove_file(temp_p);
        return Err(format!("Failed to move original to Recycle Bin: {}", e));
    }

    // Step 3: Rename temp file to original name
    if let Err(e) = std::fs::rename(temp_path, original_path) {
        return Err(format!(
            "Failed to rename temp file to original: {}. Temp file preserved at: {}",
            e, temp_path
        ));
    }

    // Step 4: Re-probe finalized file and return updated metadata
    probe_media_file(original_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_replace_temp_path() {
        let temp = generate_replace_temp_path("D:/Videos/my_cat.mp4").unwrap();
        let path_str = temp.to_string_lossy();
        assert!(path_str.contains(".my_cat_megu_temp_"));
        assert!(path_str.ends_with(".mp4"));
    }

    #[test]
    fn test_check_replace_eligibility_nonexistent() {
        let res = check_replace_eligibility("D:/Videos/completely_nonexistent_file_123.mp4");
        assert!(res.is_err());
    }

    #[test]
    fn test_check_replace_network_unc() {
        let res = check_replace_eligibility(r"\\192.168.1.100\share\video.mp4");
        assert!(res.is_err());
        assert!(res.unwrap_err().contains("network"));
    }
}
