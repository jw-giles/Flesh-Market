/**
 * db.js — FleshMarket SQLite persistence layer v2
 * Uses node:sqlite (built into Node.js 22.5+/24). Zero native deps.
 *
 * Patreon tiers:
 *   0 = Free
 *   1 = Premium      ($5/mo)  — +100 every 30min, name badge
 *   2 = Merchants Guild ($15/mo) — +1500 every 30min, custom chat, hedge fund
 *   3 = CEO          ($100/mo) — +10000 every 30min, no transfer fees, all perks
 */

import { DatabaseSync } from 'node:sqlite';
import { pbkdf2Sync, randomBytes } from 'crypto';
import path from 'path';
import url  from 'url';
import { initTcg } from './tcg/tcg-db.js';
import { initCityDb } from './db_city.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH   = process.env.DB_PATH || path.join(__dirname, 'fleshmarket.db');

let db;
const S = {};

function stmt(sql) {
  if (!S[sql]) S[sql] = db.prepare(sql);
  return S[sql];
}

function transaction(fn) {
  return function(...args) {
    db.exec('BEGIN');
    try { const r = fn(...args); db.exec('COMMIT'); return r; }
    catch(e) { try { db.exec('ROLLBACK'); } catch(_){} throw e; }
  };
}

// ─── Tier config (single source of truth) ─────────────────────────────────────

export const TIERS = {
  0: { name: 'Free',            badge: null,       chatColor: null,      incomeEvery30: 25,        transferFee: true  },
  1: { name: 'Premium',         badge: '\u2605',   chatColor: null,      incomeEvery30: 500,       transferFee: true  },
  2: { name: 'Merchants Guild', badge: '\u2696',   chatColor: '#2ecc71', incomeEvery30: 1500,      transferFee: true  },
  3: { name: 'CEO',             badge: '\u265b',   chatColor: '#ffd700', incomeEvery30: 10000,     transferFee: false },
};
// Dev passive income — applied separately in creditPassiveIncome
export const DEV_INCOME_EVERY30 = 10_000_000; // ₥10M per reset
export const CEO_MAX = 10;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initDB() {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash     TEXT NOT NULL,
      password_salt     TEXT NOT NULL,
      cash              REAL    NOT NULL DEFAULT 1000,
      xp                INTEGER NOT NULL DEFAULT 0,
      level             INTEGER NOT NULL DEFAULT 1,
      title             TEXT,
      badges            TEXT    NOT NULL DEFAULT '[]',
      patreon_tier      INTEGER NOT NULL DEFAULT 0,
      patreon_email     TEXT,
      patreon_member_id TEXT,
      patreon_expires_at INTEGER,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      last_seen         INTEGER,
      is_prime          INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS holdings (
      player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      symbol    TEXT    NOT NULL,
      qty       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, symbol)
    );
    CREATE TABLE IF NOT EXISTS basis (
      player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      symbol    TEXT    NOT NULL,
      basis_c   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, symbol)
    );
    -- Locked short collateral (cents) per symbol. Holds the proceeds of a short that
    -- were withheld from spendable cash (collateral model). Absent / 0 for shorts opened
    -- before the collateral model, whose proceeds are already in cash - this grandfathers
    -- legacy positions with no migration and no net-worth double-count.
    CREATE TABLE IF NOT EXISTS short_coll (
      player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      symbol    TEXT    NOT NULL,
      coll_c    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, symbol)
    );
    -- Active margin calls. One per player: the deadline by which they must cover (or have
    -- the position recover) or be liquidated. Persisted so the clock survives restarts and
    -- logoff - otherwise logging off would freeze or dodge the timer.
    CREATE TABLE IF NOT EXISTS margin_calls (
      player_id TEXT    PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      symbol    TEXT    NOT NULL,
      called_at INTEGER NOT NULL,
      deadline  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS net_worth_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      net_worth REAL NOT NULL,
      cash      REAL NOT NULL,
      equity    REAL NOT NULL,
      ts        INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fund_nav_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id     TEXT NOT NULL,
      nav         REAL NOT NULL,
      spp         REAL NOT NULL,
      total_shares REAL NOT NULL,
      ts          INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      k       TEXT NOT NULL,
      ts      INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chatlog_k_id ON chat_log(k, id);
    CREATE INDEX IF NOT EXISTS idx_nwh_player_ts ON net_worth_history(player_id, ts);
    CREATE INDEX IF NOT EXISTS idx_fnh_fund_ts ON fund_nav_history(fund_id, ts);
    CREATE INDEX IF NOT EXISTS idx_players_patreon_email ON players(patreon_email);
    CREATE INDEX IF NOT EXISTS idx_players_patreon_member ON players(patreon_member_id);
    CREATE TABLE IF NOT EXISTS pending_pledges (
      member_id  TEXT PRIMARY KEY,
      email      TEXT,
      tier       INTEGER NOT NULL,
      expires_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pending_pledges_email ON pending_pledges(email);
    CREATE TABLE IF NOT EXISTS price_cycles (
      company_id  INTEGER NOT NULL,
      cycle_ts    INTEGER NOT NULL,
      symbol      TEXT,
      start_price REAL NOT NULL,
      end_price   REAL NOT NULL,
      PRIMARY KEY (company_id, cycle_ts)
    );
    CREATE INDEX IF NOT EXISTS idx_price_cycles_ts ON price_cycles(cycle_ts);
    CREATE TABLE IF NOT EXISTS colony_state (
      id                  TEXT PRIMARY KEY,
      faction             TEXT NOT NULL DEFAULT 'coalition',
      control_coalition   INTEGER NOT NULL DEFAULT 0,
      control_syndicate   INTEGER NOT NULL DEFAULT 0,
      control_void        INTEGER NOT NULL DEFAULT 0,
      control_guild       INTEGER NOT NULL DEFAULT 0,
      tension             INTEGER NOT NULL DEFAULT 0,
      contested           INTEGER NOT NULL DEFAULT 0,
      conquest_faction    TEXT,
      conquest_timer      INTEGER,
      war_chest           REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS faction_funding (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      colony_id  TEXT NOT NULL,
      faction_id TEXT NOT NULL,
      amount     REAL NOT NULL,
      ts         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ff_colony ON faction_funding(colony_id, faction_id);
    CREATE INDEX IF NOT EXISTS idx_ff_player ON faction_funding(player_id);
    CREATE TABLE IF NOT EXISTS war_fund_pool (
      colony_id  TEXT NOT NULL,
      faction_id TEXT NOT NULL,
      pending    REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (colony_id, faction_id)
    );
    CREATE TABLE IF NOT EXISTS lane_shares (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      lane_key      TEXT NOT NULL,
      slot_number   INTEGER NOT NULL,
      holder_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      holder_name   TEXT NOT NULL DEFAULT '',
      purchase_price REAL NOT NULL DEFAULT 0,
      purchased_at  INTEGER NOT NULL,
      dividends_earned REAL NOT NULL DEFAULT 0,
      UNIQUE(lane_key, slot_number)
    );
    CREATE INDEX IF NOT EXISTS idx_ls_holder ON lane_shares(holder_id);
    CREATE INDEX IF NOT EXISTS idx_ls_lane ON lane_shares(lane_key);
    CREATE TABLE IF NOT EXISTS holding_snapshots (
      player_id TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      symbol    TEXT    NOT NULL,
      qty       INTEGER NOT NULL,
      cycle     INTEGER NOT NULL,
      PRIMARY KEY (player_id, symbol, cycle)
    );
    CREATE INDEX IF NOT EXISTS idx_hs_cycle ON holding_snapshots(cycle);
    CREATE INDEX IF NOT EXISTS idx_hs_player_symbol ON holding_snapshots(player_id, symbol);

    CREATE TABLE IF NOT EXISTS fund_holding_snapshots (
      fund_id TEXT    NOT NULL,
      symbol  TEXT    NOT NULL,
      qty     INTEGER NOT NULL,
      cycle   INTEGER NOT NULL,
      PRIMARY KEY (fund_id, symbol, cycle)
    );
    CREATE INDEX IF NOT EXISTS idx_fhs_cycle ON fund_holding_snapshots(cycle);
    CREATE INDEX IF NOT EXISTS idx_fhs_fund_symbol ON fund_holding_snapshots(fund_id, symbol);

    CREATE TABLE IF NOT EXISTS commodity_prices (
      colony_id    TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      price        REAL NOT NULL,
      supply       REAL NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (colony_id, commodity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cprice_colony ON commodity_prices(colony_id);

    CREATE TABLE IF NOT EXISTS player_cargo (
      player_id    TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      colony_id    TEXT NOT NULL DEFAULT '',
      qty          INTEGER NOT NULL DEFAULT 0,
      avg_cost     REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, commodity_id, colony_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pcargo_player ON player_cargo(player_id);

    CREATE TABLE IF NOT EXISTS cargo_shipments (
      id           TEXT PRIMARY KEY,
      player_id    TEXT NOT NULL,
      commodity_id TEXT NOT NULL,
      qty          INTEGER NOT NULL,
      buy_cost     REAL NOT NULL,
      from_colony  TEXT NOT NULL,
      to_colony    TEXT NOT NULL,
      lane_type    TEXT NOT NULL DEFAULT 'grey',
      insured      INTEGER NOT NULL DEFAULT 0,
      insurance_paid REAL NOT NULL DEFAULT 0,
      intercept_chance REAL NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      resolve_ts   INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'in_transit',
      phase        TEXT NOT NULL DEFAULT 'loading',
      phase_idx    INTEGER NOT NULL DEFAULT 0,
      ship_class   TEXT NOT NULL DEFAULT 'courier',
      sell_value   REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cship_player ON cargo_shipments(player_id, status);
    CREATE INDEX IF NOT EXISTS idx_cship_resolve ON cargo_shipments(status, resolve_ts);

    -- Shipping contracts (options): house-written, cash-settled right to capture a
    -- lane's commodity spread by expiry. No cargo, no ship. status: open|exercised|expired.
    CREATE TABLE IF NOT EXISTS shipping_contracts (
      id            TEXT PRIMARY KEY,
      player_id     TEXT NOT NULL,
      commodity_id  TEXT NOT NULL,
      from_colony   TEXT NOT NULL,
      to_colony     TEXT NOT NULL,
      lane_type     TEXT NOT NULL DEFAULT 'grey',
      strike_spread REAL NOT NULL,
      premium_paid  REAL NOT NULL,
      size          INTEGER NOT NULL,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'open',
      settled_at    INTEGER,
      payout        REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_contract_player ON shipping_contracts(player_id, status);
    CREATE INDEX IF NOT EXISTS idx_contract_expiry ON shipping_contracts(status, expires_at);

    -- Mining: permanent account-wide upgrades purchased via the Mining Store.
    -- upgrades is a JSON blob of the form {"guard_drone":true,"ion_engines":true,...}.
    -- Missing rows indicate no upgrades owned.
    CREATE TABLE IF NOT EXISTS mining_upgrades (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      upgrades  TEXT NOT NULL DEFAULT '{}'
    );

    -- Mining: per-player lifetime stats and best-run record for the leaderboard.
    -- best_run_profit is banked minus invested for the single best run.
    CREATE TABLE IF NOT EXISTS mining_stats (
      player_id            TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      total_runs           INTEGER NOT NULL DEFAULT 0,
      total_profit         REAL    NOT NULL DEFAULT 0,
      best_run_profit      REAL    NOT NULL DEFAULT 0,
      best_run_banked      REAL    NOT NULL DEFAULT 0,
      best_run_band        INTEGER NOT NULL DEFAULT 0,
      best_run_timestamp   INTEGER,
      deepest_band_reached INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_ms_best ON mining_stats(best_run_profit DESC);

    -- Mining: owned ships + currently equipped ship.
    -- owned is a JSON blob {"scout":true,"hauler":true,...}.
    -- equipped is the ship_id string ('default' means stock Mining Drone, no purchase required).
    CREATE TABLE IF NOT EXISTS mining_ships (
      player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      owned     TEXT NOT NULL DEFAULT '{}',
      equipped  TEXT NOT NULL DEFAULT 'default'
    );

    -- Casino rounds: server-authoritative bet/settle ledger.
    -- One row per round. A round opens on casino_bet (stake deducted, status='open'),
    -- and closes on casino_result (payout credited, capped) or the timeout sweep.
    -- status: open | resolved | clamped | expired | voided | rejected_fast
    -- This table is BOTH the anti-exploit state AND the dev-panel activity feed.
    CREATE TABLE IF NOT EXISTS casino_rounds (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL,
      game        TEXT NOT NULL,
      wager       REAL NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      cash_before REAL NOT NULL,
      payout      REAL,
      cash_after  REAL,
      opened_ts   INTEGER NOT NULL,
      resolved_ts INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_casino_player ON casino_rounds(player_id, opened_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_casino_open   ON casino_rounds(status, opened_ts);
  `);

  // Migration: player_cargo gained a colony_id (cargo is now located per-colony).
  // If an older DB has the 2-column primary key, rebuild the table with the new key.
  try {
    const pcCols = new Set(db.prepare('PRAGMA table_info(player_cargo)').all().map(r => r.name));
    if (pcCols.size && !pcCols.has('colony_id')) {
      db.exec(`
        ALTER TABLE player_cargo RENAME TO player_cargo_old;
        CREATE TABLE player_cargo (
          player_id    TEXT NOT NULL,
          commodity_id TEXT NOT NULL,
          colony_id    TEXT NOT NULL DEFAULT '',
          qty          INTEGER NOT NULL DEFAULT 0,
          avg_cost     REAL NOT NULL DEFAULT 0,
          PRIMARY KEY (player_id, commodity_id, colony_id)
        );
        INSERT INTO player_cargo(player_id,commodity_id,colony_id,qty,avg_cost)
          SELECT player_id, commodity_id, '', qty, avg_cost FROM player_cargo_old;
        DROP TABLE player_cargo_old;
        CREATE INDEX IF NOT EXISTS idx_pcargo_player ON player_cargo(player_id);
      `);
      console.log('[DB] Migrated: player_cargo now keyed by colony');
    }
  } catch (e) { console.error('[DB] player_cargo migration error', e); }

  // Migration: safely add new columns if they don't exist yet (upgrade from older DB)
  const _existingCols = new Set(
    db.prepare('PRAGMA table_info(players)').all().map(r => r.name)
  );
  const _migrations = [
    ['patreon_tier',      'INTEGER NOT NULL DEFAULT 0'],
    ['patreon_email',     'TEXT'],
    ['patreon_member_id', 'TEXT'],
    ['patreon_expires_at','INTEGER'],
    ['is_dev',            'INTEGER NOT NULL DEFAULT 0'],
    ['is_admin',          'INTEGER NOT NULL DEFAULT 0'],
    ['faction',           'TEXT'],
    ['void_locked',       'INTEGER NOT NULL DEFAULT 0'],
    ['void_president_escaped', 'INTEGER NOT NULL DEFAULT 0'],
    ['owned_titles',          "TEXT NOT NULL DEFAULT '[]'"],
    ['tutorial_seen',         'INTEGER NOT NULL DEFAULT 0'],
    ['ship_class',            "TEXT NOT NULL DEFAULT ''"],
    ['portrait',              'TEXT'],
    ['patreon_exempt',        'INTEGER NOT NULL DEFAULT 0'],
  ];
  for (const [col, def] of _migrations) {
    if (!_existingCols.has(col)) {
      db.exec(`ALTER TABLE players ADD COLUMN ${col} ${def}`);
      console.log(`[DB] Migrated: added column ${col}`);
    }
  }

  // Migration: rename titles (v1.0.1.1)
  const _titleRenames = [
    ['Intern of GDP Growth',              'Bag Holder'],
    ['Toxic Spill Janitor',               'Offal Accountant'],
    ['Casino Archivist',                   'Floor Rat'],
    ['Utopian Clerk',                      'Stamp Licker'],
    ['Ruins Gambler',                      'Carcass Speculator'],
    ['Colonial Auditor',                   'Tariff Butcher'],
    ['Subprime Executor',                  'Foreclosure Priest'],
    ['Blood Dividend Officer',             'Famine Trader'],
    ['Vice Minister of GDP Expansion',     'Extraction Overseer'],
    ['Ashen Textile Broker',               'Sanctions Profiteer'],
    ['Director of the Fifteenth Corporate War', 'War Premium Underwriter'],
    ["Mr. Flesh's Favored Proxy",          "Mr. Flesh's Auctioneer"],
    ['Inter-Colony GDP Prophet',           'Sovereign Debt Parasite'],
    ['Social Credit Syndicator',           'Cartel Notary'],
    ['Warlord Accountant',                 'Extinction Auditor'],
    ['Eternal Chairman of Flesh',          'The Last Entry'],
    ['Lore Master',                        'He Who Holds The Pen'],
    ['Corporate War Survivor [I\u2013XV]', 'Scar of the Fifteenth War'],
    ['Bearer of the Flesh Dividend',       'The Yield'],
    ['Reserve Currency Sovereign',         'The Central Banker'],
    ['Marked Subscriber',                  'Tithe Payer'],
    ['Premium Wage Slave',                 'Branded Debtor'],
    ['Officer of the Guild',               'Guild Enforcer'],
    ['Merchant of the 7th Ward',           'Seventh Ward Broker'],
    ['Corporate Apex Predator',            'The Tenth Seat'],
    ['Sovereign of the Ledger',            'Apex Creditor'],
  ];
  const _renameTitle = stmt('UPDATE players SET title = ? WHERE title = ?');
  const _renameOwned = stmt('UPDATE players SET owned_titles = REPLACE(owned_titles, ?, ?) WHERE owned_titles LIKE ?');
  for (const [oldT, newT] of _titleRenames) {
    _renameTitle.run(newT, oldT);
    _renameOwned.run('"' + oldT + '"', '"' + newT + '"', '%' + oldT + '%');
  }
  console.log('[DB] Title rename migration applied');

  initTcg(db); // FleshMarket TCG: collection + deck tables
  initCityDb(db); // City Charters: city_state + city_lots tables

  console.log(`[DB] SQLite ready: ${DB_PATH}`);
  return db;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export let savePlayerFn;
export let recordNetWorthFn;
export let recordFundNAVFn;

export function setupTransactions() {
  savePlayerFn = transaction((player) => {
    const now = Date.now();
    stmt(`UPDATE players
          SET cash=?,xp=?,level=?,title=?,owned_titles=?,patreon_tier=?,patreon_email=?,
              patreon_member_id=?,patreon_expires_at=?,updated_at=?,last_seen=?
          WHERE id=?`)
      .run(
        player.cash, player.xp, player.level, player.title||null,
        JSON.stringify(player.ownedTitles||[]),
        player.patreon_tier||0, player.patreon_email||null,
        player.patreon_member_id||null, player.patreon_expires_at||null,
        now, now, player.id
      );
    stmt('DELETE FROM holdings WHERE player_id=?').run(player.id);
    for (const [sym, qty] of Object.entries(player.holdings||{})) {
      if (qty !== 0) stmt('INSERT OR REPLACE INTO holdings VALUES(?,?,?)').run(player.id,sym,qty);
    }
    stmt('DELETE FROM basis WHERE player_id=?').run(player.id);
    for (const [sym, bc] of Object.entries(player.basisC||{})) {
      if (bc !== 0) stmt('INSERT OR REPLACE INTO basis VALUES(?,?,?)').run(player.id,sym,Math.floor(bc));
    }
    stmt('DELETE FROM short_coll WHERE player_id=?').run(player.id);
    for (const [sym, cc] of Object.entries(player.shortCollC||{})) {
      if (cc > 0) stmt('INSERT OR REPLACE INTO short_coll VALUES(?,?,?)').run(player.id,sym,Math.floor(cc));
    }
  });

  recordNetWorthFn = transaction((playerId, net, cash, equity) => {
    stmt('INSERT INTO net_worth_history(player_id,net_worth,cash,equity,ts) VALUES(?,?,?,?,?)')
      .run(playerId, net, cash, equity, Date.now());
    // Guild Clearance: the high-water mark rides along with the history write so
    // every existing call site maintains it without being touched. Monotone by
    // the WHERE clause; a drawdown never lowers earned clearance.
    try {
      const n = Number(net);
      if (Number.isFinite(n) && n > 0)
        stmt('UPDATE players SET peak_net_worth=? WHERE id=? AND peak_net_worth < ?').run(n, playerId, n);
    } catch(_) {}
    stmt(`DELETE FROM net_worth_history WHERE player_id=? AND id NOT IN
          (SELECT id FROM net_worth_history WHERE player_id=? ORDER BY ts DESC LIMIT 1000)`)
      .run(playerId, playerId);
  });

  recordFundNAVFn = transaction((fundId, nav, spp, totalShares) => {
    stmt('INSERT INTO fund_nav_history(fund_id,nav,spp,total_shares,ts) VALUES(?,?,?,?,?)')
      .run(fundId, nav, spp, totalShares, Date.now());
    stmt(`DELETE FROM fund_nav_history WHERE fund_id=? AND id NOT IN
          (SELECT id FROM fund_nav_history WHERE fund_id=? ORDER BY ts DESC LIMIT 1000)`)
      .run(fundId, fundId);
  });
}

// ─── Password ─────────────────────────────────────────────────────────────────

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
}
export function createPasswordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return { hash: hashPassword(password, salt), salt };
}
export function verifyPassword(password, hash, salt) {
  const attempt = hashPassword(password, salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(hash,    'hex');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i=0;i<a.length;i++) diff |= a[i]^b[i];
  return diff === 0;
}

// ─── Player CRUD ──────────────────────────────────────────────────────────────

function hydratePlayer(row) {
  if (!row) return null;
  const holdings={}, basisC={}, shortCollC={};
  stmt('SELECT symbol,qty FROM holdings WHERE player_id=?').all(row.id)
    .forEach(h=>{ if(h.qty !== 0) holdings[h.symbol]=h.qty; });
  stmt('SELECT symbol,basis_c FROM basis WHERE player_id=?').all(row.id)
    .forEach(b=>{ if(b.basis_c !== 0) basisC[b.symbol]=b.basis_c; });
  stmt('SELECT symbol,coll_c FROM short_coll WHERE player_id=?').all(row.id)
    .forEach(r=>{ if(r.coll_c > 0) shortCollC[r.symbol]=r.coll_c; });
  return {
    id:row.id, name:row.name,
    password_hash:row.password_hash, password_salt:row.password_salt,
    cash:row.cash, xp:row.xp, level:row.level,
    title:row.title||null,
    ownedTitles: JSON.parse(row.owned_titles||'[]'),
    badges: JSON.parse(row.badges||'[]'),
    patreon_tier: row.patreon_tier||0,
    patreon_email: row.patreon_email||null,
    patreon_member_id: row.patreon_member_id||null,
    patreon_expires_at: row.patreon_expires_at||null,
    faction: row.faction||null,
    portrait: row.portrait||null,
    holdings, basisC, shortCollC,
    tutorial_seen: row.tutorial_seen || 0,
    shipClass: row.ship_class || '',
    createdAt:row.created_at, updatedAt:row.updated_at, lastSeen:row.last_seen,
  };
}

export function createPlayerSync(id, name, password) {
  const now = Date.now();
  const {hash,salt} = createPasswordHash(password);
  stmt(`INSERT INTO players(id,name,password_hash,password_salt,cash,xp,level,badges,patreon_tier,created_at,updated_at)
        VALUES(?,?,?,?,1000,0,1,'[]',0,?,?)`)
    .run(id,name,hash,salt,now,now);
  return getPlayer(id);
}
export function getPlayer(id) { return hydratePlayer(stmt('SELECT * FROM players WHERE id=?').get(id)); }
export function getPlayerByName(name) { return hydratePlayer(stmt('SELECT * FROM players WHERE name=? COLLATE NOCASE').get(name)); }
export function getPlayerByPatreonEmail(email) { return hydratePlayer(stmt('SELECT * FROM players WHERE patreon_email=? COLLATE NOCASE').get(email)); }
export function getPlayerByPatreonMemberId(memberId) { return hydratePlayer(stmt('SELECT * FROM players WHERE patreon_member_id=?').get(memberId)); }
export function isNameAvailable(name) {
  if (!name||!name.trim()) return false;
  return !stmt('SELECT id FROM players WHERE name=? COLLATE NOCASE').get(name.trim());
}
export function touchPlayer(id) { stmt('UPDATE players SET last_seen=? WHERE id=?').run(Date.now(),id); }
export function renamePlayer(id,newName) { stmt('UPDATE players SET name=?,updated_at=? WHERE id=?').run(newName.trim(),Date.now(),id); }
export function markTutorialSeen(id) { stmt('UPDATE players SET tutorial_seen=1,updated_at=? WHERE id=?').run(Date.now(),id); }
export function setPlayerShipClass(id, shipClass) { stmt('UPDATE players SET ship_class=?,updated_at=? WHERE id=?').run(shipClass, Date.now(), id); }
export function setPlayerPortrait(id, portrait) { stmt('UPDATE players SET portrait=?,updated_at=? WHERE id=?').run(portrait || null, Date.now(), id); }
export function getPlayerShipClass(id) { const r = stmt('SELECT ship_class FROM players WHERE id=?').get(id); return r ? (r.ship_class||'') : ''; }
export function countCEOs() { return (stmt('SELECT COUNT(*) as n FROM players WHERE patreon_tier=3').get()||{n:0}).n; }

// ─── Patreon tier management ──────────────────────────────────────────────────

export function setPatreonTier(playerId, tier, memberId, expiresAt) {
  stmt(`UPDATE players SET patreon_tier=?,patreon_member_id=?,patreon_expires_at=?,updated_at=? WHERE id=?`)
    .run(tier, memberId||null, expiresAt||null, Date.now(), playerId);
}

export function linkPatreonEmail(playerId, email) {
  stmt('UPDATE players SET patreon_email=?,updated_at=? WHERE id=?').run(email.toLowerCase().trim(), Date.now(), playerId);
}

// ─── Pending Patreon pledges ──────────────────────────────────────────────────
// A pledge webhook can arrive before the patron has linked their email in-game.
// We queue those here (keyed by Patreon member id) and drain them at link time.
export function upsertPendingPledge(memberId, email, tier, expiresAt) {
  if (!memberId) return;
  stmt(`INSERT INTO pending_pledges(member_id,email,tier,expires_at,updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(member_id) DO UPDATE SET
          email=excluded.email, tier=excluded.tier,
          expires_at=excluded.expires_at, updated_at=excluded.updated_at`)
    .run(memberId, email ? email.toLowerCase().trim() : null, tier, expiresAt || null, Date.now());
}
export function getPendingPledgeByEmail(email) {
  if (!email) return null;
  return stmt('SELECT * FROM pending_pledges WHERE email=? COLLATE NOCASE').get(email.toLowerCase().trim()) || null;
}
export function deletePendingPledge(memberId) {
  if (!memberId) return;
  stmt('DELETE FROM pending_pledges WHERE member_id=?').run(memberId);
}
export function clearPendingPledge(memberId, email) {
  if (memberId) stmt('DELETE FROM pending_pledges WHERE member_id=?').run(memberId);
  if (email)    stmt('DELETE FROM pending_pledges WHERE email=? COLLATE NOCASE').run(email.toLowerCase().trim());
}

// ─── Per-cycle price history ──────────────────────────────────────────────────
// One row per company per 30-min market cycle: the price at cycle open (start) and
// at cycle close (end). Keyed on the stable company_id (NOT the symbol glyph) so a
// symbol reshuffle can't splice two firms' histories together. INSERT OR IGNORE so a
// double-fired boundary is a no-op. Never pruned by default; retention is a view knob.
export function insertPriceCycle(companyId, cycleTs, symbol, startP, endP) {
  if (companyId == null || cycleTs == null) return;
  stmt(`INSERT OR IGNORE INTO price_cycles(company_id,cycle_ts,symbol,start_price,end_price)
        VALUES(?,?,?,?,?)`).run(companyId, cycleTs, symbol || null, startP, endP);
}
export function getPriceCycles(companyId, sinceTs, untilTs, limit = 8000) {
  const hi = (Number(untilTs) > 0) ? Number(untilTs) : Date.now() + 86400000;
  return stmt(`SELECT cycle_ts AS t, start_price AS s, end_price AS e
               FROM price_cycles
               WHERE company_id=? AND cycle_ts>=? AND cycle_ts<=?
               ORDER BY cycle_ts DESC
               LIMIT ?`).all(companyId, sinceTs || 0, hi, limit);
}

// Revoke expired Patreon tiers (call periodically)
export function revokeExpiredPatreon() {
  const now = Date.now();
  // Three standing exemptions, applied here as well as in the monthly audit so
  // the timer sweep and the reconciliation cannot disagree about who is safe:
  //   tier 3      CEO is lifetime, it does not lapse with a billing cycle
  //   dev_grant_  tiers the GM issued by hand, which have no Patreon behind them
  //   patreon_exempt  anything bespoke, set from the dev panel
  const expired = stmt(`SELECT id FROM players
                        WHERE patreon_tier>0 AND patreon_tier<3
                          AND COALESCE(patreon_exempt,0)=0
                          AND COALESCE(patreon_member_id,'') NOT LIKE 'dev_grant_%'
                          AND patreon_expires_at IS NOT NULL AND patreon_expires_at<?`).all(now);
  for (const row of expired) {
    stmt('UPDATE players SET patreon_tier=0,patreon_member_id=null,patreon_expires_at=null,updated_at=? WHERE id=?')
      .run(now, row.id);
  }
  return expired.length;
}

// Credit passive income to all players with a tier > 0
// MERCHANTS_GUILD members get +1% base income per MERCHANTS_GUILD member (exclusive feature).
// Player-created guilds do NOT grant this bonus.
// Returns { count, payouts: [{id, base, bonus, total, guildMemberCount}] }
export function creditPassiveIncome(onlineIds) {
  // Only credit players who are currently connected (have active WebSocket)
  if (!onlineIds || onlineIds.size === 0) return { count: 0, payouts: [], guildMemberCount: 0 };
  const idList = [...onlineIds];
  const placeholders = idList.map(() => '?').join(',');
  const players = stmt(`SELECT id,patreon_tier,is_dev FROM players WHERE id IN (${placeholders})`).all(...idList);

  // Count only MERCHANTS_GUILD members for the bonus — not all tier>=2 players
  let guildMemberCount = 0;
  try {
    const r = stmt(`SELECT COUNT(*) as n FROM fund_memberships WHERE fund_id='MERCHANTS_GUILD'`).get();
    guildMemberCount = r?.n || 0;
  } catch(_) {
    // fund_memberships table may not exist yet on first run
    guildMemberCount = 0;
  }
  const guildBonusPct = guildMemberCount * 0.01; // 1% per MERCHANTS_GUILD member

  // Build a set of player IDs who are actually in MERCHANTS_GUILD
  const mgMemberIds = new Set();
  try {
    const rows = stmt(`SELECT player_id FROM fund_memberships WHERE fund_id='MERCHANTS_GUILD'`).all();
    for (const r of rows) mgMemberIds.add(r.player_id);
  } catch(_) {}

  const payouts = [];
  const now = Date.now();
  for (const row of players) {
    const isDev = !!(row.is_dev);
    const tier = TIERS[row.patreon_tier ?? 0];
    if (!tier || !tier.incomeEvery30) continue;
    const base = tier.incomeEvery30;
    // Bonus ONLY for players actually in MERCHANTS_GUILD (not player-created guilds)
    const inMerchantsGuild = mgMemberIds.has(row.id);
    const bonusMult = inMerchantsGuild ? guildBonusPct : 0;
    const bonus = Math.floor(base * bonusMult);
    const total = base + bonus;
    stmt('UPDATE players SET cash=cash+?,updated_at=? WHERE id=?').run(total, now, row.id);
    payouts.push({ id: row.id, base, bonus, total, guildMemberCount, isDev });
  }
  return { count: players.length, payouts, guildMemberCount };
}

// ─── Net worth history ────────────────────────────────────────────────────────

export function getNetWorthHistory(playerId, limit=200) {
  return stmt(`SELECT net_worth,cash,equity,ts FROM net_worth_history
               WHERE player_id=? ORDER BY ts DESC LIMIT ?`)
    .all(playerId,limit).reverse();
}

// ─── Fund NAV / NAV-per-share history ───────────────────────────────────────
// spp (NAV per share) is the true performance line — it isolates the owner's
// trading from member cashflows. nav tracks fund size, not performance.
export function getFundNAVHistory(fundId, limit=300) {
  return stmt(`SELECT nav,spp,total_shares,ts FROM fund_nav_history
               WHERE fund_id=? ORDER BY ts DESC LIMIT ?`)
    .all(fundId,limit).reverse();
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export function getLeaderboard(companies, limit=20) {
  try { db.exec('ALTER TABLE players ADD COLUMN faction TEXT'); } catch(_){}
  const players = stmt(`SELECT id,name,cash,xp,level,title,patreon_tier,is_dev,is_admin,is_prime,faction FROM players WHERE is_dev=0 AND is_admin=0 AND is_prime=0`).all();
  const priceMap = {}; for (const c of companies) priceMap[c.symbol] = c.price;
  return players.map(p=>{
    const holdRows = stmt('SELECT symbol,qty FROM holdings WHERE player_id=?').all(p.id);
    // signed: longs add, shorts subtract their cover cost
    const equity   = holdRows.reduce((acc,h)=>{ const c=companies.find(x=>x.symbol===h.symbol); return acc+(c?c.price*h.qty:0); },0);
    // locked short collateral (proceeds withheld from cash on new shorts) adds back
    let collateral = 0;
    try { for (const r of stmt('SELECT coll_c FROM short_coll WHERE player_id=?').all(p.id)) collateral += (r.coll_c||0)/100; } catch(_){}
    // money tied up in Capital Houses (the player's share of each fund's NAV)
    const fundStake = getPlayerFundStake(p.id, priceMap);
    return { id:p.id, name:p.name, net:p.cash+equity+collateral+fundStake, xp:p.xp, level:p.level, title:p.title, patreon_tier:p.patreon_tier||0, is_dev:!!(p.is_dev||p.is_admin), is_prime:!!(p.is_prime), faction:p.faction||null };
  }).sort((a,b)=>b.net-a.net).slice(0,limit);
}

// ─── Market state ─────────────────────────────────────────────────────────────

export function saveMarketState(companies, headlines) {
  const state = {
    companies: companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price,lnP:c.lnP,sigma:c.sigma,ohlc:c.ohlc,ownTargetLnP:c.ownTargetLnP,beta:c.beta,_spawnLnP:c._spawnLnP})),
    headlines: headlines.slice(-200),
    savedAt: Date.now()
  };
  stmt('INSERT OR REPLACE INTO market_state(key,value) VALUES(?,?)').run('main',JSON.stringify(state));
}
export function loadMarketState() {
  const row = stmt('SELECT value FROM market_state WHERE key=?').get('main');
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
export function saveGalaxySystemsState(data) {
  stmt('INSERT OR REPLACE INTO market_state(key,value) VALUES(?,?)').run('galaxy_systems',JSON.stringify(data));
}
export function loadGalaxySystemsState() {
  const row = stmt('SELECT value FROM market_state WHERE key=?').get('galaxy_systems');
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
export function savePresidentState(president) {
  stmt('INSERT OR REPLACE INTO market_state(key,value) VALUES(?,?)').run('president', JSON.stringify(president));
}
export function loadPresidentState() {
  const row = stmt('SELECT value FROM market_state WHERE key=?').get('president');
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

// Chat log persistence: bounded per-room scrollback that survives restarts.
export function appendChatLog(key, ts, payload) {
  stmt('INSERT INTO chat_log(k,ts,payload) VALUES(?,?,?)').run(key, ts, payload);
}
export function loadChatLogAll() {
  return stmt('SELECT payload FROM chat_log ORDER BY id ASC').all();
}
export function pruneChatLog(perKeyMax) {
  for (const { k } of stmt('SELECT DISTINCT k FROM chat_log').all()) {
    stmt('DELETE FROM chat_log WHERE k=? AND id NOT IN (SELECT id FROM chat_log WHERE k=? ORDER BY id DESC LIMIT ?)').run(k, k, perKeyMax);
  }
}

// ─── Lane Shares ──────────────────────────────────────────────────────────────
export function getLaneShareCount(laneKey) {
  const r = stmt('SELECT COUNT(*) as c FROM lane_shares WHERE lane_key=?').get(laneKey);
  return r ? r.c : 0;
}
export function getLaneShares(laneKey) {
  return stmt('SELECT * FROM lane_shares WHERE lane_key=? ORDER BY slot_number').all(laneKey);
}
export function getAllLaneShares() {
  return stmt('SELECT * FROM lane_shares ORDER BY lane_key, slot_number').all();
}
export function getPlayerShare(playerId) {
  return stmt('SELECT * FROM lane_shares WHERE holder_id=?').get(playerId) || null;
}
export function buyLaneShare(laneKey, slotNumber, playerId, playerName, price) {
  stmt('INSERT INTO lane_shares(lane_key,slot_number,holder_id,holder_name,purchase_price,purchased_at,dividends_earned) VALUES(?,?,?,?,?,?,0)')
    .run(laneKey, slotNumber, playerId, playerName, price, Date.now());
}
export function sellLaneShare(playerId) {
  stmt('DELETE FROM lane_shares WHERE holder_id=?').run(playerId);
}
export function voidLaneSharesByLane(laneKey) {
  const voided = stmt('SELECT * FROM lane_shares WHERE lane_key=?').all(laneKey);
  stmt('DELETE FROM lane_shares WHERE lane_key=?').run(laneKey);
  return voided;
}
export function addShareDividend(shareId, amount) {
  stmt('UPDATE lane_shares SET dividends_earned=dividends_earned+? WHERE id=?').run(amount, shareId);
}
export function getLaneShareSummaries() {
  return stmt('SELECT lane_key, COUNT(*) as supply, MAX(slot_number) as max_slot FROM lane_shares GROUP BY lane_key').all();
}

// ═══════════════════════════════════════════════════════════════════════════
// HEDGE FUND — Merchants Guild
// ═══════════════════════════════════════════════════════════════════════════

export function initHedgeFund() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fund_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_members (
      player_id   TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
      shares      REAL    NOT NULL DEFAULT 0,
      deposited   REAL    NOT NULL DEFAULT 0,
      joined_at   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_holdings (
      symbol TEXT PRIMARY KEY,
      qty    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fund_proposals (
      id          TEXT PRIMARY KEY,
      proposer_id TEXT NOT NULL REFERENCES players(id),
      side        TEXT NOT NULL,
      symbol      TEXT NOT NULL,
      qty         INTEGER NOT NULL,
      reason      TEXT,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      votes_yes   INTEGER NOT NULL DEFAULT 0,
      votes_no    INTEGER NOT NULL DEFAULT 0,
      executed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS fund_votes (
      proposal_id TEXT NOT NULL REFERENCES fund_proposals(id),
      player_id   TEXT NOT NULL REFERENCES players(id),
      vote        TEXT NOT NULL,
      weight      INTEGER NOT NULL DEFAULT 1,
      voted_at    INTEGER NOT NULL,
      PRIMARY KEY (proposal_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS fund_ledger (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      type       TEXT NOT NULL,
      player_id  TEXT,
      symbol     TEXT,
      qty        INTEGER,
      price      REAL,
      amount     REAL,
      shares_delta REAL,
      note       TEXT
    );
  `);

  // Init fund cash if not set
  const row = stmt('SELECT value FROM fund_state WHERE key=?').get('cash');
  if (!row) stmt('INSERT INTO fund_state VALUES(?,?)').run('cash', '0');
}

// ── Fund state ────────────────────────────────────────────────────────────────

export function getFundCash() {
  const r = stmt('SELECT value FROM fund_state WHERE key=?').get('cash');
  return r ? parseFloat(r.value) || 0 : 0;
}
export function setFundCash(v) {
  stmt('INSERT OR REPLACE INTO fund_state VALUES(?,?)').run('cash', String(v));
}
export function getFundHoldings() {
  return stmt('SELECT symbol, qty FROM fund_holdings WHERE qty>0').all();
}
export function setFundHolding(symbol, qty) {
  if (qty <= 0) stmt('DELETE FROM fund_holdings WHERE symbol=?').run(symbol);
  else stmt('INSERT OR REPLACE INTO fund_holdings VALUES(?,?)').run(symbol, qty);
}
export function getTotalFundShares() {
  const r = stmt('SELECT SUM(shares) as s FROM fund_members').get();
  return r?.s || 0;
}

// ── Membership ────────────────────────────────────────────────────────────────

export function getFundMembers() {
  return stmt(`
    SELECT fm.player_id, fm.shares, fm.deposited, fm.joined_at, p.name, p.patreon_tier
    FROM fund_members fm JOIN players p ON p.id=fm.player_id
    ORDER BY fm.shares DESC
  `).all();
}
export function getFundMember(playerId) {
  return stmt('SELECT * FROM fund_members WHERE player_id=?').get(playerId);
}
export function isFundMember(playerId) {
  return !!stmt('SELECT 1 FROM fund_members WHERE player_id=?').get(playerId);
}

// Auto-join eligible players (tier >= 2)
export function syncFundMembership() {
  // MERCHANTS_GUILD — Patreon tier >= 2 (regular players), plus the owner account (is_prime)
  // Regular devs/admins do NOT get auto-enrolled in MERCHANTS_GUILD — they belong in FLSH only
  const guildEligible = stmt('SELECT id FROM players WHERE patreon_tier>=2 OR is_prime=1').all();
  for (const p of guildEligible) {
    if (!isInFund('MERCHANTS_GUILD', p.id)) {
      try { joinFund('MERCHANTS_GUILD', p.id); } catch(_) {}
    }
  }
  // FLSH Capital — all dev/admin accounts (including owner)
  const devEligible = stmt('SELECT id FROM players WHERE is_dev=1 OR is_admin=1').all();
  for (const p of devEligible) {
    if (!isInFund('FLSH', p.id)) {
      try { joinFund('FLSH', p.id); } catch(_) {}
    }
  }
  // Remove non-prime devs from MERCHANTS_GUILD if they snuck in
  try {
    stmt(`DELETE FROM fund_memberships
          WHERE fund_id='MERCHANTS_GUILD'
          AND player_id IN (
            SELECT id FROM players WHERE (is_dev=1 OR is_admin=1) AND is_prime=0
          )`).run();
  } catch(_) {}
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export let depositToFundFn;
export let withdrawFromFundFn;

export function setupFundTransactions() {
  depositToFundFn = transaction((playerId, amount, currentNAV) => {
    const player = getPlayer(playerId);
    if (!player || player.cash < amount) throw new Error('insufficient_funds');
    if (!isFundMember(playerId)) throw new Error('not_a_member');

    const totalShares = getTotalFundShares();
    const pricePerShare = totalShares > 0 && currentNAV > 0 ? currentNAV / totalShares : 1;
    const newShares = amount / pricePerShare;

    stmt('UPDATE players SET cash=cash-?,updated_at=? WHERE id=?').run(amount, Date.now(), playerId);
    stmt(`INSERT INTO fund_members(player_id,shares,deposited,joined_at) VALUES(?,?,?,?)
          ON CONFLICT(player_id) DO UPDATE SET shares=shares+?,deposited=deposited+?`)
      .run(playerId, newShares, amount, Date.now(), newShares, amount);
    setFundCash(getFundCash() + amount);

    stmt('INSERT INTO fund_ledger(ts,type,player_id,amount,shares_delta,note) VALUES(?,?,?,?,?,?)')
      .run(Date.now(), 'deposit', playerId, amount, newShares, `Deposit at NAV ₥${currentNAV.toFixed(2)}`);

    return newShares;
  });

  withdrawFromFundFn = transaction((playerId, sharesFraction, currentNAV) => {
    const member = getFundMember(playerId);
    if (!member) throw new Error('not_a_member');
    const shares = member.shares * Math.min(1, Math.max(0, sharesFraction));
    if (shares <= 0) throw new Error('no_shares');

    const totalShares = getTotalFundShares();
    const pricePerShare = totalShares > 0 && currentNAV > 0 ? currentNAV / totalShares : 1;
    const cashValue = shares * pricePerShare;

    // Pay out from fund cash first, liquidate holdings if needed
    const fundCash = getFundCash();
    if (fundCash < cashValue) throw new Error('insufficient_fund_liquidity');

    setFundCash(fundCash - cashValue);
    stmt('UPDATE players SET cash=cash+?,updated_at=? WHERE id=?').run(cashValue, Date.now(), playerId);
    stmt('UPDATE fund_members SET shares=shares-? WHERE player_id=?').run(shares, playerId);

    stmt('INSERT INTO fund_ledger(ts,type,player_id,amount,shares_delta,note) VALUES(?,?,?,?,?,?)')
      .run(Date.now(), 'withdraw', playerId, cashValue, -shares, `Withdraw ${(sharesFraction*100).toFixed(0)}% of shares`);

    return cashValue;
  });
}

// ── Proposals & Voting ────────────────────────────────────────────────────────

export function createProposal(proposerId, side, symbol, qty, reason) {
  const id = Math.random().toString(36).slice(2,10).toUpperCase();
  const now = Date.now();
  stmt(`INSERT INTO fund_proposals(id,proposer_id,side,symbol,qty,reason,created_at,expires_at,status)
        VALUES(?,?,?,?,?,?,?,?,'open')`)
    .run(id, proposerId, side, symbol, qty, reason||'', now, now + 48*60*60*1000);
  return id;
}

export function getOpenProposals() {
  return stmt(`SELECT p.*, pl.name as proposer_name
               FROM fund_proposals p JOIN players pl ON pl.id=p.proposer_id
               WHERE p.status='open' AND p.expires_at>?
               ORDER BY p.created_at DESC`)
    .all(Date.now());
}

export function getAllProposals(limit=20) {
  return stmt(`SELECT p.*, pl.name as proposer_name
               FROM fund_proposals p JOIN players pl ON pl.id=p.proposer_id
               ORDER BY p.created_at DESC LIMIT ?`)
    .all(limit);
}

export function castVote(proposalId, playerId, vote, weight) {
  const existing = stmt('SELECT 1 FROM fund_votes WHERE proposal_id=? AND player_id=?').get(proposalId, playerId);
  if (existing) throw new Error('already_voted');
  stmt('INSERT INTO fund_votes VALUES(?,?,?,?,?)').run(proposalId, playerId, vote, weight||1, Date.now());
  if (vote === 'yes') stmt('UPDATE fund_proposals SET votes_yes=votes_yes+? WHERE id=?').run(weight||1, proposalId);
  else stmt('UPDATE fund_proposals SET votes_no=votes_no+? WHERE id=?').run(weight||1, proposalId);
  return getProposal(proposalId);
}

export function getProposal(id) {
  return stmt(`SELECT p.*, pl.name as proposer_name
               FROM fund_proposals p JOIN players pl ON pl.id=p.proposer_id
               WHERE p.id=?`).get(id);
}

export function hasVoted(proposalId, playerId) {
  return !!stmt('SELECT 1 FROM fund_votes WHERE proposal_id=? AND player_id=?').get(proposalId, playerId);
}

export function resolveProposal(id, status, executedAt) {
  stmt('UPDATE fund_proposals SET status=?,executed_at=? WHERE id=?').run(status, executedAt||Date.now(), id);
}

export function expireOldProposals() {
  stmt(`UPDATE fund_proposals SET status='expired' WHERE status='open' AND expires_at<?`).run(Date.now());
}

// Fund ledger (activity log)
export function getFundLedger(limit=50) {
  return stmt(`SELECT l.*, p.name as player_name FROM fund_ledger l
               LEFT JOIN players p ON p.id=l.player_id
               ORDER BY l.ts DESC LIMIT ?`).all(limit);
}

export function logFundTrade(symbol, side, qty, price, note) {
  stmt('INSERT INTO fund_ledger(ts,type,symbol,qty,price,note) VALUES(?,?,?,?,?,?)')
    .run(Date.now(), `trade_${side}`, symbol, qty, price, note||'');
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER FUNDS SYSTEM (general multi-fund)
// ═══════════════════════════════════════════════════════════════════════════

export const FUND_CREATE_COST  = 10_000_000;   // ₥10M to start a fund
export const FUND_SLOT_COST    = 100_000;       // ₥100K per extra member slot
export const FUND_BASE_SLOTS   = 5;             // slots included in creation cost
export const FUND_SAVINGS_RATE = 0.0004;        // 0.04% per hour on idle cash (~1%/day)
export const FLSH_TRADE_PCT    = 0.05;          // 5% of trade volume goes to FLSH fund

export function initFundsSystem() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funds (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      type         TEXT NOT NULL DEFAULT 'player',
      owner_id     TEXT REFERENCES players(id),
      description  TEXT,
      max_members  INTEGER NOT NULL DEFAULT 5,
      slot_cost    REAL NOT NULL DEFAULT 150000,
      savings_rate REAL NOT NULL DEFAULT 0.0004,
      cash         REAL NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL,
      closed_at    INTEGER
    );

    -- Index listings: a Capital House whose NAV-per-share trades as a real ticker on
    -- the main tape. One row per listed house. company_id is the numeric id assigned
    -- in the in-memory companies array (>= FUND_TICKER_ID_BASE, kept OUT of the 0..N
    -- index range so price_cycles can never splice fund history onto a regular ticker).
    -- float_shares is the public block minted at listing (fixed; no paid re-issuance).
    CREATE TABLE IF NOT EXISTS fund_listings (
      fund_id      TEXT PRIMARY KEY REFERENCES funds(id) ON DELETE CASCADE,
      symbol       TEXT NOT NULL UNIQUE,
      company_id   INTEGER NOT NULL UNIQUE,
      float_shares REAL NOT NULL,
      list_nav     REAL NOT NULL,
      list_price   REAL NOT NULL,
      listed_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fund_memberships (
      fund_id    TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      shares     REAL NOT NULL DEFAULT 0,
      deposited  REAL NOT NULL DEFAULT 0,
      joined_at  INTEGER NOT NULL,
      PRIMARY KEY (fund_id, player_id)
    );

    CREATE TABLE IF NOT EXISTS fund_portfolios (
      fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      symbol  TEXT NOT NULL,
      qty     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (fund_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS fund_activity (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id   TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      ts        INTEGER NOT NULL,
      type      TEXT NOT NULL,
      player_id TEXT,
      symbol    TEXT,
      qty       INTEGER,
      price     REAL,
      amount    REAL,
      note      TEXT
    );

    CREATE TABLE IF NOT EXISTS house_proposals (
      id          TEXT PRIMARY KEY,
      fund_id     TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      proposer_id TEXT NOT NULL,
      side        TEXT NOT NULL,
      symbol      TEXT NOT NULL,
      qty         INTEGER NOT NULL,
      reason      TEXT,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      votes_yes   REAL NOT NULL DEFAULT 0,
      votes_no    REAL NOT NULL DEFAULT 0,
      executed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS house_votes (
      proposal_id TEXT NOT NULL REFERENCES house_proposals(id) ON DELETE CASCADE,
      player_id   TEXT NOT NULL,
      vote        TEXT NOT NULL,
      weight      REAL NOT NULL DEFAULT 1,
      voted_at    INTEGER NOT NULL,
      PRIMARY KEY (proposal_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_house_prop_fund ON house_proposals(fund_id, status);

    CREATE TABLE IF NOT EXISTS fund_officers (
      fund_id      TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      player_id    TEXT NOT NULL,
      role         TEXT NOT NULL,
      appointed_at INTEGER NOT NULL,
      PRIMARY KEY (fund_id, player_id)
    );
    CREATE INDEX IF NOT EXISTS idx_fund_officers ON fund_officers(fund_id);
  `);

  // Lazy migration: governance mode + vote weight on existing funds tables.
  // governance: 'executive' | 'vote' | 'council'   vote_weight: 'equal' | 'shares'
  try { db.exec(`ALTER TABLE funds ADD COLUMN governance TEXT NOT NULL DEFAULT 'executive'`); } catch(_) {}
  try { db.exec(`ALTER TABLE funds ADD COLUMN vote_weight TEXT NOT NULL DEFAULT 'equal'`); } catch(_) {}
  try { db.exec(`ALTER TABLE funds ADD COLUMN vote_duration_ms INTEGER NOT NULL DEFAULT 21600000`); } catch(_) {}
  // Golden share: one transferable veto token per fund; defaults to the owner.
  try { db.exec(`ALTER TABLE funds ADD COLUMN golden_holder TEXT`); } catch(_) {}
  try { stmt(`UPDATE funds SET golden_holder=owner_id WHERE golden_holder IS NULL AND owner_id IS NOT NULL`).run(); } catch(_) {}
  // Merchants Guild as a 4th controlling faction in the galaxy.
  try { db.exec(`ALTER TABLE colony_state ADD COLUMN control_guild INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  // Patreon Merchants Guild defaults to majority vote (its historical behavior).
  try { stmt(`UPDATE funds SET governance='vote' WHERE id='MERCHANTS_GUILD' AND governance='executive'`).run(); } catch(_) {}

  // Cost basis on fund holdings: weighted-average entry price per position, so the house
  // Portfolio shows gain-vs-entry (matching personal P&L) instead of the ticker's daily
  // move. Additive + idempotent. Then backfill existing holdings by replaying the logged
  // buy/sell history (fund_activity records price); only applied when the replay reconciles
  // with the current qty, otherwise basis stays 0 and the client shows a placeholder.
  try { db.exec(`ALTER TABLE fund_portfolios ADD COLUMN avg_cost REAL NOT NULL DEFAULT 0`); } catch(_) {}
  try {
    const _need = db.prepare(`SELECT fund_id, symbol, qty FROM fund_portfolios WHERE qty>0 AND (avg_cost IS NULL OR avg_cost<=0)`).all();
    const _hist = db.prepare(`SELECT type, qty, price FROM fund_activity WHERE fund_id=? AND symbol=? AND type IN ('trade_buy','trade_sell') AND qty IS NOT NULL AND price IS NOT NULL ORDER BY ts ASC`);
    const _upd  = db.prepare(`UPDATE fund_portfolios SET avg_cost=? WHERE fund_id=? AND symbol=?`);
    let _fixed = 0;
    for (const r of _need) {
      let q = 0, avg = 0;
      for (const h of _hist.all(r.fund_id, r.symbol)) {
        const hq = Number(h.qty)||0, hp = Number(h.price)||0;
        if (hq <= 0) continue;
        if (h.type === 'trade_buy') { const nq = q + hq; avg = nq>0 ? (q*avg + hq*hp)/nq : 0; q = nq; }
        else { q -= hq; if (q <= 0) { q = 0; avg = 0; } }
      }
      if (q === r.qty && avg > 0) { _upd.run(Math.round(avg*100)/100, r.fund_id, r.symbol); _fixed++; }
    }
    if (_fixed) console.log(`[DB] Backfilled cost basis for ${_fixed} fund holding(s)`);
  } catch (e) { console.error('[DB] fund cost-basis backfill error', e); }

  // Seed special funds if not present
  const now = Date.now();
  const existing = stmt('SELECT id FROM funds').all().map(r => r.id);

  if (!existing.includes('FLSH')) {
    stmt(`INSERT INTO funds(id,name,type,owner_id,description,max_members,slot_cost,savings_rate,cash,created_at)
          VALUES('FLSH','FLSH Capital','flsh',null,'Developer fund. Revenue from all platform trade fees.',999,0,0.0004,100000000000000,?)`)
      .run(now);
  }

  // One-shot: pin the FLSH dev fund to its fixed 100T valuation marker. The live
  // fee accrual is unused/glitched, so this sets a clean flat value once and never
  // repeats (guarded by a fund_state sentinel), preserving any future manual change.
  if (!stmt('SELECT value FROM fund_state WHERE key=?').get('flsh_100t')) {
    stmt(`UPDATE funds SET cash=100000000000000 WHERE id='FLSH'`).run();
    stmt('INSERT OR REPLACE INTO fund_state VALUES(?,?)').run('flsh_100t', '1');
  }

  if (!existing.includes('MERCHANTS_GUILD')) {
    stmt(`INSERT INTO funds(id,name,type,owner_id,description,max_members,slot_cost,savings_rate,cash,created_at)
          VALUES('MERCHANTS_GUILD','Merchants Guild','patreon',null,'Exclusive Patreon hedge fund. Membership via patreon.com/FLSH.',9999,0,0.0004,0,?)`)
      .run(now);
  } else {
    // Uncap existing guild (in case DB was created before this change)
    stmt(`UPDATE funds SET max_members=9999 WHERE id='MERCHANTS_GUILD' AND max_members < 9999`).run();
  }

  console.log('[DB] Funds system ready');
}

// ── Fund CRUD ─────────────────────────────────────────────────────────────────

export function getAllFunds() {
  return stmt('SELECT * FROM funds WHERE closed_at IS NULL ORDER BY created_at ASC').all();
}
export function getFund(id) {
  return stmt('SELECT * FROM funds WHERE id=?').get(id);
}
export function getFundByName(name) {
  return stmt('SELECT * FROM funds WHERE name=? COLLATE NOCASE').get(name);
}
export function createFund(id, name, ownerId, description, maxMembers) {
  const now = Date.now();
  stmt(`INSERT INTO funds(id,name,type,owner_id,description,max_members,slot_cost,savings_rate,cash,created_at,golden_holder)
        VALUES(?,?,'player',?,?,?,100000,0.0004,0,?,?)`)
    .run(id, name, ownerId, description||'', maxMembers||FUND_BASE_SLOTS, now, ownerId);
  // Owner auto-joins
  stmt('INSERT INTO fund_memberships(fund_id,player_id,shares,deposited,joined_at) VALUES(?,?,0,0,?)')
    .run(id, ownerId, now);
}

export function addFundSlots(fundId, count) {
  stmt('UPDATE funds SET max_members=max_members+? WHERE id=?').run(count, fundId);
}

// ── Fund membership ───────────────────────────────────────────────────────────

export function getFundMemberships(fundId) {
  return stmt(`SELECT fm.*,p.name,p.patreon_tier FROM fund_memberships fm
               JOIN players p ON p.id=fm.player_id WHERE fm.fund_id=? ORDER BY fm.shares DESC`).all(fundId);
}
export function getFundMembership(fundId, playerId) {
  return stmt('SELECT * FROM fund_memberships WHERE fund_id=? AND player_id=?').get(fundId, playerId);
}
export function isInFund(fundId, playerId) {
  return !!stmt('SELECT 1 FROM fund_memberships WHERE fund_id=? AND player_id=?').get(fundId, playerId);
}
export function getFundMemberCount(fundId) {
  return (stmt('SELECT COUNT(*) as n FROM fund_memberships WHERE fund_id=?').get(fundId)||{n:0}).n;
}
export function joinFund(fundId, playerId) {
  if (isInFund(fundId, playerId)) throw new Error('already_member');
  const fund = getFund(fundId);
  if (!fund) throw new Error('fund_not_found');
  if (getFundMemberCount(fundId) >= fund.max_members) throw new Error('fund_full');
  stmt('INSERT INTO fund_memberships(fund_id,player_id,shares,deposited,joined_at) VALUES(?,?,0,0,?)')
    .run(fundId, playerId, Date.now());
}

// ── Kick member ───────────────────────────────────────────────────────────────
export function kickFundMember(fundId, targetPlayerId) {
  stmt('DELETE FROM fund_memberships WHERE fund_id=? AND player_id=?').run(fundId, targetPlayerId);
}

// ── Delete fund (owner disband) ───────────────────────────────────────────────
export function deleteFund(fundId) {
  stmt('DELETE FROM fund_memberships WHERE fund_id=?').run(fundId);
  try { stmt('DELETE FROM fund_polls WHERE fund_id=?').run(fundId); } catch(_){}
  try { stmt('DELETE FROM fund_activity WHERE fund_id=?').run(fundId); } catch(_){}
  stmt('DELETE FROM funds WHERE id=?').run(fundId);
}

// ── Update fund name/description ──────────────────────────────────────────────
export function updateFundInfo(fundId, name, description) {
  stmt('UPDATE funds SET name=?,description=? WHERE id=?').run(name, description||'', fundId);
}

// ── Fund polls (player funds only) ───────────────────────────────────────────
export function initFundPolls() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fund_polls (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      fund_id    TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      question   TEXT NOT NULL,
      options    TEXT NOT NULL,
      votes      TEXT NOT NULL DEFAULT '{}',
      status     TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
}
export function createFundPoll(fundId, creatorId, question, options) {
  const now = Date.now();
  const expires = now + 24 * 60 * 60 * 1000;
  const result = stmt(
    `INSERT INTO fund_polls(fund_id,creator_id,question,options,votes,status,created_at,expires_at) VALUES(?,?,?,?,'{}','open',?,?)`
  ).run(fundId, creatorId, question, JSON.stringify(options), now, expires);
  return result.lastInsertRowid;
}
export function getFundPolls(fundId) {
  try {
    const rows = stmt('SELECT * FROM fund_polls WHERE fund_id=? ORDER BY created_at DESC LIMIT 10').all(fundId);
    return rows.map(r => ({ ...r, options: JSON.parse(r.options||'[]'), votes: JSON.parse(r.votes||'{}') }));
  } catch(_) { return []; }
}
export function voteFundPoll(pollId, playerId, optionIndex) {
  const row = stmt('SELECT * FROM fund_polls WHERE id=?').get(pollId);
  if (!row) throw new Error('poll_not_found');
  if (row.status !== 'open' || Date.now() > row.expires_at) throw new Error('poll_closed');
  const votes = JSON.parse(row.votes || '{}');
  if (votes[String(playerId)] !== undefined) throw new Error('already_voted');
  votes[String(playerId)] = optionIndex;
  stmt('UPDATE fund_polls SET votes=? WHERE id=?').run(JSON.stringify(votes), pollId);
  return votes;
}
export function closeFundPoll(pollId) {
  stmt("UPDATE fund_polls SET status='closed' WHERE id=?").run(pollId);
}
export function expireOldFundPolls() {
  try { stmt("UPDATE fund_polls SET status='closed' WHERE status='open' AND expires_at<?").run(Date.now()); } catch(_) {}
}

// ── Fund cash & holdings ──────────────────────────────────────────────────────

export function getFundCashById(fundId) {
  return (getFund(fundId)?.cash) || 0;
}
export function setFundCashById(fundId, v) {
  stmt('UPDATE funds SET cash=? WHERE id=?').run(v, fundId);
}
export function addFundCash(fundId, delta) {
  stmt('UPDATE funds SET cash=cash+? WHERE id=?').run(delta, fundId);
}
export function getFundPortfolio(fundId) {
  return stmt('SELECT symbol,qty,avg_cost FROM fund_portfolios WHERE fund_id=? AND qty>0').all(fundId);
}
export function setFundPortfolioQty(fundId, symbol, qty) {
  // Set absolute qty while PRESERVING avg_cost (used by sells; basis is unchanged when a
  // position is only reduced). INSERT OR REPLACE would wipe avg_cost, so update in place.
  if (qty <= 0) { stmt('DELETE FROM fund_portfolios WHERE fund_id=? AND symbol=?').run(fundId, symbol); return; }
  const cur = stmt('SELECT 1 AS x FROM fund_portfolios WHERE fund_id=? AND symbol=?').get(fundId, symbol);
  if (cur) stmt('UPDATE fund_portfolios SET qty=? WHERE fund_id=? AND symbol=?').run(qty, fundId, symbol);
  else stmt('INSERT INTO fund_portfolios(fund_id,symbol,qty,avg_cost) VALUES(?,?,?,0)').run(fundId, symbol, qty);
}
// Add shares to a fund holding at a unit cost, updating the weighted-average basis
// (mirrors player_cargo addCargo). Used by fund buys so house P&L has a real entry.
export function setFundPortfolioBuy(fundId, symbol, addQty, unitCost) {
  const add = Math.max(0, Math.floor(Number(addQty)||0));
  if (add <= 0) return;
  const cur = stmt('SELECT qty, avg_cost FROM fund_portfolios WHERE fund_id=? AND symbol=?').get(fundId, symbol);
  if (cur && cur.qty > 0) {
    const nq  = cur.qty + add;
    const avg = (cur.qty * (cur.avg_cost||0) + add * unitCost) / nq;
    stmt('UPDATE fund_portfolios SET qty=?, avg_cost=? WHERE fund_id=? AND symbol=?')
      .run(nq, Math.round(avg*100)/100, fundId, symbol);
  } else {
    stmt(`INSERT INTO fund_portfolios(fund_id,symbol,qty,avg_cost) VALUES(?,?,?,?)
          ON CONFLICT(fund_id,symbol) DO UPDATE SET qty=excluded.qty, avg_cost=excluded.avg_cost`)
      .run(fundId, symbol, add, Math.round(unitCost*100)/100);
  }
}
export function getTotalFundSharesById(fundId) {
  return (stmt('SELECT SUM(shares) as s FROM fund_memberships WHERE fund_id=?').get(fundId)||{s:0}).s || 0;
}

// All players holding a positive quantity of a symbol (used to settle a fund ticker's
// public float on delist/disband — must include OFFLINE holders, so this reads the
// holdings table directly rather than iterating online sessions).
export function getHoldersOfSymbol(symbol) {
  try { return stmt('SELECT player_id, qty FROM holdings WHERE symbol=? AND qty>0').all(symbol); }
  catch(_) { return []; }
}
export function getFloatOutstanding(symbol) {
  try { return (stmt('SELECT SUM(qty) AS s FROM holdings WHERE symbol=? AND qty>0').get(symbol)||{s:0}).s || 0; }
  catch(_) { return 0; }
}

// ── Savings interest ──────────────────────────────────────────────────────────
// Call every hour — credits interest to all fund cash balances

export function applyFundSavingsInterest() {
  const funds = getAllFunds();
  let total = 0;
  for (const f of funds) {
    if (f.cash <= 0 || f.savings_rate <= 0) continue;
    const interest = f.cash * f.savings_rate;
    stmt('UPDATE funds SET cash=cash+? WHERE id=?').run(interest, f.id);
    stmt('INSERT INTO fund_activity(fund_id,ts,type,amount,note) VALUES(?,?,?,?,?)')
      .run(f.id, Date.now(), 'interest', interest, `Hourly savings: ${(f.savings_rate*100).toFixed(3)}%`);
    total += interest;
  }
  return total;
}

// ── Deposit / Withdraw ────────────────────────────────────────────────────────

export let fundDepositFn;
export let fundWithdrawFn;

export function setupFundDepositWithdraw() {
  fundDepositFn = transaction((fundId, playerId, amount) => {
    const fund = getFund(fundId); if (!fund) throw new Error('fund_not_found');
    const player = getPlayer(playerId); if (!player) throw new Error('not_found');
    if (player.cash < amount) throw new Error('insufficient_funds');
    if (!isInFund(fundId, playerId)) throw new Error('not_a_member');

    const currentNAV   = getFundNAVById(fundId, null); // pass null, compute internally
    const totalShares  = getTotalFundSharesById(fundId);
    const pricePerShare = totalShares > 0 && currentNAV > 0 ? currentNAV / totalShares : 1;
    const newShares    = amount / pricePerShare;

    stmt('UPDATE players SET cash=cash-?,updated_at=? WHERE id=?').run(amount, Date.now(), playerId);
    stmt('UPDATE funds SET cash=cash+? WHERE id=?').run(amount, fundId);
    stmt(`UPDATE fund_memberships SET shares=shares+?,deposited=deposited+? WHERE fund_id=? AND player_id=?`)
      .run(newShares, amount, fundId, playerId);
    stmt('INSERT INTO fund_activity(fund_id,ts,type,player_id,amount,note) VALUES(?,?,?,?,?,?)')
      .run(fundId, Date.now(), 'deposit', playerId, amount, `${player.name} deposited ₥${amount.toFixed(2)}`);
    return newShares;
  });

  // Cash-based withdrawal (model B): pulls a raw cash AMOUNT out of the fund's
  // liquid cash, capped only by available fund cash — NOT by the member's own
  // stake. Governance is the gate (owner-only / executive enforced at the route).
  // Shares are burned to match the cash pulled so the per-share performance line
  // stays honest; if a member pulls MORE than their own shares are worth (allowed
  // under B), their shares zero out and the excess cash leaving without matching
  // shares correctly drags spp down for everyone — the drain is visible, not hidden.
  fundWithdrawFn = transaction((fundId, playerId, amount, currentNAV) => {
    const member = getFundMembership(fundId, playerId); if (!member) throw new Error('not_a_member');
    const fundCash = getFundCashById(fundId);
    if (fundCash <= 0) throw new Error('no_fund_cash');
    const actual = Math.min(Math.max(0, Number(amount) || 0), fundCash);
    if (actual <= 0) throw new Error('invalid_amount');
    const totalShares   = getTotalFundSharesById(fundId);
    const pricePerShare = totalShares > 0 && currentNAV > 0 ? currentNAV / totalShares : 1;
    const sharesToBurn  = pricePerShare > 0 ? Math.min(member.shares, actual / pricePerShare) : 0;
    stmt('UPDATE funds SET cash=cash-? WHERE id=?').run(actual, fundId);
    stmt('UPDATE players SET cash=cash+?,updated_at=? WHERE id=?').run(actual, Date.now(), playerId);
    if (sharesToBurn > 0)
      stmt('UPDATE fund_memberships SET shares=shares-? WHERE fund_id=? AND player_id=?').run(sharesToBurn, fundId, playerId);
    stmt('INSERT INTO fund_activity(fund_id,ts,type,player_id,amount,note) VALUES(?,?,?,?,?,?)')
      .run(fundId, Date.now(), 'withdraw', playerId, actual, `Withdrew \u0192${actual.toFixed(2)} cash`);
    return actual;
  });
}

// NAV helper (needs live prices — pass holdings + prices map)
export function getFundNAVById(fundId, priceMap) {
  const cash     = getFundCashById(fundId);
  const holdings = getFundPortfolio(fundId);
  const equity   = priceMap
    ? holdings.reduce((acc, h) => acc + (priceMap[h.symbol] || 0) * h.qty, 0)
    : 0;
  return cash + equity;
}

// ─── Index listings (Capital House → tradeable ticker) ────────────────────────
// The numeric company-id space for fund tickers starts here, well clear of the
// 0..(companies-1) index range and the 999x specials (FLSH/SWT/BRNC).
export const FUND_TICKER_ID_BASE = 20000;

export function getFundListing(fundId) {
  try { return stmt('SELECT * FROM fund_listings WHERE fund_id=?').get(fundId) || null; }
  catch(_) { return null; }
}
export function getFundListingBySymbol(symbol) {
  try { return stmt('SELECT * FROM fund_listings WHERE symbol=?').get(symbol) || null; }
  catch(_) { return null; }
}
export function getAllFundListings() {
  try { return stmt('SELECT * FROM fund_listings ORDER BY listed_at ASC').all(); }
  catch(_) { return []; }
}
export function isFundListed(fundId) {
  try { return !!stmt('SELECT 1 FROM fund_listings WHERE fund_id=?').get(fundId); }
  catch(_) { return false; }
}
export function fundSymbolTaken(symbol) {
  // Reserved against BOTH other listings and the base company roster is checked in
  // server.js (which holds the companies array); here we only guard the listings table.
  try { return !!stmt('SELECT 1 FROM fund_listings WHERE symbol=?').get(symbol); }
  catch(_) { return false; }
}
// Next free numeric company id for a new fund ticker (max existing + 1, floored at base).
export function nextFundCompanyId() {
  try {
    const row = stmt('SELECT MAX(company_id) AS m FROM fund_listings').get();
    const m = (row && row.m != null) ? row.m : (FUND_TICKER_ID_BASE - 1);
    return Math.max(FUND_TICKER_ID_BASE, m + 1);
  } catch(_) { return FUND_TICKER_ID_BASE; }
}
export function createFundListing(fundId, symbol, companyId, floatShares, listNav, listPrice) {
  stmt(`INSERT INTO fund_listings(fund_id,symbol,company_id,float_shares,list_nav,list_price,listed_at)
        VALUES(?,?,?,?,?,?,?)`).run(fundId, symbol, companyId, floatShares, listNav, listPrice, Date.now());
}
export function deleteFundListing(fundId) {
  try { stmt('DELETE FROM fund_listings WHERE fund_id=?').run(fundId); } catch(_) {}
}

// ─── Fund-aware share split ───────────────────────────────────────────────────
// When a listed fund ticker crosses the tape ceiling, its price renumbers by RATIO
// and EVERY per-holder share count is multiplied so nothing changes in value. For a
// fund ticker that means scaling BOTH the public float holders (regular holdings,
// handled in server.js) AND the internal fund ledger (fund_memberships.shares), or
// the anchor (NAV / totalShares) would desync from the renumbered price by the full
// ratio. This scales the internal ledger side, transactionally.
// Scale every member's ledger share count by a factor (value-neutral renumbering).
// Used two ways: (1) at listing, to move the ledger so NAV/(ledger'+float) hits the
// target price — float is NOT touched here (it's the fixed public tranche); (2) inside
// a split, where the caller ALSO scales float+holdings by the same ratio so the whole
// book renumbers together. This function deliberately touches only fund_memberships;
// float on the listing row is scaled explicitly by the split path when needed.
export const scaleFundLedgerShares = transaction(function (fundId, ratio) {
  const r = Number(ratio);
  if (!(r > 0) || r === 1) return;
  stmt('UPDATE fund_memberships SET shares = shares * ? WHERE fund_id=?').run(r, fundId);
});

// Scale the fixed float tranche on a listing row (split path only — the public float
// renumbers 1:ratio alongside member shares and holdings so nothing changes in value).
export function scaleFundListingFloat(fundId, ratio) {
  const r = Number(ratio);
  if (!(r > 0) || r === 1) return;
  try { stmt('UPDATE fund_listings SET float_shares = float_shares * ? WHERE fund_id=?').run(r, fundId); } catch(_) {}
}

// All multi-house memberships for one player (reverse of getFundMemberships).
export function getPlayerFundMemberships(playerId) {
  try { return stmt('SELECT fund_id, shares FROM fund_memberships WHERE player_id=? AND shares>0').all(playerId); }
  catch(_) { return []; }
}

// A player's total stake value across BOTH fund systems: their share of each fund's NAV.
// Legacy single fund (fund_members/fund_holdings) + every multi-house they belong to.
// priceMap is symbol->price. Returns Ƒ. Never throws.
export function getPlayerFundStake(playerId, priceMap) {
  let stake = 0;
  // Legacy single fund
  try {
    const m = getFundMember(playerId);
    if (m && m.shares > 0) {
      const total = getTotalFundShares();
      if (total > 0) {
        let nav = getFundCash();
        for (const h of getFundHoldings()) { const px = priceMap ? priceMap[h.symbol] : 0; if (px) nav += px * h.qty; }
        if (nav > 0) stake += (m.shares / total) * nav;
      }
    }
  } catch(_) {}
  // Multi-houses
  try {
    for (const row of getPlayerFundMemberships(playerId)) {
      const total = getTotalFundSharesById(row.fund_id);
      if (total <= 0) continue;
      const nav = getFundNAVById(row.fund_id, priceMap);
      if (nav > 0) stake += (row.shares / total) * nav;
    }
  } catch(_) {}
  return stake;
}

// ── Activity log ──────────────────────────────────────────────────────────────

export function getFundActivity(fundId, limit=30) {
  return stmt(`SELECT a.*,p.name as player_name FROM fund_activity a
               LEFT JOIN players p ON p.id=a.player_id
               WHERE a.fund_id=? ORDER BY a.ts DESC LIMIT ?`).all(fundId, limit);
}
export function logFundActivity(fundId, type, playerId, symbol, qty, price, amount, note) {
  stmt('INSERT INTO fund_activity(fund_id,ts,type,player_id,symbol,qty,price,amount,note) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(fundId, Date.now(), type, playerId||null, symbol||null, qty||null, price||null, amount||null, note||null);
}
// Timestamp (ms) of this fund's most recent activity row of a given type, or 0 if
// none. Used to rate-limit house buys without a dedicated cooldown column: the
// activity log already records every successful trade with a ts, and a rejected
// trade writes no row, so MAX(ts) of 'trade_buy' is exactly the last *successful* buy.
export function getLastFundTradeTs(fundId, type='trade_buy') {
  try {
    const row = stmt('SELECT MAX(ts) AS ts FROM fund_activity WHERE fund_id=? AND type=?').get(fundId, type);
    return row && row.ts ? Number(row.ts) : 0;
  } catch(_) { return 0; }
}

// ── House governance + binding trade proposals ────────────────────────────────
// governance: 'executive' (owner trades) | 'vote' (members decide) | 'council'
//             (members vote, owner has final execute/veto). vote_weight: 'equal'|'shares'

export const VOTE_DURATIONS = { '1800000':'30m', '3600000':'1h', '21600000':'6h', '86400000':'24h', '259200000':'3d' };

export function setFundGovernance(fundId, governance, voteWeight, durationMs) {
  const g = ['executive','vote','council'].includes(governance) ? governance : 'executive';
  const w = ['equal','shares','tenure'].includes(voteWeight) ? voteWeight : 'equal';
  const d = VOTE_DURATIONS[String(durationMs)] ? Number(durationMs) : 21600000; // valid options only, default 6h
  stmt('UPDATE funds SET governance=?, vote_weight=?, vote_duration_ms=? WHERE id=?').run(g, w, d, fundId);
}

// ── Golden share (transferable per-fund veto token) ───────────────────────────
export function getGoldenHolder(fundId) {
  const r = stmt('SELECT golden_holder FROM funds WHERE id=?').get(fundId);
  return r?.golden_holder || null;
}
export function setGoldenHolder(fundId, playerId) {
  stmt('UPDATE funds SET golden_holder=? WHERE id=?').run(playerId, fundId);
}

// ── Fund officers (delegated owner powers) ────────────────────────────────────
// role: 'treasurer' (move cash) | 'trader' (trade without a vote) | 'whip' (force-call votes)
const FUND_OFFICER_ROLES = ['treasurer','trader','whip'];
export function setFundOfficer(fundId, playerId, role) {
  if (!FUND_OFFICER_ROLES.includes(role)) throw new Error('invalid_role');
  stmt(`INSERT INTO fund_officers(fund_id,player_id,role,appointed_at) VALUES(?,?,?,?)
        ON CONFLICT(fund_id,player_id) DO UPDATE SET role=excluded.role, appointed_at=excluded.appointed_at`)
    .run(fundId, playerId, role, Date.now());
}
export function removeFundOfficer(fundId, playerId) {
  stmt('DELETE FROM fund_officers WHERE fund_id=? AND player_id=?').run(fundId, playerId);
}
export function getFundOfficerRole(fundId, playerId) {
  const r = stmt('SELECT role FROM fund_officers WHERE fund_id=? AND player_id=?').get(fundId, playerId);
  return r?.role || null;
}
export function getFundOfficers(fundId) {
  return stmt(`SELECT o.player_id, o.role, p.name FROM fund_officers o
               LEFT JOIN players p ON p.id=o.player_id WHERE o.fund_id=?`).all(fundId);
}

// Player IDs who have cast a vote on a proposal (for early-resolution turnout check).
export function getHouseVoterIds(proposalId) {
  return stmt('SELECT player_id FROM house_votes WHERE proposal_id=?').all(proposalId).map(r => r.player_id);
}

export function createHouseProposal(fundId, proposerId, side, symbol, qty, reason, durationMs) {
  const id = Math.random().toString(36).slice(2,10).toUpperCase();
  const now = Date.now();
  stmt(`INSERT INTO house_proposals(id,fund_id,proposer_id,side,symbol,qty,reason,created_at,expires_at,status)
        VALUES(?,?,?,?,?,?,?,?,?,'open')`)
    .run(id, fundId, proposerId, side, symbol, qty, String(reason||'').slice(0,200), now, now + (durationMs||6*60*60*1000));
  return id;
}

export function getHouseProposal(id) {
  return stmt(`SELECT p.*, pl.name AS proposer_name FROM house_proposals p
               LEFT JOIN players pl ON pl.id=p.proposer_id WHERE p.id=?`).get(id);
}

export function getOpenHouseProposals(fundId) {
  return stmt(`SELECT p.*, pl.name AS proposer_name FROM house_proposals p
               LEFT JOIN players pl ON pl.id=p.proposer_id
               WHERE p.fund_id=? AND p.status IN ('open','advisory_pass','advisory_fail')
               ORDER BY p.created_at DESC`).all(fundId);
}

// All open proposals (any fund) whose timer has elapsed — for the resolution tick.
export function getDueHouseProposals(now) {
  return stmt(`SELECT * FROM house_proposals WHERE status='open' AND expires_at<=?`).all(now || Date.now());
}

export function hasVotedHouse(proposalId, playerId) {
  return !!stmt('SELECT 1 FROM house_votes WHERE proposal_id=? AND player_id=?').get(proposalId, playerId);
}

export function castHouseVote(proposalId, playerId, vote, weight) {
  const w = Math.max(0, Number(weight) || 0);
  stmt('INSERT OR REPLACE INTO house_votes(proposal_id,player_id,vote,weight,voted_at) VALUES(?,?,?,?,?)')
    .run(proposalId, playerId, vote, w, Date.now());
  // Recompute tallies from the votes table (idempotent, handles vote changes).
  const yes = stmt(`SELECT COALESCE(SUM(weight),0) s FROM house_votes WHERE proposal_id=? AND vote='yes'`).get(proposalId).s;
  const no  = stmt(`SELECT COALESCE(SUM(weight),0) s FROM house_votes WHERE proposal_id=? AND vote='no'`).get(proposalId).s;
  stmt('UPDATE house_proposals SET votes_yes=?, votes_no=? WHERE id=?').run(yes, no, proposalId);
  return getHouseProposal(proposalId);
}

export function getHouseVoteCount(proposalId) {
  return stmt('SELECT COUNT(*) c FROM house_votes WHERE proposal_id=?').get(proposalId).c;
}

export function resolveHouseProposal(id, status, executed) {
  stmt('UPDATE house_proposals SET status=?, executed_at=? WHERE id=?')
    .run(status, executed ? Date.now() : null, id);
}

// ── Commodity price grid ──────────────────────────────────────────────────────
export function getColonyCommodityPrices(colonyId) {
  return stmt('SELECT commodity_id, price, supply FROM commodity_prices WHERE colony_id=?').all(colonyId);
}
export function getAllCommodityPrices() {
  return stmt('SELECT colony_id, commodity_id, price, supply FROM commodity_prices').all();
}
export function getCommodityPrice(colonyId, commodityId) {
  return stmt('SELECT colony_id, commodity_id, price, supply FROM commodity_prices WHERE colony_id=? AND commodity_id=?').get(colonyId, commodityId) || null;
}
export function upsertCommodityPrice(colonyId, commodityId, price, supply) {
  stmt(`INSERT INTO commodity_prices(colony_id,commodity_id,price,supply,updated_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(colony_id,commodity_id) DO UPDATE SET price=excluded.price, supply=excluded.supply, updated_at=excluded.updated_at`)
    .run(colonyId, commodityId, price, supply, Date.now());
}

// ── Player cargo hold ─────────────────────────────────────────────────────────
export function getPlayerCargo(playerId) {
  return stmt('SELECT commodity_id, colony_id, qty, avg_cost FROM player_cargo WHERE player_id=? AND qty>0').all(playerId);
}
// Qty of a commodity at a SPECIFIC colony (location-enforced sell uses this).
export function getCargoQty(playerId, commodityId, colonyId) {
  if (colonyId === undefined) {
    // Back-compat: total across all colonies.
    const r = stmt('SELECT COALESCE(SUM(qty),0) q FROM player_cargo WHERE player_id=? AND commodity_id=?').get(playerId, commodityId);
    return r ? r.q : 0;
  }
  const r = stmt('SELECT qty FROM player_cargo WHERE player_id=? AND commodity_id=? AND colony_id=?').get(playerId, commodityId, colonyId);
  return r ? r.qty : 0;
}
export function getCargoTotal(playerId) {
  const r = stmt('SELECT COALESCE(SUM(qty),0) t FROM player_cargo WHERE player_id=?').get(playerId);
  return r ? r.t : 0;
}
// Add qty at a given unit cost AT A COLONY, updating weighted average cost there.
export function addCargo(playerId, commodityId, qty, unitCost, colonyId, storeUnitVal) {
  const loc = colonyId || '';
  // Storage valuation defaults to the acquisition cost when a caller does not
  // supply one, so legacy call sites keep working.
  const sv = Number(storeUnitVal) > 0 ? Number(storeUnitVal) : Number(unitCost) || 0;
  const cur = stmt('SELECT qty, avg_cost, store_unit_val FROM player_cargo WHERE player_id=? AND commodity_id=? AND colony_id=?').get(playerId, commodityId, loc);
  if (cur && cur.qty > 0) {
    const newQty = cur.qty + qty;
    const newAvg = (cur.qty * cur.avg_cost + qty * unitCost) / newQty;
    // Blended the same way as cost basis: a partial sale later releases capacity
    // at the blend rather than needing per-lot bookkeeping.
    const newSV  = (cur.qty * (cur.store_unit_val || cur.avg_cost) + qty * sv) / newQty;
    stmt('UPDATE player_cargo SET qty=?, avg_cost=?, store_unit_val=? WHERE player_id=? AND commodity_id=? AND colony_id=?')
      .run(newQty, Math.round(newAvg * 100) / 100, Math.round(newSV * 100) / 100, playerId, commodityId, loc);
  } else {
    stmt(`INSERT INTO player_cargo(player_id,commodity_id,colony_id,qty,avg_cost,store_unit_val) VALUES(?,?,?,?,?,?)
          ON CONFLICT(player_id,commodity_id,colony_id) DO UPDATE SET qty=excluded.qty, avg_cost=excluded.avg_cost, store_unit_val=excluded.store_unit_val`)
      .run(playerId, commodityId, loc, qty, Math.round(unitCost * 100) / 100, Math.round(sv * 100) / 100);
  }
}
// Remove qty AT A COLONY (clamped to held there). Returns qty actually removed.
export function removeCargo(playerId, commodityId, qty, colonyId) {
  const loc = colonyId || '';
  const cur = stmt('SELECT qty FROM player_cargo WHERE player_id=? AND commodity_id=? AND colony_id=?').get(playerId, commodityId, loc);
  if (!cur || cur.qty <= 0) return 0;
  const take = Math.min(qty, cur.qty);
  stmt('UPDATE player_cargo SET qty=qty-? WHERE player_id=? AND commodity_id=? AND colony_id=?').run(take, playerId, commodityId, loc);
  return take;
}

// ── Cargo shipments (goods in transit, escrowed) ──────────────────────────────
export function createCargoShipment(s) {
  stmt(`INSERT INTO cargo_shipments
    (id,player_id,commodity_id,qty,buy_cost,from_colony,to_colony,lane_type,insured,insurance_paid,intercept_chance,created_at,resolve_ts,status,phase,phase_idx,ship_class,sell_value)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'in_transit',?,?,?,?)`)
    .run(s.id, s.playerId, s.commodityId, s.qty, s.buyCost, s.from, s.to, s.laneType,
         s.insured?1:0, s.insurancePaid||0, s.interceptChance||0, s.createdAt, s.resolveTs,
         s.phase||'loading', s.phaseIdx||0, s.shipClass||'courier', s.sellValue||0);
}
export function getCargoShipment(id) {
  return stmt('SELECT * FROM cargo_shipments WHERE id=?').get(id) || null;
}
export function getPlayerCargoShipments(playerId, status='in_transit') {
  return stmt('SELECT * FROM cargo_shipments WHERE player_id=? AND status=? ORDER BY resolve_ts ASC').all(playerId, status);
}
export function getDueCargoShipments(now) {
  return stmt("SELECT * FROM cargo_shipments WHERE status='in_transit' AND resolve_ts<=?").all(now || Date.now());
}
// All active shipments (for phase stepping regardless of final resolve time).
export function getActiveCargoShipments() {
  return stmt("SELECT * FROM cargo_shipments WHERE status='in_transit'").all();
}
export function setCargoShipmentPhase(id, phase, phaseIdx) {
  stmt('UPDATE cargo_shipments SET phase=?, phase_idx=? WHERE id=?').run(phase, phaseIdx, id);
}
export function setCargoShipmentStatus(id, status) {
  stmt('UPDATE cargo_shipments SET status=? WHERE id=?').run(status, id);
}

// ── Shipping contracts (options) ──────────────────────────────────────────────
export function createShippingContract(c) {
  stmt(`INSERT INTO shipping_contracts
    (id,player_id,commodity_id,from_colony,to_colony,lane_type,strike_spread,premium_paid,size,created_at,expires_at,status,payout)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'open',0)`)
    .run(c.id, c.playerId, c.commodityId, c.from, c.to, c.laneType,
         c.strikeSpread, c.premiumPaid, c.size, c.createdAt, c.expiresAt);
}
export function getShippingContract(id) {
  return stmt('SELECT * FROM shipping_contracts WHERE id=?').get(id) || null;
}
export function getPlayerShippingContracts(playerId, status='open') {
  return stmt('SELECT * FROM shipping_contracts WHERE player_id=? AND status=? ORDER BY expires_at ASC').all(playerId, status);
}
export function getExpiredOpenContracts(now) {
  return stmt("SELECT * FROM shipping_contracts WHERE status='open' AND expires_at<=?").all(now || Date.now());
}
export function settleShippingContract(id, status, payout, settledAt) {
  stmt('UPDATE shipping_contracts SET status=?, payout=?, settled_at=? WHERE id=?')
    .run(status, payout || 0, settledAt || Date.now(), id);
}


export function setDevAccount(playerId, isDev) {
  // ── OWNER LOCK: MrFlesh/is_prime account cannot have dev status altered ──
  try {
    const row = stmt('SELECT is_prime FROM players WHERE id=?').get(playerId);
    if (row?.is_prime) {
      console.warn('[Security] Blocked attempt to alter dev status of owner account.');
      return;
    }
  } catch(_) {}
  // Lazy add is_dev column
  try { db.exec('ALTER TABLE players ADD COLUMN is_dev INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  stmt('UPDATE players SET is_dev=? WHERE id=?').run(isDev ? 1 : 0, playerId);
}
export function isDevAccount(playerId) {
  try {
    const row = stmt('SELECT is_dev FROM players WHERE id=?').get(playerId);
    return !!(row?.is_dev);
  } catch(_) { return false; }
}

// Sync dev accounts from env on startup — also auto-enrolls them into fleshstation faction
export function syncDevAccounts(devNames) {
  if (!devNames || !devNames.length) return;
  try { db.exec('ALTER TABLE players ADD COLUMN is_dev   INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE players ADD COLUMN is_prime INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE players ADD COLUMN faction TEXT'); } catch(_){}
  try {
    db.exec('ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0');
    // Column just created — mark all EXISTING players as seen so only new accounts get the tutorial
    db.exec('UPDATE players SET tutorial_seen=1');
    console.log('[Migration] Added tutorial_seen column, marked all existing players as seen');
  } catch(_){}
  // Reset all devs EXCEPT the owner (is_prime=1) — owner role is immutable
  stmt('UPDATE players SET is_dev=0, is_admin=0 WHERE is_prime=0').run();
  for (const name of devNames) {
    const p = getPlayerByName(name.trim());
    if (p) {
      // Never alter the owner's role flags via this sync
      if (p.is_prime) {
        console.log(`[Dev] Skipping role sync for owner account: ${p.name}`);
        continue;
      }
      stmt('UPDATE players SET is_dev=1, is_admin=1, faction=? WHERE id=?').run('fleshstation', p.id);
      console.log(`[Dev] Flagged ${p.name} as dev → Flesh Station faction`);
    }
  }
}

export function isOwnerAccount(playerId) {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN is_prime INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    const row = stmt('SELECT is_prime FROM players WHERE id=?').get(playerId);
    return !!(row?.is_prime);
  } catch(_) { return false; }
}

// Bulk-fetch all player factions (for server-side passive bonus computation)
export function getPlayerFactionsBulk() {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN faction_joined_at INTEGER'); } catch(_){}
    const rows = stmt('SELECT id, faction, faction_joined_at FROM players WHERE faction IS NOT NULL').all();
    const map = {};
    for (const r of rows) map[r.id] = { faction: r.faction, joinedAt: r.faction_joined_at || 0 };
    return map;
  } catch(_) { return {}; }
}

// ─── Admin / Moderation ───────────────────────────────────────────────────────

export function isAdminAccount(playerId) {
  try {
    // Lazy-add column if needed
    try { db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
    const row = stmt('SELECT is_admin, is_dev FROM players WHERE id=?').get(playerId);
    return !!(row?.is_admin || row?.is_dev); // dev accounts are always admin
  } catch(_) { return false; }
}

export function setAdminAccount(playerId, isAdmin) {
  // ── OWNER LOCK: MrFlesh/is_prime account cannot have admin status altered ──
  try {
    const row = stmt('SELECT is_prime FROM players WHERE id=?').get(playerId);
    if (row?.is_prime) {
      console.warn('[Security] Blocked attempt to alter admin status of owner account.');
      return;
    }
  } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  stmt('UPDATE players SET is_admin=? WHERE id=?').run(isAdmin ? 1 : 0, playerId);
}

// Persist mutes to DB so they survive server restarts
export function initModerationTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS moderation (
    player_id  TEXT PRIMARY KEY,
    muted_until INTEGER NOT NULL DEFAULT 0,
    banned_until INTEGER NOT NULL DEFAULT 0,
    muted_by    TEXT,
    reason      TEXT,
    is_dunced   INTEGER NOT NULL DEFAULT 0,
    dunce_by    TEXT,
    dunce_reason TEXT
  )`);
  // Migration: add dunce columns if they don't exist yet
  try { db.exec(`ALTER TABLE moderation ADD COLUMN is_dunced INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE moderation ADD COLUMN dunce_by TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE moderation ADD COLUMN dunce_reason TEXT`); } catch(_) {}
  // Migration v0.7.7: add implant slot to player_equipped
  try { db.exec(`ALTER TABLE player_equipped ADD COLUMN implant TEXT`); } catch(_) {}
  // Migration v0.7.8: add jewelry slots
  try { db.exec(`ALTER TABLE player_equipped ADD COLUMN ring TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE player_equipped ADD COLUMN earring TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE player_equipped ADD COLUMN bracelet TEXT`); } catch(_) {}
  // Migration v0.8: faction lock timestamp
  try { db.exec('ALTER TABLE players ADD COLUMN faction_joined_at INTEGER'); } catch(_){}
  // Migration v0.8: add Abaddon cluster colonies for existing databases
  for (const c of COLONY_DEFAULTS) {
    try {
      db.prepare(`INSERT OR IGNORE INTO colony_state
        (id,faction,control_coalition,control_syndicate,control_void,control_guild,tension,contested,war_chest)
        VALUES(?,?,?,?,?,?,?,?,0)`)
        .run(c.id, c.faction, c.control_coalition, c.control_syndicate, c.control_void, c.control_guild||0, c.tension, c.contested);
    } catch(_) {}
  }
}

export function setDunce(targetId, duncedBy, reason) {
  stmt(`INSERT INTO moderation (player_id, is_dunced, dunce_by, dunce_reason)
    VALUES (?,1,?,?)
    ON CONFLICT(player_id) DO UPDATE SET is_dunced=1,
      dunce_by=excluded.dunce_by, dunce_reason=excluded.dunce_reason`
  ).run(targetId, duncedBy || '', reason || '');
}

export function clearDunce(targetId) {
  stmt(`UPDATE moderation SET is_dunced=0 WHERE player_id=?`).run(targetId);
}

// ── Margin calls ────────────────────────────────────────────────────────────
export function setMarginCall(playerId, symbol, calledAt, deadline) {
  stmt(`INSERT INTO margin_calls(player_id,symbol,called_at,deadline) VALUES(?,?,?,?)
        ON CONFLICT(player_id) DO UPDATE SET symbol=excluded.symbol,
          called_at=excluded.called_at, deadline=excluded.deadline`)
    .run(playerId, symbol, calledAt, deadline);
}
export function getMarginCall(playerId) {
  try { return stmt('SELECT player_id,symbol,called_at,deadline FROM margin_calls WHERE player_id=?').get(playerId) || null; }
  catch(_) { return null; }
}
export function clearMarginCall(playerId) {
  try { stmt('DELETE FROM margin_calls WHERE player_id=?').run(playerId); } catch(_) {}
}
export function getActiveMarginCalls() {
  try { return stmt('SELECT player_id,symbol,called_at,deadline FROM margin_calls').all(); }
  catch(_) { return []; }
}

// ── Limit Order DB helpers ──────────────────────────────────────────────────
export function saveLimitOrder(o) {
  stmt(`INSERT OR REPLACE INTO limit_orders(id,player_id,side,symbol,qty,limit_price,reserved_cash,ts)
        VALUES(?,?,?,?,?,?,?,?)`)
    .run(o.id, o.playerId, o.side, o.symbol, o.qty, o.limitPrice, o.reservedCash, o.ts);
}
export function deleteLimitOrder(id) {
  stmt('DELETE FROM limit_orders WHERE id=?').run(id);
}
export function deletePlayerLimitOrders(playerId) {
  stmt('DELETE FROM limit_orders WHERE player_id=?').run(playerId);
}
export function getAllLimitOrders() {
  return stmt('SELECT * FROM limit_orders ORDER BY ts ASC').all();
}

export function isDunced(targetId) {
  try {
    const row = stmt('SELECT is_dunced FROM moderation WHERE player_id=?').get(targetId);
    return !!(row?.is_dunced);
  } catch(_) { return false; }
}

export function getDunceRecord(targetId) {
  try {
    const row = stmt('SELECT dunce_by, dunce_reason FROM moderation WHERE player_id=?').get(targetId);
    return row || null;
  } catch(_) { return null; }
}

export function setMute(targetId, mutedUntilMs, mutedBy, reason) {
  stmt(`INSERT INTO moderation (player_id, muted_until, muted_by, reason)
    VALUES (?,?,?,?)
    ON CONFLICT(player_id) DO UPDATE SET muted_until=excluded.muted_until,
      muted_by=excluded.muted_by, reason=excluded.reason`
  ).run(targetId, mutedUntilMs, mutedBy || '', reason || '');
}

export function clearMute(targetId) {
  stmt(`UPDATE moderation SET muted_until=0 WHERE player_id=?`).run(targetId);
}

export function isMuted(targetId) {
  try {
    const row = stmt('SELECT muted_until FROM moderation WHERE player_id=?').get(targetId);
    if (!row) return false;
    return row.muted_until > Date.now();
  } catch(_) { return false; }
}

export function getMuteExpiry(targetId) {
  try {
    const row = stmt('SELECT muted_until FROM moderation WHERE player_id=?').get(targetId);
    return row?.muted_until || 0;
  } catch(_) { return 0; }
}

export function setBan(targetId, bannedUntilMs, bannedBy, reason) {
  stmt(`INSERT INTO moderation (player_id, banned_until, muted_by, reason)
    VALUES (?,0,?,?)
    ON CONFLICT(player_id) DO UPDATE SET banned_until=excluded.banned_until,
      muted_by=excluded.muted_by, reason=excluded.reason`
  ).run(targetId, bannedBy || '', reason || '');
  stmt('UPDATE moderation SET banned_until=? WHERE player_id=?').run(bannedUntilMs, targetId);
}

export function isBanned(targetId) {
  try {
    const row = stmt('SELECT banned_until FROM moderation WHERE player_id=?').get(targetId);
    if (!row) return false;
    return row.banned_until > Date.now();
  } catch(_) { return false; }
}

export function getModerationRecord(targetId) {
  try {
    return stmt('SELECT * FROM moderation WHERE player_id=?').get(targetId) || null;
  } catch(_) { return null; }
}

// ─── Galaxy: Colony State ─────────────────────────────────────────────────────

// Default colony data — seeded on first access
const COLONY_DEFAULTS = [
  { id:'new_anchor',       faction:'coalition',    control_coalition:82, control_syndicate:12, control_void:6,  control_guild:0,  tension:18, contested:0 },
  { id:'cascade_station',  faction:'coalition',    control_coalition:68, control_syndicate:20, control_void:12, control_guild:0,  tension:32, contested:1 },
  { id:'frontier_outpost', faction:'coalition',    control_coalition:51, control_syndicate:38, control_void:11, control_guild:0,  tension:49, contested:1 },
  { id:'the_hollow',       faction:'syndicate',    control_coalition:15, control_syndicate:74, control_void:11, control_guild:0,  tension:26, contested:0 },
  { id:'vein_cluster',     faction:'syndicate',    control_coalition:8,  control_syndicate:71, control_void:21, control_guild:0,  tension:29, contested:0 },
  { id:'aurora_prime',     faction:'coalition',    control_coalition:76, control_syndicate:10, control_void:14, control_guild:0,  tension:24, contested:0 },
  { id:'null_point',       faction:'void',         control_coalition:5,  control_syndicate:22, control_void:73, control_guild:0,  tension:22, contested:0 },
  { id:'flesh_station',    faction:'fleshstation', control_coalition:0,  control_syndicate:0,  control_void:0,  control_guild:0,  tension:0,  contested:0 },
  { id:'limbosis',         faction:'contested',    control_coalition:34, control_syndicate:33, control_void:33, control_guild:0,  tension:88, contested:1 },
  { id:'lustandia',        faction:'syndicate',    control_coalition:10, control_syndicate:62, control_void:28, control_guild:0,  tension:55, contested:0 },
  { id:'gluttonis',        faction:'contested',    control_coalition:28, control_syndicate:42, control_void:30, control_guild:0,  tension:74, contested:1 },
  { id:'abaddon',          faction:'contested',    control_coalition:20, control_syndicate:40, control_void:40, control_guild:0,  tension:95, contested:1 },
  { id:'eyejog',           faction:'guild',        control_coalition:14, control_syndicate:11, control_void:7,  control_guild:68, tension:30, contested:0 },
  { id:'dust_basin',       faction:'guild',        control_coalition:12, control_syndicate:20, control_void:8,  control_guild:60, tension:40, contested:0 },
  { id:'nova_reach',       faction:'coalition',    control_coalition:70, control_syndicate:18, control_void:12, control_guild:0,  tension:26, contested:0 },
  { id:'iron_shelf',       faction:'syndicate',    control_coalition:18, control_syndicate:60, control_void:22, control_guild:0,  tension:44, contested:0 },
  { id:'the_ledger',       faction:'contested',    control_coalition:30, control_syndicate:38, control_void:32, control_guild:0,  tension:70, contested:1 },
  { id:'signal_run',       faction:'contested',    control_coalition:35, control_syndicate:35, control_void:30, control_guild:0,  tension:60, contested:1 },
  { id:'scrub_yard',       faction:'syndicate',    control_coalition:14, control_syndicate:68, control_void:18, control_guild:0,  tension:48, contested:0 },
  { id:'the_escrow',       faction:'void',         control_coalition:20, control_syndicate:25, control_void:55, control_guild:0,  tension:50, contested:0 },
  { id:'margin_call',      faction:'syndicate',    control_coalition:12, control_syndicate:66, control_void:22, control_guild:0,  tension:52, contested:0 },
  // ── Jade Circuit (1.5.0.0) ─────────────────────────────────────────────────
  // The sixteen Circuit worlds, seeded server side at last. Until this release
  // they existed only as client map data, which is why the Circuit could be
  // joined as an allegiance but owned no ground, ran no commodity market and
  // could not host a city.
  //
  // There is no control_jade column, so the four control values here are the
  // OUTSIDE powers' footholds on Circuit ground and they deliberately sum low.
  // colonyLeadingFaction() short circuits on faction==='jade' rather than
  // reading them. Consequence, stated plainly: Circuit worlds are outside the
  // conquest layer for now. Funding cannot flip them because there is nothing
  // to flip them TO. That is the honest state until control_jade exists, and
  // it is a separate release with a schema migration in it.
  { id:'yujing',            faction:'jade', control_coalition:2,  control_syndicate:1,  control_void:1,  control_guild:4,  tension:12, contested:0 },
  { id:'tiangong',          faction:'jade', control_coalition:1,  control_syndicate:2,  control_void:1,  control_guild:3,  tension:16, contested:0 },
  { id:'xuanwu_bastion',    faction:'jade', control_coalition:1,  control_syndicate:1,  control_void:1,  control_guild:2,  tension:20, contested:0 },
  { id:'quanzhou_docks',    faction:'jade', control_coalition:3,  control_syndicate:2,  control_void:1,  control_guild:8,  tension:26, contested:0 },
  { id:'zhenghe_anchorage', faction:'jade', control_coalition:2,  control_syndicate:2,  control_void:1,  control_guild:7,  tension:24, contested:0 },
  { id:'shennong_reach',    faction:'jade', control_coalition:2,  control_syndicate:1,  control_void:1,  control_guild:3,  tension:18, contested:0 },
  { id:'changzheng_yards',  faction:'jade', control_coalition:1,  control_syndicate:3,  control_void:2,  control_guild:3,  tension:30, contested:0 },
  { id:'houtu_foundry',     faction:'jade', control_coalition:1,  control_syndicate:4,  control_void:2,  control_guild:2,  tension:34, contested:0 },
  { id:'mozi_array',        faction:'jade', control_coalition:3,  control_syndicate:1,  control_void:3,  control_guild:2,  tension:22, contested:0 },
  { id:'zhurong_foundry',   faction:'jade', control_coalition:1,  control_syndicate:4,  control_void:2,  control_guild:2,  tension:36, contested:0 },
  { id:'houji_fields',      faction:'jade', control_coalition:2,  control_syndicate:1,  control_void:1,  control_guild:2,  tension:15, contested:0 },
  { id:'haisi_waystation',  faction:'jade', control_coalition:2,  control_syndicate:3,  control_void:2,  control_guild:6,  tension:32, contested:0 },
  { id:'lingtai_reach',     faction:'jade', control_coalition:2,  control_syndicate:1,  control_void:3,  control_guild:1,  tension:21, contested:0 },
  { id:'fuxi_observatory',  faction:'jade', control_coalition:2,  control_syndicate:1,  control_void:4,  control_guild:1,  tension:19, contested:0 },
  { id:'wukong_deep',       faction:'jade', control_coalition:1,  control_syndicate:3,  control_void:5,  control_guild:1,  tension:40, contested:0 },
  { id:'chiyou_marches',    faction:'jade', control_coalition:1,  control_syndicate:5,  control_void:5,  control_guild:1,  tension:52, contested:0 },
];

export function seedColoniesIfEmpty() {
  // Per-colony backfill: INSERT OR IGNORE every default so colonies added after
  // the initial seed (e.g. the lower cluster) get inserted on the next boot
  // without disturbing existing rows' live control/tension values.
  let added = 0;
  for (const c of COLONY_DEFAULTS) {
    const before = stmt('SELECT 1 FROM colony_state WHERE id=?').get(c.id);
    if (before) continue;
    stmt(`INSERT OR IGNORE INTO colony_state
      (id,faction,control_coalition,control_syndicate,control_void,control_guild,tension,contested,war_chest)
      VALUES(?,?,?,?,?,?,?,?,0)`)
      .run(c.id, c.faction, c.control_coalition, c.control_syndicate, c.control_void, c.control_guild||0, c.tension, c.contested);
    added++;
  }
  if (added > 0) console.log(`[Galaxy] Colony state seeded (${added} colon${added===1?'y':'ies'})`);

  // One-time correction: eyejog + dust_basin were seeded as coalition/syndicate
  // before the Guild became a controlling faction. Hand them to the Guild as its
  // starting territory — but only if no player funding has shifted them yet
  // (war_chest still 0), so we never overwrite live contested state.
  for (const c of COLONY_DEFAULTS) {
    if (c.faction !== 'guild') continue;
    const row = stmt('SELECT faction, war_chest, control_guild FROM colony_state WHERE id=?').get(c.id);
    if (row && row.faction !== 'guild' && (row.war_chest||0) === 0 && (row.control_guild||0) === 0) {
      stmt(`UPDATE colony_state SET faction=?, control_coalition=?, control_syndicate=?, control_void=?, control_guild=?, tension=?, contested=? WHERE id=?`)
        .run(c.faction, c.control_coalition, c.control_syndicate, c.control_void, c.control_guild, c.tension, c.contested, c.id);
      console.log(`[Galaxy] ${c.id} assigned to Merchants Guild (starting territory)`);
    }
  }
}

export function getAllColonyStates() {
  return stmt('SELECT * FROM colony_state').all();
}

export function getColonyState(colonyId) {
  return stmt('SELECT * FROM colony_state WHERE id=?').get(colonyId) || null;
}

export function updateColonyState(colonyId, fields) {
  const sets = Object.keys(fields).map(k => `${k}=?`).join(',');
  const vals = Object.values(fields);
  stmt(`UPDATE colony_state SET ${sets} WHERE id=?`).run(...vals, colonyId);
}

export function getColonyTopFunders(colonyId, factionId, limit=5) {
  return stmt(`SELECT player_id, SUM(amount) as total FROM faction_funding
               WHERE colony_id=? AND faction_id=? GROUP BY player_id
               ORDER BY total DESC LIMIT ?`).all(colonyId, factionId, limit);
}

export function recordFactionFunding(playerId, colonyId, factionId, amount) {
  stmt(`INSERT INTO faction_funding(player_id,colony_id,faction_id,amount,ts)
        VALUES(?,?,?,?,?)`).run(playerId, colonyId, factionId, amount, Date.now());
  stmt('UPDATE colony_state SET war_chest=war_chest+? WHERE id=?').run(amount, colonyId);
}

export function getPlayerFactionFunding(playerId, colonyId) {
  return stmt(`SELECT faction_id, SUM(amount) as total FROM faction_funding
               WHERE player_id=? AND colony_id=? GROUP BY faction_id`).all(playerId, colonyId);
}

// Pooled war funding: contributions to a (colony, faction) accumulate here until
// they cross a full 1%-worth (Ƒ10M), at which point that whole increment is
// converted to control and subtracted out. The remainder persists across restarts
// so nobody's partial contribution is lost.
export function getWarFundPending(colonyId, factionId) {
  const row = stmt('SELECT pending FROM war_fund_pool WHERE colony_id=? AND faction_id=?').get(colonyId, factionId);
  return row ? (Number(row.pending) || 0) : 0;
}
export function setWarFundPending(colonyId, factionId, pending) {
  const v = Math.max(0, Number(pending) || 0);
  stmt(`INSERT INTO war_fund_pool(colony_id,faction_id,pending) VALUES(?,?,?)
        ON CONFLICT(colony_id,faction_id) DO UPDATE SET pending=excluded.pending`).run(colonyId, factionId, v);
}

// ─── Galaxy: Player Faction ───────────────────────────────────────────────────

export function setPlayerFaction(playerId, factionId) {
  try { db.exec('ALTER TABLE players ADD COLUMN faction TEXT'); } catch(_){}
  try { db.exec('ALTER TABLE players ADD COLUMN faction_joined_at INTEGER'); } catch(_){}
  stmt('UPDATE players SET faction=?,faction_joined_at=?,updated_at=? WHERE id=?').run(factionId||null, Date.now(), Date.now(), playerId);
}

export function getPlayerFaction(playerId) {
  try {
    const row = stmt('SELECT faction FROM players WHERE id=?').get(playerId);
    return row?.faction || null;
  } catch(_) { return null; }
}

export function getPlayerFactionData(playerId) {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN faction_joined_at INTEGER'); } catch(_){}
    try { db.exec('ALTER TABLE players ADD COLUMN void_locked INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    try { db.exec('ALTER TABLE players ADD COLUMN void_president_escaped INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    const row = stmt('SELECT faction, faction_joined_at, void_locked, void_president_escaped FROM players WHERE id=?').get(playerId);
    return { faction: row?.faction || null, joinedAt: row?.faction_joined_at || null, voidLocked: !!(row?.void_locked), voidPresidentEscaped: !!(row?.void_president_escaped) };
  } catch(_) { return { faction: null, joinedAt: null, voidLocked: false, voidPresidentEscaped: false }; }
}

export function setVoidLocked(playerId) {
  try { db.exec('ALTER TABLE players ADD COLUMN void_locked INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  stmt('UPDATE players SET void_locked=1 WHERE id=?').run(playerId);
}

export function isVoidLocked(playerId) {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN void_locked INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    const row = stmt('SELECT void_locked FROM players WHERE id=?').get(playerId);
    return !!(row?.void_locked);
  } catch(_) { return false; }
}

export function setVoidPresidentEscaped(playerId) {
  try { db.exec('ALTER TABLE players ADD COLUMN void_president_escaped INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  stmt('UPDATE players SET void_president_escaped=1 WHERE id=?').run(playerId);
}

export function isVoidPresidentEscaped(playerId) {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN void_president_escaped INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    const row = stmt('SELECT void_president_escaped FROM players WHERE id=?').get(playerId);
    return !!(row?.void_president_escaped);
  } catch(_) { return false; }
}


// ─── Item System ──────────────────────────────────────────────────────────────

export const ITEM_CATALOG = {
  // ── Vehicles ──
  rusted_bicycle: {id:'rusted_bicycle',slot:'vehicle',name:'Scrap Moped',rarity:'common',passive:10,img:'rusted_bicycle.png'},
  honda_civic: {id:'honda_civic',slot:'vehicle',name:'Ghost Runner',rarity:'common',passive:10,img:'honda_civic.png'},
  ford_mustang: {id:'ford_mustang',slot:'vehicle',name:'Neon Racer',rarity:'uncommon',passive:25,img:'ford_mustang.png'},
  bmw_m3: {id:'bmw_m3',slot:'vehicle',name:'Chrome Blade',rarity:'rare',passive:75,img:'bmw_m3.png'},
  lamborghini: {id:'lamborghini',slot:'vehicle',name:'Phantom GT',rarity:'epic',passive:200,img:'lamborghini.png'},
  bugatti: {id:'bugatti',slot:'vehicle',name:'Apex Wraith',rarity:'epic',passive:200,img:'bugatti.png'},
  yacht: {id:'yacht',slot:'vehicle',name:'Syndicate Cruiser',rarity:'legendary',passive:500,img:'yacht.png'},
  private_jet: {id:'private_jet',slot:'vehicle',name:'Blackwing Jet',rarity:'legendary',passive:500,img:'private_jet.png'},
  // ── Property ──
  cardboard_box: {id:'cardboard_box',slot:'property',name:'Gutter Bunk',rarity:'common',passive:10,img:'cardboard_box.png'},
  studio_apartment: {id:'studio_apartment',slot:'property',name:'Stack Pod',rarity:'common',passive:10,img:'studio_apartment.png'},
  one_bed_flat: {id:'one_bed_flat',slot:'property',name:'Hab Unit',rarity:'uncommon',passive:25,img:'one_bed_flat.png'},
  condo: {id:'condo',slot:'property',name:'Mid-Stack Condo',rarity:'rare',passive:75,img:'condo.png'},
  penthouse: {id:'penthouse',slot:'property',name:'Spire Suite',rarity:'epic',passive:200,img:'penthouse.png'},
  private_island: {id:'private_island',slot:'property',name:'Sovereign Atoll',rarity:'legendary',passive:500,img:'private_island.png'},
  flesh_suite: {id:'flesh_suite',slot:'property',name:'Flesh Station Suite',rarity:'legendary',passive:500,img:'flesh_suite.png'},
  // ── Watch ──
  casio: {id:'casio',slot:'watch',name:'Axiom Steel',rarity:'common',passive:10,img:'casio.png'},
  seiko: {id:'seiko',slot:'watch',name:'Axiom Silver',rarity:'uncommon',passive:25,img:'seiko.png'},
  tag_heuer: {id:'tag_heuer',slot:'watch',name:'Axiom Gold',rarity:'rare',passive:75,img:'tag_heuer.png'},
  rolex: {id:'rolex',slot:'watch',name:'Axiom Diamond',rarity:'epic',passive:200,img:'rolex.png'},
  patek: {id:'patek',slot:'watch',name:'Axiom Obsidian',rarity:'legendary',passive:500,img:'patek.png'},
  // ── Necklace ──
  rope_chain: {id:'rope_chain',slot:'necklace',name:'Steel Chain',rarity:'common',passive:10,img:'rope_chain.png'},
  silver_chain: {id:'silver_chain',slot:'necklace',name:'Silver Chain',rarity:'uncommon',passive:25,img:'silver_chain.png'},
  gold_chain: {id:'gold_chain',slot:'necklace',name:'Gold Chain',rarity:'rare',passive:75,img:'gold_chain.png'},
  diamond_chain: {id:'diamond_chain',slot:'necklace',name:'Diamond Chain',rarity:'epic',passive:200,img:'diamond_chain.png'},
  flesh_chain: {id:'flesh_chain',slot:'necklace',name:'Obsidian Chain',rarity:'legendary',passive:500,img:'flesh_chain.png'},
  // ── Glasses ──
  plastic_frames: {id:'plastic_frames',slot:'glasses',name:'Vex Basics',rarity:'common',passive:10,img:'plastic_frames.png'},
  wayfarers: {id:'wayfarers',slot:'glasses',name:'Vex Silver',rarity:'uncommon',passive:25,img:'wayfarers.png'},
  aviators: {id:'aviators',slot:'glasses',name:'Vex Gold',rarity:'rare',passive:75,img:'aviators.png'},
  gold_frames: {id:'gold_frames',slot:'glasses',name:'Vex Diamond',rarity:'epic',passive:200,img:'gold_frames.png'},
  diamond_monocle: {id:'diamond_monocle',slot:'glasses',name:'Vex Obsidian',rarity:'legendary',passive:500,img:'diamond_monocle.png'},
  // ── Hats ──
  neon_beanie: {id:'neon_beanie',slot:'hat',name:'Neon Beanie',rarity:'common',passive:15,img:'cyberpunk_neon_beanie.png'},
  snap_cap: {id:'snap_cap',slot:'hat',name:'Snap Cap',rarity:'common',passive:15,img:'cyberpunk_snap_cap.png'},
  pom_beanie: {id:'pom_beanie',slot:'hat',name:'Knit Beanie',rarity:'common',passive:15,img:'cyberpunk_pom_beanie.png'},
  cat_ear_beanie: {id:'cat_ear_beanie',slot:'hat',name:'Cat-Ear Beanie',rarity:'uncommon',passive:35,img:'cyberpunk_cat_ear_beanie.png'},
  visor_band: {id:'visor_band',slot:'hat',name:'Neon Visor',rarity:'uncommon',passive:35,img:'cyberpunk_visor_band.png'},
  assassin_hood: {id:'assassin_hood',slot:'hat',name:'Assassin Hood',rarity:'rare',passive:85,img:'cyberpunk_assassin_hood.png'},
  shadow_cowl: {id:'shadow_cowl',slot:'hat',name:'Shadow Cowl',rarity:'rare',passive:85,img:'cyberpunk_shadow_cowl.png'},
  combat_mask: {id:'combat_mask',slot:'hat',name:'Combat Mask',rarity:'epic',passive:225,img:'cyberpunk_combat_mask.png'},
  syndicate_top_hat: {id:'syndicate_top_hat',slot:'hat',name:'Syndicate Top Hat',rarity:'epic',passive:225,img:'cyberpunk_syndicate_top_hat.png'},
  warlord_helm: {id:'warlord_helm',slot:'hat',name:'Warlord Helm',rarity:'legendary',passive:555,img:'cyberpunk_warlord_helm.png'},
  // ── Upper Body ──
  neon_zip_jacket: {id:'neon_zip_jacket',slot:'upperbody',name:'Neon Track Jacket',rarity:'common',passive:15,img:'cyberpunk_neon_zip_jacket.png'},
  corp_tee: {id:'corp_tee',slot:'upperbody',name:'Corp Tee',rarity:'common',passive:15,img:'cyberpunk_corp_tee.png'},
  puffer_shell: {id:'puffer_shell',slot:'upperbody',name:'Puffer Jacket',rarity:'common',passive:15,img:'cyberpunk_puffer_shell.png'},
  street_blazer: {id:'street_blazer',slot:'upperbody',name:'Street Blazer',rarity:'uncommon',passive:35,img:'cyberpunk_street_blazer.png'},
  medic_jacket: {id:'medic_jacket',slot:'upperbody',name:'Medic Jacket',rarity:'uncommon',passive:35,img:'cyberpunk_medic_jacket.png'},
  neon_hoodie: {id:'neon_hoodie',slot:'upperbody',name:'Neon Hoodie',rarity:'uncommon',passive:35,img:'cyberpunk_neon_hoodie.png'},
  armored_chest_rig: {id:'armored_chest_rig',slot:'upperbody',name:'Armored Chest Rig',rarity:'rare',passive:85,img:'cyberpunk_armored_chest_rig.png'},
  chrome_chest_plate: {id:'chrome_chest_plate',slot:'upperbody',name:'Chrome Chest Plate',rarity:'rare',passive:85,img:'cyberpunk_chrome_chest_plate.png'},
  ghost_coat: {id:'ghost_coat',slot:'upperbody',name:'Ghost Coat',rarity:'epic',passive:225,img:'cyberpunk_ghost_coat.png'},
  void_chest_rig: {id:'void_chest_rig',slot:'upperbody',name:'Void Chest Rig',rarity:'legendary',passive:555,img:'cyberpunk_void_chest_rig.png'},
  // ── Pants ──
  track_pants: {id:'track_pants',slot:'pants',name:'Track Pants',rarity:'common',passive:15,img:'cyberpunk_track_pants.png'},
  street_shorts: {id:'street_shorts',slot:'pants',name:'Street Shorts',rarity:'common',passive:15,img:'cyberpunk_street_shorts.png'},
  cargo_shorts: {id:'cargo_shorts',slot:'pants',name:'Street Skirt',rarity:'common',passive:15,img:'cyberpunk_cargo_shorts.png'},
  patched_jeans: {id:'patched_jeans',slot:'pants',name:'Patched Jeans',rarity:'uncommon',passive:35,img:'cyberpunk_patched_jeans.png'},
  dark_jeans: {id:'dark_jeans',slot:'pants',name:'Dark Jeans',rarity:'uncommon',passive:35,img:'cyberpunk_dark_jeans.png'},
  cargo_trousers: {id:'cargo_trousers',slot:'pants',name:'Cargo Trousers',rarity:'uncommon',passive:35,img:'cyberpunk_cargo_trousers.png'},
  neon_shorts: {id:'neon_shorts',slot:'pants',name:'Neon Shorts',rarity:'rare',passive:85,img:'cyberpunk_neon_shorts.png'},
  neon_trousers: {id:'neon_trousers',slot:'pants',name:'Pink Slacks',rarity:'rare',passive:85,img:'cyberpunk_neon_trousers.png'},
  armored_pants: {id:'armored_pants',slot:'pants',name:'Armored Pants',rarity:'epic',passive:225,img:'cyberpunk_armored_pants.png'},
  wide_leg_trousers: {id:'wide_leg_trousers',slot:'pants',name:'Wide-Leg Trousers',rarity:'legendary',passive:555,img:'cyberpunk_wide_leg_trousers.png'},
  // ── Shoes ──
  neon_kicks: {id:'neon_kicks',slot:'shoes',name:'Neon Kicks',rarity:'common',passive:15,img:'cyberpunk_neon_kicks.png'},
  street_slides: {id:'street_slides',slot:'shoes',name:'Street Slides',rarity:'common',passive:15,img:'cyberpunk_street_slides.png'},
  dark_ankle_boots: {id:'dark_ankle_boots',slot:'shoes',name:'Ankle Boots',rarity:'uncommon',passive:35,img:'cyberpunk_dark_ankle_boots.png'},
  dark_slippers: {id:'dark_slippers',slot:'shoes',name:'Slip-Ons',rarity:'uncommon',passive:35,img:'cyberpunk_dark_slippers.png'},
  blue_runners: {id:'blue_runners',slot:'shoes',name:'Blue Runners',rarity:'rare',passive:85,img:'cyberpunk_blue_runners.png'},
  corp_shoes: {id:'corp_shoes',slot:'shoes',name:'Corp Shoes',rarity:'rare',passive:85,img:'cyberpunk_corp_shoes.png'},
  street_loafers: {id:'street_loafers',slot:'shoes',name:'Street Loafers',rarity:'rare',passive:85,img:'cyberpunk_street_loafers.png'},
  dark_lace_ups: {id:'dark_lace_ups',slot:'shoes',name:'Dark Lace-Ups',rarity:'epic',passive:225,img:'cyberpunk_dark_lace_ups.png'},
  neon_ankle_boots: {id:'neon_ankle_boots',slot:'shoes',name:'Neon Ankle Boots',rarity:'epic',passive:225,img:'cyberpunk_neon_ankle_boots.png'},
  stiletto_boots: {id:'stiletto_boots',slot:'shoes',name:'Stiletto Boots',rarity:'legendary',passive:555,img:'cyberpunk_stiletto_boots.png'},
  // ── Implants ──
  cyber_lungs: {id:'cyber_lungs',slot:'implant',name:'Cyber Lungs',rarity:'epic',passive:300,img:'cyberpunk_cyber_lungs.png'},
  synth_liver: {id:'synth_liver',slot:'implant',name:'Synth Liver',rarity:'uncommon',passive:45,img:'cyberpunk_synth_liver.png'},
  blood_sac: {id:'blood_sac',slot:'implant',name:'Blood Reservoir',rarity:'uncommon',passive:45,img:'cyberpunk_blood_sac.png'},
  organ_case: {id:'organ_case',slot:'implant',name:'Organ Transit Case',rarity:'common',passive:20,img:'cyberpunk_organ_case.png'},
  cyber_heart: {id:'cyber_heart',slot:'implant',name:'Cyber Heart',rarity:'rare',passive:120,img:'cyberpunk_cyber_heart.png'},
  spine_cluster: {id:'spine_cluster',slot:'implant',name:'Vertebral Cluster',rarity:'uncommon',passive:45,img:'cyberpunk_spine_cluster.png'},
  jarred_brain: {id:'jarred_brain',slot:'implant',name:'Preserved Brain',rarity:'legendary',passive:750,img:'cyberpunk_jarred_brain.png'},
  chrome_spine: {id:'chrome_spine',slot:'implant',name:'Chrome Spine',rarity:'rare',passive:120,img:'cyberpunk_chrome_spine.png'},
  chem_strip: {id:'chem_strip',slot:'implant',name:'Chem Capsule Strip',rarity:'common',passive:20,img:'cyberpunk_chem_strip.png'},
  cyber_eye: {id:'cyber_eye',slot:'implant',name:'Cyber Eye',rarity:'rare',passive:120,img:'cyberpunk_cyber_eye.png'},
  kidney_pair: {id:'kidney_pair',slot:'implant',name:'Synth Kidneys',rarity:'uncommon',passive:45,img:'cyberpunk_kidney_pair.png'},
  pelvic_frame: {id:'pelvic_frame',slot:'implant',name:'Pelvic Frame',rarity:'rare',passive:120,img:'cyberpunk_pelvic_frame.png'},
  spinal_column: {id:'spinal_column',slot:'implant',name:'Spinal Column',rarity:'epic',passive:300,img:'cyberpunk_spinal_column.png'},
  synth_stomach: {id:'synth_stomach',slot:'implant',name:'Synth Stomach',rarity:'uncommon',passive:45,img:'cyberpunk_synth_stomach.png'},
  skull_plate: {id:'skull_plate',slot:'implant',name:'Skull Plate',rarity:'epic',passive:300,img:'cyberpunk_skull_plate.png'},
  muscle_strip: {id:'muscle_strip',slot:'implant',name:'Muscle Graft',rarity:'common',passive:20,img:'cyberpunk_muscle_strip.png'},
  injector_rig: {id:'injector_rig',slot:'implant',name:'Injector Rig',rarity:'uncommon',passive:45,img:'cyberpunk_injector_rig.png'},
  cortex_wheel: {id:'cortex_wheel',slot:'implant',name:'Cortex Gear',rarity:'legendary',passive:750,img:'cyberpunk_cortex_wheel.png'},
  sternum_plate: {id:'sternum_plate',slot:'implant',name:'Sternum Plate',rarity:'rare',passive:120,img:'cyberpunk_sternum_plate.png'},
  data_chip: {id:'data_chip',slot:'implant',name:'Data Chip',rarity:'common',passive:20,img:'cyberpunk_data_chip.png'},
  elbow_joint: {id:'elbow_joint',slot:'implant',name:'Elbow Joint',rarity:'uncommon',passive:45,img:'cyberpunk_elbow_joint.png'},
  cyber_hand: {id:'cyber_hand',slot:'implant',name:'Cyber Hand',rarity:'rare',passive:120,img:'cyberpunk_cyber_hand.png'},
  wired_leg: {id:'wired_leg',slot:'implant',name:'Wired Leg',rarity:'rare',passive:120,img:'cyberpunk_wired_leg.png'},
  arm_brace: {id:'arm_brace',slot:'implant',name:'Arm Brace',rarity:'uncommon',passive:45,img:'cyberpunk_arm_brace.png'},
  bone_blade: {id:'bone_blade',slot:'implant',name:'Bone Blade',rarity:'epic',passive:300,img:'cyberpunk_bone_blade.png'},
  iris_disk: {id:'iris_disk',slot:'implant',name:'Iris Disk',rarity:'rare',passive:120,img:'cyberpunk_iris_disk.png'},
  cyber_leg: {id:'cyber_leg',slot:'implant',name:'Cyber Leg',rarity:'rare',passive:120,img:'cyberpunk_cyber_leg.png'},
  brain_display: {id:'brain_display',slot:'implant',name:'Augmented Brain',rarity:'epic',passive:300,img:'cyberpunk_brain_display.png'},
  knee_joint: {id:'knee_joint',slot:'implant',name:'Knee Joint',rarity:'uncommon',passive:45,img:'cyberpunk_knee_joint.png'},
  organ_capsule: {id:'organ_capsule',slot:'implant',name:'Organ Capsule',rarity:'rare',passive:120,img:'cyberpunk_organ_capsule.png'},
  blood_jar: {id:'blood_jar',slot:'implant',name:'Blood Jar',rarity:'uncommon',passive:45,img:'cyberpunk_blood_jar.png'},
  void_lungs: {id:'void_lungs',slot:'implant',name:'Void Lungs',rarity:'epic',passive:300,img:'cyberpunk_void_lungs.png'},
  spine_strip: {id:'spine_strip',slot:'implant',name:'Spine Strip',rarity:'uncommon',passive:45,img:'cyberpunk_spine_strip.png'},
  muscle_bundle: {id:'muscle_bundle',slot:'implant',name:'Muscle Bundle',rarity:'common',passive:20,img:'cyberpunk_muscle_bundle.png'},
  joint_brace: {id:'joint_brace',slot:'implant',name:'Joint Brace',rarity:'uncommon',passive:45,img:'cyberpunk_joint_brace.png'},
  capacitor_pair: {id:'capacitor_pair',slot:'implant',name:'Capacitor Pair',rarity:'uncommon',passive:45,img:'cyberpunk_capacitor_pair.png'},
  bio_eye: {id:'bio_eye',slot:'implant',name:'Bio Eye',rarity:'rare',passive:120,img:'cyberpunk_bio_eye.png'},
  ribcage_frame: {id:'ribcage_frame',slot:'implant',name:'Ribcage Frame',rarity:'legendary',passive:750,img:'cyberpunk_ribcage_frame.png'},
  micro_missile: {id:'micro_missile',slot:'implant',name:'Micro Missile',rarity:'epic',passive:300,img:'cyberpunk_micro_missile.png'},
  fuel_cell: {id:'fuel_cell',slot:'implant',name:'Fuel Cell',rarity:'rare',passive:120,img:'cyberpunk_fuel_cell.png'},

  // ── Rings ──
  silver_pearl_ring: {id:'silver_pearl_ring',slot:'ring',name:'Silver Pearl Ring',rarity:'common',passive:12,img:'new_silver_pearl_ring.png'},
  banded_ring: {id:'banded_ring',slot:'ring',name:'Banded Ring',rarity:'common',passive:12,img:'new_banded_ring.png'},
  green_gem_ring: {id:'green_gem_ring',slot:'ring',name:'Green Gem Ring',rarity:'uncommon',passive:30,img:'new_green_gem_ring.png'},
  neon_ring: {id:'neon_ring',slot:'ring',name:'Neon Ring',rarity:'uncommon',passive:30,img:'new_neon_ring.png'},
  blue_gem_ring: {id:'blue_gem_ring',slot:'ring',name:'Blue Gem Ring',rarity:'rare',passive:80,img:'new_blue_gem_ring.png'},
  studded_ring: {id:'studded_ring',slot:'ring',name:'Studded Ring',rarity:'rare',passive:80,img:'new_studded_ring.png'},
  red_gold_ring: {id:'red_gold_ring',slot:'ring',name:'Red-Gold Ring',rarity:'epic',passive:220,img:'new_red_gold_ring.png'},
  bolt_ring: {id:'bolt_ring',slot:'ring',name:'Bolt Ring',rarity:'epic',passive:220,img:'new_bolt_ring.png'},
  crystal_charm_ring: {id:'crystal_charm_ring',slot:'ring',name:'Crystal Charm Ring',rarity:'legendary',passive:540,img:'new_crystal_charm_ring.png'},
  void_ring: {id:'void_ring',slot:'ring',name:'Void Ring',rarity:'legendary',passive:540,img:'new_void_ring.png'},
  // ── Earrings ──
  silver_drop_earrings: {id:'silver_drop_earrings',slot:'earring',name:'Silver Drops',rarity:'common',passive:12,img:'new_silver_drop_earrings.png'},
  striped_earrings: {id:'striped_earrings',slot:'earring',name:'Striped Earrings',rarity:'common',passive:12,img:'new_striped_earrings.png'},
  green_gem_earrings: {id:'green_gem_earrings',slot:'earring',name:'Green Gem Drops',rarity:'uncommon',passive:30,img:'new_green_gem_earrings.png'},
  dark_teardrop_earrings: {id:'dark_teardrop_earrings',slot:'earring',name:'Dark Teardrops',rarity:'uncommon',passive:30,img:'new_dark_teardrop_earrings.png'},
  blue_crystal_earrings: {id:'blue_crystal_earrings',slot:'earring',name:'Blue Crystals',rarity:'rare',passive:80,img:'new_blue_crystal_earrings.png'},
  cube_earrings: {id:'cube_earrings',slot:'earring',name:'Cube Studs',rarity:'rare',passive:80,img:'new_cube_earrings.png'},
  spiral_earrings: {id:'spiral_earrings',slot:'earring',name:'Spiral Drops',rarity:'epic',passive:220,img:'new_spiral_earrings.png'},
  dark_ball_earrings: {id:'dark_ball_earrings',slot:'earring',name:'Dark Ball Drops',rarity:'epic',passive:220,img:'new_dark_ball_earrings.png'},
  triangle_earrings: {id:'triangle_earrings',slot:'earring',name:'Triangle Drops',rarity:'legendary',passive:540,img:'new_triangle_earrings.png'},
  spike_earrings: {id:'spike_earrings',slot:'earring',name:'Crystal Spikes',rarity:'legendary',passive:540,img:'new_spike_earrings.png'},
  // ── Necklaces (new) ──
  pearl_pendant: {id:'pearl_pendant',slot:'necklace',name:'Pearl Pendant',rarity:'common',passive:12,img:'new_pearl_pendant.png'},
  amber_pendant: {id:'amber_pendant',slot:'necklace',name:'Amber Pendant',rarity:'common',passive:12,img:'new_amber_pendant.png'},
  jade_pendant: {id:'jade_pendant',slot:'necklace',name:'Jade Pendant',rarity:'uncommon',passive:30,img:'new_jade_pendant.png'},
  leaf_collar: {id:'leaf_collar',slot:'necklace',name:'Leaf Collar',rarity:'uncommon',passive:30,img:'new_leaf_collar.png'},
  heart_necklace: {id:'heart_necklace',slot:'necklace',name:'Crystal Heart',rarity:'rare',passive:80,img:'new_heart_necklace.png'},
  cube_pendant: {id:'cube_pendant',slot:'necklace',name:'Cube Pendant',rarity:'rare',passive:80,img:'new_cube_pendant.png'},
  pink_heart_necklace: {id:'pink_heart_necklace',slot:'necklace',name:'Pink Heart Charm',rarity:'epic',passive:220,img:'new_pink_heart_necklace.png'},
  orb_pendant: {id:'orb_pendant',slot:'necklace',name:'Orb Pendant',rarity:'epic',passive:220,img:'new_orb_pendant.png'},
  hoop_charm: {id:'hoop_charm',slot:'necklace',name:'Hoop Charm',rarity:'legendary',passive:540,img:'new_hoop_charm.png'},
  void_pendant: {id:'void_pendant',slot:'necklace',name:'Void Pendant',rarity:'legendary',passive:540,img:'new_void_pendant.png'},
  // ── Bracelets ──
  pearl_bangle: {id:'pearl_bangle',slot:'bracelet',name:'Pearl Bangle',rarity:'common',passive:12,img:'new_pearl_bangle.png'},
  striped_bangle: {id:'striped_bangle',slot:'bracelet',name:'Striped Bangle',rarity:'common',passive:12,img:'new_striped_bangle.png'},
  silver_bangle: {id:'silver_bangle',slot:'bracelet',name:'Silver Bangle',rarity:'uncommon',passive:30,img:'new_silver_bangle.png'},
  neon_bangle: {id:'neon_bangle',slot:'bracelet',name:'Neon Bangle',rarity:'uncommon',passive:30,img:'new_neon_bangle.png'},
  gem_bangle: {id:'gem_bangle',slot:'bracelet',name:'Gem Bangle',rarity:'rare',passive:80,img:'new_gem_bangle.png'},
  hex_bangle: {id:'hex_bangle',slot:'bracelet',name:'Hex Bangle',rarity:'rare',passive:80,img:'new_hex_bangle.png'},
  charm_bracelet: {id:'charm_bracelet',slot:'bracelet',name:'Charm Bracelet',rarity:'epic',passive:220,img:'new_charm_bracelet.png'},
  etched_bangle: {id:'etched_bangle',slot:'bracelet',name:'Etched Bangle',rarity:'epic',passive:220,img:'new_etched_bangle.png'},
  stripe_cuff: {id:'stripe_cuff',slot:'bracelet',name:'Stripe Cuff',rarity:'legendary',passive:540,img:'new_stripe_cuff.png'},
  void_bangle: {id:'void_bangle',slot:'bracelet',name:'Void Bangle',rarity:'legendary',passive:540,img:'new_void_bangle.png'},
  // ── Hats (new pack) ──
  cat_ear_headband: {id:'cat_ear_headband',slot:'hat',name:'Cat-Ear Headband',rarity:'common',passive:15,img:'new_cat_ear_headband.png'},
  hard_hat: {id:'hard_hat',slot:'hat',name:'Hard Hat',rarity:'common',passive:15,img:'new_hard_hat.png'},
  orange_pom_beanie: {id:'orange_pom_beanie',slot:'hat',name:'Orange Pom Beanie',rarity:'common',passive:15,img:'new_orange_pom_beanie.png'},
  neon_goggle_band: {id:'neon_goggle_band',slot:'hat',name:'Neon Headband',rarity:'uncommon',passive:35,img:'new_neon_goggle_band.png'},
  saucer_hat: {id:'saucer_hat',slot:'hat',name:'Saucer Hat',rarity:'uncommon',passive:35,img:'new_saucer_hat.png'},
  adventure_hat: {id:'adventure_hat',slot:'hat',name:'Adventure Hat',rarity:'uncommon',passive:35,img:'new_adventure_hat.png'},
  red_fez: {id:'red_fez',slot:'hat',name:'Red Fez',rarity:'rare',passive:85,img:'new_red_fez.png'},
  pointed_hood: {id:'pointed_hood',slot:'hat',name:'Pointed Hood',rarity:'rare',passive:85,img:'new_pointed_hood.png'},
  horned_mask: {id:'horned_mask',slot:'hat',name:'Horned Mask',rarity:'epic',passive:225,img:'new_horned_mask.png'},
  // ── Glasses (new pack) ──
  tri_shades: {id:'tri_shades',slot:'glasses',name:'Tri-Lens Shades',rarity:'rare',passive:85,img:'new_tri_shades.png'},
  // ── Upper Body (new pack) ──
  violet_puffer: {id:'violet_puffer',slot:'upperbody',name:'Violet Puffer',rarity:'common',passive:15,img:'new_violet_puffer.png'},
  white_crop_jacket: {id:'white_crop_jacket',slot:'upperbody',name:'White Crop Jacket',rarity:'common',passive:15,img:'new_white_crop_jacket.png'},
  racing_jacket: {id:'racing_jacket',slot:'upperbody',name:'Racing Jacket',rarity:'uncommon',passive:35,img:'new_racing_jacket.png'},
  neon_stripe_jacket: {id:'neon_stripe_jacket',slot:'upperbody',name:'Neon Stripe Jacket',rarity:'uncommon',passive:35,img:'new_neon_stripe_jacket.png'},
  teal_sweater: {id:'teal_sweater',slot:'upperbody',name:'Teal Sweater',rarity:'uncommon',passive:35,img:'new_teal_sweater.png'},
  yellow_bomber: {id:'yellow_bomber',slot:'upperbody',name:'Yellow Bomber',rarity:'uncommon',passive:35,img:'new_yellow_bomber.png'},
  pink_armor_jacket: {id:'pink_armor_jacket',slot:'upperbody',name:'Pink Armor Jacket',rarity:'rare',passive:85,img:'new_pink_armor_jacket.png'},
  red_armor_jacket: {id:'red_armor_jacket',slot:'upperbody',name:'Red Armor Jacket',rarity:'rare',passive:85,img:'new_red_armor_jacket.png'},
  cyan_bodysuit: {id:'cyan_bodysuit',slot:'upperbody',name:'Cyan Bodysuit',rarity:'rare',passive:85,img:'new_cyan_bodysuit.png'},
  exo_harness: {id:'exo_harness',slot:'upperbody',name:'Exo Harness',rarity:'epic',passive:225,img:'new_exo_harness.png'},
  // ── Pants (new pack) ──
  purple_camo_pants: {id:'purple_camo_pants',slot:'pants',name:'Purple Camo Pants',rarity:'common',passive:15,img:'new_purple_camo_pants.png'},
  blue_jeans_b: {id:'blue_jeans_b',slot:'pants',name:'Blue Jeans',rarity:'common',passive:15,img:'new_blue_jeans_b.png'},
  stripe_pants: {id:'stripe_pants',slot:'pants',name:'Stripe Pants',rarity:'uncommon',passive:35,img:'new_stripe_pants.png'},
  combat_shorts: {id:'combat_shorts',slot:'pants',name:'Combat Shorts',rarity:'uncommon',passive:35,img:'new_combat_shorts.png'},
  stitched_pants: {id:'stitched_pants',slot:'pants',name:'Stitched Pants',rarity:'uncommon',passive:35,img:'new_stitched_pants.png'},
  teal_skirt: {id:'teal_skirt',slot:'pants',name:'Teal Skirt',rarity:'uncommon',passive:35,img:'new_teal_skirt.png'},
  red_armor_pants: {id:'red_armor_pants',slot:'pants',name:'Red Armor Pants',rarity:'rare',passive:85,img:'new_red_armor_pants.png'},
  neon_stripe_pants: {id:'neon_stripe_pants',slot:'pants',name:'Neon Stripe Pants',rarity:'rare',passive:85,img:'new_neon_stripe_pants.png'},
  tactical_pants_b: {id:'tactical_pants_b',slot:'pants',name:'Tactical Pants',rarity:'rare',passive:85,img:'new_tactical_pants_b.png'},
  cyan_wide_leg: {id:'cyan_wide_leg',slot:'pants',name:'Cyan Wide-Leg',rarity:'epic',passive:225,img:'new_cyan_wide_leg.png'},
  // ── Shoes (new pack) ──
  purple_sneakers: {id:'purple_sneakers',slot:'shoes',name:'Purple Sneakers',rarity:'common',passive:15,img:'new_purple_sneakers.png'},
  platform_sneakers: {id:'platform_sneakers',slot:'shoes',name:'Platform Sneakers',rarity:'common',passive:15,img:'new_platform_sneakers.png'},
  yellow_sneakers: {id:'yellow_sneakers',slot:'shoes',name:'Yellow Sneakers',rarity:'common',passive:15,img:'new_yellow_sneakers.png'},
  canvas_sneakers: {id:'canvas_sneakers',slot:'shoes',name:'Canvas Sneakers',rarity:'common',passive:15,img:'new_canvas_sneakers.png'},
  orange_trainers: {id:'orange_trainers',slot:'shoes',name:'Orange Trainers',rarity:'uncommon',passive:35,img:'new_orange_trainers.png'},
  neon_high_tops: {id:'neon_high_tops',slot:'shoes',name:'Neon High-Tops',rarity:'uncommon',passive:35,img:'new_neon_high_tops.png'},
  pink_loafers: {id:'pink_loafers',slot:'shoes',name:'Pink Loafers',rarity:'uncommon',passive:35,img:'new_pink_loafers.png'},
  neon_trim_sneakers: {id:'neon_trim_sneakers',slot:'shoes',name:'Neon Trim Sneakers',rarity:'uncommon',passive:35,img:'new_neon_trim_sneakers.png'},
  lace_boots_b: {id:'lace_boots_b',slot:'shoes',name:'Lace-Up Boots',rarity:'rare',passive:85,img:'new_lace_boots_b.png'},
  wedge_trainers: {id:'wedge_trainers',slot:'shoes',name:'Wedge Trainers',rarity:'rare',passive:85,img:'new_wedge_trainers.png'},

  // ── Phantom Tier: Colony Ownership (1:1 unique, 1 in 10M drop) ──
  planet_the_hollow:    {id:'planet_the_hollow',   slot:'property',name:'The Hollow',     rarity:'phantom',passive:50000,img:'space/planets/static/tech/11.png'},
  planet_supply_depot:  {id:'planet_supply_depot', slot:'property',name:'Supply Depot',   rarity:'phantom',passive:50000,img:'space/planets/icons/Ice.png'},
  planet_the_escrow:    {id:'planet_the_escrow',   slot:'property',name:'The Escrow',     rarity:'phantom',passive:50000,img:'space/planets/icons/Ocean.png'},
  planet_iron_shelf:    {id:'planet_iron_shelf',   slot:'property',name:'Iron Shelf',     rarity:'phantom',passive:50000,img:'space/planets/icons/Barren.png'},
  planet_catalyst_ii:   {id:'planet_catalyst_ii',  slot:'property',name:'Catalyst II',    rarity:'phantom',passive:50000,img:'space/planets/icons/Plasma1.png'},

};

export const RARITY_CONFIG = {
  common:    { label:'Common',    color:'#888780', dropWeight:550, passiveBonus:10  },
  uncommon:  { label:'Uncommon',  color:'#1D9E75', dropWeight:250, passiveBonus:25  },
  rare:      { label:'Rare',      color:'#3B8BD4', dropWeight:120, passiveBonus:75  },
  epic:      { label:'Epic',      color:'#8B5CF6', dropWeight:75,  passiveBonus:200 },
  legendary: { label:'Legendary', color:'#ff6a00', dropWeight:5,   passiveBonus:500 },
  phantom:   { label:'Phantom',   color:'#ff0055', dropWeight:0.0001, passiveBonus:50000 },
};

export const ITEM_SLOTS = ['hat','glasses','upperbody','necklace','watch','pants','shoes','vehicle','property','implant','ring','earring','bracelet'];

// Weighted random item drop
export function rollItemDrop(guaranteedRarity = null) {
  const catalog = Object.values(ITEM_CATALOG);
  let pool;
  if (guaranteedRarity) {
    pool = catalog.filter(i => i.rarity === guaranteedRarity);
  } else {
    // Build weighted pool
    const totalWeight = Object.values(RARITY_CONFIG).reduce((a,r) => a + r.dropWeight, 0);
    const roll = Math.random() * totalWeight;
    let acc = 0;
    let chosenRarity = 'common';
    for (const [rarity, cfg] of Object.entries(RARITY_CONFIG)) {
      acc += cfg.dropWeight;
      if (roll < acc) { chosenRarity = rarity; break; }
    }
    pool = catalog.filter(i => i.rarity === chosenRarity);
  }
  if (!pool.length) return null;

  // Phantom items are 1:1 unique. Filter out any already owned by anyone.
  if (pool[0] && pool[0].rarity === 'phantom') {
    try {
      const ownedIds = db.prepare('SELECT DISTINCT item_id FROM player_inventory WHERE item_id LIKE ?').all('planet_%').map(r => r.item_id);
      pool = pool.filter(i => !ownedIds.includes(i.id));
      if (!pool.length) {
        // All phantoms owned. Fall back to legendary.
        pool = catalog.filter(i => i.rarity === 'legendary');
        if (!pool.length) return null;
      }
    } catch(_) {
      // If DB query fails, fall back to legendary
      pool = catalog.filter(i => i.rarity === 'legendary');
      if (!pool.length) return null;
    }
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

export function initItemTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_inventory (
      id          TEXT PRIMARY KEY,
      player_id   TEXT NOT NULL,
      item_id     TEXT NOT NULL,
      acquired_at INTEGER NOT NULL DEFAULT 0,
      source      TEXT DEFAULT 'slot'
    );
    CREATE TABLE IF NOT EXISTS player_equipped (
      player_id   TEXT PRIMARY KEY,
      hat         TEXT, glasses TEXT, upperbody TEXT, necklace TEXT,
      watch       TEXT, pants   TEXT, shoes     TEXT,
      vehicle     TEXT, property TEXT, implant TEXT, ring TEXT, earring TEXT, bracelet TEXT
    );
    CREATE TABLE IF NOT EXISTS slot_machine (
      player_id       TEXT PRIMARY KEY,
      spins_remaining INTEGER NOT NULL DEFAULT 0,
      spins_used      INTEGER NOT NULL DEFAULT 0,
      last_monthly_grant INTEGER NOT NULL DEFAULT 0,
      milestone_trades    INTEGER NOT NULL DEFAULT 0,
      milestone_spins_earned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS item_market (
      id           TEXT PRIMARY KEY,
      seller_id    TEXT NOT NULL,
      inv_id       TEXT NOT NULL,
      item_id      TEXT NOT NULL,
      price        REAL NOT NULL,
      listed_at    INTEGER NOT NULL DEFAULT 0,
      sold         INTEGER NOT NULL DEFAULT 0,
      buyer_id     TEXT
    );

  -- limit orders (persisted across restarts)
  CREATE TABLE IF NOT EXISTS limit_orders (
    id            TEXT PRIMARY KEY,
    player_id     TEXT NOT NULL,
    side          TEXT NOT NULL CHECK(side IN ('buy','sell')),
    symbol        TEXT NOT NULL,
    qty           INTEGER NOT NULL,
    limit_price   REAL NOT NULL,
    reserved_cash REAL NOT NULL DEFAULT 0,
    ts            INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_lo_player ON limit_orders(player_id);

  -- Dev Communications (bug reports, player reports, dev requests)
  CREATE TABLE IF NOT EXISTS comms_bugs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    reporter    TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    resolved    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS comms_bug_upvotes (
    bug_id      INTEGER NOT NULL,
    player_id   TEXT NOT NULL,
    PRIMARY KEY (bug_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS comms_reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    target      TEXT NOT NULL,
    reason      TEXT NOT NULL,
    reporter    TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    reviewed    INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS comms_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player      TEXT NOT NULL,
    message     TEXT NOT NULL,
    ts          INTEGER NOT NULL,
    handled     INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS announcements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    text        TEXT NOT NULL,
    author      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS fb_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id   TEXT NOT NULL,
    author_name TEXT NOT NULL,
    faction     TEXT,
    body        TEXT NOT NULL,
    is_gm       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    edited      INTEGER NOT NULL DEFAULT 0,
    pinned      INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS fb_replies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL,
    author_id   TEXT NOT NULL,
    author_name TEXT NOT NULL,
    faction     TEXT,
    body        TEXT NOT NULL,
    is_gm       INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    edited      INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS fb_votes (
    post_id     INTEGER NOT NULL,
    player_id   TEXT NOT NULL,
    PRIMARY KEY (post_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS fb_notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id TEXT NOT NULL,
    post_id      INTEGER NOT NULL,
    from_name    TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    seen         INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_fb_replies_post ON fb_replies(post_id);
  CREATE INDEX IF NOT EXISTS idx_fb_notif_recip ON fb_notifications(recipient_id, seen);
  `);
  // Migrations for fb tables created before edited/pinned existed (e.g. test DBs)
  try { db.exec('ALTER TABLE fb_posts ADD COLUMN edited INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE fb_posts ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0'); } catch(_){}
  try { db.exec('ALTER TABLE fb_replies ADD COLUMN edited INTEGER NOT NULL DEFAULT 0'); } catch(_){}
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export function giveItem(playerId, itemId, source = 'slot') {

  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  stmt(`INSERT INTO player_inventory(id,player_id,item_id,acquired_at,source) VALUES(?,?,?,?,?)`)
    .run(id, playerId, itemId, Date.now(), source);
  return id;
}

export function getInventory(playerId) {
  return stmt(`SELECT * FROM player_inventory WHERE player_id=? AND id NOT IN (SELECT inv_id FROM item_market WHERE sold=0) ORDER BY acquired_at DESC`).all(playerId);
}

export function getEquipped(playerId) {
  return stmt(`SELECT * FROM player_equipped WHERE player_id=?`).get(playerId) || null;
}

// True if the player currently has the given item_id equipped in any slot.
export function isItemEquipped(playerId, itemId) {
  const eq = getEquipped(playerId);
  if (!eq) return false;
  for (const slot of ITEM_SLOTS) {
    const invId = eq[slot];
    if (!invId) continue;
    const inv = stmt(`SELECT item_id FROM player_inventory WHERE id=?`).get(invId);
    if (inv && inv.item_id === itemId) return true;
  }
  return false;
}

export function equipItem(playerId, slot, invId) {
  const row = stmt(`SELECT * FROM player_inventory WHERE id=? AND player_id=?`).get(invId, playerId);
  if (!row) return false;
  const item = ITEM_CATALOG[row.item_id];
  if (!item || item.slot !== slot) return false;
  const existing = stmt(`SELECT * FROM player_equipped WHERE player_id=?`).get(playerId);
  if (existing) {
    stmt(`UPDATE player_equipped SET ${slot}=? WHERE player_id=?`).run(invId, playerId);
  } else {
    stmt(`INSERT INTO player_equipped(player_id,${slot}) VALUES(?,?)`).run(playerId, invId);
  }
  return true;
}

export function unequipItem(playerId, slot) {
  stmt(`UPDATE player_equipped SET ${slot}=NULL WHERE player_id=?`).run(playerId);
}

// Calculate total passive bonus from all equipped items
export function getEquippedPassiveBonus(playerId) {
  const equipped = getEquipped(playerId);
  if (!equipped) return 0;
  let bonus = 0;
  for (const slot of ITEM_SLOTS) {
    const invId = equipped[slot];
    if (!invId) continue;
    const inv = stmt(`SELECT item_id FROM player_inventory WHERE id=?`).get(invId);
    if (!inv) continue;
    const item = ITEM_CATALOG[inv.item_id];
    if (item) bonus += item.passive;
  }
  return bonus;
}

// Calculate total passive income per 30-min cycle for a player
export function getPassiveIncome(playerId, patreonTier) {
  // Check if dev account
  let isDev = false;
  try {
    const row = stmt(`SELECT is_dev FROM players WHERE id=?`).get(playerId);
    isDev = !!(row?.is_dev);
  } catch(_) {}
  const base = TIERS[patreonTier || 0]?.incomeEvery30 || 0;
  // Item bonus from equipped items
  let itemBonus = 0;
  try { itemBonus = getEquippedPassiveBonus(playerId); } catch(_) {}
  // Guild bonus (only for MERCHANTS_GUILD members)
  let guildBonus = 0;
  try {
    const inGuild = stmt(`SELECT 1 FROM fund_memberships WHERE fund_id='MERCHANTS_GUILD' AND player_id=?`).get(playerId);
    if (inGuild) {
      const r = stmt(`SELECT COUNT(*) as n FROM fund_memberships WHERE fund_id='MERCHANTS_GUILD'`).get();
      const guildPct = (r?.n || 0) * 0.01;
      guildBonus = Math.floor(base * guildPct);
    }
  } catch(_) {}
  // Void Collective cyborg bonus (+Ƒ15 permanent)
  let cyborgBonus = 0;
  try { if (isVoidLocked(playerId)) cyborgBonus = 15; } catch(_) {}
  return { base, itemBonus, guildBonus, cyborgBonus, total: base + itemBonus + guildBonus + cyborgBonus };
}

// ── Slot Machine ──────────────────────────────────────────────────────────────

export function getSlotRecord(playerId) {
  let row = stmt(`SELECT * FROM slot_machine WHERE player_id=?`).get(playerId);
  if (!row) {
    stmt(`INSERT OR IGNORE INTO slot_machine(player_id,spins_remaining,spins_used,last_monthly_grant,milestone_trades,milestone_spins_earned) VALUES(?,0,0,0,0,0)`).run(playerId);
    row = stmt(`SELECT * FROM slot_machine WHERE player_id=?`).get(playerId);
  }
  return row;
}

export function addSpins(playerId, count) {
  getSlotRecord(playerId);
  stmt(`UPDATE slot_machine SET spins_remaining=spins_remaining+? WHERE player_id=?`).run(count, playerId);
}

export function recordMilestoneTrade(playerId) {
  getSlotRecord(playerId);
  stmt(`UPDATE slot_machine SET milestone_trades=milestone_trades+1 WHERE player_id=?`).run(playerId);
  const row = stmt(`SELECT * FROM slot_machine WHERE player_id=?`).get(playerId);
  // Every 9 completed round-trips (buy+sell) = 1 free spin
  const earned = Math.floor(row.milestone_trades / 9);
  if (earned > row.milestone_spins_earned) {
    const newSpins = earned - row.milestone_spins_earned;
    stmt(`UPDATE slot_machine SET spins_remaining=spins_remaining+?, milestone_spins_earned=? WHERE player_id=?`).run(newSpins, earned, playerId);
    return newSpins; // how many spins were just granted
  }
  return 0;
}

export function useSpinAndDrop(playerId, guaranteedRarity = null) {
  const row = getSlotRecord(playerId);
  if (row.spins_remaining < 1) return { ok: false, error: 'no_spins' };
  const item = rollItemDrop(guaranteedRarity);
  if (!item) return { ok: false, error: 'no_item' };
  const invId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  stmt(`INSERT INTO player_inventory(id,player_id,item_id,acquired_at,source) VALUES(?,?,?,?,?)`)
    .run(invId, playerId, item.id, Date.now(), 'slot');
  stmt(`UPDATE slot_machine SET spins_remaining=spins_remaining-1, spins_used=spins_used+1 WHERE player_id=?`).run(playerId);
  return { ok: true, item, invId };
}

export function grantMonthlySpins(playerId, patreonTier) {
  const spinsPerTier = { 1: 5, 2: 20, 3: 100 };
  const spins = spinsPerTier[patreonTier] || 0;
  if (!spins) return 0;
  getSlotRecord(playerId);
  stmt(`UPDATE slot_machine SET spins_remaining=spins_remaining+?, last_monthly_grant=? WHERE player_id=?`).run(spins, Date.now(), playerId);
  return spins;
}

// ── Quests (layer 3: persistent quest state) ─────────────────────────────────
// One row per (player, quest). status: 'active' | 'completed'. outcome records
// how a quest resolved (e.g. 'delivered' | 'seized') for branching reward/flavor.
export function initQuestTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_quests (
      player_id    TEXT NOT NULL,
      quest_id     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      outcome      TEXT,
      accepted_at  INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, quest_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pq_player ON player_quests(player_id);
  `);
}

// Accept a quest. No re-accept once a row exists (active or completed).
export function acceptQuest(playerId, questId) {
  const existing = stmt(`SELECT status FROM player_quests WHERE player_id=? AND quest_id=?`).get(playerId, questId);
  if (existing) return { ok:false, already:existing.status };
  stmt(`INSERT INTO player_quests(player_id,quest_id,status,accepted_at) VALUES(?,?,'active',?)`).run(playerId, questId, Date.now());
  return { ok:true };
}

export function getPlayerQuests(playerId) {
  return stmt(`SELECT quest_id AS id, status, outcome, accepted_at, completed_at FROM player_quests WHERE player_id=?`).all(playerId);
}

export function getQuestStatus(playerId, questId) {
  return stmt(`SELECT quest_id AS id, status, outcome FROM player_quests WHERE player_id=? AND quest_id=?`).get(playerId, questId) || null;
}

// Transition active -> completed exactly once. Returns true ONLY on the real
// transition, so a quest can never pay out twice even if the trigger fires again.
export function completeQuest(playerId, questId, outcome) {
  const r = stmt(`UPDATE player_quests SET status='completed', outcome=?, completed_at=? WHERE player_id=? AND quest_id=? AND status='active'`)
    .run(outcome || null, Date.now(), playerId, questId);
  return !!(r && (r.changes || 0) > 0);
}

// ── Market upgrades (purchasable tools) + auto-accumulate ─────────────────────

export const MARKET_UPGRADE_CATALOG = {
  sma:             { name:'Moving Average Overlay', price: 250000,  desc:'Adds a simple moving average line to the market chart.' },
  price_history:   { name:'Extended Price History', price: 500000,  desc:'Loads up to 400 bars of chart history instead of 199.' },
  auto_accumulate: { name:'Auto-Accumulate',        price: 5000000, desc:'Auto-buys from a funded reserve when a position drops below your average cost. Reserve only; never touches your main balance.' },
};

export function initMarketUpgradeTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_market_upgrades (
      player_id   TEXT NOT NULL,
      upgrade_id  TEXT NOT NULL,
      acquired_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, upgrade_id)
    );
    CREATE TABLE IF NOT EXISTS player_auto_accum (
      player_id  TEXT NOT NULL,
      symbol     TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 0,
      drop_bps   INTEGER NOT NULL DEFAULT 500,
      clip_c     INTEGER NOT NULL DEFAULT 0,
      reserve_c  INTEGER NOT NULL DEFAULT 0,
      last_buy_t INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_aa_enabled ON player_auto_accum(enabled);
  `);
}

export function getMarketUpgrades(playerId) {
  return stmt(`SELECT upgrade_id FROM player_market_upgrades WHERE player_id=?`).all(playerId).map(r => r.upgrade_id);
}
export function hasMarketUpgrade(playerId, upgradeId) {
  return !!stmt(`SELECT 1 FROM player_market_upgrades WHERE player_id=? AND upgrade_id=?`).get(playerId, upgradeId);
}
export function grantMarketUpgrade(playerId, upgradeId) {
  stmt(`INSERT OR IGNORE INTO player_market_upgrades(player_id,upgrade_id,acquired_at) VALUES(?,?,?)`).run(playerId, upgradeId, Date.now());
}

// Auto-accumulate config: one row per player+symbol. reserve_c is SEGREGATED cents
// (funded out of main cash up front); the engine spends only from it.
export function getAutoAccum(playerId) {
  return stmt(`SELECT symbol, enabled, drop_bps, clip_c, reserve_c, last_buy_t FROM player_auto_accum WHERE player_id=?`).all(playerId);
}
export function getAutoAccumRow(playerId, symbol) {
  return stmt(`SELECT symbol, enabled, drop_bps, clip_c, reserve_c, last_buy_t FROM player_auto_accum WHERE player_id=? AND symbol=?`).get(playerId, symbol) || null;
}
// Remove a config entirely (used by cancel; caller refunds the reserve first).
export function deleteAutoAccum(playerId, symbol) {
  return stmt(`DELETE FROM player_auto_accum WHERE player_id=? AND symbol=?`).run(playerId, symbol);
}
// All armed configs (enabled, funded, sized). Engine reads this.
export function getArmedAutoAccum() {
  return stmt(`SELECT player_id, symbol, drop_bps, clip_c, reserve_c, last_buy_t FROM player_auto_accum WHERE enabled=1 AND reserve_c>0 AND clip_c>0`).all();
}
export function setAutoAccumConfig(playerId, symbol, cfg) {
  const drop = Math.max(0, Math.floor(Number(cfg.drop_bps) || 0));
  const clip = Math.max(0, Math.floor(Number(cfg.clip_c) || 0));
  const en = cfg.enabled ? 1 : 0;
  if (getAutoAccumRow(playerId, symbol)) {
    stmt(`UPDATE player_auto_accum SET enabled=?, drop_bps=?, clip_c=? WHERE player_id=? AND symbol=?`).run(en, drop, clip, playerId, symbol);
  } else {
    stmt(`INSERT INTO player_auto_accum(player_id,symbol,enabled,drop_bps,clip_c,reserve_c) VALUES(?,?,?,?,?,0)`).run(playerId, symbol, en, drop, clip);
  }
}
// Move cents into (delta>0) or out of (delta<0) a symbol's reserve. Returns the new
// reserve cents, or -1 if a withdrawal would overdraw (no change made).
export function adjustAutoAccumReserve(playerId, symbol, deltaC) {
  const d = Math.trunc(Number(deltaC) || 0);
  let row = getAutoAccumRow(playerId, symbol);
  if (!row) { stmt(`INSERT INTO player_auto_accum(player_id,symbol,reserve_c) VALUES(?,?,0)`).run(playerId, symbol); row = { reserve_c: 0 }; }
  const next = Number(row.reserve_c || 0) + d;
  if (next < 0) return -1;
  stmt(`UPDATE player_auto_accum SET reserve_c=? WHERE player_id=? AND symbol=?`).run(next, playerId, symbol);
  return next;
}
// Engine: atomically debit totalC from the reserve on a fill. True only if covered,
// so an auto-buy can never overspend the reserve even under concurrent ticks.
export function spendAutoAccumReserve(playerId, symbol, totalC, atT) {
  const t = Math.max(0, Math.floor(Number(totalC) || 0));
  const r = stmt(`UPDATE player_auto_accum SET reserve_c=reserve_c-?, last_buy_t=? WHERE player_id=? AND symbol=? AND reserve_c>=?`).run(t, atT, playerId, symbol, t);
  return !!(r && (r.changes || 0) > 0);
}

// ── Item Market ───────────────────────────────────────────────────────────────

export function listItemOnMarket(sellerId, invId, price) {
  const inv = stmt(`SELECT * FROM player_inventory WHERE id=? AND player_id=?`).get(invId, sellerId);
  if (!inv) return { ok: false, error: 'not_owned' };
  // Can't list equipped items
  const equipped = getEquipped(sellerId);
  if (equipped) {
    for (const slot of ITEM_SLOTS) {
      if (equipped[slot] === invId) return { ok: false, error: 'item_equipped' };
    }
  }
  const listId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  stmt(`INSERT INTO item_market(id,seller_id,inv_id,item_id,price,listed_at,sold) VALUES(?,?,?,?,?,?,0)`)
    .run(listId, sellerId, invId, inv.item_id, price, Date.now());
  return { ok: true, listId };
}

export function getMarketListings(limit = 100) {
  return stmt(`SELECT m.*, p.name as seller_name FROM item_market m
               LEFT JOIN players p ON p.id=m.seller_id
               WHERE m.sold=0 ORDER BY m.listed_at DESC LIMIT ?`).all(limit);
}

export function buyMarketItem(buyerId, listingId) {
  const listing = stmt(`SELECT * FROM item_market WHERE id=? AND sold=0`).get(listingId);
  if (!listing) return { ok: false, error: 'not_found' };
  if (listing.seller_id === buyerId) return { ok: false, error: 'own_listing' };
  const buyer = stmt(`SELECT * FROM players WHERE id=?`).get(buyerId);
  if (!buyer || buyer.cash < listing.price) return { ok: false, error: 'insufficient_funds' };
  // Transfer funds
  stmt(`UPDATE players SET cash=cash-? WHERE id=?`).run(listing.price, buyerId);
  stmt(`UPDATE players SET cash=cash+? WHERE id=?`).run(listing.price, listing.seller_id);
  // Transfer item
  stmt(`UPDATE player_inventory SET player_id=? WHERE id=?`).run(buyerId, listing.inv_id);
  // Mark sold
  stmt(`UPDATE item_market SET sold=1, buyer_id=? WHERE id=?`).run(buyerId, listingId);
  return { ok: true, item: ITEM_CATALOG[listing.item_id], price: listing.price };
}

export function cancelMarketListing(sellerId, listingId) {
  const listing = stmt(`SELECT * FROM item_market WHERE id=? AND seller_id=? AND sold=0`).get(listingId, sellerId);
  if (!listing) return false;
  stmt(`DELETE FROM item_market WHERE id=?`).run(listingId);
  return true;
}

// Flat scrap payout for slot-machine items. Same value for every rarity — this is
// a sink to clear inventory clutter, not a fair-value buyback, so Ƒbay doesn't fill
// up with junk listings nobody buys.
export const SCRAP_VALUE = 500;

export const scrapItem = transaction(function(playerId, invId) {
  const inv = stmt(`SELECT * FROM player_inventory WHERE id=? AND player_id=?`).get(invId, playerId);
  if (!inv) return { ok: false, error: 'not_owned' };
  // Can't scrap equipped items
  const equipped = getEquipped(playerId);
  if (equipped) {
    for (const slot of ITEM_SLOTS) {
      if (equipped[slot] === invId) return { ok: false, error: 'item_equipped' };
    }
  }
  // Can't scrap an item that's currently listed on Ƒbay (would orphan the listing)
  const listed = stmt(`SELECT 1 FROM item_market WHERE inv_id=? AND sold=0`).get(invId);
  if (listed) return { ok: false, error: 'item_listed' };
  stmt(`UPDATE players SET cash=cash+? WHERE id=?`).run(SCRAP_VALUE, playerId);
  stmt(`DELETE FROM player_inventory WHERE id=?`).run(invId);
  return { ok: true, payout: SCRAP_VALUE, item: ITEM_CATALOG[inv.item_id] || null };
});

export function getPatreonSubscribers() {
  try {
    // Include regular Patreon subscribers AND owner/dev accounts (treated as CEO tier 3)
    const regular = stmt('SELECT id, patreon_tier FROM players WHERE patreon_tier > 0').all();
    const owners  = stmt('SELECT id, 3 as patreon_tier FROM players WHERE is_prime=1 AND patreon_tier < 3').all();
    const devs    = stmt('SELECT id, 2 as patreon_tier FROM players WHERE is_dev=1 AND is_prime=0 AND patreon_tier < 2').all();
    // Deduplicate by id
    const seen = new Set();
    return [...regular, ...owners, ...devs].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id); return true;
    });
  } catch(_) { return []; }
}

// ─── Tutorial ─────────────────────────────────────────────────────────────────

export function getTutorialSeen(playerId) {
  try {
    try { db.exec('ALTER TABLE players ADD COLUMN tutorial_seen INTEGER NOT NULL DEFAULT 0'); } catch(_){}
    const row = stmt('SELECT tutorial_seen FROM players WHERE id=?').get(playerId);
    return !!(row?.tutorial_seen);
  } catch(_) { return false; }
}
// markTutorialSeen is defined near line 269 alongside other player helpers

// ─── Dev Communications (DB-persisted) ────────────────────────────────────────

export function addBugReport(text, reporter) {
  const ts = Date.now();
  const info = stmt('INSERT INTO comms_bugs(text, reporter, ts) VALUES(?,?,?)').run(text, reporter, ts);
  return { id: Number(info.lastInsertRowid), text, reporter, ts, resolved: false, upvotes: 0 };
}

export function getBugReports() {
  const bugs = stmt(`
    SELECT b.id, b.text, b.reporter, b.ts, b.resolved,
           (SELECT COUNT(*) FROM comms_bug_upvotes WHERE bug_id=b.id) AS upvotes
    FROM comms_bugs b ORDER BY upvotes DESC, b.ts DESC LIMIT 200
  `).all();
  return bugs.map(b => ({ ...b, resolved: !!b.resolved }));
}

export function getBugUpvoters(bugId) {
  return stmt('SELECT player_id FROM comms_bug_upvotes WHERE bug_id=?').all(bugId).map(r => r.player_id);
}

export function toggleBugUpvote(bugId, playerId) {
  const existing = stmt('SELECT 1 FROM comms_bug_upvotes WHERE bug_id=? AND player_id=?').get(bugId, playerId);
  if (existing) {
    stmt('DELETE FROM comms_bug_upvotes WHERE bug_id=? AND player_id=?').run(bugId, playerId);
  } else {
    stmt('INSERT OR IGNORE INTO comms_bug_upvotes(bug_id, player_id) VALUES(?,?)').run(bugId, playerId);
  }
  const count = stmt('SELECT COUNT(*) AS c FROM comms_bug_upvotes WHERE bug_id=?').get(bugId);
  return count?.c || 0;
}

export function toggleBugResolved(bugId) {
  const bug = stmt('SELECT resolved FROM comms_bugs WHERE id=?').get(bugId);
  if (!bug) return null;
  const newVal = bug.resolved ? 0 : 1;
  stmt('UPDATE comms_bugs SET resolved=? WHERE id=?').run(newVal, bugId);
  return !!newVal;
}

export function addPlayerReport(target, reason, reporter) {
  const ts = Date.now();
  stmt('INSERT INTO comms_reports(target, reason, reporter, ts) VALUES(?,?,?,?)').run(target, reason, reporter, ts);
  return { ok: true };
}

export function getPlayerReports() {
  return stmt('SELECT * FROM comms_reports ORDER BY ts DESC LIMIT 500').all().map(r => ({ ...r, reviewed: !!r.reviewed }));
}

export function addDevRequest(player, message) {
  const ts = Date.now();
  stmt('INSERT INTO comms_requests(player, message, ts) VALUES(?,?,?)').run(player, message, ts);
  return { ok: true };
}

export function getDevRequests() {
  return stmt('SELECT * FROM comms_requests ORDER BY ts DESC LIMIT 200').all().map(r => ({ ...r, handled: !!r.handled }));
}

export function handleDevRequest(id) {
  stmt('UPDATE comms_requests SET handled=1 WHERE id=?').run(id);
}

// ─── Announcements (DB-persisted, pinned, expiring) ──────────────────────────
// Survive PM2 restarts and alt-logins, unlike the old in-flight admin_broadcast.
export function addAnnouncement(text, author, durationMs) {
  const now = Date.now();
  const expires_at = now + Math.max(1000, durationMs | 0);
  const info = stmt('INSERT INTO announcements(text, author, created_at, expires_at) VALUES(?,?,?,?)')
    .run(text, author, now, expires_at);
  return { id: Number(info.lastInsertRowid), text, author, created_at: now, expires_at };
}
export function getActiveAnnouncements() {
  return stmt('SELECT id, text, author, created_at, expires_at FROM announcements WHERE expires_at > ? ORDER BY created_at ASC')
    .all(Date.now());
}
export function clearAnnouncement(id) {
  stmt('DELETE FROM announcements WHERE id=?').run(id | 0);
}
export function pruneExpiredAnnouncements() {
  const now = Date.now();
  const expired = stmt('SELECT id FROM announcements WHERE expires_at <= ?').all(now).map(r => r.id);
  if (expired.length) stmt('DELETE FROM announcements WHERE expires_at <= ?').run(now);
  return expired; // ids to broadcast as cleared
}

// ─── Fleshbook (in-house social feed) ────────────────────────────────────────
export function fbAddPost({ authorId, authorName, faction, body, isGm }) {
  const ts = Date.now();
  const info = stmt('INSERT INTO fb_posts(author_id,author_name,faction,body,is_gm,created_at) VALUES(?,?,?,?,?,?)')
    .run(authorId, authorName, faction || null, body, isGm ? 1 : 0, ts);
  return { id: Number(info.lastInsertRowid), author_id: authorId, author_name: authorName,
    faction: faction || null, body, is_gm: !!isGm, created_at: ts, upvotes: 0, reply_count: 0, voted: false };
}
export function fbGetFeed(viewerId, limit, sort) {
  const lim = Math.min(100, Math.max(1, limit || 50));
  const order = sort === 'top'
    ? 'p.pinned DESC, upvotes DESC, p.created_at DESC, p.id DESC'
    : 'p.pinned DESC, p.created_at DESC, p.id DESC';
  const posts = stmt(`
    SELECT p.id, p.author_id, p.author_name, p.faction, p.body, p.is_gm, p.created_at, p.edited, p.pinned,
      (SELECT COUNT(*) FROM fb_votes WHERE post_id=p.id) AS upvotes,
      (SELECT COUNT(*) FROM fb_replies WHERE post_id=p.id AND deleted=0) AS reply_count
    FROM fb_posts p WHERE p.deleted=0
    ORDER BY ${order} LIMIT ?
  `).all(lim);
  const voted = new Set(viewerId
    ? stmt('SELECT post_id FROM fb_votes WHERE player_id=?').all(viewerId).map(r => r.post_id) : []);
  return posts.map(p => ({ ...p, is_gm: !!p.is_gm, edited: !!p.edited, pinned: !!p.pinned, voted: voted.has(p.id) }));
}
export function fbGetReplies(postId) {
  return stmt(`SELECT id,post_id,author_id,author_name,faction,body,is_gm,created_at,edited
    FROM fb_replies WHERE post_id=? AND deleted=0 ORDER BY created_at ASC LIMIT 200`)
    .all(postId | 0).map(r => ({ ...r, is_gm: !!r.is_gm, edited: !!r.edited }));
}
export function fbAddReply({ postId, authorId, authorName, faction, body, isGm }) {
  const post = stmt('SELECT id, author_id, deleted FROM fb_posts WHERE id=?').get(postId | 0);
  if (!post || post.deleted) return null;
  const ts = Date.now();
  const info = stmt('INSERT INTO fb_replies(post_id,author_id,author_name,faction,body,is_gm,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(postId | 0, authorId, authorName, faction || null, body, isGm ? 1 : 0, ts);
  return {
    reply: { id: Number(info.lastInsertRowid), post_id: postId | 0, author_id: authorId,
      author_name: authorName, faction: faction || null, body, is_gm: !!isGm, created_at: ts },
    postAuthorId: post.author_id
  };
}
export function fbToggleVote(postId, playerId) {
  const ex = stmt('SELECT 1 FROM fb_votes WHERE post_id=? AND player_id=?').get(postId | 0, playerId);
  if (ex) stmt('DELETE FROM fb_votes WHERE post_id=? AND player_id=?').run(postId | 0, playerId);
  else stmt('INSERT OR IGNORE INTO fb_votes(post_id,player_id) VALUES(?,?)').run(postId | 0, playerId);
  const c = stmt('SELECT COUNT(*) AS c FROM fb_votes WHERE post_id=?').get(postId | 0);
  return { upvotes: c?.c || 0, voted: !ex };
}
export function fbDeletePost(postId) { stmt('UPDATE fb_posts SET deleted=1 WHERE id=?').run(postId | 0); }
export function fbDeleteReply(replyId) { stmt('UPDATE fb_replies SET deleted=1 WHERE id=?').run(replyId | 0); }
export function fbAddNotification(recipientId, postId, fromName) {
  stmt('INSERT INTO fb_notifications(recipient_id,post_id,from_name,created_at) VALUES(?,?,?,?)')
    .run(recipientId, postId | 0, fromName, Date.now());
}
export function fbUnreadCount(playerId) {
  const r = stmt('SELECT COUNT(*) AS c FROM fb_notifications WHERE recipient_id=? AND seen=0').get(playerId);
  return r?.c || 0;
}
export function fbMarkSeen(playerId) {
  stmt('UPDATE fb_notifications SET seen=1 WHERE recipient_id=? AND seen=0').run(playerId);
}
export function fbPostOwner(id) {
  const r = stmt('SELECT author_id FROM fb_posts WHERE id=? AND deleted=0').get(id | 0);
  return r ? r.author_id : null;
}
export function fbReplyOwner(id) {
  const r = stmt('SELECT author_id FROM fb_replies WHERE id=? AND deleted=0').get(id | 0);
  return r ? r.author_id : null;
}
export function fbEditPost(id, body) { stmt('UPDATE fb_posts SET body=?, edited=1 WHERE id=?').run(body, id | 0); }
export function fbEditReply(id, body) { stmt('UPDATE fb_replies SET body=?, edited=1 WHERE id=?').run(body, id | 0); }
export function fbSetPinned(id, pinned) { stmt('UPDATE fb_posts SET pinned=? WHERE id=?').run(pinned ? 1 : 0, id | 0); }

// ─── Stock Split Helper ─────────────────────────────────────────────────────
// Multiplies all holdings of a symbol by a ratio and adjusts basis per-share.
// Used when FLSH crosses the split threshold.
export function executeStockSplit(symbol, ratio) {
  // Multiply qty for all holders
  stmt('UPDATE holdings SET qty = qty * ? WHERE symbol = ?').run(ratio, symbol);
  // Basis stays the same total — cost basis doesn't change in a split.
  // But per-share basis = old basis / ratio. Since we store total basis (not per-share),
  // the total basis is unchanged. No basis update needed.
  return stmt('SELECT COUNT(*) as cnt FROM holdings WHERE symbol = ?').get(symbol)?.cnt || 0;
}

// ─── Dividend Eligibility: Rolling Holdings Snapshot ──────────────────────────
// Snapshots each player's current stock holdings once per trading day (EOD cycle).
// Dividend eligibility = min(current qty, min qty across the last N snapshot cycles).
// This prevents the "buy right before dividend payout" exploit — new shares must
// survive N snapshots before they count toward dividend payouts.
//
// Cycle counter is a simple monotonically-increasing integer stored in market_state.
// We prune snapshots older than (current_cycle - DIVIDEND_HOLD_CYCLES) to keep the
// table small.

export const DIVIDEND_HOLD_CYCLES = 7; // 7 trading days (7 × 30-min EOD cycles)

export function getDividendCycle() {
  const row = stmt('SELECT value FROM market_state WHERE key=?').get('dividend_cycle');
  return row ? parseInt(row.value, 10) || 0 : 0;
}

function setDividendCycle(n) {
  stmt('INSERT OR REPLACE INTO market_state(key,value) VALUES(?,?)').run('dividend_cycle', String(n));
}

// Snapshot all current stock holdings for all players at the current cycle.
// Call this once per EOD cycle. Increments cycle counter, writes snapshot rows,
// and prunes old cycles.
export const snapshotAllHoldings = transaction(function() {
  const newCycle = getDividendCycle() + 1;
  setDividendCycle(newCycle);

  // Snapshot every long position. Shorts (qty<0) are irrelevant for dividends.
  const rows = stmt('SELECT player_id, symbol, qty FROM holdings WHERE qty > 0').all();
  const ins = stmt('INSERT OR REPLACE INTO holding_snapshots(player_id,symbol,qty,cycle) VALUES(?,?,?,?)');
  for (const r of rows) ins.run(r.player_id, r.symbol, r.qty, newCycle);

  // Snapshot fund/house portfolios on the same cycle so funds use the same
  // holding-eligibility window as players (anti dividend-farming).
  const fundRows = stmt('SELECT fund_id, symbol, qty FROM fund_portfolios WHERE qty > 0').all();
  const fins = stmt('INSERT OR REPLACE INTO fund_holding_snapshots(fund_id,symbol,qty,cycle) VALUES(?,?,?,?)');
  for (const r of fundRows) fins.run(r.fund_id, r.symbol, r.qty, newCycle);

  // Prune: keep only snapshots within the eligibility window.
  // We need the last DIVIDEND_HOLD_CYCLES cycles to compute eligibility, so keep
  // anything newer than (newCycle - DIVIDEND_HOLD_CYCLES).
  const cutoff = newCycle - DIVIDEND_HOLD_CYCLES;
  stmt('DELETE FROM holding_snapshots WHERE cycle <= ?').run(cutoff);
  stmt('DELETE FROM fund_holding_snapshots WHERE cycle <= ?').run(cutoff);

  return { cycle: newCycle, snapshotted: rows.length };
});

// Returns the dividend-eligible qty for a single (player, symbol).
// Eligible = min(currentQty, min(qty across last DIVIDEND_HOLD_CYCLES snapshots)).
// If fewer than DIVIDEND_HOLD_CYCLES snapshots exist for this position, the
// position has not been held long enough — return 0.
export function getEligibleDividendQty(playerId, symbol, currentQty) {
  if (!currentQty || currentQty <= 0) return 0;
  const cycle = getDividendCycle();
  const windowStart = cycle - DIVIDEND_HOLD_CYCLES + 1;
  if (windowStart < 1) return 0; // not enough history yet after server restart/migration
  const rows = stmt(
    'SELECT qty FROM holding_snapshots WHERE player_id=? AND symbol=? AND cycle>=?'
  ).all(playerId, symbol, windowStart);
  if (rows.length < DIVIDEND_HOLD_CYCLES) return 0; // missed snapshots = not continuously held
  let minQty = currentQty;
  for (const r of rows) if (r.qty < minQty) minQty = r.qty;
  return minQty;
}

// Bulk variant: returns { [symbol]: eligibleQty } for one player given their holdings.
export function getEligibleDividendQtyBulk(playerId, holdings) {
  const result = {};
  const cycle = getDividendCycle();
  const windowStart = cycle - DIVIDEND_HOLD_CYCLES + 1;
  if (windowStart < 1) {
    for (const sym of Object.keys(holdings||{})) result[sym] = 0;
    return result;
  }
  const rows = stmt(
    'SELECT symbol, qty, cycle FROM holding_snapshots WHERE player_id=? AND cycle>=?'
  ).all(playerId, windowStart);
  const bySymbol = {};
  for (const r of rows) {
    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
    bySymbol[r.symbol].push(r.qty);
  }
  for (const [sym, qty] of Object.entries(holdings||{})) {
    if (!qty || qty <= 0) { result[sym] = 0; continue; }
    const snaps = bySymbol[sym] || [];
    if (snaps.length < DIVIDEND_HOLD_CYCLES) { result[sym] = 0; continue; }
    let minQty = qty;
    for (const q of snaps) if (q < minQty) minQty = q;
    result[sym] = minQty;
  }
  return result;
}

// Fund variant: same continuous-holding eligibility, keyed on fund_id.
export function getEligibleFundDividendQtyBulk(fundId, holdings) {
  const result = {};
  const cycle = getDividendCycle();
  const windowStart = cycle - DIVIDEND_HOLD_CYCLES + 1;
  if (windowStart < 1) {
    for (const sym of Object.keys(holdings||{})) result[sym] = 0;
    return result;
  }
  const rows = stmt(
    'SELECT symbol, qty, cycle FROM fund_holding_snapshots WHERE fund_id=? AND cycle>=?'
  ).all(fundId, windowStart);
  const bySymbol = {};
  for (const r of rows) {
    if (!bySymbol[r.symbol]) bySymbol[r.symbol] = [];
    bySymbol[r.symbol].push(r.qty);
  }
  for (const [sym, qty] of Object.entries(holdings||{})) {
    if (!qty || qty <= 0) { result[sym] = 0; continue; }
    const snaps = bySymbol[sym] || [];
    if (snaps.length < DIVIDEND_HOLD_CYCLES) { result[sym] = 0; continue; }
    let minQty = qty;
    for (const q of snaps) if (q < minQty) minQty = q;
    result[sym] = minQty;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// MINING: permanent upgrades + stats (see mining_upgrades, mining_stats)
// ═══════════════════════════════════════════════════════════════════

// Canonical catalog — single source of truth for IDs, names, prices,
// descriptions, and any gating requirements. Server validates against this;
// the client is sent a sanitized copy (no server-only fields).
export const MINING_UPGRADE_CATALOG = {
  // Cosmetic titles
  title_drone_pilot: {
    id: 'title_drone_pilot',
    name: 'Title: Drone Pilot',
    price: 25000,
    kind: 'title',
    title: 'Drone Pilot',
    desc: 'Cosmetic display title. Granted to your FleshMarket account.',
  },
  title_belt_runner: {
    id: 'title_belt_runner',
    name: 'Title: Belt Runner',
    price: 250000,
    kind: 'title',
    title: 'Belt Runner',
    gate: { totalRuns: 25 },
    desc: 'Cosmetic title. Requires 25 completed mining runs.',
  },
  title_void_diver: {
    id: 'title_void_diver',
    name: 'Title: Void Diver',
    price: 1000000,
    kind: 'title',
    title: 'Void Diver',
    gate: { deepestBand: 3 },
    desc: 'Cosmetic title. Requires reaching the VOID depth band at least once.',
  },
  title_scrap_baron: {
    id: 'title_scrap_baron',
    name: 'Title: Scrap Baron',
    price: 5000000,
    kind: 'title',
    title: 'Scrap Baron',
    gate: { totalProfit: 10000000 },
    desc: 'Cosmetic title. Requires Ƒ10M total lifetime mining profit.',
  },
  // Mechanical perks
  guard_drone: {
    id: 'guard_drone',
    name: 'Guard Drone',
    price: 150000,
    kind: 'perk',
    desc: 'A free escort drone spawns with every expedition. It can still die in combat and respawns next run.',
  },
  ion_engines: {
    id: 'ion_engines',
    name: 'Ion Engines',
    price: 1000000,
    kind: 'perk',
    desc: 'Slow fuel trickle while flying. You regain fuel slowly even without a refinery.',
  },
  cryo_cooled_emitter: {
    id: 'cryo_cooled_emitter',
    name: 'Cryo-Cooled Emitter',
    price: 1000000,
    kind: 'perk',
    desc: 'Blue-phase laser retrofit. Heat builds 30% slower while firing. Stacks with heat tier upgrades.',
  },
  salvage_magnet: {
    id: 'salvage_magnet',
    name: 'Salvage Magnet',
    price: 250000,
    kind: 'perk',
    desc: 'Salvage pull radius extended from 90 to 150 units.',
  },
  improved_scanner: {
    id: 'improved_scanner',
    name: 'Improved Scanner',
    price: 400000,
    kind: 'perk',
    desc: 'Asteroid mineral type and value are shown before you mine them.',
  },
  cargo_optimizer: {
    id: 'cargo_optimizer',
    name: 'Cargo Optimizer',
    price: 750000,
    kind: 'perk',
    desc: '+10 cargo capacity on every drone, stacks with cargo tier upgrades.',
  },
  rescue_beacon: {
    id: 'rescue_beacon',
    name: 'Rescue Beacon',
    price: 500000,
    kind: 'perk',
    desc: 'If your drone is destroyed, your current cargo is recovered at the mothership instead of lost.',
  },
};

// ─────────────────────────────────────────────────────────────────
// SHIPS — alternate hulls the player can own and equip.
// Three faction styles with distinct gameplay focus:
//   - Coalition: mining focus (drill rate, heat cap)
//   - Syndicate: combat focus (fire rate, escorts, speed)
//   - Void: drone focus (cargo drones, free escorts, auto-miner)
// Every ship is buyable by every player regardless of their FM faction.
// Stats are multipliers that compose with fuel/cargo/heat tier upgrades
// and any permanent perks the player owns.
// The 'default' ship is free and always available; it's the baseline.
// ─────────────────────────────────────────────────────────────────
export const MINING_SHIP_CATALOG = {
  default: {
    id: 'default', name: 'Mining Drone', price: 0,
    hp: 1,
    spriteKeyBase: 'playerShip',         // always uses the main_ship.png
    spriteSize: 48,
    speedMul: 1.00, cargoMul: 1.00, heatMul: 1.00,
    drillMul: 1.00, fireRateMul: 1.00, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 0, freeEscorts: 0,
    desc: 'Standard-issue mining drone. Baseline stats. Always available.',
  },

  // ═══ COALITION — MINING FOCUS ═══
  scout_coalition: {
    id: 'scout_coalition', name: 'Coalition Prospector Scout', price: 500000,
    shipClass: 'scout', shipFaction: 'coalition',
    hp: 2,
    spriteKeyBase: 'ship_scout_coalition', spriteSize: 42,
    speedMul: 1.35, cargoMul: 0.75, heatMul: 1.10,
    drillMul: 1.25, fireRateMul: 0.90, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 0, freeEscorts: 0,
    desc: 'Fast prospector. +35% speed, +25% drill rate, +10% heat cap. Small cargo, weak guns. Ideal for rapid scouting runs.',
  },
  prospector_coalition: {
    id: 'prospector_coalition', name: 'Coalition Auto-Miner', price: 1500000,
    shipClass: 'prospector', shipFaction: 'coalition',
    hp: 3,
    spriteKeyBase: 'ship_prospector_coalition', spriteSize: 52,
    speedMul: 0.95, cargoMul: 1.20, heatMul: 1.30,
    drillMul: 1.40, fireRateMul: 0.85, bulletSpdMul: 1.00,
    autoMiner: true, cargoDrones: 0, freeEscorts: 0,
    desc: 'Built for the belt. Auto-miner drills nearby rocks passively. +40% drill rate, +30% heat cap. Combat-averse.',
  },
  hauler_coalition: {
    id: 'hauler_coalition', name: 'Coalition Mining Barge', price: 3000000,
    shipClass: 'hauler', shipFaction: 'coalition',
    hp: 4,
    spriteKeyBase: 'ship_hauler_coalition', spriteSize: 52,
    speedMul: 0.80, cargoMul: 2.00, heatMul: 1.30,
    drillMul: 1.50, fireRateMul: 0.85, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 0, freeEscorts: 1,
    desc: 'Dedicated mining barge. 2x cargo hold, +50% drill rate, +30% heat cap. One free escort. Slow handling.',
  },
  dreadnought_coalition: {
    id: 'dreadnought_coalition', name: 'Coalition Excavator', price: 5000000,
    shipClass: 'dreadnought', shipFaction: 'coalition',
    hp: 5,
    spriteKeyBase: 'ship_dreadnought_coalition', spriteSize: 88,
    speedMul: 0.75, cargoMul: 3.00, heatMul: 1.60,
    drillMul: 1.75, fireRateMul: 0.90, bulletSpdMul: 1.00,
    autoMiner: true, cargoDrones: 0, freeEscorts: 1,
    desc: 'Capital excavator. 3x cargo, +75% drill rate, auto-miner, one escort. The pinnacle of Coalition mining engineering. Slow.',
  },

  // ═══ SYNDICATE — COMBAT FOCUS ═══
  scout_syndicate: {
    id: 'scout_syndicate', name: 'Syndicate Interceptor', price: 500000,
    shipClass: 'scout', shipFaction: 'syndicate',
    hp: 2,
    spriteKeyBase: 'ship_scout_syndicate', spriteSize: 42,
    speedMul: 1.50, cargoMul: 0.70, heatMul: 0.90,
    drillMul: 0.85, fireRateMul: 1.30, bulletSpdMul: 1.15,
    autoMiner: false, cargoDrones: 0, freeEscorts: 0,
    desc: 'Fast attack interceptor. +50% speed, +30% fire rate, +15% bullet speed. Small cargo, weak drill.',
  },
  prospector_syndicate: {
    id: 'prospector_syndicate', name: 'Syndicate Gunship', price: 1500000,
    shipClass: 'prospector', shipFaction: 'syndicate',
    hp: 3,
    spriteKeyBase: 'ship_prospector_syndicate', spriteSize: 52,
    speedMul: 1.05, cargoMul: 1.00, heatMul: 1.00,
    drillMul: 0.90, fireRateMul: 1.40, bulletSpdMul: 1.20,
    autoMiner: false, cargoDrones: 0, freeEscorts: 2,
    desc: 'Combat-focused gunship. +40% fire rate, +20% bullet speed, two free escorts. Hunt enemies for scrap.',
  },
  hauler_syndicate: {
    id: 'hauler_syndicate', name: 'Syndicate Raider', price: 3000000,
    shipClass: 'hauler', shipFaction: 'syndicate',
    hp: 4,
    spriteKeyBase: 'ship_hauler_syndicate', spriteSize: 52,
    speedMul: 0.90, cargoMul: 2.00, heatMul: 1.10,
    drillMul: 0.95, fireRateMul: 1.25, bulletSpdMul: 1.15,
    autoMiner: false, cargoDrones: 0, freeEscorts: 3,
    desc: 'Raider with cargo bay. 2x cargo hold, +25% fire rate, three free escorts. Scrap the deep belt with a combat wing.',
  },
  dreadnought_syndicate: {
    id: 'dreadnought_syndicate', name: 'Syndicate Warship', price: 5000000,
    shipClass: 'dreadnought', shipFaction: 'syndicate',
    hp: 5,
    spriteKeyBase: 'ship_dreadnought_syndicate', spriteSize: 88,
    speedMul: 0.80, cargoMul: 1.50, heatMul: 1.25,
    drillMul: 1.00, fireRateMul: 2.00, bulletSpdMul: 1.30,
    autoMiner: false, cargoDrones: 0, freeEscorts: 4,
    desc: 'Capital warship. 2x fire rate, +30% bullet speed, four free escorts. +50% cargo. A mobile weapons platform.',
  },

  // ═══ VOID — DRONE FOCUS ═══
  scout_void: {
    id: 'scout_void', name: 'Void Courier Scout', price: 500000,
    shipClass: 'scout', shipFaction: 'void',
    hp: 2,
    spriteKeyBase: 'ship_scout_void', spriteSize: 42,
    speedMul: 1.35, cargoMul: 0.80, heatMul: 1.00,
    drillMul: 0.90, fireRateMul: 1.00, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 1, freeEscorts: 0,
    desc: 'Scout with a single cargo drone built in. +35% speed. Cargo drone auto-flies mined ore home while you keep moving.',
  },
  prospector_void: {
    id: 'prospector_void', name: 'Void Commander', price: 1500000,
    shipClass: 'prospector', shipFaction: 'void',
    hp: 3,
    spriteKeyBase: 'ship_prospector_void', spriteSize: 52,
    speedMul: 1.00, cargoMul: 1.15, heatMul: 1.10,
    drillMul: 1.00, fireRateMul: 1.05, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 1, freeEscorts: 2,
    desc: 'Drone commander. One cargo drone, two free combat escorts. Delegates everything: mining, fighting, hauling.',
  },
  hauler_void: {
    id: 'hauler_void', name: 'Void Mothership', price: 3000000,
    shipClass: 'hauler', shipFaction: 'void',
    hp: 4,
    spriteKeyBase: 'ship_hauler_void', spriteSize: 52,
    speedMul: 0.85, cargoMul: 1.75, heatMul: 1.15,
    drillMul: 1.00, fireRateMul: 1.00, bulletSpdMul: 1.00,
    autoMiner: false, cargoDrones: 2, freeEscorts: 2,
    desc: 'Mobile mothership. Two cargo drones AND two escorts built in. +75% cargo. Continuously banks ore without you docking.',
  },
  dreadnought_void: {
    id: 'dreadnought_void', name: 'Void Hivemind', price: 5000000,
    shipClass: 'dreadnought', shipFaction: 'void',
    hp: 5,
    spriteKeyBase: 'ship_dreadnought_void', spriteSize: 88,
    speedMul: 0.80, cargoMul: 2.00, heatMul: 1.30,
    drillMul: 1.10, fireRateMul: 1.10, bulletSpdMul: 1.00,
    autoMiner: true, cargoDrones: 3, freeEscorts: 3,
    desc: 'Capital drone carrier. Auto-miner, 3 cargo drones, 3 escorts. 2x cargo. The ultimate automated mining platform.',
  },
};

// Public accessor — returns a sanitized copy safe to send to clients
export function getShipCatalog() {
  return Object.values(MINING_SHIP_CATALOG);
}
export function getShipDef(shipId) {
  return MINING_SHIP_CATALOG[shipId] || null;
}

// Internal helpers
function _getUpgradesRow(playerId) {
  const row = stmt('SELECT upgrades FROM mining_upgrades WHERE player_id=?').get(playerId);
  if (!row) return {};
  try { return JSON.parse(row.upgrades) || {}; } catch(_) { return {}; }
}
function _setUpgradesRow(playerId, obj) {
  const json = JSON.stringify(obj || {});
  stmt(`INSERT INTO mining_upgrades (player_id, upgrades) VALUES (?, ?)
        ON CONFLICT(player_id) DO UPDATE SET upgrades=excluded.upgrades`).run(playerId, json);
}
function _getStatsRow(playerId) {
  const row = stmt('SELECT * FROM mining_stats WHERE player_id=?').get(playerId);
  if (row) return row;
  // Default row for players with no mining history
  return {
    player_id: playerId,
    total_runs: 0, total_profit: 0,
    best_run_profit: 0, best_run_banked: 0, best_run_band: 0, best_run_timestamp: null,
    deepest_band_reached: 0,
  };
}

// Public API
export function getMiningUpgrades(playerId) {
  return _getUpgradesRow(playerId);
}

export function hasMiningUpgrade(playerId, upgradeId) {
  const u = _getUpgradesRow(playerId);
  return !!u[upgradeId];
}

export function getMiningStats(playerId) {
  return _getStatsRow(playerId);
}

// Returns {ok:true} or {ok:false, reason:'...'}.
// Does NOT deduct cash — caller (server.js) deducts after checking.
// Gate check uses current lifetime stats.
export function canBuyMiningUpgrade(playerId, upgradeId) {
  const def = MINING_UPGRADE_CATALOG[upgradeId];
  if (!def) return { ok:false, reason:'unknown_upgrade' };
  const owned = _getUpgradesRow(playerId);
  if (owned[upgradeId]) return { ok:false, reason:'already_owned' };
  if (def.gate) {
    const stats = _getStatsRow(playerId);
    if (def.gate.totalRuns && stats.total_runs < def.gate.totalRuns) {
      return { ok:false, reason:'gate_runs', need:def.gate.totalRuns, have:stats.total_runs };
    }
    if (def.gate.deepestBand !== undefined && stats.deepest_band_reached < def.gate.deepestBand) {
      return { ok:false, reason:'gate_band', need:def.gate.deepestBand, have:stats.deepest_band_reached };
    }
    if (def.gate.totalProfit && stats.total_profit < def.gate.totalProfit) {
      return { ok:false, reason:'gate_profit', need:def.gate.totalProfit, have:stats.total_profit };
    }
  }
  return { ok:true, price:def.price, def };
}

// Grant an upgrade (caller has already checked can-buy + deducted cash).
export function grantMiningUpgrade(playerId, upgradeId) {
  const owned = _getUpgradesRow(playerId);
  owned[upgradeId] = true;
  _setUpgradesRow(playerId, owned);
}

// Record a completed mining run. Profit = banked - invested.
// Caller provides stats from endRun client-side; server validates deepest_band
// is in [0..3] and profit is finite.
export function recordMiningRun(playerId, { profit, banked, deepestBand }) {
  const p = Number.isFinite(profit) ? profit : 0;
  const b = Number.isFinite(banked) ? Math.max(0, banked) : 0;
  const band = Math.max(0, Math.min(3, Math.floor(deepestBand || 0)));
  const now = Math.floor(Date.now() / 1000);

  const cur = _getStatsRow(playerId);
  const newTotalRuns    = cur.total_runs + 1;
  const newTotalProfit  = cur.total_profit + p;
  const newDeepest      = Math.max(cur.deepest_band_reached, band);
  let best_run_profit   = cur.best_run_profit;
  let best_run_banked   = cur.best_run_banked;
  let best_run_band     = cur.best_run_band;
  let best_run_timestamp= cur.best_run_timestamp;
  if (p > best_run_profit) {
    best_run_profit    = p;
    best_run_banked    = b;
    best_run_band      = band;
    best_run_timestamp = now;
  }

  stmt(`INSERT INTO mining_stats
          (player_id, total_runs, total_profit,
           best_run_profit, best_run_banked, best_run_band, best_run_timestamp,
           deepest_band_reached)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET
          total_runs=excluded.total_runs,
          total_profit=excluded.total_profit,
          best_run_profit=excluded.best_run_profit,
          best_run_banked=excluded.best_run_banked,
          best_run_band=excluded.best_run_band,
          best_run_timestamp=excluded.best_run_timestamp,
          deepest_band_reached=excluded.deepest_band_reached
  `).run(
    playerId, newTotalRuns, newTotalProfit,
    best_run_profit, best_run_banked, best_run_band, best_run_timestamp,
    newDeepest
  );

  return {
    total_runs: newTotalRuns,
    total_profit: newTotalProfit,
    deepest_band_reached: newDeepest,
    best_run_profit, best_run_banked, best_run_band, best_run_timestamp,
    isNewBest: p > cur.best_run_profit,
  };
}

// Top N players by best_run_profit. Returns [{name, best_run_profit, best_run_band, best_run_timestamp, total_runs}].
// Band names: 0=NEAR, 1=MID, 2=DEEP, 3=VOID.
export function getMiningLeaderboard(limit = 10) {
  const n = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = stmt(`
    SELECT p.name, p.faction, ms.best_run_profit, ms.best_run_band,
           ms.best_run_timestamp, ms.total_runs
    FROM mining_stats ms
    JOIN players p ON p.id = ms.player_id
    WHERE ms.best_run_profit > 0
    ORDER BY ms.best_run_profit DESC
    LIMIT ?
  `).all(n);
  return rows;
}

// ─────────────────────────────────────────────────────────────────
// SHIPS — ownership + equipped selection
// ─────────────────────────────────────────────────────────────────
function _getShipsRow(playerId) {
  const row = stmt('SELECT owned, equipped FROM mining_ships WHERE player_id=?').get(playerId);
  if (!row) return { owned: {}, equipped: 'default' };
  let owned = {};
  try { owned = JSON.parse(row.owned) || {}; } catch (_) { owned = {}; }
  return { owned, equipped: row.equipped || 'default' };
}
function _setShipsRow(playerId, owned, equipped) {
  const json = JSON.stringify(owned || {});
  stmt(`INSERT INTO mining_ships (player_id, owned, equipped) VALUES (?, ?, ?)
        ON CONFLICT(player_id) DO UPDATE SET owned=excluded.owned, equipped=excluded.equipped`)
    .run(playerId, json, equipped || 'default');
}

// Returns { owned: {scout:true,...}, equipped: 'scout' } for the player.
// Every player implicitly owns 'default' — it's never stored in the owned map.
export function getMiningShips(playerId) {
  return _getShipsRow(playerId);
}

export function hasMiningShip(playerId, shipId) {
  if (shipId === 'default') return true;
  const { owned } = _getShipsRow(playerId);
  return !!owned[shipId];
}

// Spend cash and grant a ship. Returns { ok, owned, equipped, cash } or { ok:false, error }.
export function buyMiningShip(playerId, shipId) {
  const def = MINING_SHIP_CATALOG[shipId];
  if (!def) return { ok: false, error: 'Unknown ship.' };
  if (shipId === 'default') return { ok: false, error: 'Default ship is always owned.' };
  const { owned, equipped } = _getShipsRow(playerId);
  if (owned[shipId]) return { ok: false, error: 'Already owned.' };
  const player = stmt('SELECT cash FROM players WHERE id=?').get(playerId);
  if (!player) return { ok: false, error: 'Player not found.' };
  if (player.cash < def.price) return { ok: false, error: 'Insufficient credits.' };
  // Atomic: deduct and mark owned. Uses this module's transaction() wrapper
  // (node:sqlite's DatabaseSync does not expose a .transaction method).
  const tx = transaction(() => {
    stmt('UPDATE players SET cash = cash - ? WHERE id=?').run(def.price, playerId);
    owned[shipId] = true;
    _setShipsRow(playerId, owned, equipped);
  });
  tx();
  const updated = stmt('SELECT cash FROM players WHERE id=?').get(playerId);
  return { ok: true, owned, equipped, cash: updated.cash };
}

// Equip an owned ship. Returns { ok, equipped } or { ok:false, error }.
export function equipMiningShip(playerId, shipId) {
  if (!MINING_SHIP_CATALOG[shipId]) return { ok: false, error: 'Unknown ship.' };
  const { owned } = _getShipsRow(playerId);
  if (shipId !== 'default' && !owned[shipId]) return { ok: false, error: 'Not owned.' };
  _setShipsRow(playerId, owned, shipId);
  return { ok: true, equipped: shipId };
}

// ══════════════════════════════════════════════════════════════════════════════
//  FRS (Flesh Revenue Service) + Gifted Titles  -  added 1.1.8.0
//  All tables created idempotently. Tax engine ships DORMANT (frs_settings.enabled
//  defaults to 0); nothing here touches a balance until an admin enables it.
// ══════════════════════════════════════════════════════════════════════════════

export function initFRSTables() {
  // Player-level FRS columns (lazy-added, matches existing migration idiom).
  try { db.exec('ALTER TABLE players ADD COLUMN play_seconds   INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN tax_basis      REAL'); } catch(_) {}            // ex-fund net worth at last assessment; NULL = never assessed
  try { db.exec('ALTER TABLE players ADD COLUMN tax_owed       REAL NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN tax_prepaid    REAL NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN tax_loss_credit REAL NOT NULL DEFAULT 0'); } catch(_) {}
  // Lazy-add withdraw_tax_bps in case frs_settings predates 1.1.8.0 final.
  try { db.exec('ALTER TABLE frs_settings ADD COLUMN withdraw_tax_bps INTEGER NOT NULL DEFAULT 1500'); } catch(_) {}

  // Migrate legacy single-row gifted_titles (player_id PK, no `id` column) to the new
  // many-per-player schema: rename it aside so the CREATE below builds the new table;
  // rows are copied back and the legacy table dropped after creation.
  try {
    let legacy = false;
    try { db.prepare('SELECT id FROM gifted_titles LIMIT 1').get(); }
    catch(_) { try { db.prepare('SELECT label FROM gifted_titles LIMIT 1').get(); legacy = true; } catch(_) {} }
    if (legacy) db.exec('ALTER TABLE gifted_titles RENAME TO gifted_titles_legacy');
  } catch(_) {}

  db.exec(`
    -- Gifted Titles: god-granted collectible display titles. A player can hold MANY
    -- (one row per title); (player_id,label) is unique. rarity is reserved for future
    -- marketplace value. New-schema table; legacy single-row table is migrated below.
    CREATE TABLE IF NOT EXISTS gifted_titles (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      color      TEXT NOT NULL,
      badge      TEXT,
      rarity     TEXT NOT NULL DEFAULT 'custom',
      granted_by TEXT,
      granted_at INTEGER NOT NULL,
      UNIQUE(player_id, label)
    );
    CREATE INDEX IF NOT EXISTS idx_gifted_player ON gifted_titles(player_id);

    -- Single-row settings for the tax engine. id is always 1.
    CREATE TABLE IF NOT EXISTS frs_settings (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      enabled           INTEGER NOT NULL DEFAULT 1,   -- FRS defaults to ENABLED (1.1.8.5); existing rows flipped once below
      rate_bps          INTEGER NOT NULL DEFAULT 1500,   -- 1500 = 15.00%
      loss_carryforward INTEGER NOT NULL DEFAULT 1,
      house_mode        TEXT    NOT NULL DEFAULT 'gains', -- vestigial; houses now taxed at withdrawal, not assessed weekly
      withdraw_tax_bps  INTEGER NOT NULL DEFAULT 1500,   -- tax on capital-house withdrawals (1500 = 15.00%)
      last_run_ts       INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO frs_settings(id) VALUES(1);

    -- Audit receipts for each weekly assessment (player and house rows).
    CREATE TABLE IF NOT EXISTS frs_tax_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_kind  TEXT NOT NULL,                       -- 'player' | 'house'
      subject_id    TEXT NOT NULL,
      ts            INTEGER NOT NULL,
      period_gain   REAL NOT NULL,
      tax_assessed  REAL NOT NULL,
      from_prepaid  REAL NOT NULL DEFAULT 0,
      from_cash     REAL NOT NULL DEFAULT 0,
      new_owed      REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_frs_hist_subj ON frs_tax_history(subject_id, ts);

    -- FRS surveillance: periodic position snapshots (dev-facing exploit watch).
    CREATE TABLE IF NOT EXISTS frs_position_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   TEXT NOT NULL,
      ts          INTEGER NOT NULL,
      net_worth   REAL NOT NULL,
      cash        REAL NOT NULL,
      equity      REAL NOT NULL,
      fund_stake  REAL NOT NULL DEFAULT 0,
      holdings    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_frs_snap_player ON frs_position_snapshots(player_id, ts);

    -- FRS surveillance: purchase / sale log (dev-facing).
    CREATE TABLE IF NOT EXISTS frs_purchase_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  TEXT NOT NULL,
      ts         INTEGER NOT NULL,
      kind       TEXT NOT NULL,                          -- 'stock_buy' | 'stock_sell' | 'short' | 'cover' | 'commodity' | ...
      symbol     TEXT,
      qty        REAL,
      price      REAL,
      notional   REAL
    );
    CREATE INDEX IF NOT EXISTS idx_frs_purch_player ON frs_purchase_log(player_id, ts);
    CREATE INDEX IF NOT EXISTS idx_frs_purch_ts ON frs_purchase_log(ts);

    -- Ƒbay title exchange: a gifted title escrowed for sale. The display snapshot
    -- (label/color/badge/rarity) is stored so the listing renders after the seller's
    -- gifted_titles row is removed on listing. sold: 0 active, 1 sold, 2 cancelled.
    CREATE TABLE IF NOT EXISTS title_market (
      id         TEXT PRIMARY KEY,
      seller_id  TEXT NOT NULL,
      label      TEXT NOT NULL,
      color      TEXT NOT NULL,
      badge      TEXT,
      rarity     TEXT NOT NULL DEFAULT 'custom',
      price      INTEGER NOT NULL,
      listed_at  INTEGER NOT NULL,
      sold       INTEGER NOT NULL DEFAULT 0,
      buyer_id   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_title_market_active ON title_market(sold, listed_at);
    CREATE INDEX IF NOT EXISTS idx_title_market_seller ON title_market(seller_id, sold);
  `);

  // Copy any migrated legacy gifted titles into the new table, then drop the legacy one.
  try {
    db.prepare('SELECT 1 FROM gifted_titles_legacy LIMIT 1').get(); // throws if it does not exist
    db.exec(`INSERT OR IGNORE INTO gifted_titles(player_id,label,color,badge,granted_by,granted_at)
             SELECT player_id,label,color,badge,granted_by,granted_at FROM gifted_titles_legacy`);
    db.exec('DROP TABLE gifted_titles_legacy');
  } catch(_) {}

  // FRS defaults to ENABLED (1.1.8.5). New DBs seed enabled=1; an existing settings row
  // (seeded disabled under the old default) is flipped on exactly once via a guard column.
  // A later manual disable from the God Panel still persists across restarts, because the
  // guard is already set and this UPDATE only matches a row that has never been flipped.
  try { db.exec('ALTER TABLE frs_settings ADD COLUMN enabled_default_v2 INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('UPDATE frs_settings SET enabled=1, enabled_default_v2=1 WHERE id=1 AND enabled_default_v2=0'); } catch(_) {}
}

// ── Gifted Titles (collectible, many-per-player) ──────────────────────────────
const _GIFT_RARITIES = new Set(['common','rare','epic','legendary','custom']);
// Add (or refresh) a gifted title. Re-granting the same label updates its look/rarity;
// different labels accumulate. Returns nothing.
export function addGiftedTitle(playerId, label, color, badge, rarity, grantedBy) {
  const rar = _GIFT_RARITIES.has(String(rarity)) ? String(rarity) : 'custom';
  stmt(`INSERT INTO gifted_titles(player_id,label,color,badge,rarity,granted_by,granted_at)
        VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(player_id,label) DO UPDATE SET color=excluded.color,
          badge=excluded.badge, rarity=excluded.rarity, granted_by=excluded.granted_by`)
    .run(playerId, String(label).slice(0,48), String(color), badge ? String(badge).slice(0,8) : null, rar, grantedBy || null, Date.now());
}
// Remove one gifted title (by exact label) from a player.
export function removeGiftedTitle(playerId, label) {
  stmt('DELETE FROM gifted_titles WHERE player_id=? AND label=?').run(playerId, String(label));
}
// All gifted titles a player holds (for the picker + transfer).
export function getGiftedTitles(playerId) {
  try { return stmt('SELECT label,color,badge,rarity FROM gifted_titles WHERE player_id=? ORDER BY granted_at ASC').all(playerId) || []; }
  catch(_) { return []; }
}
// Look up one gifted title a player holds by its label (for equipped-color resolution).
export function getGiftedTitleByLabel(playerId, label) {
  try { return stmt('SELECT label,color,badge,rarity FROM gifted_titles WHERE player_id=? AND label=?').get(playerId, String(label)) || null; }
  catch(_) { return null; }
}
// Move a gifted title from one player to another (for future Ƒbay trades). Preserves
// color/badge/rarity. Caller is responsible for ownedTitles bookkeeping on both sides.
export function transferGiftedTitle(fromId, toId, label) {
  const row = getGiftedTitleByLabel(fromId, label);
  if (!row) return null;
  removeGiftedTitle(fromId, label);
  addGiftedTitle(toId, row.label, row.color, row.badge, row.rarity, fromId);
  return row;
}

// ── Ƒbay title exchange ───────────────────────────────────────────────────────
// Escrow model mirrors the card market: listing a title removes it from the seller's
// holdings; buying it moves cash and grants it atomically; cancelling returns it.
export const listTitleForSale = transaction((sellerId, label, price) => {
  price = Math.floor(Number(price) || 0);
  if (!(price > 0)) return { ok: false, error: 'bad_price' };
  if (price > 1e15) return { ok: false, error: 'price_too_high' };
  const g = getGiftedTitleByLabel(sellerId, label);
  if (!g) return { ok: false, error: 'not_owned' };
  removeGiftedTitle(sellerId, label); // escrow out
  const listId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  stmt(`INSERT INTO title_market(id,seller_id,label,color,badge,rarity,price,listed_at,sold)
        VALUES(?,?,?,?,?,?,?,?,0)`)
    .run(listId, sellerId, g.label, g.color, g.badge || null, g.rarity || 'custom', price, Date.now());
  return { ok: true, listId, label: g.label, color: g.color, badge: g.badge, rarity: g.rarity };
});

export const buyTitle = transaction((buyerId, listingId) => {
  const L = stmt('SELECT * FROM title_market WHERE id=? AND sold=0').get(listingId);
  if (!L) return { ok: false, error: 'not_found' };
  if (L.seller_id === buyerId) return { ok: false, error: 'own_listing' };
  if (getGiftedTitleByLabel(buyerId, L.label)) return { ok: false, error: 'already_owned' };
  const buyer = stmt('SELECT cash FROM players WHERE id=?').get(buyerId);
  if (!buyer) return { ok: false, error: 'no_buyer' };
  if (Number(buyer.cash) < L.price) return { ok: false, error: 'insufficient_funds' };
  stmt('UPDATE players SET cash=cash-? WHERE id=?').run(L.price, buyerId);
  stmt('UPDATE players SET cash=cash+? WHERE id=?').run(L.price, L.seller_id);
  addGiftedTitle(buyerId, L.label, L.color, L.badge, L.rarity, L.seller_id);
  stmt('UPDATE title_market SET sold=1, buyer_id=? WHERE id=?').run(buyerId, listingId);
  return { ok: true, price: L.price, label: L.label, color: L.color, badge: L.badge, rarity: L.rarity, sellerId: L.seller_id };
});

export const cancelTitleListing = transaction((sellerId, listingId) => {
  const L = stmt('SELECT * FROM title_market WHERE id=? AND seller_id=? AND sold=0').get(listingId, sellerId);
  if (!L) return { ok: false, error: 'not_found' };
  addGiftedTitle(sellerId, L.label, L.color, L.badge, L.rarity, L.seller_id); // return escrow
  stmt('UPDATE title_market SET sold=2 WHERE id=?').run(listingId);
  return { ok: true, label: L.label, color: L.color, badge: L.badge, rarity: L.rarity };
});

export function getTitleListings(limit = 200) {
  try {
    return stmt(`SELECT m.id,m.label,m.color,m.badge,m.rarity,m.price,m.listed_at,m.seller_id,p.name AS seller
                 FROM title_market m LEFT JOIN players p ON p.id=m.seller_id
                 WHERE m.sold=0 ORDER BY m.listed_at DESC LIMIT ?`).all(limit) || [];
  } catch(_) { return []; }
}
export function getMyTitleListings(sellerId) {
  try {
    return stmt(`SELECT id,label,color,badge,rarity,price,listed_at FROM title_market
                 WHERE seller_id=? AND sold=0 ORDER BY listed_at DESC`).all(sellerId) || [];
  } catch(_) { return []; }
}

// ── Telemetry: playtime ───────────────────────────────────────────────────────
// Bulk-add seconds to a set of online player ids in one transaction.
export const addPlaySecondsBulk = transaction((ids, seconds) => {
  const s = stmt('UPDATE players SET play_seconds = play_seconds + ? WHERE id=?');
  for (const id of ids) s.run(seconds, id);
});
export function getPlaySeconds(playerId) {
  try { return stmt('SELECT play_seconds FROM players WHERE id=?').get(playerId)?.play_seconds || 0; }
  catch(_) { return 0; }
}

// ── Telemetry: position snapshots + purchase log (capped retention) ────────────
export function recordFRSPositionSnapshot(playerId, net, cash, equity, fundStake, holdings) {
  try {
    stmt(`INSERT INTO frs_position_snapshots(player_id,ts,net_worth,cash,equity,fund_stake,holdings)
          VALUES(?,?,?,?,?,?,?)`)
      .run(playerId, Date.now(), net, cash, equity, fundStake || 0,
           holdings ? JSON.stringify(holdings) : null);
    // Keep the most recent 200 rows per player.
    stmt(`DELETE FROM frs_position_snapshots WHERE player_id=? AND id NOT IN
          (SELECT id FROM frs_position_snapshots WHERE player_id=? ORDER BY ts DESC LIMIT 200)`)
      .run(playerId, playerId);
  } catch(_) {}
}
export function logFRSPurchase(playerId, kind, symbol, qty, price) {
  try {
    const notional = (Number(qty) || 0) * (Number(price) || 0);
    stmt(`INSERT INTO frs_purchase_log(player_id,ts,kind,symbol,qty,price,notional)
          VALUES(?,?,?,?,?,?,?)`)
      .run(playerId, Date.now(), String(kind), symbol || null, Number(qty) || 0, Number(price) || 0, notional);
    // Global cap so the table can't grow unbounded on a busy server.
    stmt(`DELETE FROM frs_purchase_log WHERE id NOT IN
          (SELECT id FROM frs_purchase_log ORDER BY ts DESC LIMIT 20000)`).run();
  } catch(_) {}
}
export function getFRSPlayerTelemetry(playerId, purchaseLimit=40, snapLimit=40) {
  return {
    play_seconds: getPlaySeconds(playerId),
    purchases: stmt(`SELECT ts,kind,symbol,qty,price,notional FROM frs_purchase_log
                     WHERE player_id=? ORDER BY ts DESC LIMIT ?`).all(playerId, purchaseLimit),
    snapshots: stmt(`SELECT ts,net_worth,cash,equity,fund_stake FROM frs_position_snapshots
                     WHERE player_id=? ORDER BY ts DESC LIMIT ?`).all(playerId, snapLimit),
    tax: stmt(`SELECT ts,period_gain,tax_assessed,from_prepaid,from_cash,new_owed FROM frs_tax_history
               WHERE subject_id=? ORDER BY ts DESC LIMIT 12`).all(playerId),
  };
}
// Recent purchases across all players, optionally filtered to large notional, for the live surveillance feed.
export function getFRSRecentPurchases(limit=60, minNotional=0) {
  return stmt(`SELECT pl.ts,pl.kind,pl.symbol,pl.qty,pl.price,pl.notional,p.name
               FROM frs_purchase_log pl LEFT JOIN players p ON p.id=pl.player_id
               WHERE pl.notional >= ? ORDER BY pl.ts DESC LIMIT ?`).all(minNotional, limit);
}

// ── Tax engine: settings ──────────────────────────────────────────────────────
export function getFRSSettings() {
  const row = stmt('SELECT enabled,rate_bps,loss_carryforward,house_mode,withdraw_tax_bps,last_run_ts FROM frs_settings WHERE id=1').get();
  return row || { enabled:0, rate_bps:1500, loss_carryforward:1, house_mode:'gains', withdraw_tax_bps:1500, last_run_ts:0 };
}
export function setFRSSetting(patch) {
  const cur = getFRSSettings();
  const enabled = patch.enabled != null ? (patch.enabled ? 1 : 0) : cur.enabled;
  const rate = patch.rate_bps != null ? Math.max(0, Math.min(10000, Math.floor(patch.rate_bps))) : cur.rate_bps;
  const loss = patch.loss_carryforward != null ? (patch.loss_carryforward ? 1 : 0) : cur.loss_carryforward;
  const house = patch.house_mode != null ? (patch.house_mode === 'total' ? 'total' : 'gains') : cur.house_mode;
  const wtax = patch.withdraw_tax_bps != null ? Math.max(0, Math.min(10000, Math.floor(patch.withdraw_tax_bps))) : cur.withdraw_tax_bps;
  const lastRun = patch.last_run_ts != null ? Math.floor(patch.last_run_ts) : cur.last_run_ts;
  stmt('UPDATE frs_settings SET enabled=?, rate_bps=?, loss_carryforward=?, house_mode=?, withdraw_tax_bps=?, last_run_ts=? WHERE id=1')
    .run(enabled, rate, loss, house, wtax, lastRun);
  return getFRSSettings();
}

// ── Tax engine: per-player state read/write ───────────────────────────────────
export function getPlayerTaxState(playerId) {
  const row = stmt('SELECT tax_basis,tax_owed,tax_prepaid,tax_loss_credit FROM players WHERE id=?').get(playerId);
  return row || { tax_basis:null, tax_owed:0, tax_prepaid:0, tax_loss_credit:0 };
}
export function setPlayerTaxState(playerId, { tax_basis, tax_owed, tax_prepaid, tax_loss_credit }) {
  const cur = getPlayerTaxState(playerId);
  stmt('UPDATE players SET tax_basis=?, tax_owed=?, tax_prepaid=?, tax_loss_credit=? WHERE id=?')
    .run(
      tax_basis      !== undefined ? tax_basis      : cur.tax_basis,
      tax_owed       !== undefined ? tax_owed       : cur.tax_owed,
      tax_prepaid    !== undefined ? tax_prepaid    : cur.tax_prepaid,
      tax_loss_credit!== undefined ? tax_loss_credit: cur.tax_loss_credit,
      playerId
    );
}
export function recordTaxHistory(kind, subjectId, periodGain, taxAssessed, fromPrepaid, fromCash, newOwed) {
  try {
    stmt(`INSERT INTO frs_tax_history(subject_kind,subject_id,ts,period_gain,tax_assessed,from_prepaid,from_cash,new_owed)
          VALUES(?,?,?,?,?,?,?,?)`)
      .run(kind, subjectId, Date.now(), periodGain, taxAssessed, fromPrepaid || 0, fromCash || 0, newOwed || 0);
  } catch(_) {}
}
// All player ids with a non-null basis OR currently held shares OR any cash above the starting float,
// i.e. everyone the engine needs to consider. Cheap: just enumerate players.
export function getAllPlayerIdsForTax() {
  return stmt('SELECT id FROM players').all().map(r => r.id);
}

// ── Casino rounds: server-authoritative bet/settle ledger ─────────────────────
export function openCasinoRound({ id, playerId, game, wager, cashBefore, openedTs }) {
  stmt(`INSERT INTO casino_rounds(id,player_id,game,wager,status,cash_before,opened_ts)
        VALUES(?,?,?,?,'open',?,?)`)
    .run(id, playerId, game, wager, cashBefore, openedTs);
}
export function getCasinoRound(id) {
  return stmt('SELECT * FROM casino_rounds WHERE id=?').get(id) || null;
}
// Only an OPEN round for this player may be mutated by a result / addon.
export function getOpenCasinoRound(id, playerId) {
  return stmt("SELECT * FROM casino_rounds WHERE id=? AND player_id=? AND status='open'").get(id, playerId) || null;
}
// Does this player already have an open round for this game? (one-at-a-time guard)
export function getOpenRoundForGame(playerId, game) {
  return stmt("SELECT * FROM casino_rounds WHERE player_id=? AND game=? AND status='open' LIMIT 1").get(playerId, game) || null;
}
export function addCasinoWager(id, addAmount) {
  stmt('UPDATE casino_rounds SET wager = wager + ? WHERE id=?').run(addAmount, id);
}
export function resolveCasinoRound(id, status, payout, cashAfter, resolvedTs) {
  stmt('UPDATE casino_rounds SET status=?, payout=?, cash_after=?, resolved_ts=? WHERE id=?')
    .run(status, payout, cashAfter, resolvedTs, id);
}
// Rounds still 'open' past the cutoff — used by the sweep to force-resolve stragglers.
export function getExpiredOpenCasinoRounds(cutoffTs) {
  return stmt("SELECT * FROM casino_rounds WHERE status='open' AND opened_ts < ?").all(cutoffTs);
}
// Most recent round OPENED for this player+game, whatever its status. The math
// exams derive their cooldown from this rather than a new column: the ledger
// already records every sitting, so there is nothing to migrate and nothing to
// keep in sync. Counting from opened_ts (not resolved_ts) means abandoning a
// paper does not reset the clock.
export function getLastCasinoRoundTs(playerId, game) {
  const r = stmt("SELECT opened_ts FROM casino_rounds WHERE player_id=? AND game=? ORDER BY opened_ts DESC LIMIT 1")
    .get(playerId, game);
  return r ? r.opened_ts : 0;
}
// Best profitable sitting for this player+game. Used as the certification gate:
// with the math grade curve, payout > wager is reachable only at grade C and
// above, so "has ever profited on this paper" and "has ever passed it" are the
// same fact and no extra table is needed to record it.
export function getBestCasinoResult(playerId, game) {
  return stmt(`SELECT * FROM casino_rounds
               WHERE player_id=? AND game=? AND status IN ('resolved','clamped')
               ORDER BY (payout - wager) DESC LIMIT 1`).get(playerId, game) || null;
}
// All rounds still 'open' — used once on boot to void anything a crash left dangling.
export function getAllOpenCasinoRounds() {
  return stmt("SELECT * FROM casino_rounds WHERE status='open'").all();
}
// Dev panel: recent activity for one player, newest first.
export function getCasinoActivity(playerId, limit = 100) {
  return stmt('SELECT * FROM casino_rounds WHERE player_id=? ORDER BY opened_ts DESC LIMIT ?')
    .all(playerId, Math.max(1, Math.min(500, limit | 0)));
}

// ══════════════════════════════════════════════════════════════════════════════
//  GUILD CLEARANCE  -  added 1.3.7.0
//
//  The alt-account problem is not an identity problem, it is a faucet problem.
//  Every new account is handed a seed advance (1000). Nothing stopped that
//  advance from being pushed straight back out to a main account, so an
//  unthrottled /api/register turned into an unbounded money printer at roughly
//  980 per registration.
//
//  Rather than gate on identity (IP, email, device) which is both bypassable
//  and hostile to real players sharing a household or a carrier NAT, we gate on
//  PROVENANCE: an account may only move value it has demonstrably created.
//
//      allowance = peak_net_worth - seed_grant - lifetime_received
//      remaining = allowance - lifetime_sent
//
//  A fresh account has peak 1000, grant 1000, received 0, so its allowance is
//  zero forever. No timer to wait out, so pre-registering a farm buys nothing.
//  A real player who turned the seed into 200k has ~199k of clearance and will
//  never notice the ceiling exists.
//
//  Subtracting lifetime_received is what kills laundering chains: value that
//  arrived from another player raises peak net worth and is subtracted right
//  back out, so it cannot be forwarded on to mint clearance downstream.
//
//  fund_out is tracked separately and deliberately NOT subtracted from the
//  allowance. Peak net worth already includes fund stake, so a deposit is not a
//  loss of value; fund_out exists only so a withdrawal can tell return-of-own-
//  capital apart from a drain of somebody else's deposits. The excess is the
//  part that counts as received.
// ══════════════════════════════════════════════════════════════════════════════

export function initClearanceTables() {
  try { db.exec('ALTER TABLE players ADD COLUMN peak_net_worth    REAL    NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN lifetime_sent     REAL    NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN lifetime_received REAL    NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN fund_out          REAL    NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN clearance_exempt  INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE players ADD COLUMN last_wire_at      INTEGER NOT NULL DEFAULT 0'); } catch(_) {}

  db.exec(`
    -- Every player-to-player movement of value, whatever the route. This is the
    -- forensic trail that did not exist before: without it a farm cannot be
    -- sized, attributed or unwound after the fact.
    CREATE TABLE IF NOT EXISTS value_flow_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      kind    TEXT    NOT NULL,
      from_id TEXT,
      to_id   TEXT,
      amount  REAL    NOT NULL,
      note    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vfl_from ON value_flow_log(from_id, ts);
    CREATE INDEX IF NOT EXISTS idx_vfl_to   ON value_flow_log(to_id, ts);
    CREATE INDEX IF NOT EXISTS idx_vfl_ts   ON value_flow_log(ts);
    CREATE TABLE IF NOT EXISTS clearance_meta (
      key TEXT PRIMARY KEY,
      val TEXT
    );
  `);

  // One-time backfill. Existing players are granted the clearance their history
  // already earned them, so nobody established wakes up locked out. Past
  // transfers are amnestied: lifetime_sent and lifetime_received both start at
  // zero because there is no record to reconstruct them from.
  const done = stmt('SELECT val FROM clearance_meta WHERE key=?').get('backfill_v1');
  if (!done) {
    const n = stmt(`
      UPDATE players SET peak_net_worth = MAX(
        COALESCE((SELECT MAX(h.net_worth) FROM net_worth_history h WHERE h.player_id = players.id), 0),
        COALESCE(cash, 0)
      )
    `).run();
    stmt('INSERT OR REPLACE INTO clearance_meta(key,val) VALUES(?,?)')
      .run('backfill_v1', String(Date.now()));
    console.log(`[Clearance] Backfilled peak net worth for ${n.changes|0} player(s)`);
  }
}

export let recordValueFlowFn;
export let recordFundFlowFn;

export function setupClearanceTransactions() {
  // A player-to-player movement. Either side may be null when the counterparty
  // is not a player (a fund pool, a sink, the treasury).
  recordValueFlowFn = transaction((fromId, toId, amount, kind, note) => {
    const amt = Number(amount) || 0;
    if (!(amt > 0)) return;
    if (fromId) stmt('UPDATE players SET lifetime_sent=lifetime_sent+? WHERE id=?').run(amt, fromId);
    if (toId)   stmt('UPDATE players SET lifetime_received=lifetime_received+? WHERE id=?').run(amt, toId);
    stmt('INSERT INTO value_flow_log(ts,kind,from_id,to_id,amount,note) VALUES(?,?,?,?,?,?)')
      .run(Date.now(), String(kind || 'unknown'), fromId || null, toId || null, amt, note || null);
  });

  // Fund deposits and withdrawals. delta > 0 is value going into the pool,
  // delta < 0 is value coming back out. A withdrawal first repays this player's
  // own fund_out; anything beyond that is somebody else's capital and is booked
  // as received, which is what catches an owner or treasurer draining member
  // deposits (model B withdrawals are capped by fund cash, not by own stake).
  recordFundFlowFn = transaction((playerId, delta, fundId, note) => {
    const d = Number(delta) || 0;
    if (d === 0 || !playerId) return 0;
    const row = stmt('SELECT fund_out, lifetime_received FROM players WHERE id=?').get(playerId);
    if (!row) return 0;
    let fundOut = Number(row.fund_out || 0);
    let recv    = Number(row.lifetime_received || 0);
    let booked  = 0;
    if (d > 0) {
      fundOut += d;
    } else {
      const back = -d;
      const off  = Math.min(fundOut, back);
      fundOut -= off;
      booked   = back - off;
      recv    += booked;
    }
    stmt('UPDATE players SET fund_out=?, lifetime_received=? WHERE id=?')
      .run(Math.max(0, fundOut), recv, playerId);
    stmt('INSERT INTO value_flow_log(ts,kind,from_id,to_id,amount,note) VALUES(?,?,?,?,?,?)')
      .run(Date.now(), d > 0 ? 'fund_deposit' : 'fund_withdraw',
           d > 0 ? playerId : null, d > 0 ? null : playerId,
           Math.abs(d), note || (fundId ? `fund:${fundId}` : null));
    return booked;
  });
}

export function getClearanceRow(playerId) {
  try {
    return stmt(`SELECT peak_net_worth, lifetime_sent, lifetime_received, fund_out,
                        clearance_exempt, cash, created_at
                 FROM players WHERE id=?`).get(playerId) || null;
  } catch(_) { return null; }
}

// Monotone. Only ever raises the stored peak, never lowers it.
export function bumpPeakNetWorth(playerId, net) {
  const n = Number(net);
  if (!playerId || !Number.isFinite(n) || n <= 0) return;
  try {
    stmt('UPDATE players SET peak_net_worth=? WHERE id=? AND peak_net_worth < ?')
      .run(n, playerId, n);
  } catch(_) {}
}

export function setClearanceExempt(playerId, flag) {
  stmt('UPDATE players SET clearance_exempt=? WHERE id=?').run(flag ? 1 : 0, playerId);
}

// ─── Forensics ────────────────────────────────────────────────────────────────

export function getValueFlowsFor(playerId, limit = 200) {
  return stmt(`SELECT v.*, pf.name AS from_name, pt.name AS to_name
               FROM value_flow_log v
               LEFT JOIN players pf ON pf.id = v.from_id
               LEFT JOIN players pt ON pt.id = v.to_id
               WHERE v.from_id=? OR v.to_id=?
               ORDER BY v.ts DESC LIMIT ?`)
    .all(playerId, playerId, Math.max(1, Math.min(1000, limit | 0)));
}

export function getRecentValueFlows(limit = 200) {
  return stmt(`SELECT v.*, pf.name AS from_name, pt.name AS to_name
               FROM value_flow_log v
               LEFT JOIN players pf ON pf.id = v.from_id
               LEFT JOIN players pt ON pt.id = v.to_id
               ORDER BY v.ts DESC LIMIT ?`)
    .all(Math.max(1, Math.min(1000, limit | 0)));
}

// Farm signature: one receiver, many senders, each sender young at the moment
// it sent. Legitimate play does not produce this shape. Reported, never acted
// on automatically: the GM decides.
export function getFarmSignals(maxSenderAgeMs = 7 * 24 * 3600 * 1000, minSenders = 3, limit = 50) {
  return stmt(`SELECT v.to_id,
                      pt.name              AS to_name,
                      COUNT(DISTINCT v.from_id) AS senders,
                      COUNT(*)             AS flows,
                      SUM(v.amount)        AS total,
                      MAX(v.ts)            AS last_ts
               FROM value_flow_log v
               JOIN players s  ON s.id  = v.from_id
               LEFT JOIN players pt ON pt.id = v.to_id
               WHERE v.from_id IS NOT NULL AND v.to_id IS NOT NULL
                 AND (v.ts - s.created_at) < ?
               GROUP BY v.to_id
               HAVING senders >= ?
               ORDER BY total DESC
               LIMIT ?`)
    .all(Math.max(0, maxSenderAgeMs | 0), Math.max(2, minSenders | 0), Math.max(1, Math.min(200, limit | 0)));
}

// Accounts sharing an inbound edge with a known receiver, newest first. Used to
// eyeball a suspected cluster before touching anything.
export function getInboundSenders(playerId, limit = 200) {
  return stmt(`SELECT v.from_id, p.name, p.created_at, SUM(v.amount) AS total, COUNT(*) AS flows
               FROM value_flow_log v
               LEFT JOIN players p ON p.id = v.from_id
               WHERE v.to_id=? AND v.from_id IS NOT NULL
               GROUP BY v.from_id
               ORDER BY total DESC LIMIT ?`)
    .all(playerId, Math.max(1, Math.min(500, limit | 0)));
}

// Single listing lookups, so a clearance check can price a purchase before the
// purchase transaction runs.
export function getMarketListing(listingId) {
  try { return stmt('SELECT * FROM item_market WHERE id=? AND sold=0').get(listingId) || null; }
  catch(_) { return null; }
}

// Wire cooldown, moved off an in-memory Map so it survives a process restart.
export function getLastWireAt(playerId) {
  try { return Number(stmt('SELECT last_wire_at FROM players WHERE id=?').get(playerId)?.last_wire_at || 0); }
  catch(_) { return 0; }
}
export function setLastWireAt(playerId, ts) {
  try { stmt('UPDATE players SET last_wire_at=? WHERE id=?').run(Number(ts) || Date.now(), playerId); } catch(_) {}
}

// ══════════════════════════════════════════════════════════════════════════════
//  WAREHOUSES  -  added 1.3.7.2
//
//  Commodity storage was free and unbounded: player_cargo just incremented and
//  ship capacity gated only /api/cargo/ship, never buying or holding. So holding
//  was never a decision, and cornering a colony's supply cost nothing to sustain.
//
//  Capacity is a CONTINUOUS SLIDER, not a tier. Rent is linear in capacity, so
//  there is no step to hide inside: a large holder pays proportionally and never
//  gets free marginal storage the way a tiered slot would have allowed.
//
//  Rent is charged DAILY, not on the commodity tick. tickCommodityPrices reverts
//  0.25 toward target every 5 minutes, so a dislocation half-lives in about 12
//  minutes and no amount of waiting beats it. The only durable reason to hold is
//  a change in the TARGET (faction control, tension, civic demand), which moves
//  over hours and days. Charging per tick would tax ordinary buy-ship-sell flow
//  and barely touch the behaviour being priced.
//
//  Arrears follow the margin call model rather than inventing a second one.
//  Containment is the important part: a warehouse in arrears liquidates its own
//  stock at its own colony's price and never reaches cash held for anything
//  else, another colony's shed, equities or fund stake.
// ══════════════════════════════════════════════════════════════════════════════

export function initWarehouseTables() {
  // Capacity is denominated in Ƒ, not units. A unit of nano filament (basePrice
  // 4100) and a unit of frayed wiring (210) are not the same storage problem,
  // and charging per unit made them identical. The value is LOCKED WHEN THE
  // UNITS ENTER the shed and never marked to market: a price crash must not
  // silently free capacity, and a spike must not blow a lease the player set in
  // good faith. store_unit_val is the locked per unit Ƒ figure; consumed
  // capacity at a colony is SUM(qty * store_unit_val).
  try { db.exec('ALTER TABLE player_cargo ADD COLUMN store_unit_val REAL NOT NULL DEFAULT 0'); } catch(_) {}
  // Backfill: pre-warehouse rows are valued at what the player paid.
  try { db.exec('UPDATE player_cargo SET store_unit_val = avg_cost WHERE store_unit_val <= 0'); } catch(_) {}
  // Shipments lock their storage valuation AT SHIP TIME off the destination's
  // price then, so the berth booked is exactly the berth consumed on arrival and
  // price drift in flight can never overflow the destination shed.
  try { db.exec('ALTER TABLE cargo_shipments ADD COLUMN store_unit_val REAL NOT NULL DEFAULT 0'); } catch(_) {}
  try { db.exec('ALTER TABLE warehouses ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      player_id   TEXT    NOT NULL,
      colony_id   TEXT    NOT NULL,
      capacity    INTEGER NOT NULL DEFAULT 0,
      reserved    INTEGER NOT NULL DEFAULT 0,   -- units promised to in-flight shipments
      arrears     REAL    NOT NULL DEFAULT 0,
      last_billed INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (player_id, colony_id)
    );
    CREATE INDEX IF NOT EXISTS idx_wh_player ON warehouses(player_id);
    CREATE INDEX IF NOT EXISTS idx_wh_arrears ON warehouses(arrears);

    -- Arrears calls. One row per player+colony, mirroring margin_calls.
    CREATE TABLE IF NOT EXISTS warehouse_calls (
      player_id TEXT    NOT NULL,
      colony_id TEXT    NOT NULL,
      called_at INTEGER NOT NULL,
      deadline  INTEGER NOT NULL,
      PRIMARY KEY (player_id, colony_id)
    );

    CREATE TABLE IF NOT EXISTS warehouse_meta (
      key TEXT PRIMARY KEY,
      val TEXT
    );
  `);
}

export function getWarehouse(playerId, colonyId) {
  try { return stmt('SELECT * FROM warehouses WHERE player_id=? AND colony_id=?').get(playerId, colonyId) || null; }
  catch(_) { return null; }
}
export function getPlayerWarehouses(playerId) {
  try { return stmt('SELECT * FROM warehouses WHERE player_id=? ORDER BY colony_id').all(playerId); }
  catch(_) { return []; }
}
export function getAllWarehouses() {
  try { return stmt('SELECT * FROM warehouses WHERE capacity > 0 OR arrears > 0 OR locked_until > 0').all(); }
  catch(_) { return []; }
}
export function upsertWarehouse(playerId, colonyId, capacity) {
  const now = Date.now();
  stmt(`INSERT INTO warehouses(player_id,colony_id,capacity,reserved,arrears,last_billed,created_at)
        VALUES(?,?,?,0,0,?,?)
        ON CONFLICT(player_id,colony_id) DO UPDATE SET capacity=excluded.capacity`)
    .run(playerId, colonyId, Math.max(0, Math.floor(capacity)), now, now);
  return getWarehouse(playerId, colonyId);
}
export function setWarehouseArrears(playerId, colonyId, arrears, lastBilled) {
  stmt('UPDATE warehouses SET arrears=?, last_billed=COALESCE(?,last_billed) WHERE player_id=? AND colony_id=?')
    .run(Math.max(0, Number(arrears) || 0), lastBilled || null, playerId, colonyId);
}
export function deleteWarehouse(playerId, colonyId) {
  try { stmt('DELETE FROM warehouses WHERE player_id=? AND colony_id=?').run(playerId, colonyId); } catch(_) {}
}

// Reserved space is capacity promised to cargo that has already left its origin.
// Booked at ship time so a delivery can never arrive with nowhere to land: the
// units are gone from the origin hold the moment /api/cargo/ship escrows them,
// so a capacity check at DELIVERY time would have no state to fall back to.
export function addWarehouseReserved(playerId, colonyId, delta) {
  stmt('UPDATE warehouses SET reserved = MAX(0, reserved + ?) WHERE player_id=? AND colony_id=?')
    .run(Math.floor(delta), playerId, colonyId);
}

export function setWarehouseCall(playerId, colonyId, calledAt, deadline) {
  stmt(`INSERT INTO warehouse_calls(player_id,colony_id,called_at,deadline) VALUES(?,?,?,?)
        ON CONFLICT(player_id,colony_id) DO UPDATE SET called_at=excluded.called_at, deadline=excluded.deadline`)
    .run(playerId, colonyId, calledAt, deadline);
}
export function getWarehouseCall(playerId, colonyId) {
  try { return stmt('SELECT * FROM warehouse_calls WHERE player_id=? AND colony_id=?').get(playerId, colonyId) || null; }
  catch(_) { return null; }
}
export function clearWarehouseCall(playerId, colonyId) {
  try { stmt('DELETE FROM warehouse_calls WHERE player_id=? AND colony_id=?').run(playerId, colonyId); } catch(_) {}
}
export function getActiveWarehouseCalls() {
  try { return stmt('SELECT * FROM warehouse_calls').all(); }
  catch(_) { return []; }
}

// Units this player holds at one colony, across every commodity. This is the
// floor the capacity slider cannot be dragged below.
// Ƒ of shed capacity consumed at one colony: qty x the value locked at entry.
export function getCargoStoredValueAtColony(playerId, colonyId) {
  try {
    const r = stmt(`SELECT COALESCE(SUM(qty * COALESCE(NULLIF(store_unit_val,0), avg_cost)),0) AS v
                    FROM player_cargo WHERE player_id=? AND colony_id=?`).get(playerId, colonyId);
    return Math.round(Number(r?.v || 0) * 100) / 100;
  } catch(_) { return 0; }
}

export function setWarehouseLockout(playerId, colonyId, until) {
  try { stmt('UPDATE warehouses SET locked_until=? WHERE player_id=? AND colony_id=?').run(Number(until)||0, playerId, colonyId); } catch(_) {}
}

export function getCargoTotalAtColony(playerId, colonyId) {
  try {
    const r = stmt('SELECT COALESCE(SUM(qty),0) AS n FROM player_cargo WHERE player_id=? AND colony_id=?')
      .get(playerId, colonyId);
    return Number(r?.n || 0);
  } catch(_) { return 0; }
}

// Stock at one colony, dearest first. Liquidation sells the most valuable units
// first so the fewest units are destroyed to clear a given debt.
export function getCargoRowsAtColony(playerId, colonyId) {
  try {
    return stmt('SELECT commodity_id, qty, avg_cost, store_unit_val FROM player_cargo WHERE player_id=? AND colony_id=? AND qty > 0')
      .all(playerId, colonyId);
  } catch(_) { return []; }
}

export function getWarehouseMeta(key) {
  try { return stmt('SELECT val FROM warehouse_meta WHERE key=?').get(key)?.val || null; }
  catch(_) { return null; }
}
export function setWarehouseMeta(key, val) {
  stmt('INSERT OR REPLACE INTO warehouse_meta(key,val) VALUES(?,?)').run(key, String(val));
}

// Locked per-unit shelf valuation for an in-flight shipment. Written at ship
// time so the berth reserved at the destination is exactly the berth consumed
// on arrival, whatever the price does in between.
export function setCargoShipmentStoreUnitVal(id, unitVal) {
  try { stmt('UPDATE cargo_shipments SET store_unit_val=? WHERE id=?').run(Math.max(0, Number(unitVal) || 0), id); } catch(_) {}
}


// ─── Patreon audit support (1.3.7.3) ─────────────────────────────────────────
// Everyone currently holding a paid tier, with the fields the reconciliation
// needs to decide whether they are still entitled to it.
export function getPatreonHolders() {
  try {
    return stmt(`SELECT id, name, patreon_tier, patreon_email, patreon_member_id,
                        patreon_expires_at, COALESCE(patreon_exempt,0) AS patreon_exempt
                 FROM players WHERE patreon_tier > 0 ORDER BY patreon_tier DESC, name`).all();
  } catch(_) { return []; }
}

export function setPatreonExempt(playerId, flag) {
  try { stmt('UPDATE players SET patreon_exempt=?, updated_at=? WHERE id=?')
    .run(flag ? 1 : 0, Date.now(), playerId); } catch(_) {}
}
