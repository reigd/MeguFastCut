use std::collections::HashMap;
use std::sync::Mutex;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use crate::ffmpeg::sidecar::create_ffmpeg_command;

type ThumbnailCache = Mutex<Option<HashMap<(String, u64), String>>>;
static THUMBNAIL_CACHE: ThumbnailCache = Mutex::new(None);

pub fn extract_thumbnail_base64(path_str: &str, time_ms: u64) -> Result<String, String> {
    let cache_key = (path_str.to_string(), time_ms);

    // 1. Check in-memory cache
    {
        let mut guard = THUMBNAIL_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // 2. Format seek timestamp in seconds
    let sec = (time_ms as f64) / 1000.0;
    let sec_str = format!("{:.3}", sec);

    // 3. Extract 1 frame with scale=128:-2 as JPEG to stdout
    let output = create_ffmpeg_command([
        "-ss",
        &sec_str,
        "-i",
        path_str,
        "-frames:v",
        "1",
        "-vf",
        "scale=128:-2",
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

    if !output.status.success() || output.stdout.is_empty() {
        return Err(format!(
            "Thumbnail extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let encoded = BASE64.encode(&output.stdout);
    let data_uri = format!("data:image/jpeg;base64,{}", encoded);

    // Store in cache
    {
        let mut guard = THUMBNAIL_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        cache.insert(cache_key, data_uri.clone());
    }

    Ok(data_uri)
}
