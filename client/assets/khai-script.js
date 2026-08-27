// ═══════════════════════════════════════════════════════════════════════════
// khai-script.js - the Khai'sultull ledger script.
//
// WHY THE SCRIPT IS A NUMBER SYSTEM AND NOT AN ALPHABET WITH ALIEN LETTERS.
// Every fact established about this species is clerical. They have a ministry
// under an ocean whose accounts have not been late once. They named a world
// Ninth Concession before making the ninth demand, which means the list was
// written first. They quoted a Guild valuation back with the date. A species
// like that does not write sounds, it writes AMOUNTS, and the sounds are what
// falls out of reading an amount aloud. So each consonant sign carries a value
// from 0 to 15, a word is read left to right as base sixteen digits, and every
// name they have given us is therefore also a figure.
//
// THE VOWELS CARRY NO VALUE, deliberately. They are the part of the language
// you can say without settling anything, which is the joke and also the reason
// their translation layer renders sixteen different brood claims on Vesskanoth
// as one identical sentence: the parts that differ are the parts that do not
// count.
//
// THE SIGN SHAPE IS THE ARITHMETIC. Hooks off the right of the stem are worth
// four, hooks off the left are worth one, so a sign is legible as a quantity
// before it is legible as a sound: value = 4 * (right hooks) + (left hooks),
// and three of each is fifteen. Nothing is memorised.
//
// NO VOICED STOPS. No b, d, g or p anywhere in the corpus: k without g, t
// without d. The inventory below is derived from the two names that were canon
// before any of this existed, Khai'sultull and Zharkofin, and it renders every
// world name shipped since without a gap.
//
// A DOUBLED SIGN DOUBLES ITS VALUE and may never open a word. You cannot begin
// a ledger with an overflow. tools/reach-check.mjs asserts that.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // value -> romanisation. The index IS the value.
  //
  // THIS TABLE IS THE GM'S SHEET, not a derivation. An earlier build of this
  // file reconstructed the inventory from the phonology and got a self
  // consistent system that was not the canon one: it made the glottal stop a
  // MARK, invented a bare z, and assigned every value differently. The sheet
  // is authority. The only thing the reconstruction got right was the
  // arithmetic, value = 4 * right hooks + left hooks, which is preserved here
  // because the sheet draws exactly that.
  var SIGNS = ["'", 's', 'r', 'th', 'l', 'n', 't', 'k',
               'v', 'm', 'zh', 'kh', 'h', 'f', 'sh', 'ng'];

  // Their names for their own letters, in reading order.
  var SIGN_NAME = ['iss', 'sath', 'ruur', 'thaal', 'lull', 'nekk', 'tekk', 'kar',
                   'vor', 'mekh', 'zhaal', 'khai', 'hoss', 'fin', 'shuur', 'nguth'];

  // THE GLOTTAL STOP IS A SIGN AND IT IS ZERO. That is the sharpest thing in
  // the whole system and it is not decoration: a clerical species wrote a sign
  // for nothing owed and put it first. It is drawn as a closed ring rather than
  // hooks, because zero has no hooks to draw, and it still occupies a digit
  // position, so a name carrying one is a name with a zero in its figure.
  var GLOTTAL = "'";

  var VALUE = {};
  SIGNS.forEach(function (g, v) { VALUE[g] = v; });

  // The marks. No value, seven forms. aa is a mark in its own right, which is
  // why Nikkathaal and Zhaal'un scan the way they do.
  var MARKS = ['a', 'aa', 'e', 'i', 'o', 'u', 'ai'];
  var MARK_NAME = {
    a: 'ah', aa: 'aah', e: 'eh', i: 'ih', o: 'oh', u: 'uh', ai: 'eye',
  };

  // Longest match first, or "kh" tokenises as k + h, "aa" as a + a, and every
  // value is wrong.
  var TOKENS = [];
  ['kh', 'th', 'zh', 'sh', 'ng'].forEach(function (g) { TOKENS.push(g); });
  SIGNS.forEach(function (g) { if (g.length === 1 && g !== GLOTTAL) TOKENS.push(g + g); });
  ['aa', 'ai'].forEach(function (m) { TOKENS.push(m); });
  SIGNS.forEach(function (g) { if (g.length === 1) TOKENS.push(g); });
  MARKS.forEach(function (m) { if (TOKENS.indexOf(m) < 0) TOKENS.push(m); });
  TOKENS.push('\u2019');    // curly apostrophe, same glottal stop
  TOKENS.sort(function (a, b) { return b.length - a.length; });

  function isMark(t) { return MARKS.indexOf(t) >= 0; }

  // Split a romanised word into { sign, doubled } and { mark } units.
  function parse(word) {
    var s = String(word || '').toLowerCase();
    var out = [], i = 0;
    while (i < s.length) {
      var hit = null;
      for (var k = 0; k < TOKENS.length; k++) {
        var t = TOKENS[k];
        if (s.substr(i, t.length) === t) { hit = t; break; }
      }
      if (!hit) { i++; continue; }              // spaces, hyphens, anything foreign
      i += hit.length;
      if (hit === '\u2019') hit = GLOTTAL;
      if (isMark(hit)) { out.push({ mark: hit }); continue; }
      var doubled = hit.length === 2 && hit[0] === hit[1] && VALUE[hit[0]] !== undefined;
      var base = doubled ? hit[0] : hit;
      if (VALUE[base] === undefined) continue;
      out.push({ sign: base, doubled: doubled, value: VALUE[base] * (doubled ? 2 : 1) });
    }
    return out;
  }

  // A word read as base sixteen. Overflow signs contribute their doubled value
  // in the digit position they occupy.
  function value(word) {
    var units = parse(word).filter(function (u) { return u.sign; });
    var n = 0;
    for (var i = 0; i < units.length; i++) n = n * 16 + units[i].value;
    return n;
  }

  // ── Drawing ────────────────────────────────────────────────────────────────
  // One cell per sign. The stem is the digit; the mark rides above the cap.
  var CELL = 15, H = 30, STEM_TOP = 9, STEM_BOT = 26;

  function markPath(m, cx) {
    var y = 5;
    switch (m) {
      case 'a':  return '<circle cx="' + cx + '" cy="' + y + '" r="1.5"/>';
      case 'e':  return '<path d="M' + (cx - 3.5) + ',' + y + ' L' + (cx + 3.5) + ',' + y + '"/>';
      case 'i':  return '<circle cx="' + (cx - 2.4) + '" cy="' + y + '" r="1.2"/>'
                      + '<circle cx="' + (cx + 2.4) + '" cy="' + y + '" r="1.2"/>';
      case 'o':  return '<circle cx="' + cx + '" cy="' + y + '" r="2.4" fill="none"/>';
      case 'u':  return '<path d="M' + (cx - 3) + ',' + (y - 2) + ' L' + cx + ',' + (y + 2)
                      + ' L' + (cx + 3) + ',' + (y - 2) + '" fill="none"/>';
      case 'ai': return '<path d="M' + (cx - 3.5) + ',' + (y + 1.5) + ' L' + (cx + 3.5) + ',' + (y + 1.5) + '"/>'
                      + '<circle cx="' + cx + '" cy="' + (y - 2.5) + '" r="1.2"/>';
      case "'":  return '<path d="M' + cx + ',' + (y - 3) + ' L' + cx + ',' + (y + 3) + '"/>';
    }
    return '';
  }

  function signPath(u, cx) {
    var v = u.doubled ? u.value / 2 : u.value;      // hooks encode the BASE value
    var right = v >> 2, left = v & 3;
    var p = '<path d="M' + cx + ',' + STEM_TOP + ' L' + cx + ',' + STEM_BOT + '" fill="none"/>';
    // Zero has no hooks to draw. The sheet rings the stem instead, and that
    // closed ring is the sign for the glottal stop.
    if (v === 0) {
      p += '<circle cx="' + cx + '" cy="' + ((STEM_TOP + STEM_BOT) / 2).toFixed(1)
         + '" r="3.4" fill="none"/>';
      if (u.doubled)
        p += '<path d="M' + (cx - 5.5) + ',' + (STEM_BOT - 1) + ' L' + (cx + 5.5) + ',' + (STEM_TOP + 4) + '" fill="none"/>';
      return p;
    }
    var rows = [13, 18, 23];
    for (var i = 0; i < right; i++)
      p += '<path d="M' + cx + ',' + rows[i] + ' l5,-3.5" fill="none"/>';
    for (var j = 0; j < left; j++)
      p += '<path d="M' + cx + ',' + rows[j] + ' l-5,-3.5" fill="none"/>';
    // The overflow stroke. A doubled sign is one digit worth twice its face,
    // and it reads as a struck stem so it is never mistaken for two signs.
    if (u.doubled)
      p += '<path d="M' + (cx - 5.5) + ',' + (STEM_BOT - 1) + ' L' + (cx + 5.5) + ',' + (STEM_TOP + 4) + '" fill="none"/>';
    return p;
  }

  // Marks attach to the sign they follow. A word may open on a mark, which gets
  // a bare cell of its own rather than being dropped.
  //
  // Marks attach to the sign they follow. A word may open on a mark, which gets
  // a bare cell of its own rather than being dropped.
  function cells(word) {
    var units = parse(word);
    var out = [], cur = null;
    units.forEach(function (u) {
      if (u.sign) { cur = { sign: u, mark: null }; out.push(cur); }
      else if (cur && !cur.mark) cur.mark = u.mark;
      else { out.push({ sign: null, mark: u.mark }); cur = null; }
    });
    return out;
  }

  // THE RULE, EXACTLY AS THE SHEET STATES IT: a doubled sign doubles its value
  // and must be PRECEDED BY A VOWEL. No word opens on one.
  //
  // This is stronger than the "may never open a line" wording an earlier build
  // of this file worked from, and it is the better rule, because it says why:
  // an overflow is a carry, and a carry needs something to carry out of. A
  // vowel is what holds that place. "No word opens on one" then falls out of it
  // rather than being a second rule, since a word-initial doubled sign has
  // nothing before it at all.
  //
  // Every canon name satisfies it. Ossuveth and Ussaleth carry a doubled s as
  // their first SIGN and are legal, because the o and the u are what precede
  // them. That was the open question and the sheet settles it.
  function overflowViolations(word) {
    var units = parse(word);
    var bad = [];
    for (var i = 0; i < units.length; i++) {
      if (!units[i].sign || !units[i].doubled) continue;
      var prev = units[i - 1];
      if (!prev || !prev.mark) bad.push(units[i].sign + units[i].sign);
    }
    return bad;
  }
  function isWritable(word) { return overflowViolations(word).length === 0; }

  // Returns an inline SVG string, or '' if the word yields no signs. Colour is
  // inherited via currentColor so a caller styles it like text.
  function glyphs(word, opts) {
    var o = opts || {};
    var cellList = cells(word);
    if (!cellList.length) return '';

    var w = cellList.length * CELL;
    var body = '';
    cellList.forEach(function (c, i) {
      var cx = i * CELL + CELL / 2;
      if (c.sign) body += signPath(c.sign, cx);
      if (c.mark) body += markPath(c.mark, cx);
    });

    var scale = Number(o.scale) || 1;
    return '<svg class="khai-glyphs" viewBox="0 0 ' + w + ' ' + H + '" '
      + 'width="' + Math.round(w * scale) + '" height="' + Math.round(H * scale) + '" '
      + 'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" '
      + 'style="vertical-align:middle;overflow:visible">'
      + '<g stroke="currentColor" stroke-width="1.15" stroke-linecap="round" fill="currentColor">'
      + body + '</g></svg>';
  }

  // What the translation layer will not give you: the figure the name is. Used
  // as a title attribute, which is exactly the right register for it. The layer
  // renders the name and withholds the meaning, and the script is the meaning
  // sitting in plain sight the whole time.
  function reading(word) {
    var units = parse(word).filter(function (u) { return u.sign; });
    if (!units.length) return '';
    var digits = units.map(function (u) { return u.value.toString(16).toUpperCase(); }).join(' ');
    return word + '  \u00b7  base sixteen ' + digits + '  \u00b7  ' + value(word).toLocaleString();
  }

  window.KhaiScript = {
    SIGNS: SIGNS, MARKS: MARKS, MARK_NAME: MARK_NAME, VALUE: VALUE,
    SIGN_NAME: SIGN_NAME, GLOTTAL: GLOTTAL,
    parse: parse, cells: cells,
    overflowViolations: overflowViolations, isWritable: isWritable,
    value: value, glyphs: glyphs, reading: reading,
  };
  window.khaiGlyphs = glyphs;
  window.khaiValue = value;
})();
