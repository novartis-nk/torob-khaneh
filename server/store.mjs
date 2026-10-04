import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { normalizeOffer, clusterOffers } from './engine.mjs';
export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, raw TEXT NOT NULL, normalized TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rejected (id TEXT PRIMARY KEY, reason TEXT NOT NULL); CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);',
  );
  return db;
}
export function ingest(db, dataset) {
  if (!dataset.sample || !Array.isArray(dataset.offers) || dataset.offers.length > 5000)
    throw new Error('invalid_dataset');
  const upsert = db.prepare(
    'INSERT INTO offers VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET raw=excluded.raw, normalized=excluded.normalized',
  );
  const reject = db.prepare('INSERT OR REPLACE INTO rejected VALUES (?,?)');
  let accepted = 0,
    rejected = 0;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [i, raw] of dataset.offers.entries()) {
      const id = raw?.id || `invalid-${i}`;
      try {
        const normalized = normalizeOffer(raw);
        upsert.run(id, JSON.stringify(raw), JSON.stringify(normalized));
        db.prepare('DELETE FROM rejected WHERE id=?').run(id);
        accepted++;
      } catch (error) {
        reject.run(String(id), error.message);
        db.prepare('DELETE FROM offers WHERE id=?').run(String(id));
        rejected++;
      }
    }
    db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run(
      'generatedAt',
      dataset.generatedAt,
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { accepted, rejected };
}
export const loadDataset = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const loadHomes = (db) =>
  clusterOffers(
    db
      .prepare('SELECT normalized FROM offers ORDER BY id')
      .all()
      .map((row) => JSON.parse(row.normalized)),
  );
export function getStats(db, homes) {
  const sourceCounts = db
    .prepare('SELECT normalized FROM offers')
    .all()
    .map((r) => JSON.parse(r.normalized))
    .reduce((all, o) => ({ ...all, [o.source]: (all[o.source] || 0) + 1 }), {});
  return {
    rawCount:
      db.prepare('SELECT count(*) AS n FROM offers').get().n +
      db.prepare('SELECT count(*) AS n FROM rejected').get().n,
    offerCount: db.prepare('SELECT count(*) AS n FROM offers').get().n,
    homeCount: homes.length,
    sourceCounts,
    rejected: db.prepare('SELECT * FROM rejected').all(),
    generatedAt: db.prepare('SELECT value FROM metadata WHERE key=?').get('generatedAt')?.value,
    sample: true,
  };
}
