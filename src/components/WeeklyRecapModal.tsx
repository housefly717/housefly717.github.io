import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, CheckCircle2, Flame, Droplets, Target, X, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext.js';

const RECAP_KEY_PREFIX = 'caloriq_weekly_recap_seen_';

interface WeeklyRecapModalProps {
  forceOpen?: boolean;
  onCloseForce?: () => void;
}

export const WeeklyRecapModal: React.FC<WeeklyRecapModalProps> = ({ forceOpen = false, onCloseForce }) => {
  const { allDiaryItems, allExercises, macroTarget, waterGlasses } = useApp();
  const [isOpen, setIsOpen] = useState(false);

  // Check if today is Monday morning (or Monday any time if not seen yet this Monday)
  useEffect(() => {
    const now = new Date();
    const isMonday = now.getDay() === 1;
    const todayStr = now.toISOString().split('T')[0];
    const seenKey = `${RECAP_KEY_PREFIX}${todayStr}`;
    if (isMonday && !localStorage.getItem(seenKey)) {
      setIsOpen(true);
    }
  }, []);

  const summary = useMemo(() => {
    const today = new Date();
    const last7Dates: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      last7Dates.push(d.toISOString().split('T')[0]);
    }

    let daysLogged = 0;
    let totalKcal = 0;
    let totalProtein = 0;
    let daysOnTarget = 0;

    for (const dStr of last7Dates) {
      const items = allDiaryItems.filter(i => i.date === dStr);
      if (items.length > 0) {
        daysLogged++;
        const dayKcal = items.reduce((s, i) => s + i.calories, 0);
        const dayProt = items.reduce((s, i) => s + i.protein, 0);
        totalKcal += dayKcal;
        totalProtein += dayProt;
        if (Math.abs(dayKcal - macroTarget.calories) <= 200) {
          daysOnTarget++;
        }
      }
    }

    const workoutsLastWeek = allExercises.filter(e => last7Dates.includes(e.date));
    const totalBurned = workoutsLastWeek.reduce((s, e) => s + e.caloriesBurned, 0);
    const avgKcal = daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0;
    const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;

    let focusNextWeek = 'Log breakfast consistently to anchor your daily macro rhythm.';
    if (daysLogged >= 5 && avgProtein < macroTarget.proteinGrams * 0.85) {
      focusNextWeek = `Add ~20g more protein per day to reach your ${macroTarget.proteinGrams}g target.`;
    } else if (workoutsLastWeek.length < 2) {
      focusNextWeek = 'Schedule 3 short movement sessions this week to expand your calorie buffer.';
    } else if (daysOnTarget >= 5) {
      focusNextWeek = 'Maintain your current meal cadence and aim for 8 glasses of water daily.';
    }

    return {
      daysLogged,
      daysOnTarget,
      avgKcal,
      avgProtein,
      workoutsCount: workoutsLastWeek.length,
      totalBurned,
      focusNextWeek
    };
  }, [allDiaryItems, allExercises, macroTarget, waterGlasses]);

  const handleClose = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem(`${RECAP_KEY_PREFIX}${todayStr}`, 'true');
    setIsOpen(false);
    if (onCloseForce) onCloseForce();
  };

  if (!isOpen && !forceOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 block">
                Monday Briefing
              </span>
              <h3 className="text-sm font-bold text-zinc-100">Last Week&apos;s Recap</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 text-zinc-500 hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-zinc-500 uppercase block">Days Tracked</span>
            <span className="text-lg font-bold text-zinc-100 font-mono">{summary.daysLogged} / 7</span>
            <span className="text-[10px] text-teal-400 block mt-0.5">{summary.daysOnTarget} on target</span>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <span className="text-[10px] text-zinc-500 uppercase block">Avg Daily Intake</span>
            <span className="text-lg font-bold text-zinc-100 font-mono">{summary.avgKcal} kcal</span>
            <span className="text-[10px] text-red-400 block mt-0.5">{summary.avgProtein}g avg protein</span>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 col-span-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-teal-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-200 block">
                  {summary.workoutsCount} Workouts Completed
                </span>
                <span className="text-[10px] text-zinc-500">Total active burn logged</span>
              </div>
            </div>
            <span className="text-sm font-bold text-teal-400 font-mono">+{summary.totalBurned} kcal</span>
          </div>
        </div>

        <div className="bg-teal-950/40 border border-teal-800/50 rounded-xl p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-300">
            <Target className="w-3.5 h-3.5 text-teal-400" />
            <span>One Focus for This Week</span>
          </div>
          <p className="text-xs text-zinc-200 leading-relaxed">
            {summary.focusNextWeek}
          </p>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>Start the Week</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
