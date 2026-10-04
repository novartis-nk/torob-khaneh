import { openStore, ingest, loadDataset } from '../server/store.mjs';
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/ingest.mjs data/offers.json');
  process.exit(1);
}
const db = openStore(process.env.DATABASE_PATH || 'data/catalog.sqlite');
try {
  console.log(ingest(db, loadDataset(file)));
} finally {
  db.close();
}
