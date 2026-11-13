/* store.js — everything the learner produces: per-question statistics, the
 * attempt history, notes, daily totals, the round in progress, preferences.
 *
 * All of it goes through QL.store.backend, an object with get / set / remove
 * on string values. The default keeps data in this browser's localStorage and
 * falls back to memory when storage is unavailable. To sync elsewhere, assign
 * another backend with the same three methods before QL.app.init() runs.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var PREFIX = 'quiz-ledger.';
  var NAMES = ['stats', 'history', 'notes', 'daily', 'round', 'prefs'];
  var HISTORY_CAP = 5000;
  var WRONG_RATE = 0.3;           // a question joins the wrong-answer set above this error rate
  var mem = {};
  var cache = {};

  var local = {
    get: function (k) {
      var v = null;
      try { v = root.localStorage.getItem(PREFIX + k); } catch (e) { /* storage blocked */ }
      return v != null ? v : (k in mem ? mem[k] : null);
    },
    set: function (k, v) {
      mem[k] = v;
      try { root.localStorage.setItem(PREFIX + k, v); return true; } catch (e) { return false; }
    },
    remove: function (k) {
      delete mem[k];
      try { root.localStorage.removeItem(PREFIX + k); } catch (e) { /* storage blocked */ }
    }
  };

  function blank(name) { return name === 'history' ? [] : (name === 'round' ? null : {}); }

  function read(name) {
    if (name in cache) return cache[name];
    var v = blank(name), raw = store.backend.get(name + '.v1');
    if (raw) { try { v = JSON.parse(raw); } catch (e) { v = blank(name); } }
    if (v == null && name !== 'round') v = blank(name);
    cache[name] = v;
    return v;
  }

  function write(name, value) {
    cache[name] = value;
    if (value == null) { store.backend.remove(name + '.v1'); return true; }
    return store.backend.set(name + '.v1', JSON.stringify(value));
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var store = {
    backend: local,
    WRONG_RATE: WRONG_RATE,

    stat: function (key) { return read('stats')[key] || null; },
    stats: function () { return read('stats'); },
    isWrong: function (s) { return !!s && s.a > 0 && (s.a - s.c) / s.a > WRONG_RATE; },

    /** Record one graded attempt. picks: the option labels chosen (for the frequency bars). */
    record: function (q, ua, ca, ok, picks) {
      var stats = read('stats');
      var s = stats[q.key] || (stats[q.key] = { a: 0, c: 0, oc: {} });
      s.a += 1;
      if (ok) s.c += 1;
      (picks || []).forEach(function (p) { s.oc[p] = (s.oc[p] || 0) + 1; });
      write('stats', stats);

      var history = read('history');
      history.unshift({ t: Date.now(), k: q.key, c: q.bank, id: q.id, ty: q.type, ua: ua, ca: ca, ok: !!ok });
      if (history.length > HISTORY_CAP) history.length = HISTORY_CAP;
      write('history', history);

      var daily = read('daily'), day = today();
      var d = daily[day] || (daily[day] = {});
      var c = d[q.bank] || (d[q.bank] = {});
      var cell = c[q.type] || (c[q.type] = [0, 0]);
      cell[0] += 1;
      if (ok) cell[1] += 1;
      write('daily', daily);
    },

    history: function () { return read('history'); },
    clearHistory: function () { write('history', []); },
    daily: function () { return read('daily'); },

    note: function (key) { return read('notes')[key] || ''; },
    setNote: function (key, textValue) {
      var notes = read('notes'), v = String(textValue || '').trim();
      if (v) notes[key] = v; else delete notes[key];
      write('notes', notes);
    },

    pref: function (key, fallback) { var p = read('prefs'); return key in p ? p[key] : fallback; },
    setPref: function (key, value) { var p = read('prefs'); p[key] = value; write('prefs', p); },

    round: function () { return read('round'); },
    setRound: function (r) { write('round', r); },

    exportAll: function () {
      var data = {};
      NAMES.forEach(function (n) { data[n] = read(n); });
      return { app: 'quiz-ledger', version: 1, exportedAt: new Date().toISOString(), data: data };
    },
    /** Replace everything with a backup. Returns false when the object is not a backup. */
    importAll: function (obj) {
      if (!obj || obj.app !== 'quiz-ledger' || !obj.data || typeof obj.data !== 'object') return false;
      if (obj.data.stats && typeof obj.data.stats !== 'object') return false;
      if (obj.data.history && !Array.isArray(obj.data.history)) return false;
      NAMES.forEach(function (n) { write(n, n in obj.data ? obj.data[n] : blank(n)); });
      return true;
    },
    clearAll: function () {
      var prefs = read('prefs');
      NAMES.forEach(function (n) { write(n, blank(n)); });
      write('prefs', prefs);            // keep palette and language
    }
  };

  QL.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
