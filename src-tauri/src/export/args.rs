use super::{ExportAspect, ExportClip, ExportCrop, ExportJob, ExportSource};

pub fn make_even(n: f64) -> u32 {
    let rounded = n.round() as u32;
    if rounded.is_multiple_of(2) {
        rounded
    } else {
        rounded + 1
    }
}

pub fn resolve_aspect_ratio(aspect: &ExportAspect, src_w: f64, src_h: f64) -> f64 {
    match aspect.id.as_str() {
        "16:9" => 16.0 / 9.0,
        "9:16" => 9.0 / 16.0,
        "1:1" => 1.0,
        "4:5" => 4.0 / 5.0,
        "4:3" => 4.0 / 3.0,
        "21:9" => 21.0 / 9.0,
        "2:3" => 2.0 / 3.0,
        "custom" => {
            if let (Some(w), Some(h)) = (aspect.custom_w, aspect.custom_h) {
                if h > 0 {
                    return w as f64 / h as f64;
                }
            }
            if src_w > 0.0 && src_h > 0.0 {
                src_w / src_h
            } else {
                16.0 / 9.0
            }
        }
        _ => {
            if src_w > 0.0 && src_h > 0.0 {
                src_w / src_h
            } else {
                16.0 / 9.0
            }
        }
    }
}

fn resolve_target_fps(job: &ExportJob) -> u32 {
    match job.output.fps_mode.as_str() {
        "60" => 60,
        "24" => 24,
        _ => 30,
    }
}

fn clean_pad_color(job: &ExportJob) -> String {
    let color = job.padding.color.as_deref().unwrap_or("black");
    if let Some(stripped) = color.strip_prefix('#') {
        format!("0x{}", stripped)
    } else {
        color.to_string()
    }
}

fn compute_canvas_dimensions(
    primary_src: &ExportSource,
    primary_rotate: u32,
    job: &ExportJob,
) -> (u32, u32) {
    let raw_w = primary_src.width.unwrap_or(1920) as f64;
    let raw_h = primary_src.height.unwrap_or(1080) as f64;
    let (src_w, src_h) = if primary_rotate == 90 || primary_rotate == 270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };

    let has_custom_crop = job.crop.width > 0.0
        && job.crop.height > 0.0
        && (job.crop.width < 0.999
            || job.crop.height < 0.999
            || job.crop.x > 0.001
            || job.crop.y > 0.001);

    let target_ratio =
        if job.fit_mode == "crop" && job.aspect.id == "original" && has_custom_crop {
            let cw = make_even(job.crop.width * src_w) as f64;
            let ch = make_even(job.crop.height * src_h).max(2) as f64;
            cw / ch
        } else {
            resolve_aspect_ratio(&job.aspect, src_w, src_h)
        };

    let target_h = match job.output.resolution_mode.as_str() {
        "2160p" => 2160.0,
        "1440p" => 1440.0,
        "1080p" => 1080.0,
        "720p" => 720.0,
        "480p" => 480.0,
        _ => {
            if target_ratio < 1.0 && src_w >= src_h {
                src_h.max(1920.0)
            } else {
                src_h
            }
        }
    };

    let target_w = make_even(target_h * target_ratio).max(2);
    let target_h = make_even(target_h).max(2);
    (target_w, target_h)
}

fn default_overlay_bounds(
    source: &ExportSource,
    rotate: u32,
    canvas_w: u32,
    canvas_h: u32,
) -> ExportCrop {
    let raw_w = source.width.unwrap_or(640).max(1) as f64;
    let raw_h = source.height.unwrap_or(360).max(1) as f64;
    let (src_w, src_h) = if rotate == 90 || rotate == 270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };
    let src_ratio = src_w / src_h;
    let canvas_ratio = canvas_w.max(1) as f64 / canvas_h.max(1) as f64;
    let max_frac = 0.6;

    let (norm_w, norm_h) = if src_ratio > canvas_ratio {
        let w = max_frac;
        let h = (w * canvas_ratio) / src_ratio;
        (w, h)
    } else {
        let h = max_frac;
        let w = (h * src_ratio) / canvas_ratio;
        (w, h)
    };

    ExportCrop {
        x: (1.0 - norm_w) / 2.0,
        y: (1.0 - norm_h) / 2.0,
        width: norm_w,
        height: norm_h,
    }
}

pub fn select_video_codec_encoder(
    container: &str,
    codec: Option<&str>,
    hw: &str,
    quality: &str,
    custom_crf: Option<u32>,
) -> Vec<String> {
    let crf = custom_crf.unwrap_or(match quality {
        "high" => 18,
        "small" => 28,
        _ => 23, // balanced
    });

    let selected_codec = codec.unwrap_or(match container {
        "mp4_hevc" | "hevc" => "hevc",
        "webm_vp9" | "vp9" => "vp9",
        "webm_av1" | "av1" => "av1",
        "mov" | "prores" => "prores",
        "gif" => "gif",
        "copy" => "copy",
        _ => "h264",
    });

    match selected_codec {
        "hevc" => match hw {
            "nvenc" => vec![
                "-c:v".into(),
                "hevc_nvenc".into(),
                "-preset".into(),
                "p4".into(),
                "-cq".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            "qsv" => vec![
                "-c:v".into(),
                "hevc_qsv".into(),
                "-global_quality".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "nv12".into(),
            ],
            "amf" => vec![
                "-c:v".into(),
                "hevc_amf".into(),
                "-qp_i".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            _ => vec![
                "-c:v".into(),
                "libx265".into(),
                "-preset".into(),
                "veryfast".into(),
                "-crf".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
        },
        "av1" => match hw {
            "nvenc" => vec![
                "-c:v".into(),
                "av1_nvenc".into(),
                "-preset".into(),
                "p4".into(),
                "-cq".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            "qsv" => vec![
                "-c:v".into(),
                "av1_qsv".into(),
                "-global_quality".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "nv12".into(),
            ],
            "amf" => vec![
                "-c:v".into(),
                "av1_amf".into(),
                "-qp_i".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            _ => vec![
                "-c:v".into(),
                "libsvtav1".into(),
                "-crf".into(),
                crf.to_string(),
                "-preset".into(),
                "6".into(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
        },
        "vp9" => vec![
            "-c:v".into(),
            "libvpx-vp9".into(),
            "-crf".into(),
            crf.to_string(),
            "-b:v".into(),
            "0".into(),
        ],
        "prores" => vec![
            "-c:v".into(),
            "prores_ks".into(),
            "-profile:v".into(),
            "3".into(), // ProRes 422 HQ
            "-pix_fmt".into(),
            "yuv422p10le".into(),
        ],
        "copy" => vec!["-c:v".into(), "copy".into()],
        "gif" => vec![],
        _ => match hw {
            "nvenc" => vec![
                "-c:v".into(),
                "h264_nvenc".into(),
                "-preset".into(),
                "p4".into(),
                "-cq".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            "qsv" => vec![
                "-c:v".into(),
                "h264_qsv".into(),
                "-global_quality".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "nv12".into(),
            ],
            "amf" => vec![
                "-c:v".into(),
                "h264_amf".into(),
                "-qp_i".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
            _ => vec![
                "-c:v".into(),
                "libx264".into(),
                "-preset".into(),
                "veryfast".into(),
                "-crf".into(),
                crf.to_string(),
                "-pix_fmt".into(),
                "yuv420p".into(),
            ],
        },
    }
}

pub fn select_video_encoder(
    format: &str,
    hw: &str,
    quality: &str,
    custom_crf: Option<u32>,
) -> Vec<String> {
    select_video_codec_encoder(format, None, hw, quality, custom_crf)
}

pub fn select_video_audio_encoder(
    container: &str,
    codec: Option<&str>,
    is_copy: bool,
) -> Vec<String> {
    if is_copy {
        return vec!["-c:a".into(), "copy".into()];
    }

    let selected = codec.unwrap_or(match container {
        "webm_vp9" | "webm_av1" | "webm" => "opus",
        _ => "aac",
    });

    match selected {
        "mp3" => vec![
            "-c:a".into(),
            "libmp3lame".into(),
            "-b:a".into(),
            "192k".into(),
        ],
        "opus" => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), "160k".into()],
        "pcm" => vec!["-c:a".into(), "pcm_s16le".into()],
        "copy" => vec!["-c:a".into(), "copy".into()],
        _ => vec!["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()],
    }
}

pub fn select_standalone_audio_encoder(format: &str, bitrate: Option<&str>) -> Vec<String> {
    let b = bitrate.unwrap_or("320k");
    let rate = if b.ends_with('k') {
        b.to_string()
    } else {
        format!("{}k", b)
    };

    match format {
        "audio_wav" | "wav" => vec!["-vn".into(), "-c:a".into(), "pcm_s16le".into()],
        "audio_flac" | "flac" => vec!["-vn".into(), "-c:a".into(), "flac".into()],
        "audio_aac" | "m4a" | "aac" => {
            vec!["-vn".into(), "-c:a".into(), "aac".into(), "-b:a".into(), rate]
        }
        "audio_ogg" | "ogg" | "opus" => vec![
            "-vn".into(),
            "-c:a".into(),
            "libopus".into(),
            "-b:a".into(),
            rate,
        ],
        _ => vec![
            "-vn".into(),
            "-c:a".into(),
            "libmp3lame".into(),
            "-b:a".into(),
            rate,
        ],
    }
}

pub fn select_audio_encoder(format: &str, is_copy: bool) -> Vec<String> {
    select_video_audio_encoder(format, None, is_copy)
}

fn build_canvas_bounds_filter(
    bounds: &ExportCrop,
    target_w: u32,
    target_h: u32,
    clean_color: &str,
) -> String {
    let scaled_w = make_even((bounds.width * target_w as f64).max(2.0));
    let scaled_h = make_even((bounds.height * target_h as f64).max(2.0));
    let pos_x = (bounds.x * target_w as f64).round() as i32;
    let pos_y = (bounds.y * target_h as f64).round() as i32;

    let mut parts = vec![format!("scale=w={}:h={}", scaled_w, scaled_h)];

    let crop_left = (-pos_x).max(0) as u32;
    let crop_top = (-pos_y).max(0) as u32;
    let vis_right = (pos_x + scaled_w as i32).min(target_w as i32).max(0) as u32;
    let vis_bottom = (pos_y + scaled_h as i32).min(target_h as i32).max(0) as u32;
    let raw_pad_x = (pos_x.max(0) as u32).min(target_w.saturating_sub(2));
    let raw_pad_y = (pos_y.max(0) as u32).min(target_h.saturating_sub(2));
    let pad_x = (raw_pad_x / 2) * 2;
    let pad_y = (raw_pad_y / 2) * 2;

    let raw_vis_w = vis_right
        .saturating_sub(pad_x)
        .max(2)
        .min(scaled_w.saturating_sub(crop_left));
    let raw_vis_h = vis_bottom
        .saturating_sub(pad_y)
        .max(2)
        .min(scaled_h.saturating_sub(crop_top));
    let vis_w = make_even(raw_vis_w as f64)
        .min(target_w.saturating_sub(pad_x))
        .max(2);
    let vis_h = make_even(raw_vis_h as f64)
        .min(target_h.saturating_sub(pad_y))
        .max(2);

    let crop_x = ((crop_left / 2) * 2).min(scaled_w.saturating_sub(vis_w));
    let crop_y = ((crop_top / 2) * 2).min(scaled_h.saturating_sub(vis_h));

    if vis_w < scaled_w || vis_h < scaled_h || crop_x > 0 || crop_y > 0 {
        parts.push(format!(
            "crop=w={}:h={}:x={}:y={}",
            vis_w, vis_h, crop_x, crop_y
        ));
    }

    if vis_w < target_w || vis_h < target_h || pad_x > 0 || pad_y > 0 {
        parts.push(format!(
            "pad=w={}:h={}:x={}:y={}:color={}",
            target_w, target_h, pad_x, pad_y, clean_color
        ));
    }

    parts.push("setsar=1".to_string());
    parts.join(",")
}

fn build_clip_video_filter_internal(
    clip: &ExportClip,
    source: &ExportSource,
    job: &ExportJob,
    forced_canvas: Option<(u32, u32)>,
    include_speed: bool,
) -> String {
    let mut filters = Vec::new();

    // 1. Rotation
    match clip.rotate {
        90 => filters.push("transpose=1".to_string()),
        180 => filters.push("transpose=2,transpose=2".to_string()),
        270 => filters.push("transpose=2".to_string()),
        _ => {}
    }

    // 2. Flip
    if clip.flip_h {
        filters.push("hflip".to_string());
    }
    if clip.flip_v {
        filters.push("vflip".to_string());
    }

    // 3. Geometry (Aspect & Crop/Fit/Stretch)
    let raw_w = source.width.unwrap_or(1920) as f64;
    let raw_h = source.height.unwrap_or(1080) as f64;
    let (src_w, src_h) = if clip.rotate == 90 || clip.rotate == 270 {
        (raw_h, raw_w)
    } else {
        (raw_w, raw_h)
    };

    let has_custom_crop = job.crop.width > 0.0
        && job.crop.height > 0.0
        && (job.crop.width < 0.999
            || job.crop.height < 0.999
            || job.crop.x > 0.001
            || job.crop.y > 0.001);

    let (target_w, target_h, target_ratio) = if let Some((cw, ch)) = forced_canvas {
        (cw, ch, cw as f64 / ch.max(1) as f64)
    } else {
        let ratio = if job.fit_mode == "crop" && job.aspect.id == "original" && has_custom_crop {
            let cw = make_even(job.crop.width * src_w) as f64;
            let ch = make_even(job.crop.height * src_h).max(2) as f64;
            cw / ch
        } else {
            resolve_aspect_ratio(&job.aspect, src_w, src_h)
        };

        let th = match job.output.resolution_mode.as_str() {
            "2160p" => 2160.0,
            "1440p" => 1440.0,
            "1080p" => 1080.0,
            "720p" => 720.0,
            "480p" => 480.0,
            _ => {
                if ratio < 1.0 && src_w >= src_h {
                    src_h.max(1920.0)
                } else {
                    src_h
                }
            }
        };
        let tw = make_even(th * ratio);
        let th_even = make_even(th);
        (tw, th_even, ratio)
    };

    let clean_color = clean_pad_color(job);

    match job.fit_mode.as_str() {
        "crop" => {
            let crop = &job.crop;
            if has_custom_crop {
                let cw = make_even(crop.width * src_w);
                let ch = make_even(crop.height * src_h);
                let cx = make_even(crop.x * src_w);
                let cy = make_even(crop.y * src_h);
                filters.push(format!("crop=w={}:h={}:x={}:y={}", cw, ch, cx, cy));
            } else {
                let src_ratio = src_w / src_h;
                if src_ratio > target_ratio {
                    let cw = make_even(src_h * target_ratio);
                    let ch = make_even(src_h);
                    let cx = make_even((src_w - cw as f64) / 2.0);
                    filters.push(format!("crop=w={}:h={}:x={}:y=0", cw, ch, cx));
                } else {
                    let cw = make_even(src_w);
                    let ch = make_even(src_w / target_ratio);
                    let cy = make_even((src_h - ch as f64) / 2.0);
                    filters.push(format!("crop=w={}:h={}:x=0:y={}", cw, ch, cy));
                }
            }
            filters.push(format!("scale=w={}:h={},setsar=1", target_w, target_h));
        }
        "stretch" => {
            if let Some(bounds) = &job.canvas_bounds {
                filters.push(build_canvas_bounds_filter(
                    bounds,
                    target_w,
                    target_h,
                    &clean_color,
                ));
            } else {
                filters.push(format!("scale=w={}:h={},setsar=1", target_w, target_h));
            }
        }
        _ => {
            // "fit" Letterbox / Pillarbox
            if let Some(bounds) = &job.canvas_bounds {
                filters.push(build_canvas_bounds_filter(
                    bounds,
                    target_w,
                    target_h,
                    &clean_color,
                ));
            } else {
                let src_ratio = src_w / src_h;
                if (src_ratio - target_ratio).abs() > 0.005 {
                    let (scaled_w, scaled_h) = if src_ratio > target_ratio {
                        (target_w, make_even(target_w as f64 / src_ratio))
                    } else {
                        (make_even(target_h as f64 * src_ratio), target_h)
                    };
                    let pad_x = ((target_w.saturating_sub(scaled_w)) / 2 / 2) * 2;
                    let pad_y = ((target_h.saturating_sub(scaled_h)) / 2 / 2) * 2;

                    filters.push(format!(
                        "scale=w={}:h={},pad=w={}:h={}:x={}:y={}:color={},setsar=1",
                        scaled_w, scaled_h, target_w, target_h, pad_x, pad_y, clean_color
                    ));
                } else {
                    filters.push(format!("scale=w={}:h={},setsar=1", target_w, target_h));
                }
            }
        }
    }

    // 4. Contrast Adaptive Sharpening (AMD FidelityFX CAS)
    if clip.sharpness > 0.001 {
        let strength = clip.sharpness.clamp(0.0, 1.0);
        filters.push(format!("cas=strength={:.2}", strength));
    }

    // 5. Speed (setpts)
    if include_speed && (clip.speed - 1.0).abs() > 0.001 && clip.speed > 0.0 {
        filters.push(format!("setpts=(1/{:.6})*PTS", clip.speed));
    }

    filters.join(",")
}

pub fn build_clip_video_filter(
    clip: &ExportClip,
    source: &ExportSource,
    job: &ExportJob,
) -> String {
    build_clip_video_filter_internal(clip, source, job, None, true)
}

fn build_overlay_video_chain(
    clip: &ExportClip,
    ov_w: u32,
    ov_h: u32,
) -> String {
    let mut filters = Vec::new();

    // 1. Rotation
    match clip.rotate {
        90 => filters.push("transpose=1".to_string()),
        180 => filters.push("transpose=2,transpose=2".to_string()),
        270 => filters.push("transpose=2".to_string()),
        _ => {}
    }

    // 2. Flip
    if clip.flip_h {
        filters.push("hflip".to_string());
    }
    if clip.flip_v {
        filters.push("vflip".to_string());
    }

    // 3. Preserve alpha channel for transparent PNG/WebP/VP9-alpha overlays & scale to exact box
    filters.push("format=rgba".to_string());
    filters.push(format!("scale=w={}:h={},setsar=1", ov_w, ov_h));

    // 4. Optional CAS sharpening
    if clip.sharpness > 0.001 {
        let strength = clip.sharpness.clamp(0.0, 1.0);
        filters.push(format!("cas=strength={:.2}", strength));
    }

    filters.join(",")
}

pub fn build_atempo_filters(mut speed: f64) -> Vec<String> {
    let mut filters = Vec::new();
    if speed <= 0.0 || (speed - 1.0).abs() < 0.001 {
        return filters;
    }
    while speed > 2.0 {
        filters.push("atempo=2.0".to_string());
        speed /= 2.0;
    }
    while speed < 0.5 {
        filters.push("atempo=0.5".to_string());
        speed /= 0.5;
    }
    if (speed - 1.0).abs() > 0.001 {
        if (speed - 2.0).abs() < 0.0001 {
            filters.push("atempo=2.0".to_string());
        } else if (speed - 0.5).abs() < 0.0001 {
            filters.push("atempo=0.5".to_string());
        } else {
            let formatted = format!("{:.4}", speed);
            let trimmed = formatted.trim_end_matches('0').trim_end_matches('.');
            filters.push(format!("atempo={}", trimmed));
        }
    }
    filters
}

pub fn build_audio_filter(job: &ExportJob, clip_volume_db: f64, clip_speed: f64) -> String {
    let mut filters = Vec::new();
    let net_volume_db = job.audio.volume_db + clip_volume_db;

    if net_volume_db.abs() > 0.1 {
        filters.push(format!("volume={:.1}dB", net_volume_db));
    }

    let tempo_filters = build_atempo_filters(clip_speed);
    if !tempo_filters.is_empty() {
        filters.extend(tempo_filters);
    }

    match job.audio.normalization.as_str() {
        "web" => filters.push("loudnorm=I=-14:TP=-1.5:LRA=11".to_string()),
        "broadcast" => filters.push("loudnorm=I=-23:TP=-1.0:LRA=14".to_string()),
        "cinema" => filters.push("loudnorm=I=-27:TP=-1.0:LRA=14".to_string()),
        _ => {}
    }

    filters.join(",")
}

fn is_mpeg_ts_path(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".ts") || lower.ends_with(".m2ts") || lower.ends_with(".mts")
}

fn is_mp4_compatible_video_codec(codec: Option<&str>) -> bool {
    matches!(
        codec.map(|c| c.to_ascii_lowercase()).as_deref(),
        Some("h264" | "avc1")
    )
}

fn is_mp4_compatible_audio_codec(codec: Option<&str>) -> bool {
    matches!(
        codec.map(|c| c.to_ascii_lowercase()).as_deref(),
        None | Some("aac" | "mp3" | "mp4a")
    )
}

fn is_container_compatible_audio_codec(container: &str, codec: Option<&str>) -> bool {
    let Some(c) = codec.map(|s| s.to_ascii_lowercase()) else {
        return false;
    };
    match container {
        "webm" | "webm_vp9" | "webm_av1" => matches!(c.as_str(), "opus" | "vorbis"),
        "mkv" => true,
        "mov" => matches!(
            c.as_str(),
            "aac" | "mp3" | "pcm_s16le" | "pcm_s24le" | "alac" | "mp4a"
        ),
        "avi" => matches!(c.as_str(), "mp3" | "pcm_s16le" | "ac3"),
        _ => matches!(c.as_str(), "aac" | "mp3" | "mp4a"),
    }
}

fn is_mp4_or_mov_container(container: &str, path: &str) -> bool {
    if matches!(
        container,
        "mp4" | "mp4_h264" | "mp4_hevc" | "mov" | "copy"
    ) {
        return true;
    }
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".mp4") || lower.ends_with(".mov") || lower.ends_with(".m4v")
}

fn is_clip_trimmed(clip: &ExportClip, source: &ExportSource) -> bool {
    clip.in_ms > 0 || (source.duration_ms > 0 && clip.out_ms < source.duration_ms)
}

fn effective_clip_duration_ms(clip: &ExportClip) -> u64 {
    let speed = if clip.speed > 0.0 { clip.speed } else { 1.0 };
    ((clip.out_ms.saturating_sub(clip.in_ms)) as f64 / speed).round() as u64
}

pub fn build_export_arguments(job: &ExportJob) -> Result<Vec<String>, String> {
    let enabled_clips: Vec<&ExportClip> = job.clips.iter().filter(|c| c.enabled).collect();
    if enabled_clips.is_empty() {
        return Err("No enabled clips to export".to_string());
    }

    // Partition into main track (track_index == 0) and overlay tracks (track_index > 0)
    let mut main_clips: Vec<&ExportClip> = enabled_clips
        .iter()
        .copied()
        .filter(|c| c.track_index == 0)
        .collect();
    if main_clips.iter().any(|c| c.start_ms.is_some()) {
        main_clips.sort_by_key(|c| c.start_ms.unwrap_or(0));
    }

    let mut overlay_clips: Vec<&ExportClip> = enabled_clips
        .iter()
        .copied()
        .filter(|c| c.track_index > 0)
        .collect();
    overlay_clips.sort_by_key(|c| (c.track_index, c.start_ms.unwrap_or(0)));

    // Validate & resolve sources upfront (main clips first, then overlay clips)
    let mut resolved_main: Vec<(&ExportClip, &ExportSource)> =
        Vec::with_capacity(main_clips.len());
    for clip in &main_clips {
        if clip.out_ms <= clip.in_ms {
            return Err(format!(
                "Invalid clip trim range for {}: outMs ({}) must be greater than inMs ({})",
                clip.id, clip.out_ms, clip.in_ms
            ));
        }
        let source = job
            .sources
            .iter()
            .find(|s| s.id == clip.source_id)
            .ok_or_else(|| format!("Source not found: {}", clip.source_id))?;
        resolved_main.push((*clip, source));
    }

    let mut resolved_overlays: Vec<(&ExportClip, &ExportSource)> =
        Vec::with_capacity(overlay_clips.len());
    for clip in &overlay_clips {
        if clip.out_ms <= clip.in_ms {
            return Err(format!(
                "Invalid clip trim range for {}: outMs ({}) must be greater than inMs ({})",
                clip.id, clip.out_ms, clip.in_ms
            ));
        }
        let source = job
            .sources
            .iter()
            .find(|s| s.id == clip.source_id)
            .ok_or_else(|| format!("Source not found: {}", clip.source_id))?;
        resolved_overlays.push((*clip, source));
    }

    let has_overlays = !resolved_overlays.is_empty();
    let has_any_image = resolved_main.iter().any(|(_, s)| s.is_image)
        || resolved_overlays.iter().any(|(_, s)| s.is_image);

    // Compute total timeline span across ALL tracks
    let mut main_end_ms: u64 = 0;
    for (clip, _) in &resolved_main {
        let start = clip.start_ms.unwrap_or(main_end_ms);
        let dur = effective_clip_duration_ms(clip);
        main_end_ms = main_end_ms.max(start + dur);
    }
    let mut total_timeline_ms = main_end_ms;
    for (clip, _) in &resolved_overlays {
        let start = clip.start_ms.unwrap_or(0);
        let dur = effective_clip_duration_ms(clip);
        total_timeline_ms = total_timeline_ms.max(start + dur);
    }
    let total_timeline_ms = total_timeline_ms.max(1);

    let (primary_clip, primary_src) = resolved_main
        .iter()
        .find(|(_, s)| s.width.is_some() && s.height.is_some())
        .or_else(|| {
            resolved_overlays
                .iter()
                .find(|(_, s)| s.width.is_some() && s.height.is_some())
        })
        .or_else(|| resolved_main.first())
        .or_else(|| resolved_overlays.first())
        .copied()
        .ok_or("No clips available for export")?;

    let (canvas_w, canvas_h) = compute_canvas_dimensions(primary_src, primary_clip.rotate, job);
    let target_fps = resolve_target_fps(job);
    let clean_color = clean_pad_color(job);

    let mut args: Vec<String> = vec!["-nostats".into(), "-progress".into(), "pipe:1".into()];

    let export_audio = job.output.export_audio || job.output.format.starts_with("audio_");
    let export_video =
        (job.output.export_video || !export_audio) && !job.output.format.starts_with("audio_");

    let video_path = job
        .output
        .video_output_path
        .as_deref()
        .unwrap_or(&job.output.output_path);
    let audio_path = job
        .output
        .audio_output_path
        .as_deref()
        .unwrap_or(&job.output.output_path);

    let is_audio_only = !export_video && export_audio;
    let is_both = export_video && export_audio;
    let is_gif =
        job.output.video_container.as_deref() == Some("gif") || job.output.format == "gif";

    let has_custom_crop = job.crop.x.abs() > 0.001
        || job.crop.y.abs() > 0.001
        || (job.crop.width - 1.0).abs() > 0.001
        || (job.crop.height - 1.0).abs() > 0.001;

    let explicit_stream_copy =
        job.output.format == "copy" || job.output.video_codec.as_deref() == Some("copy");

    let single_clip_no_edits = if resolved_main.len() == 1 && !has_overlays && !has_any_image {
        let (clip, _) = resolved_main[0];
        clip.start_ms.unwrap_or(0) == 0
            && job.aspect.id == "original"
            && job.fit_mode == "fit"
            && job.canvas_bounds.is_none()
            && !has_custom_crop
            && job.output.resolution_mode == "auto"
            && clip.rotate == 0
            && !clip.flip_h
            && !clip.flip_v
            && (clip.speed - 1.0).abs() < 0.001
            && clip.sharpness <= 0.001
            && job.audio.volume_db.abs() < 0.1
            && clip.volume_db.abs() < 0.1
            && !job.audio.muted
            && job.audio.normalization == "off"
    } else {
        false
    };

    // Automatic fast copy (without explicit "copy" codec) is ONLY safe when the clip is NOT trimmed
    // and its source codecs are natively compatible with MP4.
    let auto_mp4_fast_copy = if resolved_main.len() == 1 && single_clip_no_edits {
        let (clip, source) = resolved_main[0];
        job.output.format == "mp4_h264"
            && !is_clip_trimmed(clip, source)
            && is_mp4_compatible_video_codec(source.codec.as_deref())
            && is_mp4_compatible_audio_codec(source.audio_codec.as_deref())
            && job.output.quality == "balanced"
            && job.output.crf.unwrap_or(23) == 23
            && !matches!(
                job.output.audio_codec.as_deref(),
                Some("mp3" | "opus" | "pcm")
            )
    } else {
        false
    };

    let is_fast_copy = !is_audio_only
        && !is_both
        && !is_gif
        && single_clip_no_edits
        && (explicit_stream_copy || auto_mp4_fast_copy);

    // CASE 1: Single Clip Fast Copy
    if is_fast_copy && resolved_main.len() == 1 {
        let (clip, source) = resolved_main[0];
        let trimmed = is_clip_trimmed(clip, source);

        args.push("-y".into());
        if trimmed {
            let in_sec = clip.in_ms as f64 / 1000.0;
            let out_sec = clip.out_ms as f64 / 1000.0;
            args.push("-ss".into());
            args.push(format!("{:.3}", in_sec));
            args.push("-to".into());
            args.push(format!("{:.3}", out_sec));
        }
        args.push("-i".into());
        args.push(source.path.clone());
        args.push("-c".into());
        args.push("copy".into());
        args.push("-avoid_negative_ts".into());
        args.push("make_zero".into());
        args.push("-fflags".into());
        args.push("+genpts".into());
        let v_container = job
            .output
            .video_container
            .as_deref()
            .unwrap_or(&job.output.format);
        if is_mp4_or_mov_container(v_container, video_path) {
            args.push("-movflags".into());
            args.push("+faststart".into());
        }
        args.push(video_path.to_string());
        return Ok(args);
    }

    // CASE 2: Frame-accurate Trim / Multi-clip / Image / Multi-Track Overlay (Single-pass Filtergraph)
    // Add all inputs: main track clips first (0..main_len), then overlay clips (main_len..total)
    for (clip, source) in resolved_main.iter().chain(resolved_overlays.iter()) {
        if !source.is_image && !is_mpeg_ts_path(&source.path) {
            let in_sec = clip.in_ms as f64 / 1000.0;
            let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
            if clip.in_ms > 0 {
                args.push("-ss".into());
                args.push(format!("{:.3}", in_sec));
            }
            args.push("-t".into());
            args.push(format!("{:.3}", dur_sec));
        }
        args.push("-i".into());
        args.push(source.path.clone());
    }

    let mut filter_complex = String::new();
    let main_len = resolved_main.len();

    // Helper closure for building overlay audio streams (used in both audio-only & video+audio)
    let build_overlay_audio_streams = |fc: &mut String| -> Vec<String> {
        let mut labels = Vec::new();
        if job.audio.muted {
            return labels;
        }
        for (ov_idx, (clip, source)) in resolved_overlays.iter().enumerate() {
            if source.is_image || source.audio_codec.is_none() {
                continue;
            }
            let input_idx = main_len + ov_idx;
            let in_sec = clip.in_ms as f64 / 1000.0;
            let out_sec = clip.out_ms as f64 / 1000.0;
            let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
            let start_ms = clip.start_ms.unwrap_or(0);
            let start_sec = start_ms as f64 / 1000.0;
            let a_filter = build_audio_filter(job, clip.volume_db, clip.speed);

            let a_trim = if is_mpeg_ts_path(&source.path) {
                format!(
                    "asetpts=PTS-STARTPTS,atrim=start={:.3}:end={:.3},asetpts=PTS-STARTPTS",
                    in_sec, out_sec
                )
            } else {
                format!("atrim=duration={:.3},asetpts=PTS-STARTPTS", dur_sec)
            };

            let raw_label = format!("ova_raw_{}", ov_idx);
            if a_filter.is_empty() {
                fc.push_str(&format!(
                    "[{}:a]{},aresample=48000,aformat=channel_layouts=stereo[{}];",
                    input_idx, a_trim, raw_label
                ));
            } else {
                fc.push_str(&format!(
                    "[{}:a]{},{},aresample=48000,aformat=channel_layouts=stereo[{}];",
                    input_idx, a_trim, a_filter, raw_label
                ));
            }

            if start_ms > 0 {
                let gap_label = format!("ovag_{}", ov_idx);
                let out_label = format!("ova_{}", ov_idx);
                fc.push_str(&format!(
                    "anullsrc=r=48000:cl=stereo:d={:.3}[{}];[{}][{}]concat=n=2:v=0:a=1[{}];",
                    start_sec, gap_label, gap_label, raw_label, out_label
                ));
                labels.push(out_label);
            } else {
                labels.push(raw_label);
            }
        }
        labels
    };

    if is_audio_only {
        for (i, (clip, source)) in resolved_main.iter().enumerate() {
            let in_sec = clip.in_ms as f64 / 1000.0;
            let out_sec = clip.out_ms as f64 / 1000.0;
            let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
            let speed = if clip.speed > 0.0 { clip.speed } else { 1.0 };
            let effective_dur_sec = dur_sec / speed;
            let a_filter = build_audio_filter(job, clip.volume_db, clip.speed);

            if job.audio.muted || source.is_image || source.audio_codec.is_none() {
                filter_complex.push_str(&format!(
                    "anullsrc=r=48000:cl=stereo:d={:.3}[a{}];",
                    effective_dur_sec, i
                ));
            } else {
                let trim_prefix = if is_mpeg_ts_path(&source.path) {
                    format!(
                        "asetpts=PTS-STARTPTS,atrim=start={:.3}:end={:.3},asetpts=PTS-STARTPTS",
                        in_sec, out_sec
                    )
                } else {
                    format!("atrim=duration={:.3},asetpts=PTS-STARTPTS", dur_sec)
                };
                if a_filter.is_empty() {
                    filter_complex.push_str(&format!("[{}:a]{}[a{}];", i, trim_prefix, i));
                } else {
                    filter_complex.push_str(&format!(
                        "[{}:a]{},{}[a{}];",
                        i, trim_prefix, a_filter, i
                    ));
                }
            }
        }

        let ov_audio_labels = build_overlay_audio_streams(&mut filter_complex);
        let base_audio_label = if ov_audio_labels.is_empty() {
            "outa"
        } else {
            "base_a"
        };

        if resolved_main.is_empty() {
            let total_sec = total_timeline_ms as f64 / 1000.0;
            filter_complex.push_str(&format!(
                "anullsrc=r=48000:cl=stereo:d={:.3}[{}]",
                total_sec, base_audio_label
            ));
        } else {
            let mut concat_inputs = String::new();
            let mut total_segments = 0;
            let mut current_timeline_ms: u64 = 0;

            for (i, (clip, _)) in resolved_main.iter().enumerate() {
                let clip_start = clip.start_ms.unwrap_or(current_timeline_ms);
                let clip_dur_ms = effective_clip_duration_ms(clip);

                if clip_start > current_timeline_ms {
                    let gap_ms = clip_start - current_timeline_ms;
                    let gap_sec = gap_ms as f64 / 1000.0;
                    filter_complex.push_str(&format!(
                        "anullsrc=r=48000:cl=stereo:d={:.3}[ga{}];",
                        gap_sec, i
                    ));
                    concat_inputs.push_str(&format!("[ga{}]", i));
                    total_segments += 1;
                }

                concat_inputs.push_str(&format!("[a{}]", i));
                total_segments += 1;
                current_timeline_ms = clip_start + clip_dur_ms;
            }

            if current_timeline_ms < total_timeline_ms {
                let tail_sec = (total_timeline_ms - current_timeline_ms) as f64 / 1000.0;
                filter_complex.push_str(&format!(
                    "anullsrc=r=48000:cl=stereo:d={:.3}[ga_tail];",
                    tail_sec
                ));
                concat_inputs.push_str("[ga_tail]");
                total_segments += 1;
            }

            filter_complex.push_str(&format!(
                "{}concat=n={}:v=0:a=1[{}]",
                concat_inputs, total_segments, base_audio_label
            ));
        }

        if !ov_audio_labels.is_empty() {
            filter_complex.push(';');
            filter_complex.push_str(&format!("[{}]", base_audio_label));
            for lbl in &ov_audio_labels {
                filter_complex.push_str(&format!("[{}]", lbl));
            }
            filter_complex.push_str(&format!(
                "amix=inputs={}:duration=first:dropout_transition=0:normalize=0[outa]",
                1 + ov_audio_labels.len()
            ));
        }

        args.push("-filter_complex".into());
        args.push(filter_complex);
        args.push("-map".into());
        args.push("[outa]".into());

        let audio_target_format = job
            .output
            .audio_format
            .as_deref()
            .unwrap_or(&job.output.format);
        let a_enc_args = select_standalone_audio_encoder(
            audio_target_format,
            job.output.audio_bitrate.as_deref(),
        );
        args.extend(a_enc_args);

        args.push("-y".into());
        args.push(audio_path.to_string());
        return Ok(args);
    }

    // Helper: append overlay compositing stages onto `base_v_label` -> `final_v_label`
    let append_video_overlays = |fc: &mut String, base_v_label: &str, final_v_label: &str| {
        let mut prev_label = base_v_label.to_string();
        let total_ov = resolved_overlays.len();

        for (ov_idx, (clip, source)) in resolved_overlays.iter().enumerate() {
            let input_idx = main_len + ov_idx;
            let start_ms = clip.start_ms.unwrap_or(0);
            let speed = if clip.speed > 0.0 { clip.speed } else { 1.0 };
            let in_sec = clip.in_ms as f64 / 1000.0;
            let out_sec = clip.out_ms as f64 / 1000.0;
            let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
            let effective_dur_sec = dur_sec / speed;
            let start_sec = start_ms as f64 / 1000.0;
            let end_sec = start_sec + effective_dur_sec;

            let bounds = clip
                .overlay_bounds
                .clone()
                .filter(|b| {
                    b.x.is_finite()
                        && b.y.is_finite()
                        && b.width.is_finite()
                        && b.height.is_finite()
                        && b.width > 0.0
                        && b.height > 0.0
                })
                .unwrap_or_else(|| default_overlay_bounds(source, clip.rotate, canvas_w, canvas_h));
            let max_ov_w = (canvas_w.saturating_mul(4)).max(2) as f64;
            let max_ov_h = (canvas_h.saturating_mul(4)).max(2) as f64;
            let ov_w = make_even((bounds.width * canvas_w as f64).clamp(2.0, max_ov_w));
            let ov_h = make_even((bounds.height * canvas_h as f64).clamp(2.0, max_ov_h));
            let ov_x = (bounds.x * canvas_w as f64).round() as i32;
            let ov_y = (bounds.y * canvas_h as f64).round() as i32;

            let ov_chain = build_overlay_video_chain(clip, ov_w, ov_h);
            let ov_label = format!("ov_{}", ov_idx);

            if source.is_image {
                fc.push_str(&format!("[{}:v]{}[{}];", input_idx, ov_chain, ov_label));
            } else {
                let v_trim = if is_mpeg_ts_path(&source.path) {
                    format!(
                        "setpts=PTS-STARTPTS,trim=start={:.3}:end={:.3},setpts=PTS-STARTPTS",
                        in_sec, out_sec
                    )
                } else {
                    format!("trim=duration={:.3},setpts=PTS-STARTPTS", dur_sec)
                };

                let pts_shift = if (speed - 1.0).abs() > 0.001 && start_ms > 0 {
                    format!(",setpts=(PTS-STARTPTS)/{:.6}+{:.3}/TB", speed, start_sec)
                } else if (speed - 1.0).abs() > 0.001 {
                    format!(",setpts=(1/{:.6})*PTS", speed)
                } else if start_ms > 0 {
                    format!(",setpts=PTS-STARTPTS+{:.3}/TB", start_sec)
                } else {
                    String::new()
                };

                fc.push_str(&format!(
                    "[{}:v]{},{}{}[{}];",
                    input_idx, v_trim, ov_chain, pts_shift, ov_label
                ));
            }

            let is_last = ov_idx + 1 == total_ov;
            let next_label = if is_last {
                final_v_label.to_string()
            } else {
                format!("comp_{}", ov_idx)
            };
            let eof_action = if source.is_image { "repeat" } else { "pass" };
            let post_fmt = if is_last { ",format=yuv420p" } else { "" };

            fc.push_str(&format!(
                "[{}][{}]overlay=x={}:y={}:eof_action={}:shortest=0:enable='between(t,{:.3},{:.3})'{}[{}];",
                prev_label,
                ov_label,
                ov_x,
                ov_y,
                eof_action,
                start_sec,
                end_sec,
                post_fmt,
                next_label
            ));
            prev_label = next_label;
        }
    };

    let force_uniform_v1_canvas =
        has_overlays || has_any_image || resolved_main.len() > 1;
    let forced_canvas_opt = if force_uniform_v1_canvas {
        Some((canvas_w, canvas_h))
    } else {
        None
    };

    if is_gif {
        for (i, (clip, source)) in resolved_main.iter().enumerate() {
            let in_sec = clip.in_ms as f64 / 1000.0;
            let out_sec = clip.out_ms as f64 / 1000.0;
            let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
            let speed = if clip.speed > 0.0 { clip.speed } else { 1.0 };
            let effective_dur_sec = dur_sec / speed;

            if source.is_image {
                let v_filter = build_clip_video_filter_internal(
                    clip,
                    source,
                    job,
                    Some((canvas_w, canvas_h)),
                    false,
                );
                filter_complex.push_str(&format!(
                    "color=c={}:s={}x{}:r={}:d={:.3}[bg_{}];[{}:v]format=rgba,{}[fg_{}];[bg_{}][fg_{}]overlay=x=0:y=0:eof_action=repeat:shortest=1,format=yuv420p[v{}];",
                    clean_color, canvas_w, canvas_h, target_fps, effective_dur_sec, i, i, v_filter, i, i, i, i
                ));
            } else {
                let v_trim = if is_mpeg_ts_path(&source.path) {
                    format!(
                        "setpts=PTS-STARTPTS,trim=start={:.3}:end={:.3},setpts=PTS-STARTPTS",
                        in_sec, out_sec
                    )
                } else {
                    format!("trim=duration={:.3},setpts=PTS-STARTPTS", dur_sec)
                };

                let v_filter = build_clip_video_filter_internal(
                    clip,
                    source,
                    job,
                    forced_canvas_opt,
                    true,
                );
                let norm_suffix = if has_any_image {
                    format!(",fps={},format=yuv420p", target_fps)
                } else {
                    String::new()
                };
                if v_filter.is_empty() {
                    filter_complex.push_str(&format!("[{}:v]{}{}[v{}];", i, v_trim, norm_suffix, i));
                } else {
                    filter_complex.push_str(&format!(
                        "[{}:v]{},{}{}[v{}];",
                        i, v_trim, v_filter, norm_suffix, i
                    ));
                }
            }
        }

        let base_v_label = if has_overlays { "base_v" } else { "vconcat" };

        if resolved_main.is_empty() {
            let total_sec = total_timeline_ms as f64 / 1000.0;
            filter_complex.push_str(&format!(
                "color=c={}:s={}x{}:d={:.3}:r={},format=yuv420p[{}];",
                clean_color, canvas_w, canvas_h, total_sec, target_fps, base_v_label
            ));
        } else {
            let mut concat_inputs = String::new();
            let mut total_segments = 0;
            let mut current_timeline_ms: u64 = 0;

            for (i, (clip, _)) in resolved_main.iter().enumerate() {
                let clip_start = clip.start_ms.unwrap_or(current_timeline_ms);
                let clip_dur_ms = effective_clip_duration_ms(clip);

                if clip_start > current_timeline_ms {
                    let gap_ms = clip_start - current_timeline_ms;
                    let gap_sec = gap_ms as f64 / 1000.0;
                    filter_complex.push_str(&format!(
                        "color=c=black:s={}x{}:d={:.3}:r={},format=yuv420p[gv{}];",
                        canvas_w, canvas_h, gap_sec, target_fps, i
                    ));
                    concat_inputs.push_str(&format!("[gv{}]", i));
                    total_segments += 1;
                }

                concat_inputs.push_str(&format!("[v{}]", i));
                total_segments += 1;
                current_timeline_ms = clip_start + clip_dur_ms;
            }

            if current_timeline_ms < total_timeline_ms {
                let tail_sec = (total_timeline_ms - current_timeline_ms) as f64 / 1000.0;
                filter_complex.push_str(&format!(
                    "color=c=black:s={}x{}:d={:.3}:r={},format=yuv420p[gv_tail];",
                    canvas_w, canvas_h, tail_sec, target_fps
                ));
                concat_inputs.push_str("[gv_tail]");
                total_segments += 1;
            }

            filter_complex.push_str(&format!(
                "{}concat=n={}:v=1:a=0[{}];",
                concat_inputs, total_segments, base_v_label
            ));
        }

        if has_overlays {
            append_video_overlays(&mut filter_complex, "base_v", "vconcat");
        }

        filter_complex.push_str(
            "[vconcat]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[outv]",
        );

        args.push("-filter_complex".into());
        args.push(filter_complex);
        args.push("-map".into());
        args.push("[outv]".into());
        args.push("-an".into());
        args.push("-y".into());
        args.push(video_path.to_string());
        return Ok(args);
    }

    // Standard video (+ optional audio / standalone audio) export
    let v_container = job
        .output
        .video_container
        .as_deref()
        .unwrap_or(&job.output.format);
    let any_main_audio = resolved_main
        .iter()
        .any(|(_, s)| !s.is_image && s.audio_codec.is_some());
    let any_overlay_audio = resolved_overlays
        .iter()
        .any(|(_, s)| !s.is_image && s.audio_codec.is_some());
    let any_source_has_audio = any_main_audio || any_overlay_audio;
    let has_video_audio = !job.audio.muted && any_source_has_audio;

    // Allow direct lossless audio copy (-c:a copy) when explicitly requested on a single
    // unmodified, seekable main clip with no overlays/images.
    let can_direct_copy_audio = has_video_audio
        && !is_both
        && !has_overlays
        && !has_any_image
        && resolved_main.len() == 1
        && resolved_main[0].0.start_ms.unwrap_or(0) == 0
        && !is_mpeg_ts_path(&resolved_main[0].1.path)
        && job.output.audio_codec.as_deref() == Some("copy")
        && build_audio_filter(
            job,
            resolved_main[0].0.volume_db,
            resolved_main[0].0.speed,
        )
        .is_empty()
        && is_container_compatible_audio_codec(
            v_container,
            resolved_main[0].1.audio_codec.as_deref(),
        );

    let include_audio_in_graph = (has_video_audio || is_both) && !can_direct_copy_audio;

    for (i, (clip, source)) in resolved_main.iter().enumerate() {
        let in_sec = clip.in_ms as f64 / 1000.0;
        let out_sec = clip.out_ms as f64 / 1000.0;
        let dur_sec = (clip.out_ms - clip.in_ms) as f64 / 1000.0;
        let speed = if clip.speed > 0.0 { clip.speed } else { 1.0 };
        let effective_dur_sec = dur_sec / speed;

        if source.is_image {
            let v_filter = build_clip_video_filter_internal(
                clip,
                source,
                job,
                Some((canvas_w, canvas_h)),
                false,
            );
            filter_complex.push_str(&format!(
                "color=c={}:s={}x{}:r={}:d={:.3}[bg_{}];[{}:v]format=rgba,{}[fg_{}];[bg_{}][fg_{}]overlay=x=0:y=0:eof_action=repeat:shortest=1,format=yuv420p[v{}];",
                clean_color, canvas_w, canvas_h, target_fps, effective_dur_sec, i, i, v_filter, i, i, i, i
            ));
        } else {
            let v_trim = if is_mpeg_ts_path(&source.path) {
                format!(
                    "setpts=PTS-STARTPTS,trim=start={:.3}:end={:.3},setpts=PTS-STARTPTS",
                    in_sec, out_sec
                )
            } else {
                format!("trim=duration={:.3},setpts=PTS-STARTPTS", dur_sec)
            };

            let v_filter = build_clip_video_filter_internal(
                clip,
                source,
                job,
                forced_canvas_opt,
                true,
            );
            let norm_suffix = if has_any_image {
                format!(",fps={},format=yuv420p", target_fps)
            } else {
                String::new()
            };
            if v_filter.is_empty() {
                filter_complex.push_str(&format!("[{}:v]{}{}[v{}];", i, v_trim, norm_suffix, i));
            } else {
                filter_complex.push_str(&format!(
                    "[{}:v]{},{}{}[v{}];",
                    i, v_trim, v_filter, norm_suffix, i
                ));
            }
        }

        if include_audio_in_graph {
            let a_filter = build_audio_filter(job, clip.volume_db, clip.speed);
            if job.audio.muted || source.is_image || source.audio_codec.is_none() {
                filter_complex.push_str(&format!(
                    "anullsrc=r=48000:cl=stereo:d={:.3}[a{}];",
                    effective_dur_sec, i
                ));
            } else {
                let a_trim = if is_mpeg_ts_path(&source.path) {
                    format!(
                        "asetpts=PTS-STARTPTS,atrim=start={:.3}:end={:.3},asetpts=PTS-STARTPTS",
                        in_sec, out_sec
                    )
                } else {
                    format!("atrim=duration={:.3},asetpts=PTS-STARTPTS", dur_sec)
                };
                if a_filter.is_empty() {
                    filter_complex.push_str(&format!("[{}:a]{}[a{}];", i, a_trim, i));
                } else {
                    filter_complex.push_str(&format!(
                        "[{}:a]{},{}[a{}];",
                        i, a_trim, a_filter, i
                    ));
                }
            }
        }
    }

    let ov_audio_labels = if include_audio_in_graph {
        build_overlay_audio_streams(&mut filter_complex)
    } else {
        Vec::new()
    };

    let has_overlay_audio_mix = !ov_audio_labels.is_empty();
    let base_v_label = if has_overlays { "base_v" } else { "outv" };

    // Concat main track segments with gap & tail handling
    if resolved_main.is_empty() {
        let total_sec = total_timeline_ms as f64 / 1000.0;
        filter_complex.push_str(&format!(
            "color=c={}:s={}x{}:d={:.3}:r={},format=yuv420p[{}];",
            clean_color, canvas_w, canvas_h, total_sec, target_fps, base_v_label
        ));
        if include_audio_in_graph {
            let base_a_label = if has_overlay_audio_mix {
                "base_a"
            } else if is_both && has_video_audio {
                "outa_mix"
            } else if is_both {
                "outa_stand"
            } else {
                "outa"
            };
            filter_complex.push_str(&format!(
                "anullsrc=r=48000:cl=stereo:d={:.3}[{}];",
                total_sec, base_a_label
            ));
        }
    } else {
        let mut concat_inputs = String::new();
        let mut total_segments = 0;
        let mut current_timeline_ms: u64 = 0;

        for (i, (clip, _)) in resolved_main.iter().enumerate() {
            let clip_start = clip.start_ms.unwrap_or(current_timeline_ms);
            let clip_dur_ms = effective_clip_duration_ms(clip);

            if clip_start > current_timeline_ms {
                let gap_ms = clip_start - current_timeline_ms;
                let gap_sec = gap_ms as f64 / 1000.0;
                filter_complex.push_str(&format!(
                    "color=c=black:s={}x{}:d={:.3}:r={},format=yuv420p[gv{}];",
                    canvas_w, canvas_h, gap_sec, target_fps, i
                ));
                if include_audio_in_graph {
                    filter_complex.push_str(&format!(
                        "anullsrc=r=48000:cl=stereo:d={:.3}[ga{}];",
                        gap_sec, i
                    ));
                    concat_inputs.push_str(&format!("[gv{}][ga{}]", i, i));
                } else {
                    concat_inputs.push_str(&format!("[gv{}]", i));
                }
                total_segments += 1;
            }

            if include_audio_in_graph {
                concat_inputs.push_str(&format!("[v{}][a{}]", i, i));
            } else {
                concat_inputs.push_str(&format!("[v{}]", i));
            }
            total_segments += 1;
            current_timeline_ms = clip_start + clip_dur_ms;
        }

        if current_timeline_ms < total_timeline_ms {
            let tail_sec = (total_timeline_ms - current_timeline_ms) as f64 / 1000.0;
            filter_complex.push_str(&format!(
                "color=c=black:s={}x{}:d={:.3}:r={},format=yuv420p[gv_tail];",
                canvas_w, canvas_h, tail_sec, target_fps
            ));
            if include_audio_in_graph {
                filter_complex.push_str(&format!(
                    "anullsrc=r=48000:cl=stereo:d={:.3}[ga_tail];",
                    tail_sec
                ));
                concat_inputs.push_str("[gv_tail][ga_tail]");
            } else {
                concat_inputs.push_str("[gv_tail]");
            }
            total_segments += 1;
        }

        if include_audio_in_graph {
            if has_overlay_audio_mix {
                filter_complex.push_str(&format!(
                    "{}concat=n={}:v=1:a=1[{}][base_a];",
                    concat_inputs, total_segments, base_v_label
                ));
            } else if is_both && has_video_audio {
                filter_complex.push_str(&format!(
                    "{}concat=n={}:v=1:a=1[{}][outa_mix];[outa_mix]asplit=2[outa][outa_stand];",
                    concat_inputs, total_segments, base_v_label
                ));
            } else if is_both {
                filter_complex.push_str(&format!(
                    "{}concat=n={}:v=1:a=1[{}][outa_stand]{}",
                    concat_inputs,
                    total_segments,
                    base_v_label,
                    if has_overlays { ";" } else { "" }
                ));
            } else {
                filter_complex.push_str(&format!(
                    "{}concat=n={}:v=1:a=1[{}][outa]{}",
                    concat_inputs,
                    total_segments,
                    base_v_label,
                    if has_overlays { ";" } else { "" }
                ));
            }
        } else {
            filter_complex.push_str(&format!(
                "{}concat=n={}:v=1:a=0[{}]{}",
                concat_inputs,
                total_segments,
                base_v_label,
                if has_overlays { ";" } else { "" }
            ));
        }
    }

    // Mix overlay audio into main audio if present
    if has_overlay_audio_mix {
        filter_complex.push_str("[base_a]");
        for lbl in &ov_audio_labels {
            filter_complex.push_str(&format!("[{}]", lbl));
        }
        let mix_target = if is_both && has_video_audio {
            "outa_mix"
        } else if is_both {
            "outa_stand"
        } else {
            "outa"
        };
        filter_complex.push_str(&format!(
            "amix=inputs={}:duration=first:dropout_transition=0:normalize=0[{}];",
            1 + ov_audio_labels.len(),
            mix_target
        ));
        if is_both && has_video_audio {
            filter_complex.push_str("[outa_mix]asplit=2[outa][outa_stand];");
        }
    }

    // Composite all overlay video/image tracks bottom-to-top onto [base_v] -> [outv]
    if has_overlays {
        append_video_overlays(&mut filter_complex, "base_v", "outv");
    }

    // Strip any trailing semicolon for clean FFmpeg filtergraph syntax
    while filter_complex.ends_with(';') {
        filter_complex.pop();
    }

    args.push("-filter_complex".into());
    args.push(filter_complex);

    // Output 1: Video (with audio when available and not muted)
    args.push("-map".into());
    args.push("[outv]".into());

    // Video passed through filter_complex cannot use stream copy; fall back to container default codec
    let effective_v_codec = match job.output.video_codec.as_deref() {
        Some("copy") => None,
        other => other,
    };
    let effective_v_container = if v_container == "copy" {
        "mp4"
    } else {
        v_container
    };
    let v_enc_args = select_video_codec_encoder(
        effective_v_container,
        effective_v_codec,
        &job.output.hardware_accel,
        &job.output.quality,
        job.output.crf,
    );
    args.extend(v_enc_args);

    if can_direct_copy_audio {
        args.push("-map".into());
        args.push("0:a?".into());
        args.push("-c:a".into());
        args.push("copy".into());
    } else if has_video_audio {
        args.push("-map".into());
        args.push("[outa]".into());
        let effective_a_codec = match job.output.audio_codec.as_deref() {
            Some("copy") => None,
            other => other,
        };
        let a_enc_args =
            select_video_audio_encoder(effective_v_container, effective_a_codec, false);
        args.extend(a_enc_args);
    } else {
        args.push("-an".into());
    }

    if is_mp4_or_mov_container(effective_v_container, video_path) {
        args.push("-movflags".into());
        args.push("+faststart".into());
    }

    args.push("-y".into());
    args.push(video_path.to_string());

    // Output 2: Standalone audio (if is_both)
    if is_both {
        args.push("-map".into());
        args.push("[outa_stand]".into());

        let audio_target_format = job.output.audio_format.as_deref().unwrap_or("mp3");
        let standalone_a_args = select_standalone_audio_encoder(
            audio_target_format,
            job.output.audio_bitrate.as_deref(),
        );
        args.extend(standalone_a_args);

        args.push("-y".into());
        args.push(audio_path.to_string());
    }

    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::*;

    fn make_test_job(format: &str, is_single_clip: bool) -> ExportJob {
        let sources = vec![
            ExportSource {
                id: "src1".into(),
                path: "D:/Videos/clip1.mp4".into(),
                filename: "clip1.mp4".into(),
                duration_ms: 10000,
                width: Some(1920),
                height: Some(1080),
                codec: Some("h264".into()),
                audio_codec: Some("aac".into()),
                is_image: false,
            },
            ExportSource {
                id: "src2".into(),
                path: "D:/Videos/clip2.mp4".into(),
                filename: "clip2.mp4".into(),
                duration_ms: 15000,
                width: Some(1920),
                height: Some(1080),
                codec: Some("h264".into()),
                audio_codec: Some("aac".into()),
                is_image: false,
            },
        ];

        let mut clips = vec![ExportClip {
            id: "c1".into(),
            source_id: "src1".into(),
            in_ms: 1000,
            out_ms: 6000,
            enabled: true,
            rotate: 0,
            flip_h: false,
            flip_v: false,
            volume_db: 0.0,
            speed: 1.0,
            sharpness: 0.0,
            start_ms: None,
            track_index: 0,
            overlay_bounds: None,
        }];

        if !is_single_clip {
            clips.push(ExportClip {
                id: "c2".into(),
                source_id: "src2".into(),
                in_ms: 0,
                out_ms: 8000,
                enabled: true,
                rotate: 0,
                flip_h: false,
                flip_v: false,
                volume_db: 0.0,
                speed: 1.0,
                sharpness: 0.0,
                start_ms: None,
                track_index: 0,
                overlay_bounds: None,
            });
        }

        ExportJob {
            sources,
            clips,
            aspect: ExportAspect {
                id: "original".into(),
                ratio: None,
                custom_w: None,
                custom_h: None,
            },
            fit_mode: "fit".into(),
            crop: ExportCrop {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
            canvas_bounds: None,
            padding: ExportPadding {
                mode: "blur".into(),
                color: None,
                blur_strength: 40,
            },
            output: ExportOutput {
                format: format.into(),
                quality: "balanced".into(),
                crf: Some(23),
                bitrate_kbps: None,
                resolution_mode: "auto".into(),
                fps_mode: "original".into(),
                hardware_accel: "cpu".into(),
                output_path: "D:/Videos/output.mp4".into(),
                open_folder_after: true,
                export_video: true,
                export_audio: false,
                video_output_path: None,
                audio_output_path: None,
                video_container: None,
                video_codec: None,
                audio_codec: None,
                audio_format: None,
                audio_bitrate: None,
            },
            audio: ExportAudio {
                track_index: 0,
                volume_db: 0.0,
                muted: false,
                normalization: "off".into(),
            },
            total_duration_ms: 5000,
        }
    }

    #[test]
    fn test_single_clip_fast_copy_builds_lossless_command() {
        let job = make_test_job("copy", true);
        let args = build_export_arguments(&job).expect("Failed to build args");

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(args.contains(&"-ss".to_string()));
        assert!(args.contains(&"1.000".to_string()));
        assert!(args.contains(&"-to".to_string()));
        assert!(args.contains(&"6.000".to_string()));

        let mut untrimmed = make_test_job("mp4_h264", true);
        untrimmed.clips[0].in_ms = 0;
        untrimmed.clips[0].out_ms = 10000;
        let untrimmed_args =
            build_export_arguments(&untrimmed).expect("Failed to build untrimmed args");
        assert!(untrimmed_args.contains(&"-c".to_string()));
        assert!(untrimmed_args.contains(&"copy".to_string()));
        assert!(!untrimmed_args.contains(&"-filter_complex".to_string()));
    }

    #[test]
    fn test_trimmed_single_clip_mp4_h264_uses_frame_accurate_trim_not_fast_copy() {
        let job = make_test_job("mp4_h264", true);
        let args = build_export_arguments(&job).expect("Failed to build args");

        assert!(!args.contains(&"copy".to_string()));
        assert!(args.contains(&"-ss".to_string()));
        assert!(args.contains(&"1.000".to_string()));
        assert!(args.contains(&"-t".to_string()));
        assert!(args.contains(&"5.000".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("trim=duration=5.000,setpts=PTS-STARTPTS"));
        assert!(fc.contains("atrim=duration=5.000,asetpts=PTS-STARTPTS"));

        let mut end_trimmed = make_test_job("mp4_h264", true);
        end_trimmed.clips[0].in_ms = 0;
        end_trimmed.clips[0].out_ms = 4000;
        let end_args =
            build_export_arguments(&end_trimmed).expect("Failed to build end-trimmed args");
        assert!(!end_args.contains(&"copy".to_string()));
        assert!(!end_args.contains(&"-ss".to_string()));
        assert!(end_args.contains(&"-t".to_string()));
        assert!(end_args.contains(&"4.000".to_string()));
        let fc_idx2 = end_args
            .iter()
            .position(|a| a == "-filter_complex")
            .unwrap();
        let fc2 = &end_args[fc_idx2 + 1];
        assert!(fc2.contains("trim=duration=4.000,setpts=PTS-STARTPTS"));
        assert!(fc2.contains("atrim=duration=4.000,asetpts=PTS-STARTPTS"));
    }

    #[test]
    fn test_mpeg_ts_clip_uses_filter_start_end_trim() {
        let mut job = make_test_job("mp4_h264", true);
        job.sources[0].path = "D:/Videos/capture.ts".into();
        job.clips[0].in_ms = 5000;
        job.clips[0].out_ms = 9000;

        let args = build_export_arguments(&job).expect("Failed to build TS args");
        assert!(!args.contains(&"-ss".to_string()));
        assert!(!args.contains(&"-t".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("setpts=PTS-STARTPTS,trim=start=5.000:end=9.000,setpts=PTS-STARTPTS"));
        assert!(
            fc.contains("asetpts=PTS-STARTPTS,atrim=start=5.000:end=9.000,asetpts=PTS-STARTPTS")
        );
    }

    #[test]
    fn test_silent_video_and_muted_video_omit_audio_cleanly() {
        let mut silent_job = make_test_job("mp4_h264", true);
        silent_job.sources[0].audio_codec = None;
        let args = build_export_arguments(&silent_job).expect("Failed to build silent args");
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(!fc.contains(":a]"));
        assert!(fc.contains("concat=n=1:v=1:a=0[outv]"));
        assert!(args.contains(&"-an".to_string()));

        let mut muted_job = make_test_job("mp4_h264", true);
        muted_job.audio.muted = true;
        let muted_args = build_export_arguments(&muted_job).expect("Failed to build muted args");
        let m_idx = muted_args
            .iter()
            .position(|a| a == "-filter_complex")
            .unwrap();
        let m_fc = &muted_args[m_idx + 1];
        assert!(!m_fc.contains("aevalsrc"));
        assert!(m_fc.contains("concat=n=1:v=1:a=0[outv]"));
        assert!(muted_args.contains(&"-an".to_string()));
    }

    #[test]
    fn test_invalid_trim_range_returns_error() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].in_ms = 5000;
        job.clips[0].out_ms = 5000;
        assert!(build_export_arguments(&job).is_err());
    }

    #[test]
    fn test_explicit_copy_with_multi_clip_falls_back_from_stream_copy() {
        let mut job = make_test_job("copy", false);
        job.output.video_codec = Some("copy".into());
        let args = build_export_arguments(&job).expect("Failed to build multi-clip args");
        assert!(args.contains(&"-filter_complex".to_string()));
        assert!(!args.contains(&"copy".to_string()));
        assert!(args.contains(&"libx264".to_string()));
    }

    #[test]
    fn test_multi_clip_concat_filter_generation() {
        let job = make_test_job("mp4_h264", false);
        let args = build_export_arguments(&job).expect("Failed to build args");

        assert!(args.contains(&"-filter_complex".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("concat=n=2:v=1:a=1"));
    }

    #[test]
    fn test_rotation_and_flip_filters() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].rotate = 90;
        job.clips[0].flip_h = true;

        let args = build_export_arguments(&job).expect("Failed to build args");
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("transpose=1"));
        assert!(fc.contains("hflip"));
    }

    #[test]
    fn test_audio_normalization_loudnorm_filter() {
        let mut job = make_test_job("mp4_h264", true);
        job.audio.normalization = "web".into();

        let args = build_export_arguments(&job).expect("Failed to build args");
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("loudnorm=I=-14:TP=-1.5:LRA=11"));
    }

    #[test]
    fn test_hardware_encoder_selection_nvenc() {
        let mut job = make_test_job("mp4_h264", false);
        job.output.hardware_accel = "nvenc".into();

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(args.contains(&"h264_nvenc".to_string()));
    }

    #[test]
    fn test_audio_only_export_format() {
        let mut job = make_test_job("audio_mp3", true);
        job.output.output_path = "D:/Videos/output.mp3".into();

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(args.contains(&"libmp3lame".to_string()));
        assert!(args.contains(&"-vn".to_string()));
    }

    #[test]
    fn test_speed_filter_video_and_audio() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].speed = 2.0;

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("setpts=(1/2.000000)*PTS"));
        assert!(fc.contains("atempo=2.0"));
    }

    #[test]
    fn test_speed_filter_extreme_chaining() {
        let filters_4x = build_atempo_filters(4.0);
        assert_eq!(filters_4x, vec!["atempo=2.0", "atempo=2.0"]);

        let filters_slow = build_atempo_filters(0.25);
        assert_eq!(filters_slow, vec!["atempo=0.5", "atempo=0.5"]);
    }

    #[test]
    fn test_clip_with_gap_generates_black_video_and_silence_audio() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].start_ms = Some(3000);

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("color=c=black:s=1920x1080:d=3.000:r=30,format=yuv420p[gv0]"));
        assert!(fc.contains("anullsrc=r=48000:cl=stereo:d=3.000[ga0]"));
        assert!(fc.contains("[gv0][ga0][v0][a0]concat=n=2:v=1:a=1[outv][outa]"));
    }

    #[test]
    fn test_both_video_and_audio_generates_dual_mapped_outputs() {
        let mut job = make_test_job("mp4_h264", false);
        job.output.export_video = true;
        job.output.export_audio = true;
        job.output.video_output_path = Some("D:/Videos/out.mp4".into());
        job.output.audio_output_path = Some("D:/Videos/out.mp3".into());
        job.output.audio_format = Some("mp3".into());

        let args = build_export_arguments(&job).expect("Failed to build args");
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("asplit=2[outa][outa_stand]"));
        assert!(args.contains(&"D:/Videos/out.mp4".to_string()));
        assert!(args.contains(&"D:/Videos/out.mp3".to_string()));
        assert!(args.contains(&"libmp3lame".to_string()));
    }

    #[test]
    fn test_audio_only_with_gap_generates_silence() {
        let mut job = make_test_job("audio_wav", true);
        job.output.export_video = false;
        job.output.export_audio = true;
        job.output.audio_format = Some("wav".into());
        job.output.audio_output_path = Some("D:/Videos/out.wav".into());
        job.clips[0].start_ms = Some(2000);

        let args = build_export_arguments(&job).expect("Failed to build args");
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("anullsrc=r=48000:cl=stereo:d=2.000[ga0]"));
        assert!(fc.contains("[ga0][a0]concat=n=2:v=0:a=1[outa]"));
        assert!(args.contains(&"pcm_s16le".to_string()));
        assert!(args.contains(&"D:/Videos/out.wav".to_string()));
    }

    #[test]
    fn test_stretch_mode_applies_setsar_and_custom_canvas_bounds() {
        let mut job = make_test_job("mp4_h264", true);
        job.fit_mode = "stretch".into();
        job.aspect = ExportAspect {
            id: "9:16".into(),
            ratio: Some(9.0 / 16.0),
            custom_w: None,
            custom_h: None,
        };

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("scale=w=1080:h=1920,setsar=1"));

        let mut job2 = make_test_job("mp4_h264", true);
        job2.fit_mode = "stretch".into();
        job2.canvas_bounds = Some(ExportCrop {
            x: 0.1,
            y: 0.0,
            width: 0.8,
            height: 1.0,
        });
        let args2 = build_export_arguments(&job2).expect("Failed to build args");
        assert!(!args2.contains(&"copy".to_string()));
        let fc_idx2 = args2
            .iter()
            .position(|a| a == "-filter_complex")
            .unwrap();
        let fc2 = &args2[fc_idx2 + 1];
        assert!(
            fc2.contains("scale=w=1536:h=1080,pad=w=1920:h=1080:x=192:y=0:color=black,setsar=1")
        );
    }

    #[test]
    fn test_fit_mode_with_custom_bounds_disables_fast_copy_and_pads() {
        let mut job = make_test_job("mp4_h264", true);
        job.fit_mode = "fit".into();
        job.canvas_bounds = Some(ExportCrop {
            x: 0.2,
            y: 0.2,
            width: 0.6,
            height: 0.6,
        });

        let args = build_export_arguments(&job).expect("Failed to build args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];
        assert!(
            fc.contains("scale=w=1152:h=648,pad=w=1920:h=1080:x=384:y=216:color=black,setsar=1")
        );
    }

    #[test]
    fn test_sharpness_disables_fast_copy_and_applies_cas_filter() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].in_ms = 0;
        job.clips[0].out_ms = 10000;
        job.clips[0].sharpness = 0.65;

        let args = build_export_arguments(&job).expect("Failed to build sharpness export args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args
            .iter()
            .position(|a| a == "-filter_complex")
            .expect("Expected -filter_complex when sharpness is set");
        let fc = &args[fc_idx + 1];
        assert!(fc.contains("cas=strength=0.65"));
    }

    #[test]
    fn test_zero_sharpness_keeps_fast_copy_untouched() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].in_ms = 0;
        job.clips[0].out_ms = 10000;
        job.clips[0].sharpness = 0.0;

        let args = build_export_arguments(&job).expect("Failed to build fast copy args");
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.iter().any(|a| a.contains("cas=")));
    }

    #[test]
    fn test_photo_overlay_and_video_overlay_multi_track_filtergraph() {
        let mut job = make_test_job("mp4_h264", true);
        job.clips[0].in_ms = 0;
        job.clips[0].out_ms = 10000;
        job.clips[0].start_ms = Some(0);

        job.sources.push(ExportSource {
            id: "img1".into(),
            path: "D:/Photos/logo.png".into(),
            filename: "logo.png".into(),
            duration_ms: 5000,
            width: Some(400),
            height: Some(200),
            codec: Some("png".into()),
            audio_codec: None,
            is_image: true,
        });

        // V2: PNG overlay from 1s..4s
        job.clips.push(ExportClip {
            id: "ov_img".into(),
            source_id: "img1".into(),
            in_ms: 0,
            out_ms: 3000,
            enabled: true,
            rotate: 0,
            flip_h: false,
            flip_v: false,
            volume_db: 0.0,
            speed: 1.0,
            sharpness: 0.0,
            start_ms: Some(1000),
            track_index: 1,
            overlay_bounds: Some(ExportCrop {
                x: 0.1,
                y: 0.1,
                width: 0.25,
                height: 0.25,
            }),
        });

        // V3: PiP video overlay from 2s..6s with audio
        job.clips.push(ExportClip {
            id: "ov_vid".into(),
            source_id: "src2".into(),
            in_ms: 500,
            out_ms: 4500,
            enabled: true,
            rotate: 0,
            flip_h: false,
            flip_v: false,
            volume_db: -3.0,
            speed: 1.0,
            sharpness: 0.0,
            start_ms: Some(2000),
            track_index: 2,
            overlay_bounds: Some(ExportCrop {
                x: 0.6,
                y: 0.5,
                width: 0.3,
                height: 0.3,
            }),
        });

        let args = build_export_arguments(&job).expect("Failed to build multi-track args");
        assert!(!args.contains(&"copy".to_string()));
        let fc_idx = args.iter().position(|a| a == "-filter_complex").unwrap();
        let fc = &args[fc_idx + 1];

        // V2 composited onto base_v first -> comp_0, then V3 composited onto comp_0 -> outv
        assert!(fc.contains("format=rgba,scale=w=480:h=270,setsar=1[ov_0]"), "got: {}", fc);
        assert!(
            fc.contains("[base_v][ov_0]overlay=x=192:y=108:eof_action=repeat:shortest=0:enable='between(t,1.000,4.000)'[comp_0]"),
            "got: {}",
            fc
        );
        assert!(
            fc.contains("[comp_0][ov_1]overlay=x=1152:y=540:eof_action=pass:shortest=0:enable='between(t,2.000,6.000)',format=yuv420p[outv]"),
            "got: {}",
            fc
        );
        assert!(
            fc.contains("amix=inputs=2:duration=first:dropout_transition=0:normalize=0[outa]"),
            "got: {}",
            fc
        );
    }

    #[test]
    fn test_end_to_end_ffmpeg_photo_overlay_and_pip_video_export() {
        use crate::ffmpeg::sidecar::create_ffmpeg_command;
        use crate::media::probe::probe_media_file;

        let check = create_ffmpeg_command(["-version"]).output();
        if !matches!(check, Ok(o) if o.status.success()) {
            return;
        }

        let tmp_dir = std::env::temp_dir().join(format!(
            "megufastcut-overlay-e2e-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let bg_vid = tmp_dir.join("bg.mp4");
        let pip_vid = tmp_dir.join("pip.mp4");
        let ov_png = tmp_dir.join("sticker.png");
        let out_mp4 = tmp_dir.join("out_layered.mp4");

        // 1. Create 2.0s background video (320x180)
        assert!(create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=2:size=320x180:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=2",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            &bg_vid.to_string_lossy(),
        ])
        .output()
        .unwrap()
        .status
        .success());

        // 2. Create 1.0s PiP video (160x90)
        assert!(create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=blue:duration=1:size=160x90:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:duration=1",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            &pip_vid.to_string_lossy(),
        ])
        .output()
        .unwrap()
        .status
        .success());

        // 3. Create semi-transparent PNG photo
        assert!(create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=red@0.6:s=100x80:d=0.1,format=rgba",
            "-frames:v",
            "1",
            &ov_png.to_string_lossy(),
        ])
        .output()
        .unwrap()
        .status
        .success());

        let mut job = make_test_job("mp4_h264", true);
        job.sources = vec![
            ExportSource {
                id: "bg".into(),
                path: bg_vid.to_string_lossy().to_string(),
                filename: "bg.mp4".into(),
                duration_ms: 2000,
                width: Some(320),
                height: Some(180),
                codec: Some("h264".into()),
                audio_codec: Some("aac".into()),
                is_image: false,
            },
            ExportSource {
                id: "png".into(),
                path: ov_png.to_string_lossy().to_string(),
                filename: "sticker.png".into(),
                duration_ms: 5000,
                width: Some(100),
                height: Some(80),
                codec: Some("png".into()),
                audio_codec: None,
                is_image: true,
            },
            ExportSource {
                id: "pip".into(),
                path: pip_vid.to_string_lossy().to_string(),
                filename: "pip.mp4".into(),
                duration_ms: 1000,
                width: Some(160),
                height: Some(90),
                codec: Some("h264".into()),
                audio_codec: Some("aac".into()),
                is_image: false,
            },
        ];
        // V1: bg (0..2s), V2: PNG sticker (0.3s..1.8s), V3: PiP video extending past bg (1.5s..2.5s -> total 2.5s!)
        job.clips = vec![
            ExportClip {
                id: "c_bg".into(),
                source_id: "bg".into(),
                in_ms: 0,
                out_ms: 2000,
                enabled: true,
                rotate: 0,
                flip_h: false,
                flip_v: false,
                volume_db: 0.0,
                speed: 1.0,
                sharpness: 0.0,
                start_ms: Some(0),
                track_index: 0,
                overlay_bounds: None,
            },
            ExportClip {
                id: "c_png".into(),
                source_id: "png".into(),
                in_ms: 0,
                out_ms: 1500,
                enabled: true,
                rotate: 0,
                flip_h: false,
                flip_v: false,
                volume_db: 0.0,
                speed: 1.0,
                sharpness: 0.0,
                start_ms: Some(300),
                track_index: 1,
                overlay_bounds: Some(ExportCrop {
                    x: 0.05,
                    y: 0.05,
                    width: 0.35,
                    height: 0.4,
                }),
            },
            ExportClip {
                id: "c_pip".into(),
                source_id: "pip".into(),
                in_ms: 0,
                out_ms: 1000,
                enabled: true,
                rotate: 0,
                flip_h: false,
                flip_v: false,
                volume_db: 0.0,
                speed: 1.0,
                sharpness: 0.0,
                start_ms: Some(1500),
                track_index: 2,
                overlay_bounds: Some(ExportCrop {
                    x: 0.55,
                    y: 0.5,
                    width: 0.4,
                    height: 0.4,
                }),
            },
        ];
        job.output.output_path = out_mp4.to_string_lossy().to_string();
        job.total_duration_ms = 2500;

        let args = build_export_arguments(&job).expect("Failed to build layered export args");
        let res = create_ffmpeg_command(&args)
            .output()
            .expect("Failed to run ffmpeg");
        assert!(
            res.status.success(),
            "Layered FFmpeg export failed: {}",
            String::from_utf8_lossy(&res.stderr)
        );

        let probed = probe_media_file(&job.output.output_path).expect("Failed to probe output");
        assert_eq!(probed.video.as_ref().map(|v| (v.width, v.height)), Some((320, 180)));
        assert!(
            (probed.duration_ms as i64 - 2500).abs() <= 150,
            "Expected ~2500ms output duration, got {}ms",
            probed.duration_ms
        );
        assert!(!probed.audio.is_empty(), "Expected mixed audio track");

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[test]
    fn test_end_to_end_ffmpeg_respects_timeline_trim_duration() {
        use crate::ffmpeg::sidecar::create_ffmpeg_command;
        use crate::media::probe::probe_media_file;

        let check = create_ffmpeg_command(["-version"]).output();
        if !matches!(check, Ok(o) if o.status.success()) {
            return;
        }

        let tmp_dir = std::env::temp_dir().join(format!(
            "megufastcut-trim-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&tmp_dir).expect("Failed to create temp dir");

        let src_path = tmp_dir.join("single_kf_15s.mp4");
        let src_str = src_path.to_string_lossy().to_string();

        let gen_status = create_ffmpeg_command([
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc=duration=15:size=320x180:rate=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=15",
            "-c:v",
            "libx264",
            "-g",
            "1000",
            "-keyint_min",
            "1000",
            "-sc_threshold",
            "0",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            &src_str,
        ])
        .output()
        .expect("Failed to generate synthetic test video");
        assert!(
            gen_status.status.success(),
            "Synthetic test video generation failed"
        );

        let src_probe = probe_media_file(&src_str).expect("Failed to probe synthetic video");

        let out_start_trim = tmp_dir.join("out_start_trim.mp4");
        let mut job_start = make_test_job("mp4_h264", true);
        job_start.sources = vec![ExportSource {
            id: "src1".into(),
            path: src_str.clone(),
            filename: "single_kf_15s.mp4".into(),
            duration_ms: src_probe.duration_ms,
            width: Some(320),
            height: Some(180),
            codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            is_image: false,
        }];
        job_start.clips[0].in_ms = 5000;
        job_start.clips[0].out_ms = 15000;
        job_start.output.output_path = out_start_trim.to_string_lossy().to_string();
        job_start.total_duration_ms = 10000;

        let args1 = build_export_arguments(&job_start).expect("Failed to build start-trim args");
        let res1 = create_ffmpeg_command(&args1)
            .output()
            .expect("Failed to run ffmpeg");
        assert!(
            res1.status.success(),
            "FFmpeg failed on start-trim: {}",
            String::from_utf8_lossy(&res1.stderr)
        );
        let probe1 = probe_media_file(&job_start.output.output_path).expect("Failed to probe out1");
        assert!(
            (probe1.duration_ms as i64 - 10000).abs() <= 100,
            "Expected ~10000ms for 5s..15s trim, got {}ms",
            probe1.duration_ms
        );

        let out_mid_trim = tmp_dir.join("out_mid_trim.mp4");
        let mut job_mid = job_start.clone();
        job_mid.clips[0].in_ms = 3000;
        job_mid.clips[0].out_ms = 7000;
        job_mid.output.output_path = out_mid_trim.to_string_lossy().to_string();
        job_mid.total_duration_ms = 4000;

        let args2 = build_export_arguments(&job_mid).expect("Failed to build mid-trim args");
        let res2 = create_ffmpeg_command(&args2)
            .output()
            .expect("Failed to run ffmpeg");
        assert!(
            res2.status.success(),
            "FFmpeg failed on mid-trim: {}",
            String::from_utf8_lossy(&res2.stderr)
        );
        let probe2 = probe_media_file(&job_mid.output.output_path).expect("Failed to probe out2");
        assert!(
            (probe2.duration_ms as i64 - 4000).abs() <= 100,
            "Expected ~4000ms for 3s..7s trim, got {}ms",
            probe2.duration_ms
        );

        let out_end_trim = tmp_dir.join("out_end_trim.mp4");
        let mut job_end = job_start.clone();
        job_end.clips[0].in_ms = 0;
        job_end.clips[0].out_ms = 5000;
        job_end.output.output_path = out_end_trim.to_string_lossy().to_string();
        job_end.total_duration_ms = 5000;

        let args3 = build_export_arguments(&job_end).expect("Failed to build end-trim args");
        let res3 = create_ffmpeg_command(&args3)
            .output()
            .expect("Failed to run ffmpeg");
        assert!(
            res3.status.success(),
            "FFmpeg failed on end-trim: {}",
            String::from_utf8_lossy(&res3.stderr)
        );
        let probe3 = probe_media_file(&job_end.output.output_path).expect("Failed to probe out3");
        assert!(
            (probe3.duration_ms as i64 - 5000).abs() <= 100,
            "Expected ~5000ms for 0s..5s trim, got {}ms",
            probe3.duration_ms
        );

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
