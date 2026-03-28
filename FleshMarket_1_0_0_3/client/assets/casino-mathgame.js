
(function(){
  const pane = document.getElementById('casino-mathgame');
  if (!pane) return;

  // Each question is randomly drawn from across ALL levels — reward reflects difficulty
  const LEVELS = [
    { name:'Basic',    ops:['+','-'],               range:20,  time:18, perQ:2    },
    { name:'Standard', ops:['+','-','×'],            range:50,  time:22, perQ:6    },
    { name:'Advanced', ops:['+','-','×','÷'],        range:100, time:26, perQ:15   },
    { name:'Expert',   ops:['+','-','×','÷','²'],    range:200, time:32, perQ:35   },
    { name:'Genius',   ops:['+','-','×','÷','²','√'],range:500, time:42, perQ:80   },
  ];
  const TOTAL_Q = 10;
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  const COOLDOWN_KEY = 'mathgame_cooldown';

  function init() {
    if (pane.dataset.inited) return; pane.dataset.inited='1';
    pane.innerHTML = `
    <style>
      #mq-wrap{font-family:monospace;padding:12px;max-width:500px}
      #mq-question{font-size:2.2rem;color:#e6c27a;margin:18px 0;min-height:56px;text-align:center}
      #mq-diff-badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:.75rem;margin-bottom:4px;background:#1a1500;border:1px solid #4a3a10;color:#aaa;letter-spacing:.05em}
      #mq-input{font-size:1.5rem;width:160px;text-align:center;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;padding:6px;font-family:monospace;border-radius:4px}
      #mq-timer-bar{height:6px;background:#e6c27a;border-radius:3px;transition:width .1s linear;margin:8px 0}
      #mq-score-row{display:flex;gap:24px;margin:8px 0;font-size:.9rem;color:#aaa}
      #mq-feedback{font-size:.9rem;min-height:20px;margin:4px 0}
      #mq-cooldown-bar{height:4px;background:#333;border-radius:2px;margin:6px 0;overflow:hidden}
      #mq-cooldown-fill{height:4px;background:#4a3a10;border-radius:2px;transition:width 1s linear}
      #mq-payout-preview{font-size:.78rem;color:#888;margin:4px 0;min-height:16px}
    </style>
    <div id="mq-wrap">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">
        <span style="color:#e6c27a;letter-spacing:.1em;font-size:.9rem">MATH TEST</span>
        <span style="color:#888;font-size:.78rem">— 10 questions across all difficulties</span>
      </div>
      <div id="mq-cooldown-bar"><div id="mq-cooldown-fill" style="width:0%"></div></div>
      <div id="mq-score-row">
        <span>Q: <b id="mq-qnum">—</b>/${TOTAL_Q}</span>
        <span>Score: <b id="mq-score">0</b></span>
        <span>Earned: <b id="mq-earned">Ƒ0</b></span>
      </div>
      <div id="mq-timer-bar" style="width:100%"></div>
      <div id="mq-diff-badge">—</div>
      <div id="mq-question">Press Start Test to begin</div>
      <div id="mq-payout-preview"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <input id="mq-input" type="number" placeholder="?" autocomplete="off" disabled>
        <button class="btn" id="mq-submit" disabled>Answer</button>
      </div>
      <div id="mq-feedback" style="color:#4ecdc4"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn" id="mq-start">▶ Start Test</button>
      </div>
      <div id="mq-status" class="muted" style="margin-top:8px;min-height:20px"></div>
    </div>`;

    let qNum=0, score=0, totalEarned=0, playing=false;
    let current=null, currentLvl=null, timerInterval=null, timeLeft=0;
    let cooldownInterval=null;

    function getBalance(){ return (typeof ME==='object'&&ME&&typeof ME.cash==='number')?ME.cash:0; }
    function setBalance(v){
      if(typeof ME==='object'&&ME){ME.cash=v;}
      const c=document.getElementById('cash');if(c)c.textContent='Ƒ'+Math.round(v).toLocaleString();
      try{if(window.ws&&window.ws.readyState===1)window.ws.send(JSON.stringify({type:'casino',sync:Number(v)||0}));}catch(_){}
    }

    function randInt(max){ return Math.floor(Math.random()*max)+1; }

    function genQuestion(lvl){
      const ops=[...lvl.ops];
      const op=ops[Math.floor(Math.random()*ops.length)];
      let a,b,answer,text;
      const r=lvl.range;
      if(op==='²'){ a=randInt(Math.floor(Math.sqrt(r))); answer=a*a; text=`${a}²`; }
      else if(op==='√'){ a=randInt(Math.floor(Math.sqrt(r))); answer=a; text=`√${a*a}`; }
      else if(op==='÷'){ b=randInt(12); a=b*randInt(Math.floor(r/12)||1); answer=a/b; text=`${a} ÷ ${b}`; }
      else if(op==='×'){ a=randInt(Math.floor(Math.sqrt(r)));b=randInt(Math.floor(Math.sqrt(r))); answer=a*b; text=`${a} × ${b}`; }
      else if(op==='+'){ a=randInt(r);b=randInt(r);answer=a+b;text=`${a} + ${b}`; }
      else { a=randInt(r);b=randInt(a)||1;answer=a-b;text=`${a} − ${b}`; }
      return{text,answer};
    }

    function updateCooldownBar(){
      const last=parseInt(localStorage.getItem(COOLDOWN_KEY)||'0');
      const elapsed=Date.now()-last;
      const pct=Math.min(100,elapsed/COOLDOWN_MS*100);
      const fill=document.getElementById('mq-cooldown-fill');
      if(fill) fill.style.width=pct+'%';
      const startBtn=document.getElementById('mq-start');
      if(pct>=100){
        if(startBtn&&!playing) startBtn.disabled=false;
      } else {
        const remSec=Math.ceil((COOLDOWN_MS-elapsed)/1000);
        const remMin=Math.floor(remSec/60), remS=remSec%60;
        if(startBtn&&!playing){
          startBtn.disabled=true;
          startBtn.textContent=`⏳ ${remMin}:${String(remS).padStart(2,'0')} cooldown`;
        }
      }
    }

    function startCooldownTick(){
      if(cooldownInterval) clearInterval(cooldownInterval);
      cooldownInterval=setInterval(()=>{ updateCooldownBar(); },1000);
      updateCooldownBar();
    }

    function startTimer(lvl){
      timeLeft=lvl.time;
      const bar=document.getElementById('mq-timer-bar');
      if(timerInterval)clearInterval(timerInterval);
      timerInterval=setInterval(()=>{
        timeLeft-=0.1;
        if(bar)bar.style.width=Math.max(0,timeLeft/lvl.time*100)+'%';
        if(timeLeft<=0){clearInterval(timerInterval);timerInterval=null;handleAnswer(null,'timeout');}
      },100);
    }

    function nextQuestion(){
      if(qNum>=TOTAL_Q){endTest();return;}
      qNum++;
      // Pick random difficulty — weighted toward middle so test spans full range
      const weights=[1,2,3,2,1]; // Basic↔Genius, middle-heavy
      let total=weights.reduce((a,b)=>a+b,0), r=Math.random()*total, pick=0;
      for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0){pick=i;break;}}
      currentLvl=LEVELS[pick];
      current=genQuestion(currentLvl);
      document.getElementById('mq-qnum').textContent=qNum;
      document.getElementById('mq-question').textContent=`${current.text} = ?`;
      document.getElementById('mq-diff-badge').textContent=currentLvl.name+' · Ƒ'+currentLvl.perQ+' reward';
      document.getElementById('mq-payout-preview').textContent=`Correct answer pays Ƒ${currentLvl.perQ.toLocaleString()}`;
      document.getElementById('mq-input').value='';
      document.getElementById('mq-input').focus();
      document.getElementById('mq-feedback').textContent='';
      startTimer(currentLvl);
    }

    function handleAnswer(val,src){
      if(!playing)return;
      if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
      const correct=Math.abs((val||0)-current.answer)<0.001;
      if(src==='timeout'||!correct){
        const fb=document.getElementById('mq-feedback');
        fb.textContent=src==='timeout'?'⏱ Time up! Answer: '+current.answer:'✗ Wrong — answer was '+current.answer;
        fb.style.color='#ff6b6b';
      } else {
        score++;
        const earned=currentLvl.perQ;
        totalEarned+=earned;
        setBalance(getBalance()+earned);
        const fb=document.getElementById('mq-feedback');
        fb.textContent=`✓ Correct! +Ƒ${earned.toLocaleString()}`;
        fb.style.color='#4ecdc4';
      }
      document.getElementById('mq-score').textContent=score;
      document.getElementById('mq-earned').textContent='Ƒ'+totalEarned.toLocaleString();
      setTimeout(nextQuestion,900);
    }

    function endTest(){
      playing=false;
      document.getElementById('mq-input').disabled=true;
      document.getElementById('mq-submit').disabled=true;
      document.getElementById('mq-question').textContent='Test complete!';
      document.getElementById('mq-diff-badge').textContent='—';
      document.getElementById('mq-payout-preview').textContent='';
      document.getElementById('mq-status').textContent=`Score: ${score}/${TOTAL_Q} — Total earned: Ƒ${totalEarned.toLocaleString()}`;
      // Set cooldown
      localStorage.setItem(COOLDOWN_KEY, Date.now());
      const startBtn=document.getElementById('mq-start');
      startBtn.textContent='▶ Start Test';
      startCooldownTick();
    }

    document.getElementById('mq-start').addEventListener('click',()=>{
      const last=parseInt(localStorage.getItem(COOLDOWN_KEY)||'0');
      if(Date.now()-last < COOLDOWN_MS){ updateCooldownBar(); return; }
      qNum=0;score=0;totalEarned=0;playing=true;
      document.getElementById('mq-status').textContent='';
      document.getElementById('mq-score').textContent='0';
      document.getElementById('mq-earned').textContent='Ƒ0';
      document.getElementById('mq-input').disabled=false;
      document.getElementById('mq-submit').disabled=false;
      document.getElementById('mq-start').textContent='In Progress...';
      document.getElementById('mq-start').disabled=true;
      nextQuestion();
    });

    document.getElementById('mq-submit').addEventListener('click',()=>{
      if(!playing)return;
      const v=parseFloat(document.getElementById('mq-input').value);
      if(isNaN(v))return;
      handleAnswer(v,'submit');
    });

    document.getElementById('mq-input').addEventListener('keydown',e=>{
      if(e.key==='Enter'){
        const v=parseFloat(document.getElementById('mq-input').value);
        if(!isNaN(v))handleAnswer(v,'submit');
      }
    });

    startCooldownTick();
  } // end init()
  window.__initMathGame = init;
})();
