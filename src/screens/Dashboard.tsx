import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getTodaySlots, todayISODate, getNow } from '@/lib/habit';
import { getQuoteOfDay, getRankTitle, xpProgress, xpForLevel, PRAYER_TIMES } from '@/lib/constants';
import type { TilawahLog, PrayerTime } from '@/lib/types';
import { LogModal } from '@/components/LogModal';
import { RecoveryModal } from '@/components/RecoveryModal';
import { Avatar, ProgressBar, showToast, showLevelUp } from '@/components/ui';
import { scheduleTilawahReminders } from '@/lib/notifications';
import {
  Sunrise, Sun, Moon, Sparkles, Flame, Zap, Check, Plus,
  BookOpenText, Clock, Bell, AlertTriangle, ShieldCheck, Gift
} from 'lucide-react';

const ICONS: Record<PrayerTime, typeof Sunrise> = {
  pagi: Sunrise,
  siang: Sun,
  sore: Moon,
  extra: Sparkles,
};

interface DashboardProps {
  onOpenCoach: () => void;
  onRefreshProfile?: () => void;
}

export function Dashboard({ onOpenCoach, onRefreshProfile }: DashboardProps) {
  const { profile, refreshProfile } = useAuth();
  const [logs, setLogs] = useState<TilawahLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<PrayerTime>('pagi');
  const [activeLog, setActiveLog] = useState<TilawahLog | null>(null);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const prevLevel = useRef(profile?.level ?? 0);

  const today = todayISODate();
  const quote = getQuoteOfDay();

  const loadLogs = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('tilawah_logs')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setLogs((data ?? []) as TilawahLog[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Auto-schedule tilawah reminders if permission already granted
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotifEnabled(true);
      scheduleTilawahReminders();
    }
  }, []);

  const todayLogs = logs.filter((l) => l.log_date === today);
  const slots = getTodaySlots(todayLogs, today);
  const mainSlots = slots.filter((s) => !s.isExtra);
  const extraSlot = slots.find((s) => s.isExtra);
  const extraCount = todayLogs.filter((l) => l.prayer_time === 'extra').length;
  const completedCount = mainSlots.filter((s) => s.status === 'selesai').length;
  const missedCount = mainSlots.filter((s) => s.status === 'terlewat').length;

  const xpProg = profile ? xpProgress(profile.level, profile.xp) : { current: 0, needed: 100, percent: 0, level: 1, nextLevel: 2, xpToNext: 100 };

  function openSlot(p: PrayerTime) {
    const existing = todayLogs.find((l) => l.prayer_time === p);
    setActiveSlot(p);
    setActiveLog(p === 'extra' ? null : (existing ?? null));
    setModalOpen(true);
  }

  function handleSaved(_log: TilawahLog) {
    setModalOpen(false);
    loadLogs();
    refreshProfile().then(() => {
      if (profile && profile.level > prevLevel.current) {
        showLevelUp(profile.level);
        showToast(`Selamat! Naik ke Level ${profile.level}!`);
      }
      prevLevel.current = profile?.level ?? 0;
    });
    showToast(`Berhasil Mengunggah Log Tilawah! (+${_log.xp_earned} XP)`);
  }

  async function handleRecovered() {
    await refreshProfile();
    await loadLogs();
    if (onRefreshProfile) {
      onRefreshProfile();
    }
  }

  async function handleEnableNotif() {
    if (!('Notification' in window)) {
      showToast('Browser tidak mendukung notifikasi');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotifEnabled(true);
      showToast('Notifikasi tilawah diaktifkan!');
      new Notification('Pejuang Qur\'an', {
        body: 'Kamu akan diingatkan 3x sehari: Pagi, Siang, dan Sore/Malam.',
      });
    } else {
      showToast('Izin notifikasi ditolak');
    }
  }

  if (!profile) return null;

  const hutangSanksi = profile.hutang_sanksi ?? 0;

  return (
    <div className="app-max-width px-4 pb-28 pt-6">
      {/* Header Greeting */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-emerald-500 dark:text-emerald-400">
            {getNow().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
            Assalamu'alaikum, {profile.full_name.split(' ')[0]}!
          </h1>
        </div>
        <Avatar name={profile.full_name} url={profile.avatar_url} size={44} />
      </div>

      {/* Warning Banner / Recovery Alert */}
      {hutangSanksi > 0 && (
        <div className="mb-5 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-red-900 dark:text-red-200">
                Kamu memiliki {hutangSanksi} sanksi aktif
              </p>
              <p className="text-[11px] text-red-600 dark:text-red-400">
                Selesaikan tugas edukasi/materi untuk melunasi sanksi.
              </p>
            </div>
          </div>
          <button
            onClick={() => setRecoveryOpen(true)}
            className="flex items-center gap-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-700 active:scale-95 shrink-0"
          >
            <ShieldCheck size={14} />
            Lunasi
          </button>
        </div>
      )}

      {/* Daily Quote Card */}
      <div className="mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 p-5 text-white shadow-card relative">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2 text-amber-300">
            <BookOpenText size={16} />
            <span className="text-xs font-semibold uppercase tracking-wide">Quote Hari Ini</span>
          </div>
          <p className="font-arabic text-lg leading-relaxed text-amber-100">{quote.text}</p>
          <p className="mt-2 text-xs text-emerald-200/70">— {quote.source}</p>
        </div>
      </div>

      {/* Streak & Level Header */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="card flex flex-col items-center justify-center p-4">
          <div className="flex items-center gap-1.5">
            <Flame size={22} className="text-amber-500 animate-flame" />
            <span className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-100">{profile.current_streak}</span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-emerald-500 dark:text-emerald-400">Hari berturut-turut</p>
        </div>
        <div className="card flex flex-col items-center justify-center p-4">
          <div className="flex items-center gap-1.5">
            <Zap size={20} className="text-amber-500" />
            <span className="text-3xl font-extrabold text-emerald-900 dark:text-emerald-100">{profile.xp}</span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-emerald-500 dark:text-emerald-400">Total XP</p>
        </div>
      </div>

      {/* Level Progress Card */}
      <div className="card mb-5 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-emerald-500 dark:text-emerald-400">Level {xpProg.level}</p>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{getRankTitle(xpProg.level)}</p>
          </div>
          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {xpProg.current}/{xpProg.needed} XP
          </span>
        </div>
        <ProgressBar percent={xpProg.percent} className="mt-3" />
        <p className="mt-2 text-xs text-emerald-400">
          {xpProg.xpToNext} XP lagi menuju Level {xpProg.nextLevel}
        </p>
      </div>

      {/* Tilawah 3 Waktu Checklist */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-bold text-emerald-900 dark:text-emerald-100">Tilawah 3 Waktu</h2>
        <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          {completedCount}/3 selesai
        </span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl shimmer" />)}
        </div>
      ) : (
        <div className="space-y-2.5">
          {mainSlots.map((slot) => {
            const p = PRAYER_TIMES.find((x) => x.id === slot.prayer_time)!;
            const Icon = ICONS[slot.prayer_time];
            const isDone = slot.status === 'selesai';
            const isMissed = slot.status === 'terlewat';
            return (
              <button
                key={slot.prayer_time}
                onClick={() => openSlot(slot.prayer_time)}
                className={`group flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-all active:scale-[0.99] ${
                  isDone
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
                    : isMissed
                    ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800/50 dark:bg-amber-900/10'
                    : 'border-emerald-100 bg-white hover:border-emerald-300 dark:border-emerald-900 dark:bg-emerald-950/40 dark:hover:border-emerald-700'
                }`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  isDone
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300'
                }`}>
                  <Icon size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">{p.label}</p>
                  {isDone && slot.log ? (
                    <p className="truncate text-xs text-emerald-600 dark:text-emerald-400">
                      {slot.log.surah_name} {slot.log.ayat_start}{slot.log.ayat_end !== slot.log.ayat_start ? `-${slot.log.ayat_end}` : ''} • {slot.log.duration_minutes} mnt
                    </p>
                  ) : isMissed ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                      Terlewat, selesaikan agar tidak mendapat sanksi
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-400">{p.recommended}</p>
                  )}
                </div>
                {isDone ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white animate-pop">
                    <Check size={16} />
                  </span>
                ) : isMissed ? (
                  <span className="badge bg-amber-200 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Terlewat</span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-200 text-emerald-500 group-hover:bg-emerald-50 dark:border-emerald-800">
                    <Plus size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Fastabiqul Khairat Extra Card */}
      {extraSlot && (
        <div className="mt-3">
          <div className="mb-2 flex items-center gap-2">
            <Gift size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Fastabiqul Khairat</h3>
            <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">+Bonus XP</span>
          </div>
          <button
            onClick={() => openSlot('extra')}
            className="group flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50/30 p-3.5 text-left transition-all hover:border-amber-400 active:scale-[0.99] dark:border-amber-800/50 dark:bg-amber-900/10"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
              <Sparkles size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Tilawah Ekstra</p>
              {extraCount > 0 ? (
                <p className="truncate text-xs text-emerald-600 dark:text-emerald-400">
                  {extraCount}x tilawah ekstra hari ini — tambah lagi?
                </p>
              ) : (
                <p className="text-xs text-amber-500 dark:text-amber-400">Opsional — baca ekstra untuk pahala & bonus XP</p>
              )}
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-200 text-amber-500 group-hover:bg-amber-50 dark:border-amber-800">
              <Plus size={16} />
            </span>
          </button>
        </div>
      )}

      {/* AI Coach Button */}
      <button
        onClick={onOpenCoach}
        className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 p-4 text-emerald-950 shadow-glow transition-all active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-950/10">
          <Sparkles size={22} />
        </span>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold">Analisis Progressku</p>
          <p className="text-xs text-emerald-950/70">AI Coach evaluasi konsistensi mingguan</p>
        </div>
        <Clock size={18} />
      </button>

      {/* Push Notification Opt-in */}
      {!notifEnabled && 'Notification' in window && Notification.permission === 'default' && (
        <button
          onClick={handleEnableNotif}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3.5 text-left transition-all active:scale-[0.99] dark:border-emerald-900 dark:bg-emerald-900/20"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
            <Bell size={18} />
          </span>
          <div className="flex-1">
            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200">Aktifkan Notifikasi Tilawah</p>
            <p className="text-xs text-emerald-500 dark:text-emerald-400">Pengingat 3x: Pagi, Siang, Sore/Malam</p>
          </div>
        </button>
      )}

      {/* Modal Input Log Tilawah */}
      <LogModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        prayerTime={activeSlot}
        existingLog={activeLog}
        onSaved={handleSaved}
      />

      {/* Modal Recovery Sanksi */}
      <RecoveryModal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        totalHutang={hutangSanksi}
        onRecovered={handleRecovered}
      />
    </div>
  );
}
