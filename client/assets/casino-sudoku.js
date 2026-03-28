
(function(){
  const pane = document.getElementById('casino-sudoku');
  if (!pane) return;

  const DIFFICULTIES = [
    { name:'Easy',   clues:46, reward:50,   label:'Ƒ50'   },
    { name:'Medium', clues:35, reward:200,  label:'Ƒ200'  },
    { name:'Hard',   clues:26, reward:750,  label:'Ƒ750'  },
    { name:'Expert', clues:23, reward:2500, label:'Ƒ2,500'},
    { name:'Insane', clues:17, reward:4000, label:'Ƒ4,000'},
  ];

  function init() {
    if (pane.dataset.inited) return; pane.dataset.inited='1';

  pane.innerHTML = `
  <style>
    #sdk-wrap{font-family:monospace;padding:12px;max-width:520px}
    #sdk-board{display:grid;grid-template-columns:repeat(9,1fr);background:#1a1a0a;border:2px solid #6a5a20;border-radius:4px;width:369px;margin:10px 0;user-select:none}
    .sdk-cell{width:41px;height:41px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;cursor:pointer;color:#e6c27a;border:1px solid #2a2a10;background:#0d0d06;box-sizing:border-box;transition:background .08s;outline:none;position:relative}
    .sdk-cell.given{color:#ccc;cursor:default;font-weight:bold}
    .sdk-cell.selected{background:#2a2510!important}
    .sdk-cell.peer{background:#141408}
    .sdk-cell.user-val{color:#e6c27a}
    /* thick borders for 3x3 boxes */
    .sdk-cell:nth-child(3n+1):not(:nth-child(1)){border-left:2px solid #6a5a20}
    .sdk-cell:nth-child(n+19):nth-child(-n+27){border-bottom:2px solid #6a5a20}
    .sdk-cell:nth-child(n+46):nth-child(-n+54){border-bottom:2px solid #6a5a20}
    #sdk-numpad{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}
    #sdk-numpad button{width:34px;height:34px;font-size:.95rem;font-family:monospace;background:#1a1500;border:1px solid #4a3a10;color:#e6c27a;cursor:pointer;border-radius:4px}
    #sdk-numpad button:hover{background:#2a2200}
    #sdk-status{margin-top:6px;font-size:.85rem;color:#e6c27a;min-height:20px}
    .sdk-diff-btn{padding:5px 10px;margin:2px;background:#1a1500;border:1px solid #4a3a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.8rem;text-align:center}
    .sdk-diff-btn.active{background:#2a2200;border-color:#e6c27a}
    .sdk-diff-btn span{display:block;color:#888;font-size:.7rem}
    #sdk-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    #sdk-actions button{padding:6px 14px;font-family:monospace;font-size:.85rem;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:4px}
    #sdk-actions button:hover{background:#2a2200}
    #sdk-actions button:disabled{opacity:.35;cursor:not-allowed}
    #sdk-submit{border-color:#4ecdc4!important;color:#4ecdc4!important}
    #sdk-submit:hover:not(:disabled){background:#0a1a1a!important}
    #sdk-cells-left{font-size:.78rem;color:#888;margin-top:4px}
  </style>
  <div id="sdk-wrap">
    <div style="letter-spacing:.1em;font-size:.9rem;color:#e6c27a;margin-bottom:8px">SUDOKU</div>
    <div id="sdk-diff-row" style="margin-bottom:8px;display:flex;flex-wrap:wrap">
      ${DIFFICULTIES.map((d,i)=>`<button class="sdk-diff-btn${i===1?' active':''}" data-idx="${i}">${d.name}<span>${d.label}</span></button>`).join('')}
    </div>
    <div id="sdk-board"></div>
    <div id="sdk-numpad">
      ${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join('')}
      <button data-n="0" style="width:52px;font-size:.8rem">✕ Clear</button>
    </div>
    <div id="sdk-cells-left"></div>
    <div id="sdk-actions">
      <button id="sdk-new">New Puzzle</button>
      <button id="sdk-submit" disabled>Submit</button>
      <button id="sdk-hint">Hint (−20% reward)</button>
    </div>
    <div id="sdk-status">Choose difficulty and press New Puzzle.</div>
  </div>`;

  // ── State ─────────────────────────────────────────────────
  let puzzle=[], solution=[], userGrid=[], selected=-1;
  let diffIdx=1, hintUses=0, playing=false;

  function getBalance(){ return (typeof ME==='object'&&ME&&typeof ME.cash==='number')?ME.cash:0; }
  function setBalance(v){
    if(typeof ME==='object'&&ME){ME.cash=v;}
    const c=document.getElementById('cash');if(c)c.textContent='Ƒ'+Math.round(v).toLocaleString();
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(v)||0}));}catch(_){}
  }

  // ── Puzzle generator ───────────────────────────────────────
  function generateSudoku(clues){
    const b=Array(81).fill(0);
    function possible(pos,n){
      const r=Math.floor(pos/9),c=pos%9,br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
      for(let i=0;i<9;i++){
        if(b[r*9+i]===n||b[i*9+c]===n||b[(br+Math.floor(i/3))*9+(bc+i%3)]===n)return false;
      }return true;
    }
    function fill(pos){
      if(pos===81)return true;
      const nums=[1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-.5);
      for(const n of nums){if(possible(pos,n)){b[pos]=n;if(fill(pos+1))return true;b[pos]=0;}}
      return false;
    }
    fill(0);
    const sol=[...b];
    const positions=[...Array(81).keys()].sort(()=>Math.random()-.5);
    let removed=0,target=81-clues;
    for(const p of positions){if(removed>=target)break;b[p]=0;removed++;}
    return{puzzle:[...b],solution:sol};
  }

  // ── Render ─────────────────────────────────────────────────
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
    if(cellsLbl)cellsLbl.textContent=playing?(empty>0?`${empty} cells remaining`:'Board complete — press Submit!'):'';
  }

  // ── New puzzle ─────────────────────────────────────────────
  const SUDOKU_COOLDOWN_MS = 30 * 60 * 1000; // 30 min anti-cheat
  function newPuzzle(){
    const d=DIFFICULTIES[diffIdx];
    const key='sudoku_cooldown_'+diffIdx;
    const last=parseInt(localStorage.getItem(key)||'0');
    const elapsed=Date.now()-last;
    if(elapsed<SUDOKU_COOLDOWN_MS){
      const remMin=Math.ceil((SUDOKU_COOLDOWN_MS-elapsed)/60000);
      document.getElementById('sdk-status').textContent=`⏳ ${d.name} on cooldown — ${remMin} min remaining.`;
      return;
    }
    const gen=generateSudoku(d.clues);
    puzzle=gen.puzzle;solution=gen.solution;
    userGrid=Array(81).fill(0);
    selected=-1;hintUses=0;playing=true;
    render();
    document.getElementById('sdk-status').textContent=`${d.name} — fill the grid, then press Submit.`;
    document.getElementById('sdk-hint').textContent='Hint (−20% reward)';
  }

  // ── Submit ─────────────────────────────────────────────────
  function submit(){
    if(!playing||countEmpty()>0)return;
    // Check correctness without revealing right/wrong per cell
    let correct=true;
    for(let i=0;i<81;i++){
      if(puzzle[i]===0&&userGrid[i]!==solution[i]){correct=false;break;}
    }
    if(correct){
      playing=false;selected=-1;
      const d=DIFFICULTIES[diffIdx];
      const penalty=hintUses*0.2;
      const reward=Math.floor(d.reward*(1-Math.min(0.8,penalty)));
      setBalance(getBalance()+reward);
      // Start 30-min cooldown on solve
      localStorage.setItem('sudoku_cooldown_'+diffIdx, Date.now());
      render();
      const hintNote=hintUses>0?` (${hintUses} hint${hintUses>1?'s':''} used)`:'';
      document.getElementById('sdk-status').textContent=`✓ Correct! You earned Ƒ${reward.toLocaleString()}${hintNote}.`;
    } else {
      // Wrong — flash status but don't reveal which cells
      document.getElementById('sdk-status').textContent='✗ Not quite right. Keep checking your work!';
    }
  }

  // ── Hint ───────────────────────────────────────────────────
  function hint(){
    if(!playing)return;
    const empties=[];
    for(let i=0;i<81;i++)if(puzzle[i]===0&&userGrid[i]!==solution[i])empties.push(i);
    if(!empties.length){document.getElementById('sdk-status').textContent='No errors found!';return;}
    const pick=empties[Math.floor(Math.random()*empties.length)];
    userGrid[pick]=solution[pick];
    hintUses++;
    const penalty=Math.min(0.8,hintUses*0.2);
    render();
    document.getElementById('sdk-hint').textContent=`Hint (−${Math.round(penalty*100)}% reward)`;
    document.getElementById('sdk-status').textContent=`Hint used. Reward reduced to ${Math.round((1-penalty)*100)}%.`;
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
    document.querySelectorAll('.sdk-diff-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.idx)===diffIdx));
  });

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
