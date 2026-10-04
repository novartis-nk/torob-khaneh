import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fa = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const now = Date.now();
const specs = [
  // district, area, beds, deposit M, rent M, metro minutes, floor, elevator, parking, balcony, image
  ['صادقیه', 85, 2, 500, 18, 7, 3, true, true, true, 1],
  ['ستارخان', 78, 2, 400, 19, 11, 2, true, true, false, 2],
  ['جنت آباد', 96, 2, 700, 20, 24, 4, true, true, true, 3],
  ['پونک', 110, 2, 850, 26, 28, 2, true, true, true, 4],
  ['شهرآرا', 72, 1, 350, 16, 9, 3, false, false, true, 5],
  ['یوسف آباد', 90, 2, 800, 30, 15, 2, true, true, false, 6],
  ['امیرآباد', 65, 1, 300, 17, 18, 1, false, false, false, 2],
  ['صادقیه', 68, 1, 400, 14, 5, 1, true, false, true, 3],
  ['تهرانپارس', 88, 2, 550, 19, 8, 3, true, true, true, 4],
  ['ستارخان', 82, 2, 1200, 0, 12, 4, true, true, false, 5],
  ['جنت آباد', 75, 2, 450, 18, 22, 2, true, null, false, 6],
  ['صادقیه', 85, 2, 480, 22, 7, 4, true, true, true, 1],
  ['شهرآرا', 100, 2, 650, 25, null, 2, true, true, true, 3],
  ['پونک', 60, 1, 250, 15, 30, 3, false, false, false, 2],
];
const geo = {
  صادقیه: [35.721, 51.335],
  ستارخان: [35.718, 51.352],
  'جنت آباد': [35.756, 51.308],
  پونک: [35.761, 51.335],
  شهرآرا: [35.729, 51.367],
  'یوسف آباد': [35.737, 51.407],
  امیرآباد: [35.735, 51.386],
  تهرانپارس: [35.737, 51.533],
};
const stations = {
  صادقیه: 'صادقیه',
  ستارخان: 'شادمان',
  'جنت آباد': 'اشرفی اصفهانی',
  پونک: 'میدان صنعت',
  شهرآرا: 'دانشگاه تربیت مدرس',
  'یوسف آباد': 'میدان جهاد',
  امیرآباد: 'کارگر',
  تهرانپارس: 'تهرانپارس',
};
const raw = [];
for (const [index, s] of specs.entries()) {
  const [
    district,
    area,
    bedrooms,
    dep,
    rent,
    metroMinutes,
    floor,
    elevator,
    parking,
    balcony,
    img,
  ] = s;
  const id = `h${index + 1}`;
  const property = {
    title: `آپارتمان ${fa(area)} متری ${district}`,
    district,
    area,
    bedrooms,
    floor,
    elevator,
    parking,
    balcony,
    metroMinutes,
    metroName: stations[district],
    year: 1394 + (index % 9),
    lat: geo[district][0] + index * 0.0001,
    lng: geo[district][1] + index * 0.0001,
    image: `/images/home-${img}.jpg`,
    imageFingerprint: `sample-photo-${index === 11 ? 0 : index}`,
    addressKey: `خیابان نمونه ${fa(index === 11 ? 1 : index + 1)}`,
    description:
      'این ملک و اطلاعات آن برای ارزیابی محصول ساخته شده‌اند. تصویر تزئینی است و آگهی واقعی قابل تماس نیست.',
  };
  const count = index < 3 ? 3 : index % 3 === 0 ? 1 : 2;
  for (let j = 0; j < count; j++) {
    const source = ['direct', 'agency', 'portal'][j];
    // h1's cheap third offer is stale; h2 has a genuine deposit/rent tradeoff.
    const stale = (index === 0 && j === 2) || index === 13;
    const deposit = dep + (j === 1 ? 50 : 0),
      monthly = rent === 0 ? 0 : rent + (j === 1 ? -1 : j === 2 ? -5 : 0);
    const common = {
      id: `${id}-${source}`,
      source,
      schema: `${source}-v1`,
      observedAt: new Date(now - (stale ? 110 : 2 + index * 2 + j * 5) * 3600000).toISOString(),
    };
    if (source === 'direct')
      raw.push({
        ...common,
        ...property,
        size: fa(area),
        deposit: `${fa(deposit)} میلیون تومان`,
        rent: `${fa(monthly)} میلیون تومان`,
        parking: parking === null ? null : parking ? 'دارد' : 'ندارد',
      });
    else if (source === 'agency')
      raw.push({
        ...common,
        property: {
          ...property,
          title: `${fa(area)} متر ${fa(bedrooms)} خواب در ${district}`,
          area: fa(area),
        },
        pricing: { deposit: deposit * 1e7, monthly: monthly * 1e7, currency: 'IRR' },
      });
    else
      raw.push({
        ...common,
        attributes: property,
        offer: {
          securityDeposit: `${deposit} میلیون تومان`,
          monthlyRent: `${monthly} میلیون تومان`,
        },
      });
  }
}
raw.push({ ...raw[0], id: 'bad-price', deposit: 'توافقی' });
writeFileSync(
  fileURLToPath(new URL('../data/offers.json', import.meta.url)),
  JSON.stringify(
    {
      schemaVersion: 1,
      sample: true,
      generatedAt: new Date(now).toISOString(),
      description: 'Authored synthetic offers, not scraped or live. Images are illustrative.',
      offers: raw,
    },
    null,
    2,
  ),
);
console.log(`Wrote ${raw.length} raw sample offers in three source formats.`);
