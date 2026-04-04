
(function(){
  let __godVisible = false;
  let __godActiveTab = 'economy';

  window.toggleGodPanel = function() {
    const panel = document.getElementById('godPanel');
    __godVisible = !__godVisible;
    panel.style.display = __godVisible ? 'flex' : 'none';
    if (__godVisible) {
      refreshGodTickers();
      document.getElementById('godStatusDot').style.background = '#86ff6a';
    }
  };

  window.godTab = function(tab) {
    __godActiveTab = tab;
    document.querySelectorAll('.god-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.god-tab-content').forEach(d => {
      d.style.display = d.id === `godTab-${tab}` ? 'block' : 'none';
    });
    if (tab === 'market') refreshGodTickers();
    if (tab === 'players') godListAll();
    if (tab === 'comms') godCommsRefresh();
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
        <span style="color:#c8a86a">$${c.price.toFixed(2)}</span>
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
      crash:    { text: '⚠ MARKET ALERT: Emergency session convened as multiple sectors collapse — sell orders flooding exchanges across all colonial markets', tone: 'bad' },
      boom:     { text: '🚀 ECONOMIC BOOM: Record GDP growth sparks broad market rally — Coalition treasury announces surplus for first time in eight years', tone: 'good' },
      raid:     { text: '🚔 ENFORCEMENT RAID: Authority units breach facility — trading suspended pending audit, suspect accounts frozen', tone: 'bad' },
      blackout: { text: '⚡ GRID BLACKOUT: Rolling power outages disrupt operations across the sector — WraithEnergy and Aurora Electric scramble response teams', tone: 'neutral' },

      // ── Colony Battle Events ────────────────────────────────────────────
      battle_start: {
        text: () => `⚔ COLONY CONFLICT: ${fac()} mobilise at ${col()} — faction war declared, control percentages updating in real time`,
        tone: 'bad'
      },
      battle_won: {
        text: () => { const c=col(); const f=fac(); return `🏴 COLONY SEIZED: ${f} establish full control of ${c} — rival factions begin withdrawal, dividend bonuses now active for aligned players`; },
        tone: 'good'
      },
      battle_contested: {
        text: () => `⚠ CONTESTED ZONE: ${col()} enters war status — ${fac()} and ${fac2()} locked in standoff, no clear controlling faction`,
        tone: 'neutral'
      },
      battle_lost: {
        text: () => `💀 COLONY LOST: ${fac()} pushed out of ${col()} after sustained offensive — war chest depleted, control collapses`,
        tone: 'bad'
      },

      // ── Lore-specific Events ────────────────────────────────────────────
      baron_slowdown: {
        text: '⛏ GLUTTONIS DISPATCH: Baron Corps reduces refining output by 12% — freight lanes across all factions begin showing delays within the hour',
        tone: 'bad'
      },
      sweet_shortage: {
        text: "🍷 LUSTANDIA MARKETS: S'weet supply restricted following contested harvest season — grey-market prices triple overnight, Syndicate brokers implicated",
        tone: 'neutral'
      },
      null_breach: {
        text: '🔒 NULL POINT ALERT: NullSyndicate relay disruption detected — encrypted traffic rerouting, CipherHoldings and ShadowDynamics stocks volatile',
        tone: 'bad'
      },
      signal_seized: {
        text: '🚢 SIGNAL RUN UPDATE: Faction forces secure key freight relay — shipping corridor toll rates revised upward, logistics stocks reacting',
        tone: 'neutral'
      },
      abaddon_tremor: {
        text: '🔴 ABADDON CLUSTER: Seismic activity across Limbosis defence grid — automated targeting systems cycling, all approach vectors temporarily flagged hazardous',
        tone: 'bad'
      },
      guild_toll: {
        text: '⬢ MERCHANT GUILD NOTICE: Inter-colony transit fees revised — all non-Guild vessels subject to updated tariff schedule effective immediately',
        tone: 'neutral'
      },
      corporate_war: {
        text: '💼 CORPORATE WAR BULLETIN: Proxy conflict escalates across three systems — Merchant Guild intermediaries scrambling to prevent full Corporate War declaration',
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
    godSend({ cmd: 'god_broadcast', text });
    document.getElementById('god-bcast-text').value = '';
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
      godFeedback('Replacement name also triggers the filter — choose another', '#ff4444'); return;
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
            <span style="color:#888">Net Worth:</span><span style="color:#ffd700">$${(d.net_worth||0).toLocaleString(undefined,{maximumFractionDigits:2})}</span>
            <span style="color:#888">XP / Level:</span><span>${(d.xp||0).toLocaleString()} / Lv${d.level||1}</span>
            <span style="color:#888">Patreon:</span><span style="color:#c8a86a">${tierNames[d.patreon_tier||0]}</span>
            <span style="color:#888">Role:</span><span>${roleTag}</span>
          </div>
          ${Object.keys(d.holdings||{}).length > 0 ? `
            <div style="margin-top:6px;color:#888">Holdings: ${Object.entries(d.holdings).map(([s,q])=>`<span style="color:#c8a86a">${s}×${q}</span>`).join(', ')}</div>
          ` : ''}
        `;
      }
      // Also populate player search field
      document.getElementById('god-player-input').value = d.name;
      godFeedback(`✓ Loaded: ${d.name}`, '#86ff6a');
    }

    if (msg.type === 'god_player_list') {
      const el = document.getElementById('god-player-list');
      if (!el) return;
      const players = msg.data.players || [];
      if (!players.length) { el.innerHTML = '<div style="color:#666;padding:6px">No players found.</div>'; return; }
      el.innerHTML = players.map((p, i) => {
        const tierColors = { 0: '#666', 1: '#c8a86a', 2: '#4ecdc4', 3: '#ffd700' };
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
    blackout:         { cmd:'market_halt', seconds:20, reason:'Grid Blackout Event — trading suspended' },
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

})();
