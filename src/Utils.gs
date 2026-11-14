/**
 * Utils.gs — parsing, retry/backoff, date and logging helpers.
 * All Apps Script services are guarded so the modules also load under Node
 * (see tests/sandbox.test.js).
 */
const Utils = (function () {

  /** RFC-5322-ish `Name <addr>` parsing → { email, name, domain } */
  function parseFromHeader(raw) {
    raw = String(raw || '').trim();
    const m = raw.match(/^(.*?)\s*<([^>]+)>/);
    let email, name;
    if (m) {
      name = m[1].trim().replace(/^"(.*)"$/, '$1');
      email = m[2].trim();
    } else {
      email = raw;
      name = '';
    }
    email = email.toLowerCase();
    const at = email.indexOf('@');
    const domain = at !== -1 ? email.slice(at + 1) : '';
    if (!name && at !== -1) name = email.slice(0, at).replace(/[._\-]+/g, ' ');
    return { email: email, name: name, domain: domain };
  }

  /** True when senderDomain equals ruleDomain or is a subdomain of it. */
  function matchesDomain(senderDomain, ruleDomain) {
    senderDomain = String(senderDomain || '').toLowerCase();
    ruleDomain = String(ruleDomain || '').toLowerCase();
    if (!senderDomain || !ruleDomain) return false;
    return senderDomain === ruleDomain ||
           senderDomain.slice(-(ruleDomain.length + 1)) === '.' + ruleDomain;
  }

  function truncate(s, n) {
    s = String(s == null ? '' : s);
    return s.length <= n ? s : s.slice(0, n - 1) + '…';
  }

  /** Date → formatted string using the script timezone when available. */
  function formatDate(d, fmt) {
    if (typeof Utilities !== 'undefined') {
      try { return Utilities.formatDate(d, Session.getScriptTimeZone(), fmt); } catch (e) { /* fall through */ }
    }
    return d.toISOString();
  }

  function isoNow() { return formatDate(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX"); }

  function log(msg) {
    try { console.log('GMO: ' + msg); } catch (e) { /* ignore */ }
  }

  function sleep(ms) {
    if (typeof Utilities !== 'undefined') Utilities.sleep(ms);
  }

  /**
   * retryWithBackoff(fn, { retries, baseMs, isRetriable }) — used by EmbeddingClassifier
   * and around flaky writes. Non-retriable errors rethrow immediately.
   */
  function retryWithBackoff(fn, opts) {
    opts = opts || {};
    const retries = opts.retries == null ? 2 : opts.retries;
    const baseMs = opts.baseMs || 1000;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) sleep(baseMs * Math.pow(2, attempt - 1));
      try {
        return fn();
      } catch (e) {
        lastErr = e;
        if (opts.isRetriable && !opts.isRetriable(e)) throw e;
      }
    }
    throw lastErr;
  }

  /**
   * Drive JSON storage keyed by a Script-Properties **file ID** — designed for
   * the narrow `drive.file` scope. Uses the Drive API v3 REST endpoints with
   * the script's own OAuth token: DriveApp.getFilesByName/createFile demand the
   * broad `drive` scope, which we deliberately do NOT request. Stale IDs (file
   * deleted by the user) degrade gracefully and are recreated on the next put.
   */
  const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files/';
  const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files/';

  function oauthToken() {
    try {
      return (typeof ScriptApp !== 'undefined' &&
              typeof ScriptApp.getOAuthToken === 'function')
        ? ScriptApp.getOAuthToken() : null;
    } catch (e) { return null; }
  }

  function driveJsonGet(storeKey, fileName) {
    const id = State.get(storeKey, '');
    if (!id) return null;
    const token = oauthToken();
    if (!token || typeof UrlFetchApp === 'undefined') return null;
    try {
      const res = UrlFetchApp.fetch(DRIVE_FILES + encodeURIComponent(id) + '?alt=media', {
        method: 'get',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code === 404) {
        State.set(storeKey, ''); // file deleted by the user → recreate next put
        return null;
      }
      if (code < 200 || code >= 300) {
        log('Drive read failed for "' + fileName + '" (HTTP ' + code + ').');
        return null;
      }
      return JSON.parse(res.getContentText());
    } catch (e) {
      log('Drive read failed for "' + fileName + '": ' + e);
      return null;
    }
  }

  function driveJsonPut(storeKey, fileName, value) {
    const json = JSON.stringify(value);
    const token = oauthToken();
    if (!token || typeof UrlFetchApp === 'undefined') return null;
    const id = State.get(storeKey, '');
    if (id) { // update-in-place when we already own a file id
      try {
        const res = UrlFetchApp.fetch(
          DRIVE_UPLOAD + encodeURIComponent(id) + '?uploadType=media', {
            method: 'patch',
            contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + token },
            payload: json,
            muteHttpExceptions: true,
          });
        const code = res.getResponseCode();
        if (code >= 200 && code < 300) return id;
        log('Drive update failed for "' + fileName + '" (HTTP ' + code + ') — recreating.');
        State.set(storeKey, '');
      } catch (e) { State.set(storeKey, ''); }
    }
    try { // create (multipart: metadata + media)
      const boundary = 'GMO' + Date.now();
      const payload = '--' + boundary + '\r\n' +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify({ name: fileName }) + '\r\n' +
        '--' + boundary + '\r\n' +
        'Content-Type: application/json\r\n\r\n' + json + '\r\n' +
        '--' + boundary + '--';
      const res = UrlFetchApp.fetch(DRIVE_UPLOAD + '?uploadType=multipart', {
        method: 'post',
        contentType: 'multipart/related; boundary=' + boundary,
        headers: { Authorization: 'Bearer ' + token },
        payload: payload,
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code < 200 || code >= 300) {
        log('Drive create failed for "' + fileName + '" (HTTP ' + code + '). ' +
            String(res.getContentText() || '').slice(0, 180));
        return null;
      }
      const newId = JSON.parse(res.getContentText()).id;
      State.set(storeKey, newId);
      return newId;
    } catch (e) {
      log('Drive create failed for "' + fileName + '": ' + e);
      return null;
    }
  }

  return {
    parseFromHeader: parseFromHeader,
    matchesDomain: matchesDomain,
    truncate: truncate,
    formatDate: formatDate,
    isoNow: isoNow,
    log: log,
    sleep: sleep,
    retryWithBackoff: retryWithBackoff,
    driveJsonGet: driveJsonGet,
    driveJsonPut: driveJsonPut,
  };
})();
