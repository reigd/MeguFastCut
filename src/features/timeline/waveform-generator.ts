/**
 * Audio waveform visualization cache and deterministic amplitude generator
 */

const waveformCache = new Map<string, Float32Array>();

/**
 * Generates or retrieves a deterministic, realistic audio amplitude profile
 * for a source file. Normalized values 0.05..0.95.
 */
export function getSourceWaveform(sourceId: string, durationMs: number, sampleCount = 600): Float32Array {
  const cached = waveformCache.get(sourceId);
  if (cached && cached.length === sampleCount) {
    return cached;
  }

  const samples = new Float32Array(sampleCount);

  // Deterministic seed based on sourceId characters and duration
  let seed = Math.round(durationMs) >>> 0;
  for (let i = 0; i < sourceId.length; i++) {
    seed = (seed * 31 + sourceId.charCodeAt(i)) >>> 0;
  }

  const pseudoRandom = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed >>> 8) / 16777216;
  };

  // Generate multi-frequency natural amplitude envelope
  let currentEnergy = 0.4 + pseudoRandom() * 0.4;
  for (let i = 0; i < sampleCount; i++) {
    // Vary energy with a wandering walk
    const walk = (pseudoRandom() - 0.48) * 0.15;
    currentEnergy = Math.max(0.1, Math.min(0.95, currentEnergy + walk));

    // Combine high frequency speech-like transients with baseline energy
    const transient = Math.sin(i * 1.7) * 0.15 + Math.cos(i * 3.4) * 0.1;
    const value = Math.max(0.06, Math.min(0.98, currentEnergy + transient * pseudoRandom()));
    samples[i] = value;
  }

  waveformCache.set(sourceId, samples);
  return samples;
}

/**
 * Draws the waveform portion corresponding to [inMs, outMs] onto a 2D canvas context.
 */
export function drawClipWaveform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  samples: Float32Array,
  inMs: number,
  outMs: number,
  sourceDurationMs: number,
  fillColor: string
): void {
  if (width <= 0 || height <= 0 || sourceDurationMs <= 0 || samples.length === 0) return;

  const inRatio = Math.max(0, Math.min(1, inMs / sourceDurationMs));
  const outRatio = Math.max(inRatio, Math.min(1, outMs / sourceDurationMs));

  const startIdx = Math.floor(inRatio * (samples.length - 1));
  const endIdx = Math.ceil(outRatio * (samples.length - 1));
  const clipSamplesCount = Math.max(1, endIdx - startIdx);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.fillStyle = fillColor;

  // Draw vertical amplitude bars with 1px space between bars
  const barWidth = 2;
  const barGap = 1;
  const totalStep = barWidth + barGap;
  const numBars = Math.floor(width / totalStep);
  const midY = y + height * 0.65; // Position slightly towards the bottom of the clip
  const maxBarHeight = height * 0.45;

  for (let b = 0; b < numBars; b++) {
    const barX = x + b * totalStep;
    const sampleProgress = b / Math.max(1, numBars - 1);
    const sampleIdx = Math.min(
      samples.length - 1,
      Math.floor(startIdx + sampleProgress * clipSamplesCount)
    );

    const amp = samples[sampleIdx] || 0.1;
    const barH = Math.max(2, amp * maxBarHeight);

    // Mirrored bar centered at midY
    ctx.fillRect(barX, midY - barH, barWidth, barH * 1.8);
  }

  ctx.restore();
}
