do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'external_news_articles'
      and not exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'news_articles'
      )
  ) then
    alter table external_news_articles rename to news_articles;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'ingestion_endpoint_runs'
      and not exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'rss_health_status'
      )
  ) then
    alter table ingestion_endpoint_runs rename to rss_health_status;
  end if;
end;
$$;

create table if not exists rss_health_status (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  runner text not null default 'api_news',
  outlet_id text not null,
  source text not null,
  method text not null,
  country text not null default 'Global',
  attempted boolean not null default false,
  circuit_open boolean not null default false,
  ok boolean not null default false,
  status_code integer null,
  parsed_count integer not null default 0,
  fetched_count integer not null default 0,
  parsed_limit integer null,
  sample_capped boolean not null default false,
  recent24h integer not null default 0,
  missing_title_count integer not null default 0,
  missing_summary_count integer not null default 0,
  missing_published_at_count integer not null default 0,
  missing_link_count integer not null default 0,
  requested_url text,
  final_url text,
  content_type text,
  response_ms integer,
  sniffed_type text,
  parsed_ok boolean,
  failure_stage text,
  health_classification text,
  newest_item_published_at timestamptz,
  error text null
);

alter table rss_health_status add column if not exists runner text not null default 'api_news';
alter table rss_health_status add column if not exists country text not null default 'Global';
alter table rss_health_status add column if not exists fetched_count integer not null default 0;
alter table rss_health_status add column if not exists missing_title_count integer not null default 0;
alter table rss_health_status add column if not exists missing_summary_count integer not null default 0;
alter table rss_health_status add column if not exists missing_published_at_count integer not null default 0;
alter table rss_health_status add column if not exists missing_link_count integer not null default 0;
alter table rss_health_status add column if not exists requested_url text;
alter table rss_health_status add column if not exists final_url text;
alter table rss_health_status add column if not exists content_type text;
alter table rss_health_status add column if not exists response_ms integer;
alter table rss_health_status add column if not exists sniffed_type text;
alter table rss_health_status add column if not exists parsed_ok boolean;
alter table rss_health_status add column if not exists failure_stage text;
alter table rss_health_status add column if not exists health_classification text;
alter table rss_health_status add column if not exists newest_item_published_at timestamptz;
create index if not exists idx_rss_health_status_ran_at on rss_health_status(ran_at desc);
create index if not exists idx_rss_health_status_source on rss_health_status(source);
create index if not exists idx_rss_health_status_outlet_id on rss_health_status(outlet_id);
create index if not exists idx_rss_health_status_runner_ran_at on rss_health_status(runner, ran_at desc);
create index if not exists idx_rss_health_status_country on rss_health_status(country);
drop index if exists idx_ingestion_endpoint_runs_ran_at;
drop index if exists idx_ingestion_endpoint_runs_source;
drop index if exists idx_ingestion_endpoint_runs_outlet_id;
drop index if exists idx_ingestion_endpoint_runs_runner_ran_at;

create table if not exists ingest_feed_watermarks_v2 (
  outlet_id text not null,
  source text not null,
  country text not null default 'Global',
  method text not null,
  last_publication_at timestamptz,
  last_fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, method)
);
create index if not exists idx_ingest_feed_watermarks_v2_source on ingest_feed_watermarks_v2(source);
create index if not exists idx_ingest_feed_watermarks_v2_country on ingest_feed_watermarks_v2(country);

create table if not exists ingest_sitemap_policy_v2 (
  outlet_id text primary key,
  source text not null,
  country text not null default 'Global',
  status text not null default 'active',
  reason text,
  last_failure_reason text,
  consecutive_failures integer not null default 0,
  disabled_until timestamptz,
  last_attempted_at timestamptz,
  disabled_since timestamptz,
  last_success_at timestamptz,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ingest_sitemap_policy_v2_status on ingest_sitemap_policy_v2(status);
create index if not exists idx_ingest_sitemap_policy_v2_country on ingest_sitemap_policy_v2(country);
create index if not exists idx_ingest_sitemap_policy_v2_disabled_until on ingest_sitemap_policy_v2(disabled_until);

create table if not exists ingest_ops_hourly (
  hour_bucket timestamptz not null,
  runner text not null default 'worker',
  outlet_id text not null,
  source text not null,
  country text not null default 'Global',
  method text not null,
  attempted_runs integer not null default 0,
  successful_runs integer not null default 0,
  failed_runs integer not null default 0,
  fetched_count integer not null default 0,
  valid_count integer not null default 0,
  missing_title_count integer not null default 0,
  missing_summary_count integer not null default 0,
  missing_published_at_count integer not null default 0,
  missing_link_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hour_bucket, runner, outlet_id, method)
);
create index if not exists idx_ingest_ops_hourly_source on ingest_ops_hourly(source);
create index if not exists idx_ingest_ops_hourly_country on ingest_ops_hourly(country);
create index if not exists idx_ingest_ops_hourly_hour on ingest_ops_hourly(hour_bucket desc);

create table if not exists ingest_ops_daily (
  day_bucket date not null,
  runner text not null default 'worker',
  outlet_id text not null,
  source text not null,
  country text not null default 'Global',
  method text not null,
  attempted_runs integer not null default 0,
  successful_runs integer not null default 0,
  failed_runs integer not null default 0,
  fetched_count integer not null default 0,
  valid_count integer not null default 0,
  missing_title_count integer not null default 0,
  missing_summary_count integer not null default 0,
  missing_published_at_count integer not null default 0,
  missing_link_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day_bucket, runner, outlet_id, method)
);
create index if not exists idx_ingest_ops_daily_source on ingest_ops_daily(source);
create index if not exists idx_ingest_ops_daily_country on ingest_ops_daily(country);
create index if not exists idx_ingest_ops_daily_day on ingest_ops_daily(day_bucket desc);

create table if not exists news_articles (
  external_id text primary key,
  stable_id text null,
  publication_datetime timestamptz not null,
  title_original text not null,
  title_quality text not null default 'ok',
  title_quality_reason text null,
  title_quality_checked_at timestamptz null,
  title_repair_status text not null default 'not_needed',
  title_repair_source text null,
  title_repair_attempted_at timestamptz null,
  title_repaired_at timestamptz null,
  snippet_original text null,
  country text null,
  created_at timestamptz not null default now(),
  url text not null,
  source text not null,
  language text null,
  section text null,
  updated_at timestamptz not null default now()
);

alter table news_articles add column if not exists title_quality text not null default 'ok';
alter table news_articles add column if not exists title_quality_reason text null;
alter table news_articles add column if not exists title_quality_checked_at timestamptz null;
alter table news_articles add column if not exists title_repair_status text not null default 'not_needed';
alter table news_articles add column if not exists title_repair_source text null;
alter table news_articles add column if not exists title_repair_attempted_at timestamptz null;
alter table news_articles add column if not exists title_repaired_at timestamptz null;
create index if not exists idx_news_articles_created_at on news_articles(created_at desc);
create index if not exists idx_news_articles_updated_at on news_articles(updated_at desc);
create index if not exists idx_news_articles_source on news_articles(source);
create index if not exists idx_news_articles_url on news_articles(url);
create index if not exists idx_news_articles_stable_id on news_articles(stable_id);
create index if not exists idx_news_articles_section on news_articles(section);
create index if not exists idx_news_articles_country on news_articles(country);
create index if not exists idx_news_articles_title_quality on news_articles(title_quality);
create index if not exists idx_news_articles_title_repair_status on news_articles(title_repair_status);
drop index if exists idx_external_news_articles_last_seen_at;
drop index if exists idx_external_news_articles_publication_datetime;
drop index if exists idx_external_news_articles_source;
drop index if exists idx_external_news_articles_url;
drop index if exists idx_external_news_articles_section;
drop index if exists idx_external_news_articles_country;

drop index if exists idx_news_articles_category;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_articles'
      and column_name = 'category'
  ) then
    update news_articles
      set section = coalesce(section, category)
      where section is null and category is not null;
  end if;
end;
$$;
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'news_articles'
      and column_name = 'summary_original'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'news_articles'
        and column_name = 'snippet_original'
    ) then
      update news_articles
        set snippet_original = coalesce(snippet_original, summary_original)
        where snippet_original is null;
      alter table news_articles drop column summary_original;
    else
      alter table news_articles rename column summary_original to snippet_original;
    end if;
  end if;
end;
$$;
alter table news_articles drop column if exists category;
alter table news_articles drop column if exists url_norm;
alter table news_articles drop column if exists url_hash;
alter table news_articles drop column if exists title_en;
alter table news_articles drop column if exists summary_en;

alter table news_articles drop column if exists publication_source;
alter table news_articles drop column if exists publication_verified;
alter table news_articles drop column if exists summary_source;
alter table news_articles drop column if exists summary_verified;
alter table news_articles drop column if exists author_name;
alter table news_articles drop column if exists author_email;
alter table news_articles drop column if exists author_source;
alter table news_articles drop column if exists author_verified;
alter table news_articles drop column if exists quality_score;
alter table news_articles drop column if exists is_paywalled;
drop table if exists radar_summary_fetch_logs;
drop table if exists radar_summary_usage_daily;
drop table if exists radar_summary_queue;
