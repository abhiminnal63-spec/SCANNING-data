import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, RefreshCw, Zap, ZapOff, CheckCircle2, AlertTriangle, Eye, Sparkles } from 'lucide-react';
import { defaultIdCardDetector } from '../services/idCardDetector';
import { DetectionResult, ScannerState } from '../types/idcard';

interface CameraScannerProps {
  onCaptureImage: (canvas: HTMLCanvasElement) => void;
  isProcessing: boolean;
  statusMessage?: string;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  onCaptureImage,
  isProcessing,
  statusMessage,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scannerState, setScannerState] = useState<ScannerState>('IDLE');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchActive, setTorchActive] = useState<boolean>(false);

  // Dynamic orientation: starts horizontal, switches smoothly when physical card is vertical
  const [cardOrientation, setCardOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [detectionInfo, setDetectionInfo] = useState<DetectionResult | null>(null);
  const [stableCountdown, setStableCountdown] = useState<number | null>(null);

  const isScanningRef = useRef(false);
  const stableCountRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * Initializes device camera stream
   */
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      setScannerState('IDLE');

      // Stop any existing tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setScannerState('CAMERA_READY');
          defaultIdCardDetector.reset();
        };
      }

      // Check flashlight support
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      setHasTorch(Boolean(capabilities?.torch));
    } catch (err: any) {
      console.error('[CameraScanner] Camera error:', err);
      let msg = 'Unable to access camera. Please check camera permissions in your browser.';
      if (err.name === 'NotAllowedError') {
        msg = 'Camera permission denied. Please allow camera access in browser settings.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No camera device found on this system.';
      }
      setCameraError(msg);
      setScannerState('ERROR');
    }
  }, [facingMode]);

  /**
   * Toggle front/rear camera
   */
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  /**
   * Toggle flashlight/torch
   */
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: !torchActive }],
      });
      setTorchActive(!torchActive);
    } catch (e) {
      console.warn('[CameraScanner] Flashlight error:', e);
    }
  };

  /**
   * Main real-time local CV frame loop
   * Runs local frame analysis at ~12-15 fps without ever calling Gemini API!
   */
  useEffect(() => {
    let lastProcessedTime = 0;
    const FRAME_INTERVAL = 80; // ms (~12 fps)

    const processFrame = (timestamp: number) => {
      if (
        !isProcessing &&
        videoRef.current &&
        videoRef.current.readyState >= 2 &&
        timestamp - lastProcessedTime > FRAME_INTERVAL
      ) {
        lastProcessedTime = timestamp;

        const video = videoRef.current;
        const canvas = hiddenCanvasRef.current;

        if (canvas) {
          const vw = video.videoWidth;
          const vh = video.videoHeight;

          if (vw > 0 && vh > 0) {
            canvas.width = vw;
            canvas.height = vh;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (ctx) {
              ctx.drawImage(video, 0, 0, vw, vh);

              // Run local ID Card Candidate Detector
              const result = defaultIdCardDetector.detect(canvas);
              setDetectionInfo(result);

              // Update dynamic orientation (horizontal vs vertical)
              if (result.orientation !== cardOrientation) {
                setCardOrientation(result.orientation);
              }

              // Evaluate states: SEARCHING -> CARD_CANDIDATE -> CARD_STABLE
              if (result.isStable && result.quality.isAdequate) {
                setScannerState('CARD_STABLE');
                stableCountRef.current++;

                // Trigger auto-capture after card is stable for 8 consecutive checks (~600ms)
                if (stableCountRef.current >= 6 && !isScanningRef.current) {
                  isScanningRef.current = true;
                  setScannerState('PROCESSING');
                  captureCurrentFrame();
                }
              } else if (result.detected) {
                setScannerState('CARD_CANDIDATE');
                stableCountRef.current = Math.max(0, stableCountRef.current - 1);
              } else {
                setScannerState('SEARCHING');
                stableCountRef.current = 0;
              }
            }
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isProcessing, cardOrientation]);

  /**
   * Captures the full-resolution frame from the video stream and hands off to pipeline
   */
  const captureCurrentFrame = useCallback(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth || 1920;
    captureCanvas.height = video.videoHeight || 1080;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    onCaptureImage(captureCanvas);
  }, [onCaptureImage]);

  // Start camera on mount & restart on facingMode toggle
  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  // Reset lock when processing completes
  useEffect(() => {
    if (!isProcessing) {
      isScanningRef.current = false;
      stableCountRef.current = 0;
      defaultIdCardDetector.reset();
    }
  }, [isProcessing]);

  return (
    <div className="relative w-full max-w-3xl mx-auto flex flex-col items-center">
      {/* Video Viewport Container */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="w-full h-full object-cover"
        />

        {/* Hidden Canvas for Local CV Frame Analysis */}
        <canvas ref={hiddenCanvasRef} className="hidden" />

        {/* Camera Permission / Device Error Banner */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
            <div className="w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Camera Unavailable</h3>
            <p className="text-sm text-slate-300 max-w-md mb-6">{cameraError}</p>
            <button
              onClick={() => startCamera()}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition shadow-lg flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry Camera</span>
            </button>
          </div>
        )}

        {/* STABLE SCANNER FRAME (NOT wobbling raw bounding box!) */}
        {/* Requirement 7: The visible scanner frame must NOT be the raw bounding box. Smoothly switches horizontal/vertical */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
            {/* Viewfinder Cutout Mask Overlay */}
            <div
              className={`relative transition-all duration-300 ease-out flex items-center justify-center ${
                cardOrientation === 'horizontal'
                  ? 'w-[88%] sm:w-[80%] max-w-[540px] aspect-[1.586/1]'
                  : 'h-[85%] sm:h-[80%] max-h-[520px] aspect-[1/1.586]'
              }`}
            >
              {/* Corner guide brackets */}
              <div
                className={`absolute inset-0 rounded-2xl border-2 transition-colors duration-300 ${
                  isProcessing
                    ? 'border-indigo-400 shadow-[0_0_25px_rgba(99,102,241,0.5)]'
                    : scannerState === 'CARD_STABLE'
                    ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]'
                    : scannerState === 'CARD_CANDIDATE'
                    ? 'border-amber-400'
                    : 'border-white/40'
                }`}
              >
                {/* 4 Corner Markers */}
                <span className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-lg" />
                <span className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-lg" />
                <span className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-lg" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-lg" />

                {/* Subtle animated scanning laser line during processing */}
                {isProcessing && (
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse shadow-[0_0_12px_#38bdf8] top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Orientation Tag Indicator */}
              <div className="absolute -top-7 right-2 text-[10px] font-semibold uppercase tracking-wider text-slate-300 bg-slate-900/80 px-2.5 py-0.5 rounded-full border border-slate-700 backdrop-blur-sm">
                {cardOrientation === 'horizontal' ? 'Landscape Card' : 'Portrait Card'}
              </div>
            </div>
          </div>
        )}

        {/* Top Floating Controls */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-auto z-20">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {isProcessing ? (
              <div className="flex items-center gap-2 bg-indigo-900/90 text-indigo-200 border border-indigo-500/40 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md shadow-lg animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Scanning ID card...</span>
              </div>
            ) : scannerState === 'CARD_STABLE' ? (
              <div className="flex items-center gap-2 bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>ID card detected</span>
              </div>
            ) : scannerState === 'CARD_CANDIDATE' ? (
              <div className="flex items-center gap-2 bg-amber-950/90 text-amber-200 border border-amber-500/40 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md shadow-lg">
                <Eye className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Hold steady...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-slate-900/80 text-slate-400 border border-slate-700/60 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>No ID card detected</span>
              </div>
            )}
          </div>

          {/* Quick Camera Action Buttons */}
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                onClick={toggleTorch}
                title="Toggle Flashlight"
                className={`p-2.5 rounded-xl backdrop-blur-md border transition ${
                  torchActive
                    ? 'bg-amber-500/30 border-amber-400/50 text-amber-300'
                    : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {torchActive ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={toggleFacingMode}
              title="Switch Camera"
              className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-700 text-slate-300 hover:text-white backdrop-blur-md transition hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Real-time Guidance Message */}
        {detectionInfo && !isProcessing && (
          <div className="absolute bottom-4 left-4 right-4 flex justify-center pointer-events-none z-20">
            <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-xl text-xs sm:text-sm text-slate-200 shadow-xl max-w-sm text-center">
              {detectionInfo.quality.message}
            </div>
          </div>
        )}
      </div>

      {/* Manual Trigger & Helper Banner */}
      <div className="w-full mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
        <div className="text-xs text-slate-400 text-center sm:text-left">
          Align the ID card inside the frame. The scanner automatically detects orientation and scans when steady.
        </div>

        <button
          onClick={captureCurrentFrame}
          disabled={isProcessing}
          className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Analyzing Card...</span>
            </>
          ) : (
            <>
              <Camera className="w-4 h-4" />
              <span>Capture & Scan Now</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
