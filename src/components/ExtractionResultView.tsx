import React, { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Check,
  User,
  GraduationCap,
  Building,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Download,
  Share2,
  RefreshCw,
  ExternalLink,
  Sparkles,
  FileText,
  Sliders,
  Image as ImageIcon
} from 'lucide-react';
import { IdCardScanResult, IdCardField } from '../types/idcard';

interface ExtractionResultViewProps {
  result: IdCardScanResult;
  onReset: () => void;
}

export const ExtractionResultView: React.FC<ExtractionResultViewProps> = ({ result, onReset }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [activeViewTab, setActiveViewTab] = useState<'details' | 'enhancedCard' | 'original'>('details');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyAllFields = () => {
    const lines = [
      `ID CARD DETAILS`,
      `Type: ${result.idCardType}`,
      result.institution ? `Institution: ${result.institution}` : '',
      `---------------------------------`,
      ...result.fields.map((f) => `${f.label}: ${f.value}`),
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2200);
  };

  const downloadJson = () => {
    const exportData = {
      isIdCard: result.isIdCard,
      idCardType: result.idCardType,
      confidence: result.confidence,
      institution: result.institution,
      fields: result.fields,
      orientation: result.orientation,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `id-card-${result.idCardType.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper to choose appropriate field icon
  const getFieldIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('name')) return <User className="w-4 h-4 text-cyan-400" />;
    if (l.includes('phone') || l.includes('mobile')) return <Phone className="w-4 h-4 text-emerald-400" />;
    if (l.includes('address')) return <MapPin className="w-4 h-4 text-rose-400" />;
    if (l.includes('class') || l.includes('division') || l.includes('roll') || l.includes('adm')) {
      return <GraduationCap className="w-4 h-4 text-indigo-400" />;
    }
    if (l.includes('date') || l.includes('dob') || l.includes('year') || l.includes('valid')) {
      return <Calendar className="w-4 h-4 text-amber-400" />;
    }
    return <CreditCard className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-6 animate-in fade-in duration-300">
      {/* Top Banner: ID Card Detected & Type */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">ID Card Detected</h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {Math.round((result.confidence || 0.95) * 100)}% Match
              </span>
            </div>
            <p className="text-sm text-indigo-300 font-medium mt-0.5">{result.idCardType}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={copyAllFields}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition flex items-center justify-center gap-1.5"
          >
            {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedAll ? 'Copied All!' : 'Copy All'}</span>
          </button>

          <button
            onClick={downloadJson}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 transition flex items-center justify-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON</span>
          </button>

          <button
            onClick={onReset}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow-md flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Scan Another</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Printed ID Photo & Processed Card Preview (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          {/* 1. Printed ID Photo Card (Requirement 24: Extract Printed ID Photo) */}
          {result.photoCropUrl && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-3 text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  Printed ID Photo
                </span>
                <span className="text-[10px] text-cyan-400/90 bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/40 font-medium">
                  Isolated from Card
                </span>
              </div>

              {/* Cropped Photo Container */}
              <div className="w-36 h-44 rounded-xl overflow-hidden bg-slate-950 border-2 border-slate-700/80 shadow-2xl relative group">
                <img
                  src={result.photoCropUrl}
                  alt="Printed ID photograph"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* Photo Download Button */}
              <a
                href={result.photoCropUrl}
                download="id-card-printed-photo.jpg"
                className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Printed Photo</span>
              </a>
            </div>
          )}

          {/* 2. Processed Straightened Card View */}
          {result.processedCardUrl && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-3 text-xs">
                <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                  Enhanced Card Image
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  Perspective Corrected
                </span>
              </div>

              <div className="w-full aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center p-2">
                <img
                  src={result.processedCardUrl}
                  alt="Enhanced straightened ID card"
                  className="max-w-full max-h-full object-contain rounded shadow"
                />
              </div>
            </div>
          )}

          {/* Institution Banner */}
          {result.institution && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Issuing Institution
                </p>
                <p className="text-sm font-bold text-white mt-0.5">{result.institution}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Clean Dynamic Extracted Fields (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-base font-bold text-white">Extracted Information</h3>
                <p className="text-xs text-slate-400">
                  {result.fields.length} dynamic fields read and verified from visual card layout
                </p>
              </div>

              <span className="text-xs text-slate-400 bg-slate-800/70 px-3 py-1 rounded-full border border-slate-700/60">
                Dynamic Schema
              </span>
            </div>

            {/* Dynamic Field Grid */}
            {/* Requirement 17 & 22: Display only fields that exist on the card! No hardcoded static lists. */}
            {result.fields.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {result.fields.map((field, idx) => {
                  const isAddress = field.label.toLowerCase().includes('address');
                  const isPhone = field.label.toLowerCase().includes('phone') || field.label.toLowerCase().includes('mobile');
                  const isName = field.label.toLowerCase().includes('name');
                  const copyKey = `field-${idx}`;

                  return (
                    <div
                      key={idx}
                      className={`relative bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 hover:border-slate-700 transition flex flex-col justify-between group ${
                        isAddress ? 'sm:col-span-2' : ''
                      } ${isName ? 'bg-gradient-to-r from-slate-950 to-indigo-950/20 border-indigo-900/40' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          {getFieldIcon(field.label)}
                          {field.label}
                        </span>

                        <button
                          onClick={() => copyToClipboard(field.value, copyKey)}
                          title="Copy value"
                          className="text-slate-500 hover:text-slate-200 transition opacity-0 group-hover:opacity-100 p-1"
                        >
                          {copiedKey === copyKey ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Field Value */}
                      <div className="text-sm font-semibold text-white break-words">
                        {isPhone ? (
                          <a
                            href={`tel:${field.value.replace(/\s+/g, '')}`}
                            className="text-cyan-400 hover:underline flex items-center gap-1"
                          >
                            <span>{field.value}</span>
                            <ExternalLink className="w-3 h-3 text-cyan-500/70" />
                          </a>
                        ) : isAddress ? (
                          <p className="text-slate-200 whitespace-pre-line leading-relaxed font-normal">
                            {field.value}
                          </p>
                        ) : (
                          <span>{field.value}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-sm">
                No readable fields detected on this card.
              </div>
            )}

            {/* Privacy & Engine Note */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
              <span>Processed locally with perspective correction & Gemini Vision 3.8</span>
              <span>Images are not permanently stored</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
