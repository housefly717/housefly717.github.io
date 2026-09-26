import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface LegalFooterProps {
  onOpenPrivacy?: () => void;
  onOpenTerms?: () => void;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({ onOpenPrivacy, onOpenTerms }) => {
  return (
    <footer className="mt-12 mb-20 px-6 py-6 border-t border-zinc-800/80 text-center text-xs text-zinc-300 space-y-2.5 max-w-lg mx-auto">
      <div className="flex items-center justify-center gap-1.5 text-zinc-300">
        <ShieldCheck className="w-3.5 h-3.5 text-teal-500/80" />
        <span className="font-medium tracking-wide">Self-guided nutrition &amp; activity tracking tools</span>
      </div>
      <p className="leading-relaxed">
        Caloriq provides weight-management tracking tools and is not a medical provider. Speak to your doctor before changing how you eat or train.
      </p>
      <p className="text-zinc-300 leading-relaxed">
        If you&apos;re under 18, use Caloriq with a parent or guardian.
      </p>
      <p className="text-zinc-400 leading-relaxed">
        Caloriq uses local storage to keep you signed in and remember your theme. It does not use tracking cookies. See our{' '}
        <a
          href="/privacy"
          onClick={(e) => {
            if (onOpenPrivacy) {
              e.preventDefault();
              onOpenPrivacy();
            }
          }}
          className="text-teal-400 hover:text-teal-300 underline underline-offset-4 transition-colors"
        >
          Privacy Policy
        </a>
        .
      </p>
      <div className="pt-1 flex items-center justify-center gap-2 text-zinc-400">
        <a
          href="/privacy"
          onClick={(e) => {
            if (onOpenPrivacy) {
              e.preventDefault();
              onOpenPrivacy();
            }
          }}
          className="text-teal-400 hover:text-teal-300 underline underline-offset-4 transition-colors"
        >
          Privacy
        </a>
        <span>·</span>
        <a
          href="/terms"
          onClick={(e) => {
            if (onOpenTerms) {
              e.preventDefault();
              onOpenTerms();
            }
          }}
          className="text-teal-400 hover:text-teal-300 underline underline-offset-4 transition-colors"
        >
          Terms
        </a>
        <span>·</span>
        <a
          href="mailto:housefly@mail2world.com"
          className="text-teal-400 hover:text-teal-300 underline underline-offset-4 transition-colors"
        >
          Contact
        </a>
      </div>
    </footer>
  );
};
