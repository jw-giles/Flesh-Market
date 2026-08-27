// ═══════════════════════════════════════════════════════════════════════════
// factions.js - who can be on a battlefield, and on which side.
//
// THE POINT OF THIS FILE IS THAT IT IS NOT ABOUT THE REACH. The war layer was
// built for one war with two belligerents and a guest, and it encoded that
// three times over in shapes that cannot express a fourth party:
//
//   s.coalIn      one boolean. A polity is in the war or it is not. There is
//                 exactly one polity this can be about.
//   w.jade        a SCALAR share of a line. Two factions can share a line
//                 because one number splits it in two; three cannot.
//   w.jadeFwd     which of the two stands forward. Same problem.
//
// None of that is wrong for the war it was written for. It is wrong for the war
// AFTER it, which is players against players, and the cost of finding that out
// later is that every reader of those three fields has to be found again.
//
// WHAT THIS DOES AND DOES NOT DO YET, stated plainly because a half-wired
// control is worse than none: this file defines the roster primitive and the
// registry. It does NOT yet replace w.jade at the call sites. effJade,
// jade_commit and coalition_enter are untouched and remain the live path for the
// Reach. Jade and the Coalition are rows in the registry here, and a roster
// built from them reproduces exactly what those fields already say - which is
// the test that the primitive is the right shape before anything is migrated
// onto it.
//
// The god panel gets a War Controls tab only once a roster is what the field
// actually reads. The Reach tab has a comment about this already, and it is
// worth repeating because it names the exact failure: "the war layer is not in
// the build yet, and a switch wired to nothing rots untested. That is exactly
// how the trial gate sat broken across 120 routes for four patches while static
// checks passed."
// ═══════════════════════════════════════════════════════════════════════════

/* Every polity that can put troops on a field. `id` is the seam with
   client/assets/factions.js, which owns what each one LOOKS like; nothing about
   paint belongs here and nothing about who is fighting belongs there.
   tools/faction-check.mjs asserts the two id sets are identical.

   `playable` is whether players can ever field this faction. The brood cannot
   be fielded by anyone - it is the world's, not a player's - and the Coalition
   and Circuit are GM instruments for now. It is recorded rather than assumed
   because the player-versus-player war is the reason this file exists, and a
   flag that is read once at that point is cheaper than a rule remembered. */
export const FACTIONS = {
  jade:  { id: 'jade',  name: 'Jade Circuit',    short: 'JADE',  playable: 0, brood: 0 },
  coal:  { id: 'coal',  name: 'Coalition',       short: 'COAL',  playable: 0, brood: 0 },
  void:  { id: 'void',  name: 'Void Collective', short: 'VOID',  playable: 1, brood: 0 },
  synd:  { id: 'synd',  name: 'Syndicate',       short: 'SYND',  playable: 1, brood: 0 },
  guild: { id: 'guild', name: 'Merchant Guild',  short: 'GUILD', playable: 1, brood: 0 },
  khai:  { id: 'khai',  name: 'Khai\u2019sultull', short: 'KHAI', playable: 0, brood: 1 },
};

export const FACTION_IDS = Object.keys(FACTIONS);
export { REACH_JADE_MIN };

export function isFaction(id) { return Object.prototype.hasOwnProperty.call(FACTIONS, id); }

/* ── The roster ────────────────────────────────────────────────────────────
   A LINE IS A LIST OF SHARES, NOT A NUMBER. This is the whole change in one
   sentence. `w.jade = 0.4` says "40% of the friendly line is Jade and by
   elimination the rest is the Coalition", which only parses because there are
   exactly two candidates and the reader knows which. A list says who is there
   and how much, and says it for any number of parties including one.

   SIDE STAYS +1 AND -1 AND STAYS ARITHMETIC. That constraint is not negotiable
   and it is not a style preference: u.side is used as a NUMBER in the damage
   path (-p.side selects who a blast hurts) and in two dozen band expressions. A
   third value there breaks combat in ways that do not show up until somebody
   watches a specific blast. So a roster has exactly two sides forever, and a
   three-way war is modelled as a temporary alignment on those two sides rather
   than as a third value of `side`.

   Weights are normalised on read, never on write. A GM setting one faction to
   3 and another to 1 means three quarters and one quarter, and never has to
   think about whether the numbers add to anything. */
export function blankRoster() {
  return { home: [], away: [] };
}

function normalise(list) {
  const clean = (list || [])
    .filter(e => e && isFaction(e.fac) && Number(e.weight) > 0)
    .map(e => ({ fac: e.fac, weight: Number(e.weight) }));
  const total = clean.reduce((a, e) => a + e.weight, 0);
  if (!total) return [];
  return clean.map(e => ({ fac: e.fac, share: e.weight / total, weight: e.weight }));
}

/* What a side actually looks like, normalised, ordered heaviest first so the
   caller that wants "whose war is this" can take the head without sorting. */
export function sideOf(roster, which) {
  const l = normalise(roster && roster[which]);
  l.sort((a, b) => b.share - a.share);
  return l;
}

/* Who owns the LOOK of a side's non-unit objects - works, camps, the things
   that are ours but have no faction tag of their own. Whoever is the majority
   of the line owns the look of the base it fights from. Null for an empty side
   rather than a default, because a default here is how a battlefield ends up
   drawing a faction that is not in the war. */
export function majorityOf(roster, which) {
  const l = sideOf(roster, which);
  return l.length ? l[0].fac : null;
}

/* Is this faction anywhere in this fight, on either side. The question
   `s.coalIn` was answering, asked in a way that works for six factions. */
export function inFight(roster, fac) {
  return sideOf(roster, 'home').some(e => e.fac === fac)
      || sideOf(roster, 'away').some(e => e.fac === fac);
}

export function setSide(roster, which, entries) {
  roster[which] = (entries || [])
    .filter(e => e && isFaction(e.fac) && Number(e.weight) > 0)
    .map(e => ({ fac: e.fac, weight: Number(e.weight) }));
  return roster;
}

/* ── The bridge, and why it exists ─────────────────────────────────────────
   THE PRIMITIVE HAS TO REPRODUCE THE LIVE MODEL EXACTLY BEFORE ANYTHING MOVES
   ONTO IT. Not as a courtesy to the old code: as the only available proof that
   the new shape can say everything the old one said. If a roster cannot express
   "Coalition declared, 40% of the Ussaleth line is Jade, Jade holds forward",
   then migrating to it silently drops a fact the GM has already set.

   So this converts, and tools/faction-check.mjs drives it against the real
   effJade across the whole input range. Nothing in the live path calls it yet.

   `fwd` rides on the roster rather than on the faction because "who stands in
   front" is a property of an ARRANGEMENT and not of a polity: the same two
   armies swap it without either of them changing. */
/* THE FLOOR LIVES IN THE BRIDGE AND NOT IN THE PRIMITIVE, and the check caught
   me putting it nowhere. effJade clamps to JADE_MIN - "Jade never leaves its own
   war" - so a roster built from a dial of 0.10 has to come out at 0.25 or the
   migration silently deletes a rule the war layer depends on.

   It does NOT belong in setSide. A player-versus-player war has no reason to
   floor anybody at a quarter of their own line; that number is a fact about the
   Khai'sultull war specifically, so it is applied where Reach state is
   translated and nowhere else. Duplicated from reach.js rather than imported
   because importing reach.js here would make the registry depend on the war
   layer, which is backwards - tools/faction-check.mjs asserts the two agree. */
const REACH_JADE_MIN = 0.25;

export function rosterFromReach(coalIn, jadeFrac, jadeFwd, extras) {
  const r = blankRoster();
  let j = Math.max(0, Math.min(1, Number(jadeFrac)));
  if (!isFinite(j)) j = 1;
  if (coalIn) j = Math.max(REACH_JADE_MIN, j);
  /* Before the declaration there is no Coalition on the ground at all, whatever
     a stored dial says. effJade already returns 1 while coalIn is 0; a roster
     has to agree, and it says it by the Coalition simply not being on the list
     rather than by being on it with a weight of zero. */
  /* ── Declared factions land on every uncomposed line ──────────────────
     A DECLARATION THAT CHANGES NOTHING IS A FLAG, NOT AN EVENT. setCoalitionEntry
     learned this the hard way: it set coalIn, every world stayed at jade 1, and
     the GM had declared an interstellar power into a war where nothing about the
     ground moved until ten worlds were dialled by hand.

     So a faction declared into the war appears on the line, and it does so by
     SHARING THE NON-JADE REMAINDER rather than by taking a slice off Jade. Jade
     opened this war and its floor is a rule; what the Coalition and anyone after
     it are dividing is the ground Jade is not holding.

     Worlds with a hand-composed roster never reach this function at all - see
     rosterOf - so a GM's own line is not rewritten by a declaration. That is the
     same guarantee jadeSet gives on the scalar model, arriving through a
     different mechanism because a composed line is a stronger statement than a
     dial. */
  const extra = (extras || []).filter(f => isFaction(f) && f !== 'jade' && f !== 'khai' && f !== 'coal');
  const jadeW = coalIn || extra.length ? j : 1;
  const home = [{ fac: 'jade', weight: jadeW }];
  const rest = Math.max(0, 1 - jadeW);
  /* The Coalition counts as one of the parties dividing the remainder rather
     than owning it outright, so declaring a third power visibly costs the
     Coalition ground instead of quietly costing Jade its floor. */
  const sharers = (coalIn ? ['coal'] : []).concat(extra);
  if (rest > 0 && sharers.length)
    for (const f of sharers) home.push({ fac: f, weight: rest / sharers.length });
  setSide(r, 'home', home);
  setSide(r, 'away', [{ fac: 'khai', weight: 1 }]);
  r.fwd = jadeFwd ? 'jade' : 'coal';
  return r;
}

/* The scalar the current battlefield still reads, back out of a roster. The
   round trip through this and rosterFromReach must be the identity for every
   input the live model can produce, which is the assertion that matters. */
/* Who is on the war's belligerent list, as ids, from whatever shape the state
   stores it in. A helper rather than a raw read because the list has to survive
   an older save that has no such field, and a caller doing `s.belligerents ||
   {}` in six places is six places to forget it. */
export function belligerentsOf(state) {
  const b = (state && state.belligerents) || {};
  return Object.keys(b).filter(f => b[f] && isFaction(f));
}

export function jadeShareOf(roster) {
  const e = sideOf(roster, 'home').find(x => x.fac === 'jade');
  return e ? e.share : 0;
}

/* What the client needs to render a roster, and nothing more. Paint is not in
   here: the client has the paint. */
export function rosterWire(roster) {
  return {
    home: sideOf(roster, 'home').map(e => ({ fac: e.fac, share: e.share })),
    away: sideOf(roster, 'away').map(e => ({ fac: e.fac, share: e.share })),
    fwd: roster && roster.fwd ? roster.fwd : null,
  };
}
