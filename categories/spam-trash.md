# Spam & Trash (`spam-trash`)

| Field | Value |
|-------|-------|
| Category ID | `spam-trash` |
| Gmail label | `GMO/spam-trash` |
| Priority | **1 of 14** (evaluated first — junk filter) |
| Detection | AI only by default; rules promoted over time |

## Definition

Unsolicited, junk or dangerous mail that reached the inbox **instead of** Gmail's own
spam folder: scams, phishing, unwanted promotions from one-off senders, chain mail,
fake prizes. The label doubles as a **personal blocklist** of sender addresses — useful
to build "auto-delete from this sender" Gmail filters later.

> ⚠️ **Scope note:** the ingestion query already excludes Gmail's `spam` and `trash`
> folders (`-in:spam -in:trash`). This category only catches junk that landed in the
> inbox — it never touches what Gmail already filtered.

## Why it runs first

Junk must never pollute the other category labels. The trade-off: a false positive
files legitimate mail here, which is why the rules **start empty** and are promoted
from real junk history, one sender at a time.

## Detection patterns

### Sender domains (`rules.domains`) — start empty

No domains in the current config. Promote from your own junk senders as you confirm
them; known scam infrastructure (lookalike domains, `.click`-style throwaways) moves
here first.

### Keywords (`rules.keywords`) — start empty

Keep any promoted keyword narrow and **subject-only** (snippet matching causes false
positives). Suggested candidates:

| Keyword | Status | Matches in | Why |
|---------|--------|------------|-----|
| `you won` / `você ganhou` | suggested | subject | prize-scam classic |
| `lottery` / `loteria` | suggested | subject | |
| `crypto giveaway` | suggested | subject | |
| `verify your account` | suggested | subject | phishing pattern |
| `urgent action` | suggested | subject | pressure tactic |
| `click here to claim` | suggested | subject | |

## AI fallback hints

Verdict **spam-trash** only with strong junk evidence: too-good-to-be-true offers
(prizes, crypto returns), urgency/pressure ("act now", "account suspended"), phishing
signals (login-verification requests, sender domain that mimics a brand it claims to
be), unsolicited blasts from no-name domains, chain/hoax forwarded mail.

**Not** spam-trash when the mail is merely marketing from a recognizable brand
(→ newsletters) or a legitimate notification. When in doubt, the AI must **not** choose
this category — false positives here are the costliest mistake in the system.

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Lucky Draw <wins@lunarrise.click>` | `FINAL NOTICE: claim your $2,000,000` | spam-trash | AI: prize-scam signals; domain promoted afterwards |
| `Security <support@paypa1-secure.com>` | `Verify your account now` | spam-trash | AI: phishing (brand lookalike domain) |
| `Beehiiv <news@beehiiv.com>` | `Your weekly digest` | **newsletters** | recognizable publication — not junk |
| `Nubank <nao-responda@nubank.com.br>` | `Sua fatura` | **finance** | legitimate transactional mail |

## False Positive Patterns

This is the **costliest category to get wrong** — a false positive hides legitimate
mail in a junk label. Known trap patterns and their guardrails:

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| Flash-sale marketing from real brands | countdown/urgency wording mimics scam pressure | AI hint requires a *no-name/lookalike domain* for a spam verdict; never promote real brand domains here |
| Security e-mails from legitimate services | "verify your account" is used by banks and SaaS for real resets | keep `verify your account` **unpromoted** until a tree feature `sender_known_good` can veto known-good domains; rely on the AI |
| Prize-giveaway editions of legit newsletters | "you won a free ebook" is real marketing copy | keep `you won` / `lottery` keywords unpromoted (AI-only); a recognizable publication in the sender name is an AI veto signal |
| Legal/formal notices with threatening tone | "final notice" debt/court language mimics scam urgency | AI hint: official senders (`.gov.br`, courts) are never spam |
| Password-reset mails | urgent wording + verification link | AI: transactional service mail is not phishing — the lookalike-domain check is what decides |

**Promotion rule of thumb:** keyword traps in this category are only safe once the
decision tree can veto known-good senders; until then, promote **domains only**, and
leave scam-phrasing keywords to the AI.

## Edge cases & tuning decisions

- **Aggressive-but-legit marketing** (flash sales from brands you actually bought from)
  belongs in newsletters, not here — see the table above.
- **Recovering from a false positive** — swap the `GMO/…` label manually and remove
  the offending rule from `Config.gs` (only future mail is affected).
- **Future extension**: a switch to also read Gmail's own spam folder (`in:spam`) and
  bulk-build this blocklist from already-filtered senders.
