import { BoundingBox, NormalizedPhotoBoundingBox, Point } from '../types/idcard';

/**
 * Standard card dimensions in pixels for high-quality Gemini analysis
 */
const CARD_WIDTH_H = 1000;
const CARD_HEIGHT_H = 630;
const CARD_WIDTH_V = 630;
const CARD_HEIGHT_V = 1000;

/**
 * Crops, perspective-corrects, and enhances an ID card candidate from an image or canvas.
 */
export async function cropAndEnhanceCard(
  source: HTMLCanvasElement | HTMLImageElement,
  boundingBox?: BoundingBox,
  corners?: Point[],
  orientation: 'horizontal' | 'vertical' = 'horizontal'
): Promise<{
  enhancedCanvas: HTMLCanvasElement;
  enhancedDataUrl: string;
  cleanBase64: string;
  mimeType: string;
}> {
  const isHorizontal = orientation === 'horizontal';
  const destWidth = isHorizontal ? CARD_WIDTH_H : CARD_WIDTH_V;
  const destHeight = isHorizontal ? CARD_HEIGHT_H : CARD_HEIGHT_V;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = destWidth;
  destCanvas.height = destHeight;
  const destCtx = destCanvas.getContext('2d', { willReadFrequently: true });

  if (!destCtx) {
    throw new Error('Unable to create 2D canvas context for card processing.');
  }

  // Get source dimensions
  const srcWidth = source instanceof HTMLImageElement ? source.naturalWidth || source.width : source.width;
  const srcHeight = source instanceof HTMLImageElement ? source.naturalHeight || source.height : source.height;

  // If boundingBox is provided, use it; otherwise use full source image
  const box = boundingBox || {
    x: 0,
    y: 0,
    width: srcWidth,
    height: srcHeight,
  };

  // Add small 2% padding around the bounding box if possible to avoid cutting edges
  const padX = Math.round(box.width * 0.02);
  const padY = Math.round(box.height * 0.02);

  const sx = Math.max(0, box.x - padX);
  const sy = Math.max(0, box.y - padY);
  const sw = Math.min(srcWidth - sx, box.width + padX * 2);
  const sh = Math.min(srcHeight - sy, box.height + padY * 2);

  // If we have 4 distinct non-axis-aligned corners with perspective tilt,
  // we can perform projective warp. Otherwise, perform high-quality bicubic rectangular crop.
  if (corners && corners.length === 4 && hasPerspectiveTilt(corners, box)) {
    applyPerspectiveWarp(source, destCtx, corners, destWidth, destHeight);
  } else {
    // High-quality canvas draw
    destCtx.imageSmoothingEnabled = true;
    destCtx.imageSmoothingQuality = 'high';
    destCtx.drawImage(source, sx, sy, sw, sh, 0, 0, destWidth, destHeight);
  }

  // Apply optical enhancement: Contrast normalization and subtle text sharpening
  enhanceCardImageInPlace(destCtx, destWidth, destHeight);

  const mimeType = 'image/jpeg';
  const enhancedDataUrl = destCanvas.toDataURL(mimeType, 0.92);
  const cleanBase64 = enhancedDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

  return {
    enhancedCanvas: destCanvas,
    enhancedDataUrl,
    cleanBase64,
    mimeType,
  };
}

/**
 * Checks if 4 corners have meaningful perspective tilt relative to axis-aligned box
 */
function hasPerspectiveTilt(corners: Point[], box: BoundingBox): boolean {
  if (corners.length < 4) return false;
  const dxTop = Math.abs(corners[1].y - corners[0].y);
  const dyLeft = Math.abs(corners[3].x - corners[0].x);
  const threshold = Math.max(8, box.height * 0.05);
  return dxTop > threshold || dyLeft > threshold;
}

/**
 * Applies a 4-point projective warp mapping source corners to destination rectangle.
 */
function applyPerspectiveWarp(
  source: HTMLCanvasElement | HTMLImageElement,
  destCtx: CanvasRenderingContext2D,
  corners: Point[],
  destWidth: number,
  destHeight: number
): void {
  // Triangle-mesh affine decomposition or homography approximation
  // Top-left: corners[0], Top-right: corners[1], Bottom-right: corners[2], Bottom-left: corners[3]
  destCtx.save();
  destCtx.imageSmoothingEnabled = true;
  destCtx.imageSmoothingQuality = 'high';

  // Draw two triangles (top-left & bottom-right)
  const p0 = corners[0];
  const p1 = corners[1];
  const p2 = corners[2];
  const p3 = corners[3];

  renderWarpTriangle(destCtx, source, [p0, p1, p3], [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: 0, y: destHeight },
  ]);

  renderWarpTriangle(destCtx, source, [p1, p2, p3], [
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ]);

  destCtx.restore();
}

/**
 * Warps a single triangular patch using 2D canvas affine transform
 */
function renderWarpTriangle(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement | HTMLImageElement,
  srcTri: Point[],
  destTri: Point[]
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(destTri[0].x, destTri[0].y);
  ctx.lineTo(destTri[1].x, destTri[1].y);
  ctx.lineTo(destTri[2].x, destTri[2].y);
  ctx.closePath();
  ctx.clip();

  // Compute affine transform matrix mapping srcTri -> destTri
  const x0 = srcTri[0].x, y0 = srcTri[0].y;
  const x1 = srcTri[1].x, y1 = srcTri[1].y;
  const x2 = srcTri[2].x, y2 = srcTri[2].y;

  const u0 = destTri[0].x, v0 = destTri[0].y;
  const u1 = destTri[1].x, v1 = destTri[1].y;
  const u2 = destTri[2].x, v2 = destTri[2].y;

  const denom = x0 * (y1 - y2) - y0 * (x1 - x2) + (x1 * y2 - x2 * y1);
  if (Math.abs(denom) > 1e-6) {
    const a = (u0 * (y1 - y2) - y0 * (u1 - u2) + (u1 * y2 - u2 * y1)) / denom;
    const b = (v0 * (y1 - y2) - y0 * (v1 - v2) + (v1 * y2 - v2 * y1)) / denom;
    const c = (x0 * (u1 - u2) - u0 * (x1 - x2) + (x1 * u2 - x2 * u1)) / denom;
    const d = (x0 * (v1 - v2) - v0 * (x1 - x2) + (x1 * v2 - x2 * v1)) / denom;
    const e = (x0 * (y1 * u2 - y2 * u1) - y0 * (x1 * u2 - x2 * u1) + u0 * (x1 * y2 - x2 * y1)) / denom;
    const f = (x0 * (y1 * v2 - y2 * v1) - y0 * (x1 * v2 - x2 * v1) + v0 * (x1 * y2 - x2 * y1)) / denom;

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0);
  } else {
    ctx.drawImage(image, 0, 0, destTri[1].x, destTri[2].y);
  }
  ctx.restore();
}

/**
 * Enhances the card image:
 * 1. Contrast stretch (removes hazy background glare)
 * 2. Gentle unsharp masking for crisp text edges
 */
function enhanceCardImageInPlace(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const total = width * height;

  // 1. Compute min/max luminance for auto-levels (ignoring top/bottom 1% outliers)
  const lums = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    lums[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }

  // Histogram calculation
  const hist = new Uint32Array(256);
  for (let i = 0; i < total; i++) hist[lums[i]]++;

  let p1 = 0;
  let count1 = 0;
  const lowCutoff = total * 0.015;
  for (let i = 0; i < 256; i++) {
    count1 += hist[i];
    if (count1 >= lowCutoff) {
      p1 = i;
      break;
    }
  }

  let p99 = 255;
  let count2 = 0;
  const highCutoff = total * 0.015;
  for (let i = 255; i >= 0; i--) {
    count2 += hist[i];
    if (count2 >= highCutoff) {
      p99 = i;
      break;
    }
  }

  const range = Math.max(30, p99 - p1);

  // Apply auto-contrast stretch
  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    // Stretch RGB channels while keeping color balance
    data[idx] = Math.min(255, Math.max(0, ((data[idx] - p1) * 255) / range));
    data[idx + 1] = Math.min(255, Math.max(0, ((data[idx + 1] - p1) * 255) / range));
    data[idx + 2] = Math.min(255, Math.max(0, ((data[idx + 2] - p1) * 255) / range));
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Extracts and crops the printed photograph on the ID card.
 * Uses normalized coordinates [ymin, xmin, ymax, xmax] relative to card dimensions.
 */
export function extractPrintedPhotoCrop(
  cardSource: HTMLCanvasElement | HTMLImageElement,
  box: NormalizedPhotoBoundingBox
): string | null {
  if (!box || typeof box.ymin !== 'number') return null;

  const srcW = cardSource instanceof HTMLImageElement ? cardSource.naturalWidth || cardSource.width : cardSource.width;
  const srcH = cardSource instanceof HTMLImageElement ? cardSource.naturalHeight || cardSource.height : cardSource.height;

  let ymin = box.ymin;
  let xmin = box.xmin;
  let ymax = box.ymax;
  let xmax = box.xmax;

  // Convert pixel coordinates to normalized 0..1 if > 1.0
  if (ymin > 1.0 || xmin > 1.0 || ymax > 1.0 || xmax > 1.0) {
    ymin = ymin / srcH;
    xmin = xmin / srcW;
    ymax = ymax / srcH;
    xmax = xmax / srcW;
  }

  // Sanity check coordinates
  ymin = Math.max(0, Math.min(0.9, ymin));
  xmin = Math.max(0, Math.min(0.9, xmin));
  ymax = Math.max(ymin + 0.05, Math.min(1.0, ymax));
  xmax = Math.max(xmin + 0.05, Math.min(1.0, xmax));

  // Add 3% margin to ensure full face & hair are preserved
  const marginX = (xmax - xmin) * 0.04;
  const marginY = (ymax - ymin) * 0.04;

  const cropX = Math.max(0, (xmin - marginX) * srcW);
  const cropY = Math.max(0, (ymin - marginY) * srcH);
  const cropW = Math.min(srcW - cropX, (xmax - xmin + marginX * 2) * srcW);
  const cropH = Math.min(srcH - cropY, (ymax - ymin + marginY * 2) * srcH);

  if (cropW < 20 || cropH < 20) return null;

  const photoCanvas = document.createElement('canvas');
  // Scale to standard avatar size (e.g. 300x380)
  photoCanvas.width = 320;
  photoCanvas.height = Math.round(320 * (cropH / cropW));
  const ctx = photoCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cardSource, cropX, cropY, cropW, cropH, 0, 0, photoCanvas.width, photoCanvas.height);

  return photoCanvas.toDataURL('image/jpeg', 0.94);
}
