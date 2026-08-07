/*
# Fix Streak Recalculation on Delete: Use Latest Log Date

## Overview
The deduct_xp_on_delete trigger used CURRENT_DATE to decide whether to
recompute the streak, which caused incorrect streak values in non-UTC
timezones. This fix walks backwards from the latest remaining log date
after a delete, regardless of the server's UTC clock.
*/

CREATE OR REPLACE FUNCTION deduct_xp_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

  -- Check if there are other logs on the same day as the deleted one
  SELECT COUNT(*) INTO logs_on_that_day
  FROM tilawah_logs
  WHERE user_id = OLD.user_id AND log_date = OLD.log_date AND id <> OLD.id;

  -- Only recompute streak if the deleted log was the only one for that day
  IF logs_on_that_day = 0 THEN
    -- Walk backwards from the latest remaining log date
    SELECT MAX(log_date) INTO latest_date FROM tilawah_logs WHERE user_id = OLD.user_id;
    IF latest_date IS NULL THEN
      streak_count := 0;
    ELSE
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
$$;
