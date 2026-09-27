import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, X, RefreshCw, Shield, LogOut } from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.js';

interface AuthModalProps {
  onAuthComplete?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onAuthComplete }) => {
  const {
    isAuthModalOpen,
    closeAuthModal,
    isGuest,
    userEmail,
    onAuthSuccess,
    profile,
    updateUserProfile,
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

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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
        await api.signup(cleanEmail, password, rememberMe);
      } else {
        await api.login(cleanEmail, password, rememberMe);
      }

      await onAuthSuccess();

      if (mode === 'signup' && referralCode.trim()) {
        const cleanRef = referralCode.trim().toUpperCase();
        const used = profile.usedReferrals || [];
        if (!used.includes(cleanRef)) {
          await updateUserProfile({
            xp: (profile.xp || 0) + 500,
            usedReferrals: [...used, cleanRef]
          });
        }
      }

      closeAuthModal();
      setEmail('');
      setPassword('');
      setReferralCode('');
      setErrorMsg('');

      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', '/dashboard');
      }
      if (onAuthComplete) {
        onAuthComplete();
      }
    } catch (err: any) {
      setErrorMsg(err.message || (mode === 'signup' ? 'Failed to create account.' : 'Invalid email or password.'));
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

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
        <button
          onClick={closeAuthModal}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1 rounded-lg"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

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

            <form onSubmit={handleSubmit} className="space-y-4">
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
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Password
                </label>
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
      </div>
    </div>
  );
};
