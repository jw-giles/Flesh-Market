
(function(){
  let _ppTarget = null;
  let _ppBioCurrent = '';
  // Cache of fetched profile data
  const _ppCache = {};

  // ── Formatting helpers ───────────────────────────────────────────────────
  // Deliberately identical in output to _frsTime in god-panel.js. Same column,
  // same rendering: a dossier reading 521h 39m and a profile reading 521h for
  // the same account is the kind of mismatch that gets reported as a bug.
  function fmtPlaytime(sec) {
    sec = Number(sec) || 0;
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h ? (h + 'h ' + m + 'm') : (m + 'm');
  }
  function fmtJoined(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var days = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
    var age = days < 1 ? 'today' : (days === 1 ? '1 day' : days.toLocaleString() + ' days');
    return d.toISOString().slice(0, 10) + ' (' + age + ')';
  }
  function isSelfName(n) {
    var me = (window.ME && window.ME.name) ? window.ME.name : '';
    return !!(me && n && String(me).toLowerCase() === String(n).toLowerCase());
  }
  function ppToken() { return window.FM_TOKEN || (window.ME && window.ME.token) || ''; }

  function showModal(show) {
    var ov = document.getElementById('ppOverlay');
    var card = document.getElementById('playerProfilePopup');
    // HOIST TO BODY BEFORE SHOWING. On mobile, body.fm-mobile .wrap is
    // position:fixed, which makes it a stacking context at z-index auto. The
    // overlay ships inside .wrap, so its 10500 was never being compared against
    // the mobile chrome at 9990-9998 at all - it was compared against .wrap's
    // siblings, and .wrap loses. The modal would render UNDER the top bar and
    // the bottom nav. Same defect and same fix as the drawer; see hoistDrawer()
    // in mobile.js and the note above the .wrap rule in mobile.css.
    // One-way, unlike the drawer: nothing reads this node's position in the
    // tree, so there is nothing to restore on leaving mobile.
    if (ov && ov.parentNode !== document.body) document.body.appendChild(ov);
    if (ov)   ov.style.display   = show ? 'flex'  : 'none';
    if (card) card.style.display = show ? 'block' : 'none';
  }

  window.openPlayerProfile = async function(userName /*, x, y - legacy, ignored */) {
    _ppTarget = userName;
    const popup = document.getElementById('playerProfilePopup');
    if (!popup) return;
    showModal(true);
    if (popup.parentNode) popup.parentNode.scrollTop = 0;

    // Reset every region before the fetch so a slow load never shows the last
    // player's bio under this player's name.
    document.getElementById('ppName').textContent = userName;
    document.getElementById('ppTitle').textContent = '';
    document.getElementById('ppMeta').textContent = '';
    document.getElementById('ppEquipped').innerHTML = '<div style="color:#553333;font-size:.68rem;grid-column:1/-1">Loading\u2026</div>';
    document.getElementById('ppAssets').innerHTML   = '';
    document.getElementById('ppPassive').textContent = '';
    const bioWrap = document.getElementById('ppBioWrap');
    const bioEl   = document.getElementById('ppBio');
    // Cleared HERE, not only on close. Without this, opening someone else's
    // profile, closing it, then opening your own while the fetch fails would
    // leave THEIR text sitting in your editor, one Save away from being
    // published under your name.
    _ppBioCurrent = '';
    if (bioEl) bioEl.textContent = '';
    if (bioWrap) bioWrap.style.display = 'none';
    const ed = document.getElementById('ppBioEditor'); if (ed) ed.style.display = 'none';
    const fsw = document.getElementById('ppForSaleWrap'); if (fsw) fsw.style.display = 'none';
    const selfBar = document.getElementById('ppSelfBar');
    if (selfBar) selfBar.style.display = 'none';
    const _ppReset = document.getElementById('ppPortrait');
    if (_ppReset) { _ppReset.style.display = 'none'; _ppReset.onclick = null; }

    // Show admin bar if admin
    const adminBar = document.getElementById('ppAdminBar');
    if (adminBar) adminBar.style.display = window.__isAdmin_g ? 'block' : 'none';

    // Fetch profile
    try {
      const token = ppToken();
      const r = await fetch(`/api/items/profile/${encodeURIComponent(userName)}${token?'?token='+token:''}`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('ppEquipped').innerHTML = '<div style="color:#553333;font-size:.68rem;grid-column:1/-1">No items equipped.</div>'; return; }
      // A slower earlier fetch must not paint over a profile opened since.
      if (String(_ppTarget || '').toLowerCase() !== String(d.name || userName).toLowerCase()) return;
      renderProfilePopup(d);
    } catch(e) {
      document.getElementById('ppEquipped').innerHTML = '<div style="color:#443333;font-size:.68rem;grid-column:1/-1">Could not load.</div>';
    }
  };

  // Header entry points. The header button is labelled Edit Profile, so it opens
  // the editor rather than dropping the player on a read-only panel they then
  // have to find a second button on. The name itself opens the view.
  window.openMyProfile = function (startEditing) {
    const me = (window.ME && window.ME.name) ? window.ME.name : '';
    if (!me) return;
    const p = window.openPlayerProfile(me);
    if (!startEditing) return;
    // openPlayerProfile resolves after the fetch, so the bio is loaded by the
    // time the editor reads it. Guard the then() because a failed fetch still
    // resolves and _ppBioCurrent stays empty, which is the correct blank editor.
    if (p && typeof p.then === 'function') p.then(function () { window.ppOpenBioEditor(); }).catch(function () {});
  };

  function renderProfilePopup(d) {
    const SLOT_LABEL = window.SLOT_LABELS || {hat:'Hat',glasses:'Glasses',upperbody:'Upper Body',necklace:'Necklace',watch:'Watch',pants:'Pants',shoes:'Shoes',ring:'Ring',earring:'Earring',bracelet:'Bracelet',implant:'Implant',vehicle:'Vehicle',property:'Property'};
    const SLOT_ICONS = window.SLOT_ICONS  || {hat:'\ud83c\udfa9',glasses:'\ud83d\udc53',upperbody:'\ud83d\udc55',necklace:'\ud83d\udcff',watch:'\u231a',pants:'\ud83d\udc56',shoes:'\ud83d\udc5f',ring:'\ud83d\udc8d',earring:'\u2728',bracelet:'\ud83d\udcff',implant:'\ud83d\udd29',vehicle:'\ud83d\ude97',property:'\ud83c\udfe0'};
    const RARITY_C   = window.RARITY_COLORS || {common:'#888780',uncommon:'#1D9E75',rare:'#3B8BD4',epic:'#8B5CF6',legendary:'#ff6a00'};
    const RARITY_BG  = {common:'#1a1a1a',uncommon:'#0a1f18',rare:'#0a1220',epic:'#150e24',legendary:'#1f0e00'};
    const ITEM_CAT   = window.ITEM_CATALOG_CLIENT || {};

    const titleEl = document.getElementById('ppTitle');
    if (titleEl) titleEl.textContent = d.title || '';

    // Joined + playtime. Playtime is a session odometer, not an activity score;
    // it accrues while the tab is open and visible.
    const metaEl = document.getElementById('ppMeta');
    if (metaEl) {
      metaEl.innerHTML = '';
      const joined = fmtJoined(d.createdAt);
      function chip(label, value, color) {
        const s = document.createElement('span');
        const k = document.createElement('span');
        k.textContent = label + ' ';
        k.style.cssText = 'color:#7a5555;text-transform:uppercase;letter-spacing:.1em';
        const v = document.createElement('span');
        v.textContent = value;
        v.style.color = color || '#8fd6a6';
        s.appendChild(k); s.appendChild(v);
        metaEl.appendChild(s);
      }
      if (joined) chip('Joined', joined);
      chip('Playtime', fmtPlaytime(d.playtimeSec), '#f0b454');
      if (d.level) chip('Level', String(d.level));
    }

    // Portrait avatar
    const portEl = document.getElementById('ppPortrait');
    const isSelf = isSelfName(_ppTarget);
    if (portEl) {
      const pid = d.portrait ? String(d.portrait) : '';
      if (pid) { portEl.src = window.FMPortraitSrc(pid); portEl.style.imageRendering = window.FMPortraitPixelated(pid) ? 'pixelated' : ''; portEl.style.display = 'block'; }
      else { portEl.style.display = 'none'; }
      if (isSelf) {
        portEl.style.cursor = 'pointer'; portEl.title = 'Change portrait';
        portEl.onclick = function (e) { e.stopPropagation(); window.openPortraitPicker(); };
      } else {
        portEl.style.cursor = ''; portEl.title = ''; portEl.onclick = null;
      }
    }

    // Self controls
    const selfBar = document.getElementById('ppSelfBar');
    if (selfBar) selfBar.style.display = isSelf ? 'flex' : 'none';

    // Bio. textContent, never innerHTML: this is the one string on the profile
    // that another player wrote. No auto-linking either - a clickable link a
    // stranger controls is a phishing surface, and the server does not vet URLs.
    const bioWrap = document.getElementById('ppBioWrap');
    const bioEl   = document.getElementById('ppBio');
    _ppBioCurrent = d.bio || '';
    if (bioEl && bioWrap) {
      if (_ppBioCurrent) {
        bioEl.textContent = _ppBioCurrent;
        bioEl.style.color = '#c7d8c9'; bioEl.style.fontStyle = '';
        bioWrap.style.display = 'block';
      } else if (isSelf) {
        bioEl.textContent = 'No transmission on file. Write one.';
        bioEl.style.color = '#5f8f74'; bioEl.style.fontStyle = 'italic';
        bioWrap.style.display = 'block';
      } else {
        bioWrap.style.display = 'none';
      }
    }
    const ed = document.getElementById('ppBioEditor'); if (ed) ed.style.display = 'none';

    const equippedItems = d.equipped || {};
    const allSlots = ['hat','glasses','upperbody','necklace','watch','pants','shoes','ring','earring','bracelet','implant','vehicle','property'];

    // Build lookup: slot -> enriched item (API data + client img)
    const slotData = {};
    for (const slot of allSlots) {
      const invId = equippedItems[slot];
      // inv already has name/rarity/slot spread from server's ITEM_CATALOG
      const inv   = invId ? (d.items||[]).find(i=>i.invId===invId) : null;
      if (inv) {
        // Only use img if it's a base64 data URI - bare filenames (e.g. 'flesh_suite.png')
        // are server-only and not bundled in the client, so fall back to emoji for those.
        const clientDef = ITEM_CAT[inv.itemId];
        const rawImg = (clientDef && clientDef.img) || inv.img || null;
        const img = (rawImg && rawImg.startsWith('data:')) ? rawImg : null;
        slotData[slot] = { ...inv, img };
      } else {
        slotData[slot] = null;
      }
    }

    // Render a slot cell
    function renderCell(slot, size) {
      const item = slotData[slot];
      const rc   = item ? (RARITY_C[item.rarity]||'#888') : '#1a0808';
      const rbg  = item ? (RARITY_BG[item.rarity]||'#0a0303') : '#0a0303';
      const imgHtml = item && item.img
        ? `<img src="${item.img}" style="width:${size}px;height:${size}px;image-rendering:pixelated;display:block;margin:0 auto">`
        : `<span style="font-size:${Math.round(size*0.7)}px;line-height:1;display:block;text-align:center;opacity:${item?1:.2}">${SLOT_ICONS[slot]||'?'}</span>`;
      const nameHtml = item
        ? `<div style="font-size:.55rem;color:${rc};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;margin-top:3px">${item.name}</div>`
        : `<div style="font-size:.55rem;color:#2a1010;margin-top:3px">-</div>`;
      return `<div class="pp-item" data-slot="${slot}" style="background:${rbg};border-color:${item?rc+'44':'#1a0808'};cursor:${item?'pointer':'default'}" onclick="ppShowItemDetail('${slot}')">
        ${imgHtml}${nameHtml}
      </div>`;
    }

    // Clothing grid (11 slots)
    const clothingSlots = ['hat','glasses','upperbody','necklace','watch','pants','shoes','ring','earring','bracelet','implant'];
    const eqEl = document.getElementById('ppEquipped');
    eqEl.innerHTML = clothingSlots.map(s => renderCell(s, 40)).join('');

    // Asset row (vehicle + property)
    const assetEl = document.getElementById('ppAssets');
    assetEl.innerHTML = ['vehicle','property'].map(s => {
      const item = slotData[s];
      const rc   = item ? (RARITY_C[item.rarity]||'#888') : '#1a0808';
      const rbg  = item ? (RARITY_BG[item.rarity]||'#0a0303') : '#0a0303';
      const imgHtml = item && item.img
        ? `<img src="${item.img}" style="width:40px;height:40px;image-rendering:pixelated;display:block;margin:0 auto">`
        : `<span style="font-size:1.5rem;line-height:1;display:block;text-align:center;opacity:.2">${SLOT_ICONS[s]}</span>`;
      return `<div class="pp-asset" data-slot="${s}" style="background:${rbg};border-color:${item?rc+'44':'#1a0808'};cursor:${item?'pointer':'default'}" onclick="ppShowItemDetail('${s}')">
        ${imgHtml}
        ${item
          ? `<div style="font-size:.6rem;color:${rc};font-weight:600;margin-top:3px">${item.name}</div>`
          : `<div style="font-size:.6rem;color:#2a1010;margin-top:3px">${SLOT_LABEL[s]}</div>`}
      </div>`;
    }).join('');

    // Open Fbay listings. Server sends these separately because getInventory()
    // filters listed rows out of the owned set.
    const fsWrap = document.getElementById('ppForSaleWrap');
    const fsEl   = document.getElementById('ppForSale');
    const listings = Array.isArray(d.listings) ? d.listings : [];
    if (fsWrap && fsEl) {
      if (!listings.length) { fsWrap.style.display = 'none'; fsEl.innerHTML = ''; }
      else {
        fsWrap.style.display = 'block';
        fsEl.innerHTML = listings.map(function (L) {
          const rc = RARITY_C[L.rarity] || '#888';
          const rbg = RARITY_BG[L.rarity] || '#0a0303';
          const clientDef = ITEM_CAT[L.itemId];
          const rawImg = (clientDef && clientDef.img) || L.img || null;
          const img = (rawImg && String(rawImg).startsWith('data:')) ? rawImg : null;
          const art = img
            ? `<img src="${img}" style="width:40px;height:40px;image-rendering:pixelated;display:block;margin:0 auto">`
            : `<span style="font-size:26px;line-height:1;display:block;text-align:center;opacity:.35">\u25a3</span>`;
          const price = Number(L.price) || 0;
          return `<div class="pp-item" style="background:${rbg};border-color:${rc}44">
            ${art}
            <div style="font-size:.55rem;color:${rc};font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px">${(L.name||L.itemId||'').replace(/[<>&"]/g,'')}</div>
            <div style="font-size:.56rem;color:#f0b454;margin-top:2px">\u0192${price.toLocaleString()}</div>
          </div>`;
        }).join('');
      }
    }

    // Passive total
    const passiveEl = document.getElementById('ppPassive');
    if (passiveEl && typeof d.passiveBonus === 'number') {
      passiveEl.textContent = d.passiveBonus > 0
        ? `Item passive: +${d.passiveBonus} \u0192/30min`
        : 'No items equipped';
    }

    // Store slot data for click handler
    window._ppSlotData = slotData;
    window._ppSlotLabel = SLOT_LABEL;
    window._ppRarityC = RARITY_C;
    window._ppRarityBG = RARITY_BG;
  }

  // ── Bio editing ──────────────────────────────────────────────────────────
  const BIO_MAX = 2000;
  function bioMsg(text, color) {
    const m = document.getElementById('ppBioMsg');
    if (m) { m.textContent = text || ''; m.style.color = color || '#c08a44'; }
  }
  function bioCount() {
    const ta = document.getElementById('ppBioText');
    const c  = document.getElementById('ppBioCount');
    if (!ta || !c) return;
    const n = ta.value.length;
    c.textContent = n + ' / ' + BIO_MAX;
    c.style.color = n > BIO_MAX - 100 ? '#f0b454' : '#5f8f74';
  }
  window.ppOpenBioEditor = function () {
    if (!isSelfName(_ppTarget)) return;
    const ed = document.getElementById('ppBioEditor');
    const wrap = document.getElementById('ppBioWrap');
    const ta = document.getElementById('ppBioText');
    if (!ed || !ta) return;
    ta.value = _ppBioCurrent || '';
    bioMsg('');
    bioCount();
    if (wrap) wrap.style.display = 'none';
    ed.style.display = 'block';
    ta.focus();
  };
  function closeBioEditor() {
    const ed = document.getElementById('ppBioEditor');
    const wrap = document.getElementById('ppBioWrap');
    if (ed) ed.style.display = 'none';
    if (wrap) wrap.style.display = 'block';
  }
  window.ppSaveBio = function () {
    const ta = document.getElementById('ppBioText');
    const btn = document.getElementById('ppBioSave');
    if (!ta) return;
    if (btn) btn.disabled = true;
    bioMsg('Transmitting\u2026', '#5f8f74');
    const token = ppToken();
    fetch('/api/profile/bio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
      body: JSON.stringify({ bio: ta.value, token })
    }).then(r => r.json()).then(function (res) {
      if (btn) btn.disabled = false;
      if (!res || !res.ok) {
        if (res && res.error === 'cooldown') bioMsg('Too fast. Wait ' + (res.seconds || 20) + 's.', '#c08a44');
        else if (res && res.error === 'too_long') bioMsg('Too long.', '#c08a44');
        else if (res && res.error === 'dunced') bioMsg('Your account cannot edit its profile.', '#a85555');
        else bioMsg('Could not save.', '#a85555');
        return;
      }
      _ppBioCurrent = res.bio || '';
      const bioEl = document.getElementById('ppBio');
      const wrap  = document.getElementById('ppBioWrap');
      if (bioEl) {
        if (_ppBioCurrent) { bioEl.textContent = _ppBioCurrent; bioEl.style.color = '#c7d8c9'; bioEl.style.fontStyle = ''; }
        else { bioEl.textContent = 'No transmission on file. Write one.'; bioEl.style.color = '#5f8f74'; bioEl.style.fontStyle = 'italic'; }
      }
      if (wrap) wrap.style.display = 'block';
      closeBioEditor();
      if (window.showToast) window.showToast(res.filtered ? 'Saved, with terms censored' : 'Profile updated', res.filtered ? '#f0b454' : '#42ff7e', 2500);
    }).catch(function () {
      if (btn) btn.disabled = false;
      bioMsg('Network error.', '#a85555');
    });
  };

  window.ppAdminClearBio = function () {
    if (!_ppTarget || !window.__isAdmin_g) return;
    if (!confirm('Clear ' + _ppTarget + "'s bio?")) return;
    const token = ppToken();
    const name = _ppTarget;
    fetch('/api/profile/bio/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
      body: JSON.stringify({ name, token })
    }).then(r => r.json()).then(function (res) {
      if (res && res.ok) {
        _ppBioCurrent = '';
        const bioEl = document.getElementById('ppBio');
        const wrap  = document.getElementById('ppBioWrap');
        if (bioEl) bioEl.textContent = '';
        if (wrap) wrap.style.display = 'none';
        if (window.showToast) window.showToast('Bio cleared', '#42ff7e', 2000);
      } else if (window.showToast) window.showToast('Could not clear bio', '#ff6a6a', 2500);
    }).catch(function () {});
  };

  // Wire the profile controls once the DOM node exists.
  function wireProfileControls() {
    const edit = document.getElementById('ppEditBtn');
    const port = document.getElementById('ppPortraitBtn');
    const save = document.getElementById('ppBioSave');
    const cancel = document.getElementById('ppBioCancel');
    const ta = document.getElementById('ppBioText');
    if (edit && !edit._wired) { edit._wired = 1; edit.className = 'pp-btn pp-btn-go'; edit.onclick = function (e) { e.stopPropagation(); window.ppOpenBioEditor(); }; }
    if (port && !port._wired) { port._wired = 1; port.className = 'pp-btn'; port.onclick = function (e) { e.stopPropagation(); window.openPortraitPicker && window.openPortraitPicker(); }; }
    if (save && !save._wired) { save._wired = 1; save.className = 'pp-btn pp-btn-go'; save.onclick = function (e) { e.stopPropagation(); window.ppSaveBio(); }; }
    if (cancel && !cancel._wired) { cancel._wired = 1; cancel.className = 'pp-btn'; cancel.onclick = function (e) { e.stopPropagation(); closeBioEditor(); }; }
    if (ta && !ta._wired) { ta._wired = 1; ta.addEventListener('input', bioCount); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireProfileControls);
  else wireProfileControls();

  window.ppShowItemDetail = function(slot) {
    const item  = window._ppSlotData && window._ppSlotData[slot];
    if (!item) return;
    const rc  = (window._ppRarityC||{})[item.rarity]  || '#888';
    const rbg = (window._ppRarityBG||{})[item.rarity] || '#0a0303';
    const label = (window._ppSlotLabel||{})[slot] || slot;
    // Remove any existing detail card
    const old = document.getElementById('ppDetailCard');
    if (old) old.remove();
    // Build detail card
    const card = document.createElement('div');
    card.id = 'ppDetailCard';
    card.style.cssText = `position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);
      background:#060303;border:1px solid ${rc};border-radius:8px;padding:10px 12px;
      min-width:160px;max-width:220px;text-align:center;z-index:10600;
      box-shadow:0 4px 20px #000c,0 0 12px ${rc}33;font-family:inherit;pointer-events:none`;
    card.innerHTML = `
      <div style="font-size:.55rem;color:${rc};letter-spacing:.12em;text-transform:uppercase;opacity:.7;margin-bottom:6px">${label}</div>
      ${item.img ? `<img src="${item.img}" style="width:56px;height:56px;image-rendering:pixelated;display:block;margin:0 auto 8px">` : ''}
      <div style="font-size:.82rem;font-weight:700;color:${rc};margin-bottom:3px">${item.name}</div>
      <div style="font-size:.62rem;color:${rc};opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">${item.rarity}</div>
      ${item.passive ? `<div style="font-size:.68rem;color:#86ff6a">+${item.passive} \u0192/30min</div>` : ''}
    `;
    // Anchor to the cell inside the card. The card is position:relative inside
    // the flex overlay; do NOT force it to position:fixed here or it drops out
    // of the overlay's centering. (The old cursor-anchored popup did that.)
    const popup = document.getElementById('playerProfilePopup');
    if (!popup) return;
    const cell = popup.querySelector(`[data-slot="${slot}"]`);
    if (cell) {
      cell.style.position = 'relative';
      cell.appendChild(card);
    }
    // Auto-dismiss after 3s or on next click anywhere
    const dismiss = (e) => { if (!card.contains(e.target)) { card.remove(); document.removeEventListener('click', dismiss, true); } };
    setTimeout(() => document.addEventListener('click', dismiss, true), 10);
    setTimeout(() => { card.remove(); }, 3500);
  };

  window.closePlayerProfile = function() {
    showModal(false);
    const card = document.getElementById('ppDetailCard');
    if (card) card.remove();
    const ed = document.getElementById('ppBioEditor');
    if (ed) ed.style.display = 'none';
    _ppTarget = null;
    _ppBioCurrent = '';
  };

  window.ppAdmin = function(cmd) {
    if (!_ppTarget || !window._ws) return;
    const payload = {type:'admin_cmd', cmd, targetName:_ppTarget, reason:'', minutes:10};
    try { window._ws.send(JSON.stringify(payload)); closePlayerProfile(); } catch(_) {}
  };

  // Backdrop click closes. The listener is on the overlay rather than document
  // so the portrait picker (its own overlay at a higher z-index) does not read
  // as an outside click and close the profile out from under itself.
  (function () {
    function bind() {
      const ov = document.getElementById('ppOverlay');
      if (!ov || ov._wired) return;
      ov._wired = 1;
      ov.addEventListener('click', function (e) { if (e.target === ov) closePlayerProfile(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  })();
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    const ov = document.getElementById('ppOverlay');
    if (!ov || ov.style.display === 'none') return;
    // The portrait picker sits above the profile; Escape peels one layer only.
    if (document.getElementById('portraitPickerOverlay')) return;
    closePlayerProfile();
  });

  // ── Portrait picker ──────────────────────────────────────────────────────
  // Gated portraits: selectable only while the required item is equipped (the
  // server enforces this). Art is item art served from the web root, not the
  // portraits dir. Keep this in sync with server GATED_PORTRAITS.
  window.FM_GATED_PORTRAITS = window.FM_GATED_PORTRAITS || {
    jarred_brain: { img: 'item:jarred_brain', name: 'Preserved Brain', requiresItem: 'jarred_brain' }
  };
  // Resolve any portrait id to an <img src>/background url.
  //   gated id     -> resolve its configured img
  //   'item:<id>'  -> that item's image from the client catalog (data URI art)
  //   'data:...'   -> used as-is
  //   real path    -> as-is; bare stem -> the portraits dir
  window.FMPortraitSrc = function (id) {
    function resolve(s) {
      s = String(s || '');
      if (!s) return '';
      if (/^data:/.test(s)) return s;
      var m = /^item:(.+)$/.exec(s);
      if (m) { var it = (window.ITEM_CATALOG_CLIENT || {})[m[1]]; return (it && it.img) || ''; }
      if (/[./]/.test(s)) return s.replace(/[^a-z0-9_./-]/gi, '');
      return 'assets/portraits/' + s.replace(/[^a-z0-9_]/gi, '') + '.png';
    }
    var g = window.FM_GATED_PORTRAITS[id];
    return resolve(g ? g.img : id);
  };
  // Item-backed portraits are low-res pixel art; render nearest-neighbor so they
  // stay crisp when scaled up. Full-res portraits-dir images are left smooth.
  window.FMPortraitPixelated = function (id) {
    var g = window.FM_GATED_PORTRAITS[id];
    var s = g ? g.img : id;
    return /^item:/.test(String(s)) || /^data:/.test(String(s));
  };

  // True when resolving this portrait needs the lazy-loaded item catalog.
  window.FMPortraitNeedsCatalog = function (id) {
    var g = window.FM_GATED_PORTRAITS[id];
    return /^item:/.test(String(g ? g.img : id || ''));
  };

  window.FMHeaderPortrait = function (pid) {
    const el = document.getElementById('fm-header-portrait');
    if (!el) return;
    var g = pid && window.FM_GATED_PORTRAITS[pid];
    var needsCat = /^item:/.test(String(g ? g.img : pid || ''));
    if (needsCat && !window.ITEM_CATALOG_CLIENT && window.lazyLoad) {
      window.lazyLoad('assets/inventory.js', function () { window.FMHeaderPortrait(pid); });
      return;
    }
    el.style.display = 'inline-flex';
    el.style.imageRendering = window.FMPortraitPixelated(pid) ? 'pixelated' : '';
    const src = window.FMPortraitSrc(pid);
    if (src) { el.style.backgroundImage = "url('" + src + "')"; el.textContent = ''; }
    else { el.style.backgroundImage = 'none'; el.textContent = '\uFF0B'; }
  };

  function savePortrait(id) {
    const token = window.FM_TOKEN || (window.ME && window.ME.token) || '';
    fetch('/api/portrait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
      body: JSON.stringify({ portrait: id, token })
    }).then(r => r.json()).then(function (res) {
      if (!res || !res.ok) {
        if (res && res.error === 'portrait_locked' && window.showToast) window.showToast('Equip the item to use that portrait', '#f0b454', 3000);
        return;
      }
      if (window.ME) window.ME.portrait = res.portrait;
      if (window.FMHeaderPortrait) window.FMHeaderPortrait(res.portrait);
      const ov = document.getElementById('portraitPickerOverlay'); if (ov) ov.remove();
      const portEl = document.getElementById('ppPortrait');
      if (portEl) {
        if (res.portrait) { portEl.src = window.FMPortraitSrc(res.portrait); portEl.style.imageRendering = window.FMPortraitPixelated(res.portrait) ? 'pixelated' : ''; portEl.style.display = 'block'; }
        else { portEl.style.display = 'none'; }
      }
      if (window.showToast) window.showToast(res.portrait ? 'Portrait updated' : 'Portrait removed', '#42ff7e', 2500);
    }).catch(function () {});
  }

  window.openPortraitPicker = function () {
    if (!window.FM_PORTRAITS) return;
    const token = window.FM_TOKEN || (window.ME && window.ME.token) || '';
    // Which gated portraits are unlocked right now (required item equipped)?
    fetch('/api/items/inventory', { headers: token ? { 'x-auth-token': token } : {} })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var unlocked = [];
        try {
          if (data && data.ok) {
            var eqIds = Object.values(data.equipped || {}).filter(Boolean);
            var equippedItems = (data.inventory || []).filter(function (it) { return eqIds.indexOf(it.invId) >= 0; }).map(function (it) { return it.itemId; });
            Object.keys(window.FM_GATED_PORTRAITS).forEach(function (pid) {
              if (equippedItems.indexOf(window.FM_GATED_PORTRAITS[pid].requiresItem) >= 0) unlocked.push(pid);
            });
          }
        } catch (_) {}
        var needCat = unlocked.some(function (pid) { var g = window.FM_GATED_PORTRAITS[pid]; return g && /^item:/.test(String(g.img)); });
        if (needCat && !window.ITEM_CATALOG_CLIENT && window.lazyLoad) window.lazyLoad('assets/inventory.js', function () { buildPortraitPicker(unlocked); });
        else buildPortraitPicker(unlocked);
      })
      .catch(function () { buildPortraitPicker([]); });
  };

  function buildPortraitPicker(unlocked) {
    const old = document.getElementById('portraitPickerOverlay'); if (old) old.remove();
    const cur = (window.ME && window.ME.portrait) ? window.ME.portrait : '';
    const ov = document.createElement('div');
    ov.id = 'portraitPickerOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:11000;background:#000a;display:flex;align-items:center;justify-content:center;font-family:inherit';
    let h = '<div style="background:#060f0b;border:1px solid #1c3a30;border-radius:10px;max-width:560px;width:92%;max-height:82vh;overflow:auto;box-shadow:0 10px 40px #000c">';
    h += '<div style="position:sticky;top:0;background:#08120d;border-bottom:1px solid #1c3a30;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;z-index:2">';
    h += '<style>@keyframes ppCreditGlow{0%,100%{text-shadow:0 0 5px #42ff7e,0 0 10px #42ff7e66}50%{text-shadow:0 0 10px #6dffa0,0 0 20px #42ff7eaa}}.pp-credit{color:#6dffa0;font-size:.58rem;letter-spacing:.08em;text-decoration:none;display:inline;margin-left:6px;font-weight:600;text-transform:none;animation:ppCreditGlow 2.2s ease-in-out infinite}.pp-credit:hover{color:#bfffd6}</style>';
    h += '<div><div style="color:#42ff7e;letter-spacing:.16em;font-size:.8rem;text-transform:uppercase">Select Portrait</div></div>';
    h += '<button id="ppPickClose" style="background:none;border:none;color:#5f8f74;font-size:1rem;cursor:pointer">✕</button></div>';
    h += '<div style="padding:14px 16px">';
    h += '<button id="ppPickClear" style="background:transparent;border:1px solid #3a2a2a;color:#c7a9a9;border-radius:4px;padding:5px 12px;font:inherit;font-size:.62rem;cursor:pointer;margin-bottom:12px;letter-spacing:.1em">REMOVE PORTRAIT</button>';
    if (unlocked && unlocked.length) {
      h += '<div style="color:#f0b454;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;margin:6px 0 7px">Equipped Unlocks</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px;margin-bottom:14px">';
      unlocked.forEach(function (pid) {
        const sel = pid === cur;
        const g = window.FM_GATED_PORTRAITS[pid] || {};
        h += '<img class="pp-pick" data-id="' + pid + '" title="' + (g.name || '') + '" src="' + window.FMPortraitSrc(pid) + '" alt="" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;image-rendering:pixelated;border-radius:6px;cursor:pointer;border:2px solid ' + (sel ? '#f0b454' : '#3a2f1a') + ';box-shadow:' + (sel ? '0 0 8px #f0b45488' : 'none') + '">';
      });
      h += '</div>';
    }
    // Credit sits on the GROUP, not on the modal. The set has more than one artist
    // in it now, so a single header line would attribute all of them to whoever
    // happened to be first. A group with no credit entry renders none.
    var creditMap = window.FM_PORTRAITS.credits || {};
    function ppEsc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function ppUrl(s) { return /^https?:\/\//i.test(String(s || '')) ? ppEsc(s) : '#'; }
    window.FM_PORTRAITS.groups.forEach(function (g) {
      var cr = creditMap[g[0]];
      h += '<div style="color:#5f8f74;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;margin:6px 0 7px">' + ppEsc(g[0])
        + (cr && cr.name ? ' <a class="pp-credit" href="' + ppUrl(cr.url) + '" target="_blank" rel="noopener noreferrer">art by ' + ppEsc(cr.name) + ' \u2197</a>' : '')
        + '</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px;margin-bottom:14px">';
      g[1].forEach(function (id) {
        const sel = id === cur;
        h += '<img class="pp-pick" data-id="' + id + '" src="' + window.FMPortraitSrc(id) + '" alt="" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ' + (sel ? '#42ff7e' : 'transparent') + ';box-shadow:' + (sel ? '0 0 8px #42ff7e88' : 'none') + '">';
      });
      h += '</div>';
    });
    h += '</div></div>';
    ov.innerHTML = h;
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('#ppPickClose').onclick = function () { ov.remove(); };
    ov.querySelector('#ppPickClear').onclick = function () { savePortrait(''); };
    ov.querySelectorAll('.pp-pick').forEach(function (img) { img.onclick = function () { savePortrait(img.dataset.id); }; });
  }

})();
