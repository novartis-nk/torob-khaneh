import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const out = resolve('artifacts');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'reduce',
  recordVideo: { dir: out, size: { width: 1280, height: 900 } },
});
const page = await context.newPage();
const stages = [];
const started = Date.now();
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function caption(title, body) {
  stages.push({ seconds: Math.round((Date.now() - started) / 1000), title, body });
  await page.evaluate(
    ({ title, body }) => {
      document.querySelector('#demo-caption')?.remove();
      const panel = document.createElement('div');
      panel.id = 'demo-caption';
      panel.setAttribute('popover', 'manual');
      panel.style.cssText =
        'position:fixed;inset:auto auto 16px 50%;transform:translateX(-50%);width:960px;max-width:94vw;margin:0;padding:18px 24px;border:1px solid #53605b;border-radius:12px;background:#24352ff7;color:white;font-family:Vazirmatn,Tahoma,sans-serif;text-align:right;direction:rtl;box-shadow:0 8px 35px #0003;pointer-events:none;';
      const top = document.createElement('div');
      top.textContent = title;
      top.style.cssText = 'font-size:13px;color:#bed6c9;margin-bottom:7px;';
      const text = document.createElement('div');
      text.textContent = body;
      text.style.cssText = 'font-size:18px;line-height:1.9;font-weight:450';
      panel.append(top, text);
      document.body.append(panel);
      panel.showPopover();
    },
    { title, body },
  );
}
async function pause(seconds) {
  await delay(seconds * 1000);
}
try {
  await page.goto(`${process.env.DEMO_URL || 'http://127.0.0.1:4317'}/khaneh`);
  await page.waitForSelector('.home-card');
  await page.evaluate(() => document.fonts.ready);
  await caption(
    'ترب خانه | چالش AI Product Engineer',
    'یک خانه، همهٔ پیشنهادها. یک نمونهٔ مستقل برای مقایسهٔ اجاره؛ آگهی‌ها و تصاویر این دمو نمایشی‌اند.',
  );
  await pause(12);
  await caption(
    '۱ / انتخاب مسئله',
    'فرضیه: مستأجر باید آگهی‌های تکراری، اختلاف قیمت و دو بخش بودجه را خودش تطبیق دهد. این محصول، آن کار را یک‌جا انجام می‌دهد.',
  );
  await pause(13);
  await page
    .locator('#search')
    .fill('دو خواب، ودیعه تا ۶۰۰ میلیون، اجاره تا ۲۰ میلیون، نزدیک مترو');
  await pause(2);
  await page.getByRole('button', { name: 'پیدا کن', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.home-card').length === 3);
  await page.locator('#results').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollTo(0, 520));
  await caption(
    '۲ / از خواسته به فیلتر',
    'برداشت از متن فارسی، قابل دیدن و اصلاح است. ودیعه و اجاره باید در همان پیشنهاد، هر دو در بودجه باشند. استخراج این نسخه قاعده‌محور است.',
  );
  await pause(16);
  await page.locator('.home-card').first().getByText('مقایسهٔ پیشنهادها').click();
  await caption(
    '۳ / یک خانه در چند منبع',
    'سه پیشنهاد برای یک خانه. مبلغ ارزان‌ترِ قدیمی را می‌بینیم، اما از آن برای قیمت منتخب استفاده نمی‌کنیم. همهٔ مبلغ‌ها به تومان یکسان شده‌اند.',
  );
  await pause(18);
  await page.locator('.offer-row').first().getByRole('button').click();
  await page.waitForSelector('.source-json');
  await caption(
    '۴ / ردِ داده تا منبع',
    'هر قیمت به دادهٔ ورودی‌اش برمی‌گردد. ورودی‌ها سه قالب متفاوت دارند؛ رکورد نامعتبر وارد مقایسهٔ عددی نمی‌شود.',
  );
  await pause(13);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'چرا یک خانه‌اند؟' }).click();
  await caption(
    '۵ / جلوگیری از ادغام اشتباه',
    'عکس مشترک کافی نیست؛ نشانی، متراژ، اتاق، طبقه و موقعیت هم باید سازگار باشند. همان عکس و متراژ در طبقهٔ دیگر، یک نتیجهٔ جدا می‌ماند.',
  );
  await pause(16);
  await page.getByRole('tab', { name: 'چرا این خانه؟' }).click();
  await caption(
    '۶ / رتبه‌بندی قابل توضیح',
    'اول محدودیت‌های شما؛ سپس هزینه، مترو، تازگی و کامل بودن اطلاعات. سهم هر عامل مشخص است؛ امتیاز، احتمال یا تضمین کیفیت ملک نیست.',
  );
  await pause(17);
  await page.keyboard.press('Escape');
  await page.locator('.compare-toggle').nth(0).click();
  await page.locator('.compare-toggle').nth(1).click();
  await page.getByRole('button', { name: 'مقایسهٔ خانه‌ها', exact: true }).click();
  await caption(
    '۷ / مقایسهٔ تصمیم‌ها',
    'دو خانه کنار هم: ودیعه، اجاره، مترو و امکانات. پول پیش و اجاره جدا دیده می‌شوند؛ یک مبلغ ساختگی از دو منبع نمی‌سازیم.',
  );
  await pause(14);
  await page.locator('#rate').fill('5');
  await pause(1);
  await caption(
    '۸ / یک ترجیح شخصی، نه نرخ بازار',
    'وزن ودیعه را تغییر می‌دهیم؛ هزینهٔ مقایسه عوض می‌شود، قیمت آگهی ثابت می‌ماند. این ضریب صرفاً انتخاب کاربر است و مبلغ پیشنهادی مالک نیست.',
  );
  await pause(15);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'پاک کردن مقایسه' }).click();
  await page.locator('.save-button').first().click();
  await caption(
    '۹ / ادامهٔ مسیر در مراجعهٔ بعد',
    'خانه‌ها و جست‌وجوها در همین مرورگر ذخیره می‌شوند. لینک جست‌وجو قابل اشتراک است؛ اعلان یا تماس خودکاری ارسال نمی‌شود.',
  );
  await pause(10);
  await page.locator('#deposit').fill('1');
  await page.waitForSelector('.empty-state');
  await page.evaluate(() => scrollTo(0, 490));
  await caption(
    '۱۰ / وقتی نتیجه نداریم',
    'شرط کاربر را پنهانی حذف نمی‌کنیم. نتیجهٔ خالی، فرصتی برای اصلاح آگاهانهٔ بودجه یا محدوده است.',
  );
  await pause(12);
  await page.getByRole('button', { name: 'دیدن همهٔ خانه‌ها', exact: true }).click();
  await page.waitForSelector('.home-card');
  await page.getByRole('button', { name: 'شفافیت داده‌ها', exact: true }).click();
  await caption(
    '۱۱ / مرز شواهد و گام بعد',
    '۲۸ ورودی نمونه، ۲۷ آگهی پذیرفته‌شده، ۱۴ خانه. برای عرضهٔ واقعی: دسترسی مجاز به منبع، سنجش خطای ادغام و آزمایش با مستأجرهای واقعی.',
  );
  await pause(16);
  await page.keyboard.press('Escape');
  await page.evaluate(() => scrollTo(0, 0));
  await caption(
    'ترب خانه | از دادهٔ پراکنده تا انتخاب روشن',
    'کد، تصمیم‌های محصول، فرضیه‌ها و تست‌ها همراه پروژه‌اند. هدف مرحلهٔ بعد: کوتاه‌تر شدن مسیر رسیدن به یک فهرست قابل اتکا برای بازدید.',
  );
  await pause(12);
} finally {
  writeFileSync(resolve(out, 'demo-chapters.json'), JSON.stringify(stages, null, 2));
  const video = page.video();
  await context.close();
  const raw = await video.path();
  await browser.close();
  console.log('Recording:', raw);
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      raw,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      resolve(out, 'torob-khaneh-demo.mp4'),
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exitCode = 1;
  } else console.log('Exported artifacts/torob-khaneh-demo.mp4');
}
