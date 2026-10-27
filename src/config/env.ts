import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  PORT: Number(process.env.PORT || 4000),
  CORS_ORIGIN: process.env.CORS_ORIGIN || "*",

  // Required for the API to run.
  DATABASE_URL: required("DATABASE_URL"),

  // Optional at load time; the meal engine checks it before calling Anthropic.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",

  // Optional. When set, dish/ingredient photos are pulled from Pexels;
  // otherwise the app falls back to stylized cards + icons.
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || "",

  // Auth seam. Blank in production.
  DEV_USER_ID: process.env.DEV_USER_ID || "",

  // Secret for signing login tokens. MUST be set to a strong random value in
  // production (Render env). The default is for local dev only.
  JWT_SECRET: process.env.JWT_SECRET || "dev-insecure-jwt-secret-change-me",

  // Google OAuth client id (public). Enables "Continue with Google".
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",

  // Public URL of the frontend; used to build links in emails.
  FRONTEND_URL: (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, ""),

  // Outbound email (SMTP). Leave SMTP_HOST blank to disable email; links are
  // then printed to the server log and verification is NOT enforced.
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_SECURE: process.env.SMTP_SECURE === "true", // true for port 465
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  MAIL_FROM: process.env.MAIL_FROM || "Deemona Rasoi <no-reply@localhost>",

  // "false" turns off the verified-email requirement even when SMTP is set.
  REQUIRE_EMAIL_VERIFICATION: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
};

export const mailEnabled = !!env.SMTP_HOST;
export const verificationEnforced = mailEnabled && env.REQUIRE_EMAIL_VERIFICATION;

if (env.JWT_SECRET === "dev-insecure-jwt-secret-change-me") {
  console.warn("[rasoi] WARNING: JWT_SECRET is using the insecure default. Set a strong JWT_SECRET in production.");
}
