import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Search,
  Scan,
  Bookmark,
  Check,
  Sparkles,
  HelpCircle,
  RefreshCw,
  ShoppingBag,
  Mic,
  Camera,
  Utensils,
  Ruler
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../services/api.js';
import { BarcodeScannerModal } from './BarcodeScannerModal.js';
import { decipherFoodText, recalculateDecipheredFoodWithGrams } from '../utils/localAiEngine.js';
import type { MealType, SavedFood } from '../types/index.js';

interface AddFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMeal: MealType;
}

type ModeTab = 'smart' | 'manual' | 'recipe' | 'packaged' | 'ai';

interface IngredientRow {
  id: string;
  raw: string;
  name: string;
  amount: number;
  unit: string;
  calories: number;
  carbs: number;
  fat: number;
  protein: number;
  isVague: boolean;
  vaguePrompt?: string;
  vagueSuggestions?: string[];
  isParsed: boolean;
}

export const AddFoodModal: React.FC<AddFoodModalProps> = ({ isOpen, onClose, defaultMeal }) => {
  const {
    activeDate,
    addFoodItem,
    isGuest,
    openGuestLock,
    guestAiUsed,
    consumeGuestAiCall,
    isOnline
  } = useApp();
  const [mealType, setMealType] = useState<MealType>(defaultMeal);
  const [activeTab, setActiveTab] = useState<ModeTab>('smart');

  // Smart Food Decipherer State (In-Code AI)
  const [smartFoodText, setSmartFoodText] = useState('');
  const [gramOverrides, setGramOverrides] = useState<Record<number, number>>({});

  useEffect(() => {
    setGramOverrides({});
  }, [smartFoodText]);

  const baseDecipheredFood = useMemo(() => decipherFoodText(smartFoodText), [smartFoodText]);
  const decipheredFood = useMemo(
    () => recalculateDecipheredFoodWithGrams(baseDecipheredFood, gramOverrides),
    [baseDecipheredFood, gramOverrides]
  );

  const handleSaveSmartFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartFoodText.trim() || decipheredFood.items.length === 0 || decipheredFood.needsWeightConfirmation) return;

    if (isGuest) {
      const allowed = consumeGuestAiCall();
      if (!allowed) {
        return;
      }
    }

    await addFoodItem({
      date: activeDate,
      mealType,
      name: decipheredFood.mealSummaryName,
      calories: decipheredFood.totalCalories,
      carbs: decipheredFood.totalCarbs,
      fat: decipheredFood.totalFat,
      protein: decipheredFood.totalProtein,
      fiber: decipheredFood.totalFiber,
      sugar: decipheredFood.totalSugar,
      sodium: decipheredFood.totalSodiumMg,
      serving: `${Math.round(decipheredFood.items.reduce((s, i) => s + i.grams, 0) * 10) / 10}g total`,
      note: `Health Rating: ${decipheredFood.healthRating}/10`,
      source: 'manual'
    });

    setSmartFoodText('');
    setGramOverrides({});
    onClose();
  };

  // Manual Form State
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualFat, setManualFat] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [manualServing, setManualServing] = useState('1 serving');
  const [manualNote, setManualNote] = useState('');

  // Recipe Form State
  const [recipeName, setRecipeName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { id: '1', raw: '', name: '', amount: 0, unit: '', calories: 0, carbs: 0, fat: 0, protein: 0, isVague: false, isParsed: false }
  ]);
  const [isParsingRow, setIsParsingRow] = useState<string | null>(null);

  // Packaged Search State
  const [packagedQuery, setPackagedQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [packagedResults, setPackagedResults] = useState<any[]>([]);
  const [isSearchingPackaged, setIsSearchingPackaged] = useState(false);
  const [usdaStatusMsg, setUsdaStatusMsg] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Saved Foods State
  const [savedFoods, setSavedFoods] = useState<SavedFood[]>([]);
  const [savedFoodSearch, setSavedFoodSearch] = useState('');
  const [showSavedList, setShowSavedList] = useState(false);

  // Phase 4 AI Tools State (#3 Voice, #9 Plate Photo, #12 Restaurant Mode, #17 Portion Estimator)
  const [aiSubMode, setAiSubMode] = useState<'voice' | 'plate' | 'restaurant' | 'portion'>('voice');
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // #3 Voice Log
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [voiceResult, setVoiceResult] = useState<any | null>(null);

  // #9 Plate Photo
  const [platePreview, setPlatePreview] = useState<string | null>(null);
  const [plateResult, setPlateResult] = useState<any | null>(null);

  // #12 Restaurant Mode
  const [restaurantName, setRestaurantName] = useState('');
  const [restaurantDish, setRestaurantDish] = useState('');
  const [restaurantResult, setRestaurantResult] = useState<any | null>(null);

  // #17 Portion Estimator
  const [portionFood, setPortionFood] = useState('');
  const [portionDimensions, setPortionDimensions] = useState('');
  const [portionResult, setPortionResult] = useState<any | null>(null);

  useEffect(() => {
    setMealType(defaultMeal);
  }, [defaultMeal]);

  useEffect(() => {
    if (isOpen) {
      loadSavedFoods();
    }
  }, [isOpen]);

  const loadSavedFoods = async () => {
    try {
      const res = await api.getSavedFoods();
      setSavedFoods(res.foods || []);
    } catch {
      // ignore
    }
  };

  const handleRecipeNameChange = async (name: string) => {
    setRecipeName(name);
    if (name.trim().length >= 3) {
      try {
        const res = await api.searchRecipe(name.trim());
        if (res.recipe) {
          const loadedRows: IngredientRow[] = res.recipe.ingredients.map((ing, idx) => ({
            id: String(idx + 1),
            raw: ing.raw || `${ing.amount}${ing.unit} ${ing.name}`,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            calories: ing.calories,
            carbs: ing.carbs,
            fat: ing.fat,
            protein: ing.protein,
            isVague: false,
            isParsed: true
          }));
          setIngredients(loadedRows);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleIngredientBlur = async (id: string, text: string) => {
    if (!text.trim()) return;
    setIsParsingRow(id);
    try {
      const parsed = await api.parseRecipeLine(text);
      setIngredients(prev => prev.map(row => {
        if (row.id === id) {
          return {
            ...row,
            raw: text,
            name: parsed.name,
            amount: parsed.amount,
            unit: parsed.unit,
            calories: parsed.calories,
            carbs: parsed.carbs,
            fat: parsed.fat,
            protein: parsed.protein,
            isVague: Boolean(parsed.isVague),
            vaguePrompt: parsed.vaguePrompt,
            vagueSuggestions: parsed.vagueSuggestions,
            isParsed: true
          };
        }
        return row;
      }));
    } catch {
      // fallback
    } finally {
      setIsParsingRow(null);
    }
  };

  const handleSelectVagueSuggestion = (id: string, suggestion: string, row: IngredientRow) => {
    const newRaw = row.raw ? row.raw.replace(new RegExp(row.name, 'i'), suggestion) : `${row.amount || 100}g ${suggestion}`;
    handleIngredientBlur(id, newRaw);
  };

  const addIngredientRow = () => {
    setIngredients(prev => [
      ...prev,
      { id: String(Date.now()), raw: '', name: '', amount: 0, unit: '', calories: 0, carbs: 0, fat: 0, protein: 0, isVague: false, isParsed: false }
    ]);
  };

  const removeIngredientRow = (id: string) => {
    if (ingredients.length > 1) {
      setIngredients(prev => prev.filter(r => r.id !== id));
    }
  };

  const totalRecipeCalories = ingredients.reduce((sum, r) => sum + (r.calories || 0), 0);
  const totalRecipeCarbs = Math.round(ingredients.reduce((sum, r) => sum + (r.carbs || 0), 0) * 10) / 10;
  const totalRecipeFat = Math.round(ingredients.reduce((sum, r) => sum + (r.fat || 0), 0) * 10) / 10;
  const totalRecipeProtein = Math.round(ingredients.reduce((sum, r) => sum + (r.protein || 0), 0) * 10) / 10;
  const hasVagueIngredient = ingredients.some(r => r.isVague);

  const handlePackagedSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packagedQuery.trim()) return;

    setIsSearchingPackaged(true);
    setUsdaStatusMsg(null);
    try {
      const res = await api.searchUsda(packagedQuery, storeFilter);
      if (!res.available) {
        setUsdaStatusMsg(res.error || "Packaged food search is not available yet.");
        setPackagedResults([]);
      } else {
        setPackagedResults(res.foods || []);
        if (res.foods.length === 0) {
          setUsdaStatusMsg("No matching packaged foods found.");
        }
      }
    } catch (err: any) {
      setUsdaStatusMsg(err.message || "Failed to search USDA database.");
    } finally {
      setIsSearchingPackaged(false);
    }
  };

  const selectPackagedFood = (food: any) => {
    setManualName(food.brandName ? `${food.brandName} - ${food.description}` : food.description);
    setManualCalories(String(food.calories || 0));
    setManualCarbs(String(food.carbs || 0));
    setManualFat(String(food.fat || 0));
    setManualProtein(String(food.protein || 0));
    setManualServing(food.householdServingFullText || `${food.servingSize || 100} ${food.servingSizeUnit || 'g'}`);
    setActiveTab('manual');
  };

  const selectSavedFood = (food: SavedFood) => {
    setManualName(food.name);
    setManualCalories(String(food.calories));
    setManualCarbs(String(food.carbs));
    setManualFat(String(food.fat));
    setManualProtein(String(food.protein));
    setManualServing(food.serving || '1 portion');
    setShowSavedList(false);
  };

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualCalories) return;

    await addFoodItem({
      date: activeDate,
      mealType,
      name: manualName.trim(),
      calories: Math.round(Number(manualCalories)),
      carbs: Number(manualCarbs) || 0,
      fat: Number(manualFat) || 0,
      protein: Number(manualProtein) || 0,
      serving: manualServing || '1 serving',
      note: manualNote.trim() || undefined,
      source: 'manual'
    });

    onClose();
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeName.trim() || totalRecipeCalories === 0) return;

    await api.saveRecipe({
      name: recipeName.trim(),
      ingredients: ingredients.map(ing => ({
        raw: ing.raw,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        calories: ing.calories,
        carbs: ing.carbs,
        fat: ing.fat,
        protein: ing.protein
      })),
      totalCalories: totalRecipeCalories,
      totalCarbs: totalRecipeCarbs,
      totalFat: totalRecipeFat,
      totalProtein: totalRecipeProtein
    });

    await addFoodItem({
      date: activeDate,
      mealType,
      name: recipeName.trim(),
      calories: totalRecipeCalories,
      carbs: totalRecipeCarbs,
      fat: totalRecipeFat,
      protein: totalRecipeProtein,
      serving: '1 recipe portion',
      source: 'recipe'
    });

    onClose();
  };

  // #3 Voice Log Handlers
  const startSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setAiError('Voice dictation is not supported in this browser — type what you ate below.');
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      setIsListening(true);
      setAiError(null);
      recognition.onresult = (event: any) => {
        const text = event.results?.[0]?.[0]?.transcript || '';
        setVoiceTranscript(text);
        setIsListening(false);
      };
      recognition.onerror = () => {
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleParseVoice = async () => {
    if (!voiceTranscript.trim()) return;
    setIsAiBusy(true);
    setAiError(null);
    try {
      const res = await api.parseVoiceMeal(voiceTranscript.trim());
      setVoiceResult(res);
    } catch (e: any) {
      setAiError(e.message || 'Could not parse meal.');
    } finally {
      setIsAiBusy(false);
    }
  };

  // #9 Plate Photo Handler
  const handlePlatePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      setPlatePreview(dataUrl);
      setIsAiBusy(true);
      setAiError(null);
      try {
        const res = await api.analyzePlatePhoto(dataUrl, file.type);
        setPlateResult(res);
      } catch (err: any) {
        setAiError(err.message || 'Could not analyze plate photo.');
      } finally {
        setIsAiBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // #12 Restaurant Mode Handler
  const handleRestaurantEstimate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantName.trim() || !restaurantDish.trim()) return;
    setIsAiBusy(true);
    setAiError(null);
    try {
      const res = await api.estimateRestaurantDish(restaurantName.trim(), restaurantDish.trim());
      setRestaurantResult(res);
    } catch (err: any) {
      setAiError(err.message || 'Failed to estimate restaurant dish.');
    } finally {
      setIsAiBusy(false);
    }
  };

  // #17 Portion Estimator Handler
  const handlePortionEstimate = async (e: React.FormEvent, photoDataUrl?: string, mimeType?: string) => {
    e.preventDefault();
    if (!portionFood.trim()) return;
    setIsAiBusy(true);
    setAiError(null);
    try {
      const res = await api.estimatePortion({
        foodName: portionFood.trim(),
        dimensionsText: portionDimensions.trim() || undefined,
        base64Image: photoDataUrl,
        mimeType
      });
      setPortionResult(res);
    } catch (err: any) {
      setAiError(err.message || 'Failed to estimate portion.');
    } finally {
      setIsAiBusy(false);
    }
  };

  const handleConfirmAiMeal = async (payload: {
    name: string;
    calories: number;
    carbs: number;
    fat: number;
    protein: number;
    serving?: string;
    source: 'voice' | 'photo' | 'restaurant' | 'manual';
  }) => {
    await addFoodItem({
      date: activeDate,
      mealType,
      name: payload.name,
      calories: Math.round(payload.calories || 0),
      carbs: Math.round(payload.carbs || 0),
      fat: Math.round(payload.fat || 0),
      protein: Math.round(payload.protein || 0),
      serving: payload.serving || '1 portion',
      source: payload.source
    });
    onClose();
  };

  if (!isOpen) return null;

  const filteredSavedFoods = savedFoods.filter(f =>
    f.name.toLowerCase().includes(savedFoodSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">Add to</span>
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              aria-label="Select meal slot"
              className="bg-zinc-800 border border-zinc-700 text-teal-400 font-semibold text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-teal-500 capitalize"
            >
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snacks</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            {/* #15 Barcode quick log icon on the Add screen */}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 flex items-center gap-1.5 text-xs font-medium transition-colors"
              aria-label="Barcode quick log"
              title="Scan barcode"
            >
              <Scan className="w-4 h-4" />
              <span>Scan</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="px-4 pt-3 pb-2 flex items-center gap-1 border-b border-zinc-850">
          <button
            onClick={() => {
              if (isGuest && guestAiUsed) {
                openGuestLock();
                return;
              }
              setActiveTab('smart');
            }}
            aria-label="Smart AI tab"
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'smart'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Smart AI
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            aria-label="Manual entry tab"
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeTab === 'manual'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => {
              if (isGuest) {
                openGuestLock();
                return;
              }
              setActiveTab('recipe');
            }}
            aria-label="Recipe tab"
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'recipe'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Recipe
          </button>
          <button
            onClick={() => setActiveTab('packaged')}
            aria-label="Packaged food tab"
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'packaged'
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            Packaged
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!isOnline && (
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400">
              Offline — cloud AI features are paused. Manual entry and local deciphering work offline.
            </div>
          )}

          {/* Quick Saved Foods Drawer Toggle */}
          <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800 rounded-xl p-2.5">
            <div className="flex items-center gap-2 text-xs text-zinc-300">
              <Bookmark className="w-3.5 h-3.5 text-teal-400" />
              <span>Saved Foods ({isGuest ? 'Locked' : savedFoods.length})</span>
            </div>
            <button
              onClick={() => {
                if (isGuest) {
                  openGuestLock();
                  return;
                }
                setShowSavedList(!showSavedList);
              }}
              aria-label="Browse saved foods"
              className="text-[11px] font-medium text-teal-400 hover:underline"
            >
              {showSavedList ? 'Hide List' : 'Browse & Re-add'}
            </button>
          </div>

          {showSavedList && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={savedFoodSearch}
                  onChange={(e) => setSavedFoodSearch(e.target.value)}
                  placeholder="Search previously logged items..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {savedFoods.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 py-2 text-center">
                    Foods you log will appear here for one-tap re-adding.
                  </p>
                ) : filteredSavedFoods.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 py-2 text-center">No saved foods found.</p>
                ) : (
                  filteredSavedFoods.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => selectSavedFood(f)}
                      className="w-full text-left p-2 rounded-lg bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-xs flex items-center justify-between transition-colors"
                    >
                      <div className="truncate pr-2">
                        <span className="font-medium text-zinc-200 block truncate">{f.name}</span>
                        <span className="text-[10px] text-zinc-500">{f.serving}</span>
                      </div>
                      <span className="text-teal-400 font-semibold text-xs shrink-0">{f.calories} kcal</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 0: SMART FOOD DECIPHERER (IN-CODE AI) */}
          {activeTab === 'smart' && (
            <form onSubmit={handleSaveSmartFood} className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-zinc-300">
                    Type what you ate in your own words
                  </label>
                  <button
                    type="button"
                    onClick={() => setSmartFoodText('80g mangos, 10g yougurt, a pinch of salt')}
                    className="text-[11px] text-teal-400 hover:text-teal-300 underline cursor-pointer"
                  >
                    Try example
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={smartFoodText}
                  onChange={(e) => setSmartFoodText(e.target.value)}
                  placeholder="e.g., 80g mangos, 10g yogurt, a pinch of salt"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 resize-none leading-relaxed"
                />
              </div>

              {/* Deciphered Calories & Macros Box Below */}
              <div className="bg-zinc-950 border border-teal-500/30 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block">
                      Calculated Calories &amp; Macros
                    </span>
                    <span className="text-xs font-bold text-zinc-100">
                      {smartFoodText.trim() ? decipheredFood.mealSummaryName : 'Type ingredients above to decipher'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-extrabold text-teal-400 font-mono">
                      {decipheredFood.totalCalories}
                    </span>
                    <span className="text-xs text-zinc-400 font-mono ml-1">kcal</span>
                  </div>
                </div>

                {/* Macros Grid */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[10px] font-semibold text-blue-400 block">Carbs</span>
                    <span className="text-sm font-bold text-zinc-100 font-mono">{decipheredFood.totalCarbs}g</span>
                  </div>
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[10px] font-semibold text-amber-400 block">Fat</span>
                    <span className="text-sm font-bold text-zinc-100 font-mono">{decipheredFood.totalFat}g</span>
                  </div>
                  <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-2">
                    <span className="text-[10px] font-semibold text-red-400 block">Protein</span>
                    <span className="text-sm font-bold text-zinc-100 font-mono">{decipheredFood.totalProtein}g</span>
                  </div>
                </div>

                {/* Confirm Weights & Itemized Ingredient Breakdown */}
                {decipheredFood.items.length > 0 && (
                  <div className="pt-2.5 border-t border-zinc-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-teal-400">
                        Confirm weights
                      </span>
                      <span className="text-[10px] text-zinc-500">
                        Tap grams to adjust before saving
                      </span>
                    </div>

                    {decipheredFood.needsWeightConfirmation && (
                      <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-300 flex items-center gap-1.5">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Please confirm the gram weight for items marked 0g before saving.</span>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {decipheredFood.items.map((item, idx) => {
                        const currentGrams = Object.prototype.hasOwnProperty.call(gramOverrides, idx)
                          ? gramOverrides[idx]
                          : item.grams;
                        const isUnconfirmed = item.grams <= 0 || item.needsWeightConfirmation;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between gap-2 text-[11px] bg-zinc-900/60 px-2.5 py-2 rounded-lg border ${
                              isUnconfirmed ? 'border-amber-500/60 bg-amber-950/20' : 'border-zinc-800/60'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-zinc-200 font-medium block truncate">{item.name}</span>
                              <span className="text-zinc-500 font-mono text-[10px] block truncate">
                                {item.servingLabel} — {item.calories} kcal ({item.carbs}c · {item.fat}f · {item.protein}p)
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                aria-label={`Grams for ${item.name}`}
                                value={currentGrams === 0 && isUnconfirmed && !Object.prototype.hasOwnProperty.call(gramOverrides, idx) ? '' : currentGrams}
                                placeholder="0"
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  const numVal = rawVal === '' ? 0 : Math.max(0, parseFloat(rawVal) || 0);
                                  setGramOverrides((prev) => ({
                                    ...prev,
                                    [idx]: numVal
                                  }));
                                }}
                                className={`w-16 bg-zinc-950 border rounded-md px-2 py-1 text-right font-mono text-xs text-zinc-100 focus:outline-none ${
                                  isUnconfirmed
                                    ? 'border-amber-500/80 focus:border-amber-400'
                                    : 'border-zinc-700 focus:border-teal-500'
                                }`}
                              />
                              <span className="text-[11px] font-mono text-zinc-400">g</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Health Rating (1 to 10) + What to Add + What to Take Out */}
                {decipheredFood.items.length > 0 && (
                  <div className="pt-2.5 border-t border-zinc-800 space-y-2.5">
                    <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">
                          Health Rating (1–10)
                        </span>
                        <span
                          className={`text-sm font-extrabold font-mono px-2 py-0.5 rounded-md ${
                            decipheredFood.healthRating >= 7.5
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                              : decipheredFood.healthRating >= 5.5
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {decipheredFood.healthRating} / 10
                        </span>
                      </div>
                      <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            decipheredFood.healthRating >= 7.5
                              ? 'bg-teal-400'
                              : decipheredFood.healthRating >= 5.5
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                          }`}
                          style={{ width: `${Math.min(100, decipheredFood.healthRating * 10)}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-zinc-400 block">{decipheredFood.healthLabel}</span>
                    </div>

                    {/* What to Add */}
                    <div className="bg-teal-950/25 border border-teal-800/40 rounded-xl p-2.5 space-y-1">
                      <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wider block">
                        + What to Add
                      </span>
                      <ul className="space-y-1 text-[11px] text-zinc-200 leading-relaxed">
                        {decipheredFood.whatToAdd.map((tip, i) => (
                          <li key={i}>• {tip}</li>
                        ))}
                      </ul>
                    </div>

                    {/* What to Take Out */}
                    <div className="bg-amber-950/25 border border-amber-800/40 rounded-xl p-2.5 space-y-1">
                      <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
                        − What to Take Out / Reduce
                      </span>
                      <ul className="space-y-1 text-[11px] text-zinc-200 leading-relaxed">
                        {decipheredFood.whatToTakeOut.map((tip, i) => (
                          <li key={i}>• {tip}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!smartFoodText.trim() || decipheredFood.items.length === 0 || decipheredFood.needsWeightConfirmation}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
              >
                <Check className="w-4 h-4" />
                {decipheredFood.needsWeightConfirmation ? 'Confirm Item Weights Above to Save' : 'Save Food'}
              </button>
            </form>
          )}

          {/* TAB 1: MANUAL */}
          {activeTab === 'manual' && (
            <form onSubmit={handleSaveManual} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Food Name
                </label>
                <input
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. Scrambled Eggs & Avocado"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Calories (kcal)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualCalories}
                    onChange={(e) => setManualCalories(e.target.value)}
                    placeholder="350"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Serving / Size
                  </label>
                  <input
                    type="text"
                    value={manualServing}
                    onChange={(e) => setManualServing(e.target.value)}
                    placeholder="1 bowl"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-blue-400 mb-1">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={manualCarbs}
                    onChange={(e) => setManualCarbs(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-amber-400 mb-1">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={manualFat}
                    onChange={(e) => setManualFat(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-red-400 mb-1">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={manualProtein}
                    onChange={(e) => setManualProtein(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-red-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Optional Note
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="e.g. felt tired after this"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20 mt-2"
              >
                <Check className="w-4 h-4" />
                Log Food
              </button>
            </form>
          )}

          {/* TAB 2: RECIPE */}
          {activeTab === 'recipe' && (
            <form onSubmit={handleSaveRecipe} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Recipe Name
                </label>
                <input
                  type="text"
                  value={recipeName}
                  onChange={(e) => handleRecipeNameChange(e.target.value)}
                  placeholder="e.g. Tofu Veggie Stir Fry"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  Caloriq saves your recipes — typing this name in the future autofills ingredients.
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">
                    Ingredients (e.g. &apos;80g tofu&apos;, &apos;2 eggs&apos;, &apos;1 banana&apos;)
                  </label>
                  <button
                    type="button"
                    onClick={addIngredientRow}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </button>
                </div>

                {ingredients.map((row) => (
                  <div key={row.id} className="space-y-1.5 bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={row.raw}
                        onChange={(e) => {
                          const val = e.target.value;
                          setIngredients(prev => prev.map(r => r.id === row.id ? { ...r, raw: val } : r));
                        }}
                        onBlur={(e) => handleIngredientBlur(row.id, e.target.value)}
                        placeholder="e.g. 150g chicken breast or 2 eggs"
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />

                      {ingredients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(row.id)}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg transition-colors"
                          aria-label="Remove ingredient"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isParsingRow === row.id && (
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <RefreshCw className="w-3 h-3 animate-spin text-teal-400" />
                        <span>Parsing nutrition data...</span>
                      </div>
                    )}

                    {row.isVague && (
                      <div className="p-2 bg-amber-950/40 border border-amber-800/50 rounded-lg text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-300 font-medium text-[11px]">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{row.vaguePrompt || `Which ${row.name}?`}</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {row.vagueSuggestions?.map(s => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => handleSelectVagueSuggestion(row.id, s, row)}
                              className="px-2 py-0.5 rounded bg-amber-900/60 hover:bg-amber-800/80 text-amber-200 text-[10px] transition-colors border border-amber-700/60"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {row.isParsed && !row.isVague && row.calories > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                        <span className="capitalize text-zinc-300">{row.name} ({row.amount}{row.unit})</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-teal-400 font-semibold">{row.calories} kcal</span>
                          <span className="text-blue-400">{row.carbs}c</span>
                          <span className="text-amber-400">{row.fat}f</span>
                          <span className="text-red-400">{row.protein}p</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-400 block">Total Recipe Nutrition</span>
                  <div className="flex items-center gap-2 text-xs font-mono mt-0.5">
                    <span className="text-blue-400">{totalRecipeCarbs}g C</span>
                    <span className="text-amber-400">{totalRecipeFat}g F</span>
                    <span className="text-red-400">{totalRecipeProtein}g P</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-teal-400 font-mono">
                    {totalRecipeCalories}
                  </span>
                  <span className="text-[10px] text-zinc-500 block">kcal total</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={totalRecipeCalories === 0 || hasVagueIngredient}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
              >
                <Check className="w-4 h-4" />
                {hasVagueIngredient ? 'Specify Vague Ingredients Above' : 'Save & Log Recipe'}
              </button>
            </form>
          )}

          {/* TAB 3: PACKAGED */}
          {activeTab === 'packaged' && (
            <div className="space-y-4">
              <form onSubmit={handlePackagedSearch} className="space-y-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={packagedQuery}
                    onChange={(e) => setPackagedQuery(e.target.value)}
                    placeholder="Search brand or food (e.g. Chobani Greek Yogurt)..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-10 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="absolute right-2 top-2 p-1 text-zinc-400 hover:text-teal-400 transition-colors"
                    title="Scan Barcode"
                  >
                    <Scan className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={storeFilter}
                    onChange={(e) => setStoreFilter(e.target.value)}
                    placeholder="Store (optional, e.g. Trader Joe's, Costco)"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingPackaged || !packagedQuery.trim()}
                    className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs rounded-xl flex items-center gap-1 transition-colors"
                  >
                    {isSearchingPackaged ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </form>

              {usdaStatusMsg && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-400 text-center">
                  {usdaStatusMsg}
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {packagedResults.map((item, idx) => (
                  <button
                    key={item.fdcId || idx}
                    type="button"
                    onClick={() => selectPackagedFood(item)}
                    className="w-full text-left p-3 rounded-xl bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 transition-colors flex items-center justify-between group"
                  >
                    <div className="max-w-[75%]">
                      <span className="font-medium text-xs text-zinc-200 block truncate group-hover:text-teal-300">
                        {item.description}
                      </span>
                      <span className="text-[10px] text-zinc-500 block truncate">
                        {item.brandName || item.brandOwner || 'Brand item'} · {item.householdServingFullText || '1 serving'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-teal-400 block">
                        {item.calories}
                      </span>
                      <span className="text-[10px] text-zinc-500">kcal</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: AI & PHOTO TOOLS (#3 Voice, #9 Plate Photo, #12 Restaurant, #17 Portion Estimator) */}
          {activeTab === 'ai' && (
            <div className="space-y-3.5">
              {/* Sub-mode switcher */}
              <div className="grid grid-cols-4 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => setAiSubMode('voice')}
                  className={`py-1.5 rounded-lg text-[10px] font-medium flex flex-col items-center gap-0.5 ${
                    aiSubMode === 'voice' ? 'bg-teal-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                  Voice
                </button>
                <button
                  type="button"
                  onClick={() => setAiSubMode('plate')}
                  className={`py-1.5 rounded-lg text-[10px] font-medium flex flex-col items-center gap-0.5 ${
                    aiSubMode === 'plate' ? 'bg-teal-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5" />
                  Plate Photo
                </button>
                <button
                  type="button"
                  onClick={() => setAiSubMode('restaurant')}
                  className={`py-1.5 rounded-lg text-[10px] font-medium flex flex-col items-center gap-0.5 ${
                    aiSubMode === 'restaurant' ? 'bg-teal-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  Restaurant
                </button>
                <button
                  type="button"
                  onClick={() => setAiSubMode('portion')}
                  className={`py-1.5 rounded-lg text-[10px] font-medium flex flex-col items-center gap-0.5 ${
                    aiSubMode === 'portion' ? 'bg-teal-500 text-zinc-950 font-semibold' : 'text-zinc-400'
                  }`}
                >
                  <Ruler className="w-3.5 h-3.5" />
                  Portion
                </button>
              </div>

              {aiError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-xl text-xs text-rose-300">
                  {aiError}
                </div>
              )}

              {/* #3 VOICE LOG */}
              {aiSubMode === 'voice' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={startSpeechRecognition}
                      className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${
                        isListening
                          ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                          : 'bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500/25'
                      }`}
                    >
                      <Mic className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={voiceTranscript}
                      onChange={(e) => setVoiceTranscript(e.target.value)}
                      placeholder="Tap mic or type e.g. 'two eggs and sourdough toast'..."
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-100"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isAiBusy || !voiceTranscript.trim()}
                    onClick={handleParseVoice}
                    className="w-full py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    {isAiBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Parse Spoken Meal
                  </button>

                  {voiceResult && (
                    <div className="p-3 bg-zinc-950 border border-teal-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100">{voiceResult.mealName}</span>
                        <span className="text-sm font-bold text-teal-400 font-mono">{voiceResult.totalCalories} kcal</span>
                      </div>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        {voiceResult.totalCarbs}g C · {voiceResult.totalFat}g F · {voiceResult.totalProtein}g P
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfirmAiMeal({
                            name: voiceResult.mealName,
                            calories: voiceResult.totalCalories,
                            carbs: voiceResult.totalCarbs,
                            fat: voiceResult.totalFat,
                            protein: voiceResult.totalProtein,
                            source: 'voice'
                          })
                        }
                        className="w-full py-2 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirm &amp; Log Meal
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* #9 PLATE PHOTO */}
              {aiSubMode === 'plate' && (
                <div className="space-y-3">
                  <label className="w-full py-6 border border-dashed border-zinc-700 hover:border-teal-500/50 rounded-xl bg-zinc-950 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors">
                    <Camera className="w-6 h-6 text-teal-400" />
                    <span className="text-xs font-medium text-zinc-300">Snap or upload a photo of your plate</span>
                    <span className="text-[10px] text-zinc-500">AI estimates ingredients &amp; macros before saving</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handlePlatePhotoChange} className="hidden" />
                  </label>

                  {platePreview && (
                    <img src={platePreview} alt="Plate preview" className="w-full h-36 object-cover rounded-xl border border-zinc-800" />
                  )}

                  {isAiBusy && (
                    <div className="flex items-center justify-center gap-2 text-xs text-teal-400 py-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Estimating plate ingredients and calories...</span>
                    </div>
                  )}

                  {plateResult && (
                    <div className="p-3 bg-zinc-950 border border-teal-500/30 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100">{plateResult.mealName}</span>
                        <span className="text-sm font-bold text-teal-400 font-mono">{plateResult.totalCalories} kcal</span>
                      </div>
                      <div className="space-y-1">
                        {(plateResult.items || []).map((ing: any, i: number) => (
                          <div key={i} className="flex justify-between text-[11px] text-zinc-400">
                            <span>{ing.name} ({ing.portion})</span>
                            <span className="font-mono text-zinc-300">{ing.calories} kcal</span>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfirmAiMeal({
                            name: plateResult.mealName,
                            calories: plateResult.totalCalories,
                            carbs: plateResult.totalCarbs,
                            fat: plateResult.totalFat,
                            protein: plateResult.totalProtein,
                            source: 'photo'
                          })
                        }
                        className="w-full py-2 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Confirm &amp; Save Plate
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* #12 RESTAURANT MODE */}
              {aiSubMode === 'restaurant' && (
                <form onSubmit={handleRestaurantEstimate} className="space-y-3">
                  <input
                    type="text"
                    value={restaurantName}
                    onChange={(e) => setRestaurantName(e.target.value)}
                    placeholder="Restaurant name (e.g. Chipotle, Sweetgreen, Local Thai)"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                  />
                  <input
                    type="text"
                    value={restaurantDish}
                    onChange={(e) => setRestaurantDish(e.target.value)}
                    placeholder="Dish name (e.g. Chicken Burrito Bowl, Pad Thai)"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                  />
                  <button
                    type="submit"
                    disabled={isAiBusy}
                    className="w-full py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    {isAiBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Utensils className="w-3.5 h-3.5" />}
                    Estimate Typical Portion
                  </button>

                  {restaurantResult && (
                    <div className="p-3 bg-zinc-950 border border-teal-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100">{restaurantResult.name}</span>
                        <span className="text-sm font-bold text-teal-400 font-mono">{restaurantResult.calories} kcal</span>
                      </div>
                      <span className="text-[11px] text-zinc-400 block">{restaurantResult.serving}</span>
                      <div className="text-[11px] font-mono text-zinc-300">
                        {restaurantResult.carbs}g C · {restaurantResult.fat}g F · {restaurantResult.protein}g P
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfirmAiMeal({
                            name: restaurantResult.name,
                            calories: restaurantResult.calories,
                            carbs: restaurantResult.carbs,
                            fat: restaurantResult.fat,
                            protein: restaurantResult.protein,
                            serving: restaurantResult.serving,
                            source: 'restaurant'
                          })
                        }
                        className="w-full py-2 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Log Restaurant Dish
                      </button>
                    </div>
                  )}
                </form>
              )}

              {/* #17 PORTION ESTIMATOR */}
              {aiSubMode === 'portion' && (
                <form onSubmit={(e) => handlePortionEstimate(e)} className="space-y-3">
                  <input
                    type="text"
                    value={portionFood}
                    onChange={(e) => setPortionFood(e.target.value)}
                    placeholder="Food item (e.g. Grilled Salmon, Cooked White Rice)"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                  />
                  <input
                    type="text"
                    value={portionDimensions}
                    onChange={(e) => setPortionDimensions(e.target.value)}
                    placeholder="Visual size / dimensions (e.g. deck of cards, 10cm x 6cm x 2cm)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isAiBusy || !portionFood.trim()}
                      className="flex-1 py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs flex items-center justify-center gap-1"
                    >
                      {isAiBusy ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Ruler className="w-3.5 h-3.5" />}
                      Estimate Grams
                    </button>
                    <label className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-teal-400 rounded-xl text-xs font-medium cursor-pointer flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            handlePortionEstimate(
                              { preventDefault: () => {} } as React.FormEvent,
                              String(reader.result),
                              file.type
                            );
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {portionResult && (
                    <div className="p-3 bg-zinc-950 border border-teal-500/30 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-100">
                          {portionResult.foodName} (~{portionResult.estimatedGrams}g)
                        </span>
                        <span className="text-sm font-bold text-teal-400 font-mono">{portionResult.calories} kcal</span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{portionResult.explanation}</p>
                      <button
                        type="button"
                        onClick={() =>
                          handleConfirmAiMeal({
                            name: `${portionResult.foodName} (${portionResult.estimatedGrams}g)`,
                            calories: portionResult.calories,
                            carbs: portionResult.carbs,
                            fat: portionResult.fat,
                            protein: portionResult.protein,
                            serving: `${portionResult.estimatedGrams}g`,
                            source: 'manual'
                          })
                        }
                        className="w-full py-2 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Log Estimated Portion
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={async (query) => {
          setPackagedQuery(query);
          try {
            const res = await api.searchUsda(query, '');
            if (res.available && res.foods && res.foods.length > 0) {
              selectPackagedFood(res.foods[0]);
              return;
            }
          } catch {
            // fallback to manual serving drawer
          }
          const parsed = decipherFoodText(query);
          if (parsed.items.length > 0) {
            setManualName(parsed.mealSummaryName);
            setManualCalories(String(parsed.totalCalories));
            setManualCarbs(String(parsed.totalCarbs));
            setManualFat(String(parsed.totalFat));
            setManualProtein(String(parsed.totalProtein));
            setManualServing('1 scanned package');
          } else {
            setManualName(`Scanned Item (${query})`);
            setManualCalories('210');
            setManualCarbs('24');
            setManualFat('8');
            setManualProtein('10');
            setManualServing('1 package');
          }
          setActiveTab('manual');
        }}
      />
    </div>
  );
};
