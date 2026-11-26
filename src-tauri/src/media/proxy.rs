use crate::ffmpeg::sidecar::create_ffmpeg_command;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, Once};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

static PROXY_GEN_MUTEX: Mutex<()> = Mutex::new(());
static STARTUP_CLEANUP_ONCE: Once = Once::new();

const PROXY_FILE_PREFIX: &str = ".megufastcut-proxy-";
const PROXY_TMP_PREFIX: &str = ".megufastcut-tmp-proxy-";
const IMAGE_PROXY_PREFIX: &str = ".megufastcut-imgproxy-";
const SVG_RASTER_PREFIX: &str = ".megufastcut-svg-";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviewQuality {
    Original,
    P1080,
    P720,
    P480,
}

impl PreviewQuality {
    pub fn from_str_opt(value: Option<&str>) -> Self {
        match value.map(|s| s.trim().to_lowercase()).as_deref() {
            Some("original") | Some("full") => Self::Original,
            Some("1080p") | Some("high") => Self::P1080,
            Some("480p") | Some("low") | Some("draft") => Self::P480,
            Some("720p") | Some("fast") | Some("medium") | None => Self::P720,
            _ => Self::P720,
        }
    }

    pub fn tag(self) -> &'static str {
        match self {
            Self::Original => "original",
            Self::P1080 => "1080p",
            Self::P720 => "720p",
            Self::P480 => "480p",
        }
    }

    pub fn max_short_side(self) -> Option<u32> {
        match self {
            Self::Original => None,
            Self::P1080 => Some(1080),
            Self::P720 => Some(720),
            Self::P480 => Some(480),
        }
    }

    pub fn crf(self) -> &'static str {
        match self {
            Self::Original => "18",
            Self::P1080 => "21",
            Self::P720 => "26",
            Self::P480 => "29",
        }
    }

    pub fn preset(self) -> &'static str {
        match self {
            Self::Original | Self::P1080 => "veryfast",
            Self::P720 | Self::P480 => "ultrafast",
        }
    }
}

pub fn needs_proxy(codec: &str) -> bool {
    let lower = codec.to_lowercase();
    matches!(
        lower.as_str(),
        "hevc"
            | "h265"
            | "prores"
            | "dnxhd"
            | "mpeg2video"
            | "mpeg1video"
            | "mpeg4"
            | "msmpeg4v3"
            | "msmpeg4v2"
            | "vc1"
            | "wmv1"
            | "wmv2"
            | "wmv3"
            | "flv1"
            | "vp6"
            | "vp6f"
            | "rawvideo"
            | "mjpeg"
            | "gif"
            | "apng"
            | "qtrle"
            | "utvideo"
            | "ffv1"
            | "huffyuv"
            | "theora"
            | "h263"
            | "cinepak"
    )
}

fn round_even(value: f64) -> u32 {
    ((value / 2.0).round().max(1.0) as u32) * 2
}

/// Computes target (width, height) for a preview proxy, always returning even dimensions
/// and scaling by the shorter side so both 16:9 and 9:16 videos keep standard quality tiers.
pub fn compute_proxy_dimensions(
    source_w: u32,
    source_h: u32,
    quality: PreviewQuality,
) -> (u32, u32) {
    if source_w == 0 || source_h == 0 {
        return (1280, 720);
    }
    let Some(cap) = quality.max_short_side() else {
        return (round_even(source_w as f64), round_even(source_h as f64));
    };

    let short_side = source_w.min(source_h);
    if short_side <= cap {
        return (round_even(source_w as f64), round_even(source_h as f64));
    }

    let scale = cap as f64 / short_side as f64;
    let target_w = round_even(source_w as f64 * scale);
    let target_h = round_even(source_h as f64 * scale);
    (target_w, target_h)
}

pub fn build_proxy_scale_filter(
    source_w: Option<u32>,
    source_h: Option<u32>,
    quality: PreviewQuality,
) -> String {
    if let (Some(w), Some(h)) = (source_w, source_h) {
        if w > 0 && h > 0 {
            let (tw, th) = compute_proxy_dimensions(w, h, quality);
            return format!("scale={}:{}", tw, th);
        }
    }

    match quality.max_short_side() {
        Some(cap) => format!("scale=-2:'trunc(min({},ih)/2)*2'", cap),
        None => "scale=trunc(iw/2)*2:trunc(ih/2)*2".to_string(),
    }
}

fn fnv1a_64(bytes: &[u8]) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for &b in bytes {
        hash ^= b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn build_cache_key(input_path: &Path, tag: &str) -> String {
    let mut key_buf = String::new();
    key_buf.push_str(&input_path.to_string_lossy().to_lowercase());
    key_buf.push('|');
    if let Ok(meta) = std::fs::metadata(input_path) {
        key_buf.push_str(&meta.len().to_string());
        key_buf.push('|');
        if let Ok(modified) = meta.modified() {
            if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                key_buf.push_str(&dur.as_nanos().to_string());
            }
        }
    }
    key_buf.push('|');
    key_buf.push_str(tag);
    format!("{:016x}", fnv1a_64(key_buf.as_bytes()))
}

fn cleanup_old_proxies_in_dir(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if name_str.starts_with(PROXY_FILE_PREFIX)
            || name_str.starts_with(PROXY_TMP_PREFIX)
            || name_str.starts_with(IMAGE_PROXY_PREFIX)
            || name_str.starts_with(SVG_RASTER_PREFIX)
        {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Runs startup proxy cleanup exactly once per process so it can never race with
/// and delete proxies generated during the current session.
pub fn ensure_startup_cleanup() {
    STARTUP_CLEANUP_ONCE.call_once(|| {
        cleanup_old_proxies_in_dir(&std::env::temp_dir());
    });
}

pub fn cleanup_old_proxies() {
    ensure_startup_cleanup();
}

/// Converts any FFmpeg-readable image (HEIC, HEIF, TIFF, PSD, TGA, EXR, DDS, JXL, QOI, JP2, etc.)
/// into a cached PNG in the temp directory so WebView2 <img> renders it with full alpha support.
pub fn generate_image_preview_proxy(input_path: &str) -> Result<String, String> {
    let in_path = Path::new(input_path);
    if !in_path.exists() {
        return Err(format!("Source image file not found: {}", input_path));
    }

    ensure_startup_cleanup();

    let temp_dir = std::env::temp_dir();
    let cache_hash = build_cache_key(in_path, "img-png");
    let final_path: PathBuf = temp_dir.join(format!("{}{}.png", IMAGE_PROXY_PREFIX, cache_hash));

    if let Ok(meta) = std::fs::metadata(&final_path) {
        if meta.len() > 0 {
            return Ok(final_path.to_string_lossy().to_string());
        }
    }

    let _lock = PROXY_GEN_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    if let Ok(meta) = std::fs::metadata(&final_path) {
        if meta.len() > 0 {
            return Ok(final_path.to_string_lossy().to_string());
        }
    }

    let tmp_path: PathBuf = temp_dir.join(format!("{}{}.png", PROXY_TMP_PREFIX, Uuid::new_v4()));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();

    let output = create_ffmpeg_command([
        "-y",
        "-i",
        input_path,
        "-frames:v",
        "1",
        "-vf",
        "scale='min(2048,iw)':'min(2048,ih)':force_original_aspect_ratio=decrease",
        "-c:v",
        "png",
        "-f",
        "image2",
        &tmp_path_str,
    ])
    .output()
    .map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to execute image preview conversion: {}", e)
    })?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!(
            "Image preview conversion failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    if !std::fs::metadata(&tmp_path).is_ok_and(|m| m.len() > 0) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err("Image preview conversion produced an empty file".to_string());
    }

    if let Err(err) = std::fs::rename(&tmp_path, &final_path) {
        if std::fs::metadata(&final_path).is_ok_and(|m| m.len() > 0) {
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(final_path.to_string_lossy().to_string());
        }
        let fallback_path = temp_dir.join(format!(
            "{}{}-{}.png",
            IMAGE_PROXY_PREFIX,
            cache_hash,
            Uuid::new_v4().simple()
        ));
        if std::fs::rename(&tmp_path, &fallback_path).is_ok() {
            return Ok(fallback_path.to_string_lossy().to_string());
        }
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to finalize image preview file: {}", err));
    }

    Ok(final_path.to_string_lossy().to_string())
}

/// Saves a rasterized PNG (from frontend SVG decoding) into a session temp file so FFmpeg can
/// probe and composite SVG artwork identically to raster images.
pub fn save_rasterized_svg_png(source_path: &str, png_base64: &str) -> Result<String, String> {
    let in_path = Path::new(source_path);
    if !in_path.exists() {
        return Err(format!("Source SVG file not found: {}", source_path));
    }

    ensure_startup_cleanup();

    let raw_b64 = png_base64
        .strip_prefix("data:image/png;base64,")
        .unwrap_or(png_base64)
        .trim();
    const MAX_SVG_PNG_B64_LEN: usize = 45 * 1024 * 1024; // ~32 MB decoded
    if raw_b64.len() > MAX_SVG_PNG_B64_LEN {
        return Err("Rasterized PNG data exceeds maximum supported size".to_string());
    }
    let bytes = BASE64
        .decode(raw_b64)
        .map_err(|e| format!("Invalid rasterized PNG data: {}", e))?;
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < PNG_SIGNATURE.len() || &bytes[..8] != PNG_SIGNATURE {
        return Err("Rasterized SVG payload is not a valid PNG image".to_string());
    }

    let temp_dir = std::env::temp_dir();
    let cache_hash = build_cache_key(in_path, "svg-raster");
    let final_path: PathBuf = temp_dir.join(format!("{}{}.png", SVG_RASTER_PREFIX, cache_hash));
    let tmp_path: PathBuf = temp_dir.join(format!("{}{}.png", PROXY_TMP_PREFIX, Uuid::new_v4()));

    std::fs::write(&tmp_path, &bytes)
        .map_err(|e| format!("Failed to write rasterized SVG temp file: {}", e))?;

    if let Err(err) = std::fs::rename(&tmp_path, &final_path) {
        if std::fs::metadata(&final_path).is_ok_and(|m| m.len() > 0) {
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(final_path.to_string_lossy().to_string());
        }
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to finalize rasterized SVG file: {}", err));
    }

    Ok(final_path.to_string_lossy().to_string())
}

pub fn generate_proxy_file(
    input_path: &str,
    quality_str: Option<&str>,
    source_width: Option<u32>,
    source_height: Option<u32>,
    force_rebuild: bool,
) -> Result<String, String> {
    let in_path = Path::new(input_path);
    if !in_path.exists() {
        return Err(format!("Source video file not found: {}", input_path));
    }

    // Wait for one-time startup cleanup before checking or writing session proxies
    ensure_startup_cleanup();

    let quality = PreviewQuality::from_str_opt(quality_str);
    let temp_dir = std::env::temp_dir();
    let cache_hash = build_cache_key(in_path, quality.tag());
    let final_path: PathBuf = temp_dir.join(format!(
        "{}{}-{}.mp4",
        PROXY_FILE_PREFIX,
        cache_hash,
        quality.tag()
    ));

    // Fast path: return cached session proxy if already built
    if !force_rebuild {
        if let Ok(meta) = std::fs::metadata(&final_path) {
            if meta.len() > 0 {
                return Ok(final_path.to_string_lossy().to_string());
            }
        }
    }

    // Serialize proxy encoding to prevent CPU/process storms when switching rapidly
    let _lock = PROXY_GEN_MUTEX.lock().unwrap_or_else(|e| e.into_inner());

    // Re-check cache after acquiring lock in case another call just completed it
    if !force_rebuild {
        if let Ok(meta) = std::fs::metadata(&final_path) {
            if meta.len() > 0 {
                return Ok(final_path.to_string_lossy().to_string());
            }
        }
    } else {
        let _ = std::fs::remove_file(&final_path);
    }

    let tmp_path: PathBuf = temp_dir.join(format!("{}{}.mp4", PROXY_TMP_PREFIX, Uuid::new_v4()));
    let tmp_path_str = tmp_path.to_string_lossy().to_string();
    let scale_filter = build_proxy_scale_filter(source_width, source_height, quality);

    let output = create_ffmpeg_command([
        "-y",
        "-threads",
        "4",
        "-i",
        input_path,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        &scale_filter,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        quality.crf(),
        "-preset",
        quality.preset(),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        &tmp_path_str,
    ])
    .output()
    .map_err(|e| {
        let _ = std::fs::remove_file(&tmp_path);
        format!("Failed to execute proxy generation: {}", e)
    })?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!(
            "Proxy generation failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    if !std::fs::metadata(&tmp_path).is_ok_and(|m| m.len() > 0) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err("Proxy generation produced an empty file".to_string());
    }

    if force_rebuild {
        let _ = std::fs::remove_file(&final_path);
    }

    if let Err(err) = std::fs::rename(&tmp_path, &final_path) {
        if !force_rebuild && std::fs::metadata(&final_path).is_ok_and(|m| m.len() > 0) {
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(final_path.to_string_lossy().to_string());
        }
        // If Windows still holds a reader lock on final_path, keep the rebuilt file under
        // a unique PROXY_FILE_PREFIX path so next startup cleanup removes it cleanly.
        let fallback_path = temp_dir.join(format!(
            "{}{}-{}-{}.mp4",
            PROXY_FILE_PREFIX,
            cache_hash,
            quality.tag(),
            Uuid::new_v4().simple()
        ));
        if std::fs::rename(&tmp_path, &fallback_path).is_ok() {
            return Ok(fallback_path.to_string_lossy().to_string());
        }
        let _ = std::fs::remove_file(&tmp_path);
        return Err(format!("Failed to finalize proxy file: {}", err));
    }

    Ok(final_path.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_quality_parsing() {
        assert_eq!(PreviewQuality::from_str_opt(Some("original")), PreviewQuality::Original);
        assert_eq!(PreviewQuality::from_str_opt(Some("1080p")), PreviewQuality::P1080);
        assert_eq!(PreviewQuality::from_str_opt(Some("720p")), PreviewQuality::P720);
        assert_eq!(PreviewQuality::from_str_opt(Some("480p")), PreviewQuality::P480);
        assert_eq!(PreviewQuality::from_str_opt(None), PreviewQuality::P720);
    }

    #[test]
    fn test_compute_proxy_dimensions_landscape_and_portrait_even() {
        // 4K 16:9 -> 1080p / 720p / 480p
        assert_eq!(compute_proxy_dimensions(3840, 2160, PreviewQuality::Original), (3840, 2160));
        assert_eq!(compute_proxy_dimensions(3840, 2160, PreviewQuality::P1080), (1920, 1080));
        assert_eq!(compute_proxy_dimensions(3840, 2160, PreviewQuality::P720), (1280, 720));
        assert_eq!(compute_proxy_dimensions(3840, 2160, PreviewQuality::P480), (854, 480));

        // Vertical 1080x1920 -> 720p scales short side to 720x1280
        assert_eq!(compute_proxy_dimensions(1080, 1920, PreviewQuality::P1080), (1080, 1920));
        assert_eq!(compute_proxy_dimensions(1080, 1920, PreviewQuality::P720), (720, 1280));
        assert_eq!(compute_proxy_dimensions(1080, 1920, PreviewQuality::P480), (480, 854));

        // Odd dimensions are rounded to even
        let (w, h) = compute_proxy_dimensions(853, 479, PreviewQuality::Original);
        assert_eq!(w % 2, 0);
        assert_eq!(h % 2, 0);
    }

    #[test]
    fn test_build_proxy_scale_filter() {
        assert_eq!(
            build_proxy_scale_filter(Some(1920), Some(1080), PreviewQuality::P720),
            "scale=1280:720"
        );
        assert_eq!(
            build_proxy_scale_filter(None, None, PreviewQuality::Original),
            "scale=trunc(iw/2)*2:trunc(ih/2)*2"
        );
    }

    #[test]
    fn test_cleanup_old_proxies_in_dir_removes_only_proxy_files() {
        let test_dir = std::env::temp_dir().join(format!("megu-proxy-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&test_dir).unwrap();

        let proxy_file = test_dir.join(format!("{}abc123-original.mp4", PROXY_FILE_PREFIX));
        let tmp_proxy = test_dir.join(format!("{}tmp999.mp4", PROXY_TMP_PREFIX));
        let img_proxy = test_dir.join(format!("{}abc123.png", IMAGE_PROXY_PREFIX));
        let svg_raster = test_dir.join(format!("{}def456.png", SVG_RASTER_PREFIX));
        let unrelated = test_dir.join("keep-me.mp4");

        std::fs::write(&proxy_file, b"old proxy").unwrap();
        std::fs::write(&tmp_proxy, b"partial tmp").unwrap();
        std::fs::write(&img_proxy, b"old img proxy").unwrap();
        std::fs::write(&svg_raster, b"old svg raster").unwrap();
        std::fs::write(&unrelated, b"user data").unwrap();

        cleanup_old_proxies_in_dir(&test_dir);

        assert!(!proxy_file.exists());
        assert!(!tmp_proxy.exists());
        assert!(!img_proxy.exists());
        assert!(!svg_raster.exists());
        assert!(unrelated.exists());

        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_ensure_startup_cleanup_is_one_shot_and_preserves_new_session_proxies() {
        ensure_startup_cleanup();
        let marker = std::env::temp_dir().join(format!(
            "{}session-preserve-{}.mp4",
            PROXY_FILE_PREFIX,
            Uuid::new_v4()
        ));
        std::fs::write(&marker, b"fresh session proxy").unwrap();

        // Calling cleanup again in the same session must NOT remove freshly created proxies
        cleanup_old_proxies();
        assert!(marker.exists());

        let _ = std::fs::remove_file(&marker);
    }

    #[test]
    fn test_generate_image_preview_proxy_from_tiff() {
        let check = create_ffmpeg_command(["-version"]).output();
        if !matches!(check, Ok(o) if o.status.success()) {
            return;
        }
        let test_dir = std::env::temp_dir().join(format!("megu-imgproxy-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&test_dir).unwrap();
        let tiff_path = test_dir.join("sample.tiff");

        let gen = create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=green:s=320x180:d=0.1",
            "-frames:v",
            "1",
            &tiff_path.to_string_lossy(),
        ])
        .output()
        .unwrap();
        assert!(gen.status.success());

        let png_proxy = generate_image_preview_proxy(&tiff_path.to_string_lossy())
            .expect("TIFF preview proxy failed");
        assert!(png_proxy.ends_with(".png"));
        let probe = crate::media::probe::probe_media_file(&png_proxy).unwrap();
        assert_eq!(probe.media_kind, "image");
        assert_eq!(probe.video.as_ref().map(|v| v.codec.as_str()), Some("png"));

        let _ = std::fs::remove_file(&png_proxy);
        let _ = std::fs::remove_dir_all(&test_dir);
    }

    #[test]
    fn test_generate_proxy_after_deletion_and_force_rebuild_end_to_end() {
        let test_dir = std::env::temp_dir().join(format!("megu-proxy-e2e-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&test_dir).unwrap();
        let src_hevc = test_dir.join("sample_hevc.mp4");
        let src_str = src_hevc.to_string_lossy().to_string();

        // Create a tiny 0.5s HEVC clip using the bundled ffmpeg sidecar
        let gen = create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=0.5:size=320x180:rate=30",
            "-c:v",
            "libx265",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "ultrafast",
            &src_str,
        ])
        .output()
        .expect("Failed to execute bundled ffmpeg");
        assert!(
            gen.status.success(),
            "Failed to generate test HEVC source: {}",
            String::from_utf8_lossy(&gen.stderr)
        );

        // 1. Initial proxy generation
        let proxy1 = generate_proxy_file(&src_str, Some("original"), Some(320), Some(180), false)
            .expect("Initial proxy generation failed");
        let probe1 = crate::media::probe::probe_media_file(&proxy1).expect("Failed to probe proxy1");
        assert_eq!(probe1.video.as_ref().map(|v| v.codec.as_str()), Some("h264"));
        assert_eq!(probe1.video.as_ref().map(|v| v.pix_fmt.as_str()), Some("yuv420p"));

        // 2. Simulate app restart deleting the temp proxy; re-requesting regenerates it cleanly
        let _ = std::fs::remove_file(&proxy1);
        assert!(!Path::new(&proxy1).exists());
        let proxy2 = generate_proxy_file(&src_str, Some("original"), Some(320), Some(180), false)
            .expect("Regeneration after deletion failed");
        assert!(Path::new(&proxy2).exists());
        let probe2 = crate::media::probe::probe_media_file(&proxy2).expect("Failed to probe proxy2");
        assert_eq!(probe2.video.as_ref().map(|v| v.codec.as_str()), Some("h264"));

        // 3. Simulate corrupt cached proxy and verify force_rebuild replaces it with a valid file
        std::fs::write(&proxy2, b"corrupt-proxy-bytes").unwrap();
        let proxy3 = generate_proxy_file(&src_str, Some("original"), Some(320), Some(180), true)
            .expect("Force rebuild failed");
        let probe3 = crate::media::probe::probe_media_file(&proxy3).expect("Failed to probe proxy3");
        assert_eq!(probe3.video.as_ref().map(|v| v.codec.as_str()), Some("h264"));

        let _ = std::fs::remove_file(&proxy1);
        let _ = std::fs::remove_file(&proxy2);
        let _ = std::fs::remove_file(&proxy3);
        let _ = std::fs::remove_dir_all(&test_dir);
    }
}
