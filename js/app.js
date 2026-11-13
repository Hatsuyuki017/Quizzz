/* app.js — routing, event wiring, dialogs, keyboard. */
(function (root) {
  'use strict';
  var QL = root.QL, ui = QL.ui, t = QL.t, h = QL.esc, doc = root.document;
  var NAV = ['home', 'quiz', 'wrong', 'stats', 'history', 'palette', 'contribute'];
  var ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
  var ready = false, noteTimer = null, toastTimer = null;

  function $(id) { return doc.getElementById(id); }

  function route() {
    var r = root.location.hash.replace(/^#/, '');
    if (r === 'detail' && !ui.detail) return 'home';
    return QL.views[r] ? r : 'home';
  }
  function go(name) {
    if (route() === name && root.location.hash === '#' + name) render();
    else root.location.hash = name;
  }

  /* ---------- palette ---------- */

  /* A palette is seven colours, a margin texture and a motif. The colours go
     onto <html> as custom properties; themes.css reads the three attributes. */
  var applied = null;
  function applyPalette(id) {
    var p = QL.palette(id), el = doc.documentElement, svg;
    if (applied === p.id) return;
    applied = p.id;
    ['--p-bg', '--p-ink', '--p-a', '--p-b', '--p-c', '--p-d', '--p-e'].forEach(function (k, i) {
      el.style.setProperty(k, i === 0 ? p.bg : i === 1 ? p.ink : p.cats[i - 2]);
    });
    el.setAttribute('data-palette', p.id);
    el.setAttribute('data-tex', p.tex);
    if (p.dark) el.setAttribute('data-paper', 'dark'); else el.removeAttribute('data-paper');
    svg = QL.icon(p);
    $('spineIcon').innerHTML = svg;
    $('spineMotif').innerHTML = svg;
  }

  function showPeek(card) {
    var p = QL.palette(card.getAttribute('data-preview')), peek = $('peek'), box = card.getBoundingClientRect();
    var w = 304, hgt = 190, gap = 12, right = box.right + gap + w <= root.innerWidth;
    if (root.innerWidth < 720 || p.id === applied) { hidePeek(); return; }
    peek.setAttribute('style', QL.paletteVars(p));
    peek.setAttribute('data-palette', p.id);
    if (p.dark) peek.setAttribute('data-paper', 'dark'); else peek.removeAttribute('data-paper');
    peek.innerHTML = QL.palettePeek(p);
    peek.style.left = Math.round(right ? box.right + gap : Math.max(8, box.left - gap - w)) + 'px';
    peek.style.top = Math.round(Math.min(Math.max(8, box.top + box.height / 2 - hgt / 2), root.innerHeight - hgt - 8)) + 'px';
    peek.style.setProperty('--peek-origin', right ? 'left center' : 'right center');
    peek.classList.add('is-on');
  }
  function hidePeek() { $('peek').classList.remove('is-on'); }

  /* Keep the choice and repaint. Where the browser can, the new palette opens
     as a circle from (x, y); elsewhere a disc of the new paper colour does the
     same job; with reduced motion the change is immediate. */
  var wiping = false;
  function switchPalette(id, x, y) {
    var p = QL.palette(id), el = doc.documentElement;
    var commit = function () { QL.store.setPref('palette', p.id); applyPalette(p.id); render(true); };
    var still = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var r = Math.ceil(Math.sqrt(Math.pow(Math.max(x, root.innerWidth - x), 2) + Math.pow(Math.max(y, root.innerHeight - y), 2)));
    var from = 'circle(0px at ' + x + 'px ' + y + 'px)', to = 'circle(' + r + 'px at ' + x + 'px ' + y + 'px)';
    hidePeek();
    if (still || wiping || p.id === applied || !el.animate) { commit(); return; }
    wiping = true;
    if (doc.startViewTransition) {
      el.classList.add('is-wiping');
      var vt = doc.startViewTransition(commit), done = function () { el.classList.remove('is-wiping'); wiping = false; };
      vt.ready.then(function () {
        el.animate({ clipPath: [from, to] }, { duration: 760, easing: 'cubic-bezier(.3, .7, .2, 1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
      vt.finished.then(done, done);
      return;
    }
    var disc = doc.createElement('div');
    disc.className = 'wipe';
    disc.style.background = p.bg;
    doc.body.appendChild(disc);
    var grow = disc.animate({ clipPath: [from, to] }, { duration: 520, easing: 'cubic-bezier(.3, .7, .2, 1)', fill: 'forwards' });
    grow.onfinish = function () {
      commit();
      disc.style.opacity = '0';
      root.setTimeout(function () { disc.remove(); wiping = false; }, 280);
    };
  }

  /* ---------- shell ---------- */

  function shell() {
    doc.documentElement.lang = QL.lang === 'zh' ? 'zh-CN' : 'en';
    $('tagline').textContent = t('app.tagline');
    $('btnSettings').textContent = t('ui.settings');
    $('btnHelp').textContent = t('ui.help');
    $('skip').textContent = t('ui.skip');
    $('nav').innerHTML = NAV.map(function (name, i) {
      return '<a class="nav__item" href="#' + name + '" data-view="' + name + '"><span class="nav__idx">' + ROMAN[i] + '</span><span class="nav__label">' + t('nav.' + name) +
        '</span><span class="nav__badge num" id="badge-' + name + '"></span></a>';
    }).join('');
  }

  function meter() {
    var sem = QL.catalog.semester(ui.semester);
    if (!sem) return;
    var a = QL.agg(sem.courses.map(function (c) { return c.id; }));
    $('meter').innerHTML = '<div class="meter__row"><span class="meter__k">' + t('meter.done') + '</span><span class="meter__v num">' + a.attempted + ' / ' + a.total + '</span></div>' +
      '<div class="meter__row"><span class="meter__k">' + t('meter.acc') + '</span><span class="meter__v num">' + (a.attempts ? Math.round(a.correct / a.attempts * 100) + '%' : '—') + '</span></div>' +
      '<div class="meter__bar"><i style="width:' + (a.total ? a.attempted / a.total * 100 : 0).toFixed(1) + '%"></i></div><div class="meter__note">' + t('meter.note', { n: a.wrong }) + '</div>';
    $('badge-wrong').textContent = a.wrong || '';
    $('badge-quiz').textContent = QL.quiz.round ? QL.quiz.answeredCount() + '/' + QL.quiz.round.items.length : '';
  }

  function render(keep) {
    if (!QL.catalog.semesters.length) return;
    var name = route(), view = $('view');
    var top = keep ? view.scrollTop : 0, winTop = keep ? root.scrollY : 0;
    var v = QL.views[name]();
    $('viewTitle').innerHTML = v.title;
    $('viewSub').innerHTML = v.sub;
    $('viewRight').innerHTML = v.right;
    view.classList.toggle('is-still', !!keep);
    view.innerHTML = v.body;
    view.scrollTop = top;
    if (root.scrollY !== winTop) root.scrollTo(0, winTop);
    var on = name === 'detail' ? (ui.detail && ui.detail.from) : name;
    Array.prototype.forEach.call(doc.querySelectorAll('.nav__item'), function (a) {
      var is = a.getAttribute('data-view') === on;
      a.classList.toggle('is-on', is);
      if (is) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    meter();
    if (name === 'contribute' && ui.template == null) {
      ui.template = '';
      root.fetch('templates/bank.template.json').then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
        .then(function (txt) { ui.template = txt || 'templates/bank.template.json'; if (route() === 'contribute') render(true); });
    }
  }
  QL.render = render;
  QL.rerender = function () { QL.clearRich(); render(true); };

  /* ---------- dialogs ---------- */

  function toast(msg, bad) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.toggle('is-bad', !!bad);
    el.classList.add('is-on');
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { el.classList.remove('is-on'); }, 2400);
  }

  function ask(message) {
    return new Promise(function (resolve) {
      var dlg = $('confirmSheet');
      $('confirmText').textContent = message;
      $('confirmNo').textContent = t('ui.cancel');
      $('confirmYes').textContent = t('ui.confirm');
      function done(v) { dlg.removeEventListener('close', onClose); $('confirmYes').onclick = $('confirmNo').onclick = null; if (dlg.open) dlg.close(); resolve(v); }
      function onClose() { done(false); }
      dlg.addEventListener('close', onClose);
      $('confirmYes').onclick = function () { done(true); };
      $('confirmNo').onclick = function () { done(false); };
      dlg.showModal();
      $('confirmYes').focus();
    });
  }

  function openSheet(title, body) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = body;
    if (!$('sheet').open) $('sheet').showModal();
  }

  function settingsSheet() {
    var langs = Object.keys(QL.langs).map(function (k) {
      return '<button type="button" data-act="lang" data-arg="' + k + '" aria-pressed="' + (QL.lang === k) + '">' + QL.langs[k].name + '</button>';
    }).join('');
    openSheet(t('ui.settings'),
      '<div class="sheet__section"><h4>' + t('set.lang') + '</h4><div class="segmented">' + langs + '</div></div>' +
      '<div class="sheet__section"><h4>' + t('set.backup') + '</h4><p>' + t('set.backupNote') + '</p><div class="row" style="margin-top:12px">' +
      '<button type="button" class="btn btn--solid" data-act="export">' + t('set.export') + '</button><button type="button" class="btn" data-act="copy-backup">' + t('set.copyBackup') +
      '</button><button type="button" class="btn" data-act="import-file">' + t('set.import') + '</button></div>' +
      '<textarea id="backupText" placeholder="' + t('set.pastePh') + '"></textarea><div class="row" style="margin-top:8px"><button type="button" class="btn" data-act="import-paste">' + t('set.importPaste') + '</button></div></div>' +
      '<div class="sheet__section"><h4>' + t('set.danger') + '</h4><button type="button" class="btn btn--danger" data-act="clear-all">' + t('set.clear') + '</button></div>');
  }

  function helpSheet() {
    var k = function (s) { return '<span class="kbd">' + s + '</span>'; };
    openSheet(t('ui.help'),
      '<div class="sheet__section"><h4>' + t('help.keys') + '</h4><ul><li>' + k('1') + ' – ' + k('9') + ' ' + t('help.k1') + '</li><li>' + k('T') + ' ' + k('F') + ' ' + t('help.k2') +
      '</li><li>' + k('Enter') + ' ' + t('help.k3') + '</li><li>' + k('←') + ' ' + k('→') + ' ' + t('help.k4') + '</li></ul></div>' +
      '<div class="sheet__section"><h4>' + t('help.how') + '</h4><ul><li>' + t('help.h1') + '</li><li>' + t('help.h2') + '</li><li>' + t('help.h3') + '</li><li>' + t('help.h4') + '</li></ul></div>');
  }

  /* ---------- files and clipboard ---------- */

  function copyText(text) {
    var fallback = function () {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      (doc.querySelector('dialog[open]') || doc.body).appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    };
    var p = root.navigator.clipboard && root.navigator.clipboard.writeText
      ? root.navigator.clipboard.writeText(text).then(function () { return true; }, fallback) : Promise.resolve(fallback());
    return p.then(function (ok) { toast(t(ok ? 'ui.copied' : 'ui.copyFail'), !ok); });
  }

  /** Offer a file to the viewer: through the host's download capability when the page runs as a Claude artifact, otherwise a plain download. */
  function saveFile(name, text) {
    var hosted = root.claude && typeof root.claude.use === 'function';
    var cap = hosted ? root.claude.use('downloads').catch(function () { return null; }) : Promise.resolve(null);
    return cap.then(function (dl) {
      if (dl) return dl.save({ filename: name, data: text }).then(function () { return true; }, function () { return false; });
      if (hosted) return false;
      try {
        var url = root.URL.createObjectURL(new root.Blob([text], { type: 'application/json' }));
        var a = doc.createElement('a');
        a.href = url; a.download = name;
        doc.body.appendChild(a); a.click(); a.remove();
        root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 4000);
        return true;
      } catch (e) { return false; }
    });
  }

  function importBackup(text) {
    var obj = null;
    try { obj = JSON.parse(text); } catch (e) { obj = null; }
    if (!obj || obj.app !== 'quiz-ledger') { toast(t('set.badFile'), true); return; }
    ask(t('set.importConfirm')).then(function (yes) {
      if (!yes) return;
      if (!QL.store.importAll(obj)) { toast(t('set.badFile'), true); return; }
      root.location.reload();
    });
  }

  /* ---------- quiz helpers ---------- */

  function submit() {
    var q = QL.quiz.current();
    if (!q || QL.quiz.state(q.key)) return;
    var resp;
    if (q.type === 'fill_blank') {
      resp = q.answer.map(function (_, i) { var el = $('blank-' + i); return el ? el.value : ''; });
    } else if (q.type === 'multiple_choice') {
      resp = ui.pick || [];
      if (!resp.length) { toast(t('quiz.pickMulti')); return; }
    } else {
      if (!ui.pick || !ui.pick.length) { toast(t('quiz.pickFirst')); return; }
      resp = q.type === 'true_false' ? ui.pick[0] === 'T' : ui.pick[0];
    }
    QL.quiz.answer(resp);
    ui.pick = null;
    render(true);
  }

  function pick(label) {
    var q = QL.quiz.current();
    if (route() !== 'quiz' || !q || q.type === 'fill_blank' || QL.quiz.state(q.key)) return;
    if (q.type === 'multiple_choice') {
      ui.pick = ui.pick || [];
      var i = ui.pick.indexOf(label);
      if (i >= 0) ui.pick.splice(i, 1); else ui.pick.push(label);
    } else ui.pick = [label];
    Array.prototype.forEach.call(doc.querySelectorAll('#view .opt'), function (el) {
      el.classList.toggle('is-sel', ui.pick.indexOf(el.getAttribute('data-arg')) >= 0);
    });
  }

  function move(fn) { ui.pick = null; if (fn() !== false) render(); }

  function endRound() {
    var r = QL.quiz.round;
    if (!r) return;
    var left = r.items.length - QL.quiz.answeredCount();
    (left > 0 ? ask(t('quiz.endConfirm', { n: left })) : Promise.resolve(true)).then(function (yes) {
      if (!yes) return;
      QL.quiz.finish();
      ui.pick = null;
      go('quiz');
    });
  }

  function startRound(opts) {
    var r = QL.quiz.round, n = r ? QL.quiz.answeredCount() : 0;
    (r && n ? ask(t('setup.replace', { a: n })) : Promise.resolve(true)).then(function (yes) {
      if (!yes) return;
      if (r) QL.quiz.finish();
      if (!QL.quiz.start(opts)) return;
      ui.pick = null;
      go('quiz');
    });
  }

  function saveSetup() { QL.store.setPref('setup', ui.setup); QL.store.setPref('selected', ui.selected); }

  function toggleIn(list, value) {
    var i = list.indexOf(value);
    if (i >= 0) list.splice(i, 1); else list.push(value);
    return list;
  }

  /* ---------- actions (data-act) ---------- */

  var actions = {
    'skip': function () { $('main').focus(); },
    'toggle-course': function (id) {
      toggleIn(ui.selected, id);
      var order = Object.keys(QL.catalog.courses);
      ui.selected.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      saveSetup(); render(true);
    },
    'set-scope': function (v) { ui.setup.scope = v; saveSetup(); render(true); },
    'set-order': function (v) { ui.setup.order = v; saveSetup(); render(true); },
    'set-limit': function (v) { ui.setup.limit = Number(v) || 0; saveSetup(); render(true); },
    'set-type': function (ty) {
      var present = QL.TYPES.filter(function (x) { return ui.selected.some(function (id) { var b = QL.catalog.banks[id]; return b && b.counts[x]; }); });
      var list = toggleIn((ui.setup.types || present).slice(), ty);
      ui.setup.types = present.every(function (x) { return list.indexOf(x) >= 0; }) ? null : list;
      saveSetup(); render(true);
    },
    'set-unit': function (uid, el) {
      var cid = el.getAttribute('data-course'), all = QL.catalog.banks[cid].units.map(function (u) { return u.id; });
      var list = toggleIn((ui.setup.units[cid] || all).slice(), uid);
      if (list.length === all.length) delete ui.setup.units[cid]; else ui.setup.units[cid] = list;
      saveSetup(); render(true);
    },
    'units-all': function (cid) { delete ui.setup.units[cid]; saveSetup(); render(true); },
    'units-none': function (cid) { ui.setup.units[cid] = []; saveSetup(); render(true); },
    'set-diff': function (d) {
      var list = toggleIn((ui.setup.difficulty || [1, 2, 3]).slice(), Number(d));
      ui.setup.difficulty = list.length === 3 ? null : list;
      saveSetup(); render(true);
    },
    'start': function () { startRound(QL.setupOpts()); },
    'start-wrong': function () {
      var ids = QL.wrongRows(ui.wcourse).map(function (r) { return r.q.bank; }).filter(function (x, i, a) { return a.indexOf(x) === i; });
      startRound({ courses: ids, scope: 'wrong', order: 'shuffle', limit: 0 });
    },
    'pick': pick,
    'submit': submit,
    'judge': function (v) { QL.quiz.judge(v === '1'); render(true); },
    'next': function () { move(QL.quiz.next); },
    'prev': function () { move(QL.quiz.prev); },
    'goto': function (i) { move(function () { return QL.quiz.go(Number(i)); }); },
    'tab': function (ty) { move(function () { QL.quiz.jumpTab(ty); }); },
    'end': endRound,
    'detail': function (key, el) {
      var hist = el.getAttribute('data-hist');
      ui.detail = { key: key, hist: hist == null ? null : Number(hist), from: route() === 'detail' ? ui.detail.from : route() };
      QL.catalog.load(key.slice(0, key.indexOf(':'))).then(function () { go('detail'); });
    },
    'wcourse': function (v) { ui.wcourse = v; render(true); },
    'scourse': function (v) { ui.scourse = v; ui.spage = 0; render(true); },
    'hcourse': function (v) { ui.hcourse = v; ui.hpage = 0; render(true); },
    'stype': function (v) { ui.stype = v; ui.spage = 0; render(true); },
    'sdone': function () { ui.sdone = !ui.sdone; ui.spage = 0; render(true); },
    'spage': function (v) { ui.spage = Math.max(0, Number(v)); render(true); },
    'hpage': function (v) { ui.hpage = Math.max(0, Number(v)); render(true); },
    'clear-history': function () {
      ask(t('history.clearConfirm')).then(function (yes) { if (yes) { QL.store.clearHistory(); render(); } });
    },
    'palette': function (id, el, e) {
      var box = el.getBoundingClientRect(), keyed = !e || (!e.clientX && !e.clientY);
      switchPalette(id, keyed ? box.left + box.width / 2 : e.clientX, keyed ? box.top + box.height / 2 : e.clientY);
    },
    'pal-filter': function (v, el) { ui.pal[el.getAttribute('data-key')] = v; render(true); },
    'pal-reset': function () { ui.pal = { g: 'all', h: 'all', s: 'all', d: 'all', q: '' }; render(true); },
    'copy': function (id) { copyText($(id).textContent); },
    'lang': function (k) { QL.lang = k; QL.store.setPref('lang', k); shell(); render(true); settingsSheet(); },
    'open-settings': settingsSheet,
    'open-help': helpSheet,
    'close-sheet': function () { $('sheet').close(); },
    'export': function () {
      var name = 'quiz-ledger-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      saveFile(name, JSON.stringify(QL.store.exportAll(), null, 1)).then(function (ok) { toast(t(ok ? 'set.exported' : 'set.exportFail'), !ok); });
    },
    'copy-backup': function () { copyText(JSON.stringify(QL.store.exportAll())); },
    'import-file': function () { $('importFile').click(); },
    'import-paste': function () { importBackup($('backupText').value); },
    'clear-all': function () {
      ask(t('set.clearConfirm')).then(function (yes) {
        if (!yes) return;
        QL.store.clearAll();
        QL.quiz.round = null; QL.quiz.summary = null;
        $('sheet').close();
        toast(t('set.cleared'));
        render();
      });
    }
  };
  QL.actions = actions;

  /* ---------- events ---------- */

  function wire() {
    doc.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el || el.disabled) return;
      var fn = actions[el.getAttribute('data-act')];
      if (fn) fn(el.getAttribute('data-arg'), el, e);
    });

    doc.addEventListener('input', function (e) {
      var el = e.target;
      if (el.hasAttribute('data-blank')) {
        ui.pick = ui.pick || [];
        ui.pick[Number(el.getAttribute('data-blank'))] = el.value;
      } else if (el.id === 'palSearch') {
        ui.pal.q = el.value;
        var list = QL.paletteList();
        $('palList').innerHTML = list.html;
        $('palCount').textContent = list.count;
      } else if (el.hasAttribute('data-note')) {
        root.clearTimeout(noteTimer);
        noteTimer = root.setTimeout(function () { QL.store.setNote(el.getAttribute('data-note'), el.value); }, 250);
      }
    });

    doc.addEventListener('change', function (e) {
      var el = e.target;
      if (el.id === 'semSelect') {
        ui.semester = el.value;
        QL.store.setPref('semester', ui.semester);
        render();
        QL.catalog.loadMany(QL.catalog.semester(ui.semester).courses.map(function (c) { return c.id; })).then(function () { render(true); });
      } else if (el.id === 'importFile' && el.files && el.files[0]) {
        var reader = new root.FileReader();
        reader.onload = function () { importBackup(String(reader.result)); };
        reader.readAsText(el.files[0]);
        el.value = '';
      } else if (el.hasAttribute && el.hasAttribute('data-note')) {
        QL.store.setNote(el.getAttribute('data-note'), el.value);
      }
    });

    // a small sample of the palette beside the card under the pointer or the focus
    var over = function (e) {
      var el = e.target.closest ? e.target.closest('[data-preview]') : null;
      if (el) showPeek(el);
    };
    var out = function (e) {
      var el = e.target.closest ? e.target.closest('[data-preview]') : null;
      if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) hidePeek();
    };
    doc.addEventListener('mouseover', over);
    doc.addEventListener('focusin', over);
    doc.addEventListener('mouseout', out);
    doc.addEventListener('focusout', out);
    $('view').addEventListener('scroll', hidePeek, { passive: true });
    root.addEventListener('scroll', hidePeek, { passive: true });

    doc.addEventListener('keydown', function (e) {
      var tag = e.target.tagName;
      if (e.key === 'Enter' && tag === 'TR' && e.target.hasAttribute('data-act')) { e.target.click(); return; }
      if (route() !== 'quiz' || !QL.quiz.round || doc.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
      var q = QL.quiz.current(), st = QL.quiz.state(q.key);
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'INPUT') { if (e.key === 'Enter' && !st) { e.preventDefault(); submit(); } return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); actions.prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); actions.next(); }
      else if (e.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return;          // the focused control handles it
        e.preventDefault();
        if (!st) submit(); else if (st.ok !== null) actions.next();
      } else if (!st && q.type !== 'fill_blank') {
        var key = e.key.toLowerCase();
        if (q.type === 'true_false') {
          if (key === 't' || key === '1') pick('T'); else if (key === 'f' || key === '2') pick('F');
        } else if (key >= '1' && key <= '9' && q.options[Number(key) - 1]) pick(q.options[Number(key) - 1].label);
      }
    });

    root.addEventListener('hashchange', function () { ui.pick = null; render(); });
  }

  /* ---------- start ---------- */

  function fail(e) {
    $('viewTitle').textContent = t('err.catalog');
    $('viewSub').textContent = e && e.message ? e.message : '';
    $('view').innerHTML = '<div class="pad"><div class="banner"><p>' + h(t('err.catalogHint')) + '</p></div></div>';
  }

  function init() {
    var nav = (root.navigator.language || 'zh').toLowerCase();
    QL.lang = QL.store.pref('lang', nav.indexOf('zh') === 0 ? 'zh' : 'en');
    if (!QL.langs[QL.lang]) QL.lang = 'zh';
    applyPalette(QL.store.pref('palette', 'warm'));
    shell();
    wire();
    $('viewTitle').textContent = t('nav.home');
    $('viewSub').textContent = t('ui.loading');
    QL.catalog.init().then(function () {
      var sem = QL.store.pref('semester', '');
      ui.semester = QL.catalog.semester(sem) ? sem : QL.catalog.defaultSemester;
      var saved = QL.store.pref('setup', null);
      if (saved) Object.keys(ui.setup).forEach(function (k) { if (k in saved) ui.setup[k] = saved[k]; });
      if (!ui.setup.units || typeof ui.setup.units !== 'object') ui.setup.units = {};
      var first = QL.catalog.semester(ui.semester).courses[0];
      ui.selected = (QL.store.pref('selected', null) || (first ? [first.id] : [])).filter(function (id) { return QL.catalog.courses[id]; });
      render();
      var round = QL.store.round();
      var ids = QL.catalog.semester(ui.semester).courses.map(function (c) { return c.id; }).concat(ui.selected, round && Array.isArray(round.courses) ? round.courses : []);
      ids = ids.filter(function (id, i) { return ids.indexOf(id) === i && QL.catalog.courses[id]; });
      return QL.catalog.loadMany(ids);
    }).then(function () {
      QL.quiz.restore();
      ready = true;
      render();
    }).catch(fail);
  }

  QL.app = { init: init, applyPalette: applyPalette, isReady: function () { return ready; } };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
