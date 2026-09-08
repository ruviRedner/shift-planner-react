export type Assignments = Record<string, string[]>;

export function applyRecurringToPeriods<T extends { assignments: Assignments; beforeWeekCopy?: Assignments }>(
  periods: Record<string, T>, day: number, shift: string, ids: string[],
): Record<string, T> {
  const addToExisting = (assignments: Assignments): Assignments => Object.fromEntries(
    Object.entries(assignments).map(([key, assigned]) => [key,
      key === `0:${day}:${shift}` || key === `1:${day}:${shift}`
        ? [...new Set([...assigned, ...ids])] : assigned,
    ]),
  );
  return Object.fromEntries(Object.entries(periods).map(([date, period]) => [date, {
    ...period,
    assignments: addToExisting(period.assignments),
    beforeWeekCopy: period.beforeWeekCopy ? addToExisting(period.beforeWeekCopy) : undefined,
  }]));
}

// A missing key follows the weekly rule; [] explicitly leaves this occurrence empty.
export function resolveAssignment(assignments: Assignments, recurring: Assignments, week: number, day: number, shift: string): string[] {
  return assignments[`${week}:${day}:${shift}`] ?? recurring[`${day}:${shift}`] ?? [];
}

export function removeMember(assignments: Assignments, id: string): Assignments {
  return Object.fromEntries(Object.entries(assignments).map(([key, ids]) => [key, ids.filter((value) => value !== id)]));
}

export function copyWeek(assignments: Assignments) {
  const beforeWeekCopy = Object.fromEntries(Object.entries(assignments).filter(([key]) => key.startsWith("1:")));
  const copied = Object.fromEntries(Object.entries(assignments).filter(([key]) => !key.startsWith("1:")));
  for (const [key, ids] of Object.entries(assignments)) {
    if (key.startsWith("0:")) copied[key.replace(/^0:/, "1:")] = [...ids];
  }
  return { assignments: copied, beforeWeekCopy };
}

export function restoreWeek(assignments: Assignments, backup: Assignments, staffIds: ReadonlySet<string>): Assignments {
  const restored = Object.fromEntries(Object.entries(assignments).filter(([key]) => !key.startsWith("1:")));
  for (const [key, ids] of Object.entries(backup)) restored[key] = ids.filter((id) => staffIds.has(id));
  return restored;
}
