
/**
 * casino-sudoku.js - Sudoku (client).
 *
 * The client no longer generates the puzzle, holds the solution, decides
 * whether it has been solved, or names a payout. It renders what the server
 * sends and posts the grid back. Everything that decides cash lives in
 * server/sudoku.js and the sudoku_start / sudoku_hint / sudoku_finish handlers.
 *
 * The old version did all of it locally, which meant two console calls paid the
 * Insane reward without a cell being filled, every twenty seconds, bounded only
 * by a payout cap and a cooldown that lived in localStorage.
 *
 * It also meant the game REJECTED CORRECT ANSWERS. The generator removed clues
 * at random with no uniqueness check, so above Easy a board usually had dozens
 * of valid completions, and the client graded by comparing against its own
 * stored one. Grading is by validity on the server now, and the generator only
 * removes a clue while the board still has exactly one solution.
 */
(function(){
  const pane = document.getElementById('casino-sudoku');
  if (!pane) return;
  const T=(k,fb)=>window.t?window.t(k,fb):fb;
  const TF=(k,fb,v)=>window.tf?window.tf(k,fb,v):fb;
  function sdkDiffName(n){var m={'Easy':'casino.sdk.diffEasy','Medium':'casino.sdk.diffMedium','Hard':'casino.sdk.diffHard','Expert':'casino.sdk.diffExpert','Insane':'casino.sdk.diffInsane'};return T(m[n]||'',n);}

  /* Names and prices only, for the buttons before the lobby answers. Clue
     counts are not here at all: the board arrives built, and a client that
     believes it knows how many clues a tier has is a client that can disagree
     with the server about what it is playing. Rewards are overwritten by the
     lobby payload, so this list cannot drift away from the price actually paid. */
  const DIFFICULTIES = [
    { name:'Easy',   reward:50,   label:'Ƒ50'   },
    { name:'Medium', reward:200,  label:'Ƒ200'  },
    { name:'Hard',   reward:750,  label:'Ƒ750'  },
    { name:'Expert', reward:2500, label:'Ƒ2,500'},
    { name:'Insane', reward:4000, label:'Ƒ4,000'},
  ];

  /* Net: promise wrapper over the sudoku messages. Same shape as the exams and
     for the same reason, the socket is a stream of unrelated frames so a call
     has to say which ack is its own. */
  const PENDING = new Map();
  let seq = 0;
  const ACKS = new Set(['sudoku_lobby_ack','sudoku_start_ack','sudoku_hint_ack','sudoku_finish_ack']);
  function sock(){
    return window.ws && window.ws.readyState === 1 ? window.ws
         : (window._ws && window._ws.readyState === 1 ? window._ws : null);
  }
  document.addEventListener('fm_ws_msg', function(e){
    const m = e && e.detail;
    if (!m || !m.type || !ACKS.has(m.type)) return;
    for (const [key, entry] of PENDING) {
      let hit = false;
      try { hit = entry.match(m); } catch(_) { hit = false; }
      if (hit) { clearTimeout(entry.timer); PENDING.delete(key); entry.resolve(m.data || {}); break; }
    }
  });
  function call(type, payload, ackType){
    const w = sock();
    if (!w) return Promise.resolve({ ok:false, error:'offline' });
    return new Promise(function(resolve){
      const key = 's' + (++seq);
      const timer = setTimeout(function(){ if(PENDING.has(key)){ PENDING.delete(key); resolve({ok:false,error:'timeout'}); } }, 15000);
      PENDING.set(key, { timer, resolve, match:function(m){ return m.type === ackType; } });
      try { w.send(JSON.stringify(Object.assign({type}, payload))); }
      catch(_){ clearTimeout(timer); PENDING.delete(key); resolve({ok:false,error:'offline'}); }
    });
  }

  function init() {
    if (pane.dataset.inited) return; pane.dataset.inited='1';

  pane.innerHTML = `
  <style>
    #sdk-wrap{font-family:monospace;padding:12px;max-width:520px}
    #sdk-board{display:grid;grid-template-columns:repeat(9,1fr);background:#1a1a0a;border:2px solid #6a5a20;border-radius:4px;width:369px;margin:10px 0;user-select:none}
    .sdk-cell{width:41px;height:41px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;color:#72e09c;border:1px solid #2a2a10;background:#0d0d06;box-sizing:border-box;transition:background .08s;outline:none;position:relative}
    .sdk-cell.given{color:#ccc;cursor:default;font-weight:bold}
    .sdk-cell.selected{background:#2a2510!important}
    .sdk-cell.peer{background:#141408}
    .sdk-cell.user-val{color:#72e09c}
    /* thick borders for 3x3 boxes */
    .sdk-cell:nth-child(3n+1):not(:nth-child(1)){border-left:2px solid #6a5a20}
    .sdk-cell:nth-child(n+19):nth-child(-n+27){border-bottom:2px solid #6a5a20}
    .sdk-cell:nth-child(n+46):nth-child(-n+54){border-bottom:2px solid #6a5a20}
    #sdk-numpad{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
    #sdk-numpad button{width:34px;height:34px;font-size:.95rem;font-family:monospace;background:#06200d;border:1px solid #1f4a1f;color:#72e09c;cursor:pointer;border-radius:4px}
    #sdk-numpad button:hover{background:#2a2200}
    #sdk-status{margin-top:6px;font-size:.85rem;color:#72e09c;min-height:20px}
    .sdk-diff-btn{padding:5px 10px;margin:2px;background:#06200d;border:1px solid #1f4a1f;color:#72e09c;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.8rem;text-align:center}
    .sdk-diff-btn.active{background:#2a2200;border-color:#72e09c}
    .sdk-diff-btn span{display:block;color:#888;font-size:.7rem}
    #sdk-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    #sdk-actions button{padding:6px 14px;font-family:monospace;font-size:.85rem;background:#06200d;border:1px solid #5a4a10;color:#72e09c;cursor:pointer;border-radius:4px}
    #sdk-actions button:hover{background:#2a2200}
    #sdk-actions button:disabled{opacity:.35;cursor:not-allowed}
    #sdk-submit{border-color:#4ecdc4!important;color:#4ecdc4!important}
    #sdk-submit:hover:not(:disabled){background:#0a1a1a!important}
    #sdk-cells-left{font-size:.78rem;color:#888;margin-top:4px}
  </style>
  <div id="sdk-wrap">
    <div style="letter-spacing:.1em;font-size:.9rem;color:#72e09c;margin-bottom:8px" data-i18n="casino.sdk.title">SUDOKU</div>
    <div id="sdk-diff-row" style="margin-bottom:8px;display:flex;flex-wrap:wrap">
      ${DIFFICULTIES.map((d,i)=>`<button class="sdk-diff-btn${i===1?' active':''}" data-idx="${i}">${sdkDiffName(d.name)}<span>${d.label}</span></button>`).join('')}
    </div>
    <div id="sdk-board"></div>
    <div id="sdk-numpad">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join('')}
      <button data-n="0" style="width:52px;font-size:.8rem" data-i18n="casino.sdk.clear">✕ Clear</button>
    </div>
    <div id="sdk-cells-left"></div>
    <div id="sdk-actions">
      <button id="sdk-new" data-i18n="casino.sdk.newPuzzle">New Puzzle</button>
      <button id="sdk-submit" disabled data-i18n="casino.sdk.submit">Submit</button>
      <button id="sdk-hint" data-i18n="casino.sdk.hint20">Hint (−20% reward)</button>
    </div>
    <div id="sdk-status" data-i18n="casino.sdk.chooseDiff">Choose difficulty and press New Puzzle.</div>
  </div>`;
  if(window.applyI18n) window.applyI18n(pane);

  // ── State ─────────────────────────────────────────────────
  /* NO `solution` HERE, and that is the whole point of the rewrite. The client
     cannot grade what it cannot see, and it no longer needs to. */
  let puzzle=[], userGrid=[], selected=-1;
  let diffIdx=1, hintUses=0, hintMax=4, playing=false, busy=false;
  let sdkRoundId=null;      // server round id for the active puzzle
  let curReward=0;          // what this board pays now, after hints
  let cooldowns={};         // diffId -> ms left, refreshed from the lobby

  function getBalance(){ return (typeof ME==='object'&&ME&&typeof ME.cash==='number')?ME.cash:0; }
  function setBalance(v){
    if(typeof ME==='object'&&ME){ME.cash=v;}
    const c=document.getElementById('cash');if(c)c.textContent='Ƒ'+Math.round(v).toLocaleString();
    // Legacy {type:'casino',sync} removed — server-authoritative cash.
  }

  /* THE GENERATOR IS GONE. It lived here, produced the solution alongside the
     puzzle, and handed both to code that then decided what the player had won.
     It is server/sudoku.js now, and it also enforces uniqueness, which this one
     never did. */

  // ── Render ─────────────────────────────────────────────────
  /* userGrid now starts as a COPY of the puzzle rather than 81 zeroes, because
     the grid posted back to the server has to be a full board including the
     givens. A cell is outstanding when it is not a given and still blank. */
  function countEmpty(){ return userGrid.filter((v,i)=>puzzle[i]===0&&!v).length; }

  function render(){
    const board=document.getElementById('sdk-board');
    if(!board)return;
    board.innerHTML='';
    for(let i=0;i<81;i++){
      const cell=document.createElement('div');
      cell.className='sdk-cell';
      const isGiven=puzzle[i]!==0;
      if(isGiven){cell.classList.add('given');cell.textContent=puzzle[i];}
      else{
        if(i===selected)cell.classList.add('selected');
        else if(selected>=0){
          const sr=Math.floor(selected/9),sc=selected%9;
          const r=Math.floor(i/9),c=i%9;
          if(r===sr||c===sc||(Math.floor(r/3)===Math.floor(sr/3)&&Math.floor(c/3)===Math.floor(sc/3)))
            cell.classList.add('peer');
        }
        if(userGrid[i]){cell.textContent=userGrid[i];cell.classList.add('user-val');}
      }
      cell.addEventListener('click',()=>{ if(!isGiven&&playing){selected=i;render();} });
      board.appendChild(cell);
    }
    // Update submit button and cells left
    const empty=countEmpty();
    const submitBtn=document.getElementById('sdk-submit');
    const cellsLbl=document.getElementById('sdk-cells-left');
    if(submitBtn)submitBtn.disabled=!playing||empty>0;
    if(cellsLbl)cellsLbl.textContent=playing?(empty>0?TF('casino.sdk.cellsRemaining','{n} cells remaining',{n:empty}):T('casino.sdk.boardComplete','Board complete, press Submit!')):'';
  }

  // ── New puzzle ─────────────────────────────────────────────
  /* THE COOLDOWN IS THE SERVER'S. It used to be a localStorage key, which is to
     say it was advice: clear the key and the timer never happened. This block
     only decides what the button SAYS; the server refuses the round either way. */
  function refreshLobby(){
    return call('sudoku_lobby', {}, 'sudoku_lobby_ack').then(function(r){
      if(!r || !r.ok) return;
      hintMax = r.hintMax || hintMax;
      cooldowns = {};
      (r.tiers||[]).forEach(function(t){
        cooldowns[t.id] = t.cooldownLeftMs || 0;
        if(DIFFICULTIES[t.id]) DIFFICULTIES[t.id].reward = t.reward;
      });
      paintDiffRow();
    });
  }
  function paintDiffRow(){
    document.querySelectorAll('.sdk-diff-btn').forEach(function(b){
      const i = parseInt(b.dataset.idx);
      const left = cooldowns[i] || 0;
      const span = b.querySelector('span');
      if(span) span.textContent = left > 0
        ? TF('casino.sdk.cdShort','{min}m', {min: Math.ceil(left/60000)})
        : (DIFFICULTIES[i] ? DIFFICULTIES[i].label : '');
      b.classList.toggle('active', i === diffIdx);
    });
  }

  function status(txt){
    const el = document.getElementById('sdk-status');
    if(el) el.textContent = txt;
  }

  function newPuzzle(){
    if(busy) return;
    busy = true;
    const d = DIFFICULTIES[diffIdx];
    status(T('casino.sdk.building','Building a puzzle...'));
    call('sudoku_start', { diffId: diffIdx }, 'sudoku_start_ack').then(function(r){
      busy = false;
      if(!r || !r.ok){
        if(r && r.error === 'cooldown'){
          cooldowns[diffIdx] = r.cooldownLeftMs || 0;
          paintDiffRow();
          status(TF('casino.sdk.cooldown','\u23f3 {name} on cooldown, {min} min remaining.',
            {name:sdkDiffName(d.name), min:Math.ceil((r.cooldownLeftMs||0)/60000)}));
        } else {
          status((r && r.error) ? String(r.error) : T('casino.sdk.failed','Could not start a puzzle.'));
        }
        return;
      }
      puzzle = r.puzzle.slice();
      userGrid = puzzle.slice();       // givens are in place; empties are 0
      sdkRoundId = r.roundId;
      hintUses = 0; hintMax = r.hintMax || hintMax;
      curReward = r.reward;
      selected = -1; playing = true;
      cooldowns[diffIdx] = r.cooldownMs || 0;
      paintDiffRow();
      render();
      status(TF('casino.sdk.fillGrid','{name}, fill the grid, then press Submit.',{name:sdkDiffName(d.name)}));
      const hb = document.getElementById('sdk-hint');
      if(hb) hb.textContent = T('casino.sdk.hint20','Hint (\u221220% reward)');
    });
  }

  // ── Submit ─────────────────────────────────────────────────
  /* The server grades. It answers correct or not correct and never says WHICH
     cells are wrong, so repeated submissions are worth one bit each against a
     board with exactly one completion, which is worth nothing. */
  function submit(){
    if(!playing || busy || countEmpty() > 0) return;
    busy = true;
    call('sudoku_finish', { roundId: sdkRoundId, grid: userGrid }, 'sudoku_finish_ack').then(function(r){
      busy = false;
      if(!r || !r.ok){ status(T('casino.sdk.failed','Could not submit.')); return; }
      if(!r.correct){
        status(T('casino.sdk.notQuite','\u2717 Not quite right. Keep checking your work!'));
        return;
      }
      playing = false; selected = -1; sdkRoundId = null;
      if(typeof r.cash === 'number') setBalance(r.cash);
      render();
      const note = r.hints > 0
        ? TF('casino.sdk.hintNote',' ({n} hint{s} used)',{n:r.hints, s:(r.hints>1?'s':'')}) : '';
      status(TF('casino.sdk.correct','\u2713 Correct! You earned \u0192{amt}{note}.',
        {amt:Number(r.reward||0).toLocaleString(), note:note}));
      refreshLobby();
    });
  }

  // ── Hint ───────────────────────────────────────────────────
  /* Capped at four, which is where the penalty already bottomed out. Unbounded
     hints against a floored penalty was a free auto solve for 20% of the prize. */
  function hint(){
    if(!playing || busy) return;
    busy = true;
    call('sudoku_hint', { roundId: sdkRoundId }, 'sudoku_hint_ack').then(function(r){
      busy = false;
      if(!r || !r.ok){
        if(r && r.error === 'hint_cap')
          status(TF('casino.sdk.hintCap','No hints left ({n} of {n} used).',{n:hintMax}));
        else if(r && r.error === 'nothing_to_reveal')
          status(T('casino.sdk.noErrors','No errors found!'));
        else status(T('casino.sdk.failed','Could not take a hint.'));
        return;
      }
      userGrid[r.index] = r.value;
      hintUses = r.hints; curReward = r.reward;
      render();
      const pct = Math.round((1 - (curReward / (DIFFICULTIES[diffIdx].reward || 1))) * 100);
      const hb = document.getElementById('sdk-hint');
      if(hb) hb.textContent = TF('casino.sdk.hintPct','Hint (\u2212{pct}% reward)',{pct:pct});
      status(TF('casino.sdk.hintUsed','Hint used. Reward reduced to \u0192{amt}.',
        {amt:Number(curReward).toLocaleString()}));
    });
  }

  // ── Input ──────────────────────────────────────────────────
  document.getElementById('sdk-numpad').addEventListener('click',e=>{
    if(!playing)return;
    const btn=e.target.closest('[data-n]');if(!btn)return;
    if(selected<0||puzzle[selected]!==0)return;
    const n=parseInt(btn.dataset.n);
    userGrid[selected]=(n===0)?0:n;
    render();
  });

  document.getElementById('sdk-new').addEventListener('click',newPuzzle);
  document.getElementById('sdk-submit').addEventListener('click',submit);
  document.getElementById('sdk-hint').addEventListener('click',hint);

  document.getElementById('sdk-diff-row').addEventListener('click',e=>{
    const btn=e.target.closest('[data-idx]');if(!btn)return;
    diffIdx=parseInt(btn.dataset.idx);
    paintDiffRow();
  });

  /* Ask the server what is on cooldown as soon as the pane opens, so the tier
     buttons show a real timer rather than a price the player cannot collect
     yet. Refreshed on solve, and on a minute tick while the pane is visible. */
  refreshLobby();
  if(!window._sdkLobbyIv){
    window._sdkLobbyIv = setInterval(function(){
      if(pane && pane.offsetParent !== null) refreshLobby();
    }, 60000);
  }

  document.addEventListener('keydown',e=>{
    if(!playing||selected<0||puzzle[selected]!==0)return;
    if(e.key>='1'&&e.key<='9'){userGrid[selected]=parseInt(e.key);render();}
    if(e.key==='Backspace'||e.key==='Delete'||e.key==='0'){userGrid[selected]=0;render();}
    // Arrow key navigation
    const moves={ArrowUp:-9,ArrowDown:9,ArrowLeft:-1,ArrowRight:1};
    if(moves[e.key]!==undefined){
      e.preventDefault();
      let next=selected+moves[e.key];
      next=Math.max(0,Math.min(80,next));
      if(puzzle[next]===0)selected=next;
      render();
    }
  });

  } // end init()
  window.__initSudoku = init;
})();
