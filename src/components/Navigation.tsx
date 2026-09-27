import React from 'react';
import {
  BookOpen,
  Activity,
  CalendarCheck,
  BarChart3,
  User,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { t } from '../utils/i18n.js';

export type TabType = 'diary' | 'fitness' | 'plan' | 'reports' | 'me';

interface NavigationProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  onOpenDescription?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ currentTab, onTabChange, onOpenDescription }) => {
  const {
    activeDate,
    setActiveDate,
    isGuest,
    userEmail,
    openAuthModal,
    openGuestLock,
    isOnline,
    fastingStartedAt,
    fastingRemainingSec,
    fastingPreset,
    language
  } = useApp();

  const formatFastingCountdown = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handlePrevDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() - 1);
    setActiveDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(activeDate);
    d.setDate(d.getDate() + 1);
    setActiveDate(d.toISOString().split('T')[0]);
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = dateStr === todayStr;

    const formatted = d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    return isToday ? `Today · ${formatted}` : formatted;
  };

  const navItems = [
    { id: 'diary' as TabType, label: t('diary', language), icon: BookOpen },
    { id: 'fitness' as TabType, label: t('fitness', language), icon: Activity },
    { id: 'plan' as TabType, label: t('plan', language), icon: CalendarCheck },
    { id: 'reports' as TabType, label: t('reports', language), icon: BarChart3 },
    { id: 'me' as TabType, label: t('me', language), icon: User }
  ];

  const handleTabClick = (tab: TabType) => {
    if (isGuest && (tab === 'fitness' || tab === 'plan' || tab === 'reports')) {
      openGuestLock();
      return;
    }
    onTabChange(tab);
  };

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-850 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenDescription}
              title="View Caloriq description and overview"
              aria-label="View Caloriq description and overview"
              className="font-bold text-base tracking-tight text-zinc-100 flex items-center gap-1.5 hover:text-teal-400 transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block"></span>
              <span>Caloriq</span>
            </button>
            {!isOnline && !isGuest && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/60 text-[10px] font-mono text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>{t('offlineWillSync', language)}</span>
              </span>
            )}
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl px-1.5 py-1">
            <button
              onClick={handlePrevDay}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors"
              aria-label="Previous day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <label className="relative flex items-center gap-1.5 px-1.5 py-0.5 text-xs font-medium text-zinc-300 cursor-pointer hover:text-teal-400 transition-colors">
              <CalendarIcon className="w-3 h-3 text-zinc-500" />
              <span>{formatDateDisplay(activeDate)}</span>
              <input
                type="date"
                aria-label="Select date"
                value={activeDate}
                onChange={(e) => e.target.value && setActiveDate(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
            </label>

            <button
              onClick={handleNextDay}
              className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 rounded-lg transition-colors"
              aria-label="Next day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Account status button */}
          <button
            onClick={openAuthModal}
            aria-label={isGuest ? 'Sign in or create account' : 'Account details'}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              isGuest
                ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                : 'bg-teal-950/40 border-teal-800/60 text-teal-300'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
            <span>{isGuest ? 'Guest' : (userEmail?.split('@')[0] || 'Sync')}</span>
          </button>
        </div>
      </header>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-850 px-2 py-2">
        <div className="max-w-md mx-auto flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isLockedForGuest = isGuest && (item.id === 'fitness' || item.id === 'plan' || item.id === 'reports');
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                aria-label={item.label}
                className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all ${
                  isActive
                    ? 'text-teal-400 font-semibold'
                    : isLockedForGuest
                      ? 'text-zinc-600 hover:text-zinc-400 font-normal'
                      : 'text-zinc-500 hover:text-zinc-300 font-normal'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-teal-400' : isLockedForGuest ? 'text-zinc-600' : 'text-zinc-500'}`} />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
