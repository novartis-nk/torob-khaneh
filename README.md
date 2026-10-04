# ترب خانه · Torob Khaneh

A working Persian rental-comparison prototype for Torob’s AI Product Engineer challenge. **One home, all its offers.** React + Node + SQLite, with source normalization, conservative duplicate grouping, explicit budget constraints and explainable ranking.

This is an independent prototype. Listings, prices, photos, coordinates and walk times are sample data. There is no live listing feed, real routing, owner contact, official Torob affiliation or runtime LLM.

## Run

Requires Node **22.13+** (tested with Node 25.2.1) and npm.

```sh
npm ci
npm run dev
# http://localhost:4317
```

For a production build:

```sh
npm run build
npm start
```

The server binds to `127.0.0.1` by default. Set `HOST=0.0.0.0` and `PORT` for a deliberate deployment. `DATABASE_PATH` overrides the SQLite location. Do not run development and production on the same port simultaneously.

The database initializes automatically from `data/offers.json` on first run. Node may print an experimental SQLite warning. All browser assets are local; no API key or third-party service is required.

## Refresh the demo clock

Sample observations age normally and become stale after 72 hours. To replay later:

```sh
npm run seed
npm run ingest -- data/offers.json
```

This regenerates synthetic observations and upserts the sample records. It is **not** a live price refresh. Existing saved home IDs remain stable because identity does not depend on observation timestamps. Ingestion is idempotent; absent records are not implicitly deleted.

## Try the core flow

1. Search `دو خواب، ودیعه تا ۶۰۰ میلیون، اجاره تا ۲۰ میلیون، نزدیک مترو`.
2. Inspect the three matching homes and editable constraint chips.
3. Open the Sadeghiyeh home’s offers. Inspect the old cheap quote, source evidence, grouping rationale and score components.
4. Compare two homes; change the personal deposit weight.
5. Save a home or search; refresh to verify browser-local persistence.
6. Set deposit to 1 million; observe that constraints are preserved and no results are invented.

## Validation

```sh
npm test                 # core invariants + persistence
npm run test:e2e         # browser flows, mobile, axe accessibility
npm run build
```

Browser tests use installed Google Chrome. If Chrome is unavailable, install Playwright Chromium with `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.mjs`. Browser tests assume the sample dataset is fresh; run the refresh commands above if testing after 72 hours.

## Demo and decision documents

- [Product rationale, assumptions, ranking formulas and validation plan](docs/PRODUCT.md)
- [Persian narration script, approximately four minutes](docs/DEMO.fa.md)
- [Engineering notes and limitations](docs/ENGINEERING.md)
- [Asset provenance](docs/ASSETS.md)
- [Verified checks and limits](docs/VERIFICATION.md)
- [Persian application note](docs/SUBMISSION.fa.md)
- [3:21 captioned product walkthrough](artifacts/torob-khaneh-demo.mp4), 4.3 MB
- `artifacts/desktop.png`, `artifacts/mobile.png`: verified screenshots

With the app running, `npm run demo` records a reproducible walkthrough. `ffmpeg` is required to export MP4. The recording is silent with Persian captions; the script above is available for a personal voiceover.

## Project layout

```text
server/engine.mjs      unit normalization, intent, grouping, ranking
server/store.mjs       SQLite ingestion, raw evidence, rejection handling
server/index.mjs       API, development middleware, production serving
src/                   RTL React interface and responsive styles
data/offers.json        three authored source formats, fixed observations
scripts/seed.mjs        deterministic scenario generation with current clock
scripts/ingest.mjs      explicit batch ingestion command
tests/                 invariant tests and browser journeys
docs/                  decisions, demo script, limits and evidence
```

## Application status

The product can be reviewed and recorded locally. Publishing a repository/deployment and sending the application are separate actions. No application is submitted by this project. Applicant identity and claims of experience are not fabricated.
