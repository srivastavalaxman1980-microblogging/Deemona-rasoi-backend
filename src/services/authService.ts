import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import {
  createGoogleUser,
  createUser,
  findByEmail,
  findByGoogleSub,
  findById,
  linkGoogle,
  User,
} from "../repositories/users";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

function toPublic(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, avatar: u.avatar_url || undefined };
}

function httpError(status: number, message: string) {
  const e: any = new Error(message);
  e.status = status;
  return e;
}

const googleClient = new OAuth2Client();

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
  if (!user || !user.password_hash) throw httpError(401, "Invalid email or password");
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw httpError(401, "Invalid email or password");
  return { token: signToken(user.id), user: toPublic(user) };
}

export async function loginWithGoogle(idToken: string): Promise<AuthResult> {
  if (!env.GOOGLE_CLIENT_ID) throw httpError(500, "Google sign-in is not configured");

  let payload: any;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw httpError(401, "Could not verify Google sign-in");
  }
  if (!payload?.email || !payload?.sub) throw httpError(401, "Google account is missing details");

  const email = String(payload.email).toLowerCase();
  const googleSub = String(payload.sub);
  const name = payload.name || email.split("@")[0];
  const avatar = payload.picture || "";

  let user = await findByGoogleSub(googleSub);
  if (!user) {
    const existing = await findByEmail(email);
    user = existing
      ? (await linkGoogle(existing.id, googleSub, avatar)) || existing
      : await createGoogleUser(email, name, googleSub, avatar);
  }
  return { token: signToken(user.id), user: toPublic(user) };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await findById(userId);
  if (!user) throw httpError(404, "User not found");
  return toPublic(user);
}
