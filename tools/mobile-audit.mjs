// mobile-audit
//
// Finds the CLASS of bug that broke Galaxy > Cities, everywhere else it exists.
//
// That bug was not a typo. It was three individually correct rules that stop
// being correct together: a container declares itself exactly viewport tall
// (`overflow:hidden` + `flex:1` or `height:100%` or `height:calc(...)`) because
// on desktop its children each scroll themselves in their own column; then a
// responsive rule collapses those columns into a stack; the height cap and the
// clip do not collapse with them; and because the overflow is `hidden` rather
// than `auto` there is no scrollbar to tell anyone content is missing.
//
// A surface in that state is INVISIBLY broken. It renders, it populates, it
// just silently truncates. Eyeballing does not find it reliably, which is why
// this is a tool and not a checklist.
//
// This audit is STATIC. It reads inline styles from index.html, every client
// CSS file, and the CSS strings that modules inject at runtime. It cannot
// measure a rendered box, so it reports SUSPECTS, not failures, and it exits 0.
// Its job is to make sure no surface is unexamined, not to decide.
//
//   node tools/mobile-audit.mjs            report
//   node tools/mobile-audit.mjs --unowned  only surfaces with no mobile override
//
// Run from the repo root.

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const CLIENT = path.join(ROOT, 'client');
const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8');
const mobCss = fs.readFileSync(path.join(CLIENT, 'assets/mobile.css'), 'utf8');
const mobJs = fs.readFileSync(path.join(CLIENT, 'assets/mobile.js'), 'utf8');

const onlyUnowned = process.argv.includes('--unowned');

// A selector that appears in no markup and in no JS string is dead CSS. The
// first run of this tool reported #pnl-root .row as a live overflow hazard; it
// exists only in pnl-simple.css and nothing has ever rendered it. Filtering
// these out is not cosmetic: a report full of ghosts trains you to skim it.
const allSource = (() => {
  let t = html;
  for (const f of fs.readdirSync(path.join(CLIENT, 'assets'))) {
    const p = path.join(CLIENT, 'assets', f);
    if (fs.statSync(p).isFile() && /\.(js|html)$/.test(f)) t += fs.readFileSync(p, 'utf8');
  }
  return t;
})();
const isLive = (sel) => {
  const name = String(sel).replace(/^[.#]/, '').split(/[\s.:>[]/)[0];
  if (!name || name.length < 3) return true;
  return allSource.includes('"' + name) || allSource.includes("'" + name) ||
         allSource.includes(name + '"') || allSource.includes(name + ' ') ||
         allSource.includes('id="' + name) || allSource.includes(name + "'");
};

// Every stylesheet and every JS file that injects CSS as strings.
const cssSources = [];
for (const f of fs.readdirSync(path.join(CLIENT, 'assets'))) {
  const p = path.join(CLIENT, 'assets', f);
  if (!fs.statSync(p).isFile()) continue;
  if (f.endsWith('.css')) cssSources.push([f, fs.readFileSync(p, 'utf8')]);
  else if (f.endsWith('.js')) {
    const t = fs.readFileSync(p, 'utf8');
    // Only JS that actually ships CSS text.
    if (/\{[^}]*(grid-template-columns|overflow-y?\s*:|min-width\s*:)[^}]*\}/.test(t)) {
      cssSources.push([f, t]);
    }
  }
}
cssSources.push(['index.html <style>', (html.match(/<style[\s\S]*?<\/style>/g) || []).join('\n')]);

// ═══════════════════════════════════════════════════════════════════════════
// 1. SURFACES: every tab body and every named pane, with its inline style.
// ═══════════════════════════════════════════════════════════════════════════

const surfaces = [];
for (const m of html.matchAll(/id="([A-Za-z][\w-]*(?:Tab|Pane|Panel|Box|Section))"\s*(?:class="[^"]*")?\s*style="([^"]*)"/g)) {
  surfaces.push({ id: m[1], style: m[2].replace(/\s+/g, ' ').trim() });
}
for (const m of html.matchAll(/id="([A-Za-z][\w-]*(?:Tab|Pane|Panel|Box|Section))"(?![^>]*style=)/g)) {
  if (!surfaces.find(s => s.id === m[1])) surfaces.push({ id: m[1], style: '' });
}

// Which tab bodies core.js shows as flex rather than block. A flex fill
// container inside the shell's block-flow .grid loses the parent that gave
// `flex:1` meaning, which is where this class of bug lands.
const coreJs = fs.readFileSync(path.join(CLIENT, 'assets/core.js'), 'utf8');
const flexTabs = new Set(
  [...coreJs.matchAll(/el\('#(\w+)'\)\.style\.display\s*=\s*sel===[^?]*\?\s*'flex'/g)].map(m => m[1])
    .concat([...coreJs.matchAll(/_(\w+)\.style\.display\s*=\s*sel===[^?]*\?\s*'flex'/g)].map(m => m[1]))
);
for (const m of coreJs.matchAll(/const _(\w+)\s*=\s*el\('#(\w+)'\)[\s\S]{0,80}?\?\s*'flex'/g)) flexTabs.add(m[2]);

const hasMobileOverride = (id) =>
  new RegExp('body\\.fm-mobile[^{]*#' + id + '\\b').test(mobCss) ||
  new RegExp('#' + id + '\\b[^{]*\\{[^}]*\\}', 'm').test(mobCss.split('body.fm-mobile').slice(1).join(''));

// ═══════════════════════════════════════════════════════════════════════════
// 2. HAZARDS
// ═══════════════════════════════════════════════════════════════════════════

const H = { CLIP: [], WIDE: [], MINW: [], NEST: [], CANVAS: [], FIXED: [], BASIS: [] };

// H1 CLIP. The Cities class. Clips its own children AND caps its own height.
for (const s of surfaces) {
  const clips = /overflow\s*:\s*hidden/.test(s.style);
  const caps = /flex\s*:\s*1/.test(s.style) || /height\s*:\s*(100%|calc)/.test(s.style);
  if (clips && caps) {
    H.CLIP.push({
      id: s.id,
      why: 'inline overflow:hidden + ' + (/flex\s*:\s*1/.test(s.style) ? 'flex:1' : 'fixed height'),
      flexShown: flexTabs.has(s.id),
      owned: hasMobileOverride(s.id)
    });
  }
}

// Same shape declared in CSS rather than inline.
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/([.#][\w-]+(?:\.[\w-]+)?)\s*\{([^}]{0,400})\}/g)) {
    const sel = m[1], body = m[2];
    if (!/overflow\s*:\s*hidden/.test(body)) continue;
    if (!/height\s*:\s*(100%|calc)/.test(body) && !/flex\s*:\s*1/.test(body)) continue;
    if (/^\.fm-/.test(sel)) continue;
    H.CLIP.push({ id: sel, why: 'CSS overflow:hidden + height cap', file, owned: mobCss.includes(sel) });
  }
}

// H2 WIDE. grid-template-columns whose fixed px track total exceeds a phone.
// 320 is the real floor (iPhone SE, older Android), not 360 or 390. Set at 340
// on the first pass, which is why #fm-auth-card{min-width:340px} slipped past:
// it is not GREATER than 340. The login card is the front door, so the
// threshold has to be the smallest screen that exists, not a typical one.
const PHONE = 320;
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/([.#@][^{;]{0,80}?)\{[^}]*grid-template-columns\s*:\s*([^;}]+)/g)) {
    const sel = m[1].trim(), tracks = m[2];
    const px = [...tracks.matchAll(/(\d+)px/g)].map(x => +x[1]);
    const total = px.reduce((a, b) => a + b, 0);
    if (total > PHONE) {
      H.WIDE.push({ sel, tracks: tracks.trim().slice(0, 60), total, file, owned: mobCss.includes(sel.replace(/^[.#]/, '')) });
    }
  }
}
for (const m of html.matchAll(/grid-template-columns\s*:\s*([^;"]+)/g)) {
  const px = [...m[1].matchAll(/(\d+)px/g)].map(x => +x[1]);
  const total = px.reduce((a, b) => a + b, 0);
  if (total > PHONE) H.WIDE.push({ sel: '(inline)', tracks: m[1].trim().slice(0, 60), total, file: 'index.html', owned: false });
}

// H3 MINW. A min-width above a phone viewport cannot shrink and forces
// horizontal overflow unless an ancestor scrolls sideways.
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/([.#][\w-]+)\s*\{[^}]*(?:^|[;{ ])min-width\s*:\s*(\d+)px/g)) {
    if (+m[2] > PHONE) H.MINW.push({ sel: m[1], px: +m[2], file, owned: mobCss.includes(m[1]) });
  }
}

// H4 NEST. minmax(NNNpx, ...) inside auto-fit is the quiet version of H3:
// it looks responsive and still cannot go below its floor.
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/minmax\(\s*(\d+)px/g)) {
    if (+m[1] > 300) H.NEST.push({ floor: +m[1], file });
  }
}

// H7 BASIS. A fixed flex-basis or hard width on a sidebar. This is the one the
// first version of this tool MISSED: it checked min-width and grid tracks, but
// `width:270px; flex:0 0 270px` is neither, and it is exactly how #loreLeft
// eats 270 of the 323px a phone gives the lore book.
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/([.#][\w-]+)\s*\{([^}]{0,300})\}/g)) {
    const sel = m[1], body = m[2];
    if (/^\.fm-|^#fm[A-Z]/.test(sel)) continue;
    const basis = body.match(/(?:^|[;{])\s*flex\s*:\s*0\s+0\s+(\d+)px/);
    // NOT /width:\d+px/ on its own: that also matches `max-width:520px`, which is
    // correct responsive behaviour. The first run of this rule reported five
    // casino games as hard pinned when only one was. A hazard report that cries
    // wolf is worse than no report, because it gets skimmed.
    const width = body.match(/(?:^|[;{])\s*width\s*:\s*(\d+)px/);
    const px = Math.max(basis ? +basis[1] : 0, width ? +width[1] : 0);
    if (px > 260 && !/max-width\s*:\s*(min\(|\d+vw|100%)/.test(body)) {
      H.BASIS.push({ sel, px, file, owned: mobCss.includes(sel) });
    }
  }
}

// H5 CANVAS. height:100% inside a parent whose height stops being definite
// once the layout stacks. This is what squashed the city district map.
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/canvas\s*\{([^}]*)\}/g)) {
    if (/height\s*:\s*100%/.test(m[1])) H.CANVAS.push({ file, rule: m[1].replace(/\s+/g, ' ').trim().slice(0, 70) });
  }
}

// H6 FIXED. position:fixed sits outside the shell's scroll region, so anything
// pinned to a viewport edge can land under the top bar or the nav.
for (const m of html.matchAll(/id="([\w-]+)"[^>]*style="([^"]*position\s*:\s*fixed[^"]*)"/g)) {
  H.FIXED.push({ id: m[1], owned: hasMobileOverride(m[1]) });
}
for (const [file, css] of cssSources) {
  for (const m of css.matchAll(/#([\w-]+)\s*\{[^}]*position\s*:\s*fixed/g)) {
    if (!H.FIXED.find(f => f.id === m[1])) H.FIXED.push({ id: m[1], file, owned: hasMobileOverride(m[1]) });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. REACHABILITY. A panel that lays out perfectly and cannot be opened is
//    still broken. Every .tab in the markup must be reachable from the shell.
// ═══════════════════════════════════════════════════════════════════════════

const allTabs = [...new Set([...html.matchAll(/class="tab[^"]*"\s*data-tab="(\w+)"/g)].map(m => m[1]))];
const navTabs = ['market', 'heat', 'pnl'];
const moreTabs = [...mobJs.matchAll(/\['(\w+)',\s*'\\u[^']*',\s*'[^']*',\s*'tab'/g)].map(m => m[1]);
const reachable = new Set([...navTabs, ...moreTabs]);
const unreachable = allTabs.filter(t => !reachable.has(t));

// ═══════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════

const show = (rows) => (onlyUnowned ? rows.filter(r => !r.owned) : rows)
  .filter(r => r.sel === undefined || isLive(r.sel));
const line = (s) => console.log('  ' + s);

console.log('\nmobile-audit');
console.log('  surfaces found       : ' + surfaces.length);
console.log('  css sources scanned  : ' + cssSources.length);
console.log('  phone width assumed  : ' + PHONE + 'px');

console.log('\n[H1] CLIP  container clips its children AND caps its own height');
console.log('     This is the Galaxy > Cities failure. Renders, populates, silently truncates.');
const clip = show(H.CLIP);
if (!clip.length) line('none');
for (const c of clip) {
  line((c.owned ? 'ok   ' : 'OPEN ') + c.id.padEnd(20) + c.why +
    (c.flexShown ? '  [core.js shows this as flex]' : '') + (c.file ? '  ' + c.file : ''));
}

console.log('\n[H2] WIDE  fixed px grid tracks wider than a phone');
const wide = show(H.WIDE);
if (!wide.length) line('none');
for (const c of wide.slice(0, 25)) {
  line((c.owned ? 'ok   ' : 'OPEN ') + String(c.total + 'px').padEnd(8) + c.sel.slice(0, 28).padEnd(30) + c.tracks + '  [' + c.file + ']');
}
if (wide.length > 25) line('... and ' + (wide.length - 25) + ' more');

console.log('\n[H3] MINW  min-width above the viewport, cannot shrink');
const minw = show(H.MINW);
if (!minw.length) line('none');
for (const c of minw.slice(0, 20)) line((c.owned ? 'ok   ' : 'OPEN ') + String(c.px + 'px').padEnd(8) + c.sel.padEnd(24) + '[' + c.file + ']');
if (minw.length > 20) line('... and ' + (minw.length - 20) + ' more');

console.log('\n[H4] NEST  auto-fit minmax floor above 300px');
if (!H.NEST.length) line('none');
for (const c of H.NEST.slice(0, 15)) line(String(c.floor + 'px').padEnd(8) + '[' + c.file + ']');

console.log('\n[H7] BASIS  fixed flex-basis or hard width on a sidebar');
const basis = show(H.BASIS);
if (!basis.length) line('none');
for (const c of basis.slice(0, 20)) line((c.owned ? 'ok   ' : 'OPEN ') + String(c.px + 'px').padEnd(8) + c.sel.padEnd(24) + '[' + c.file + ']');
if (basis.length > 20) line('... and ' + (basis.length - 20) + ' more');

console.log('\n[H5] CANVAS  canvas height:100%, squashes when the parent height stops being definite');
if (!H.CANVAS.length) line('none');
for (const c of H.CANVAS) line(c.file.padEnd(22) + c.rule);

console.log('\n[H6] FIXED  position:fixed, sits outside the scroll region');
const fixed = show(H.FIXED);
if (!fixed.length) line('none');
for (const c of fixed) line((c.owned ? 'ok   ' : 'OPEN ') + c.id + (c.file ? '  [' + c.file + ']' : ''));

console.log('\n[R] REACHABILITY  every .tab must be openable from the shell');
line('tabs in markup : ' + allTabs.length + '  (' + allTabs.join(', ') + ')');
line('reachable      : ' + (allTabs.length - unreachable.length));
line(unreachable.length ? 'UNREACHABLE    : ' + unreachable.join(', ') : 'UNREACHABLE    : none');

console.log('\nSTATIC ONLY. No layout engine here, so these are suspects, not verdicts.');
console.log('"ok" means a body.fm-mobile rule already names it, not that it renders correctly.\n');
