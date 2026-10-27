import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { consumeToken, issueToken, secondsSinceLastToken } from "../repositories/authTokens";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mailer";
import { env, verificationEnforced } from "../config/env";
import {
  createGoogleUser,
  clearFailedLogins,
  createUser,
  findByEmail,
  findByGoogleSub,
  findById,
  linkGoogle,
  markVerified,
  recordFailedLogin,
  setPassword,
  User,
} from "../repositories/users";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  emailVerified: boolean;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface PendingVerification {
  needsVerification: true;
  email: string;
}

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const RESEND_COOLDOWN_S = 60;

function toPublic(u: User): PublicUser {
  return { id: u.id, email: u.email, name: u.name, avatar: u.avatar_url || undefined, emailVerified: u.email_verified };
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

async function sendVerification(user: User) {
  const token = await issueToken(user.id, "verify", 24 * 60);
  await sendVerificationEmail(user.email, user.name, token);
}

export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResult | PendingVerification> {
  const em = email.trim().toLowerCase();
  const existing = await findByEmail(em);
  if (existing) throw httpError(409, "An account with this email already exists");
  const hash = await bcrypt.hash(password, 10);
  const user = await createUser(em, hash, name.trim());
  try {
    await sendVerification(user);
  } catch (e) {
    console.error("[mail] verification email failed:", (e as Error).message);
    if (verificationEnforced) {
      throw httpError(502, "Account created, but we couldn't send the verification email. Use 'Resend verification email' on the sign-in page.");
    }
  }
  if (verificationEnforced) return { needsVerification: true, email: user.email };
  return { token: signToken(user.id), user: toPublic(user) };
}

const DUMMY_HASH = bcrypt.hashSync("rasoi-dummy-password", 10);

export async function login(email: string, password: string): Promise<AuthResult> {
  const em = email.trim().toLowerCase();
  const user = await findByEmail(em);
  if (!user || !user.password_hash) {
    await bcrypt.compare(password, DUMMY_HASH).catch(() => false); // even timing
    throw httpError(401, "Invalid email or password");
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    const e = httpError(429, `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.`);
    e.code = "ACCOUNT_LOCKED";
    throw e;
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await recordFailedLogin(user.id, MAX_FAILED, LOCK_MINUTES);
    throw httpError(401, "Invalid email or password");
  }
  await clearFailedLogins(user.id);

  if (verificationEnforced && !user.email_verified) {
    const e = httpError(403, "Please verify your email first. Check your inbox for the link.");
    e.code = "EMAIL_NOT_VERIFIED";
    throw e;
  }
  return { token: signToken(user.id), user: toPublic(user) };
}

/** Always resolves (never reveals whether the email exists). */
export async function resendVerification(email: string): Promise<void> {
  const user = await findByEmail(email.trim().toLowerCase());
  if (!user || user.email_verified) return;
  const since = await secondsSinceLastToken(user.id, "verify");
  if (since !== null && since < RESEND_COOLDOWN_S) return;
  try {
    await sendVerification(user);
  } catch (e) {
    console.error("[mail] verification email failed:", (e as Error).message);
  }
}

export async function verifyEmail(token: string): Promise<AuthResult> {
  const userId = await consumeToken(token, "verify");
  if (!userId) throw httpError(400, "This verification link is invalid or has expired. Request a new one from the sign-in page.");
  await markVerified(userId);
  const user = await findById(userId);
  if (!user) throw httpError(404, "User not found");
  return { token: signToken(user.id), user: toPublic(user) };
}

/** Always resolves (never reveals whether the email exists). */
export async function forgotPassword(email: string): Promise<void> {
  const user = await findByEmail(email.trim().toLowerCase());
  if (!user) return;
  const since = await secondsSinceLastToken(user.id, "reset");
  if (since !== null && since < RESEND_COOLDOWN_S) return;
  try {
    const token = await issueToken(user.id, "reset", 60);
    await sendPasswordResetEmail(user.email, user.name, token);
  } catch (e) {
    console.error("[mail] reset email failed:", (e as Error).message);
  }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const userId = await consumeToken(token, "reset");
  if (!userId) throw httpError(400, "This reset link is invalid or has expired. Please request a new one.");
  await setPassword(userId, await bcrypt.hash(password, 10));
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
  if (payload.email_verified === false) throw httpError(401, "Your Google email is not verified");

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
