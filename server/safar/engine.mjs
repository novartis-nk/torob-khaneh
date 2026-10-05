import { PROVIDERS } from './providers.mjs';
import { normalizeText } from '../engine.mjs';
const DAY = 86400000;
export const todayIran = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const addDays = (iso, n) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
function date(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) throw Error('invalid_trip:date');
  const d = new Date(`${s}T12:00:00Z`);
  if (!Number.isFinite(d.valueOf()) || d.toISOString().slice(0, 10) !== s)
    throw Error('invalid_trip:date');
  return s;
}
export function validateTrip(input = {}, now = new Date()) {
  const today = todayIran(now),
    checkin = date(input.checkin || addDays(today, 2)),
    checkout = date(input.checkout || addDays(checkin, 2));
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / DAY);
  if (checkin < today || checkin > addDays(today, 365) || nights < 1 || nights > 30)
    throw Error('invalid_trip:range');
  const adults = Number(input.adults ?? 4);
  if (!Number.isInteger(adults) || adults < 1 || adults > 16) throw Error('invalid_trip:adults');
  let children = Array.isArray(input.children)
    ? input.children
    : input.children
      ? String(input.children).split(',')
      : [];
  if (
    children.length > 6 ||
    children.some(
      (v) => v === '' || !Number.isInteger(Number(v)) || Number(v) < 0 || Number(v) > 17,
    )
  )
    throw Error('invalid_trip:children');
  children = children.map(Number).sort((a, b) => a - b);
  return { checkin, checkout, adults, children, guests: adults + children.length, nights };
}
export function quoteForTrip(quote, listing, trip, now = Date.now()) {
  if (
    !quote ||
    !Array.isArray(quote.children) ||
    !Array.isArray(quote.nightlyRates) ||
    quote.listingId !== listing.id ||
    quote.provider !== listing.provider ||
    quote.checkin !== trip.checkin ||
    quote.checkout !== trip.checkout ||
    quote.adults !== trip.adults ||
    JSON.stringify([...(quote.children || [])].sort((a, b) => a - b)) !==
      JSON.stringify(trip.children) ||
    quote.currency !== 'toman' ||
    quote.availability !== 'available' ||
    quote.feesComplete !== true ||
    !Number.isFinite(Date.parse(quote.expiresAt)) ||
    Date.parse(quote.expiresAt) <= now ||
    Date.parse(quote.observedAt) > now ||
    !Number.isFinite(Date.parse(quote.observedAt))
  )
    return null;
  const numbers = [
    quote.mandatoryFees,
    quote.extraGuestTotal,
    quote.discountTotal,
    ...(quote.nightlyRates || []),
  ];
  if (
    quote.nightlyRates?.length !== trip.nights ||
    numbers.some((n) => !Number.isSafeInteger(n) || n < 0)
  )
    return null;
  const total =
    quote.nightlyRates.reduce((a, b) => a + b, 0) +
    quote.mandatoryFees +
    quote.extraGuestTotal -
    quote.discountTotal;
  if (total <= 0 || !Number.isSafeInteger(total)) return null;
  return { ...quote, total };
}
export function searchSafar(catalog, input = {}, now = new Date()) {
  const trip = validateTrip(input, now),
    q = normalizeText(input.q || '');
  if (q.length > 200) throw Error('invalid_trip:query');
  const providers = [
    ...new Set(input.providers ? String(input.providers).split(',') : Object.keys(PROVIDERS)),
  ];
  if (providers.some((p) => !Object.hasOwn(PROVIDERS, p))) throw Error('invalid_trip:providers');
  const city = input.city || 'all';
  const type = input.type || 'all';
  if (!['all', 'villa', 'cottage', 'apartment', 'suite'].includes(type))
    throw Error('invalid_trip:type');
  const maxNightly =
    input.maxNightly == null || input.maxNightly === '' ? null : Number(input.maxNightly);
  const maxTotal = input.maxTotal == null || input.maxTotal === '' ? null : Number(input.maxTotal);
  if ([maxNightly, maxTotal].some((n) => n !== null && (!Number.isFinite(n) || n < 0 || n > 1e10)))
    throw Error('invalid_trip:budget');
  const sort = ['recommended', 'price', 'price-desc', 'newest'].includes(input.sort)
    ? input.sort
    : 'recommended';
  const quoteById = new Map((catalog.quotes || []).map((q) => [q.listingId, q]));
  let results = (catalog.listings || [])
    .filter(
      (l) =>
        providers.includes(l.provider) &&
        (city === 'all' || l.city === city) &&
        (type === 'all' || l.type === type) &&
        (!q || normalizeText(`${l.title} ${l.city || ''}`).includes(q)) &&
        (l.capacity === null || l.capacity >= trip.guests) &&
        (!input.knownCapacity || input.knownCapacity === 'false' || l.capacity !== null) &&
        (maxNightly === null || l.startingPrice <= maxNightly),
    )
    .map((l) => {
      const quote = quoteForTrip(quoteById.get(l.id), l, trip, now.valueOf());
      return {
        ...l,
        quote,
        priceStatus: quote ? 'confirmed' : 'starting_only',
        capacityStatus: l.capacity === null ? 'unknown' : 'fits',
        catalogAgeHours: Math.max(0, (now - Date.parse(l.observedAt)) / 3600000),
        stale: now - Date.parse(l.observedAt) > 86400000,
        needsConfirmation: [
          'موجودی در تاریخ سفر',
          'هزینهٔ نفر اضافه و کارمزدها',
          'قوانین لغو رزرو',
        ],
        reasons: [
          l.capacity !== null
            ? `ظرفیت اعلام‌شده تا ${l.capacity} نفر`
            : 'ظرفیت در دادهٔ عمومی مشخص نیست',
          `قیمت پایه از ${PROVIDERS[l.provider].name}`,
        ],
      };
    })
    .filter(
      (l) =>
        (!(input.confirmedOnly === 'true' || input.confirmedOnly === true) || !!l.quote) &&
        (maxTotal === null || l.quote?.total <= maxTotal),
    );
  if (sort === 'price' || sort === 'price-desc')
    results.sort(
      (a, b) =>
        (sort === 'price' ? 1 : -1) * (a.startingPrice - b.startingPrice) ||
        a.id.localeCompare(b.id),
    );
  else if (sort === 'newest')
    results.sort(
      (a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.id.localeCompare(b.id),
    );
  else {
    // Balanced source exploration, not an unvalidated cross-platform rating.
    const bins = Object.fromEntries(
      providers.map((p) => [
        p,
        results.filter((l) => l.provider === p).sort((a, b) => a.startingPrice - b.startingPrice),
      ]),
    );
    results = [];
    for (let i = 0; Object.values(bins).some((b) => b[i]); i++)
      for (const p of providers) if (bins[p][i]) results.push(bins[p][i]);
  }
  return {
    trip,
    results,
    total: results.length,
    sort,
    city,
    providerStatus: catalog.providers,
    updatedAt: catalog.updatedAt,
    coverage: 'selected_public_catalog',
    confirmedCount: results.filter((r) => r.quote).length,
    cities: [...new Set(catalog.listings.map((l) => l.city).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'fa'),
    ),
    filters: { providers, city, type, maxNightly, maxTotal, q },
  };
}
