import React from 'react';
import { AlertTriangle, RefreshCw, WifiOff, KeyRound, ArrowLeft } from 'lucide-react';

interface ErrorViewProps {
  errorMessage: string;
  onRetry: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({ errorMessage, onRetry }) => {
  const isNetwork = errorMessage.includes('Network') || errorMessage.includes('connection');
  const isConfig = errorMessage.includes('configuration') || errorMessage.includes('API_KEY');

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center text-center animate-in fade-in duration-300">
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4 shadow-lg shadow-rose-500/10">
          {isNetwork ? <WifiOff className="w-7 h-7" /> : isConfig ? <KeyRound className="w-7 h-7" /> : <AlertTriangle className="w-7 h-7" />}
        </div>

        <h3 className="text-lg font-bold text-white mb-2">Scan Failed</h3>
        <p className="text-sm text-slate-300 mb-6 leading-relaxed">
          {errorMessage || 'Unable to process this image.'}
        </p>

        <button
          onClick={onRetry}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-semibold transition shadow-md flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Try Again</span>
        </button>
      </div>
    </div>
  );
};
