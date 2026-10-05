import { chromium } from '@playwright/test';
import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROVIDERS, parseCatalog } from '../server/safar/adapters.mjs';
const run = promisify(execFile),
  root = fileURLToPath(new URL('../', import.meta.url));
const file = `${root}/data/safar-catalog.json`;
const previous = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : { listings: [], providers: [] };
const listings = [],
  statuses = [];
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: true,
});
try {
  for (const [id, cfg] of Object.entries(PROVIDERS)) {
    const page = await browser.newPage({ locale: 'fa-IR' });
    const observedAt = new Date().toISOString();
    try {
      await page.goto(cfg.catalog, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector(id === 'jabama' ? 'a[href*="/stay/"]' : 'a[href*="/room/"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(1800);
      if (id === 'jabama') {
        // Hydrate photos on the already-discovered first page; never follow pagination.
        const cards = await page.locator('a[href*="/stay/"]').all();
        for (const card of cards.slice(0, 36)) {
          await card.scrollIntoViewIfNeeded();
          await page.waitForTimeout(90);
        }
        await page.waitForTimeout(500);
      }
      // Only the first public result page; no pagination, auth, private APIs or booking requests.
      const parsed = parseCatalog(id, await page.content(), observedAt).slice(0, 36);
      if (!parsed.length) throw Error('no_listings_parsed');
      listings.push(...parsed);
      statuses.push({
        id,
        name: cfg.name,
        status: 'snapshot',
        count: parsed.length,
        observedAt,
        url: cfg.catalog,
        quoteAccess: 'not_connected',
      });
      console.log(`${id}: ${parsed.length} public catalog records`);
    } catch (error) {
      const old = previous.listings.filter((l) => l.provider === id);
      listings.push(...old);
      statuses.push({
        id,
        name: cfg.name,
        status: old.length ? 'cached' : 'unavailable',
        count: old.length,
        observedAt: previous.providers.find((p) => p.id === id)?.observedAt || null,
        url: cfg.catalog,
        quoteAccess: 'not_connected',
        error: 'Catalog refresh failed; previous observation times preserved.',
      });
      console.log(
        `${id}: failed (${error.message.slice(0, 100)}); kept ${old.length} older records`,
      );
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
mkdirSync(`${root}/public/images/safar`, { recursive: true });
// Cache a small, balanced image sample. Other images can load directly from the verified CDN.
for (const provider of Object.keys(PROVIDERS))
  for (const listing of listings.filter((l) => l.provider === provider).slice(0, 12)) {
    if (!listing.sourceImage) continue;
    const base = `${root}/public/images/safar/${listing.id}`;
    const cached = ['webp', 'jpg', 'png'].map((ext) => `${base}.${ext}`).find(existsSync);
    if (
      cached &&
      previous.listings.find((l) => l.id === listing.id)?.sourceImage === listing.sourceImage
    ) {
      listing.image = cached.replace(`${root}/public`, '');
      continue;
    }
    try {
      await run('curl', [
        '--fail',
        '--silent',
        '--show-error',
        '--max-time',
        '15',
        '--max-filesize',
        '3000000',
        listing.sourceImage,
        '-o',
        `${base}.download`,
      ]);
      const bytes = readFileSync(`${base}.download`);
      const ext =
        bytes.subarray(0, 4).toString() === 'RIFF'
          ? 'webp'
          : bytes[0] === 137 && bytes[1] === 80
            ? 'png'
            : bytes[0] === 255 && bytes[1] === 216
              ? 'jpg'
              : null;
      if (!ext) continue;
      renameSync(`${base}.download`, `${base}.${ext}`);
      listing.image = `/images/safar/${listing.id}.${ext}`;
    } catch {
      continue;
    }
  }
const payload = {
  version: 1,
  sample: false,
  updatedAt: new Date().toISOString(),
  coverage: 'First public Ramsar result pages; not platform-wide inventory.',
  listings,
  providers: statuses,
  quotes: previous.quotes || [],
};
writeFileSync(`${file}.tmp`, JSON.stringify(payload, null, 2) + '\n');
renameSync(`${file}.tmp`, file);
console.log(`Saved ${listings.length} listings; no date-specific prices or availability inferred.`);
