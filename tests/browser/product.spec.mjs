import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ page }) => {
  await page.goto('/khaneh');
  await expect(page.locator('.home-card')).toHaveCount(13);
});
test('Persian intent produces matching homes and removable filters', async ({ page }) => {
  await page
    .getByLabel('خانه‌ای که دنبالش هستید')
    .fill('دو خواب، ودیعه تا ۶۰۰ میلیون، اجاره تا ۲۰ میلیون، نزدیک مترو');
  await page.getByRole('button', { name: 'پیدا کن', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(3);
  await expect(page.locator('.intent-chips')).toContainText('ودیعه تا ۶۰۰');
  await expect(page.locator('#deposit')).toHaveValue('600');
  await page.getByRole('button', { name: 'حذف فیلتر ودیعه تا ۶۰۰ میلیون', exact: true }).click();
  await expect(page.locator('#deposit')).toHaveValue('');
  await expect(page.locator('.intent-chips')).not.toContainText('ودیعه');
});
test('zero-result state preserves constraints', async ({ page }) => {
  await page.locator('#deposit').fill('1');
  await expect(page.getByText('خانه‌ای با همهٔ این شرایط پیدا نشد')).toBeVisible();
  await expect(page.locator('#deposit')).toHaveValue('1');
  await page.getByRole('button', { name: 'دیدن همهٔ خانه‌ها', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(13);
});
test('source evidence, stale offers and ranking explanation are inspectable', async ({ page }) => {
  await page.getByRole('button', { name: 'صادقیه با پارکینگ', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(2);
  await page
    .locator('.home-card')
    .filter({ hasText: '۲ پیشنهاد برای همین خانه' })
    .first()
    .getByText('مقایسهٔ پیشنهادها')
    .click();
  await expect(page.locator('.offer-row')).toHaveCount(3);
  await expect(page.locator('.offer-row.stale')).toHaveCount(1);
  await page.getByRole('tab', { name: 'چرا این خانه؟' }).click();
  await expect(page.locator('.score-grid meter')).toHaveCount(4);
  await page.getByRole('tab', { name: 'چرا یک خانه‌اند؟' }).click();
  await expect(page.getByText('اثر تصویر یکسان در دادهٔ نمونه', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});
test('bookmarks persist after reload', async ({ page }) => {
  await page.locator('.save-button').first().click();
  await page.reload();
  await page.getByRole('button', { name: /نشان‌شده‌ها/ }).click();
  await expect(page.locator('.home-card')).toHaveCount(1);
  await expect(page.locator('.save-button')).toHaveAttribute('aria-pressed', 'true');
});
test('comparison changes its math when personal weight changes', async ({ page }) => {
  await page.locator('.compare-toggle').nth(0).click();
  await page.locator('.compare-toggle').nth(1).click();
  await page.getByRole('button', { name: 'مقایسهٔ خانه‌ها', exact: true }).click();
  await expect(page.locator('.comparison-table tbody tr')).toHaveCount(9);
  const before = await page.locator('.comparison-table tbody tr').nth(2).innerText();
  await page.locator('#rate').fill('5');
  await expect(page.locator('.comparison-table tbody tr').nth(2)).not.toHaveText(before);
});
test('saved search restores filters', async ({ page }) => {
  await page.getByRole('button', { name: 'رهن کامل', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'ذخیرهٔ جست‌وجو', exact: true }).click();
  await page.goto('/khaneh');
  await expect(page.locator('.home-card')).toHaveCount(13);
  await page.getByRole('button', { name: 'جست‌وجوهای ذخیره‌شده', exact: true }).click();
  await page
    .locator('.saved-search-row')
    .getByRole('button', { name: 'رهن کامل', exact: true })
    .click();
  await expect(page.locator('.home-card')).toHaveCount(1);
});
test('API failure has a working retry', async ({ page }) => {
  await page.route('**/api/search**', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.getByRole('button', { name: 'رهن کامل', exact: true }).click();
  await expect(page.getByText('نتایج دریافت نشد', { exact: true })).toBeVisible();
  await page.unroute('**/api/search**');
  await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(1);
});
test('map is interactive and explicitly schematic', async ({ page }) => {
  await page.getByRole('button', { name: 'نمای محله‌ها', exact: true }).click();
  await expect(page.getByText('چیدمان شماتیک؛ موقعیت دقیق ملک نیست')).toBeVisible();
  await page.locator('.map-pin-group button').first().click();
  await expect(page.locator('dialog')).toBeVisible();
});
test('mobile layout and filters work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'فیلترها', exact: true }).click();
  await page.locator('#deposit').fill('1');
  await page.getByRole('button', { name: 'دیدن نتایج', exact: true }).click();
  await expect(page.getByText('خانه‌ای با همهٔ این شرایط پیدا نشد')).toBeVisible();
  await page.screenshot({ path: 'artifacts/mobile-empty.png', fullPage: true });
});
test('desktop accessibility has no serious or critical violations', async ({ page }) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
});
test('detail dialog accessibility and keyboard dismissal', async ({ page }) => {
  await page.locator('.card-bottom .text-button').first().click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});
test('nested source dialog has a unique name and restores the property dialog', async ({
  page,
}) => {
  await page.locator('.card-bottom .text-button').first().click();
  await page.locator('.offer-row').first().getByRole('button').click();
  await expect(page.getByRole('dialog', { name: 'ردِ داده تا منبع' })).toBeVisible();
  await expect(page.locator('.source-json')).toContainText('schema');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'یک خانه، همهٔ پیشنهادها' })).toBeVisible();
  await expect(page.locator('dialog')).toHaveCount(1);
});
test('property tabs support keyboard navigation in RTL', async ({ page }) => {
  await page.locator('.card-bottom .text-button').first().click();
  await page.getByRole('tab', { name: 'پیشنهادهای منابع' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'چرا این خانه؟' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'چرا یک خانه‌اند؟' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
test('mobile accessibility includes the filter panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'فیلترها', exact: true }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
});
