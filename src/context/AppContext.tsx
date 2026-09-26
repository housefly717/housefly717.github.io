import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type {
  FoodItem,
  ExerciseItem,
  UserProfile,
  UserStats,
  MealType,
  MacroTarget,
  WeightRecord,
  DailyHabitLog,
  CravingLog,
  NonScaleVictory,
  PantryItem
} from '../types/index.js';
import { api } from '../services/api.js';
import { calculateDailyCalorieTarget, calculateMacroTargets } from '../utils/nutritionMath.js';
import { triggerHaptic } from '../utils/haptics.js';

export interface UndoToastItem {
  id: string;
  label: string;
  onUndo: () => Promise<void>;
}

interface AppContextType {
  userId: string;
  userEmail?: string;
  isGuest: boolean;
  activeDate: string;
  setActiveDate: (date: string) => void;
  diaryItems: FoodItem[];
  allDiaryItems: FoodItem[];
  waterGlasses: number;
  exercises: ExerciseItem[];
  allExercises: ExerciseItem[];
  weights: WeightRecord[];
  profile: UserProfile;
  stats: UserStats;
  macroTarget: MacroTarget;
  todayHabit: DailyHabitLog | null;
  allHabits: DailyHabitLog[];
  cravings: CravingLog[];
  victories: NonScaleVictory[];
  pantryItems: PantryItem[];
  isOnline: boolean;
  offlineQueueCount: number;
  isLoading: boolean;
  isSyncing: boolean;
  selectedMealForAdd: MealType | null;
  isAddFoodOpen: boolean;
  openAddFood: (meal?: MealType) => void;
  closeAddFood: () => void;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  undoToast: UndoToastItem | null;
  triggerUndoableDelete: (label: string, onDelete: () => Promise<void>, onUndo: () => Promise<void>) => Promise<void>;
  dismissUndoToast: () => void;
  // Actions
  addFoodItem: (food: Omit<FoodItem, 'id' | 'userId' | 'createdAt'>) => Promise<FoodItem>;
  updateFoodItem: (id: string, updates: Partial<FoodItem>) => Promise<void>;
  deleteFoodItem: (id: string) => Promise<void>;
  logFoodAgainTomorrow: (food: FoodItem) => Promise<void>;
  updateWaterGlasses: (glasses: number) => Promise<void>;
  addExerciseItem: (exercise: Omit<ExerciseItem, 'id' | 'userId' | 'createdAt'>) => Promise<ExerciseItem>;
  deleteExerciseItem: (id: string) => Promise<void>;
  addWeightLog: (weightKg: number, date?: string) => Promise<void>;
  deleteWeightLog: (id: string) => Promise<void>;
  copyYesterdayMeals: (mealType?: MealType) => Promise<number>;
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>;
  saveTodayHabit: (updates: Partial<DailyHabitLog>) => Promise<void>;
  addCravingItem: (entry: Omit<CravingLog, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deleteCravingItem: (id: string) => Promise<void>;
  addVictoryItem: (text: string, date?: string) => Promise<void>;
  deleteVictoryItem: (id: string) => Promise<void>;
  addPantryEntry: (entry: Omit<PantryItem, 'id' | 'userId' | 'createdAt'>) => Promise<void>;
  deletePantryEntry: (id: string) => Promise<void>;
  refreshDayData: () => Promise<void>;
  onAuthSuccess: () => Promise<void>;
}

const defaultProfile: UserProfile = {
  name: 'Athlete',
  age: 28,
  gender: 'female',
  heightCm: 168,
  fitnessLevel: 'intermediate',
  currentWeightKg: 65,
  goalWeightKg: 60,
  dailyActivity: 'moderate',
  goalSpeed: 'lose_normal',
  unitSystem: 'metric',
  themeMode: 'dark',
  streakFreezesUsed: []
};

const defaultStats: UserStats = {
  xp: 0,
  level: 1,
  badges: [],
  foodStreak: 0,
  workoutStreak: 0
};

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getTodayStr = () => new Date().toISOString().split('T')[0];

  const [userId, setUserId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [isGuest, setIsGuest] = useState<boolean>(true);
  const [activeDate, setActiveDate] = useState<string>(getTodayStr());

  const [diaryItems, setDiaryItems] = useState<FoodItem[]>([]);
  const [allDiaryItems, setAllDiaryItems] = useState<FoodItem[]>([]);
  const [waterGlasses, setWaterGlasses] = useState<number>(0);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [allExercises, setAllExercises] = useState<ExerciseItem[]>([]);
  const [weights, setWeights] = useState<WeightRecord[]>([]);
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [todayHabit, setTodayHabit] = useState<DailyHabitLog | null>(null);
  const [allHabits, setAllHabits] = useState<DailyHabitLog[]>([]);
  const [cravings, setCravings] = useState<CravingLog[]>([]);
  const [victories, setVictories] = useState<NonScaleVictory[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineQueueCount, setOfflineQueueCount] = useState<number>(0);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [isAddFoodOpen, setIsAddFoodOpen] = useState<boolean>(false);
  const [selectedMealForAdd, setSelectedMealForAdd] = useState<MealType | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  const [undoToast, setUndoToast] = useState<UndoToastItem | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  // Compute targets
  const dailyCalories = calculateDailyCalorieTarget(profile);
  const macroTarget = calculateMacroTargets(dailyCalories);

  // Apply theme mode (dark / light / auto by time of day)
  useEffect(() => {
    const mode = profile.themeMode || 'dark';
    const root = document.documentElement;
    let useLight = false;
    if (mode === 'light') {
      useLight = true;
    } else if (mode === 'auto') {
      const hr = new Date().getHours();
      useLight = hr >= 7 && hr < 19;
    }
    if (useLight) {
      root.classList.add('light-mode');
      root.classList.remove('dark');
    } else {
      root.classList.remove('light-mode');
      root.classList.add('dark');
    }
  }, [profile.themeMode]);

  // Monitor online/offline state
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      api.flushOfflineQueue().then(() => {
        setOfflineQueueCount(api.getOfflineQueue().length);
      });
    };
    const handleOffline = () => {
      setIsOnline(false);
      setOfflineQueueCount(api.getOfflineQueue().length);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setOfflineQueueCount(api.getOfflineQueue().length);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showUndoToast = useCallback((label: string, onUndo: () => Promise<void>) => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    const id = `undo_${Date.now()}`;
    setUndoToast({ id, label, onUndo });
    undoTimerRef.current = window.setTimeout(() => {
      setUndoToast(null);
    }, 5000);
  }, []);

  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast(null);
  }, []);

  const triggerUndoableDelete = useCallback(async (
    label: string,
    onDelete: () => Promise<void>,
    onUndo: () => Promise<void>
  ) => {
    await onDelete();
    showUndoToast(label, onUndo);
  }, [showUndoToast]);

  // Load day data
  const loadDayData = useCallback(async (date: string) => {
    setIsSyncing(true);
    try {
      const [diaryRes, waterRes, exerciseRes, habitsRes] = await Promise.all([
        api.getDiary(date),
        api.getWater(date),
        api.getExercise(date),
        api.getHabits(date)
      ]);
      setDiaryItems(diaryRes.items || []);
      setWaterGlasses(waterRes.glasses || 0);
      setExercises(exerciseRes.items || []);
      setTodayHabit(habitsRes.habit || null);
      setAllHabits(habitsRes.allHabits || []);
    } catch (err) {
      console.error('Error loading day data:', err);
    } finally {
      setIsSyncing(false);
      setOfflineQueueCount(api.getOfflineQueue().length);
    }
  }, []);

  const loadGeneralData = useCallback(async () => {
    try {
      const [weightsRes, statsRes, allDiaryRes, allExRes, cravingsRes, victoriesRes, pantryRes] = await Promise.all([
        api.getWeights(),
        api.getStats(),
        api.getAllDiary(),
        api.getAllExercise(),
        api.getCravings(),
        api.getVictories(),
        api.getPantry()
      ]);
      setWeights(weightsRes.items || []);
      setStats(statsRes);
      setAllDiaryItems(allDiaryRes.items || []);
      setAllExercises(allExRes.items || []);
      setCravings(cravingsRes.items || []);
      setVictories(victoriesRes.items || []);
      setPantryItems(pantryRes.items || []);
    } catch (err) {
      console.error('Error loading general data:', err);
    }
  }, []);

  // Initialize session
  useEffect(() => {
    let unregisterSync: (() => void) | undefined;

    async function init() {
      setIsLoading(true);
      try {
        const session = await api.initSession();
        setUserId(session.userId);
        setUserEmail(session.email);
        setIsGuest(session.isGuest);
        if (session.profile) setProfile(session.profile);
        if (session.stats) setStats(session.stats);

        await Promise.all([
          loadDayData(activeDate),
          loadGeneralData()
        ]);

        unregisterSync = api.onSync(() => {
          loadDayData(activeDate);
          loadGeneralData();
        });
      } catch (err) {
        console.error('Failed to init session:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      if (unregisterSync) unregisterSync();
    };
  }, []);

  // When activeDate changes, reload that date's data
  useEffect(() => {
    if (userId) {
      loadDayData(activeDate);
    }
  }, [activeDate, userId, loadDayData]);

  // Actions
  const openAddFood = (meal: MealType = 'breakfast') => {
    setSelectedMealForAdd(meal);
    setIsAddFoodOpen(true);
  };

  const closeAddFood = () => {
    setIsAddFoodOpen(false);
    setSelectedMealForAdd(null);
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const addFoodItem = async (food: Omit<FoodItem, 'id' | 'userId' | 'createdAt'>): Promise<FoodItem> => {
    const item = await api.addFood(food);
    if (food.date === activeDate) {
      setDiaryItems(prev => {
        const next = [...prev, item];
        const totalKcal = next.reduce((acc, i) => acc + i.calories, 0);
        const burned = exercises.reduce((acc, e) => acc + e.caloriesBurned, 0);
        const target = macroTarget.calories + burned;
        if (Math.abs(totalKcal - target) <= 100) {
          triggerHaptic('success');
        } else {
          triggerHaptic('medium');
        }
        return next;
      });
    } else {
      triggerHaptic('medium');
    }
    setAllDiaryItems(prev => [...prev, item]);
    loadGeneralData();
    setOfflineQueueCount(api.getOfflineQueue().length);
    return item;
  };

  const updateFoodItem = async (id: string, updates: Partial<FoodItem>): Promise<void> => {
    setDiaryItems(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)));
    setAllDiaryItems(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)));
    await api.updateFood(id, updates);
  };

  const deleteFoodItem = async (id: string): Promise<void> => {
    const target = diaryItems.find(i => i.id === id);
    setDiaryItems(prev => prev.filter(i => i.id !== id));
    setAllDiaryItems(prev => prev.filter(i => i.id !== id));
    await api.deleteFood(id);
    if (target) {
      showUndoToast(`Deleted "${target.name}"`, async () => {
        const { id: _id, userId: _u, createdAt: _c, ...rest } = target;
        await addFoodItem(rest);
      });
    }
  };

  const logFoodAgainTomorrow = async (food: FoodItem): Promise<void> => {
    const d = new Date(food.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const tomorrowStr = d.toISOString().split('T')[0];
    const { id: _id, userId: _u, createdAt: _c, ...rest } = food;
    await addFoodItem({
      ...rest,
      date: tomorrowStr
    });
  };

  const updateWaterGlasses = async (glasses: number): Promise<void> => {
    triggerHaptic(glasses >= 8 ? 'success' : 'light');
    setWaterGlasses(glasses);
    await api.setWater(activeDate, glasses);
    loadGeneralData();
  };

  const addExerciseItem = async (exercise: Omit<ExerciseItem, 'id' | 'userId' | 'createdAt'>): Promise<ExerciseItem> => {
    triggerHaptic('medium');
    const item = await api.addExercise(exercise);
    setExercises(prev => [...prev, item]);
    setAllExercises(prev => [...prev, item]);
    loadGeneralData();
    return item;
  };

  const deleteExerciseItem = async (id: string): Promise<void> => {
    const target = exercises.find(e => e.id === id);
    setExercises(prev => prev.filter(e => e.id !== id));
    setAllExercises(prev => prev.filter(e => e.id !== id));
    await api.deleteExercise(id);
    if (target) {
      showUndoToast(`Deleted "${target.activityName}"`, async () => {
        const { id: _id, userId: _u, createdAt: _c, ...rest } = target;
        await addExerciseItem(rest);
      });
    }
  };

  const addWeightLog = async (weightKg: number, date: string = activeDate): Promise<void> => {
    triggerHaptic('light');
    const record = await api.addWeight(date, weightKg);
    setWeights(prev => {
      const idx = prev.findIndex(w => w.date === date);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = record;
        return copy;
      }
      return [...prev, record].sort((a, b) => a.date.localeCompare(b.date));
    });
    setProfile(prev => ({ ...prev, currentWeightKg: weightKg }));
    loadGeneralData();
  };

  const deleteWeightLog = async (id: string): Promise<void> => {
    const target = weights.find(w => w.id === id);
    setWeights(prev => prev.filter(w => w.id !== id));
    await api.deleteWeight(id);
    if (target) {
      showUndoToast(`Deleted weight entry (${target.weightKg}kg)`, async () => {
        await addWeightLog(target.weightKg, target.date);
      });
    }
  };

  const copyYesterdayMeals = async (mealType?: MealType): Promise<number> => {
    const res = await api.copyYesterday(activeDate, mealType);
    if (res.items && res.items.length > 0) {
      triggerHaptic('medium');
      setDiaryItems(prev => [...prev, ...res.items]);
      setAllDiaryItems(prev => [...prev, ...res.items]);
    }
    loadGeneralData();
    return res.count;
  };

  const updateUserProfile = async (updates: Partial<UserProfile>): Promise<void> => {
    const updated = await api.updateProfile(updates);
    setProfile(updated);
    loadGeneralData();
  };

  const saveTodayHabit = async (updates: Partial<DailyHabitLog>): Promise<void> => {
    const saved = await api.saveHabit(activeDate, updates);
    setTodayHabit(saved);
    setAllHabits(prev => {
      const idx = prev.findIndex(h => h.date === activeDate);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
  };

  const addCravingItem = async (entry: Omit<CravingLog, 'id' | 'userId' | 'createdAt'>): Promise<void> => {
    const item = await api.addCraving(entry);
    setCravings(prev => [item, ...prev]);
  };

  const deleteCravingItem = async (id: string): Promise<void> => {
    const target = cravings.find(c => c.id === id);
    setCravings(prev => prev.filter(c => c.id !== id));
    await api.deleteCraving(id);
    if (target) {
      showUndoToast(`Deleted craving "${target.wantedFood}"`, async () => {
        const { id: _id, userId: _u, createdAt: _c, ...rest } = target;
        await addCravingItem(rest);
      });
    }
  };

  const addVictoryItem = async (text: string, date: string = activeDate): Promise<void> => {
    const item = await api.addVictory(date, text);
    setVictories(prev => [item, ...prev]);
    triggerHaptic('success');
  };

  const deleteVictoryItem = async (id: string): Promise<void> => {
    const target = victories.find(v => v.id === id);
    setVictories(prev => prev.filter(v => v.id !== id));
    await api.deleteVictory(id);
    if (target) {
      showUndoToast(`Deleted non-scale victory`, async () => {
        await addVictoryItem(target.text, target.date);
      });
    }
  };

  const addPantryEntry = async (entry: Omit<PantryItem, 'id' | 'userId' | 'createdAt'>): Promise<void> => {
    const item = await api.addPantryItem(entry);
    setPantryItems(prev => [item, ...prev]);
  };

  const deletePantryEntry = async (id: string): Promise<void> => {
    const target = pantryItems.find(p => p.id === id);
    setPantryItems(prev => prev.filter(p => p.id !== id));
    await api.deletePantryItem(id);
    if (target) {
      showUndoToast(`Removed "${target.name}" from pantry`, async () => {
        const { id: _id, userId: _u, createdAt: _c, ...rest } = target;
        await addPantryEntry(rest);
      });
    }
  };

  const refreshDayData = async () => {
    await Promise.all([
      loadDayData(activeDate),
      loadGeneralData()
    ]);
  };

  const onAuthSuccess = async () => {
    const session = await api.initSession();
    setUserId(session.userId);
    setUserEmail(session.email);
    setIsGuest(session.isGuest);
    if (session.profile) setProfile(session.profile);
    if (session.stats) setStats(session.stats);
    await refreshDayData();
  };

  return (
    <AppContext.Provider
      value={{
        userId,
        userEmail,
        isGuest,
        activeDate,
        setActiveDate,
        diaryItems,
        allDiaryItems,
        waterGlasses,
        exercises,
        allExercises,
        weights,
        profile,
        stats,
        macroTarget,
        todayHabit,
        allHabits,
        cravings,
        victories,
        pantryItems,
        isOnline,
        offlineQueueCount,
        isLoading,
        isSyncing,
        selectedMealForAdd,
        isAddFoodOpen,
        openAddFood,
        closeAddFood,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        undoToast,
        triggerUndoableDelete,
        dismissUndoToast,
        addFoodItem,
        updateFoodItem,
        deleteFoodItem,
        logFoodAgainTomorrow,
        updateWaterGlasses,
        addExerciseItem,
        deleteExerciseItem,
        addWeightLog,
        deleteWeightLog,
        copyYesterdayMeals,
        updateUserProfile,
        saveTodayHabit,
        addCravingItem,
        deleteCravingItem,
        addVictoryItem,
        deleteVictoryItem,
        addPantryEntry,
        deletePantryEntry,
        refreshDayData,
        onAuthSuccess
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
