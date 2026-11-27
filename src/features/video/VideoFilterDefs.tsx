import React from 'react';
import type { PreviewFilterSpec } from '../../shared/video-fx';

const GRAIN_TILE_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>` +
  `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/>` +
  `<feColorMatrix type='saturate' values='0'/></filter>` +
  `<rect width='128' height='128' filter='url(%23g)' opacity='0.85'/></svg>`;

const GRAIN_DATA_URI = `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_TILE_SVG)}")`;

interface VideoSvgFilterDefsProps {
  filterId: string;
  spec: PreviewFilterSpec;
}

export const VideoSvgFilterDefs: React.FC<VideoSvgFilterDefsProps> = ({ filterId, spec }) => {
  if (!spec.hasSvgFilter) return null;

  let currentIn = 'SourceGraphic';
  const nodes: React.ReactNode[] = [];

  if (spec.aberrationPx > 0.05) {
    nodes.push(
      <feOffset key="abb-roff" in={currentIn} dx={-spec.aberrationPx} dy={0} result="abb_r_off" />,
      <feColorMatrix
        key="abb-r"
        in="abb_r_off"
        type="matrix"
        values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 0"
        result="abb_r"
      />,
      <feColorMatrix
        key="abb-ga"
        in={currentIn}
        type="matrix"
        values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
        result="abb_ga"
      />,
      <feOffset key="abb-boff" in={currentIn} dx={spec.aberrationPx} dy={0} result="abb_b_off" />,
      <feColorMatrix
        key="abb-b"
        in="abb_b_off"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 0 0"
        result="abb_b"
      />,
      <feComposite
        key="abb-rg"
        in="abb_r"
        in2="abb_ga"
        operator="arithmetic"
        k1={0}
        k2={1}
        k3={1}
        k4={0}
        result="abb_rg"
      />,
      <feComposite
        key="abb-out"
        in="abb_rg"
        in2="abb_b"
        operator="arithmetic"
        k1={0}
        k2={1}
        k3={1}
        k4={0}
        result="abb_out"
      />
    );
    currentIn = 'abb_out';
  }

  if (spec.colorMatrixValues) {
    nodes.push(
      <feColorMatrix
        key="cmat"
        in={currentIn}
        type="matrix"
        values={spec.colorMatrixValues}
        result="cmat_out"
      />
    );
    currentIn = 'cmat_out';
  }

  if (spec.toneTableValues) {
    nodes.push(
      <feComponentTransfer key="tone" in={currentIn} result="tone_out">
        <feFuncR type="table" tableValues={spec.toneTableValues} />
        <feFuncG type="table" tableValues={spec.toneTableValues} />
        <feFuncB type="table" tableValues={spec.toneTableValues} />
      </feComponentTransfer>
    );
    currentIn = 'tone_out';
  }

  if (spec.denoiseMix > 0.001) {
    nodes.push(
      <feGaussianBlur
        key="den-blur"
        in={currentIn}
        stdDeviation={spec.denoiseSigma}
        edgeMode="duplicate"
        result="den_blur"
      />,
      <feComposite
        key="den-mix"
        in={currentIn}
        in2="den_blur"
        operator="arithmetic"
        k1={0}
        k2={Number((1 - spec.denoiseMix).toFixed(4))}
        k3={spec.denoiseMix}
        k4={0}
        result="den_out"
      />
    );
    currentIn = 'den_out';
  }

  if (Math.abs(spec.clarityAmount) > 0.001) {
    nodes.push(
      <feGaussianBlur
        key="clar-blur"
        in={currentIn}
        stdDeviation={spec.clarityRadius}
        edgeMode="duplicate"
        result="clar_blur"
      />,
      <feComposite
        key="clar-mix"
        in={currentIn}
        in2="clar_blur"
        operator="arithmetic"
        k1={0}
        k2={Number((1 + spec.clarityAmount).toFixed(4))}
        k3={Number((-spec.clarityAmount).toFixed(4))}
        k4={0}
        result="clar_out"
      />
    );
    currentIn = 'clar_out';
  }

  if (spec.sharpnessKernel) {
    nodes.push(
      <feConvolveMatrix
        key="sharp"
        in={currentIn}
        order="3"
        kernelMatrix={spec.sharpnessKernel}
        preserveAlpha="true"
        edgeMode="duplicate"
        result="sharp_out"
      />
    );
    currentIn = 'sharp_out';
  }

  if (spec.blurSigma > 0.05) {
    nodes.push(
      <feGaussianBlur
        key="blur"
        in={currentIn}
        stdDeviation={spec.blurSigma}
        edgeMode="duplicate"
        result="blur_out"
      />
    );
  }

  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter
          id={filterId}
          x="-4%"
          y="-4%"
          width="108%"
          height="108%"
          colorInterpolationFilters="sRGB"
        >
          {nodes}
        </filter>
      </defs>
    </svg>
  );
};

interface VideoFrameOverlaysProps {
  spec: PreviewFilterSpec;
}

export const VideoFrameOverlays: React.FC<VideoFrameOverlaysProps> = ({ spec }) => {
  if (!spec.vignetteCss && spec.grainOpacity <= 0.002) return null;

  return (
    <>
      {spec.vignetteCss && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: spec.vignetteCss,
            pointerEvents: 'none',
          }}
        />
      )}
      {spec.grainOpacity > 0.002 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: GRAIN_DATA_URI,
            backgroundRepeat: 'repeat',
            backgroundSize: '128px 128px',
            mixBlendMode: 'overlay',
            opacity: spec.grainOpacity,
            pointerEvents: 'none',
          }}
        />
      )}
    </>
  );
};
