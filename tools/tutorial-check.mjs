// tutorial-check
//
// The tutorial holds its content in two arrays, SLIDES and SLIDES_ZH, matched
// BY INDEX. renderSlide falls back to English per field when a zh entry is
// missing, which is a good failure mode and a terrible warning system: a slide
// added to one array and not the other does not throw, it silently shows the
// wrong language, or worse, shifts every slide after it so headings and bodies
// belong to different topics.
//
// Nothing checked this. The tutorial has also been the last thing updated after
// every feature, twice now describing a game that had moved on.
//
// No dependencies. Run from the repo root:  node tools/tutorial-check.mjs
import fs from 'fs';

let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const src = fs.readFileSync(process.cwd() + '/client/assets/tutorial.js', 'utf8');

// Pull each array out by brace matching rather than regex, because the slide
// bodies contain braces, backticks and nested quotes.
function grab(name) {
  const start = src.indexOf('const ' + name + ' = [');
  if (start < 0) return null;
  let i = src.indexOf('[', start), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '[') depth++;
    else if (src[j] === ']') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return null;
}
const enSrc = grab('SLIDES'), zhSrc = grab('SLIDES_ZH');
ok('both slide arrays are present', !!enSrc && !!zhSrc);

// Count top-level slide objects by depth, for the same reason.
function countSlides(block) {
  let depth = 0, n = 0, inTick = false;
  for (let i = 0; i < block.length; i++) {
    const c = block[i];
    if (c === '`' && block[i - 1] !== '\\') inTick = !inTick;
    if (inTick) continue;
    if (c === '{') { if (depth === 0) n++; depth++; }
    else if (c === '}') depth--;
  }
  return n;
}
const enN = countSlides(enSrc), zhN = countSlides(zhSrc);
console.log('  EN slides: ' + enN + ', ZH slides: ' + zhN);
ok('the two arrays are the same length', enN === zhN, enN + ' vs ' + zhN);
ok('there is a tutorial to check', enN >= 15, String(enN));

// Every heading, in order, from each array.
const headings = block => [...block.matchAll(/^      heading: '([^']*)'/gm)].map(m => m[1]);
const enH = headings(enSrc), zhH = headings(zhSrc);
ok('every EN slide has a heading', enH.length === enN, enH.length + '/' + enN);
ok('every ZH slide has a heading', zhH.length === zhN, zhH.length + '/' + zhN);

const hasHan = t => /[\u4e00-\u9fff]/.test(t);
const enLatin = enH.filter(h => hasHan(h));
ok('no Chinese leaked into the English array', enLatin.length === 0, enLatin.join(','));
const zhUntranslated = zhH.filter(h => !hasHan(h));
ok('every ZH heading is actually translated', zhUntranslated.length === 0, zhUntranslated.join(','));

// Bodies too. A slide can have a translated heading and an English body.
const bodies = block => [...block.matchAll(/^      text: `([\s\S]*?)`,$/gm)].map(m => m[1]);
const zhB = bodies(zhSrc), enB = bodies(enSrc);
ok('every EN slide has a body', enB.length === enN, enB.length + '/' + enN);
ok('every ZH slide has a body', zhB.length === zhN, zhB.length + '/' + zhN);
const zhBodyEnglish = zhB.filter(t => !hasHan(t));
ok('no ZH body was left in English', zhBodyEnglish.length === 0, String(zhBodyEnglish.length));

const zhC = [...zhSrc.matchAll(/^      callout: '([^']*)'/gm)].map(m => m[1]);
ok('every ZH slide has a callout', zhC.length === zhN, zhC.length + '/' + zhN);
const zhCalloutEnglish = zhC.filter(t => !hasHan(t));
ok('no ZH callout was left in English', zhCalloutEnglish.length === 0, zhCalloutEnglish.join(' | '));

// Equal length is not alignment. A slide inserted at the wrong index in one
// array leaves both arrays the right size and every slide after it paired with
// the wrong topic, which is the failure this file exists to catch. Anchor a few
// known pairs by position.
const ANCHORS = [
  [0, 'TERMINAL ACTIVATED', '\u7ec8\u7aef\u5df2\u6fc0\u6d3b'],
  [enN - 1, 'ORIENTATION COMPLETE', '\u5165\u804c\u5b8c\u6210'],
];
const idxOf = (arr, h) => arr.indexOf(h);
const drift = [];
for (const [i, en, zh] of ANCHORS) {
  if (enH[i] !== en) drift.push('EN[' + i + '] is ' + enH[i] + ', expected ' + en);
  if (zhH[i] !== zh) drift.push('ZH[' + i + '] is ' + zhH[i] + ', expected ' + zh);
}
ok('the first and last slides line up in both arrays', drift.length === 0, drift.join(' | '));

// And the slides added for 1.2.0 sit at the same index in both.
const pairs = [['THE JADE CIRCUIT', '\u7389\u73af'], ['CITIES', '\u57ce\u5e02'],
               ['HOLDING OFFICE', '\u51fa\u4efb\u516c\u804c'],
               ['OFFICE IS CONTESTABLE', '\u516c\u804c\u53ef\u88ab\u593a\u53d6']];
const mis = pairs.filter(([en, zh]) => idxOf(enH, en) < 0 || idxOf(enH, en) !== idxOf(zhH, zh))
  .map(([en, zh]) => en + '@' + idxOf(enH, en) + ' vs ' + zh + '@' + idxOf(zhH, zh));
ok('the 1.2.0 slides sit at matching indices in both arrays', mis.length === 0, mis.join(' | '));

// Only the English array carries navigation. A tab on a zh slide would be dead
// weight at best and would desync the arrays at worst.
ok('navigation lives only on the English slides',
   !/^      (tab|galaxySub):/m.test(zhSrc));

// Every tab and sub-tab the tutorial drives has to exist in the markup, or the
// slide advances to a panel that is not there.
const html = fs.readFileSync(process.cwd() + '/client/index.html', 'utf8');
const tabs = [...new Set([...enSrc.matchAll(/tab: '([a-z]+)'/g)].map(m => m[1]))];
const subs = [...new Set([...enSrc.matchAll(/galaxySub: '([a-z]+)'/g)].map(m => m[1]))];
const badTabs = tabs.filter(t => html.indexOf('data-tab="' + t + '"') < 0);
const badSubs = subs.filter(t => html.indexOf('data-gstab="' + t + '"') < 0);
console.log('  drives tabs: ' + tabs.join(', '));
console.log('  drives galaxy sub-tabs: ' + subs.join(', '));
ok('every tab the tutorial opens exists', badTabs.length === 0, badTabs.join(','));
ok('every galaxy sub-tab the tutorial opens exists', badSubs.length === 0, badSubs.join(','));

// The whole point of updating it: the tutorial has to describe what shipped.
const must = [
  ['the Jade Circuit', /Jade Circuit/],
  ['Changzheng hulls', /Changzheng/],
  ['cities', /\bCITIES\b/],
  ['holding office', /HOLDING OFFICE/],
  ['storefronts', /storefront/i],
  ['the commerce rate', /commerce rate/i],
  ['civic works', /civic works/i],
  ['petitions', /petition/i],
  ['siege stores', /siege stores/i],
  // The Circuit slide has now been wrong in both directions: it first omitted
  // the Circuit entirely, then asserted that no cargo crosses, which is the
  // opposite of the design. Pin the facts a player has to leave with.
  ['the passage as a lane', /one lane crosses the border/i],
  ['both anchor colonies named', /Cascade Station/],
  ['the Circuit end named', /Mozi Array/],
  ['that it opens and closes', /opens and closes on the Circuit/i],
  ['that it cannot be bought', /cannot be bought into as a lane share/i],
  ['legitimacy pricing the seat', /legitimacy/i],
];
const missing = must.filter(([, re]) => !re.test(enSrc)).map(([n]) => n);
ok('the tutorial covers what 1.2.0 actually shipped', missing.length === 0, missing.join(', '));

// Em dashes are forbidden in player-facing content and this is as player-facing
// as it gets. The shell check for this was silently broken for a long time.
const em = (enSrc + zhSrc).split('\u2014').length - 1;
ok('no em dashes in tutorial content', em === 0, String(em));

// The slide must not claim the opposite of what the lane table says. This is
// the assertion that would have caught both previous versions of it.
{
  const laneSrc = fs.readFileSync(process.cwd() + '/client/assets/galaxy.js', 'utf8');
  const hasPassage = /type:'passage', passage:true/.test(laneSrc);
  ok('the lane table actually has a passage', hasPassage);
  const claimsNoCrossing = /no cargo is ever hauled between/i.test(enSrc)
    || /no lane crosses the border<\/strong>, so no cargo/i.test(enSrc);
  ok('the tutorial does not claim cargo cannot cross', !claimsNoCrossing);
  ok('and says so in Chinese too', /星门/.test(zhSrc) && /有且仅有/.test(zhSrc));
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
