import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('explore opens a full-height reel and switches to the housing grid', async ({ page }) => {
  await page.goto('/explore');

  const slides = page.locator('.explore-slide');
  await expect(slides).toHaveCount(13);
  await expect(page.getByRole('heading', { name: 'کشف خانه' })).toBeVisible();

  const [slideBox, contentBox] = await Promise.all([
    slides.first().boundingBox(),
    page.locator('.explore-main').boundingBox(),
  ]);
  expect(slideBox).not.toBeNull();
  expect(contentBox).not.toBeNull();
  expect(Math.abs(slideBox.height - contentBox.height)).toBeLessThanOrEqual(2);

  await page.getByRole('tab', { name: 'شبکه', exact: true }).click();
  await expect(page.locator('.explore-grid-card')).toHaveCount(13);
  await expect(page).toHaveURL(/\/explore\?view=grid$/);

  await page.getByRole('tab', { name: 'شبکه', exact: true }).press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /نشان‌شده/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /نشان‌شده/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('explore search keeps the query in the URL and returns matching reels', async ({ page }) => {
  await page.goto('/explore');
  await page.getByRole('tab', { name: 'جست‌وجو', exact: true }).click();
  await page.getByRole('textbox', { name: 'جست‌وجوی خانه در اکسپلور' }).fill('صادقیه با پارکینگ');
  await page.getByRole('button', { name: 'دیدن', exact: true }).click();

  await expect(page.locator('.explore-slide')).toHaveCount(2);
  await expect(page).toHaveURL(/\/explore\?q=/);
  expect(new URL(page.url()).searchParams.get('q')).toBe('صادقیه با پارکینگ');
});

test('saved homes persist into the dedicated explore tab', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.locator('.explore-slide')).toHaveCount(13);

  await page
    .getByRole('button', { name: /^افزودن به نشان‌شده‌ها:/ })
    .first()
    .click();
  await page.getByRole('tab', { name: /نشان‌شده/ }).click();

  await expect(page.locator('.explore-grid-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.explore-grid-card')).toHaveCount(1);
});

test('mobile explore fits the viewport and passes serious accessibility checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore');
  await expect(page.locator('.explore-slide')).toHaveCount(13);

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((violation) => ['serious', 'critical'].includes(violation.impact))
      .map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.slice(0, 3).map((node) => node.target),
      })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('tab', { name: 'شبکه', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.explore-grid-card')).toHaveCount(13);
});
