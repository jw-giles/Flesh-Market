// Per-connection rate limiting (1.6.1.0).
//
// The websocket dispatcher had no budget of any kind: a socket could send any
// message as fast as it could write. Most handlers are cheap enough that this
// never showed, but city_data_request resolves every storefront in every
// district of a colony through an eight pass spill loop, and a capital runs
// into the thousands of firms. One socket in a loop was a real CPU sink.
//
// Two buckets rather than one, because the handlers are not equally expensive
// and a single limit tight enough for the heavy ones would throttle ordinary
// play. Refill is by elapsed time, so an idle connection keeps its full burst
// and a client that batches on open is not punished for it.
//
// Dropping is deliberate over disconnecting. A legitimate client that trips
// this is bursting, not attacking; losing one frame is recoverable, losing the
// socket is not.

export const RL = {
  RATE: 30, BURST: 90,          // all message types, per second and ceiling
  HEAVY_RATE: 3, HEAVY_BURST: 12,
  NOTICE_MS: 5000,              // at most one notice per socket per this
};

// Anything that walks the shop tables or rebuilds a full snapshot. The city
// mutations are in here too: each one ends in cityFullData plus a broadcast to
// every client watching that colony, so the cost is not paid by the sender.
export const HEAVY_TYPES = new Set([
  'city_data_request', 'city_summaries_request', 'galaxy_data_request',
  'portfolio_request',
  'city_buy_seat', 'city_invest', 'city_works', 'city_set_levers',
  'city_set_cut', 'city_set_favoured', 'city_rename_district',
  'city_lease_shop', 'city_buy_shop', 'city_rename_shop', 'city_close_shop',
  'city_petition', 'city_stock',
]);

// `ping` is a keepalive on a timer. Throttling it would look like a dead
// connection to the health check, which is worse than the thing being guarded.
export const EXEMPT_TYPES = new Set(['ping']);

function take(b, rate, burst, now) {
  b.t = Math.min(burst, b.t + ((now - b.at) / 1000) * rate);
  b.at = now;
  if (b.t < 1) return false;
  b.t -= 1;
  return true;
}

export function newBuckets(now) {
  const t = Number(now) || Date.now();
  return { g: { t: RL.BURST, at: t }, h: { t: RL.HEAVY_BURST, at: t }, warn: 0 };
}

// Returns { ok, notify }. notify is true at most once per NOTICE_MS so a
// client stuck in a loop gets told once rather than flooded back.
export function checkRate(state, type, now) {
  const t = Number(now) || Date.now();
  if (EXEMPT_TYPES.has(type)) return { ok: true, notify: false };
  let ok = take(state.g, RL.RATE, RL.BURST, t);
  if (ok && HEAVY_TYPES.has(type)) ok = take(state.h, RL.HEAVY_RATE, RL.HEAVY_BURST, t);
  if (ok) return { ok: true, notify: false };
  const notify = t - (state.warn || 0) > RL.NOTICE_MS;
  if (notify) state.warn = t;
  return { ok: false, notify };
}
