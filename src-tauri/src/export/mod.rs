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
    #[serde(default)]
    pub fps_num: Option<u32>,
    #[serde(default)]
    pub fps_den: Option<u32>,
    pub codec: Option<String>,
    pub audio_codec: Option<String>,
    #[serde(default)]
    pub is_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportTransition {
    #[serde(rename = "type")]
    pub kind: String,
    pub duration_ms: u64,
    #[serde(default)]
    pub direction: Option<String>,
    #[serde(default)]
    pub easing: Option<String>,
    #[serde(default)]
    pub softness: Option<f64>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub audio_mode: Option<String>,
}

fn default_speed() -> f64 {
    1.0
}

fn default_opacity() -> f64 {
    100.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ExportVideoAdjustments {
    pub exposure: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub highlights: f64,
    pub shadows: f64,
    pub whites: f64,
    pub blacks: f64,
    pub gamma: f64,
    pub temperature: f64,
    pub tint: f64,
    pub saturation: f64,
    pub vibrance: f64,
    pub hue: f64,
    pub sharpness: f64,
    pub clarity: f64,
    pub denoise: f64,
    pub deband: f64,
    pub fade: f64,
    pub vignette: f64,
    pub grain: f64,
    pub blur: f64,
    pub aberration: f64,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
}

impl Default for ExportVideoAdjustments {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            brightness: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            gamma: 0.0,
            temperature: 0.0,
            tint: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            hue: 0.0,
            sharpness: 0.0,
            clarity: 0.0,
            denoise: 0.0,
            deband: 0.0,
            fade: 0.0,
            vignette: 0.0,
            grain: 0.0,
            blur: 0.0,
            aberration: 0.0,
            opacity: 100.0,
        }
    }
}

impl ExportVideoAdjustments {
    pub fn is_active(&self) -> bool {
        self.exposure.abs() > 0.01
            || self.brightness.abs() > 0.01
            || self.contrast.abs() > 0.01
            || self.highlights.abs() > 0.01
            || self.shadows.abs() > 0.01
            || self.whites.abs() > 0.01
            || self.blacks.abs() > 0.01
            || self.gamma.abs() > 0.01
            || self.temperature.abs() > 0.01
            || self.tint.abs() > 0.01
            || self.saturation.abs() > 0.01
            || self.vibrance.abs() > 0.01
            || self.hue.abs() > 0.01
            || self.sharpness > 0.1
            || self.clarity.abs() > 0.01
            || self.denoise > 0.01
            || self.deband > 0.01
            || self.fade > 0.01
            || self.vignette.abs() > 0.01
            || self.grain > 0.01
            || self.blur > 0.01
            || self.aberration > 0.01
            || (self.opacity - 100.0).abs() > 0.1
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub id: String,
    pub source_id: String,
    pub in_ms: u64,
    pub out_ms: u64,
    pub enabled: bool,
    pub rotate: u32, // 0, 90, 180, 270
    pub flip_h: bool,
    pub flip_v: bool,
    pub volume_db: f64,
    #[serde(default = "default_speed")]
    pub speed: f64,
    #[serde(default)]
    pub sharpness: f64, // 0.0..=1.0 (CAS Contrast Adaptive Sharpening strength)
    #[serde(default)]
    pub video_adjustments: Option<ExportVideoAdjustments>,
    #[serde(default)]
    pub start_ms: Option<u64>,
    #[serde(default)]
    pub track_index: u32, // 0 = main track (V1), 1+ = overlay tracks (V2, V3...)
    #[serde(default)]
    pub overlay_bounds: Option<ExportCrop>, // normalized 0..1 position & size on target canvas
    #[serde(default)]
    pub canvas_bounds: Option<ExportCrop>, // normalized 0..1 position & size on target canvas for V1 clips
    #[serde(default)]
    pub crop: Option<ExportCrop>, // per-clip crop override for V1 clips
    #[serde(default)]
    pub transition_in: Option<ExportTransition>,
    #[serde(default)]
    pub transition_out: Option<ExportTransition>,
}

impl ExportClip {
    pub fn resolved_adjustments(&self) -> ExportVideoAdjustments {
        if let Some(adj) = &self.video_adjustments {
            let mut out = adj.clone();
            if out.sharpness <= 0.01 && self.sharpness > 0.001 {
                out.sharpness = (self.sharpness * 100.0).clamp(0.0, 100.0);
            }
            out
        } else {
            ExportVideoAdjustments {
                sharpness: (self.sharpness * 100.0).clamp(0.0, 100.0),
                ..Default::default()
            }
        }
    }

    pub fn has_active_video_adjustments(&self) -> bool {
        self.resolved_adjustments().is_active()
    }
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

fn default_true() -> bool {
    true
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
    #[serde(default = "default_true")]
    pub export_video: bool,
    #[serde(default)]
    pub export_audio: bool,
    #[serde(default)]
    pub video_output_path: Option<String>,
    #[serde(default)]
    pub audio_output_path: Option<String>,
    #[serde(default)]
    pub video_container: Option<String>,
    #[serde(default)]
    pub video_codec: Option<String>,
    #[serde(default)]
    pub audio_codec: Option<String>,
    #[serde(default)]
    pub audio_format: Option<String>,
    #[serde(default)]
    pub audio_bitrate: Option<String>,
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
    #[serde(default)]
    pub canvas_bounds: Option<ExportCrop>,
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
