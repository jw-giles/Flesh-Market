/* Ƒbay TITLE category - collectible custom titles traded inside the existing Ƒbay
   (inventory marketplace). Selecting the "Titles" slot filter swaps the Ƒbay listings
   area to titles and routes the +List form to titles. Ownership and payment are handled
   server-side atomically. No em dashes in any player-visible string. */
(function () {
  let listings = [];   // all active title listings (global)
  let mine = [];       // my active title listings
  let myGifted = [];   // [{label,color,badge,rarity}] titles I hold

  const RAR = {
    common:    { c: '#9aa0a6', n: 'Common' },
    uncommon:  { c: '#62c462', n: 'Uncommon' },
    rare:      { c: '#5b9bff', n: 'Rare' },
    epic:      { c: '#b06bff', n: 'Epic' },
    legendary: { c: '#ffce4d', n: 'Legendary' },
    custom:    { c: '#7fc090', n: 'Custom' },
  };
  const rar = (r) => RAR[r] || RAR.custom;
  const RORD = { common:1, uncommon:2, rare:3, epic:4, legendary:5, custom:0 };

  function send(obj) { try { if (window._ws && window._ws.readyState === 1) window._ws.send(JSON.stringify(obj)); } catch (_) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function isMode() { return (document.getElementById('mktFilterSlot') && document.getElementById('mktFilterSlot').value) === '__titles__'; }

  function filterSort(arr) {
    const rarityF = (document.getElementById('mktFilterRarity') || {}).value || '';
    const sortBy = (document.getElementById('mktSortBy') || {}).value || 'newest';
    let f = arr.slice();
    if (rarityF) f = f.filter(l => (l.rarity || '') === rarityF);
    f.sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'rarity') return (RORD[b.rarity] || 0) - (RORD[a.rarity] || 0);
      return (b.listed_at || 0) - (a.listed_at || 0);
    });
    return f;
  }

  function row(l, isMine) {
    const r = rar(l.rarity);
    const ico = l.badge ? esc(l.badge) : '👑';
    const btn = isMine
      ? `<button onclick="cancelTitleFb('${esc(l.id)}')" style="font-size:.62rem;background:none;border:1px solid #553333;color:#884444;padding:2px 7px;border-radius:3px;cursor:pointer;font-family:inherit;margin-top:3px">Cancel</button>`
      : `<button onclick="buyTitleFb('${esc(l.id)}')" style="font-size:.62rem;background:#0d0505;border:1px solid #ff6a0044;color:#ff9900;padding:2px 7px;border-radius:3px;cursor:pointer;font-family:inherit;margin-top:3px">Buy</button>`;
    return `<div class="market-row">
      <span style="width:32px;height:32px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem">${ico}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.78rem;color:${l.color || '#7fc090'};font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.label)}</div>
        <div style="font-size:.63rem;color:${r.c}">${r.n.toUpperCase()} · TITLE${isMine ? '' : ' · ' + esc(l.seller || 'Unknown')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:.85rem;color:#ff9900;font-weight:500">Ƒ${(l.price || 0).toLocaleString()}</div>
        ${btn}
      </div>
    </div>`;
  }

  window.TitleMarket = {
    isMode: isMode,
    requestData: function () { send({ type: 'title_listings' }); send({ type: 'get_titles' }); },
    render: function (targetId) {
      const el = document.getElementById(targetId || 'marketListings'); if (!el) return;
      const mineIds = new Set(mine.map(m => m.id));
      const forSale = filterSort(listings.filter(l => !mineIds.has(l.id)));
      let html = '';
      html += forSale.length
        ? forSale.map(l => row(l, false)).join('')
        : '<div style="color:#443333;font-size:.73rem;padding:8px">No titles listed. List one with + List, or check back later.</div>';
      if (mine.length) {
        html += '<div style="font-size:.62rem;color:#553333;letter-spacing:.1em;text-transform:uppercase;margin:12px 0 4px">Your listings</div>';
        html += mine.map(l => row(l, true)).join('');
      }
      el.innerHTML = html;
    },
    populateListSelect: function (selId) {
      const sel = document.getElementById(selId || 'listInvSelect'); if (!sel) return;
      const listed = new Set(mine.map(m => m.label));
      const sellable = myGifted.filter(g => !listed.has(g.label));
      sel.innerHTML = sellable.length
        ? sellable.map(g => `<option value="${esc(g.label)}">[${rar(g.rarity).n.toUpperCase()}] ${g.badge ? esc(g.badge) + ' ' : ''}${esc(g.label)}</option>`).join('')
        : '<option value="">No titles available to list</option>';
    },
    submitListing: function () {
      const label = (document.getElementById('listInvSelect') || {}).value || '';
      const price = parseFloat((document.getElementById('listPrice') || {}).value);
      if (!label) { try { showToast('Select a title', '#ff9900'); } catch (_) {} return; }
      if (!price || price <= 0) { try { showToast('Enter a valid price', '#ff9900'); } catch (_) {} return; }
      send({ type: 'list_title', label: label, price: Math.floor(price) });
      const f = document.getElementById('listForm'); if (f) f.style.display = 'none';
    },
  };

  window.buyTitleFb = function (id) { if (id && confirm('Buy this title?')) send({ type: 'buy_title_listing', listing: id }); };
  window.cancelTitleFb = function (id) { if (id) send({ type: 'cancel_title_listing', listing: id }); };

  document.addEventListener('fm_ws_msg', function (e) {
    const msg = e.detail; if (!msg) return;
    if (msg.type === 'title_listings') {
      const d = msg.data || {};
      if (Array.isArray(d.listings)) listings = d.listings;
      if (Array.isArray(d.mine)) mine = d.mine;
      if (isMode()) window.TitleMarket.render('marketListings');
    }
    if (msg.type === 'title_state' || msg.type === 'title_updated') {
      const d = msg.data || {};
      if (Array.isArray(d.gifted)) myGifted = d.gifted;
      if (isMode()) { window.TitleMarket.render('marketListings'); window.TitleMarket.populateListSelect('listInvSelect'); }
    }
  });
})();
