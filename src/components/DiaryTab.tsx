import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Copy,
  Droplets,
  Flame,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  CalendarPlus,
  RotateCcw,
  Sparkles,
  Check,
  Moon,
  Activity,
  BookOpen,
  Zap,
  Mic,
  Camera,
  Package,
  ChefHat,
  Wand2,
  RefreshCw,
  Compass
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../services/api.js';
import { decipherExerciseText } from '../utils/localAiEngine.js';
import { formatWeight } from '../utils/nutritionMath.js';
import type { MealType, FoodItem } from '../types/index.js';

const TIPS_OF_THE_DAY = [
  'Logging meals before you eat keeps portion awareness effortless.',
  'Drinking a glass of water 15 minutes before meals supports steady hydration.',
  'Aiming for 25–35g of protein at breakfast helps keep afternoon cravings low.',
  'Weighing in at the same time each morning reduces normal daily water noise.',
  'Pre-logging dinner in the morning makes hitting your evening macro targets simpler.',
  'Whole fruits and vegetables add volume and fiber without high calorie density.',
  'Consistency across seven days matters far more than any single meal.'
];

const JOURNAL_PROMPTS = [
  "What made today easy or hard?",
  "Which meal gave you the best energy today?",
  "What is one small win you are proud of today?",
  "Did hunger or habit drive your snacking today?",
  "How did last night's sleep affect your food choices?",
  "What is one thing you can prep tonight to make tomorrow easier?",
  "How did your body feel during movement or rest today?"
];

interface DiaryTabProps {
  onNavigateToFitness: () => void;
}

export const DiaryTab: React.FC<DiaryTabProps> = ({ onNavigateToFitness }) => {
  const {
    activeDate,
    setActiveDate,
    diaryItems,
    allDiaryItems,
    waterGlasses,
    updateWaterGlasses,
    exercises,
    addExerciseItem,
    profile,
    macroTarget,
    todayHabit,
    saveTodayHabit,
    cravings,
    addCravingItem,
    deleteCravingItem,
    pantryItems,
    addPantryEntry,
    deletePantryEntry,
    addFoodItem,
    updateFoodItem,
    deleteFoodItem,
    logFoodAgainTomorrow,
    copyYesterdayMeals,
    openAddFood,
    isGuest,
    openGuestLock,
    weights
  } = useApp();

  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  // #13 Fix My Day AI suggestions state
  const [isFixingDay, setIsFixingDay] = useState(false);
  const [fixDayResult, setFixDayResult] = useState<{ summary: string; swaps: Array<{ originalFood: string; suggestedSwap: string; caloriesSaved: number; reason: string }> } | null>(null);
  // #14, #10, #11, #16 Pantry & AI Kitchen state
  const [newPantryName, setNewPantryName] = useState('');
  const [newPantryQty, setNewPantryQty] = useState('1 unit');
  const [isKitchenAiBusy, setIsKitchenAiBusy] = useState(false);
  const [kitchenMeals, setKitchenMeals] = useState<Array<{ name: string; description: string; calories: number; protein: number; carbs: number; fat: number }> | null>(null);
  // Swipe-left-to-delete state
  const [swipedItemId, setSwipedItemId] = useState<string | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  // Long-press "Log again tomorrow" state
  const [longPressedItemId, setLongPressedItemId] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  // Meal notes inline editor
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  // #40 One-question daily journal draft
  const [journalDraft, setJournalDraft] = useState<string>(todayHabit?.journalAnswer || '');
  const [journalSavedMsg, setJournalSavedMsg] = useState(false);

  useEffect(() => {
    setJournalDraft(todayHabit?.journalAnswer || '');
  }, [activeDate, todayHabit?.journalAnswer]);

  // #39 Craving log inputs & AI pattern
  const [cravingFood, setCravingFood] = useState('');
  const [cravingIntensity, setCravingIntensity] = useState(3);
  const [cravingTrigger, setCravingTrigger] = useState('');
  const [aiCravingPattern, setAiCravingPattern] = useState<string | null>(null);

  useEffect(() => {
    if (cravings.length < 5) {
      setAiCravingPattern(null);
      return;
    }
    const cacheKey = `caloriq_craving_pattern_${cravings.length}_${cravings[0]?.id || ''}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setAiCravingPattern(cached);
      return;
    }
    let cancelled = false;
    api
      .getCravingPattern(cravings)
      .then((res) => {
        if (!cancelled && res?.pattern) {
          setAiCravingPattern(res.pattern);
          localStorage.setItem(cacheKey, res.pattern);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cravings]);

  // Inline Log Exercise box state
  const [showExerciseBox, setShowExerciseBox] = useState(false);
  const [exerciseInput, setExerciseInput] = useState('');
  const [isSavingExercise, setIsSavingExercise] = useState(false);

  const decipheredExercise = useMemo(
    () => decipherExerciseText(exerciseInput, profile?.currentWeightKg || 70),
    [exerciseInput, profile?.currentWeightKg]
  );

  const handleSaveInlineExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciseInput.trim() || decipheredExercise.totalCaloriesBurned <= 0) return;
    setIsSavingExercise(true);
    try {
      await addExerciseItem({
        date: activeDate,
        activityName: decipheredExercise.summaryTitle,
        met: decipheredExercise.averageMet,
        minutes: Math.max(1, Math.round(decipheredExercise.totalMinutes)),
        caloriesBurned: decipheredExercise.totalCaloriesBurned,
        intensity: decipheredExercise.overallIntensity
      });
      setExerciseInput('');
      setShowExerciseBox(false);
      setCopyStatus(`Saved exercise (+${decipheredExercise.totalCaloriesBurned} kcal burned)`);
      setTimeout(() => setCopyStatus(null), 3000);
    } finally {
      setIsSavingExercise(false);
    }
  };

  const dailyPrompt = useMemo(() => {
    const daySeed = Number(activeDate.replace(/-/g, '')) || 0;
    return JOURNAL_PROMPTS[daySeed % JOURNAL_PROMPTS.length];
  }, [activeDate]);

  const dailyTip = useMemo(() => {
    const daySeed = Number(activeDate.replace(/-/g, '')) || 0;
    return TIPS_OF_THE_DAY[daySeed % TIPS_OF_THE_DAY.length];
  }, [activeDate]);

  const isMonday = useMemo(() => {
    const d = new Date(activeDate + 'T00:00:00');
    return d.getDay() === 1;
  }, [activeDate]);

  const mondayRecap = useMemo(() => {
    const d = new Date(activeDate + 'T00:00:00');
    const last7: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const p = new Date(d);
      p.setDate(p.getDate() - i);
      last7.push(p.toISOString().split('T')[0]);
    }
    let daysLogged = 0;
    let kcalSum = 0;
    let protSum = 0;
    for (const dt of last7) {
      const entries = allDiaryItems.filter(i => i.date === dt);
      if (entries.length > 0) {
        daysLogged++;
        kcalSum += entries.reduce((s, e) => s + e.calories, 0);
        protSum += entries.reduce((s, e) => s + e.protein, 0);
      }
    }
    const avgKcal = daysLogged > 0 ? Math.round(kcalSum / daysLogged) : 0;
    const avgProt = daysLogged > 0 ? Math.round(protSum / daysLogged) : 0;
    const weekWeights = weights
      .filter(w => last7.includes(w.date))
      .sort((a, b) => a.date.localeCompare(b.date));
    const weightChangeKg =
      weekWeights.length >= 2
        ? Math.round((weekWeights[weekWeights.length - 1].weightKg - weekWeights[0].weightKg) * 10) / 10
        : 0;
    const diffFromTarget = avgKcal - macroTarget.calories;
    const factLine =
      daysLogged === 0
        ? '0 days logged last week.'
        : `Logged ${daysLogged} of 7 days with an average daily difference of ${diffFromTarget > 0 ? `+${diffFromTarget}` : diffFromTarget} kcal vs target.`;
    return { daysLogged, avgKcal, avgProt, weightChangeKg, factLine };
  }, [activeDate, allDiaryItems, weights, macroTarget.calories]);

  const cravingPatternText = useMemo(() => {
    if (cravings.length === 0) {
      return 'Log a craving to see patterns over time.';
    }
    if (cravings.length < 5) {
      return 'Log a craving to see patterns.';
    }
    if (aiCravingPattern) {
      return aiCravingPattern;
    }
    return `Analyzing ${cravings.length} logged cravings...`;
  }, [cravings, aiCravingPattern]);

  // Compute daily numbers
  const hasStats = macroTarget.calories > 0;
  const totalEaten = diaryItems.reduce((sum, item) => sum + (item.calories || 0), 0);
  const totalBurned = exercises.reduce((sum, ex) => sum + (ex.caloriesBurned || 0), 0);
  const dailyTarget = hasStats ? macroTarget.calories + totalBurned : 0;
  const remaining = hasStats ? dailyTarget - totalEaten : 0;
  const isOverBudget = hasStats && remaining < 0;

  // Macros eaten
  const carbsEaten = Math.round(diaryItems.reduce((sum, i) => sum + (i.carbs || 0), 0) * 10) / 10;
  const fatEaten = Math.round(diaryItems.reduce((sum, i) => sum + (i.fat || 0), 0) * 10) / 10;
  const proteinEaten = Math.round(diaryItems.reduce((sum, i) => sum + (i.protein || 0), 0) * 10) / 10;

  // Macro progress percentages
  const carbsPercent = hasStats ? Math.min(100, Math.round((carbsEaten / (macroTarget.carbsGrams || 1)) * 100)) : 0;
  const fatPercent = hasStats ? Math.min(100, Math.round((fatEaten / (macroTarget.fatGrams || 1)) * 100)) : 0;
  const proteinPercent = hasStats ? Math.min(100, Math.round((proteinEaten / (macroTarget.proteinGrams || 1)) * 100)) : 0;

  // Ring calculation
  const ringProgress = hasStats ? Math.min(100, Math.max(0, Math.round((totalEaten / (dailyTarget || 1)) * 100))) : 0;
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (ringProgress / 100) * circumference;

  // Top 3 most-logged foods per meal slot (#7 Quick-log bar)
  const topFoodsByMeal = useMemo(() => {
    const result: Record<MealType, Array<{ name: string; calories: number; carbs: number; fat: number; protein: number; serving: string; count: number }>> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: []
    };
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    for (const mt of mealTypes) {
      const counts = new Map<string, { name: string; calories: number; carbs: number; fat: number; protein: number; serving: string; count: number }>();
      for (const item of allDiaryItems) {
        if (item.mealType !== mt) continue;
        const key = item.name.toLowerCase().trim();
        const existing = counts.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          counts.set(key, {
            name: item.name,
            calories: item.calories,
            carbs: item.carbs,
            fat: item.fat,
            protein: item.protein,
            serving: item.serving || '1 portion',
            count: 1
          });
        }
      }
      result[mt] = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    }
    return result;
  }, [allDiaryItems]);

  // Most common combination for each meal slot (#8 "Same as usual" button)
  const usualComboByMeal = useMemo(() => {
    const result: Record<MealType, Array<{ name: string; calories: number; carbs: number; fat: number; protein: number; serving: string }>> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: []
    };
    const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
    for (const mt of mealTypes) {
      const byDate = new Map<string, FoodItem[]>();
      for (const item of allDiaryItems) {
        if (item.mealType !== mt) continue;
        const list = byDate.get(item.date) || [];
        list.push(item);
        byDate.set(item.date, list);
      }
      const comboCounts = new Map<string, { count: number; items: FoodItem[] }>();
      for (const [, dayItems] of byDate.entries()) {
        if (dayItems.length === 0) continue;
        const signature = dayItems.map(i => i.name.toLowerCase().trim()).sort().join('||');
        const ex = comboCounts.get(signature);
        if (ex) {
          ex.count += 1;
        } else {
          comboCounts.set(signature, { count: 1, items: dayItems });
        }
      }
      const sorted = Array.from(comboCounts.values()).sort((a, b) => b.count - a.count);
      if (sorted.length > 0) {
        result[mt] = sorted[0].items.map(i => ({
          name: i.name,
          calories: i.calories,
          carbs: i.carbs,
          fat: i.fat,
          protein: i.protein,
          serving: i.serving || '1 portion'
        }));
      }
    }
    return result;
  }, [allDiaryItems]);

  // 7-day strip calculation
  const getSevenDays = () => {
    const curr = new Date(activeDate + 'T00:00:00');
    const days = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(curr);
      d.setDate(d.getDate() + i);
      const str = d.toISOString().split('T')[0];
      const isSelected = str === activeDate;
      const dayLetter = d.toLocaleDateString('en-US', { weekday: 'narrow' });
      const dayNum = d.getDate();
      days.push({ str, isSelected, dayLetter, dayNum });
    }
    return days;
  };

  const handleCopyYesterday = async (mealType?: MealType) => {
    if (isGuest) {
      openGuestLock();
      return;
    }
    try {
      const count = await copyYesterdayMeals(mealType);
      if (count > 0) {
        setCopyStatus(
          mealType
            ? `Copied ${count} ${mealType} item(s) from yesterday`
            : `Copied ${count} meals from yesterday`
        );
      } else {
        setCopyStatus(mealType ? `No ${mealType} logged yesterday` : 'No meals recorded yesterday');
      }
      setTimeout(() => setCopyStatus(null), 3000);
    } catch {
      setCopyStatus('Could not copy yesterday');
      setTimeout(() => setCopyStatus(null), 3000);
    }
  };

  const handleQuickLog = async (
    mealType: MealType,
    food: { name: string; calories: number; carbs: number; fat: number; protein: number; serving: string }
  ) => {
    await addFoodItem({
      date: activeDate,
      mealType,
      name: food.name,
      calories: food.calories,
      carbs: food.carbs,
      fat: food.fat,
      protein: food.protein,
      serving: food.serving,
      source: 'saved'
    });
    setCopyStatus(`Quick-logged ${food.name}`);
    setTimeout(() => setCopyStatus(null), 2500);
  };

  const handleSameAsUsual = async (mealType: MealType) => {
    const combo = usualComboByMeal[mealType];
    if (!combo || combo.length === 0) {
      setCopyStatus(`Log ${mealType} once first to set your usual`);
      setTimeout(() => setCopyStatus(null), 2500);
      return;
    }
    for (const f of combo) {
      await addFoodItem({
        date: activeDate,
        mealType,
        name: f.name,
        calories: f.calories,
        carbs: f.carbs,
        fat: f.fat,
        protein: f.protein,
        serving: f.serving,
        source: 'saved'
      });
    }
    setCopyStatus(`Logged usual ${mealType} (${combo.length} item${combo.length > 1 ? 's' : ''})`);
    setTimeout(() => setCopyStatus(null), 2500);
  };

  const handlePointerDownItem = (itemId: string, clientX: number) => {
    touchStartXRef.current = clientX;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      setLongPressedItemId(prev => (prev === itemId ? null : itemId));
    }, 500);
  };

  const handlePointerMoveItem = (itemId: string, clientX: number) => {
    if (touchStartXRef.current === null) return;
    const deltaX = clientX - touchStartXRef.current;
    if (Math.abs(deltaX) > 12 && longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (deltaX < -45) {
      setSwipedItemId(itemId);
    } else if (deltaX > 30 && swipedItemId === itemId) {
      setSwipedItemId(null);
    }
  };

  const handlePointerUpItem = () => {
    touchStartXRef.current = null;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleSaveNote = async (itemId: string) => {
    await updateFoodItem(itemId, { note: noteDraft.trim() || undefined });
    setEditingNoteId(null);
    setNoteDraft('');
  };

  const mealsList: Array<{ type: MealType; title: string; ratio: number }> = [
    { type: 'breakfast', title: 'Breakfast', ratio: 0.25 },
    { type: 'lunch', title: 'Lunch', ratio: 0.35 },
    { type: 'dinner', title: 'Dinner', ratio: 0.30 },
    { type: 'snack', title: 'Snacks', ratio: 0.10 }
  ];

  return (
    <div className="space-y-5 pb-8 max-w-md mx-auto">
      {/* #32 "Why" pin at the top of the Diary every day */}
      {profile.pinnedWhy && (
        <div className="bg-zinc-900/90 border border-teal-500/30 rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <Compass className="w-4 h-4 text-teal-400 shrink-0" />
          <p className="text-xs text-zinc-200 font-medium leading-relaxed">
            {profile.pinnedWhy}
          </p>
        </div>
      )}

      {/* Tip of the Day (Available to Guests & Accounts) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400 block">
            Tip of the Day
          </span>
          <p className="text-xs text-zinc-300 leading-relaxed mt-0.5">{dailyTip}</p>
        </div>
      </div>

      {/* #19 Weekly recap card on Mondays */}
      {isMonday && !isGuest && (
        <div className="bg-zinc-900/90 border border-teal-500/30 rounded-2xl p-4 shadow-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-teal-400">
              Monday Weekly Recap
            </span>
            <span className="text-[11px] font-mono text-zinc-400">
              {mondayRecap.daysLogged} / 7 days logged
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2">
              <span className="text-[10px] text-zinc-500 block">Avg Calories</span>
              <span className="text-xs font-bold font-mono text-zinc-100">{mondayRecap.avgKcal} kcal</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2">
              <span className="text-[10px] text-zinc-500 block">Avg Protein</span>
              <span className="text-xs font-bold font-mono text-zinc-100">{mondayRecap.avgProt}g</span>
            </div>
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2">
              <span className="text-[10px] text-zinc-500 block">Weight Change</span>
              <span className="text-xs font-bold font-mono text-teal-400">
                {mondayRecap.weightChangeKg > 0 ? '+' : ''}
                {formatWeight(mondayRecap.weightChangeKg, profile.unitSystem)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-300">{mondayRecap.factLine}</p>
        </div>
      )}
      {/* 7-Day Strip with day chevrons and fill bars */}
      <div className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl p-2.5">
        <div className="flex items-center justify-between gap-1">
          {getSevenDays().map((day) => (
            <button
              key={day.str}
              onClick={() => setActiveDate(day.str)}
              className={`flex-1 py-1.5 px-1 rounded-xl flex flex-col items-center gap-1 transition-all ${
                day.isSelected
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span className="text-[10px] font-medium uppercase">{day.dayLetter}</span>
              <span className={`text-xs font-semibold ${day.isSelected ? 'text-teal-300' : 'text-zinc-200'}`}>
                {day.dayNum}
              </span>
              <div className="w-4 h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    day.isSelected ? 'bg-teal-400' : 'bg-zinc-600'
                  }`}
                  style={{ width: day.isSelected ? `${Math.min(100, ringProgress)}%` : '40%' }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* TOP CALORIE RING CARD */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                strokeWidth="7"
                className="stroke-zinc-800 fill-none"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className={`fill-none transition-all duration-700 ease-out ${
                  isOverBudget ? 'stroke-rose-500' : 'stroke-teal-500'
                }`}
              />
            </svg>

            <div className="absolute flex flex-col items-center justify-center text-center px-3">
              <span
                className={`text-3xl font-extrabold tracking-tight font-mono ${
                  isOverBudget ? 'text-rose-400' : 'text-zinc-100'
                }`}
              >
                {hasStats ? Math.abs(remaining) : '—'}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {hasStats ? (isOverBudget ? 'kcal over' : 'kcal remaining') : 'Set up your profile'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 w-full pt-4 mt-2 border-t border-zinc-800/80 text-center">
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">Eaten</span>
              <span className="text-sm font-bold text-zinc-200 font-mono">{totalEaten}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">Exercise</span>
              <span className="text-sm font-bold text-teal-400 font-mono">+{totalBurned}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">Target</span>
              <span className="text-sm font-bold text-zinc-200 font-mono">{hasStats ? dailyTarget : '—'}</span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 block uppercase tracking-wider">Left</span>
              <span className={`text-sm font-bold font-mono ${isOverBudget ? 'text-rose-400' : 'text-teal-400'}`}>
                {hasStats ? remaining : '—'}
              </span>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-zinc-400 font-mono bg-zinc-950/80 px-3 py-1.5 rounded-xl border border-zinc-800/60 text-center w-full flex items-center justify-center gap-1.5">
            {isOverBudget ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            )}
            <span>
              {hasStats
                ? `Target (${macroTarget.calories} + ${totalBurned}) − Eaten (${totalEaten}) = ${remaining} kcal`
                : 'Enter your stats to see your calorie target.'}
            </span>
          </div>

          {/* #13 "Fix my day" button when over goal */}
          {isOverBudget && (
            <div className="w-full mt-3 space-y-2">
              <button
                type="button"
                disabled={isFixingDay}
                onClick={async () => {
                  setIsFixingDay(true);
                  try {
                    const res = await api.suggestFixMyDay(Math.abs(remaining), diaryItems);
                    setFixDayResult(res);
                  } catch {
                    // ignore
                  } finally {
                    setIsFixingDay(false);
                  }
                }}
                className="w-full py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {isFixingDay ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Fix my day (Suggest smart swaps for {Math.abs(remaining)} kcal over)
              </button>

              {fixDayResult && (
                <div className="p-3 bg-zinc-950 border border-rose-500/30 rounded-xl text-left space-y-2">
                  <p className="text-xs text-zinc-200 font-medium">{fixDayResult.summary}</p>
                  <div className="space-y-1.5">
                    {(fixDayResult.swaps || []).map((sw, idx) => (
                      <div key={idx} className="p-2 bg-zinc-900 rounded-lg border border-zinc-800 text-[11px]">
                        <div className="flex justify-between font-semibold text-zinc-200">
                          <span>{sw.originalFood} → {sw.suggestedSwap}</span>
                          <span className="text-teal-400 font-mono">−{sw.caloriesSaved} kcal</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 block mt-0.5">{sw.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* THREE MACRO METERS: Carbs (blue), Fat (amber), Protein (red) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-300">Daily Macronutrients</div>
          {!hasStats && (
            <span className="text-[11px] font-mono text-zinc-500">Set up your profile</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-blue-400">Carbs</span>
              <span className="text-zinc-500 font-mono text-[10px]">{hasStats ? `${carbsPercent}%` : '—'}</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${carbsPercent}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              {hasStats ? (
                <>
                  <span className="font-bold text-zinc-200">{carbsEaten}</span>
                  <span> / {macroTarget.carbsGrams}g</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-amber-400">Fat</span>
              <span className="text-zinc-500 font-mono text-[10px]">{hasStats ? `${fatPercent}%` : '—'}</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${fatPercent}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              {hasStats ? (
                <>
                  <span className="font-bold text-zinc-200">{fatEaten}</span>
                  <span> / {macroTarget.fatGrams}g</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>

          <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="font-semibold text-red-400">Protein</span>
              <span className="text-zinc-500 font-mono text-[10px]">{hasStats ? `${proteinPercent}%` : '—'}</span>
            </div>
            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-500"
                style={{ width: `${proteinPercent}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-zinc-400">
              {hasStats ? (
                <>
                  <span className="font-bold text-zinc-200">{proteinEaten}</span>
                  <span> / {macroTarget.proteinGrams}g</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* WATER TRACKER: Quick-add buttons + 8 tappable glasses per day */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-zinc-200">Water Tracker</span>
          </div>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            {waterGlasses} / 8 glasses ({waterGlasses * 250} ml)
          </span>
        </div>

        {/* #17 Water quick-add buttons: +250 ml, +500 ml, +1 L */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => updateWaterGlasses(waterGlasses + 1)}
            aria-label="Add 250 milliliters of water"
            className="min-h-[38px] py-1.5 px-2.5 bg-zinc-950 hover:bg-cyan-950/40 border border-zinc-800 hover:border-cyan-500/40 rounded-xl text-xs font-mono font-semibold text-cyan-300 transition-colors"
          >
            +250 ml
          </button>
          <button
            type="button"
            onClick={() => updateWaterGlasses(waterGlasses + 2)}
            aria-label="Add 500 milliliters of water"
            className="min-h-[38px] py-1.5 px-2.5 bg-zinc-950 hover:bg-cyan-950/40 border border-zinc-800 hover:border-cyan-500/40 rounded-xl text-xs font-mono font-semibold text-cyan-300 transition-colors"
          >
            +500 ml
          </button>
          <button
            type="button"
            onClick={() => updateWaterGlasses(waterGlasses + 4)}
            aria-label="Add 1 liter of water"
            className="min-h-[38px] py-1.5 px-2.5 bg-zinc-950 hover:bg-cyan-950/40 border border-zinc-800 hover:border-cyan-500/40 rounded-xl text-xs font-mono font-semibold text-cyan-300 transition-colors"
          >
            +1 L
          </button>
        </div>

        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 8 }).map((_, idx) => {
            const isFilled = idx < waterGlasses;
            return (
              <button
                key={idx}
                onClick={() => updateWaterGlasses(isFilled && idx === waterGlasses - 1 ? idx : idx + 1)}
                aria-label={`Water glass ${idx + 1}`}
                className={`min-h-[44px] py-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                  isFilled
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : 'bg-zinc-950/80 text-zinc-600 border border-zinc-800 hover:text-zinc-400'
                }`}
                title={`Glass ${idx + 1}`}
              >
                <Droplets className={`w-4 h-4 ${isFilled ? 'fill-cyan-400' : ''}`} />
                <span className="text-[9px] mt-0.5 font-mono">{idx + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* EXERCISE CARD */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">Today&apos;s Exercise</span>
              <span className="text-[11px] text-zinc-400">
                {exercises.length === 0
                  ? 'No activities logged'
                  : `${exercises.length} logged · +${totalBurned} kcal burned`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (isGuest) {
                  openGuestLock();
                  return;
                }
                setShowExerciseBox(!showExerciseBox);
              }}
              aria-label="Log Exercise"
              className="min-h-[44px] px-3 py-2 bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 rounded-xl flex items-center gap-1 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Log Exercise
            </button>
          </div>
        </div>

        {showExerciseBox && (
          <form onSubmit={handleSaveInlineExercise} className="pt-3 border-t border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-300">
                Describe what you did in your own words
              </label>
              <button
                type="button"
                onClick={() =>
                  setExerciseInput(
                    '2 min warm-up slow jog, 10 min steady-pace run, followed by 24 min brisk walking intervals'
                  )
                }
                className="text-[11px] text-teal-400 hover:text-teal-300 underline cursor-pointer"
              >
                Try example
              </button>
            </div>

            <textarea
              rows={2}
              value={exerciseInput}
              onChange={(e) => setExerciseInput(e.target.value)}
              placeholder="e.g., 2 min warm-up slow jog, 10 min steady-pace run, followed by 24 min brisk walking intervals"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 resize-none leading-relaxed"
            />

            {/* Calories Burned Box Below */}
            <div className="bg-zinc-950 border border-teal-500/30 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">
                    Calories Burned
                  </span>
                  <span className="text-xs text-zinc-200 font-medium">
                    {exerciseInput.trim()
                      ? decipheredExercise.summaryTitle
                      : 'Type your workout above to calculate'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-teal-400 font-mono">
                    {decipheredExercise.totalCaloriesBurned}
                  </span>
                  <span className="text-xs text-zinc-400 font-mono ml-1">kcal</span>
                </div>
              </div>

              {decipheredExercise.segments.length > 0 && (
                <div className="pt-2 border-t border-zinc-800/80 space-y-1">
                  {decipheredExercise.segments.map((seg, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-zinc-300">
                      <span>
                        {seg.activityName} <span className="text-zinc-500 font-mono">({seg.minutes} min)</span>
                      </span>
                      <span className="font-mono text-teal-400 font-semibold">+{seg.caloriesBurned} kcal</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSavingExercise || !exerciseInput.trim() || decipheredExercise.totalCaloriesBurned <= 0}
                className="flex-1 py-2.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                type="button"
                onClick={onNavigateToFitness}
                className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
              >
                Full Fitness Tab
              </button>
            </div>
          </form>
        )}
      </div>

      {/* COPY YESTERDAY & #3 VOICE LOG BAR */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleCopyYesterday()}
            className="text-xs text-zinc-400 hover:text-teal-400 flex items-center gap-1.5 transition-colors py-1"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy yesterday
          </button>

          <button
            type="button"
            onClick={() => openAddFood('lunch')}
            className="px-2.5 py-1 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Mic className="w-3.5 h-3.5" />
            Voice / AI Log
          </button>
        </div>

        {copyStatus && (
          <span className="text-xs text-teal-400 animate-fade-in font-medium truncate">
            {copyStatus}
          </span>
        )}
      </div>

      {/* FOUR MEAL SECTIONS: Breakfast (25%), Lunch (35%), Dinner (30%), Snacks (10%) */}
      <div className="space-y-3.5">
        {mealsList.map((meal) => {
          const items = diaryItems.filter((i) => i.mealType === meal.type);
          const mealKcal = items.reduce((sum, i) => sum + (i.calories || 0), 0);
          const mealTargetKcal = hasStats ? Math.round(dailyTarget * meal.ratio) : 0;
          const mealTargetProt = hasStats ? Math.round(macroTarget.proteinGrams * meal.ratio) : 0;
          const mealTargetCarbs = hasStats ? Math.round(macroTarget.carbsGrams * meal.ratio) : 0;
          const mealTargetFat = hasStats ? Math.round(macroTarget.fatGrams * meal.ratio) : 0;
          const isMealOver = hasStats && mealKcal > mealTargetKcal;
          const topThree = topFoodsByMeal[meal.type] || [];
          const hasUsual = (usualComboByMeal[meal.type] || []).length > 0;

          return (
            <div
              key={meal.type}
              className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3"
            >
              {/* Meal Header with #14 Per-meal target & red over-indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold text-zinc-200">{meal.title}</h4>
                      {isMealOver && (
                        <span
                          title="Over meal calorie target"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[9px] font-mono text-rose-400"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Over
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyYesterday(meal.type)}
                        title={`Copy yesterday's ${meal.title}`}
                        aria-label={`Copy yesterday's ${meal.title}`}
                        className="p-1 text-zinc-500 hover:text-teal-400 rounded-lg bg-zinc-950/60 border border-zinc-800/80 transition-colors flex items-center gap-0.5 text-[10px]"
                      >
                        <ChevronRight className="w-3 h-3" />
                        <span>Yesterday</span>
                      </button>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {hasStats
                        ? `${mealKcal} / ${mealTargetKcal} kcal · Target ${mealTargetCarbs}c ${mealTargetFat}f ${mealTargetProt}p`
                        : '— · Set up your profile'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {hasUsual && (
                    <button
                      type="button"
                      onClick={() => handleSameAsUsual(meal.type)}
                      title="Log your most common combination for this meal"
                      className="px-2 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-teal-300 rounded-xl transition-colors flex items-center gap-1 text-[11px] font-medium"
                    >
                      <RotateCcw className="w-3 h-3 text-teal-400" />
                      Same as usual
                    </button>
                  )}
                  <button
                    onClick={() => openAddFood(meal.type)}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-teal-400 rounded-xl transition-colors flex items-center gap-1 text-xs font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </div>

              {/* #7 Quick-log bar at the top of each meal section showing top 3 most-logged foods */}
              {topThree.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-teal-400" />
                    Quick:
                  </span>
                  {topThree.map((qf) => (
                    <button
                      key={qf.name}
                      type="button"
                      onClick={() => handleQuickLog(meal.type, qf)}
                      className="px-2 py-1 rounded-lg bg-zinc-950 hover:bg-teal-950/50 border border-zinc-800 hover:border-teal-500/40 text-[11px] text-zinc-300 hover:text-teal-300 shrink-0 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-2.5 h-2.5 text-teal-400" />
                      <span className="truncate max-w-[110px]">{qf.name}</span>
                      <span className="text-[10px] font-mono text-zinc-500">{qf.calories}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Logged Foods List */}
              {items.length === 0 ? (
                <div className="py-2.5 text-center text-xs text-zinc-600 border border-dashed border-zinc-800 rounded-xl">
                  No foods logged yet — swipe left on items to delete or long-press for options
                </div>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item) => {
                    const isSwiped = swipedItemId === item.id;
                    const isLongPressed = longPressedItemId === item.id;
                    const isEditingNote = editingNoteId === item.id;

                    return (
                      <div key={item.id} className="space-y-1">
                        <div className="relative overflow-hidden rounded-xl">
                          {/* Swipe-left delete action background (#1) */}
                          {isSwiped && (
                            <button
                              type="button"
                              onClick={() => deleteFoodItem(item.id)}
                              className="absolute inset-y-0 right-0 w-20 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1 z-10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          )}

                          <div
                            onTouchStart={(e) => handlePointerDownItem(item.id, e.touches[0].clientX)}
                            onTouchMove={(e) => handlePointerMoveItem(item.id, e.touches[0].clientX)}
                            onTouchEnd={handlePointerUpItem}
                            onMouseDown={(e) => handlePointerDownItem(item.id, e.clientX)}
                            onMouseMove={(e) => {
                              if (e.buttons === 1) handlePointerMoveItem(item.id, e.clientX);
                            }}
                            onMouseUp={handlePointerUpItem}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setLongPressedItemId(prev => (prev === item.id ? null : item.id));
                            }}
                            className={`p-2.5 bg-zinc-950/70 border border-zinc-850 rounded-xl flex items-center justify-between group transition-transform select-none ${
                              isSwiped ? '-translate-x-20' : 'translate-x-0'
                            }`}
                          >
                            <div
                              onClick={() => {
                                setEditingNoteId(isEditingNote ? null : item.id);
                                setNoteDraft(item.note || '');
                              }}
                              className="max-w-[68%] cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium text-zinc-200 block truncate">
                                  {item.name}
                                </span>
                                {(item.unusualQuantity || item.note?.includes('Unusual quantity')) && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-[10px] font-mono font-semibold text-rose-400">
                                    <AlertTriangle className="w-2.5 h-2.5 text-rose-400 shrink-0" />
                                    Unusual quantity
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                                <span>{item.serving || '1 portion'}</span>
                                <span>·</span>
                                <span className="text-blue-400">{item.carbs}c</span>
                                <span className="text-amber-400">{item.fat}f</span>
                                <span className="text-red-400">{item.protein}p</span>
                              </div>
                              {item.note && !isEditingNote && (
                                <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                                  <MessageSquare className="w-2.5 h-2.5 shrink-0 text-zinc-500" />
                                  {item.note}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-teal-400 font-mono mr-1">
                                {item.calories} kcal
                              </span>
                              {/* #15 Leftover tracker on dinner items */}
                              {meal.type === 'dinner' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await addPantryEntry({
                                      name: `${item.name} (Leftover)`,
                                      quantity: item.serving || '1 portion',
                                      category: 'leftover',
                                      caloriesPerPortion: item.calories,
                                      protein: item.protein,
                                      carbs: item.carbs,
                                      fat: item.fat,
                                      isLeftover: true
                                    });
                                    setCopyStatus(`Saved "${item.name}" as leftover in Pantry`);
                                    setTimeout(() => setCopyStatus(null), 2500);
                                  }}
                                  title="Save dinner as leftover in Pantry"
                                  className="p-1 text-zinc-600 hover:text-teal-400 rounded transition-colors"
                                >
                                  <Package className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {/* #4 Meal notes button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNoteId(isEditingNote ? null : item.id);
                                  setNoteDraft(item.note || '');
                                }}
                                title="Add or edit meal note"
                                className={`p-1 rounded transition-colors ${
                                  item.note
                                    ? 'text-teal-400 hover:text-teal-300'
                                    : 'text-zinc-600 hover:text-zinc-300'
                                }`}
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                              {/* #2 Long-press / tomorrow trigger */}
                              <button
                                type="button"
                                onClick={() =>
                                  setLongPressedItemId(prev => (prev === item.id ? null : item.id))
                                }
                                title="More meal options"
                                className="p-1 text-zinc-600 hover:text-teal-400 rounded transition-colors"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteFoodItem(item.id)}
                                className="p-1 text-zinc-600 hover:text-rose-400 rounded transition-colors"
                                aria-label="Delete food"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* #2 Long-press "Log again tomorrow" action bar */}
                        {isLongPressed && (
                          <div className="flex items-center justify-between px-3 py-1.5 bg-teal-950/40 border border-teal-800/50 rounded-xl text-xs">
                            <span className="text-zinc-300 text-[11px]">
                              Schedule <strong className="text-teal-300">{item.name}</strong> for tomorrow?
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await logFoodAgainTomorrow(item);
                                setLongPressedItemId(null);
                                setCopyStatus(`Logged "${item.name}" for tomorrow`);
                                setTimeout(() => setCopyStatus(null), 2500);
                              }}
                              className="px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <CalendarPlus className="w-3 h-3" />
                              Log again tomorrow
                            </button>
                          </div>
                        )}

                        {/* #4 Meal notes inline input */}
                        {isEditingNote && (
                          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl">
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Add a short note (e.g. felt tired after this)..."
                              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveNote(item.id)}
                              className="px-2.5 py-1 bg-teal-500 text-zinc-950 font-semibold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* #14 PANTRY, #15 LEFTOVERS, #11 RECEIPT SCAN, #10 FRIDGE PHOTO & #16 WHAT CAN I MAKE? */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-semibold text-zinc-200">
              Pantry &amp; Leftovers ({pantryItems.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* #11 Receipt Scan */}
            <label className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[10px] font-medium text-teal-300 cursor-pointer flex items-center gap-1">
              <Camera className="w-3 h-3" />
              Receipt Scan
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    setIsKitchenAiBusy(true);
                    try {
                      const res = await api.scanReceipt(String(reader.result), file.type);
                      for (const it of res.items || []) {
                        await addPantryEntry({
                          name: it.name,
                          quantity: it.quantity || '1 unit',
                          category: it.category || 'pantry'
                        });
                      }
                      setCopyStatus(`Added ${(res.items || []).length} items from receipt`);
                      setTimeout(() => setCopyStatus(null), 3000);
                    } catch {
                      // ignore
                    } finally {
                      setIsKitchenAiBusy(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
            </label>

            {/* #10 Fridge Photo */}
            <label className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[10px] font-medium text-teal-300 cursor-pointer flex items-center gap-1">
              <Camera className="w-3 h-3" />
              Fridge Photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = async () => {
                    setIsKitchenAiBusy(true);
                    try {
                      const res = await api.analyzeFridgePhoto(
                        String(reader.result),
                        {
                          calories: Math.max(250, remaining),
                          protein: Math.max(15, macroTarget.proteinGrams - proteinEaten),
                          carbs: Math.max(15, macroTarget.carbsGrams - carbsEaten),
                          fat: Math.max(10, macroTarget.fatGrams - fatEaten)
                        },
                        file.type
                      );
                      setKitchenMeals(res.meals || []);
                    } catch {
                      // ignore
                    } finally {
                      setIsKitchenAiBusy(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Manual Pantry Add */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newPantryName.trim()) return;
            await addPantryEntry({
              name: newPantryName.trim(),
              quantity: newPantryQty.trim() || '1 unit',
              category: 'pantry'
            });
            setNewPantryName('');
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={newPantryName}
            onChange={(e) => setNewPantryName(e.target.value)}
            placeholder="Add item to Pantry (e.g. Greek yogurt, spinach, rice)..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-teal-400 rounded-xl text-xs font-medium shrink-0"
          >
            Add
          </button>
        </form>

        {/* Pantry Items Pill List */}
        {pantryItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {pantryItems.map((p) => (
              <span
                key={p.id}
                className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1.5 border ${
                  p.isLeftover
                    ? 'bg-teal-950/50 border-teal-700/50 text-teal-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                }`}
              >
                <span>{p.name}</span>
                <button
                  type="button"
                  onClick={() => deletePantryEntry(p.id)}
                  className="text-zinc-500 hover:text-rose-400"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {/* #16 "What can I make?" button */}
        <button
          type="button"
          disabled={isKitchenAiBusy}
          onClick={async () => {
            setIsKitchenAiBusy(true);
            try {
              const res = await api.suggestWhatCanIMake(
                pantryItems.map(p => p.name),
                {
                  calories: Math.max(250, remaining),
                  protein: Math.max(15, macroTarget.proteinGrams - proteinEaten),
                  carbs: Math.max(15, macroTarget.carbsGrams - carbsEaten),
                  fat: Math.max(10, macroTarget.fatGrams - fatEaten)
                }
              );
              setKitchenMeals(res.meals || []);
            } catch {
              // ignore
            } finally {
              setIsKitchenAiBusy(false);
            }
          }}
          className="w-full py-2 bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          {isKitchenAiBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ChefHat className="w-3.5 h-3.5" />}
          What can I make? (3 meals for your remaining macros)
        </button>

        {kitchenMeals && kitchenMeals.length > 0 && (
          <div className="space-y-2 pt-1">
            {kitchenMeals.map((m, idx) => (
              <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-zinc-100 block">{m.name}</span>
                  <span className="text-[10px] text-zinc-400 block">{m.description}</span>
                  <span className="text-[10px] font-mono text-teal-400">
                    {m.calories} kcal · {m.protein}p · {m.carbs}c · {m.fat}f
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    addFoodItem({
                      date: activeDate,
                      mealType: 'dinner',
                      name: m.name,
                      calories: m.calories,
                      protein: m.protein,
                      carbs: m.carbs,
                      fat: m.fat,
                      serving: '1 portion',
                      source: 'recipe'
                    })
                  }
                  className="px-2.5 py-1.5 bg-teal-500 text-zinc-950 font-semibold rounded-lg text-[11px] shrink-0"
                >
                  Log
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* #37 DAILY CHECK-IN CARD (Mood, Energy, Sleep Quality 1-5) & #38 SLEEP TRACKER (Hours Slept) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-semibold text-zinc-200">Daily Check-In & Sleep</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">1–5 Scale</span>
        </div>

        <div className="space-y-3">
          {/* Mood */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Mood</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => saveTodayHabit({ mood: val })}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-colors ${
                    todayHabit?.mood === val
                      ? 'bg-teal-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

           {/* Energy ("How's your energy today?" 1-5 scale) */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-300 font-medium">How&apos;s your energy today?</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => saveTodayHabit({ energy: val })}
                  aria-label={`Energy level ${val}`}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-colors ${
                    todayHabit?.energy === val
                      ? 'bg-teal-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Sleep Quality */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Sleep Quality</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => saveTodayHabit({ sleepQuality: val })}
                  className={`w-7 h-7 rounded-lg text-xs font-mono font-bold transition-colors ${
                    todayHabit?.sleepQuality === val
                      ? 'bg-teal-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* #38 Sleep Tracker — hours slept */}
          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-3.5 h-3.5 text-teal-400" />
              <span className="text-xs text-zinc-300">Hours Slept Last Night</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                step="0.5"
                min="0"
                max="16"
                value={todayHabit?.sleepHours ?? ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  saveTodayHabit({ sleepHours: isNaN(val) ? undefined : val });
                }}
                placeholder="7.5"
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono text-zinc-100 text-center focus:outline-none focus:border-teal-500"
              />
              <span className="text-xs text-zinc-500 font-mono">hrs</span>
            </div>
          </div>
        </div>
      </div>

      {/* #40 ONE-QUESTION DAILY JOURNAL */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-semibold text-zinc-200">Daily Reflection</span>
          </div>
          {journalSavedMsg && (
            <span className="text-[11px] text-teal-400 font-medium">Saved.</span>
          )}
        </div>
        <p className="text-xs text-teal-300/90 font-medium">{dailyPrompt}</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={journalDraft}
            onChange={(e) => setJournalDraft(e.target.value)}
            placeholder="Write a brief reflection..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={async () => {
              await saveTodayHabit({
                journalPrompt: dailyPrompt,
                journalAnswer: journalDraft.trim()
              });
              setJournalSavedMsg(true);
              setTimeout(() => setJournalSavedMsg(false), 3000);
            }}
            className="px-3 py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs shrink-0"
          >
            Save
          </button>
        </div>
      </div>

      {/* #29 CRAVING LOG */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-zinc-200">Log a craving</span>
          </div>
          <span className="text-[10px] text-teal-400 font-mono text-right">
            {cravingPatternText}
          </span>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cravingFood.trim()) return;
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await addCravingItem({
              date: activeDate,
              time: nowTime,
              wantedFood: cravingFood.trim(),
              intensity: cravingIntensity,
              trigger: cravingTrigger.trim() || undefined
            });
            setCravingFood('');
            setCravingTrigger('');
          }}
          className="space-y-2.5"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={cravingFood}
              onChange={(e) => setCravingFood(e.target.value)}
              placeholder="What did you crave?"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
            />
            <input
              type="text"
              value={cravingTrigger}
              onChange={(e) => setCravingTrigger(e.target.value)}
              placeholder="Trigger (e.g. stress, late night)"
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-400">Strength:</span>
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setCravingIntensity(lvl)}
                  className={`w-6 h-6 rounded-md text-[11px] font-mono font-bold ${
                    cravingIntensity === lvl
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-950 border border-zinc-800 text-zinc-400'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-teal-400 rounded-xl text-xs font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Craving
            </button>
          </div>
        </form>

        {cravings.filter(c => c.date === activeDate).length > 0 && (
          <div className="space-y-1.5 pt-1">
            {cravings
              .filter(c => c.date === activeDate)
              .map((c) => (
                <div
                  key={c.id}
                  className="p-2 bg-zinc-950/70 border border-zinc-850 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="text-zinc-200 font-medium">{c.wantedFood}</span>
                    <span className="text-[10px] text-zinc-500 font-mono block">
                      {c.time} · Strength {c.intensity}/5 {c.trigger ? `· ${c.trigger}` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteCravingItem(c.id)}
                    className="p-1 text-zinc-600 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
