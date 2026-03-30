
// === PLINKO — Drop ball, hit multipliers ===
(function(){
  'use strict';
  const pane=document.getElementById('casino-plinko');
  if(!pane) return;

  // ── CSS ──────────────────────────────────────────────────────────
  if(!document.getElementById('plinkoCSS')){
    const st=document.createElement('style'); st.id='plinkoCSS';
    st.textContent=`
#plinko-wrap{font-family:monospace;width:100%;padding:12px 4px}
#plinko-wrap h3{margin:0 0 12px;font-size:1rem;letter-spacing:.08em;color:#e6c27a}
#plinko-canvas-wrap{position:relative;width:100%;max-width:480px;margin:0 auto 12px}
#plinko-canvas{width:100%;background:radial-gradient(ellipse at center,#0e1a2e 0%,#060a12 100%);border:1.5px solid #1a2a4a;border-radius:10px;display:block}
.plinko-info{display:flex;gap:16px;margin-bottom:10px;font-size:.9rem;flex-wrap:wrap;justify-content:center}
.plinko-info span{color:#8ab}
.plinko-info strong{color:#e6c27a}
.plinko-bet-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;justify-content:center}
.plinko-bet-row input{width:80px;padding:5px 8px;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;font-size:.9rem;font-family:monospace;border-radius:4px}
.plinko-chips{display:flex;gap:5px;flex-wrap:wrap}
.plinko-chips button,.plinko-actions button{padding:6px 12px;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.85rem;transition:background .15s}
.plinko-chips button:hover,.plinko-actions button:hover{background:#2a2200}
.plinko-actions{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;justify-content:center}
.plinko-actions button:disabled{opacity:.35;cursor:not-allowed}
.plinko-result{padding:8px 14px;border-radius:6px;font-size:1rem;margin:6px auto;text-align:center;max-width:300px}
.plinko-result.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}
.plinko-result.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}
.plinko-result.push{background:#1a1a00;border:1px solid #5a5a00;color:#ffff80}
.plinko-result.jackpot{background:#1a0a2a;border:1px solid #6a2aaa;color:#cf8aff}
#plinko-log{max-height:60px;overflow-y:auto;font-size:.72rem;color:#7a9a7a;line-height:1.4;margin-top:6px;text-align:center}
#plinko-log div{padding:1px 0}
.plinko-risk-row{display:flex;gap:6px;align-items:center;justify-content:center;margin-bottom:10px;font-size:.8rem;color:#8ab}
.plinko-risk-row button{padding:4px 10px;background:#0d0d08;border:1px solid #3a3a2a;color:#aaa;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.78rem}
.plinko-risk-row button.active{border-color:#e6c27a;color:#e6c27a;background:#1a1500}
    `;
    document.head.appendChild(st);
  }

  // ── HTML ─────────────────────────────────────────────────────────
  pane.innerHTML=`
<div id="plinko-wrap">
  <h3>Plinko</h3>
  <div class="plinko-info">
    <span>Stack: <strong id="plinko-balance">Ƒ0</strong></span>
  </div>
  <div class="plinko-risk-row">
    <span>Risk:</span>
    <button class="active" onclick="plinkoSetRisk('low')" id="plinko-risk-low">Low (Ƒ5-500)</button>
    <button onclick="plinkoSetRisk('mid')" id="plinko-risk-mid">Med (Ƒ500-5k)</button>
    <button onclick="plinkoSetRisk('high')" id="plinko-risk-high">High (Ƒ5k+)</button>
  </div>
  <div id="plinko-canvas-wrap">
    <canvas id="plinko-canvas" width="480" height="520"></canvas>
  </div>
  <div class="plinko-bet-row">
    <span style="font-size:.82rem;opacity:.6">Bet:</span>
    <input id="plinko-bet-input" type="number" min="5" max="500" value="5"/>
    <div class="plinko-chips">
      <button onclick="plinkoAddBet(10)">+10</button>
      <button onclick="plinkoAddBet(50)">+50</button>
      <button onclick="plinkoAddBet(100)">+100</button>
      <button onclick="plinkoAddBet(500)">+500</button>
    </div>
  </div>
  <div class="plinko-actions">
    <button id="plinko-btn-drop" onclick="plinkoDrop()">Drop Ball</button>
  </div>
  <div id="plinko-result-box"></div>
  <div id="plinko-log"></div>
</div>
`;

  // ── Config ───────────────────────────────────────────────────────
  const ROWS = 12;
  const SLOTS = ROWS + 1; // 13 slots at bottom
  const W = 480, H = 520;
  const PEG_RAD = 3;
  const BALL_RAD = 6;
  const TOP_PAD = 40;
  const BOT_PAD = 50;
  const ROW_H = (H - TOP_PAD - BOT_PAD) / ROWS;
  const GRAVITY = 0.25;
  const DAMPING = 0.6;
  const BOUNCE_RAND = 0.8;

  // Multipliers by risk level (13 slots, center = lowest, edges = highest)
  const MULTIPLIERS = {
    low:  [3, 1.5, 1.2, 1, 0.8, 0.5, 0.3, 0.5, 0.8, 1, 1.2, 1.5, 3],
    mid:  [8, 3, 1.5, 1, 0.5, 0.3, 0.2, 0.3, 0.5, 1, 1.5, 3, 8],
    high: [25, 8, 3, 1.5, 0.5, 0.2, 0.1, 0.2, 0.5, 1.5, 3, 8, 25],
  };

  const SLOT_COLORS = {
    low:  ['#4eaa4e','#3a8a3a','#2a6a2a','#2a5a2a','#1a4a1a','#1a3a1a','#0a2a0a','#1a3a1a','#1a4a1a','#2a5a2a','#2a6a2a','#3a8a3a','#4eaa4e'],
    mid:  ['#cf8aff','#8a5abf','#5a3a8a','#3a2a5a','#1a1a3a','#0a0a2a','#050518','#0a0a2a','#1a1a3a','#3a2a5a','#5a3a8a','#8a5abf','#cf8aff'],
    high: ['#ff4a4a','#cc3a3a','#aa2a2a','#882020','#5a1a1a','#3a0a0a','#1a0505','#3a0a0a','#5a1a1a','#882020','#aa2a2a','#cc3a3a','#ff4a4a'],
  };

  let riskLevel = 'low';
  let balls = []; // active balls in flight
  let pegs = [];  // peg positions
  let animId = null;
  let dropping = false;

  // ── Build peg grid ───────────────────────────────────────────────
  function buildPegs(){
    pegs = [];
    for(let row=0; row<ROWS; row++){
      const count = row + 3; // 3 pegs on first row, up to 14
      const spacing = W / (count + 1);
      for(let i=0; i<count; i++){
        pegs.push({ x: spacing * (i + 1), y: TOP_PAD + row * ROW_H });
      }
    }
  }
  buildPegs();

  // ── Balance helpers ──────────────────────────────────────────────
  function fmtLocal(n){ return '\u0191'+(Math.round(n*100)/100).toLocaleString(); }
  function getBalance(){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number') return ME.cash; }catch(e){}
    return 0;
  }
  function setBalance(newVal){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number'){
      ME.cash=newVal;
      try{window.__PnLLastCash=Number(newVal)||0;window.__MY_CASH=Number(newVal)||0;}catch(_){}
      try{window.PnLBridge&&typeof window.PnLBridge.pushNow==='function'&&window.PnLBridge.pushNow();}catch(_){}
    }}catch(e){}
    const c=document.getElementById('cash'); if(c) c.textContent=fmtLocal(newVal);
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(newVal)||0}));}catch(_){}
    refreshBalance();
  }
  function deltaBalance(d){ setBalance(getBalance()+d); }
  function refreshBalance(){ const b=document.getElementById('plinko-balance'); if(b) b.textContent=fmtLocal(getBalance()); }
  function plinkoLog(msg){ const box=document.getElementById('plinko-log'); if(!box) return; const d=document.createElement('div'); d.textContent=msg; box.insertBefore(d,box.firstChild); while(box.children.length>30) box.removeChild(box.lastChild); }

  // ── Bet limits per risk ────────────────────────────────────────
  const BET_LIMITS = {
    low:  { min: 5,    max: 500 },
    mid:  { min: 500,  max: 5000 },
    high: { min: 5000, max: Infinity },
  };

  window.plinkoAddBet=function(n){ const inp=document.getElementById('plinko-bet-input'); inp.value=Math.max(BET_LIMITS[riskLevel].min,(Number(inp.value)||0)+n); };

  window.plinkoSetRisk=function(level){
    riskLevel=level;
    ['low','mid','high'].forEach(l=>{
      const btn=document.getElementById('plinko-risk-'+l);
      if(btn) btn.classList.toggle('active', l===level);
    });
    const inp=document.getElementById('plinko-bet-input');
    const lim=BET_LIMITS[level];
    inp.min=lim.min;
    inp.max=lim.max===Infinity?'':lim.max;
    const cur=Number(inp.value)||0;
    if(cur<lim.min) inp.value=lim.min;
    if(lim.max!==Infinity&&cur>lim.max) inp.value=lim.max;
    draw();
  };

  // ── Drawing ──────────────────────────────────────────────────────
  const canvas = document.getElementById('plinko-canvas');
  const ctx = canvas.getContext('2d');

  function draw(){
    ctx.clearRect(0, 0, W, H);

    // Draw pegs
    for(const p of pegs){
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_RAD, 0, Math.PI*2);
      ctx.fillStyle = '#2a4a6a';
      ctx.fill();
      ctx.strokeStyle = '#4a7aaa';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Draw multiplier slots at bottom
    const mults = MULTIPLIERS[riskLevel];
    const colors = SLOT_COLORS[riskLevel];
    const slotW = W / SLOTS;
    const slotY = H - BOT_PAD + 5;
    const slotH = 32;
    for(let i=0; i<SLOTS; i++){
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * slotW + 1, slotY, slotW - 2, slotH);
      ctx.strokeStyle = 'rgba(255,255,255,.1)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(i * slotW + 1, slotY, slotW - 2, slotH);
      // Multiplier text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(mults[i] + 'x', i * slotW + slotW/2, slotY + 20);
    }

    // Draw balls
    for(const ball of balls){
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RAD, 0, Math.PI*2);
      ctx.fillStyle = ball.settled ? ball.resultColor || '#e6c27a' : '#e6c27a';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Glow
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RAD + 3, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(230,194,122,.2)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── Physics ──────────────────────────────────────────────────────
  function stepBall(ball){
    if(ball.settled) return;

    ball.vy += GRAVITY;
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Peg collisions
    for(const p of pegs){
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const minDist = PEG_RAD + BALL_RAD;
      if(dist < minDist && dist > 0){
        // Push ball out
        const nx = dx/dist, ny = dy/dist;
        ball.x = p.x + nx * minDist;
        ball.y = p.y + ny * minDist;
        // Reflect velocity
        const dot = ball.vx*nx + ball.vy*ny;
        ball.vx -= 2*dot*nx;
        ball.vy -= 2*dot*ny;
        // Damping + random deflection
        ball.vx *= DAMPING;
        ball.vy *= DAMPING;
        ball.vx += (Math.random()-0.5) * BOUNCE_RAND;
      }
    }

    // Wall bounces
    if(ball.x < BALL_RAD){ ball.x = BALL_RAD; ball.vx = Math.abs(ball.vx) * DAMPING; }
    if(ball.x > W - BALL_RAD){ ball.x = W - BALL_RAD; ball.vx = -Math.abs(ball.vx) * DAMPING; }

    // Check if landed in slot
    const slotY = H - BOT_PAD + 5;
    if(ball.y >= slotY - BALL_RAD){
      ball.y = slotY - BALL_RAD;
      ball.settled = true;
      const slotW = W / SLOTS;
      let slotIdx = Math.floor(ball.x / slotW);
      slotIdx = Math.max(0, Math.min(SLOTS-1, slotIdx));
      ball.slot = slotIdx;
      settleBall(ball);
    }
  }

  function settleBall(ball){
    const mults = MULTIPLIERS[riskLevel];
    const mult = mults[ball.slot];
    const payout = Math.round(ball.bet * mult * 100) / 100;
    const profit = payout - ball.bet;
    const colors = SLOT_COLORS[riskLevel];
    ball.resultColor = colors[ball.slot];

    deltaBalance(payout);

    if(mult >= 8){
      showResult(`JACKPOT! ${mult}x — +${fmtLocal(profit)}`, 'jackpot');
      plinkoLog(`${mult}x JACKPOT! +${fmtLocal(profit)}`);
    } else if(profit > 0){
      showResult(`${mult}x — +${fmtLocal(profit)}`, 'win');
      plinkoLog(`${mult}x win. +${fmtLocal(profit)}`);
    } else if(profit === 0){
      showResult(`${mult}x — Bet returned`, 'push');
      plinkoLog(`${mult}x push.`);
    } else {
      showResult(`${mult}x — ${fmtLocal(profit)}`, 'lose');
      plinkoLog(`${mult}x loss. ${fmtLocal(profit)}`);
    }

    // Remove ball after delay
    setTimeout(()=>{
      const idx = balls.indexOf(ball);
      if(idx >= 0) balls.splice(idx, 1);
      dropping = false;
      document.getElementById('plinko-btn-drop').disabled = false;
    }, 1500);
  }

  function showResult(msg, cls){
    const box = document.getElementById('plinko-result-box'); if(!box) return;
    box.innerHTML = `<div class="plinko-result ${cls}">${msg}</div>`;
    setTimeout(()=>{ if(box) box.innerHTML=''; }, 3000);
  }

  // ── Animation loop ───────────────────────────────────────────────
  function animate(){
    for(const ball of balls) stepBall(ball);
    draw();
    animId = requestAnimationFrame(animate);
  }
  animate();

  // ── Drop ─────────────────────────────────────────────────────────
  window.plinkoDrop=function(){
    if(dropping) return;
    const betInp = document.getElementById('plinko-bet-input');
    const lim = BET_LIMITS[riskLevel];
    const amt = Math.max(1, Number(betInp.value || 20));
    if(amt < lim.min){ plinkoLog(`Minimum bet for ${riskLevel} risk: ${fmtLocal(lim.min)}`); return; }
    if(lim.max !== Infinity && amt > lim.max){ plinkoLog(`Maximum bet for ${riskLevel} risk: ${fmtLocal(lim.max)}`); return; }
    if(amt > getBalance()){ plinkoLog('Insufficient funds.'); return; }

    dropping = true;
    document.getElementById('plinko-btn-drop').disabled = true;
    deltaBalance(-amt);
    plinkoLog(`Bet ${fmtLocal(amt)}.`);

    // Drop from random position near top center
    const startX = W/2 + (Math.random() - 0.5) * 40;
    balls.push({
      x: startX, y: 10,
      vx: (Math.random()-0.5) * 0.5,
      vy: 0,
      bet: amt,
      settled: false,
      slot: -1,
      resultColor: null,
    });
  };

  // ── Init ─────────────────────────────────────────────────────────
  refreshBalance();
  draw();

  if(window.ws) window.ws.addEventListener('message',(e)=>{
    try{ const m=JSON.parse(e.detail?.data||e.data||'{}'); if(m.type==='portfolio'||m.type==='income') refreshBalance(); }catch(_){}
  });
  document.addEventListener('fm_ws_msg',(e)=>{
    if(e.detail&&(e.detail.type==='portfolio'||e.detail.type==='income')) refreshBalance();
  });

})();
