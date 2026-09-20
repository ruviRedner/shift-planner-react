import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialData } from './planner.ts';
import { deleteResident, setLaundry, laundryNames, recurringLaundry, setRecurringLaundry } from './laundry.ts';
import { clearPeriod } from './commands.ts';
import { decodePlanner, encodePlanner } from '../storage/codec.ts';
import { publicationSnapshot, publicationReview } from './publication.ts';

const fixture = () => ({ ...makeInitialData(), currentStart: '2026-09-06', residents: [{ id: 'r1', name: 'דייר ראשון' }, { id: 'r2', name: 'דייר שני' }], laundry: { '2026-09-06': ['r1', 'r2'], '2026-09-19': ['r2'], '2026-09-20': ['r1'] } });

test('residents and daily laundry survive backup, period navigation and publication', () => {
  const data = fixture();
  assert.deepEqual(decodePlanner(encodePlanner(data)), data);
  assert.deepEqual(laundryNames({ ...data, currentStart: '2026-09-13' }, '2026-09-19'), ['דייר שני']);
  data.publications = { [data.currentStart]: publicationSnapshot(data) };
  assert.deepEqual(decodePlanner(encodePlanner(data)), data);
  assert.deepEqual(publicationReview(setRecurringLaundry(data, '0', ['r2'])).laundryChanged, ['2026-09-06', '2026-09-13']);
});

test('removal cleans all laundry dates; clearing a fortnight preserves residents and other dates', () => {
  const data = fixture();
  const removed = deleteResident(data, 'r1');
  assert.deepEqual(removed.laundry, { '2026-09-06': ['r2'], '2026-09-19': ['r2'] });
  assert.deepEqual(clearPeriod(data).laundry, data.laundry);
  assert.deepEqual(clearPeriod(data).residents, data.residents);
  assert.deepEqual(data.laundry['2026-09-06'], ['r1', 'r2']);
  assert.deepEqual(setLaundry(data, '2026-09-06', ['r2', 'r2', 'missing']).laundry['2026-09-06'], ['r2']);
  assert.equal(setLaundry(data, '2026-09-06', []).laundry['2026-09-06'], undefined);
});

test('fixed laundry repeats across periods, combines weekend and survives clear and backup', () => {
  const legacy = fixture();
  legacy.laundry['2026-09-18'] = ['r1'];
  assert.deepEqual(recurringLaundry(legacy)['5'].sort(), ['r1', 'r2']);
  const fixed = setRecurringLaundry(legacy, '5', ['r2']);
  assert.deepEqual(laundryNames(fixed, '2026-10-02'), ['דייר שני']);
  assert.deepEqual(laundryNames(fixed, '2026-10-03'), ['דייר שני']);
  assert.deepEqual(clearPeriod(fixed).recurringLaundry, fixed.recurringLaundry);
  assert.deepEqual(decodePlanner(encodePlanner(fixed)), fixed);
  assert.deepEqual(setRecurringLaundry(fixed, '5', []).recurringLaundry['5'], []);
  assert.deepEqual(deleteResident(fixed, 'r2').recurringLaundry['5'], []);
});

test('legacy data loads and malformed residents or laundry are rejected', () => {
  assert.deepEqual(decodePlanner(encodePlanner(makeInitialData())), makeInitialData());
  for (const mutate of [
    d => d.residents.push(d.residents[0]), d => d.residents[0].name = '',
    d => d.laundry['2026-02-30'] = ['r1'], d => d.laundry['2026-09-06'] = ['unknown'],
  ]) {
    const data = fixture(); mutate(data); assert.throws(() => decodePlanner(encodePlanner(data)));
  }
});
