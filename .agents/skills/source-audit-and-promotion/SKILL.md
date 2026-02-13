---
name: source-audit-and-promotion
description: Audit source reliability and manage source promotion/demotion decisions for PressLab ingestion. Use when tasks involve daily source audits, HTTP/RSS/sitemap verification, source quality scoring, expansion source promotion decisions, or policy application via existing audit and promotion scripts.
---

# Source Audit And Promotion

Use this skill to run repeatable source health audits and convert findings into safe policy actions.

## Workflow

1. Run current-state audit.
- Use existing audit/report scripts first.
- Capture endpoint success, freshness, and coverage by source.

2. Classify source outcome.
- Keep: healthy and stable.
- Review: inconsistent or borderline.
- Promote: proven quality and volume.
- Demote/disable: persistent failures or noise.

3. Apply policy changes safely.
- Prefer dry-run mode before apply mode.
- Apply small batches and re-check impact.

4. Validate post-change impact.
- Compare before/after source counts and failure rates.
- Confirm no critical country/source coverage regressions.

5. Report.
- `Findings`
- `Policy Actions`
- `Validation`
- `Rollback`

## References

- Audit checklist: `references/audit-checklist.md`
- Promotion policy checklist: `references/promotion-policy-checklist.md`
