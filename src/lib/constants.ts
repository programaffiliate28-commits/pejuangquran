import type { PrayerTime, ReactionKind } from './types';

export const PRAYER_TIMES: {
  id: PrayerTime;
  label: string;
  icon: string;
  recommended: string;
  baseMinutes: number;
  isExtra?: boolean;
}[] = [
  { id: 'pagi', label: 'Pagi', icon: 'sunrise', recommended: 'Setelah Subuh / pagi hari', baseMinutes: 10 },
  { id: 'siang', label: 'Siang', icon: 'sun', recommended: 'Setelah Dzuhur / sore hari', baseMinutes: 10 },
  { id: 'sore', label: 'Sore/Malam', icon: 'moon', recommended: 'Setelah Maghrib / malam', baseMinutes: 10 },
  { id: 'extra', label: 'Fastabiqul Khairat', icon: 'sparkles', recommended: 'Tilawah ekstra (opsional, +XP bonus)', baseMinutes: 10, isExtra: true },
];

export const REACTIONS: { id: ReactionKind; label: string; emoji: string; color: string }[] = [
  { id: 'masyaallah', label: 'MasyaAllah', emoji: '🤍', color: 'text-emerald-600' },
  { id: 'semangat', label: 'Semangat', emoji: '🔥', color: 'text-gold-500' },
  { id: 'barakallah', label: 'Barakallah', emoji: '✨', color: 'text-gold-600' },
];

export const SURAH_LIST: { name: string; ayat: number }[] = [
  { name: 'Al-Fatihah', ayat: 7 },
  { name: 'Al-Baqarah', ayat: 286 },
  { name: "Ali 'Imran", ayat: 200 },
  { name: 'An-Nisa', ayat: 176 },
  { name: 'Al-Maidah', ayat: 120 },
  { name: 'Al-An\'am', ayat: 165 },
  { name: 'Al-A\'raf', ayat: 206 },
  { name: 'Al-Anfal', ayat: 75 },
  { name: 'At-Taubah', ayat: 129 },
  { name: 'Yunus', ayat: 109 },
  { name: 'Hud', ayat: 123 },
  { name: 'Yusuf', ayat: 111 },
  { name: 'Ar-Ra\'d', ayat: 43 },
  { name: 'Ibrahim', ayat: 52 },
  { name: 'Al-Hijr', ayat: 99 },
  { name: 'An-Nahl', ayat: 128 },
  { name: 'Al-Isra', ayat: 111 },
  { name: 'Al-Kahf', ayat: 110 },
  { name: 'Maryam', ayat: 98 },
  { name: 'Taha', ayat: 135 },
  { name: 'Al-Anbiya', ayat: 112 },
  { name: 'Al-Hajj', ayat: 78 },
  { name: 'Al-Mu\'minun', ayat: 118 },
  { name: 'An-Nur', ayat: 64 },
  { name: 'Al-Furqan', ayat: 77 },
  { name: 'Asy-Syu\'ara', ayat: 227 },
  { name: 'An-Naml', ayat: 93 },
  { name: 'Al-Qasas', ayat: 88 },
  { name: 'Al-\'Ankabut', ayat: 69 },
  { name: 'Ar-Rum', ayat: 60 },
  { name: 'Luqman', ayat: 34 },
  { name: 'As-Sajdah', ayat: 30 },
  { name: 'Al-Ahzab', ayat: 73 },
  { name: 'Saba', ayat: 54 },
  { name: 'Fatir', ayat: 45 },
  { name: 'Ya-Sin', ayat: 83 },
  { name: 'As-Saffat', ayat: 182 },
  { name: 'Sad', ayat: 88 },
  { name: 'Az-Zumar', ayat: 75 },
  { name: 'Gafir', ayat: 85 },
  { name: 'Fussilat', ayat: 54 },
  { name: 'Asy-Syura', ayat: 53 },
  { name: 'Az-Zukhruf', ayat: 89 },
  { name: 'Ad-Dukhan', ayat: 59 },
  { name: 'Al-Jasiyah', ayat: 37 },
  { name: 'Al-Ahqaf', ayat: 35 },
  { name: 'Muhammad', ayat: 38 },
  { name: 'Al-Fath', ayat: 29 },
  { name: 'Al-Hujurat', ayat: 18 },
  { name: 'Qaf', ayat: 45 },
  { name: 'Adz-Dzariyat', ayat: 60 },
  { name: 'At-Tur', ayat: 49 },
  { name: 'An-Najm', ayat: 62 },
  { name: 'Al-Qamar', ayat: 55 },
  { name: 'Ar-Rahman', ayat: 78 },
  { name: 'Al-Waqi\'ah', ayat: 96 },
  { name: 'Al-Hadid', ayat: 29 },
  { name: 'Al-Mujadilah', ayat: 22 },
  { name: 'Al-Hasyr', ayat: 24 },
  { name: 'Al-Mumtahanah', ayat: 13 },
  { name: 'As-Saff', ayat: 14 },
  { name: 'Al-Jumu\'ah', ayat: 11 },
  { name: 'Al-Munafiqun', ayat: 11 },
  { name: 'At-Tagabun', ayat: 18 },
  { name: 'At-Talaq', ayat: 12 },
  { name: 'At-Tahrim', ayat: 12 },
  { name: 'Al-Mulk', ayat: 30 },
  { name: 'Al-Qalam', ayat: 52 },
  { name: 'Al-Haqqah', ayat: 52 },
  { name: 'Al-Ma\'arij', ayat: 44 },
  { name: 'Nuh', ayat: 28 },
  { name: 'Al-Jinn', ayat: 28 },
  { name: 'Al-Muzzammil', ayat: 20 },
  { name: 'Al-Muddassir', ayat: 56 },
  { name: 'Al-Qiyamah', ayat: 40 },
  { name: 'Al-Insan', ayat: 31 },
  { name: 'Al-Mursalat', ayat: 50 },
  { name: 'An-Naba', ayat: 40 },
  { name: 'An-Nazi\'at', ayat: 46 },
  { name: '\'Abasa', ayat: 42 },
  { name: 'At-Takwir', ayat: 29 },
  { name: 'Al-Infitar', ayat: 19 },
  { name: 'Al-Tatfif', ayat: 36 },
  { name: 'Al-Insyiqaq', ayat: 25 },
  { name: 'Al-Buruj', ayat: 22 },
  { name: 'At-Tariq', ayat: 17 },
  { name: 'Al-A\'la', ayat: 19 },
  { name: 'Al-Gasyiyah', ayat: 26 },
  { name: 'Al-Fajr', ayat: 30 },
  { name: 'Al-Balad', ayat: 20 },
  { name: 'Asy-Syams', ayat: 15 },
  { name: 'Al-Lail', ayat: 21 },
  { name: 'Ad-Duha', ayat: 11 },
  { name: 'Al-Insyirah', ayat: 8 },
  { name: 'At-Tin', ayat: 8 },
  { name: 'Al-\'Alaq', ayat: 19 },
  { name: 'Al-Qadr', ayat: 5 },
  { name: 'Al-Bayyinah', ayat: 8 },
  { name: 'Az-Zalzalah', ayat: 8 },
  { name: 'Al-\'Adiyat', ayat: 11 },
  { name: 'Al-Qari\'ah', ayat: 11 },
  { name: 'At-Takasur', ayat: 8 },
  { name: 'Al-\'Asr', ayat: 3 },
  { name: 'Al-Humazah', ayat: 9 },
  { name: 'Al-Fil', ayat: 5 },
  { name: 'Quraisy', ayat: 4 },
  { name: 'Al-Ma\'un', ayat: 7 },
  { name: 'Al-Kautsar', ayat: 3 },
  { name: 'Al-Kafirun', ayat: 6 },
  { name: 'An-Nasr', ayat: 3 },
  { name: 'Al-Lahab', ayat: 5 },
  { name: 'Al-Ikhlas', ayat: 4 },
  { name: 'Al-Falaq', ayat: 5 },
  { name: 'An-Nas', ayat: 6 },
];

export const DAILY_QUOTES: { text: string; source: string }[] = [
  { text: 'Bacalah Al-Qur\'an, karena ia akan datang pada hari kiamat sebagai pemberi syafaat kepada para pembacanya.', source: 'HR. Muslim' },
  { text: 'Sebaik-baik kalian adalah yang mempelajari Al-Qur\'an dan mengajarkannya.', source: 'HR. Bukhari' },
  { text: 'Perumpamaan orang mukmin yang membaca Al-Qur\'an seperti buah limau, harum baunya dan enak rasanya.', source: 'HR. Bukhari & Muslim' },
  { text: 'Siapa membaca satu huruf dari Kitabullah, maka baginya satu kebaikan, dan satu kebaikan dilipatgandakan menjadi sepuluh.', source: 'HR. Tirmidzi' },
  { text: 'Hati manusia berkarat sebagaimana besi berkarat, dan pembersihnya adalah Al-Qur\'an.', source: 'Ibnu Abbas' },
  { text: 'Tidaklah suatu kaum berkumpul di salah satu rumah Allah untuk membaca Kitabullah, melainkan turun ketenangan kepada mereka.', source: 'HR. Muslim' },
  { text: 'Al-Qur\'an adalah tali Allah yang kuat, dan merupakan cahaya yang nyata serta jalan yang lurus.', source: 'Mukhtashar Shahih Muslim' },
];

export const RANK_TITLES: { minLevel: number; title: string }[] = [
  { minLevel: 1, title: 'Pemula Baru' },
  { minLevel: 3, title: 'Pejuang Subuh' },
  { minLevel: 6, title: 'Pelita Tilawah' },
  { minLevel: 10, title: 'Ksatria Qur\'an' },
  { minLevel: 15, title: 'Hafidz Muda' },
  { minLevel: 20, title: 'Wali Tilawah' },
  { minLevel: 30, title: 'Sang Imam Cahaya' },
];

export function getRankTitle(level: number): string {
  let title = RANK_TITLES[0].title;
  for (const r of RANK_TITLES) {
    if (level >= r.minLevel) title = r.title;
  }
  return title;
}

export function xpForLevel(level: number): number {
  return (level - 1) * 100;
}

export function levelFromXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 100) + 1);
}

export function xpProgress(level: number, xp: number): { current: number; needed: number; percent: number; level: number; nextLevel: number; xpToNext: number } {
  const dynamicLevel = levelFromXp(xp);
  const base = xpForLevel(dynamicLevel);
  const current = Math.max(0, xp - base);
  const needed = 100;
  const xpToNext = Math.max(0, needed - current);
  return {
    current,
    needed,
    percent: Math.min(100, (current / needed) * 100),
    level: dynamicLevel,
    nextLevel: dynamicLevel + 1,
    xpToNext,
  };
}

export function getQuoteOfDay(): { text: string; source: string } {
  const day = new Date().getDay();
  return DAILY_QUOTES[day % DAILY_QUOTES.length];
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
