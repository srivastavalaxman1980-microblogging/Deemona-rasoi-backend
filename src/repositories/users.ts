import { pool } from "../db/pool";

export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  google_sub: string | null;
  avatar_url: string | null;
  created_at: string;
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string
): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING *`,
    [email, passwordHash, name]
  );
  return rows[0];
}

export async function findByEmail(email: string): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function findByGoogleSub(sub: string): Promise<User | null> {
  const { rows } = await pool.query(`SELECT * FROM users WHERE google_sub = $1`, [sub]);
  return rows[0] || null;
}

export async function createGoogleUser(
  email: string,
  name: string,
  googleSub: string,
  avatar: string
): Promise<User> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, google_sub, avatar_url) VALUES ($1,$2,$3,$4) RETURNING *`,
    [email, name, googleSub, avatar]
  );
  return rows[0];
}

export async function linkGoogle(
  userId: string,
  googleSub: string,
  avatar: string
): Promise<User | null> {
  const { rows } = await pool.query(
    `UPDATE users
        SET google_sub = $2,
            avatar_url = COALESCE(NULLIF($3, ''), avatar_url)
      WHERE id = $1 RETURNING *`,
    [userId, googleSub, avatar]
  );
  return rows[0] || null;
}
