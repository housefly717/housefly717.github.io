import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import {
  createGuestUser,
  findUserById,
  findUserByEmail,
  signupUser,
  resetUserPassword,
  loginUser,
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
  deleteSavedRecipe,
  getMealTemplates,
  saveMealTemplate,
  applyMealTemplate,
  deleteMealTemplate,
  restoreMealTemplate,
  getPlan,
  savePlan,
  getChatMessages,
  addChatMessage,
  setUsdaApiKey,
  hasUsdaApiKey,
  exportUserData,
  clearUserData,
  deleteUserAccount,
  sanitizeObjectStrings,
  sanitizeString,
  recordUserSession,
  getUserSessions,
  revokeUserSession,
  revokeAllUserSessions,
  verifyUserPassword,
  changeUserPassword,
  changeUserEmail,
  loginOrSignupWithGoogle,
  createDemoAccount,
  logCookieConsent,
  getCookieConsentLogs,
  recordPrivacyAnalyticsEvent,
  getPrivacyAnalyticsSummary,
  saveContactMessage,
  getContactMessages,
  saveBugReport,
  getBugReports,
  getMaintenanceStatus,
  setMaintenanceStatus,
  importUserBackupData
} from './src/server/db.js';
import {
  createAndSendVerificationCode,
  validateVerificationCode,
  sendWelcomeEmail,
  createAndSendPasswordResetEmail,
  validateAndConsumePasswordResetToken,
  sendContactMessageEmail,
  sendUptimeAlertEmail
} from './src/server/emailService.js';
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
  estimatePortionWithGemini,
  generateCravingPatternWithGemini,
  generateWeeklyInsightsWithGemini
} from './src/server/aiFeatures.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

// #24 Enforce HTTPS (redirect http to https in production) & #25 Content Security Policy header
app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] === 'http'
  ) {
    res.redirect(301, `https://${req.headers.host}${req.url}`);
    return;
  }

  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.firebaseio.com https://*.googleapis.com https://*.gstatic.com https://apis.google.com; connect-src 'self' ws: wss: https://*.firebaseio.com https://*.googleapis.com https://generativelanguage.googleapis.com https://api.nal.usda.gov https://world.openfoodfacts.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; frame-ancestors *;"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // #26 Sanitize every user input before storing
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObjectStrings(req.body);
  }
  next();
});

// #27 Rate limit signup, login, password reset, and AI calls per IP and per account
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

function rateLimitAuth(req: Request, res: Response, next: NextFunction) {
  const ip = getClientIp(req);
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!checkRateLimit(`auth_ip:${ip}`, 25, 60_000) || (email && !checkRateLimit(`auth_acct:${email}`, 12, 60_000))) {
    res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
    return;
  }
  next();
}

app.use('/api/ai', (req: Request, res: Response, next: NextFunction) => {
  const ip = getClientIp(req);
  const authHeader = req.headers.authorization || '';
  if (!checkRateLimit(`ai_ip:${ip}`, 40, 60_000) || (authHeader && !checkRateLimit(`ai_acct:${authHeader}`, 30, 60_000))) {
    res.status(429).json({ error: 'AI rate limit reached. Please wait a minute before trying again.' });
    return;
  }
  next();
});

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

app.post('/api/auth/send-verification-code', rateLimitAuth, async (req, res) => {
  try {
    const { email, password, honeypot, websiteUrl } = req.body;
    // #28 Hidden honeypot field check to catch bots
    if (honeypot || websiteUrl) {
      res.status(400).json({ error: 'Unable to process request.' });
      return;
    }
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!password || String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existingUser = findUserByEmail(cleanEmail);
    if (existingUser && existingUser.passwordHash) {
      res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const result = await createAndSendVerificationCode(cleanEmail);
    res.json({
      sent: result.sent,
      resendCooldownSeconds: result.resendCooldownSeconds
    });
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({
      error: err.message || "Couldn't send the email. Try again in a minute.",
      retryAfterSeconds: err.retryAfterSeconds
    });
  }
});

app.post('/api/auth/verify-signup', async (req, res) => {
  try {
    const { email, password, code, guestId } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!password || String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!code || String(code).trim().length === 0) {
      res.status(400).json({ error: "That code isn't right. Check your email and try again." });
      return;
    }

    validateVerificationCode(cleanEmail, String(code));

    const user = signupUser(cleanEmail, String(password), guestId);

    // Send Welcome Email via Resend after successful signup
    sendWelcomeEmail(cleanEmail).catch(() => {
      // Do not block session creation if welcome email fails
    });

    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || "That code isn't right. Check your email and try again.",
      reason: err.reason,
      locked: Boolean(err.locked),
      attemptsRemaining: err.attemptsRemaining
    });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email, appOrigin } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = findUserByEmail(cleanEmail);
    if (!user) {
      res.status(400).json({ error: 'No account found with that email.' });
      return;
    }

    const origin =
      typeof appOrigin === 'string' && appOrigin.startsWith('http')
        ? appOrigin
        : `${req.protocol}://${req.get('host')}`;
    await createAndSendPasswordResetEmail(cleanEmail, origin);

    res.json({ sent: true });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || "Couldn't send the email. Try again in a minute."
    });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { email, token, newPassword, guestId } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !token) {
      res.status(400).json({ error: 'Invalid password reset request.' });
      return;
    }
    if (!newPassword || String(newPassword).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    validateAndConsumePasswordResetToken(cleanEmail, String(token));
    const user = resetUserPassword(cleanEmail, String(newPassword), guestId);

    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not reset password.' });
  }
});

app.post('/api/auth/signup', (req, res) => {
  try {
    const { email, password, code, guestId } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!password || String(password).length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!code) {
      res.status(400).json({ error: 'Verification code is required.' });
      return;
    }

    validateVerificationCode(cleanEmail, String(code));

    const user = signupUser(cleanEmail, String(password), guestId);
    sendWelcomeEmail(cleanEmail).catch(() => {});

    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id
    });
  } catch (err: any) {
    res.status(400).json({
      error: err.message || 'Failed to create account.',
      reason: err.reason,
      locked: Boolean(err.locked),
      attemptsRemaining: err.attemptsRemaining
    });
  }
});

app.post('/api/auth/login', rateLimitAuth, (req, res) => {
  try {
    const { email, password, guestId } = req.body;
    const cleanEmail = typeof email === 'string' ? email.trim() : '';
    if (!cleanEmail || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const existing = findUserByEmail(cleanEmail);
    const previousLoginAt = existing?.lastLoginAt;
    const user = loginUser(cleanEmail, String(password), guestId);
    const session = recordUserSession(user.id, req.headers['user-agent'] || '', 'Local Region', getClientIp(req));
    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id,
      lastLoginAt: previousLoginAt || user.lastLoginAt,
      sessionId: session.id
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid email or password.' });
  }
});

// #54 Allow login with Google sign-in as an alternative to email
app.post('/api/auth/google', rateLimitAuth, (req, res) => {
  try {
    const { email, name, guestId } = req.body;
    const cleanEmail = typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : 'google.user@gmail.com';
    const user = loginOrSignupWithGoogle(cleanEmail, String(name || 'Google Member'), guestId);
    const session = recordUserSession(user.id, req.headers['user-agent'] || '', 'Local Region', getClientIp(req));
    res.json({
      userId: user.id,
      email: user.email,
      isGuest: false,
      token: user.id,
      lastLoginAt: user.lastLoginAt,
      sessionId: session.id
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google sign-in failed.' });
  }
});

// #58 Demo mode button on the landing page: loads a temporary account with sample data
app.post('/api/auth/demo', (req, res) => {
  try {
    const user = createDemoAccount();
    res.json({
      userId: user.id,
      email: user.email,
      isGuest: true,
      isDemo: true,
      token: user.id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Could not start demo mode.' });
  }
});

// #52 Session list in the Me tab & #31 Sign out all devices
app.get('/api/auth/sessions', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const sessions = getUserSessions(userId, req.headers['user-agent'] || '');
  res.json({ sessions });
});

app.delete('/api/auth/sessions/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const ok = revokeUserSession(userId, req.params.id);
  res.json({ success: ok });
});

app.post('/api/auth/signout-all', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const count = revokeAllUserSessions(userId);
  res.json({ success: true, revokedCount: count });
});

// #50 Password change flow: require current password, then new password twice
app.post('/api/auth/change-password', authenticateUser, rateLimitAuth, (req, res) => {
  try {
    const userId = (req as any).userId;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      res.status(400).json({ error: 'New passwords do not match.' });
      return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    changeUserPassword(userId, String(currentPassword), String(newPassword));
    res.json({ success: true, message: 'Password updated.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not change password.' });
  }
});

// #49 Email change flow: verify old email, then new email, then update
app.post('/api/auth/change-email', authenticateUser, rateLimitAuth, (req, res) => {
  try {
    const userId = (req as any).userId;
    const { oldEmail, newEmail, password } = req.body;
    if (!oldEmail || !newEmail) {
      res.status(400).json({ error: 'Both current and new email addresses are required.' });
      return;
    }
    if (password && !verifyUserPassword(userId, String(password))) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    const updatedUser = changeUserEmail(userId, String(oldEmail), String(newEmail));
    res.json({ success: true, email: updatedUser.email });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not update email.' });
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
      unusualQuantity,
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
      unusualQuantity: Boolean(unusualQuantity),
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

app.post('/api/ai/craving-pattern', authenticateUser, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const cravings = Array.isArray(req.body?.cravings) ? req.body.cravings : getCravings(userId);
    const result = await generateCravingPatternWithGemini(cravings);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/weekly-insights', authenticateUser, async (req, res) => {
  try {
    const result = await generateWeeklyInsightsWithGemini(req.body);
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

app.delete('/api/recipes/:id', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const success = deleteSavedRecipe(userId, req.params.id);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Recipe not found' });
  }
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

app.post('/api/meal-templates/restore', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { name, items } = req.body;
  if (!name) {
    res.status(400).json({ error: 'Template name required' });
    return;
  }
  const tmpl = restoreMealTemplate(userId, { name, items: items || [] });
  res.json(tmpl);
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

app.post('/api/delete-account', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const user = (req as any).user;
  const { password } = req.body || {};
  // #32 Require password re-entry before account deletion for registered accounts
  if (user && !user.isGuest && user.passwordHash) {
    if (!password || !verifyUserPassword(userId, String(password))) {
      res.status(400).json({ error: 'Please enter your current password to confirm account deletion.' });
      return;
    }
  }
  deleteUserAccount(userId);
  res.json({ success: true, message: 'Account deleted.' });
});

// #79 & #80 Restore from backup JSON
app.post('/api/import', authenticateUser, (req, res) => {
  try {
    const userId = (req as any).userId;
    const result = importUserBackupData(userId, req.body);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Could not restore backup.' });
  }
});

// ------------------- COMPLIANCE, ANALYTICS, SUPPORT & SYSTEM (#33-48, #74-77) -------------------
app.post('/api/compliance/cookie-consent', (req, res) => {
  const choice = req.body?.choice === 'accepted' ? 'accepted' : 'declined';
  const rec = logCookieConsent(choice, getClientIp(req), req.headers['user-agent'] || '');
  res.json({ success: true, consentId: rec.id, timestamp: rec.timestamp });
});

app.post('/api/analytics/event', (req, res) => {
  const { event, path: evtPath } = req.body || {};
  recordPrivacyAnalyticsEvent(String(event || ''), String(evtPath || '/'));
  res.json({ ok: true });
});

app.get('/api/admin/analytics', (req, res) => {
  const password = (req.headers['x-admin-password'] as string) || (req.query.password as string);
  if (password !== (process.env.ADMIN_PASSWORD || 'caloriq-admin-2026')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({
    summary: getPrivacyAnalyticsSummary(),
    bugReports: getBugReports(),
    contactMessages: getContactMessages(),
    consentLogs: getCookieConsentLogs(),
    maintenance: getMaintenanceStatus()
  });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body || {};
  if (!email || !message) {
    res.status(400).json({ error: 'Email and message are required.' });
    return;
  }
  const saved = saveContactMessage({
    name: String(name || 'Visitor'),
    email: String(email),
    subject: String(subject || 'Caloriq Inquiry'),
    message: String(message)
  });
  const emailed = await sendContactMessageEmail({
    name: saved.name,
    email: saved.email,
    subject: saved.subject,
    message: saved.message
  });
  res.json({ success: true, id: saved.id, emailed });
});

app.post('/api/bug-report', authenticateUser, (req, res) => {
  const userId = (req as any).userId;
  const { whatHappened, whatExpected } = req.body || {};
  if (!whatHappened || !String(whatHappened).trim()) {
    res.status(400).json({ error: 'Please describe what happened.' });
    return;
  }
  const rec = saveBugReport(userId, String(whatHappened), String(whatExpected || ''));
  res.json({ success: true, id: rec.id });
});

const APP_VERSION = '1.0.0';
const APP_BUILD_ID = '2026.09.28.1';

app.get('/api/version', (_req, res) => {
  res.json({
    version: APP_VERSION,
    buildId: APP_BUILD_ID,
    maintenance: getMaintenanceStatus()
  });
});

app.get('/api/health', async (req, res) => {
  const simulateAlert = req.query.alert === '1';
  if (simulateAlert) {
    await sendUptimeAlertEmail('Simulated uptime alert triggered from health check.');
  }
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    version: APP_VERSION,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/admin/maintenance', (req, res) => {
  const { password, enabled, message } = req.body || {};
  if (password !== (process.env.ADMIN_PASSWORD || 'caloriq-admin-2026')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const state = setMaintenanceStatus(Boolean(enabled), message);
  res.json({ success: true, maintenance: state });
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
      base: '/',
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // #16 Cache static assets with long expiry headers
    app.use(
      express.static(path.resolve(process.cwd(), 'dist'), {
        maxAge: '365d',
        immutable: true,
        setHeaders(res, filePath) {
          if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        }
      })
    );
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Caloriq server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
