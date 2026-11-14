/**
 * DecisionTree.gs — local inference tier (ARCHITECTURE.md §4.5).
 * Evaluates a JSON decision tree in pure JS before the embedding tier runs.
 * LANGUAGE COMES FIRST: the tree's opening nodes test the detected language
 * (lang_pt → lang_es; English is the remainder) and every branch uses
 * language-aware signal composites (bulk_pt / job_es / money_en …).
 * Model source: CONFIG.decisionTree.modelSource — 'TreeModel.gs' (const in the
 * project) or 'drive:<fileName>' (JSON file in Drive). Missing/malformed model
 * → the tier is skipped silently and rules + embeddings still classify everything.
 */
const DecisionTree = (function () {
  let modelCache = null;
  let modelLoaded = false;

  // Trilingual stopwords for the language detector — accent-stripped,
  // word-boundary matched, and kept deliberately unambiguous across languages.
  const LANGUAGES = [
    { id: 'en', stopwords: ['the', 'and', 'you', 'your', 'with', 'this', 'that',
                            'from', 'have', 'please', 'click', 'here', 'our',
                            'about', 'team', 'more'] },
    { id: 'pt', stopwords: ['voce', 'seu', 'sua', 'nao', 'nosso', 'nossa',
                            'obrigado', 'entao', 'tambem', 'mais', 'muito',
                            'pelo', 'pela', 'pra', 'pro', 'disso'] },
    { id: 'es', stopwords: ['gracias', 'hola', 'saludos', 'usted', 'sus',
                            'pero', 'ademas', 'asi', 'mucho', 'nuestro',
                            'nuestra', 'debe', 'deben', 'esto', 'estos'] },
  ];

  // Language-specific bulk/job/money/promo/news markers (accent-stripped matching).
  const LANG_MARKERS = {
    pt: {
      bulk: ['descadastre', 'descadastrar', 'cancelar inscricao', 'boletim',
             'novidades', 'nao quer mais receber'],
      job: ['vaga', 'vagas', 'candidato', 'candidatura', 'curriculo', 'emprego'],
      money: ['fatura', 'boleto', 'pagamento', 'extrato', 'cobranca'],
      promo: ['promocao', 'desconto', 'cupom', 'ofertas exclusivas',
              'black friday', 'imperdivel'],
      news: ['ultimas noticias', 'manchetes', 'noticias de hoje',
             'breaking news'],
    },
    es: {
      bulk: ['darse de baja', 'cancelar suscripcion', 'boletin', 'novedades',
             'suscripcion'],
      job: ['empleo', 'vacante', 'trabajo', 'candidato', 'curriculum',
            'convocatoria'],
      money: ['factura', 'pago', 'cobro', 'estado de cuenta', 'transferencia'],
      promo: ['descuento', 'promocion', 'cupon', 'oferta exclusiva',
              'aprovecha'],
      news: ['noticias de ultima hora', 'ultimas noticias', 'titulares'],
    },
    en: {
      bulk: ['unsubscribe', 'newsletter', 'digest', 'webinar', 'mailing list'],
      job: ['job alert', 'hiring', 'vacancy', 'job opening',
            'application received', 'interview invitation'],
      money: ['invoice', 'payment', 'statement', 'billing', 'receipt'],
      promo: ['discount', 'coupon', 'promo code', 'flash sale', 'sale ends',
              'limited time offer', 'shop now'],
      news: ['breaking news', 'top headlines', 'latest headlines', 'news alert'],
    },
  };

  function loadModel() {
    if (modelLoaded) return modelCache;
    modelLoaded = true;
    try {
      const src = CONFIG.decisionTree.modelSource || 'TreeModel.gs';
      if (src === 'TreeModel.gs') {
        modelCache = (typeof TREE_MODEL !== 'undefined') ? TREE_MODEL : null;
      } else if (src.indexOf('drive:') === 0) {
        const name = src.slice(6);
        const it = DriveApp.getFilesByName(name);
        if (it.hasNext()) modelCache = JSON.parse(it.next().getBlob().getDataAsString());
      }
    } catch (e) {
      Utils.log('DecisionTree: model load failed — tier disabled. ' + e);
      modelCache = null;
    }
    return modelCache;
  }

  function normalizeText(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function wordHits(normText, word) {
    const re = new RegExp('(^|[^a-z0-9])' + word + '([^a-z0-9]|$)', 'g');
    const m = normText.match(re);
    return m ? m.length : 0;
  }

  function matchesAny(list, normText) {
    for (let i = 0; i < list.length; i++) {
      if (wordHits(normText, list[i]) > 0) return 1;
    }
    return 0;
  }

  /**
   * detectLanguage(text) → { lang: 'en'|'pt'|'es', confident, scores }
   * Stopword density (accent-stripped, word boundaries) + diacritic bias
   * (ã õ ç â ê ô → PT; ñ ¿ ¡ → ES), gated by CONFIG.language thresholds.
   */
  function detectLanguage(text) {
    const raw = String(text || '');
    const norm = normalizeText(raw);
    const counts = { en: 0, pt: 0, es: 0 };
    LANGUAGES.forEach(function (L) {
      L.stopwords.forEach(function (w) { counts[L.id] += wordHits(norm, w); });
    });
    counts.pt += Math.min((raw.match(/[ãõçâêô]/g) || []).length, 3);
    counts.es += Math.min((raw.match(/[ñ¿¡]/g) || []).length, 3);
    let winner = 'en';
    let best = -1;
    let total = 0;
    ['en', 'pt', 'es'].forEach(function (id) {
      total += counts[id];
      if (counts[id] > best) { best = counts[id]; winner = id; }
    });
    const confident = total > 0 && best >= CONFIG.language.minMatches &&
                      (best / total) >= CONFIG.language.minMargin;
    return { lang: winner, confident: confident, scores: counts };
  }


  /**
   * Binary feature flags. kw_/dom_ mirror the Config.gs rule lists; language
   * flags + per-language composites and the structural flags (body-scan,
   * headers) carry the signal the flat rules cannot express.
   */
  function buildFeatures(msg) {
    const subject = String(msg.subject || '');
    const snippet = String(msg.snippet || '');
    const name = String(msg.name || '');
    const hay = (subject + ' ' + snippet).toLowerCase();
    const nameHay = name.toLowerCase();
    const scanNorm = normalizeText(subject + ' ' +
                                   String(msg.bodyScan || msg.snippet || ''));
    const f = {};

    CATEGORIES.forEach(function (c) {
      (c.rules.keywords || []).forEach(function (kw) {
        const k = kw.toLowerCase();
        f['kw_' + k.replace(/[^a-z0-9]+/g, '_')] =
          (hay.indexOf(k) !== -1 || nameHay.indexOf(k) !== -1) ? 1 : 0;
      });
      (c.rules.domains || []).forEach(function (d) {
        f['dom_' + d.toLowerCase().replace(/[^a-z0-9.]+/g, '_')] =
          (msg.domain && Utils.matchesDomain(msg.domain, d)) ? 1 : 0;
      });
    });

    // language (EN/PT/ES) — one-hot winner + confidence flag
    const lang = detectLanguage(subject + ' ' + bodyScanOf(msg));
    f.lang_en = lang.lang === 'en' ? 1 : 0;
    f.lang_pt = lang.lang === 'pt' ? 1 : 0;
    f.lang_es = lang.lang === 'es' ? 1 : 0;
    f.lang_confident = lang.confident ? 1 : 0;

    // per-language signal composites (accent-stripped, word-boundary matched)
    f.bulk_pt = matchesAny(LANG_MARKERS.pt.bulk, scanNorm);
    f.bulk_es = matchesAny(LANG_MARKERS.es.bulk, scanNorm);
    f.bulk_en = matchesAny(LANG_MARKERS.en.bulk, scanNorm);
    f.job_pt = matchesAny(LANG_MARKERS.pt.job, scanNorm);
    f.job_es = matchesAny(LANG_MARKERS.es.job, scanNorm);
    f.job_en = matchesAny(LANG_MARKERS.en.job, scanNorm);
    f.money_pt = matchesAny(LANG_MARKERS.pt.money, scanNorm);
    f.money_es = matchesAny(LANG_MARKERS.es.money, scanNorm);
    f.money_en = matchesAny(LANG_MARKERS.en.money, scanNorm);
    f.promo_pt = matchesAny(LANG_MARKERS.pt.promo, scanNorm);
    f.promo_es = matchesAny(LANG_MARKERS.es.promo, scanNorm);
    f.promo_en = matchesAny(LANG_MARKERS.en.promo, scanNorm);
    f.news_pt = matchesAny(LANG_MARKERS.pt.news, scanNorm);
    f.news_es = matchesAny(LANG_MARKERS.es.news, scanNorm);
    f.news_en = matchesAny(LANG_MARKERS.en.news, scanNorm);

    f.has_unsubscribe = /unsubscribe|descadastre|darse de baja/i.test(
      subject + ' ' + bodyScanOf(msg)) ? 1 : 0;
    f.has_attachment = (msg.attachmentCount || 0) > 0 ? 1 : 0;
    f.is_reply = /^re\s*:/i.test(subject) ? 1 : 0;
    f.many_recipients = (msg.toCount || 0) > 3 ? 1 : 0;
    f.sender_free_domain = FREE_DOMAINS.indexOf(msg.domain) !== -1 ? 1 : 0;
    f.subject_len_long = subject.length > 60 ? 1 : 0;
    f.via_linkedin_name = /via linkedin/i.test(name) ? 1 : 0;
    f.cc_present = (msg.ccCount || 0) > 0 ? 1 : 0;
    f.many_links = (msg.linkCount || 0) >= 5 ? 1 : 0;
    f.body_long = (msg.bodyLength || 0) > 2500 ? 1 : 0;
    f.multi_message_thread = (msg.threadMsgCount || 0) > 1 ? 1 : 0;
    f.has_user_labels = (msg.userLabels || []).length > 0 ? 1 : 0;
    f.has_pdf_attachment = (msg.attachmentNames || []).some(function (a) {
      return /\.pdf$/i.test(String(a));
    }) ? 1 : 0;

    // composites over the config keyword flags (key names derive from CONFIG)
    f.job_signal = (f.kw_job_alert || f.kw_new_jobs || f.kw_vaga ||
                    f.kw_interview_invitation || f.kw_sent_you_a_message ||
                    f.kw_shared_a_job || f.job_pt || f.job_es || f.job_en) ? 1 : 0;
    f.money_signal = (f.kw_invoice || f.kw_fatura || f.kw_payment ||
                      f.kw_statement || f.money_pt || f.money_es ||
                      f.money_en) ? 1 : 0;
    f.bulk_signal = (f.has_unsubscribe && (f.kw_newsletter || f.kw_digest ||
                      f.bulk_pt || f.bulk_es)) ? 1 : 0;
    f.ads_signal = (f.kw_desconto || f.kw_cupom || f.kw_cupon ||
                    f.kw_promocao || f.kw_promocion || f.kw_descuento ||
                    f.kw_black_friday || f.kw_liquidacao || f.kw_coupon ||
                    f.kw_promo_code || f.kw_flash_sale || f.kw_discount ||
                    f.promo_pt || f.promo_es || f.promo_en) ? 1 : 0;
    f.news_signal = (f.kw_breaking_news || f.kw_top_headlines ||
                     f.kw_ultimas_noticias || f.kw_noticias_de_hoje ||
                     f.kw_noticias_de_ultima_hora || f.kw_manchetes_de_hoje ||
                     f.news_pt || f.news_es || f.news_en) ? 1 : 0;
    return f;
  }

  function bodyScanOf(msg) {
    return String(msg.bodyScan || msg.snippet || '');
  }

  const FREE_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                        'live.com', 'icloud.com', 'uol.com.br', 'bol.com.br',
                        'terra.com.br', 'globo.com'];

  /**
   * evaluate(features, model?) → { category, confidence } | null
   * model defaults to the configured one; null = leaf is inconclusive or
   * confidence < minConfidence → defer downstream (embedding tier).
   */
  function evaluate(features, model) {
    model = model || loadModel();
    if (!model || !model.nodes || !model.nodes.length) return null;
    let node = model.nodes[0];
    let guard = 0;
    while (node && !node.leaf && guard++ < 64) {
      const value = features[node.feature] || 0;
      const next = (value >= (node.threshold == null ? 0.5 : node.threshold))
        ? node.yes : node.no;
      node = model.nodes[next];
    }
    if (!node || !node.leaf) return null;
    if (!node.class || node.confidence == null) return null;
    if (node.confidence < CONFIG.decisionTree.minConfidence) return null;
    return { category: node.class, confidence: node.confidence };
  }

  function evaluateMessage(msg) { return evaluate(buildFeatures(msg)); }

  return {
    loadModel: loadModel,
    buildFeatures: buildFeatures,
    detectLanguage: detectLanguage,
    normalizeText: normalizeText,
    matchesAny: matchesAny,
    evaluate: evaluate,
    evaluateMessage: evaluateMessage,
  };
})();
