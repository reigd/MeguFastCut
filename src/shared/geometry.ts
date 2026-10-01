import type { AspectSetting, FitMode, CropRect, RotateAngle } from './types';

/**
 * Ensure dimension is even for video codecs (x264, x265, VP9 require even dimensions)
 */
export function makeEven(n: number): number {
  const rounded = Math.round(n);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export interface GeometryResult {
  targetWidth: number;
  targetHeight: number;
  scaledWidth: number;
  scaledHeight: number;
  offsetX: number;
  offsetY: number;
  // FFmpeg crop values (in source pixels)
  sourceCropX: number;
  sourceCropY: number;
  sourceCropW: number;
  sourceCropH: number;
  // FFmpeg pad values (in target pixels)
  padW: number;
  padH: number;
  padX: number;
  padY: number;
}

/**
 * Resolves the numeric aspect ratio (width / height) from an AspectSetting
 */
export function resolveAspectRatio(
  aspect: AspectSetting,
  sourceW: number,
  sourceH: number
): number {
  if (aspect.id === 'original' || !aspect.id) {
    return sourceW > 0 && sourceH > 0 ? sourceW / sourceH : 16 / 9;
  }
  if (aspect.id === '16:9') return 16 / 9;
  if (aspect.id === '9:16') return 9 / 16;
  if (aspect.id === '1:1') return 1.0;
  if (aspect.id === '4:5') return 4 / 5;
  if (aspect.id === '4:3') return 4 / 3;
  if (aspect.id === '21:9') return 21 / 9;
  if (aspect.id === '2:3') return 2 / 3;
  if (aspect.id === 'custom' && aspect.customW && aspect.customH && aspect.customH > 0) {
    return aspect.customW / aspect.customH;
  }
  return aspect.ratio || (sourceW / sourceH);
}

/**
 * Computes target canvas dimensions given source dimensions, aspect ratio and resolution preset
 */
export function calculateTargetDimensions(
  sourceW: number,
  sourceH: number,
  targetRatio: number,
  resMode: 'auto' | '2160p' | '1440p' | '1080p' | '720p' | '480p' = 'auto'
): { targetW: number; targetH: number } {
  let targetH: number;

  switch (resMode) {
    case '2160p':
      targetH = 2160;
      break;
    case '1440p':
      targetH = 1440;
      break;
    case '1080p':
      targetH = 1080;
      break;
    case '720p':
      targetH = 720;
      break;
    case '480p':
      targetH = 480;
      break;
    case 'auto':
    default:
      // If target is vertical (ratio < 1) and source was horizontal, preserve source height or 1920
      if (targetRatio < 1 && sourceW >= sourceH) {
        targetH = Math.max(sourceH, 1920);
      } else {
        targetH = sourceH;
      }
      break;
  }

  const targetW = makeEven(targetH * targetRatio);
  targetH = makeEven(targetH);

  return { targetW, targetH };
}

/**
 * Pixel-to-pixel geometry computation used by BOTH the CSS Preview and FFmpeg filter builder
 */
export function computeGeometry(
  srcW: number,
  srcH: number,
  aspect: AspectSetting,
  fitMode: FitMode,
  crop: CropRect,
  resMode: 'auto' | '2160p' | '1440p' | '1080p' | '720p' | '480p' = 'auto'
): GeometryResult {
  const targetRatio = resolveAspectRatio(aspect, srcW, srcH);
  const { targetW, targetH } = calculateTargetDimensions(srcW, srcH, targetRatio, resMode);

  let scaledWidth = targetW;
  let scaledHeight = targetH;
  let offsetX = 0;
  let offsetY = 0;

  let sourceCropX = 0;
  let sourceCropY = 0;
  let sourceCropW = srcW;
  let sourceCropH = srcH;

  let padW = targetW;
  let padH = targetH;
  let padX = 0;
  let padY = 0;

  if (fitMode === 'stretch') {
    if (crop && crop.width > 0 && crop.height > 0 && (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0)) {
      sourceCropW = makeEven(crop.width * srcW);
      sourceCropH = makeEven(crop.height * srcH);
      sourceCropX = makeEven(crop.x * srcW);
      sourceCropY = makeEven(crop.y * srcH);
    }
    scaledWidth = targetW;
    scaledHeight = targetH;
  } else if (fitMode === 'fit') {
    // Letterbox / Pillarbox inside target
    let effectiveSrcW = srcW;
    let effectiveSrcH = srcH;
    if (crop && crop.width > 0 && crop.height > 0 && (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0)) {
      sourceCropW = makeEven(crop.width * srcW);
      sourceCropH = makeEven(crop.height * srcH);
      sourceCropX = makeEven(crop.x * srcW);
      sourceCropY = makeEven(crop.y * srcH);
      effectiveSrcW = sourceCropW;
      effectiveSrcH = sourceCropH;
    }
    const srcRatio = effectiveSrcW / effectiveSrcH;
    if (srcRatio > targetRatio) {
      // Fit to width, pillarbox top/bottom
      scaledWidth = targetW;
      scaledHeight = makeEven(targetW / srcRatio);
      offsetY = makeEven((targetH - scaledHeight) / 2);
    } else {
      // Fit to height, letterbox left/right
      scaledHeight = targetH;
      scaledWidth = makeEven(targetH * srcRatio);
      offsetX = makeEven((targetW - scaledWidth) / 2);
    }
    padW = targetW;
    padH = targetH;
    padX = offsetX;
    padY = offsetY;
  } else if (fitMode === 'crop') {
    // Crop mode: center crop or interactive crop rect
    const srcRatio = srcW / srcH;
    if (crop && crop.width > 0 && crop.height > 0 && (crop.width < 1 || crop.height < 1 || crop.x > 0 || crop.y > 0)) {
      // Normalized crop rect (0..1)
      sourceCropW = makeEven(crop.width * srcW);
      sourceCropH = makeEven(crop.height * srcH);
      sourceCropX = makeEven(crop.x * srcW);
      sourceCropY = makeEven(crop.y * srcH);
    } else {
      // Automatic center crop to target ratio
      if (srcRatio > targetRatio) {
        sourceCropH = makeEven(srcH);
        sourceCropW = makeEven(srcH * targetRatio);
        sourceCropX = makeEven((srcW - sourceCropW) / 2);
        sourceCropY = 0;
      } else {
        sourceCropW = makeEven(srcW);
        sourceCropH = makeEven(srcW / targetRatio);
        sourceCropX = 0;
        sourceCropY = makeEven((srcH - sourceCropH) / 2);
      }
    }
    scaledWidth = targetW;
    scaledHeight = targetH;
  }

  return {
    targetWidth: targetW,
    targetHeight: targetH,
    scaledWidth,
    scaledHeight,
    offsetX,
    offsetY,
    sourceCropX,
    sourceCropY,
    sourceCropW,
    sourceCropH,
    padW,
    padH,
    padX,
    padY,
  };
}

/**
 * Builds standard CSS transform string for video rotation and flipping
 */
export function buildCssTransform(
  rotate: RotateAngle = 0,
  flipH: boolean = false,
  flipV: boolean = false
): string {
  const parts: string[] = [];
  if (rotate !== 0) {
    parts.push(`rotate(${rotate}deg)`);
  }
  const scaleX = flipH ? -1 : 1;
  const scaleY = flipV ? -1 : 1;
  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${scaleX}, ${scaleY})`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
