import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PrivacyPolicyPageProps {
  onBackToLanding: () => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onBackToLanding }) => {
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Privacy Policy — Caloriq';

    let metaDesc = document.querySelector('meta[name="description"]');
    const previousDesc = metaDesc ? metaDesc.getAttribute('content') : null;

    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      'content',
      "Caloriq Privacy Policy — what data we collect, how it's stored, and your rights."
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
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-4 py-2.5 text-xs font-medium text-zinc-200 transition-colors hover:border-teal-500/40 hover:text-teal-300"
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

        {/* Main Policy Card */}
        <article className="surface p-6 sm:p-10 space-y-10 max-w-[65ch] mx-auto">
          {/* Header & 1. Effective date */}
          <header className="border-b border-zinc-800/80 pb-6 space-y-2">
            <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-100">
              Privacy Policy
            </h2>
            <p className="text-sm text-teal-400 font-mono">
              Effective {todayFormatted}
            </p>
          </header>

          {/* 2. Who we are */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Who we are
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is a free calorie and macro tracking app. It is not a medical service. It does not diagnose, treat, or prescribe.
            </p>
          </section>

          {/* 3. What we collect */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              What we collect
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>Your email address (for sign-in)</li>
              <li>Your profile: name, age, gender, height, weight, activity level, goal</li>
              <li>Your diary: foods, calories, macros, water, exercise, weight entries</li>
              <li>Any messages you send through the chat feature</li>
              <li>Basic app usage: when you open the app and which screens you use</li>
            </ul>
          </section>

          {/* 4. What we do NOT collect */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              What we do NOT collect
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>We do not collect your location</li>
              <li>We do not collect your contacts</li>
              <li>We do not collect your photos unless you upload one</li>
              <li>We do not sell your data to anyone</li>
            </ul>
          </section>

          {/* 5. Where your data is stored */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Where your data is stored
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Your data is stored in a Google Firebase database. Firebase is a service provided by Google, and your data is stored on Google&apos;s servers. We use Google Firebase to store your data. Google&apos;s own privacy policy also applies.
            </p>
          </section>

          {/* 6. Who can see your data */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Who can see your data
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>Only you can see your diary, weight log, profile, and messages</li>
              <li>No Caloriq staff member reads your diary</li>
              <li>If you join the community or add friends, only what you choose to share is visible to them</li>
            </ul>
          </section>

          {/* 7. Third-party services we use */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Third-party services we use
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>Google Firebase — stores your account and data</li>
              <li>USDA FoodData Central — provides packaged food nutrition data (queries are sent without your account info)</li>
              <li>Google Gemini — powers the AI text logging and meal planning (queries are sent without your account info)</li>
            </ul>
          </section>

          {/* 8. Cookies and local storage */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Cookies and local storage
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq uses browser local storage to keep you signed in and to remember your theme. It does not use tracking cookies.
            </p>
          </section>

          {/* 9. Your rights */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Your rights
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-zinc-300 marker:text-teal-400">
              <li>You can export all your data as a JSON file from the Me tab at any time</li>
              <li>You can delete your account and all your data from the Me tab at any time</li>
              <li>Deletion is permanent</li>
              <li>If you&apos;re under 18, a parent or guardian should manage your account</li>
            </ul>
          </section>

          {/* 10. Children */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Children
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Caloriq is not designed for children under 13. If you&apos;re under 18, use Caloriq with a parent or guardian. We do not knowingly collect data from children under 13. If you believe a child under 13 has created an account, contact us and we will delete it.
            </p>
          </section>

          {/* 11. Changes to this policy */}
          <section className="space-y-3">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Changes to this policy
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              If this policy changes, the effective date at the top will update. Continued use of Caloriq after a change means you accept the new policy.
            </p>
          </section>

          {/* 12. Contact */}
          <section className="space-y-3 pt-2 border-t border-zinc-800/80">
            <h3 className="font-display text-xl font-semibold text-zinc-100">
              Contact
            </h3>
            <p className="text-sm leading-relaxed text-zinc-300">
              Questions about this policy? Email{' '}
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
        </footer>
      </div>
    </div>
  );
};
