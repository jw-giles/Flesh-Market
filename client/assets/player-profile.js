
(function(){
  let _ppTarget = null;
  // Cache of fetched profile data
  const _ppCache = {};

  window.openPlayerProfile = async function(userName, x, y) {
    _ppTarget = userName;
    const popup = document.getElementById('playerProfilePopup');
    if (!popup) return;

    // Position popup smartly
    const pw = 280, ph = 320;
    let left = x + 10, top = y + 10;
    if (left + pw > window.innerWidth  - 10) left = x - pw - 10;
    if (top  + ph > window.innerHeight - 10) top  = y - ph - 10;
    popup.style.left = Math.max(6, left) + 'px';
    popup.style.top  = Math.max(6, top)  + 'px';
    popup.style.display = 'block';

    // Show name immediately
    document.getElementById('ppName').textContent = userName;
    document.getElementById('ppTitle').textContent = '';
    document.getElementById('ppEquipped').innerHTML = '<div style="color:#332222;font-size:.68rem;grid-column:1/-1">Loading…</div>';
    document.getElementById('ppAssets').innerHTML   = '';
    document.getElementById('ppPassive').textContent = '';
    const _ppReset = document.getElementById('ppPortrait');
    if (_ppReset) { _ppReset.style.display = 'none'; _ppReset.onclick = null; }
    const _ppcReset = document.getElementById('ppChangePortrait');
    if (_ppcReset) _ppcReset.remove();

    // Show admin bar if admin
    const adminBar = document.getElementById('ppAdminBar');
    if (adminBar) adminBar.style.display = window.__isAdmin_g ? 'block' : 'none';

    // Fetch profile
    try {
      const token = window.FM_TOKEN || window.ME?.token || '';
      const r = await fetch(`/api/items/profile/${encodeURIComponent(userName)}${token?'?token='+token:''}`);
      const d = await r.json();
      if (!d.ok) { document.getElementById('ppEquipped').innerHTML = '<div style="color:#332222;font-size:.68rem;grid-column:1/-1">No items equipped.</div>'; return; }

      renderProfilePopup(d);
    } catch(e) {
      document.getElementById('ppEquipped').innerHTML = '<div style="color:#443333;font-size:.68rem;grid-column:1/-1">Could not load.</div>';
    }
  };

  function renderProfilePopup(d) {
    const SLOT_LABEL = window.SLOT_LABELS || {hat:'Hat',glasses:'Glasses',upperbody:'Upper Body',necklace:'Necklace',watch:'Watch',pants:'Pants',shoes:'Shoes',ring:'Ring',earring:'Earring',bracelet:'Bracelet',implant:'Implant',vehicle:'Vehicle',property:'Property'};
    const SLOT_ICONS = window.SLOT_ICONS  || {hat:'🎩',glasses:'👓',upperbody:'👕',necklace:'📿',watch:'⌚',pants:'👖',shoes:'👟',ring:'💍',earring:'✨',bracelet:'📿',implant:'🔩',vehicle:'🚗',property:'🏠'};
    const RARITY_C   = window.RARITY_COLORS || {common:'#888780',uncommon:'#1D9E75',rare:'#3B8BD4',epic:'#8B5CF6',legendary:'#ff6a00'};
    const RARITY_BG  = {common:'#1a1a1a',uncommon:'#0a1f18',rare:'#0a1220',epic:'#150e24',legendary:'#1f0e00'};
    const ITEM_CAT   = window.ITEM_CATALOG_CLIENT || {};

    const titleEl = document.getElementById('ppTitle');
    if (titleEl && d.title) titleEl.textContent = d.title;

    // Portrait avatar + self-serve change link
    const portEl = document.getElementById('ppPortrait');
    const me = (window.ME && window.ME.name) ? window.ME.name : '';
    const isSelf = me && _ppTarget && me.toLowerCase() === String(_ppTarget).toLowerCase();
    if (portEl) {
      const pid = d.portrait ? String(d.portrait) : '';
      if (pid) { portEl.src = window.FMPortraitSrc(pid); portEl.style.imageRendering = window.FMPortraitPixelated(pid) ? 'pixelated' : ''; portEl.style.display = 'block'; }
      else { portEl.style.display = 'none'; }
      if (isSelf) {
        portEl.style.cursor = 'pointer'; portEl.title = 'Change portrait';
        portEl.onclick = function (e) { e.stopPropagation(); window.openPortraitPicker(); };
        if (!document.getElementById('ppChangePortrait')) {
          const lk = document.createElement('div');
          lk.id = 'ppChangePortrait';
          lk.textContent = '✎ portrait';
          lk.style.cssText = 'font-size:.6rem;color:#5f8f74;cursor:pointer;letter-spacing:.06em;margin-top:2px';
          lk.onclick = function (e) { e.stopPropagation(); window.openPortraitPicker(); };
          if (titleEl && titleEl.parentNode) titleEl.parentNode.appendChild(lk);
        }
      }
    }

    const equippedItems = d.equipped || {};
    const allSlots = ['hat','glasses','upperbody','necklace','watch','pants','shoes','ring','earring','bracelet','implant','vehicle','property'];

    // Build lookup: slot -> enriched item (API data + client img)
    const slotData = {};
    for (const slot of allSlots) {
      const invId = equippedItems[slot];
      // inv already has name/rarity/slot spread from server's ITEM_CATALOG
      const inv   = invId ? (d.items||[]).find(i=>i.invId===invId) : null;
      if (inv) {
        // Only use img if it's a base64 data URI — bare filenames (e.g. 'flesh_suite.png')
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
    eqEl.innerHTML = clothingSlots.map(s => renderCell(s, 34)).join('');

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

    // Passive total
    const passiveEl = document.getElementById('ppPassive');
    if (passiveEl && typeof d.passiveBonus === 'number') {
      passiveEl.textContent = d.passiveBonus > 0
        ? `Item passive: +${d.passiveBonus} Ƒ/30min`
        : 'No items equipped';
    }

    // Store slot data for click handler
    window._ppSlotData = slotData;
    window._ppSlotLabel = SLOT_LABEL;
    window._ppRarityC = RARITY_C;
    window._ppRarityBG = RARITY_BG;
  }

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
      ${item.passive ? `<div style="font-size:.68rem;color:#86ff6a">+${item.passive} Ƒ/30min</div>` : ''}
    `;
    // Anchor to popup so it positions relatively
    const popup = document.getElementById('playerProfilePopup');
    popup.style.position = 'fixed'; // ensure
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
    const popup = document.getElementById('playerProfilePopup');
    if (popup) popup.style.display = 'none';
    const card = document.getElementById('ppDetailCard');
    if (card) card.remove();
    _ppTarget = null;
  };

  window.ppAdmin = function(cmd) {
    if (!_ppTarget || !window._ws) return;
    const payload = {type:'admin_cmd', cmd, targetName:_ppTarget, reason:'', minutes:10};
    try { window._ws.send(JSON.stringify(payload)); closePlayerProfile(); } catch(_) {}
  };

  // Close on outside click
  document.addEventListener('click', e => {
    const popup = document.getElementById('playerProfilePopup');
    if (popup && popup.style.display !== 'none' && !popup.contains(e.target)) {
      closePlayerProfile();
    }
  });

  // Admins: clicking username also opens profile (override mod panel to show both)
  const _origOpenMod = window.openModPanel;
  window.openModPanel = function(userName, x, y) {
    openPlayerProfile(userName, x, y);
  };

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
    h += '<style>@keyframes ppCreditGlow{0%,100%{text-shadow:0 0 5px #42ff7e,0 0 10px #42ff7e66}50%{text-shadow:0 0 10px #6dffa0,0 0 20px #42ff7eaa}}.pp-credit{color:#6dffa0;font-size:.74rem;letter-spacing:.08em;text-decoration:none;display:inline-block;margin-top:4px;font-weight:600;animation:ppCreditGlow 2.2s ease-in-out infinite}.pp-credit:hover{color:#bfffd6}</style>';
    h += '<div><div style="color:#42ff7e;letter-spacing:.16em;font-size:.8rem;text-transform:uppercase">Select Portrait</div>'
      + '<a class="pp-credit" href="https://subotai-khudozhnik.itch.io/" target="_blank" rel="noopener noreferrer">Art by subotai \u2197</a></div>';
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
    window.FM_PORTRAITS.groups.forEach(function (g) {
      h += '<div style="color:#5f8f74;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;margin:6px 0 7px">' + g[0] + '</div>';
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
