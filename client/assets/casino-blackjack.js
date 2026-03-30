
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
