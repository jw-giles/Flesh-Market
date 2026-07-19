// server/solitaire.js
// Server-authoritative Klondike (draw-3, no recycle) engine.
//
// The trust model mirrors the casino_play one-shot games, adapted for a stateful
// puzzle: the SERVER owns the deal and the score. At start the server opens a
// round (buy-in committed) and hands the client the round id. The client derives
// the SAME deal from that id via the identical PRNG below, plays locally, and on
// finish sends only the move log. The server replays that log against its own
// deal, validating every move, and prices the payout from the resulting
// foundation count. Nothing the client reports about the outcome is trusted, so
// the forgeable-payout class stays closed even though this uses the open-round
// ledger. A tampered or foreign move log simply fails validation early and scores
// whatever legitimate prefix it contained - it can never inflate the count.
//
// Card encoding: { r: 0..12 (A..K), s: 0..3 }. Suits 0=C 1=S (black), 2=H 3=D (red).
// The deal + PRNG in this file are duplicated verbatim in the client
// (client/assets/casino-solitaire.js); a test asserts both produce identical
// deals from the same id. Any change to seedFromId/mulberry32/deal MUST be mirrored.

// ── Shared PRNG + seed derivation (must match the client byte-for-byte) ────────
export function seedFromId(id){
  // FNV-1a 32-bit over the id string -> uint32 seed.
  let h = 0x811c9dc5 >>> 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export function mulberry32(a){
  let x = a >>> 0;
  return function(){
    x = (x + 0x6D2B79F5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0;
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}

// ── Deck + deal ───────────────────────────────────────────────────────────────
export function isRed(s){ return s >= 2; }
export function buildDeck(){
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s });
  return d;
}
// Deterministic deal from a round id. Column c (0..6) gets c+1 cards, only the
// last face up; the remaining 24 cards form the stock (face down). Foundations
// are indexed by suit.
export function deal(id){
  const rnd = mulberry32(seedFromId(id));
  const deck = buildDeck();
  for (let i = deck.length - 1; i > 0; i--){        // seeded Fisher-Yates
    const j = Math.floor(rnd() * (i + 1));
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  const tableau = [[], [], [], [], [], [], []];
  let k = 0;
  for (let c = 0; c < 7; c++){
    for (let row = 0; row <= c; row++){
      tableau[c].push({ r: deck[k].r, s: deck[k].s, up: (row === c) });
      k++;
    }
  }
  const stock = [];
  for (; k < deck.length; k++) stock.push({ r: deck[k].r, s: deck[k].s });
  return { tableau, stock, waste: [], foundations: [[], [], [], []] };
}

// ── Rules ─────────────────────────────────────────────────────────────────────
function canFoundation(F, c){ return F[c.s].length === c.r; }       // A on empty, then ascending same suit
function canTableau(col, c){
  if (col.length === 0) return c.r === 12;                          // only a King to an empty column
  const top = col[col.length - 1];
  if (!top.up) return false;
  return (isRed(top.s) !== isRed(c.s)) && (top.r === c.r + 1);      // alternating colour, descending
}
function isValidRun(col, start){                                    // cards [start..end] form a movable sequence
  for (let i = start; i < col.length - 1; i++){
    const a = col[i], b = col[i + 1];
    if (!a.up || !b.up) return false;
    if (!(isRed(a.s) !== isRed(b.s) && a.r === b.r + 1)) return false;
  }
  return true;
}
function flipIfNeeded(col){ if (col.length){ const t = col[col.length - 1]; if (!t.up) t.up = true; } }

export function foundationCount(st){ return st.foundations.reduce((a, f) => a + f.length, 0); }

// Validate + apply a single move in place. Returns true if applied, false if the
// move is illegal (the caller stops replaying at the first false).
export function applyMove(st, m){
  if (!m || typeof m !== 'object') return false;
  const T = st.tableau, F = st.foundations, W = st.waste, S = st.stock;
  switch (m.t){
    case 'draw': {
      if (S.length === 0) return false;                            // no recycle: empty stock is terminal
      const n = Math.min(3, S.length);
      for (let i = 0; i < n; i++) W.push(S.pop());
      return true;
    }
    case 'w2f': {
      if (W.length === 0) return false;
      const c = W[W.length - 1];
      if (!canFoundation(F, c)) return false;
      F[c.s].push(W.pop());
      return true;
    }
    case 'w2t': {
      const col = T[m.col]; if (!col || W.length === 0) return false;
      const c = W[W.length - 1];
      if (!canTableau(col, c)) return false;
      col.push({ r: c.r, s: c.s, up: true }); W.pop();
      return true;
    }
    case 't2f': {
      const col = T[m.col]; if (!col || col.length === 0) return false;
      const c = col[col.length - 1]; if (!c.up) return false;
      if (!canFoundation(F, c)) return false;
      F[c.s].push(col.pop()); flipIfNeeded(col);
      return true;
    }
    case 't2t': {
      const src = T[m.col], dst = T[m.dest];
      if (!src || !dst || m.col === m.dest) return false;
      const n = m.n | 0; if (n <= 0 || n > src.length) return false;
      const start = src.length - n;
      if (!src[start].up || !isValidRun(src, start)) return false;
      if (!canTableau(dst, src[start])) return false;
      const cards = src.splice(start, n).map(x => ({ r: x.r, s: x.s, up: true }));
      for (const cc of cards) dst.push(cc);
      flipIfNeeded(src);
      return true;
    }
    case 'f2t': {
      const suit = m.suit | 0; const f = F[suit]; const dst = T[m.dest];
      if (!f || f.length === 0 || !dst) return false;
      const c = f[f.length - 1];
      if (!canTableau(dst, c)) return false;
      dst.push({ r: c.r, s: c.s, up: true }); f.pop();
      return true;
    }
    default: return false;
  }
}

// Replay a full move log against the deal for `id`. Stops at the first illegal
// move (a correct client never sends one; a tamperer can only truncate their own
// score). Returns the validated foundation count reached.
export function replay(id, moves){
  const st = deal(id);
  let applied = 0;
  if (Array.isArray(moves)){
    for (const m of moves){
      if (!applyMove(st, m)) break;
      applied++;
      if (foundationCount(st) === 52) break;
    }
  }
  const found = foundationCount(st);
  return { foundations: found, applied, won: found === 52, state: st };
}
