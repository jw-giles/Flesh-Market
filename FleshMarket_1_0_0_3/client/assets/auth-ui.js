(function(){
  const log = (...a)=>console.log("[fm-auth]", ...a);
  const cookieName = "fm_session";
  let API_BASE = (window.FM_API_BASE || "").replace(/\/+$/,""); // optional override

  async function tryFetch(url, opts){
    try { const r = await fetch(url, opts); return r; } catch(e){ return { ok:false, status:0, _err:e }; }
  }
  async function api(path, opts){
    const rel = (API_BASE || "") + path;
    let r = await tryFetch(rel, opts);
    if (r.ok || r.status===401) return r; // success or unauthorized means server reachable
    // Fallback to localhost:3000 if dev server served the page
    if (!API_BASE && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      const alt = `http://localhost:3000${path}`;
      r = await tryFetch(alt, opts);
      if (r.ok || r.status===401) { API_BASE = "http://localhost:3000"; return r; }
    }
    return r;
  }

  async function me(){
    const r = await api('/auth/me', { credentials:'include' });
    if (!r.ok) { log("me ->", r.status); return null; }
    try { const j = await r.json(); return j.user || null; } catch { return null; }
  }
  async function login(username, password){
    const r = await api('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, password })});
    if (!r.ok) throw new Error('Login failed '+r.status);
    const j = await r.json(); return j.user;
  }
  async function register(username, password){
    const r = await api('/auth/register', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, password })});
    if (!r.ok) throw new Error('Register failed '+r.status);
    const j = await r.json(); return j.user;
  }

  function showModal(){
    if (document.getElementById('fm-auth-wrap')) return;
    const tpl = `
    <div id="fm-auth-wrap" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);z-index:2147483647">
      <div style="width:360px;background:#0b0d11;border:1px solid #222;border-radius:12px;padding:20px;font-family:sans-serif;color:#e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.6)">
        <h2 style="margin:0 0 12px 0">Sign in</h2>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="fm-tab-login"  style="flex:1;padding:8px;border-radius:8px;border:1px solid #333;background:#111;color:#e5e7eb">Log in</button>
          <button id="fm-tab-create" style="flex:1;padding:8px;border-radius:8px;border:1px solid #333;background:#111;color:#e5e7eb">Create</button>
        </div>
        <label>Username</label>
        <input id="fm-user" style="width:100%;padding:8px;margin:6px 0 10px 0;background:#111;border:1px solid #333;border-radius:8px;color:#e5e7eb"/>
        <label>Password</label>
        <input id="fm-pass" type="password" style="width:100%;padding:8px;margin:6px 0 16px 0;background:#111;border:1px solid #333;border-radius:8px;color:#e5e7eb"/>
        <button id="fm-action" style="width:100%;padding:10px;border-radius:10px;background:#2563eb;color:white;border:0">Continue</button>
        <div id="fm-err" style="margin-top:10px;color:#ef4444;min-height:18px"></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', tpl);
    let mode = 'login';
    const $ = sel => document.querySelector(sel);
    $('#fm-tab-login').onclick = () => { mode='login'; };
    $('#fm-tab-create').onclick = () => { mode='create'; };
    $('#fm-action').onclick = async () => {
      const u = $('#fm-user').value.trim(), p = $('#fm-pass').value;
      $('#fm-err').textContent = '';
      // Username filter on registration
      if (mode === 'create') {
        if (!u || u.length < 2 || u.length > 24) {
          $('#fm-err').textContent = 'Username must be 2–24 characters.'; return;
        }
        if (window.usernameHasBadWord && window.usernameHasBadWord(u)) {
          $('#fm-err').textContent = 'That username is not allowed. Please choose another.'; return;
        }
      }
      try {
        const user = mode === 'login' ? await login(u,p) : await register(u,p);
        $('#fm-auth-wrap').remove();
        document.dispatchEvent(new CustomEvent('fm:authed', { detail: user }));
      } catch(e){ $('#fm-err').textContent = 'Auth failed'; log(e); }
    };
  }

  // Boot
  document.addEventListener('DOMContentLoaded', async () => {
    const user = await me().catch(()=>null);
    if (user) {
      log('session ok for', user.name);
      document.dispatchEvent(new CustomEvent('fm:authed', { detail: user }));
    } else {
      log('no session; showing modal');
      showModal();
    }
  });

  // Escape hatch for tests: window.fmLogout() clears cookie (best-effort) and reloads.
  window.fmLogout = async function(){
    try { await api('/auth/logout', { method:'POST', credentials:'include' }); } catch {}
    try { document.cookie = cookieName+'=; Max-Age=0; path=/'; } catch {}
    location.reload();
  };
})();