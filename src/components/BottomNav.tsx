import { Home, Trophy, Newspaper, User } from 'lucide-react';

export type Tab = 'home' | 'feed' | 'leaderboard' | 'profile';

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Beranda', icon: Home },
  { id: 'feed', label: 'Feed', icon: Newspaper },
  { id: 'leaderboard', label: 'Ranking', icon: Trophy },
  { id: 'profile', label: 'Profil', icon: User },
];

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-emerald-100 bg-cream-50/95 backdrop-blur-lg dark:border-emerald-900/60 dark:bg-emerald-950/90">
      <div className="app-max-width flex items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="group relative flex flex-1 flex-col items-center gap-0.5 py-2.5"
            >
              <span className={`flex h-8 w-12 items-center justify-center rounded-full transition-all ${
                isActive ? 'bg-emerald-100 dark:bg-emerald-800/60' : ''
              }`}>
                <Icon
                  size={20}
                  className={`transition-colors ${
                    isActive ? 'text-emerald-700 dark:text-gold-300' : 'text-emerald-400 dark:text-emerald-600'
                  }`}
                />
              </span>
              <span className={`text-[10px] font-semibold transition-colors ${
                isActive ? 'text-emerald-700 dark:text-gold-300' : 'text-emerald-400 dark:text-emerald-600'
              }`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
