import type { PlannerData } from './planner.ts';
import { addDays, parseDate, toDateKey } from './planner.ts';
export const LAUNDRY_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי–מוצ״ש'];

export function recurringLaundry(data: PlannerData): Record<string, string[]> {
  if (data.recurringLaundry) return data.recurringLaundry;
  const result: Record<string, string[]> = {};
  for (const [date, ids] of Object.entries(data.laundry ?? {})) {
    const day = String(Math.min(parseDate(date).getDay(), 5));
    result[day] = [...new Set([...(result[day] ?? []), ...ids])];
  }
  return result;
}

export function setRecurringLaundry(data: PlannerData, day: string, ids: string[]): PlannerData {
  const known = new Set((data.residents ?? []).map((resident) => resident.id));
  return { ...data, recurringLaundry: { ...recurringLaundry(data), [day]: [...new Set(ids)].filter((id) => known.has(id)) } };
}

export function setLaundry(data: PlannerData, date: string, ids: string[]): PlannerData {
  const known = new Set((data.residents ?? []).map((resident) => resident.id));
  const laundry = { ...data.laundry };
  const selected = [...new Set(ids)].filter((id) => known.has(id));
  if (selected.length) laundry[date] = selected;
  else delete laundry[date];
  return { ...data, laundry };
}

export function deleteResident(data: PlannerData, id: string): PlannerData {
  return { ...data, residents: (data.residents ?? []).filter((resident) => resident.id !== id),
    ...(data.recurringLaundry ? { recurringLaundry: Object.fromEntries(Object.entries(data.recurringLaundry).map(([day, ids]) => [day, ids.filter((value) => value !== id)])) } : {}),
    laundry: Object.fromEntries(Object.entries(data.laundry ?? {}).map(([date, ids]): [string, string[]] => [date, ids.filter((value) => value !== id)]).filter(([, ids]) => ids.length)) };
}

export function clearLaundryPeriod(data: PlannerData): PlannerData {
  if (!data.laundry) return data;
  const laundry = { ...data.laundry };
  for (let day = 0; day < 14; day++) delete laundry[toDateKey(addDays(parseDate(data.currentStart), day))];
  return { ...data, laundry };
}

export function laundryNames(data: PlannerData, date: string): string[] {
  const names = new Map((data.residents ?? []).map((resident) => [resident.id, resident.name]));
  return (recurringLaundry(data)[String(Math.min(parseDate(date).getDay(), 5))] ?? []).map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}
