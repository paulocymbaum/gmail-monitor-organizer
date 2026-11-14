/**
 * tests/tune-tree.js — otimizador ITERATIVO dos PARÂMETROS DA ÁRVORE DE DECISÃO
 * sobre todos os mocks (waves 1-27): treina árvores ID3 candidatas com várias
 * combinações de maxDepth × minSamplesNode (5-fold CV estratificado), varre o
 * gate minConfidence para cada árvore, simula o cascade completo (regras →
 * árvore com confirmação por similaridade → embedding → fallback) e escolhe a
 * melhor opção por: acurácia ≥ baseline sem árvore → maior cobertura da árvore
 * (embeddings evitados) → menos ruído needs-review → árvore mais simples.
 *
 * Duas passadas ITERATIVAS: (1) grade grossa de maxDepth 4-8 × minSamplesNode
 * 5/8/12/20 × minConfidence 0.70-0.95; (2) refino ao redor do melhor combo
 * (profundidade ±1, minSamplesNode vizinho, minConfidence ±0.025/±0.05).
 * Inclui 3 baselines: árvore artesanal TreeModel.gs, "sem árvore" e a árvore
 * treinada com os defaults atuais do Config.
 *
 * Métricas por combo (sobre o corpus todo): accuracy · treeResolved (embeddings
 * evitados) · treeErrors · flagged · fallbacks · nodes (complexidade).
 * Run: node tests/tune-tree.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const waveFiles = [['mock-dataset.js', 'MOCK_EMAILS'], ['mock-dataset-extra.js', 'MOCK_EMAILS_EXTRA']]
  .concat(['3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27']
    .map(n => ['mock-dataset-' + n + '.js', 'MOCK_EMAILS_' + n]));
const ALL_MOCKS = waveFiles.reduce(function (acc, pair) {
  return acc.concat(require('./' + pair[0])[pair[1]]);
}, []);

const FILES = ['Config.gs', 'Utils.gs', 'State.gs', 'EmbeddingClassifier.gs',
               'DecisionTree.gs', 'TreeModel.gs', 'GmailReader.gs',
               'Categorizer.gs', 'Labeler.gs', 'Trainer.gs', 'Main.gs'];
const source = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n\n') +
  '\n;globalThis.__x = { CONFIG, CATEGORIES, FALLBACK_CATEGORY, State, EmbeddingClassifier,' +
  ' DecisionTree, Categorizer, Labeler, Trainer };';

function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function toyEmbed(text) {
  const DIM = 4096;
  const v = new Array(DIM).fill(0);
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t.split(/[^a-z0-9]+/).forEach(function (w) { if (w.length >= 3) v[strHash(w) % DIM] += 1; });
  return v;
}
const resp = (c, o) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(o) });
const driveStore = {};
function makeFile(n) { return { getName: () => n, getDataAsString: () => (driveStore[n] || '') }; }

const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'GEMINI_API_KEY' ? 'test-key' : null), setProperty: () => {}, setProperties: () => {} }) },
  UrlFetchApp: { fetch: (url, req) => {
    if (url.indexOf(':embedContent') !== -1) { const b = JSON.parse(req.payload); return resp(200, { embedding: { values: toyEmbed(b.content.parts[0].text) } }); }
    if (url.indexOf(':batchEmbedContents') !== -1) { const b = JSON.parse(req.payload); return resp(200, { embeddings: b.requests.map(r => ({ values: toyEmbed(r.content.parts[0].text) })) }); }
    return resp(400, {});
  } },
  DriveApp: { getFilesByName: n => ({ hasNext: () => driveStore[n] !== undefined, next: () => makeFile(n) }), createFile: b => { driveStore[b.getName()] = b.getDataAsString(); return makeFile(b.getName()); } },
  GmailApp: { getUserLabelByName: n => ({ getName: () => n }), createLabel: n => ({ getName: () => n }) },
  Utilities: { newBlob: (d, t, n) => ({ getDataAsString: () => d, getName: () => n, setContent: b => { driveStore[n] = b.getDataAsString(); } }), sleep: () => {} },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ everyMinutes: () => ({ create: () => {} }), create: () => {} }) }) }), deleteTrigger: () => {} },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, getAll: () => ({}), putAll: () => {} }) },
  Logger: { log: () => {} },
};
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'bundle.gs' });
const X = ctx.__x;

// ── MEMOIZAÇÃO: regras, similaridades e FEATURES por amostra (1 passada) ───
X.EmbeddingClassifier.ensurePrototypes(true);
const memo = ALL_MOCKS.map(function (m) {
  const rule = X.Categorizer.categorizeByRules(m);
  const sims = rule ? null : X.EmbeddingClassifier.similarities(m);
  return { expected: m.expected, lang: m.lang, tier: m.tier, subject: m.subject,
           id: String(m.email || m.subject), rule: rule ? rule.category : null,
           sims: sims || {}, features: X.DecisionTree.buildFeatures(m) };
});
const n = memo.length;
const sortedSims = s => Object.keys(s || {})
  .map(k => ({ id: k, sim: s[k] }))
  .sort((a, b) => b.sim - a.sim);
const N = memo.length;
console.log('Corpus: ' + N + ' amostras | features por amostra: ' +
            Object.keys(memo[0].features).length);
// ── GATES/BANDAS FIXAS do cascade (o tuning aqui é da ÁRVORE, não dos gates) ─
const GATES = { minSimilarity: X.CONFIG.embedding.minSimilarity,
                minMargin: X.CONFIG.embedding.minMargin,
                confirmMargin: X.CONFIG.embedding.confirmMargin };
const NR = { treeConfidence: X.CONFIG.needsReview.treeConfidence,
             embeddingSimilarity: X.CONFIG.needsReview.embeddingSimilarity,
             embeddingMargin: X.CONFIG.needsReview.embeddingMargin };

function decideSim(s) {
  if (!s.length || s[0].sim < GATES.minSimilarity) return null;
  if (s.length > 1 && s[0].sim - s[1].sim < GATES.minMargin) return null;
  return { category: s[0].id, similarity: s[0].sim,
           margin: s.length > 1 ? s[0].sim - s[1].sim : 1 };
}
function confirmSim(treeCat, s) {
  if (!s.length || s[0].id === treeCat) return true;
  const margin = s[0].sim - (s[1] ? s[1].sim : 0);
  return !(s[0].sim >= GATES.minSimilarity && margin >= GATES.confirmMargin);
}

// Walk puro da árvore SEM o gate minConfidence — o gate é aplicado por combo.
function rawTree(features, model) {
  if (!model || !model.nodes || !model.nodes.length) return null;
  let node = model.nodes[0], guard = 0;
  while (node && !node.leaf && guard++ < 64) {
    const v = features[node.feature] || 0;
    node = model.nodes[(v >= (node.threshold == null ? 0.5 : node.threshold)) ? node.yes : node.no];
  }
  if (!node || !node.leaf || !node.class) return null;   // folha null = defer
  return { category: node.class, confidence: node.confidence };
}

function cascade(features, sims, rule, treeRaw) {
  if (rule) return { category: rule, source: 'rule', flag: false };
  const s = sortedSims(sims);
  if (treeRaw && treeRaw.confidence >= X.CONFIG.decisionTree.minConfidence &&
      confirmSim(treeRaw.category, s)) {
    return { category: treeRaw.category, source: 'tree',
             flag: treeRaw.confidence < NR.treeConfidence };
  }
  const d = decideSim(s);
  if (d) return { category: d.category, source: 'embedding',
                  flag: d.similarity < NR.embeddingSimilarity || d.margin < NR.embeddingMargin };
  return { category: 'uncategorized', source: 'fallback', flag: true };
}

function evaluateCascadeRaw(rawArr, minConf) {
  X.CONFIG.decisionTree.minConfidence = minConf;
  let correct = 0, treeResolved = 0, treeErrors = 0, flagged = 0, fallbacks = 0;
  for (let i = 0; i < N; i++) {
    const m = memo[i];
    const treeRaw = m.rule ? null : rawArr[i];
    const v = cascade(m.features, m.sims, m.rule, treeRaw);
    if (v.source === 'tree') { treeResolved++; if (v.category !== m.expected) treeErrors++; }
    if (v.flag) flagged++;
    if (v.source === 'fallback') fallbacks++;
    if (v.category === m.expected) correct++;
  }
  return { accuracy: Math.round(10000 * correct / N) / 10000, correct,
           treeResolved: treeResolved, treeErrors: treeErrors,
           flagged: flagged, fallbacks: fallbacks };
}

// ── 5-FOLD CV ESTRATIFICADO: vereditos RAW da árvore por amostra ──────────
const FOLDS = 5;
const folds = (function () {
  const byClass = {};
  memo.forEach(function (m, i) { (byClass[m.expected] = byClass[m.expected] || []).push(i); });
  const f = Array.from({ length: FOLDS }, () => []);
  Object.keys(byClass).forEach(function (c) {
    byClass[c].forEach(function (idx, j) { f[j % FOLDS].push(idx); });
  });
  return f;
})();
const samplesOf = idx => idx.map(i => ({ features: memo[i].features, class: memo[i].expected }));

function crossValidatedRaw(shape) {
  const raw = new Array(N).fill(null);
  let lastModel = null;
  for (let f = 0; f < FOLDS; f++) {
    let trainIdx = [];
    for (let g = 0; g < FOLDS; g++) if (g !== f) trainIdx = trainIdx.concat(folds[g]);
    const model = X.Trainer.train(samplesOf(trainIdx),
      { maxDepth: shape.maxDepth, minSamplesNode: shape.minSamplesNode });
    lastModel = model;
    folds[f].forEach(function (i) { raw[i] = rawTree(memo[i].features, { nodes: model.nodes }); });
  }
  return { raw: raw, nodes: lastModel.nodes.length };
}

// ── Combo = (maxDepth, minSamplesNode, minConfidence) avaliado por CV ─────
function evalCombo(shape, minConf) {
  const cv = crossValidatedRaw(shape);
  const m = evaluateCascadeRaw(cv.raw, minConf);
  return { depth: shape.maxDepth, minSamplesNode: shape.minSamplesNode,
           minConf: minConf, nodes: cv.nodes, metrics: m };
}

// ── Baselines: árvore artesanal (TreeModel.gs) e sem árvore ───────────────
const handcraftedRaw = memo.map(m => m.rule ? null : rawTree(m.features, X.DecisionTree.loadModel()));
function evalHandcrafted(minConf) {
  const m = evaluateCascadeRaw(handcraftedRaw, minConf);
  return { depth: 'hand', minSamplesNode: 'craft', minConf: minConf, nodes: '-', metrics: m };
}
function evalNoTree() { return { depth: 'none', minSamplesNode: '-', minConf: '-', nodes: 0, metrics: evaluateCascadeRaw(new Array(N).fill(null), 0.85) }; }
// ── OTIMIZAÇÃO ITERATIVA: grade grossa → refino → seleção ─────────────────
const results = [];
const seenKeys = {};
function runCombo(depth, minNode, conf) {
  const key = depth + '|' + minNode + '|' + conf;
  if (seenKeys[key]) return null;
  seenKeys[key] = true;
  const r = evalCombo({ maxDepth: depth, minSamplesNode: minNode }, conf);
  results.push(r);
  return r;
}
function rankEligible(base) {
  return results
    .filter(r => r.metrics.accuracy >= base)
    .sort(function (a, b) {
      if (b.metrics.accuracy !== a.metrics.accuracy) return b.metrics.accuracy - a.metrics.accuracy;
      if (b.metrics.treeResolved !== a.metrics.treeResolved) return b.metrics.treeResolved - a.metrics.treeResolved;
      if (a.metrics.flagged !== b.metrics.flagged) return a.metrics.flagged - b.metrics.flagged;
      const ad = typeof a.depth === 'number' ? a.depth : 999;
      const bd = typeof b.depth === 'number' ? b.depth : 999;
      return ad - bd;
    });
}

const noTree = evalNoTree();
const baseAcc = noTree.metrics.accuracy;
console.log('Baseline SEM árvore  : accuracy ' + (baseAcc * 100).toFixed(2) + '% · fallbacks ' +
            noTree.metrics.fallbacks + ' · flagged ' + noTree.metrics.flagged);
// A árvore ARTESANAL também é uma candidata: o próprio minConfidence dela é
// parâmetro — sweep 0.80/0.85/0.90 entra na disputa contra as treinadas.
[0.80, 0.85, 0.90].forEach(function (c) {
  const r = evalHandcrafted(c);
  r.depth = 'hand'; r.minSamplesNode = 'craft'; r.minConf = c;
  results.push(r);
});
const hand = evalHandcrafted(0.85);
console.log('Baseline artesanal   : accuracy ' + (hand.metrics.accuracy * 100).toFixed(2) +
            '% · treeResolved ' + hand.metrics.treeResolved + ' · treeErrors ' + hand.metrics.treeErrors +
            ' · flagged ' + hand.metrics.flagged);

// Passada 1 — grade grossa EXPANDIDA (35 formas × 7 gates = 245 combos,
// 175 treinos CV): profundidades até 10, minSamplesNode até 3 e minConfidence
// mais fino — mais opções comparadas antes de escolher a melhor.
const depths = [4, 5, 6, 7, 8, 9, 10];
const minNodes = [3, 5, 8, 12, 20];
const confs = [0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95];
let done = 0;
depths.forEach(function (d) {
  minNodes.forEach(function (mn) {
    confs.forEach(function (c) { runCombo(d, mn, c); done++; });
  });
  console.log('  grade grossa: maxDepth ' + d + ' concluído (' + done + '/' +
              (depths.length * minNodes.length * confs.length) + ' combos)');
});

// Refino ITERATIVO: até 3 rodadas ao redor do melhor combo elegível
let best = null;
let pass = 0;
while (pass < 3) {
  const eligible = rankEligible(baseAcc);
  if (!eligible.length) { console.log('Nenhum combo elegível — mantenha o artesanal.'); break; }
  const prevBest = best;
  best = eligible[0];
  if (typeof best.depth !== 'number') break;         // melhor é o artesanal
  console.log('Refino ' + (pass + 1) + ': melhor atual depth ' + best.depth +
              ', minSamplesNode ' + best.minSamplesNode + ', minConfidence ' + best.minConf);
  const dNeigh = [best.depth - 1, best.depth, best.depth + 1].filter(d => d >= 3 && d <= 10);
  const mnList = [5, 8, 12, 20];
  const mnNeigh = mnList.filter(mn => Math.abs(mn - best.minSamplesNode) <= 8);
  const cNeigh = [best.minConf - 0.05, best.minConf - 0.025, best.minConf,
                  best.minConf + 0.025, best.minConf + 0.05]
    .map(c => Math.round(c * 1000) / 1000)
    .filter(c => c >= 0.60 && c <= 0.96);
  dNeigh.forEach(function (d) {
    mnNeigh.forEach(function (mn) {
      cNeigh.forEach(function (c) { runCombo(d, mn, c); });
    });
  });
  const newEligible = rankEligible(baseAcc);
  pass++;
  if (newEligible.length && newEligible[0] === best) break;   // sem melhoria → para
  best = newEligible.length ? newEligible[0] : best;
}

// ── Ranking final e relatório ──────────────────────────────────────────────
const eligible = rankEligible(baseAcc);
const top = eligible.slice(0, 12);
console.log('');
console.log('== TOP ' + top.length + ' COMBOS (acurácia ≥ baseline sem árvore) ==');
console.log('depth | minNode | minConf | nodes | accuracy | treeResolved | treeErrors | flagged | fallbacks');
top.forEach(function (r) {
  console.log(r.depth + ' | ' + r.minSamplesNode + ' | ' + r.minConf + ' | ' + r.nodes + ' | ' +
              (r.metrics.accuracy * 100).toFixed(2) + '% | ' + r.metrics.treeResolved + ' | ' +
              r.metrics.treeErrors + ' | ' + r.metrics.flagged + ' | ' + r.metrics.fallbacks);
});
const bestFinal = eligible.length ? eligible[0] : null;
console.log('');
console.log('== MELHOR OPÇÃO ==');
if (bestFinal) {
  console.log('maxDepth ' + bestFinal.depth + ' · minSamplesNode ' + bestFinal.minSamplesNode +
              ' · minConfidence ' + bestFinal.minConf + ' · accuracy ' +
              (bestFinal.metrics.accuracy * 100).toFixed(2) + '% · treeResolved ' +
              bestFinal.metrics.treeResolved + ' (embeddings evitados) · treeErrors ' +
              bestFinal.metrics.treeErrors + ' · flagged ' + bestFinal.metrics.flagged +
              ' · fallbacks ' + bestFinal.metrics.fallbacks);
  console.log('Δ vs sem árvore   : accuracy ' + ((bestFinal.metrics.accuracy - baseAcc) * 100).toFixed(2) +
              'pp · embeddings evitados ' + bestFinal.metrics.treeResolved);
  console.log('Δ vs artesanal    : accuracy ' + ((bestFinal.metrics.accuracy - hand.metrics.accuracy) * 100).toFixed(2) +
              'pp · treeResolved ' + (bestFinal.metrics.treeResolved - hand.metrics.treeResolved));
  console.log('');
  if (typeof bestFinal.depth === 'number') {
    console.log('Como aplicar: CONFIG.trainer.maxDepth = ' + bestFinal.depth +
                '; CONFIG.trainer.minSamplesNode = ' + bestFinal.minSamplesNode +
                '; CONFIG.decisionTree.minConfidence = ' + bestFinal.minConf +
                '; re-executar buildTreeFromLabels() e ativar modelSource drive:tree-model-trained.json');
  } else {
    console.log('Como aplicar: manter TreeModel.gs (árvore artesanal) e apenas ajustar ' +
                'CONFIG.decisionTree.minConfidence = ' + bestFinal.minConf +
                ' se diferir do atual — nenhuma árvore treinada superou a artesanal nesta rodada.');
  }
} else {
  console.log('Nenhum combo treinado supera o baseline — manter TreeModel.gs.');
}

// ── Relatório markdown (comparação entre rodadas do tuner) ────────────────
const repLines = [];
repLines.push('# tune-tree — relatório da rodada');
repLines.push('');
repLines.push('- Corpus: ' + N + ' amostras (waves 1-27) · CV 5-fold estratificado');
repLines.push('- Baseline sem árvore: accuracy ' + (baseAcc * 100).toFixed(2) + '% · fallbacks ' + noTree.metrics.fallbacks);
repLines.push('- Baseline artesanal @0.85: accuracy ' + (hand.metrics.accuracy * 100).toFixed(2) + '% · treeResolved ' + hand.metrics.treeResolved + ' · flagged ' + hand.metrics.flagged);
repLines.push('- Winner: ' + (bestFinal ? (typeof bestFinal.depth === 'number'
  ? 'treinada maxDepth ' + bestFinal.depth + ' · minSamplesNode ' + bestFinal.minSamplesNode + ' · minConfidence ' + bestFinal.minConf
  : 'artesanal @ minConfidence ' + bestFinal.minConf) : 'nenhuma'));
repLines.push('');
repLines.push('| depth | minNode | minConf | nodes | accuracy | treeResolved | treeErrors | flagged | fallbacks |');
repLines.push('|---|---|---|---|---|---|---|---|---|');
eligible.slice(0, 15).forEach(function (r) {
  repLines.push('| ' + r.depth + ' | ' + r.minSamplesNode + ' | ' + r.minConf + ' | ' + r.nodes + ' | ' + (r.metrics.accuracy * 100).toFixed(2) + '% | ' + r.metrics.treeResolved + ' | ' + r.metrics.treeErrors + ' | ' + r.metrics.flagged + ' | ' + r.metrics.fallbacks + ' |');
});
fs.writeFileSync(path.join(__dirname, 'tune-tree-report.md'), repLines.join('\n') + '\n');
console.log('Relatório salvo em tests/tune-tree-report.md');
console.log('(estimativa honesta = CV 5-fold; treino no corpus completo é upper bound otimista)');
