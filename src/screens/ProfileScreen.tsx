import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Avatar, ProgressBar, showToast } from '@/components/ui';
import { RecoveryModal } from '@/components/RecoveryModal';
import { getRankTitle, xpProgress, xpForLevel } from '@/lib/constants';
import type { TilawahLog } from '@/lib/types';
import { 
  Flame, Zap, BookOpen, Moon, Sun, LogOut, 
  ShieldAlert, Award, TrendingUp, Calendar, 
  Camera, Loader2, ShieldCheck 
} from 'lucide-react';

interface ProfileScreenProps {
  darkMode: boolean;
  onToggleDark: () => void;
}

export function ProfileScreen({ darkMode, onToggleDark }: ProfileScreenProps) {
  const { profile, signOut, refreshProfile } = useAuth();
  const [recentLogs, setRecentLogs] = useState<TilawahLog[]>([]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 1. Fetch Log Tilawah Terakhir & Data Sanksi dari Database
  const loadProfileData = async () => {
    if (!profile) return;

    // Fetch 7 log tilawah terakhir
    const { data: logsData } = await supabase
      .from('tilawah_logs')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(7);

    if (logsData) {
      setRecentLogs(logsData as TilawahLog[]);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [profile?.id]);

  if (!profile) return null;

  // 2. Evaluasi Sanksi Sesuai Flowchart Sistem (Hanya Hitung Sanksi Aktif Permanen)
  // Hutang sanksi dibaca langsung dari profile (source of truth: database)
  const hutangSanksi = profile?.hutang_sanksi ?? 0;
  const activeCount = hutangSanksi;
  const isBlockedByLimit = activeCount >= 3;

  const xpProg = xpProgress(profile.level, profile.xp);
  const totalMinutes = recentLogs.reduce((s, l) => s + l.duration_minutes, 0);

  // 3. Handler Upload Foto Profil
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran foto maksimal 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        contentType: file.type,
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (updErr) throw updErr;

      await refreshProfile();
      showToast('Foto profil berhasil diperbarui!');
    } catch (err) {
      showToast('Gagal mengunggah foto: ' + (err instanceof Error ? err.message : 'kesalahan tidak diketahui'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // 4. Trigger Sync Real-Time Saat Sanksi Ditebus via RecoveryModal
  const handleRecovered = async () => {
    await loadProfileData(); // Re-fetch sanksi & log (Bar sanksi berkurang)
    await refreshProfile();  // Re-fetch level & XP (+20 XP bertambah)
  };

  return (
    <div className="app-max-width px-4 pb-28 pt-6">
      {/* Profile Header */}
      <div className="card mb-5 p-5 text-center">
        <div className="relative mx-auto w-fit">
          <Avatar name={profile.full_name} url={profile.avatar_url} size={80} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-soft transition-transform active:scale-90"
            aria-label="Ganti foto"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
        </div>
        <h1 className="mt-3 text-lg font-bold text-emerald-900 dark:text-emerald-100">{profile.full_name}</h1>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <span className="badge bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300">
            <Award size={12} /> {profile.role === 'pengajar' ? 'Pengajar' : 'Anggota'}
          </span>
          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            Lv {profile.level} • {getRankTitle(profile.level)}
          </span>
        </div>

        {/* XP Progress */}
        <div className="mt-4 text-left">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Level {profile.level}</span>
            <span className="text-emerald-400">{xpProg.current}/{xpProg.needed} XP</span>
          </div>
          <ProgressBar percent={xpProg.percent} />
          <p className="mt-1.5 text-xs text-emerald-400">
            {xpForLevel(profile.level + 1) - profile.xp} XP lagi ke Level {profile.level + 1}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard icon={<Flame size={18} />} value={profile.current_streak} label="Streak" sub={`Rekor ${profile.longest_streak}`} />
        <StatCard icon={<Zap size={18} />} value={profile.xp} label="Total XP" sub={`Lv ${profile.level}`} />
        <StatCard icon={<BookOpen size={18} />} value={recentLogs.length} label="Log (7hr)" sub={`${totalMinutes} mnt`} />
      </div>

      {/* --- KARTU HUTANG SANKSI (BERDASARKAN FLOWCHART REAL-TIME) --- */}
      <div className="card mb-5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {activeCount >= 3 ? (
              <ShieldAlert size={18} className="text-red-500" />
            ) : activeCount > 0 ? (
              <ShieldAlert size={18} className="text-gold-500" />
            ) : (
              <ShieldCheck size={18} className="text-emerald-500" />
            )}
            <span className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Hutang Sanksi</span>
          </div>
          <span className={`text-sm font-bold ${activeCount >= 3 ? 'text-red-500' : activeCount > 0 ? 'text-gold-600' : 'text-emerald-500'}`}>
            {activeCount}
          </span>
        </div>

        {/* Visual Bar Segment (Limit Maksimal Hutang = 3) */}
        <div className="mt-2 flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i < activeCount
                  ? isBlockedByLimit ? 'bg-red-500' : 'bg-gold-400'
                  : 'bg-emerald-100 dark:bg-emerald-900/60'
              }`}
            />
          ))}
        </div>

        {/* Status Pesan & Akses Tugas Recovery */}
        {isBlockedByLimit ? (
          <div className="mt-3 rounded-xl bg-red-50 p-3 dark:bg-red-950/20">
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              Hutang sanksi mencapai batas maksimal (3)! Segera lunasi agar ranking tidak terkunci.
            </p>
            <button onClick={() => setRecoveryOpen(true)} className="btn-primary mt-2 w-full !py-2 text-xs">
              Cicil Sanksi Sekarang (+20 XP)
            </button>
          </div>
        ) : activeCount > 0 ? (
          <div className="mt-3 rounded-xl bg-gold-50 p-3 dark:bg-gold-900/20">
            <p className="text-xs font-semibold text-gold-700 dark:text-gold-300">
              {activeCount} hutang sanksi belum dibayar. Ranking di posisi waspada.
            </p>
            <button onClick={() => setRecoveryOpen(true)} className="btn-primary mt-2 w-full !py-2 text-xs">
              Kerjakan Tugas Recovery (+20 XP)
            </button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-emerald-500 dark:text-emerald-400">
            Alhamdulillah! Tidak ada hutang sanksi aktif. Konsisten tilawah, syukran!
          </p>
        )}
      </div>

      {/* Recent Activity */}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-emerald-900 dark:text-emerald-100">
        <Calendar size={16} /> Aktivitas Terakhir
      </h2>
      <div className="card mb-5 divide-y divide-emerald-50 dark:divide-emerald-900/60">
        {recentLogs.length === 0 ? (
          <p className="p-4 text-center text-xs text-emerald-400">Belum ada log tilawah.</p>
        ) : (
          recentLogs.map((log) => (
            <div key={log.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-xs font-bold capitalize text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
                {log.prayer_time === 'extra' ? 'EX' : log.prayer_time.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  {log.surah_name} {log.ayat_start}{log.ayat_end !== log.ayat_start ? `-${log.ayat_end}` : ''}
                </p>
                <p className="text-xs text-emerald-400">
                  Juz {log.juz} • {new Date(log.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className="badge bg-gold-100 text-gold-700 dark:bg-gold-900/40 dark:text-gold-300">+{log.xp_earned}</span>
            </div>
          ))
        )}
      </div>

      {/* Settings */}
      <div className="card divide-y divide-emerald-50 dark:divide-emerald-900/60">
        <SettingRow
          icon={darkMode ? <Moon size={18} /> : <Sun size={18} />}
          label="Mode Gelap"
          right={
            <button
              onClick={onToggleDark}
              className={`relative h-6 w-11 rounded-full transition-colors ${darkMode ? 'bg-emerald-600' : 'bg-emerald-200'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${darkMode ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          }
        />
        <SettingRow
          icon={<TrendingUp size={18} />}
          label="Target Harian"
          right={<span className="text-sm font-semibold text-emerald-600 dark:text-emerald-300">{profile.target_minutes} mnt</span>}
        />
        <button onClick={signOut} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-red-50 dark:hover:bg-red-950/20">
          <LogOut size={18} className="text-red-500" />
          <span className="text-sm font-semibold text-red-500">Keluar</span>
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-emerald-400/60">Pejuang Qur'an App • v2.0</p>

      {/* Modal Recovery Terintegrasi */}
      <RecoveryModal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        totalHutang={activeCount}
        onRecovered={handleRecovered}
      />
    </div>
  );
}

function StatCard({ icon, value, label, sub }: { icon: React.ReactNode; value: number; label: string; sub: string }) {
  return (
    <div className="card flex flex-col items-center p-3 text-center">
      <span className="mb-1 text-gold-500">{icon}</span>
      <span className="text-xl font-extrabold text-emerald-900 dark:text-emerald-100">{value}</span>
      <span className="text-[10px] font-semibold text-emerald-500">{label}</span>
      <span className="text-[10px] text-emerald-400">{sub}</span>
    </div>
  );
}

function SettingRow({ icon, label, right }: { icon: React.ReactNode; label: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <span className="text-emerald-500">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-emerald-900 dark:text-emerald-100">{label}</span>
      {right}
    </div>
  );
}