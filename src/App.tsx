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
import { PrivacyPolicyPage } from './components/PrivacyPolicyPage.js';
import { TermsOfServicePage } from './components/TermsOfServicePage.js';
import { DesktopScrollbar } from './components/DesktopScrollbar.js';
import {
  GuestLockSheet,
  GuestExpiredOverlay,
  FirstRunTooltips,
  KeyboardShortcutsModal,
  MilestoneConfettiModal
} from './components/GuestModals.js';

interface MainAppContentProps {
  onOpenDescription: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  initialTab?: TabType;
  autoOpenAuth?: boolean;
}

const MainAppContent: React.FC<MainAppContentProps> = ({
  onOpenDescription,
  onOpenPrivacy,
  onOpenTerms,
  initialTab = 'diary',
  autoOpenAuth = false
}) => {
  const [currentTab, setCurrentTab] = useState<TabType>(initialTab);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const {
    isAddFoodOpen,
    openAddFood,
    closeAddFood,
    selectedMealForAdd,
    isLoading,
    openAuthModal,
    undoToast,
    dismissUndoToast,
    isOnline,
    offlineQueueCount,
    waterGlasses,
    updateWaterGlasses,
    isGuest,
    openGuestLock
  } = useApp();

  useEffect(() => {
    if (autoOpenAuth) {
      openAuthModal();
    }
  }, [autoOpenAuth, openAuthModal]);

  // #9 Keyboard shortcuts (desktop): N = Add Food, W = log water, E = exercise log, ? = shortcuts list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        openAddFood('breakfast');
      } else if (key === 'w') {
        e.preventDefault();
        updateWaterGlasses(Math.min(8, waterGlasses + 1));
      } else if (key === 'e') {
        e.preventDefault();
        if (isGuest) {
          openGuestLock();
        } else {
          setCurrentTab('fitness');
        }
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openAddFood, updateWaterGlasses, waterGlasses, isGuest, openGuestLock]);

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
                ? "Can't reach the server right now. Your data is saved on this device and will sync when you're back online."
                : `Syncing ${offlineQueueCount} offline entry(s)...`}
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 pt-4 pb-20 max-w-md mx-auto w-full">
        {currentTab === 'diary' && (
          <DiaryTab
            onNavigateToFitness={() => {
              if (isGuest) {
                openGuestLock();
              } else {
                setCurrentTab('fitness');
              }
            }}
          />
        )}
        {currentTab === 'fitness' && <FitnessTab />}
        {currentTab === 'plan' && <PlanTab />}
        {currentTab === 'reports' && <ReportsTab />}
        {currentTab === 'me' && (
          <MeTab
            onOpenDescription={onOpenDescription}
            onOpenPrivacy={onOpenPrivacy}
            onOpenTerms={onOpenTerms}
          />
        )}

        <LegalFooter onOpenPrivacy={onOpenPrivacy} onOpenTerms={onOpenTerms} />
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
              aria-label="Undo delete"
              className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-zinc-950 font-bold rounded-lg text-xs transition-colors"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={dismissUndoToast}
              aria-label="Dismiss undo notice"
              className="text-xs text-zinc-500 hover:text-zinc-300 px-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Global Modals & Overlays */}
      <OnboardingModal />
      <FirstRunTooltips />
      {!isGuest && <WeeklyRecapModal />}
      <AuthModal />
      <GuestLockSheet />
      <GuestExpiredOverlay />
      <MilestoneConfettiModal />
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
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
  const [activeView, setActiveView] = useState<'landing' | 'app' | 'privacy' | 'terms'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.location.pathname === '/privacy' || params.get('view') === 'privacy') {
      return 'privacy';
    }
    if (window.location.pathname === '/terms' || params.get('view') === 'terms') {
      return 'terms';
    }
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
      if (window.location.pathname === '/privacy' || params.get('view') === 'privacy') {
        setActiveView('privacy');
      } else if (window.location.pathname === '/terms' || params.get('view') === 'terms') {
        setActiveView('terms');
      } else if (params.get('view') === 'app' || window.location.pathname === '/app') {
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

  const handleOpenApp = (action?: 'guest' | 'login' | 'program') => {
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

  const handleOpenPrivacy = () => {
    setActiveView('privacy');
    window.history.pushState({}, '', '/privacy');
  };

  const handleOpenTerms = () => {
    setActiveView('terms');
    window.history.pushState({}, '', '/terms');
  };

  if (activeView === 'privacy') {
    return (
      <>
        <PrivacyPolicyPage
          onBackToLanding={handleOpenDescription}
          onOpenTerms={handleOpenTerms}
        />
        <DesktopScrollbar />
      </>
    );
  }

  if (activeView === 'terms') {
    return (
      <>
        <TermsOfServicePage
          onBackToLanding={handleOpenDescription}
          onOpenPrivacy={handleOpenPrivacy}
        />
        <DesktopScrollbar />
      </>
    );
  }

  if (activeView === 'landing') {
    return (
      <>
        <DescriptionPage
          onOpenApp={handleOpenApp}
          onOpenPrivacy={handleOpenPrivacy}
          onOpenTerms={handleOpenTerms}
        />
        <DesktopScrollbar />
      </>
    );
  }

  return (
    <AppProvider>
      <MainAppContent
        onOpenDescription={handleOpenDescription}
        onOpenPrivacy={handleOpenPrivacy}
        onOpenTerms={handleOpenTerms}
        initialTab={initialTab}
        autoOpenAuth={autoOpenAuth}
      />
      <DesktopScrollbar />
    </AppProvider>
  );
}
