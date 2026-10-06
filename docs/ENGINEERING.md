# Engineering notes

This document describes the housing implementation. For the separately implemented travel adapters, trip model and limitations, see [Safar](SAFAR.md).

## Data path

`website/API or crawl task → adapter → strict normalization → PostgreSQL raw + normalized observations → complete-link grouping → hard eligibility filters → offer selection → ranking strategy → UI evidence`

The runtime backend is Python. React is compiled to static assets; Vite proxies `/api` to Python during development, and Python serves `dist/` in production. PostgreSQL holds raw observations, normalized observations, rejected records, source onboarding requests and crawl tasks.

Website onboarding begins with one automatic path. A source request creates a durable `discovery` task; the separate `backend.worker` claims it with PostgreSQL row locks so research never blocks an HTTP request. The worker uses public web-search evidence and strict structured outputs for source discovery and API coverage. It chooses API only when every correctness field is evidenced with sufficient confidence. Otherwise it produces a scraper plan. The legacy crawl-only endpoint remains for compatibility.

The AI does not deploy code. An API decision is rendered into a validated, GET-only declarative manifest and a small factory model using `backend.api_factory`; credential values are never generated or persisted. A scrape decision creates a review artifact plus `scrape:planned` and `monitor:waiting_activation` tasks. Human access/policy review and fixture verification must happen before either route is activated.

The responsibility prompts are independently versionable:

- `source_discovery.md`: official API/feed/developer evidence and access model.
- `api_coverage.md`: strict required-field and price/availability semantics decision.
- `api_adapter_factory.md`: request, pagination, field mapping and fixture model.
- `scraper_planner.md`: stable extraction sources, quality gates, retries and policy review.
- `scrape_monitor.md`: drift, null rates, completeness, freshness, errors and pause decisions.

## Extensibility patterns

The backend separates source-specific behavior from comparison logic:

- **Adapter + Registry:** `OfferAdapter` converts one website/schema into the canonical offer model. `AdapterRegistry` selects it from the schema key. Adding a source means adding and registering an adapter; the repository and HTTP handler stay unchanged.
- **Strategy + Registry:** each `RankingStrategy` orders already-eligible homes. The registry currently exposes recommended, rent, deposit, newest and metro strategies. A learned or experiment-specific ranker can be registered behind the same contract.
- **Repository:** `PostgresRepository` owns persistence. Search, onboarding and worker services do not contain SQL, so storage remains behind one boundary.
- **Application services:** housing search, travel search and crawl requests own use-case rules. The HTTP layer only parses requests, maps validation failures and serializes responses.
- **Dependency direction:** the protocols in `backend/ports.py` are the stable boundary. Adapters and persistence depend on those contracts; UI and HTTP code do not depend on individual websites.

Before live ingestion, the planned scrape/API executors still need per-domain concurrency, approved credentials, scheduled monitoring, a dead-letter queue, adapter version promotion, source-specific browser fixtures and operator controls. The generated plans define these requirements but intentionally do not represent an activated scraper.

## API

- `GET /api/health`
- `GET /api/catalog`: source counts, rejection count, neighborhoods, fixture timestamp.
- `GET /api/search?q=...&maxDeposit=600&maxRent=20&rate=1`: structured inputs override extracted intent; price filters are in millions of toman. Unknown/invalid supported filter values return 400. All amounts in returned offers are integer toman.
- `GET /api/source/:id`: raw and normalized sample observation.
- `POST /api/source-requests`: validate `{url, vertical, notes}`; create an automatic AI discovery task and return HTTP 202 with a tracking ID.
- `POST /api/crawl-requests`: compatibility alias for `method=crawl`.
- `GET /api/source-requests/:id`: inspect resolution, evidence, generated artifact and task states.
- `GET /api/crawl-requests/:id`: compatibility lookup.

Search responses contain selected source offers, all source observations, staleness and eligibility flags, score components and evidence. Query length is bounded. Database queries are parameterized. Raw evidence is rendered as escaped text by React. Static serving is constrained to the build directory. No secrets are sent to the client.

## Identity and grouping

Groups are matched using corroborated sample identity fields. Every candidate must match all members; no transitive grouping. IDs are SHA-256-derived from canonical property identity, excluding price and time. Normalization rejects unsupported schemas, missing/non-numeric prices, invalid locations and future observations.

Limitations: exact field equality under-merges; fingerprints are authored fixture evidence rather than perceptual hashes computed from source photos; missing address/photo evidence prevents grouping. Real same-building units could still collide if all observable identity features match. Precision is not measured on real listings and no claim of production reliability is made. A real implementation needs pair labeling, conflict review, identity resolution persistence and merge/split history.

## Ranking

Hard filters run before ranking. An offer must simultaneously meet both price ceilings and be no more than 72 hours old. Unknown required amenities do not pass. Known false and unknown remain distinct. The selected offer minimizes the adjustable comparison cost. Alternative ranking strategies act on selected offers rather than silently changing the source combination. Ties use stable IDs. API responses name the active algorithm, for example `recommended-v1` or `rent-v1`.

Original source prices are never mutated when the user's comparison weight changes. Source dates are persisted, not recalculated on every read. Saved homes and saved searches are browser-local and need no account. A saved home's absence from results may reflect current filters or staleness.

## Query interpretation

`rules-v1` handles a documented narrow Persian grammar. This is not semantic search. Supported extracted constraints are shown and can be removed. Unsupported example terms produce warnings. It does not support arbitrary geographic expressions, all Persian number words, broad negation, travel-time routing, or every word ordering. The optional LLM is isolated to source onboarding; user search remains deterministic.

## Operational boundary

This is a single-process local application with small-data clustering; the complete-link implementation is quadratic/cubic in the worst case and is intentionally not a scale claim. At larger scale, blocking keys and an indexed candidate service should generate a small set of possible matches before the conservative complete-link check. Production work also includes authorized source adapters, incremental ingestion, source deletion/expiry, scheduled refresh, observability, rate limiting, route calculation, privacy review and real data evaluation. Do not deploy the Vite development server publicly.

The sample-source JSON endpoint contains no real personal information. App URLs contain search constraints, so shared links disclose those constraints. No third-party analytics, identity provider or background notification is installed.

## Verification strategy

Unit tests target monetary correctness, future/stale observations, false merges, transitive grouping, paired budgets, unknown amenities, filtering, score reconciliation, weight sensitivity and ingestion persistence. Browser tests exercise actual user flows, recovery, mobile overflow and accessibility. Reduced motion makes automated accessibility checks inspect settled interfaces rather than partially faded animation frames. Automated axe results do not certify complete accessibility; keyboard and screenshots are also reviewed.

## Container packaging

A two-stage Dockerfile is supplied. Node builds the React assets; the final Python image serves the API and static files without the npm dependency tree. The container runs as a non-root `app` user and stores SQLite at `/data/catalog.sqlite`. Mount `/data` for persistence.
