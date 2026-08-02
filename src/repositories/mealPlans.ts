import { pool, withTransaction } from "../db/pool";
import {
  DayDraft,
  HouseholdConstraints,
  MealDraft,
  MealType,
  Span,
} from "../types";

export interface SavePlanMeta {
  title: string;
  span: Span;
  occasion: string;
  proteinTargetG: number;
  constraints: HouseholdConstraints;
}

export interface PlanSummary {
  id: string;
  householdId: string;
  title: string;
  span: Span;
  occasion: string;
  numDays: number;
  proteinTargetG: number;
  status: string;
  createdAt: string;
}

export interface FullPlan extends PlanSummary {
  constraints: HouseholdConstraints;
  days: {
    id: string;
    dayIndex: number;
    label: string;
    meals: (MealDraft & { id: string })[];
  }[];
}

/** Insert a generated plan (plan + days + meals) atomically. Returns plan id. */
export async function savePlan(
  householdId: string,
  meta: SavePlanMeta,
  days: DayDraft[]
): Promise<string> {
  return withTransaction(async (client) => {
    const plan = await client.query(
      `INSERT INTO meal_plans
         (household_id, title, span, occasion, num_days, protein_target_g, constraints_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id`,
      [
        householdId,
        meta.title,
        meta.span,
        meta.occasion,
        days.length,
        meta.proteinTargetG,
        JSON.stringify(meta.constraints),
      ]
    );
    const planId: string = plan.rows[0].id;

    for (const day of days) {
      const dayRow = await client.query(
        `INSERT INTO meal_plan_days (plan_id, day_index, label)
         VALUES ($1,$2,$3) RETURNING id`,
        [planId, day.dayIndex, day.label]
      );
      const dayId: string = dayRow.rows[0].id;

      for (const m of day.meals) {
        await client.query(
          `INSERT INTO meals (day_id, meal_type, dish_name, protein_g, kcal, cook_min, is_veg)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [dayId, m.mealType, m.dish, m.proteinG, m.kcal, m.cookMin, m.isVeg]
        );
      }
    }

    return planId;
  });
}

export async function listPlans(householdId: string): Promise<PlanSummary[]> {
  const { rows } = await pool.query(
    `SELECT id, household_id, title, span, occasion, num_days, protein_target_g, status, created_at
       FROM meal_plans
      WHERE household_id = $1
      ORDER BY created_at DESC`,
    [householdId]
  );
  return rows.map((r) => ({
    id: r.id,
    householdId: r.household_id,
    title: r.title,
    span: r.span,
    occasion: r.occasion,
    numDays: r.num_days,
    proteinTargetG: r.protein_target_g,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function getFullPlan(planId: string): Promise<FullPlan | null> {
  const planRes = await pool.query(`SELECT * FROM meal_plans WHERE id = $1`, [planId]);
  if (!planRes.rows[0]) return null;
  const p = planRes.rows[0];

  const daysRes = await pool.query(
    `SELECT id, day_index, label FROM meal_plan_days WHERE plan_id = $1 ORDER BY day_index`,
    [planId]
  );
  const dayIds = daysRes.rows.map((d) => d.id);

  const mealsRes = dayIds.length
    ? await pool.query(
        `SELECT id, day_id, meal_type, dish_name, protein_g, kcal, cook_min, is_veg
           FROM meals WHERE day_id = ANY($1::uuid[])`,
        [dayIds]
      )
    : { rows: [] as any[] };

  const mealsByDay = new Map<string, (MealDraft & { id: string })[]>();
  for (const m of mealsRes.rows) {
    const list = mealsByDay.get(m.day_id) || [];
    list.push({
      id: m.id,
      mealType: m.meal_type as MealType,
      dish: m.dish_name,
      proteinG: m.protein_g,
      kcal: m.kcal,
      cookMin: m.cook_min,
      isVeg: m.is_veg,
    });
    mealsByDay.set(m.day_id, list);
  }

  const order: Record<MealType, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

  return {
    id: p.id,
    householdId: p.household_id,
    title: p.title,
    span: p.span,
    occasion: p.occasion,
    numDays: p.num_days,
    proteinTargetG: p.protein_target_g,
    status: p.status,
    createdAt: p.created_at,
    constraints: p.constraints_snapshot,
    days: daysRes.rows.map((d) => ({
      id: d.id,
      dayIndex: d.day_index,
      label: d.label,
      meals: (mealsByDay.get(d.id) || []).sort(
        (a, b) => order[a.mealType] - order[b.mealType]
      ),
    })),
  };
}

export async function deletePlan(planId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM meal_plans WHERE id = $1`, [planId]);
  return (rowCount ?? 0) > 0;
}

/** Context needed to swap a single meal: its plan, constraints, and sibling dishes. */
export interface MealContext {
  mealId: string;
  planId: string;
  mealType: MealType;
  currentDish: string;
  constraints: HouseholdConstraints;
  otherDishes: string[];
}

export async function getMealContext(mealId: string): Promise<MealContext | null> {
  const { rows } = await pool.query(
    `SELECT m.id AS meal_id, m.meal_type, m.dish_name,
            p.id AS plan_id, p.constraints_snapshot
       FROM meals m
       JOIN meal_plan_days d ON d.id = m.day_id
       JOIN meal_plans p     ON p.id = d.plan_id
      WHERE m.id = $1`,
    [mealId]
  );
  if (!rows[0]) return null;
  const r = rows[0];

  const others = await pool.query(
    `SELECT m.dish_name
       FROM meals m
       JOIN meal_plan_days d ON d.id = m.day_id
      WHERE d.plan_id = $1 AND m.id <> $2`,
    [r.plan_id, mealId]
  );

  return {
    mealId: r.meal_id,
    planId: r.plan_id,
    mealType: r.meal_type,
    currentDish: r.dish_name,
    constraints: r.constraints_snapshot,
    otherDishes: others.rows.map((o) => o.dish_name),
  };
}

export async function replaceMeal(mealId: string, draft: MealDraft): Promise<void> {
  await pool.query(
    `UPDATE meals
        SET dish_name = $1, protein_g = $2, kcal = $3, cook_min = $4, is_veg = $5
      WHERE id = $6`,
    [draft.dish, draft.proteinG, draft.kcal, draft.cookMin, draft.isVeg, mealId]
  );
}
