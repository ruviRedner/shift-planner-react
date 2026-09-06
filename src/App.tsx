import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getJewishDayInfo,
  getJewishWeekInfo,
} from "./jewishCalendar";

const STORAGE_KEY = "shift-planner-data-v1";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי-שבת", "מוצ״ש"] as const;

type ShiftType = "afternoon" | "night" | "friday" | "motzeiShabbat";
type SaveState = "saved" | "saving" | "unavailable";

type StaffMember = {
  id: string;
  name: string;
};

type Period = {
  weekNotes: [string, string];
  assignments: Record<string, string[]>;
  beforeWeekCopy?: Record<string, string[]>;
};

type PlannerData = {
  version: 1;
  currentStart: string;
  staff: StaffMember[];
  periods: Record<string, Period>;
};

type EditingShift = {
  weekIndex: number;
  dayIndex: number;
  shiftType: ShiftType;
};

const SHIFT_META: Record<
  ShiftType,
  { label: string; shortLabel: string; tone: string }
> = {
  afternoon: { label: "משמרת צהריים", shortLabel: "צהריים", tone: "afternoon" },
  night: { label: "משמרת לילה", shortLabel: "לילה", tone: "night" },
  friday: { label: "משמרת שישי-שבת", shortLabel: "שישי-שבת", tone: "shabbat" },
  motzeiShabbat: { label: "משמרת לילה במוצ״ש", shortLabel: "לילה", tone: "night" },
};

function getShiftsForDay(dayIndex: number): ShiftType[] {
  if (dayIndex <= 4) return ["afternoon", "night"];
  if (dayIndex === 5) return ["friday"];
  return ["motzeiShabbat"];
}

function createEmptyPeriod(): Period {
  return { weekNotes: ["", ""], assignments: {} };
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfSunday(date: Date): Date {
  return addDays(date, -date.getDay());
}

function getDefaultStart(): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysUntilSunday = today.getDay() === 0 ? 0 : 7 - today.getDay();
  return toDateKey(addDays(today, daysUntilSunday));
}

function makeInitialData(): PlannerData {
  return {
    version: 1,
    currentStart: getDefaultStart(),
    staff: [],
    periods: {},
  };
}

function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeInitialData();

    const parsed = JSON.parse(raw) as Partial<PlannerData>;
    if (
      parsed.version !== 1 ||
      typeof parsed.currentStart !== "string" ||
      !Array.isArray(parsed.staff) ||
      !parsed.periods
    ) {
      return makeInitialData();
    }

    // Merge legacy weekend slots once, so hidden assignments cannot reappear after editing.
    for (const period of Object.values(parsed.periods)) {
      for (const weekIndex of [0, 1]) {
        const mergedKey = `${weekIndex}:5:friday`;
        const legacyKeys = [
          `${weekIndex}:5:afternoon`,
          `${weekIndex}:5:night`,
          `${weekIndex}:6:shabbat`,
        ];
        const ids = [...new Set([
          ...(period.assignments[mergedKey] ?? []),
          ...legacyKeys.flatMap((key) => period.assignments[key] ?? []),
        ])];
        if (ids.length > 0) period.assignments[mergedKey] = ids;
        for (const key of legacyKeys) delete period.assignments[key];
      }
    }

    return parsed as PlannerData;
  } catch {
    return makeInitialData();
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function assignmentKey(
  weekIndex: number,
  dayIndex: number,
  shiftType: ShiftType,
): string {
  return `${weekIndex}:${dayIndex}:${shiftType}`;
}

const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
});

const fullDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatRange(start: Date, end: Date): string {
  return `${fullDateFormatter.format(start)} – ${fullDateFormatter.format(end)}`;
}

function App() {
  const [data, setData] = useState<PlannerData>(loadData);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [newStaffName, setNewStaffName] = useState("");
  const [dialogStaffName, setDialogStaffName] = useState("");
  const [editing, setEditing] = useState<EditingShift | null>(null);
  const [draftIds, setDraftIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  const periodStart = useMemo(() => parseDate(data.currentStart), [data.currentStart]);
  const periodEnd = useMemo(() => addDays(periodStart, 13), [periodStart]);
  const period = data.periods[data.currentStart] ?? createEmptyPeriod();

  const staffById = useMemo(
    () => new Map(data.staff.map((member) => [member.id, member])),
    [data.staff],
  );

  useEffect(() => {
    setSaveState("saving");
    const timeoutId = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setSaveState("saved");
      } catch {
        setSaveState("unavailable");
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [data]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (editing && !dialog.open) dialog.showModal();
    if (!editing && dialog.open) dialog.close();
  }, [editing]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  function updateCurrentPeriod(updater: (current: Period) => Period) {
    setData((current) => {
      const currentPeriod = current.periods[current.currentStart] ?? createEmptyPeriod();
      return {
        ...current,
        periods: {
          ...current.periods,
          [current.currentStart]: updater(currentPeriod),
        },
      };
    });
  }

  function addStaff(rawName: string): { id: string; isNew: boolean } | null {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) return null;

    const existing = data.staff.find(
      (member) => member.name.localeCompare(name, "he", { sensitivity: "base" }) === 0,
    );
    if (existing) return { id: existing.id, isNew: false };

    const member = { id: createId(), name };
    setData((current) => ({ ...current, staff: [...current.staff, member] }));
    return { id: member.id, isNew: true };
  }

  function handleAddStaff(event: FormEvent) {
    event.preventDefault();
    const result = addStaff(newStaffName);
    if (!result) return;

    setNewStaffName("");
    setToast(result.isNew ? "איש הצוות נוסף" : "השם כבר קיים ברשימה");
  }

  function handleDialogAddStaff(event: FormEvent) {
    event.preventDefault();
    const result = addStaff(dialogStaffName);
    if (!result) return;

    setDraftIds((current) =>
      current.includes(result.id) ? current : [...current, result.id],
    );
    setDialogStaffName("");
    setToast(result.isNew ? "השם נוסף ונבחר" : "השם הקיים נבחר");
  }

  function removeStaff(member: StaffMember) {
    const isAssigned = Object.values(data.periods).some((savedPeriod) =>
      Object.values(savedPeriod.assignments).some((ids) => ids.includes(member.id)),
    );
    const message = isAssigned
      ? `להסיר את ${member.name}? השם יימחק גם מכל המשמרות שבהן שובץ.`
      : `להסיר את ${member.name} מרשימת הצוות?`;

    if (!window.confirm(message)) return;

    setData((current) => {
      const periods = Object.fromEntries(
        Object.entries(current.periods).map(([dateKey, savedPeriod]) => {
          const assignments = Object.fromEntries(
            Object.entries(savedPeriod.assignments)
              .map(([key, ids]) => [key, ids.filter((id) => id !== member.id)] as const)
              .filter(([, ids]) => ids.length > 0),
          );
          return [dateKey, { ...savedPeriod, assignments }];
        }),
      );

      return {
        ...current,
        staff: current.staff.filter((item) => item.id !== member.id),
        periods,
      };
    });
    setToast("איש הצוות הוסר");
  }

  function openAssignment(weekIndex: number, dayIndex: number, shiftType: ShiftType) {
    setDraftIds(getAssignmentIds(weekIndex, dayIndex, shiftType));
    setDialogStaffName("");
    setEditing({ weekIndex, dayIndex, shiftType });
  }

  function toggleDraftId(id: string) {
    setDraftIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function saveAssignment() {
    if (!editing) return;
    const key = assignmentKey(editing.weekIndex, editing.dayIndex, editing.shiftType);

    updateCurrentPeriod((current) => {
      const assignments = { ...current.assignments };
      if (draftIds.length > 0) assignments[key] = draftIds;
      else delete assignments[key];
      return {
        ...current,
        assignments,
        beforeWeekCopy: editing.weekIndex === 1 ? undefined : current.beforeWeekCopy,
      };
    });

    setEditing(null);
    setToast("השיבוץ נשמר");
  }

  function movePeriod(dayOffset: number) {
    setData((current) => ({
      ...current,
      currentStart: toDateKey(addDays(parseDate(current.currentStart), dayOffset)),
    }));
  }

  function handleDateChange(value: string) {
    if (!value) return;
    const normalized = toDateKey(startOfSunday(parseDate(value)));
    setData((current) => ({ ...current, currentStart: normalized }));
    if (normalized !== value) setToast("התאריך הותאם ליום ראשון של אותו שבוע");
  }

  function updateWeekNote(weekIndex: number, value: string) {
    updateCurrentPeriod((current) => {
      const weekNotes: [string, string] = [...current.weekNotes];
      weekNotes[weekIndex] = value;
      return { ...current, weekNotes };
    });
  }

  function getAssignmentIds(
    weekIndex: number,
    dayIndex: number,
    shiftType: ShiftType,
  ): string[] {
    const currentKey = assignmentKey(weekIndex, dayIndex, shiftType);
    return period.assignments[currentKey] ?? [];
  }

  function copyFirstWeek() {
    const targetHasAssignments = Object.keys(period.assignments).some((key) =>
      key.startsWith("1:"),
    );
    if (
      targetHasAssignments &&
      !window.confirm("בשבוע השני כבר יש שיבוצים. להחליף אותם בשיבוצי השבוע הראשון?")
    ) {
      return;
    }

    updateCurrentPeriod((current) => {
      const beforeWeekCopy = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => key.startsWith("1:")),
      );
      const assignments = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => !key.startsWith("1:")),
      );

      Object.entries(current.assignments).forEach(([key, ids]) => {
        if (key.startsWith("0:")) assignments[key.replace(/^0:/, "1:")] = [...ids];
      });

      return { ...current, assignments, beforeWeekCopy };
    });
    setToast("השבוע הראשון הועתק לשבוע השני");
  }

  function undoWeekCopy() {
    updateCurrentPeriod((current) => {
      if (!current.beforeWeekCopy) return current;
      const assignments = Object.fromEntries(
        Object.entries(current.assignments).filter(([key]) => !key.startsWith("1:")),
      );
      for (const [key, ids] of Object.entries(current.beforeWeekCopy)) {
        const existingIds = ids.filter((id) => staffById.has(id));
        if (existingIds.length > 0) assignments[key] = existingIds;
      }
      return { ...current, assignments, beforeWeekCopy: undefined };
    });
    setToast("ההעתקה בוטלה ושיבוצי השבוע השני שוחזרו");
  }

  function clearCurrentPeriod() {
    if (!window.confirm("לנקות את כל השיבוצים וההערות בתקופה הנוכחית?")) return;
    setData((current) => ({
      ...current,
      periods: { ...current.periods, [current.currentStart]: createEmptyPeriod() },
    }));
    setToast("התקופה נוקתה");
  }

  const editingDate = editing
    ? addDays(periodStart, editing.weekIndex * 7 + editing.dayIndex)
    : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <div className="title-line">
              <h1>סידור משמרות</h1>
              <span className={`save-state save-state--${saveState}`}>
                {saveState === "saved" && "נשמר אוטומטית"}
                {saveState === "saving" && "שומר…"}
                {saveState === "unavailable" && "השמירה אינה זמינה"}
              </span>
            </div>
            <p>{formatRange(periodStart, periodEnd)}</p>
          </div>
        </div>

        <div className="top-actions no-print">
          <button className="button button-ghost" type="button" onClick={clearCurrentPeriod}>
            נקה תקופה
          </button>
          <button className="button button-light" type="button" onClick={() => window.print()}>
            <span className="print-symbol" aria-hidden="true">⎙</span>
            הדפסה
          </button>
        </div>
      </header>

      <main>
        <section className="control-panel no-print" aria-label="הגדרות הסידור">
          <div className="period-controls">
            <button className="nav-button" type="button" onClick={() => movePeriod(14)}>
              <span aria-hidden="true">‹</span>
              התקופה הבאה
            </button>
            <label className="date-field">
              <span>יום ראשון הראשון</span>
              <input
                type="date"
                value={data.currentStart}
                onChange={(event) => handleDateChange(event.target.value)}
              />
            </label>
            <button className="nav-button" type="button" onClick={() => movePeriod(-14)}>
              התקופה הקודמת
              <span aria-hidden="true">›</span>
            </button>
          </div>

          <div className="staff-panel">
            <div className="section-heading">
              <div>
                <h2>אנשי צוות</h2>
                <p>מוסיפים פעם אחת ובוחרים בכל משמרת</p>
              </div>
              <span className="staff-count" aria-label={`${data.staff.length} אנשי צוות`}>
                {data.staff.length}
              </span>
            </div>

            <form className="add-staff-form" onSubmit={handleAddStaff}>
              <input
                type="text"
                value={newStaffName}
                maxLength={50}
                autoComplete="off"
                onChange={(event) => setNewStaffName(event.target.value)}
                placeholder="שם איש הצוות"
                aria-label="שם איש הצוות"
              />
              <button className="button button-primary" type="submit">הוסף</button>
            </form>

            <div className="staff-list" aria-live="polite">
              {data.staff.length === 0 ? (
                <p className="empty-staff">עדיין לא הוספת אנשי צוות</p>
              ) : (
                data.staff.map((member) => (
                  <span className="staff-chip" key={member.id}>
                    {member.name}
                    <button
                      type="button"
                      onClick={() => removeStaff(member)}
                      aria-label={`הסר את ${member.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="helper-strip no-print">
          <p><strong>איך משבצים?</strong> לוחצים על משמרת ובוחרים שם אחד או יותר.</p>
          <button className="text-button" type="button" onClick={copyFirstWeek}>
            העתק שבוע ראשון לשבוע שני
          </button>
          {period.beforeWeekCopy && (
            <button className="text-button" type="button" onClick={undoWeekCopy}>
              בטל העתקה לשבוע השני
            </button>
          )}
        </section>

        <div className="weeks">
          {[0, 1].map((weekIndex) => {
            const weekStart = addDays(periodStart, weekIndex * 7);
            const weekEnd = addDays(weekStart, 6);
            const weekInfo = getJewishWeekInfo(weekEnd);

            return (
              <article className="week-card" key={weekIndex}>
                <p className="guide-notice">
                  מדריכים יקרים, כל מי שרוצה להחליף משמרת שיעדכן אותי ויסמן בדף.
                </p>
                <header className="week-header">
                  <div>
                    <span className="week-number">שבוע {weekIndex === 0 ? "ראשון" : "שני"}</span>
                    <h2>{formatRange(weekStart, weekEnd)}</h2>
                    <p className="week-jewish-title">
                      {weekInfo.parasha
                        ? ` ${weekInfo.parasha}`
                        : weekInfo.shabbatHoliday || "שבת חג"}
                    </p>
                  </div>
                  <div className="week-fields no-print">
                    <label className="week-note-field">
                      <span>הערה לשבוע</span>
                      <input
                        type="text"
                        maxLength={80}
                        value={period.weekNotes[weekIndex]}
                        onChange={(event) => updateWeekNote(weekIndex, event.target.value)}
                        placeholder="אירוע או הערה נוספת"
                      />
                    </label>
                  </div>
                  {period.weekNotes[weekIndex] && (
                    <p className="print-week-note">{period.weekNotes[weekIndex]}</p>
                  )}
                </header>

                <div className="week-scroll">
                  <div className="week-grid">
                    {DAYS.map((dayName, dayIndex) => {
                      const date = addDays(weekStart, dayIndex);
                      const jewishDay = getJewishDayInfo(date);
                      const isWeekend = dayIndex >= 5;

                      return (
                        <section
                          className={`day-card${isWeekend ? " day-card--weekend" : ""}`}
                          key={dayName}
                        >
                          <header className="day-header">
                            <div>
                              {!isWeekend && <span className="day-prefix">יום</span>}
                              <h3>{dayName}</h3>
                            </div>
                            <time dateTime={toDateKey(date)}>
                              <span>{shortDateFormatter.format(date)}</span>
                              <span className="hebrew-date">{jewishDay.hebrewDate}</span>
                            </time>
                          </header>

                          {jewishDay.holidays.length > 0 && (
                            <p className="holiday-label">{jewishDay.holidays.join(" · ")}</p>
                          )}

                          <div className="day-shifts">
                            {getShiftsForDay(dayIndex).map((shiftType) => {
                              const meta = SHIFT_META[shiftType];
                              const key = assignmentKey(weekIndex, dayIndex, shiftType);
                              const members = getAssignmentIds(weekIndex, dayIndex, shiftType)
                                .map((id) => staffById.get(id))
                                .filter((member): member is StaffMember => Boolean(member));

                              return (
                                <button
                                  className={`shift-card shift-card--${meta.tone}${
                                    members.length ? " shift-card--filled" : ""
                                  }`}
                                  type="button"
                                  key={shiftType}
                                  onClick={() => openAssignment(weekIndex, dayIndex, shiftType)}
                                  aria-label={`${meta.label}, ${isWeekend ? "" : "יום "}${dayName}, ${shortDateFormatter.format(date)}`}
                                >
                                  <span className="shift-heading">
                                    <span>
                                      <i aria-hidden="true" />
                                      {meta.shortLabel}
                                    </span>
                                    {members.length > 0 && <b>{members.length}</b>}
                                  </span>

                                  {members.length === 0 ? (
                                    <span className="empty-shift">לחצו לשיבוץ</span>
                                  ) : (
                                    <span className="assigned-list">
                                      {members.map((member) => (
                                        <span key={member.id}>{member.name}</span>
                                      ))}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>

      <dialog
        className="assignment-dialog"
        ref={dialogRef}
        aria-labelledby="assignment-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setEditing(null);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) setEditing(null);
        }}
      >
        <div className="dialog-header">
          <div>
            <p className="dialog-kicker">
              {editing && editingDate
                ? `${editing.dayIndex < 5 ? "יום " : ""}${DAYS[editing.dayIndex]} · ${fullDateFormatter.format(editingDate)}`
                : ""}
            </p>
            <h2 id="assignment-dialog-title">
              {editing ? SHIFT_META[editing.shiftType].label : "שיבוץ משמרת"}
            </h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={() => setEditing(null)}
            aria-label="סגירת החלון"
          >
            ×
          </button>
        </div>

        <div className="assignment-options">
          {data.staff.length === 0 ? (
            <div className="dialog-empty">
              <strong>רשימת הצוות עדיין ריקה</strong>
              <span>אפשר להוסיף שם חדש ממש כאן.</span>
            </div>
          ) : (
            data.staff.map((member) => {
              const checked = draftIds.includes(member.id);
              return (
                <label className={`member-option${checked ? " member-option--checked" : ""}`} key={member.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDraftId(member.id)}
                  />
                  <span className="custom-checkbox" aria-hidden="true">✓</span>
                  <span>{member.name}</span>
                </label>
              );
            })
          )}
        </div>

        <form className="dialog-add-form" onSubmit={handleDialogAddStaff}>
          <input
            type="text"
            value={dialogStaffName}
            maxLength={50}
            autoComplete="off"
            onChange={(event) => setDialogStaffName(event.target.value)}
            placeholder="שם חדש שלא נמצא ברשימה"
            aria-label="הוספת איש צוות חדש"
          />
          <button className="button button-secondary" type="submit">הוסף ובחר</button>
        </form>

        <div className="dialog-actions">
          <button className="button button-ghost-dark" type="button" onClick={() => setEditing(null)}>
            ביטול
          </button>
          <button className="button button-primary" type="button" onClick={saveAssignment}>
            שמור שיבוץ
          </button>
        </div>
      </dialog>

      <div className={`toast${toast ? " toast--visible" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

export default App;
