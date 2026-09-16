use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use crate::ffmpeg::sidecar::create_ffmpeg_command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capabilities {
    pub has_nvenc_h264: bool,
    pub has_nvenc_hevc: bool,
    pub has_qsv_h264: bool,
    pub has_qsv_hevc: bool,
    pub has_amf_h264: bool,
    pub has_amf_hevc: bool,
    pub has_libx264: bool,
    pub has_libx265: bool,
    pub has_libvpx_vp9: bool,
    pub has_libsvtav1: bool,
    pub has_aac: bool,
    pub has_libopus: bool,
    pub has_libmp3lame: bool,
    pub has_flac: bool,
    pub recommended_hw: String, // "nvenc" | "qsv" | "amf" | "cpu"
}

static CAPABILITIES: OnceLock<Capabilities> = OnceLock::new();

pub fn detect_capabilities() -> &'static Capabilities {
    CAPABILITIES.get_or_init(|| {
        let output = match create_ffmpeg_command(["-encoders", "-hide_banner"]).output() {
            Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
            Err(_) => String::new(),
        };

        let has_nvenc_h264 = output.contains("h264_nvenc");
        let has_nvenc_hevc = output.contains("hevc_nvenc");
        let has_qsv_h264 = output.contains("h264_qsv");
        let has_qsv_hevc = output.contains("hevc_qsv");
        let has_amf_h264 = output.contains("h264_amf");
        let has_amf_hevc = output.contains("hevc_amf");

        let has_libx264 = output.contains("libx264");
        let has_libx265 = output.contains("libx265");
        let has_libvpx_vp9 = output.contains("libvpx-vp9");
        let has_libsvtav1 = output.contains("libsvtav1");

        let has_aac = output.contains(" aac ");
        let has_libopus = output.contains("libopus");
        let has_libmp3lame = output.contains("libmp3lame");
        let has_flac = output.contains("flac");

        let recommended_hw = if has_nvenc_h264 {
            "nvenc".to_string()
        } else if has_qsv_h264 {
            "qsv".to_string()
        } else if has_amf_h264 {
            "amf".to_string()
        } else {
            "cpu".to_string()
        };

        Capabilities {
            has_nvenc_h264,
            has_nvenc_hevc,
            has_qsv_h264,
            has_qsv_hevc,
            has_amf_h264,
            has_amf_hevc,
            has_libx264,
            has_libx265,
            has_libvpx_vp9,
            has_libsvtav1,
            has_aac,
            has_libopus,
            has_libmp3lame,
            has_flac,
            recommended_hw,
        }
    })
}
