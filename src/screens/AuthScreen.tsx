import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BookOpenText, Mail, Lock, Loader2 } from 'lucide-react';

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError('Email dan kata sandi wajib diisi.');
      return;
    }
    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.');
      return;
    }
    setLoading(true);
    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
      }
    } else {
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
      } else if (data.user && data.session) {
        setLoading(false);
      } else if (data.user && !data.session) {
        await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
      }
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-emerald-800 via-emerald-900 to-emerald-950">
      {/* Decorative glow */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gold-400/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />

      <div className="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {/* Logo / Header */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-gold-300 to-gold-500 shadow-glow animate-float">
              <BookOpenText size={40} className="text-emerald-950" />
            </div>
            <h1 className="font-arabic text-3xl text-gold-300">مجاهدي القرآن</h1>
            <h2 className="mt-1 text-xl font-bold text-white">Pejuang Qur'an</h2>
            <p className="mt-2 text-sm text-emerald-200/80">
              Tilawah harian, level, leaderboard, dan tadabbur AI untuk pemuda & pengajar masjid.
            </p>
          </div>

          {/* Card */}
          <div className="card p-6">
            <form onSubmit={handleEmail} className="space-y-3">
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="input-field pl-10"
                  autoComplete="email"
                />
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata sandi"
                  className="input-field pl-10"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading && <Loader2 size={18} className="animate-spin" />}
                {mode === 'signin' ? 'Masuk' : 'Daftar'}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-emerald-500 dark:text-emerald-400">
              {mode === 'signin' ? 'Belum punya akun? ' : 'Sudah punya akun? '}
              <button
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
                className="font-semibold text-emerald-700 underline dark:text-gold-400"
              >
                {mode === 'signin' ? 'Daftar di sini' : 'Masuk di sini'}
              </button>
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-emerald-300/60">
            Dengan masuk, kamu menyetujui ketentuan komunitas masjid.
          </p>
        </div>
      </div>
    </div>
  );
}
