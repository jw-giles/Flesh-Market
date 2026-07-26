
(function(){
'use strict';
const T=(k,fb)=>window.t?window.t(k,fb):fb;
const TF=(k,fb,v)=>window.tf?window.tf(k,fb,v):fb;
function pkRankName(n){var m={'Royal Flush':'casino.poker.rankRoyalFlush','Straight Flush':'casino.poker.rankStraightFlush','Four of a Kind':'casino.poker.rankFourKind','Full House':'casino.poker.rankFullHouse','Flush':'casino.poker.rankFlush','Straight':'casino.poker.rankStraight','Three of a Kind':'casino.poker.rankThreeKind','Two Pair':'casino.poker.rankTwoPair','Pair':'casino.poker.rankPair','High Card':'casino.poker.rankHighCard'};return T(m[n]||'',n);}
function pkStreetLabel(s){var m={preflop:'casino.poker.streetPreflop',flop:'casino.poker.streetFlop',turn:'casino.poker.streetTurn',river:'casino.poker.streetRiver',showdown:'casino.poker.streetShowdown'};return T(m[s]||'',s);}

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];
const SUIT_COLOR = {'♠':'black','♣':'black','♥':'red','♦':'red'};
const RANK_VAL = {'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14};
const AI_NAMES = ['Vega','Oracle','Dread','Silk','Baron'];
const BLIND_LEVELS = [{sb:5,bb:10},{sb:10,bb:20},{sb:25,bb:50},{sb:50,bb:100}];

function makeDeck(){const d=[];for(const r of RANKS)for(const s of SUITS)d.push({r,s});return d;}
function shuffle(d){for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}

function rankHand(cards){
  const vals=cards.map(c=>RANK_VAL[c.r]).sort((a,b)=>b-a);
  const suits=cards.map(c=>c.s);
  const counts={};
  for(const v of vals)counts[v]=(counts[v]||0)+1;
  const byCount=Object.entries(counts).sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const isFlush=suits.some(s=>suits.filter(x=>x===s).length>=5);
  const flushSuit=isFlush?suits.find(s=>suits.filter(x=>x===s).length>=5):null;
  const flushCards=flushSuit?cards.filter(c=>c.s===flushSuit).sort((a,b)=>RANK_VAL[b.r]-RANK_VAL[a.r]):[];
  function hasStraight(vset){
    const u=[...new Set(vset)].sort((a,b)=>b-a);
    for(let i=0;i<=u.length-5;i++){if(u[i]-u[i+4]===4&&new Set(u.slice(i,i+5)).size===5)return u[i];}
    if(u.includes(14)&&u.includes(2)&&u.includes(3)&&u.includes(4)&&u.includes(5))return 5;
    return 0;
  }
  const straight=hasStraight(vals);
  const sfHigh=isFlush?hasStraight(flushCards.map(c=>RANK_VAL[c.r])):0;
  if(sfHigh===14)return{score:9e9+sfHigh,name:'Royal Flush'};
  if(sfHigh>0)return{score:8e9+sfHigh,name:'Straight Flush'};
  if(byCount[0][1]===4)return{score:7e9+parseInt(byCount[0][0])*13+parseInt(byCount[1][0]),name:'Four of a Kind'};
  if(byCount[0][1]===3&&byCount[1][1]>=2)return{score:6e9+parseInt(byCount[0][0])*13+parseInt(byCount[1][0]),name:'Full House'};
  if(isFlush)return{score:5e9+flushCards.slice(0,5).reduce((a,c,i)=>a+RANK_VAL[c.r]*Math.pow(15,4-i),0),name:'Flush'};
  if(straight)return{score:4e9+straight,name:'Straight'};
  if(byCount[0][1]===3)return{score:3e9+parseInt(byCount[0][0])*169+parseInt(byCount[1][0])*13+parseInt(byCount[2][0]),name:'Three of a Kind'};
  if(byCount[0][1]===2&&byCount[1][1]===2)return{score:2e9+Math.max(parseInt(byCount[0][0]),parseInt(byCount[1][0]))*169+Math.min(parseInt(byCount[0][0]),parseInt(byCount[1][0]))*13+(parseInt(byCount[2][0])||0),name:'Two Pair'};
  if(byCount[0][1]===2)return{score:1e9+parseInt(byCount[0][0])*13*13*13+vals.filter(v=>v!==parseInt(byCount[0][0])).slice(0,3).reduce((a,v,i)=>a+v*Math.pow(13,2-i),0),name:'Pair'};
  return{score:vals.slice(0,5).reduce((a,v,i)=>a+v*Math.pow(15,4-i),0),name:'High Card'};
}

// ── State ──────────────────────────────────────────────────────────────────
let pkState = {
  deck:[], playerHand:[], community:[],
  pot:0, playerBet:0, playerStack:0,
  street:'idle', toCall:0, blindLevel:1, handCount:0,
  ais: AI_NAMES.map(name=>({name, stack:500, hand:[], bet:0, folded:false, allin:false}))
};

function pkGetBalance(){
  if(typeof ME==='object'&&ME&&typeof ME.cash==='number')return ME.cash;
  const c=document.getElementById('cash');
  if(c&&c.textContent){const n=Number(c.textContent.replace(/[^\d.-]/g,''));if(!isNaN(n)&&n>0)return n;}
  return 0;
}
function pkAdjBalance(n){
  if(typeof ME==='object'&&ME&&typeof ME.cash==='number'){
    ME.cash+=n; window.__MY_CASH=ME.cash;
    const c=document.getElementById('cash');if(c)c.textContent='Ƒ'+Math.round(ME.cash).toLocaleString();
    // Legacy {type:'casino',sync} removed — cash is server-authoritative and
    // reconciled by {type:'me'}/{type:'portfolio'} pushes. pkAdjBalance now only
    // updates the local display; real money moves via CasinoNet bet/addon/result.
    try{liveUpdatePnL(null,null);}catch(e){}
  }
}
var pkRoundId=null; // server round id for the in-flight hand

function pkLog(msg){const log=document.getElementById('pk-log');if(!log)return;const d=document.createElement('div');d.textContent=msg;log.insertBefore(d,log.firstChild);while(log.children.length>40)log.removeChild(log.lastChild);}

function pkUpdateInfo(){
  const bl=BLIND_LEVELS[pkState.blindLevel]||BLIND_LEVELS[0];
  const bi=document.getElementById('pk-blind-lbl');if(bi)bi.textContent=`Ƒ${bl.sb}/Ƒ${bl.bb}`;
  const pi=document.getElementById('pk-pot');if(pi)pi.textContent=`Ƒ${pkState.pot}`;
  const bx=document.getElementById('pk-balance');if(bx)bx.textContent=`Ƒ${Math.round(pkGetBalance()).toLocaleString()}`;
  const si=document.getElementById('pk-street-info');if(si)si.textContent=pkState.street!=='idle'?('['+pkStreetLabel(pkState.street)+']'):'';
}

function cardEl(card,faceDown=false){
  if(window.FMPokerCard){
    return window.FMPokerCard(faceDown?'back':card.r, faceDown?null:card.s, {w:40, faceDown});
  }
  const d=document.createElement('div');
  if(faceDown){d.className='pk-card back';d.innerHTML='🂠';return d;}
  d.className=`pk-card ${SUIT_COLOR[card.s]}`;
  d.innerHTML=`<span class="pk-rank">${card.r}</span><span class="pk-suit">${card.s}</span>`;
  return d;
}

function renderSeats(){
  const container=document.getElementById('pk-seats');
  if(!container)return;
  container.innerHTML='';
  const showCards=pkState.street==='showdown';
  pkState.ais.forEach((ai,i)=>{
    const seat=document.createElement('div');
    seat.className='pk-seat'+(ai.folded?' folded':ai.hand.length>0?' active':'');
    seat.id=`pk-seat-${i}`;

    const statusText=ai.folded?T('casino.poker.seatFolded','folded'):ai.allin?T('casino.poker.seatAllin','ALL-IN'):pkState.street==='idle'?'-':'';
    const betText=ai.bet>0&&!ai.folded?TF('casino.poker.seatBet','bet: Ƒ{amt}',{amt:ai.bet}):'';
    let handHtml='';
    if(ai.hand.length===2){
      if(showCards&&!ai.folded){
        handHtml=ai.hand.map(c=>{
          if(window.FMPokerCardHTML) return window.FMPokerCardHTML(c.r,c.s,{w:34});
          const col=SUIT_COLOR[c.s];
          return `<div class="pk-card ${col}"><span class="pk-rank">${c.r}</span><span class="pk-suit">${c.s}</span></div>`;
        }).join('');
      } else {
        handHtml = window.FMPokerCardHTML
          ? window.FMPokerCardHTML('back',null,{w:34})+window.FMPokerCardHTML('back',null,{w:34})
          : '<div class="pk-card back">🂠</div><div class="pk-card back">🂠</div>';
      }
    }

    seat.innerHTML=`
      <div class="seat-name">${ai.name}</div>
      <div class="seat-stack">Ƒ${ai.stack}</div>
      <div class="seat-bet">${betText}</div>
      <div class="seat-status">${statusText}</div>
      <div class="seat-cards">${handHtml}</div>`;
    container.appendChild(seat);
  });
}

function renderCards(){
  const pc=document.getElementById('pk-player-cards');
  const cc=document.getElementById('pk-community');
  const cl=document.getElementById('pk-community-label');
  if(!pc||!cc)return;
  pc.innerHTML='';cc.innerHTML='';
  pkState.playerHand.forEach(c=>pc.appendChild(cardEl(c)));
  pkState.community.forEach(c=>cc.appendChild(cardEl(c)));
  if(cl)cl.textContent=({flop:1,turn:1,river:1,showdown:1}[pkState.street])?pkStreetLabel(pkState.street):'';
  renderSeats();
}

function setActionsEnabled(inHand){
  ['pk-btn-fold','pk-btn-check','pk-btn-call','pk-btn-raise'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.disabled=!inHand;
  });
  const deal=document.getElementById('pk-btn-deal');if(deal)deal.disabled=inHand;
  if(inHand){
    const maxBet=Math.max(...pkState.ais.filter(a=>!a.folded).map(a=>a.bet),pkState.playerBet);
    const toCall=Math.max(0,maxBet-pkState.playerBet);
    const callBtn=document.getElementById('pk-btn-call');
    const checkBtn=document.getElementById('pk-btn-check');
    if(callBtn){callBtn.textContent=toCall>0?TF('casino.poker.callAmt','Call Ƒ{amt}',{amt:toCall}):T('casino.poker.call','Call');callBtn.disabled=toCall===0;}
    if(checkBtn)checkBtn.disabled=toCall>0;
  }
}

function showResult(text,type){
  const box=document.getElementById('pk-result-box');
  if(!box)return;
  box.innerHTML=`<div class="pk-result ${type}">${text}</div>`;
}

// ── AI logic ────────────────────────────────────────────────────────────────
function aiDecideFor(ai){
  const community=pkState.community;
  const hand=[...ai.hand,...community];
  const rank=hand.length>=5?rankHand(hand):{score:0,name:'?'};
  const score=rank.score;
  const bl=BLIND_LEVELS[pkState.blindLevel]||BLIND_LEVELS[0];
  const maxBet=Math.max(...pkState.ais.filter(a=>!a.folded).map(a=>a.bet),pkState.playerBet);
  const toCall=Math.max(0,maxBet-ai.bet);
  const agg=Math.random();
  const streetMult=pkState.street==='preflop'?1:pkState.street==='flop'?1.1:pkState.street==='turn'?1.2:1.3;

  if(community.length===0){
    // Preflop heuristic: rank hole cards
    const [a,b]=ai.hand;
    const av=RANK_VAL[a.r],bv=RANK_VAL[b.r];
    const suited=a.s===b.s;
    const holeStrength=(av+bv)/28+(suited?0.05:0)+(Math.abs(av-bv)<=2?0.05:0);
    if(holeStrength>0.85&&agg<0.7){const r=Math.round(bl.bb*(2+agg*3));return{action:'raise',amount:r};}
    if(holeStrength>0.6){return toCall>bl.bb*4?(agg<0.4?{action:'fold'}:{action:'call'}):{action:'call'};}
    if(toCall>bl.bb*2)return agg<0.5?{action:'fold'}:{action:'call'};
    return agg<0.3?{action:'raise',amount:bl.bb}:{action:'call'};
  }
  if(score>6e9){const r=Math.round(bl.bb*(2+agg*3)*streetMult);return agg<0.75?{action:'raise',amount:r}:{action:'call'};}
  if(score>3e9){if(toCall>ai.stack*0.4)return{action:'call'};return agg<0.5?{action:'raise',amount:Math.round(bl.bb*(1+agg*2)*streetMult)}:{action:'call'};}
  if(score>1e9){if(toCall>ai.stack*0.5)return agg<0.3?{action:'fold'}:{action:'call'};return agg<0.3?{action:'raise',amount:bl.bb}:toCall?{action:'call'}:{action:'check'};}
  if(toCall>bl.bb*4)return agg<0.65?{action:'fold'}:{action:'call'};
  return agg<0.25?{action:'raise',amount:bl.bb}:toCall?{action:(agg<0.4?'fold':'call')}:{action:'check'};
}

function runAiRound(afterAi){
  // All active AIs act in sequence, with a small delay for drama
  const actives=pkState.ais.filter(a=>!a.folded&&!a.allin);
  let i=0;
  function next(){
    if(i>=actives.length){if(afterAi)afterAi();return;}
    const ai=actives[i++];
    const dec=aiDecideFor(ai);
    const bl=BLIND_LEVELS[pkState.blindLevel]||BLIND_LEVELS[0];
    if(dec.action==='fold'){
      ai.folded=true;
      pkLog(TF('casino.poker.aiFolds','{name} folds.',{name:ai.name}));
    } else if(dec.action==='raise'&&dec.amount){
      const raise=Math.min(dec.amount,ai.stack);
      const total=ai.bet+raise;
      ai.stack-=raise;pkState.pot+=raise;ai.bet=total;
      pkLog(TF('casino.poker.aiBetsRaises','{name} bets/raises Ƒ{amt}. Pot: Ƒ{pot}',{name:ai.name,amt:raise,pot:pkState.pot}));
    } else if(dec.action==='call'){
      const maxBet=Math.max(...pkState.ais.filter(a=>!a.folded).map(a=>a.bet),pkState.playerBet);
      const toCall=Math.max(0,maxBet-ai.bet);
      if(toCall>0){
        const pay=Math.min(toCall,ai.stack);
        ai.stack-=pay;pkState.pot+=pay;ai.bet+=pay;
        pkLog(TF('casino.poker.aiCalls','{name} calls Ƒ{amt}.',{name:ai.name,amt:pay}));
      } else {pkLog(TF('casino.poker.aiChecks','{name} checks.',{name:ai.name}));}
    } else {
      pkLog(TF('casino.poker.aiChecks','{name} checks.',{name:ai.name}));
    }
    renderCards();pkUpdateInfo();
    setTimeout(next,350);
  }
  setTimeout(next,200);
}

function advanceStreet(){
  pkState.ais.forEach(a=>{if(!a.folded)a.bet=0;});
  pkState.playerBet=0;
  // Check if only one player (human or ai) left
  const activePlayers=[...pkState.ais.filter(a=>!a.folded),'player'].filter(Boolean);
  if(activePlayers.length===1){
    // Only one left — they win
    if(pkState.ais.filter(a=>!a.folded).length===0){
      // Player is only one
      endHand('player',T('casino.poker.allFoldedWin','All opponents folded! You win!'));
    } else {
      const winner=pkState.ais.find(a=>!a.folded);
      endHand('ai',TF('casino.poker.aiWinsFold','{name} wins, everyone else folded.',{name:winner.name}));
    }
    return;
  }
  if(pkState.street==='preflop'){
    pkState.street='flop';pkState.community=pkState.deck.splice(0,3);
    pkLog(TF('casino.poker.flopHead','--- Flop: {cards} ---',{cards:pkState.community.map(c=>c.r+c.s).join(' ')}));
  } else if(pkState.street==='flop'){
    pkState.street='turn';pkState.community.push(pkState.deck.splice(0,1)[0]);
    pkLog(TF('casino.poker.turnHead','--- Turn: {card} ---',{card:pkState.community[3].r+pkState.community[3].s}));
  } else if(pkState.street==='turn'){
    pkState.street='river';pkState.community.push(pkState.deck.splice(0,1)[0]);
    pkLog(TF('casino.poker.riverHead','--- River: {card} ---',{card:pkState.community[4].r+pkState.community[4].s}));
  } else if(pkState.street==='river'){
    showdown();return;
  }
  renderCards();pkUpdateInfo();
  // AIs act, then player
  runAiRound(()=>setActionsEnabled(true));
}

function showdown(){
  pkState.street='showdown';
  // Evaluate all non-folded hands
  const contenders=[];
  if(!pkState.playerFolded){
    const pRank=rankHand([...pkState.playerHand,...pkState.community]);
    contenders.push({who:'player',rank:pRank});
  }
  pkState.ais.forEach(ai=>{
    if(!ai.folded&&ai.hand.length===2){
      const r=rankHand([...ai.hand,...pkState.community]);
      contenders.push({who:ai.name,ai,rank:r});
    }
  });
  renderCards();
  pkLog(T('casino.poker.showdownHead','--- Showdown ---'));
  contenders.forEach(c=>pkLog((c.who==='player'?T('casino.poker.you','You'):c.who)+': '+pkRankName(c.rank.name)));
  if(!contenders.length){endHand('push',T('casino.poker.noContest','No contestants, pot returned.'));return;}
  contenders.sort((a,b)=>b.rank.score-a.rank.score);
  const best=contenders[0];
  const winners=contenders.filter(c=>c.rank.score===best.rank.score);
  if(winners.length>1){
    const share=Math.floor(pkState.pot/winners.length);
    // AI shares still credit their local stacks; the player's share is settled
    // server-side via endHand (pass it through so there's one settlement point).
    winners.forEach(w=>{if(w.who!=='player'){w.ai.stack+=share;}});
    const names=winners.map(w=>w.who==='player'?T('casino.poker.you','You'):w.who).join(' & ');
    const playerWon=winners.some(w=>w.who==='player');
    endHand('push',TF('casino.poker.splitPot','Split pot! {names}, {rank}, Ƒ{share} each',{names:names,rank:pkRankName(best.rank.name),share:share}), playerWon?share:0);
  } else if(best.who==='player'){
    endHand('player',TF('casino.poker.youWinWith','You win with {rank}!',{rank:pkRankName(best.rank.name)}));
  } else {
    endHand('ai',TF('casino.poker.aiWinsWith','{name} wins with {rank}',{name:best.who,rank:pkRankName(best.rank.name)}));
  }
}

function endHand(winner,msg,playerSplitShare){
  pkState.street='idle';pkState.playerFolded=false;
  const pot=pkState.pot;
  // Determine the player's GROSS winnings for this hand:
  //   sole winner → the whole pot; split winner → their share (passed in);
  //   AI wins / push with no player share → 0. The player's contributions to the
  //   pot were already staked server-side (blind + calls/raises via add-on), so
  //   crediting the gross restores stake + profit. Server caps at wager + flat.
  let playerGross=0;
  if(winner==='player'){ playerGross=pot; }
  else if(typeof playerSplitShare==='number'){ playerGross=playerSplitShare; }
  if(pkRoundId){ CasinoNet.result(pkRoundId, playerGross); pkRoundId=null; }
  if(winner==='player'){
    showResult(TF('casino.poker.resultWin','🏆 {msg} +Ƒ{pot}',{msg:msg,pot:pot}),'win');
    pkLog(TF('casino.poker.youWinAmt','You win Ƒ{pot}.',{pot:pot}));
    document.querySelectorAll('.pk-seat').forEach(s=>s.classList.remove('winner'));
  } else if(winner==='ai'){
    const winnerAi=pkState.ais.find(a=>!a.folded);
    if(winnerAi)winnerAi.stack+=pot;
    showResult(TF('casino.poker.resultLose','💀 {msg} -Ƒ{pot}',{msg:msg,pot:pot}),'lose');
    pkLog(msg);
  } else {
    showResult(TF('casino.poker.resultPush','🤝 {msg}',{msg:msg}),'push');
    pkLog(msg);
  }
  pkState.pot=0;pkState.playerBet=0;
  pkState.ais.forEach(a=>a.bet=0);
  setActionsEnabled(false);
  renderCards();pkUpdateInfo();
}

window.pkDeal=async function(){
  const bl=BLIND_LEVELS[pkState.blindLevel]||BLIND_LEVELS[0];
  const buyin=bl.bb*5;
  const balance=pkGetBalance();
  if(balance<buyin){showResult(TF('casino.poker.needBuyin','Need at least Ƒ{buyin} to play.',{buyin:buyin}),'lose');return;}
  // Settle any prior un-finished hand as a loss of its stake (return 0) so the
  // server's one-open-round-per-game guard doesn't reject this new hand.
  if(pkRoundId){ CasinoNet.result(pkRoundId, 0); pkRoundId=null; }
  // Stake the small blind server-side to open the hand's round; subsequent
  // calls/raises are added on. Winnings settle at endHand.
  const round=await CasinoNet.bet('poker', bl.sb);
  if(!round.ok){ showResult(round.stale?T('casino.common.stale','Casino updated, refresh (Ctrl+Shift+R).'):TF('casino.common.betRejected','Bet rejected: {err}',{err:(round.error||'unknown')}),'lose'); return; }
  pkRoundId=round.roundId;
  pkState.playerStack=balance-bl.sb;
  pkState.deck=shuffle(makeDeck());
  pkState.playerHand=pkState.deck.splice(0,2);
  pkState.playerFolded=false;
  // Deal to AIs, reset stacks for new AIs or keep existing
  pkState.ais.forEach(ai=>{
    if(ai.stack<=0)ai.stack=500; // rebuy
    ai.hand=pkState.deck.splice(0,2);
    ai.bet=0;ai.folded=false;ai.allin=false;
  });
  pkState.community=[];
  pkState.pot=bl.sb+bl.bb;
  pkState.playerBet=bl.sb;
  // AI at seat 0 posts big blind
  pkState.ais[0].bet=bl.bb;pkState.ais[0].stack-=bl.bb;pkState.pot+=0; // already included
  pkState.street='preflop';
  pkState.handCount++;
  document.getElementById('pk-result-box').innerHTML='';
  pkLog(TF('casino.poker.handHead','--- Hand #{n} | Blinds Ƒ{sb}/Ƒ{bb} ---',{n:pkState.handCount,sb:bl.sb,bb:bl.bb}));
  if(pkState.handCount%5===0&&pkState.blindLevel<BLIND_LEVELS.length-1){
    pkState.blindLevel++;
    const nbl=BLIND_LEVELS[pkState.blindLevel];
    pkLog(TF('casino.poker.blindsUp','🔔 Blinds increase to Ƒ{sb}/Ƒ{bb}',{sb:nbl.sb,bb:nbl.bb}));
  }
  renderCards();pkUpdateInfo();
  // Remaining AIs act preflop, then player
  const preActors=pkState.ais.slice(1); // seat 0 already posted BB
  let i=0;
  function preflopNext(){
    if(i>=preActors.length){setActionsEnabled(true);return;}
    const ai=preActors[i++];
    const dec=aiDecideFor(ai);
    const bl2=BLIND_LEVELS[pkState.blindLevel]||BLIND_LEVELS[0];
    if(dec.action==='fold'){ai.folded=true;pkLog(TF('casino.poker.aiFoldsPre','{name} folds preflop.',{name:ai.name}));}
    else if(dec.action==='raise'&&dec.amount){const r=Math.min(dec.amount,ai.stack);ai.stack-=r;pkState.pot+=r;ai.bet+=r;pkLog(TF('casino.poker.aiRaisesPre','{name} raises Ƒ{amt}.',{name:ai.name,amt:r}));}
    else{const toC=Math.max(0,pkState.ais[0].bet-ai.bet);const pay=Math.min(toC,ai.stack);if(pay>0){ai.stack-=pay;pkState.pot+=pay;ai.bet+=pay;pkLog(TF('casino.poker.aiCalls','{name} calls Ƒ{amt}.',{name:ai.name,amt:pay}));}else{pkLog(TF('casino.poker.aiChecks','{name} checks.',{name:ai.name}));}}
    renderCards();pkUpdateInfo();
    setTimeout(preflopNext,280);
  }
  setTimeout(preflopNext,200);
};

window.pkFold=function(){
  if(pkState.street==='idle')return;
  pkState.playerFolded=true;
  pkLog(T('casino.poker.youFold','You fold.'));
  // Check if only AIs remain
  const remaining=pkState.ais.filter(a=>!a.folded);
  if(remaining.length===1){endHand('ai',TF('casino.poker.aiWinsAllFold','{name} wins, everyone folded.',{name:remaining[0].name}));return;}
  if(remaining.length===0){endHand('push',T('casino.poker.allFoldReturn','Everyone folded, pot returned.'));return;}
  // Continue AI rounds to determine winner
  advanceStreet();
};

window.pkCheck=function(){
  if(pkState.street==='idle')return;
  const maxBet=Math.max(...pkState.ais.filter(a=>!a.folded).map(a=>a.bet));
  if(maxBet>pkState.playerBet){pkLog(T('casino.poker.cannotCheck','Cannot check, call or fold.'));return;}
  pkLog(T('casino.poker.youCheck','You check.'));setActionsEnabled(false);
  advanceStreet();
};

window.pkCall=function(){
  if(pkState.street==='idle')return;
  const maxBet=Math.max(...pkState.ais.filter(a=>!a.folded).map(a=>a.bet));
  const toCall=Math.max(0,maxBet-pkState.playerBet);
  if(toCall<=0){pkCheck();return;}
  const pay=Math.min(toCall,pkGetBalance());
  if(pkRoundId){ CasinoNet.addon(pkRoundId, pay); }
  pkState.pot+=pay;pkState.playerBet+=pay;
  pkLog(TF('casino.poker.youCall','You call Ƒ{amt}.',{amt:pay}));setActionsEnabled(false);
  advanceStreet();
};

window.pkRaise=function(){
  if(pkState.street==='idle')return;
  const amt=parseInt(document.getElementById('pk-bet-input').value)||20;
  if(amt<=0||amt>pkGetBalance()){pkLog(T('casino.poker.invalidRaise','Invalid raise amount.'));return;}
  if(pkRoundId){ CasinoNet.addon(pkRoundId, amt); }
  pkState.pot+=amt;pkState.playerBet+=amt;
  pkLog(TF('casino.poker.youRaise','You raise Ƒ{amt}. Pot: Ƒ{pot}',{amt:amt,pot:pkState.pot}));
  setActionsEnabled(false);
  // AIs respond to the raise
  runAiRound(()=>{
    // Check if any AIs still active
    const active=pkState.ais.filter(a=>!a.folded);
    if(active.length===0){endHand('player',T('casino.poker.allFoldedWin','All opponents folded! You win!'));}
    else{advanceStreet();}
  });
};

window.pkSetBet=function(n){
  const inp=document.getElementById('pk-bet-input');
  if(inp)inp.value=Math.max(1,(parseInt(inp.value)||0)+n);
};
window.pkAllin=function(){
  const inp=document.getElementById('pk-bet-input');
  if(inp)inp.value=Math.round(pkGetBalance());
};

// Init
pkUpdateInfo();
renderSeats();
document.getElementById('pk-result-box').innerHTML='';
pkLog(T('casino.poker.welcome','Welcome to Texas Hold\'em. 6-max vs 5 AI opponents.'));
pkLog(T('casino.poker.postBlind','You post small blind. Press Deal to start.'));

})();
