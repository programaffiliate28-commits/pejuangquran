import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { Role } from '@/lib/types';
import { BookOpenText, Loader2, GraduationCap, Users, Target, Check } from 'lucide-react';

export function OnboardingScreen() {
  const { user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '');
  const [role, setRole] = useState<Role>('anggota');
  const [target, setTarget] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('Nama lengkap wajib diisi.');
      return;
    }
    if (!user) return;
    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        role,
        target_minutes: target,
        onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    await refreshProfile();
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-emerald-800 via-emerald-900 to-emerald-950 px-6 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-glow">
            <BookOpenText size={32} className="text-emerald-950" />
          </div>
          <h1 className="text-xl font-bold text-white">Selamat Datang!</h1>
          <p className="mt-1 text-sm text-emerald-200/80">Lengkapi profilmu untuk mulai perjalanan tilawah.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Nama Lengkap</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nama kamu"
              className="input-field"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">Peran di Masjid</label>
            <div className="grid grid-cols-2 gap-3">
              <RoleCard
                active={role === 'pengajar'}
                onClick={() => setRole('pengajar')}
                icon={<GraduationCap size={22} />}
                label="Pengajar"
              />
              <RoleCard
                active={role === 'anggota'}
                onClick={() => setRole('anggota')}
                icon={<Users size={22} />}
                label="Anggota"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-emerald-800 dark:text-emerald-200">
              Target Tilawah Harian
            </label>
            <p className="mb-3 text-xs text-emerald-500 dark:text-emerald-400">Berapa menit kamu targetkan untuk tilawah setiap hari?</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setTarget(Math.max(10, target - 10))} className="rounded-xl bg-emerald-50 px-3 py-2 text-lg font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">−</button>
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-1 text-2xl font-extrabold text-emerald-900 dark:text-emerald-100">
                  <Target size={20} className="text-gold-500" />
                  {target}
                </div>
                <p className="text-xs text-emerald-500">menit / hari</p>
              </div>
              <button type="button" onClick={() => setTarget(Math.min(120, target + 10))} className="rounded-xl bg-emerald-50 px-3 py-2 text-lg font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">+</button>
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>
          )}

          <button type="submit" disabled={saving} className="btn-gold w-full">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            Mulai Perjalanan
          </button>
        </form>
      </div>
    </div>
  );
}

function RoleCard({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${
        active
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-gold-400 dark:bg-emerald-900/40 dark:text-gold-300'
          : 'border-emerald-200 bg-white text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
      }`}
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
    </button>
  );
}
