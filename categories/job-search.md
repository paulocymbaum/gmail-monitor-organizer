# Job Search / Recruitment (`job-search`)

| Field | Value |
|-------|-------|
| Category ID | `job-search` |
| Gmail label | `GMO/job-search` |
| Priority | **11 of 14** (before `social` and `work`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Everything about hunting — or being hunted — for jobs: job-board alerts, recruiter and
headhunter outreach (including **LinkedIn private messages / InMail** from recruiters
and companies), ATS application confirmations and status updates, interview
invitations, assessment/test platforms. It deliberately runs **before** `social`
(LinkedIn job alerts and member messages are not social notifications) and **before**
`work` (recruiting is not day-to-day professional correspondence).

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `indeed.com` | current | job-board alerts |
| `glassdoor.com` | current | job-board alerts |
| `gupy.io` | current | Brazilian ATS |
| `catho.com.br` | suggested | Brazilian job board |
| `vagas.com.br` | suggested | Brazilian job board |
| `kenoby.com` | suggested | Brazilian ATS |
| `greenhouse.io` | suggested | ATS notifications |
| `lever.co` | suggested | ATS notifications |
| `smartrecruiters.com` | suggested | ATS notifications |
| `hired.com` | suggested | talent marketplace |
| `testgorilla.com` | suggested | assessment platform |

> ⚠️ **Never add `linkedin.com` here** — it would swallow all LinkedIn mail (domain
> rules match any subdomain, so even `jobs-noreply.linkedin.com` counts). LinkedIn job
> alerts and private messages are captured by keywords instead; see the LinkedIn
> sections below.

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `job alert` / `alerta de vagas` | current | name/subject | job-board digests |
| `new jobs` | current | subject | "5 new jobs for you" |
| `vaga` | current | name/subject | PT-BR job posting |
| `interview invitation` | current | subject | ATS / recruiter |
| `via linkedin` | current | name | **private-message marker** — see LinkedIn section below |
| `sent you a message` | current | subject | LinkedIn member-message template |
| `shared a job` | current | subject | LinkedIn job-share by recruiter/company |
| `application received` | suggested | subject | ATS confirmation |
| `job match` / `vagas compatíveis` | suggested | subject | recommendations |
| `assessment` | suggested | subject | test invitations |
| `oportunidade` / `opportunity` | suggested | subject | recruiter outreach (broad — watch noise) |

### LinkedIn private messages (recruiter & company outreach)

When a person writes to you on LinkedIn — recruiter InMail or a company contact — the
notification e-mail carries the **member message**, not an automated alert:

```
From: Jane Smith via LinkedIn <messages-noreply@linkedin.com>
Subject: Jane sent you a message: Senior Platform Engineer role
```

Keyword-based detection chain (the `linkedin.com` domain must stay in `social`):

1. **`via LinkedIn` in the display name** → a human wrote to you (member message, not
   a platform notification). This is the most reliable marker: it also catches InMail
   whose subject is the recruiter's own free text ("Do you have 15 minutes?").
2. **Job signals** in subject/snippet — `shared a job`, `opportunity`, `role`,
   `position`, `vaga`, a job title → confident **job-search**.
3. **No job signals** → the e-mail template is identical for recruiters and personal
   contacts, so the message still lands here (keyword won at priority 7) and you
   triage by subject. The decision-tree tier (ARCHITECTURE.md §4.5) is the precision
   upgrade: features `via_linkedin_name` + job signals split recruiter mail from
   friend mail automatically.

> **Connection invitations** ("Invitation to connect…") and automated notifications
> (likes, profile views, plain job-alert digests) carry no member-message marker →
> they keep flowing to `social`.

## AI fallback hints

Verdict **job-search** when: a recruiter/headhunter writes about an opportunity (any
channel, including **LinkedIn private messages / InMail**), job alert digests,
application confirmations or status updates ("received", "in review", "moved
forward"), interview scheduling in a recruiting context, assessment invitations,
"your profile matches" language.

Not job-search when: a company you already work with discusses contracts or projects
(→ work), LinkedIn social notifications (→ social), or content newsletters that merely
talk about the job market (→ newsletters).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Indeed <notify@indeed.com>` | `12 new jobs match your search` | job-search | domain + keyword |
| `Jane Smith via LinkedIn <messages-noreply@linkedin.com>` | `Jane sent you a message: Senior Platform Engineer role` | job-search | `via linkedin` (name) + job signal |
| `Marcos Alves via LinkedIn <mail@linkedin.com>` | `Marcos shared a job with you: DevOps Jr.` | job-search | keyword `shared a job` |
| `Gupy <noreply@gupy.io>` | `Recebemos sua candidatura` | job-search | ATS domain |
| `Jane Recruiter <jane@talentco.io>` | `Interview invitation — Platform Engineer` | job-search | keyword `interview invitation` |
| `LinkedIn <jobs-noreply@linkedin.com>` | `5 new jobs for you` | job-search | keyword `new jobs` beats social domain (priority 7 vs 8) |
| `LinkedIn <newsletter@linkedin.com>` | `Weekly digest: …` | **newsletters** | `digest` wins earlier (priority 5) |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| LinkedIn chats from friends | `via linkedin` / `sent you a message` match **any** member message, not just recruiters | triage by subject; decision-tree conjunction (`via_linkedin_name` + `job_signal`) automates the split |
| Sales outreach — "business opportunity" | suggested keyword `oportunidade`/`opportunity` is broad | keep it subject-only, or drop it |
| Client-side interview requests (current employer) | `interview invitation` matches client meetings too | AI decides when no keyword fires; a manual label swap corrects |
| University/course openings ("vagas residuais") | `vaga` matches non-job course/listing openings | acceptable noise level; restrict to subject-only |
| Internal-mobility HR mail ("new opportunities internally") | recruiting-style wording from your own employer | routes here by keyword; arguably `work` — triage manually |

## Edge cases & tuning decisions

- **LinkedIn duality** — the `linkedin.com` domain lives in `social` (priority 8), so
  this category relies on keywords winning at priority 7 plus the AI for the rest.
- **Careers content newsletters** (job-market digests) → newsletters, because priority 5
  keyword rules beat this category.
- **Recruiting spam** — mass blasts from recruiting farms: classify here, or promote
  their domains to `spam-trash` if you never want to hear from them again.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `catho.com.br`
(Catho), `vagas.com.br` (Vagas.com), `workana.com` (Workana, freelance LATAM) e
`upwork.com` (Upwork). Catho e Upwork petram keyword ("vagas"/"job alert").

## LinkedIn: recrutamento vs. engajamento social

O domínio `linkedin.com` pertence ao **social** (12), mas keywords de recrutamento
do `job-search` (11) rodam antes e vencem para mail de recrutamento:

| Tipo de mail | Exemplo de assunto | Veredito |
|---|---|---|
| InMail de recrutador | `InMail: Backend Engineer opportunity` | **job-search** — keyword `inmail` |
| Mensagem de recrutador | `New message from a recruiter — Growth role` | **job-search** — keyword `recruiter` |
| Digest de vagas | `Jobs you may be interested in` (name `LinkedIn Jobs`) | **job-search** — keywords `linkedin jobs` / `jobs you may be interested` |
| Compartilhamento de vaga | `X shared a job with you: QA Engineer` | **job-search** — keyword `shared a job` |
| Notificações de engajamento | `Your profile appeared in 12 searches`, `Publique para chegar a mais pessoas` | **social** — nenhuma keyword de job casa; o domínio decide |

Keywords atuais do LinkedIn: `via linkedin`, `sent you a message`, `shared a job`,
`inmail`, `linkedin jobs`, `jobs you may be interested`, `job recommendation`,
`recruiter`, `recrutador` (en/pt; o es é raro neste mailbox). Mensagens de
contato pessoal ("vamos jogar futebol?") caem em `job-search` por usar o mesmo
marcador `sent you a message` — comportamento documentado: mensagem via LinkedIn
= potencial oportunidade; ajuste fino via `needsReviewReport` se incomodar.
