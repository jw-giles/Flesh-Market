// ═══════════════════════════════════════════════════════════════════════════
// COUNCIL CHAMBER, storage layer
// ═══════════════════════════════════════════════════════════════════════════
//
// Kept out of db.js on purpose. db.js is already 2200 lines and the council is a
// self contained subsystem with no foreign keys into the market tables, so it
// follows the db_city.js precedent instead of widening the main schema file.
//
// THE ONE THING TO UNDERSTAND ABOUT THIS TABLE SET. An Accord is not a message
// and it is not a promise. It is a pair of obligation lists that the server owns
// and executes atomically, plus an optional free text rider that the server
// stores and NEVER executes. Those two things must never be confused with each
// other, in the schema or in the UI, because the entire value of the feature is
// that a bonded clause is a guarantee. The moment an unenforceable clause is
// rendered as if it were bonded, the guarantee is worth nothing and it does not
// come back. Hence: bonded obligations live in accord_clauses as typed rows the
// executor can read. Riders live in a single TEXT column on accords and there is
// no code path anywhere that acts on them.
//
// WHY THERE IS NO CREDITS CLAUSE IN v1. A clause that moves cash from one player
// to another is a value transfer route, and every value transfer route in this
// codebase has to sit behind canSendValue plus the wire's 90% Guild surcharge
// above 10,000. An Accord with a credits clause and no surcharge would be a
// better wire than the wire, which is exactly the Fbay bug from 1.2.x wearing a
// treaty. An Accord with the surcharge would make a 500,000,000 political
// payment cost 450,000,000 in tax, which kills the feature. Neither branch is
// acceptable, so v1 ships only fund_colony, which BURNS credits into a colony
// war chest and transfers nothing to anybody. No transfer means no clearance
// surface and no laundering route. This is a deliberate omission, not an
// oversight, and it is also the clause that matches the real in game scenario
// this was built for: two blocs trading territory by buying each other's control
// percentage, not by wiring each other cash.

// Handle injection follows the db_city.js precedent: db.js calls initCouncilDb(db)
// once with the shared connection during initDB(), and every query here goes
// through the same prepared statement cache shape.
let _db;
const _S = {};
function stmt(sql) { if (!_S[sql]) _S[sql] = _db.prepare(sql); return _S[sql]; }

export const COUNCIL_SEATS = ['coalition', 'syndicate', 'void', 'guild'];

// Seats that can be bought outright. Coalition is deliberately absent: that chair
// is the existing Presidency and is resolved live from the president variable in
// server.js, so there is exactly one source of truth for who holds it. Guild is
// deliberately absent too: the Guild is the notary and the house, and a house
// that can be bought is not a house.
export const PURCHASABLE_SEATS = ['syndicate', 'void'];

export function initCouncilDb(db) {
  _db = db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS council_seats (
      seat_id        TEXT PRIMARY KEY,
      holder_id      TEXT,
      holder_name    TEXT,
      acquired_at    INTEGER NOT NULL DEFAULT 0,
      purchase_price REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accords (
      id               TEXT PRIMARY KEY,
      proposer_seat    TEXT    NOT NULL,
      proposer_id      TEXT,
      proposer_name    TEXT    NOT NULL,
      counter_seat     TEXT    NOT NULL,
      title            TEXT    NOT NULL,
      status           TEXT    NOT NULL DEFAULT 'open',
      created_at       INTEGER NOT NULL,
      expires_at       INTEGER NOT NULL,
      resolved_at      INTEGER,
      resolved_by      TEXT,
      resolved_by_name TEXT,
      escrow_proposer  REAL    NOT NULL DEFAULT 0,
      escrow_counter   REAL    NOT NULL DEFAULT 0,
      notary_proposer  REAL    NOT NULL DEFAULT 0,
      notary_counter   REAL    NOT NULL DEFAULT 0,
      -- WHO PAID EACH SIDE: 'self' or 'treasury'. This exists so a refund can go
      -- BACK WHERE IT CAME FROM. A leader escrowing 50,000,000 of faction money
      -- and then withdrawing the Accord into their own wallet would be a treasury
      -- withdraw button wearing a contract, and the entire safety of the treasury
      -- rests on there being no such button anywhere.
      payer_proposer   TEXT    NOT NULL DEFAULT 'self',
      payer_counter    TEXT    NOT NULL DEFAULT 'self',
      -- ANNOUNCE THEN EXECUTE. A signed Accord that cedes ground using a
      -- FACTION'S money does not execute on signature. It goes to 'pending' with
      -- an executes_at, and the faction gets a window in which to argue, lobby
      -- the other chairs, or take the chair off the leader who signed it.
      -- NULL on every Accord that executes immediately.
      executes_at      INTEGER,
      -- The signer. Needed so a cancelled or lapsed pending Accord can refund the
      -- counterparty side to the right place; resolved_by is only written when an
      -- Accord closes and is therefore not available while one is pending.
      counter_id       TEXT,
      rider            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_accords_status ON accords(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_accords_counter ON accords(counter_seat, status);
    CREATE INDEX IF NOT EXISTS idx_accords_proposer ON accords(proposer_id, status);

    CREATE TABLE IF NOT EXISTS accord_clauses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      accord_id  TEXT    NOT NULL,
      side       TEXT    NOT NULL,
      kind       TEXT    NOT NULL,
      colony_id  TEXT,
      faction_id TEXT,
      amount     REAL    NOT NULL DEFAULT 0,
      executed   INTEGER NOT NULL DEFAULT 0,
      result     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clauses_accord ON accord_clauses(accord_id);

    -- THE CHAMBER'S THREE SURFACES, in one table because they differ only by who
    -- may write and who may read.
    --   floor           delegates only, permanent record, never pruned
    --   gallery         anybody, bounded scrollback, the cheap seats
    --   faction:<id>    that faction only, bounded scrollback
    --
    -- author_id IS ALWAYS THE REAL ACCOUNT, even when the post displays as a
    -- regent NPC. The GM speaking as Guild Notary Ostrow is a costume on the
    -- display name, not on the record: speaking_as carries the persona and
    -- author_id carries who actually typed it. An audit trail that lies about
    -- authorship is worse than no audit trail, and this one has to survive
    -- somebody asking six months later who really said a thing.
    CREATE TABLE IF NOT EXISTS council_posts (
      id          TEXT PRIMARY KEY,
      room        TEXT    NOT NULL,
      ts          INTEGER NOT NULL,
      author_id   TEXT,
      author_name TEXT    NOT NULL,
      seat        TEXT,
      speaking_as TEXT,
      portrait    TEXT,
      body        TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cposts_room ON council_posts(room, ts DESC);

    -- FACTION TREASURY.
    --
    -- THE ONE INVARIANT, and it is structural rather than a policy: credits in a
    -- treasury can become faction control or Accord escrow, and they can NEVER
    -- become any player's personal cash again, by any path. There is deliberately
    -- no withdraw function in this file. A treasury with a withdraw button is a
    -- pooled wire with extra steps, and every alt-farming defence in the codebase
    -- gets routed around by one leader with a friendly co-conspirator.
    --
    -- The consequence is the design: a bad leader can WASTE a treasury but cannot
    -- STEAL one. Waste is recoverable, public, and gets them thrown out of the
    -- chair. Theft is not recoverable and would kill the feature the first time
    -- it happened.
    --
    -- Contributions are therefore NOT gated by Guild clearance. Clearance guards
    -- player-to-player value routes; a contribution reaches no player, ever, so
    -- there is nothing there for it to guard.
    CREATE TABLE IF NOT EXISTS faction_treasury (
      faction_id   TEXT PRIMARY KEY,
      balance      REAL    NOT NULL DEFAULT 0,
      lifetime_in  REAL    NOT NULL DEFAULT 0,
      lifetime_out REAL    NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0
    );

    -- Every movement, in and out, permanently. The treasury spends other people's
    -- money, so the ledger is not an audit convenience, it is the thing that makes
    -- contributing rational: you can see exactly what the chair did with it.
    CREATE TABLE IF NOT EXISTS treasury_ledger (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_id TEXT    NOT NULL,
      ts         INTEGER NOT NULL,
      kind       TEXT    NOT NULL,
      amount     REAL    NOT NULL,
      actor_id   TEXT,
      actor_name TEXT,
      detail     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tled_faction ON treasury_ledger(faction_id, id DESC);

    -- PENDING TREASURY SPENDS.
    --
    -- WHY THIS TABLE EXISTS AT ALL, since the Accord path already had a window:
    -- the window was gated on the ACCORD SHAPE rather than on the CONDITION. The
    -- condition is "treasury credits funding a faction that is not that
    -- treasury's own", and that is true of a direct spend as well. A leader who
    -- wanted to hand ground away did not need an Accord; they could point
    -- /api/council/treasury/fund at a rival and it landed instantly, with no
    -- counterparty and nobody able to pull it. Confirmed against a running server
    -- before this was written: lustandia void control 28% to 32% in one call.
    --
    -- A direct spend has no Accord to hang a pending status on, hence a table of
    -- its own. Credits are debited from the treasury at commit time and held here
    -- exactly as Accord escrow is held, so the balance members read is honest
    -- about what is already committed.
    CREATE TABLE IF NOT EXISTS treasury_pending (
      id             TEXT PRIMARY KEY,
      faction_id     TEXT    NOT NULL,
      target_faction TEXT    NOT NULL,
      colony_id      TEXT    NOT NULL,
      amount         REAL    NOT NULL,
      actor_id       TEXT,
      actor_name     TEXT    NOT NULL,
      created_at     INTEGER NOT NULL,
      executes_at    INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      resolved_at    INTEGER,
      resolved_by    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tpend_status ON treasury_pending(status, executes_at);
    CREATE INDEX IF NOT EXISTS idx_tpend_faction ON treasury_pending(faction_id, status);

    CREATE TABLE IF NOT EXISTS council_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ts         INTEGER NOT NULL,
      accord_id  TEXT,
      seat_id    TEXT,
      actor_name TEXT,
      event      TEXT NOT NULL,
      detail     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clog_ts ON council_log(ts DESC);
  `);

  // Seed a row for each purchasable seat so the roster always renders four chairs
  // even before anything has been sold. A NULL holder_id reads as regent held.
  // Additive migration for databases written before 1.5.0.0. Existing rows get
  // 'self', which is correct: every Accord tabled before the treasury existed was
  // paid for personally.
  try { db.exec("ALTER TABLE accords ADD COLUMN payer_proposer TEXT NOT NULL DEFAULT 'self'"); } catch(_) {}
  try { db.exec("ALTER TABLE accords ADD COLUMN payer_counter TEXT NOT NULL DEFAULT 'self'"); } catch(_) {}
  try { db.exec('ALTER TABLE accords ADD COLUMN executes_at INTEGER'); } catch(_) {}
  try { db.exec('ALTER TABLE accords ADD COLUMN counter_id TEXT'); } catch(_) {}

  for (const s of PURCHASABLE_SEATS) {
    stmt('INSERT OR IGNORE INTO council_seats(seat_id,holder_id,holder_name,acquired_at,purchase_price) VALUES(?,NULL,NULL,0,0)').run(s);
  }
  console.log('[Council] Chamber tables ready');
}

// ─── Seats ────────────────────────────────────────────────────────────────────

export function getSeatRow(seatId) {
  return stmt('SELECT * FROM council_seats WHERE seat_id=?').get(seatId) || null;
}

export function getAllSeatRows() {
  return stmt('SELECT * FROM council_seats').all();
}

export function setSeatHolder(seatId, holderId, holderName, price) {
  stmt(`INSERT INTO council_seats(seat_id,holder_id,holder_name,acquired_at,purchase_price)
        VALUES(?,?,?,?,?)
        ON CONFLICT(seat_id) DO UPDATE SET
          holder_id=excluded.holder_id,
          holder_name=excluded.holder_name,
          acquired_at=excluded.acquired_at,
          purchase_price=excluded.purchase_price`)
    .run(seatId, holderId, holderName, Date.now(), Number(price) || 0);
}

export function clearSeatHolder(seatId) {
  stmt('UPDATE council_seats SET holder_id=NULL, holder_name=NULL, acquired_at=0, purchase_price=0 WHERE seat_id=?').run(seatId);
}

// Which purchasable seat, if any, this player already holds. Used to enforce one
// chair per person: a player holding the Presidency and the Void seat at once
// would be able to sign an Accord with themselves and self execute both sides.
export function seatHeldBy(playerId) {
  const r = stmt('SELECT seat_id FROM council_seats WHERE holder_id=?').get(playerId);
  return r ? r.seat_id : null;
}

// ─── Accords ──────────────────────────────────────────────────────────────────

export function createAccord(a) {
  stmt(`INSERT INTO accords
    (id,proposer_seat,proposer_id,proposer_name,counter_seat,title,status,
     created_at,expires_at,escrow_proposer,escrow_counter,notary_proposer,notary_counter,
     payer_proposer,payer_counter,rider)
    VALUES(?,?,?,?,?,?,'open',?,?,?,0,?,0,?,'self',?)`)
    .run(a.id, a.proposerSeat, a.proposerId, a.proposerName, a.counterSeat, a.title,
         a.createdAt, a.expiresAt, a.escrowProposer, a.notaryProposer,
         a.payerProposer || 'self', a.rider || null);
}

export function addClause(accordId, side, c) {
  stmt(`INSERT INTO accord_clauses(accord_id,side,kind,colony_id,faction_id,amount)
        VALUES(?,?,?,?,?,?)`)
    .run(accordId, side, c.kind, c.colonyId || null, c.factionId || null, Number(c.amount) || 0);
}

export function getAccord(id) {
  return stmt('SELECT * FROM accords WHERE id=?').get(id) || null;
}

export function getAccordClauses(id) {
  return stmt('SELECT * FROM accord_clauses WHERE accord_id=? ORDER BY side DESC, id ASC').all(id);
}

export function getOpenAccords() {
  return stmt(`SELECT * FROM accords WHERE status='open' ORDER BY created_at DESC`).all();
}

export function getRecentAccords(limit = 40) {
  // 'pending' sorts ABOVE 'open': a commitment already signed and counting down
  // to execution is the most urgent thing in the room, because it is the only
  // one with a deadline somebody may need to act before.
  return stmt(`SELECT * FROM accords ORDER BY
                 CASE status WHEN 'pending' THEN 0 WHEN 'open' THEN 1 ELSE 2 END ASC,
                 created_at DESC
               LIMIT ?`).all(limit);
}

export function getExpiredOpenAccords(now) {
  return stmt(`SELECT * FROM accords WHERE status='open' AND expires_at<=?`).all(now);
}

// Open accords a given player proposed. Read when they lose their chair: the
// escrow is that person's money, so it goes back to that person rather than
// staying hostage to a seat they no longer occupy.
export function getOpenAccordsByProposer(playerId) {
  return stmt(`SELECT * FROM accords WHERE status='open' AND proposer_id=?`).all(playerId);
}

export function setAccordStatus(id, status, resolvedById, resolvedByName) {
  stmt(`UPDATE accords SET status=?, resolved_at=?, resolved_by=?, resolved_by_name=? WHERE id=?`)
    .run(status, Date.now(), resolvedById || null, resolvedByName || null, id);
}

export function setCounterEscrow(id, escrow, notary, payer, counterId) {
  stmt('UPDATE accords SET escrow_counter=?, notary_counter=?, payer_counter=?, counter_id=? WHERE id=?')
    .run(Number(escrow) || 0, Number(notary) || 0, payer || 'self', counterId || null, id);
}

// Hold a signed Accord open for a window instead of executing it now.
export function setAccordPending(id, executesAt) {
  stmt("UPDATE accords SET status='pending', executes_at=? WHERE id=?").run(executesAt, id);
}

export function getDuePendingAccords(now) {
  return stmt("SELECT * FROM accords WHERE status='pending' AND executes_at<=?").all(now);
}

export function getAllPendingAccords() {
  return stmt("SELECT * FROM accords WHERE status='pending' ORDER BY executes_at ASC").all();
}

export function markClauseExecuted(clauseId, result) {
  stmt('UPDATE accord_clauses SET executed=1, result=? WHERE id=?').run(result || null, clauseId);
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export function logCouncil(event, opts = {}) {
  stmt('INSERT INTO council_log(ts,accord_id,seat_id,actor_name,event,detail) VALUES(?,?,?,?,?,?)')
    .run(Date.now(), opts.accordId || null, opts.seatId || null,
         opts.actorName || null, event, opts.detail || null);
}

export function getCouncilLog(limit = 60) {
  return stmt('SELECT * FROM council_log ORDER BY id DESC LIMIT ?').all(limit);
}

// ─── Chamber posts ────────────────────────────────────────────────────────────

export function addCouncilPost(p) {
  stmt(`INSERT INTO council_posts(id,room,ts,author_id,author_name,seat,speaking_as,portrait,body)
        VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(p.id, p.room, p.ts, p.authorId || null, p.authorName, p.seat || null,
         p.speakingAs || null, p.portrait || null, p.body);
}

export function getCouncilPosts(room, limit = 80) {
  return stmt('SELECT * FROM council_posts WHERE room=? ORDER BY ts DESC LIMIT ?')
    .all(room, limit).reverse();
}

// The portrait frozen on a post is only ever a FALLBACK; councilPostView resolves
// the author's live portrait first and reads this column only when the author has
// none. That is exactly the case that breaks when a portrait is withdrawn: the
// players sweep nulls the wearer's live portrait, which hands the render straight
// back to a frozen id whose PNG no longer exists. So the two sweeps have to run
// together or the first one makes the second one necessary.
//
// The body is untouched. This nulls a rendering hint, not a record of what was
// said, which is why it is allowed to touch floor posts when pruneCouncilPosts is
// not.
export function clearWithdrawnPostPortraits(isValid) {
  const rows = stmt(`SELECT portrait, COUNT(*) AS n FROM council_posts
                     WHERE portrait IS NOT NULL AND portrait <> '' GROUP BY portrait`).all();
  const dead = rows.filter(r => !isValid(r.portrait));
  if (!dead.length) return [];
  const upd = stmt('UPDATE council_posts SET portrait=NULL WHERE portrait=?');
  for (const r of dead) upd.run(r.portrait);
  return dead.map(r => ({ portrait: r.portrait, n: r.n }));
}

// The floor is the permanent record and is deliberately absent from this sweep.
// Everything a delegate says on the record stays on the record; only the gallery
// and the faction rooms are scrollback.
export function pruneCouncilPosts(perRoomMax) {
  for (const { room } of stmt("SELECT DISTINCT room FROM council_posts WHERE room != 'floor'").all()) {
    stmt(`DELETE FROM council_posts WHERE room=? AND id NOT IN
          (SELECT id FROM council_posts WHERE room=? ORDER BY ts DESC LIMIT ?)`)
      .run(room, room, perRoomMax);
  }
}

// ─── Faction treasury ─────────────────────────────────────────────────────────
//
// There is no withdrawTreasury(). That is not an omission and it must not be
// added. See the block comment on the table above.

export function getTreasury(factionId) {
  const r = stmt('SELECT * FROM faction_treasury WHERE faction_id=?').get(factionId);
  return r || { faction_id: factionId, balance: 0, lifetime_in: 0, lifetime_out: 0, updated_at: 0 };
}

export function getAllTreasuries() {
  return stmt('SELECT * FROM faction_treasury').all();
}

export function treasuryCredit(factionId, amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return getTreasury(factionId);
  stmt(`INSERT INTO faction_treasury(faction_id,balance,lifetime_in,lifetime_out,updated_at)
        VALUES(?,?,?,0,?)
        ON CONFLICT(faction_id) DO UPDATE SET
          balance = balance + excluded.balance,
          lifetime_in = lifetime_in + excluded.lifetime_in,
          updated_at = excluded.updated_at`)
    .run(factionId, amt, amt, Date.now());
  return getTreasury(factionId);
}

// Returns false and moves nothing if the balance will not cover it, so the
// caller cannot half-spend. Every caller must check the return value.
export function treasuryDebit(factionId, amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return true;
  const cur = getTreasury(factionId);
  if (cur.balance < amt) return false;
  stmt('UPDATE faction_treasury SET balance=balance-?, lifetime_out=lifetime_out+?, updated_at=? WHERE faction_id=?')
    .run(amt, amt, Date.now(), factionId);
  return true;
}

// A refund returning to the treasury is NOT lifetime_in: nothing new was
// contributed, the same credits are coming back from an escrow that did not
// execute. Counting it as income would inflate the figure members read when they
// decide whether the chair is worth funding.
export function treasuryRefund(factionId, amount) {
  const amt = Number(amount) || 0;
  if (amt <= 0) return;
  stmt(`INSERT INTO faction_treasury(faction_id,balance,lifetime_in,lifetime_out,updated_at)
        VALUES(?,?,0,0,?)
        ON CONFLICT(faction_id) DO UPDATE SET
          balance = balance + excluded.balance,
          lifetime_out = MAX(0, lifetime_out - excluded.balance),
          updated_at = excluded.updated_at`)
    .run(factionId, amt, Date.now());
}

export function logTreasury(factionId, kind, amount, opts = {}) {
  stmt(`INSERT INTO treasury_ledger(faction_id,ts,kind,amount,actor_id,actor_name,detail)
        VALUES(?,?,?,?,?,?,?)`)
    .run(factionId, Date.now(), kind, Number(amount) || 0,
         opts.actorId || null, opts.actorName || null, opts.detail || null);
}

export function getTreasuryLedger(factionId, limit = 50) {
  return stmt('SELECT * FROM treasury_ledger WHERE faction_id=? ORDER BY id DESC LIMIT ?')
    .all(factionId, limit);
}

export function getTreasuryContributors(factionId, limit = 10) {
  return stmt(`SELECT actor_name, SUM(amount) total FROM treasury_ledger
               WHERE faction_id=? AND kind='contribute' AND actor_name IS NOT NULL
               GROUP BY actor_name ORDER BY total DESC LIMIT ?`).all(factionId, limit);
}

// ─── Pending treasury spends ──────────────────────────────────────────────────

export function createPendingSpend(sp) {
  stmt(`INSERT INTO treasury_pending
        (id,faction_id,target_faction,colony_id,amount,actor_id,actor_name,created_at,executes_at,status)
        VALUES(?,?,?,?,?,?,?,?,?,'pending')`)
    .run(sp.id, sp.factionId, sp.targetFaction, sp.colonyId, sp.amount,
         sp.actorId || null, sp.actorName, sp.createdAt, sp.executesAt);
}

export function getPendingSpend(id) {
  return stmt('SELECT * FROM treasury_pending WHERE id=?').get(id) || null;
}

export function getPendingSpendsFor(factionId) {
  return stmt("SELECT * FROM treasury_pending WHERE faction_id=? AND status='pending' ORDER BY executes_at ASC")
    .all(factionId);
}

export function getDuePendingSpends(now) {
  return stmt("SELECT * FROM treasury_pending WHERE status='pending' AND executes_at<=?").all(now);
}

export function setPendingSpendStatus(id, status, byId) {
  stmt('UPDATE treasury_pending SET status=?, resolved_at=?, resolved_by=? WHERE id=?')
    .run(status, Date.now(), byId || null, id);
}
