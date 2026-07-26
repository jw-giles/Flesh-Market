// lore-check
//
// The lore book is the one place in the game where a human types prose that
// lands in the DOM of every other client. Three things therefore have to hold
// and none of them is obvious from reading any single file:
//
//   1. Every write route is dev-gated. Read is open, write is not.
//   2. Everything rendered from a page is escaped. A dev account is still an
//      account, and a stored <img onerror> is only harmless while the render
//      path keeps escaping it.
//   3. The book renders in Chinese. Anti kvak is a Latin and Cyrillic pixel
//      serif with NO Han coverage, so without a fallback in the font stack the
//      entire book is tofu boxes the moment anyone reads it in zh.
//
// No dependencies. Run from the repo root:  node tools/lore-check.mjs
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const srv  = fs.readFileSync(ROOT + '/server/server.js', 'utf8');
const dbc  = fs.readFileSync(ROOT + '/server/db_city.js', 'utf8');
const js   = fs.readFileSync(ROOT + '/client/assets/lore-book.js', 'utf8');
const css  = fs.readFileSync(ROOT + '/client/assets/lore-book.css', 'utf8');
const core = fs.readFileSync(ROOT + '/client/assets/core.js', 'utf8');
const html = fs.readFileSync(ROOT + '/client/index.html', 'utf8');

console.log('== Reading is open, writing is not ==');
{
  // Slice each route so a gate on one cannot be counted for another.
  const routeOf = (m, p) => {
    const i = srv.indexOf(`app.${m}('${p}'`);
    return i < 0 ? null : srv.slice(i, i + 1800);
  };
  const writes = [['post', '/api/lore'], ['put', '/api/lore/:id'], ['delete', '/api/lore/:id']];
  for (const [m, p] of writes) {
    const body = routeOf(m, p);
    ok(m.toUpperCase() + ' ' + p + ' exists', !!body);
    if (!body) continue;
    ok('  and refuses an unauthenticated caller', /return res\.status\(401\)/.test(body));
    ok('  and refuses a non-dev', /isDevAccount\(actor\.id\)\)[\s\S]{0,60}status\(403\)/.test(body));
  }
  // The 1800-char window from the GET route runs into the POST route below it,
  // so its 403 was being read as the GET's. Cut at the next route instead.
  const gi = srv.indexOf("app.get('/api/lore'");
  const get = gi < 0 ? null : srv.slice(gi, srv.indexOf("app.post('/api/lore'", gi));
  ok('GET /api/lore exists and is readable without dev', !!get && !/status\(403\)/.test(get));
  // Drafts are the point of the published flag: an unfinished page must not be
  // legible to the world while it is being written.
  ok('unpublished pages are withheld from non-devs',
     /listLorePages\(dev\)/.test(get || '') && /published=1/.test(dbc));

  ok('the column allowlist blocks an arbitrary field',
     /const LORE_COLS = new Set\(\['title', 'body', 'sort', 'published'\]\)/.test(dbc));
  ok('titles are sanitised at module scope, not with the ws-only helper',
     /function loreLabel\(/.test(srv) && !/cleanLabel\(req\.body/.test(srv));
  ok('bodies go through the shared text filter', /isTextClean\(rawBody\)/.test(srv));
  ok('and both are length-capped',
     /LORE_TITLE_MAX = 90/.test(srv) && /LORE_BODY_MAX  = 12000/.test(srv));
}

console.log('\n== Nothing a dev types can execute in anyone else\'s browser ==');
{
  ok('the client has an escaper', /function esc\(/.test(js));
  // Every place page content reaches innerHTML has to run through it.
  const fields = ['p.title', 'p.body', 'p.author', 'e.title', 'e.body'];
  const unescaped = fields.filter(f => {
    const re = new RegExp('\\\\+\\\\s*' + f.replace('.', '\\\\.') + '\\\\s*\\\\+');
    return re.test(js) && !new RegExp('esc\\\\(\\\\s*' + f.replace('.', '\\\\.')).test(js);
  });
  ok('page fields are escaped wherever they are interpolated', unescaped.length === 0, unescaped.join(','));
  ok('the body is rendered as paragraphs, not as markup',
     /esc\(p\.body \|\| ''\)/.test(js) && /replace\(\/\\n\/g, '<br>'\)/.test(js));
  ok('no innerHTML is fed a raw page field',
     !/innerHTML\s*=\s*[^;]*\bp\.(title|body)\b(?![^;]*esc)/.test(js));
}

console.log('\n== The book can be read in Chinese ==');
{
  const stack = /--lore-font:\s*([^;]+);/.exec(css);
  ok('there is a font stack', !!stack, stack ? stack[1] : 'missing');
  if (stack) {
    const s = stack[1];
    ok('it leads with the supplied pixel serif', /Antikvak/.test(s));
    // The real trap. Anti kvak covers Latin and Cyrillic and has no Han block,
    // so a stack of just that font renders every Chinese page as tofu.
    ok('and falls through to a Han face', /SC|Song|Hei|Ming|CJK/.test(s), s);
    ok('with a generic at the end', /serif\s*$/.test(s.trim()), s);
  }
  ok('the face is actually shipped', fs.existsSync(ROOT + '/client/assets/fonts/Anti_kvak.ttf'));
  ok('and declared with @font-face', /@font-face[\s\S]{0,200}Anti_kvak\.ttf/.test(css));
  ok('the book itself uses the stack, not just the heading',
     (css.match(/var\(--lore-font\)/g) || []).length >= 6);
}

console.log('\n== It is mounted where it was asked for ==');
{
  ok('the button attaches to the End of Day wrapper', /getElementById\('eod-timer-wrap'\)/.test(js));
  ok('and retries until that wrapper exists', /setTimeout\(boot, 400\)/.test(js));
  ok('the stylesheet is linked', /assets\/lore-book\.css/.test(html));
  ok('the module is loaded', /assets\/lore-book\.js/.test(html));
  ok('the label reads LORE EVENTS', /'lore\.btn':\{en:'LORE EVENTS'/.test(core));

  for (const f of ['ui/book/Book_Sheet.png', 'ui/book/book_icon.png']) {
    ok('asset present: ' + f, fs.existsSync(path.join(ROOT, 'client/assets', f)));
  }
  ok('the open animation steps the sheet rather than loading 15 images',
     /backgroundPosition/.test(js) && /FRAMES = 15/.test(js));

  // Every key the module can ask for must exist in both languages, or a
  // Chinese reader gets English fallbacks scattered through the book.
  const keys = [...new Set([...js.matchAll(/\bT\('([a-z.]+)'/g)].map(m => m[1])
    .concat([...js.matchAll(/\bTF\('([a-z.]+)'/g)].map(m => m[1])))];
  const missing = keys.filter(k => core.indexOf("'" + k + "'") < 0);
  ok('every string the book uses has a key', missing.length === 0, missing.join(','));
  const noZh = keys.filter(k => {
    const m = new RegExp("'" + k.replace('.', '\\.') + "':\\{en:'(?:[^'\\\\]|\\\\.)*',zh:'((?:[^'\\\\]|\\\\.)*)'\\}").exec(core);
    return !m || !/[\u4e00-\u9fff]/.test(m[1]);
  });
  ok('and a Chinese translation', noZh.length === 0, noZh.join(','));
  console.log('  strings in the book: ' + keys.length);

  ok('the token comes from the global the rest of the client uses',
     /window\.__fmToken/.test(js));
  ok('and a live write refreshes an open book',
     /fm_ws_msg/.test(js) && /'lore_update'/.test(js) && /'lore_update'/.test(srv));
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
