# 🗂️ Category Patterns

This folder is the **source of truth** for how Gmail Monitor & Organizer decides which
category an e-mail (and its sender address) belongs to. One Markdown file per category:

| Priority | Category ID | Gmail label | Pattern doc |
|---:|-------------|-------------|-------------|
| 1 | `spam-trash` | `GMO/spam-trash` | [spam-trash.md](./spam-trash.md) |
| 2 | `shopping` | `GMO/shopping` | [shopping.md](./shopping.md) |
| 3 | `news` | `GMO/news` | [news.md](./news.md) |
| 4 | `ads` | `GMO/ads` | [ads.md](./ads.md) |
| 5 | `servicos` | `GMO/servicos` | [servicos.md](./servicos.md) |
| 6 | `newsletters` | `GMO/newsletters` | [newsletters.md](./newsletters.md) |
| 7 | `finance` | `GMO/finance` | [finance.md](./finance.md) |
| 8 | `governo` | `GMO/governo` | [governo.md](./governo.md) |
| 9 | `viagens` | `GMO/viagens` | [viagens.md](./viagens.md) |
| 10 | `saude` | `GMO/saude` | [saude.md](./saude.md) |
| 11 | `job-search` | `GMO/job-search` | [job-search.md](./job-search.md) |
| 12 | `social` | `GMO/social` | [social.md](./social.md) |
| 13 | `work` | `GMO/work` | [work.md](./work.md) |
| — | `uncategorized` *(fallback)* | `GMO/uncategorized` | [uncategorized.md](./uncategorized.md) |

## How a category is decided

Per message, in strict order (see [ARCHITECTURE.md](../ARCHITECTURE.md), §4.4):

1. **Sender cache** — if this address was classified before, reuse that verdict.
2. **Rules** — categories are evaluated in **priority order** (table above); within a
   category, `domains` are checked first, then `keywords`. First hit wins.
3. **Decision tree** — no rule matched → a local JSON decision-tree model scores the
   message's binary features in pure JS (microseconds, no API cost). Confident verdicts
   win; low-confidence ones pass through (see ARCHITECTURE.md §4.5).
4. **AI fallback** — still unclassified → the free embedding tier classifies by token
   similarity against the category semantics described here. The verdict is cached, so this happens **once per address, ever**.
5. **Fallback** — AI unavailable or inconclusive → `uncategorized`.

### Rule matching semantics

- **Domain patterns** match the sender's e-mail domain **or any subdomain**
  (`mail.linkedin.com` matches `linkedin.com`).
- **Keyword patterns** are case-insensitive substring matches against the sender
  **display name**, **subject**, and **snippet** — unless a doc restricts a keyword to
  subject/sender only (footer-prone keywords; see each doc's *False Positive Patterns*
  table).

## Each doc follows the same template

1. **Definition** — what belongs in this bucket, in plain language.
2. **Detection patterns** — concrete `domains` / `keywords` for `src/Config.gs`,
   marked **current** (already in config) or **suggested** (candidates to promote).
3. **AI fallback hints** — the category semantics the embedding prototypes capture;
   what to exclude.
4. **Examples** — realistic From/Subject pairs with expected verdicts and reasons.
5. **False Positive Patterns** — table of concrete patterns that could land here
   wrongly, why they trigger, and the guardrail for each.
6. **Edge cases & tuning decisions** — known ambiguities and configuration trade-offs.

## Adding or changing a category

1. Create or extend `categories/<id>.md` following the template above.
2. Mirror the patterns in `CATEGORIES` (`src/Config.gs`).
3. Run `bootstrapLabels()` so the matching `GMO/<id>` label gets created.
