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
    CREATE TABLE IF NOT EXISTS net_worth_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      net_worth REAL NOT NULL,
      cash      REAL NOT NULL,
      equity    REAL NOT NULL,
      ts        INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_nwh_player_ts ON net_worth_history(player_id, ts);
    CREATE INDEX IF NOT EXISTS idx_players_patreon_email ON players(patreon_email);
    CREATE INDEX IF NOT EXISTS idx_players_patreon_member ON players(patreon_member_id);
    CREATE TABLE IF NOT EXISTS colony_state (
      id                  TEXT PRIMARY KEY,
      faction             TEXT NOT NULL DEFAULT 'coalition',
      control_coalition   INTEGER NOT NULL DEFAULT 0,
      control_syndicate   INTEGER NOT NULL DEFAULT 0,
      control_void        INTEGER NOT NULL DEFAULT 0,
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
  `);

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
  ];
  for (const [col, def] of _migrations) {
    if (!_existingCols.has(col)) {
      db.exec(`ALTER TABLE players ADD COLUMN ${col} ${def}`);
      console.log(`[DB] Migrated: added column ${col}`);
    }
  }

  console.log(`[DB] SQLite ready: ${DB_PATH}`);
  return db;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export let savePlayerFn;
export let recordNetWorthFn;

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
      if (qty>0) stmt('INSERT OR REPLACE INTO holdings VALUES(?,?,?)').run(player.id,sym,qty);
    }
    stmt('DELETE FROM basis WHERE player_id=?').run(player.id);
    for (const [sym, bc] of Object.entries(player.basisC||{})) {
      if (bc>0) stmt('INSERT OR REPLACE INTO basis VALUES(?,?,?)').run(player.id,sym,Math.floor(bc));
    }
  });

  recordNetWorthFn = transaction((playerId, net, cash, equity) => {
    stmt('INSERT INTO net_worth_history(player_id,net_worth,cash,equity,ts) VALUES(?,?,?,?,?)')
      .run(playerId, net, cash, equity, Date.now());
    stmt(`DELETE FROM net_worth_history WHERE player_id=? AND id NOT IN
          (SELECT id FROM net_worth_history WHERE player_id=? ORDER BY ts DESC LIMIT 1000)`)
      .run(playerId, playerId);
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
  const holdings={}, basisC={};
  stmt('SELECT symbol,qty FROM holdings WHERE player_id=?').all(row.id)
    .forEach(h=>{ if(h.qty>0) holdings[h.symbol]=h.qty; });
  stmt('SELECT symbol,basis_c FROM basis WHERE player_id=?').all(row.id)
    .forEach(b=>{ if(b.basis_c>0) basisC[b.symbol]=b.basis_c; });
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
    holdings, basisC,
    tutorial_seen: row.tutorial_seen || 0,
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
export function countCEOs() { return (stmt('SELECT COUNT(*) as n FROM players WHERE patreon_tier=3').get()||{n:0}).n; }

// ─── Patreon tier management ──────────────────────────────────────────────────

export function setPatreonTier(playerId, tier, memberId, expiresAt) {
  stmt(`UPDATE players SET patreon_tier=?,patreon_member_id=?,patreon_expires_at=?,updated_at=? WHERE id=?`)
    .run(tier, memberId||null, expiresAt||null, Date.now(), playerId);
}

export function linkPatreonEmail(playerId, email) {
  stmt('UPDATE players SET patreon_email=?,updated_at=? WHERE id=?').run(email.toLowerCase().trim(), Date.now(), playerId);
}

// Revoke expired Patreon tiers (call periodically)
export function revokeExpiredPatreon() {
  const now = Date.now();
  const expired = stmt(`SELECT id FROM players WHERE patreon_tier>0 AND patreon_expires_at IS NOT NULL AND patreon_expires_at<?`).all(now);
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

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export function getLeaderboard(companies, limit=20) {
  const players = stmt(`SELECT id,name,cash,xp,level,title,patreon_tier,is_dev,is_admin,is_prime FROM players WHERE is_dev=0 AND is_admin=0 AND is_prime=0`).all();
  return players.map(p=>{
    const holdRows = stmt('SELECT symbol,qty FROM holdings WHERE player_id=?').all(p.id);
    const equity   = holdRows.reduce((acc,h)=>{ const c=companies.find(x=>x.symbol===h.symbol); return acc+(c?c.price*h.qty:0); },0);
    return { id:p.id, name:p.name, net:p.cash+equity, xp:p.xp, level:p.level, title:p.title, patreon_tier:p.patreon_tier||0, is_dev:!!(p.is_dev||p.is_admin), is_prime:!!(p.is_prime) };
  }).sort((a,b)=>b.net-a.net).slice(0,limit);
}

// ─── Market state ─────────────────────────────────────────────────────────────

export function saveMarketState(companies, headlines) {
  const state = {
    companies: companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price,lnP:c.lnP,sigma:c.sigma,ohlc:c.ohlc})),
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
  `);

  // Seed special funds if not present
  const now = Date.now();
  const existing = stmt('SELECT id FROM funds').all().map(r => r.id);

  if (!existing.includes('FLSH')) {
    stmt(`INSERT INTO funds(id,name,type,owner_id,description,max_members,slot_cost,savings_rate,cash,created_at)
          VALUES('FLSH','FLSH Capital','flsh',null,'Developer fund. Revenue from all platform trade fees.',999,0,0.0004,1000000000000,?)`)
      .run(now);
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
  stmt(`INSERT INTO funds(id,name,type,owner_id,description,max_members,slot_cost,savings_rate,cash,created_at)
        VALUES(?,?,'player',?,?,?,100000,0.0004,0,?)`)
    .run(id, name, ownerId, description||'', maxMembers||FUND_BASE_SLOTS, now);
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
  return stmt('SELECT symbol,qty FROM fund_portfolios WHERE fund_id=? AND qty>0').all(fundId);
}
export function setFundPortfolioQty(fundId, symbol, qty) {
  if (qty <= 0) stmt('DELETE FROM fund_portfolios WHERE fund_id=? AND symbol=?').run(fundId, symbol);
  else stmt('INSERT OR REPLACE INTO fund_portfolios VALUES(?,?,?)').run(fundId, symbol, qty);
}
export function getTotalFundSharesById(fundId) {
  return (stmt('SELECT SUM(shares) as s FROM fund_memberships WHERE fund_id=?').get(fundId)||{s:0}).s || 0;
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

  fundWithdrawFn = transaction((fundId, playerId, pct, currentNAV) => {
    const member = getFundMembership(fundId, playerId); if (!member) throw new Error('not_a_member');
    const shares = member.shares * Math.min(1, Math.max(0.01, pct));
    if (shares <= 0) throw new Error('no_shares');
    const totalShares  = getTotalFundSharesById(fundId);
    const pricePerShare = totalShares > 0 && currentNAV > 0 ? currentNAV / totalShares : 1;
    const cashValue    = shares * pricePerShare;
    const fundCash     = getFundCashById(fundId);
    if (fundCash < cashValue) throw new Error('insufficient_fund_liquidity');
    stmt('UPDATE funds SET cash=cash-? WHERE id=?').run(cashValue, fundId);
    stmt('UPDATE players SET cash=cash+?,updated_at=? WHERE id=?').run(cashValue, Date.now(), playerId);
    stmt('UPDATE fund_memberships SET shares=shares-? WHERE fund_id=? AND player_id=?').run(shares, fundId, playerId);
    stmt('INSERT INTO fund_activity(fund_id,ts,type,player_id,amount,note) VALUES(?,?,?,?,?,?)')
      .run(fundId, Date.now(), 'withdraw', playerId, cashValue, `Withdrew ${(pct*100).toFixed(0)}% of shares`);
    return cashValue;
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

// ── Dev accounts ──────────────────────────────────────────────────────────────

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
        (id,faction,control_coalition,control_syndicate,control_void,tension,contested,war_chest)
        VALUES(?,?,?,?,?,?,?,0)`)
        .run(c.id, c.faction, c.control_coalition, c.control_syndicate, c.control_void, c.tension, c.contested);
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
  { id:'new_anchor',       faction:'coalition',    control_coalition:82, control_syndicate:12, control_void:6,  tension:18, contested:0 },
  { id:'cascade_station',  faction:'coalition',    control_coalition:68, control_syndicate:20, control_void:12, tension:32, contested:1 },
  { id:'frontier_outpost', faction:'coalition',    control_coalition:51, control_syndicate:38, control_void:11, tension:49, contested:1 },
  { id:'the_hollow',       faction:'syndicate',    control_coalition:15, control_syndicate:74, control_void:11, tension:26, contested:0 },
  { id:'vein_cluster',     faction:'syndicate',    control_coalition:8,  control_syndicate:71, control_void:21, tension:29, contested:0 },
  { id:'aurora_prime',     faction:'coalition',    control_coalition:76, control_syndicate:10, control_void:14, tension:24, contested:0 },
  { id:'null_point',       faction:'void',         control_coalition:5,  control_syndicate:22, control_void:73, tension:22, contested:0 },
  { id:'flesh_station',    faction:'fleshstation', control_coalition:0,  control_syndicate:0,  control_void:0,  tension:0,  contested:0 },
  { id:'limbosis',         faction:'contested',    control_coalition:34, control_syndicate:33, control_void:33, tension:88, contested:1 },
  { id:'lustandia',        faction:'syndicate',    control_coalition:10, control_syndicate:62, control_void:28, tension:55, contested:0 },
  { id:'gluttonis',        faction:'contested',    control_coalition:28, control_syndicate:42, control_void:30, tension:74, contested:1 },
  { id:'abaddon',          faction:'contested',    control_coalition:20, control_syndicate:40, control_void:40, tension:95, contested:1 },
];

export function seedColoniesIfEmpty() {
  const count = (stmt('SELECT COUNT(*) as c FROM colony_state').get()||{c:0}).c;
  if (count > 0) return;
  for (const c of COLONY_DEFAULTS) {
    stmt(`INSERT OR IGNORE INTO colony_state
      (id,faction,control_coalition,control_syndicate,control_void,tension,contested,war_chest)
      VALUES(?,?,?,?,?,?,?,0)`)
      .run(c.id, c.faction, c.control_coalition, c.control_syndicate, c.control_void, c.tension, c.contested);
  }
  console.log('[Galaxy] Colony state seeded');
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

};

export const RARITY_CONFIG = {
  common:    { label:'Common',    color:'#888780', dropWeight:550, passiveBonus:10  },
  uncommon:  { label:'Uncommon',  color:'#1D9E75', dropWeight:250, passiveBonus:25  },
  rare:      { label:'Rare',      color:'#3B8BD4', dropWeight:120, passiveBonus:75  },
  epic:      { label:'Epic',      color:'#8B5CF6', dropWeight:75,  passiveBonus:200 },
  legendary: { label:'Legendary', color:'#ff6a00', dropWeight:5,   passiveBonus:500 },
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
  `);
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
