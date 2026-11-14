/* md.js — renders a note written in Markdown, with LaTeX, to safe HTML.
 *
 * Notes are the user's own text, typed into a textarea and shown again as they
 * type. The subset is the part of Markdown people use in notes:
 *   # headings, **bold**, *italic*, ~~strike~~, ==highlight==, `code`,
 *   fenced code blocks, - and 1. lists (nested by indent, with [ ] and [x]),
 *   > quotes, --- rules, pipe tables, [links](https://…), and a new line is a line break.
 * Math is $…$ or \(…\) in a line and $$…$$ or \[…\] on its own, typeset by KaTeX.
 * Everything is escaped before any markup is added, links are limited to
 * http, https and mailto, and KaTeX runs with trust off, so a note can never
 * inject markup, whatever is pasted into it.
 */
(function (root) {
  'use strict';
  var QL = root.QL = root.QL || {};
  var OPEN = '', CLOSE = '';
  var SLOT = /(\d+)/g, SLOT_LINE = /^\s*(\d+)\s*$/;

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function tex(src, display) {
    var html;
    if (!root.katex) html = '<code>' + esc(src) + '</code>';
    else {
      try {
        // half-typed formulas are the normal case here: show the error in place instead of throwing
        html = root.katex.renderToString(src.trim(), { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, errorColor: '#B3261E' });
      } catch (e) {
        html = '<code class="tex-err">' + esc(src) + '</code>';
      }
    }
    return display ? '<span class="md-display">' + html + '</span>' : html;
  }

  function inline(s) {
    return s
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (all, label, url) {
        return /^(https?:\/\/|mailto:)/i.test(url) ? '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>' : all;
      })
      .replace(/\*\*(?!\s)([^\n]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(?!\s)([^\n]+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\\])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^\w\\])_(?!\s)([^_\n]+?)_(?![\w])/g, '$1<em>$2</em>')
      .replace(/~~(?!\s)([^\n]+?)~~/g, '<del>$1</del>')
      .replace(/==(?!\s)([^\n]+?)==/g, '<mark>$1</mark>')
      .replace(/\\([*_~=#\-`\[\]()|])/g, '$1');
  }

  function cells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function md(src) {
    src = String(src == null ? '' : src).replace(/\r\n?/g, '\n').replace(/[]/g, '');
    if (!src.trim()) return '';
    var keep = [], isBlock = [];
    function stash(html, block) { keep.push(html); isBlock.push(!!block); return OPEN + (keep.length - 1) + CLOSE; }

    // Code and math are lifted out first, so their contents are never read as Markdown.
    src = src.replace(/(^|\n)```[^\n]*\n([\s\S]*?)(?:\n```[ \t]*(?=\n|$)|$)/g, function (all, lead, body) {
      return lead + stash('<pre><code>' + esc(body) + '</code></pre>', true);
    });
    src = src.replace(/`([^`\n]+)`/g, function (all, body) { return stash('<code>' + esc(body) + '</code>'); });
    src = src.replace(/\$\$([\s\S]+?)\$\$/g, function (all, body) { return stash(tex(body, true)); });
    src = src.replace(/\\\[([\s\S]+?)\\\]/g, function (all, body) { return stash(tex(body, true)); });
    src = src.replace(/\\\(([\s\S]+?)\\\)/g, function (all, body) { return stash(tex(body, false)); });
    src = src.replace(/(^|[^\\$])\$(?!\s)((?:\\.|[^$\\\n])+?)\$(?!\d)/g, function (all, lead, body) { return lead + stash(tex(body, false)); });
    src = esc(src.replace(/\\\$/g, '$'));

    var lines = src.split('\n'), out = [], para = [], quote = [], lists = [], i = 0, m;
    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join('<br>')) + '</p>'); para = []; } }
    function flushQuote() { if (quote.length) { out.push('<blockquote>' + inline(quote.join('<br>')) + '</blockquote>'); quote = []; } }
    function closeLists(indent) {
      while (lists.length && lists[lists.length - 1].indent > indent) out.push('</li></' + lists.pop().type + '>');
    }
    function flushAll() { flushPara(); flushQuote(); closeLists(-1); }
    function item(indent, type, text) {
      flushPara(); flushQuote();
      text = text.replace(/^\[ \]\s+/, '<span class="md-box">☐</span> ').replace(/^\[[xX]\]\s+/, '<span class="md-box">☑</span> ');
      closeLists(indent);
      var top = lists[lists.length - 1];
      if (top && top.indent === indent && top.type === type) out.push('</li><li>' + inline(text));
      else {
        if (top && top.indent === indent) out.push('</li></' + lists.pop().type + '>');
        out.push('<' + type + '><li>' + inline(text));
        lists.push({ indent: indent, type: type });
      }
    }

    for (; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { flushAll(); continue; }
      if ((m = SLOT_LINE.exec(line)) && isBlock[+m[1]]) { flushAll(); out.push(keep[+m[1]]); continue; }
      if ((m = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flushAll();
        var level = Math.min(m[1].length + 2, 6);
        out.push('<h' + level + '>' + inline(m[2]) + '</h' + level + '>');
        continue;
      }
      if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
      if ((m = /^ {0,3}&gt; ?(.*)$/.exec(line))) { flushPara(); closeLists(-1); quote.push(m[1]); continue; }
      if ((m = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line))) {
        item(m[1].replace(/\t/g, '  ').length, /\d/.test(m[2]) ? 'ol' : 'ul', m[3]);
        continue;
      }
      if (line.indexOf('|') >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]) && lines[i + 1].indexOf('|') >= 0) {
        flushAll();
        var html = '<table><thead><tr>' + cells(line).map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        for (i += 2; i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim(); i++) {
          html += '<tr>' + cells(lines[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
        }
        i--;
        out.push(html + '</tbody></table>');
        continue;
      }
      flushQuote();
      if (lists.length && /^\s{2,}\S/.test(line)) { out.push('<br>' + inline(line.trim())); continue; }   // a continued list item
      closeLists(-1);
      para.push(line.trim());
    }
    flushAll();
    return out.join('').replace(SLOT, function (all, n) { return keep[+n]; });
  }

  QL.md = md;
})(typeof window !== 'undefined' ? window : globalThis);
