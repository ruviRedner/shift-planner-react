import { getShiftsForDay, parseDate, toDateKey } from "../domain/planner.ts";
import type { PlannerData, Period, Unavailability, Publication } from "../domain/planner.ts";
import type { Assignments } from "../assignments.ts";

const invalid = () => new Error("קובץ הגיבוי אינו תקין או שאינו בגרסה נתמכת.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== "string" || value.length > max) throw invalid();
  return value;
}
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number(value.slice(0, 4)) >= 1900 && toDateKey(parseDate(value)) === value;
}
function sunday(value: unknown): string {
  if (!validDate(value) || parseDate(value).getDay() !== 0) throw invalid();
  return value;
}
function assignments(value: unknown, staff: Set<string>, weekly = false): Assignments {
  const entries = Object.entries(object(value));
  return Object.fromEntries(entries.map(([key, ids]) => {
    const match = (weekly ? /^([0-6]):([a-zA-Z]+)$/ : /^[01]:([0-6]):([a-zA-Z]+)$/).exec(key);
    if (!match || !Array.isArray(ids) || !ids.every((id) => typeof id === "string" && staff.has(id))) throw invalid();
    const day = Number(match[1]);
    const shift = match[2];
    const legacy = !weekly && (day === 5 && ["afternoon", "night"].includes(shift) || day === 6 && shift === "shabbat");
    if (!legacy && !getShiftsForDay(day).some((type) => type === shift)) throw invalid();
    return [key, [...new Set(ids)] as string[]];
  }));
}
function migrateWeekend(value: Assignments): Assignments {
  const result = { ...value };
  for (const week of [0, 1]) {
    const target = `${week}:5:friday`;
    const old = [`${week}:5:afternoon`, `${week}:5:night`, `${week}:6:shabbat`];
    if (old.some((key) => Object.hasOwn(result, key))) {
      result[target] = [...new Set([...(result[target] ?? []), ...old.flatMap((key) => result[key] ?? [])])];
      old.forEach((key) => delete result[key]);
    }
  }
  return result;
}

export function decodePlanner(raw: string): PlannerData {
  const parsed = object(JSON.parse(raw));
  if (parsed.version !== 1 || !Array.isArray(parsed.staff)) throw invalid();
  const staff = parsed.staff.map((value) => {
    const member = object(value);
    const id = text(member.id);
    const name = text(member.name, 50);
    if (!id.trim() || !name.trim()) throw invalid();
    return { id, name };
  });
  const staffIds = new Set(staff.map((member) => member.id));
  if (staffIds.size !== staff.length) throw invalid();
  const periods = Object.fromEntries(Object.entries(object(parsed.periods)).map(([date, value]) => {
    sunday(date);
    const period = object(value);
    if (!Array.isArray(period.weekNotes) || period.weekNotes.length !== 2) throw invalid();
    const decoded: Period = {
      weekNotes: [text(period.weekNotes[0], 80), text(period.weekNotes[1], 80)],
      assignments: migrateWeekend(assignments(period.assignments, staffIds)),
    };
    if (period.beforeWeekCopy !== undefined) {
      // Older versions kept deleted staff in the copy backup. Only the undo snapshot is cleaned.
      const backup = Object.fromEntries(Object.entries(object(period.beforeWeekCopy)).map(([key, ids]) => {
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) throw invalid();
        return [key, ids.filter((id) => staffIds.has(id))];
      }));
      decoded.beforeWeekCopy = migrateWeekend(assignments(backup, staffIds));
    }
    return [date, decoded];
  }));
  const rawUnavailable = parsed.unavailability ?? [];
  if (!Array.isArray(rawUnavailable)) throw invalid();
  const unavailability: Unavailability[] = rawUnavailable.map((value) => {
    const entry = object(value);
    const id = text(entry.id);
    const staffId = text(entry.staffId);
    if (!id || !staffIds.has(staffId) || !validDate(entry.start) || !validDate(entry.end) || entry.start > entry.end) throw invalid();
    return { id, staffId, start: entry.start, end: entry.end, note: text(entry.note) };
  });
  if (new Set(unavailability.map((entry) => entry.id)).size !== unavailability.length) throw invalid();
  const result: PlannerData = { version: 1, currentStart: sunday(parsed.currentStart), staff, periods,
    recurring: assignments(parsed.recurring ?? {}, staffIds, true), unavailability };
  if (parsed.residents !== undefined) {
    if (!Array.isArray(parsed.residents)) throw invalid();
    result.residents = parsed.residents.map((value) => {
      const resident = object(value), id = text(resident.id), name = text(resident.name, 50);
      if (!id.trim() || !name.trim()) throw invalid();
      return { id, name };
    });
    if (new Set(result.residents.map((resident) => resident.id)).size !== result.residents.length) throw invalid();
  }
  if (parsed.laundry !== undefined) {
    const residents = new Set((result.residents ?? []).map((resident) => resident.id));
    result.laundry = Object.fromEntries(Object.entries(object(parsed.laundry)).map(([date, ids]) => {
      if (!validDate(date) || !Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && residents.has(id))) throw invalid();
      return [date, [...new Set(ids)]];
    }));
  }
  if (parsed.recurringLaundry !== undefined) {
    const residents = new Set((result.residents ?? []).map((resident) => resident.id));
    result.recurringLaundry = Object.fromEntries(Object.entries(object(parsed.recurringLaundry)).map(([day, ids]) => {
      if (!/^[0-5]$/.test(day) || !Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && residents.has(id))) throw invalid();
      return [day, [...new Set(ids)]];
    }));
  }
  if (parsed.publications !== undefined) result.publications = Object.fromEntries(Object.entries(object(parsed.publications)).map(([date, value]) => {
    sunday(date);
    const publication = object(value);
    const publishedAt = text(publication.publishedAt);
    if (!Number.isFinite(Date.parse(publishedAt)) || !Array.isArray(publication.weekNotes) || publication.weekNotes.length !== 2) throw invalid();
    const names = Object.fromEntries(Object.entries(object(publication.assignments)).map(([key, values]) => {
      if (!Array.isArray(values)) throw invalid();
      return [key, values.map((value) => text(value, 50))];
    }));
    assignments(names, new Set(Object.values(names).flat()));
    const decoded: Publication = { publishedAt, assignments: names, weekNotes: [text(publication.weekNotes[0], 80), text(publication.weekNotes[1], 80)] };
    if (publication.laundry !== undefined) decoded.laundry = Object.fromEntries(Object.entries(object(publication.laundry)).map(([date, values]) => {
      if (!validDate(date) || !Array.isArray(values)) throw invalid();
      return [date, values.map((value) => text(value, 50))];
    }));
    return [date, decoded];
  }));
  return result;
}

export function encodePlanner(data: PlannerData): string {
  return JSON.stringify(data, null, 2);
}
