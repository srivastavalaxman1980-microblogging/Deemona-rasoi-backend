import { pool } from "../db/pool";
import { Household } from "../types";

function mapRow(r: any): Household {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    adults: r.adults,
    kids: r.kids,
    diet: r.diet,
    region: r.region,
    maxCookMin: r.max_cook_min,
    goal: r.goal,
    dailyBudgetInr: r.daily_budget_inr,
    allergies: r.allergies || [],
    occasion: "Regular week", // occasion lives on the plan, defaulted here
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface HouseholdInput {
  userId?: string | null;
  name?: string;
  adults?: number;
  kids?: number;
  diet?: string;
  region?: string;
  maxCookMin?: number;
  goal?: string;
  dailyBudgetInr?: number;
  allergies?: string[];
}

export async function createHousehold(input: HouseholdInput): Promise<Household> {
  const { rows } = await pool.query(
    `INSERT INTO households
       (user_id, name, adults, kids, diet, region, max_cook_min, goal, daily_budget_inr, allergies)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.userId ?? null,
      input.name ?? "My household",
      input.adults ?? 2,
      input.kids ?? 0,
      input.diet ?? "Veg",
      input.region ?? "North Indian",
      input.maxCookMin ?? 30,
      input.goal ?? "Balanced",
      input.dailyBudgetInr ?? 350,
      input.allergies ?? [],
    ]
  );
  return mapRow(rows[0]);
}

export async function getHousehold(id: string): Promise<Household | null> {
  const { rows } = await pool.query(`SELECT * FROM households WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function updateHousehold(
  id: string,
  patch: HouseholdInput
): Promise<Household | null> {
  const map: Record<string, string> = {
    name: "name",
    adults: "adults",
    kids: "kids",
    diet: "diet",
    region: "region",
    maxCookMin: "max_cook_min",
    goal: "goal",
    dailyBudgetInr: "daily_budget_inr",
    allergies: "allergies",
  };

  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [key, column] of Object.entries(map)) {
    const value = (patch as any)[key];
    if (value !== undefined) {
      sets.push(`${column} = $${i++}`);
      values.push(value);
    }
  }
  if (sets.length === 0) return getHousehold(id);

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE households SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ? mapRow(rows[0]) : null;
}
