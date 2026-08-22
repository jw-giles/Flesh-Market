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

  // ── Trial accounts ─────────────────────────────────────────────────────────
  // A first-time visitor never sees a signup form. They land in the game on a
  // trial account that runs seven days and then LOCKS; it is never deleted, so
  // the upgrade prompt at the end is showing them a portfolio they still own.
  //
  // window.FM_GUEST is the single source of truth for every other module that
  // wants to know. Shape: {active, locked, expiresAt, daysLeft}.
  window.FM_GUEST = { active:false, locked:false, expiresAt:null, daysLeft:null };

  function setGuestState(d) {
    window.FM_GUEST = {
      active:   !!d.is_guest,
      locked:   !!d.guest_locked,
      expiresAt: d.guest_expires_at || null,
      daysLeft:  d.guest_days_left != null ? d.guest_days_left : null,
    };
    syncClaimButton();
    if (window.FM_GUEST.active) renderGuestBar();
    if (window.FM_GUEST.locked) showLockScreen();
  }

  // The header Claim Account button. Lives in index.html hidden, because the
  // header is built before this script decides whether the session is a trial.
  //
  // This is the primary entry point, not the bottom bar. On mobile #fmNav is
  // fixed to bottom:0 at z-index 9992 and the guest bar sits under it, so a
  // phone player would otherwise have no way to upgrade until the lock screen
  // appeared on day seven.
  //
  // Retried on an interval for a short while because index.html and this script
  // can finish in either order depending on cache state, and a button that is
  // only correct on one of those orderings is a button that intermittently is
  // not there.
  function syncClaimButton() {
    const set = () => {
      const b = document.getElementById('fm-claim-btn');
      if (!b) return false;
      b.style.display = (window.FM_GUEST && window.FM_GUEST.active) ? '' : 'none';
      return true;
    };
    if (set()) return;
    let tries = 0;
    const iv = setInterval(() => { if (set() || ++tries > 40) clearInterval(iv); }, 100);
  }

  // A guest row is created on FIRST MEANINGFUL INTERACTION, not on page load.
  // Page load would mint a permanent row for every crawler, link preview, uptime
  // check and three-second bounce, and nothing is ever deleted. Resolving on the
  // first real input OR on the tab being visibly open for a couple of seconds is
  // indistinguishable from auto-guest for a human and skips nearly every bot,
  // because bots do not scroll, click, or sit on a visible timer.
  function armGuestCreation() {
    return new Promise(resolve => {
      let done = false;
      const fire = () => {
        if (done) return; done = true;
        ['pointerdown','keydown','touchstart','scroll','wheel'].forEach(ev =>
          window.removeEventListener(ev, fire, true));
        clearTimeout(timer);
        resolve();
      };
      ['pointerdown','keydown','touchstart','scroll','wheel'].forEach(ev =>
        window.addEventListener(ev, fire, {capture:true, once:true, passive:true}));
      const timer = setTimeout(() => {
        if (document.visibilityState === 'visible') fire();
        else document.addEventListener('visibilitychange', function vc(){
          if (document.visibilityState === 'visible') {
            document.removeEventListener('visibilitychange', vc);
            fire();
          }
        });
      }, 2500);
    });
  }

  async function createGuest() {
    const data = await apiPost('/api/guest', {});
    if (!data.ok) {
      if (data.error === 'guest_rate_limited') {
        showLogin(data.message || 'Too many trial accounts from this connection today.');
        return null;
      }
      showLogin(data.message || 'Could not start a trial session.');
      return null;
    }
    saveSession(data.token, data.name);
    window.FM_TOKEN = data.token;
    setGuestState(data);
    return data;
  }

  // ── Boot overlay ───────────────────────────────────────────────────────────
  function showBootVeil() {
    if (document.getElementById('fm-boot-veil')) return;
    injectStyles();
    const v = document.createElement('div');
    v.id = 'fm-boot-veil';
    v.style.cssText = 'position:fixed;inset:0;background:#050505;z-index:99998;display:flex;'
      + 'align-items:center;justify-content:center;flex-direction:column;gap:14px;'
      + 'font-family:ui-monospace,Menlo,Consolas,monospace;color:#46ff7d;';
    const t = document.createElement('div');
    t.style.cssText = 'font-size:.9rem;letter-spacing:.28em;text-transform:uppercase;opacity:.85';
    t.textContent = 'Flesh Market';
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:.72rem;letter-spacing:.16em;opacity:.45';
    sub.textContent = 'Establishing link';
    const btn = document.createElement('button');
    btn.textContent = 'Log In';
    btn.style.cssText = 'margin-top:10px;cursor:pointer;padding:5px 16px;background:transparent;'
      + 'border:1px solid #1f4515;border-radius:6px;color:#6f8f7a;font-family:inherit;font-size:.76rem;';
    btn.onclick = () => { hideBootVeil(); showLogin(); };
    v.appendChild(t); v.appendChild(sub); v.appendChild(btn);
    document.body.appendChild(v);
  }
  function hideBootVeil() { const n=document.getElementById('fm-boot-veil'); if(n)n.remove(); }

  // ── Guest status bar ───────────────────────────────────────────────────────
  // Permanently visible for the whole trial, and it carries the LOG IN affordance
  // as well as the upgrade one. That second link is not decoration: a returning
  // player who cleared their browser gets auto-guested and this is the only way
  // back to their real account.
  function renderGuestBar() {
    const g = window.FM_GUEST;
    if (!g.active || g.locked) { const o=document.getElementById('fm-guest-bar'); if(o)o.remove(); return; }
    let bar = document.getElementById('fm-guest-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'fm-guest-bar';
      document.body.appendChild(bar);
    }
    // Positioned on EVERY render, not just on creation. The bar sits ABOVE
    // #fmNav rather than under it: the nav is fixed at bottom:0 with z-index
    // 9992 and height var(--fm-nav), so anchoring here at bottom:0 with a lower
    // z-index put the Create Account button behind the nav on every phone.
    // Recomputed each time because body.fm-mobile can be applied after this bar
    // first renders, and a one-shot read would leave the offset permanently
    // wrong for anyone whose mobile class arrived late.
    const navOffset = document.body.classList.contains('fm-mobile')
      ? 'calc(var(--fm-nav, 56px) + env(safe-area-inset-bottom, 0px))'
      : '0px';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:' + navOffset + ';z-index:9993;'
      + 'display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;'
      + 'padding:5px 12px;background:rgba(8,10,8,.94);border-top:1px solid #1f4515;'
      + 'font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;color:#8fae97;';
    const days = g.daysLeft != null ? g.daysLeft : 7;
    bar.innerHTML = '';
    const msg = document.createElement('span');
    msg.textContent = 'Trial account, ' + days + ' day' + (days===1?'':'s') + ' left. Progress is saved in this browser only.';
    const up = document.createElement('button');
    up.textContent = 'Create account';
    up.style.cssText = 'cursor:pointer;padding:2px 12px;background:transparent;border:1px solid #46ff7d;'
      + 'border-radius:4px;color:#46ff7d;font-family:inherit;font-size:.72rem;';
    up.onclick = () => showUpgrade();
    const li = document.createElement('button');
    li.textContent = 'Log in';
    li.style.cssText = 'cursor:pointer;padding:2px 12px;background:transparent;border:1px solid #1f4515;'
      + 'border-radius:4px;color:#6f8f7a;font-family:inherit;font-size:.72rem;';
    li.onclick = () => showLogin();
    bar.appendChild(msg); bar.appendChild(up); bar.appendChild(li);
  }

  // ── Lock screen ────────────────────────────────────────────────────────────
  // Not a wall, a window. The client behind it stays rendered and readable; only
  // the actions are gone, and the server denies them independently.
  function showLockScreen() {
    if (document.getElementById('fm-guest-lock')) return;
    injectStyles();
    const wrap = document.createElement('div');
    wrap.id = 'fm-guest-lock';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(2,4,2,.88);z-index:99990;'
      + 'display:flex;align-items:center;justify-content:center;'
      + 'font-family:ui-monospace,Menlo,Consolas,monospace;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#0a0a08;color:#d4b87a;border:1px solid #1f4515;border-radius:10px;'
      + 'max-width:440px;width:92%;padding:26px 30px;box-shadow:0 16px 48px rgba(0,0,0,.7);';
    const h = document.createElement('h2');
    h.style.cssText = 'margin:0 0 14px;font-size:1rem;letter-spacing:.14em;text-transform:uppercase;'
      + 'color:#46ff7d;border-bottom:1px dashed #3a2a08;padding-bottom:10px;';
    h.textContent = 'Trial ended';
    const body = document.createElement('p');
    body.style.cssText = 'font-size:.82rem;line-height:1.55;opacity:.82;margin:0 0 16px;';
    body.textContent = 'Nothing was deleted. Your credits, holdings, cargo, inventory and level are '
      + 'exactly where you left them. Pick a name and a password and this same account becomes permanent.';
    const btn = document.createElement('button');
    btn.textContent = 'Create permanent account';
    btn.style.cssText = 'cursor:pointer;padding:8px 18px;background:transparent;border:1px solid #46ff7d;'
      + 'border-radius:6px;color:#46ff7d;font-family:inherit;font-size:.88rem;width:100%;';
    btn.onclick = () => showUpgrade();
    const alt = document.createElement('div');
    alt.style.cssText = 'text-align:center;margin-top:12px;font-size:.74rem;opacity:.5;cursor:pointer;';
    alt.textContent = 'Already have an account? Log in';
    alt.onclick = () => showLogin();
    card.appendChild(h); card.appendChild(body); card.appendChild(btn); card.appendChild(alt);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    const gb = document.getElementById('fm-guest-bar'); if (gb) gb.remove();
  }

  // ── Upgrade ────────────────────────────────────────────────────────────────
  // MUST NEVER DEAD-END. Once an account is locked this is the only exit, so
  // every failure re-prompts in place with the session intact. Nothing here
  // clears the token or closes the form on error.
  function showUpgrade() {
    const ui = buildModal('register');
    ui.switchBtn.textContent = (window.t?window.t('auth.logIn','Log In'):'Log In');
    ui.switchBtn.onclick = () => showLogin();
    ui.submitBtn.textContent = 'Claim account';
    setHint(ui.hint, 'Your progress carries over to this name.', 'ok');

    let checkTimer;
    ui.nameInput.addEventListener('input', ()=>{
      clearTimeout(checkTimer);
      const n = ui.nameInput.value.trim();
      if (!n) { ui.hint.textContent=''; return; }
      checkTimer = setTimeout(async ()=>{
        try {
          const r = await fetch('/api/name_available?name='+encodeURIComponent(n));
          const d = await r.json();
          setHint(ui.hint, d.available ? '"'+n+'" is available' : '"'+n+'" is taken', d.available?'ok':'err');
        } catch(e) {}
      }, 380);
    });

    const reset = () => {
      ui.submitBtn.disabled = false;
      ui.submitBtn.textContent = 'Claim account';
    };

    ui.submitBtn.onclick = async () => {
      const name = ui.nameInput.value.trim();
      const pass = ui.passInput.value;
      if (!name) { setHint(ui.hint, 'Pick a name.', 'err'); return; }
      if (!pass || pass.length < 4) { setHint(ui.hint, 'Password must be at least 4 characters.', 'err'); return; }
      ui.submitBtn.disabled = true;
      ui.submitBtn.textContent = '…';
      try {
        const data = await apiPost('/api/guest/upgrade', {token: getToken(), name, password: pass});
        if (data.ok) {
          saveSession(data.token, data.name);
          window.FM_TOKEN = data.token;
          window.FM_GUEST = { active:false, locked:false, expiresAt:null, daysLeft:null };
          syncClaimButton();
          const gb = document.getElementById('fm-guest-bar'); if (gb) gb.remove();
          const lk = document.getElementById('fm-guest-lock'); if (lk) lk.remove();
          closeModal();
          // Reload rather than patch state in place. Every panel that cached a
          // guest flag on boot is now wrong, and a reload is one round trip
          // against a session that is already saved.
          location.reload();
          return;
        }
        // Every branch below leaves the form open with the session intact.
        setHint(ui.hint, data.message || data.error || 'Could not complete. Try again.', 'err');
        reset();
      } catch(e) {
        setHint(ui.hint, 'Server unreachable. Your account is safe, try again.', 'err');
        reset();
      }
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.FM_Auth = {
    logout() { clearSession(); window.FM_TOKEN=null; location.reload(); },
    showLogin, showRegister, showUpgrade, showLockScreen,
    getToken, getName,
    isGuest() { return !!(window.FM_GUEST && window.FM_GUEST.active); },
    isLocked() { return !!(window.FM_GUEST && window.FM_GUEST.locked); },
  };

  // The server seals an account on its own clock, so the client has to be told
  // rather than trusted to notice.
  // Orientation change and resize can flip body.fm-mobile, which moves where the
  // bar has to sit. Cheap to re-render; the bar rebuilds its own children.
  window.addEventListener('resize', () => {
    if (window.FM_GUEST && window.FM_GUEST.active && !window.FM_GUEST.locked) renderGuestBar();
  });

  // 'fm_ws_msg' is the parsed-message bus core.js publishes on (core.js:39).
  document.addEventListener('fm_ws_msg', (e) => {
    const m = e && e.detail;
    if (!m) return;
    if (m.type === 'guest_locked') {
      window.FM_GUEST.locked = true;
      showLockScreen();
    } else if (m.type === 'guest_blocked') {
      // gToast is exported from galaxy.js and may not be loaded yet, so this
      // uses the same defensive chain core.js already uses for clearance denials.
      // Hitting a locked feature is the highest-intent moment there is, so the
      // toast is followed by the upgrade form rather than leaving the player to
      // go find the button themselves.
      const msg = (m.data && m.data.msg) || 'Not available on a trial account.';
      try { (window.gToast || window.toast || alert)(msg); } catch(_) {}
      if (!document.getElementById(WRAP_ID)) setTimeout(() => showUpgrade(), 400);
    }
  });

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
            setGuestState(data);
            emit({name:data.name, token:tok, cash:data.cash, faction:data.faction||null, patreon_tier:data.patreon_tier||0, is_dev:!!(data.is_dev), is_admin:!!(data.is_admin), is_dunced:!!(data.is_dunced), is_prime:!!(data.is_prime), is_guest:!!(data.is_guest), guest_locked:!!(data.guest_locked)});
            return;
          }
        }
      } catch(e) {}
      // Token invalid or server error — clear stale session
      clearSession();
    }

    // No session. Do NOT open a login form: that is the signup wall this feature
    // exists to remove. Start a trial instead, and keep a Log In affordance on
    // screen the whole time for the returning player whose browser was cleared.
    showBootVeil();
    await armGuestCreation();
    if (getToken()) { hideBootVeil(); return; }   // they logged in from the veil
    const g = await createGuest();
    hideBootVeil();
    if (!g) return;                                // createGuest surfaced its own error
    emit({name:g.name, token:g.token, cash:g.cash, faction:null, patreon_tier:0,
          is_dev:false, is_admin:false, is_prime:false, is_guest:true, guest_locked:false});
  }

  boot();
})();
