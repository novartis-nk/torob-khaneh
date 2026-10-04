import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  money,
  normalizeOffer,
  clusterOffers,
  parseIntent,
  searchHomes,
  validateFilters,
} from '../server/engine.mjs';
import { openStore, ingest, loadHomes } from '../server/store.mjs';
const dataset = JSON.parse(readFileSync(new URL('../data/offers.json', import.meta.url)));
const now = Date.parse(dataset.generatedAt);
const raw = dataset.offers[0];
const offers = dataset.offers.filter((o) => o.id !== 'bad-price').map(normalizeOffer);
const homes = clusterOffers(offers);
test('Persian and Arabic digits, decimal magnitudes and rials normalize exactly', () => {
  assert.equal(money('۵۰۰ میلیون تومان'), 500e6);
  assert.equal(money('١٫٢ میلیارد تومان'), 1200e6);
  assert.equal(money('۵٬۰۰۰٬۰۰۰٬۰۰۰ ریال'), 500e6);
  assert.equal(money(5e9, 'rial'), 500e6);
  assert.equal(money('۰'), 0);
});
test('unknown, negative and missing prices never become zero', () => {
  for (const value of [null, undefined, '', 'توافقی', '-1', '5junk', '1.1'])
    assert.throws(() => money(value));
});
test('all three schemas have explicit units and provenance', () => {
  for (const o of offers.slice(0, 3)) {
    assert.equal(o.district, 'صادقیه');
    assert.ok(o.deposit >= 500e6);
    assert.ok(o.sourceName);
    assert.ok(o.observedAt);
  }
});
test('invalid records are rejected, including impossible future timestamps', () => {
  assert.throws(() => normalizeOffer({ ...raw, observedAt: 'bad' }));
  assert.throws(() =>
    normalizeOffer({ ...raw, observedAt: new Date(Date.now() + 3600000).toISOString() }),
  );
  assert.throws(() => normalizeOffer({ ...raw, size: 0 }));
});
test('27 valid offers cluster into 14 distinct homes', () => {
  assert.equal(offers.length, 27);
  assert.equal(homes.length, 14);
  assert.equal(homes.find((h) => h.offers.some((o) => o.id === 'h1-direct')).offers.length, 3);
});
test('same photo, area and neighborhood with a different floor stay separate', () => {
  const a = offers[0],
    b = { ...a, id: 'different-floor', floor: a.floor + 1 };
  assert.equal(clusterOffers([a, b]).length, 2);
});
test('missing identity evidence never merges unrelated units', () => {
  const a = { ...offers[0], imageFingerprint: '' },
    b = { ...a, id: 'other' };
  assert.equal(clusterOffers([a, b]).length, 2);
});
test('a proximity chain does not create transitive false matches', () => {
  const a = offers[0];
  const b = { ...a, id: 'b', lat: a.lat + 0.0004 };
  const c = { ...a, id: 'c', lat: a.lat + 0.0008 };
  assert.equal(clusterOffers([a, b, c]).length, 2);
});
test('inconsistent parking data does not merge', () => {
  const a = offers[0];
  assert.equal(clusterOffers([a, { ...a, id: 'contradiction', parking: !a.parking }]).length, 2);
});
test('Persian user intent extracts visible, editable hard constraints', () => {
  const p = parseIntent('دو خواب، ودیعه تا ۶۰۰ میلیون، اجاره تا ۲۰ میلیون، نزدیک مترو');
  assert.deepEqual(p.filters, { bedrooms: 2, maxDeposit: 600, maxRent: 20, maxMetro: 12 });
  assert.equal(p.engine, 'rules-v1');
});
test('Arabic spelling, Finglish and billions normalize', () => {
  assert.deepEqual(parseIntent('صادقيه پاركينگ ودیعه تا ۱٫۲ میلیارد').filters, {
    districts: ['صادقیه'],
    maxDeposit: 1200,
    parking: true,
  });
  assert.deepEqual(parseIntent('sadeghiyeh').filters.districts, ['صادقیه']);
});
test('full deposit is zero rent, not an absent budget', () => {
  assert.equal(parseIntent('رهن کامل').filters.maxRent, 0);
  assert.ok(searchHomes(homes, { q: 'رهن کامل' }, now).results.every((h) => h.best.rent === 0));
});
test('unsupported requirements are disclosed', () => {
  assert.ok(parseIntent('آرام نزدیک مدرسه').warnings.length > 0);
  assert.ok(parseIntent('نان').warnings.length > 0);
});
test('malformed and out-of-range filters fail closed', () => {
  for (const value of ['NaN', '-1', 'Infinity', '100001'])
    assert.throws(() => validateFilters({ maxDeposit: value }));
  assert.throws(() => validateFilters({ districts: 'unknown' }));
  assert.throws(() => validateFilters({ rate: 6 }));
});
test('same offer must meet BOTH deposit and rent budgets', () => {
  const a = offers[0];
  const home = {
    ...a,
    id: 'test',
    offers: [
      { ...a, id: 'a', deposit: 300e6, rent: 30e6 },
      { ...a, id: 'b', deposit: 900e6, rent: 10e6 },
    ],
  };
  assert.equal(searchHomes([home], { maxDeposit: 500, maxRent: 20 }, now).total, 0);
});
test('stale cheap offers cannot drive the headline price', () => {
  const h = searchHomes(homes, {}, now).results.find((h) =>
    h.offers.some((o) => o.id === 'h1-direct'),
  );
  assert.notEqual(h.best.id, 'h1-portal');
  assert.equal(h.offers.find((o) => o.id === 'h1-portal').stale, true);
  assert.ok(h.cautions.some((c) => c.includes('قدیمی')));
});
test('stale-only homes are not searchable', () => {
  assert.equal(
    searchHomes(homes, {}, now).results.some((h) => h.offers.some((o) => o.id === 'h14-direct')),
    false,
  );
});
test('unknown amenity fails a required amenity filter', () => {
  const result = searchHomes(homes, { parking: true }, now);
  assert.ok(result.results.every((h) => h.parking === true));
});
test('hard filters are never automatically relaxed', () => {
  const result = searchHomes(homes, { maxDeposit: 1, maxRent: 1 }, now);
  assert.equal(result.total, 0);
  assert.equal(result.filters.maxDeposit, 1);
});
test('score is finite and its explanation reconciles', () => {
  for (const h of searchHomes(homes, {}, now).results) {
    assert.equal(
      h.score,
      Object.values(h.components).reduce((a, b) => a + b),
    );
    assert.ok(h.score >= 0 && h.score <= 100);
    assert.ok(h.reasons.length);
  }
});
test('personal deposit weight changes selection, not raw offer values', () => {
  const original = JSON.stringify(homes);
  const a = searchHomes(homes, { rate: 0 }, now),
    b = searchHomes(homes, { rate: 5 }, now);
  assert.notDeepEqual(
    a.results.map((h) => h.best.id),
    b.results.map((h) => h.best.id),
  );
  assert.equal(JSON.stringify(homes), original);
});
test('explicit sort order is stable and respects selected offer', () => {
  const result = searchHomes(homes, { sort: 'rent' }, now).results;
  for (let i = 1; i < result.length; i++) assert.ok(result[i].best.rent >= result[i - 1].best.rent);
  assert.deepEqual(
    result.map((h) => h.id),
    searchHomes(homes, { sort: 'rent' }, now).results.map((h) => h.id),
  );
});
test('ingestion persists raw evidence, quarantines bad prices and is idempotent', () => {
  const db = openStore(':memory:');
  try {
    assert.deepEqual(ingest(db, dataset), { accepted: 27, rejected: 1 });
    ingest(db, dataset);
    assert.equal(loadHomes(db).length, 14);
    assert.equal(db.prepare('SELECT count(*) AS n FROM offers').get().n, 27);
    assert.equal(db.prepare('SELECT reason FROM rejected').get().reason, 'invalid_price');
    assert.equal(
      JSON.parse(db.prepare('SELECT raw FROM offers WHERE id=?').get('h1-direct').raw).deposit,
      '۵۰۰ میلیون تومان',
    );
  } finally {
    db.close();
  }
});
test('a newly invalid observation removes a formerly valid quote', () => {
  const db = openStore(':memory:');
  try {
    ingest(db, { ...dataset, offers: [raw] });
    ingest(db, { ...dataset, offers: [{ ...raw, deposit: 'توافقی' }] });
    assert.equal(loadHomes(db).length, 0);
  } finally {
    db.close();
  }
});
