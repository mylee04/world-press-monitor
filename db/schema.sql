create table if not exists drafts (
  id text primary key,
  source_article_id text not null,
  source text not null,
  source_link text not null,
  source_title text not null,
  source_published_at timestamptz not null,
  status text not null default 'draft',
  headline_es text not null,
  body_es text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz null,
  published_at timestamptz null
);

create table if not exists distribution_content (
  id bigserial primary key,
  draft_id text not null references drafts(id) on delete cascade,
  platform text not null,
  content text not null,
  is_published boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(draft_id, platform)
);

create table if not exists ingested_articles (
  id bigserial primary key,
  link text not null,
  link_norm text not null,
  link_hash text not null unique,
  title text not null,
  source text not null,
  published_at timestamptz not null,
  country text null,
  language text null,
  source_type text null,
  tier smallint null,
  beat text null,
  classification_source text null,
  confidence real null,
  world_latam boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1
);

create index if not exists idx_ingested_articles_last_seen_at on ingested_articles(last_seen_at desc);
create index if not exists idx_ingested_articles_published_at on ingested_articles(published_at desc);
create index if not exists idx_ingested_articles_source on ingested_articles(source);
create index if not exists idx_ingested_articles_country on ingested_articles(country);
create index if not exists idx_ingested_articles_beat on ingested_articles(beat);

create table if not exists ingestion_endpoint_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  outlet_id text not null,
  source text not null,
  method text not null,
  attempted boolean not null default false,
  circuit_open boolean not null default false,
  ok boolean not null default false,
  status_code integer null,
  parsed_count integer not null default 0,
  parsed_limit integer null,
  sample_capped boolean not null default false,
  recent24h integer not null default 0,
  error text null
);

create index if not exists idx_ingestion_endpoint_runs_ran_at on ingestion_endpoint_runs(ran_at desc);
create index if not exists idx_ingestion_endpoint_runs_source on ingestion_endpoint_runs(source);
create index if not exists idx_ingestion_endpoint_runs_outlet_id on ingestion_endpoint_runs(outlet_id);
