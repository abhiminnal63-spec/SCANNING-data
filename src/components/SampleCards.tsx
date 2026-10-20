import React from 'react';
import { Sparkles, ArrowRight, Layers, ShieldCheck, GraduationCap, Briefcase } from 'lucide-react';

interface SampleCardsProps {
  onSelectSample: (sampleUrl: string) => void;
  isProcessing: boolean;
}

const SAMPLE_LIST = [
  {
    id: 'school-id',
    title: 'School Student ID Card',
    subtitle: 'Mar Thoma Higher Secondary School (Abhinav M)',
    category: 'School Student ID',
    icon: GraduationCap,
    url: '/samples/marthoma_school_id_1792287347348.jpg',
    description: 'Portrait card with printed student photo, admission number, roll no, phone, and complete home address.',
  },
  {
    id: 'college-id',
    title: 'University Student ID Card',
    subtitle: 'Engineering College / University Badge',
    category: 'College Student ID',
    icon: Layers,
    url: '/samples/sample_student_id_card_1792258333923.jpg',
    description: 'Landscape card with student photograph, register number, department, and validity.',
  },
  {
    id: 'faculty-id',
    title: 'Faculty / Staff ID Card',
    subtitle: 'Department of Higher Education',
    category: 'Faculty ID',
    icon: Briefcase,
    url: '/samples/sample_faculty_id_card_1792258334581.jpg',
    description: 'Official faculty identification with designation, employee ID, contact details, and institutional seal.',
  },
];

export const SampleCards: React.FC<SampleCardsProps> = ({ onSelectSample, isProcessing }) => {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
      <div className="text-center max-w-md mb-8">
        <h3 className="text-lg font-bold text-white mb-2">Test with Verified ID Cards</h3>
        <p className="text-xs sm:text-sm text-slate-400">
          Select any real-world sample to see candidate validation, dynamic field extraction, and printed photo isolation in action.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full">
        {SAMPLE_LIST.map((sample) => {
          const Icon = sample.icon;
          return (
            <div
              key={sample.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden hover:border-indigo-500/50 transition-all flex flex-col group shadow-xl"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden flex items-center justify-center p-3 border-b border-slate-800/80">
                <img
                  src={sample.url}
                  alt={sample.title}
                  className="max-w-full max-h-full object-contain rounded-lg group-hover:scale-105 transition-transform duration-300"
                />
                <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-900/90 text-cyan-400 border border-slate-700 backdrop-blur-md">
                  {sample.category}
                </span>
              </div>

              {/* Details */}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-indigo-400" />
                    <h4 className="font-semibold text-sm text-white">{sample.title}</h4>
                  </div>
                  <p className="text-xs text-indigo-300/80 font-medium mb-2">{sample.subtitle}</p>
                  <p className="text-[11px] text-slate-400 line-clamp-2">{sample.description}</p>
                </div>

                <button
                  onClick={() => onSelectSample(sample.url)}
                  disabled={isProcessing}
                  className="mt-4 w-full py-2.5 px-4 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl text-xs font-semibold border border-indigo-500/30 hover:border-indigo-600 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Scan This Card</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
