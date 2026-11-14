/**
 * Tuner.gs — weekly in-script decision-tree tuner (ARCHITECTURE.md §4.5).
 *
 * The offline optimizer (tests/tune-tree.js) cannot run inside Apps Script:
 * it reads 28 corpus files from disk (no filesystem here) and burns ~15 min
 * of CPU against the 6-minute execution cap. This module brings the SAME
 * iterative compare-until-best loop into the runtime, within budget:
 *
 *   - Corpus = the user's TAGGED mail: threads carrying exactly one GMO/<id>
 *     category label (same contract as Trainer.buildTreeFromLabels). Features
 *     are built locally by DecisionTree.buildFeatures — ZERO embedding quota.
 *     Cached to Drive (tuner-corpus.json) and reused while younger than
 *     CONFIG.trainer.tune.corpusTtlDays.
 *   - Search = bounded ladder of (maxDepth × minSamplesNode) shapes; each
 *     shape trains k stratified-CV trees via Trainer.train(samples, opts);
 *     held-out verdicts collected once, then every minConfidence candidate
 *     is swept for FREE (same trees, re-gated — no retraining).
 *   - Budget = the sweep is time-guarded and the ladder ROTATES through the
 *     TUNER_CURSOR property: an execution out of time resumes where it
 *     stopped on the next run — honest chunking under the 6-minute cap.
 *   - Verdict = best combo by CV accuracy → full-corpus retrain → compared
 *     against the CURRENT production model on the same corpus; candidate
 *     saved to Drive (tree-model-tuned.json). Auto-activation ONLY with
 *     CONFIG.trainer.tune.autoApply (default false) and CV gain ≥
 *     autoApplyMinGainPp — sets the TREE_MODEL_SOURCE property honored by
 *     DecisionTree.loadModel(), no code edits.
 *
 * Editor entry points: runWeeklyTuner(), setupWeeklyTuner(),
 * removeWeeklyTuner(), tunerStatus().
 */
const Tuner = (function () {

  const CORPUS_FILE = 'tuner-corpus.json';
  const CORPUS_KEY = 'TUNER_CORPUS_FILE_ID';
  const TUNED_FILE = 'tree-model-tuned.json';
  const TUNED_KEY = 'TUNED_MODEL_FILE_ID';

  // ── Corpus: tagged mailbox, cache-first ──────────────────────────────────

  /**
   * collectSamples(start) → { samples:[{features, class}], perClass, fromCache }
   * Drive cache first (younger than corpusTtlDays); otherwise fresh Gmail
   * collection within the corpusBudgetMs slice.
   */
  function collectSamples(start) {
    const t = CONFIG.trainer.tune;
    try {
      const cached = Utils.driveJsonGet(CORPUS_KEY, CORPUS_FILE);
      if (cached && cached.ts && cached.samples && cached.samples.length) {
        const ageDays = (Date.now() - new Date(cached.ts).getTime()) / 86400000;
        if (ageDays <= t.corpusTtlDays) {
          return {
            samples: cached.samples.map(function (s) {
              return { features: s.f, class: s.y };
            }),
            perClass: cached.perClass || {},
            fromCache: true,
          };
        }
      }
    } catch (e) { /* stale/missing cache → fresh collection */ }

    const ids = CATEGORIES.map(function (c) { return c.id; })
                          .concat([FALLBACK_CATEGORY.id]);
    const samples = [];
    const perClass = {};
    ids.forEach(function (id) {
      perClass[id] = 0;
      if (Date.now() - start > t.corpusBudgetMs) return;
      const label = GmailApp.getUserLabelByName(CONFIG.labelPrefix + '/' + id);
      if (!label) return;
      let threads = [];
      try {
        threads = label.getThreads(0, CONFIG.trainer.maxPerClass) || [];
      } catch (e) { threads = []; }
      for (let i = 0; i < threads.length; i++) {
        if (Date.now() - start > t.corpusBudgetMs) break;
        const catLabels = threads[i].getLabels().filter(function (l) {
          const n = l.getName();
          return n.indexOf(CONFIG.labelPrefix + '/') === 0 &&
                 n !== CONFIG.processedLabel && n !== CONFIG.needsReviewLabel;
        });
        if (catLabels.length !== 1) continue; // ambiguous → skip
        const rec = GmailReader.extractRecord(threads[i]);
        if (!rec || !rec.email) continue;
        samples.push({ features: DecisionTree.buildFeatures(rec), class: id });
        perClass[id]++;
      }
    });
    return { samples: samples, perClass: perClass, fromCache: false };
  }

  function saveCorpusCache(corpus) {
    try {
      Utils.driveJsonPut(CORPUS_KEY, CORPUS_FILE, {
        ts: new Date().toISOString(),
        perClass: corpus.perClass || {},
        samples: corpus.samples.map(function (s) {
          return { f: s.features, y: s.class };
        }),
      });
    } catch (e) {
      Utils.log('Tuner: corpus cache write failed (non-fatal) — ' + e);
    }
  }

  // ── CV + gate sweep ──────────────────────────────────────────────────────

  /**
   * stratifiedFolds(samples, k) → array of k index arrays. Round-robin per
   * class in corpus order — deterministic, and every fold keeps every class.
   */
  function stratifiedFolds(samples, k) {
    const folds = [];
    for (let i = 0; i < k; i++) folds.push([]);
    const byClass = {};
    samples.forEach(function (s, i) {
      (byClass[s.class] = byClass[s.class] || []).push(i);
    });
    Object.keys(byClass).forEach(function (cls) {
      byClass[cls].forEach(function (idx, j) { folds[j % k].push(idx); });
    });
    return folds;
  }

  /**
   * leafVerdict(features, model) → { cls, conf } | null — tree walk WITHOUT
   * the minConfidence gate (gating is applied by the caller so one trained
   * tree serves every minConfidence candidate in the sweep).
   */
  function leafVerdict(features, model) {
    if (!model || !model.nodes || !model.nodes.length) return null;
    let node = model.nodes[0];
    let guard = 0;
    while (node && !node.leaf && guard++ < 64) {
      const value = features[node.feature] || 0;
      const next = (value >= (node.threshold == null ? 0.5 : node.threshold))
        ? node.yes : node.no;
      node = model.nodes[next];
    }
    if (!node || !node.leaf || !node.class || node.confidence == null) return null;
    return { cls: node.class, conf: node.confidence };
  }

  /**
   * cvShape(shape, samples, folds, confCandidates) → results per (shape ×
   * gate): trains k trees, collects held-out verdicts once, then scores every
   * gate. Defers (no verdict / below gate) count as misses — the same
   * conservative contract the cascade uses.
   */
  function cvShape(shape, samples, folds, confCandidates) {
    const verdicts = [];
    folds.forEach(function (fold) {
      const held = {};
      fold.forEach(function (i) { held[i] = 1; });
      const trainS = samples.filter(function (s, i) { return !held[i]; });
      const heldS = samples.filter(function (s, i) { return !!held[i]; });
      if (!trainS.length || !heldS.length) return;
      let model;
      try {
        model = Trainer.train(trainS, { maxDepth: shape.d, minSamplesNode: shape.n });
      } catch (e) { return; }
      heldS.forEach(function (s) {
        const v = leafVerdict(s.features, model);
        verdicts.push({ y: s.class, cls: v ? v.cls : null, conf: v ? v.conf : 0 });
      });
    });
    if (!verdicts.length) return [];
    return confCandidates.map(function (g) {
      let correct = 0, resolved = 0;
      verdicts.forEach(function (v) {
        if (v.cls && v.conf >= g) { resolved++; if (v.cls === v.y) correct++; }
      });
      return {
        d: shape.d, n: shape.n, conf: g,
        acc: correct / verdicts.length,
        resolved: resolved, total: verdicts.length,
      };
    });
  }

  // ── Champion (current production model) + ladder ─────────────────────────

  function buildLadder() {
    const t = CONFIG.trainer.tune;
    const ladder = [];
    t.depthCandidates.forEach(function (d) {
      t.minNodeCandidates.forEach(function (n) { ladder.push({ d: d, n: n }); });
    });
    return ladder;
  }

  /** Champion = the model the cascade uses TODAY, gated at the configured minConfidence. */
  function currentChampion(samples) {
    let model = null;
    try { model = DecisionTree.loadModel(); } catch (e) { model = null; }
    const gate = CONFIG.decisionTree.minConfidence;
    let correct = 0, resolved = 0;
    samples.forEach(function (s) {
      const v = leafVerdict(s.features, model);
      if (v && v.conf >= gate) { resolved++; if (v.cls === s.class) correct++; }
    });
    return {
      active: !!model,
      gate: gate,
      acc: samples.length ? correct / samples.length : 0,
      resolved: resolved,
    };
  }

  // ── Weekly entry point ───────────────────────────────────────────────────

  /**
   * runWeeklyTuner() — the whole loop in one execution: corpus → champion
   * baseline → rotating time-guarded CV sweep → best combo → full-corpus
   * retrain → Drive candidate + report → optional auto-apply.
   */
  function runWeeklyTuner() {
    const start = Date.now();
    const t = CONFIG.trainer.tune;

    const corpus = collectSamples(start);
    if (!corpus.fromCache && corpus.samples.length) saveCorpusCache(corpus);
    if (corpus.samples.length < CONFIG.trainer.minSamplesTotal) {
      Utils.log('Tuner: only ' + corpus.samples.length + ' tagged samples found ' +
                '(need ≥ ' + CONFIG.trainer.minSamplesTotal + '). Tag more mail first.');
      return { ok: false, reason: 'not-enough-samples', corpus: corpus.samples.length };
    }

    const foldsN = Math.max(2, Math.min(t.folds,
                     Math.floor(corpus.samples.length / 10)));
    const folds = stratifiedFolds(corpus.samples, foldsN);
    const champ = currentChampion(corpus.samples);
    Utils.log('Tuner: corpus ' + corpus.samples.length + ' samples' +
              (corpus.fromCache ? ' (cached)' : ' (fresh from Gmail)') +
              ' · CV folds ' + foldsN +
              ' · champion acc ' + (100 * champ.acc).toFixed(1) + '%');

    const ladder = buildLadder();
    // Absolute wall-clock deadline (elapsed-vs-absolute mixing here would
    // make the budget unenforceable — start+X is ~1.7e12 ms).
    const deadline = start + CONFIG.maxRuntimeMs - 20000; // room for final train+save
    let cursor = parseInt(State.get('TUNER_CURSOR', '-1'), 10);
    if (isNaN(cursor) || cursor < -1) cursor = -1;
    const results = [];
    let idx = cursor + 1, tried = 0, paused = false;
    while (tried < ladder.length) {
      if (idx >= ladder.length) idx = 0;
      if (Date.now() > deadline) { paused = true; break; }
      cvShape(ladder[idx], corpus.samples, folds, t.confCandidates)
        .forEach(function (r) { results.push(r); });
      State.set('TUNER_CURSOR', String(idx)); // resume point for the next run
      idx++; tried++;
    }

    if (!results.length) {
      Utils.log('Tuner: time budget spent before the first shape — next run resumes the sweep.');
      return { ok: false, reason: 'time-budget', champion: champ };
    }

    results.sort(function (a, b) {
      if (b.acc !== a.acc) return b.acc - a.acc;
      return b.resolved - a.resolved;
    });
    const best = results[0];

    let trained = null;
    if (Date.now() < deadline) {
      try {
        trained = Trainer.train(corpus.samples,
                                { maxDepth: best.d, minSamplesNode: best.n });
      } catch (e) { Utils.log('Tuner: final train failed — ' + e); }
    }

    let saved = false;
    if (trained) {
      trained.tunedAt = new Date().toISOString();
      trained.tunedCv = best;   // CV estimate — the honest number, not train accuracy
      trained.champion = champ;
      try {
        Utils.driveJsonPut(TUNED_KEY, TUNED_FILE, trained);
        saved = true;
      } catch (e) { Utils.log('Tuner: Drive save failed — ' + e); }
    }

    const gainPp = 100 * (best.acc - champ.acc);
    Utils.log('Tuner: best CV ' + (100 * best.acc).toFixed(2) + '% @ depth ' + best.d +
              ' · minNode ' + best.n + ' · minConf ' + best.conf +
              ' (' + best.resolved + '/' + best.total + ' held-out resolved)' +
              ' · champion ' + (100 * champ.acc).toFixed(2) + '%' +
              ' → gain ' + gainPp.toFixed(2) + 'pp' +
              (paused ? ' · sweep PAUSED mid-ladder (resumes next run)' : ' · full ladder swept'));
    if (saved) {
      Utils.log('Tuner: candidate saved → Drive "' + TUNED_FILE + '". Activate via ' +
                'CONFIG.decisionTree.modelSource = "drive:' + TUNED_FILE + '", or set ' +
                'CONFIG.trainer.tune.autoApply = true.');
    }

    if (t.autoApply && saved && gainPp >= t.autoApplyMinGainPp) {
      State.set('TREE_MODEL_SOURCE', 'drive:' + TUNED_FILE);
      Utils.log('Tuner: AUTO-APPLIED — TREE_MODEL_SOURCE override set (loads on next run).');
    }

    State.set('TUNER_LAST_RUN', new Date().toISOString());
    return {
      ok: true, best: best, champion: champ, gainPp: gainPp,
      paused: paused, saved: saved, corpus: corpus.samples.length,
      combos: results.length,
    };
  }

  /** tunerStatus() — what the tuner knows right now. */
  function status() {
    const info = {
      lastRun: State.get('TUNER_LAST_RUN', ''),
      cursor: State.get('TUNER_CURSOR', ''),
      autoApply: !!CONFIG.trainer.tune.autoApply,
      modelOverride: State.get('TREE_MODEL_SOURCE', ''),
      corpusCached: false,
    };
    try {
      const cached = Utils.driveJsonGet(CORPUS_KEY, CORPUS_FILE);
      info.corpusCached = !!(cached && cached.samples && cached.samples.length);
      info.corpusTs = cached ? cached.ts : '';
    } catch (e) { /* no cache */ }
    Utils.log('Tuner status: lastRun ' + (info.lastRun || 'never') +
              ' · ladder cursor ' + (info.cursor === '' ? 'fresh' : info.cursor) +
              ' · corpus cached ' + info.corpusCached +
              ' · autoApply ' + info.autoApply +
              (info.modelOverride ? ' · OVERRIDE ' + info.modelOverride : ''));
    return info;
  }

  // ── Trigger management ───────────────────────────────────────────────────

  function setupWeeklyTuner() {
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'runWeeklyTuner') ScriptApp.deleteTrigger(tr);
    });
    ScriptApp.newTrigger('runWeeklyTuner').timeBased()
      .everyWeeks(1).onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(CONFIG.triggerHour || 6).create();
    Utils.log('Weekly tuner trigger installed: runWeeklyTuner() every Monday @ ' +
              (CONFIG.triggerHour || 6) + ' h.');
  }

  function removeWeeklyTuner() {
    let removed = 0;
    ScriptApp.getProjectTriggers().forEach(function (tr) {
      if (tr.getHandlerFunction() === 'runWeeklyTuner') {
        ScriptApp.deleteTrigger(tr);
        removed++;
      }
    });
    Utils.log('Weekly tuner triggers removed: ' + removed + '.');
    return removed;
  }

  return {
    collectSamples: collectSamples,
    stratifiedFolds: stratifiedFolds,
    leafVerdict: leafVerdict,
    cvShape: cvShape,
    buildLadder: buildLadder,
    currentChampion: currentChampion,
    runWeeklyTuner: runWeeklyTuner,
    status: status,
    setupWeeklyTuner: setupWeeklyTuner,
    removeWeeklyTuner: removeWeeklyTuner,
  };
})();

/** Editor entry points (show in the Apps Script function dropdown). */
function runWeeklyTuner() { return Tuner.runWeeklyTuner(); }
function tunerStatus() { return Tuner.status(); }
function setupWeeklyTuner() { return Tuner.setupWeeklyTuner(); }
function removeWeeklyTuner() { return Tuner.removeWeeklyTuner(); }