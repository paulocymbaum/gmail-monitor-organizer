/**
 * Categorizer.gs — hybrid engine (ARCHITECTURE.md §4.4).
 * Resolution order: sender cache → rules → DecisionTree (similarity-confirmed)
 *   → embedding classifier → fallback.
 * Tree/embedding verdicts are cached per sender with a TTL
 * (CONFIG.senderCacheTtlDays — expired entries get a fresh chance with the
 * current model); fallback is never cached (so a later API key, new rule or
 * retrained tree gets a fresh chance next run).
 * Every verdict carries needsReview — true when it cleared the acceptance
 * gates but sits in a low-confidence band (CONFIG.needsReview) or fell back —
 * which the Labeler turns into the GMO/needs-review tag: the tag IS the
 * system's ongoing precision metric (needsReviewReport()).
 */
const Categorizer = (function () {

  /**
   * Precision flag: verdicts that cleared the acceptance gates but land in a
   * low-confidence band (CONFIG.needsReview) are marked needs-review.
   * Rule verdicts are deterministic and never flagged; fallback always is.
   */
  function flagFor(verdict) {
    if (verdict.source === 'fallback') return true;
    if (verdict.source === 'tree' && verdict.confidence != null) {
      return verdict.confidence < (CONFIG.needsReview ? CONFIG.needsReview.treeConfidence : 0.90);
    }
    if (verdict.source === 'embedding' && verdict.similarity != null) {
      const nr = CONFIG.needsReview || {};
      const minSim = (nr.embeddingSimilarity != null) ? nr.embeddingSimilarity : 0.45;
      const minMar = (nr.embeddingMargin != null) ? nr.embeddingMargin : 0.15;
      return verdict.similarity < minSim || verdict.margin < minMar;
    }
    return false;
  }

  function classify(msg) {
    const email = String(msg.email || '').toLowerCase();
    const hit = State.lookupSender(email);   // TTL-enforced (expired → null)
    if (hit) {
      return { category: hit.category, source: 'cache', needsReview: hit.needsReview };
    }
    const stale = State.peekSender(email);   // entrada expirada (tinha categoria antes)
    const verdict = resolveAndCache(msg);
    if (verdict.source === 'fallback' && stale && stale.category &&
        stale.category !== FALLBACK_CATEGORY.id) {
      // Entrada expirada + sem veredito melhor agora (ex.: cota de embeddings
      // esgotada): mantém a categoria ANTIGA, marcada needs-review — o modelo
      // mais novo re-avalia no próximo TTL. Nunca degrada para uncategorized.
      State.cacheSender(email, stale.category, true);
      return { category: stale.category, source: 'cache', needsReview: true };
    }
    return verdict;
  }

  /**
   * classifyFresh(msg) — resolve() com o modelo ATUAL, sempre ignorando o
   * cache do remetente. O fluxo de re-triagem usa isto para dar uma nova
   * chance ao mail em needs-review sempre que regras/refs/tree/gates melhoram:
   * a versão mais nova do algoritmo tenta resolver estes casos. O novo
   * veredito (categoria + flag) sobrescreve a entrada do cache; fallback
   * continua nunca cacheado.
   */
  function classifyFresh(msg) { return resolveAndCache(msg); }

  function resolveAndCache(msg) {
    const email = String(msg.email || '').toLowerCase();
    const verdict = resolve(msg);
    if (verdict.source !== 'fallback') {
      State.cacheSender(email, verdict.category, verdict.needsReview);
    }
    return verdict;
  }

  /** Pipeline pós-cache: regras → tree (similarity-confirmado) → embedding → fallback. */
  function resolve(msg) {
    const rule = categorizeByRules(msg);
    if (rule) return { category: rule.category, source: 'rule', needsReview: false };

    // embedding similarities: null when the free embedding tier is unavailable
    const sims = EmbeddingClassifier.similarities(msg);

    const tree = DecisionTree.evaluateMessage(msg);
    if (tree) {
      const conf = sims
        ? EmbeddingClassifier.confirm(tree.category, tree.confidence, sims)
        : { accepted: true, reason: 'embeddings-unavailable' };
      if (conf.accepted) {
        return { category: tree.category, source: 'tree',
                 needsReview: flagFor({ source: 'tree', confidence: tree.confidence }),
                 confidence: tree.confidence };
      }
      Utils.log('Tree verdict "' + tree.category + '" vetoed by similarity — ' + conf.reason);
    }

    const emb = EmbeddingClassifier.decide(sims);
    if (emb) {
      return { category: emb.category, source: 'embedding',
               needsReview: flagFor({ source: 'embedding', similarity: emb.similarity, margin: emb.margin }),
               similarity: emb.similarity, margin: emb.margin };
    }

    return { category: FALLBACK_CATEGORY.id, source: 'fallback', needsReview: true };
  }

  /**
   * Rule engine — categories in priority order; within each, domains first,
   * then keywords. Keyword haystack = sender name + subject + snippet.
   */
  function categorizeByRules(msg) {
    const domain = String(msg.domain || '').toLowerCase();
    const hay = ((msg.name || '') + ' ' + (msg.subject || '') + ' ' +
                 (msg.snippet || '')).toLowerCase();
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const r = c.rules || {};
      const domains = r.domains || [];
      for (let j = 0; j < domains.length; j++) {
        if (Utils.matchesDomain(domain, domains[j])) {
          return { category: c.id, by: 'domain:' + domains[j] };
        }
      }
      const keywords = r.keywords || [];
      for (let j = 0; j < keywords.length; j++) {
        if (hay.indexOf(keywords[j].toLowerCase()) !== -1) {
          return { category: c.id, by: 'keyword:' + keywords[j] };
        }
      }
    }
    return null;
  }

  return { classify: classify, classifyFresh: classifyFresh, categorizeByRules: categorizeByRules };
})();
