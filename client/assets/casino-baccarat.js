/* casino-baccarat.js - Punto Banco, server-authoritative one-shot.
 *
 * The client sends only the bet SELECTION (amounts on Player/Banker/Tie/pairs)
 * via CasinoNet.play('baccarat', {bets}); the server deals an 8-deck shoe with
 * crypto RNG, applies the third-card rules, prices the outcome, caps + credits
 * atomically, and returns {view:{P,B,pt,bt,outcome,pPair,bPair}, credited}. The
 * client never decides the outcome or the payout - it only animates the deal the
 * server rolled. Cash is server-authoritative and arrives via {type:'me'}.
 *
 * Payouts (gross, stake included): Player 1:1, Banker 0.95:1 (5% commission),
 * Tie 8:1, Player Pair / Banker Pair 11:1. On a Tie the Player and Banker bets
 * push (stake returned); only the Tie bet wins.
 */
(function(){
'use strict';
var pane = document.getElementById('casino-baccarat');
if (!pane || pane.__bacInit) return;
pane.__bacInit = true;
var T=function(k,fb){return window.t?window.t(k,fb):fb;};
var TF=function(k,fb,v){return window.tf?window.tf(k,fb,v):fb;};

var SPOTS = [
  { key:'player', label:'Player',      odds:'1 : 1'   },
  { key:'banker', label:'Banker',      odds:'0.95 : 1'},
  { key:'tie',    label:'Tie',         odds:'8 : 1'   },
  { key:'ppair',  label:'Player Pair', odds:'11 : 1'  },
  { key:'bpair',  label:'Banker Pair', odds:'11 : 1'  },
];

var bets = { player:0, banker:0, tie:0, ppair:0, bpair:0 };
var history = [];   // 'P' | 'B' | 'T'
var dealing = false;

function fmt(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }
function getBalance(){
  if (typeof window.ME === 'object' && window.ME && typeof window.ME.cash === 'number') return window.ME.cash;
  var c = document.getElementById('cash');
  if (c && c.textContent){ var n = Number(c.textContent.replace(/[^\d.-]/g,'')); if(!Number.isNaN(n)) return n; }
  return 0;
}
function slipTotal(){ return SPOTS.reduce(function(s,sp){ return s + bets[sp.key]; }, 0); }
function chipVal(){ return Math.max(1, Number(document.getElementById('bac-chip').value)||0); }

pane.innerHTML = [
'<style>',
'#bac-wrap{font-family:monospace;width:100%;padding:10px 4px;color:#c8d8c0}',
'#bac-felt{background:radial-gradient(ellipse at center,#07160c 0%,#040a06 100%);border:2px solid #2f6a3a;border-radius:16px;padding:16px 16px 18px;margin-bottom:12px}',
'.bac-info{display:flex;gap:18px;font-size:.85rem;flex-wrap:wrap;margin-bottom:12px}',
'.bac-info span{color:#8ab}.bac-info strong{color:#72e09c}',
'#bac-hands{display:flex;gap:26px;flex-wrap:wrap;justify-content:center;min-height:104px;margin-bottom:10px}',
'.bac-hand{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:150px}',
'.bac-hand h4{margin:0;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#8a6a40}',
'.bac-hand.win h4{color:#9dff5a}',
'.bac-cards{display:flex;gap:5px;min-height:84px;align-items:center}',
'.bac-total{font-size:1.05rem;font-weight:700;color:#72e09c;letter-spacing:.05em}',
'.bac-vs{align-self:center;color:#5a4a20;font-size:.9rem;letter-spacing:.2em}',
'#bac-banner{padding:8px 14px;border-radius:8px;font-size:.95rem;display:none;text-align:center;letter-spacing:.04em;margin-bottom:10px}',
'#bac-banner.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}',
'#bac-banner.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}',
'#bac-banner.push{background:#06200d;border:1px solid #5a5000;color:#ffeb80}',
'.bac-spots{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}',
'@media(max-width:520px){.bac-spots{grid-template-columns:repeat(2,1fr)}}',
'.bac-spot{background:#0d0d08;border:1px solid #234a23;border-radius:8px;padding:9px 8px;cursor:pointer;text-align:center;transition:border-color .12s,background .12s}',
'.bac-spot:hover{background:#0a1f0f;border-color:#3f9f4a}',
'.bac-spot .bs-lbl{font-size:.82rem;color:#c8a060;letter-spacing:.03em}',
'.bac-spot .bs-odds{font-size:.62rem;color:#6a7a5a;margin-top:1px}',
'.bac-spot .bs-amt{font-size:.9rem;color:#72e09c;margin-top:5px;min-height:1.1em;font-weight:700}',
'.bac-spot.has{border-color:#8a6a00;background:#141200}',
'.bac-ctrl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}',
'.bac-ctrl input{width:96px;padding:5px 8px;background:#0d0d08;border:1px solid #1f4a1f;color:#72e09c;font-size:.85rem;font-family:monospace;border-radius:4px}',
'.bac-chips{display:flex;gap:4px;flex-wrap:wrap}',
'.bac-chips button,.bac-actions button{padding:5px 11px;background:#06200d;border:1px solid #5a4a10;color:#72e09c;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.78rem;transition:background .15s,border-color .15s}',
'.bac-chips button:hover,.bac-actions button:hover{background:#2a2200}',
'.bac-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}',
'.bac-actions button{padding:7px 18px;font-size:.85rem}',
'#bac-deal{border-color:#8a6a00!important;color:#9dff5a!important}',
'#bac-deal:hover{background:#012a14!important;border-color:#2f9f4a!important}',
'#bac-clear{border-color:#6a2020!important;color:#ff9090!important}',
'#bac-clear:hover{background:#2a0808!important}',
'#bac-hist{display:flex;gap:3px;flex-wrap:wrap;margin-top:8px;min-height:18px}',
'.bac-dot{width:18px;height:18px;border-radius:50%;font-size:.6rem;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff}',
'.bac-dot.P{background:#1e5fbf}.bac-dot.B{background:#bf2e2e}.bac-dot.T{background:#2a8a2a}',
'#bac-log{max-height:82px;overflow-y:auto;font-size:.72rem;color:#7a8a6a;line-height:1.5;margin-top:8px}',
'#bac-log div{border-bottom:1px solid #131a10;padding:1px 0}',
'</style>',
'<div id="bac-wrap">',
'  <div id="bac-felt">',
'    <div class="bac-info">',
'      <span><span data-i18n="casino.common.balance">Balance:</span> <strong id="bac-bal">-</strong></span>',
'      <span><span data-i18n="casino.common.onTable">On table:</span> <strong id="bac-slip">Ƒ0</strong></span>',
'    </div>',
'    <div id="bac-hands">',
'      <div class="bac-hand" id="bac-hand-P"><h4><span data-i18n="casino.bacc.player">Player</span> <span id="bac-pt"></span></h4><div class="bac-cards" id="bac-cards-P"></div></div>',
'      <div class="bac-vs">VS</div>',
'      <div class="bac-hand" id="bac-hand-B"><h4><span data-i18n="casino.bacc.banker">Banker</span> <span id="bac-bt"></span></h4><div class="bac-cards" id="bac-cards-B"></div></div>',
'    </div>',
'    <div id="bac-banner"></div>',
'    <div class="bac-spots" id="bac-spots"></div>',
'    <div class="bac-ctrl">',
'      <span style="font-size:.7rem;color:#8a6a40;letter-spacing:.1em" data-i18n="casino.common.chip">CHIP</span>',
'      <input id="bac-chip" type="number" min="1" value="50"/>',
'      <div class="bac-chips">',
'        <button data-c="10">+10</button><button data-c="50">+50</button>',
'        <button data-c="100">+100</button><button data-c="500">+500</button>',
'        <button data-c="max" data-i18n="casino.common.max">Max</button>',
'      </div>',
'    </div>',
'    <div class="bac-actions">',
'      <button id="bac-deal" data-i18n="casino.bacc.deal">Deal</button>',
'      <button id="bac-clear" data-i18n="casino.common.clear">Clear</button>',
'    </div>',
'    <div id="bac-hist"></div>',
'    <div id="bac-log"></div>',
'  </div>',
'</div>'
].join('');
if(window.applyI18n) window.applyI18n(pane);

function log(m){
  var box = document.getElementById('bac-log'); if(!box) return;
  var d = document.createElement('div'); d.textContent = m;
  box.insertBefore(d, box.firstChild);
  while (box.children.length > 40) box.removeChild(box.lastChild);
}
function refreshBal(){
  var b = document.getElementById('bac-bal'); if(b) b.textContent = fmt(getBalance() - slipTotal());
  var s = document.getElementById('bac-slip'); if(s) s.textContent = fmt(slipTotal());
}
function renderSpots(){
  var box = document.getElementById('bac-spots'); if(!box) return;
  box.innerHTML = '';
  SPOTS.forEach(function(sp){
    var el = document.createElement('div');
    el.className = 'bac-spot' + (bets[sp.key] > 0 ? ' has' : '');
    el.innerHTML = '<div class="bs-lbl">'+T('casino.bacc.'+sp.key,sp.label)+'</div><div class="bs-odds">'+sp.odds+'</div>'+
                   '<div class="bs-amt">'+(bets[sp.key]>0?fmt(bets[sp.key]):'')+'</div>';
    el.onclick = function(){ addChip(sp.key); };
    box.appendChild(el);
  });
}
function addChip(key){
  if (dealing) return;
  var c = chipVal();
  if (slipTotal() + c > getBalance()){ log(T('casino.common.insufficient','Insufficient funds.')); return; }
  bets[key] += c;
  renderSpots(); refreshBal();
}
function clearBets(){
  if (dealing) return;
  SPOTS.forEach(function(sp){ bets[sp.key] = 0; });
  renderSpots(); refreshBal();
  var bn = document.getElementById('bac-banner'); if(bn) bn.style.display='none';
}
function cardHTML(card){
  // card: { rank:'A'|'2'..'10'|'J'|'Q'|'K', suit:'C'|'S'|'H'|'D' }
  if (window.FMPokerCardHTML) return window.FMPokerCardHTML(card.rank, card.suit, { w:56 });
  return '<span style="display:inline-block;width:40px;height:56px;border:1px solid #2f6a3a;border-radius:5px;text-align:center;line-height:56px;color:#72e09c">'+card.rank+'</span>';
}
function clearHands(){
  document.getElementById('bac-cards-P').innerHTML = '';
  document.getElementById('bac-cards-B').innerHTML = '';
  document.getElementById('bac-pt').textContent = '';
  document.getElementById('bac-bt').textContent = '';
  document.getElementById('bac-hand-P').classList.remove('win');
  document.getElementById('bac-hand-B').classList.remove('win');
}
function pointsOf(cards){
  var v = 0;
  cards.forEach(function(c){
    var r = c.rank;
    if (r==='A') v += 1;
    else if (r==='10'||r==='J'||r==='Q'||r==='K') v += 0;
    else v += Number(r);
  });
  return v % 10;
}
function revealDeal(view, cb){
  clearHands();
  var P = view.P || [], B = view.B || [];
  // interleave P1,B1,P2,B2 then any third cards, staggered
  var seq = [];
  if (P[0]) seq.push(['P',P[0]]); if (B[0]) seq.push(['B',B[0]]);
  if (P[1]) seq.push(['P',P[1]]); if (B[1]) seq.push(['B',B[1]]);
  if (P[2]) seq.push(['P',P[2]]); if (B[2]) seq.push(['B',B[2]]);
  var shownP = [], shownB = [];
  var i = 0;
  (function step(){
    if (i >= seq.length){ cb && cb(); return; }
    var side = seq[i][0], card = seq[i][1];
    var box = document.getElementById('bac-cards-'+side);
    box.insertAdjacentHTML('beforeend', cardHTML(card));
    if (side==='P'){ shownP.push(card); document.getElementById('bac-pt').textContent = '('+pointsOf(shownP)+')'; }
    else           { shownB.push(card); document.getElementById('bac-bt').textContent = '('+pointsOf(shownB)+')'; }
    i++;
    setTimeout(step, 420);
  })();
}
function pushHistory(outcome){
  var m = outcome==='player'?'P':outcome==='banker'?'B':'T';
  history.unshift(m); history = history.slice(0, 24);
  var h = document.getElementById('bac-hist'); if(!h) return;
  h.innerHTML = '';
  history.forEach(function(x){ var d=document.createElement('div'); d.className='bac-dot '+x; d.textContent=(x==='P'?T('casino.bacc.dotP','P'):x==='B'?T('casino.bacc.dotB','B'):T('casino.bacc.dotT','T')); h.appendChild(d); });
}

async function deal(){
  if (dealing) return;
  var stake = slipTotal();
  if (!(stake > 0)){ log(T('casino.common.placeBetFirst','Place a bet first.')); return; }
  if (window.CasinoNet == null){ log(T('casino.common.netNotReady','Casino net not ready - refresh.')); return; }
  dealing = true;
  var dealBtn = document.getElementById('bac-deal'); if(dealBtn) dealBtn.disabled = true;
  var bn = document.getElementById('bac-banner'); if(bn) bn.style.display='none';

  var sent = { player:bets.player, banker:bets.banker, tie:bets.tie, ppair:bets.ppair, bpair:bets.bpair };
  var res = await window.CasinoNet.play('baccarat', { bets: sent });
  if (!res || !res.ok){
    dealing = false; if(dealBtn) dealBtn.disabled = false;
    log(res && res.stale ? T('casino.common.stale','Casino updated, refresh (Ctrl+Shift+R).') : TF('casino.common.rejected','Rejected: {err}',{err:((res&&res.error)||'unknown')}));
    return;
  }
  var view = res.view || {};
  var credited = (typeof res.credited === 'number') ? res.credited : 0;
  var net = credited - stake;

  revealDeal(view, function(){
    var out = view.outcome;
    var winEl = document.getElementById('bac-hand-'+(out==='player'?'P':out==='banker'?'B':''));
    if (winEl) winEl.classList.add('win');   // Tie highlights neither hand (both push)
    var natural = (view.P && view.P.length===2 && view.B && view.B.length===2 &&
                   (view.pt>=8 || view.bt>=8));
    if (bn){
      bn.style.display = 'block';
      var head = (out==='player'?T('casino.bacc.pUp','PLAYER'):out==='banker'?T('casino.bacc.bUp','BANKER'):T('casino.bacc.tUp','TIE')) + ' ' + (view.pt) + ' : ' + (view.bt) + (natural?T('casino.bacc.natural',' (natural)'):'');
      if (credited > stake){ bn.className='win';  bn.textContent = TF('casino.common.bannerWin','W {head}, won {net} (paid {paid})',{head:head,net:fmt(net),paid:fmt(credited)}); }
      else if (credited > 0){ bn.className='push'; bn.textContent = TF('casino.bacc.bannerPush','{head}, {net} (push {paid})',{head:head,net:fmt(net),paid:fmt(credited)}); }
      else                  { bn.className='lose'; bn.textContent = TF('casino.common.bannerLose','L {head}, lost {stake}',{head:head,stake:fmt(stake)}); }
    }
    var extra = (view.pPair?T('casino.bacc.pPairTag',' P-pair'):'') + (view.bPair?T('casino.bacc.bPairTag',' B-pair'):'');
    log((out==='player'?T('casino.bacc.player','Player'):out==='banker'?T('casino.bacc.banker','Banker'):T('casino.bacc.tie','Tie')) + ' ' + view.pt + ':' + view.bt + extra + ' | ' + (net>=0?'+':'') + fmt(net));
    pushHistory(out);
    // reset the slip for the next coup; balance already reconciled by server push
    SPOTS.forEach(function(sp){ bets[sp.key] = 0; });
    renderSpots(); refreshBal();
    dealing = false; if(dealBtn) dealBtn.disabled = false;
  });
}

// wire controls
document.getElementById('bac-deal').onclick = deal;
document.getElementById('bac-clear').onclick = clearBets;
pane.querySelectorAll('.bac-chips button').forEach(function(btn){
  btn.onclick = function(){
    var inp = document.getElementById('bac-chip');
    if (btn.dataset.c === 'max'){ inp.value = Math.max(1, Math.floor(getBalance() - slipTotal())); }
    else { inp.value = Math.max(1, (Number(inp.value)||0) + Number(btn.dataset.c)); }
  };
});

// keep the balance line honest when the server pushes a new cash value
document.addEventListener('fm_ws_msg', function(e){
  var m = e && e.detail; if (!m || (m.type!=='me' && m.type!=='portfolio')) return;
  refreshBal();
});

renderSpots();
refreshBal();
})();
