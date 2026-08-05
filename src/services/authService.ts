import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { createUser, findByEmail, findById, User } from "../repositories/users";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

function toPublic(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name };
}

function httpError(status: number, message: string) {
  const e: any = new Error(message);
  e.status = status;
  return e;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as any;
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResult> {
  const em = email.trim().toLowerCase();
  const existing = await findByEmail(em);
  if (existing) throw httpError(409, "An account with this email already exists");
  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(em, hash, name.trim());
  return { token: signToken(user.id), user: toPublic(user) };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const em = email.trim().toLowerCase();
  const user = await findByEmail(em);
  if (!user) throw httpError(401, "Invalid email or password");
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw httpError(401, "Invalid email or password");
  return { token: signToken(user.id), user: toPublic(user) };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await findById(userId);
  if (!user) throw httpError(404, "User not found");
  return toPublic(user);
}
