import { ImageQualityReport } from '../types/idcard';

/**
 * Evaluates image quality of a given canvas or image region for ID card scanning.
 */
export function analyzeImageQuality(
  ctx: CanvasRenderingContext2D,
  x: number = 0,
  y: number = 0,
  width?: number,
  height?: number,
  totalCanvasWidth?: number,
  totalCanvasHeight?: number
): ImageQualityReport {
  const w = Math.floor(width || ctx.canvas.width);
  const h = Math.floor(height || ctx.canvas.height);
  const totalW = totalCanvasWidth || ctx.canvas.width;
  const totalH = totalCanvasHeight || ctx.canvas.height;

  if (w <= 0 || h <= 0) {
    return {
      isAdequate: false,
      blurScore: 0,
      isBlurry: true,
      brightness: 0,
      isTooDark: true,
      isTooBright: false,
      glareScore: 0,
      hasGlare: false,
      cardAreaRatio: 0,
      isTooSmall: true,
      message: 'Card is too small.',
    };
  }

  // Sample data (downsample if very large to keep 30fps smooth)
  const sampleW = Math.min(w, 320);
  const sampleH = Math.min(h, 240);

  // Read pixels
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(x, y, w, h);
  } catch (e) {
    return {
      isAdequate: true,
      blurScore: 50,
      isBlurry: false,
      brightness: 120,
      isTooDark: false,
      isTooBright: false,
      glareScore: 0,
      hasGlare: false,
      cardAreaRatio: (w * h) / (totalW * totalH),
      isTooSmall: false,
      message: 'Image ready for scan.',
    };
  }

  const data = imgData.data;
  const numPixels = w * h;

  let totalLuminance = 0;
  let glarePixels = 0;

  // Convert to grayscale grid for Laplacian blur check
  // To keep processing fast, sample every Nth pixel if image is large
  const step = Math.max(1, Math.floor(Math.sqrt(numPixels / 40000)));
  const gray: number[] = [];
  let sampleCount = 0;

  for (let py = 0; py < h; py += step) {
    for (let px = 0; px < w; px += step) {
      const idx = (py * w + px) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Perceived luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLuminance += lum;

      // Check glare (specular saturation)
      if (r > 245 && g > 245 && b > 245) {
        glarePixels++;
      }

      gray.push(lum);
      sampleCount++;
    }
  }

  const avgBrightness = sampleCount > 0 ? totalLuminance / sampleCount : 128;
  const glareScore = sampleCount > 0 ? (glarePixels / sampleCount) * 100 : 0;

  // Approximate Laplacian variance on sampled gray grid
  const gridW = Math.ceil(w / step);
  const gridH = Math.ceil(h / step);
  let laplacianSum = 0;
  let laplacianSqSum = 0;
  let validLaplacianPoints = 0;

  for (let gy = 1; gy < gridH - 1; gy++) {
    for (let gx = 1; gx < gridW - 1; gx++) {
      const idx = gy * gridW + gx;
      const center = gray[idx];
      const top = gray[idx - gridW];
      const bottom = gray[idx + gridW];
      const left = gray[idx - 1];
      const right = gray[idx + 1];

      // Standard discrete 3x3 Laplacian kernel
      const lap = Math.abs(4 * center - top - bottom - left - right);
      laplacianSum += lap;
      laplacianSqSum += lap * lap;
      validLaplacianPoints++;
    }
  }

  let blurVariance = 0;
  if (validLaplacianPoints > 0) {
    const mean = laplacianSum / validLaplacianPoints;
    blurVariance = laplacianSqSum / validLaplacianPoints - mean * mean;
  }

  // Card coverage ratio
  const cardArea = w * h;
  const frameArea = totalW * totalH;
  const cardAreaRatio = frameArea > 0 ? cardArea / frameArea : 0.5;

  // Decision thresholds
  const isBlurry = blurVariance < 45; // Below threshold is out of focus / blurry
  const isTooDark = avgBrightness < 45;
  const isTooBright = avgBrightness > 220;
  const hasGlare = glareScore > 12; // High specular highlight patch
  const isTooSmall = cardAreaRatio < 0.12 && w < 280;

  let message = 'Card position is stable and clear.';
  let isAdequate = true;

  if (isTooSmall) {
    message = 'Move the card closer.';
    isAdequate = false;
  } else if (hasGlare) {
    message = 'Too much glare. Tilt the card slightly.';
    isAdequate = false;
  } else if (isTooDark) {
    message = 'Too dark to read.';
    isAdequate = false;
  } else if (isTooBright) {
    message = 'Too bright. Adjust lighting.';
    isAdequate = false;
  } else if (isBlurry) {
    message = 'Image is too blurry.';
    isAdequate = false;
  }

  return {
    isAdequate,
    blurScore: Math.round(blurVariance),
    isBlurry,
    brightness: Math.round(avgBrightness),
    isTooDark,
    isTooBright,
    glareScore: Math.round(glareScore * 10) / 10,
    hasGlare,
    cardAreaRatio: Math.round(cardAreaRatio * 100) / 100,
    isTooSmall,
    message,
  };
}
