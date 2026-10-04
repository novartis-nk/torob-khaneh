# Engineering notes

## Data path

`three raw fixture schemas → strict normalization → SQLite raw + normalized observations → complete-link grouping → hard eligibility filters → offer selection → deterministic ranking → UI evidence`

The app has a real local backend and database. Ingestion runs as an explicit local batch command, not an unauthenticated write endpoint. No live crawling is implemented. Calling a fixture a crawl would misrepresent the demonstration.

## API

- `GET /api/health`
- `GET /api/catalog`: source counts, rejection count, neighborhoods, fixture timestamp.
- `GET /api/search?q=...&maxDeposit=600&maxRent=20&rate=1`: structured inputs override extracted intent; price filters are in millions of toman. Unknown/invalid supported filter values return 400. All amounts in returned offers are integer toman.
- `GET /api/source/:id`: raw and normalized sample observation.

Search responses contain selected source offers, all source observations, staleness and eligibility flags, score components and evidence. Query length is bounded. Database queries are parameterized. Raw evidence is rendered as escaped text by React. Static serving is constrained to the build directory. No secrets are sent to the client.

## Identity and grouping

Groups are matched using corroborated sample identity fields. Every candidate must match all members; no transitive grouping. IDs are SHA-256-derived from canonical property identity, excluding price and time. Normalization rejects unsupported schemas, missing/non-numeric prices, invalid locations and future observations.

Limitations: exact field equality under-merges; fingerprints are authored fixture evidence rather than perceptual hashes computed from source photos; missing address/photo evidence prevents grouping. Real same-building units could still collide if all observable identity features match. Precision is not measured on real listings and no claim of production reliability is made. A real implementation needs pair labeling, conflict review, identity resolution persistence and merge/split history.

## Ranking

Hard filters run before ranking. An offer must simultaneously meet both price ceilings and be no more than 72 hours old. Unknown required amenities do not pass. Known false and unknown remain distinct. The selected offer minimizes the adjustable comparison cost. Alternative sorting acts on selected offers rather than silently changing the source combination. Ties use stable IDs.

Original source prices are never mutated when the user's comparison weight changes. Source dates are persisted, not recalculated on every read. Saved homes and saved searches are browser-local and need no account. A saved home's absence from results may reflect current filters or staleness.

## Query interpretation

`rules-v1` handles a documented narrow Persian grammar. This is not semantic search. Supported extracted constraints are shown and can be removed. Unsupported example terms produce warnings. It does not support arbitrary geographic expressions, all Persian number words, broad negation, travel-time routing, or every word ordering. An LLM is not required by the challenge; AI was used during development, not represented as a deployed service.

## Operational boundary

This is a single-process local application with small-data clustering; the complete-link implementation is quadratic/cubic in the worst case and is intentionally not a scale claim. Production work includes indexed candidate generation, authorized source adapters, incremental ingestion, source deletion/expiry, scheduled refresh, observability, rate limiting, route calculation, privacy review and real data evaluation. Do not deploy the Vite development middleware publicly.

The sample-source JSON endpoint contains no real personal information. App URLs contain search constraints, so shared links disclose those constraints. No third-party analytics, identity provider or background notification is installed.

## Verification strategy

Unit tests target monetary correctness, future/stale observations, false merges, transitive grouping, paired budgets, unknown amenities, filtering, score reconciliation, weight sensitivity and ingestion persistence. Browser tests exercise actual user flows, recovery, mobile overflow and accessibility. Reduced motion makes automated accessibility checks inspect settled interfaces rather than partially faded animation frames. Automated axe results do not certify complete accessibility; keyboard and screenshots are also reviewed.

## Container packaging

A two-stage Dockerfile is supplied. The runtime serves the built assets using Node's standard library and SQLite, so it does not need the build-time dependency tree. The container is configured to run as the non-root `node` user. Container packaging is provided for convenience; it has not been built or deployed in this session. Runtime SQLite should use a mounted writable volume for a persistent deployment.
