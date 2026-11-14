/**
 * State.gs — mutable state via PropertiesService (ARCHITECTURE.md §4.8).
 * Keys: GEMINI_API_KEY, LAST_RUN, SENDER_CACHE.
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

  /** Fingerprint do modelo gravado na última passada COMPLETA do reprocessProcessed. */
  function getReprocessFingerprint() { return get('REPROCESS_FINGERPRINT', ''); }
  function setReprocessFingerprint(fp) { set('REPROCESS_FINGERPRINT', String(fp || '')); }

  function getApiKey() { return get('GEMINI_API_KEY', ''); }

  /** Lazy-loaded sender → categoryId map (memoized for the whole run). */
  function getSenderCache() {
    if (memo.senderCache) return memo.senderCache;
    try { memo.senderCache = JSON.parse(get('SENDER_CACHE', '{}')) || {}; }
    catch (e) { memo.senderCache = {}; }
    return memo.senderCache;
  }

  /**
   * Cache a verdict per sender. Entries are {c: categoryId, nr: 0|1} — the
   * needs-review flag travels with the verdict so cache hits keep the
   * precision signal. Legacy plain-string entries are treated as unflagged.
   */
  function cacheSender(email, categoryId, needsReview) {
    getSenderCache()[String(email).toLowerCase()] = { c: categoryId, nr: needsReview ? 1 : 0 };
  }

  /** Prune oldest entries (insertion order) while over CONFIG limit, then persist. */
  function saveSenderCache() {
    if (!memo.senderCache) return;
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
    getReprocessFingerprint: getReprocessFingerprint,
    setReprocessFingerprint: setReprocessFingerprint,
    getSenderCache: getSenderCache,
    cacheSender: cacheSender,
    saveSenderCache: saveSenderCache,
  };
})();
