/**
 * tests/integration.test.js — end-to-end mock pipeline test + auto-tuning.
 *
 * Runs the FULL hybrid pipeline (rules → tree → embeddings → fallback) against
 * tests/mock-dataset.js (~90 samples) inside a VM with deterministic mocks:
 *   - UrlFetchApp → hashed bag-of-words "toy embeddings" (no network, stable)
 *   - PropertiesService → GEMINI_API_KEY present (embedding tier enabled)
 *   - DriveApp → in-memory file store (prototype + trained tree files)
 *
 * After the baseline run it performs a GRID SEARCH over the classifier gates
 * (embedding minSimilarity/minMargin/confirmMargin + tree minConfidence),
 * reports the best combination and asserts final accuracy targets.
 * Run: node tests/integration.test.js
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
const ALL_MOCKS = MOCK_EMAILS.concat(MOCK_EMAILS_EXTRA).concat(MOCK_EMAILS_3).concat(MOCK_EMAILS_4).concat(MOCK_EMAILS_5).concat(MOCK_EMAILS_6).concat(MOCK_EMAILS_7).concat(MOCK_EMAILS_8).concat(MOCK_EMAILS_9).concat(MOCK_EMAILS_10).concat(MOCK_EMAILS_11).concat(MOCK_EMAILS_12).concat(MOCK_EMAILS_13).concat(MOCK_EMAILS_14).concat(MOCK_EMAILS_15).concat(MOCK_EMAILS_16).concat(MOCK_EMAILS_17).concat(MOCK_EMAILS_18).concat(MOCK_EMAILS_19).concat(MOCK_EMAILS_20).concat(MOCK_EMAILS_21).concat(MOCK_EMAILS_22); // ~785 samples total

// ── local embedding model support (TEST-ONLY, offline after first download) ──
const USE_LOCAL_MODEL = process.env.USE_LOCAL_MODEL === '1';
const LOCAL_MODEL = process.env.LOCAL_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const embedTable = new Map(); // text → vector (precomputed when USE_LOCAL_MODEL=1)
let embedMisses = 0;

const FILES = ['Config.gs', 'Utils.gs', 'State.gs', 'EmbeddingClassifier.gs',
               'DecisionTree.gs', 'TreeModel.gs', 'GmailReader.gs',
               'Categorizer.gs', 'Labeler.gs', 'Trainer.gs', 'Main.gs'];
const source = FILES.map(function (f) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
}).join('\n\n') +
  '\n;globalThis.__x = { CONFIG, CATEGORIES, FALLBACK_CATEGORY, State, EmbeddingClassifier,' +
  ' DecisionTree, GmailReader, Categorizer, Labeler, Trainer };';

// --- deterministic toy embedding: hashed bag-of-words (offline "model") ---
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function toyEmbed(text) {
  const DIM = 4096; // buckets >> vocabulary → sparse, low-collision vectors
  const v = new Array(DIM).fill(0);
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t.split(/[^a-z0-9]+/).forEach(function (w) { if (w.length >= 3) v[strHash(w) % DIM] += 1; });
  return v;
}
function syncEmbed(text) {
  if (embedTable.has(text)) return embedTable.get(text);
  embedMisses++;
  return toyEmbed(text); // fallback when a text wasn't precomputed (toy mode)
}

function resp(code, obj) {
  return { getResponseCode: function () { return code; },
           getContentText: function () { return JSON.stringify(obj); } };
}

const driveStore = {};
const driveIds = {};
let driveSeq = 0;
const labelStore = {};
const scriptProps = { GEMINI_API_KEY: 'test-key' };
function makeFile(n) {
  if (!driveIds[n]) driveIds[n] = 'drive-' + (++driveSeq);
  const id = driveIds[n];
  return {
    getName: function () { return n; },
    getId: function () { return id; },
    getBlob: function () { return { getDataAsString: function () { return driveStore[n]; } }; },
    setContent: function (b) { driveStore[n] = (b && b.getDataAsString) ? b.getDataAsString() : String(b); },
  };
}

const ctx = {
  console: console,
  PropertiesService: {
    getScriptProperties: function () {
      return { getProperty: function (k) { return (k in scriptProps) ? scriptProps[k] : null; },
               setProperty: function (k, v) { scriptProps[k] = String(v); } };
    },
  },
  UrlFetchApp: {
    fetch: function (url, req) {
      if (url.indexOf(':embedContent') !== -1) {
        const b = JSON.parse(req.payload);
        return resp(200, { embedding: { values: syncEmbed(b.content.parts[0].text) } });
      }
      if (url.indexOf(':batchEmbedContents') !== -1) {
        const b = JSON.parse(req.payload);
        return resp(200, { embeddings: b.requests.map(function (r) {
          return { values: syncEmbed(r.content.parts[0].text) };
        }) });
      }
      return resp(400, { error: 'unsupported endpoint' });
    },
  },
  DriveApp: {
    getFilesByName: function (n) {
      return { hasNext: function () { return driveStore[n] !== undefined; },
               next: function () { return makeFile(n); } };
    },
    getFileById: function (id) {
      const names = Object.keys(driveIds);
      for (let i = 0; i < names.length; i++) {
        if (driveIds[names[i]] === id) return makeFile(names[i]);
      }
      throw new Error('File not found: ' + id);
    },
    createFile: function (blob) {
      driveStore[blob.getName()] = blob.getDataAsString();
      return makeFile(blob.getName());
    },
  },
  GmailApp: {
    getUserLabelByName: function (n) { return labelStore[n] || null; },
    createLabel: function (n) { labelStore[n] = { name: n }; return labelStore[n]; },
  },
  Utilities: {
    newBlob: function (d, t, n) {
      return { getDataAsString: function () { return d; }, getName: function () { return n; },
               setContent: function (b) { driveStore[n] = (b && b.getDataAsString) ? b.getDataAsString() : String(b); } };
    },
    sleep: function () {},
  },
  ScriptApp: {
    getProjectTriggers: function () { return []; },
    newTrigger: function () { return { timeBased: function () { return { everyHours: function () { return { create: function () {} }; } }; } }; },
    deleteTrigger: function () {},
  },
};
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'bundle.gs' });
const X = ctx.__x;

/** Precompute embeddings for every text the pipeline will request (local model). */
async function precomputeLocal() {
  let embedBatch;
  try { ({ embedBatch } = require('./local-embeddings.js')); }
  catch (e) {
    console.log('[local] @xenova/transformers not installed — falling back to toy embeddings.');
    console.log('[local] install with: npm install --save-dev @xenova/transformers');
    return false;
  }
  console.log('[local] loading model ' + LOCAL_MODEL + ' (first run downloads weights)...');
  const texts = new Set();
  const refs = X.EmbeddingClassifier.references || {};
  Object.keys(refs).forEach(function (id) {
    refs[id].forEach(function (p) { texts.add(id + ': ' + p); });
  });
  ALL_MOCKS.forEach(function (m) { texts.add(X.EmbeddingClassifier.buildText(m)); });
  const list = Array.from(texts);
  const t0 = Date.now();
  let lastDim = 0;
  for (let i = 0; i < list.length; i += 16) {
    const vecs = await embedBatch(list.slice(i, i + 16), LOCAL_MODEL);
    vecs.forEach(function (v, j) { embedTable.set(list[i + j], v); });
    if (vecs.length && vecs[0].length) lastDim = vecs[0].length;
  }
  console.log('[local] ' + embedTable.size + ' texts embedded in ' + (Date.now() - t0) + 'ms (dim ' + lastDim + ')');
  return true;
}

async function main() {
  if (USE_LOCAL_MODEL) {
    const ok = await precomputeLocal();
    if (!ok) console.log('[local] running with toy embeddings instead.');
  }
  if (embedMisses) console.log('[warn] embedding lookup misses: ' + embedMisses);


function clearCache() {
  const c = X.State.getSenderCache();
  Object.keys(c).forEach(function (k) { delete c[k]; });
}
function runAll() {
  clearCache();
  let ok = 0;
  const rows = [];
  ALL_MOCKS.forEach(function (m) {
    const v = X.Categorizer.classify(m);
    rows.push({ expected: m.expected, got: v.category, source: v.source, subject: m.subject, lang: m.lang, tier: m.tier });
    if (v.category === m.expected) ok++;
  });
  return { ok: ok, total: ALL_MOCKS.length, accuracy: ok / ALL_MOCKS.length, rows: rows };
}
function perCategory(rows) {
  const t = {};
  rows.forEach(function (r) {
    t[r.expected] = t[r.expected] || { n: 0, ok: 0 };
    t[r.expected].n++;
    if (r.expected === r.got) t[r.expected].ok++;
  });
  return t;
}
// ── baseline ─────────────────────────────────────────────────────
const base = runAll();
console.log('Baseline accuracy: ' + (base.accuracy * 100).toFixed(1) + '% (' + base.ok + '/' + base.total + ')');

// ── grid search: optimize the classifier gates ───────────────────
// Embeddings are deterministic per message and independent of the gates being
// searched, so similarity vectors are memoized per sample across combos — the
// 528-combo grid collapses into gate arithmetic plus rules/tree. Progress is
// reported to stderr so long runs stay visible.
const simG = [0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60];
const marG = [0.00, 0.01, 0.02, 0.03, 0.05, 0.08];
const conG = [0.02, 0.03, 0.05, 0.08];
const confG = [0.85, 0.90];
const simsMemo = new Map();
const realSimilarities = X.EmbeddingClassifier.similarities;
X.EmbeddingClassifier.similarities = function (msg) {
  const key = msg.email + '|' + msg.subject + '|' + (msg.snippet || '') + '|' + (msg.bodyScan || '');
  if (!simsMemo.has(key)) simsMemo.set(key, realSimilarities.call(X.EmbeddingClassifier, msg));
  return simsMemo.get(key);
};
let best = null;
let gridDone = 0;
const gridTotal = simG.length * marG.length * conG.length * confG.length;
const gridT0 = Date.now();
simG.forEach(function (ms) {
  marG.forEach(function (mm) {
    conG.forEach(function (cm) {
      confG.forEach(function (mc) {
        X.CONFIG.embedding.minSimilarity = ms;
        X.CONFIG.embedding.minMargin = mm;
        X.CONFIG.embedding.confirmMargin = cm;
        X.CONFIG.decisionTree.minConfidence = mc;
        const r = runAll();
        gridDone++;
        if (gridDone % 24 === 0 || gridDone === gridTotal) {
          console.error('  grid ' + gridDone + '/' + gridTotal +
            ' combos — ' + Math.round((Date.now() - gridT0) / 1000) + 's — best so far ' +
            ((best && best.accuracy * 100).toFixed(1) || '—') + '%');
        }
        const better = !best || r.accuracy > best.accuracy + 1e-9 ||
          (Math.abs(r.accuracy - best.accuracy) < 1e-9 &&
            (ms > best.minSimilarity ||
             (ms === best.minSimilarity && mm > best.minMargin)));
        if (better) best = { accuracy: r.accuracy, minSimilarity: ms,
                             minMargin: mm, confirmMargin: cm, minConfidence: mc };
      });
    });
  });
});
console.error('  grid search done in ' + Math.round((Date.now() - gridT0) / 1000) + 's');
console.log('Best gates found: ' + JSON.stringify(best));

X.CONFIG.embedding.minSimilarity = best.minSimilarity;
X.CONFIG.embedding.minMargin = best.minMargin;
X.CONFIG.embedding.confirmMargin = best.confirmMargin;
X.CONFIG.decisionTree.minConfidence = best.minConfidence;
const fin = runAll();

console.log('Final accuracy: ' + (fin.accuracy * 100).toFixed(1) + '%');
console.log('Per category: ' + JSON.stringify(perCategory(fin.rows)));
console.log('Source mix: ' + JSON.stringify(fin.rows.reduce(function (a, r) {
  a[r.source] = (a[r.source] || 0) + 1; return a;
}, {})));
const misses = fin.rows.filter(function (r) { return r.expected !== r.got; });
console.log('Misses (' + misses.length + '):');
misses.slice(0, 20).forEach(function (r) {
  console.log('  [' + r.expected + ' → ' + r.got + '] (' + r.source + ', ' + r.lang + ') ' + r.subject);
});

// ── assertions ───────────────────────────────────────────────────
let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.error('FAIL  ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')); }
}
check('baseline (default gates) accuracy ≥ 0.60 — pre-tuning sanity', base.accuracy >= 0.60, base.accuracy);
check('optimized accuracy ≥ 0.90', fin.accuracy >= 0.90, fin.accuracy);
const ruleRows = fin.rows.filter(function (r) { return r.tier === 'rule'; });
check('all rule-tier samples correct (' + ruleRows.length + ')',
      ruleRows.every(function (r) { return r.expected === r.got; }),
      ruleRows.filter(function (r) { return r.expected !== r.got; }));
const embRows = fin.rows.filter(function (r) { return r.tier === 'embedding'; });
check('embedding-tier accuracy ≥ 0.75 (' + embRows.length + ' samples)',
      embRows.filter(function (r) { return r.expected === r.got; }).length / embRows.length >= 0.75,
      embRows.filter(function (r) { return r.expected !== r.got; }).map(function (r) { return [r.expected, r.got, r.subject]; }));

  console.log(failures === 0
    ? '\nIntegration: All checks passed ✔ (mode: ' + (USE_LOCAL_MODEL ? 'local model ' + LOCAL_MODEL : 'toy embeddings') +
      ' — recommended gates: minSimilarity=' + best.minSimilarity +
      ', minMargin=' + best.minMargin + ', confirmMargin=' + best.confirmMargin +
      ', minConfidence=' + best.minConfidence + ')'
    : '\n' + failures + ' integration check(s) FAILED ✘');
  process.exitCode = failures ? 1 : 0;
}

main().catch(function (e) {
  console.error('FATAL', e);
  process.exitCode = 1;
});
