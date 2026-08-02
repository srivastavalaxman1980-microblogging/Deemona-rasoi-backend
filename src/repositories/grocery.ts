import { pool, withTransaction } from "../db/pool";
import { GroceryDraft, GroceryItemDraft } from "../types";

export interface StoredGrocery {
  id: string;
  planId: string;
  totalInr: number;
  createdAt: string;
  items: (GroceryItemDraft & { id: string; isHave: boolean })[];
}

/** Save a grocery list for a plan, replacing any existing one. */
export async function saveGrocery(
  planId: string,
  draft: GroceryDraft
): Promise<string> {
  return withTransaction(async (client) => {
    await client.query(`DELETE FROM grocery_lists WHERE plan_id = $1`, [planId]);

    const listRes = await client.query(
      `INSERT INTO grocery_lists (plan_id, total_inr) VALUES ($1,$2) RETURNING id`,
      [planId, draft.totalInr]
    );
    const listId: string = listRes.rows[0].id;

    for (const it of draft.items) {
      await client.query(
        `INSERT INTO grocery_items (list_id, item, quantity, category, cost_inr, is_have)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [listId, it.item, it.quantity, it.category, it.costInr, it.isHave ?? false]
      );
    }
    return listId;
  });
}

export async function deleteGrocery(planId: string): Promise<void> {
  await pool.query(`DELETE FROM grocery_lists WHERE plan_id = $1`, [planId]);
}

export async function getGrocery(planId: string): Promise<StoredGrocery | null> {
  const listRes = await pool.query(
    `SELECT id, plan_id, total_inr, created_at FROM grocery_lists WHERE plan_id = $1`,
    [planId]
  );
  if (!listRes.rows[0]) return null;
  const l = listRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT id, item, quantity, category, cost_inr, is_have
       FROM grocery_items WHERE list_id = $1 ORDER BY category, item`,
    [l.id]
  );

  return {
    id: l.id,
    planId: l.plan_id,
    totalInr: l.total_inr,
    createdAt: l.created_at,
    items: itemsRes.rows.map((r) => ({
      id: r.id,
      item: r.item,
      quantity: r.quantity,
      category: r.category,
      costInr: r.cost_inr,
      isHave: r.is_have,
    })),
  };
}
