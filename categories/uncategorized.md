# Uncategorized (`uncategorized`) — fallback

| Field | Value |
|-------|-------|
| Category ID | `uncategorized` |
| Gmail label | `GMO/uncategorized` |
| Priority | none — membership decided by **exclusion** |
| Detection | no rules · AI verdict or hard fallback only |

## Definition

Everything the system cannot (or should not try to) classify with the current pattern
set. Membership is legitimate and expected — this is the **triage inbox** of the
category system, not a bug bucket.

An address lands here when:

1. No rule in any category matched, **and**
2. The embedding classifier returned `uncategorized`, or the embedding tier
   failed/was unavailable (the `GMO/needs-review` label marks that case).

## What typically lands here

- Personal one-to-one mail from individuals (friends, family, landlords).
- Government and public services (`gov.br`, city halls, courts).
- Schools, universities, course platforms.
- Travel, delivery and shipping notifications.
- Healthcare (clinics, labs, appointment confirmations).
- One-off senders that will never e-mail again.

## Detection patterns

**None, by design.** Do **not** add domains or keywords to this category — if you find
yourself wanting to, that is the signal to create a **new category** instead
(see *Triage workflow* below).

## AI fallback hints

The embedding tier has no prompt — classification is similarity-based. `uncategorized`
is chosen when **no category centroid is a confident match**: one-to-one human mail
with no professional context, institutions not covered by any category, or messages
too ambiguous to decide.

## False Positive Patterns (rule-gap signals)

Inverted here: this category never *matches* anything, so its failure mode is **mail
that lands here despite having an obvious home**. Each recurring pattern is a detector
gap with a concrete fix:

| Pattern seen in Uncategorized | Why it slipped through | Fix |
|-------------------------------|------------------------|-----|
| A recurring sender with an obvious topic | no domain/keyword rule covers it yet | promote its domain/keywords to the right `categories/<id>.md` + `Config.gs` |
| Recruiter InMail with free-text subject, no marker | display name lacked "via LinkedIn" (older templates) | confirm `via linkedin` keyword is active; else extend job-search patterns |
| Bank mail with generic subjects ("Important notice") | bank domain missing from `finance` | add the domain to finance |
| Job alerts in a new subject format | job-board keyword gap | extend `job-search` keywords |
| Mail tagged `GMO/needs-review` piling up | embedding tier failing (key/limits), not a pattern gap | check `GEMINI_API_KEY` and quotas — many of these belong elsewhere |

## Triage workflow (recommended)

| Marker in Gmail | Meaning | Action |
|------------------|---------|--------|
| `GMO/uncategorized` only | AI decided; uncertain fit | skim periodically |
| `GMO/needs-review` present | embedding tier unavailable or inconclusive | check `GEMINI_API_KEY` if it keeps growing |

If you keep seeing the **same sender** here:

1. Add its domain/keywords to the right `categories/<id>.md` **and** `src/Config.gs`.
2. Re-label the affected e-mails manually in Gmail (`GMO/uncategorized` → the right
   `GMO/…` label); existing mail is not re-classified retroactively.
3. If a whole *class* of senders keeps appearing (e.g. every delivery notification),
   create a new category: new `categories/<id>.md` → `CATEGORIES` entry in
   `src/Config.gs` → run `bootstrapLabels()`.
