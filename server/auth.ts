import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { db } from "./storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET || "globesim-dev-secret";
const COOKIE_NAME = "globe_session";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string, email: string, isAdmin = false): string {
  return jwt.sign({ userId, email, isAdmin }, SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: string; email: string; isAdmin: boolean } | null {
  try {
    const payload = jwt.verify(token, SECRET) as { userId: string; email: string; isAdmin?: boolean };
    return { userId: payload.userId, email: payload.email, isAdmin: payload.isAdmin ?? false };
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
  (req as any).isAdmin = payload.isAdmin;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (req as any).userId = payload.userId;
      (req as any).userEmail = payload.email;
      (req as any).isAdmin = payload.isAdmin;
    }
  }
  next();
}

// Middleware: requires the user to be authenticated AND have isAdmin=true in their JWT.
// Also does a live DB check so revoked admins are blocked immediately on next request.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ message: "Not authenticated" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ message: "Invalid or expired session" });

  // Live DB check — catches admin flag being revoked without requiring re-login
  try {
    const [user] = await db.select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, payload.userId));

    if (!user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
  } catch {
    return res.status(500).json({ message: "Authorization check failed" });
  }

  (req as any).userId = payload.userId;
  (req as any).userEmail = payload.email;
  (req as any).isAdmin = true;
  next();
}
