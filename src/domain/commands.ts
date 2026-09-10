import { applyRecurringToPeriods, removeMember } from "../assignments.ts";
import { assignmentKey, createEmptyPeriod, DAYS, getShiftsForDay } from "./planner.ts";
import type { Period, PlannerData, ShiftType } from "./planner.ts";
import { synchronizePeriod, visiblePeriod } from "./periods.ts";

export function updatePeriod(data: PlannerData, update: (period: Period) => Period): PlannerData {
  const before = visiblePeriod(data);
  return synchronizePeriod(data, before, update(before));
}

export function deleteStaff(data: PlannerData, id: string): PlannerData {
  return { ...data,
    staff: data.staff.filter((member) => member.id !== id),
    recurring: removeMember(data.recurring, id),
    unavailability: data.unavailability.filter((entry) => entry.staffId !== id),
    periods: Object.fromEntries(Object.entries(data.periods).map(([date, period]) => [date, {
      ...period, assignments: removeMember(period.assignments, id),
      beforeWeekCopy: period.beforeWeekCopy ? removeMember(period.beforeWeekCopy, id) : undefined,
    }])),
  };
}

export function saveRecurring(data: PlannerData, day: number, shift: ShiftType, ids: string[]): PlannerData {
  return { ...data, recurring: { ...data.recurring, [`${day}:${shift}`]: [...ids] },
    periods: applyRecurringToPeriods(data.periods, day, shift, ids) };
}

export function clearPeriod(data: PlannerData): PlannerData {
  return updatePeriod(data, () => ({ ...createEmptyPeriod(),
    assignments: Object.fromEntries([0, 1].flatMap((week) => DAYS.flatMap((_, day) =>
      getShiftsForDay(day).map((shift) => [assignmentKey(week, day, shift), []])))),
  }));
}
