import rateLimit from "express-rate-limit";

function limiter(windowMinutes: number, max: number, message: string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message, code: "RATE_LIMITED" },
  });
}

// Per-IP limits (in-memory; fine for a single instance).
export const authGeneralLimiter = limiter(15, 60, "Too many requests. Please wait a few minutes and try again.");
export const loginLimiter = limiter(15, 10, "Too many sign-in attempts. Please try again in 15 minutes.");
export const registerLimiter = limiter(60, 10, "Too many sign-ups from this network. Please try again later.");
export const emailLimiter = limiter(60, 5, "Too many email requests. Please try again in an hour.");
