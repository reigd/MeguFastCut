use std::collections::HashMap;
use std::sync::Mutex;
use crate::ffmpeg::sidecar::create_ffprobe_command;

static KEYFRAMES_CACHE: Mutex<Option<HashMap<String, Vec<u64>>>> = Mutex::new(None);

pub fn extract_keyframes(path_str: &str) -> Result<Vec<u64>, String> {
    // 1. Check cache
    {
        let mut guard = KEYFRAMES_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(path_str) {
            return Ok(cached.clone());
        }
    }

    // 2. Run ffprobe for keyframes
    let output = create_ffprobe_command([
        "-v",
        "quiet",
        "-skip_frame",
        "nokey",
        "-select_streams",
        "v:0",
        "-show_entries",
        "frame=pkt_pts_time",
        "-of",
        "csv=p=0",
        path_str,
    ])
    .output()
    .map_err(|e| format!("Failed to run ffprobe for keyframes: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe keyframe extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut keyframes = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(sec) = trimmed.parse::<f64>() {
            let ms = (sec * 1000.0).round() as u64;
            keyframes.push(ms);
        }
    }

    // Ensure 0 is always present as first keyframe if not already
    if keyframes.is_empty() || keyframes[0] != 0 {
        keyframes.insert(0, 0);
    }

    // Cache
    {
        let mut guard = KEYFRAMES_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        cache.insert(path_str.to_string(), keyframes.clone());
    }

    Ok(keyframes)
}
