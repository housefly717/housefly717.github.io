import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { DevBanner } from './components/DevBanner.js';
import { Navigation, TabType } from './components/Navigation.js';
import { DiaryTab } from './components/DiaryTab.js';
import { FitnessTab } from './components/FitnessTab.js';
import { PlanTab } from './components/PlanTab.js';
import { ReportsTab } from './components/ReportsTab.js';
import { MeTab } from './components/MeTab.js';
import { AddFoodModal } from './components/AddFoodModal.js';
import { AuthModal } from './components/AuthModal.js';
import { OnboardingModal } from './components/OnboardingModal.js';
import { WeeklyRecapModal } from './components/WeeklyRecapModal.js';
import { LegalFooter } from './components/LegalFooter.js';
import { AdminSetupPage } from './components/AdminSetupPage.js';
import { DescriptionPage } from './components/DescriptionPage.js';

interface MainAppContentProps {
  onOpenDescription: () => void;
  initialTab?: TabType;
  autoOpenAuth?: boolean;
}

const MainAppContent: React.FC<MainAppContentProps> = ({
  onOpenDescription,
  initialTab = 'diary',
  autoOpenAuth = false
}) => {
  const [currentTab, setCurrentTab] = useState<TabType>(initialTab);
  const {
    isAddFoodOpen,
    closeAddFood,
    selectedMealForAdd,
    isLoading,
    openAuthModal,
    undoToast,
    dismissUndoToast,
    isOnline,
    offlineQueueCount
  } = useApp();

  useEffect(() => {
    if (autoOpenAuth) {
      openAuthModal();
    }
  }, [autoOpenAuth, openAuthModal]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-400 gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
        <span className="text-xs font-mono tracking-wider">CALORIQ SYNC</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-teal-500/20 selection:text-teal-300">
      <DevBanner />
      <Navigation
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onOpenDescription={onOpenDescription}
      />

      {(!isOnline || offlineQueueCount > 0) && (
        <div className="max-w-md mx-auto w-full px-4 pt-2">
          <div className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-800/50 text-[11px] text-amber-300 flex items-center justify-between font-mono">
            <span>
              {!isOnline
                ? 'Offline Mode — logs saved locally & sync automatically when online'
                : `Syncing ${offlineQueueCount} offline entry(s)...`}
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pt-4 pb-20 max-w-md mx-auto w-full">
        {currentTab === 'diary' && (
          <DiaryTab onNavigateToFitness={() => setCurrentTab('fitness')} />
        )}
        {currentTab === 'fitness' && <FitnessTab />}
        {currentTab === 'plan' && <PlanTab />}
        {currentTab === 'reports' && <ReportsTab />}
        {currentTab === 'me' && <MeTab onOpenDescription={onOpenDescription} />}

        <LegalFooter />
      </main>

      {/* #58 5-second Undo Toast */}
      {undoToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] bg-zinc-900 border border-teal-500/40 rounded-xl px-4 py-2.5 shadow-2xl flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-200 truncate">{undoToast.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={async () => {
                await undoToast.onUndo();
                dismissUndoToast();
              }}
              className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={dismissUndoToast}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <OnboardingModal />
      <WeeklyRecapModal />
      <AuthModal />
      {isAddFoodOpen && (
        <AddFoodModal
          isOpen={isAddFoodOpen}
          onClose={closeAddFood}
          defaultMeal={selectedMealForAdd || 'breakfast'}
        />
      )}
    </div>
  );
};

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const [activeView, setActiveView] = useState<'landing' | 'app'>(() => {
    // If explicit query ?view=app or path is /app, go to app
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'app' || window.location.pathname === '/app') {
      return 'app';
    }
    return 'landing';
  });

  const [initialTab, setInitialTab] = useState<TabType>('diary');
  const [autoOpenAuth, setAutoOpenAuth] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'app' || window.location.pathname === '/app') {
        setActiveView('app');
      } else {
        setActiveView('landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Hidden admin-setup route
  if (pathname === '/admin-setup') {
    return <AdminSetupPage />;
  }

  const handleOpenApp = (action?: 'guest' | 'login' | 'program', programSlug?: string) => {
    if (action === 'login') {
      setAutoOpenAuth(true);
    } else {
      setAutoOpenAuth(false);
    }

    if (action === 'program') {
      setInitialTab('plan');
    } else {
      setInitialTab('diary');
    }

    setActiveView('app');
    window.history.pushState({}, '', '/app');
  };

  const handleOpenDescription = () => {
    setActiveView('landing');
    window.history.pushState({}, '', '/');
  };

  if (activeView === 'landing') {
    return <DescriptionPage onOpenApp={handleOpenApp} />;
  }

  return (
    <AppProvider>
      <MainAppContent
        onOpenDescription={handleOpenDescription}
        initialTab={initialTab}
        autoOpenAuth={autoOpenAuth}
      />
    </AppProvider>
  );
}
