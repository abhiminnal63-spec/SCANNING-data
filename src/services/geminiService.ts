import { IdCardScanResult, NormalizedPhotoBoundingBox } from '../types/idcard';
import { extractPrintedPhotoCrop } from '../utils/imageProcessing';

export interface ScanApiResponse {
  success: boolean;
  result?: IdCardScanResult;
  error?: string;
  errorType?: string;
  detail?: string;
}

/**
 * Sends the processed ID card image to the server's Gemini Vision endpoint.
 */
export async function analyzeIdCard(
  cleanBase64: string,
  mimeType: string = 'image/jpeg',
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  canvasReference?: HTMLCanvasElement
): Promise<IdCardScanResult> {
  // 1. Validation before sending
  if (!cleanBase64 || typeof cleanBase64 !== 'string' || cleanBase64.trim().length === 0) {
    throw new Error('Image data is empty or invalid.');
  }

  const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validMimes.includes(mimeType)) {
    mimeType = 'image/jpeg';
  }

  console.log(`[geminiService] Sending ID card image to backend (${cleanBase64.length} chars base64, orientation: ${orientation})`);

  let response: Response;
  try {
    response = await fetch('/api/scan-id', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: cleanBase64,
        mimeType,
        orientation,
      }),
    });
  } catch (networkErr: any) {
    console.error('[geminiService] Network failure:', networkErr);
    throw new Error('Network error. Check your connection.');
  }

  let data: ScanApiResponse;
  try {
    data = await response.json();
  } catch (jsonErr) {
    console.error('[geminiService] Failed to parse backend JSON response:', jsonErr);
    throw new Error('Unable to process this image.');
  }

  if (!response.ok || !data.success || !data.result) {
    console.error('[geminiService] Backend error details:', {
      status: response.status,
      errorType: data.errorType,
      error: data.error,
      detail: data.detail,
    });

    if (data.errorType === 'INVALID_ARGUMENT') {
      throw new Error('Unable to process this image.');
    } else if (data.errorType === 'AUTH_ERROR') {
      throw new Error('Scanner configuration error.');
    } else if (data.errorType === 'NETWORK_ERROR') {
      throw new Error('Network error. Check your connection.');
    }

    throw new Error(data.error || 'Unable to process this image.');
  }

  const result = data.result;

  // If server didn't crop the photo, but bounding box was detected and we have the canvas,
  // do client-side crop
  if (result.isIdCard && !result.photoCropUrl && result.photoBoundingBox && canvasReference) {
    try {
      result.photoCropUrl = extractPrintedPhotoCrop(canvasReference, result.photoBoundingBox);
    } catch (e) {
      console.warn('[geminiService] Client-side photo crop fallback failed:', e);
    }
  }

  return validateGeminiResponse(result);
}

/**
 * Validates and sanitizes the scan result
 */
export function validateGeminiResponse(result: IdCardScanResult): IdCardScanResult {
  if (!result) {
    throw new Error('Empty scan response received.');
  }

  // Ensure fields array is valid
  const fields = Array.isArray(result.fields) ? result.fields : [];

  // If card is marked as ID card, check if any readable fields were found
  if (result.isIdCard && fields.length === 0) {
    console.warn('[geminiService] Card detected but 0 fields extracted');
  }

  return {
    ...result,
    fields,
    confidence: typeof result.confidence === 'number' ? result.confidence : 0.9,
    idCardType: result.idCardType || (result.isIdCard ? 'ID Card' : 'Non-ID Object'),
  };
}
