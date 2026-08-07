/*
# Fix recovery trigger: also award +20 XP on recovery task completion
*/
CREATE OR REPLACE FUNCTION decrement_sanksi_on_recovery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  p_hutang int;
  p_xp int;
  new_level int;
BEGIN
  SELECT hutang_sanksi, xp INTO p_hutang, p_xp FROM profiles WHERE id = NEW.user_id;
  IF p_hutang IS NULL THEN p_hutang := 0; END IF;
  IF p_xp IS NULL THEN p_xp := 0; END IF;

  p_xp := p_xp + 20;
  new_level := GREATEST(1, FLOOR(p_xp / 100.0) + 1);

  UPDATE profiles
  SET hutang_sanksi = GREATEST(0, p_hutang - 1),
      xp = p_xp,
      level = new_level,
      updated_at = now()
  WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;
