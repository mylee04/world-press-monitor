# Israel Overseas Coverage Plan

Date: 2026-04-12

## Constraint

Current `country=Israel` ingestion behaves like `publisher country`, not `article topic`.

If foreign publishers are inserted into the Israel atlas block, `source_country='Israel'` will stop meaning "Israeli publishers" and will start meaning "publishers grouped under Israel coverage."

## Recommendation

Use one of these models before pushing for `4k/day`.

1. Preferred: keep the existing Israel atlas block for Israeli publishers only, and add a separate `coverage_country=Israel` layer for foreign publishers that frequently cover Israel.
2. Fast path: add foreign publishers under the Israel atlas block, but explicitly accept that Israel country metrics will become "Israel coverage volume" instead of "Israeli publisher volume."

## Verified Foreign Feed Candidates

| Source | Publisher country | Feed | Fit | Estimated daily articles |
| --- | --- | --- | --- | --- |
| BBC News - Middle East | UK | https://feeds.bbci.co.uk/news/world/middle_east/rss.xml | High | 15-40 |
| NYT - World - Middle East | US | https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml | High | 10-25 |
| The Guardian - Middle East | UK | https://www.theguardian.com/world/middleeast/rss | High | 20-50 |
| France 24 - Middle East | France | https://www.france24.com/en/middle-east/rss | High | 20-60 |
| Al Jazeera - All News | Qatar | https://www.aljazeera.com/xml/rss/all.xml | Medium, needs topic filter | 60-180 |
| Jewish Telegraphic Agency | US | https://www.jta.org/feed | High | 20-60 |
| JNS | US / Israel-focused | https://www.jns.org/index.rss | Very high | 30-120 |
| Algemeiner | US | https://www.algemeiner.com/feed/ | Medium-high | 10-40 |

## Volume View

- Current verified Israeli publisher volume after the latest run: about `2.1k/24h`
- `i24NEWS` added about `+48` net 24h articles in the latest measurement
- Verified foreign feeds above can realistically add about `150-500/day` with good precision
- If broad Middle East feeds are accepted with topic filtering, the upside is closer to `400-1000/day`
- Hitting `4k/day` consistently is still aggressive without either:
  - wire-heavy global coverage, or
  - a topic-filtered coverage layer that accepts non-Israeli publishers at scale

## Suggested Rollout

1. Add the three Israel-heavy Jewish/international feeds first: `JTA`, `JNS`, `Algemeiner`
2. Add section feeds with stable editorial scope: `BBC`, `NYT`, `Guardian`, `France 24`
3. Add broader feeds like `Al Jazeera` only with URL or title keyword filters for `Israel`, `IDF`, `Jerusalem`, `Gaza`, `West Bank`, `Lebanon`, `Iran`, `Netanyahu`, `hostages`
4. Re-measure 24h coverage volume before deciding whether to broaden further

