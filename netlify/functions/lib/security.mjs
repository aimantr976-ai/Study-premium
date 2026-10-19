import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb } from './db.mjs';

export class ApiError extends Error {
  constructor(statusCode, message, code = 'REQUEST_FAILED') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const now = () => new Date();
export const asId = (value) => {
  try { return new ObjectId(String(value)); } catch { throw new ApiError(400, 'Invalid record ID.'); }
};
export const cleanText = (value, max = 300) => String(value ?? '').trim().slice(0, max);
export const asBool = (value, fallback = false) => typeof value === 'boolean' ? value : fallback;
export const asInt = (value, min, max, fallback = min) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
export const emailNorm = (value) => cleanText(value, 254).toLowerCase();
export const emailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const mobileNorm = (value) => String(value ?? '').replace(/[\s()-]/g, '').trim();
export const mobileValid = (value) => /^\+?[0-9]{10,15}$/.test(value);
export const validHttpUrl = (value) => {
  try { const u = new URL(value); return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password; } catch { return false; }
};
export const moneyPaise = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) throw new ApiError(400, 'Enter a valid plan price in INR.');
  return Math.round(n * 100);
};
export function requireJwtSecret() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new ApiError(503, 'Server setup incomplete: JWT_SECRET must be at least 32 characters.', 'CONFIGURATION_REQUIRED');
  }
  return process.env.JWT_SECRET;
}
export function cookieName() { return process.env.COOKIE_NAME || 'sp_session'; }
export function cookieHeader(token, clear = false) {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.CONTEXT === 'production' || String(process.env.URL || '').startsWith('https://');
  const secure = isProduction ? '; Secure' : '';
  const maxAge = clear ? 0 : Math.max(1, Number(process.env.SESSION_DAYS || 7)) * 86400;
  return `${cookieName()}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function readCookie(event, name) {
  const headers = event.headers || {};
  const raw = headers.cookie || headers.Cookie || '';
  const part = raw.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
export function signSession(user) {
  return jwt.sign({ uid: String(user._id), role: user.role }, requireJwtSecret(), { expiresIn: `${Math.max(1, Number(process.env.SESSION_DAYS || 7))}d`, issuer: 'study-premium' });
}
export async function requireUser(event, admin = false) {
  const token = readCookie(event, cookieName());
  if (!token) throw new ApiError(401, 'Please sign in to continue.', 'AUTH_REQUIRED');
  let payload;
  try { payload = jwt.verify(token, requireJwtSecret(), { issuer: 'study-premium' }); }
  catch { throw new ApiError(401, 'Your session expired. Please sign in again.', 'SESSION_EXPIRED'); }
  if (!ObjectId.isValid(payload.uid)) throw new ApiError(401, 'Invalid session.', 'INVALID_SESSION');
  const db = await getDb();
  const user = await db.collection('users').findOne({ _id: new ObjectId(payload.uid) }, { projection: { passwordHash: 0 } });
  if (!user || user.status !== 'active') throw new ApiError(403, 'This account is unavailable.', 'ACCOUNT_UNAVAILABLE');
  if (admin && user.role !== 'admin') throw new ApiError(403, 'Administrator access required.', 'ADMIN_REQUIRED');
  return user;
}
export async function rateLimit(event, action, max = 12, windowMs = 10 * 60 * 1000) {
  const db = await getDb();
  const headers = event.headers || {};
  const ip = String(headers['x-nf-client-connection-ip'] || headers['x-forwarded-for'] || 'unknown').split(',')[0].trim().slice(0, 80);
  const slot = Math.floor(Date.now() / windowMs);
  const key = `${action}:${ip}:${slot}`;
  const result = await db.collection('rateLimits').findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((slot + 2) * windowMs) } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = result?.value || result;
  if (Number(doc?.count || 0) > max) throw new ApiError(429, 'Too many attempts. Please wait and try again.', 'RATE_LIMITED');
}
export async function audit(db, actor, action, entityType, entityId, details = {}) {
  await db.collection('auditLogs').insertOne({
    actorId: actor?._id || null,
    actorEmail: actor?.email || 'system',
    action,
    entityType,
    entityId: String(entityId ?? ''),
    details,
    createdAt: now()
  });
}
export function safeUser(user) {
  if (!user) return null;
  return { id: String(user._id), name: user.name, email: user.email, mobile: user.mobile, role: user.role, status: user.status, createdAt: user.createdAt };
}
export async function activeSubscription(db, userId) {
  const when = now();
  return db.collection('subscriptions').findOne({ userId, status: 'active', startsAt: { $lte: when }, expiresAt: { $gt: when } }, { sort: { expiresAt: -1 } });
}
