// FleshMarket City Charters, persistence layer (1.3.0.0).
// Self-contained: db.js calls initCityDb(db) once with the shared handle;
// server.js and city.js import the query functions. Tables are additive
// (CREATE TABLE IF NOT EXISTS), safe against existing live databases.
//
// v3 topology. Cities are permanent world objects built out to lore-accurate
// scale from their planet's population. Players do not own ground; they buy
// the MAYORAL SEAT of a district and govern it. Seats are contestable, priced
// exponentially by how developed the district already is, and revert to NPC
// administration when neglected, so a city can never decay into unusable
// rubble the way player-owned land could.
//
//   city_state     : one row per colony. Population, class, occupation lock.
//   city_districts : one row per district. Mayor, development, levers, scalars.
//   city_shops     : one row per storefront. Owner, trade, player-authored name.
//   city_lots      : RETIRED. Kept only so the v3 migration can refund it.

let _db;
const _S = {};
function S(sql) { if (!_S[sql]) _S[sql] = _db.prepare(sql); return _S[sql]; }

export function initCityDb(db) {
  _db = db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_state (
      colony_id     TEXT PRIMARY KEY,
      charter_owner TEXT,
      prev_charter  TEXT,
      city_class    TEXT    NOT NULL DEFAULT 'outpost',
      population    REAL    NOT NULL DEFAULT 60,
      is_capital    INTEGER NOT NULL DEFAULT 0,
      locked_faction TEXT,
      strip_unlock  INTEGER NOT NULL DEFAULT 0,
      last_strip    INTEGER NOT NULL DEFAULT 0,
      lv_security   INTEGER NOT NULL DEFAULT 0,
      lv_politics   INTEGER NOT NULL DEFAULT 0,
      lv_services   INTEGER NOT NULL DEFAULT 0,
      lv_upkeep     INTEGER NOT NULL DEFAULT 0,
      lv_subsidy    INTEGER NOT NULL DEFAULT 0,
      s_crime       REAL    NOT NULL DEFAULT 50,
      s_unrest      REAL    NOT NULL DEFAULT 30,
      s_corruption  REAL    NOT NULL DEFAULT 45,
      s_prosperity  REAL    NOT NULL DEFAULT 35,
      s_legitimacy  REAL    NOT NULL DEFAULT 40,
      s_output      REAL    NOT NULL DEFAULT 40,
      last_tick     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS city_lots (
      colony_id  TEXT    NOT NULL,
      q          INTEGER NOT NULL,
      r          INTEGER NOT NULL,
      owner      TEXT,
      built_by   TEXT    NOT NULL,
      faction    TEXT    NOT NULL DEFAULT 'coalition',
      kind       TEXT    NOT NULL DEFAULT 'export',
      tier       INTEGER NOT NULL DEFAULT 1,
      invested   REAL    NOT NULL DEFAULT 0,
      kind_until INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (colony_id, q, r)
    );
    CREATE TABLE IF NOT EXISTS city_districts (
      colony_id    TEXT    NOT NULL,
      idx          INTEGER NOT NULL,
      name         TEXT,
      zone         TEXT    NOT NULL DEFAULT 'commercial',
      mayor        TEXT,
      seat_paid    REAL    NOT NULL DEFAULT 0,
      took_office  INTEGER NOT NULL DEFAULT 0,
      invested     REAL    NOT NULL DEFAULT 0,
      commerce_cut REAL    NOT NULL DEFAULT 0.12,
      favoured     TEXT,
      arrears      REAL    NOT NULL DEFAULT 0,
      works        REAL    NOT NULL DEFAULT 0,
      lv_security  INTEGER NOT NULL DEFAULT 0,
      lv_politics  INTEGER NOT NULL DEFAULT 0,
      lv_services  INTEGER NOT NULL DEFAULT 0,
      lv_upkeep    INTEGER NOT NULL DEFAULT 0,
      lv_subsidy   INTEGER NOT NULL DEFAULT 0,
      s_crime      REAL    NOT NULL DEFAULT 50,
      s_unrest     REAL    NOT NULL DEFAULT 30,
      s_corruption REAL    NOT NULL DEFAULT 45,
      s_prosperity REAL    NOT NULL DEFAULT 35,
      s_legitimacy REAL    NOT NULL DEFAULT 40,
      s_output     REAL    NOT NULL DEFAULT 40,
      last_tick    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (colony_id, idx)
    );
    CREATE INDEX IF NOT EXISTS idx_districts_mayor ON city_districts(mayor);
    CREATE TABLE IF NOT EXISTS city_shops (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      colony_id  TEXT    NOT NULL,
      district   INTEGER NOT NULL,
      owner      TEXT    NOT NULL,
      kind       TEXT    NOT NULL DEFAULT 'export',
      name       TEXT    NOT NULL DEFAULT '',
      descr      TEXT    NOT NULL DEFAULT '',
      leased_at  INTEGER NOT NULL DEFAULT 0,
      paid_in    REAL    NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_shops_colony ON city_shops(colony_id);
    CREATE INDEX IF NOT EXISTS idx_shops_owner ON city_shops(owner);
    CREATE INDEX IF NOT EXISTS idx_shops_district ON city_shops(colony_id, district);
    CREATE TABLE IF NOT EXISTS city_kv (
      k TEXT PRIMARY KEY,
      v TEXT
    );
    -- Districts had no memory. For a world that is GM'd as a running narrative
    -- that is a gap: nobody could say who built a place or who lost it.
    CREATE TABLE IF NOT EXISTS city_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      colony_id TEXT    NOT NULL,
      district  INTEGER NOT NULL DEFAULT -1,
      ts        INTEGER NOT NULL,
      kind      TEXT    NOT NULL,
      actor     TEXT,
      detail    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hist_place ON city_history(colony_id, district, ts);
    -- Petition filings, so the cooldown survives a restart.
    -- The lore book. Dev-written pages recording what has happened in the
    -- world: not a changelog, a record kept in character. Lives here because
    -- db_city already owns the shared handle and the narrative tables; it is
    -- not city data, but it is world data and it is read the same way.
    CREATE TABLE IF NOT EXISTS lore_pages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      body       TEXT    NOT NULL DEFAULT '',
      author     TEXT,
      author_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      sort       INTEGER NOT NULL DEFAULT 0,
      published  INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_lore_sort ON lore_pages(published, sort, created_at);

    CREATE TABLE IF NOT EXISTS city_petitions (
      colony_id TEXT    NOT NULL,
      district  INTEGER NOT NULL,
      player    TEXT    NOT NULL,
      ts        INTEGER NOT NULL,
      PRIMARY KEY (colony_id, district, player)
    );
  `);
  // Additive column migrations. CREATE TABLE IF NOT EXISTS does nothing to an
  // existing table, so every column added after first ship needs its own ALTER
  // wrapped in a try. Failing means it is already there.
  try { db.exec('ALTER TABLE city_districts ADD COLUMN works REAL NOT NULL DEFAULT 0'); } catch (_) {}
  // 1.6.1.0. When the commerce rate and the favoured trade were last moved.
  // Both feed live income, and live income used to price NPC buyouts, so a
  // mayor could drop both, buy the business at a marked down price and put
  // them back inside a second. Pricing no longer reads either of them, and
  // these two stamps stop the same pair being whipsawed at tenants for any
  // other reason.
  try { db.exec('ALTER TABLE city_districts ADD COLUMN cut_at INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE city_districts ADD COLUMN fav_at INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
  // 1.6.2.4. History rows were written as finished English prose and rendered
  // raw, so the district record was permanently English in CN and, because it
  // is persisted, could never be retranslated later. Structured parameters go
  // here and the client builds the sentence through the language layer. The
  // English in `detail` stays as the fallback, which is what makes the rows
  // already in the table keep reading.
  try { db.exec('ALTER TABLE city_history ADD COLUMN params TEXT'); } catch (_) {}
  // 1.6.3.0. Stockpiled cover, per district, per class. A siege is measured in
  // days and zoning is measured in weeks, so a mayor needed something they
  // could buy before the lane closed rather than only after.
  try { db.exec('ALTER TABLE city_districts ADD COLUMN stock_food REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE city_districts ADD COLUMN stock_med  REAL NOT NULL DEFAULT 0'); } catch (_) {}
  try { db.exec('ALTER TABLE city_districts ADD COLUMN stock_tech REAL NOT NULL DEFAULT 0'); } catch (_) {}
  console.log('[City] tables ready');
}

// Batch writes. SQLite commits every statement separately by default, so a
// tick touching thousands of rows pays a commit each time. Nested calls are
// tolerated: only the outermost one opens and closes the transaction.
let _depth = 0;
export function beginBatch() {
  if (_depth++ > 0) return false;
  try { _db.exec(`BEGIN`); return true; } catch (_) { _depth--; return false; }
}
export function endBatch(owned, commit) {
  if (!owned) { if (_depth > 0) _depth--; return; }
  _depth = 0;
  try { _db.exec(commit ? `COMMIT` : `ROLLBACK`); } catch (_) {}
}

// ── History ──────────────────────────────────────────────────────────────────
// Trimmed per place rather than globally, so a busy capital cannot push a quiet
// frontier district's whole past out of the table.
export function pushCityHistory(colonyId, district, kind, actor, detail, params) {
  S(`INSERT INTO city_history (colony_id, district, ts, kind, actor, detail, params)
     VALUES (?,?,?,?,?,?,?)`).run(colonyId, district, Date.now(), kind, actor || null,
       detail || null, params ? JSON.stringify(params) : null);
  S(`DELETE FROM city_history WHERE colony_id=? AND district=? AND id NOT IN (
       SELECT id FROM city_history WHERE colony_id=? AND district=? ORDER BY ts DESC LIMIT 40)`)
    .run(colonyId, district, colonyId, district);
}
export function getCityHistory(colonyId, district, limit) {
  const n = Math.max(1, Math.min(40, Number(limit) || 12));
  return S(`SELECT ts, kind, actor, detail, params FROM city_history
            WHERE colony_id=? AND district=? ORDER BY ts DESC LIMIT ?`)
    .all(colonyId, district, n);
}
export function getColonyHistory(colonyId, limit) {
  const n = Math.max(1, Math.min(60, Number(limit) || 20));
  return S(`SELECT district, ts, kind, actor, detail, params FROM city_history
            WHERE colony_id=? ORDER BY ts DESC LIMIT ?`).all(colonyId, n);
}

// ── Petitions ────────────────────────────────────────────────────────────────
export function lastPetition(colonyId, district, playerId) {
  const r = S(`SELECT ts FROM city_petitions WHERE colony_id=? AND district=? AND player=?`)
    .get(colonyId, district, playerId);
  return r ? r.ts : 0;
}
export function recordPetition(colonyId, district, playerId) {
  S(`INSERT INTO city_petitions (colony_id, district, player, ts) VALUES (?,?,?,?)
     ON CONFLICT(colony_id, district, player) DO UPDATE SET ts=excluded.ts`)
    .run(colonyId, district, playerId, Date.now());
}

// ── Charter ──────────────────────────────────────────────────────────────────
export function setCharterOwner(colonyId, owner, prev) {
  S(`UPDATE city_state SET charter_owner=?, prev_charter=? WHERE colony_id=?`)
    .run(owner || null, prev || null, colonyId);
}

// ── Lore book ────────────────────────────────────────────────────────────────
// Ordered by sort then age, so a dev can pin an entry above the chronology
// without renumbering everything under it.
export function listLorePages(includeDrafts) {
  return includeDrafts
    ? S(`SELECT * FROM lore_pages ORDER BY sort ASC, created_at ASC`).all()
    : S(`SELECT * FROM lore_pages WHERE published=1 ORDER BY sort ASC, created_at ASC`).all();
}
export function getLorePage(id) {
  return S(`SELECT * FROM lore_pages WHERE id=?`).get(id) || null;
}
export function createLorePage(title, body, author, authorName) {
  const now = Date.now();
  const r = S(`INSERT INTO lore_pages (title, body, author, author_name, created_at, updated_at, sort, published)
               VALUES (?,?,?,?,?,?,0,1)`).run(title, body, author || null, authorName || null, now, now);
  return Number(r.lastInsertRowid);
}
const LORE_COLS = new Set(['title', 'body', 'sort', 'published']);
export function updateLorePage(id, fields) {
  const keys = Object.keys(fields).filter(k => LORE_COLS.has(k));
  if (!keys.length) return false;
  const set = keys.map(k => `${k}=?`).join(',');
  S(`UPDATE lore_pages SET ${set}, updated_at=? WHERE id=?`)
    .run(...keys.map(k => fields[k]), Date.now(), id);
  return true;
}
export function deleteLorePage(id) {
  S(`DELETE FROM lore_pages WHERE id=?`).run(id);
}

export function getCityKV(k) {
  const row = S(`SELECT v FROM city_kv WHERE k=?`).get(k);
  return row ? row.v : null;
}
export function setCityKV(k, v) {
  S(`INSERT INTO city_kv (k, v) VALUES (?, ?)
     ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(k, String(v));
}

// ── Colony-level state ───────────────────────────────────────────────────────

export function seedColonyMeta(colonyId, populationM, isCapital) {
  S(`INSERT OR IGNORE INTO city_state (colony_id, population, is_capital, last_tick)
     VALUES (?,?,?,?)`).run(colonyId, populationM, isCapital ? 1 : 0, Date.now());
}
export function ensureCityState(colonyId) {
  let st = getCityState(colonyId);
  if (!st) {
    S(`INSERT OR IGNORE INTO city_state (colony_id, last_tick) VALUES (?,?)`)
      .run(colonyId, Date.now());
    st = getCityState(colonyId);
  }
  return st;
}
export function getCityState(colonyId) {
  return S(`SELECT * FROM city_state WHERE colony_id=?`).get(colonyId) || null;
}
export function getAllCityStates() {
  return S(`SELECT * FROM city_state`).all();
}
export function updateCityState(colonyId, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map(k => `${k}=?`).join(',');
  S(`UPDATE city_state SET ${set} WHERE colony_id=?`)
    .run(...keys.map(k => fields[k]), colonyId);
}

// ── Districts ────────────────────────────────────────────────────────────────

export function seedDistrict(colonyId, idx, name, zone, scalars) {
  S(`INSERT OR IGNORE INTO city_districts
       (colony_id, idx, name, zone, s_crime, s_unrest, s_corruption,
        s_prosperity, s_legitimacy, s_output, last_tick)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(colonyId, idx, name, zone,
      scalars.crime, scalars.unrest, scalars.corruption,
      scalars.prosperity, scalars.legitimacy, scalars.output, Date.now());
}
export function getDistrict(colonyId, idx) {
  return S(`SELECT * FROM city_districts WHERE colony_id=? AND idx=?`).get(colonyId, idx) || null;
}
export function getDistricts(colonyId) {
  return S(`SELECT * FROM city_districts WHERE colony_id=? ORDER BY idx`).all(colonyId);
}
export function getAllDistricts() {
  return S(`SELECT * FROM city_districts`).all();
}
// Every colony where this player currently holds a seat. The seat rule is that
// there may be at most one.
export function mayorColonies(playerId) {
  return S(`SELECT DISTINCT colony_id FROM city_districts WHERE mayor=?`)
    .all(playerId).map(r => r.colony_id);
}
// Column allowlist. The SET clause is built by string concatenation from the
// keys of the object handed in, so an untrusted key would be an identifier
// injection. No current call site passes one, and that is exactly the kind of
// thing that stays true until it quietly does not.
const DISTRICT_COLS = new Set([
  'name','zone','mayor','seat_paid','took_office','invested','commerce_cut',
  'favoured','arrears','works','cut_at','fav_at',
  'stock_food','stock_med','stock_tech',
  'lv_security','lv_politics','lv_services','lv_upkeep','lv_subsidy',
  's_crime','s_unrest','s_corruption','s_prosperity','s_legitimacy','s_output',
  'last_tick',
]);
export function updateDistrict(colonyId, idx, fields) {
  const keys = Object.keys(fields).filter(k => DISTRICT_COLS.has(k));
  if (!keys.length) return;
  const set = keys.map(k => `${k}=?`).join(',');
  S(`UPDATE city_districts SET ${set} WHERE colony_id=? AND idx=?`)
    .run(...keys.map(k => fields[k]), colonyId, idx);
}
// lv_subsidy is retired. The column stays in the schema so no migration is
// needed, but nothing reads or writes it: it was a slider the player could
// move that no part of the simulation, the civic bill or the commerce model
// ever looked at.
export function setDistrictLevers(colonyId, idx, levers) {
  const c = v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  S(`UPDATE city_districts SET lv_security=?, lv_politics=?, lv_services=?,
       lv_upkeep=? WHERE colony_id=? AND idx=?`)
    .run(c(levers.security), c(levers.politics), c(levers.services),
      c(levers.upkeep), colonyId, idx);
}
export function vacateDistrict(colonyId, idx) {
  S(`UPDATE city_districts SET mayor=NULL, seat_paid=0, took_office=0,
       arrears=0, favoured=NULL, cut_at=0, fav_at=0
     WHERE colony_id=? AND idx=?`).run(colonyId, idx);
}
export function vacateColonySeats(colonyId) {
  S(`UPDATE city_districts SET mayor=NULL, seat_paid=0, took_office=0, arrears=0
     WHERE colony_id=?`).run(colonyId);
}
// Civic works are a separate book from development. They are never stripped by
// an occupier and they are not refunded when a seat changes hands: a monument
// belongs to the city, not to whoever was mayor when it went up.
export function colonyWorks(colonyId) {
  const row = S(`SELECT COALESCE(SUM(works),0) AS w FROM city_districts WHERE colony_id=?`)
    .get(colonyId);
  return row ? row.w : 0;
}
export function addDistrictWorks(colonyId, idx, amt) {
  S(`UPDATE city_districts SET works=works+? WHERE colony_id=? AND idx=?`)
    .run(amt, colonyId, idx);
}
export function colonyInvested(colonyId) {
  const row = S(`SELECT COALESCE(SUM(invested),0) AS b FROM city_districts WHERE colony_id=?`)
    .get(colonyId);
  return row ? row.b : 0;
}

// ── Shops ────────────────────────────────────────────────────────────────────

export function getCityShops(colonyId) {
  return S(`SELECT * FROM city_shops WHERE colony_id=?`).all(colonyId);
}
export function getDistrictShops(colonyId, district) {
  return S(`SELECT * FROM city_shops WHERE colony_id=? AND district=?`).all(colonyId, district);
}
export function countDistrictShops(colonyId, district) {
  const row = S(`SELECT COUNT(*) AS n FROM city_shops WHERE colony_id=? AND district=?`)
    .get(colonyId, district);
  return row ? row.n : 0;
}
export function leaseShop(colonyId, district, playerId, kind, name, descr) {
  S(`INSERT INTO city_shops (colony_id, district, owner, kind, name, descr, leased_at, paid_in)
     VALUES (?,?,?,?,?,?,?,0)`)
    .run(colonyId, district, playerId, kind, name, descr, Date.now());
  const row = S(`SELECT last_insert_rowid() AS id`).get();
  return row ? row.id : 0;
}
// NPC-run businesses carry a synthetic owner id. Each is distinct so the
// per-owner diminishing return in resolveDistrictShops treats them as separate
// firms rather than one conglomerate, and getPlayer() never resolves them so
// they are never paid out.
let _npcSeq = 0;
export function npcOwnerId() { return 'npc:' + (Date.now().toString(36)) + ':' + (++_npcSeq); }
export function isNpcShop(sh) { return !!sh && typeof sh.owner === 'string' && sh.owner.indexOf('npc:') === 0; }
export function setShopEstablished(shopId, when) {
  S(`UPDATE city_shops SET leased_at=? WHERE id=?`).run(when, shopId);
}
export function deleteShop(shopId) { S(`DELETE FROM city_shops WHERE id=?`).run(shopId); }
// leased_at is deliberately preserved: the buyer is purchasing an established
// business and inherits its trade, rather than restarting the ramp.
export function adoptShop(shopId, playerId, name, descr) {
  S(`UPDATE city_shops SET owner=?, name=?, descr=? WHERE id=?`)
    .run(playerId, name, descr, shopId);
}
export function countNpcShops(colonyId, district) {
  const row = S(`SELECT COUNT(*) AS n FROM city_shops
                 WHERE colony_id=? AND district=? AND owner LIKE 'npc:%'`).get(colonyId, district);
  return row ? row.n : 0;
}

export function getShop(shopId) {
  return S(`SELECT * FROM city_shops WHERE id=?`).get(shopId) || null;
}
export function renameShop(shopId, playerId, name, descr) {
  S(`UPDATE city_shops SET name=?, descr=? WHERE id=? AND owner=?`)
    .run(name, descr, shopId, playerId);
}
export function closeShop(shopId, playerId) {
  S(`DELETE FROM city_shops WHERE id=? AND owner=?`).run(shopId, playerId);
}
export function addShopPaid(shopId, amt) {
  S(`UPDATE city_shops SET paid_in=paid_in+? WHERE id=?`).run(amt, shopId);
}
export function clearDistrictShops(colonyId, district) {
  S(`DELETE FROM city_shops WHERE colony_id=? AND district=?`).run(colonyId, district);
}
export function clearColonyShops(colonyId) {
  S(`DELETE FROM city_shops WHERE colony_id=?`).run(colonyId);
}

// ── Migration support (v2 lots -> v3 districts) ──────────────────────────────

export function listAllCityLots() {
  return S(`SELECT * FROM city_lots`).all();
}
export function wipeAllCityLots() { S(`DELETE FROM city_lots`).run(); }
export function wipeAllShops() { S(`DELETE FROM city_shops`).run(); }
