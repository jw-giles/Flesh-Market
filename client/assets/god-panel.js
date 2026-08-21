
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
    if (!window._ws || window._ws.readyState !== 1) {
      godFeedback('✗ Not connected', '#ff6b6b'); return;
    }
    window._ws.send(JSON.stringify({ type: 'god_cmd', ...payload }));
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
