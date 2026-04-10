# Source Scheduling Group Design

## Problem

The hourly hybrid selector promotes outlets into the `head` set from recent `news_articles.created_at` counts, grouped by the exact `(source, country)` pair.

Current code path:

- `readNewsArticlesRecentCountsWithDeps()` groups by `source, country`
- `selectOutletsForRun()` looks up each atlas outlet by `outlet.name, outlet.country`

That means newly added section feeds behave like brand new sources even when they are clearly part of a strong parent source.

Examples from the April 9, 2026 investigation:

- `New York Post - US News` / `New York Post - World News`: `0` runs in the last 5 hours
- `La Razón - *`: `0` runs in the last 5 hours
- `O Antagonista - *`: only `1` run each in the last 5 hours
- `Tportal - Vijesti` / `Tportal - Sport`: only `2` / `1` runs in the last 5 hours

These section feeds were added to widen source exposure, but they still enter scheduling as low-history long-tail outlets because their own `source` rows start near zero.

## Why This Happens

The current selector uses the exact source name as the scheduling identity.

- Parent source count example: `La Razón`
- Child section source names: `La Razón - Internacional`, `La Razón - Economía`, `La Razón - Deportes`, `La Razón - Tecnología`, `La Razón - España`

Even if `La Razón` is a strong head source, each child starts with no recent history and is treated independently.

## Recommended Design

Add an optional atlas field:

- `schedulingSource`

Meaning:

- Use `schedulingSource` only for head/long-tail scheduling priority lookup
- Keep `name` unchanged for persistence, reporting, and diagnostics

Example atlas shape:

```json
{
  "name": "La Razón - Internacional",
  "url": "https://www.larazon.es/internacional/?outputType=xml",
  "schedulingSource": "La Razón"
}
```

## Minimal Code Change

1. Extend atlas feed parsing with optional `schedulingSource`
2. Carry it into `OutletFeed`
3. In `selectOutletsForRun()`, use:

```ts
buildSourceCountryKey(outlet.schedulingSource || outlet.name, outlet.country)
```

instead of:

```ts
buildSourceCountryKey(outlet.name, outlet.country)
```

This keeps all existing storage semantics unchanged while letting sibling feeds inherit parent head priority.

## Why This Is The Right Scope

This solves the actual scheduling problem without creating larger side effects.

What it does:

- improves selection priority
- helps section siblings get revisited like the parent source
- preserves current article `source` labels in `news_articles`

What it does not do:

- rename stored article sources
- merge analytics rows
- change map/report semantics
- require a database migration

## Rollout Targets

The first rollout should be limited to the section feeds already added for these parents:

- `New York Post`
- `La Razón`
- `O Antagonista`
- `Tportal`

These are the sources where endpoint expansion is already done, but scheduling still lags because the new feed names have little recent history.

## Guardrails

This field should stay opt-in.

- Only annotate section feeds we explicitly want to inherit parent priority
- Do not auto-apply to every sibling feed in atlas
- Recheck head budget after rollout because one strong parent can now pull several siblings into the head set

If needed later, add a simple cap such as:

- max inherited siblings per scheduling source per run

But that should not be the first step.

## Follow-up

After implementing `schedulingSource`, re-check:

1. whether `New York Post`, `La Razón`, `O Antagonista`, and `Tportal` sibling feeds start appearing every hour
2. whether the strict-risk watchlist needs a second view that understands sibling coverage, because the current strict-risk script only treats `RSS-only same source key` as resolved
