/**
 * fm-auth.js — FleshMarket v4 auth
 * Clean register/login modal. Token stored in localStorage.
 * Fires 'fm:authed' when ready. Exposes window.FM_Auth.
 */
(function(){
  const TOKEN_KEY = 'fm_token';
  const NAME_KEY  = 'fm_name';
  const WRAP_ID   = 'fm-auth-wrap';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getName()  { return localStorage.getItem(NAME_KEY);  }
  function saveSession(tok, name) {
    localStorage.setItem(TOKEN_KEY, tok);
    localStorage.setItem(NAME_KEY,  name);
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
  }

  window.FM_TOKEN = getToken();

  function closeModal() { const n=document.getElementById(WRAP_ID); if(n)n.remove(); }

  function emit(detail) {
    document.dispatchEvent(new CustomEvent('fm:authed', {detail}));
  }

  // ── Shared styles injected once ───────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('fm-auth-style')) return;
    const s = document.createElement('style');
    s.id = 'fm-auth-style';
    s.textContent = `
      #fm-auth-wrap {
        position:fixed;inset:0;background:rgba(0,0,0,.82);
        display:flex;align-items:center;justify-content:center;
        z-index:99999;font-family:ui-monospace,Menlo,Consolas,monospace;
      }
      #fm-auth-card {
        background:#0a0a08;color:#d4b87a;
        border:1px solid #1f4515;border-radius:10px;
        min-width:340px;max-width:400px;width:92%;
        padding:28px 32px;
        box-shadow:0 0 40px rgba(255,165,0,.08), 0 16px 48px rgba(0,0,0,.7);
      }
      #fm-auth-card h2 {
        margin:0 0 20px;font-size:1.05rem;letter-spacing:.14em;
        text-transform:uppercase;color:#46ff7d;
        border-bottom:1px dashed #3a2a08;padding-bottom:10px;
      }
      #fm-auth-card .fm-field { margin-bottom:12px; }
      #fm-auth-card .fm-field label {
        display:block;font-size:.78rem;opacity:.7;
        margin-bottom:4px;letter-spacing:.08em;text-transform:uppercase;
      }
      #fm-auth-card .fm-field input {
        width:100%;padding:8px 10px;
        background:#060605;border:1px solid #3a2a08;
        color:#46ff7d;border-radius:6px;outline:none;
        font-family:inherit;font-size:.95rem;box-sizing:border-box;
        transition:border-color .15s;
      }
      #fm-auth-card .fm-field input:focus { border-color:#46ff7d; }
      #fm-auth-card .fm-hint {
        font-size:.78rem;min-height:16px;margin-bottom:12px;
        transition:color .15s;
      }
      #fm-auth-card .fm-hint.ok  { color:#86ff6a; }
      #fm-auth-card .fm-hint.err { color:#ff6b6b; }
      #fm-auth-card .fm-actions {
        display:flex;gap:8px;justify-content:flex-end;margin-top:4px;
      }
      #fm-auth-card button {
        cursor:pointer;padding:7px 18px;
        border:1px solid #46ff7d;border-radius:6px;
        background:transparent;color:#46ff7d;
        font-family:inherit;font-size:.9rem;
        transition:background .15s,color .15s;
      }
      #fm-auth-card button:hover { background:#46ff7d;color:#000; }
      #fm-auth-card button.secondary {
        border-color:#1f4515;color:#888;
      }
      #fm-auth-card button.secondary:hover { background:#1f4515;color:#46ff7d; }
      #fm-auth-card button:disabled { opacity:.5;cursor:default;pointer-events:none; }
      #fm-auth-card .fm-divider {
        text-align:center;font-size:.75rem;opacity:.4;margin:14px 0 10px;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Build modal DOM ────────────────────────────────────────────────────────
  function buildModal(mode) {
    closeModal();
    injectStyles();

    const wrap = document.createElement('div');
    wrap.id = WRAP_ID;

    const card = document.createElement('div');
    card.id = 'fm-auth-card';

    const title = document.createElement('h2');
    title.textContent = '⬡ ' + (mode === 'login' ? (window.t?window.t('auth.titleLogin','FLESH MARKET'):'FLESH MARKET') : (window.t?window.t('auth.titleRegister','CREATE ACCOUNT'):'CREATE ACCOUNT'));

    const nameField = makeField((window.t?window.t('auth.name','Name'):'Name'), 'text', 'username');
    const passField = makeField((window.t?window.t('auth.password','Password'):'Password'), 'password', mode==='login'?'current-password':'new-password');
    if (mode==='login' && getName()) nameField.input.value = getName();

    const hint = document.createElement('div');
    hint.className = 'fm-hint';

    const actions = document.createElement('div');
    actions.className = 'fm-actions';

    const switchBtn = document.createElement('button');
    switchBtn.className = 'secondary';
    switchBtn.textContent = mode==='login' ? (window.t?window.t('auth.newAccount','New Account'):'New Account') : (window.t?window.t('auth.logIn','Log In'):'Log In');

    const submitBtn = document.createElement('button');
    submitBtn.textContent = mode==='login' ? (window.t?window.t('auth.logIn','Log In'):'Log In') : (window.t?window.t('auth.newAccount','Register'):'Register');

    actions.appendChild(switchBtn);
    actions.appendChild(submitBtn);

    // Language selector. This modal is the first thing a new player sees and
    // it is the only place where switching costs nothing, since nothing has
    // rendered and there is no session to lose, so the reload is unconditional
    // here. Both labels stay in their own language: someone who cannot read the
    // current UI still has to be able to find the one they want.
    const langRow = document.createElement('div');
    langRow.className = 'fm-lang';
    langRow.style.cssText = 'display:flex;gap:6px;align-items:center;justify-content:center;margin:0 0 12px';
    const langLbl = document.createElement('span');
    langLbl.style.cssText = 'font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;opacity:.5;margin-right:2px';
    langLbl.textContent = (window.t?window.t('auth.languagePrompt','Language'):'Language');
    langRow.appendChild(langLbl);
    const curZh = (window._lang === 'zh');
    [['en', 'English'], ['zh', '\u4e2d\u6587']].forEach(function (pair) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'secondary fm-lang-btn';
      b.textContent = pair[1];
      const active = (pair[0] === 'zh') === curZh;
      b.style.cssText = 'padding:2px 12px;font-size:.74rem;font-family:inherit;cursor:pointer;border-radius:4px;' +
        'background:' + (active ? 'rgba(126,224,156,.14)' : 'transparent') + ';' +
        'border:1px solid ' + (active ? '#7ee09c' : 'rgba(126,224,156,.28)') + ';' +
        'color:' + (active ? '#7ee09c' : '#6f8f7a');
      b.addEventListener('click', function () {
        if (active) return;                       // already in this language
        if (window.setLanguage) window.setLanguage(pair[0], { skipConfirm: true });
      });
      langRow.appendChild(b);
    });

    card.appendChild(langRow);
    card.appendChild(title);
    card.appendChild(nameField.wrap);
    card.appendChild(passField.wrap);
    card.appendChild(hint);
    card.appendChild(actions);
    wrap.appendChild(card);
    document.body.appendChild(wrap);

    setTimeout(()=>nameField.input.focus(), 60);

    nameField.input.addEventListener('keydown', e=>{ if(e.key==='Enter') passField.input.focus(); });
    passField.input.addEventListener('keydown', e=>{ if(e.key==='Enter') submitBtn.click(); });

    return { wrap, nameInput:nameField.input, passInput:passField.input, hint, submitBtn, switchBtn };
  }

  function makeField(labelText, type, autocomplete) {
    const wrap  = document.createElement('div');
    wrap.className = 'fm-field';
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = type;
    input.autocomplete = autocomplete;
    wrap.appendChild(label);
    wrap.appendChild(input);
    return { wrap, input };
  }

  function setHint(hintEl, text, cls) {
    hintEl.textContent = text;
    hintEl.className = 'fm-hint ' + (cls||'');
  }

  // ── API ────────────────────────────────────────────────────────────────────
  async function apiPost(path, body) {
    const r = await fetch(path, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    return r.json();
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  function showLogin(errorMsg) {
    const ui = buildModal('login');
    if (errorMsg) setHint(ui.hint, errorMsg, 'err');

    ui.switchBtn.onclick = () => showRegister();

    ui.submitBtn.onclick = async () => {
      const name = ui.nameInput.value.trim();
      const pass = ui.passInput.value;
      if (!name || !pass) { setHint(ui.hint,(window.t?window.t('auth.fillAllFields','Fill in all fields.'):'Fill in all fields.'),'err'); return; }
      ui.submitBtn.disabled = true;
      ui.submitBtn.textContent = '…';
      try {
        const data = await apiPost('/api/login', {name, password:pass});
        if (data.ok) {
          saveSession(data.token, data.name);
          window.FM_TOKEN = data.token;
          closeModal();
          emit({name:data.name, token:data.token, cash:data.cash, faction:data.faction||null, patreon_tier:data.patreon_tier||0, is_dev:!!(data.is_dev), is_admin:!!(data.is_admin), is_prime:!!(data.is_prime)});
        } else {
          const msgs = {invalid_credentials:(window.t?window.t('auth.wrongCredentials','Wrong name or password.'):'Wrong name or password.'),missing_fields:(window.t?window.t('auth.fillAllFields','Fill in all fields.'):'Fill in all fields.')};
          setHint(ui.hint, msgs[data.error]||data.error||(window.t?window.t('auth.loginFailed','Login failed.'):'Login failed.'),'err');
          ui.passInput.value = '';
          ui.submitBtn.disabled = false;
          ui.submitBtn.textContent = (window.t?window.t('auth.logIn','Log In'):'Log In');
        }
      } catch(e) {
        setHint(ui.hint,(window.t?window.t('auth.serverUnreachable','Server unreachable.'):'Server unreachable.'),'err');
        ui.submitBtn.disabled = false;
        ui.submitBtn.textContent = (window.t?window.t('auth.logIn','Log In'):'Log In');
      }
    };
  }

  // ── Register ───────────────────────────────────────────────────────────────
  function showRegister() {
    const ui = buildModal('register');

    ui.switchBtn.onclick = () => showLogin();

    // Live name check
    let checkTimer;
    ui.nameInput.addEventListener('input', ()=>{
      clearTimeout(checkTimer);
      const n = ui.nameInput.value.trim();
      if (!n) { ui.hint.textContent=''; return; }
      checkTimer = setTimeout(async ()=>{
        try {
          const r = await fetch('/api/name_available?name='+encodeURIComponent(n));
          const d = await r.json();
          setHint(ui.hint, d.available ? `"${n}" is available` : `"${n}" is taken`, d.available?'ok':'err');
        }catch(e){}
      }, 380);
    });

    ui.submitBtn.onclick = async () => {
      const name = ui.nameInput.value.trim();
      const pass = ui.passInput.value;
      if (!name) { setHint(ui.hint,(window.t?window.t('auth.nameRequired','Name required.'):'Name required.'),'err'); return; }
      if (!pass || pass.length < 4) { setHint(ui.hint,(window.t?window.t('auth.passwordMin','Password must be at least 4 characters.'):'Password must be at least 4 characters.'),'err'); return; }
      ui.submitBtn.disabled = true;
      ui.submitBtn.textContent = '…';
      try {
        const data = await apiPost('/api/register', {name, password:pass});
        if (data.ok) {
          saveSession(data.token, data.name);
          window.FM_TOKEN = data.token;
          closeModal();
          emit({name:data.name, token:data.token, cash:data.cash, faction:data.faction||null, patreon_tier:data.patreon_tier||0, is_dev:!!(data.is_dev), is_admin:!!(data.is_admin), is_prime:!!(data.is_prime)});
        } else {
          const msgs = {name_taken:(window.t?window.t('auth.nameTaken','That name is taken.'):'That name is taken.'),password_too_short:(window.t?window.t('auth.passwordTooShort','Password too short (min 4).'):'Password too short (min 4).'),name_required:(window.t?window.t('auth.nameRequired','Name required.'):'Name required.')};
          setHint(ui.hint, msgs[data.error]||data.error||(window.t?window.t('auth.registrationFailed','Registration failed.'):'Registration failed.'),'err');
          ui.submitBtn.disabled = false;
          ui.submitBtn.textContent = 'Register';
        }
      } catch(e) {
        setHint(ui.hint,(window.t?window.t('auth.serverUnreachable','Server unreachable.'):'Server unreachable.'),'err');
        ui.submitBtn.disabled = false;
        ui.submitBtn.textContent = 'Register';
      }
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.FM_Auth = {
    logout() { clearSession(); window.FM_TOKEN=null; location.reload(); },
    showLogin, showRegister,
    getToken, getName,
  };

  // ── Boot ───────────────────────────────────────────────────────────────────
  async function boot() {
    if (window.__fmAuthBooted) return;
    window.__fmAuthBooted = true;

    if (document.readyState==='loading') {
      await new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true}));
    }

    const tok = getToken();
    if (tok) {
      try {
        const res = await fetch('/api/whoami?token='+encodeURIComponent(tok));
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            window.FM_TOKEN = tok;
            emit({name:data.name, token:tok, cash:data.cash, faction:data.faction||null, patreon_tier:data.patreon_tier||0, is_dev:!!(data.is_dev), is_admin:!!(data.is_admin), is_dunced:!!(data.is_dunced), is_prime:!!(data.is_prime)});
            return;
          }
        }
      } catch(e) {}
      // Token invalid or server error — clear stale session
      clearSession();
    }

    // No valid session — show login
    showLogin();
  }

  boot();
})();
