/**
 * TreeModel.gs — hand-crafted decision tree, v2.1 LANGUAGE-FIRST
 * (source 1 of 3 in ARCHITECTURE.md §4.5). Node ids MUST equal their array
 * index (the evaluator addresses children by index).
 *
 * Shape: node 0 tests lang_pt, node 2 tests lang_es (English is the remainder)
 * — language identification is literally the first node(s). Each language
 * branch runs its own bulk/job/money composites; the tail splits the promo
 * (ads_signal) and headline (news_signal) composites — fed by the promo/news
 * markers and kw_ flags in DecisionTree.gs — before deferring. Leaves stay
 * conservative (null = defer downstream to the embedding tier) unless
 * confidence ≥ minConfidence (0.85).
 */
const TREE_MODEL = {
  version: '2.1-handcrafted-language-first',
  trainedAt: '2026-11-09',
  features: [
    'lang_pt', 'lang_es', 'bulk_pt', 'job_pt', 'money_pt',
    'bulk_es', 'job_es', 'via_linkedin_name', 'job_signal',
    'is_reply', 'sender_free_domain', 'many_recipients', 'money_signal',
    'ads_signal', 'news_signal',
  ],
  nodes: [
    /*  0 */ { feature: 'lang_pt',            threshold: 0.5, yes: 1,  no: 2 },
    /*  1 */ { feature: 'bulk_pt',            threshold: 0.5, yes: 3,  no: 4 },
    /*  2 */ { feature: 'lang_es',            threshold: 0.5, yes: 5,  no: 14 },
    /*  3 */ { leaf: true, class: 'newsletters', confidence: 0.88 },
    /*  4 */ { feature: 'job_pt',             threshold: 0.5, yes: 6,  no: 7 },
    /*  5 */ { feature: 'bulk_es',            threshold: 0.5, yes: 8,  no: 9 },
    /*  6 */ { leaf: true, class: 'job-search',   confidence: 0.88 },
    /*  7 */ { feature: 'money_pt',           threshold: 0.5, yes: 10, no: 11 },
    /*  8 */ { leaf: true, class: 'newsletters',  confidence: 0.88 },
    /*  9 */ { feature: 'job_es',             threshold: 0.5, yes: 12, no: 13 },
    /* 10 */ { leaf: true, class: null,           confidence: 0.60 },
    /* 11 */ { feature: 'news_signal',        threshold: 0.5, yes: 24, no: 25 },
    /* 12 */ { leaf: true, class: 'job-search',   confidence: 0.88 },
    /* 13 */ { leaf: true, class: null,           confidence: 0.50 },
    /* 14 */ { feature: 'via_linkedin_name',  threshold: 0.5, yes: 15, no: 17 },
    /* 15 */ { feature: 'job_signal',         threshold: 0.5, yes: 16, no: 13 },
    /* 16 */ { leaf: true, class: 'job-search',   confidence: 0.90 },
    /* 17 */ { feature: 'is_reply',           threshold: 0.5, yes: 11, no: 18 },
    /* 18 */ { feature: 'sender_free_domain', threshold: 0.5, yes: 19, no: 21 },
    /* 19 */ { feature: 'many_recipients',    threshold: 0.5, yes: 20, no: 11 },
    /* 20 */ { leaf: true, class: 'newsletters',  confidence: 0.85 },
    /* 21 */ { feature: 'money_signal',       threshold: 0.5, yes: 10, no: 22 },
    /* 22 */ { feature: 'ads_signal',         threshold: 0.5, yes: 23, no: 25 },
    /* 23 */ { leaf: true, class: 'ads',          confidence: 0.88 },
    /* 24 */ { leaf: true, class: 'news',         confidence: 0.88 },
    /* 25 */ { leaf: true, class: null,           confidence: 0.50 },
  ],
};

