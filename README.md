# Deemona Rasoi -- Backend (Meal Planner Core)

Node + Express + TypeScript API on Neon PostgreSQL. Serves the AI meal-planner
core of Deemona Rasoi: households, generated meal plans, meal swaps, and
costed grocery lists. The Anthropic key stays server-side.

## Stack
- Express 4 + TypeScript (CommonJS)
- PostgreSQL via `pg` (Neon pooled connection)
- `zod` for request validation
- `tsx` for dev + migrations, `tsc` for production build
- Anthropic Messages API (`claude-sonnet-5` by default)

## Setup (PowerShell)

```powershell
cd deemona-rasoi-backend
npm install
Copy-Item .env.example .env
# edit .env: set DATABASE_URL (Neon pooler) and ANTHROPIC_API_KEY
npm run migrate        # creates all tables on Neon
npm run dev            # starts on http://localhost:4000
```

Production:

```powershell
npm run build
npm start
```

## Data model

```
households ----< household_members
    |
    |----< meal_plans ----< meal_plan_days ----< meals
                  |
                  '----- grocery_lists ----< grocery_items
```

- `households` holds the family profile the AI plans against.
- `meal_plans.constraints_snapshot` (jsonb) freezes the exact inputs used, so a
  plan stays reproducible after the profile changes.
- One `grocery_lists` row per plan; rebuilding replaces it. A meal swap
  invalidates it automatically.
- `grocery_items.is_have` is a hook for the upcoming pantry module (subtract
  what you already own).

## Auth

`/api/*` runs behind `middleware/auth.ts`, a thin seam that reads `x-user-id`
(or `DEV_USER_ID` in dev). Swap the body for your existing Deemona JWT/2FA and
set `req.userId` from the verified token. `households.user_id` is a plain UUID
so you can add a FK to your real users table when ready.

## Endpoints

| Method | Path                                          | Purpose                                   |
|--------|-----------------------------------------------|-------------------------------------------|
| GET    | `/health`                                     | process + DB check (no auth)              |
| POST   | `/api/households`                             | create a household                        |
| GET    | `/api/households/:id`                          | read a household                          |
| PATCH  | `/api/households/:id`                          | update a household                        |
| POST   | `/api/households/:householdId/meal-plans`      | generate + save a plan (`span: week/month`)|
| GET    | `/api/households/:householdId/meal-plans`      | list plans for a household                |
| GET    | `/api/meal-plans/:id`                          | full plan (days, meals, grocery if built) |
| DELETE | `/api/meal-plans/:id`                          | delete a plan                             |
| POST   | `/api/meals/:mealId/swap`                      | AI-swap one dish (no-repeat aware)        |
| POST   | `/api/meal-plans/:id/grocery`                  | build/rebuild the grocery list (pantry-aware)|
| GET    | `/api/meal-plans/:id/grocery`                  | read the grocery list                     |
| GET    | `/api/households/:householdId/pantry`          | list pantry items                         |
| POST   | `/api/households/:householdId/pantry`          | add a pantry item                         |
| PATCH  | `/api/pantry/:id`                              | update a pantry item                      |
| DELETE | `/api/pantry/:id`                              | remove a pantry item                      |

`span: "week"` = 1 call; `span: "month"` = 4 sequential week calls with a
running avoid-list so no dish repeats across weeks.

## Smoke test (PowerShell)

```powershell
$H = @{ "x-user-id" = "dev"; "Content-Type" = "application/json" }
$base = "http://localhost:4000"

# 1) create a household
$hh = Invoke-RestMethod "$base/api/households" -Method Post -Headers $H -Body (@{
  name="Sharma family"; adults=2; kids=1; diet="Veg"; region="North Indian"
  goal="Balanced"; maxCookMin=30; dailyBudgetInr=350
} | ConvertTo-Json)

# 2) generate a weekly plan
$plan = Invoke-RestMethod "$base/api/households/$($hh.id)/meal-plans" -Method Post -Headers $H -Body (@{
  span="week"; occasion="Regular week"
} | ConvertTo-Json)
$plan.days[0].meals

# 3) build the grocery list
Invoke-RestMethod "$base/api/meal-plans/$($plan.id)/grocery" -Method Post -Headers $H
```

## Notes / gotchas
- Source is ASCII-only (avoids the emoji-breaks-TS-build issue on Render).
- Uses `Set-Content`-friendly `.sql` + `tsx` runner instead of heredocs.
- If deploying to Render, set `DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL`, and run `npm run migrate` once (or as a release step).
