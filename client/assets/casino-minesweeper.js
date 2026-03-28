
(function(){
  const pane = document.getElementById('casino-minesweeper');
  if (!pane) return;

  const MODES = [
    { name:'Beginner',     cols:9,  rows:9,  mines:10, reward:20   },
    { name:'Intermediate', cols:16, rows:16, mines:40, reward:80   },
    { name:'Expert',       cols:30, rows:16, mines:99, reward:400  },
  ];

  function init() {
    if (pane.dataset.inited) return; pane.dataset.inited='1';
  pane.innerHTML = `
  <style>
    #ms-wrap{font-family:monospace;padding:12px}
    #ms-board{display:inline-grid;gap:2px;background:#111008;border:2px solid #a08820;border-radius:4px;padding:3px;margin:10px 0;user-select:none}
    .ms-cell{width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:bold;cursor:pointer;border:2px solid #7a6a28;background:#4a3e14;border-radius:2px;transition:background .08s;box-shadow:inset 0 2px 0 #6a5a20,inset 0 -2px 0 #1a1400}
    .ms-cell:hover:not(.revealed):not(.flagged){background:#5c4e1c;border-color:#c0a030}
    .ms-cell.revealed{background:#111008;cursor:default;border-color:#2a2808;box-shadow:inset 0 1px 2px #000}
    .ms-cell.flagged{background:#3a1000;color:#ff6b6b;border-color:#8a2010}
    .ms-cell.mine-hit{background:#cc1800;color:#fff;border-color:#ff4422}
    .ms-cell[data-n="1"]{color:#4ecdc4} .ms-cell[data-n="2"]{color:#5aff8a}
    .ms-cell[data-n="3"]{color:#ff6b6b} .ms-cell[data-n="4"]{color:#c07aff}
    .ms-cell[data-n="5"]{color:#ffaa00} .ms-cell[data-n="6"]{color:#00e5ff}
    .ms-cell[data-n="7"]{color:#ff85c0} .ms-cell[data-n="8"]{color:#cccccc}
    #ms-hud{display:flex;gap:20px;align-items:center;margin-bottom:6px;font-size:.9rem;color:#aaa}
    .ms-mode-btn{padding:6px 12px;margin:3px;background:#1a1500;border:1px solid #4a3a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.85rem}
    .ms-mode-btn.active{background:#2a2200;border-color:#e6c27a}
  </style>
  <div id="ms-wrap">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <span style="color:#e6c27a;letter-spacing:.1em;font-size:.9rem">MINESWEEPER</span>
      
    </div>
    <div id="ms-mode-row" style="margin-bottom:8px">
      ${MODES.map((m,i)=>`<button class="ms-mode-btn${i===0?' active':''}" data-idx="${i}">${m.name}<br><span style="color:#aaa;font-size:.7rem">${m.cols}×${m.rows} · ${m.mines}💣 · Ƒ${m.reward.toLocaleString()}</span></button>`).join('')}
    </div>
    <div id="ms-hud">
      <span>💣 <b id="ms-mines-left">10</b></span>
      <span>⏱ <b id="ms-timer">0</b>s</span>
      <span id="ms-msg" style="color:#e6c27a"></span>
    </div>
    <div style="margin-bottom:6px;font-size:.8rem;color:#888">Left click: reveal · Right click: flag</div>
    <div id="ms-board"></div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn" id="ms-new">New Game</button>
    </div>
    <div id="ms-status" class="muted" style="margin-top:6px;min-height:18px"></div>
  </div>`;

  let modeIdx=0, grid=[], revealed=[], flagged=[], firstClick=true, gameOver=false;
  let timerInterval=null, elapsed=0;

  function getBalance(){ return (typeof ME==='object'&&ME&&typeof ME.cash==='number')?ME.cash:0; }
  function setBalance(v){
    if(typeof ME==='object'&&ME){ME.cash=v;}
    const c=document.getElementById('cash');if(c)c.textContent='Ƒ'+Math.round(v).toLocaleString();
    try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(v)||0}));}catch(_){}
  }

  function initGrid(){
    const m=MODES[modeIdx];
    grid=Array(m.rows*m.cols).fill(0);
    revealed=Array(m.rows*m.cols).fill(false);
    flagged=Array(m.rows*m.cols).fill(false);
    firstClick=true;gameOver=false;elapsed=0;
    if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
    document.getElementById('ms-mines-left').textContent=m.mines;
    document.getElementById('ms-timer').textContent='0';
    document.getElementById('ms-msg').textContent='';
    document.getElementById('ms-status').textContent='';
    renderBoard();
  }

  function placeMines(safeIdx){
    const m=MODES[modeIdx];
    const cells=[...Array(m.rows*m.cols).keys()].filter(i=>i!==safeIdx);
    for(let i=cells.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
    for(let i=0;i<m.mines;i++)grid[cells[i]]=-1;
    // Count adjacents
    for(let i=0;i<m.rows*m.cols;i++){
      if(grid[i]===-1)continue;
      let cnt=0;
      for(const n of neighbors(i,m)){if(grid[n]===-1)cnt++;}
      grid[i]=cnt;
    }
    timerInterval=setInterval(()=>{elapsed++;document.getElementById('ms-timer').textContent=elapsed;},1000);
  }

  function neighbors(idx,m){
    const r=Math.floor(idx/m.cols),c=idx%m.cols,res=[];
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(dr===0&&dc===0)continue;
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<m.rows&&nc>=0&&nc<m.cols)res.push(nr*m.cols+nc);
    }return res;
  }

  function reveal(idx){
    const m=MODES[modeIdx];
    if(revealed[idx]||flagged[idx])return;
    revealed[idx]=true;
    if(grid[idx]===0){for(const n of neighbors(idx,m))if(!revealed[n])reveal(n);}
  }

  function countRevealed(){return revealed.filter(Boolean).length;}

  function checkWin(){
    const m=MODES[modeIdx];
    return countRevealed()===m.rows*m.cols-m.mines;
  }

  function renderBoard(){
    const m=MODES[modeIdx];
    const board=document.getElementById('ms-board');
    board.style.gridTemplateColumns=`repeat(${m.cols},28px)`;
    board.innerHTML='';
    const flagCount=flagged.filter(Boolean).length;
    document.getElementById('ms-mines-left').textContent=m.mines-flagCount;
    for(let i=0;i<m.rows*m.cols;i++){
      const cell=document.createElement('div');
      cell.className='ms-cell';
      cell.dataset.idx=i;
      if(revealed[i]){
        cell.classList.add('revealed');
        if(grid[i]===-1){cell.textContent='💣';cell.classList.add('mine-hit');}
        else if(grid[i]>0){cell.textContent=grid[i];cell.dataset.n=grid[i];}
        else cell.textContent='';
      } else if(flagged[i]){
        cell.classList.add('flagged');cell.textContent='🚩';
      } else {
        cell.textContent='';
      }
      board.appendChild(cell);
    }
  }

  // Event delegation — single listener on board container, avoids listener leak on re-render
  function setupBoardListeners(){
    const board=document.getElementById('ms-board');
    board.addEventListener('click',(e)=>{
      if(gameOver)return;
      const cell=e.target.closest('.ms-cell');
      if(!cell)return;
      const i=parseInt(cell.dataset.idx);
      if(isNaN(i)||revealed[i]||flagged[i])return;
      if(firstClick){firstClick=false;placeMines(i);}
      if(grid[i]===-1){
        gameOver=true;
        if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
        const m=MODES[modeIdx];
        for(let j=0;j<m.rows*m.cols;j++){if(grid[j]===-1)revealed[j]=true;}
        renderBoard();
        document.getElementById('ms-msg').textContent='💥 Boom!';
        document.getElementById('ms-status').textContent='Hit a mine. Better luck next time.';
        return;
      }
      reveal(i);
      renderBoard();
      if(checkWin()){
        gameOver=true;
        if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
        const reward=MODES[modeIdx].reward;
        setBalance(getBalance()+reward);
        document.getElementById('ms-msg').textContent='✓ Board cleared!';
        document.getElementById('ms-status').textContent=`You earned Ƒ${reward.toLocaleString()}! Time: ${elapsed}s`;
      }
    });
    board.addEventListener('contextmenu',(e)=>{
      e.preventDefault();
      if(gameOver)return;
      const cell=e.target.closest('.ms-cell');
      if(!cell)return;
      const i=parseInt(cell.dataset.idx);
      if(isNaN(i)||revealed[i])return;
      flagged[i]=!flagged[i];
      renderBoard();
    });
  }

  document.getElementById('ms-new').addEventListener('click',initGrid);
  document.getElementById('ms-mode-row').addEventListener('click',e=>{
    const btn=e.target.closest('[data-idx]');if(!btn)return;
    modeIdx=parseInt(btn.dataset.idx);
    document.querySelectorAll('.ms-mode-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.idx)===modeIdx));
    initGrid();
  });

  setupBoardListeners();
  initGrid();
  } // end init()
  window.__initMinesweeper = init;
})();
