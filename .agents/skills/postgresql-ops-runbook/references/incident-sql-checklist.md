# PostgreSQL Incident SQL Checklist

## 1) Connectivity and Session Basics

```sql
select now() as db_time, version();
select current_database(), current_user;
```

## 2) Ingestion/Write Freshness (PressLab-oriented)

```sql
select
  count(*) filter (where created_at > now() - interval '1 hour') as inserted_1h,
  count(*) filter (where created_at > now() - interval '24 hours') as inserted_24h
from external_news_articles;
```

## 3) Queue Backlog

```sql
select status, count(*) as rows
from radar_summary_queue
group by status
order by status;
```

## 4) Endpoint Failure Ratio (recent)

```sql
select
  count(*) filter (where success = false) as failed_runs,
  count(*) as total_runs
from ingestion_endpoint_runs
where started_at > now() - interval '1 hour';
```

## 5) Blocking/Lock Quick View

```sql
select pid, usename, state, wait_event_type, wait_event, query
from pg_stat_activity
where state <> 'idle'
order by query_start asc
limit 20;
```
