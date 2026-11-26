use crate::ffmpeg::sidecar::create_ffmpeg_command;
use crate::media::probe::is_known_image_extension;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

type ThumbnailCache = Mutex<Option<HashMap<(String, u64), String>>>;
static THUMBNAIL_CACHE: ThumbnailCache = Mutex::new(None);
static THUMBNAIL_EXEC_MUTEX: Mutex<()> = Mutex::new(());

fn is_image_thumb_path(path_str: &str) -> bool {
    let path = Path::new(path_str);
    if is_known_image_extension(path) {
        return true;
    }
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .as_deref(),
        Some("webp" | "apng")
    )
}

pub fn extract_thumbnail_base64(path_str: &str, time_ms: u64) -> Result<String, String> {
    let is_image = is_image_thumb_path(path_str);
    // For still images always cache under 0ms since every timestamp is the same frame
    let snapped_ms = if is_image { 0 } else { (time_ms / 100) * 100 };
    let cache_key = (path_str.to_string(), snapped_ms);

    // 1. Check in-memory cache
    {
        let mut guard = THUMBNAIL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // Serialize extraction so multiple thumbnail requests do not storm system with ffmpeg instances
    let _exec_guard = THUMBNAIL_EXEC_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    // Re-check cache in case another thread computed it while waiting for lock
    {
        let mut guard = THUMBNAIL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    let data_uri = if is_image {
        // Extract alpha-preserving PNG thumbnail without seeking (pipe demuxers reject -ss)
        let output = create_ffmpeg_command([
            "-threads",
            "1",
            "-i",
            path_str,
            "-an",
            "-sn",
            "-frames:v",
            "1",
            "-vf",
            "scale=256:256:force_original_aspect_ratio=decrease",
            "-c:v",
            "png",
            "-f",
            "image2",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run image thumbnail extraction: {}", e))?;

        if !output.status.success() || output.stdout.is_empty() {
            return Err(format!(
                "Image thumbnail extraction failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        format!("data:image/png;base64,{}", BASE64.encode(&output.stdout))
    } else {
        let sec = (snapped_ms as f64) / 1000.0;
        let sec_str = format!("{:.3}", sec);

        let mut output = create_ffmpeg_command([
            "-threads",
            "1",
            "-ss",
            &sec_str,
            "-i",
            path_str,
            "-an",
            "-sn",
            "-frames:v",
            "1",
            "-vf",
            "scale=256:256:force_original_aspect_ratio=decrease",
            "-c:v",
            "mjpeg",
            "-q:v",
            "5",
            "-f",
            "image2",
            "pipe:1",
        ])
        .output()
        .map_err(|e| format!("Failed to run thumbnail extraction: {}", e))?;

        // Fallback without -ss if input seek landed past EOF or container doesn't support input seek
        if (!output.status.success() || output.stdout.is_empty()) && snapped_ms > 0 {
            output = create_ffmpeg_command([
                "-threads",
                "1",
                "-i",
                path_str,
                "-an",
                "-sn",
                "-frames:v",
                "1",
                "-vf",
                "scale=256:256:force_original_aspect_ratio=decrease",
                "-c:v",
                "mjpeg",
                "-q:v",
                "5",
                "-f",
                "image2",
                "pipe:1",
            ])
            .output()
            .map_err(|e| format!("Failed to run fallback thumbnail extraction: {}", e))?;
        }

        if !output.status.success() || output.stdout.is_empty() {
            return Err(format!(
                "Thumbnail extraction failed: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }

        format!("data:image/jpeg;base64,{}", BASE64.encode(&output.stdout))
    };

    // Store in cache
    {
        let mut guard = THUMBNAIL_CACHE.lock().unwrap_or_else(|e| e.into_inner());
        let cache = guard.get_or_insert_with(HashMap::new);
        cache.insert(cache_key, data_uri.clone());
    }

    Ok(data_uri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_thumbnail_for_transparent_png() {
        let check = create_ffmpeg_command(["-version"]).output();
        if !matches!(check, Ok(o) if o.status.success()) {
            return;
        }
        let tmp_dir = std::env::temp_dir().join(format!(
            "megufastcut-thumb-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let png_path = tmp_dir.join("alpha.png");

        let status = create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue@0.5:s=300x200:d=0.1,format=rgba",
            "-frames:v",
            "1",
            &png_path.to_string_lossy(),
        ])
        .output()
        .unwrap();
        assert!(status.status.success());

        // Even with non-zero time_ms, still image thumbnail succeeds and returns PNG data URI
        let data_uri = extract_thumbnail_base64(&png_path.to_string_lossy(), 2500)
            .expect("Image thumbnail failed");
        assert!(data_uri.starts_with("data:image/png;base64,"));

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
