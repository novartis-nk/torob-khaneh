# ترب سفر — implemented short-stay catalog comparison

Safar is available at `/safar`, alongside long-term housing at `/khaneh`, with a shared minimal search landing page at `/`. It uses the same Persian RTL, restrained red/white interface, source attribution and comparison patterns. This is an independent prototype for the Torob challenge.

## Why this market and scope

**Hypothesis:** travelers repeat destination searches across booking sites, collect inconsistent prices and share screenshots to decide with companions. A source-attributed shortlist reduces that work. This is a product hypothesis, not a finding from user interviews.

Short stays fit Torob's comparison-and-handoff model: a traveler has a concrete trip, multiple sources and a decision to make. Start with **Ramsar and surroundings**, three sources, and one discovery-to-shortlist flow. Geographic concentration makes source coverage and field quality inspectable. We preserve nearby cities returned by a provider instead of claiming that all records are inside Ramsar.

Long-term housing remains a separate service because deposit/monthly rent and nightly accommodation have different budgets, identities and availability rules. The shared shell makes both accessible without mixing their price models.

The current promise is **«اقامتگاه‌های چند سایت را کنار هم ببین؛ آگاهانه انتخاب کن.»** We do not yet promise “the cheapest seller of the same unit”: overlap and unit identity have not been verified.

## Implemented

- Public first-result-page adapters for [Jabama](https://www.jabama.com/city-ramsar), [Otaghak](https://www.otaghak.com/city/ramsar/) and [Jajiga](https://www.jajiga.com/s/ramsar).
- Snapshot captured October 5, 2026: **75 listings** — Jabama 36, Otaghak 24, Jajiga 15. Counts vary on refresh. This is a bounded catalog sample, not complete platform inventory.
- Exact Gregorian date storage with a Persian calendar UI, Saturday-first weeks, Tehran day boundary, a 365-day arrival horizon and 1–30-night stays.
- Adults and child ages, conservative capacity filtering, destination, property type, title search, provider selection and nightly starting-price limits.
- Explicit source and observation time on every card, attributed ratings, original listing URLs, honest unknown fields and broken-image fallbacks.
- «سفر من» bookmarks in browser-local storage; up to three different properties in comparison; share links reproduce dates, guests, filters and comparison IDs.
- Request cancellation, API error/retry states, invalid-trip recovery, empty states, mobile filters and keyboard-accessible dialogs.
- A quote-validation boundary for future exact-trip feeds. **No live quote feed is connected.** The confirmed-total filter therefore returns no results for the supplied snapshot.

Title search is normalized substring matching, not an LLM. The default order alternates providers and sorts by starting price within each provider. There is no blended review score or unvalidated suitability prediction.

## Price and identity decisions

A published starting price is not a quote for the chosen dates. Multiplying it by nights can omit weekend rates, extra guests, children, cleaning/service fees and unavailable nights. The UI deliberately leaves the total unknown and asks the user to confirm it at the source.

A future normalized quote must match listing, provider, check-in, check-out, adults, child ages and currency. It must include availability, all nightly rates, mandatory fees, extra-guest charges, discounts, observation and future expiry. Unknown or malformed values fail closed. Tests verify that a quote for a different party/date or an expired/incomplete quote cannot pass the confirmed-total filter.

`total = sum(nightly rates) + mandatory fees + extra guest total − verified discount total`

This contract does not invent cancellation terms, rate-plan equivalence or refundable deposit requirements. Those still need an explicit future source contract. Cards and comparison in this release are designed for the public snapshot; connecting live quotes also requires updating the entire UI, not only populating the data file.

No cross-provider grouping is performed. Similar names, the same building or reused photographs are insufficient evidence of the same rentable unit. Provider-native listing IDs remain stable within a source.

## Refresh and failure behavior

```sh
npm run safar:refresh
```

Requires installed Google Chrome (or set `PLAYWRIGHT_CHANNEL` to an available channel), Playwright and curl. The script reads public destination pages sequentially, hydrates photographs on the already-discovered first page and caps each source at 36 records. It does not log in, call private APIs, request booking availability or initiate bookings.

Each adapter normalizes a source page to `data/safar-catalog.json`. On a provider failure, the previous records and their original observation times are retained and marked cached; absence of prior data is marked unavailable. File replacement is atomic. Observations older than 24 hours receive a visible stale label. This is a disclosure threshold, not a guarantee that younger prices are current.

Image URLs are restricted to known provider CDNs; locally cached photos remain attributed to their sources. Other photos may load from those CDNs. Jabama installment amounts and decorative icons are explicitly excluded from the nightly-price/photo extraction. Missing prices are rejected, never converted to zero.

The server only needs Python's standard library at runtime; Cheerio and Playwright are used by the explicit Node-based refresh tooling. Docker copies the snapshot and bundled images through the Vite build. It does not scrape at startup.

## Evidence and next steps

[Otaghak's official partner page](https://landing.otaghak.com/corporate-collaboration/) advertises contractual API access for inventory, prices, booking and cancellation. This is a feasible access path to investigate, not an existing agreement. Partner APIs for Jabama and Jajiga have not been verified. No provider has been contacted.

Before claiming live comparison:

1. Obtain and verify appropriate quote access and content usage arrangements.
2. Audit actual overlapping units; curate a ground-truth identity set with source evidence.
3. Check complete prices against provider checkout for identical dates/party/rate plan.
4. Measure quote coverage, price mismatch at handoff, stale-quote rate and false merges.
5. Test whether travelers reach a useful shortlist faster than their current workflow.

AI can later propose structured Persian trip constraints, find duplicate candidates or summarize terms with citations. It must not generate prices, availability, identity certainty or contractual terms. These runtime AI features are not implemented or claimed in this release.
