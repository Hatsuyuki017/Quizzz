/* quiz.js — building a round and grading it.
 *
 * A round is one sitting: a fixed list of questions grouped by type, each type
 * a tab that remembers its own position. The round is saved after every step,
 * so leaving the page or reloading never loses it. Ending the round settles it.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var TYPES = QL.TYPES;

  function shuffle(a) {
    var b = a.slice();
    for (var i = b.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), tmp = b[i];
      b[i] = b[j]; b[j] = tmp;
    }
    return b;
  }

  /* ---------- fill-in answers ---------- */

  function norm(s) {
    return String(s)
      .replace(/\$/g, '').replace(/−/g, '-')
      .replace(/\\[dt]frac/g, '\\frac')
      .replace(/\\(left|right|displaystyle)(?![a-zA-Z])/g, '').replace(/\\[,;!: ]/g, '')
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\frac\s*\{([A-Za-z0-9.]+)\}\s*\{([A-Za-z0-9.]+)\}/g, '$1/$2')
      .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\frac\s*(\d)\s*(\d)/g, '$1/$2')
      .replace(/\\(cdot|times)(?![a-zA-Z])/g, '*')
      .replace(/[{}\s]/g, '').replace(/[.。]$/, '').toLowerCase();
  }

  function num(s) {
    var m = /^(-?\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/.exec(s);
    if (!m) return NaN;
    return m[2] === undefined ? parseFloat(m[1]) : parseFloat(m[1]) / parseFloat(m[2]);
  }

  /** True when a typed answer certainly equals one of the accepted forms. */
  function blankMatches(typed, accepted) {
    var a = norm(typed);
    if (!a) return false;
    var x = num(a);
    return accepted.some(function (ref) {
      var b = norm(ref);
      if (a === b) return true;
      var y = num(b);
      return !isNaN(x) && !isNaN(y) && Math.abs(x - y) <= 1e-3 * Math.max(1, Math.abs(y));
    });
  }

  /* ---------- answers as short strings (history, feedback) ---------- */

  function answerText(q) {
    if (q.type === 'true_false') return q.answer ? 'T' : 'F';
    if (q.type === 'single_choice') return q.answer;
    if (q.type === 'multiple_choice') return q.answer.join(', ');
    return q.answer.join(' ; ');
  }

  /** Grade a response. ok is true / false, or null when a fill-in answer needs the learner's own verdict. */
  function grade(q, resp) {
    if (q.type === 'true_false') {
      return { ok: resp === q.answer, ua: resp ? 'T' : 'F', picks: [resp ? 'T' : 'F'] };
    }
    if (q.type === 'single_choice') return { ok: resp === q.answer, ua: resp, picks: [resp] };
    if (q.type === 'multiple_choice') {
      var sel = resp.slice().sort();
      return { ok: sel.join('|') === q.answer.join('|'), ua: sel.join(', ') || '—', picks: sel };
    }
    var inputs = q.answer.map(function (_, i) { return String(resp[i] == null ? '' : resp[i]).trim(); });
    var all = q.answer.every(function (ref, i) {
      return blankMatches(inputs[i], [ref].concat((q.accept && q.accept[i]) || []));
    });
    return { ok: all ? true : null, ua: inputs.map(function (s) { return s || '—'; }).join(' ; '), picks: [], inputs: inputs };
  }

  /* ---------- pools and rounds ---------- */

  /** Questions matching a set-up: { courses, types, units: {course: [ids]}, difficulty: [1,2,3], scope }. */
  function pool(opts) {
    var out = [];
    (opts.courses || []).forEach(function (cid) {
      var bank = QL.catalog.banks[cid];
      if (!bank) return;
      var units = opts.units && opts.units[cid];
      bank.questions.forEach(function (q) {
        if (opts.types && opts.types.indexOf(q.type) < 0) return;
        if (units && units.indexOf(q.unit) < 0) return;
        if (opts.difficulty && q.difficulty && opts.difficulty.indexOf(q.difficulty) < 0) return;
        var s = QL.store.stat(q.key);
        if (opts.scope === 'wrong' && !QL.store.isWrong(s)) return;
        if (opts.scope === 'unseen' && s && s.a > 0) return;
        out.push(q);
      });
    });
    return out;
  }

  function layout(round, list) {
    round.items = []; round.ranges = {}; round.pos = {};
    TYPES.forEach(function (ty) {
      var start = round.items.length;
      list.forEach(function (q) { if (q.type === ty) round.items.push(q.key); });
      if (round.items.length > start) { round.ranges[ty] = [start, round.items.length]; round.pos[ty] = start; }
    });
  }

  var quiz = {
    round: null,
    summary: null,
    grade: grade,
    answerText: answerText,
    pool: pool,

    start: function (opts) {
      var list = pool(opts);
      if (!list.length) return null;
      if (opts.order === 'shuffle') list = shuffle(list);
      else {
        var rank = {};
        opts.courses.forEach(function (c, i) { rank[c] = i; });
        list.sort(function (a, b) {
          if (a.bank !== b.bank) return rank[a.bank] - rank[b.bank];
          var ua = QL.catalog.banks[a.bank].unitMap[a.unit].index, ub = QL.catalog.banks[b.bank].unitMap[b.unit].index;
          return ua !== ub ? ua - ub : a.order - b.order;
        });
      }
      if (opts.limit > 0) list = list.slice(0, opts.limit);
      var round = { v: 1, started: Date.now(), scope: opts.scope || 'all', order: opts.order || 'seq', courses: opts.courses.slice(), answers: {} };
      layout(round, list);
      round.tab = TYPES.filter(function (ty) { return round.ranges[ty]; })[0];
      round.index = 0;
      quiz.round = round;
      quiz.summary = null;
      quiz.save();
      return round;
    },

    /** Pick up a saved round once its banks are loaded; questions that no longer exist are dropped. */
    restore: function () {
      var r = QL.store.round();
      if (!r || r.v !== 1 || !Array.isArray(r.items)) { quiz.round = null; return null; }
      var cur = r.items[r.index];
      var list = r.items.map(QL.catalog.question).filter(Boolean);
      if (!list.length) { quiz.round = null; QL.store.setRound(null); return null; }
      if (list.length !== r.items.length) {
        layout(r, list);
        r.index = Math.max(0, r.items.indexOf(cur));
        r.tab = QL.catalog.question(r.items[r.index]).type;
      }
      quiz.round = r;
      return r;
    },

    save: function () { QL.store.setRound(quiz.round); },
    current: function () { return quiz.round ? QL.catalog.question(quiz.round.items[quiz.round.index]) : null; },
    state: function (key) { return quiz.round.answers[key] || null; },
    isDone: function (key) { var a = quiz.round.answers[key]; return !!a && a.ok !== null; },

    answeredCount: function () {
      var n = 0, a = quiz.round.answers;
      Object.keys(a).forEach(function (k) { if (a[k].ok !== null) n++; });
      return n;
    },
    typeProgress: function (ty) {
      var r = quiz.round.ranges[ty], n = 0;
      if (!r) return { answered: 0, total: 0 };
      for (var i = r[0]; i < r[1]; i++) if (quiz.isDone(quiz.round.items[i])) n++;
      return { answered: n, total: r[1] - r[0] };
    },

    /** Submit a response to the current question. Returns the stored state. */
    answer: function (resp) {
      var q = quiz.current();
      if (!q || quiz.state(q.key)) return null;
      var g = grade(q, resp);
      quiz.round.answers[q.key] = g;
      if (g.ok !== null) QL.store.record(q, g.ua, answerText(q), g.ok, g.picks);
      quiz.save();
      return g;
    },
    /** The learner's own verdict on a fill-in answer that could not be matched automatically. */
    judge: function (ok) {
      var q = quiz.current(), a = q && quiz.state(q.key);
      if (!a || a.ok !== null) return;
      a.ok = !!ok;
      QL.store.record(q, a.ua, answerText(q), a.ok, []);
      quiz.save();
    },

    go: function (index) {
      var r = quiz.round;
      if (index < 0 || index >= r.items.length) return false;
      r.pos[r.tab] = r.index;
      r.index = index;
      r.tab = QL.catalog.question(r.items[index]).type;
      r.pos[r.tab] = index;
      quiz.save();
      return true;
    },
    next: function () { return quiz.go(quiz.round.index + 1); },
    prev: function () { return quiz.go(quiz.round.index - 1); },
    jumpTab: function (ty) {
      var r = quiz.round, range = r.ranges[ty];
      if (!range || r.tab === ty) return;
      var p = r.pos[ty];
      quiz.go(p >= range[0] && p < range[1] ? p : range[0]);
    },

    /** Settle the round: build the summary and clear the saved state. */
    finish: function () {
      var r = quiz.round;
      if (!r) return null;
      var sum = { total: r.items.length, answered: 0, correct: 0, wrong: [], byType: {}, ended: Date.now(), courses: r.courses, scope: r.scope };
      r.items.forEach(function (key) {
        var a = r.answers[key];
        if (!a || a.ok === null) return;
        var q = QL.catalog.question(key);
        var cell = sum.byType[q.type] || (sum.byType[q.type] = [0, 0]);
        sum.answered++; cell[0]++;
        if (a.ok) { sum.correct++; cell[1]++; } else sum.wrong.push(key);
      });
      quiz.summary = sum;
      quiz.round = null;
      QL.store.setRound(null);
      return sum;
    }
  };

  QL.quiz = quiz;
  QL.shuffle = shuffle;
})(typeof window !== 'undefined' ? window : globalThis);
