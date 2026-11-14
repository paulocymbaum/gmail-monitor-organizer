# 📬 Gmail Monitor & Organizer

A **Google Apps Script** project that watches your own Gmail inbox, **categorizes incoming
e-mails** with a hybrid engine (**rules → local decision tree → free embedding
similarity**), and **marks each e-mail with a Gmail label for its category
(`GMO/<category>`)** — the mailbox itself becomes the organized archive.

> 🌎 **Trilingual inbox: English · Português (BR) · Español.** Each message's
> language is detected on arrival, and the whole engine — decision-tree
> features, keyword markers, embedding references — is language-aware. A mixed
> mailbox (English newsletters + Brazilian bank statements + Spanish job
> alerts) works with **zero configuration**. See **🗣️ Supported Languages**
> below.

```
Gmail inbox ──▶ rules (domains/keywords) ──▶ matched? ──▶ GMO/<category> label
                        │ no match
                        ▼
       decision tree (local JSON, pure JS) ──▶ confident? ──▶ GMO/<category> label
                        │ low confidence
                        ▼
        embedding similarity (free) ──▶ GMO/<category> label (cached per sender)
```

Nested labels created in your mailbox (under a `GMO` parent) — **14 categories**:

- `GMO/spam-trash`
- `GMO/shopping`
- `GMO/news`
- `GMO/ads`
- `GMO/servicos` — account/service notifications (security alerts, maintenance, product updates)
- `GMO/newsletters`
- `GMO/finance`
- `GMO/governo` — government (gov.br, IRPF, INSS…)
- `GMO/viagens` — travel (bookings, check-ins, flights, hotels)
- `GMO/saude` — health (appointments, exams, insurance)
- `GMO/job-search`
- `GMO/social`
- `GMO/work` — professional mail incl. dev platforms (GitHub/GitLab, Slack,
  Vercel, Anthropic/Claude, OpenAI, Ollama, Redis, Doppler, Supabase, Sentry…)
- `GMO/uncategorized` (+ `GMO/needs-review` when the AI was unavailable)

> 📐 **How it works internally:** see [ARCHITECTURE.md](./ARCHITECTURE.md),
> plus the **🗄️ Data Engineering** and **🤖 Data Science & NLP** deep dives
> near the end of this README.
>
> ✅ **Project status:** implemented per spec — `ARCHITECTURE.md` is the design
> reference and [`src/`](./src) contains the Apps Script sources that follow it.
> `node tests/sandbox.test.js` runs the offline unit tests; `node tests/integration.test.js`
> runs the ~414-sample mock end-to-end suite with automatic gate tuning; `node tests/evaluate.js`
> scores the full **1,305-sample** synthetic corpus per category and language (currently 100%).

---

## ✨ Features

- **Hybrid categorization** — fast deterministic rules (sender domains + keywords);
  free embedding similarity only for senders without a rule, so it stays free.
- **Local decision-tree tier** — a JSON decision-tree model scores unmatched senders
  in pure JS before the embedding tier runs — and is similarity-confirmed by it.
- **Self-tuning tree (weekly, in-script)** — `Tuner.gs` grid-searches tree
  hyperparameters (`maxDepth × minSamplesNode × minConfidence`) over your tagged
  mail with stratified cross-validation, compares the winner against the current
  champion tree and saves a candidate model to Drive — **zero embedding quota**,
  chunked under the 6-minute cap (a paused sweep resumes next run), activation
  opt-in (`CONFIG.trainer.tune.autoApply`).
- **Trilingual out of the box (English · PT-BR · Español)** — language detection
  is the **first split** of the decision tree and every signal is language-aware
  (PT-BR: *vaga, fatura, boleto, descadastre* · ES: *empleo, factura, darse de
  baja* · EN: *unsubscribe, invoice, job alert*); each category ships
  hand-written reference phrases in all three languages.
- **Labels, not spreadsheets** — processed mail gets `GMO/<category>` + `GMO/Processed`
  labels; the mailbox itself is the archive, zero external storage.
- **AI-outage visibility & precision metric** — verdicts that were low-confidence
  (weak tree leaf, borderline similarity/margin — `CONFIG.needsReview`) or made while
  the embedding tier was unavailable get a `GMO/needs-review` label; `needsReviewReport()`
  turns the tag into an ongoing precision number (flag rate vs processed, per category).
- **AI verdict caching with TTL** — each unknown sender is classified **once per
  TTL** (default 30 days, `CONFIG.senderCacheTtlDays`); expired verdicts get a
  fresh chance with the current model, and fallbacks are never cached.
- **Idempotent & resumable** — processed threads get a `GMO/Processed` label; long runs
  save their cursor and resume on the next trigger.
- **Zero infrastructure** — runs entirely inside Google's free Apps Script quotas.

---

## 🗣️ Supported Languages (English · PT-BR · Español)

The classifier is **trilingual by design**: a single mailbox receiving English
newsletters, Brazilian bank statements and Spanish job alerts is the *target*
use case — with no per-language configuration.

- **Detection is step zero** — every message's language is detected first
  (stopword voting over deliberately unambiguous word lists) and drives
  everything downstream: the decision tree's root split and all
  bulk/job/money/promo/news markers are language-conditioned
  (PT-BR: *vaga, fatura, boleto, descadastre* ·
  ES: *empleo, factura, darse de baja* ·
  EN: *unsubscribe, invoice, job alert*).
- **Natively multilingual, not machine-translated** — every category ships
  hand-written reference phrases in all three languages for the embedding
  tier, and the evaluation corpus spans EN (281) · PT (361) · ES (146)
  samples with accuracy reported **per language**.
- **Similar words never collide** — near-identical terms across languages
  (ES *factura* vs PT-BR *fatura*, both "invoice") are matched by the
  *detected* language's marker list, never mixed.
- **Extending to a new language** — add stopwords and `LANG_MARKERS` in
  `DecisionTree.gs`, add reference phrases to `REFERENCES` in
  `EmbeddingClassifier.gs`, run `buildEmbeddingPrototypes`, and cover it in
  the mock datasets (see **Data Science & NLP** below).

Labels (`GMO/<category>`), configuration and logs are language-neutral.

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
#    12 src/*.gs modules + the manifest are sent; node_modules/, tests/ and
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
   `CONFIG.triggerMinutes`, default every 24 h) that keeps everything up to
   date automatically.
4. **`backfill(days)`** — (optional) classify recent history: `backfill(30)`,
   `backfill(180)`… Re-running resumes where it stopped (threads already
   carrying `GMO/Processed` are skipped).
5. **`runFullFlow(days)`** — the **complete flow** (default 30 days), always in
   this order: ① new/unlabeled mail in **queue mode** (on HTTP 429 it waits out
   the RPM window and repeats the batch; if the quota never opens, it pauses
   **without marking** threads) → ② `needs-review` re-triage → ③
   `uncategorized` re-triage → ④ `processed` backlog continuation.
   Budget-guarded end-to-end; re-running resumes where it stopped (nothing is
   ever left without `GMO/Processed`).
6. **`needsReviewReport`** — precision metric: `needs-review` (low-confidence)
   rate per category.
7. **`reprocessNeedsReview`** — immediate needs-review re-triage with the
   current model (also runs automatically at the end of every execution).
8. **`reprocessProcessed(maxThreads)`** — batch re-triage of the **ALREADY
   PROCESSED** corpus with the current model (cursor-resumable): swaps the
   category label of threads whose verdict improved, syncs `needs-review`,
   and never downgrades to uncategorized. The trigger already runs it
   **automatically at the end of the queue** after model changes; run it
   manually to push the backlog right now. `reprocessProcessedStatus` shows
   progress.
9. **`analyzeUncategorized`** — diagnostics for the uncategorized bucket:
   groups by domain, suggests the nearest category (via embeddings) and
   points out which rules to promote to shrink the volume.
10. **`buildTreeFromLabels`** — (optional) once your mailbox has a few dozen
    `GMO/…`-labeled threads, trains a language-first ID3 tree from them and
    saves `tree-model-trained.json` to Drive (activation instructions logged).
11. **`setupWeeklyTuner`** — (optional, recommended once mail is tagged)
    installs the **weekly ML tuner**: `runWeeklyTuner` fires every Monday —
    cross-validated hyperparameter search over your tagged corpus, winner
    compared against the champion tree, candidate saved to Drive (activation
    gated by `CONFIG.trainer.tune.autoApply`, default off).
    `tunerStatus` shows progress; `removeWeeklyTuner` uninstalls.

---

## ⏱️ How Often Does It Run?

- **Daily trigger (every 24 h)** by default (`CONFIG.triggerMinutes: 1440`,
  fires at `triggerHour`); any value works — ≥1440 min → daily/multi-day
  (`everyDays` at `triggerHour`), 60–1439 → hours, below → snapped to
  `1/5/10/15/30` min — then re-run `setupTrigger`.
- **Weekly (optional) — the ML tuner** — `setupWeeklyTuner` adds a Monday
  trigger for `runWeeklyTuner`: corpus refreshed from your tagged mail
  (Drive-cached for 7 days), rotating hyperparameter ladder chunked under the
  6-minute cap (a paused sweep resumes where it stopped), best combo validated
  by cross-validation and reported in the logs.
- **The trigger run drains the backlog as a queue** — on HTTP 429 it waits out
  the rate window and repeats the request; if the quota never opens, it pauses
  **without marking** threads, so the queue persists for the next trigger
  (same semantics as `runFullFlow`).
- **Backlog expansion with NO date limit** — once the search window runs dry,
  the run switches to a **full-history scan** (no `after:` clause) — same queue
  of batches, same debounces, repeating after every batch — until every e-mail
  is evaluated or a 429 pauses the queue.
- **Daily limit of 200 e-mails** (`CONFIG.dailyEmailLimit`) — one persistent
  per-day counter shared by all runs and the re-triage cards; when it is hit
  the run stops before fetching more (the queue persists) and the cards defer
  to tomorrow.
- **Re-triage cards run at the END of the queue, in this order** — with the
  new-mail queue drained and budget left, the run automatically: ① re-scores
  `GMO/needs-review` mail → ② gives the `uncategorized` bucket a fresh chance
  with the current model → ③ continues the `reprocessProcessed` backlog
  (cursor-resumable) until the model is up to date. New mail always outranks
  the reprocess backlog.
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
| Trigger runtime | 90 min/day | daily trigger: 1 run × ≤ 6 min — ample headroom |
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
  created — optional tree models, the weekly tuner's tagged-mail corpus and its
  candidate models), `script.external_request`.
- **Test dataset is 100% synthetic** (`tests/mock-dataset*.js`, ~1305 samples): every
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
| `Embedding … HTTP 429` | Free-tier rate limit (~100 embedded texts/min — every text in a batch counts). The tier spaces out rebuild chunks (`batchPacingMs`, ~94 RPM), rebuilds **before** embedding the samples, waits out the window on 429 (`rateWindowWaitMs`, 45 s — also honors `Retry-After`/`retryDelay`) and safely falls back to uncategorized+needs-review. If a rebuild fails, the next hourly execution redoes it and re-triage recovers the affected e-mails |
| `Embedding … HTTP 404` | The tier auto-fails-over: `v1beta` → `v1` endpoint, and `batchEmbedContents` → per-text `embedContent`. If all paths fail, run **`testEmbedding`** from the editor — it prints the raw status + response body per endpoint (paste it when asking for help) |
| Manifest reset to default (no `oauthScopes`, `America/New_York`) | `clasp create` overwrites `appsscript.json` — restore it from git/README and run `npm run push` again (the push script now aborts if scopes are missing) |
| clasp push rejected | Run `clasp pull` first if you edited files in the web editor |
| `clasp open` / `clasp status` unknown command | clasp 3 renamed them (`open-script`, `show-file-status`) — use `npm run open` / `npm run status` |

---

## 🧰 Maintenance & Tuning

Ongoing upkeep once the pipeline is running: shrinking the uncategorized
bucket, running the test suites, retraining the models. Every function here
runs from the Apps Script editor function dropdown.

### 📉 Reducing the uncategorized bucket

Genuine personal mail (1-to-1 conversations) **belongs** in uncategorized —
that is not an error. To shrink the recurring **volume**:

1. Run **`analyzeUncategorized`** from the editor: a table of domain → count →
   suggested category (via embeddings) → example subject.
2. A recurring domain with a clear theme (your bank, school, government, a SaaS
   you use…): promote it into the nearest category's rules — add the domain to
   `categories/<id>.md` **and** `Config.gs` (workflow in
   [`categories/README.md`](./categories/README.md)).
3. Subjects forming a theme with no dedicated category: enrich the reference
   phrases (`REFERENCES` in `EmbeddingClassifier.gs`) and run
   `buildEmbeddingPrototypes` — the fingerprint-based rebuild is automatic.
4. If the analysis shows similarities just below 0.25 for clearly categorizable
   mail, lower `CONFIG.embedding.minSimilarity`/`minMargin` a little (cost:
   more false positives — re-evaluate with `needsReviewReport`).
5. `needs-review` mail is re-triaged automatically at every execution: when
   the model improves, tagged e-mails recover with no manual action.

### 🧪 Testing

- `node tests/sandbox.test.js` — offline unit tests (242 checks)
- `node tests/integration.test.js` — mock end-to-end suite (~414 samples, toy embeddings)
- `USE_LOCAL_MODEL=1 node tests/integration.test.js` — same suite powered by a **local
  multilingual embedding model** (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
  EN/PT/ES, test-only — production uses Google's free embedding API). Requires
  `npm install` (downloads ~120MB of model weights on first use). The harness
  grid-searches the classifier gates per embedding space and prints the recommended
  values at the end.
- `node tests/evaluate.js` — full evaluation over the **1,305-sample** synthetic
  corpus (waves 1–27): accuracy, needs-review noise and confusion pairs,
  per category and per language.
- `npm run tune:gates` / `npm run tune:tree` — offline hyperparameter searches:
  the classifier acceptance gates, and the decision-tree shapes
  (`maxDepth × minSamplesNode × minConfidence`) with 5-fold cross-validation —
  `tests/tune-tree-report.md` keeps the per-round comparison table.

### 🧠 Retraining the decision tree

Once your mailbox has a few dozen labeled threads, run **`buildTreeFromLabels`** from
the editor: it trains a language-first ID3 tree from your `GMO/` labels, saves
`tree-model-trained.json` to Drive, and logs how to activate it
(`CONFIG.decisionTree.modelSource = "drive:tree-model-trained.json"`).

---

## 🗄️ Data Engineering

Under the hood, GMO is a **single-tenant streaming pipeline**: Gmail is the
source, the Apps Script runtime is the stream processor, and the Gmail label
tree is both the sink and the archive. This section documents the data-side
design — ingestion contract, state stores, delivery semantics, throughput
control and the ML data lifecycle. (Deeper internals: [ARCHITECTURE.md](./ARCHITECTURE.md).)

### Pipeline at a glance

```
┌──────────────┐   Gmail = source; the unlabeled-thread result set (newest first) IS the queue
│   1 FETCH    │   batched search (CONFIG.batchSize) · offset-0 repagination · seen map + stall guard
│              │   out: plain records {sender, subject, snippet, body-scan, date, permalink}
└──────┬───────┘
       ▼
┌──────────────┐   resolution order: sender cache (O(1) hit) ▸ rules ▸ decision tree ▸ embeddings
│  2 CLASSIFY  │   out: verdict {category, source: cache|rule|tree|embedding|fallback, needsReview}
└──────┬───────┘
       ▼
┌──────────────┐   chunked idempotent writes → Gmail labels (the storage):
│   3 LABEL    │   GMO/<category> + GMO/Processed (+ GMO/needs-review when flagged)
└──────┬───────┘
       ▼
┌──────────────┐   LAST_RUN advances only after a complete run; budget/quota exits keep it —
│ 4 CHECKPOINT │   the next trigger rescans the same window (labeled threads leave the result set)
└──────────────┘
```

### Ingestion contract

- **The queue is a Gmail query.** Every run fetches
  `-label:GMO/Processed -in:spam -in:trash after:YYYY/MM/DD`. Excluding the
  watermark label makes the work queue *persistent*: budget exits, quota
  pauses and crashes all resume from the same result set on the next trigger —
  no external job queue needed.
- **Batching & pagination** — `CONFIG.batchSize` (25) threads per search,
  **newest first**. Each batch re-pages from **offset 0**: labeled threads
  leave the result set, so page 0 always holds the next unprocessed work.
  A `seen` map plus a stall guard (2 pages with nothing new → stop) make
  re-fetches safe; failed label writes are simply re-included next run.
- **Normalized records** — per thread, the newest message is flattened to a
  plain object: lower-cased sender address (the **dedup key**, RFC-5322
  parsed), display name, subject, snippet (first 300 chars), body-scan prefix
  (first 3,000 chars), date and permalink. No Gmail entity crosses
  `GmailReader.gs` — downstream stages consume pure data, which is what makes
  them unit-testable offline.

### Storage model — labels as the ledger

| Artifact | Role | Semantics |
|----------|------|-----------|
| `GMO/<category>` | **payload** | the category dimension; swapping the label = updating the record |
| `GMO/Processed` | **watermark** | exactly-once *effect* — applied in the same batch pass as the category label; `addLabel` on a labeled thread is a no-op |
| `GMO/needs-review` | **quality flag** | low-confidence / AI-outage dead-letter channel; re-triaged automatically by newer models |
| Gmail search | **query engine** | `label:GMO/finance newer_than:7d` replaces SQL — zero infrastructure |

Durable mutable state is deliberately tiny (Script Properties KV):

| Key | Content | Size strategy |
|-----|---------|---------------|
| `LAST_RUN` | ISO timestamp **cursor** | advances only after a *complete* run |
| `SENDER_CACHE` | JSON `{addr: {c, nr, t}}` — verdict + needs-review flag + epoch-ms stamp per sender | **TTL** (default 30 days, `CONFIG.senderCacheTtlDays`) + pruned near the 9 KB per-property cap |
| `REPROCESS_FINGERPRINT` | model fingerprint of the last full re-triage | detects stale re-processes (`reprocessProcessedStatus()`) |
| `DAILY_USAGE` | JSON `{d, n}` — e-mails (re)classified today | daily limit `CONFIG.dailyEmailLimit` (200); auto-resets |
| `GEMINI_API_KEY` | secret | never in source control |

Run-scoped memos are plain in-memory variables (`State.memo`,
`EmbeddingClassifier.prototypesCache`) — `CacheService` is not used; all
durable state lives in Script Properties or in the labels themselves.

### Delivery semantics

- **At-least-once processing, exactly-once effect.** A thread may be fetched
  and classified more than once (budget exit → cursor kept → window rescanned),
  but the idempotent label writes make the *end state* converge: no duplicate
  categories, no thread ever left unmarked.
- **Cursor discipline** — `LAST_RUN` narrows the scan window and only advances
  after a complete pass; time-budget and batch-ceiling exits keep it, so the
  next trigger rescans the same window and skips already-labeled threads.
- **No cache poisoning** — fallback verdicts (embedding tier unavailable) are
  *never* written to the sender cache, so an outage can't permanently
  mislabel a sender. Confident re-verdicts overwrite cache entries; legacy
  string-shaped entries still read correctly (schema evolution is handled).

### Throughput & quota engineering

The pipeline is tuned to live inside the free quotas (6-min execution cap,
90-min/day trigger budget, 20k Gmail reads/day, free-tier embedding RPM):

- **Time-budget guard** — runs self-limit at ~4.5 min (`CONFIG.maxRuntimeMs`)
  plus a hard `CONFIG.maxBatchesPerRun` ceiling, then exit cleanly *with the
  cursor intact*.
- **Paced phases** — debounces between fetch and classify plus chunked label
  writes with cooldowns (`CONFIG.pacing`) smooth Gmail rate limits on large
  backlogs.
- **Rate-window patience** — embedding rebuilds are spaced at ~94 RPM
  (`batchPacingMs`); on HTTP 429 the tier waits out the window
  (`rateWindowWaitMs`, 45 s, honoring `Retry-After`) before retrying.
- **Queue mode** (`runFullFlow` / trigger runs) — on 429 it waits and repeats the *same*
  request without consuming attempts (up to `queue429MaxWaits`); if the quota
  never opens, it pauses **without marking threads**, leaving them in the
  persistent queue for the next trigger or manual re-run.
- **Failover paths** — API version `v1beta` → `v1`, `batchEmbedContents` →
  per-text `embedContent`, exponential backoff (2 retries) on 429/5xx, and the
  retired `text-embedding-004` model (HTTP 404) migrated by config to
  `gemini-embedding-001` (768-d, free).

### ML data lifecycle

The mailbox is the training set, the labels are ground truth, and the models
are just two versioned artifacts:

- **Embedding prototypes** — multilingual (EN · PT · ES) reference phrases per
  category are batch-embedded once; **per-phrase exemplar vectors** (never
  centroid-blended — averaging dilutes phrase-level semantics) are persisted
  to Drive as `embedding-prototypes.json`. A **staleness fingerprint**
  (model + output dimension + category set + hash of the reference phrases)
  triggers an automatic rebuild; a cache missing any current category is
  treated as stale, so the tier can only ever output categories it holds
  vectors for.
- **Decision tree** — `buildTreeFromLabels()` trains a language-first ID3
  tree from your own `GMO/` labels and exports `tree-model-trained.json` to
  Drive; activating it is one config line (`CONFIG.decisionTree.modelSource`).
  The label store thus closes the loop: ingest → label → retrain → re-label.
- **Offline gate tuning** — `tests/tune-gates.js` grid-searches the classifier
  thresholds (`minSimilarity` 0.25, `minMargin` 0.03, `confirmMargin` 0.02 and
  the needs-review bands) against ~785 synthetic samples and prints the
  recommended values — the "hyperparameter search" runs offline, never inside
  the quota-limited runtime.
- **Iterative tree tuning** — `tests/tune-tree.js` (npm run tune:tree) trains
  ID3 candidates across `maxDepth × minSamplesNode` shapes (5-fold CV
  stratified), sweeps `minConfidence`, simulates the full cascade per combo and
  iteratively refines around the best. The handcrafted tree itself also enters
  the dispute (its own `minConfidence` is swept) — the winner may legitimately
  be "keep TreeModel.gs". Per-round comparison table saved to
  `tests/tune-tree-report.md`.
- **Weekly in-script tuner** — `src/Tuner.gs` brings the same compare-until-
  best loop INTO Apps Script (`setupWeeklyTuner()` → `runWeeklyTuner()` every
  Monday). Corpus = your tagged mail (threads with exactly one `GMO/<id>`
  label), features built locally — **zero embedding quota**; Drive-cached for
  7 days. Time-budgeted rotating ladder under the 6-minute execution cap: a
  paused sweep resumes where it stopped on the next run. Best combo validated
  by stratified CV, compared against the champion tree; candidate saved to
  Drive and auto-activated ONLY with `CONFIG.trainer.tune.autoApply`
  (default false, requires ≥ +0.5pp CV gain). Run `tunerStatus()` anytime.

### Data quality & observability

- **Per-record lineage** — every verdict logs its **source**
  (`cache` | `rule` | `tree` | `embedding` | `fallback`); run summaries report
  labeled / flagged / skipped / batches / verdict-source mix.
- **Precision as data** — the `GMO/needs-review` flag *is* the pipeline's
  quality metric: `needsReviewReport()` aggregates flag rate overall and per
  category (precision proxy = 1 − flag rate), computed directly from the
  label store — no separate metrics warehouse.
- **Closed-loop correction** — needs-review threads are re-triaged with the
  newest model at the end of every run (`classifyFresh` bypasses the sender
  cache, capped by `CONFIG.needsReview.reprocessBatch`);
  `reprocessProcessed(maxThreads)` batch-rewrites the entire processed corpus
  after model improvements — cursor-resumable, fingerprint-tracked, and it
  **never downgrades** a categorized thread to a fallback verdict.
- **Evaluation pipeline** — ~1305 fully synthetic samples (no real mail is ever
  committed) drive 242 offline unit checks and a mock end-to-end suite;
  `USE_LOCAL_MODEL=1` swaps in a local multilingual embedding space
  (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) and re-grid-searches the
  gates, so classifier behavior is validated per vector space before it ever
  touches production quotas.

---

## 🤖 Data Science & NLP

GMO's classifier is a purpose-built NLP stack, not a chatbot integration:
**there is no LLM generation anywhere** — every tier is either fully
deterministic (rules), locally interpretable (a decision tree), or free
multilingual embeddings (similarity). Design goals: **zero cost, zero
infrastructure, auditable verdicts, and abstention over guessing**. This
section documents the NLP side — preprocessing, features, model architecture,
decision gates and evaluation. Complements the Data Engineering section above;
full internals in [ARCHITECTURE.md](./ARCHITECTURE.md).

### The classifier stack

```
e-mail record
   │  each miss falls through — cost only ever applies to the hard cases
   ▼
1. RULES          sender domain (suffix match) + keywords, priority order
   │ no match          free · deterministic · microseconds
   ▼
2. DECISION TREE  dozens of binary features → JSON tree walk, language-first root
   │ conf < 0.85       free · local · interpretable · similarity-confirmed
   ▼
3. EMBEDDINGS     subject + body-scan → 768-d vector → nearest exemplar (cosine)
   │ gates fail        free API (gemini-embedding-001) · cached per sender
   ▼
4. ABSTAIN        uncategorized + GMO/needs-review — never guess, always flag
```

The shipped evaluation report's source mix (1305 samples) shows the cascade
doing its job: `rule` 457 · `tree` 47 · `embedding` 193 · `cache` 38 ·
`fallback` 53 — most traffic never reaches the API tier.

### Text normalization & language detection

- **One canonical text form** — `normalizeText()` lower-cases, strips accents
  and matches on word boundaries, so `Não`, `NAO` and `nao` are the same token
  to every keyword and marker check downstream.
- **Stopword-vote language detection** — `detectLanguage()` counts hits against
  short, hand-picked stopword lists kept *deliberately unambiguous* across
  languages (PT: *voce, seu, nao, obrigado…* · ES: *gracias, hola, usted…* ·
  EN: *the, you, please, click…*); English is the remainder class. No model,
  no dependencies, one pass over the text.
- **Language comes first, by design** — it is the root split of the decision
  tree (`lang_pt` → `lang_es`, EN remainder) and every bulk/job/money/promo/
  news marker is language-conditioned (`bulk_pt`, `job_es`, `money_en`…).
  No tier is ever asked to be language-agnostic.

### Feature engineering — the binary feature space

`DecisionTree.buildFeatures()` flattens each record into dozens of **binary**
features, chosen to stay human-auditable:

| Family | Examples | Notes |
|--------|----------|-------|
| Config-derived flags | `kw_vaga`, `kw_invoice`, `kw_black_friday`, `dom_substack` | auto-derived from the `CATEGORIES` rules — keep `Config.gs` in sync with `categories/*.md` |
| Language markers | `bulk_pt`, `job_es`, `money_en`, `promo_pt`, `news_es` | accent-stripped trilingual marker lists in `DecisionTree.gs` |
| Structural signals | `is_reply`, `many_recipients` (>3), `many_links` (≥5), `body_long` (>2,500 chars), `subject_len_long` (>60), `cc_present`, `multi_message_thread`, `has_pdf_attachment`, `sender_free_domain`, `via_linkedin_name` | catch the "shape" patterns keywords miss |
| Signal composites | `job_signal`, `money_signal`, `ads_signal`, `news_signal`, `bulk_signal` | OR-reduce their keyword + language markers; `bulk_signal` is a conjunction — `has_unsubscribe` **and** a bulk marker, the "definitely a newsletter" test |

The 3,000-char body scan exists for the features: unsubscribe links, footer
markers and legal boilerplate never appear in the 300-char snippet Gmail shows.

### Tier 2 — the decision tree (interpretable model)

- **Artifact** — a flat JSON walk: inner nodes test a binary feature at
  threshold 0.5; leaves carry `{class, confidence}`; a `class: null` leaf
  defers downstream instead of guessing:

```json
{ "id": 1, "feature": "dom_substack", "threshold": 0.5, "yes": 2, "no": 3 },
{ "id": 2, "leaf": true, "class": "newsletters", "confidence": 0.97 },
{ "id": 3, "leaf": true, "class": "finance",     "confidence": 0.71 }
```

- **Inference** — a pure-JS walk (depth-guarded), microseconds per message,
  zero API cost. Leaf confidence below `decisionTree.minConfidence` (0.85)
  → `null` → the embedding tier takes over.
- **Three swappable model sources** (one config line):
  1. the hand-crafted `TreeModel.gs` (v2.1, language-first);
  2. **in-script ID3** — `Trainer.gs::buildTreeFromLabels()` trains from your
     labeled mailbox inside the execution budget; the language split is
     *forced at the root*, and leaves that resolve to `uncategorized` return
     `null` (defer, don't guess);
  3. **offline sklearn** — train a `DecisionTreeClassifier` on the same
     binary feature matrix and export `tree_.feature / threshold / children_*`
     to the same JSON (binary features map 1:1 onto CART thresholds).

### Tier 3 — embedding similarity (free, multilingual)

- **Model** — `gemini-embedding-001`, 768-d vectors via MRL
  `outputDimensionality`, `taskType: CLASSIFICATION`; the embedded input is
  `subject + body scan` only — never attachments, never sender addresses
  (and embeddings are vectors, not readable text).
- **Prototypes as exemplars, not centroids** — each category keeps a bank of
  trilingual reference phrases (`REFERENCES`); classification takes the **max
  cosine** across the category's exemplars. Averaging phrases into a centroid
  would dilute phrase-level semantics — "unsubscribe anytime" and "weekly
  digest" are different points in vector space.
- **Dual gate + abstention on ties** — the winner needs cosine ≥
  `minSimilarity` (0.25) **and** a `minMargin` (0.03) gap over the runner-up;
  a tie or weak signal returns `null` (never a forced verdict).
- **Tree confirmation protocol** — a confident tree verdict is cross-checked
  against the similarity vector: agreement confirms it; a contradiction with
  margin ≥ `confirmMargin` (0.02) **vetoes the tree** in favor of the
  embedding verdict; inconclusive similarities keep the tree. Two weak
  learners, one arbiter.

### Selective prediction — gates & the needs-review bands

| Gate | Value | Meaning |
|------|-------|---------|
| `decisionTree.minConfidence` | 0.85 | leaf probability required to emit a tree verdict |
| `embedding.minSimilarity` | 0.25 | cosine floor for an embedding-only verdict |
| `embedding.minMargin` | 0.03 | best-vs-runner-up gap (anti-tie) |
| `embedding.confirmMargin` | 0.02 | contradiction margin that vetoes a tree verdict |

Verdicts that clear the gates but land in the **low-confidence review bands**
(`CONFIG.needsReview`) — tree confidence < 0.90, embedding similarity < 0.40,
margin < 0.10 — plus every `fallback` (embedding tier unavailable) are tagged
`GMO/needs-review`. This is textbook **selective prediction**: rather than
forcing a guess, the system abstains visibly, and the abstention rate is
itself the ongoing precision metric. The bands were grid-tuned so that
**flagged error coverage is maximized with minimal noise** — a flag is only
useful if the flagged error rate exceeds the unflagged one.

### Evaluation methodology

The harness (`tests/`) treats the classifier as a measurable artifact:

- **Synthetic corpus** — 1305 invented samples across **14 classes** (13
  categories + uncategorized) spanning **EN (281) · PT (361) · ES (146)**;
  real brand names appear as classification fixtures only and no real mail is
  ever committed.
- **Full metric suite** — overall accuracy, confusion matrix, per-class
  precision/recall/F1, accuracy **by language**, accuracy **by tier**, verdict
  source mix, and per-category needs-review flag rates — all generated into
  [`tests/evaluation-report.md`](./tests/evaluation-report.md).
- **Headline numbers on the offline harness** (deterministic toy hashed
  bag-of-words space, shipped gates): **100% accuracy (1305/1305)**, 18.8%
  flagged, zero misses in the confusion matrix. These certify the *pipeline
  logic and gates* — production-space accuracy depends on the live embedding
  model (see the caveat below).
- **Gate search without re-embedding** — `tests/tune-gates.js` runs the real
  pipeline **once** to memoize each sample's rule verdict, similarity vector
  and tree verdict, then re-simulates every gate combination locally
  (instant, no API). Two nested grids: verdict gates
  (`minSimilarity × minMargin × confirmMargin`) and review bands
  (`treeConfidence × embeddingSimilarity × embeddingMargin`), ranked by
  noise vs error coverage, printing the recommended values.
- **Thresholds don't transfer between vector spaces** — gates tuned in one
  embedding space are invalid in another, so the harness re-grid-searches per
  space: the deterministic toy hash space for CI, a local multilingual MiniLM
  (`USE_LOCAL_MODEL=1`, `Xenova/paraphrase-multilingual-MiniLM-L12-v2`,
  ~120 MB) as a realistic stand-in, with the production
  `gemini-embedding-001` space tuned from its own similarity vectors.
- **Flag-utility criterion** — a needs-review band is only accepted if
  **flagged error rate > unflagged error rate**; a flag that catches no errors
  is noise and gets tuned out.

### The label-driven learning loop

The system closes its own supervision loop, with the mailbox as both serving
store and training set:

1. **inference** labels incoming mail (`GMO/<category>`);
2. **correction** — a manual label move is the ground-truth signal;
3. **retraining** — `buildTreeFromLabels()` trains a fresh language-first ID3
   tree from the accumulated labels — or the **weekly tuner** (`runWeeklyTuner`,
   `Tuner.gs`) cross-validates tree hyperparameters over the same corpus and
   saves a tuned candidate automatically (or export the feature matrix offline
   to sklearn for a bigger model);
4. **re-triage** — `classifyFresh` re-scores needs-review mail and
   `reprocessProcessed` re-scores the whole corpus with the new model;
   confident re-verdicts swap labels and clear the tag, never downgrading to
   fallback (fingerprint-gated so stale passes are detected);
5. **rule promotion** — `analyzeUncategorized()` mines the residual bucket
   (grouped by domain, nearest category suggested via embeddings) so recurring
   senders graduate into deterministic rules.

Each pass shifts work **down the cost ladder**: what the embedding tier used
to decide, the tree or a plain rule decides for free next time.

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
├── tests/                 # sandbox + integration suites, evaluate.js (1305-sample
│                          #   corpus report), mock-dataset waves, tune-gates/tune-tree
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
    ├── Tuner.gs           # weekly in-script tuner: CV grid-search + gate sweep
    ├── State.gs           # Script Properties (cursor, caches, secrets)
    └── Utils.gs           # parsing, retry/backoff, logging
```

---

## 🗺️ Roadmap

- [ ] `GMO/Force:<category>` Gmail label as a manual classification override
- [ ] Optional Slack/webhook run summaries
- [ ] Batch classification of up to 20 unknown senders per `batchEmbedContents` call
- [ ] Time-driven per-category digest e-mails built from `GMO/` labels

---

## 📄 License

MIT — see [LICENSE](./LICENSE). (Adjust the copyright holder line to your name/handle when publishing.)




