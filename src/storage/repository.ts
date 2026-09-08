import { makeInitialData } from "../domain/planner.ts";
import type { PlannerData } from "../domain/planner.ts";
import { decodePlanner, encodePlanner } from "./codec.ts";

export interface PlannerRepository {
  load(): PlannerData;
  save(data: PlannerData): void;
}

export function createStorageRepository(storage: Pick<Storage, "getItem" | "setItem">): PlannerRepository {
  const key = "shift-planner-data-v1";
  return {
    load() { const raw = storage.getItem(key); return raw === null ? makeInitialData() : decodePlanner(raw); },
    save(data) { storage.setItem(key, encodePlanner(data)); },
  };
}

// Access localStorage lazily so access failures can be reported without crashing the app.
export const browserRepository: PlannerRepository = {
  load: () => createStorageRepository(window.localStorage).load(),
  save: (data) => createStorageRepository(window.localStorage).save(data),
};
