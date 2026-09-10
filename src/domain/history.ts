import type { PlannerData } from "./planner.ts";

export type HistoryEntry = { data: PlannerData; label: string; group?: string };
export type PlannerHistory = { present: PlannerData; past: HistoryEntry[] };
export type HistoryAction =
  | { type: "external"; data: PlannerData }
  | { type: "change"; update: (data: PlannerData) => PlannerData; label: string; group?: string }
  | { type: "navigate"; start: string }
  | { type: "undo" };

export function reduceHistory(state: PlannerHistory, action: HistoryAction): PlannerHistory {
  if (action.type === "external") return { present: action.data, past: [] };
  if (action.type === "navigate") return { ...state, present: { ...state.present, currentStart: action.start } };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous ? { present: previous.data, past: state.past.slice(0, -1) } : state;
  }
  const next = action.update(state.present);
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state;
  const last = state.past.at(-1);
  const grouped = action.group && last?.group === action.group;
  return { present: next, past: grouped ? state.past : [
    ...state.past.slice(-29), { data: state.present, label: action.label, group: action.group },
  ] };
}
