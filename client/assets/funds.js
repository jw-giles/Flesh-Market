
// ══════════════════════════════════════════════════════════════
// GUILDS / HEDGE FUNDS SYSTEM
// ══════════════════════════════════════════════════════════════

const _mfmt = n => 'Ƒ' + (Math.round(Number(n||0)*100)/100).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const _TIER = {1:'★',2:'⚖',3:'♛'};
const TYPE_LABEL  = { flsh:'FLSH', patreon:'Guild', player:'Player Fund' };
const TYPE_COLOR  = { flsh:'#ffd700', patreon:'#2ecc71', player:'#a0a0a0' };
let __currentFundId = null;
let __currentFundData = null;
let __myPlayerId_g = null;
let __isOwner_g    = false;
let __isMember_g   = false;
let __isDev_g      = false;
let __isAdmin_g    = false;
let __isPrime_g    = false;

// ── Directory ────────────────────────────────────────────────
async function loadGuildDirectory() {
  try {
    const tok = window.FM_TOKEN; if (!tok) return;
    const r = await fetch('/api/funds', { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if (!d.ok) return;
    renderGuildDirectory(d.funds);
  } catch(e) { console.warn('guild dir error', e); }
}

function renderGuildDirectory(funds) {
  const list  = document.getElementById('guild-fund-list');
  const empty = document.getElementById('guild-dir-empty');
  if (!list) return;
  if (!funds || !funds.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = funds.map(f => {
    const navStr = _mfmt(f.nav);
    const color  = TYPE_COLOR[f.type] || '#aaa';
    const label  = TYPE_LABEL[f.type] || '';
    const memberStr = `${f.memberCount}/${f.maxMembers}`;
    const savStr    = `${(f.savingsRate*100).toFixed(3)}%/hr`;
    const badge     = f.isMember ? '<span style="color:#86ff6a;font-size:.72rem">● MEMBER</span>' : '';

    // Lock indicators — server now sends f.locked
    const isFlshLocked    = f.type === 'flsh'    && f.locked;
    const isPatreonLocked = f.type === 'patreon' && f.locked;
    const lockBadge = isFlshLocked
      ? '<span style="color:#4da6ff;font-size:.68rem;opacity:.7">⬡ DEV ONLY</span>'
      : isPatreonLocked
      ? '<span style="color:#c8a040;font-size:.68rem;opacity:.7">★ PATREON</span>'
      : '';
    const cardOpacity = f.locked ? '0.55' : '1';

    return `
      <div class="g-fund-card" onclick="openFund('${f.id}')" style="cursor:pointer;opacity:${cardOpacity}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-weight:700;color:#ffb547">${f.name}</span>
            <span style="font-size:.72rem;padding:1px 7px;border-radius:8px;border:1px solid ${color};color:${color}">${label}</span>
            ${badge}${lockBadge}
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">${navStr}</div>
            <div style="font-size:.72rem;opacity:.5">NAV</div>
          </div>
        </div>
        <div style="font-size:.75rem;opacity:.55;margin-top:3px;display:flex;gap:14px">
          <span>👥 ${memberStr}</span>
          <span>💰 ${savStr}</span>
          ${f.description ? `<span style="opacity:.5;font-style:italic">${f.description.slice(0,80)}${f.description.length>80?'…':''}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ── Fund detail ──────────────────────────────────────────────
async function openFund(fundId) {
  __currentFundId = fundId;
  try {
    const tok = window.FM_TOKEN; if (!tok) return;
    const r = await fetch('/api/funds/'+fundId, { headers:{'Authorization':'Bearer '+tok} });
    const d = await r.json();
    if (!d.ok) { alert(d.error); return; }
    __currentFundData = d.fund;
    renderFundDetail(d.fund);
  } catch(e) { console.warn('openFund error', e); }
}

function renderFundDetail(f) {
  if (!f) return;
  __isOwner_g  = f.isOwner;
  __isMember_g = f.isMember;

  // Switch views
  document.getElementById('guild-dir').style.display         = 'none';
  document.getElementById('guild-detail').style.display      = 'block';
  document.getElementById('guild-create-form').style.display = 'none';

  // Header
  const nameEl = document.getElementById('g-detail-name');
  const typeEl = document.getElementById('g-detail-type-badge');
  const descEl = document.getElementById('g-detail-desc');
  if (nameEl) nameEl.textContent = f.name;
  if (typeEl) {
    typeEl.textContent  = TYPE_LABEL[f.type] || f.type;
    typeEl.style.color  = TYPE_COLOR[f.type] || '#aaa';
    typeEl.style.borderColor = TYPE_COLOR[f.type] || '#aaa';
  }
  if (descEl) descEl.textContent = f.type === 'patreon' ? 'Passive income + hedge fund access. patreon.com/FLSH' : (f.description || '');

  // Stats
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('g-d-nav',   _mfmt(f.nav));
  set('g-d-cash',  _mfmt(f.cash));
  set('g-d-myval', _mfmt(f.myValue));
  set('g-d-spp',   _mfmt(f.spp));
  set('g-savings-rate', (f.savingsRate*100).toFixed(3));

  // Holdings
  const hBox = document.getElementById('g-d-holdings');
  if (hBox) hBox.innerHTML = f.holdings?.length
    ? f.holdings.map(h=>`<div class="ticker"><span class="sym">${h.symbol}</span><span>${h.qty}× <b>${_mfmt(h.value)}</b></span></div>`).join('')
    : '<span style="opacity:.4">No positions</span>';

  // Members
  const mBox = document.getElementById('g-d-members');
  const cntEl = document.getElementById('g-member-count');
  if (cntEl) cntEl.textContent = `(${f.memberCount}/${f.maxMembers})`;
  const isPlayerFund = f.type === 'player';
  if (mBox) mBox.innerHTML = (f.members||[]).map(m=>{
    const g = _TIER[m.patreon_tier]||'';
    const own = m.isOwner ? ' 👑' : '';
    const kickBtn = (f.isOwner && !m.isOwner && isPlayerFund)
      ? `<button onclick="kickMember('${m.name}')" style="font-size:.65rem;padding:1px 5px;background:#2a0d0d;border:1px solid #4a1a1a;color:#ff8080;border-radius:4px;cursor:pointer;margin-left:4px">kick</button>`
      : '';
    return `<div class="ticker"><span>${g} ${m.name}${own}${kickBtn}</span><span>${_mfmt(m.deposited||0)} <span style="opacity:.4">deposited</span></span></div>`;
  }).join('') || '<span style="opacity:.4">No members</span>';

  // Guild bonus bar — EXCLUSIVE to Merchants Guild (patreon fund only)
  const bonusBar = document.getElementById('g-guild-bonus-bar');
  if (bonusBar) {
    if (f.type === 'patreon') {
      const guildCount = f.memberCount || 0;
      const bonusPct = guildCount; // 1% per member
      if (guildCount > 0) {
        bonusBar.innerHTML = `⚖ Guild bonus: <b style="color:#2ecc71">+${bonusPct}%</b> passive income &nbsp;<span style="opacity:.45;font-size:.7rem">(${guildCount} member${guildCount===1?'':'s'} × 1% each)</span>`;
      } else {
        bonusBar.innerHTML = `<span style="opacity:.4">No members yet — each member adds +1% to everyone's passive income</span>`;
      }
    } else {
      bonusBar.innerHTML = ''; // Player guilds do not have the passive bonus
    }
  }

  // Activity
  const aBox = document.getElementById('g-d-activity');
  if (aBox) aBox.innerHTML = (f.activity||[]).map(a=>{
    const ts = new Date(a.ts).toLocaleTimeString();
    return `<div>${ts} — ${a.note||a.type}</div>`;
  }).join('') || '<span style="opacity:.4">No activity yet</span>';

  // Panels visibility
  const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v?'block':'none'; };

  // Remove any previous lock notice
  const oldLock = document.getElementById('g-lock-notice');
  if (oldLock) oldLock.remove();

  const isDevFund     = f.type === 'flsh';
  const isPatreonFund = f.type === 'patreon';
  const canInteract   = !f.locked;

  if (!canInteract && (isDevFund || isPatreonFund)) {
    // Insert a lock notice
    const lockEl = document.createElement('div');
    lockEl.id = 'g-lock-notice';
    const lockColor = isDevFund ? '#4da6ff' : '#c8a040';
    const lockMsg   = isDevFund
      ? '⬡ This is the developer fund. Access is restricted to developer accounts.'
      : '★ This fund requires an active Patreon membership. Join at <a href="https://www.patreon.com/FLSH" target="_blank" style="color:#c8a040">patreon.com/FLSH</a>.';
    lockEl.innerHTML = lockMsg;
    lockEl.style.cssText = [
      'padding:10px 14px;margin-bottom:12px',
      'border:1px solid '+lockColor+'44',
      'border-left:3px solid '+lockColor,
      'border-radius:0 6px 6px 0',
      'font-size:.8rem;color:'+lockColor,
      'background:#0a0a0a',
      'opacity:.8',
    ].join(';');
    const detailEl = document.getElementById('guild-detail');
    const descEl2  = document.getElementById('g-detail-desc');
    if (detailEl && descEl2) detailEl.insertBefore(lockEl, descEl2.nextSibling);
  }

  show('g-dw-panel',    f.isMember && f.type !== 'player');  // non-player funds: deposit only for members
  show('g-join-panel',  !f.isMember && f.type!=='player' && f.type!=='flsh');
  show('g-slots-panel', f.isOwner);
  show('g-owner-panel', f.isOwner && f.type==='player');  // owner controls for player funds
  // For player funds, members can deposit but only owner can withdraw
  if (f.isMember && f.type === 'player') {
    show('g-dw-panel', true);
    const wBtn = document.getElementById('g-d-withdraw-btn');
    if (wBtn) wBtn.style.display = f.isOwner ? 'inline-block' : 'none';
  }
  show('g-trade-panel', f.isOwner || (isDevFund && __isDev_g) || (isPatreonFund && f.isMember));
  // Trade panel label for player funds
  const tradePanelTitle = document.querySelector('#g-trade-panel .god-section-title, #g-trade-panel div[style*="opacity:.5"]');
  if (tradePanelTitle && f.type === 'player') tradePanelTitle.textContent = 'Fund Trade (Owner Only)';

  // Show polls section only for player funds
  const pollsSection = document.getElementById('g-polls-section');
  if (pollsSection) pollsSection.style.display = (f.type === 'player' && f.isMember) ? 'block' : 'none';

  // Render polls
  renderFundPolls(f.polls || [], f.isOwner);

  const slotsInfo = document.getElementById('g-slots-info');
  if (slotsInfo) slotsInfo.textContent = `${f.memberCount}/${f.maxMembers} slots used`;
}

// ── Render polls ─────────────────────────────────────────────
function renderFundPolls(polls, isOwner) {
  const box = document.getElementById('g-polls-list');
  if (!box) return;
  if (!polls || !polls.length) { box.innerHTML = '<span style="opacity:.4">No polls yet. Create one!</span>'; return; }
  box.innerHTML = polls.map(p => {
    const totalVotes = Object.keys(p.votes || {}).length;
    const isOpen = p.status === 'open' && Date.now() < p.expires_at;
    const myVote = window.__myPlayerId_g ? p.votes[window.__myPlayerId_g] : undefined;
    const closeBtn = (isOwner && isOpen)
      ? `<button onclick="closePoll(${p.id})" style="font-size:.65rem;padding:1px 6px;background:#2a0d0d;border:1px solid #4a1a1a;color:#ff8080;border-radius:4px;cursor:pointer;margin-left:6px">Close</button>`
      : '';
    const optionHtml = (p.options||[]).map((opt, i) => {
      const count = Object.values(p.votes||{}).filter(v=>v===i).length;
      const pct = totalVotes ? Math.round(count/totalVotes*100) : 0;
      const isMyVote = myVote === i;
      const voteBtn = (isOpen && myVote === undefined)
        ? `<button onclick="votePoll(${p.id},${i})" style="font-size:.65rem;padding:1px 8px;background:#0a1a0a;border:1px solid #1a4a1a;color:#86ff6a;border-radius:4px;cursor:pointer">Vote</button>`
        : '';
      return `<div style="display:flex;align-items:center;gap:6px;padding:2px 0">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:4px">
            <span ${isMyVote ? 'style="color:#4ecdc4"' : ''}>${opt}</span>
            ${voteBtn}
            ${isMyVote ? '<span style="color:#4ecdc4;font-size:.7rem">✓ your vote</span>' : ''}
          </div>
          <div style="background:#1a1a1a;border-radius:3px;height:4px;margin-top:2px">
            <div style="background:#4ecdc4;height:4px;border-radius:3px;width:${pct}%"></div>
          </div>
        </div>
        <span style="opacity:.5;min-width:40px;text-align:right">${count} (${pct}%)</span>
      </div>`;
    }).join('');
    const statusBadge = isOpen
      ? '<span style="color:#86ff6a;font-size:.7rem">● OPEN</span>'
      : '<span style="color:#666;font-size:.7rem">● CLOSED</span>';
    return `<div style="border:1px solid #1a1a04;border-radius:5px;padding:8px;margin-bottom:6px;background:#050403">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        ${statusBadge}
        <span style="font-weight:600">${p.question}</span>
        ${closeBtn}
      </div>
      <div style="font-size:.72rem;opacity:.5;margin-bottom:6px">${totalVotes} vote${totalVotes===1?'':'s'}</div>
      ${optionHtml}
    </div>`;
  }).join('');
}

window.kickMember = async function(name) {
  if (!__currentFundId) return;
  if (!confirm(`Kick ${name} from the fund? Their shares will be returned as cash.`)) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/kick`, {targetName:name}, 'g-owner-hint', `✓ ${name} kicked`);
  if (d?.ok) openFund(__currentFundId);
};

window.votePoll = async function(pollId, optionIndex) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/poll/vote`, {pollId, optionIndex}, 'g-poll-hint', '✓ Vote cast');
  if (d?.ok) openFund(__currentFundId);
};

window.closePoll = async function(pollId) {
  if (!__currentFundId) return;
  const d = await guildPost(`/api/funds/${__currentFundId}/poll/close`, {pollId}, 'g-poll-hint', '✓ Poll closed');
  if (d?.ok) openFund(__currentFundId);
};

// ── Refresh detail (on fund_update WS push) ──────────────────
function onFundUpdate(data) {
  if (!data.fundId) return;
  if (data.fundId === __currentFundId) renderFundDetail(data);
  // Also refresh directory card if visible
  if (document.getElementById('guild-dir').style.display !== 'none') loadGuildDirectory();
}

// ── Actions ──────────────────────────────────────────────────
async function guildPost(path, body, hintId, successMsg) {
  const tok = window.FM_TOKEN; if (!tok) return null;
  const hint = hintId ? document.getElementById(hintId) : null;
  try {
    const r = await fetch(path, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (hint) {
      hint.textContent = d.ok ? (successMsg||'✓ Done') : ('✗ ' + (d.error||'Error'));
      hint.style.color = d.ok ? '#86ff6a' : '#ff6b6b';
    }
    return d;
  } catch(e) {
    if (hint) { hint.textContent = '✗ Network error'; hint.style.color = '#ff6b6b'; }
    return null;
  }
}

function initGuildUI() {
  // Back button
  document.getElementById('g-back-btn')?.addEventListener('click', () => {
    document.getElementById('guild-dir').style.display    = 'block';
    document.getElementById('guild-detail').style.display = 'none';
    __currentFundId = null;
    loadGuildDirectory();
  });

  // Create fund toggle
  document.getElementById('g-create-btn')?.addEventListener('click', () => {
    const form = document.getElementById('guild-create-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('g-create-cancel')?.addEventListener('click', () => {
    document.getElementById('guild-create-form').style.display = 'none';
  });

  // Create fund submit
  document.getElementById('g-create-submit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    const name = document.getElementById('g-new-name')?.value?.trim();
    const desc = document.getElementById('g-new-desc')?.value?.trim();
    const d = await guildPost('/api/funds/create', {name, description:desc}, 'g-create-hint', '✓ Fund created!');
    btn.disabled = false;
    if (d?.ok) {
      document.getElementById('guild-create-form').style.display = 'none';
      document.getElementById('g-new-name').value = '';
      document.getElementById('g-new-desc').value = '';
      await loadGuildDirectory();
      if (d.fundId) openFund(d.fundId);
    }
  });

  // Deposit
  document.getElementById('g-d-deposit-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const amt = parseFloat(document.getElementById('g-d-amount')?.value);
    if (!amt || amt < 1) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/deposit`, {amount:amt}, 'g-dw-hint', `✓ Deposited ${_mfmt(amt)}`);
    if (d?.ok) openFund(__currentFundId);
  });

  // Withdraw
  document.getElementById('g-d-withdraw-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const pct = parseFloat(document.getElementById('g-d-withdraw-pct')?.value);
    const d = await guildPost(`/api/funds/${__currentFundId}/withdraw`, {pct}, 'g-dw-hint');
    if (d?.ok) { document.getElementById('g-dw-hint').textContent = `✓ Withdrew ${_mfmt(d.cashOut)}`; openFund(__currentFundId); }
  });

  // Join fund
  document.getElementById('g-join-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/join`, {}, 'g-dw-hint', '✓ Joined fund');
    if (d?.ok) openFund(__currentFundId);
  });

  // Buy slot
  document.getElementById('g-buy-slot-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/buy-slots`, {count:1}, 'g-dw-hint', '✓ Slot purchased');
    if (d?.ok) openFund(__currentFundId);
  });

  // Owner withdraw
  document.getElementById('g-owner-withdraw-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const pct = parseFloat(document.getElementById('g-d-withdraw-pct-owner')?.value);
    const d = await guildPost(`/api/funds/${__currentFundId}/withdraw`, {pct}, 'g-owner-hint');
    if (d?.ok) { document.getElementById('g-owner-hint').textContent = `✓ Withdrew ${_mfmt(d.cashOut)}`; openFund(__currentFundId); }
  });

  // Assign cash to member
  document.getElementById('g-assign-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-assign-name')?.value?.trim();
    const amount = parseFloat(document.getElementById('g-assign-amt')?.value);
    if (!targetName || !amount) { const h=document.getElementById('g-owner-hint'); if(h){h.textContent='Enter member name and amount';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/assign`, {targetName,amount}, 'g-owner-hint', `✓ Assigned ${_mfmt(amount)} to ${targetName}`);
    if (d?.ok) { document.getElementById('g-assign-name').value=''; document.getElementById('g-assign-amt').value=''; openFund(__currentFundId); }
  });

  // Invite member to fund
  document.getElementById('g-invite-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const targetName = document.getElementById('g-invite-name')?.value?.trim();
    if (!targetName) { const h=document.getElementById('g-owner-hint'); if(h){h.textContent='Enter player name to invite';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/invite`, {targetName}, 'g-owner-hint', `✓ ${targetName} invited`);
    if (d?.ok) { document.getElementById('g-invite-name').value=''; openFund(__currentFundId); }
  });

  // Edit fund name/description (Ƒ250k)
  document.getElementById('g-edit-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const newName = prompt('New fund name (3-40 chars):');
    if (!newName || newName.trim().length < 3) return;
    const newDesc = prompt('New description (optional, max 200 chars):') || '';
    const h = document.getElementById('g-owner-hint');
    const d = await guildPost(`/api/funds/${__currentFundId}/edit`, {name:newName.trim(),description:newDesc.trim()}, 'g-owner-hint', `✓ Fund renamed to "${newName.trim()}"`);
    if (d?.ok) openFund(__currentFundId);
  });

  // Delete/disband fund (refund Ƒ5M)
  document.getElementById('g-delete-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    if (!confirm('Disband this fund? All members will be kicked and refunded their deposits. You will receive Ƒ5,000,000.')) return;
    if (!confirm('Are you sure? This cannot be undone.')) return;
    const d = await guildPost(`/api/funds/${__currentFundId}/delete`, {}, 'g-owner-hint', '✓ Fund disbanded');
    if (d?.ok) {
      __currentFundId = null;
      document.getElementById('g-detail')?.setAttribute('style','display:none');
      document.getElementById('g-list')?.setAttribute('style','');
      try { loadFundList(); } catch(_){}
    }
  });

  // Poll: toggle form
  document.getElementById('g-create-poll-btn')?.addEventListener('click', () => {
    const form = document.getElementById('g-poll-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('g-poll-cancel')?.addEventListener('click', () => {
    const form = document.getElementById('g-poll-form'); if(form) form.style.display = 'none';
  });
  document.getElementById('g-poll-add-opt')?.addEventListener('click', () => {
    const list = document.getElementById('g-poll-options-list');
    const opts = list.querySelectorAll('.g-poll-opt');
    if (opts.length >= 6) return;
    const inp = document.createElement('input');
    inp.className = 'input g-poll-opt';
    inp.placeholder = `Option ${opts.length+1}`;
    inp.style.cssText = 'width:100%;margin-bottom:4px;box-sizing:border-box';
    list.appendChild(inp);
  });
  document.getElementById('g-poll-submit')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const question = document.getElementById('g-poll-question')?.value?.trim();
    const options  = Array.from(document.querySelectorAll('.g-poll-opt')).map(el=>el.value.trim()).filter(Boolean);
    const d = await guildPost(`/api/funds/${__currentFundId}/poll/create`, {question,options}, 'g-poll-hint', '✓ Poll created');
    if (d?.ok) { document.getElementById('g-poll-form').style.display='none'; document.getElementById('g-poll-question').value=''; openFund(__currentFundId); }
  });

  // Execute trade
  document.getElementById('g-t-exec-btn')?.addEventListener('click', async () => {
    if (!__currentFundId) return;
    const side   = document.getElementById('g-t-side')?.value;
    const symbol = document.getElementById('g-t-sym')?.value?.toUpperCase().trim();
    const qty    = parseInt(document.getElementById('g-t-qty')?.value);
    if (!symbol || !qty) { const h=document.getElementById('g-trade-hint'); if(h){h.textContent='Symbol and qty required';h.style.color='#ff6b6b';} return; }
    const d = await guildPost(`/api/funds/${__currentFundId}/trade`, {side,symbol,qty}, 'g-trade-hint',
      `✓ ${side.toUpperCase()} ${qty}× ${symbol} executed`);
    if (d?.ok) openFund(__currentFundId);
  });
}

document.addEventListener('fm:authed', (ev) => {
  const tok = ev.detail?.token || window.FM_TOKEN || localStorage.getItem('fm_token') || '';
  wsConnect(tok);
  if (window.startApp) window.startApp(ev.detail);

  // Populate window.ME with auth data so client-side checks have correct tier/flags immediately
  window.ME = Object.assign(window.ME || {}, {
    id:           ev.detail?.token        || window.ME?.id   || '',
    token:        ev.detail?.token        || window.ME?.token|| '',
    name:         ev.detail?.name         || window.ME?.name || '',
    faction:      ev.detail?.faction      || window.ME?.faction || null,
    patreon_tier: ev.detail?.patreon_tier || 0,
    is_dev:       !!(ev.detail?.is_dev),
    is_admin:     !!(ev.detail?.is_admin),
    is_prime:     !!(ev.detail?.is_prime),
  });

  // Restore tier badge in header + show account name
  const tierBadge  = document.getElementById('fm-tier-badge');
  const tierColors = {1:'#c8a040',2:'#2ecc71',3:'#ffd700'};
  const tierGlyphs = {1:'★',2:'⚖',3:'♛'};
  const tier = ev.detail?.patreon_tier || 0;
  if (tierBadge) { tierBadge.textContent = tierGlyphs[tier]||''; tierBadge.style.color = tierColors[tier]||''; }
  // Header user display
  const hdrUser = document.getElementById('fm-header-user');
  const hdrName = document.getElementById('fm-header-name');
  const hdrBadge= document.getElementById('fm-tier-badge-hdr');
  if (hdrUser) hdrUser.style.display = 'flex';
  if (hdrName) hdrName.textContent = ev.detail?.name || '';
  if (hdrBadge){ hdrBadge.textContent = tierGlyphs[tier]||''; hdrBadge.style.color = tierColors[tier]||''; }

  // Guild tab — visible to all logged-in players (directory is public)
  const guildBtn = document.getElementById('guildTabBtn');
  if (guildBtn) guildBtn.style.display = 'inline-block';
  __isDev_g = !!(ev.detail?.is_dev);
  __isAdmin_g = !!(ev.detail?.is_admin || ev.detail?.is_dev || ev.detail?.is_prime);
  __isPrime_g = !!(ev.detail?.is_prime);
  __myPlayerId_g = ev.detail?.id || null;

  // Override header badge for owner account — deep-orange ★ instead of tier badge
  if (__isPrime_g) {
    if (tierBadge)  { tierBadge.textContent  = '★'; tierBadge.style.color  = _OWNER_COLOR; }
    if (hdrBadge)   { hdrBadge.textContent   = '★'; hdrBadge.style.color   = _OWNER_COLOR; }
    if (hdrName)    { hdrName.style.color     = _OWNER_COLOR; }
  }

  initGuildUI();
  // Load directory when guild tab is clicked (handled in tab switcher below)

  // Apply dunce state immediately if flagged — this fires before WS connects
  // so the UI is already in dunce mode by the time welcome arrives
  if (ev.detail?.is_dunced) {
    window.__IS_DUNCED = true;
    // Slight defer so DOM is fully settled after auth modal closes
    setTimeout(() => {
      try { applyDunceState('You are in the dunce corner.'); } catch(_) {}
    }, 150);
  }

  // Wire up Patreon email link button
  const linkBtn  = document.getElementById('patreon-link-btn');
  const emailInp = document.getElementById('patreon-email');
  const hint     = document.getElementById('patreon-hint');
  if (linkBtn && emailInp && hint) {
    linkBtn.onclick = async () => {
      const email = emailInp.value.trim();
      if (!email || !email.includes('@')) { hint.textContent='Enter a valid email.'; hint.style.color='#ff6b6b'; return; }
      linkBtn.disabled = true;
      linkBtn.textContent = '…';
      try {
        const r = await fetch('/api/patreon/link', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({email})
        });
        const d = await r.json();
        if (d.ok) {
          hint.textContent = '✓ Email linked. Tier will activate when Patreon confirms your membership.';
          hint.style.color = '#86ff6a';
          emailInp.value = '';
        } else {
          hint.textContent = d.error || 'Failed to link.';
          hint.style.color = '#ff6b6b';
        }
      } catch(e) {
        hint.textContent = 'Server unreachable.';
        hint.style.color = '#ff6b6b';
      }
      linkBtn.disabled = false;
      linkBtn.textContent = 'Link Account';
    };
    emailInp.addEventListener('keydown', e => { if(e.key==='Enter') linkBtn.click(); });
  }
});
