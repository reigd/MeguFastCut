use crate::ffmpeg::sidecar::create_ffprobe_command;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

pub const DEFAULT_IMAGE_DURATION_MS: u64 = 5000;

fn default_media_kind() -> String {
    "video".to_string()
}

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
    #[serde(default = "default_media_kind")]
    pub media_kind: String, // "video" | "image" | "audio"
    pub video: Option<VideoStreamProbe>,
    pub audio: Vec<AudioStreamProbe>,
}

type ProbeCacheKey = (String, u64, u64);
type ProbeCacheMap = HashMap<ProbeCacheKey, ProbeResult>;
static PROBE_CACHE: Mutex<Option<ProbeCacheMap>> = Mutex::new(None);

const STILL_IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "jfif", "jpe", "bmp", "dib", "tif", "tiff", "heic", "heif", "avif",
    "jxl", "jp2", "j2k", "jpf", "tga", "psd", "ico", "cur", "exr", "dds", "qoi", "pcx", "ppm",
    "pgm", "pbm", "pnm", "hdr", "sgi", "wbmp", "xbm", "xpm", "svg",
];

const MAYBE_ANIMATED_IMAGE_EXTENSIONS: &[&str] = &["webp", "gif", "apng"];

const IMAGE_CONTAINER_TOKENS: &[&str] = &[
    "image2", "ico", "mjpeg", "bmp", "psd", "tiff", "dds", "qoi", "exr", "jxl", "pcx", "sgi",
    "tga", "wbmp", "xbm", "xpm", "ppm", "pgm", "pbm",
];

pub fn is_known_image_extension(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    let lower = ext.to_ascii_lowercase();
    STILL_IMAGE_EXTENSIONS.contains(&lower.as_str())
}

fn is_maybe_animated_image_extension(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
        return false;
    };
    let lower = ext.to_ascii_lowercase();
    MAYBE_ANIMATED_IMAGE_EXTENSIONS.contains(&lower.as_str())
}

fn is_image_container_name(container: &str) -> bool {
    container.split(',').any(|token| {
        let trimmed = token.trim().to_ascii_lowercase();
        trimmed.ends_with("_pipe") || IMAGE_CONTAINER_TOKENS.contains(&trimmed.as_str())
    })
}

fn detect_still_image(
    path: &Path,
    container: &str,
    video_stream: &serde_json::Value,
    duration_sec: f64,
    has_audio: bool,
) -> bool {
    if has_audio {
        return false;
    }

    let still_disp = video_stream
        .get("disposition")
        .and_then(|d| d.get("still_image"))
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    if still_disp == 1 {
        return true;
    }

    let nb_frames = video_stream
        .get("nb_frames")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| video_stream.get("nb_frames").and_then(|v| v.as_u64()));

    let has_multiple_frames = nb_frames.is_some_and(|n| n > 1);
    let has_real_duration = duration_sec > 0.15;

    if is_maybe_animated_image_extension(path) {
        return !has_multiple_frames && !has_real_duration;
    }

    if is_known_image_extension(path) {
        return !has_multiple_frames || !has_real_duration;
    }

    if is_image_container_name(container) {
        return !has_multiple_frames && !has_real_duration;
    }

    let codec = video_stream
        .get("codec_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let is_still_codec = matches!(
        codec.as_str(),
        "png"
            | "mjpeg"
            | "webp"
            | "bmp"
            | "tiff"
            | "targa"
            | "psd"
            | "exr"
            | "dds"
            | "qoi"
            | "pcx"
            | "jpeg2000"
            | "jpegxl"
            | "ppm"
            | "pgm"
            | "pbm"
            | "sgi"
            | "wbmp"
    );

    is_still_codec && !has_multiple_frames && !has_real_duration
}

pub fn probe_media_file(path_str: &str) -> Result<ProbeResult, String> {
    let path = Path::new(path_str);
    if !path.exists() {
        return Err(format!("File not found: {}", path_str));
    }

    let metadata = fs::metadata(path).map_err(|e| format!("Cannot read file metadata: {}", e))?;
    let file_size = metadata.len();
    let mtime = metadata
        .modified()
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        })
        .unwrap_or(0);

    let cache_key = (path_str.to_string(), mtime, file_size);

    // 1. Check cache
    {
        let mut guard = PROBE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
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
        return Err(format!(
            "ffprobe exited with error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let json_val: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe json output: {}", e))?;

    let format_obj = json_val
        .get("format")
        .ok_or("Missing 'format' in ffprobe output")?;
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
    let mut video_stream_raw: Option<&serde_json::Value> = None;
    let mut audio_probes: Vec<AudioStreamProbe> = Vec::new();

    if let Some(streams) = json_val.get("streams").and_then(|v| v.as_array()) {
        for s in streams {
            let codec_type = s.get("codec_type").and_then(|v| v.as_str()).unwrap_or("");
            if codec_type == "video" && video_probe.is_none() {
                // Skip embedded album cover art streams in audio containers
                let attached_pic = s
                    .get("disposition")
                    .and_then(|d| d.get("attached_pic"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0);
                if attached_pic == 1 {
                    continue;
                }

                let codec = s
                    .get("codec_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let width = s.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let height = s.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let pix_fmt = s
                    .get("pix_fmt")
                    .and_then(|v| v.as_str())
                    .unwrap_or("yuv420p")
                    .to_string();

                let (fps_num, fps_den) = parse_ratio(
                    s.get("r_frame_rate")
                        .and_then(|v| v.as_str())
                        .unwrap_or("30/1"),
                );

                let stream_duration_sec: f64 = s
                    .get("duration")
                    .and_then(|v| v.as_str())
                    .and_then(|val| val.parse::<f64>().ok())
                    .unwrap_or(format_duration_sec);

                let bitrate = s
                    .get("bit_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|b| b.parse::<u64>().ok());

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
                video_stream_raw = Some(s);
            } else if codec_type == "audio" {
                let index = s.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                let codec = s
                    .get("codec_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();
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

    let is_still_image = match video_stream_raw {
        Some(raw) => detect_still_image(
            path,
            &container,
            raw,
            format_duration_sec,
            !audio_probes.is_empty(),
        ),
        None => false,
    };

    let media_kind = if is_still_image {
        "image".to_string()
    } else if video_probe.is_some() {
        "video".to_string()
    } else if !audio_probes.is_empty() {
        "audio".to_string()
    } else {
        return Err("No supported video, image, or audio streams found in file".to_string());
    };

    if is_still_image {
        if let Some(ref mut v) = video_probe {
            v.duration_ms = DEFAULT_IMAGE_DURATION_MS;
            v.fps_num = 30;
            v.fps_den = 1;
        }
    }

    let overall_duration_ms = if is_still_image {
        DEFAULT_IMAGE_DURATION_MS
    } else {
        let fmt_ms = (format_duration_sec * 1000.0).round() as u64;
        if fmt_ms > 0 {
            fmt_ms
        } else if let Some(ref v) = video_probe {
            v.duration_ms
        } else {
            0
        }
    };

    let result = ProbeResult {
        duration_ms: overall_duration_ms,
        size_bytes: file_size,
        container,
        media_kind,
        video: video_probe,
        audio: audio_probes,
    };

    // Store in cache
    {
        let mut guard = PROBE_CACHE.lock().unwrap_or_else(|e| e.into_inner());
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
        if den > 0 && num > 0 {
            return (num, den);
        }
    }
    (30, 1)
}

fn parse_rotation(stream: &serde_json::Value) -> u32 {
    // Check tags: rotate
    if let Some(tags) = stream.get("tags") {
        if let Some(rot_val) = tags
            .get("rotate")
            .and_then(|r| r.as_str())
            .and_then(|r| r.parse::<i32>().ok())
        {
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
    use crate::ffmpeg::sidecar::create_ffmpeg_command;

    #[test]
    fn test_parse_ratio() {
        assert_eq!(parse_ratio("30/1"), (30, 1));
        assert_eq!(parse_ratio("24000/1001"), (24000, 1001));
        assert_eq!(parse_ratio("60/1"), (60, 1));
        assert_eq!(parse_ratio("0/0"), (30, 1));
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

    #[test]
    fn test_probe_still_images_and_animated_gif() {
        let check = create_ffmpeg_command(["-version"]).output();
        if !matches!(check, Ok(o) if o.status.success()) {
            return;
        }

        let tmp_dir = std::env::temp_dir().join(format!(
            "megufastcut-probe-img-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let png_path = tmp_dir.join("sample.png");
        let jpg_path = tmp_dir.join("sample.jpg");
        let webp_path = tmp_dir.join("sample.webp");
        let tiff_path = tmp_dir.join("sample.tiff");
        let gif_path = tmp_dir.join("anim.gif");

        for p in [&png_path, &jpg_path, &webp_path, &tiff_path] {
            let status = create_ffmpeg_command([
                "-y",
                "-f",
                "lavfi",
                "-i",
                "color=c=red:s=320x180:d=0.1",
                "-frames:v",
                "1",
                &p.to_string_lossy(),
            ])
            .output()
            .unwrap();
            assert!(status.status.success(), "Failed to create {:?}", p);

            let res = probe_media_file(&p.to_string_lossy()).expect("Failed to probe image");
            assert_eq!(res.media_kind, "image", "Expected image kind for {:?}", p);
            assert_eq!(res.duration_ms, DEFAULT_IMAGE_DURATION_MS);
            let v = res.video.expect("Image must have video stream dimensions");
            assert_eq!(v.width, 320);
            assert_eq!(v.height, 180);
        }

        // Animated GIF should be probed as video with real duration
        let gif_status = create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=1:size=160x120:rate=10",
            &gif_path.to_string_lossy(),
        ])
        .output()
        .unwrap();
        assert!(gif_status.status.success());
        let gif_res = probe_media_file(&gif_path.to_string_lossy()).expect("Failed to probe GIF");
        assert_eq!(gif_res.media_kind, "video");
        assert!(gif_res.duration_ms >= 900);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
