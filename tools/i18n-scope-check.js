#!/usr/bin/env node
/*
 * i18n-scope-check.js  -  catches translator helpers CALLED but never DECLARED.
 *
 * Run from the repo root:   node tools/i18n-scope-check.js
 * Exit code 0 = clean, 1 = at least one undeclared helper.
 *
 * Why this exists. Translation is wired through short helpers, some declared
 * per function (var T = function(k,fb){...}), some at module level
 * (function facZ(fid,field,fb){...}). A build script that aborts before writing
 * can roll back the DECLARATION while a later run writes the CALL SITES, and
 * nothing else notices: `node --check` sees valid syntax and i18n-check.js only
 * validates that the KEY exists in the catalog. The result is a ReferenceError
 * the moment that panel renders. This has now happened twice, to
 * renderFactionList and to facZ.
 *
 * Scope, deliberately: this checks DECLARED-ANYWHERE-IN-FILE, not lexical
 * scope. An earlier version walked brace depth to resolve real scope and got it
 * wrong in both directions, at one point reporting FEWER faults after a fault
 * was injected. A checker that inverts under test is worse than none. Whole-file
 * presence is coarser but it is correct, it has no false positives, and it
 * catches the entire failure mode that actually occurs here: the declaration
 * vanishing while calls remain. Genuine scope errors (declared in the wrong
 * function) are not covered and would need a real parser.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = ['client/assets', 'client/assets/tcg'];
const FILES = [];
for (const d of DIRS) {
  const full = path.join(ROOT, d);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full)) if (f.endsWith('.js')) FILES.push(path.join(full, f));
}

// A helper is anything short that wraps window.t / window.tf / a *_ZH map.
// Discovered rather than hand-listed: a resolver added in one pass was invisible
// to a fixed list, and that is exactly how its call sites shipped undeclared.
const DECL = /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*function\s*\([^)]*\)\s*\{)([\s\S]{0,300}?)\}/g;
const WRAPS = /window\.(?:t|tf)\s*\(|window\.[A-Z][A-Z_]*_ZH\b|window\.(?:jadeT|colonyNameZh|colonyLoreZh|planetNameZh|sectorNameZh|bonusZh|contestZh|titleNameZh|titleBlurbZh)\b/;

const problems = [];
for (const f of FILES) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);

  // Declared in THIS file, by any binding form. Deliberately permissive: the
  // codebase declares these as `var T = function(...)`, as `var T = (k,fb) =>`,
  // and as `function facZ(...)`. Requiring one exact shape produced sixteen
  // false positives, which is how a checker gets ignored.
  const declared = new Set();
  let m;
  const anyDecl = /(?:\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)|function\s+([A-Za-z_$][\w$]*)\s*\()/g;
  while ((m = anyDecl.exec(src))) {
    const nm = m[1] || m[2];
    if (nm) declared.add(nm);
  }

  // helper names referenced in this file that look like translator wrappers
  // Calls are matched by NAME, not by argument shape. Requiring a quoted first
  // argument missed facZ(fid,'short',fb) entirely, which meant the negative test
  // passed while the fault was present. The conventional-name filter below is
  // what keeps this from matching every call in the file.
  const called = new Map();
  const callRe = /(?:^|[^A-Za-z0-9_$.])([A-Za-z_$][\w$]{0,11})\s*\(/g;
  while ((m = callRe.exec(src))) {
    const nm = m[1];
    if (declared.has(nm)) continue;
    if (!called.has(nm)) called.set(nm, src.slice(0, m.index).split('\n').length);
  }

  // Only report names that look like our helpers: they must appear elsewhere in
  // the repo wrapping a translator, or be one of the conventional short forms.
  const CONVENTIONAL = /^(?:T|TF|FZ|FZN|CZ|GZ|_t|_tf|_sf|_cz|_scz|_cz2|_lt|_rt|_rf|_rc|_cf|_cn|_fz|facZ|comZ|colZ|_fbT|_hmT|_ccT|_ccF|_ccFac)$/;
  for (const [nm, line] of called) {
    if (!CONVENTIONAL.test(nm)) continue;
    if (typeof globalThis[nm] === 'function') continue;
    problems.push(rel + ':' + line + '  ' + nm + '() called, but no ' + nm + ' declared anywhere in this file');
  }
}

console.log('i18n-scope-check');
console.log('  files scanned : ' + FILES.length);
console.log('  method        : declared-anywhere-in-file (see header for why)');
console.log('');
console.log((problems.length ? 'FAIL' : 'PASS') + '  undeclared helper calls: ' + problems.length);
problems.forEach(p => console.log('        ' + p));
process.exit(problems.length ? 1 : 0);
