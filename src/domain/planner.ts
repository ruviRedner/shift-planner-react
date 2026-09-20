export const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי-שבת", "מוצ״ש"] as const;

export type ShiftType = "afternoon" | "night" | "friday" | "motzeiShabbat";

export type StaffMember = {
  id: string;
  name: string;
};

export type Period = {
  weekNotes: [string, string];
  assignments: Record<string, string[]>;
  beforeWeekCopy?: Record<string, string[]>;
};

export type PlannerData = {
  version: 1;
  currentStart: string;
  staff: StaffMember[];
  residents?: StaffMember[];
  laundry?: Record<string, string[]>;
  recurringLaundry?: Record<string, string[]>;
  periods: Record<string, Period>;
  recurring: Record<string, string[]>;
  unavailability: Unavailability[];
  publications?: Record<string, Publication>;
};

export type EditingShift = {
  recurring?: boolean;
  weekIndex: number;
  dayIndex: number;
  shiftType: ShiftType;
};

export const SHIFT_META: Record<
  ShiftType,
  { label: string; shortLabel: string; color: string; category: "afternoon" | "night" | "shabbat"; durationDays: number; days: readonly number[] }
> = {
  afternoon: { label: "משמרת צהריים", shortLabel: "צהריים", color: "blue", category: "afternoon", durationDays: 1, days: [0, 1, 2, 3, 4] },
  night: { label: "משמרת לילה", shortLabel: "לילה", color: "geekblue", category: "night", durationDays: 1, days: [0, 1, 2, 3, 4] },
  friday: { label: "משמרת שישי-שבת", shortLabel: "שישי-שבת", color: "purple", category: "shabbat", durationDays: 2, days: [5] },
  motzeiShabbat: { label: "משמרת לילה במוצ״ש", shortLabel: "לילה", color: "geekblue", category: "night", durationDays: 1, days: [6] },
};

export function getShiftsForDay(dayIndex: number): ShiftType[] {
  return (Object.keys(SHIFT_META) as ShiftType[]).filter((shift) => SHIFT_META[shift].days.includes(dayIndex));
}

export function createEmptyPeriod(): Period {
  return { weekNotes: ["", ""], assignments: {} };
}

export function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfSunday(date: Date): Date {
  return addDays(date, -date.getDay());
}

export function getDefaultStart(): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const daysUntilSunday = today.getDay() === 0 ? 0 : 7 - today.getDay();
  return toDateKey(addDays(today, daysUntilSunday));
}

export function makeInitialData(): PlannerData {
  return {
    version: 1,
    currentStart: getDefaultStart(),
    staff: [],
    periods: {},
    recurring: {},
    unavailability: [],
  };
}

export function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function assignmentKey(
  weekIndex: number,
  dayIndex: number,
  shiftType: ShiftType,
): string {
  return `${weekIndex}:${dayIndex}:${shiftType}`;
}

export const shortDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "numeric",
});

export const fullDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatRange(start: Date, end: Date): string {
  return `${fullDateFormatter.format(start)} – ${fullDateFormatter.format(end)}`;
}


export type Unavailability = { id: string; staffId: string; start: string; end: string; note: string };
export type Publication = { publishedAt: string; assignments: Record<string, string[]>; weekNotes: [string, string]; laundry?: Record<string, string[]> };
