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
  // Every read of a page field must be wrapped, so check the character before
  // each occurrence rather than looking for esc() somewhere nearby. The first
  // version of this looked for esc AFTER the field and passed by luck, which is
  // worse than no check: it reported clean on an expression it had not
  // understood.
  const leaks = [];
  const fieldRe = /\b(p|e)\.(title|body|author)\b/g;
  let mm;
  while ((mm = fieldRe.exec(js))) {
    const before = js.slice(Math.max(0, mm.index - 5), mm.index);
    const after = js.slice(mm.index + mm[0].length, mm.index + mm[0].length + 8);
    // Wrapped directly, or assigned into the editing object / compared, which
    // never reaches innerHTML.
    const wrapped = /esc\($/.test(before);
    const assigned = /^\s*[,}]/.test(after) && /:\s*$/.test(js.slice(Math.max(0, mm.index - 30), mm.index).split('\n').pop());
    if (!wrapped && !assigned) leaks.push(mm[0] + ' @' + mm.index);
  }
  ok('every page field reaching the DOM is escaped at the point of use',
     leaks.length === 0, leaks.join(', '));
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

// ── Behaviour ────────────────────────────────────────────────────────────────
// Everything above is regex over source. That is enough to prove a gate exists
// and not enough to prove a button works: 38 static assertions passed on a
// build where NEW PAGE did nothing at all on an empty book, because render()
// tested pages.length before it tested `editing` and painted the empty-book
// message over the editor. An empty book is the state every fresh install is
// in, so the one path that was broken was the only path a new install takes.
// This block drives the real module in a real DOM.
console.log('\n== The book actually works when you click it ==');
{
  let JSDOM = null;
  try { ({ JSDOM } = await import('jsdom')); } catch (_) {}
  if (!JSDOM) {
    console.log('  SKIP  jsdom not installed, behaviour checks not run');
  } else {
    const boot = (pagesFixture, dev) => {
      const dom = new JSDOM(
        '<!doctype html><body><div id="eod-timer-wrap"></div></body>',
        { runScripts: 'outside-only', pretendToBeVisual: true });
      const w = dom.window;
      w.__fmToken = 'devtoken';
      w.t = (k, fb) => fb;
      w.tf = (k, fb, v) => String(fb).replace(/\{(\w+)\}/g, (m, key) => (v && v[key] != null) ? v[key] : m);
      const calls = [];
      w.fetch = (url, opt) => {
        calls.push({ url: String(url), method: (opt && opt.method) || 'GET', body: opt && opt.body });
        if (String(url).indexOf('api/lore') === 0 && (!opt || opt.method === undefined))
          return Promise.resolve({ json: () => Promise.resolve({ ok: true, dev, pages: pagesFixture }) });
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, id: 99 }) });
      };
      w.eval(js);
      return { w, calls };
    };
    const settle = () => new Promise(r => setTimeout(r, 40));
    // The module waits for DOMContentLoaded, which jsdom fires a beat after the
    // document is constructed, so the button is not there on the very next
    // tick. Poll rather than guessing a delay.
    const waitFor = async (w, id, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 1500)) {
        if (w.document.getElementById(id)) return true;
        await new Promise(r => setTimeout(r, 25));
      }
      return false;
    };

    // Empty book, dev account: the exact shape that shipped broken.
    {
      const { w } = boot([], true);
      ok('the button mounts next to the End of Day clock', await waitFor(w, 'loreBtn'));
      w.document.getElementById('loreBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await settle();
      const newBtn = w.document.getElementById('loreNew');
      ok('a dev sees NEW PAGE on an empty book', !!newBtn);
      if (newBtn) {
        newBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        await settle();
        ok('clicking it opens the editor', !!w.document.getElementById('loreT'),
           (w.document.getElementById('loreRight') || {}).textContent || '');
        ok('and the empty-book message is gone',
           !/Nothing has been written down/.test(
             (w.document.getElementById('loreRight') || {}).innerHTML || ''));
      }
    }

    // Same, with pages already present: the path that always worked.
    {
      const { w, calls } = boot([{ id: 1, title: 'First', body: 'A thing happened.', author: 'MrFlesh',
                                  created: Date.now(), updated: Date.now(), sort: 0, published: true }], true);
      await waitFor(w, 'loreBtn');
      w.document.getElementById('loreBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await settle();
      ok('an existing page renders', /A thing happened/.test(
        (w.document.getElementById('loreRight') || {}).textContent || ''));
      w.document.getElementById('loreNew').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await settle();
      ok('NEW PAGE opens the editor here too', !!w.document.getElementById('loreT'));
      w.document.getElementById('loreT').value = 'The Sealing';
      w.document.getElementById('loreB').value = 'Body text.';
      w.document.getElementById('loreSave').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await settle();
      const post = calls.filter(c => c.method === 'POST');
      ok('saving posts to the server', post.length === 1, JSON.stringify(post.map(c => c.url)));
      ok('and carries the token', post.length === 1 && /devtoken/.test(post[0].body || ''));
      ok('with the typed title', post.length === 1 && /The Sealing/.test(post[0].body || ''));
    }

    // A player must not be handed the controls even if they open the book.
    {
      const { w } = boot([], false);
      await waitFor(w, 'loreBtn');
      w.document.getElementById('loreBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
      await settle();
      ok('a non-dev gets no editing controls',
         !w.document.getElementById('loreNew') && !w.document.getElementById('loreEdit'));
    }
  }
}

console.log('');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
