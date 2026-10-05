import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCatalog, safeProviderUrl } from '../server/safar/adapters.mjs';
import { validateTrip, quoteForTrip, searchSafar, todayIran } from '../server/safar/engine.mjs';
import { monthStart, shiftMonth, monthDays } from '../src/safar/dates.js';
const now = new Date('2026-10-05T09:00:00Z'),
  observed = now.toISOString();
const input = { checkin: '2026-10-07', checkout: '2026-10-09', adults: 4, children: [] };
const listing = {
  id: 'otaghak-1',
  provider: 'otaghak',
  title: 'ویلا در رامسر',
  city: 'رامسر',
  type: 'villa',
  capacity: 6,
  startingPrice: 1000000,
  observedAt: observed,
};
const catalog = { listings: [listing], providers: [], quotes: [], updatedAt: observed };
const quote = {
  listingId: listing.id,
  provider: listing.provider,
  ...input,
  currency: 'toman',
  availability: 'available',
  feesComplete: true,
  observedAt: observed,
  expiresAt: '2026-10-05T10:00:00Z',
  nightlyRates: [2000000, 3000000],
  mandatoryFees: 200000,
  extraGuestTotal: 400000,
  discountTotal: 100000,
};
test('trip dates follow Tehran calendar day and reject impossible dates/ranges', () => {
  assert.equal(todayIran(new Date('2026-10-05T21:00:00Z')), '2026-10-06');
  assert.equal(validateTrip(input, now).nights, 2);
  for (const patch of [
    { checkin: 'bad' },
    { checkin: '2026-02-30' },
    { checkout: '2026-10-07' },
    { checkout: '2026-11-08' },
    { checkin: '2026-10-04' },
    { adults: 0 },
    { adults: 1.5 },
    { children: '2,-1' },
    { children: '2,no' },
    { children: [18] },
    { children: Array(7).fill(2) },
  ])
    assert.throws(() => validateTrip({ ...input, ...patch }, now), /invalid_trip/);
  assert.deepEqual(validateTrip({ ...input, children: '12,2' }, now).children, [2, 12]);
  assert.equal(
    validateTrip({ checkin: '2028-02-29', checkout: '2028-03-01' }, new Date('2028-02-28')).nights,
    1,
  );
});
test('Persian calendar handles Nowruz and leap Esfand without fixed month lengths', () => {
  assert.equal(monthStart('2025-03-21'), '2025-03-21');
  assert.equal(shiftMonth('2025-03-01', 1), '2025-03-21');
  assert.equal(monthDays('2025-03-01').filter(Boolean).length, 30);
  assert.equal(monthDays('2025-04-01').filter(Boolean).length, 31);
  assert.equal(shiftMonth('2025-03-21', -1), '2025-02-19');
});
test('a quote must match the exact dates, party and source; total includes all fees', () => {
  const trip = validateTrip(input, now);
  assert.equal(quoteForTrip(quote, listing, trip, now.valueOf()).total, 5500000);
  for (const patch of [
    { listingId: 'other' },
    { provider: 'jabama' },
    { checkout: '2026-10-10' },
    { adults: 3 },
    { children: [2] },
    { currency: 'rial' },
    { feesComplete: false },
    { mandatoryFees: null },
    { nightlyRates: [2000000] },
    { nightlyRates: {} },
    { children: {} },
    { availability: 'unknown' },
    { expiresAt: observed },
    { observedAt: '2026-10-06T09:00:00Z' },
    { discountTotal: 9000000 },
  ])
    assert.equal(
      quoteForTrip({ ...quote, ...patch }, listing, trip, now.valueOf()),
      null,
      JSON.stringify(patch),
    );
});
test('nightly starting prices never become trip quotes or qualify for total-budget filtering', () => {
  const result = searchSafar(catalog, input, now);
  assert.equal(result.results[0].quote, null);
  assert.equal(result.confirmedCount, 0);
  assert.equal(searchSafar(catalog, { ...input, maxTotal: 999999999 }, now).total, 0);
  assert.equal(searchSafar(catalog, { ...input, confirmedOnly: 'true' }, now).total, 0);
  assert.equal(
    searchSafar({ ...catalog, quotes: [quote] }, { ...input, maxTotal: 5500000 }, now).total,
    1,
  );
  assert.equal(
    searchSafar({ ...catalog, quotes: [quote] }, { ...input, maxTotal: 5499999 }, now).total,
    0,
  );
});
test('capacity filtering preserves unknowns visibly, includes children and never merges similar listings', () => {
  const c = {
    ...catalog,
    listings: [
      listing,
      { ...listing, id: 'jabama-1', provider: 'jabama', capacity: null },
      { ...listing, id: 'jajiga-1', provider: 'jajiga', capacity: 4 },
    ],
  };
  const r = searchSafar(c, { ...input, children: [2] }, now);
  assert.equal(r.total, 2);
  assert.equal(r.results.find((l) => l.provider === 'jabama').capacityStatus, 'unknown');
  assert.equal(searchSafar(c, { ...input, children: [2], knownCapacity: 'true' }, now).total, 1);
  assert.equal(searchSafar(c, { ...input, providers: 'jabama,jabama' }, now).total, 1);
  assert.throws(() => searchSafar(c, { ...input, providers: '__proto__' }, now), /invalid_trip/);
});
test('provider handoff URLs and image hosts are strictly bounded', () => {
  assert.equal(
    safeProviderUrl('jabama', '/stay/villa-123'),
    'https://www.jabama.com/stay/villa-123',
  );
  for (const url of [
    'https://evil.test/stay/villa-123',
    'javascript:alert(1)',
    'https://x@www.jabama.com/stay/villa-123',
    'https://www.jabama.com/stay/villa-123/evil',
    'https://www.jabama.com:8443/stay/villa-123',
  ])
    assert.equal(safeProviderUrl('jabama', url), null);
  assert.equal(
    safeProviderUrl('otaghak', 'https://cdn.otaghak.com/room.jpg', true),
    'https://cdn.otaghak.com/room.jpg',
  );
  assert.equal(safeProviderUrl('otaghak', 'https://evil.test/image.jpg', true), null);
});
test('Jabama adapter distinguishes installments, nightly teaser, decoration and duplicate links', () => {
  const html = `<a href="/stay/villa-123"><header>هر قسط ۵۰۰٬۰۰۰ تومان<h3>ویلا دوخوابه رامسر</h3>استان مازندران، رامسر . 2 اتاق . 4 نفر پایه + 2 نفر اضافه 4.8(12 دیدگاه)</header><img src="https://cdn.jabama.com/icon.png" alt="قیمت منصفانه"><img class="object-cover" src="https://cdn.jabama.com/photo.jpg"><footer>شروع از: <del>۳٬۰۰۰٬۰۰۰ تومان</del>۲٬۰۰۰٬۰۰۰ تومان/ هرشب</footer></a>`;
  const result = parseCatalog('jabama', html + html, observed);
  assert.equal(result.length, 1);
  assert.equal(result[0].startingPrice, 2000000);
  assert.equal(result[0].capacity, 6);
  assert.equal(result[0].city, 'رامسر');
  assert.equal(result[0].sourceImage, 'https://cdn.jabama.com/photo.jpg');
  const unloaded = html.replace(
    '<img class="object-cover" src="https://cdn.jabama.com/photo.jpg">',
    '',
  );
  assert.equal(parseCatalog('jabama', unloaded, observed)[0].image, null);
  assert.equal(
    parseCatalog('jabama', html.replace(/<footer>.*<\/footer>/, ''), observed).length,
    0,
  );
});
test('Otaghak structured catalog does not use totalPrice=0 as a trip quote', () => {
  const data = {
    props: {
      pageProps: {
        searchRoomsResult: {
          rooms: [
            {
              roomId: 456,
              roomTypeName: 'ویلا',
              roomName: 'جنگلی',
              cityFaName: 'رامسر',
              personCapacity: 4,
              extraPersonCapacity: 2,
              basePrice: 3000000,
              afterDiscount: 2500000,
              totalPrice: 0,
              totalNights: 0,
              roomMediaTitles: { mainImageTitle: 'photo.jpg' },
            },
          ],
        },
      },
    },
  };
  const [r] = parseCatalog(
    'otaghak',
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`,
    observed,
  );
  assert.equal(r.startingPrice, 2500000);
  assert.equal(r.capacity, 6);
  assert.equal(r.tripQuote, null);
  assert.equal(r.availability, 'unknown');
});
test('Jajiga preserves nearby cities and rejects malformed/empty records', () => {
  const html =
    '<a href="/room/123"><h3>سوئیت مبله در چابکسر</h3>1 خوابه . تا 6 مهمان 4.8(78 نظر) هر شب از۱٬۰۰۰٬۰۰۰تومان</a>';
  const [r] = parseCatalog('jajiga', html, observed);
  assert.equal(r.city, 'چابکسر');
  assert.equal(r.capacity, 6);
  assert.equal(r.rating, 4.8);
  assert.equal(r.startingPrice, 1000000);
  assert.deepEqual(
    parseCatalog('otaghak', '<script id="__NEXT_DATA__">broken</script>', observed),
    [],
  );
  assert.throws(() => parseCatalog('__proto__', '', observed), /invalid_catalog/);
});
test('checked-in snapshot has source provenance and no fabricated quote or matching claims', () => {
  const c = JSON.parse(readFileSync(new URL('../data/safar-catalog.json', import.meta.url)));
  assert.equal(c.sample, false);
  assert.equal(new Set(c.listings.map((l) => l.provider)).size, 3);
  assert.equal(new Set(c.listings.map((l) => l.id)).size, c.listings.length);
  for (const l of c.listings) {
    assert.equal(l.url, safeProviderUrl(l.provider, l.url));
    assert.ok(l.startingPrice > 0);
    assert.equal(l.priceKind, 'starting_nightly');
    assert.equal(l.availability, 'unknown');
    assert.equal(l.tripQuote, null);
    assert.ok(Number.isFinite(Date.parse(l.observedAt)));
    assert.ok(l.evidence.sourcePage);
  }
  assert.deepEqual(c.quotes, []);
});
