import type { UserProfile, MacroTarget } from '../types/index.js';

export function hasCompleteProfileStats(profile?: UserProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.name &&
      profile.name.trim().length > 0 &&
      profile.age >= 13 &&
      profile.age <= 120 &&
      profile.heightCm > 0 &&
      profile.currentWeightKg > 0 &&
      profile.goalWeightKg > 0 &&
      (profile.gender === 'male' ||
        profile.gender === 'female' ||
        profile.gender === 'prefer_not_to_say') &&
      profile.dailyActivity &&
      profile.goalSpeed
  );
}

function computeRawBmr(profile: UserProfile): number {
  const { gender, currentWeightKg, heightCm, age, bodyFatPercent } = profile;

  if (bodyFatPercent && bodyFatPercent > 3 && bodyFatPercent < 60) {
    // Katch-McArdle formula
    const leanMass = currentWeightKg * (1 - bodyFatPercent / 100);
    return 370 + 21.6 * leanMass;
  }

  // Mifflin-St Jeor formula
  const base = 10 * currentWeightKg + 6.25 * heightCm - 5 * age;
  if (gender === 'male') {
    return base + 5;
  }
  if (gender === 'female') {
    return base - 161;
  }
  // Prefer not to say: average of male (+5) and female (-161) formulas = -78
  return base - 78;
}

export function calculateBmr(profile: UserProfile): number {
  if (!hasCompleteProfileStats(profile)) {
    return 0;
  }
  return Math.round(computeRawBmr(profile));
}

export function calculateMaintenanceCalories(profile: UserProfile): number {
  if (!hasCompleteProfileStats(profile)) {
    return 0;
  }
  const bmr = computeRawBmr(profile);
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };
  const multiplier = activityMultipliers[profile.dailyActivity];
  if (!multiplier) return 0;
  return Math.round(bmr * multiplier);
}

export function calculateDailyCalorieTarget(profile: UserProfile): number {
  if (!hasCompleteProfileStats(profile)) {
    return 0;
  }

  const { gender, dailyActivity, goalSpeed } = profile;
  const bmr = computeRawBmr(profile);

  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    athlete: 1.9
  };

  const multiplier = activityMultipliers[dailyActivity];
  if (!multiplier) return 0;

  const tdee = bmr * multiplier;

  const speedAdjustments: Record<string, number> = {
    lose_slow: -250,
    lose_normal: -500,
    lose_fast: -750,
    maintain: 0,
    gain_slow: 250,
    gain_normal: 500
  };

  if (!goalSpeed || !(goalSpeed in speedAdjustments)) {
    return 0;
  }

  let target = tdee + speedAdjustments[goalSpeed];

  // Floor at 1200 for women, 1500 for men, 1350 (average) for prefer_not_to_say
  const floor = gender === 'male' ? 1500 : gender === 'female' ? 1200 : 1350;
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
  if (!target || target <= 0) {
    return {
      calories: 0,
      carbsGrams: 0,
      fatGrams: 0,
      proteinGrams: 0,
      carbsPct: 40,
      fatPct: 30,
      proteinPct: 30
    };
  }

  const targetFatKcal = target * 0.30;
  const targetProteinKcal = target * 0.30;

  let proteinGrams = Math.round(targetProteinKcal / 4);
  let fatGrams = Math.round(targetFatKcal / 9);

  let remainingKcal = target - (proteinGrams * 4 + fatGrams * 9);
  let carbsGrams = Math.round(remainingKcal / 4);

  let currentTotal = proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4;
  let diff = target - currentTotal;

  let attempts = 0;
  while (diff !== 0 && attempts < 20) {
    attempts++;
    if (diff % 4 === 0) {
      carbsGrams += diff / 4;
      break;
    } else {
      if (diff > 0) {
        fatGrams += 1;
      } else {
        fatGrams = Math.max(10, fatGrams - 1);
      }
      currentTotal = proteinGrams * 4 + fatGrams * 9 + carbsGrams * 4;
      diff = target - currentTotal;
    }
  }

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
 * Calculates projected goal date based on weight difference and daily deficit/surplus.
 * Never invents numbers if required stats are incomplete.
 */
export function calculateProjectedGoalDate(profile: UserProfile): string {
  if (!hasCompleteProfileStats(profile) || !profile.goalWeightKg || profile.goalWeightKg <= 0) {
    return '';
  }

  const diffKg = profile.goalWeightKg - profile.currentWeightKg;
  if (Math.abs(diffKg) < 0.2 || profile.goalSpeed === 'maintain') {
    return 'Maintaining current weight';
  }

  const speedAdjustments: Record<string, number> = {
    lose_slow: -250,
    lose_normal: -500,
    lose_fast: -750,
    maintain: 0,
    gain_slow: 250,
    gain_normal: 500
  };

  const dailyCals = speedAdjustments[profile.goalSpeed];
  if (!dailyCals) {
    return '';
  }

  // 1 kg body mass ~ 7700 kcal
  const totalKcalNeeded = Math.abs(diffKg) * 7700;
  const daysNeeded = Math.ceil(totalKcalNeeded / Math.abs(dailyCals));

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysNeeded);

  return (
    targetDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ` (~${daysNeeded} days)`
  );
}

export function formatWeight(kg: number, unitSystem: 'metric' | 'imperial'): string {
  if (unitSystem === 'imperial') {
    const lbs = Math.round(kg * 2.20462 * 10) / 10;
    return `${lbs} lbs`;
  }
  return `${Math.round(kg * 10) / 10} kg`;
}
