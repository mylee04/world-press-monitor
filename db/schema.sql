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
  section text null,
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
alter table ingested_articles add column if not exists section text null;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ingested_articles'
      and column_name = 'beat'
  ) then
    update ingested_articles
      set section = coalesce(section, beat)
      where section is null and beat is not null;
  end if;
end;
$$;
drop index if exists idx_ingested_articles_beat;
alter table ingested_articles drop column if exists beat;

create index if not exists idx_ingested_articles_last_seen_at on ingested_articles(last_seen_at desc);
create index if not exists idx_ingested_articles_published_at on ingested_articles(published_at desc);
create index if not exists idx_ingested_articles_source on ingested_articles(source);
create index if not exists idx_ingested_articles_outlet_id on ingested_articles(outlet_id);
create index if not exists idx_ingested_articles_country on ingested_articles(country);
create index if not exists idx_ingested_articles_section on ingested_articles(section);

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
  section text null,
  seen_count integer not null default 1
);

create index if not exists idx_external_news_articles_publication_datetime on external_news_articles(publication_datetime desc);
create index if not exists idx_external_news_articles_last_seen_at on external_news_articles(last_seen_at desc);
create index if not exists idx_external_news_articles_source on external_news_articles(source);
create index if not exists idx_external_news_articles_url on external_news_articles(url);
create index if not exists idx_external_news_articles_section on external_news_articles(section);
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
alter table external_news_articles add column if not exists section text null;
drop index if exists idx_external_news_articles_category;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'external_news_articles'
      and column_name = 'category'
  ) then
    update external_news_articles
      set section = coalesce(section, category)
      where section is null and category is not null;
  end if;
end;
$$;
alter table external_news_articles drop column if exists category;

alter table external_news_articles add column if not exists url_norm text;
alter table external_news_articles add column if not exists url_hash text;

update external_news_articles
set
  url_norm = lower(trim(url)),
  url_hash = md5(lower(trim(url)))
where
  url is not null
  and (url_norm is null or url_hash is null);

create table if not exists radar_summary_queue (
  id bigserial primary key,
  article_external_id text not null unique references external_news_articles(external_id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_retry_at timestamptz not null default now(),
  last_error text null,
  provider text null,
  model text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_radar_summary_queue_status_retry
  on radar_summary_queue(status, next_retry_at, id);
create index if not exists idx_radar_summary_queue_updated
  on radar_summary_queue(updated_at desc);

create table if not exists radar_summary_usage_daily (
  usage_date date not null,
  provider text not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_date, provider)
);

create table if not exists radar_summary_fetch_logs (
  id bigserial primary key,
  queue_id bigint null references radar_summary_queue(id) on delete set null,
  article_external_id text null,
  domain text not null default 'unknown',
  attempt_count integer not null default 1,
  outcome text not null,
  failure_code text null,
  http_status integer null,
  used_fallback boolean not null default false,
  context_source text null,
  latency_ms integer null,
  created_at timestamptz not null default now()
);

create index if not exists idx_radar_summary_fetch_logs_created
  on radar_summary_fetch_logs(created_at desc);
create index if not exists idx_radar_summary_fetch_logs_domain_created
  on radar_summary_fetch_logs(domain, created_at desc);



do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_external_quality_score'
  ) then
    alter table external_news_articles
      add constraint chk_external_quality_score
      check (quality_score between 0 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_ingested_seen_count'
  ) then
    alter table ingested_articles
      add constraint chk_ingested_seen_count
      check (seen_count >= 1);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chk_external_seen_count'
  ) then
    alter table external_news_articles
      add constraint chk_external_seen_count
      check (seen_count >= 1);
  end if;
end
$$;
