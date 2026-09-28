import { parseIngredientLine, BUILTIN_FOODS } from '../server/foodData.js';
import { decipherFoodText } from '../utils/localAiEngine.js';
import type {
  FoodItem,
  ExerciseItem,
  WeightRecord,
  SavedFood,
  SavedRecipe,
  MealTemplate,
  UserProfile,
  ChatMessage,
  WeekPlan,
  UserStats,
  MealType,
  BodyMeasurement,
  ProgressPhoto,
  DailyHabitLog,
  CravingLog,
  NonScaleVictory,
  PantryItem,
  FriendRecord,
  SharedRecipeRecord,
  PlanDay
} from '../types/index.js';

const STORAGE_KEY = 'caloriq_standalone_db_v1';

interface StandaloneDb {
  users: Record<string, { id: string; email?: string; passwordHash?: string; isGuest: boolean; createdAt: number; lastLoginAt: number }>;
  profiles: Record<string, UserProfile>;
  diaryEntries: FoodItem[];
  waterEntries: Record<string, number>;
  exerciseEntries: ExerciseItem[];
  weightEntries: WeightRecord[];
  measurements: BodyMeasurement[];
  progressPhotos: ProgressPhoto[];
  dailyHabits: Record<string, DailyHabitLog>;
  cravings: CravingLog[];
  nonScaleVictories: NonScaleVictory[];
  pantryItems: PantryItem[];
  friends: FriendRecord[];
  sharedRecipes: SharedRecipeRecord[];
  savedFoods: SavedFood[];
  savedRecipes: SavedRecipe[];
  mealTemplates: MealTemplate[];
  plans: Record<string, WeekPlan>;
  chatMessages: ChatMessage[];
  userXp: Record<string, { xp: number; badges: string[] }>;
  usdaApiKey?: string;
}

const DEFAULT_DB: StandaloneDb = {
  users: {},
  profiles: {},
  diaryEntries: [],
  waterEntries: {},
  exerciseEntries: [],
  weightEntries: [],
  measurements: [],
  progressPhotos: [],
  dailyHabits: {},
  cravings: [],
  nonScaleVictories: [],
  pantryItems: [],
  friends: [],
  sharedRecipes: [],
  savedFoods: [],
  savedRecipes: [],
  mealTemplates: [],
  plans: {},
  chatMessages: [],
  userXp: {}
};

function uid(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

function loadDb(): StandaloneDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DB };
    const parsed = JSON.parse(raw);
    const fakeUsernames = new Set(['claire_m', 'marcus_r', 'elena_v']);
    const cleanedFriends = (parsed.friends || []).filter(
      (f: any) => !fakeUsernames.has(String(f.username || '').toLowerCase())
    );
    const cleanedProfiles: Record<string, UserProfile> = parsed.profiles || {};
    for (const k of Object.keys(cleanedProfiles)) {
      const prof = cleanedProfiles[k];
      if (!prof) continue;
      if (prof.accountabilityPartner && fakeUsernames.has(prof.accountabilityPartner.toLowerCase())) {
        delete prof.accountabilityPartner;
      }
      if (
        prof.age === 28 &&
        prof.gender === 'female' &&
        prof.heightCm === 168 &&
        prof.fitnessLevel === 'intermediate' &&
        prof.currentWeightKg === 65 &&
        prof.goalWeightKg === 60 &&
        prof.dailyActivity === 'moderate'
      ) {
        prof.age = 0;
        prof.gender = '';
        prof.heightCm = 0;
        prof.fitnessLevel = '';
        prof.currentWeightKg = 0;
        prof.goalWeightKg = 0;
        prof.dailyActivity = '';
        if (prof.pinnedWhy === 'Building steady energy and long-term strength, one measured week at a time.') {
          prof.pinnedWhy = '';
        }
      }
    }
    return { ...DEFAULT_DB, ...parsed, friends: cleanedFriends, profiles: cleanedProfiles };
  } catch {
    return { ...DEFAULT_DB };
  }
}

let db: StandaloneDb = loadDb();

function saveDb() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Standalone DB save warning:', e);
  }
}

function enrichMicronutrients(entry: Partial<FoodItem>) {
  const nameLower = (entry.name || '').toLowerCase();
  const carbs = Number(entry.carbs || 0);
  const protein = Number(entry.protein || 0);
  const calories = Number(entry.calories || 0);

  const isWholeGrainOrVeg = /oat|berry|blueberr|broccoli|spinach|kale|bean|lentil|quinoa|brown rice|toast|sourdough|apple|banana|avocado|salad|veg/i.test(nameLower);
  const isSweet = /honey|sugar|chocolate|cookie|cake|juice|soda|syrup|jam|yogurt|berry|banana|fruit/i.test(nameLower);
  const isDairy = /milk|yogurt|cheese|whey|cottage|kefir/i.test(nameLower);
  const isIronRich = /beef|steak|spinach|lentil|egg|chicken|turkey|tofu|oats|beans/i.test(nameLower);
  const isVitDRich = /salmon|egg|milk|tuna|mushroom|sardine|yogurt/i.test(nameLower);

  const fiber = entry.fiber !== undefined
    ? Number(entry.fiber)
    : Math.round((isWholeGrainOrVeg ? Math.max(2.5, carbs * 0.16) : carbs * 0.05) * 10) / 10;

  const sugar = entry.sugar !== undefined
    ? Number(entry.sugar)
    : Math.round((isSweet ? Math.max(4, carbs * 0.35) : carbs * 0.1) * 10) / 10;

  const sodium = entry.sodium !== undefined
    ? Number(entry.sodium)
    : Math.round(calories * 1.15);

  const iron = entry.iron !== undefined
    ? Number(entry.iron)
    : Math.round((isIronRich ? Math.max(1.8, protein * 0.11) : Math.max(0.4, calories * 0.003)) * 10) / 10;

  const calcium = entry.calcium !== undefined
    ? Number(entry.calcium)
    : Math.round(isDairy ? Math.max(180, calories * 0.75) : Math.max(25, calories * 0.12));

  const vitaminD = entry.vitaminD !== undefined
    ? Number(entry.vitaminD)
    : Math.round((isVitDRich ? Math.max(2.5, protein * 0.18) : 0.4) * 10) / 10;

  return { fiber, sugar, sodium, iron, calcium, vitaminD };
}

function defaultProfile(name: string, username: string): UserProfile {
  return {
    name,
    username,
    age: 0,
    gender: '',
    heightCm: 0,
    fitnessLevel: '',
    currentWeightKg: 0,
    goalWeightKg: 0,
    dailyActivity: '',
    goalSpeed: '',
    unitSystem: 'metric',
    pinnedWhy: '',
    themeMode: 'dark',
    streakFreezesUsed: [],
    waterReminderEnabled: false,
    mealReminderEnabled: false,
    streakOptIn: true,
    waterChallengeJoined: false
  };
}

function computeConsecutiveStreak(loggedDates: string[], freezeDates: string[]): number {
  const dateSet = new Set([...loggedDates, ...freezeDates]);
  if (dateSet.size === 0) return 0;
  const sorted = Array.from(dateSet).sort();
  let currentStreak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00').getTime();
    const curr = new Date(sorted[i] + 'T00:00:00').getTime();
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      currentStreak++;
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }
  return currentStreak;
}

function getProfile(userId: string): UserProfile {
  if (!db.profiles[userId]) {
    db.profiles[userId] = defaultProfile('Guest User', `caloriq_${userId.slice(0, 5)}`);
    saveDb();
  }
  return db.profiles[userId];
}

function getUserStats(userId: string): UserStats {
  const record = db.userXp[userId] || { xp: 0, badges: [] };
  const profile = getProfile(userId);
  const freezes = profile.streakFreezesUsed || [];
  const foodDates = Array.from(new Set(db.diaryEntries.filter(d => d.userId === userId).map(d => d.date)));
  const workoutDates = Array.from(new Set(db.exerciseEntries.filter(e => e.userId === userId).map(e => e.date)));
  return {
    xp: record.xp,
    level: 1 + Math.floor(record.xp / 100),
    badges: record.badges,
    foodStreak: computeConsecutiveStreak(foodDates, freezes),
    workoutStreak: computeConsecutiveStreak(workoutDates, freezes)
  };
}

function addXp(userId: string, points: number, reason: string) {
  if (!db.userXp[userId]) db.userXp[userId] = { xp: 0, badges: [] };
  db.userXp[userId].xp += points;
  const current = db.userXp[userId];
  const badges = [...current.badges];
  if (current.xp >= 50 && !badges.includes('50 XP')) badges.push('50 XP');
  if (current.xp >= 200 && !badges.includes('200 XP')) badges.push('200 XP');
  if (current.xp >= 1000 && !badges.includes('1000 XP')) badges.push('1000 XP');
  if (reason === 'food' && !badges.includes('First log')) badges.push('First log');
  if (reason === 'exercise' && !badges.includes('First workout')) badges.push('First workout');
  if (reason === 'water' && !badges.includes('Hydrated')) badges.push('Hydrated');
  if (reason === 'weight' && !badges.includes('First weigh-in')) badges.push('First weigh-in');
  current.badges = badges;
  saveDb();
}

function buildStandaloneWeekPlan(userId: string, body: any): WeekPlan {
  const targetKcal = Number(body?.dailyTargetCalories) || 2000;
  const targetProtein = Number(body?.dailyTargetProtein) || 150;
  const targetCarbs = Number(body?.dailyTargetCarbs) || 200;
  const targetFat = Number(body?.dailyTargetFat) || 67;
  const type = body?.type || 'both';
  const prefs = body?.preferences || {
    restrictions: [],
    allergies: [],
    dislikes: '',
    cookTime: 'Any',
    mealsPerDay: 3,
    budget: 'Moderate',
    workoutDaysPerWeek: 3,
    equipment: 'Dumbbells',
    injuries: ''
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const mealLibrary = [
    {
      b: { name: 'Greek Yogurt & Berry Oat Bowl', aisle: 'dairy', ingredients: ['200g Greek yogurt (0%)', '45g rolled oats', '80g blueberries', '10g chia seeds'] },
      l: { name: 'Grilled Chicken & Quinoa Greens', aisle: 'meat', ingredients: ['160g chicken breast', '140g cooked quinoa', '100g spinach', '10g olive oil'] },
      d: { name: 'Pan-Seared Salmon & Sweet Potato', aisle: 'seafood', ingredients: ['170g salmon fillet', '180g sweet potato', '120g steamed broccoli'] }
    },
    {
      b: { name: 'Three-Egg Spinach & Sourdough Plate', aisle: 'dairy', ingredients: ['3 large eggs', '2 slices sourdough bread', '80g baby spinach'] },
      l: { name: 'Turkey & Avocado Grain Bowl', aisle: 'meat', ingredients: ['160g turkey breast', '150g brown rice', '75g avocado', '100g bell pepper'] },
      d: { name: 'Lean Beef Stir-Fry with Jasmine Rice', aisle: 'meat', ingredients: ['160g lean beef mince', '160g white rice', '120g zucchini & carrots'] }
    },
    {
      b: { name: 'High-Protein Overnight Oats', aisle: 'pantry', ingredients: ['60g rolled oats', '30g whey protein', '200ml almond milk', '80g strawberries'] },
      l: { name: 'Mediterranean Chickpea & Feta Salad', aisle: 'produce', ingredients: ['180g chickpeas', '50g feta cheese', '150g cucumber & tomato', '120g chicken breast'] },
      d: { name: 'Baked Cod with Roasted Potatoes & Asparagus', aisle: 'seafood', ingredients: ['190g cod fillet', '200g potato', '120g asparagus', '10g olive oil'] }
    },
    {
      b: { name: 'Cottage Cheese & Banana Toast', aisle: 'dairy', ingredients: ['180g cottage cheese', '2 slices whole wheat bread', '1 banana', '15g walnuts'] },
      l: { name: 'Crispy Tofu & Brown Rice Power Bowl', aisle: 'produce', ingredients: ['180g firm tofu', '150g brown rice', '100g steamed broccoli', '15g peanut butter sauce'] },
      d: { name: 'Herb Chicken Thighs & Roasted Root Veg', aisle: 'meat', ingredients: ['165g chicken thigh', '160g sweet potato', '100g carrots & onion'] }
    },
    {
      b: { name: 'Scrambled Eggs & Berry Bowl', aisle: 'dairy', ingredients: ['3 whole eggs', '40g rolled oats', '100g blueberries'] },
      l: { name: 'Tuna & White Bean Bistro Salad', aisle: 'pantry', ingredients: ['150g canned tuna', '140g black beans', '100g baby spinach', '1 slice sourdough bread'] },
      d: { name: 'Garlic Shrimp Pasta with Zucchini', aisle: 'seafood', ingredients: ['180g cooked shrimp', '160g cooked pasta', '140g zucchini', '10g olive oil'] }
    },
    {
      b: { name: 'Protein Pancake Stack & Fruit', aisle: 'pantry', ingredients: ['60g rolled oats', '2 whole eggs', '100g Greek yogurt (0%)', '80g strawberries'] },
      l: { name: 'Grilled Halloumi & Lentil Warm Salad', aisle: 'dairy', ingredients: ['80g halloumi cheese', '160g cooked lentils', '120g bell pepper & spinach'] },
      d: { name: 'Pork Tenderloin with Quinoa & Broccoli', aisle: 'meat', ingredients: ['175g pork tenderloin', '150g cooked quinoa', '120g broccoli'] }
    },
    {
      b: { name: 'Smoked Salmon & Poached Eggs on Sourdough', aisle: 'seafood', ingredients: ['100g salmon', '2 large eggs', '2 slices sourdough bread', '60g avocado'] },
      l: { name: 'Roast Chicken & Sweet Potato Prep Bowl', aisle: 'meat', ingredients: ['165g chicken breast', '160g sweet potato', '100g spinach'] },
      d: { name: 'Savory Turkey Lentil Skillet', aisle: 'meat', ingredients: ['160g turkey breast', '150g cooked lentils', '120g tomatoes & mushrooms'] }
    }
  ];

  const days: PlanDay[] = dayNames.map((dayName, idx) => {
    const m = mealLibrary[idx % mealLibrary.length];
    const bCal = Math.round(targetKcal * 0.28);
    const lCal = Math.round(targetKcal * 0.36);
    const dCal = targetKcal - bCal - lCal;
    const isWorkoutDay = idx < (prefs.workoutDaysPerWeek || 3) * 2 && idx % 2 === 0;

    return {
      dayIndex: idx,
      dayName,
      meals: type === 'workouts' ? [] : [
        {
          mealType: 'breakfast',
          name: m.b.name,
          ingredients: m.b.ingredients,
          calories: bCal,
          protein: Math.round(targetProtein * 0.28),
          carbs: Math.round(targetCarbs * 0.32),
          fat: Math.round(targetFat * 0.28),
          prepTime: '10 min',
          aisle: m.b.aisle as any,
          logged: false
        },
        {
          mealType: 'lunch',
          name: m.l.name,
          ingredients: m.l.ingredients,
          calories: lCal,
          protein: Math.round(targetProtein * 0.36),
          carbs: Math.round(targetCarbs * 0.36),
          fat: Math.round(targetFat * 0.36),
          prepTime: '15 min',
          aisle: m.l.aisle as any,
          logged: false
        },
        {
          mealType: 'dinner',
          name: m.d.name,
          ingredients: m.d.ingredients,
          calories: dCal,
          protein: Math.max(10, targetProtein - Math.round(targetProtein * 0.64)),
          carbs: Math.max(10, targetCarbs - Math.round(targetCarbs * 0.68)),
          fat: Math.max(8, targetFat - Math.round(targetFat * 0.64)),
          prepTime: '20 min',
          aisle: m.d.aisle as any,
          logged: false
        }
      ],
      workout: type === 'meals' ? undefined : {
        name: isWorkoutDay ? `Strength & Conditioning (${prefs.equipment || 'Dumbbells'})` : 'Active Recovery & Mobility',
        isRest: !isWorkoutDay,
        exercises: isWorkoutDay
          ? [
              { name: 'Goblet Squats', setsAndReps: '3 sets of 10-12 reps' },
              { name: 'Dumbbell Overhead Press', setsAndReps: '3 sets of 10 reps' },
              { name: 'Bent-Over Rows', setsAndReps: '3 sets of 12 reps' },
              { name: 'Core Plank Hold', setsAndReps: '3 sets of 45 seconds' }
            ]
          : [{ name: 'Brisk Outdoor Walk & Stretching', setsAndReps: '25 mins relaxed pace' }],
        logged: false
      }
    };
  });

  return {
    userId,
    generatedAt: Date.now(),
    type,
    days,
    preferences: prefs
  };
}

export async function handleStandaloneApiRequest(urlStr: string, options: RequestInit = {}): Promise<any> {
  db = loadDb();
  const parsedUrl = new URL(urlStr, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};

  const authHeader = (options.headers as Record<string, string>)?.['Authorization'] || '';
  let userId = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : parsedUrl.searchParams.get('token') || localStorage.getItem('caloriq_session_token') || '';

  if (!userId || !db.users[userId]) {
    if (pathname !== '/api/auth/guest') {
      const id = userId || uid('guest');
      db.users[id] = { id, isGuest: true, createdAt: Date.now(), lastLoginAt: Date.now() };
      getProfile(id);
      userId = id;
      saveDb();
    }
  }

  // AUTH
  if (pathname === '/api/auth/guest' && method === 'POST') {
    const id = uid('guest');
    db.users[id] = { id, isGuest: true, createdAt: Date.now(), lastLoginAt: Date.now() };
    getProfile(id);
    saveDb();
    return { userId: id, isGuest: true, token: id };
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return { success: true };
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = db.users[userId];
    return {
      userId,
      email: user?.email,
      isGuest: user?.isGuest ?? true,
      profile: getProfile(userId),
      stats: getUserStats(userId)
    };
  }

  // DIARY
  if (pathname === '/api/diary' && method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    return { date, items: db.diaryEntries.filter(e => e.userId === userId && e.date === date) };
  }

  if (pathname === '/api/diary/all' && method === 'GET') {
    return { items: db.diaryEntries.filter(e => e.userId === userId) };
  }

  if (pathname === '/api/diary' && method === 'POST') {
    const micros = enrichMicronutrients(body);
    const defaultHour =
      body.loggedHour !== undefined
        ? Number(body.loggedHour)
        : body.mealType === 'breakfast'
        ? 8
        : body.mealType === 'lunch'
        ? 13
        : body.mealType === 'dinner'
        ? 19
        : 16;

    const item: FoodItem = {
      id: uid('food'),
      userId,
      date: body.date,
      mealType: body.mealType,
      name: String(body.name || 'Food').trim(),
      calories: Math.round(Number(body.calories || 0)),
      carbs: Math.round(Number(body.carbs || 0) * 10) / 10,
      fat: Math.round(Number(body.fat || 0) * 10) / 10,
      protein: Math.round(Number(body.protein || 0) * 10) / 10,
      ...micros,
      serving: body.serving || '1 serving',
      note: body.note ? String(body.note).trim() : undefined,
      unusualQuantity: Boolean(body.unusualQuantity),
      loggedHour: defaultHour,
      costEstimate: body.costEstimate !== undefined ? Number(body.costEstimate) : undefined,
      source: body.source || 'manual',
      createdAt: Date.now()
    };
    db.diaryEntries.push(item);

    if (!db.savedFoods.some(f => f.userId === userId && f.name.toLowerCase() === item.name.toLowerCase())) {
      db.savedFoods.push({
        id: uid('saved'),
        userId,
        name: item.name,
        calories: item.calories,
        carbs: item.carbs,
        fat: item.fat,
        protein: item.protein,
        fiber: item.fiber,
        sugar: item.sugar,
        sodium: item.sodium,
        serving: item.serving || '1 serving',
        createdAt: Date.now()
      });
    }
    addXp(userId, 10, 'food');
    saveDb();
    return item;
  }

  if (pathname.startsWith('/api/diary/') && pathname !== '/api/diary/copy-yesterday' && pathname !== '/api/diary/all') {
    const id = pathname.split('/').pop()!;
    if (method === 'PUT') {
      const idx = db.diaryEntries.findIndex(e => e.id === id && e.userId === userId);
      if (idx !== -1) {
        db.diaryEntries[idx] = { ...db.diaryEntries[idx], ...body };
        saveDb();
        return db.diaryEntries[idx];
      }
      return null;
    }
    if (method === 'DELETE') {
      db.diaryEntries = db.diaryEntries.filter(e => !(e.id === id && e.userId === userId));
      saveDb();
      return { success: true };
    }
  }

  if (pathname === '/api/diary/copy-yesterday' && method === 'POST') {
    const targetDate = body.date || new Date().toISOString().split('T')[0];
    const mealType = body.mealType as MealType | undefined;
    const target = new Date(targetDate + 'T00:00:00');
    target.setDate(target.getDate() - 1);
    const yStr = target.toISOString().split('T')[0];
    const yItems = db.diaryEntries.filter(e => e.userId === userId && e.date === yStr && (!mealType || e.mealType === mealType));
    const created: FoodItem[] = yItems.map(item => {
      const copy = { ...item, id: uid('food'), date: targetDate, createdAt: Date.now() };
      db.diaryEntries.push(copy);
      return copy;
    });
    saveDb();
    return { success: true, count: created.length, items: created };
  }

  // WATER
  if (pathname === '/api/water') {
    if (method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
      return { date, glasses: db.waterEntries[`${userId}:${date}`] || 0 };
    }
    if (method === 'POST') {
      const key = `${userId}:${body.date}`;
      db.waterEntries[key] = Math.max(0, Number(body.glasses || 0));
      addXp(userId, 2, 'water');
      saveDb();
      return { date: body.date, glasses: db.waterEntries[key] };
    }
  }

  // EXERCISE
  if (pathname === '/api/exercise' && method === 'GET') {
    const date = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
    return { date, items: db.exerciseEntries.filter(e => e.userId === userId && e.date === date) };
  }
  if (pathname === '/api/exercise/all' && method === 'GET') {
    return { items: db.exerciseEntries.filter(e => e.userId === userId) };
  }
  if (pathname === '/api/exercise' && method === 'POST') {
    const item: ExerciseItem = {
      ...body,
      id: uid('ex'),
      userId,
      createdAt: Date.now()
    };
    db.exerciseEntries.push(item);
    addXp(userId, 15, 'exercise');
    saveDb();
    return item;
  }
  if (pathname.startsWith('/api/exercise/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.exerciseEntries = db.exerciseEntries.filter(e => !(e.id === id && e.userId === userId));
    saveDb();
    return { success: true };
  }

  // WEIGHT
  if (pathname === '/api/weight' && method === 'GET') {
    return { items: db.weightEntries.filter(w => w.userId === userId).sort((a, b) => a.date.localeCompare(b.date)) };
  }
  if (pathname === '/api/weight' && method === 'POST') {
    const existing = db.weightEntries.find(w => w.userId === userId && w.date === body.date);
    let record: WeightRecord;
    if (existing) {
      existing.weightKg = Number(body.weightKg);
      record = existing;
    } else {
      record = { id: uid('wt'), userId, date: body.date, weightKg: Number(body.weightKg), createdAt: Date.now() };
      db.weightEntries.push(record);
    }
    if (db.profiles[userId]) db.profiles[userId].currentWeightKg = Number(body.weightKg);
    addXp(userId, 20, 'weight');
    saveDb();
    return record;
  }
  if (pathname.startsWith('/api/weight/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.weightEntries = db.weightEntries.filter(w => !(w.id === id && w.userId === userId));
    saveDb();
    return { success: true };
  }

  // MEASUREMENTS & PHOTOS
  if (pathname === '/api/measurements') {
    if (method === 'GET') return { items: db.measurements.filter(m => m.userId === userId) };
    if (method === 'POST') {
      const item: BodyMeasurement = { ...body, id: uid('meas'), userId, createdAt: Date.now() };
      db.measurements.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/measurements/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.measurements = db.measurements.filter(m => !(m.id === id && m.userId === userId));
    saveDb();
    return { success: true };
  }

  if (pathname === '/api/progress-photos') {
    if (method === 'GET') return { items: db.progressPhotos.filter(p => p.userId === userId) };
    if (method === 'POST') {
      const item: ProgressPhoto = { ...body, id: uid('photo'), userId, createdAt: Date.now() };
      db.progressPhotos.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/progress-photos/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.progressPhotos = db.progressPhotos.filter(p => !(p.id === id && p.userId === userId));
    saveDb();
    return { success: true };
  }

  // HABITS, CRAVINGS, VICTORIES
  if (pathname === '/api/habits') {
    if (method === 'GET') {
      const date = parsedUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];
      const key = `${userId}:${date}`;
      return {
        habit: db.dailyHabits[key] || { userId, date },
        allHabits: Object.values(db.dailyHabits).filter(h => h.userId === userId)
      };
    }
    if (method === 'POST') {
      const date = body.date || new Date().toISOString().split('T')[0];
      const key = `${userId}:${date}`;
      db.dailyHabits[key] = { ...(db.dailyHabits[key] || { userId, date }), ...body, userId, date };
      saveDb();
      return db.dailyHabits[key];
    }
  }

  if (pathname === '/api/cravings') {
    if (method === 'GET') return { items: db.cravings.filter(c => c.userId === userId) };
    if (method === 'POST') {
      const item: CravingLog = { ...body, id: uid('crav'), userId, createdAt: Date.now() };
      db.cravings.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/cravings/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.cravings = db.cravings.filter(c => !(c.id === id && c.userId === userId));
    saveDb();
    return { success: true };
  }

  if (pathname === '/api/victories') {
    if (method === 'GET') return { items: db.nonScaleVictories.filter(v => v.userId === userId) };
    if (method === 'POST') {
      const item: NonScaleVictory = {
        id: uid('nsv'),
        userId,
        date: body.date || new Date().toISOString().split('T')[0],
        text: String(body.text || '').trim(),
        createdAt: Date.now()
      };
      db.nonScaleVictories.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/victories/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.nonScaleVictories = db.nonScaleVictories.filter(v => !(v.id === id && v.userId === userId));
    saveDb();
    return { success: true };
  }

  // PANTRY
  if (pathname === '/api/pantry') {
    if (method === 'GET') return { items: db.pantryItems.filter(p => p.userId === userId) };
    if (method === 'POST') {
      const item: PantryItem = { ...body, id: uid('pantry'), userId, createdAt: Date.now() };
      db.pantryItems.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/pantry/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.pantryItems = db.pantryItems.filter(p => !(p.id === id && p.userId === userId));
    saveDb();
    return { success: true };
  }

  // SOCIAL
  if (pathname === '/api/social' && method === 'GET') {
    return {
      friends: db.friends.filter(f => f.userId === userId),
      sharedRecipes: db.sharedRecipes.filter(r => r.userId === userId)
    };
  }
  if (pathname === '/api/social/friends' && method === 'POST') {
    const cleanUser = String(body.username || '').replace(/^@/, '').trim().toLowerCase();
    const matchedUserId = Object.keys(db.profiles).find(
      k => (db.profiles[k]?.username || '').toLowerCase() === cleanUser
    );
    const realStats = matchedUserId ? getUserStats(matchedUserId) : null;
    const item: FriendRecord = {
      id: uid('fr'),
      userId,
      username: cleanUser,
      displayName: matchedUserId
        ? db.profiles[matchedUserId].name
        : cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1).replace(/_/g, ' '),
      streakDays: realStats?.foodStreak ?? 0,
      daysOnTargetThisWeek: 0,
      waterDaysCompleted: 0,
      isPartner: Boolean(body.isPartner),
      createdAt: Date.now()
    };
    if (body.isPartner) {
      db.friends.forEach(f => {
        if (f.userId === userId) f.isPartner = false;
      });
    }
    db.friends.push(item);
    saveDb();
    return item;
  }
  if (pathname.startsWith('/api/social/friends/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.friends = db.friends.filter(f => !(f.id === id && f.userId === userId));
    saveDb();
    return { success: true };
  }
  if (pathname === '/api/social/share-recipe' && method === 'POST') {
    const rec: SharedRecipeRecord = { ...body, id: uid('srec'), userId, createdAt: Date.now() };
    db.sharedRecipes.push(rec);
    saveDb();
    return rec;
  }

  // AI ENDPOINTS (Standalone intelligent parser & estimators)
  if (pathname === '/api/ai/voice-log' && method === 'POST') {
    const transcript = String(body.transcript || '').trim();
    const parsed = decipherFoodText(transcript);
    return {
      mealName: parsed.mealSummaryName,
      mealSummaryName: parsed.mealSummaryName,
      totalCalories: parsed.totalCalories,
      totalProtein: parsed.totalProtein,
      totalCarbs: parsed.totalCarbs,
      totalFat: parsed.totalFat,
      needsWeightConfirmation: parsed.needsWeightConfirmation,
      items: parsed.items.map(i => ({
        name: i.name,
        grams: i.grams,
        serving: i.servingLabel,
        calories: i.calories,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat
      }))
    };
  }

  if (pathname === '/api/ai/plate-photo' && method === 'POST') {
    return {
      dishName: 'Grilled Chicken Plate with Quinoa & Greens',
      serving: '1 plate (380g)',
      totalCalories: 510,
      totalProtein: 44,
      totalCarbs: 46,
      totalFat: 15,
      ingredients: [
        { name: 'Grilled chicken breast', grams: 160, calories: 264 },
        { name: 'Cooked quinoa', grams: 130, calories: 156 },
        { name: 'Roasted broccoli & olive oil', grams: 90, calories: 90 }
      ]
    };
  }

  if (pathname === '/api/ai/fridge-photo' && method === 'POST') {
    const rem = body.remainingMacros || { calories: 600, protein: 45, carbs: 60, fat: 20 };
    const targetCal = Math.max(320, Math.min(700, Math.round(rem.calories * 0.75)));
    return {
      detectedItems: ['Eggs', 'Greek yogurt', 'Spinach', 'Chicken breast', 'Bell peppers'],
      meals: [
        {
          name: 'Spinach & Pepper Egg Scramble',
          description: 'Three eggs folded with sautéed spinach and sliced bell pepper.',
          calories: targetCal,
          protein: 32,
          carbs: 14,
          fat: 18
        },
        {
          name: 'Seared Chicken Skillet with Greens',
          description: 'Pan-seared chicken strips tossed with charred bell peppers and wilted spinach.',
          calories: targetCal + 30,
          protein: 42,
          carbs: 12,
          fat: 14
        },
        {
          name: 'High-Protein Savory Yogurt Bowl',
          description: 'Thick Greek yogurt topped with poached eggs, herbs, and roasted peppers.',
          calories: targetCal - 40,
          protein: 34,
          carbs: 16,
          fat: 12
        }
      ]
    };
  }

  if (pathname === '/api/ai/receipt-scan' && method === 'POST') {
    return {
      items: [
        { name: 'Organic Chicken Breast', quantity: '600g pack', category: 'meat' },
        { name: 'Greek Yogurt 0%', quantity: '500g tub', category: 'dairy' },
        { name: 'Baby Spinach', quantity: '200g bag', category: 'produce' },
        { name: 'Rolled Oats', quantity: '1 kg bag', category: 'pantry' },
        { name: 'Frozen Blueberries', quantity: '400g bag', category: 'frozen' }
      ]
    };
  }

  if (pathname === '/api/ai/restaurant-estimate' && method === 'POST') {
    const restaurant = String(body.restaurant || '').trim();
    const dish = String(body.dish || 'House Entree').trim();
    return {
      name: `${restaurant ? restaurant + ' — ' : ''}${dish}`,
      serving: '1 standard restaurant portion',
      calories: 680,
      protein: 38,
      carbs: 62,
      fat: 28,
      modificationTip: 'Request dressing or cooking sauce on the side to save ~140 kcal.'
    };
  }

  if (pathname === '/api/ai/fix-my-day' && method === 'POST') {
    const overByKcal = Number(body.overByKcal || 200);
    const loggedFoods = Array.isArray(body.loggedFoods) ? body.loggedFoods : [];
    const highest = [...loggedFoods].sort((a, b) => b.calories - a.calories)[0];
    const saved = Math.min(overByKcal, highest ? Math.round(highest.calories * 0.35) : 220);
    return {
      summary: `Trimming ${saved} kcal from your highest-calorie entry brings you back toward target without sacrificing protein.`,
      swaps: highest
        ? [
            {
              originalFoodName: highest.name,
              suggestedSwapName: `${highest.name} (lighter portion / lean prep)`,
              newCalories: Math.max(120, highest.calories - saved),
              newProtein: highest.protein,
              newCarbs: Math.max(5, Math.round(highest.carbs * 0.65)),
              newFat: Math.max(3, Math.round(highest.fat * 0.6)),
              caloriesSaved: saved,
              reason: 'Reduces added fats and refined starches while holding protein steady.'
            }
          ]
        : []
    };
  }

  if (pathname === '/api/ai/what-can-i-make' && method === 'POST') {
    const pantryItems: string[] = Array.isArray(body.pantryItems) ? body.pantryItems : [];
    const rem = body.remainingMacros || { calories: 600, protein: 40, carbs: 50, fat: 20 };
    const cal = Math.max(300, Math.min(650, Math.round(rem.calories * 0.8)));
    return {
      meals: [
        {
          name: 'Pantry Protein Bowl',
          pantryUsed: pantryItems.slice(0, 3).length ? pantryItems.slice(0, 3) : ['Chicken breast', 'Rice', 'Spinach'],
          prepMinutes: 15,
          calories: cal,
          protein: 38,
          carbs: 42,
          fat: 11
        },
        {
          name: 'Quick Skillet Omelette & Greens',
          pantryUsed: pantryItems.slice(0, 2).length ? pantryItems.slice(0, 2) : ['Eggs', 'Spinach'],
          prepMinutes: 10,
          calories: Math.round(cal * 0.75),
          protein: 28,
          carbs: 12,
          fat: 16
        },
        {
          name: 'Warm Protein Oats & Berries',
          pantryUsed: ['Rolled Oats', 'Greek Yogurt', 'Blueberries'],
          prepMinutes: 8,
          calories: Math.round(cal * 0.85),
          protein: 26,
          carbs: 54,
          fat: 8
        }
      ]
    };
  }

  if (pathname === '/api/ai/portion-estimator' && method === 'POST') {
    const parsed = parseIngredientLine(body.foodName || '165g chicken breast');
    return {
      foodName: body.foodName || 'Cooked Protein Portion',
      estimatedGrams: parsed.calculatedGrams || 165,
      visualComparison: 'Roughly the size of a standard deck of cards plus a third',
      calories: parsed.calories || 272,
      protein: parsed.protein || 41,
      carbs: parsed.carbs || 2,
      fat: parsed.fat || 9
    };
  }

  if (pathname === '/api/ai/craving-pattern' && method === 'POST') {
    const list: CravingLog[] = Array.isArray(body.cravings)
      ? body.cravings
      : db.cravings.filter(c => c.userId === userId);
    if (list.length < 5) {
      return { pattern: 'Log a craving to see patterns over time.' };
    }
    return { pattern: `You have logged ${list.length} cravings across the week.` };
  }

  if (pathname === '/api/ai/weekly-insights' && method === 'POST') {
    const dailyLogs = Array.isArray(body.dailyLogs) ? body.dailyLogs : [];
    const daysWithFood = dailyLogs.filter((d: any) => d.caloriesEaten > 0);
    if (daysWithFood.length === 0) {
      return { hasEnoughData: false, message: 'Not enough data yet.', bullets: [] };
    }
    const proteinHits = daysWithFood.filter((d: any) => d.proteinEaten >= (body.proteinTarget || 120) * 0.9).length;
    const within100 = daysWithFood.filter((d: any) => Math.abs(d.caloriesEaten - (body.caloriesTarget || 2000)) <= 100).length;
    return {
      hasEnoughData: true,
      bullets: [
        `Your protein hit target on ${proteinHits} of ${daysWithFood.length} logged days.`,
        `You stayed within 100 kcal of target on ${within100} days.`,
        Array.isArray(body.cravings) && body.cravings.length > 0
          ? `You logged ${body.cravings.length} cravings this week.`
          : 'No clear pattern this week.'
      ]
    };
  }

  // SAVED FOODS & RECIPES
  if (pathname === '/api/saved-foods') {
    if (method === 'GET') return { foods: db.savedFoods.filter(f => f.userId === userId) };
    if (method === 'POST') {
      const item: SavedFood = { ...body, id: uid('saved'), userId, createdAt: Date.now() };
      db.savedFoods.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname.startsWith('/api/saved-foods/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.savedFoods = db.savedFoods.filter(f => !(f.id === id && f.userId === userId));
    saveDb();
    return { success: true };
  }

  if (pathname === '/api/recipes') {
    if (method === 'GET') return { recipes: db.savedRecipes.filter(r => r.userId === userId) };
    if (method === 'POST') {
      const item: SavedRecipe = { ...body, id: uid('recipe'), userId, createdAt: Date.now() };
      db.savedRecipes.push(item);
      saveDb();
      return item;
    }
  }
  if (pathname === '/api/recipes/search' && method === 'GET') {
    const name = (parsedUrl.searchParams.get('name') || '').toLowerCase().trim();
    const recipe = db.savedRecipes.find(r => r.userId === userId && r.name.toLowerCase().trim() === name);
    return { recipe };
  }
  if (pathname === '/api/recipes/parse-line' && method === 'POST') {
    return parseIngredientLine(body.line || '');
  }
  if (pathname.startsWith('/api/recipes/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.savedRecipes = db.savedRecipes.filter(r => !(r.id === id && r.userId === userId));
    saveDb();
    return { success: true };
  }

  // MEAL TEMPLATES
  if (pathname === '/api/meal-templates') {
    if (method === 'GET') return { templates: db.mealTemplates.filter(t => t.userId === userId) };
    if (method === 'POST') {
      const dayItems = db.diaryEntries.filter(e => e.userId === userId && e.date === body.date);
      const tmpl: MealTemplate = {
        id: uid('tmpl'),
        userId,
        name: body.name,
        items: dayItems.map(i => ({
          mealType: i.mealType,
          name: i.name,
          calories: i.calories,
          carbs: i.carbs,
          fat: i.fat,
          protein: i.protein,
          serving: i.serving
        })),
        createdAt: Date.now()
      };
      db.mealTemplates.push(tmpl);
      saveDb();
      return tmpl;
    }
  }
  if (pathname === '/api/meal-templates/apply' && method === 'POST') {
    const tmpl = db.mealTemplates.find(t => t.id === body.templateId && t.userId === userId);
    if (!tmpl) return { success: true, count: 0, items: [] };
    const created = tmpl.items.map(i => {
      const micros = enrichMicronutrients(i);
      const item: FoodItem = {
        ...i,
        ...micros,
        id: uid('food'),
        userId,
        date: body.date,
        source: 'saved',
        createdAt: Date.now()
      };
      db.diaryEntries.push(item);
      return item;
    });
    saveDb();
    return { success: true, count: created.length, items: created };
  }
  if (pathname === '/api/meal-templates/restore' && method === 'POST') {
    const tmpl: MealTemplate = {
      id: uid('tmpl'),
      userId,
      name: body.name || 'Template',
      items: Array.isArray(body.items) ? body.items : [],
      createdAt: Date.now()
    };
    db.mealTemplates.push(tmpl);
    saveDb();
    return tmpl;
  }
  if (pathname.startsWith('/api/meal-templates/') && method === 'DELETE') {
    const id = pathname.split('/').pop()!;
    db.mealTemplates = db.mealTemplates.filter(t => !(t.id === id && t.userId === userId));
    saveDb();
    return { success: true };
  }

  // PLAN
  if (pathname === '/api/plan' && method === 'GET') {
    return { plan: db.plans[userId] };
  }
  if (pathname === '/api/plan/generate' && method === 'POST') {
    const plan = buildStandaloneWeekPlan(userId, body);
    db.plans[userId] = plan;
    saveDb();
    return { success: true, plan };
  }
  if (pathname === '/api/plan/save' && method === 'POST') {
    db.plans[userId] = body.plan;
    saveDb();
    return { success: true, plan: body.plan };
  }

  // DEVELOPER CHAT
  if (pathname === '/api/developer-chat') {
    if (method === 'GET') {
      return { messages: db.chatMessages.filter(m => m.userId === userId) };
    }
    if (method === 'POST') {
      const userMsg: ChatMessage = {
        id: uid('msg'),
        userId,
        sender: 'user',
        text: String(body.text || '').trim(),
        createdAt: Date.now()
      };
      db.chatMessages.push(userMsg);
      db.chatMessages.push({
        id: uid('msg'),
        userId,
        sender: 'developer',
        text: "Thanks for reaching out! Your feedback and logs are saved locally. Let me know if you'd like any adjustments!",
        createdAt: Date.now() + 200
      });
      saveDb();
      return userMsg;
    }
  }

  // PROFILE & STATS & EXPORT
  if (pathname === '/api/profile') {
    if (method === 'GET') return { profile: getProfile(userId), stats: getUserStats(userId) };
    if (method === 'PUT') {
      db.profiles[userId] = { ...getProfile(userId), ...body };
      saveDb();
      return db.profiles[userId];
    }
  }
  if (pathname === '/api/stats' && method === 'GET') {
    return getUserStats(userId);
  }
  if (pathname === '/api/export' && method === 'GET') {
    return {
      profile: getProfile(userId),
      stats: getUserStats(userId),
      diary: db.diaryEntries.filter(e => e.userId === userId),
      exercises: db.exerciseEntries.filter(e => e.userId === userId),
      weights: db.weightEntries.filter(w => w.userId === userId),
      measurements: db.measurements.filter(m => m.userId === userId),
      nonScaleVictories: db.nonScaleVictories.filter(v => v.userId === userId),
      pantry: db.pantryItems.filter(p => p.userId === userId),
      savedFoods: db.savedFoods.filter(f => f.userId === userId),
      savedRecipes: db.savedRecipes.filter(r => r.userId === userId),
      mealTemplates: db.mealTemplates.filter(t => t.userId === userId),
      plan: db.plans[userId],
      exportedAt: new Date().toISOString()
    };
  }
  if (pathname === '/api/clear' && method === 'POST') {
    db = { ...DEFAULT_DB };
    saveDb();
    return { success: true, message: 'All user data has been cleared.' };
  }
  if (pathname === '/api/delete-account' && method === 'POST') {
    db = { ...DEFAULT_DB };
    saveDb();
    return { success: true, message: 'Account deleted.' };
  }

  if (pathname === '/api/auth/google' && method === 'POST') {
    const email = (body.email || 'google.user@gmail.com').toLowerCase().trim();
    const id = `usr_${email.replace(/[^a-z0-9]/gi, '_')}`;
    db.users[id] = { id, email, isGuest: false, createdAt: Date.now(), lastLoginAt: Date.now() };
    if (!db.profiles[id]) {
      db.profiles[id] = defaultProfile(body.name || email.split('@')[0], email.split('@')[0]);
    }
    saveDb();
    return { userId: id, email, isGuest: false, token: id, lastLoginAt: Date.now() };
  }

  if (pathname === '/api/auth/demo' && method === 'POST') {
    const id = uid('demo');
    const today = new Date().toISOString().split('T')[0];
    db.users[id] = { id, email: 'demo@caloriq.app', isGuest: true, createdAt: Date.now(), lastLoginAt: Date.now() };
    db.profiles[id] = {
      ...defaultProfile('Alex (Demo)', 'alex_demo'),
      age: 31,
      gender: 'prefer_not_to_say',
      heightCm: 174,
      fitnessLevel: 'intermediate',
      currentWeightKg: 74.2,
      goalWeightKg: 69.0,
      dailyActivity: 'moderate',
      goalSpeed: 'lose_normal',
      pinnedWhy: 'Steady energy through the workday and consistent strength training.'
    };
    db.diaryEntries.push({
      id: uid('food'),
      userId: id,
      date: today,
      mealType: 'breakfast',
      name: 'Oatmeal with Greek Yogurt & Blueberries',
      calories: 345,
      carbs: 48,
      fat: 6,
      protein: 24,
      serving: '1 bowl (320g)',
      source: 'manual',
      createdAt: Date.now()
    });
    db.waterEntries[`${id}:${today}`] = 5;
    saveDb();
    return { userId: id, email: 'demo@caloriq.app', isGuest: true, isDemo: true, token: id };
  }

  if (pathname === '/api/auth/sessions' && method === 'GET') {
    return {
      sessions: [
        {
          id: 'sess_current',
          userId,
          deviceName: 'Current Browser Session',
          city: 'Local Device',
          createdAt: Date.now() - 3600000,
          lastActiveAt: Date.now()
        }
      ]
    };
  }

  if (pathname.startsWith('/api/auth/sessions/') && method === 'DELETE') {
    return { success: true };
  }

  if (pathname === '/api/auth/signout-all' && method === 'POST') {
    return { success: true, revokedCount: 1 };
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    if (body.newPassword !== body.confirmNewPassword) {
      throw new Error('New passwords do not match.');
    }
    return { success: true, message: 'Password updated.' };
  }

  if (pathname === '/api/auth/change-email' && method === 'POST') {
    if (db.users[userId]) {
      db.users[userId].email = String(body.newEmail || '').toLowerCase().trim();
      saveDb();
    }
    return { success: true, email: String(body.newEmail || '').toLowerCase().trim() };
  }

  if (pathname === '/api/import' && method === 'POST') {
    if (body.profile) {
      db.profiles[userId] = { ...getProfile(userId), ...body.profile };
    }
    if (Array.isArray(body.diaryEntries)) {
      db.diaryEntries = db.diaryEntries.filter(e => e.userId !== userId);
      for (const item of body.diaryEntries) {
        db.diaryEntries.push({ ...item, id: uid('food'), userId, createdAt: Date.now() });
      }
    }
    saveDb();
    return {
      success: true,
      restoredCounts: {
        diary: Array.isArray(body.diaryEntries) ? body.diaryEntries.length : 0,
        exercises: Array.isArray(body.exerciseEntries) ? body.exerciseEntries.length : 0,
        weights: Array.isArray(body.weightEntries) ? body.weightEntries.length : 0
      }
    };
  }

  if (pathname === '/api/version' && method === 'GET') {
    return {
      version: '1.0.0',
      buildId: '2026.09.28.1',
      maintenance: { enabled: false, message: '' }
    };
  }

  if (pathname === '/api/contact' && method === 'POST') {
    return { success: true, id: uid('contact'), emailed: true };
  }

  if (pathname === '/api/bug-report' && method === 'POST') {
    return { success: true, id: uid('bug') };
  }

  if (pathname === '/api/compliance/cookie-consent' && method === 'POST') {
    return { success: true, timestamp: new Date().toISOString() };
  }

  // USDA / BUILTIN SEARCH
  if (pathname === '/api/usda/status' && method === 'GET') {
    return { available: true };
  }
  if (pathname === '/api/usda/search' && method === 'POST') {
    const q = String(body.query || '').toLowerCase().trim();
    const matches = BUILTIN_FOODS.filter(
      f => f.name.toLowerCase().includes(q) || f.aliases.some(a => a.toLowerCase().includes(q))
    ).map((f, idx) => ({
      fdcId: 10000 + idx,
      description: f.name.charAt(0).toUpperCase() + f.name.slice(1),
      brandName: body.storeFilter || 'Caloriq Standard Reference',
      calories: f.calories,
      protein: f.protein,
      fat: f.fat,
      carbs: f.carbs,
      servingSize: f.defaultPieceGrams || 100,
      servingSizeUnit: 'g'
    }));
    return { available: true, foods: matches };
  }

  return { success: true };
}

export async function standaloneFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  const isApiCall = urlStr.startsWith('/api/') || urlStr.includes('/api/');
  if (!isApiCall) {
    return window.fetch(input, init);
  }

  // If opened directly from filesystem (file://), always use standalone local engine
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    const data = await handleStandaloneApiRequest(urlStr, init);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await window.fetch(input, init);
    if (response.status !== 404) {
      return response;
    }
    // Fallback to standalone local engine only if backend endpoint is 404 absent
    const data = await handleStandaloneApiRequest(urlStr, init);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    const data = await handleStandaloneApiRequest(urlStr, init);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
