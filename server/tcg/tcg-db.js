// FleshMarket TCG — collection + deck persistence.
// Self-contained: db.js calls initTcg(db) once with the shared handle; server.js
// imports the query functions. Tables are additive (CREATE TABLE IF NOT EXISTS).

let _db;
const _S = {};
function S(sql) { if (!_S[sql]) _S[sql] = _db.prepare(sql); return _S[sql]; }

export function initTcg(db) {
  _db = db;
  db.exec(`
    CREATE TABLE IF NOT EXISTS tcg_collection (
      player_id TEXT    NOT NULL,
      card_id   TEXT    NOT NULL,
      variant   TEXT    NOT NULL DEFAULT 'normal',   -- 'normal' | 'shiny'
      qty       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player_id, card_id, variant)
    );
    CREATE INDEX IF NOT EXISTS idx_tcg_coll_player ON tcg_collection(player_id);
    CREATE TABLE IF NOT EXISTS tcg_decks (
      player_id  TEXT    NOT NULL,
      slot       INTEGER NOT NULL,
      name       TEXT    NOT NULL DEFAULT 'Deck',
      faction    TEXT    NOT NULL,
      cards      TEXT    NOT NULL DEFAULT '[]',       -- JSON array of card ids
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (player_id, slot)
    );
    CREATE TABLE IF NOT EXISTS tcg_card_market (
      id        TEXT    PRIMARY KEY,
      seller_id TEXT    NOT NULL,
      card_id   TEXT    NOT NULL,
      variant   TEXT    NOT NULL DEFAULT 'normal',
      price     INTEGER NOT NULL,
      listed_at INTEGER NOT NULL,
      sold      INTEGER NOT NULL DEFAULT 0,
      buyer_id  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tcg_cardmkt_active ON tcg_card_market(sold, listed_at);
    CREATE INDEX IF NOT EXISTS idx_tcg_cardmkt_seller ON tcg_card_market(seller_id, sold);
  `);
}

// [{ card_id, variant, qty }]
export function tcgGetCollection(playerId) {
  return S('SELECT card_id, variant, qty FROM tcg_collection WHERE player_id=? AND qty>0').all(playerId);
}

// grant a list of { card, variant } (each one copy), atomic
export function tcgGrantCards(playerId, cards) {
  const up = S(`INSERT INTO tcg_collection(player_id, card_id, variant, qty) VALUES(?,?,?,1)
                ON CONFLICT(player_id, card_id, variant) DO UPDATE SET qty = qty + 1`);
  _db.exec('BEGIN');
  try {
    for (const c of cards) up.run(playerId, c.card, c.variant || 'normal');
    _db.exec('COMMIT');
  } catch (e) {
    try { _db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

export function tcgGetDecks(playerId) {
  return S('SELECT slot, name, faction, cards FROM tcg_decks WHERE player_id=? ORDER BY slot').all(playerId)
    .map((r) => ({ slot: r.slot, name: r.name, faction: r.faction, cards: JSON.parse(r.cards || '[]') }));
}

export function tcgSaveDeck(playerId, slot, deck) {
  S(`INSERT INTO tcg_decks(player_id, slot, name, faction, cards, updated_at) VALUES(?,?,?,?,?,?)
     ON CONFLICT(player_id, slot) DO UPDATE SET name=excluded.name, faction=excluded.faction,
       cards=excluded.cards, updated_at=excluded.updated_at`)
    .run(playerId, Number(slot) || 0, deck.name || 'Deck', deck.faction, JSON.stringify(deck.cards || []), Date.now());
}

export function tcgDeleteDeck(playerId, slot) {
  S('DELETE FROM tcg_decks WHERE player_id=? AND slot=?').run(playerId, Number(slot) || 0);
}

// ── Card Market (Ƒbay) ──────────────────────────────────────────────────────
// Cards are pack-only assets that players list at any price (free, collectables
// market). Listing escrows one copy by decrementing qty; cancel returns it; buy
// delivers it to the buyer. Cash moves are RELATIVE (cash=cash±price) inside the
// same transaction as the card move, which is safe because server.js loads the
// player fresh from the DB on every message (no long-lived actor to go stale).

function _tcgTx(fn) {
  _db.exec('BEGIN');
  try { const r = fn(); _db.exec('COMMIT'); return r; }
  catch (e) { try { _db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

const _ownQty = 'SELECT qty FROM tcg_collection WHERE player_id=? AND card_id=? AND variant=?';
const _grantOne = `INSERT INTO tcg_collection(player_id,card_id,variant,qty) VALUES(?,?,?,1)
                   ON CONFLICT(player_id,card_id,variant) DO UPDATE SET qty=qty+1`;

// List one owned copy. Returns { ok:true, listId } | { ok:false, error }.
export function tcgListCard(sellerId, cardId, variant, price) {
  variant = variant === 'shiny' ? 'shiny' : 'normal';
  price = Math.floor(Number(price) || 0);
  if (!(price > 0)) return { ok: false, error: 'bad_price' };
  if (price > 1e15) return { ok: false, error: 'price_too_high' };
  return _tcgTx(() => {
    const row = S(_ownQty).get(sellerId, cardId, variant);
    if (!row || row.qty < 1) return { ok: false, error: 'not_owned' };
    S('UPDATE tcg_collection SET qty=qty-1 WHERE player_id=? AND card_id=? AND variant=?').run(sellerId, cardId, variant);
    const listId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    S('INSERT INTO tcg_card_market(id,seller_id,card_id,variant,price,listed_at,sold) VALUES(?,?,?,?,?,?,0)')
      .run(listId, sellerId, cardId, variant, price, Date.now());
    return { ok: true, listId };
  });
}

// One live listing by id. Guild Clearance needs the price and the seller before
// the buy transaction runs, because a value movement cannot be un-run.
export function tcgGetCardListing(listingId) {
  try { return S('SELECT * FROM tcg_card_market WHERE id=? AND sold=0').get(listingId) || null; }
  catch(_) { return null; }
}

// Active listings, newest first, with seller name.
export function tcgGetCardListings(limit = 200) {
  return S(`SELECT m.id, m.seller_id, m.card_id, m.variant, m.price, m.listed_at, p.name AS seller_name
            FROM tcg_card_market m LEFT JOIN players p ON p.id=m.seller_id
            WHERE m.sold=0 ORDER BY m.listed_at DESC LIMIT ?`).all(Math.min(Number(limit) || 200, 400));
}

// This player's own active listings (so the UI can show them and offer cancel).
export function tcgGetMyCardListings(sellerId) {
  return S(`SELECT id, card_id, variant, price, listed_at FROM tcg_card_market
            WHERE seller_id=? AND sold=0 ORDER BY listed_at DESC`).all(sellerId);
}

// Buy a listed card. Atomic card delivery + cash transfer. Returns
// { ok:true, price, cardId, variant, sellerId } | { ok:false, error }.
export function tcgBuyCard(buyerId, listingId) {
  return _tcgTx(() => {
    const L = S('SELECT * FROM tcg_card_market WHERE id=? AND sold=0').get(listingId);
    if (!L) return { ok: false, error: 'not_found' };
    if (L.seller_id === buyerId) return { ok: false, error: 'own_listing' };
    const buyer = S('SELECT cash FROM players WHERE id=?').get(buyerId);
    if (!buyer) return { ok: false, error: 'no_buyer' };
    if (Number(buyer.cash) < L.price) return { ok: false, error: 'insufficient_funds' };
    S('UPDATE players SET cash=cash-? WHERE id=?').run(L.price, buyerId);
    S('UPDATE players SET cash=cash+? WHERE id=?').run(L.price, L.seller_id);
    S(_grantOne).run(buyerId, L.card_id, L.variant);
    S('UPDATE tcg_card_market SET sold=1, buyer_id=? WHERE id=?').run(buyerId, listingId);
    return { ok: true, price: L.price, cardId: L.card_id, variant: L.variant, sellerId: L.seller_id };
  });
}

// Cancel own active listing; return the escrowed copy. Returns true/false.
export function tcgCancelCardListing(sellerId, listingId) {
  return _tcgTx(() => {
    const L = S('SELECT * FROM tcg_card_market WHERE id=? AND seller_id=? AND sold=0').get(listingId, sellerId);
    if (!L) return false;
    S(_grantOne).run(sellerId, L.card_id, L.variant);
    S('DELETE FROM tcg_card_market WHERE id=?').run(listingId);
    return true;
  });
}
