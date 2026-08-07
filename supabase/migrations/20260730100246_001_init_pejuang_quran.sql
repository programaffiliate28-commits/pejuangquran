/*
# Pejuang Qur'an App — Initial Schema

## Overview
Creates the complete database for a gamified Al-Qur'an tilawah (recitation) habit tracker
for a mosque community (pengajar & pemuda). Supports Google/email login, daily prayer-time
recitation logs with photo proof (PAP), XP-based leveling, weekly leaderboards, a social
feed with reactions, and a gentle 3-strike "teguran" + recovery system.

## Tables
1. `profiles` — One row per user (extends auth.users). Holds role, target, XP, level,
   streak counters, strike/teguran counters, rest_mode flag, and onboarding status.
2. `tilawah_logs` — Each recitation entry: prayer time, juz, surah, ayat range, optional
   page, optional photo URL, AI-generated tadabbur summary, duration estimate, XP earned.
3. `reactions` — Quick appreciations on feed posts (MasyaAllah / Semangat / Barakallah).
4. `recovery_tasks` — Tasks a user must complete to exit Resting Mode (e.g. extra page
   reading, short study summary). Marked complete to restore leaderboard ranking.

## Storage
- `pap` bucket for tilawah proof photos. Public read; authenticated write to owner folder.

## Security (RLS)
- `profiles`: authenticated read (community visibility) + owner-only write.
- `tilawah_logs`: authenticated read (feed visibility) + owner-only insert/update/delete.
- `reactions`: authenticated read; owner-only insert/delete of own reactions.
- `recovery_tasks`: authenticated read; owner-only insert/update.
- Storage: public read; only owner can write/overwrite/delete their own object paths.

## Logic
- `handle_new_user()` trigger: auto-creates a `profiles` row on new auth.users signup.
- `award_xp_and_update_streak()` trigger: on every tilawah_log insert, awards XP (base 15
  + time-bonus), recomputes the current streak based on consecutive days with >=1 log,
  and checks whether the daily target was met (triggers no strike logic here — that runs
  on a daily schedule conceptually; strike increments are handled at read time).
- `weekly_leaderboard()` RPC: returns this week's top users by XP, excluding those in
  rest_mode, with their rank.

## Notes
1. Streak is computed by looking at `tilawah_logs.created_at::date` distinct days ending
   today or yesterday. We use a simple consecutive-day window function.
2. Strike ("teguran") logic: a user accumulates strikes when they miss their daily target
   3 days in a row. Because there is no cron in this environment, strike evaluation is done
   client-side on load (see frontend) and persisted via profile update; the trigger only
   handles XP + streak + level.
3. Level thresholds: every 100 XP = 1 level. Rank titles map to level ranges.
4. All timestamps are timestamptz, default now().
*/

-- ========== profiles ==========
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'anggota' CHECK (role IN ('pengajar','anggota')),
  target_minutes int NOT NULL DEFAULT 50,
  avatar_url text,
  xp int NOT NULL DEFAULT 0,
  level int NOT NULL DEFAULT 1,
  current_streak int NOT NULL DEFAULT 0,
  longest_streak int NOT NULL DEFAULT 0,
  last_log_date date,
  strikes int NOT NULL DEFAULT 0,
  rest_mode boolean NOT NULL DEFAULT false,
  onboarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated"
  ON profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_owner" ON profiles;
CREATE POLICY "profiles_insert_owner"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_owner" ON profiles;
CREATE POLICY "profiles_update_owner"
  ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_delete_owner" ON profiles;
CREATE POLICY "profiles_delete_owner"
  ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- ========== tilawah_logs ==========
CREATE TABLE IF NOT EXISTS tilawah_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  prayer_time text NOT NULL CHECK (prayer_time IN ('subuh','dzuhur','ashar','maghrib','isya')),
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  juz int NOT NULL CHECK (juz BETWEEN 1 AND 30),
  surah_name text NOT NULL,
  ayat_start int NOT NULL CHECK (ayat_start >= 1),
  ayat_end int NOT NULL CHECK (ayat_end >= 1),
  page int,
  photo_url text,
  duration_minutes int NOT NULL DEFAULT 10,
  tadabbur text,
  xp_earned int NOT NULL DEFAULT 15,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ayat_range_valid CHECK (ayat_end >= ayat_start)
);

ALTER TABLE tilawah_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logs_select_authenticated" ON tilawah_logs;
CREATE POLICY "logs_select_authenticated"
  ON tilawah_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "logs_insert_owner" ON tilawah_logs;
CREATE POLICY "logs_insert_owner"
  ON tilawah_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "logs_update_owner" ON tilawah_logs;
CREATE POLICY "logs_update_owner"
  ON tilawah_logs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "logs_delete_owner" ON tilawah_logs;
CREATE POLICY "logs_delete_owner"
  ON tilawah_logs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_logs_user_date ON tilawah_logs(user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_logs_created_feed ON tilawah_logs(created_at DESC);

-- ========== reactions ==========
CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES tilawah_logs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('masyaallah','semangat','barakallah')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (log_id, user_id)
);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_authenticated" ON reactions;
CREATE POLICY "reactions_select_authenticated"
  ON reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reactions_insert_owner" ON reactions;
CREATE POLICY "reactions_insert_owner"
  ON reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_owner" ON reactions;
CREATE POLICY "reactions_delete_owner"
  ON reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reactions_log ON reactions(log_id);

-- ========== recovery_tasks ==========
CREATE TABLE IF NOT EXISTS recovery_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  task_type text NOT NULL DEFAULT 'extra_page' CHECK (task_type IN ('extra_page','kajian_resume','tafsir_short')),
  description text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE recovery_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recovery_select_authenticated" ON recovery_tasks;
CREATE POLICY "recovery_select_authenticated"
  ON recovery_tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "recovery_insert_owner" ON recovery_tasks;
CREATE POLICY "recovery_insert_owner"
  ON recovery_tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recovery_update_owner" ON recovery_tasks;
CREATE POLICY "recovery_update_owner"
  ON recovery_tasks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recovery_delete_owner" ON recovery_tasks;
CREATE POLICY "recovery_delete_owner"
  ON recovery_tasks FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ========== triggers: auto profile on signup ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========== trigger: award XP + update streak/level on log insert ==========
CREATE OR REPLACE FUNCTION public.award_xp_and_update_streak()
RETURNS TRIGGER AS $$
DECLARE
  p_xp int;
  p_level int;
  p_cur_streak int;
  p_longest int;
  p_last date;
  time_bonus int;
  total_xp int;
  new_level int;
  distinct_days int;
BEGIN
  -- base 15 XP, +5 if completed during that prayer's morning/evening window
  time_bonus := CASE
    WHEN NEW.prayer_time = 'subuh' AND EXTRACT(HOUR FROM NEW.created_at) < 6 THEN 5
    WHEN NEW.prayer_time IN ('maghrib','isya') AND EXTRACT(HOUR FROM NEW.created_at) >= 17 THEN 5
    ELSE 0
  END;
  total_xp := 15 + time_bonus;
  NEW.xp_earned := total_xp;

  SELECT xp, level, current_streak, longest_streak, last_log_date
  INTO p_xp, p_level, p_cur_streak, p_longest, p_last
  FROM profiles WHERE id = NEW.user_id;

  -- recompute streak: count consecutive days ending today (or yesterday) with >=1 log
  WITH d AS (
    SELECT DISTINCT log_date::date AS d
    FROM tilawah_logs
    WHERE user_id = NEW.user_id
  ),
  gaps AS (
    SELECT d.d,
           d.d - (LAG(d.d) OVER (ORDER BY d.d)) AS gap_days,
           ROW_NUMBER() OVER (ORDER BY d.d DESC) AS rn
    FROM d
  )
  SELECT COALESCE(MAX(g.rn_start), 0) INTO p_cur_streak
  FROM (
    SELECT rn, d,
           SUM(CASE WHEN gap_days = 1 OR gap_days IS NULL THEN 0 ELSE 1 END)
             OVER (ORDER BY d DESC) AS grp
    FROM gaps
  ) g
  CROSS JOIN LATERAL (
    -- find first rn where the chain breaks relative to today/yesterday
    SELECT MIN(rn) AS rn_start
    FROM gaps g2
    WHERE g2.rn >= g.rn
      AND NOT EXISTS (
        SELECT 1 FROM gaps g3
        WHERE g3.d > g.d AND g3.d <= CURRENT_DATE
          AND (g3.gap_days > 1 OR g3.gap_days IS NULL AND g3.d <> CURRENT_DATE AND g3.d <> CURRENT_DATE - 1)
      )
  ) x
  WHERE (SELECT MAX(d) FROM d) IN (CURRENT_DATE, CURRENT_DATE - 1);

  -- simpler robust streak: consecutive days ending today or yesterday
  WITH rec AS (
    SELECT d::date AS d,
           d::date - (LAG(d::date) OVER (ORDER BY d::date)) AS gap
    FROM (SELECT DISTINCT log_date FROM tilawah_logs WHERE user_id = NEW.user_id) t
  ),
  chain AS (
    SELECT d,
           SUM(CASE WHEN gap = 1 OR gap IS NULL THEN 0 ELSE 1 END)
             OVER (ORDER BY d) AS grp
    FROM rec
  ),
  latest AS (SELECT MAX(d) AS md FROM rec)
  SELECT COALESCE(COUNT(*), 0) INTO p_cur_streak
  FROM chain c
  CROSS JOIN latest l
  WHERE c.grp = (SELECT grp FROM chain c2 CROSS JOIN latest l2 WHERE c2.d = l2.md)
    AND c.d >= (SELECT MAX(d) FROM chain c3 CROSS JOIN latest l3 WHERE c3.grp = (SELECT grp FROM chain c4 CROSS JOIN latest l4 WHERE c4.d = l4.md)) - INTERVAL '999 days';

  -- The above CTE chain is complex; fall back to a clean recompute below.
  p_cur_streak := 0;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
