import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';

export const LegalFooter: React.FC = () => {
  return (
    <footer className="mt-12 mb-20 px-6 py-6 border-t border-zinc-800/80 text-center text-xs text-zinc-300 space-y-2.5 max-w-lg mx-auto">
      <div className="flex items-center justify-center gap-1.5 text-zinc-300">
        <ShieldCheck className="w-3.5 h-3.5 text-teal-500/80" />
        <span className="font-medium tracking-wide">Self-guided nutrition & activity tracking tools</span>
      </div>
      <p className="leading-relaxed">
        Caloriq provides weight-management tracking tools and is not a medical provider. Speak to your doctor before changing how you eat or train.
      </p>
      <p className="text-zinc-300 leading-relaxed">
        If you&apos;re under 18, use Caloriq with a parent or guardian. Designed for tracking toward fat loss and sustainable nutritional habits.
      </p>
    </footer>
  );
};
