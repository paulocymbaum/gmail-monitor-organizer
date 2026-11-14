# Saúde (`saude`)

| Field | Value |
|-------|-------|
| Category ID | `saude` |
| Gmail label | `GMO/saude` |
| Priority | **10 of 14** (after `viagens` — before `job-search`) |
| Detection | domains + keywords · AI fallback supported |

## Definition

Saúde e bem-estar: confirmações e agendamentos de **consultas**, avisos de
**resultados de exames**, comunicação de **planos de saúde** (autorizações,
reembolsos), vacinação e receitas médicas. O remetente é uma **clínica,
laboratório ou operadora** — não uma loja de suplementos (`ads`/`shopping`).

Distinto de `shopping` (farmácia vendendo produto com desconto — priority 2 vence)
e de `uncategorized` (consultas particulares informais, ex.: "cita médica"
genérica em es com ref dedicada de personal-mail).

## Detection patterns

**Domains (rule):** `fleury.com.br`, `einstein.br`, `drconsulta.com`,
`unimed.com.br`, `sulamerica.com.br`, `amil.com.br` (Amil), `dasa.com.br` (Dasa),
`sabin.com.br` (Sabin), `hermespardini.com.br` (Hermes Pardini),
`walgreens.com` (Walgreens, EUA), `siriolibanes.org.br` (Sírio-Libanês),
`kp.org` (Kaiser Permanente, EUA), `nhs.uk` (NHS, Reino Unido),
`paguemenos.com.br` (Pague Menos) — siga promovendo via `analyzeUncategorized`.

**Keywords (rule):** `consulta marcada`, `resultado de exame`, `plano de saúde`,
`vacinação`, `receita médica`.

**Embedding refs** cobrem pt/en/es: consulta marcada/clínica, exames
laboratoriais, plano de saúde/reembolso, vacinação, receita médica,
medical appointment / lab results / insurance / prescription en, y análisis/
seguro médico/vacunación/receta es.

## Promote notes

Marcas famosas cobertas na onda 19: Fleury (exames), Einstein (agendamento),
Dr. Consulta (consulta marcada), Unimed (reembolso), SulAmérica (autorização),
Sanitas es e CVS Pharmacy en (ambas via embedding — domínios fora do Config de
propósito).

Cuidado com ambiguidade lexical: "receita" (de bolo) ≠ "receita médica" — a
amostra de receita culinária usa assunto sem a palavra para não colidir, e a ref
es de "cita médica" personal continua em `uncategorized` de propósito.

**Onda 20** (`tests/mock-dataset-20.js`): Amil, Dasa, Sabin, Hermes Pardini e
Walgreens em rule; Zocdoc (en) e Farmacia San Pablo (es) via embedding —
domínios fora do Config de propósito.
**Onda 22** (`tests/mock-dataset-22.js`): Sírio-Libanês, Kaiser Permanente, NHS
e Pague Menos em rule; Rede D'Or via embedding (ref pt "cirurgia agendada
hospital equipe médica"). Armadilha real: o snippet da farmácia NÃO pode usar a
palavra "encomenda" — a keyword de `shopping` (2) venceria o domínio de `saude`
(10).

