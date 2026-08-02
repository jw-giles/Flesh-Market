/**
 * casino-mathgame.js - Guild Numeracy Exams (client).
 *
 * The client no longer generates questions, holds answers, keeps score for
 * money, or names a payout. It renders what the server sends and posts answers
 * back. Everything that decides cash lives in server/mathtest.js and the
 * math_start / math_answer handlers.
 *
 * The old version did all of it locally and then told the server what it had
 * won, which is why it both overpaid anyone who asked and silently paid nothing
 * to anyone whose previous round was still open. Both failures are gone with the
 * code that caused them.
 */
(function(){
  const pane = document.getElementById('casino-mathgame');
  if (!pane) return;
  const T  = (k,fb)=>window.t?window.t(k,fb):fb;
  const TF = (k,fb,v)=>window.tf?window.tf(k,fb,v):fb;
  const money = n => '\u0192' + Math.round(Number(n)||0).toLocaleString();

  // ─── Net: promise wrapper over the exam messages ───────────────────────────
  // Same shape as casino-net.js and for the same reason: the socket is a stream
  // of unrelated frames, so a call has to say which ack is its own.
  const PENDING = new Map();
  let seq = 0;
  const ACKS = new Set(['math_exams_ack','math_start_ack','math_answer_ack','math_resume_ack','math_abandon_ack']);

  function sock(){
    return window.ws && window.ws.readyState === 1 ? window.ws
         : (window._ws && window._ws.readyState === 1 ? window._ws : null);
  }
  document.addEventListener('fm_ws_msg', (e)=>{
    const m = e && e.detail;
    if (!m || !m.type || !ACKS.has(m.type)) return;
    for (const [key, entry] of PENDING) {
      let hit = false;
      try { hit = entry.match(m); } catch(_) { hit = false; }
      if (hit) { clearTimeout(entry.timer); PENDING.delete(key); entry.resolve(m.data || {}); break; }
    }
  });
  function call(type, payload, ackType, matchRound){
    const w = sock();
    if (!w) return Promise.resolve({ ok:false, error:'offline' });
    return new Promise((resolve)=>{
      const key = 'm' + (++seq);
      const timer = setTimeout(()=>{ if(PENDING.has(key)){ PENDING.delete(key); resolve({ok:false,error:'timeout'}); } }, 12000);
      PENDING.set(key, { timer, resolve,
        match:(m)=> m.type===ackType && (!matchRound || !m.data || !m.data.roundId || m.data.roundId===matchRound) });
      try { w.send(JSON.stringify(Object.assign({type}, payload))); }
      catch(_){ clearTimeout(timer); PENDING.delete(key); resolve({ok:false,error:'offline'}); }
    });
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let lobby = null;      // last math_exams_ack payload
  let round = null;      // { roundId, examId, examName, total, entry, streak* }
  let question = null;   // current public question
  let tick = null, deadline = 0, lobbyTick = null;
  let busy = false;

  function fmtMs(ms){
    const s = Math.max(0, Math.ceil(ms/1000));
    return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
  }
  function topicName(id){
    const found = (lobby && (lobby.topics||[]).find(t=>t.id===id)) || {};
    return T('casino.math.topic.'+id, found.name || id);
  }
  // Word problems ship a template key plus its vars so Jade mode renders them
  // translated. Symbol-only questions ship text alone and pass straight through.
  function questionText(q){
    if (q && q.tk && q.tv) return TF(q.tk, q.text, q.tv);
    return q ? q.text : '';
  }
  function gradeColor(g){
    return g==='S' ? '#ffd166' : g==='A' ? '#72e09c' : g==='B' ? '#4ecdc4'
         : g==='C' ? '#9ad1ff' : g==='D' ? '#e9a23b' : '#ff6b6b';
  }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  // ─── Views ─────────────────────────────────────────────────────────────────
  function shell(inner){
    pane.innerHTML = '<div id="mq-wrap">' + inner + '</div>';
    if(window.applyI18n) window.applyI18n(pane);
  }

  function renderLoading(){
    shell('<div class="mq-note" data-i18n="casino.math.loading">Loading exam board...</div>');
  }

  function renderLobby(){
    if(!lobby){ renderLoading(); return; }
    const cards = (lobby.exams||[]).map(ex=>{
      const cd = ex.cooldownLeftMs > 0;
      const canPay = ex.entry <= (lobby.cash||0);
      const blocked = ex.locked || cd || !canPay;
      let note = '';
      if (ex.locked)      note = `<div class="mq-lock">${esc(T('casino.math.lockBroker','Locked. Pass the Broker Certification first.'))}</div>`;
      else if (cd)        note = `<div class="mq-lock">${esc(TF('casino.math.cooldownLeft','Cooldown {t}',{t:fmtMs(ex.cooldownLeftMs)}))}</div>`;
      else if (!canPay)   note = `<div class="mq-lock">${esc(TF('casino.math.needFunds','Entry is {amt}',{amt:money(ex.entry)}))}</div>`;
      const topicLine = (ex.topics && ex.topics.length)
        ? ex.topics.map(topicName).map(esc).join(' \u00b7 ')
        : esc(T('casino.math.topicAny','Your choice of topic'));
      const picker = ex.pickTopic ? `
        <select class="mq-topic" data-exam="${esc(ex.id)}">
          <option value="mixed">${esc(T('casino.math.topicMixed','Mixed'))}</option>
          ${(lobby.topics||[]).map(t=>`<option value="${esc(t.id)}">${esc(topicName(t.id))}</option>`).join('')}
        </select>` : '';
      return `
      <div class="mq-card${blocked?' mq-dim':''}">
        <div class="mq-card-head">
          <span class="mq-card-name">${esc(ex.name)}</span>
          <span class="mq-card-entry">${esc(ex.entry>0?TF('casino.math.entryFee','Entry {amt}',{amt:money(ex.entry)}):T('casino.math.free','Free'))}</span>
        </div>
        <div class="mq-card-desc">${esc(ex.desc)}</div>
        <div class="mq-card-meta">
          <span>${esc(TF('casino.math.qCount','{n} questions',{n:ex.count}))}</span>
          <span>${esc(TF('casino.math.secEach','{n}s each',{n:ex.timeSec}))}</span>
          <span>${esc(TF('casino.math.upTo','Up to {amt}',{amt:money(ex.maxGross)}))}</span>
        </div>
        <div class="mq-card-topics">${topicLine}</div>
        ${(ex.bestNet!==null&&ex.bestNet!==undefined)?`<div class="mq-card-best">${esc(TF('casino.math.bestNet','Best result {amt}',{amt:(ex.bestNet>=0?'+':'')+money(ex.bestNet)}))}</div>`:''}
        ${note}
        <div class="mq-card-actions">
          ${picker}
          <button class="btn mq-sit" data-exam="${esc(ex.id)}"${blocked?' disabled':''}>
            ${esc(cd ? fmtMs(ex.cooldownLeftMs) : T('casino.math.sit','Sit the paper'))}
          </button>
        </div>
      </div>`;
    }).join('');

    const gradeRow = (lobby.grades||[]).map(g=>
      `<span class="mq-grade-chip" style="color:${gradeColor(g.label)}">${esc(g.label)} ${Math.round(g.min*100)}%+ &times;${Number(g.mult).toFixed(2)}</span>`
    ).join('');

    const openExam = lobby.open ? ((lobby.exams||[]).find(e=>e.id===lobby.open.examId)||{}) : null;
    const resume = lobby.open ? `
      <div class="mq-resume">
        <div>${esc(TF('casino.math.resumeFound','You left {exam} unfinished at question {n} of {t}.',{exam:openExam.name||lobby.open.examId,n:lobby.open.answered+1,t:lobby.open.total}))}</div>
        <div class="mq-resume-note" data-i18n="casino.math.resumeCost">Resuming scores the interrupted question as wrong. Walking out forfeits the entry fee.</div>
        <div class="mq-card-actions">
          <button class="btn" id="mq-resume" data-i18n="casino.math.resume">Resume paper</button>
          <button class="btn mq-ghost" id="mq-walk" data-i18n="casino.math.walkOut">Walk out</button>
        </div>
      </div>` : '';

    shell(`
      <div class="mq-head">
        <span class="mq-title" data-i18n="casino.math.title">GUILD NUMERACY EXAMS</span>
        <span class="mq-sub" data-i18n="casino.math.subtitle">Sit a paper. The grade decides the pay.</span>
      </div>
      ${resume}
      <div class="mq-grades">
        <span class="mq-grades-label" data-i18n="casino.math.gradeCurve">Grade curve</span>
        ${gradeRow}
      </div>
      <div class="mq-note" data-i18n="casino.math.curveNote">Earnings accrue per correct answer, then multiply by your grade. Below 60 percent the paper pays nothing and the entry fee is lost.</div>
      <div class="mq-grid">${cards}</div>
      <div id="mq-status" class="mq-status"></div>
    `);

    pane.querySelectorAll('.mq-sit').forEach(b=>b.addEventListener('click',()=>{
      const id = b.dataset.exam;
      const sel = pane.querySelector('.mq-topic[data-exam="'+id+'"]');
      startExam(id, sel ? sel.value : 'mixed');
    }));
    const rb = pane.querySelector('#mq-resume');
    if(rb) rb.addEventListener('click', ()=>resumeExam(lobby.open.roundId));
    const wb = pane.querySelector('#mq-walk');
    if(wb) wb.addEventListener('click', ()=>abandonExam(lobby.open.roundId));

    // One second repaint so cooldown buttons count down without refetching.
    if(lobbyTick){ clearInterval(lobbyTick); lobbyTick=null; }
    if((lobby.exams||[]).some(e=>e.cooldownLeftMs>0)){
      lobbyTick = setInterval(()=>{
        if(round){ clearInterval(lobbyTick); lobbyTick=null; return; }
        let any = false;
        for(const ex of lobby.exams){
          if(ex.cooldownLeftMs>0){ ex.cooldownLeftMs = Math.max(0, ex.cooldownLeftMs-1000); any = true; }
        }
        renderLobby();
        if(!any){ clearInterval(lobbyTick); lobbyTick=null; }
      }, 1000);
    }
  }

  function renderExam(){
    shell(`
      <div class="mq-head">
        <span class="mq-title">${esc(round.examName||'')}</span>
        <button class="btn mq-ghost mq-small" id="mq-quit" data-i18n="casino.math.walkOut">Walk out</button>
      </div>
      <div class="mq-scorerow">
        <span><b id="mq-qnum">1</b>/<span id="mq-qtot">${esc(round.total)}</span></span>
        <span>${esc(T('casino.math.scoreLabel','Score:'))} <b id="mq-score">0</b></span>
        <span>${esc(T('casino.math.accrued','At risk:'))} <b id="mq-accrued">\u01920</b></span>
        <span>${esc(T('casino.math.projected','Best case:'))} <b id="mq-proj">-</b></span>
      </div>
      <div id="mq-timer-bar"><div id="mq-timer-fill"></div></div>
      <div class="mq-badgerow">
        <span id="mq-topic" class="mq-badge">-</span>
        <span id="mq-tier" class="mq-badge">-</span>
        <span id="mq-reward" class="mq-badge mq-badge-pay">-</span>
      </div>
      <div id="mq-question">-</div>
      <div class="mq-answerrow">
        <input id="mq-input" type="text" inputmode="decimal" autocomplete="off" placeholder="?">
        <button class="btn" id="mq-submit" data-i18n="casino.math.answer">Answer</button>
      </div>
      <div id="mq-feedback"></div>
    `);
    pane.querySelector('#mq-submit').addEventListener('click', submitAnswer);
    pane.querySelector('#mq-quit').addEventListener('click', ()=>abandonExam(round.roundId));
    pane.querySelector('#mq-input').addEventListener('keydown', e=>{ if(e.key==='Enter') submitAnswer(); });
  }

  function setText(id,v){ const e=pane.querySelector(id); if(e) e.textContent=v; }

  function paintQuestion(q, state){
    question = q;
    setText('#mq-qnum', q.i+1);
    setText('#mq-topic', topicName(q.topic));
    setText('#mq-tier', TF('casino.math.tier','Tier {n}',{n:q.tier}));
    setText('#mq-reward', TF('casino.math.pays','Pays {amt}',{amt:money(q.reward)}));
    setText('#mq-question', questionText(q) + ' = ?');
    if(state){
      setText('#mq-score', state.score);
      setText('#mq-accrued', money(state.accrued));
      setText('#mq-proj', projected(state.score, q.i));
    }
    const inp = pane.querySelector('#mq-input');
    if(inp){ inp.value=''; inp.disabled=false; try{ inp.focus(); }catch(_){} }
    const sub = pane.querySelector('#mq-submit'); if(sub) sub.disabled=false;
    startTimer(q.timeSec);
  }

  // Assumes every remaining question is answered correctly, so this is a
  // ceiling rather than a forecast. The label says best case for that reason.
  function projected(score, answered){
    if(!round || !lobby) return '-';
    const best = (score + (round.total - answered)) / round.total;
    const g = (lobby.grades||[]).find(x=>best >= x.min - 1e-9) || {label:'F',mult:0};
    return g.label + ' \u00d7' + Number(g.mult).toFixed(2);
  }

  function startTimer(sec){
    if(tick) clearInterval(tick);
    deadline = Date.now() + sec*1000;
    const fill = pane.querySelector('#mq-timer-fill');
    if(fill) fill.style.width = '100%';
    tick = setInterval(()=>{
      const left = deadline - Date.now();
      if(fill) fill.style.width = Math.max(0, Math.min(100, left/(sec*10))) + '%';
      if(left <= 0){ clearInterval(tick); tick=null; sendAnswer(null); }
    }, 100);
  }
  function stopTimer(){ if(tick){ clearInterval(tick); tick=null; } }

  // ─── Actions ───────────────────────────────────────────────────────────────
  async function loadLobby(){
    renderLoading();
    const r = await call('math_exams', {}, 'math_exams_ack');
    if(!r || !r.ok){
      shell('<div class="mq-note">'+esc(T('casino.math.offline','Exam board unavailable. Check your connection and try again.'))+'</div>');
      return;
    }
    lobby = r; round = null; question = null;
    renderLobby();
  }

  async function startExam(examId, topic){
    if(busy) return; busy = true;
    const r = await call('math_start', { examId, topic }, 'math_start_ack');
    busy = false;
    if(!r || !r.ok){
      let m = T('casino.math.startFailed','Could not start that paper.');
      if(r && r.error==='cooldown')    m = TF('casino.math.errCooldown','Still on cooldown for {t}.',{t:fmtMs(r.cooldownLeftMs||0)});
      else if(r && r.error==='funds')  m = TF('casino.math.errFunds','You need {amt} to sit this paper.',{amt:money(r.need||0)});
      else if(r && r.error==='locked') m = T('casino.math.lockBroker','Locked. Pass the Broker Certification first.');
      else if(r && r.error==='offline')m = T('casino.math.offline','Exam board unavailable. Check your connection and try again.');
      await loadLobby();
      setText('#mq-status', m);
      return;
    }
    round = { roundId:r.roundId, examId:r.examId, examName:r.examName, total:r.total,
              entry:r.entry, streakEvery:r.streakEvery, streakBonus:r.streakBonus };
    renderExam();
    paintQuestion(r.question, { score:0, accrued:0 });
  }

  function submitAnswer(){
    if(!round || !question) return;
    const raw = (pane.querySelector('#mq-input')||{}).value;
    const v = parseFloat(String(raw).replace(/,/g,'').trim());
    if(!Number.isFinite(v)) return;
    sendAnswer(v);
  }

  async function sendAnswer(value){
    if(!round || !question || busy) return;
    busy = true;
    stopTimer();
    const inp = pane.querySelector('#mq-input'); if(inp) inp.disabled = true;
    const sub = pane.querySelector('#mq-submit'); if(sub) sub.disabled = true;
    const r = await call('math_answer', { roundId:round.roundId, i:question.i, value }, 'math_answer_ack', round.roundId);
    busy = false;
    if(!r || !r.ok){
      const fb = pane.querySelector('#mq-feedback');
      if(fb){ fb.textContent = T('casino.math.lostRound','Lost contact with the paper. Returning to the board.'); fb.className='mq-bad'; }
      setTimeout(loadLobby, 1400);
      return;
    }
    const fb = pane.querySelector('#mq-feedback');
    if(fb){
      if(r.correct){
        fb.textContent = r.streakBonus
          ? TF('casino.math.correctStreak','Correct. {amt} plus a {bonus} streak bonus.',{amt:money(r.reward),bonus:money(r.streakBonus)})
          : TF('casino.math.correctPlus','Correct. {amt}.',{amt:money(r.reward)});
        fb.className = 'mq-good';
      } else if(r.late){
        fb.textContent = TF('casino.math.timeUpWas','Time up. The answer was {ans}.',{ans:r.answer});
        fb.className = 'mq-bad';
      } else {
        fb.textContent = TF('casino.math.wrongWas','Wrong. The answer was {ans}.',{ans:r.answer});
        fb.className = 'mq-bad';
      }
    }
    setText('#mq-score', r.score);
    setText('#mq-accrued', money(r.accrued));
    if(r.done && r.result){ setTimeout(()=>renderResult(r.result), 1100); return; }
    setTimeout(()=>{ if(round && r.next) paintQuestion(r.next, { score:r.score, accrued:r.accrued }); }, 1100);
  }

  async function resumeExam(roundId){
    if(busy) return; busy = true;
    const r = await call('math_resume', { roundId }, 'math_resume_ack', roundId);
    busy = false;
    if(!r || !r.ok){ loadLobby(); return; }
    const ex = (lobby && (lobby.exams||[]).find(e=>e.id===r.examId)) || {};
    round = { roundId, examId:r.examId, examName:ex.name||'', total:r.total,
              entry:ex.entry||0, streakEvery:ex.streakEvery||0, streakBonus:ex.streakBonus||0 };
    if(r.done && r.result){ renderResult(r.result); return; }
    renderExam();
    paintQuestion(r.next, { score:r.score, accrued:r.accrued });
    const fb = pane.querySelector('#mq-feedback');
    if(fb && r.forfeited!==null && r.forfeited!==undefined){
      fb.textContent = TF('casino.math.resumeLost','Question {n} was scored wrong. The answer was {ans}.',{n:r.forfeited+1,ans:r.lostAnswer});
      fb.className = 'mq-bad';
    }
  }

  async function abandonExam(roundId){
    if(busy) return; busy = true;
    stopTimer();
    const r = await call('math_abandon', { roundId }, 'math_abandon_ack', roundId);
    busy = false;
    round = null; question = null;
    if(r && r.ok && r.result) renderResult(r.result);
    else loadLobby();
  }

  function renderResult(res){
    stopTimer();
    round = null; question = null;
    const col = gradeColor(res.grade);
    const netStr = (res.net>=0?'+':'') + money(res.net);
    shell(`
      <div class="mq-head">
        <span class="mq-title">${esc(res.exam||'')}</span>
      </div>
      <div class="mq-result">
        <div class="mq-gradebig" style="color:${col};border-color:${col}">${esc(res.grade)}</div>
        <div class="mq-resultlines">
          <div>${esc(TF('casino.math.resScore','Score {s} of {t} ({p} percent)',{s:res.score,t:res.total,p:Math.round(res.pct*100)}))}</div>
          <div>${esc(TF('casino.math.resAccrued','Accrued {amt}',{amt:money(res.accrued)}))}</div>
          <div>${esc(TF('casino.math.resMult','Grade multiplier {m}',{m:'\u00d7'+Number(res.mult).toFixed(2)}))}</div>
          ${res.bestStreak>1?`<div>${esc(TF('casino.math.resStreak','Best run {n} in a row',{n:res.bestStreak}))}</div>`:''}
          <div class="mq-sep"></div>
          <div>${esc(TF('casino.math.resEntry','Entry fee {amt}',{amt:money(res.entry)}))}</div>
          <div>${esc(TF('casino.math.resPaid','Paid out {amt}',{amt:money(res.credited)}))}</div>
          <div class="mq-net" style="color:${res.net>=0?'#72e09c':'#ff6b6b'}">${esc(TF('casino.math.resNet','Net {amt}',{amt:netStr}))}</div>
        </div>
      </div>
      ${res.abandoned?`<div class="mq-note" data-i18n="casino.math.resWalked">You walked out. An unfinished paper pays nothing and the entry fee stays with the guild.</div>`:''}
      <div class="mq-card-actions">
        <button class="btn" id="mq-back" data-i18n="casino.math.backToBoard">Back to the exam board</button>
      </div>
    `);
    pane.querySelector('#mq-back').addEventListener('click', loadLobby);
  }

  function init(){
    if (pane.dataset.inited) return;
    pane.dataset.inited = '1';
    loadLobby();
  }
  window.__initMathGame = init;

  // Refresh the board when the player comes back to the tab, so cooldowns and
  // cash are current rather than whatever they were when they last left. Never
  // fires mid-paper: reloading the lobby there would throw away the sitting.
  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && pane.dataset.inited && !round && pane.style.display !== 'none') loadLobby();
  });
})();
