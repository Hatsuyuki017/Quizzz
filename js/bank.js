/* bank.js — the catalog and the banks behind it.
 *
 * banks/catalog.json lists semesters, and under each the courses with the path
 * of their bank file. Adding a course or a semester means adding a bank file
 * and one catalog entry; nothing in the code names a course.
 * Banks load on demand and are normalised once, so views only ever see the
 * shape built in `normalise` below.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var TYPES = ['true_false', 'single_choice', 'multiple_choice', 'fill_blank'];
  var BASE = 'banks/';

  function fetchJSON(url) {
    return root.fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' (' + r.status + ')');
      return r.json();
    });
  }

  /** Returns a reason when the question cannot be used, otherwise ''. */
  function problem(q, units) {
    if (!q || typeof q !== 'object') return 'not an object';
    if (typeof q.id !== 'string' || !q.id) return 'missing id';
    if (TYPES.indexOf(q.type) < 0) return 'unknown type ' + q.type;
    if (typeof q.question !== 'string' || !q.question.trim()) return 'missing question';
    if (!(q.unit in units)) return 'unknown unit ' + q.unit;
    if (q.type === 'true_false') return typeof q.answer === 'boolean' ? '' : 'answer must be true or false';
    if (q.type === 'fill_blank') {
      return Array.isArray(q.answer) && q.answer.length && q.answer.every(function (a) { return typeof a === 'string'; })
        ? '' : 'answer must be an array of strings';
    }
    if (!Array.isArray(q.options) || q.options.length < 2) return 'options missing';
    var labels = q.options.map(function (o) { return o && o.label; });
    if (q.type === 'single_choice') return labels.indexOf(q.answer) >= 0 ? '' : 'answer is not an option label';
    return Array.isArray(q.answer) && q.answer.length && q.answer.every(function (a) { return labels.indexOf(a) >= 0; })
      ? '' : 'answer must be an array of option labels';
  }

  function normalise(raw, entry) {
    var course = raw.course || {};
    var bank = {
      id: entry.id, code: course.code || entry.code || entry.id, title: course.title || entry.title || entry.id,
      course: course, meta: raw.meta || {}, units: [], unitMap: {}, questions: [], byId: {}, figures: {}, issues: [],
      counts: {}, hasDifficulty: false
    };
    (raw.units || []).forEach(function (u, i) {
      if (!u || u.id == null) return;
      var unit = { id: String(u.id), title: u.title || String(u.id), group: u.group || '', index: i, count: 0 };
      bank.units.push(unit);
      bank.unitMap[unit.id] = unit;
    });
    (raw.questions || []).forEach(function (q, i) {
      if (q && Array.isArray(q.options) === false && q.options && typeof q.options === 'object') {
        q.options = Object.keys(q.options).map(function (k) { return { label: k, text: q.options[k] }; });
      }
      var why = problem(q, bank.unitMap);
      if (!why && bank.byId[q.id]) why = 'duplicate id';
      if (why) { bank.issues.push((q && q.id ? q.id : '#' + i) + ': ' + why); return; }
      var fig = q.figure && typeof q.figure.latex === 'string'
        ? { key: q.figure.id || q.id, latex: q.figure.latex, caption: q.figure.caption || '' } : null;
      var item = {
        key: bank.id + ':' + q.id, id: q.id, bank: bank.id, type: q.type, unit: String(q.unit),
        section: q.section || '', topic: q.topic || '', difficulty: q.difficulty || 0,
        question: q.question, options: q.options || null, answer: q.answer, accept: q.accept || null,
        explanation: q.explanation || '', figure: fig, order: i
      };
      if (item.type === 'multiple_choice') item.answer = item.answer.slice().sort();
      if (item.difficulty) bank.hasDifficulty = true;
      bank.questions.push(item);
      bank.byId[item.id] = item;
      bank.counts[item.type] = (bank.counts[item.type] || 0) + 1;
      bank.unitMap[item.unit].count += 1;
    });
    if (bank.issues.length && root.console) root.console.warn('[quiz-ledger] ' + bank.id + ': skipped', bank.issues);
    return bank;
  }

  var catalog = {
    TYPES: TYPES,
    semesters: [],
    courses: {},          // id -> { id, code, title, bank, semester, slot }
    banks: {},            // id -> normalised bank
    pending: {},
    defaultSemester: '',

    init: function () {
      return fetchJSON(BASE + 'catalog.json').then(function (data) {
        catalog.semesters = (data.semesters || []).filter(function (s) { return s && s.id && Array.isArray(s.courses); });
        catalog.semesters.forEach(function (s) {
          s.courses = s.courses.filter(function (c) { return c && c.id && c.bank; });
          s.courses.forEach(function (c, i) {
            c.semester = s.id;
            c.slot = c.color || (i % 5) + 1;       // which of the five palette colours marks the course
            catalog.courses[c.id] = c;
          });
        });
        if (!catalog.semesters.length) throw new Error('catalog.json lists no semesters');
        var ids = catalog.semesters.map(function (s) { return s.id; });
        catalog.defaultSemester = ids.indexOf(data.default_semester) >= 0 ? data.default_semester : ids[ids.length - 1];
        return catalog;
      });
    },

    semester: function (id) {
      return catalog.semesters.filter(function (s) { return s.id === id; })[0] || null;
    },

    /** Load one bank (and its compiled figures). Resolves with the bank, or null when it cannot be read. */
    load: function (id) {
      if (catalog.banks[id]) return Promise.resolve(catalog.banks[id]);
      if (catalog.pending[id]) return catalog.pending[id];
      var entry = catalog.courses[id];
      if (!entry) return Promise.resolve(null);
      var url = BASE + entry.bank;
      var figures = fetchJSON(url.replace(/\.json$/, '.figures.json')).catch(function () { return {}; });
      catalog.pending[id] = Promise.all([fetchJSON(url), figures]).then(function (res) {
        var bank = normalise(res[0], entry);
        bank.figures = res[1] || {};
        catalog.banks[id] = bank;
        delete catalog.pending[id];
        return bank;
      }).catch(function (e) {
        delete catalog.pending[id];
        entry.error = e.message;
        if (root.console) root.console.error('[quiz-ledger] cannot load bank ' + id, e);
        return null;
      });
      return catalog.pending[id];
    },

    loadMany: function (ids) { return Promise.all(ids.map(catalog.load)); },

    question: function (key) {
      var i = String(key).indexOf(':');
      var bank = catalog.banks[key.slice(0, i)];
      return bank ? bank.byId[key.slice(i + 1)] || null : null;
    },

    /** SVG of a question's figure as a data URI, or '' when it has not been compiled. */
    figureSrc: function (q) {
      var bank = catalog.banks[q.bank];
      var f = q.figure && bank && bank.figures[q.figure.key];
      return f && f.svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.svg) : '';
    }
  };

  QL.catalog = catalog;
  QL.TYPES = TYPES;
})(typeof window !== 'undefined' ? window : globalThis);
