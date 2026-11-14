/**
 * GmailReader.gs — ingestion boundary (ARCHITECTURE.md §4.3).
 * Everything Gmail-read-specific stays inside this module; the rest of the system
 * only ever sees plain record objects. Gmail Thread entities are kept in the
 * private `_thread` field and consumed by Labeler.applyToBatch() (the write
 * boundary) for labeling.
 */
const GmailReader = (function () {

  /**
   * buildQuery(cursorMs, opts) — incremental Gmail search.
   * The `GMO/Processed` label alone is the idempotency marker: threads are
   * processed regardless of read status, so mail the user reads before the
   * trigger fires is still categorized. opts.days: lookback window in days
   * (backfill); default cursor logic.
   */
  function buildQuery(cursorMs, opts) {
    opts = opts || {};
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    // fullScan → SEM cláusula after:: a fila é o mailbox INTEIRO (sem limite de
    // data) — eventualmente todo e-mail é avaliado, do mais novo ao mais antigo.
    let dateClause = '';
    if (!opts.fullScan) {
      let base;
      const horizonMs = CONFIG.searchHorizonDays * dayMs;
      if (opts.days) {
        base = now - opts.days * dayMs;
      } else if (cursorMs > 0) {
        base = Math.max(cursorMs - dayMs, now - horizonMs); // 1-day overlap
      } else {
        base = now - horizonMs;
      }
      dateClause = ' after:' + Utils.formatDate(new Date(base), 'yyyy/MM/dd');
    }
    return '-in:spam -in:trash -label:' + CONFIG.processedLabel + dateClause;
  }

  function countAddresses(s) {
    return String(s || '').split(',').filter(function (x) { return x.trim(); }).length;
  }

  /**
   * Extract the newest message of a thread into a plain record (or null).
   * Used by fetchBatch() and by Trainer.buildTreeFromLabels().
   */
  function extractRecord(th) {
    try {
      const msgs = th.getMessages();
      if (!msgs.length) return null;
      const m = msgs[msgs.length - 1]; // newest message of the thread
      const parsed = Utils.parseFromHeader(m.getFrom());
      let snippet = '';
      let bodyScan = '';
      let bodyLength = 0;
      let linkCount = 0;
      let attachmentCount = 0;
      let attachmentNames = [];
      try {
        const body = m.getPlainBody(); // fetched once; reused for all text fields
        bodyLength = body.length;
        snippet = Utils.truncate(body, CONFIG.embedding.snippetLen);
        bodyScan = Utils.truncate(body, CONFIG.decisionTree.bodyScanLen);
        linkCount = (body.match(/https?:\/\/[^\s<"]+/gi) || []).length;
      } catch (e) { /* body unreadable — features degrade gracefully */ }
      try {
        const atts = m.getAttachments();
        attachmentCount = atts.length;
        attachmentNames = atts.map(function (a) { return a.getName(); });
      } catch (e) { /* ok */ }
      const userLabels = th.getLabels().map(function (l) { return l.getName(); })
        .filter(function (n) {
          return n.indexOf(CONFIG.labelPrefix + '/') !== 0 &&
                 n !== CONFIG.processedLabel && n !== CONFIG.needsReviewLabel;
        });
      return {
        email: parsed.email,
        name: parsed.name,
        domain: parsed.domain,
        subject: m.getSubject() || '',
        snippet: snippet,
        bodyScan: bodyScan,
        date: m.getDate(),
        threadUrl: th.getPermalink(),
        attachmentCount: attachmentCount,
        attachmentNames: attachmentNames,
        toCount: countAddresses(m.getTo()) + countAddresses(m.getCc()),
        ccCount: countAddresses(m.getCc()),
        threadMsgCount: msgs.length,
        bodyLength: bodyLength,
        linkCount: linkCount,
        userLabels: userLabels,
        isReply: /^re\s*:/i.test(m.getSubject() || ''),
        _thread: th,
      };
    } catch (e) {
      Utils.log('Skipping unreadable thread: ' + e);
      return null;
    }
  }

  /**
   * fetchBatch(query, offset, skipIds) → { records, fetched, hasMore }
   * GmailApp.search returns threads NEWEST FIRST, so batches naturally walk
   * from the most recent mail backwards. skipIds: thread ids already seen or
   * failed this run (re-pagination safety). Each record: { email, name, domain,
   * subject, snippet, bodyScan, date, threadUrl, attachmentCount, toCount,
   * isReply, threadId, _thread }
   */
  function fetchBatch(query, offset, skipIds) {
    const threads = GmailApp.search(query, offset || 0, CONFIG.batchSize) || [];
    const records = [];
    threads.forEach(function (th) {
      // defense in depth: skip threads already marked processed
      const labels = th.getLabels();
      for (let i = 0; i < labels.length; i++) {
        if (labels[i].getName() === CONFIG.processedLabel) return;
      }
      const rec = extractRecord(th);
      if (!rec) return;
      rec.threadId = String(th.getId ? th.getId() : rec.threadUrl); // mock-safe
      if (skipIds && skipIds[rec.threadId]) return;
      records.push(rec);
    });
    return {
      records: records,
      fetched: threads.length,
      hasMore: threads.length >= CONFIG.batchSize,
    };
  }

  return {
    buildQuery: buildQuery,
    fetchBatch: fetchBatch,
    extractRecord: extractRecord,
  };
})();
