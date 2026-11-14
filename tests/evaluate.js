/**
 * tests/evaluate.js — model quality report on the full mock dataset (~606 samples).
 * Runs the real hybrid pipeline (rules → tree → embeddings → fallback) with the
 * tuned default gates and prints/writes tests/evaluation-report.md:
 *   - overall accuracy + confusion matrix (all categories × all categories)
 *   - per-category precision / recall / F1
 *   - accuracy per language (EN/PT/ES) and per expected tier
 *   - source mix, top confusion pairs, full miss list
 * Run: node tests/evaluate.js
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
const { MOCK_EMAILS_23 } = require('./mock-dataset-23.js');
const { MOCK_EMAILS_24 } = require('./mock-dataset-24.js');
const { MOCK_EMAILS_25 } = require('./mock-dataset-25.js');
const { MOCK_EMAILS_26 } = require('./mock-dataset-26.js');
const { MOCK_EMAILS_27 } = require('./mock-dataset-27.js');
const ALL_MOCKS = MOCK_EMAILS.concat(MOCK_EMAILS_EXTRA).concat(MOCK_EMAILS_3)
  .concat(MOCK_EMAILS_4).concat(MOCK_EMAILS_5).concat(MOCK_EMAILS_6).concat(MOCK_EMAILS_7)
  .concat(MOCK_EMAILS_8).concat(MOCK_EMAILS_9).concat(MOCK_EMAILS_10).concat(MOCK_EMAILS_11)
  .concat(MOCK_EMAILS_12).concat(MOCK_EMAILS_13).concat(MOCK_EMAILS_14).concat(MOCK_EMAILS_15)
  .concat(MOCK_EMAILS_16).concat(MOCK_EMAILS_17).concat(MOCK_EMAILS_18).concat(MOCK_EMAILS_19)
  .concat(MOCK_EMAILS_20).concat(MOCK_EMAILS_21).concat(MOCK_EMAILS_22)
  .concat(MOCK_EMAILS_23).concat(MOCK_EMAILS_24).concat(MOCK_EMAILS_25)
  .concat(MOCK_EMAILS_26).concat(MOCK_EMAILS_27);

const FILES = ['Config.gs', 'Utils.gs', 'State.gs', 'EmbeddingClassifier.gs',
               'DecisionTree.gs', 'TreeModel.gs', 'GmailReader.gs',
               'Categorizer.gs', 'Labeler.gs', 'Trainer.gs', 'Main.gs'];
const source = FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n\n') +
  '\n;globalThis.__x = { CONFIG, CATEGORIES, FALLBACK_CATEGORY, State, EmbeddingClassifier,' +
  ' DecisionTree, GmailReader, Categorizer, Labeler, Trainer };';

function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function toyEmbed(text) {
  const DIM = 4096;
  const v = new Array(DIM).fill(0);
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  t.split(/[^a-z0-9]+/).forEach(function (w) { if (w.length >= 3) v[strHash(w) % DIM] += 1; });
  return v;
}
function resp(c, o) { return { getResponseCode: () => c, getContentText: () => JSON.stringify(o) }; }
const driveStore = {};
function makeFile(n) {
  return { getName: () => n, getBlob: () => ({ getDataAsString: () => driveStore[n] }),
           setContent: b => { driveStore[n] = (b && b.getDataAsString) ? b.getDataAsString() : String(b); } };
}
const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k === 'GEMINI_API_KEY' ? 'test-key' : null), setProperty: () => {} }) },
  UrlFetchApp: { fetch: (url, req) => {
    if (url.indexOf(':embedContent') !== -1) { const b = JSON.parse(req.payload); return resp(200, { embedding: { values: toyEmbed(b.content.parts[0].text) } }); }
    if (url.indexOf(':batchEmbedContents') !== -1) { const b = JSON.parse(req.payload); return resp(200, { embeddings: b.requests.map(r => ({ values: toyEmbed(r.content.parts[0].text) })) }); }
    return resp(400, {});
  } },
  DriveApp: { getFilesByName: n => ({ hasNext: () => driveStore[n] !== undefined, next: () => makeFile(n) }), createFile: b => { driveStore[b.getName()] = b.getDataAsString(); return makeFile(b.getName()); } },
  GmailApp: { getUserLabelByName: n => ({ getName: () => n }), createLabel: n => ({ getName: () => n }) },
  Utilities: { newBlob: (d, t, n) => ({ getDataAsString: () => d, getName: () => n, setContent: b => { driveStore[n] = b.getDataAsString(); } }), sleep: () => {} },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }) }) }), deleteTrigger: () => {} },
};
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'bundle.gs' });
const X = ctx.__x;
// Categories come from the live config (never hardcode: it drifts when
// categories like news/ads/shopping are added).
const CATS = X.CATEGORIES.map(function (c) { return c.id; }).concat([X.FALLBACK_CATEGORY.id]);
const cache = X.State.getSenderCache();
Object.keys(cache).forEach(k => delete cache[k]);

const rows = ALL_MOCKS.map(function (m) {
  const v = X.Categorizer.classify(m);
  return { expected: m.expected, got: v.category, source: v.source, lang: m.lang, tier: m.tier, subject: m.subject, nr: !!v.needsReview };
});

const n = rows.length;
const correct = rows.filter(r => r.expected === r.got).length;
const accuracy = correct / n;

const cm = {};
CATS.forEach(e => { cm[e] = {}; CATS.forEach(g => { cm[e][g] = 0; }); });
rows.forEach(r => { cm[r.expected][r.got]++; });

const perCat = CATS.map(function (c) {
  const tp = cm[c][c];
  const fp = rows.filter(r => r.got === c && r.expected !== c).length;
  const fn = rows.filter(r => r.expected === c && r.got !== c).length;
  const precision = (tp + fp) ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) ? 2 * precision * recall / (precision + recall) : 0;
  return { cat: c, n: tp + fn, tp: tp, precision: precision, recall: recall, f1: f1 };
});

function groupAccuracy(key) {
  const g = {};
  rows.forEach(function (r) { (g[r[key]] = g[r[key]] || []).push(r.expected === r.got); });
  return Object.keys(g).map(k => ({ key: k, n: g[k].length, acc: g[k].filter(Boolean).length / g[k].length }));
}
const byLang = groupAccuracy('lang');
const byTier = groupAccuracy('tier');
const bySrc = {};
rows.forEach(r => { bySrc[r.source] = (bySrc[r.source] || 0) + 1; });
const misses = rows.filter(r => r.expected !== r.got);
let md = '# Model Evaluation Report\n\n';
md += '- Dataset: **' + n + ' mock samples** (tests/mock-dataset*.js)\n';
md += '- Gates (src/Config.gs): minSimilarity=' + X.CONFIG.embedding.minSimilarity +
      ', minMargin=' + X.CONFIG.embedding.minMargin + ', confirmMargin=' + X.CONFIG.embedding.confirmMargin +
      ', tree minConfidence=' + X.CONFIG.decisionTree.minConfidence + '\n';
md += '- Embeddings: toy hashed bag-of-words (offline test model)\n\n';
md += '**Overall accuracy: ' + (accuracy * 100).toFixed(1) + '% (' + correct + '/' + n + ')**\n\n';
md += '## Confusion matrix (rows = expected, cols = predicted)\n\n';
md += '| expected \\ got | ' + CATS.join(' | ') + ' |\n';
md += '|' + CATS.map(() => '---').join('|') + '|\n';
CATS.forEach(function (e) {
  md += '| **' + e + '** | ' + CATS.map(g => (g === e ? '**' + cm[e][g] + '**' : (cm[e][g] ? cm[e][g] : '·'))) .join(' | ') + ' |\n';
});
md += '\n## Per-category metrics\n\n';
md += '| Category | Samples | Correct | Precision | Recall | F1 |\n|---|---:|---:|---:|---:|---:|\n';
perCat.forEach(function (p) {
  md += '| ' + p.cat + ' | ' + p.n + ' | ' + p.tp + ' | ' + (p.precision * 100).toFixed(0) + '% | ' +
        (p.recall * 100).toFixed(0) + '% | ' + (p.f1 * 100).toFixed(0) + '% |\n';
});
md += '\n## Needs-review flag metric (precision proxy)\n\n';
const flaggedRows = rows.filter(r => r.nr);
const unflaggedRows = rows.filter(r => !r.nr);
const errPct = set => set.length ? (100 * set.filter(r => r.expected !== r.got).length / set.length).toFixed(1) + '%' : 'n/a';
md += '- Flagged: **' + flaggedRows.length + '/' + rows.length + '** (' + (100 * flaggedRows.length / rows.length).toFixed(1) + '%)\n';
md += '- Error rate — **flagged**: ' + errPct(flaggedRows) + ' · **unflagged**: ' + errPct(unflaggedRows) + '\n';
md += '- A useful flag correlates with errors: the flagged error rate should exceed the unflagged one.\n\n';
md += '| Category (predicted) | Flagged | Samples | Flag rate |\n|---|---:|---:|---:|\n';
CATS.forEach(function (c) {
  const set = rows.filter(r => r.got === c);
  const f = set.filter(r => r.nr).length;
  md += '| ' + c + ' | ' + f + ' | ' + set.length + ' | ' + (set.length ? (100 * f / set.length).toFixed(1) + '%' : '—') + ' |\n';
});
md += '\n## Accuracy by language\n\n| Language | Samples | Correct | Accuracy |\n|---|---:|---:|---:|\n';
byLang.forEach(l => { md += '| ' + l.key.toUpperCase() + ' | ' + l.n + ' | ' + Math.round(l.acc * l.n) + ' | ' + (l.acc * 100).toFixed(1) + '% |\n'; });
md += '\n## Accuracy by tier and language\n\n';
const langs = ['en', 'pt', 'es'];
md += '| Tier | ' + langs.map(l => l.toUpperCase()).join(' | ') + ' | overall |\n|---|---|---|---|\n';
['rule', 'tree', 'embedding', 'any'].forEach(function (tier) {
  const cells = langs.map(function (l) {
    const set = rows.filter(r => r.tier === tier && r.lang === l);
    if (!set.length) return '·';
    const ok = set.filter(r => r.expected === r.got).length;
    return ok + '/' + set.length + ' (' + (100 * ok / set.length).toFixed(0) + '%)';
  });
  const all = rows.filter(r => r.tier === tier);
  const okAll = all.filter(r => r.expected === r.got).length;
  md += '| ' + tier + ' | ' + cells.join(' | ') + ' | ' + okAll + '/' + all.length + ' |\n';
});
md += '\n## Source mix\n\n';
Object.keys(bySrc).forEach(s => { md += '- `' + s + '`: ' + bySrc[s] + '\n'; });
md += '\n## Misses (' + misses.length + ')\n\n';
md += '| Expected | Got | Source | Lang | Subject |\n|---|---|---|---|---|\n';
misses.forEach(r => { md += '| ' + r.expected + ' | ' + r.got + ' | ' + r.source + ' | ' + r.lang + ' | ' + r.subject + ' |\n'; });
md += '\n## Top confusion pairs\n\n';
const pairs = {};
misses.forEach(r => { const k = r.expected + ' → ' + r.got; pairs[k] = (pairs[k] || 0) + 1; });
Object.keys(pairs).sort((a, b) => pairs[b] - pairs[a]).forEach(k => { md += '- ' + k + ': ' + pairs[k] + '\n'; });

fs.writeFileSync(path.join(__dirname, 'evaluation-report.md'), md);
console.log(md);



