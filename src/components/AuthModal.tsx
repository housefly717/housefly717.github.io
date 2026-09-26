import React, { useState } from 'react';
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
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      const res = await api.sendOtp(email);
      setStep('otp');
      setStatusMsg(res.message);
      if (res.previewCode) {
        setPreviewCode(res.previewCode);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      setErrorMsg('Please enter the 6-digit code');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    try {
      const res = await api.verifyOtp(email, otpCode);
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
        setPreviewCode(null);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code');
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

        {previewCode && (
          <div className="mb-4 p-2.5 bg-zinc-800/80 border border-zinc-700 rounded-xl text-xs text-zinc-300 flex items-center justify-between">
            <span>Dev Verification Code:</span>
            <code className="font-mono text-teal-300 font-semibold bg-zinc-900 px-2 py-0.5 rounded">
              {previewCode}
            </code>
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
                  Sending code...
                </>
              ) : (
                <>
                  Send OTP Code
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
                  onClick={() => setStep('email')}
                  className="text-xs text-teal-400 hover:underline"
                >
                  Change email
                </button>
              </div>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  required
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 tracking-widest font-mono"
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
                  Verifying...
                </>
              ) : (
                <>
                  Verify & Sync Account
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
