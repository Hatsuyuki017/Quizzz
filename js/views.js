/* views.js — each view returns { title, sub, right, body } as HTML strings.
 * Nothing here touches the DOM; app.js mounts the result and routes the
 * data-act clicks back to the handlers in QL.actions.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var h = QL.esc, rich = QL.rich, t = QL.t, TYPES = QL.TYPES;
  var PAGE = 40;

  var ui = QL.ui = {
    semester: '', selected: [], pick: null, summaryShown: false,
    setup: { scope: 'all', types: null, units: {}, difficulty: null, order: 'seq', limit: 0 },
    wcourse: 'all', scourse: 'all', stype: 'all', sdone: false, spage: 0, hcourse: 'all', hpage: 0,
    detail: null, template: null,
    pal: { g: 'all', h: 'all', s: 'all', d: 'all', q: '' }
  };

  /* ---------- small builders ---------- */

  function pct(c, a) { return a > 0 ? Math.round(c / a * 100) + '%' : '—'; }
  function course(id) { return QL.catalog.courses[id]; }
  function semCourses() { var s = QL.catalog.semester(ui.semester); return s ? s.courses : []; }
  function loaded(ids) { return ids.filter(function (id) { return QL.catalog.banks[id]; }); }
  function semLabel(s) { return (s.label && (s.label[QL.lang] || s.label.en || s.label.zh)) || s.id; }

  function courseTag(id) {
    var c = course(id);
    return '<span class="tag tag--course" style="--c:var(--cat-' + (c ? c.slot : 1) + ')">' + h(c ? c.code : id) + '</span>';
  }
  function typeTag(ty) { return '<span class="tag">' + t('type.' + ty) + '</span>'; }
  function seg(act, options, current) {
    return '<div class="segmented">' + options.map(function (o) {
      return '<button type="button" data-act="' + act + '" data-arg="' + h(o[0]) + '" aria-pressed="' + (String(o[0]) === String(current)) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function chip(act, arg, label, count, on, extra) {
    return '<button type="button" class="chip" data-act="' + act + '" data-arg="' + h(arg) + '"' + (extra || '') + ' aria-pressed="' + !!on + '">' +
      label + (count != null ? ' <b>' + count + '</b>' : '') + '</button>';
  }
  function tile(k, v, d) {
    return '<div class="tile"><div class="tile__k">' + k + '</div><div class="tile__v">' + v + '</div>' + (d ? '<div class="tile__d">' + d + '</div>' : '') + '</div>';
  }
  function empty(msg, btn) {
    return '<div class="empty"><div class="empty__mark">§</div><p>' + msg + '</p>' + (btn || '') + '</div>';
  }
  function courseSeg(act, current) {
    var opts = [['all', t('ui.all')]].concat(semCourses().map(function (c) { return [c.id, h(c.code)]; }));
    return opts.length > 2 ? seg(act, opts, current) : '';
  }
  function scopeIds(sel) { return loaded(sel === 'all' ? semCourses().map(function (c) { return c.id; }) : [sel]); }
  function fmtTime(ms) {
    var d = new Date(ms), p = function (n) { return ('0' + n).slice(-2); };
    return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function agg(ids) {
    var a = { total: 0, attempted: 0, attempts: 0, correct: 0, wrong: 0 };
    loaded(ids).forEach(function (id) {
      QL.catalog.banks[id].questions.forEach(function (q) {
        var s = QL.store.stat(q.key);
        a.total++;
        if (s && s.a > 0) { a.attempted++; a.attempts += s.a; a.correct += s.c; if (QL.store.isWrong(s)) a.wrong++; }
      });
    });
    return a;
  }
  QL.agg = agg;

  function figureHTML(q) {
    if (!q.figure) return '';
    var bank = QL.catalog.banks[q.bank], f = bank && bank.figures[q.figure.key];
    var cap = q.figure.caption ? '<figcaption class="rich">' + rich(q.figure.caption) + '</figcaption>' : '';
    if (!f || !f.svg) {
      return '<figure class="figure"><p class="figure__cap">' + t('quiz.figMissing') + '</p><pre>' + h(q.figure.latex) + '</pre></figure>';
    }
    var m = /<svg[^>]*\swidth="([\d.]+)(pt)?"/.exec(f.svg);          // TeX points; enlarge for the screen
    var width = m ? ' style="width:' + Math.round(parseFloat(m[1]) * 1.55) + 'px"' : '';
    return '<figure class="figure"><img src="' + QL.catalog.figureSrc(q) + '" alt="' + h(q.figure.caption || 'figure') + '"' + width + '>' + cap + '</figure>';
  }

  function qTags(q) {
    var bank = QL.catalog.banks[q.bank], unit = bank.unitMap[q.unit];
    return '<div class="tagrow">' + courseTag(q.bank) + typeTag(q.type) +
      '<span class="tag tag--plain">' + h(unit.title) + '</span>' +
      (q.difficulty ? '<span class="tag tag--plain">' + t('quiz.diff', { n: q.difficulty }) + '</span>' : '') +
      '<span class="tag tag--plain">' + h(q.id) + '</span></div>';
  }

  /** Options of a choice or true/false question. st: stored answer or null; picks: current selection; freq: stats for the detail view. */
  function optionsHTML(q, st, picks, freq) {
    var rows = q.type === 'true_false'
      ? [{ label: 'T', html: t('tf.true') }, { label: 'F', html: t('tf.false') }]
      : q.options.map(function (o) { return { label: o.label, html: rich(o.text) }; });
    var right = q.type === 'true_false' ? [q.answer ? 'T' : 'F'] : (q.type === 'single_choice' ? [q.answer] : q.answer);
    var chosen = st ? st.picks : (picks || []);
    var reveal = !!st || !!freq;
    return '<div class="opts">' + rows.map(function (r) {
      var cls = q.type === 'multiple_choice' ? ' opt--box' : '', mark = '';
      if (reveal) {
        cls += ' is-done';
        if (right.indexOf(r.label) >= 0) { cls += ' is-ok'; mark = t('quiz.rightAnswer'); }
        else if (chosen.indexOf(r.label) >= 0) { cls += ' is-bad'; mark = t('quiz.yourPick'); }
      } else if (chosen.indexOf(r.label) >= 0) cls += ' is-sel';
      var tail = mark ? '<span class="opt__mark">' + mark + '</span>' : '';
      if (freq) {
        var n = (freq.oc && freq.oc[r.label]) || 0, w = freq.a > 0 ? Math.round(n / freq.a * 100) : 0;
        tail = '<span class="opt__mark opt__freq"><i><b style="width:' + w + '%"></b></i>' + t('detail.freq', { n: n }) + '</span>';
      }
      return '<button type="button" class="opt' + cls + '" data-act="pick" data-arg="' + h(r.label) + '">' +
        '<span class="opt__label">' + h(r.label) + '</span><span class="rich">' + r.html + '</span>' + tail + '</button>';
    }).join('') + '</div>';
  }

  function fillsHTML(q, st, picks) {
    return '<div class="fills">' + q.answer.map(function (ref, i) {
      var n = '<span class="fill__n">' + (i + 1) + '</span>';
      if (!st) {
        return '<label class="fill">' + n + '<input type="text" id="blank-' + i + '" data-blank="' + i + '" autocomplete="off" autocapitalize="off" spellcheck="false" value="' +
          h((picks && picks[i]) || '') + '" placeholder="' + t('quiz.blankHint', { n: i + 1 }) + '"></label>';
      }
      var yours = st.inputs ? '<div class="fill__yours">' + t('quiz.yours') + h(st.inputs[i] || '—') + '</div>' : '';
      return '<div class="fill">' + n + '<div><div class="fill__ref"><span class="eyebrow">' + t('quiz.ref') + '</span><span class="rich">' + rich(ref) + '</span></div>' + yours + '</div></div>';
    }).join('') + '</div>';
  }

  function explainHTML(q) {
    return q.explanation ? '<div class="explain"><span class="eyebrow">' + t('quiz.explain') + '</span><div class="rich">' + rich(q.explanation) + '</div></div>' : '';
  }

  function notesPanel(key, open) {
    return '<section class="panel notes"><div class="panel__head"><h3 class="panel__title">' + t('quiz.notes') + '</h3></div>' +
      (open ? '<textarea id="noteText" data-note="' + h(key) + '" placeholder="' + t('quiz.notesPh') + '">' + h(QL.store.note(key)) + '</textarea>'
            : '<div class="notes__locked">' + t('quiz.notesLocked') + '</div>') + '</section>';
  }

  function qTable(rows, withErr) {
    if (!rows.length) return '';
    return '<div class="tablewrap"><table class="dtable"><thead><tr><th>' + t('col.course') + '</th><th>' + t('col.id') + '</th><th>' + t('col.type') +
      '</th><th>' + t('col.question') + '</th><th class="n">' + t('col.attempts') + '</th><th class="n">' + t('col.correct') + '</th><th class="n">' +
      t(withErr ? 'col.errRate' : 'col.acc') + '</th></tr></thead><tbody>' + rows.map(function (r) {
        var s = r.s || { a: 0, c: 0 };
        var rate = withErr ? pct(s.a - s.c, s.a) : pct(s.c, s.a);
        var cls = !s.a ? 'pill--mid' : (QL.store.isWrong(s) ? 'pill--bad' : 'pill--ok');
        return '<tr data-act="detail" data-arg="' + h(r.q.key) + '" tabindex="0"><td>' + courseTag(r.q.bank) + '</td><td class="m">' + h(r.q.id) + '</td><td class="m">' + t('type.' + r.q.type) +
          '</td><td><div class="rich clamp">' + rich(r.q.question) + '</div></td><td class="n">' + s.a + '</td><td class="n">' + s.c +
          '</td><td class="n"><span class="pill ' + cls + '">' + rate + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function pager(act, page, total) {
    var pages = Math.max(1, Math.ceil(total / PAGE));
    if (pages < 2) return '';
    return '<div class="pager"><button type="button" class="btn btn--sm" data-act="' + act + '" data-arg="' + (page - 1) + '"' + (page <= 0 ? ' disabled' : '') + '>' + t('ui.prev') +
      '</button><span>' + t('ui.page', { a: page + 1, b: pages }) + '</span><button type="button" class="btn btn--sm" data-act="' + act + '" data-arg="' + (page + 1) + '"' +
      (page >= pages - 1 ? ' disabled' : '') + '>' + t('ui.next') + '</button></div>';
  }

  /* ---------- home ---------- */

  function setupOpts() {
    var s = ui.setup, courses = loaded(ui.selected);
    return { courses: courses, types: s.types, units: s.units, difficulty: s.difficulty, scope: s.scope, order: s.order, limit: s.limit };
  }
  QL.setupOpts = setupOpts;

  function home() {
    var sem = QL.catalog.semester(ui.semester), entries = sem.courses, ids = entries.map(function (c) { return c.id; });
    var a = agg(ids), r = QL.quiz.round;
    var body = '<div class="pad stack">';
    if (r) {
      body += '<div class="banner"><p>' + t('home.resume', { a: QL.quiz.answeredCount(), n: r.items.length }) + '</p>' +
        '<a class="btn btn--solid" href="#quiz">' + t('home.resumeBtn') + '</a><button type="button" class="btn btn--ghost" data-act="end">' + t('home.endBtn') + '</button></div>';
    }
    body += '<div class="tiles">' + tile(t('home.total'), a.total, h(semLabel(sem))) +
      tile(t('home.attempted'), a.attempted, t('home.ofTotal', { p: a.total ? Math.round(a.attempted / a.total * 100) : 0 })) +
      tile(t('home.accuracy'), pct(a.correct, a.attempts), t('home.attempts', { n: a.attempts })) +
      tile(t('home.wrong'), a.wrong, t('home.wrongRule')) + '</div>';

    body += '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('home.courses') + '</h3><span class="panel__note">' + t('home.coursesNote') + '</span></div><div class="courses">';
    entries.forEach(function (c) {
      var bank = QL.catalog.banks[c.id], on = ui.selected.indexOf(c.id) >= 0, meta, stats = '', bar = 0;
      if (bank) {
        var ca = agg([c.id]), figs = bank.questions.filter(function (q) { return q.figure; }).length;
        meta = TYPES.filter(function (ty) { return bank.counts[ty]; }).map(function (ty) { return t('type.' + ty) + ' ' + bank.counts[ty]; }).join(' · ') +
          (figs ? ' · ' + t('home.figs', { n: figs }) : '');
        bar = ca.total ? ca.attempted / ca.total * 100 : 0;
        stats = '<span class="course__stats"><span><b>' + ca.attempted + '</b>/ ' + ca.total + ' ' + t('home.done') + '</span><span><b>' + pct(ca.correct, ca.attempts) + '</b>' + t('home.accuracy') +
          '</span><span><b>' + ca.wrong + '</b>' + t('home.wrong') + '</span></span>';
      } else meta = c.error ? t('home.loadFail', { e: h(c.error) }) : t('ui.loading');
      body += '<button type="button" class="course" data-act="toggle-course" data-arg="' + h(c.id) + '" aria-pressed="' + on + '" style="--c:var(--cat-' + c.slot + ')"' + (bank ? '' : ' disabled') + '>' +
        '<span class="course__top"><span class="course__code">' + h(c.code || c.id) + '</span><span class="course__check">✓</span></span>' +
        '<span class="course__title">' + h(c.title || c.id) + '</span><span class="course__meta">' + meta + '</span>' +
        '<span class="course__bar"><i style="width:' + bar.toFixed(1) + '%"></i></span>' + stats + '</button>';
    });
    body += '</div></section>';

    var s = ui.setup, sel = loaded(ui.selected);
    body += '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('setup.title') + '</h3><span class="panel__note">' +
      sel.map(function (id) { return h(course(id).code); }).join(' + ') + '</span></div>';
    if (!sel.length) body += '<p class="muted">' + t('setup.pick') + '</p>';
    else {
      var counts = {}, hasDiff = false;
      sel.forEach(function (id) {
        var b = QL.catalog.banks[id];
        TYPES.forEach(function (ty) { counts[ty] = (counts[ty] || 0) + (b.counts[ty] || 0); });
        hasDiff = hasDiff || b.hasDifficulty;
      });
      body += '<div class="setup"><div class="setup__k">' + t('setup.scope') + '</div><div>' +
        seg('set-scope', [['all', t('setup.scope.all')], ['wrong', t('setup.scope.wrong')], ['unseen', t('setup.scope.unseen')]], s.scope) + '</div>';
      body += '<div class="setup__k">' + t('setup.types') + '</div><div class="chips">' + TYPES.filter(function (ty) { return counts[ty]; }).map(function (ty) {
        return chip('set-type', ty, t('type.' + ty), counts[ty], !s.types || s.types.indexOf(ty) >= 0);
      }).join('') + '</div>';
      body += '<div class="setup__k">' + t('setup.units') + '</div><div>' + sel.map(function (id) {
        var b = QL.catalog.banks[id], picked = s.units[id];
        return '<div class="setup__unit"><div class="eyebrow"><span>' + h(b.code) + '</span><button type="button" class="linkbtn" data-act="units-all" data-arg="' + h(id) + '">' + t('setup.selectAll') +
          '</button><button type="button" class="linkbtn" data-act="units-none" data-arg="' + h(id) + '">' + t('setup.clear') + '</button></div><div class="chips">' +
          b.units.map(function (u) {
            return chip('set-unit', u.id, h(u.title), u.count, !picked || picked.indexOf(u.id) >= 0, ' data-course="' + h(id) + '"');
          }).join('') + '</div></div>';
      }).join('') + '</div>';
      if (hasDiff) {
        body += '<div class="setup__k">' + t('setup.diff') + '</div><div class="chips">' + [1, 2, 3].map(function (d) {
          return chip('set-diff', d, t('quiz.diff', { n: d }), null, !s.difficulty || s.difficulty.indexOf(d) >= 0);
        }).join('') + '</div>';
      }
      body += '<div class="setup__k">' + t('setup.order') + '</div><div>' + seg('set-order', [['seq', t('setup.order.seq')], ['shuffle', t('setup.order.shuffle')]], s.order) + '</div>';
      body += '<div class="setup__k">' + t('setup.limit') + '</div><div>' + seg('set-limit', [[0, t('ui.all')], [10, '10'], [20, '20'], [50, '50']], s.limit) + '</div>';
      var n = QL.quiz.pool(setupOpts()).length, take = s.limit > 0 ? Math.min(s.limit, n) : n;
      body += '<div class="setup__foot"><span class="setup__count num">' + take + ' ' + t('setup.count') + '<small>' + (take < n ? '/ ' + n + ' ' : '') + t('setup.countNote') + '</small></span><span class="spacer"></span>' +
        '<button type="button" class="btn btn--solid btn--lg" data-act="start"' + (n ? '' : ' disabled') + '>' + t('setup.start') + '</button></div></div>';
    }
    body += '</section></div>';

    var nq = 0;
    loaded(ids).forEach(function (id) { nq += QL.catalog.banks[id].questions.length; });
    var right = QL.catalog.semesters.length > 1
      ? '<select id="semSelect" aria-label="semester">' + QL.catalog.semesters.map(function (x) {
          return '<option value="' + h(x.id) + '"' + (x.id === ui.semester ? ' selected' : '') + '>' + h(semLabel(x)) + '</option>';
        }).join('') + '</select>' : '';
    return { title: t('nav.home'), sub: t('home.sub', { sem: h(semLabel(sem)), c: entries.length, q: nq }), right: right, body: body };
  }

  /* ---------- quiz ---------- */

  function summary() {
    var s = QL.quiz.summary;
    var body = '<div class="pad stack"><div class="tiles">' + tile(t('sum.answered'), s.answered, t('sum.of', { n: s.total })) + tile(t('sum.correct'), s.correct) +
      tile(t('sum.acc'), pct(s.correct, s.answered), TYPES.filter(function (ty) { return s.byType[ty]; }).map(function (ty) {
        return t('type.' + ty) + ' ' + pct(s.byType[ty][1], s.byType[ty][0]);
      }).join(' · ')) + '</div>';
    var rows = s.wrong.map(function (k) { var q = QL.catalog.question(k); return q ? { q: q, s: QL.store.stat(k) } : null; }).filter(Boolean);
    body += '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('sum.wrongList') + '</h3></div>' +
      (rows.length ? qTable(rows, true) : '<p class="muted">' + t(s.answered ? 'sum.allRight' : 'sum.none') + '</p>') + '</section>';
    body += '<div class="row"><a class="btn btn--solid" href="#home">' + t('sum.again') + '</a><a class="btn" href="#wrong">' + t('nav.wrong') + '</a><a class="btn" href="#stats">' + t('nav.stats') + '</a></div></div>';
    return { title: t('sum.title'), sub: fmtTime(s.ended), right: '', body: body };
  }

  function quiz() {
    var r = QL.quiz.round;
    if (!r) {
      if (QL.quiz.summary) return summary();
      return { title: t('nav.quiz'), sub: '', right: '', body: '<div class="pad">' + empty(t('quiz.none'), '<a class="btn btn--solid" href="#home">' + t('quiz.toHome') + '</a>') + '</div>' };
    }
    var q = QL.quiz.current(), st = QL.quiz.state(q.key), done = !!st && st.ok !== null, pending = !!st && st.ok === null;
    var answered = QL.quiz.answeredCount(), total = r.items.length, range = r.ranges[q.type], last = r.index === total - 1;

    var main = '<div class="qhead">' + qTags(q) + '<span class="qhead__count num">' + (r.index - range[0] + 1) + ' / ' + (range[1] - range[0]) + '</span></div>';
    main += '<div class="qtext rich">' + rich(q.question) + '</div>' + figureHTML(q);
    main += q.type === 'fill_blank' ? fillsHTML(q, st, ui.pick) : optionsHTML(q, st, ui.pick);
    if (done) {
      main += st.ok ? '<div class="fb fb--ok">✓ ' + t('quiz.correct') + '</div>'
        : '<div class="fb fb--bad">✗ ' + (q.type === 'fill_blank' ? t('quiz.judgeBad') : t('quiz.wrong') + '<strong>' + h(QL.quiz.answerText(q)) + '</strong>') + '</div>';
    } else if (pending) {
      main += '<div class="fb fb--ask"><p>' + t('quiz.judge') + '</p><button type="button" class="btn" data-act="judge" data-arg="1">✓ ' + t('quiz.judgeOk') +
        '</button><button type="button" class="btn" data-act="judge" data-arg="0" id="judgeBad">✗ ' + t('quiz.judgeBad') + '</button></div>';
    }
    if (st) main += explainHTML(q);
    main += '<div class="qnav"><button type="button" class="btn" data-act="prev"' + (r.index === 0 ? ' disabled' : '') + '>' + t('quiz.prev') + '</button>';
    if (!st) main += '<button type="button" class="btn btn--solid" data-act="submit">' + t('quiz.submit') + '</button>';
    if (last && done) main += '<button type="button" class="btn btn--solid" data-act="end">' + t('quiz.finish') + '</button>';
    else main += '<button type="button" class="btn' + (done ? ' btn--solid' : '') + '" data-act="next"' + (last ? ' disabled' : '') + '>' + t('quiz.next') + '</button>';
    main += '<span class="spacer"></span><button type="button" class="btn btn--ghost btn--danger" data-act="end">' + t('quiz.end') + '</button></div><p class="hint">' + t('quiz.hint') + '</p>';

    var tabs = '<div class="tabs">' + TYPES.filter(function (ty) { return r.ranges[ty]; }).map(function (ty) {
      var p = QL.quiz.typeProgress(ty);
      return '<button type="button" class="tab' + (r.tab === ty ? ' is-on' : '') + '" data-act="tab" data-arg="' + ty + '"><span class="tab__head"><span class="tab__label">' + t('type.' + ty) +
        '</span><span class="tab__num num">' + p.answered + '/' + p.total + '</span></span><span class="tab__bar"><i style="width:' + (p.total ? p.answered / p.total * 100 : 0).toFixed(1) + '%"></i></span></button>';
    }).join('') + '</div>';

    var card = '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('quiz.card') + '</h3><span class="panel__note num">' + answered + ' / ' + total + '</span></div><div class="card">';
    TYPES.forEach(function (ty) {
      var rg = r.ranges[ty];
      if (!rg) return;
      card += '<span class="eyebrow card__sep">' + t('type.' + ty) + '</span>';
      for (var i = rg[0]; i < rg[1]; i++) {
        var a = r.answers[r.items[i]], cls = a ? (a.ok === null ? 'is-wait' : (a.ok ? 'is-ok' : 'is-bad')) : '';
        card += '<button type="button" class="' + cls + (i === r.index ? ' is-cur' : '') + '" data-act="goto" data-arg="' + i + '">' + (i - rg[0] + 1) + '</button>';
      }
    });
    card += '</div></section>';

    var body = '<div class="pad"><div class="progress"><i style="width:' + (answered / total * 100).toFixed(1) + '%"></i></div>' + tabs +
      '<div class="quiz"><section class="panel">' + main + '</section><aside class="side">' + notesPanel(q.key, !!st) + card + '</aside></div></div>';
    return { title: t('nav.quiz'), sub: t('quiz.answered', { a: answered, n: total }) + ' · ' + r.courses.map(function (id) { return h(course(id) ? course(id).code : id); }).join(' + '), right: '', body: body };
  }

  /* ---------- mistakes ---------- */

  function wrongRows(sel) {
    var rows = [];
    scopeIds(sel).forEach(function (id) {
      QL.catalog.banks[id].questions.forEach(function (q) {
        var s = QL.store.stat(q.key);
        if (QL.store.isWrong(s)) rows.push({ q: q, s: s });
      });
    });
    return rows.sort(function (a, b) { return (b.s.a - b.s.c) / b.s.a - (a.s.a - a.s.c) / a.s.a; });
  }
  QL.wrongRows = wrongRows;

  function wrong() {
    var rows = wrongRows(ui.wcourse);
    var body = '<div class="pad stack"><div class="row">' + courseSeg('wcourse', ui.wcourse) + '<span class="spacer"></span>' +
      (rows.length ? '<button type="button" class="btn btn--solid" data-act="start-wrong">' + t('wrong.start', { n: rows.length }) + '</button>' : '') + '</div>' +
      '<section class="panel">' + (rows.length ? qTable(rows, true) : empty(t('wrong.empty'))) + '</section></div>';
    return { title: t('nav.wrong'), sub: t('wrong.sub'), right: '', body: body };
  }

  /* ---------- statistics ---------- */

  function lineChart(points, color, big) {
    var W = big ? 720 : 340, H = big ? 170 : 130, L = 34, R = 30, T = 14, B = 22, w = W - L - R, ht = H - T - B;
    var valid = points.filter(function (p) { return p.v !== null; });
    if (!valid.length) return '<p class="muted" style="font-size:.84rem">' + t('stats.noData') + '</p>';
    var x = function (i) { return L + (points.length > 1 ? i / (points.length - 1) * w : w / 2); };
    var y = function (v) { return T + (1 - v / 100) * ht; };
    var path = '', dots = '', labels = '', step = Math.max(1, Math.ceil(points.length / (big ? 10 : 5))), lastI = -1;
    points.forEach(function (p, i) {
      if (p.v !== null) {
        path += (path ? ' L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1);
        dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="2.4" fill="' + color + '"/>';
        lastI = i;
      }
      if (i % step === 0 || i === points.length - 1) labels += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + p.label + '</text>';
    });
    var grid = [0, 50, 100].map(function (v) {
      return '<line x1="' + L + '" x2="' + (L + w) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--rule)" stroke-dasharray="' + (v ? '3 3' : '0') + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '%</text>';
    }).join('');
    var lp = points[lastI];
    var end = '<circle cx="' + x(lastI).toFixed(1) + '" cy="' + y(lp.v).toFixed(1) + '" r="4.2" fill="var(--surface)" stroke="' + color + '" stroke-width="2"/>' +
      '<text x="' + (x(lastI) + 7).toFixed(1) + '" y="' + (y(lp.v) + 3).toFixed(1) + '" style="fill:var(--ink);font-weight:600">' + lp.v + '%</text>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + grid + '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>' + dots + end + labels + '</svg>';
  }

  function trend(ids) {
    var daily = QL.store.daily(), days = Object.keys(daily).sort().slice(-60), series = { all: [] };
    TYPES.forEach(function (ty) { series[ty] = []; });
    days.forEach(function (day) {
      var sum = { all: [0, 0] };
      ids.forEach(function (id) {
        var c = daily[day][id];
        if (!c) return;
        Object.keys(c).forEach(function (ty) {
          sum[ty] = sum[ty] || [0, 0];
          sum[ty][0] += c[ty][0]; sum[ty][1] += c[ty][1]; sum.all[0] += c[ty][0]; sum.all[1] += c[ty][1];
        });
      });
      Object.keys(series).forEach(function (k) {
        series[k].push({ label: day.slice(5), v: sum[k] && sum[k][0] ? Math.round(sum[k][1] / sum[k][0] * 100) : null });
      });
    });
    return series;
  }

  function stats() {
    var ids = scopeIds(ui.scourse), a = agg(ids), series = trend(ids);
    var body = '<div class="pad stack"><div class="row">' + courseSeg('scourse', ui.scourse) + '</div><div class="tiles">' +
      tile(t('stats.attempted'), a.attempted + '<small>/ ' + a.total + '</small>') + tile(t('stats.attempts'), a.attempts) +
      tile(t('home.accuracy'), pct(a.correct, a.attempts)) + tile(t('home.wrong'), a.wrong, t('home.wrongRule')) + '</div>';
    body += '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('stats.trend') + '</h3><span class="panel__note">' + t('stats.trendAll') + '</span></div>' +
      lineChart(series.all, 'var(--accent)', true);
    var kinds = TYPES.filter(function (ty) { return series[ty].some(function (p) { return p.v !== null; }); });
    if (kinds.length) {
      body += '<div class="charts">' + kinds.map(function (ty, i) {
        return '<div><h4>' + t('type.' + ty) + '</h4>' + lineChart(series[ty], 'var(--cat-' + (i % 5 + 1) + ')', false) + '</div>';
      }).join('') + '</div>';
    }
    body += '</section>';
    var rows = [];
    ids.forEach(function (id) {
      QL.catalog.banks[id].questions.forEach(function (q) {
        if (ui.stype !== 'all' && q.type !== ui.stype) return;
        var s = QL.store.stat(q.key);
        if (ui.sdone && !(s && s.a)) return;
        rows.push({ q: q, s: s });
      });
    });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (ui.spage >= pages) ui.spage = pages - 1;
    body += '<section class="panel"><div class="panel__head"><h3 class="panel__title">' + t('stats.table') + '</h3><div class="row">' +
      seg('stype', [['all', t('ui.all')]].concat(TYPES.map(function (ty) { return [ty, t('type.' + ty)]; })), ui.stype) +
      chip('sdone', '1', t('stats.onlyDone'), null, ui.sdone) + '</div></div>' +
      (rows.length ? qTable(rows.slice(ui.spage * PAGE, (ui.spage + 1) * PAGE), false) + pager('spage', ui.spage, rows.length) : '<p class="muted">' + t('stats.noData') + '</p>') + '</section></div>';
    return { title: t('nav.stats'), sub: t('stats.sub'), right: '', body: body };
  }

  /* ---------- history ---------- */

  function historyRows() {
    var all = QL.store.history(), rows = [];
    all.forEach(function (e, i) { if (ui.hcourse === 'all' || e.c === ui.hcourse) rows.push({ e: e, i: i }); });
    return rows;
  }

  function history() {
    var rows = historyRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (ui.hpage >= pages) ui.hpage = pages - 1;
    var body = '<div class="pad stack"><div class="row">' + courseSeg('hcourse', ui.hcourse) + '<span class="spacer"></span>' +
      (QL.store.history().length ? '<button type="button" class="btn btn--ghost btn--danger" data-act="clear-history">' + t('history.clear') + '</button>' : '') + '</div><section class="panel">';
    if (!rows.length) body += empty(t('history.empty'));
    else {
      body += '<div class="tablewrap"><table class="dtable"><thead><tr><th>' + t('col.time') + '</th><th>' + t('col.course') + '</th><th>' + t('col.id') + '</th><th>' + t('col.type') +
        '</th><th>' + t('col.yours') + '</th><th>' + t('col.answer') + '</th><th>' + t('col.result') + '</th></tr></thead><tbody>' +
        rows.slice(ui.hpage * PAGE, (ui.hpage + 1) * PAGE).map(function (r) {
          var e = r.e;
          return '<tr data-act="detail" data-arg="' + h(e.k) + '" data-hist="' + r.i + '" tabindex="0"><td class="m">' + fmtTime(e.t) + '</td><td>' + courseTag(e.c) + '</td><td class="m">' + h(e.id) +
            '</td><td class="m">' + t('type.' + e.ty) + '</td><td><div class="clamp" style="min-width:90px">' + h(e.ua) + '</div></td><td><div class="rich clamp" style="min-width:90px">' + rich(e.ca) +
            '</div></td><td><span class="pill ' + (e.ok ? 'pill--ok">✓' : 'pill--bad">✗') + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' + pager('hpage', ui.hpage, rows.length);
    }
    body += '</section></div>';
    return { title: t('nav.history'), sub: t('history.sub', { n: QL.store.history().length }), right: '', body: body };
  }

  /* ---------- question detail ---------- */

  function detail() {
    var d = ui.detail || {}, q = d.key ? QL.catalog.question(d.key) : null;
    var back = '<a class="btn" href="#' + (d.from || 'stats') + '">← ' + t('ui.back') + '</a>';
    if (!q) return { title: t('detail.title'), sub: '', right: back, body: '<div class="pad">' + empty(t('detail.missing')) + '</div>' };
    var s = QL.store.stat(q.key) || { a: 0, c: 0, oc: {} };
    var e = d.hist != null ? QL.store.history()[d.hist] : null;
    if (e && e.k !== q.key) e = null;
    var main = '<div class="qhead">' + qTags(q) + '</div><div class="qtext rich">' + rich(q.question) + '</div>' + figureHTML(q);
    main += q.type === 'fill_blank' ? fillsHTML(q, { inputs: null }, null) : optionsHTML(q, null, e ? String(e.ua).split(/,\s*/) : null, s);
    if (e) main += '<div class="fb ' + (e.ok ? 'fb--ok">✓ ' : 'fb--bad">✗ ') + t('detail.then') + '<strong>' + h(e.ua) + '</strong> · ' + fmtTime(e.t) + '</div>';
    main += explainHTML(q);
    var body = '<div class="pad"><div class="quiz"><section class="panel">' + main + '</section><aside class="side">' + notesPanel(q.key, true) + '</aside></div></div>';
    return { title: t('detail.title'), sub: s.a ? t('detail.sub', { a: s.a, p: pct(s.c, s.a) }) : t('detail.never'), right: back, body: body };
  }

  /* ---------- palette ---------- */

  var HUES = ['neutral', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'];
  var HUE_DOT = { neutral: '#8A8A8A', brown: '#7A5230', red: '#C0392B', orange: '#E07B2A', yellow: '#E3B92E', green: '#3F8F55', cyan: '#2FA5A5', blue: '#2F62B8', purple: '#7A4FB0', pink: '#D4588F' };
  var STYLES = ['mono', 'muted', 'soft', 'vivid'];

  QL.palette = function (id) {
    var all = QL.PALETTES;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return all[0];
  };
  QL.icon = function (p) { return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + p.icon + '</svg>'; };

  function palName(p) { return QL.lang === 'zh' ? p.z : p.n; }
  function palAlt(p) { return QL.lang === 'zh' ? (p.n === p.z ? p.src : p.n) : (p.src === p.n ? p.z : p.src); }
  function palMatch(p) {
    var f = ui.pal, q = f.q.trim().toLowerCase();
    if (f.g !== 'all' && p.g !== f.g) return false;
    if (f.h !== 'all' && p.h !== f.h) return false;
    if (f.s !== 'all' && p.s !== f.s) return false;
    if (f.d !== 'all' && p.dark !== (f.d === 'dark')) return false;
    return !q || (p.z + ' ' + p.n + ' ' + p.src + ' ' + p.bio + ' ' + p.id).toLowerCase().indexOf(q) >= 0;
  }
  function palVars(p) {
    return '--p-bg:' + p.bg + ';--p-ink:' + p.ink + ';--p-a:' + p.cats[0] + ';--p-b:' + p.cats[1] + ';--p-c:' + p.cats[2] + ';--p-d:' + p.cats[3] + ';--p-e:' + p.cats[4];
  }
  function palCard(p, cur) {
    return '<button type="button" class="pcard' + (p.id === cur ? ' is-on' : '') + '" data-act="palette" data-arg="' + p.id + '" data-preview="' + p.id + '" title="' + h(p.src + ' — ' + p.bio) +
      '"><span class="pcard__chips"><span class="pcard__plate" style="' + palVars(p) + '">' + QL.icon(p) + '</span>' + p.cats.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') +
      '</span><span class="pcard__head"><span><span class="pcard__name">' + h(palName(p)) + '</span><span class="pcard__alt">' + h(palAlt(p)) + '</span></span>' +
      (p.id === cur ? '<span class="pcard__tick">✓</span>' : '') + '</span><span class="pcard__bio"' + (QL.lang === 'zh' ? '' : ' lang="zh-CN"') + '>' + h(p.bio) + '</span></button>';
  }
  /* The filtered cards, grouped by collection unless one collection is chosen.
     Kept apart from the view so typing in the search box redraws only this. */
  QL.paletteList = function () {
    var cur = QL.store.pref('palette', 'warm'), hit = QL.PALETTES.filter(palMatch), html = '';
    var groups = ui.pal.g === 'all' ? QL.PALETTE_GROUPS : [ui.pal.g];
    groups.forEach(function (g) {
      var ps = hit.filter(function (p) { return p.g === g; });
      if (!ps.length) return;
      html += '<section class="pgroup"><header class="pgroup__head"><h3 class="pgroup__name">' + t('pal.g.' + g) + '</h3><span class="pgroup__n num">' + ps.length +
        '</span></header><div class="pgrid">' + ps.map(function (p) { return palCard(p, cur); }).join('') + '</div></section>';
    });
    return { html: html || '<p class="pal__empty">' + t('pal.empty') + '</p>', count: t('pal.count', { n: hit.length, total: QL.PALETTES.length }) };
  };

  function palette() {
    var p = QL.palette(QL.store.pref('palette', 'warm')), f = ui.pal, list = QL.paletteList();
    function chips(key, values, label, dot) {
      return ['all'].concat(values).map(function (v) {
        var n = key === 'g' && v !== 'all' ? QL.PALETTES.filter(function (x) { return x.g === v; }).length : 0;
        return '<button type="button" class="fchip" data-act="pal-filter" data-key="' + key + '" data-arg="' + v + '" aria-pressed="' + (f[key] === v) + '">' +
          (dot && v !== 'all' ? '<i style="background:' + dot[v] + '"></i>' : '') + (v === 'all' ? t('pal.all') : label(v)) + (n ? '<b class="num">' + n + '</b>' : '') + '</button>';
      }).join('');
    }
    var active = f.g !== 'all' || f.h !== 'all' || f.s !== 'all' || f.d !== 'all' || f.q;
    var now = '<section class="panel pal-now"><div class="pal-now__plate">' + QL.icon(p) + '</div><div class="pal-now__head"><span class="eyebrow">' + t('pal.current') +
      '</span><h3 class="pal-now__name">' + h(palName(p)) + '</h3><span class="pal-now__alt">' + h(palAlt(p)) + (palAlt(p) !== p.src ? ' · ' + h(p.src) : '') + '</span></div>' +
      '<div class="pal-now__body"><p class="pal-now__bio"' + (QL.lang === 'zh' ? '' : ' lang="zh-CN"') + '>' + h(p.bio) + '</p><div class="pal-now__meta"><span class="pal-now__sw"><i style="background:' + p.bg + '"></i>' +
      p.cats.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span><span class="tag">' + t('pal.g.' + p.g) + '</span><span class="tag">' + t('pal.h.' + p.h) +
      '</span><span class="tag">' + t('pal.s.' + p.s) + '</span><span class="tag">' + t(p.dark ? 'pal.dark' : 'pal.light') + '</span></div></div></section>';
    var filters = '<section class="panel pfilter">' +
      '<span class="pfilter__k">' + t('pal.group') + '</span><div class="pfilter__v">' + chips('g', QL.PALETTE_GROUPS, function (v) { return t('pal.g.' + v); }) + '</div>' +
      '<span class="pfilter__k">' + t('pal.hue') + '</span><div class="pfilter__v">' + chips('h', HUES, function (v) { return t('pal.h.' + v); }, HUE_DOT) + '</div>' +
      '<span class="pfilter__k">' + t('pal.style') + '</span><div class="pfilter__v">' + chips('s', STYLES, function (v) { return t('pal.s.' + v); }) + '</div>' +
      '<span class="pfilter__k">' + t('pal.paper') + '</span><div class="pfilter__v">' + chips('d', ['light', 'dark'], function (v) { return t('pal.' + v); }) + '</div>' +
      '<label class="pfilter__k" for="palSearch">' + t('pal.search') + '</label><div class="pfilter__v"><input type="text" class="pfilter__search" id="palSearch" value="' + h(f.q) + '" placeholder="' + h(t('pal.searchPh')) +
      '" autocomplete="off" spellcheck="false"><span class="pfilter__count num" id="palCount">' + list.count + '</span>' +
      (active ? '<button type="button" class="linkbtn" data-act="pal-reset">' + t('pal.reset') + '</button>' : '') + '</div></section>';
    var body = '<div class="pad"><div class="pal">' + now + filters + '<div id="palList">' + list.html + '</div></div></div>';
    return { title: t('nav.palette'), sub: t('palette.sub', { n: QL.PALETTES.length }) + (t('pal.noteLang') ? ' · ' + t('pal.noteLang') : ''), right: '', body: body };
  }

  /* ---------- adding a bank ---------- */

  var CATALOG_SNIPPET = '{\n  "id": "2027-s1",\n  "label": { "zh": "2027 学年第一学期", "en": "2027 Semester 1" },\n  "courses": [\n    { "id": "math2100-2027s1", "code": "MATH 2100", "title": "Real Analysis", "bank": "2027-s1/math2100.json" }\n  ]\n}';

  function contribute() {
    var zh = QL.lang === 'zh';
    var rows = zh ? [
      ['id', '题库的唯一标识，小写字母、数字和连字符，建议带上学期，例如 statx303-2026s2。它也是作答数据的键，发布后不要改。'],
      ['course', 'code 与 title 必填，显示在课程卡片上。'],
      ['units', '章节列表，决定按章节顺序作答时的先后。每题的 unit 必须出现在这里。group 可选，用来标注模块。'],
      ['questions[].type', 'true_false、single_choice、multiple_choice、fill_blank 四选一。'],
      ['questions[].answer', '判断题写 true 或 false；单选写选项标签；多选写标签数组；填空写字符串数组，每空一个。'],
      ['questions[].accept', '仅填空题可选：每空另外可接受的写法，供自动比对使用。'],
      ['questions[].figure', 'null，或 { "latex": "\\\\begin{tikzpicture}…" }。相同的图可以给同一个 id，只编译一次。'],
      ['figure_preamble', '编译图形用的导言区，到 \\\\begin{document} 之前为止。省略时默认载入 TikZ 与 pgfplots。']
    ] : [
      ['id', 'Unique slug for the bank (lowercase letters, digits, hyphens), ideally with the semester: statx303-2026s2. Attempt data is keyed on it, so keep it stable.'],
      ['course', 'code and title are required; they appear on the course card.'],
      ['units', 'Ordered list of units; it fixes the order of a by-unit round. Every question names one. group is optional.'],
      ['questions[].type', 'One of true_false, single_choice, multiple_choice, fill_blank.'],
      ['questions[].answer', 'true or false; an option label; an array of labels; an array of strings, one per blank.'],
      ['questions[].accept', 'Fill-in only, optional: further accepted spellings per blank for automatic matching.'],
      ['questions[].figure', 'null, or { "latex": "\\\\begin{tikzpicture}…" }. Give identical figures the same id to compile them once.'],
      ['figure_preamble', 'LaTeX preamble for figures, up to but excluding \\\\begin{document}. Defaults to TikZ plus pgfplots.']
    ];
    var steps = zh ? [
      '复制 <code>templates/bank.template.json</code>，放到 <code>banks/&lt;学期&gt;/&lt;课程&gt;.json</code>，按模版填写题目。',
      '在 <code>banks/catalog.json</code> 对应学期的 <code>courses</code> 里加一条记录；新学期就在 <code>semesters</code> 里加一个对象。',
      '运行 <code>python3 tools/build.py</code>。它会校验全部题库并把图形编译成 SVG，有问题时逐条指出题号和原因。',
      '本地运行 <code>python3 -m http.server</code> 打开页面检查公式和图形，然后提交合并请求。'
    ] : [
      'Copy <code>templates/bank.template.json</code> to <code>banks/&lt;semester&gt;/&lt;course&gt;.json</code> and fill in the questions.',
      'Add one entry to <code>courses</code> of the right semester in <code>banks/catalog.json</code>; a new semester is one more object in <code>semesters</code>.',
      'Run <code>python3 tools/build.py</code>. It validates every bank, compiles the figures to SVG, and names the question and the reason for each problem.',
      'Run <code>python3 -m http.server</code>, check formulas and figures in the page, then open a pull request.'
    ];
    var body = '<div class="pad"><div class="prose">' +
      '<p>' + (zh ? '平台本身不认识任何课程。它读取 <code>banks/catalog.json</code> 里列出的学期和课程，再按需加载各门课的题库文件。接入一门新课不需要改动代码。'
                  : 'The platform knows no course by name. It reads the semesters and courses listed in <code>banks/catalog.json</code> and loads each bank on demand. Adding a course needs no code change.') + '</p>' +
      '<h3>' + (zh ? '步骤' : 'Steps') + '</h3><ol>' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
      '<h3>' + (zh ? '字段' : 'Fields') + '</h3></div><div class="tablewrap" style="max-width:900px"><table class="ftable"><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table></div><div class="prose">' +
      '<h3>' + (zh ? '文字与公式' : 'Text and formulas') + '</h3><p>' +
      (zh ? '题干、选项、答案和解析都是带 LaTeX 的纯文本：<code>$…$</code> 为行内公式，<code>$$…$$</code> 为独立公式，由 KaTeX 渲染。公式之外可以用 <code>\\emph{}</code>、<code>\\textbf{}</code>、<code>\\texttt{}</code>、<code>\\%</code>、<code>--</code>，空一行另起一段。填空题在题干里用四个以上下划线 <code>____</code> 标出每个空，数量要与 <code>answer</code> 的长度一致。JSON 里反斜杠要写成两个。'
          : 'Question, options, answers and explanation are plain text with LaTeX: <code>$…$</code> inline and <code>$$…$$</code> display, typeset by KaTeX. Outside math you may use <code>\\emph{}</code>, <code>\\textbf{}</code>, <code>\\texttt{}</code>, <code>\\%</code>, <code>--</code>, and a blank line for a new paragraph. Mark each blank of a fill-in question with four or more underscores <code>____</code>; their number must equal the length of <code>answer</code>. Backslashes are doubled in JSON.') + '</p>' +
      '<h3>' + (zh ? '题库模版' : 'Bank template') + ' <code>templates/bank.template.json</code></h3></div>' +
      '<div class="codebox" style="max-width:900px"><button type="button" class="btn btn--sm" data-act="copy" data-arg="tplCode">' + t('ui.copy') + '</button><pre id="tplCode">' + h(ui.template || t('ui.loading')) + '</pre></div>' +
      '<div class="prose"><h3>' + (zh ? '目录条目' : 'Catalog entry') + ' <code>banks/catalog.json</code></h3></div>' +
      '<div class="codebox" style="max-width:900px"><button type="button" class="btn btn--sm" data-act="copy" data-arg="catCode">' + t('ui.copy') + '</button><pre id="catCode">' + h(CATALOG_SNIPPET) + '</pre></div></div>';
    return { title: t('nav.contribute'), sub: t('contribute.sub'), right: '', body: body };
  }

  QL.views = { home: home, quiz: quiz, wrong: wrong, stats: stats, history: history, detail: detail, palette: palette, contribute: contribute };
})(typeof window !== 'undefined' ? window : globalThis);
