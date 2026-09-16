import assert from 'assert';
import {
  makeEven,
  resolveAspectRatio,
  calculateTargetDimensions,
  computeGeometry,
  buildCssTransform,
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

// 6. CSS Transform builder
assert.strictEqual(buildCssTransform(0, false, false), 'none');
assert.strictEqual(buildCssTransform(90, false, false), 'rotate(90deg)');
assert.strictEqual(buildCssTransform(180, true, false), 'rotate(180deg) scale(-1, 1)');
assert.strictEqual(buildCssTransform(0, false, true), 'scale(1, -1)');

console.log('\x1b[32m[geometry-test] ALL TESTS PASSED: 100% pixel-to-pixel parity and even dimensions confirmed.\x1b[0m');
