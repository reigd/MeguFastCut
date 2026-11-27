import assert from 'assert';
import {
  DEFAULT_VIDEO_ADJUSTMENTS,
  VIDEO_LOOK_PRESETS,
  VIDEO_PARAM_SPECS,
  buildSvgColorMatrixValues,
  buildToneCurveTableValues,
  clampVideoAdjustment,
  computeColorMatrix3x3,
  computePreviewFilterSpec,
  countActiveVideoAdjustments,
  detectMatchingCustomPreset,
  detectMatchingLookPreset,
  evaluateToneCurveSample,
  hasActiveVideoAdjustments,
  hasToneCurveAdjustments,
  resolveClipVideoAdjustments,
} from '../src/shared/video-fx.ts';

console.log('Running video-fx mathematical engine tests...');

// 1. Parameter count & defaults
assert.strictEqual(VIDEO_PARAM_SPECS.length, 23);
assert.strictEqual(DEFAULT_VIDEO_ADJUSTMENTS.opacity, 100);
assert.strictEqual(hasActiveVideoAdjustments(DEFAULT_VIDEO_ADJUSTMENTS), false);
assert.strictEqual(countActiveVideoAdjustments(DEFAULT_VIDEO_ADJUSTMENTS), 0);

// 2. Clamping & legacy clip.sharpness migration
assert.strictEqual(clampVideoAdjustment('exposure', 999), 100);
assert.strictEqual(clampVideoAdjustment('exposure', -999), -100);
assert.strictEqual(clampVideoAdjustment('hue', 270), 180);
assert.strictEqual(clampVideoAdjustment('hue', -270), -180);
assert.strictEqual(clampVideoAdjustment('opacity', Number.NaN), 100);

const legacyResolved = resolveClipVideoAdjustments({ sharpness: 0.65 });
assert.strictEqual(legacyResolved.sharpness, 65);
assert.strictEqual(hasActiveVideoAdjustments({ sharpness: 0.65 }), true);
assert.strictEqual(countActiveVideoAdjustments(legacyResolved, 'detail'), 1);

// 3. Tone curve monotonicity & bounds
for (const preset of VIDEO_LOOK_PRESETS) {
  const full = { ...DEFAULT_VIDEO_ADJUSTMENTS, ...preset.values };
  assert.strictEqual(detectMatchingLookPreset(full), preset.id);
  let prev = -1;
  for (let i = 0; i <= 32; i++) {
    const x = i / 32;
    const y = evaluateToneCurveSample(x, full);
    assert.ok(Number.isFinite(y) && y >= 0 && y <= 1, `Out of bounds y=${y} for ${preset.id}`);
    assert.ok(y + 1e-6 >= prev, `Non-monotonic curve at x=${x} for ${preset.id}: ${prev} -> ${y}`);
    prev = y;
  }
}

assert.strictEqual(hasToneCurveAdjustments(DEFAULT_VIDEO_ADJUSTMENTS), false);
assert.strictEqual(buildToneCurveTableValues(DEFAULT_VIDEO_ADJUSTMENTS), null);

const faded = { ...DEFAULT_VIDEO_ADJUSTMENTS, fade: 50 };
assert.ok(evaluateToneCurveSample(0, faded) > 0.06);
assert.ok(buildToneCurveTableValues(faded, 17)?.split(' ').length === 17);

// 4. Rec.709 color matrix identity & monochrome
assert.strictEqual(computeColorMatrix3x3(DEFAULT_VIDEO_ADJUSTMENTS, false), null);
assert.strictEqual(buildSvgColorMatrixValues(DEFAULT_VIDEO_ADJUSTMENTS), null);

const bw = computeColorMatrix3x3({ ...DEFAULT_VIDEO_ADJUSTMENTS, saturation: -100 }, false);
assert.ok(bw);
assert.ok(Math.abs(bw[0] - 0.2126) < 0.001);
assert.ok(Math.abs(bw[1] - 0.7152) < 0.001);
assert.ok(Math.abs(bw[2] - 0.0722) < 0.001);

// 5. Preview filter spec
const emptySpec = computePreviewFilterSpec(DEFAULT_VIDEO_ADJUSTMENTS, 1920, 1080);
assert.strictEqual(emptySpec.hasSvgFilter, false);
assert.strictEqual(emptySpec.vignetteCss, null);
assert.strictEqual(emptySpec.grainOpacity, 0);
assert.strictEqual(emptySpec.opacityFactor, 1);

const richSpec = computePreviewFilterSpec(
  {
    ...DEFAULT_VIDEO_ADJUSTMENTS,
    exposure: 20,
    temperature: 30,
    sharpness: 50,
    clarity: 25,
    denoise: 40,
    vignette: 35,
    grain: 50,
    blur: 20,
    aberration: 50,
    opacity: 80,
  },
  960,
  540
);
assert.strictEqual(richSpec.hasSvgFilter, true);
assert.ok(richSpec.aberrationPx > 1);
assert.ok(richSpec.colorMatrixValues !== null);
assert.ok(richSpec.toneTableValues !== null);
assert.ok(richSpec.sharpnessKernel !== null);
assert.ok(richSpec.blurSigma > 1);
assert.ok(richSpec.vignetteCss !== null);
assert.ok(richSpec.grainOpacity > 0.1);
assert.strictEqual(richSpec.opacityFactor, 0.8);

// 6. Custom preset matching
const customPresets = [
  {
    id: 'cp-1',
    name: 'My Warm Look',
    values: {
      ...DEFAULT_VIDEO_ADJUSTMENTS,
      temperature: 28,
      contrast: 14,
      sharpness: 20,
    },
    createdAt: 1000,
    updatedAt: 1000,
  },
];
assert.strictEqual(
  detectMatchingCustomPreset(
    { ...DEFAULT_VIDEO_ADJUSTMENTS, temperature: 28, contrast: 14, sharpness: 20 },
    customPresets
  ),
  'cp-1'
);
assert.strictEqual(
  detectMatchingCustomPreset({ ...DEFAULT_VIDEO_ADJUSTMENTS, temperature: 27 }, customPresets),
  null
);

console.log('\x1b[32m[video-fx-test] ALL TESTS PASSED: 23 parameters, 8 presets, custom preset match, tone curves & color matrices verified.\x1b[0m');
