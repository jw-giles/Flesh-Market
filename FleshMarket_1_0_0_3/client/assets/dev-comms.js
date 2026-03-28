// ═══════════════════════════════════════════════════════════════════════════════
// DEV COMMUNICATIONS PANEL
// Sub-tabs: Bug Reports | Player Reports | Dev Requests | Announcements
// Visible to: all players (bugs/reports/requests), devs get full queue view
// ═══════════════════════════════════════════════════════════════════════════════
// ── Shared utilities (global scope) ──────────────────────────────────────────
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

(function(){
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let __commsTab = 'bugs';
let __commsOpen = false;
let __isDevUser = false;
let __myPlayerId = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('fm:authed', function(e) {
  __isDevUser = !!(e.detail && (e.detail.is_admin || e.detail.is_dev || e.detail.is_prime || e.detail.isAdmin || e.detail.isDev));
  window.__isDevUser = __isDevUser; // expose for appended functions outside IIFE
  __myPlayerId = e.detail && (e.detail.playerId || e.detail.id);
  if (__isDevUser) {
    // Show dev-only controls
    document.querySelectorAll('.comms-dev-only').forEach(el => el.style.display = 'block');
  }
});

// ── Toggle ────────────────────────────────────────────────────────────────────
window.toggleDevComms = function() {
  const panel = document.getElementById('devCommsPanel');
  if (!panel) return;
  __commsOpen = !__commsOpen;
  panel.style.display = __commsOpen ? 'flex' : 'none';
  if (__commsOpen) devCommsRefresh();
};
window.devCommsRefresh = function() { devCommsLoad(__commsTab); };

// ── Tab switch ────────────────────────────────────────────────────────────────
window.devCommsTab = function(tab) {
  __commsTab = tab;
  document.querySelectorAll('.comms-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.comms-pane').forEach(d => d.style.display = d.id === `commsPane-${tab}` ? 'block' : 'none');
  devCommsLoad(tab);
};

// ── Load data ─────────────────────────────────────────────────────────────────
function devCommsLoad(tab) {
  if (tab === 'bugs') loadBugs();
  else if (tab === 'reports') loadReports();
  else if (tab === 'requests') loadRequests();
}

// ── Bug Reports ───────────────────────────────────────────────────────────────
function loadBugs() {
  const el = document.getElementById('comms-bug-list');
  if (!el) return;
  el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">Loading…</div>';
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs', { headers: { 'x-auth-token': tok } })
    .then(r => r.json()).then(d => {
      if (!d.ok) return;
      if (!d.bugs.length) { el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">No reports yet. Be the first!</div>'; return; }
      el.innerHTML = '';
      d.bugs.forEach(b => {
        const card = document.createElement('div');
        card.className = 'comms-card';
        card.style.opacity = b.resolved ? '0.45' : '1';
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">
            <span style="font-size:.84rem;color:#ccc;line-height:1.5;flex:1">${escHtml(b.text)}</span>
            <button class="comms-upvote-btn" onclick="commsBugUpvote(${b.id}, this)" title="Upvote">
              👍 ${b.upvotes}
            </button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.74rem;color:#666">${escHtml(b.reporter)} · ${timeAgo(b.ts)}</span>
            ${b.resolved ? '<span style="font-size:.74rem;color:#51cf66">✓ Resolved</span>' : ''}
            ${__isDevUser ? `<button class="comms-dev-btn" onclick="commsResolve(${b.id}, this)">${b.resolved ? 'Unresolve' : 'Resolve'}</button>` : ''}
          </div>
        `;
        el.appendChild(card);
      });
    }).catch(() => { el.innerHTML = '<div style="color:#ff6b6b;font-size:.82rem;padding:8px">Failed to load.</div>'; });
}

window.commsBugSubmit = function() {
  const text = (document.getElementById('comms-bug-input').value || '').trim();
  if (!text) return;
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ text, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok) { document.getElementById('comms-bug-input').value = ''; loadBugs(); }
    else { commsToast('Failed to submit report.', '#ff6b6b'); }
  });
};

window.commsBugUpvote = function(id, btn) {
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs/upvote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ id, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok && btn) btn.textContent = `👍 ${d.upvotes}`;
  });
};

window.commsResolve = function(id, btn) {
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ id, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok) loadBugs();
  });
};

// ── Player Reports ────────────────────────────────────────────────────────────
function loadReports() {
  const el = document.getElementById('comms-report-list');
  if (!el) return;
  if (!__isDevUser) return; // Never hit admin endpoint for non-devs
  el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">Loading…</div>';
  const tok = window.__fmToken || '';
  fetch('/api/comms/reports', { headers: { 'x-auth-token': tok } })
    .then(r => r.json()).then(d => {
      if (!d.ok) return;
      if (!d.reports.length) { el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">No player reports.</div>'; return; }
      el.innerHTML = '';
      d.reports.forEach(r => {
        const card = document.createElement('div');
        card.className = 'comms-card';
        card.style.opacity = r.reviewed ? '0.5' : '1';
        card.innerHTML = `
          <div style="font-size:.72rem;color:#e74c3c;margin-bottom:2px">Report: <b>${escHtml(r.target)}</b></div>
          <div style="font-size:.72rem;color:#ccc;margin-bottom:4px">${escHtml(r.reason)}</div>
          <div style="font-size:.74rem;color:#666">By ${escHtml(r.reporter)} · ${timeAgo(r.ts)}</div>
        `;
        el.appendChild(card);
      });
    });
}

window.commsReportSubmit = function() {
  const target = (document.getElementById('comms-report-target').value || '').trim();
  const reason = (document.getElementById('comms-report-reason').value || '').trim();
  if (!target || !reason) return commsToast('Please fill in both fields.', '#ff6b6b');
  const tok = window.__fmToken || '';
  fetch('/api/comms/reports/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ target, reason, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      document.getElementById('comms-report-target').value = '';
      document.getElementById('comms-report-reason').value = '';
      commsToast('Report submitted. Thank you.', '#51cf66');
    } else { commsToast('Failed to submit.', '#ff6b6b'); }
  });
};

// ── Dev Requests ──────────────────────────────────────────────────────────────
function loadRequests() {
  const el = document.getElementById('comms-request-list');
  if (!el) return;
  // Never hit admin endpoint for non-devs
  if (!__isDevUser) return;
  el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">Loading…</div>';
  const tok = window.__fmToken || '';
  fetch('/api/comms/requests', { headers: { 'x-auth-token': tok } })
    .then(r => r.json()).then(d => {
      if (!d.ok) return;
      if (!d.requests.length) { el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">No pending requests.</div>'; return; }
      el.innerHTML = '';
      d.requests.forEach(r => {
        const card = document.createElement('div');
        card.className = 'comms-card';
        card.style.opacity = r.handled ? '0.45' : '1';
        card.innerHTML = `
          <div style="font-size:.72rem;color:#f39c12;margin-bottom:2px"><b>${escHtml(r.player)}</b> requests a dev chat</div>
          <div style="font-size:.72rem;color:#ccc;margin-bottom:4px">${escHtml(r.message)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.74rem;color:#666">${timeAgo(r.ts)}</span>
            <button class="comms-dev-btn" onclick="commsHandleRequest(${r.id})">Mark Handled</button>
          </div>
        `;
        el.appendChild(card);
      });
    });
}

window.commsRequestSubmit = function() {
  const message = (document.getElementById('comms-request-msg').value || '').trim();
  if (!message) return;
  const tok = window.__fmToken || '';
  fetch('/api/comms/requests/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ message, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      document.getElementById('comms-request-msg').value = '';
      commsToast('Request sent to dev team.', '#51cf66');
    } else { commsToast('Failed.', '#ff6b6b'); }
  });
};

window.commsHandleRequest = function(id) {
  const tok = window.__fmToken || '';
  fetch('/api/comms/requests/handle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ id, token: tok })
  }).then(() => loadRequests());
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function commsToast(msg, color) {
  const el = document.getElementById('comms-toast');
  if (!el) return;
  el.textContent = msg; el.style.color = color || '#ccc'; el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3000);
}


// ── Standalone Bugs Tab (main nav) ────────────────────────────────────────────
window.bugsTabLoad = function() {
  loadBugsList('bugs-list', 'bugs-toast');
};

window.loadBugsList = function loadBugsList(listId, toastId) {
  const el = document.getElementById(listId);
  if (!el) return;
  el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">Loading…</div>';
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs', { headers: { 'x-auth-token': tok } })
    .then(r => r.json()).then(d => {
      if (!d.ok) return;
      if (!d.bugs.length) {
        el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">No reports yet — be the first!</div>';
        return;
      }
      el.innerHTML = '';
      d.bugs.forEach(b => {
        const isResolved = b.resolved;
        const card = document.createElement('div');
        card.style.cssText = 'background:#07070e;border:1px solid #4ecdc4'+(isResolved?'11':'33')+
          ';border-radius:8px;padding:10px 12px;opacity:'+(isResolved?'0.45':'1');
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
            <span style="font-size:.74rem;color:${isResolved?'#555':'#ccc'};line-height:1.5;flex:1">${escHtml(b.text)}</span>
            <button onclick="bugsUpvote(${b.id}, this)"
              style="background:#4ecdc411;border:1px solid #4ecdc433;color:#4ecdc4;padding:4px 10px;
              border-radius:5px;cursor:pointer;font-size:.80rem;font-family:inherit;white-space:nowrap;flex-shrink:0">
              👍 ${b.upvotes}
            </button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:.63rem;color:#444">${escHtml(b.reporter)} · ${timeAgo(b.ts)}</span>
            <span style="font-size:.63rem;color:${isResolved?'#51cf66':'#555'}">${isResolved?'✓ Resolved':''}</span>
          </div>
        `;
        el.appendChild(card);
      });
    }).catch(() => {
      el.innerHTML = '<div style="color:#ff6b6b;font-size:.82rem;padding:8px">Could not load reports.</div>';
    });
}

window.bugsSubmit = function() {
  const input = document.getElementById('bugs-input');
  const text = (input ? input.value : '').trim();
  if (!text) return;
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ text, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok) {
      if (input) input.value = '';
      const t = document.getElementById('bugs-toast');
      if (t) { t.textContent = '✓ Report submitted!'; t.style.opacity='1'; setTimeout(()=>t.style.opacity='0', 3000); }
      loadBugsList('bugs-list', 'bugs-toast');
    }
  });
};

window.bugsUpvote = function(id, btn) {
  const tok = window.__fmToken || '';
  fetch('/api/comms/bugs/upvote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': tok },
    body: JSON.stringify({ id, token: tok })
  }).then(r => r.json()).then(d => {
    if (d.ok && btn) btn.textContent = `👍 ${d.upvotes}`;
  });
};

})();
// ═══════════════════════════════════════════════════════════════════════════════


// ── Main tab comms switcher (for the Bugs main nav tab) ───────────────────────
window.commsMainTab = function(tab) {
  document.querySelectorAll('.comms-main-tab').forEach(function(b) {
    var active = b.dataset.ctab === tab;
    b.style.color = active ? '#4ecdc4' : '#555';
    b.style.borderBottomColor = active ? '#4ecdc4' : 'transparent';
    b.classList.toggle('active', active);
  });
  document.querySelectorAll('.comms-main-pane').forEach(function(p) {
    p.style.display = p.id === 'commsMain-' + tab ? 'block' : 'none';
  });
  if (tab === 'bugs') loadBugsList('bugs-list', 'bugs-toast');
  if (tab === 'reports') loadReports();
  if (tab === 'devchat') { /* static form, nothing to load */ }
};

// Override bugsTabLoad to show bugs sub-tab
window.bugsTabLoad = function() {
  // Ensure bugsTab is flex so layout works
  var bt = document.getElementById('bugsTab');
  if (bt) bt.style.display = 'flex';
  // Load the default sub-tab
  loadBugsList('bugs-list', 'bugs-toast');
};

// Fix report toast to use correct element id
window.commsReportSubmit = function() {
  var target = (document.getElementById('comms-report-target') || {}).value || '';
  var reason = (document.getElementById('comms-report-reason') || {}).value || '';
  target = target.trim(); reason = reason.trim();
  if (!target || !reason) {
    var t = document.getElementById('report-toast');
    if (t) { t.textContent = '⚠ Fill in both fields.'; t.style.color='#ff6b6b'; t.style.opacity='1'; setTimeout(function(){t.style.opacity='0';},3000); }
    return;
  }
  var tok = window.__fmToken || '';
  fetch('/api/comms/reports/file', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-auth-token':tok},
    body:JSON.stringify({target:target, reason:reason})
  }).then(function(r){return r.json();}).then(function(d){
    var t = document.getElementById('report-toast');
    if (d.ok) {
      document.getElementById('comms-report-target').value = '';
      document.getElementById('comms-report-reason').value = '';
      if (t) { t.textContent='✓ Report submitted.'; t.style.color='#51cf66'; t.style.opacity='1'; setTimeout(function(){t.style.opacity='0';},3000); }
    } else {
      if (t) { t.textContent='Failed to submit.'; t.style.color='#ff6b6b'; t.style.opacity='1'; setTimeout(function(){t.style.opacity='0';},3000); }
    }
  });
};

window.commsRequestSubmit = function() {
  var msg = (document.getElementById('comms-request-msg') || {}).value || '';
  msg = msg.trim();
  if (!msg) return;
  var tok = window.__fmToken || '';
  fetch('/api/comms/requests/submit', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-auth-token':tok},
    body:JSON.stringify({message:msg})
  }).then(function(r){return r.json();}).then(function(d){
    var t = document.getElementById('request-toast');
    if (d.ok) {
      document.getElementById('comms-request-msg').value='';
      if (t) { t.textContent='✓ Request sent to dev team.'; t.style.color='#51cf66'; t.style.opacity='1'; setTimeout(function(){t.style.opacity='0';},3000); }
    }
  });
};

function loadReports() {
  var el = document.getElementById('comms-report-list');
  if (!el) return;
  var isAdmin = document.body && document.body.classList.contains('is-admin');
  if (!isAdmin && !window.__isAdminUser) {
    el.innerHTML = '<div style="color:#555;font-size:.82rem;padding:8px">Reports submitted — dev team will follow up in-game.</div>';
    return;
  }
  var tok = window.__fmToken || '';
  el.innerHTML = '<div style="color:#555;font-size:.82rem">Loading…</div>';
  fetch('/api/comms/reports', {headers:{'x-auth-token':tok}})
    .then(function(r){return r.json();}).then(function(d){
      if (!d.ok || !d.reports.length) { el.innerHTML='<div style="color:#555;font-size:.82rem">No reports.</div>'; return; }
      el.innerHTML = '';
      d.reports.forEach(function(r) {
        var card = document.createElement('div');
        card.style.cssText='background:#07070e;border:1px solid #e74c3c22;border-radius:8px;padding:10px 12px;margin-bottom:8px;opacity:'+(r.reviewed?'0.45':'1');
        card.innerHTML='<div style="font-size:.72rem;color:#e74c3c;margin-bottom:2px">Report: <b>'+escHtml(r.target)+'</b></div>'
          +'<div style="font-size:.72rem;color:#ccc;margin-bottom:4px">'+escHtml(r.reason)+'</div>'
          +'<div style="font-size:.63rem;color:#444">By '+escHtml(r.reporter)+' · '+timeAgo(r.ts)+'</div>';
        el.appendChild(card);
      });
    });
}
