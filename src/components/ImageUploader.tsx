import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, Sparkles, RefreshCw, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface ImageUploaderProps {
  onScanImage: (imageUrl: string) => void;
  isProcessing: boolean;
  statusMessage?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onScanImage,
  isProcessing,
  statusMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<{ name: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Requirement 10: When a file is selected, show "Image ready to scan" with preview and [ Scan Image ] button
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const processSelectedFile = (file: File) => {
    // Validate file type: JPG, JPEG, PNG, WEBP
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid image file (JPG, JPEG, PNG, or WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setSelectedImageUrl(dataUrl);
      setFileDetails({
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleTriggerScan = () => {
    if (selectedImageUrl) {
      onScanImage(selectedImageUrl);
    }
  };

  const handleClearSelection = () => {
    setSelectedImageUrl(null);
    setFileDetails(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
      />

      {!selectedImageUrl ? (
        /* Upload Area */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full aspect-[16/10] sm:aspect-[16/9] rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-8 text-center cursor-pointer group ${
            isDragging
              ? 'border-indigo-400 bg-indigo-950/20 shadow-2xl shadow-indigo-500/10'
              : 'border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 hover:border-slate-600'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8" />
          </div>

          <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
            Upload an ID Card Image
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-4">
            Drag and drop your ID card photo here, or browse files from your device.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition">
            <ImageIcon className="w-4 h-4 text-slate-400" />
            <span>Select JPG, PNG, or WEBP</span>
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Supports student IDs, employee badges, faculty IDs, membership cards, and official documents
          </p>
        </div>
      ) : (
        /* Image Ready to Scan Preview */
        <div className="w-full flex flex-col items-center gap-4">
          <div className="w-full relative aspect-[16/10] sm:aspect-[16/9] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center p-3">
            <img
              src={selectedImageUrl}
              alt="Selected ID card preview"
              className="max-w-full max-h-full object-contain rounded-lg shadow-md"
            />

            {/* Ready Badge */}
            <div className="absolute top-3 left-3 bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Image ready to scan</span>
            </div>

            {/* Change Image Button */}
            <button
              onClick={handleClearSelection}
              disabled={isProcessing}
              className="absolute top-3 right-3 bg-slate-900/80 hover:bg-slate-800 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-medium border border-slate-700 backdrop-blur-md transition disabled:opacity-50"
            >
              Change Photo
            </button>
          </div>

          {/* File details info bar */}
          {fileDetails && (
            <div className="w-full flex items-center justify-between text-xs text-slate-400 px-2">
              <span className="truncate max-w-[280px]">{fileDetails.name}</span>
              <span>{fileDetails.size}</span>
            </div>
          )}

          {/* Scan Action Button (Requirement 10: only scan after pressing [Scan Image]) */}
          <div className="w-full flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleClearSelection}
              disabled={isProcessing}
              className="px-5 py-3 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-sm font-medium transition disabled:opacity-50"
            >
              Choose Different File
            </button>

            <button
              onClick={handleTriggerScan}
              disabled={isProcessing}
              className="flex-1 py-3 px-6 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{statusMessage || 'Scanning ID Card...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-cyan-200" />
                  <span>Scan Image</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
