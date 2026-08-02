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

  // Auth seam. Blank in production.
  DEV_USER_ID: process.env.DEV_USER_ID || "",
};
