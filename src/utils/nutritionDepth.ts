import type { DiaryEntry, MealType } from '../types/index.js';

export interface GlycemicInfo {
  level: 'Low GI' | 'Med GI' | 'High GI';
  score: number;
  badgeClass: string;
}

export interface AdditiveWarning {
  additive: string;
  category: 'Artificial Sweetener' | 'Flavor Enhancer' | 'Synthetic Dye' | 'Preservative';
  note: string;
}

export interface LowerCalorieSwapOption {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  savedCalories: number;
  reason: string;
}

export function estimateGlycemicIndex(foodName: string, carbs: number, protein: number, fat: number): GlycemicInfo {
  const lower = (foodName || '').toLowerCase();

  const highGiKeywords = [
    'white rice',
    'white bread',
    'bagel',
    'cornflakes',
    'waffle',
    'pancake',
    'soda',
    'juice',
    'candy',
    'pretzel',
    'instant oat',
    'fries',
    'baked potato',
    'mashed potato',
    'donut',
    'pastry',
    'sports drink',
    'glucose',
    'rice cake'
  ];

  const medGiKeywords = [
    'brown rice',
    'basmati',
    'oatmeal',
    'rolled oats',
    'banana',
    'sweet potato',
    'whole wheat',
    'sourdough',
    'pita',
    'couscous',
    'honey',
    'pineapple',
    'pasta',
    'noodle',
    'tortilla',
    'wrap'
  ];

  if (carbs <= 6) {
    return {
      level: 'Low GI',
      score: 18,
      badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30'
    };
  }

  if (highGiKeywords.some((k) => lower.includes(k))) {
    return {
      level: 'High GI',
      score: 76,
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    };
  }

  if (medGiKeywords.some((k) => lower.includes(k))) {
    return {
      level: 'Med GI',
      score: 58,
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    };
  }

  const ratio = carbs / Math.max(1, protein + fat);
  if (ratio > 2.5 && carbs >= 35) {
    return {
      level: 'High GI',
      score: 72,
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    };
  }
  if (ratio > 1.3 && carbs >= 20) {
    return {
      level: 'Med GI',
      score: 56,
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    };
  }

  return {
    level: 'Low GI',
    score: 38,
    badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30'
  };
}

export function detectAdditiveWarnings(text: string): AdditiveWarning[] {
  const lower = (text || '').toLowerCase();
  const warnings: AdditiveWarning[] = [];

  if (
    lower.includes('aspartame') ||
    lower.includes('diet ') ||
    lower.includes('zero sugar soda') ||
    lower.includes('sugar-free') ||
    lower.includes('acesulfame') ||
    lower.includes('sucralose')
  ) {
    warnings.push({
      additive: 'Aspartame / Artificial Sweetener',
      category: 'Artificial Sweetener',
      note: 'Common in diet sodas and sugar-free syrups; may trigger headaches or alter gut satiety signaling.'
    });
  }

  if (
    lower.includes('msg') ||
    lower.includes('monosodium glutamate') ||
    lower.includes('instant ramen') ||
    lower.includes('flavored chips') ||
    lower.includes('doritos') ||
    lower.includes('seasoning packet') ||
    lower.includes('bouillon')
  ) {
    warnings.push({
      additive: 'MSG (Monosodium Glutamate)',
      category: 'Flavor Enhancer',
      note: 'Free glutamate flavor enhancer; can drive hyper-palatability and sodium water retention.'
    });
  }

  if (
    lower.includes('red 40') ||
    lower.includes('yellow 5') ||
    lower.includes('yellow 6') ||
    lower.includes('blue 1') ||
    lower.includes('skittles') ||
    lower.includes('froot loops') ||
    lower.includes('sports drink') ||
    lower.includes('candy') ||
    lower.includes('artificial color') ||
    lower.includes('dye')
  ) {
    warnings.push({
      additive: 'Synthetic Food Dyes (Red 40 / Yellow 5)',
      category: 'Synthetic Dye',
      note: 'Petroleum-derived synthetic coloring found in bright beverages, cereals, and confections.'
    });
  }

  if (
    lower.includes('bacon') ||
    lower.includes('hot dog') ||
    lower.includes('salami') ||
    lower.includes('pepperoni') ||
    lower.includes('deli') ||
    lower.includes('nitrite') ||
    lower.includes('nitrate')
  ) {
    warnings.push({
      additive: 'Sodium Nitrite / Curing Salts',
      category: 'Preservative',
      note: 'Cured meat preservative; WHO recommends moderating processed nitrite-cured meats.'
    });
  }

  return warnings;
}

export function estimateMealCarbonKg(foodName: string, calories: number): number {
  const lower = (foodName || '').toLowerCase();
  const scale = Math.max(0.25, Math.min(3.0, (calories || 350) / 400));

  if (
    lower.includes('beef') ||
    lower.includes('steak') ||
    lower.includes('burger') ||
    lower.includes('lamb') ||
    lower.includes('brisket')
  ) {
    return Math.round(4.8 * scale * 100) / 100;
  }
  if (
    lower.includes('cheese') ||
    lower.includes('pork') ||
    lower.includes('bacon') ||
    lower.includes('shrimp') ||
    lower.includes('prawn')
  ) {
    return Math.round(2.1 * scale * 100) / 100;
  }
  if (
    lower.includes('chicken') ||
    lower.includes('turkey') ||
    lower.includes('salmon') ||
    lower.includes('tuna') ||
    lower.includes('cod') ||
    lower.includes('fish') ||
    lower.includes('egg') ||
    lower.includes('yogurt') ||
    lower.includes('whey')
  ) {
    return Math.round(1.15 * scale * 100) / 100;
  }
  return Math.round(0.38 * scale * 100) / 100;
}

export function estimateFoodOmega3Mg(foodName: string): number {
  const lower = (foodName || '').toLowerCase();
  if (lower.includes('salmon') || lower.includes('mackerel') || lower.includes('sardine')) return 2150;
  if (lower.includes('chia') || lower.includes('flax')) return 2400;
  if (lower.includes('walnut')) return 1800;
  if (lower.includes('tuna') || lower.includes('trout') || lower.includes('herring')) return 950;
  if (lower.includes('egg') || lower.includes('edamame') || lower.includes('hemp')) return 280;
  return 0;
}

export function getLowerCalorieSwap(item: DiaryEntry): LowerCalorieSwapOption {
  const lower = (item.name || '').toLowerCase();
  const currentCal = Math.max(120, item.calories || 350);

  if (lower.includes('burger') || lower.includes('beef') || lower.includes('steak')) {
    const newCal = Math.max(180, Math.round(currentCal * 0.68));
    return {
      name: 'Lean Turkey Smash Burger on Lettuce Wrap & Roasted Wedges',
      calories: newCal,
      protein: Math.max(item.protein, 36),
      carbs: Math.round(item.carbs * 0.75),
      fat: Math.max(6, Math.round(item.fat * 0.45)),
      savedCalories: Math.max(80, currentCal - newCal),
      reason: 'Swaps higher-fat beef and refined bun for 93% lean poultry while keeping protein high.'
    };
  }

  if (lower.includes('pizza') || lower.includes('pasta') || lower.includes('lasagna')) {
    const newCal = Math.max(220, Math.round(currentCal * 0.66));
    return {
      name: 'High-Protein Chickpea Pasta Marinara with Grilled Chicken',
      calories: newCal,
      protein: Math.max(item.protein + 8, 34),
      carbs: Math.round(item.carbs * 0.7),
      fat: Math.max(6, Math.round(item.fat * 0.5)),
      savedCalories: Math.max(90, currentCal - newCal),
      reason: 'Cuts heavy oil and cheese density while boosting fiber and protein satiety.'
    };
  }

  if (
    lower.includes('latte') ||
    lower.includes('frappuccino') ||
    lower.includes('muffin') ||
    lower.includes('croissant') ||
    lower.includes('pastry') ||
    lower.includes('donut')
  ) {
    const newCal = Math.max(110, Math.round(currentCal * 0.55));
    return {
      name: 'Iced Oat Americano + Greek Yogurt Berry Bowl',
      calories: newCal,
      protein: Math.max(item.protein + 14, 22),
      carbs: Math.round(item.carbs * 0.55),
      fat: Math.max(3, Math.round(item.fat * 0.35)),
      savedCalories: Math.max(90, currentCal - newCal),
      reason: 'Replaces refined pastry fats and syrup with slow-digesting Greek yogurt protein.'
    };
  }

  const newCal = Math.max(100, Math.round(currentCal * 0.72));
  return {
    name: `Lighter ${item.name.replace(/\s*\(Lighter Swap\)/i, '')} (High-Protein Swap)`,
    calories: newCal,
    protein: Math.max(item.protein + 4, Math.round((newCal * 0.38) / 4)),
    carbs: Math.round(item.carbs * 0.75),
    fat: Math.max(4, Math.round(item.fat * 0.6)),
    savedCalories: Math.max(45, currentCal - newCal),
    reason: 'Trims added cooking oils and starch volume while preserving lean protein.'
  };
}

export function getImmediateEatNowSuggestions(params: {
  remainingCalories: number;
  remainingProtein: number;
  allDiaryItems: DiaryEntry[];
  hourOfDay: number;
}): Array<{
  name: string;
  mealType: MealType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  tag: string;
}> {
  const { remainingCalories, remainingProtein, allDiaryItems, hourOfDay } = params;
  const targetMealType: MealType =
    hourOfDay < 11 ? 'breakfast' : hourOfDay < 15 ? 'lunch' : hourOfDay < 21 ? 'dinner' : 'snack';

  const capCal = Math.max(180, Math.min(750, remainingCalories > 150 ? remainingCalories : 350));

  // Personalized from user's own history first
  const seen = new Map<string, DiaryEntry>();
  for (const entry of allDiaryItems) {
    const key = entry.name.toLowerCase().trim();
    if (!seen.has(key) && entry.calories >= 120 && entry.calories <= capCal + 80 && entry.protein >= 12) {
      seen.set(key, entry);
    }
  }

  const fromHistory = Array.from(seen.values())
    .slice(0, 2)
    .map((h) => ({
      name: h.name,
      mealType: targetMealType,
      calories: h.calories,
      protein: h.protein,
      carbs: h.carbs,
      fat: h.fat,
      tag: 'From your history'
    }));

  const smartDefaults = [
    {
      name: 'Grilled Lemon Herb Chicken, Quinoa & Steamed Greens',
      mealType: targetMealType,
      calories: Math.min(capCal, 460),
      protein: Math.max(38, Math.min(55, remainingProtein)),
      carbs: 42,
      fat: 11,
      tag: 'Low GI · High Protein'
    },
    {
      name: 'Wild Salmon Bowl with Edamame, Brown Rice & Cucumber',
      mealType: targetMealType,
      calories: Math.min(capCal, 510),
      protein: 36,
      carbs: 46,
      fat: 16,
      tag: 'Rich in Omega-3 (2,150mg)'
    },
    {
      name: '0% Greek Yogurt, Chia Seeds, Walnuts & Fresh Berries',
      mealType: targetMealType,
      calories: Math.min(capCal, 290),
      protein: 26,
      carbs: 24,
      fat: 9,
      tag: 'Fast 2-min prep · Low GI'
    }
  ];

  return [...fromHistory, ...smartDefaults].slice(0, 3);
}
