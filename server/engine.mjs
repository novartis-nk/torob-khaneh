import { createHash } from 'node:crypto';

export const DISTRICTS = [
  'صادقیه',
  'ستارخان',
  'جنت آباد',
  'پونک',
  'شهرآرا',
  'یوسف آباد',
  'امیرآباد',
  'تهرانپارس',
];
export const SOURCES = {
  direct: 'آگهی مستقیم · نمونه',
  agency: 'آژانس محلی · نمونه',
  portal: 'وب‌سایت ملک · نمونه',
};
export const STALE_HOURS = 72;
export const digits = (value) =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (n) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(n))
    .replace(/[٠-٩]/g, (n) => '٠١٢٣٤٥٦٧٨٩'.indexOf(n));
export const normalizeText = (value) =>
  digits(value)
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function money(value, unit = 'toman') {
  if (value === null || value === undefined || value === '') throw new Error('missing_price');
  const text = normalizeText(value).replace(/[,٬]/g, '').replace(/٫/g, '.');
  if (!/^(?:\d+(?:\.\d+)?)\s*(?:(?:میلیون|میلیارد)\s*)?(?:تومان|ریال)?$/.test(text))
    throw new Error('invalid_price');
  let result = Number.parseFloat(text);
  if (text.includes('میلیارد')) result *= 1e9;
  else if (text.includes('میلیون')) result *= 1e6;
  if (text.includes('ریال') || (!text.includes('تومان') && unit === 'rial')) result /= 10;
  if (!Number.isSafeInteger(result) || result < 0 || result > 1e12)
    throw new Error('invalid_price');
  return result;
}
const num = (value) => Number(digits(value));
function bool(value) {
  if ([true, 'دارد', 'بله', 1].includes(value)) return true;
  if ([false, 'ندارد', 'خیر', 0].includes(value)) return false;
  return null;
}
export function normalizeOffer(raw) {
  let f;
  if (raw.schema === 'direct-v1')
    f = {
      ...raw,
      title: raw.title,
      area: raw.size,
      deposit: money(raw.deposit),
      rent: money(raw.rent),
    };
  else if (raw.schema === 'agency-v1')
    f = {
      ...raw,
      ...raw.property,
      deposit: money(raw.pricing?.deposit, 'rial'),
      rent: money(raw.pricing?.monthly, 'rial'),
    };
  else if (raw.schema === 'portal-v1')
    f = {
      ...raw,
      ...raw.attributes,
      deposit: money(raw.offer?.securityDeposit),
      rent: money(raw.offer?.monthlyRent),
    };
  else throw new Error('unsupported_schema');
  const district = normalizeText(f.district);
  if (!DISTRICTS.includes(district)) throw new Error('unknown_district');
  const observedAt = Date.parse(raw.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > Date.now() + 60_000)
    throw new Error('invalid_timestamp');
  const area = num(f.area),
    bedrooms = num(f.bedrooms),
    floor = num(f.floor);
  if (
    !Number.isFinite(area) ||
    area < 15 ||
    area > 1000 ||
    !Number.isInteger(bedrooms) ||
    bedrooms < 0 ||
    bedrooms > 10 ||
    !Number.isInteger(floor) ||
    floor < -2 ||
    floor > 60
  )
    throw new Error('invalid_property');
  if (!/^[a-z0-9-]{1,80}$/.test(raw.id) || !SOURCES[raw.source])
    throw new Error('invalid_identity');
  if (!/^\/images\/home-[1-6]\.jpg$/.test(f.image)) throw new Error('invalid_image');
  if (
    !Number.isFinite(f.lat) ||
    !Number.isFinite(f.lng) ||
    f.lat < 35.5 ||
    f.lat > 35.9 ||
    f.lng < 51.1 ||
    f.lng > 51.7
  )
    throw new Error('invalid_location');
  const metroMinutes = f.metroMinutes == null ? null : num(f.metroMinutes);
  if (
    metroMinutes !== null &&
    (!Number.isFinite(metroMinutes) || metroMinutes < 0 || metroMinutes > 180)
  )
    throw new Error('invalid_metro');
  return {
    id: raw.id,
    source: raw.source,
    sourceName: SOURCES[raw.source],
    title: String(f.title).slice(0, 160),
    district,
    area,
    bedrooms,
    floor,
    deposit: f.deposit,
    rent: f.rent,
    parking: bool(f.parking),
    elevator: bool(f.elevator),
    balcony: bool(f.balcony),
    metroMinutes,
    metroName: String(f.metroName || ''),
    year: num(f.year),
    lat: f.lat,
    lng: f.lng,
    image: f.image,
    imageFingerprint: String(f.imageFingerprint || ''),
    addressKey: normalizeText(f.addressKey || ''),
    observedAt,
    description: String(f.description || '').slice(0, 1000),
    sample: true,
  };
}
function sameHome(a, b) {
  // Deliberately conservative: photo evidence alone is insufficient.
  return Boolean(
    a.imageFingerprint &&
    a.addressKey &&
    a.imageFingerprint === b.imageFingerprint &&
    a.addressKey === b.addressKey &&
    a.district === b.district &&
    a.area === b.area &&
    a.bedrooms === b.bedrooms &&
    a.floor === b.floor &&
    Math.abs(a.lat - b.lat) < 0.0005 &&
    Math.abs(a.lng - b.lng) < 0.0005 &&
    a.parking === b.parking &&
    a.elevator === b.elevator,
  );
}
export function clusterOffers(offers) {
  const groups = [];
  for (const offer of [...offers].sort((a, b) => a.id.localeCompare(b.id))) {
    // Complete-link grouping prevents A~B~C chain merges.
    const group = groups.find((group) => group.every((other) => sameHome(other, offer)));
    if (group) group.push(offer);
    else groups.push([offer]);
  }
  return groups.map((group) => {
    const sorted = group.sort((a, b) => b.observedAt - a.observedAt || a.id.localeCompare(b.id));
    const canonical = sorted[0];
    const identity = [
      canonical.district,
      canonical.addressKey || canonical.id,
      canonical.area,
      canonical.bedrooms,
      canonical.floor,
      canonical.imageFingerprint,
    ].join('|');
    return {
      ...canonical,
      id: createHash('sha256').update(identity).digest('hex').slice(0, 12),
      offers: sorted,
      matchEvidence:
        group.length > 1
          ? [
              'اثر تصویر یکسان در دادهٔ نمونه',
              'نشانی، متراژ، اتاق و طبقه یکسان',
              'مختصات نزدیک و امکانات سازگار',
            ]
          : [],
    };
  });
}
const numberWords = { یک: 1, دو: 2, سه: 3, چهار: 4 };
export function parseIntent(input = '') {
  let q = normalizeText(input)
    .replace(/sadeghiyeh|sadeghie/g, 'صادقیه')
    .replace(/satarkhan/g, 'ستارخان')
    .replace(/ponak|poonak/g, 'پونک');
  const filters = {},
    chips = [],
    warnings = [];
  const districts = DISTRICTS.filter((d) => q.includes(d));
  if (districts.length) {
    filters.districts = districts;
    chips.push({ key: 'districts', label: districts.join(' یا ') });
  }
  let m = q.match(/(\d+|یک|دو|سه|چهار)\s*خواب/);
  if (m) {
    filters.bedrooms = numberWords[m[1]] ?? Number(m[1]);
    chips.push({ key: 'bedrooms', label: `${filters.bedrooms} خواب و بیشتر` });
  }
  for (const [key, term] of [
    ['maxDeposit', '(?:رهن|ودیعه)'],
    ['maxRent', 'اجاره'],
  ]) {
    m = q.match(
      new RegExp(
        `${term}\\s*(?:حداکثر|حد اکثر|تا|زیر|کمتر از)?\\s*(\\d+(?:[.٫]\\d+)?)\\s*(میلیون|میلیارد)?`,
      ),
    );
    if (m) {
      const amount = Number(m[1].replace('٫', '.')) * (m[2] === 'میلیارد' ? 1000 : 1);
      filters[key] = amount;
      chips.push({ key, label: `${key === 'maxRent' ? 'اجاره' : 'ودیعه'} تا ${amount} میلیون` });
      if (!m[2])
        warnings.push('عدد بودجه بدون واحد را میلیون تومان در نظر گرفتیم؛ فیلتر را بررسی کنید.');
    }
  }
  if (/رهن کامل/.test(q)) {
    filters.maxRent = 0;
    chips.push({ key: 'maxRent', label: 'رهن کامل' });
  }
  m = q.match(/(?:حداقل|بالای|بیشتر از)\s*(\d+)\s*متر/);
  if (m) {
    filters.minArea = Number(m[1]);
    chips.push({ key: 'minArea', label: `حداقل ${m[1]} متر` });
  }
  if (/(?:نزدیک|کنار)\s*(?:به\s*)?مترو/.test(q)) {
    filters.maxMetro = 12;
    chips.push({ key: 'maxMetro', label: 'تا ۱۲ دقیقه پیاده تا مترو' });
  }
  for (const [key, word] of [
    ['parking', 'پارکینگ'],
    ['elevator', 'آسانسور'],
    ['balcony', 'بالکن'],
  ]) {
    if (q.includes(word)) {
      if (new RegExp(`(?:بدون|بی)\\s*${word}|${word}\\s*(?:نمی ?خواهم|نمی ?خوام|مهم نیست)`).test(q))
        continue;
      filters[key] = true;
      chips.push({ key, label: word });
    }
  }
  const unsupported = [
    'ویلایی',
    'ویلا',
    'خرید',
    'فروش',
    'حیاط',
    'حیوان',
    'مدرسه',
    'محل کار',
    'نوساز',
    'آرام',
    'ساکت',
    'نورگیر',
    'لوکس',
    'مبله',
  ];
  const terms = unsupported.filter((w) => q.includes(w));
  if (terms.length)
    warnings.push(
      `این ویژگی‌ها هنوز قابل بررسی نیستند: ${terms.join('، ')}. در نتایج اعمال نشده‌اند.`,
    );
  if (q && !chips.length)
    warnings.push(
      'از این عبارت فیلتر قابل اتکایی استخراج نشد. محله، بودجه یا امکانات را مشخص کنید.',
    );
  return { filters, chips, warnings, engine: 'rules-v1', query: input };
}
export function validateFilters(input) {
  const result = {};
  const bounds = {
    maxDeposit: [0, 100000],
    maxRent: [0, 10000],
    minArea: [0, 1000],
    bedrooms: [0, 10],
    maxMetro: [0, 180],
    rate: [0, 5],
  };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (input[key] !== undefined && input[key] !== '') {
      const value = Number(digits(input[key]));
      if (!Number.isFinite(value) || value < min || value > max)
        throw new Error(`invalid_filter:${key}`);
      result[key] = value;
    }
  }
  for (const key of ['parking', 'elevator', 'balcony'])
    if (input[key] !== undefined) {
      if (![true, false, 'true', 'false'].includes(input[key]))
        throw new Error(`invalid_filter:${key}`);
      if (input[key] === true || input[key] === 'true') result[key] = true;
    }
  if (input.districts) {
    const values = Array.isArray(input.districts)
      ? input.districts
      : String(input.districts).split(',');
    if (values.some((d) => !DISTRICTS.includes(d))) throw new Error('invalid_filter:districts');
    if (values.length) result.districts = values;
  }
  return result;
}
export function searchHomes(homes, input = {}, now = Date.now()) {
  const intent = parseIntent(input.q || '');
  const filters = { ...intent.filters, ...validateFilters(input) };
  const rate = filters.rate ?? 1;
  const priced = (offer) => offer.rent + (offer.deposit * rate) / 100;
  const isFresh = (offer) => now - offer.observedAt <= STALE_HOURS * 3600000;
  const results = [];
  let staleExcluded = 0;
  for (const home of homes) {
    if (filters.districts?.length && !filters.districts.includes(home.district)) continue;
    if (filters.bedrooms !== undefined && home.bedrooms < filters.bedrooms) continue;
    if (filters.minArea !== undefined && home.area < filters.minArea) continue;
    if (
      filters.maxMetro !== undefined &&
      (home.metroMinutes === null || home.metroMinutes > filters.maxMetro)
    )
      continue;
    if (['parking', 'elevator', 'balcony'].some((key) => filters[key] && home[key] !== true))
      continue;
    const fresh = home.offers.filter(isFresh);
    staleExcluded += home.offers.length - fresh.length;
    const eligible = fresh.filter(
      (o) =>
        (filters.maxDeposit === undefined || o.deposit <= filters.maxDeposit * 1e6) &&
        (filters.maxRent === undefined || o.rent <= filters.maxRent * 1e6),
    );
    if (!eligible.length) continue;
    eligible.sort((a, b) => priced(a) - priced(b) || b.observedAt - a.observedAt);
    const best = eligible[0];
    const effective = priced(best);
    const components = {
      cost: Math.round(45 / (1 + effective / 25e6)),
      metro:
        home.metroMinutes === null ? 0 : Math.round(25 * Math.max(0, 1 - home.metroMinutes / 35)),
      freshness: Math.round(
        20 * Math.max(0, 1 - (now - best.observedAt) / (STALE_HOURS * 3600000)),
      ),
      completeness:
        [home.parking, home.elevator, home.balcony, home.metroMinutes].filter((v) => v !== null)
          .length * 2.5,
    };
    const score = Object.values(components).reduce((a, b) => a + b, 0);
    const reasons = [];
    if (filters.maxDeposit !== undefined || filters.maxRent !== undefined)
      reasons.push('ودیعه و اجارهٔ یک پیشنهاد، هر دو در بودجهٔ شما');
    if (home.metroMinutes !== null)
      reasons.push(`${home.metroMinutes} دقیقه پیاده تا متروی ${home.metroName}`);
    if (home.parking) reasons.push('پارکینگ دارد');
    const cautions = [];
    if (!home.elevator && home.floor > 1)
      cautions.push(
        `طبقهٔ ${home.floor}، ${home.elevator === null ? 'وضعیت آسانسور نامشخص' : 'بدون آسانسور'}`,
      );
    if (home.offers.some((o) => !isFresh(o)))
      cautions.push('پیشنهاد قدیمی از محاسبه کنار گذاشته شده');
    if (home.offers.some((o) => o.rent !== best.rent || o.deposit !== best.deposit))
      cautions.push('مبالغ منابع متفاوت است؛ پیش از تصمیم تأیید کنید');
    if (home.metroMinutes === null) cautions.push('فاصله تا مترو مشخص نیست');
    results.push({
      ...home,
      offers: home.offers.map((o) => ({
        ...o,
        stale: !isFresh(o),
        eligible: eligible.some((e) => e.id === o.id),
        effective: priced(o),
      })),
      best,
      effective,
      score,
      components,
      reasons: reasons.slice(0, 3),
      cautions,
      freshOfferCount: fresh.length,
    });
  }
  const sort = ['recommended', 'rent', 'deposit', 'newest', 'metro'].includes(input.sort)
    ? input.sort
    : 'recommended';
  results.sort(
    (a, b) =>
      (sort === 'rent'
        ? a.best.rent - b.best.rent
        : sort === 'deposit'
          ? a.best.deposit - b.best.deposit
          : sort === 'newest'
            ? b.best.observedAt - a.best.observedAt
            : sort === 'metro'
              ? (a.metroMinutes ?? Infinity) - (b.metroMinutes ?? Infinity)
              : b.score - a.score) || a.id.localeCompare(b.id),
  );
  return {
    results,
    intent,
    filters,
    sort,
    staleExcluded,
    total: results.length,
    sample: true,
    rate,
  };
}
