import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the first page is a search entry point without fetching result catalogs', async ({
  page,
}) => {
  const apiRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ترب', exact: true })).toBeVisible();
  await expect(page.locator('.landing-wordmark img')).toHaveAttribute('src', '/torob-logo.svg');
  await expect(page.getByRole('tab', { name: 'اجاره و خرید', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.home-card, .sf-card')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'جست‌وجوی خانه' })).toBeVisible();
  expect(apiRequests).toEqual([]);
});
test('a source request is queued for AI discovery and returns a tracking id', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'درخواست افزودن سایت' }).click();
  await page.getByLabel('آدرس سایت').fill('https://example.com/listings');
  await page.getByLabel('نوع داده').selectOption('travel');
  await page
    .getByLabel('داده‌های موردنیاز و توضیحات اختیاری')
    .fill('قیمت، موجودی و زمان به‌روزرسانی');
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith('/api/source-requests') && candidate.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'ثبت درخواست بررسی' }).click();
  expect((await response).status()).toBe(202);
  await expect(page.getByRole('heading', { name: 'درخواست در صف بررسی هوشمند است' })).toBeVisible();
  await expect(page.getByText(/^source_[a-f0-9]{12}$/)).toBeVisible();
});
test('a housing search opens the existing housing results with its query', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'جست‌وجوی خانه' }).fill('صادقیه با پارکینگ');
  await page.getByRole('searchbox', { name: 'جست‌وجوی خانه' }).press('Enter');
  await expect(page).toHaveURL(/\/khaneh\?/);
  await expect(page.locator('.home-card')).toHaveCount(2);
  await expect(page.getByLabel('خانه‌ای که دنبالش هستید')).toHaveValue('صادقیه با پارکینگ');
  await page.getByRole('link', { name: 'ترب؛ صفحهٔ اصلی' }).click();
  await expect(page.getByRole('searchbox', { name: 'جست‌وجوی خانه' })).toBeVisible();
});
test('travel search carries explicit destination and property type into Safar', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'سفر', exact: true }).click();
  await page.getByRole('searchbox', { name: 'جست‌وجوی سفر' }).fill('ویلا در رامسر');
  await page.getByRole('button', { name: 'جست‌وجو', exact: true }).click();
  await expect(page).toHaveURL(/\/safar\?/);
  await expect(page.locator('.sf-card').first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('city')).toBe('رامسر');
  expect(new URL(page.url()).searchParams.get('type')).toBe('villa');
  await expect(page.getByLabel('مقصد')).toHaveValue('رامسر');
  await expect(page.locator('.sf-sidebar').getByLabel('نوع اقامتگاه')).toHaveValue('villa');
  await page.getByRole('link', { name: 'ترب؛ صفحهٔ اصلی' }).click();
  await expect(page.getByRole('heading', { name: 'ترب', exact: true })).toBeVisible();
});
test('tabs support RTL keyboard navigation and keep independent search drafts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'جست‌وجوی خانه' }).fill('رهن کامل');
  await page.getByRole('tab', { name: 'اجاره و خرید', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'سفر', exact: true })).toBeFocused();
  await page.getByRole('searchbox', { name: 'جست‌وجوی سفر' }).fill('کلبه');
  await page.getByRole('tab', { name: 'سفر', exact: true }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('searchbox', { name: 'جست‌وجوی خانه' })).toHaveValue('رهن کامل');
  await page.getByRole('button', { name: 'پاک کردن جست‌وجو' }).click();
  await expect(page.getByRole('searchbox', { name: 'جست‌وجوی خانه' })).toHaveValue('');
  await expect(page.getByRole('searchbox', { name: 'جست‌وجوی خانه' })).toBeFocused();
});
test('legacy housing links still restore their query and constraints', async ({ page }) => {
  await page.goto('/?q=%D8%B1%D9%87%D9%86+%DA%A9%D8%A7%D9%85%D9%84');
  await expect(page).toHaveURL(/\/khaneh\?/);
  await expect(page.locator('.home-card')).toHaveCount(1);
});
test('the mobile entry page fits, exposes the active tab and passes accessibility checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'سفر', exact: true }).click();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 3).map((n) => n.target) })),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'کلبه', exact: true }).click();
  await expect(page).toHaveURL(/\/safar\?/);
  await expect(page.locator('.sf-card').first()).toBeVisible();
});
