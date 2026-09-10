import { randomUUID } from 'node:crypto';
import { assignmentKey, addDays, createEmptyPeriod, getShiftsForDay, parseDate, toDateKey } from '../src/domain/planner.ts';
import { periodSlots, unavailableForShift } from '../src/domain/insights.ts';
import { resolveAssignment } from '../src/assignments.ts';
import { validDate } from '../src/storage/codec.ts';

export function getSlot(planner, start, key) {
  if (!validDate(start) || parseDate(start).getDay() !== 0 || typeof key !== 'string') throw new Error('משמרת לא תקינה');
  const match = /^([01]):([0-6]):([a-zA-Z]+)$/.exec(key);
  if (!match || !getShiftsForDay(Number(match[2])).includes(match[3])) throw new Error('משמרת לא תקינה');
  const week = Number(match[1]), day = Number(match[2]), shift = match[3];
  const date = toDateKey(addDays(parseDate(start), week * 7 + day));
  let ids = resolveAssignment(planner.periods[start]?.assignments ?? {}, planner.recurring, week, day, shift);
  const matches = [];
  for (const [savedStart, period] of Object.entries(planner.periods)) {
    for (const savedWeek of [0, 1]) {
      const savedKey = assignmentKey(savedWeek, day, shift);
      if (toDateKey(addDays(parseDate(savedStart), savedWeek * 7 + day)) === date && Object.hasOwn(period.assignments, savedKey)) matches.push(period.assignments[savedKey]);
    }
  }
  if (matches.length) {
    if (matches.some((match) => JSON.stringify([...match].sort()) !== JSON.stringify([...matches[0]].sort()))) throw new Error('קיימים שיבוצים סותרים לתאריך זה בתקופות חופפות. פנו למנהל');
    ids = matches[0];
  }
  return { week, day, shift, date, ids, key, start };
}

export function openSwap(state, staffId, start, key, note) {
  const slot = getSlot(state.planner, start, key);
  if (!slot.ids.includes(staffId)) throw new Error('אפשר לבקש החלפה רק למשמרת שלך');
  if (slot.date < toDateKey(new Date())) throw new Error('לא ניתן לפתוח בקשה למשמרת שכבר עברה');
  if (state.requests.some((request) => request.status === 'open' && request.date === slot.date && request.shift === slot.shift && request.requesterId === staffId)) throw new Error('כבר קיימת בקשה פתוחה למשמרת זו');
  const request = { id: randomUUID(), periodStart: start, key, date: slot.date, shift: slot.shift, requesterId: staffId,
    note, status: 'open', offers: [], createdAt: new Date().toISOString() };
  state.requests.push(request);
  return request;
}

export function offerSwap(state, requestId, staffId) {
  const request = state.requests.find((entry) => entry.id === requestId);
  if (!request || request.status !== 'open') throw new Error('הבקשה אינה פתוחה');
  const slot = getSlot(state.planner, request.periodStart, request.key);
  if (request.date < toDateKey(new Date()) || !slot.ids.includes(request.requesterId)) throw new Error('השיבוץ השתנה או שהמשמרת כבר עברה');
  if (slot.ids.includes(staffId)) throw new Error('כבר שובצת למשמרת זו');
  if (unavailableForShift(state.planner.unavailability, staffId, slot.date, slot.shift)) throw new Error('סימנת חוסר זמינות למשמרת זו');
  if (!request.offers.includes(staffId)) request.offers.push(staffId);
}

export function approveSwap(state, requestId, candidateId, adminId) {
  const request = state.requests.find((entry) => entry.id === requestId);
  if (!request || request.status !== 'open' || !request.offers.includes(candidateId)) throw new Error('ההצעה אינה זמינה לאישור');
  if (!state.planner.staff.some((member) => member.id === candidateId)) throw new Error('איש הצוות הוסר');
  const slot = getSlot(state.planner, request.periodStart, request.key);
  if (slot.date < toDateKey(new Date()) || !slot.ids.includes(request.requesterId) || slot.ids.includes(candidateId)) throw new Error('השיבוץ השתנה. יש לבדוק מחדש את הבקשה');
  if (unavailableForShift(state.planner.unavailability, candidateId, slot.date, slot.shift)) throw new Error('המחליף אינו זמין בתאריך זה');
  const period = state.planner.periods[request.periodStart] ?? createEmptyPeriod();
  const nextIds = slot.ids.map((id) => id === request.requesterId ? candidateId : id);
  // Update any overlapping saved periods that expose this same calendar occurrence.
  for (const [start, saved] of Object.entries({ ...state.planner.periods, [request.periodStart]: period })) {
    for (const week of [0, 1]) {
      const date = toDateKey(addDays(parseDate(start), week * 7 + slot.day));
      if (date !== slot.date) continue;
      const currentIds = resolveAssignment(saved.assignments, state.planner.recurring, week, slot.day, slot.shift);
      if (start !== request.periodStart && Object.hasOwn(saved.assignments, assignmentKey(week, slot.day, slot.shift)) && JSON.stringify([...currentIds].sort()) !== JSON.stringify([...slot.ids].sort())) throw new Error('קיימים שיבוצים שונים לתאריך זה בתקופות חופפות. יש ליישר אותם לפני האישור');
      state.planner.periods[start] = { ...saved, assignments: { ...saved.assignments, [assignmentKey(week, slot.day, slot.shift)]: nextIds }, beforeWeekCopy: undefined };
    }
  }
  request.status = 'approved'; request.approvedId = candidateId; request.resolvedAt = new Date().toISOString();
  state.revision += 1;
  state.audit.push({ id: randomUUID(), at: request.resolvedAt, actor: adminId, action: 'swap-approved', requestId, date: slot.date, before: slot.ids, after: nextIds });
}

export function personalView(state, staffId, start) {
  if (!validDate(start) || parseDate(start).getDay() !== 0) throw new Error('תאריך תחילת תקופה לא תקין');
  return {
    staffId, start, name: state.planner.staff.find((member) => member.id === staffId)?.name ?? '',
    shifts: periodSlots({ ...state.planner, currentStart: start }).map((slot) => getSlot(state.planner, start, assignmentKey(slot.week, slot.day, slot.shift))).filter((slot) => slot.ids.includes(staffId)).map(({ ids, ...slot }) => slot),
    unavailability: state.planner.unavailability.filter((entry) => entry.staffId === staffId),
    requests: state.requests.filter((request) => request.status === 'open' || request.requesterId === staffId || request.offers.includes(staffId)).map((request) => ({
      ...request, requesterName: state.planner.staff.find((member) => member.id === request.requesterId)?.name ?? 'איש צוות שהוסר',
      offers: request.offers.filter((id) => id === staffId), offerCount: request.offers.length,
    })),
  };
}
