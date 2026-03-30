
// === PLINKO — Mathematically balanced with animated ball ===
(function(){
  'use strict';
  const pane=document.getElementById('casino-plinko');
  if(!pane) return;

  if(!document.getElementById('plinkoCSS')){
    const st=document.createElement('style'); st.id='plinkoCSS';
    st.textContent=`
#plinko-wrap{font-family:monospace;width:100%;padding:12px 4px}
#plinko-wrap h3{margin:0 0 12px;font-size:1rem;letter-spacing:.08em;color:#e6c27a}
#plinko-canvas{width:100%;max-width:480px;display:block;margin:0 auto 12px;background:radial-gradient(ellipse at center,#0e1a2e 0%,#060a12 100%);border:1.5px solid #1a2a4a;border-radius:10px}
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
  <canvas id="plinko-canvas" width="480" height="580"></canvas>
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
  const ROWS = 16;
  const SLOTS = ROWS + 1; // 17 slots
  const W = 480, H = 580;
  const PEG_RAD = 2.5;
  const BALL_RAD = 5;
  const TOP_PAD = 35;
  const BOT_PAD = 45;
  const ROW_H = (H - TOP_PAD - BOT_PAD) / ROWS;

  // Multipliers: 17 slots for 16 rows. Binomial(16, 0.5) distribution.
  // Center slot gets ~20% of balls, edges get ~0.0015% each.
  // Verified EV: low 0.938 (6.2% edge), mid 0.904 (9.6% edge), high 0.847 (15.3% edge)
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
  let animId = null;

  // ── Build peg grid ───────────────────────────────────────────────
  function buildPegs(){
    pegs = [];
    for(let row=0; row<ROWS; row++){
      const count = row + 3;
      const spacing = W / (count + 1);
      for(let i=0; i<count; i++){
        pegs.push({ x: spacing * (i + 1), y: TOP_PAD + row * ROW_H });
      }
    }
  }
  buildPegs();

  // ── Peg positions per row (for path animation) ──────────────────
  function getPegRow(row){
    const count = row + 3;
    const spacing = W / (count + 1);
    const positions = [];
    for(let i=0; i<count; i++) positions.push(spacing * (i + 1));
    return positions;
  }

  // ── Determine outcome via binomial (pure math, no physics) ──────
  // Each row: 50/50 left or right. After 16 rows, the slot index
  // follows a binomial(16, 0.5) distribution. This is mathematically
  // guaranteed to produce a bell curve.
  function rollOutcome(){
    let slot = 0;
    const path = [{ x: W/2, y: 10 }]; // start position
    // Track position as an index offset from leftmost peg
    let pos = 0; // will accumulate rights
    for(let row=0; row<ROWS; row++){
      const goRight = Math.random() < 0.5 ? 0 : 1;
      pos += goRight;
      // Ball position: between pegs of this row
      const nextRowPegs = getPegRow(row);
      // Ball sits between peg[pos-1] and peg[pos], or at edge
      let bx;
      if(pos <= 0) bx = nextRowPegs[0] - (W / (row + 4)) * 0.5;
      else if(pos >= nextRowPegs.length) bx = nextRowPegs[nextRowPegs.length-1] + (W / (row + 4)) * 0.5;
      else bx = (nextRowPegs[pos-1] + nextRowPegs[pos]) / 2;
      // Add slight random wobble for visual interest (does NOT affect outcome)
      bx += (Math.random() - 0.5) * 6;
      const by = TOP_PAD + row * ROW_H + ROW_H * 0.5;
      path.push({ x: bx, y: by });
    }
    // Final slot: pos is 0..16 (17 possible values = 17 slots)
    slot = pos;
    // Final resting position
    const slotW = W / SLOTS;
    const finalX = slot * slotW + slotW / 2;
    const finalY = H - BOT_PAD + 5 - BALL_RAD;
    path.push({ x: finalX, y: finalY });
    return { slot, path };
  }

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
      ctx.fillStyle = '#2a4a6a';
      ctx.fill();
      ctx.strokeStyle = '#4a7aaa';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Multiplier slots
    const mults = MULTIPLIERS[riskLevel];
    const colors = SLOT_COLORS[riskLevel];
    const slotW = W / SLOTS;
    const slotY = H - BOT_PAD + 5;
    const slotH = 28;
    for(let i=0; i<SLOTS; i++){
      ctx.fillStyle = colors[i];
      ctx.fillRect(i * slotW + 1, slotY, slotW - 2, slotH);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(i * slotW + 1, slotY, slotW - 2, slotH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(mults[i]+'x', i * slotW + slotW/2, slotY + 18);
    }

    // Balls
    for(const ball of balls){
      ctx.beginPath();
      ctx.arc(ball.cx, ball.cy, BALL_RAD, 0, Math.PI*2);
      ctx.fillStyle = ball.settled ? ball.resultColor || '#e6c27a' : '#e6c27a';
      ctx.fill();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ball.cx, ball.cy, BALL_RAD + 3, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(230,194,122,.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── Animation ────────────────────────────────────────────────────
  const STEP_DURATION = 50; // ms per row transition

  function animate(){
    const now = performance.now();
    for(const ball of balls){
      if(ball.settled) continue;
      const elapsed = now - ball.startTime;
      const totalSteps = ball.path.length - 1;
      const totalDuration = totalSteps * STEP_DURATION;
      if(elapsed >= totalDuration){
        // Arrived
        const last = ball.path[ball.path.length - 1];
        ball.cx = last.x;
        ball.cy = last.y;
        ball.settled = true;
        settleBall(ball);
        continue;
      }
      // Interpolate between path points
      const progress = elapsed / STEP_DURATION;
      const stepIdx = Math.floor(progress);
      const stepFrac = progress - stepIdx;
      const from = ball.path[stepIdx];
      const to = ball.path[Math.min(stepIdx + 1, totalSteps)];
      // Ease-in-out for natural arc feel
      const t = stepFrac < 0.5 ? 2*stepFrac*stepFrac : 1 - Math.pow(-2*stepFrac+2,2)/2;
      ball.cx = from.x + (to.x - from.x) * t;
      ball.cy = from.y + (to.y - from.y) * t;
    }
    draw();
    animId = requestAnimationFrame(animate);
  }
  animate();

  function settleBall(ball){
    const mults = MULTIPLIERS[riskLevel];
    const mult = mults[ball.slot];
    const payout = Math.round(ball.bet * mult * 100) / 100;
    const profit = payout - ball.bet;
    const colors = SLOT_COLORS[riskLevel];
    ball.resultColor = colors[ball.slot];

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
      document.getElementById('plinko-btn-drop').disabled = false;
    }, 1500);
  }

  function showResult(msg, cls){
    const box = document.getElementById('plinko-result-box'); if(!box) return;
    box.innerHTML = `<div class="plinko-result ${cls}">${msg}</div>`;
    setTimeout(()=>{ if(box) box.innerHTML=''; }, 3000);
  }

  // ── Drop ─────────────────────────────────────────────────────────
  window.plinkoDrop=function(){
    if(balls.some(b => !b.settled)) return;
    const betInp = document.getElementById('plinko-bet-input');
    const lim = BET_LIMITS[riskLevel];
    const amt = Math.max(1, Number(betInp.value || 5));
    if(amt < lim.min){ plinkoLog(`Minimum bet for ${riskLevel} risk: ${fmtLocal(lim.min)}`); return; }
    if(lim.max !== Infinity && amt > lim.max){ plinkoLog(`Maximum bet for ${riskLevel} risk: ${fmtLocal(lim.max)}`); return; }
    if(amt > getBalance()){ plinkoLog('Insufficient funds.'); return; }

    document.getElementById('plinko-btn-drop').disabled = true;
    deltaBalance(-amt);
    plinkoLog(`Bet ${fmtLocal(amt)}.`);

    // Determine outcome mathematically, then animate
    const { slot, path } = rollOutcome();
    balls.push({
      cx: path[0].x, cy: path[0].y,
      path, slot,
      bet: amt,
      settled: false,
      resultColor: null,
      startTime: performance.now(),
    });
  };

  // ── Init ─────────────────────────────────────────────────────────
  refreshBalance();
  draw();

  document.addEventListener('fm_ws_msg',(e)=>{
    if(e.detail&&(e.detail.type==='portfolio'||e.detail.type==='income')) refreshBalance();
  });

})();
