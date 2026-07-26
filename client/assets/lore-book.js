// ── LORE EVENTS ──────────────────────────────────────────────────────────────
// A book kept beside the End of Day clock. Dev accounts write pages into it
// recording what has happened in the world: not a changelog, a record kept in
// character. Everyone else reads it.
//
// The book is the game's own memory of itself. Everything else in the client
// shows the present tick; this is the only place that says what any of it
// meant. That is why it reads as a physical object rather than another panel.
(function () {
  'use strict';

  var SHEET = 'assets/ui/book/Book_Sheet.png';
  var FRAMES = 15;          // 4x4 grid of 256px cells, last cell empty
  var COLS = 4, CELL = 256;
  var OPEN_MS = 40;         // per frame

  var pages = [], curr = 0, isDev = false, loaded = false, editing = null;

  function T(k, fb) { return window.t ? window.t(k, fb) : fb; }
  function TF(k, fb, v) { return window.tf ? window.tf(k, fb, v) : fb; }
  // core.js sets window.__fmToken on auth; every other module reads that one.
  function tok() { return window.__fmToken || ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── The header button ──────────────────────────────────────────────────────
  function mountButton() {
    if (document.getElementById('loreBtn')) return true;
    var wrap = document.getElementById('eod-timer-wrap');
    if (!wrap) return false;
    var b = document.createElement('div');
    b.id = 'loreBtn';
    b.setAttribute('role', 'button');
    b.setAttribute('tabindex', '0');
    b.title = T('lore.title', 'Lore Events');
    b.innerHTML =
      '<div id="loreBtnIcon"></div>' +
      '<div id="loreBtnLabel" data-i18n="lore.btn">' + esc(T('lore.btn', 'LORE EVENTS')) + '</div>';
    b.addEventListener('click', open);
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    wrap.appendChild(b);
    return true;
  }

  // ── Open / close animation ─────────────────────────────────────────────────
  // The sheet is a 4x4 grid, so the frame is stepped by background-position
  // rather than by swapping fifteen separate images.
  function playBook(el, reverse, done) {
    var i = reverse ? FRAMES - 1 : 0;
    var timer = setInterval(function () {
      var col = i % COLS, row = Math.floor(i / COLS);
      el.style.backgroundPosition = (-col * CELL) + 'px ' + (-row * CELL) + 'px';
      i += reverse ? -1 : 1;
      if (i < 0 || i >= FRAMES) { clearInterval(timer); if (done) done(); }
    }, OPEN_MS);
  }

  function ensureModal() {
    if (document.getElementById('loreModal')) return;
    var d = document.createElement('div');
    d.id = 'loreModal';
    d.innerHTML =
      '<div id="loreBackdrop"></div>' +
      '<div id="loreBook" role="dialog" aria-modal="true" aria-labelledby="loreHeading">' +
        '<div id="loreCover"></div>' +
        '<div id="loreInner">' +
          '<div id="loreSpine"></div>' +
          '<div id="loreLeft">' +
            '<div id="loreHeading">' + esc(T('lore.title', 'Lore Events')) + '</div>' +
            '<div id="loreIndex"></div>' +
            '<div id="loreDevBar"></div>' +
          '</div>' +
          '<div id="loreRight"></div>' +
        '</div>' +
        '<button id="loreClose" aria-label="Close">\u00d7</button>' +
      '</div>';
    document.body.appendChild(d);
    document.getElementById('loreBackdrop').addEventListener('click', close);
    document.getElementById('loreClose').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.classList.contains('open')) close();
    });
  }

  function open() {
    ensureModal();
    var m = document.getElementById('loreModal');
    m.classList.add('open');
    var cover = document.getElementById('loreCover');
    cover.style.display = '';
    document.getElementById('loreInner').style.opacity = '0';
    playBook(cover, false, function () {
      cover.style.display = 'none';
      document.getElementById('loreInner').style.opacity = '1';
    });
    load();
  }

  function close() {
    var m = document.getElementById('loreModal');
    if (!m) return;
    editing = null;
    m.classList.remove('open');
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  function load() {
    var url = 'api/lore' + (tok() ? ('?token=' + encodeURIComponent(tok())) : '');
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error('lore fetch failed');
      pages = j.pages || [];
      isDev = !!j.dev;
      loaded = true;
      if (curr >= pages.length) curr = Math.max(0, pages.length - 1);
      render();
    }).catch(function (e) {
      console.error('[lore]', e);
      var r = document.getElementById('loreRight');
      if (r) r.innerHTML = '<div class="lore-empty">' + esc(T('lore.loadFail', 'The book will not open.')) + '</div>';
    });
  }

  function api(method, path, body) {
    return fetch('api/lore' + path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: tok() }, body || {}))
    }).then(function (r) { return r.json(); });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      var loc = (window._lang === 'zh') ? 'zh-CN' : 'en-GB';
      return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function render() {
    var idx = document.getElementById('loreIndex');
    var right = document.getElementById('loreRight');
    var bar = document.getElementById('loreDevBar');
    if (!idx || !right) return;

    // The editor wins over everything. This used to test pages.length first, so
    // on an EMPTY book, which is the state every fresh install is in, clicking
    // NEW PAGE set the editor and then painted the empty-book message straight
    // over it. The button appeared dead precisely when it was the only button
    // that could do anything.
    if (editing) {
      idx.innerHTML = pages.map(function (p, i) {
        return '<div class="lore-idx' + (p.published ? '' : ' draft') + '" data-i="' + i + '">' +
          esc(p.title) + '</div>';
      }).join('');
      renderEditor(right);
    } else if (!pages.length) {
      idx.innerHTML = '';
      right.innerHTML = '<div class="lore-empty">' +
        esc(T('lore.empty', 'Nothing has been written down yet.')) + '</div>';
    } else {
      idx.innerHTML = pages.map(function (p, i) {
        return '<div class="lore-idx' + (i === curr ? ' on' : '') + (p.published ? '' : ' draft') +
          '" data-i="' + i + '">' + esc(p.title) +
          (p.published ? '' : ' <span class="lore-draft-tag">' + esc(T('lore.draft', 'draft')) + '</span>') +
          '</div>';
      }).join('');
      [].forEach.call(idx.querySelectorAll('.lore-idx'), function (el) {
        el.addEventListener('click', function () {
          curr = Number(el.getAttribute('data-i')); editing = null; render();
        });
      });
      renderPage(right);
    }

    bar.innerHTML = '';
    if (isDev) {
      bar.innerHTML =
        '<button class="lore-dev" id="loreNew">' + esc(T('lore.new', 'NEW PAGE')) + '</button>' +
        (pages.length ? '<button class="lore-dev" id="loreEdit">' + esc(T('lore.edit', 'EDIT')) + '</button>' +
          '<button class="lore-dev warn" id="loreDel">' + esc(T('lore.del', 'DELETE')) + '</button>' : '');
      var nb = document.getElementById('loreNew');
      if (nb) nb.addEventListener('click', function () {
        editing = { id: null, title: '', body: '' }; render();
      });
      var eb = document.getElementById('loreEdit');
      if (eb) eb.addEventListener('click', function () {
        var p = pages[curr]; if (!p) return;
        editing = { id: p.id, title: p.title, body: p.body, published: p.published, sort: p.sort };
        render();
      });
      var db = document.getElementById('loreDel');
      if (db) db.addEventListener('click', function () {
        var p = pages[curr]; if (!p) return;
        if (!window.confirm(TF('lore.confirmDel', 'Tear out "{t}"? This cannot be undone.', { t: p.title }))) return;
        api('DELETE', '/' + p.id).then(function () { editing = null; load(); });
      });
    }
  }

  function renderPage(right) {
    if (editing) return renderEditor(right);
    var p = pages[curr];
    if (!p) { right.innerHTML = ''; return; }
    // Paragraphs, not raw HTML: the body is escaped and only line breaks are
    // honoured. A dev account is still an account, and this text lands in the
    // DOM of every client that opens the book.
    var body = esc(p.body || '').split(/\n{2,}/).map(function (para) {
      return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    right.innerHTML =
      '<div class="lore-page">' +
        '<h2>' + esc(p.title) + '</h2>' +
        '<div class="lore-meta">' +
          esc(p.author || T('lore.anon', 'unsigned')) + ' \u00b7 ' + esc(fmtDate(p.created)) +
          (p.updated && p.updated - p.created > 60000
            ? ' \u00b7 ' + esc(T('lore.revised', 'revised')) + ' ' + esc(fmtDate(p.updated)) : '') +
        '</div>' +
        '<div class="lore-body">' + (body || '<p class="lore-empty">' +
          esc(T('lore.blank', 'This page is blank.')) + '</p>') + '</div>' +
      '</div>';
  }

  function renderEditor(right) {
    var e = editing;
    right.innerHTML =
      '<div class="lore-page lore-editing">' +
        '<input id="loreT" class="lore-input" maxlength="90" placeholder="' +
          esc(T('lore.titlePh', 'Title of the entry')) + '" value="' + esc(e.title) + '">' +
        '<textarea id="loreB" class="lore-area" maxlength="12000" placeholder="' +
          esc(T('lore.bodyPh', 'What happened, and what it meant.')) + '">' + esc(e.body) + '</textarea>' +
        '<div class="lore-edit-row">' +
          (e.id ? '<label class="lore-chk"><input type="checkbox" id="lorePub"' +
            (e.published ? ' checked' : '') + '> ' + esc(T('lore.publish', 'Published')) + '</label>' +
            '<label class="lore-chk">' + esc(T('lore.sort', 'Order')) +
            ' <input type="number" id="loreSort" class="lore-num" value="' + Number(e.sort || 0) + '"></label>' : '') +
          '<button class="lore-dev" id="loreSave">' + esc(T('lore.save', 'SAVE')) + '</button>' +
          '<button class="lore-dev" id="loreCancel">' + esc(T('lore.cancel', 'CANCEL')) + '</button>' +
        '</div>' +
        '<div id="loreErr" class="lore-err"></div>' +
      '</div>';
    document.getElementById('loreCancel').addEventListener('click', function () { editing = null; render(); });
    document.getElementById('loreSave').addEventListener('click', function () {
      var title = document.getElementById('loreT').value.trim();
      var body = document.getElementById('loreB').value;
      var err = document.getElementById('loreErr');
      if (!title) { err.textContent = T('lore.needTitle', 'An entry needs a title.'); return; }
      var payload = { title: title, body: body };
      var pubEl = document.getElementById('lorePub');
      if (pubEl) payload.published = pubEl.checked;
      var sortEl = document.getElementById('loreSort');
      if (sortEl) payload.sort = Number(sortEl.value) || 0;
      var req = e.id ? api('PUT', '/' + e.id, payload) : api('POST', '', payload);
      req.then(function (j) {
        if (!j || !j.ok) { err.textContent = T('lore.saveFail', 'The page would not take the ink.') + ' (' + ((j && j.error) || '?') + ')'; return; }
        editing = null;
        load();
      }).catch(function (x) { err.textContent = String(x); });
    });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────
  window.openLoreBook = open;
  window._loreReload = load;

  function boot() {
    if (!mountButton()) setTimeout(boot, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // A page written while the book is open should appear without a reload. The
  // server broadcasts lore_update on every write; core.js re-emits every socket
  // frame as fm_ws_msg on document, which is how the other modules listen.
  document.addEventListener('fm_ws_msg', function (ev) {
    var m = ev && ev.detail;
    if (!m || m.type !== 'lore_update') return;
    var el = document.getElementById('loreModal');
    if (el && el.classList.contains('open')) load();
  });
})();
