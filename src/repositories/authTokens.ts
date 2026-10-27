import crypto from "crypto";
import { pool } from "../db/pool";

export type TokenKind = "verify" | "reset";

const sha = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Creates a single-use token, invalidating older unused ones of the same kind. */
export async function issueToken(userId: string, kind: TokenKind, ttlMinutes: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`,
    [userId, kind]
  );
  await pool.query(
    `INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at)
     VALUES ($1,$2,$3, now() + ($4 || ' minutes')::interval)`,
    [userId, kind, sha(token), String(ttlMinutes)]
  );
  return token;
}

/** Atomically consumes a valid token and returns its user id (or null). */
export async function consumeToken(token: string, kind: TokenKind): Promise<string | null> {
  const { rows } = await pool.query(
    `UPDATE auth_tokens SET used_at = now()
      WHERE token_hash = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha(token), kind]
  );
  return rows[0]?.user_id || null;
}

/** Seconds since the user's most recent token of this kind was issued. */
export async function secondsSinceLastToken(userId: string, kind: TokenKind): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (now() - max(created_at)))::int AS s
       FROM auth_tokens WHERE user_id = $1 AND kind = $2`,
    [userId, kind]
  );
  return rows[0]?.s ?? null;
}
