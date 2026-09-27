import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  SharedRecipeRecord
} from '../types/index.js';

export interface UserRow {
  id: string;
  email?: string;
  passwordHash?: string;
  isGuest: boolean;
  createdAt: number;
  lastLoginAt: number;
}

export interface SettingsRow {
  id: string;
  usdaApiKey?: string;
}

export interface DatabaseSchema {
  users: Record<string, UserRow>;
  profiles: Record<string, UserProfile>;
  diaryEntries: FoodItem[];
  waterEntries: Record<string, number>; // key: `${userId}:${date}` -> glasses
  exerciseEntries: ExerciseItem[];
  weightEntries: WeightRecord[];
  measurements: BodyMeasurement[];
  progressPhotos: ProgressPhoto[];
  dailyHabits: Record<string, DailyHabitLog>; // key: `${userId}:${date}`
  cravings: CravingLog[];
  nonScaleVictories: NonScaleVictory[];
  pantryItems: PantryItem[];
  friends: FriendRecord[];
  sharedRecipes: SharedRecipeRecord[];
  savedFoods: SavedFood[];
  savedRecipes: SavedRecipe[];
  mealTemplates: MealTemplate[];
  plans: Record<string, WeekPlan>; // key: userId
  chatMessages: ChatMessage[];
  userXp: Record<string, { xp: number; badges: string[] }>;
  settings: SettingsRow;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'caloriq-db.json');

const INITIAL_DB: DatabaseSchema = {
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
  userXp: {},
  settings: { id: 'global' }
};

let db: DatabaseSchema = { ...INITIAL_DB };

function isLegacyDefaultProfile(prof: UserProfile): boolean {
  return (
    prof.age === 28 &&
    prof.gender === 'female' &&
    prof.heightCm === 168 &&
    prof.fitnessLevel === 'intermediate' &&
    prof.currentWeightKg === 65 &&
    prof.goalWeightKg === 60 &&
    prof.dailyActivity === 'moderate'
  );
}

function initDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      const fakeUsernames = new Set(['claire_m', 'marcus_r', 'elena_v']);
      const cleanedFriends = (parsed.friends || []).filter(
        (f: any) => !fakeUsernames.has(String(f.username || '').toLowerCase())
      );
      const cleanedProfiles: Record<string, UserProfile> = parsed.profiles || {};
      for (const uid of Object.keys(cleanedProfiles)) {
        const prof = cleanedProfiles[uid];
        if (!prof) continue;
        if (prof.accountabilityPartner && fakeUsernames.has(prof.accountabilityPartner.toLowerCase())) {
          delete prof.accountabilityPartner;
        }
        if (isLegacyDefaultProfile(prof)) {
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
      db = {
        ...INITIAL_DB,
        ...parsed,
        profiles: cleanedProfiles,
        measurements: parsed.measurements || [],
        progressPhotos: parsed.progressPhotos || [],
        dailyHabits: parsed.dailyHabits || {},
        cravings: parsed.cravings || [],
        nonScaleVictories: parsed.nonScaleVictories || [],
        pantryItems: parsed.pantryItems || [],
        friends: cleanedFriends,
        sharedRecipes: parsed.sharedRecipes || []
      };
      saveDb();
    } else {
      saveDb();
    }
  } catch (err) {
    console.error('Failed to initialize database, using in-memory fallback', err);
  }
}

let saveTimeout: NodeJS.Timeout | null = null;
function saveDb() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (err) {
      console.error('Error persisting database:', err);
    }
  }, 100);
}

initDb();

// SSE Sync Broadcast Hub
type SseClient = {
  id: string;
  userId: string;
  res: any;
};

const sseClients: SseClient[] = [];

export function registerSseClient(userId: string, res: any): () => void {
  const clientId = crypto.randomUUID();
  sseClients.push({ id: clientId, userId, res });

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

  return () => {
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) {
      sseClients.splice(idx, 1);
    }
  };
}

export function broadcastSync(userId: string, action: string, data?: any) {
  const payload = JSON.stringify({ type: 'sync', action, data, timestamp: Date.now() });
  for (const client of sseClients) {
    if (client.userId === userId) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        // Client might have closed
      }
    }
  }
}

// Helper to estimate micronutrients when not explicitly supplied
function enrichMicronutrients(entry: Partial<FoodItem>): {
  fiber: number;
  sugar: number;
  sodium: number;
  iron: number;
  calcium: number;
  vitaminD: number;
} {
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

// ------------------- AUTH & USERS -------------------
function createEmptyProfile(name: string, username: string): UserProfile {
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

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`caloriq_salt_${password}`).digest('hex');
}

export function createGuestUser(): UserRow {
  const id = `guest_${crypto.randomUUID()}`;
  const user: UserRow = {
    id,
    isGuest: true,
    createdAt: Date.now(),
    lastLoginAt: Date.now()
  };
  db.users[id] = user;
  db.profiles[id] = createEmptyProfile('Guest User', `caloriq_${id.slice(6, 11)}`);
  db.userXp[id] = { xp: 0, badges: [] };
  saveDb();
  return user;
}

export function findUserById(id: string): UserRow | undefined {
  return db.users[id];
}

export function findUserByEmail(email: string): UserRow | undefined {
  const norm = email.toLowerCase().trim();
  return Object.values(db.users).find(u => u.email === norm);
}

export function signupUser(email: string, password: string, guestIdToMigrate?: string): UserRow {
  const norm = email.toLowerCase().trim();
  const pwHash = hashPassword(password);
  let user = findUserByEmail(norm);

  if (user) {
    if (user.passwordHash && user.passwordHash !== pwHash) {
      throw new Error('An account with this email already exists. Please sign in.');
    }
    user.passwordHash = pwHash;
    user.lastLoginAt = Date.now();
  } else {
    const id = `usr_${crypto.randomUUID()}`;
    user = {
      id,
      email: norm,
      passwordHash: pwHash,
      isGuest: false,
      createdAt: Date.now(),
      lastLoginAt: Date.now()
    };
    db.users[id] = user;
    const defaultUsername = norm.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    db.profiles[id] = createEmptyProfile('', defaultUsername);
    db.userXp[id] = { xp: 0, badges: [] };
  }

  if (guestIdToMigrate && guestIdToMigrate !== user.id && db.users[guestIdToMigrate]) {
    migrateGuestData(guestIdToMigrate, user.id);
  }

  saveDb();
  return user;
}

export function loginUser(email: string, password: string, guestIdToMigrate?: string): UserRow {
  const norm = email.toLowerCase().trim();
  const pwHash = hashPassword(password);
  const user = findUserByEmail(norm);

  if (!user) {
    throw new Error('No account found with that email. Please sign up first.');
  }

  if (user.passwordHash && user.passwordHash !== pwHash) {
    throw new Error('Incorrect password. Please try again.');
  }

  if (!user.passwordHash) {
    user.passwordHash = pwHash;
  }
  user.lastLoginAt = Date.now();

  if (guestIdToMigrate && guestIdToMigrate !== user.id && db.users[guestIdToMigrate]) {
    migrateGuestData(guestIdToMigrate, user.id);
  }

  saveDb();
  return user;
}

function migrateGuestData(guestId: string, targetUserId: string) {
  for (const entry of db.diaryEntries) {
    if (entry.userId === guestId) entry.userId = targetUserId;
  }
  for (const key of Object.keys(db.waterEntries)) {
    if (key.startsWith(`${guestId}:`)) {
      const date = key.split(':')[1];
      const val = db.waterEntries[key];
      db.waterEntries[`${targetUserId}:${date}`] = Math.max(val, db.waterEntries[`${targetUserId}:${date}`] || 0);
      delete db.waterEntries[key];
    }
  }
  for (const ex of db.exerciseEntries) {
    if (ex.userId === guestId) ex.userId = targetUserId;
  }
  for (const wt of db.weightEntries) {
    if (wt.userId === guestId) wt.userId = targetUserId;
  }
  for (const m of db.measurements) {
    if (m.userId === guestId) m.userId = targetUserId;
  }
  for (const p of db.progressPhotos) {
    if (p.userId === guestId) p.userId = targetUserId;
  }
  for (const key of Object.keys(db.dailyHabits)) {
    if (key.startsWith(`${guestId}:`)) {
      const date = key.split(':')[1];
      db.dailyHabits[`${targetUserId}:${date}`] = {
        ...db.dailyHabits[key],
        userId: targetUserId
      };
      delete db.dailyHabits[key];
    }
  }
  for (const c of db.cravings) {
    if (c.userId === guestId) c.userId = targetUserId;
  }
  for (const v of db.nonScaleVictories) {
    if (v.userId === guestId) v.userId = targetUserId;
  }
  for (const pi of db.pantryItems) {
    if (pi.userId === guestId) pi.userId = targetUserId;
  }
  for (const f of db.savedFoods) {
    if (f.userId === guestId) f.userId = targetUserId;
  }
  for (const r of db.savedRecipes) {
    if (r.userId === guestId) r.userId = targetUserId;
  }
  for (const t of db.mealTemplates) {
    if (t.userId === guestId) t.userId = targetUserId;
  }
  if (db.profiles[guestId]) {
    const guestProf = db.profiles[guestId];
    const targetProf = db.profiles[targetUserId];
    const guestHasCustomStats = guestProf.age > 0 && guestProf.heightCm > 0 && guestProf.currentWeightKg > 0;
    if (guestHasCustomStats) {
      db.profiles[targetUserId] = {
        ...guestProf,
        name: targetProf?.name || guestProf.name,
        username: targetProf?.username || guestProf.username
      };
    }
    delete db.profiles[guestId];
  }
  if (db.plans[guestId]) {
    db.plans[targetUserId] = { ...db.plans[guestId], userId: targetUserId };
    delete db.plans[guestId];
  }
  if (db.userXp[guestId]) {
    const existing = db.userXp[targetUserId] || { xp: 0, badges: [] };
    const combinedBadges = Array.from(new Set([...existing.badges, ...db.userXp[guestId].badges]));
    db.userXp[targetUserId] = {
      xp: existing.xp + db.userXp[guestId].xp,
      badges: combinedBadges
    };
    delete db.userXp[guestId];
  }
  delete db.users[guestId];
}

// ------------------- PROFILE & XP & STREAKS -------------------
export function getProfile(userId: string): UserProfile {
  if (!db.profiles[userId]) {
    db.profiles[userId] = createEmptyProfile('User', `user_${userId.slice(0, 6)}`);
    saveDb();
  }
  return db.profiles[userId];
}

export function updateProfile(userId: string, updates: Partial<UserProfile>): UserProfile {
  const current = getProfile(userId);
  const updated = { ...current, ...updates };
  db.profiles[userId] = updated;
  saveDb();
  broadcastSync(userId, 'profile_updated', updated);
  return updated;
}

function computeConsecutiveStreak(loggedDates: string[], freezeDates: string[]): number {
  const dateSet = new Set([...loggedDates, ...freezeDates]);
  if (dateSet.size === 0) return 0;

  const sorted = Array.from(dateSet).sort();
  let maxStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00').getTime();
    const curr = new Date(sorted[i] + 'T00:00:00').getTime();
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else if (diffDays > 1) {
      currentStreak = 1;
    }
  }
  return currentStreak;
}

export function getUserStats(userId: string): UserStats {
  const record = db.userXp[userId] || { xp: 0, badges: [] };
  const profile = getProfile(userId);
  const freezes = profile.streakFreezesUsed || [];
  const foodDates = Array.from(new Set(db.diaryEntries.filter(d => d.userId === userId).map(d => d.date)));
  const workoutDates = Array.from(new Set(db.exerciseEntries.filter(e => e.userId === userId).map(e => e.date)));

  const foodStreak = computeConsecutiveStreak(foodDates, freezes);
  const workoutStreak = computeConsecutiveStreak(workoutDates, freezes);
  const level = 1 + Math.floor(record.xp / 100);

  return {
    xp: record.xp,
    level,
    badges: record.badges,
    foodStreak,
    workoutStreak
  };
}

export function addXpAndCheckBadges(userId: string, points: number, reason: string): UserStats {
  if (!db.userXp[userId]) {
    db.userXp[userId] = { xp: 0, badges: [] };
  }
  db.userXp[userId].xp += points;
  const current = db.userXp[userId];
  const newBadges: string[] = [...current.badges];

  if (current.xp >= 50 && !newBadges.includes('50 XP')) newBadges.push('50 XP');
  if (current.xp >= 200 && !newBadges.includes('200 XP')) newBadges.push('200 XP');
  if (current.xp >= 1000 && !newBadges.includes('1000 XP')) newBadges.push('1000 XP');
  if (current.xp >= 5000 && !newBadges.includes('5000 XP')) newBadges.push('5000 XP');

  if (reason === 'food' && !newBadges.includes('First log')) newBadges.push('First log');
  if (reason === 'exercise' && !newBadges.includes('First workout')) newBadges.push('First workout');
  if (reason === 'water' && !newBadges.includes('Hydrated')) newBadges.push('Hydrated');

  const weights = db.weightEntries.filter(w => w.userId === userId);
  if (weights.length >= 1 && !newBadges.includes('First weigh-in')) newBadges.push('First weigh-in');
  if (weights.length >= 7 && !newBadges.includes('Weighed 7 times')) newBadges.push('Weighed 7 times');
  if (weights.length >= 30 && !newBadges.includes('Weighed 30 times')) newBadges.push('Weighed 30 times');

  const profile = getProfile(userId);
  const freezes = profile.streakFreezesUsed || [];
  const dates = Array.from(new Set(db.diaryEntries.filter(d => d.userId === userId).map(d => d.date)));
  const maxStreak = computeConsecutiveStreak(dates, freezes);

  if (maxStreak >= 3 && !newBadges.includes('3-day streak')) newBadges.push('3-day streak');
  if (maxStreak >= 7 && !newBadges.includes('7-day streak')) newBadges.push('7-day streak');
  if (maxStreak >= 30 && !newBadges.includes('30-day streak')) newBadges.push('30-day streak');
  if (maxStreak >= 100 && !newBadges.includes('100-day streak')) newBadges.push('100-day streak');

  current.badges = newBadges;
  saveDb();
  broadcastSync(userId, 'xp_updated', { xp: current.xp, badges: newBadges });
  return getUserStats(userId);
}

// ------------------- DIARY FOOD ENTRIES -------------------
export function getDiaryEntries(userId: string, date: string): FoodItem[] {
  return db.diaryEntries.filter(e => e.userId === userId && e.date === date);
}

export function getAllDiaryEntries(userId: string): FoodItem[] {
  return db.diaryEntries.filter(e => e.userId === userId);
}

export function addDiaryEntry(userId: string, entry: Omit<FoodItem, 'id' | 'userId' | 'createdAt'>): FoodItem {
  const micros = enrichMicronutrients(entry);
  const defaultHour =
    entry.loggedHour !== undefined
      ? entry.loggedHour
      : entry.mealType === 'breakfast'
      ? 8
      : entry.mealType === 'lunch'
      ? 13
      : entry.mealType === 'dinner'
      ? 19
      : 16;

  const item: FoodItem = {
    ...entry,
    ...micros,
    loggedHour: defaultHour,
    id: `food_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.diaryEntries.push(item);

  const existingSaved = db.savedFoods.find(f => f.userId === userId && f.name.toLowerCase() === item.name.toLowerCase());
  if (!existingSaved) {
    db.savedFoods.push({
      id: `saved_${crypto.randomUUID()}`,
      userId,
      name: item.name,
      calories: item.calories,
      carbs: item.carbs,
      fat: item.fat,
      protein: item.protein,
      fiber: item.fiber,
      sugar: item.sugar,
      sodium: item.sodium,
      serving: item.serving || '1 portion',
      createdAt: Date.now()
    });
  }

  addXpAndCheckBadges(userId, 10, 'food');
  saveDb();
  broadcastSync(userId, 'food_added', item);
  return item;
}

export function updateDiaryEntry(userId: string, id: string, updates: Partial<FoodItem>): FoodItem | null {
  const idx = db.diaryEntries.findIndex(e => e.id === id && e.userId === userId);
  if (idx === -1) return null;
  db.diaryEntries[idx] = { ...db.diaryEntries[idx], ...updates };
  saveDb();
  broadcastSync(userId, 'food_updated', db.diaryEntries[idx]);
  return db.diaryEntries[idx];
}

export function deleteDiaryEntry(userId: string, id: string): boolean {
  const idx = db.diaryEntries.findIndex(e => e.id === id && e.userId === userId);
  if (idx !== -1) {
    db.diaryEntries.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'food_deleted', { id });
    return true;
  }
  return false;
}

export function copyYesterdayMeals(userId: string, targetDate: string, mealType?: MealType): FoodItem[] {
  const target = new Date(targetDate + 'T00:00:00');
  target.setDate(target.getDate() - 1);
  const yesterdayStr = target.toISOString().split('T')[0];

  const yesterdayItems = getDiaryEntries(userId, yesterdayStr).filter(i => !mealType || i.mealType === mealType);
  const created: FoodItem[] = [];

  for (const item of yesterdayItems) {
    const newItem: FoodItem = {
      ...item,
      id: `food_${crypto.randomUUID()}`,
      userId,
      date: targetDate,
      createdAt: Date.now()
    };
    db.diaryEntries.push(newItem);
    created.push(newItem);
  }

  if (created.length > 0) {
    addXpAndCheckBadges(userId, 10, 'food');
    saveDb();
    broadcastSync(userId, 'yesterday_copied', { targetDate, mealType, count: created.length });
  }

  return created;
}

// ------------------- WATER ENTRIES -------------------
export function getWaterGlasses(userId: string, date: string): number {
  return db.waterEntries[`${userId}:${date}`] || 0;
}

export function setWaterGlasses(userId: string, date: string, glasses: number): number {
  const key = `${userId}:${date}`;
  const prev = db.waterEntries[key] || 0;
  db.waterEntries[key] = Math.max(0, glasses);

  if (glasses > prev) {
    addXpAndCheckBadges(userId, 2 * (glasses - prev), 'water');
  }

  saveDb();
  broadcastSync(userId, 'water_updated', { date, glasses: db.waterEntries[key] });
  return db.waterEntries[key];
}

// ------------------- EXERCISE ENTRIES -------------------
export function getExerciseEntries(userId: string, date: string): ExerciseItem[] {
  return db.exerciseEntries.filter(e => e.userId === userId && e.date === date);
}

export function getAllExerciseEntries(userId: string): ExerciseItem[] {
  return db.exerciseEntries.filter(e => e.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
}

export function addExerciseEntry(userId: string, entry: Omit<ExerciseItem, 'id' | 'userId' | 'createdAt'>): ExerciseItem {
  const item: ExerciseItem = {
    ...entry,
    id: `ex_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.exerciseEntries.push(item);
  addXpAndCheckBadges(userId, 15, 'exercise');
  saveDb();
  broadcastSync(userId, 'exercise_added', item);
  return item;
}

export function deleteExerciseEntry(userId: string, id: string): boolean {
  const idx = db.exerciseEntries.findIndex(e => e.id === id && e.userId === userId);
  if (idx !== -1) {
    db.exerciseEntries.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'exercise_deleted', { id });
    return true;
  }
  return false;
}

// ------------------- WEIGHT ENTRIES -------------------
export function getWeightEntries(userId: string): WeightRecord[] {
  return db.weightEntries.filter(w => w.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
}

export function addWeightEntry(userId: string, date: string, weightKg: number): WeightRecord {
  const existingIdx = db.weightEntries.findIndex(w => w.userId === userId && w.date === date);
  let record: WeightRecord;
  if (existingIdx !== -1) {
    db.weightEntries[existingIdx].weightKg = weightKg;
    record = db.weightEntries[existingIdx];
  } else {
    record = {
      id: `wt_${crypto.randomUUID()}`,
      userId,
      date,
      weightKg,
      createdAt: Date.now()
    };
    db.weightEntries.push(record);
  }

  if (db.profiles[userId]) {
    db.profiles[userId].currentWeightKg = weightKg;
  }

  addXpAndCheckBadges(userId, 20, 'weight');
  saveDb();
  broadcastSync(userId, 'weight_added', record);
  return record;
}

export function deleteWeightEntry(userId: string, id: string): boolean {
  const idx = db.weightEntries.findIndex(w => w.id === id && w.userId === userId);
  if (idx !== -1) {
    db.weightEntries.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'weight_deleted', { id });
    return true;
  }
  return false;
}

// ------------------- BODY MEASUREMENTS -------------------
export function getBodyMeasurements(userId: string): BodyMeasurement[] {
  return db.measurements.filter(m => m.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
}

export function addBodyMeasurement(userId: string, entry: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt'>): BodyMeasurement {
  const item: BodyMeasurement = {
    ...entry,
    id: `meas_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.measurements.push(item);
  saveDb();
  broadcastSync(userId, 'measurement_added', item);
  return item;
}

export function deleteBodyMeasurement(userId: string, id: string): boolean {
  const idx = db.measurements.findIndex(m => m.id === id && m.userId === userId);
  if (idx !== -1) {
    db.measurements.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'measurement_deleted', { id });
    return true;
  }
  return false;
}

// ------------------- PROGRESS PHOTOS -------------------
export function getProgressPhotos(userId: string): ProgressPhoto[] {
  return db.progressPhotos.filter(p => p.userId === userId).sort((a, b) => a.date.localeCompare(b.date));
}

export function addProgressPhoto(userId: string, entry: Omit<ProgressPhoto, 'id' | 'userId' | 'createdAt'>): ProgressPhoto {
  const item: ProgressPhoto = {
    ...entry,
    id: `photo_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.progressPhotos.push(item);
  saveDb();
  broadcastSync(userId, 'photo_added', item);
  return item;
}

export function deleteProgressPhoto(userId: string, id: string): boolean {
  const idx = db.progressPhotos.findIndex(p => p.id === id && p.userId === userId);
  if (idx !== -1) {
    db.progressPhotos.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'photo_deleted', { id });
    return true;
  }
  return false;
}

// ------------------- DAILY HABITS, CRAVINGS & VICTORIES -------------------
export function getDailyHabitLog(userId: string, date: string): DailyHabitLog {
  const key = `${userId}:${date}`;
  return db.dailyHabits[key] || { userId, date };
}

export function getAllDailyHabitLogs(userId: string): DailyHabitLog[] {
  return Object.values(db.dailyHabits).filter(h => h.userId === userId);
}

export function upsertDailyHabitLog(userId: string, date: string, updates: Partial<DailyHabitLog>): DailyHabitLog {
  const key = `${userId}:${date}`;
  const current = db.dailyHabits[key] || { userId, date };
  const updated: DailyHabitLog = {
    ...current,
    ...updates,
    userId,
    date
  };
  db.dailyHabits[key] = updated;
  saveDb();
  broadcastSync(userId, 'habit_updated', updated);
  return updated;
}

export function getCravings(userId: string): CravingLog[] {
  return db.cravings.filter(c => c.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function addCraving(userId: string, entry: Omit<CravingLog, 'id' | 'userId' | 'createdAt'>): CravingLog {
  const item: CravingLog = {
    ...entry,
    id: `crav_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.cravings.push(item);
  saveDb();
  broadcastSync(userId, 'craving_added', item);
  return item;
}

export function deleteCraving(userId: string, id: string): boolean {
  const idx = db.cravings.findIndex(c => c.id === id && c.userId === userId);
  if (idx !== -1) {
    db.cravings.splice(idx, 1);
    saveDb();
    return true;
  }
  return false;
}

export function getNonScaleVictories(userId: string): NonScaleVictory[] {
  return db.nonScaleVictories.filter(v => v.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function addNonScaleVictory(userId: string, date: string, text: string): NonScaleVictory {
  const item: NonScaleVictory = {
    id: `nsv_${crypto.randomUUID()}`,
    userId,
    date,
    text: text.trim(),
    createdAt: Date.now()
  };
  db.nonScaleVictories.push(item);
  addXpAndCheckBadges(userId, 15, 'victory');
  saveDb();
  broadcastSync(userId, 'nsv_added', item);
  return item;
}

export function deleteNonScaleVictory(userId: string, id: string): boolean {
  const idx = db.nonScaleVictories.findIndex(v => v.id === id && v.userId === userId);
  if (idx !== -1) {
    db.nonScaleVictories.splice(idx, 1);
    saveDb();
    return true;
  }
  return false;
}

// ------------------- PANTRY & LEFTOVERS -------------------
export function getPantryItems(userId: string): PantryItem[] {
  return db.pantryItems.filter(p => p.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function addPantryItem(userId: string, entry: Omit<PantryItem, 'id' | 'userId' | 'createdAt'>): PantryItem {
  const item: PantryItem = {
    ...entry,
    id: `pantry_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.pantryItems.push(item);
  saveDb();
  broadcastSync(userId, 'pantry_added', item);
  return item;
}

export function deletePantryItem(userId: string, id: string): boolean {
  const idx = db.pantryItems.findIndex(p => p.id === id && p.userId === userId);
  if (idx !== -1) {
    db.pantryItems.splice(idx, 1);
    saveDb();
    return true;
  }
  return false;
}

// ------------------- SOCIAL & FRIENDS -------------------
export function getFriends(userId: string): FriendRecord[] {
  return db.friends.filter(f => f.userId === userId);
}

export function addFriend(userId: string, username: string, isPartner?: boolean): FriendRecord {
  const cleanUser = username.replace(/^@/, '').trim().toLowerCase();
  const display = cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1).replace(/_/g, ' ');
  // Look up real user streak if that account exists in db
  const matchedUserId = Object.keys(db.profiles).find(
    uid => (db.profiles[uid]?.username || '').toLowerCase() === cleanUser
  );
  const realStats = matchedUserId ? getUserStats(matchedUserId) : null;
  const item: FriendRecord = {
    id: `fr_${crypto.randomUUID()}`,
    userId,
    username: cleanUser,
    displayName: matchedUserId ? db.profiles[matchedUserId].name : display,
    streakDays: realStats ? realStats.foodStreak : 0,
    daysOnTargetThisWeek: 0,
    waterDaysCompleted: 0,
    isPartner: Boolean(isPartner),
    createdAt: Date.now()
  };
  if (isPartner) {
    for (const f of db.friends) {
      if (f.userId === userId) f.isPartner = false;
    }
  }
  db.friends.push(item);
  saveDb();
  return item;
}

export function removeFriend(userId: string, id: string): boolean {
  const idx = db.friends.findIndex(f => f.id === id && f.userId === userId);
  if (idx !== -1) {
    db.friends.splice(idx, 1);
    saveDb();
    return true;
  }
  return false;
}

export function shareRecipeToFriend(
  userId: string,
  payload: Omit<SharedRecipeRecord, 'id' | 'userId' | 'createdAt'>
): SharedRecipeRecord {
  const rec: SharedRecipeRecord = {
    ...payload,
    id: `srec_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.sharedRecipes.push(rec);
  saveDb();
  return rec;
}

export function getSharedRecipes(userId: string): SharedRecipeRecord[] {
  return db.sharedRecipes.filter(s => s.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

// ------------------- SAVED FOODS & RECIPES -------------------
export function getSavedFoods(userId: string): SavedFood[] {
  return db.savedFoods.filter(f => f.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function addSavedFood(userId: string, food: Omit<SavedFood, 'id' | 'userId' | 'createdAt'>): SavedFood {
  const item: SavedFood = {
    ...food,
    id: `saved_${crypto.randomUUID()}`,
    userId,
    createdAt: Date.now()
  };
  db.savedFoods.push(item);
  saveDb();
  broadcastSync(userId, 'saved_food_added', item);
  return item;
}

export function deleteSavedFood(userId: string, id: string): boolean {
  const idx = db.savedFoods.findIndex(f => f.id === id && f.userId === userId);
  if (idx !== -1) {
    db.savedFoods.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'saved_food_deleted', { id });
    return true;
  }
  return false;
}

export function getSavedRecipes(userId: string): SavedRecipe[] {
  return db.savedRecipes.filter(r => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function findSavedRecipeByName(userId: string, name: string): SavedRecipe | undefined {
  const norm = name.toLowerCase().trim();
  return db.savedRecipes.find(r => r.userId === userId && r.name.toLowerCase().trim() === norm);
}

export function saveRecipe(userId: string, recipe: Omit<SavedRecipe, 'id' | 'userId' | 'createdAt'>): SavedRecipe {
  const norm = recipe.name.toLowerCase().trim();
  const existingIdx = db.savedRecipes.findIndex(r => r.userId === userId && r.name.toLowerCase().trim() === norm);

  let item: SavedRecipe;
  if (existingIdx !== -1) {
    item = {
      ...recipe,
      id: db.savedRecipes[existingIdx].id,
      userId,
      createdAt: Date.now()
    };
    db.savedRecipes[existingIdx] = item;
  } else {
    item = {
      ...recipe,
      id: `recipe_${crypto.randomUUID()}`,
      userId,
      createdAt: Date.now()
    };
    db.savedRecipes.push(item);
  }

  saveDb();
  broadcastSync(userId, 'recipe_saved', item);
  return item;
}

// ------------------- MEAL TEMPLATES -------------------
export function getMealTemplates(userId: string): MealTemplate[] {
  return db.mealTemplates.filter(t => t.userId === userId);
}

export function saveMealTemplate(userId: string, name: string, date: string): MealTemplate {
  const dayItems = getDiaryEntries(userId, date);
  const template: MealTemplate = {
    id: `tmpl_${crypto.randomUUID()}`,
    userId,
    name,
    items: dayItems.map(item => ({
      mealType: item.mealType,
      name: item.name,
      calories: item.calories,
      carbs: item.carbs,
      fat: item.fat,
      protein: item.protein,
      serving: item.serving
    })),
    createdAt: Date.now()
  };

  db.mealTemplates.push(template);
  saveDb();
  broadcastSync(userId, 'template_saved', template);
  return template;
}

export function applyMealTemplate(userId: string, templateId: string, targetDate: string): FoodItem[] {
  const template = db.mealTemplates.find(t => t.id === templateId && t.userId === userId);
  if (!template) return [];

  const created: FoodItem[] = [];
  for (const item of template.items) {
    const micros = enrichMicronutrients(item);
    const newItem: FoodItem = {
      id: `food_${crypto.randomUUID()}`,
      userId,
      date: targetDate,
      mealType: item.mealType,
      name: item.name,
      calories: item.calories,
      carbs: item.carbs,
      fat: item.fat,
      protein: item.protein,
      ...micros,
      serving: item.serving,
      source: 'saved',
      createdAt: Date.now()
    };
    db.diaryEntries.push(newItem);
    created.push(newItem);
  }

  saveDb();
  broadcastSync(userId, 'template_applied', { count: created.length });
  return created;
}

export function deleteMealTemplate(userId: string, id: string): boolean {
  const idx = db.mealTemplates.findIndex(t => t.id === id && t.userId === userId);
  if (idx !== -1) {
    db.mealTemplates.splice(idx, 1);
    saveDb();
    broadcastSync(userId, 'template_deleted', { id });
    return true;
  }
  return false;
}

// ------------------- PLANS -------------------
export function getPlan(userId: string): WeekPlan | undefined {
  return db.plans[userId];
}

export function savePlan(userId: string, plan: WeekPlan) {
  db.plans[userId] = plan;
  saveDb();
  broadcastSync(userId, 'plan_saved', plan);
}

// ------------------- DEVELOPER CHAT -------------------
export function getChatMessages(userId: string): ChatMessage[] {
  return db.chatMessages.filter(m => m.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export function addChatMessage(userId: string, sender: 'user' | 'developer', text: string): ChatMessage {
  const msg: ChatMessage = {
    id: `msg_${crypto.randomUUID()}`,
    userId,
    sender,
    text,
    createdAt: Date.now()
  };
  db.chatMessages.push(msg);
  saveDb();
  broadcastSync(userId, 'chat_message', msg);
  return msg;
}

// ------------------- SETTINGS (USDA KEY) -------------------
export function setUsdaApiKey(key: string) {
  db.settings.usdaApiKey = key.trim();
  saveDb();
}

export function getUsdaApiKey(): string | undefined {
  return db.settings.usdaApiKey;
}

export function hasUsdaApiKey(): boolean {
  return Boolean(db.settings.usdaApiKey && db.settings.usdaApiKey.length > 5);
}

// ------------------- EXPORT & CLEAR DATA -------------------
export function exportUserData(userId: string) {
  return {
    profile: getProfile(userId),
    stats: getUserStats(userId),
    diary: getAllDiaryEntries(userId),
    exercises: db.exerciseEntries.filter(e => e.userId === userId),
    weights: getWeightEntries(userId),
    measurements: getBodyMeasurements(userId),
    nonScaleVictories: getNonScaleVictories(userId),
    pantry: getPantryItems(userId),
    savedFoods: getSavedFoods(userId),
    savedRecipes: getSavedRecipes(userId),
    mealTemplates: getMealTemplates(userId),
    plan: getPlan(userId),
    exportedAt: new Date().toISOString()
  };
}

export function clearUserData(userId: string) {
  db.diaryEntries = db.diaryEntries.filter(e => e.userId !== userId);
  db.exerciseEntries = db.exerciseEntries.filter(e => e.userId !== userId);
  db.weightEntries = db.weightEntries.filter(w => w.userId !== userId);
  db.measurements = db.measurements.filter(m => m.userId !== userId);
  db.progressPhotos = db.progressPhotos.filter(p => p.userId !== userId);
  db.cravings = db.cravings.filter(c => c.userId !== userId);
  db.nonScaleVictories = db.nonScaleVictories.filter(v => v.userId !== userId);
  db.pantryItems = db.pantryItems.filter(p => p.userId !== userId);
  db.savedFoods = db.savedFoods.filter(f => f.userId !== userId);
  db.savedRecipes = db.savedRecipes.filter(r => r.userId !== userId);
  db.mealTemplates = db.mealTemplates.filter(t => t.userId !== userId);
  delete db.plans[userId];
  db.chatMessages = db.chatMessages.filter(m => m.userId !== userId);

  for (const k of Object.keys(db.waterEntries)) {
    if (k.startsWith(`${userId}:`)) {
      delete db.waterEntries[k];
    }
  }
  for (const k of Object.keys(db.dailyHabits)) {
    if (k.startsWith(`${userId}:`)) {
      delete db.dailyHabits[k];
    }
  }

  db.userXp[userId] = { xp: 0, badges: [] };
  saveDb();
  broadcastSync(userId, 'data_cleared');
}
