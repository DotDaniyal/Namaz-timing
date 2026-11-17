import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db.ts';

const COOKIE_NAME = 'masjid_bilal_admin';

function getSessionSecret(): string {
  if (process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET.length >= 16) {
    return process.env.ADMIN_SESSION_SECRET;
  }
  // Stable per-process fallback when env var is omitted
  if (!globalThis.__masjidSessionSecret) {
    globalThis.__masjidSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.__masjidSessionSecret;
}

declare global {
  var __masjidSessionSecret: string | undefined;
}

export interface SessionPayload {
  userId: number;
  username: string;
  role: string;
  exp: number;
}

export function createSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

export function getAuthenticatedAdmin(req: Request): SessionPayload | null {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[COOKIE_NAME];
  }

  if (!token) return null;
  const session = verifySessionToken(token);
  if (!session) return null;

  const db = getDb();
  const user = db.prepare(`SELECT id, username, role FROM admin_users WHERE id = ?`).get(session.userId) as
    | { id: number; username: string; role: string }
    | undefined;
  if (!user) return null;

  return { ...session, username: user.username, role: user.role };
}

export function getPublicAppUrl(): string {
  const raw = (process.env.VITE_APP_URL || process.env.APP_URL || '').trim();
  if (!raw || raw === 'MY_APP_URL') return '';
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    if (
      parsed.protocol === 'http:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      parsed.protocol = 'https:';
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath === '/' ? '' : cleanPath}`;
  } catch {
    return '';
  }
}

export function isAllowedCorsOrigin(origin: string, reqHost?: string): boolean {
  try {
    const parsed = new URL(origin);
    const appUrl = getPublicAppUrl();
    if (appUrl) {
      const configuredOrigin = new URL(appUrl).origin;
      if (parsed.origin === configuredOrigin) return true;
    }
    if (reqHost && parsed.host === reqHost) return true;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
    if (parsed.hostname.endsWith('.vercel.app') || parsed.hostname.endsWith('.run.app')) return true;
    return false;
  } catch {
    return false;
  }
}

function isRequestHttps(req: Request): boolean {
  const host = String(req.headers.host || '');
  const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') return true;
  const appUrl = getPublicAppUrl();
  return !isLocalhost && appUrl.startsWith('https://');
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isRequestHttps(req);
  const attrs = isHttps
    ? 'HttpOnly; Path=/; SameSite=None; Secure'
    : 'HttpOnly; Path=/; SameSite=Lax';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; ${attrs}; Max-Age=${60 * 60 * 12}`,
  );
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isRequestHttps(req);
  const attrs = isHttps
    ? 'HttpOnly; Path=/; SameSite=None; Secure'
    : 'HttpOnly; Path=/; SameSite=Lax';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; ${attrs}; Max-Age=0`);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  (req as Request & { admin?: SessionPayload }).admin = admin;
  next();
}
