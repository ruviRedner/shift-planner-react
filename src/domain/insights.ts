import { resolveAssignment } from "../assignments.ts";
import { addDays, createEmptyPeriod, DAYS, getShiftsForDay, parseDate, SHIFT_META, toDateKey } from "./planner.ts";
import type { PlannerData, ShiftType, Unavailability } from "./planner.ts";

export function unavailableForShift(entries: Unavailability[], staffId: string, date: string, shift: ShiftType): boolean {
  const end = toDateKey(addDays(parseDate(date), SHIFT_META[shift].durationDays - 1));
  return entries.some((entry) => entry.staffId === staffId && entry.start <= end && entry.end >= date);
}

export function periodSlots(data: PlannerData) {
  const period = data.periods[data.currentStart] ?? createEmptyPeriod();
  return [0, 1].flatMap((week) => DAYS.flatMap((_, day) => getShiftsForDay(day).map((shift) => ({
    week, day, shift, date: toDateKey(addDays(parseDate(data.currentStart), week * 7 + day)),
    ids: resolveAssignment(period.assignments, data.recurring, week, day, shift),
  }))));
}

export function workloadForPeriod(data: PlannerData) {
  const rows = new Map(data.staff.map((member) => [member.id, { ...member, afternoon: 0, night: 0, shabbat: 0, total: 0 }]));
  for (const slot of periodSlots(data)) {
    for (const id of new Set(slot.ids)) {
      const row = rows.get(id);
      if (row) { row[SHIFT_META[slot.shift].category] += 1; row.total += 1; }
    }
  }
  return [...rows.values()];
}

export function conflictsForPeriod(data: PlannerData) {
  const names = new Map(data.staff.map((member) => [member.id, member.name]));
  return periodSlots(data).flatMap((slot) => slot.ids.filter((id) => names.has(id) &&
    unavailableForShift(data.unavailability, id, slot.date, slot.shift)).map((id) => ({ ...slot, staffId: id, name: names.get(id)! })));
}
