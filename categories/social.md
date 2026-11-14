# Social (`social`)

| Field | Value |
|-------|-------|
| Category ID | `social` |
| Gmail label | `GMO/social` |
| Priority | **12 of 14** |
| Detection | domains only today · AI fallback supported |

## Definition

Platform notifications about the user's own account and network activity: social media
(likes, comments, follows, mentions), professional networks, communities/forums, and
messaging-app mail. The sender is always a **platform**, never a person.

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `linkedin.com` | current | LinkedIn notifications |
| `x.com` | current | X/Twitter notifications |
| `instagram.com` | current | Instagram notifications |
| `facebookmail.com` | current | Facebook notifications |
| `twitter.com` | suggested | legacy X sender |
| `notify.facebook.com` | suggested | Facebook sending domain |
| `tiktok.com` | current | TikTok |
| `pinterest.com` | current | Pinterest |
| `reddit.com` | current | Reddit digests & messages |
| `discord.com` | current | community mail |
| `redditmail.com` | suggested | Reddit's mail-only domain |
| `quora.com` | suggested | Q&A notifications |

### Keywords (`rules.keywords`)

None in the current config — domain coverage is already high. Suggested candidates if
you widen coverage beyond the big platforms: `liked your`, `commented on`,
`connection request`, `followed you`, `mentioned you`, `new follower`.

## AI fallback hints

Verdict **social** when: engagement verbs directed at the user ("liked", "commented",
"tagged you"), notification-style subjects ("New activity", "Someone mentioned you"),
social/professional platform branding, friend/connection requests, community digests.

Not social when: content publications/newsletters from those platforms (→ newsletters,
which outranks social), a recruiter writing from a company domain (→ work), or
one-to-one messages from individuals (→ uncategorized).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `LinkedIn <messages-noreply@linkedin.com>` | `You appeared in 9 searches` | social | domain `linkedin.com` |
| `Instagram <no-reply@mail.instagram.com>` | `x liked your photo` | social | subdomain matches `instagram.com` |
| `X <info@x.com>` | `@handle mentioned you` | social | domain |
| `LinkedIn <newsletter@linkedin.com>` | `Weekly digest: …` | **newsletters** | priority-5 keyword wins over domain |
| `Discord <noreply@discord.com>` | `New messages in …` | social (AI today) | suggested domain not yet in rules |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| LinkedIn job alerts in unusual subject formats | platform domain wins at priority 8 when job-search keywords (7) miss the format | promote new subject formats to `job-search` keywords as you spot them |
| Platform content/blog digests | domain wins at 8, though the mail is editorial content | `newsletter`/`digest` keywords in `newsletters` (5) catch many first; accept the rest |
| Security/password-reset alerts from platforms | domain wins, though the mail is transactional-security | acceptable default; a future `security` category could split it |
| Community/event platform mail not yet listed (Meetup, Eventbrite) | no domain rule → AI verdict varies | add the platform domain to `rules.domains` (see suggested list) |

## Edge cases & tuning decisions

- **Platform newsletters** — see the LinkedIn example: content mail intentionally goes
  to newsletters due to category priority; this is the documented behavior.
- **LinkedIn private messages** — routed to `job-search` by its member-message keyword
  markers (`via LinkedIn`, `sent you a message`, `shared a job`), which run at priority
  7, before this category. Connection invitations and automated notifications (likes,
  profile views) keep landing here.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `twitch.tv`
(Twitch lives), `threads.net` (Threads/Meta), `bsky.app` (Bluesky) e `kwai.com`
(Kwai).

**Onda 22** (`tests/mock-dataset-22.js`): `vimeo.com` (Vimeo).

**Onda 22** (`tests/mock-dataset-22.js`): `vimeo.com` (Vimeo).

**LinkedIn** (`linkedin.com`): o domínio fica aqui, mas as keywords de recrutamento
do `job-search` (11 — `inmail`, `recruiter`, `linkedin jobs`, `shared a job`…)
rodam antes e vencem para mail de recrutamento. Notificações de engajamento
(visualizações de perfil, reações, "Publique para chegar") continuam em `social`.
Ver tabela completa em [job-search.md](./job-search.md).
