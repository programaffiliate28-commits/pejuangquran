/*
# Sanksi Recovery System, Avatars Bucket, Anti-Cheat XP, Leaderboard Overhaul

## Overview
This migration implements the complete penalty/recovery system overhaul:
1. Adds accumulating hutang_sanksi (penalty debt) to profiles — NOT reset daily.
2. Marks recovery task posts in tilawah_logs with is_recovery flag for separate feed tab.
3. Adds recovery_slot to recovery_tasks for 5-slot prayer-time task tracking.
4. Creates avatars storage bucket for profile photo uploads.
5. Adds anti-cheat XP deduction trigger when a tilawah_log is deleted.
6. Overhauls weekly_leaderboard() to include sanksi count, today's prayer status,
   a composite ranking formula, and locks users with >5 sanksi at the bottom.

## New Columns
- profiles.hutang_sanksi (int, default 0) — accumulating penalty debt, never reset daily.
- tilawah_logs.is_recovery (boolean, default false) — marks posts from recovery tasks.
- tilawah_logs.recovery_description (text, nullable) — description for recovery task posts.
- recovery_tasks.recovery_slot (text, nullable) — which prayer time slot (subuh/dzuhur/ashar/maghrib/isya).

## New Storage
- avatars bucket: public read, owner-only write/update/delete.

## New Functions
- deduct_xp_on_delete(): trigger on tilawah_logs DELETE — deducts xp_earned from profile,
  recomputes level, and recomputes streak if the deleted log's day becomes empty.
- weekly_leaderboard(): updated to return hutang_sanksi, prayer_status (text of 5 chars),
  formula_score, and tier (green/yellow/red). Users with hutang_sanksi > 5 sorted to bottom.

## Security
- avatars bucket: public read, owner-scoped write (folder = auth.uid()).
- All existing RLS policies remain unchanged.
*/

-- ========== Add hutang_sanksi to profiles ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'hutang_sanksi') THEN
    ALTER TABLE profiles ADD COLUMN hutang_sanksi int NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ========== Add is_recovery + recovery_description to tilawah_logs ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tilawah_logs' AND column_name = 'is_recovery') THEN
    ALTER TABLE tilawah_logs ADD COLUMN is_recovery boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tilawah_logs' AND column_name = 'recovery_description') THEN
    ALTER TABLE tilawah_logs ADD COLUMN recovery_description text;
  END IF;
END $$;

-- ========== Add recovery_slot to recovery_tasks ==========
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recovery_tasks' AND column_name = 'recovery_slot') THEN
    ALTER TABLE recovery_tasks ADD COLUMN recovery_slot text;
  END IF;
END $$;

-- ========== Create avatars storage bucket ==========
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ========== Anti-cheat: deduct XP on log delete ==========
CREATE OR REPLACE FUNCTION public.deduct_xp_on_delete()
RETURNS TRIGGER AS $$
DECLARE
  p_xp int;
  new_level int;
  p_cur_streak int;
  p_longest int;
  logs_on_that_day int;
  streak_count int;
  walk date;
  has_log boolean;
  latest_date date;
BEGIN
  SELECT xp, level, current_streak, longest_streak
  INTO p_xp, new_level, p_cur_streak, p_longest
  FROM profiles WHERE id = OLD.user_id;

  p_xp := GREATEST(0, p_xp - OLD.xp_earned);
  new_level := GREATEST(1, FLOOR(p_xp / 100) + 1);

  SELECT COUNT(*) INTO logs_on_that_day
  FROM tilawah_logs
  WHERE user_id = OLD.user_id AND log_date = OLD.log_date AND id <> OLD.id;

  IF logs_on_that_day = 0 THEN
    SELECT MAX(log_date) INTO latest_date FROM tilawah_logs WHERE user_id = OLD.user_id;
    IF latest_date IS NULL THEN
      streak_count := 0;
    ELSIF latest_date < CURRENT_DATE - 1 THEN
      streak_count := 0;
    ELSIF latest_date = CURRENT_DATE OR latest_date = CURRENT_DATE - 1 THEN
      streak_count := 0;
      walk := latest_date;
      LOOP
        SELECT EXISTS(
          SELECT 1 FROM tilawah_logs
          WHERE user_id = OLD.user_id AND log_date = walk
        ) INTO has_log;
        EXIT WHEN NOT has_log;
        streak_count := streak_count + 1;
        walk := walk - 1;
      END LOOP;
    ELSE
      streak_count := 0;
    END IF;
    p_cur_streak := streak_count;
  END IF;

  UPDATE profiles
  SET xp = p_xp,
      level = new_level,
      current_streak = p_cur_streak,
      longest_streak = GREATEST(p_longest, p_cur_streak),
      updated_at = now()
  WHERE id = OLD.user_id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tilawah_log_delete ON tilawah_logs;
CREATE TRIGGER on_tilawah_log_delete
  BEFORE DELETE ON tilawah_logs
  FOR EACH ROW EXECUTE FUNCTION public.deduct_xp_on_delete();

-- ========== Overhauled weekly_leaderboard() ==========
DROP FUNCTION IF EXISTS public.weekly_leaderboard();

CREATE FUNCTION public.weekly_leaderboard()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  role text,
  weekly_xp int,
  total_xp int,
  level int,
  current_streak int,
  hutang_sanksi int,
  prayer_status text,
  formula_score numeric,
  tier text,
  rank int
) AS $$
WITH week_logs AS (
  SELECT user_id, SUM(xp_earned) AS weekly_xp
  FROM tilawah_logs
  WHERE created_at >= date_trunc('week', now()) AND is_recovery = false
  GROUP BY user_id
),
today_prayers AS (
  SELECT user_id,
    MAX(CASE WHEN prayer_time = 'subuh' THEN 1 ELSE 0 END) AS p_subuh,
    MAX(CASE WHEN prayer_time = 'dzuhur' THEN 1 ELSE 0 END) AS p_dzuhur,
    MAX(CASE WHEN prayer_time = 'ashar' THEN 1 ELSE 0 END) AS p_ashar,
    MAX(CASE WHEN prayer_time = 'maghrib' THEN 1 ELSE 0 END) AS p_maghrib,
    MAX(CASE WHEN prayer_time = 'isya' THEN 1 ELSE 0 END) AS p_isya
  FROM tilawah_logs
  WHERE log_date = CURRENT_DATE AND is_recovery = false
  GROUP BY user_id
),
week_minutes AS (
  SELECT user_id, SUM(duration_minutes) AS total_minutes
  FROM tilawah_logs
  WHERE created_at >= date_trunc('week', now()) AND is_recovery = false
  GROUP BY user_id
),
week_ayat AS (
  SELECT user_id, SUM(ayat_end - ayat_start + 1) AS total_ayat
  FROM tilawah_logs
  WHERE created_at >= date_trunc('week', now()) AND is_recovery = false
  GROUP BY user_id
)
SELECT
  p.id AS user_id,
  p.full_name,
  p.avatar_url,
  p.role,
  COALESCE(w.weekly_xp, 0)::int AS weekly_xp,
  p.xp AS total_xp,
  p.level,
  p.current_streak,
  p.hutang_sanksi,
  COALESCE(
    tp.p_subuh::text || tp.p_dzuhur::text || tp.p_ashar::text || tp.p_maghrib::text || tp.p_isya::text,
    '00000'
  ) AS prayer_status,
  (
    COALESCE(wm.total_minutes, 0) * 0.3 +
    COALESCE(wa.total_ayat, 0) * 0.2 +
    (p.current_streak * 10 + COALESCE(w.weekly_xp, 0)) * 0.5
  ) AS formula_score,
  CASE
    WHEN p.hutang_sanksi > 3 THEN 'red'
    WHEN p.hutang_sanksi >= 1 THEN 'yellow'
    ELSE 'green'
  END AS tier,
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN p.hutang_sanksi > 5 THEN 1 ELSE 0 END,
      COALESCE(w.weekly_xp, 0) DESC,
      p.xp DESC
  ) AS rank
FROM profiles p
LEFT JOIN week_logs w ON w.user_id = p.id
LEFT JOIN today_prayers tp ON tp.user_id = p.id
LEFT JOIN week_minutes wm ON wm.user_id = p.id
LEFT JOIN week_ayat wa ON wa.user_id = p.id
WHERE NOT p.rest_mode
ORDER BY
  CASE WHEN p.hutang_sanksi > 5 THEN 1 ELSE 0 END,
  weekly_xp DESC, total_xp DESC;
$$ LANGUAGE sql SECURITY DEFINER;
