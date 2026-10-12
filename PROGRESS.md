# PROGRESS

Legend: ✅ done+verified · 🟡 done, needs live verification (needs keys/deploy) · ⬜ pending

| Phase | Status | Verified how |
|---|---|---|
| 1 Scaffold (Next 16, TS, Tailwind 4, tokens, fonts, CRT, migrations, `.env.example`) | ✅ | `next build` passes |
| 2 Ingestion (RSS + config-driven Google News, prefilter, enrichment, URL-hash cache, run logging) | ✅ | `npm run pipeline:dry` against live feeds: 5 feeds OK, 179→162 unique→111 prefilter pass, 6/6 full-text |
| 3 Extraction & normalisation (Gemini schema, evidence verification, FX, units, sector map, dedupe, confidence) | ✅ code / 🟡 live Gemini | 41 vitest tests pass; live extraction needs `GEMINI_API_KEY` |
| 4 Config + ranking + adjacency | ✅ code / 🟡 live | ranking unit tests; adjacency needs Gemini + watchlist |
| 5 Reconciliation + patterns + backfill | ✅ code / 🟡 live | grounding tests; Entrackr/Inc42 roundup URLs confirmed live |
| 6 Brief (HTML email, Resend, archive, manual triggers) | ✅ code / 🟡 live | needs Resend key to send |
| 7 Dashboard (layout, Realtime feed, table, detail, command bar, patterns, coverage) | ✅ code / 🟡 visual | needs Supabase to render data |
| 8 3D scene (GRAPH + CITY, filtering, reduced-motion/low-power fallbacks) | ✅ code / 🟡 visual | |
| 9 Cron + deploy | 🟡 | `vercel.json` present; deploy pending credentials |
| 10 Docs | ✅ | README, COMPONENTS_MAP |

## Decisions (ambiguity → accuracy / demo reliability)
- **Model**: default `GEMINI_MODEL=gemini-3.6-flash` (GA Flash per ai.google.dev, Oct 2026). Overridable by env.
- **Entrackr RSS** is `https://entrackr.com/rss` (`/feed` 404s). Its latest weekly funding report appears in that feed; the weekly-report index page is also scrapeable. VCCircle has no public RSS (404) → not used. ET Tech startups RSS works → added as Tier 1.
- **Inc42 Funding Galore** has a working tag feed: `https://inc42.com/tag/funding-galore/feed/`.
- **Single daily cron** (`/api/cron/daily`, 00:30 UTC = 06:00 IST) that branches by weekday (Sun → reconcile, Mon → brief). Vercel Hobby allows only daily crons and few of them; dedicated `/api/cron/{ingest,reconcile,brief}` routes exist for Pro plans (add schedules from the brief's table).
- **Resumable queue**: `raw_articles.extract_status` (+ `prefilter_pass`) is the queue; any run stops before the deadline and the next run continues. `job_queue` table exists but is unused.
- **Independent sources** = distinct publishers (Google News items keep their publisher in `source_slug = gnews:<publisher>`; `inc42` and `inc42-buzz` count as one).
- **Google News links** are resolved to the publisher URL via Google's batchexecute endpoint (best-effort). If resolution/fetch fails the deal stays `LOW`.
- **Evidence failure**: if the amount quote isn't a verbatim substring, the amount is dropped (not trusted) and confidence is `LOW`.
- **Dashboard data** is served by `/api/dashboard` (service role, joins raw_articles which has no public RLS policy); Realtime uses the anon key on `deals`, `feed_events`, `ingest_runs`.
- Watchlist is not seeded (it's Aarav's data); config is seeded with the sensible defaults from the brief.
- INR/USD: Frankfurter daily rate cached in `fx_rates` (observed ₹96.73/USD on 2026-10-09); fallback ₹88 from config.
