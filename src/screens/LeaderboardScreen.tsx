import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { getNow } from '@/lib/habit';
import type { LeaderboardRow } from '@/lib/types';
import { Avatar } from '@/components/ui';
import { 
  Trophy, Crown, Flame, Zap, Loader2, ShieldAlert, 
  CheckCircle2, XCircle, MinusCircle, TrendingUp, AlertTriangle, ShieldCheck 
} from 'lucide-react';

const SLOT_END_HOUR: Record<string, number> = {
  pagi: 12, siang: 16, sore: 24, extra: 24,
};

const SLOT_LABELS = ['pagi', 'siang', 'sore', 'extra'];
const SLOT_DISPLAY = ['P', 'S', 'S/M', 'EX'];

/**
 * Komponen Indikator Status Tilawah Hari Ini (P, S, S/M, EX)
 * - Selesai: Hijau / Amber (Extra)
 * - Terlewat Hari Ini: Amber / Kuning (Pending Sanksi, bukan Merah matot)
 * - Belum Waktunya: Abu-abu / Hijau soft
 */
function PrayerStatusIcons({ status }: { status: string }) {
  const hour = getNow().getHours();
  const hasAnyToday = status?.split('').some((c) => c === '1');
  return (
    <div className="flex items-center gap-1">
      {SLOT_LABELS.map((p, i) => {
        const done = status?.[i] === '1';
        const isExtra = p === 'extra';
        // Hanya tampilkan "missed" jika user punya log hari ini (sebagian slot terisi)
        // tapi slot ini belum. Jika belum ada log sama sekali hari ini, tampilkan slot kosong.
        const missed = !done && !isExtra && hasAnyToday && hour >= SLOT_END_HOUR[p];
        return (
          <span
            key={p}
            title={`${SLOT_DISPLAY[i]} — ${
              done 
                ? 'Selesai' 
                : missed 
                ? 'Pending Sanksi (Bisa diisi hari ini)' 
                : 'Belum'
            }`}
            className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold transition-all ${
              done
                ? isExtra
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-500 text-white'
                : missed
                ? 'bg-amber-100 text-amber-600 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-700/60'
                : isExtra
                ? 'bg-amber-50 text-amber-400 dark:bg-amber-900/30 dark:text-amber-500'
                : 'bg-emerald-100 text-emerald-400 dark:bg-emerald-900/40 dark:text-emerald-600'
            }`}
          >
            {done ? <CheckCircle2 size={12} /> : missed ? <XCircle size={12} /> : <MinusCircle size={12} />}
          </span>
        );
      })}
    </div>
  );
}

export function LeaderboardScreen() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('weekly_leaderboard');
    if (error) {
      console.error('leaderboard error', error);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as LeaderboardRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const top3 = rows.slice(0, 3);

  const podiumStyles = [
    { icon: Crown, color: 'from-amber-300 to-amber-500', text: 'text-amber-700 dark:text-amber-300', h: 'h-28' },
    { icon: Trophy, color: 'from-slate-300 to-slate-500', text: 'text-slate-700 dark:text-slate-300', h: 'h-24' },
    { icon: Trophy, color: 'from-amber-600/80 to-amber-800/80', text: 'text-amber-800 dark:text-amber-400', h: 'h-20' },
  ];

  return (
    <div className="app-max-width px-4 pb-28 pt-6">
      <div className="mb-1 flex items-center gap-2">
        <Trophy size={22} className="text-amber-500" />
        <h1 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">Leaderboard Mingguan</h1>
      </div>
      <p className="mb-5 text-xs text-emerald-500 dark:text-emerald-400">
        Ranking berdasarkan kualitas, kuantitas, dan keistiqomahan tilawah
      </p>

      {/* Legend Sanksi Sesuai Flowchart */}
      <div className="mb-5 flex flex-wrap gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Rajin (0 sanksi)
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-600 dark:bg-amber-900/20 dark:text-amber-300">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Waspada (1-2 sanksi)
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 dark:bg-red-950/20 dark:text-red-300">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Bahaya (3 sanksi / Limit)
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center py-16">
          <Loader2 size={28} className="animate-spin text-emerald-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
            <Trophy size={28} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Belum ada peringkat</p>
          <p className="text-xs text-emerald-500">Mulai tilawah untuk masuk ranking!</p>
        </div>
      ) : (
        <>
          {/* Podium Top 3 */}
          {top3.length > 0 && (
            <div className="mb-8 grid grid-cols-3 items-end gap-2 pt-2">
              {top3.map((row, i) => {
                const style = podiumStyles[i];
                const Icon = style.icon;
                const isFirst = i === 0;
                return (
                  <div key={row.user_id} className="flex flex-col items-center">
                    <div className="relative mb-2">
                      <Avatar name={row.full_name} url={row.avatar_url} size={isFirst ? 64 : 52} className={isFirst ? 'ring-4 ring-amber-400' : ''} />
                      <span className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${style.color} text-xs font-bold text-white shadow-md`}>
                        {i + 1}
                      </span>
                    </div>
                    <p className="mb-0.5 max-w-full truncate text-xs font-bold text-emerald-900 dark:text-emerald-100">{row.full_name?.split(' ')[0]}</p>
                    <p className={`mb-2 flex items-center gap-1 text-xs font-bold ${style.text}`}>
                      <Zap size={12} /> {row.weekly_xp}
                    </p>
                    <div className={`flex w-full ${style.h} flex-col items-center justify-end rounded-t-2xl bg-gradient-to-b ${style.color} pb-2 shadow-inner`}>
                      <Icon size={isFirst ? 26 : 20} className="text-white drop-shadow" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Leaderboard List */}
          <div className="space-y-3">
            {rows.map((row, index) => (
              <LeaderboardCard
                key={row.user_id}
                row={row}
                rank={index + 1}
                isMe={row.user_id === profile?.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeaderboardCard({ row, rank, isMe = false }: { row: LeaderboardRow; rank: number; isMe?: boolean }) {
  const hour = getNow().getHours();
  const sanksiAktif = row.hutang_sanksi || 0;
  const isTop3 = rank <= 3;

  // Hitung berapa slot wajib (pagi, siang, sore) yang terlewat HARI INI
  const mainSlots = ['pagi', 'siang', 'sore'];
  const hasAnyToday = row.prayer_status?.split('').some((c) => c === '1');
  const missedToday = mainSlots.reduce((acc, p, i) => {
    const done = row.prayer_status?.[i] === '1';
    // Hanya hitung "missed" jika user punya log hari ini (sebagian slot terisi)
    // tapi slot ini belum. Jika belum ada log sama sekali hari ini, tampilkan slot kosong.
    const missed = !done && hasAnyToday && hour >= SLOT_END_HOUR[p];
    return missed ? acc + 1 : acc;
  }, 0);

  const isSanctionedBottom = sanksiAktif >= 3 && row.weekly_xp === 0;

  // Penentuan warna border/card berdasarkan Hutang Sanksi Aktif Permanen
  let tierStyle = {
    border: 'border-emerald-200 dark:border-emerald-800/60',
    bg: 'bg-emerald-50/40 dark:bg-emerald-950/20',
  };

  if (sanksiAktif >= 1 && sanksiAktif <= 2) {
    tierStyle = {
      border: 'border-amber-300 dark:border-amber-800/60',
      bg: 'bg-amber-50/40 dark:bg-amber-950/20',
    };
  } else if (sanksiAktif >= 3) {
    tierStyle = {
      border: 'border-red-300 dark:border-red-900/60',
      bg: 'bg-red-50/40 dark:bg-red-950/20',
    };
  }

  const trophyBadges: Record<number, string> = {
    1: '🥇',
    2: '🥈',
    3: '🥉',
  };

  return (
    <div
      className={`rounded-2xl border-2 p-3.5 transition-all ${tierStyle.border} ${tierStyle.bg} ${
        isTop3 ? 'shadow-md scale-[1.01]' : ''
      } ${isMe ? 'ring-2 ring-emerald-500 dark:ring-amber-400' : ''}`}
    >
      <div className="flex items-center gap-3">
        {/* Rank Number / Trophy */}
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black shadow-sm ${
            isTop3
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 text-base'
              : 'bg-emerald-600 text-white'
          }`}
        >
          {isTop3 ? trophyBadges[rank] : rank}
        </span>

        {/* Avatar */}
        <Avatar name={row.full_name} url={row.avatar_url} size={40} />

        {/* User Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-bold text-emerald-900 dark:text-emerald-100">
              {row.full_name}
            </p>
            {isMe && <span className="ml-0.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">Kamu</span>}
            {isSanctionedBottom && (
              <span className="flex items-center gap-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white animate-pulse" title="Pengguna dengan sanksi ≥3 dan tidak ada log tilawah">
                <AlertTriangle size={10} /> Warning
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-0.5 font-medium"><Flame size={11} className="text-amber-500" /> {row.current_streak}</span>
            <span>Lv {row.level}</span>
            <span className="flex items-center gap-0.5"><Zap size={11} className="text-amber-500" /> {row.total_xp} XP</span>
            <span className="text-emerald-300 dark:text-emerald-700">•</span>
            <span className="flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><TrendingUp size={11} /> {row.weekly_xp}/mg</span>
          </div>
        </div>
      </div>

      {/* Footer: Status Hari Ini + Dynamic Badge + Score */}
      <div className="mt-2.5 flex items-center justify-between border-t border-black/5 pt-2 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-emerald-500 dark:text-emerald-400">Hari ini:</span>
          <PrayerStatusIcons status={row.prayer_status} />

          {/* Dynamic Badge Status */}
          {sanksiAktif > 0 ? (
            /* 1. KONDISI SANKSI AKTIF (Merah/Amber Pekat) */
            <span
              className={`ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                sanksiAktif >= 3
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/60 dark:text-red-300 border border-red-300 dark:border-red-800'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
              }`}
            >
              <ShieldAlert size={11} /> {sanksiAktif} Sanksi
            </span>
          ) : missedToday > 0 ? (
            /* 2. KONDISI TERLEWAT HARI INI (Amber/Kuning) */
            <span className="ml-1 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <AlertTriangle size={11} /> {missedToday} Terlewat
            </span>
          ) : (
            /* 3. KONDISI CLEAN 100% (0 Sanksi) */
            <span className="ml-1 flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck size={11} /> Clean
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <TrendingUp size={12} className="text-amber-500" />
          <span className="font-bold text-emerald-700 dark:text-emerald-200">{Math.round(row.formula_score || 0)}</span>
          <span className="text-emerald-500 dark:text-emerald-400">skor</span>
        </div>
      </div>
    </div>
  );
}