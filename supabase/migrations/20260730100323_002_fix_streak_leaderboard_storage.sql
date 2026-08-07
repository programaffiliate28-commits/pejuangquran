/*
# Fix streak trigger + leaderboard RPC + storage bucket

## Changes
1. Replace `award_xp_and_update_streak()` with a clean, correct implementation:
   - Awards base 15 XP + up to 5 time-bonus XP (subuh before 6am, maghrib/isya after 5pm).
   - Sets `xp_earned` on the new log.
   - Recomputes `current_streak` = number of consecutive calendar days (ending today or
     yesterday) that each have at least one tilawah_log for the user.
   - Updates `longest_streak` if the new streak exceeds it.
   - Recomputes `level` = FLOOR(xp / 100) + 1, minimum 1.
   - Updates `last_log_date`.
2. Add `weekly_leaderboard()` RPC: returns this week's (Mon-Sun) top users by XP earned
   from logs this week, plus their rank. Excludes users in rest_mode.
3. Create public `pap` storage bucket for proof photos and storage policies.
*/

-- Clean replacement of the trigger function
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
  streak_count int;
  d date;
  walk date;
  has_log boolean;
BEGIN
  -- Time-bonus XP
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

  -- Recompute streak by walking back from today/yesterday until a missing day
  -- Start point: today if there was already a log today (this insert counts), else yesterday
  SELECT MAX(log_date) INTO d FROM tilawah_logs WHERE user_id = NEW.user_id;
  IF d IS NULL THEN
    streak_count := 1;
  ELSE
    -- if the most recent log is older than yesterday, streak = 1 (just this new one today)
    IF d < CURRENT_DATE - 1 THEN
      streak_count := 1;
    ELSIF d = CURRENT_DATE OR d = CURRENT_DATE - 1 THEN
      -- walk backwards from the latest date counting consecutive days
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_tilawah_log_insert ON tilawah_logs;
CREATE TRIGGER on_tilawah_log_insert
  AFTER INSERT ON tilawah_logs
  FOR EACH ROW EXECUTE FUNCTION public.award_xp_and_update_streak();

-- ========== weekly_leaderboard RPC ==========
CREATE OR REPLACE FUNCTION public.weekly_leaderboard()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  role text,
  weekly_xp int,
  total_xp int,
  level int,
  current_streak int,
  rank int
) AS $$
WITH week_logs AS (
  SELECT user_id, SUM(xp_earned) AS weekly_xp
  FROM tilawah_logs
  WHERE created_at >= date_trunc('week', now())
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
  ROW_NUMBER() OVER (ORDER BY COALESCE(w.weekly_xp, 0) DESC, p.xp DESC) AS rank
FROM profiles p
LEFT JOIN week_logs w ON w.user_id = p.id
WHERE NOT p.rest_mode
ORDER BY weekly_xp DESC, total_xp DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ========== storage bucket for PAP photos ==========
INSERT INTO storage.buckets (id, name, public)
VALUES ('pap', 'pap', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pap_public_read" ON storage.objects;
CREATE POLICY "pap_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'pap');

DROP POLICY IF EXISTS "pap_owner_insert" ON storage.objects;
CREATE POLICY "pap_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pap' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "pap_owner_update" ON storage.objects;
CREATE POLICY "pap_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pap' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'pap' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "pap_owner_delete" ON storage.objects;
CREATE POLICY "pap_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pap' AND (storage.foldername(name))[1] = auth.uid()::text);
