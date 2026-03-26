import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const SECRET = process.env.SESSION_SECRET || "globesim-dev-secret";
const COOKIE_NAME = "globe_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string; email: string };
    return payload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export function getTokenFromRequest(req: Request): string | null {
  return req.cookies?.[COOKIE_NAME] || null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ message: "Invalid or expired session" });

  (req as any).userId = payload.userId;
  (req as any).userEmail = payload.email;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).userId = payload.userId;
      (req as any).userEmail = payload.email;
    }
  }
  next();
}
