import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Flame,
  Plus,
  Trash2,
  Clock,
  Info,
  Play,
  Pause,
  RotateCcw,
  Footprints,
  Trophy,
  TrendingUp,
  Ruler,
  Camera,
  BatteryCharging,
  Zap
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../services/api.js';
import { triggerHaptic } from '../utils/haptics.js';
import type { BodyMeasurement, ProgressPhoto } from '../types/index.js';

interface ActivityOption {
  name: string;
  met: number;
  intensity: 'Low' | 'Moderate' | 'High';
}

const ACTIVITIES: ActivityOption[] = [
  { name: 'Slow jog', met: 7.0, intensity: 'Moderate' },
  { name: 'Running 10 km/h', met: 9.8, intensity: 'High' },
  { name: 'Running 12 km/h', met: 11.5, intensity: 'High' },
  { name: 'Walking', met: 3.5, intensity: 'Low' },
  { name: 'Cycling', met: 7.5, intensity: 'Moderate' },
  { name: 'Swimming', met: 8.0, intensity: 'High' },
  { name: 'HIIT', met: 8.5, intensity: 'High' },
  { name: 'Yoga', met: 3.0, intensity: 'Low' },
  { name: 'Weights', met: 5.0, intensity: 'Moderate' }
];

export const FitnessTab: React.FC = () => {
  const {
    activeDate,
    profile,
    stats,
    exercises,
    allExercises,
    todayHabit,
    saveTodayHabit,
    addExerciseItem,
    deleteExerciseItem,
    triggerUndoableDelete
  } = useApp();

  // Activity Log Form
  const [selectedActivity, setSelectedActivity] = useState<string>(ACTIVITIES[0].name);
  const [minutes, setMinutes] = useState<string>('30');
  const [liftWeightKg, setLiftWeightKg] = useState<string>('');
  const [liftReps, setLiftReps] = useState<string>('');
  const [distanceKm, setDistanceKm] = useState<string>('');
  const [plankSeconds, setPlankSeconds] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // #18 Workout Timer & Rest Timer between sets
  const [timerMode, setTimerMode] = useState<'work' | 'rest'>('rest');
  const [timerPresetSec, setTimerPresetSec] = useState<number>(90);
  const [secondsLeft, setSecondsLeft] = useState<number>(90);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [completedSets, setCompletedSets] = useState<number>(0);

  // #19 Step Counter (Motion Sensor + Manual Sync)
  const [isSensorActive, setIsSensorActive] = useState<boolean>(false);
  const [stepCount, setStepCount] = useState<number>(todayHabit?.steps || 0);

  // #22 Body Measurements
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const [chestCm, setChestCm] = useState('');
  const [waistCm, setWaistCm] = useState('');
  const [armsCm, setArmsCm] = useState('');
  const [hipsCm, setHipsCm] = useState('');
  const [thighCm, setThighCm] = useState('');

  // #23 Before/After Progress Photo Library
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [photoLabel, setPhotoLabel] = useState<'before' | 'after' | 'progress'>('progress');
  const [photoNote, setPhotoNote] = useState('');
  const [compareLeftId, setCompareLeftId] = useState<string>('');
  const [compareRightId, setCompareRightId] = useState<string>('');

  useEffect(() => {
    setStepCount(todayHabit?.steps || 0);
  }, [todayHabit?.steps]);

  useEffect(() => {
    loadFitnessExtras();
  }, []);

  const loadFitnessExtras = async () => {
    try {
      const [mRes, pRes] = await Promise.all([
        api.getMeasurements(),
        api.getProgressPhotos()
      ]);
      const mList = mRes.items || [];
      const pList = pRes.items || [];
      setMeasurements(mList);
      setPhotos(pList);
      if (pList.length >= 2) {
        const beforeItem = pList.find(p => p.label === 'before') || pList[0];
        const afterItem = pList.find(p => p.label === 'after') || pList[pList.length - 1];
        setCompareLeftId(beforeItem.id);
        setCompareRightId(afterItem.id);
      }
    } catch {
      // ignore
    }
  };

  // #18 Timer countdown effect
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          triggerHaptic('success');
          setIsTimerRunning(false);
          if (timerMode === 'work') {
            setCompletedSets(s => s + 1);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTimerRunning, timerMode]);

  // #19 Motion sensor listener for Step Counter
  useEffect(() => {
    if (!isSensorActive || typeof window === 'undefined') return;
    let lastPeak = 0;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      const now = Date.now();
      if (mag > 13.5 && now - lastPeak > 380) {
        lastPeak = now;
        setStepCount(prev => prev + 1);
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isSensorActive]);

  const handleSyncStepsToBurn = async (newSteps: number) => {
    setStepCount(newSteps);
    await saveTodayHabit({ steps: newSteps });
    const stepKcal = Math.round(newSteps * 0.04);
    if (stepKcal >= 15) {
      await addExerciseItem({
        date: activeDate,
        activityName: `Daily Steps (${newSteps.toLocaleString()} steps)`,
        met: 3.5,
        minutes: Math.max(5, Math.round(newSteps / 100)),
        caloriesBurned: stepKcal,
        intensity: 'Low'
      });
    }
  };

  // #24 Rest day detector: trained 4+ days in a row?
  const consecutiveTrainingDays = useMemo(() => {
    const dates = new Set(allExercises.map(e => e.date));
    let streak = 0;
    const cursor = new Date(activeDate + 'T00:00:00');
    for (let i = 0; i < 14; i++) {
      const dStr = cursor.toISOString().split('T')[0];
      if (dates.has(dStr)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }, [allExercises, activeDate]);

  // #20 Personal Records auto-detected from logs
  const personalRecords = useMemo(() => {
    let heaviestLift = 0;
    let heaviestLiftName = '—';
    let fastestPaceMinPerKm = Infinity;
    let fastestRunLabel = '—';
    let longestPlankSec = 0;

    for (const ex of allExercises) {
      if (ex.weightKg && ex.weightKg > heaviestLift) {
        heaviestLift = ex.weightKg;
        heaviestLiftName = ex.activityName;
      }
      if (ex.distanceKm && ex.distanceKm > 0 && ex.minutes > 0) {
        const pace = ex.minutes / ex.distanceKm;
        if (pace < fastestPaceMinPerKm) {
          fastestPaceMinPerKm = pace;
          fastestRunLabel = `${pace.toFixed(1)} min/km (${ex.distanceKm}km)`;
        }
      }
      if (ex.plankSeconds && ex.plankSeconds > longestPlankSec) {
        longestPlankSec = ex.plankSeconds;
      }
    }

    return {
      heaviestLift,
      heaviestLiftName,
      fastestRunLabel: fastestPaceMinPerKm === Infinity ? 'Log a run with km' : fastestRunLabel,
      longestPlankSec
    };
  }, [allExercises]);

  // #21 Progressive Overload Chart data (exercises with weightKg)
  const liftHistory = useMemo(() => {
    return allExercises
      .filter(e => e.weightKg && e.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10);
  }, [allExercises]);

  const currentActivity = ACTIVITIES.find(a => a.name === selectedActivity) || ACTIVITIES[0];
  const userWeightKg = profile.currentWeightKg || 70;
  const estimatedBurn = Math.round(currentActivity.met * userWeightKg * (Number(minutes || 0) / 60));

  const handleLogExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    const duration = Number(minutes);
    if (!duration || duration <= 0) return;

    setIsSubmitting(true);
    try {
      await addExerciseItem({
        date: activeDate,
        activityName: currentActivity.name,
        met: currentActivity.met,
        minutes: duration,
        caloriesBurned: estimatedBurn,
        intensity: currentActivity.intensity,
        weightKg: liftWeightKg ? Number(liftWeightKg) : undefined,
        reps: liftReps ? Number(liftReps) : undefined,
        distanceKm: distanceKm ? Number(distanceKm) : undefined,
        plankSeconds: plankSeconds ? Number(plankSeconds) : undefined
      });
      setMinutes('30');
      setLiftWeightKg('');
      setLiftReps('');
      setDistanceKm('');
      setPlankSeconds('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    const entry = await api.addMeasurement({
      date: activeDate,
      chestCm: chestCm ? Number(chestCm) : undefined,
      waistCm: waistCm ? Number(waistCm) : undefined,
      armsCm: armsCm ? Number(armsCm) : undefined,
      hipsCm: hipsCm ? Number(hipsCm) : undefined,
      thighCm: thighCm ? Number(thighCm) : undefined
    });
    setMeasurements(prev => [...prev, entry].sort((a, b) => a.date.localeCompare(b.date)));
    setChestCm('');
    setWaistCm('');
    setArmsCm('');
    setHipsCm('');
    setThighCm('');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      const saved = await api.addProgressPhoto({
        date: activeDate,
        label: photoLabel,
        dataUrl,
        weightKg: profile.currentWeightKg,
        note: photoNote.trim() || undefined
      });
      setPhotos(prev => {
        const next = [...prev, saved];
        if (!compareLeftId) setCompareLeftId(saved.id);
        else if (!compareRightId) setCompareRightId(saved.id);
        return next;
      });
      setPhotoNote('');
    };
    reader.readAsDataURL(file);
  };

  const totalDayBurn = exercises.reduce((sum, e) => sum + (e.caloriesBurned || 0), 0);
  const workoutStreak = stats.workoutStreak ?? consecutiveTrainingDays;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const leftPhoto = photos.find(p => p.id === compareLeftId) || photos[0];
  const rightPhoto = photos.find(p => p.id === compareRightId) || photos[photos.length - 1];

  return (
    <div className="space-y-5 pb-8 max-w-md mx-auto">
      {/* #25 Overview Card + Workout Streak */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Total Burned Today
            </span>
            <span className="px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-[10px] font-mono font-bold text-teal-300 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              {workoutStreak}d Workout Streak
            </span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-extrabold text-teal-400 font-mono">
              +{totalDayBurn}
            </span>
            <span className="text-xs text-zinc-400 font-mono">kcal</span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1 block">
            Burned calories expand today&apos;s eating target automatically.
          </span>
        </div>

        <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
          <Flame className="w-7 h-7" />
        </div>
      </div>

      {/* #24 Rest Day Suggestion Card (trained 4+ days in a row) */}
      {consecutiveTrainingDays >= 4 && (
        <div className="bg-amber-950/30 border border-amber-700/50 rounded-2xl p-4 flex items-start gap-3">
          <BatteryCharging className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-amber-300">
              Rest Day Recommended ({consecutiveTrainingDays} Days Trained in a Row)
            </h4>
            <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">
              You have logged training {consecutiveTrainingDays} consecutive days. Consider active recovery, mobility work, or a full rest day to support muscle repair and nervous system recovery.
            </p>
          </div>
        </div>
      )}

      {/* #18 WORKOUT & REST TIMER */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-semibold text-zinc-200">Workout & Rest Timer</h4>
          </div>
          <span className="text-[11px] font-mono text-teal-400">
            Sets completed: {completedSets}
          </span>
        </div>

        <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl p-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <button
                type="button"
                onClick={() => {
                  setTimerMode('rest');
                  setSecondsLeft(timerPresetSec);
                  setIsTimerRunning(false);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  timerMode === 'rest' ? 'bg-teal-500 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                Rest Between Sets
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimerMode('work');
                  setSecondsLeft(timerPresetSec);
                  setIsTimerRunning(false);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                  timerMode === 'work' ? 'bg-teal-500 text-zinc-950' : 'text-zinc-400'
                }`}
              >
                Work Interval
              </button>
            </div>
            <span className="text-2xl font-extrabold font-mono text-zinc-100">
              {formatTimer(secondsLeft)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="p-2.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 rounded-xl font-bold transition-colors"
              aria-label="Start or pause timer"
            >
              {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsTimerRunning(false);
                setSecondsLeft(timerPresetSec);
              }}
              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors"
              aria-label="Reset timer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {[30, 60, 90, 120, 180].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => {
                setTimerPresetSec(sec);
                setSecondsLeft(sec);
                setIsTimerRunning(false);
              }}
              className={`flex-1 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                timerPresetSec === sec
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400'
              }`}
            >
              {sec}s
            </button>
          ))}
        </div>
      </div>

      {/* #19 STEP COUNTER (Motion Sensors + Daily Burn) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints className="w-4 h-4 text-teal-400" />
            <div>
              <h4 className="text-xs font-semibold text-zinc-200">Step Counter</h4>
              <span className="text-[10px] text-zinc-500">
                +{Math.round(stepCount * 0.04)} kcal estimated step burn
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSensorActive(!isSensorActive)}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border transition-colors ${
              isSensorActive
                ? 'bg-teal-500 text-zinc-950 border-teal-400'
                : 'bg-zinc-950 text-teal-400 border-zinc-800'
            }`}
          >
            {isSensorActive ? 'Sensor Active' : 'Enable Motion Sensor'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="100"
            value={stepCount || ''}
            onChange={(e) => setStepCount(Number(e.target.value) || 0)}
            placeholder="Enter or sync steps (e.g. 8500)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={() => handleSyncStepsToBurn(stepCount + 1000)}
            className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-mono"
          >
            +1k
          </button>
          <button
            type="button"
            onClick={() => handleSyncStepsToBurn(stepCount)}
            className="px-3 py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs"
          >
            Add to Burn
          </button>
        </div>
      </div>

      {/* Log Activity Form */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Log Physical Activity</h3>
        </div>

        <form onSubmit={handleLogExercise} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Activity (MET Indexed)
            </label>
            <select
              value={selectedActivity}
              onChange={(e) => setSelectedActivity(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-teal-500"
            >
              {ACTIVITIES.map((act) => (
                <option key={act.name} value={act.name}>
                  {act.name} (MET: {act.met} · {act.intensity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Duration (minutes)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="30"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Calculated Burn
              </label>
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-teal-400 font-bold font-mono flex items-center justify-between">
                <span>{estimatedBurn}</span>
                <span className="text-xs text-zinc-500 font-normal">kcal</span>
              </div>
            </div>
          </div>

          {/* Optional PR & Progressive Overload inputs */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">Lift (kg)</label>
              <input
                type="number"
                step="0.5"
                value={liftWeightKg}
                onChange={(e) => setLiftWeightKg(e.target.value)}
                placeholder="80"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">Reps</label>
              <input
                type="number"
                value={liftReps}
                onChange={(e) => setLiftReps(e.target.value)}
                placeholder="8"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">Run (km)</label>
              <input
                type="number"
                step="0.1"
                value={distanceKm}
                onChange={(e) => setDistanceKm(e.target.value)}
                placeholder="5.0"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 mb-1">Plank (s)</label>
              <input
                type="number"
                value={plankSeconds}
                onChange={(e) => setPlankSeconds(e.target.value)}
                placeholder="90"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-800/60">
            <Info className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>
              Calculated using {userWeightKg} kg body mass × {currentActivity.met} MET.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !minutes || Number(minutes) <= 0}
            className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            Log Activity
          </button>
        </form>
      </div>

      {/* #20 PERSONAL RECORDS (Auto-detected from logs) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-teal-400" />
          <h4 className="text-sm font-semibold text-zinc-200">Personal Records (Auto-Detected)</h4>
        </div>
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-500 uppercase block">Heaviest Lift</span>
            <span className="text-sm font-bold text-teal-400 font-mono block mt-0.5">
              {personalRecords.heaviestLift > 0 ? `${personalRecords.heaviestLift} kg` : '—'}
            </span>
            <span className="text-[9px] text-zinc-500 truncate block">{personalRecords.heaviestLiftName}</span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-500 uppercase block">Fastest Run</span>
            <span className="text-xs font-bold text-teal-400 font-mono block mt-1">
              {personalRecords.fastestRunLabel}
            </span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5">
            <span className="text-[10px] text-zinc-500 uppercase block">Longest Plank</span>
            <span className="text-sm font-bold text-teal-400 font-mono block mt-0.5">
              {personalRecords.longestPlankSec > 0 ? `${personalRecords.longestPlankSec}s` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* #21 PROGRESSIVE OVERLOAD CHART */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Progressive Overload</h4>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">Weight × Reps</span>
        </div>

        {liftHistory.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-3 border border-dashed border-zinc-800 rounded-xl">
            Enter Lift (kg) and Reps above when logging strength sessions to chart progressive overload.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="h-28 flex items-end justify-between gap-2 bg-zinc-950 border border-zinc-800 rounded-xl p-3">
              {(() => {
                const maxW = Math.max(...liftHistory.map(l => l.weightKg || 1), 50);
                return liftHistory.map((item) => {
                  const pct = Math.max(15, Math.round(((item.weightKg || 0) / maxW) * 100));
                  return (
                    <div key={item.id} className="flex-1 flex flex-col items-center h-full justify-end">
                      <span className="text-[9px] font-mono text-teal-400 mb-1">
                        {item.weightKg}kg{item.reps ? `×${item.reps}` : ''}
                      </span>
                      <div className="w-full max-w-[24px] bg-teal-500/80 rounded-t-md" style={{ height: `${pct}%` }} />
                      <span className="text-[9px] font-mono text-zinc-500 mt-1">{item.date.slice(5)}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* #22 BODY MEASUREMENTS (Chest, Waist, Arms, Hips, Thigh) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Body Measurements (cm)</h4>
          </div>
          <span className="text-[10px] font-mono text-zinc-500">{measurements.length} entries</span>
        </div>

        <form onSubmit={handleAddMeasurement} className="space-y-2.5">
          <div className="grid grid-cols-5 gap-1.5">
            <input
              type="number"
              step="0.1"
              value={chestCm}
              onChange={(e) => setChestCm(e.target.value)}
              placeholder="Chest"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="number"
              step="0.1"
              value={waistCm}
              onChange={(e) => setWaistCm(e.target.value)}
              placeholder="Waist"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="number"
              step="0.1"
              value={armsCm}
              onChange={(e) => setArmsCm(e.target.value)}
              placeholder="Arms"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="number"
              step="0.1"
              value={hipsCm}
              onChange={(e) => setHipsCm(e.target.value)}
              placeholder="Hips"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
            />
            <input
              type="number"
              step="0.1"
              value={thighCm}
              onChange={(e) => setThighCm(e.target.value)}
              placeholder="Thigh"
              className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-teal-400 font-semibold rounded-xl text-xs flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Save Measurements for {activeDate}
          </button>
        </form>

        {measurements.length > 0 && (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {measurements.slice().reverse().map((m) => (
              <div
                key={m.id}
                className="p-2 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center justify-between text-[11px] font-mono"
              >
                <span className="text-zinc-400">{m.date}</span>
                <div className="flex items-center gap-2 text-zinc-200">
                  {m.chestCm && <span>C:{m.chestCm}</span>}
                  {m.waistCm && <span className="text-teal-400">W:{m.waistCm}</span>}
                  {m.armsCm && <span>A:{m.armsCm}</span>}
                  {m.hipsCm && <span>H:{m.hipsCm}</span>}
                  {m.thighCm && <span>T:{m.thighCm}</span>}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    triggerUndoableDelete(
                      `Deleted measurement (${m.date})`,
                      async () => {
                        setMeasurements(prev => prev.filter(x => x.id !== m.id));
                        await api.deleteMeasurement(m.id);
                      },
                      async () => {
                        const { id: _id, userId: _u, createdAt: _c, ...rest } = m;
                        const restored = await api.addMeasurement(rest);
                        setMeasurements(prev => [...prev, restored]);
                      }
                    )
                  }
                  className="text-zinc-600 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* #23 BEFORE / AFTER PHOTO LIBRARY (Side-by-Side Compare View) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Before / After Photo Library</h4>
          </div>
          <span className="text-[10px] text-zinc-500">Private per user</span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={photoLabel}
            onChange={(e) => setPhotoLabel(e.target.value as any)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-2 text-xs text-zinc-200"
          >
            <option value="before">Before</option>
            <option value="progress">Progress</option>
            <option value="after">After</option>
          </select>
          <input
            type="text"
            value={photoNote}
            onChange={(e) => setPhotoNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
          />
          <label className="px-3 py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-xl text-xs cursor-pointer shrink-0 flex items-center gap-1">
            <Camera className="w-3.5 h-3.5" />
            Add
            <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </label>
        </div>

        {photos.length >= 2 && leftPhoto && rightPhoto && (
          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-semibold text-zinc-400 block">Side-by-Side Compare</span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 space-y-1.5">
                <select
                  value={leftPhoto.id}
                  onChange={(e) => setCompareLeftId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
                >
                  {photos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label.toUpperCase()} · {p.date}
                    </option>
                  ))}
                </select>
                <img
                  src={leftPhoto.dataUrl}
                  alt="Before comparison"
                  className="w-full h-36 object-cover rounded-lg border border-zinc-800"
                />
              </div>

              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 space-y-1.5">
                <select
                  value={rightPhoto.id}
                  onChange={(e) => setCompareRightId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-300"
                >
                  {photos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.label.toUpperCase()} · {p.date}
                    </option>
                  ))}
                </select>
                <img
                  src={rightPhoto.dataUrl}
                  alt="After comparison"
                  className="w-full h-36 object-cover rounded-lg border border-zinc-800"
                />
              </div>
            </div>
          </div>
        )}

        {photos.length === 1 && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img src={photos[0].dataUrl} alt="Progress" className="w-12 h-12 object-cover rounded-lg" />
              <div>
                <span className="text-xs font-semibold text-zinc-200 uppercase block">{photos[0].label}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{photos[0].date} · Add 1 more for side-by-side compare</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Logged Activities List */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <h4 className="text-xs font-semibold text-zinc-300">
          Today&apos;s Logged Exercises ({exercises.length})
        </h4>

        {exercises.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-600 border border-dashed border-zinc-800 rounded-xl">
            No exercises logged for today yet.
          </div>
        ) : (
          <div className="space-y-2">
            {exercises.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between group"
              >
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">
                    {item.activityName}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono mt-0.5">
                    <span>{item.minutes} mins</span>
                    <span>·</span>
                    <span className="text-zinc-400">MET {item.met}</span>
                    <span>·</span>
                    <span className="text-teal-400/80">{item.intensity}</span>
                    {item.weightKg && <span>· {item.weightKg}kg{item.reps ? `×${item.reps}` : ''}</span>}
                    {item.distanceKm && <span>· {item.distanceKm}km</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-teal-400 font-mono">
                    +{item.caloriesBurned} kcal
                  </span>
                  <button
                    onClick={() => deleteExerciseItem(item.id)}
                    className="p-1 text-zinc-600 hover:text-rose-400 rounded transition-colors"
                    aria-label="Delete exercise"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
