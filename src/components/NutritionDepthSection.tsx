import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  Mail,
  AlertTriangle,
  Leaf,
  Trash2,
  Plus,
  Check,
  Activity,
  History
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../services/api.js';
import {
  estimateGlycemicIndex,
  detectAdditiveWarnings,
  estimateMealCarbonKg,
  estimateFoodOmega3Mg,
  getLowerCalorieSwap,
  getImmediateEatNowSuggestions
} from '../utils/nutritionDepth.js';
import type { DiaryEntry } from '../types/index.js';

export interface Omega3Entry {
  id: string;
  date: string;
  sourceName: string;
  mg: number;
}

export interface FoodWasteEntry {
  id: string;
  date: string;
  itemName: string;
  grams: number;
  costUsd: number;
  reason: 'Expired' | 'Cooked too much' | 'Forgot in fridge' | 'Spoiled';
}

const OMEGA3_STORAGE_KEY = 'caloriq_omega3_logs_v1';
const WASTE_STORAGE_KEY = 'caloriq_food_waste_v1';
const SUNDAY_DIGEST_KEY = 'caloriq_sunday_digest_enabled_v1';

const OMEGA3_PRESETS = [
  { name: 'Wild Atlantic Salmon (150g)', mg: 2150 },
  { name: 'Chia Seeds (2 tbsp / 28g)', mg: 5000 },
  { name: 'Walnuts (30g handful)', mg: 2570 },
  { name: 'Sardines / Mackerel (100g)', mg: 1480 },
  { name: 'Omega-3 Fish Oil Capsule (EPA/DHA)', mg: 1000 },
  { name: 'Ground Flaxseed (1 tbsp)', mg: 1600 }
];

export const NutritionDepthSection: React.FC = () => {
  const {
    activeDate,
    diaryItems,
    allDiaryItems,
    macroTarget,
    addFoodItem,
    deleteFoodItem,
    userEmail
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    'eat_now' | 'swaps_gi' | 'omega3_additives' | 'carbon_waste' | 'sunday_report'
  >('eat_now');

  // "What should I eat right now?" state
  const [showEatNowSuggestions, setShowEatNowSuggestions] = useState(true);
  const [eatNowLoggedMsg, setEatNowLoggedMsg] = useState<string | null>(null);

  // Omega-3 tracking state
  const [omegaLogs, setOmegaLogs] = useState<Omega3Entry[]>(() => {
    try {
      const raw = localStorage.getItem(OMEGA3_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [customOmegaName, setCustomOmegaName] = useState('');
  const [customOmegaMg, setCustomOmegaMg] = useState('1000');

  // Additive scanner input
  const [additiveCheckQuery, setAdditiveCheckQuery] = useState('');

  // Food Waste Tracker state
  const [wasteLogs, setWasteLogs] = useState<FoodWasteEntry[]>(() => {
    try {
      const raw = localStorage.getItem(WASTE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [wasteItemName, setWasteItemName] = useState('');
  const [wasteGrams, setWasteGrams] = useState('120');
  const [wasteCost, setWasteCost] = useState('2.50');
  const [wasteReason, setWasteReason] = useState<FoodWasteEntry['reason']>('Forgot in fridge');

  // Weekly AI Sunday report state
  const [sundayDigestEnabled, setSundayDigestEnabled] = useState<boolean>(() => {
    return localStorage.getItem(SUNDAY_DIGEST_KEY) !== '0';
  });
  const [sundayEmailInput, setSundayEmailInput] = useState(userEmail || '');
  const [isSendingSundayReport, setIsSendingSundayReport] = useState(false);
  const [sundayReportStatus, setSundayReportStatus] = useState<string | null>(null);
  const [sundayPreviewInsights, setSundayPreviewInsights] = useState<string[]>([]);

  useEffect(() => {
    if (userEmail && !sundayEmailInput) {
      setSundayEmailInput(userEmail);
    }
  }, [userEmail, sundayEmailInput]);

  useEffect(() => {
    try {
      localStorage.setItem(OMEGA3_STORAGE_KEY, JSON.stringify(omegaLogs));
    } catch {
      // ignore
    }
  }, [omegaLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(WASTE_STORAGE_KEY, JSON.stringify(wasteLogs));
    } catch {
      // ignore
    }
  }, [wasteLogs]);

  // Auto-dispatch Sunday weekly AI report once on Sundays if enabled
  useEffect(() => {
    const now = new Date();
    if (now.getDay() === 0 && sundayDigestEnabled) {
      const todayKey = `caloriq_sunday_sent_${now.toISOString().split('T')[0]}`;
      if (!localStorage.getItem(todayKey)) {
        localStorage.setItem(todayKey, '1');
        api
          .sendWeeklySundayReport({
            email: userEmail || undefined,
            targetCalories: macroTarget.calories
          })
          .catch(() => {});
      }
    }
  }, [sundayDigestEnabled, userEmail, macroTarget.calories]);

  const eatenCalories = useMemo(
    () => diaryItems.reduce((s, i) => s + (i.calories || 0), 0),
    [diaryItems]
  );
  const eatenProtein = useMemo(
    () => diaryItems.reduce((s, i) => s + (i.protein || 0), 0),
    [diaryItems]
  );
  const remainingCalories = Math.max(0, macroTarget.calories - eatenCalories);
  const remainingProtein = Math.max(0, macroTarget.proteinGrams - eatenProtein);

  // 1 & 2: Immediate "What should I eat right now?" + Personalized history suggestions
  const eatNowList = useMemo(
    () =>
      getImmediateEatNowSuggestions({
        remainingCalories,
        remainingProtein,
        allDiaryItems,
        hourOfDay: new Date().getHours()
      }),
    [remainingCalories, remainingProtein, allDiaryItems]
  );

  const personalizedHistoryMeals = useMemo(() => {
    const map = new Map<string, { item: DiaryEntry; count: number }>();
    for (const entry of allDiaryItems) {
      const k = entry.name.toLowerCase().trim();
      const existing = map.get(k);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(k, { item: entry, count: 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count || b.item.protein - a.item.protein)
      .slice(0, 4);
  }, [allDiaryItems]);

  // 6: Omega-3 auto-detected from today's diary + manual logs
  const autoDetectedOmegaMg = useMemo(
    () => diaryItems.reduce((sum, i) => sum + estimateFoodOmega3Mg(i.name), 0),
    [diaryItems]
  );
  const manualTodayOmega = useMemo(
    () => omegaLogs.filter((o) => o.date === activeDate),
    [omegaLogs, activeDate]
  );
  const totalTodayOmegaMg =
    autoDetectedOmegaMg + manualTodayOmega.reduce((sum, o) => sum + o.mg, 0);
  const omegaTargetMg = 1600;

  // 7: Additive warnings across today's logged foods + custom query
  const todayFoodAdditives = useMemo(() => {
    const list: Array<{ foodName: string; warnings: ReturnType<typeof detectAdditiveWarnings> }> = [];
    for (const item of diaryItems) {
      const w = detectAdditiveWarnings(item.name);
      if (w.length > 0) {
        list.push({ foodName: item.name, warnings: w });
      }
    }
    return list;
  }, [diaryItems]);

  const customQueryWarnings = useMemo(
    () => (additiveCheckQuery.trim() ? detectAdditiveWarnings(additiveCheckQuery) : []),
    [additiveCheckQuery]
  );

  // 8: Carbon footprint per meal (rough estimate)
  const todayTotalCarbonKg = useMemo(
    () =>
      Math.round(
        diaryItems.reduce((sum, i) => sum + estimateMealCarbonKg(i.name, i.calories), 0) * 100
      ) / 100,
    [diaryItems]
  );

  // 3: AI Meal Swap handler — replaces logged meal with lower-calorie option
  const handleSwapLoggedMeal = async (item: DiaryEntry) => {
    const swap = getLowerCalorieSwap(item);
    await deleteFoodItem(item.id);
    await addFoodItem({
      date: activeDate,
      mealType: item.mealType,
      name: swap.name,
      calories: swap.calories,
      protein: swap.protein,
      carbs: swap.carbs,
      fat: swap.fat,
      serving: '1 swapped lower-calorie portion',
      source: 'ai'
    });
    setEatNowLoggedMsg(`Swapped "${item.name}" for "${swap.name}" (saved ${swap.savedCalories} kcal)`);
    setTimeout(() => setEatNowLoggedMsg(null), 3500);
  };

  const handleLogOmega = (sourceName: string, mg: number) => {
    setOmegaLogs((prev) => [
      ...prev,
      {
        id: `om3_${Date.now()}`,
        date: activeDate,
        sourceName,
        mg
      }
    ]);
  };

  const handleAddWaste = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteItemName.trim()) return;
    setWasteLogs((prev) => [
      {
        id: `waste_${Date.now()}`,
        date: activeDate,
        itemName: wasteItemName.trim(),
        grams: Math.max(10, parseInt(wasteGrams, 10) || 100),
        costUsd: Math.max(0.25, parseFloat(wasteCost) || 2.0),
        reason: wasteReason
      },
      ...prev
    ]);
    setWasteItemName('');
  };

  const handleSendSundayDigest = async () => {
    setIsSendingSundayReport(true);
    setSundayReportStatus(null);
    try {
      const res = await api.sendWeeklySundayReport({
        email: sundayEmailInput.trim() || undefined,
        targetCalories: macroTarget.calories
      });
      setSundayPreviewInsights(res.insights || []);
      setSundayReportStatus(
        `Sunday AI Report dispatched via Resend to ${res.recipient}.`
      );
    } catch (err: any) {
      setSundayReportStatus(err?.message || 'Generated weekly AI summary.');
    } finally {
      setIsSendingSundayReport(false);
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-100">
              AI &amp; Nutrition Depth: Meal Swaps, GI Tags, Omega-3, Additives &amp; Eco Footprint
            </h3>
            <span className="text-[10px] text-zinc-400 block">
              Real-time meal suggestions, lower-calorie AI swaps, glycemic index, carbon &amp; food waste
            </span>
          </div>
        </div>

        {/* Prominent "What should I eat right now?" button on the Diary */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('eat_now');
            setShowEatNowSuggestions(true);
          }}
          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-xl text-xs transition-colors"
        >
          What should I eat right now?
        </button>
      </div>

      {eatNowLoggedMsg && (
        <div
          role="status"
          aria-live="polite"
          className="p-2.5 bg-teal-950/60 border border-teal-500/40 rounded-xl text-xs text-teal-300 flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span>{eatNowLoggedMsg}</span>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
        {[
          { id: 'eat_now', label: 'Eat Right Now & History' },
          { id: 'swaps_gi', label: 'AI Meal Swap & GI Tags' },
          { id: 'omega3_additives', label: 'Omega-3 & Additives' },
          { id: 'carbon_waste', label: 'Carbon & Food Waste' },
          { id: 'sunday_report', label: 'Sunday AI Email' }
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              activeTab === t.id
                ? 'bg-teal-500 text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: "What should I eat right now?" + Personalized suggestions from user's own history */}
      {activeTab === 'eat_now' && (
        <div className="space-y-4">
          {showEatNowSuggestions && (
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-100">
                  What Should I Eat Right Now? ({remainingCalories} kcal &amp; {remainingProtein}g protein left)
                </span>
                <span className="text-[10px] font-mono text-teal-300">Matched to current time</span>
              </div>

              <div className="space-y-2">
                {eatNowList.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-100">{suggestion.name}</span>
                        <span className="px-1.5 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 text-[10px] font-mono text-teal-300">
                          {suggestion.tag}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 block mt-0.5">
                        {suggestion.calories} kcal · {suggestion.protein}g P · {suggestion.carbs}g C · {suggestion.fat}g F
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await addFoodItem({
                          date: activeDate,
                          mealType: suggestion.mealType,
                          name: suggestion.name,
                          calories: suggestion.calories,
                          protein: suggestion.protein,
                          carbs: suggestion.carbs,
                          fat: suggestion.fat,
                          serving: '1 recommended portion',
                          source: 'ai'
                        });
                        setEatNowLoggedMsg(`Logged "${suggestion.name}" to ${suggestion.mealType}`);
                        setTimeout(() => setEatNowLoggedMsg(null), 3000);
                      }}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
                    >
                      Log Now
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Personalized Meal Suggestions from User's Own History */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-semibold text-zinc-100">
                Personalized Meal Suggestions from Your Own History
              </span>
            </div>

            {personalizedHistoryMeals.length === 0 ? (
              <p className="text-xs text-zinc-400">
                Log your first meals in the Diary above and Caloriq will rank your highest-protein personal favorites here.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {personalizedHistoryMeals.map(({ item, count }) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-zinc-100 block truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {item.calories} kcal · {item.protein}p · Logged {count}x
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await addFoodItem({
                          date: activeDate,
                          mealType: item.mealType,
                          name: item.name,
                          calories: item.calories,
                          protein: item.protein,
                          carbs: item.carbs,
                          fat: item.fat,
                          serving: item.serving || '1 portion',
                          source: 'manual'
                        });
                        setEatNowLoggedMsg(`Re-logged "${item.name}" from your personal history`);
                        setTimeout(() => setEatNowLoggedMsg(null), 3000);
                      }}
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-teal-500 hover:text-zinc-950 text-teal-300 font-semibold rounded-lg text-[11px] shrink-0 transition-colors"
                    >
                      + Log
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: AI Meal Swap (lower-calorie option) & Glycemic Index Tags */}
      {activeTab === 'swaps_gi' && (
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-100">
              Today&apos;s Logged Foods: Glycemic Index Tags &amp; 1-Tap Lower-Calorie AI Swaps
            </span>
            <span className="text-[10px] font-mono text-zinc-400">
              Low GI (&le;55) · Med GI (56–69) · High GI (&ge;70)
            </span>
          </div>

          {diaryItems.length === 0 ? (
            <p className="text-xs text-zinc-400">
              No meals logged for {activeDate} yet. Log any food above to inspect its Glycemic Index tag and 1-tap lower-calorie AI swap.
            </p>
          ) : (
            <div className="space-y-2">
              {diaryItems.map((item) => {
                const gi = estimateGlycemicIndex(item.name, item.carbs, item.protein, item.fat);
                const swap = getLowerCalorieSwap(item);
                const carbonKg = estimateMealCarbonKg(item.name, item.calories);
                return (
                  <div
                    key={item.id}
                    className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-zinc-100">{item.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold ${gi.badgeClass}`}
                        >
                          {gi.level} (~{gi.score})
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-[10px] font-mono text-zinc-300">
                          {carbonKg} kg CO2e
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold text-teal-400">
                        {item.calories} kcal
                      </span>
                    </div>

                    <div className="p-2 bg-zinc-950 border border-zinc-800/90 rounded-lg flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-teal-300 block">
                          AI Lower-Calorie Swap: {swap.name}
                        </span>
                        <span className="text-[10px] text-zinc-400 block">{swap.reason}</span>
                        <span className="text-[10px] font-mono text-zinc-300">
                          {swap.calories} kcal ({swap.protein}p / {swap.carbs}c / {swap.fat}f) · Saves{' '}
                          {swap.savedCalories} kcal
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSwapLoggedMeal(item)}
                        className="px-2.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-[11px] shrink-0 flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Swap Meal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Omega-3 Tracking & Additive Warnings (aspartame, MSG, dyes) */}
      {activeTab === 'omega3_additives' && (
        <div className="space-y-4">
          {/* Omega-3 Tracker */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  Omega-3 Fatty Acid Tracker (EPA + DHA + ALA)
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-teal-300">
                {totalTodayOmegaMg} / {omegaTargetMg} mg
              </span>
            </div>

            <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.round((totalTodayOmegaMg / omegaTargetMg) * 100))}%` }}
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {OMEGA3_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleLogOmega(p.name, p.mg)}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 transition-colors"
                >
                  + {p.name} ({p.mg}mg)
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customOmegaName}
                onChange={(e) => setCustomOmegaName(e.target.value)}
                placeholder="Custom Omega-3 food or supplement"
                aria-label="Custom Omega-3 source"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="number"
                value={customOmegaMg}
                onChange={(e) => setCustomOmegaMg(e.target.value)}
                placeholder="mg"
                aria-label="Omega-3 milligrams"
                className="w-24 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
              />
              <button
                type="button"
                onClick={() => {
                  handleLogOmega(
                    customOmegaName.trim() || 'Omega-3 Serving',
                    Math.max(50, parseInt(customOmegaMg, 10) || 1000)
                  );
                  setCustomOmegaName('');
                }}
                className="px-3 py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs"
              >
                Add
              </button>
            </div>

            {manualTodayOmega.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-zinc-800">
                {manualTodayOmega.map((o) => (
                  <div key={o.id} className="flex items-center justify-between text-xs text-zinc-300">
                    <span>{o.sourceName}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-teal-300">{o.mg} mg</span>
                      <button
                        type="button"
                        onClick={() => setOmegaLogs((prev) => prev.filter((x) => x.id !== o.id))}
                        aria-label={`Delete ${o.sourceName}`}
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additive Warnings for Common Items (Aspartame, MSG, Dyes, Nitrites) */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-zinc-100">
                Additive Warnings Scanner (Aspartame, MSG, Synthetic Dyes &amp; Nitrites)
              </span>
            </div>

            <input
              type="text"
              value={additiveCheckQuery}
              onChange={(e) => setAdditiveCheckQuery(e.target.value)}
              placeholder="Test any food or label (e.g. Diet Cola with aspartame, Instant Ramen MSG, Red 40 candy)..."
              aria-label="Check food or ingredient label for additives"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100"
            />

            {customQueryWarnings.length > 0 && (
              <div className="space-y-1.5">
                {customQueryWarnings.map((w, i) => (
                  <div
                    key={i}
                    className="p-2.5 bg-amber-950/50 border border-amber-500/40 rounded-xl text-xs text-amber-200"
                  >
                    <span className="font-bold block">
                      Warning: {w.additive} ({w.category})
                    </span>
                    <span className="text-[11px] text-amber-100/90">{w.note}</span>
                  </div>
                ))}
              </div>
            )}

            {todayFoodAdditives.length === 0 ? (
              <p className="text-[11px] text-teal-300">
                No aspartame, MSG, or synthetic dyes detected in your logged meals for {activeDate}.
              </p>
            ) : (
              <div className="space-y-1.5">
                {todayFoodAdditives.map((fa, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200"
                  >
                    <span className="font-semibold block">{fa.foodName}</span>
                    {fa.warnings.map((w, wi) => (
                      <span key={wi} className="text-[11px] block text-amber-300">
                        • {w.additive}: {w.note}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Carbon Footprint per Meal & Food Waste Tracker */}
      {activeTab === 'carbon_waste' && (
        <div className="space-y-4">
          {/* Carbon Footprint per Meal */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  Carbon Footprint per Meal (Rough Estimate)
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-teal-300">
                Today: {todayTotalCarbonKg} kg CO2e
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Estimated food-system emissions per logged meal (global sustainable dietary benchmark: ~3.5 kg CO2e/day).
            </p>
            {diaryItems.length > 0 && (
              <div className="space-y-1 pt-1">
                {diaryItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs text-zinc-300">
                    <span className="truncate max-w-[70%]">{item.name}</span>
                    <span className="font-mono text-teal-300">
                      {estimateMealCarbonKg(item.name, item.calories)} kg CO2e
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Food Waste Tracker */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">Food Waste Tracker</span>
              <span className="text-xs font-mono text-amber-300 font-bold">
                Total logged: {wasteLogs.reduce((s, w) => s + w.grams, 0)}g ($
                {wasteLogs.reduce((s, w) => s + w.costUsd, 0).toFixed(2)})
              </span>
            </div>

            <form onSubmit={handleAddWaste} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={wasteItemName}
                onChange={(e) => setWasteItemName(e.target.value)}
                placeholder="Wasted item (e.g. Spinach bag)"
                aria-label="Wasted food item name"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="number"
                value={wasteGrams}
                onChange={(e) => setWasteGrams(e.target.value)}
                placeholder="Grams (g)"
                aria-label="Wasted weight in grams"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
              />
              <select
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value as any)}
                aria-label="Food waste reason"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="Forgot in fridge">Forgot in fridge</option>
                <option value="Expired">Past expiry date</option>
                <option value="Cooked too much">Cooked too much</option>
                <option value="Spoiled">Spoiled early</option>
              </select>
              <button
                type="submit"
                className="py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Waste
              </button>
            </form>

            {wasteLogs.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {wasteLogs.slice(0, 5).map((w) => (
                  <div
                    key={w.id}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-zinc-200">{w.itemName}</span>{' '}
                      <span className="text-zinc-400 font-mono">
                        ({w.grams}g · ${w.costUsd.toFixed(2)})
                      </span>
                      <span className="block text-[10px] text-zinc-400">
                        {w.date} · Reason: {w.reason}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWasteLogs((prev) => prev.filter((x) => x.id !== w.id))}
                      aria-label={`Delete waste log ${w.itemName}`}
                      className="text-zinc-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Weekly AI Report Emailed Every Sunday via Resend */}
      {activeTab === 'sunday_report' && (
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-teal-400" />
              <div>
                <span className="text-xs font-semibold text-zinc-100 block">
                  Weekly AI Report Emailed Every Sunday via Resend
                </span>
                <span className="text-[10px] text-zinc-400 block">
                  Automatically compiles your 7-day calorie, protein, and consistency trends with Gemini coaching
                </span>
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={sundayDigestEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSundayDigestEnabled(val);
                  localStorage.setItem(SUNDAY_DIGEST_KEY, val ? '1' : '0');
                }}
                className="accent-teal-500 rounded"
              />
              Every Sunday
            </label>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={sundayEmailInput}
              onChange={(e) => setSundayEmailInput(e.target.value)}
              placeholder="Recipient email for Sunday AI Digest"
              aria-label="Recipient email for Sunday AI report"
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100"
            />
            <button
              type="button"
              disabled={isSendingSundayReport}
              onClick={handleSendSundayDigest}
              className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
            >
              {isSendingSundayReport ? 'Sending...' : 'Email Sunday Report Now'}
            </button>
          </div>

          {sundayReportStatus && (
            <p role="status" aria-live="polite" className="text-xs text-teal-300 font-medium">
              {sundayReportStatus}
            </p>
          )}

          {sundayPreviewInsights.length > 0 && (
            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl space-y-1.5">
              <span className="text-[11px] font-semibold text-teal-300 block">
                Dispatched Sunday AI Insights Preview:
              </span>
              <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-200">
                {sundayPreviewInsights.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
