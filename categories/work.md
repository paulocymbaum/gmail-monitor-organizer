# Work (`work`)

| Field | Value |
|-------|-------|
| Category ID | `work` |
| Gmail label | `GMO/work` |
| Priority | **13 of 14** (evaluated last among rule categories) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Professional correspondence and collaboration: colleagues, clients, employers,
project & task tools, docs and e-signature, scheduling and meetings — anyone you do
business with, plus the tooling around it. Recruiting and job hunting live in
`job-search`.

## Detection patterns

### Sender domains (`rules.domains`)

Famous SaaS/collaboration platforms are **current** — plus add your employer and
client domains here first; they are the highest-signal work rules you can have:

| Domain | Status | Why |
|--------|--------|-----|
| *(your company domain)* | recommended | e.g. `acmecorp.com` |
| `slack.com` | current | workspace invites & notifications |
| `zoom.us` | current | meeting invites |
| `notion.so` | current | doc sharing & comments |
| `figma.com` | current | design comments & shares |
| `github.com` | current | PRs, issues, notifications |
| `gitlab.com` | current | GitLab notifications |
| `atlassian.com` | current | Jira/Confluence notifications |
| `asana.com` | current | task management |
| `trello.com` | current | task management |
| `miro.com` | current | whiteboard collaboration |
| `linear.app` | current | issue tracking |
| `dropbox.com` | current | file sharing |
| `vercel.com` | current | deployment notifications |
| `totvs.com.br` | current | TOTVS ERP (BR) |
| `salesforce.com` | current | CRM |
| `zendesk.com` | current | support desk |
| `jetbrains.com` | current | IDEs & dev tools |
| `anthropic.com` | current | Claude / API platform |
| `openai.com` | current | OpenAI platform mail (maintenance/security alerts → `servicos` wins first) |
| `ollama.com` | current | local LLM runtime |
| `huggingface.co` | current | models & spaces |
| `mistral.ai` | current | LLM platform |
| `groq.com` | current | LLM inference |
| `together.ai` | current | LLM inference |
| `cohere.com` | current | LLM platform |
| `perplexity.ai` | current | AI search API |
| `langchain.dev` | current | LLM app framework |
| `replicate.com` | current | model hosting |
| `cursor.com` / `cursor.sh` | current | AI code editor |
| `deepseek.com` | current | LLM platform |
| `x.ai` | current | Grok / API |
| `elevenlabs.io` | current | voice AI |
| `midjourney.com` | current | image AI |
| `modal.com` | current | AI/cloud infra |
| `runpod.io` | current | GPU cloud |
| `nvidia.com` | current | AI hardware/dev |
| `redis.com` / `redis.io` | current | Redis cloud & OSS |
| `upstash.io` | current | serverless Redis |
| `doppler.com` | current | secrets management |
| `supabase.com` | current | Postgres BaaS |
| `mongodb.com` | current | Atlas / database |
| `neon.tech` | current | serverless Postgres |
| `planetscale.com` | current | MySQL platform |
| `sentry.io` | current | error tracking |
| `cloudflare.com` | current | CDN/workers |
| `netlify.com` | current | deploy platform |
| `railway.app` | current | deploy platform |
| `fly.io` | current | deploy platform |
| `render.com` | current | deploy platform |
| `digitalocean.com` | current | cloud hosting |
| `npmjs.com` | current | package registry |
| `docker.com` | current | containers |
| `circleci.com` | current | CI/CD |
| `twilio.com` | current | comms API |
| `auth0.com` | current | identity platform |
| `elastic.co` | current | search/observability |
| `datadoghq.com` | current | observability |
| `grafana.com` | current | observability |
| `hashicorp.com` | current | infra tooling |
| `prisma.io` | current | ORM |
| `postman.com` | current | API platform |
| `replit.com` | current | cloud IDE |
| `monday.com` | suggested | task management |
| `docusign.net` | suggested | e-signature |
| `calendly.com` | suggested | scheduling |

Domain matching accepts subdomains (`notifications.github.com` matches
`github.com`), so base domains only — no `email.*` / `notifications.*`
enumeration needed.

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `deadline` | current | name/subject/snippet | |
| `meeting` | current | name/subject/snippet | also catches calendar bots |
| `sprint` | current | name/subject | agile rituals |
| `ticket` | current | name/subject | support/issue trackers |
| `pull request` | current | name/subject/snippet | code-review flows |
| `code review` | current | name/subject/snippet | developer tooling |
| `merge request` | current | name/subject/snippet | GitLab-flavored code-review flows |
| `deployment` | current | name/subject/snippet | CI/CD platform notifications |
| `agenda` / `pauta` | suggested | subject | EN + PT-BR |
| `action required` | suggested | subject | strong signal |
| `assigned` / `review requested` | suggested | subject/snippet | tool notifications |
| `proposal` / `proposta` | suggested | name/subject | client business |
| `contract` / `contrato` | suggested | name/subject | e-signature flows |

## AI fallback hints

Verdict **work** when: a named person at a company domain writes one-to-one,
collaboration-tool notifications (assigned / review requested), scheduling and calendar
mail, professional tone with signatures/titles, action requests.

Not work when: money transactions (→ finance), job-board and recruiter mail
(→ job-search), platform notifications (→ social), publications (→ newsletters), or
clearly personal one-to-one mail (→ uncategorized).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Jane Doe <jane@acmecorp.com>` | `Q3 planning — agenda` | work (AI) | add `acmecorp.com` to domains for rule certainty |
| `Jira <do-not-reply@atlassian.com>` | `[PROJ-42] Ticket assigned to you` | work | domain + keyword `ticket` |
| `Recruiter <jane@talentco.io>` | `Interview invitation — Platform Engineer` | **job-search** | job-search outranks work (priority 7 vs 9) |
| `DocuSign <dse@docusign.net>` | `Please sign: Services Contract` | work | domain + keyword `contract` |
| `Nubank <nao-responda@nubank.com.br>` | `Fatura disponível` | **finance** | finance outranks work (priority 6 vs 9) |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| Personal invites using "meeting" | keyword `meeting` matches friends' hangouts too | acceptable default; restrict to subject-only if noisy |
| Any LinkedIn member message, work-related or not | `job-search`'s `via linkedin` keyword wins at priority 7, before `work` (9) | documented split — see `job-search.md`; the tree conjunction improves it |
| Employer's own marketing digests | `digest` in newsletters (5) beats work keywords (9) | intentional: bulk marketing is newsletters even from your employer |
| Freelance contracts mentioning money | money keywords pull client mail into `finance` (6) before work | intentional one-bucket-for-money rule; `GMO/Force:work` override is on the roadmap |
| Recruiter mail lacking recruiting markers | generic professional tone lands here if no keyword fires | AI decides; if a recruiter pattern recurs, add it to `job-search` |

## Edge cases & tuning decisions

- **Recruiting mail** — routes to `job-search` (priority 7), not here; only generic
  professional mail without recruiting signals reaches this category.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `totvs.com.br`
(TOTVS ERP), `salesforce.com` (Salesforce CRM), `zendesk.com` (Zendesk, petra
keyword `ticket`) e `jetbrains.com` (JetBrains). Nota: "atualização do sistema
agendada" da TOTVS fica em `work` — a keyword `manutenção programada` de
`servicos` (5) não dispara porque o texto diz "janela de manutenção técnica".

**Expansão AI full-stack**: ~46 domínios de plataformas AI/LLM e serviços de
infra/full-stack promovidos a `current` (Anthropic/Claude, OpenAI, Ollama,
HuggingFace, Mistral, Groq, Perplexity, Cursor, Replicate, Redis, Upstash,
Doppler, Supabase, MongoDB, Neon, Sentry, Cloudflare, Netlify, Railway, Fly,
Render, DigitalOcean, npm, Docker, CircleCI, Twilio, Auth0, Elastic, Datadog,
Grafana, HashiCorp, Prisma, Postman, Replit …). Keywords `merge request` e
`deployment` adicionadas. **Precedência mantida**: alertas de segurança e
avisos de manutenção dessas plataformas continuam em `servicos` (prioridade
menor, avaliado antes) — os mocks `openai.com` dos waves 25/26/27 esperam
`servicos` e permanecem válidos; a expansão só captura o que `servicos` e
`newsletters` não reclamam primeiro.
