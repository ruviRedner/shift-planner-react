import { addDays, assignmentKey, parseDate, toDateKey } from "./planner.ts";
import { laundryNames } from "./laundry.ts";
import type { PlannerData, Publication } from "./planner.ts";
import { conflictsForPeriod, periodSlots } from "./insights.ts";

export function publicationSnapshot(data: PlannerData, publishedAt = new Date().toISOString()): Publication {
  const names = new Map(data.staff.map((member) => [member.id, member.name]));
  return { publishedAt, weekNotes: [...(data.periods[data.currentStart]?.weekNotes ?? ["", ""])],
    laundry: Object.fromEntries(Array.from({ length: 14 }, (_, day) => { const date = toDateKey(addDays(parseDate(data.currentStart), day)); return [date, laundryNames(data, date)]; })),
    assignments: Object.fromEntries(periodSlots(data).map((slot) => [assignmentKey(slot.week, slot.day, slot.shift), slot.ids.map((id) => names.get(id)).filter((name): name is string => Boolean(name))])) };
}
export function publicationReview(data: PlannerData) {
  const current = publicationSnapshot(data);
  const previous = data.publications?.[data.currentStart];
  return {
    snapshot: current, previous,
    empty: periodSlots(data).filter((slot) => current.assignments[assignmentKey(slot.week, slot.day, slot.shift)].length === 0),
    conflicts: conflictsForPeriod(data),
    changed: previous ? Object.keys(current.assignments).filter((key) => JSON.stringify([...current.assignments[key]].sort()) !== JSON.stringify([...(previous.assignments[key] ?? [])].sort())) : [],
    notesChanged: previous ? current.weekNotes.some((note, index) => note !== previous.weekNotes[index]) : false,
    laundryChanged: previous ? Object.keys(current.laundry ?? {}).filter((date) => JSON.stringify([...(current.laundry?.[date] ?? [])].sort()) !== JSON.stringify([...(previous.laundry?.[date] ?? [])].sort())) : [],
  };
}
