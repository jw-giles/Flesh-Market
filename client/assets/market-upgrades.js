// Market Upgrades panel: buy SMA / extended history / auto-accumulate, and
// configure per-symbol auto-accumulate (segregated reserve). Server-authoritative;
// this is just the control surface. Renders from window.FM_* state set in core.js.
(function () {
  'use strict';

  function send(o) {
    try {
      if (typeof sendWS === 'function') sendWS(o);
      else if (window.ws && window.ws.readyState === 1) window.ws.send(JSON.stringify(o));
    } catch (e) {}
  }
  function fmtF(n) { return 'Ƒ' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function owns(id) { return !!(window.FM_MARKET_UPGRADES && window.FM_MARKET_UPGRADES.has && window.FM_MARKET_UPGRADES.has(id)); }

  function ensureUI() {
    var host = document.getElementById('marketTab');
    if (!host) return false;
    if (document.getElementById('marketUpgradesPanel')) return true;
    var panel = document.createElement('div');
    panel.id = 'marketUpgradesPanel';
    panel.style.cssText = 'margin-top:6px;padding:8px;border:1px solid #0a3315;border-radius:6px;background:#050403';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5">'+(window.t?window.t('mu.title','Market Upgrades'):'Market Upgrades')+'</div>' +
        '<button class="btn" id="muRefresh" style="font-size:.7rem;margin-left:auto;padding:2px 8px" title="Refresh">↻</button>' +
      '</div><div id="muBody"></div>';
    host.appendChild(panel);
    var r = document.getElementById('muRefresh');
    if (r) r.addEventListener('click', function () { send({ type: 'market_upgrades_list' }); send({ type: 'auto_accum_get' }); });
    return true;
  }

  function render() {
    if (!ensureUI()) return;
    var body = document.getElementById('muBody');
    if (!body) return;
    var cat = window.FM_MARKET_CATALOG || [];
    var html = '<div style="display:flex;flex-direction:column;gap:5px">';
    if (!cat.length) html += '<div class="muted" style="font-size:.78rem;opacity:.5">'+(window.t?window.t('mu.loading','Loading…'):'Loading…')+'</div>';
    cat.forEach(function (u) {
      var ownedU = u.owned || owns(u.id);
      html +=
        '<div style="display:flex;align-items:center;gap:8px;padding:5px;border:1px solid #0a2510;border-radius:5px">' +
          '<div style="flex:1">' +
            '<div style="color:#86ff6a;font-size:.82rem">' + (window.upgradeNameZh?window.upgradeNameZh(u.id,u.name):u.name) + '</div>' +
            '<div class="muted" style="font-size:.72rem;opacity:.6">' + (window.upgradeDescZh?window.upgradeDescZh(u.id,u.desc):u.desc) + '</div>' +
          '</div>' +
          (ownedU
            ? '<span style="color:#d4b87a;font-size:.75rem;letter-spacing:.08em">'+(window.t?window.t('mu.owned','OWNED'):'OWNED')+'</span>'
            : '<button class="btn muBuy" data-id="' + u.id + '" style="font-size:.78rem;white-space:nowrap">' + fmtF(u.price) + '</button>') +
        '</div>';
    });
    html += '</div>';

    if (owns('auto_accumulate')) {
      var aa = window.FM_AUTO_ACCUM || { configs: [] };
      var cfgs = aa.configs || [];
      html +=
        '<div style="margin-top:10px;border-top:1px solid #0a2510;padding-top:8px">' +
          '<div style="font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;opacity:.5;margin-bottom:6px">'+(window.t?window.t('mu.autoAccumulate','Auto-Accumulate'):'Auto-Accumulate')+'</div>' +
          '<div class="muted" style="font-size:.72rem;opacity:.6;margin-bottom:6px">Set aside cash as a per-symbol reserve. When a held position drops below your average cost, auto-buys spend from that reserve, not your spendable cash. Fund or withdraw the reserve any time. Runs while you are connected.</div>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px">' +
            '<input id="muSym" class="input" placeholder="Symbol" maxlength="5" style="max-width:80px"/>' +
            '<input id="muDrop" class="input" type="number" min="0.1" step="0.1" value="5" title="% below your average cost" style="max-width:96px"/>' +
            '<input id="muClip" class="input" type="number" min="0" step="1000" placeholder="Ƒ per buy" title="Cash spent per auto-buy" style="max-width:110px"/>' +
            '<button class="btn" id="muSave" style="font-size:.78rem">Set / Arm</button>' +
          '</div>';
      if (cfgs.length) {
        html += '<div style="display:flex;flex-direction:column;gap:5px">';
        cfgs.forEach(function (c) {
          html +=
            '<div style="padding:5px;border:1px solid #0a2510;border-radius:5px;font-size:.76rem">' +
              '<div style="display:flex;align-items:center;gap:6px">' +
                '<b style="color:#86ff6a">' + c.symbol + '</b>' +
                '<span style="color:' + (c.enabled ? '#86ff6a' : '#777') + '">' + (c.enabled ? 'ARMED' : 'paused') + '</span>' +
                '<span class="muted" style="opacity:.6">−' + (c.drop_bps / 100).toFixed(1) + '% · ' + fmtF(c.clip_c / 100) + '/buy</span>' +
                '<span style="margin-left:auto;color:#d4b87a">reserve ' + fmtF(c.reserve_c / 100) + '</span>' +
              '</div>' +
              '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:5px">' +
                '<input class="input muAmt" data-sym="' + c.symbol + '" type="number" min="0" placeholder="Ƒ amount" style="max-width:100px"/>' +
                '<button class="btn muFund" data-sym="' + c.symbol + '" style="font-size:.74rem">Fund</button>' +
                '<button class="btn muWdr" data-sym="' + c.symbol + '" style="font-size:.74rem">Withdraw</button>' +
                '<button class="btn muToggle" data-sym="' + c.symbol + '" data-en="' + (c.enabled ? 0 : 1) + '" data-drop="' + c.drop_bps + '" data-clip="' + c.clip_c + '" style="font-size:.74rem">' + (c.enabled ? 'Pause' : 'Arm') + '</button>' +
                '<button class="btn muCancel" data-sym="' + c.symbol + '" data-res="' + c.reserve_c + '" style="font-size:.74rem;color:#e06b5a;border-color:#5a2a2a">Cancel</button>' +
              '</div>' +
            '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    body.innerHTML = html;

    body.querySelectorAll('.muBuy').forEach(function (b) {
      b.addEventListener('click', function () { send({ type: 'market_upgrade_buy', upgradeId: b.getAttribute('data-id') }); });
    });
    var saveBtn = document.getElementById('muSave');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      var sym = (document.getElementById('muSym').value || '').toUpperCase().trim();
      var drop = parseFloat(document.getElementById('muDrop').value) || 5;
      var clip = parseFloat(document.getElementById('muClip').value) || 0;
      if (!sym || clip <= 0) return;
      send({ type: 'auto_accum_set', symbol: sym, enabled: true, dropPct: drop, clipCash: clip });
    });
    body.querySelectorAll('.muFund').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-sym');
        var inp = body.querySelector('.muAmt[data-sym="' + s + '"]');
        var amt = parseFloat(inp && inp.value) || 0;
        if (amt > 0) send({ type: 'auto_accum_fund', symbol: s, amount: amt });
      });
    });
    body.querySelectorAll('.muWdr').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-sym');
        var inp = body.querySelector('.muAmt[data-sym="' + s + '"]');
        var amt = parseFloat(inp && inp.value) || 0;
        if (amt > 0) send({ type: 'auto_accum_withdraw', symbol: s, amount: amt });
      });
    });
    body.querySelectorAll('.muToggle').forEach(function (b) {
      b.addEventListener('click', function () {
        send({
          type: 'auto_accum_set',
          symbol: b.getAttribute('data-sym'),
          enabled: b.getAttribute('data-en') === '1',
          dropPct: (parseInt(b.getAttribute('data-drop'), 10) || 500) / 100,
          clipCash: (parseInt(b.getAttribute('data-clip'), 10) || 0) / 100
        });
      });
    });
    body.querySelectorAll('.muCancel').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-sym');
        var res = (parseInt(b.getAttribute('data-res'), 10) || 0) / 100;
        var prompt = res > 0
          ? 'Cancel auto-accumulate on ' + s + '? Its reserve of ' + fmtF(res) + ' is released back to your spendable cash.'
          : 'Cancel auto-accumulate on ' + s + '?';
        if (window.confirm(prompt)) send({ type: 'auto_accum_cancel', symbol: s });
      });
    });
  }

  window.FMUpgradesRender = render;
  function boot() { try { render(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  setTimeout(boot, 1500);
})();
