-- ============================================================================
-- Deemona Rasoi -- AI Household Nutrition & Kitchen OS
-- Core schema: households, members, meal plans, days, meals, grocery lists
-- Target: PostgreSQL 14+ (Neon). Safe to run multiple times (IF NOT EXISTS).
-- ============================================================================

-- gen_random_uuid() is built in on PG13+. pgcrypto kept as a safety net.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- users : account records for login (email/password and/or Google OAuth).
-- password_hash is NULL for Google-only accounts. google_sub links a Google
-- identity. households.user_id references these ids (plain UUID, not an FK).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name          TEXT NOT NULL DEFAULT '',
  google_sub    TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent upgrades for databases created before OAuth support was added.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_google_sub
  ON users(google_sub) WHERE google_sub IS NOT NULL;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- households : one row per family / kitchen
-- user_id is intentionally a plain UUID (no FK) so you can point it at your
-- existing Deemona auth users table without a migration ordering problem.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS households (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  name            TEXT NOT NULL DEFAULT 'My household',
  adults          INT  NOT NULL DEFAULT 2   CHECK (adults  >= 1 AND adults  <= 20),
  kids            INT  NOT NULL DEFAULT 0   CHECK (kids    >= 0 AND kids    <= 20),
  diet            TEXT NOT NULL DEFAULT 'Veg'
                    CHECK (diet IN ('Veg','Non-veg','Vegan','Jain','Satvik')),
  region          TEXT NOT NULL DEFAULT 'North Indian',
  max_cook_min    INT  NOT NULL DEFAULT 30  CHECK (max_cook_min BETWEEN 5 AND 240),
  goal            TEXT NOT NULL DEFAULT 'Balanced'
                    CHECK (goal IN ('Balanced','Weight loss','Muscle gain','Diabetic-friendly','Kids nutrition')),
  daily_budget_inr INT NOT NULL DEFAULT 350 CHECK (daily_budget_inr >= 0),
  allergies       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_households_user ON households(user_id);

DROP TRIGGER IF EXISTS trg_households_updated ON households;
CREATE TRIGGER trg_households_updated BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- household_members : optional per-person detail for the family nutrition
-- dashboard (individual protein targets, allergies).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS household_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  age_group       TEXT NOT NULL DEFAULT 'adult'
                    CHECK (age_group IN ('child','teen','adult','senior')),
  protein_target_g INT,
  allergies       TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_household ON household_members(household_id);

-- ---------------------------------------------------------------------------
-- meal_plans : one generated plan (a week or a month) for a household.
-- constraints_snapshot stores the exact inputs used, so a plan is reproducible
-- and auditable even after the household profile changes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title               TEXT NOT NULL DEFAULT 'Weekly plan',
  span                TEXT NOT NULL DEFAULT 'week' CHECK (span IN ('week','month')),
  occasion            TEXT NOT NULL DEFAULT 'Regular week',
  num_days            INT  NOT NULL DEFAULT 7,
  protein_target_g    INT  NOT NULL DEFAULT 0,
  constraints_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  week_start          DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_household ON meal_plans(household_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_plans_updated ON meal_plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON meal_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- meal_plan_days : the days within a plan (0-indexed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plan_days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         UUID NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  day_index       INT  NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  UNIQUE (plan_id, day_index)
);

CREATE INDEX IF NOT EXISTS idx_days_plan ON meal_plan_days(plan_id, day_index);

-- ---------------------------------------------------------------------------
-- meals : individual dishes. One per (day, meal_type).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id      UUID NOT NULL REFERENCES meal_plan_days(id) ON DELETE CASCADE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','snack','dinner')),
  dish_name   TEXT NOT NULL,
  protein_g   INT  NOT NULL DEFAULT 0,
  kcal        INT  NOT NULL DEFAULT 0,
  cook_min    INT  NOT NULL DEFAULT 0,
  is_veg      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day_id, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meals_day ON meals(day_id);

-- ---------------------------------------------------------------------------
-- grocery_lists : one consolidated list per plan (regenerating replaces it).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL UNIQUE REFERENCES meal_plans(id) ON DELETE CASCADE,
  total_inr   INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- grocery_items : line items. is_have supports future pantry subtraction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     UUID NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
  item        TEXT NOT NULL,
  quantity    TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'Other',
  cost_inr    INT  NOT NULL DEFAULT 0,
  is_have     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gitems_list ON grocery_items(list_id);

-- ---------------------------------------------------------------------------
-- pantry_items : what a household already has on hand. The grocery builder
-- subtracts these so the shopping list only contains what's missing.
-- expiry_date is reserved for the upcoming waste-tracking phase (unused now).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pantry_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  item         TEXT NOT NULL,
  quantity     TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'Other',
  expiry_date  DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pantry_household ON pantry_items(household_id);

DROP TRIGGER IF EXISTS trg_pantry_updated ON pantry_items;
CREATE TRIGGER trg_pantry_updated BEFORE UPDATE ON pantry_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- image_cache : caches Pexels photo lookups for dishes and ingredients, so we
-- query each name only once. An empty image_url means "checked, no photo" (use
-- the stylized card fallback) -- distinct from a missing row (not yet checked).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS image_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL,
  cache_key   TEXT NOT NULL,
  image_url   TEXT NOT NULL DEFAULT '',
  credit_name TEXT NOT NULL DEFAULT '',
  credit_url  TEXT NOT NULL DEFAULT '',
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, cache_key)
);

-- ---------------------------------------------------------------------------
-- recipes : caches generated recipes by normalized dish name, so the same dish
-- is generated once and reused across all households.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_key    TEXT NOT NULL UNIQUE,
  dish_name   TEXT NOT NULL,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
