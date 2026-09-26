import React, { useState, useEffect } from 'react';
import {
  Scale,
  Award,
  MessageSquare,
  Download,
  AlertTriangle,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  Shield,
  Sun,
  Moon,
  Clock,
  Trophy,
  Compass,
  Bell,
  Smartphone,
  Calendar
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { api } from '../services/api.js';
import { WeeklyRecapModal } from './WeeklyRecapModal.js';
import { SocialAccountabilitySection } from './SocialAccountabilitySection.js';
import {
  calculateDailyCalorieTarget,
  calculateMacroTargets,
  calculateProjectedGoalDate,
  formatWeight
} from '../utils/nutritionMath.js';
import type { UserProfile, ChatMessage } from '../types/index.js';

const BADGE_DEFINITIONS: Array<{ id: string; title: string; desc: string }> = [
  { id: 'First log', title: 'First Log', desc: 'Logged your first meal' },
  { id: '3-day streak', title: '3-Day Streak', desc: 'Logged consistency 3 days in a row' },
  { id: '7-day streak', title: '7-Day Streak', desc: 'Logged consistency 7 days in a row' },
  { id: '30-day streak', title: '30-Day Streak', desc: '1 month of consistent tracking' },
  { id: '100-day streak', title: '100-Day Streak', desc: 'Mastery of long-term habits' },
  { id: 'First workout', title: 'First Workout', desc: 'Logged your first exercise session' },
  { id: 'Hydrated', title: 'Hydrated', desc: 'Logged daily water consumption' },
  { id: 'First weigh-in', title: 'First Weigh-In', desc: 'Recorded baseline scale weight' },
  { id: 'Weighed 7 times', title: '7 Weigh-Ins', desc: 'Consistent scale monitoring' },
  { id: 'Weighed 30 times', title: '30 Weigh-Ins', desc: 'Comprehensive weight progression' },
  { id: '50 XP', title: '50 XP', desc: 'Earned 50 XP in Caloriq' },
  { id: '200 XP', title: '200 XP', desc: 'Earned 200 XP in Caloriq' },
  { id: '1000 XP', title: '1,000 XP', desc: 'Earned 1,000 XP milestone' },
  { id: '5000 XP', title: '5,000 XP', desc: 'Elite tracking veteran' }
];

interface MeTabProps {
  onOpenDescription?: () => void;
  onOpenPrivacy?: () => void;
}

export const MeTab: React.FC<MeTabProps> = ({ onOpenDescription, onOpenPrivacy }) => {
  const {
    profile,
    updateUserProfile,
    weights,
    addWeightLog,
    deleteWeightLog,
    stats,
    victories,
    addVictoryItem,
    deleteVictoryItem
  } = useApp();

  // Form State
  const [formData, setFormData] = useState<UserProfile>(profile);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // "Why I started" pinned card state (#42)
  const [whyText, setWhyText] = useState(profile.pinnedWhy || '');
  const [isEditingWhy, setIsEditingWhy] = useState(!profile.pinnedWhy);

  // Non-scale victories (#41)
  const [newVictory, setNewVictory] = useState('');

  // Weight Log input
  const [newWeight, setNewWeight] = useState('');
  const [weightDate, setWeightDate] = useState(new Date().toISOString().split('T')[0]);

  // Chat with Developer State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);

  // Clear confirmation modal
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // #60 Weekly recap modal trigger
  const [showRecapModal, setShowRecapModal] = useState(false);
  // #57 Custom reminder times
  const [reminders, setReminders] = useState({
    breakfast: profile.reminderTimes?.breakfast || '08:00',
    lunch: profile.reminderTimes?.lunch || '13:00',
    dinner: profile.reminderTimes?.dinner || '19:00',
    water: profile.reminderTimes?.water || '15:00'
  });

  useEffect(() => {
    setFormData(profile);
    setWhyText(profile.pinnedWhy || '');
  }, [profile]);

  useEffect(() => {
    loadChatMessages();
  }, []);

  const loadChatMessages = async () => {
    try {
      const res = await api.getChat();
      setChatMessages(res.messages || []);
    } catch {
      // ignore
    }
  };

  // Math recalculations live from form data
  const currentTargetKcal = calculateDailyCalorieTarget(formData);
  const currentMacros = calculateMacroTargets(currentTargetKcal);
  const projectedGoalDate = calculateProjectedGoalDate(formData);

  const handleSaveWhy = async () => {
    await updateUserProfile({ pinnedWhy: whyText.trim() });
    setIsEditingWhy(false);
    setSaveStatus('Saved your "Why I started" statement.');
    setTimeout(() => setSaveStatus(null), 2500);
  };

  // #6 Streak freeze logic (one "protect a missed day" per month)
  const currentMonthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
  const freezesUsed = profile.streakFreezesUsed || [];
  const usedThisMonth = freezesUsed.find(d => d.startsWith(currentMonthPrefix));

  const handleUseStreakFreeze = async () => {
    if (usedThisMonth) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const nextFreezes = [...freezesUsed, yStr];
    await updateUserProfile({ streakFreezesUsed: nextFreezes });
    setSaveStatus(`Streak freeze activated for ${yStr}`);
    setTimeout(() => setSaveStatus(null), 3000);
  };

  // #55 Theme mode toggle (dark | light | auto)
  const handleSetTheme = async (mode: 'dark' | 'light' | 'auto') => {
    setFormData(prev => ({ ...prev, themeMode: mode }));
    await updateUserProfile({ themeMode: mode });
  };

  const handleAddVictory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVictory.trim()) return;
    await addVictoryItem(newVictory.trim());
    setNewVictory('');
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateUserProfile(formData);
    setSaveStatus('Profile and macro targets updated successfully!');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = parseFloat(newWeight);
    if (!w || w <= 0) return;

    const weightInKg = formData.unitSystem === 'imperial' ? Math.round((w / 2.20462) * 10) / 10 : w;
    await addWeightLog(weightInKg, weightDate);
    setNewWeight('');
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isSendingChat) return;

    const text = chatInput.trim();
    setChatInput('');
    setIsSendingChat(true);

    try {
      const msg = await api.sendChatMessage(text);
      setChatMessages(prev => [...prev, msg]);
      setTimeout(loadChatMessages, 1200);
    } catch {
      // ignore
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleExportData = async () => {
    try {
      const res = await fetch(`/api/export?token=${api.getToken() || ''}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'caloriq-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleDownloadStandaloneHtml = () => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    const rootEl = clone.querySelector('#root');
    if (rootEl) rootEl.innerHTML = '';
    clone.querySelectorAll('script[src*="@vite"]').forEach(el => el.remove());
    const htmlContent = '<!doctype html>\n' + clone.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmClear = async () => {
    await api.clearAllData();
    setShowClearConfirm(false);
    window.location.reload();
  };

  // Weight Trend Line (SVG)
  const sortedWeights = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const minWeight = sortedWeights.length > 0 ? Math.min(...sortedWeights.map(w => w.weightKg)) - 1 : 60;
  const maxWeight = sortedWeights.length > 0 ? Math.max(...sortedWeights.map(w => w.weightKg)) + 1 : 75;
  const weightRange = maxWeight - minWeight || 1;

  const points = sortedWeights.map((w, idx) => {
    const x = sortedWeights.length === 1 ? 50 : (idx / (sortedWeights.length - 1)) * 260 + 20;
    const y = 90 - ((w.weightKg - minWeight) / weightRange) * 70;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="space-y-5 pb-8 max-w-md mx-auto">
      {/* #42 "Why I started" Card — Pinned to the top of the Me tab */}
      <div className="bg-zinc-900/90 border border-teal-500/30 rounded-2xl p-4 shadow-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-teal-400" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-teal-400">
              Why I Started
            </h4>
          </div>
          {!isEditingWhy && (
            <button
              type="button"
              onClick={() => setIsEditingWhy(true)}
              className="text-[11px] text-zinc-400 hover:text-teal-300 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {isEditingWhy ? (
          <div className="space-y-2">
            <input
              type="text"
              value={whyText}
              onChange={(e) => setWhyText(e.target.value)}
              placeholder="Write your core reason once (e.g. Have steady energy for my family)..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
            />
            <div className="flex justify-end gap-2">
              {profile.pinnedWhy && (
                <button
                  type="button"
                  onClick={() => {
                    setWhyText(profile.pinnedWhy || '');
                    setIsEditingWhy(false);
                  }}
                  className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveWhy}
                className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-lg text-xs"
              >
                Pin Reason
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm font-medium text-zinc-100 leading-relaxed">
            &ldquo;{profile.pinnedWhy}&rdquo;
          </p>
        )}
      </div>

      {/* Profile & Target Header Card */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-lg font-mono">
              {formData.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">{formData.name}</h3>
              <span className="text-xs text-zinc-500 font-mono">
                Level {stats.level} · {stats.xp} XP · {stats.foodStreak || 0}d streak
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xl font-extrabold text-teal-400 font-mono block">
              {currentTargetKcal}
            </span>
            <span className="text-[10px] text-zinc-500 uppercase">kcal / day</span>
          </div>
        </div>

        {/* Calculated Macros Confirmation */}
        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">Carbs (40%)</span>
            <span className="font-bold text-blue-400">{currentMacros.carbsGrams}g</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">Fat (30%)</span>
            <span className="font-bold text-amber-400">{currentMacros.fatGrams}g</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">Protein (30%)</span>
            <span className="font-bold text-red-400">{currentMacros.proteinGrams}g</span>
          </div>
          <div className="text-right border-l border-zinc-800 pl-3">
            <span className="text-zinc-500 block text-[10px]">Verification</span>
            <span className="text-teal-400 font-bold">
              {currentMacros.carbsGrams * 4 + currentMacros.fatGrams * 9 + currentMacros.proteinGrams * 4} kcal
            </span>
          </div>
        </div>

        {/* Projected Goal Date */}
        <div className="bg-teal-950/40 border border-teal-900/60 rounded-xl p-3 flex items-center gap-2.5 text-xs text-teal-300">
          <TrendingDown className="w-4 h-4 text-teal-400 shrink-0" />
          <div>
            <span className="font-semibold block">Projected Target Date:</span>
            <span className="text-teal-200">{projectedGoalDate}</span>
          </div>
        </div>

        {/* #6 Streak Freeze (1 per month) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-teal-400 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-zinc-200 block">Monthly Streak Freeze</span>
              <span className="text-[11px] text-zinc-500">
                {usedThisMonth
                  ? `Used this month (${usedThisMonth})`
                  : '1 available this month to protect a missed day'}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={Boolean(usedThisMonth)}
            onClick={handleUseStreakFreeze}
            className="px-3 py-1.5 bg-teal-500/15 hover:bg-teal-500/25 disabled:opacity-40 border border-teal-500/30 text-teal-300 rounded-xl text-xs font-semibold transition-colors"
          >
            {usedThisMonth ? 'Protected' : 'Protect Missed Day'}
          </button>
        </div>

        {/* #55 Dark / Light / Auto Theme Toggle */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-300">Appearance Theme</span>
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              type="button"
              onClick={() => handleSetTheme('dark')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                (profile.themeMode || 'dark') === 'dark'
                  ? 'bg-teal-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Moon className="w-3 h-3" />
              Dark
            </button>
            <button
              type="button"
              onClick={() => handleSetTheme('light')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                profile.themeMode === 'light'
                  ? 'bg-teal-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Sun className="w-3 h-3" />
              Light
            </button>
            <button
              type="button"
              onClick={() => handleSetTheme('auto')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors ${
                profile.themeMode === 'auto'
                  ? 'bg-teal-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3 h-3" />
              Auto
            </button>
          </div>
        </div>
      </div>

      {saveStatus && (
        <div className="p-3 bg-teal-950/60 border border-teal-800/80 rounded-xl text-xs text-teal-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span>{saveStatus}</span>
        </div>
      )}

      {/* #41 Non-Scale Victories */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Non-Scale Victories</h4>
          </div>
          <span className="text-[11px] font-mono text-zinc-500">{victories.length} wins</span>
        </div>

        <form onSubmit={handleAddVictory} className="flex gap-2">
          <input
            type="text"
            value={newVictory}
            onChange={(e) => setNewVictory(e.target.value)}
            placeholder="e.g. Jeans fit better, ran 5k without stopping..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            className="px-3 py-2 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl flex items-center gap-1 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Win
          </button>
        </form>

        {victories.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-2">
            Record private milestones beyond the scale.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {victories.map((v) => (
              <div
                key={v.id}
                className="p-2.5 bg-zinc-950/70 border border-zinc-850 rounded-xl flex items-center justify-between text-xs"
              >
                <div>
                  <span className="text-zinc-200 font-medium block">{v.text}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{v.date}</span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteVictoryItem(v.id)}
                  className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Profile Settings Form */}
      <form onSubmit={handleSaveProfile} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-200">Physiology & Goal Settings</h4>
          <button
            type="button"
            onClick={() => setFormData(prev => ({
              ...prev,
              unitSystem: prev.unitSystem === 'metric' ? 'imperial' : 'metric'
            }))}
            className="px-2.5 py-1 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-teal-400 hover:border-zinc-700 transition-colors"
          >
            {formData.unitSystem.toUpperCase()} UNITS
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Gender</label>
            <select
              value={formData.gender}
              onChange={(e) => setFormData(p => ({ ...p, gender: e.target.value as any }))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500"
            >
              <option value="female">Female (floor 1200 kcal)</option>
              <option value="male">Male (floor 1500 kcal)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Age</label>
            <input
              type="number"
              min="14"
              max="110"
              value={formData.age}
              onChange={(e) => setFormData(p => ({ ...p, age: Number(e.target.value) }))}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Height (cm)</label>
            <input
              type="number"
              min="100"
              max="250"
              value={formData.heightCm}
              onChange={(e) => setFormData(p => ({ ...p, heightCm: Number(e.target.value) }))}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Current Weight ({formData.unitSystem === 'metric' ? 'kg' : 'lbs'})
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.unitSystem === 'metric' ? formData.currentWeightKg : Math.round(formData.currentWeightKg * 2.20462 * 10) / 10}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                const inKg = formData.unitSystem === 'metric' ? val : val / 2.20462;
                setFormData(p => ({ ...p, currentWeightKg: Math.round(inKg * 10) / 10 }));
              }}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Goal Weight ({formData.unitSystem === 'metric' ? 'kg' : 'lbs'})
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.unitSystem === 'metric' ? formData.goalWeightKg : Math.round(formData.goalWeightKg * 2.20462 * 10) / 10}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                const inKg = formData.unitSystem === 'metric' ? val : val / 2.20462;
                setFormData(p => ({ ...p, goalWeightKg: Math.round(inKg * 10) / 10 }));
              }}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Body Fat % (optional)</label>
            <input
              type="number"
              min="3"
              max="60"
              value={formData.bodyFatPercent || ''}
              onChange={(e) => setFormData(p => ({ ...p, bodyFatPercent: e.target.value ? Number(e.target.value) : undefined }))}
              placeholder="e.g. 18 (uses Katch-McArdle)"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Fitness Level</label>
            <select
              value={formData.fitnessLevel}
              onChange={(e) => setFormData(p => ({ ...p, fitnessLevel: e.target.value as any }))}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500 capitalize"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Daily Activity Level</label>
          <select
            value={formData.dailyActivity}
            onChange={(e) => setFormData(p => ({ ...p, dailyActivity: e.target.value as any }))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500"
          >
            <option value="sedentary">Sedentary (1.2×) · Desk job, minimal walking</option>
            <option value="light">Lightly Active (1.375×) · 1-3 workouts / week</option>
            <option value="moderate">Moderately Active (1.55×) · 3-5 workouts / week</option>
            <option value="active">Very Active (1.725×) · 6-7 intense sessions</option>
            <option value="athlete">Athlete (1.9×) · Physical job + training</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">Goal Speed</label>
          <select
            value={formData.goalSpeed}
            onChange={(e) => setFormData(p => ({ ...p, goalSpeed: e.target.value as any }))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-teal-500"
          >
            <option value="lose_slow">Lose Slow (−250 kcal/day · ~0.25 kg/wk)</option>
            <option value="lose_normal">Lose Normal (−500 kcal/day · ~0.5 kg/wk)</option>
            <option value="lose_fast">Lose Fast (−750 kcal/day · ~0.75 kg/wk)</option>
            <option value="maintain">Maintain Current Weight (0 adjustment)</option>
            <option value="gain_slow">Lean Gain Slow (+250 kcal/day)</option>
            <option value="gain_normal">Gain Normal (+500 kcal/day)</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-teal-500/20"
        >
          Save Physiology Settings
        </button>
      </form>

      {/* WEIGHT LOG WITH TREND LINE */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Weight Progression</h4>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {formatWeight(formData.currentWeightKg, formData.unitSystem)}
          </span>
        </div>

        {sortedWeights.length > 0 && (
          <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-850">
            <div className="h-28 w-full relative">
              <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                <line x1="0" y1="20" x2="300" y2="20" stroke="#27272a" strokeDasharray="3 3" />
                <line x1="0" y1="55" x2="300" y2="55" stroke="#27272a" strokeDasharray="3 3" />
                <line x1="0" y1="90" x2="300" y2="90" stroke="#27272a" strokeDasharray="3 3" />

                {sortedWeights.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points}
                  />
                )}

                {sortedWeights.map((w, idx) => {
                  const x = sortedWeights.length === 1 ? 150 : (idx / (sortedWeights.length - 1)) * 260 + 20;
                  const y = 90 - ((w.weightKg - minWeight) / weightRange) * 70;
                  return (
                    <circle
                      key={w.id}
                      cx={x}
                      cy={y}
                      r="4"
                      className="fill-teal-400 stroke-zinc-950 stroke-2"
                    />
                  );
                })}
              </svg>
            </div>
            <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-1 px-1">
              <span>{sortedWeights[0].date}</span>
              <span>{sortedWeights[sortedWeights.length - 1].date}</span>
            </div>
          </div>
        )}

        <form onSubmit={handleAddWeight} className="flex gap-2">
          <input
            type="date"
            value={weightDate}
            onChange={(e) => setWeightDate(e.target.value)}
            required
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-teal-500 font-mono"
          />
          <input
            type="number"
            step="0.1"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder={`Weight in ${formData.unitSystem === 'metric' ? 'kg' : 'lbs'}`}
            required
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 font-mono"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold text-xs rounded-xl flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Log
          </button>
        </form>

        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {sortedWeights.slice().reverse().map((w) => (
            <div
              key={w.id}
              className="p-2 bg-zinc-950/70 border border-zinc-850 rounded-xl flex items-center justify-between text-xs font-mono"
            >
              <span className="text-zinc-400">{w.date}</span>
              <div className="flex items-center gap-3">
                <span className="text-zinc-100 font-bold">
                  {formatWeight(w.weightKg, formData.unitSystem)}
                </span>
                <button
                  onClick={() => deleteWeightLog(w.id)}
                  className="p-1 text-zinc-600 hover:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* XP & BADGES */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Badges & Consistency</h4>
          </div>
          <span className="text-xs font-mono text-teal-400 font-bold">
            Level {stats.level} ({stats.xp} XP)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {BADGE_DEFINITIONS.map((badge) => {
            const isUnlocked = stats.badges.includes(badge.id);
            return (
              <div
                key={badge.id}
                className={`p-3 rounded-xl border transition-all ${
                  isUnlocked
                    ? 'bg-zinc-950 border-teal-500/30'
                    : 'bg-zinc-950/40 border-zinc-850 opacity-40'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${isUnlocked ? 'bg-teal-400' : 'bg-zinc-700'}`} />
                  <span className={`text-xs font-semibold ${isUnlocked ? 'text-zinc-100' : 'text-zinc-500'}`}>
                    {badge.title}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-tight">
                  {badge.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* #57 CUSTOM REMINDERS (Breakfast, Lunch, Dinner, Water nudges) */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Custom Daily Reminders</h4>
          </div>
          <button
            type="button"
            onClick={async () => {
              if ('Notification' in window && Notification.permission === 'default') {
                await Notification.requestPermission().catch(() => {});
              }
              await updateUserProfile({
                mealReminderEnabled: true,
                waterReminderEnabled: true,
                reminderTimes: reminders
              });
              setSaveStatus('Custom reminder times saved!');
              setTimeout(() => setSaveStatus(null), 2500);
            }}
            className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-lg text-xs"
          >
            Save Times
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-xs">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-zinc-400">Breakfast</span>
            <input
              type="time"
              value={reminders.breakfast}
              onChange={(e) => setReminders(p => ({ ...p, breakfast: e.target.value }))}
              className="bg-transparent text-zinc-100 font-mono text-xs focus:outline-none"
            />
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-zinc-400">Lunch</span>
            <input
              type="time"
              value={reminders.lunch}
              onChange={(e) => setReminders(p => ({ ...p, lunch: e.target.value }))}
              className="bg-transparent text-zinc-100 font-mono text-xs focus:outline-none"
            />
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-zinc-400">Dinner</span>
            <input
              type="time"
              value={reminders.dinner}
              onChange={(e) => setReminders(p => ({ ...p, dinner: e.target.value }))}
              className="bg-transparent text-zinc-100 font-mono text-xs focus:outline-none"
            />
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between">
            <span className="text-zinc-400">Water Nudge</span>
            <input
              type="time"
              value={reminders.water}
              onChange={(e) => setReminders(p => ({ ...p, water: e.target.value }))}
              className="bg-transparent text-zinc-100 font-mono text-xs focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* #54 HOME SCREEN WIDGET & PWA INSTRUCTIONS */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-teal-400" />
            <h4 className="text-sm font-semibold text-zinc-200">Home Screen App & Widget</h4>
          </div>
          <button
            type="button"
            onClick={() => setShowRecapModal(true)}
            className="text-[11px] text-teal-400 hover:underline flex items-center gap-1"
          >
            <Calendar className="w-3 h-3" />
            Weekly Recap
          </button>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Install Caloriq to your phone&apos;s home screen for one-tap offline logging and full-screen access:
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <span className="font-semibold text-zinc-200 block mb-0.5">iOS (Safari)</span>
            <span className="text-zinc-400 text-[11px]">
              Tap the Share icon in the bottom bar, scroll down, and select &ldquo;Add to Home Screen&rdquo;.
            </span>
          </div>
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3">
            <span className="font-semibold text-zinc-200 block mb-0.5">Android (Chrome)</span>
            <span className="text-zinc-400 text-[11px]">
              Tap the three-dot menu in the top right and select &ldquo;Add to Home screen&rdquo; or &ldquo;Install app&rdquo;.
            </span>
          </div>
        </div>
      </div>

      <WeeklyRecapModal
        forceOpen={showRecapModal}
        onCloseForce={() => setShowRecapModal(false)}
      />

      {/* PHASE 5: SOCIAL & ACCOUNTABILITY (#43, #44, #45, #46, #47) */}
      <SocialAccountabilitySection />

      {/* CHAT WITH THE DEVELOPER */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-400" />
          <div>
            <h4 className="text-sm font-semibold text-zinc-200">Chat with the developer</h4>
            <span className="text-[11px] text-zinc-500">
              Direct inbox to the Caloriq software engineering team.
            </span>
          </div>
        </div>

        <div className="h-44 overflow-y-auto bg-zinc-950 rounded-xl p-3 border border-zinc-850 space-y-2">
          {chatMessages.length === 0 ? (
            <p className="text-xs text-zinc-600 text-center py-8">
              Send questions, bug reports, or feature ideas directly to the developer.
            </p>
          ) : (
            chatMessages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[9px] text-zinc-600 px-1 mb-0.5 capitalize">
                  {m.sender === 'user' ? 'You' : 'Developer'}
                </span>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-teal-600 text-zinc-950 font-medium rounded-br-none'
                      : 'bg-zinc-850 text-zinc-200 border border-zinc-800 rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSendChatMessage} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your message to the developer..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={isSendingChat || !chatInput.trim()}
            className="p-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold rounded-xl transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* DATA MANAGEMENT */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-3">
        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Data & Privacy Management
        </h4>

        <div className="flex flex-col gap-2">
          {onOpenDescription && (
            <button
              onClick={onOpenDescription}
              className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-850 border border-teal-500/30 rounded-xl text-xs font-medium text-teal-300 flex items-center justify-center gap-2 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-teal-400" />
              View Caloriq website & description page
            </button>
          )}

          <a
            href="/privacy"
            onClick={(e) => {
              if (onOpenPrivacy) {
                e.preventDefault();
                onOpenPrivacy();
              }
            }}
            className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            <Shield className="w-4 h-4 text-teal-400" />
            Privacy Policy
          </a>

          <button
            onClick={handleExportData}
            className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 rounded-xl text-xs font-medium text-zinc-300 flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-teal-400" />
            Export all data as JSON
          </button>

          <button
            onClick={handleDownloadStandaloneHtml}
            className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-850 border border-teal-500/30 rounded-xl text-xs font-medium text-teal-300 flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 text-teal-400" />
            Download standalone index.html
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full p-2.5 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/40 text-rose-300 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Clear all tracked data
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xs w-full p-5 text-center space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-zinc-100">Clear All Tracking Data?</h5>
              <p className="text-xs text-zinc-400 mt-1">
                This will delete all logged meals, exercises, weights, and recipes. This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white shadow-md shadow-rose-600/30"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
