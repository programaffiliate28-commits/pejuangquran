import type { Profile, TilawahLog, PrayerTime } from './types';
import { PRAYER_TIMES } from './constants';

/**
 * === TESTING TOGGLE ===
 * Set ke `true` untuk memaksa tanggal 2026-08-04 (4 Agustus 2026).
 * Set ke `false` untuk menggunakan tanggal asli hari ini.
 */
export const IS_TESTING = false;
const TEST_DATE = '2026-08-04';

/** Tanggal saat ini (objek Date). Dipakai untuk semua logika tanggal. */
export function getNow(): Date {
  if (IS_TESTING) return new Date(TEST_DATE + 'T12:00:00');
  return new Date();
}

/** Tanggal hari ini dalam format YYYY-MM-DD. */
export function todayISODate(): string {
  const d = getNow();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export interface DayStatus {
  prayer_time: PrayerTime;
  status: 'belum' | 'selesai' | 'terlewat';
  log?: TilawahLog;
  isExtra?: boolean;
}

/**
 * Evaluates the 3 main time slots + 1 extra slot for today.
 * A slot is "selesai" if a log exists; "terlewat" if the time window
 * has passed with no log; else "belum".
 * The "extra" (Fastabiqul Khairat) slot is never marked "terlewat".
 */
export function getTodaySlots(
  logs: TilawahLog[],
  todayDate: string
): DayStatus[] {
  const hour = getNow().getHours();
  const passedAfter: Record<PrayerTime, number> = {
    pagi: 12,
    siang: 16,
    sore: 24,
    extra: 24,
  };

  return PRAYER_TIMES.map((p) => {
    const log = logs.find((l) => l.prayer_time === p.id && l.log_date === todayDate);
    if (log) {
      return { prayer_time: p.id, status: 'selesai' as const, log, isExtra: p.isExtra };
    }
    const missed = hour >= passedAfter[p.id];
    return {
      prayer_time: p.id,
      status: missed ? 'terlewat' as const : 'belum' as const,
      isExtra: p.isExtra,
    };
  });
}

/**
 * Decide whether to increment strikes based on consecutive missed days.
 * A "missed day" = a past date (before today) where the user logged nothing.
 * We count consecutive missed days ending yesterday. If that count >= 3 and
 * strikes haven't been bumped for this stretch, increment.
 *
 * Returns the new strike count, or null if no change needed.
 */
export function evaluateStrikes(profile: Profile, allLogDates: string[]): { strikes: number; missedDays: number } | null {
  if (profile.rest_mode) return null;
  const today = todayISODate();
  const logDateSet = new Set(allLogDates);

  let missedDays = 0;
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const ds = cursor.toISOString().slice(0, 10);
    if (!logDateSet.has(ds)) {
      missedDays++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  const nextThreshold = (profile.strikes + 1) * 3;
  if (missedDays >= nextThreshold && profile.strikes < 3) {
    const newStrikes = profile.strikes + 1;
    return { strikes: newStrikes, missedDays };
  }
  return null;
}

export function shouldEnterRestMode(strikes: number): boolean {
  return strikes >= 3;
}

export interface RecoveryTaskDef {
  task_type: 'ringkasan_ceramah' | 'tafsir_hadits' | 'asbabun_nuzul';
  description: string;
}

export const RECOVERY_TASK_OPTIONS: RecoveryTaskDef[] = [
  {
    task_type: 'ringkasan_ceramah',
    description: 'Tulis ringkasan singkat (3-5 kalimat) dari ceramah/kajian islami yang kamu ikuti atau tonton.',
  },
  {
    task_type: 'tafsir_hadits',
    description: 'Bagikan 1 hadits shahih beserta tafsir/pesan utamanya secara ringkas.',
  },
  {
    task_type: 'asbabun_nuzul',
    description: 'Bagikan asbabun nuzul (kisah turunnya) 1 ayat Al-Qur\'an pilihanmu.',
  },
];

/**
 * Sanksi (penalty debt) increments: each missed day (no logs at all)
 * adds +1 to hutang_sanksi. This is accumulating and never reset daily.
 * Returns the number of consecutive missed days ending yesterday.
 */
export function countMissedSlots(allLogDates: string[]): number {
  const today = todayISODate();
  const logDateSet = new Set(allLogDates);
  let missedDays = 0;
  let cursor = new Date(today);
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 30; i++) {
    const ds = cursor.toISOString().slice(0, 10);
    if (!logDateSet.has(ds)) {
      missedDays++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return missedDays;
}

/**
 * The 3 main (required) time slots — excludes "extra".
 */
export const MAIN_TIME_SLOTS: PrayerTime[] = ['pagi', 'siang', 'sore'];

/**
 * Check if the user has completed all 3 required slots for a given day.
 * A day is "complete" if at least one log exists for each of pagi, siang, sore.
 * The "extra" slot is optional and not required.
 */
export function isDayComplete(logs: TilawahLog[], dateStr: string): boolean {
  const dayLogs = logs.filter((l) => l.log_date === dateStr && !l.is_recovery);
  const doneSlots = new Set(dayLogs.map((l) => l.prayer_time));
  return MAIN_TIME_SLOTS.every((s) => doneSlots.has(s));
}

/**
 * Check if a specific past day was completely missed (no logs at all).
 * Used for the daily grace period sanction system.
 */
export function wasDayMissed(logs: TilawahLog[], dateStr: string): boolean {
  const dayLogs = logs.filter((l) => l.log_date === dateStr && !l.is_recovery);
  return dayLogs.length === 0;
}
