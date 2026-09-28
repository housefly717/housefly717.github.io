import type {
  FoodItem,
  ExerciseItem,
  UserProfile,
  SavedFood,
  SavedRecipe,
  MealTemplate,
  WeekPlan,
  UserStats,
  ChatMessage,
  WeightRecord,
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
import { standaloneFetch } from './standaloneBackend.js';

const TOKEN_KEY = 'caloriq_session_token';
const GUEST_KEY = 'caloriq_guest_id';
const OFFLINE_QUEUE_KEY = 'caloriq_offline_queue';
const CLIENT_USERS_KEY = 'caloriq_client_users';
const USER_EMAIL_KEY = 'caloriq_user_email';

interface ClientUserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

function hashClientPassword(password: string): string {
  let h1 = 0xdeadbeef ^ password.length;
  let h2 = 0x41c6ce57 ^ password.length;
  const salted = `caloriq_client_${password}`;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function getEmptyClientProfile(name: string = '', username: string = ''): UserProfile {
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

function getClientUsers(): Record<string, ClientUserRecord> {
  try {
    const raw = localStorage.getItem(CLIENT_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveClientUsers(users: Record<string, ClientUserRecord>) {
  localStorage.setItem(CLIENT_USERS_KEY, JSON.stringify(users));
}

interface QueuedRequest {
  id: string;
  endpoint: string;
  method: string;
  body?: any;
  timestamp: number;
}

class ApiService {
  private token: string | null = null;
  private sse: EventSource | null = null;
  private syncListeners: Array<() => void> = [];
  private saveStatusListeners: Array<(status: 'saved' | 'saving' | 'error') => void> = [];
  private conflictListeners: Array<(date?: string) => void> = [];
  private activeSaves = 0;
  private lastLocalMutationAt = 0;
  private tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushOfflineQueue();
      });
      window.addEventListener('storage', (e) => {
        if (e.key === 'caloriq_last_mutation' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed.tabId !== this.tabId && parsed.token && parsed.token === this.token) {
              this.notifyConflict(parsed.date);
            }
          } catch {
            // ignore
          }
        }
      });
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string, isGuest: boolean, rememberMe: boolean = true) {
    this.token = token;
    if (isGuest || rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
      sessionStorage.removeItem(TOKEN_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.removeItem(TOKEN_KEY);
    }
    if (isGuest) {
      localStorage.setItem(GUEST_KEY, token);
    } else {
      localStorage.removeItem(GUEST_KEY);
    }
    this.initSse();
  }

  getGuestId(): string | null {
    return localStorage.getItem(GUEST_KEY);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GUEST_KEY);
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
  }

  logout() {
    this.clearToken();
  }

  getOfflineQueue(): QueuedRequest[] {
    try {
      const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private enqueueOffline(endpoint: string, method: string, body?: any) {
    const queue = this.getOfflineQueue();
    queue.push({
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      endpoint,
      method,
      body,
      timestamp: Date.now()
    });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  async flushOfflineQueue(): Promise<number> {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return 0;

    let synced = 0;
    const remaining: QueuedRequest[] = [];

    for (const item of queue) {
      try {
        await this.request(item.endpoint, {
          method: item.method,
          body: item.body ? JSON.stringify(item.body) : undefined
        }, true);
        synced++;
      } catch {
        remaining.push(item);
      }
    }

    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    if (synced > 0) {
      this.triggerSync();
    }
    return synced;
  }

  onSync(listener: () => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter(l => l !== listener);
    };
  }

  onSaveStatusChange(listener: (status: 'saved' | 'saving' | 'error') => void): () => void {
    this.saveStatusListeners.push(listener);
    return () => {
      this.saveStatusListeners = this.saveStatusListeners.filter(l => l !== listener);
    };
  }

  private notifySaveStatus(status: 'saved' | 'saving' | 'error') {
    for (const listener of this.saveStatusListeners) {
      listener(status);
    }
  }

  onSyncConflict(listener: (date?: string) => void): () => void {
    this.conflictListeners.push(listener);
    return () => {
      this.conflictListeners = this.conflictListeners.filter(l => l !== listener);
    };
  }

  private notifyConflict(date?: string) {
    for (const listener of this.conflictListeners) {
      listener(date);
    }
  }

  private triggerSync() {
    for (const listener of this.syncListeners) {
      listener();
    }
  }

  initSse() {
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
    if (!this.token) return;
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') return;

    try {
      this.sse = new EventSource(`/api/sync/events?token=${encodeURIComponent(this.token)}`);
      this.sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'sync') {
            if (Date.now() - this.lastLocalMutationAt > 1500) {
              const conflictDate = data.payload?.date || data.payload?.targetDate;
              this.notifyConflict(conflictDate);
            }
            this.triggerSync();
          }
        } catch (e) {
          // ignore parsing error
        }
      };
      this.sse.onerror = () => {
        // SSE auto reconnects
      };
    } catch (e) {
      console.warn('SSE connection failed', e);
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}, skipQueue: boolean = false): Promise<T> {
    const method = (options.method || 'GET').toUpperCase();
    const isSaveMutation =
      (method === 'POST' || method === 'PUT' || method === 'DELETE') &&
      !endpoint.startsWith('/api/auth/') &&
      !endpoint.startsWith('/api/ai/') &&
      !endpoint.startsWith('/api/usda/') &&
      !endpoint.startsWith('/api/recipes/parse-line');

    if (isSaveMutation) {
      this.lastLocalMutationAt = Date.now();
      this.activeSaves++;
      this.notifySaveStatus('saving');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let res: Response;
    try {
      res = await standaloneFetch(endpoint, {
        ...options,
        headers
      });
    } catch (networkErr: any) {
      if (isSaveMutation) {
        this.activeSaves = Math.max(0, this.activeSaves - 1);
      }
      if (endpoint.startsWith('/api/ai/')) {
        throw new Error('The AI is busy. Try again in a minute, or use Manual entry.');
      }
      // Offline mode fallback for POST/PUT/DELETE mutations (excluding auth)
      if (!skipQueue && !endpoint.startsWith('/api/auth/') && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        const parsedBody = options.body ? JSON.parse(String(options.body)) : undefined;
        this.enqueueOffline(endpoint, method, parsedBody);
        if (isSaveMutation && this.activeSaves === 0) {
          this.notifySaveStatus('saved');
        }
        return {
          ...parsedBody,
          id: `offline_${Date.now()}`,
          userId: this.token || 'guest',
          createdAt: Date.now(),
          offlineQueued: true,
          success: true
        } as unknown as T;
      }
      if (isSaveMutation) {
        this.notifySaveStatus('error');
      }
      throw new Error(
        "Can't reach the server right now. Your data is saved on this device and will sync when you're back online."
      );
    }

    if (!res.ok) {
      if (isSaveMutation) {
        this.activeSaves = Math.max(0, this.activeSaves - 1);
        this.notifySaveStatus('error');
      }
      if (endpoint.startsWith('/api/ai/')) {
        throw new Error('The AI is busy. Try again in a minute, or use Manual entry.');
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const customErr: any = new Error(err.error || `Request failed with status ${res.status}`);
      customErr.reason = err.reason;
      customErr.attemptsRemaining = err.attemptsRemaining;
      customErr.retryAfterSeconds = err.retryAfterSeconds;
      throw customErr;
    }

    const result = await res.json();
    if (isSaveMutation) {
      this.activeSaves = Math.max(0, this.activeSaves - 1);
      if (this.activeSaves === 0) {
        this.notifySaveStatus('saved');
      }
      try {
        const parsedBody = options.body ? JSON.parse(String(options.body)) : undefined;
        localStorage.setItem(
          'caloriq_last_mutation',
          JSON.stringify({
            tabId: this.tabId,
            token: this.token,
            date: parsedBody?.date,
            ts: Date.now()
          })
        );
      } catch {
        // ignore
      }
    }
    return result;
  }

  // Auth
  private getLocalProfile(userId: string, email?: string): UserProfile {
    try {
      const raw = localStorage.getItem(`caloriq_local_profile_${userId}`);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    const baseName = email ? '' : 'Guest User';
    const baseUser = email ? email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `caloriq_${userId.slice(0, 6)}`;
    return getEmptyClientProfile(baseName, baseUser);
  }

  private saveLocalProfile(userId: string, profile: UserProfile) {
    try {
      localStorage.setItem(`caloriq_local_profile_${userId}`, JSON.stringify(profile));
    } catch {
      // ignore
    }
  }

  async initSession(): Promise<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }> {
    const defaultStats: UserStats = { xp: 0, level: 1, badges: [], foodStreak: 0, workoutStreak: 0 };

    if (!this.token) {
      try {
        const guestRes = await this.request<{ userId: string; isGuest: boolean; token: string }>('/api/auth/guest', {
          method: 'POST'
        }, true);
        this.setToken(guestRes.token, true);
      } catch {
        const localGuestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.setToken(localGuestId, true);
        const profile = this.getLocalProfile(localGuestId);
        return { userId: localGuestId, isGuest: true, profile, stats: defaultStats };
      }
    }

    try {
      const me = await this.request<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }>('/api/auth/me', {}, true);
      if (me.profile) {
        this.saveLocalProfile(me.userId, me.profile);
      }
      if (me.email) {
        localStorage.setItem(USER_EMAIL_KEY, me.email);
      }
      this.initSse();
      return me;
    } catch (e) {
      // Check if this is a client-side static host user session
      const savedEmail = localStorage.getItem(USER_EMAIL_KEY) || undefined;
      if (this.token && this.token.startsWith('usr_client_')) {
        const profile = this.getLocalProfile(this.token, savedEmail);
        return {
          userId: this.token,
          email: savedEmail,
          isGuest: false,
          profile,
          stats: defaultStats
        };
      }

      this.clearToken();
      try {
        const guestRes = await this.request<{ userId: string; isGuest: boolean; token: string }>('/api/auth/guest', {
          method: 'POST'
        }, true);
        this.setToken(guestRes.token, true);
        const me = await this.request<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }>('/api/auth/me', {}, true);
        this.initSse();
        return me;
      } catch {
        const localGuestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.setToken(localGuestId, true);
        const profile = this.getLocalProfile(localGuestId);
        return { userId: localGuestId, isGuest: true, profile, stats: defaultStats };
      }
    }
  }

  async sendSignupVerificationCode(
    email: string,
    password: string,
    honeypot?: string
  ): Promise<{ sent: boolean; resendCooldownSeconds: number }> {
    const cleanEmail = email.trim().toLowerCase();
    if (honeypot) {
      throw new Error('Unable to process request.');
    }
    let res: Response;
    try {
      res = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, honeypot })
      });
    } catch {
      throw new Error("Couldn't send the email. Try again in a minute.");
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err: any = new Error(errBody.error || "Couldn't send the email. Try again in a minute.");
      err.retryAfterSeconds = errBody.retryAfterSeconds;
      throw err;
    }

    return await res.json();
  }

  async verifySignupCode(
    email: string,
    password: string,
    code: string,
    rememberMe: boolean = true
  ): Promise<{ userId: string; email: string; token: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const guestId = this.getGuestId();
    const pwHash = hashClientPassword(password);

    let res: Response;
    try {
      res = await fetch('/api/auth/verify-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, code: code.trim(), guestId })
      });
    } catch {
      throw new Error("Can't reach the server right now. Please try again.");
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const err: any = new Error(errBody.error || "That code isn't right. Check your email and try again.");
      err.reason = errBody.reason;
      err.locked = Boolean(errBody.locked);
      err.attemptsRemaining = errBody.attemptsRemaining;
      throw err;
    }

    const data = await res.json();
    const users = getClientUsers();
    users[cleanEmail] = {
      userId: data.userId,
      email: cleanEmail,
      passwordHash: pwHash,
      createdAt: Date.now()
    };
    saveClientUsers(users);
    localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
    this.setToken(data.token, false, rememberMe);
    return data;
  }

  async requestPasswordReset(email: string): Promise<{ sent: boolean }> {
    const cleanEmail = email.trim().toLowerCase();
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    let res: Response;
    try {
      res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, appOrigin })
      });
    } catch {
      throw new Error("Couldn't send the email. Try again in a minute.");
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Couldn't send the email. Try again in a minute.");
    }

    return await res.json();
  }

  async resetPassword(
    email: string,
    token: string,
    newPassword: string,
    rememberMe: boolean = true
  ): Promise<{ userId: string; email: string; token: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const guestId = this.getGuestId();
    const pwHash = hashClientPassword(newPassword);

    let res: Response;
    try {
      res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, token: token.trim(), newPassword, guestId })
      });
    } catch {
      throw new Error("Can't reach the server right now. Please try again.");
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Could not reset password.');
    }

    const data = await res.json();
    const users = getClientUsers();
    users[cleanEmail] = {
      userId: data.userId,
      email: cleanEmail,
      passwordHash: pwHash,
      createdAt: Date.now()
    };
    saveClientUsers(users);
    localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
    this.setToken(data.token, false, rememberMe);
    return data;
  }

  async signup(
    email: string,
    password: string,
    rememberMe: boolean = true
  ): Promise<{ userId: string; email: string; token: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const guestId = this.getGuestId();
    const pwHash = hashClientPassword(password);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, guestId })
      });

      if (res.ok) {
        const data = await res.json();
        const users = getClientUsers();
        users[cleanEmail] = {
          userId: data.userId,
          email: cleanEmail,
          passwordHash: pwHash,
          createdAt: Date.now()
        };
        saveClientUsers(users);
        localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
        this.setToken(data.token, false, rememberMe);
        return data;
      }

      // If backend returned a 400 validation error, surface it
      if (res.status === 400) {
        const err = await res.json().catch(() => ({ error: 'Failed to create account.' }));
        throw new Error(err.error || 'Failed to create account.');
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('already exists') || err.message.includes('valid email') || err.message.includes('Password must'))) {
        throw err;
      }
      // Static host fallback: create account entirely in browser
    }

    const users = getClientUsers();
    if (users[cleanEmail] && users[cleanEmail].passwordHash !== pwHash) {
      throw new Error('An account with this email already exists. Please sign in.');
    }

    const userId = users[cleanEmail]?.userId || `usr_client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    users[cleanEmail] = {
      userId,
      email: cleanEmail,
      passwordHash: pwHash,
      createdAt: Date.now()
    };
    saveClientUsers(users);
    localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
    const emptyProf = getEmptyClientProfile(cleanEmail.split('@')[0], cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '_'));
    this.saveLocalProfile(userId, emptyProf);
    this.setToken(userId, false, rememberMe);

    return {
      userId,
      email: cleanEmail,
      token: userId
    };
  }

  async login(
    email: string,
    password: string,
    rememberMe: boolean = true
  ): Promise<{ userId: string; email: string; token: string }> {
    const cleanEmail = email.trim().toLowerCase();
    const guestId = this.getGuestId();
    const pwHash = hashClientPassword(password);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password, guestId })
      });

      if (res.ok) {
        const data = await res.json();
        const users = getClientUsers();
        users[cleanEmail] = {
          userId: data.userId,
          email: cleanEmail,
          passwordHash: pwHash,
          createdAt: Date.now()
        };
        saveClientUsers(users);
        localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
        this.setToken(data.token, false, rememberMe);
        return data;
      }

      if (res.status === 400 || res.status === 401) {
        const err = await res.json().catch(() => ({ error: 'Invalid email or password.' }));
        throw new Error(err.error || 'Invalid email or password.');
      }
    } catch (err: any) {
      if (err.message && (err.message.includes('No account found') || err.message.includes('Incorrect password') || err.message.includes('Invalid email'))) {
        throw err;
      }
      // Static host fallback: verify in browser
    }

    const users = getClientUsers();
    const existing = users[cleanEmail];
    if (!existing) {
      throw new Error('No account found with that email. Please sign up first.');
    }
    if (existing.passwordHash !== pwHash) {
      throw new Error('Incorrect password. Please try again.');
    }

    localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
    localStorage.setItem('caloriq_last_signed_in_at', String(Date.now()));
    this.setToken(existing.userId, false, rememberMe);
    return {
      userId: existing.userId,
      email: cleanEmail,
      token: existing.userId
    };
  }

  // Diary
  async getDiary(date: string): Promise<{ date: string; items: FoodItem[] }> {
    return this.request(`/api/diary?date=${date}`);
  }

  async getAllDiary(): Promise<{ items: FoodItem[] }> {
    return this.request('/api/diary/all');
  }

  async addFood(food: Omit<FoodItem, 'id' | 'userId' | 'createdAt'>): Promise<FoodItem> {
    return this.request('/api/diary', {
      method: 'POST',
      body: JSON.stringify(food)
    });
  }

  async updateFood(id: string, updates: Partial<FoodItem>): Promise<FoodItem> {
    return this.request(`/api/diary/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  async deleteFood(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/diary/${id}`, {
      method: 'DELETE'
    });
  }

  async copyYesterday(date: string, mealType?: MealType): Promise<{ success: boolean; count: number; items: FoodItem[] }> {
    return this.request('/api/diary/copy-yesterday', {
      method: 'POST',
      body: JSON.stringify({ date, mealType })
    });
  }

  // Water
  async getWater(date: string): Promise<{ date: string; glasses: number }> {
    return this.request(`/api/water?date=${date}`);
  }

  async setWater(date: string, glasses: number): Promise<{ date: string; glasses: number }> {
    return this.request('/api/water', {
      method: 'POST',
      body: JSON.stringify({ date, glasses })
    });
  }

  // Exercise
  async getExercise(date: string): Promise<{ date: string; items: ExerciseItem[] }> {
    return this.request(`/api/exercise?date=${date}`);
  }

  async getAllExercise(): Promise<{ items: ExerciseItem[] }> {
    return this.request('/api/exercise/all');
  }

  async addExercise(exercise: Omit<ExerciseItem, 'id' | 'userId' | 'createdAt'>): Promise<ExerciseItem> {
    return this.request('/api/exercise', {
      method: 'POST',
      body: JSON.stringify(exercise)
    });
  }

  async deleteExercise(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/exercise/${id}`, {
      method: 'DELETE'
    });
  }

  // Weight
  async getWeights(): Promise<{ items: WeightRecord[] }> {
    return this.request('/api/weight');
  }

  async addWeight(date: string, weightKg: number): Promise<WeightRecord> {
    return this.request('/api/weight', {
      method: 'POST',
      body: JSON.stringify({ date, weightKg })
    });
  }

  async deleteWeight(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/weight/${id}`, {
      method: 'DELETE'
    });
  }

  // Measurements & Photos
  async getMeasurements(): Promise<{ items: BodyMeasurement[] }> {
    return this.request('/api/measurements');
  }

  async addMeasurement(entry: Omit<BodyMeasurement, 'id' | 'userId' | 'createdAt'>): Promise<BodyMeasurement> {
    return this.request('/api/measurements', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async deleteMeasurement(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/measurements/${id}`, {
      method: 'DELETE'
    });
  }

  async getProgressPhotos(): Promise<{ items: ProgressPhoto[] }> {
    return this.request('/api/progress-photos');
  }

  async addProgressPhoto(entry: Omit<ProgressPhoto, 'id' | 'userId' | 'createdAt'>): Promise<ProgressPhoto> {
    return this.request('/api/progress-photos', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async deleteProgressPhoto(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/progress-photos/${id}`, {
      method: 'DELETE'
    });
  }

  // Habits, Cravings, Non-Scale Victories
  async getHabits(date: string): Promise<{ habit: DailyHabitLog; allHabits: DailyHabitLog[] }> {
    return this.request(`/api/habits?date=${date}`);
  }

  async saveHabit(date: string, updates: Partial<DailyHabitLog>): Promise<DailyHabitLog> {
    return this.request('/api/habits', {
      method: 'POST',
      body: JSON.stringify({ date, ...updates })
    });
  }

  async getCravings(): Promise<{ items: CravingLog[] }> {
    return this.request('/api/cravings');
  }

  async addCraving(entry: Omit<CravingLog, 'id' | 'userId' | 'createdAt'>): Promise<CravingLog> {
    return this.request('/api/cravings', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async deleteCraving(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/cravings/${id}`, {
      method: 'DELETE'
    });
  }

  async getVictories(): Promise<{ items: NonScaleVictory[] }> {
    return this.request('/api/victories');
  }

  async addVictory(date: string, text: string): Promise<NonScaleVictory> {
    return this.request('/api/victories', {
      method: 'POST',
      body: JSON.stringify({ date, text })
    });
  }

  async deleteVictory(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/victories/${id}`, {
      method: 'DELETE'
    });
  }

  // Pantry
  async getPantry(): Promise<{ items: PantryItem[] }> {
    return this.request('/api/pantry');
  }

  async addPantryItem(entry: Omit<PantryItem, 'id' | 'userId' | 'createdAt'>): Promise<PantryItem> {
    return this.request('/api/pantry', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async deletePantryItem(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/pantry/${id}`, {
      method: 'DELETE'
    });
  }

  // Social
  async getSocial(): Promise<{ friends: FriendRecord[]; sharedRecipes: SharedRecipeRecord[] }> {
    return this.request('/api/social');
  }

  async addFriend(username: string, isPartner?: boolean): Promise<FriendRecord> {
    return this.request('/api/social/friends', {
      method: 'POST',
      body: JSON.stringify({ username, isPartner })
    });
  }

  async removeFriend(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/social/friends/${id}`, {
      method: 'DELETE'
    });
  }

  async shareRecipe(payload: {
    toUsername: string;
    recipeName: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }): Promise<SharedRecipeRecord> {
    return this.request('/api/social/share-recipe', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // AI Endpoints
  async parseVoiceMeal(transcript: string): Promise<any> {
    return this.request('/api/ai/voice-log', {
      method: 'POST',
      body: JSON.stringify({ transcript })
    });
  }

  async analyzePlatePhoto(image: string, mimeType?: string): Promise<any> {
    return this.request('/api/ai/plate-photo', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType })
    });
  }

  async analyzeFridgePhoto(
    image: string,
    remainingMacros: { calories: number; protein: number; carbs: number; fat: number },
    mimeType?: string
  ): Promise<any> {
    return this.request('/api/ai/fridge-photo', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType, remainingMacros })
    });
  }

  async scanReceipt(image: string, mimeType?: string): Promise<any> {
    return this.request('/api/ai/receipt-scan', {
      method: 'POST',
      body: JSON.stringify({ image, mimeType })
    });
  }

  async estimateRestaurantDish(restaurant: string, dish: string): Promise<any> {
    return this.request('/api/ai/restaurant-estimate', {
      method: 'POST',
      body: JSON.stringify({ restaurant, dish })
    });
  }

  async suggestFixMyDay(overByKcal: number, loggedFoods: any[]): Promise<any> {
    return this.request('/api/ai/fix-my-day', {
      method: 'POST',
      body: JSON.stringify({ overByKcal, loggedFoods })
    });
  }

  async suggestWhatCanIMake(
    pantryItems: string[],
    remainingMacros: { calories: number; protein: number; carbs: number; fat: number }
  ): Promise<any> {
    return this.request('/api/ai/what-can-i-make', {
      method: 'POST',
      body: JSON.stringify({ pantryItems, remainingMacros })
    });
  }

  async estimatePortion(payload: {
    foodName: string;
    dimensionsText?: string;
    base64Image?: string;
    mimeType?: string;
  }): Promise<any> {
    return this.request('/api/ai/portion-estimator', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getCravingPattern(cravings: CravingLog[]): Promise<{ pattern: string }> {
    return this.request('/api/ai/craving-pattern', {
      method: 'POST',
      body: JSON.stringify({ cravings })
    });
  }

  async getWeeklyInsights(payload: any): Promise<{ hasEnoughData: boolean; message?: string; bullets: string[] }> {
    return this.request('/api/ai/weekly-insights', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // Saved Foods & Recipes
  async getSavedFoods(): Promise<{ foods: SavedFood[] }> {
    return this.request('/api/saved-foods');
  }

  async addSavedFood(food: Omit<SavedFood, 'id' | 'userId' | 'createdAt'>): Promise<SavedFood> {
    return this.request('/api/saved-foods', {
      method: 'POST',
      body: JSON.stringify(food)
    });
  }

  async deleteSavedFood(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/saved-foods/${id}`, {
      method: 'DELETE'
    });
  }

  async getSavedRecipes(): Promise<{ recipes: SavedRecipe[] }> {
    return this.request('/api/recipes');
  }

  async getRecipes(): Promise<{ recipes: SavedRecipe[] }> {
    return this.getSavedRecipes();
  }

  async searchRecipe(name: string): Promise<{ recipe?: SavedRecipe }> {
    return this.request(`/api/recipes/search?name=${encodeURIComponent(name)}`);
  }

  async saveRecipe(recipe: Omit<SavedRecipe, 'id' | 'userId' | 'createdAt'>): Promise<SavedRecipe> {
    return this.request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe)
    });
  }

  async deleteSavedRecipe(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/recipes/${id}`, {
      method: 'DELETE'
    });
  }

  async parseRecipeLine(line: string): Promise<any> {
    return this.request('/api/recipes/parse-line', {
      method: 'POST',
      body: JSON.stringify({ line })
    });
  }

  // Meal Templates
  async getTemplates(): Promise<{ templates: MealTemplate[] }> {
    return this.request('/api/meal-templates');
  }

  async saveTemplate(name: string, date: string): Promise<MealTemplate> {
    return this.request('/api/meal-templates', {
      method: 'POST',
      body: JSON.stringify({ name, date })
    });
  }

  async applyTemplate(templateId: string, date: string): Promise<{ success: boolean; count: number }> {
    return this.request('/api/meal-templates/apply', {
      method: 'POST',
      body: JSON.stringify({ templateId, date })
    });
  }

  async deleteTemplate(id: string): Promise<{ success: boolean }> {
    return this.request(`/api/meal-templates/${id}`, {
      method: 'DELETE'
    });
  }

  async restoreTemplate(
    nameOrTemplate: string | MealTemplate,
    items?: MealTemplate['items']
  ): Promise<MealTemplate> {
    const name = typeof nameOrTemplate === 'string' ? nameOrTemplate : nameOrTemplate.name;
    const resolvedItems = typeof nameOrTemplate === 'string' ? (items || []) : nameOrTemplate.items;
    return this.request('/api/meal-templates/restore', {
      method: 'POST',
      body: JSON.stringify({ name, items: resolvedItems })
    });
  }

  // Plan
  async getPlan(): Promise<{ plan?: WeekPlan }> {
    return this.request('/api/plan');
  }

  async generatePlan(payload: any): Promise<{ success: boolean; plan: WeekPlan }> {
    return this.request('/api/plan/generate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async savePlan(plan: WeekPlan): Promise<{ success: boolean; plan: WeekPlan }> {
    return this.request('/api/plan/save', {
      method: 'POST',
      body: JSON.stringify({ plan })
    });
  }

  // Developer Chat
  async getChat(): Promise<{ messages: ChatMessage[] }> {
    return this.request('/api/developer-chat');
  }

  async sendChatMessage(text: string): Promise<ChatMessage> {
    return this.request('/api/developer-chat', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  // Profile & Stats
  async getProfile(): Promise<{ profile: UserProfile; stats: UserStats }> {
    return this.request('/api/profile');
  }

  async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    if (this.token) {
      const curr = this.getLocalProfile(this.token);
      this.saveLocalProfile(this.token, { ...curr, ...updates });
    }
    try {
      const updated = await this.request<UserProfile>('/api/profile', {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      if (this.token && updated) {
        this.saveLocalProfile(this.token, updated);
      }
      return updated;
    } catch {
      return this.getLocalProfile(this.token || 'guest');
    }
  }

  async getStats(): Promise<UserStats> {
    return this.request('/api/stats');
  }

  async clearAllData(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/clear', {
      method: 'POST'
    });
  }

  async deleteAccount(password?: string): Promise<{ success: boolean; message: string }> {
    return this.request('/api/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  // #54 Google Sign-In alternative
  async loginWithGoogle(email: string, name: string, rememberMe = true): Promise<AuthResponse> {
    const guestId = localStorage.getItem(GUEST_KEY);
    const data = await this.request<AuthResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ email, name, guestId })
    });
    this.setToken(data.token, rememberMe);
    localStorage.removeItem(GUEST_KEY);
    if (data.email) {
      localStorage.setItem('caloriq_user_email', data.email);
      localStorage.setItem('caloriq_last_signed_in_at', String(Date.now()));
    }
    return data;
  }

  // #58 Demo Mode on landing page
  async startDemoMode(): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({})
    });
    this.setToken(data.token, false);
    return data;
  }

  // #52 & #31 Sessions & Sign out all devices
  async getSessions(): Promise<{
    sessions: Array<{
      id: string;
      userId: string;
      deviceName: string;
      city: string;
      createdAt: number;
      lastActiveAt: number;
    }>;
  }> {
    return this.request('/api/auth/sessions');
  }

  async revokeSession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
  }

  async signOutAllDevices(): Promise<{ success: boolean; revokedCount: number }> {
    return this.request('/api/auth/signout-all', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  // #49 Email change flow
  async changeEmail(oldEmail: string, newEmail: string, password?: string): Promise<{ success: boolean; email: string }> {
    const res = await this.request<{ success: boolean; email: string }>('/api/auth/change-email', {
      method: 'POST',
      body: JSON.stringify({ oldEmail, newEmail, password })
    });
    if (res.email) {
      localStorage.setItem('caloriq_user_email', res.email);
    }
    return res;
  }

  // #50 Password change flow
  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmNewPassword })
    });
  }

  // #79 & #80 Restore from backup JSON
  async restoreFromBackup(migratedPayload: any): Promise<{
    success: boolean;
    restoredCounts: { diary: number; exercises: number; weights: number };
  }> {
    return this.request('/api/import', {
      method: 'POST',
      body: JSON.stringify(migratedPayload)
    });
  }

  // #34 Cookie consent logging with timestamp & IP
  async logCookieConsent(choice: 'accepted' | 'declined'): Promise<{ success: boolean; timestamp: string }> {
    return this.request('/api/compliance/cookie-consent', {
      method: 'POST',
      body: JSON.stringify({ choice })
    });
  }

  // #46 Contact page submission
  async submitContactForm(payload: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<{ success: boolean; id: string; emailed: boolean }> {
    return this.request('/api/contact', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // #47 Report a bug submission
  async submitBugReport(payload: {
    whatHappened: string;
    whatExpected: string;
  }): Promise<{ success: boolean; id: string }> {
    return this.request('/api/bug-report', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  // #75 & #77 Version & maintenance check
  async getSystemVersion(): Promise<{
    version: string;
    buildId: string;
    maintenance: { enabled: boolean; message: string };
  }> {
    return this.request('/api/version');
  }

  // #44 Admin analytics summary
  async getAdminAnalytics(password: string): Promise<any> {
    const res = await fetch(`/api/admin/analytics?password=${encodeURIComponent(password)}`, {
      headers: { 'x-admin-password': password }
    });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  }

  async setAdminMaintenance(
    password: string,
    enabled: boolean,
    message: string
  ): Promise<{ success: boolean; maintenance: { enabled: boolean; message: string } }> {
    const res = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, enabled, message })
    });
    if (!res.ok) throw new Error('Failed to update maintenance status');
    return res.json();
  }

  // USDA
  async getUsdaStatus(): Promise<{ available: boolean }> {
    return this.request('/api/usda/status');
  }

  async searchUsda(query: string, storeFilter?: string): Promise<{ available: boolean; error?: string; foods: any[] }> {
    return this.request('/api/usda/search', {
      method: 'POST',
      body: JSON.stringify({ query, storeFilter })
    });
  }

  // Admin
  async verifyAdminPassword(password: string): Promise<boolean> {
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async saveAdminUsdaKey(password: string, apiKey: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/admin/save-usda-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, apiKey })
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Not found');
      }
      const data = await res.json().catch(() => ({ error: 'Failed to save' }));
      throw new Error(data.error || 'Failed to save key');
    }

    return res.json();
  }
}

export const api = new ApiService();
