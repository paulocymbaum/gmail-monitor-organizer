# Serviços digitais (`servicos`)

| Field | Value |
|-------|-------|
| Category ID | `servicos` |
| Gmail label | `GMO/servicos` |
| Priority | **5 of 14** (after `ads` — before `newsletters`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Notificações transacionais de **contas digitais e SaaS que você usa**: alertas de
segurança e novos acessos, avisos de manutenção programada, avisos de exclusão de
conta e atualizações de produto (changelog/release notes). O remetente é a
**plataforma do serviço**, não um veículo de notícia nem uma loja.

Distinto de `newsletters` (marketing de plataforma — priority 6), de `finance`
(cobrança/fatura — priority 7) e de `spam-trash` (phishing de conta — priority 1).

## Detection patterns

**Domains (rule):** `stripo.email`, `notifications.stripo.email`, `duocards.com`,
`accounts.google.com`, `whatsnew.sider.ai`, `lottiefiles.com`,
`flutterflow.io`, `mermaid.ai`, `po.atlassian.net`,
`account.live.com` (Microsoft), `id.apple.com` (Apple ID), `dropbox.com`,
`canva.com` (Canva), `duolingo.com` (Duolingo),
`adobe.com` (Adobe ID), `playstation.com` (PlayStation PSN),
`epicgames.com` (Epic Games), `xbox.com` (Xbox/Microsoft).

> **Movidos para `work`** (expansão AI full-stack): `doppler.com`, `supabase.com`,
> `render.com` — plataformas de dev-stack pertencem à categoria de trabalho;
> alertas de segurança/login DESSES serviços continuam aqui via keywords
> (`security alert`, `new login to your account` …), que têm precedência.

**Keywords (rule):** `account deletion`, `will be deleted`, `conta será deletada`,
`conta será excluída`, `manutenção programada`, `scheduled maintenance`,
`alerta de segurança`, `security alert`, `alerta de seguridad`,
`new login to your account`, `product update`, `atualização de segurança`.

**Embedding refs** cobrem pt/en/es: alertas de segurança/login, manutenção,
exclusão de conta, 2FA e changelogs.

## Promote notes

Marcas famosas cobertas na onda 19 (`tests/mock-dataset-19.js`): Microsoft
(`account.live.com`), Apple ID (`id.apple.com`), Dropbox, AWS (keyword de
manutenção) e Netflix (via embedding — o domínio `netflix.com` fica de fora por
mandar também marketing).

Trade-off documentado: e-mails de manutenção da **Hostinger** caem em `ads`
(domain `hostinger.com` em priority 4 dispara antes). Se isso incomodar, mover o
domínio para cá numa rodada futura.

**Onda 20** (`tests/mock-dataset-20.js`): Canva e Duolingo em rule; Spotify via
embedding (domínio fora do Config por mandar também marketing); e a precedência
cruzada mais importante — **Zoom** (`zoom.us` é domínio `work` 13, mas o alerta
"Security alert" dispara a keyword `servicos` 5 antes): convite de reunião Zoom
continua em `work`, alerta de conta vai para `servicos`.

**Onda 22** (`tests/mock-dataset-22.js`): Adobe, PlayStation, Epic Games e Xbox
em rule; Roblox e o **código de verificação do WhatsApp** via embedding (ref pt
"seu código de verificação expira…"). Cruz reverso da onda 20: a **promo da
PlayStation Store** ("descontos de até 70%") cai em `ads` — a keyword 4 vence o
domínio `servicos` 5. Alerta de conta → `servicos`; loja vendendo jogo → `ads`.
