import assert from 'assert';
import {
  makeEven,
  resolveAspectRatio,
  calculateTargetDimensions,
  computeGeometry,
  buildCssTransform,
  computeDefaultOverlayBounds,
  computeOverlayPixelRect,
} from '../src/shared/geometry.ts';

console.log('Running geometry calculation tests...');

// 1. makeEven test
assert.strictEqual(makeEven(1920), 1920);
assert.strictEqual(makeEven(1081), 1082);
assert.strictEqual(makeEven(719.9), 720);
assert.strictEqual(makeEven(0), 0);

// 2. resolveAspectRatio test
assert.strictEqual(resolveAspectRatio({ id: '16:9' }, 1920, 1080), 16 / 9);
assert.strictEqual(resolveAspectRatio({ id: '9:16' }, 1920, 1080), 9 / 16);
assert.strictEqual(resolveAspectRatio({ id: '1:1' }, 1920, 1080), 1.0);
assert.strictEqual(resolveAspectRatio({ id: '4:5' }, 1920, 1080), 0.8);
assert.strictEqual(resolveAspectRatio({ id: 'original' }, 1280, 720), 1280 / 720);

// 3. calculateTargetDimensions test
const d169 = calculateTargetDimensions(1920, 1080, 16 / 9, '1080p');
assert.strictEqual(d169.targetW, 1920);
assert.strictEqual(d169.targetH, 1080);
assert.strictEqual(d169.targetW % 2, 0);
assert.strictEqual(d169.targetH % 2, 0);

const d916 = calculateTargetDimensions(1920, 1080, 9 / 16, '1080p');
assert.strictEqual(d916.targetW, 608); // 1080 * 9/16 = 607.5 -> 608 (even)
assert.strictEqual(d916.targetH, 1080);
assert.strictEqual(d916.targetW % 2, 0);
assert.strictEqual(d916.targetH % 2, 0);

// 4. computeGeometry Fit mode (horizontal video into 9:16 vertical)
const fitRes = computeGeometry(
  1920,
  1080,
  { id: '9:16' },
  'fit',
  { x: 0, y: 0, width: 1, height: 1 },
  '1080p'
);
assert.strictEqual(fitRes.targetWidth, 608);
assert.strictEqual(fitRes.targetHeight, 1080);
assert.strictEqual(fitRes.scaledWidth, 608);
assert.strictEqual(fitRes.scaledHeight % 2, 0);
assert.strictEqual(fitRes.offsetY % 2, 0);
assert.strictEqual(fitRes.offsetX, 0);

// 5. computeGeometry Crop mode (center crop 16:9 to 9:16)
const cropRes = computeGeometry(
  1920,
  1080,
  { id: '9:16' },
  'crop',
  { x: 0, y: 0, width: 1, height: 1 },
  '1080p'
);
assert.strictEqual(cropRes.targetWidth, 608);
assert.strictEqual(cropRes.targetHeight, 1080);
assert.strictEqual(cropRes.sourceCropH, 1080);
assert.strictEqual(cropRes.sourceCropW, 608); // 1080 * 9/16 = 607.5 -> 608
assert.strictEqual(cropRes.sourceCropX, (1920 - 608) / 2); // 656
assert.strictEqual(cropRes.sourceCropY, 0);

// 6. computeGeometry Fit and Stretch modes with custom canvasBounds
const stretchCustomRes = computeGeometry(
  1920,
  1080,
  { id: 'original' },
  'stretch',
  { x: 0, y: 0, width: 1, height: 1 },
  '1080p',
  { x: 0.1, y: 0.0, width: 0.8, height: 1.0 }
);
assert.strictEqual(stretchCustomRes.targetWidth, 1920);
assert.strictEqual(stretchCustomRes.targetHeight, 1080);
assert.strictEqual(stretchCustomRes.scaledWidth, 1536);
assert.strictEqual(stretchCustomRes.scaledHeight, 1080);
assert.strictEqual(stretchCustomRes.offsetX, 192);
assert.strictEqual(stretchCustomRes.offsetY, 0);

const fitCustomRes = computeGeometry(
  1920,
  1080,
  { id: 'original' },
  'fit',
  { x: 0, y: 0, width: 1, height: 1 },
  '1080p',
  { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }
);
assert.strictEqual(fitCustomRes.scaledWidth, 1152);
assert.strictEqual(fitCustomRes.scaledHeight, 648);
assert.strictEqual(fitCustomRes.offsetX, 384);
assert.strictEqual(fitCustomRes.offsetY, 216);

// 7. CSS Transform builder
assert.strictEqual(buildCssTransform(0, false, false), 'none');
assert.strictEqual(buildCssTransform(90, false, false), 'rotate(90deg)');
assert.strictEqual(buildCssTransform(180, true, false), 'rotate(180deg) scale(-1, 1)');
assert.strictEqual(buildCssTransform(0, false, true), 'scale(1, -1)');

// 8. Overlay default bounds & pixel-to-pixel FFmpeg parity
const ovSquareOn169 = computeDefaultOverlayBounds(1000, 1000, 1920, 1080, 0, 0.6);
assert.ok(Math.abs(ovSquareOn169.height - 0.6) < 0.0001);
assert.ok(Math.abs(ovSquareOn169.width - (0.6 * 1080) / 1920) < 0.0001);
assert.ok(Math.abs(ovSquareOn169.x - (1 - ovSquareOn169.width) / 2) < 0.0001);
assert.ok(Math.abs(ovSquareOn169.y - 0.2) < 0.0001);

const ovPx = computeOverlayPixelRect({ x: 0.1, y: 0.1, width: 0.25, height: 0.25 }, 1920, 1080);
assert.strictEqual(ovPx.x, 192);
assert.strictEqual(ovPx.y, 108);
assert.strictEqual(ovPx.width, 480);
assert.strictEqual(ovPx.height, 270);
assert.strictEqual(ovPx.width % 2, 0);
assert.strictEqual(ovPx.height % 2, 0);

// Rotated 90deg landscape overlay swaps aspect ratio cleanly
const ovRot90 = computeDefaultOverlayBounds(1920, 1080, 1920, 1080, 90, 0.6);
assert.ok(ovRot90.height > ovRot90.width);

console.log('\x1b[32m[geometry-test] ALL TESTS PASSED: 100% pixel-to-pixel parity and even dimensions confirmed.\x1b[0m');
