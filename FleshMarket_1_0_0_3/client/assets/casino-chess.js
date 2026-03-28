
(function(){
  const pane = document.getElementById('casino-chess');
  if (!pane) return;
  pane.innerHTML = `
    <div class="row" style="gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div id="chessBoard" style="width:360px;height:360px;border:1px solid rgba(152,255,159,0.35);position:relative;user-select:none"></div>
      <div style="min-width:260px;flex:1">
        <div class="card" style="padding:10px">
          <div class="row" style="align-items:center;gap:8px">
            <label class="muted">AI ELO</label>
            <select id="chessElo" class="input" style="max-width:120px">
              <option>500</option><option>800</option><option>1100</option><option>1400</option>
              <option>1700</option><option>2000</option><option>2300</option><option>2600</option><option selected>3000</option>
            </select>
            <button id="chessStart" class="btn" style="margin-left:auto">Start</button>
            <button id="chessSurrender" class="btn" style="margin-left:8px">Surrender</button>
</div>
        
            </div>

          <div id="chessMoney" class="muted" style="margin-top:6px"></div>
        </div>
        <div class="card" style="padding:10px;margin-top:8px">
          <div class="row" style="justify-content:space-between">
            <div id="chessTurn" class="muted">—</div>
            <div id="chessBalance" class="muted">Balance: —</div>
          </div>
          <div id="chessStatus" class="muted" style="margin-top:6px"></div>
        </div>
        <div class="card" style="padding:10px;margin-top:8px">
          <div class="muted" style="margin-bottom:6px">Payouts</div>
          <div id="chessPayouts" class="muted" style="font-size:12px;line-height:1.5"></div>
        </div>
      </div>
    </div>
  `;

  // helpers from roulette section if present
  function fmtLocal(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }
  function getBalance() {
    if (typeof ME === 'object' && ME && typeof ME.cash === 'number') return ME.cash;
    const c = document.getElementById('cash');
    if (c && c.textContent) {
      const n = Number(c.textContent.replace(/[^\d.-]/g,''));
      if (!Number.isNaN(n)) return n;
    }
    const s = localStorage.getItem('casino_balance_shadow');
    return s ? Number(s) : 0;
  }
  function setBalance(newVal) {
    if (typeof ME === 'object' && ME && typeof ME.cash === 'number') { ME.cash = newVal; 
try { window.__PnLLastCash = Number(newVal) || 0; window.__MY_CASH = Number(newVal) || 0; try{ liveUpdatePnL(null,null); }catch(_){} } catch(_e) {}
try { window.PnLBridge && typeof window.PnLBridge.pushNow === 'function' && window.PnLBridge.pushNow(); } catch(_e) {}
try { (window.bus||window.__bus) && typeof (window.bus||window.__bus).emit === 'function' && (window.bus||window.__bus).emit('trade', null, 0); } catch(_e) {}
}
    const c = document.getElementById('cash'); if (c) c.textContent = fmtLocal(newVal);
      try{ if(window.ws&&window.ws.readyState===1) window.ws.send(JSON.stringify({type:'casino',sync:Number(newVal)||0})); }catch(_e){}
  refreshChessBalance();
  }
  function adjustBalance(delta){ setBalance(getBalance()+delta); }
  function refreshChessBalance(){
    const lbl = document.getElementById('chessBalance');
    if (lbl) lbl.textContent = 'Balance: ' + fmtLocal(getBalance());
  }

  // Money model: entry fee scales with ELO; win pays 2.5x fee, draw refunds 1x, loss gets 0.
  function feeForElo(elo){ return Math.round(10 + (Math.max(500, Math.min(3000, Number(elo))) - 500) * 0.08); }
  function updateMoneyText(){
    const elo = Number(document.getElementById('chessElo').value);
    const fee = feeForElo(elo);
    const win = Math.round(fee * 2.5);
    const draw = fee;
    const el = document.getElementById('chessMoney');
    el.textContent = `Entry Fee: ${fmtLocal(fee)}  |  Win: ${fmtLocal(win)}  ·  Draw: ${fmtLocal(draw)}  ·  Loss: ${fmtLocal(0)}`;
    const p = document.getElementById('chessPayouts');
    p.textContent = 'Higher ELO ⇒ higher entry fee and payout. Fees are charged on Start. Rewards are paid at game end.';
  }

  // Minimal chess engine (legal movegen + simple eval + variable depth)
  const boardEl = document.getElementById('chessBoard');
  const S = 45; // square size (360/8)
  let game = null, selected = null, moves = [], playing = false;

  // Unicode pieces
  const UNI = { 'P':'♙','N':'♘','B':'♗','R':'♖','Q':'♕','K':'♔','p':'♟','n':'♞','b':'♝','r':'♜','q':'♛','k':'♚' };

  function startPosition(){
    const row = (a,b,c,d)=>[a,b,c,d,c,b,a];
    return [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R'],
    ];
  }
  function cloneBoard(b){ return b.map(r=>r.slice()); }
  function side(p){ return p && (p===p.toUpperCase() ? 'w' : 'b'); }
  function opposite(s){ return s==='w'?'b':'w'; }
  function inBounds(x,y){ return x>=0&&x<8&&y>=0&&y<8; }

  function kingPos(b, whom){
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if ((whom==='w' && p==='K')||(whom==='b' && p==='k')) return {x,y};
    }
    return null;
  }

  // generate pseudo-legal moves and filter out self-check
  function genMoves(b, turn){
    const mv = [];
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if (!p || side(p)!==turn) continue;
      const add=(nx,ny,promo=null)=>{ if(!inBounds(nx,ny))return; const t=b[ny][nx]; if (t && side(t)===turn) return; mv.push({x,y,nx,ny,piece:p,cap:t||'',promo}); };
      const s = side(p);
      const dx = [1,2,2,1,-1,-2,-2,-1], dy=[2,1,-1,-2,-2,-1,1,2];
      switch(p.toLowerCase()){
        case 'p': {
          const dir = s==='w'?-1:1, start = s==='w'?6:1;
          // advance
          if (!b[y+dir] || b[y+dir][x]!=='' ){
          } else {
            add(x,y+dir);
            if (y===start && b[y+2*dir][x]==='') add(x,y+2*dir);
          }
          // captures
          for (const cx of [-1,1]){
            const nx=x+cx, ny=y+dir;
            if (inBounds(nx,ny) && b[ny][nx]!=='' && side(b[ny][nx])!==s) add(nx,ny);
          }
          // promotions
          const last = s==='w'?0:7;
          for (let i=mv.length-1;i>=0;i--){
            const m=mv[i];
            if (m.y===y && m.x===x && m.ny===last) { mv.splice(i,1); ['q','r','b','n'].forEach(ch=>mv.push({...m,promo:(s==='w'?ch.toUpperCase():ch)})); }
          }
          break;
        }
        case 'n':
          for (let i=0;i<8;i++) add(x+dx[i],y+dy[i]);
          break;
        case 'b': {
          for (const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'r': {
          for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'q': {
          for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'k': {
          for (let sx=-1;sx<=1;sx++) for (let sy=-1;sy<=1;sy++){
            if (sx||sy) add(x+sx,y+sy);
          }
          break;
        }
      }
    }
    // filter self-check
    return mv.filter(m=>!leavesInCheck(b,m,turn));
  }

  function applyMove(b,m){
    const nb = cloneBoard(b);
    nb[m.ny][m.nx] = m.promo ? m.promo : nb[m.y][m.x];
    nb[m.y][m.x] = '';
    return nb;
  }

  function attackedBy(b, who, x, y){
    // naive: check if square (x,y) is attacked by 'who'
    for (let m of genMovesRaw(b, who)){
      if (m.nx===x && m.ny===y) return true;
    }
    return false;
  }

  function genMovesRaw(b, turn){
    // like genMoves but without self-check filtering
    const mv = [];
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if (!p || side(p)!==turn) continue;
      const add=(nx,ny,promo=null)=>{ if(!inBounds(nx,ny))return; const t=b[ny][nx]; if (t && side(t)===turn) return; mv.push({x,y,nx,ny,piece:p,cap:t||'',promo}); };
      const s = side(p);
      const dx = [1,2,2,1,-1,-2,-2,-1], dy=[2,1,-1,-2,-2,-1,1,2];
      switch(p.toLowerCase()){
        case 'p': {
          const dir = s==='w'?-1:1, start = s==='w'?6:1;
          if (!b[y+dir] || b[y+dir][x]!=='' ){
          } else {
            add(x,y+dir);
            if (y===start && b[y+2*dir][x]==='') add(x,y+2*dir);
          }
          for (const cx of [-1,1]){
            const nx=x+cx, ny=y+dir;
            if (inBounds(nx,ny) && b[ny][nx]!=='' && side(b[ny][nx])!==s) add(nx,ny);
          }
          const last = s==='w'?0:7;
          for (let i=mv.length-1;i>=0;i--){
            const m=mv[i];
            if (m.y===y && m.x===x && m.ny===last) { mv.splice(i,1); ['q','r','b','n'].forEach(ch=>mv.push({...m,promo:(s==='w'?ch.toUpperCase():ch)})); }
          }
          break;
        }
        case 'n':
          for (let i=0;i<8;i++) add(x+dx[i],y+dy[i]);
          break;
        case 'b': {
          for (const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'r': {
          for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'q': {
          for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
            let nx=x+sx, ny=y+sy;
            while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny); nx+=sx; ny+=sy; }
            if (inBounds(nx,ny) && side(b[ny][nx])!==s) add(nx,ny);
          }
          break;
        }
        case 'k': {
          for (let sx=-1;sx<=1;sx++) for (let sy=-1;sy<=1;sy++){
            if (sx||sy) add(x+sx,y+sy);
          }
          break;
        }
      }
    }
    return mv;
  }

  function leavesInCheck(b,m,turn){
    const nb = applyMove(b,m);
    const k = kingPos(nb, turn);
    if (!k) return false;
    return attackedBy(nb, opposite(turn), k.x, k.y);
  }

  function evaluate(b){
    const vals = {p:100, n:320, b:330, r:500, q:900, k:0};
    let score = 0;
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if (!p) continue;
      const v = vals[p.toLowerCase()]||0;
      score += (p===p.toUpperCase()? v : -v);
    }
    return score;
  }

  function search(b, turn, depth, alpha, beta){
    if (depth===0) return evaluate(b)*(turn==='w'?1:-1);
    const moves = genMoves(b, turn);
    if (moves.length===0){
      // checkmate/stalemate scoring handled by outer code
      return evaluate(b)*(turn==='w'?1:-1);
    }
    let best = -1e9;
    for (let m of moves){
      const sc = -search(applyMove(b,m), opposite(turn), depth-1, -beta, -alpha);
      if (sc>best) best=sc;
      if (best>alpha) alpha=best;
      if (alpha>=beta) break;
    }
    return best;
  }

  function pickAIMove(b, turn, elo){
    // map elo to depth and randomness
    let depth = 1;
    if (elo>=800) depth=2;
    if (elo>=1400) depth=3;
    if (elo>=2000) depth=4;
    if (elo>=2600) depth=5;
    const noise = Math.max(0, 3000-elo)/300; // more noise for low elo
    const ms = genMoves(b, turn);
    if (!ms.length) return null;
    let scored = ms.map(m=>{
      const s = -search(applyMove(b,m), opposite(turn), depth-1, -1e9, 1e9);
      return {m, s: s + (Math.random()-0.5)*noise};
    });
    scored.sort((a,b)=>b.s-a.s);
    // occasionally pick a suboptimal move for lower elo
    let idx = 0;
    if (elo < 1200 && Math.random()<0.25) idx = Math.min(2, scored.length-1);
    else if (elo < 1800 && Math.random()<0.15) idx = Math.min(1, scored.length-1);
    return scored[idx].m;
  }

  function drawBoard(b){
    const d = boardEl;
    d.innerHTML = '';
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const sq = document.createElement('div');
      sq.style.position='absolute';
      sq.style.left=(x*S)+'px'; sq.style.top=(y*S)+'px';
      sq.style.width=S+'px'; sq.style.height=S+'px';
      const dark = (x+y)%2===1;
      sq.style.background = dark? 'rgba(152,255,159,0.08)' : 'rgba(152,255,159,0.02)';
      if (selected && selected.x===x && selected.y===y) sq.style.outline='2px solid rgba(152,255,159,0.6)';
      // legal move dots
      const leg = moves.filter(m=>m.x===selected?.x && m.y===selected?.y && m.nx===x && m.ny===y);
      if (leg.length){
        const dot = document.createElement('div');
        dot.style.position='absolute'; dot.style.left='50%'; dot.style.top='50%';
        dot.style.transform='translate(-50%,-50%)';
        dot.style.width='10px'; dot.style.height='10px'; dot.style.borderRadius='50%';
        dot.style.background='rgba(152,255,159,0.5)';
        sq.appendChild(dot);
      }
      const p = b[y][x];
      if (p){
        const span = document.createElement('div');
        span.style.position='absolute'; span.style.left='50%'; span.style.top='50%';
        span.style.transform='translate(-50%,-50%)';
        span.style.fontSize='28px'; span.textContent = UNI[p] || '?';
        span.style.color = p===p.toUpperCase()? 'rgba(152,255,159,0.95)' : 'rgba(152,255,159,0.75)';
        sq.appendChild(span);
      }
      sq.addEventListener('click', ()=> onSquareClick(x,y));
      d.appendChild(sq);
    }
  }

  function status(text){ document.getElementById('chessStatus').textContent = text; }
  function turnLabel(t){ document.getElementById('chessTurn').textContent = t==='w'?'Your move (White)':'AI thinking… (Black)'; }

  function onSquareClick(x,y){
    if (!playing) return;
    if (game.turn!=='w') return;
    const p = game.board[y][x];
    if (selected && selected.x===x && selected.y===y){ selected=null; moves=[]; drawBoard(game.board); return; }
    if (selected){
      const mv = moves.find(m=>m.x===selected.x && m.y===selected.y && m.nx===x && m.ny===y);
      if (mv){
        game.board = applyMove(game.board, mv);
        game.turn = 'b';
        selected=null; moves=[]; drawBoard(game.board);
        checkEndOrAI();
        return;
      }
    }
    if (p && side(p)==='w'){
      selected={x,y}; moves = genMoves(game.board,'w'); drawBoard(game.board);
    }
  }

  function checkmateOrStalemate(b, t){
    const leg = genMoves(b,t);
    if (leg.length) return null;
    // if in check -> mate else stalemate
    const kp = kingPos(b,t);
    if (!kp) return 'mate';
    if (attackedBy(b, opposite(t), kp.x, kp.y)) return 'mate'; else return 'stalemate';
  }

  function endGame(result){
  stopClock(); resetClockUI();
  const timedResult = result;
  if (result==='time_white') result='loss';
  if (result==='time_black') result='win';
  playing=false;
  const elo = Number(document.getElementById('chessElo').value);
  const fee = feeForElo(elo);
  if (result==='win'){
    const win = Math.round(fee*2.5);
    adjustBalance(win);
    status(timedResult==='time_black' ? 'AI ran out of time! You win ' + fmtLocal(win) : 'Checkmate! You win ' + fmtLocal(win));
  } else if (result==='loss'){
    status(timedResult==='time_white' ? 'You ran out of time.' : 'Checkmated. Better luck next time.');
  } else if (result==='surrender'){
    status('You surrendered.');
  } else {
    const draw = fee;
    adjustBalance(draw);
    status('Draw. Refunded ' + fmtLocal(draw));
  }
  refreshChessBalance();
  }

  function checkEndOrAI(){
    const end = checkmateOrStalemate(game.board, game.turn);
    if (end==='mate'){ endGame(game.turn==='w'?'loss':'win'); return; }
    if (end==='stalemate'){ endGame('draw'); return; }
    if (game.turn==='b'){
      turnLabel('b');
      switchTurnClock('w');
      // AI move with small delay
      setTimeout(()=>{
        const elo = Number(document.getElementById('chessElo').value);
        const mv = pickAIMove(game.board, 'b', elo);
        if (!mv){ endGame('draw'); return; }
        game.board = applyMove(game.board, mv);
        game.turn='w';
        switchTurnClock('b');
        drawBoard(game.board);
        const end2 = checkmateOrStalemate(game.board, 'w');
        if (end2==='mate'){ endGame('loss'); return; }
        if (end2==='stalemate'){ endGame('draw'); return; }
        turnLabel('w');
        status('Your move.');
      }, 250);
    }
  }



  // Clock disabled — AI moves instantly, no player timer needed
  const clock = { w:0, b:0, base:0, inc:0, running:false, interval:null, turn:'w' };
  function updateClockDisplay(){}
  function resetClockUI(){ if(clock.interval){clearInterval(clock.interval);clock.interval=null;} clock.running=false; }
  function setTimeControlFromSelect(){}
  function startClock(turn){ clock.turn=turn; }
  function stopClock(){ clock.running=false; if(clock.interval){clearInterval(clock.interval);clock.interval=null;} }
  function switchTurnClock(prevTurn){}

function startGame(){
  setTimeControlFromSelect(); resetClockUI(); startClock('w');
    
    
    const elo = Number(document.getElementById('chessElo').value);
    const fee = feeForElo(elo);
    if (getBalance() < fee){ status('Insufficient funds for entry fee.'); return; }
    adjustBalance(-fee);
    refreshChessBalance();
    game = { board: startPosition(), turn:'w' };
    selected=null; moves=[]; playing=true;
    drawBoard(game.board);
    turnLabel('w');
    status('Game started. You are White.');
  }

  
  
  
  document.getElementById('chessSurrender').addEventListener('click', ()=>{
    if (!playing) { status('No game in progress.'); return; }
    endGame('loss');
  });

  document.getElementById('chessElo').addEventListener('change', updateMoneyText);
  const startBtn = document.getElementById('chessStart'); if (startBtn) startBtn.addEventListener('click', startGame);
  



  if (typeof toggleBtn !== 'undefined' && toggleBtn){
    toggleBtn.addEventListener('click', ()=>{
      if (!playing){
        startGame();
        toggleBtn.textContent = 'Surrender';
      } else {
        endGame('surrender');
        toggleBtn.textContent = 'Start';
      }
    });
  }

  updateMoneyText();
  refreshChessBalance();
  // render initial
  game = { board: startPosition(), turn:'w' };
  drawBoard(game.board);
  status('Choose difficulty and press Start.');
  turnLabel('w');
})();
