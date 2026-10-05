# ترب خانه — product decision brief

## The challenge and the choice

Torob asks applicants to build “Torob for X,” use AI during research/building/iteration, and submit a product demo of **at most five minutes**, a project link and contact details. The challenge highlights crawling offers, normalizing messy data, ranking by intent and explaining a choice. Its explicit evaluation themes are full-stack engineering, product judgment, UX taste and practical use of AI. Source: [Torob’s challenge](https://jobs.torob.com/ai-product-engineer), inspected October 5, 2026.

**Decision: start with apartment rentals in Tehran, specifically comparing offers for the same home.** The initial user is a renter with a hard deposit ceiling, a monthly-rent ceiling and a few necessary amenities. Their job is to produce a credible shortlist for arranging viewings.

This is a product hypothesis, not a claim established by interviews or market-size research. No user interviews have been conducted for this prototype.

| Candidate | Demonstration strengths | Main constraint | Decision |
|---|---|---|---|
| Flights | Exact offer identity, meaningful total-price comparison | Current inventory and booking rules depend on provider integrations; many mature comparators | Good alternative, less differentiated without real feeds |
| Insurance | Coverage normalization and substantial decision complexity | Coverage exclusions and personalized underwriting create substantial correctness obligations | Too broad for a trustworthy first demo |
| Cars | Strong search intent, photos and price comparison | Condition makes visually similar cars incomparable; reliable identity is often unavailable | Attractive later, weak grouping evidence in a small prototype |
| Apartment rentals | Duplicate offers, Persian text, two-part budget, freshness and location tradeoffs | Real supply access and entity resolution need validation | **Best scope for demonstrating explicit judgment in a self-contained demo** |

The choice is optimized for this application, not a claim that housing has the largest market or highest commercial return.

## The product promise

**«یک خانه، همهٔ پیشنهادها.»** One home, all its offers.

A conventional listing feed makes the user reconcile entries. This prototype moves that work into a conservative grouping pipeline and keeps source evidence visible. The useful output is a shortlist with clear tradeoffs, not an opaque “best property” claim.

### The demo's important decisions

1. **Keep deposit and rent separate.** A refundable deposit is not monthly rent. Both budget constraints must hold for the *same offer*. Combining one source’s cheapest deposit with another’s cheapest rent would fabricate a price.
2. **Do not recommend stale bargains.** Offers older than 72 hours remain inspectable but cannot supply the headline price. The 72-hour limit is a demo policy requiring validation, not an empirical optimum.
3. **Prefer a missed merge to a wrong merge.** A common image is insufficient. Match image evidence, normalized address, district, area, bedrooms, floor, nearby coordinates and consistent parking/elevator fields. Use complete-link grouping so A≈B and B≈C do not imply A≈C. Sample fingerprints are authored identifiers; this is not a trained image matching system.
4. **Show the extracted intent.** Supported Persian queries become visible, editable filters. The parser is deterministic and is explicitly documented as rules-based. Unsupported requirements produce a notice. No text generation invents prices, amenities or neighborhood quality.
5. **Separate eligibility from ranking.** Apply hard requirements first. An attractive price must never compensate for a violated budget. Empty results stay empty until the user changes a constraint.
6. **Explain the selected offer.** Show its provider, observed time, competing source prices, stale status, ranking components and caveats.
7. **Make the deposit tradeoff personal.** The optional comparison metric is `rent + deposit × monthly weight`. Default weight 1% is an illustrative preference, not a market conversion rate, interest quote, financial recommendation, or offer from the owner. Users can choose 0–5%. Original amounts remain visible and unchanged.
8. **Use Torob's visual grammar.** Persian RTL, a search-first layout, red primary actions, white surfaces, gray separators, compact facts and readily comparable prices. The product is visibly an independent prototype; it is not represented as an official Torob service. Visual reference: [Torob’s public interface](https://torob.com/).

## Current implementation

- React frontend; Python HTTP API; SQLite persistence.
- A public source-request flow queues websites for adapter review and returns a tracking ID; it does not perform arbitrary URL fetching in the request path.
- 28 authored raw records in three source schemas. One non-numeric price is quarantined; 27 valid observations form 14 distinct homes. One home has only stale offers, leaving 13 searchable homes at generation time.
- Persian/Arabic digits, Persian letter variants, explicit rial/toman conversion, millions and billions.
- Conservative duplicate grouping; same-size, same-photo apartments on different floors stay separate.
- Persian and limited Finglish query parsing for supported neighborhoods, deposit/rent ceilings, minimum area, bedrooms, positive amenities and near-metro filtering.
- Source comparison, evidence inspection, deterministic ranking, adjustable deposit weight, three-home comparison.
- Browser-local bookmarks and saved searches; shareable query parameters.
- Mobile layout, loading/error/retry/empty states, keyboard access and reduced motion.
- Schematic neighborhood overview. It is **not** a real map, navigation system or route-time calculation.
- Self-contained generated illustrative apartment imagery and a locally bundled open font.

## Ranking, precisely

Among fresh offers that satisfy both price limits, select the minimum comparison cost. Then score each eligible home:

- Cost: `round(45 / (1 + comparison_cost / 25,000,000))`.
- Metro: `round(25 × max(0, 1 − minutes / 35))`; unknown distance gets no proximity points.
- Freshness: `round(20 × max(0, 1 − age / 72 hours))`.
- Completeness: 2.5 points for each known parking, elevator, balcony and metro field (maximum 10).

These weights and scales are starting assumptions, not learned parameters. “Score out of 100” is a sum of points, not a probability, safety rating or confidence interval. A score does not imply the highest-scoring property is universally best. Explicit alternative sort modes sort the selected offers and are labeled accordingly.

## Assumptions to test next

| Assumption | Current treatment | Validation experiment / decision |
|---|---|---|
| Repeated ads materially slow renters | Visible grouping with source evidence | Observe 5–8 active renters shortlisting; measure repeated-open events and task time |
| False merges cost more than missed merges | Conservative exact corroboration | Label at least 200 real candidate pairs; review false positives individually; do not expand grouping until precision is sufficient |
| Two separate budgets reflect decisions | Independent hard ceilings | Ask renters to explain their last tradeoff; test whether a combined score helps without confusing refundable deposits with expenses |
| Freshness affects useful shortlists | Exclude >72-hour observations | Compare owner-confirmed availability across age buckets before selecting an operational TTL |
| Metro proximity is useful | Visible sample walk times | Replace sample times with a routing provider, label estimation uncertainty and test behavior |
| Authorized supply can be obtained | Sample feeds and documented source boundary | Secure a partner feed or approved platform integration before promising coverage |

No live conversion, retention, latency-at-scale or user-outcome improvement is claimed.

## Data access and launch boundary

The sample sources do not impersonate existing listing platforms. Raw input is available from each offer’s source-evidence button. Images, offers, prices, identities, coordinates and metro times are demo data. Regenerating the fixture refreshes its reference clock; that is not a crawl or a real-world price update.

[Divar’s official Kenar documentation](https://divar-ir.github.io/kenar-docs/) describes integrations, API keys, permissions and approval steps. It is a potential integration route to investigate, **not evidence of unrestricted access to all rental listings**. This prototype does not connect to it or claim approval. Live ingestion would require an authorized source adapter, contractual/technical access, source identifiers, timestamps, deletion/expiry handling and real matching evaluation.

## What we deliberately deferred

Payments, property booking, messaging owners, automated alerts, nationwide coverage, real routing, an automatic crawl worker and a deployed LLM. Each would add a dependency or claim that the current evidence cannot support. The prototype accepts crawl-source requests and models the adapter boundary, while leaving access review and scheduled collection to an explicit worker stage.

## AI use and honesty

AI assisted interpretation of the brief, product exploration, implementation, test-case design, iteration and image generation. The runtime search parser and ranking are deterministic. There is no hidden LLM call or simulated model response. A future model could extract a proposed typed intent, but validated explicit budgets and known catalog facts must remain authoritative; rollout needs an intent evaluation set and rejection behavior for ambiguous language.

## Success criteria for a real pilot

Primary: proportion of sessions reaching a useful, source-confirmed shortlist of 2–3 homes. Supporting: time to shortlist, duplicate reopen rate, comparison usage, successful handoff and saved-search return rate. Guardrails: false-merge rate, stale headline rate, price-unit errors, hard-budget violations and missed/unsupported intent rate. Do not equate clicks or longer sessions with better decisions.
