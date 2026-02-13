# Latest Audit Snapshots

This file keeps the latest generated operational snapshots that are tracked in git.

## Daily Source Metadata Volume (US + LATAM)

# Daily Source Metadata Volume (US + LATAM)

- Generated at: 2026-02-12T06:15:06.725Z
- Mode: fast DB report (external_news_articles + ingestion_endpoint_runs)
- Window: last 24 hours
- Sources measured (active, US+LATAM): 136
- Total metadata items observed (24h, raw): 1007325
- Target attainment (raw vs 15000/24h): 6715.5%
- Total metadata items observed (24h, unique): 12109
- Dedupe rate: 98.8%
- World LATAM coverage: 0/0 (0.0% of world)
- Translation coverage (external): title_en 50.6% · summary_en 50.6% (base 13822)
- New-source ratio vs previous report: 2.2% (3/136)
- Sources with endpoint failures: 5

## Region Summary

- US: raw 763203 / unique 5917 across 85 sources
- LATAM: raw 244122 / unique 6192 across 51 sources

## Top 25 Sources (US + LATAM, 24h raw)

| Source | 24h raw | 24h unique | Dedupe | Country | Errors |
| --- | ---: | ---: | ---: | --- | --- |
| LA Times | 75391 | 112 | 99.9% | United States | runs_failed:88/552 |
| Axios | 60544 | 105 | 99.8% | United States | - |
| La Nacion AR | 55973 | 911 | 98.4% | Argentina | - |
| Mashable | 54975 | 153 | 99.7% | United States | - |
| El Cronista | 52858 | 141 | 99.7% | Argentina | - |
| CNN | 41634 | 54 | 99.9% | United States | - |
| The New Yorker | 41277 | 55 | 99.9% | United States | - |
| The Hill | 39455 | 184 | 99.5% | United States | - |
| Wired | 34171 | 66 | 99.8% | United States | - |
| Infobae | 29571 | 2561 | 91.3% | Argentina | - |
| CNBC | 29155 | 144 | 99.5% | United States | - |
| Engadget | 26663 | 74 | 99.7% | United States | - |
| BuzzFeed News | 23566 | 56 | 99.8% | United States | - |
| Fox News | 22909 | 190 | 99.2% | United States | - |
| Ambito Financiero | 22800 | 140 | 99.4% | Argentina | - |
| Breitbart | 15133 | 118 | 99.2% | United States | - |
| The Atlantic | 13617 | 37 | 99.7% | United States | - |
| ABC News | 12710 | 43 | 99.7% | United States | - |
| National Review | 12633 | 22 | 99.8% | United States | - |
| Slate | 12107 | 49 | 99.6% | United States | - |
| Ars Technica | 10699 | 36 | 99.7% | United States | - |
| CBS News | 10520 | 180 | 98.3% | United States | - |
| NBC News | 10332 | 83 | 99.2% | United States | - |
| CNET | 9636 | 65 | 99.3% | United States | - |
| The New York Times | 9230 | 102 | 98.9% | United States | runs_failed:88/552 |

## Notes

- This report reads persisted metadata and endpoint-run logs from PostgreSQL.
- Use `bun run audit:daily-sources` for full network re-validation of RSS/sitemap endpoints.

---

## US + LATAM Source Health

# US + LATAM Source Health Report

- Generated at: 2026-02-07T04:18:18.483Z
- Window: last 24 hours
- Target attainment (raw vs 15000/24h): 46.6%
- World LATAM coverage (all): 1392/3245 (42.9% of world)
- World LATAM coverage (US sources): 3/1856 (0.2% of world)
- World LATAM coverage (LATAM sources): 1389/1389 (100.0% of world)

## Region Summary

| Region | Outlets | Active newsrooms | Distinct domains | 24h raw | 24h unique (by source) | 24h unique (cross-source) | Avg dedupe | Avg failure rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| US | 342 | 231 | 36 | 4845 | 4845 | 4433 | 0.0% | 1.6% |
| LATAM | 86 | 69 | 8 | 2141 | 2141 | 2045 | 0.0% | 1.2% |

## US Top Sources by 24h

| Source | 24h raw | 24h unique | Dedupe | Failure rate | Errors |
| --- | ---: | ---: | ---: | ---: | --- |
| Google Arizona News | 100 | 100 | 0.0% | 0% | - |
| Google California News | 100 | 100 | 0.0% | 0% | - |
| Google Florida News | 100 | 100 | 0.0% | 0% | - |
| Google Georgia News | 100 | 100 | 0.0% | 0% | - |
| Google Illinois News | 100 | 100 | 0.0% | 0% | - |
| Google New York News | 100 | 100 | 0.0% | 0% | - |
| Google Ohio News | 100 | 100 | 0.0% | 0% | - |
| Google Pennsylvania News | 100 | 100 | 0.0% | 0% | - |
| Google Texas News | 100 | 100 | 0.0% | 0% | - |
| Google US Politics Topic | 100 | 100 | 0.0% | 0% | - |
| Google US Business Topic | 95 | 95 | 0.0% | 0% | - |
| Google Washington News | 90 | 90 | 0.0% | 0% | - |
| Mashable | 74 | 74 | 0.0% | 0% | - |
| The Hill | 70 | 70 | 0.0% | 0% | - |
| Sports Illustrated | 68 | 68 | 0.0% | 0% | - |

## LATAM Top Sources by 24h

| Source | Country | 24h raw | 24h unique | Dedupe | Failure rate | Errors |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Google Argentina Topic | Argentina | 100 | 100 | 0.0% | 0% | - |
| Google Chile Topic | Chile | 100 | 100 | 0.0% | 0% | - |
| Google Uruguay Topic | Uruguay | 100 | 100 | 0.0% | 0% | - |
| Infobae | Argentina | 100 | 100 | 0.0% | 50% | sitemap:http_404 |
| La Nacion AR | Argentina | 100 | 100 | 0.0% | 0% | - |
| El Destape | Argentina | 66 | 66 | 0.0% | 0% | - |
| Google LATAM Business Topic | LATAM | 61 | 61 | 0.0% | 0% | - |
| Cooperativa | Chile | 60 | 60 | 0.0% | 0% | - |
| TN Argentina | Argentina | 58 | 58 | 0.0% | 0% | - |
| El Tribuno | Argentina | 54 | 54 | 0.0% | 0% | - |
| Google LATAM Politics Topic | LATAM | 54 | 54 | 0.0% | 0% | - |
| Google Argentina Detail: world | Argentina | 53 | 53 | 0.0% | 0% | - |
| Perfil | Argentina | 53 | 53 | 0.0% | 0% | - |
| Google Chile Detail: business | Chile | 51 | 51 | 0.0% | 0% | - |
| Google Argentina Detail: politics | Argentina | 50 | 50 | 0.0% | 0% | - |

## US Highest Failure Rate

| Source | Failure rate | Endpoints failed/attempted | Errors |
| --- | ---: | --- | --- |
| Barrons | 100% | 1/1 | rss:err:Unable to connect. Is the computer able to access the url? |
| Inc Magazine | 100% | 1/1 | rss:http_404 |
| Politico | 100% | 1/1 | rss:http_403 |
| Vice News | 100% | 1/1 | rss:http_404 |
| The New York Times | 50% | 1/2 | sitemap:http_404 |
| LA Times | 50% | 1/2 | sitemap:http_404 |
| NPR | 50% | 1/2 | sitemap:err:The operation was aborted. |
| Google Arizona News | 0% | 0/1 | - |
| Google California News | 0% | 0/1 | - |
| Google Florida News | 0% | 0/1 | - |
| Google Georgia News | 0% | 0/1 | - |
| Google Illinois News | 0% | 0/1 | - |
| Google New York News | 0% | 0/1 | - |
| Google Ohio News | 0% | 0/1 | - |
| Google Pennsylvania News | 0% | 0/1 | - |

## LATAM Highest Failure Rate

| Source | Country | Failure rate | Endpoints failed/attempted | Errors |
| --- | --- | ---: | --- | --- |
| Infobae | Argentina | 50% | 1/2 | sitemap:http_404 |
| El Pais UY | Uruguay | 50% | 1/2 | sitemap:http_403 |
| Google Argentina Topic | Argentina | 0% | 0/1 | - |
| Google Chile Topic | Chile | 0% | 0/1 | - |
| Google Uruguay Topic | Uruguay | 0% | 0/1 | - |
| La Nacion AR | Argentina | 0% | 0/2 | - |
| El Destape | Argentina | 0% | 0/1 | - |
| Google LATAM Business Topic | LATAM | 0% | 0/1 | - |
| Cooperativa | Chile | 0% | 0/1 | - |
| TN Argentina | Argentina | 0% | 0/1 | - |
| El Tribuno | Argentina | 0% | 0/1 | - |
| Google LATAM Politics Topic | LATAM | 0% | 0/1 | - |
| Google Argentina Detail: world | Argentina | 0% | 0/1 | - |
| Perfil | Argentina | 0% | 0/1 | - |
| Google Chile Detail: business | Chile | 0% | 0/1 | - |

---

## Expansion Promotion Decisions

# Expansion Promotion Decisions

- Generated at: 2026-02-06T18:22:19.983Z
- Source health file: /Users/myungeunlee/Desktop/mylee/presslab/audits/us_latam_source_health_2026-02-06.csv
- Rule: exploratory_off_by_default AND recent_24h >= 5 AND failure_rate <= 0.2

- Promoted this run: 70
- Exploratory before apply: 90
- Exploratory after apply: 0
- Total promoted after apply: 70

## Promoted This Run

- 24 Horas Chile
- America TV AR
- Atlanta Journal-Constitution
- BAE Negocios
- Billboard
- Bleacher Report
- Boston Globe
- Brecha
- C5N Argentina
- CBS Sports
- Chicago Tribune
- Christian Science Monitor
- Cleveland Plain Dealer
- CNN Chile
- Complex
- Dallas Morning News
- Deadline
- Denver Post
- Detroit Free Press
- El Desconcierto
- El Destape
- El Mostrador
- El Tribuno
- ESPN
- Esquire
- GQ
- Honolulu Star-Advertiser
- iProfesional
- La Capital Rosario
- La Discusion
- La Politica Online
- La Voz del Interior
- Los Andes
- Meganoticias
- Miami Herald
- MinutoUno
- New York Post
- Newsweek
- Ole
- Pauta
- PBS NewsHour
- People
- Perfil
- Philadelphia Inquirer
- ProPublica
- Quartz
- Reason
- Refinery29
- Rolling Stone
- San Diego Union-Tribune
- San Francisco Chronicle
- San Jose Mercury News
- Scripps News
- Seattle Times
- Semafor
- Space.com
- Sports Illustrated
- Star Tribune
- STAT News
- Subrayado
- T13 Chile
- Tampa Bay Times
- Telemundo UY
- Telenoche UY
- The Clinic Chile
- The Daily Beast
- The Hollywood Reporter
- TN Argentina
- Variety
- Vulture

## Exploratory After Apply


