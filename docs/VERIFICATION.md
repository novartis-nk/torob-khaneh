# Verification — October 5, 2026

Verified on Node 25.2.1 and installed Google Chrome. Scope: housing plus Safar.

| Check | Result |
|---|---|
| `npm test` | 34 tests passed |
| `npm run test:e2e` | 31 browser tests passed |
| `npm run build` | Vite production build passed |
| `npm run check:format` | All checked files formatted |
| Production smoke | Housing: 13 results. Safar: 72 results for four adults from 75 catalog listings. No browser errors. |
| API validation | Malformed trip dates and unknown provider returned HTTP 400 |
| Production image serving | WebP content type verified; catalog images rendered |
| Mobile | No document overflow at 390 × 844 or 320 × 720 in either service; travel filters and calendar work |
| Automated accessibility | No serious/critical axe violations in tested housing, nested source, mobile filters, Safar, date picker and travel detail states |
| Keyboard | Dialog dismissal restores focus; existing housing keyboard tabs pass |
| Combined demo | H.264 MP4, 1280 × 900, 278.56 seconds (4:39), 4,731,411 bytes; silent with Persian captions |

Screenshots and a combined-video Safar frame were visually reviewed. Housing tests cover normalization, stale-price exclusion, false-merge prevention, paired budget constraints, score reconciliation and SQLite ingestion. Safar tests cover Persian calendar boundaries, Tehran date validation, guest composition, quote expiry/completeness, source parsing, installment-vs-nightly prices, decorative-vs-property images, allowed source URLs and non-merging of similar listings.

Browser tests exercise both services, shortlist persistence, shared trip/compare restoration, calendar and guest changes, confirmed-total filtering, request failure/retry, malformed shared links, mobile filters and accessibility. Source refresh successfully retrieved 36 Jabama, 24 Otaghak and 15 Jajiga records. Earlier refresh failures retained prior timestamps rather than claiming fresh observations.

Limits: Safar observations are public catalog snapshots, not live trip quotes. No booking, partner API integration, real user study, production load test, cross-platform unit-identity evaluation or container build was performed. The original housing video is unchanged; the combined video adds Safar. Automated checks are not a complete accessibility certification.

## Minimal search entry page

Added `/` with keyboard-accessible housing/travel tabs and separate search drafts. Housing results moved to `/khaneh`; old root-level housing query links remain compatible. Search submission, travel destination/type extraction, return-to-home navigation, mobile overflow, accessibility and zero result-catalog requests on the landing page are covered by six additional browser tests. Desktop and mobile screenshots were visually reviewed. Existing demo videos predate this entry-page revision.
