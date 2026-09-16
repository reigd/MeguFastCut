use super::{ExportAspect, ExportClip, ExportJob, ExportSource};

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

pub fn select_video_encoder(
    format: &str,
    hw: &str,
    quality: &str,
    custom_crf: Option<u32>,
) -> Vec<String> {
    let crf = custom_crf.unwrap_or(match quality {
        "high" => 18,
        "small" => 28,
        _ => 23, // balanced
    });

    match format {
        "mp4_h264" => {
            match hw {
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
            }
        }
        "mp4_hevc" => {
            match hw {
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
            }
        }
        "webm_vp9" => vec![
            "-c:v".into(),
            "libvpx-vp9".into(),
            "-crf".into(),
            crf.to_string(),
            "-b:v".into(),
            "0".into(),
        ],
        "webm_av1" => vec![
            "-c:v".into(),
            "libsvtav1".into(),
            "-crf".into(),
            crf.to_string(),
            "-preset".into(),
            "6".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        "mov" => vec![
            "-c:v".into(),
            "prores_ks".into(),
            "-profile:v".into(),
            "3".into(), // ProRes 422 HQ
            "-pix_fmt".into(),
            "yuv422p10le".into(),
        ],
        "gif" => vec![],
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
    }
}

pub fn select_audio_encoder(format: &str, is_copy: bool) -> Vec<String> {
    if is_copy {
        return vec!["-c:a".into(), "copy".into()];
    }

    match format {
        "audio_mp3" => vec!["-vn".into(), "-c:a".into(), "libmp3lame".into(), "-b:a".into(), "192k".into()],
        "audio_wav" => vec!["-vn".into(), "-c:a".into(), "pcm_s16le".into()],
        "audio_flac" => vec!["-vn".into(), "-c:a".into(), "flac".into()],
        "webm_vp9" | "webm_av1" => vec!["-c:a".into(), "libopus".into(), "-b:a".into(), "160k".into()],
        _ => vec!["-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()],
    }
}

pub fn build_clip_video_filter(
    clip: &ExportClip,
    source: &ExportSource,
    job: &ExportJob,
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
    let src_w = source.width.unwrap_or(1920) as f64;
    let src_h = source.height.unwrap_or(1080) as f64;
    let target_ratio = resolve_aspect_ratio(&job.aspect, src_w, src_h);

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
    let target_w = make_even(target_h * target_ratio);
    let target_h = make_even(target_h);

    match job.fit_mode.as_str() {
        "crop" => {
            let crop = &job.crop;
            if crop.width > 0.0 && crop.height > 0.0 && (crop.width < 1.0 || crop.height < 1.0 || crop.x > 0.0 || crop.y > 0.0) {
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
            filters.push(format!("scale=w={}:h={}", target_w, target_h));
        }
        "stretch" => {
            filters.push(format!("scale=w={}:h={}", target_w, target_h));
        }
        _ => {
            // "fit" Letterbox / Pillarbox
            let src_ratio = src_w / src_h;
            if (src_ratio - target_ratio).abs() > 0.005 {
                let (scaled_w, scaled_h) = if src_ratio > target_ratio {
                    (target_w, make_even(target_w as f64 / src_ratio))
                } else {
                    (make_even(target_h as f64 * src_ratio), target_h)
                };
                let pad_x = (target_w - scaled_w) / 2;
                let pad_y = (target_h - scaled_h) / 2;

                let color = job.padding.color.as_deref().unwrap_or("black");
                let clean_color = if let Some(stripped) = color.strip_prefix('#') {
                    format!("0x{}", stripped)
                } else {
                    color.to_string()
                };

                filters.push(format!(
                    "scale=w={}:h={},pad=w={}:h={}:x={}:y={}:color={}",
                    scaled_w, scaled_h, target_w, target_h, pad_x, pad_y, clean_color
                ));
            } else {
                filters.push(format!("scale=w={}:h={}", target_w, target_h));
            }
        }
    }

    filters.join(",")
}

pub fn build_audio_filter(job: &ExportJob, clip_volume_db: f64) -> String {
    let mut filters = Vec::new();
    let net_volume_db = job.audio.volume_db + clip_volume_db;

    if net_volume_db.abs() > 0.1 {
        filters.push(format!("volume={:.1}dB", net_volume_db));
    }

    match job.audio.normalization.as_str() {
        "web" => filters.push("loudnorm=I=-14:TP=-1.5:LRA=11".to_string()),
        "broadcast" => filters.push("loudnorm=I=-23:TP=-1.0:LRA=14".to_string()),
        "cinema" => filters.push("loudnorm=I=-27:TP=-1.0:LRA=14".to_string()),
        _ => {}
    }

    filters.join(",")
}

pub fn build_export_arguments(job: &ExportJob) -> Result<Vec<String>, String> {
    let enabled_clips: Vec<&ExportClip> = job.clips.iter().filter(|c| c.enabled).collect();
    if enabled_clips.is_empty() {
        return Err("No enabled clips to export".to_string());
    }

    let mut args: Vec<String> = vec![
        "-nostats".into(),
        "-progress".into(),
        "pipe:1".into(),
    ];

    let is_audio_only = job.output.format.starts_with("audio_");
    let is_gif = job.output.format == "gif";

    let is_fast_copy = !is_audio_only
        && !is_gif
        && (job.output.format == "copy"
            || (job.output.format == "mp4_h264"
                && enabled_clips.len() == 1
                && job.aspect.id == "original"
                && job.fit_mode == "fit"
                && enabled_clips[0].rotate == 0
                && !enabled_clips[0].flip_h
                && !enabled_clips[0].flip_v
                && job.audio.volume_db.abs() < 0.1
                && enabled_clips[0].volume_db.abs() < 0.1
                && !job.audio.muted
                && job.audio.normalization == "off"));

    // CASE 1: Single Clip Fast Copy
    if is_fast_copy && enabled_clips.len() == 1 {
        let clip = enabled_clips[0];
        let source = job
            .sources
            .iter()
            .find(|s| s.id == clip.source_id)
            .ok_or_else(|| format!("Source not found: {}", clip.source_id))?;

        let in_sec = clip.in_ms as f64 / 1000.0;
        let out_sec = clip.out_ms as f64 / 1000.0;

        args.push("-y".into());
        args.push("-ss".into());
        args.push(format!("{:.3}", in_sec));
        args.push("-to".into());
        args.push(format!("{:.3}", out_sec));
        args.push("-i".into());
        args.push(source.path.clone());
        args.push("-c".into());
        args.push("copy".into());
        args.push("-avoid_negative_ts".into());
        args.push("make_zero".into());
        args.push(job.output.output_path.clone());
        return Ok(args);
    }

    // CASE 2: Multi-clip or Re-encode (Complex Filtergraph)
    // Add input clips
    for clip in &enabled_clips {
        let source = job
            .sources
            .iter()
            .find(|s| s.id == clip.source_id)
            .ok_or_else(|| format!("Source not found: {}", clip.source_id))?;

        let in_sec = clip.in_ms as f64 / 1000.0;
        let out_sec = clip.out_ms as f64 / 1000.0;

        args.push("-ss".into());
        args.push(format!("{:.3}", in_sec));
        args.push("-to".into());
        args.push(format!("{:.3}", out_sec));
        args.push("-i".into());
        args.push(source.path.clone());
    }

    let mut filter_complex = String::new();
    let num_clips = enabled_clips.len();

    if is_audio_only {
        for (i, clip) in enabled_clips.iter().enumerate() {
            let a_filter = build_audio_filter(job, clip.volume_db);
            if job.audio.muted {
                filter_complex.push_str(&format!("aevalsrc=0:d=1[a{}];", i));
            } else if a_filter.is_empty() {
                filter_complex.push_str(&format!("[{}:a]anull[a{}];", i, i));
            } else {
                filter_complex.push_str(&format!("[{}:a]{}[a{}];", i, a_filter, i));
            }
        }

        let mut concat_inputs = String::new();
        for i in 0..num_clips {
            concat_inputs.push_str(&format!("[a{}]", i));
        }
        filter_complex.push_str(&format!(
            "{}concat=n={}:v=0:a=1[outa]",
            concat_inputs, num_clips
        ));

        args.push("-filter_complex".into());
        args.push(filter_complex);
        args.push("-map".into());
        args.push("[outa]".into());

        let a_enc_args = select_audio_encoder(&job.output.format, false);
        args.extend(a_enc_args);
    } else if is_gif {
        for (i, clip) in enabled_clips.iter().enumerate() {
            let source = job
                .sources
                .iter()
                .find(|s| s.id == clip.source_id)
                .unwrap();

            let v_filter = build_clip_video_filter(clip, source, job);
            if v_filter.is_empty() {
                filter_complex.push_str(&format!("[{}:v]null[v{}];", i, i));
            } else {
                filter_complex.push_str(&format!("[{}:v]{}[v{}];", i, v_filter, i));
            }
        }

        let mut concat_inputs = String::new();
        for i in 0..num_clips {
            concat_inputs.push_str(&format!("[v{}]", i));
        }
        filter_complex.push_str(&format!(
            "{}concat=n={}:v=1:a=0[vconcat];[vconcat]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse[outv]",
            concat_inputs, num_clips
        ));

        args.push("-filter_complex".into());
        args.push(filter_complex);
        args.push("-map".into());
        args.push("[outv]".into());
        args.push("-an".into());
    } else {
        for (i, clip) in enabled_clips.iter().enumerate() {
            let source = job
                .sources
                .iter()
                .find(|s| s.id == clip.source_id)
                .unwrap();

            let v_filter = build_clip_video_filter(clip, source, job);
            if v_filter.is_empty() {
                filter_complex.push_str(&format!("[{}:v]null[v{}];", i, i));
            } else {
                filter_complex.push_str(&format!("[{}:v]{}[v{}];", i, v_filter, i));
            }

            let a_filter = build_audio_filter(job, clip.volume_db);
            if job.audio.muted {
                filter_complex.push_str(&format!("aevalsrc=0:d=1[a{}];", i));
            } else if a_filter.is_empty() {
                filter_complex.push_str(&format!("[{}:a]anull[a{}];", i, i));
            } else {
                filter_complex.push_str(&format!("[{}:a]{}[a{}];", i, a_filter, i));
            }
        }

        // Concat all inputs
        let mut concat_inputs = String::new();
        for i in 0..num_clips {
            concat_inputs.push_str(&format!("[v{}][a{}]", i, i));
        }
        filter_complex.push_str(&format!(
            "{}concat=n={}:v=1:a=1[outv][outa]",
            concat_inputs, num_clips
        ));

        args.push("-filter_complex".into());
        args.push(filter_complex);
        args.push("-map".into());
        args.push("[outv]".into());
        args.push("-map".into());
        args.push("[outa]".into());

        // Video encoder flags
        let v_enc_args = select_video_encoder(
            &job.output.format,
            &job.output.hardware_accel,
            &job.output.quality,
            job.output.crf,
        );
        args.extend(v_enc_args);

        // Audio encoder flags
        let a_enc_args = select_audio_encoder(&job.output.format, false);
        args.extend(a_enc_args);
    }

    args.push("-y".into());
    args.push(job.output.output_path.clone());

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
        let job = make_test_job("mp4_h264", true);
        let args = build_export_arguments(&job).expect("Failed to build args");

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(args.contains(&"-ss".to_string()));
        assert!(args.contains(&"1.000".to_string()));
        assert!(args.contains(&"-to".to_string()));
        assert!(args.contains(&"6.000".to_string()));
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
}
