/**
 * tests/sandbox.test.js — Node harness for the Apps Script modules.
 * Loads every src/*.gs into one VM context (globals shared like the Apps Script
 * runtime), mocks PropertiesService, and exercises the pure logic: header
 * parsing, domain matching, rule engine, tree features/evaluation, and the
 * full classify() path down to the uncategorized fallback.
 * Run: node tests/sandbox.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['Config.gs', 'Utils.gs', 'State.gs', 'EmbeddingClassifier.gs',
               'DecisionTree.gs', 'TreeModel.gs', 'GmailReader.gs',
               'Categorizer.gs', 'Labeler.gs', 'Trainer.gs', 'Tuner.gs', 'Main.gs'];

let source = FILES.map(function (f) {
  return fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
}).join('\n\n');

source += '\n;globalThis.__x = { CONFIG, CATEGORIES, FALLBACK_CATEGORY, Utils, State,' +
          ' EmbeddingClassifier, DecisionTree, GmailReader, Categorizer, Labeler, Trainer,' +
          ' Tuner,' +
          ' runPipeline: runPipeline, setupTrigger: setupTrigger, processNewEmails: processNewEmails,' +
          ' runReprocessCards: runReprocessCards,' +
          ' needsReviewReport: needsReviewReport, reprocessNeedsReview: reprocessNeedsReview,' +
          ' retriageUncategorized: retriageUncategorized, reprocessProcessed: reprocessProcessed,' +
          ' reprocessProcessedStatus: reprocessProcessedStatus,' +
          ' runFullFlow: runFullFlow, analyzeUncategorized: analyzeUncategorized,' +
          ' runWeeklyTuner: runWeeklyTuner, tunerStatus: tunerStatus,' +
          ' setupWeeklyTuner: setupWeeklyTuner, removeWeeklyTuner: removeWeeklyTuner };';

const sleepLog = [];        // every Utilities.sleep(ms) recorded here
const searchCalls = [];     // { offset, max } per GmailApp.search call
const triggerRec = { list: [] }; // installed triggers
const propsStore = {};      // Script Properties backing store

const ctx = {
  console: console,
  PropertiesService: {
    getScriptProperties: function () {
      return { getProperty: function (k) { return (k in propsStore) ? propsStore[k] : null; },
               setProperty: function (k, v) { propsStore[k] = String(v); } };
    },
  },
  Utilities: {
    sleep: function (ms) { sleepLog.push(ms); },
    newBlob: function (d, t, n) {
      return { getDataAsString: function () { return String(d); },
               getName: function () { return n; },
               setContent: function (c) { d = String(c); } };
    },
  },
  ScriptApp: {
    getProjectTriggers: function () { return triggerRec.list; },
    deleteTrigger: function (t) {
      const i = triggerRec.list.indexOf(t);
      if (i >= 0) triggerRec.list.splice(i, 1);
    },
    WeekDay: { MONDAY: 'MONDAY', TUESDAY: 'TUESDAY', WEDNESDAY: 'WEDNESDAY',
               THURSDAY: 'THURSDAY', FRIDAY: 'FRIDAY', SATURDAY: 'SATURDAY',
               SUNDAY: 'SUNDAY' },
    newTrigger: function (fn) {
      const t = { handler: fn, hours: null, minutes: null, days: null, hour: null,
                  getHandlerFunction: function () { return this.handler; } };
      triggerRec.list.push(t);
      return {
        timeBased: function () {
          return {
            everyHours: function (h) { t.hours = h; return { create: function () {} }; },
            everyMinutes: function (m) { t.minutes = m; return { create: function () {} }; },
            everyDays: function (d) {
              t.days = d;
              return { atHour: function (hh) { t.hour = hh; return { create: function () {} }; },
                       create: function () {} };
            },
            everyWeeks: function (w) {
              t.weeks = w;
              return {
                onWeekDay: function (d) {
                  t.weekDay = d;
                  return { atHour: function (hh) { t.hour = hh; return { create: function () {} }; },
                           create: function () {} };
                },
                create: function () {},
              };
            },
          };
        },
      };
    },
  },
  GmailApp: {
    getUserLabelByName: function (n) { return labelStore[n] || null; },
    createLabel: function (n) {
      labelStore[n] = { name: n };
      return labelStore[n];
    },
    search: function (q, offset, max) {
      searchCalls.push({ q: q, offset: offset, max: max });
      return searchPages.shift() || [];
    },
  },
};
const labelStore = {};
const searchPages = []; // queue of thread pages consumed by GmailApp.search
vm.createContext(ctx);
vm.runInContext(source, ctx, { filename: 'bundle.gs' });

const X = ctx.__x;
let failures = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); }
  else { failures++; console.error('FAIL  ' + name + (detail ? ' — ' + JSON.stringify(detail) : '')); }
}

// — Utils.parseFromHeader —
let p = X.Utils.parseFromHeader('"Jane Smith" <JANE@Acme.COM>');
check('parse: quoted name + case-fold', p.email === 'jane@acme.com' && p.name === 'Jane Smith' && p.domain === 'acme.com', p);
p = X.Utils.parseFromHeader('plain@x.com');
check('parse: bare address → name from local part', p.email === 'plain@x.com' && p.name === 'plain', p);
check('matchesDomain: subdomain', X.Utils.matchesDomain('mail.linkedin.com', 'linkedin.com') === true);
check('matchesDomain: no false suffix', X.Utils.matchesDomain('notlinkedin.com', 'linkedin.com') === false);

// — Categorizer.categorizeByRules (priority order) —
const R = X.Categorizer.categorizeByRules;
check('rules: finance domain', R({ domain: 'nubank.com.br', name: '', subject: 'Sua fatura', snippet: '' }).category === 'finance');
check('rules: linkedin pessoal sem vaga → social (proxy genérico removido)', R({ domain: 'linkedin.com', name: 'Jane Smith via LinkedIn', subject: 'hi', snippet: '' }).category === 'social');
check('rules: social domain', R({ domain: 'x.com', name: 'X', subject: 'alert', snippet: '' }).category === 'social');
check('rules: work keyword', R({ domain: 'acme.com', name: 'Jane', subject: 'Q3 planning meeting', snippet: '' }).category === 'work');
check('rules: no match → null', R({ domain: 'unknown.tld', name: 'Jo', subject: 'oi', snippet: 'tudo bem' }) === null);

// — Rules: promoted domains + new shopping category —
check('rules: shopping domain (shopee)', R({ domain: 'mail.shopee.com.br', name: 'Shopee', subject: 'Seu pedido foi enviado', snippet: '' }).category === 'shopping');
check('rules: shopping keyword from unknown store', R({ domain: 'unknown-store.com', name: 'Loja', subject: 'Seu pedido saiu para entrega', snippet: '' }).category === 'shopping');
check('rules: shopping beats newsletters for marketplace domain', R({ domain: 'shein.com', name: 'SHEIN', subject: 'Promo com unsubscribe no rodapé', snippet: 'unsubscribe' }).category === 'shopping');
check('rules: finance promoted domain (itau) + pix', R({ domain: 'itau.com.br', name: 'Itaú', subject: 'PIX recebido', snippet: '' }).category === 'finance');
check('rules: work SaaS domain (github PR)', R({ domain: 'github.com', name: 'GitHub', subject: 'Pull request #12 ready', snippet: '' }).category === 'work');

// — Rules: AI full-stack stack (work expansion: AI/LLM + infra domains) —
check('rules: AI provider (anthropic/claude)', R({ domain: 'anthropic.com', name: 'Anthropic', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: AI provider subdomain (email.ollama.com)', R({ domain: 'email.ollama.com', name: 'Ollama', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: AI infra (huggingface)', R({ domain: 'huggingface.co', name: 'Hugging Face', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: data service (redis.com)', R({ domain: 'redis.com', name: 'Redis', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: secrets (doppler)', R({ domain: 'doppler.com', name: 'Doppler', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: BaaS (supabase)', R({ domain: 'supabase.com', name: 'Supabase', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: observability (sentry)', R({ domain: 'sentry.io', name: 'Sentry', subject: 'Notification', snippet: '' }).category === 'work');
check('rules: work keyword merge request (unknown CI)', R({ domain: 'ci.corp.dev', name: 'CI Bot', subject: 'Merge request !42 approved', snippet: '' }).category === 'work');
check('rules: work keyword deployment (unknown host)', R({ domain: 'buildsys.dev', name: 'Build System', subject: 'Deployment succeeded for api-gateway', snippet: '' }).category === 'work');
check('rules: precedence — openai maintenance stays servicos (not work)', R({ domain: 'openai.com', name: 'OpenAI', subject: 'OpenAI: scheduled maintenance of the API', snippet: 'Expect brief interruptions.' }).category === 'servicos');
check('rules: social promoted domain (tiktok)', R({ domain: 'tiktok.com', name: 'TikTok', subject: 'Novas curtidas', snippet: '' }).category === 'social');

// — Rules: news + ads categories —
check('rules: news domain (nytimes)', R({ domain: 'nytimes.com', name: 'The New York Times', subject: 'Breaking news update', snippet: '' }).category === 'news');
check('rules: news keyword from unknown outlet', R({ domain: 'unknown-press.co', name: 'The Ledger', subject: 'Top headlines for your morning', snippet: '' }).category === 'news');
check('rules: news keyword PT (ultimas noticias)', R({ domain: 'portal-x.com.br', name: 'Portal X', subject: 'Ultimas noticias do dia', snippet: '' }).category === 'news');
check('rules: ads keyword (desconto/cupom)', R({ domain: 'lojaqualquer.com.br', name: 'Loja', subject: 'Cupom de desconto: 20%', snippet: '' }).category === 'ads');
check('rules: ads keyword EN (promo code)', R({ domain: 'brand-outfits.com', name: 'Brand', subject: 'Your promo code is here', snippet: '' }).category === 'ads');
check('rules: BR newsletter keyword (boletim)', R({ domain: 'clubedolivro.com.br', name: 'Clube do Livro', subject: 'Boletim literário: lançamentos do mês', snippet: '' }).category === 'newsletters');
check('rules: shopping domain beats ads keyword (shein cupom)', R({ domain: 'shein.com', name: 'SHEIN', subject: 'Cupom de 15%', snippet: '' }).category === 'shopping');

// — Rules: promovidas pela análise do mailbox real (analyzeUncategorized) —
check('rules: ads BR promo (zoom cashback)', R({ domain: 'ofertas.zoom.com.br', name: 'Zoom', subject: 'Cashback em dobro na Black Friday', snippet: '' }).category === 'ads');
check('rules: ads BR promo (smiles shopping)', R({ domain: 'mail.smiles.com.br', name: 'Smiles', subject: 'Oportunidades especiais', snippet: '' }).category === 'ads');
check('rules: ads global (idi black november)', R({ domain: 'idi.com.br', name: 'IDI', subject: '63% OFF na Black November', snippet: '' }).category === 'ads');
check('rules: ads telecom (vivo purple friday)', R({ domain: 'mail.vivo.com.br', name: 'Vivo', subject: 'VIP às ofertas de Purple Friday', snippet: '' }).category === 'ads');
check('rules: ads hosting (hostinger oferta)', R({ domain: 'emails.hostinger.com', name: 'Hostinger', subject: 'sua oferta de E-mail profissional', snippet: '' }).category === 'ads');
check('rules: ads cashback (meliuz 11.11)', R({ domain: 'meliuz.com.br', name: 'Méliuz', subject: '11.11: até 20% cashback', snippet: '' }).category === 'ads');
check('rules: news AI digest (alphasignal)', R({ domain: 'alphasignal.ai', name: 'AlphaSignal', subject: 'Claude Fable solves physics', snippet: '' }).category === 'news');
check('rules: news BR tech media (mittechreview)', R({ domain: 'mittechreview.com.br', name: 'MIT Tech Review', subject: 'The Download', snippet: '' }).category === 'news');
check('rules: news sports (mlssoccer)', R({ domain: 'fanmail.mlssoccer.com', name: 'MLS', subject: 'Messi claims Golden Boot', snippet: '' }).category === 'news');
check('rules: newsletters product updates (google)', R({ domain: 'google.com', name: 'Google', subject: 'Introducing Gemini 4 Carbon', snippet: '' }).category === 'newsletters');
check('rules: newsletters dev (freecodecamp)', R({ domain: 'freecodecamp.org', name: 'freeCodeCamp', subject: 'Learn Vector Databases', snippet: '' }).category === 'newsletters');
check('rules: newsletters tool (cloudhq)', R({ domain: 'cloudhq.net', name: 'cloudHQ', subject: 'backup and sync setup', snippet: '' }).category === 'newsletters');
check('rules: job platforms (rocketship/jobgether/alignerr)', (function () {
  return R({ domain: 'remoterocketship.com', name: 'RR', subject: 'Supercharge your job search', snippet: '' }).category === 'job-search' &&
         R({ domain: 'jobgether.com', name: 'Jobgether', subject: 'New remote roles', snippet: '' }).category === 'job-search' &&
         R({ domain: 'alignerr.com', name: 'Alignerr', subject: 'Paid AI coding work', snippet: '' }).category === 'job-search';
})());
check('rules: job ATS/offer (ashby/mercor)', (function () {
  return R({ domain: 'ashbyhq.com', name: 'Ashby', subject: 'Your application', snippet: '' }).category === 'job-search' &&
         R({ domain: 'mercor.com', name: 'Mercor', subject: 'An update on your offer', snippet: '' }).category === 'job-search';
})());
check('rules: job BR (revelo)', R({ domain: 'revelo.com', name: 'Revelo', subject: 'Invitation closes soon', snippet: '' }).category === 'job-search');
check('rules: finance corretora (xp)', R({ domain: 'info.xpi.com.br', name: 'XP', subject: 'seleção personalizada de investimentos', snippet: '' }).category === 'finance');
check('rules: finance bureau (serasa/foregon)', (function () {
  return R({ domain: 'serasaexperian.com.br', name: 'Serasa', subject: 'Seu cadastro CNPJ', snippet: '' }).category === 'finance' &&
         R({ domain: 'foregon.com', name: 'Foregon', subject: 'limite de crédito', snippet: '' }).category === 'finance';
})());
check('rules: finance banco digital (inter)', R({ domain: 'comunicacao.inter.co', name: 'Inter', subject: 'reserva em dólar', snippet: '' }).category === 'finance');
check('rules: shopping BR lojas (clubeextra/hirotafood)', (function () {
  return R({ domain: 'clubeextra.com.br', name: 'Clube Extra', subject: 'Contamos com seu voto', snippet: '' }).category === 'shopping' &&
         R({ domain: 'hirotafood.com.br', name: 'Hirota', subject: 'Hirota Fest', snippet: '' }).category === 'shopping';
})());
check('rules: work deploy (vercel)', R({ domain: 'vercel.com', name: 'Vercel', subject: 'Production deployment failed', snippet: '' }).category === 'work');
check('rules: social comunidade BR (bandmix)', R({ domain: 'bandmix.com.br', name: 'BandMix', subject: 'novos músicos perto de você', snippet: '' }).category === 'social');

// — Rules: BR e-commerce marketplaces + BR ESP newsletters —
check('rules: BR marketplace (carrefour)', R({ domain: 'carrefour.com.br', name: 'Carrefour', subject: 'Seu pedido Carrefour foi confirmado', snippet: '' }).category === 'shopping');
check('rules: BR legacy domain (lojasamericanas)', R({ domain: 'lojasamericanas.com.br', name: 'Americanas', subject: 'Pedido em separação', snippet: '' }).category === 'shopping');
check('rules: BR keyword (saiu para entrega)', R({ domain: 'pontofrio.com.br', name: 'Ponto Frio', subject: 'Saiu para entrega: chega hoje', snippet: '' }).category === 'shopping');
check('rules: BR keyword (compra realizada)', R({ domain: 'casadositio.com.br', name: 'Casa do Sítio', subject: 'Compra realizada com sucesso', snippet: '' }).category === 'shopping');
check('rules: BR store promo stays shopping (domain beats ads keyword)', R({ domain: 'renner.com.br', name: 'Renner', subject: 'Promoção Renner: desconto de 30%', snippet: '' }).category === 'shopping');
check('rules: BR ESP newsletter (rdstation)', R({ domain: 'rdstation.com.br', name: 'RD Station', subject: 'Novidades RD Station: guia de email marketing', snippet: '' }).category === 'newsletters');
check('rules: BR ESP newsletter (e-goi)', R({ domain: 'e-goi.net', name: 'E-goi', subject: 'Novos templates para suas campanhas', snippet: '' }).category === 'newsletters');
check('rules: BR newsletter keyword (boletim)', R({ domain: 'clubedolivro.com.br', name: 'Clube do Livro', subject: 'Boletim literário: lançamentos do mês', snippet: '' }).category === 'newsletters');

// — DecisionTree —
const T = X.DecisionTree;
check('tree: model loads from TreeModel.gs', !!T.loadModel());
check('tree: recruiter InMail branch', (function () {
  const v = T.evaluate({ has_unsubscribe: 1, via_linkedin_name: 1, job_signal: 1 });
  return v && v.category === 'job-search' && v.confidence >= 0.85;
})(), T.evaluate({ has_unsubscribe: 1, via_linkedin_name: 1, job_signal: 1 }));
check('tree: grassroots newsletter leaf (0.85 passes gate)', (function () {
  const v = T.evaluate({ has_unsubscribe: 1, via_linkedin_name: 0, is_reply: 0,
                         job_signal: 0, sender_free_domain: 1, many_recipients: 1 });
  return v && v.category === 'newsletters' && v.confidence >= X.CONFIG.decisionTree.minConfidence;
})());
check('tree: inconclusive → null (defers downstream)', T.evaluate({ has_unsubscribe: 1, is_reply: 1 }) === null);
check('tree: all-zero → null', T.evaluate({}) === null);
check('tree: ads leaf via ads_signal (EN corporate path + buildFeatures wiring)', (function () {
  const msg = { domain: 'stylecrate.com', name: 'StyleCrate', subject: 'Member savings inside',
                snippet: 'Open to view your picks.',
                bodyScan: 'flash sale — limited time offer, shop now and save big on everything' };
  const feats = T.buildFeatures(msg);
  if (feats.ads_signal !== 1) return false;
  const v = T.evaluate(feats);
  return v && v.category === 'ads' && v.confidence >= X.CONFIG.decisionTree.minConfidence;
})());
check('tree: news leaf via news_signal (PT non-money path)', (function () {
  const v = T.evaluate({ lang_pt: 1, bulk_pt: 0, job_pt: 0, money_pt: 0, news_signal: 1 });
  return v && v.category === 'news' && v.confidence >= X.CONFIG.decisionTree.minConfidence;
})());

// — DecisionTree.buildFeatures —
const f = T.buildFeatures({ domain: 'indeed.com', name: 'Indeed', subject: 'Job alert: 5 new jobs', snippet: '', attachmentCount: 0, toCount: 0 });
check('features: keyword + composite flags', f.kw_job_alert === 1 && f.job_signal === 1 && f['dom_indeed.com'] === 1, f);
const f2 = T.buildFeatures({ domain: 'gmail.com', name: 'Jo', subject: 'Re: oi', snippet: 'unsubscribe here', attachmentCount: 1, toCount: 5 });
check('features: structural flags', f2.is_reply === 1 && f2.has_unsubscribe === 1 && f2.sender_free_domain === 1 && f2.many_recipients === 1 && f2.has_attachment === 1, f2);

// — Categorizer.classify end-to-end (no API key → rules → tree → fallback) —
const c1 = X.Categorizer.classify({ email: 'NaORESPONDA@NuBANK.com.br', name: 'Nubank', domain: 'nubank.com.br', subject: 'Sua fatura', snippet: '' });
check('classify: rule verdict', c1.category === 'finance' && c1.source === 'rule', c1);
const c2 = X.Categorizer.classify({ email: 'naoresponda@nubank.com.br', name: 'Nubank', domain: 'nubank.com.br', subject: 'Sua fatura', snippet: '' });
check('classify: sender cache hit', c2.source === 'cache' && c2.category === 'finance', c2);
const c3 = X.Categorizer.classify({ email: 'grass@gmail.com', name: 'Jornal da Vila', domain: 'gmail.com', subject: 'Edição 12', snippet: 'notícias da vila para você e mais 400 assinantes', bodyScan: 'notícias da vila para você e mais 400 assinantes … rodapé: não quer mais receber? unsubscribe aqui', attachmentCount: 0, toCount: 400 });
check('classify: tree verdict via bodyScan (rules missed the footer)', c3.source === 'tree' && c3.category === 'newsletters', c3);
const c4 = X.Categorizer.classify({ email: 'jo@unknown.tld', name: 'Jo', domain: 'unknown.tld', subject: 'oi', snippet: 'tudo bem' });
check('classify: fallback (no key) is uncategorized + not cached', c4.category === 'uncategorized' && c4.source === 'fallback', c4);
check('classify: fallback NOT cached', X.State.getSenderCache()['jo@unknown.tld'] === undefined);

// — Needs-review flagging (precision metric: CONFIG.needsReview bands) —
check('flag: rule verdict never flagged', c1.needsReview === false, c1);
check('flag: low-confidence tree verdict flagged (grassroots 0.85 leaf)', c3.needsReview === true, c3);
check('flag: fallback always flagged', c4.needsReview === true, c4);
check('flag: cache hit replays the stored flag', (function () {
  const again = X.Categorizer.classify({ email: 'grass@gmail.com', name: 'Jornal da Vila', domain: 'gmail.com', subject: 'Edição 12', snippet: 'notícias da vila para você e mais 400 assinantes', bodyScan: 'x', attachmentCount: 0, toCount: 400 });
  return again.source === 'cache' && again.category === 'newsletters' && again.needsReview === true;
})());
check('flag: cache entry shape is {c, nr, t}', (function () {
  const e = X.State.getSenderCache()['grass@gmail.com'];
  return e && e.c === 'newsletters' && e.nr === 1;
})());

// — Needs-review flagging on embedding verdicts (stubbed similarities) —
(function () {
  const realSims = X.EmbeddingClassifier.similarities;
  const base = { name: 'Mystery Sender', domain: 'example.com', subject: 'mystery weekly', snippet: '', bodyScan: '', attachmentCount: 0, toCount: 0 };
  X.EmbeddingClassifier.similarities = function () { return { newsletters: 0.62, finance: 0.31, work: 0.30 }; };
  const strong = X.Categorizer.classify(Object.assign({}, base, { email: 'strong@example.com' }));
  X.EmbeddingClassifier.similarities = function () { return { newsletters: 0.30, finance: 0.05 }; };
  const weakSim = X.Categorizer.classify(Object.assign({}, base, { email: 'weaksim@example.com' }));
  X.EmbeddingClassifier.similarities = function () { return { newsletters: 0.50, finance: 0.44 }; };
  const weakMargin = X.Categorizer.classify(Object.assign({}, base, { email: 'weakmargin@example.com' }));
  X.EmbeddingClassifier.similarities = realSims;
  check('flag: strong embedding verdict not flagged', strong.source === 'embedding' && strong.needsReview === false, strong);
  check('flag: low-similarity embedding verdict flagged', weakSim.needsReview === true, weakSim);
  check('flag: low-margin embedding verdict flagged', weakMargin.needsReview === true, weakMargin);
  check('flag: cached embedding verdict keeps its flag', (function () {
    const hit = X.Categorizer.classify(Object.assign({}, base, { email: 'weaksim@example.com' }));
    return hit.source === 'cache' && hit.needsReview === true;
  })());
  // — Sender cache TTL (CONFIG.senderCacheTtlDays; 0 = keep forever) —
  (function () {
    const prevTtl = X.CONFIG.senderCacheTtlDays;
    const DAY = 24 * 60 * 60 * 1000;

    // fresh entry → cache hit
    X.State.cacheSender('fresh@example.com', 'finance', false);
    const fresh = X.Categorizer.classify({ email: 'fresh@example.com', name: 'F', domain: 'x.com', subject: 'q', snippet: '' });
    check('ttl: fresh entry reads as cache hit', fresh.source === 'cache' && fresh.category === 'finance', fresh);

    // entry older than the TTL + old category + fresh verdict is only a
    // fallback (unknown sender, no rule/tree/embedding) → keeps serving the OLD
    // category, FLAGGED (never degrades to uncategorized); the newest model
    // re-tries it after the TTL
    X.State.getSenderCache()['old@example.com'] = { c: 'finance', nr: 0, t: Date.now() - 31 * DAY };
    const old = X.Categorizer.classify({ email: 'old@example.com', name: 'O', domain: 'unknown.tld', subject: 'oi', snippet: '' });
    check('ttl: expired entry + fallback keeps the old category, flagged',
          old.source === 'cache' && old.category === 'finance' && old.needsReview === true, old);

    // legacy string entry (no timestamp) = age unknown → same protection
    X.State.getSenderCache()['legacy@example.com'] = 'finance';
    const legacy = X.Categorizer.classify({ email: 'legacy@example.com', name: 'L', domain: 'unknown.tld', subject: 'oi', snippet: '' });
    check('ttl: legacy string entry + fallback keeps the old category, flagged',
          legacy.source === 'cache' && legacy.category === 'finance' && legacy.needsReview === true, legacy);

    // save drops entries that expired WITHOUT being re-classified; entries
    // re-classified on expiry are re-stamped with a fresh timestamp
    X.State.getSenderCache()['stale-only@example.com'] = { c: 'finance', nr: 0, t: Date.now() - 31 * DAY };
    X.State.saveSenderCache();
    const stored = JSON.parse(propsStore.SENDER_CACHE || '{}');
    check('ttl: saveSenderCache drops expired (non-reclassified) entries',
          !stored['stale-only@example.com'], stored);
    check('ttl: expired-then-reclassified entry re-stamped with fresh timestamp',
          stored['old@example.com'] && stored['old@example.com'].t > Date.now() - 60000, stored);

    // TTL disabled (0) → nothing expires; legacy entries read as unflagged
    X.CONFIG.senderCacheTtlDays = 0;
    X.State.getSenderCache()['legacy@example.com'] = 'finance';
    const kept = X.Categorizer.classify({ email: 'legacy@example.com', name: 'L', domain: 'x.com', subject: 'q', snippet: '' });
    check('ttl: disabled (0) → legacy string entry reads as unflagged cache hit',
          kept.source === 'cache' && kept.category === 'finance' && kept.needsReview === false, kept);
    X.CONFIG.senderCacheTtlDays = prevTtl;
  })();
})();

// — Labeler (GmailApp mocked above) —
const applied = [];
const th = { addLabel: function (l) { applied.push(l.name); } };
const labeledCount = X.Labeler.applyToBatch([
  { rec: { email: 'a@x.com', _thread: th }, category: 'finance', source: 'rule' },
  { rec: { email: 'b@x.com', _thread: th }, category: 'uncategorized', source: 'fallback' },
  { rec: { email: 'c@x.com', _thread: th }, category: 'news', source: 'embedding', needsReview: true },
]);
check('labeler: category + processed labels applied',
      labeledCount === 3 && applied.indexOf('GMO/finance') !== -1 &&
      applied.indexOf('GMO/news') !== -1 && applied.indexOf('GMO/Processed') !== -1, applied);
check('labeler: needs-review on fallback AND flagged verdicts (not on plain rule)',
      applied.filter(function (n) { return n === 'GMO/needs-review'; }).length === 2, applied);
check('labeler: full label tree created on demand',
      !!labelStore['GMO/newsletters'] && !!labelStore['GMO/job-search'] &&
      !!labelStore['GMO/spam-trash'] && !!labelStore['GMO/uncategorized'] &&
      !!labelStore['GMO/Processed'] && !!labelStore['GMO/needs-review']);

// — Needs-review precision metric (needsReviewReport) —
(function () {
  const t = function () {};
  // Query order: processed, needs-review, then per category (total, flagged).
  searchPages.push([t, t, t, t, t]);  // processed = 5
  searchPages.push([t, t]);           // flagged = 2
  searchPages.push([t, t, t]);        // spam-trash total = 3
  searchPages.push([t]);              // spam-trash flagged = 1
  searchPages.push([]);               // shopping total = 0
  searchPages.push([]);               // shopping flagged = 0
  // remaining per-category queries default to []
  const rep = X.needsReviewReport();
  check('metric: report counts flagged vs processed', !!rep && rep.processed === 5 &&
        rep.flagged === 2 && rep.rows.length === X.CATEGORIES.length, rep);
  check('metric: precision proxy = (processed − flagged) / processed', rep.precisionProxy === 60, rep);
  check('metric: per-category rows carry flag counts', rep.rows[0].category === 'spam-trash' &&
        rep.rows[0].total === 3 && rep.rows[0].flagged === 1 && rep.rows[0].flagRatePct === 33.3, rep.rows[0]);
})();

// — Needs-review re-triage (a versão mais nova do modelo recategoriza) —
(function () {
  function mkLabel(name, bag) {
    return { name: name,
             remove: function () { const i = bag.indexOf(name); if (i >= 0) bag.splice(i, 1); } };
  }
  function mkNrThread(id, email, labels, subject) {
    const bag = labels.slice();
    const msg = {
      getFrom: function () { return 'Sender <' + email + '>'; },
      getSubject: function () { return subject || 'Sua fatura de janeiro'; },
      getPlainBody: function () { throw new Error('no body'); },
      getAttachments: function () { return []; },
      getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
      getTo: function () { return 'me@gmail.com'; },
      getCc: function () { return ''; },
    };
    const th = {
      getId: function () { return id; },
      getLabels: function () {
        return bag.map(function (n) {
          return { name: n,
                   getName: function () { return n; },
                   remove: function () { const i = bag.indexOf(n); if (i >= 0) bag.splice(i, 1); } };
        });
      },
      addLabel: function (l) { if (bag.indexOf(l.name) === -1) bag.push(l.name); },
      removeLabel: function (l) { const i = bag.indexOf(l.name); if (i >= 0) bag.splice(i, 1); },
      getPermalink: function () { return 'permalink-' + id; },
      getMessages: function () { return [msg]; },
    };
    return th;
  }
  const names = function (th) { return th.getLabels().map(function (l) { return l.name; }); };

  // confiante: regra finance resolvida na re-triagem → troca labels, tira needs-review
  const resolvedThread = mkNrThread('nr1', 'uncertain@nubank.com.br',
    ['GMO/uncategorized', 'GMO/needs-review', 'GMO/Processed']);
  searchPages.push([resolvedThread]);
  const rep = X.reprocessNeedsReview(5);
  check('re-triage: confident re-verdict resolves the thread', rep.scanned === 1 && rep.resolved === 1, rep);
  check('re-triage: labels swapped, needs-review dropped, processed kept',
        names(resolvedThread).indexOf('GMO/finance') !== -1 &&
        names(resolvedThread).indexOf('GMO/needs-review') === -1 &&
        names(resolvedThread).indexOf('GMO/uncategorized') === -1 &&
        names(resolvedThread).indexOf('GMO/Processed') !== -1, names(resolvedThread));
  check('re-triage: fresh verdict overwrote the cache (unflagged)', (function () {
    const e = X.State.getSenderCache()['uncertain@nubank.com.br'];
    return e && e.c === 'finance' && e.nr === 0;
  })());

  // ainda incerto: sem regra/confiança → tag mantida + processed garantido
  const stillThread = mkNrThread('nr2', 'still@unknown.tld',
    ['GMO/uncategorized', 'GMO/needs-review', 'GMO/Processed'], 'oi');
  searchPages.push([stillThread]);
  const rep2 = X.reprocessNeedsReview(5);
  check('re-triage: still-uncertain keeps the tag (processed guaranteed)',
        rep2.resolved === 0 &&
        names(stillThread).indexOf('GMO/needs-review') !== -1 &&
        names(stillThread).indexOf('GMO/Processed') !== -1 &&
        names(stillThread).indexOf('GMO/uncategorized') !== -1, rep2);
  check('re-triage: still-uncertain sender cache untouched', (function () {
    const e = X.State.getSenderCache()['still@unknown.tld'];
    return e === undefined;
  })());
})();

// — reprocessProcessed: batch de re-triagem dos JÁ PROCESSADOS —
(function () {
  function mkLabel(name, bag) {
    return { name: name,
             getName: function () { return name; },
             remove: function () { const i = bag.indexOf(name); if (i >= 0) bag.splice(i, 1); } };
  }
  function mkProcThread(id, email, labels, subject) {
    const bag = labels.slice();
    const msg = {
      getFrom: function () { return 'Sender <' + email + '>'; },
      getSubject: function () { return subject || 'Sua fatura de janeiro'; },
      getPlainBody: function () { throw new Error('no body'); },
      getAttachments: function () { return []; },
      getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
      getTo: function () { return 'me@gmail.com'; },
      getCc: function () { return ''; },
    };
    const th = {
      getId: function () { return id; },
      getLabels: function () { return bag.map(function (n) { return mkLabel(n, bag); }); },
      addLabel: function (l) { if (bag.indexOf(l.name) === -1) bag.push(l.name); },
      removeLabel: function (l) { const i = bag.indexOf(l.name); if (i >= 0) bag.splice(i, 1); },
      getPermalink: function () { return 'permalink-' + id; },
      getMessages: function () { return [msg]; },
    };
    return th;
  }
  const names = function (th) { return th.getLabels().map(function (l) { return l.name; }); };

  X.State.setReprocessOffset(0);
  X.State.setReprocessFingerprint('');

  // 1) social → job-search: o modelo novo troca a label e zera a tag needs-review
  const lkThread = mkProcThread('rp1', 'lk-job@linkedin.com',
    ['GMO/social', 'GMO/Processed'], 'InMail: Backend Engineer opportunity');
  searchPages.push([lkThread]);   // página 1 (offset 0)
  searchPages.push([]);           // página 2 (offset 1) → fila completa
  const rp = X.reprocessProcessed(100);
  check('reprocess: verdict swap social → job-search', rp.changed === 1 && rp.kept === 0 &&
        rp.scanned === 1 && rp.done === true, rp);
  check('reprocess: labels swapped, needs-review dropped, processed kept',
        names(lkThread).indexOf('GMO/job-search') !== -1 &&
        names(lkThread).indexOf('GMO/social') === -1 &&
        names(lkThread).indexOf('GMO/needs-review') === -1 &&
        names(lkThread).indexOf('GMO/Processed') !== -1, names(lkThread));
  check('reprocess: fila completa grava fingerprint e zera o cursor',
        X.State.getReprocessOffset() === 0 &&
        X.State.getReprocessFingerprint() === X.EmbeddingClassifier.refsFingerprint(), rp);

  // 2) fallback protegido: thread já categorizada NUNCA é rebaixada para uncategorized
  const keepThread = mkProcThread('rp2', 'mystery@unknown.tld',
    ['GMO/job-search', 'GMO/Processed'], 'qualquer assunto');
  searchPages.push([keepThread]); // página 1
  searchPages.push([]);           // página 2 → completa de novo
  const rp2 = X.reprocessProcessed(100);
  check('reprocess: fallback nunca rebaixa thread já categorizado',
        rp2.skipped === 1 && rp2.changed === 0 &&
        names(keepThread).indexOf('GMO/job-search') !== -1 &&
        names(keepThread).indexOf('GMO/uncategorized') === -1 &&
        names(keepThread).indexOf('GMO/Processed') !== -1, rp2);

  // 3) FIM DA FILA: runFullFlow (o fluxo completo) auto-continua o backlog
  //    reprocess quando o modelo mudou — só depois da fila de mail novo drenada
  //    (inclui os fetches vazios da EXPANSÃO de backlog: 13 até o cap de 365d).
  X.State.setReprocessFingerprint('stale-model-fp');
  X.State.setReprocessOffset(0);
  for (let i = 0; i < 14; i++) searchPages.push([]); // 1. fila primária + varredura completa + escada dos cards 1-2
  searchPages.push([]);            // 2. card needs-review → vazio
  searchPages.push([]);            // 3. card uncategorized → vazio
  const autoThread = mkProcThread('rp3', 'lk-job@linkedin.com',
    ['GMO/social', 'GMO/Processed'], 'InMail: Backend Engineer opportunity');
  searchPages.push([autoThread]);  // 4. card processed: página 1
  searchPages.push([]);            // 4. card processed: página 2 → fila completa
  const autoSc0 = searchCalls.length;
  const auto = X.runFullFlow();
  check('queue: runFullFlow drains the reprocess backlog at the end of the queue',
        !!auto.reprocess && auto.reprocess.done === true && auto.reprocess.scanned === 1,
        auto.reprocess);
  check('queue: auto-reprocess swapped the label (social → job-search)',
        names(autoThread).indexOf('GMO/job-search') !== -1 &&
        names(autoThread).indexOf('GMO/social') === -1, names(autoThread));
  check('queue: fingerprint stored, cursor zeroed after auto-reprocess',
        X.State.getReprocessFingerprint() === X.EmbeddingClassifier.refsFingerprint() &&
        X.State.getReprocessOffset() === 0);
  check('queue: card order needs-review → uncategorized → processed', (function () {
    const qs = searchCalls.slice(autoSc0).map(function (c) { return String(c.q || ''); });
    const iNr = qs.findIndex(function (q) { return q.indexOf('needs-review') !== -1; });
    const iUnc = qs.findIndex(function (q) { return q.indexOf('uncategorized') !== -1; });
    const iProc = qs.findIndex(function (q) {
      return q.indexOf('label:GMO/Processed') !== -1 && q.indexOf('-label:') === -1;
    });
    return iNr !== -1 && iUnc !== -1 && iProc !== -1 && iNr < iUnc && iUnc < iProc;
  })(), searchCalls.slice(autoSc0).map(function (c) { return c.q; }));

  // 4) Fila NÃO drenada (budget exit): os cards ficam para a próxima execução —
  //    nunca rodam à frente de mail novo.
  X.State.setReprocessFingerprint('stale-model-fp');
  const prevRuntime4 = X.CONFIG.maxRuntimeMs;
  X.CONFIG.maxRuntimeMs = -1;
  const budgetRun = X.runPipeline({});
  X.CONFIG.maxRuntimeMs = prevRuntime4;
  check('queue: budget exit → reprocess cards NOT run, backlog untouched',
        !budgetRun.reprocess &&
        X.State.getReprocessFingerprint() === 'stale-model-fp', budgetRun);

  // 5) retriageUncategorized: bucket SEM needs-review ganha nova chance do modelo
  //    (veredito confiante → troca a label; sem veredito confiante → fica onde
  //    está, nunca é rebaixado nem marcado).
  X.State.setReprocessOffset(0);
  const u1 = mkProcThread('u1', 'alert@indeed.com',
    ['GMO/uncategorized', 'GMO/Processed'], 'job alert matching your profile');
  const u2 = mkProcThread('u2', 'friend@unknown.tld',
    ['GMO/uncategorized', 'GMO/Processed'], 'oi tudo bem');
  searchPages.push([u1, u2]);
  const ru = X.retriageUncategorized(10);
  check('uncategorized: confident verdict swaps the label (uncategorized → job-search)',
        ru.resolved === 1 && ru.scanned === 2 &&
        names(u1).indexOf('GMO/job-search') !== -1 &&
        names(u1).indexOf('GMO/uncategorized') === -1 &&
        names(u1).indexOf('GMO/Processed') !== -1, ru);
  check('uncategorized: no confident verdict → thread stays (never flagged/downgraded)',
        names(u2).indexOf('GMO/uncategorized') !== -1 &&
        names(u2).indexOf('GMO/needs-review') === -1, ru);

  // 6) OLDEST-FIRST: as re-triagens pegam o balde mais antigo primeiro
  //    (older_than:2y → 1y → 6m → 3m → 1m → sem limite de data).
  const oldNr = mkProcThread('nr1', 'alert@indeed.com',
    ['GMO/needs-review', 'GMO/Processed'], 'job alert matching your profile');
  searchPages.push([oldNr]);                       // balde older_than:2y
  for (let i = 0; i < 5; i++) searchPages.push([]); // baldes 1y/6m/3m/1m/sem limite
  const scNr = searchCalls.length;
  const rnr = X.reprocessNeedsReview(20);
  check('oldest-first: needs-review resolves the oldest bucket first',
        rnr.resolved === 1 && rnr.scanned === 1, rnr);
  check('oldest-first: ladder queries 2y → 1y → 6m → 3m → 1m → none', (function () {
    const qs = searchCalls.slice(scNr).map(function (c) { return String(c.q || ''); });
    const order = ['older_than:2y', 'older_than:1y', 'older_than:6m', 'older_than:3m', 'older_than:1m'];
    let last = -1;
    for (let k = 0; k < order.length; k++) {
      const at = qs.findIndex(function (q) { return q.indexOf(order[k]) !== -1; });
      if (at === -1 || at < last) return false;
      last = at;
    }
    return true;
  })(), searchCalls.slice(scNr).map(function (c) { return c.q; }));
  check('oldest-first: resolved thread swapped labels, needs-review dropped',
        names(oldNr).indexOf('GMO/job-search') !== -1 &&
        names(oldNr).indexOf('GMO/needs-review') === -1 &&
        names(oldNr).indexOf('GMO/Processed') !== -1, names(oldNr));

  // 7) reprocessProcessed com cursor por BALDE (oldest-first): bucket 0 pega o
  //    mais antigo, esgota os baldes até done, grava fingerprint e zera o cursor.
  X.State.setReprocessFingerprint('stale-model-fp');
  X.State.setReprocessOffset(0);
  X.State.setReprocessBucket(0);
  const rpOld = mkProcThread('rp5', 'old@nubank.com.br',
    ['GMO/uncategorized', 'GMO/Processed'], 'Sua fatura venceu amanhã');
  searchPages.push([rpOld]);                       // balde 2y: página 1
  for (let i = 0; i < 6; i++) searchPages.push([]); // 2y página 2 + baldes 1y/6m/3m/1m/sem limite
  const rpB = X.reprocessProcessed(100);
  check('oldest-first: processed card sweeps the oldest bucket first',
        rpB.changed === 1 && rpB.done === true, rpB);
  check('oldest-first: completion resets (balde, offset) and stores fingerprint',
        X.State.getReprocessBucket() === 0 && X.State.getReprocessOffset() === 0 &&
        X.State.getReprocessFingerprint() === X.EmbeddingClassifier.refsFingerprint(), rpB);

  // 8) retomada pelo BALDE: cursor em bucket 1 → a primeira busca usa older_than:1y.
  X.State.setReprocessFingerprint('stale-model-fp');
  X.State.setReprocessOffset(0);
  X.State.setReprocessBucket(1);
  const rpOld2 = mkProcThread('rp6', 'resume@itau.com.br',
    ['GMO/uncategorized', 'GMO/Processed'], 'PIX recebido');
  searchPages.push([rpOld2]);                      // balde 1y: página 1
  for (let i = 0; i < 9; i++) searchPages.push([]); // 1y página 2 + 6m/3m/1m/sem limite... até done
  const scRes = searchCalls.length;
  const rpC = X.reprocessProcessed(100);
  check('oldest-first: bucket cursor resumes at older_than:1y',
        searchCalls[scRes].q.indexOf('older_than:1y') !== -1 &&
        searchCalls[scRes].q.indexOf('older_than:2y') === -1, searchCalls[scRes].q);
  check('oldest-first: resumed sweep completes and zeroes the cursor',
        rpC.done === true && X.State.getReprocessBucket() === 0 &&
        X.State.getReprocessOffset() === 0, rpC);

  // 9) cards REPETEM em ciclos — nada de "20 e para": card 1 processa 20 por
  //    ciclo e o ciclo repete até esgotar o balde / teto diário / 429 (os 5
  //    restantes são pegos pelo card 2 no mesmo ciclo — seen é compartilhado).
  X.State.setReprocessFingerprint('stale-model-fp');
  X.State.setReprocessOffset(0);
  X.State.setReprocessBucket(0);
  X.State.addDailyUsage(-X.State.getDailyUsage());
  searchPages.length = 0;
  const nrBatch = [];
  for (let i = 0; i < 25; i++) {
    nrBatch.push(mkProcThread('n' + i, 'n' + i + '@nubank.com.br',
      ['GMO/social', 'GMO/needs-review', 'GMO/Processed'], 'job alert matching your profile'));
  }
  searchPages.push(nrBatch);   // balde 2y: mesma página devolvida a cada busca
  searchPages.push(nrBatch);   // ciclo 2: só os 5 não-varridos do ciclo 1 contam
  const rcStats = {};
  X.runReprocessCards(rcStats, Date.now());
  check('cards: repeats in cycles past the 20 cap — all 25 re-scanned across cards',
        rcStats.reScanned + rcStats.uncScanned === 25 &&
        rcStats.reResolved + rcStats.uncResolved === 25, rcStats);
  check('cards: daily usage counts every re-classified thread',
        X.State.getDailyUsage() === 25, X.State.getDailyUsage());
  check('cards: bucket sweep completed (fingerprint stored, cursor zeroed)',
        X.State.getReprocessFingerprint() === X.EmbeddingClassifier.refsFingerprint() &&
        X.State.getReprocessBucket() === 0 && X.State.getReprocessOffset() === 0);
  X.State.addDailyUsage(-X.State.getDailyUsage());
})();

// — Expansão SEM limite de data: fila secou → varredura COMPLETA (sem after:),
//   eventualmente TODO o histórico é avaliado; limite diário de 200 e-mails —
(function () {
  searchPages.length = 0;   // flush: descarta páginas vazadas de blocos anteriores
  function mkT(id, email) {
    const labels = [];
    const msg = { getFrom: function () { return 'S <' + email + '>'; },
                  getSubject: function () { return 'Sua fatura de janeiro'; },
                  getPlainBody: function () { throw new Error('no body'); },
                  getAttachments: function () { return []; },
                  getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
                  getTo: function () { return 'me@gmail.com'; },
                  getCc: function () { return ''; } };
    return { getId: function () { return id; },
             getLabels: function () { return labels.map(function (n) {
               return { name: n, getName: function () { return n; } }; }); },
             addLabel: function (l) { if (labels.indexOf(l.name) === -1) labels.push(l.name); },
             removeLabel: function () {},
             getPermalink: function () { return 'p-' + id; },
             getMessages: function () { return [msg]; } };
  }

  // A) janela primária vazia → varredura COMPLETA (sem after:) acha o histórico
  //    antigo e o processa; varredura vazia de novo → fim limpo.
  searchPages.push([]);
  searchPages.push([mkT('x1', 'a@nubank.com.br'), mkT('x2', 'b@stripe.com')]);
  const sc0 = searchCalls.length;
  const stA = X.runPipeline({ expandBacklog: true, reprocess: false });
  check('backlog: no date limit — full-history scan evaluates old mail',
        stA.labeled === 2 && stA.expanded === 1, stA);
  check('backlog: full-scan query drops the after: clause',
        searchCalls[sc0 + 1].q.indexOf('after:') === -1 &&
        searchCalls[sc0 + 1].q.indexOf('label:GMO/Processed') !== -1, searchCalls[sc0 + 1].q);
  check('backlog: exhausted full scan ends the run cleanly',
        searchCalls.length - sc0 === 3, searchCalls.length - sc0);

  // B) mailbox inteiro já processado → varredura vazia, fim limpo.
  searchPages.length = 0;
  searchPages.push([]);
  const scB = searchCalls.length;
  const stB = X.runPipeline({ expandBacklog: true, reprocess: false });
  check('backlog: fully processed mailbox → clean end (1 search + full scan)',
        stB.labeled === 0 && stB.expanded === 1 && searchCalls.length - scB === 2, stB);

  // C) limite diário (200): usage ≥ 200 → para ANTES de buscar qualquer coisa
  //    (nenhuma busca; os cards também ficam para amanhã).
  X.State.addDailyUsage(200);
  const sc2 = searchCalls.length;
  const stC = X.processNewEmails();
  check('daily: 200/day cap stops the run before any fetch',
        stC.dailyCapped === true && searchCalls.length - sc2 === 0, stC);

  // D) teto diário macio: o lote pode ultrapassar o limite, mas a execução para
  //    antes do próximo fetch e o cursor não avança (fila persistente).
  X.State.addDailyUsage(195 - X.State.getDailyUsage());
  const lastRunD = propsStore.LAST_RUN;
  searchPages.length = 0;
  const pageD = [];
  for (let i = 0; i < 25; i++) pageD.push(mkT('d' + i, 'z' + i + '@stripe.com'));
  searchPages.push(pageD);
  const sc3 = searchCalls.length;
  const stD = X.runPipeline({ expandBacklog: true, reprocess: false });
  check('daily: soft cap per batch — run stops before the next fetch (25 labeled)',
        stD.labeled === 25 && stD.dailyCapped === true &&
        searchCalls.length - sc3 === 1 && propsStore.LAST_RUN === lastRunD, stD);

  // usage zerado para os testes seguintes
  X.State.addDailyUsage(-X.State.getDailyUsage());
})();

// — analyzeUncategorized: agrupa por domínio e ordena por frequência —
(function () {
  searchPages.length = 0;   // flush: descarta páginas vazadas de blocos anteriores
  function mkUnc(id, email, domain, subject) {
    const labels = [{ name: 'GMO/uncategorized', getName: function () { return 'GMO/uncategorized'; } }];
    const msg = {
      getFrom: function () { return 'S <' + email + '>'; },
      getSubject: function () { return subject; },
      getPlainBody: function () { throw new Error('no body'); },
      getAttachments: function () { return []; },
      getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
      getTo: function () { return ''; },
      getCc: function () { return ''; },
    };
    return {
      getId: function () { return id; },
      getLabels: function () { return labels; },
      addLabel: function () {},
      removeLabel: function () {},
      getPermalink: function () { return 'p-' + id; },
      getMessages: function () { return [msg]; },
    };
  }
  searchPages.push([
    mkUnc('u1', 'a@acme.example', 'acme.example', 'Proposta comercial revisada'),
    mkUnc('u2', 'b@acme.example', 'acme.example', 'Proposta comercial — versão 2'),
    mkUnc('u3', 'c@acme.example', 'acme.example', 'Seguimento da proposta'),
    mkUnc('u4', 'd@beleza.example', 'beleza.example', 'Lembrete de agendamento'),
  ]);
  const rep = X.analyzeUncategorized(0); // 0 embeds → modo leve, sem sugestão
  check('analyze: agrupa por domínio e ordena por frequência', rep.scanned === 4 &&
        rep.domains.length === 2 && rep.domains[0].domain === 'acme.example' &&
        rep.domains[0].count === 3 && rep.domains[1].count === 1, rep);
  check('analyze: sem cota de embedding → sugestão nula (modo leve)',
        rep.domains[0].suggested === null && rep.domains[0].subject === 'Proposta comercial revisada', rep.domains[0]);
})();

// — Marcas BR comuns: keyword de marca em domínio de marketing não listado —
(function () {
  const brands = [
    ['Mercado Livre', 'mlmkt.net', 'Sua conta no Mercado Livre'],
    ['Magalu', 'avisos-magalu.net', 'Magalu Black: descontos de até 60%'],
    ['Casas Bahia', 'cbonline.net', 'Sua entrega das Casas Bahia chegou'],
    ['MadeiraMadeira', 'mm-mkt.net', 'MadeiraMadeira: semana do móvel'],
    ['Riachuelo', 'mkt-riachuelo.net', 'Nova coleção Riachuelo'],
    ['Amazon', 'mkt-amazon-br.net', 'Ofertas da Amazon'],
    ['Shopee', 'mkt-shopee.net', 'Frete grátis no Shopee'],
    ['iFood', 'mkt-ifood.net', 'Cupons do iFood para hoje'],
    ['Netshoes', 'netshoes-mkt.net', 'Chuteira com 30% off'],
    ['KaBuM', 'kabum-mkt.net', 'Kabum: semana gamer'],
    ['Centauro', 'centauro-mkt.net', 'Cupom Centauro: 25% off'],
    ['Dafiti', 'mkt-dafiti.net', 'Dafiti: coleção nova'],
    ['Carrefour', 'mkt-carrefour.net', 'Ofertas do Carrefour'],
    ['Pão de Açúcar', 'paodeacucar-mkt.net', 'Clube Pão de Açúcar'],
    ['Leroy Merlin', 'leroy-mkt.net', 'Liquidação de ferramentas'],
    ['Petz', 'petz-mkt.net', 'Ração com frete grátis'],
    ['Cobasi', 'mkt-cobasi.net', 'Semana do pet'],
    ['Fast Shop', 'mkt-fastshop.net', 'Lançamentos'],
    ['Polishop', 'polishop-mkt.net', 'Semana de ofertas'],
    ['Casa e Vídeo', 'casaevideo-mkt.net', 'Liquidação de utilidades'],
    ['Loja do Mecânico', 'mecanico-mkt.net', 'Ferramentas em oferta'],
    ['Havan', 'havan-mkt.net', 'Apenas hoje'],
    ['Assaí', 'assai-mkt.net', 'Ofertas do atacarejo'],
    ['Submarino', 'submarino-mkt.net', 'Livros com desconto'],
    ['Clube Extra', 'clubeextra-mkt.net', 'Ofertas do folheto'],
    ['Hirota Food', 'hirota-mkt.net', 'Entrega em casa'],
  ];
  const fails = [];
  brands.forEach(function (b) {
    const r = R({ domain: b[1], name: b[0], subject: b[2], snippet: '' });
    if (r.category !== 'shopping') fails.push([b[0], r.category]);
  });
  check('marcas BR: 26 termos de marca → shopping em domínio de marketing',
        fails.length === 0, fails);
})();

// — Language detection (EN/PT/ES) —
const dl = X.DecisionTree.detectLanguage;
check('lang: PT detected', dl('Olá! Tudo bem? Para você conferir a sua fatura. Não esqueça do pagamento até o vencimento.').lang === 'pt');
check('lang: ES detected', dl('Hola, gracias por su mensaje. Le informamos que su pedido ya está listo. Saludos.').lang === 'es');
check('lang: EN detected', dl('Hi Jane, thanks for your update. Please find the report attached below. Let me know if you have any questions.').lang === 'en');

// — Language-aware features —
const fp = X.DecisionTree.buildFeatures({ name: 'Boletim', domain: 'boletim.pt', subject: 'Boletim semanal', bodyScan: 'cancele sua assinatura — descadastre aqui', toCount: 0 });
check('features: lang_pt + bulk_pt', fp.lang_pt === 1 && fp.bulk_pt === 1, { lang_pt: fp.lang_pt, bulk_pt: fp.bulk_pt });
const fe = X.DecisionTree.buildFeatures({ name: 'Empleos', domain: 'empleos.es', subject: 'Nueva vacante disponible', bodyScan: 'publicamos esta vacante de empleo en Madrid. Saludos.', toCount: 0 });
check('features: lang_es + job_es', fe.lang_es === 1 && fe.job_es === 1, { lang_es: fe.lang_es, job_es: fe.job_es });

// — Tree v2: language-first root + per-language branches —
check('tree: root node is language (lang_pt)', X.DecisionTree.loadModel().nodes[0].feature === 'lang_pt');
check('tree: PT bulk branch', (function () {
  const v = X.DecisionTree.evaluate({ lang_pt: 1, bulk_pt: 1 });
  return v && v.category === 'newsletters' && v.confidence >= 0.85;
})());
check('tree: ES job branch', (function () {
  const v = X.DecisionTree.evaluate({ lang_es: 1, job_es: 1 });
  return v && v.category === 'job-search';
})());

// — Trainer (pure train + language-forced root) —
const S = [];
for (let i = 0; i < 8; i++) S.push({ features: { lang_pt: 1, bulk_pt: 1 }, class: 'newsletters' });
for (let i = 0; i < 8; i++) S.push({ features: { lang_pt: 1, job_pt: 1 }, class: 'job-search' });
for (let i = 0; i < 8; i++) S.push({ features: { lang_es: 1, bulk_es: 1 }, class: 'newsletters' });
for (let i = 0; i < 8; i++) S.push({ features: { lang_en: 1, job_signal: 1 }, class: 'work' });
const model = X.Trainer.train(S);
check('trainer: language-forced root', model.nodes[0].feature === 'lang_pt' &&
      model.nodes.every(function (n, i) {
        return n.leaf || (n.yes > i && n.no > i);
      }));
check('trainer: routes PT newsletter', X.DecisionTree.evaluate({ lang_pt: 1, bulk_pt: 1 }, { nodes: model.nodes }).category === 'newsletters');
check('trainer: routes ES newsletter', X.DecisionTree.evaluate({ lang_es: 1, bulk_es: 1 }, { nodes: model.nodes }).category === 'newsletters');
check('trainer: routes EN work', X.DecisionTree.evaluate({ lang_en: 1, job_signal: 1 }, { nodes: model.nodes }).category === 'work');
check('trainer: uncategorized leaves defer downstream (null)', (function () {
  const S2 = S.slice();
  for (let i = 0; i < 8; i++) S2.push({ features: { lang_en: 1, money_signal: 1 }, class: 'uncategorized' });
  const m2 = X.Trainer.train(S2);
  return X.DecisionTree.evaluate({ lang_en: 1, money_signal: 1, job_signal: 0 }, { nodes: m2.nodes }) === null;
})());

// — Embedding similarity (pure helpers; UrlFetchApp absent in sandbox) —
const E = X.EmbeddingClassifier;
check('embed: cosine identical ≈ 1', E.cosine([1, 0, 1], [1, 0, 1]) > 0.999);
check('embed: cosine orthogonal ≈ 0', Math.abs(E.cosine([1, 0], [0, 1])) < 1e-9);
const simsOk = { newsletters: 0.62, finance: 0.31, work: 0.30 };
check('embed: decide clear winner', E.decide(simsOk).category === 'newsletters');
check('embed: decide below gate → null', E.decide({ newsletters: 0.04, finance: 0.02 }) === null);
check('embed: decide tie → null', E.decide({ newsletters: 0.50, finance: 0.49 }) === null);
check('confirm: agreement confirms tree', E.confirm('newsletters', 0.88, simsOk).accepted === true);
check('confirm: clear contradiction vetoes tree', E.confirm('finance', 0.88, simsOk).accepted === false);
check('confirm: inconclusive sims → keep tree', E.confirm('finance', 0.88, { newsletters: 0.40, finance: 0.39 }).accepted === true);

// — Embedding model swap safety: prototype cache versioning —
X.CONFIG.embedding.outputDimensionality = 768;
function freshCache(model, dim, refs) {
  const p = {};
  Object.keys(E.references).forEach(function (k) { p[k] = []; });
  return { model: model || X.CONFIG.embedding.model,
           dim: dim || 768,
           protos: p,
           refs: refs || E.refsFingerprint() };
}
check('embed: model is gemini-embedding-001 (text-embedding-004 retired)', X.CONFIG.embedding.model === 'gemini-embedding-001');
check('embed: legacy prototype file (bare map) is stale', E.protosStale({ newsletters: [[1, 0]] }) === true);
check('embed: matching model+dim+categories+phrases is fresh', E.protosStale(freshCache()) === false);
check('embed: different model or dim is stale', E.protosStale(freshCache('text-embedding-004', 768)) === true &&
      E.protosStale(freshCache(X.CONFIG.embedding.model, 3072)) === true);
check('embed: cache missing news/ads/shopping categories is stale', E.protosStale({ model: X.CONFIG.embedding.model, dim: 768, protos: { newsletters: [], finance: [] }, refs: E.refsFingerprint() }) === true);
check('embed: cache built from older reference phrases is stale', E.protosStale(freshCache(X.CONFIG.embedding.model, 768, 'refs-oldhash')) === true);
check('embed: references cover news + ads + shopping', !!E.references.news && !!E.references.ads && !!E.references.shopping);
check('embed: references cover servicos + governo + viagens + saude', !!E.references.servicos && !!E.references.governo && !!E.references.viagens && !!E.references.saude);

// — Novas categorias: servicos / governo / viagens / saude (rule tier) —
check('rules: servicos account deletion', R({ domain: 'unknown-saas.io', name: 'SaaS', subject: 'Final Notice: Account deletion in 24 hours', snippet: '' }).category === 'servicos');
check('rules: servicos maintenance pt', R({ domain: 'provedor.com.br', name: 'Provedor', subject: 'Manutenção programada na madrugada', snippet: '' }).category === 'servicos');
check('rules: servicos security alert es', R({ domain: 'app-es.example', name: 'App ES', subject: 'Alerta de seguridad: nuevo acceso', snippet: '' }).category === 'servicos');
check('rules: governo gov.br keyword', R({ domain: 'portal-cidadao.example', name: 'Portal', subject: 'gov.br: atualize seu cadastro', snippet: '' }).category === 'governo');
check('rules: governo imposto de renda', R({ domain: 'contabilidade.example', name: 'Contador', subject: 'IRPF 2026: declare seu imposto de renda', snippet: '' }).category === 'governo');
check('rules: governo dominio MEI', R({ domain: 'meumeidigital.com.br', name: 'MEI Digital', subject: 'Perdão de dívidas MEI', snippet: '' }).category === 'governo');
check('rules: viagens booking domain', R({ domain: 'booking.com', name: 'Booking', subject: 'Your booking confirmation', snippet: '' }).category === 'viagens');
check('rules: viagens keyword pt (sua reserva)', R({ domain: 'hotel-unknown.example', name: 'Hotel', subject: 'Sua reserva no hotel está confirmada', snippet: '' }).category === 'viagens');
check('rules: viagens keyword (check-in online)', R({ domain: 'aerea-unknown.example', name: 'Companhia', subject: 'Check-in online disponível', snippet: '' }).category === 'viagens');
check('rules: saude keyword pt (consulta marcada)', R({ domain: 'clinica-unknown.example', name: 'Clínica', subject: 'Consulta marcada: cardiologia', snippet: '' }).category === 'saude');
check('rules: saude keyword (plano de saúde)', R({ domain: 'plano-unknown.example', name: 'Plano', subject: 'Plano de saúde: reembolso disponível', snippet: '' }).category === 'saude');
check('cross: zoom.us security alert → servicos vence domínio work', R({ domain: 'zoom.us', name: 'Zoom', subject: 'Security alert: new sign-in to your account', snippet: '' }).category === 'servicos');
check('cross: booking.com promoção → ads vence domínio viagens', R({ domain: 'booking.com', name: 'Booking', subject: 'Ofertas de verão: promoção em pacotes', snippet: '' }).category === 'ads');
check('cross: decathlon % off → shopping (2) vence ads (4)', R({ domain: 'decathlon.com.br', name: 'Decathlon', subject: 'Equipamentos de corrida com 30% off', snippet: '' }).category === 'shopping');
check('cross: caixa.gov.br → finance (7), sem trigger governo (8)', R({ domain: 'caixa.gov.br', name: 'Caixa', subject: 'Extrato da sua conta FGTS', snippet: '' }).category === 'finance');
check('rules: uber sem domínio → ads por keyword desconto', R({ domain: 'uber.com', name: 'Uber', subject: 'Corridas com desconto esta semana', snippet: '' }).category === 'ads');
check('cross: playstation promo desconto → ads (4) vence domínio servicos (5)', R({ domain: 'playstation.com', name: 'PlayStation Store', subject: 'Descontos de até 70% nos jogos', snippet: '' }).category === 'ads');
check('rules: adobe.com conta → servicos', R({ domain: 'adobe.com', name: 'Adobe', subject: 'Novo login detectado', snippet: '' }).category === 'servicos');
check('rules: neon pix → finance', R({ domain: 'neon.com.br', name: 'Neon', subject: 'Seu Pix chegou', snippet: '' }).category === 'finance');
check('cross: linkedin InMail recruiter → job-search (11) vence domínio social (12)', R({ domain: 'linkedin.com', name: 'LinkedIn', subject: 'InMail: Backend Engineer opportunity', snippet: '' }).category === 'job-search');
check('cross: linkedin "LinkedIn Jobs" name → job-search', R({ domain: 'linkedin.com', name: 'LinkedIn Jobs', subject: 'Jobs you may be interested in', snippet: '' }).category === 'job-search');
check('rules: recruiter message → job-search (sem domínio no Config)', R({ domain: 'mail.outreach.io', name: 'Recruiter Outreach', subject: 'New message from a recruiter', snippet: '' }).category === 'job-search');
check('não-regressão: linkedin social notification continua social', R({ domain: 'linkedin.com', name: 'LinkedIn', subject: 'Your profile appeared in 12 searches', snippet: '' }).category === 'social');
check('cross: linkedin pessoal COM vaga → job-search (keyword opportunity)', R({ domain: 'linkedin.com', name: 'Rafael Lima via LinkedIn', subject: 'Rafael sent you a message: Backend opportunity', snippet: '' }).category === 'job-search');
check('cross: linkedin pessoal SEM vaga → social pelo domínio (proxy genérico removido)', R({ domain: 'linkedin.com', name: 'MARCOS via LinkedIn', subject: 'MARCOS sent you a message: vamos jogar futebol?', snippet: 'Reply on LinkedIn.' }).category === 'social');

// — Utils.driveJson*: Drive REST v3 under the narrow drive.file scope (no DriveApp) —
(function () {
  const store = {};
  let seq = 0;
  const driveCalls = [];
  ctx.ScriptApp.getOAuthToken = function () { return 'test-token'; };
  ctx.UrlFetchApp = {
    fetch: function (url, req) {
      driveCalls.push({ url: url, method: req.method });
      const ok = { getResponseCode: function () { return 200; },
                   getContentText: function () { return '{}'; },
                   getHeaders: function () { return {}; } };
      if (url.indexOf('uploadType=multipart') !== -1 && req.method === 'post') {
        const id = 'drv-' + (++seq);
        const parts = req.payload.split('\r\n\r\n');
        store[id] = parts[2] ? parts[2].split('\r\n--')[0] : '';
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return JSON.stringify({ id: id }); },
                 getHeaders: function () { return {}; } };
      }
      if (url.indexOf('uploadType=media') !== -1 && req.method === 'patch') {
        const id = url.split('/files/')[1].split('?')[0];
        store[id] = String(req.payload);
        return ok;
      }
      if (url.indexOf('alt=media') !== -1) {
        const id = url.split('/files/')[1].split('?')[0];
        if (store[id] === undefined) {
          return { getResponseCode: function () { return 404; },
                   getContentText: function () { return '{}'; },
                   getHeaders: function () { return {}; } };
        }
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return store[id]; },
                 getHeaders: function () { return {}; } };
      }
      return { getResponseCode: function () { return 400; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    },
  };
  check('drive: missing id returns null (zero fetch calls)', (function () {
    const before = driveCalls.length;
    return X.Utils.driveJsonGet('NEVER_SET_KEY', 'x.json') === null &&
           driveCalls.length === before;
  })());
  check('drive: put creates via Drive v3 multipart and stores the id', (function () {
    const id = X.Utils.driveJsonPut('T_FILE_ID', 't.json', { model: 'm', dim: 768, protos: { a: [1] } });
    return !!id && propsStore['T_FILE_ID'] === id &&
           driveCalls[driveCalls.length - 1].url.indexOf('uploadType=multipart') !== -1;
  })());
  check('drive: get roundtrip reads alt=media content', (function () {
    const v = X.Utils.driveJsonGet('T_FILE_ID', 't.json');
    return v && v.model === 'm' && v.dim === 768 && v.protos.a[0] === 1;
  })());
  check('drive: second put updates in place (media PATCH, same id)', (function () {
    const id1 = propsStore['T_FILE_ID'];
    const id2 = X.Utils.driveJsonPut('T_FILE_ID', 't.json', { v: 2 });
    const last = driveCalls[driveCalls.length - 1];
    return id1 === id2 && last.url.indexOf('uploadType=media') !== -1 &&
           last.method === 'patch' && X.Utils.driveJsonGet('T_FILE_ID', 't.json').v === 2;
  })());
  check('drive: 404 on get clears the stale id', (function () {
    X.State.set('T_FILE_ID', 'bogus-id');
    return X.Utils.driveJsonGet('T_FILE_ID', 't.json') === null &&
           X.State.get('T_FILE_ID', '') === '';
  })());
  check('drive: create failure returns null and stores no id', (function () {
    X.State.set('T_FILE_ID', '');
    const savedFetch = ctx.UrlFetchApp.fetch;
    ctx.UrlFetchApp.fetch = function () {
      return { getResponseCode: function () { return 500; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    };
    const id = X.Utils.driveJsonPut('T_FILE_ID', 't.json', { v: 3 });
    ctx.UrlFetchApp.fetch = savedFetch;
    return id === null && !propsStore['T_FILE_ID'];
  })());

  // — Embedding 429: retried with backoff until success —
  const dbg = {};
  check('embed: 429 is retried and succeeds on a later attempt', (function () {
    propsStore['GEMINI_API_KEY'] = 'k';
    X.CONFIG.embedding.backoffBaseMs = 10; // keep the test fast
    let n = 0;
    ctx.UrlFetchApp.fetch = function (url) {
      n++;
      const isEmbed = url.indexOf(':embedContent') !== -1 ||
                      url.indexOf(':batchEmbedContents') !== -1;
      if (!isEmbed) {
        return { getResponseCode: function () { return 400; },
                 getContentText: function () { return '{}'; },
                 getHeaders: function () { return {}; } };
      }
      if (n <= 2) {
        return { getResponseCode: function () { return 429; },
                 getContentText: function () { return '{}'; },
                 getHeaders: function () { return {}; } };
      }
      return { getResponseCode: function () { return 200; },
               getContentText: function () { return JSON.stringify({ embeddings: [{ values: [0.1, 0.2] }] }); },
               getHeaders: function () { return {}; } };
    };
    const v = X.EmbeddingClassifier.embedBatch(['test text']);
    X.CONFIG.embedding.backoffBaseMs = 1000;
    delete propsStore['GEMINI_API_KEY'];
    dbg.n = n;
    dbg.v = v;
    return n === 3 && v && v[0][0] === 0.1 && v[0][1] === 0.2;
  })(), dbg);
  delete ctx.UrlFetchApp;
  delete ctx.ScriptApp.getOAuthToken;
})();

// — Embedding resilience: endpoint failover, batch→single fallback, run memo —
(function () {
  ctx.ScriptApp.getOAuthToken = function () { return 't'; };
  propsStore['GEMINI_API_KEY'] = 'k';
  let mode = 'failover';
  const calls = [];
  let seq = 0;
  ctx.UrlFetchApp = {
    fetch: function (url, req) {
      calls.push(url);
      const v1 = url.indexOf('/v1/models/') !== -1;
      const isBatch = url.indexOf(':batchEmbedContents') !== -1;
      if (url.indexOf('drive') !== -1) { // prototype cache REST calls succeed
        if (url.indexOf('uploadType=multipart') !== -1) {
          const id = 'drive-' + (++seq);
          return { getResponseCode: function () { return 200; },
                   getContentText: function () { return JSON.stringify({ id: id }); },
                   getHeaders: function () { return {}; } };
        }
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return '{}'; },
                 getHeaders: function () { return {}; } };
      }
      if (mode === 'failover' && !v1) {
        return { getResponseCode: function () { return 404; },
                 getContentText: function () { return 'gone'; },
                 getHeaders: function () { return {}; } };
      }
      if (mode === 'batch404' && isBatch) {
        return { getResponseCode: function () { return 404; },
                 getContentText: function () { return 'no batch'; },
                 getHeaders: function () { return {}; } };
      }
      if (mode === 'alldown') {
        return { getResponseCode: function () { return 404; },
                 getContentText: function () { return 'gone'; },
                 getHeaders: function () { return {}; } };
      }
      if (isBatch) {
        const count = (String(req.payload).match(/CLASSIFICATION/g) || []).length;
        const embeddings = [];
        for (let i = 0; i < count; i++) embeddings.push({ values: [1, 0] });
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return JSON.stringify({ embeddings: embeddings }); },
                 getHeaders: function () { return {}; } };
      }
      return { getResponseCode: function () { return 200; },
               getContentText: function () { return JSON.stringify({ embedding: { values: [1, 0] } }); },
               getHeaders: function () { return {}; } };
    },
  };

  X.EmbeddingClassifier.rebuild();
  const protos = X.EmbeddingClassifier.ensurePrototypes();
  check('embed: v1beta 404 fails over to v1 and builds prototypes',
        !!protos && protos['finance'].length > 0 && protos['finance'][0][0] === 1);
  check('embed: endpoint choice sticks for the run (/v1/ calls observed)',
        calls.some(function (u) { return u.indexOf('/v1/models/') !== -1; }));
  check('embed: one-time post-build cooldown waits out the RPM window',
        sleepLog.indexOf(45000) !== -1);

  mode = 'batch404';
  X.EmbeddingClassifier.rebuild();
  const protos2 = X.EmbeddingClassifier.ensurePrototypes();
  check('embed: batchEmbedContents 404 falls back to per-text embedContent',
        !!protos2 && protos2['newsletters'].length > 0 && protos2['newsletters'][0][0] === 1);

  mode = 'alldown';
  X.EmbeddingClassifier.rebuild();
  const protos3 = X.EmbeddingClassifier.ensurePrototypes();
  const before = calls.length;
  const protos4 = X.EmbeddingClassifier.ensurePrototypes();
  check('embed: failed build memoized for the run (no per-sender rebuild spam)',
        protos3 === null && protos4 === null && calls.length === before,
        { before: before, after: calls.length });

  delete propsStore['GEMINI_API_KEY'];
  delete propsStore['PROTO_FILE_ID'];
  delete ctx.UrlFetchApp;
  delete ctx.ScriptApp.getOAuthToken;
})();

// — Modo fila (queue429): 429 → espera a janela e repete; exaustão sinaliza —
(function () {
  propsStore['GEMINI_API_KEY'] = 'k';
  ctx.UrlFetchApp = {
    fetch: function (url) {
      const isEmbed = url.indexOf(':embedContent') !== -1 ||
                      url.indexOf(':batchEmbedContents') !== -1;
      if (!isEmbed) {
        return { getResponseCode: function () { return 400; },
                 getContentText: function () { return '{}'; },
                 getHeaders: function () { return {}; } };
      }
      return { getResponseCode: function () { return 429; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    },
  };
  X.CONFIG.embedding.queue429MaxWaits = 2; // keep the test fast
  X.EmbeddingClassifier.setRatePatience(true);
  const vEx = X.EmbeddingClassifier.embedOne('fila esgota');
  const stEx = X.EmbeddingClassifier.rateStats();
  check('queue: paciência repete o mesmo request em 429 (attempt não consumido)',
        vEx === null && stEx.exhausted === true && stEx.waits > 2, stEx);
  check('queue: rateExhausted sinalizado para o pipeline', X.EmbeddingClassifier.rateExhausted() === true);

  X.CONFIG.embedding.queue429MaxWaits = 6; // restaura para o teste de sucesso
  X.EmbeddingClassifier.setRatePatience(true); // contadores frescos, paciência ligada
  let n = 0;
  ctx.UrlFetchApp.fetch = function (url) {
    n++;
    if (url.indexOf(':embedContent') === -1 && url.indexOf(':batchEmbedContents') === -1) {
      return { getResponseCode: function () { return 400; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    }
    if (n <= 3) {
      return { getResponseCode: function () { return 429; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    }
    return { getResponseCode: function () { return 200; },
             getContentText: function () { return JSON.stringify({ embedding: { values: [0.5, 0.6] } }); },
             getHeaders: function () { return {}; } };
  };
  const vOk = X.EmbeddingClassifier.embedOne('fila consegue');
  const stOk = X.EmbeddingClassifier.rateStats();
  check('queue: paciente espera a janela e consegue o embedding',
        !!vOk && vOk.length === 2 && stOk.exhausted === false, stOk);
  X.EmbeddingClassifier.setRatePatience(false);
  X.CONFIG.embedding.queue429MaxWaits = 6;
  delete propsStore['GEMINI_API_KEY'];
  delete ctx.UrlFetchApp;
})();

// — Pipeline em MODO FILA: cota esgotada → pausa SEM marcar as threads —
(function () {
  const realExhausted = X.EmbeddingClassifier.rateExhausted;
  X.EmbeddingClassifier.rateExhausted = function () { return true; };
  function mkQueueThread(id, email) {
    const bag = [];
    const msg = {
      getFrom: function () { return 'Sender <' + email + '>'; },
      getSubject: function () { return 'oi'; },
      getPlainBody: function () { throw new Error('no body'); },
      getAttachments: function () { return []; },
      getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
      getTo: function () { return ''; },
      getCc: function () { return ''; },
    };
    const th = {
      getId: function () { return id; },
      getLabels: function () {
        return bag.map(function (n) {
          return { name: n, getName: function () { return n; } };
        });
      },
      addLabel: function (l) { bag.push(l.name); },
      removeLabel: function (l) { const i = bag.indexOf(l.name); if (i >= 0) bag.splice(i, 1); },
      getPermalink: function () { return 'permalink-' + id; },
      getMessages: function () { return [msg]; },
    };
    return th;
  }
  searchPages.length = 0;   // flush: descarta páginas vazadas de blocos anteriores
  const q1 = mkQueueThread('q1', 'x1@unknown.tld');
  const q2 = mkQueueThread('q2', 'x2@unknown.tld');
  const q3 = mkQueueThread('q3', 'x3@unknown.tld');
  searchPages.push([q1, q2, q3]);
  const st = X.runPipeline({ days: 5, queue429: true, reprocess: false, progressLog: true });
  check('queue pipeline: cota esgotada → pausa SEM marcar (threads ficam na fila)',
        st.paused429 === true && st.labeled === 0, st);
  check('queue pipeline: nenhuma thread ganhou label', [q1, q2, q3].every(function (t) {
    return t.getLabels().length === 0;
  }));
  X.EmbeddingClassifier.rateExhausted = realExhausted;
})();

// — GmailReader.buildQuery: read-status agnostic idempotency —
const q1 = X.GmailReader.buildQuery(0, {});
check('query: spam/trash + processed-label exclusions + after window, no is:unread',
      q1.indexOf('-in:spam') !== -1 && q1.indexOf('-in:trash') !== -1 &&
      q1.indexOf('-label:GMO/Processed') !== -1 && q1.indexOf('after:') !== -1 &&
      q1.indexOf('is:unread') === -1, q1);
const q2 = X.GmailReader.buildQuery(Date.now(), {});
check('query: cursor overlap window, read status irrelevant',
      q2.indexOf('after:') !== -1 && q2.indexOf('is:unread') === -1, q2);

// — Scale: chunked labeling with debounce —
(function () {
  searchPages.length = 0;   // flush: descarta páginas vazadas de blocos anteriores
  function mkThread(id, email) {
    const msg = {
      getFrom: function () { return 'Sender <' + email + '>'; },
      getSubject: function () { return 'Sua fatura de janeiro'; },
      getPlainBody: function () { throw new Error('no body in sandbox'); },
      getAttachments: function () { throw new Error('none'); },
      getDate: function () { return new Date('2026-01-05T10:00:00Z'); },
      getTo: function () { return 'me@gmail.com'; },
      getCc: function () { return ''; },
    };
    return {
      getId: function () { return id; },
      getLabels: function () { return []; },
      addLabel: function () {},
      getPermalink: function () { return 'https://mail.google.com/u/0/#/' + id; },
      getMessages: function () { return [msg]; },
    };
  }
  const pacing = X.CONFIG.pacing;
  pacing.labelChunkSize = 2;
  pacing.labelChunkDebounceMs = 400;
  const verdicts = ['a@nubank.com.br', 'b@stripe.com', 'c@paypal.com', 'd@stripe.com',
                    'e@stripe.com'].map(function (em, i) {
    return { rec: { email: em, _thread: mkThread('c' + i, em) }, category: 'finance', source: 'rule' };
  });
  const sl0 = sleepLog.length;
  const n = X.Labeler.applyToBatch(verdicts, pacing);
  const chunkSleeps = sleepLog.slice(sl0).filter(function (ms) { return ms === 400; }).length;
  check('scale: applyToBatch labels all 5 across chunks', n === 5, n);
  check('scale: label chunks debounced (2 sleeps of 400ms)', chunkSleeps === 2, chunkSleeps);
  pacing.labelChunkSize = 10; // restore

  // — Scale: runPipeline re-pagination (offset always 0) + phase debounces + cursor —
  X.CONFIG.batchSize = 3;
  searchPages.push([mkThread('t1', 'a@nubank.com.br'), mkThread('t2', 'b@stripe.com'),
                    mkThread('t3', 'c@paypal.com')]);
  searchPages.push([mkThread('t4', 'd@stripe.com')]); // partial page → exhausted
  const sc0 = searchCalls.length;
  const st = X.runPipeline({ reprocess: false });
  const pipeSearch = searchCalls.slice(sc0);
  check('scale: pipeline labels 4 threads in 2 batches', st.labeled === 4 && st.batches === 2, st);
  check('scale: every fetch repages from offset 0', pipeSearch.length === 2 &&
        pipeSearch.every(function (c) { return c.offset === 0; }), pipeSearch);
  check('scale: cursor (LAST_RUN) advanced after complete run', !!propsStore.LAST_RUN);
  check('scale: debounces between phases (200 classify + 300 fetch)',
        sleepLog.indexOf(200) >= 0 && sleepLog.indexOf(300) >= 0, sleepLog.slice(-6));

  // — Scale: stall guard stops when labeling keeps failing —
  const realSearch = ctx.GmailApp.search;
  X.CONFIG.batchSize = 2; // full page (2) → hasMore stays true → stale pages reached
  ctx.GmailApp.search = function () {
    searchCalls.push({ offset: 0, max: X.CONFIG.batchSize });
    return [mkThread('s1', 'a@nubank.com.br'), mkThread('s2', 'b@stripe.com')];
  };
  const st2 = X.runPipeline({ reprocess: false });
  check('scale: stall guard breaks after 2 stale pages (failed threads retried next run)',
        st2.labeled === 2 && st2.batches === 3, st2);
  ctx.GmailApp.search = realSearch;
  X.CONFIG.batchSize = 25; // restore

  // — Scale: budget exit does NOT advance the cursor —
  const lastRunBefore = propsStore.LAST_RUN;
  const prevBudget = X.CONFIG.maxRuntimeMs;
  X.CONFIG.maxRuntimeMs = -1;
  searchPages.push([mkThread('t5', 'a@nubank.com.br')]);
  const st3 = X.runPipeline({ reprocess: false });
  check('scale: budget exit → no batches, cursor untouched',
        st3.budgetExit === true && st3.batches === 0 &&
        propsStore.LAST_RUN === lastRunBefore, st3);
  X.CONFIG.maxRuntimeMs = prevBudget;

  // — Scale: batch-ceiling exit also keeps the cursor (older backlog continues) —
  const lastRunBeforeCap = propsStore.LAST_RUN;
  const prevCap = X.CONFIG.maxBatchesPerRun;
  X.CONFIG.maxBatchesPerRun = 1;
  X.CONFIG.batchSize = 2;
  ctx.GmailApp.search = function () {
    searchCalls.push({ offset: 0, max: X.CONFIG.batchSize });
    return [mkThread('b1', 'a@nubank.com.br'), mkThread('b2', 'b@stripe.com')];
  };
  const st4 = X.runPipeline({ reprocess: false });
  check('scale: maxBatches ceiling → budget exit, cursor untouched, progress made',
        st4.budgetExit === true && st4.batches === 1 && st4.labeled === 2 &&
        propsStore.LAST_RUN === lastRunBeforeCap, st4);
  ctx.GmailApp.search = realSearch;
  X.CONFIG.batchSize = 25;
  X.CONFIG.maxBatchesPerRun = prevCap;

  // — Scale: setupTrigger snaps CONFIG.triggerMinutes to VALID Apps Script values —
  // (everyMinutes only accepts 1,5,10,15,30; the old round(x/5)*5 snap produced
  //  20/25 for e.g. triggerMinutes=20 and create() THREW — scheduling silently
  //  broken, no trigger installed)
  function lastTrigger() { return triggerRec.list[triggerRec.list.length - 1]; }
  X.CONFIG.triggerMinutes = 60;
  X.setupTrigger();
  check('scale: trigger 60min → everyHours(1)', (function () {
    const t = lastTrigger(); return t.hours === 1 && t.minutes === null; })(), lastTrigger());
  X.CONFIG.triggerMinutes = 17;
  X.setupTrigger();
  check('scale: trigger 17min → everyMinutes(15)', lastTrigger().minutes === 15, lastTrigger());
  X.CONFIG.triggerMinutes = 20;
  X.setupTrigger();
  check('scale: trigger 20min → everyMinutes(15) (old snap threw — no trigger installed)',
        lastTrigger().minutes === 15 && lastTrigger().hours === null, lastTrigger());
  X.CONFIG.triggerMinutes = 25;
  X.setupTrigger();
  check('scale: trigger 25min → everyMinutes(30)', lastTrigger().minutes === 30, lastTrigger());
  X.CONFIG.triggerMinutes = 90;
  X.setupTrigger();
  check('scale: trigger 90min → everyHours(2)', lastTrigger().hours === 2, lastTrigger());
  X.CONFIG.triggerMinutes = 1440;
  X.setupTrigger();
  check('scale: trigger 1440min → everyDays(1) @ 6h (every 24 h)', (function () {
    const t = lastTrigger();
    return t.days === 1 && t.hour === 6 && t.hours === null && t.minutes === null;
  })(), lastTrigger());
  X.CONFIG.triggerMinutes = 2880;
  X.setupTrigger();
  check('scale: trigger 2880min → everyDays(2)', lastTrigger().days === 2, lastTrigger());
  X.CONFIG.triggerMinutes = 2000;
  X.setupTrigger();
  check('scale: trigger 2000min → everyDays(1) (rounds down, no 23h drift)', lastTrigger().days === 1, lastTrigger());
  X.CONFIG.triggerMinutes = 60;
})();

// ─── Tuner.gs — weekly in-script decision-tree tuner ─────────────────────
(function () {
  // Drive + OAuth mocks — later suites DELETE ctx.UrlFetchApp/getOAuthToken,
  // so the tuner block re-installs its own (same contract as the drive tests).
  const store = {};
  let seq = 0;
  ctx.ScriptApp.getOAuthToken = function () { return 'tuner-token'; };
  ctx.UrlFetchApp = {
    fetch: function (url, req) {
      const ok = { getResponseCode: function () { return 200; },
                   getContentText: function () { return '{}'; },
                   getHeaders: function () { return {}; } };
      if (url.indexOf('uploadType=multipart') !== -1 && req.method === 'post') {
        const id = 'tune-' + (++seq);
        const parts = req.payload.split('\r\n\r\n');
        store[id] = parts[2] ? parts[2].split('\r\n--')[0] : '';
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return JSON.stringify({ id: id }); },
                 getHeaders: function () { return {}; } };
      }
      if (url.indexOf('uploadType=media') !== -1 && req.method === 'patch') {
        const id = url.split('/files/')[1].split('?')[0];
        store[id] = String(req.payload);
        return ok;
      }
      if (url.indexOf('alt=media') !== -1) {
        const id = url.split('/files/')[1].split('?')[0];
        if (store[id] === undefined) {
          return { getResponseCode: function () { return 404; },
                   getContentText: function () { return '{}'; },
                   getHeaders: function () { return {}; } };
        }
        return { getResponseCode: function () { return 200; },
                 getContentText: function () { return store[id]; },
                 getHeaders: function () { return {}; } };
      }
      return { getResponseCode: function () { return 400; },
               getContentText: function () { return '{}'; },
               getHeaders: function () { return {}; } };
    },
  };

  // Ladder = depths × minNodes
  check('tuner: ladder = depths × minNodes (25 shapes)',
        X.Tuner.buildLadder().length === 25);

  // stratifiedFolds: partition once, every class in every fold
  const samples = [];
  for (let i = 0; i < 40; i++) {
    samples.push({ features: { lang_en: 1, sig_work: 1 }, class: 'work' });
  }
  for (let i = 0; i < 40; i++) {
    samples.push({ features: { lang_pt: 1, sig_news: 1 }, class: 'news' });
  }
  const folds = X.Tuner.stratifiedFolds(samples, 4);
  const seen = {};
  let okFolds = folds.length === 4 && folds.every(function (f) {
    return f.length === 20;
  });
  folds.forEach(function (f) {
    f.forEach(function (i) { seen[i] = 1; });
  });
  let covered = 0;
  Object.keys(seen).forEach(function () { covered++; });
  check('tuner: stratifiedFolds partitions every sample exactly once',
        okFolds && covered === 80);
  const stratified = folds.every(function (f) {
    const cls = {};
    f.forEach(function (i) { cls[samples[i].class] = 1; });
    return Object.keys(cls).length === 2;
  });
  check('tuner: stratifiedFolds keeps both classes in every fold', stratified);

  // leafVerdict: pure walk (gate applied by the caller)
  const tiny = { nodes: [{ leaf: true, class: 'work', confidence: 0.8 }] };
  const v = X.Tuner.leafVerdict({ lang_en: 1 }, tiny);
  check('tuner: leafVerdict returns {cls, conf} ungated',
        !!v && v.cls === 'work' && v.conf === 0.8);
  check('tuner: leafVerdict null-class leaf → null (defer)',
        X.Tuner.leafVerdict({ lang_en: 1 },
          { nodes: [{ leaf: true, class: null, confidence: 0.9 }] }) === null);

  // cvShape: separable corpus → perfect CV at both gates (sweep is free)
  const res = X.Tuner.cvShape({ d: 4, n: 3 }, samples, folds, [0.85, 0.75]);
  const rHi = res.filter(function (r) { return r.conf === 0.85; })[0];
  const rLo = res.filter(function (r) { return r.conf === 0.75; })[0];
  check('tuner: cvShape perfect on separable corpus (strict gate)',
        !!rHi && rHi.acc === 1 && rHi.resolved === 80);
  check('tuner: cvShape gate sweep needs no retrain (same accuracy)',
        !!rLo && rLo.acc === 1 && rLo.resolved === 80);

  // Champion baseline reads the production model
  const champ = X.Tuner.currentChampion(samples);
  check('tuner: currentChampion reports gate + accuracy',
        champ.gate === 0.85 && champ.acc >= 0);

  // collectSamples: cache-hit path (no Gmail at all)
  const seeded = X.Utils.driveJsonPut('TUNER_CORPUS_FILE_ID', 'tuner-corpus.json', {
    ts: new Date().toISOString(), perClass: { work: 1 },
    samples: [{ f: { lang_en: 1, sig_work: 1 }, y: 'work' }],
  });
  check('tuner: corpus cache seeded to Drive', !!seeded);
  const got = X.Tuner.collectSamples(Date.now());
  check('tuner: collectSamples serves the fresh cache (fromCache, no labels)',
        got.fromCache === true && got.samples.length === 1 &&
        got.samples[0].class === 'work');

  // e2e runWeeklyTuner on the cached corpus (tiny search space, fast)
  const origTune = JSON.parse(JSON.stringify(X.CONFIG.trainer.tune));
  X.CONFIG.trainer.tune.depthCandidates = [3, 4];
  X.CONFIG.trainer.tune.minNodeCandidates = [3];
  X.CONFIG.trainer.tune.confCandidates = [0.8];
  const many = [];
  for (let i = 0; i < 600; i++) {
    many.push({ f: { lang_en: 1, sig_work: 1 }, y: 'work' });
  }
  for (let i = 0; i < 600; i++) {
    many.push({ f: { lang_pt: 1, sig_news: 1 }, y: 'news' });
  }
  X.Utils.driveJsonPut('TUNER_CORPUS_FILE_ID', 'tuner-corpus.json', {
    ts: new Date().toISOString(), perClass: { work: 30, news: 30 }, samples: many,
  });
  const run1 = X.runWeeklyTuner();
  check('tuner: e2e run finds a perfect combo on the separable corpus',
        run1.ok === true && run1.best.acc === 1 && run1.combos === 2);
  check('tuner: candidate model saved to Drive (TUNED_MODEL_FILE_ID)',
        run1.saved === true && !!propsStore['TUNED_MODEL_FILE_ID']);
  check('tuner: ladder cursor advanced (rotation state persisted)',
        propsStore['TUNER_CURSOR'] === '1');
  check('tuner: no auto-apply by default (no TREE_MODEL_SOURCE override)',
        !propsStore['TREE_MODEL_SOURCE']);

  // rotation wraps the ladder: cursor at the LAST shape + a deadline that
  // cuts between shape 0 and shape 1 → only the WRAPPED first shape runs,
  // then the sweep pauses mid-ladder (resume point persisted). Trainer.train
  // is patched in-vm with a busy-wait so shape 0 deterministically overruns
  // the 12 ms sweep deadline regardless of machine speed.
  const savedMaxRuntime = X.CONFIG.maxRuntimeMs;
  const savedTrain = X.Trainer.train;
  X.Trainer.train = function (samples, opts) {
    const t0 = Date.now();
    while (Date.now() - t0 < 15) { /* busy-wait 15 ms per training */ }
    return savedTrain(samples, opts);
  };
  X.CONFIG.maxRuntimeMs = 20012; // sweep deadline = start + 12 ms
  const t0run = Date.now();
  const run2 = X.runWeeklyTuner();
  const elapsedRun2 = Date.now() - t0run;
  X.Trainer.train = savedTrain;
  X.CONFIG.maxRuntimeMs = savedMaxRuntime;
  check('tuner: rotation wraps to index 0 and pauses mid-ladder',
        run2.ok === true && run2.paused === true &&
        propsStore['TUNER_CURSOR'] === '0',
        JSON.stringify({ ok: run2.ok, paused: run2.paused,
                         cursor: propsStore['TUNER_CURSOR'],
                         combos: run2.combos, elapsedMs: elapsedRun2 }));

  // autoApply ON + gain requirement met → property override (no code edits)
  X.CONFIG.trainer.tune.autoApply = true;
  X.CONFIG.trainer.tune.autoApplyMinGainPp = -1;
  const run3 = X.runWeeklyTuner();
  check('tuner: autoApply sets the TREE_MODEL_SOURCE override',
        run3.ok === true &&
        propsStore['TREE_MODEL_SOURCE'] === 'drive:tree-model-tuned.json');
  X.CONFIG.trainer.tune.autoApply = false;
  X.CONFIG.trainer.tune.autoApplyMinGainPp = origTune.autoApplyMinGainPp;
  X.State.set('TREE_MODEL_SOURCE', ''); // clean the override

  // status reflects the state without throwing
  const st = X.tunerStatus();
  check('tuner: status reports cursor + cleared override',
        !!st && st.cursor === '0' && st.modelOverride === '' &&
        st.autoApply === false);

  // weekly trigger lifecycle (everyWeeks(1) + onWeekDay mock)
  X.setupWeeklyTuner();
  const wt = triggerRec.list[triggerRec.list.length - 1];
  check('tuner: setupWeeklyTuner installs a weekly trigger',
        wt.handler === 'runWeeklyTuner' && wt.weeks === 1);
  const removed = X.removeWeeklyTuner();
  check('tuner: removeWeeklyTuner clears its triggers',
        removed >= 1 && triggerRec.list.every(function (t) {
          return t.handler !== 'runWeeklyTuner';
        }));

  // expired cache + no tagged labels → graceful not-enough-samples
  X.Utils.driveJsonPut('TUNER_CORPUS_FILE_ID', 'tuner-corpus.json', {
    ts: new Date(Date.now() - 8 * 86400000).toISOString(),
    perClass: {}, samples: many,
  });
  const run4 = X.runWeeklyTuner();
  check('tuner: expired cache + empty mailbox → graceful refusal',
        run4.ok === false && run4.reason === 'not-enough-samples');
  X.CONFIG.trainer.tune = origTune;
})();

console.log(failures === 0 ? '\nAll sandbox tests passed ✔' : '\n' + failures + ' test(s) FAILED ✘');
process.exitCode = failures === 0 ? 0 : 1;
