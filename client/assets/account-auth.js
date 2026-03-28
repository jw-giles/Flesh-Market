
// account-auth.js
// Adds first-run "Create account" with password, and login on subsequent runs.
// Encrypts account data using Web Crypto (PBKDF2 -> AES-GCM).
// When unlocked, exposes AccountStorage that encrypts/decrypts values for keys
// we own: acct:data:<id>, pnl:lastCash, pnl:lastPortfolio.

(function(){
  const AUTH_WRAP_ID = 'fm-auth-wrap';
  function closeAuthModal(){ try{ const n=document.getElementById(AUTH_WRAP_ID); if(n) n.remove(); }catch(_){}}

  function emitAuthed(name){ try{ document.dispatchEvent(new CustomEvent('fm:authed', { detail: { name } })); }catch(_){ } }
  function attachSyncFacade(meta){
    try{
      const asyncStore = window.__AccountStorageAsync;
      const mirror = {};
      (async ()=>{
        try { mirror['acct:data:'+meta.id] = await asyncStore.getItem('acct:data:'+meta.id); } catch(_){}
        try { mirror['pnl:lastCash'] = await asyncStore.getItem('pnl:lastCash'); } catch(_){}
        try { mirror['pnl:lastPortfolio'] = await asyncStore.getItem('pnl:lastPortfolio'); } catch(_){}
        try{ window.dispatchEvent(new Event('market:updated')); }catch(_){}
      })();
      window.AccountStorage = {
        getItem(k){ return (k in mirror) ? mirror[k] : null; },
        setItem(k,v){ mirror[k]=v; try{ asyncStore.setItem(k,v); }catch(_){} return undefined; },
        removeItem(k){ delete mirror[k]; try{ asyncStore.removeItem(k); }catch(_){ } return undefined; }
      };
    }catch(_){}
  }

  function emitAuthed(name){ try{ document.dispatchEvent(new CustomEvent('fm:authed', { detail: { name } })); }catch(_){ } }
  const META_KEY = 'acct:meta';
  const ENC_PREFIX = 'acct:enc:'; // acct:enc:<id> -> base64(iv|cipher)
  const TEXT = {
    titleCreate: 'Create Account',
    titleLogin: 'Log In',
    name: 'Name',
    password: 'Password',
    create: 'Login',
    login: 'Log in',
    error: 'Incorrect password. Try again.',
  };

  // Minimal base64 helpers
  function b64e(buf){
    const b = Array.from(new Uint8Array(buf)).map(b=>String.fromCharCode(b)).join('');
    return btoa(b);
  }
  function b64d(str){
    const bin = atob(str);
    const buf = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function jsonParse(x){ try{ return JSON.parse(x);}catch(_){ return null; } }
  function now(){ return Date.now(); }

  async function deriveKey(password, salt, iterations=250000){
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations, hash:'SHA-256' },
      keyMaterial,
      { name:'AES-GCM', length:256 },
      false,
      ['encrypt','decrypt']
    );
  }

  async function encryptJSON(key, obj){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
    // pack iv|ct
    const blob = new Uint8Array(iv.byteLength + ct.byteLength);
    blob.set(iv, 0);
    blob.set(new Uint8Array(ct), iv.byteLength);
    return b64e(blob);
  }

  async function decryptJSON(key, b64){
    const buf = b64d(b64);
    const iv = buf.slice(0, 12);
    const ct = buf.slice(12);
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(iv)}, key, ct);
    const dec = new TextDecoder().decode(pt);
    return JSON.parse(dec);
  }

  function metaLoad(){
    const raw = localStorage.getItem(META_KEY);
    return raw ? jsonParse(raw) : null;
  }
  function metaSave(m){
    localStorage.setItem(META_KEY, JSON.stringify(m));
  }

  function uuidv4(){
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

  function buildModal(title, isCreate){
    closeAuthModal();
    const wrap = document.createElement('div');
    wrap.id = AUTH_WRAP_ID;
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:99999';
    const card = document.createElement('div');
    card.style.cssText = 'background:#101418;color:#eee;border:1px solid #2a2f36;border-radius:14px;min-width:320px;padding:18px;box-shadow:0 10px 30px rgba(0,0,0,.4)';
    const h = document.createElement('h3'); h.textContent = title; h.style.marginTop='0';
    const name = document.createElement('input'); name.placeholder = TEXT.name; name.className='input'; name.style.width='100%'; name.autocomplete='username';
    const pass = document.createElement('input'); pass.placeholder = TEXT.password; pass.type='password'; pass.className='input'; pass.style.width='100%'; pass.autocomplete='current-password';
    const row = document.createElement('div'); row.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:12px';
    const ok = document.createElement('button'); ok.className='btn'; ok.textContent = isCreate?TEXT.create:TEXT.login;
    const err = document.createElement('div'); err.style.cssText='color:#f66;margin-top:8px;display:none'; err.textContent=TEXT.error;
    card.appendChild(h);
    card.appendChild(name); // username required for both create and login
    card.appendChild(pass);
    row.appendChild(ok);
    card.appendChild(row);
    card.appendChild(err);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    return {wrap, name, pass, ok, err};
  }

  function AccountStorageFor(id, meta, key){
    // Keeps a single encrypted JSON payload with fields we care about.
    // We store at localStorage[ENC_PREFIX+id] = base64(iv|cipher)
    async function readPayload(){
      const b64 = localStorage.getItem(ENC_PREFIX+id);
      if (!b64) return {};
      try{
        return await decryptJSON(key, b64);
      }catch(_){
        return {};
      }
    }
    async function writePayload(obj){
      const b64 = await encryptJSON(key, obj);
      localStorage.setItem(ENC_PREFIX+id, b64);
    }

    // Queue writes to avoid racing
    let writing = Promise.resolve();
    let cache = null; // cache last read

    const api = {
      async getItem(k){
        if (k === META_KEY) return localStorage.getItem(k);
        if (!cache) cache = await readPayload();
        return (k in cache) ? (typeof cache[k]==='string' ? cache[k] : JSON.stringify(cache[k])) : null;
      },
      async setItem(k, v){
        if (k === META_KEY) return localStorage.setItem(k, v);
        if (!cache) cache = await readPayload();
        try { cache[k] = (typeof v === 'string' && (v.startsWith('{')||v.startsWith('['))) ? JSON.parse(v) : v; } catch(_) { cache[k]=v; }
        const toWrite = Object.assign({}, cache);
        writing = writing.then(()=>writePayload(toWrite));
        return writing;
      },
      async removeItem(k){
        if (!cache) cache = await readPayload();
        delete cache[k];
        const toWrite = Object.assign({}, cache);
        writing = writing.then(()=>writePayload(toWrite));
        return writing;
      }
    };

    // Synchronous facade for code expecting sync localStorage API
    // WARNING: uses deasync-like trick via Atomics.wait on a SharedArrayBuffer fallback is not allowed,
    // so we instead expose a thin wrapper that presents sync signatures but internally caches & may be stale
    // To keep things simple and safe, we expose a synchronous-looking API that throws if called before unlock.
    const sync = {
      getItem(k){ throw new Error('Account locked'); },
      setItem(k){ throw new Error('Account locked'); },
      removeItem(k){ throw new Error('Account locked'); },
      _async: api
    };
    return sync;
  }


  async function seedDevIfNeeded(){
    try{
      if (!window.FM_DEV_ACCOUNT) return;
      const meta0 = metaLoad();
      if (meta0) return; // already have an account
      const { name, password } = window.FM_DEV_ACCOUNT || {};
      if (!name || !password) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iterations = 250000;
      const key = await deriveKey(password, salt, iterations);
      const id = uuidv4();
      const meta = { id, name, iterations, salt: b64e(salt), createdAt: now() };
      metaSave(meta);
      // write an empty encrypted payload so login can verify password
      const storage = AccountStorageFor(id, meta, key);
      await storage._async.setItem('acct:data:'+id, JSON.stringify({ id, name }));
    }catch(_){}
  }

  // Boot flow
  async function boot(){
    if (window.__fmAuthBooted) return; window.__fmAuthBooted = true;
    await seedDevIfNeeded();
    // Wait for body
    if (document.readyState==='loading'){
      await new Promise(r=>document.addEventListener('DOMContentLoaded', r, {once:true}));
    }

    let meta = metaLoad();
    if (!meta){
      // First run: create account
      const ui = buildModal(TEXT.titleCreate, true);
      // extra create button for convenience
      try{
        const alt = document.createElement('button');
        alt.className='btn'; alt.textContent='Create account'; alt.style.marginLeft='8px';
        ui.ok.parentNode && ui.ok.parentNode.appendChild(alt);
        alt.onclick = function(){ ui.wrap.remove(); setTimeout(()=>boot(),0); window.localStorage.removeItem('acct:meta'); };
      }catch(_){}
      await new Promise(resolve=>{
        ui.ok.onclick = async function(){
          const name = (ui.name.value||'').trim() || 'Player';
          const pwd = (ui.pass.value||'');
          if (!pwd){ ui.err.style.display='block'; ui.err.textContent='Password required'; return; }
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const iterations = 250000;
          const key = await deriveKey(pwd, salt, iterations);
          const id = uuidv4();
          meta = { id, name, iterations, salt: b64e(salt), createdAt: now() };
          metaSave(meta);
          // Pre-create encrypted payload with initial fields
          const storage = AccountStorageFor(id, meta, key);
          // expose async API until persist layer plugs in
          window.__AccountStorageAsync = storage._async;
          // Prepare initial data (empty); persist layer will fill and save
          await window.__AccountStorageAsync.setItem('acct:data:'+id, JSON.stringify({ id, name }));
          emitAuthed(name.value||'');
          ui.wrap.remove();
          resolve();
        };
      });
    } else {
      // Subsequent run: login
      const ui = buildModal(TEXT.titleLogin, false);
      try { if (meta && meta.name) ui.name.value = meta.name; } catch(_){};
      try{
        const alt = document.createElement('button');
        alt.className='btn'; alt.textContent='Create account'; alt.style.marginLeft='8px';
        ui.ok.parentNode && ui.ok.parentNode.appendChild(alt);
        alt.onclick = function(){ ui.wrap.remove(); window.__fmShowCreate = true; };
      }catch(_){}

      await new Promise(resolve=>{
        ui.ok.onclick = async function(){
          const uname = (ui.name.value||'').trim();
          const pwd = (ui.pass.value||'');
          if (!uname || (meta && meta.name && uname !== meta.name)) { ui.err.textContent='Incorrect username or password.'; ui.err.style.display='block'; return; }
          try{
            const salt = b64d(meta.salt);
            const key = await deriveKey(pwd, salt, meta.iterations||250000);
            // try decrypt
            const b64 = localStorage.getItem(ENC_PREFIX+meta.id);
            if (b64){
              await decryptJSON(key, b64); // throws on failure
            }
            const storage = AccountStorageFor(meta.id, meta, key);
            window.__AccountStorageAsync = storage._async;
            attachSyncFacade(meta);
            emitAuthed((meta&&meta.name)||'');
            ui.wrap.remove();
            resolve();
          }catch(e){
            ui.err.style.display='block';
          }
        };
      });
    }

    // After unlock, expose a sync-ish facade used by account-persist.
    const asyncStore = window.__AccountStorageAsync;
    if (asyncStore){ attachSyncFacade(meta||{}); }
  }

  boot();
})();
