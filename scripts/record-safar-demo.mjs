import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const out = resolve('artifacts');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
const page = await context.newPage(),
  chapters = [],
  started = Date.now();
async function caption(title, body, seconds) {
  chapters.push({ seconds: Math.round((Date.now() - started) / 1000), title, body });
  await page.evaluate(
    ({ title, body }) => {
      document.querySelector('#safar-demo-caption')?.remove();
      const panel = document.createElement('div');
      panel.id = 'safar-demo-caption';
      panel.setAttribute('popover', 'manual');
      panel.style.cssText =
        'position:fixed;inset:auto auto 16px 50%;transform:translateX(-50%);width:960px;max-width:94vw;margin:0;padding:16px 24px;border:1px solid #53605b;border-radius:12px;background:#24352ff7;color:white;font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;direction:rtl;pointer-events:none;';
      const head = document.createElement('div');
      head.textContent = title;
      head.style.cssText = 'font-size:13px;color:#bed6c9;margin-bottom:6px';
      const text = document.createElement('div');
      text.textContent = body;
      text.style.cssText = 'font-size:18px;line-height:1.9';
      panel.append(head, text);
      document.body.append(panel);
      panel.showPopover();
    },
    { title, body },
  );
  await page.waitForTimeout(seconds * 1000);
}
try {
  await page.goto(`${process.env.DEMO_URL || 'http://127.0.0.1:4317'}/safar`);
  await page.locator('.sf-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await caption(
    'ترب سفر | از نمونهٔ داده تا کاتالوگ واقعی',
    'در کنار خانه، سفر: آگهی‌های عمومی جاباما، اتاقک و جاجیگا برای رامسر و اطراف. این نسخه مستقل است و موجودی کامل سایت‌ها را ندارد.',
    9,
  );
  await page.locator('.sf-trip-dates').click();
  await caption(
    '۱ / سفر مشخص، مقایسهٔ مشخص',
    'تاریخ در تقویم شمسی انتخاب می‌شود. تاریخ و تعداد مهمان‌ها در لینک سفر می‌مانند؛ تأیید موجودی هنوز در سایت میزبان انجام می‌شود.',
    10,
  );
  await page.keyboard.press('Escape');
  await page
    .locator('.sf-tripbar')
    .getByRole('button', { name: /همسفرها/ })
    .click();
  await page.getByRole('button', { name: 'افزایش کودک' }).click();
  await page.getByLabel('سن کودک ۱').selectOption('7');
  await caption(
    '۲ / ظرفیت برای همهٔ همسفرها',
    'تعداد بزرگسال و سن کودک جداست. ظرفیت اعلام‌شده با همهٔ مهمان‌ها سنجیده می‌شود؛ هزینهٔ کودک یا نفر اضافه حدس زده نمی‌شود.',
    10,
  );
  await page.getByRole('button', { name: /تأیید ·/ }).click();
  await page.locator('#safar-results').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, 530));
  await caption(
    '۳ / هر قیمت، با منبع و زمان مشاهده',
    'قیمت هر شب «شروع از» است؛ آن را در تعداد شب‌ها ضرب نمی‌کنیم تا یک مبلغ نهایی ساختگی بسازیم. امتیاز کاربران هم به سایت خودش نسبت داده می‌شود.',
    12,
  );
  await page.locator('.sf-save').first().click();
  await page.locator('.sf-compare-check').nth(0).click();
  await page.locator('.sf-compare-check').nth(1).click();
  await page.getByRole('button', { name: 'مقایسهٔ اقامتگاه‌ها', exact: true }).click();
  await caption(
    '۴ / گزینه‌ها را کنار هم بگذار',
    'مقایسهٔ اقامتگاه‌های متفاوت، با ظرفیت و قیمت پایه. شباهت نام یا تصویر برای ادعای یکسان بودن دو واحد کافی نیست. لینک، همین انتخاب‌ها را بازسازی می‌کند.',
    12,
  );
  await page.keyboard.press('Escape');
  await page.locator('.sf-sidebar').getByLabel('فقط قیمت کلِ تأییدشده').check();
  await page.getByRole('heading', { name: 'هنوز قیمت کل تأییدشده نداریم' }).waitFor();
  await caption(
    '۵ / نتیجهٔ خالی، وقتی شواهد کافی نیست',
    'بدون موجودی، قیمت همهٔ شب‌ها و کارمزدهای کامل، گزینه‌ای تأییدشده معرفی نمی‌شود. این مرز در منطق و تست‌ها هم اعمال شده است.',
    10,
  );
  await page.getByRole('button', { name: 'دیدن همهٔ گزینه‌ها' }).click();
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: /دربارهٔ منابع و قیمت‌ها/ }).click();
  await caption(
    '۶ / گام بعدی با معیار روشن',
    'برای مقایسهٔ قیمت نهایی یک واحد در چند سایت: دسترسی به نرخ معتبر، تأیید هویت واحد و سنجش خطای مبلغ در زمان انتقال به سایت میزبان لازم است.',
    12,
  );
} finally {
  writeFileSync(resolve(out, 'safar-demo-chapters.json'), JSON.stringify(chapters, null, 2));
  await context.close();
  await browser.close();
}
const raw = await page.video().path();
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw Error('ffmpeg failed');
}
ffmpeg([
  '-i',
  raw,
  '-vf',
  'fps=25,format=yuv420p',
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '25',
  '-an',
  '-movflags',
  '+faststart',
  resolve(out, 'torob-safar-demo.mp4'),
]);
if (existsSync(resolve(out, 'torob-khaneh-demo.mp4')))
  ffmpeg([
    '-i',
    resolve(out, 'torob-khaneh-demo.mp4'),
    '-i',
    resolve(out, 'torob-safar-demo.mp4'),
    '-filter_complex',
    '[0:v]fps=25,setsar=1[v0];[1:v]fps=25,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '25',
    '-pix_fmt',
    'yuv420p',
    '-an',
    '-movflags',
    '+faststart',
    resolve(out, 'torob-khaneh-safar-demo.mp4'),
  ]);
console.log('Safar demo exported.');
