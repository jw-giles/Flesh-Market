// ═══════════════════════════════════════════════════════════════════════════════
// FMCodec — codec-call ENGINE (layer 1) + contacts list. Plays a conversation from
// FM_CODEC.reps; emits onQuestAccepted at the end. Knows nothing about quest tracking.
//   window.FMContacts.open()      -> contacts list of faction reps
//   window.FMCodec.call(repId)    -> place a codec call to that rep
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let st = { rep:null, idx:0, typing:false, typer:null };

  function styleOnce() {
    if ($('fmcodec-style')) return;
    const s = document.createElement('style');
    s.id = 'fmcodec-style';
    s.textContent = `
    .fmc-ov{position:fixed;inset:0;z-index:12000;background:rgba(2,6,8,.86);display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',ui-monospace,monospace;--fac:#42ff7e}
    .fmc-wrap{position:relative;width:min(880px,94vw)}
    .fmc-wrap::before{content:"";position:absolute;inset:0;z-index:40;border-radius:14px;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;opacity:.5}
    .fmc-dev{position:relative;border-radius:14px;padding:18px;background:linear-gradient(180deg,#0c1a15,#070f0c);border:1px solid #1c3a30;box-shadow:0 0 0 1px #000 inset,0 0 50px rgba(0,0,0,.7),0 0 60px color-mix(in srgb,var(--fac) 14%,transparent)}
    .fmc-hdr{display:flex;align-items:center;gap:10px;font-size:.6rem;letter-spacing:.26em;color:#5f8f74;text-transform:uppercase;margin-bottom:12px;border-bottom:1px solid #1c3a30;padding-bottom:8px}
    .fmc-live{width:7px;height:7px;border-radius:50%;background:#444}
    .fmc-live.on{background:var(--fac);box-shadow:0 0 8px var(--fac)}
    .fmc-id{margin-left:auto;color:var(--fac);opacity:.85}
    .fmc-x{background:none;border:none;color:#5f8f74;font-size:1rem;cursor:pointer;margin-left:8px}
    .fmc-stage{display:grid;grid-template-columns:1fr 150px;gap:12px}
    .fmc-port{position:relative;border:1px solid #1c3a30;border-radius:6px;overflow:hidden;background:#040a08;min-height:230px;display:flex;align-items:center;justify-content:center}
    .fmc-port img{width:100%;height:100%;object-fit:cover;filter:saturate(.92) contrast(1.03)}
    .fmc-port .meta{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;font-size:.54rem;letter-spacing:.13em;color:#5f8f74;padding:5px 7px;z-index:3;background:linear-gradient(180deg,rgba(0,0,0,.65),transparent)}
    .fmc-port .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.18) 2px 4px);mix-blend-mode:multiply}
    .fmc-port.you{min-height:150px;align-self:end}
    .fmc-port.you .meta{color:#f0b454}
    .fmc-ring .fmc-port.them{animation:fmcGlitch .14s steps(2) infinite}
    @keyframes fmcGlitch{50%{filter:brightness(1.3) saturate(1.4);transform:translateY(1px)}}
    .fmc-dlg{grid-column:1/-1;margin-top:14px;border:1px solid #1c3a30;border-radius:8px;background:#06110d;position:relative;min-height:96px}
    .fmc-name{position:absolute;top:-11px;left:14px;background:var(--fac);color:#03100a;font-weight:700;font-size:.7rem;letter-spacing:.08em;padding:2px 12px;border-radius:3px;text-transform:uppercase}
    .fmc-line{padding:20px 18px 16px;font-size:1rem;line-height:1.55;color:#b6ffcf;min-height:58px}
    .fmc-line .cur{color:var(--fac);animation:fmcBlink 1s steps(1) infinite}
    @keyframes fmcBlink{50%{opacity:0}}
    .fmc-hint{position:absolute;right:14px;bottom:8px;font-size:.56rem;letter-spacing:.16em;color:#5f8f74;text-transform:uppercase}
    .fmc-quest{grid-column:1/-1;margin-top:6px;border:1px dashed var(--fac);border-radius:6px;padding:12px 14px;display:none}
    .fmc-quest.show{display:block}
    .fmc-qt{color:var(--fac);font-weight:700;letter-spacing:.05em;font-size:.84rem;margin-bottom:4px}
    .fmc-qd{font-size:.78rem;color:#b6ffcf;line-height:1.5;margin-bottom:6px}
    .fmc-qr{font-size:.68rem;color:#f0b454;letter-spacing:.03em}
    .fmc-ctl{grid-column:1/-1;display:flex;gap:10px;margin-top:12px;justify-content:center;min-height:38px}
    .fmc-ctl button{font-family:inherit;cursor:pointer;border-radius:4px;padding:9px 22px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;background:transparent}
    .fmc-accept{border:1px solid var(--fac);color:var(--fac)}.fmc-accept:hover{background:color-mix(in srgb,var(--fac) 18%,transparent)}
    .fmc-decline{border:1px solid #7a3030;color:#ff7a7a}.fmc-decline:hover{background:#ff7a7a18}
    /* contacts */
    .fmc-contacts{background:#060f0b;border:1px solid #1c3a30;border-radius:12px;width:min(460px,94vw);max-height:84vh;overflow:auto;box-shadow:0 10px 40px #000c}
    .fmc-chead{position:sticky;top:0;background:#08120d;border-bottom:1px solid #1c3a30;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;z-index:2}
    .fmc-ctitle{color:#42ff7e;letter-spacing:.18em;font-size:.78rem;text-transform:uppercase}
    .fmc-card{display:flex;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #102219;cursor:pointer;transition:background .12s}
    .fmc-card:hover{background:#0a1813}
    .fmc-cav{width:48px;height:48px;border-radius:8px;object-fit:cover;border:2px solid var(--fac);flex:0 0 auto}
    .fmc-cmeta{flex:1;min-width:0}
    .fmc-cname{color:#cdebe0;font-size:.82rem;font-weight:600}
    .fmc-crole{color:var(--fac);font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;margin:1px 0 3px}
    .fmc-cblurb{color:#5f8f74;font-size:.66rem;line-height:1.4}
    .fmc-callbtn{flex:0 0 auto;align-self:center;border:1px solid var(--fac);color:var(--fac);background:transparent;border-radius:4px;padding:7px 12px;font:inherit;font-size:.62rem;letter-spacing:.08em;cursor:pointer;text-transform:uppercase}
    `;
    document.head.appendChild(s);
  }

  function facColor(f){ return (window.FM_CODEC && FM_CODEC.factions[f] && FM_CODEC.factions[f].color) || '#42ff7e'; }
  function facSys(f){ return (window.FM_CODEC && FM_CODEC.factions[f] && FM_CODEC.factions[f].sys) || 'COMMS'; }
  function sani(id){ return String(id||'').replace(/[^a-z0-9_]/gi,''); }
  function portImg(id, who, col){
    const pid = sani(id);
    if (pid) return '<img src="assets/portraits/'+pid+'.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'div\'),{innerHTML:\'\'}))">';
    return '<svg viewBox="0 0 100 120" width="60%" style="opacity:.5"><circle cx="50" cy="42" r="22" fill="none" stroke="'+col+'" stroke-width="2"/><path d="M18 112 q32 -46 64 0" fill="none" stroke="'+col+'" stroke-width="2"/></svg>';
  }

  function closeAll(){
    const o = $('fmcodecOverlay'); if (o) o.remove();
    const c = $('fmcontactsOverlay'); if (c) c.remove();
    if (st.typer) clearInterval(st.typer);
    st = { rep:null, idx:0, typing:false, typer:null };
    document.removeEventListener('keydown', onKey);
  }

  // ── Contacts list ──────────────────────────────────────────────────────────
  window.FMContacts = {
    open: function () {
      if (!window.FM_CODEC) return;
      styleOnce();
      closeAll();
      const ov = document.createElement('div');
      ov.id = 'fmcontactsOverlay'; ov.className = 'fmc-ov';
      let h = '<div class="fmc-contacts"><div class="fmc-chead"><div class="fmc-ctitle">☎ Contacts</div><button class="fmc-x" id="fmcContactsClose">✕</button></div>';
      FM_CODEC.reps.forEach(function (r) {
        const col = facColor(r.faction);
        h += '<div class="fmc-card" data-rep="' + r.id + '" style="--fac:' + col + '">'
          + '<img class="fmc-cav" src="assets/portraits/' + sani(r.portrait) + '.png" alt="" onerror="this.style.visibility=\'hidden\'">'
          + '<div class="fmc-cmeta"><div class="fmc-cname">' + r.name + '</div>'
          + '<div class="fmc-crole">' + r.role + '</div>'
          + '<div class="fmc-cblurb">' + r.blurb + '</div></div>'
          + '<button class="fmc-callbtn" data-call="' + r.id + '">☎ Call</button></div>';
      });
      h += '</div>';
      ov.innerHTML = h;
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) closeAll(); });
      $('fmcContactsClose').onclick = closeAll;
      ov.querySelectorAll('[data-call]').forEach(function (b) {
        b.onclick = function (e) { e.stopPropagation(); FMCodec.call(b.dataset.call); };
      });
      ov.querySelectorAll('.fmc-card').forEach(function (card) {
        card.onclick = function () { FMCodec.call(card.dataset.rep); };
      });
    }
  };

  // ── Codec call engine ────────────────────────────────────────────────────────
  window.FMCodec = {
    call: function (repId) {
      if (!window.FM_CODEC) return;
      const rep = FM_CODEC.reps.find(function (r) { return r.id === repId; });
      if (!rep) return;
      styleOnce();
      const cExisting = $('fmcontactsOverlay'); if (cExisting) cExisting.remove();
      const old = $('fmcodecOverlay'); if (old) old.remove();
      st = { rep:rep, idx:0, typing:false, typer:null };
      const col = facColor(rep.faction);
      const myPort = (window.ME && window.ME.portrait) ? window.ME.portrait : '';
      const ov = document.createElement('div');
      ov.id = 'fmcodecOverlay'; ov.className = 'fmc-ov fmc-ring';
      ov.style.setProperty('--fac', col);
      ov.innerHTML =
        '<div class="fmc-wrap"><div class="fmc-dev">'
        + '<div class="fmc-hdr"><span class="fmc-live" id="fmcLive"></span><span id="fmcState">INCOMING TRANSMISSION</span>'
        + '<span class="fmc-id">FLESH COMMS // ' + facSys(rep.faction) + '</span><button class="fmc-x" id="fmcX">✕</button></div>'
        + '<div class="fmc-stage">'
        + '<div class="fmc-port them"><div class="meta"><span>' + facSys(rep.faction).split(' ')[0] + ' SYSTEM</span><span>' + (rep.ver || '') + '</span></div>' + portImg(rep.portrait, 'them', col) + '<div class="scan"></div></div>'
        + '<div class="fmc-port you"><div class="meta"><span>OUTGOING</span><span>YOU</span></div>' + portImg(myPort, 'you', '#f0b454') + '<div class="scan"></div></div>'
        + '<div class="fmc-dlg"><div class="fmc-name" id="fmcName">' + rep.name + '</div><div class="fmc-line" id="fmcLine"></div><div class="fmc-hint" id="fmcHint"></div></div>'
        + '<div class="fmc-quest" id="fmcQuest"><div class="fmc-qt" id="fmcQt"></div><div class="fmc-qd" id="fmcQd"></div><div class="fmc-qr" id="fmcQr"></div></div>'
        + '<div class="fmc-ctl" id="fmcCtl"></div>'
        + '</div></div></div>';
      document.body.appendChild(ov);
      $('fmcX').onclick = closeAll;
      $('fmcName').textContent = '\u2014';
      buttons([['ACCEPT', 'fmc-accept', connect], ['DECLINE', 'fmc-decline', function () { endCall('declined'); }]]);
      ov.addEventListener('click', function (e) {
        if (e.target.closest('button')) return;
        if (ov.classList.contains('fmc-connected') && $('fmcCtl').children.length === 0) advance();
      });
      document.addEventListener('keydown', onKey);
    }
  };

  function onKey(e){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    if (e.code === 'Escape') { closeAll(); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && ov.classList.contains('fmc-connected') && $('fmcCtl').children.length === 0) {
      e.preventDefault(); advance();
    }
  }
  function connect(){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    ov.classList.remove('fmc-ring'); ov.classList.add('fmc-connected');
    $('fmcLive').classList.add('on'); $('fmcState').textContent = 'CHANNEL OPEN';
    st.idx = 0; play();
  }
  function play(){
    if (!st.rep) return;
    if (st.idx >= st.rep.lines.length) return offerQuest();
    const l = st.rep.lines[st.idx];
    $('fmcName').textContent = l.from === 'you' ? 'YOU' : st.rep.name;
    $('fmcName').style.background = l.from === 'you' ? '#f0b454' : 'var(--fac)';
    typeLine(l.text);
    buttons([]);
  }
  function typeLine(text){
    st.typing = true; let i = 0; const el = $('fmcLine'); $('fmcHint').textContent = '';
    clearInterval(st.typer);
    st.typer = setInterval(function () {
      el.innerHTML = esc(text.slice(0, i)) + '<span class="cur">\u258c</span>';
      i++;
      if (i > text.length) { clearInterval(st.typer); st.typing = false; el.textContent = text; $('fmcHint').textContent = '\u25b8 click / space'; }
    }, 18);
  }
  function advance(){
    if (st.typing) { clearInterval(st.typer); st.typing = false; $('fmcLine').textContent = st.rep.lines[st.idx].text; $('fmcHint').textContent = '\u25b8 click / space'; return; }
    st.idx++; play();
  }
  function offerQuest(){
    const q = st.rep.quest; $('fmcHint').textContent = ''; $('fmcName').textContent = st.rep.name;
    $('fmcQt').textContent = '\u25c8 ' + q.title; $('fmcQd').textContent = q.desc; $('fmcQr').textContent = 'Reward: ' + q.reward;
    $('fmcQuest').classList.add('show');
    $('fmcLine').textContent = 'Transmission complete. The offer stands.';
    buttons([['ACCEPT CONTRACT', 'fmc-accept', function () { onQuestAccepted(st.rep, q); }],
             ['DECLINE', 'fmc-decline', function () { endCall('declined'); }]]);
  }
  // ── LAYER 3 HOOK: quest tracking would take over here. Thin stub for now. ──
  function onQuestAccepted(rep, quest){
    window.FM_QUESTS = window.FM_QUESTS || [];
    if (!window.FM_QUESTS.some(function (q) { return q.id === quest.id; }))
      window.FM_QUESTS.push({ id:quest.id, rep:rep.id, faction:rep.faction, title:quest.title, acceptedAt:Date.now() });
    $('fmcQuest').classList.remove('show');
    $('fmcLine').textContent = 'Contract logged. ' + rep.name + ' cuts the channel.';
    // TODO(layer 3): POST to a /api/quests/accept endpoint to persist + start tracking.
    if (window.showToast) window.showToast('\u25c8 Contract accepted: ' + quest.title, facColor(rep.faction), 3000);
    endCall('accepted');
  }
  function endCall(how){
    const ov = $('fmcodecOverlay'); if (!ov) return;
    ov.classList.remove('fmc-ring', 'fmc-connected');
    $('fmcLive').classList.remove('on');
    $('fmcState').textContent = how === 'accepted' ? 'CONTRACT ACCEPTED' : 'CHANNEL CLOSED';
    $('fmcName').textContent = '\u2014'; $('fmcHint').textContent = '';
    if (how === 'declined') $('fmcLine').textContent = 'You cut the line.';
    buttons([['CLOSE', 'fmc-accept', closeAll]]);
  }
  function buttons(list){
    const c = $('fmcCtl'); if (!c) return; c.innerHTML = '';
    list.forEach(function (x) { const b = document.createElement('button'); b.className = x[1]; b.textContent = x[0]; b.onclick = x[2]; c.appendChild(b); });
  }
  function esc(s){ return String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
})();
