/**
 * casino-net.js — server-authoritative casino betting client.
 *
 * Replaces the old pattern where each game mutated ME.cash locally and broadcast
 * the new balance via {type:'casino', sync:N} (which the server trusted blindly —
 * an unbounded cash faucet). Games now:
 *
 *   const round = await CasinoNet.bet('blackjack', wager);  // stake deducted server-side
 *   if (!round.ok) { ...insufficient funds / rejected... }
 *   await CasinoNet.addon(round.roundId, extra);            // optional (Double / raises)
 *   await CasinoNet.result(round.roundId, grossPayout);     // 0 on loss; stake+win on win
 *
 * The server is the source of truth for cash. It pushes {type:'me'} / {type:'portfolio'}
 * after every step; core.js applies those to ME.cash and the cash display. Games should
 * treat their local balance reads as display only and let the server push reconcile.
 *
 * `grossPayout` is the total returned to the player: 0 for a loss, or stake + winnings
 * for a win (the stake was already removed at bet time, so returning the gross restores
 * it). The server caps it at wager*mult + flat per game; anything above is clamped and
 * logged for the dev panel.
 */
(function(){
  'use strict';

  const PENDING = new Map();   // reqKey -> {resolve, timer}
  let seq = 0;

  function sock(){
    const w = window.ws && window.ws.readyState === 1 ? window.ws
            : (window._ws && window._ws.readyState === 1 ? window._ws : null);
    return w;
  }

  // Correlate an ack back to its call. The server echoes roundId on addon/result
  // acks; for the initial bet there is no roundId yet, so we serialize bets per
  // game with a short-lived key and match the next matching ack.
  function waitFor(matchFn, timeoutMs){
    return new Promise((resolve)=>{
      const key = 'k' + (++seq);
      const timer = setTimeout(()=>{
        if (PENDING.has(key)) { PENDING.delete(key); resolve({ ok:false, error:'timeout' }); }
      }, timeoutMs || 12000);
      PENDING.set(key, { matchFn, resolve, timer });
    });
  }

  document.addEventListener('fm_ws_msg', (e)=>{
    const m = e && e.detail;
    if (!m || !m.type) return;
    if (m.type !== 'casino_bet_ack' && m.type !== 'casino_addon_ack'
        && m.type !== 'casino_result_ack' && m.type !== 'casino_play_ack'
        && m.type !== 'casino_stale') return;
    for (const [key, entry] of PENDING) {
      let hit = false;
      try { hit = entry.matchFn(m); } catch(_) { hit = false; }
      if (hit) {
        clearTimeout(entry.timer);
        PENDING.delete(key);
        entry.resolve(m.type === 'casino_stale' ? { ok:false, error:'stale', stale:true } : (m.data || {}));
        break;
      }
    }
  });

  function send(obj){
    const w = sock();
    if (!w) return false;
    try { w.send(JSON.stringify(obj)); return true; } catch(_){ return false; }
  }

  const CasinoNet = {
    /**
     * Place a bet. Resolves with { ok, roundId, game, wager, cash } or { ok:false, error }.
     */
    async bet(game, wager){
      const w = Math.round((Number(wager)||0)*100)/100;
      if (!(w > 0)) return { ok:false, error:'Invalid wager.' };
      if (!sock())   return { ok:false, error:'Not connected.' };
      const p = waitFor((m)=> m.type==='casino_bet_ack' || m.type==='casino_stale');
      send({ type:'casino_bet', game, wager:w });
      return p;
    },

    /**
     * Increase the stake on an open round (Blackjack Double, poker calls/raises).
     * Resolves with { ok, roundId, addedWager, totalWager, cash } or { ok:false, error }.
     */
    async addon(roundId, amount){
      const a = Math.round((Number(amount)||0)*100)/100;
      if (!roundId)  return { ok:false, error:'No round.' };
      if (!(a > 0))  return { ok:false, error:'Invalid amount.' };
      if (!sock())   return { ok:false, error:'Not connected.' };
      const p = waitFor((m)=> (m.type==='casino_addon_ack' && (!m.data || m.data.roundId===roundId)) || m.type==='casino_stale');
      send({ type:'casino_bet_addon', roundId, amount:a });
      return p;
    },

    /**
     * Settle an open round. grossPayout = 0 on loss, or stake+winnings on win.
     * Resolves with { ok, credited, clamped, cash } or { ok:false, error }.
     */
    async result(roundId, grossPayout){
      const pay = Math.max(0, Math.round((Number(grossPayout)||0)*100)/100);
      if (!roundId) return { ok:false, error:'No round.' };
      if (!sock())  return { ok:false, error:'Not connected.' };
      const p = waitFor((m)=> (m.type==='casino_result_ack' && (!m.data || m.data.roundId===roundId)) || m.type==='casino_stale');
      send({ type:'casino_result', roundId, payout:pay });
      return p;
    },

    /**
     * One-shot server-authoritative play (roulette, horse races). Sends only the
     * bet SELECTION; the server rolls, prices, and settles atomically. Resolves
     * with { ok, view, credited, clamped, cash } or { ok:false, error, stale }.
     * `view` carries the server's outcome (e.g. { result } / { winner }) for the
     * client to animate toward — the client no longer decides the outcome.
     */
    async play(game, input){
      if (!sock()) return { ok:false, error:'Not connected.' };
      const p = waitFor((m)=> m.type==='casino_play_ack' || m.type==='casino_stale');
      send({ type:'casino_play', game, input });
      return p;
    },
  };

  window.CasinoNet = CasinoNet;
})();
