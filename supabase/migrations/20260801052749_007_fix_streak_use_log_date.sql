/*
# Fix Streak Calculation: Use NEW.log_date Instead of CURRENT_DATE

## Overview
The award_xp_and_update_streak trigger was using CURRENT_DATE (UTC) to
determine the starting point for the streak walk-back. In Indonesia
(UTC+7), at 1am local time the UTC date is still the previous day,
causing the streak to reset to 1 on the second day.

## Fix
- Use NEW.log_date (the actual date the user logged) as the starting
  point for the streak walk-back, instead of CURRENT_DATE.
- This ensures the streak counts consecutive calendar days based on
  the user's actual log dates, not the server's UTC clock.
*/

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
  -- Time-bonus XP based on new 3-slot system
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

  -- Recompute streak by walking backwards from the latest log date
  -- until a missing day is found. Uses NEW.log_date as starting point.
  SELECT MAX(log_date) INTO d FROM tilawah_logs WHERE user_id = NEW.user_id;
  IF d IS NULL THEN
    streak_count := 1;
  ELSE
    -- Walk backwards from the latest log date counting consecutive days
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
