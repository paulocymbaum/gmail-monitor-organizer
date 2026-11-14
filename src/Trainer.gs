/**
 * Trainer.gs — in-script ID3 trainer (ARCHITECTURE.md §4.5, model source 3).
 * buildTreeFromLabels() reads the labeled mailbox (threads carrying GMO/<id>
 * labels) as ground truth, forces a LANGUAGE-FIRST root (lang_pt → lang_es →
 * English remainder), trains an ID3 tree on the binary features, and saves
 * tree-model-trained.json to Drive. Manual entry point — run from the editor.
 */
const Trainer = (function () {

  /** Entropy of the class distribution of a sample set. */
  function entropy(samples) {
    if (!samples.length) return 0;
    const counts = {};
    samples.forEach(function (s) { counts[s.class] = (counts[s.class] || 0) + 1; });
    let h = 0;
    Object.keys(counts).forEach(function (k) {
      const p = counts[k] / samples.length;
      h -= p * Math.log2(p);
    });
    return h;
  }

  function infoGain(samples, key) {
    const yes = samples.filter(function (s) { return (s.features[key] || 0) >= 0.5; });
    const no = samples.filter(function (s) { return (s.features[key] || 0) < 0.5; });
    if (!yes.length || !no.length) return 0;
    const n = samples.length;
    return entropy(samples) - (yes.length / n) * entropy(yes) -
           (no.length / n) * entropy(no);
  }

  /**
   * Majority-class leaf. 'uncategorized' leaves mean "no confident verdict" →
   * class null, which the evaluator treats as defer-downstream.
   */
  function majorityLeaf(samples) {
    if (!samples.length) return { leaf: true, class: null, confidence: 0.30 };
    const counts = {};
    let best = null;
    let bestN = 0;
    let total = 0;
    samples.forEach(function (s) {
      total++;
      counts[s.class] = (counts[s.class] || 0) + 1;
      if (counts[s.class] > bestN) { bestN = counts[s.class]; best = s.class; }
    });
    const cls = (best === FALLBACK_CATEGORY.id) ? null : best;
    return {
      leaf: true,
      class: cls,
      confidence: Math.round(100 * bestN / total) / 100,
    };
  }

  /** ID3 over binary features → nested {leaf}|{feature, yes, no} nodes. */
  function id3(samples, keys, depth, cfg) {
    if (!samples.length) return { leaf: true, class: null, confidence: 0.30 };
    const seen = {};
    samples.forEach(function (s) { seen[s.class] = 1; });
    if (Object.keys(seen).length === 1) return majorityLeaf(samples);
    if (depth >= cfg.maxDepth || samples.length < cfg.minSamplesNode || !keys.length) {
      return majorityLeaf(samples);
    }
    let best = null;
    let bestGain = 1e-9;
    keys.forEach(function (k) {
      const g = infoGain(samples, k);
      if (g > bestGain) { bestGain = g; best = k; }
    });
    if (!best) return majorityLeaf(samples);
    const yes = samples.filter(function (s) { return (s.features[best] || 0) >= 0.5; });
    const no = samples.filter(function (s) { return (s.features[best] || 0) < 0.5; });
    if (!yes.length || !no.length) return majorityLeaf(samples);
    const rest = keys.filter(function (k) { return k !== best; });
    return {
      feature: best,
      yes: id3(yes, rest, depth + 1, cfg),
      no: id3(no, rest, depth + 1, cfg),
    };
  }

  /** Flatten nested nodes; renumber ids so id === array index (evaluator contract). */
  function serialize(root) {
    const nodes = [];
    (function walk(n) {
      const id = nodes.length;
      if (n.leaf) {
        nodes.push({ leaf: true, class: n.class || null, confidence: n.confidence });
        return id;
      }
      nodes.push({ feature: n.feature, threshold: 0.5, yes: -1, no: -1 });
      nodes[id].yes = walk(n.yes);
      nodes[id].no = walk(n.no);
      return id;
    })(root);
    return nodes;
  }

  /**
   * train(samples) → model object. PURE — no Google services (unit-testable).
   * samples: [{ features: {…binary flags…}, class: categoryId }]
   * The root is forced to language: lang_pt → lang_es → English remainder.
   */
  function train(samples, opts) {
    opts = opts || {};
    const cfg = {
      maxDepth: opts.maxDepth || CONFIG.trainer.maxDepth,
      minSamplesNode: opts.minSamplesNode || CONFIG.trainer.minSamplesNode,
    };
    const keySet = {};
    samples.forEach(function (s) {
      Object.keys(s.features).forEach(function (k) { keySet[k] = 1; });
    });
    const keys = Object.keys(keySet).sort();
    const pt = samples.filter(function (s) { return s.features.lang_pt === 1; });
    const mid = samples.filter(function (s) { return s.features.lang_pt !== 1; });
    const es = mid.filter(function (s) { return s.features.lang_es === 1; });
    const en = mid.filter(function (s) { return s.features.lang_es !== 1; });
    const root = {
      feature: 'lang_pt',
      yes: id3(pt, keys.slice(), 1, cfg),
      no: {
        feature: 'lang_es',
        yes: id3(es, keys.slice(), 1, cfg),
        no: id3(en, keys.slice(), 1, cfg),
      },
    };
    return {
      version: '1.0-trained-language-first',
      trainedAt: new Date().toISOString(),
      sampleCount: samples.length,
      features: keys,
      nodes: serialize(root),
    };
  }

  /**
   * buildTreeFromLabels() — manual entry point. Collects labeled threads
   * (exactly one GMO/<id> category label each — ambiguous threads are skipped),
   * trains, measures train accuracy, writes tree-model-trained.json to Drive
   * (overwrites by name) and logs activation instructions.
   */
  function buildTreeFromLabels() {
    const start = Date.now();
    const t = CONFIG.trainer;
    const ids = CATEGORIES.map(function (c) { return c.id; })
                          .concat([FALLBACK_CATEGORY.id]);
    const samples = [];
    const perClass = {};
    ids.forEach(function (id) {
      perClass[id] = 0;
      const label = GmailApp.getUserLabelByName(CONFIG.labelPrefix + '/' + id);
      if (!label) return;
      const threads = label.getThreads(0, t.maxPerClass);
      for (let i = 0; i < threads.length; i++) {
        if (Date.now() - start > CONFIG.maxRuntimeMs) {
          Utils.log('Trainer: time budget reached — training with samples collected so far.');
          break;
        }
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

    if (samples.length < t.minSamplesTotal) {
      Utils.log('Trainer: only ' + samples.length + ' labeled samples found (need ≥ ' +
                t.minSamplesTotal + '). Label more mail, then re-run.');
      return null;
    }

    const model = train(samples);
    let correct = 0;
    samples.forEach(function (s) {
      const v = DecisionTree.evaluate(s.features, { nodes: model.nodes });
      if (v && v.category === s.class) correct++;
    });
    model.trainAccuracy = Math.round(1000 * correct / samples.length) / 10;
    model.perClass = perClass;

    const name = 'tree-model-trained.json';
    const fileId = Utils.driveJsonPut('TREE_MODEL_FILE_ID', name, model);

    Utils.log('Trainer: trained on ' + samples.length + ' samples (train accuracy ' +
              model.trainAccuracy + '%) → Drive file "' + name + '"' +
              (fileId ? ' (id ' + fileId + ')' : ' (Drive write FAILED — check scopes)') +
              '. To activate: set CONFIG.decisionTree.modelSource = "drive:' + name + '".');
    return model;
  }

  return {
    entropy: entropy,
    infoGain: infoGain,
    id3: id3,
    serialize: serialize,
    train: train,
    buildTreeFromLabels: buildTreeFromLabels,
  };
})();

/** Editor entry point (shows in the Apps Script function dropdown). */
function buildTreeFromLabels() { return Trainer.buildTreeFromLabels(); }
