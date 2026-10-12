-- Startup Funding Pulse schema
create extension if not exists pgcrypto;

create table sources (
  id serial primary key,
  slug text unique not null,
  name text not null,
  tier int not null,                 -- 1 primary, 2 discovery, 3 verification, 4 optional
  kind text not null default 'rss',  -- rss | gnews | roundup | api
  url text not null,
  enabled boolean not null default true,
  last_status text, last_checked_at timestamptz, last_item_count int
);

create table raw_articles (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  url_hash text unique not null,
  title text not null,
  summary text,
  full_text text,
  source_id int references sources(id),
  source_slug text,
  tier int,
  published_at timestamptz,
  fetch_status text default 'pending',      -- pending | ok | failed | blocked | skipped
  prefilter_pass boolean not null default false,
  extract_status text default 'pending',    -- pending | done | failed | skipped
  is_roundup boolean default false,
  created_at timestamptz default now()
);
create index on raw_articles (extract_status) where prefilter_pass;
create index on raw_articles (published_at desc);

create table deals (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  company_norm text not null,
  aliases text[] default '{}',
  description text,
  hq_city text,
  sector_raw text,
  sector text,
  amount_value numeric, amount_currency text, amount_unit text,
  amount_disclosed boolean default false,
  amount_usd numeric,
  stage text, instrument text default 'UNKNOWN',
  status text default 'CLOSED',
  announcement_date date,
  week_start date not null,
  confidence text not null default 'SINGLE_SOURCE',
  evidence jsonb default '{}',
  evidence_verified boolean default true,
  watchlist_hit text, adjacency jsonb,
  score numeric default 0,
  first_seen timestamptz default now(),
  last_updated timestamptz default now()
);
create index on deals (week_start);
create index on deals (sector);
create index on deals (company_norm);

create table deal_sources (
  deal_id uuid references deals(id) on delete cascade,
  article_id uuid references raw_articles(id) on delete cascade,
  evidence jsonb default '{}',
  primary key (deal_id, article_id)
);

create table investors (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_norm text unique not null,
  aliases text[] default '{}', first_seen timestamptz default now()
);
create table deal_investors (
  deal_id uuid references deals(id) on delete cascade,
  investor_id uuid references investors(id) on delete cascade,
  role text not null default 'participant',
  primary key (deal_id, investor_id)
);

create table watchlist (
  id uuid primary key default gen_random_uuid(),
  name text not null, description text not null default '', aliases text[] default '{}'
);

create table config (id int primary key default 1 check (id = 1), data jsonb not null, updated_at timestamptz default now());

create table weeks (
  week_start date primary key,
  stats jsonb, insights jsonb, coverage_pct numeric,
  brief_html text, brief_subject text, sent_at timestamptz, generated_at timestamptz
);
create table reconciliations (
  id uuid primary key default gen_random_uuid(),
  week_start date, source text, report_url text,
  matched int default 0, missed int default 0, mismatched jsonb default '[]', total int default 0,
  created_at timestamptz default now()
);
create table ingest_runs (
  id uuid primary key default gen_random_uuid(),
  kind text default 'ingest', started_at timestamptz default now(), finished_at timestamptz,
  status text default 'running',
  counts jsonb default '{}', tokens_in int default 0, tokens_out int default 0,
  gemini_calls int default 0, logs jsonb default '[]', errors jsonb default '[]'
);
create table feed_events (
  id bigserial primary key, run_id uuid, level text default 'OK', message text not null, created_at timestamptz default now()
);
create table fx_rates (day date primary key, usd_inr numeric not null, source text);
create table job_queue (
  id bigserial primary key, kind text not null, payload jsonb not null,
  status text default 'pending', attempts int default 0, error text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on job_queue (kind, status);

-- Realtime
alter publication supabase_realtime add table deals, ingest_runs, feed_events;

-- RLS: public read on non-sensitive tables; writes only via service role
do $$ declare t text; begin
  foreach t in array array['sources','raw_articles','deals','deal_sources','investors','deal_investors','watchlist','config','weeks','reconciliations','ingest_runs','feed_events','fx_rates','job_queue'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  foreach t in array array['sources','deals','deal_sources','investors','deal_investors','watchlist','config','weeks','reconciliations','ingest_runs','feed_events','fx_rates'] loop
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;
-- raw_articles and job_queue intentionally have no public read policy.

insert into sources (slug,name,tier,kind,url) values
 ('inc42','Inc42',1,'rss','https://inc42.com/feed/'),
 ('inc42-buzz','Inc42 Buzz',1,'rss','https://inc42.com/buzz/feed/'),
 ('yourstory','YourStory',1,'rss','https://yourstory.com/feed'),
 ('entrackr','Entrackr',1,'rss','https://entrackr.com/rss'),
 ('et-startups','ET Tech Startups',1,'rss','https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570561.cms'),
 ('gnews','Google News (config-driven)',2,'gnews','https://news.google.com/rss/search'),
 ('entrackr-weekly','Entrackr Weekly Funding Report',3,'roundup','https://entrackr.com/report/weekly-funding-report'),
 ('inc42-galore','Inc42 Funding Galore',3,'roundup','https://inc42.com/tag/funding-galore/feed/'),
 ('newsdata','NewsData.io',4,'api','https://newsdata.io/api/1/latest');
