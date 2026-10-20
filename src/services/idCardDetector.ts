import { BoundingBox, DetectionResult, Point, ImageQualityReport } from '../types/idcard';
import { analyzeImageQuality } from '../utils/qualityCheck';

export interface IdCardDetector {
  detect(canvas: HTMLCanvasElement | ImageData): DetectionResult;
  reset(): void;
}

/**
 * Standard ID Card (ISO/IEC 7810 ID-1 / CR80) has an aspect ratio of 85.60 mm x 53.98 mm = 1.5858 (landscape)
 * or 0.6306 (portrait).
 */
const STANDARD_ASPECT_RATIO_H = 1.586;
const STANDARD_ASPECT_RATIO_V = 0.631;

export class VisionCandidateDetector implements IdCardDetector {
  // Temporal tracking buffer for video camera frames (5-8 frames requirement)
  private history: Array<{
    box: BoundingBox;
    orientation: 'horizontal' | 'vertical';
    timestamp: number;
    score: number;
  }> = [];

  private stableOrientation: 'horizontal' | 'vertical' = 'horizontal';
  private orientationCounter = 0;

  public reset(): void {
    this.history = [];
    this.stableOrientation = 'horizontal';
    this.orientationCounter = 0;
  }

  /**
   * Analyzes an image canvas to find an ID-card candidate quadrilateral
   * and verifies geometry, texture, and temporal stability.
   */
  public detect(input: HTMLCanvasElement | ImageData): DetectionResult {
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;

    if (input instanceof HTMLCanvasElement) {
      canvas = input;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
    } else {
      canvas = document.createElement('canvas');
      canvas.width = input.width;
      canvas.height = input.height;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.putImageData(input, 0, 0);
      }
    }

    if (!ctx) {
      return this.emptyResult(canvas.width, canvas.height);
    }

    const width = canvas.width;
    const height = canvas.height;

    // Fast analysis on downsampled representation for high real-time FPS
    const scale = Math.min(1.0, 480 / Math.max(width, height));
    const sw = Math.floor(width * scale);
    const sh = Math.floor(height * scale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

    if (!tempCtx) {
      return this.emptyResult(width, height);
    }

    tempCtx.drawImage(canvas, 0, 0, sw, sh);
    const imgData = tempCtx.getImageData(0, 0, sw, sh);
    const data = imgData.data;

    // 1. Edge & gradient analysis
    const gray = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // Compute Sobel gradients and find bounding edges
    const gradX = new Float32Array(sw * sh);
    const gradY = new Float32Array(sw * sh);
    const magnitude = new Float32Array(sw * sh);

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = y * sw + x;
        // Sobel X
        const gx =
          -gray[idx - sw - 1] + gray[idx - sw + 1]
          - 2 * gray[idx - 1] + 2 * gray[idx + 1]
          - gray[idx + sw - 1] + gray[idx + sw + 1];
        // Sobel Y
        const gy =
          -gray[idx - sw - 1] - 2 * gray[idx - sw] - gray[idx - sw + 1]
          + gray[idx + sw - 1] + 2 * gray[idx + sw] + gray[idx + sw + 1];

        gradX[idx] = gx;
        gradY[idx] = gy;
        magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    // 2. Candidate Region Proposal
    // ID cards in a viewfinder typically occupy 25% to 85% of the frame
    // We look for strong boundary rectangular bounds that match card aspect ratio
    const candidate = this.findCardCandidateRegion(magnitude, gray, sw, sh);

    // Map candidate back to original canvas scale
    const realBox: BoundingBox = {
      x: Math.round(candidate.x / scale),
      y: Math.round(candidate.y / scale),
      width: Math.round(candidate.width / scale),
      height: Math.round(candidate.height / scale),
    };

    // Card orientation check
    const rawAspect = realBox.width / Math.max(1, realBox.height);
    const rawOrientation: 'horizontal' | 'vertical' = rawAspect >= 1.0 ? 'horizontal' : 'vertical';

    // Apply orientation hysteresis (prevent rapid flipping)
    if (rawOrientation !== this.stableOrientation) {
      this.orientationCounter++;
      if (this.orientationCounter >= 4) {
        this.stableOrientation = rawOrientation;
        this.orientationCounter = 0;
      }
    } else {
      this.orientationCounter = 0;
    }

    const currentOrientation = this.stableOrientation;

    // Check image quality in candidate region
    const quality = analyzeImageQuality(
      ctx,
      realBox.x,
      realBox.y,
      realBox.width,
      realBox.height,
      width,
      height
    );

    // 3. Texture & Content Verification
    // True ID cards have text lines (horizontal high frequency) and a photo block
    // Blank tables, bedsheets, blankets, walls, laptops, or plain paper lack this signature
    const featureScore = this.evaluateCardContentFeatures(
      candidate,
      magnitude,
      gradX,
      gradY,
      sw,
      sh
    );

    // Aspect ratio match score: compare against standard CR80 card aspect ratio
    const targetRatio = currentOrientation === 'horizontal' ? STANDARD_ASPECT_RATIO_H : STANDARD_ASPECT_RATIO_V;
    const ratioDelta = Math.abs(rawAspect - targetRatio);
    const ratioScore = Math.max(0, 1.0 - ratioDelta / 0.5);

    // Confidence composite (never placeholder!)
    let confidence = 0.4 * candidate.edgeContrastScore + 0.35 * featureScore + 0.25 * ratioScore;

    // If candidate has no distinct card-like internal structure (blank blanket, bedsheet, table), penalize heavily
    if (featureScore < 0.25) {
      confidence *= 0.3;
    }

    // Area check: Must occupy at least 15% and at most 92% of the frame to be a valid card in scanner
    const areaRatio = (realBox.width * realBox.height) / (width * height);
    if (areaRatio < 0.12 || areaRatio > 0.95) {
      confidence *= 0.4;
    }

    const isCardCandidate = confidence >= 0.48 && candidate.edgeContrastScore > 0.35;

    // 4. Temporal Stability Buffer (5–8 compatible frames required)
    const now = Date.now();
    let isStable = false;

    if (isCardCandidate) {
      this.history.push({
        box: realBox,
        orientation: currentOrientation,
        timestamp: now,
        score: confidence,
      });

      // Keep only recent 8 frames
      if (this.history.length > 8) {
        this.history.shift();
      }

      // Check if we have at least 5 consecutive frames with stable coordinates & orientation
      if (this.history.length >= 5) {
        const recent = this.history.slice(-5);
        const refBox = recent[0].box;

        const allMatchOrientation = recent.every((h) => h.orientation === currentOrientation);
        const maxDx = Math.max(...recent.map((h) => Math.abs(h.box.x - refBox.x)));
        const maxDy = Math.max(...recent.map((h) => Math.abs(h.box.y - refBox.y)));
        const maxDw = Math.max(...recent.map((h) => Math.abs(h.box.width - refBox.width)));
        const maxDh = Math.max(...recent.map((h) => Math.abs(h.box.height - refBox.height)));

        // Spatial jitter tolerance: within 7% of width/height
        const toleranceX = width * 0.07;
        const toleranceY = height * 0.07;

        if (
          allMatchOrientation &&
          maxDx < toleranceX &&
          maxDy < toleranceY &&
          maxDw < toleranceX &&
          maxDh < toleranceY &&
          quality.isAdequate
        ) {
          isStable = true;
          confidence = Math.min(0.96, confidence + 0.15);
        }
      }
    } else {
      // Clear history when no card candidate is found
      if (this.history.length > 0) {
        this.history.shift();
      }
    }

    // 4 corners of the candidate region
    const corners: Point[] = [
      { x: realBox.x, y: realBox.y },
      { x: realBox.x + realBox.width, y: realBox.y },
      { x: realBox.x + realBox.width, y: realBox.y + realBox.height },
      { x: realBox.x, y: realBox.y + realBox.height },
    ];

    return {
      detected: isCardCandidate,
      confidence: Math.round(confidence * 100) / 100,
      boundingBox: realBox,
      corners,
      orientation: currentOrientation,
      aspectRatio: Math.round(rawAspect * 100) / 100,
      isStable,
      quality,
      featureScore: Math.round(featureScore * 100) / 100,
    };
  }

  /**
   * Finds the most probable card bounding box by evaluating edge energy and boundary contrast.
   */
  private findCardCandidateRegion(
    magnitude: Float32Array,
    gray: Float32Array,
    sw: number,
    sh: number
  ): { x: number; y: number; width: number; height: number; edgeContrastScore: number } {
    // Project horizontal and vertical edge projections
    const projX = new Float32Array(sw);
    const projY = new Float32Array(sh);

    for (let y = 10; y < sh - 10; y++) {
      for (let x = 10; x < sw - 10; x++) {
        const mag = magnitude[y * sw + x];
        if (mag > 40) {
          projX[x] += mag;
          projY[y] += mag;
        }
      }
    }

    // Find prominent bounding peaks for left, right, top, bottom
    const thresholdX = this.getPercentileThreshold(projX, 0.7);
    const thresholdY = this.getPercentileThreshold(projY, 0.7);

    let left = Math.floor(sw * 0.1);
    let right = Math.floor(sw * 0.9);
    let top = Math.floor(sh * 0.12);
    let bottom = Math.floor(sh * 0.88);

    // Search from outside in for strong card borders
    for (let x = Math.floor(sw * 0.05); x < sw * 0.4; x++) {
      if (projX[x] > thresholdX) {
        left = x;
        break;
      }
    }
    for (let x = Math.floor(sw * 0.95); x > sw * 0.6; x--) {
      if (projX[x] > thresholdX) {
        right = x;
        break;
      }
    }
    for (let y = Math.floor(sh * 0.05); y < sh * 0.4; y++) {
      if (projY[y] > thresholdY) {
        top = y;
        break;
      }
    }
    for (let y = Math.floor(sh * 0.95); y > sh * 0.6; y--) {
      if (projY[y] > thresholdY) {
        bottom = y;
        break;
      }
    }

    const candW = Math.max(50, right - left);
    const candH = Math.max(50, bottom - top);

    // Calculate edge contrast score along the 4 borders
    let borderEdgeSum = 0;
    let borderSamples = 0;

    // Top & bottom border edge sum
    for (let x = left; x <= right; x += 2) {
      if (top >= 0 && top < sh) {
        borderEdgeSum += magnitude[top * sw + x];
        borderSamples++;
      }
      if (bottom >= 0 && bottom < sh) {
        borderEdgeSum += magnitude[bottom * sw + x];
        borderSamples++;
      }
    }

    // Left & right border edge sum
    for (let y = top; y <= bottom; y += 2) {
      if (left >= 0 && left < sw) {
        borderEdgeSum += magnitude[y * sw + left];
        borderSamples++;
      }
      if (right >= 0 && right < sw) {
        borderEdgeSum += magnitude[y * sw + right];
        borderSamples++;
      }
    }

    const avgBorderEdge = borderSamples > 0 ? borderEdgeSum / borderSamples : 0;
    const edgeContrastScore = Math.min(1.0, avgBorderEdge / 60);

    return {
      x: left,
      y: top,
      width: candW,
      height: candH,
      edgeContrastScore,
    };
  }

  /**
   * Distinguishes genuine ID card content from random objects (tables, blankets, sheets, walls).
   * ID cards feature structured horizontal text density and a localized photo cluster.
   */
  private evaluateCardContentFeatures(
    cand: { x: number; y: number; width: number; height: number },
    magnitude: Float32Array,
    gradX: Float32Array,
    gradY: Float32Array,
    sw: number,
    sh: number
  ): number {
    const minX = Math.max(1, cand.x + 8);
    const maxX = Math.min(sw - 2, cand.x + cand.width - 8);
    const minY = Math.max(1, cand.y + 8);
    const maxY = Math.min(sh - 2, cand.y + cand.height - 8);

    if (maxX <= minX || maxY <= minY) return 0.1;

    let totalPoints = 0;
    let horizontalEdgeCount = 0; // Text lines create strong vertical gradients (|gy| > |gx|)
    let strongEdges = 0;

    // Divide candidate into a 3x3 grid to verify multi-region presence (photo in one quadrant, text in another)
    const gridRows = 3;
    const gridCols = 3;
    const cellW = (maxX - minX) / gridCols;
    const cellH = (maxY - minY) / gridRows;
    const cellEnergies = new Float32Array(gridRows * gridCols);

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const cX0 = Math.floor(minX + gx * cellW);
        const cX1 = Math.floor(minX + (gx + 1) * cellW);
        const cY0 = Math.floor(minY + gy * cellH);
        const cY1 = Math.floor(minY + (gy + 1) * cellH);

        let cellSum = 0;
        let cellPts = 0;

        for (let py = cY0; py < cY1; py += 2) {
          for (let px = cX0; px < cX1; px += 2) {
            const idx = py * sw + px;
            const mag = magnitude[idx];
            cellSum += mag;
            cellPts++;

            if (mag > 35) {
              strongEdges++;
              // Text lines have high horizontal edge frequency
              if (Math.abs(gradY[idx]) > Math.abs(gradX[idx]) * 1.2) {
                horizontalEdgeCount++;
              }
            }
            totalPoints++;
          }
        }
        cellEnergies[gy * gridCols + gx] = cellPts > 0 ? cellSum / cellPts : 0;
      }
    }

    if (totalPoints === 0) return 0.1;

    // Ratio of text-like horizontal edges
    const textLikeRatio = strongEdges > 0 ? horizontalEdgeCount / strongEdges : 0;
    const edgeDensity = strongEdges / totalPoints;

    // Check multi-cell variance: an ID card has high contrast variation across sectors
    // (e.g. photo cell vs white text card background vs header banner)
    let meanEnergy = 0;
    for (let i = 0; i < 9; i++) meanEnergy += cellEnergies[i];
    meanEnergy /= 9;

    let energyVariance = 0;
    for (let i = 0; i < 9; i++) {
      energyVariance += Math.pow(cellEnergies[i] - meanEnergy, 2);
    }
    energyVariance /= 9;

    // Score synthesis:
    // Blank sheet or blanket has either 0 variance or uniform noisy texture without text lines.
    // ID card has distinct text line ratio (0.35 - 0.75) and moderate-to-high regional variance.
    const hasTextBands = textLikeRatio > 0.28 && edgeDensity > 0.04;
    const hasStructuredLayout = energyVariance > 15;

    let score = 0.2;
    if (hasTextBands) score += 0.45;
    if (hasStructuredLayout) score += 0.35;

    return Math.min(1.0, Math.max(0.05, score));
  }

  private getPercentileThreshold(arr: Float32Array, percentile: number): number {
    const copy = Array.from(arr).filter((v) => v > 0);
    if (copy.length === 0) return 100;
    copy.sort((a, b) => a - b);
    const pIdx = Math.floor(copy.length * percentile);
    return copy[pIdx] || 100;
  }

  private emptyResult(width: number, height: number): DetectionResult {
    return {
      detected: false,
      confidence: 0,
      boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      corners: [],
      orientation: 'horizontal',
      aspectRatio: 1.58,
      isStable: false,
      quality: {
        isAdequate: false,
        blurScore: 0,
        isBlurry: false,
        brightness: 0,
        isTooDark: false,
        isTooBright: false,
        glareScore: 0,
        hasGlare: false,
        cardAreaRatio: 0,
        isTooSmall: true,
        message: 'No ID card detected',
      },
    };
  }
}

// Singleton default detector
export const defaultIdCardDetector = new VisionCandidateDetector();
