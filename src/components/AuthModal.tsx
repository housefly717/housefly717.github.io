import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Lock, ArrowRight, ArrowLeft, X, RefreshCw, Shield, LogOut, Check } from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.js';
import {
  hasCompleteProfileStats,
  calculateBmr,
  calculateMaintenanceCalories,
  calculateDailyCalorieTarget,
  calculateMacroTargets,
  calculateProjectedGoalDate
} from '../utils/nutritionMath.js';
import type { UserProfile } from '../types/index.js';

interface AuthModalProps {
  onAuthComplete?: () => void;
}

type SignupFlowStage =
  | 'credentials'
  | 'verify_code'
  | 'forgot_password'
  | 'reset_password'
  | 'intro'
  | 'questions'
  | 'final';

interface SignupDraft {
  flowStage: SignupFlowStage;
  questionStep: number; // 1 to 8
  name: string;
  age: string;
  gender: 'female' | 'male' | 'prefer_not_to_say' | '';
  heightUnit: 'metric' | 'imperial';
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weightUnit: 'metric' | 'imperial';
  currentWeight: string;
  goalWeight: string;
  dailyActivity: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete' | '';
  goalSpeed: 'lose_normal' | 'maintain' | 'gain_slow' | '';
}

const EMPTY_DRAFT: SignupDraft = {
  flowStage: 'intro',
  questionStep: 1,
  name: '',
  age: '',
  gender: '',
  heightUnit: 'metric',
  heightCm: '',
  heightFt: '',
  heightIn: '',
  weightUnit: 'metric',
  currentWeight: '',
  goalWeight: '',
  dailyActivity: '',
  goalSpeed: ''
};

export const AuthModal: React.FC<AuthModalProps> = ({ onAuthComplete }) => {
  const {
    userId,
    isAuthModalOpen,
    closeAuthModal,
    isGuest,
    userEmail,
    onAuthSuccess,
    profile,
    updateUserProfile,
    addWeightLog,
    resetGuestSession
  } = useApp();

  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    const saved = localStorage.getItem('caloriq_remember_me');
    return saved !== null ? saved === 'true' : true;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Email verification & password reset state
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isCodeLocked, setIsCodeLocked] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetSentSuccess, setResetSentSuccess] = useState(false);

  // Multi-step signup state
  const [flowStage, setFlowStage] = useState<SignupFlowStage>('credentials');
  const [questionStep, setQuestionStep] = useState<number>(1);
  const [draft, setDraft] = useState<SignupDraft>(EMPTY_DRAFT);
  const [savedMidFlowNotice, setSavedMidFlowNotice] = useState<string | null>(null);
  const [showClosePrompt, setShowClosePrompt] = useState(false);

  // 30-second countdown timer for Resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const draftStorageKey = useMemo(() => {
    const keyId = userId || email.trim().toLowerCase() || 'pending';
    return `caloriq_signup_draft_${keyId}`;
  }, [userId, email]);

  // Load saved draft if user is signed in, or check URL for password reset link
  useEffect(() => {
    if (!isAuthModalOpen) {
      setShowClosePrompt(false);
      setSavedMidFlowNotice(null);
      return;
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('resetToken');
      const emailParam = params.get('email');
      if (tokenParam && emailParam) {
        setEmail(emailParam);
        setResetToken(tokenParam);
        setFlowStage('reset_password');
        return;
      }
    }

    if (!isGuest && !hasCompleteProfileStats(profile)) {
      try {
        const raw = localStorage.getItem(`caloriq_signup_draft_${userId}`);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<SignupDraft>;
          const merged: SignupDraft = { ...EMPTY_DRAFT, ...parsed };
          setDraft(merged);
          setFlowStage(
            merged.flowStage === 'credentials' ||
              merged.flowStage === 'verify_code' ||
              merged.flowStage === 'forgot_password' ||
              merged.flowStage === 'reset_password'
              ? 'intro'
              : merged.flowStage
          );
          setQuestionStep(merged.questionStep >= 1 && merged.questionStep <= 8 ? merged.questionStep : 1);
          return;
        }
      } catch {
        // ignore
      }
      setDraft(EMPTY_DRAFT);
      setFlowStage('intro');
      setQuestionStep(1);
    } else if (isGuest) {
      setFlowStage('credentials');
    }
  }, [isAuthModalOpen, isGuest, profile, userId]);

  // Persist draft whenever it changes during intro/questions/final
  const saveDraftState = (nextDraft: SignupDraft, nextStage?: SignupFlowStage, nextStep?: number) => {
    const updated: SignupDraft = {
      ...nextDraft,
      flowStage: nextStage ?? nextDraft.flowStage,
      questionStep: nextStep ?? nextDraft.questionStep
    };
    setDraft(updated);
    try {
      if (userId) {
        localStorage.setItem(`caloriq_signup_draft_${userId}`, JSON.stringify(updated));
      }
      localStorage.setItem(draftStorageKey, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // Convert draft height/weight into metric cm and kg for calculation
  const computedHeightCm = useMemo(() => {
    if (draft.heightUnit === 'metric') {
      const cm = parseFloat(draft.heightCm);
      return !isNaN(cm) && cm > 0 ? Math.round(cm * 10) / 10 : 0;
    } else {
      const ft = parseFloat(draft.heightFt);
      const inches = parseFloat(draft.heightIn || '0');
      if (isNaN(ft) || ft <= 0) return 0;
      const totalInches = ft * 12 + (isNaN(inches) ? 0 : inches);
      return totalInches > 0 ? Math.round(totalInches * 2.54 * 10) / 10 : 0;
    }
  }, [draft.heightUnit, draft.heightCm, draft.heightFt, draft.heightIn]);

  const computedCurrentWeightKg = useMemo(() => {
    const val = parseFloat(draft.currentWeight);
    if (isNaN(val) || val <= 0) return 0;
    return draft.weightUnit === 'metric'
      ? Math.round(val * 10) / 10
      : Math.round((val / 2.20462) * 10) / 10;
  }, [draft.weightUnit, draft.currentWeight]);

  const computedGoalWeightKg = useMemo(() => {
    const val = parseFloat(draft.goalWeight);
    if (isNaN(val) || val <= 0) return 0;
    return draft.weightUnit === 'metric'
      ? Math.round(val * 10) / 10
      : Math.round((val / 2.20462) * 10) / 10;
  }, [draft.weightUnit, draft.goalWeight]);

  const candidateProfile: UserProfile = useMemo(() => {
    const parsedAge = parseInt(draft.age, 10);
    return {
      ...profile,
      name: draft.name.trim(),
      age: !isNaN(parsedAge) ? parsedAge : 0,
      gender: draft.gender,
      heightCm: computedHeightCm,
      currentWeightKg: computedCurrentWeightKg,
      goalWeightKg: computedGoalWeightKg,
      dailyActivity: draft.dailyActivity,
      goalSpeed: draft.goalSpeed,
      unitSystem: draft.weightUnit
    };
  }, [
    profile,
    draft.name,
    draft.age,
    draft.gender,
    computedHeightCm,
    computedCurrentWeightKg,
    computedGoalWeightKg,
    draft.dailyActivity,
    draft.goalSpeed,
    draft.weightUnit
  ]);

  const allQuestionsComplete = useMemo(
    () => hasCompleteProfileStats(candidateProfile),
    [candidateProfile]
  );

  const calculatedBmr = useMemo(
    () => (allQuestionsComplete ? calculateBmr(candidateProfile) : 0),
    [allQuestionsComplete, candidateProfile]
  );
  const calculatedMaintenance = useMemo(
    () => (allQuestionsComplete ? calculateMaintenanceCalories(candidateProfile) : 0),
    [allQuestionsComplete, candidateProfile]
  );
  const calculatedTarget = useMemo(
    () => (allQuestionsComplete ? calculateDailyCalorieTarget(candidateProfile) : 0),
    [allQuestionsComplete, candidateProfile]
  );
  const calculatedMacros = useMemo(
    () => (allQuestionsComplete ? calculateMacroTargets(calculatedTarget) : calculateMacroTargets(0)),
    [allQuestionsComplete, calculatedTarget]
  );
  const calculatedGoalDate = useMemo(
    () => (allQuestionsComplete ? calculateProjectedGoalDate(candidateProfile) : ''),
    [allQuestionsComplete, candidateProfile]
  );

  if (!isAuthModalOpen) return null;

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    localStorage.setItem('caloriq_remember_me', String(rememberMe));
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const res = await api.sendSignupVerificationCode(cleanEmail, password);
        setVerificationCode('');
        setIsCodeLocked(false);
        setResendCooldown(res.resendCooldownSeconds || 30);
        setFlowStage('verify_code');
        return;
      } else {
        await api.login(cleanEmail, password, rememberMe);
      }

      await onAuthSuccess();

      setEmail('');
      setPassword('');
      setReferralCode('');
      setErrorMsg('');

      closeAuthModal();
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/dashboard');
      }
      if (onAuthComplete) {
        onAuthComplete();
      }
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          (mode === 'signup'
            ? "Couldn't send the email. Try again in a minute."
            : 'Invalid email or password.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifySignupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeLocked) {
      setErrorMsg('Too many attempts. This code is locked. Tap Resend for a new code.');
      return;
    }
    const cleanCode = verificationCode.trim();
    if (!cleanCode) {
      setErrorMsg("That code isn't right. Check your email and try again.");
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      await api.verifySignupCode(email.trim(), password, cleanCode, rememberMe);
      await onAuthSuccess();

      if (referralCode.trim()) {
        const cleanRef = referralCode.trim().toUpperCase();
        const used = profile.usedReferrals || [];
        if (!used.includes(cleanRef)) {
          await updateUserProfile({
            xp: (profile.xp || 0) + 500,
            usedReferrals: [...used, cleanRef]
          });
        }
      }

      setEmail('');
      setPassword('');
      setVerificationCode('');
      setReferralCode('');
      setErrorMsg('');

      const freshDraft: SignupDraft = { ...EMPTY_DRAFT, flowStage: 'intro', questionStep: 1 };
      saveDraftState(freshDraft, 'intro', 1);
      setFlowStage('intro');
      setQuestionStep(1);
    } catch (err: any) {
      if (err.locked || err.reason === 'locked') {
        setIsCodeLocked(true);
      }
      setErrorMsg(err.message || "That code isn't right. Check your email and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (resendCooldown > 0 || isLoading) return;
    setErrorMsg('');
    setIsLoading(true);
    try {
      const res = await api.sendSignupVerificationCode(email.trim(), password);
      setVerificationCode('');
      setIsCodeLocked(false);
      setResendCooldown(res.resendCooldownSeconds || 30);
    } catch (err: any) {
      if (err.retryAfterSeconds) {
        setResendCooldown(err.retryAfterSeconds);
      }
      setErrorMsg(err.message || "Couldn't send the email. Try again in a minute.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setErrorMsg('');
    setResetSentSuccess(false);
    setIsLoading(true);
    try {
      await api.requestPasswordReset(cleanEmail);
      setResetSentSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Couldn't send the email. Try again in a minute.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResetPassword || newResetPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);
    try {
      await api.resetPassword(email.trim(), resetToken, newResetPassword, rememberMe);
      await onAuthSuccess();
      setNewResetPassword('');
      setResetToken('');
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/dashboard');
      }
      closeAuthModal();
      if (onAuthComplete) {
        onAuthComplete();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current question step has a valid answer
  const isCurrentStepValid = (): boolean => {
    switch (questionStep) {
      case 1:
        return draft.name.trim().length > 0;
      case 2: {
        const n = Number(draft.age);
        return Number.isInteger(n) && n >= 13 && n <= 120;
      }
      case 3:
        return (
          draft.gender === 'female' ||
          draft.gender === 'male' ||
          draft.gender === 'prefer_not_to_say'
        );
      case 4:
        return computedHeightCm >= 80 && computedHeightCm <= 270;
      case 5:
        return computedCurrentWeightKg >= 20 && computedCurrentWeightKg <= 400;
      case 6:
        return computedGoalWeightKg >= 20 && computedGoalWeightKg <= 400;
      case 7:
        return Boolean(draft.dailyActivity);
      case 8:
        return Boolean(draft.goalSpeed);
      default:
        return false;
    }
  };

  const handleNextQuestion = () => {
    setErrorMsg('');
    if (!isCurrentStepValid()) {
      setErrorMsg('Please answer this question to continue.');
      return;
    }
    setSavedMidFlowNotice(null);
    setShowClosePrompt(false);

    if (questionStep < 8) {
      const nextStep = questionStep + 1;
      setQuestionStep(nextStep);
      saveDraftState(draft, 'questions', nextStep);
    } else {
      setFlowStage('final');
      saveDraftState(draft, 'final', 8);
    }
  };

  const handleMidFlowBack = () => {
    setErrorMsg('');
    setSavedMidFlowNotice('Your answers are saved. Come back anytime to finish.');
    if (flowStage === 'final') {
      setFlowStage('questions');
      setQuestionStep(8);
      saveDraftState(draft, 'questions', 8);
    } else if (flowStage === 'questions' && questionStep > 1) {
      const prevStep = questionStep - 1;
      setQuestionStep(prevStep);
      saveDraftState(draft, 'questions', prevStep);
    } else if (flowStage === 'questions' && questionStep === 1) {
      setFlowStage('intro');
      saveDraftState(draft, 'intro', 1);
    }
  };

  const handleAttemptCloseMidFlow = () => {
    if (flowStage === 'intro' || flowStage === 'questions' || flowStage === 'final') {
      saveDraftState(draft, flowStage, questionStep);
      setSavedMidFlowNotice('Your answers are saved. Come back anytime to finish.');
      setShowClosePrompt(true);
      return;
    }
    closeAuthModal();
  };

  const handleSaveAndStart = async () => {
    if (!allQuestionsComplete) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      await updateUserProfile({
        name: candidateProfile.name,
        age: candidateProfile.age,
        gender: candidateProfile.gender,
        heightCm: candidateProfile.heightCm,
        currentWeightKg: candidateProfile.currentWeightKg,
        goalWeightKg: candidateProfile.goalWeightKg,
        dailyActivity: candidateProfile.dailyActivity,
        goalSpeed: candidateProfile.goalSpeed,
        unitSystem: candidateProfile.unitSystem
      });

      if (candidateProfile.currentWeightKg > 0) {
        try {
          await addWeightLog(candidateProfile.currentWeightKg);
        } catch {
          // ignore
        }
      }

      try {
        if (userId) {
          localStorage.removeItem(`caloriq_signup_draft_${userId}`);
        }
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }

      setShowClosePrompt(false);
      setSavedMidFlowNotice(null);
      closeAuthModal();

      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/dashboard');
      }
      if (onAuthComplete) {
        onAuthComplete();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not save profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    api.clearToken();
    localStorage.removeItem('caloriq_user_email');
    await resetGuestSession();
    closeAuthModal();
  };

  const isInSignupQuestionnaire =
    !isGuest && (flowStage === 'intro' || flowStage === 'questions' || flowStage === 'final');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative my-auto">
        <button
          type="button"
          onClick={handleAttemptCloseMidFlow}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Saved answers notice when going back or attempting to close mid-flow */}
        {savedMidFlowNotice && (
          <div className="mb-4 p-3 bg-teal-950/50 border border-teal-500/40 rounded-xl text-xs text-teal-200 space-y-2">
            <p className="font-medium">{savedMidFlowNotice}</p>
            {showClosePrompt && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowClosePrompt(false);
                    setSavedMidFlowNotice(null);
                  }}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold rounded-lg text-xs transition-colors"
                >
                  Continue questions
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowClosePrompt(false);
                    closeAuthModal();
                  }}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg text-xs transition-colors"
                >
                  Close for now
                </button>
              </div>
            )}
          </div>
        )}

        {/* ==================== INTRO SCREEN ==================== */}
        {isInSignupQuestionnaire && flowStage === 'intro' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-zinc-100">
                A few questions before we start
              </h3>
            </div>

            <div className="space-y-3 text-xs text-zinc-300 leading-relaxed bg-zinc-950/80 border border-zinc-800 rounded-xl p-4">
              <p>Caloriq needs a few details about your body to work.</p>
              <p>
                We use them for one thing: calculating your daily calorie target and how many calories you burn during exercise. That&apos;s the Mifflin-St Jeor formula — the standard way to work out how much energy your body needs at rest.
              </p>
              <p>
                Without these numbers, we can&apos;t show you a target. The app would just be a blank page.
              </p>
              <div className="pt-1">
                <p className="font-semibold text-zinc-200 mb-1.5">Where your data goes:</p>
                <ul className="space-y-1 text-zinc-400">
                  <li>- It stays in your account, on our servers (Google Firebase)</li>
                  <li>- Only you can see it</li>
                  <li>- We don&apos;t sell it</li>
                  <li>- We don&apos;t share it with advertisers</li>
                  <li>- You can delete it at any time from the Me tab</li>
                </ul>
              </div>
              <p className="text-teal-400 font-medium pt-1">This takes about 90 seconds.</p>
            </div>

            <div className="space-y-2.5 pt-1 text-center">
              <button
                type="button"
                onClick={() => {
                  setSavedMidFlowNotice(null);
                  setShowClosePrompt(false);
                  setFlowStage('questions');
                  setQuestionStep(1);
                  saveDraftState(draft, 'questions', 1);
                }}
                className="w-full bg-teal-500 hover:bg-teal-400 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
              >
                Start
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[11px] text-zinc-400 hover:text-teal-400 underline transition-colors"
              >
                Read our Privacy Policy
              </a>
            </div>
          </div>
        )}

        {/* ==================== 8 QUESTION SCREENS ==================== */}
        {isInSignupQuestionnaire && flowStage === 'questions' && (
          <div className="space-y-5">
            {/* Progress Bar Header */}
            <div className="space-y-2 pr-6">
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleMidFlowBack}
                  className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-xs font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
                <span className="font-mono text-xs font-semibold text-teal-400">
                  {questionStep} of 8
                </span>
              </div>
              <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                <div
                  className="h-full bg-teal-500 transition-all duration-300 rounded-full"
                  style={{ width: `${(questionStep / 8) * 100}%` }}
                />
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {/* Question 1: Name */}
            {questionStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    What should we call you?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    So the app can greet you. Nothing else.
                  </p>
                </div>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => saveDraftState({ ...draft, name: e.target.value })}
                  placeholder="Enter your name"
                  autoFocus
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
              </div>
            )}

            {/* Question 2: Age */}
            {questionStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    How old are you?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Age is one of the five inputs in the calorie formula. Your body needs fewer calories as you age.
                  </p>
                </div>
                <input
                  type="number"
                  min={13}
                  max={120}
                  value={draft.age}
                  onChange={(e) => saveDraftState({ ...draft, age: e.target.value })}
                  placeholder="Age (13–120)"
                  autoFocus
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                />
                {draft.age !== '' && Number(draft.age) > 0 && Number(draft.age) < 18 && (
                  <div className="p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-xl text-xs text-amber-300">
                    Use Caloriq with a parent or guardian.
                  </div>
                )}
              </div>
            )}

            {/* Question 3: Gender */}
            {questionStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    What&apos;s your gender?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    The male and female calorie formulas are different. Knowing which one to use gets you a more accurate target.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                    { value: 'prefer_not_to_say', label: 'Prefer not to say' }
                  ].map((option) => {
                    const selected = draft.gender === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          saveDraftState({
                            ...draft,
                            gender: option.value as SignupDraft['gender']
                          })
                        }
                        className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                          selected
                            ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <span>{option.label}</span>
                        {selected && <Check className="w-4 h-4 text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Question 4: Height */}
            {questionStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-zinc-100">
                      How tall are you?
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Height is one of the five inputs in the calorie formula.
                    </p>
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, heightUnit: 'metric' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.heightUnit === 'metric'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      cm
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, heightUnit: 'imperial' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.heightUnit === 'imperial'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      ft / in
                    </button>
                  </div>
                </div>

                {draft.heightUnit === 'metric' ? (
                  <div className="relative">
                    <input
                      type="number"
                      min={80}
                      max={270}
                      step="any"
                      value={draft.heightCm}
                      onChange={(e) => saveDraftState({ ...draft, heightCm: e.target.value })}
                      placeholder="Height in cm"
                      autoFocus
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-12 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs font-mono text-zinc-500">
                      cm
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="number"
                        min={3}
                        max={8}
                        value={draft.heightFt}
                        onChange={(e) => saveDraftState({ ...draft, heightFt: e.target.value })}
                        placeholder="Feet"
                        autoFocus
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-mono text-zinc-500">
                        ft
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={11}
                        value={draft.heightIn}
                        onChange={(e) => saveDraftState({ ...draft, heightIn: e.target.value })}
                        placeholder="Inches"
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-10 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />
                      <span className="absolute right-3.5 top-2.5 text-xs font-mono text-zinc-500">
                        in
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Question 5: Current weight */}
            {questionStep === 5 && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-zinc-100">
                      What do you weigh right now?
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Weight is the biggest input in the calorie formula, and it&apos;s used for exercise burn too.
                    </p>
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, weightUnit: 'metric' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.weightUnit === 'metric'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, weightUnit: 'imperial' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.weightUnit === 'imperial'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      lb
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min={20}
                    max={900}
                    step="0.1"
                    value={draft.currentWeight}
                    onChange={(e) => saveDraftState({ ...draft, currentWeight: e.target.value })}
                    placeholder={`Current weight in ${draft.weightUnit === 'metric' ? 'kg' : 'lb'}`}
                    autoFocus
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-12 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-mono text-zinc-500">
                    {draft.weightUnit === 'metric' ? 'kg' : 'lb'}
                  </span>
                </div>
              </div>
            )}

            {/* Question 6: Goal weight */}
            {questionStep === 6 && (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-zinc-100">
                      What&apos;s your goal weight?
                    </h3>
                    <p className="text-xs text-zinc-400">
                      We use this to estimate when you&apos;ll reach your goal. Not required for the maths, but recommended.
                    </p>
                  </div>
                  <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, weightUnit: 'metric' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.weightUnit === 'metric'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      kg
                    </button>
                    <button
                      type="button"
                      onClick={() => saveDraftState({ ...draft, weightUnit: 'imperial' })}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                        draft.weightUnit === 'imperial'
                          ? 'bg-teal-500 text-zinc-950 font-bold'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      lb
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min={20}
                    max={900}
                    step="0.1"
                    value={draft.goalWeight}
                    onChange={(e) => saveDraftState({ ...draft, goalWeight: e.target.value })}
                    placeholder={`Goal weight in ${draft.weightUnit === 'metric' ? 'kg' : 'lb'}`}
                    autoFocus
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 pr-12 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-mono text-zinc-500">
                    {draft.weightUnit === 'metric' ? 'kg' : 'lb'}
                  </span>
                </div>

                <p className="text-[11px] text-zinc-500">
                  If you&apos;re not sure yet, you can enter your current weight ({draft.currentWeight || '—'}{' '}
                  {draft.weightUnit === 'metric' ? 'kg' : 'lb'}) and change it anytime later.
                </p>
              </div>
            )}

            {/* Question 7: Daily activity level */}
            {questionStep === 7 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    How active are you on a normal day?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    This multiplies your resting rate to work out how many calories you burn in a normal day.
                  </p>
                </div>
                <div className="space-y-2">
                  {[
                    { value: 'sedentary', label: 'Sedentary — desk job, little movement' },
                    { value: 'light', label: 'Lightly active — walks, 1–2 workouts a week' },
                    { value: 'moderate', label: 'Moderately active — 3–5 workouts a week' },
                    { value: 'active', label: 'Very active — 5–6 workouts a week' },
                    { value: 'athlete', label: 'Athlete — daily hard training, physical job' }
                  ].map((option) => {
                    const selected = draft.dailyActivity === option.value;
                    return (
                      <label
                        key={option.value}
                        onClick={() =>
                          saveDraftState({
                            ...draft,
                            dailyActivity: option.value as SignupDraft['dailyActivity']
                          })
                        }
                        className={`w-full px-3.5 py-3 rounded-xl border text-xs flex items-center gap-3 cursor-pointer transition-colors ${
                          selected
                            ? 'bg-teal-500/15 border-teal-500 text-teal-300 font-semibold'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name="dailyActivity"
                          checked={selected}
                          onChange={() =>
                            saveDraftState({
                              ...draft,
                              dailyActivity: option.value as SignupDraft['dailyActivity']
                            })
                          }
                          className="accent-teal-500"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Question 8: Goal */}
            {questionStep === 8 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-zinc-100">
                    What are you here to do?
                  </h3>
                  <p className="text-xs text-zinc-400">
                    This sets whether your daily target goes down, stays the same, or goes up.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'lose_normal', label: 'Lose fat — about 0.5 kg per week' },
                    { value: 'maintain', label: 'Maintain — eat at your maintenance' },
                    { value: 'gain_slow', label: 'Build muscle — small lean surplus' }
                  ].map((option) => {
                    const selected = draft.goalSpeed === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          saveDraftState({
                            ...draft,
                            goalSpeed: option.value as SignupDraft['goalSpeed']
                          })
                        }
                        className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                          selected
                            ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        <span>{option.label}</span>
                        {selected && <Check className="w-4 h-4 text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Single Action Button: Continue (steps 1-7) or See my plan (step 8) */}
            <button
              type="button"
              disabled={!isCurrentStepValid()}
              onClick={handleNextQuestion}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
            >
              <span>{questionStep === 8 ? 'See my plan' : 'Continue'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ==================== FINAL SCREEN ==================== */}
        {isInSignupQuestionnaire && flowStage === 'final' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pr-6">
              <button
                type="button"
                onClick={handleMidFlowBack}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-xs font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <span className="font-mono text-xs text-teal-400 font-semibold">Complete</span>
            </div>

            <h3 className="text-lg font-bold text-zinc-100">
              Here&apos;s what we calculated
            </h3>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {allQuestionsComplete && (
              <div className="space-y-2.5">
                {calculatedBmr > 0 && (
                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">BMR</span>
                      <span className="text-[11px] text-zinc-400">Your body burns this much at rest</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-zinc-100">
                      {calculatedBmr} kcal
                    </span>
                  </div>
                )}

                {calculatedMaintenance > 0 && (
                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">Maintenance</span>
                      <span className="text-[11px] text-zinc-400">What you burn on a normal day</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-zinc-100">
                      {calculatedMaintenance} kcal
                    </span>
                  </div>
                )}

                {calculatedTarget > 0 && (
                  <div className="p-3 bg-teal-950/30 border border-teal-500/40 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-teal-300 block">Daily target</span>
                      <span className="text-[11px] text-zinc-400">What we&apos;re aiming for</span>
                    </div>
                    <span className="font-mono text-base font-extrabold text-teal-400">
                      {calculatedTarget} kcal
                    </span>
                  </div>
                )}

                {calculatedTarget > 0 && (
                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">
                        Protein, carbs, fat
                      </span>
                      <span className="text-[11px] text-zinc-400">Your daily macros</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs pt-1">
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                        <span className="text-[10px] text-red-400 block">Protein</span>
                        <span className="font-bold text-zinc-100">{calculatedMacros.proteinGrams}g</span>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                        <span className="text-[10px] text-blue-400 block">Carbs</span>
                        <span className="font-bold text-zinc-100">{calculatedMacros.carbsGrams}g</span>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                        <span className="text-[10px] text-amber-400 block">Fat</span>
                        <span className="font-bold text-zinc-100">{calculatedMacros.fatGrams}g</span>
                      </div>
                    </div>
                  </div>
                )}

                {calculatedGoalDate && (
                  <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">
                        Projected goal date
                      </span>
                      <span className="text-[11px] text-zinc-400">If you stick to the target</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-teal-300 text-right">
                      {calculatedGoalDate}
                    </span>
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-zinc-400 text-center pt-1">
              You can change any of this in the Me tab.
            </p>

            <button
              type="button"
              disabled={isLoading || !allQuestionsComplete}
              onClick={handleSaveAndStart}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save and start
                </>
              )}
            </button>
          </div>
        )}

        {/* ==================== EMAIL VERIFICATION CODE SCREEN ==================== */}
        {!isInSignupQuestionnaire && flowStage === 'verify_code' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pr-6">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setFlowStage('credentials');
                }}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-xs font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
              <span className="font-mono text-xs text-teal-400 font-semibold">Verify Email</span>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-100">
                Enter your verification code
              </h3>
              <p className="text-xs text-zinc-400">
                We sent a 6-digit code to <span className="text-zinc-200 font-medium">{email}</span>. This code expires in 10 minutes.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleVerifySignupCode} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  disabled={isCodeLocked || isLoading}
                  autoFocus
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-center text-lg font-mono tracking-[0.35em] text-zinc-100 placeholder:text-zinc-700 focus:outline-none focus:border-teal-500 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || isCodeLocked || verificationCode.trim().length !== 6}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify and continue
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center pt-1">
              <button
                type="button"
                disabled={resendCooldown > 0 || isLoading}
                onClick={handleResendVerificationCode}
                className="text-xs font-medium text-teal-400 hover:text-teal-300 disabled:text-zinc-500 disabled:no-underline underline transition-colors"
              >
                {resendCooldown > 0 ? `Resend available in ${resendCooldown}s` : 'Resend'}
              </button>
            </div>
          </div>
        )}

        {/* ==================== FORGOT PASSWORD SCREEN ==================== */}
        {!isInSignupQuestionnaire && flowStage === 'forgot_password' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pr-6">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setResetSentSuccess(false);
                  setFlowStage('credentials');
                }}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1 text-xs font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-100">Reset your password</h3>
              <p className="text-xs text-zinc-400">
                Enter your account email and we&apos;ll send you a password reset link.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            {resetSentSuccess ? (
              <div className="p-3 bg-teal-950/40 border border-teal-500/40 rounded-xl text-xs text-teal-200 space-y-2">
                <p>Password reset link sent to {email}. Check your inbox.</p>
              </div>
            ) : (
              <form onSubmit={handleSendPasswordReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sending reset link...
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ==================== RESET PASSWORD (FROM EMAIL LINK) SCREEN ==================== */}
        {!isInSignupQuestionnaire && flowStage === 'reset_password' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-100">Choose a new password</h3>
              <p className="text-xs text-zinc-400">
                Setting a new password for <span className="text-zinc-200 font-medium">{email}</span>.
              </p>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleConfirmPasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    minLength={6}
                    required
                    autoFocus
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save new password
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ==================== CREDENTIALS / ACCOUNT DETAILS SCREEN ==================== */}
        {!isInSignupQuestionnaire && flowStage === 'credentials' && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  {isGuest ? (mode === 'signup' ? 'Create Account' : 'Member Sign In') : 'Account Details'}
                </h3>
                <p className="text-xs text-zinc-400">
                  {isGuest ? 'Your guest data will automatically transfer.' : `Signed in as ${userEmail}`}
                </p>
              </div>
            </div>

            {!isGuest ? (
              <div className="space-y-4">
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-300 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-zinc-500 block">Signed-in Email</span>
                  <span className="font-semibold text-zinc-100">{userEmail}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out to Guest Mode
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-800 mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMsg('');
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      mode === 'signup' ? 'bg-teal-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Sign up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMsg('');
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      mode === 'login' ? 'bg-teal-500 text-zinc-950' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Log in
                  </button>
                </div>

                {errorMsg && (
                  <div className="mb-4 p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                    {errorMsg}
                  </div>
                )}

                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-zinc-400">
                        Password
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg('');
                            setResetSentSuccess(false);
                            setFlowStage('forgot_password');
                          }}
                          className="text-[11px] text-teal-400 hover:text-teal-300 underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        minLength={6}
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>

                  {mode === 'signup' && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                        Referral Code (Optional — +500 XP)
                      </label>
                      <input
                        type="text"
                        value={referralCode}
                        onChange={(e) => setReferralCode(e.target.value)}
                        placeholder="e.g. CQ7A9B2"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono uppercase placeholder:normal-case text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="accent-teal-500 rounded w-3.5 h-3.5"
                    />
                    <span>Remember me</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                      </>
                    ) : (
                      <>
                        {mode === 'signup' ? 'Sign up' : 'Log in'}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};
