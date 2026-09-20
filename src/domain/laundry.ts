import type { PlannerData } from './planner.ts';
import { addDays, parseDate, toDateKey } from './planner.ts';

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
  return (data.laundry?.[date] ?? []).map((id) => names.get(id)).filter((name): name is string => Boolean(name));
}
