import { load } from 'cheerio';
import { digits, normalizeText } from '../engine.mjs';
import { PROVIDERS } from './providers.mjs';
export { PROVIDERS } from './providers.mjs';
const integer = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(digits(value).replace(/[,٬\s]/g, ''));
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};
export function safeProviderUrl(provider, value, image = false) {
  try {
    const cfg = PROVIDERS[provider],
      url = new URL(value, cfg.origin);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const hosts = image ? cfg.imageHosts : [new URL(cfg.origin).hostname];
    if (!hosts.includes(url.hostname)) return null;
    if (!image && !/^\/(?:stay\/[a-z]+-\d+|room\/\d+)\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
function record(provider, raw, observedAt) {
  const url = safeProviderUrl(provider, raw.url);
  const sourceId = url?.match(/(?:-|\/)(\d+)\/?(?:\?|$)/)?.[1];
  const price = integer(raw.startingPrice);
  if (!url || !sourceId || !raw.title || !price || price > 1e10) return null;
  const title = normalizeText(raw.title).replace(/^اجاره\s*/, ''),
    city = normalizeText(raw.city || '');
  const capacity = raw.capacity == null ? null : integer(raw.capacity);
  const bedrooms = raw.bedrooms == null ? null : integer(raw.bedrooms);
  const rating = Number(raw.rating),
    reviews = integer(raw.reviews);
  const type = title.includes('کلبه')
    ? 'cottage'
    : title.includes('ویلا')
      ? 'villa'
      : title.includes('آپارتمان')
        ? 'apartment'
        : 'suite';
  const features = ['استخر', 'جکوزی', 'ساحلی', 'جنگلی'].filter((f) => title.includes(f));
  return {
    id: `${provider}-${sourceId}`,
    provider,
    sourceId,
    url,
    title,
    city: city || null,
    searchArea: 'رامسر و اطراف',
    type,
    bedrooms,
    capacity: capacity && capacity <= 100 ? capacity : null,
    startingPrice: price,
    currency: 'toman',
    priceKind: 'starting_nightly',
    rating: rating > 0 && rating <= 5 ? rating : null,
    reviews: reviews ?? null,
    features,
    image: safeProviderUrl(provider, raw.image, true),
    sourceImage: safeProviderUrl(provider, raw.image, true),
    observedAt,
    availability: 'unknown',
    cancellation: null,
    mandatoryFees: null,
    tripQuote: null,
    evidence: {
      sourcePage: PROVIDERS[provider].catalog,
      adapterVersion: 'public-catalog-v1',
      priceLabel: 'هر شب از / شروع از',
      featureBasis: 'listing_title',
    },
  };
}
function nextData($) {
  try {
    return JSON.parse($('#__NEXT_DATA__').text()).props?.pageProps || {};
  } catch {
    return {};
  }
}
export function parseCatalog(provider, html, observedAt = new Date().toISOString()) {
  if (!Object.hasOwn(PROVIDERS, provider) || !Number.isFinite(Date.parse(observedAt)))
    throw Error('invalid_catalog');
  const $ = load(html);
  const rows = [];
  if (provider === 'otaghak') {
    const data = nextData($);
    const rooms =
      data.searchRoomsResult?.rooms || data.homePageDataRes?.flatMap((s) => s.rooms || []) || [];
    for (const r of rooms) {
      const file = r.roomMediaTitles?.mainImageTitle || r.mainImageTitle;
      rows.push(
        record(
          provider,
          {
            url: `/room/${r.roomId || r.id}/`,
            title: `${r.roomTypeName || ''} ${r.roomName || ''}`,
            city: r.cityFaName,
            bedrooms: r.bedRoom,
            capacity:
              r.totalPersonCapacity ??
              (Number.isFinite(r.personCapacity)
                ? r.personCapacity + (r.extraPersonCapacity || 0)
                : null),
            startingPrice: r.afterDiscount > 0 ? r.afterDiscount : r.basePrice,
            rating: r.rate,
            reviews: r.commentsCount,
            image: file ? `https://cdn.otaghak.com/otg-images-new/X500/${file}` : null,
          },
          observedAt,
        ),
      );
    }
  }
  if (provider === 'jajiga') {
    const rooms = nextData($).initialData?.rooms?.items || [];
    for (const r of rooms)
      if (r.id)
        rows.push(
          record(
            provider,
            {
              url: r.url,
              title: r.title,
              city: r.cityName,
              bedrooms: r.bedrooms ?? r.roomNumber,
              capacity: r.maxGuestNumber,
              startingPrice: r.priceAfterDiscount || r.price,
              rating: r.rating?.total,
              reviews: r.rating?.count,
              image: r.pictures?.items?.[0]?.url
                ? `https://storage.jajiga.com/public/pictures/medium/${r.pictures.items[0].url}`
                : null,
            },
            observedAt,
          ),
        );
  }
  if (provider === 'jabama' || provider === 'jajiga') {
    const selector = provider === 'jabama' ? 'a[href*="/stay/"]' : 'a[href*="/room/"]';
    $(selector).each((_, el) => {
      const a = $(el),
        title = a.find('h2,h3').first().text().trim() || a.find('img').first().attr('alt');
      // Do not parse installment amounts or struck-through old prices as the current teaser.
      const footer = a.find('footer').clone();
      footer.find('del,s').remove();
      const text = digits(a.text()),
        priceText = provider === 'jabama' ? digits(footer.text()) : text;
      const amounts = [...priceText.matchAll(/([\d٬,]+)\s*تومان/g)];
      const capacity = text.match(/(\d+)\s*نفر پایه(?:\s*\+\s*(\d+)\s*نفر اضافه)?/);
      const rating = text.match(/([0-5](?:\.\d+)?)\s*\((\d+)\s*(?:نظر|دیدگاه)\)/);
      const city =
        provider === 'jabama'
          ? text.match(/استان\s*[^،]+،\s*([^\.]+?)(?:\s*\.|$)/)?.[1]?.trim()
          : ['سادات شهر', 'چابکسر', 'جواهرده', 'تنکابن', 'شیرود', 'کتالم', 'رامسر'].find((c) =>
              title?.includes(c),
            );
      rows.push(
        record(
          provider,
          {
            url: a.attr('href'),
            title,
            city,
            startingPrice: amounts.at(-1)?.[1],
            capacity: capacity
              ? Number(capacity[1]) + Number(capacity[2] || 0)
              : text.match(/تا\s*(\d+)\s*مهمان/)?.[1],
            bedrooms: text.match(/(\d+)\s*(?:خوابه|اتاق)/)?.[1],
            rating: rating?.[1],
            reviews: rating?.[2],
            image: a
              .find(provider === 'jabama' ? 'img.object-cover' : 'img')
              .toArray()
              .map((i) => $(i).attr('src'))
              .find((url) => safeProviderUrl(provider, url, true)),
          },
          observedAt,
        ),
      );
    });
  }
  const unique = new Map();
  for (const row of rows) if (row && !unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()];
}
