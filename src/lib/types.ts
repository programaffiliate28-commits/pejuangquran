export type PrayerTime = 'pagi' | 'siang' | 'sore' | 'extra';
export type Role = 'pengajar' | 'anggota';
export type ReactionKind = 'masyaallah' | 'semangat' | 'barakallah';
export type RecoveryTaskType = 'ringkasan_ceramah' | 'tafsir_hadits' | 'asbabun_nuzul';
export type SlotStatus = 'belum' | 'selesai' | 'terlewat';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  target_minutes: number;
  avatar_url: string | null;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_log_date: string | null;
  strikes: number;
  rest_mode: boolean;
  hutang_sanksi: number;
  total_sanksi?: number;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface TilawahLog {
  id: string;
  user_id: string;
  prayer_time: PrayerTime;
  log_date: string;
  juz: number;
  surah_name: string;
  ayat_start: number;
  ayat_end: number;
  page: number | null;
  photo_url: string | null;
  duration_minutes: number;
  tadabbur: string | null;
  xp_earned: number;
  is_recovery: boolean;
  recovery_description: string | null;
  created_at: string;
}

export interface Reaction {
  id: string;
  log_id: string;
  user_id: string;
  kind: ReactionKind;
  created_at: string;
}

export interface RecoveryTask {
  id: string;
  user_id: string;
  task_type: RecoveryTaskType;
  description: string;
  completed: boolean;
  recovery_slot: PrayerTime | null;
  created_at: string;
  completed_at: string | null;
}

export interface FeedItem extends TilawahLog {
  profile?: Pick<Profile, 'full_name' | 'avatar_url' | 'role' | 'level'>;
  reactions?: Reaction[];
  my_reaction?: ReactionKind | null;
}

export interface LeaderboardRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: Role;
  weekly_xp: number;
  total_xp: number;
  level: number;
  current_streak: number;
  hutang_sanksi: number;
  prayer_status: string;
  formula_score: number;
  tier: 'green' | 'yellow' | 'red';
  rank: number;
}

export interface TadabburResponse {
  tadabbur?: string;
  error?: string;
}

export interface CoachAnalysis {
  summary: string;
  daily_missed: string[];
  daily_tip: string;
  weakest_time: string;
  weekly_missed_count: number;
  weekly_analysis: string;
  solutions: string[];
  error?: string;
}
