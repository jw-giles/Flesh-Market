/* Chess AI Web Worker - Time-limited, ordered alpha-beta with iterative deepening */
self.onmessage = (e)=>{
  const {type, board, turn, elo} = e.data || {};
  if (type !== 'move') return;

  const TIME_BUDGET_MS = (elo>=2600) ? 150 : (elo>=2000? 120 : 80);
  const MAX_DEPTH_CAP = (elo>=2600) ? 7 : (elo>=2000 ? 6 : 5);

  let startTime = Date.now();
  let nodes = 0;
  let stop = false;

  function timeUp(){ return (Date.now() - startTime) >= TIME_BUDGET_MS; }

  function cloneBoard(b){ return b.map(row=>row.slice()); }
  function inBounds(x,y){ return x>=0&&x<8&&y>=0&&y<8; }
  function side(p){ return p && p!=='' ? (p===p.toUpperCase()?'w':'b') : null; }
  function opposite(s){ return s==='w'?'b':'w'; }

  // simple hash from board + turn
  function hash(b, t){
    let s = t;
    for (let y=0;y<8;y++){
      for (let x=0;x<8;x++){
        const p = b[y][x];
        s += p ? p : '_';
      }
    }
    // DJB2-ish
    let h=5381;
    for (let i=0;i<s.length;i++){ h = ((h<<5)+h) ^ s.charCodeAt(i); }
    return h>>>0;
  }

  function kingPos(b, t){
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if (!p) continue;
      if ((t==='w' && p==='K') || (t==='b' && p==='k')) return {x,y};
    }
    return null;
  }

  function applyMove(b,m){
    const nb = cloneBoard(b);
    const piece = nb[m.y][m.x];
    nb[m.y][m.x] = '';
    nb[m.ny][m.nx] = m.promo ? m.promo : piece;
    return nb;
  }

  function attackedBy(b, who, x, y){
    const mvs = genMoves(b, who, true);
    for (const m of mvs){ if (m.nx===x && m.ny===y) return true; }
    return false;
  }

  function leavesInCheck(b, m, t){
    const nb = applyMove(b, m);
    const kp = kingPos(nb, t);
    if (!kp) return true;
    return attackedBy(nb, opposite(t), kp.x, kp.y);
  }

  function genMoves(b, t, raw=false){
    const mv = [];
    function add(nx,ny,x,y){
      const cap = b[ny][nx]; // may be ''
      mv.push({x,y,nx,ny,piece:b[y][x],cap});
    }
    for (let y=0;y<8;y++){
      for (let x=0;x<8;x++){
        const p = b[y][x]; if (!p) continue;
        const s = side(p); if (s!==t) continue;
        const lp = p.toLowerCase();
        switch (lp){
          case 'p': {
            const dir = (t==='w')?-1:1;
            const ny = y+dir;
            if (inBounds(x,ny) && b[ny][x]==='') add(x,ny,x,y);
            for (const dx of [-1,1]){
              const nx = x+dx;
              if (inBounds(nx,ny) && b[ny][nx]!=='' && side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
          case 'n': {
            for (const [dx,dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]){
              const nx=x+dx, ny=y+dy;
              if (!inBounds(nx,ny)) continue;
              if (b[ny][nx]==='' || side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
          case 'b': {
            for (const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
              let nx=x+sx, ny=y+sy;
              while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny,x,y); nx+=sx; ny+=sy; }
              if (inBounds(nx,ny) && side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
          case 'r': {
            for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1]]){
              let nx=x+sx, ny=y+sy;
              while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny,x,y); nx+=sx; ny+=sy; }
              if (inBounds(nx,ny) && side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
          case 'q': {
            for (const [sx,sy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
              let nx=x+sx, ny=y+sy;
              while (inBounds(nx,ny) && b[ny][nx]===''){ add(nx,ny,x,y); nx+=sx; ny+=sy; }
              if (inBounds(nx,ny) && side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
          case 'k': {
            for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
              const nx=x+dx, ny=y+dy;
              if (!inBounds(nx,ny)) continue;
              if (b[ny][nx]==='' || side(b[ny][nx])!==t) add(nx,ny,x,y);
            }
            break;
          }
        }
      }
    }
    if (!raw){
      return mv.filter(m=>!leavesInCheck(b,m,t));
    }
    return mv;
  }

  const PV = { p:100, n:320, b:330, r:500, q:900, k:0 };
  function evaluate(b){
    let s=0;
    for (let y=0;y<8;y++) for (let x=0;x<8;x++){
      const p=b[y][x]; if (p==='') continue;
      const v = PV[p.toLowerCase()] || 0;
      s += (p===p.toUpperCase()? v : -v);
    }
    return s;
  }

  // Transposition table
  const TT = new Map();
  function ttGet(h, depth, alpha, beta){
    const e = TT.get(h);
    if (!e) return null;
    if (e.depth < depth) return null;
    if (e.flag==='EXACT') return e.score;
    if (e.flag==='LOWER' && e.score >= beta) return e.score;
    if (e.flag==='UPPER' && e.score <= alpha) return e.score;
    return null;
  }

  function orderMoves(b, t, moves, ttBest=null){
    // MVV-LVA style: prefer captures of high value with low piece value
    const val = PV;
    function pieceVal(p){ return val[p?.toLowerCase?.()] || 0; }
    return moves.slice().sort((a,bm)=>{
      // TT best on top
      if (ttBest && a.x===ttBest.x && a.y===ttBest.y && a.nx===ttBest.nx && a.ny===ttBest.ny) return -1;
      if (ttBest && bm.x===ttBest.x && bm.y===ttBest.y && bm.nx===ttBest.nx && bm.ny===ttBest.ny) return 1;
      const aScore = (a.cap? (pieceVal(a.cap)+1000) : 0) - pieceVal(a.piece);
      const bScore = (bm.cap? (pieceVal(bm.cap)+1000) : 0) - pieceVal(bm.piece);
      return bScore - aScore;
    });
  }

  function search(b, turn, depth, alpha, beta){
    if (stop || timeUp()) { stop = true; return 0; }
    nodes++;
    if (depth===0) return evaluate(b)*(turn==='w'?1:-1);

    const h = hash(b, turn);
    const ttprobe = ttGet(h, depth, alpha, beta);
    if (ttprobe !== null) return ttprobe;

    let moves = genMoves(b, turn);
    if (moves.length===0) return evaluate(b)*(turn==='w'?1:-1);

    // order moves (try TT move first if present)
    const ttEntry = TT.get(h);
    const ttBest = ttEntry ? ttEntry.best : null;
    moves = orderMoves(b, turn, moves, ttBest);

    let best = -1e9;
    let bestMove = null;
    let a = alpha;

    for (const m of moves){
      const sc = -search(applyMove(b,m), opposite(turn), depth-1, -beta, -a);
      if (stop) break;
      if (sc>best){ best=sc; bestMove = m; }
      if (best>a) a=best;
      if (a>=beta) break;
    }

    // store to TT
    let flag = 'EXACT';
    if (best <= alpha) flag = 'UPPER';
    else if (best >= beta) flag = 'LOWER';
    TT.set(h, {score: best, depth, flag, best: bestMove});

    return best;
  }

  function pickAIMove(b, t, elo){
    const maxDepth = Math.min(MAX_DEPTH_CAP, 8);
    let bestMove = null;
    let bestScore = -1e9;
    for (let d=1; d<=maxDepth; d++){
      // iterative deepening
      const moves = genMoves(b, t);
      const ordered = orderMoves(b, t, moves, (TT.get(hash(b,t))||{}).best || null);
      let localBest = bestMove, localScore = -1e9;
      let a = -1e9, beta = 1e9;
      for (const m of ordered){
        const sc = -search(applyMove(b,m), opposite(t), d-1, -beta, -a);
        if (stop) break;
        if (sc>localScore){ localScore = sc; localBest = m; if (localScore>a) a=localScore; }
      }
      if (stop) break;
      bestMove = localBest || bestMove;
      bestScore = localScore;
      // store PV in TT for better ordering next iteration
      const h = hash(b,t);
      TT.set(h, {score: bestScore, depth: d, flag: 'EXACT', best: bestMove});
      if (timeUp()) { stop = true; break; }
    }
    return bestMove;
  }

  try{
    const mv = pickAIMove(board, turn, elo);
    postMessage({ok:true, mv, stats:{nodes, ms:(Date.now()-startTime)}});
  }catch(err){
    postMessage({ok:false, error: String(err)});
  }
};
