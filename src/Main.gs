/**
 * Main.gs — orchestrator (ARCHITECTURE.md §4.1).
 * Entry points:
 *   processNewEmails()    — the hourly-triggered run
 *   backfill(days)        — one-off manual run (default 7 days), includes read mail
 *   bootstrapLabels()     — idempotently create all GMO/… labels in Gmail
 *   needsReviewReport()   — precision metric: flagged vs processed, overall + per category
 *   reprocessNeedsReview(max) — re-triagem de needs-review com o modelo atual
 *   reprocessProcessed(maxThreads) — batch de re-triagem dos JÁ PROCESSADOS
 *       (retomável por cursor; grava fingerprint do modelo ao completar)
 *   reprocessProcessedStatus() — progresso do batch + pendência de modelo
 *   analyzeUncategorized(maxEmbeds) — diagnóstico: quem está em uncategorized e para onde ir
 *   setupTrigger()        — idempotently install the time trigger (CONFIG.triggerMinutes)
 */
function processNewEmails() { return runPipeline({}); }

function backfill(days) {
  return runPipeline({ days: days || 7 });
}

/**
 * backfillFila(days) — backfill em MODO FILA (default 30 dias): classificar a
 * janela em lotes e, ao atingir 429, ESPERAR a janela de RPM e repetir o lote
 * (até `CONFIG.embedding.queue429MaxWaits` esperas por request). Se a cota se
 * esgotar mesmo paciente, pausa SEM marcar as threads restantes — elas ficam
 * na fila (sem GMO/Processed) e a classificação continua na próxima execução
 * do trigger, ou rodando este comando de novo (cada passada é incremental,
 * porque o que foi classificado já tem GMO/Processed).
 */
function backfillFila(days) {
  return runPipeline({ days: days || 30, queue429: true, progressLog: true });
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

/**
 * retriageNeedsReview(max) — re-triagem das threads com GMO/needs-review usando
 * a versão ATUAL do modelo (cache ignorado). Veredito confiante troca as
 * labels de categoria, remove GMO/needs-review e garante GMO/Processed;
 * veredito ainda incerto mantém a tag para a próxima rodada. Limitado a `max`
 * threads por invocação (default CONFIG.needsReview.reprocessBatch).
 */
function retriageNeedsReview(max) {
  const cap = max || (CONFIG.needsReview && CONFIG.needsReview.reprocessBatch) || 20;
  const threads = GmailApp.search('label:' + CONFIG.needsReviewLabel, 0, cap) || [];
  const stats = { scanned: threads.length, resolved: 0, stillUncertain: 0 };
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
  });
  Utils.log('Needs-review re-triage: ' + stats.resolved + ' resolved, ' +
            stats.stillUncertain + ' still uncertain (' + stats.scanned + ' scanned).');
  return stats;
}

/** Editor entry point: reprocessa needs-review com o modelo atual (após melhorias). */
function reprocessNeedsReview(max) { return retriageNeedsReview(max); }

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
function reprocessProcessed(maxThreads) {
  const cap = Math.min(maxThreads || 100, 200);
  const started = Date.now();
  const budgetMs = Math.max(60000, (CONFIG.maxRuntimeMs || 4.5 * 60 * 1000) - 30000);
  const query = '-in:spam -in:trash label:' + CONFIG.processedLabel;
  const stats = { scanned: 0, changed: 0, kept: 0, skipped: 0,
                  done: false, offset: State.getReprocessOffset() };
  while (stats.scanned < cap) {
    if (Date.now() - started > budgetMs) {
      Utils.log('reprocessProcessed: budget de tempo atingido — cursor mantido em ' + stats.offset + '.');
      return stats;
    }
    if (EmbeddingClassifier.rateExhausted()) {
      Utils.log('reprocessProcessed: cota de embeddings esgotada — cursor mantido em ' + stats.offset + '; rode de novo mais tarde.');
      return stats;
    }
    const page = GmailApp.search(query, stats.offset, Math.min(25, cap - stats.scanned)) || [];
    if (!page.length) {
      const fp = EmbeddingClassifier.refsFingerprint();
      State.setReprocessFingerprint(fp);
      State.setReprocessOffset(0);
      stats.done = true;
      Utils.log('reprocessProcessed: fila completa — fingerprint gravado (' + fp + '), cursor zerado.');
      break;
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
  }
  Utils.log('reprocessProcessed: ' + stats.scanned + ' reavaliados — ' + stats.changed +
            ' mudaram, ' + stats.kept + ' mantidos, ' + stats.skipped +
            ' ignorados (cursor ' + stats.offset + (stats.done ? ', fila completa' : '') + ').');
  return stats;
}

/** reprocessProcessedStatus() — progresso do batch e se o modelo mudou desde a última passada completa. */
function reprocessProcessedStatus() {
  const current = EmbeddingClassifier.refsFingerprint();
  const stored = State.getReprocessFingerprint();
  const pending = !stored || stored !== current;
  Utils.log('reprocessProcessed status: cursor offset ' + State.getReprocessOffset() +
            ' · modelo atual ' + current + ' · última passada completa ' + (stored || '(nenhuma)') +
            (pending ? ' → REPROCESSAMENTO PENDENTE (rode reprocessProcessed())' : ' → em dia'));
  return { offset: State.getReprocessOffset(), current: current, stored: stored, pending: pending };
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
  const query = GmailReader.buildQuery(cursorMs, opts);
  const pacing = CONFIG.pacing || {};
  Utils.log('Run started. Query: ' + query);

  // Garante a janela de quota: se o cache de prototypes está velho (refs/categorias
  // mudaram), o rebuild acontece ANTES dos embeds das amostras novas competirem
  // pelo RPM do free tier. Cache válido → no-op barato.
  try { EmbeddingClassifier.ensurePrototypes(); } catch (e) { /* tier desabilitado */ }
  if (opts.queue429) EmbeddingClassifier.setRatePatience(true);

  const stats = { labeled: 0, skipped: 0, flagged: 0, bySource: {}, batches: 0, budgetExit: false };
  const seen = {};   // thread ids classified this run — enables re-pagination
  let stall = 0;     // consecutive pages yielding nothing new (failed threads)
  let hasMore = true;

  try {
    // Re-pagination: always fetch page 0. Each labeled batch leaves the search
    // result set, so page 0 always holds the NEXT newest unprocessed threads —
    // offset-based paging would skip threads as the result set shifts.
    while (hasMore) {
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
      if (!batch.fetched) break; // query exhausted
      hasMore = batch.hasMore;
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
    if (!stats.budgetExit) State.setLastRun(Date.now());

    // Re-triagem de needs-review: com o orçamento restante, a versão mais nova
    // do algoritmo tenta resolver o que execuções anteriores deixaram incerto.
    // (opts.reprocess === false desliga — usado nos testes de escala.)
    if (opts.reprocess !== false && Date.now() - start < CONFIG.maxRuntimeMs) {
      try {
        const rt = retriageNeedsReview(CONFIG.needsReview && CONFIG.needsReview.reprocessBatch);
        stats.reScanned = rt.scanned;
        stats.reResolved = rt.resolved;
        if (rt.scanned) Utils.log('Needs-review re-triage: ' + rt.resolved + '/' +
                                  rt.scanned + ' resolved.');
      } catch (e) {
        Utils.log('Needs-review re-triage failed: ' + e);
      }
    }

    // Aviso de modelo desatualizado: se as melhorias (refs/regras) mudaram desde
    // a última passada COMPLETA do reprocessProcessed, os já processados ainda
    // não foram reavaliados pela versão atual — sinaliza 1× por execução.
    const rpFp = EmbeddingClassifier.refsFingerprint();
    const rpStored = State.getReprocessFingerprint();
    if (!rpStored) State.setReprocessFingerprint(rpFp);   // 1ª execução: baseline
    else if (rpStored !== rpFp) Utils.log('Modelo mudou desde a última passada de ' +
      'reprocessProcessed — rode reprocessProcessed() para re-triar os já processados.');
  } catch (e) {
    Utils.log('Run aborted: ' + e);
  } finally {
    if (opts.queue429) EmbeddingClassifier.setRatePatience(false);
    State.saveSenderCache();
  }

  Utils.log('Run finished: ' + stats.labeled + ' labeled (' + stats.flagged +
            ' flagged for review), ' + stats.skipped +
            ' skipped, ' + stats.batches + ' batch(es), bySource=' + JSON.stringify(stats.bySource) +
            (stats.budgetExit ? ' (budget exit)' : ''));
  return stats;
}

function setupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processNewEmails') ScriptApp.deleteTrigger(t);
  });
  const minutes = CONFIG.triggerMinutes || 60;
  if (minutes >= 60) {
    ScriptApp.newTrigger('processNewEmails').timeBased()
      .everyHours(Math.max(1, Math.round(minutes / 60))).create();
  } else {
    // Apps Script accepts 1, 5, 10, 15, 30 for everyMinutes()
    const snap = Math.max(1, Math.min(30, Math.round(minutes / 5) * 5));
    ScriptApp.newTrigger('processNewEmails').timeBased().everyMinutes(snap).create();
  }
  Utils.log('Trigger installed for processNewEmails() every ' + minutes + ' min.');
}
