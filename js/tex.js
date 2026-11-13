/* tex.js — turns bank text into safe HTML.
 *
 * Bank strings are LaTeX-flavoured plain text: $…$ and $$…$$ are typeset by
 * KaTeX, and a small set of text-mode commands is understood outside math
 * (\emph \textit \textbf \texttt \underline, \% \& \# \_ \{ \} \$, -- and ---,
 * `` and '', ~, \\ for a line break, a blank line for a new paragraph).
 * Everything else is escaped, so a bank can never inject markup.
 * A run of four or more underscores is a blank to fill in, inside or outside math.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var cache = new Map();
  var WRAP = { emph: 'em', textit: 'em', textbf: 'strong', texttt: 'code', underline: 'u' };
  var WRAP_RE = /\\(emph|textit|textbf|texttt|underline)\{([^{}]*)\}/;

  QL.texErrors = [];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function math(src, display, st) {
    // a blank written inside math, bare or as \text{____}, becomes a numbered rule
    src = src.replace(/\\text\{\s*_{4,}\s*\}|_{4,}/g, function () {
      st.blank += 1;
      return '\\underline{\\enspace\\scriptstyle ' + st.blank + '\\enspace}';
    });
    if (!root.katex) return '<code>' + esc(src) + '</code>';
    try {
      return root.katex.renderToString(src, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false });
    } catch (e) {
      QL.texErrors.push({ src: src, message: e.message });
      return '<code class="tex-err" title="' + esc(e.message) + '">' + esc(src) + '</code>';
    }
  }

  function text(src, st) {
    var s = esc(src);
    s = s.replace(/_{4,}/g, function () { st.blank += 1; return '<span class="blank">' + st.blank + '</span>'; });
    for (var i = 0; i < 24 && WRAP_RE.test(s); i++) {
      s = s.replace(WRAP_RE, function (_, c, body) { return '<' + WRAP[c] + '>' + body + '</' + WRAP[c] + '>'; });
    }
    return s.replace(/\\\\/g, '<br>')
      .replace(/\\&amp;/g, '&amp;').replace(/\\([%#_{}])/g, '$1')
      .replace(/---/g, '—').replace(/--/g, '–')
      .replace(/``/g, '“').replace(/''/g, '”')
      .replace(/~/g, ' ').replace(/\n/g, '<br>').replace(/\u0001/g, '$');
  }

  function paragraph(src, st) {
    var out = '', buf = '', i = 0, n = src.length;
    while (i < n) {
      var ch = src[i];
      if (ch === '\\' && src[i + 1] === '$') { buf += '\u0001'; i += 2; continue; }
      if (ch === '$') {
        var dbl = src[i + 1] === '$', open = dbl ? 2 : 1, j = i + open, end = -1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '$' && (!dbl || src[j + 1] === '$')) { end = j; break; }
          j++;
        }
        if (end < 0) { buf += src.slice(i); break; }
        out += text(buf, st) + math(src.slice(i + open, end), dbl, st);
        buf = ''; i = end + open; continue;
      }
      buf += ch; i++;
    }
    return out + text(buf, st);
  }

  /** Render a bank string to HTML. */
  function rich(src) {
    if (src == null) return '';
    src = String(src);
    var hit = cache.get(src);
    if (hit !== undefined) return hit;
    var st = { blank: 0 };
    var paras = src.split(/\n\s*\n/).filter(function (p) { return p.trim() !== ''; });
    var html = paras.length > 1
      ? paras.map(function (p) { return '<p>' + paragraph(p.trim(), st) + '</p>'; }).join('')
      : paragraph(src.trim(), st);
    if (!root.katex) return html;            // KaTeX still loading: do not remember the plain version
    if (cache.size > 4000) cache.clear();
    cache.set(src, html);
    return html;
  }

  QL.esc = esc;
  QL.rich = rich;
  QL.clearRich = function () { cache.clear(); };
})(typeof window !== 'undefined' ? window : globalThis);
