import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const sessions = new Map<string, { username: string; expiresAt: number }>();
const COOKIE = 'zoga_admin_session';

function parseCookie(req: Request): string | null {
  const value = req.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return value ? decodeURIComponent(value.slice(COOKIE.length + 1)) : null;
}

function verifyPassword(password: string): boolean {
  const encoded = env.ADMIN_DASHBOARD_PASSWORD_HASH;
  if (!encoded) return false;
  const [salt, expected] = encoded.split('$');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function login(username: string, password: string, res: Response): boolean {
  if (username !== env.ADMIN_DASHBOARD_USERNAME || !verifyPassword(password)) return false;
  const token = crypto.randomBytes(32).toString('base64url');
  sessions.set(token, { username, expiresAt: Date.now() + env.ADMIN_SESSION_TTL_MS });
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(env.ADMIN_SESSION_TTL_MS / 1000)}${secure}`);
  return true;
}

export function logout(req: Request, res: Response): void {
  const token = parseCookie(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  const token = parseCookie(req);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    res.status(401).json({ success: false, message: 'Authentication required.' });
    return;
  }

  next();
}

export function hasAdminSession(req: Request): boolean {
  const token = parseCookie(req);
  const session = token ? sessions.get(token) : undefined;
  return Boolean(session && session.expiresAt > Date.now());
}
