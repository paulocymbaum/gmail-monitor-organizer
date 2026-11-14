# Finance (`finance`)

| Field | Value |
|-------|-------|
| Category ID | `finance` |
| Gmail label | `GMO/finance` |
| Priority | **7 of 14** (after `shopping`, `news` and `ads` — marketplace order mail lands in shopping first) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Money-related mail: banks and fintech apps, payment processors, invoices and receipts,
statements and billing notices, payment confirmations, dunning ("card declined"),
and transactional brokerage mail. Marketing/promo mail from fintechs is *deliberately*
excluded (it ranks as ads or newsletters — see edge cases).

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `nubank.com.br` | current | Brazilian fintech bank |
| `paypal.com` | current | payments |
| `stripe.com` | current | payment-processor receipts |
| `itau.com.br` | current | Brazilian bank |
| `bradesco.com.br` | current | Brazilian bank |
| `bb.com.br` | current | Banco do Brasil |
| `santander.com.br` | current | bank |
| `mercadopago.com.br` | current | payments/fintech |
| `picpay.com.br` | current | Brazilian wallet |
| `pagseguro.com.br` | current | Brazilian payments |
| `bancointer.com.br` | current | Banco Inter |
| `c6bank.com.br` | current | C6 Bank |
| `wise.com` · `revolut.com` · `n26.com` | suggested | international fintech |
| `asaas.com` · `vindi.com.br` | suggested | Brazilian billing platforms |

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `invoice` | current | name/subject/snippet | high signal |
| `fatura` | current | name/subject/snippet | PT-BR credit-card bill |
| `payment` | current | name/subject/snippet | receipts & confirmations |
| `statement` | current | name/subject/snippet | periodic summaries |
| `pix` | current | name/subject/snippet | PIX transfer notices |
| `boleto` | current | name/subject/snippet | PT-BR billing slip |
| `extrato` | current | name/subject | PT-BR statement |
| `billing` | current | subject/name | dunning, updated card |
| `receipt` / `recibo` | suggested | name/subject | trip/order receipts (Uber…) |
| `cobrança` | suggested | name/subject | PT-BR collections |
| `nota fiscal` | suggested | name/subject | PT-BR tax receipt |

## AI fallback hints

Verdict **finance** when: currency amounts with due dates, account/card references,
"total due" or "pay now" CTAs, receipts/order summaries with totals, bank/fintech
branding, automatic-debit confirmations, PIX/transfer notices.

Not finance when: marketing/promo mail from fintechs (→ ads or newsletters), an employer discussing
payroll (→ work), or prices mentioned in passing inside a product newsletter.

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Nubank <nao-responda@nubank.com.br>` | `Sua fatura de setembro fechou` | finance | domain + keyword `fatura` |
| `Stripe <receipts@stripe.com>` | `Payment receipt for …` | finance | domain + keyword `payment` |
| `Uber <receipts@uber.com>` | `Your Tuesday night trip receipt` | finance | keyword `receipt` (domain not listed) |
| `iFood <no-reply@ifood.com.br>` | `Pedido confirmado` | **shopping** | domain `ifood.com.br` now current (priority 2) — food delivery is commerce |
| `Itaú <marketing@itau.com.br>` | `Weekly digest: invest tips` | **newsletters** | `digest` wins at priority 5 |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| Client/business mail with "payment terms" | keyword `payment` fires at priority 6, pulling client correspondence out of `work` (9) | restrict `payment` to subject-only matching |
| Recruiter mail discussing compensation | money wording matches before `job-search` (7) runs | same fix; job-search keywords like `interview invitation` are unaffected (different words) |
| E-commerce order confirmations (iFood, Amazon) | receipt-style keywords | split out — the `shopping` category (priority 2) and its `ifood.com.br`/`amazon.com.br` domains now take these |
| Donation/fundraising appeals from nonprofits | "donation", "payment" wording | most have no rule → AI decides (often `uncategorized`); acceptable |
| SaaS billing receipts for work tools | `invoice` pulls tool vendors here instead of `work` | intentional: money mail is one bucket |

## Edge cases & tuning decisions

- **Money-adjacent marketing** — fintech promos/digests bypass Finance because the
  bulk categories run first (`news` 3, `ads` 4, `newsletters` 5 vs `finance` 6);
  reorder `CATEGORIES` if you prefer finance-platform marketing in Finance.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `caixa.gov.br`
(Caixa Econômica Federal — cruz documentado: é domínio **finance** 7; o filtro
`governo` 8 só dispara se o texto tiver keyword de governo, o que o extrato/FGTS
não tem), `sicredi.com.br` (Sicredi), `wise.com` (Wise) e
`americanexpress.com` (Amex).

**Onda 22** (`tests/mock-dataset-22.js`): `neon.com.br` (Neon 🇧🇷) — "seu Pix
chegou" petra a keyword `pix` além do domínio.
