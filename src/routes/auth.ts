import { Router } from "express";
import { z } from "zod";
import { asyncHandler, auth, httpError, userId } from "../middleware";
import {
  forgotPassword,
  login,
  loginWithGoogle,
  me,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "../services/authService";
import { emailLimiter, loginLimiter, registerLimiter } from "../middleware/rateLimit";

const router = Router();

const email = z.string().trim().email().max(160);
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must include a letter and a number");
const credentials = z.object({ email, password: z.string().min(1).max(200) });
const registration = z.object({ email, password: newPassword, name: z.string().trim().min(1).max(80) });
const tokenBody = z.object({ token: z.string().min(20).max(200) });

// POST /api/auth/register  (public)
router.post(
  "/register",
  registerLimiter,
  asyncHandler(async (req, res) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues[0]?.message || "Invalid details");
    }
    const result = await register(parsed.data.email, parsed.data.password, parsed.data.name);
    res.status(201).json(result);
  })
);

// POST /api/auth/login  (public)
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid details", parsed.error.flatten());
    const result = await login(parsed.data.email, parsed.data.password);
    res.json(result);
  })
);

// POST /api/auth/google  (public) -- verifies a Google ID token
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    const idToken = String(req.body?.idToken || "");
    if (!idToken) throw httpError(400, "Missing Google token");
    const result = await loginWithGoogle(idToken);
    res.json(result);
  })
);

// POST /api/auth/verify-email  { token }  -> signs the user in
router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const parsed = tokenBody.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid verification link");
    res.json(await verifyEmail(parsed.data.token));
  })
);

// POST /api/auth/resend-verification  { email }  (always 200)
router.post(
  "/resend-verification",
  emailLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email }).safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Enter a valid email");
    await resendVerification(parsed.data.email);
    res.json({ ok: true });
  })
);

// POST /api/auth/forgot-password  { email }  (always 200)
router.post(
  "/forgot-password",
  emailLimiter,
  asyncHandler(async (req, res) => {
    const parsed = z.object({ email }).safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Enter a valid email");
    await forgotPassword(parsed.data.email);
    res.json({ ok: true });
  })
);

// POST /api/auth/reset-password  { token, password }
router.post(
  "/reset-password",
  emailLimiter,
  asyncHandler(async (req, res) => {
    const parsed = tokenBody.extend({ password: newPassword }).safeParse(req.body);
    if (!parsed.success) {
      throw httpError(400, parsed.error.issues[0]?.message || "Invalid request");
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    res.json({ ok: true });
  })
);

// GET /api/auth/me  (protected — self-guarded with the auth middleware)
router.get(
  "/me",
  auth,
  asyncHandler(async (req, res) => {
    res.json(await me(userId(req)));
  })
);

export default router;
