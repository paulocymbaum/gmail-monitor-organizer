/**
 * Main.gs — orchestrator (ARCHITECTURE.md §4.1).
 * Entry points:
 *   processNewEmails()    — the hourly-triggered run (QUEUE MODE + cards at the end)
 *   runFullFlow(days)     — O FLUXO COMPLETO (default 30 dias), sempre nesta ordem:
 *       1. mail novo sem categoria (modo fila) → 2. needs-review →
 *       3. uncategorized → 4. processed
 *   backfill(days)        — one-off manual run (default 7 days), includes read mail
 *   bootstrapLabels()     — idempotently create all GMO/… labels in Gmail
 *   needsReviewReport()   — precision metric: flagged vs processed, overall + per category
 *   reprocessNeedsReview(max) — re-triagem de needs-review com o modelo atual
 *   retriageUncategorized(max) — re-triagem do bucket GMO/uncategorized com o modelo atual
 *   reprocessProcessed(maxThreads, budgetMs) — batch de re-triagem dos JÁ PROCESSADOS
 *       (retomável por cursor; grava fingerprint do modelo ao completar)
 *   reprocessProcessedStatus() — progresso do batch + pendência de modelo
 *   analyzeUncategorized(maxEmbeds) — diagnóstico: quem está em uncategorized e para onde ir
 *   setupTrigger()        — idempotently install the time trigger (CONFIG.triggerMinutes)
 */
// O trigger roda DIARIAMENTE (24 h) em MODO FILA + EXPANSÃO DE BACKLOG: o
// conjunto não-processado é um backlog persistente (a query exclui
// GMO/Processed). Em 429 espera a janela de RPM e repete o pedido; cota
// esgotada mesmo paciente → pausa SEM marcar as threads (ficam na fila). Fila
// secou → alarga o período de busca em passos de backlogStepDays (até
// backlogMaxDays) e REPETE com debounce — o loop só termina quando TUDO foi
// processado ou em 429. No fim da fila, roda os cards de re-triagem
// (needs-review + uncategorized + reprocessProcessed) com o orçamento restante
// — ver runPipeline().
function processNewEmails() {
  return runPipeline({ queue429: true, expandBacklog: true });
}

function backfill(days) {
  return runPipeline({ days: days || 7 });
}

/**
 * runFullFlow(days) — O FLUXO COMPLETO (default 30 dias), SEMPRE NESTA ORDEM:
 *   1. sem categoria  → mail novo/não-processado (modo fila: 429-paciente,
 *                        pausa sem marcar; a query já exclui GMO/Processed;
 *                        fila secou → alarga o período de busca em passos de
 *                        backlogStepDays até backlogMaxDays e REPETE com
 *                        debounce, até tudo ser processado ou 429)
 *   2. needs-review   → re-triagem com o modelo atual (cache ignorado)
 *   3. uncategorized  → re-triagem do bucket GMO/uncategorized
 *   4. processed      → continuação do backlog reprocessProcessed
 * Os cards 2–4 rodam no FIM da fila, com o orçamento restante — mail novo tem
 * sempre prioridade. Budget-guarded de ponta a ponta: o que não couber continua
 * na próxima execução do trigger, ou rodando este comando de novo (cada passada
 * é incremental porque o processado já tem GMO/Processed).
 */
function runFullFlow(days) {
  return runPipeline({ days: days || 30, queue429: true, progressLog: true,
                       expandBacklog: true });
}

function bootstrapLabels() {
  const labels = Labeler.ensureLabels();
  const names = Object.keys(labels).map(function (k) { return labels[k].getName(); });
  names.push(CONFIG.processedLabel, CONFIG.needsReviewLabel);
  Utils.log('bootstrapLabels: ready → ' + names.join(', '));
  return names;
}

/**
 * needsReviewReport() — precision metric over the labeled mailbox. Counts
 * processed threads and how many carry GMO/needs-review (low-confidence or
 * fallback verdicts), overall and per category. Precision proxy:
 * (processed − flagged) / processed. Search-based; Gmail caps each query at
 * 500 results, far above personal-mailbox scale.
 */
function needsReviewReport() {
  const nrQuery = 'label:' + CONFIG.needsReviewLabel;
  const processed = GmailApp.search('label:' + CONFIG.processedLabel).length;
  const flagged = GmailApp.search(nrQuery).length;
  const rows = CATEGORIES.map(function (c) {
    const label = 'label:' + CONFIG.labelPrefix + '/' + c.id;
    const total = GmailApp.search(label).length;
    const hit = GmailApp.search(label + ' ' + nrQuery).length;
    return { category: c.id, total: total, flagged: hit,
             flagRatePct: total ? Math.round(1000 * hit / total) / 10 : 0 };
  });
  const precisionProxy = processed ? Math.round(1000 * (processed - flagged) / processed) / 10 : null;
  Utils.log('Needs-review report: ' + flagged + '/' + processed + ' flagged → precision proxy ' +
            (precisionProxy == null ? 'n/a' : precisionProxy + '%'));
  rows.forEach(function (r) {
    Utils.log('  ' + r.category + ': ' + r.flagged + '/' + r.total + ' flagged (' + r.flagRatePct + '%)');
  });
  return { processed: processed, flagged: flagged, precisionProxy: precisionProxy, rows: rows };
}

/** Escada oldest-first para as re-triagens: baldes de idade do mais antigo para
 *  o mais novo ('' = sem limite de data). Quem foi processado há mais tempo e
 *  continua em needs-review / uncategorized tem prioridade — eventualmente TODO
 *  o histórico passa pelo modelo atual. */
const OLDEST_FIRST_BUCKETS = ['older_than:2y', 'older_than:1y', 'older_than:6m',
                              'older_than:3m', 'older_than:1m', ''];

/** oldestFirstThreads(labelQuery, cap, seen) — coleta até `cap` threads NOVAS
 *  atravessando a escada de baldes oldest-first (uma busca por balde). `seen`
 *  (ids já varridos nesta execução) é pulado e marcado — evita re-scan quando
 *  o card REPETE a escada em ciclos. */
function oldestFirstThreads(labelQuery, cap, seen) {
  const out = [];
  for (let b = 0; b < OLDEST_FIRST_BUCKETS.length && out.length < cap; b++) {
    const q = labelQuery + (OLDEST_FIRST_BUCKETS[b] ? ' ' + OLDEST_FIRST_BUCKETS[b] : '');
    const page = GmailApp.search(q, 0, cap) || [];
    for (let i = 0; i < page.length && out.length < cap; i++) {
      const id = String(page[i].getId ? page[i].getId() : page[i].getPermalink());
      if (seen && seen[id]) continue;
      out.push(page[i]);
      if (seen) seen[id] = true;
    }
  }
  return out;
}

/**
 * reprocessNeedsReview(max) — re-triagem das threads com GMO/needs-review usando
 * a versão ATUAL do modelo (cache ignorado), OLDEST-FIRST (baldes older_than).
 * Veredito confiante troca as
 * labels de categoria, remove GMO/needs-review e garante GMO/Processed;
 * veredito ainda incerto mantém a tag para a próxima rodada. Limitado a `max`
 * threads por invocação (default CONFIG.needsReview.reprocessBatch).
 */
function reprocessNeedsReview(max, run) {
  const base = max || (CONFIG.needsReview && CONFIG.needsReview.reprocessBatch) || 20;
  const seen = run && run.seen;
  const room = run ? run.room : null;   // fn → quanto falta no limite diário
  const stats = { scanned: 0, resolved: 0, stillUncertain: 0 };
  // REPETE a escada oldest-first pulando o que já foi varrido nesta execução,
  // até esgotar os baldes (nada novo), estourar o teto diário ou pausar em 429
  // — nada de "20 e para".
  for (let pass = 0; pass < 50; pass++) {
    const budget = Math.min(base, room ? room() : Infinity) - stats.scanned;
    if (budget <= 0) break;
    const threads = oldestFirstThreads('label:' + CONFIG.needsReviewLabel, budget, seen);
    if (!threads.length) break;          // nenhum thread novo em nenhum balde
    threads.forEach(function (th) {
      try {
        const rec = GmailReader.extractRecord(th);
        if (!rec || !rec.email) { stats.stillUncertain++; return; }
        const verdict = Categorizer.classifyFresh(rec);
        if (Labeler.relabelNeedsReview(th, verdict)) stats.resolved++;
        else {
          Labeler.ensureProcessed(th);   // nunca deixar sem processed
          stats.stillUncertain++;
        }
      } catch (e) {
        stats.stillUncertain++;
        Utils.log('Needs-review re-triage skipped a thread: ' + e);
      }
      stats.scanned++;
    });
    if (EmbeddingClassifier.rateExhausted()) break;
  }
  Utils.log('Needs-review re-triage: ' + stats.resolved + ' resolved, ' +
            stats.stillUncertain + ' still uncertain (' + stats.scanned + ' scanned).');
  return stats;
}

/**
 * retriageUncategorized(max) — re-triagem do bucket GMO/uncategorized (threads
 * SEM a tag needs-review) com o modelo ATUAL (cache ignorado). Veredito
 * confiante (categoria real, fora da banda needs-review) troca
 * GMO/uncategorized pela categoria e mantém GMO/Processed; sem veredito
 * confiante, a thread fica onde está — uncategorized não é erro, é o estado
 * "sem categoria dedicada ainda". Limitado a `max` threads por invocação
 * (default CONFIG.uncategorized.reprocessBatch).
 */
function retriageUncategorized(max, run) {
  const base = max || (CONFIG.uncategorized && CONFIG.uncategorized.reprocessBatch) || 20;
  const seen = run && run.seen;
  const room = run ? run.room : null;
  const stats = { scanned: 0, resolved: 0, stillUncategorized: 0 };
  // REPETE a escada oldest-first (pulando o já varrido nesta execução) até
  // esgotar os baldes, estourar o teto diário ou pausar em 429.
  for (let pass = 0; pass < 50; pass++) {
    const budget = Math.min(base, room ? room() : Infinity) - stats.scanned;
    if (budget <= 0) break;
    const threads = oldestFirstThreads('label:' + CONFIG.labelPrefix + '/' + FALLBACK_CATEGORY.id +
                                       ' -label:' + CONFIG.needsReviewLabel, budget, seen);
    if (!threads.length) break;          // nenhum thread novo em nenhum balde
    threads.forEach(function (th) {
      try {
        const rec = GmailReader.extractRecord(th);
        if (!rec || !rec.email) { stats.stillUncategorized++; return; }
        const verdict = Categorizer.classifyFresh(rec);
        if (verdict && verdict.category !== FALLBACK_CATEGORY.id && !verdict.needsReview &&
            Labeler.relabelProcessed(th, verdict) === 'changed') {
          stats.resolved++;
        } else {
          stats.stillUncategorized++;
        }
      } catch (e) {
        stats.stillUncategorized++;
        Utils.log('Uncategorized re-triage skipped a thread: ' + e);
      }
      stats.scanned++;
    });
    if (EmbeddingClassifier.rateExhausted()) break;
  }
  Utils.log('Uncategorized re-triage: ' + stats.resolved + ' resolved, ' +
            stats.stillUncategorized + ' still uncategorized (' + stats.scanned + ' scanned).');
  return stats;
}

/**
 * reprocessProcessed(maxThreads) — batch de re-triagem dos JÁ PROCESSADOS com
 * a versão ATUAL do modelo (cache ignorado via classifyFresh). Com as melhorias
 * acumuladas (novas categorias servicos/governo/viagens/saude, keywords
 * LinkedIn, bandas needs-review afinadas), os threads processados pelo modelo
 * antigo são reavaliados em lotes incrementais e retomáveis:
 *  - veredito diferente → troca a label de categoria (mantém GMO/Processed);
 *  - a tag GMO/needs-review é sincronizada com o novo veredito (add/remove);
 *  - fallback (sem veredito) NUNCA rebaixa um thread já categorizado (skip);
 *  - cota de embeddings esgotada → pausa SEM avançar o cursor (rode de novo).
 * Cursor = offset de página no Gmail (State REPROCESS_OFFSET). Quando a página
 * vem vazia o batch termina, grava o fingerprint do modelo
 * (REPROCESS_FINGERPRINT) e zera o cursor. Limitado a `maxThreads` por
 * invocação (default 100) e ao budget de tempo do pipeline.
 */
function reprocessProcessed(maxThreads, budgetMsOverride) {
  const cap = Math.min(maxThreads || 100, 200);
  const started = Date.now();
  // Default: o orçamento inteiro do run menos uma margem de segurança. A passada
  // automática (fim da fila no runPipeline) passa o orçamento RESTANTE, para que
  // mail novo sempre tenha prioridade sobre os já processados.
  const budgetMs = Math.max(15000, budgetMsOverride ||
    Math.max(60000, (CONFIG.maxRuntimeMs || 4.5 * 60 * 1000) - 30000));
  // OLDEST-FIRST em baldes: a fila percorre a escada older_than (2y → 1y → 6m →
  // 3m → 1m → sem limite) — quem foi processado há mais tempo é reavaliado
  // primeiro, e eventualmente TODO o corpus passa pelo modelo atual. O cursor é
  // o par (balde, offset) — retomável entre execuções (State).
  const stats = { scanned: 0, changed: 0, kept: 0, skipped: 0,
                  done: false, offset: State.getReprocessOffset(),
                  bucket: State.getReprocessBucket() };
  const finish = function () {
    const fp = EmbeddingClassifier.refsFingerprint();
    State.setReprocessFingerprint(fp);
    State.setReprocessOffset(0);
    State.setReprocessBucket(0);
    stats.done = true;
    stats.offset = 0;
    stats.bucket = 0;
    Utils.log('reprocessProcessed: fila completa — fingerprint gravado (' + fp + '), cursor zerado.');
  };
  while (stats.scanned < cap) {
    if (Date.now() - started > budgetMs) {
      Utils.log('reprocessProcessed: budget de tempo atingido — cursor mantido em balde ' + stats.bucket + ', offset ' + stats.offset + '.');
      return stats;
    }
    if (EmbeddingClassifier.rateExhausted()) {
      stats.paused429 = true;
      Utils.log('reprocessProcessed: cota de embeddings esgotada — cursor mantido em balde ' + stats.bucket + ', offset ' + stats.offset + '; rode de novo mais tarde.');
      return stats;
    }
    if (stats.bucket >= OLDEST_FIRST_BUCKETS.length) { finish(); break; }
    // Gmail: offsets profundos (> ~500 resultados) não são confiáveis — ao se
    // aproximar do limite, salta para o balde mais novo.
    if (stats.offset >= 450) {
      stats.bucket++;
      stats.offset = 0;
      if (stats.bucket >= OLDEST_FIRST_BUCKETS.length) { finish(); break; }
      State.setReprocessBucket(stats.bucket);
      State.setReprocessOffset(0);
      continue;
    }
    const bucketClause = OLDEST_FIRST_BUCKETS[stats.bucket];
    const query = '-in:spam -in:trash label:' + CONFIG.processedLabel +
                  (bucketClause ? ' ' + bucketClause : '');
    const page = GmailApp.search(query, stats.offset, Math.min(25, cap - stats.scanned)) || [];
    if (!page.length) {          // balde esgotado → próximo (mais novo)
      stats.bucket++;
      stats.offset = 0;
      if (stats.bucket >= OLDEST_FIRST_BUCKETS.length) { finish(); break; }
      State.setReprocessBucket(stats.bucket);
      State.setReprocessOffset(0);
      continue;
    }
    page.forEach(function (th) {
      try {
        const rec = GmailReader.extractRecord(th);
        if (!rec || !rec.email) { stats.skipped++; return; }
        const verdict = Categorizer.classifyFresh(rec);
        if (verdict.source === 'fallback') { stats.skipped++; return; }   // nunca rebaixar
        const res = Labeler.relabelProcessed(th, verdict);
        if (res === 'changed') stats.changed++; else stats.kept++;
      } catch (e) {
        stats.skipped++;
        Utils.log('reprocessProcessed skipped a thread: ' + e);
      }
      stats.scanned++;
    });
    stats.offset += page.length;
    State.setReprocessOffset(stats.offset);
    State.setReprocessBucket(stats.bucket);
  }
  Utils.log('reprocessProcessed: ' + stats.scanned + ' reavaliados — ' + stats.changed +
            ' mudaram, ' + stats.kept + ' mantidos, ' + stats.skipped +
            ' ignorados (balde ' + stats.bucket + ', offset ' + stats.offset +
            (stats.done ? ', fila completa' : '') + ').');
  return stats;
}

/** reprocessProcessedStatus() — progresso do batch (balde/offset) e se o modelo mudou desde a última passada completa. */
function reprocessProcessedStatus() {
  const current = EmbeddingClassifier.refsFingerprint();
  const stored = State.getReprocessFingerprint();
  const pending = !stored || stored !== current;
  Utils.log('reprocessProcessed status: cursor balde ' + State.getReprocessBucket() +
            ', offset ' + State.getReprocessOffset() +
            ' · modelo atual ' + current + ' · última passada completa ' + (stored || '(nenhuma)') +
            (pending ? ' → REPROCESSAMENTO PENDENTE' : ' → em dia'));
  return { offset: State.getReprocessOffset(), bucket: State.getReprocessBucket(),
           current: current, stored: stored, pending: pending };
}

/**
 * analyzeUncategorized(maxEmbeds) — diagnóstico do bucket uncategorized (o que
 * está gerando tanto volume?). Varre label:GMO/uncategorized (mais recente
 * primeiro, até 200 threads), agrupa por domínio do remetente e, para os
 * domínios mais frequentes, consulta o tier de embedding (limitado a
 * `maxEmbeds` chamadas) para sugerir a categoria mais próxima do assunto
 * exemplo. Use a saída para promover domínios a regras (categories/<id>.md →
 * Config.gs) e enriquecer REFERENCES — é o caminho documentado para reduzir o
 * bucket. Read-only; mail pessoal genuíno DEVE continuar em uncategorized.
 */
function analyzeUncategorized(maxEmbeds) {
  maxEmbeds = (maxEmbeds == null) ? 40 : maxEmbeds;
  const threads = GmailApp.search('label:' + CONFIG.labelPrefix + '/uncategorized', 0, 200) || [];
  const byDomain = {};
  let scanned = 0;
  let flagged = 0;
  threads.forEach(function (th) {
    const rec = GmailReader.extractRecord(th);
    if (!rec || !rec.email) return;
    scanned++;
    const d = rec.domain || '(sem domínio)';
    if (!byDomain[d]) {
      byDomain[d] = { domain: d, count: 0, subject: rec.subject, sender: rec.email, flagged: 0 };
    }
    byDomain[d].count++;
    let hasNr = false;
    th.getLabels().forEach(function (l) {
      if (l.getName() === CONFIG.needsReviewLabel) hasNr = true;
    });
    if (hasNr) { byDomain[d].flagged++; flagged++; }
  });
  const domains = Object.keys(byDomain).map(function (k) { return byDomain[k]; })
    .sort(function (a, b) { return b.count - a.count; });

  // Sugestão via embedding para os domínios mais frequentes (assunto exemplo).
  let embedsUsed = 0;
  domains.forEach(function (row) {
    if (embedsUsed >= maxEmbeds || !State.getApiKey()) {
      row.suggested = null; row.sim = null; return;
    }
    embedsUsed++;
    try {
      const sims = EmbeddingClassifier.similarities({
        email: 'analise@' + row.domain, name: '', domain: row.domain,
        subject: row.subject, snippet: '', bodyScan: '',
      });
      if (!sims) { row.suggested = null; row.sim = null; return; }
      const best = Object.keys(sims).map(function (k) { return { id: k, sim: sims[k] }; })
        .sort(function (a, b) { return b.sim - a.sim; })[0];
      row.suggested = best.id; row.sim = best.sim;
    } catch (e) { row.suggested = null; row.sim = null; }
  });

  Utils.log('Análise uncategorized: ' + scanned + ' threads, ' + flagged +
            ' com needs-review (fallback).');
  domains.forEach(function (r) {
    Utils.log('  ' + r.count + '×  ' + r.domain +
              (r.suggested ? '  → sugestão: ' + r.suggested + ' (sim ' + r.sim + ')' : '') +
              '  | "' + r.subject + '"');
  });
  if (!domains.length) Utils.log('Nenhuma thread em uncategorized 🎉');
  return { total: threads.length, scanned: scanned, flagged: flagged, domains: domains };
}

function runPipeline(opts) {
  opts = opts || {};
  const start = Date.now();
  const cursorMs = State.getLastRun();
  let query = GmailReader.buildQuery(cursorMs, opts);
  let fullScan = false;   // sem limite de data — o mailbox inteiro é a fila
  let expanded = 0;
  const pacing = CONFIG.pacing || {};
  Utils.log('Run started. Query: ' + query);

  // Garante a janela de quota: se o cache de prototypes está velho (refs/categorias
  // mudaram), o rebuild acontece ANTES dos embeds das amostras novas competirem
  // pelo RPM do free tier. Cache válido → no-op barato.
  try { EmbeddingClassifier.ensurePrototypes(); } catch (e) { /* tier desabilitado */ }
  if (opts.queue429) EmbeddingClassifier.setRatePatience(true);

  const stats = { labeled: 0, skipped: 0, flagged: 0, bySource: {}, batches: 0,
                  budgetExit: false, dailyCapped: false };
  const seen = {};   // thread ids classified this run — enables re-pagination
  let stall = 0;     // consecutive pages yielding nothing new (failed threads)
  let hasMore = true;

  try {
    // Re-pagination: always fetch page 0. Each labeled batch leaves the search
    // result set, so page 0 always holds the NEXT newest unprocessed threads —
    // offset-based paging would skip threads as the result set shifts.
    while (hasMore) {
      if (State.getDailyUsage() >= CONFIG.dailyEmailLimit) {
        stats.dailyCapped = true;
        Utils.log('Limite diário de ' + CONFIG.dailyEmailLimit + ' e-mails atingido — ' +
                  'o restante da fila continua amanhã (fila persistente; o que já ' +
                  'foi marcado hoje fica processado).');
        break;
      }
      if (Date.now() - start > CONFIG.maxRuntimeMs) {
        stats.budgetExit = true;
        Utils.log('Time budget reached — stopping; the next trigger continues ' +
                  '(the window is re-scanned and labeled threads are skipped).');
        break;
      }
      if (stats.batches >= (CONFIG.maxBatchesPerRun || Infinity)) {
        // Keep the cursor: older unlabeled threads in the window are picked up
        // next run — progress persists because labeled batches already left the
        // result set (re-pagination).
        stats.budgetExit = true;
        Utils.log('Batch ceiling reached — stopping; the next trigger continues.');
        break;
      }
      const batch = GmailReader.fetchBatch(query, 0, seen);
      if (!batch.fetched) {
        // Fila desta janela secou. SEM limite de data: com expansão ativa, troca
        // para a varredura COMPLETA (sem cláusula after:) — eventualmente TODO o
        // histórico é avaliado. Termina quando a varredura completa também vem
        // vazia (tudo processado) ou nos limites diários/429/budget.
        if (opts.expandBacklog && !fullScan) {
          fullScan = true;
          query = GmailReader.buildQuery(cursorMs, Object.assign({}, opts, { fullScan: true }));
          expanded++;
          Utils.log('Backlog expansion: primary window drained — switching to the ' +
                    'full-history scan (no date limit).');
          continue;
        }
        break; // histórico inteiro processado (ou expansão desativada)
      }
      // Com expansão ativa, um lote NUNCA encerra a execução: repete com
      // debounce — próxima busca vazia entra na varredura completa.
      hasMore = batch.hasMore || !!opts.expandBacklog;
      stats.batches++;

      const fresh = batch.records.filter(function (r) { return r && !seen[r.threadId]; });
      if (!fresh.length) { // page full of already-seen/failed threads
        if (++stall >= 2) {
          Utils.log('No new threads after re-labeling — stopping; ' +
                    'failed threads are retried by the next run.');
          break;
        }
        continue;
      }
      stall = 0;
      fresh.forEach(function (r) { seen[r.threadId] = true; });

      // Phase 2 — classify (newest first)
      const verdicts = [];
      let paused429 = false;
      fresh.forEach(function (rec) {
        if (!rec.email) { stats.skipped++; return; }
        if (paused429) return; // fila pausada: as restantes ficam para o próximo ciclo
        const verdict = Categorizer.classify(rec);
        if (opts.queue429 && verdict.source === 'fallback' &&
            EmbeddingClassifier.rateExhausted()) {
          // cota de embeddings esgotada (paciente e mesmo assim 429): NÃO marca
          // as threads — ficam na fila (sem GMO/Processed) para a próxima execução.
          paused429 = true;
          return;
        }
        verdicts.push({ rec: rec, category: verdict.category, source: verdict.source,
                        needsReview: !!verdict.needsReview });
        stats.bySource[verdict.source] = (stats.bySource[verdict.source] || 0) + 1;
        if (verdict.needsReview) stats.flagged++;
      });
      if (pacing.classifyDebounceMs > 0 && verdicts.length) Utils.sleep(pacing.classifyDebounceMs);

      // Phase 3 — label in chunks (debounced inside Labeler)
      const batchLabeled = Labeler.applyToBatch(verdicts, pacing);
      stats.labeled += batchLabeled;
      State.addDailyUsage(batchLabeled);   // conta no teto diário de 200 e-mails
      if (opts.progressLog) {
        Utils.log('Fila: +' + batchLabeled + ' classificados neste lote (acumulado ' +
                  stats.labeled + ').');
      }
      if (paused429) {
        stats.paused429 = true;
        Utils.log('Fila pausada: cota de embeddings esgotada — ' +
                  (fresh.length - verdicts.length) + ' thread(s) ficaram na fila ' +
                  '(sem GMO/Processed) para a próxima execução.');
        hasMore = false;
      }

      // Phase 1 cooldown before the next search+extract burst
      if (pacing.fetchDebounceMs > 0) Utils.sleep(pacing.fetchDebounceMs);
    }
    stats.windowDays = fullScan ? 1 : 0;   // 1 = varredura completa sem limite de data
    stats.expanded = expanded;
    if (!stats.budgetExit && !stats.dailyCapped) State.setLastRun(Date.now());

    // Baseline do fingerprint na 1ª execução (antes de qualquer gate).
    if (!State.getReprocessFingerprint()) {
      State.setReprocessFingerprint(EmbeddingClassifier.refsFingerprint());
    }

    // — Cards de re-triagem: o FIM DA FILA, SEMPRE NESTA ORDEM:
    //   1. needs-review → 2. uncategorized → 3. processed —
    // só com a fila de mail novo drenada (sem budget exit / pausa de cota) e
    // orçamento restante — mail novo sempre tem prioridade sobre o backlog.
    // (opts.reprocess === false desliga — usado nos testes de escala.)
    const queueDrained = !stats.budgetExit && !stats.paused429;
    if (opts.reprocess !== false && queueDrained && Date.now() - start < CONFIG.maxRuntimeMs) {
      runReprocessCards(stats, start);
    } else if (opts.reprocess !== false &&
               (State.getReprocessFingerprint() !== EmbeddingClassifier.refsFingerprint() ||
                State.getReprocessOffset() > 0)) {
      Utils.log('Re-triage cards deferred this run (budget/queue gate) — they stay ' +
                'at the END of the queue; the next trigger picks them up.');
    }
  } catch (e) {
    Utils.log('Run aborted: ' + e);
  } finally {
    if (opts.queue429) EmbeddingClassifier.setRatePatience(false);
    State.saveSenderCache();
  }

  Utils.log('Run finished: ' + stats.labeled + ' labeled (' + stats.flagged +
            ' flagged for review), ' + stats.skipped +
            ' skipped, ' + stats.batches + ' batch(es), bySource=' + JSON.stringify(stats.bySource) +
            (stats.expanded ? ', full-history scan' : '') +
            (stats.dailyCapped ? ', daily cap (' + CONFIG.dailyEmailLimit + ') hit' : '') +
            (stats.reprocess ? ', reprocess=' + JSON.stringify(stats.reprocess) : '') +
            (stats.budgetExit ? ' (budget exit)' : ''));
  return stats;
}

/**
 * runReprocessCards(stats, start) — os CARDS DO FIM DA FILA, sempre nesta ordem:
 *   1. needs-review → 2. uncategorized → 3. processed
 * Chamada apenas com a fila de mail novo drenada e orçamento restante; o
 * progresso vai para stats (reScanned/reResolved, uncScanned/uncResolved,
 * reprocess) e para os logs de execução.
 */
function runReprocessCards(stats, start) {
  const limit = CONFIG.dailyEmailLimit > 0 ? CONFIG.dailyEmailLimit : Infinity;
  const remaining = function () { return limit - State.getDailyUsage(); };
  const run = { seen: {} };   // threads já varridas nesta execução — sem re-scan
  const cap1 = (CONFIG.needsReview && CONFIG.needsReview.reprocessBatch) || 20;
  const cap2 = (CONFIG.uncategorized && CONFIG.uncategorized.reprocessBatch) || 20;
  if (!stats.reprocess) {
    stats.reprocess = { scanned: 0, changed: 0, kept: 0, skipped: 0, done: false, paused429: false };
  }
  // REPETE o ciclo de cards (1 → 2 → 3) com debounce — 20 + 20 + o que resta
  // do teto diário por ciclo — até: teto diário estourar, 429 pausar, ou um
  // ciclo inteiro não varrer nada novo (re-triagens exauridas por hoje).
  // Nada de "20 e para": cada ciclo avança para os threads ainda não vistos.
  for (let cycle = 0; cycle < 20; cycle++) {
    if (remaining() <= 0) {
      Utils.log('Limite diário de ' + CONFIG.dailyEmailLimit + ' e-mails atingido — ' +
                'cards e fila ficam para amanhã.');
      break;
    }
    const usageBefore = State.getDailyUsage();
    const scannedBefore = (stats.reScanned || 0) + (stats.uncScanned || 0) +
                          (stats.reprocess ? stats.reprocess.scanned : 0);

    // Card 1 — needs-review (oldest-first, pulando o já varrido hoje)
    const r1 = reprocessNeedsReview(Math.min(cap1, remaining()), run);
    stats.reScanned = (stats.reScanned || 0) + r1.scanned;
    stats.reResolved = (stats.reResolved || 0) + r1.resolved;
    State.addDailyUsage(r1.scanned);

    // Card 2 — uncategorized (oldest-first, pulando o já varrido hoje)
    const r2 = retriageUncategorized(Math.min(cap2, remaining()), run);
    stats.uncScanned = (stats.uncScanned || 0) + r2.scanned;
    stats.uncResolved = (stats.uncResolved || 0) + r2.resolved;
    State.addDailyUsage(r2.scanned);

    // Card 3 — processed (baldes oldest-first, cursor próprio balde+offset)
    const pending = State.getReprocessFingerprint() !== EmbeddingClassifier.refsFingerprint() ||
                    State.getReprocessOffset() > 0 || State.getReprocessBucket() > 0;
    if (pending && remaining() > 0 && !EmbeddingClassifier.rateExhausted()) {
      const remainingMs = CONFIG.maxRuntimeMs - (Date.now() - start);
      if (remainingMs > 15000) {
        const step = reprocessProcessed(Math.min(200, remaining()), remainingMs);
        const rp = stats.reprocess;
        rp.scanned += step.scanned;
        rp.changed += step.changed;
        rp.kept += step.kept;
        rp.skipped += step.skipped;
        rp.done = rp.done || step.done;
        rp.paused429 = rp.paused429 || !!step.paused429;
        State.addDailyUsage(step.scanned);
      }
    }

    const scannedThisCycle = (stats.reScanned + stats.uncScanned +
                              (stats.reprocess ? stats.reprocess.scanned : 0)) - scannedBefore;
    if (scannedThisCycle === 0) {
      Utils.log('Re-triagens sem nada novo neste ciclo — exauridas por hoje.');
      break;
    }
    if (EmbeddingClassifier.rateExhausted()) break;
  }
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processNewEmails') ScriptApp.deleteTrigger(t);
  });
  const minutes = CONFIG.triggerMinutes || 60;
  let eff;
  if (minutes >= 1440) {
    // ≥ 24 h → daily (or multi-day) trigger at a fixed hour — everyHours caps
    // at 23 h, so 1440 (the 24-h default) lands here, not on a drifting 23 h.
    const days = Math.max(1, Math.round(minutes / 1440));
    const hour = CONFIG.triggerHour || 6;
    ScriptApp.newTrigger('processNewEmails').timeBased()
      .everyDays(days).atHour(hour).create();
    eff = days + ' d @ ' + hour + ' h';
  } else if (minutes >= 60) {
    // everyHours accepts 1..23 — clamp so extreme values can't throw
    const hours = Math.max(1, Math.min(23, Math.round(minutes / 60)));
    ScriptApp.newTrigger('processNewEmails').timeBased().everyHours(hours).create();
    eff = hours + ' h';
  } else {
    // Apps Script ONLY accepts 1, 5, 10, 15, 30 for everyMinutes(). The old
    // round(x/5)*5 snapping produced 20/25 for values like triggerMinutes=20 and
    // create() then THREW — leaving NO trigger installed (scheduling silently
    // broken). Snap to the nearest valid value instead.
    const valid = [1, 5, 10, 15, 30];
    const snap = valid.reduce(function (best, v) {
      return Math.abs(v - minutes) < Math.abs(best - minutes) ? v : best;
    }, 30);
    ScriptApp.newTrigger('processNewEmails').timeBased().everyMinutes(snap).create();
    eff = snap + ' min';
  }
  Utils.log('Trigger installed for processNewEmails() every ' + eff +
            ' (requested ' + minutes + ' min).');
}
