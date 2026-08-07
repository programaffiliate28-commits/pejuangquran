import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AuthScreen } from '@/screens/AuthScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { Dashboard } from '@/screens/Dashboard';
import { FeedScreen } from '@/screens/FeedScreen';
import { LeaderboardScreen } from '@/screens/LeaderboardScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { BottomNav, type Tab } from '@/components/BottomNav';
import { CoachModal } from '@/components/CoachModal';
import { ToastContainer, LevelUpModal } from '@/components/ui';
import { Loader2 } from 'lucide-react';

function AppShell() {
  const { session, profile, loading, needsOnboarding, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [darkMode, setDarkMode] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);

  // Dark mode class toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Persist dark mode preference
  useEffect(() => {
    const saved = localStorage.getItem('pq-dark');
    if (saved === 'true') setDarkMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('pq-dark', String(darkMode));
  }, [darkMode]);

  // Refresh profile whenever we land on home tab (picks up XP/level/streak changes)
  useEffect(() => {
    if (tab === 'home' && profile) refreshProfile();
  }, [tab, profile, refreshProfile]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream-50 dark:bg-emerald-950">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen />;
  }

  return (
    <div className="min-h-screen bg-cream-50 dark:bg-emerald-950">
      {tab === 'home' && (
        <Dashboard 
          onOpenCoach={() => setCoachOpen(true)} 
          onRefreshProfile={refreshProfile} 
        />
      )}
      {tab === 'feed' && <FeedScreen />}
      {tab === 'leaderboard' && <LeaderboardScreen />}
      {tab === 'profile' && (
        <ProfileScreen darkMode={darkMode} onToggleDark={() => setDarkMode((v) => !v)} />
      )}

      <BottomNav active={tab} onChange={setTab} />
      <CoachModal open={coachOpen} onClose={() => setCoachOpen(false)} />
      <ToastContainer />
      <LevelUpModal />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}