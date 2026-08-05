import { Router } from "express";
import { z } from "zod";
import { asyncHandler, auth, httpError, userId } from "../middleware";
import { login, me, register } from "../services/authService";

const router = Router();

const credentials = z.object({
  email: z.string().email().max(160),
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});
const registration = credentials.extend({ name: z.string().min(1).max(80) });

// POST /api/auth/register  (public)
router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const parsed = registration.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid details", parsed.error.flatten());
    const result = await register(parsed.data.email, parsed.data.password, parsed.data.name);
    res.status(201).json(result);
  })
);

// POST /api/auth/login  (public)
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) throw httpError(400, "Invalid details", parsed.error.flatten());
    const result = await login(parsed.data.email, parsed.data.password);
    res.json(result);
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
