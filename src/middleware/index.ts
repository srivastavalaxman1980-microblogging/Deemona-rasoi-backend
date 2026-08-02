import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

/**
 * Auth seam. Reads an x-user-id header (or falls back to DEV_USER_ID in dev).
 * Replace the body with your real Deemona JWT / 2FA verification and set
 * req.userId from the verified token.
 */
export function auth(req: Request, res: Response, next: NextFunction) {
  const userId = (req.header("x-user-id") || env.DEV_USER_ID || "").trim();
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized: missing user identity" });
  }
  (req as any).userId = userId;
  next();
}

export function userId(req: Request): string {
  return (req as any).userId as string;
}

/** Wrap async route handlers so rejected promises reach the error handler. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found" });
}

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err?.status || 500;
  const message = err?.message || "Internal server error";
  if (status >= 500) console.error("[error]", err);
  res.status(status).json({ error: message, details: err?.details });
}

/** Small helper to throw HTTP errors from anywhere in a handler. */
export function httpError(status: number, message: string, details?: unknown) {
  const e: any = new Error(message);
  e.status = status;
  e.details = details;
  return e;
}
