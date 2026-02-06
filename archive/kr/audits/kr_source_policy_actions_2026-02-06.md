# KR Source Policy Actions

- Generated at: 2026-02-06T05:01:56.635Z
- Audit source: /Users/myungeunlee/Desktop/mylee/presslab/audits/kr_source_http_verification_2026-02-06.json
- Mode: apply

| Broadcaster | Outlet | Top Statuses | Decision | Deprecate Streak | Auto Disabled |
| --- | --- | --- | --- | --- | --- |
| SBS | SBS News KR | network_error, network_error | promote_keep_secondary | 0 | no |
| KBS | KBS News KR | network_error, network_error | promote_keep_secondary | 0 | no |
| MBC | MBC News KR | network_error, network_error | deprecate_candidate | 1 | no |
| JTBC | JTBC News KR | network_error, network_error | promote_keep_secondary | 0 | no |
| YTN | YTN News KR | network_error, network_error | deprecate_candidate | 1 | no |

Decision semantics:
- `promote_keep_secondary`: move to `KEEP_SECONDARY`, remove from `MANUAL_REVIEW`, clear deprecation.
- `deprecate_candidate`: keep in `MANUAL_REVIEW`; if streak >= 2, add to `DEPRECATED_OUTLETS` (hidden from source list/presets).
- `hold_manual_review`: keep in `MANUAL_REVIEW`; no auto-disable.
