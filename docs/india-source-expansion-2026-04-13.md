# India Source Expansion - 2026-04-13

## Baseline

- Pre-add baseline:
  - `audits/india-current-pre-add-20260413.json`
  - `3544 unique / 24h`
  - `3968 raw / 24h`

## Batch 1

- Candidate file:
  - `data/india-volume-batch1-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/india-volume-batch1-coverage-20260413.json`
  - `+2160 unique / 24h`
- Clean isolated coverage after India-specific URL filtering:
  - `audits/india-volume-batch1-clean-coverage-20260413.json`
  - `+1655 unique / 24h`

Accepted sources:

- `Amar Ujala (Breaking)` + news sitemap
- `Scroll.in` + news sitemap
- `The Quint` + sitemap
- `Telangana Today` + news sitemap
- `Moneycontrol` + news sitemap
- `The Siasat Daily` + news sitemap
- `TelecomTalk` + news sitemap
- `Medical Dialogues` + daily news sitemap
- `The Better India` + news sitemap
- `Economic Times` + sitemap
- `Republic World` + news sitemap

Rejected / not added:

- `TechGenYZ`
  - `0 / 24h` in the clean candidate audit

Top clean contributors:

- `Economic Times`: `+471`
- `Amar Ujala (Breaking)`: `+371`
- `Moneycontrol`: `+341`
- `Republic World`: `+141`
- `Telangana Today`: `+132`
- `The Siasat Daily`: `+92`
- `Medical Dialogues`: `+53`
- `Scroll.in`: `+23`

## Quality Notes

- `Amar Ujala` sitemap mixed poetry, video, photo-gallery, web-stories, and live pages.
  - Filtered: `/kavya/`, `/video/`, `/video-shots/`, `/photo-gallery/`, `/web-stories/`, `/live/`
- `Moneycontrol` sitemap mixed entertainment, sports, lifestyle, astrology, video, and podcast content with news/business.
  - Filtered soft/non-core paths to keep the signal closer to business/news coverage.
- `Republic World` sitemap mixed entertainment, videos, shows, viral, initiatives, and lifestyle content.
  - Filtered those paths out.
- `Economic Times` sitemap mixed `Panache`, `newsblogs`, and astrology content.
  - Filtered those paths out.
- `Scroll.in` sitemap mixed `/reel/` and `/video/` content.
  - Filtered those paths out.
- `The Quint` sitemap mixed `/brandstudio/` sponsored pages.
  - Filtered those paths out.

## Atlas Updates

Updated existing India feeds with sitemap coverage:

- `Amar Ujala (Breaking)`
- `Scroll.in`
- `The Quint`
- `Telangana Today`
- `Moneycontrol`
- `The Siasat Daily`
- `TelecomTalk`
- `Medical Dialogues`
- `The Better India`

Added new sitemap-only India sources:

- `Economic Times`
- `Republic World`

## Current State After Batch 1

- Current full India coverage:
  - `audits/india-current-coverage-20260413.json`
  - `4905 unique / 24h`
  - `5616 raw / 24h`

Interpretation:

- Full current moved from `3544 -> 4905 unique / 24h`, a net gain of `+1361 unique / 24h`.
- The larger clean isolated gain (`+1655`) is the better measure of true candidate headroom.
- The delta between isolated and full-current is expected because the 24-hour window moved while validation was running.

## Ingest Smoke

- Sitemap-only worker smoke run on the 11 accepted sources:
  - `endpoints attempted=10`
  - `ok=10`
  - `failed=0`
  - `newsArticles=2974`

Note:

- One batch source was skipped by an existing sitemap policy state during the smoke run.
- The attempted endpoints were all healthy.

## Supporting Files

- URL filters:
  - `lib/article-url-filters.ts`
- Publisher mappings:
  - `lib/publisher-groups.ts`
- Candidate list:
  - `data/india-volume-batch1-candidates-20260413.json`

## Batch 2

- Candidate files:
  - `data/india-volume-batch2-candidates-20260413.json`
  - `data/india-volume-batch2a-candidates-20260413.json`
  - `data/india-volume-batch2b-candidates-20260413.json`
  - `data/india-volume-batch2-accepted-candidates-20260413.json`
- Raw isolated coverage:
  - `audits/india-volume-batch2a-coverage-20260413.json`
  - `audits/india-business-standard-coverage-20260413.json`
  - `+1007 unique / 24h`
- Clean isolated coverage after batch-2 URL filtering:
  - `News18`: `+217`
  - `Firstpost`: `+94`
  - `DNA India (India)`: `+33`
  - `Business Standard`: `+321`
  - total `+665 unique / 24h`

Accepted sources:

- `Firstpost` + Google News sitemap
- `DNA India (India)` + Google News sitemap
- `News18` + Google News sitemap
- `Business Standard` + news sitemap

Batch-2 quality filters:

- `Firstpost`
  - filtered `/firstcricket/`, `/sports/`, `/lifestyle/`, `/opinion/`, `/entertainment/`, `/auto/`
- `DNA India`
  - filtered `/bollywood/`, `/entertainment/`, `/cricket/`
- `News18`
  - filtered `/viral/`, `/movies/`, `/lifestyle/`, `/cricket/`, `/sports/`, `/photogallery/`
- `Business Standard`
  - filtered `/sports/`, `/cricket/`, `/opinion/`, `/health/`, `/book/`, `/content/specials/`

Batch-2 blocked or weak candidates:

- `YourStory`
  - RSS remains active at `7 / 24h`, but sitemap automation still stalls behind Cloudflare
- `NDTV (Latest)`
  - monthly child sitemap parsed, but contributed only `1 / 24h`

Atlas additions in batch 2:

- Added sitemap coverage to existing:
  - `Firstpost`
  - `DNA India (India)`
- Added new sitemap-only sources:
  - `News18`
  - `Business Standard`

## Current State After Batch 2

- Current full India coverage:
  - `audits/india-current-coverage-20260413.json`
  - `5688 unique / 24h`
  - `6417 raw / 24h`

Interpretation:

- Full current moved from `3544 -> 5688 unique / 24h`, a net gain of `+2144 unique / 24h`.
- Batch 2 clean isolated gain was `+665 unique / 24h`.
- Batch 2 raised current India from `4905 -> 5688 unique / 24h`, a net gain of `+783 unique / 24h`.

Batch-2 current source output:

- `Business Standard`: `320 / 24h`
- `News18`: `215 / 24h`
- `Firstpost`: `94 / 24h`
- `DNA India (India)`: `34 / 24h`

## Batch 2 Validation

- `bun run atlas:export-catalog`
  - refreshed `data/rss-catalog.csv` and `data/rss-catalog.opml`
- `bun run typecheck`
  - passed
- sitemap ingest smoke on `Firstpost`, `DNA India (India)`, `News18`, `Business Standard`
  - `endpoints=2`
  - `ok=2`
  - `failed=0`
  - `newsArticles=652`

Note:

- `Business Standard` and `News18` were ingested in the smoke run.
- `Firstpost` and `DNA India (India)` remained behind existing sitemap policy state during that run.
