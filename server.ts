import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import {
  createGuestUser,
  findUserById,
  getOtpRecord,
  saveOtp,
  verifyOtp,
  loginOrRegisterVerifiedUser,
  registerSseClient,
  getProfile,
  updateProfile,
  getUserStats,
  getDiaryEntries,
  getAllDiaryEntries,
  addDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  copyYesterdayMeals,
  getWaterGlasses,
  setWaterGlasses,
  getExerciseEntries,
  getAllExerciseEntries,
  addExerciseEntry,
  deleteExerciseEntry,
  getWeightEntries,
  addWeightEntry,
  deleteWeightEntry,
  getBodyMeasurements,
  addBodyMeasurement,
  deleteBodyMeasurement,
  getProgressPhotos,
  addProgressPhoto,
  deleteProgressPhoto,
  getDailyHabitLog,
  getAllDailyHabitLogs,
  upsertDailyHabitLog,
  getCravings,
  addCraving,
  deleteCraving,
  getNonScaleVictories,
  addNonScaleVictory,
  deleteNonScaleVictory,
  getPantryItems,
  addPantryItem,
  deletePantryItem,
  getFriends,
  addFriend,
  removeFriend,
  shareRecipeToFriend,
  getSharedRecipes,
  getSavedFoods,
  addSavedFood,
  deleteSavedFood,
  getSavedRecipes,
  findSavedRecipeByName,
  saveRecipe,
  getMealTemplates,
  saveMealTemplate,
  applyMealTemplate,
  deleteMealTemplate,
  getPlan,
  savePlan,
  getChatMessages,
  addChatMessage,
  setUsdaApiKey,
  hasUsdaApiKey,
  exportUserData,
  clearUserData
} from './src/server/db.js';
import { parseIngredientLine } from './src/server/foodData.js';
import { searchUsdaFoods } from './src/server/usda.js';
import { generateWeekPlanWithGemini } from './src/server/aiPlanner.js';
import {
  parseVoiceMealWithGemini,
  analyzePlatePhotoWithGemini,
  analyzeFridgePhotoWithGemini,
  scanReceiptWithGemini,
  estimateRestaurantDishWithGemini,
  suggestFixMyDayWithGemini,
  suggestPantryMealsWithGemini,
  estimatePortionWithGemini
} from './src/server/aiFeatures.js';
import { sendVerificationEmail } from './src/server/emailService.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// Simple Auth & Row-Level Security Middleware
function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token as string);

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }

  const user = findUserById(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid user session' });
    return;
  }

  (req as any).user = user;
  (req as any).userId = user.id;
  next();
}

// ------------------- AUTH ROUTES -------------------
app.post('/api/auth/guest', (req, res) => {
  try {
    const user = createGuestUser();
    res.json({
      userId: user.id,
      isGuest: true,
      token: user.id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create guest session' });
  }
});

app.post('/api/auth/otp/send', async (req, res) => {
  try {
    const { email, isResend } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address' });
      return;
    }

    const existing = getOtpRecord(cleanEmail);
    if (isResend && existing && Date.now() - existing.createdAt < 30 * 1000) {
      const waitSec = Math.ceil((30 * 1000 - (Date.now() - existing.createdAt)) / 1000);
      res.status(429).json({
        error: `Please wait ${waitSec}s before requesting a new code.`,
        retryAfterSeconds: waitSec
      });
      return;
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    saveOtp(cleanEmail, code);

    await sendVerificationEmail(cleanEmail, code);

    res.json({
      success: true,
      message: `We sent a 6-digit verification code to ${cleanEmail}`,
      resendCooldownSeconds: 30
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send verification code' });
  }
});

app.post('/api/auth/otp/verify', (req, res) => {
  try {
    const { email, code, guestId } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'Email and verification code are required' });
      return;
    }

    const verification = verifyOtp(email, String(code));
    if (!verification.valid) {
      res.status(400).json({
        error: verification.message || "That code isn't right. Check your email and try again.",
        reason: verification.reason,
        attemptsRemaining: verification.attemptsRemaining
      });
      return;
    }

    const user = loginOrRegisterVerifiedUser(email, guestId);

    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id,
      message: guestId ? 'Account created and guest data transferred successfully!' : 'Signed in successfully!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to verify OTP' });
  }
});

app.get('/api/auth/me', authenticateUser, (req, res) => {
  const user = (req as any).user;
  const profile = getProfile(user.id);
  const stats = getUserStats(user.id);
  res.json({
    userId: user.id,
    email: user.email,
    isGuest: user.isGuest,
    profile,
    stats
  });
});

// ------------------- REAL-TIME SYNC (SSE) -------------------
app.get('/api/sync/events', (req, res) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(401).send('Missing token');
    return;
  }
  const user = findUserById(token);
  if (!user) {
    res.status(401).send('Invalid user');
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const unregister = registerSseClient(user.id, res);

  req.on('close', () => {
    unregister();
  });
});

// ------------------- DIARY FOOD -------------------
app.get('/api/diary', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const items = getDiaryEntries(userId, date);
  res.json({ date, items });
});

app.get('/api/diary/all', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const items = getAllDiaryEntries(userId);
  res.json({ items });
});

app.post('/api/diary', authenticateUser, (req, res) => {
  try {
    const userId = (req as any).userId;
    const {
      date,
      mealType,
      name,
      calories,
      carbs,
      fat,
      protein,
      fiber,
      sugar,
      sodium,
      iron,
      calcium,
      vitaminD,
      serving,
      note,
      loggedHour,
      costEstimate,
      source
    } = req.body;
    if (!name || calories === undefined || !date || !mealType) {
      res.status(400).json({ error: 'Missing required food fields' });
      return;
    }

    const item = addDiaryEntry(userId, {
      date,
      mealType,
      name: name.trim(),
      calories: Math.round(Number(calories)),
      carbs: Math.round(Number(carbs || 0) * 10) / 10,
      fat: Math.round(Number(fat || 0) * 10) / 10,
      protein: Math.round(Number(protein || 0) * 10) / 10,
      fiber: fiber !== undefined ? Number(fiber) : undefined,
      sugar: sugar !== undefined ? Number(sugar) : undefined,
      sodium: sodium !== undefined ? Number(sodium) : undefined,
      iron: iron !== undefined ? Number(iron) : undefined,
      calcium: calcium !== undefined ? Number(calcium) : undefined,
      vitaminD: vitaminD !== undefined ? Number(vitaminD) : undefined,
      serving: serving || '1 serving',
      note: note ? String(note).trim() : undefined,
      loggedHour: loggedHour !== undefined ? Number(loggedHour) : undefined,
      costEstimate: costEstimate !== undefined ? Number(costEstimate) : undefined,
      source: source || 'manual'
    });

    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/diary/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const updated = updateDiaryEntry(userId, req.params.id, req.body);
  if (updated) {
    res.json(updated);
  } else {
    res.status(404).json({ error: 'Food entry not found' });
  }
});

app.delete('/api/diary/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteDiaryEntry(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Food entry not found' });
  }
});

app.post('/api/diary/copy-yesterday', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const targetDate = req.body.date || new Date().toISOString().split('T')[0];
  const mealType = req.body.mealType;
  const items = copyYesterdayMeals(userId, targetDate, mealType);
  res.json({ success: true, count: items.length, items });
});

// ------------------- WATER TRACKER -------------------
app.get('/api/water', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const glasses = getWaterGlasses(userId, date);
  res.json({ date, glasses });
});

app.post('/api/water', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { date, glasses } = req.body;
  if (!date || glasses === undefined) {
    res.status(400).json({ error: 'Date and glasses count required' });
    return;
  }
  const result = setWaterGlasses(userId, date, Number(glasses));
  res.json({ date, glasses: result });
});

// ------------------- FITNESS / EXERCISE -------------------
app.get('/api/exercise', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  const items = getExerciseEntries(userId, date);
  res.json({ date, items });
});

app.get('/api/exercise/all', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const items = getAllExerciseEntries(userId);
  res.json({ items });
});

app.post('/api/exercise', authenticateUser, (req, res) => {
  try {
    const userId = (req as any).userId;
    const {
      date,
      activityName,
      met,
      minutes,
      caloriesBurned,
      intensity,
      weightKg,
      reps,
      sets,
      distanceKm,
      plankSeconds
    } = req.body;
    if (!activityName || !minutes || caloriesBurned === undefined || !date) {
      res.status(400).json({ error: 'Missing required exercise fields' });
      return;
    }

    const item = addExerciseEntry(userId, {
      date,
      activityName: activityName.trim(),
      met: Number(met) || 5,
      minutes: Number(minutes),
      caloriesBurned: Math.round(Number(caloriesBurned)),
      intensity: intensity || 'Moderate',
      weightKg: weightKg !== undefined ? Number(weightKg) : undefined,
      reps: reps !== undefined ? Number(reps) : undefined,
      sets: sets !== undefined ? Number(sets) : undefined,
      distanceKm: distanceKm !== undefined ? Number(distanceKm) : undefined,
      plankSeconds: plankSeconds !== undefined ? Number(plankSeconds) : undefined
    });

    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/exercise/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteExerciseEntry(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Exercise entry not found' });
  }
});

// ------------------- WEIGHT TRACKER -------------------
app.get('/api/weight', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const items = getWeightEntries(userId);
  res.json({ items });
});

app.post('/api/weight', authenticateUser, (req, res) => {
  try {
    const userId = (req as any).userId;
    const { date, weightKg } = req.body;
    if (!date || !weightKg) {
      res.status(400).json({ error: 'Date and weight are required' });
      return;
    }

    const record = addWeightEntry(userId, date, Number(weightKg));
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/weight/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteWeightEntry(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Weight entry not found' });
  }
});

// ------------------- BODY MEASUREMENTS & PHOTOS -------------------
app.get('/api/measurements', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ items: getBodyMeasurements(userId) });
});

app.post('/api/measurements', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const item = addBodyMeasurement(userId, req.body);
  res.json(item);
});

app.delete('/api/measurements/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteBodyMeasurement(userId, req.params.id);
  res.json({ success });
});

app.get('/api/progress-photos', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ items: getProgressPhotos(userId) });
});

app.post('/api/progress-photos', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const item = addProgressPhoto(userId, req.body);
  res.json(item);
});

app.delete('/api/progress-photos/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteProgressPhoto(userId, req.params.id);
  res.json({ success });
});

// ------------------- HABITS, CRAVINGS & VICTORIES -------------------
app.get('/api/habits', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
  res.json({ habit: getDailyHabitLog(userId, date), allHabits: getAllDailyHabitLogs(userId) });
});

app.post('/api/habits', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { date, ...updates } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const habit = upsertDailyHabitLog(userId, targetDate, updates);
  res.json(habit);
});

app.get('/api/cravings', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ items: getCravings(userId) });
});

app.post('/api/cravings', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const item = addCraving(userId, req.body);
  res.json(item);
});

app.delete('/api/cravings/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ success: deleteCraving(userId, req.params.id) });
});

app.get('/api/victories', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ items: getNonScaleVictories(userId) });
});

app.post('/api/victories', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { date, text } = req.body;
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Victory text required' });
    return;
  }
  const item = addNonScaleVictory(userId, date || new Date().toISOString().split('T')[0], text);
  res.json(item);
});

app.delete('/api/victories/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ success: deleteNonScaleVictory(userId, req.params.id) });
});

// ------------------- PANTRY & LEFTOVERS -------------------
app.get('/api/pantry', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ items: getPantryItems(userId) });
});

app.post('/api/pantry', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const item = addPantryItem(userId, req.body);
  res.json(item);
});

app.delete('/api/pantry/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ success: deletePantryItem(userId, req.params.id) });
});

// ------------------- SOCIAL & FRIENDS -------------------
app.get('/api/social', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({
    friends: getFriends(userId),
    sharedRecipes: getSharedRecipes(userId)
  });
});

app.post('/api/social/friends', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { username, isPartner } = req.body;
  if (!username || !username.trim()) {
    res.status(400).json({ error: 'Username required' });
    return;
  }
  const friend = addFriend(userId, username, isPartner);
  res.json(friend);
});

app.delete('/api/social/friends/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  res.json({ success: removeFriend(userId, req.params.id) });
});

app.post('/api/social/share-recipe', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const shared = shareRecipeToFriend(userId, req.body);
  res.json(shared);
});

// ------------------- GEMINI AI ENDPOINTS -------------------
app.post('/api/ai/voice-log', authenticateUser, async (req, res) => {
  try {
    const result = await parseVoiceMealWithGemini(req.body.transcript || '');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/plate-photo', authenticateUser, async (req, res) => {
  try {
    const result = await analyzePlatePhotoWithGemini(req.body.image, req.body.mimeType);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/fridge-photo', authenticateUser, async (req, res) => {
  try {
    const result = await analyzeFridgePhotoWithGemini(
      req.body.image,
      req.body.mimeType,
      req.body.remainingMacros || { calories: 600, protein: 45, carbs: 60, fat: 20 }
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/receipt-scan', authenticateUser, async (req, res) => {
  try {
    const result = await scanReceiptWithGemini(req.body.image, req.body.mimeType);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/restaurant-estimate', authenticateUser, async (req, res) => {
  try {
    const result = await estimateRestaurantDishWithGemini(req.body.restaurant || '', req.body.dish || '');
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/fix-my-day', authenticateUser, async (req, res) => {
  try {
    const result = await suggestFixMyDayWithGemini(req.body.overByKcal || 200, req.body.loggedFoods || []);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/what-can-i-make', authenticateUser, async (req, res) => {
  try {
    const result = await suggestPantryMealsWithGemini(
      req.body.pantryItems || [],
      req.body.remainingMacros || { calories: 600, protein: 40, carbs: 50, fat: 20 }
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/portion-estimator', authenticateUser, async (req, res) => {
  try {
    const result = await estimatePortionWithGemini(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- SAVED FOODS -------------------
app.get('/api/saved-foods', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const foods = getSavedFoods(userId);
  res.json({ foods });
});

app.post('/api/saved-foods', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const item = addSavedFood(userId, req.body);
  res.json(item);
});

app.delete('/api/saved-foods/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteSavedFood(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Saved food not found' });
  }
});

// ------------------- RECIPES & PARSING -------------------
app.get('/api/recipes', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const recipes = getSavedRecipes(userId);
  res.json({ recipes });
});

app.get('/api/recipes/search', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const name = (req.query.name as string) || '';
  const recipe = findSavedRecipeByName(userId, name);
  res.json({ recipe });
});

app.post('/api/recipes', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const recipe = saveRecipe(userId, req.body);
  res.json(recipe);
});

app.post('/api/recipes/parse-line', authenticateUser, async (req, res) => {
  try {
    const { line } = req.body;
    const parsed = parseIngredientLine(line || '');

    if (parsed.needsUsdaLookup && hasUsdaApiKey() && !parsed.isVague) {
      const usda = await searchUsdaFoods(parsed.name);
      if (usda.foods && usda.foods.length > 0) {
        const best = usda.foods[0];
        const factor = parsed.calculatedGrams / 100;
        parsed.calories = Math.round(best.calories * factor);
        parsed.protein = Math.round(best.protein * factor * 10) / 10;
        parsed.fat = Math.round(best.fat * factor * 10) / 10;
        parsed.carbs = Math.round(best.carbs * factor * 10) / 10;
      }
    }

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- MEAL TEMPLATES -------------------
app.get('/api/meal-templates', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const templates = getMealTemplates(userId);
  res.json({ templates });
});

app.post('/api/meal-templates', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { name, date } = req.body;
  if (!name || !date) {
    res.status(400).json({ error: 'Name and date are required' });
    return;
  }
  const tmpl = saveMealTemplate(userId, name.trim(), date);
  res.json(tmpl);
});

app.post('/api/meal-templates/apply', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { templateId, date } = req.body;
  const items = applyMealTemplate(userId, templateId, date);
  res.json({ success: true, count: items.length, items });
});

app.delete('/api/meal-templates/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteMealTemplate(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Template not found' });
  }
});

// ------------------- PLAN GENERATION (GEMINI) -------------------
app.get('/api/plan', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const plan = getPlan(userId);
  res.json({ plan });
});

app.post('/api/plan/generate', authenticateUser, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { type, dailyTargetCalories, dailyTargetCarbs, dailyTargetFat, dailyTargetProtein, preferences } = req.body;

    const plan = await generateWeekPlanWithGemini(userId, {
      type: type || 'both',
      dailyTargetCalories: Number(dailyTargetCalories) || 2000,
      dailyTargetCarbs: Number(dailyTargetCarbs) || 200,
      dailyTargetFat: Number(dailyTargetFat) || 67,
      dailyTargetProtein: Number(dailyTargetProtein) || 150,
      preferences: preferences || {
        restrictions: [],
        allergies: [],
        dislikes: '',
        cookTime: 'Any',
        mealsPerDay: 3,
        budget: 'Moderate',
        workoutDaysPerWeek: 3,
        equipment: 'Dumbbells',
        injuries: ''
      }
    });

    savePlan(userId, plan);
    res.json({ success: true, plan });
  } catch (err: any) {
    console.error('Plan generation route error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate plan' });
  }
});

app.post('/api/plan/save', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { plan } = req.body;
  if (!plan) {
    res.status(400).json({ error: 'Plan data required' });
    return;
  }
  savePlan(userId, plan);
  res.json({ success: true, plan });
});

// ------------------- DEVELOPER CHAT -------------------
app.get('/api/developer-chat', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const messages = getChatMessages(userId);
  res.json({ messages });
});

app.post('/api/developer-chat', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { text } = req.body;
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'Message cannot be empty' });
    return;
  }

  const userMsg = addChatMessage(userId, 'user', text.trim());

  setTimeout(() => {
    addChatMessage(
      userId,
      'developer',
      "Thanks for reaching out! I'm the developer behind Caloriq. Your feedback and logs are saved directly to our system. If you spotted an issue with food parsing or want to suggest a feature, let me know!"
    );
  }, 1000);

  res.json(userMsg);
});

// ------------------- PROFILE & ME -------------------
app.get('/api/profile', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const profile = getProfile(userId);
  const stats = getUserStats(userId);
  res.json({ profile, stats });
});

app.put('/api/profile', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const profile = updateProfile(userId, req.body);
  res.json(profile);
});

app.get('/api/stats', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const stats = getUserStats(userId);
  res.json(stats);
});

app.get('/api/export', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const data = exportUserData(userId);
  res.setHeader('Content-Disposition', 'attachment; filename="caloriq-backup.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(data);
});

app.post('/api/clear', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  clearUserData(userId);
  res.json({ success: true, message: 'All user data has been cleared.' });
});

// ------------------- USDA FOODDATA CENTRAL SEARCH -------------------
app.get('/api/usda/status', (req, res) => {
  res.json({ available: hasUsdaApiKey() });
});

app.post('/api/usda/search', authenticateUser, async (req, res) => {
  const { query, storeFilter } = req.body;
  if (!query || !query.trim()) {
    res.status(400).json({ error: 'Search query required' });
    return;
  }

  const result = await searchUsdaFoods(query, storeFilter);
  res.json(result);
});

// ------------------- ADMIN SETUP ROUTE -------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'caloriq-admin-2026';

app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ valid: true });
});

app.post('/api/admin/save-usda-key', (req, res) => {
  const { password, apiKey } = req.body;
  if (!password || password !== ADMIN_PASSWORD) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    res.status(400).json({ error: 'Invalid API key provided' });
    return;
  }

  setUsdaApiKey(apiKey.trim());

  res.json({
    success: true,
    message: 'Saved. You can close this page.'
  });
});

// ------------------- DEV MIDDLEWARE & STATIC SERVING -------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Caloriq server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
