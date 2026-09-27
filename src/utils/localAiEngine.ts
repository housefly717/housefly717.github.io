export interface DecipheredExerciseSegment {
  description: string;
  activityName: string;
  minutes: number;
  met: number;
  intensity: 'Low' | 'Moderate' | 'High';
  caloriesBurned: number;
  distanceKm?: number;
  weightKg?: number;
  reps?: number;
}

export interface DecipheredExerciseResult {
  summaryTitle: string;
  totalMinutes: number;
  averageMet: number;
  overallIntensity: 'Low' | 'Moderate' | 'High';
  totalCaloriesBurned: number;
  segments: DecipheredExerciseSegment[];
  explanation: string;
}

export interface DecipheredFoodItem {
  rawText: string;
  name: string;
  grams: number;
  needsWeightConfirmation?: boolean;
  isOver5kg?: boolean;
  kgAmount?: number;
  suggestedGrams?: number;
  over5kgWarning?: string;
  servingLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodiumMg: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumMgPer100g: number;
  category: 'produce' | 'protein' | 'dairy' | 'grain' | 'fat' | 'seasoning' | 'processed' | 'beverage';
}

export interface DecipheredFoodResult {
  mealSummaryName: string;
  items: DecipheredFoodItem[];
  needsWeightConfirmation: boolean;
  hasItemOver5kg: boolean;
  isOver5000Kcal: boolean;
  over5000KcalWarning?: string;
  isExtremeCalorieMeal: boolean;
  usedFallbackReference: boolean;
  referenceDailyGoal: number;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  totalSugar: number;
  totalSodiumMg: number;
  healthRating: number; // 1 to 10
  healthLabel: string;
  whatToAdd: string[];
  whatToTakeOut: string[];
}

interface ExercisePattern {
  keywords: RegExp;
  label: string;
  met: number;
  intensity: 'Low' | 'Moderate' | 'High';
}

const EXERCISE_PATTERNS: ExercisePattern[] = [
  { keywords: /\b(sprint|sprinting|all[- ]out run|fast interval|hiit|tabata|burpee|circuit training|crossfit)\b/i, label: 'High-Intensity Intervals / Sprints', met: 10.5, intensity: 'High' },
  { keywords: /\b(run|running|steady run|tempo run|fast jog|10\s*km\/h|12\s*km\/h|5k|10k)\b/i, label: 'Steady-Pace Running', met: 9.8, intensity: 'High' },
  { keywords: /\b(slow jog|light jog|easy jog|warm[- ]?up jog|jogging|jog)\b/i, label: 'Slow / Moderate Jog', met: 7.0, intensity: 'Moderate' },
  { keywords: /\b(walking interval|walk interval|brisk walk|power walk|incline walk|fast walk|hiking|hike)\b/i, label: 'Brisk Walking Intervals', met: 4.5, intensity: 'Moderate' },
  { keywords: /\b(slow walk|cool[- ]?down walk|stroll|casual walk|walking|walk)\b/i, label: 'Walking', met: 3.5, intensity: 'Low' },
  { keywords: /\b(spin|spinning|peloton|vigorous cycl|fast bike|road cycling)\b/i, label: 'Vigorous Cycling', met: 9.0, intensity: 'High' },
  { keywords: /\b(cycl|bike|biking|stationary bike)\b/i, label: 'Cycling', met: 7.5, intensity: 'Moderate' },
  { keywords: /\b(swim|swimming|laps|freestyle)\b/i, label: 'Swimming Laps', met: 8.0, intensity: 'High' },
  { keywords: /\b(row|rowing|erg)\b/i, label: 'Rowing Machine', met: 7.5, intensity: 'High' },
  { keywords: /\b(jump rope|skipping|box jump|plyo)\b/i, label: 'Jump Rope / Plyometrics', met: 10.0, intensity: 'High' },
  { keywords: /\b(stair|stairmaster|stepmill|elliptical)\b/i, label: 'Stair Climber / Elliptical', met: 8.0, intensity: 'High' },
  { keywords: /\b(heavy lift|powerlift|deadlift|squat|bench press|barbell|strength training|weightlifting|weights|lifting|dumbbell|kettlebell|resistance)\b/i, label: 'Strength & Weight Training', met: 5.5, intensity: 'Moderate' },
  { keywords: /\b(push[- ]?up|pull[- ]?up|calisthenics|bodyweight|core|ab|abs|plank|sit[- ]?up|crunch|lunge)\b/i, label: 'Bodyweight & Core Conditioning', met: 4.8, intensity: 'Moderate' },
  { keywords: /\b(pilates|barre)\b/i, label: 'Pilates / Core Control', met: 3.8, intensity: 'Low' },
  { keywords: /\b(yoga|stretch|stretching|mobility|foam roll|warm[- ]?up|cool[- ]?down)\b/i, label: 'Yoga & Mobility Flow', met: 3.0, intensity: 'Low' },
  { keywords: /\b(boxing|kickboxing|mma|sparring|heavy bag)\b/i, label: 'Boxing / Conditioning', met: 8.5, intensity: 'High' },
  { keywords: /\b(tennis|basketball|soccer|football|badminton|squash|pickleball|racquet)\b/i, label: 'Court / Field Sport', met: 7.8, intensity: 'High' },
  { keywords: /\b(dance|dancing|zumba|aerobics)\b/i, label: 'Dance / Aerobic Session', met: 6.5, intensity: 'Moderate' }
];

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  half: 0.5,
  quarter: 0.25
};

/**
 * Splits a natural-language workout entry into distinct timed/activity clauses.
 * Handles both comma/conjunction separated inputs AND run-on inputs like:
 * "slow jog for 2 min jog 10 min walking intervals for 24 min"
 */
function splitExerciseClauses(rawText: string): string[] {
  const normalized = rawText
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  // First split by explicit separators: commas, semicolons, newlines, "followed by", "then", "and then", "+"
  const primaryParts = normalized
    .split(/(?:[,;\n+]+|\b(?:followed by|and then|then|after that|plus)\b)/i)
    .map(s => s.trim())
    .filter(Boolean);

  const finalClauses: string[] = [];

  for (const part of primaryParts) {
    // Check if this part contains multiple duration expressions (e.g. "slow jog for 2 min jog 10 min walking intervals for 24 min")
    const durationTokens = Array.from(
      part.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/gi)
    );

    if (durationTokens.length <= 1) {
      // Also try splitting on " and " if both sides have activity words
      const andParts = part.split(/\band\b/i).map(s => s.trim()).filter(Boolean);
      if (andParts.length > 1 && andParts.every(p => /\d/.test(p) || EXERCISE_PATTERNS.some(ep => ep.keywords.test(p)))) {
        finalClauses.push(...andParts);
      } else {
        finalClauses.push(part);
      }
      continue;
    }

    // If multiple durations exist in a single run-on string, determine whether duration comes BEFORE or AFTER activity
    // e.g. Pattern A: "2 min slow jog 10 min run 24 min walk" (number at start)
    // e.g. Pattern B: "slow jog for 2 min jog 10 min walking intervals for 24 min" (duration at end of each phrase)
    const startsWithDuration = /^\d+(?:\.\d+)?\s*(?:hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|sec|s)\b/i.test(part);

    if (startsWithDuration) {
      // Split right before each duration token
      let lastIdx = 0;
      for (let i = 1; i < durationTokens.length; i++) {
        const idx = durationTokens[i].index ?? 0;
        const slice = part.slice(lastIdx, idx).trim();
        if (slice) finalClauses.push(slice);
        lastIdx = idx;
      }
      const tail = part.slice(lastIdx).trim();
      if (tail) finalClauses.push(tail);
    } else {
      // Duration concludes each segment: slice after each duration token
      let lastIdx = 0;
      for (let i = 0; i < durationTokens.length; i++) {
        const match = durationTokens[i];
        const endIdx = (match.index ?? 0) + match[0].length;
        const slice = part.slice(lastIdx, endIdx).trim();
        if (slice) finalClauses.push(slice);
        lastIdx = endIdx;
      }
      const tail = part.slice(lastIdx).trim();
      if (tail && finalClauses.length > 0) {
        finalClauses[finalClauses.length - 1] += ` ${tail}`;
      } else if (tail) {
        finalClauses.push(tail);
      }
    }
  }

  return finalClauses.filter(Boolean);
}

function extractDurationMinutes(clause: string): number {
  let totalMinutes = 0;
  let matchedTime = false;

  // Hours
  const hrMatches = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/gi));
  for (const m of hrMatches) {
    totalMinutes += parseFloat(m[1]) * 60;
    matchedTime = true;
  }

  // Minutes
  const minMatches = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m)\b/gi));
  for (const m of minMatches) {
    totalMinutes += parseFloat(m[1]);
    matchedTime = true;
  }

  // Seconds
  const secMatches = Array.from(clause.matchAll(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|sec|s)\b/gi));
  for (const m of secMatches) {
    totalMinutes += parseFloat(m[1]) / 60;
    matchedTime = true;
  }

  if (matchedTime && totalMinutes > 0) {
    return Math.max(0.5, Math.round(totalMinutes * 10) / 10);
  }

  // Check distance (e.g., "5km run" or "3 miles walk")
  const kmMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:km|kilometers?)\b/i);
  if (kmMatch) {
    const km = parseFloat(kmMatch[1]);
    const isWalk = /\bwalk/i.test(clause);
    return Math.round(km * (isWalk ? 11 : 6));
  }

  const mileMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i);
  if (mileMatch) {
    const mi = parseFloat(mileMatch[1]);
    const isWalk = /\bwalk/i.test(clause);
    return Math.round(mi * (isWalk ? 17 : 9.5));
  }

  // Check sets x reps (e.g., "4 sets of 10 squats")
  const setsMatch = clause.match(/(\d+)\s*sets?/i);
  if (setsMatch) {
    return Math.max(5, parseInt(setsMatch[1], 10) * 3);
  }

  // Fallback bare number in clause
  const bareNum = clause.match(/\b(\d+(?:\.\d+)?)\b/);
  if (bareNum) {
    return Math.max(1, parseFloat(bareNum[1]));
  }

  return 15; // default 15 mins if unspecified
}

export function decipherExerciseText(rawInput: string, userWeightKg = 70): DecipheredExerciseResult {
  const weight = userWeightKg > 20 ? userWeightKg : 70;
  const clauses = splitExerciseClauses(rawInput);

  if (clauses.length === 0) {
    return {
      summaryTitle: 'Workout Session',
      totalMinutes: 0,
      averageMet: 0,
      overallIntensity: 'Low',
      totalCaloriesBurned: 0,
      segments: [],
      explanation: 'Type your workout above to calculate calories burned.'
    };
  }

  const segments: DecipheredExerciseSegment[] = clauses.map((clause) => {
    const minutes = extractDurationMinutes(clause);

    // Find matching exercise pattern
    let matchedPattern: ExercisePattern = {
      keywords: /.*/,
      label: 'General Conditioning',
      met: 5.5,
      intensity: 'Moderate'
    };

    for (const pattern of EXERCISE_PATTERNS) {
      if (pattern.keywords.test(clause)) {
        matchedPattern = pattern;
        break;
      }
    }

    // Intensity modifiers in user text
    let met = matchedPattern.met;
    let intensity = matchedPattern.intensity;
    if (/\b(slow|easy|light|gentle|warm[- ]?up|cool[- ]?down|recovery)\b/i.test(clause)) {
      met = Math.max(2.5, Math.round((met * 0.85) * 10) / 10);
      if (met < 4.5) intensity = 'Low';
    } else if (/\b(fast|hard|heavy|intense|vigorous|incline|uphill|sprint|max)\b/i.test(clause)) {
      met = Math.round((met * 1.18) * 10) / 10;
      if (met >= 7.5) intensity = 'High';
    }

    const caloriesBurned = Math.max(1, Math.round(met * weight * (minutes / 60)));

    // Optional distance / weight extraction
    const kmMatch = clause.match(/(\d+(?:\.\d+)?)\s*km\b/i);
    const kgMatch = clause.match(/(\d+(?:\.\d+)?)\s*kg\b/i);
    const repsMatch = clause.match(/(\d+)\s*reps?\b/i);

    return {
      description: clause,
      activityName: matchedPattern.label,
      minutes,
      met,
      intensity,
      caloriesBurned,
      distanceKm: kmMatch ? parseFloat(kmMatch[1]) : undefined,
      weightKg: kgMatch ? parseFloat(kgMatch[1]) : undefined,
      reps: repsMatch ? parseInt(repsMatch[1], 10) : undefined
    };
  });

  const totalMinutes = Math.round(segments.reduce((acc, s) => acc + s.minutes, 0) * 10) / 10;
  const totalCaloriesBurned = segments.reduce((acc, s) => acc + s.caloriesBurned, 0);
  const weightedMet = totalMinutes > 0
    ? Math.round((segments.reduce((acc, s) => acc + s.met * s.minutes, 0) / totalMinutes) * 10) / 10
    : 5.0;

  const overallIntensity: 'Low' | 'Moderate' | 'High' =
    weightedMet >= 7.5 ? 'High' : weightedMet >= 4.5 ? 'Moderate' : 'Low';

  const uniqueNames = Array.from(new Set(segments.map(s => s.activityName)));
  const summaryTitle =
    uniqueNames.length === 1
      ? `${uniqueNames[0]} (${totalMinutes} min)`
      : uniqueNames.length === 2
      ? `${uniqueNames[0]} & ${uniqueNames[1]}`
      : `${uniqueNames[0]} + ${uniqueNames.length - 1} Interval Phases`;

  return {
    summaryTitle,
    totalMinutes,
    averageMet: weightedMet,
    overallIntensity,
    totalCaloriesBurned,
    segments,
    explanation: `Deciphered ${segments.length} activity segment${segments.length > 1 ? 's' : ''} (${totalMinutes} mins total at ${weightedMet} avg MET for ${weight} kg body weight).`
  };
}

// ============================================================================
// IN-CODE FOOD DECIPHERER & NUTRITIONAL HEALTH ANALYZER
// ============================================================================

interface LocalFoodEntry {
  name: string;
  keywords: string[];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumMgPer100g: number;
  defaultGrams: number;
  defaultUnitLabel: string;
  category: DecipheredFoodItem['category'];
}

const LOCAL_FOOD_DB: LocalFoodEntry[] = [
  // Fruits
  {
    name: 'Mango',
    keywords: ['mango', 'mangos', 'mangoes', 'fresh mango', 'sliced mango'],
    caloriesPer100g: 60,
    proteinPer100g: 0.8,
    carbsPer100g: 15.0,
    fatPer100g: 0.4,
    fiberPer100g: 1.6,
    sugarPer100g: 13.7,
    sodiumMgPer100g: 1,
    defaultGrams: 150,
    defaultUnitLabel: '1 cup sliced',
    category: 'produce'
  },
  {
    name: 'Banana',
    keywords: ['banana', 'bananas', 'bannana'],
    caloriesPer100g: 89,
    proteinPer100g: 1.1,
    carbsPer100g: 22.8,
    fatPer100g: 0.3,
    fiberPer100g: 2.6,
    sugarPer100g: 12.2,
    sodiumMgPer100g: 1,
    defaultGrams: 120,
    defaultUnitLabel: '1 banana (120g)',
    category: 'produce'
  },
  {
    name: 'Apple',
    keywords: ['apple', 'apples', 'green apple', 'red apple'],
    caloriesPer100g: 52,
    proteinPer100g: 0.3,
    carbsPer100g: 13.8,
    fatPer100g: 0.2,
    fiberPer100g: 2.4,
    sugarPer100g: 10.4,
    sodiumMgPer100g: 1,
    defaultGrams: 180,
    defaultUnitLabel: '1 apple (180g)',
    category: 'produce'
  },
  {
    name: 'Raspberries',
    keywords: ['raspberry', 'raspberries', 'rasberry', 'rasberries'],
    caloriesPer100g: 52,
    proteinPer100g: 1.2,
    carbsPer100g: 11.9,
    fatPer100g: 0.7,
    fiberPer100g: 6.5,
    sugarPer100g: 4.4,
    sodiumMgPer100g: 1,
    defaultGrams: 4,
    defaultUnitLabel: '1 raspberry (4g)',
    category: 'produce'
  },
  {
    name: 'Blueberries',
    keywords: ['blueberry', 'blueberries'],
    caloriesPer100g: 57,
    proteinPer100g: 0.7,
    carbsPer100g: 14.5,
    fatPer100g: 0.3,
    fiberPer100g: 2.4,
    sugarPer100g: 10.0,
    sodiumMgPer100g: 1,
    defaultGrams: 2,
    defaultUnitLabel: '1 blueberry (2g)',
    category: 'produce'
  },
  {
    name: 'Strawberries',
    keywords: ['strawberry', 'strawberries'],
    caloriesPer100g: 32,
    proteinPer100g: 0.7,
    carbsPer100g: 7.7,
    fatPer100g: 0.3,
    fiberPer100g: 2.0,
    sugarPer100g: 4.9,
    sodiumMgPer100g: 1,
    defaultGrams: 12,
    defaultUnitLabel: '1 strawberry (12g)',
    category: 'produce'
  },
  {
    name: 'Blackberries',
    keywords: ['blackberry', 'blackberries'],
    caloriesPer100g: 43,
    proteinPer100g: 1.4,
    carbsPer100g: 9.6,
    fatPer100g: 0.5,
    fiberPer100g: 5.3,
    sugarPer100g: 4.9,
    sodiumMgPer100g: 1,
    defaultGrams: 5,
    defaultUnitLabel: '1 blackberry (5g)',
    category: 'produce'
  },
  {
    name: 'Cherries',
    keywords: ['cherry', 'cherries'],
    caloriesPer100g: 63,
    proteinPer100g: 1.1,
    carbsPer100g: 16.0,
    fatPer100g: 0.2,
    fiberPer100g: 2.1,
    sugarPer100g: 12.8,
    sodiumMgPer100g: 0,
    defaultGrams: 8,
    defaultUnitLabel: '1 cherry (8g)',
    category: 'produce'
  },
  {
    name: 'Avocado',
    keywords: ['avocado', 'avocados', 'avacado', 'guacamole'],
    caloriesPer100g: 160,
    proteinPer100g: 2.0,
    carbsPer100g: 8.5,
    fatPer100g: 14.7,
    fiberPer100g: 6.7,
    sugarPer100g: 0.7,
    sodiumMgPer100g: 7,
    defaultGrams: 140,
    defaultUnitLabel: '1 whole',
    category: 'produce'
  },
  {
    name: 'Orange',
    keywords: ['orange', 'oranges', 'mandarin', 'clementine'],
    caloriesPer100g: 47,
    proteinPer100g: 0.9,
    carbsPer100g: 11.8,
    fatPer100g: 0.1,
    fiberPer100g: 2.4,
    sugarPer100g: 9.4,
    sodiumMgPer100g: 0,
    defaultGrams: 150,
    defaultUnitLabel: '1 orange (150g)',
    category: 'produce'
  },
  {
    name: 'Pineapple',
    keywords: ['pineapple', 'pineapples'],
    caloriesPer100g: 50,
    proteinPer100g: 0.5,
    carbsPer100g: 13.1,
    fatPer100g: 0.1,
    fiberPer100g: 1.4,
    sugarPer100g: 9.9,
    sodiumMgPer100g: 1,
    defaultGrams: 140,
    defaultUnitLabel: '1 cup',
    category: 'produce'
  },
  {
    name: 'Grapes',
    keywords: ['grape', 'grapes'],
    caloriesPer100g: 69,
    proteinPer100g: 0.7,
    carbsPer100g: 18.1,
    fatPer100g: 0.2,
    fiberPer100g: 0.9,
    sugarPer100g: 15.5,
    sodiumMgPer100g: 2,
    defaultGrams: 5,
    defaultUnitLabel: '1 grape (5g)',
    category: 'produce'
  },
  {
    name: 'Watermelon',
    keywords: ['watermelon', 'melon'],
    caloriesPer100g: 30,
    proteinPer100g: 0.6,
    carbsPer100g: 7.6,
    fatPer100g: 0.2,
    fiberPer100g: 0.4,
    sugarPer100g: 6.2,
    sodiumMgPer100g: 1,
    defaultGrams: 180,
    defaultUnitLabel: '1 wedge',
    category: 'produce'
  },

  // Yogurt & Dairy (including common typos like "yougurt", "yoghurt", "yogart")
  {
    name: 'Greek Yogurt',
    keywords: ['greek yogurt', 'greek yougurt', 'greek yoghurt', '0% yogurt', 'skyr', 'high protein yogurt'],
    caloriesPer100g: 59,
    proteinPer100g: 10.2,
    carbsPer100g: 3.6,
    fatPer100g: 0.4,
    fiberPer100g: 0,
    sugarPer100g: 3.2,
    sodiumMgPer100g: 36,
    defaultGrams: 170,
    defaultUnitLabel: '1 bowl (170g)',
    category: 'dairy'
  },
  {
    name: 'Natural Yogurt',
    keywords: ['yogurt', 'yougurt', 'yoghurt', 'yogart', 'plain yogurt', 'natural yogurt', 'whole milk yogurt'],
    caloriesPer100g: 61,
    proteinPer100g: 3.5,
    carbsPer100g: 4.7,
    fatPer100g: 3.3,
    fiberPer100g: 0,
    sugarPer100g: 4.7,
    sodiumMgPer100g: 46,
    defaultGrams: 150,
    defaultUnitLabel: '150g serving',
    category: 'dairy'
  },
  {
    name: 'Cottage Cheese',
    keywords: ['cottage cheese', 'curd'],
    caloriesPer100g: 98,
    proteinPer100g: 11.1,
    carbsPer100g: 3.4,
    fatPer100g: 4.3,
    fiberPer100g: 0,
    sugarPer100g: 2.7,
    sodiumMgPer100g: 364,
    defaultGrams: 150,
    defaultUnitLabel: '150g',
    category: 'dairy'
  },
  {
    name: 'Cheese',
    keywords: ['cheddar', 'cheese', 'cheddar cheese', 'sliced cheese', 'slice of cheese'],
    caloriesPer100g: 403,
    proteinPer100g: 24.9,
    carbsPer100g: 1.3,
    fatPer100g: 33.1,
    fiberPer100g: 0,
    sugarPer100g: 0.5,
    sodiumMgPer100g: 621,
    defaultGrams: 20,
    defaultUnitLabel: '1 slice (20g)',
    category: 'dairy'
  },
  {
    name: 'Mozzarella',
    keywords: ['mozzarella', 'burrata'],
    caloriesPer100g: 280,
    proteinPer100g: 28.0,
    carbsPer100g: 3.1,
    fatPer100g: 17.1,
    fiberPer100g: 0,
    sugarPer100g: 1.0,
    sodiumMgPer100g: 480,
    defaultGrams: 60,
    defaultUnitLabel: '60g',
    category: 'dairy'
  },
  {
    name: 'Feta Cheese',
    keywords: ['feta', 'feta cheese', 'halloumi'],
    caloriesPer100g: 264,
    proteinPer100g: 14.2,
    carbsPer100g: 4.1,
    fatPer100g: 21.3,
    fiberPer100g: 0,
    sugarPer100g: 4.1,
    sodiumMgPer100g: 917,
    defaultGrams: 45,
    defaultUnitLabel: '45g',
    category: 'dairy'
  },
  {
    name: 'Milk',
    keywords: ['milk', 'whole milk', 'cow milk', 'semi skimmed milk'],
    caloriesPer100g: 61,
    proteinPer100g: 3.2,
    carbsPer100g: 4.8,
    fatPer100g: 3.3,
    fiberPer100g: 0,
    sugarPer100g: 5.0,
    sodiumMgPer100g: 43,
    defaultGrams: 240,
    defaultUnitLabel: '1 cup (240ml)',
    category: 'dairy'
  },
  {
    name: 'Almond Milk',
    keywords: ['almond milk', 'oat milk', 'soy milk', 'plant milk'],
    caloriesPer100g: 24,
    proteinPer100g: 1.0,
    carbsPer100g: 2.5,
    fatPer100g: 1.2,
    fiberPer100g: 0.4,
    sugarPer100g: 1.0,
    sodiumMgPer100g: 55,
    defaultGrams: 240,
    defaultUnitLabel: '1 cup (240ml)',
    category: 'dairy'
  },

  // Seasonings, Salt, Spices, Condiments
  {
    name: 'Salt',
    keywords: ['salt', 'sea salt', 'pink salt', 'himalayan salt', 'table salt', 'kosher salt'],
    caloriesPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 38758,
    defaultGrams: 0.5,
    defaultUnitLabel: '1 pinch (0.5g)',
    category: 'seasoning'
  },
  {
    name: 'Black Pepper & Spices',
    keywords: ['pepper', 'black pepper', 'chili flakes', 'cinnamon', 'turmeric', 'cumin', 'paprika', 'oregano', 'basil', 'herbs', 'spices', 'garlic powder', 'ginger'],
    caloriesPer100g: 250,
    proteinPer100g: 10,
    carbsPer100g: 60,
    fatPer100g: 3,
    fiberPer100g: 25,
    sugarPer100g: 1,
    sodiumMgPer100g: 20,
    defaultGrams: 1,
    defaultUnitLabel: '1 pinch (1g)',
    category: 'seasoning'
  },
  {
    name: 'Soy Sauce',
    keywords: ['soy sauce', 'tamari', 'teriyaki sauce'],
    caloriesPer100g: 53,
    proteinPer100g: 8.1,
    carbsPer100g: 4.9,
    fatPer100g: 0.6,
    fiberPer100g: 0.8,
    sugarPer100g: 0.4,
    sodiumMgPer100g: 5493,
    defaultGrams: 15,
    defaultUnitLabel: '1 tbsp (15ml)',
    category: 'seasoning'
  },
  {
    name: 'Honey',
    keywords: ['honey', 'raw honey'],
    caloriesPer100g: 304,
    proteinPer100g: 0.3,
    carbsPer100g: 82.4,
    fatPer100g: 0,
    fiberPer100g: 0.2,
    sugarPer100g: 82.1,
    sodiumMgPer100g: 4,
    defaultGrams: 21,
    defaultUnitLabel: '1 tbsp (21g)',
    category: 'processed'
  },
  {
    name: 'Maple Syrup',
    keywords: ['maple syrup', 'agave', 'syrup'],
    caloriesPer100g: 260,
    proteinPer100g: 0,
    carbsPer100g: 67.0,
    fatPer100g: 0,
    fiberPer100g: 0,
    sugarPer100g: 60.5,
    sodiumMgPer100g: 12,
    defaultGrams: 20,
    defaultUnitLabel: '1 tbsp (20g)',
    category: 'processed'
  },
  {
    name: 'Sugar',
    keywords: ['sugar', 'white sugar', 'brown sugar', 'cane sugar'],
    caloriesPer100g: 387,
    proteinPer100g: 0,
    carbsPer100g: 100,
    fatPer100g: 0,
    fiberPer100g: 0,
    sugarPer100g: 100,
    sodiumMgPer100g: 1,
    defaultGrams: 5,
    defaultUnitLabel: '1 tsp (5g)',
    category: 'processed'
  },

  // Proteins (Eggs, Poultry, Meat, Fish, Plant)
  {
    name: 'Egg',
    keywords: ['egg', 'eggs', 'boiled egg', 'scrambled egg', 'scrambled eggs', 'poached egg', 'fried egg', 'omelette', 'omelet'],
    caloriesPer100g: 143,
    proteinPer100g: 12.6,
    carbsPer100g: 0.7,
    fatPer100g: 9.5,
    fiberPer100g: 0,
    sugarPer100g: 0.4,
    sodiumMgPer100g: 142,
    defaultGrams: 60,
    defaultUnitLabel: '1 egg (60g)',
    category: 'protein'
  },
  {
    name: 'Egg Whites',
    keywords: ['egg white', 'egg whites'],
    caloriesPer100g: 52,
    proteinPer100g: 10.9,
    carbsPer100g: 0.7,
    fatPer100g: 0.2,
    fiberPer100g: 0,
    sugarPer100g: 0.7,
    sodiumMgPer100g: 166,
    defaultGrams: 33,
    defaultUnitLabel: '1 egg white',
    category: 'protein'
  },
  {
    name: 'Chicken Breast',
    keywords: ['chicken breast', 'chicken', 'chiken', 'grilled chicken', 'roast chicken', 'chicken fillet'],
    caloriesPer100g: 165,
    proteinPer100g: 31.0,
    carbsPer100g: 0,
    fatPer100g: 3.6,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 74,
    defaultGrams: 150,
    defaultUnitLabel: '1 fillet (150g)',
    category: 'protein'
  },
  {
    name: 'Chicken Thigh',
    keywords: ['chicken thigh', 'chicken thighs', 'chicken drumstick', 'chicken wing'],
    caloriesPer100g: 209,
    proteinPer100g: 26.0,
    carbsPer100g: 0,
    fatPer100g: 10.9,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 84,
    defaultGrams: 130,
    defaultUnitLabel: '130g',
    category: 'protein'
  },
  {
    name: 'Turkey Breast',
    keywords: ['turkey', 'turkey breast', 'ground turkey', 'turkey mince', 'turkey slices'],
    caloriesPer100g: 135,
    proteinPer100g: 30.0,
    carbsPer100g: 0,
    fatPer100g: 1.0,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 110,
    defaultGrams: 140,
    defaultUnitLabel: '140g',
    category: 'protein'
  },
  {
    name: 'Lean Beef / Steak',
    keywords: ['beef', 'steak', 'sirloin', 'ground beef', 'beef mince', 'mince', 'roast beef'],
    caloriesPer100g: 186,
    proteinPer100g: 26.0,
    carbsPer100g: 0,
    fatPer100g: 9.0,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 68,
    defaultGrams: 160,
    defaultUnitLabel: '160g',
    category: 'protein'
  },
  {
    name: 'Pork Tenderloin / Chop',
    keywords: ['pork', 'pork chop', 'pork tenderloin', 'pork loin', 'ham', 'bacon'],
    caloriesPer100g: 165,
    proteinPer100g: 25.0,
    carbsPer100g: 0.5,
    fatPer100g: 6.8,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 220,
    defaultGrams: 140,
    defaultUnitLabel: '140g',
    category: 'protein'
  },
  {
    name: 'Salmon',
    keywords: ['salmon', 'salmon fillet', 'smoked salmon', 'grilled salmon'],
    caloriesPer100g: 208,
    proteinPer100g: 20.4,
    carbsPer100g: 0,
    fatPer100g: 13.4,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 59,
    defaultGrams: 160,
    defaultUnitLabel: '1 fillet (160g)',
    category: 'protein'
  },
  {
    name: 'Tuna',
    keywords: ['tuna', 'canned tuna', 'tuna steak'],
    caloriesPer100g: 116,
    proteinPer100g: 25.5,
    carbsPer100g: 0,
    fatPer100g: 1.0,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 247,
    defaultGrams: 120,
    defaultUnitLabel: '1 can (120g)',
    category: 'protein'
  },
  {
    name: 'White Fish (Cod / Tilapia)',
    keywords: ['cod', 'white fish', 'fish', 'tilapia', 'halibut', 'haddock', 'sea bass'],
    caloriesPer100g: 90,
    proteinPer100g: 19.0,
    carbsPer100g: 0,
    fatPer100g: 1.2,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 65,
    defaultGrams: 160,
    defaultUnitLabel: '1 fillet (160g)',
    category: 'protein'
  },
  {
    name: 'Shrimp / Prawns',
    keywords: ['shrimp', 'prawn', 'prawns'],
    caloriesPer100g: 99,
    proteinPer100g: 24.0,
    carbsPer100g: 0.2,
    fatPer100g: 0.3,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 111,
    defaultGrams: 140,
    defaultUnitLabel: '140g',
    category: 'protein'
  },
  {
    name: 'Tofu / Tempeh',
    keywords: ['tofu', 'firm tofu', 'tempeh', 'edamame'],
    caloriesPer100g: 95,
    proteinPer100g: 10.5,
    carbsPer100g: 2.5,
    fatPer100g: 5.2,
    fiberPer100g: 1.2,
    sugarPer100g: 0.5,
    sodiumMgPer100g: 14,
    defaultGrams: 150,
    defaultUnitLabel: '150g',
    category: 'protein'
  },
  {
    name: 'Whey Protein Powder',
    keywords: ['whey', 'protein powder', 'whey protein', 'protein shake', 'protein scoop'],
    caloriesPer100g: 380,
    proteinPer100g: 78.0,
    carbsPer100g: 6.5,
    fatPer100g: 4.2,
    fiberPer100g: 0.5,
    sugarPer100g: 3.0,
    sodiumMgPer100g: 180,
    defaultGrams: 30,
    defaultUnitLabel: '1 scoop (30g)',
    category: 'protein'
  },

  // Grains, Breads, Legumes
  {
    name: 'Rolled Oats / Oatmeal',
    keywords: ['oats', 'oatmeal', 'oatmel', 'rolled oats', 'porridge', 'overnight oats'],
    caloriesPer100g: 389,
    proteinPer100g: 16.9,
    carbsPer100g: 66.3,
    fatPer100g: 6.9,
    fiberPer100g: 10.6,
    sugarPer100g: 0.9,
    sodiumMgPer100g: 2,
    defaultGrams: 50,
    defaultUnitLabel: '50g dry',
    category: 'grain'
  },
  {
    name: 'Cooked Rice',
    keywords: ['rice', 'white rice', 'brown rice', 'jasmine rice', 'basmati rice', 'cooked rice'],
    caloriesPer100g: 130,
    proteinPer100g: 2.7,
    carbsPer100g: 28.2,
    fatPer100g: 0.3,
    fiberPer100g: 0.8,
    sugarPer100g: 0.1,
    sodiumMgPer100g: 5,
    defaultGrams: 160,
    defaultUnitLabel: '1 cup cooked (160g)',
    category: 'grain'
  },
  {
    name: 'Quinoa',
    keywords: ['quinoa', 'cooked quinoa'],
    caloriesPer100g: 120,
    proteinPer100g: 4.4,
    carbsPer100g: 21.3,
    fatPer100g: 1.9,
    fiberPer100g: 2.8,
    sugarPer100g: 0.9,
    sodiumMgPer100g: 7,
    defaultGrams: 150,
    defaultUnitLabel: '1 cup cooked (150g)',
    category: 'grain'
  },
  {
    name: 'Bread',
    keywords: ['sourdough', 'bread', 'toast', 'whole wheat bread', 'slice of bread', 'rye bread', 'bagel', 'wrap', 'tortilla'],
    caloriesPer100g: 250,
    proteinPer100g: 10.0,
    carbsPer100g: 46.0,
    fatPer100g: 2.5,
    fiberPer100g: 4.5,
    sugarPer100g: 3.0,
    sodiumMgPer100g: 450,
    defaultGrams: 30,
    defaultUnitLabel: '1 slice (30g)',
    category: 'grain'
  },
  {
    name: 'Cooked Pasta',
    keywords: ['pasta', 'spaghetti', 'penne', 'noodles', 'macaroni'],
    caloriesPer100g: 158,
    proteinPer100g: 5.8,
    carbsPer100g: 30.9,
    fatPer100g: 0.9,
    fiberPer100g: 1.8,
    sugarPer100g: 0.6,
    sodiumMgPer100g: 6,
    defaultGrams: 180,
    defaultUnitLabel: '1 bowl cooked (180g)',
    category: 'grain'
  },
  {
    name: 'Beans / Lentils / Chickpeas',
    keywords: ['beans', 'black beans', 'kidney beans', 'chickpeas', 'lentils', 'dal', 'hummus'],
    caloriesPer100g: 135,
    proteinPer100g: 8.9,
    carbsPer100g: 23.0,
    fatPer100g: 1.2,
    fiberPer100g: 7.5,
    sugarPer100g: 1.0,
    sodiumMgPer100g: 120,
    defaultGrams: 150,
    defaultUnitLabel: '150g cooked',
    category: 'grain'
  },
  {
    name: 'Potato / Sweet Potato',
    keywords: ['sweet potato', 'potato', 'potatoes', 'baked potato', 'mashed potato', 'roasted potatoes'],
    caloriesPer100g: 90,
    proteinPer100g: 2.0,
    carbsPer100g: 20.5,
    fatPer100g: 0.2,
    fiberPer100g: 2.6,
    sugarPer100g: 3.2,
    sodiumMgPer100g: 25,
    defaultGrams: 170,
    defaultUnitLabel: '1 medium (170g)',
    category: 'produce'
  },

  // Vegetables
  {
    name: 'Broccoli / Green Veg',
    keywords: ['broccoli', 'brocoli', 'asparagus', 'green beans', 'cauliflower', 'brussels sprouts', 'cabbage'],
    caloriesPer100g: 34,
    proteinPer100g: 2.8,
    carbsPer100g: 6.6,
    fatPer100g: 0.4,
    fiberPer100g: 2.6,
    sugarPer100g: 1.7,
    sodiumMgPer100g: 33,
    defaultGrams: 120,
    defaultUnitLabel: '120g',
    category: 'produce'
  },
  {
    name: 'Spinach / Leafy Greens',
    keywords: ['spinach', 'kale', 'lettuce', 'arugula', 'rocket', 'salad', 'mixed greens'],
    caloriesPer100g: 23,
    proteinPer100g: 2.9,
    carbsPer100g: 3.6,
    fatPer100g: 0.4,
    fiberPer100g: 2.2,
    sugarPer100g: 0.4,
    sodiumMgPer100g: 79,
    defaultGrams: 80,
    defaultUnitLabel: '80g',
    category: 'produce'
  },
  {
    name: 'Mixed Vegetables',
    keywords: ['tomato', 'tomatoes', 'cucumber', 'bell pepper', 'peppers', 'carrots', 'carrot', 'zucchini', 'mushrooms', 'onion', 'veggies', 'vegetables'],
    caloriesPer100g: 28,
    proteinPer100g: 1.2,
    carbsPer100g: 5.5,
    fatPer100g: 0.2,
    fiberPer100g: 1.8,
    sugarPer100g: 3.0,
    sodiumMgPer100g: 15,
    defaultGrams: 120,
    defaultUnitLabel: '120g',
    category: 'produce'
  },

  // Fats, Nuts, Seeds, Oils
  {
    name: 'Olive Oil / Cooking Oil',
    keywords: ['olive oil', 'oil', 'coconut oil', 'avocado oil', 'sesame oil'],
    caloriesPer100g: 884,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 100,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 2,
    defaultGrams: 14,
    defaultUnitLabel: '1 tbsp (14g)',
    category: 'fat'
  },
  {
    name: 'Butter',
    keywords: ['butter', 'ghee'],
    caloriesPer100g: 717,
    proteinPer100g: 0.9,
    carbsPer100g: 0.1,
    fatPer100g: 81.1,
    fiberPer100g: 0,
    sugarPer100g: 0.1,
    sodiumMgPer100g: 11,
    defaultGrams: 10,
    defaultUnitLabel: '10g pat',
    category: 'fat'
  },
  {
    name: 'Peanut / Almond Butter',
    keywords: ['peanut butter', 'almond butter', 'nut butter', 'cashew butter'],
    caloriesPer100g: 588,
    proteinPer100g: 25.0,
    carbsPer100g: 20.0,
    fatPer100g: 50.0,
    fiberPer100g: 6.0,
    sugarPer100g: 7.0,
    sodiumMgPer100g: 320,
    defaultGrams: 16,
    defaultUnitLabel: '1 tbsp (16g)',
    category: 'fat'
  },
  {
    name: 'Nuts (Almonds / Walnuts / Cashews)',
    keywords: ['almonds', 'almond', 'walnuts', 'walnut', 'cashews', 'cashew', 'peanuts', 'pistachios', 'pecans', 'mixed nuts', 'nuts'],
    caloriesPer100g: 590,
    proteinPer100g: 20.0,
    carbsPer100g: 20.0,
    fatPer100g: 52.0,
    fiberPer100g: 9.0,
    sugarPer100g: 4.0,
    sodiumMgPer100g: 10,
    defaultGrams: 28,
    defaultUnitLabel: '1 handful (28g)',
    category: 'fat'
  },
  {
    name: 'Seeds (Chia / Flax / Hemp / Pumpkin)',
    keywords: ['chia seeds', 'chia', 'flax seeds', 'flax', 'hemp seeds', 'pumpkin seeds', 'sunflower seeds', 'seeds'],
    caloriesPer100g: 510,
    proteinPer100g: 20.0,
    carbsPer100g: 34.0,
    fatPer100g: 35.0,
    fiberPer100g: 25.0,
    sugarPer100g: 1.0,
    sodiumMgPer100g: 15,
    defaultGrams: 12,
    defaultUnitLabel: '1 tbsp (12g)',
    category: 'fat'
  },

  // Common Processed / Fast Foods / Snacks
  {
    name: 'Dark Chocolate',
    keywords: ['dark chocolate', 'chocolate', 'cocoa'],
    caloriesPer100g: 546,
    proteinPer100g: 6.1,
    carbsPer100g: 52.0,
    fatPer100g: 35.0,
    fiberPer100g: 7.0,
    sugarPer100g: 38.0,
    sodiumMgPer100g: 24,
    defaultGrams: 25,
    defaultUnitLabel: '25g',
    category: 'processed'
  },
  {
    name: 'Chips / Crisps / Fries',
    keywords: ['chips', 'crisps', 'french fries', 'fries', 'nachos'],
    caloriesPer100g: 365,
    proteinPer100g: 4.5,
    carbsPer100g: 48.0,
    fatPer100g: 18.0,
    fiberPer100g: 3.8,
    sugarPer100g: 0.5,
    sodiumMgPer100g: 420,
    defaultGrams: 85,
    defaultUnitLabel: '85g portion',
    category: 'processed'
  },
  {
    name: 'Pizza Slice',
    keywords: ['pizza', 'slice of pizza', 'pepperoni pizza', 'margherita pizza'],
    caloriesPer100g: 266,
    proteinPer100g: 11.4,
    carbsPer100g: 33.3,
    fatPer100g: 9.8,
    fiberPer100g: 2.3,
    sugarPer100g: 3.6,
    sodiumMgPer100g: 598,
    defaultGrams: 125,
    defaultUnitLabel: '1 slice (125g)',
    category: 'processed'
  },
  {
    name: 'Burger',
    keywords: ['burger', 'cheeseburger', 'hamburger'],
    caloriesPer100g: 260,
    proteinPer100g: 15.0,
    carbsPer100g: 24.0,
    fatPer100g: 12.0,
    fiberPer100g: 1.5,
    sugarPer100g: 4.0,
    sodiumMgPer100g: 520,
    defaultGrams: 210,
    defaultUnitLabel: '1 burger (210g)',
    category: 'processed'
  },
  {
    name: 'Cookie / Pastry / Cake',
    keywords: ['cookie', 'cookies', 'biscuit', 'cake', 'muffin', 'croissant', 'donut', 'brownie', 'pastry'],
    caloriesPer100g: 425,
    proteinPer100g: 5.5,
    carbsPer100g: 58.0,
    fatPer100g: 19.5,
    fiberPer100g: 1.8,
    sugarPer100g: 32.0,
    sodiumMgPer100g: 310,
    defaultGrams: 65,
    defaultUnitLabel: '1 piece (65g)',
    category: 'processed'
  },
  {
    name: 'Soda / Sweetened Drink',
    keywords: ['soda', 'cola', 'coke', 'soft drink', 'energy drink', 'sweet tea', 'juice', 'orange juice'],
    caloriesPer100g: 42,
    proteinPer100g: 0,
    carbsPer100g: 10.6,
    fatPer100g: 0,
    fiberPer100g: 0,
    sugarPer100g: 10.4,
    sodiumMgPer100g: 8,
    defaultGrams: 330,
    defaultUnitLabel: '1 can (330ml)',
    category: 'beverage'
  },
  {
    name: 'Coffee / Tea',
    keywords: ['coffee', 'black coffee', 'espresso', 'americano', 'tea', 'green tea'],
    caloriesPer100g: 2,
    proteinPer100g: 0.1,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 2,
    defaultGrams: 240,
    defaultUnitLabel: '1 cup (240ml)',
    category: 'beverage'
  }
];

// Known per-item weights (in grams) for count-based inputs without explicit weight
const KNOWN_ITEM_WEIGHTS_GRAMS: Array<{ pattern: RegExp; grams: number; unitLabel: string }> = [
  { pattern: /\b(raspberry|raspberries|rasberry|rasberries)\b/i, grams: 4, unitLabel: 'raspberry' },
  { pattern: /\b(blueberry|blueberries)\b/i, grams: 2, unitLabel: 'blueberry' },
  { pattern: /\b(strawberry|strawberries)\b/i, grams: 12, unitLabel: 'strawberry' },
  { pattern: /\b(blackberry|blackberries)\b/i, grams: 5, unitLabel: 'blackberry' },
  { pattern: /\b(grape|grapes)\b/i, grams: 5, unitLabel: 'grape' },
  { pattern: /\b(cherry|cherries)\b/i, grams: 8, unitLabel: 'cherry' },
  { pattern: /\b(egg|eggs)\b/i, grams: 60, unitLabel: 'egg' },
  { pattern: /\b(banana|bananas|bannana)\b/i, grams: 120, unitLabel: 'banana' },
  { pattern: /\b(apple|apples)\b/i, grams: 180, unitLabel: 'apple' },
  { pattern: /\b(orange|oranges|mandarin|clementine)\b/i, grams: 150, unitLabel: 'orange' },
  { pattern: /\b(potato|potatoes|sweet potato|sweet potatoes)\b/i, grams: 170, unitLabel: 'potato' },
  { pattern: /\b(slice of bread|slices of bread|bread|toast|sourdough|whole wheat bread|rye bread)\b/i, grams: 30, unitLabel: 'slice of bread' },
  { pattern: /\b(slice of cheese|slices of cheese|cheese slice|cheddar|cheese)\b/i, grams: 20, unitLabel: 'slice of cheese' }
];

function getKnownPerItemWeight(foodPhrase: string, unit: string): number | null {
  const combined = `${unit} ${foodPhrase}`.trim();
  if (unit === 'slice' || unit === 'slices') {
    if (/\b(cheese|cheddar|mozzarella|swiss|gouda|provolone)\b/i.test(foodPhrase)) {
      return 20;
    }
    if (/\b(bread|toast|sourdough|rye|wheat|loaf)\b/i.test(foodPhrase)) {
      return 30;
    }
  }
  for (const item of KNOWN_ITEM_WEIGHTS_GRAMS) {
    if (item.pattern.test(combined) || item.pattern.test(foodPhrase)) {
      return item.grams;
    }
  }
  return null;
}

function formatTypedFoodName(foodPhrase: string): string {
  const cleaned = foodPhrase
    .replace(/\b(of|some|a|an|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 'Food Item';
  return cleaned
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function findBestFoodMatch(foodPhrase: string): LocalFoodEntry | null {
  const cleaned = foodPhrase
    .toLowerCase()
    .replace(/\b(of|with|fresh|raw|organic|cooked|chopped|diced|sliced|some|a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // 1. Exact keyword match
  for (const entry of LOCAL_FOOD_DB) {
    if (entry.keywords.some(kw => kw === cleaned)) {
      return entry;
    }
  }

  // 2. Whole-word match inside phrase (longest keyword first so "greek yogurt" beats "yogurt")
  let bestEntry: LocalFoodEntry | null = null;
  let longestKwLen = 0;
  for (const entry of LOCAL_FOOD_DB) {
    for (const kw of entry.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (wordRegex.test(cleaned) && kw.length > longestKwLen) {
        bestEntry = entry;
        longestKwLen = kw.length;
      }
    }
  }
  if (bestEntry) return bestEntry;

  return null;
}

function parseFoodSegment(segmentRaw: string): DecipheredFoodItem | null {
  const raw = segmentRaw.trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  // Check colloquial small measures first: "a pinch of", "2 pinches of", "a dash of", "a sprinkle of"
  const pinchMatch = lower.match(/^(?:(\d+|a|an|one|two|three)\s+)?(pinch|pinches|dash|dashes|sprinkle|touch)\s+(?:of\s+)?(.+)$/i);
  if (pinchMatch) {
    const countWord = (pinchMatch[1] || '1').toLowerCase();
    const mult = WORD_NUMBERS[countWord] || parseFloat(countWord) || 1;
    const itemName = pinchMatch[3].trim();
    const matched = findBestFoodMatch(itemName);
    const displayName = formatTypedFoodName(itemName);
    const grams = Math.round(mult * 0.4 * 10) / 10; // 1 pinch ≈ 0.4g
    const factor = grams / 100;

    if (matched) {
      return {
        rawText: raw,
        name: displayName,
        grams,
        needsWeightConfirmation: false,
        servingLabel: `${mult > 1 ? mult + ' pinches' : '1 pinch'} (${grams}g)`,
        calories: Math.round(matched.caloriesPer100g * factor),
        protein: Math.round(matched.proteinPer100g * factor * 10) / 10,
        carbs: Math.round(matched.carbsPer100g * factor * 10) / 10,
        fat: Math.round(matched.fatPer100g * factor * 10) / 10,
        fiber: Math.round(matched.fiberPer100g * factor * 10) / 10,
        sugar: Math.round(matched.sugarPer100g * factor * 10) / 10,
        sodiumMg: Math.round(matched.sodiumMgPer100g * factor),
        caloriesPer100g: matched.caloriesPer100g,
        proteinPer100g: matched.proteinPer100g,
        carbsPer100g: matched.carbsPer100g,
        fatPer100g: matched.fatPer100g,
        fiberPer100g: matched.fiberPer100g,
        sugarPer100g: matched.sugarPer100g,
        sodiumMgPer100g: matched.sodiumMgPer100g,
        category: matched.category
      };
    }

    const sodiumPer100g = /salt/i.test(itemName) ? 38758 : 1250;
    return {
      rawText: raw,
      name: displayName,
      grams,
      needsWeightConfirmation: false,
      servingLabel: `1 pinch (${grams}g)`,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodiumMg: /salt/i.test(itemName) ? 155 : 5,
      caloriesPer100g: 0,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
      fiberPer100g: 0,
      sugarPer100g: 0,
      sodiumMgPer100g: sodiumPer100g,
      category: 'seasoning'
    };
  }

  let amount = 1;
  let unit = '';
  let foodPhrase = raw;

  const explicitUnitMatch = raw.match(
    /^(?:(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|half|quarter|\d+(?:[.,/]\d+)?)\s*)?(g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|slices?)\b\s*(?:of\s+)?(.+)$/i
  );

  if (explicitUnitMatch && explicitUnitMatch[3]) {
    const rawQty = (explicitUnitMatch[1] || '1').toLowerCase();
    if (rawQty.includes('/')) {
      const [n, d] = rawQty.split('/');
      amount = parseFloat(n) / (parseFloat(d) || 1);
    } else {
      amount = WORD_NUMBERS[rawQty] ?? (parseFloat(rawQty.replace(',', '.')) || 1);
    }
    unit = explicitUnitMatch[2].toLowerCase();
    foodPhrase = explicitUnitMatch[3].trim();
  } else {
    // Check leading number/word without unit, e.g. "3 raspberries", "2 eggs", "half an avocado"
    const countMatch = raw.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|thirty|forty|fifty|half|quarter|\d+(?:[.,/]\d+)?)\s+(?:of\s+|an?\s+)?(.+)$/i);
    if (countMatch) {
      const rawQty = countMatch[1].toLowerCase();
      if (rawQty.includes('/')) {
        const [n, d] = rawQty.split('/');
        amount = parseFloat(n) / (parseFloat(d) || 1);
      } else {
        amount = WORD_NUMBERS[rawQty] ?? (parseFloat(rawQty.replace(',', '.')) || 1);
      }
      unit = 'piece';
      foodPhrase = countMatch[2].trim();
    } else {
      amount = 1;
      unit = 'piece';
      foodPhrase = raw;
    }
  }

  const matched = findBestFoodMatch(foodPhrase);
  // Always log the food name the user actually typed (e.g. "Raspberries", "Honey")
  const displayName = formatTypedFoodName(foodPhrase);

  let grams = 0;
  let needsWeightConfirmation = false;
  let servingLabel = '';

  if (unit === 'g' || unit === 'gram' || unit === 'grams') {
    grams = amount;
    servingLabel = `${grams}g`;
  } else if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') {
    grams = amount * 1000;
    servingLabel = `${amount}kg (${grams}g)`;
  } else if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
    grams = amount;
    servingLabel = `${amount}ml (${grams}g)`;
  } else if (unit === 'l' || unit === 'liter' || unit === 'liters') {
    grams = amount * 1000;
    servingLabel = `${amount}L (${grams}g)`;
  } else if (unit === 'oz' || unit === 'ounce' || unit === 'ounces') {
    grams = Math.round(amount * 28.35);
    servingLabel = `${amount} oz (${grams}g)`;
  } else if (unit === 'cup' || unit === 'cups') {
    grams = Math.round(amount * 180);
    servingLabel = `${amount} cup (${grams}g)`;
  } else if (unit === 'tbsp' || unit === 'tablespoon' || unit === 'tablespoons') {
    grams = Math.round(amount * 15);
    servingLabel = `${amount} tbsp (${grams}g)`;
  } else if (unit === 'tsp' || unit === 'teaspoon' || unit === 'teaspoons') {
    grams = Math.round(amount * 5);
    servingLabel = `${amount} tsp (${grams}g)`;
  } else {
    // Count or bare item: check the explicit known per-item weight table
    const knownPieceGrams = getKnownPerItemWeight(foodPhrase, unit);
    if (knownPieceGrams !== null) {
      grams = Math.round(amount * knownPieceGrams * 10) / 10;
      if (unit === 'slice' || unit === 'slices') {
        servingLabel = `${amount} slice${amount > 1 ? 's' : ''} (${grams}g)`;
      } else {
        servingLabel = `${amount} × ${displayName} (${grams}g)`;
      }
    } else {
      // Never assume a default of 100g per item. Return grams: 0 and ask the user to confirm.
      grams = 0;
      needsWeightConfirmation = true;
      servingLabel = 'Confirm weight (g)';
    }
  }

  const roundedGrams = Math.round(grams * 10) / 10;
  const isOver5kg = roundedGrams > 5000;
  const kgAmount = isOver5kg ? Math.round((roundedGrams / 1000) * 100) / 100 : undefined;
  const suggestedGrams = isOver5kg ? kgAmount : undefined;
  const over5kgWarning = isOver5kg
    ? `${kgAmount}kg of ${displayName.toLowerCase()} seems very high. Did you mean ${suggestedGrams}g?`
    : undefined;
  const factor = grams / 100;

  if (matched) {
    return {
      rawText: raw,
      name: displayName,
      grams: roundedGrams,
      needsWeightConfirmation,
      isOver5kg,
      kgAmount,
      suggestedGrams,
      over5kgWarning,
      servingLabel,
      calories: Math.round(matched.caloriesPer100g * factor),
      protein: Math.round(matched.proteinPer100g * factor * 10) / 10,
      carbs: Math.round(matched.carbsPer100g * factor * 10) / 10,
      fat: Math.round(matched.fatPer100g * factor * 10) / 10,
      fiber: Math.round(matched.fiberPer100g * factor * 10) / 10,
      sugar: Math.round(matched.sugarPer100g * factor * 10) / 10,
      sodiumMg: Math.round(matched.sodiumMgPer100g * factor),
      caloriesPer100g: matched.caloriesPer100g,
      proteinPer100g: matched.proteinPer100g,
      carbsPer100g: matched.carbsPer100g,
      fatPer100g: matched.fatPer100g,
      fiberPer100g: matched.fiberPer100g,
      sugarPer100g: matched.sugarPer100g,
      sodiumMgPer100g: matched.sodiumMgPer100g,
      category: matched.category
    };
  }

  // Fallback for unrecognized custom items (never default to 100g if weight wasn't provided)
  return {
    rawText: raw,
    name: displayName,
    grams: roundedGrams,
    needsWeightConfirmation,
    isOver5kg,
    kgAmount,
    suggestedGrams,
    over5kgWarning,
    servingLabel,
    calories: Math.round(135 * factor),
    protein: Math.round(6 * factor * 10) / 10,
    carbs: Math.round(16 * factor * 10) / 10,
    fat: Math.round(4.5 * factor * 10) / 10,
    fiber: Math.round(1.5 * factor * 10) / 10,
    sugar: Math.round(3.0 * factor * 10) / 10,
    sodiumMg: Math.round(140 * factor),
    caloriesPer100g: 135,
    proteinPer100g: 6,
    carbsPer100g: 16,
    fatPer100g: 4.5,
    fiberPer100g: 1.5,
    sugarPer100g: 3.0,
    sodiumMgPer100g: 140,
    category: 'grain'
  };
}

export function buildDecipheredFoodSummary(
  items: DecipheredFoodItem[],
  dailyCalorieGoal?: number
): DecipheredFoodResult {
  const hasKnownGoal = typeof dailyCalorieGoal === 'number' && dailyCalorieGoal > 0;
  const referenceDailyGoal = hasKnownGoal ? dailyCalorieGoal : 2000;
  const usedFallbackReference = !hasKnownGoal;

  if (items.length === 0) {
    return {
      mealSummaryName: 'Custom Meal',
      items: [],
      needsWeightConfirmation: false,
      hasItemOver5kg: false,
      isOver5000Kcal: false,
      isExtremeCalorieMeal: false,
      usedFallbackReference,
      referenceDailyGoal,
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      totalFiber: 0,
      totalSugar: 0,
      totalSodiumMg: 0,
      healthRating: 5,
      healthLabel: 'Enter ingredients above',
      whatToAdd: [],
      whatToTakeOut: []
    };
  }

  const totalCalories = items.reduce((s, i) => s + i.calories, 0);
  const totalProtein = Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10;
  const totalCarbs = Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10;
  const totalFat = Math.round(items.reduce((s, i) => s + i.fat, 0) * 10) / 10;
  const totalFiber = Math.round(items.reduce((s, i) => s + i.fiber, 0) * 10) / 10;
  const totalSugar = Math.round(items.reduce((s, i) => s + i.sugar, 0) * 10) / 10;
  const totalSodiumMg = items.reduce((s, i) => s + i.sodiumMg, 0);
  const needsWeightConfirmation = items.some(i => i.grams <= 0 || i.needsWeightConfirmation);

  const hasItemOver5kg = items.some(i => i.grams > 5000);
  const hasItemOver2000Kcal = items.some(i => i.calories > 2000);
  const exceeds2xDailyGoal = totalCalories > 2 * referenceDailyGoal;
  const isOver5000Kcal = totalCalories > 5000;
  const over5000KcalWarning = isOver5000Kcal
    ? 'This meal is over 5,000 kcal. Is that right?'
    : undefined;
  const isExtremeCalorieMeal =
    hasItemOver5kg || hasItemOver2000Kcal || exceeds2xDailyGoal || isOver5000Kcal;

  const mainNames = items.filter(i => i.category !== 'seasoning' || items.length === 1).map(i => i.name);
  const mealSummaryName =
    mainNames.length <= 3
      ? mainNames.join(' & ')
      : `${mainNames.slice(0, 2).join(', ')} + ${mainNames.length - 2} more`;

  let score = 6.5;

  const hasProduce = items.some(i => i.category === 'produce');
  const hasProcessed = items.some(i => i.category === 'processed' || i.category === 'beverage');
  const hasAddedSalt = items.some(i => /salt|soy sauce/i.test(i.name));
  const yogurtItem = items.find(i => /yogurt/i.test(i.name));

  if (hasProduce) score += 1.2;
  if (totalFiber >= 3) score += 0.8;
  else if (totalFiber >= 1.2) score += 0.4;

  if (totalProtein >= 20) score += 1.2;
  else if (totalProtein >= 10) score += 0.6;
  else if (totalProtein < 4 && totalCalories > 30) score -= 0.7;

  if (hasProcessed) score -= 2.0;
  if (totalSodiumMg > 800) score -= 1.2;
  else if (hasAddedSalt && totalCalories < 150) score -= 0.4;

  if (totalSugar > 25 && !hasProduce) score -= 1.5;
  if (totalFat > 30 && totalProtein < 15) score -= 0.8;

  score = Math.max(1, Math.min(10, score));

  // Apply total & per-item calorie rules:
  // - If any single item exceeds 2,000 kcal, the rating drops by 3 points.
  if (hasItemOver2000Kcal) {
    score -= 3;
  }
  // - If total calories exceed 2× the user's daily goal, the rating is capped at 2 out of 10. Hard cap.
  if (exceeds2xDailyGoal) {
    score = Math.min(score, 2);
  }
  // - If the total exceeds 5,000 kcal, the rating is 1 out of 10. No exceptions.
  if (isOver5000Kcal) {
    score = 1;
  }

  const healthRating = isOver5000Kcal
    ? 1
    : Math.max(1, Math.min(10, Math.round(score * 10) / 10));

  const whatToAdd: string[] = [];
  const whatToTakeOut: string[] = [];
  let healthLabel: string;

  if (isExtremeCalorieMeal) {
    const quantityAdvice = usedFallbackReference
      ? 'This is far above a normal meal. Check the quantities. Based on a 2,000 kcal reference.'
      : 'This is far above a normal meal. Check the quantities.';
    healthLabel = quantityAdvice;
    whatToTakeOut.push(quantityAdvice);

    for (const item of items) {
      if (item.grams > 5000 && item.over5kgWarning) {
        whatToTakeOut.push(item.over5kgWarning);
      } else if (item.calories > 2000) {
        whatToTakeOut.push(
          `${item.name} (${item.grams}g — ${item.calories} kcal) exceeds 2,000 kcal for a single item. Check the quantity.`
        );
      }
    }
  } else {
    const baseLabel =
      healthRating >= 8.5
        ? 'Excellent — Nutrient-Dense & Balanced'
        : healthRating >= 7.0
        ? 'Good — Whole-Food Foundation'
        : healthRating >= 5.5
        ? 'Moderate — Could Use Macro Balance'
        : 'Low — High in Sodium, Sugar, or Processed Fats';

    healthLabel = usedFallbackReference
      ? `${baseLabel} (Based on a 2,000 kcal reference.)`
      : baseLabel;

    if (totalProtein < 12) {
      if (yogurtItem && yogurtItem.grams < 80) {
        whatToAdd.push(
          `Increase ${yogurtItem.name} from ${yogurtItem.grams}g to 120–150g Greek yogurt (+12g protein) for better satiety and blood sugar balance.`
        );
      } else {
        whatToAdd.push(
          'Add a lean protein source (e.g. 120g Greek yogurt, 2 eggs, cottage cheese, or 100g chicken/tofu) to reach at least 15–25g protein.'
        );
      }
    }

    if (totalFat < 3) {
      whatToAdd.push(
        'Add 10–15g of healthy fats & fiber (such as chia seeds, flaxseeds, or crushed almonds/walnuts) to slow carbohydrate digestion and help absorb fat-soluble vitamins.'
      );
    }

    if (!hasProduce) {
      whatToAdd.push(
        'Add 80–100g of fresh fruit (berries, mango) or leafy greens/vegetables (spinach, broccoli) for fiber, potassium, and antioxidants.'
      );
    } else if (totalFiber < 3) {
      whatToAdd.push(
        'Add 1 tbsp of chia seeds, oats, or extra berries/greens to boost dietary fiber above 4g.'
      );
    }

    if (whatToAdd.length === 0) {
      whatToAdd.push('A glass of water or a sprinkle of seeds/herbs — your macro and micronutrient profile is already well balanced.');
    }

    const saltItem = items.find(i => /salt|soy sauce/i.test(i.name));
    if (saltItem) {
      whatToTakeOut.push(
        `Take out or halve the ${saltItem.rawText} (~${saltItem.sodiumMg}mg sodium) — try cinnamon, lime zest, or fresh mint instead for zero-sodium flavor.`
      );
    } else if (totalSodiumMg > 600) {
      whatToTakeOut.push(
        `Reduce high-sodium items (${totalSodiumMg}mg total sodium) to minimize water retention and support blood pressure.`
      );
    }

    const processedItems = items.filter(i => i.category === 'processed' || i.category === 'beverage');
    if (processedItems.length > 0) {
      whatToTakeOut.push(
        `Take out or reduce ${processedItems.map(p => p.name).join(' & ')} to cut refined sugars and empty calories.`
      );
    }

    const heavyFatItem = items.find(i => i.fat > 18);
    if (heavyFatItem) {
      whatToTakeOut.push(
        `Trim the portion of ${heavyFatItem.name} by ~30% to save ~${Math.round(heavyFatItem.calories * 0.3)} kcal while keeping flavor.`
      );
    }

    if (whatToTakeOut.length === 0) {
      if (totalSugar > 10 && totalProtein < 8) {
        whatToTakeOut.push(
          'Nothing unhealthy to remove (all whole ingredients), or slightly trim the fruit portion by 20g if pairing without extra protein to keep sugar spikes low.'
        );
      } else {
        whatToTakeOut.push(
          'Nothing needs to be taken out — these are clean, whole-food ingredients with no excess refined sugars or trans fats.'
        );
      }
    }
  }

  return {
    mealSummaryName,
    items,
    needsWeightConfirmation,
    hasItemOver5kg,
    isOver5000Kcal,
    over5000KcalWarning,
    isExtremeCalorieMeal,
    usedFallbackReference,
    referenceDailyGoal,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    totalFiber,
    totalSugar,
    totalSodiumMg,
    healthRating,
    healthLabel,
    whatToAdd,
    whatToTakeOut
  };
}

export function recalculateDecipheredFoodWithGrams(
  baseResult: DecipheredFoodResult,
  gramOverrides: Record<number, number>,
  dailyCalorieGoal?: number
): DecipheredFoodResult {
  const updatedItems = baseResult.items.map((item, idx) => {
    const hasOverride = Object.prototype.hasOwnProperty.call(gramOverrides, idx);
    const grams = hasOverride ? Math.max(0, Number(gramOverrides[idx]) || 0) : item.grams;
    const roundedGrams = Math.round(grams * 10) / 10;
    const isOver5kg = roundedGrams > 5000;
    const kgAmount = isOver5kg ? Math.round((roundedGrams / 1000) * 100) / 100 : undefined;
    const suggestedGrams = isOver5kg ? kgAmount : undefined;
    const over5kgWarning = isOver5kg
      ? `${kgAmount}kg of ${item.name.toLowerCase()} seems very high. Did you mean ${suggestedGrams}g?`
      : undefined;
    const factor = grams / 100;
    return {
      ...item,
      grams: roundedGrams,
      needsWeightConfirmation: grams <= 0,
      isOver5kg,
      kgAmount,
      suggestedGrams,
      over5kgWarning,
      servingLabel: hasOverride ? `${roundedGrams}g` : item.servingLabel,
      calories: Math.round(item.caloriesPer100g * factor),
      protein: Math.round(item.proteinPer100g * factor * 10) / 10,
      carbs: Math.round(item.carbsPer100g * factor * 10) / 10,
      fat: Math.round(item.fatPer100g * factor * 10) / 10,
      fiber: Math.round(item.fiberPer100g * factor * 10) / 10,
      sugar: Math.round(item.sugarPer100g * factor * 10) / 10,
      sodiumMg: Math.round(item.sodiumMgPer100g * factor)
    };
  });
  return buildDecipheredFoodSummary(updatedItems, dailyCalorieGoal);
}

export function decipherFoodText(rawInput: string, dailyCalorieGoal?: number): DecipheredFoodResult {
  const parts = rawInput
    .split(/(?:[,;\n+]+|\b(?:and|with|plus|topped with|on|alongside)\b)/i)
    .map(s => s.trim())
    .filter(Boolean);

  const items: DecipheredFoodItem[] = [];
  for (const part of parts) {
    const parsed = parseFoodSegment(part);
    if (parsed) items.push(parsed);
  }

  return buildDecipheredFoodSummary(items, dailyCalorieGoal);
}
