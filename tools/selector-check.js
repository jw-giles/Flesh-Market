// selector-check
//
// Sweeps every literal [data-tab=...] and [data-gstab=...] selector in the
// client modules against client/index.html.
//
// This exists because of a bug that was invisible for two releases: cityOpen()
// looked for [data-tab="cities"], which has never been in the markup. The
// cities view is a galaxy SUB tab, [data-gstab="cities"]. querySelector simply
// returned null, so the pane was never shown and the OPEN CITY shortcut on a
// colony card did nothing at all. Nothing threw, nothing logged, and the
// city_data_request still went out, so the console looked healthy.
//
// Only attribute selectors are checked. Element ids are deliberately out of
// scope: modules routinely inject markup for each other and a naive id sweep is
// almost all false positives.
//
// Usage: node tools/selector-check.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');
const dir = path.join(ROOT, 'client/assets');

const known = new Set();
for (const m of html.matchAll(/data-(tab|gstab)="([^"]+)"/g)) known.add(m[1] + ':' + m[2]);

const dead = [];
let checked = 0;
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!e.name.endsWith('.js')) continue;
    // Strip comments first, or the very comment explaining this bug trips it.
    // Only whole-line // comments are removed, so an https:// inside a string
    // survives; that is enough for this codebase.
    const src = fs.readFileSync(p, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    for (const m of src.matchAll(/\[data-(tab|gstab)=["']?([A-Za-z0-9_-]+)["']?\]/g)) {
      checked++;
      const key = m[1] + ':' + m[2];
      if (!known.has(key)) dead.push(path.relative(ROOT, p) + '   [data-' + m[1] + '="' + m[2] + '"]');
    }
  }
};
walk(dir);
walk(path.join(ROOT, 'client'));

console.log('selector-check');
console.log('  tab selectors in markup : ' + known.size);
console.log('  selectors checked       : ' + checked);
console.log('');
if (dead.length) {
  console.log('FAIL  selectors that match nothing: ' + dead.length);
  [...new Set(dead)].forEach(d => console.log('        ' + d));
  process.exit(1);
}
console.log('PASS  every tab selector resolves');
