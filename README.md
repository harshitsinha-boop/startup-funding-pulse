# STARTUP_FUNDING_PULSE

Weekly Indian startup-funding intelligence for **Aarav**, a venture scout at a Bengaluru family office. It ingests funding news continuously, extracts accurate structured deals with **Google Gemini Flash**, de-duplicates across sources, ranks against Aarav's focus, flags watchlist and *adjacent* companies, and delivers a **Monday 06:00 IST brief** plus a terminal-style interactive dashboard with a 3D capital map.

> All AI calls use Gemini via `@google/genai` (default model `gemini-3.6-flash`, set `GEMINI_MODEL`). No Anthropic API anywhere.

**Live:** https://startup-funding-pulse-chi.vercel.app

## Setup
1. `npm install`
2. Create a Supabase project; run `supabase/migrations/0001_init.sql`, `0002_seed_config.sql`, `0003_brief_text.sql` (SQL editor or `supabase db push`). This also enables Realtime on `deals`, `ingest_runs`, `feed_events`.
3. `cp .env.example .env.local` and fill:

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini (default `gemini-3.6-flash`) |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser Realtime |
| `SUPABASE_SERVICE_ROLE_KEY` | all server writes (never exposed) |
| `RESEND_API_KEY`, `BRIEF_FROM_EMAIL`, `BRIEF_TO_EMAIL` | email (Resend sandbox sender `onboarding@resend.dev` only delivers to your Resend account email) |
| `CRON_SECRET` | bearer token Vercel Cron sends; protects `/api/cron/*` |
| `ADMIN_PASSCODE` | gates `/config` and manual triggers (httpOnly cookie session) |
| `NEXT_PUBLIC_APP_URL` | base URL used in email links |
| `NEWSDATA_API_KEY` | optional Tier 4 |

4. `npm run dev` → http://localhost:3000, enter the passcode in the controls pane, press **[ RUN INGEST ]**.

## Commands
- `npm test` — vitest (amount/unit conversion, name normalisation, dedupe, evidence verification, IST weeks, ranking, prefilter, insight grounding, command parser, fixture parsing)
- `npm run pipeline:dry` — live feeds → prefilter → full text → (Gemini) → prints the funnel; no database needed (`DRY_LIMIT=10`)
- `npm run backfill -- --weeks 4` — Google News `when:28d` + roundup reconciliation so week-over-week has history

## Architecture
Discover → Pre-filter → Enrich (full text) → Extract (Gemini structured JSON) → Normalise (code) → Dedupe & merge → Confidence → Rank → Adjacency (Gemini) → Store. See **COMPONENTS_MAP.md** for the diagram, every component, sources and prompts.

Accuracy principles: headlines *discover*, full articles *describe*, weekly roundups *verify*. Gemini never converts currency or computes statistics; every quoted evidence string must be a verbatim substring of the article; pattern insights are discarded unless every number appears in the code-computed facts.

## Scheduling (Vercel Cron)
`vercel.json` runs one daily cron `/api/cron/daily` at 00:30 UTC (06:00 IST): ingest every day, **reconcile on Sunday**, **brief on Monday**. Hobby plans allow daily crons only. On Pro you can add `/api/cron/ingest` more often, `/api/cron/reconcile` (`30 12 * * 0`) and `/api/cron/brief` (`30 0 * * 1`). Every route sets `maxDuration = 300` and is resumable (queue = `raw_articles.extract_status`).

## Data sources & limitations
| Source | Method | Notes |
|---|---|---|
| Inc42, Inc42 Buzz, YourStory, Entrackr (`/rss`), ET Tech startups | RSS + article fetch | Tier 1, full text; robots.txt respected |
| Google News RSS (queries generated from config: base, per sector, per watchlist company) | RSS | Tier 2 discovery only |
| Entrackr weekly funding report, Inc42 Funding Galore | RSS + fetch + Gemini | Tier 3 verification / coverage % |
| NewsData.io | API | optional Tier 4 |

Out of scope, deliberately: LinkedIn / X scraping (ToS, paid APIs), Crunchbase / Tracxn / Venture Intelligence (enterprise pricing), MCA filings (no free API), NewsAPI.org (dev-only free tier). VCCircle exposes no public RSS. Single-source Google-News-only deals are labelled `LOW`. Coverage % is only as good as Entrackr's own roundup.

## Security
Service-role key only on the server. Public RLS read on non-sensitive tables (`raw_articles`, `job_queue` have no public policy). Admin actions require the `ADMIN_PASSCODE` cookie; cron routes require `CRON_SECRET`.
