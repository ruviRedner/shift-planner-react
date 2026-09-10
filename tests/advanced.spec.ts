import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addDays, startOfSunday, toDateKey } from "../src/domain/planner";

test("automatic proposal is reviewable and publication generates a real PNG with a saved baseline", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("shift-planner-data-v1", JSON.stringify({
    version: 1, currentStart: "2026-09-06", periods: {}, recurring: {}, unavailability: [],
    staff: ["ישראל", "דוד", "משה", "יוסף"].map((name, index) => ({ id: String(index), name })),
  })));
  await page.goto("/");
  await page.getByRole("button", { name: "שיבוץ אוטומטי חכם" }).click();
  await page.getByRole("button", { name: "צור הצעה", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("24 משמרות בהצעה");
  const unchanged = await page.evaluate(() => JSON.parse(localStorage.getItem("shift-planner-data-v1")!).periods);
  expect(unchanged).toEqual({});
  await page.getByRole("button", { name: "אשר את ההצעה" }).click();
  await expect(page.locator(".shift-button").first()).not.toContainText("הוספת שיבוץ");
  await page.getByRole("button", { name: "מוכן לפרסום" }).click();
  await expect(page.getByRole("dialog")).toContainText("הסידור מוכן");
  await page.getByRole("button", { name: "צור תמונה לתצוגה מקדימה" }).click();
  const image = page.getByRole("img", { name: "תצוגה מקדימה של סידור המשמרות לשיתוף" });
  await expect(image).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "הורד וסמן כגרסה לפרסום" }).click();
  const download = await downloadPromise;
  const buffer = await readFile((await download.path())!);
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await download.saveAs("test-results/schedule-preview.png");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("shift-planner-data-v1")!).publications["2026-09-06"])).toBeTruthy();
});

test("manager and two invited staff complete an approved swap and personal calendar export", async ({ page, browser }) => {
  test.setTimeout(90_000);
  const start = toDateKey(startOfSunday(addDays(new Date(), 7)));
  const setup = await page.request.post("/api/setup", { data: { setupToken: "playwright-setup-code", username: "manager", password: "test-password-123" } });
  expect(setup.status()).toBe(201);
  const saved = await page.request.put("/api/planner", { data: { revision: 0, data: { version: 1, currentStart: start, staff: [{ id: "a", name: "ישראל" }, { id: "b", name: "דוד" }], recurring: { "4:afternoon": ["a"] }, periods: {}, unavailability: [] } } });
  expect(saved.status()).toBe(200);
  await page.goto("/#/team");
  await page.getByRole("tab", { name: "החלפות וחשבונות" }).click();
  await page.getByRole("combobox", { name: "איש צוות להזמנה" }).click();
  await page.locator(".ant-select-item-option-content").getByText("ישראל", { exact: true }).click();
  await page.getByRole("button", { name: "צור הזמנה" }).click();
  const invitation = page.getByRole("textbox", { name: "קישור הזמנה" });
  await expect(invitation).not.toHaveValue("");
  const url = await invitation.inputValue();
  const staffAContext = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  const staffBContext = await browser.newContext({ baseURL: "http://127.0.0.1:4173" });
  try {
    const a = await staffAContext.newPage();
    const pageErrors: string[] = [];
    a.on("pageerror", (error) => pageErrors.push(error.message));
    await a.goto(url);
    await expect(a.getByRole("textbox", { name: "שם משתמש", exact: true }), `Signup page: ${await a.locator("body").innerText()} ${pageErrors.join("; ")}`).toBeVisible();
    await a.getByRole("textbox", { name: "שם משתמש", exact: true }).fill("israel");
    await a.getByLabel("סיסמה", { exact: true }).fill("test-password-123");
    await a.getByRole("button", { name: "צור חשבון" }).click();
    await expect(a.getByRole("heading", { name: "שלום, ישראל" })).toBeVisible();
    const bInvite = await page.request.post("/api/invitations", { data: { staffId: "b" } });
    const b = await staffBContext.newPage();
    await b.goto(`/#/join?token=${(await bInvite.json()).token}`);
    await b.getByRole("textbox", { name: "שם משתמש", exact: true }).fill("david");
    await b.getByLabel("סיסמה", { exact: true }).fill("test-password-123");
    await b.getByRole("button", { name: "צור חשבון" }).click();
    await expect(b.getByRole("heading", { name: "שלום, דוד" })).toBeVisible();
    // The next Thursday is visible in the current two-week window.
    const upcoming = a.locator(".personal-shifts .ant-card").filter({ hasText: new Date(`${toDateKey(addDays(new Date(`${start}T12:00:00`), 4))}T12:00:00`).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" }) });
    await upcoming.getByRole("button", { name: "בקש החלפה" }).click();
    await a.getByRole("textbox", { name: "הערה לבקשת החלפה" }).fill("צריך מחליף");
    await a.getByRole("button", { name: "פתח בקשה" }).click();
    await b.getByRole("button", { name: "אני יכול/ה להחליף" }).click();
    await page.getByRole("button", { name: "אשר את דוד" }).click();
    await page.getByRole("button", { name: "אשר החלפה", exact: true }).click();
    await expect(b.locator(".personal-shifts")).toContainText("משמרת צהריים");
    const calendarPromise = b.waitForEvent("download");
    await b.getByRole("button", { name: "הוסף ליומן" }).click();
    const calendar = await calendarPromise;
    expect(await readFile((await calendar.path())!, "utf8")).toContain("BEGIN:VCALENDAR");
    const current = await page.request.get("/api/planner");
    const planner = (await current.json()).data;
    expect(Object.values(planner.periods).some((period: any) => Object.values(period.assignments).some((ids: any) => ids.includes("b")))).toBe(true);
    await page.getByRole("tab", { name: "הסידור המשותף" }).click();
    await expect(page.locator(".week-card").first().locator(".shift-button").filter({ hasText: "דוד" })).toHaveCount(1);
    await b.getByRole("button", { name: "התנתק", exact: true }).click();
    await b.getByRole("textbox", { name: "שם משתמש", exact: true }).fill("david");
    await b.getByLabel("סיסמה", { exact: true }).fill("test-password-123");
    await b.getByRole("button", { name: "התחבר", exact: true }).click();
    await expect(b.getByRole("heading", { name: "שלום, דוד" })).toBeVisible();
  } finally { await staffAContext.close(); await staffBContext.close(); }
});
