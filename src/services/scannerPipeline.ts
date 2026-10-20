import { IdCardScanResult, DetectionResult } from '../types/idcard';
import { defaultIdCardDetector } from './idCardDetector';
import { cropAndEnhanceCard, extractPrintedPhotoCrop } from '../utils/imageProcessing';
import { analyzeIdCard } from './geminiService';

export interface ProcessIdCardOptions {
  bypassCandidateFilter?: boolean;
  onProgress?: (step: string) => void;
}

/**
 * Unified ID Card Processing Pipeline
 * Used by both Live Camera capture and File Upload.
 */
export async function processIdCard(
  input: HTMLCanvasElement | HTMLImageElement | string,
  options: ProcessIdCardOptions = {}
): Promise<IdCardScanResult> {
  const { onProgress } = options;

  onProgress?.('Preparing image...');

  // 1. Resolve input into an HTMLCanvasElement
  let sourceCanvas: HTMLCanvasElement;
  let originalImageUrl: string;

  if (typeof input === 'string') {
    // Data URL or Image URL
    originalImageUrl = input;
    const img = await loadImageFromUrl(input);
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = img.naturalWidth || img.width;
    sourceCanvas.height = img.naturalHeight || img.height;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context.');
    ctx.drawImage(img, 0, 0);
  } else if (input instanceof HTMLImageElement) {
    originalImageUrl = input.src;
    sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = input.naturalWidth || input.width;
    sourceCanvas.height = input.naturalHeight || input.height;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create canvas context.');
    ctx.drawImage(input, 0, 0);
  } else {
    sourceCanvas = input;
    originalImageUrl = sourceCanvas.toDataURL('image/jpeg', 0.85);
  }

  onProgress?.('Detecting card boundary & orientation...');

  // 2. Candidate Detection & Geometry Analysis
  const detection: DetectionResult = defaultIdCardDetector.detect(sourceCanvas);

  // Determine orientation
  // If height > width: vertical. If width > height: horizontal.
  let orientation: 'horizontal' | 'vertical' = detection.orientation;
  const isCandidateDetected = detection.detected;

  // For high-resolution uploads, the image might already be a tight crop of the card
  const fullAspect = sourceCanvas.width / Math.max(1, sourceCanvas.height);
  if (fullAspect < 0.9) {
    orientation = 'vertical';
  } else if (fullAspect > 1.1) {
    orientation = 'horizontal';
  }

  onProgress?.('Correcting perspective & enhancing image...');

  // 3. Perspective Correction & Optical Enhancement
  // If detection found a tight card box, crop it; if upload is already tight, use full frame
  let cropBox = detection.boundingBox;
  if (!isCandidateDetected || (cropBox.width * cropBox.height) < (sourceCanvas.width * sourceCanvas.height * 0.15)) {
    cropBox = {
      x: 0,
      y: 0,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
    };
  }

  const { enhancedCanvas, enhancedDataUrl, cleanBase64, mimeType } = await cropAndEnhanceCard(
    sourceCanvas,
    cropBox,
    detection.corners.length === 4 ? detection.corners : undefined,
    orientation
  );

  onProgress?.('Inspecting with Gemini Vision...');

  // 4. Gemini Vision Analysis
  const scanResult = await analyzeIdCard(cleanBase64, mimeType, orientation, enhancedCanvas);

  // 5. Final Assembly
  scanResult.processedCardUrl = enhancedDataUrl;
  scanResult.originalImageUrl = originalImageUrl;
  scanResult.qualityReport = detection.quality;

  // If server didn't provide photo crop, try local canvas crop if photo bounding box exists
  if (!scanResult.photoCropUrl && scanResult.photoBoundingBox) {
    const localCrop = extractPrintedPhotoCrop(enhancedCanvas, scanResult.photoBoundingBox);
    if (localCrop) {
      scanResult.photoCropUrl = localCrop;
    }
  }

  return scanResult;
}

/**
 * Loads an image asynchronously from a URL or Data URL
 */
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load image from source URL.'));
    img.src = url;
  });
}
