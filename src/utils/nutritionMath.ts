import type { UserProfile, MacroTarget, WeightRecord } from '../types/index.js';

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
    lose_aggressive: -1000,
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

export interface ProjectedGoalDetails {
  dateText: string;
  daysNeeded: number;
  basisLabel: 'Based on your last 2 weeks' | 'Based on your goal speed' | '';
  usedActualTrend: boolean;
  ratePerWeekKg: number;
  isCappedAtTwoYears: boolean;
  cappedNote: string;
  whyText: string;
}

/**
 * Calculates projected goal date details, adapting to the user's actual weight trend
 * if they have 2 or more weigh-ins in the last 14 days (unless overridden by goal speed),
 * and capping projections at 2 years (730 days).
 * Formula:
 * weeks = |current weight − goal weight| ÷ rate per week
 * days = weeks × 7
 * projected date = today + days
 */
export function calculateProjectedGoalDetails(
  profile: UserProfile,
  weights: WeightRecord[] = [],
  forceGoalSpeedOverride: boolean = false
): ProjectedGoalDetails {
  const emptyResult: ProjectedGoalDetails = {
    dateText: '',
    daysNeeded: 0,
    basisLabel: '',
    usedActualTrend: false,
    ratePerWeekKg: 0,
    isCappedAtTwoYears: false,
    cappedNote: '',
    whyText: 'We use your recent weigh-ins to project. Change your goal speed in the Me tab to override.'
  };

  if (!hasCompleteProfileStats(profile) || !profile.goalWeightKg || profile.goalWeightKg <= 0) {
    return emptyResult;
  }

  const weeklyRateBySpeed: Record<string, number> = {
    lose_slow: 0.25,
    lose_normal: 0.5,
    lose_fast: 0.75,
    lose_aggressive: 1.0,
    maintain: 0,
    gain_slow: 0.25,
    gain_normal: 0.5
  };

  // Filter weigh-ins in the last 14 days
  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(today.getDate() - 14);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  const recentWeighIns = [...(weights || [])]
    .filter((w) => w && typeof w.weightKg === 'number' && w.weightKg > 0 && w.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));

  const latestWeighInCreatedAt =
    recentWeighIns.length > 0
      ? Math.max(...recentWeighIns.map((w) => w.createdAt || 0))
      : 0;

  const isOverriddenByGoalSpeed =
    forceGoalSpeedOverride ||
    Boolean(
      profile.goalSpeedOverriddenAt &&
        latestWeighInCreatedAt > 0 &&
        profile.goalSpeedOverriddenAt > latestWeighInCreatedAt
    );

  // Effective current weight: use most recent weigh-in from last 14 days if using trend, else profile.currentWeightKg
  const effectiveCurrentWeightKg =
    !isOverriddenByGoalSpeed && recentWeighIns.length >= 2
      ? recentWeighIns[recentWeighIns.length - 1].weightKg
      : profile.currentWeightKg;

  const diffKg = Math.abs(effectiveCurrentWeightKg - profile.goalWeightKg);
  if (diffKg < 0.1 || profile.goalSpeed === 'maintain') {
    return {
      ...emptyResult,
      dateText: 'Maintaining current weight',
      basisLabel: 'Based on your goal speed'
    };
  }

  const formulaRate = weeklyRateBySpeed[profile.goalSpeed] || 0;
  let usedActualTrend = false;
  let ratePerWeek = formulaRate;
  let rawDaysNeeded = 0;

  if (!isOverriddenByGoalSpeed && recentWeighIns.length >= 2) {
    usedActualTrend = true;
    const first = recentWeighIns[0];
    const last = recentWeighIns[recentWeighIns.length - 1];
    const firstMs = new Date(first.date + 'T00:00:00').getTime();
    const lastMs = new Date(last.date + 'T00:00:00').getTime();
    const rawSpanDays = Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24));
    const spanDays = rawSpanDays > 0 ? rawSpanDays : 14;

    const isGoalLoss = profile.goalWeightKg < effectiveCurrentWeightKg;
    const changeTowardGoalKg = isGoalLoss
      ? first.weightKg - last.weightKg
      : last.weightKg - first.weightKg;

    const actualRatePerWeek = (changeTowardGoalKg / spanDays) * 7;
    if (actualRatePerWeek > 0) {
      ratePerWeek = Math.round(actualRatePerWeek * 100) / 100;
      const weeks = diffKg / actualRatePerWeek;
      rawDaysNeeded = Math.max(1, Math.round(weeks * 7));
    } else {
      ratePerWeek = 0;
      rawDaysNeeded = 731; // Triggers 2-year cap when trend is flat or moving away from goal
    }
  } else {
    if (!formulaRate || formulaRate <= 0) {
      return emptyResult;
    }
    const weeks = diffKg / formulaRate;
    rawDaysNeeded = Math.max(1, Math.round(weeks * 7));
  }

  const MAX_DAYS_TWO_YEARS = 730;
  const isCappedAtTwoYears = rawDaysNeeded > MAX_DAYS_TWO_YEARS;
  const daysNeeded = isCappedAtTwoYears ? MAX_DAYS_TWO_YEARS : rawDaysNeeded;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysNeeded);

  const formattedDate =
    targetDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }) + ` (~${daysNeeded} days)`;

  return {
    dateText: formattedDate,
    daysNeeded,
    basisLabel: usedActualTrend ? 'Based on your last 2 weeks' : 'Based on your goal speed',
    usedActualTrend,
    ratePerWeekKg: ratePerWeek,
    isCappedAtTwoYears,
    cappedNote: isCappedAtTwoYears ? 'Long-term trend — keep logging to refine.' : '',
    whyText: 'We use your recent weigh-ins to project. Change your goal speed in the Me tab to override.'
  };
}

/**
 * Calculates projected goal date based on weight difference and weekly rate:
 * weeks = |current weight − goal weight| ÷ rate per week
 * days = weeks × 7
 * projected date = today + days
 * Never invents numbers if required stats are incomplete.
 */
export function calculateProjectedGoalDate(
  profile: UserProfile,
  weights: WeightRecord[] = [],
  forceGoalSpeedOverride: boolean = false
): string {
  return calculateProjectedGoalDetails(profile, weights, forceGoalSpeedOverride).dateText;
}

export function formatWeight(kg: number, unitSystem: 'metric' | 'imperial'): string {
  if (unitSystem === 'imperial') {
    const lbs = Math.round(kg * 2.20462 * 10) / 10;
    return `${lbs} lbs`;
  }
  return `${Math.round(kg * 10) / 10} kg`;
}
