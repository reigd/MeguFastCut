pub mod args;
pub mod runner;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSource {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub duration_ms: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub codec: Option<String>,
    pub audio_codec: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub id: String,
    pub source_id: String,
    pub in_ms: u64,
    pub out_ms: u64,
    pub enabled: bool,
    pub rotate: u32,       // 0, 90, 180, 270
    pub flip_h: bool,
    pub flip_v: bool,
    pub volume_db: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAspect {
    pub id: String,
    pub ratio: Option<f64>,
    pub custom_w: Option<u32>,
    pub custom_h: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCrop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPadding {
    pub mode: String, // "blur" | "color"
    pub color: Option<String>,
    pub blur_strength: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOutput {
    pub format: String, // "mp4_h264", "mp4_hevc", "webm_vp9", "webm_av1", "mov", "mkv", "gif", "copy", etc.
    pub quality: String, // "high", "balanced", "small", "custom"
    pub crf: Option<u32>,
    pub bitrate_kbps: Option<u32>,
    pub resolution_mode: String, // "auto", "1080p", etc.
    pub fps_mode: String,
    pub hardware_accel: String, // "auto", "nvenc", "qsv", "amf", "cpu"
    pub output_path: String,
    pub open_folder_after: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAudio {
    pub track_index: u32,
    pub volume_db: f64,
    pub muted: bool,
    pub normalization: String, // "off", "web", "broadcast", "cinema"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportJob {
    pub sources: Vec<ExportSource>,
    pub clips: Vec<ExportClip>,
    pub aspect: ExportAspect,
    pub fit_mode: String,
    pub crop: ExportCrop,
    pub padding: ExportPadding,
    pub output: ExportOutput,
    pub audio: ExportAudio,
    pub total_duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub percentage: f64,
    pub fps: f64,
    pub speed: String,
    pub out_time_ms: u64,
    pub total_duration_ms: u64,
    pub eta_seconds: u64,
    pub status: String, // "running", "complete", "cancelled", "error"
    pub error_message: Option<String>,
}
