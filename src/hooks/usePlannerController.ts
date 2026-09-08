import { useMemo, useState } from "react";
import { App as AntApp } from "antd";
import { copyWeek, resolveAssignment, restoreWeek } from "../assignments";
import { clearPeriod, deleteStaff, saveRecurring, updatePeriod } from "../domain/commands";
import { usePlannerStore } from "./usePlannerStore";
import { conflictsForPeriod } from "../domain/insights";
import { DAYS, getShiftsForDay, createEmptyPeriod, parseDate, toDateKey, addDays, startOfSunday, createId, assignmentKey } from "../domain/planner";
import type { Period, StaffMember, ShiftType, EditingShift } from "../domain/planner";
import type { PlannerRepository } from "../storage/repository";

export function usePlannerController(repository: PlannerRepository) {
  const { data, setData, navigate, restore, saveState, undo, canUndo, undoLabel, loadError } = usePlannerStore(repository);
  const [newStaffName, setNewStaffName] = useState("");
  const [dialogStaffName, setDialogStaffName] = useState("");
  const [editing, setEditing] = useState<EditingShift | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const { message, modal } = AntApp.useApp();
  function setToast(text: string) { void message.success(text); }
  const [staffSearch, setStaffSearch] = useState("");

  const periodStart = useMemo(() => parseDate(data.currentStart), [data.currentStart]);
  const periodEnd = useMemo(() => addDays(periodStart, 13), [periodStart]);
  const period = data.periods[data.currentStart] ?? createEmptyPeriod();

  const staffById = useMemo(
    () => new Map(data.staff.map((member) => [member.id, member])),
    [data.staff],
  );
  const shiftCounts = [0, 1].map((weekIndex) =>
    DAYS.reduce((count, _, dayIndex) => count + getShiftsForDay(dayIndex).filter(
      (shift) => getAssignmentIds(weekIndex, dayIndex, shift).some((id) => staffById.has(id)),
    ).length, 0),
  );
  const visibleStaff = data.staff.filter((member) => member.name.includes(staffSearch.trim()));
  const conflicts = useMemo(() => conflictsForPeriod(data), [data]);

  function updateCurrentPeriod(updater: (current: Period) => Period, label = "שינוי שיבוץ", group?: string) {
    setData((current) => updatePeriod(current, updater), label, group);
  }

  function addStaff(rawName: string): { id: string; isNew: boolean } | null {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) return null;

    const existing = data.staff.find(
      (member) => member.name.localeCompare(name, "he", { sensitivity: "base" }) === 0,
    );
    if (existing) return { id: existing.id, isNew: false };

    const member = { id: createId(), name };
    setData((current) => ({ ...current, staff: [...current.staff, member] }), "הוספת איש צוות");
    return { id: member.id, isNew: true };
  }

  function handleAddStaff() {
    const result = addStaff(newStaffName);
    if (!result) return;

    setNewStaffName("");
    setToast(result.isNew ? "איש הצוות נוסף" : "השם כבר קיים ברשימה");
  }

  function handleDialogAddStaff() {
    const result = addStaff(dialogStaffName);
    if (!result) return;

    setDraftIds((current) =>
      current.includes(result.id) ? current : [...current, result.id],
    );
    setDialogStaffName("");
    setToast(result.isNew ? "השם נוסף ונבחר" : "השם הקיים נבחר");
  }

  async function removeStaff(member: StaffMember) {
    const isAssigned = Object.values(data.recurring).some((ids) => ids.includes(member.id)) || Object.values(data.periods).some((savedPeriod) =>
      Object.values(savedPeriod.assignments).some((ids) => ids.includes(member.id)),
    );
    const message = isAssigned
      ? `להסיר את ${member.name}? השם יימחק גם מכל המשמרות שבהן שובץ.`
      : `להסיר את ${member.name} מרשימת הצוות?`;

    if (!await modal.confirm({ title: "הסרת איש צוות", content: message, okText: "הסר", cancelText: "ביטול", okButtonProps: { danger: true } })) return;

    setData((current) => deleteStaff(current, member.id), "הסרת איש צוות");
    setToast("איש הצוות הוסר");
  }

  function openAssignment(weekIndex: number, dayIndex: number, shiftType: ShiftType, recurring = false) {
    setStaffSearch("");
    setDraftIds(recurring ? data.recurring[`${dayIndex}:${shiftType}`] ?? [] : getAssignmentIds(weekIndex, dayIndex, shiftType));
    setDialogStaffName("");
    setEditing({ weekIndex, dayIndex, shiftType, recurring });
  }

  function toggleDraftId(id: string) {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function saveAssignment() {
    if (!editing) return;
    if (editing.recurring) {
      setData((current) => saveRecurring(current, editing.dayIndex, editing.shiftType, draftIds), "שמירת קביעות");
      setEditing(null);
      setToast("הקביעות נשמרה והאנשים שנבחרו נוספו למשמרת בכל השבועות");
      return;
    }
    const key = assignmentKey(editing.weekIndex, editing.dayIndex, editing.shiftType);

    updateCurrentPeriod((current) => {
      const assignments = { ...current.assignments };
      assignments[key] = [...draftIds];
      return {
        ...current,
        assignments,
        beforeWeekCopy: editing.weekIndex === 1 ? undefined : current.beforeWeekCopy,
      };
    });

    setEditing(null);
    setToast("השיבוץ נשמר");
  }

  function restoreRecurring() {
    if (!editing || editing.recurring) return;
    const key = assignmentKey(editing.weekIndex, editing.dayIndex, editing.shiftType);
    updateCurrentPeriod((current) => {
      const assignments = { ...current.assignments };
      delete assignments[key];
      return { ...current, assignments, beforeWeekCopy: editing.weekIndex === 1 ? undefined : current.beforeWeekCopy };
    });
    setEditing(null);
    setToast("המשמרת חזרה לשיבוץ הקבוע");
  }

  function movePeriod(dayOffset: number) {
    navigate(toDateKey(addDays(periodStart, dayOffset)));
  }

  function handleDateChange(value: string) {
    if (!value) return;
    const normalized = toDateKey(startOfSunday(parseDate(value)));
    navigate(normalized);
    if (normalized !== value) setToast("התאריך הותאם ליום ראשון של אותו שבוע");
  }

  function updateWeekNote(weekIndex: number, value: string) {
    updateCurrentPeriod((current) => {
      const weekNotes: [string, string] = [...current.weekNotes];
      weekNotes[weekIndex] = value;
      return { ...current, weekNotes };
    }, "עריכת הערה", `note:${data.currentStart}:${weekIndex}`);
  }

  function getAssignmentIds(
    weekIndex: number,
    dayIndex: number,
    shiftType: ShiftType,
  ): string[] {
    return resolveAssignment(period.assignments, data.recurring, weekIndex, dayIndex, shiftType);
  }

  async function copyFirstWeek() {
    const targetHasAssignments = shiftCounts[1] > 0;
    if (
      targetHasAssignments &&
      !await modal.confirm({ title: "העתקת שיבוצים", content: "בשבוע השני כבר יש שיבוצים. להחליף אותם בשיבוצי השבוע הראשון?", okText: "העתק", cancelText: "ביטול" })
    ) {
      return;
    }

    updateCurrentPeriod((current) => {
      return { ...current, ...copyWeek(current.assignments) };
    }, "העתקת שבוע");
    setToast("השבוע הראשון הועתק לשבוע השני");
  }

  function undoWeekCopy() {
    updateCurrentPeriod((current) => {
      if (!current.beforeWeekCopy) return current;
      const assignments = restoreWeek(current.assignments, current.beforeWeekCopy, new Set(staffById.keys()));
      return { ...current, assignments, beforeWeekCopy: undefined };
    }, "ביטול העתקת שבוע");
    setToast("ההעתקה בוטלה ושיבוצי השבוע השני שוחזרו");
  }

  async function clearCurrentPeriod() {
    if (!await modal.confirm({ title: "ניקוי התקופה", content: "לנקות את כל השיבוצים וההערות בתקופה הנוכחית? גם המשמרות הקבועות יישארו ריקות בתקופה זו בלבד. הגדרות הקביעות יישמרו לשאר השבועות.", okText: "נקה תקופה", cancelText: "ביטול", okButtonProps: { danger: true } })) return;
    setData(clearPeriod, "ניקוי תקופה");
    setToast("התקופה נוקתה");
  }

  const editingDate = editing
    ? addDays(periodStart, editing.weekIndex * 7 + editing.dayIndex)
    : null;


  return {
    data, setData, restore, saveState, undo, canUndo, undoLabel, loadError,
    newStaffName, setNewStaffName, dialogStaffName, setDialogStaffName,
    editing, setEditing, draftIds, staffSearch, setStaffSearch,
    periodStart, periodEnd, period, staffById, visibleStaff, conflicts, editingDate,
    setToast, handleAddStaff, handleDialogAddStaff, removeStaff, openAssignment,
    toggleDraftId, saveAssignment, restoreRecurring, movePeriod, handleDateChange,
    updateWeekNote, copyFirstWeek, undoWeekCopy, clearCurrentPeriod,
  };
}
