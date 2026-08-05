import { pool } from "../db/pool";

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
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
