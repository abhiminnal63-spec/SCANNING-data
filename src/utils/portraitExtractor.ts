import { NormalizedPhotoBoundingBox } from '../types/idcard';

export interface PortraitCropResult {
  success: boolean;
  photoUrl: string | null;
  boundingBox?: NormalizedPhotoBoundingBox | null;
  source: 'face_detector' | 'cv_color_box' | 'gemini_box' | 'none';
  reason?: string;
}

/**
 * Validates whether a bounding box represents a genuine printed ID photo
 * and NOT a whole-card crop or random element.
 */
export function isValidPortraitBoundingBox(box: NormalizedPhotoBoundingBox): boolean {
  if (!box) return false;
  const { ymin, xmin, ymax, xmax } = box;
  if (
    typeof ymin !== 'number' ||
    typeof xmin !== 'number' ||
    typeof ymax !== 'number' ||
    typeof xmax !== 'number'
  ) {
    return false;
  }

  const w = xmax - xmin;
  const h = ymax - ymin;
  const area = w * h;

  // Whole card or too large (> 45% of card): REJECT!
  if (w > 0.65 || h > 0.75 || area > 0.40) {
    return false;
  }

  // Too tiny (< 1.5% of card): REJECT!
  if (w < 0.08 || h < 0.10 || area < 0.015) {
    return false;
  }

  // Portrait aspect ratio check (w/h typically 0.55 to 1.3)
  const aspect = w / Math.max(0.01, h);
  if (aspect < 0.45 || aspect > 1.45) {
    return false;
  }

  return true;
}

/**
 * Normalizes coordinates that might be in pixels (> 1.0) into fractions (0..1)
 */
export function normalizeCoordinates(
  box: NormalizedPhotoBoundingBox,
  imgWidth: number,
  imgHeight: number
): NormalizedPhotoBoundingBox {
  let { ymin, xmin, ymax, xmax } = box;

  // Convert pixel coordinates to fractions
  if (ymin > 1.0 || xmin > 1.0 || ymax > 1.0 || xmax > 1.0) {
    ymin = ymin / imgHeight;
    xmin = xmin / imgWidth;
    ymax = ymax / imgHeight;
    xmax = xmax / imgWidth;
  }

  return {
    ymin: Math.max(0, Math.min(0.9, ymin)),
    xmin: Math.max(0, Math.min(0.9, xmin)),
    ymax: Math.max(ymin + 0.05, Math.min(1.0, ymax)),
    xmax: Math.max(xmin + 0.05, Math.min(1.0, xmax)),
  };
}

/**
 * Computer Vision: Locates the printed ID photo by analyzing chromatic contrast
 * and face/skin luminance on the straightened card canvas.
 */
export function detectPortraitByColorAndEdges(
  canvas: HTMLCanvasElement
): NormalizedPhotoBoundingBox | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = canvas.width;
  const h = canvas.height;
  if (w < 100 || h < 100) return null;

  // Sample grid to identify the photo rectangle
  // On ID cards, the photo is typically on the left (landscape) or top/center (portrait)
  const isLandscape = w >= h;

  // Candidate regions to test (xmin, ymin, width, height as fractions)
  const candidateRegions: Array<{ xmin: number; ymin: number; w: number; h: number }> = [];

  if (isLandscape) {
    // Left-side candidate (most common on student/employee IDs)
    candidateRegions.push({ xmin: 0.05, ymin: 0.18, w: 0.32, h: 0.62 });
    candidateRegions.push({ xmin: 0.15, ymin: 0.25, w: 0.28, h: 0.55 });
    // Right-side candidate
    candidateRegions.push({ xmin: 0.65, ymin: 0.18, w: 0.30, h: 0.62 });
  } else {
    // Portrait card candidates (upper half, centered or slightly left/right)
    candidateRegions.push({ xmin: 0.25, ymin: 0.15, w: 0.50, h: 0.42 });
    candidateRegions.push({ xmin: 0.20, ymin: 0.20, w: 0.60, h: 0.45 });
    candidateRegions.push({ xmin: 0.50, ymin: 0.20, w: 0.45, h: 0.40 });
  }

  let bestBox: NormalizedPhotoBoundingBox | null = null;
  let bestScore = -1;

  for (const cand of candidateRegions) {
    const rx = Math.floor(cand.xmin * w);
    const ry = Math.floor(cand.ymin * h);
    const rw = Math.floor(cand.w * w);
    const rh = Math.floor(cand.h * h);

    if (rw <= 0 || rh <= 0 || rx + rw > w || ry + rh > h) continue;

    const imgData = ctx.getImageData(rx, ry, rw, rh);
    const data = imgData.data;

    let skinCount = 0;
    let rSum = 0, gSum = 0, bSum = 0;
    const totalPixels = rw * rh;

    for (let i = 0; i < totalPixels; i += 4) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      rSum += r;
      gSum += g;
      bSum += b;

      // Human skin chromatic test: R > G > B and healthy skin chrominance
      if (r > 60 && g > 40 && b > 20 && r > g && g > b && (r - g) > 10 && (r - g) < 95) {
        skinCount++;
      }
    }

    const skinRatio = skinCount / (totalPixels / 4);
    if (skinRatio > 0.08 && skinRatio < 0.85) {
      const score = skinRatio;
      if (score > bestScore) {
        bestScore = score;
        bestBox = {
          ymin: cand.ymin,
          xmin: cand.xmin,
          ymax: cand.ymin + cand.h,
          xmax: cand.xmin + cand.w,
        };
      }
    }
  }

  return bestBox;
}

/**
 * Extracts and crops the printed portrait from a canvas
 */
export async function extractPrintedPortrait(
  cardCanvas: HTMLCanvasElement,
  geminiBox?: NormalizedPhotoBoundingBox | null
): Promise<PortraitCropResult> {
  const w = cardCanvas.width;
  const h = cardCanvas.height;

  let finalBox: NormalizedPhotoBoundingBox | null = null;
  let source: 'face_detector' | 'cv_color_box' | 'gemini_box' | 'none' = 'none';

  // 1. Try native browser FaceDetector API if supported (Chromium / Android Chrome)
  if (typeof window !== 'undefined' && 'FaceDetector' in window) {
    try {
      const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(cardCanvas);
      if (faces && faces.length > 0) {
        const fb = faces[0].boundingBox;
        // Expand face to include full hair, chin, and collar
        const padTop = fb.height * 0.45;
        const padBottom = fb.height * 0.55;
        const padSide = fb.width * 0.35;

        const px = Math.max(0, fb.x - padSide);
        const py = Math.max(0, fb.y - padTop);
        const pw = Math.min(w - px, fb.width + padSide * 2);
        const ph = Math.min(h - py, fb.height + padTop + padBottom);

        const candBox: NormalizedPhotoBoundingBox = {
          xmin: px / w,
          ymin: py / h,
          xmax: (px + pw) / w,
          ymax: (py + ph) / h,
        };

        if (isValidPortraitBoundingBox(candBox)) {
          finalBox = candBox;
          source = 'face_detector';
        }
      }
    } catch (e) {
      console.warn('[portraitExtractor] FaceDetector skipped:', e);
    }
  }

  // 2. If not detected by FaceDetector, evaluate Gemini vision box
  if (!finalBox && geminiBox) {
    const normalized = normalizeCoordinates(geminiBox, w, h);
    if (isValidPortraitBoundingBox(normalized)) {
      finalBox = normalized;
      source = 'gemini_box';
    } else {
      console.warn('[portraitExtractor] Gemini box rejected (failed validity/size checks):', geminiBox);
    }
  }

  // 3. Fallback: Computer Vision skin/contrast region search on the card
  if (!finalBox) {
    const cvBox = detectPortraitByColorAndEdges(cardCanvas);
    if (cvBox && isValidPortraitBoundingBox(cvBox)) {
      finalBox = cvBox;
      source = 'cv_color_box';
    }
  }

  // If no valid box found or failed validation: STRICT REJECTION!
  // Requirement: "Never show a placeholder, blank image, or whole-card crop as the portrait."
  // "If portrait extraction fails, show 'ID photo not detected' and allow retry."
  if (!finalBox) {
    return {
      success: false,
      photoUrl: null,
      boundingBox: null,
      source: 'none',
      reason: 'ID photo not detected on card surface',
    };
  }

  // Crop portrait from canvas with clean 3% margin
  const marginX = (finalBox.xmax - finalBox.xmin) * 0.04;
  const marginY = (finalBox.ymax - finalBox.ymin) * 0.04;

  const cropX = Math.max(0, Math.round((finalBox.xmin - marginX) * w));
  const cropY = Math.max(0, Math.round((finalBox.ymin - marginY) * h));
  const cropW = Math.min(w - cropX, Math.round((finalBox.xmax - finalBox.xmin + marginX * 2) * w));
  const cropH = Math.min(h - cropY, Math.round((finalBox.ymax - finalBox.ymin + marginY * 2) * h));

  if (cropW < 30 || cropH < 30) {
    return {
      success: false,
      photoUrl: null,
      boundingBox: null,
      source: 'none',
      reason: 'Crop dimensions too small',
    };
  }

  const outCanvas = document.createElement('canvas');
  // Target portrait dimensions with original resolution preserved
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    return { success: false, photoUrl: null, source: 'none' };
  }

  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(cardCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const photoUrl = outCanvas.toDataURL('image/jpeg', 0.94);

  return {
    success: true,
    photoUrl,
    boundingBox: finalBox,
    source,
  };
}
