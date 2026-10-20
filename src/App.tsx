import React, { useState } from 'react';
import { Header } from './components/Header';
import { CameraScanner } from './components/CameraScanner';
import { ImageUploader } from './components/ImageUploader';
import { SampleCards } from './components/SampleCards';
import { ExtractionResultView } from './components/ExtractionResultView';
import { NonCardView } from './components/NonCardView';
import { ErrorView } from './components/ErrorView';
import { processIdCard } from './services/scannerPipeline';
import { IdCardScanResult } from './types/idcard';
import { ShieldCheck, Eye, Cpu, Lock } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'samples'>('camera');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Scanning ID card...');
  const [scanResult, setScanResult] = useState<IdCardScanResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Main scan coordinator for camera frames, uploaded files, and sample cards.
   * Requirement 11: Both Camera and Upload share the exact same processIdCard pipeline.
   */
  const handleProcessImage = async (input: HTMLCanvasElement | string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Initializing scanner pipeline...');

    try {
      const result = await processIdCard(input, {
        onProgress: (step) => setStatusMessage(step),
      });

      console.log('[ID Card Scanner] Scan pipeline completed successfully:', result);
      setScanResult(result);
    } catch (err: any) {
      console.error('[ID Card Scanner] Scan error:', err);
      const msg = err?.message || 'Unable to process this image.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Reset to scan another card
   */
  const handleReset = () => {
    setScanResult(null);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          handleReset();
          setActiveTab(tab);
        }}
        isProcessing={isProcessing}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col justify-center">
        {/* State 1: Active Error View */}
        {errorMessage ? (
          <ErrorView errorMessage={errorMessage} onRetry={handleReset} />
        ) : scanResult ? (
          /* State 2: Scan Completed */
          scanResult.isIdCard ? (
            /* 2A: Valid ID Card Extracted */
            <ExtractionResultView result={scanResult} onReset={handleReset} />
          ) : (
            /* 2B: Non-Card Object Detected (Blanket, table, paper, etc.) */
            <NonCardView
              reason={scanResult.reason}
              originalImage={scanResult.originalImageUrl}
              onTryAgain={handleReset}
            />
          )
        ) : (
          /* State 3: Input Scanner (Camera, Upload, or Samples) */
          <div className="flex flex-col items-center gap-6">
            {activeTab === 'camera' && (
              <CameraScanner
                onCaptureImage={handleProcessImage}
                isProcessing={isProcessing}
                statusMessage={statusMessage}
              />
            )}

            {activeTab === 'upload' && (
              <ImageUploader
                onScanImage={handleProcessImage}
                isProcessing={isProcessing}
                statusMessage={statusMessage}
              />
            )}

            {activeTab === 'samples' && (
              <SampleCards
                onSelectSample={handleProcessImage}
                isProcessing={isProcessing}
              />
            )}
          </div>
        )}
      </main>

      {/* Bottom Technical & Privacy Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-5 text-slate-500 text-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Gemini Vision 3.8
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
              Candidate CV Tracking
            </span>
            <span className="flex items-center gap-1.5 text-slate-400">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              Zero Permanent Storage
            </span>
          </div>

          <p className="text-[11px] text-slate-600">
            ID Card Scanner &bull; Dynamic document classification & printed photo extraction
          </p>
        </div>
      </footer>
    </div>
  );
}
