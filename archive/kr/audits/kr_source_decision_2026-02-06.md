# KR Source Decision Log (2026-02-06)

## Scope
- SBS, KBS, MBC, JTBC, YTN local broadcaster ingestion candidates.

## Verification Inputs
- `audits/kr_source_http_verification_2026-02-06.md`
- `audits/kr_source_http_verification_2026-02-06.json`
- External spot checks recorded in verification notes.

## Decisions
- Added 5 KR broadcaster source candidates to `data/outlets.ts` under `multilingual_core`.
- Set all KR broadcaster candidates to `manual_review` (default OFF).
- Kept portal/local existing KR sources (`Naver News KR`, `Yonhap KR`, `Korea Local Mix`) unchanged.
- MBC direct RSS candidate is not enabled (sitemap path only on source config).

## Rationale
- Current local dev environment cannot resolve multiple KR domains (network-level DNS errors), so endpoint-level confidence cannot be established from this runtime.
- External spot checks suggest:
  - SBS RSS can be blocked by anti-bot policy (403 pattern).
  - MBC `news_00.xml` RSS can redirect to error page.

## Next Action Gate
- Re-run `bun run verify:kr-sources` in production-like network runtime.
- Promote any source from `manual_review` to `keep_secondary` only when feed/sitemap returns stable XML.
- Mark source deprecated if endpoint repeatedly returns `not_found`/error redirects.
