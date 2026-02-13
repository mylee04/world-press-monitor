# Radar Ops SQL Checks

## Ingest freshness

```sql
select
  count(*) filter (where created_at > now() - interval '1 hour') as inserted_1h,
  count(*) filter (where created_at > now() - interval '24 hours') as inserted_24h
from external_news_articles;
```

## Last seen freshness

```sql
select max(last_seen_at) as last_seen_max
from external_news_articles;
```

## Endpoint failure rate (1h)

```sql
select
  count(*) as total_runs,
  count(*) filter (where success = false) as failed_runs
from ingestion_endpoint_runs
where started_at > now() - interval '1 hour';
```

## Summary queue backlog

```sql
select status, count(*) as rows
from radar_summary_queue
group by status
order by status;
```

## Summary fetch failure codes (1h)

```sql
select failure_code, count(*) as attempts
from radar_summary_fetch_logs
where created_at > now() - interval '1 hour'
group by failure_code
order by attempts desc nulls last;
```
