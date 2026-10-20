import React from 'react';
import { CreditCard, Camera, Upload, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'camera' | 'upload' | 'samples';
  setActiveTab: (tab: 'camera' | 'upload' | 'samples') => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, isProcessing }) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Clean, minimal app title */}
        <div className="flex items-center gap-2.5">
          <CreditCard className="w-5 h-5 text-indigo-400" />
          <span className="font-semibold text-base tracking-tight text-white">
            ID Scan Pro
          </span>
        </div>

        {/* Minimal Navigation */}
        <nav className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setActiveTab('camera')}
            disabled={isProcessing}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'camera'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            disabled={isProcessing}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'upload'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>

          <button
            onClick={() => setActiveTab('samples')}
            disabled={isProcessing}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'samples'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Samples</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
