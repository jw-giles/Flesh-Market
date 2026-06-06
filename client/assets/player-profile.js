
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
      const pid = d.portrait ? String(d.portrait).replace(/[^a-z0-9_]/gi, '') : '';
      if (pid) { portEl.src = 'assets/portraits/' + pid + '.png'; portEl.style.display = 'block'; }
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
        : `<div style="font-size:.55rem;color:#2a1010;margin-top:3px">—</div>`;
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
  window.FMHeaderPortrait = function (pid) {
    const el = document.getElementById('fm-header-portrait');
    if (!el) return;
    el.style.display = 'inline-flex';
    const id = String(pid || '').replace(/[^a-z0-9_]/gi, '');
    if (id) { el.style.backgroundImage = "url('assets/portraits/" + id + ".png')"; el.textContent = ''; }
    else { el.style.backgroundImage = 'none'; el.textContent = '\uFF0B'; }
  };

  function savePortrait(id) {
    const token = window.FM_TOKEN || (window.ME && window.ME.token) || '';
    fetch('/api/portrait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-auth-token': token } : {}) },
      body: JSON.stringify({ portrait: id, token })
    }).then(r => r.json()).then(function (res) {
      if (!res || !res.ok) return;
      if (window.ME) window.ME.portrait = res.portrait;
      if (window.FMHeaderPortrait) window.FMHeaderPortrait(res.portrait);
      const ov = document.getElementById('portraitPickerOverlay'); if (ov) ov.remove();
      const portEl = document.getElementById('ppPortrait');
      if (portEl) {
        if (res.portrait) { portEl.src = 'assets/portraits/' + res.portrait + '.png'; portEl.style.display = 'block'; }
        else { portEl.style.display = 'none'; }
      }
      if (window.showToast) window.showToast(res.portrait ? 'Portrait updated' : 'Portrait removed', '#42ff7e', 2500);
    }).catch(function () {});
  }

  window.openPortraitPicker = function () {
    if (!window.FM_PORTRAITS) return;
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
    window.FM_PORTRAITS.groups.forEach(function (g) {
      h += '<div style="color:#5f8f74;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;margin:6px 0 7px">' + g[0] + '</div>';
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(62px,1fr));gap:8px;margin-bottom:14px">';
      g[1].forEach(function (id) {
        const sel = id === cur;
        h += '<img class="pp-pick" data-id="' + id + '" src="assets/portraits/' + id + '.png" alt="" loading="lazy" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid ' + (sel ? '#42ff7e' : 'transparent') + ';box-shadow:' + (sel ? '0 0 8px #42ff7e88' : 'none') + '">';
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
  };

})();
