import { assignmentKey, SHIFT_META } from "./planner.ts";
import type { PlannerData, ShiftType } from "./planner.ts";
import { periodSlots, unavailableForShift } from "./insights.ts";
import { synchronizePeriod, visiblePeriod } from "./periods.ts";

export type AutoOptions = {
  required: Record<ShiftType, number>;
  maxPerWeek: number;
  onePerDay: boolean;
  respectCleared: boolean;
};
export const defaultAutoOptions: AutoOptions = {
  required: { afternoon: 1, night: 1, friday: 1, motzeiShabbat: 1 },
  maxPerWeek: 7, onePerDay: true, respectCleared: true,
};
export type Proposal = { assignments: Record<string, string[]>; unfilled: string[] };

export function proposeSchedule(data: PlannerData, options: AutoOptions): Proposal {
  const slots = periodSlots(data).map((slot) => ({ ...slot, ids: [...slot.ids] }));
  const assignments: Record<string, string[]> = {};
  const unfilled: string[] = [];
  const existing = visiblePeriod(data).assignments;
  const eligible = (id: string, target: typeof slots[number]) => {
    if (target.ids.includes(id) || unavailableForShift(data.unavailability, id, target.date, target.shift)) return false;
    const owned = slots.filter((slot) => slot.ids.includes(id));
    if (owned.filter((slot) => slot.week === target.week).length >= options.maxPerWeek) return false;
    if (options.onePerDay && owned.some((slot) => slot.week === target.week &&
      slot.day <= target.day + SHIFT_META[target.shift].durationDays - 1 &&
      target.day <= slot.day + SHIFT_META[slot.shift].durationDays - 1)) return false;
    return true;
  };
  // Most constrained slots first; ties are deterministic, so the preview is reproducible.
  const ordered = [...slots].sort((a, b) => data.staff.filter((member) => eligible(member.id, a)).length - data.staff.filter((member) => eligible(member.id, b)).length);
  for (const slot of ordered) {
    const key = assignmentKey(slot.week, slot.day, slot.shift);
    if (options.respectCleared && Object.hasOwn(existing, key) && existing[key].length === 0) continue;
    while (slot.ids.length < options.required[slot.shift]) {
      const candidates = data.staff.filter((member) => eligible(member.id, slot));
      const score = (id: string) => slots.reduce((total, other) => total + (other.ids.includes(id) ? 10 + (SHIFT_META[other.shift].category === SHIFT_META[slot.shift].category ? 3 : 0) : 0), 0);
      candidates.sort((a, b) => score(a.id) - score(b.id) || a.id.localeCompare(b.id));
      if (!candidates[0]) { unfilled.push(key); break; }
      slot.ids.push(candidates[0].id);
      assignments[key] = [...slot.ids];
    }
  }
  return { assignments, unfilled };
}

export function applyProposal(data: PlannerData, proposal: Proposal): PlannerData {
  const period = visiblePeriod(data);
  return synchronizePeriod(data, period, {
    ...period, assignments: { ...period.assignments, ...proposal.assignments }, beforeWeekCopy: undefined,
  });
}
