#!/usr/bin/env node
/*
 * i18n-check.js  -  localization verifier for the client.
 *
 * Run from the repo root:   node tools/i18n-check.js
 * Exit code 0 = clean, 1 = at least one FAIL.
 *
 * Why this exists. Earlier passes verified the no-em-dash rule with a grep for
 * the raw U+2014 byte. That grep reported clean while 33 player-facing strings
 * still rendered an em dash, because they were written as the escape sequence
 * \u2014 instead of the literal character. A JS escape renders identically on
 * screen. The check was measuring file encoding, not what the player sees.
 *
 * The three checks below all measure the rendered result:
 *
 *   1. EM DASH      Both the raw character and the \u2014 escape, inside string
 *                   literals only. Comments are exempt (never rendered), and so
 *                   are the empty-value placeholder cells listed in ALLOW below.
 *   2. MISSING KEY  A key passed to a translator call site that has no entry in
 *                   window.I18N. Invisible in English (the inline fallback
 *                   renders) and silently English in Chinese. This is the
 *                   failure mode a grep can never catch.
 *   3. MISSING ZH   A catalog entry with an en value but no zh value. Same
 *                   visible result: English text under the Jade toggle.
 *   4. TOKEN        A {token} in an en or zh string that the tf() call site does
 *                   not supply. Renders the literal braces to the player. The
 *                   vars object is extracted by brace matching, because nested
 *                   calls like {cargo:_cz(d.cargo)} defeat a plain regex.
 *   5. INTERPOLATION A ${} placed inside a single- or double-quoted string
 *                   instead of a backtick template. Renders the literal braces.
 *   6. GLYPH        A data-i18n element whose markup leads with an icon glyph
 *                   while its zh value does not. applyI18n overwrites
 *                   textContent, so the icon vanishes in Chinese only.
 *
 * Dynamic lookups (T('lane.'+type), T('casino.bacc.'+key)) are reported
 * separately as INFO. They cannot be resolved statically, so each namespace
 * listed there needs a manual check that every runtime value has a key.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CORE = path.join(ROOT, 'client/assets/core.js');
const FILES = [];
(function collect() {
  const dir = path.join(ROOT, 'client/assets');
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) FILES.push(path.join(dir, f));
  FILES.push(path.join(ROOT, 'client/index.html'));
})();

// Empty-value placeholder cells. These render a dash glyph in a numeric slot,
// not prose. Listed explicitly so the exemption is a decision, not a blind spot.
const ALLOW = [
  'id="gSmugPayout"', 'id="gSmugAtRisk"', 'id="gSmugEV"', "$('fmcName')",
  "mc.symbol || '\u2014'",
];

// Translator identifiers used across the client. Local aliases are conventional
// (T, TF, _t, _tf, _sf, _lt); add here if a new alias is introduced.
const CALL = /(?:^|[^A-Za-z0-9_$.])(?:window\.)?(t|tf|T|TF|_t|_tf|_sf|_lt|_cz|_scz)\(\s*'([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)'/g;
const DYN = /(?:^|[^A-Za-z0-9_$.])(?:window\.)?(?:t|tf|T|TF|_t|_tf|_sf|_lt)\(\s*'([a-z][A-Za-z0-9_.]*\.)'\s*\+/g;
const ATTR = /data-i18n(?:-ph)?=["']([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)["']/g;
const DEF = /'([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)'\s*:\s*\{\s*en\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(?:,\s*zh\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*)?\}/g;

const core = fs.readFileSync(CORE, 'utf8');
const defs = new Map();
for (const m of core.matchAll(DEF)) defs.set(m[1], { en: m[2], zh: m[3] || null });

const refs = new Map(), dyn = new Set();
for (const f of FILES) {
  const txt = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const m of txt.matchAll(CALL)) (refs.get(m[2]) || refs.set(m[2], new Set()).get(m[2])).add(rel);
  for (const m of txt.matchAll(ATTR)) (refs.get(m[1]) || refs.set(m[1], new Set()).get(m[1])).add(rel);
  for (const m of txt.matchAll(DYN)) dyn.add(m[1] + '* (' + rel + ')');
}

// ── check 1: em dashes that reach the screen ──
const dashHits = [];
for (const f of FILES) {
  const rel = path.relative(ROOT, f);
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (!/\u2014|\\u2014/.test(line)) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;            // JS comment line
    if (/^\s*<!--/.test(line) || /^\s*\/\*/.test(line)) return; // HTML / block comment
    if (ALLOW.some(a => line.includes(a))) return;          // placeholder cell
    dashHits.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 100));
  });
}

const missing = [...refs.keys()].filter(k => !defs.has(k));
const noZh = [...defs.keys()].filter(k => !defs.get(k).zh);

// ── check 4: {token} interpolation ──
// A {token} present in an en or zh string but not supplied by the call site
// renders the literal braces to the player. The vars object is the third
// argument to tf(), so it has to be extracted by brace matching, not regex:
// nested calls like {cargo:_cz(d.cargo)} defeat a naive pattern and produce
// false positives.
function varsAt(txt, from) {
  let depth = 0, i = from, args = 0, start = -1;
  for (; i < txt.length && i < from + 4000; i++) {
    const c = txt[i];
    if (c === '(' || c === '[' || c === '{') { if (c === '{' && depth === 1 && args === 2 && start < 0) start = i; depth++; }
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; if (depth === 1 && start >= 0) return txt.slice(start, i + 1); }
    else if (c === ',' && depth === 1) args++;
    else if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < txt.length && txt[i] !== q) { if (txt[i] === '\\') i++; i++; } }
  }
  return start >= 0 ? txt.slice(start) : '';
}
const tokenBad = [];
const TFCALL = /(?:^|[^A-Za-z0-9_$.])(?:window\.)?(?:tf|TF|_tf|_sf)(\(\s*'([a-z][A-Za-z0-9_.]+)'\s*,)/g;
for (const f of FILES) {
  const txt = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  for (const m of txt.matchAll(TFCALL)) {
    const key = m[2], d = defs.get(key);
    if (!d) continue;
    // Group 1 starts at the call's own '('. Deriving the offset from m[0]
    // instead finds the ENCLOSING call's paren whenever tf() is nested inside
    // another call (gToast(_tf(...))), which throws depth counting off by one
    // and silently reports every call site as supplying nothing.
    const openIdx = m.index + m[0].length - m[1].length;
    const supplied = new Set([...varsAt(txt, openIdx)
      .matchAll(/[{,]\s*([A-Za-z0-9_]+)\s*:/g)].map(x => x[1]));
    for (const str of [d.en, d.zh]) {
      if (!str) continue;
      for (const t of new Set([...str.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(x => x[1])))
        if (!supplied.has(t)) tokenBad.push(rel + '  ' + key + '  needs {' + t + '}, call site supplies {' + [...supplied].join(', ') + '}');
    }
  }
}

// ── check 5: ${} interpolation inside a NON-template string ──
// Wiring a translator call into HTML that is built with single quotes rather
// than backticks produces '<span title="${window.t(...)}">'. When the injected
// text contains a quote, node --check catches it. When it does not, the file is
// syntactically valid and the player sees the literal characters ${...} on
// screen. That silent case is what this check exists for.
const interpBad = [];
for (const f of FILES) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, 'utf8');
  // Template-literal state, tracked with a small stack rather than a backtick
  // count. Nested templates inside ${} expressions (common in this codebase:
  // `...${cond ? `<div>` : ''}`) flip a naive counter twice on one line and make
  // it report the enclosing block as plain string. The stack models it exactly:
  // a backtick opens/closes a template, ${ pushes an expression, } pops it.
  const stack = [];
  const inTpl = () => stack[stack.length - 1] === 'tpl';
  src.split('\n').forEach((line, i) => {
    const startedInside = inTpl();
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === '\\\\') { k++; continue; }
      if (c === '`') { if (inTpl()) stack.pop(); else stack.push('tpl'); continue; }
      if (inTpl() && c === '$' && line[k + 1] === '{') { stack.push('expr'); k++; continue; }
      if (stack[stack.length - 1] === 'expr' && c === '}') { stack.pop(); continue; }
    }
    if (startedInside || inTpl()) return;
    if (line.indexOf('${') < 0) return;
    if (line.indexOf('`') >= 0) return;
    if (!/window\.(?:t|tf)\s*\(|\b(?:T|TF|_t|_tf)\s*\(/.test(line)) return;
    if (!/'[^'\n]*\$\{|"[^"\n]*\$\{/.test(line)) return;
    interpBad.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 110));
  });
}

// ── check 6: leading glyph dropped in Chinese ──
// applyI18n replaces textContent wholesale. When the markup reads
// <span data-i18n="hdr.bugs">🐛 Bugs</span>, English restores from the captured
// original and keeps the glyph, but Chinese renders the zh value verbatim. If
// zh omits the glyph, the icon silently disappears the moment the toggle flips,
// and only in one language. Caught seven of these in one pass.
const glyphBad = [];
{
  const htmlPath = path.join(ROOT, 'client/index.html');
  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const lead = /^([^\w\s\u4e00-\u9fff]+)\s/u;
    for (const m of html.matchAll(/data-i18n="([a-z][A-Za-z0-9_.]+)"\s*>([^<]{0,80})</g)) {
      const d = defs.get(m[1]);
      if (!d || !d.zh) continue;
      const g = m[2].trim().match(lead);
      if (!g) continue;
      const zh = d.zh.replace(/^['"]|['"]$/g, '');
      if (!zh.startsWith(g[1])) glyphBad.push(m[1] + '  dom starts "' + g[1] + '", zh does not');
    }
  }
}

const out = [];
out.push('i18n-check');
out.push('  catalog entries      : ' + defs.size);
out.push('  literal keys in use  : ' + refs.size);
out.push('');
const STRICT = process.argv.includes('--strict');
const byFile = {};
dashHits.forEach(h => { const f = h.split(':')[0]; byFile[f] = (byFile[f] || 0) + 1; });
out.push((dashHits.length ? (STRICT ? 'FAIL' : 'WARN') : 'PASS')
  + '  em dash in rendered text: ' + dashHits.length
  + (dashHits.length && !STRICT ? '   (known backlog; --strict to gate on it)' : ''));
Object.keys(byFile).sort((a, b) => byFile[b] - byFile[a])
  .forEach(f => out.push('        ' + String(byFile[f]).padStart(4) + '  ' + f));
if (STRICT) dashHits.forEach(h => out.push('        ' + h));
out.push((missing.length ? 'FAIL' : 'PASS') + '  referenced but undefined: ' + missing.length);
missing.forEach(k => out.push('        ' + k + '  <- ' + [...refs.get(k)].join(', ')));
out.push((noZh.length ? 'FAIL' : 'PASS') + '  defined without zh      : ' + noZh.length);
noZh.forEach(k => out.push('        ' + k));
out.push((tokenBad.length ? 'FAIL' : 'PASS') + '  unsupplied {token}      : ' + tokenBad.length);
tokenBad.forEach(t => out.push('        ' + t));
out.push((interpBad.length ? 'FAIL' : 'PASS') + '  ${} in plain string    : ' + interpBad.length);
interpBad.forEach(t => out.push('        ' + t));
out.push((glyphBad.length ? 'FAIL' : 'PASS') + '  glyph dropped in zh    : ' + glyphBad.length);
glyphBad.forEach(t => out.push('        ' + t));
out.push('');
out.push('INFO  dynamic namespaces (verify every runtime value has a key):');
[...dyn].sort().forEach(d => out.push('        ' + d));

console.log(out.join('\n'));
process.exit(((STRICT && dashHits.length) || missing.length || noZh.length || tokenBad.length || interpBad.length || glyphBad.length) ? 1 : 0);
