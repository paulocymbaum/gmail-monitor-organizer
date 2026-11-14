# News (`news`)

| Field | Value |
|-------|-------|
| Category ID | `news` |
| Gmail label | `GMO/news` |
| Priority | **3 of 14** (after `shopping` — before `ads` and `newsletters`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Editorial and breaking coverage from media outlets: breaking-news alerts, morning
headlines and "today's top stories" digests sent by newspapers, portals and TV/radio
networks, live-coverage updates and staff reports. The sender is a **publication**,
not a marketing platform and not a person.

Distinct from `newsletters` (platform digests and subscriptions — priority 5) and
`ads` (a brand selling something — priority 4).

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `nytimes.com` | current | The New York Times |
| `washingtonpost.com` | current | The Washington Post |
| `cnn.com` | current | CNN (`cnnbrasil.com.br` — suggested) |
| `bbc.com` | current | BBC (covers subdomains) |
| `theguardian.com` | current | The Guardian |
| `reuters.com` | current | Reuters |
| `elpais.com` | current | El País |
| `estadao.com.br` | current | O Estado de S. Paulo |
| `g1.globo.com` | current | g1 — see edge cases for why **not** bare `globo.com` |
| `apnews.com` · `axios.com` · `politico.com` | suggested | US outlets |
| `cnnbrasil.com.br` · `oglobo.globo.com` · `poder360.com.br` | suggested | BR outlets |
| `clarin.com` · `infobae.com` | suggested | AR outlets |
| `folha.uol.com.br` | suggested ⚠ | Folha sends from this subdomain; **never** add bare `uol.com.br` — it is a personal-mail domain |

### Keywords (`rules.keywords`)

Keywords match the sender name, subject and snippet (case-insensitive substring).
Accented and accent-stripped variants are both current because some senders strip
diacritics:

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `breaking news` | current | name/subject/snippet | alert classic |
| `top headlines` | current | name/subject/snippet | "Top headlines" digests |
| `últimas notícias` / `ultimas noticias` | current | name/subject/snippet | PT/ES breaking alerts |
| `notícias de hoje` / `noticias de hoje` | current | name/subject/snippet | PT daily editions |
| `notícias de última hora` / `noticias de ultima hora` | current | name/subject/snippet | ES/PT alerts |
| `manchetes de hoje` | current | name/subject/snippet | PT headline lists |
| `headlines` | suggested ⚠ | subject/name only | broad — "headline" appears in marketing copy |
| `breaking` | suggested ⚠ | subject only | substring matches "groundbreaking" — prefer `breaking news` |
| `titulares` | suggested | subject | ES headline lists |
| `alerta de notícias` | suggested | subject | PT news alerts |

## AI fallback hints

Verdict **news** when: media-outlet branding, "breaking"/"developing story" language,
headline lists with timestamps ("5 things to know"), live-coverage links, reporter
bylines ("staff reports", "por nossa equipe de jornalismo"), "última hora/en directo"
phrasing.

Verdict **another category** when: the media company is *selling* something
(subscription pitch with a discount → ads), a media-brand job alert (→ job-search), a
platform digest that aggregates third-party content (→ newsletters), or a person
sharing an article (→ uncategorized).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `The New York Times <alerts@nytimes.com>` | `Breaking News: Senate passes landmark bill` | news | domain `nytimes.com` |
| `g1 <g1@g1.globo.com>` | `Últimas notícias: confira as manchetes de hoje` | news | domain + keywords |
| `El País <alertas@elpais.com>` | `Noticias de última hora: los mercados reaccionan` | news | domain + keyword |
| `The Ledger <news@unknown-press.co>` | `Top headlines for your morning commute` | news | keyword `top headlines` (domain not listed) |
| `The Morning <news@substack.com>` | `Issue #42: what we're reading` | **newsletters** | platform domain `substack.com` outranks (5) |
| `NYT Marketing <deals@nytimes.com>` | `50% off your first year` | news (accepted default) | outlet domain wins at 3 before `ads` — see FP table |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| "Groundbreaking study…" coverage | suggested keyword `breaking` matches as a substring | keep `breaking` unpromoted; use `breaking news` only |
| Media subscription promos (`50% off`) | outlet domain wins at 3 before `ads` (4) checks promo keywords | accepted default — it *is* mail from the outlet; remove the domain and rely on keywords if promo volume gets noisy |
| Newsletter digests *about* the news | "últimas notícias" inside a creator-digest subject | outlets win on domains; digests without a listed domain or headline keywords still reach `newsletters` (5) |
| Personal mail forwarding an article | pasted headline text in the snippet | snippet hits are the weakest signal; if noisy, restrict `top headlines` to subject/name |
| Personal mail from `@globo.com` addresses | `globo.com` is also a free-mail provider | deliberately not a current domain — only `g1.globo.com` is |

## Edge cases & tuning decisions

- **`globo.com` exclusion** — the same domain hosts personal `@globo.com` mailboxes
  (it is listed as a free-mail domain in `DecisionTree.gs`); adding it would drop
  personal mail into `news`. Only the `g1.globo.com` newsroom subdomain is current.
- **Outlet newsletters via platforms** — Substack/beehiiv digests stay in
  `newsletters` (platform domain, priority 5): content subscriptions are not alerts.
- **Tree support** — `news_signal` (headline markers + kw flags) exists as a decision
  tree feature, and the hand-crafted tree keeps one conservative `news` leaf (v2.1);
  retraining (`buildTreeFromLabels`) can learn richer news branches from labels.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos —
`folha.uol.com.br` (Folha de S.Paulo), `cnnbrasil.com.br` (CNN Brasil),
`espn.com.br` (ESPN Brasil) e `apnews.com` (AP News). Folha e CNN Brasil
petram keyword ("notícias de hoje"/"últimas notícias"); AP petra "top
headlines".
