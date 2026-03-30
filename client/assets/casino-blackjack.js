
// === BLACKJACK — Dealer vs You ===
(function(){
  'use strict';
  const pane=document.getElementById('casino-blackjack');
  if(!pane) return;

  // ── CSS ──────────────────────────────────────────────────────────
  if(!document.getElementById('bjCardCSS')){
    const st=document.createElement('style'); st.id='bjCardCSS';
    st.textContent=`
#bj-wrap{font-family:monospace;max-width:none;width:100%;padding:12px 4px}
#bj-wrap h3{margin:0 0 12px;font-size:1rem;letter-spacing:.08em;color:#e6c27a}
.bj-table{background:radial-gradient(ellipse at center,#0e3d1e 0%,#061a0b 100%);border:2px solid #2d5a1e;border-radius:16px;padding:24px 28px 28px;margin-bottom:14px;min-height:240px;display:flex;flex-direction:column;justify-content:space-between}
.bj-section{margin-bottom:16px}
.bj-label{font-size:.78rem;letter-spacing:.1em;color:#6a9a70;margin-bottom:6px;text-transform:uppercase}
.bj-cards{display:flex;gap:8px;flex-wrap:wrap;min-height:72px;align-items:flex-start}
.bj-card{width:52px;height:72px;border-radius:6px;border:1.5px solid #555;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:1rem;font-weight:bold;position:relative;line-height:1.1;box-shadow:0 2px 6px rgba(0,0,0,.3)}
.bj-card.back{background:linear-gradient(135deg,#2a0a6a,#4a1a9a);border-color:#6a3aaa;color:#9a6aca;font-size:1.6rem}
.bj-card.red{color:#cc2200}
.bj-card.black{color:#111}
.bj-rank{font-size:1.05rem;font-weight:900}
.bj-suit{font-size:.85rem}
.bj-total{font-size:1.1rem;color:#e6c27a;font-weight:bold;margin-left:12px}
.bj-divider{border:none;border-top:1px solid #1a3a1a;margin:12px 0}
.bj-info{display:flex;gap:20px;margin-bottom:12px;font-size:.9rem;flex-wrap:wrap}
.bj-info span{color:#8ab}
.bj-info strong{color:#e6c27a}
.bj-bet-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.bj-bet-row input{width:80px;padding:5px 8px;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;font-size:.9rem;font-family:monospace;border-radius:4px}
.bj-chips{display:flex;gap:5px;flex-wrap:wrap}
.bj-chips button,.bj-actions button{padding:6px 12px;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.85rem;transition:background .15s}
.bj-chips button:hover,.bj-actions button:hover{background:#2a2200}
.bj-actions{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.bj-actions button:disabled{opacity:.35;cursor:not-allowed}
.bj-btn-stand{border-color:#8a2020!important;color:#ff8080!important}
.bj-btn-stand:hover:not(:disabled){background:#2a0808!important}
.bj-result{padding:10px 14px;border-radius:6px;font-size:1rem;margin:8px 0;text-align:center}
.bj-result.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}
.bj-result.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}
.bj-result.push{background:#1a1a00;border:1px solid #5a5a00;color:#ffff80}
.bj-result.bj{background:#0a1a2a;border:1px solid #1a5a8a;color:#60c8ff}
#bj-log{max-height:80px;overflow-y:auto;font-size:.75rem;color:#7a9a7a;line-height:1.5;margin-top:8px}
#bj-log div{border-bottom:1px solid #1a2a1a;padding:1px 0}
    `;
    document.head.appendChild(st);
  }

  // ── HTML ─────────────────────────────────────────────────────────
  pane.innerHTML=`
<div id="bj-wrap">
  <h3>Blackjack</h3>
  <div class="bj-info">
    <span>Stack: <strong id="bj-balance">Ƒ0</strong></span>
    <span>Shoe: <strong id="bj-shoe-lbl">6 decks</strong></span>
  </div>
  <div class="bj-table">
    <div class="bj-section">
      <div class="bj-label">Dealer <span class="bj-total" id="bj-dealer-total"></span></div>
      <div class="bj-cards" id="bj-dealer-hand"></div>
    </div>
    <hr class="bj-divider">
    <div class="bj-section">
      <div class="bj-label">Your hand <span class="bj-total" id="bj-player-total"></span></div>
      <div class="bj-cards" id="bj-player-hand"></div>
    </div>
  </div>
  <div class="bj-bet-row">
    <span style="font-size:.82rem;opacity:.6">Bet:</span>
    <input id="bj-bet-input" type="number" min="1" value="20"/>
    <div class="bj-chips">
      <button onclick="bjAddBet(10)">+10</button>
      <button onclick="bjAddBet(25)">+25</button>
      <button onclick="bjAddBet(100)">+100</button>
      <button onclick="bjAddBet(500)">+500</button>
      <button onclick="bjMaxBet()">MAX</button>
    </div>
  </div>
  <div class="bj-actions" id="bj-actions">
    <button id="bj-btn-deal" onclick="bjDeal()">Deal</button>
    <button id="bj-btn-hit" onclick="bjHit()" disabled>Hit</button>
    <button id="bj-btn-stand" class="bj-btn-stand" onclick="bjStand()" disabled>Stand</button>
    <button id="bj-btn-double" onclick="bjDouble()" disabled>Double</button>
  </div>
  <div style="font-size:.72rem;opacity:.45;margin-bottom:6px">6-deck shoe · Dealer stands soft 17 · Blackjack 3:2 · No splits/insurance</div>
  <div id="bj-result-box"></div>
  <div id="bj-log"></div>
</div>
`;

  // ── Card engine ──────────────────────────────────────────────────
  const RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  const SUITS=['\u2660','\u2665','\u2666','\u2663'];
  const SUIT_COLOR={'\u2660':'black','\u2663':'black','\u2665':'red','\u2666':'red'};
  function makeDeck(){ const d=[]; for(const s of SUITS) for(const r of RANKS) d.push({r,s}); return d; }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; } return a; }

  function Shoe(decks=6){
    let cards=[],idx=0,cutAt=0;
    function reset(){
      cards=[]; for(let i=0;i<decks;i++) cards=cards.concat(makeDeck()); shuffle(cards);
      idx=0; const pen=0.65+Math.random()*0.1; cutAt=Math.floor(cards.length*pen); updateShoe();
    }
    function updateShoe(){
      const left=Math.max(cards.length-idx,0); const pct=((idx/cards.length)*100)|0;
      const el=document.getElementById('bj-shoe-lbl'); if(el) el.textContent=`${decks}d · ${pct}% used · ${left} left`;
    }
    function draw(){ if(idx>=cutAt){ bjLog('Shuffling shoe...'); reset(); } const c=cards[idx++]; updateShoe(); return c; }
    reset(); return {draw,reset};
  }
  const shoe=Shoe(6);

  function cardVal(c){ if(c.r==='A') return [1,11]; if(['K','Q','J','10'].includes(c.r)) return [10]; return [Number(c.r)]; }
  function handTotal(hand){
    let sums=[0];
    for(const c of hand){ const vals=cardVal(c); const next=[]; for(const s of sums) for(const v of vals) next.push(s+v); sums=next; }
    let best=-Infinity;
    for(const s of sums) if(s<=21&&s>best) best=s;
    if(best===-Infinity) best=Math.min(...sums);
    return best;
  }
  function isBJ(hand){ return hand.length===2&&handTotal(hand)===21; }
  function isBust(hand){ return handTotal(hand)>21; }

  // ── Card rendering ───────────────────────────────────────────────
  function cardEl(c,faceDown=false){
    const d=document.createElement('div');
    if(faceDown){ d.className='bj-card back'; d.innerHTML='\u{1F0A0}'; return d; }
    d.className=`bj-card ${SUIT_COLOR[c.s]}`;
    d.innerHTML=`<span class="bj-rank">${c.r}</span><span class="bj-suit">${c.s}</span>`;
    return d;
  }

  // ── Balance helpers ──────────────────────────────────────────────
  function fmtLocal(n){ return '\u0191'+(Math.round(n*100)/100).toLocaleString(); }
  function getBalance(){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number') return ME.cash; }catch(e){}
    const c=document.getElementById('cash');
    if(c&&c.textContent){ const n=Number(c.textContent.replace(/[^\d.-]/g,'')); if(!Number.isNaN(n)) return n; }
    return Number(localStorage.getItem('casino_balance_shadow')||0);
  }
  function setBalance(newVal){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number'){
      ME.cash=newVal;
      try{window.__PnLLastCash=Number(newVal)||0;window.__MY_CASH=Number(newVal)||0;try{liveUpdatePnL(null,null);}catch(_){}}catch(_e){}
      try{window.PnLBridge&&typeof window.PnLBridge.pushNow==='function'&&window.PnLBridge.pushNow();}catch(_e){}
      try{(window.bus||window.__bus)&&typeof(window.bus||window.__bus).emit==='function'&&(window.bus||window.__bus).emit('trade',null,0);}catch(_e){}
    }}catch(e){}
    const c=document.getElementById('cash'); if(c) c.textContent=fmtLocal(newVal);
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(newVal)||0}));}catch(_e){}
    refreshBjBalance();
  }
  function deltaBalance(d){ setBalance(getBalance()+d); }
  function refreshBjBalance(){ const b=document.getElementById('bj-balance'); if(b) b.textContent=fmtLocal(getBalance()); }
  function bjLog(msg){ const box=document.getElementById('bj-log'); if(!box) return; const d=document.createElement('div'); d.textContent=msg; box.insertBefore(d,box.firstChild); while(box.children.length>40) box.removeChild(box.lastChild); }

  window.bjAddBet=function(n){ const inp=document.getElementById('bj-bet-input'); inp.value=Math.max(1,(Number(inp.value)||0)+n); };
  window.bjMaxBet=function(){ const inp=document.getElementById('bj-bet-input'); inp.value=Math.max(1,Math.floor(getBalance())); };

  // ── Game state ───────────────────────────────────────────────────
  let playerHand=[],dealerHand=[],playerBet=0,canDouble=false,clearTmr=null,gamePhase='idle';

  function setPhase(p){ gamePhase=p; }

  function renderHands(hideHole=true){
    const dH=document.getElementById('bj-dealer-hand');
    const pH=document.getElementById('bj-player-hand');
    if(!dH||!pH) return;
    dH.innerHTML=''; pH.innerHTML='';
    dealerHand.forEach((c,i)=>{ dH.appendChild(cardEl(c,hideHole&&i===1)); });
    playerHand.forEach(c=>{ pH.appendChild(cardEl(c)); });
    const dTot=document.getElementById('bj-dealer-total');
    const pTot=document.getElementById('bj-player-total');
    if(dTot) dTot.textContent=hideHole&&dealerHand.length>=2?`${handTotal([dealerHand[0]])}+?`:String(handTotal(dealerHand));
    if(pTot) pTot.textContent=String(handTotal(playerHand));
  }

  function setBtns(phase){
    const deal=document.getElementById('bj-btn-deal');
    const hit=document.getElementById('bj-btn-hit');
    const stand=document.getElementById('bj-btn-stand');
    const dbl=document.getElementById('bj-btn-double');
    if(phase==='idle'){ deal.disabled=false; hit.disabled=true; stand.disabled=true; dbl.disabled=true; }
    else if(phase==='player'){ deal.disabled=true; hit.disabled=false; stand.disabled=false; dbl.disabled=!canDouble; }
    else if(phase==='resolving'){ deal.disabled=true; hit.disabled=true; stand.disabled=true; dbl.disabled=true; }
    else if(phase==='done'){ deal.disabled=false; hit.disabled=true; stand.disabled=true; dbl.disabled=true; }
  }

  function showResult(msg,cls){
    const box=document.getElementById('bj-result-box'); if(!box) return;
    box.innerHTML=`<div class="bj-result ${cls}">${msg}</div>`;
    setTimeout(()=>{ if(box) box.innerHTML=''; },4500);
  }

  function settle(){
    renderHands(false);
    const dTot=handTotal(dealerHand);
    const pTot=handTotal(playerHand);
    const pBJ=isBJ(playerHand);
    const dBJ=isBJ(dealerHand);

    if(pBJ&&dBJ){ deltaBalance(playerBet); showResult('Push — both Blackjack!','push'); bjLog('Push (both BJ).'); }
    else if(pBJ){ const pay=Math.floor(playerBet*1.5); deltaBalance(playerBet+pay); showResult(`BLACKJACK! +${fmtLocal(pay)}`, 'bj'); bjLog(`Blackjack! +${fmtLocal(pay)}`); }
    else if(dBJ){ showResult('Dealer Blackjack — You lose.','lose'); bjLog(`Dealer BJ. -${fmtLocal(playerBet)}`); }
    else if(isBust(playerHand)){ showResult('BUST — You lose.','lose'); bjLog(`Bust. -${fmtLocal(playerBet)}`); }
    else if(isBust(dealerHand)||pTot>dTot){ deltaBalance(playerBet*2); showResult(`You win! +${fmtLocal(playerBet)}`, 'win'); bjLog(`Win. +${fmtLocal(playerBet)}`); }
    else if(pTot===dTot){ deltaBalance(playerBet); showResult('Push — Bet returned.','push'); bjLog('Push.'); }
    else { showResult('Dealer wins — You lose.','lose'); bjLog(`Lose. -${fmtLocal(playerBet)}`); }

    playerBet=0; setBtns('done'); setPhase('done');
    clearTmr=setTimeout(resetRound,4000);
  }

  async function runDealer(){
    renderHands(false);
    await sleep(500);
    while(handTotal(dealerHand)<17){
      dealerHand.push(shoe.draw());
      renderHands(false);
      await sleep(500);
    }
    settle();
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  function resetRound(){
    if(clearTmr){ clearTimeout(clearTmr); clearTmr=null; }
    playerHand=[]; dealerHand=[]; playerBet=0; canDouble=false;
    renderHands(false);
    const dTot=document.getElementById('bj-dealer-total'); if(dTot) dTot.textContent='';
    const pTot=document.getElementById('bj-player-total'); if(pTot) pTot.textContent='';
    setPhase('idle'); setBtns('idle');
  }

  window.bjDeal=async function(){
    if(gamePhase!=='idle'&&gamePhase!=='done') return;
    if(clearTmr){ clearTimeout(clearTmr); clearTmr=null; }
    const betInp=document.getElementById('bj-bet-input');
    const amt=Math.max(1,Number(betInp.value||20));
    if(amt>getBalance()){ bjLog('Insufficient funds.'); return; }
    playerBet=amt; deltaBalance(-playerBet);
    bjLog(`Bet ${fmtLocal(playerBet)}.`);

    // Deal: player, dealer, player, dealer
    playerHand=[shoe.draw()]; dealerHand=[shoe.draw()];
    playerHand.push(shoe.draw()); dealerHand.push(shoe.draw());

    canDouble=true;
    setPhase('player'); setBtns('player');
    renderHands(true);

    // Check immediate blackjack
    if(isBJ(playerHand)||isBJ(dealerHand)){
      setBtns('resolving'); setPhase('resolving');
      await sleep(600);
      await runDealer();
      return;
    }
  };

  window.bjHit=function(){
    if(gamePhase!=='player') return;
    playerHand.push(shoe.draw()); canDouble=false;
    renderHands(true); setBtns('player');
    if(isBust(playerHand)){
      setPhase('resolving'); setBtns('resolving');
      setTimeout(async()=>{ await runDealer(); },400);
    }
  };

  window.bjStand=async function(){
    if(gamePhase!=='player') return;
    setPhase('resolving'); setBtns('resolving');
    await runDealer();
  };

  window.bjDouble=async function(){
    if(gamePhase!=='player'||!canDouble) return;
    if(getBalance()<playerBet){ bjLog('Not enough to double.'); return; }
    deltaBalance(-playerBet); playerBet*=2; canDouble=false;
    bjLog(`Double down — bet now ${fmtLocal(playerBet)}.`);
    playerHand.push(shoe.draw());
    renderHands(true); setBtns('resolving'); setPhase('resolving');
    await sleep(500);
    if(isBust(playerHand)){ settle(); return; }
    await runDealer();
  };

  // ── Init ─────────────────────────────────────────────────────────
  refreshBjBalance();
  setBtns('idle');
  if(window.ws) window.ws.addEventListener('message',(e)=>{
    try{ const m=JSON.parse(e.detail?.data||e.data||'{}'); if(m.type==='portfolio'||m.type==='income') refreshBjBalance(); }catch(_){}
  });
  document.addEventListener('fm_ws_msg',(e)=>{
    if(e.detail&&(e.detail.type==='portfolio'||e.detail.type==='income')) refreshBjBalance();
  });

})();
// ===== Casino: Horse Races =====
(function(){
  const pane = document.getElementById('casino-horseraces');
  if (!pane) return;

  pane.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      <div style="position:relative;border:1px solid #2a1a04;border-radius:6px;overflow:hidden;background:#050300">
        <canvas id="horseCanvas" width="820" height="280" style="width:100%;display:block"></canvas>
        <div id="raceStatus" style="position:absolute;bottom:0;left:0;right:0;padding:5px 12px;font-size:.74rem;letter-spacing:.06em;color:#d4a05e;background:linear-gradient(transparent,rgba(0,0,0,.85));text-align:center">
          &#9672; Place a bet and start the race
        </div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:0 2px">
        <select id="horsePick" class="input" style="max-width:160px;font-size:.8rem">
          <option value="0">#1 &mdash; Comet</option>
          <option value="1">#2 &mdash; Nebula</option>
          <option value="2">#3 &mdash; Phantom</option>
          <option value="3">#4 &mdash; Vortex</option>
          <option value="4">#5 &mdash; Ember</option>
          <option value="5">#6 &mdash; Quicksilver</option>
        </select>
        <input id="horseBet" class="input" type="number" min="1" value="10" style="max-width:110px"/>
        <button id="horseStart" class="btn" style="padding:6px 20px;font-size:.85rem;letter-spacing:.06em">&#9654; RACE</button>
        <span style="font-size:.72rem;color:#555;flex:1">5x payout &bull; 16.7% house edge &bull; one bet per race</span>
        <span id="horseBalance" style="font-size:.82rem;color:#ffb547;font-weight:700">&#401;&mdash;</span>
      </div>
      <div id="horseLog" style="max-height:90px;overflow:auto;font-size:.74rem;padding:0 2px"></div>
    </div>`;

  // helpers
  function fmt(n){ return '\u0192'+(Math.round(n*100)/100).toLocaleString(); }
  function getBal(){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number') return ME.cash; }catch(e){}
    const c=document.getElementById('cash');
    if(c&&c.textContent){ const n=Number(c.textContent.replace(/[^\d.-]/g,'')); if(!isNaN(n)) return n; }
    return 0;
  }
  function setBal(v){
    try{ if(typeof ME==='object'&&ME&&typeof ME.cash==='number'){ ME.cash=v;
      try{window.__PnLLastCash=Number(v)||0;window.__MY_CASH=Number(v)||0;try{liveUpdatePnL(null,null);}catch(_){}}catch(_e){}
      try{window.PnLBridge&&typeof window.PnLBridge.pushNow==='function'&&window.PnLBridge.pushNow();}catch(_e){}
    }}catch(e){}
    const c=document.getElementById('cash'); if(c) c.textContent=fmt(v);
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(v)||0}));}catch(_e){}
    refreshBal();
  }
  function adj(d){ setBal(getBal()+d); }
  function refreshBal(){
    const el=document.getElementById('horseBalance');
    if(el) el.textContent=fmt(getBal());
  }

  // canvas
  const cv=document.getElementById('horseCanvas');
  const ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height;
  const LANES=6, STRIP=20, laneH=Math.floor((H-STRIP)/LANES), finishX=W-50, startX=46;
  const NAMES=['Comet','Nebula','Phantom','Vortex','Ember','Quicksilver'];
  const COLS=['#ffcc44','#44ddff','#ff6688','#88ff66','#ff9944','#cc88ff'];
  const JERSEY=['#8a5c00','#005570','#6a0020','#1e5010','#7a3000','#3c1070'];

  let horses=[], legPhase=[], running=false, winner=-1, planned=-1;
  let escrow=0, pick=0, startT=0, animId=null, clearTmr=null;

  function init(){
    if(animId){cancelAnimationFrame(animId);animId=null;}
    if(clearTmr){clearTimeout(clearTmr);clearTmr=null;}
    running=false; winner=-1; planned=-1; horses=[]; legPhase=[];
    for(let i=0;i<LANES;i++){
      horses.push({x:startX,v:0});
      legPhase.push(Math.random()*Math.PI*2);
    }
  }

  function drawFrame(){
    // background
    const bg=ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#0c0700'); bg.addColorStop(1,'#050300');
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);

    // crowd strip
    ctx.fillStyle='#0e0900'; ctx.fillRect(0,0,W,STRIP);
    for(let i=0;i<W;i+=8){
      const sh=5+Math.abs(Math.sin(i*0.28+0.7))*6;
      ctx.fillStyle=(i%16===0)?'#1c1100':'#160e00';
      ctx.fillRect(i,STRIP-sh,7,sh);
    }

    // track lanes
    for(let i=0;i<LANES;i++){
      ctx.fillStyle=i%2===0?'rgba(255,170,50,0.03)':'rgba(255,170,50,0.015)';
      ctx.fillRect(0,STRIP+i*laneH,W,laneH);
    }
    // dividers
    ctx.strokeStyle='rgba(255,150,30,0.15)'; ctx.lineWidth=1;
    for(let i=1;i<LANES;i++){
      const y=STRIP+i*laneH;
      ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
    }
    // start gate mark
    ctx.strokeStyle='rgba(255,150,30,0.3)'; ctx.lineWidth=1.5;
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(startX+16,STRIP); ctx.lineTo(startX+16,H); ctx.stroke();
    ctx.setLineDash([]);

    // finish line glow
    ctx.save();
    ctx.shadowColor='#ffaa00'; ctx.shadowBlur=14;
    ctx.strokeStyle='rgba(255,190,50,0.9)'; ctx.lineWidth=2;
    ctx.setLineDash([10,6]);
    ctx.beginPath(); ctx.moveTo(finishX,STRIP); ctx.lineTo(finishX,H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle='rgba(255,190,50,0.55)';
    ctx.font='bold 9px ui-monospace,monospace';
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText('FINISH',finishX,STRIP+2);

    // lane numbers
    for(let i=0;i<LANES;i++){
      const cy=STRIP+i*laneH+laneH/2;
      ctx.fillStyle='rgba(255,150,40,0.3)';
      ctx.font='bold 10px ui-monospace,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(i+1),16,cy);
    }

    // horses
    for(let i=0;i<LANES;i++){
      const h=horses[i];
      const col=COLS[i], jer=JERSEY[i];
      const cy=STRIP+i*laneH+laneH/2;
      const t=legPhase[i];
      const bw=38, bh=13;

      ctx.save();
      ctx.translate(h.x, cy);

      // glow for picked horse when racing
      if(i===pick && running){ ctx.shadowColor=col; ctx.shadowBlur=18; }

      // legs
      const sw=running?Math.sin(t)*10:0;
      ctx.strokeStyle='rgba(220,180,60,0.7)'; ctx.lineWidth=2; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(bw*0.28,-bh*0.1); ctx.lineTo(bw*0.28+sw*0.8,bh*0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bw*0.38,-bh*0.1); ctx.lineTo(bw*0.38-sw*0.55,bh*0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw*0.28,-bh*0.1); ctx.lineTo(-bw*0.28-sw*0.55,bh*0.75); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-bw*0.18,-bh*0.1); ctx.lineTo(-bw*0.18+sw*0.8,bh*0.75); ctx.stroke();

      // body
      const bg2=ctx.createLinearGradient(-bw/2,-bh/2,-bw/2,bh/2);
      bg2.addColorStop(0,'rgba(255,200,70,0.22)'); bg2.addColorStop(1,'rgba(200,100,10,0.1)');
      ctx.beginPath(); ctx.roundRect(-bw/2,-bh/2,bw,bh,3);
      ctx.fillStyle=bg2; ctx.fill();
      ctx.strokeStyle=col; ctx.lineWidth=1.4; ctx.shadowBlur=0; ctx.stroke();

      // jockey
      ctx.fillStyle=jer;
      ctx.beginPath(); ctx.roundRect(-bw*0.16,-bh*1.08,bw*0.32,bh*0.68,2);
      ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=0.7; ctx.stroke();

      // neck + head
      ctx.strokeStyle='rgba(220,185,70,0.8)'; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(bw*0.5,0); ctx.lineTo(bw*0.5+7,-bh*0.62); ctx.stroke();
      ctx.beginPath(); ctx.arc(bw*0.5+8,-bh*0.76,4,0,Math.PI*2);
      const hg=ctx.createRadialGradient(bw*0.5+8,-bh*0.76,1,bw*0.5+8,-bh*0.76,4);
      hg.addColorStop(0,'rgba(255,200,70,0.55)'); hg.addColorStop(1,'rgba(220,120,20,0.2)');
      ctx.fillStyle=hg; ctx.fill(); ctx.strokeStyle=col; ctx.lineWidth=1; ctx.stroke();

      // tail
      const tw=running?Math.sin(t*0.65)*7:0;
      ctx.strokeStyle='rgba(200,160,30,0.45)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(-bw/2,0);
      ctx.quadraticCurveTo(-bw/2-12,-bh+tw,-bw/2-7,bh*0.55); ctx.stroke();

      // number circle
      ctx.fillStyle='rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle=col; ctx.font='bold 8px ui-monospace,monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(i+1),0,0);

      ctx.restore();

      // name label
      const nx=Math.min(h.x+bw/2+50, W-8);
      ctx.fillStyle=i===pick?col:'rgba(255,150,40,0.4)';
      ctx.font=(i===pick?'bold ':'')+'10px ui-monospace,monospace';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      if(nx < W-4) ctx.fillText(NAMES[i], Math.min(h.x+52,W-72), cy);
    }
  }

  function tick(){
    const t=performance.now()-startT;
    const base=0.09+Math.min(0.25,t/11000*0.25);
    for(let i=0;i<LANES;i++){
      const h=horses[i];
      legPhase[i]+=(running?0.19+h.v*0.05:0);
      h.v=Math.max(0.04,base+(Math.random()-0.5)*0.11+Math.sin(t/540+i*1.3)*0.055);
      if(i===planned&&h.x>finishX-70) h.v+=0.08;
      if(i!==planned&&winner===-1&&h.x>=finishX-8) h.x=finishX-8;
      if(i===planned&&h.x>=finishX&&winner===-1) winner=planned;
      h.x+=h.v*9;
    }
    drawFrame();
    if(winner!==-1){ running=false; settle(winner); return; }
    animId=requestAnimationFrame(tick);
  }

  function pushLog(txt, good){
    const box=document.getElementById('horseLog'); if(!box) return;
    const d=document.createElement('div');
    d.style.cssText='padding:2px 0;border-bottom:1px solid #150e00;color:'+(good?'#86ff6a':'#ff6b6b');
    d.textContent=txt; box.prepend(d);
    while(box.children.length>30) box.removeChild(box.lastChild);
  }

  function setStatus(txt, col){
    const s=document.getElementById('raceStatus');
    if(s){ s.style.color=col||'#d4a05e'; s.textContent=txt; }
  }

  function settle(wi){
    const bet=escrow|0, sel=pick|0;
    if(sel===wi){
      const pay=Math.floor(bet*5); adj(pay);
      pushLog('WIN  #'+(wi+1)+' '+NAMES[wi]+'  +'+fmt(pay), true);
      setStatus('\u25c6 WINNER: #'+(wi+1)+' '+NAMES[wi]+'   PAYOUT: '+fmt(pay),'#86ff6a');
    } else {
      pushLog('LOSS  Winner: #'+(wi+1)+' '+NAMES[wi], false);
      setStatus('\u25c6 Winner: #'+(wi+1)+' '+NAMES[wi]+'  \u2014  Better luck next race','#ff6b6b');
    }
    escrow=0;
    clearTmr=setTimeout(()=>{ init(); drawFrame(); setStatus('\u25c8 Place a bet and start the race',null); },5000);
  }

  document.getElementById('horseStart').onclick=function(){
    if(running) return;
    pick=Number(document.getElementById('horsePick')?.value||0);
    const amt=Math.floor(Number(document.getElementById('horseBet')?.value||0));
    if(!amt||amt<1){ setStatus('Enter a valid bet amount.','#ff9900'); return; }
    if(amt>getBal()){ setStatus('Insufficient balance.','#ff6b6b'); return; }
    if(clearTmr){clearTimeout(clearTmr);clearTmr=null;}
    init(); drawFrame();
    planned=Math.floor(Math.random()*LANES);
    adj(-amt); escrow=amt; running=true; winner=-1;
    setStatus('\u25c8 Racing\u2026  You picked #'+(pick+1)+' ('+NAMES[pick]+')  \u2014  Bet: '+fmt(amt),'#ffb547');
    startT=performance.now();
    animId=requestAnimationFrame(tick);
  };

  const _orig=window.renderPositions;
  if(typeof _orig==='function'){
    window.renderPositions=function(p){ _orig(p); try{refreshBal();}catch(e){}};
  }
  refreshBal();
  init();
  drawFrame();
})();
