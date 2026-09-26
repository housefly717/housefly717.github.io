import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

interface TermsOfServicePageProps {
  onBackToLanding: () => void;
  onOpenPrivacy: () => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({
  onBackToLanding,
  onOpenPrivacy
}) => {
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Terms of Service — Caloriq';

    let metaDesc = document.querySelector('meta[name="description"]');
    const previousDesc = metaDesc ? metaDesc.getAttribute('content') : null;

    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      'Caloriq Terms of Service — plain-English terms for using the Caloriq calorie and macro tracker.'
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });

    return () => {
      document.title = previousTitle;
      if (metaDesc && previousDesc !== null) {
        metaDesc.setAttribute('content', previousDesc);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-teal-500/20 selection:text-teal-300">
      <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        {/* Top Back Navigation */}
        <div className="mb-10 flex items-center justify-between border-b border-zinc-800/80 pb-6">
          <button
            type="button"
            onClick={onBackToLanding}
            aria-label="Back to landing page"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-teal-500/40 hover:text-teal-300"
          >
            <ArrowLeft className="size-4 text-teal-400" />
            <span>Back to landing page</span>
          </button>

          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full border border-teal-500/40 bg-teal-500/10 text-xs font-semibold text-teal-400">
              C
            </span>
            <span className="font-display text-base font-semibold tracking-tight text-zinc-100">
              Caloriq
            </span>
          </div>
        </div>

        {/* Main Terms Card */}
        <article className="surface p-6 sm:p-10 space-y-10 max-w-[65ch] mx-auto">
          <header className="border-b border-zinc-800/80 pb-6 space-y-2">
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-100">
              Terms of Service
            </h2>
            <p className="text-sm text-teal-400 font-mono">
              Effective {todayFormatted}
            </p>
          </header>

          {/* What Caloriq is and isn't */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              What Caloriq is and isn&apos;t
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is a free calorie, macro, water, and activity tracking tool. It helps you log what you eat and calculate daily targets from your own stats.
            </p>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is not a medical service and is not a medical provider. It does not diagnose, treat, cure, or prescribe anything. Always speak to your doctor before changing how you eat or train.
            </p>
          </section>

          {/* Age requirements */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Age requirements
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is not for children under 13. If you are under 18, you must use Caloriq with a parent or guardian.
            </p>
          </section>

          {/* Acceptable use */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Acceptable use
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              When using Caloriq, you agree to use the app fairly and respectfully:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>No scraping, automated bots, or bulk data extraction</li>
              <li>No abuse, harassment, or spam in community or chat features</li>
              <li>No illegal activity or attempts to break or overload the app</li>
            </ul>
          </section>

          {/* Where your data is stored */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Data storage
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Account data is stored in Google Firebase. By creating an account, you understand that your data is stored on Google Firebase servers as described in our Privacy Policy.
            </p>
          </section>

          {/* No warranty */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Provided as-is
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is provided as-is with no warranty of any kind. Nutrition numbers, barcode matches, and AI estimates are approximations and may contain errors. You use the app at your own risk.
            </p>
          </section>

          {/* Deleting your account */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Account deletion
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              You can export your data or permanently delete your account and all your data at any time from the Me tab.
            </p>
          </section>

          {/* Contact */}
          <section className="space-y-3 pt-2 border-t border-zinc-800/80">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Contact
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Questions about these terms? Email{' '}
              <a
                href="mailto:housefly@mail2world.com"
                className="text-teal-400 underline underline-offset-4 hover:text-teal-300"
              >
                housefly@mail2world.com
              </a>
              .
            </p>
          </section>
        </article>

        {/* Footer */}
        <footer className="mt-12 border-t border-zinc-800/80 pt-8 text-center text-xs text-zinc-400 space-y-2.5 max-w-xl mx-auto">
          <p className="leading-relaxed">
            Caloriq provides weight-management tracking tools and is not a medical provider. Speak to your doctor before changing how you eat or train.
          </p>
          <p className="leading-relaxed">
            If you&apos;re under 18, use Caloriq with a parent or guardian.
          </p>
          <p className="leading-relaxed">
            Caloriq uses local storage to keep you signed in and remember your theme. It does not use tracking cookies. See our{' '}
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                onOpenPrivacy();
              }}
              className="text-teal-400 underline underline-offset-4 hover:text-teal-300"
            >
              Privacy Policy
            </a>
            .
          </p>
          <div className="flex items-center justify-center gap-2 pt-1 text-zinc-300">
            <a
              href="/privacy"
              onClick={(e) => {
                e.preventDefault();
                onOpenPrivacy();
              }}
              className="text-teal-400 hover:text-teal-300 underline underline-offset-4"
            >
              Privacy
            </a>
            <span>·</span>
            <a
              href="/terms"
              onClick={(e) => e.preventDefault()}
              className="text-teal-400 hover:text-teal-300 underline underline-offset-4"
            >
              Terms
            </a>
            <span>·</span>
            <a
              href="mailto:housefly@mail2world.com"
              className="text-teal-400 hover:text-teal-300 underline underline-offset-4"
            >
              Contact
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
