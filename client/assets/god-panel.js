
(function(){
  let __godVisible = false;
  let __godActiveTab = 'economy';

  window.toggleGodPanel = function() {
    const panel = document.getElementById('godPanel');
    __godVisible = !__godVisible;
    panel.style.display = __godVisible ? 'flex' : 'none';
    if (__godVisible) {
      refreshGodTickers();
      godFillItemSelect();
      document.getElementById('godStatusDot').style.background = '#86ff6a';
    }
  };

  // ── Spawn list ────────────────────────────────────────────────────────────
  // Built from ITEM_CATALOG_CLIENT, which is a complete mirror of the server's
  // ITEM_CATALOG. It used to be a hand-written list of option tags in
  // index.html and it had fallen 50 items behind: the entire "new pack" of
  // necklaces, hats, tops, trousers and shoes could not be spawned at all, and
  // nobody would find out until they went looking for a specific item. Every
  // item added from here on appears without anyone remembering to add it.
  const __GOD_RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, phantom: 5 };
  let __godItemsFilled = false;

  function godFillItemSelect() {
    if (__godItemsFilled) return;
    const sel = document.getElementById('god-item-select');
    if (!sel) return;
    const cat = window.ITEM_CATALOG_CLIENT;
    // inventory.js is lazy loaded, so on a fresh session the catalog may not be
    // here yet. Pull it, then come back; the select shows its loading option in
    // the meantime rather than an empty box.
    if (!cat) {
      if (window.lazyLoad) window.lazyLoad('assets/inventory.js', function () { godFillItemSelect(); });
      return;
    }
    const SLOT_LABEL = window.SLOT_LABELS || {};
    const bySlot = {};
    for (const id of Object.keys(cat)) {
      const it = cat[id];
      if (!it || !it.slot) continue;
      (bySlot[it.slot] = bySlot[it.slot] || []).push(it);
    }
    // SLOT_LABELS is declared in the same order as ITEM_SLOTS on the server, so
    // its key order is the canonical slot order and there is no second list to
    // keep in sync. Any slot the labels miss still renders, appended after.
    const labelled = Object.keys(SLOT_LABEL);
    const slots = labelled.concat(Object.keys(bySlot).filter(function (s) { return labelled.indexOf(s) < 0; }));
    let html = '';
    for (const slot of slots) {
      const list = bySlot[slot];
      if (!list || !list.length) continue;
      list.sort(function (a, b) {
        const d = (__GOD_RARITY_ORDER[a.rarity] || 0) - (__GOD_RARITY_ORDER[b.rarity] || 0);
        return d || String(a.name || '').localeCompare(String(b.name || ''));
      });
      html += '<optgroup label="' + godEsc('\u2500\u2500 ' + (SLOT_LABEL[slot] || slot) + ' \u2500\u2500') + '">';
      for (const it of list) {
        const r = String(it.rarity || '');
        const label = (it.name || it.id) + ' (' + (r ? r.charAt(0).toUpperCase() + r.slice(1) : '?') + ')'
          // Phantom items are 1:1 unique and rollItemDrop filters out ones already
          // owned. Handing one out from here bypasses that check, so the option is
          // listed but marked, rather than hidden from an admin who may want it.
          + (r === 'phantom' ? ' \u26a0 UNIQUE' : '');
        html += '<option value="' + godEsc(it.id) + '">' + godEsc(label) + '</option>';
      }
      html += '</optgroup>';
    }
    if (!html) return;
    sel.innerHTML = html;
    __godItemsFilled = true;
  }

  function godEsc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.godTab = function(tab) {
    __godActiveTab = tab;
    document.querySelectorAll('.god-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.god-tab-content').forEach(d => {
      d.style.display = d.id === `godTab-${tab}` ? 'block' : 'none';
    });
    if (tab === 'market') refreshGodTickers();
    if (tab === 'players') godListAll();
    if (tab === 'comms') godCommsRefresh();
    if (tab === 'control') godGatesRefresh();
    if (tab === 'reach') godCmd({ cmd:'reach_get' });
    /* THE SAME FETCH AS THE REACH TAB, on purpose. Both tabs render from one
       payload, so asking for it is the only thing opening either of them needs
       to do, and there is no second endpoint to keep in step. If the payload has
       already arrived, render immediately rather than waiting for the round
       trip: the tab is otherwise blank for as long as the socket takes. */
    if (tab === 'war') {
      godWarsRefresh();
      godCmd({ cmd:'reach_get' });
      if (window._REACH && window.warRender) window.warRender(window._REACH);
    }
  };

  function godFeedback(msg, color) {
    const el = document.getElementById('god-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#86ff6a';
    clearTimeout(el.__t);
    el.__t = setTimeout(() => { if(el.textContent === msg) el.textContent = ''; }, 4000);
  }

  function godSend(payload) {
    // window._ws is a RAW socket reference that core.js only refreshes inside
    // onmessage. After any reconnect it points at the previous, closed socket,
    // so readyState is 3 and every god command reports "Not connected" while
    // the client is perfectly connected. window.ws is the shim the rest of the
    // client sends through: it always resolves the live socket and queues if
    // the connection has not opened yet.
    const body = JSON.stringify({ type: 'god_cmd', ...payload });
    if (window.ws && typeof window.ws.send === 'function') { window.ws.send(body); return; }
    if (window._ws && window._ws.readyState === 1) { window._ws.send(body); return; }
    godFeedback('✗ Not connected', '#ff6b6b');
  }
  window.godCmd = godSend; // expose for new god functions outside IIFE

  function getGodTarget() {
    return document.getElementById('god-player-input')?.value?.trim() || '';
  }

  // ── Economy Tab ──────────────────────────────────────────────────────────
  window.godPlayerSearch = function(val) {
    // Live-update the lookup as user types (debounced)
    clearTimeout(window.__godSearchTimer);
    if (!val || val.length < 2) return;
    window.__godSearchTimer = setTimeout(() => godSend({ cmd: 'player_info', targetName: val.trim() }), 400);
  };
  window.godLookup = function() {
    const name = getGodTarget();
    if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
    godSend({ cmd: 'player_info', targetName: name });
  };
  window.godPlayerActivity = function() {
    const name = getGodTarget();
    if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
    godSend({ cmd: 'player_activity', targetName: name });
  };
  window.godQuickCash = function(amount) {
    const name = getGodTarget();
    if (!name) { godFeedback('Enter a player name first', '#ff9900'); return; }
    godSend({ cmd: 'give_cash', targetName: name, amount });
  };
  window.godGiveCash = function() {
    const name = getGodTarget();
    const amount = Number(document.getElementById('god-cash-amount')?.value);
    if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
    if (!isFinite(amount)) { godFeedback('Invalid amount', '#ff6b6b'); return; }
    godSend({ cmd: 'give_cash', targetName: name, amount });
  };
  window.godGiveHoldings = function() {
    const name = getGodTarget();
    const sym  = document.getElementById('god-holding-sym')?.value?.trim().toUpperCase();
    const qty  = Number(document.getElementById('god-holding-qty')?.value);
    if (!name || !sym) { godFeedback('Enter player name and ticker', '#ff9900'); return; }
    godSend({ cmd: 'give_holdings', targetName: name, symbol: sym, qty });
  };
  window.godSetPatreon = function(tier) {
    const name = getGodTarget();
    if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
    godSend({ cmd: 'set_patreon', targetName: name, tier });
  };
  window.godSetXP = function() {
    const name = getGodTarget();
    const xp = Number(document.getElementById('god-xp-amount')?.value);
    if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
    godSend({ cmd: 'set_xp', targetName: name, xp });
  };

  // ── Market Tab ───────────────────────────────────────────────────────────
  window.godSetPrice = function() {
    const sym   = document.getElementById('god-price-sym')?.value?.trim().toUpperCase();
    const price = Number(document.getElementById('god-price-val')?.value);
    if (!sym || !price) { godFeedback('Enter symbol and price', '#ff9900'); return; }
    godSend({ cmd: 'set_price', symbol: sym, price });
  };
  window.godMarketEvent = function(direction) {
    const pct = Number(document.getElementById('god-market-mag')?.value || 5);
    if (direction === 'crash' && !confirm(`Crash ALL tickers by ~${pct}%? This cannot be undone.`)) return;
    godSend({ cmd: 'market_event', direction, pct });
  };

  function refreshGodTickers() {
    if (__godActiveTab !== 'market' && __godActiveTab !== 'all') return;
    const el = document.getElementById('god-ticker-list');
    if (!el) return;
    // Get companies from global state if available
    const comps = window.__companies_g || [];
    if (!comps.length) { el.innerHTML = '<div style="color:#666;padding:6px">Waiting for market data…</div>'; return; }
    el.innerHTML = comps.filter(c => !c._special).map(c => `
      <div class="god-ticker-row" onclick="godQuickSetPrice('${c.symbol}', ${c.price.toFixed(2)})">
        <span style="color:#ff9900;font-weight:600;width:48px">${c.symbol}</span>
        <span style="color:#888;flex:1;font-size:.7rem">${c.name ? c.name.slice(0,20) : ''}</span>
        <span style="color:#7fc090">$${c.price.toFixed(2)}</span>
        <span style="color:#555;font-size:.65rem;margin-left:6px">✏</span>
      </div>
    `).join('');
  }
  window.godQuickSetPrice = function(sym, currentPrice) {
    const p = prompt(`Set price for ${sym} (current: $${currentPrice}):`, currentPrice);
    if (p === null || p === '') return;
    const price = Number(p);
    if (!isFinite(price) || price <= 0) { godFeedback('Invalid price', '#ff6b6b'); return; }
    document.getElementById('god-price-sym').value = sym;
    document.getElementById('god-price-val').value = price;
    godSend({ cmd: 'set_price', symbol: sym, price });
  };

  // ── News Tab ─────────────────────────────────────────────────────────────
  window.godInjectNews = function() {
    const text = document.getElementById('god-news-text')?.value?.trim();
    const tone = document.getElementById('god-news-tone')?.value || 'neutral';
    const sym  = document.getElementById('god-news-sym')?.value?.trim().toUpperCase() || null;
    if (!text) { godFeedback('Enter headline text', '#ff9900'); return; }
    godSend({ cmd: 'inject_news', text, tone, symbol: sym || undefined });
    document.getElementById('god-news-text').value = '';
  };
  window.godBreakingNews = function(mode) {
    if (mode === 'custom') {
      const text = document.getElementById('god-breaking-text')?.value?.trim();
      const tone = document.getElementById('god-breaking-tone')?.value || 'bad';
      if (!text) { godFeedback('Enter breaking news text', '#ff9900'); return; }
      godSend({ cmd: 'breaking_news', mode: 'custom', text, tone });
    } else {
      godSend({ cmd: 'breaking_news', mode: 'default' });
    }
  };
  window.godPresetNews = function(preset) {
    // Colony-specific battle news: pick a random colony name for context
    const colonies = [
      'New Anchor','Cascade Station','Frontier Outpost','The Hollow',
      'Vein Cluster','Aurora Prime','Null Point','Gluttonis','Lustandia',
      'Limbosis','Iron Shelf','Signal Run','The Ledger','Dust Basin','Nova Reach',
      'Scrub Yard','The Escrow','Margin Call'
    ];
    const factions = ['Coalition forces','Syndicate operatives','Void Collective units','Merchant Guild enforcers'];
    const col  = () => colonies[Math.floor(Math.random()*colonies.length)];
    const fac  = () => factions[Math.floor(Math.random()*factions.length)];
    const fac2 = () => factions[Math.floor(Math.random()*factions.length)];

    const presets = {
      // ── Market Events ──────────────────────────────────────────────────
      crash:    { text: '⚠ MARKET ALERT: Emergency session convened as multiple sectors collapse, sell orders flooding exchanges across all colonial markets', tone: 'bad' },
      boom:     { text: '🚀 ECONOMIC BOOM: Record GDP growth sparks broad market rally, Coalition treasury announces surplus for first time in eight years', tone: 'good' },
      raid:     { text: '🚔 ENFORCEMENT RAID: Authority units breach facility, trading suspended pending audit, suspect accounts frozen', tone: 'bad' },
      blackout: { text: '⚡ GRID BLACKOUT: Rolling power outages disrupt operations across the sector, WraithEnergy and Aurora Electric scramble response teams', tone: 'neutral' },

      // ── Colony Battle Events ────────────────────────────────────────────
      battle_start: {
        text: () => `⚔ COLONY CONFLICT: ${fac()} mobilise at ${col()}, faction war declared, control percentages updating in real time`,
        tone: 'bad'
      },
      battle_won: {
        text: () => { const c=col(); const f=fac(); return `🏴 COLONY SEIZED: ${f} establish full control of ${c}, rival factions begin withdrawal, dividend bonuses now active for aligned players`; },
        tone: 'good'
      },
      battle_contested: {
        text: () => `⚠ CONTESTED ZONE: ${col()} enters war status, ${fac()} and ${fac2()} locked in standoff, no clear controlling faction`,
        tone: 'neutral'
      },
      battle_lost: {
        text: () => `💀 COLONY LOST: ${fac()} pushed out of ${col()} after sustained offensive, war chest depleted, control collapses`,
        tone: 'bad'
      },

      // ── Lore-specific Events ────────────────────────────────────────────
      baron_slowdown: {
        text: '⛏ GLUTTONIS DISPATCH: Baron Corps reduces refining output by 12%, freight lanes across all factions begin showing delays within the hour',
        tone: 'bad'
      },
      sweet_shortage: {
        text: "🍷 LUSTANDIA MARKETS: S'weet supply restricted following contested harvest season, grey-market prices triple overnight, Syndicate brokers implicated",
        tone: 'neutral'
      },
      null_breach: {
        text: '🔒 NULL POINT ALERT: NullSyndicate relay disruption detected, encrypted traffic rerouting, CipherHoldings and ShadowDynamics stocks volatile',
        tone: 'bad'
      },
      signal_seized: {
        text: '🚢 SIGNAL RUN UPDATE: Faction forces secure key freight relay, shipping corridor toll rates revised upward, logistics stocks reacting',
        tone: 'neutral'
      },
      abaddon_tremor: {
        text: '🔴 ABADDON CLUSTER: Seismic activity across Limbosis defence grid, automated targeting systems cycling, all approach vectors temporarily flagged hazardous',
        tone: 'bad'
      },
      guild_toll: {
        text: '⬢ MERCHANT GUILD NOTICE: Inter-colony transit fees revised, all non-Guild vessels subject to updated tariff schedule effective immediately',
        tone: 'neutral'
      },
      corporate_war: {
        text: '💼 CORPORATE WAR BULLETIN: Proxy conflict escalates across three systems, Merchant Guild intermediaries scrambling to prevent full Corporate War declaration',
        tone: 'bad'
      },
    };

    const p = presets[preset];
    if (!p) return;
    const text = typeof p.text === 'function' ? p.text() : p.text;
    godSend({ cmd: 'inject_news', text, tone: p.tone });
    godFeedback(`✓ Preset "${preset}" injected`);
  };

  // ── Players Tab ──────────────────────────────────────────────────────────
  window.godSearchPlayer = function() {
    const name = document.getElementById('god-search-name')?.value?.trim();
    if (!name) return;
    godSend({ cmd: 'player_info', targetName: name });
  };
  window.godListAll = function() {
    godSend({ cmd: 'list_players' });
  };
  window.godSelectPlayer = function(name) {
    document.getElementById('god-player-input').value = name;
    document.getElementById('god-search-name').value = name;
    godTab('economy');
    godSend({ cmd: 'player_info', targetName: name });
  };

  // ── Tools Tab ────────────────────────────────────────────────────────────
  window.godBroadcast = function() {
    const text = document.getElementById('god-bcast-text')?.value?.trim();
    if (!text) { godFeedback('Enter broadcast text', '#ff9900'); return; }
    const mins = parseInt(document.getElementById('god-bcast-mins')?.value, 10) || 30;
    godSend({ cmd: 'god_broadcast', text, durationMin: mins });
    document.getElementById('god-bcast-text').value = '';
  };
  window.godFleshbookPost = function() {
    const author = document.getElementById('god-fb-author')?.value?.trim() || 'Mr. Flesh';
    const body = document.getElementById('god-fb-body')?.value?.trim();
    if (!body) { godFeedback('Enter post body', '#ff9900'); return; }
    fetch('/api/fleshbook/gm-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': (window.FM_TOKEN || window.__fmToken || '') },
      body: JSON.stringify({ author, body })
    }).then(r => r.json()).then(d => {
      if (d.ok) { godFeedback('✓ Posted to Fleshbook', '#86ff6a'); document.getElementById('god-fb-body').value = ''; }
      else { godFeedback('Post failed: ' + (d.error || '?'), '#ff6644'); }
    }).catch(() => godFeedback('Post failed', '#ff6644'));
  };
  window.godResetPlayer = function() {
    const name = document.getElementById('god-reset-name')?.value?.trim();
    if (!name) { godFeedback('Enter player name', '#ff9900'); return; }
    if (!confirm(`⚠ RESET ${name}? This will wipe their cash, holdings, XP, and level. Cannot be undone.`)) return;
    godSend({ cmd: 'reset_player', targetName: name });
  };
  window.godDuncePlayer = function() {
    const name   = document.getElementById('god-dunce-name')?.value?.trim();
    const reason = document.getElementById('god-dunce-reason')?.value?.trim() || 'Unruly behaviour';
    if (!name) { godFeedback('Enter player name', '#ff9900'); return; }
    if (!confirm(`🎓 Dunce "${name}"? They will be restricted to the Dunce chat channel until they pay 45% of their net worth.`)) return;
    godSend({ cmd: 'dunce', targetName: name, reason });
  };
  window.godUnduncePlayer = function() {
    const name = document.getElementById('god-dunce-name')?.value?.trim();
    if (!name) { godFeedback('Enter player name', '#ff9900'); return; }
    godSend({ cmd: 'undunce', targetName: name });
  };

  // ── Display Name Override ────────────────────────────────────────────────
  window.godRenamePlayer = function() {
    const target  = document.getElementById('god-rename-target')?.value?.trim();
    const newName = document.getElementById('god-rename-newname')?.value?.trim();
    if (!target)  { godFeedback('Enter the player\'s login name', '#ff9900'); return; }
    if (!newName) { godFeedback('Enter a replacement display name', '#ff9900'); return; }
    if (newName.length < 2 || newName.length > 24) { godFeedback('Display name must be 2–24 characters', '#ff9900'); return; }
    if (USERNAME_BADWORDS.some(w => newName.toLowerCase().includes(w))) {
      godFeedback('Replacement name also triggers the filter, choose another', '#ff4444'); return;
    }
    if (!confirm(`Override "${target}"'s visible name to "${newName}"?\nThey still log in as "${target}".`)) return;
    godSend({ cmd: 'rename_display', targetName: target, newDisplayName: newName });
    document.getElementById('god-rename-target').value = '';
    document.getElementById('god-rename-newname').value = '';
  };
  window.godClearRename = function() {
    const target = document.getElementById('god-rename-target')?.value?.trim();
    if (!target) { godFeedback('Enter the player\'s login name', '#ff9900'); return; }
    if (!confirm(`Restore "${target}"'s display name back to their login name?`)) return;
    godSend({ cmd: 'rename_display', targetName: target, newDisplayName: null });
    document.getElementById('god-rename-target').value = '';
  };

  window.godGiveSpins = function() {
    const name  = document.getElementById('god-item-target')?.value?.trim();
    const count = parseInt(document.getElementById('god-spin-count')?.value) || 5;
    if (!name) { godFeedback('Enter player name', '#ff9900'); return; }
    godSend({ cmd: 'give_spins', targetName: name, count });
  };

  window.godGiveRareDrop = function(rarity) {
    const name = document.getElementById('god-item-target')?.value?.trim();
    if (!name) { godFeedback('Enter player name', '#ff9900'); return; }
    if (!confirm(`Give a guaranteed ${rarity} drop to ${name}?`)) return;
    godSend({ cmd: 'give_rare_drop', targetName: name, rarity });
  };

  window.godGiveItem = function() {
    const name   = document.getElementById('god-item-target')?.value?.trim();
    const itemId = document.getElementById('god-item-select')?.value;
    if (!name)   { godFeedback('Enter player name', '#ff9900'); return; }
    if (!itemId) { godFeedback('Select an item', '#ff9900'); return; }
    godSend({ cmd: 'give_item', targetName: name, itemId });
  };

  // ── Server Response Handler ──────────────────────────────────────────────
  document.addEventListener('fm_ws_msg', e => {
    const msg = e.detail;
    if (!msg) return;

    if (msg.type === 'god_ack') {
      godFeedback(msg.data.msg, msg.data.color);
    }

    if (msg.type === 'god_player_info') {
      const d = msg.data;
      const tierNames = { 0: 'Free', 1: '★ Premium', 2: '⚖ Guild', 3: '♛ CEO' };
      const onlineTag = d.online ? '<span style="color:#86ff6a">● Online</span>' : '<span style="color:#555">○ Offline</span>';
      const roleTag = d.is_prime
        ? `<span style="color:#ff6a00">★ Owner</span>`
        : (d.is_dev ? `<span style="color:#4da6ff">⚙ Dev</span>` : 'No');
      const infoEl = document.getElementById('god-player-info');
      if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px">
            <span style="color:#888">Name:</span><span style="color:#fff">${d.name} ${onlineTag}</span>
            <span style="color:#888">Cash:</span><span style="color:#86ff6a">$${(d.cash||0).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
            <span style="color:#888">Net Worth:</span><span style="color:#9dff5a">$${(d.net_worth||0).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
            <span style="color:#888">XP / Level:</span><span>${(d.xp||0).toLocaleString()} / Lv${d.level||1}</span>
            <span style="color:#888">Patreon:</span><span style="color:#7fc090">${tierNames[d.patreon_tier||0]}</span>
            <span style="color:#888">Role:</span><span>${roleTag}</span>
          </div>
          ${Object.keys(d.holdings||{}).length > 0 ? `
            <div style="margin-top:6px;color:#888">Holdings: ${Object.entries(d.holdings).map(([s,q])=>`<span style="color:#7fc090">${s}×${q}</span>`).join(', ')}</div>
          ` : ''}
        `;
      }
      // Also populate player search field
      document.getElementById('god-player-input').value = d.name;
      godFeedback(`✓ Loaded: ${d.name}`, '#86ff6a');
    }

    if (msg.type === 'god_player_activity') {
      const el = document.getElementById('god-player-activity');
      if (!el) return;
      const d = msg.data || {};
      const rows = d.rows || [];
      el.style.display = 'block';
      if (!rows.length) {
        el.innerHTML = `<div style="color:#666;padding:6px">No casino activity for ${d.name || 'player'}.</div>`;
        godFeedback(`✓ Activity: ${d.name} (none)`, '#86ff6a');
        return;
      }
      // Status colors: clamped / rejected_fast are the fraud signals — flag them.
      const stColor = {
        resolved: '#7fc090', clamped: '#ff5a5a', rejected_fast: '#ff9a00',
        expired: '#888', voided: '#4da6ff', open: '#ffd24a',
      };
      const fmtNum = n => (Number(n)||0).toLocaleString(undefined, { maximumFractionDigits: 2 });
      const fmtTs = ts => {
        try { const dt = new Date(Number(ts)); return dt.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
        catch(_) { return '-'; }
      };
      const flagged = rows.filter(r => r.status === 'clamped' || r.status === 'rejected_fast').length;
      const header = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;padding-bottom:4px;border-bottom:1px solid #ff990022">
          <span style="color:#fff">${d.name}, last ${rows.length} round${rows.length===1?'':'s'}</span>
          ${flagged ? `<span style="color:#ff5a5a">⚠ ${flagged} flagged</span>` : '<span style="color:#7fc090">clean</span>'}
        </div>`;
      const body = rows.map(r => {
        const c = stColor[r.status] || '#7fc090';
        const net = (Number(r.payout)||0) - (Number(r.wager)||0);
        const netColor = net > 0 ? '#86ff6a' : (net < 0 ? '#ff8a8a' : '#888');
        return `
          <div style="display:grid;grid-template-columns:70px 1fr auto;gap:4px 8px;padding:3px 0;border-bottom:1px solid #1a1200">
            <span style="color:#888">${fmtTs(r.opened_ts)}</span>
            <span style="color:#cfc">${r.game} · bet ${fmtNum(r.wager)} · paid ${fmtNum(r.payout)}</span>
            <span style="color:${c};text-align:right">${r.status}</span>
            <span></span>
            <span style="color:${netColor}">net ${net>0?'+':''}${fmtNum(net)}</span>
            <span style="color:#555;text-align:right">→ ${fmtNum(r.cash_after)}</span>
          </div>`;
      }).join('');
      el.innerHTML = header + body;
      godFeedback(`✓ Activity: ${d.name} (${rows.length}${flagged?`, ${flagged} flagged`:''})`, flagged ? '#ff9a00' : '#86ff6a');
    }

    if (msg.type === 'god_player_list') {
      const el = document.getElementById('god-player-list');
      if (!el) return;
      const players = msg.data.players || [];
      if (!players.length) { el.innerHTML = '<div style="color:#666;padding:6px">No players found.</div>'; return; }
      el.innerHTML = players.map((p, i) => {
        const tierColors = { 0: '#666', 1: '#7fc090', 2: '#4ecdc4', 3: '#9dff5a' };
        const tc = tierColors[p.patreon_tier || 0];
        return `
          <div class="god-player-row" onclick="godSelectPlayer('${p.name.replace(/'/g,"\\'")}')">
            <span style="color:#555;width:22px;text-align:right;margin-right:6px">${i+1}</span>
            <span style="color:#fff;flex:1">${p.name}</span>
            <span style="color:${tc};margin-right:8px">${p.patreon_tier > 0 ? ['','★','⚖','♛'][p.patreon_tier] : ''}</span>
            <span style="color:#86ff6a;width:90px;text-align:right">$${(p.net||0).toLocaleString(undefined,{maximumFractionDigits:0})}</span>
          </div>
        `;
      }).join('');
    }

    if (msg.type === 'god_cash_update') {
      // If looking at this player, refresh their info
      const currentTarget = document.getElementById('god-player-input')?.value?.trim();
      if (currentTarget) godSend({ cmd: 'player_info', targetName: currentTarget });
    }
  });

  // ── Make panel draggable ────────────────────────────────────────────────
  (function() {
    const panel = document.getElementById('godPanel');
    const header = document.getElementById('godPanelHeader');
    let dragging = false, ox = 0, oy = 0;
    if (!header || !panel) return;
    header.addEventListener('mousedown', e => {
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.right = 'auto';
      panel.style.left = Math.max(0, e.clientX - ox) + 'px';
      panel.style.top  = Math.max(0, e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  })();

  // ── Show button + panel only for dev/owner accounts ──────────────────
  document.addEventListener('fm:authed', e => {
    document.dispatchEvent(new CustomEvent('fm_login', { detail: e.detail }));

    if (e.detail?.is_dev || e.detail?.is_prime) {
      const btn = document.getElementById('godModeBtn');
      if (btn) btn.style.display = 'flex';
      window.__godEnabled = true;
      // Devs and owner can always see dunce channel
      const dTab = document.getElementById('dunce-chat-tab');
      if (dTab) dTab.style.display = '';
    }
  });

  // Cache company data for the ticker list
  document.addEventListener('fm_ws_msg', e => {
    const msg = e.detail;
    if (!msg) return;
    if (msg.type === 'init' && msg.data?.companies) {
      window.__companies_g = msg.data.companies;
    }
    if (msg.type === 'tick' && Array.isArray(msg.data)) {
      window.__companies_g = msg.data;
      if (__godVisible && __godActiveTab === 'market') refreshGodTickers();
    }
  });



// ─── New God Commands ──────────────────────────────────────────────────────────

window.godPresetEvent = function(type) {
  const presets = {
    crash:            { cmd:'sector_shock', sector:0, pct:-0.18, text:'⚠ MARKET ALERT: Systemic selling pressure detected across all Finance sectors. Regulators watching.' },
    boom:             { cmd:'sector_shock', sector:0, pct: 0.12, text:'🚀 MARKET BULLETIN: Interstellar Growth Index hits 3-year high. Finance sector leads gains.' },
    raid:             { cmd:'market_event', eventType:'enforcement' },
    blackout:         { cmd:'market_halt', seconds:20, reason:'Grid Blackout Event, trading suspended' },
    halt30:           { cmd:'market_halt', seconds:30, reason:'Scheduled maintenance halt' },
    volatility_spike: { cmd:'set_volatility', symbol:'ALL', sigma:0.08 },
  };
  const p = presets[type];
  if (!p) return;
  if (p.text) godCmd({ cmd:'inject_news', text:p.text, tone: type==='crash'||type==='raid' ? 'bad' : 'good', symbol:'' });
  if (p.cmd !== 'inject_news') setTimeout(() => godCmd(p), 200);
};

window.godFreezeMarket = function() {
  if (!confirm('Freeze market? All trading and ticks will halt.')) return;
  godCmd({ cmd:'freeze_market' });
};
window.godUnfreezeMarket = function() { godCmd({ cmd:'unfreeze_market' }); };
window.godMarketHalt = function(seconds) { godCmd({ cmd:'market_halt', seconds }); };

window.godSetVolatility = function(sym, pct) {
  const symbol = sym || document.getElementById('god-vol-sym').value.trim().toUpperCase() || 'ALL';
  const sigmaVal = pct || (Number(document.getElementById('god-vol-val').value) / 100);
  godCmd({ cmd:'set_volatility', symbol, sigma: sigmaVal });
};

window.godSetTax = function() {
  const bps = Number(document.getElementById('god-tax-bps').value) || 25;
  if (!confirm(`Set transfer tax to ${bps}bps (${(bps/100).toFixed(2)}%)?`)) return;
  godCmd({ cmd:'set_tax', bps });
};
window.godSetTaxQuick = function(bps) {
  godCmd({ cmd:'set_tax', bps });
};

window.godForceDividend = function() {
  if (!confirm('Force dividend payment to all eligible holders now?')) return;
  godCmd({ cmd:'force_dividend' });
};

window.godClearOrders = function() {
  const name = document.getElementById('god-clear-orders-name').value.trim();
  const msg = name ? `Clear all limit orders for ${name}?` : 'Clear ALL limit orders for all players? Refunds will be issued.';
  if (!confirm(msg)) return;
  godCmd({ cmd:'clear_orders', targetName: name || undefined });
};

window.godSetTension = function(val) {
  const colony = document.getElementById('god-colony-select').value;
  const tension = val !== undefined ? val : Number(document.getElementById('god-tension-val').value) || 0;
  godCmd({ cmd:'set_tension', colony, tension });
};

/* ══ CORPORATE WARS BOARD ═══════════════════════════════════════════════════
   A LIVE VIEW OF gState, NOT A SECOND MODEL. Faction control per colony has
   been in colony_state for a long time and the war fund has been priced
   against it for nearly as long; what has never existed is a place to SEE
   every front at once and reach one. This is that place.

   Everything it sends is set_colony_control, which the server has accepted
   since before this panel. Nothing here is a new authority - if it were, it
   would be a second way to move control and the two would drift.

   IGNITE IS A TEST LEVER AND IS LABELLED AS ONE. A city battlefield needs two
   factions holding ground before it has anything to draw, and on a quiet
   colony there is nothing to look at. It sets a contested split so a front
   exists; it is not a declaration and it is not the mechanism players will
   use, which is the council system and is deliberately not built yet. */
function gwFactions(st) {
  return [
    ['coalition', st.control_coalition || 0, '#5494ec'],
    ['syndicate', st.control_syndicate || 0, '#b08454'],
    ['void',      st.control_void || 0,      '#9676d2'],
    ['guild',     st.control_guild || 0,     '#cebc74'],
  ].filter(f => f[1] > 0).sort((a, b) => b[1] - a[1]);
}
window.godWarsRefresh = function () {
  const board = document.getElementById('gw-board');
  if (!board) return;
  const mode = (document.getElementById('gw-filter') || {}).value || 'contested';
  const PUB = window.FM_CITY_FRONTS || {};
  const META = window._FM_COLONY_META || PUB.meta || {};
  const gs = window.gState || {};
  const rows = [];
  Object.keys(META).forEach(function (id) {
    if (/^ks_/.test(id)) return;
    const col = META[id], st = gs[id] || {};
    const fac = gwFactions(st);
    const contested = fac.length >= 2 && fac[1][1] > 0;
    if (mode === 'contested' && !contested) return;
    if (mode === 'jade' && col.galaxy !== 'jade') return;
    if (mode === 'coal' && col.galaxy === 'jade') return;
    rows.push({ id, col, st, fac, contested });
  });
  rows.sort(function (a, b) {
    if (a.contested !== b.contested) return a.contested ? -1 : 1;
    return (a.col.name || a.id).localeCompare(b.col.name || b.id);
  });
  if (!rows.length) {
    board.innerHTML = '<div style="color:#55534c;font-size:.6rem;padding:6px">' +
      (mode === 'contested'
        ? 'No colony currently has two factions holding ground. Switch to "Every colony" and IGNITE one to make a front.'
        : 'No colonies match this filter.') + '</div>';
    return;
  }
  board.innerHTML = rows.map(function (r) {
    const bar = r.fac.map(function (f) {
      return '<span style="display:inline-block;height:6px;width:' +
             Math.max(2, f[1]) + '%;background:' + f[2] + '"></span>';
    }).join('');
    const who = r.fac.map(function (f) {
      return f[0].slice(0, 4).toUpperCase() + ' ' + Math.round(f[1]) + '%';
    }).join('  ');
    /* A COLONY WITH ONE HOLDER HAS NO FRONT, and the button says so rather
       than opening a viewer that will refuse. A control that looks live and
       does nothing is worse than one that is visibly unavailable. */
    const watch = r.contested
      ? '<button class="gw-b go" onclick="godWarWatch(\'' + r.id + '\')">WATCH</button>'
      : '<button class="gw-b" disabled style="opacity:.4" title="needs two factions holding ground">WATCH</button>';
    return '<div style="border:1px solid #23201c;padding:5px 6px;margin-bottom:3px">' +
      '<div style="display:flex;gap:6px;align-items:center">' +
        '<div style="flex:1;font-size:.62rem;color:' + (r.contested ? '#e0a050' : '#8a867e') + '">' +
          (r.col.name || r.id) + (r.col.galaxy === 'jade' ? ' <span style="color:#56b48c">JADE</span>' : '') +
        '</div>' + watch +
        '<button class="gw-b" onclick="godWarIgnite(\'' + r.id + '\')">IGNITE</button>' +
        '<button class="gw-b" onclick="godWarCalm(\'' + r.id + '\')">CALM</button>' +
      '</div>' +
      '<div style="display:flex;height:6px;margin:4px 0;background:#14120f">' + bar + '</div>' +
      '<div style="font-size:.52rem;color:#6a665e;letter-spacing:.08em">' +
        (who || 'uncontrolled') +
        (r.st.tension != null ? '   tension ' + Math.round(r.st.tension) : '') +
      '</div></div>';
  }).join('');
};
window.godWarWatch = function (colonyId) {
  if (!window.cityWatch) { godToast && godToast('city battlefield not loaded yet'); return; }
  window.cityWatch(colonyId, 0);
};
/* Sixty/thirty is a real contest rather than a rout: the weaker side holds
   enough ground to have cover on its own side of the front, which is what the
   battlefield needs to show a fight rather than a mop-up. */
window.godWarIgnite = function (colonyId) {
  godCmd({ cmd: 'set_colony_control', colony: colonyId,
           coalition: 60, syndicate: 30, void: 0 });
  setTimeout(window.godWarsRefresh, 400);
};
window.godWarCalm = function (colonyId) {
  godCmd({ cmd: 'set_colony_control', colony: colonyId,
           coalition: 100, syndicate: 0, void: 0 });
  setTimeout(window.godWarsRefresh, 400);
};

window.godSetColonyControl = function() {
  const colony = document.getElementById('god-colony-select').value;
  const coalition = Number(document.getElementById('god-ctrl-coalition').value) || 0;
  const syndicate = Number(document.getElementById('god-ctrl-syndicate').value) || 0;
  const void_  = Number(document.getElementById('god-ctrl-void').value) || 0;
  godCmd({ cmd:'set_colony_control', colony, coalition, syndicate, void: void_ });
};

// Auto-rebalance: when one faction input changes, redistribute the remainder to the other two
window.godRebalanceCtrl = function(changed) {
  const cEl = document.getElementById('god-ctrl-coalition');
  const sEl = document.getElementById('god-ctrl-syndicate');
  const vEl = document.getElementById('god-ctrl-void');
  const val = Math.max(0, Math.min(100, Number(document.getElementById('god-ctrl-' + changed).value) || 0));
  const remainder = 100 - val;
  if (changed === 'coalition') {
    const oldS = Number(sEl.value) || 0;
    const oldV = Number(vEl.value) || 0;
    const oldOther = oldS + oldV;
    if (oldOther > 0) {
      sEl.value = Math.round(remainder * (oldS / oldOther));
      vEl.value = remainder - Number(sEl.value);
    } else {
      sEl.value = Math.round(remainder / 2);
      vEl.value = remainder - Number(sEl.value);
    }
  } else if (changed === 'syndicate') {
    const oldC = Number(cEl.value) || 0;
    const oldV = Number(vEl.value) || 0;
    const oldOther = oldC + oldV;
    if (oldOther > 0) {
      cEl.value = Math.round(remainder * (oldC / oldOther));
      vEl.value = remainder - Number(cEl.value);
    } else {
      cEl.value = Math.round(remainder / 2);
      vEl.value = remainder - Number(cEl.value);
    }
  } else if (changed === 'void') {
    const oldC = Number(cEl.value) || 0;
    const oldS = Number(sEl.value) || 0;
    const oldOther = oldC + oldS;
    if (oldOther > 0) {
      cEl.value = Math.round(remainder * (oldC / oldOther));
      sEl.value = remainder - Number(cEl.value);
    } else {
      cEl.value = Math.round(remainder / 2);
      sEl.value = remainder - Number(cEl.value);
    }
  }
};

window.godResetColony = function() {
  const colony = document.getElementById('god-colony-select').value;
  if (!confirm(`Reset all faction control for ${colony}?`)) return;
  godCmd({ cmd:'reset_colony', colony });
};

window.godSectorShock = function() {
  const sector = Number(document.getElementById('god-sector-select').value) || 0;
  const pct = (Number(document.getElementById('god-sector-pct').value) || -15) / 100;
  const sectorNames = ['Finance','Biotech','Insurance','Manufacturing','Energy','Logistics','Tech','Misc'];
  if (!confirm(`Apply ${(pct*100 > 0 ? '+':'')}${(pct*100).toFixed(0)}% shock to ${sectorNames[sector]}?`)) return;
  godCmd({ cmd:'sector_shock', sector, pct });
};


// ─── God Panel Comms Tab ──────────────────────────────────────────────────────
window.godCommsRefresh = function() {
  const tok = window.__fmToken || '';
  const headers = { 'x-auth-token': tok };

  // Bug reports
  const bugsEl = document.getElementById('god-comms-bugs');
  if (bugsEl) {
    bugsEl.innerHTML = '<span style="color:#555">Loading…</span>';
    fetch('/api/comms/bugs', { headers })
      .then(r => r.json()).then(d => {
        if (!d.ok || !d.bugs.length) { bugsEl.innerHTML = '<span style="color:#555">No bug reports.</span>'; return; }
        bugsEl.innerHTML = d.bugs.map(b =>
          `<div style="border-bottom:1px solid #1a1a2e;padding:6px 0;${b.resolved?'opacity:.45':''}">
            <div style="color:${b.resolved?'#555':'#ccc'};margin-bottom:2px">${escapeHtml(b.text)}</div>
            <div style="color:#555;font-size:.68rem;display:flex;gap:10px;align-items:center">
              <span>👍 ${b.upvotes}</span>
              <span>${escapeHtml(b.reporter)}</span>
              <span>${new Date(b.ts).toLocaleTimeString()}</span>
              ${b.resolved
                ? `<button onclick="godCommsUnresolve(${b.id})" style="background:none;border:1px solid #555;color:#555;padding:1px 6px;cursor:pointer;font-family:inherit;font-size:.65rem">Unresolve</button>`
                : `<button onclick="godCommsResolve(${b.id})" style="background:none;border:1px solid #51cf66;color:#51cf66;padding:1px 6px;cursor:pointer;font-family:inherit;font-size:.65rem">✓ Resolve</button>`}
            </div>
          </div>`
        ).join('');
      }).catch(() => { bugsEl.innerHTML = '<span style="color:#ff6b6b">Failed.</span>'; });
  }

  // Player reports (admin only)
  const repsEl = document.getElementById('god-comms-reports');
  if (repsEl) {
    repsEl.innerHTML = '<span style="color:#555">Loading…</span>';
    fetch('/api/comms/reports', { headers })
      .then(r => r.json()).then(d => {
        if (!d.ok || !d.reports.length) { repsEl.innerHTML = '<span style="color:#555">No player reports.</span>'; return; }
        repsEl.innerHTML = d.reports.map(r =>
          `<div style="border-bottom:1px solid #1a1a2e;padding:6px 0;${r.reviewed?'opacity:.45':''}">
            <div style="color:#e74c3c;font-size:.72rem">→ <b>${escapeHtml(r.target)}</b></div>
            <div style="color:#ccc;font-size:.72rem">${escapeHtml(r.reason)}</div>
            <div style="color:#555;font-size:.68rem">By ${escapeHtml(r.reporter)} · ${new Date(r.ts).toLocaleTimeString()}</div>
          </div>`
        ).join('');
      }).catch(() => { repsEl.innerHTML = '<span style="color:#555">No access or no reports.</span>'; });
  }

  // Dev chat requests (admin only)
  const reqEl = document.getElementById('god-comms-requests');
  if (reqEl) {
    reqEl.innerHTML = '<span style="color:#555">Loading…</span>';
    fetch('/api/comms/requests', { headers })
      .then(r => r.json()).then(d => {
        if (!d.ok || !d.requests.length) { reqEl.innerHTML = '<span style="color:#555">No chat requests.</span>'; return; }
        reqEl.innerHTML = d.requests.map(r =>
          `<div style="border-bottom:1px solid #1a1a2e;padding:6px 0;${r.handled?'opacity:.45':''}">
            <div style="color:#f39c12;font-size:.72rem"><b>${escapeHtml(r.player)}</b> requests a chat</div>
            <div style="color:#ccc;font-size:.72rem">${escapeHtml(r.message)}</div>
            <div style="color:#555;font-size:.68rem;display:flex;gap:8px;align-items:center">
              <span>${new Date(r.ts).toLocaleTimeString()}</span>
              ${!r.handled ? `<button onclick="godCommsHandle(${r.id})" style="background:none;border:1px solid #f39c12;color:#f39c12;padding:1px 6px;cursor:pointer;font-family:inherit;font-size:.65rem">Mark Handled</button>` : '<span style="color:#51cf66">✓ Handled</span>'}
            </div>
          </div>`
        ).join('');
      }).catch(() => { reqEl.innerHTML = '<span style="color:#555">No access or no requests.</span>'; });
  }
};

window.godCommsResolve = function(id) {
  fetch('/api/comms/bugs/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': window.__fmToken || '' },
    body: JSON.stringify({ id, token: window.__fmToken || '' })
  }).then(() => godCommsRefresh());
};
window.godCommsUnresolve = window.godCommsResolve;

window.godCommsHandle = function(id) {
  fetch('/api/comms/requests/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': window.__fmToken || '' },
    body: JSON.stringify({ id, token: window.__fmToken || '' })
  }).then(() => godCommsRefresh());
};

function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


  // ══ FRS panel (Gifted Titles + Tax Engine + Surveillance) — 1.1.8.0 ══════════
  const _frsTarget = () => document.getElementById('god-frs-target')?.value?.trim() || '';
  const _frsFmt = (n) => 'Ƒ' + Math.round(Number(n)||0).toLocaleString();
  const _frsTime = (s) => { s = Number(s)||0; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h ? `${h}h ${m}m` : `${m}m`; };
  const _frsOut = (html) => { const el = document.getElementById('god-frs-out'); if (el) el.innerHTML = html; };

  window.godGiftPreset = function(preset) {
    const t = _frsTarget(); if (!t) return godFeedback('✗ Enter a player name', '#ff6b6b');
    godSend({ cmd: 'gift_title', targetName: t, preset });
  };
  window.godGiftCustom = function() {
    const t = _frsTarget(); if (!t) return godFeedback('✗ Enter a player name', '#ff6b6b');
    const label = document.getElementById('god-frs-customlabel')?.value?.trim() || '';
    const color = document.getElementById('god-frs-customcolor')?.value?.trim() || '';
    const badge = document.getElementById('god-frs-custombadge')?.value?.trim() || '';
    if (!label) return godFeedback('✗ Custom label required', '#ff6b6b');
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return godFeedback('✗ Color must be #rrggbb', '#ff6b6b');
    godSend({ cmd: 'gift_title', targetName: t, label, color, badge: badge || undefined });
  };
  window.godUngift = function() {
    const t = _frsTarget(); if (!t) return godFeedback('✗ Enter a player name', '#ff6b6b');
    // Optional: type an exact label in the custom-label field to remove that specific title;
    // leave it blank to remove the player's currently-equipped gifted title.
    const lbl = (document.getElementById('god-frs-customlabel')?.value || '').trim();
    godSend({ cmd: 'ungift_title', targetName: t, label: lbl || undefined });
  };

  window.godSetFRS = function(patch) { godSend({ cmd: 'set_frs', ...patch }); };
  window.godSetFRSRates = function() {
    const r = parseFloat(document.getElementById('god-frs-rate')?.value);
    const w = parseFloat(document.getElementById('god-frs-wrate')?.value);
    const patch = { cmd: 'set_frs' };
    if (isFinite(r)) patch.rateBps = Math.round(r * 100);
    if (isFinite(w)) patch.withdrawTaxBps = Math.round(w * 100);
    if (patch.rateBps == null && patch.withdrawTaxBps == null) return godFeedback('✗ Enter a rate', '#ff6b6b');
    godSend(patch);
  };
  window.godFRSForgive = function() {
    const t = _frsTarget(); if (!t) return godFeedback('✗ Enter a player name', '#ff6b6b');
    godSend({ cmd: 'frs_forgive', targetName: t });
  };
  window.godFRSPlayer = function() {
    const t = _frsTarget(); if (!t) return godFeedback('✗ Enter a player name', '#ff6b6b');
    godSend({ cmd: 'frs_player', targetName: t });
  };
  window.godFRSRecent = function() {
    const min = parseFloat(document.getElementById('god-frs-minnotional')?.value) || 0;
    godSend({ cmd: 'frs_recent', limit: 80, minNotional: min });
  };

  function _frsRenderState(d) {
    const el = document.getElementById('god-frs-state'); if (!el) return;
    el.innerHTML = `Status: <b style="color:${d.enabled ? '#86ff6a' : '#ff8a8a'}">${d.enabled ? 'ENABLED' : 'DISABLED'}</b>`
      + ` &nbsp; income <b>${((d.rateBps||0)/100).toFixed(2)}%</b>, withdraw <b>${((d.withdrawTaxBps||0)/100).toFixed(2)}%</b>`
      + (d.lossCarryforward != null ? `, loss credit ${d.lossCarryforward ? 'on' : 'off'}` : '');
    const ri = document.getElementById('god-frs-rate'); if (ri && !ri.value) ri.value = ((d.rateBps||0)/100).toFixed(2);
    const wi = document.getElementById('god-frs-wrate'); if (wi && !wi.value) wi.value = ((d.withdrawTaxBps||0)/100).toFixed(2);
  }

  document.addEventListener('fm_ws_msg', e => {
    const msg = e.detail; if (!msg) return;

    if (msg.type === 'god_frs_settings' || msg.type === 'frs_settings') { _frsRenderState(msg.data); }

    if (msg.type === 'god_frs_player') {
      const d = msg.data, tax = d.tax || {}, t = d.telemetry || {};
      const purch = (t.purchases || []).map(p =>
        `${new Date(p.ts).toLocaleString()}  ${p.kind.padEnd(10)} ${(p.symbol||'').padEnd(6)} ${(p.qty||0)}@${_frsFmt(p.price)}  =${_frsFmt(p.notional)}`
      ).join('\n') || '  (none)';
      const hist = (t.tax || []).map(h =>
        `${new Date(h.ts).toLocaleDateString()}  gain ${_frsFmt(h.period_gain)}  tax ${_frsFmt(h.tax_assessed)}  owed ${_frsFmt(h.new_owed)}`
      ).join('\n') || '  (none)';
      const gifts = (d.gifted || []).map(g =>
        `${g.label === d.equipped ? '● ' : '  '}${(g.badge||'')} ${g.label}  [${g.rarity||'custom'}] ${g.color||''}`
      ).join('\n') || '  (none)';
      _frsOut(
        `<b style="color:#ffce4d">DOSSIER: ${escapeHtml(d.name)}</b>\n`
        + `Playtime: ${_frsTime(t.play_seconds)}\n`
        + `Tax basis ${tax.tax_basis==null?'(unassessed)':_frsFmt(tax.tax_basis)}  owed ${_frsFmt(tax.tax_owed)}  prepaid ${_frsFmt(tax.tax_prepaid)}  loss credit ${_frsFmt(tax.tax_loss_credit)}\n`
        + `\n<b>Gifted titles</b> (● = equipped; type a label in the custom field and Remove to delete one)\n${escapeHtml(gifts)}\n`
        + `\n<b>Recent trades</b>\n${escapeHtml(purch)}\n`
        + `\n<b>Tax history</b>\n${escapeHtml(hist)}`
      );
    }

    if (msg.type === 'god_frs_recent') {
      const rows = (msg.data.rows || []).map(r =>
        `${new Date(r.ts).toLocaleTimeString()}  ${(r.name||'?').padEnd(14)} ${r.kind.padEnd(10)} ${(r.symbol||'').padEnd(6)} ${(r.qty||0)}@${_frsFmt(r.price)}  =${_frsFmt(r.notional)}`
      ).join('\n') || '  (no activity)';
      _frsOut(`<b style="color:#ffce4d">RECENT MARKET ACTIVITY</b>\n${escapeHtml(rows)}`);
    }
  });




// ── World gates: Jade passage and commodity trading ──────────────────────────
// Both are GM switches over server state. The panel reads the real positions
// from /api/dev/gates on tab open rather than tracking what it last clicked,
// because the server is authoritative and a second dev, or a restart, can move
// them underneath this panel.
function _godTok(){ return window.FM_TOKEN || window.__fmToken || ''; }
function _godGateHint(msg, ok){
  const el = document.getElementById('godGateHint');
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok === false ? '#ff6b6b' : (ok === true ? '#51cf66' : '#888');
}
function _godGatePaint(id, open, openWord, shutWord){
  const el = document.getElementById(id);
  if (!el) return;
  if (open === null || open === undefined) { el.textContent = 'unknown'; el.style.color = '#888'; el.style.borderColor = '#444'; return; }
  el.textContent = open ? openWord : shutWord;
  el.style.color = open ? '#51cf66' : '#e74c3c';
  el.style.borderColor = open ? '#51cf6655' : '#e74c3c55';
}
window.godGatesRefresh = function(){
  fetch('/api/dev/gates', { headers: { 'x-auth-token': _godTok() } })
    .then(r => r.json())
    .then(d => {
      if (!d || !d.ok) { _godGateHint('Could not read gate state.', false); return; }
      _godGatePaint('godGateWormhole', d.wormhole, 'OPEN', 'SEALED');
      _godGatePaint('godGateCommodities', d.commodities, 'TRADING', 'HALTED');
      _godGateHint('');
    })
    .catch(() => _godGateHint('Could not read gate state.', false));
};
window.godSetWormhole = function(open){
  if (!open && !confirm('Seal the Jade passage?\n\nThis delists the Jade tickers from the tape for every connected player and blocks Jade trades. Open positions are left intact.')) return;
  _godGateHint('Working...');
  fetch('/api/dev/wormhole', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': _godTok() },
    body: JSON.stringify({ token: _godTok(), open: !!open })
  }).then(r => r.json()).then(d => {
    if (!d || !d.ok) { _godGateHint('Failed: ' + ((d && d.error) || 'unknown'), false); return; }
    _godGatePaint('godGateWormhole', d.open, 'OPEN', 'SEALED');
    _godGateHint('Passage ' + (d.open ? 'opened' : 'sealed') + '. ' + (d.tickers || 0) + ' Jade tickers ' + (d.open ? 'listed' : 'delisted') + '.', true);
  }).catch(() => _godGateHint('Network error.', false));
};
window.godSetCommodities = function(open){
  if (!open && !confirm('Halt commodity trading?\n\nBuy and sell stop for every player. Cargo already in transit still lands and launched runs still resolve.')) return;
  _godGateHint('Working...');
  fetch('/api/dev/commodities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': _godTok() },
    body: JSON.stringify({ token: _godTok(), open: !!open })
  }).then(r => r.json()).then(d => {
    if (!d || !d.ok) { _godGateHint('Failed: ' + ((d && d.error) || 'unknown'), false); return; }
    _godGatePaint('godGateCommodities', d.open, 'TRADING', 'HALTED');
    _godGateHint('Commodity trading ' + (d.open ? 'resumed' : 'halted') + '.', true);
  }).catch(() => _godGateHint('Network error.', false));
};

// ─── Patreon audit (1.3.7.3) ──────────────────────────────────────────────────
// The webhook is the fast path and it is not reliable on its own: a cancellation
// that never arrives, or arrives with an email that does not match what the
// player linked, leaves a lapsed patron holding a paid tier. This checks against
// Patreon itself. Opens in preview because a commit removes tiers from real
// paying accounts and that should never be one unlabelled click away.
function _godPatOut(html, color) {
  const el = document.getElementById('god-patreon-out');
  if (el) { el.style.color = color || '#9ab'; el.innerHTML = html; }
}

window.godPatreonAudit = function(commit, force) {
  if (commit && !force && !confirm('Commit the Patreon audit? This removes tiers from accounts that cannot be verified.')) return;
  _godPatOut(commit ? 'Running audit\u2026' : 'Previewing\u2026', '#888');
  fetch('/api/admin/patreon/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': _godTok() },
    body: JSON.stringify({ commit: !!commit, force: !!force }),
  }).then(r => r.json()).then(d => {
    if (d && d.error === 'needs_confirmation') {
      _godPatOut('BLOCKED: ' + (d.message || '') + '\n\n'
        + '<button class="god-btn god-btn-red" onclick="godPatreonAudit(true,true)">Override and commit anyway</button>', '#ff9900');
      return;
    }
    if (!d || !d.ok) { _godPatOut('\u2717 ' + ((d && (d.message || d.error)) || 'Audit failed'), '#ff6b6b'); return; }
    const head = (d.dryRun ? 'PREVIEW' : 'COMMITTED') + ': ' + d.patrons + ' patron(s) on Patreon, '
      + d.checked + ' holder(s) checked, ' + d.held + ' verified, ' + d.adjusted + ' adjusted, '
      + d.downgraded + ' to revoke, ' + d.exempt + ' exempt';
    const lines = (d.rows || []).map(r => {
      const c = r.action === 'revoke' ? '#ff6b6b' : r.action === 'adjust' ? '#f0b454'
              : r.action === 'exempt' ? '#3498db' : '#4f8a64';
      return '<span style="color:' + c + '">' + r.action.toUpperCase() + '</span> '
           + r.name + ' (tier ' + r.tier + (r.toTier != null ? ' to ' + r.toTier : '') + ') '
           + '<span style="color:#666">' + r.reason + '</span>';
    }).join('\n');
    _godPatOut(head + '\n' + lines, d.dryRun ? '#9ab' : '#86ff6a');
  }).catch(() => _godPatOut('\u2717 Network error', '#ff6b6b'));
};

window.godPatreonHolders = function() {
  _godPatOut('Loading\u2026', '#888');
  fetch('/api/admin/patreon/holders', { headers: { 'x-auth-token': _godTok() } })
    .then(r => r.json()).then(d => {
      if (!d || !d.ok) { _godPatOut('\u2717 Could not load holders', '#ff6b6b'); return; }
      const cfg = d.configured
        ? '<span style="color:#4f8a64">Patreon API configured</span>'
        : '<span style="color:#ff9900">Patreon API NOT configured: set PATREON_ACCESS_TOKEN and PATREON_CAMPAIGN_ID. Audits will do nothing until you do.</span>';
      const lines = (d.holders || []).map(h => {
        const ex = h.exemptReason ? ' <span style="color:#3498db">[' + h.exemptReason + ']</span>' : '';
        const exp = h.expiresAt ? new Date(h.expiresAt).toISOString().slice(0, 10) : 'none';
        return h.name + ', ' + h.tierName + ex + ' <span style="color:#666">exp ' + exp + '</span>';
      }).join('\n');
      _godPatOut(cfg + '\n' + (d.holders || []).length + ' holder(s)\n' + lines, '#9ab');
    }).catch(() => _godPatOut('\u2717 Network error', '#ff6b6b'));
};

window.godPatreonExempt = function(flag) {
  const name = document.getElementById('god-patreon-exempt-name')?.value?.trim();
  if (!name) { _godPatOut('Enter a player name', '#ff9900'); return; }
  fetch('/api/admin/patreon/exempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': _godTok() },
    body: JSON.stringify({ name, exempt: !!flag }),
  }).then(r => r.json()).then(d => {
    if (d && d.ok) _godPatOut('\u2713 ' + d.name + (d.exempt ? ' is now exempt from Patreon audits' : ' is no longer exempt'), '#86ff6a');
    else _godPatOut('\u2717 ' + ((d && (d.message || d.error)) || 'Failed'), '#ff6b6b');
  }).catch(() => _godPatOut('\u2717 Network error', '#ff6b6b'));
};

})();


// ═══════════════════════════════════════════════════════════════════════════
// Khai'sultull Reach - Prawn War controls.
//
// Everything here drives server state that exists today. Wave composition,
// tempo and blast tuning are deliberately absent: the war layer is not in the
// build yet, and a switch wired to nothing rots untested. That is exactly how
// the trial gate sat broken across 120 routes for four patches while static
// checks passed.
// ═══════════════════════════════════════════════════════════════════════════
window._REACH = null;

// Designations only. The true names live server-side and arrive on reveal.
const REACH_LABEL = {
  // Their names. The KS designations were a Coalition catalogue and the
  // panel is where the GM speaks as the brood, so it uses theirs.
  ks_gate_reach  :"Sahn'tekk"   ,
  ks_02          :"Ussaleth"    ,
  ks_03          :"Khai'ru"     ,
  ks_04          :"Tessul"      ,
  ks_05          :"Zhaal'un"    ,
  ks_06          :"Marokketh"   ,
  ks_07          :"Ossuveth"    ,
  ks_08          :"Nikkathaal"  ,
  ks_09          :"Thennsur"    ,
  ks_10          :"Vesskanoth"  ,
};
/* THE THIRD COPY OF THIS TABLE. COLONY_VISUAL server-side is the authority,
   galaxy.js exposes it as window.REACH_TERRAIN for the client, and this was a
   hand-maintained duplicate that nothing checked. It stays as a FALLBACK only:
   the god panel can be opened before the galaxy bundle has ever loaded, so a
   free reference to the shared table would render '?' on every world. Prefer
   the shared one when it is there. */
const REACH_TERRAIN_FALLBACK = {
  ks_gate_reach:'dust', ks_02:'dust', ks_03:'dust', ks_04:'veins', ks_05:'rift',
  ks_06:'dust', ks_07:'ocean', ks_08:'ice', ks_09:'dust', ks_10:'tether',
};
function reachTerrain(id){
  return (window.REACH_TERRAIN && window.REACH_TERRAIN[id]) || REACH_TERRAIN_FALLBACK[id] || '?';
}
const REACH_STATUS_COLOR = { quiet:'#555', contested:'#f0b454', held:'#4ecdc4', lost:'#c2551f' };

window.reachPassage = function(open){ godCmd({ cmd:'reach_passage', open:!!open }); };
window.reachControl  = function(w,v){ godCmd({ cmd:'reach_control', world:w, hive:Number(v) }); };
window.reachGarrison = function(w,v){ godCmd({ cmd:'reach_garrison', world:w, value:Number(v) }); };
window.reachReveal   = function(w,on){ godCmd({ cmd:'reach_reveal', world:w, on:!!on }); };
// How many waves each zone on this world runs before the world is done. Raising
// it re-opens ground that had cleared, which is the point: a world grows as the
// story asks for it rather than being sized once at seed.
window.reachWaves    = function(w,v){ godCmd({ cmd:'reach_waves', world:w, value:Number(v) }); };
// The war fund. 'add' is the useful mode live; absolute is for setting up a
// scenario before anyone is watching.
window.reachFund     = function(w,v,mode){ godCmd({ cmd:'reach_fund', world:w, value:Number(v), mode:mode||'set' }); };
/* One primitive, three jobs: which FOB goes up on ground just taken, how the
   Coalition answers the hive lord, how it answers Jade. Presets rather than
   free text, because the thing you reach for live should be one click and the
   thing you compose should be deliberate. */
window.REACH_VOTE_PRESETS = {
  fob: { kind:'fob', hours:24, defaultId:'bastion',
         question:'Ground is held. What goes up on it?',
         options:[ {id:'bastion', label:'Bastion, walled compound, armour staging'},
                   {id:'pad',     label:'Pad, landing strip, air support'},
                   {id:'cut',     label:'Cut, dug in, costly to retake'},
                   {id:'spire',   label:'Spire, relay tower, sensors and comms'} ] },
  demand: { kind:'demand', hours:24, defaultId:'refuse',
            question:'The hive lord has made a demand. How does the Coalition answer?',
            options:[ {id:'refuse', label:'Refuse'}, {id:'accept', label:'Accept the terms'} ] },
  jade:   { kind:'jade', hours:24, defaultId:'decline',
            question:'The Jade Circuit has asked for support. Does the Coalition answer?',
            options:[ {id:'support', label:'Send support'}, {id:'decline', label:'Decline'} ] },
};
window.reachVote = function(w, preset, question){
  const P = window.REACH_VOTE_PRESETS[preset];
  if (!P) return;
  godCmd({ cmd:'reach_vote', world:w, kind:P.kind, question:question||P.question,
           options:P.options, hours:P.hours, defaultId:P.defaultId });
};
window.reachVoteClose = function(w, cancel){ godCmd({ cmd:'reach_vote_close', world:w, cancel:!!cancel }); };
/* A raid costs the work and NEVER the ground. Two clicks would be safer, but
   the destructive thing here is a wireframe rather than a campaign: banked
   control is untouchable from this path by construction. */
window.reachRaid = function(w, type){ godCmd({ cmd:'reach_raid', world:w, fobType:type }); };
window.reachFob  = function(w, type, zone){ godCmd({ cmd:'reach_fob', world:w, fobType:type, zone:zone||0 }); };
/* Jade lives in its own namespace even though it writes into the same war, so
   that pointing it at a different enemy later does not mean untangling it from
   Reach state. */
window.jadeCommit = function(w, frac, forward){
  godCmd({ cmd:'jade_commit', world:w, frac:frac, forward:forward });
};
/* Jade's voice in the war. The chamber floor already carries the envoy through
   the regent picker; this is the Reach feed, where the hive lord has had a
   voice since the beginning and Jade has had none. */
window.jadeSay = function(){
  const t = prompt('Circuit Envoy Sarn says:');
  if (t && t.trim()) godCmd({ cmd:'jade_say', text:t.trim() });
};
/* The war advances from the gate, so a front behind the advance is refused.
   Shift-click forces it: Jacob runs this live and a rule with no override is a
   rule that will be in the way during a session it was never written for. */
window.reachFront    = function(w,on,force){ godCmd({ cmd:'reach_front', world:w, on:!!on, force:!!force }); };
// Two clicks. The first arms, the second commits. A world changing hands on a
// live stream has no undo, so a misclick should cost a confirmation.
window.reachFlip     = function(w,side){ godCmd({ cmd:'reach_flip', world:w, side:side }); };

window.reachZone = function(w,z,patch){ godCmd(Object.assign({ cmd:'reach_zone', world:w, zone:z }, patch)); };
// Push windows are opened by hand rather than on a schedule, because the whole
// mechanic is people converging on one contest at the same time and a window
// that opens itself at 4am converges nobody.
window.reachWindow = function(w,z,mins,force){ godCmd({ cmd:'reach_window', world:w, zone:z, minutes:Number(mins)||20, force:force?1:0 }); };
window.reachWindowClose = function(w,z){ godCmd({ cmd:'reach_window_close', world:w, zone:z }); };
window.reachEnvoy = function(on){ godCmd({ cmd:'reach_envoy', on:!!on }); };
window.reachSay = function(){
  const el = document.getElementById('reach-say');
  const text = (el.value || '').trim();
  if (!text) return;
  godCmd({ cmd:'reach_say', text });
  el.value = '';
};
window.reachDemand = function(){
  godCmd({ cmd:'reach_demand',
    kind: document.getElementById('reach-demand-kind').value,
    text: document.getElementById('reach-demand-text').value,
    hours: Number(document.getElementById('reach-demand-hours').value) || 0 });
};
window.reachAnswer = function(a){ godCmd({ cmd:'reach_demand_answer', answer:a }); };
window.reachPeace  = function(){ godCmd({ cmd:'reach_peace', value:Number(document.getElementById('reach-peace').value) }); };
window.reachAccord = function(action){
  godCmd({ cmd:'reach_accord', action,
    terms: document.getElementById('reach-accord-terms').value });
};
window.reachReset = function(){ godCmd({ cmd:'reach_reset' }); };

/* THE COALITION ENTERING THE WAR. One switch, whole Reach, because a polity
   cannot be at war on Ussaleth and at peace on Khai'ru. Everything else about
   Jade is per world; this is not. Confirmed in both directions: entering is the
   largest narrative beat in the layer and withdrawing un-paints every line on
   every open battlefield, and neither is something to do with a stray click. */
window.coalitionEnter = function(on){
  const msg = on
    ? 'Declare the Coalition into the Khai\u2019sultull war?\n\nEvery line in the Reach becomes mixed, the commitment dial goes live on all ten worlds, and a headline goes out to every connected player.'
    : 'Withdraw the Coalition from the Reach war?\n\nEvery line reverts to Jade Circuit. Per-world commitment dials are kept, not cleared.';
  if (!confirm(msg)) return;
  godCmd({ cmd:'coalition_enter', value: !!on });
};

/* ═══════════════════════════════════════════════════════════════════════
   WAR CONTROLS - any faction, any battlefield, either side.

   THIS TAB WAS DELIBERATELY NOT BUILT LAST PATCH, and the reason is worth
   keeping next to it now that it exists. The roster primitive shipped first
   with nothing reading it, because a control wired to a model the field does
   not consult looks finished and does nothing - which is exactly how, in this
   codebase, the trial gate sat broken across 120 routes for four patches while
   the static checks passed. The battlefield samples ROSTER for every unit it
   spawns now, so these buttons move men.

   COMPOSED IS A MODE, NOT A SETTING. A world either runs the Reach two-faction
   model or has a hand-composed line, and the difference is whether w.roster
   exists server-side. Composing copies the derived line and takes over;
   clearing deletes it and the derived answer comes back EXACTLY, because
   nothing was ever overwritten to produce it. That is what makes this safe to
   experiment with on a live stream.
   ═══════════════════════════════════════════════════════════════════════ */
window.warRoster = function(w, side, entries){
  godCmd({ cmd:'war_roster', world:w, side:side, entries:entries });
};
window.warClear = function(w){
  if (!confirm('Return ' + (REACH_LABEL[w]||w) + ' to the Reach two-faction model?\n\n'
    + 'The composed line is deleted. Jade and the Coalition come back at whatever '
    + 'the stored dial says, which is untouched.')) return;
  godCmd({ cmd:'war_roster_clear', world:w });
};
window.warForward = function(w, fac){ godCmd({ cmd:'war_forward', world:w, fac:fac||null }); };

/* ── Force any faction into the war ───────────────────────────────────────
   WAR-WIDE, NOT PER WORLD, and that is the distinction the panel has to make
   plainly. Composing a line in the card below is a statement about ONE
   battlefield. Declaring here is a statement about the war: the faction appears
   on every line that has not been hand-composed, sharing the ground Jade is not
   holding.

   A world with a composed roster is untouched by this, which is the whole reason
   both controls can exist without fighting: the specific always beats the
   general, and a GM who has said exactly what a battlefield looks like does not
   get it rewritten by a declaration made afterwards. */
window.warBelligerent = function(fac, on){ godCmd({ cmd:'war_belligerent', fac:fac, on:!!on }); };

/* The hive lord's face. Lives on the Prawn War tab rather than with the other
   player tools because it is a casting decision about this war, not account
   administration - and because the one account it is for is the one this tab
   exists to run.
   'hive' rather than a filename: the server resolves it to whichever
   Khai'sultull portrait is installed, so this does not have to be edited the
   day a new one lands. */
window.devPortrait = function(){
  var n = document.getElementById('god-portrait-name');
  var p = document.getElementById('god-portrait-id');
  var name = n && n.value.trim();
  if (!name) { godFeedback('Enter a player name', '#ff9900'); return; }
  godCmd({ cmd:'dev_portrait', targetName:name, portrait:(p && p.value.trim()) || 'hive' });
};

/* Read the pending weights out of the row's own inputs. Kept as DOM reads at
   click time rather than as state: a GM types into three boxes and presses one
   button, and holding a shadow copy of three numbers between those two events
   is a thing that can disagree with what is on screen. */
window.warApply = function(w, side){
  var box = document.getElementById('war-' + side + '-' + w);
  if (!box) return;
  var entries = [];
  var ins = box.querySelectorAll('input[data-fac]');
  for (var i = 0; i < ins.length; i++) {
    var v = Number(ins[i].value);
    if (v > 0) entries.push({ fac: ins[i].getAttribute('data-fac'), weight: v });
  }
  if (!entries.length) { alert('A side needs at least one faction above zero.'); return; }
  warRoster(w, side, entries);
};

/* One side of one world. Weights rather than percentages, because a GM setting
   3 and 1 should not have to think about whether the numbers add to a hundred -
   the server normalises on read and never on write. */
function warSideBox(wid, side, list, ids){
  var box = document.createElement('div');
  box.id = 'war-' + side + '-' + wid;
  box.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:2px 0';
  var lab = document.createElement('span');
  lab.style.cssText = 'font-size:.54rem;letter-spacing:.10em;color:#6a6860;width:42px';
  lab.textContent = side === 'home' ? 'HOME' : 'AWAY';
  box.appendChild(lab);
  var cur = {};
  (list || []).forEach(function(e){ cur[e.fac] = e.share; });
  ids.forEach(function(f){
    var wrap = document.createElement('label');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;font-size:.52rem;color:#8f8d84';
    var t = document.createElement('span');
    t.textContent = (window.FM_FAC_API ? window.FM_FAC_API.short(f) : f.toUpperCase());
    /* The faction's own colour on its own label. A GM composing a line is
       choosing what the field will LOOK like, and naming the colours in words
       somewhere else is how a panel and a battlefield end up disagreeing. */
    var c = window.FM_FACTIONS && window.FM_FACTIONS[f];
    if (c && c.line) t.style.color = 'rgb(' + c.line.join(',') + ')';
    var inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.max = '100'; inp.step = '1';
    inp.setAttribute('data-fac', f);
    /* Seeded from the CURRENT share as a round number, so opening the panel on a
       composed world shows the line that is actually on the field rather than an
       empty form the GM has to reconstruct. */
    inp.value = cur[f] !== undefined ? Math.round(cur[f] * 100) : 0;
    inp.style.cssText = 'width:34px;background:#14140f;border:1px solid #2a2a22;'
      + 'color:#c9c6bb;font-size:.52rem;padding:1px 2px';
    wrap.appendChild(t); wrap.appendChild(inp);
    box.appendChild(wrap);
  });
  var go = document.createElement('button');
  go.className = 'rb-cam';
  go.style.cssText = 'font-size:.52rem;padding:1px 6px';
  go.textContent = 'SET';
  go.onclick = function(){ warApply(wid, side); };
  box.appendChild(go);
  return box;
}

/* The whole tab. Rendered from the same payload the Reach tab reads, because a
   second fetch is a second thing that can be stale. */
window.warRender = function(d){
  var host = document.getElementById('war-worlds');
  if (!host || !d || !d.worlds) return;

  /* The belligerent bar. Rendered above the per-world cards because it governs
     all of them, and because a GM looking for "who is in this war" should not
     have to infer it from ten line compositions. */
  var bel = document.getElementById('war-belligerents');
  if (bel) {
    var inWar = {};
    (d.belligerents || []).forEach(function(f){ inWar[f] = 1; });
    if (d.coalIn) inWar.coal = 1;
    inWar.jade = 1;
    bel.innerHTML = '';
    (window.FM_FACTIONS ? Object.keys(window.FM_FACTIONS) : []).forEach(function(f){
      var row = window.FM_FACTIONS[f];
      if (row && row.short === 'KHAI') return;      // fought, not declared
      var b = document.createElement('button');
      b.className = 'gw-b' + (inWar[f] ? ' on' : '');
      b.textContent = (window.FM_FAC_API ? window.FM_FAC_API.short(f) : f.toUpperCase())
        + (inWar[f] ? '  \u2713' : '');
      if (row && row.line && inWar[f]) b.style.color = 'rgb(' + row.line.join(',') + ')';
      if (f === 'jade') {
        b.disabled = true;
        b.title = 'The Circuit opened this war and cannot leave it.';
      } else {
        b.title = inWar[f]
          ? 'Withdraw from the war. Uncomposed lines lose them; composed lines are untouched.'
          : 'Declare into the war. They appear on every uncomposed line, sharing the ground Jade is not holding.';
        b.onclick = (function(id, on){ return function(){ warBelligerent(id, !on); }; })(f, !!inWar[f]);
      }
      bel.appendChild(b);
    });
  }
  var ids = (window.FM_FACTIONS ? Object.keys(window.FM_FACTIONS) : ['jade','coal','void','synd','guild','khai']);
  host.innerHTML = '';
  Object.keys(d.worlds).forEach(function(wid){
    var W = d.worlds[wid];
    var R = W.roster || { home:[], away:[], fwd:null };
    var row = document.createElement('div');
    row.style.cssText = 'border:1px solid #22221b;padding:5px 6px;margin-bottom:5px;background:#101009';

    var hd = document.createElement('div');
    hd.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:3px';
    var nm = document.createElement('span');
    nm.style.cssText = 'font-size:.62rem;letter-spacing:.08em;color:#c9c6bb';
    nm.textContent = (REACH_LABEL[wid] || wid).toUpperCase();
    hd.appendChild(nm);
    /* COMPOSED OR DERIVED, said plainly, because it is the one thing the shape
       of the line cannot tell you: a derived line and a composed line that
       happen to match look identical and behave differently the next time the
       Coalition dial moves. */
    var md = document.createElement('span');
    md.style.cssText = 'font-size:.52rem;letter-spacing:.10em;color:'
      + (W.composed ? '#f0b454' : '#55534c');
    md.textContent = W.composed ? 'COMPOSED' : 'REACH MODEL';
    hd.appendChild(md);
    if (W.composed) {
      var cl = document.createElement('button');
      cl.className = 'rb-cam';
      cl.style.cssText = 'font-size:.5rem;padding:0 5px';
      cl.textContent = 'REVERT';
      cl.title = 'Delete the composed line. The Reach model answer comes back exactly.';
      cl.onclick = function(){ warClear(wid); };
      hd.appendChild(cl);
    }
    row.appendChild(hd);

    row.appendChild(warSideBox(wid, 'home', R.home, ids));
    row.appendChild(warSideBox(wid, 'away', R.away, ids));

    /* Who stands forward. Only meaningful with two or more on a side, because a
       posture is a relationship between two parts of a line. */
    if ((R.home || []).length > 1) {
      var fw = document.createElement('div');
      fw.style.cssText = 'display:flex;gap:4px;align-items:center;margin-top:2px';
      var fl = document.createElement('span');
      fl.style.cssText = 'font-size:.54rem;letter-spacing:.10em;color:#6a6860;width:42px';
      fl.textContent = 'FWD';
      fw.appendChild(fl);
      R.home.forEach(function(e){
        var b = document.createElement('button');
        b.className = 'rb-cam';
        b.style.cssText = 'font-size:.52rem;padding:1px 6px'
          + (R.fwd === e.fac ? ';outline:1px solid #f0b454' : '');
        b.textContent = window.FM_FAC_API ? window.FM_FAC_API.short(e.fac) : e.fac;
        b.onclick = function(){ warForward(wid, e.fac); };
        fw.appendChild(b);
      });
    }
    host.appendChild(row);
  });
};

window.reachRender = function(d){
  if (!d) return;
  window._REACH = d;
  /* ONE PAYLOAD DRIVES BOTH TABS. War Controls could fetch its own state and
     would then be a second thing that can be stale by a different amount than
     the tab beside it. Guarded rather than assumed: the container only exists
     once the War tab has been rendered into the DOM. */
  try { if (window.warRender) window.warRender(d); } catch(e){ console.error('[War] render', e); }

  const fc = document.getElementById('reach-front-count');
  if (fc) {
    /* WHOSE WAR IT IS, next to how many fronts are open, because those are the
       two facts that frame every control below them. Jade Circuit until the
       Coalition declares: the Circuit's FTL programme made the contact and the
       brood came back down the line at them. The button is the declaration. */
    fc.textContent = '';
    const wf = document.createElement('span');
    wf.style.cssText = 'font-size:.56rem;letter-spacing:.12em;color:'
      + (d.coalIn ? '#4ecdc4' : '#9698a0');
    wf.textContent = (d.coalIn ? 'COALITION + JADE CIRCUIT' : 'JADE CIRCUIT ALONE') + '  \u00b7  ';
    const cb = document.createElement('button');
    cb.className = 'rb-cam';
    cb.style.cssText = 'font-size:.54rem;padding:1px 6px;margin-right:8px';
    cb.textContent = d.coalIn ? 'WITHDRAW COALITION' : 'DECLARE COALITION';
    cb.title = d.coalIn
      ? 'Pull the Coalition out. Every line reverts to Jade Circuit.'
      : 'Enter the Coalition into the Khai\u2019sultull war.';
    cb.onclick = function(){ coalitionEnter(!d.coalIn); };
    const ct = document.createElement('span');
    ct.style.cssText = 'font-size:.6rem;color:#8f8d84';
    ct.textContent = d.fronts + '/' + d.maxFronts + ' fronts';
    fc.appendChild(wf); fc.appendChild(cb); fc.appendChild(ct);
  }

  /* THE DIGEST GOES ABOVE EVERY CONTROL. A GM running the whole game drops into
     the Reach every few days and needs "what changed and what is waiting on me"
     before a single slider is worth showing. This gets read a hundred times for
     every time garrison is touched, so it is the first thing on the tab rather
     than a section further down.

     What needs you comes FIRST and what happened comes second. History is a
     list; a decision currently waiting is the only part that costs anything to
     miss. */
  const dg = d.digest;
  const box = document.getElementById('reach-digest');
  /* Guarded as a condition rather than an early return: a missing digest
     container must not take the world list down with it. Everything below this
     block is the actual controls. */
  if (dg && box) {
    box.innerHTML = '';
    const hd = document.createElement('div');
    hd.style.cssText = 'font-size:.56rem;letter-spacing:.14em;color:#4a4842;margin-bottom:5px';
    const away = dg.away || 0;
    hd.textContent = !dg.since ? 'SINCE THE BEGINNING'
      : away < 3600000 ? 'SINCE ' + Math.round(away/60000) + ' MINUTES AGO'
      : away < 86400000 ? 'SINCE ' + Math.round(away/3600000) + ' HOURS AGO'
      : 'SINCE ' + Math.round(away/86400000) + ' DAYS AGO';
    box.appendChild(hd);

    (dg.attention || []).forEach(function(a){
      const r = document.createElement('div');
      const col = a.kind === 'dry' ? '#c2551f' : a.kind === 'low' ? '#f0b454'
                : a.kind === 'window' ? '#f0b454' : '#4ecdc4';
      r.style.cssText = 'font-size:.62rem;color:' + col + ';margin:2px 0';
      r.textContent = '\u25c8 ' + a.text;
      box.appendChild(r);
    });
    if (!(dg.attention || []).length) {
      const r = document.createElement('div');
      r.style.cssText = 'font-size:.62rem;color:#5f6672;margin:2px 0';
      r.textContent = '\u25c8 Nothing is waiting on you.';
      box.appendChild(r);
    }

    const ev = dg.events || [];
    if (ev.length) {
      const sep = document.createElement('div');
      sep.style.cssText = 'font-size:.56rem;letter-spacing:.14em;color:#4a4842;margin:7px 0 3px';
      sep.textContent = 'WHAT HAPPENED  \u00b7  ' + ev.length + (dg.more ? ' (+' + dg.more + ' older)' : '');
      box.appendChild(sep);
      ev.slice(0, 14).forEach(function(e){
        const r = document.createElement('div');
        r.style.cssText = 'font-size:.58rem;color:#8f8d84;margin:1px 0';
        const ago = Date.now() - e.t;
        const when = ago < 3600000 ? Math.round(ago/60000) + 'm'
                   : ago < 86400000 ? Math.round(ago/3600000) + 'h'
                   : Math.round(ago/86400000) + 'd';
        r.textContent = when.padStart(3) + '  ' + e.text;
        box.appendChild(r);
      });
    }
  }

  const host = document.getElementById('reach-worlds');
  if (host) {
    host.innerHTML = '';
    /* THE ROUTE COMES FROM THE SERVER. Falling back to key order rather than to
       a hardcoded list: the order is a fact about the war layer and a copy of it
       here would be a second authority that silently disagrees the next time the
       route changes - which it just did, and which is the whole reason this
       panel was listing the advance backwards. */
    const REACH_ORDER = (d.order && d.order.length) ? d.order : Object.keys(d.worlds);
    const OPEN_AT = (typeof d.openAt === 'number') ? d.openAt : 40;
    REACH_ORDER.forEach(function(id){
      if (!d.worlds[id]) return;
      const w = d.worlds[id];
      const armed = d.armed && d.armed.world === id;
      const row = document.createElement('div');
      row.className = 'gw-card' + (armed ? ' armed' : '');
      /* THE ORDER OF THIS CARD IS THE ORDER A GM READS IT IN, which is not the
         order the controls were added in. Position on the route first, because
         after the advance was found running backwards it is the thing most
         worth being able to see at a glance; then what the ground is; then who
         is fighting; then what it costs; then what is standing on it. */
      const routeIdx = REACH_ORDER.indexOf(id);
      row.innerHTML =
        '<div class="gw-head">'
        + '<span class="gw-tag" title="Position on the advance. 1 is nearest the passage.">'
        + (routeIdx < 0 ? '--' : String(routeIdx + 1).padStart(2, '0')) + '</span>'
        + '<b class="gw-name">' + (REACH_LABEL[id]||id) + '</b>'
        + '<span class="gw-tag">' + reachTerrain(id).toUpperCase() + '</span>'
        + '<span class="gw-tag" style="color:' + (REACH_STATUS_COLOR[w.status]||'#555') + '">'
        + String(w.status).toUpperCase() + '</span>'
        + (w.front ? '<span class="gw-tag" style="color:#f0b454">FRONT OPEN</span>' : '')
        + (w.revealed ? '<span class="gw-tag" style="color:#4ecdc4">NAMED</span>' : '')
        + (armed ? '<span class="gw-tag" style="color:#f0b454">ARMED: ' + d.armed.action + '</span>' : '')
        + '<span class="gw-hive">hive ' + w.hive + '%</span>'
        + '</div>';

      function sec(t){
        const e = document.createElement('div');
        e.className = 'gw-sec'; e.textContent = t; row.appendChild(e); return e;
      }
      function mkRow(label, wide){
        const r = document.createElement('div');
        r.className = 'gw-row' + (wide ? ' wide' : '');
        const l = document.createElement('div');
        l.className = 'gw-lab'; l.textContent = label;
        const m = document.createElement('div');
        m.className = 'gw-mid';
        r.appendChild(l); r.appendChild(m);
        row.appendChild(r);
        return { row: r, mid: m };
      }
      function val(r, text, cls){
        const v = document.createElement('div');
        v.className = 'gw-val' + (cls ? ' ' + cls : '');
        v.textContent = text; r.row.appendChild(v); return v;
      }
      function btn(label, cls, fn, title){
        const b = document.createElement('button');
        b.className = 'gw-b' + (cls ? ' ' + cls : '');
        b.textContent = label; b.onclick = fn; if (title) b.title = title;
        return b;
      }
      function note(text, warn){
        const n = document.createElement('div');
        n.className = 'gw-note' + (warn ? ' warn' : '');
        n.textContent = text; row.appendChild(n); return n;
      }

      sec('GROUND');
      const hr = mkRow('HIVE HOLDS');
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = 0; sl.max = 100; sl.value = w.hive;
      sl.onchange = function(){ reachControl(id, this.value); };
      const hv = val(hr, w.hive + '%', 'hot');
      sl.oninput = function(){ hv.textContent = this.value + '%'; };
      hr.mid.appendChild(sl);

      // Garrison. Drives how hard the brood pushes back on this world.
      const gr = mkRow('GARRISON');
      const gs = document.createElement('input');
      gs.type = 'range'; gs.min = 0; gs.max = 100;
      gs.value = (w.garrison != null ? w.garrison : 50);
      const gv = val(gr, String(gs.value), 'hot');
      gs.oninput  = function(){ gv.textContent = this.value; };
      gs.onchange = function(){ reachGarrison(id, this.value); };
      gr.mid.appendChild(gs);

      sec('THE WAR');
      const wr = mkRow('FRONT', true);
      wr.mid.appendChild(btn(w.front ? 'CLOSE FRONT' : 'OPEN FRONT', w.front ? 'on' : 'go',
        function(ev){ reachFront(id, !w.front, ev && ev.shiftKey); },
        w.front ? 'Closes the front and quiets every zone on this world. Banked progress is kept.'
                : 'Opens the front and lights the first unfinished zone. Shift-click to force it out of order.'));
      wr.mid.appendChild(btn(w.revealed ? 'CONCEAL' : 'REVEAL', '',
        function(){ reachReveal(id, !w.revealed); },
        'Whether players see the true name of this world.'));
      wr.mid.appendChild(btn('TAKE', 'go', function(){ reachFlip(id, 'coalition'); },
        'Hands the world to the Coalition. Arms first: click twice to commit.'));
      wr.mid.appendChild(btn('LOSE', 'bad', function(){ reachFlip(id, 'hive'); },
        'Hands the world to the hive. Arms first: click twice to commit.'));
      /* THE ADVANCE RULE, SAID ON THE CARD RATHER THAN IN A REJECTION. The
         panel used to let a GM press OPEN FRONT and answer with an error line
         at the bottom of the screen naming two world ids. Saying it up front
         costs one line and turns a refusal into a rule. */
      if (!w.front && routeIdx > 0) {
        const prev = REACH_ORDER[routeIdx - 1];
        const pw = d.worlds[prev];
        const taken = pw ? (100 - (pw.hive || 0)) : 0;
        if (taken < 40)
          note((REACH_LABEL[prev] || prev) + ' is only ' + Math.round(taken)
             + '% taken. ' + OPEN_AT + '% is needed before this world unlocks, or shift-click OPEN FRONT to force it.', true);
      }

      // War fund. Balance, what this world burns a day, and how long the
      // balance covers the shortfall the tax does not. Days is what actually
      // gets read: a balance is a number, days is a deadline.
      sec('WHAT IT COSTS');
      const fr = mkRow('WAR FUND');
      const dl = (w.daysLeft == null ? -1 : w.daysLeft);
      const fv2 = document.createElement('span');
      fv2.style.cssText = 'font-size:.6rem;color:'
        + (w.burn ? (dl < 0 ? '#4ecdc4' : dl < 2 ? '#c2551f' : dl < 7 ? '#f0b454' : '#4ecdc4') : '#4a4842');
      /* DAYS IS THE NUMBER THAT GETS READ, not the balance. A balance is a
         quantity; days left is a deadline, and a GM deciding whether to top a
         world up is deciding about a deadline. */
      fv2.textContent = '\u0191' + Math.round(w.fund||0).toLocaleString()
        + (w.burn ? '   burn \u0191' + Math.round(w.burn).toLocaleString() + '/day'
                    + '   ' + (dl < 0 ? 'covered' : dl.toFixed(1) + 'd left')
                    + '   cover ' + Math.round((w.cover||0)*100) + '%'
                  : '   quiet, no burn');
      fr.mid.appendChild(fv2);
      const fb = document.createElement('input');
      fb.type = 'number'; fb.placeholder = '+\u0191';
      fb.style.cssText = 'width:56px;background:#0b0b10;color:#c9c7bd;border:1px solid #2a2a33;'
        + 'font-size:.58rem;padding:1px 3px';
      fb.title = 'Add to this world\u2019s war fund.';
      fb.onchange = function(){ if (this.value !== '') { reachFund(id, this.value, 'add'); this.value = ''; } };
      fr.row.appendChild(fb);

      // Jade commitment and posture. Commitment is how much of this world's
      // line is grey; posture is who stands nearer the enemy, which the
      // battlefield reads straight off the band clamp.
      const jr = mkRow('COMMITMENT');
      const js = document.createElement('input');
      /* MIN 25, NOT 0. Jade never leaves the war it opened; the ceiling is the
         Coalition's share and the floor is the constant that used to be
         JADE_MAX with the roles the other way round. The server clamps the same
         way, so a hand-sent command cannot get past this either. */
      js.type = 'range'; js.min = 25; js.max = 100;
      /* jadeDial is what the GM SET; w.jade is what is on the ground after the
         entry gate. Show the dial here, because a panel that snapped back to
         100% every time the Coalition was out would look broken rather than
         gated, and the gate is stated below instead. */
      js.value = Math.round((w.jadeDial === undefined ? (w.jade === undefined ? 1 : w.jade) : w.jadeDial) * 100);
      const jv = val(jr, js.value + '% JADE');
      js.oninput  = function(){ jv.textContent = this.value + '% JADE'; };
      js.onchange = function(){ jadeCommit(id, Number(this.value)/100, null); };
      jr.mid.appendChild(js);
      const jf = document.createElement('button');
      jf.className = 'gw-b';
      jf.textContent = (w.jadeFwd === 0) ? 'COALITION LEADS' : 'JADE LEADS';
      jf.title = 'Who holds the forward band. The battlefield reads this straight off the band clamp.';
      jf.onclick = function(){ jadeCommit(id, null, w.jadeFwd === 0 ? 1 : 0); };
      jr.mid.appendChild(jf);
      /* DISABLED, NOT HIDDEN, before the Coalition declares. A hidden control is
         a control a GM goes looking for; a dead one with a reason attached says
         what to do about it. The server refuses these commands outright rather
         than clamping them, so this is the honest face of a real refusal and not
         a cosmetic lock. */
      if (!(d && d.coalIn)) {
        js.disabled = true; jf.disabled = true;
        js.style.opacity = jf.style.opacity = '0.35';
        js.title = jf.title = 'The Coalition is not in this war. Nothing to divide.';
        jv.textContent = '100% JADE';
        note('The Coalition has not declared. Every line in the Reach is Jade until it does, '
           + 'so there is nothing to divide and no posture to set.');
      }
      // The envoy speaks into the war feed. Not per world, since the voice is
      // the faction's rather than a world's, but it lives here because this is
      // where Jade is on the panel.
      const jsy = document.createElement('button');
      jsy.className = 'gw-b';
      jsy.textContent = 'SAY';
      jsy.title = 'Transmit as Circuit Envoy Sarn. Faction-wide, not per world.';
      jsy.onclick = function(){ jadeSay(); };
      jr.mid.appendChild(jsy);

      // Works standing on this world, and what they are worth. A raid takes one
      // down; the ground it stood on is not affected and cannot be from here.
      sec('WHAT IS STANDING');
      const fwR = mkRow('WORKS', true);
      const fw = fwR.mid;
      const kinds = {};
      (w.fobs||[]).forEach(function(f){ kinds[f.type] = (kinds[f.type]||0) + 1; });
      if (!(w.fobs||[]).length && !(w.nodes||[]).length) {
        const none = document.createElement('span');
        none.style.cssText = 'font-size:.6rem;color:#4a4842';
        none.textContent = 'nothing standing';
        fw.appendChild(none);
      }
      Object.keys(kinds).forEach(function(t){
        const b = document.createElement('button');
        b.className = 'gw-b go';
        b.textContent = t.toUpperCase() + (kinds[t] > 1 ? ' x' + kinds[t] : '') + '  \u2715';
        b.title = 'Raid: destroys the work, ground unchanged';
        b.onclick = function(){ reachRaid(id, t); };
        fw.appendChild(b);
      });
      if ((w.nodes||[]).length) {
        const nd = document.createElement('span');
        nd.style.cssText = 'font-size:.6rem;color:#c2551f';
        nd.textContent = (w.nodes||[]).length + ' brood mound'
          + ((w.nodes||[]).length === 1 ? '' : 's') + '  \u00b7  +'
          + Math.round((w.mass||0)*100) + '% brood';
        fw.appendChild(nd);
      }
      // Raise one by hand. For setting a scenario up before anyone is
      // watching; the normal route is a cleared wave and a vote.
      const miss = ['bastion','pad','cut','spire'].filter(function(t){ return !kinds[t]; });
      if (miss.length) {
        const add = document.createElement('span');
        add.style.cssText = 'font-size:.56rem;color:#4a4842;margin-left:2px';
        add.textContent = 'raise:';
        fw.appendChild(add);
        miss.forEach(function(t){
          const b = document.createElement('button');
          b.className = 'rb-cam';
          b.style.cssText = 'font-size:.54rem;padding:1px 5px';
          b.textContent = '+' + t.toUpperCase();
          b.onclick = function(){ reachFob(id, t, 0); };
          fw.appendChild(b);
        });
      }

      const bn = w.bonus || {};
      if (bn.arm || bn.air || (bn.strike && bn.strike !== 1) || (bn.price && bn.price !== 1) || (bn.repel && bn.repel !== 1)) {
        const bs = document.createElement('span');
        bs.style.cssText = 'font-size:.56rem;color:#5f6672;flex-basis:100%';
        bs.textContent = 'passives  \u00b7  armour +' + Math.round((bn.arm||0)*100)
          + '  \u00b7  air +' + Math.round((bn.air||0)*100)
          + '  \u00b7  strikes x' + (bn.strike||1).toFixed(2)
          + '  \u00b7  push cost x' + (bn.price||1).toFixed(2)
          + '  \u00b7  repel x' + (bn.repel||1).toFixed(2);
        fw.appendChild(bs);
      }

      // Vote. Opening one is three buttons; closing early is one. A live vote
      // shows how many have answered against the quorum and NEVER which way,
      // same rule the funder roll follows.
      const vtR = mkRow('VOTE', true);
      const vt = vtR.mid;
      const V = w.vote;
      if (V && V.open) {
        const vs = document.createElement('span');
        vs.style.cssText = 'font-size:.6rem;color:#f0b454;flex:1';
        vs.textContent = V.kind.toUpperCase() + '  \u00b7  ' + V.ballots + '/' + V.minBallots
          + ' ballots  \u00b7  default ' + V.defaultId;
        const bc = document.createElement('button');
        bc.textContent = 'CLOSE'; bc.className = 'rb-cam';
        bc.style.cssText = 'font-size:.54rem;padding:1px 5px';
        bc.onclick = function(){ reachVoteClose(id, false); };
        const bx = document.createElement('button');
        bx.textContent = 'WITHDRAW'; bx.className = 'rb-cam';
        bx.style.cssText = 'font-size:.54rem;padding:1px 5px';
        bx.onclick = function(){ reachVoteClose(id, true); };
        vt.appendChild(vs); vt.appendChild(bc); vt.appendChild(bx);
      } else {
        ['fob','demand','jade'].forEach(function(k){
          const b = document.createElement('button');
          b.textContent = k.toUpperCase(); b.className = 'rb-cam';
          b.style.cssText = 'font-size:.54rem;padding:1px 6px';
          b.onclick = function(){ reachVote(id, k); };
          vt.appendChild(b);
        });
        const el = document.createElement('span');
        el.style.cssText = 'font-size:.56rem;color:#4a4842;margin-left:4px';
        el.textContent = (w.eligible || 0) + ' eligible';
        vt.appendChild(el);
        if (V && V.outcome) {
          const lo = document.createElement('span');
          lo.style.cssText = 'font-size:.56rem;color:#5f6672;flex-basis:100%';
          lo.textContent = V.outcome;
          vt.appendChild(lo);
        }
      }

      // Waves per zone. The escalation lever: each banked wave adds to the
      // garrison a push is PRICED against, without touching the figure above.
      const wavR = mkRow('WAVES', true);
      const wav = wavR.mid;
      const ws = document.createElement('input');
      ws.type = 'number'; ws.min = 1; ws.max = 12;
      ws.value = (w.waves != null ? w.waves : 3);
      ws.style.cssText = 'width:44px;background:#0b0b10;color:#c9c7bd;border:1px solid #2a2a33;'
        + 'font-size:.6rem;padding:1px 3px';
      ws.onchange = function(){ reachWaves(id, this.value); };
      const wb = document.createElement('span');
      wb.style.cssText = 'font-size:.56rem;color:#4a4842;letter-spacing:.06em';
      wb.textContent = (w.zones||[]).map(function(z){
        return (z.cleared|0) + '/' + (w.waves||3);
      }).join('  ');
      wav.appendChild(ws); wav.appendChild(wb);

      // Engagements. Zone count comes from the world's population, so this
      // renders whatever the server says exists rather than a fixed three.
      (w.zones||[]).forEach(function(z, zi){
        /* ENGAGEMENTS ARE INDENTED AND ON THEIR OWN GRID. They belong to the
           world above them, and a flat run of zones under a flat run of worlds
           is what made the panel unreadable: nothing said where one world's
           ground stopped and the next one's began. */
        const zr = document.createElement('div');
        zr.className = 'gw-zone';
        zr.style.borderLeft = '1px solid ' + (z.live ? '#4a3a1a' : '#1f1f27');
        zr.style.paddingLeft = '7px';
        zr.innerHTML = '<span class="zn"' + (z.live ? ' style="color:#d8d2c4"' : '') + '>'
          + z.name + '</span>';
        const zs = document.createElement('input');
        zs.type = 'range'; zs.min = 0; zs.max = 100; zs.value = z.hive;
        zs.style.cssText = 'flex:1;min-width:60px';
        zs.onchange = function(){ reachZone(id, zi, { hive:Number(this.value) }); };
        const zi2 = document.createElement('input');
        zi2.type = 'range'; zi2.min = 0; zi2.max = 100; zi2.value = z.intensity;
        zi2.title = 'Intensity';
        zi2.style.cssText = 'width:52px';
        zi2.onchange = function(){ reachZone(id, zi, { intensity:Number(this.value) }); };
        const zb = document.createElement('button');
        zb.className = 'gw-b' + (z.live ? ' on' : '');
        zb.textContent = z.live ? 'LIVE' : 'QUIET';
        zb.title = z.live ? 'Quiet this engagement. Banked progress is kept.'
                          : 'Light this engagement. The world needs an open front for it to be watchable.';
        zb.onclick = function(){ reachZone(id, zi, { live: z.live ? 0 : 1 }); };
        zr.appendChild(zs); zr.appendChild(zi2); zr.appendChild(zb);

        // Window control. Only offered where the server would accept it, so the
        // panel does not present a button whose only outcome is an error toast.
        // The one exception is the wave gate below, which is a pace rather than
        // a rule and is offered with the cost of ignoring it stated.
        const win = z.win;
        // waveAt is absolute and the forming length is one constant off the
        // payload, so this stays right between broadcasts instead of showing a
        // remaining time that was true when the state was sent.
        const _fms = (window._REACH && window._REACH.waveFormMs) || 0;
        const _left = (z.waveAt && _fms) ? Math.max(0, z.waveAt + _fms - Date.now()) : 0;
        const wb = document.createElement('button');
        wb.className = 'god-btn';
        wb.style.cssText = 'padding:2px 6px;font-size:.56rem';
        if (win && win.open) {
          wb.style.borderColor = '#4ecdc4'; wb.style.color = '#4ecdc4';
          wb.textContent = 'PULL';
          wb.title = 'Cancel the window and return every credit in it.';
          wb.onclick = function(){ reachWindowClose(id, zi); };
        } else if (w.front && z.live && z.hive > 0 && _left > 0) {
          /* The wave has not formed. Offered rather than disabled, because the
             GM is the only actor who can open a window at all and hiding the
             button would be pretending this is a rule. It is a pace, and
             running past it should take a deliberate second action. */
          var _h = Math.floor(_left / 3600000);
          var _m = Math.round((_left % 3600000) / 60000);
          wb.style.borderColor = '#553'; wb.style.color = '#7a7568';
          wb.textContent = 'WAVE ' + (_h ? _h + 'h' : _m + 'm');
          wb.title = 'The next wave has not formed yet: ' + _h + 'h ' + _m + 'm out. '
            + 'Click to open anyway; it is logged as forced.';
          wb.onclick = function(){
            if (confirm('The next wave on ' + z.name + ' has not formed (' + _h + 'h ' + _m
              + 'm out).\n\nOpen a window anyway? This runs past the intended pace and is logged.'))
              reachWindow(id, zi, 20, 1);
          };
        } else if (w.front && z.live && z.hive > 0) {
          wb.style.borderColor = '#e08a52'; wb.style.color = '#e08a52';
          wb.textContent = 'WINDOW';
          wb.title = 'Open a 20 minute push window on this engagement.';
          wb.onclick = function(){ reachWindow(id, zi, 20); };
        } else {
          wb.style.borderColor = '#2a2a24'; wb.style.color = '#3a3a34';
          wb.textContent = 'window';
          wb.disabled = true;
          wb.title = !w.front ? 'Open the front first.' : (!z.live ? 'Make the engagement live first.' : 'Already held.');
        }
        zr.appendChild(wb);

        if (win) {
          const wi = document.createElement('div');
          wi.style.cssText = 'font-size:.55rem;margin-top:2px;padding-left:10px;'
            + 'color:' + (win.open ? '#f0b454' : '#4a4842');
          wi.textContent = win.open
            ? '\u0192' + Number(win.pool).toLocaleString() + ' / \u0192' + Number(win.target).toLocaleString()
              + '  \u00b7  ' + win.funders + '/' + ((d.push && d.push.minFunders) || 4) + ' funders'
              + '  \u00b7  ' + Math.max(0, Math.round((win.closesAt - Date.now())/1000)) + 's'
            : String(win.resolved || '').toUpperCase() + ' \u00b7 ' + (win.outcome || '');
          row.appendChild(zr);
          row.appendChild(wi);
          return;
        }
        row.appendChild(zr);
      });
      host.appendChild(row);
    });
  }

  const ds = document.getElementById('reach-demand-state');
  if (ds) {
    if (!d.demand) ds.textContent = 'No demand outstanding.';
    else {
      const left = d.demand.deadline ? Math.max(0, Math.round((d.demand.deadline - Date.now())/3600000)) : null;
      ds.innerHTML = '<b style="color:#c2551f">' + String(d.demand.kind).toUpperCase() + '</b> · '
        + (d.demand.answered ? '<span style="color:#f0b454">' + d.demand.answered.toUpperCase() + '</span>'
                             : (left === null ? 'no deadline' : left + 'h remaining'))
        + '<br><span style="color:#888">' + (d.demand.text || '') + '</span>';
    }
  }

  const ev = document.getElementById('reach-envoy-state');
  if (ev) { ev.textContent = d.envoy ? 'OPEN' : 'CLOSED';
            ev.style.color = d.envoy ? '#e08a52' : '#666'; }

  const pv = document.getElementById('reach-peace');
  if (pv) { pv.value = d.peace; document.getElementById('reach-peace-val').textContent = d.peace; }

  const as = document.getElementById('reach-accord-state');
  if (as) as.innerHTML = d.accord
    ? '<b style="color:#6c9">ACCORD IN FORCE</b><br><span style="color:#888">' + (d.accord.terms||'') + '</span>'
    : '<span style="color:#4a4842">No accord.</span>';

  const lg = document.getElementById('reach-log');
  if (lg) lg.innerHTML = (d.log || []).map(function(e){
    return '<div><span style="color:#3a3a34">' + new Date(e.t).toLocaleTimeString() + '</span> '
      + '<span style="color:#666">' + e.by + '</span> ' + e.text + '</div>';
  }).join('') || '<span style="color:#3a3a34">Nothing yet.</span>';
};
