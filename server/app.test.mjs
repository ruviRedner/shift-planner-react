import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createTeamServer } from './app.mjs';
import { createTeamStore } from './store.mjs';
import { makeInitialData, addDays, startOfSunday, toDateKey } from '../src/domain/planner.ts';

async function fixture(t, asynchronous = false, publicEditing = false) {
  const directory = mkdtempSync(join(tmpdir(), 'planner-test-'));
  const file = join(directory, 'team.json');
  const backing = createTeamStore(file);
  const writes = { fail: false };
  const store = asynchronous ? {
    read: async () => structuredClone(backing.read()),
    update: async (transform) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (writes.fail) throw Object.assign(new Error('Storage unavailable'), { status: 503 });
      return backing.update(transform);
    },
  } : undefined;
  const app = createTeamServer({ store, publicEditing, dataFile: file, setupToken: 'test-setup-code' });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await new Promise((resolve) => app.server.close(resolve));
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep)); rmSync(directory, { recursive: true }); });
  async function request(path, input, cookie, method = 'POST') {
    const result = await fetch(base + '/api' + path, { method: input === undefined ? 'GET' : method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(input !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}) }, ...(input !== undefined ? { body: JSON.stringify(input) } : {}) });
    return { status: result.status, body: await result.json(), cookie: result.headers.get('set-cookie')?.split(';')[0], cookieHeader: result.headers.get('set-cookie') };
  }
  const admin = await request('/setup', { setupToken: 'test-setup-code', username: 'manager', password: 'strong-test-password' });
  assert.equal(admin.status, 201);
  const start = toDateKey(startOfSunday(addDays(new Date(), 7)));
  const planner = { ...makeInitialData(), currentStart: start, staff: [{ id: 'a', name: 'ישראל' }, { id: 'b', name: 'דוד' }], recurring: { '4:afternoon': ['a'] } };
  assert.equal((await request('/planner', { data: planner, revision: 0 }, admin.cookie, 'PUT')).status, 200);
  async function invite(id, username) { const invitation = await request('/invitations', { staffId: id }, admin.cookie); return request('/join', { token: invitation.body.token, username, password: 'strong-test-password' }); }
  return { request, admin, planner, start, invite, file, base, writes };
}

test('public editing permits anonymous planner saves with conflict protection while accounts stay private', async (t) => {
  const f = await fixture(t, true, true);
  f.planner.residents = [{ id: 'resident-one', name: 'דייר לבדיקה' }];
  f.planner.laundry = { [f.start]: ['resident-one'] };
  f.planner.recurringLaundry = { '0': ['resident-one'], '5': ['resident-one'] };
  const loaded = await f.request('/planner');
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.users, undefined);
  const result = await f.request('/planner', { data: f.planner, revision: loaded.body.revision }, undefined, 'PUT');
  assert.equal(result.status, 200);
  assert.equal((await f.request('/planner')).body.revision, 2);
  const persisted = (await f.request('/planner')).body.data;
  assert.deepEqual(persisted.residents, f.planner.residents);
  assert.deepEqual(persisted.laundry, f.planner.laundry);
  assert.deepEqual(persisted.recurringLaundry, f.planner.recurringLaundry);
  assert.equal((await f.request('/planner', { data: f.planner, revision: 1 }, undefined, 'PUT')).status, 409);
  assert.equal((await f.request('/team')).status, 401);
  assert.equal((await f.request('/invitations', { staffId: 'a' })).status, 401);
  assert.equal(JSON.parse(readFileSync(f.file, 'utf8')).audit.at(-1).actor, 'public');
});

test('async storage commits before success and reports failed saves without changing data', async (t) => {
  const f = await fixture(t, true);
  assert.equal((await f.invite('a', 'israel')).status, 201);
  f.writes.fail = true;
  assert.equal((await f.request('/planner', { data: f.planner, revision: 1 }, f.admin.cookie, 'PUT')).status, 503);
  const saved = (await f.request('/planner', undefined, f.admin.cookie)).body;
  assert.equal(saved.revision, 1);
  assert.equal(saved.data.staff.length, 2);
  f.writes.fail = false;
  const results = await Promise.all([1, 2].map(() => f.request('/planner', { data: f.planner, revision: 1 }, f.admin.cookie, 'PUT')));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
});

test('server authenticates accounts, protects roles and stores password hashes', async (t) => {
  const f = await fixture(t), member = await f.invite('a', 'israel');
  assert.equal(member.status, 201); assert.match(member.cookieHeader, /HttpOnly/); assert.match(member.cookieHeader, /SameSite=Strict/);
  assert.equal((await f.request('/planner')).status, 401);
  assert.equal((await f.request('/planner', undefined, member.cookie)).status, 403);
  assert.equal((await f.request('/team', undefined, member.cookie)).status, 403);
  assert.equal((await f.request('/setup', { setupToken: 'test-setup-code', username: 'manager2', password: 'strong-test-password' })).status, 409);
  assert.equal(readFileSync(f.file, 'utf8').includes('strong-test-password'), false);
  const cross = await fetch(f.base + '/api/logout', { method: 'POST', headers: { Origin: 'https://evil.example', Cookie: member.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(cross.status, 403);
});

test('stale administrator writes are rejected without overwriting another change', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/planner', { data: f.planner, revision: 0 }, f.admin.cookie, 'PUT')).status, 409);
  assert.equal((await f.request('/planner', undefined, f.admin.cookie)).body.revision, 1);
});

test('request, offer and approval atomically update the schedule with an audit record', async (t) => {
  const f = await fixture(t), a = await f.invite('a', 'israel'), b = await f.invite('b', 'david');
  assert.equal((await f.request('/requests', { start: f.start, key: '0:4:afternoon', note: 'בקשה' }, b.cookie)).status, 400);
  assert.equal((await f.request('/requests', { start: f.start, key: '0:4:afternoon', note: 'בקשה' }, a.cookie)).status, 201);
  const team = await f.request('/team', undefined, f.admin.cookie), id = team.body.requests[0].id;
  assert.equal((await f.request('/requests/offer', { id }, b.cookie)).status, 200);
  assert.equal((await f.request('/requests/approve', { id, candidateId: 'b' }, a.cookie)).status, 403);
  assert.equal((await f.request('/requests/approve', { id, candidateId: 'b' }, f.admin.cookie)).status, 200);
  const saved = (await f.request('/planner', undefined, f.admin.cookie)).body.data;
  assert.deepEqual(saved.periods[f.start].assignments['0:4:afternoon'], ['b']); assert.deepEqual(saved.recurring['4:afternoon'], ['a']);
  const personal = await f.request(`/personal?start=${f.start}`, undefined, b.cookie);
  assert.equal(personal.body.shifts.length, 1); assert.equal(personal.body.planner, undefined);
  const final = await f.request('/team', undefined, f.admin.cookie);
  assert.ok(final.body.audit.some((entry) => entry.action === 'swap-approved'));
});

test('approval rechecks availability and staff cannot edit another person availability', async (t) => {
  const f = await fixture(t), a = await f.invite('a', 'israel'), b = await f.invite('b', 'david');
  await f.request('/requests', { start: f.start, key: '0:4:afternoon', note: '' }, a.cookie);
  const id = (await f.request('/team', undefined, f.admin.cookie)).body.requests[0].id;
  await f.request('/requests/offer', { id }, b.cookie);
  const date = toDateKey(addDays(new Date(`${f.start}T12:00:00`), 4));
  await f.request('/availability', { staffId: 'a', start: date, end: date, note: 'פרטי' }, b.cookie);
  assert.equal((await f.request('/requests/approve', { id, candidateId: 'b' }, f.admin.cookie)).status, 400);
  const personal = (await f.request(`/personal?start=${f.start}`, undefined, a.cookie)).body;
  assert.deepEqual(personal.unavailability, []);
  assert.equal((await f.request('/team', undefined, f.admin.cookie)).body.requests[0].status, 'open');
});

test('invitations are single use and disabled accounts lose their session', async (t) => {
  const f = await fixture(t);
  const invitation = await f.request('/invitations', { staffId: 'a' }, f.admin.cookie);
  const a = await f.request('/join', { token: invitation.body.token, username: 'israel', password: 'strong-test-password' });
  assert.equal((await f.request('/join', { token: invitation.body.token, username: 'another', password: 'strong-test-password' })).status, 403);
  await f.request('/users/disable', { id: a.body.id }, f.admin.cookie);
  assert.equal((await f.request('/personal', undefined, a.cookie)).status, 401);
});
