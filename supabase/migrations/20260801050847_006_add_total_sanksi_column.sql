/*
# Add total_sanksi column to profiles

## Overview
Adds a `total_sanksi` integer column to the profiles table to track the
cumulative lifetime sanctions a user has received (separate from the
current outstanding `hutang_sanksi`). This is used by the recovery modal
to track lifetime stats.

## Changes
1. Add `total_sanksi` column (integer, default 0) to profiles if missing.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='total_sanksi') THEN
    ALTER TABLE profiles ADD COLUMN total_sanksi integer NOT NULL DEFAULT 0;
  END IF;
END $$;
