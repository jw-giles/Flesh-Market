/* casino-sicbo.js - Sic Bo (three dice), server-authoritative one-shot.
 *
 * Client sends only the bet SELECTION (amount per board spot) via
 * CasinoNet.play('sicbo', {bets}); the server rolls 3d6 with crypto RNG, prices
 * every spot, caps + credits atomically, and returns {view:{dice:[a,b,c]}, credited}.
 * The client only animates the three dice toward the server's roll. Cash is
 * server-authoritative and arrives via {type:'me'}.
 *
 * Board / gross multipliers (stake included) - edges verified by full 216-outcome
 * enumeration, all in the 2.78%-30% band:
 *   Small/Big/Odd/Even 1:1 (any triple loses)   single N 1:1 / 2:1 / 3:1 by count
 *   specific double 10:1   any triple 30:1   specific triple 150:1   two-dice combo 5:1
 *   total: 4/17 60:1, 5/16 30:1, 6/15 18:1, 7/14 12:1, 8/13 8:1, 9-12 6:1
 */
(function(){
'use strict';
var pane = document.getElementById('casino-sicbo');
if (!pane || pane.__sicInit) return;
pane.__sicInit = true;

var DICE_FACE = ['', '\u2680','\u2681','\u2682','\u2683','\u2684','\u2685']; // 1..6
var TOTAL_PAY = {4:60,17:60, 5:30,16:30, 6:18,15:18, 7:12,14:12, 8:8,13:8, 9:6,12:6, 10:6,11:6};

var bets = {};       // spotKey -> amount
var history = [];    // recent totals
var rolling = false;

function fmt(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }
function getBalance(){
  if (typeof window.ME === 'object' && window.ME && typeof window.ME.cash === 'number') return window.ME.cash;
  var c = document.getElementById('cash');
  if (c && c.textContent){ var n = Number(c.textContent.replace(/[^\d.-]/g,'')); if(!Number.isNaN(n)) return n; }
  return 0;
}
function slipTotal(){ var t=0; for(var k in bets) t += bets[k]; return t; }
function chipVal(){ return Math.max(1, Number(document.getElementById('sic-chip').value)||0); }

pane.innerHTML = [
'<style>',
'#sic-wrap{font-family:monospace;width:100%;padding:10px 4px;color:#c8d8c0}',
'#sic-felt{background:radial-gradient(ellipse at center,#07160c 0%,#040a06 100%);border:2px solid #2f6a3a;border-radius:16px;padding:16px}',
'.sic-info{display:flex;gap:18px;font-size:.85rem;flex-wrap:wrap;margin-bottom:10px}',
'.sic-info span{color:#8ab}.sic-info strong{color:#72e09c}',
'#sic-dice{display:flex;gap:14px;justify-content:center;align-items:center;margin:6px 0 4px}',
'.sic-die{width:64px;height:64px;border-radius:12px;background:#0c1a10;border:2px solid #3f8f4a;display:flex;align-items:center;justify-content:center;font-size:48px;line-height:1;color:#9dff5a;box-shadow:inset 0 0 12px rgba(0,0,0,.5)}',
'.sic-die.spin{animation:sicshake .12s linear infinite}',
'@keyframes sicshake{0%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(-3px) rotate(4deg)}100%{transform:translateY(0) rotate(-4deg)}}',
'#sic-total{text-align:center;font-size:.9rem;color:#8a6a40;letter-spacing:.1em;min-height:1.2em;margin-bottom:8px}',
'#sic-total strong{color:#72e09c;font-size:1.05rem}',
'#sic-banner{padding:8px 14px;border-radius:8px;font-size:.95rem;display:none;text-align:center;letter-spacing:.04em;margin-bottom:10px}',
'#sic-banner.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}',
'#sic-banner.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}',
'.sic-sec{margin-bottom:8px}',
'.sic-sec > .sic-lbl{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#6a7a5a;margin:0 0 3px 2px}',
'.sic-row{display:grid;gap:5px}',
'.sic-row.r4{grid-template-columns:repeat(4,1fr)}',
'.sic-row.r6{grid-template-columns:repeat(6,1fr)}',
'.sic-row.r7{grid-template-columns:repeat(7,1fr)}',
'.sic-row.r14{grid-template-columns:repeat(7,1fr)}',
'.sic-row.combo{grid-template-columns:repeat(8,1fr)}',
'@media(max-width:560px){.sic-row.r6,.sic-row.r7{grid-template-columns:repeat(3,1fr)}.sic-row.combo{grid-template-columns:repeat(5,1fr)}}',
'.sic-cell{background:#0d0d08;border:1px solid #234a23;border-radius:6px;padding:6px 4px;cursor:pointer;text-align:center;transition:border-color .12s,background .12s;user-select:none}',
'.sic-cell:hover{background:#0a1f0f;border-color:#3f9f4a}',
'.sic-cell.big{padding:11px 6px}',
'.sic-cell .sc-lbl{font-size:.8rem;color:#c8a060;letter-spacing:.02em}',
'.sic-cell .sc-odds{font-size:.56rem;color:#6a7a5a;margin-top:1px}',
'.sic-cell .sc-amt{font-size:.72rem;color:#72e09c;margin-top:3px;min-height:.95em;font-weight:700}',
'.sic-cell.has{border-color:#8a6a00;background:#141200}',
'.sic-cell.hit{border-color:#4eff4e;box-shadow:0 0 8px rgba(78,255,78,.4)}',
'.sic-ctrl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 8px}',
'.sic-ctrl input{width:96px;padding:5px 8px;background:#0d0d08;border:1px solid #1f4a1f;color:#72e09c;font-size:.85rem;font-family:monospace;border-radius:4px}',
'.sic-chips{display:flex;gap:4px;flex-wrap:wrap}',
'.sic-chips button,.sic-actions button{padding:5px 11px;background:#06200d;border:1px solid #5a4a10;color:#72e09c;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.78rem;transition:background .15s,border-color .15s}',
'.sic-chips button:hover,.sic-actions button:hover{background:#2a2200}',
'.sic-actions{display:flex;gap:8px;flex-wrap:wrap}',
'.sic-actions button{padding:7px 18px;font-size:.85rem}',
'#sic-roll{border-color:#8a6a00!important;color:#9dff5a!important}',
'#sic-roll:hover{background:#012a14!important;border-color:#2f9f4a!important}',
'#sic-clear{border-color:#6a2020!important;color:#ff9090!important}',
'#sic-clear:hover{background:#2a0808!important}',
'#sic-hist{display:flex;gap:3px;flex-wrap:wrap;margin-top:8px;min-height:18px}',
'.sic-hd{min-width:18px;height:18px;padding:0 4px;border-radius:9px;font-size:.62rem;display:flex;align-items:center;justify-content:center;font-weight:700;background:#123;color:#9cf}',
'#sic-log{max-height:82px;overflow-y:auto;font-size:.72rem;color:#7a8a6a;line-height:1.5;margin-top:8px}',
'#sic-log div{border-bottom:1px solid #131a10;padding:1px 0}',
'</style>',
'<div id="sic-wrap">',
'  <div id="sic-felt">',
'    <div class="sic-info">',
'      <span>Balance: <strong id="sic-bal">-</strong></span>',
'      <span>On table: <strong id="sic-slip">Ƒ0</strong></span>',
'    </div>',
'    <div id="sic-dice">',
'      <div class="sic-die" id="sic-d0">\u2680</div>',
'      <div class="sic-die" id="sic-d1">\u2683</div>',
'      <div class="sic-die" id="sic-d2">\u2685</div>',
'    </div>',
'    <div id="sic-total">Place your bets</div>',
'    <div id="sic-banner"></div>',
'    <div id="sic-board"></div>',
'    <div class="sic-ctrl">',
'      <span style="font-size:.7rem;color:#8a6a40;letter-spacing:.1em">CHIP</span>',
'      <input id="sic-chip" type="number" min="1" value="50"/>',
'      <div class="sic-chips">',
'        <button data-c="10">+10</button><button data-c="50">+50</button>',
'        <button data-c="100">+100</button><button data-c="500">+500</button>',
'        <button data-c="max">Max</button>',
'      </div>',
'    </div>',
'    <div class="sic-actions">',
'      <button id="sic-roll">Roll</button>',
'      <button id="sic-clear">Clear</button>',
'    </div>',
'    <div id="sic-hist"></div>',
'    <div id="sic-log"></div>',
'  </div>',
'</div>'
].join('');

// ── Board definition (spot key -> label/odds). Keys match the server pricing. ──
function section(title, rowClass, cells){
  var wrap = document.createElement('div'); wrap.className = 'sic-sec';
  var lbl = document.createElement('div'); lbl.className = 'sic-lbl'; lbl.textContent = title; wrap.appendChild(lbl);
  var row = document.createElement('div'); row.className = 'sic-row ' + rowClass;
  cells.forEach(function(c){
    var el = document.createElement('div');
    el.className = 'sic-cell' + (c.big?' big':'');
    el.dataset.key = c.key;
    el.innerHTML = '<div class="sc-lbl">'+c.label+'</div><div class="sc-odds">'+c.odds+'</div><div class="sc-amt"></div>';
    el.onclick = function(){ addChip(c.key); };
    row.appendChild(el);
  });
  wrap.appendChild(row);
  return wrap;
}
(function buildBoard(){
  var board = document.getElementById('sic-board');
  // even-money
  board.appendChild(section('Even money', 'r4', [
    { key:'small', label:'Small (4-10)', odds:'1 : 1', big:true },
    { key:'odd',   label:'Odd',          odds:'1 : 1', big:true },
    { key:'even',  label:'Even',         odds:'1 : 1', big:true },
    { key:'big',   label:'Big (11-17)',  odds:'1 : 1', big:true },
  ]));
  // singles 1-6
  board.appendChild(section('Single number (pays by count)', 'r6',
    [1,2,3,4,5,6].map(function(n){ return { key:'s'+n, label:DICE_FACE[n]+' '+n, odds:'1/2/3 : 1' }; })));
  // doubles 1-6
  board.appendChild(section('Specific double', 'r6',
    [1,2,3,4,5,6].map(function(n){ return { key:'d'+n, label:DICE_FACE[n]+DICE_FACE[n], odds:'10 : 1' }; })));
  // triples
  var trip = [{ key:'anytriple', label:'Any triple', odds:'30 : 1' }];
  [1,2,3,4,5,6].forEach(function(n){ trip.push({ key:'t'+n, label:DICE_FACE[n]+DICE_FACE[n]+DICE_FACE[n], odds:'150 : 1' }); });
  board.appendChild(section('Triple', 'r7', trip));
  // totals 4-17
  var tot = [];
  for (var v=4; v<=17; v++) tot.push({ key:'n'+v, label:'= '+v, odds:TOTAL_PAY[v]+' : 1' });
  board.appendChild(section('Total sum', 'r14', tot));
  // two-dice combos
  var comb = [];
  for (var f=1; f<=6; f++) for (var g=f+1; g<=6; g++) comb.push({ key:'c'+f+g, label:f+'\u00b7'+g, odds:'5 : 1' });
  board.appendChild(section('Two-dice combo', 'combo', comb));
})();

function log(m){
  var box = document.getElementById('sic-log'); if(!box) return;
  var d = document.createElement('div'); d.textContent = m;
  box.insertBefore(d, box.firstChild);
  while (box.children.length > 40) box.removeChild(box.lastChild);
}
function refreshBal(){
  var b = document.getElementById('sic-bal'); if(b) b.textContent = fmt(getBalance() - slipTotal());
  var s = document.getElementById('sic-slip'); if(s) s.textContent = fmt(slipTotal());
}
function cellFor(key){ return pane.querySelector('.sic-cell[data-key="'+key+'"]'); }
function renderCell(key){
  var el = cellFor(key); if(!el) return;
  var amt = bets[key] || 0;
  el.classList.toggle('has', amt > 0);
  el.querySelector('.sc-amt').textContent = amt > 0 ? fmt(amt) : '';
}
function addChip(key){
  if (rolling) return;
  var c = chipVal();
  if (slipTotal() + c > getBalance()){ log('Insufficient funds.'); return; }
  bets[key] = (bets[key] || 0) + c;
  renderCell(key); refreshBal();
}
function clearBets(){
  if (rolling) return;
  var keys = Object.keys(bets); bets = {};
  keys.forEach(renderCell);
  refreshBal();
  var bn = document.getElementById('sic-banner'); if(bn) bn.style.display='none';
  pane.querySelectorAll('.sic-cell.hit').forEach(function(el){ el.classList.remove('hit'); });
}
function setDie(i, face){ var el = document.getElementById('sic-d'+i); if(el) el.textContent = DICE_FACE[face]; }

// Which spots are winners for a given roll (for the on-board highlight only;
// the actual payout is the server's credited number).
function winningSpots(dice){
  var a=dice[0], b=dice[1], c=dice[2], total=a+b+c;
  var counts=[0,0,0,0,0,0,0]; counts[a]++; counts[b]++; counts[c]++;
  var isTrip = (a===b && b===c);
  var w = {};
  if (!isTrip){
    if (total>=4 && total<=10) w.small=1;
    if (total>=11 && total<=17) w.big=1;
    if (total%2===1) w.odd=1; else w.even=1;
  }
  for (var f=1; f<=6; f++){
    if (counts[f]>=1) w['s'+f]=1;
    if (counts[f]>=2) w['d'+f]=1;
    if (counts[f]===3){ w['t'+f]=1; w.anytriple=1; }
  }
  w['n'+total]=1;
  for (var x=1; x<=6; x++) for (var y=x+1; y<=6; y++) if (counts[x]>=1 && counts[y]>=1) w['c'+x+y]=1;
  return w;
}
function pushHistory(total){
  history.unshift(total); history = history.slice(0, 20);
  var h = document.getElementById('sic-hist'); if(!h) return;
  h.innerHTML='';
  history.forEach(function(t){ var d=document.createElement('div'); d.className='sic-hd'; d.textContent=t; h.appendChild(d); });
}

async function roll(){
  if (rolling) return;
  var stake = slipTotal();
  if (!(stake > 0)){ log('Place a bet first.'); return; }
  if (window.CasinoNet == null){ log('Casino net not ready - refresh.'); return; }
  rolling = true;
  var rollBtn = document.getElementById('sic-roll'); if(rollBtn) rollBtn.disabled = true;
  var bn = document.getElementById('sic-banner'); if(bn) bn.style.display='none';
  pane.querySelectorAll('.sic-cell.hit').forEach(function(el){ el.classList.remove('hit'); });
  document.getElementById('sic-total').innerHTML = 'Rolling...';

  // start the shake
  ['0','1','2'].forEach(function(i){ document.getElementById('sic-d'+i).classList.add('spin'); });
  var shuffle = setInterval(function(){
    setDie(0, 1+Math.floor(Math.random()*6));
    setDie(1, 1+Math.floor(Math.random()*6));
    setDie(2, 1+Math.floor(Math.random()*6));
  }, 90);

  var res = await window.CasinoNet.play('sicbo', { bets: bets });
  if (!res || !res.ok){
    clearInterval(shuffle);
    ['0','1','2'].forEach(function(i){ document.getElementById('sic-d'+i).classList.remove('spin'); });
    document.getElementById('sic-total').innerHTML = 'Place your bets';
    rolling = false; if(rollBtn) rollBtn.disabled = false;
    log(res && res.stale ? 'Casino updated - refresh (Ctrl+Shift+R).' : ('Rejected: ' + ((res&&res.error)||'unknown')));
    return;
  }
  var dice = (res.view && res.view.dice) ? res.view.dice : [1,1,1];
  var credited = (typeof res.credited === 'number') ? res.credited : 0;
  var net = credited - stake;

  // let the dice tumble a beat, then settle on the server roll
  setTimeout(function(){
    clearInterval(shuffle);
    setDie(0, dice[0]); setDie(1, dice[1]); setDie(2, dice[2]);
    ['0','1','2'].forEach(function(i){ document.getElementById('sic-d'+i).classList.remove('spin'); });
    var total = dice[0]+dice[1]+dice[2];
    var isTrip = (dice[0]===dice[1] && dice[1]===dice[2]);
    document.getElementById('sic-total').innerHTML = 'Total <strong>' + total + '</strong>' + (isTrip?' (triple)':'');

    // highlight winning spots that were actually bet
    var w = winningSpots(dice);
    for (var k in bets){ if (w[k]){ var el = cellFor(k); if(el) el.classList.add('hit'); } }

    if (bn){
      bn.style.display='block';
      var head = 'Roll ' + dice.join(' ') + ' = ' + total + (isTrip?' (triple)':'');
      if (credited > 0){ bn.className='win';  bn.textContent = 'W ' + head + ', won ' + fmt(net) + ' (paid ' + fmt(credited) + ')'; }
      else             { bn.className='lose'; bn.textContent = 'L ' + head + ', lost ' + fmt(stake); }
    }
    log(dice.join('-') + ' = ' + total + ' | ' + (net>=0?'+':'') + fmt(net));
    pushHistory(total);

    // clear the slip; balance already reconciled by server push
    var keys = Object.keys(bets); bets = {};
    keys.forEach(renderCell);
    refreshBal();
    rolling = false; if(rollBtn) rollBtn.disabled = false;
  }, 700);
}

// wire controls
document.getElementById('sic-roll').onclick = roll;
document.getElementById('sic-clear').onclick = clearBets;
pane.querySelectorAll('.sic-chips button').forEach(function(btn){
  btn.onclick = function(){
    var inp = document.getElementById('sic-chip');
    if (btn.dataset.c === 'max'){ inp.value = Math.max(1, Math.floor(getBalance() - slipTotal())); }
    else { inp.value = Math.max(1, (Number(inp.value)||0) + Number(btn.dataset.c)); }
  };
});
document.addEventListener('fm_ws_msg', function(e){
  var m = e && e.detail; if (!m || (m.type!=='me' && m.type!=='portfolio')) return;
  refreshBal();
});

refreshBal();
})();
