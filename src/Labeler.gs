/**
 * Labeler.gs — marker tier (ARCHITECTURE.md §4.7).
 * The Gmail labels ARE the storage: every processed thread gets
 * GMO/<category> + GMO/Processed. GMO/needs-review is added when the verdict
 * was flagged low-confidence (needsReview, CONFIG.needsReview bands) or the
 * source is 'fallback' (AI unavailable) — the tag doubles as the system's
 * ongoing precision metric (needsReviewReport()). addLabel is idempotent, so
 * failed batches are safely retried by the next run.
 */
const Labeler = (function () {
  let labels = null;          // { categoryId: GmailLabel }
  let processedLabel = null;
  let needsReviewLabel = null;

  function getOrCreate(name) {
    return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
  }

  /** Idempotently create GMO/<categoryId> for every category + bookkeeping labels. */
  function ensureLabels() {
    if (labels) return labels;
    labels = {};
    CATEGORIES.concat([FALLBACK_CATEGORY]).forEach(function (c) {
      labels[c.id] = getOrCreate(CONFIG.labelPrefix + '/' + c.id);
    });
    processedLabel = getOrCreate(CONFIG.processedLabel);
    needsReviewLabel = getOrCreate(CONFIG.needsReviewLabel);
    return labels;
  }

  /**
   * applyToBatch(verdicts, pacing) → count labeled.
   * verdicts: [{ rec, category, source }] — rec._thread is the Gmail entity.
   * pacing (optional, from CONFIG.pacing): labelChunkSize splits the batch into
   * chunks with a Utilities.sleep cooldown between them — smooths the write
   * burst (3 addLabel calls per thread) under Gmail rate limits.
   */
  function applyToBatch(verdicts, pacing) {
    ensureLabels();
    pacing = pacing || {};
    const list = verdicts || [];
    const chunkSize = pacing.labelChunkSize || list.length || 1;
    const debounceMs = pacing.labelChunkDebounceMs || 0;
    let n = 0;
    for (let i = 0; i < list.length; i += chunkSize) {
      list.slice(i, i + chunkSize).forEach(function (v) {
        try {
          const th = v.rec && v.rec._thread;
          if (!th) return;
          th.addLabel(labels[v.category]);
          if (v.needsReview || v.source === 'fallback') th.addLabel(needsReviewLabel);
          th.addLabel(processedLabel);
          n++;
        } catch (e) {
          Utils.log('Labeling failed for ' + (v.rec && v.rec.email) + ': ' + e +
                    ' — thread stays unread; it will be retried next run.');
        }
      });
      if (i + chunkSize < list.length && debounceMs > 0) Utils.sleep(debounceMs);
    }
    return n;
  }

  function labelName(categoryId) { return CONFIG.labelPrefix + '/' + categoryId; }

  /**
   * relabelNeedsReview(thread, verdict) — re-triagem de needs-review (o fluxo
   * "conforme melhoramos o modelo"): um veredito CONFIANTE da versão atual
   * troca as labels de categoria, remove GMO/needs-review e garante
   * GMO/Processed (nenhum e-mail fica sem processed). Veredito ainda incerto
   * não toca na thread — a tag fica para a próxima melhoria do modelo.
   * Retorna true quando a thread foi resolvida.
   */
  function relabelNeedsReview(thread, verdict) {
    ensureLabels();
    if (!verdict || verdict.needsReview || !labels[verdict.category]) return false;
    const keep = labelName(verdict.category);
    thread.getLabels().forEach(function (l) {
      const n = l.getName();
      if (n.indexOf(CONFIG.labelPrefix + '/') === 0 &&
          n !== keep && n !== CONFIG.processedLabel && n !== CONFIG.needsReviewLabel) {
        thread.removeLabel(l);
      }
    });
    thread.addLabel(labels[verdict.category]);
    thread.addLabel(processedLabel);            // nunca deixar sem processed
    thread.removeLabel(needsReviewLabel);
    return true;
  }

  /** Garantia: nenhuma thread fica sem a marker GMO/Processed (rede de segurança). */
  function ensureProcessed(thread) {
    ensureLabels();
    const has = thread.getLabels().some(function (l) {
      return l.getName() === CONFIG.processedLabel;
    });
    if (!has) thread.addLabel(processedLabel);
  }

  /**
   * relabelProcessed(thread, verdict) — re-triagem do batch de JÁ PROCESSADOS
   * (reprocessProcessed): troca a label de categoria para o veredito atual do
   * modelo, garante GMO/Processed e sincroniza GMO/needs-review com o novo
   * veredito (flagged → adiciona a tag; confiante → remove).
   * Retorna 'changed' quando a categoria mudou, 'kept' quando permaneceu a
   * mesma, e null se o veredito é inválido (sem categoria mapeável).
   */
  function relabelProcessed(thread, verdict) {
    ensureLabels();
    if (!verdict || !verdict.category || !labels[verdict.category]) return null;
    const keep = labelName(verdict.category);
    let changed = false;
    thread.getLabels().forEach(function (l) {
      const n = l.getName();
      if (n.indexOf(CONFIG.labelPrefix + '/') === 0 &&
          n !== keep && n !== CONFIG.processedLabel && n !== CONFIG.needsReviewLabel) {
        thread.removeLabel(l);
        changed = true;
      }
    });
    thread.addLabel(labels[verdict.category]);
    thread.addLabel(processedLabel);            // nunca deixar sem processed
    if (verdict.needsReview) thread.addLabel(needsReviewLabel);
    else thread.removeLabel(needsReviewLabel);
    return changed ? 'changed' : 'kept';
  }

  return {
    ensureLabels: ensureLabels,
    applyToBatch: applyToBatch,
    relabelNeedsReview: relabelNeedsReview,
    relabelProcessed: relabelProcessed,
    ensureProcessed: ensureProcessed,
    labelName: labelName,
  };
})();
