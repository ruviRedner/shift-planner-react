import { addDays, createEmptyPeriod, parseDate, toDateKey } from "./planner.ts";
import type { Period, PlannerData } from "./planner.ts";

function occurrence(start: string, key: string) {
  const [week, day, shift] = key.split(":");
  return { date: toDateKey(addDays(parseDate(start), Number(week) * 7 + Number(day))), day: Number(day), shift };
}

// A calendar occurrence can be visible from two overlapping fortnight windows.
export function visiblePeriod(data: PlannerData): Period {
  const own = data.periods[data.currentStart] ?? createEmptyPeriod();
  const assignments = { ...own.assignments };
  for (const [start, period] of Object.entries(data.periods)) {
    if (start === data.currentStart) continue;
    for (const [key, ids] of Object.entries(period.assignments)) {
      const slot = occurrence(start, key);
      for (const week of [0, 1]) {
        const target = `${week}:${slot.day}:${slot.shift}`;
        if (!Object.hasOwn(assignments, target) && occurrence(data.currentStart, target).date === slot.date) assignments[target] = ids;
      }
    }
  }
  return { ...own, assignments };
}

export function synchronizePeriod(data: PlannerData, before: Period, after: Period): PlannerData {
  const periods = { ...data.periods, [data.currentStart]: after };
  const keys = new Set([...Object.keys(before.assignments), ...Object.keys(after.assignments)]);
  for (const key of keys) {
    if (JSON.stringify(before.assignments[key]) === JSON.stringify(after.assignments[key])) continue;
    const slot = occurrence(data.currentStart, key);
    for (const [start, period] of Object.entries(periods)) {
      for (const week of [0, 1]) {
        const target = `${week}:${slot.day}:${slot.shift}`;
        if (occurrence(start, target).date !== slot.date) continue;
        const assignments = { ...period.assignments };
        if (Object.hasOwn(after.assignments, key)) assignments[target] = [...after.assignments[key]];
        else delete assignments[target];
        periods[start] = { ...periods[start], assignments };
      }
    }
  }
  return { ...data, periods };
}
