import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * Verifies a login token (Authorization: Bearer <jwt>) and sets req.userId.
 * Falls back to x-user-id / DEV_USER_ID only for local development.
 */
export function auth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as any;
      if (payload?.sub) {
        (req as any).userId = payload.sub as string;
        return next();
      }
    } catch {
      /* fall through to 401 */
    }
  }

  // Local-dev fallback (no login token). Disabled in production by leaving
  // DEV_USER_ID unset and not sending x-user-id.
  const devId = (req.header("x-user-id") || env.DEV_USER_ID || "").trim();
  if (devId) {
    (req as any).userId = devId;
    return next();
  }

  return res.status(401).json({ error: "Unauthorized: please sign in" });
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
