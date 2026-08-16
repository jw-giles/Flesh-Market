
(function(){
  // --- Persistence helpers (player-scoped; server is authoritative) ---
  function playerKey(suffix){
    const pid = window.__myPlayerId_store || 'anon';
    return 'FM_' + pid + '_' + suffix;
  }
  function loadJSON(key, def){ try{ return JSON.parse(localStorage.getItem(key) || 'null') ?? def }catch(_){ return def } }
  function saveJSON(key, obj){ try{ localStorage.setItem(key, JSON.stringify(obj)) }catch(_){ } }

  const DEV_BYPASS = (window.FM_DEV?.isDevAccount === true) || (localStorage.getItem('FM_DEV_FREE_TITLES')==='1');

  // My patreon tier
  let MY_PATREON_TIER = 0;

  // Live tier upgrade without page refresh
  document.addEventListener('fm:patreon_tier_changed', ev => {
    MY_PATREON_TIER = ev.detail?.tier || 0;
    refreshAllButtons();
  });

  // owned/active are loaded from server; localStorage is just a fast-load cache
  let owned = [];
  let active = '';

  function saveState(){
    saveJSON(playerKey('ownedTitles'), owned);
    localStorage.setItem(playerKey('activeTitle'), active || '');
  }

  // On auth: set player ID, load cached state, then request server state
  document.addEventListener('fm:authed', ev => {
    window.__myPlayerId_store = ev.detail?.id || ev.detail?.token || '';
    MY_PATREON_TIER = ev.detail?.patreon_tier || 0;
    // Load cached state so UI isn't blank
    owned  = loadJSON(playerKey('ownedTitles'), []);
    active = localStorage.getItem(playerKey('activeTitle')) || '';
    refreshAllButtons();
    reflectActiveTitle();
    // Request authoritative state from server
    try{ sendWS({ type: 'get_titles' }); }catch(e){}
  });

  // Server title state response
  let available = []; // all titles player can equip (owned + special + patreon)
  let giftedTitles = []; // [{label,color,badge,rarity}] God-granted custom roles the player holds
  function giftedByLabel(name) { for (var i=0;i<giftedTitles.length;i++){ if (giftedTitles[i] && giftedTitles[i].label === name) return giftedTitles[i]; } return null; }
  document.addEventListener('fm_ws_msg', ev => {
    const msg = ev.detail;
    if (!msg) return;
    if (msg.type === 'title_state' || msg.type === 'title_updated') {
      const d = msg.data || {};
      if (Array.isArray(d.owned)) owned = d.owned;
      if (Array.isArray(d.available)) available = d.available;
      else available = [...owned]; // fallback
      if (typeof d.title === 'string') active = d.title;
      if (Array.isArray(d.gifted)) giftedTitles = d.gifted; else if (d.gifted == null && 'gifted' in d) giftedTitles = [];
      saveState();
      refreshAllButtons();
      reflectActiveTitle();
      renderTitleInventory();
    }
  });

  // --- Tier color map (no overlap with dev/patreon/mod/admin colors) ---
  const TIER_COLORS = {
    'Common': '#808080',  // mid-grey
    'Mid':    '#5b82b5',  // dusty slate-blue
    'High':   '#00d4ff',  // neon bright blue
    'Mythic': '#a83232',  // deep blood-crimson
  };


  // Patreon tier palette — mirrors server TIERS colors
  const PATREON_COLORS = {
    1: '#c8a040',  // Premium  ★
    2: '#2ecc71',  // Guild    ⚖
    3: '#9dff5a',  // CEO      ♛
  };
  const PATREON_LABELS = { 1:'Premium ★', 2:'Merchants Guild ⚖', 3:'CEO ♛' };

  // --- Titles catalogue ---
  const TITLES = [
    // Common (1k–5k)
    {tier:'Common', price:'Ƒ1k', name:'Bag Holder', blurb:'Still averaging down.'},
    {tier:'Common', price:'Ƒ2k', name:'Offal Accountant', blurb:'Tallies the biological remainder after each quarterly liquidation.'},
    {tier:'Common', price:'Ƒ3k', name:'Floor Rat', blurb:'Subsists entirely on dropped decimal points.'},
    {tier:'Common', price:'Ƒ4k', name:'Stamp Licker', blurb:'Colony permit office, third window on the left.'},
    {tier:'Common', price:'Ƒ5k', name:'Carcass Speculator', blurb:'Buys delisted tickers at bulk rates.'},
    // Mid (10k–50k)
    {tier:'Mid', price:'Ƒ10k', name:'Tariff Butcher', blurb:'Responsible for 14 collapsed trade agreements this quarter.'},
    {tier:'Mid', price:'Ƒ20k', name:'Foreclosure Priest', blurb:'Administers last rites to underwater portfolios.'},
    {tier:'Mid', price:'Ƒ30k', name:'Famine Trader', blurb:'Grain futures desk, Abaddon branch office.'},
    {tier:'Mid', price:'Ƒ40k', name:'Extraction Overseer', blurb:'Average deployment: nine days. Average colony survival post-visit: three.'},
    {tier:'Mid', price:'Ƒ50k', name:'Sanctions Profiteer', blurb:'Licensed to trade in restricted goods during active blockades.'},
    // High (100k–500k)
    {tier:'High', price:'Ƒ100k', name:'War Premium Underwriter', blurb:'Writes coverage for active war zones at a 340% markup.'},
    {tier:'High', price:'Ƒ200k', name:"Mr. Flesh's Auctioneer", blurb:'Runs the floor when Mr. Flesh is otherwise occupied.'},
    {tier:'High', price:'Ƒ300k', name:'Sovereign Debt Parasite', blurb:'Extends credit to insolvent colonies at terms they cannot read.'},
    {tier:'High', price:'Ƒ400k', name:'Cartel Notary', blurb:'Notarizes documents that technically do not exist.'},
    {tier:'High', price:'Ƒ500k', name:'Extinction Auditor', blurb:'Performs final accounting for colonies declared non-viable.'},
    // Mythic (1M–50M)
    {tier:'Mythic', price:'Ƒ1M', name:'The Last Entry', blurb:'Your name is recorded after the word TOTAL.'},
    {tier:'Mythic', price:'Ƒ2M', name:'He Who Holds The Pen', blurb:'Authors the opening prices each trading day.'},
    {tier:'Mythic', price:'Ƒ5M', name:'Scar of the Fifteenth War', blurb:"The war ended. You didn't."},
    {tier:'Mythic', price:'Ƒ10M', name:'The Yield', blurb:'Passive income on capital older than most colonies.'},
    {tier:'Mythic', price:'Ƒ50M', name:'The Central Banker', blurb:'Controls the inter-colony money supply from an undisclosed location.'},
    // Legendary (1B) — singular, contested
    {tier:'Legendary', price:'Ƒ1B', name:'President of The Coalition', blurb:'Elected by capital weight, not headcount. One seat.', singular:true},
    {tier:'Legendary', price:'Ƒ500M', name:'Overseer of The Syndicate', blurb:'The Syndicate does not vote. It notices who paid.', singular:true},
    {tier:'Legendary', price:'Ƒ500M', name:'Prime Node of The Void Collective', blurb:'The Collective has one voice. You bought the right to be it.', singular:true},
  ];

  // --- Patreon-exclusive titles (locked unless tier matches) ---
  const PATREON_TITLES = [
    {patreonTier:1, name:'Tithe Payer',              blurb:'Registered contributor to the Flesh Market operating fund.'},
    {patreonTier:1, name:'Branded Debtor',            blurb:'Carries a visible credit marker issued at time of payment.'},
    {patreonTier:2, name:'Guild Enforcer',             blurb:'Handles collections and contract disputes for the Merchants Guild.'},
    {patreonTier:2, name:'Seventh Ward Broker',        blurb:'Holds active trading licenses across all seven wards.'},
    {patreonTier:3, name:'The Tenth Seat',             blurb:'One of ten permanent board positions. Non-transferable.'},
    {patreonTier:3, name:'Apex Creditor',              blurb:'Senior creditor class. All outstanding debts settle to you first.'},
  ];

  // --- Money helpers ---
  function getBalance(){
    var cashEl = document.getElementById('cash');
    if (cashEl){ var txt = (cashEl.textContent||'').replace(/[^\d\.\-]/g,''); var val = parseFloat(txt); return isFinite(val) ? val : 0; }
    return parseFloat(localStorage.getItem('casino_balance_shadow')||'0') || 0;
  }
  function setBalance(newVal){
    var cashEl = document.getElementById('cash');
    if (cashEl){ cashEl.textContent = 'Ƒ' + (Number(newVal).toLocaleString()); try{ window.dispatchEvent(new Event('money:updated')); }catch(_){} }
    localStorage.setItem('casino_balance_shadow', String(newVal));
  }

  // --- Render Store ---
  const storeRoot = document.getElementById('storeContainer');
  const buckets = {
    'Common': storeRoot?.querySelectorAll('.store-section')[0],
    'Mid':    storeRoot?.querySelectorAll('.store-section')[1],
    'High':   storeRoot?.querySelectorAll('.store-section')[2],
    'Mythic': storeRoot?.querySelectorAll('.store-section')[3],
  };

  // President state — updated via WS
  let presidentHolder = null; // { name, id } or null

  function parsePrice(p){
    const s = String(p).replace(/[^0-9kKmM]/g,'');
    if (/m$/i.test(s)) return parseFloat(s)*1_000_000;
    if (/k$/i.test(s)) return parseFloat(s)*1_000;
    return parseFloat(s)||0;
  }
  function moneyFmt(n){
    if (n >= 1_000_000) return 'Ƒ' + (n/1_000_000).toFixed( (n%1_000_000)?1:0 ) + 'M';
    if (n >= 1_000) return 'Ƒ' + (n/1_000).toFixed( (n%1_000)?1:0 ) + 'k';
    return 'Ƒ' + Number(n).toLocaleString();
  }

  // --- Vanilla title card ---
  function rowFor(item){
    const tc = TIER_COLORS[item.tier] || '#808080';

    const row = document.createElement('div');
    row.className = 'store-row';
    row.style.cssText = [
      'display:flex;flex-direction:column',
      'border:1px solid #252525',
      'border-left:3px solid ' + tc,
      'border-radius:0 7px 7px 0',
      'padding:9px 10px 8px 12px',
      'margin-bottom:6px',
      'background:#0c0c0c',
      'transition:border-color .15s,background .15s',
    ].join(';');
    row.onmouseenter = () => {
      if (active !== item.name){ row.style.background='#101010'; row.style.borderColor=tc+' '+tc+'55 '+tc+'55 '+tc; }
    };
    row.onmouseleave = () => {
      if (active !== item.name){ row.style.background='#0c0c0c'; row.style.borderColor='#252525'; row.style.borderLeftColor=tc; }
    };

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:baseline;gap:10px';

    const nameEl = document.createElement('div');
    nameEl.className = 'store-name';
    nameEl.textContent = window.titleNameZh ? window.titleNameZh(item.name) : item.name;
    nameEl.style.cssText = 'flex:1;font-weight:700;font-size:.88rem;color:'+tc+';letter-spacing:.01em';

    const priceEl = document.createElement('div');
    priceEl.className = 'store-price';
    priceEl.textContent = item.price;
    priceEl.style.cssText = 'font-size:.78rem;color:#666;white-space:nowrap;flex-shrink:0';

    // Two buttons side-by-side when equipped
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:5px;flex-shrink:0';

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'min-width:82px;padding:4px 10px;border-radius:6px;font-size:.78rem;border:1px solid #333;color:#999';

    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'btn';
    unequipBtn.textContent = (window.t?window.t('title.unequip','Unequip'):'Unequip');
    unequipBtn.style.cssText = 'padding:4px 8px;border-radius:6px;font-size:.78rem;border:1px solid #444;color:#666;display:none';
    unequipBtn.addEventListener('click', function(e){
      e.stopPropagation();
      try{ sendWS({ type: 'unequip_title' }); }catch(err){}
      active = ''; saveState(); refreshAllButtons(); reflectActiveTitle();
    });

    function refreshBtn(){
      const isOwned  = DEV_BYPASS || owned.includes(item.name);
      const isActive = active === item.name;
      if (isActive){
        btn.textContent = '\u2713 '+(window.t?window.t('title.equipped','Equipped'):'Equipped');
        btn.disabled = true;
        btn.style.color = tc; btn.style.borderColor = tc+'88';
        unequipBtn.style.display = 'inline-block';
        row.style.background = '#0f0f0f';
        row.style.borderColor = tc+'44 #252525 #252525 '+tc;
        nameEl.style.color = tc;
      } else if (isOwned){
        btn.textContent = (window.t?window.t('title.equip','Equip'):'Equip'); btn.disabled = false;
        btn.style.color = '#aaa'; btn.style.borderColor = '#444';
        unequipBtn.style.display = 'none';
        row.style.background = '#0c0c0c'; row.style.borderColor = '#252525'; row.style.borderLeftColor = tc;
        nameEl.style.color = tc;
      } else {
        btn.textContent = (window.t?window.t('title.buy','Buy'):'Buy'); btn.disabled = false;
        btn.style.color = '#888'; btn.style.borderColor = '#333';
        unequipBtn.style.display = 'none';
        row.style.background = '#0c0c0c'; row.style.borderColor = '#252525'; row.style.borderLeftColor = tc;
        nameEl.style.color = tc;
      }
    }

    btn.addEventListener('click', function(){
      if (DEV_BYPASS){
        if (!owned.includes(item.name)) owned.push(item.name);
        active = item.name; saveState(); refreshAllButtons(); reflectActiveTitle(); return;
      }
      if (!owned.includes(item.name)){
        // Buy via server — deducts cash server-side, validates ownership
        const cost = parsePrice(item.price);
        try{ sendWS({ type: 'buy_title', title: item.name, price: cost }); }catch(err){}
        // Optimistic UI shake if obviously broke (balance known client-side)
        const bal = getBalance();
        if (bal > 0 && bal < cost){ try{ btn.classList.add('shake'); setTimeout(()=>btn.classList.remove('shake'),600); }catch(_){} }
        return; // wait for server title_updated response to refresh
      }
      // Already owned — just equip
      try{ sendWS({ type: 'set_title', title: item.name }); }catch(err){}
    });


    const blurbEl = document.createElement('div');
    blurbEl.className = 'store-blurb';
    blurbEl.textContent = window.titleBlurbZh ? window.titleBlurbZh(item.name, item.blurb) : item.blurb;
    blurbEl.style.cssText = 'font-size:.74rem;color:#555;margin-top:5px;font-style:italic;line-height:1.4';

    btnWrap.appendChild(btn); btnWrap.appendChild(unequipBtn);
    top.appendChild(nameEl); top.appendChild(priceEl); top.appendChild(btnWrap);
    row.appendChild(top); row.appendChild(blurbEl);
    row._refreshBtn = refreshBtn;
    refreshBtn();
    return row;
  }

  // --- Patreon-gated title card ---
  function patreonRowFor(item){
    const pc  = PATREON_COLORS[item.patreonTier] || '#888';
    const lbl = PATREON_LABELS[item.patreonTier] || '';

    const row = document.createElement('div');
    row.className = 'store-row';
    row.style.cssText = [
      'display:flex;flex-direction:column',
      'border:1px solid #252525',
      'border-left:3px solid '+pc,
      'border-radius:0 7px 7px 0',
      'padding:9px 10px 8px 12px',
      'margin-bottom:6px',
      'background:#0c0c0c',
      'transition:background .15s',
    ].join(';');

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:baseline;gap:10px';

    const nameEl = document.createElement('div');
    nameEl.className = 'store-name';
    nameEl.textContent = window.titleNameZh ? window.titleNameZh(item.name) : item.name;
    nameEl.style.cssText = 'flex:1;font-weight:700;font-size:.88rem;letter-spacing:.01em';

    const reqEl = document.createElement('div');
    reqEl.style.cssText = 'font-size:.68rem;padding:1px 7px;border-radius:8px;border:1px solid '+pc+'66;color:'+pc+';white-space:nowrap;flex-shrink:0';
    reqEl.textContent = lbl;

    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex;gap:5px;flex-shrink:0';

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.style.cssText = 'min-width:82px;padding:4px 10px;border-radius:6px;font-size:.78rem;border:1px solid #333;color:#999';

    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'btn';
    unequipBtn.textContent = (window.t?window.t('title.unequip','Unequip'):'Unequip');
    unequipBtn.style.cssText = 'padding:4px 8px;border-radius:6px;font-size:.78rem;border:1px solid #444;color:#666;display:none';
    unequipBtn.addEventListener('click', function(e){
      e.stopPropagation();
      try{ sendWS({ type: 'unequip_title' }); }catch(err){}
      active = ''; saveState(); refreshAllButtons(); reflectActiveTitle();
    });

    const blurbEl = document.createElement('div');
    blurbEl.className = 'store-blurb';
    blurbEl.textContent = window.titleBlurbZh ? window.titleBlurbZh(item.name, item.blurb) : item.blurb;
    blurbEl.style.cssText = 'font-size:.74rem;margin-top:5px;font-style:italic;line-height:1.4';

    function refreshBtn(){
      const unlocked = DEV_BYPASS || MY_PATREON_TIER >= item.patreonTier;
      const isActive = active === item.name;

      nameEl.style.color = unlocked ? pc : '#555';
      blurbEl.style.color = unlocked ? '#555' : '#3a3a3a';
      row.style.borderLeftColor = unlocked ? pc : '#2a2a2a';
      reqEl.style.opacity = unlocked ? '1' : '0.4';

      if (!unlocked){
        btn.textContent = '\uD83D\uDD12 '+(window.t?window.t('title.locked','Locked'):'Locked');
        btn.disabled = true;
        btn.style.color = '#444'; btn.style.borderColor = '#2a2a2a';
        unequipBtn.style.display = 'none';
      } else if (isActive){
        btn.textContent = '\u2713 '+(window.t?window.t('title.equipped','Equipped'):'Equipped'); btn.disabled = true;
        btn.style.color = pc; btn.style.borderColor = pc+'88';
        unequipBtn.style.display = 'inline-block';
        row.style.borderColor = pc+'44 #252525 #252525 '+pc;
      } else if (owned.includes(item.name)){
        btn.textContent = (window.t?window.t('title.equip','Equip'):'Equip'); btn.disabled = false;
        btn.style.color = '#aaa'; btn.style.borderColor = '#444';
        unequipBtn.style.display = 'none';
      } else {
        btn.textContent = (window.t?window.t('title.equip','Equip'):'Equip'); btn.disabled = false;
        btn.style.color = pc; btn.style.borderColor = pc+'88';
        unequipBtn.style.display = 'none';
      }
    }

    btn.addEventListener('click', function(){
      const unlocked = DEV_BYPASS || MY_PATREON_TIER >= item.patreonTier;
      if (!unlocked) return;
      if (!owned.includes(item.name)) owned.push(item.name);
      try{ sendWS({ type: 'set_title', title: item.name }); }catch(err){}
      active = item.name;
      saveState(); refreshAllButtons(); reflectActiveTitle();
    });

    btnWrap.appendChild(btn); btnWrap.appendChild(unequipBtn);
    top.appendChild(nameEl); top.appendChild(reqEl); top.appendChild(btnWrap);
    row.appendChild(top); row.appendChild(blurbEl);
    row._refreshBtn = refreshBtn;
    refreshBtn();
    return row;
  }

  const rows = [];
  TITLES.forEach(it => {
    if (it.tier === 'Legendary') return; // handled separately
    const bucket = buckets[it.tier];
    if (bucket){ const r = rowFor(it); rows.push(r); bucket.appendChild(r); }
  });

  // --- Legendary: the three offices ---
  // Was one hardcoded President card. The Syndicate and Void chairs are titles on
  // exactly the same footing, so the builder is driven by a spec list instead of
  // being duplicated three times. The Presidency still buys over WebSocket
  // because that is the handler it has always used; the two council chairs POST
  // to the council API. Both paths are server authoritative and neither trusts a
  // price sent from here.
  const legendaryList = document.getElementById('legendary-titles-list');

  const OFFICES = [
    { seat:'coalition', name:'President of The Coalition', color:'#00bfff', price:'Ƒ1B',
      perksKey:'title.presidentPerks',
      perks:'+15,000 Ƒ / 30 MIN  \u00b7  COUNCIL CHAIR, THE COALITION  \u00b7  7 DAY PROTECTED TERM  \u00b7  NEON BLUE CHAT  \u00b7  MARKET RALLY ON ELECTION  \u00b7  TITLE STRIPPED ON OVERTHROW',
      confirm:'Seize the Presidency for Ƒ1,000,000,000?\n\nThe current holder is removed from office and any Accord they tabled in Council is withdrawn and refunded to them.\n\nA sitting President serves a PROTECTED TERM OF SEVEN DAYS. If theirs has not lapsed this is refused and you are charged nothing.',
      buy:function(){ try { sendWS({ type:'buy_president' }); } catch(e){} } },

    { seat:'syndicate', name:'Overseer of The Syndicate', color:'#ff2e63', price:'Ƒ500M',
      perksKey:'title.syndicateSeatPerks',
      perks:'NO PASSIVE INCOME  \u00b7  COUNCIL CHAIR, THE SYNDICATE  \u00b7  TABLE AND SIGN BINDING ACCORDS  \u00b7  72 HOUR PROTECTED TERM  \u00b7  SYNDICATE ALLEGIANCE REQUIRED  \u00b7  TITLE STRIPPED ON OVERTHROW',
      confirm:'Take the Overseer of The Syndicate chair for Ƒ500,000,000?\n\nThis office pays NO passive income. It grants the right to table and sign binding Accords in the Council Chamber.\n\nYou must already be Syndicate aligned, and you may hold only one chair. A sitting Overseer serves a protected term of 72 hours; if theirs has not lapsed this is refused and you are charged nothing.',
      buy:function(){ councilSeatBuy('syndicate'); } },

    { seat:'void', name:'Prime Node of The Void Collective', color:'#c77dff', price:'Ƒ500M',
      perksKey:'title.voidSeatPerks',
      perks:'NO PASSIVE INCOME  \u00b7  COUNCIL CHAIR, THE VOID COLLECTIVE  \u00b7  TABLE AND SIGN BINDING ACCORDS  \u00b7  72 HOUR PROTECTED TERM  \u00b7  VOID ALLEGIANCE REQUIRED, CONVERSION IS PERMANENT  \u00b7  TITLE STRIPPED ON OVERTHROW',
      confirm:'Take the Prime Node of The Void Collective chair for Ƒ500,000,000?\n\nThis office pays NO passive income. It grants the right to table and sign binding Accords in the Council Chamber.\n\nYou must ALREADY be Void aligned, which means you have already taken the permanent cybernetic conversion. The chair is not a way in. You may hold only one chair. A sitting Prime Node serves a protected term of 72 hours; if theirs has not lapsed this is refused and you are charged nothing.',
      buy:function(){ councilSeatBuy('void'); } },
  ];

  // Live seat state for all three offices, fetched when the store builds. The
  // Presidency also keeps its own president_state WS push, which rebuilds the
  // whole rack rather than patching one card.
  let councilSeats = {};

  function councilTok(){
    return window.__fmToken || window.FM_TOKEN || localStorage.getItem('fm_token') || '';
  }

  function councilSeatBuy(seat){
    fetch(location.origin + '/api/council/seat/buy', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: councilTok(), seatId: seat })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) { alert((d && (d.msg || d.error)) || 'The chamber refused.'); return; }
      refreshCouncilSeats();
      try { if (window.__councilRefresh) window.__councilRefresh(); } catch(e){}
    }).catch(function(){ alert('The chamber is unreachable.'); });
  }

  function refreshCouncilSeats(){
    fetch(location.origin + '/api/council/state', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: councilTok() })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) return;
      councilSeats = {};
      (d.seats || []).forEach(function(sv){ councilSeats[sv.seat] = sv; });
      buildLegendaryRack();
    }).catch(function(){});
  }
  window.__refreshCouncilSeats = refreshCouncilSeats;

  function officeHolder(o){
    // The Presidency has a live WS holder; prefer it over the polled snapshot so
    // an election shows instantly instead of on the next fetch.
    if (o.seat === 'coalition' && presidentHolder) return { name: presidentHolder.name, id: presidentHolder.id };
    const sv = councilSeats[o.seat];
    return (sv && sv.holderId) ? { name: sv.holderName, id: sv.holderId } : null;
  }
  function officeTermEnds(o){
    const sv = councilSeats[o.seat];
    return sv ? (sv.termEndsAt || 0) : 0;
  }
  function termRemaining(ts){
    const d = ts - Date.now(); if (d <= 0) return '';
    const days = Math.floor(d / 86400000), hrs = Math.ceil((d % 86400000) / 3600000);
    return (window.t?window.t('title.protectedFor','PROTECTED'):'PROTECTED') + ' ' + (days > 0 ? (days + 'D ' + hrs + 'H') : (hrs + 'H'));
  }

  function buildLegendaryRack(){
    if (!legendaryList) return;
    legendaryList.innerHTML = '';
    OFFICES.forEach(function(o){
      const tc = o.color;
      const holder = officeHolder(o);
      const termEnds = officeTermEnds(o);
      const protectedNow = termEnds > Date.now();
      const myName = (window && window.ME && window.ME.name) ? window.ME.name : '';
      const mine = !!(holder && holder.name === myName);

      const card = document.createElement('div');
      card.style.cssText = [
        'border:1px solid ' + tc + '33', 'border-left:3px solid ' + tc,
        'border-radius:0 7px 7px 0', 'padding:12px 14px 11px 14px',
        'margin-bottom:6px', 'background:#04080f'
      ].join(';');

      const holderLine = document.createElement('div');
      holderLine.style.cssText = 'font-size:.68rem;letter-spacing:.1em;color:' + tc + '66;margin-bottom:8px;font-family:monospace';
      holderLine.textContent = holder
        ? ((window.t?window.t('title.currentlyHeldBy','CURRENTLY HELD BY:'):'CURRENTLY HELD BY:') + ' ' + String(holder.name).toUpperCase()
           + (protectedNow ? '  \u00b7  ' + termRemaining(termEnds) : ''))
        : (window.t?window.t('title.seatVacant','SEAT IS VACANT'):'SEAT IS VACANT');
      card.appendChild(holderLine);

      const top = document.createElement('div');
      top.style.cssText = 'display:flex;align-items:baseline;gap:10px';

      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'flex:1;font-weight:700;font-size:.92rem;color:' + tc + ';letter-spacing:.04em';
      nameEl.textContent = window.titleNameZh ? window.titleNameZh(o.name) : o.name;

      const priceEl = document.createElement('div');
      priceEl.style.cssText = 'font-size:.78rem;color:' + tc + '55;white-space:nowrap';
      priceEl.textContent = o.price;

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.cssText = 'min-width:96px;padding:4px 12px;border-radius:6px;font-size:.78rem;background:#00121d';

      if (mine) {
        btn.textContent = '\u2713 ' + (window.t?window.t('title.inOffice','In Office'):'In Office');
        btn.disabled = true; btn.style.color = tc; btn.style.border = '1px solid ' + tc + '88';
      } else if (protectedNow) {
        // Shown as protected rather than offered and then refused. The refusal is
        // free either way, but a button that always fails teaches a player the
        // feature is broken rather than that the office is held.
        btn.textContent = window.t?window.t('title.protected','Protected'):'Protected';
        btn.disabled = true; btn.style.color = '#4a5260'; btn.style.border = '1px solid #4a526055';
      } else {
        btn.textContent = holder
          ? (window.t?window.t('title.seizeOffice','Seize Office'):'Seize Office')
          : (window.t?window.t('title.claimOffice','Claim Office'):'Claim Office');
        btn.style.color = tc; btn.style.border = '1px solid ' + tc + '44';
        btn.addEventListener('click', function(){ if (!confirm(o.confirm)) return; o.buy(); });
      }

      top.appendChild(nameEl); top.appendChild(priceEl); top.appendChild(btn);

      const spec = TITLES.find(function(t){ return t.name === o.name; });
      const blurb = document.createElement('div');
      blurb.style.cssText = 'font-size:.76rem;color:' + tc + '55;margin-top:6px;font-style:italic';
      blurb.textContent = (window.titleBlurbZh && spec) ? window.titleBlurbZh(o.name, spec.blurb) : (spec ? spec.blurb : '');

      const perks = document.createElement('div');
      perks.style.cssText = 'font-size:.68rem;color:' + tc + '66;margin-top:6px;font-family:monospace;letter-spacing:.06em;line-height:1.7';
      perks.textContent = '\u2B21 ' + (window.t ? window.t(o.perksKey, o.perks) : o.perks);

      card.appendChild(top); card.appendChild(blurb); card.appendChild(perks);
      legendaryList.appendChild(card);
    });
  }

  buildLegendaryRack();
  refreshCouncilSeats();

  // Update president state from WS
  window._onPresidentState = function(data) {
    presidentHolder = data.holder || null;
    window.FM_PRESIDENT = presidentHolder; // global read for codec name-resolver + rep locks

    // The Presidency is one of three cards sharing a builder now, so an election
    // rebuilds the rack rather than patching a single card in place.
    buildLegendaryRack();
  };

  // Request president state on store open
  try { sendWS({ type: 'get_president_state' }); } catch(e) {}

  // Render patreon-exclusive titles
  const patreonRows = [];
  const patreonListEl = document.getElementById('patreon-titles-list');
  if (patreonListEl){
    PATREON_TITLES.forEach(it => {
      const r = patreonRowFor(it); patreonRows.push(r); patreonListEl.appendChild(r);
    });
  }

  // --- Title Inventory: shows all unlocked titles with equip/unequip ---
  // Color map for special titles
  const SPECIAL_TITLE_COLORS = {
    'President of The Coalition': '#00bfff',
    'Overseer of The Syndicate': '#ff2e63',
    'Prime Node of The Void Collective': '#c77dff',
    'Borg Betrayer': '#e74c3c',
    'Marked Subscriber': '#c8a040', 'Premium Wage Slave': '#c8a040',
    'Officer of the Guild': '#2ecc71', 'Merchant of the 7th Ward': '#2ecc71',
    'Corporate Apex Predator': '#9dff5a', 'Sovereign of the Ledger': '#9dff5a',
  };

  function getTitleColor(name) {
    var g = giftedByLabel(name);
    if (g && g.color) return g.color;
    if (SPECIAL_TITLE_COLORS[name]) return SPECIAL_TITLE_COLORS[name];
    const item = TITLES.find(t => t.name === name);
    if (item && TIER_COLORS[item.tier]) return TIER_COLORS[item.tier];
    return '#888';
  }

  function renderTitleInventory() {
    const block = document.getElementById('title-inventory-block');
    const list = document.getElementById('title-inventory-list');
    if (!block || !list) return;

    // Combine owned + available (deduplicated)
    const allAvail = [];
    const seen = new Set();
    for (const t of available) { if (!seen.has(t)) { allAvail.push(t); seen.add(t); } }
    for (const t of owned) { if (!seen.has(t)) { allAvail.push(t); seen.add(t); } }

    if (allAvail.length === 0) {
      block.style.display = 'none';
      return;
    }
    block.style.display = 'block';

    list.innerHTML = '';
    allAvail.forEach(function(titleName) {
      const tc = getTitleColor(titleName);
      const isActive = active === titleName;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;margin-bottom:4px;border-radius:4px;border:1px solid '+(isActive?tc+'44':'#1a1a2e')+';border-left:3px solid '+tc+';background:'+(isActive?'#0f0f0f':'#0a0a0e');

      const nameEl = document.createElement('span');
      var _g = giftedByLabel(titleName);
      nameEl.textContent = (_g && _g.badge ? _g.badge + ' ' : '') + (window.titleNameZh ? window.titleNameZh(titleName) : titleName);
      nameEl.style.cssText = 'flex:1;font-size:.80rem;font-weight:600;color:'+tc+';letter-spacing:.02em';

      const btnWrap = document.createElement('div');
      btnWrap.style.cssText = 'display:flex;gap:4px;flex-shrink:0';

      if (isActive) {
        const eqLabel = document.createElement('span');
        eqLabel.textContent = '\u2713';
        eqLabel.style.cssText = 'font-size:.74rem;color:'+tc+';padding:3px 8px';
        const unBtn = document.createElement('button');
        unBtn.textContent = (window.t?window.t('title.unequip','Unequip'):'Unequip');
        unBtn.style.cssText = 'padding:3px 8px;border-radius:3px;font-size:.70rem;border:1px solid #44444488;color:#666;background:none;cursor:pointer;font-family:inherit';
        unBtn.addEventListener('click', function() {
          try{ sendWS({ type: 'unequip_title' }); }catch(err){}
          active = ''; saveState(); refreshAllButtons(); reflectActiveTitle(); renderTitleInventory();
        });
        btnWrap.appendChild(eqLabel);
        btnWrap.appendChild(unBtn);
      } else {
        const eqBtn = document.createElement('button');
        eqBtn.textContent = (window.t?window.t('title.equip','Equip'):'Equip');
        eqBtn.style.cssText = 'padding:3px 10px;border-radius:3px;font-size:.70rem;border:1px solid '+tc+'66;color:'+tc+';background:none;cursor:pointer;font-family:inherit';
        eqBtn.addEventListener('click', function() {
          try{ sendWS({ type: 'set_title', title: titleName }); }catch(err){}
          active = titleName; saveState(); refreshAllButtons(); reflectActiveTitle(); renderTitleInventory();
        });
        btnWrap.appendChild(eqBtn);
      }

      row.appendChild(nameEl);
      row.appendChild(btnWrap);
      list.appendChild(row);
    });
  }

  function refreshAllButtons(){ rows.forEach(r => r._refreshBtn && r._refreshBtn()); patreonRows.forEach(r => r._refreshBtn && r._refreshBtn()); renderTitleInventory(); }

  // --- Active title reflection in UI ---
  function reflectActiveTitle(){
    window.FM_ACTIVE_TITLE = active || '';
    // Update equipped bar
    const bar  = document.getElementById('store-equipped-bar');
    const barName = document.getElementById('store-equipped-name');
    const barTier = document.getElementById('store-equipped-tier');
    if (bar && barName && barTier){
      if (active){
        const it = TITLES.find(t => t.name === active) || PATREON_TITLES.find(t => t.name === active);
        const tc = it ? (it.tier ? (TIER_COLORS[it.tier] || '#888') : (PATREON_COLORS[it.patreonTier] || '#888')) : '#888';
        bar.style.display = 'flex';
        bar.style.borderColor = tc + '55';
        barName.textContent = active;
        barName.style.color = tc;
        barTier.textContent = it ? it.tier : '';
        barTier.style.color = tc;
      } else {
        bar.style.display = 'none';
      }
    }
    try{ window.dispatchEvent(new Event('title:changed')); }catch(_){}
  }
  reflectActiveTitle();

  // --- Chat DOM observer: append [Title] to username prefixes "Name:" ---
  (function(){
    const chat = document.getElementById('chat');
    if (!chat) return;
    const reLead = /^(\s*[^:\[\]]{1,32}?)(:|\s-\s)/; // username up to ":" or " - "
    function tagLine(node){
      if (!window.FM_ACTIVE_TITLE) return;
      if (node.nodeType!==1) return;
      if (node.dataset && node.dataset.titled==='1') return;
      const txt = node.textContent || '';
      if (!reLead.test(txt)) return;
      const m = txt.match(reLead);
      if (!m) return;
      const name = m[1];
      const rest = txt.slice(m[0].length);
      const titled = name + " [" + window.FM_ACTIVE_TITLE + "]" + m[2] + rest;
      node.textContent = titled;
      if (node.dataset) node.dataset.titled = '1';
    }
    const obs = new MutationObserver(muts => {
      muts.forEach(mu => {
        mu.addedNodes && mu.addedNodes.forEach(tagLine);
      });
    });
    obs.observe(chat, { childList:true, subtree:true });
    // backfill existing lines
    Array.from(chat.children||[]).forEach(tagLine);
    window.addEventListener('title:changed', ()=>{
      // allow new messages to carry new title; not re-writing old ones to avoid duplication
    });
  })();

  // --- Tab switching: include Store ---
  (function(){
    function showTab(name){
      var ids = ['marketTab','pnlTab','casinoTab','guildTab','storeTab','heatTab','galacticTab','bugsTab','devlogsTab'];
      ids.forEach(function(id){
        var el = document.getElementById(id);
        if (!el) return;
        var match = (id.toLowerCase().indexOf(name)>=0);
        var useFlex = (id==='galacticTab'||id==='bugsTab');
        el.style.display = match ? (useFlex ? 'flex' : 'block') : 'none';
      });
      Array.from(document.querySelectorAll('.tab')||[]).forEach(function(t){
        var on = (t.getAttribute('data-tab')===name);
        if (on) t.classList.add('active'); else t.classList.remove('active');
      });
    }
    Array.from(document.querySelectorAll('.tab')||[]).forEach(function(t){
      t.addEventListener('click', function(){
        var name = t.getAttribute('data-tab');
        if (name) showTab(name);
      });
    });
    // Ensure store works
    window.showStoreTab = function(){ showTab('store') };
    window.showTab = showTab;
  })();

  // Expose dev toggle helper
  window.FM_DEV = window.FM_DEV || {};
  window.FM_DEV.enableFreeTitles = function(flag){
    localStorage.setItem('FM_DEV_FREE_TITLES', flag ? '1':'0');
    location.reload();
  };
})();
