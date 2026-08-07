/*
# Leaderboard Transparency Fix — Show All Users

## Overview
Removes the `WHERE NOT p.rest_mode` filter from weekly_leaderboard() so that
ALL users appear in the leaderboard transparently. The rest_mode flag is no
longer used to hide anyone. Instead, users with hutang_sanksi > 3 are visually
marked red and sorted to the bottom as a reminder — never hidden.

## Changes
- weekly_leaderboard(): removed `WHERE NOT p.rest_mode` clause.
- Tier logic: green = sanksi=0 AND streak>=1; yellow = sanksi 1-3; red = sanksi>3.
- Sort: sanksi>5 first bucket (bottom), then by weekly_xp, then total_xp.
- All existing columns and return types unchanged.
*/

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
    WHEN p.hutang_sanksi = 0 AND p.current_streak >= 1 THEN 'green'
    ELSE 'yellow'
  END AS tier,
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN p.hutang_sanksi > 5 THEN 1 ELSE 0 END,
      CASE WHEN p.hutang_sanksi > 3 THEN 1 ELSE 0 END,
      COALESCE(w.weekly_xp, 0) DESC,
      p.xp DESC
  ) AS rank
FROM profiles p
LEFT JOIN week_logs w ON w.user_id = p.id
LEFT JOIN today_prayers tp ON tp.user_id = p.id
LEFT JOIN week_minutes wm ON wm.user_id = p.id
LEFT JOIN week_ayat wa ON wa.user_id = p.id
ORDER BY
  CASE WHEN p.hutang_sanksi > 5 THEN 1 ELSE 0 END,
  CASE WHEN p.hutang_sanksi > 3 THEN 1 ELSE 0 END,
  weekly_xp DESC, total_xp DESC;
$$ LANGUAGE sql SECURITY DEFINER;
