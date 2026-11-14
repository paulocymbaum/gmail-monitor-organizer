# Ads / Promotions (`ads`)

| Field | Value |
|-------|-------|
| Category ID | `ads` |
| Gmail label | `GMO/ads` |
| Priority | **4 of 14** (after `news`, before `newsletters`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Commercial promotions from brands and deal platforms you actually know: discount
blasts, coupon codes, seasonal sales (Black Friday, "liquidação"), loyalty/"member
savings" events and deal-aggregator digests. The distinguishing feature is a
**purchase incentive** — not an order (→ shopping), not editorial content
(→ newsletters), not a prize scam (→ spam-trash).

The category sits **above** `newsletters` on purpose: promo mail almost always
carries an "unsubscribe" preheader, and the more specific promo keywords must win
before the generic bulk keywords see the message.

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `groupon.com` | current | deal marketplace |
| `peixeurbano.com.br` | current | BR deal platform |
| `promobit.com.br` · `pelando.com.br` | suggested | BR deal aggregators |
| `slickdeals.net` · `hotukdeals.com` | suggested | EN deal aggregators |

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `% off` | current | name/subject/snippet | "30% off", "50% OFF" |
| `desconto` / `cupom` | current | name/subject/snippet | PT discount / coupon |
| `cupon` | current | name/subject/snippet | ES coupon (accent-less variant) |
| `promoção` / `promocao` | current | name/subject/snippet | PT promo |
| `promoción` / `promocion` | current | name/subject/snippet | ES promo |
| `descuento` | current | name/subject/snippet | ES discount |
| `black friday` | current | name/subject/snippet | seasonal sales |
| `liquidação` / `liquidacao` | current | name/subject/snippet | PT clearance |
| `coupon` / `promo code` | current | name/subject/snippet | EN coupons |
| `flash sale` / `discount` | current | name/subject/snippet | EN sale events |
| `oferta` | deliberately NOT current | — | "Super Oferta"/"Oferta limitada" are prize-scam naming patterns (→ spam-trash); promote phrase-level variants like `ofertas exclusivas` instead |
| `aproveite` | deliberately NOT current | — | fires on generic PT copy ("Aproveite o clima") in legit non-ads mail; only the ES `aprovecha` marker exists (tree tier) |
| `sale` | deliberately NOT current | — | substring matches "wholesale", "Salesforce"…; use `flash sale` / `sale ends` |
| `cupon de descuento` / `ofertas exclusivas` / `so hoje` | suggested | subject | phrase-level upgrades |

## AI fallback hints

Verdict **ads** when: percentage-off language, coupon codes, sale-end deadlines
("ends tonight"), loyalty/member-savings events, deal-aggregator framing ("best deals
near you"), markdown/liquidation wording.

Verdict **another category** when: the mail is a transactional order or shipping
notice (→ shopping), an editorial digest that merely *mentions* a product
(→ newsletters), urgency/prize pressure from a no-name or lookalike domain
(→ spam-trash — the costliest mistake), or a bank statement that happens to mention a
discount (→ finance runs later; see FP table).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Loja do Bem <promo@lojadobem.com.br>` | `Promoção especial: desconto de 40% em tudo` | ads | keywords `promoção`/`desconto` |
| `Groupon <deals@groupon.com>` | `Deals of the week: save big near you` | ads | domain `groupon.com` |
| `Tienda ES <rebajas@tienda-es.com>` | `Descuento exclusivo: promoción por tiempo limitado` | ads | keywords `descuento`/`promoción` |
| `SHEIN <promo@shein.com>` | `Cupom de 15% + frete grátis` | **shopping** | marketplace domain wins at priority 2 |
| `Super Oferta <brinde@super-oferta.click>` | `Você ganhou um brinde — resgate agora` | **spam-trash** | prize scam; bare `oferta` deliberately unpromoted, the AI vetoes |
| `StyleCrate <club@stylecrate.com>` | `Member savings inside` | ads | tree tier: promo markers in the body scan (`ads_signal` leaf, v2.1) |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| Bank/fintech promos ("desconto na fatura") | promo keywords fire at 4 **before** finance domains (6) | accepted default — bulk buckets run before finance (same precedent as newsletters); move the bank's domain into a category above `ads` to change it |
| Marketplace promos (Shein, Shopee) | promo keywords would fire at 4 | `shopping` domains win at 2 — intended split (orders + marketplace promos stay in shopping) |
| Prize scams ("Super Oferta", "Oferta limitada") | discount wording mimics promotions | bare `oferta` deliberately unpromoted; the spam-trash AI hint requires a no-name/lookalike domain; promote exact domains instead |
| Editorial newsletters with a product mention | "our sponsor: 20% off" inside a digest | acceptable noise; if it grows, restrict `discount` to subject/name matching |
| Subscription renewals with promo copy | "renew now with 10% off" from SaaS | billing wording runs later (6); accepted default |

## Edge cases & tuning decisions

- **Why above `newsletters`** — most promo mail carries an "unsubscribe" preheader;
  with `ads` at 4 the specific promo keywords win, while generic bulk mail (digests,
  webinars without a purchase incentive) still reaches `newsletters` at 5.
- **Trilingual by design** — PT/ES carry the richest promo vocabulary; accented and
  accent-stripped keyword variants are both current (some senders strip diacritics).
- **Tree & AI support** — the hand-crafted tree has an `ads_signal` leaf (v2.1) and
  the embedding tier has ads prototypes; after a labeled history builds up,
  retraining (`buildTreeFromLabels`) can refine the split.

**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos —
`cinemark.com.br` (Cinemark), `mcdonalds.com.br` (CashMéqui) e `bk.com.br`
(Burger King). **Uber** fica SEM domínio de propósito: "corridas com desconto"
cai por keyword e "promo imperdível" (Uber Eats) por embedding — se um dia o
Uber virar uso transacional (recibo de corrida), criar regra própria antes de
domínio.

**Onda 22** (`tests/mock-dataset-22.js`): cruz da **PlayStation Store** — o
domínio `playstation.com` pertence a `servicos` (5), mas a promo com
"descontos de até 70%" cai em `ads` pela keyword (4 < 5): alerta de conta →
`servicos`, loja vendendo jogo → `ads`.
