# Model Evaluation Report

- Dataset: **1305 mock samples** (tests/mock-dataset*.js)
- Gates (src/Config.gs): minSimilarity=0.25, minMargin=0.03, confirmMargin=0.02, tree minConfidence=0.85
- Embeddings: toy hashed bag-of-words (offline test model)

**Overall accuracy: 100.0% (1305/1305)**

## Confusion matrix (rows = expected, cols = predicted)

| expected \ got | spam-trash | shopping | news | ads | servicos | newsletters | finance | governo | viagens | saude | job-search | social | work | uncategorized |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **spam-trash** | **88** | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **shopping** | · | **80** | · | · | · | · | · | · | · | · | · | · | · | · |
| **news** | · | · | **96** | · | · | · | · | · | · | · | · | · | · | · |
| **ads** | · | · | · | **96** | · | · | · | · | · | · | · | · | · | · |
| **servicos** | · | · | · | · | **92** | · | · | · | · | · | · | · | · | · |
| **newsletters** | · | · | · | · | · | **126** | · | · | · | · | · | · | · | · |
| **finance** | · | · | · | · | · | · | **84** | · | · | · | · | · | · | · |
| **governo** | · | · | · | · | · | · | · | **91** | · | · | · | · | · | · |
| **viagens** | · | · | · | · | · | · | · | · | **88** | · | · | · | · | · |
| **saude** | · | · | · | · | · | · | · | · | · | **90** | · | · | · | · |
| **job-search** | · | · | · | · | · | · | · | · | · | · | **99** | · | · | · |
| **social** | · | · | · | · | · | · | · | · | · | · | · | **92** | · | · |
| **work** | · | · | · | · | · | · | · | · | · | · | · | · | **94** | · |
| **uncategorized** | · | · | · | · | · | · | · | · | · | · | · | · | · | **89** |

## Per-category metrics

| Category | Samples | Correct | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|
| spam-trash | 88 | 88 | 100% | 100% | 100% |
| shopping | 80 | 80 | 100% | 100% | 100% |
| news | 96 | 96 | 100% | 100% | 100% |
| ads | 96 | 96 | 100% | 100% | 100% |
| servicos | 92 | 92 | 100% | 100% | 100% |
| newsletters | 126 | 126 | 100% | 100% | 100% |
| finance | 84 | 84 | 100% | 100% | 100% |
| governo | 91 | 91 | 100% | 100% | 100% |
| viagens | 88 | 88 | 100% | 100% | 100% |
| saude | 90 | 90 | 100% | 100% | 100% |
| job-search | 99 | 99 | 100% | 100% | 100% |
| social | 92 | 92 | 100% | 100% | 100% |
| work | 94 | 94 | 100% | 100% | 100% |
| uncategorized | 89 | 89 | 100% | 100% | 100% |

## Needs-review flag metric (precision proxy)

- Flagged: **200/1305** (15.3%)
- Error rate — **flagged**: 0.0% · **unflagged**: 0.0%
- A useful flag correlates with errors: the flagged error rate should exceed the unflagged one.

| Category (predicted) | Flagged | Samples | Flag rate |
|---|---:|---:|---:|
| spam-trash | 17 | 88 | 19.3% |
| shopping | 1 | 80 | 1.3% |
| news | 17 | 96 | 17.7% |
| ads | 12 | 96 | 12.5% |
| servicos | 4 | 92 | 4.3% |
| newsletters | 27 | 126 | 21.4% |
| finance | 4 | 84 | 4.8% |
| governo | 1 | 91 | 1.1% |
| viagens | 1 | 88 | 1.1% |
| saude | 5 | 90 | 5.6% |
| job-search | 30 | 99 | 30.3% |
| social | 6 | 92 | 6.5% |
| work | 1 | 94 | 1.1% |
| uncategorized | 74 | 89 | 83.1% |

## Accuracy by language

| Language | Samples | Correct | Accuracy |
|---|---:|---:|---:|
| EN | 446 | 446 | 100.0% |
| PT | 639 | 639 | 100.0% |
| ES | 220 | 220 | 100.0% |

## Accuracy by tier and language

| Tier | EN | PT | ES | overall |
|---|---|---|---|
| rule | 304/304 (100%) | 465/465 (100%) | 85/85 (100%) | 854/854 |
| tree | 21/21 (100%) | 26/26 (100%) | 21/21 (100%) | 68/68 |
| embedding | 121/121 (100%) | 148/148 (100%) | 114/114 (100%) | 383/383 |
| any | · | · | · | 0/0 |

## Source mix

- `rule`: 772
- `tree`: 52
- `embedding`: 279
- `cache`: 132
- `fallback`: 70

## Misses (0)

| Expected | Got | Source | Lang | Subject |
|---|---|---|---|---|

## Top confusion pairs

