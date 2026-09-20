import { addDays, assignmentKey, DAYS, formatRange, getShiftsForDay, parseDate, SHIFT_META, shortDateFormatter, toDateKey } from "../domain/planner";
import type { PlannerData } from "../domain/planner";
import { publicationReview } from "../domain/publication";

export async function renderScheduleImage(data: PlannerData, draft: boolean): Promise<Blob> {
  await document.fonts.ready;
  const review = publicationReview(data);
  const canvas = document.createElement("canvas");
  const width = 2100, margin = 60, column = (width - margin * 2) / 7;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("הדפדפן אינו תומך ביצירת תמונה.");
  const wrap = (value: string, max: number) => {
    const lines: string[] = []; let line = "";
    for (const char of value) {
      if (line && ctx.measureText(line + char).width > max) { lines.push(line); line = char; }
      else line += char;
    }
    if (line) lines.push(line);
    return lines;
  };
  ctx.font = "30px Arial";
  const cellHeight = (week: number, row: number) => Math.max(125, ...DAYS.map((_, day) => {
    const shift = getShiftsForDay(day)[row];
    if (!shift) return 0;
    return 75 + (review.snapshot.assignments[assignmentKey(week, day, shift)] ?? []).reduce((count, name) => count + wrap(name, column - 30).length, 0) * 40;
  }));
  const heights = [0, 1].map((week) => [cellHeight(week, 0), cellHeight(week, 1)]);
  const laundryHeights = [0, 1].map((week) => Math.max(110, ...Array.from({ length: 7 }, (_, day) => {
    const date = toDateKey(addDays(parseDate(data.currentStart), week * 7 + day));
    return 60 + (review.snapshot.laundry?.[date] ?? []).reduce((count, name) => count + wrap(name, column - 30).length, 0) * 40;
  })));
  canvas.width = width; canvas.height = 270 + heights.flat().reduce((a, b) => a + b, 0) + laundryHeights.reduce((a, b) => a + b, 0) + 360;
  ctx.fillStyle = "#f1f5fb"; ctx.fillRect(0, 0, width, canvas.height);
  ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "top";
  const text = (value: string, x: number, y: number, size = 30, color = "#172b4d", bold = false) => {
    ctx.font = `${bold ? "bold " : ""}${size}px Arial`; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  const gradient = ctx.createLinearGradient(0, 0, width, 220); gradient.addColorStop(0, "#174a8b"); gradient.addColorStop(1, "#10294a");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, 220);
  text(draft ? "סידור משמרות · טיוטה לבדיקה" : "סידור משמרות", width - margin, 45, 64, "white", true);
  const start = parseDate(data.currentStart);
  text(formatRange(start, addDays(start, 13)), width - margin, 135, 34, "#d8e9ff");
  let y = 250;
  for (const week of [0, 1]) {
    text(`שבוע ${week === 0 ? "ראשון" : "שני"}`, width - margin, y, 36, "#174a8b", true); y += 50;
    const note = review.snapshot.weekNotes[week];
    if (note) text(note, width - margin - 260, y - 48, 26);
    for (let day = 0; day < 7; day++) {
      const x = width - margin - day * column;
      text(`${DAYS[day]} · ${shortDateFormatter.format(addDays(start, week * 7 + day))}`, x - 15, y, 26, "#43546b", true);
    }
    y += 42;
    for (const row of [0, 1]) {
      for (let day = 0; day < 7; day++) {
        const shift = getShiftsForDay(day)[row]; if (!shift) continue;
        const key = assignmentKey(week, day, shift), x = width - margin - (day + 1) * column;
        const changed = review.changed.includes(key);
        ctx.fillStyle = changed ? "#fff2ca" : "white"; ctx.fillRect(x + 4, y, column - 8, heights[week][row] - 8);
        ctx.fillStyle = changed ? "#e8a817" : "#397bd1"; ctx.fillRect(x + column - 10, y, 6, heights[week][row] - 8);
        text(`${SHIFT_META[shift].shortLabel}${changed ? " · עודכן" : ""}`, x + column - 20, y + 14, 24, "#174a8b", true);
        let nameY = y + 55;
        for (const name of review.snapshot.assignments[key].length ? review.snapshot.assignments[key] : ["טרם שובץ"]) {
          ctx.font = "30px Arial";
          for (const line of wrap(name, column - 30)) { text(line, x + column - 20, nameY); nameY += 40; }
        }
      }
      y += heights[week][row];
    }
    for (let day = 0; day < 7; day++) {
      const date = toDateKey(addDays(start, week * 7 + day)), x = width - margin - (day + 1) * column;
      const changed = review.laundryChanged.includes(date);
      ctx.fillStyle = changed ? '#fff2ca' : '#e8f5f0';
      ctx.fillRect(x + 4, y, column - 8, laundryHeights[week] - 8);
      text(`כביסות${day === 5 ? ' · שישי' : day === 6 ? ' · שבת' : ''}`, x + column - 20, y + 14, 24, '#17624a', true);
      let nameY = y + 55;
      const names = review.snapshot.laundry?.[date] ?? [];
      for (const name of names.length ? names : ['—']) {
        ctx.font = '30px Arial';
        for (const line of wrap(name, column - 30)) { text(line, x + column - 20, nameY); nameY += 40; }
      }
    }
    y += laundryHeights[week] + 35;
  }
  text(`נוצר ב־${new Date().toLocaleString("he-IL")} · סימון צהוב: שינוי מהגרסה הקודמת`, width - margin, y, 24, "#52647a");
  if (draft) text(`${review.empty.length} משמרות ריקות · ${review.conflicts.length} התנגשויות זמינות`, width - margin, y + 36, 24, "#9c4c00");
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("יצירת התמונה נכשלה")), "image/png"));
}
