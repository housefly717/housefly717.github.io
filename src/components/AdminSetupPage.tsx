import React, { useState } from 'react';
import { api } from '../services/api.js';

export const AdminSetupPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setIsNotFound(false);

    try {
      const isValid = await api.verifyAdminPassword(password);
      if (isValid) {
        setIsUnlocked(true);
      } else {
        // Prompt rule: "Wrong password shows only 'Not found' (identical to a dead link)."
        setIsNotFound(true);
      }
    } catch {
      setIsNotFound(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.saveAdminUsdaKey(password, apiKeyInput.trim());
      // Prompt rule: "After saving, shows 'Saved. You can close this page.' and clears the input.
      // The key saves to a settings table as a single row. Never displayed back. Never logged. Never in any response body."
      setSuccessMessage(res.message || 'Saved. You can close this page.');
      setApiKeyInput('');
    } catch (err: any) {
      if (err.message === 'Not found') {
        setIsNotFound(true);
      } else {
        setErrorMessage(err.message || 'Failed to save USDA key');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // If wrong password, show only "Not found" identical to dead link
  if (isNotFound) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 flex items-center justify-center p-4">
        <div className="text-center font-mono">
          <h1 className="text-xl font-bold mb-2">404</h1>
          <p className="text-sm text-zinc-500">Not found</p>
        </div>
      </div>
    );
  }

  // Initial password gate (password checked strictly by backend)
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xs w-full p-6 shadow-2xl">
          <form onSubmit={handleVerifyPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                Authentication Required
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                required
                autoFocus
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-semibold py-2 rounded-xl text-xs transition-colors"
            >
              {isSubmitting ? 'Verifying...' : 'Access'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Unlocked Admin Form
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
        <h2 className="text-sm font-bold text-zinc-100 font-mono">
          USDA FoodData Central Configuration
        </h2>

        {successMessage ? (
          <div className="p-3 bg-teal-950/60 border border-teal-800/80 rounded-xl text-xs text-teal-300 font-mono text-center">
            {successMessage}
          </div>
        ) : (
          <form onSubmit={handleSaveApiKey} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1.5">
                USDA API Key
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste key here..."
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-teal-500 font-mono"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                The key will be stored securely and never transmitted back.
              </span>
            </div>

            {errorMessage && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !apiKeyInput.trim()}
              className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-zinc-950 font-bold py-2.5 rounded-xl text-xs transition-colors shadow-lg shadow-teal-500/20"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
