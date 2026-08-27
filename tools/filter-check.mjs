// ═══════════════════════════════════════════════════════════════════════════
// filter-check.mjs — the chat filter, driven rather than read.
//
// WHY THIS EXISTS. filterChat flagged leet spellings and published them
// unchanged for the entire life of the filter. It tested the pattern against a
// normalised copy and then replaced against the original, where a pattern that
// only matched BECAUSE of normalisation cannot match. The else branch re ran
// the same failed replace and set flagged anyway, so the function reported
// success, logged the incident to admins, and let the text through. Measured
// before the repair: 51 of 51 terms with a leet variant, and 49 of 51 with a
// SINGLE substituted character.
//
// It survived because nothing drove it. Reading the function, the shapes look
// right: there is a normalise step, a test, a replace and a flag. Every check
// in this repo that would have caught it is a check that RUNS the thing.
//
// NO SLUR APPEARS IN THIS FILE. Every probe is built from the module's own term
// list at run time, so the corpus stays in one place and this file stays
// readable in a screenshot.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import { filterChat, containsSlur, normalizeLeet } from '../server/chat-filter.js';

let pass = 0; const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n' + t); }

// The term list, read out of the module's own source so the probes cannot drift
// away from what the filter actually defends against.
const src = fs.readFileSync(new URL('../server/chat-filter.js', import.meta.url), 'utf8');
const a = src.indexOf('const SLUR_LIST = [');
const TERMS = eval(src.slice(a + 'const SLUR_LIST = '.length, src.indexOf('];', a) + 1));

section('The corpus is real');
ok('the term list parses', Array.isArray(TERMS) && TERMS.length > 20, TERMS.length + ' terms');
ok('and every entry is a plain lowercase phrase',
   TERMS.every(t => typeof t === 'string' && t === t.toLowerCase() && /^[a-z ]+$/.test(t)));

// ── The old shape must not come back ────────────────────────────────────────
section('The failure mode itself');
{
  // The specific bug was TEST against one string, REPLACE against another. A
  // future edit that reintroduces it would pass every behavioural assertion
  // below only if it also happened to work, which is the point: this one is
  // about the shape, and everything after it is about the behaviour.
  ok('the normaliser used for index mapping guarantees its own length',
     /function normalizeIndexed\(str\)/.test(src)
     && /out \+= lower\.length === 1 \? lower : ch;/.test(src));
  ok('and the length invariant is checked rather than assumed',
     /if \(normalized\.length !== text\.length\) return legacyFilter\(text\);/.test(src));
  ok('matches are cut out of the ORIGINAL at normalised indices',
     /out \+= text\.slice\(at, start\) \+ replacement;/.test(src));
}

// ── The repair ──────────────────────────────────────────────────────────────
section('A slur is censored however it is spelled');
const LEET = { a: '4', e: '3', i: '1', o: '0', s: '5' };
const leetAll = s => s.replace(/[aeios]/g, c => LEET[c]);

{
  let plain = 0, plainBad = [];
  for (const t of TERMS) {
    const r = filterChat('you are a ' + t + ' mate');
    if (r.flagged && !r.clean.includes(t)) plain++; else plainBad.push(t.length);
  }
  ok('every canonical spelling is censored', plain === TERMS.length,
     plain + ' of ' + TERMS.length);

  // THE ACTUAL REPAIR. This was 0 of 51 before.
  let full = 0, fullTotal = 0;
  for (const t of TERMS) {
    const L = leetAll(t); if (L === t) continue;
    fullTotal++;
    const r = filterChat('you are a ' + L + ' mate');
    if (r.flagged && !r.clean.includes(L)) full++;
  }
  ok('and so is every fully leet spelling', full === fullTotal, full + ' of ' + fullTotal);

  // One digit was enough to defeat the whole filter.
  let one = 0, oneTotal = 0;
  for (const t of TERMS) {
    const i = t.search(/[aeios]/); if (i < 0) continue;
    oneTotal++;
    const L = t.slice(0, i) + LEET[t[i]] + t.slice(i + 1);
    const r = filterChat('you are a ' + L + ' mate');
    if (r.flagged && !r.clean.includes(L)) one++;
  }
  ok('one substituted character is not enough to get through', one === oneTotal,
     one + ' of ' + oneTotal);

  // Case is not a defence either, and mixed case plus leet is the realistic
  // shape rather than either on its own.
  let mixed = 0, mixedTotal = 0;
  for (const t of TERMS) {
    const L = leetAll(t); if (L === t) continue;
    const M = L.split('').map((c, i) => i % 2 ? c.toUpperCase() : c).join('');
    mixedTotal++;
    const r = filterChat('you are a ' + M + ' mate');
    if (r.flagged && !r.clean.includes(M)) mixed++;
  }
  ok('nor is mixed case over the top of it', mixed === mixedTotal, mixed + ' of ' + mixedTotal);

  // The pattern builder already allowed separators between characters. That
  // path went through the working replace and did censor, so this is a
  // regression guard rather than a repair.
  let sep = 0, sepTotal = 0;
  for (const t of TERMS) {
    if (t.includes(' ')) continue;
    const S = t.split('').join('.');
    sepTotal++;
    const r = filterChat('you are a ' + S + ' mate');
    if (r.flagged && !r.clean.includes(S)) sep++;
  }
  ok('separators between the letters do not get through', sep === sepTotal,
     sep + ' of ' + sepTotal);
}

// ── What must NOT change ────────────────────────────────────────────────────
section('Everything else survives untouched');
{
  const keep = [
    'Hello there, How ARE you?',
    'I made 4500 credits at 13:37',
    '1337 h4x0r r3porting in',
    'firecracker jacket',                 // contains a term as a substring
    'The Quick Brown Fox',
    'Ƒ50,000,000 wired to the fund',
    'a$$ap 4ever @home +1 |o|',
  ];
  let bad = null;
  for (const s of keep) {
    const r = filterChat(s);
    if (r.clean !== s || r.flagged) { bad = s; break; }
  }
  ok('clean text comes back byte identical and unflagged', !bad, bad || 'all clean');

  // Casing OUTSIDE a match has to survive, or every filtered message is
  // silently lowercased and the filter becomes visible on messages it did not
  // need to touch.
  const t0 = TERMS[0];
  const m = filterChat('HEY You Are A ' + t0.toUpperCase() + ' Mate');
  ok('and casing around a censored match is preserved',
     m.clean.startsWith('HEY You Are A ') && m.clean.endsWith(' Mate'), m.clean);

  ok('a non string returns unchanged', filterChat(null).clean === null && !filterChat(null).flagged);
  ok('an empty string returns unchanged', filterChat('').clean === '');
  // A code point outside the BMP is two UTF-16 units. If the normaliser ever
  // changes its length, indices slide and the wrong characters get cut.
  const emoji = 'nice \u{1F600} run and a \u{1F680} launch';
  ok('an astral code point does not slide the indices', filterChat(emoji).clean === emoji);
  // Some characters lowercase into TWO units, which is the case the length
  // invariant exists for.
  const turk = '\u0130stanbul run';
  ok('and neither does a character that lowercases into two', filterChat(turk).clean === turk);
}

section('Overlapping terms are censored once');
{
  // TWO TERMS IN THE LIST END WITH ANOTHER TERM, so a message containing the
  // longer one produces two matches over the same span: the whole phrase, and
  // the trailing word on its own with a space in front of it satisfying the
  // lookbehind. Without merging, the second replacement lands after the first
  // has already consumed the text and the output comes back with a doubled run
  // of asterisks and the sentence rearranged around it.
  const set = new Set(TERMS);
  const nested = TERMS.filter(t => t.includes(' ') && set.has(t.split(' ').pop()));
  ok('the list still contains a term that ends with another term', nested.length > 0,
     nested.length + ' found');
  let bad = null;
  for (const t of nested) {
    const r = filterChat('you are a ' + t + ' mate');
    if (!r.flagged) { bad = 'not flagged'; break; }
    // One censored run, and the words either side intact.
    if (r.clean !== 'you are a **** mate') { bad = r.clean; break; }
  }
  ok('and it is replaced by exactly one run of asterisks', !bad, bad || 'merged');
}

section('The filter is not stateful between calls');
{
  // PATTERNS is a module level array of /g regexes and exec advances lastIndex.
  // Leaving it dirty makes the SECOND message with the same slur come back
  // clean, which is a filter that works once.
  const probe = 'you are a ' + TERMS[0] + ' mate';
  const first = filterChat(probe), second = filterChat(probe), third = filterChat(probe);
  ok('the same message filters identically every time',
     first.clean === second.clean && second.clean === third.clean && first.flagged && third.flagged,
     [first.clean, third.clean].join(' | '));
  // Interleaving a clean message must not clear or set anything either.
  filterChat('a perfectly ordinary sentence');
  ok('and an unrelated message in between changes nothing',
     filterChat(probe).clean === first.clean);
}

section('containsSlur agrees with the filter');
{
  let bad = null;
  for (const t of TERMS.slice(0, 12)) {
    const L = leetAll(t);
    if (!containsSlur('a ' + L + ' b')) { bad = 'missed leet'; break; }
    if (!containsSlur('a ' + t + ' b')) { bad = 'missed canonical'; break; }
  }
  ok('it reports both spellings', !bad, bad || 'agrees');
  ok('and does not fire on clean text', !containsSlur('a perfectly ordinary sentence'));
}

section('normalizeLeet still does what the name says');
{
  // Still exported and still used by server.js isTextClean, so it is part of
  // the contract even though filterChat no longer calls it.
  ok('it is still exported', typeof normalizeLeet === 'function');
  ok('and still maps digits back to letters', normalizeLeet('n1ce') === 'nice');
}

section('The shipped prose is not caught by any of this');
{
  // The repair widened what gets CENSORED, not what gets DETECTED, so it can
  // only over censor where the old filter already over flagged. Swept anyway,
  // because a false positive here shows up as an item name full of asterisks
  // in front of everyone.
  const files = ['client/assets/galaxy.js', 'client/assets/core.js', 'server/server.js',
                 'client/assets/codec-data.js', 'server/reach.js', 'client/index.html'];
  let n = 0; const hits = [];
  for (const f of files) {
    let text; try { text = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8'); }
    catch (e) { continue; }
    for (const m of text.matchAll(/'([^'\\\n]{12,160})'|"([^"\\\n]{12,160})"/g)) {
      const s = m[1] || m[2];
      if (!/[a-z]/.test(s) || !/ /.test(s)) continue;
      n++;
      if (filterChat(s).flagged) hits.push(f + ' :: ' + s.slice(0, 60));
    }
  }
  ok('the sweep found something to sweep', n > 2000, n + ' strings');
  ok('and censors none of the game\'s own text', hits.length === 0,
     hits.slice(0, 3).join(' | '));
}

section('The four callers that publish .clean');
{
  // NAMES AND FLESHBOOK have isTextClean behind them and reject outright. These
  // four do not: they take .clean and publish it, which is why the leet hole
  // was a live content hole rather than a logging inaccuracy. Asserted so that
  // a future caller added without a backstop is visible here.
  const srv = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
  const publishers = (srv.match(/filterChat\(/g) || []).length;
  ok('server.js still consumes the filter', publishers >= 4, publishers + ' call sites');
  ok('bio takes the cleaned text', /const f = filterChat\(bio\); bio = f\.clean;/.test(srv));
  ok('chat takes the cleaned text', /const \{ clean: text, flagged \} = filterChat\(rawText\);/.test(srv));
  ok('whispers take the cleaned text', /const \{clean:wText\}=filterChat\(rawText\);/.test(srv));
  ok('the council floor takes the cleaned text',
     /const \{ clean, flagged \} = filterChat\(body\);/.test(srv));
  // Fleshbook adds a rejection layer on top and must keep it.
  ok('and Fleshbook still rejects rather than only censoring',
     /if \(!isTextClean\(body\)\) return \{ ok: false, error: 'inappropriate' \};/.test(srv));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
