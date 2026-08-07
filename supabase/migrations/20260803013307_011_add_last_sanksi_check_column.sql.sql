-- Add last_sanksi_check column to track when the client-side daily sanksi check last ran.
-- This prevents double-incrementing hutang_sanksi for the same missed day.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sanksi_check date;

-- Drop the decrement_sanksi_on_recovery trigger since the frontend now handles
-- the hutang_sanksi decrement and XP increment directly in submitRecoveryTask.
DROP TRIGGER IF EXISTS on_recovery_task_insert ON recovery_tasks;
DROP FUNCTION IF EXISTS decrement_sanksi_on_recovery();
