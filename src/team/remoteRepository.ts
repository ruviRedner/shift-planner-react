import type { PlannerData } from "../domain/planner";
import type { PlannerRepository } from "../storage/repository";
import { api } from "./api";

export async function connectTeamRepository(): Promise<PlannerRepository> {
  let snapshot = await api<{ data: PlannerData; revision: number }>("/planner");
  let queue = Promise.resolve(), pending = 0, blocked: Error | null = null;
  const listeners = new Set<(data: PlannerData) => void>();
  async function reload() {
    if (pending) throw new Error("יש להמתין לסיום השמירה לפני טעינה מחדש");
    const next = await api<typeof snapshot>("/planner");
    snapshot = next; blocked = null;
    for (const listener of listeners) listener(next.data);
  }
  return {
    load: () => snapshot.data,
    save(data) {
      pending += 1;
      const work = queue.then(async () => {
        if (blocked) throw blocked;
        try {
          const result = await api<{ revision: number }>("/planner", { data, revision: snapshot.revision }, "PUT");
          snapshot = { data, revision: result.revision };
        } catch (error) { blocked = error instanceof Error ? error : new Error("השמירה נכשלה"); throw blocked; }
      }).finally(() => { pending -= 1; });
      queue = work.catch(() => {});
      return work;
    },
    reload,
    subscribe(listener) {
      listeners.add(listener);
      let stopped = false;
      const timer = window.setInterval(async () => {
        if (pending || blocked) return;
        try {
          const next = await api<typeof snapshot>("/planner");
          if (!stopped && !pending && !blocked && next.revision > snapshot.revision) {
            snapshot = { ...next, data: { ...next.data, currentStart: snapshot.data.currentStart } };
            for (const notify of listeners) notify(snapshot.data);
          }
        } catch { /* A temporary polling failure must not discard the local view. */ }
      }, 4000);
      return () => { stopped = true; window.clearInterval(timer); listeners.delete(listener); };
    },
  };
}
