# Viagens (`viagens`)

| Field | Value |
|-------|-------|
| Category ID | `viagens` |
| Gmail label | `GMO/viagens` |
| Priority | **9 of 14** (after `governo` — before `saude`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

E-mails de **viagem**: reservas de hotel e hospedagem, confirmações de voo,
check-in e boarding pass, pacotes de agências e aluguel de carro. São
comunicações de alta importância (uma reserva perdida custa caro) que antes se
perdiam entre `ads` e `uncategorized`.

Distinto de `ads` (promo de viagem com cupom/% off — priority 4 vence: "passagens
com 50% off" continua em `ads`) e de `shopping` (e-commerce de entrega —
"encomenda entregue" não é viagem).

## Detection patterns

**Domains (rule):** `booking.com`, `airbnb.com`, `latam.com`, `voegol.com.br`,
`azul.com.br`, `decolar.com`, `expedia.com`, `cvc.com.br`, `emirates.com`,
`marriott.com` (Marriott), `ryanair.com` (Ryanair), `delta.com` (Delta),
`maxmilhas.com.br` (MaxMilhas), `flytap.com` (TAP Air Portugal),
`hilton.com` (Hilton), `united.com` (United), `aa.com` (American Airlines),
`hotels.com` (Hotels.com).

**Keywords (rule):** `sua reserva`, `boarding pass`, `check-in online`,
`seu voo`, `sua estadia`, `booking confirmation`.

**Embedding refs** cobrem pt/en/es: reserva de hotel confirmada, check-in online
e embarque, passagem aérea/boarding pass, aluguel de carro, pacotes,
booking confirmation en, vuelo/paquete es.

## Promote notes

Marcas famosas cobertas na onda 19: LATAM (check-in), GOL (boarding pass), Azul
(confirmação), Decolar (reserva), Expedia (trip booked), CVC (Caribe), Emirates
(EN boarding pass) e Hurb (embedding — domínio fora do Config de propósito).

Deliberatamente SEM keyword es de "reserva": a amostra antiga de restaurante
"Su reserva está confirmada para esta noche" deve continuar em `uncategorized`
(a ref de uncategorized em es vence com folga).

**Onda 20** (`tests/mock-dataset-20.js`): Marriott, Ryanair, Delta e MaxMilhas em
rule; Tripadvisor via embedding; e a precedência cruzada documentada — **promo
da Booking** ("promoção de verão") cai em `ads` (keyword 4 vence o domínio
`viagens` 9): confirmação/reserva → `viagens`, marketing → `ads`.
**Onda 22** (`tests/mock-dataset-22.js`): TAP 🇵🇹, Hilton, United, Hotels.com e
American Airlines em rule; **Iberia** via embedding es (ref "su reserva de vuelo
confirmada" — nota: amostras es de viagem não devem dizer "está confirmada"
seguido de "para", senão a ref personal de restaurante em es disputa o veredito).

