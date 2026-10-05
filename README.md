# ترب خانه + سفر · Torob Khaneh & Safar

A working Persian rental-comparison prototype for Torob’s AI Product Engineer challenge. **One home, all its offers.** React + Python + SQLite, with source normalization, conservative duplicate grouping, explicit budget constraints, explainable ranking and a crawl-source request queue.

The minimal search landing page at `/` has **اجاره و خرید** and **سفر** tabs. Submitting a search opens the selected service with the query or explicit destination/type filters. The housing catalog currently supports rentals, not purchases. Existing housing search links at `/?q=…` continue to work.

Two services share the interface:

- **خانه** at `/khaneh`: synthetic long-term rental data, conservative duplicate grouping and explainable ranking.
- **سفر** at `/safar`: a real public catalog snapshot from Jabama, Otaghak and Jajiga, Persian trip dates, guests, source filters, bookmarks and shareable property comparisons.

This is an independent prototype without official Torob affiliation or a runtime LLM. Housing listings, prices, photos, coordinates and walk times are synthetic. Safar has 75 observed listings in Ramsar and surroundings; nightly starting prices do not establish date-specific availability or a final trip price. No live booking/quote integration is connected. See [Safar decisions and source limits](docs/SAFAR.md).

## Run

Requires Python **3.11+**, Node **22.13+** and npm. The Python runtime uses only the standard library.

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

The Python server binds to `127.0.0.1` by default. In development it runs on port 4318 behind Vite's `/api` proxy; the site remains at port 4317. Set `HOST=0.0.0.0` and `PORT` for a deliberate production deployment. `DATABASE_PATH` overrides the SQLite location. Do not run development and production on the same port simultaneously.

The database initializes automatically from `data/offers.json` on first run. The checked-in snapshots run without an API key. Fonts, the Torob logo and selected property images are local; uncached Safar photographs may load from provider CDNs.

## Requesting a new crawl source

The landing page has a **درخواست افزودن سایت** flow. It sends `POST /api/crawl-requests` with a public website URL, vertical and optional note. The backend validates and canonicalizes the URL, stores an idempotent queued job in SQLite, and returns a tracking ID. `GET /api/crawl-requests/:id` reads its state.

Submitting a request does not fetch the URL inside the HTTP request. A production worker would claim the queued job only after access rules and source quality are reviewed, then select a registered adapter. This avoids turning a public form into an arbitrary URL fetcher.

## Refresh the Safar catalog

```sh
npm run safar:refresh
```

This explicitly refreshes the first public Ramsar result page from each provider; it does not request dated quotes or make bookings. Chrome and curl are required. Failed sources retain their prior observation times and show a cached status. Full details are in [docs/SAFAR.md](docs/SAFAR.md).

## Refresh the housing demo clock

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
npm test                 # Python backend invariants + persistence
npm run test:e2e         # browser flows, mobile, axe accessibility
npm run build
```

Browser tests use installed Google Chrome. If Chrome is unavailable, install Playwright Chromium with `npx playwright install chromium` and remove `channel: 'chrome'` from `playwright.config.mjs`. Browser tests assume the sample dataset is fresh; run the refresh commands above if testing after 72 hours.

## Demo and decision documents

- [Safar market choice, assumptions, implementation and quote-access boundaries](docs/SAFAR.md)
- [Product rationale, assumptions, ranking formulas and validation plan](docs/PRODUCT.md)
- [Persian narration script, approximately four minutes](docs/DEMO.fa.md)
- [Engineering notes and limitations](docs/ENGINEERING.md)
- [Asset provenance](docs/ASSETS.md)
- [Verified checks and limits](docs/VERIFICATION.md)
- [Persian application note](docs/SUBMISSION.fa.md)
- [Combined housing + Safar walkthrough](artifacts/torob-khaneh-safar-demo.mp4), under five minutes
- [Safar walkthrough](artifacts/torob-safar-demo.mp4)
- [Original 3:21 housing walkthrough](artifacts/torob-khaneh-demo.mp4), 4.3 MB
- `artifacts/desktop.png`, `artifacts/mobile.png`: verified screenshots

The existing videos demonstrate the result pages and predate the minimal landing page. `artifacts/landing-desktop.png` and `artifacts/landing-mobile.png` show the new entry page.

With the app running, `npm run demo` records housing. `npm run demo:safar` records Safar and joins it to the existing housing video. `ffmpeg` is required to export MP4. The recording is silent with Persian captions; the script above is available for a personal voiceover.

## Project layout

```text
backend/adapters.py    source Adapter implementations and registry
backend/ranking.py     pluggable ranking Strategy registry
backend/housing.py     intent, grouping, eligibility and search service
backend/travel.py      trip validation and public-catalog search service
backend/crawl.py       validated crawl-source request application service
backend/repository.py  SQLite Repository for evidence and crawl jobs
backend/app.py         Python HTTP API and production static serving
src/                   RTL React interface and responsive styles
data/offers.json        three authored source formats, fixed observations
scripts/seed.mjs        deterministic scenario generation with current clock
tests/                 invariant tests and browser journeys
docs/                  decisions, demo script, limits and evidence
```

## Application status

The product can be reviewed and recorded locally. Publishing a repository/deployment and sending the application are separate actions. No application is submitted by this project. Applicant identity and claims of experience are not fabricated.
