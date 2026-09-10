import { useCallback, useEffect, useReducer, useRef, useState } from "react";
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
  const [saveError, setSaveError] = useState("");
  const saved = useRef(loaded.data);

  useEffect(() => repository.subscribe?.((data) => {
    saved.current = data;
    dispatch({ type: "external", data }); setSaveState("saved"); setSaveError("");
  }), [repository]);

  useEffect(() => {
    if (loadError) { setSaveState("unavailable"); return; }
    if (saved.current === state.present) { setSaveState("saved"); return; }
    let active = true;
    setSaveState("saving");
    try {
      const result = repository.save(state.present);
      Promise.resolve(result).then(() => {
        saved.current = state.present;
        if (active) { setSaveState("saved"); setSaveError(""); }
      }, (error) => { if (active) { setSaveState("unavailable"); setSaveError(error instanceof Error ? error.message : "השמירה נכשלה"); } });
    } catch (error) { setSaveState("unavailable"); setSaveError(error instanceof Error ? error.message : "השמירה נכשלה"); }
    return () => { active = false; };
  }, [state.present, repository, loadError]);

  const setData = useCallback((update: (data: PlannerData) => PlannerData, label = "עדכון הסידור", group?: string) => {
    dispatch({ type: "change", update, label, group });
  }, []);
  const restore = (data: PlannerData) => {
    setLoadError("");
    setData(() => data, "שחזור מגיבוי");
  };
  return {
    data: state.present, setData, restore, saveState, saveError, loadError,
    navigate: (start: string) => dispatch({ type: "navigate", start }),
    undo: () => dispatch({ type: "undo" }),
    canUndo: state.past.length > 0, undoLabel: state.past.at(-1)?.label,
  };
}
