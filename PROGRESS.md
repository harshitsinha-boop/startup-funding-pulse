# PROGRESS

Legend: ✅ done+verified · 🟡 done, needs live verification (needs keys/deploy) · ⬜ pending

| Phase | Status | Verified how |
|---|---|---|
| 1 Scaffold | ✅ | `next build` passes |
| 2 Ingestion | ✅ | live run: 616 discovered → 455 unique → prefilter → full-text/title extraction; Google News 429 circuit-breaker |
| 3 Extraction & normalisation | ✅ | live Gemini (`gemini-3.6-flash`): 32 deals from 10 articles, 32/32 evidence-verified; 43 vitest tests |
| 4 Config + ranking + adjacency | ✅ | exact watchlist hit + Gemini adjacency verified with temporary test entries (removed) |
| 5 Reconciliation + patterns + backfill | ✅ | 2-week backfill ran; coverage 80% vs Entrackr, 92% vs Inc42 (week of 2026-10-05); 6 grounded insights |
| 6 Brief | ✅ | brief generated + stored; test email accepted by Resend |
| 7 Dashboard | ✅ desktop screenshot | live deals, feed, ticker, patterns, table; mobile screenshot still to do |
| 8 3D scene | ✅ GRAPH on desktop | CITY view + mobile still to eyeball |
| 9 Cron + deploy | ✅ | https://startup-funding-pulse-chi.vercel.app — env set via CLI, all routes 200, prod ingest (118 new URLs → 12 new deals) and prod test email verified |
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
- **Gemini speed**: `thinkingLevel: LOW` (env `GEMINI_THINKING`) and 3 parallel extraction calls, persistence sequential.
- **Roundups are verification-only**: URLs matching `ROUNDUP_URL` are never extracted in normal ingest; a deal only counts as "covered" if it has a non-roundup source (otherwise coverage would be circular).
- **Google News politeness**: sequential queries, max 15 link resolutions/run, circuit breaker on HTTP 429 (Google throttled the dev IP during backfill). Unresolved items stay title-only → `LOW`.
- **Prefilter** is stricter than the brief's raw patterns: needs (round word AND money) or a specific round phrase, so trend pieces ("cleantech funding boom") don't burn Gemini calls.
- **Supabase project** moved to `prhfjnohihmougornqrp` (migrations 0001–0003 applied; the earlier project was deleted). 4-week backfill + reconciliation re-run there.
- **Brief format** follows the pasted weekly-digest spec: subject (≤70 chars), hidden preheader, 2-sentence summary, key takeaways, snapshot + methodology, watchlist alerts, notable deals with numbered source refs, signals to watch (labelled analysis), CTA, sources, methodology. One content model renders both the HTML and the plain-text part (sent as multipart). Light, one-column, email-safe (no images/scripts/external CSS). Percentages from tiny bases are suppressed; week-on-week shown only when the prior week has ≥5 deals.
- **Dashboard default week**: current week once it has ≥5 deals, else the latest completed week.
- Not visually verified: CITY 3D view and phone width (the in-app browser pane was hidden/flaky); DOM and desktop GRAPH view were.
- **Deploy gotcha**: Vercel blocks deployments whose commit author has no linked GitHub account; commits now use the GitHub noreply email.
- **Monday email**: daily cron branches by weekday; a second Monday cron (07:00 IST) is an idempotent retry. Resend confirmed `delivered` for both test sends.
- **Public manual triggers** with server-side cooldown + single-run guard; `/config` stays passcode-protected.
- **CITY view crash** fixed (ghost-outline geometry); 3D wrapped in an error boundary.
