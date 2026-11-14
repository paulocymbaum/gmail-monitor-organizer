# Governo (`governo`)

| Field | Value |
|-------|-------|
| Category ID | `governo` |
| Gmail label | `GMO/governo` |
| Priority | **8 of 14** (after `finance` — before `viagens`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Comunicações de **órgãos públicos e serviços governamentais** (forte recorte BR):
gov.br, Receita Federal/IRPF, INSS, Detran, prefeituras (IPTU), eleições/TSE,
programas sociais, MEI e notificações oficiais. O remetente é o **Estado ou um
portal de serviço público**, não uma empresa.

Distinto de `finance` (bancos e faturas — priority 7 vence primeiro: o CNPJ do
contador vai para `finance`), de `spam-trash` (golpes de "governo" — priority 1).

## Detection patterns

**Domains (rule):** `meumeidigital.com.br`, `receita.fazenda.gov.br`,
`detran.sp.gov.br`, `in.gov.br` (Diário Oficial da União),
`senado.leg.br` (Senado Federal), `irs.gov` (IRS, EUA),
`planalto.gov.br` (Planalto/Presidência), `camara.leg.br` (Câmara dos Deputados).

**Keywords (rule):** `gov.br`, `imposto de renda`, `irpf`, `perdão de dívidas`,
`perdao de dividas`, `prefeitura`, `programa social`, `documento oficial`,
`meu inss`, `inss`, `título de eleitor`, `iptu`, `seguridad social`.

**Embedding refs** cobrem pt/es/en: governo federal/cpf/receita, IRPF,
prefeitura/munícipe, gov.br cadastro, programas sociais, notificações com prazo,
trámites es (cita previa) e tax office en.

## Promote notes

Marcas famosas cobertas na onda 19: Receita Federal (malha fina), Detran-SP
(multa), Meu INSS (perícia), TSE (biometria), Prefeitura de São Paulo (IPTU —
cuidado: nunca usar a palavra "desconto" junto de IPTU, senão `ads` vence) e
Seguridad Social es.

Trade-off documentado: phishing com "documento oficial" pode cair aqui (priority
8) — o filtro `spam-trash` (priority 1, embedding) é quem deve pegar antes; se
começar a vazar, endurecer as refs de spam com os assuntos recorrentes.

**Onda 20** (`tests/mock-dataset-20.js`): Diário Oficial da União, Senado Federal
e IRS em rule; cartão CNPJ pela Receita (domínio reutilizado) e cita previa para
renovação do DNI (es, via embedding).
**Onda 22** (`tests/mock-dataset-22.js`): Planalto (sanção de lei) e Câmara dos
Deputados (plenário virtual) em rule — cobre o Executivo/Legislativo federal;
cartão CNPJ (Receita) e cita previa DNI (es, embedding) na onda 20.

