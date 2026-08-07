/*
# Refactor: 3 Time Slots + Fastabiqul Khairat + Recovery Task Revert

## Overview
Refactors tilawah logging from 5 prayer-time slots to 3 main slots
(Pagi, Siang, Sore/Malam) + 1 optional "Fastabiqul Khairat" extra slot.
Streamlines recovery task types to 3 options. Adds trigger to revert
hutang_sanksi when a recovery task is deleted.

## Changes
1. tilawah_logs.prayer_time: subuh/dzuhur/ashar/maghrib/isya -> pagi/siang/sore/extra
2. recovery_tasks.task_type: extra_page/kajian_resume/tafsir_short -> ringkasan_ceramah/tafsir_hadits/asbabun_nuzul
3. recovery_tasks: add content, image_url, status columns if missing
4. New trigger: revert_sanksi_on_recovery_delete (+1 sanksi, -20 XP)
5. Updated award_xp_and_update_streak for new slot names + extra bonus
6. Updated weekly_leaderboard: 3-slot prayer_status, all users shown

## Security
- No RLS changes. New trigger runs as SECURITY DEFINER.
*/

-- ============================================================
-- 1. Drop old CHECK FIRST, then migrate data, then add new CHECK
-- ============================================================
ALTER TABLE tilawah_logs DROP CONSTRAINT IF EXISTS tilawah_logs_prayer_time_check;

UPDATE tilawah_logs SET prayer_time = 'pagi'  WHERE prayer_time = 'subuh';
UPDATE tilawah_logs SET prayer_time = 'siang' WHERE prayer_time = 'dzuhur';
UPDATE tilawah_logs SET prayer_time = 'siang' WHERE prayer_time = 'ashar';
UPDATE tilawah_logs SET prayer_time = 'sore'  WHERE prayer_time = 'maghrib';
UPDATE tilawah_logs SET prayer_time = 'sore'  WHERE prayer_time = 'isya';

ALTER TABLE tilawah_logs ADD CONSTRAINT tilawah_logs_prayer_time_check
  CHECK (prayer_time = ANY (ARRAY['pagi'::text, 'siang'::text, 'sore'::text, 'extra'::text]));

-- ============================================================
-- 2. Migrate recovery_tasks.task_type values
-- ============================================================
ALTER TABLE recovery_tasks DROP CONSTRAINT IF EXISTS recovery_tasks_task_type_check;

UPDATE recovery_tasks SET task_type = 'ringkasan_ceramah' WHERE task_type = 'extra_page';
UPDATE recovery_tasks SET task_type = 'ringkasan_ceramah' WHERE task_type = 'kajian_resume';
UPDATE recovery_tasks SET task_type = 'tafsir_hadits'      WHERE task_type = 'tafsir_short';

ALTER TABLE recovery_tasks ADD CONSTRAINT recovery_tasks_task_type_check
  CHECK (task_type = ANY (ARRAY['ringkasan_ceramah'::text, 'tafsir_hadits'::text, 'asbabun_nuzul'::text]));

-- ============================================================
-- 3. Add columns to recovery_tasks if missing
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_tasks' AND column_name='content') THEN
    ALTER TABLE recovery_tasks ADD COLUMN content text DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_tasks' AND column_name='image_url') THEN
    ALTER TABLE recovery_tasks ADD COLUMN image_url text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recovery_tasks' AND column_name='status') THEN
    ALTER TABLE recovery_tasks ADD COLUMN status text DEFAULT 'approved';
  END IF;
END $$;

-- ============================================================
-- 4. Trigger: revert_sanksi_on_recovery_delete
-- ============================================================
CREATE OR REPLACE FUNCTION revert_sanksi_on_recovery_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_xp int;
  p_hutang int;
  new_level int;
  xp_to_deduct int;
BEGIN
  IF OLD.status = 'approved' OR OLD.completed = true THEN
    SELECT xp, hutang_sanksi INTO p_xp, p_hutang
    FROM profiles WHERE id = OLD.user_id;

    xp_to_deduct := 20;
    p_xp := GREATEST(0, p_xp - xp_to_deduct);
    p_hutang := p_hutang + 1;
    new_level := GREATEST(1, FLOOR(p_xp / 100.0) + 1);

    UPDATE profiles
    SET xp = p_xp,
        level = new_level,
        hutang_sanksi = p_hutang,
        updated_at = now()
    WHERE id = OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_recovery_task_delete ON recovery_tasks;
CREATE TRIGGER on_recovery_task_delete
  BEFORE DELETE ON recovery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION revert_sanksi_on_recovery_delete();

-- ============================================================
-- 5. Updated award_xp_and_update_streak trigger
-- ============================================================
CREATE OR REPLACE FUNCTION award_xp_and_update_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_xp int;
  p_level int;
  p_cur_streak int;
  p_longest int;
  p_last date;
  time_bonus int;
  total_xp int;
  new_level int;
  streak_count int;
  d date;
  walk date;
  has_log boolean;
BEGIN
  time_bonus := CASE
    WHEN NEW.prayer_time = 'pagi'  AND EXTRACT(HOUR FROM NEW.created_at) < 10 THEN 5
    WHEN NEW.prayer_time = 'siang' AND EXTRACT(HOUR FROM NEW.created_at) BETWEEN 10 AND 15 THEN 5
    WHEN NEW.prayer_time = 'sore'  AND EXTRACT(HOUR FROM NEW.created_at) >= 16 THEN 5
    WHEN NEW.prayer_time = 'extra' THEN 10
    ELSE 0
  END;
  total_xp := 15 + time_bonus;
  NEW.xp_earned := total_xp;

  SELECT xp, level, current_streak, longest_streak, last_log_date
  INTO p_xp, p_level, p_cur_streak, p_longest, p_last
  FROM profiles WHERE id = NEW.user_id;

  SELECT MAX(log_date) INTO d FROM tilawah_logs WHERE user_id = NEW.user_id;
  IF d IS NULL THEN
    streak_count := 1;
  ELSE
    IF d < CURRENT_DATE - 1 THEN
      streak_count := 1;
    ELSIF d = CURRENT_DATE OR d = CURRENT_DATE - 1 THEN
      streak_count := 0;
      walk := d;
      LOOP
        SELECT EXISTS(
          SELECT 1 FROM tilawah_logs
          WHERE user_id = NEW.user_id AND log_date = walk
        ) INTO has_log;
        EXIT WHEN NOT has_log;
        streak_count := streak_count + 1;
        walk := walk - 1;
      END LOOP;
    ELSE
      streak_count := 1;
    END IF;
  END IF;

  p_cur_streak := streak_count;
  IF p_cur_streak > p_longest THEN
    p_longest := p_cur_streak;
  END IF;

  new_level := GREATEST(1, FLOOR((p_xp + total_xp) / 100) + 1);

  UPDATE profiles
  SET xp = xp + total_xp,
      level = new_level,
      current_streak = p_cur_streak,
      longest_streak = p_longest,
      last_log_date = NEW.log_date,
      updated_at = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 6. Updated weekly_leaderboard function
-- ============================================================
CREATE OR REPLACE FUNCTION weekly_leaderboard()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  avatar_url text,
  role text,
  weekly_xp integer,
  total_xp integer,
  level integer,
  current_streak integer,
  hutang_sanksi integer,
  prayer_status text,
  formula_score numeric,
  tier text,
  rank integer
)
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH week_logs AS (
  SELECT user_id, SUM(xp_earned) AS weekly_xp
  FROM tilawah_logs
  WHERE created_at >= date_trunc('week', now()) AND is_recovery = false
  GROUP BY user_id
),
today_prayers AS (
  SELECT user_id,
    MAX(CASE WHEN prayer_time = 'pagi'  THEN 1 ELSE 0 END) AS p_pagi,
    MAX(CASE WHEN prayer_time = 'siang' THEN 1 ELSE 0 END) AS p_siang,
    MAX(CASE WHEN prayer_time = 'sore'  THEN 1 ELSE 0 END) AS p_sore,
    MAX(CASE WHEN prayer_time = 'extra' THEN 1 ELSE 0 END) AS p_extra
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
),
user_log_count AS (
  SELECT user_id, COUNT(*) AS log_count
  FROM tilawah_logs
  WHERE is_recovery = false
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
    tp.p_pagi::text || tp.p_siang::text || tp.p_sore::text || tp.p_extra::text,
    '0000'
  ) AS prayer_status,
  (
    COALESCE(wm.total_minutes, 0) * 0.3 +
    COALESCE(wa.total_ayat, 0) * 0.2 +
    (p.current_streak * 10 + COALESCE(w.weekly_xp, 0)) * 0.5
  ) AS formula_score,
  CASE
    WHEN p.hutang_sanksi > 3 THEN 'red'
    WHEN p.hutang_sanksi >= 1 THEN 'yellow'
    WHEN p.hutang_sanksi = 0 AND p.current_streak >= 1 THEN 'green'
    ELSE 'yellow'
  END AS tier,
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN p.hutang_sanksi > 3 AND COALESCE(ulc.log_count, 0) = 0 THEN 1 ELSE 0 END,
      CASE WHEN p.hutang_sanksi > 3 THEN 1 ELSE 0 END,
      COALESCE(w.weekly_xp, 0) DESC,
      p.xp DESC
  ) AS rank
FROM profiles p
LEFT JOIN week_logs w ON w.user_id = p.id
LEFT JOIN today_prayers tp ON tp.user_id = p.id
LEFT JOIN week_minutes wm ON wm.user_id = p.id
LEFT JOIN week_ayat wa ON wa.user_id = p.id
LEFT JOIN user_log_count ulc ON ulc.user_id = p.id
ORDER BY
  CASE WHEN p.hutang_sanksi > 3 AND COALESCE(ulc.log_count, 0) = 0 THEN 1 ELSE 0 END,
  CASE WHEN p.hutang_sanksi > 3 THEN 1 ELSE 0 END,
  weekly_xp DESC, total_xp DESC;
$$;
