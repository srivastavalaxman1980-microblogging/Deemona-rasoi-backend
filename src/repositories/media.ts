import { pool } from "../db/pool";

export interface CachedImageRow {
  image_url: string;
  credit_name: string;
  credit_url: string;
}

export interface PhotoResult {
  url: string;
  creditName: string;
  creditUrl: string;
}

export async function getImageCache(
  kind: string,
  key: string
): Promise<CachedImageRow | null> {
  const { rows } = await pool.query(
    `SELECT image_url, credit_name, credit_url
       FROM image_cache WHERE kind = $1 AND cache_key = $2`,
    [kind, key]
  );
  return rows[0] || null;
}

export async function setImageCache(
  kind: string,
  key: string,
  result: PhotoResult | null
): Promise<void> {
  await pool.query(
    `INSERT INTO image_cache (kind, cache_key, image_url, credit_name, credit_url)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (kind, cache_key)
     DO UPDATE SET image_url = EXCLUDED.image_url,
                   credit_name = EXCLUDED.credit_name,
                   credit_url = EXCLUDED.credit_url,
                   checked_at = now()`,
    [kind, key, result?.url || "", result?.creditName || "", result?.creditUrl || ""]
  );
}

export async function getRecipeCache(dishKey: string): Promise<any | null> {
  const { rows } = await pool.query(`SELECT data FROM recipes WHERE dish_key = $1`, [
    dishKey,
  ]);
  return rows[0]?.data || null;
}

export async function setRecipeCache(
  dishKey: string,
  dishName: string,
  data: unknown
): Promise<void> {
  await pool.query(
    `INSERT INTO recipes (dish_key, dish_name, data)
     VALUES ($1,$2,$3)
     ON CONFLICT (dish_key) DO UPDATE SET data = EXCLUDED.data`,
    [dishKey, dishName, JSON.stringify(data)]
  );
}
