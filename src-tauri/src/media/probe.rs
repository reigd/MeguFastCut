use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use crate::ffmpeg::sidecar::create_ffprobe_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoStreamProbe {
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    pub pix_fmt: String,
    pub duration_ms: u64,
    pub bitrate: Option<u64>,
    pub rotation: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioStreamProbe {
    pub index: u32,
    pub codec: String,
    pub sample_rate: u32,
    pub channels: u32,
    pub channel_layout: String,
    pub bitrate: Option<u64>,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResult {
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub container: String,
    pub video: Option<VideoStreamProbe>,
    pub audio: Vec<AudioStreamProbe>,
}

type ProbeCacheKey = (String, u64, u64);
type ProbeCacheMap = HashMap<ProbeCacheKey, ProbeResult>;
static PROBE_CACHE: Mutex<Option<ProbeCacheMap>> = Mutex::new(None);

pub fn probe_media_file(path_str: &str) -> Result<ProbeResult, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("File not found: {}", path_str));
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Cannot read file metadata: {}", e))?;
    let file_size = metadata.len();
    let mtime = metadata
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs())
        .unwrap_or(0);

    let cache_key = (path_str.to_string(), mtime, file_size);

    // 1. Check cache
    {
        let mut guard = PROBE_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(&cache_key) {
            return Ok(cached.clone());
        }
    }

    // 2. Run ffprobe
    let output = create_ffprobe_command([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        path_str,
    ])
    .output()
    .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!("ffprobe exited with error: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let json_val: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe json output: {}", e))?;

    let format_obj = json_val.get("format").ok_or("Missing 'format' in ffprobe output")?;
    let format_duration_sec: f64 = format_obj
        .get("duration")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    let container = format_obj
        .get("format_name")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let mut video_probe: Option<VideoStreamProbe> = None;
    let mut audio_probes: Vec<AudioStreamProbe> = Vec::new();

    if let Some(streams) = json_val.get("streams").and_then(|v| v.as_array()) {
        for s in streams {
            let codec_type = s.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");
            if codec_type == "video" && video_probe.is_none() {
                let codec = s.get("codec_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let width = s.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let height = s.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let pix_fmt = s.get("pix_fmt").and_then(|v| v.as_str()).unwrap_or("yuv420p").to_string();

                let (fps_num, fps_den) = parse_ratio(s.get("r_frame_rate").and_then(|v| v.as_str()).unwrap_or("30/1"));

                let stream_duration_sec: f64 = s
                    .get("duration")
                    .and_then(|v| v.as_str())
                    .and_then(|val| val.parse::<f64>().ok())
                    .unwrap_or(format_duration_sec);

                let bitrate = s
                    .get("bit_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|b| b.parse::<u64>().ok());

                // Read rotation from side_data or tags
                let rotation = parse_rotation(s);

                video_probe = Some(VideoStreamProbe {
                    codec,
                    width,
                    height,
                    fps_num,
                    fps_den,
                    pix_fmt,
                    duration_ms: (stream_duration_sec * 1000.0).round() as u64,
                    bitrate,
                    rotation,
                });
            } else if codec_type == "audio" {
                let index = s.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let codec = s.get("codec_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let sample_rate = s
                    .get("sample_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|sr| sr.parse::<u32>().ok())
                    .unwrap_or(48000);
                let channels = s.get("channels").and_then(|v| v.as_u64()).unwrap_or(2) as u32;
                let channel_layout = s
                    .get("channel_layout")
                    .and_then(|v| v.as_str())
                    .unwrap_or("stereo")
                    .to_string();

                let bitrate = s
                    .get("bit_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|b| b.parse::<u64>().ok());

                let language = s
                    .get("tags")
                    .and_then(|t| t.get("language"))
                    .and_then(|l| l.as_str())
                    .map(|l| l.to_string());

                let title = s
                    .get("tags")
                    .and_then(|t| t.get("title"))
                    .and_then(|t| t.as_str())
                    .map(|t| t.to_string());

                audio_probes.push(AudioStreamProbe {
                    index,
                    codec,
                    sample_rate,
                    channels,
                    channel_layout,
                    bitrate,
                    language,
                    title,
                });
            }
        }
    }

    let overall_duration_ms = (format_duration_sec * 1000.0).round() as u64;

    let result = ProbeResult {
        duration_ms: if overall_duration_ms > 0 {
            overall_duration_ms
        } else if let Some(ref v) = video_probe {
            v.duration_ms
        } else {
            0
        },
        size_bytes: file_size,
        container,
        video: video_probe,
        audio: audio_probes,
    };

    // Store in cache
    {
        let mut guard = PROBE_CACHE.lock().unwrap();
        let cache = guard.get_or_insert_with(HashMap::new);
        cache.insert(cache_key, result.clone());
    }

    Ok(result)
}

fn parse_ratio(ratio_str: &str) -> (u32, u32) {
    let parts: Vec<&str> = ratio_str.split('/').collect();
    if parts.len() == 2 {
        let num = parts[0].parse::<u32>().unwrap_or(30);
        let den = parts[1].parse::<u32>().unwrap_or(1);
        if den > 0 {
            return (num, den);
        }
    }
    (30, 1)
}

fn parse_rotation(stream: &serde_json::Value) -> u32 {
    // Check tags: rotate
    if let Some(tags) = stream.get("tags") {
        if let Some(rot_val) = tags.get("rotate").and_then(|r| r.as_str()).and_then(|r| r.parse::<i32>().ok()) {
            let normalized = (rot_val % 360 + 360) % 360;
            return normalized as u32;
        }
    }
    // Check side_data_list for displaymatrix
    if let Some(side_data) = stream.get("side_data_list").and_then(|s| s.as_array()) {
        for item in side_data {
            if let Some(rot) = item.get("rotation").and_then(|r| r.as_i64()) {
                let normalized = (rot % 360 + 360) % 360;
                return normalized as u32;
            }
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ratio() {
        assert_eq!(parse_ratio("30/1"), (30, 1));
        assert_eq!(parse_ratio("24000/1001"), (24000, 1001));
        assert_eq!(parse_ratio("60/1"), (60, 1));
        assert_eq!(parse_ratio("invalid"), (30, 1));
    }

    #[test]
    fn test_rotation_parsing() {
        let tag_json = serde_json::json!({
            "tags": {
                "rotate": "90"
            }
        });
        assert_eq!(parse_rotation(&tag_json), 90);

        let negative_json = serde_json::json!({
            "tags": {
                "rotate": "-90"
            }
        });
        assert_eq!(parse_rotation(&negative_json), 270);
    }
}
