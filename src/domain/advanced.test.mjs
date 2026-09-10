import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeInitialData } from './planner.ts';
import { defaultAutoOptions, proposeSchedule, applyProposal } from './autoSchedule.ts';
import { periodSlots } from './insights.ts';
import { calendarFile } from './calendarExport.ts';
import { publicationReview, publicationSnapshot } from './publication.ts';
import { decodePlanner, encodePlanner } from '../storage/codec.ts';
import { updatePeriod } from './commands.ts';
import { visiblePeriod } from './periods.ts';

const fixture = () => ({ ...makeInitialData(), currentStart: '2026-09-06', staff: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `מדריך ${id}` })), recurring: { '4:afternoon': ['a'] } });

test('automatic preview fills eligible slots while preserving rules and explicit clears', () => {
  const data = fixture(); data.periods[data.currentStart] = { assignments: { '0:0:night': [] }, weekNotes: ['', ''] };
  data.unavailability = [{ id: 'u', staffId: 'b', start: '2026-09-06', end: '2026-09-19', note: '' }];
  const before = structuredClone(data), proposal = proposeSchedule(data, defaultAutoOptions);
  assert.deepEqual(data, before);
  assert.equal(proposal.assignments['0:0:night'], undefined);
  assert.equal(proposal.assignments['0:4:afternoon'], undefined);
  assert.equal(Object.values(proposal.assignments).some((ids) => ids.includes('b')), false);
  const result = periodSlots(applyProposal(data, proposal));
  for (const week of [0, 1]) for (const member of data.staff) assert.ok(result.filter((slot) => slot.week === week && slot.ids.includes(member.id)).length <= 7);
});

test('automatic scheduling reports shortages instead of violating availability or weekly limits', () => {
  const data = fixture(); data.staff = data.staff.slice(0, 1); data.recurring = {};
  const proposal = proposeSchedule(data, { ...defaultAutoOptions, maxPerWeek: 1 });
  assert.equal(Object.keys(proposal.assignments).length, 2);
  assert.ok(proposal.unfilled.length > 0);
});

test('balanced proposal honors a two-person target and is deterministic', () => {
  const data = fixture(); data.recurring = {};
  const options = { ...defaultAutoOptions, required: { afternoon: 2, night: 2, friday: 2, motzeiShabbat: 2 } };
  assert.deepEqual(proposeSchedule(data, options), proposeSchedule(data, options));
  const proposal = proposeSchedule(data, options);
  assert.equal(proposal.unfilled.length, 0);
  assert.ok(Object.values(proposal.assignments).every((ids) => ids.length === 2));
});

test('publication tracks changed names, empty shifts and changed notes; backups preserve it', () => {
  const data = fixture(); data.publications = { [data.currentStart]: publicationSnapshot(data) };
  assert.equal(publicationReview(data).changed.length, 0);
  data.periods[data.currentStart] = { assignments: { '0:4:afternoon': ['b'] }, weekNotes: ['שינוי', ''] };
  const review = publicationReview(data);
  assert.deepEqual(review.changed, ['0:4:afternoon']); assert.equal(review.notesChanged, true); assert.equal(review.empty.length, 22);
  assert.deepEqual(decodePlanner(encodePlanner(data)), data);
});

test('calendar export has stable event IDs, exclusive weekend end dates and folded UTF-8 lines', () => {
  const content = calendarFile('ישראל', [{ date: '2026-09-11', shift: 'friday' }], new Date('2026-09-01T00:00:00Z'));
  assert.match(content, /DTSTART;VALUE=DATE:20260911/); assert.match(content, /DTEND;VALUE=DATE:20260913/);
  assert.match(content, /BEGIN:VCALENDAR/); assert.match(content, /DTSTAMP:20260901T000000Z/);
  assert.ok(content.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});

test('overlapping fortnight views show the same date override and synchronize edits and resets', () => {
  let data = fixture();
  data.periods = {
    '2026-09-06': { weekNotes: ['', ''], assignments: { '1:4:afternoon': ['b'] } },
    '2026-09-13': { weekNotes: ['', ''], assignments: {} },
  };
  data.currentStart = '2026-09-13';
  assert.deepEqual(visiblePeriod(data).assignments['0:4:afternoon'], ['b']);
  data = updatePeriod(data, (period) => ({ ...period, assignments: { ...period.assignments, '0:4:afternoon': ['c'] } }));
  assert.deepEqual(data.periods['2026-09-06'].assignments['1:4:afternoon'], ['c']);
  data = updatePeriod(data, (period) => { const assignments = { ...period.assignments }; delete assignments['0:4:afternoon']; return { ...period, assignments }; });
  assert.equal(data.periods['2026-09-06'].assignments['1:4:afternoon'], undefined);
  assert.equal(visiblePeriod(data).assignments['0:4:afternoon'], undefined);
  assert.deepEqual(periodSlots(data).find((slot) => slot.week === 0 && slot.day === 4 && slot.shift === 'afternoon').ids, ['a']);
});
