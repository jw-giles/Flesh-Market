// Trial accounts (v1.4.0.0).
//
// A first-time visitor gets a playable account without a signup form. It runs
// for seven days and then LOCKS. It is never deleted. Locking rather than
// deleting is the whole design and it is worth writing down why:
//
//   1. There are 69 tables and around forty of them carry a player id. There has
//      never been a deletePlayer in this codebase. A correct cascade is forty
//      hand-written statements running unattended against production, and one
//      wrong WHERE takes real accounts with no undo short of the cron backup.
//      Low probability, unrecoverable severity. Same reasoning as the portrait
//      sweep floor.
//   2. A dead row costs a few KB. Ten thousand of them is nothing to SQLite.
//   3. Deletion makes day seven a loss. A lock makes it the pitch: the portfolio
//      is still there, behind glass, and a name and a password opens it.
//
// The upgrade is an UPDATE on the same row, so nothing migrates and nothing can
// half-migrate. See upgradeGuestSync in db.js.

import { randomBytes } from 'crypto';

// ─── Window ───────────────────────────────────────────────────────────────────
// From creation, not from last_seen. A sliding window means a guest can play
// forever without ever converting, which removes the only pressure the feature
// exists to create.
export const GUEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Chat is the social core, so guests are not locked out of it, but an account
// that costs nothing to create plus an open chat box is a raid vector. A short
// session-time floor is a cost, not a wall.
export const GUEST_CHAT_UNLOCK_MS = 15 * 60 * 1000;

// Per-message cooldown on top of the unlock. These defend different things and
// neither replaces the other: the unlock stops a throwaway account being made
// FOR one message, this stops an account that cleared the unlock from flooding.
// The global chatAllowed() limiter is 500ms with a 6-in-3s burst, which is a
// typing-speed guard, not a spam guard.
export const GUEST_CHAT_COOLDOWN_MS = 90 * 1000;

// Keyed by player id, in memory. A restart forgiving a cooldown is fine; this is
// friction, not an invariant. Entries are pruned rather than left to grow, since
// nothing else ever removes a guest id from a map.
const _guestChatLast = new Map();

export function guestChatCooldownLeft(playerId, now) {
  const t = Number(now) || Date.now();
  const last = _guestChatLast.get(playerId) || 0;
  return Math.max(0, GUEST_CHAT_COOLDOWN_MS - (t - last));
}
export function noteGuestChat(playerId, now) {
  _guestChatLast.set(playerId, Number(now) || Date.now());
  // Opportunistic prune. Anything older than the cooldown cannot affect a
  // decision, so holding it is pure growth.
  if (_guestChatLast.size > 500) {
    const cut = (Number(now) || Date.now()) - GUEST_CHAT_COOLDOWN_MS;
    for (const [k, v] of _guestChatLast) if (v < cut) _guestChatLast.delete(k);
  }
}

// Creation is IP limited. Does not stop a VPN. Does stop incognito-window spam,
// which is most of it.
export const GUEST_IP_LIMIT   = 3;
export const GUEST_IP_WINDOW_MS = 24 * 60 * 60 * 1000;

// ─── Names ────────────────────────────────────────────────────────────────────
// Guests never choose a name. They get one out of a reserved namespace, which
// means a trial can never squat a good name, nothing has to be freed when an
// account locks, and picking a real name becomes part of the upgrade.
export const GUEST_NAME_PREFIX = 'Drifter-';
export const GUEST_NAME_RE     = /^Drifter-[0-9A-F]{4}$/i;

export function isReservedGuestName(name) {
  return GUEST_NAME_RE.test(String(name || '').trim());
}

// exists() is injected so this module never imports db.js; it is called with
// db.guestNameExists. Sixteen bits is a small space, so this retries rather than
// trusting the first draw, and falls back to a wider suffix if it somehow
// exhausts. Returns null only if even that fails, and the caller must handle it.
export function generateGuestName(exists, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const n = GUEST_NAME_PREFIX + randomBytes(2).toString('hex').toUpperCase();
    if (!exists(n)) return n;
  }
  for (let i = 0; i < 10; i++) {
    const n = GUEST_NAME_PREFIX + randomBytes(4).toString('hex').toUpperCase();
    if (!exists(n)) return n;
  }
  return null;
}

// ─── State ────────────────────────────────────────────────────────────────────
// guest_locked is the authority, not the clock. The sweep sets it after the
// settlement pass has actually run, so an account can never read as unlocked
// while its shorts are still open, and a clock skew cannot un-settle anything.
export function guestState(player) {
  if (!player || !player.isGuest) {
    return { isGuest: false, locked: false, expiresAt: null, msLeft: null, daysLeft: null };
  }
  const created  = Number(player.guestCreatedAt || player.createdAt || Date.now());
  const expires  = created + GUEST_WINDOW_MS;
  const msLeft   = Math.max(0, expires - Date.now());
  return {
    isGuest: true,
    locked: !!player.guestLocked,
    expiresAt: expires,
    msLeft,
    daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
  };
}

export function guestCanChat(player, sessionMs) {
  if (!player || !player.isGuest) return true;
  if (player.guestLocked) return false;
  return Number(sessionMs || 0) >= GUEST_CHAT_UNLOCK_MS;
}

// ─── Blocked actions ──────────────────────────────────────────────────────────
// The rule these were picked by: block anything whose row outlives the account
// or creates an obligation to another player. Everything else is the demo and a
// guest should get the real version of it.
//
// Not listed, therefore allowed: stocks, shorts, commodities, cargo, casino,
// mining, quests, tutorial, inventory, codec, chat, and every read.
// Every name below was taken from the live dispatcher, not from memory. If a
// type is renamed, this set silently stops covering it, so tools/guest-check.mjs
// asserts every entry still exists in server.js.
export const GUEST_BLOCKED_TYPES = new Set([
  // The wire. canSendValue blocks the money independently; this stops the action
  // being started at all, so the guest reads a clean explanation instead of a
  // clearance denial that looks like a bug.
  'transfer',
  // Lane shares are a limited slot supply, one per player. A locked guest holding
  // one holds it against every live player forever.
  'share_buy', 'share_sell', 'share_swap',
  // Ƒbay and the title market: a listing is an obligation to a buyer and outlives
  // the seller.
  'tcg_list_card', 'tcg_cancel_card_listing', 'tcg_buy_card',
  'list_title', 'cancel_title_listing', 'buy_title_listing',
  // Cities: mayoral office is a permanent world object with a named holder.
  'city_buy_seat', 'city_invest', 'city_works', 'city_set_levers',
  'city_set_cut', 'city_set_favoured', 'city_lease_shop', 'city_buy_shop',
  'city_close_shop', 'city_rename_district', 'city_rename_shop', 'city_stock',
  'city_petition',
  // Council: seats, accords and the chamber record.
  'council_post',
  // War layer: cash converted into permanent world state, and the presidency.
  'blockade_fund', 'counter_blockade', 'private_army', 'buy_president',
  // Standing automation that would keep firing inside a locked account.
  'auto_accum_set', 'auto_accum_fund', 'auto_accum_cancel', 'auto_accum_withdraw',
  // Belt on top of the existing privilege checks. A guest is never a dev, but
  // the cost of listing these is zero.
  'god_cmd', 'admin_cmd',
]);

// REST paths a guest may not touch. Prefix match. Capital Houses are membership,
// and the Ƒbay routes create cross-player obligations, same reasoning as above.
export const GUEST_BLOCKED_PATHS = [
  '/api/fund', '/api/funds',
  '/api/items/market',
  '/api/warehouse',
  '/api/council',
  '/api/patreon',
  // Portraits are identity, and identity on a throwaway account is how you
  // impersonate someone. Held back until the account is real.
  '/api/portrait',
];

// Fleshbook needs a finer cut than a prefix, because READING it is most of the
// value of the trial and only WRITING to it is the problem. Exact paths, so a
// new fleshbook route is not silently covered or silently missed; guest-check
// asserts each one still exists.
export const GUEST_BLOCKED_EXACT = [
  '/api/fleshbook/post',
  '/api/fleshbook/reply',
  '/api/fleshbook/edit',
  '/api/fleshbook/pin',
  '/api/fleshbook/delete',
];

export function guestBlocksPath(path) {
  const p = String(path || '');
  if (GUEST_BLOCKED_EXACT.includes(p)) return true;
  return GUEST_BLOCKED_PATHS.some(pre => p.startsWith(pre));
}

export function guestBlocks(type) {
  return GUEST_BLOCKED_TYPES.has(type);
}

// When locked, deny by default and allow a small read set. Deny-by-default is
// the right failure direction here: an unlisted read makes a panel look empty,
// an unlisted write would let a locked account act.
export const GUEST_LOCKED_ALLOW = new Set([
  'ping', 'request_state', 'portfolio_request', 'galaxy_data_request',
  'city_summaries_request', 'city_data_request', 'chart', 'cycle_history',
  'get_titles', 'title_listings', 'index_listings', 'tcg_collection',
  'clearance_status', 'tax_status', 'get_quest_state', 'get_president_state',
  'share_status', 'shipping_status', 'smuggling_status', 'fund_request',
  'trade_config_request', 'market_upgrades_list', 'mining_upgrades_list',
  'mining_ships_list', 'mining_leaderboard',
]);

export function lockedAllows(type) {
  return GUEST_LOCKED_ALLOW.has(type);
}

// ─── Settlement ───────────────────────────────────────────────────────────────
// Runs ONCE, at lock, before guest_locked is set.
//
// It settles only what can LOSE value while nobody is home. In-flight cargo,
// shipping contracts and mining runs are deliberately left alone: they resolve
// on their own server-side timers into the account, and money landing in a
// frozen account is fine because it is still there at upgrade. The lock stops
// the player from acting, not the world from paying out.
//
// Shorts are the exception and the reason this function exists. An open short in
// an account nobody can log into rides to a margin call and wipes the portfolio
// that the upgrade prompt is promising back. Limit orders go too, because their
// reserved cash is escrowed and a firing order in a frozen account is confusing
// for no gain.
//
// deps is injected rather than imported so this file has no cycle with server.js
// and can be reasoned about on its own.
export function settleGuestAccount(player, deps) {
  const {
    priceMap, toCents, safeAddCash, savePlayer,
    getPlayerOrders, deleteLimitOrder, TRADE_TAX_BPS, onTax,
  } = deps;

  const report = { shortsClosed: [], ordersCancelled: 0, cashReturned: 0, coverCost: 0 };
  if (!player) return report;

  // 1. Cancel limit orders and return escrowed cash. Mirrors the cancel_limit
  //    handler exactly: only buy side reserves.
  try {
    for (const o of getPlayerOrders(player.id) || []) {
      if (o.side === 'buy' && o.reservedCash > 0) {
        safeAddCash(player, o.reservedCash);
        report.cashReturned += o.reservedCash;
      }
      try { deleteLimitOrder(o.id); } catch(_) {}
      report.ordersCancelled++;
    }
  } catch(e) { console.error('[Guest] order settle failed', e.message); }

  // 2. Close every short at market. This is a benign close, not a margin call:
  //    the locked collateral comes back, the cover is paid, and whatever is left
  //    is left. It can realise a loss. That is honest, because the alternative
  //    is the position riding unattended into a forced liquidation.
  try {
    for (const [sym, qty] of Object.entries({ ...(player.holdings || {}) })) {
      if (!qty || qty >= 0) continue;
      const px = priceMap[sym];
      if (px == null) continue;                 // delisted; leave it rather than guess
      const shortQty  = Math.abs(qty);
      const coverC    = toCents(px) * shortQty;
      const taxC      = Math.floor(coverC * TRADE_TAX_BPS / 10000);
      const collC     = (player.shortCollC || {})[sym] || 0;
      const netC      = collC - coverC - taxC;  // may be negative
      try { onTax(taxC / 100); } catch(_) {}
      delete player.holdings[sym];
      if (player.basisC)     delete player.basisC[sym];
      if (player.shortCollC) delete player.shortCollC[sym];
      safeAddCash(player, netC / 100);
      report.shortsClosed.push(sym);
      report.coverCost += coverC / 100;
    }
  } catch(e) { console.error('[Guest] short settle failed', e.message); }

  // Cash floor. A short that moved hard against a guest can compute negative,
  // and a locked account holding negative cash greets the upgrade with a debt
  // it cannot trade out of.
  if (!(player.cash > 0)) player.cash = 0;

  try { savePlayer(player); } catch(e) { console.error('[Guest] save failed', e.message); }
  return report;
}
