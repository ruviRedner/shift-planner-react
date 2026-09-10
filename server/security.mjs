import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const token = () => randomBytes(32).toString('base64url');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('הסיסמה צריכה להכיל 10–200 תווים');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 200) return false;
  const [salt, expected] = stored.split(':');
  const actual = scryptSync(password, salt, 64);
  const buffer = Buffer.from(expected, 'hex');
  return buffer.length === actual.length && timingSafeEqual(buffer, actual);
}
export function normalizeUsername(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(value)) throw new Error('שם המשתמש צריך להכיל 3–40 אותיות באנגלית, ספרות או ._-');
  return value.toLowerCase();
}

export function createSessions(secure = false) {
  const sessions = new Map();
  const cookie = (value, maxAge) => `planner_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const fromRequest = (request) => /(?:^|;\s*)planner_session=([^;]+)/.exec(request.headers.cookie ?? '')?.[1];
  return {
    create(userId, response) {
      const raw = token();
      for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
      sessions.set(digest(raw), { userId, expires: Date.now() + 12 * 60 * 60 * 1000 });
      response.setHeader('Set-Cookie', cookie(raw, 12 * 60 * 60));
    },
    read(request) {
      const raw = fromRequest(request), entry = raw ? sessions.get(digest(raw)) : null;
      return entry && entry.expires > Date.now() ? entry.userId : null;
    },
    logout(request, response) { const raw = fromRequest(request); if (raw) sessions.delete(digest(raw)); response.setHeader('Set-Cookie', cookie('', 0)); },
    revoke(userId) { for (const [key, value] of sessions) if (value.userId === userId) sessions.delete(key); },
  };
}
