---
name: radar-discord-reporting
description: Produce and validate PressLab ops/reporting messages for Discord from DB-backed metrics. Use when tasks involve daily source reports, hourly ops summaries, dry-run payload checks, alert formatting quality, or tuning threshold-driven alert behavior.
---

# Radar Discord Reporting

Use this skill to generate reliable operational summaries and alerts before sending to Discord.

## Workflow

1. Build report inputs.
- Run report scripts and ensure data freshness.
- Prefer dry-run for payload validation first.

2. Validate payload quality.
- Confirm key metrics are present.
- Confirm non-green alerts are justified by thresholds.
- Redact or avoid sensitive internals.

3. Send only after validation.
- Use send mode after dry-run review passes.
- Avoid noisy duplicate alerts without state change.

4. Report.
- `Findings`
- `Payload Decisions`
- `Validation`
- `Rollback`

## References

- Payload checklist: `references/payload-checklist.md`
- Threshold tuning: `references/threshold-tuning.md`
