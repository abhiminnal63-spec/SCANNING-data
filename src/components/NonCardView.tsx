import React from 'react';
import { AlertCircle, RefreshCw, HelpCircle, ShieldAlert, ArrowLeft } from 'lucide-react';

interface NonCardViewProps {
  reason?: string;
  onTryAgain: () => void;
  originalImage?: string | null;
}

export const NonCardView: React.FC<NonCardViewProps> = ({ reason, onTryAgain, originalImage }) => {
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center animate-in fade-in duration-300">
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-lg shadow-amber-500/10">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">No ID Card Detected</h2>

        <p className="text-sm text-slate-300 max-w-md mb-6 leading-relaxed">
          {reason || 'The scanned image does not appear to contain a genuine ID card. Rectangular objects like notebooks, blankets, tables, or plain paper are filtered out.'}
        </p>

        {/* Thumbnail Preview of what was captured */}
        {originalImage && (
          <div className="w-48 aspect-[16/10] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 mb-6 flex items-center justify-center p-2">
            <img
              src={originalImage}
              alt="Scanned non-card preview"
              className="max-w-full max-h-full object-contain rounded opacity-75"
            />
          </div>
        )}

        {/* Helpful Tips Card */}
        <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 mb-6 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-2">
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>Scanning Guidelines:</span>
          </div>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Ensure the ID card is placed on a flat, contrasting surface.</li>
            <li>Keep the entire card (including all 4 corners) inside the viewfinder.</li>
            <li>Avoid strong direct light reflection, glare, or heavy shadows.</li>
            <li>Hold the camera steady until the frame locks onto the card.</li>
          </ul>
        </div>

        <button
          onClick={onTryAgain}
          className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Try Another Card</span>
        </button>
      </div>
    </div>
  );
};
