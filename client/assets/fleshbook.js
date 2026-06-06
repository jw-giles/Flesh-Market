// ═══════════════════════════════════════════════════════════════════════════════
// FLESHBOOK — in-house social feed
// Single global feed, one level of replies, boost (upvote), dev moderation.
// New/Top sort, dev pin, @mention + reply notifications, own-content edit/delete,
// rate limits (server-enforced), composer polish.
// Styled to the platform: amber/green chrome, faction colours reserved for authors.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // Platform palette (matches style.css tokens)
  const C = {
    amber: '#f0b454', amberDim: '#f0b45433', amberFaint: '#f0b4541f', amberText: '#d9a94e',
    surf: '#06100a', body: '#c7d8c9', dim: '#6f8f78', faint: '#557a60',
    boostOn: '#8dff9e', boostOff: '#5f7a66', gold: '#ffce4d', bad: '#ff6a6a',
  };

  function tok() { return window.FM_TOKEN || window.__fmToken || ''; }
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Highlight @mentions. Runs on already-escaped text, so it is injection-safe.
  function mentions(s) { return s.replace(/@([A-Za-z0-9_\-]+)/g, '<span style="color:#9dffb0">@$1</span>'); }
  function bodyHtml(raw) { return mentions(esc(raw)).replace(/\n/g, '<br>'); }
  function ago(ts) {
    const d = Date.now() - ts;
    if (d < 45000) return 'now';
    if (d < 3600000) return Math.round(d / 60000) + 'm';
    if (d < 86400000) return Math.round(d / 3600000) + 'h';
    return Math.round(d / 86400000) + 'd';
  }
  const FACTION = {
    coalition: { label: 'Coalition', color: '#4ecdc4' },
    syndicate: { label: 'Syndicate', color: '#e74c3c' },
    void:      { label: 'Void',      color: '#9b59b6' },
    guild:     { label: 'Guild',     color: '#2ecc71' },
    flesh:     { label: 'Flesh',     color: '#ffce4d' },
  };

  let __built = false;
  let __isDev = false;
  let __myName = (window.ME && window.ME.name) || null;
  let __sort = 'new';
  document.addEventListener('fm:authed', function (e) {
    __isDev = !!(e.detail && (e.detail.is_admin || e.detail.is_dev || e.detail.is_prime || e.detail.isAdmin || e.detail.isDev));
    if (e.detail && e.detail.name) __myName = e.detail.name;
  });

  function setBadge(n) {
    const b = document.getElementById('unread-fleshbook');
    if (!b) return;
    if (n > 0) { b.style.display = 'inline-block'; b.textContent = String(n); }
    else { b.style.display = 'none'; }
  }
  window.fbSetUnread = setBadge;

  function authorHtml(p) {
    const fac = FACTION[p.faction] || null;
    const color = p.is_gm ? C.gold : (fac ? fac.color : C.amber);
    const gm = p.is_gm ? `<span style="color:${C.gold};font-size:.58rem;border:1px solid ${C.gold}66;border-radius:2px;padding:0 4px;margin-left:5px;letter-spacing:.12em">FLESH CORP</span>` : '';
    const tag = (!p.is_gm && fac) ? `<span style="color:${fac.color};opacity:.65;font-size:.62rem;margin-left:5px">${fac.label.toUpperCase()}</span>` : '';
    return `<b style="color:${color};letter-spacing:.02em">${esc(p.author_name)}</b>${gm}${tag}`;
  }
  function editedTag(x) { return x.edited ? ` <span style="color:${C.faint};font-size:.6rem">(edited)</span>` : ''; }
  function mine(x) { return !!(__myName && x.author_name === __myName && !x.is_gm); }
  function sep() { return `<span style="color:${C.faint};opacity:.5">·</span>`; }

  function postActions(p) {
    const acts = [];
    acts.push(`<span class="fb-act" data-act="vote" data-id="${p.id}" title="Boost this signal" style="cursor:pointer;color:${p.voted ? C.boostOn : C.boostOff}">▲ <span class="fb-votes">${p.upvotes}</span></span>`);
    acts.push(`<span class="fb-act" data-act="toggle" data-id="${p.id}" style="cursor:pointer;color:${C.dim}">↳ <span class="fb-rc">${p.reply_count}</span></span>`);
    if (mine(p) || __isDev) {
      acts.push(`<span class="fb-act" data-act="editpost" data-id="${p.id}" style="cursor:pointer;color:${C.faint};font-size:.7rem">edit</span>`);
      acts.push(`<span class="fb-act" data-act="delpost" data-id="${p.id}" style="cursor:pointer;color:${C.bad};opacity:.55;font-size:.7rem">delete</span>`);
    }
    if (__isDev) {
      acts.push(`<span class="fb-act" data-act="pin" data-id="${p.id}" data-pinned="${p.pinned ? 1 : 0}" style="cursor:pointer;color:${p.pinned ? C.gold : C.faint};font-size:.7rem;margin-left:auto">${p.pinned ? '📌 unpin' : 'pin'}</span>`);
    }
    return acts.join(' ' + sep() + ' ');
  }

  function postCard(p) {
    const accent = p.pinned ? C.gold : ((FACTION[p.faction] && !p.is_gm) ? FACTION[p.faction].color : C.amber);
    const pin = p.pinned ? `<span style="color:${C.gold};font-size:.6rem;margin-right:5px;letter-spacing:.1em">PINNED</span>` : '';
    return `<div class="fb-post" data-post="${p.id}" data-raw="${encodeURIComponent(p.body)}" style="background:${C.surf};border:1px solid ${C.amberDim};border-left:2px solid ${accent}88;border-radius:4px;padding:11px 13px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:6px;font-size:.78rem;margin-bottom:6px">
        ${pin}${authorHtml(p)}
        <span class="fb-time" data-ts="${p.created_at}" style="color:${C.faint};font-size:.62rem">${ago(p.created_at)}</span>${editedTag(p)}
      </div>
      <div class="fb-body" style="color:${C.body};font-size:.86rem;line-height:1.5;word-break:break-word">${bodyHtml(p.body)}</div>
      <div class="fb-actions" style="display:flex;align-items:center;gap:10px;margin-top:9px;font-size:.74rem">${postActions(p)}</div>
      <div class="fb-replies" data-for="${p.id}" style="display:none;margin-top:10px;border-top:1px solid ${C.amberFaint};padding-top:8px"></div>
    </div>`;
  }

  function replyHtml(r) {
    const fac = FACTION[r.faction] || null;
    const color = r.is_gm ? C.gold : (fac ? fac.color : C.amber);
    const gm = r.is_gm ? ` <span style="color:${C.gold};font-size:.54rem">FLESH CORP</span>` : '';
    let ctrl = '';
    if (mine(r) || __isDev) {
      ctrl = ` <span class="fb-act" data-act="editreply" data-id="${r.id}" style="cursor:pointer;color:${C.faint};font-size:.6rem">edit</span>`
           + ` <span class="fb-act" data-act="delreply" data-id="${r.id}" style="cursor:pointer;color:${C.bad};opacity:.55;font-size:.6rem">✕</span>`;
    }
    return `<div class="fb-reply" data-reply="${r.id}" data-raw="${encodeURIComponent(r.body)}" style="padding:5px 0 5px 9px;border-left:1px solid ${C.amberFaint};margin-bottom:2px;font-size:.8rem;line-height:1.45">
      <b style="color:${color}">${esc(r.author_name)}</b>${gm}
      <span class="fb-time" data-ts="${r.created_at}" style="color:${C.faint};font-size:.6rem;margin-left:4px">${ago(r.created_at)}</span>${editedTag(r)}${ctrl}
      <div class="fb-body" style="color:${C.body};word-break:break-word">${bodyHtml(r.body)}</div>
    </div>`;
  }

  function ensureShell() {
    if (__built) return;
    const tab = document.getElementById('fleshbookTab');
    if (!tab) return;
    tab.innerHTML = `
      <div style="flex:1;overflow-y:auto;padding:0 22px 18px;max-width:760px;width:100%;box-sizing:border-box;margin:0 auto">
        <div style="display:flex;align-items:baseline;gap:10px;padding:14px 0 8px;border-bottom:1px solid ${C.amberDim};position:sticky;top:0;background:#02060a;z-index:2">
          <span style="color:${C.amber};font-weight:700;letter-spacing:.22em;font-size:.95rem;text-shadow:0 0 6px ${C.amber}55">FLESHBOOK</span>
          <span style="color:${C.faint};font-size:.66rem;letter-spacing:.18em">PUBLIC FEED</span>
          <span style="margin-left:auto;display:flex;align-items:center;gap:5px;color:${C.faint};font-size:.62rem;letter-spacing:.12em">
            <span style="width:6px;height:6px;border-radius:50%;background:${C.boostOn};box-shadow:0 0 5px ${C.boostOn}">&nbsp;</span>LIVE</span>
        </div>
        <div style="background:${C.surf};border:1px solid ${C.amberDim};border-radius:4px;padding:11px;margin:14px 0">
          <textarea id="fb-compose" maxlength="1000" rows="3" placeholder="Broadcast to the public feed"
            style="width:100%;box-sizing:border-box;background:#030a06;border:1px solid ${C.amberDim};color:${C.body};padding:8px 10px;font-size:.84rem;font-family:inherit;resize:vertical;border-radius:3px;outline:none;margin-bottom:7px"></textarea>
          <div style="display:flex;gap:10px;align-items:center">
            <button id="fb-post-btn" style="background:${C.amber}18;border:1px solid ${C.amber};color:${C.amber};padding:6px 18px;font-family:inherit;font-size:.8rem;letter-spacing:.08em;border-radius:3px;cursor:pointer">BROADCAST</button>
            <span id="fb-compose-msg" style="font-size:.72rem;color:${C.dim}"></span>
            <span style="font-size:.62rem;color:${C.faint};margin-left:auto">enter sends · <span id="fb-count">0/1000</span></span>
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:10px;font-size:.7rem;letter-spacing:.1em;color:${C.faint}">
          <span class="fb-sort" data-sort="new" style="cursor:pointer;color:${C.amber}">NEW</span>
          <span class="fb-sort" data-sort="top" style="cursor:pointer;color:${C.faint}">TOP</span>
        </div>
        <div id="fb-feed"></div>
      </div>`;
    const ta = tab.querySelector('#fb-compose');
    const cnt = tab.querySelector('#fb-count');
    ta.addEventListener('input', function () { cnt.textContent = ta.value.length + '/1000'; });
    ta.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); submitPost(); }
    });
    tab.querySelector('#fb-post-btn').addEventListener('click', submitPost);
    tab.querySelector('#fb-feed').addEventListener('click', onFeedClick);
    tab.querySelectorAll('.fb-sort').forEach(function (el) {
      el.addEventListener('click', function () {
        __sort = el.dataset.sort;
        tab.querySelectorAll('.fb-sort').forEach(function (s) {
          s.style.color = s.dataset.sort === __sort ? C.amber : C.faint;
        });
        fetchFeed();
      });
    });
    __built = true;
  }

  function feedEl() { return document.getElementById('fb-feed'); }

  function fetchFeed() {
    const feed = feedEl(); if (!feed) return;
    feed.innerHTML = `<div class="fb-empty" style="color:${C.faint};font-size:.78rem;padding:10px">Loading feed…</div>`;
    fetch('/api/fleshbook/feed?sort=' + __sort, { headers: { 'x-auth-token': tok() } })
      .then(r => r.json())
      .then(d => {
        if (!d.ok || !d.posts.length) {
          feed.innerHTML = `<div class="fb-empty" style="color:${C.faint};font-size:.78rem;padding:10px">No broadcasts yet.</div>`;
          return;
        }
        feed.innerHTML = d.posts.map(postCard).join('');
      })
      .catch(() => { feed.innerHTML = `<div class="fb-empty" style="color:${C.bad};font-size:.78rem;padding:10px">Feed unavailable.</div>`; });
  }

  function cooldownMsg(d) {
    if (d.error === 'cooldown') return 'Slow down. ' + (d.seconds || 1) + 's.';
    if (d.error === 'muted') return 'You are muted and cannot post.';
    if (d.error === 'dunced') return 'Dunced accounts cannot post.';
    return 'Failed.';
  }

  function submitPost() {
    const ta = document.getElementById('fb-compose');
    const msg = document.getElementById('fb-compose-msg');
    const body = (ta.value || '').trim();
    if (!body) return;
    fetch('/api/fleshbook/post', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ body })
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        ta.value = ''; msg.textContent = ''; document.getElementById('fb-count').textContent = '0/1000';
        const feed = feedEl();
        const ph = feed.querySelector('.fb-empty'); if (ph) ph.remove();
        if (__sort === 'new') feed.insertAdjacentHTML('afterbegin', postCard(d.post));
        else fetchFeed();
      } else { msg.textContent = cooldownMsg(d); msg.style.color = C.bad; }
    }).catch(() => { msg.textContent = 'Broadcast failed.'; msg.style.color = C.bad; });
  }

  function onFeedClick(e) {
    const act = e.target.closest('.fb-act');
    if (!act) return;
    const kind = act.dataset.act;
    const id = Number(act.dataset.id);
    if (kind === 'vote') return doVote(id, act);
    if (kind === 'toggle') return toggleReplies(id);
    if (kind === 'delpost') return delPost(id);
    if (kind === 'delreply') return delReply(id, act);
    if (kind === 'editpost') return startEdit(act.closest('.fb-post'), 'post', id);
    if (kind === 'editreply') return startEdit(act.closest('.fb-reply'), 'reply', id);
    if (kind === 'pin') return doPin(id, act);
  }

  function doVote(postId, el) {
    fetch('/api/fleshbook/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ postId })
    }).then(r => r.json()).then(d => {
      if (!d.ok) return;
      const c = el.querySelector('.fb-votes'); if (c) c.textContent = d.upvotes;
      el.style.color = d.voted ? C.boostOn : C.boostOff;
    }).catch(() => {});
  }

  function doPin(postId, el) {
    const next = el.dataset.pinned === '1' ? false : true;
    fetch('/api/fleshbook/pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ postId, pinned: next })
    }).then(r => r.json()).then(d => { if (d.ok) fetchFeed(); }).catch(() => {});
  }

  function startEdit(container, kind, id) {
    if (!container || container.querySelector('.fb-editing')) return;
    const bodyEl = container.querySelector('.fb-body');
    const raw = decodeURIComponent(container.dataset.raw || '');
    const max = kind === 'post' ? 1000 : 500;
    const orig = bodyEl.innerHTML;
    const box = document.createElement('div');
    box.className = 'fb-editing';
    box.innerHTML = `<textarea maxlength="${max}" rows="3" style="width:100%;box-sizing:border-box;background:#030a06;border:1px solid ${C.amberDim};color:${C.body};padding:6px 8px;font-size:.82rem;font-family:inherit;border-radius:3px;outline:none"></textarea>
      <div style="display:flex;gap:8px;margin-top:5px">
        <button class="fb-edit-save" style="background:${C.amber}18;border:1px solid ${C.amber};color:${C.amber};padding:3px 12px;font-family:inherit;font-size:.72rem;border-radius:3px;cursor:pointer">Save</button>
        <button class="fb-edit-cancel" style="background:none;border:1px solid ${C.faint};color:${C.dim};padding:3px 12px;font-family:inherit;font-size:.72rem;border-radius:3px;cursor:pointer">Cancel</button>
      </div>`;
    bodyEl.style.display = 'none';
    bodyEl.insertAdjacentElement('afterend', box);
    const tarea = box.querySelector('textarea');
    tarea.value = raw; tarea.focus();
    box.querySelector('.fb-edit-cancel').addEventListener('click', function () { box.remove(); bodyEl.style.display = ''; });
    box.querySelector('.fb-edit-save').addEventListener('click', function () {
      const nb = (tarea.value || '').trim();
      if (!nb) return;
      const payload = kind === 'post' ? { postId: id, body: nb } : { replyId: id, body: nb };
      fetch('/api/fleshbook/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
        body: JSON.stringify(payload)
      }).then(r => r.json()).then(d => {
        if (d.ok) {
          bodyEl.innerHTML = bodyHtml(d.body);
          container.dataset.raw = encodeURIComponent(d.body);
          const time = container.querySelector('.fb-time');
          if (time && !/\(edited\)/.test(time.parentElement.innerHTML)) {
            time.insertAdjacentHTML('afterend', ` <span style="color:${C.faint};font-size:.6rem">(edited)</span>`);
          }
          box.remove(); bodyEl.style.display = '';
        } else {
          bodyEl.innerHTML = orig; box.remove(); bodyEl.style.display = '';
        }
      }).catch(() => { box.remove(); bodyEl.style.display = ''; });
    });
  }

  function toggleReplies(postId) {
    const box = document.querySelector('.fb-replies[data-for="' + postId + '"]');
    if (!box) return;
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.style.display = 'block';
    if (box.dataset.loaded) return;
    box.innerHTML = `<div style="color:${C.faint};font-size:.72rem">Loading…</div>`;
    fetch('/api/fleshbook/post/' + postId + '/replies', { headers: { 'x-auth-token': tok() } })
      .then(r => r.json()).then(d => {
        const list = (d.ok ? d.replies : []).map(replyHtml).join('');
        box.innerHTML = list +
          `<div style="display:flex;gap:8px;margin-top:8px">
             <input class="fb-reply-input" maxlength="500" placeholder="Reply, @name to tag"
               style="flex:1;background:#030a06;border:1px solid ${C.amberDim};color:${C.body};padding:5px 8px;font-size:.78rem;font-family:inherit;border-radius:3px;outline:none">
             <button class="fb-reply-send" data-post="${postId}" style="background:${C.amber}18;border:1px solid ${C.amber};color:${C.amber};padding:4px 12px;font-family:inherit;font-size:.74rem;border-radius:3px;cursor:pointer">Send</button>
           </div>
           <div class="fb-reply-msg" style="font-size:.68rem;color:${C.bad};margin-top:3px"></div>`;
        box.dataset.loaded = '1';
        const btn = box.querySelector('.fb-reply-send');
        const inp = box.querySelector('.fb-reply-input');
        btn.addEventListener('click', () => submitReply(postId, box, inp));
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submitReply(postId, box, inp); } });
      }).catch(() => { box.innerHTML = `<div style="color:${C.bad};font-size:.72rem">Could not load replies.</div>`; });
  }

  function submitReply(postId, box, inp) {
    const body = (inp.value || '').trim();
    if (!body) return;
    const emsg = box.querySelector('.fb-reply-msg');
    fetch('/api/fleshbook/reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ postId, body })
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        inp.value = ''; if (emsg) emsg.textContent = '';
        const sendRow = box.querySelector('.fb-reply-send').parentElement;
        sendRow.insertAdjacentHTML('beforebegin', replyHtml(d.reply));
        const rc = document.querySelector('.fb-post[data-post="' + postId + '"] .fb-rc');
        if (rc) rc.textContent = String((parseInt(rc.textContent) || 0) + 1);
      } else if (emsg) { emsg.textContent = cooldownMsg(d); }
    }).catch(() => {});
  }

  function delPost(postId) {
    if (!confirm('Delete this post?')) return;
    fetch('/api/fleshbook/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ postId })
    }).then(r => r.json()).then(d => {
      if (d.ok) { const c = document.querySelector('.fb-post[data-post="' + postId + '"]'); if (c) c.remove(); }
    }).catch(() => {});
  }

  function delReply(replyId, el) {
    fetch('/api/fleshbook/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': tok() },
      body: JSON.stringify({ replyId })
    }).then(r => r.json()).then(d => {
      if (d.ok) { const node = el.closest('.fb-reply'); if (node) node.remove(); }
    }).catch(() => {});
  }

  setInterval(function () {
    try {
      document.querySelectorAll('#fleshbookTab .fb-time').forEach(function (el) {
        const ts = Number(el.dataset.ts); if (ts) el.textContent = ago(ts);
      });
    } catch (_) {}
  }, 60000);

  window.fleshbookTabLoad = function () {
    ensureShell();
    fetchFeed();
    fetch('/api/fleshbook/seen', { method: 'POST', headers: { 'x-auth-token': tok() } })
      .then(() => setBadge(0)).catch(() => {});
  };
})();
