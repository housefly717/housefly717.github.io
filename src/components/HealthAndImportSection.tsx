import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  Activity,
  HeartPulse,
  Pill,
  Coffee,
  Wine,
  Calendar,
  AlertTriangle,
  Check,
  Plus,
  Trash2,
  FileSpreadsheet,
  Sparkles,
  Tag
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import type { MealType } from '../types/index.js';

export interface BloodGlucoseEntry {
  id: string;
  date: string;
  time: string;
  valueMgDl: number;
  timing: 'fasting' | 'pre_meal' | 'post_1h' | 'post_2h' | 'bedtime';
  note?: string;
}

export interface BloodPressureEntry {
  id: string;
  date: string;
  time: string;
  systolic: number;
  diastolic: number;
  pulse: number;
  note?: string;
}

export interface MedicationReminderItem {
  id: string;
  name: string;
  dosage: string;
  time: string;
  mealTiming: 'with_food' | 'empty_stomach' | 'before_breakfast' | 'with_dinner' | 'bedtime';
  takenDates: string[];
}

export interface SupplementEntry {
  id: string;
  name: string;
  dose: string;
  timing: string;
  takenDates: string[];
}

export interface AlcoholEntry {
  id: string;
  date: string;
  drinkName: string;
  volumeMl: number;
  abvPercent: number;
  standardDrinks: number;
  calories: number;
}

export interface CaffeineEntry {
  id: string;
  date: string;
  time: string;
  drinkName: string;
  mg: number;
}

export interface CycleConfig {
  lastPeriodStart: string;
  cycleLengthDays: number;
  dailyNotes: Record<string, { flow: string; note: string }>;
}

export interface SymptomEntry {
  id: string;
  date: string;
  time: string;
  severity: number; // 1-5
  tags: string[];
  suspectedFood?: string;
  note?: string;
}

const STORAGE_KEYS = {
  glucose: 'caloriq_health_glucose_v1',
  bp: 'caloriq_health_bp_v1',
  meds: 'caloriq_health_meds_v1',
  supplements: 'caloriq_health_supplements_v1',
  alcohol: 'caloriq_health_alcohol_v1',
  caffeine: 'caloriq_health_caffeine_v1',
  cycle: 'caloriq_health_cycle_v1',
  symptoms: 'caloriq_health_symptoms_v1'
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

const SYMPTOM_TAGS = [
  'Bloating',
  'Fatigue',
  'Headache',
  'Brain Fog',
  'Reflux',
  'Cramping',
  'Nausea',
  'Joint Stiffness',
  'Steady Energy',
  'Light Digestion'
];

const SUPPLEMENT_PRESETS = [
  { name: 'Creatine Monohydrate', dose: '5g', timing: 'Post-workout / Morning' },
  { name: 'Vitamin D3 + K2', dose: '2000 IU', timing: 'With breakfast' },
  { name: 'Omega-3 Fish Oil', dose: '1000mg', timing: 'With meal' },
  { name: 'Magnesium Glycinate', dose: '400mg', timing: 'Before bed' },
  { name: 'Multivitamin', dose: '1 tablet', timing: 'With breakfast' },
  { name: 'Electrolytes', dose: '1 scoop', timing: 'During training' }
];

const CAFFEINE_PRESETS = [
  { name: 'Single Espresso', mg: 63 },
  { name: 'Double Espresso', mg: 125 },
  { name: 'Brewed Filter Coffee (240ml)', mg: 95 },
  { name: 'Cold Brew (350ml)', mg: 155 },
  { name: 'Matcha / Green Tea', mg: 35 },
  { name: 'Black Tea', mg: 47 },
  { name: 'Energy Drink (250ml)', mg: 80 },
  { name: 'Pre-Workout Scoop', mg: 200 }
];

const ALCOHOL_PRESETS = [
  { name: 'Light Beer (330ml)', volumeMl: 330, abvPercent: 4.2 },
  { name: 'Craft IPA / Pint (500ml)', volumeMl: 500, abvPercent: 6.0 },
  { name: 'Dry Red Wine (150ml)', volumeMl: 150, abvPercent: 13.5 },
  { name: 'Crisp White Wine (150ml)', volumeMl: 150, abvPercent: 12.0 },
  { name: 'Spirits — Vodka/Gin/Whisky (45ml)', volumeMl: 45, abvPercent: 40.0 },
  { name: 'Hard Seltzer (355ml)', volumeMl: 355, abvPercent: 5.0 }
];

const MEAL_TIMING_LABELS: Record<MedicationReminderItem['mealTiming'], string> = {
  with_food: 'Take with food',
  empty_stomach: 'Empty stomach (1 hr before food)',
  before_breakfast: '30 min before breakfast',
  with_dinner: 'Take with dinner',
  bedtime: 'At bedtime'
};

export const HealthAndImportSection: React.FC<{ mode?: 'diary' | 'me' }> = ({ mode = 'diary' }) => {
  const { activeDate, addFoodItem, addExerciseItem, addWeightLog, waterGlasses, updateWaterGlasses } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<
    'caffeine_alcohol' | 'meds_supps' | 'vitals' | 'cycle_symptoms' | 'imports'
  >(mode === 'me' ? 'imports' : 'caffeine_alcohol');

  // State stores
  const [glucoseList, setGlucoseList] = useState<BloodGlucoseEntry[]>(() =>
    loadJson(STORAGE_KEYS.glucose, [])
  );
  const [bpList, setBpList] = useState<BloodPressureEntry[]>(() =>
    loadJson(STORAGE_KEYS.bp, [])
  );
  const [medsList, setMedsList] = useState<MedicationReminderItem[]>(() =>
    loadJson(STORAGE_KEYS.meds, [])
  );
  const [supplementsList, setSupplementsList] = useState<SupplementEntry[]>(() =>
    loadJson(STORAGE_KEYS.supplements, SUPPLEMENT_PRESETS.slice(0, 3).map((s, i) => ({
      id: `supp_${i}`,
      name: s.name,
      dose: s.dose,
      timing: s.timing,
      takenDates: []
    })))
  );
  const [alcoholList, setAlcoholList] = useState<AlcoholEntry[]>(() =>
    loadJson(STORAGE_KEYS.alcohol, [])
  );
  const [caffeineList, setCaffeineList] = useState<CaffeineEntry[]>(() =>
    loadJson(STORAGE_KEYS.caffeine, [])
  );
  const [cycleConfig, setCycleConfig] = useState<CycleConfig>(() =>
    loadJson(STORAGE_KEYS.cycle, {
      lastPeriodStart: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
      cycleLengthDays: 28,
      dailyNotes: {}
    })
  );
  const [symptomsList, setSymptomsList] = useState<SymptomEntry[]>(() =>
    loadJson(STORAGE_KEYS.symptoms, [])
  );

  // Sync to localStorage
  useEffect(() => saveJson(STORAGE_KEYS.glucose, glucoseList), [glucoseList]);
  useEffect(() => saveJson(STORAGE_KEYS.bp, bpList), [bpList]);
  useEffect(() => saveJson(STORAGE_KEYS.meds, medsList), [medsList]);
  useEffect(() => saveJson(STORAGE_KEYS.supplements, supplementsList), [supplementsList]);
  useEffect(() => saveJson(STORAGE_KEYS.alcohol, alcoholList), [alcoholList]);
  useEffect(() => saveJson(STORAGE_KEYS.caffeine, caffeineList), [caffeineList]);
  useEffect(() => saveJson(STORAGE_KEYS.cycle, cycleConfig), [cycleConfig]);
  useEffect(() => saveJson(STORAGE_KEYS.symptoms, symptomsList), [symptomsList]);

  // Form inputs: Glucose
  const [glucoseVal, setGlucoseVal] = useState('');
  const [glucoseTiming, setGlucoseTiming] = useState<BloodGlucoseEntry['timing']>('fasting');

  // Form inputs: BP
  const [sysVal, setSysVal] = useState('');
  const [diaVal, setDiaVal] = useState('');
  const [pulseVal, setPulseVal] = useState('68');

  // Form inputs: Meds
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medTime, setMedTime] = useState('08:00');
  const [medMealTiming, setMedMealTiming] = useState<MedicationReminderItem['mealTiming']>('with_food');

  // Form inputs: Supplements
  const [suppName, setSuppName] = useState('');
  const [suppDose, setSuppDose] = useState('');
  const [suppTiming, setSuppTiming] = useState('With meal');

  // Form inputs: Alcohol
  const [alcName, setAlcName] = useState('');
  const [alcVol, setAlcVol] = useState('150');
  const [alcAbv, setAlcAbv] = useState('12.5');

  // Form inputs: Caffeine
  const [caffName, setCaffName] = useState('');
  const [caffMg, setCaffMg] = useState('95');
  const [caffTime, setCaffTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  // Form inputs: Symptoms
  const [selectedTags, setSelectedTags] = useState<string[]>(['Bloating']);
  const [symptomSeverity, setSymptomSeverity] = useState(2);
  const [symptomFood, setSymptomFood] = useState('');
  const [symptomNote, setSymptomNote] = useState('');

  // Form inputs: Cycle
  const [cycleFlow, setCycleFlow] = useState(cycleConfig.dailyNotes[activeDate]?.flow || 'None');
  const [cycleNote, setCycleNote] = useState(cycleConfig.dailyNotes[activeDate]?.note || '');

  useEffect(() => {
    setCycleFlow(cycleConfig.dailyNotes[activeDate]?.flow || 'None');
    setCycleNote(cycleConfig.dailyNotes[activeDate]?.note || '');
  }, [activeDate, cycleConfig.dailyNotes]);

  // Import status state
  const [importSource, setImportSource] = useState<
    'myfitnesspal' | 'fitbit' | 'garmin' | 'strava' | 'apple_health' | 'google_fit'
  >('myfitnesspal');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Filtered daily lists
  const todayAlcohol = useMemo(
    () => alcoholList.filter((a) => a.date === activeDate),
    [alcoholList, activeDate]
  );
  const todayAlcoholKcal = todayAlcohol.reduce((s, a) => s + a.calories, 0);
  const todayStandardDrinks = Math.round(todayAlcohol.reduce((s, a) => s + a.standardDrinks, 0) * 10) / 10;

  const todayCaffeine = useMemo(
    () => caffeineList.filter((c) => c.date === activeDate),
    [caffeineList, activeDate]
  );
  const todayCaffeineMg = todayCaffeine.reduce((s, c) => s + c.mg, 0);
  const hasLateCaffeine = todayCaffeine.some((c) => {
    const hour = parseInt(c.time.split(':')[0] || '0', 10);
    return hour >= 14;
  });

  // Cycle Phase calculation
  const cyclePhaseInfo = useMemo(() => {
    const start = new Date(cycleConfig.lastPeriodStart + 'T00:00:00');
    const curr = new Date(activeDate + 'T00:00:00');
    const diffDays = Math.floor((curr.getTime() - start.getTime()) / 86400000);
    const len = Math.max(21, Math.min(40, cycleConfig.cycleLengthDays || 28));
    const dayInCycle = (((diffDays % len) + len) % len) + 1;

    if (dayInCycle <= 5) {
      return {
        dayInCycle,
        phase: 'Menstrual Phase (Days 1–5)',
        note: 'Focus on iron-rich foods (spinach, lean red meat, lentils) paired with Vitamin C, warm hydration, and restorative movement.'
      };
    }
    if (dayInCycle <= 13) {
      return {
        dayInCycle,
        phase: 'Follicular Phase (Days 6–13)',
        note: 'Insulin sensitivity and recovery are typically at their peak. Great window for progressive strength training and complex carbs.'
      };
    }
    if (dayInCycle <= 16) {
      return {
        dayInCycle,
        phase: 'Ovulatory Phase (Days 14–16)',
        note: 'High energy window. Prioritize hydration, electrolytes, and high-fiber cruciferous vegetables.'
      };
    }
    return {
      dayInCycle,
      phase: 'Luteal Phase (Days 17–' + len + ')',
      note: 'Resting metabolic rate naturally rises by ~100–200 kcal/day. Complex carbs, magnesium, and protein help curb afternoon cravings.'
    };
  }, [cycleConfig.lastPeriodStart, cycleConfig.cycleLengthDays, activeDate]);

  // Handlers
  const handleAddGlucose = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(glucoseVal);
    if (isNaN(val) || val < 30 || val > 600) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setGlucoseList((prev) => [
      ...prev,
      {
        id: `gl_${Date.now()}`,
        date: activeDate,
        time,
        valueMgDl: Math.round(val),
        timing: glucoseTiming
      }
    ]);
    setGlucoseVal('');
  };

  const handleAddBp = (e: React.FormEvent) => {
    e.preventDefault();
    const sys = parseInt(sysVal, 10);
    const dia = parseInt(diaVal, 10);
    const pulse = parseInt(pulseVal, 10) || 70;
    if (isNaN(sys) || isNaN(dia) || sys < 60 || sys > 250 || dia < 40 || dia > 160) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setBpList((prev) => [
      ...prev,
      {
        id: `bp_${Date.now()}`,
        date: activeDate,
        time,
        systolic: sys,
        diastolic: dia,
        pulse
      }
    ]);
    setSysVal('');
    setDiaVal('');
  };

  const handleAddMed = (e: React.FormEvent) => {
    e.preventDefault();
    if (!medName.trim()) return;
    setMedsList((prev) => [
      ...prev,
      {
        id: `med_${Date.now()}`,
        name: medName.trim(),
        dosage: medDose.trim() || '1 dose',
        time: medTime,
        mealTiming: medMealTiming,
        takenDates: []
      }
    ]);
    setMedName('');
    setMedDose('');
  };

  const toggleMedTaken = (id: string) => {
    setMedsList((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const taken = m.takenDates.includes(activeDate)
          ? m.takenDates.filter((d) => d !== activeDate)
          : [...m.takenDates, activeDate];
        return { ...m, takenDates: taken };
      })
    );
  };

  const handleAddSupplement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!suppName.trim()) return;
    setSupplementsList((prev) => [
      ...prev,
      {
        id: `supp_${Date.now()}`,
        name: suppName.trim(),
        dose: suppDose.trim() || '1 serving',
        timing: suppTiming,
        takenDates: [activeDate]
      }
    ]);
    setSuppName('');
    setSuppDose('');
  };

  const toggleSuppTaken = (id: string) => {
    setSupplementsList((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const taken = s.takenDates.includes(activeDate)
          ? s.takenDates.filter((d) => d !== activeDate)
          : [...s.takenDates, activeDate];
        return { ...s, takenDates: taken };
      })
    );
  };

  const logAlcoholDrink = (name: string, volumeMl: number, abvPercent: number) => {
    const pureAlcoholGrams = volumeMl * (abvPercent / 100) * 0.789;
    const calories = Math.round(pureAlcoholGrams * 7 + volumeMl * 0.12);
    const standardDrinks = Math.round((pureAlcoholGrams / 14) * 10) / 10;
    setAlcoholList((prev) => [
      ...prev,
      {
        id: `alc_${Date.now()}`,
        date: activeDate,
        drinkName: name,
        volumeMl,
        abvPercent,
        standardDrinks,
        calories
      }
    ]);
  };

  const logCaffeineDrink = (name: string, mg: number, timeStr?: string) => {
    const now = new Date();
    const t =
      timeStr ||
      caffTime ||
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setCaffeineList((prev) => [
      ...prev,
      {
        id: `caff_${Date.now()}`,
        date: activeDate,
        time: t,
        drinkName: name,
        mg
      }
    ]);
  };

  const handleSaveCycleDay = () => {
    setCycleConfig((prev) => ({
      ...prev,
      dailyNotes: {
        ...prev.dailyNotes,
        [activeDate]: { flow: cycleFlow, note: cycleNote.trim() }
      }
    }));
  };

  const handleAddSymptom = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTags.length === 0) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setSymptomsList((prev) => [
      {
        id: `sym_${Date.now()}`,
        date: activeDate,
        time,
        severity: symptomSeverity,
        tags: selectedTags,
        suspectedFood: symptomFood.trim() || undefined,
        note: symptomNote.trim() || undefined
      },
      ...prev
    ]);
    setSymptomFood('');
    setSymptomNote('');
  };

  // CSV Parser for MyFitnessPal, Fitbit, Garmin, Strava, Apple Health, Google Fit
  const parseCsvRows = (csvText: string): string[][] => {
    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.map((line) => {
      const cols: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          cols.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());
      return cols;
    });
  };

  const processImportText = async (csvText: string, source: typeof importSource) => {
    setIsImporting(true);
    setImportStatus(null);
    try {
      const rows = parseCsvRows(csvText);
      if (rows.length < 2) {
        setImportStatus('CSV file is empty or missing data rows.');
        return;
      }
      const headers = rows[0].map((h) => h.toLowerCase());
      let mealsImported = 0;
      let workoutsImported = 0;
      let weightsImported = 0;

      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        if (row.length < 2) continue;
        const record: Record<string, string> = {};
        headers.forEach((h, idx) => {
          record[h] = row[idx] || '';
        });

        const rawDate =
          record['date'] ||
          record['start time'] ||
          record['activity date'] ||
          record[' timestamp'] ||
          activeDate;
        const parsedDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
          ? rawDate.slice(0, 10)
          : activeDate;

        // Check if MyFitnessPal or food row
        if (
          source === 'myfitnesspal' ||
          record['meal'] !== undefined ||
          record['food name'] !== undefined ||
          record['carbohydrates (g)'] !== undefined
        ) {
          const mealRaw = (record['meal'] || 'breakfast').toLowerCase();
          const mealType: MealType = mealRaw.includes('lunch')
            ? 'lunch'
            : mealRaw.includes('dinner')
              ? 'dinner'
              : mealRaw.includes('snack')
                ? 'snack'
                : 'breakfast';
          const foodName =
            record['food name'] ||
            record['name'] ||
            record['item'] ||
            record['description'] ||
            `Imported ${source} meal`;
          const calories = Math.round(Number(record['calories'] || record['energy (kcal)'] || 0));
          const carbs = Math.round(Number(record['carbohydrates (g)'] || record['carbs'] || 0));
          const fat = Math.round(Number(record['fat (g)'] || record['fat'] || 0));
          const protein = Math.round(Number(record['protein (g)'] || record['protein'] || 0));
          if (calories > 0) {
            await addFoodItem({
              date: parsedDate,
              mealType,
              name: foodName,
              calories,
              carbs,
              fat,
              protein,
              serving: record['serving'] || '1 imported serving',
              source: 'manual'
            });
            mealsImported++;
          }
          continue;
        }

        // Check if weight row
        const weightVal = Number(record['weight'] || record['weight (kg)'] || record['body mass (kg)'] || 0);
        if (weightVal >= 25 && weightVal <= 350) {
          await addWeightLog(weightVal, parsedDate);
          weightsImported++;
        }

        // Check if activity/workout row (Fitbit, Garmin, Strava, Apple Health, Google Fit)
        const actName =
          record['activity'] ||
          record['activity type'] ||
          record['type'] ||
          record['sport'] ||
          record['workout'] ||
          `${source.replace('_', ' ')} workout`;
        const durationMin = Math.max(
          5,
          Math.round(
            Number(
              record['minutes'] ||
                record['duration'] ||
                record['duration (min)'] ||
                record['moving time'] ||
                30
            )
          )
        );
        const burnedKcal = Math.round(
          Number(
            record['calories'] ||
              record['calories burned'] ||
              record['active calories'] ||
              record['kcal'] ||
              durationMin * 7
          )
        );
        if (burnedKcal > 0) {
          try {
            await addExerciseItem({
              date: parsedDate,
              activityName: actName,
              minutes: durationMin,
              met: 6,
              caloriesBurned: burnedKcal,
              intensity: 'Moderate'
            });
            workoutsImported++;
          } catch {
            // If in guest mode, skip locked exercise write gracefully
          }
        }
      }

      setImportStatus(
        `Imported ${mealsImported} meal(s), ${workoutsImported} workout(s), and ${weightsImported} weigh-in(s) from ${source.replace('_', ' ').toUpperCase()}.`
      );
    } catch (err: any) {
      setImportStatus(err?.message || 'Failed to parse CSV import.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await processImportText(text, importSource);
    e.target.value = '';
  };

  const handleLoadSampleImport = async () => {
    if (importSource === 'myfitnesspal') {
      const sampleMfp = [
        'Date,Meal,Food Name,Calories,Carbohydrates (g),Fat (g),Protein (g)',
        `${activeDate},Breakfast,Greek Yogurt & Berries (MFP Import),245,22,4,28`,
        `${activeDate},Lunch,Grilled Chicken Quinoa Bowl (MFP Import),510,48,14,44`
      ].join('\n');
      await processImportText(sampleMfp, 'myfitnesspal');
    } else {
      const label = importSource.replace('_', ' ').toUpperCase();
      const sampleFitness = [
        'Date,Activity Type,Duration (min),Calories Burned,Weight (kg)',
        `${activeDate},${label} Tempo Run,35,340,71.4`
      ].join('\n');
      await processImportText(sampleFitness, importSource);
    }
  };

  const getBpCategory = (sys: number, dia: number): { label: string; color: string } => {
    if (sys >= 140 || dia >= 90) return { label: 'Stage 2 High', color: 'text-rose-400' };
    if (sys >= 130 || dia >= 80) return { label: 'Stage 1 Elevated', color: 'text-amber-300' };
    if (sys >= 120 && dia < 80) return { label: 'Elevated', color: 'text-amber-200' };
    return { label: 'Normal', color: 'text-teal-400' };
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-teal-400" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-100">
              Health Biometrics, Caffeine, Meds &amp; Data Imports
            </h3>
            <span className="text-[10px] text-zinc-400 block">
              Separate alcohol &amp; caffeine logs, vitals trends, cycle phases, symptoms &amp; CSV sync
            </span>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-1.5 bg-zinc-950 p-1.5 rounded-xl border border-zinc-800">
        {[
          { id: 'caffeine_alcohol', label: 'Caffeine & Alcohol' },
          { id: 'meds_supps', label: 'Meds & Supplements' },
          { id: 'vitals', label: 'Glucose & BP' },
          { id: 'cycle_symptoms', label: 'Cycle & Symptoms' },
          { id: 'imports', label: 'CSV / App Import' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              activeSubTab === tab.id
                ? 'bg-teal-500 text-zinc-950 font-semibold'
                : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. CAFFEINE & ALCOHOL TAB */}
      {activeSubTab === 'caffeine_alcohol' && (
        <div className="space-y-4">
          {/* Caffeine section */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coffee className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-zinc-100">Caffeine Tracker</span>
              </div>
              <span
                className={`text-xs font-mono font-bold ${
                  todayCaffeineMg > 400 ? 'text-rose-400' : 'text-amber-300'
                }`}
              >
                {todayCaffeineMg} / 400 mg safe limit
              </span>
            </div>

            {/* Cut-off warning when logged after 14:00 (2:00 PM) */}
            {(hasLateCaffeine || parseInt(caffTime.split(':')[0] || '0', 10) >= 14) && (
              <div className="p-2.5 bg-amber-950/60 border border-amber-500/40 rounded-xl flex items-start gap-2 text-[11px] text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Caffeine cut-off warning: Caffeine logged after 14:00 (2:00 PM) has a 5 to 6 hour half-life and can reduce deep sleep quality tonight.
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              {CAFFEINE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => logCaffeineDrink(preset.name, preset.mg)}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 transition-colors"
                >
                  + {preset.name} ({preset.mg}mg)
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <input
                type="text"
                value={caffName}
                onChange={(e) => setCaffName(e.target.value)}
                placeholder="Custom drink"
                aria-label="Custom caffeine drink name"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="number"
                value={caffMg}
                onChange={(e) => setCaffMg(e.target.value)}
                placeholder="mg"
                aria-label="Caffeine milligrams"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
              />
              <div className="flex gap-1">
                <input
                  type="time"
                  value={caffTime}
                  onChange={(e) => setCaffTime(e.target.value)}
                  aria-label="Caffeine time"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    const mg = Math.max(5, parseInt(caffMg, 10) || 80);
                    logCaffeineDrink(caffName.trim() || 'Coffee', mg, caffTime);
                    setCaffName('');
                  }}
                  aria-label="Add custom caffeine entry"
                  className="px-2.5 py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
                >
                  Add
                </button>
              </div>
            </div>

            {todayCaffeine.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-zinc-800/80">
                {todayCaffeine.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-xs text-zinc-300">
                    <span>
                      {c.drinkName} <span className="text-zinc-400 font-mono">({c.time})</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-300">{c.mg} mg</span>
                      <button
                        type="button"
                        onClick={() => setCaffeineList((prev) => prev.filter((x) => x.id !== c.id))}
                        aria-label={`Remove ${c.drinkName}`}
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alcohol section (separate from food) */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wine className="w-4 h-4 text-rose-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  Alcohol Log (Tracked Separately from Food)
                </span>
              </div>
              <span className="text-xs font-mono text-rose-300 font-bold">
                {todayStandardDrinks} std drinks · {todayAlcoholKcal} kcal
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {ALCOHOL_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => logAlcoholDrink(preset.name, preset.volumeMl, preset.abvPercent)}
                  className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 transition-colors"
                >
                  + {preset.name} ({preset.abvPercent}%)
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <input
                type="text"
                value={alcName}
                onChange={(e) => setAlcName(e.target.value)}
                placeholder="Drink name"
                aria-label="Alcohol drink name"
                className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="number"
                value={alcVol}
                onChange={(e) => setAlcVol(e.target.value)}
                placeholder="ml"
                aria-label="Drink volume in ml"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
              />
              <div className="flex gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={alcAbv}
                  onChange={(e) => setAlcAbv(e.target.value)}
                  placeholder="ABV%"
                  aria-label="Alcohol by volume percentage"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    logAlcoholDrink(
                      alcName.trim() || 'Beverage',
                      Math.max(15, Number(alcVol) || 150),
                      Math.max(0.5, Number(alcAbv) || 12)
                    );
                    setAlcName('');
                  }}
                  aria-label="Log custom alcohol drink"
                  className="px-2.5 py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
                >
                  Add
                </button>
              </div>
            </div>

            {todayAlcohol.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
                {todayAlcohol.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs text-zinc-300">
                    <span>
                      {a.drinkName} ({a.volumeMl}ml · {a.abvPercent}% ABV)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-rose-300">
                        {a.standardDrinks} std · {a.calories} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => setAlcoholList((prev) => prev.filter((x) => x.id !== a.id))}
                        aria-label={`Remove ${a.drinkName}`}
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => updateWaterGlasses(waterGlasses + 1)}
                  className="w-full mt-1 py-1.5 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-500/30 rounded-lg text-[11px] text-cyan-300 font-medium"
                >
                  Hydration offset: Log +1 glass of water for alcohol recovery
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. MEDICATIONS & SUPPLEMENTS TAB */}
      {activeSubTab === 'meds_supps' && (
        <div className="space-y-4">
          {/* Medication Reminders with Meal Timing */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-semibold text-zinc-100">
                Medication Reminders &amp; Meal Timing
              </span>
            </div>

            <form onSubmit={handleAddMed} className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
                placeholder="Medication name"
                aria-label="Medication name"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="text"
                value={medDose}
                onChange={(e) => setMedDose(e.target.value)}
                placeholder="Dosage (e.g. 50mg)"
                aria-label="Medication dosage"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <select
                value={medMealTiming}
                onChange={(e) => setMedMealTiming(e.target.value as any)}
                aria-label="Medication meal timing"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
              >
                <option value="with_food">Take with food</option>
                <option value="empty_stomach">Empty stomach (1 hr before meal)</option>
                <option value="before_breakfast">30 min before breakfast</option>
                <option value="with_dinner">Take with dinner</option>
                <option value="bedtime">At bedtime</option>
              </select>
              <div className="flex gap-1.5">
                <input
                  type="time"
                  value={medTime}
                  onChange={(e) => setMedTime(e.target.value)}
                  aria-label="Medication reminder time"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
                >
                  Add
                </button>
              </div>
            </form>

            {medsList.length === 0 ? (
              <p className="text-[11px] text-zinc-400">
                No medications scheduled yet. Add one above with its meal-timing rule.
              </p>
            ) : (
              <div className="space-y-1.5">
                {medsList.map((m) => {
                  const taken = m.takenDates.includes(activeDate);
                  return (
                    <div
                      key={m.id}
                      className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div>
                        <span className="text-xs font-semibold text-zinc-100 block">
                          {m.name} ({m.dosage})
                        </span>
                        <span className="text-[10px] font-mono text-teal-300">
                          {m.time} · {MEAL_TIMING_LABELS[m.mealTiming]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleMedTaken(m.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                            taken
                              ? 'bg-teal-500 text-zinc-950'
                              : 'bg-zinc-950 border border-zinc-700 text-zinc-300'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {taken ? 'Taken' : 'Mark taken'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMedsList((prev) => prev.filter((x) => x.id !== m.id))}
                          aria-label={`Remove medication ${m.name}`}
                          className="text-zinc-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Supplement Log */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <span className="text-xs font-semibold text-zinc-100 block">Daily Supplement Log</span>

            <div className="space-y-1.5">
              {supplementsList.map((s) => {
                const taken = s.takenDates.includes(activeDate);
                return (
                  <div
                    key={s.id}
                    className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-zinc-200">{s.name}</span>{' '}
                      <span className="text-zinc-400 font-mono">({s.dose})</span>
                      <span className="block text-[10px] text-zinc-400">{s.timing}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSuppTaken(s.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                          taken
                            ? 'bg-teal-500 text-zinc-950'
                            : 'bg-zinc-950 border border-zinc-700 text-zinc-300'
                        }`}
                      >
                        {taken ? 'Logged Today' : 'Take'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSupplementsList((prev) => prev.filter((x) => x.id !== s.id))}
                        aria-label={`Delete supplement ${s.name}`}
                        className="text-zinc-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleAddSupplement} className="grid grid-cols-3 gap-2 pt-1">
              <input
                type="text"
                value={suppName}
                onChange={(e) => setSuppName(e.target.value)}
                placeholder="Supplement (e.g. Zinc)"
                aria-label="Supplement name"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <input
                type="text"
                value={suppDose}
                onChange={(e) => setSuppDose(e.target.value)}
                placeholder="Dose (e.g. 15mg)"
                aria-label="Supplement dose"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <div className="flex gap-1">
                <input
                  type="text"
                  value={suppTiming}
                  onChange={(e) => setSuppTiming(e.target.value)}
                  placeholder="With meal"
                  aria-label="Supplement timing"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100"
                />
                <button
                  type="submit"
                  aria-label="Add supplement"
                  className="px-2.5 py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. BLOOD GLUCOSE & BLOOD PRESSURE TAB */}
      {activeSubTab === 'vitals' && (
        <div className="space-y-4">
          {/* Blood Glucose Log with Trend */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">Blood Glucose Log &amp; Trend</span>
              <span className="text-[10px] font-mono text-zinc-400">Target fasting: 70–99 mg/dL</span>
            </div>

            <form onSubmit={handleAddGlucose} className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={30}
                max={600}
                value={glucoseVal}
                onChange={(e) => setGlucoseVal(e.target.value)}
                placeholder="mg/dL (e.g. 92)"
                aria-label="Blood glucose in mg/dL"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
              />
              <select
                value={glucoseTiming}
                onChange={(e) => setGlucoseTiming(e.target.value as any)}
                aria-label="Glucose measurement timing"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="fasting">Fasting</option>
                <option value="pre_meal">Before Meal</option>
                <option value="post_1h">1h Post-Meal</option>
                <option value="post_2h">2h Post-Meal</option>
                <option value="bedtime">Bedtime</option>
              </select>
              <button
                type="submit"
                className="py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs"
              >
                Log Glucose
              </button>
            </form>

            {glucoseList.length > 1 && (
              <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
                {(() => {
                  const recent = glucoseList.slice(-10);
                  const minG = Math.min(...recent.map((g) => g.valueMgDl), 65);
                  const maxG = Math.max(...recent.map((g) => g.valueMgDl), 150);
                  const range = maxG - minG || 1;
                  const pts = recent
                    .map((g, idx) => {
                      const x = (idx / (recent.length - 1)) * 260 + 20;
                      const y = 70 - ((g.valueMgDl - minG) / range) * 55;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  return (
                    <svg className="w-full h-20" viewBox="0 0 300 80" role="img" aria-label="Blood glucose trend line">
                      <polyline fill="none" stroke="#14b8a6" strokeWidth="2.5" points={pts} />
                    </svg>
                  );
                })()}
              </div>
            )}

            {glucoseList.slice(-4).reverse().map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs text-zinc-300">
                <span>
                  {g.date} · {g.time} <span className="text-zinc-400 capitalize">({g.timing.replace('_', ' ')})</span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    g.valueMgDl > 140 ? 'text-amber-300' : 'text-teal-400'
                  }`}
                >
                  {g.valueMgDl} mg/dL
                </span>
              </div>
            ))}
          </div>

          {/* Blood Pressure Log with Trend */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-100">Blood Pressure Log &amp; Trend</span>
              <span className="text-[10px] font-mono text-zinc-400">Systolic / Diastolic (mmHg)</span>
            </div>

            <form onSubmit={handleAddBp} className="grid grid-cols-4 gap-2">
              <input
                type="number"
                value={sysVal}
                onChange={(e) => setSysVal(e.target.value)}
                placeholder="Sys (120)"
                aria-label="Systolic mmHg"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
              />
              <input
                type="number"
                value={diaVal}
                onChange={(e) => setDiaVal(e.target.value)}
                placeholder="Dia (80)"
                aria-label="Diastolic mmHg"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
              />
              <input
                type="number"
                value={pulseVal}
                onChange={(e) => setPulseVal(e.target.value)}
                placeholder="Pulse"
                aria-label="Heart rate pulse bpm"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100"
              />
              <button
                type="submit"
                className="py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs"
              >
                Log BP
              </button>
            </form>

            {bpList.length > 1 && (
              <div className="bg-zinc-900 p-2.5 rounded-xl border border-zinc-800">
                {(() => {
                  const recent = bpList.slice(-10);
                  const minB = Math.min(...recent.map((b) => b.diastolic), 55);
                  const maxB = Math.max(...recent.map((b) => b.systolic), 145);
                  const range = maxB - minB || 1;
                  const sysPts = recent
                    .map((b, idx) => {
                      const x = (idx / (recent.length - 1)) * 260 + 20;
                      const y = 70 - ((b.systolic - minB) / range) * 55;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  const diaPts = recent
                    .map((b, idx) => {
                      const x = (idx / (recent.length - 1)) * 260 + 20;
                      const y = 70 - ((b.diastolic - minB) / range) * 55;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  return (
                    <svg className="w-full h-20" viewBox="0 0 300 80" role="img" aria-label="Blood pressure systolic and diastolic trend line">
                      <polyline fill="none" stroke="#14b8a6" strokeWidth="2.5" points={sysPts} />
                      <polyline fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 2" points={diaPts} />
                    </svg>
                  );
                })()}
              </div>
            )}

            {bpList.slice(-4).reverse().map((b) => {
              const cat = getBpCategory(b.systolic, b.diastolic);
              return (
                <div key={b.id} className="flex items-center justify-between text-xs text-zinc-300">
                  <span>
                    {b.date} · {b.time} ({b.pulse} bpm)
                  </span>
                  <span className={`font-mono font-bold ${cat.color}`}>
                    {b.systolic}/{b.diastolic} mmHg · {cat.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. MENSTRUAL CYCLE & SYMPTOM DIARY TAB */}
      {activeSubTab === 'cycle_symptoms' && (
        <div className="space-y-4">
          {/* Menstrual Cycle Tracking with Phase Notes */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  Menstrual Cycle &amp; Phase Nutrition Notes
                </span>
              </div>
              <span className="text-[11px] font-mono text-teal-300 font-bold">
                Day {cyclePhaseInfo.dayInCycle} of {cycleConfig.cycleLengthDays}
              </span>
            </div>

            <div className="p-2.5 bg-zinc-900 border border-teal-500/30 rounded-xl space-y-1">
              <span className="text-xs font-bold text-teal-300 block">{cyclePhaseInfo.phase}</span>
              <p className="text-[11px] text-zinc-300 leading-relaxed">{cyclePhaseInfo.note}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Last Period Start</label>
                <input
                  type="date"
                  value={cycleConfig.lastPeriodStart}
                  onChange={(e) =>
                    setCycleConfig((prev) => ({ ...prev, lastPeriodStart: e.target.value }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-1">Cycle Length (Days)</label>
                <input
                  type="number"
                  min={21}
                  max={40}
                  value={cycleConfig.cycleLengthDays}
                  onChange={(e) =>
                    setCycleConfig((prev) => ({
                      ...prev,
                      cycleLengthDays: Number(e.target.value) || 28
                    }))
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <select
                value={cycleFlow}
                onChange={(e) => setCycleFlow(e.target.value)}
                aria-label="Flow intensity"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value="None">No flow</option>
                <option value="Light">Light flow</option>
                <option value="Medium">Medium flow</option>
                <option value="Heavy">Heavy flow</option>
              </select>
              <input
                type="text"
                value={cycleNote}
                onChange={(e) => setCycleNote(e.target.value)}
                placeholder="Phase note (cramps, cravings...)"
                aria-label="Cycle phase note"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <button
                type="button"
                onClick={handleSaveCycleDay}
                className="py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs"
              >
                Save Note
              </button>
            </div>
          </div>

          {/* Symptom Diary with Tags */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-semibold text-zinc-100">Symptom Diary with Tags</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {SYMPTOM_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleAddSymptom} className="grid grid-cols-3 gap-2">
              <select
                value={symptomSeverity}
                onChange={(e) => setSymptomSeverity(Number(e.target.value))}
                aria-label="Symptom severity"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200"
              >
                <option value={1}>Severity 1 (Mild)</option>
                <option value={2}>Severity 2</option>
                <option value={3}>Severity 3 (Moderate)</option>
                <option value={4}>Severity 4</option>
                <option value={5}>Severity 5 (Strong)</option>
              </select>
              <input
                type="text"
                value={symptomFood}
                onChange={(e) => setSymptomFood(e.target.value)}
                placeholder="Suspected meal/food"
                aria-label="Suspected trigger food"
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
              />
              <button
                type="submit"
                className="py-1.5 bg-teal-500 text-zinc-950 font-bold rounded-lg text-xs"
              >
                Log Symptom
              </button>
            </form>

            {symptomsList.slice(0, 4).map((s) => (
              <div
                key={s.id}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-teal-300">{s.tags.join(', ')}</span>
                  <span className="text-[10px] text-zinc-400 block">
                    {s.date} · Severity {s.severity}/5
                    {s.suspectedFood ? ` · After: ${s.suspectedFood}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSymptomsList((prev) => prev.filter((x) => x.id !== s.id))}
                  aria-label="Delete symptom log"
                  className="text-zinc-400 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. CSV & FITNESS TRACKER IMPORTS TAB */}
      {activeSubTab === 'imports' && (
        <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-teal-400" />
            <div>
              <span className="text-xs font-semibold text-zinc-100 block">
                Import from MyFitnessPal, Fitbit, Garmin, Strava, Apple Health &amp; Google Fit
              </span>
              <span className="text-[11px] text-zinc-400">
                Upload a CSV export from any platform below to import meals, workouts, and weigh-ins.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'myfitnesspal', label: 'MyFitnessPal' },
                { id: 'fitbit', label: 'Fitbit' },
                { id: 'garmin', label: 'Garmin' },
                { id: 'strava', label: 'Strava' },
                { id: 'apple_health', label: 'Apple Health' },
                { id: 'google_fit', label: 'Google Fit' }
              ] as const
            ).map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setImportSource(src.id)}
                className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                  importSource === src.id
                    ? 'bg-teal-500/20 border-teal-500 text-teal-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="py-2.5 px-3 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>{isImporting ? 'Importing...' : `Upload ${importSource.replace('_', ' ')} CSV`}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileUpload}
                aria-label="Upload CSV file to import"
                className="sr-only"
              />
            </label>

            <button
              type="button"
              onClick={handleLoadSampleImport}
              className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-semibold rounded-xl text-xs transition-colors"
            >
              Test Sample Import
            </button>
          </div>

          {importStatus && (
            <p role="status" aria-live="polite" className="text-xs text-teal-300 font-medium">
              {importStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
