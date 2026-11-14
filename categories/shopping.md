# Shopping (`shopping`)

| Field | Value |
|-------|-------|
| Category ID | `shopping` |
| Gmail label | `GMO/shopping` |
| Priority | **2 of 14** (right after the spam filter) |
| Detection | domains + keywords · AI fallback supported |

## Definition

E-commerce and food-delivery mail: order confirmations, shipping/tracking updates,
delivery status, marketplace promotions and coupons, flash-sale blasts. The category
sits **above** `news`, `ads` and `newsletters` on purpose — marketplace domains
(Shopee, Shein, Amazon BR…) must win over generic "unsubscribe" footer keywords and
the `ads` promo keywords (cupom, % off…), whether the mail is a transactional order
update or a promotional blast.

## Detection patterns

### Sender domains (`rules.domains`)

| Domain | Status | Why |
|--------|--------|-----|
| `shopee.com.br` · `shopee.com` | current | Shopee BR + global |
| `shein.com` · `shein.com.br` | current | Shein (BR + global sending domains) |
| `mercadolivre.com.br` · `mercadolivre.com` | current | Mercado Livre / Libre |
| `amazon.com.br` | current | Amazon BR retail. **Deliberately NOT `amazon.com`** — AWS mails come from `aws.amazon.com` and belong in `work` |
| `aliexpress.com` | current | AliExpress |
| `magazineluiza.com.br` | current | Magalu |
| `americanas.com.br` | current | Americanas |
| `casasbahia.com.br` | current | Casas Bahia |
| `netshoes.com.br` | current | Netshoes |
| `kabum.com.br` | current | KaBuM! |
| `temu.com` | current | Temu |
| `ifood.com.br` | current | iFood food delivery |
| `lojasamericanas.com.br` | current | Americanas legacy sending domain |
| `carrefour.com.br` | current | Carrefour Brasil (market + deliveries) |
| `paodeacucar.com.br` | current | Pão de Açúcar / GPA deliveries |
| `rappi.com.br` · `rappi.com` | current | Rappi delivery super-app |
| `renner.com.br` | current | Lojas Renner |
| `cec.com.br` | current | C&A Brasil |
| `dafiti.com.br` | current | Dafiti |
| `centauro.com.br` | current | Centauro |
| `madeiramadeira.com.br` · `madeiramadeira.com` | current | MadeiraMadeira |
| `petz.com.br` · `cobasi.com.br` | current | Pet shops |
| `terabyteshop.com.br` · `pichau.com.br` | current | PC-hardware stores |
| `leroymerlin.com.br` | current | Home improvement |
| `sephora.com.br` · `epocacosmeticos.com.br` · `fastshop.com.br` | suggested | beauty / electronics |
| `correios.com.br` | suggested ⚠ | carrier notices — promote only if you want raw Correios mail here |
| `shein.com.br` · `magalu.com.br` · `casasbahia.com.br` variants | suggested | regional sending domains |

### Keywords (`rules.keywords`)

| Keyword | Status | Matches in | Notes |
|---------|--------|------------|-------|
| `seu pedido` | current | name/subject/snippet | PT-BR order updates |
| `pedido confirmado` | current | name/subject/snippet | PT-BR confirmations |
| `pedido enviado` | current | name/subject/snippet | PT-BR shipping |
| `status do pedido` | current | name/subject/snippet | PT-BR tracking |
| `rastreio` | current | name/subject/snippet | PT-BR tracking code |
| `saiu para entrega` | current | name/subject/snippet | BR delivery status |
| `compra realizada` | current | name/subject/snippet | BR purchase confirmation |
| `nota fiscal` / `nf-e` | suggested ⚠ | subject | BR invoice — B2B invoice mail may belong in `work`/`finance` |
| `your order` | current | name/subject/snippet | EN order updates |
| `order shipped` / `order confirmed` | current | name/subject/snippet | EN confirmations |

## AI fallback hints

Verdict **shopping** when: order numbers and delivery estimates, tracking links,
"pedido enviado/confirmado" phrasing, marketplace branding (Shopee orange, Shein
flash-sale styling), coupon/frete-grátis blasts, food-delivery confirmations.

Not shopping when: payment/billing slips from banks (→ finance), client work
mentions of a purchase order (→ work), or generic newsletters from non-marketplace
senders (→ newsletters).

## Examples

| From | Subject | Verdict | Why |
|------|---------|---------|-----|
| `Shopee <noreply@shopee.com.br>` | `Seu pedido foi enviado — rastreio` | shopping | domain + keyword |
| `SHEIN <promo@shein.com>` | `Cupom de 15% + frete grátis hoje` | shopping | domain beats `unsubscribe` footer (priority 2) |
| `Amazon.com.br <no-reply@amazon.com.br>` | `Seu pedido #402 foi entregue` | shopping | domain |
| `iFood <no-reply@ifood.com.br>` | `Pedido confirmado — Burger King` | shopping | domain + keyword |
| `Loja Desconhecida <promo@unknown-store.com>` | `Seu pedido saiu para entrega` | shopping | keyword `seu pedido` (domain not listed) |
| `Carrefour <no-reply@carrefour.com.br>` | `Seu pedido Carrefour foi confirmado` | shopping | domain `carrefour.com.br` |
| `Renner <pedido@renner.com.br>` | `Promoção Renner: desconto de 30%` | shopping | store domain (2) beats `ads` promo keywords (4) — store promos stay with the store |

## False Positive Patterns

| Pattern | Why it falsely matches | Mitigation |
|---------|------------------------|------------|
| AWS / developer mail from `aws.amazon.com` | if `amazon.com` were listed as a domain | deliberately only `amazon.com.br` is current — never add bare `amazon.com` |
| Client talks about a "purchase order" (PO) | keyword `your order` could fire on PO wording at priority 2, before `work` (9) | PO mail usually carries the client's own domain + names — add client domains to `work` rules |
| Bank mail mentioning "pedido de cartão" | keyword `pedido`-family fires before `finance` (6) | bank domains are current in finance, but domain shopping beats finance only for marketplace domains — bank domains are disjoint ✓ |
| Generic newsletter with the word "rastreio" | rare; keyword fires at priority 2 | acceptable — commerce-adjacent |

## Edge cases & tuning decisions

- **Order receipts with money wording** — a Shopee receipt contains "pagamento",
  but the domain lands it in `shopping` (2) before `finance` (6). Intentional:
  order mail is one bucket; bank/payment mail stays in finance.
- **Marketplace promos** — a Shein blast with "cupom" stays here: the domain wins at
  priority 2 before `ads` (4) checks promo keywords (same reasoning as the
  `newsletters` case above).
- **iFood** — food delivery is "shopping" by decision (order confirmations are the
  bulk of that mail); move it to a future `food` category if you want it separate.
**Onda 21** (`tests/mock-dataset-21.js`): domínios promovidos — `zara.com`,
`nike.com`, `decathlon.com.br`, `natura.com.br` (a keyword `natura` continua
fora de propósito — risco de falso positivo; o **domínio** é seguro) e
`ebay.com`. Cruz documentado: **Decathlon com "% off" fica em `shopping`** — o
domínio (2) vence a keyword de `ads` (4).
