/**
 * tests/tune-gates.js — grid search dos PARÂMETROS DE DECISÃO sobre TODOS os
 * mocks: embedding gates (minSimilarity × minMargin × confirmMargin) e bandas
 * needs-review (treeConfidence × embeddingSimilarity × embeddingMargin).
 *
 * Como funciona: roda o pipeline real 1× para MEMOIZAR (por amostra) o veredito
 * de regras, o vetor de similaridades e o veredito da árvore; depois re-simula
 * resolve()/flagFor() localmente para cada combinação da grade — sem re-embed
 * (instantâneo) e sem tocar no CONFIG. Métricas por combo:
 *   accuracy · errors · flagged · flagged-on-correct (ruído) · flagged-on-error
 *   (cobertura) · fallbacks.
 * Ordenação: max accuracy → flagged-on-error = errors (todo erro sinalizado) →
 * mínimo ruído → mínimo flagged total.
 * Run: node tests/tune-gates.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { MOCK_EMAILS } = require('./mock-dataset.js');
const { MOCK_EMAILS_EXTRA } = require('./mock-dataset-extra.js');
const { MOCK_EMAILS_3 } = require('./mock-dataset-3.js');
const { MOCK_EMAILS_4 } = require('./mock-dataset-4.js');
const { MOCK_EMAILS_5 } = require('./mock-dataset-5.js');
const { MOCK_EMAILS_6 } = require('./mock-dataset-6.js');
const { MOCK_EMAILS_7 } = require('./mock-dataset-7.js');
const { MOCK_EMAILS_8 } = require('./mock-dataset-8.js');
const { MOCK_EMAILS_9 } = require('./mock-dataset-9.js');
const { MOCK_EMAILS_10 } = require('./mock-dataset-10.js');
const { MOCK_EMAILS_11 } = require('./mock-dataset-11.js');
const { MOCK_EMAILS_12 } = require('./mock-dataset-12.js');
const { MOCK_EMAILS_13 } = require('./mock-dataset-13.js');
const { MOCK_EMAILS_14 } = require('./mock-dataset-14.js');
const { MOCK_EMAILS_15 } = require('./mock-dataset-15.js');
const { MOCK_EMAILS_16 } = require('./mock-dataset-16.js');
const { MOCK_EMAILS_17 } = require('./mock-dataset-17.js');
const { MOCK_EMAILS_18 } = require('./mock-dataset-18.js');
const { MOCK_EMAILS_19 } = require('./mock-dataset-19.js');
const { MOCK_EMAILS_20 } = require('./mock-dataset-20.js');
const { MOCK_EMAILS_21 } = require('./mock-dataset-21.js');
const { MOCK_EMAILS_22 } = require('./mock-dataset-22.js');
const ALL_MOCKS = MOCK_EMAILS.concat(MOCK_EMAILS_EXTRA).concat(MOCK_EMAILS_3)
  .concat(MOCK_EMAILS_4).concat(MOCK_EMAILS_5).concat(MOCK_EMAILS_6).concat(MOCK_EMAILS_7)
  .concat(MOCK_EMAILS_8).concat(MOCK_EMAILS_9).concat(MOCK_EMAILS_10).concat(MOCK_EMAILS_11)
  .concat(MOCK_EMAILS_12).concat(MOCK_EMAILS_13).concat(MOCK_EMAILS_14).concat(MOCK_EMAILS_15)
  .concat(MOCK_EMAILS_16).concat(MOCK_EMAILS_17).concat(MOCK_EMAILS_18).concat(MOCK_EMAILS_19)
  .concat(MOCK_EMAILS_20).concat(MOCK_EMAILS_21).concat(MOCK_EMAILS_22);

const FILES = ['Config.gs', 'Utils.gs', 'State.gs', 'EmbeddingClassifier.gs',
               'DecisionTree.gs', 'TreeModel.gs', 'GmailReader.gs',
               'Categorizer.gs', 'Labeler.gs', 'Trainer.gs', 'Main.gs'];
const source = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n\n') +
  '\n;globalThis.__x = { CONFIG, CATEGORIES, FALLBACK_CATEGORY, State, EmbeddingClassifier,' +
  ' DecisionTree, Categorizer };';

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

// ── 1) MEMOIZAÇÃO: uma única passada real do pipeline ────────────────────
X.EmbeddingClassifier.ensurePrototypes(true);
const memo = ALL_MOCKS.map(function (m) {
  const rule = X.Categorizer.categorizeByRules(m);
  const sims = rule ? null : X.EmbeddingClassifier.similarities(m);
  const tree = rule ? null : X.DecisionTree.evaluateMessage(m);
  return { expected: m.expected, lang: m.lang, tier: m.tier, subject: m.subject,
           rule: rule ? rule.category : null, sims: sims, tree: tree };
});
const n = memo.length;
const sortedSims = sims => Object.keys(sims || {})
  .map(k => ({ id: k, sim: sims[k] }))
  .sort((a, b) => b.sim - a.sim);

// Replicas EmbeddingClassifier.decide/confirm (fidelidade 1:1 com o fonte).
function decideSim(s, minSim, minMar) {
  if (!s.length) return null;
  if (s[0].sim < minSim) return null;
  if (s.length > 1 && s[0].sim - s[1].sim < minMar) return null;
  return { category: s[0].id, similarity: s[0].sim,
           margin: s.length > 1 ? Math.round(10000 * (s[0].sim - s[1].sim)) / 10000 : 1 };
}
function confirmSim(treeCat, s, confirmMar, minSim) {
  if (!s.length) return true;
  if (s[0].id === treeCat) return true;
  const margin = s[0].sim - (s[1] ? s[1].sim : 0);
  return !(s[0].sim >= minSim && margin >= confirmMar);
}

// ── 2) Simulação de resolve()+flagFor() para um combo de parâmetros ──────
function simulate(g, nr) {
  let correct = 0, flagged = 0, flagCorrect = 0, flagError = 0, errors = 0, fb = 0;
  const missDetail = [];
  for (let i = 0; i < n; i++) {
    const r = memo[i];
    let cat, flag;
    if (r.rule) { cat = r.rule; flag = false; }
    else {
      const s = r.sims ? sortedSims(r.sims) : [];
      const t = r.tree;
      if (t && confirmSim(t.category, s, g.confirmMargin, g.minSimilarity)) {
        cat = t.category; flag = t.confidence < nr.treeConfidence;
      } else {
        const d = decideSim(s, g.minSimilarity, g.minMargin);
        if (d) { cat = d.category; flag = d.similarity < nr.embeddingSimilarity || d.margin < nr.embeddingMargin; }
        else { cat = 'uncategorized'; flag = true; fb++; }
      }
    }
    const ok = cat === r.expected;
    if (ok) correct++; else { errors++; missDetail.push({ expected: r.expected, got: cat, subject: r.subject }); }
    if (flag) { flagged++; if (ok) flagCorrect++; else flagError++; }
  }
  return { accuracy: correct / n, correct, errors, flagged, flagCorrect, flagError, fb, missDetail };
}

// ── 3) GRID A: embedding gates (bands needs-review fixas nas atuais) ─────
const NR_NOW = { treeConfidence: X.CONFIG.needsReview.treeConfidence,
                 embeddingSimilarity: X.CONFIG.needsReview.embeddingSimilarity,
                 embeddingMargin: X.CONFIG.needsReview.embeddingMargin };
const G_NOW = { minSimilarity: X.CONFIG.embedding.minSimilarity,
                minMargin: X.CONFIG.embedding.minMargin,
                confirmMargin: X.CONFIG.embedding.confirmMargin };
const MIN_SIMS = [0.20, 0.22, 0.25, 0.28, 0.30, 0.32];
const MIN_MARS = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08];
const CONF_MARS = [0.02, 0.03, 0.04, 0.05];

const gateResults = [];
for (const minSimilarity of MIN_SIMS) for (const minMargin of MIN_MARS) for (const confirmMargin of CONF_MARS) {
  const r = simulate({ minSimilarity, minMargin, confirmMargin }, NR_NOW);
  gateResults.push(Object.assign(r, { minSimilarity, minMargin, confirmMargin }));
}
gateResults.sort((a, b) => b.accuracy - a.accuracy || Math.abs(b.flagError - b.errors) - Math.abs(a.flagError - a.errors) || a.flagCorrect - b.flagCorrect || a.flagged - b.flagged);
const best = gateResults[0];
const nowRes = gateResults.find(r => r.minSimilarity === G_NOW.minSimilarity && r.minMargin === G_NOW.minMargin && r.confirmMargin === G_NOW.confirmMargin);

console.log('# tune-gates — ' + n + ' mocks · ' + gateResults.length + ' combos de gates');
console.log('');
console.log('## Atual (Config.gs)');
console.log('gates ' + JSON.stringify(G_NOW) + ' → accuracy ' + (nowRes.accuracy * 100).toFixed(2) + '% (' + nowRes.correct + '/' + n + '), erros ' + nowRes.errors + ', flagged ' + nowRes.flagged + ' (ruído ' + nowRes.flagCorrect + ' / cobertura ' + nowRes.flagError + '/' + nowRes.errors + '), fallbacks ' + nowRes.fb);
console.log('');
console.log('## Top 10 combos de gates');
console.log('| minSim | minMar | confirmMar | accuracy | erros | flagged | ruído | cobertura | fallbacks |');
console.log('|---|---|---|---|---|---|---|---|---|');
gateResults.slice(0, 10).forEach(r => console.log('| ' + r.minSimilarity + ' | ' + r.minMargin + ' | ' + r.confirmMargin + ' | ' + (r.accuracy * 100).toFixed(2) + '% (' + r.correct + '/' + n + ') | ' + r.errors + ' | ' + r.flagged + ' | ' + r.flagCorrect + ' | ' + r.flagError + '/' + r.errors + ' | ' + r.fb + ' |'));
console.log('');

// ── 4) GRID B: bandas needs-review (gates fixos no melhor combo) ─────────
const bestG = { minSimilarity: best.minSimilarity, minMargin: best.minMargin, confirmMargin: best.confirmMargin };
const TREE_NRS = [0.85, 0.87, 0.90, 0.92, 0.95];
const SIM_NRS = [0.40, 0.45, 0.50, 0.55, 0.60];
const MAR_NRS = [0.10, 0.12, 0.15, 0.20, 0.25];
const bandResults = [];
for (const treeConfidence of TREE_NRS) for (const embeddingSimilarity of SIM_NRS) for (const embeddingMargin of MAR_NRS) {
  const r = simulate(bestG, { treeConfidence, embeddingSimilarity, embeddingMargin });
  bandResults.push(Object.assign(r, { treeConfidence, embeddingSimilarity, embeddingMargin }));
}
// objetivo: cobertura total dos erros (flagError === errors) com mínimo ruído
bandResults.sort((a, b) => Math.abs(a.flagError - a.errors) - Math.abs(b.flagError - b.errors) || a.flagCorrect - b.flagCorrect || a.flagged - b.flagged);
const bestBand = bandResults[0];
const nowBand = bandResults.find(r => r.treeConfidence === NR_NOW.treeConfidence && r.embeddingSimilarity === NR_NOW.embeddingSimilarity && r.embeddingMargin === NR_NOW.embeddingMargin);

console.log('## Bandas needs-review (gates fixos em ' + JSON.stringify(bestG) + ')');
console.log('atual ' + JSON.stringify(NR_NOW) + ' → ruído ' + nowBand.flagCorrect + ', cobertura ' + nowBand.flagError + '/' + nowBand.errors + ', flagged ' + nowBand.flagged);
console.log('');
console.log('| treeNR | simNR | marNR | ruído (flag ok) | cobertura (flag erro) | flagged |');
console.log('|---|---|---|---|---|---|');
bandResults.slice(0, 10).forEach(r => console.log('| ' + r.treeConfidence + ' | ' + r.embeddingSimilarity + ' | ' + r.embeddingMargin + ' | ' + r.flagCorrect + ' | ' + r.flagError + '/' + r.errors + ' | ' + r.flagged + ' |'));
console.log('');

// ── 5) RECOMENDAÇÃO ──────────────────────────────────────────────────────
console.log('## RECOMENDAÇÃO');
console.log('embedding.gates → minSimilarity: ' + bestG.minSimilarity + ', minMargin: ' + bestG.minMargin + ', confirmMargin: ' + bestG.confirmMargin);
console.log('needsReview    → treeConfidence: ' + bestBand.treeConfidence + ', embeddingSimilarity: ' + bestBand.embeddingSimilarity + ', embeddingMargin: ' + bestBand.embeddingMargin);
console.log('resultado esperado: accuracy ' + (bestBand.accuracy * 100).toFixed(2) + '% (' + bestBand.correct + '/' + n + '), erros ' + bestBand.errors + ', flagged ' + bestBand.flagged + ' (ruído ' + bestBand.flagCorrect + ', cobertura ' + bestBand.flagError + '/' + bestBand.errors + '), fallbacks ' + bestBand.fb);
if (bestBand.missDetail.length) {
  console.log('');
  console.log('misses no combo recomendado:');
  bestBand.missDetail.forEach(m => console.log('- ' + m.expected + ' → ' + m.got + ' :: ' + m.subject));
}
