import { pool } from "../db/pool";
import { PantryItem } from "../types";

function mapRow(r: any): PantryItem {
  return {
    id: r.id,
    householdId: r.household_id,
    item: r.item,
    quantity: r.quantity,
    category: r.category,
    expiryDate: r.expiry_date,
    createdAt: r.created_at,
  };
}

export interface PantryInput {
  item: string;
  quantity?: string;
  category?: string;
  expiryDate?: string | null;
}

export async function listPantry(householdId: string): Promise<PantryItem[]> {
  const { rows } = await pool.query(
    `SELECT * FROM pantry_items WHERE household_id = $1 ORDER BY category, item`,
    [householdId]
  );
  return rows.map(mapRow);
}

export async function addPantryItem(
  householdId: string,
  input: PantryInput
): Promise<PantryItem> {
  const { rows } = await pool.query(
    `INSERT INTO pantry_items (household_id, item, quantity, category, expiry_date)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [
      householdId,
      input.item,
      input.quantity ?? "",
      input.category ?? "Other",
      input.expiryDate ?? null,
    ]
  );
  return mapRow(rows[0]);
}

export async function updatePantryItem(
  id: string,
  input: PantryInput
): Promise<PantryItem | null> {
  const map: Record<string, string> = {
    item: "item",
    quantity: "quantity",
    category: "category",
    expiryDate: "expiry_date",
  };
  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;
  for (const [key, column] of Object.entries(map)) {
    const value = (input as any)[key];
    if (value !== undefined) {
      sets.push(`${column} = $${i++}`);
      values.push(value);
    }
  }
  if (sets.length === 0) {
    const { rows } = await pool.query(`SELECT * FROM pantry_items WHERE id = $1`, [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }
  values.push(id);
  const { rows } = await pool.query(
    `UPDATE pantry_items SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deletePantryItem(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM pantry_items WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
