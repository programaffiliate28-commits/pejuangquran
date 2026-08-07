/*
# Daily Sanksi Cron + Recovery Task Decrement

## Overview
1. Creates a pg_cron job that runs at 00:05 UTC daily.
   For each profile, checks if yesterday had ANY tilawah log.
   If not, increments hutang_sanksi by 1 and total_sanksi by 1.

2. Creates a trigger on recovery_tasks INSERT that decrements
   hutang_sanksi by 1 (minimum 0) when a new recovery task is submitted.

3. Fixes the revert_sanksi_on_recovery_delete trigger.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =========================================================
-- 1. Daily sanksi increment function
-- =========================================================
CREATE OR REPLACE FUNCTION apply_daily_sanksi()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  yesterday date := CURRENT_DATE - 1;
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM profiles WHERE rest_mode = false OR rest_mode IS NULL LOOP
    IF NOT EXISTS (
      SELECT 1 FROM tilawah_logs
      WHERE user_id = rec.id AND log_date = yesterday
    ) THEN
      UPDATE profiles
      SET hutang_sanksi = hutang_sanksi + 1,
          total_sanksi = COALESCE(total_sanksi, 0) + 1,
          updated_at = now()
      WHERE id = rec.id;
    END IF;
  END LOOP;
END;
$$;

-- Schedule the cron job (00:05 UTC daily)
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-sanksi-check') THEN
    PERFORM cron.schedule('daily-sanksi-check', '5 0 * * *', 'SELECT apply_daily_sanksi();');
  END IF;
END $do$;

-- =========================================================
-- 2. Trigger: decrement hutang_sanksi on recovery task insert
-- =========================================================
CREATE OR REPLACE FUNCTION decrement_sanksi_on_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_hutang int;
BEGIN
  SELECT hutang_sanksi INTO p_hutang FROM profiles WHERE id = NEW.user_id;
  IF p_hutang IS NOT NULL AND p_hutang > 0 THEN
    UPDATE profiles
    SET hutang_sanksi = GREATEST(0, hutang_sanksi - 1),
        updated_at = now()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_recovery_task_insert ON recovery_tasks;
CREATE TRIGGER on_recovery_task_insert
  AFTER INSERT ON recovery_tasks
  FOR EACH ROW
  EXECUTE FUNCTION decrement_sanksi_on_recovery();

-- =========================================================
-- 3. Fix revert trigger on recovery task delete
-- =========================================================
CREATE OR REPLACE FUNCTION revert_sanksi_on_recovery_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_xp int;
  p_hutang int;
  new_level int;
BEGIN
  IF OLD.status = 'approved' OR OLD.completed = true THEN
    SELECT xp, hutang_sanksi INTO p_xp, p_hutang
    FROM profiles WHERE id = OLD.user_id;

    p_xp := GREATEST(0, p_xp - 20);
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
