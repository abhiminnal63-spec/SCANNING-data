import React, { useState } from 'react';
import {
  Download,
  Copy,
  Check,
  RefreshCw,
  ImageOff,
  User,
  ExternalLink,
} from 'lucide-react';
import { IdCardScanResult } from '../types/idcard';
import { extractPrintedPortrait } from '../utils/portraitExtractor';

interface ExtractionResultViewProps {
  result: IdCardScanResult;
  onReset: () => void;
  onUpdateResult?: (updated: IdCardScanResult) => void;
}

export const ExtractionResultView: React.FC<ExtractionResultViewProps> = ({
  result,
  onReset,
  onUpdateResult,
}) => {
  const [photoUrl, setPhotoUrl] = useState<string | null>(result.photoCropUrl || null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isRetryingPhoto, setIsRetryingPhoto] = useState(false);

  // Direct download for Save Photo
  const handleSavePhoto = () => {
    if (!photoUrl) return;
    const a = document.createElement('a');
    a.href = photoUrl;
    a.download = `id-photo-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const copyAllFields = () => {
    const lines = [
      result.idCardType,
      result.institution ? `Institution: ${result.institution}` : '',
      `--------------------`,
      ...result.fields.map((f) => `${f.label}: ${f.value}`),
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Retry portrait extraction from the card image if missing
  const handleRetryPortrait = async () => {
    if (!result.processedCardUrl) return;
    setIsRetryingPhoto(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = result.processedCardUrl;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const res = await extractPrintedPortrait(canvas, result.photoBoundingBox);
        if (res.success && res.photoUrl) {
          setPhotoUrl(res.photoUrl);
          if (onUpdateResult) {
            onUpdateResult({
              ...result,
              photoCropUrl: res.photoUrl,
            });
          }
        }
      }
    } catch (e) {
      console.warn('Retry photo extraction failed:', e);
    } finally {
      setIsRetryingPhoto(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-5 animate-in fade-in duration-200">
      {/* Title & Card Info */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-tight">
            {result.idCardType || 'ID Card'}
          </h2>
          {result.institution && (
            <p className="text-xs text-slate-400 mt-0.5">{result.institution}</p>
          )}
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyAllFields}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1.5"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? 'Copied' : 'Copy All'}</span>
          </button>

          <button
            onClick={onReset}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Another</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Printed Photo + Simple Labeled Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
        {/* Printed Portrait Section (Mobile-first, prominent) */}
        <div className="sm:col-span-5 flex flex-col items-center">
          <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center text-center">
            <span className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Printed ID Photo
            </span>

            {/* Photo Box */}
            {photoUrl ? (
              <div className="w-32 h-40 rounded-lg overflow-hidden bg-slate-950 border border-slate-700 shadow-lg flex items-center justify-center">
                <img
                  src={photoUrl}
                  alt="Extracted printed ID portrait"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              /* Photo not detected state */
              <div className="w-32 h-40 rounded-lg bg-slate-950 border border-dashed border-slate-700 flex flex-col items-center justify-center p-3 text-center">
                <ImageOff className="w-6 h-6 text-slate-500 mb-2" />
                <span className="text-[11px] text-slate-400 leading-tight">
                  ID photo not detected
                </span>
                <button
                  onClick={handleRetryPortrait}
                  disabled={isRetryingPhoto}
                  className="mt-2 text-[10px] text-indigo-400 hover:underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isRetryingPhoto ? 'animate-spin' : ''}`} />
                  <span>Retry</span>
                </button>
              </div>
            )}

            {/* Prominent Save Photo Action */}
            {photoUrl && (
              <button
                onClick={handleSavePhoto}
                className="mt-3 w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Photo</span>
              </button>
            )}
          </div>
        </div>

        {/* Extracted Fields as Simple Labeled Values (Clean & Uncluttered) */}
        <div className="sm:col-span-7 flex flex-col">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col gap-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Extracted Information
            </h3>

            {result.fields.length > 0 ? (
              <div className="flex flex-col gap-3 divide-y divide-slate-800/80">
                {result.fields.map((field, idx) => {
                  const isPhone = field.label.toLowerCase().includes('phone') || field.label.toLowerCase().includes('mobile');
                  const copyKey = `field-${idx}`;

                  return (
                    <div key={idx} className={`pt-2.5 first:pt-0 flex items-start justify-between group`}>
                      <div className="pr-2 flex-1">
                        <span className="text-xs text-slate-400 block font-normal">
                          {field.label}
                        </span>
                        {isPhone ? (
                          <a
                            href={`tel:${field.value.replace(/\s+/g, '')}`}
                            className="text-sm font-medium text-indigo-300 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <span>{field.value}</span>
                            <ExternalLink className="w-3 h-3 text-indigo-400/80" />
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-white mt-0.5 whitespace-pre-line break-words">
                            {field.value}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => copyToClipboard(field.value, copyKey)}
                        title="Copy field"
                        className="text-slate-500 hover:text-slate-200 transition opacity-0 group-hover:opacity-100 p-1 rounded"
                      >
                        {copiedKey === copyKey ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">
                No readable fields detected on this card.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
