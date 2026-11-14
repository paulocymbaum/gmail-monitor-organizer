# Newsletters (`newsletters`)

| Field | Value |
|-------|-------|
| Category ID | `newsletters` |
| Gmail label | `GMO/newsletters` |
| Priority | **6 of 14** (after the spam filter, `shopping`, `news` and `ads`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

One-to-many, permission-based mail sent by publications and marketing automation
platforms: newsletters, weekly/monthly digests, webinar/event invitations, and
"you're receiving this because you signed up" mail. The typical sender is a *platform
sending on behalf of a publication or brand*, not a person. Discount/coupon blasts
are promotional mail and live in `ads` (priority 4), which outranks this category.

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `substack.com` | current | Substack newsletters |
| `beehiiv.com` | current | beehiiv newsletters |
| `mailchimp.com` | current | Mailchimp marketing sends |
| `constantcontact.com` | current | marketing platform |
| `convertkit.com` | current | creator newsletters |
| `rdstation.com.br` · `rdstation.com` | current | RD Station — dominant BR marketing automation |
| `e-goi.com` · `e-goi.net` | current | E-goi (BR/PT ESP) |
| `allin.com.br` | current | All In (BR ESP) |
| `klicksend.com.br` | current | Klicksend (BR ESP) |
| `virtualtarget.com.br` | current | Virtual Target (BR ESP) |
| `klaviyo.com` | suggested | global ESP used by BR stores |
| `mcdlv.net` | suggested | Mailchimp's actual sending domain |
| `sendgrid.net` | suggested | bulk-sending infrastructure |
| `campaign-archive.com` | suggested | Mailchimp web-archive links |
| `ghost.io` | suggested | Ghost publications |

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `newsletter` | current | name/subject/snippet | high signal in subject & name |
| `digest` | current | name/subject/snippet | e.g. "Weekly digest" |
| `webinar` | current | name/subject/snippet | event invitations |
| `unsubscribe` | current ⚠ | **subject/name only (recommended)** | footer-prone — see False Positive Patterns |
| `boletim` | current | name/subject/snippet | PT newsletter classic ("boletim semanal") — aligns rules with the tree's `bulk_pt` marker |
| `you subscribed` | suggested | subject/snippet | welcome/confirmation mail |
| `roundup` | suggested | subject | "Weekly roundup" digests |

## AI fallback hints

Verdict **newsletters** when the mail shows: an unsubscribe call-to-action, bulk-sender
branding ("sent by …"), promotional CTAs with many links, publication cadence language
("weekly", "issue #", "this week's edition"), or a marketing platform relaying for a
brand/publication.

Verdict **another category** when: a transactional receipt/invoice (→ finance), a
notification about the user's own account activity (→ social), or a person writing
directly (→ work / uncategorized).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `The Pragmatic Engineer <no-reply@substack.com>` | `Issue #123: Platform teams` | newsletters | domain `substack.com` |
| `Beehiiv <news@beehiiv.com>` | `Your weekly digest is here` | newsletters | domain + keyword `digest` |
| `RD Station <marketing@rdstation.com.br>` | `Novidades: guia de email marketing` | newsletters | BR marketing automation — domain `rdstation.com.br` |
| `Clube do Livro <clube@clubedolivro.com.br>` | `Boletim literário: lançamentos do mês` | newsletters | keyword `boletim` |
| `Magalu <novidades@magazineluiza.com.br>` | `Novidades da semana na sua categoria` | **shopping** | store domain (2) beats bulk keywords (5) — store mail stays with the store |
| `Acme Corp <marketing@acmecorp.com>` | `30% off — ends Sunday` | **ads** | keyword `% off` (priority 4) — promo blasts are `ads` now |
| `Nubank <nao-responda@nubank.com.br>` | `Your invoice is ready` | **finance** | no newsletter rule hit; finance domain + keyword at priority 6 |
| `Jane Doe <jane@gmail.com>` | `Lunch tomorrow?` | uncategorized | one-to-one human mail |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| `unsubscribe` footer exposed in snippets | preheader text sometimes surfaces footer links, swallowing unrelated mail at priority 5 | restrict `unsubscribe` to **subject/name** matching in `Config.gs` |
| Bank/fintech marketing digests | `digest` fires at priority 5 **before** `finance` checks its domains (6) | intended default; place `finance` above `newsletters` in `CATEGORIES` if money-platform marketing should stay in Finance |
| Work-related webinar/event invites | `webinar` keyword at priority 5 beats `work` (9) | acceptable default — event marketing *is* bulk mail; restrict the keyword if it gets noisy |
| Transactional summaries titled "digest" ("your weekly account summary") | digest wording on transactional mail from banks/SaaS | same as the bank-digest row: reorder categories or accept |
| Personal mail forwarding a newsletter | pasted newsletter text puts `newsletter`/`unsubscribe` in the **snippet** | snippet hits are the weakest signal — if it happens, restrict affected keywords to subject/name |

## Edge cases & tuning decisions

- **LinkedIn newsletters** — subjects often contain "newsletter"/"digest"; priority 5
  routes them here **before** `social` checks `linkedin.com` (8). This is intentional
  (content mail ≠ account notifications); flip the category order in `Config.gs` to
  change it.
- **Broker/fintech marketing** — a brokerage promo with "digest" in the subject lands
  here because newsletters runs first (see table). Move the platform's domain into
  `finance` and place `finance` above `newsletters` to change this.
- **Promotional blasts** — "30% off"-style marketing is captured by `ads` (4) before
  this category's generic keywords can fire; only bulk mail without a purchase
  incentive (digests, webinars) reaches the newsletter leaves/branches.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `medium.com`
(Medium Daily Digest, pega keyword `digest`), `tldr.tech` (TLDR) e
`producthunt.com` (Product Hunt).
