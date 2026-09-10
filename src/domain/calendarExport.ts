import { addDays, parseDate, SHIFT_META, toDateKey } from "./planner.ts";
import type { ShiftType } from "./planner.ts";

const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r/g, "");
function fold(line: string): string {
  const encoder = new TextEncoder(); let result = "", current = "";
  for (const char of line) {
    if (encoder.encode(current + char).length > 73) { result += current + "\r\n "; current = char; }
    else current += char;
  }
  return result + current;
}
export function calendarFile(staffId: string, shifts: { date: string; shift: ShiftType }[], stamp = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Shift Planner//HE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const slot of shifts) lines.push("BEGIN:VEVENT",
    `UID:${encodeURIComponent(staffId)}-${slot.date}-${slot.shift}@shift-planner`,
    `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${slot.date.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${toDateKey(addDays(parseDate(slot.date), SHIFT_META[slot.shift].durationDays)).replace(/-/g, "")}`,
    `SUMMARY:${escape(SHIFT_META[slot.shift].label)}`,
    "DESCRIPTION:אירוע יום שלם — שעות המשמרת אינן מוגדרות בסידור.", "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
