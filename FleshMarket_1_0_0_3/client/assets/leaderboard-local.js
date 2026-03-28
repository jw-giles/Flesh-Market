
// client-only leaderboard: persists in localStorage and updates on market changes
(function(){
  const KEY = 'fm:leaderboard';
  function fmt(n){ return '¤' + (Math.round(n*100)/100).toLocaleString(); }

  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(_){ return []; } }
  function write(rows){ try{ localStorage.setItem(KEY, JSON.stringify(rows)); }catch(_){ } }

  function computeNet(me){
    try{
      const cash = Number((me && me.cash) || 0);
      const positions = (me && me.positions) || {};
      let eq = 0;
      for (const sym in positions){
        const p = positions[sym]||{};
        const qty = Number(p.qty||0), last = Number(p.last||0);
        eq += qty * last;
      }
      return cash + eq;
    }catch(_){ return 0; }
  }

  function ensureInitial(){
    // ensure self exists; seed with NPCs once
    const meta = (function(){ try { return JSON.parse(localStorage.getItem('acct:meta')||'null'); } catch(_) { return null; } })();
    const name = (meta && meta.name) || (window.ME && window.ME.name) || (window.Account && window.Account.id) || "You";
    const rows = read();
    if (!rows.length){
      // no seeding; only real accounts
      rows.push({ name, net: computeNet(window.ME), level: 1, xp: 0 });
      write(rows);
    } else {
      // rename "You" to actual name if needed
      for (const r of rows){
        if (r.name === "You" && name && name !== "You") r.name = name;
      }
      write(rows);
    }
  }

  function upsertSelf(){
    const meta = (function(){ try { return JSON.parse(localStorage.getItem('acct:meta')||'null'); } catch(_) { return null; } })();
    const name = (meta && meta.name) || (window.ME && window.ME.name) || (window.Account && window.Account.id) || "You";
    const rows = read();
    const net = computeNet(window.ME);
    let found = rows.find(r => r.name === name);
    if (!found){
      found = { name, net, level: 1, xp: 0 };
      rows.push(found);
    } else {
      found.net = net;
    }
    // keep top 10 by net
    rows.sort((a,b)=>b.net-a.net);
    write(rows);
    render();
  }

  function render(){
    const box = document.querySelector('#board');
    if (!box) return;
    const rows = read().slice(0,10);
    box.innerHTML = '';
    rows.forEach((p,i)=>{
      const row = document.createElement('div');
      row.innerHTML = `${i+1}. <b>${p.name}</b> — ${fmt(p.net)} <span class="muted">Lv.${p.level} XP:${p.xp}</span>`;
      box.appendChild(row);
    });
  }

  // wiring
  document.addEventListener('DOMContentLoaded', function(){
    ensureInitial();
    render();
  });
  window.addEventListener('market:updated', function(){ upsertSelf(); });
  // Update after login/auth as well
  document.addEventListener('fm:authed', function(){ ensureInitial(); upsertSelf(); });
  // Also periodically, in case of missed events
  setInterval(upsertSelf, 5000);
})();
