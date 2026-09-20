import { test, expect } from '@playwright/test';

test('both weeks and a populated laundry row print on one landscape A4 page', async ({ page }) => {
  const staff = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, name: `איש צוות לבדיקה ${i + 1}` }));
  const residents = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, name: `דייר לבדיקה ${i + 1}` }));
  const recurring: Record<string, string[]> = {};
  for (let day = 0; day < 7; day++) for (const shift of day < 5 ? ['afternoon', 'night'] : day === 5 ? ['friday'] : ['motzeiShabbat']) recurring[`${day}:${shift}`] = staff.map((member) => member.id);
  await page.addInitScript((data) => localStorage.setItem('shift-planner-data-v1', JSON.stringify(data)), {
    version: 1, currentStart: '2026-09-06', staff, residents, periods: {}, recurring, unavailability: [],
    recurringLaundry: Object.fromEntries(Array.from({ length: 6 }, (_, day) => [String(day), residents.map((resident) => resident.id)])),
  });
  await page.goto('/');
  await expect(page.locator('.laundry-cell')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, path: 'test-results/fortnight-one-page.pdf' });
  expect((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.laundry-cell .print-only').first()).toBeVisible();
  const fits = await page.locator('.planner-content').evaluate((element) => {
    const content = element.getBoundingClientRect();
    const laundry = element.querySelector('.laundry-board')!.getBoundingClientRect();
    return content.height <= 196 * 96 / 25.4 && laundry.bottom <= content.bottom + 1;
  });
  expect(fits).toBe(true);
});
