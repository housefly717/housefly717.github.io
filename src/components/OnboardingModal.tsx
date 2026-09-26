import React, { useState, useEffect } from 'react';
import { Scale, Edit3, Activity, Sparkles, ChevronRight, ChevronLeft, Check } from 'lucide-react';

const ONBOARDING_KEY = 'caloriq_onboarding_completed';

export const OnboardingModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setIsOpen(true);
    }
  }, []);

  // #59 4-card swipeable intro for brand-new users, skippable
  const slides = [
    {
      icon: <Scale className="w-8 h-8 text-teal-400" />,
      title: "Clear Daily Calorie Math",
      desc: "Your target adjusts dynamically with exercise. Track remaining calories, carbs, fat, protein, and hydration in one quiet view."
    },
    {
      icon: <Edit3 className="w-8 h-8 text-teal-400" />,
      title: "Plain-English & AI Logging",
      desc: "Type '80g tofu' or '2 eggs', speak your meal by voice, or snap a photo of your plate or fridge for instant macro breakdowns."
    },
    {
      icon: <Activity className="w-8 h-8 text-teal-400" />,
      title: "Fitness, Habits & Trends",
      desc: "Log workouts with rest timers, track personal records, check in on sleep and mood, and review 30-day and 12-month reports."
    },
    {
      icon: <Sparkles className="w-8 h-8 text-teal-400" />,
      title: "Consistency Over Perfection",
      desc: "Swipe left to delete with 5-second undo, use your monthly streak freeze when life happens, and sync seamlessly across devices."
    }
  ];

  const handleFinish = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsOpen(false);
  };

  const handleTouchStart = (clientX: number) => {
    setTouchStartX(clientX);
  };

  const handleTouchEnd = (clientX: number) => {
    if (touchStartX === null) return;
    const diff = clientX - touchStartX;
    if (diff < -40 && currentSlide < slides.length - 1) {
      setCurrentSlide(c => c + 1);
    } else if (diff > 40 && currentSlide > 0) {
      setCurrentSlide(c => c - 1);
    }
    setTouchStartX(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onTouchStart={(e) => handleTouchStart(e.touches[0].clientX)}
        onTouchEnd={(e) => handleTouchEnd(e.changedTouches[0].clientX)}
        onMouseDown={(e) => handleTouchStart(e.clientX)}
        onMouseUp={(e) => handleTouchEnd(e.clientX)}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden flex flex-col items-center text-center select-none"
      >
        {/* Progress indicator (4 cards) */}
        <div className="flex gap-1.5 mb-6">
          {slides.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setCurrentSlide(idx)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentSlide ? 'w-6 bg-teal-500' : 'w-2 bg-zinc-700'
              }`}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>

        {/* Icon card */}
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center mb-5">
          {slides[currentSlide].icon}
        </div>

        <span className="text-[10px] font-mono uppercase tracking-widest text-teal-400 mb-1">
          Card {currentSlide + 1} of {slides.length} · Swipe to browse
        </span>

        <h3 className="text-lg font-semibold text-zinc-100 mb-2.5">
          {slides[currentSlide].title}
        </h3>
        <p className="text-xs text-zinc-400 leading-relaxed min-h-[4rem] mb-6">
          {slides[currentSlide].desc}
        </p>

        {/* Actions */}
        <div className="w-full flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {currentSlide > 0 && (
              <button
                type="button"
                onClick={() => setCurrentSlide(c => c - 1)}
                className="px-3 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleFinish}
              className="px-3 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Skip
            </button>
          </div>

          {currentSlide < slides.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentSlide(c => c + 1)}
              className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition-colors shadow-lg shadow-teal-500/20"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
            >
              Get Started
              <Check className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
