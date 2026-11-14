/**
 * State.gs — mutable state via PropertiesService (ARCHITECTURE.md §4.8).
 * Keys: GEMINI_API_KEY, LAST_RUN, SENDER_CACHE (verdicts, TTL'd),
 * REPROCESS_OFFSET/BUCKET, REPROCESS_FINGERPRINT, DAILY_USAGE (200/day cap).
 * Run-scope memo lives in State.memo (naturally cleared per execution).
 */
const State = (function () {
  const memo = { senderCache: null, apiKeyWarned: false };

  function props() { return PropertiesService.getScriptProperties(); }

  function get(key, def) {
    const v = props().getProperty(key);
    return (v === null || v === undefined) ? def : v;
  }

  function set(key, value) { props().setProperty(key, String(value)); }

  function getLastRun() {
    const v = get('LAST_RUN', '');
    const t = v ? new Date(v).getTime() : NaN;
    return isNaN(t) ? 0 : t;
  }

  function setLastRun(ms) { set('LAST_RUN', new Date(ms).toISOString()); }

  /** Cursor do batch reprocessProcessed: offset de página do Gmail já reavaliado. */
  function getReprocessOffset() { return parseInt(get('REPROCESS_OFFSET', '0'), 10) || 0; }
  function setReprocessOffset(n) { set('REPROCESS_OFFSET', String(Math.max(0, n | 0))); }

  /**
   * Balde oldest-first em uso pelo cursor (índice em OLDEST_FIRST_BUCKETS) —
   * quem foi processado há mais tempo é reavaliado primeiro.
   */
  function getReprocessBucket() { return parseInt(get('REPROCESS_BUCKET', '0'), 10) || 0; }
  function setReprocessBucket(n) { set('REPROCESS_BUCKET', String(Math.max(0, n | 0))); }

  /** Fingerprint do modelo gravado na última passada COMPLETA do reprocessProcessed. */
  function getReprocessFingerprint() { return get('REPROCESS_FINGERPRINT', ''); }
  function setReprocessFingerprint(fp) { set('REPROCESS_FINGERPRINT', String(fp || '')); }

  /**
   * Limite diário (CONFIG.dailyEmailLimit): ledger persistente de e-mails
   * (re)classificados no dia — {d: 'YYYY-MM-DD', n: count}. Reseta sozinho
   * quando o dia muda; somado entre execuções (trigger, manual e cards).
   */
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function getDailyUsage() {
    try {
      const u = JSON.parse(get('DAILY_USAGE', '{}')) || {};
      return u.d === todayStr() ? (u.n || 0) : 0;
    } catch (e) { return 0; }
  }

  function addDailyUsage(n) {
    const total = getDailyUsage() + (n || 0);
    set('DAILY_USAGE', JSON.stringify({ d: todayStr(), n: total }));
    return total;
  }

  function getApiKey() { return get('GEMINI_API_KEY', ''); }

  /** Lazy-loaded sender → categoryId map (memoized for the whole run). */
  function getSenderCache() {
    if (memo.senderCache) return memo.senderCache;
    try { memo.senderCache = JSON.parse(get('SENDER_CACHE', '{}')) || {}; }
    catch (e) { memo.senderCache = {}; }
    return memo.senderCache;
  }

  /**
   * Cache a verdict per sender. Entries are {c: categoryId, nr: 0|1, t: epochMs} —
   * the needs-review flag travels with the verdict so cache hits keep the
   * precision signal, and `t` drives CONFIG.senderCacheTtlDays (entries with no
   * timestamp — legacy strings / pre-TTL objects — count as expired).
   */
  function cacheSender(email, categoryId, needsReview) {
    getSenderCache()[String(email).toLowerCase()] = {
      c: categoryId, nr: needsReview ? 1 : 0, t: Date.now(),
    };
  }

  function ttlEnabled() { return CONFIG.senderCacheTtlDays > 0; }

  function isExpired(entry) {
    if (!ttlEnabled()) return false;
    const t = (entry && typeof entry === 'object') ? (entry.t || 0) : 0;
    return !t || (Date.now() - t) > CONFIG.senderCacheTtlDays * 86400000;
  }

  /**
   * lookupSender(email) → {category, needsReview} | null — the ONLY read path
   * for classify(). Enforces the TTL: entries older than
   * CONFIG.senderCacheTtlDays — or with no timestamp (legacy strings /
   * pre-TTL objects, age unknown) — return null so the current model
   * re-classifies. With the TTL disabled (0), legacy entries still read as
   * unflagged (schema evolution).
   */
  function lookupSender(email) {
    const cached = getSenderCache()[String(email || '').toLowerCase()];
    if (!cached || isExpired(cached)) return null;
    return (typeof cached === 'object')
      ? { category: cached.c, needsReview: !!cached.nr }
      : { category: cached, needsReview: false };
  }

  /**
   * peekSender(email) → {category, needsReview, expired} | null — lê a entrada
   * crua IGNORANDO o TTL. Usado para proteger vereditos antigos: se a entrada
   * expirou e o re-classify fresco só produz fallback (ex.: cota de embeddings
   * esgotada), serve a categoria antiga flagada em vez de degradar para
   * uncategorized.
   */
  function peekSender(email) {
    const cached = getSenderCache()[String(email || '').toLowerCase()];
    if (!cached) return null;
    return (typeof cached === 'object')
      ? { category: cached.c, needsReview: !!cached.nr, expired: isExpired(cached) }
      : { category: cached, needsReview: false, expired: ttlEnabled() };
  }

  /** Drop TTL-expired entries, prune oldest (insertion order) over the cap, persist. */
  function saveSenderCache() {
    if (!memo.senderCache) return;
    Object.keys(memo.senderCache).forEach(function (k) {
      if (isExpired(memo.senderCache[k])) delete memo.senderCache[k];
    });
    let json = JSON.stringify(memo.senderCache);
    while (json.length > CONFIG.senderCacheMaxBytes) {
      const keys = Object.keys(memo.senderCache);
      if (!keys.length) break;
      const drop = Math.max(1, Math.ceil(keys.length / 2));
      for (let i = 0; i < drop; i++) delete memo.senderCache[keys[i]];
      json = JSON.stringify(memo.senderCache);
    }
    set('SENDER_CACHE', json);
  }

  return {
    get: get,
    set: set,
    memo: memo,
    getLastRun: getLastRun,
    setLastRun: setLastRun,
    getApiKey: getApiKey,
    getReprocessOffset: getReprocessOffset,
    setReprocessOffset: setReprocessOffset,
    getReprocessBucket: getReprocessBucket,
    setReprocessBucket: setReprocessBucket,
    getReprocessFingerprint: getReprocessFingerprint,
    setReprocessFingerprint: setReprocessFingerprint,
    getSenderCache: getSenderCache,
    cacheSender: cacheSender,
    lookupSender: lookupSender,
    getDailyUsage: getDailyUsage,
    addDailyUsage: addDailyUsage,
    peekSender: peekSender,
    saveSenderCache: saveSenderCache,
  };
})();
