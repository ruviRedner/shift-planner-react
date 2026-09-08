import { useCallback, useEffect, useReducer, useState } from "react";
import { makeInitialData } from "../domain/planner";
import type { PlannerData } from "../domain/planner";
import { reduceHistory } from "../domain/history";
import type { PlannerRepository } from "../storage/repository";

export function usePlannerStore(repository: PlannerRepository) {
  const [loaded] = useState(() => {
    try { return { data: repository.load(), error: "" }; }
    catch { return { data: makeInitialData(), error: "לא ניתן לקרוא את הנתונים השמורים. השמירה נעצרה כדי לא לדרוס אותם. ניתן לשחזר קובץ גיבוי תקין." }; }
  });
  const [loadError, setLoadError] = useState(loaded.error);
  const [state, dispatch] = useReducer(reduceHistory, { present: loaded.data, past: [] });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unavailable">("saving");

  useEffect(() => {
    if (loadError) { setSaveState("unavailable"); return; }
    const save = () => {
      try { repository.save(state.present); setSaveState("saved"); }
      catch { setSaveState("unavailable"); }
    };
    save();
    window.addEventListener("pagehide", save);
    return () => window.removeEventListener("pagehide", save);
  }, [state.present, repository, loadError]);

  const setData = useCallback((update: (data: PlannerData) => PlannerData, label = "עדכון הסידור", group?: string) => {
    dispatch({ type: "change", update, label, group });
  }, []);
  const restore = (data: PlannerData) => {
    setLoadError("");
    setData(() => data, "שחזור מגיבוי");
  };
  return {
    data: state.present, setData, restore, saveState, loadError,
    navigate: (start: string) => dispatch({ type: "navigate", start }),
    undo: () => dispatch({ type: "undo" }),
    canUndo: state.past.length > 0, undoLabel: state.past.at(-1)?.label,
  };
}
