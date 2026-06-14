'use strict';
/*
  PvE heuristic AI. Policy: one-ply greedy over a board-evaluation function.

  Each decision point: enumerate every legal action (play each affordable card,
  with each legal target as a separate candidate; attack with each ready Asset
  against each legal defender), simulate each on a cloned engine, score the
  resulting board, and take the single best action whenever it beats passing.
  Repeat until nothing improves. Targeting and trades are emergent: the right
  target/defender is just the candidate that scores highest. An explicit clean
  lethal check runs first so the AI never fumbles an obvious kill.

  This is a big step up from the greedy stub (which played the most expensive
  card and swung face blindly). It is NOT a search engine: it does not look
  multiple plies ahead, so it can miss combos that are only good in sequence and
  multi-step lethal through a taunt wall. Those are the next improvements; the
  one-ply policy is the standard competent baseline for a non-ML CCG bot.

  Tunable weights live in WEIGHTS. The engine is the source of legality: the AI
  only ever proposes actions the engine's own canPlay/canAttack accept.
*/

const WIN = 1e6;
const WEIGHTS = {
  taunt: 2,        // a taunt body is worth a bit more (board control)
  rushCharge: 1,   // reach is worth a little
  shieldFlat: 2,   // divine shield: plus this, plus the unit's attack (it survives a hit)
  poison: 2,       // poisonous: trades up / acts as removal
  lifesteal: 1,    // sustain
  myHero: 0.30,    // value of own remaining Solvency
  foeHero: 0.50,   // weight on pushing the enemy hero down (drives closing games)
  card: 2.5,       // value of a card in hand (card advantage)
};

function unitVal(u) {
  let v = u.attack + u.health;
  if (u.taunt) v += WEIGHTS.taunt;
  if (u.rush || u.charge) v += WEIGHTS.rushCharge;
  if (u.divineShield) v += WEIGHTS.shieldFlat + u.attack; // effectively absorbs a hit
  if (u.windfury) v += u.attack;                          // can attack twice
  const kw = (u.def && u.def.keywords) || [];
  if (kw.includes('poisonous')) v += WEIGHTS.poison;
  if (kw.includes('lifesteal')) v += WEIGHTS.lifesteal;
  return v;
}

// score the game from `me`'s perspective; higher is better for `me`
function evaluate(E, me) {
  if (E.winner === me) return WIN;
  if (E.winner === (1 - me)) return -WIN;
  const my = E.players[me], op = E.players[1 - me];
  let s = 0;
  for (const u of my.board) s += unitVal(u);
  for (const u of op.board) s -= unitVal(u);
  s += my.hero.health * WEIGHTS.myHero;
  s -= op.hero.health * WEIGHTS.foeHero;
  s += (my.hand.length - op.hand.length) * WEIGHTS.card;
  return s;
}

// ---- candidate action enumeration (validated against the engine) ----
function targetsFor(E, me, card) {
  const out = [];
  const cands = [E.players[0].hero, E.players[1].hero,
                 ...E.players[0].board, ...E.players[1].board];
  for (const t of cands) if (E.canPlay(me, card.eid, t.eid).ok) out.push(t.eid);
  return out;
}
function legalPlays(E, me) {
  const pl = E.players[me], out = [];
  for (const c of pl.hand) {
    if (c.def.cost > pl.mana) continue;
    if (c.kind === 'unit' && pl.board.length >= 7) continue;
    if (c.def.targeting) {
      for (const t of targetsFor(E, me, c)) out.push({ type: 'play', eid: c.eid, target: t });
    } else if (E.canPlay(me, c.eid, null).ok) {
      out.push({ type: 'play', eid: c.eid, target: null });
    }
  }
  return out;
}
function legalAttacks(E, me) {
  const out = [], foe = E.players[1 - me];
  for (const u of E.players[me].board) {
    if (E.canAttack(me, u.eid, foe.hero.eid).ok) out.push({ type: 'attack', eid: u.eid, target: foe.hero.eid });
    for (const d of foe.board) if (E.canAttack(me, u.eid, d.eid).ok) out.push({ type: 'attack', eid: u.eid, target: d.eid });
  }
  return out;
}
function applyTo(E, me, a) {
  if (a.type === 'play') E.playCard(me, a.eid, a.target);
  else E.attack(me, a.eid, a.target);
}

// clean lethal: only the no-taunt case (sum of ready attackers' attack >= foe Solvency).
// Returns an ordered list of face attacks, or null. The taunt case is left to the
// greedy loop (clear the wall, set up next turn) rather than guessed at here.
function findLethal(E, me) {
  const foe = E.players[1 - me];
  if (foe.board.some((u) => u.taunt)) return null;
  const seq = [];
  let dmg = 0;
  for (const u of E.players[me].board) {
    if (!E.canAttack(me, u.eid, foe.hero.eid).ok) continue;
    const swings = (u.windfury ? 2 : 1) - u.attacksThisTurn; // windfury can hit face twice
    for (let k = 0; k < swings; k++) { seq.push({ eid: u.eid, target: foe.hero.eid }); dmg += u.attack; }
  }
  return dmg >= foe.hero.health ? seq : null;
}

// play out a full turn for `me` (does NOT end the turn; caller does that)
function takeTurn(E, me) {
  let guard = 0;
  for (;;) {
    if (E.winner !== null) return;
    if (++guard > 80) return; // safety; the loop terminates naturally (resources shrink)

    const lethal = findLethal(E, me);
    if (lethal) { for (const a of lethal) { if (E.winner !== null) break; E.attack(me, a.eid, a.target); } return; }

    const actions = legalPlays(E, me).concat(legalAttacks(E, me));
    if (!actions.length) return;

    const passScore = evaluate(E, me);
    let best = null, bestScore = passScore;
    for (const a of actions) {
      const sim = E.clone();
      applyTo(sim, me, a);
      const sc = evaluate(sim, me);
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    if (!best) return;       // passing is at least as good as any action
    applyTo(E, me, best);    // commit the best action on the real game, then re-evaluate
  }
}

const _aiApi = { takeTurn, evaluate, findLethal, legalPlays, legalAttacks, WEIGHTS };
if (typeof module !== 'undefined' && module.exports) module.exports = _aiApi;
if (typeof window !== 'undefined') window.FleshTCGAI = _aiApi;
