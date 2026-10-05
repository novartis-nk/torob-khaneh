import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const ready = async (page) => {
  await page.goto('/safar');
  await expect(page.locator('.sf-card').first()).toBeVisible();
};
test('Safar sits alongside housing and attributes public listings to three sources', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('.service-switch').getByRole('link', { name: 'سفر', exact: true }).click();
  await expect(page.locator('.sf-card').first()).toBeVisible();
  for (const name of ['جاباما', 'اتاقک', 'جاجیگا'])
    await expect(
      page.locator('.sf-card .sf-provider').filter({ hasText: name }).first(),
    ).toBeVisible();
  await expect(page.locator('.sf-card').first()).toContainText('قیمت کل سفر نیاز به تأیید دارد');
  const href = await page.locator('.sf-card-actions a').first().getAttribute('href');
  expect(href).toMatch(/^https:\/\/www\.(jabama|otaghak|jajiga)\.com\/(stay|room)\//);
  await page.locator('.service-switch').getByRole('link', { name: 'خانه', exact: true }).click();
  await expect(page.locator('.home-card')).toHaveCount(13);
});
test('Persian calendar updates the trip and survives a shared URL reload', async ({ page }) => {
  await ready(page);
  await page.locator('.sf-trip-dates').click();
  const dialog = page.getByRole('dialog', { name: 'تاریخ سفرت' });
  await expect(dialog).toBeVisible();
  const choices = dialog.locator('.sf-calendar button:not([disabled])');
  await choices.nth(3).click();
  await choices.nth(2).click();
  await dialog.getByRole('button', { name: /تأیید تاریخ/ }).click();
  const before = new URL(page.url());
  expect(before.searchParams.get('checkin')).toBeTruthy();
  expect(before.searchParams.get('checkout')).toBeTruthy();
  await page.reload();
  await expect(page.locator('.sf-card').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('checkout')).toBe(
    before.searchParams.get('checkout'),
  );
});
test('guest ages change capacity filtering and are persisted in share parameters', async ({
  page,
}) => {
  await ready(page);
  await page
    .locator('.sf-tripbar')
    .getByRole('button', { name: /همسفرها/ })
    .click();
  const d = page.getByRole('dialog', { name: 'همسفرها' });
  await d.getByRole('button', { name: 'افزایش بزرگسال' }).click();
  await d.getByRole('button', { name: 'افزایش کودک' }).click();
  await d.getByLabel('سن کودک ۱').selectOption('7');
  await d.getByRole('button', { name: /تأیید ·/ }).click();
  await expect(page).toHaveURL(/adults=5/);
  await expect(page).toHaveURL(/children=7/);
  await expect(page.locator('.sf-results-top')).toContainText('۶ مهمان');
});
test('budget, provider and confirmed-price filters have honest empty states', async ({ page }) => {
  await ready(page);
  await page.locator('.sf-sidebar').getByLabel('سقف قیمت پایهٔ هر شب').selectOption('3000000');
  await expect(page.locator('.sf-results')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.sf-card').first()).toBeVisible();
  const prices = await page.locator('.sf-card .sf-price strong').allTextContents();
  expect(prices.length).toBeGreaterThan(0);
  for (const text of prices) {
    const n = Number(text.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٬/g, ''));
    expect(n).toBeLessThanOrEqual(3000000);
  }
  await page.locator('.sf-sidebar').getByLabel('فقط قیمت کلِ تأییدشده').check();
  await expect(page.getByRole('heading', { name: 'هنوز قیمت کل تأییدشده نداریم' })).toBeVisible();
  await page.getByRole('button', { name: 'دیدن همهٔ گزینه‌ها' }).click();
  await expect(page.locator('.sf-card').first()).toBeVisible();
});
test('shortlist persists; shared comparison restores different properties and source links', async ({
  page,
  context,
}) => {
  await ready(page);
  await page.locator('.sf-save').first().click();
  await page.locator('.sf-compare-check').nth(0).click();
  await page.locator('.sf-compare-check').nth(1).click();
  const shared = page.url();
  await page.reload();
  await expect(page.locator('.sf-save').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.sf-mytrip').click();
  await expect(page.locator('.sf-card')).toHaveCount(1);
  const other = await context.newPage();
  await other.goto(shared);
  await other.getByRole('button', { name: 'مقایسهٔ اقامتگاه‌ها', exact: true }).click();
  const d = other.getByRole('dialog', { name: 'چند انتخاب، کنار هم' });
  await expect(d).toContainText('مقایسهٔ اقامتگاه‌های متفاوت');
  await expect(d.locator('thead th')).toHaveCount(3);
  await expect(d.getByRole('link', { name: /دیدن در/ })).toHaveCount(2);
  await expect(d).toContainText('نیاز به تأیید در سایت میزبان');
});
test('details and source status explain unknown availability without inventing booking totals', async ({
  page,
}) => {
  await ready(page);
  await page.locator('.sf-photo-open').first().click();
  let d = page.getByRole('dialog');
  await expect(d).toContainText('مبلغ نهایی و موجودی هنوز مشخص نیست');
  await expect(d).toContainText('این اطلاعات خودکار منتقل نمی‌شوند');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /دربارهٔ منابع و قیمت‌ها/ }).click();
  await expect(page.locator('.sf-source-row')).toHaveCount(3);
  await expect(page.getByRole('dialog')).toContainText('تمام موجودی این سایت‌ها را پوشش نمی‌دهد');
});
test('malformed shared dates produce a recoverable error, not a blank page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/safar?checkin=broken&checkout=2026-02-30');
  await expect(page.getByRole('alert')).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'بازنشانی سفر' }).click();
  await expect(page.locator('.sf-card').first()).toBeVisible();
});
test('unavailable catalog can be retried without losing the trip', async ({ page }) => {
  await page.route('**/api/safar/search**', (r) => r.fulfill({ status: 503, body: '{}' }));
  await page.goto('/safar');
  await expect(page.getByRole('alert')).toBeVisible();
  const before = new URL(page.url()).searchParams.get('checkin');
  await page.unroute('**/api/safar/search**');
  await page.getByRole('button', { name: 'تلاش دوباره' }).click();
  await expect(page.locator('.sf-card').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('checkin')).toBe(before);
});
test('mobile navigation, filters, calendar and comparison fit the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(
    page.locator('.service-switch').getByRole('link', { name: 'خانه', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'فیلترها', exact: true }).click();
  await page.getByRole('dialog').getByLabel('نوع اقامتگاه').selectOption('cottage');
  await page.getByRole('button', { name: 'دیدن نتایج', exact: true }).click();
  await expect(page).toHaveURL(/type=cottage/);
  await page.locator('.sf-trip-dates').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/safar-mobile.png' });
});
test('travel page and calendar have no serious or critical accessibility violations', async ({
  page,
}) => {
  await ready(page);
  let a = await new AxeBuilder({ page }).analyze();
  expect(
    a.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
  await page.locator('.sf-trip-dates').click();
  a = await new AxeBuilder({ page }).analyze();
  expect(
    a.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sf-trip-dates')).toBeFocused();
});
test('mobile filters and property details retain accessible names and contrast', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: 'فیلترها', exact: true }).click();
  let result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
  await page.keyboard.press('Escape');
  await page.locator('.sf-photo-open').first().click();
  result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
});
