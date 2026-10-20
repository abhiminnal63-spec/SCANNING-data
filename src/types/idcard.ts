export interface IdCardField {
  label: string;
  value: string;
  category?: 'personal' | 'academic' | 'employment' | 'contact' | 'identification' | 'other';
  confidence?: number;
}

export interface NormalizedPhotoBoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface ImageQualityReport {
  isAdequate: boolean;
  blurScore: number;
  isBlurry: boolean;
  brightness: number;
  isTooDark: boolean;
  isTooBright: boolean;
  glareScore: number;
  hasGlare: boolean;
  cardAreaRatio: number;
  isTooSmall: boolean;
  message: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionResult {
  detected: boolean;
  confidence: number;
  boundingBox: BoundingBox;
  corners: Point[];
  orientation: 'horizontal' | 'vertical';
  aspectRatio: number;
  isStable: boolean;
  quality: ImageQualityReport;
  featureScore?: number;
}

export interface IdCardScanResult {
  isIdCard: boolean;
  idCardType: string;
  confidence: number;
  institution: string | null;
  fields: IdCardField[];
  photoBoundingBox?: NormalizedPhotoBoundingBox | null;
  photoCropUrl?: string | null;
  processedCardUrl?: string | null;
  originalImageUrl?: string | null;
  orientation: 'horizontal' | 'vertical';
  reason?: string;
  processingTimeMs?: number;
  qualityReport?: ImageQualityReport;
}

export type ScannerState =
  | 'IDLE'
  | 'CAMERA_READY'
  | 'SEARCHING'
  | 'CARD_CANDIDATE'
  | 'CARD_STABLE'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'ERROR';
