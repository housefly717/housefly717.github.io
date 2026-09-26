import React, { useState, useEffect } from 'react';
import { Mail, KeyRound, ArrowRight, CheckCircle2, X, RefreshCw, Shield } from 'lucide-react';
import { api } from '../services/api.js';
import { useApp } from '../context/AppContext.js';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, isGuest, userEmail, onAuthSuccess, profile, updateUserProfile } = useApp();
  const [email, setEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isCodeLocked, setIsCodeLocked] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  if (!isAuthModalOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setErrorMsg('Please enter a valid email address');
      return;
    }

    setErrorMsg('');
    setStatusMsg('');
    setIsLoading(true);
    try {
      const res = await api.sendOtp(cleanEmail, false);
      setStep('otp');
      setOtpCode('');
      setIsCodeLocked(false);
      setStatusMsg(res.message);
      setResendCooldown(res.resendCooldownSeconds ?? 30);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    const cleanEmail = email.trim();
    setErrorMsg('');
    setStatusMsg('');
    setIsResending(true);
    try {
      const res = await api.sendOtp(cleanEmail, true);
      setOtpCode('');
      setIsCodeLocked(false);
      setStatusMsg(res.message);
      setResendCooldown(res.resendCooldownSeconds ?? 30);
    } catch (err: any) {
      if (err.retryAfterSeconds) {
        setResendCooldown(err.retryAfterSeconds);
      }
      setErrorMsg(err.message || 'Failed to resend verification code');
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCodeLocked) {
      setErrorMsg('Too many failed attempts. This code is locked. Tap Resend to get a new one.');
      return;
    }
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg("That code isn't right. Check your email and try again.");
      return;
    }

    setErrorMsg('');
    setStatusMsg('');
    setIsLoading(true);
    try {
      const res = await api.verifyOtp(email.trim(), otpCode.trim());
      setStatusMsg(res.message);
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
      setTimeout(() => {
        closeAuthModal();
        setStep('email');
        setOtpCode('');
        setReferralCode('');
        setErrorMsg('');
        setStatusMsg('');
        setIsCodeLocked(false);
      }, 900);
    } catch (err: any) {
      if (err.reason === 'locked') {
        setIsCodeLocked(true);
      }
      setErrorMsg(err.message || "That code isn't right. Check your email and try again.");
    } finally {
      setIsLoading(false);
    }
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
              {isGuest ? 'Save Account & Sync Devices' : 'Account Details'}
            </h3>
            <p className="text-xs text-zinc-400">
              {isGuest ? 'Your guest data will automatically transfer.' : `Logged in as ${userEmail}`}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div className="mb-4 p-2.5 bg-teal-950/60 border border-teal-900/60 rounded-xl text-xs text-teal-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
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

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Signing up...
                </>
              ) : (
                <>
                  Sign up
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-400">
                  Enter 6-Digit Code
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setErrorMsg('');
                    setStatusMsg('');
                  }}
                  className="text-xs text-teal-400 hover:underline"
                >
                  Change email
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpCode}
                  disabled={isCodeLocked}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 tracking-widest font-mono disabled:opacity-50"
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-zinc-500">
                  Code expires in 10 minutes
                </span>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isResending}
                  className="text-xs font-medium text-teal-400 hover:text-teal-300 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
                >
                  {isResending
                    ? 'Sending...'
                    : resendCooldown > 0
                    ? `Resend (${resendCooldown}s)`
                    : 'Resend'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isCodeLocked}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-teal-500/20"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  Verify
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
