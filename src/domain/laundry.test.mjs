import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialData } from './planner.ts';
import { deleteResident, setLaundry, laundryNames } from './laundry.ts';
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
  assert.deepEqual(publicationReview(setLaundry(data, '2026-09-06', ['r2'])).laundryChanged, ['2026-09-06']);
});

test('removal cleans all laundry dates; clearing a fortnight preserves residents and other dates', () => {
  const data = fixture();
  const removed = deleteResident(data, 'r1');
  assert.deepEqual(removed.laundry, { '2026-09-06': ['r2'], '2026-09-19': ['r2'] });
  assert.deepEqual(clearPeriod(data).laundry, { '2026-09-20': ['r1'] });
  assert.deepEqual(clearPeriod(data).residents, data.residents);
  assert.deepEqual(data.laundry['2026-09-06'], ['r1', 'r2']);
  assert.deepEqual(setLaundry(data, '2026-09-06', ['r2', 'r2', 'missing']).laundry['2026-09-06'], ['r2']);
  assert.equal(setLaundry(data, '2026-09-06', []).laundry['2026-09-06'], undefined);
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
