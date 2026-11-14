# Model Evaluation Report

- Dataset: **788 mock samples** (tests/mock-dataset*.js)
- Gates (src/Config.gs): minSimilarity=0.25, minMargin=0.03, confirmMargin=0.02, tree minConfidence=0.85
- Embeddings: toy hashed bag-of-words (offline test model)

**Overall accuracy: 100.0% (788/788)**

## Confusion matrix (rows = expected, cols = predicted)

| expected \ got | spam-trash | shopping | news | ads | servicos | newsletters | finance | governo | viagens | saude | job-search | social | work | uncategorized |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **spam-trash** | **27** | · | · | · | · | · | · | · | · | · | · | · | · | · |
| **shopping** | · | **80** | · | · | · | · | · | · | · | · | · | · | · | · |
| **news** | · | · | **40** | · | · | · | · | · | · | · | · | · | · | · |
| **ads** | · | · | · | **49** | · | · | · | · | · | · | · | · | · | · |
| **servicos** | · | · | · | · | **22** | · | · | · | · | · | · | · | · | · |
| **newsletters** | · | · | · | · | · | **126** | · | · | · | · | · | · | · | · |
| **finance** | · | · | · | · | · | · | **84** | · | · | · | · | · | · | · |
| **governo** | · | · | · | · | · | · | · | **18** | · | · | · | · | · | · |
| **viagens** | · | · | · | · | · | · | · | · | **26** | · | · | · | · | · |
| **saude** | · | · | · | · | · | · | · | · | · | **30** | · | · | · | · |
| **job-search** | · | · | · | · | · | · | · | · | · | · | **99** | · | · | · |
| **social** | · | · | · | · | · | · | · | · | · | · | · | **70** | · | · |
| **work** | · | · | · | · | · | · | · | · | · | · | · | · | **46** | · |
| **uncategorized** | · | · | · | · | · | · | · | · | · | · | · | · | · | **71** |

## Per-category metrics

| Category | Samples | Correct | Precision | Recall | F1 |
|---|---:|---:|---:|---:|---:|
| spam-trash | 27 | 27 | 100% | 100% | 100% |
| shopping | 80 | 80 | 100% | 100% | 100% |
| news | 40 | 40 | 100% | 100% | 100% |
| ads | 49 | 49 | 100% | 100% | 100% |
| servicos | 22 | 22 | 100% | 100% | 100% |
| newsletters | 126 | 126 | 100% | 100% | 100% |
| finance | 84 | 84 | 100% | 100% | 100% |
| governo | 18 | 18 | 100% | 100% | 100% |
| viagens | 26 | 26 | 100% | 100% | 100% |
| saude | 30 | 30 | 100% | 100% | 100% |
| job-search | 99 | 99 | 100% | 100% | 100% |
| social | 70 | 70 | 100% | 100% | 100% |
| work | 46 | 46 | 100% | 100% | 100% |
| uncategorized | 71 | 71 | 100% | 100% | 100% |

## Needs-review flag metric (precision proxy)

- Flagged: **148/788** (18.8%)
- Error rate — **flagged**: 0.0% · **unflagged**: 0.0%
- A useful flag correlates with errors: the flagged error rate should exceed the unflagged one.

| Category (predicted) | Flagged | Samples | Flag rate |
|---|---:|---:|---:|
| spam-trash | 3 | 27 | 11.1% |
| shopping | 1 | 80 | 1.3% |
| news | 7 | 40 | 17.5% |
| ads | 10 | 49 | 20.4% |
| servicos | 0 | 22 | 0.0% |
| newsletters | 27 | 126 | 21.4% |
| finance | 4 | 84 | 4.8% |
| governo | 1 | 18 | 5.6% |
| viagens | 1 | 26 | 3.8% |
| saude | 0 | 30 | 0.0% |
| job-search | 30 | 99 | 30.3% |
| social | 6 | 70 | 8.6% |
| work | 1 | 46 | 2.2% |
| uncategorized | 57 | 71 | 80.3% |

## Accuracy by language

| Language | Samples | Correct | Accuracy |
|---|---:|---:|---:|
| EN | 281 | 281 | 100.0% |
| PT | 361 | 361 | 100.0% |
| ES | 146 | 146 | 100.0% |

## Accuracy by tier and language

| Tier | EN | PT | ES | overall |
|---|---|---|---|
| rule | 160/160 (100%) | 230/230 (100%) | 32/32 (100%) | 422/422 |
| tree | 21/21 (100%) | 26/26 (100%) | 21/21 (100%) | 68/68 |
| embedding | 100/100 (100%) | 105/105 (100%) | 93/93 (100%) | 298/298 |
| any | · | · | · | 0/0 |

## Source mix

- `rule`: 457
- `tree`: 47
- `embedding`: 193
- `cache`: 38
- `fallback`: 53

## Misses (0)

| Expected | Got | Source | Lang | Subject |
|---|---|---|---|---|

## Top confusion pairs

