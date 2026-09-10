import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createTeamStore } from './store.mjs';
import { createSessions, digest, hashPassword, normalizeUsername, token, verifyPassword } from './security.mjs';
import { approveSwap, offerSwap, openSwap, personalView } from './teamDomain.mjs';
import { decodePlanner, validDate } from '../src/storage/codec.ts';
import { getDefaultStart } from '../src/domain/planner.ts';

const fail = (status, message) => Object.assign(new Error(message), { status });
async function body(request) {
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 10 * 1024 * 1024) throw fail(413, 'הבקשה גדולה מדי'); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw fail(400, 'בקשה לא תקינה'); }
}
function limitedText(value, limit = 200) { if (typeof value !== 'string' || value.length > limit) throw fail(400, 'טקסט לא תקין'); return value.trim(); }
const safeUser = ({ id, username, role, staffId, disabled }) => ({ id, username, role, staffId, disabled });

export function createTeamServer({ dataFile, setupToken, secureCookies = false, dist = resolve('dist'), appOrigin } = {}) {
  const store = createTeamStore(dataFile ?? resolve('.planner-data/team.json'));
  const sessions = createSessions(secureCookies), attempts = new Map();
  const bootstrap = setupToken ?? token();
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    const send = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
    try {
      const url = new URL(request.url, 'http://localhost'), route = url.pathname, method = request.method;
      if (!route.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(method)) throw fail(405, 'פעולה לא נתמכת');
        const root = resolve(dist), requested = resolve(root, `.${decodeURIComponent(route)}`);
        if (requested !== root && !requested.startsWith(root + sep)) throw fail(403, 'גישה נדחתה');
        const file = existsSync(requested) && statSync(requested).isFile() ? requested : resolve(root, 'index.html');
        if (!existsSync(file)) throw fail(404, 'הריצו npm run build או פתחו את שרת הפיתוח');
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
        response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }); response.end(method === 'HEAD' ? undefined : readFileSync(file)); return;
      }
      if (!['GET', 'HEAD'].includes(method) && request.headers.origin && request.headers.origin !== (appOrigin ?? `http${secureCookies ? 's' : ''}://${request.headers.host}`)) throw fail(403, 'מקור הבקשה אינו מורשה');
      if (!['GET', 'HEAD'].includes(method) && !request.headers['content-type']?.startsWith('application/json')) throw fail(415, 'נדרש JSON');
      const userId = sessions.read(request);
      const user = store.read().users.find((entry) => entry.id === userId && !entry.disabled);
      if (route === '/api/status' && method === 'GET') { send(200, { needsSetup: store.read().users.length === 0, user: user ? safeUser(user) : null }); return; }
      if (['/api/setup', '/api/login', '/api/join'].includes(route) && method === 'POST') {
        const address = request.socket.remoteAddress;
        const now = Date.now();
        for (const [key, entry] of attempts) if (entry.until < now) attempts.delete(key);
        const entry = attempts.get(address) ?? { count: 0, until: now + 10 * 60_000 };
        if (++entry.count > 20) throw fail(429, 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות');
        attempts.set(address, entry);
        const input = await body(request), username = normalizeUsername(input.username);
        if (route === '/api/login') {
          const found = store.read().users.find((entry) => entry.username === username && !entry.disabled);
          if (!found || !verifyPassword(input.password, found.password)) throw fail(401, 'שם המשתמש או הסיסמה אינם נכונים');
          sessions.create(found.id, response); send(200, safeUser(found)); return;
        }
        const password = hashPassword(input.password), id = randomUUID();
        const created = store.update((state) => {
          if (state.users.some((entry) => entry.username === username)) throw fail(409, 'שם המשתמש כבר קיים');
          let staffId;
          if (route === '/api/setup') {
            if (state.users.length) throw fail(409, 'המנהל כבר הוגדר');
            if (typeof input.setupToken !== 'string' || digest(input.setupToken) !== digest(bootstrap)) throw fail(403, 'קוד ההתקנה אינו נכון');
          } else {
            const invitation = state.invitations.find((entry) => entry.hash === digest(String(input.token)) && !entry.used && entry.expires > Date.now());
            if (!invitation || !state.planner.staff.some((member) => member.id === invitation.staffId)) throw fail(403, 'ההזמנה אינה תקפה');
            staffId = invitation.staffId;
            if (state.users.some((entry) => entry.staffId === staffId && !entry.disabled)) throw fail(409, 'כבר קיים חשבון לאיש הצוות');
            invitation.used = true;
          }
          state.users.push({ id, username, password, role: route === '/api/setup' ? 'admin' : 'staff', ...(staffId ? { staffId } : {}), disabled: false }); return state;
        }).users.find((entry) => entry.id === id);
        sessions.create(id, response); send(201, safeUser(created)); return;
      }
      if (!user) throw fail(401, 'יש להתחבר כדי להמשיך');
      const admin = () => { if (user.role !== 'admin') throw fail(403, 'פעולה זו מיועדת למנהל בלבד'); };
      const staff = () => { if (user.role !== 'staff' || !store.read().planner.staff.some((member) => member.id === user.staffId)) throw fail(403, 'החשבון אינו משויך לאיש צוות פעיל'); return user.staffId; };
      if (route === '/api/logout' && method === 'POST') { sessions.logout(request, response); send(200, {}); return; }
      if (route === '/api/password' && method === 'POST') {
        const input = await body(request); if (!verifyPassword(input.currentPassword, user.password)) throw fail(403, 'הסיסמה הנוכחית אינה נכונה');
        const password = hashPassword(input.password); store.update((state) => { state.users.find((entry) => entry.id === user.id).password = password; return state; });
        sessions.revoke(user.id); sessions.create(user.id, response); send(200, {}); return;
      }
      if (route === '/api/planner') {
        admin();
        if (method === 'GET') { const state = store.read(); send(200, { data: state.planner, revision: state.revision }); return; }
        if (method === 'PUT') {
          const input = await body(request), decoded = decodePlanner(JSON.stringify(input.data));
          const next = store.update((state) => {
            if (input.revision !== state.revision) throw fail(409, 'הסידור עודכן על ידי משתמש אחר. טענו את הגרסה העדכנית לפני שמירה');
            state.planner = decoded; state.revision += 1;
            state.audit.push({ id: randomUUID(), at: new Date().toISOString(), actor: user.id, action: 'planner-updated' });
            state.audit = state.audit.slice(-500); return state;
          });
          send(200, { revision: next.revision }); return;
        }
      }
      if (route === '/api/team' && method === 'GET') { admin(); const state = store.read(); send(200, { users: state.users.map(safeUser), requests: state.requests, staff: state.planner.staff, audit: state.audit.slice(-100).reverse() }); return; }
      if (route === '/api/invitations' && method === 'POST') {
        admin(); const input = await body(request), raw = token();
        store.update((state) => {
          if (!state.planner.staff.some((member) => member.id === input.staffId)) throw fail(400, 'בחרו איש צוות קיים');
          if (state.users.some((entry) => entry.staffId === input.staffId && !entry.disabled)) throw fail(409, 'כבר קיים חשבון פעיל');
          state.invitations = state.invitations.filter((entry) => entry.staffId !== input.staffId && entry.expires > Date.now() && !entry.used);
          state.invitations.push({ hash: digest(raw), staffId: input.staffId, expires: Date.now() + 7 * 86400_000, used: false }); return state;
        }); send(201, { token: raw }); return;
      }
      if (route === '/api/users/disable' && method === 'POST') {
        admin(); const input = await body(request);
        store.update((state) => { const target = state.users.find((entry) => entry.id === input.id); if (!target || target.role === 'admin') throw fail(400, 'לא ניתן להשבית חשבון זה'); target.disabled = true; return state; });
        sessions.revoke(input.id); send(200, {}); return;
      }
      if (route === '/api/personal' && method === 'GET') { send(200, personalView(store.read(), staff(), url.searchParams.get('start') ?? getDefaultStart())); return; }
      if (route === '/api/availability' && method === 'POST') {
        const staffId = staff(), input = await body(request), note = limitedText(input.note ?? '');
        if (!validDate(input.start) || !validDate(input.end) || input.start > input.end) throw fail(400, 'טווח התאריכים אינו תקין');
        store.update((state) => { state.planner.unavailability.push({ id: randomUUID(), staffId, start: input.start, end: input.end, note }); state.revision += 1; return state; }); send(201, {}); return;
      }
      if (route === '/api/availability/remove' && method === 'POST') {
        const staffId = staff(), input = await body(request);
        store.update((state) => { state.planner.unavailability = state.planner.unavailability.filter((entry) => entry.id !== input.id || entry.staffId !== staffId); state.revision += 1; return state; }); send(200, {}); return;
      }
      if (route === '/api/requests' && method === 'POST') {
        const staffId = staff(), input = await body(request), note = limitedText(input.note ?? '');
        store.update((state) => { openSwap(state, staffId, input.start, input.key, note); return state; }); send(201, {}); return;
      }
      if (route === '/api/requests/offer' && method === 'POST') {
        const staffId = staff(), input = await body(request);
        store.update((state) => { offerSwap(state, input.id, staffId); return state; }); send(200, {}); return;
      }
      if (route === '/api/requests/approve' && method === 'POST') {
        admin(); const input = await body(request);
        store.update((state) => { approveSwap(state, input.id, input.candidateId, user.id); return state; }); send(200, {}); return;
      }
      if (route === '/api/requests/withdraw' && method === 'POST') {
        const staffId = staff(), input = await body(request);
        store.update((state) => { const target = state.requests.find((entry) => entry.id === input.id && entry.status === 'open'); if (!target) throw fail(400, 'הבקשה אינה פתוחה'); target.offers = target.offers.filter((id) => id !== staffId); return state; }); send(200, {}); return;
      }
      if (route === '/api/requests/close' && method === 'POST') {
        const input = await body(request);
        store.update((state) => {
          const target = state.requests.find((entry) => entry.id === input.id && entry.status === 'open');
          if (!target || user.role !== 'admin' && target.requesterId !== user.staffId) throw fail(403, 'לא ניתן לסגור בקשה זו');
          target.status = user.role === 'admin' ? 'rejected' : 'cancelled'; target.resolvedAt = new Date().toISOString(); return state;
        }); send(200, {}); return;
      }
      throw fail(404, 'הפעולה לא נמצאה');
    } catch (error) { send(error.status ?? 400, { error: error.message || 'הפעולה נכשלה' }); }
  });
  return { server, setupToken: bootstrap, needsSetup: () => store.read().users.length === 0 };
}
