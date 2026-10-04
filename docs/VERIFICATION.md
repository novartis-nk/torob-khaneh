# Verification — October 5, 2026

Verified on Node 25.2.1 and installed Google Chrome.

| Check | Result |
|---|---|
| `npm test` | 24 tests passed |
| `npm run test:e2e` | 14 browser tests passed |
| `npm run build` | Vite production build passed |
| `npm run check:format` | All checked files formatted |
| Production server smoke | 13 results rendered; no browser errors; invalid negative budget returned HTTP 400 |
| Mobile viewport | 390 × 844; no horizontal overflow; filters and empty-state recovery work |
| Automated accessibility | No serious/critical axe violations in tested desktop, property dialog, nested source dialog and mobile filter states |
| Video export | H.264 MP4, 1280 × 900, 201.08 seconds, 4,276,913 bytes; silent with Persian captions |

Screenshots and selected video frames were visually reviewed. Core tests include normalization, stale-price exclusion, false-merge prevention, paired budget constraints, score reconciliation and SQLite ingestion. Browser tests cover Persian queries, editable filters, bookmarks, saved searches, comparison, source evidence, keyboard tabs, mobile, map overview and request recovery.

Limits: no live data access, real user study, production load test, real identity-matching evaluation or container build was performed. The video was recorded just before final accessibility-label and keyboard polish; the demonstrated business behavior is unchanged. Automated accessibility checks are not a complete accessibility certification.
