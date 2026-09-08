import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialData } from './planner.ts';
import { clearPeriod, deleteStaff, saveRecurring } from './commands.ts';
import { reduceHistory } from './history.ts';
import { conflictsForPeriod, unavailableForShift, workloadForPeriod } from './insights.ts';
import { decodePlanner, encodePlanner } from '../storage/codec.ts';
import { createStorageRepository } from '../storage/repository.ts';

function fixture() {
  return { ...makeInitialData(), currentStart: '2026-09-06',
    staff: [{ id: 'israel', name: 'ישראל' }, { id: 'david', name: 'דוד' }, { id: 'unused', name: 'ללא משמרות' }],
    recurring: { '4:afternoon': ['israel'], '3:night': ['israel'], '5:friday': ['david'], '6:motzeiShabbat': ['david'] },
    periods: { '2026-09-06': { weekNotes: ['הערה', ''], assignments: { '0:4:afternoon': ['david'], '1:3:night': [] }, beforeWeekCopy: { '1:4:afternoon': [] } } },
    unavailability: [{ id: 'u1', staffId: 'israel', start: '2026-09-09', end: '2026-09-10', note: 'חופשה' }],
  };
}

test('backup round-trip preserves Hebrew, explicit empty shifts, rules, notes and availability', () => {
  assert.deepEqual(decodePlanner(encodePlanner(fixture())), fixture());
});

test('legacy backups without availability or recurring rules still load', () => {
  const old = fixture(); delete old.unavailability; delete old.recurring;
  const decoded = decodePlanner(JSON.stringify(old));
  assert.deepEqual(decoded.unavailability, []); assert.deepEqual(decoded.recurring, {});
  assert.deepEqual(decoded.periods, old.periods);
});

test('legacy weekend assignments and undo snapshots migrate without reviving removed staff', () => {
  const old = fixture();
  old.periods[old.currentStart].assignments = { '0:5:afternoon': ['israel'], '0:6:shabbat': ['david'] };
  old.periods[old.currentStart].beforeWeekCopy = { '1:6:shabbat': ['deleted', 'israel'] };
  const decoded = decodePlanner(JSON.stringify(old));
  assert.deepEqual(decoded.periods[old.currentStart].assignments, { '0:5:friday': ['israel', 'david'] });
  assert.deepEqual(decoded.periods[old.currentStart].beforeWeekCopy, { '1:5:friday': ['israel'] });
});

test('malformed backups are rejected instead of silently replacing data', () => {
  const mutations = [
    (d) => { d.version = 2; }, (d) => { d.currentStart = '2026-09-07'; },
    (d) => { d.currentStart = '2026-02-30'; }, (d) => { d.staff.push(d.staff[0]); },
    (d) => { d.periods[d.currentStart].assignments['0:4:afternoon'] = ['unknown']; },
    (d) => { d.periods[d.currentStart].assignments['0:5:motzeiShabbat'] = []; },
    (d) => { d.periods[d.currentStart].weekNotes = ['only one']; },
    (d) => { d.unavailability[0].end = '2026-09-01'; },
    (d) => { d.unavailability[0].staffId = 'unknown'; },
    (d) => { d.recurring = { '__proto__': [] }; d.periods = []; },
  ];
  for (const mutate of mutations) { const data = fixture(); mutate(data); assert.throws(() => decodePlanner(JSON.stringify(data))); }
  for (const raw of ['null', '[]', '{', '{}']) assert.throws(() => decodePlanner(raw));
});

test('workload reflects overrides, counts weekends once and includes staff without shifts', () => {
  const rows = workloadForPeriod(fixture());
  assert.deepEqual(rows.map(({ id, afternoon, night, shabbat, total }) => ({ id, afternoon, night, shabbat, total })), [
    { id: 'israel', afternoon: 1, night: 1, shabbat: 0, total: 2 },
    { id: 'david', afternoon: 1, night: 2, shabbat: 2, total: 5 },
    { id: 'unused', afternoon: 0, night: 0, shabbat: 0, total: 0 },
  ]);
});

test('availability includes range boundaries and both days of Friday-Shabbat', () => {
  const entries = fixture().unavailability;
  assert.equal(unavailableForShift(entries, 'israel', '2026-09-09', 'night'), true);
  assert.equal(unavailableForShift(entries, 'israel', '2026-09-10', 'afternoon'), true);
  assert.equal(unavailableForShift(entries, 'israel', '2026-09-11', 'night'), false);
  const shabbatOnly = [{ ...entries[0], start: '2026-09-12', end: '2026-09-12' }];
  assert.equal(unavailableForShift(shabbatOnly, 'israel', '2026-09-11', 'friday'), true);
  assert.equal(unavailableForShift(shabbatOnly, 'david', '2026-09-11', 'friday'), false);
});

test('conflicts are based on effective assignments and update after navigation', () => {
  const data = fixture();
  const conflicts = conflictsForPeriod(data);
  assert.equal(conflicts.length, 1); assert.equal(conflicts[0].date, '2026-09-09');
  data.currentStart = '2026-09-20'; assert.deepEqual(conflictsForPeriod(data), []);
});

test('undo restores all data after clearing, deleting a member, saving recurring rules and importing', () => {
  const original = fixture();
  for (const update of [clearPeriod, (d) => deleteStaff(d, 'israel'), (d) => saveRecurring(d, 4, 'afternoon', ['israel']), () => makeInitialData()]) {
    const changed = reduceHistory({ present: original, past: [] }, { type: 'change', update, label: 'change' });
    assert.notDeepEqual(changed.present, original);
    assert.deepEqual(reduceHistory(changed, { type: 'undo' }).present, original);
    assert.deepEqual(decodePlanner(encodePlanner(changed.present)), changed.present);
  }
});

test('clear affects the displayed period only and staff removal cleans all references', () => {
  const original = fixture();
  const cleared = clearPeriod(original);
  assert.equal(workloadForPeriod(cleared).every((row) => row.total === 0), true);
  assert.deepEqual(cleared.recurring, original.recurring);
  const deleted = deleteStaff(original, 'israel');
  assert.deepEqual(deleted.unavailability, []);
  assert.equal(encodePlanner(deleted).includes('israel'), false);
});

test('navigation does not consume undo and consecutive note typing is a single action', () => {
  const initial = { present: fixture(), past: [] };
  const edit = (name) => ({ type: 'change', group: 'note', label: 'note', update: (d) => ({ ...d, staff: [{ ...d.staff[0], name }] }) });
  let state = reduceHistory(initial, edit('א'));
  state = reduceHistory(state, edit('אב'));
  assert.equal(state.past.length, 1);
  state = reduceHistory(state, { type: 'navigate', start: '2026-09-20' });
  assert.equal(state.past.length, 1);
  assert.deepEqual(reduceHistory(state, { type: 'undo' }), initial);
});

test('history is bounded and ignores no-op writes', () => {
  let state = { present: fixture(), past: [] };
  assert.equal(reduceHistory(state, { type: 'change', update: (d) => ({ ...d }), label: 'noop' }), state);
  for (let i = 0; i < 40; i++) state = reduceHistory(state, { type: 'change', label: 'change', update: (d) => ({ ...d, staff: [{ id: 'x', name: String(i) }] }) });
  assert.equal(state.past.length, 30);
});

test('storage adapter supports injected storage, propagates errors and never overwrites on failed load', () => {
  const values = new Map();
  const repository = createStorageRepository({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  assert.equal(repository.load().version, 1);
  repository.save(fixture()); assert.deepEqual(repository.load(), fixture());
  values.set('shift-planner-data-v1', 'broken');
  assert.throws(() => repository.load()); assert.equal(values.get('shift-planner-data-v1'), 'broken');
  const failing = createStorageRepository({ getItem: () => { throw Error('read denied'); }, setItem: () => { throw Error('quota'); } });
  assert.throws(() => failing.load(), /read denied/); assert.throws(() => failing.save(fixture()), /quota/);
});
