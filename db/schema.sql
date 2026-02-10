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
  published_at timestamptz null,
  auto_queued_from text null
);
alter table drafts add column if not exists auto_queued_from text null;

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
  outlet_id text null,
  title text not null,
  source text not null,
  published_at timestamptz not null,
  country text null,
  language text null,
  source_type text null,
  tier smallint null,
  beat text null,
  classification_source text null,
  classification_reason text null,
  confidence real null,
  world_latam boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1
);
alter table ingested_articles add column if not exists outlet_id text null;
alter table ingested_articles add column if not exists classification_reason text null;

create index if not exists idx_ingested_articles_last_seen_at on ingested_articles(last_seen_at desc);
create index if not exists idx_ingested_articles_published_at on ingested_articles(published_at desc);
create index if not exists idx_ingested_articles_source on ingested_articles(source);
create index if not exists idx_ingested_articles_outlet_id on ingested_articles(outlet_id);
create index if not exists idx_ingested_articles_country on ingested_articles(country);
create index if not exists idx_ingested_articles_beat on ingested_articles(beat);

create table if not exists ingestion_endpoint_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  runner text not null default 'api_news',
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

alter table ingestion_endpoint_runs add column if not exists runner text not null default 'api_news';
create index if not exists idx_ingestion_endpoint_runs_ran_at on ingestion_endpoint_runs(ran_at desc);
create index if not exists idx_ingestion_endpoint_runs_source on ingestion_endpoint_runs(source);
create index if not exists idx_ingestion_endpoint_runs_outlet_id on ingestion_endpoint_runs(outlet_id);
create index if not exists idx_ingestion_endpoint_runs_runner_ran_at on ingestion_endpoint_runs(runner, ran_at desc);

create table if not exists external_news_articles (
  external_id text primary key,
  publication_datetime timestamptz not null,
  publication_source text not null default 'feed',
  publication_verified boolean not null default false,
  category text not null,
  title_en text null,
  title_original text not null,
  summary_en text null,
  summary_original text null,
  summary_source text not null default 'feed',
  summary_verified boolean not null default false,
  author_name text null,
  author_email text null,
  author_source text not null default 'feed',
  author_verified boolean not null default false,
  quality_score integer not null default 0,
  country text null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  url text not null,
  source text not null,
  is_paywalled boolean not null default false,
  language text null,
  seen_count integer not null default 1
);

create index if not exists idx_external_news_articles_publication_datetime on external_news_articles(publication_datetime desc);
create index if not exists idx_external_news_articles_last_seen_at on external_news_articles(last_seen_at desc);
create index if not exists idx_external_news_articles_source on external_news_articles(source);
create index if not exists idx_external_news_articles_url on external_news_articles(url);
create index if not exists idx_external_news_articles_category on external_news_articles(category);
create index if not exists idx_external_news_articles_country on external_news_articles(country);

alter table external_news_articles add column if not exists publication_source text not null default 'feed';
alter table external_news_articles add column if not exists publication_verified boolean not null default false;
alter table external_news_articles add column if not exists summary_source text not null default 'feed';
alter table external_news_articles add column if not exists summary_verified boolean not null default false;
alter table external_news_articles add column if not exists author_name text null;
alter table external_news_articles add column if not exists author_email text null;
alter table external_news_articles add column if not exists author_source text not null default 'feed';
alter table external_news_articles add column if not exists author_verified boolean not null default false;
alter table external_news_articles add column if not exists quality_score integer not null default 0;

create table if not exists social_breaking_posts (
  id bigserial primary key,
  provider text not null default 'x',
  account_handle text not null,
  post_id text not null,
  post_url text not null,
  author_name text null,
  published_at timestamptz not null,
  title text not null,
  content text null,
  language text null,
  country text null,
  tags jsonb not null default '[]'::jsonb,
  breaking_score integer not null default 0,
  is_breaking boolean not null default false,
  created_at timestamptz not null default now(),
  unique(provider, post_id)
);

create index if not exists idx_social_breaking_posts_created_at on social_breaking_posts(created_at desc);
create index if not exists idx_social_breaking_posts_published_at on social_breaking_posts(published_at desc);
create index if not exists idx_social_breaking_posts_breaking on social_breaking_posts(is_breaking, created_at desc);

create table if not exists breaking_queue (
  id bigserial primary key,
  source_kind text not null default 'social_x',
  source_ref text not null unique,
  title text not null,
  link text not null,
  summary text null,
  language text null,
  country text null,
  status text not null default 'new',
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_breaking_queue_status_created on breaking_queue(status, created_at desc);
