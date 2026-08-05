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
};

if (env.JWT_SECRET === "dev-insecure-jwt-secret-change-me") {
  console.warn("[rasoi] WARNING: JWT_SECRET is using the insecure default. Set a strong JWT_SECRET in production.");
}
