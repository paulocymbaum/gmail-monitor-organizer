# 📬 Gmail Monitor & Organizer

A **Google Apps Script** project that watches your own Gmail inbox, **categorizes incoming
e-mails** with a hybrid engine (**rules → local decision tree → free embedding
similarity**), and **marks each e-mail with a Gmail label for its category
(`GMO/<category>`)** — the mailbox itself becomes the organized archive.

```
Gmail inbox ──▶ rules (domains/keywords) ──▶ matched? ──▶ GMO/<category> label
                        │ no match
                        ▼
       decision tree (local JSON, pure JS) ──▶ confident? ──▶ GMO/<category> label
                        │ low confidence
                        ▼
        embedding similarity (free) ──▶ GMO/<category> label (cached per sender)
```

Nested labels created in your mailbox (under a `GMO` parent):

- `GMO/spam-trash`
- `GMO/shopping`
- `GMO/news`
- `GMO/ads`
- `GMO/newsletters`
- `GMO/finance`
- `GMO/job-search`
- `GMO/social`
- `GMO/work`
- `GMO/uncategorized` (+ `GMO/needs-review` when the AI was unavailable)

> 📐 **How it works internally:** see [ARCHITECTURE.md](./ARCHITECTURE.md).
>
> ✅ **Project status:** implemented per spec — `ARCHITECTURE.md` is the design
> reference and [`src/`](./src) contains the Apps Script sources that follow it.
> `node tests/sandbox.test.js` runs the offline unit tests; `node tests/integration.test.js`
> runs the ~317-sample mock end-to-end suite with automatic gate tuning.

---

## ✨ Features

- **Hybrid categorization** — fast deterministic rules (sender domains + keywords);
  free embedding similarity only for senders without a rule, so it stays free.
- **Local decision-tree tier** — a JSON decision-tree model scores unmatched senders
  in pure JS before the embedding tier runs — and is similarity-confirmed by it.
- **Trilingual (EN · PT · ES)** — language detection is the **first split** of the
  decision tree; bulk/job/money signals are language-aware (PT: *vaga, fatura,
  descadastre* · ES: *empleo, factura, darse de baja*).
- **Labels, not spreadsheets** — processed mail gets `GMO/<category>` + `GMO/Processed`
  labels; the mailbox itself is the archive, zero external storage.
- **AI-outage visibility & precision metric** — verdicts that were low-confidence
  (weak tree leaf, borderline similarity/margin — `CONFIG.needsReview`) or made while
  the embedding tier was unavailable get a `GMO/needs-review` label; `needsReviewReport()`
  turns the tag into an ongoing precision number (flag rate vs processed, per category).
- **AI verdict caching** — each unknown sender is classified **once**, ever.
- **Idempotent & resumable** — processed threads get a `GMO/Processed` label; long runs
  save their cursor and resume on the next trigger.
- **Zero infrastructure** — runs entirely inside Google's free Apps Script quotas.

---

## 📁 Project Structure

```
gmail-monitor-organizer/
├── README.md              ← you are here
├── ARCHITECTURE.md        # technical design / implementation spec
├── appsscript.json        # Apps Script manifest (scopes, timezone)
├── .clasp.json            # clasp config (gitignored — contains your script ID; rootDir=src)
├── .claspignore           # files clasp must never push (node_modules, tests, docs)
├── categories/            # detection-pattern docs (one .md per category)
└── src/
    ├── Main.gs            # entry points & trigger setup
    ├── Config.gs          # ✏️ EDIT ME: categories, rules, tunables
    ├── GmailReader.gs     # Gmail search & extraction
    ├── Categorizer.gs     # hybrid engine: rules → decision tree → AI
    ├── DecisionTree.gs    # local decision-tree inference (JSON model)
    ├── TreeModel.gs       # generated tree model const (safe to gitignore)
    ├── EmbeddingClassifier.gs # free embedding similarity (prototypes + cosine)
    ├── Labeler.gs         # Gmail label markers (GMO/<category>)
    ├── Trainer.gs         # buildTreeFromLabels(): trains ID3 from GMO/ labels
    ├── State.gs           # Script Properties (cursor, caches, secrets)
    └── Utils.gs           # parsing, retry/backoff, logging
```

---

## ✅ Prerequisites

1. A **Google account** (personal Gmail or Workspace).
2. A **Google AI Studio API key** (free — the embedding model costs nothing):
   1. Open <https://aistudio.google.com/apikey>.
   2. Click **Create API key** and copy it — you'll paste it into Script Properties later.
3. *(Optional but recommended)* **Node.js** + **clasp** for local development:
   ```bash
   npm install -g @google/clasp
   ```

---

## 🚀 Setup

### Option A — clasp (recommended for developers)

```bash
# 0. one-time — enable the Apps Script API for your account:
#    https://script.google.com/home/usersettings

npm install -g @google/clasp

# 1. Authenticate
clasp login

# 2. Create the standalone script (from the repo root)
clasp create --title "Gmail Monitor & Organizer" --type standalone

# 3. Preview & push — the repo's .clasp.json sets rootDir "src", so ONLY the
#    11 src/*.gs modules + the manifest are sent; node_modules/, tests/ and
#    docs never reach Apps Script.
npm run status     # clasp show-file-status — what a push would send
npm run push       # syncs the manifest into src/ and runs clasp push -f

# 4. Open the editor to authorize & configure
npm run open       # clasp open-script (prints the URL if no browser opens)
```

> **clasp 3 note** — the CLI renamed its commands: `open` → `open-script`,
> `status` → `show-file-status`, and there is no `--dryrun` on `push`. The npm
> wrappers above (`npm run open/status/push`) handle the renames and the
> manifest sync for you.

### Option B — manual copy (no tooling)

1. Go to <https://script.google.com> → **New project** → name it
   *Gmail Monitor & Organizer*.
2. Create one script file per file in [`src/`](./src) and paste the contents
   (e.g. `Main.gs`, `Config.gs`, …).
3. In **Project Settings ⚙️**, enable **Show "appsscript.json"**, then replace the
   manifest with [`appsscript.json`](./appsscript.json) (this pre-declares the scopes).

---

## ⚙️ Configure (both options)

1. In the Apps Script editor open **Project Settings ⚙️ → Script Properties** and add:

   | Property | Value |
   |----------|-------|
   | `GEMINI_API_KEY` | your key from AI Studio |

2. Open `src/Config.gs` and adjust categories to your life:

   ```js
   const CATEGORIES = [
     { id: 'news',
       rules: { domains: ['nytimes.com','bbc.com','elpais.com'],
                keywords: ['breaking news','top headlines'] } },
     { id: 'ads',
       rules: { domains: ['groupon.com'],
                keywords: ['% off','coupon','black friday'] } },
     { id: 'newsletters',
       rules: { domains: ['substack.com','beehiiv.com'],
                keywords: ['newsletter','unsubscribe'] } },
     { id: 'finance',
       rules: { domains: ['nubank.com.br','paypal.com'],
                keywords: ['invoice','fatura'] } },
     // add / remove categories freely
   ];
   ```

   - `domains` — matches the sender's e-mail domain **or any subdomain**.
   - `keywords` — case-insensitive match in sender name, subject, or snippet.
   - Order matters: the **first matching category wins**.

   📂 Full detection patterns per category (domains, keywords, AI hints, examples) are
   documented in [`categories/`](./categories) — keep `Config.gs` in sync with them.

### First run & automation

In the editor, run these once from the function dropdown (authorize when prompted):

1. **`bootstrapLabels`** — creates the whole `GMO/…` label tree in your mailbox.
2. **`processNewEmails`** — processes e-mails from the last `searchHorizonDays`
   (default 3) as an initial run.
3. **`setupTrigger`** — installs the time-driven trigger (cadence from
   `CONFIG.triggerMinutes`, default hourly) that keeps everything up to date
   automatically.
4. **`backfill(days)`** — (opcional) classifica o histórico recente:
   `backfill(30)`, `backfill(180)`… Rodar de novo continua de onde parou
   (o que já tem `GMO/Processed` é pulado).
5. **`backfillFila(days)`** — o mesmo, em **MODO FILA**: ao atingir 429 espera
   a janela de RPM (~1 min) e repete o lote; se a cota não abrir, pausa **sem
   marcar** as threads — rode de novo (ou espere o trigger horário) e a fila
   continua de onde parou. Nada fica sem `GMO/Processed`.
6. **`needsReviewReport`** — métrica de precisão: taxa de `needs-review`
   (baixa confiança) por categoria.
7. **`reprocessNeedsReview`** — re-triagem imediata de needs-review com o
   modelo atual (também roda automaticamente a cada execução).
8. **`reprocessProcessed(maxThreads)`** — batch de re-triagem dos **JÁ
   PROCESSADOS** com o modelo atual (retomável por cursor): troca a label de
   categoria de quem mudou de categoria com as melhorias, sincroniza
   `needs-review` e nunca rebaixa para uncategorized. Rode após cada rodada de
   melhorias de regras/refs; `reprocessProcessedStatus` mostra o progresso.
9. **`analyzeUncategorized`** — diagnostico do bucket uncategorized: agrupa por
   domínio, sugere a categoria mais próxima (via embedding) e aponta quais
   regras promover para reduzir o volume.

---

## 🏷️ Labels Applied to Your Mail

Every processed thread receives:

| Label | Meaning |
|-------|---------|
| `GMO/<category>` | its category — nested under the `GMO` parent label |
| `GMO/Processed` | bookkeeping marker: the pipeline will not touch the thread again |
| `GMO/needs-review` | precision flag: the verdict cleared the gates but was low-confidence (weak tree leaf, borderline similarity/margin — see `CONFIG.needsReview`), or the AI was unavailable. Run **`needsReviewReport`** from the editor for the flag rate per category — it is the system's ongoing precision metric. These threads are **re-triaged automatically by the newest model** (per run, or via **`reprocessNeedsReview`**): a confident re-verdict swaps the category and clears the tag — `GMO/Processed` is never removed |

- Labels are added on top of your existing organization — nothing is moved or archived.
- Handy search: `label:GMO/job-search newer_than:7d`.
- Needs-review mail is **re-tried by the newest model** at the end of every run (capped
  by `CONFIG.needsReview.reprocessBatch`) — or run **`reprocessNeedsReview`** after
  improving rules/references: confident re-verdicts swap the category and clear the
  tag. Nothing is ever left without `GMO/Processed`.
- To re-categorize, swap the `GMO/…` label manually; future mail follows the automated
  rules (a forced-override label is planned; see **Roadmap** below).

### 📉 Reduzindo uncategorized

Mail pessoal genuíno (conversas 1-a-1) **deve** ficar em uncategorized — não é erro.
Para reduzir o **volume** recorrente:

1. Rode **`analyzeUncategorized`** no editor: tabela de domínio → contagem →
   categoria sugerida (via embedding) → assunto exemplo.
2. Domínio recorrente com tema claro (banco, escola, governo, SaaS que você usa…):
   promova para a regra da categoria mais próxima — adicione o domínio em
   `categories/<id>.md` **e** em `CONFIG.gs` (fluxo em [`categories/README.md`](./categories/README.md)).
3. Assuntos que formam um tema sem categoria dedicada: enriqueça as frases de
   referência (`REFERENCES` em `EmbeddingClassifier.gs`) e rode
   `buildEmbeddingPrototypes` — o rebuild por fingerprint é automático.
4. Se a análise mostrar sims logo abaixo de 0.25 para mail claramente
   categorizável, baixe `CONFIG.embedding.minSimilarity`/`minMargin` um pouco
   (custo: mais falso-positivo — reavalie com `needsReviewReport`).
5. `needs-review` é re-triado automaticamente a cada execução: melhorou o
   modelo → os e-mails marcados são recuperados sem ação manual.

### 🧪 Testing

- `node tests/sandbox.test.js` — offline unit tests (80 checks)
- `node tests/integration.test.js` — mock end-to-end suite (~414 samples, toy embeddings)
- `USE_LOCAL_MODEL=1 node tests/integration.test.js` — same suite powered by a **local
  multilingual embedding model** (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
  EN/PT/ES, test-only — production uses Google's free embedding API). Requires
  `npm install` (downloads ~120MB of model weights on first use). The harness
  grid-searches the classifier gates per embedding space and prints the recommended
  values at the end.

### 🧠 Retraining the decision tree

Once your mailbox has a few dozen labeled threads, run **`buildTreeFromLabels`** from
the editor: it trains a language-first ID3 tree from your `GMO/` labels, saves
`tree-model-trained.json` to Drive, and logs how to activate it
(`CONFIG.decisionTree.modelSource = "drive:tree-model-trained.json"`).

---

## ⏱️ How Often Does It Run?

- **Hourly trigger** by default (created by `setupTrigger`); set
  `CONFIG.triggerMinutes` to `1/5/10/15/30` for faster cadences and re-run
  `setupTrigger`.
- Each run walks unlabeled threads **newest first**, in batches of
  `CONFIG.batchSize`, until done, ~4.5 minutes elapse (Apps Script per-execution
  cap is 6 minutes) or `CONFIG.maxBatchesPerRun` is reached. Whatever is left
  continues on the next trigger — nothing is lost.
- **Debounced phases** (`CONFIG.pacing`): cool-downs between the search,
  classify and label steps, plus chunked label writes — smooths Gmail rate
  limits on large backlogs.
- The run cursor (`LAST_RUN`) only advances after a complete run; on a budget
  exit the same window is re-scanned next trigger, and failed threads are
  retried automatically.

---

## 📜 Quotas & Limits (free consumer account)

| Limit | Value | Impact |
|-------|-------|--------|
| Runtime per execution | 6 min | runs self-limit at ~4.5 min and resume |
| Trigger runtime | 90 min/day | hourly trigger stays far below |
| Gmail reads | 20,000/day | only new messages since last run are read |
| Embedding API calls | free tier · 1,500 req/min | decision tree handles most senders locally; 1 call per remaining sender (cached) |
| Embedding model | `gemini-embedding-001` @ 768-d — no charge (`text-embedding-004` was retired by Google → HTTP 404) | plenty for personal-mailbox scale |

---

## 🔐 Privacy & Security

- The script runs **under your own Google account**; no third-party server is involved.
- Your **Google AI Studio API key lives in Script Properties**, never in the code or the repo.
- Only the **subject and a short snippet** are embedded via Google's free embedding
  model — and only for senders with no matching rule. Embeddings are vectors, not
  readable text. Full bodies/attachments never leave Google.
- OAuth scopes are minimal: `gmail.modify`, `drive.file` (only files the script itself
  created, used for the optional tree model), `script.external_request`.
- **Test dataset is 100% synthetic** (`tests/mock-dataset*.js`, ~788 samples): every
  sender, subject and domain is invented — well-known brand names are used as
  classification fixtures only, no real mail content is committed. Generated reports
  (`tests/evaluation-report.md`) contain metrics only.
- `.clasp.json` (which contains **your** Apps Script project ID) is git-ignored — use
  `.clasp.json.example` as the template. The GEMINI API key is never committed: it is
  set per-user in Script Properties (Project Settings ⚙️).

---

## 🛠️ Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GEMINI_API_KEY` warning in logs, everything lands in *Uncategorized* | Add the Script Property (Project Settings ⚙️) — rules keep working either way |
| Labels not appearing | Run `bootstrapLabels` once; then check **Executions** (sidebar) for per-batch label errors |
| Address in the wrong category | Tune `Config.gs` rules and swap the `GMO/…` label manually; the execution log shows the verdict source |
| Nothing is processed | Threads already labeled `GMO/Processed` are skipped on purpose (read/unread doesn't matter); anything older than 3 days: try `backfill(7)` |
| Quota exceeded errors | Lower trigger frequency or `batchSize` in `Config.gs` |
| `Script function not found: doGet` in the log | Someone opened the script's **web-app URL** (`…/exec` or `…/dev`). This project is trigger-driven, not a web app — ignore it, don't open those URLs (use the editor URL, `npm run open`), and archive any *Web app* deployment under **Deploy → Manage deployments** |
| `Permissões não são suficientes para chamar DriveApp.*` | Fixed by design: Drive access uses the **Drive API v3 REST** endpoints via `UrlFetchApp` + `ScriptApp.getOAuthToken()`, keyed by file ID in Script Properties — everything works under the narrow `drive.file` scope (no DriveApp, no Drive-wide search) |
| `Embedding … HTTP 429` | Free-tier rate limit (~100 embedded texts/min, e cada texto do lote conta). O tier agora espaça os chunks do rebuild (`batchPacingMs`, ~94 RPM), faz o rebuild **antes** dos embeds das amostras, espera a janela resetar em 429 (`rateWindowWaitMs`, 45s — também honra `Retry-After`/`retryDelay`) e cai para uncategorized+needs-review com segurança. Se um rebuild falhar, a próxima execução horária o refaz e a re-triagem recupera os e-mails afetados |
| `Embedding … HTTP 404` | The tier auto-fails-over: `v1beta` → `v1` endpoint, and `batchEmbedContents` → per-text `embedContent`. If all paths fail, run **`testEmbedding`** from the editor — it prints the raw status + response body per endpoint (paste it when asking for help) |
| Manifest reset to default (no `oauthScopes`, `America/New_York`) | `clasp create` overwrites `appsscript.json` — restore it from git/README and run `npm run push` again (the push script now aborts if scopes are missing) |
| clasp push rejected | Run `clasp pull` first if you edited files in the web editor |
| `clasp open` / `clasp status` unknown command | clasp 3 renamed them (`open-script`, `show-file-status`) — use `npm run open` / `npm run status` |

---

## 🗺️ Roadmap

- [ ] `GMO/Force:<category>` Gmail label as a manual classification override
- [ ] Optional Slack/webhook run summaries
- [ ] Batch classification of up to 20 unknown senders per `batchEmbedContents` call
- [ ] Time-driven per-category digest e-mails built from `GMO/` labels

---

## 📄 License

MIT — see [LICENSE](./LICENSE). (Adjust the copyright holder line to your name/handle when publishing.)




