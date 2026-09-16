/**
 * Adaptive timeline time ruler renderer
 */

const CANDIDATE_STEPS_MS = [
  33.333, // 1 frame (~30fps)
  100,    // 100ms
  250,    // 250ms
  500,    // 500ms
  1000,   // 1s
  2000,   // 2s
  5000,   // 5s
  10000,  // 10s
  15000,  // 15s
  30000,  // 30s
  60000,  // 1m
  120000, // 2m
  300000, // 5m
  600000, // 10m
  1800000,// 30m
  3600000,// 1h
];

export function chooseRulerStep(pixelsPerMs: number, minPixelDistance = 64): number {
  for (const step of CANDIDATE_STEPS_MS) {
    if (step * pixelsPerMs >= minPixelDistance) {
      return step;
    }
  }
  return 3600000;
}

export function formatRulerTime(ms: number, stepMs: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const fractionMs = Math.round(ms % 1000);

  if (stepMs < 1000) {
    // Show sub-second resolution
    const hundredths = Math.floor(fractionMs / 10);
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    const ff = hundredths.toString().padStart(2, '0');
    return `${mm}:${ss}.${ff}`;
  }

  if (hours > 0) {
    const hh = hours.toString();
    const mm = minutes.toString().padStart(2, '0');
    const ss = seconds.toString().padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }

  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

export function drawTimelineRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  rulerHeight: number,
  scrollOffsetMs: number,
  pixelsPerMs: number,
  textColor: string,
  tickColor: string,
  borderColor: string
): void {
  // Ruler border line at bottom
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, rulerHeight - 0.5);
  ctx.lineTo(width, rulerHeight - 0.5);
  ctx.stroke();

  const majorStepMs = chooseRulerStep(pixelsPerMs, 72);
  const minorStepMs = majorStepMs >= 1000 ? majorStepMs / 5 : majorStepMs / 2;

  const startMs = Math.max(0, scrollOffsetMs);
  const endMs = scrollOffsetMs + width / pixelsPerMs;

  const firstMinor = Math.floor(startMs / minorStepMs) * minorStepMs;

  ctx.font = '10px "SF Mono", "Segoe UI Mono", "Cascadia Code", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  for (let t = firstMinor; t <= endMs; t += minorStepMs) {
    const x = Math.round((t - scrollOffsetMs) * pixelsPerMs) + 0.5;
    if (x < 0 || x > width) continue;

    const isMajor = Math.abs(t % majorStepMs) < 0.001 || Math.abs((t % majorStepMs) - majorStepMs) < 0.001;

    ctx.strokeStyle = tickColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    if (isMajor) {
      // Major tick
      ctx.moveTo(x, rulerHeight - 9);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      // Timecode label
      ctx.fillStyle = textColor;
      const label = formatRulerTime(t, majorStepMs);
      ctx.fillText(label, x + 4, rulerHeight / 2 - 2);
    } else {
      // Minor tick
      ctx.moveTo(x, rulerHeight - 5);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();
    }
  }
}
