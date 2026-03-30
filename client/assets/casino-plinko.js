
// === PLINKO — Pure physics, real collisions ===
(function(){
  'use strict';
  const pane=document.getElementById('casino-plinko');
  if(!pane) return;

  if(!document.getElementById('plinkoCSS')){
    const st=document.createElement('style'); st.id='plinkoCSS';
    st.textContent=`
#plinko-wrap{font-family:monospace;width:100%;padding:12px 4px}
#plinko-wrap h3{margin:0 0 10px;font-size:1rem;letter-spacing:.08em;color:#e6c27a}
#plinko-canvas{width:100%;max-width:460px;display:block;margin:0 auto 10px;background:radial-gradient(ellipse at center,#0e1a2e 0%,#060a12 100%);border:1.5px solid #1a2a4a;border-radius:10px}
.plinko-info{display:flex;gap:16px;margin-bottom:8px;font-size:.85rem;flex-wrap:wrap;justify-content:center}
.plinko-info span{color:#8ab}
.plinko-info strong{color:#e6c27a}
.plinko-bet-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;justify-content:center}
.plinko-bet-row input{width:80px;padding:5px 8px;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;font-size:.85rem;font-family:monospace;border-radius:4px}
.plinko-chips{display:flex;gap:4px;flex-wrap:wrap}
.plinko-chips button,.plinko-actions button{padding:5px 10px;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.8rem;transition:background .15s}
.plinko-chips button:hover,.plinko-actions button:hover{background:#2a2200}
.plinko-actions{display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap;justify-content:center}
.plinko-actions button:disabled{opacity:.35;cursor:not-allowed}
.plinko-result{padding:8px 14px;border-radius:6px;font-size:.95rem;margin:6px auto;text-align:center;max-width:280px}
.plinko-result.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}
.plinko-result.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}
.plinko-result.push{background:#1a1a00;border:1px solid #5a5a00;color:#ffff80}
.plinko-result.jackpot{background:#1a0a2a;border:1px solid #6a2aaa;color:#cf8aff}
#plinko-log{max-height:50px;overflow-y:auto;font-size:.7rem;color:#7a9a7a;line-height:1.4;margin-top:4px;text-align:center}
.plinko-risk-row{display:flex;gap:5px;align-items:center;justify-content:center;margin-bottom:8px;font-size:.78rem;color:#8ab}
.plinko-risk-row button{padding:3px 9px;background:#0d0d08;border:1px solid #3a3a2a;color:#aaa;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.75rem}
.plinko-risk-row button.active{border-color:#e6c27a;color:#e6c27a;background:#1a1500}
    `;
    document.head.appendChild(st);
  }

  pane.innerHTML=`
<div id="plinko-wrap">
  <h3>Plinko</h3>
  <div class="plinko-info">
    <span>Stack: <strong id="plinko-balance">\u01910</strong></span>
  </div>
  <div class="plinko-risk-row">
    <span>Risk:</span>
    <button class="active" onclick="plinkoSetRisk('low')" id="plinko-risk-low">Low (\u01915-500)</button>
    <button onclick="plinkoSetRisk('mid')" id="plinko-risk-mid">Med (\u0191500-5k)</button>
    <button onclick="plinkoSetRisk('high')" id="plinko-risk-high">High (\u01915k+)</button>
  </div>
  <canvas id="plinko-canvas" width="460" height="620"></canvas>
  <div class="plinko-bet-row">
    <span style="font-size:.78rem;opacity:.6">Bet:</span>
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

  // ── Board ────────────────────────────────────────────────────────
  const ROWS = 16;
  const SLOTS = ROWS + 1; // 17
  const W = 460, H = 620;
  const PEG_RAD = 3;
  const BALL_RAD = 3.5;
  const TOP_PAD = 30;
  const BOT_PAD = 38;
  const SLOT_H = 28;
  const PLAY_H = H - TOP_PAD - BOT_PAD - SLOT_H;
  const PEG_GAP = 24; // horizontal gap between pegs in a row

  // Multipliers (17 slots)
  const MULTIPLIERS = {
    low:  [25,  10,  5,   2,   1.3, 1.1, 1,   0.8, 0.7, 0.8, 1,   1.1, 1.3, 2,   5,   10,  25],
    mid:  [50,  20,  8,   3,   1.5, 1.1, 0.9, 0.7, 0.6, 0.7, 0.9, 1.1, 1.5, 3,   8,   20,  50],
    high: [500, 80,  20,  5,   2,   1,   0.7, 0.4, 0.4, 0.4, 0.7, 1,   2,   5,   20,  80,  500],
  };

  const SLOT_COLORS = {
    low:  ['#4eaa4e','#3a9a3a','#2a8a2a','#2a7a2a','#2a6a2a','#1a5a1a','#1a4a1a','#0a3a0a','#0a2a0a','#0a3a0a','#1a4a1a','#1a5a1a','#2a6a2a','#2a7a2a','#2a8a2a','#3a9a3a','#4eaa4e'],
    mid:  ['#cf8aff','#aa6adf','#8a5abf','#6a4a9f','#5a3a8a','#3a2a6a','#2a1a4a','#1a0a3a','#0a0a2a','#1a0a3a','#2a1a4a','#3a2a6a','#5a3a8a','#6a4a9f','#8a5abf','#aa6adf','#cf8aff'],
    high: ['#ff4a4a','#ee3a3a','#cc3a3a','#aa2a2a','#882020','#6a1a1a','#4a0a0a','#2a0505','#1a0505','#2a0505','#4a0a0a','#6a1a1a','#882020','#aa2a2a','#cc3a3a','#ee3a3a','#ff4a4a'],
  };

  const BET_LIMITS = {
    low:  { min: 5,    max: 500 },
    mid:  { min: 500,  max: 5000 },
    high: { min: 5000, max: Infinity },
  };

  let riskLevel = 'low';
  let balls = [];
  let pegs = [];
  let dropping = false;

  // ── Build pegs ───────────────────────────────────────────────────
  function buildPegs(){
    pegs = [];
    for(let row=0; row<ROWS; row++){
      const count = row + 3;
      const y = TOP_PAD + (row + 1) * (PLAY_H / (ROWS + 1));
      const totalW = (count - 1) * PEG_GAP;
      const startX = (W - totalW) / 2;
      for(let i=0; i<count; i++){
        pegs.push({ x: startX + i * PEG_GAP, y });
      }
    }
  }
  buildPegs();

  // ── Balance ──────────────────────────────────────────────────────
  function fmtLocal(n){ return '\u0191'+(Math.round(n*100)/100).toLocaleString(); }
  function getBalance(){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number') return ME.cash; }catch(e){}
    return 0;
  }
  function setBalance(v){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number'){
      ME.cash=v;
      try{window.__PnLLastCash=Number(v)||0;window.__MY_CASH=Number(v)||0;}catch(_){}
      try{window.PnLBridge&&typeof window.PnLBridge.pushNow==='function'&&window.PnLBridge.pushNow();}catch(_){}
    }}catch(e){}
    const c=document.getElementById('cash'); if(c) c.textContent=fmtLocal(v);
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(v)||0}));}catch(_){}
    refreshBalance();
  }
  function deltaBalance(d){ setBalance(getBalance()+d); }
  function refreshBalance(){ const b=document.getElementById('plinko-balance'); if(b) b.textContent=fmtLocal(getBalance()); }
  function plinkoLog(msg){ const box=document.getElementById('plinko-log'); if(!box) return; const d=document.createElement('div'); d.textContent=msg; box.insertBefore(d,box.firstChild); while(box.children.length>30) box.removeChild(box.lastChild); }

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

    // Pegs
    for(const p of pegs){
      ctx.beginPath();
      ctx.arc(p.x, p.y, PEG_RAD, 0, Math.PI*2);
      ctx.fillStyle = '#3a5a7a';
      ctx.fill();
    }

    // Slots
    const mults = MULTIPLIERS[riskLevel];
    const colors = SLOT_COLORS[riskLevel];
    const slotW = W / SLOTS;
    const slotY = H - BOT_PAD;
    for(let i=0; i<SLOTS; i++){
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * slotW + 1, slotY, slotW - 2, SLOT_H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(mults[i]+'x', i * slotW + slotW/2, slotY + 18);
    }

    // Balls
    for(const ball of balls){
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_RAD, 0, Math.PI*2);
      ctx.fillStyle = ball.settled ? (ball.color || '#e6c27a') : '#e6c27a';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // ── Physics ──────────────────────────────────────────────────────
  // Pure simulation. Ball bounces off pegs via circle-circle collision.
  // No predetermined outcome. The physics determines where it lands.
  const GRAV = 0.12;
  const FRICTION = 0.98;
  const RESTITUTION = 0.45; // bounciness off pegs
  const SUB_STEPS = 3; // sub-steps per frame for accuracy

  function stepBall(ball){
    if(ball.settled) return;

    for(let sub=0; sub<SUB_STEPS; sub++){
      ball.vy += GRAV / SUB_STEPS;
      ball.vx *= FRICTION;
      ball.x += ball.vx / SUB_STEPS;
      ball.y += ball.vy / SUB_STEPS;

      // Peg collisions
      for(const p of pegs){
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const distSq = dx*dx + dy*dy;
        const minDist = PEG_RAD + BALL_RAD;
        if(distSq < minDist * minDist && distSq > 0.01){
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          // Push ball out of peg
          const overlap = minDist - dist;
          ball.x += nx * overlap;
          ball.y += ny * overlap;

          // Reflect velocity off peg surface
          const dotVN = ball.vx * nx + ball.vy * ny;
          if(dotVN < 0){ // only bounce if moving toward peg
            ball.vx -= (1 + RESTITUTION) * dotVN * nx;
            ball.vy -= (1 + RESTITUTION) * dotVN * ny;

            // Small random nudge so ball doesn't sit on top of pegs
            ball.vx += (Math.random() - 0.5) * 0.15;
          }
        }
      }

      // Walls
      if(ball.x < BALL_RAD){ ball.x = BALL_RAD; ball.vx = Math.abs(ball.vx) * 0.3; }
      if(ball.x > W - BALL_RAD){ ball.x = W - BALL_RAD; ball.vx = -Math.abs(ball.vx) * 0.3; }

      // Floor / slot detection
      const slotY = H - BOT_PAD;
      if(ball.y >= slotY - BALL_RAD){
        ball.y = slotY - BALL_RAD;
        ball.vy = 0;
        ball.vx = 0;
        ball.settled = true;

        // Determine which slot from X position
        const slotW = W / SLOTS;
        let slotIdx = Math.floor(ball.x / slotW);
        slotIdx = Math.max(0, Math.min(SLOTS - 1, slotIdx));
        ball.slot = slotIdx;
        settleBall(ball);
        return;
      }
    }
  }

  function settleBall(ball){
    const mults = MULTIPLIERS[riskLevel];
    const mult = mults[ball.slot];
    const payout = Math.round(ball.bet * mult * 100) / 100;
    const profit = payout - ball.bet;
    ball.color = SLOT_COLORS[riskLevel][ball.slot];

    deltaBalance(payout);

    if(mult >= 10){
      showResult(`JACKPOT! ${mult}x \u2014 +${fmtLocal(profit)}`, 'jackpot');
      plinkoLog(`${mult}x JACKPOT! +${fmtLocal(profit)}`);
    } else if(profit > 0){
      showResult(`${mult}x \u2014 +${fmtLocal(profit)}`, 'win');
      plinkoLog(`${mult}x win. +${fmtLocal(profit)}`);
    } else if(profit === 0){
      showResult(`${mult}x \u2014 Bet returned`, 'push');
      plinkoLog(`${mult}x push.`);
    } else {
      showResult(`${mult}x \u2014 ${fmtLocal(profit)}`, 'lose');
      plinkoLog(`${mult}x loss. ${fmtLocal(profit)}`);
    }

    setTimeout(()=>{
      const idx = balls.indexOf(ball);
      if(idx >= 0) balls.splice(idx, 1);
      dropping = false;
      document.getElementById('plinko-btn-drop').disabled = false;
    }, 1200);
  }

  function showResult(msg, cls){
    const box = document.getElementById('plinko-result-box'); if(!box) return;
    box.innerHTML = `<div class="plinko-result ${cls}">${msg}</div>`;
    setTimeout(()=>{ if(box) box.innerHTML=''; }, 3000);
  }

  // ── Loop ─────────────────────────────────────────────────────────
  function animate(){
    for(const ball of balls) stepBall(ball);
    draw();
    requestAnimationFrame(animate);
  }
  animate();

  // ── Drop ─────────────────────────────────────────────────────────
  window.plinkoDrop=function(){
    if(dropping) return;
    const betInp = document.getElementById('plinko-bet-input');
    const lim = BET_LIMITS[riskLevel];
    const amt = Math.max(1, Number(betInp.value || 5));
    if(amt < lim.min){ plinkoLog(`Min bet ${riskLevel}: ${fmtLocal(lim.min)}`); return; }
    if(lim.max !== Infinity && amt > lim.max){ plinkoLog(`Max bet ${riskLevel}: ${fmtLocal(lim.max)}`); return; }
    if(amt > getBalance()){ plinkoLog('Insufficient funds.'); return; }

    dropping = true;
    document.getElementById('plinko-btn-drop').disabled = true;
    deltaBalance(-amt);
    plinkoLog(`Bet ${fmtLocal(amt)}.`);

    // Drop from center with tiny random offset
    balls.push({
      x: W / 2 + (Math.random() - 0.5) * 6,
      y: TOP_PAD - 10,
      vx: (Math.random() - 0.5) * 0.2,
      vy: 0,
      bet: amt,
      settled: false,
      slot: -1,
      color: null,
    });
  };

  // ── Init ─────────────────────────────────────────────────────────
  refreshBalance();
  draw();
  document.addEventListener('fm_ws_msg',(e)=>{
    if(e.detail&&(e.detail.type==='portfolio'||e.detail.type==='income')) refreshBalance();
  });

})();
