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

const TOKEN_KEY = 'caloriq_session_token';
const GUEST_KEY = 'caloriq_guest_id';
const OFFLINE_QUEUE_KEY = 'caloriq_offline_queue';

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

  constructor() {
    this.token = localStorage.getItem(TOKEN_KEY);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushOfflineQueue();
      });
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string, isGuest: boolean) {
    this.token = token;
    localStorage.setItem(TOKEN_KEY, token);
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
    localStorage.removeItem(GUEST_KEY);
    if (this.sse) {
      this.sse.close();
      this.sse = null;
    }
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers
      });

      if (!res.ok) {
        if (endpoint.startsWith('/api/ai/')) {
          throw new Error('The AI is busy. Try again in a minute, or use Manual entry.');
        }
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Request failed with status ${res.status}`);
      }

      return await res.json();
    } catch (err: any) {
      if (endpoint.startsWith('/api/ai/')) {
        throw new Error('The AI is busy. Try again in a minute, or use Manual entry.');
      }
      // Offline mode fallback for POST/PUT/DELETE mutations
      const method = (options.method || 'GET').toUpperCase();
      if (!skipQueue && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        const parsedBody = options.body ? JSON.parse(String(options.body)) : undefined;
        this.enqueueOffline(endpoint, method, parsedBody);
        return {
          ...parsedBody,
          id: `offline_${Date.now()}`,
          userId: this.token || 'guest',
          createdAt: Date.now(),
          offlineQueued: true,
          success: true
        } as unknown as T;
      }
      throw new Error(
        "Can't reach the server right now. Your data is saved on this device and will sync when you're back online."
      );
    }
  }

  // Auth
  async initSession(): Promise<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }> {
    if (!this.token) {
      const guestRes = await this.request<{ userId: string; isGuest: boolean; token: string }>('/api/auth/guest', {
        method: 'POST'
      });
      this.setToken(guestRes.token, true);
    }

    try {
      const me = await this.request<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }>('/api/auth/me');
      this.initSse();
      return me;
    } catch (e) {
      this.clearToken();
      const guestRes = await this.request<{ userId: string; isGuest: boolean; token: string }>('/api/auth/guest', {
        method: 'POST'
      });
      this.setToken(guestRes.token, true);
      const me = await this.request<{ userId: string; email?: string; isGuest: boolean; profile: UserProfile; stats: UserStats }>('/api/auth/me');
      this.initSse();
      return me;
    }
  }

  async sendOtp(email: string): Promise<{ success: boolean; message: string; previewCode?: string }> {
    return this.request('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }

  async verifyOtp(email: string, code: string): Promise<{ userId: string; email: string; token: string; message: string }> {
    const guestId = this.getGuestId();
    const res = await this.request<{ userId: string; email: string; token: string; message: string }>('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, guestId })
    });
    this.setToken(res.token, false);
    return res;
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

  async searchRecipe(name: string): Promise<{ recipe?: SavedRecipe }> {
    return this.request(`/api/recipes/search?name=${encodeURIComponent(name)}`);
  }

  async saveRecipe(recipe: Omit<SavedRecipe, 'id' | 'userId' | 'createdAt'>): Promise<SavedRecipe> {
    return this.request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipe)
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
    return this.request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  async getStats(): Promise<UserStats> {
    return this.request('/api/stats');
  }

  async clearAllData(): Promise<{ success: boolean; message: string }> {
    return this.request('/api/clear', {
      method: 'POST'
    });
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
