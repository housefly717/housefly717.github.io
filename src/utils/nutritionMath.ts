import type { UserProfile, MacroTarget } from '../types/index.js';

export function calculateDailyCalorieTarget(profile: UserProfile): number {
  const { gender, currentWeightKg, heightCm, age, bodyFatPercent, dailyActivity, goalSpeed } = profile;

  let bmr: number;
  if (bodyFatPercent && bodyFatPercent > 3 && bodyFatPercent < 60) {
    // Katch-McArdle formula
    const leanMass = currentWeightKg * (1 - bodyFatPercent / 100);
    bmr = 370 + 21.6 * leanMass;
  } else {
    // Mifflin-St Jeor
    if (gender === 'male') {
      bmr = 10 * currentWeightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * currentWeightKg + 6.25 * heightCm - 5 * age - 161;
    }
  }

  // Activity multipliers
  const activityMultipliers: Record<UserProfile['dailyActivity'], number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };

  const tdee = bmr * (activityMultipliers[dailyActivity] || 1.2);

  // Goal speed adjustments
  const speedAdjustments: Record<UserProfile['goalSpeed'], number> = {
    lose_slow: -250,
    lose_normal: -500,
    lose_fast: -750,
    maintain: 0,
    gain_slow: 250,
    gain_normal: 500
  };

  let target = tdee + (speedAdjustments[goalSpeed] || 0);

  // Floor at 1200 for women, 1500 for men
  const floor = gender === 'male' ? 1500 : 1200;
  if (target < floor) {
    target = floor;
  }

  return Math.round(target);
}

/**
 * Auto-calculate macros from the calorie goal:
 * Fat = 30% of target ÷ 9
 * Protein = 30% of target ÷ 4
 * Carbs = 40% of target ÷ 4
 * The three percentages must add to 100%. Grams × 4/4/9 must equal the target exactly.
 * Handle the 9 kcal/g rounding by nudging fat by 1–2 grams so carbs divide cleanly by 4.
 */
export function calculateMacroTargets(targetCalories: number): MacroTarget {
  const target = targetCalories;

  // Initial target calories per macro
  const targetFatKcal = target * 0.30;
  const targetProteinKcal = target * 0.30;
  const targetCarbsKcal = target * 0.40;

  let proteinGrams = Math.round(targetProteinKcal / 4);
  let fatGrams = Math.round(targetFatKcal / 9);

  // Remainder for carbs
  let remainingKcal = target - (proteinGrams * 4 + fatGrams * 9);
  let carbsGrams = Math.round(remainingKcal / 4);

  // Exact adjustment: (proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4) === target
  let currentTotal = proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4;
  let diff = target - currentTotal;

  // Nudge fat or carbs by 1-2 to make grams * 4/4/9 exactly match target
  let attempts = 0;
  while (diff !== 0 && attempts < 20) {
    attempts++;
    if (diff % 4 === 0) {
      carbsGrams += diff / 4;
      break;
    } else {
      // Nudge fat by 1g (+9 or -9 kcal) and recompute carbs
      if (diff > 0) {
        fatGrams += 1;
      } else {
        fatGrams = Math.max(10, fatGrams - 1);
      }
      currentTotal = proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4;
      diff = target - currentTotal;
    }
  }

  // Final check
  currentTotal = proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4;
  if (currentTotal !== target) {
    carbsGrams = Math.max(0, Math.floor((target - (proteinGrams * 4 + fatGrams * 9)) / 4));
    const remainder = target - (proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4);
    if (remainder > 0) {
      proteinGrams += Math.floor(remainder / 4);
    }
  }

  return {
    calories: target,
    carbsGrams,
    fatGrams,
    proteinGrams,
    carbsPct: 40,
    fatPct: 30,
    proteinPct: 30
  };
}

/**
 * Calculates projected goal date based on weight difference and daily deficit/surplus
 */
export function calculateProjectedGoalDate(profile: UserProfile): string {
  const diffKg = profile.goalWeightKg - profile.currentWeightKg;
  if (Math.abs(diffKg) < 0.2) {
    return 'Goal reached (maintaining)';
  }

  const speedAdjustments: Record<UserProfile['goalSpeed'], number> = {
    lose_slow: -250,
    lose_normal: -500,
    lose_fast: -750,
    maintain: 0,
    gain_slow: 250,
    gain_normal: 500
  };

  const dailyCals = speedAdjustments[profile.goalSpeed];
  if (dailyCals === 0) {
    return 'Maintaining current weight';
  }

  // 1 kg body mass ~ 7700 kcal
  const totalKcalNeeded = Math.abs(diffKg) * 7700;
  const daysNeeded = Math.ceil(totalKcalNeeded / Math.abs(dailyCals));

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysNeeded);

  return targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }) + ` (~${daysNeeded} days)`;
}

export function formatWeight(kg: number, unitSystem: 'metric' | 'imperial'): string {
  if (unitSystem === 'imperial') {
    const lbs = Math.round(kg * 2.20462 * 10) / 10;
    return `${lbs} lbs`;
  }
  return `${Math.round(kg * 10) / 10} kg`;
}
