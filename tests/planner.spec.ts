import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const key = "shift-planner-data-v1";
const base = {
  version: 1, currentStart: "2026-09-06",
  staff: [{ id: "israel", name: "ישראל" }, { id: "david", name: "דוד" }],
  periods: {}, recurring: { "4:afternoon": ["israel"] }, unavailability: [],
};

async function open(page: Page, data: unknown = base) {
  await page.addInitScript(({ key, raw }) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem(key, raw); sessionStorage.setItem("seeded", "yes");
    }
  }, { key, raw: typeof data === "string" ? data : JSON.stringify(data) });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "סידור משמרות" })).toBeVisible();
}
const readData = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
const shift = (page: Page) => page.getByRole("button", { name: "משמרת צהריים, חמישי, 10.9", exact: true });

test("one-time replacement updates workload, survives reload and can be undone before reload", async ({ page }) => {
  await open(page);
  await shift(page).click();
  await page.getByRole("checkbox", { name: "ישראל", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "דוד", exact: true }).check();
  await page.getByRole("button", { name: "שמור לשבוע זה בלבד" }).click();
  await expect(shift(page)).toContainText("דוד");
  await page.getByText("סיכום עומס בתקופה המוצגת", { exact: true }).click();
  const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "דוד", exact: true }) });
  await expect(row).toContainText("1");
  await page.getByRole("button", { name: "בטל פעולה אחרונה" }).click();
  await expect(shift(page)).toContainText("ישראל");
  await page.reload();
  await expect(shift(page)).toContainText("ישראל");
});

test("clear and undo restore recurring shifts and notes", async ({ page }) => {
  await open(page, { ...base, periods: { [base.currentStart]: { assignments: {}, weekNotes: ["חשוב", ""] } } });
  await page.getByRole("button", { name: "נקה תקופה" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "נקה תקופה" }).click();
  await expect(shift(page)).not.toContainText("ישראל");
  await page.getByRole("button", { name: "בטל פעולה אחרונה" }).click();
  await expect(shift(page)).toContainText("ישראל");
  await expect(page.getByRole("textbox", { name: "הערה לשבוע 1" })).toHaveValue("חשוב");
});

test("backup download, validated restore, undo restore and malformed import", async ({ page }) => {
  await open(page);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "הורד גיבוי" }).click();
  const download = await pending;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.recurring).toEqual(base.recurring);
  const replacement = { ...base, staff: [{ id: "new", name: "חדש" }], recurring: {} };
  await page.locator('input[type="file"]').setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)) });
  await page.getByRole("button", { name: "שחזר והחלף נתונים" }).click();
  await expect(page.locator(".staff-list")).toContainText("חדש");
  await page.getByRole("button", { name: "בטל פעולה אחרונה" }).click();
  await expect(page.locator(".staff-list")).toContainText("ישראל");
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"version":99}') });
  await expect(page.getByText("קובץ הגיבוי אינו תקין או שאינו בגרסה נתמכת.", { exact: true })).toBeVisible();
  expect((await readData(page)).staff).toEqual(base.staff);
});

test("availability can be added in the UI and warns for a recurring shift without removing it", async ({ page }) => {
  await open(page);
  await page.getByText("חוסר זמינות וחופשות", { exact: true }).click();
  await page.getByRole("combobox", { name: "איש צוות לחוסר זמינות" }).click();
  await page.locator('.ant-select-item-option-content').getByText("ישראל", { exact: true }).click();
  const dates = page.locator(".availability-form .ant-picker input");
  await dates.nth(0).fill("10/09/2026");
  await dates.nth(0).press("Tab");
  await dates.nth(1).fill("10/09/2026");
  await dates.nth(1).press("Enter");
  await page.getByRole("textbox", { name: "הערת חוסר זמינות" }).fill("חופשה");
  await page.getByRole("button", { name: "הוסף חוסר זמינות" }).click();
  await expect(shift(page)).toContainText("לא זמין/ה");
  await shift(page).click();
  await expect(page.getByRole("dialog")).toContainText("נבחרו אנשים שאינם זמינים");
  await page.getByRole("button", { name: "ביטול", exact: true }).click();
  await page.reload();
  await expect(shift(page)).toContainText("לא זמין/ה");
  await page.getByText("חוסר זמינות וחופשות", { exact: true }).click();
  await page.getByRole("button", { name: /הסר חוסר זמינות/ }).click();
  await expect(shift(page)).not.toContainText("לא זמין/ה");
  await page.getByRole("button", { name: "בטל פעולה אחרונה" }).click();
  await expect(shift(page)).toContainText("לא זמין/ה");
});

test("corrupted local storage is reported and preserved", async ({ page }) => {
  await open(page, "broken local data");
  await expect(page.getByText(/לא ניתן לקרוא את הנתונים השמורים/)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe("broken local data");
});

test("mobile layout and print hide management controls without hiding the schedule", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "הורד גיבוי" })).toBeHidden();
  await expect(page.locator(".week-card")).toHaveCount(2);
  await expect(page.locator(".week-card").first()).toBeVisible();
  expect(errors).toEqual([]);
});
