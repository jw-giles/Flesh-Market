/* FLESH REVENUE SERVICE - player-facing tax panel (1.1.8.0).
   The header button reveals itself only once the FRS is actually assessing
   (frs_settings.enabled). Capital-house money is taxed at withdrawal, handled
   server-side; this panel covers weekly income tax: balance owed, prepay ahead,
   and the next assessment time. No em dashes in any player-visible string. */
(function () {
  let _status = null;
  let _open = false;

  function send(obj) {
    try {
      if (window._ws && window._ws.readyState === 1) window._ws.send(JSON.stringify(obj));
    } catch (_) {}
  }
  function fmtF(n) { return 'Ƒ' + Math.round(Number(n) || 0).toLocaleString(); }
  function fmtPT(ts) {
    if (!ts) return 'not scheduled';
    try {
      return new Date(ts).toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short',
        day: 'numeric', hour: 'numeric', minute: '2-digit'
      }) + ' PT';
    } catch (_) { return new Date(ts).toLocaleString(); }
  }

  function revealBtn(show) {
    const b = document.getElementById('fm-tax-btn');
    if (b) b.style.display = show ? 'inline-flex' : 'none';
  }

  function ensureModal() {
    let m = document.getElementById('fm-tax-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'fm-tax-modal';
    m.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.72);align-items:center;justify-content:center';
    m.innerHTML = `
      <div style="width:min(440px,92vw);max-height:86vh;overflow-y:auto;background:#0c0800;border:1px solid #7a5e1e;border-radius:8px;box-shadow:0 0 40px #00000099,0 0 0 1px #ffce4d11">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #ffce4d22;background:#140d00">
          <span style="color:#ffce4d;font-weight:600;letter-spacing:.06em;font-size:.92rem">🏛 FLESH REVENUE SERVICE</span>
          <span onclick="window.closeTaxPanel&&window.closeTaxPanel()" style="cursor:pointer;color:#888;font-size:1.1rem;padding:0 4px">✕</span>
        </div>
        <div id="fm-tax-body" style="padding:16px;font-size:.82rem;color:#cfcabf;line-height:1.55"></div>
      </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m) closeTaxPanel(); });
    return m;
  }

  function render() {
    const body = document.getElementById('fm-tax-body');
    if (!body) return;
    const d = _status;
    if (!d) { body.innerHTML = '<div style="color:#888">Contacting the FRS...</div>'; return; }

    if (!d.enabled) {
      body.innerHTML = `<div style="color:#9a948a">The FRS is not currently assessing income. There is nothing to pay.</div>`;
      return;
    }

    const owed = Number(d.owed) || 0;
    const prepaid = Number(d.prepaid) || 0;
    const lossCredit = Number(d.lossCredit) || 0;
    const gain = Number(d.pendingGain) || 0;
    const est = Number(d.estTaxThisCycle) || 0;

    const row = (label, value, color) =>
      `<div style="display:flex;justify-content:space-between;padding:3px 0"><span style="color:#8a857b">${label}</span><span style="color:${color || '#cfcabf'}">${value}</span></div>`;

    body.innerHTML = `
      <div style="background:#080500;border:1px solid #ffce4d18;border-radius:6px;padding:10px 12px;margin-bottom:12px">
        ${row('Next assessment', fmtPT(d.nextDue), '#ffce4d')}
        ${row('Income tax rate', ((d.rateBps || 0) / 100).toFixed(2) + '%')}
        ${row('Capital house withdrawal tax', ((d.withdrawTaxBps || 0) / 100).toFixed(2) + '%')}
      </div>

      <div style="margin-bottom:6px;color:#8a857b;font-size:.74rem;letter-spacing:.05em">THIS CYCLE</div>
      <div style="background:#080500;border:1px solid #ffce4d18;border-radius:6px;padding:10px 12px;margin-bottom:12px">
        ${row('Taxable net worth', fmtF(d.taxableNetWorth))}
        ${row('Gain since last assessment', (gain >= 0 ? '+' : '') + fmtF(gain), gain >= 0 ? '#86ff6a' : '#ff8a8a')}
        ${row('Estimated tax at next run', fmtF(est), '#ffce4d')}
        ${lossCredit > 0 ? row('Loss credit carried', fmtF(lossCredit), '#7fc090') : ''}
      </div>

      <div style="margin-bottom:6px;color:#8a857b;font-size:.74rem;letter-spacing:.05em">BALANCE</div>
      <div style="background:#080500;border:1px solid ${owed > 0 ? '#8a3a3a55' : '#ffce4d18'};border-radius:6px;padding:10px 12px;margin-bottom:10px">
        ${row('Outstanding balance', fmtF(owed), owed > 0 ? '#ff8a8a' : '#86ff6a')}
        ${prepaid > 0 ? row('Prepaid credit', fmtF(prepaid), '#7fc090') : ''}
      </div>

      ${owed > 0 ? `
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <input id="fm-tax-pay-amt" type="number" min="1" placeholder="Amount to pay" style="flex:1;padding:6px 8px;background:#0a0700;border:1px solid #3a3320;border-radius:4px;color:#fff;font-size:.82rem">
        <button onclick="window.taxPay&&window.taxPay()" style="padding:6px 14px;border:1px solid #3a8a3a;border-radius:4px;background:#0a1808;color:#86ff6a;cursor:pointer;font-size:.82rem">Pay</button>
        <button onclick="window.taxPayAll&&window.taxPayAll()" style="padding:6px 10px;border:1px solid #7a5e1e;border-radius:4px;background:#140d00;color:#ffce4d;cursor:pointer;font-size:.78rem">All</button>
      </div>` : ''}

      <div style="margin-bottom:6px;color:#8a857b;font-size:.74rem;letter-spacing:.05em">PAY AHEAD</div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:9px 12px;margin-bottom:8px;border-radius:6px;border:1px solid #3a8a3a44;background:#06120a">
        <span style="color:#7fc090;font-size:.74rem;letter-spacing:.03em">FRS prepaid balance</span>
        <span style="color:#86ff6a;font-size:1.05rem;font-weight:700;font-family:ui-monospace,monospace">${fmtF(prepaid)}</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <input id="fm-tax-prepay-amt" type="number" min="1" placeholder="Prepay amount" style="flex:1;padding:6px 8px;background:#0a0700;border:1px solid #3a3320;border-radius:4px;color:#fff;font-size:.82rem">
        <button onclick="window.taxPrepay&&window.taxPrepay()" style="padding:6px 14px;border:1px solid #7a5e1e;border-radius:4px;background:#140d00;color:#ffce4d;cursor:pointer;font-size:.82rem">Prepay</button>
      </div>
      <div style="color:#6f6a60;font-size:.72rem">This balance sits with the FRS like a deposit account and is drawn down by future weekly assessments before any of your cash is taken. Money held inside a capital house is taxed only when you withdraw it.</div>
    `;
  }

  window.openTaxPanel = function () {
    ensureModal().style.display = 'flex';
    _open = true;
    render();
    send({ type: 'tax_status' });
  };
  window.closeTaxPanel = function () {
    const m = document.getElementById('fm-tax-modal');
    if (m) m.style.display = 'none';
    _open = false;
  };
  window.taxPay = function () {
    const v = Math.floor(Number(document.getElementById('fm-tax-pay-amt')?.value) || 0);
    if (v > 0) send({ type: 'pay_tax', amount: v });
  };
  window.taxPayAll = function () {
    if (_status && Number(_status.owed) > 0) send({ type: 'pay_tax', amount: Math.ceil(Number(_status.owed)) });
  };
  window.taxPrepay = function () {
    const v = Math.floor(Number(document.getElementById('fm-tax-prepay-amt')?.value) || 0);
    if (v > 0) send({ type: 'prepay_tax', amount: v });
  };

  document.addEventListener('fm_ws_msg', (e) => {
    const msg = e.detail; if (!msg) return;
    if (msg.type === 'tax_status') {
      _status = msg.data || null;
      revealBtn(!!(_status && _status.enabled));
      if (_open) render();
    }
    if (msg.type === 'frs_settings') {
      revealBtn(!!msg.data.enabled);
      if (_open) send({ type: 'tax_status' });
    }
    if (msg.type === 'frs_tax') {
      // An assessment just hit this player; refresh the panel if it is open.
      if (_open) send({ type: 'tax_status' });
    }
  });

  // On login, quietly ask the FRS whether it is operating so the button can appear.
  document.addEventListener('fm:authed', () => { send({ type: 'tax_status' }); });
  // Also probe shortly after load in case auth fired before this script registered.
  setTimeout(() => { send({ type: 'tax_status' }); }, 2500);
})();
