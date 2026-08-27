// ═══════════════════════════════════════════════════════════════════════════
// reach.js - Khai'sultull Reach war state.
//
// Stored as one JSON blob in city_kv rather than a table. Ten worlds and a
// handful of scalars is not a schema, and a new table means a migration on a
// live database for data that is rewritten wholesale on every change anyway.
// If the Reach ever grows per-world history or a value ledger, that is the
// point where it earns its own table, not before.
//
// Nothing here is a faucet. No function in this file moves a player's cash.
// The Reach spends money and pays in territory; when capture rewards exist
// they go through the city and charter systems that already have provenance
// checks, not through a new payout path invented here.
// ═══════════════════════════════════════════════════════════════════════════
import { getCityKV, setCityKV } from './db_city.js';

const KEY = 'reach_state';

// Must stay identical to the khaisultull entries in COLONY_META (galaxy.js).
// tools/reach-check.mjs asserts both lists match.
/* ── THE ORDER IS THE ADVANCE, AND IT WAS RUNNING BACKWARDS ────────────────
   This list is not a list of worlds. It is the ROUTE: index 0 is where the war
   starts, frontAllowed unlocks each entry off the one before it, and the god
   panel renders the worlds in exactly this sequence. So an order that does not
   match the map is not cosmetic - it inverts the campaign.

   It was id order, which is authoring order, and the map was drawn later. The
   passage comes in at the RIGHT of the Reach: the return gate sits at (990,250)
   and the nearest world to it is Vesskanoth at (880,300), 121 units away.
   Sahn'tekk - the world whose id still says `gate` - is at (120,120), which is
   880 units away and the FARTHEST body on the map. The advance was told to begin
   at the far side of the Reach and creep back toward the door it came through,
   and the panel duly refused to open Vesskanoth until Thennsur, most of a galaxy
   away, was forty percent taken.

   Ordered by distance from the return gate now, nearest first, so the war lands
   where the ships land and pushes deeper. Measured rather than eyeballed:

     ks_10 Vesskanoth  121      ks_06 Marokketh   604
     ks_07 Ossuveth    275      ks_02 Ussaleth    708
     ks_05 Zhaal'un    350      ks_04 Tessul      780
     ks_09 Thennsur    519      ks_08 Nikkathaal  868
     ks_03 Khai'ru     528      ks_gate_reach     880

   THE ID `ks_gate_reach` IS NOW A LIE AND IT STAYS. It is the primary key of a
   world in saved state, in the KV store and in COLONY_META; renaming it is a
   migration across three stores to fix a name nobody sees. It means "the world
   that was the gate when the ids were written", and this comment is the record
   of that. Nothing reads the string except as an identifier. */
export const REACH_WORLDS = [
  'ks_10', 'ks_07', 'ks_05', 'ks_09', 'ks_03',
  'ks_06', 'ks_02', 'ks_04', 'ks_08', 'ks_gate_reach',
];

// Only this many worlds can be a live front at once. This is a rule, not a
// preference: the push window works because a fixed number of distinct funders
// have to converge on one contest. Spread ten windows across ten worlds and
// either nobody converges anywhere or nine sit dead. The brood chooses where
// it presses; players choose whether to answer.
export const MAX_FRONTS = 2;

const STATUS = ['quiet', 'contested', 'held', 'lost'];

// ── The push window ──────────────────────────────────────────────────────────
// A front you can read and cannot touch is a screensaver. This is the one
// mechanic that makes the Reach a thing players do rather than a thing they
// watch, and its whole design is the FUNDER MINIMUM.
//
// WHY A MINIMUM NUMBER OF PEOPLE AND NOT JUST A NUMBER OF CREDITS. A pure
// capital target is a whale button: one player with a large portfolio takes a
// world alone and everyone else watches a bar they did not move. The minimum
// makes the scarce resource ATTENTION rather than money, which is the resource
// a live stream actually has. Four separate people have to decide to answer the
// same window in the same hour, and no amount of capital substitutes for the
// fourth.
//
// THE PER-PLAYER CAP IS WHAT MAKES THE MINIMUM BITE. Without it, a whale funds
// four windows through four sock accounts, or more realistically funds 99% and
// three friends chip in the floor. The cap means a window mathematically cannot
// clear without real convergence: at MAX the minimum funders barely cover a
// typical target.
//
// EVERY OUTCOME EXCEPT ONE BURNS THE POOL. This is a sink, not a wager, and it
// must stay one: the moment funding a window has positive expected value it
// becomes a farm and the war becomes a payout schedule. The single exception is
// a window that never reached the funder minimum, which is refunded in full,
// because that is not a failed attack. It is an attack that never happened, and
// charging for it teaches players not to fund first.
// ── Waves ────────────────────────────────────────────────────────────────────
// A zone is not taken in one campaign. Clearing it moves the brood off that
// ground and the next wave comes up behind it, so a world is many battles over
// weeks rather than one fight with nine rounds.
//
// THE BANKED CONTROL IS THE WHOLE POINT. A wave cleared is permanent. Ground
// inside the CURRENT wave moves both directions, so a defensive campaign has
// something real to defend, but no reverse inside a live wave can eat a wave
// already won. You can lose the fight in front of you and never lose the planet
// behind you. That distinction is what separates a campaign from a treadmill,
// and it is enforced in worldHive rather than trusted to callers.
//
// GARRISON ESCALATES PER WAVE CLEARED because the brood digs in as it is pushed
// back. It is applied at the pushTarget call site rather than by mutating
// w.garrison, so the GM's garrison figure stays the GM's figure and the
// escalation stays derived.
// ── The war fund ─────────────────────────────────────────────────────────────
// The Coalition has a military budget. It ticks up on its own, because a
// government funds its own army, and it covers QUIET GROUND ONLY. The tax is a
// fixed figure; the burn scales on the same two things pushTarget scales on, so
// taxes mathematically cannot cover a contested world and never cover a hard
// one. The Coalition holds what it owns. Players pay for anything past that.
//
// THE DRAIN IS THE MECHANISM, not a cost bolted onto one. A fund that empties
// is what makes a world slip, and it does it with a reason a player can name
// rather than through a decay constant nobody can see. It is also why the tax
// must not cover replacement on contested ground: a war that funds itself is a
// war nobody needs to attend.
//
// NOTHING HERE PAYS ANYTHING OUT. Same invariant as the rest of this file and
// as the Council Chamber treasuries: a pool that funds troops and can also be
// drained back out is a laundering route, not a war fund.
//
// THESE TWO FIGURES ARE PROVISIONAL. Every other number in this file is derived
// from the ones around it; these two are the only ones set by how much money
// actually moves through the playerbase in a day, which is a question about the
// live database and not about this file. They are deliberately conservative
// until that is measured: taxes cover roughly a third of one contested world.
export const FUND_TAX_PER_DAY   = 96_000_000;    // PROVISIONAL
export const FUND_BURN_PER_DAY  = 240_000_000;   // PROVISIONAL, per contested world
// Ground the fund can no longer hold slips back, bounded per day so a bad week
// costs momentum rather than the campaign. It can never eat a banked wave:
// worldHive floors on cleared, so this only ever moves the live wave.
export const FUND_DRIFT_PER_DAY = 6;

// ── The vote ─────────────────────────────────────────────────────────────────
// ONE MECHANIC, THREE JOBS: which FOB goes up on ground just taken, how the
// Coalition answers a demand from the hive lord, and how it answers a request
// from Jade. All three are decisions somebody has to make, and all three are
// decisions the GM would otherwise be making alone at midnight on behalf of a
// room whose mind he has to guess.
//
// ONE DONOR, ONE VOTE, AND THE AMOUNT IS IRRELEVANT. Weighting by credits would
// rebuild the whale button inside the mechanism built to prevent it, and it
// would rebuild it somewhere less visible than a funding bar. This is the same
// property PUSH_MIN_FUNDERS exists for, carried from the window to the fund:
// money buys sustain, heads buy direction.
//
// ELIGIBILITY IS RECENT, NOT EVER. A player who funded this world once in
// January should not be deciding its FOBs in November. Recency is what turns
// every vote into a reason to have been involved lately, which is the recurring
// pressure the fund needs and does not otherwise have.
//
// A DEADLOCK RESOLVES TO THE DEFAULT rather than stalling. Nothing in this
// layer may block waiting for a GM: if a vote runs out of clock with nobody
// answering, the default lands and the war continues.
//
// LIVE TALLIES ARE NOT SHIPPED. Only the number of ballots is, for the same
// reason winView ships the funder count and not the roll: what matters to
// somebody deciding whether to answer is HOW MANY, not WHICH WAY. Counts ride
// along once the vote has resolved, when it is history rather than pressure.
// ── Donations ────────────────────────────────────────────────────────────────
// THE CAP IS PER PLAYER PER DAY AND IT IS GLOBAL, not per world. A per world
// cap would let one wallet put the daily maximum into every world at once,
// which across ten worlds is ten times the figure the burn was reasoned
// against. The whole arithmetic of this design is minimum funders = burn over
// cap, and a cap that multiplies by the number of fronts is not a cap.
//
// THE FLOOR IS THE WINDOW'S FLOOR AND DELIBERATELY LOW. A high minimum excludes
// exactly the small donors whose COUNT is the thing that matters, and at these
// burn figures their credits are marginal anyway: what they contribute is a
// head, and heads are what the design says are scarce. Do not charge admission
// for one.
//
// A DONATION IS NOT A COMMITMENT AND NEVER COMES BACK. A window refunds when it
// goes unanswered because nothing was attempted; a donation is consumed by time
// passing and there is no state in which it returns. That has to be said at the
// point of giving rather than discovered afterwards, which is what DONATE_TERMS
// is for: it ships in the payload so the client cannot forget to say it.
// ── Structures ───────────────────────────────────────────────────────────────
// A CLEARED WAVE LEAVES SOMETHING STANDING, and that is the difference between
// a campaign and a bar that refills. A FOB is the ratchet made visible: it sits
// on ground already taken, it is still there when the next wave forms in front
// of it, and it grants something specific so that losing one is a specific loss
// rather than a number going down.
//
// EACH TYPE COUNTS ONCE PER WORLD. A second Bastion is a second thing to defend,
// not more armour. Without that rule four types across five cleared waves is a
// multiplier stack landing on the same two ceilings that had to be corrected
// once already when a funded field converged on seventy five tanks.
//
// PASSIVES MOVE CEILINGS, NOT SHARES. Funding still decides where inside the
// range a field lands; a FOB decides how high the range goes.
//
// THE BROOD BUILDS ITS OWN rather than holding one of ours: a repelled window
// leaves a spawning mound on that ground. It is DURABLE BUT RECLAIMABLE, gone
// the moment a push carries there, which is the asymmetry that stops brood
// passives compounding without limit over a year. The Coalition is attacking
// and ground taken stays taken; the brood is defending and defenders can be dug
// out.
// ── The Jade Circuit ─────────────────────────────────────────────────────────
// Jade opened the door by mistake, looking for people. That is why they are in
// front and the Coalition is behind, and why their requests carry an obligation
// they cannot claim.
//
// SEPARATE COMMAND NAMESPACE FROM THE REACH ON PURPOSE. jade_* rather than
// reach_*, even though both write into the same war, because when the faction
// war eventually happens the Jade panel has to point at a different enemy
// without being untangled from Reach state. Separating them now is free and
// separating them later is a refactor.
//
// COMMITMENT IS PER WORLD AND POSTURE IS A DEPTH OFFSET. Whether the Coalition
// supports Jade or leads the charge is the question of who stands nearer the
// enemy, and the battlefield's band clamp already decides that, so it is one
// number rather than a system.
//
// NO JADE FUND, NO JADE ECONOMY, NO JADE AI. Grey infantry that fights beside
// ours and can be asked for things. Everything else is reachable later from the
// same seam and none of it is needed for the first war to read correctly.
/* ── Whose war this is ────────────────────────────────────────────────────
   THE COALITION IS NOT IN THIS WAR YET AND THE DEFAULTS SAID IT WAS. Jade
   Circuit FTL experiments made contact with the hive believing they were
   reaching other humans; the brood came back down the line at Jade, and it is
   Jade's line on the ground. The Coalition is a bystander with an interest
   until it declares, which is a narrative event the GM fires once, for the
   whole Reach, and not a per-world dial.

   That is why entry lives at the state ROOT and the commitment dial stays on
   the world. Entry is "are they in the war at all"; the dial is "how much did
   they send HERE". A per-world entry flag would let the Coalition be at war on
   Ussaleth and not at war on Khai'ru, which is not a thing a polity can be.

   JADE_MIN replaces the old JADE_MAX and inverts the constant with the roles.
   The old one said Jade never carries the whole line alone, which was written
   when the Coalition was the default force and Jade was the guest. It is the
   other way around now: the Coalition can take up to three quarters of a
   world's line once it has declared, and Jade never leaves the field it opened. */
/* The roster primitive. Imported as a namespace rather than by name because
   every symbol in it is about the general model and none of them is about the
   Reach: FX.something reads as "the faction layer says", which is the boundary
   this file should not blur. */
import * as FX from './factions.js';

export const JADE_MIN = 0.25;   // post-entry floor: Jade never leaves its own war
/* What an untouched world's line looks like the moment the Coalition declares.
   Jade still leads: it is still their war, they opened it, and the Coalition is
   the one that arrived late. Enough Coalition to be unmistakable on the field. */
export const COAL_ENTRY_JADE = 0.6;
export const JADE_MAX = 1.0;    // retained name; pre-entry every line is Jade

// The share of a world's line that is Jade, after the entry gate. Nothing may
// read w.jade directly for display or for the wire: before the Coalition has
// declared there is no Coalition on the ground whatever the dial says, and a
// stored value from before entry must not leak a Coalition line onto the field.
export function effJade(s, w) {
  /* A COMPOSED WORLD ANSWERS FROM ITS ROSTER, and every other world answers
     exactly as it always did. See rosterOf below for why presence is the switch
     rather than a migration. */
  if (w && w.roster) return FX.jadeShareOf(w.roster);
  if (!s || !s.coalIn) return 1;
  const v = Number(w && w.jade);
  return Math.max(JADE_MIN, Math.min(1, isFinite(v) ? v : 1));
}

/* ── The roster, and why nothing was migrated ─────────────────────────────
   THE STORED FIELDS ARE NOT REWRITTEN. w.jade, w.jadeSet and w.jadeFwd are
   persisted state on a database that has not seen a deploy in seventy versions,
   and rewriting persisted state is the single most expensive kind of change to
   get wrong here: a bad migration is not a bug you patch, it is a restore from
   the cron backup.

   So presence is the switch, which is the same pattern `jadeSet` already
   established in this file - "has a human ever set this" as a field, because
   there is no value of the thing itself that can mean unset:

     no w.roster   this is a Reach world running the two-faction war. The roster
                   is DERIVED from the jade fields on read. Nothing is stored,
                   nothing changes, every existing save behaves identically.
     w.roster set  a GM has composed a line by hand. It is the authority, and
                   effJade derives FROM it rather than the other way round.

   One authority per world either way, never two, which is the rule the camp
   code states and the rule this file has broken before.

   THE DERIVED CASE IS NOT A FALLBACK, IT IS THE COMMON CASE. Nine of ten Reach
   worlds will never have a hand-composed line, and they should not carry a
   stored copy of a thing that can be computed from what is already there and
   would then be a second place for it to disagree. */
export function rosterOf(s, w) {
  if (w && w.roster) return w.roster;
  return FX.rosterFromReach(s && s.coalIn, w && w.jade, w && w.jadeFwd !== 0,
                            FX.belligerentsOf(s));
}

/* GM: put any faction on any battlefield, on either side.

   THE BROOD IS NOT SPECIAL-CASED OUT. A GM can put the Khai'sultull on the home
   side, and that is deliberate rather than an oversight: the layer's own end
   state has the hive lord keeping a third to two thirds of its worlds and
   persisting as a standing power, and a power that persists is one that can be
   fought alongside. Refusing it here would be this file deciding a story
   question that belongs to the GM.

   WHAT IS REFUSED is an EMPTY side, because a battlefield with nobody on one
   half of it is not a state the renderer has any sensible reading of - the band
   clamp would have a front with no army behind it, and reinforcement would
   restock from a mix with no members. */
export function setRoster(id, side, entries, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  if (side !== 'home' && side !== 'away')
    return { ok: false, msg: "Side must be 'home' or 'away'." };
  const list = (entries || []).filter(e => e && FX.isFaction(e.fac) && Number(e.weight) > 0);
  if (!list.length)
    return { ok: false, msg: 'A side needs at least one faction with a weight above zero.' };
  const bad = (entries || []).filter(e => e && !FX.isFaction(e.fac)).map(e => e.fac);
  if (!w.roster) w.roster = rosterOf(s, w);
  FX.setSide(w.roster, side, list);
  const shown = FX.sideOf(w.roster, side)
    .map(e => FX.FACTIONS[e.fac].short + ' ' + Math.round(e.share * 100) + '%').join(', ');
  note(actor, `${id} ${side} line: ${shown}`);
  saveReach();
  return { ok: true,
    msg: `${id} ${side} line: ${shown}.`
       + (bad.length ? ` Ignored unknown: ${bad.join(', ')}.` : '') };
}

/* Hand a world back to the Reach model. The inverse of setRoster and the reason
   composing a line is safe to experiment with live: deleting the roster restores
   the derived answer exactly, because nothing was ever overwritten to produce
   it. */
export function clearRoster(id, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  if (!w.roster) return { ok: false, msg: id + ' has no composed line to clear.' };
  delete w.roster;
  note(actor, `${id} line returned to the Reach model`);
  saveReach();
  return { ok: true, msg: id + ' returned to the Reach two-faction model.' };
}

/* Who stands forward, on a composed line. On a Reach world this is jadeFwd and
   stays jadeFwd; on a composed one it is a faction id, because "who stands in
   front" is a property of an ARRANGEMENT and the arrangement may not contain
   Jade at all. */
export function setForward(id, fac, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  if (fac !== null && !FX.isFaction(fac)) return { ok: false, msg: 'Unknown faction: ' + fac };
  if (!w.roster) {
    /* Still a Reach world: express it in the field the Reach reads, so the two
       models never hold two different answers to the same question. */
    if (fac !== 'jade' && fac !== 'coal' && fac !== null)
      return { ok: false, msg: id + ' runs the Reach model. Compose a line first to put ' + fac + ' forward.' };
    w.jadeFwd = fac === 'coal' ? 0 : 1;
    note(actor, `${id} forward: ${fac || 'jade'}`);
    saveReach();
    return { ok: true, msg: `${id}: ${(fac || 'jade')} holds the forward band.` };
  }
  if (fac !== null && !FX.inFight(w.roster, fac))
    return { ok: false, msg: fac + ' is not on either line at ' + id + '.' };
  w.roster.fwd = fac;
  note(actor, `${id} forward: ${fac || 'none'}`);
  saveReach();
  return { ok: true, msg: `${id}: ${fac || 'nobody'} holds the forward band.` };
}

export const FOB_TYPES = ['bastion', 'pad', 'cut', 'spire'];
export const FOB_DEFAULT = 'bastion';
// Bastion is broad and shallow ON PURPOSE. It is the no-quorum default, so if
// it were also the strongest the vote would be ceremony and defaulting would be
// indistinguishable from choosing.
export const FOB_EFFECT = {
  bastion: { arm: 0.015 },              // armour ceiling, small and never wrong
  pad:     { air: 0.020, strike: 0.65 },// air ceiling, and strikes 35% sooner
  cut:     { repel: 0.55 },             // a repelled window takes back less
  spire:   { price: 0.88 },             // pushes here cost less: you can see it
};
// The ballot text lives beside the effect it describes. It was written out a
// second time in server.js where the wave vote is opened, which is two places
// to change a name and one place to forget.
export const FOB_LABEL = {
  bastion: 'Bastion, walled compound, armour staging',
  pad:     'Pad, landing strip, air support',
  cut:     'Cut, dug in, costly to retake',
  spire:   'Spire, relay tower, sensors and comms',
};

export const NODE_EFFECT = { mass: 0.06 };   // brood share per mound, per world

// HOW LONG A WAVE TAKES TO FORM, and the only thing in this layer that spends
// the clock rather than credits. Without it a zone can be opened, carried,
// banked and opened again inside one sitting, and three waves fall in an
// evening on ground that is supposed to cost weeks.
//
// TWENTY HOURS RATHER THAN TWENTY FOUR, deliberately. A day-length timer pins
// every wave on the Reach to the same hour of the clock, which quietly makes
// the war an event for whichever timezone that hour suits. Twenty precesses:
// a wave that formed this evening forms mid-afternoon next time and in the
// morning after that, and nobody has to be awake at a fixed time to be there
// when the ground opens.
export const WAVE_FORM_MS = 20 * 3600 * 1000;

export const DONATE_DAILY_CAP = 50_000_000;
export const DONATE_MIN       = 100_000;
export const DONATE_TERMS =
  'A donation is spent holding the line and is never returned. Unlike a push, there is no refund.';

export const VOTE_ELIGIBLE_DAYS = 14;
export const VOTE_MIN_BALLOTS   = 3;
export const VOTE_DEFAULT_HOURS = 24;
export const VOTE_MAX_HOURS     = 168;

export const WAVES_DEFAULT = 3;
export const WAVES_MAX = 12;
export const WAVE_GARRISON_STEP = 12;

export const PUSH_MIN_FUNDERS  = 4;
export const PUSH_PLAYER_CAP   = 2_500_000;
export const PUSH_MIN_COMMIT   = 100_000;
export const PUSH_TARGET_BASE  = 6_000_000;
export const PUSH_DEFAULT_MINS = 20;
export const PUSH_MIN_MINS     = 2;
export const PUSH_MAX_MINS     = 180;

// Cost of a window. Scales on the two things that should make ground expensive:
// how much brood is dug in (garrison) and how much of the zone they still hold.
// A nearly-taken zone against a light garrison is cheap; the last hard world is
// not. Rounded to Ƒ100k so the number on screen reads as a price and not a
// hash.
export function pushTarget(garrison, zoneHive) {
  const g = Math.max(0, Math.min(100, Number(garrison) || 0));
  const h = Math.max(0, Math.min(100, Number(zoneHive) || 0));
  const raw = PUSH_TARGET_BASE * (0.6 + g / 125) * (0.7 + h / 200);
  return Math.round(raw / 100000) * 100000;
}

// ── Battle zones ─────────────────────────────────────────────────────────────
// A world does not fight in one place. It fights in as many places as it can
// support, so the number of simultaneous engagements is a function of how much
// brood is on it: population, not a constant. A near-empty world runs one
// engagement, a dense one runs several.
//
// Population here is the CITY_COLONIES pop for the world, mirrored so reach.js
// stays free of a city import. If the two ever disagree the check catches it.
export const REACH_POP = {
  ks_gate_reach: 12, ks_02: 18, ks_03: 26, ks_04: 22, ks_05: 15,
  ks_06: 9,  ks_07: 34, ks_08: 11, ks_09: 16, ks_10: 20,
};
export const MAX_ZONES = 3;
export function zoneCount(colonyId) {
  const pop = REACH_POP[colonyId] || 0;
  if (pop <= 0) return 0;
  // 1 zone under 15, 2 under 25, 3 at 25 and above. Capped at three because
  // that is what the surface panel can show without becoming a list.
  return Math.max(1, Math.min(MAX_ZONES, pop < 15 ? 1 : pop < 25 ? 2 : 3));
}
// Their tongue, and descended from the world's own name rather than drawn from
// a shared pool. A hive names its ground after the world it is on, so Ossuveth
// has Ossu'kar and Ossu'thal and nothing else does. A shared pool put the same
// Vor'ekk on three unrelated worlds.
const WORLD_STEM = {
  ks_gate_reach:'Sahn', ks_02:'Ussa',  ks_03:"Khai'ru", ks_04:'Tess', ks_05:'Zhaal',
  ks_06:'Marokk',       ks_07:'Ossu',  ks_08:'Nikka',   ks_09:'Thenn', ks_10:'Vesska',
};
const ZONE_SUFFIX = ["'kar", "'thal", "'vekk"];
// A stem that already carries a glottal stop takes the suffix bare, or you get
// Khai'ru'kar with two of them.
function zoneName(colonyId, i) {
  const stem = WORLD_STEM[colonyId] || 'Khai';
  const suf = ZONE_SUFFIX[i % ZONE_SUFFIX.length];
  return stem.indexOf("'") >= 0 ? stem + suf.slice(1) : stem + suf;
}

function blankZones(colonyId, count) {
  const n = count === undefined ? zoneCount(colonyId) : Math.max(0, count | 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      name: zoneName(colonyId, i),
      hive: 100,
      intensity: 50,
      /* QUIET. Every zone, on every world, at seed.
         This was `i === 0 ? 1 : 0` - the first zone of every world came up LIVE
         the moment the Reach was seeded - which meant that even after the gate
         world stopped opening its own front, ten worlds still each had a running
         engagement underneath. A player who reached the map could watch Jade
         fighting the brood on a war nobody had declared, because `live` was
         never a consequence of the war having started; it was a property the
         ground was born with.
         A zone goes live when a GM opens the front over it - see setFront - and
         goes quiet when the front closes. `cleared` is the progress and it is
         untouched by either, so closing a front and reopening it resumes rather
         than restarts. */
      live: 0,
      cleared: 0,     // waves banked on this ground, never decremented
      /* When the CURRENT WAVE came up, and 0 for a wave that came up before
         this was recorded. It gates openWindow through waveFormsIn and it is
         what the panels count down from. It is deliberately NOT stamped when a
         window opens: that stamp used to be here, it made the field mean two
         different things, and under the gate it would have locked a zone out
         after a repel. */
      waveAt: 0,
      win: null,      // live push window, or null
    });
  }
  return out;
}
function seedFromName(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

function blankWorld() {
  return {
    hive: 100,        // percent of the world the Khai'sultull hold
    revealed: 0,      // has the GM disclosed the true name
    front: 0,         // live front, capped by MAX_FRONTS
    garrison: 50,     // brood strength, drives how hard it pushes back
    waves: WAVES_DEFAULT,  // waves per zone before this world is done
    fund: 0,          // war fund balance for this world
    fundAt: 0,        // last time the fund was ticked
    voters: {},       // playerId -> { name, at }: who has skin on this world
    vote: null,       // live or last resolved vote
    /* ONE, not zero. A world nobody has touched is a world Jade is fighting on
       alone, because that is the state of the war until the Coalition declares.
       Zero here meant every fresh world seeded a full Coalition line. */
    jade: 1,          // share of this world's line that is Jade
    /* HAS A HUMAN EVER SET THIS. `jade: 1` is both "the GM chose an all-Jade
       line" and "nobody has touched it", and those need to be told apart the
       moment the Coalition declares - see setCoalitionEntry. A flag, because
       there is no value of jade that can mean "unset". */
    jadeSet: 0,
    jadeFwd: 1,        // 1 Jade forward and the Coalition supports, 0 they lead
    fobs: [],         // [{ type, zone, at }] standing Coalition works
    nodes: [],        // [{ zone, at }] brood spawning mounds
    pendingFob: null, // { zone } awaiting a vote after a wave cleared
    status: 'quiet',
    zones: [],
  };
}

// Per player per UTC day, at the state root rather than on a world, because the
// cap spans the whole Reach.
function dayKey(t) { return new Date(t || Date.now()).toISOString().slice(0, 10); }

export function donateRoom(playerId) {
  const s = loadReach();
  const d = s.donors && s.donors[playerId];
  if (!d || d.day !== dayKey()) return DONATE_DAILY_CAP;
  return Math.max(0, DONATE_DAILY_CAP - (d.amt || 0));
}

// The caller has ALREADY debited the player. Every rejection here runs before
// state is touched, so a debit after a successful call cannot leave a charge
// against a fund that did not accept it. Same contract as commit().
export function donate(colonyId, playerId, playerName, amount) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world.' };
  const amt = Math.floor(Number(amount) || 0);
  if (amt < DONATE_MIN)
    return { ok: false, msg: `Minimum donation is Ƒ${DONATE_MIN.toLocaleString()}.` };
  const today = dayKey();
  if (!s.donors) s.donors = {};
  const d = s.donors[playerId];
  const had = (d && d.day === today) ? (d.amt || 0) : 0;
  if (had + amt > DONATE_DAILY_CAP)
    return { ok: false, msg: `Ƒ${DONATE_DAILY_CAP.toLocaleString()} is the most one player may give in a day, across the whole Reach. You have Ƒ${(DONATE_DAILY_CAP - had).toLocaleString()} left today.` };

  s.donors[playerId] = { day: today, amt: had + amt, name: playerName || 'unknown' };
  w.fund = Math.max(0, (w.fund || 0) + amt);
  /* Giving to a world earns a say on it, exactly as funding a push there does.
     Same record, same recency rule, so the vote does not care which way a
     player got involved. */
  if (!w.voters) w.voters = {};
  w.voters[playerId] = { name: playerName || 'unknown', at: Date.now() };
  pruneVoters(w);
  note('fund', `${colonyId} +Ƒ${amt.toLocaleString()} from ${playerName || playerId}`);
  saveReach();
  return {
    ok: true,
    msg: `Ƒ${amt.toLocaleString()} to the ${colonyId} war fund.`,
    fund: w.fund, given: amt,
    roomLeft: DONATE_DAILY_CAP - (had + amt),
    daysLeft: fundDaysLeft(w),
  };
}

function blankState() {
  const worlds = {};
  for (const id of REACH_WORLDS) { worlds[id] = blankWorld(); worlds[id].zones = blankZones(id); }
  /* A FRESH REACH IS QUIET, AND THE WAR STARTS WHEN THE GM STARTS IT.
     This used to open the gate world at seed, on the reasoning that "a war that
     has not started" reads wrong on the map. That reasoning had the causality
     backwards: the map reading as a war that has not started is CORRECT when the
     war has not started, and what was actually wrong was that a server coming up
     for the first time was already fighting somebody. There is no moment for a
     GM to declare anything if the declaration already happened at boot.

     So every world stays at front 0 and status 'quiet'. The gate opens through
     reach_front like every other front, which is the same command the advance
     already uses, so the first fight is a decision on the record rather than a
     side effect of seeding.

     THIS ONLY AFFECTS A FRESH SEED. blankState runs when there is no saved
     Reach; an existing save keeps whatever fronts it has, because rewriting live
     war state to enforce a new default is a migration and this is not one. A GM
     who wants an existing Reach quiet closes its fronts from the panel. */
  return {
    v: 1,
    worlds,
    envoy: 0,           // is the Khai'sultull line in the contacts list
    /* When the Coalition entered the war, 0 for not in it. War-wide, not
       per-world. Until this is set every line in the Reach is Jade Circuit. */
    coalIn: 0,
    /* WHO ELSE IS IN THIS WAR. The Coalition keeps its own field because it has
       semantics nothing else does - the entry gate, the jadeSet interaction, the
       effJade floor - and folding it in here would mean reimplementing all three
       for one member of a set. Everything after it is a plain id -> timestamp.
       Jade is never in here: it is not a declaration, it is whose war this is. */
    belligerents: {},
    peace: 0,           // 0..100. 100 does not end the war by itself.
    accord: null,       // { terms, signedAt, by } once an accord is struck
    demand: null,       // { text, kind, deadline, posted, answered }
    armed: null,        // { action, world, at } pending announce-then-execute
    log: [],            // last 40 GM actions, newest first
    donors: {},         // playerId -> { day, amt, name }: the daily cap ledger
    seen: {},           // actor -> when they last read the digest
  };
}

let STATE = null;

export function loadReach() {
  if (STATE) return STATE;
  try {
    const raw = getCityKV(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE = blankState();
      // Merge rather than trust: a world added to REACH_WORLDS after a save
      // was written must not come back undefined.
      if (parsed && parsed.worlds) {
        for (const id of REACH_WORLDS)
          if (parsed.worlds[id]) Object.assign(STATE.worlds[id], parsed.worlds[id]);
      }
      // Saves written before zones existed have none, so the population
      // derived count is the FLOOR a world gets rather than the figure it is
      // forced to.
      //
      // THIS USED TO TRUNCATE, and truncating was correct for exactly as long
      // as zone count was purely a function of REACH_POP: if the only thing
      // that could ever set the number was the table, then a stored array
      // disagreeing with the table was stale and rebuilding it was the repair.
      //
      // It stops being correct the moment anything else can add a zone. A
      // fourth battle opened on a world would survive in memory, be written to
      // the KV on the next save, and then be silently dropped by this loop at
      // the next cold start, taking its live window and everything committed to
      // it with it. Nothing would log, because from here it looks like the
      // repair it used to be. Pad up, never shorten: a zone leaves only when
      // something asks for it to leave.
      for (const id of REACH_WORLDS) {
        const w = STATE.worlds[id];
        if (!Array.isArray(w.zones)) w.zones = [];
        const want = Math.max(w.zones.length, zoneCount(id));
        if (w.zones.length !== want) {
          const fresh = blankZones(id, want);
          for (let i = 0; i < want; i++) if (w.zones[i]) Object.assign(fresh[i], w.zones[i]);
          w.zones = fresh;
        }
      }
      // donors carries the per player daily cap. Left off this list it is
      // rebuilt blank on every load, which makes a restart a cap reset.
      /* coalIn on this list or a restart un-declares the Coalition and every
         world silently reverts to an all-Jade line. It is one number and it is
         the largest narrative switch in the layer.
         `belligerents` is here for exactly the same reason and was very nearly
         left off: it is the same switch for every faction after the Coalition,
         and off this list a restart would quietly withdraw all of them while
         leaving the Coalition declared - a war that half-forgot itself, which is
         worse to diagnose than one that forgot itself entirely. */
      for (const k of ['envoy', 'peace', 'accord', 'demand', 'armed', 'log', 'donors', 'seen', 'coalIn', 'belligerents'])
        if (parsed && parsed[k] !== undefined) STATE[k] = parsed[k];
    } else {
      STATE = blankState();
    }
  } catch (e) {
    console.error('[Reach] state load failed, starting blank', e);
    STATE = blankState();
  }
  return STATE;
}

export function saveReach() {
  try { setCityKV(KEY, JSON.stringify(loadReach())); }
  catch (e) { console.error('[Reach] persist', e); }
}

function note(actor, text) {
  const s = loadReach();
  s.log.unshift({ t: Date.now(), by: actor || 'system', text });
  // 40 was a session's worth. The digest reads back over however long the GM
  // was away, and a war that runs unattended for a week generates more than
  // forty lines, so the window has to be wider than the absence it describes.
  if (s.log.length > 200) s.log.length = 200;
}

export function reachState() { return loadReach(); }

// A world is TAKEN only when the brood holds none of it. Partial control is
// still a war: the hive settlement stays decorative and no city exists.
// This is the resolver city.js gates isCityColony on.
export function worldTaken(colonyId) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  return !!(w && w.hive <= 0);
}

// Set by the server so a world that flips can seed its city immediately rather
// than waiting for a restart. Kept as a hook so reach.js does not import the
// city system and create a cycle.
let _onTaken = null, _onLost = null;
export function setConversionHooks(onTaken, onLost) {
  _onTaken = typeof onTaken === 'function' ? onTaken : null;
  _onLost  = typeof onLost  === 'function' ? onLost  : null;
}
function fireConversion(id, wasTaken, isTaken) {
  if (wasTaken === isTaken) return;
  try { (isTaken ? _onTaken : _onLost)?.(id); }
  catch (e) { console.error('[Reach] conversion hook', e); }
}

export function frontCount() {
  const s = loadReach();
  return REACH_WORLDS.filter(id => s.worlds[id].front).length;
}

function clampPct(n) { return Math.max(0, Math.min(100, Math.round(Number(n) || 0))); }

// A world's control used to be the flat mean of its zones' live control, which
// was right while a zone was fought once. With waves it would hand back ground
// that was already won: a fresh wave opens at 100 and the mean would put the
// planet straight back where it started.
//
// Control is banked waves plus progress inside the current one, floored so the
// live wave can never subtract from what is banked. A world reads 0 only when
// every zone has cleared every wave, which is what fireConversion keys on.
function worldHive(w) {
  const total = Math.max(1, (w.waves | 0) || WAVES_DEFAULT);
  const zs = Array.isArray(w.zones) ? w.zones : [];
  if (!zs.length) return clampPct(w.hive);
  let sum = 0;
  for (const z of zs) {
    const banked = Math.min(total, Math.max(0, z.cleared | 0));
    const live = banked >= total ? 0 : Math.max(0, 1 - clampPct(z.hive) / 100);
    sum += Math.min(1, (banked + live) / total);
  }
  return clampPct(Math.round(100 * (1 - sum / zs.length)));
}

// What a push actually costs on this ground. The brood digs in as it is driven
// back, so each banked wave adds to the garrison the price is computed against
// without touching the figure the GM set.
export function effGarrison(w, z) {
  return clampPct((w.garrison || 0) + Math.max(0, z.cleared | 0) * WAVE_GARRISON_STEP);
}
// What this world costs to hold per day, scaled the way ground is priced. A
// quiet world burns nothing: there is no war on it to pay for.
export function fundBurnPerDay(w) {
  if (!w.front) return 0;
  const g = clampPct(w.garrison), h = clampPct(w.hive);
  return Math.round(FUND_BURN_PER_DAY * (0.6 + g / 125) * (0.7 + h / 200));
}
// How much of that burn the fund is actually meeting, 0 to 1. This is what the
// battlefield reads as standing Coalition strength when no push is open.
export function fundCover(w) {
  const burn = fundBurnPerDay(w);
  if (burn <= 0) return 1;
  const perDay = FUND_TAX_PER_DAY + Math.max(0, w.fund || 0);
  return Math.max(0, Math.min(1, perDay / burn));
}
export function fundDaysLeft(w) {
  const burn = fundBurnPerDay(w);
  const net = burn - FUND_TAX_PER_DAY;
  if (net <= 0) return Infinity;
  return Math.max(0, (w.fund || 0) / net);
}

// Accrue taxes, pay the burn, and let ground slip where the fund cannot hold
// it. Driven from the same sweep that resolves windows rather than its own
// timer, because PM2 forgets a setTimeout on restart and a fund that stops
// ticking is a war that quietly freezes.
export function tickFunds(now) {
  const s = loadReach();
  const t = now || Date.now();
  let moved = false;
  for (const id of REACH_WORLDS) {
    const w = s.worlds[id];
    if (!w.fundAt) { w.fundAt = t; moved = true; continue; }
    const days = (t - w.fundAt) / 86400000;
    if (days <= 0) continue;
    if (days < 1 / 1440) continue;                 // sub minute: not worth the write
    w.fundAt = t;
    moved = true;
    const burn = fundBurnPerDay(w);
    /* A QUIET WORLD BANKS NOTHING. The tax exists to offset a burn, and with no
       burn there is nothing to offset, so accruing it is a war chest built by
       peace. The first version did accrue, and with MAX_FRONTS at two against
       ten worlds most of them sit quiet for months: ninety days of quiet banked
       about Ƒ8.6b, which is forty five days of contested cover before a single
       player has done anything. Every world opened late in the campaign would
       have arrived pre-funded and the donation loop would simply not engage.

       Donations still land on a quiet world, because pre-funding one before the
       front opens is a real thing to want to do. They just are not minted. */
    if (burn > 0) {
      const net = FUND_TAX_PER_DAY - burn;
      w.fund = Math.max(0, Math.round((w.fund || 0) + net * days));
    }
    // Dry and contested: the line gives. Only the live wave moves, only zones
    // with no window open, and only by the bounded daily figure.
    const dry = burn > 0 && w.fund <= 0 && FUND_TAX_PER_DAY < burn;
    // Noted on the TRANSITION, not every tick. This runs every thirty seconds,
    // and a line per tick would bury the log it exists to summarise.
    if (dry !== !!w.dry) {
      w.dry = dry ? 1 : 0;
      note('fund', dry ? `${id} FUND DRY, ground is slipping` : `${id} fund restored`);
    }
    if (dry) {
      const slip = FUND_DRIFT_PER_DAY * days;
      if (slip >= 0.5) {
        for (const z of w.zones || []) {
          if (!z.live || zoneDone(w, z) || liveWin(z)) continue;
          z.hive = clampPct(z.hive + slip);
        }
        w.hive = worldHive(w);
        if (w.hive >= 100) w.status = 'lost';
        else if (w.hive <= 0) w.status = 'held';
        else w.status = w.front ? 'contested' : 'quiet';
      }
    }
  }
  if (moved) saveReach();
  return moved;
}

// GM: set or add to a world's fund. Additive is the useful one on a live
// stream; absolute is for setting up a scenario.
export function setFund(id, value, mode, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  const v = Math.max(0, Math.round(Number(value) || 0));
  const was = w.fund || 0;
  w.fund = mode === 'add' ? Math.max(0, was + v) : v;
  note(actor, `${id} fund ${was.toLocaleString()} -> ${w.fund.toLocaleString()}`);
  saveReach();
  return { ok: true, msg: `${id} war fund Ƒ${w.fund.toLocaleString()}.` };
}

// ── Vote primitive ───────────────────────────────────────────────────────────
// Voters accumulate on every commit and every donation and nothing ever removed
// one, so the ledger grew for the life of the world while eligibility only ever
// read the last fortnight of it. Pruned on write: bounded by the eligibility
// window rather than by how long the campaign has run.
function pruneVoters(w) {
  const cut = Date.now() - VOTE_ELIGIBLE_DAYS * 86400000;
  const v = w.voters || {};
  for (const id in v) if ((v[id].at || 0) < cut) delete v[id];
}

export function voteEligible(w, playerId) {
  const v = w && w.voters && w.voters[playerId];
  if (!v) return false;
  return (Date.now() - (v.at || 0)) <= VOTE_ELIGIBLE_DAYS * 86400000;
}
export function eligibleCount(w) {
  const cut = Date.now() - VOTE_ELIGIBLE_DAYS * 86400000;
  let n = 0;
  for (const id in (w.voters || {})) if ((w.voters[id].at || 0) >= cut) n++;
  return n;
}
function liveVote(w) {
  return w && w.vote && !w.vote.resolved ? w.vote : null;
}

export function openVote(colonyId, kind, question, options, hours, defaultId, actor) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world: ' + colonyId };
  if (liveVote(w)) return { ok: false, msg: 'A vote is already open on ' + colonyId + '.' };
  const opts = (Array.isArray(options) ? options : [])
    .map(o => ({ id: String(o.id || o), label: String(o.label || o.id || o) }))
    .filter(o => o.id).slice(0, 6);
  if (opts.length < 2) return { ok: false, msg: 'A vote needs at least two options.' };
  const def = opts.some(o => o.id === defaultId) ? defaultId : opts[0].id;
  const hrs = Math.max(1, Math.min(VOTE_MAX_HOURS, Number(hours) || VOTE_DEFAULT_HOURS));
  w.vote = {
    kind: String(kind || 'fob'),
    question: String(question || '').slice(0, 400),
    options: opts,
    defaultId: def,
    openedAt: Date.now(),
    closesAt: Date.now() + hrs * 3600000,
    ballots: {},          // playerId -> { name, opt }
    resolved: null,       // 'carried' | 'defaulted'
    result: null,
    outcome: null,
  };
  note(actor, `${colonyId} vote OPEN (${w.vote.kind}, ${hrs}h, default ${def})`);
  saveReach();
  return { ok: true, msg: `Vote open on ${colonyId}: ${opts.length} options, ${hrs}h, default ${def}.` };
}

// A ballot is changeable until the vote closes. Nothing is escrowed and nothing
// is spent, so there is no reason to punish somebody for reconsidering.
export function castVote(colonyId, playerId, playerName, optionId) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world.' };
  const v = liveVote(w);
  if (!v) return { ok: false, msg: 'No vote is open there.' };
  if (Date.now() > v.closesAt) return { ok: false, msg: 'That vote has closed.' };
  if (!voteEligible(w, playerId))
    return { ok: false, msg: `Only players who have funded ${colonyId} in the last ${VOTE_ELIGIBLE_DAYS} days may vote on it.` };
  const opt = v.options.find(o => o.id === String(optionId));
  if (!opt) return { ok: false, msg: 'No such option.' };
  const had = v.ballots[playerId];
  v.ballots[playerId] = { name: playerName || 'unknown', opt: opt.id };
  saveReach();
  return {
    ok: true,
    msg: had ? `Vote changed to ${opt.label}.` : `Voted ${opt.label}.`,
    ballots: Object.keys(v.ballots).length, mine: opt.id,
  };
}

export function dueVotes(now) {
  const s = loadReach();
  const t = now || Date.now();
  const out = [];
  for (const id of REACH_WORLDS) {
    const v = s.worlds[id] && s.worlds[id].vote;
    if (v && !v.resolved && t >= v.closesAt) out.push(id);
  }
  return out;
}

// Plurality, with the default taking a tie. A tie means the room did not
// choose, and the default is what the room gets when it does not choose.
export function resolveVote(colonyId, actor) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  const v = w && liveVote(w);
  if (!v) return { ok: false, msg: 'Nothing to resolve.' };
  const ids = Object.keys(v.ballots);
  const tally = {};
  for (const o of v.options) tally[o.id] = 0;
  for (const id of ids) if (tally[v.ballots[id].opt] !== undefined) tally[v.ballots[id].opt]++;

  // A TIE GOES TO THE DEFAULT, and it has to be computed as a tie rather than
  // fallen into. Seeding the running best from the default's own count and
  // taking the first strict improvement hands a 2-2 split to whichever option
  // happens to be earlier in the list, which makes the outcome depend on the
  // order the options were typed in. Collect the joint leaders instead: exactly
  // one leader carries, more than one means the room did not choose, and the
  // default is what the room gets when it does not choose.
  let win = v.defaultId;
  if (ids.length >= VOTE_MIN_BALLOTS) {
    let best = -1, leaders = [];
    for (const o of v.options) {
      const c = tally[o.id] || 0;
      if (c > best) { best = c; leaders = [o.id]; }
      else if (c === best) leaders.push(o.id);
    }
    win = leaders.length === 1 ? leaders[0] : v.defaultId;
    v.resolved = 'carried';
  } else {
    v.resolved = 'defaulted';
  }
  v.result = win;
  v.tally = tally;
  /* A VOTE THAT CHANGES NOTHING IS A POLL. All three kinds land somewhere:
     a FOB vote raises a work, a Jade request moves who holds the forward band,
     and an accepted demand closes the front.

     None of them touches banked control, which is the invariant the whole layer
     rests on. A ceasefire stops a war; it does not hand back the ground the war
     already took. */
  if (v.kind === 'jade') {
    // Support means the Coalition moves up and shares the line. Declining
    // leaves Jade holding the forward band alone, which is the posture they
    // were already in. One number, and the field shows the answer.
    w.jadeFwd = win === 'support' ? 0 : 1;
    /* A CARRIED SUPPORT VOTE IS THE COALITION ENTERING THE WAR, if it is not in
       it yet. The preset asks "the Jade Circuit has asked for support, does the
       Coalition answer" and until now answering yes moved a depth offset and
       nothing else, which made the vote a poll with a camera angle attached.
       This is the one thing the room can do that changes whose army is on the
       screen.

       CARRIED ONLY, never defaulted. A defaulted vote is an empty room, and an
       empty room must not be able to walk a polity into an interstellar war.
       The GM switch remains authoritative in both directions. */
    if (win === 'support' && v.resolved === 'carried' && !s.coalIn) {
      s.coalIn = Date.now();
      note('vote', `COALITION ENTERED THE REACH WAR by ballot on ${colonyId}`);
    }
  }
  if (v.kind === 'demand' && win === 'accept') {
    /* ACCEPTING CLOSES THE FRONT, which is what makes a demand a decision with
       a price rather than a line of dialogue. fundBurnPerDay returns zero on a
       world with no front, so the burn stops, the fund stops draining and the
       ground stops slipping. The GM can reopen it; the room chose to stop. */
    w.front = 0;
    if (w.status === 'contested') w.status = 'quiet';
    note('vote', `${colonyId} FRONT CLOSED by accepted demand`);
  }
  /* A FOB vote is not advice. Resolving one raises the work, including when it
     resolved by default, because the ground was taken either way and the reward
     is not forfeit for a quiet room. */
  if (v.kind === 'fob' && w.pendingFob) {
    // Through placeFob, so a ballot that somehow reaches a type already
    // standing raises nothing rather than a second copy of it. The options are
    // filtered to what is still open before the vote is put, so this is the
    // belt on a race rather than the rule itself.
    placeFob(w, win, w.pendingFob.zone | 0);
    w.pendingFob = null;
  }
  const label = (v.options.find(o => o.id === win) || {}).label || win;
  v.outcome = v.resolved === 'carried'
    ? `${ids.length} voted. ${label}.`
    : `${ids.length} of ${VOTE_MIN_BALLOTS} needed answered. ${label} stands by default.`;
  note(actor || 'vote', `${colonyId} vote ${v.resolved}: ${win} (${ids.length} ballots)`);
  saveReach();
  return { ok: true, world: colonyId, kind: v.kind, result: win, label,
           resolved: v.resolved, ballots: ids.length, outcome: v.outcome };
}

export function cancelVote(colonyId, actor) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  const v = w && liveVote(w);
  if (!v) return { ok: false, msg: 'No vote open there.' };
  v.resolved = 'cancelled';
  v.outcome = 'The vote was withdrawn.';
  note(actor, `${colonyId} vote cancelled`);
  saveReach();
  return { ok: true, msg: 'Vote withdrawn.' };
}

// ── Structure effects ────────────────────────────────────────────────────────
// Distinct types, because a second of a type is a thing to defend and not a
// second helping of its passive.
export function fobKinds(w) {
  const out = {};
  for (const f of (w.fobs || [])) if (FOB_EFFECT[f.type]) out[f.type] = 1;
  return Object.keys(out);
}
export function fobBonus(w) {
  const b = { arm: 0, air: 0, strike: 1, repel: 1, price: 1 };
  for (const t of fobKinds(w)) {
    const e = FOB_EFFECT[t];
    if (e.arm) b.arm += e.arm;
    if (e.air) b.air += e.air;
    if (e.strike) b.strike *= e.strike;
    if (e.repel) b.repel *= e.repel;
    if (e.price) b.price *= e.price;
  }
  return b;
}
// Mounds stack, because mass is the one brood passive that cannot create a dead
// end: more brood is always answerable with more force, where a stacked price
// penalty could put a world past reach with no counterplay.
export function nodeMass(w) {
  return Math.min(0.24, (w.nodes || []).length * NODE_EFFECT.mass);
}

// Which works could still go up here. fobBonus counts each TYPE once, so a
// second bastion is worth nothing, and the ballot should not offer a choice
// that buys the room nothing.
export function fobOpen(w) {
  const have = new Set(fobKinds(w));
  return FOB_TYPES.filter(t => !have.has(t));
}

/* The ballot for a wave just banked, or null if there is nothing to put. The
   whole rule lives here rather than in the sweep that calls it, because the
   sweep had the four options written out by hand: it offered a bastion on a
   world that already had one, and the room could spend a decision on nothing.

   IT ALSO CLEARS pendingFob WHEN ALL FOUR STAND. Left set, the sweep would
   reopen a vote on this world every tick forever. */
export function fobVoteParams(colonyId) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w || !w.pendingFob) return null;
  const open = fobOpen(w);
  if (!open.length) {
    w.pendingFob = null;
    note('wave', `${colonyId} every work already stands, no ballot put`);
    saveReach();
    return null;
  }
  return {
    kind: 'fob', hours: VOTE_DEFAULT_HOURS, defaultId: open[0],
    question: 'Ground is held. What goes up on it?',
    options: open.map(t => ({ id: t, label: FOB_LABEL[t] })),
  };
}

// The one place a work is raised. Both callers used to push into w.fobs
// directly, so a duplicate could be created from either, and the effect table
// counts a type once: the second bastion changed nothing while raidFob spliced
// one instance and reported the work destroyed with every effect still live.
// The raid message asserted something false, which is worse than the no-op.
function placeFob(w, type, zone) {
  const t = FOB_TYPES.includes(String(type)) ? String(type) : FOB_DEFAULT;
  if (!Array.isArray(w.fobs)) w.fobs = [];
  if (w.fobs.some(f => f.type === t)) return null;
  w.fobs.push({ type: t, zone: Number(zone) | 0, at: Date.now() });
  return t;
}

export function addFob(colonyId, type, zone, actor) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world: ' + colonyId };
  const t = placeFob(w, type, zone);
  if (!t) return { ok: false,
    msg: `A ${FOB_TYPES.includes(String(type)) ? String(type) : FOB_DEFAULT} already stands on ${colonyId}. Each work counts once.` };
  note(actor || 'fob', `${colonyId} ${t} raised`);
  saveReach();
  return { ok: true, type: t, msg: `${t} raised on ${colonyId}.` };
}

// A RAID MAY COST THE FOB AND MUST NEVER COST BANKED CONTROL. A lever that can
// be pulled at any moment and unwinds weeks of real time is the one shape of
// mistake this layer cannot absorb, so this function does not touch hive, zones
// or cleared counts at all.
export function raidFob(colonyId, type, actor) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world: ' + colonyId };
  const list = w.fobs || [];
  const i = type ? list.findIndex(f => f.type === String(type)) : list.length - 1;
  if (i < 0) return { ok: false, msg: 'No such work standing on ' + colonyId + '.' };
  const gone = list.splice(i, 1)[0];
  note(actor, `${colonyId} ${gone.type} RAIDED`);
  saveReach();
  return { ok: true, type: gone.type,
           msg: `${gone.type} on ${colonyId} destroyed. Ground unchanged.` };
}

// GM: how much of this world's line is Jade, and who stands in front. Writing
// it retunes the NEXT arrivals rather than repainting the field, so the line
// turns over across a reinforcement cycle the way funding composition already
// drifts, instead of snapping.
export function setJade(id, frac, forward, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  /* REFUSE RATHER THAN CLAMP when the Coalition is not in the war. Clamping
     would take the dial, write a value that does nothing, and report success:
     the GM would set Jade to 40% on three worlds, see no change on any of them,
     and have no way to find out why. The dial is meaningless before entry and
     it should say so. */
  if (!s.coalIn && frac !== undefined && frac !== null && Number(frac) < 1)
    return { ok: false, msg: 'The Coalition is not in this war. Declare its entry before dividing a line it has no troops on.' };
  if (frac !== undefined && frac !== null) {
    w.jade = Math.max(JADE_MIN, Math.min(1, Number(frac) || 0));
    w.jadeSet = 1;                    // an explicit choice, never overwritten again
  }
  if (forward !== undefined && forward !== null) w.jadeFwd = forward ? 1 : 0;
  const eff = effJade(s, w);
  note(actor, `${id} jade ${Math.round(eff * 100)}% ${w.jadeFwd ? 'forward' : 'in support'}`);
  saveReach();
  return { ok: true,
    msg: `${id}: Jade at ${Math.round(eff * 100)}% of the line, ${w.jadeFwd ? 'holding the forward band' : 'in support behind the Coalition'}.` };
}

/* GM: the Coalition declares, or is walked back out. One switch for the whole
   Reach. Walking it back leaves every world's stored dial alone rather than
   rewriting it to 1: the dial is what the GM chose, and undeclaring is not a
   reason to forget it. effJade is what everything reads, and it returns 1 while
   coalIn is 0 regardless of what is stored. */
/* ── Force any faction into the war ───────────────────────────────────────
   THE GM ASKED FOR A CONTROL, AND THE CONTROL HAS TO DO SOMETHING. Setting a
   flag that no line reads is the failure setCoalitionEntry already made once:
   it declared a power into the war and every world stayed entirely Jade until
   somebody dialled ten of them by hand. So declaring here puts the faction onto
   every uncomposed line, through rosterFromReach - which is also why the roster
   had to be the thing the field reads before this was worth building.

   THE COALITION IS ROUTED, NOT DUPLICATED. It has an entry gate, a jadeSet
   interaction and a floor in effJade; a second path that set a different field
   would be two authorities on whether the Coalition is at war. Asking for it
   here calls setCoalitionEntry, so there is one.

   JADE AND THE BROOD ARE REFUSED, and for opposite reasons. Jade cannot be
   declared in because it is already in - this is its war and JADE_MIN says it
   never leaves. The Khai'sultull cannot be declared in because it is not a party
   that declares; it is the thing being fought. A GM who genuinely wants the
   brood fighting alongside somebody composes that line in War Controls, where it
   is a statement about one battlefield rather than about the whole war. */
export function setBelligerent(fac, inWar, actor) {
  if (fac === 'coal') return setCoalitionEntry(inWar, actor);
  if (!FX.isFaction(fac)) return { ok: false, msg: 'Unknown faction: ' + fac };
  if (fac === 'jade')
    return { ok: false, msg: 'The Circuit opened this war and cannot leave it. Set its commitment per world instead.' };
  if (FX.FACTIONS[fac].brood)
    return { ok: false, msg: 'The Khai\u2019sultull are what is being fought, not a party that declares. Compose them onto a line in War Controls if that is what you want.' };
  const s = loadReach();
  if (!s.belligerents) s.belligerents = {};
  const want = inWar ? 1 : 0;
  const was = s.belligerents[fac] ? 1 : 0;
  const name = FX.FACTIONS[fac].name;
  if (want === was)
    return { ok: false, msg: name + (want ? ' is already in this war.' : ' is not in this war.') };
  if (want) s.belligerents[fac] = Date.now();
  else delete s.belligerents[fac];
  note(actor, `${name} ${want ? 'DECLARED INTO' : 'withdrawn from'} the war`);
  saveReach();
  const on = FX.belligerentsOf(s).map(f => FX.FACTIONS[f].short);
  return { ok: true, msg: name + (want ? ' is in the war.' : ' has withdrawn.')
    + (on.length ? ' Fielding alongside the Circuit: ' + on.join(', ') + '.' : '')
    + ' Worlds with a composed line in War Controls are unaffected.' };
}

export function setCoalitionEntry(inWar, actor) {
  const s = loadReach();
  const want = inWar ? 1 : 0;
  const was = s.coalIn ? 1 : 0;
  if (want === was)
    return { ok: false, msg: want ? 'The Coalition is already in this war.' : 'The Coalition is not in this war.' };
  s.coalIn = want ? Date.now() : 0;
  /* DECLARING THE COALITION HAS TO DO SOMETHING, AND IT DID NOTHING. Every
     world sits at jade: 1 from blankWorld, effJade returns that unchanged once
     coalIn is set, so the GM declared an interstellar power into the war and
     every line in the Reach stayed entirely Jade until they went and dialled
     ten worlds by hand. The declaration is the event; it should look like one.

     Worlds the GM has EXPLICITLY dialled keep their value - that is what
     jadeSet is for, and it is why "has anyone touched this" had to become a
     flag rather than a comparison against 1. Untouched worlds take a default
     mix: Jade still leads, because it is still their war and they opened it,
     but there is visibly a Coalition on the ground.

     Withdrawal does not put them back. Leaving the dials where they are means
     re-declaring restores the war as it was rather than resetting it, and
     effJade already returns 1 while coalIn is 0 whatever is stored. */
  if (want) {
    let moved = 0;
    for (const id of REACH_WORLDS) {
      const wl = s.worlds[id];
      if (!wl || wl.jadeSet) continue;
      wl.jade = COAL_ENTRY_JADE;
      moved++;
    }
    if (moved) note(actor, `${moved} untouched worlds set to ${Math.round(COAL_ENTRY_JADE * 100)}% Jade on entry`);
  }
  note(actor, want ? 'COALITION ENTERED THE REACH WAR' : 'COALITION WITHDREW FROM THE REACH WAR');
  saveReach();
  return { ok: true, joined: want,
    msg: want
      ? 'The Coalition has entered the war. Its line stands with Jade Circuit and the commitment dial is live on every world.'
      : 'The Coalition has withdrawn. Every line in the Reach is Jade Circuit again.' };
}

export function coalitionInWar() { return !!loadReach().coalIn; }

// Milliseconds until the current wave is fightable, or 0 if it already is.
// z.waveAt of 0 means the wave came up before this was recorded, which is every
// zone written before this release and every first wave on a fresh world: those
// are ready, not waiting forever.
export function waveFormsIn(z) {
  if (!z || !z.waveAt) return 0;
  return Math.max(0, WAVE_FORM_MS - (Date.now() - z.waveAt));
}

export function zoneDone(w, z) {
  return Math.max(0, z.cleared | 0) >= Math.max(1, (w.waves | 0) || WAVES_DEFAULT);
}

// ── mutators. Each returns { ok, msg } so the dispatcher stays thin. ────────

export function setControl(id, hivePct, actor) {
  const s = loadReach();
  if (!s.worlds[id]) return { ok: false, msg: 'Unknown world: ' + id };
  const w = s.worlds[id];
  const was = w.hive <= 0;
  w.hive = clampPct(hivePct);
  if (w.hive >= 100) w.status = 'lost';
  else if (w.hive <= 0) w.status = 'held';
  else w.status = w.front ? 'contested' : 'quiet';
  note(actor, `${id} hive control ${w.hive}%`);
  saveReach();
  fireConversion(id, was, w.hive <= 0);
  return { ok: true, msg: `${id} → hive ${w.hive}%, ${w.status}` };
}

// A world grows at the GM's discretion: one battle to start, more as the story
// asks for them. Raising the count re-opens ground that had cleared, which is
// deliberate and is why it is a separate command rather than a side effect.
export function setWaves(id, n, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  const want = Math.max(1, Math.min(WAVES_MAX, Number(n) | 0));
  const was = (w.waves | 0) || WAVES_DEFAULT;
  w.waves = want;
  /* RAISING THE WAVE COUNT RE-OPENS CLEARED GROUND, AND ONLY UNDER A LIVE
     FRONT. Without the front test this could put a running engagement on a
     world the GM had never opened - which is the same hole the zone seed had,
     arriving through a different command. The reopened ground stays dark until
     somebody opens the front over it, and setFront lights it then. */
  for (const z of w.zones || []) {
    if (!w.front) break;
    if (!zoneDone(w, z) && !z.live && (z.cleared | 0) >= was) { z.live = 1; z.hive = 100; z.waveAt = Date.now(); }
  }
  w.hive = worldHive(w);
  if (w.hive >= 100) w.status = 'lost';
  else if (w.hive <= 0) w.status = 'held';
  else w.status = w.front ? 'contested' : 'quiet';
  note(actor, `${id} waves ${was} -> ${want}`);
  saveReach();
  return { ok: true, msg: `${id} now runs ${want} wave${want === 1 ? '' : 's'} per zone (was ${was}).` };
}

export function setGarrison(id, val, actor) {
  const s = loadReach();
  if (!s.worlds[id]) return { ok: false, msg: 'Unknown world: ' + id };
  s.worlds[id].garrison = clampPct(val);
  note(actor, `${id} garrison ${s.worlds[id].garrison}`);
  saveReach();
  return { ok: true, msg: `${id} garrison → ${s.worlds[id].garrison}` };
}

export function setRevealed(id, on, actor) {
  const s = loadReach();
  if (!s.worlds[id]) return { ok: false, msg: 'Unknown world: ' + id };
  s.worlds[id].revealed = on ? 1 : 0;
  note(actor, `${id} name ${on ? 'revealed' : 'concealed'}`);
  saveReach();
  return { ok: true, msg: `${id} name ${on ? 'REVEALED' : 'concealed'}` };
}

/* ── The war starts where the ships arrive ────────────────────────────────
   THE FIGHTING HAS TO ADVANCE FROM SOMEWHERE, AND IT IS THE PASSAGE. Everything
   in the Reach arrives through the return gate, so a front on the far side with
   the near worlds untouched is an army that skipped nine worlds to reach the
   tenth. The map was already telling that story and nothing enforced it.

   THIS COMMENT USED TO NAME ks_gate_reach AS THE ARRIVAL POINT and it had the
   geography backwards: that world is the FARTHEST from the passage, 880 units
   against Vesskanoth's 121. The rule was right and the route it ran along was
   reversed - see the note on REACH_WORLDS. Nothing here changed except which
   world index 0 is, which is the whole fix.

   THE RULE IS ADVANCE, NOT A WHITELIST. A world may open a front once the world
   before it in REACH_WORLDS has been meaningfully broken into. So the campaign
   opens at the gate, and each world unlocks the next as it falls. A whitelist
   would have needed editing every time the war moved; this needs nothing.

   GM OVERRIDE IS DELIBERATE AND IT IS `force`. Jacob runs this war live and a
   rule that cannot be broken from the panel is a rule that will be in the way
   during a session it was never written for. It logs when it is used, so an
   out-of-order front is visible in the digest rather than a mystery. */
export const REACH_OPEN_AT = 40;   // percent of a world taken before the next unlocks

export function frontAllowed(s, id) {
  const i = REACH_WORLDS.indexOf(id);
  if (i <= 0) return true;                       // the gate is always open
  const prev = s.worlds[REACH_WORLDS[i - 1]];
  if (!prev) return true;
  // "Broken into", not "taken": waiting for a full capture would mean one world
  // at a time forever, and the point is a front that CREEPS rather than jumps.
  return (100 - (prev.hive || 0)) >= REACH_OPEN_AT;
}

export function setFront(id, on, actor, force) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  if (on && !w.front && frontCount() >= MAX_FRONTS)
    return { ok: false, msg: `${MAX_FRONTS} fronts already live. Close one first.` };
  if (on && !w.front && !force && !frontAllowed(s, id)) {
    const i = REACH_WORLDS.indexOf(id);
    return { ok: false, msg: `${id} is behind the advance. ${REACH_WORLDS[i - 1]} `
      + `must be at least ${REACH_OPEN_AT}% taken first, or force it from the panel.` };
  }
  if (on && !w.front && force && !frontAllowed(s, id))
    note(actor, `${id} front FORCED open out of order`);
  w.front = on ? 1 : 0;
  /* THE FRONT IS WHAT MAKES GROUND LIVE. Zones used to be born live and the
     front flag only decided whether the world was drawn as contested, so the two
     could say different things: no front, and a running engagement under it.
     Opening lights the first zone that is not already finished; closing quiets
     every zone on the world. `cleared` - the banked progress - is untouched by
     both, so a front closed and reopened RESUMES where it stopped rather than
     starting the world again, which is the whole reason this is not simply a
     reseed. */
  if (w.front) {
    const z0 = (w.zones || []).find(z => !zoneDone(w, z));
    if (z0 && !z0.live) { z0.live = 1; z0.waveAt = Date.now(); }
  } else {
    for (const z of w.zones || []) z.live = 0;
  }
  if (w.front && w.hive > 0 && w.hive < 100) w.status = 'contested';
  if (!w.front && w.status === 'contested') w.status = 'quiet';
  note(actor, `${id} front ${on ? 'OPENED' : 'closed'}`);
  saveReach();
  return { ok: true, msg: `${id} front ${on ? 'OPEN' : 'closed'} (${frontCount()}/${MAX_FRONTS})` };
}

// Irreversible actions arm first and execute on a second call. Same pattern as
// the Council Chamber's announce-then-execute: on a live stream there is no
// undo for a world changing hands, and a misclick should cost a confirmation
// rather than a session.
export const ARM_WINDOW_MS = 20000;

export function armAction(action, id, actor) {
  const s = loadReach();
  s.armed = { action, world: id, at: Date.now(), by: actor };
  saveReach();
  return { ok: true, msg: `ARMED: ${action} on ${id}. Repeat within 20s to execute, or disarm.` };
}

export function disarm() {
  const s = loadReach();
  s.armed = null;
  saveReach();
  return { ok: true, msg: 'Disarmed.' };
}

export function isArmedFor(action, id) {
  const s = loadReach();
  if (!s.armed) return false;
  if (s.armed.action !== action || s.armed.world !== id) return false;
  return (Date.now() - s.armed.at) <= ARM_WINDOW_MS;
}

export function flipWorld(id, toSide, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  const wasTaken = w.hive <= 0;
  // The ground under any open window on this world is about to stop existing as
  // a contest. Hand the escrow back before rewriting it.
  const refunds = harvestWindows(id, 'The world changed hands before the window closed. Every credit was returned.');
  w.hive = toSide === 'coalition' ? 0 : 100;
  w.status = toSide === 'coalition' ? 'held' : 'lost';
  w.front = 0;
  if (toSide === 'coalition') w.revealed = 1;   // taking it is how you learn the name
  s.armed = null;
  note(actor, `${id} FLIPPED to ${toSide}`);
  saveReach();
  fireConversion(id, wasTaken, w.hive <= 0);
  return { ok: true, refunds, msg: `${id} → ${toSide.toUpperCase()}${toSide === 'coalition' ? ' (name revealed)' : ''}` };
}

export function setEnvoy(on, actor) {
  const s = loadReach();
  s.envoy = on ? 1 : 0;
  note(actor, `envoy line ${on ? 'OPEN' : 'closed'}`);
  saveReach();
  return { ok: true, msg: `Khai'sultull line ${on ? 'OPEN in contacts' : 'closed'}` };
}

export function setZone(id, idx, patch, actor) {
  const s = loadReach();
  const w = s.worlds[id];
  if (!w) return { ok: false, msg: 'Unknown world: ' + id };
  const z = w.zones[idx];
  if (!z) return { ok: false, msg: 'No zone ' + idx + ' on ' + id };
  if (patch.hive !== undefined) z.hive = clampPct(patch.hive);
  if (patch.intensity !== undefined) z.intensity = clampPct(patch.intensity);
  if (patch.live !== undefined) z.live = patch.live ? 1 : 0;
  // A world's control is the mean of its zones. The front is not a number the
  // GM sets independently of the ground; it is what the ground adds up to.
  w.hive = worldHive(w);
  const wasTaken = false;
  if (w.hive >= 100) w.status = 'lost';
  else if (w.hive <= 0) w.status = 'held';
  else w.status = w.front ? 'contested' : 'quiet';
  note(actor, `${id} zone ${idx} hive ${z.hive}%`);
  saveReach();
  fireConversion(id, wasTaken, w.hive <= 0);
  return { ok: true, msg: `${id} / ${z.name} → hive ${z.hive}%` };
}

// ── Push windows ─────────────────────────────────────────────────────────────
// NOTHING BELOW MOVES A PLAYER'S CASH, and that is deliberate rather than
// incidental. commit() records an amount that the CALLER has already taken, and
// resolve() returns a refund list that the CALLER pays. reach.js stays a state
// machine with no route to a wallet, so there is exactly one file to read to
// know whether the Reach can mint credits, and the answer stays no.

function liveWin(z) {
  return z && z.win && !z.win.resolved ? z.win : null;
}

// Sweep unresolved windows out of the way and hand back every credit in them.
// ANY path that can remove the ground a window is being fought over must call
// this, or the escrow is orphaned: a flip, an accord, a reset. The credits were
// taken from real players and the state they live in is about to be rewritten,
// so the only correct answer is to give them back. Pass null to cover the whole
// Reach.
export function harvestWindows(colonyId, reason) {
  const s = loadReach();
  const ids = colonyId ? [colonyId] : REACH_WORLDS;
  const refunds = [];
  for (const id of ids) {
    const w = s.worlds[id];
    if (!w) continue;
    for (const z of (w.zones || [])) {
      if (!z.win || z.win.resolved) continue;
      for (const [pid, f] of Object.entries(z.win.funders || {}))
        refunds.push({ playerId: pid, name: f.name, amount: f.amt, world: id, zone: z.name });
      z.win.resolved = 'cancelled';
      z.win.outcome = reason || 'Window voided. Every credit returned.';
    }
  }
  if (refunds.length) saveReach();
  return refunds;
}

export function openWindow(colonyId, idx, minutes, actor, force) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world: ' + colonyId };
  const z = w.zones[idx];
  if (!z) return { ok: false, msg: 'No zone ' + idx + ' on ' + colonyId };
  if (!w.front) return { ok: false, msg: 'Open the front on ' + colonyId + ' first.' };
  if (!z.live)  return { ok: false, msg: z.name + ' is quiet. Make it live first.' };
  if (zoneDone(w, z)) return { ok: false, msg: z.name + ' has cleared every wave.' };
  if (z.hive <= 0) return { ok: false, msg: z.name + ' is already held.' };
  if (liveWin(z)) return { ok: false, msg: 'A window is already open on ' + z.name + '.' };
  /* THE WAVE HAS TO HAVE FORMED. This is the only gate in the layer that costs
     time rather than credits, and it is what stops three waves falling in one
     evening on ground meant to cost weeks.

     A REPEL IS NOT GATED, which is why this reads waveAt and nothing else.
     waveAt moves when a wave comes up, not when a window opens, so losing a
     window leaves the ground open to be fought again immediately. Rate limiting
     a loss charges the room twice for it: they already lost the pool and the
     line already moved back.

     BE HONEST ABOUT WHAT THIS IS. The GM is the only actor who can open a
     window at all and force is one argument away, so this is a default rather
     than a rule. It states the intended pace and makes running past it a
     deliberate act that shows up in the log, which is worth having; it is not
     a constraint on anyone who wants to ignore it. */
  const wait = waveFormsIn(z);
  if (wait > 0 && !force) {
    const h = Math.floor(wait / 3600000), m = Math.round((wait % 3600000) / 60000);
    return { ok: false, forming: wait,
      msg: `The next wave on ${z.name} has not formed. ${h}h ${m}m out.` };
  }
  const mins = Math.max(PUSH_MIN_MINS, Math.min(PUSH_MAX_MINS, Number(minutes) || PUSH_DEFAULT_MINS));
  z.win = {
    openedAt: Date.now(),
    closesAt: Date.now() + mins * 60000,
    target: Math.round(pushTarget(effGarrison(w, z), z.hive) * fobBonus(w).price / 100000) * 100000,
    pool: 0,
    funders: {},        // playerId -> { name, amt }
    resolved: null,     // 'carried' | 'repelled' | 'unanswered' once swept
    outcome: null,      // human readable, kept for the panel after the fact
  };
  note(actor, `${colonyId}/${z.name} push window OPEN (${mins}m, wave ${(z.cleared|0)+1}/${(w.waves|0)||WAVES_DEFAULT})`
       + (wait > 0 ? ' [FORCED, wave unformed]' : ''));
  saveReach();
  return { ok: true, msg: `Window open on ${z.name}: ${mins}m, target Ƒ${z.win.target.toLocaleString()}, ${PUSH_MIN_FUNDERS} funders minimum.` };
}

// Cancel an unresolved window. Everything committed comes back: a GM pulling a
// window is not the players failing to answer it.
export function cancelWindow(colonyId, idx, actor) {
  const s = loadReach();
  const z = s.worlds[colonyId] && s.worlds[colonyId].zones[idx];
  const win = liveWin(z);
  if (!win) return { ok: false, msg: 'No open window there.' };
  const refunds = Object.entries(win.funders).map(([id, f]) => ({ playerId: id, name: f.name, amount: f.amt }));
  win.resolved = 'cancelled';
  win.outcome  = 'Window pulled by the Guild. Every credit returned.';
  note(actor, `${colonyId}/${z.name} window CANCELLED, ${refunds.length} refunded`);
  saveReach();
  return { ok: true, msg: `Window pulled on ${z.name}. ${refunds.length} funder(s) refunded.`, refunds };
}

// How much room this player has left in this window. Exported so the caller can
// answer "commit max" without duplicating the cap arithmetic.
export function pushRoom(colonyId, idx, playerId) {
  const s = loadReach();
  const z = s.worlds[colonyId] && s.worlds[colonyId].zones[idx];
  const win = liveWin(z);
  if (!win || Date.now() > win.closesAt) return 0;
  const had = (win.funders[playerId] && win.funders[playerId].amt) || 0;
  return Math.max(0, PUSH_PLAYER_CAP - had);
}

// Record a commitment. The caller has ALREADY debited the player; if this
// returns not-ok the caller must not have debited yet, so every failure path is
// checked before any state is touched.
export function commit(colonyId, idx, playerId, playerName, amount) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  if (!w) return { ok: false, msg: 'Unknown world.' };
  const z = w.zones[idx];
  if (!z) return { ok: false, msg: 'No such engagement.' };
  const win = liveWin(z);
  if (!win) return { ok: false, msg: 'No push window is open on that engagement.' };
  if (Date.now() > win.closesAt) return { ok: false, msg: 'That window has closed.' };
  const amt = Math.floor(Number(amount) || 0);
  if (amt < PUSH_MIN_COMMIT) return { ok: false, msg: `Minimum commitment is Ƒ${PUSH_MIN_COMMIT.toLocaleString()}.` };
  const had = (win.funders[playerId] && win.funders[playerId].amt) || 0;
  if (had + amt > PUSH_PLAYER_CAP)
    return { ok: false, msg: `Ƒ${PUSH_PLAYER_CAP.toLocaleString()} is the most one funder may put into a single window. You have Ƒ${(PUSH_PLAYER_CAP - had).toLocaleString()} left here.` };
  win.funders[playerId] = { name: playerName || 'unknown', amt: had + amt };
  win.pool += amt;
  /* Funding this world is what earns a say on it. Recorded here rather than
     derived from the window rolls later, because a window's roll is trimmed to
     twelve names for display and eligibility must not depend on a display
     concern. */
  if (!w.voters) w.voters = {};
  w.voters[playerId] = { name: playerName || 'unknown', at: Date.now() };
  pruneVoters(w);
  saveReach();
  return {
    ok: true,
    msg: `Ƒ${amt.toLocaleString()} committed to ${z.name}.`,
    pool: win.pool, target: win.target,
    funders: Object.keys(win.funders).length,
    mine: win.funders[playerId].amt,
  };
}

// Windows past their close, not yet resolved. A sweep rather than a timer for
// the same reason as every other sweep in this codebase: PM2 forgets setTimeout
// on restart, and a window that silently never resolves is credits nobody gets
// back and a front that never moves.
export function dueWindows(now) {
  const s = loadReach();
  const out = [];
  const t = now || Date.now();
  for (const id of REACH_WORLDS) {
    const w = s.worlds[id];
    (w.zones || []).forEach((z, i) => {
      if (z.win && !z.win.resolved && t >= z.win.closesAt) out.push({ world: id, zone: i });
    });
  }
  return out;
}

// Resolve one closed window. Returns the refund list for the caller to pay; an
// empty list means the pool burned.
export function resolveWindow(colonyId, idx) {
  const s = loadReach();
  const w = s.worlds[colonyId];
  const z = w && w.zones[idx];
  const win = z && z.win && !z.win.resolved ? z.win : null;
  if (!win) return { ok: false, msg: 'Nothing to resolve.' };

  const funderIds = Object.keys(win.funders);
  const wasTakenWorld = w.hive <= 0;
  let refunds = [];

  if (funderIds.length < PUSH_MIN_FUNDERS) {
    // NOT A FAILED ATTACK. Nobody converged, so nothing was attempted, and
    // charging for it teaches players that funding first is a mistake. Full
    // refund, ground unchanged.
    refunds = funderIds.map(id => ({ playerId: id, name: win.funders[id].name, amount: win.funders[id].amt }));
    win.resolved = 'unanswered';
    win.outcome = `Only ${funderIds.length} of ${PUSH_MIN_FUNDERS} funders answered. The push never formed and every credit was returned.`;
  } else if (win.pool >= win.target) {
    const over = win.target > 0 ? ((win.pool / win.target) - 1) * 100 : 0;
    const gain = Math.max(1, Math.min(24, 12 + Math.floor(over / 10)));
    z.hive = clampPct(z.hive - gain);
    win.resolved = 'carried';
    win.gain = gain;
    win.outcome = `Carried by ${funderIds.length} funders. The line moved ${gain} points.`;
    // Fighting this ground again is what removes a mound. That is the whole
    // asymmetry: our works are permanent because we are taking ground, theirs
    // are reclaimable because they are holding it.
    if (Array.isArray(w.nodes) && w.nodes.length) {
      const before = w.nodes.length;
      w.nodes = w.nodes.filter(n => (n.zone | 0) !== idx);
      if (w.nodes.length < before) {
        win.outcome += ` A brood mound was cleared off it.`;
        note('field', `${colonyId}/${z.name} brood mound cleared`);
      }
    }
    // THE WAVE IS BANKED HERE AND NOWHERE ELSE. Driving the brood off this
    // ground does not finish the zone, it finishes a wave: the next comes up
    // behind it at full control, and the one just cleared can never be taken
    // back because worldHive floors on cleared rather than reading z.hive.
    if (z.hive <= 0) {
      z.cleared = Math.max(0, z.cleared | 0) + 1;
      win.wave = z.cleared;
      const total = Math.max(1, (w.waves | 0) || WAVES_DEFAULT);
      note('field', `${colonyId}/${z.name} WAVE ${z.cleared} BANKED`);
      if (z.cleared < total) {
        z.hive = 100;
        z.waveAt = Date.now();
        win.outcome += ` Wave ${z.cleared} of ${total} is banked and the next is already forming.`;
        w.pendingFob = { zone: idx, at: Date.now() };
      } else {
        z.live = 0;
        win.outcome += ` That was wave ${total} of ${total}. ${z.name} is clear.`;
        w.pendingFob = { zone: idx, at: Date.now() };
      }
    }
  } else {
    const back = Math.max(1, Math.round((4 + effGarrison(w, z) / 20) * fobBonus(w).repel));
    z.hive = clampPct(z.hive + back);
    win.resolved = 'repelled';
    // The brood builds where it held. Durable, and gone the moment a push
    // carries on this ground again.
    if (!Array.isArray(w.nodes)) w.nodes = [];
    w.nodes.push({ zone: idx, at: Date.now() });
    note('field', `${colonyId}/${z.name} brood mound raised`);
    // Ground inside a live wave moves both ways. Banked waves do not, which is
    // why this touches z.hive and never z.cleared.
    win.broodNode = 1;
    win.gain = -back;
    win.outcome = `Repelled. ${funderIds.length} funders raised Ƒ${win.pool.toLocaleString()} of Ƒ${win.target.toLocaleString()} and the brood took back ${back} points.`;
  }

  // The world's control is the mean of its zones, same rule setZone uses. The
  // front is what the ground adds up to, never a number set beside it.
  w.hive = worldHive(w);
  if (w.hive >= 100) w.status = 'lost';
  else if (w.hive <= 0) w.status = 'held';
  else w.status = w.front ? 'contested' : 'quiet';

  note('push', `${colonyId}/${z.name} ${win.resolved} (Ƒ${win.pool.toLocaleString()}, ${funderIds.length} funders)`);
  saveReach();
  fireConversion(colonyId, wasTakenWorld, w.hive <= 0);
  return {
    ok: true, result: win.resolved, refunds,
    zoneName: z.name, pool: win.pool, target: win.target,
    funders: funderIds.length, gain: win.gain || 0,
    outcome: win.outcome, worldTaken: w.hive <= 0,
  };
}

export function setPeace(val, actor) {
  const s = loadReach();
  s.peace = clampPct(val);
  note(actor, `peace ${s.peace}`);
  saveReach();
  return { ok: true, msg: `Peace track → ${s.peace}/100` };
}

export function postDemand(kind, text, hours, actor) {
  const s = loadReach();
  const h = Math.max(0, Math.min(720, Number(hours) || 0));
  s.demand = {
    kind: String(kind || 'tribute'),
    text: String(text || '').slice(0, 600),
    posted: Date.now(),
    deadline: h ? Date.now() + h * 3600000 : null,
    answered: null,
  };
  note(actor, `demand posted (${s.demand.kind})`);
  saveReach();
  return { ok: true, msg: `Demand posted${h ? `, ${h}h deadline` : ', no deadline'}.` };
}

export function answerDemand(answer, actor) {
  const s = loadReach();
  if (!s.demand) return { ok: false, msg: 'No demand outstanding.' };
  s.demand.answered = String(answer || 'ignored');
  note(actor, `demand ${s.demand.answered}`);
  saveReach();
  return { ok: true, msg: `Demand marked ${s.demand.answered}.` };
}

// An accord is not a win button. It freezes the map as it stands: worlds held
// stay held, worlds lost stay lost, and whatever the Khai'sultull were given
// is recorded in the terms for the Council to be furious about.
export function signAccord(terms, actor) {
  const s = loadReach();
  const refunds = harvestWindows(null, 'An accord was signed before the window closed. Every credit was returned.');
  s.accord = { terms: String(terms || '').slice(0, 800), signedAt: Date.now(), by: actor };
  for (const id of REACH_WORLDS) s.worlds[id].front = 0;
  note(actor, 'ACCORD SIGNED');
  saveReach();
  return { ok: true, refunds, msg: `Accord signed. All fronts closed. Map frozen as it stands.${refunds.length ? ` ${refunds.length} open commitment(s) returned.` : ''}` };
}

export function breakAccord(actor) {
  const s = loadReach();
  if (!s.accord) return { ok: false, msg: 'No accord in force.' };
  s.accord = null;
  s.peace = Math.max(0, s.peace - 40);
  note(actor, 'ACCORD BROKEN');
  saveReach();
  return { ok: true, msg: 'Accord broken. Peace track cut by 40.' };
}

export function resetReach(actor) {
  const before = REACH_WORLDS.filter(id => worldTaken(id));
  // Blanking the state destroys every open window, and those windows hold real
  // player credits. Harvest before the blank or the money is simply gone.
  const refunds = harvestWindows(null, 'The Reach was reset. Every credit was returned.');
  STATE = blankState();
  for (const id of before) fireConversion(id, true, false);
  note(actor, 'REACH RESET');
  saveReach();
  return { ok: true, refunds, msg: `Reach reset to unsurveyed.${refunds.length ? ` ${refunds.length} open commitment(s) returned.` : ''}` };
}

// FUNDER NAMES ARE NOT SHIPPED WHILE A WINDOW IS OPEN, only the count and the
// viewer's own total. A live leaderboard of who has put in what turns a
// convergence mechanic into a public shaming board, and the number that matters
// to anyone deciding whether to answer is HOW MANY, not WHO. Names ride along
// once the window has resolved, when the ledger is history rather than pressure.
function winView(win, viewerId) {
  if (!win) return null;
  const open = !win.resolved;
  const ids = Object.keys(win.funders || {});
  return {
    open: open ? 1 : 0,
    closesAt: win.closesAt,
    target: win.target,
    pool: win.pool,
    funders: ids.length,
    mine: viewerId && win.funders[viewerId] ? win.funders[viewerId].amt : 0,
    resolved: win.resolved || null,
    outcome: win.outcome || null,
    gain: win.gain || 0,
    roll: open ? null : ids.map(id => ({ name: win.funders[id].name, amt: win.funders[id].amt }))
                              .sort((a, b) => b.amt - a.amt).slice(0, 12),
  };
}

// A live vote ships its options and HOW MANY have answered, never which way.
// Same rule winView follows for the funder roll: a running tally is pressure and
// a bandwagon, and neither belongs in a decision that is supposed to be the
// room's own. Counts ride along once it has resolved.
function voteView(w, viewerId) {
  const v = w && w.vote;
  if (!v) return null;
  const open = !v.resolved;
  const ids = Object.keys(v.ballots || {});
  return {
    kind: v.kind, question: v.question, options: v.options,
    defaultId: v.defaultId, closesAt: v.closesAt,
    open: open ? 1 : 0,
    ballots: ids.length,
    mine: viewerId && v.ballots[viewerId] ? v.ballots[viewerId].opt : null,
    canVote: viewerId ? (voteEligible(w, viewerId) ? 1 : 0) : 0,
    minBallots: VOTE_MIN_BALLOTS,
    resolved: v.resolved || null,
    result: v.result || null,
    outcome: v.outcome || null,
    tally: open ? null : (v.tally || null),
  };
}

// ── The digest ───────────────────────────────────────────────────────────────
// THE MOST USED THING ON A GM PANEL IS NOT A CONTROL. A GM who runs the whole
// game and drops into the Reach every few days needs "what changed since I last
// looked" before any slider is worth showing, and will read that a hundred
// times for every time garrison gets touched.
//
// TWO HALVES, AND THE SECOND MATTERS MORE. What happened is history and reads
// as a list. What needs you is a decision that is currently waiting, and is the
// only part that costs anything to miss.
function attention(s) {
  const out = [];
  for (const id of REACH_WORLDS) {
    const w = s.worlds[id];
    if (!w) continue;
    const v = w.vote && !w.vote.resolved ? w.vote : null;
    if (v) {
      const hrs = Math.max(0, Math.round((v.closesAt - Date.now()) / 3600000));
      out.push({ world: id, kind: 'vote',
        text: `${id}: a ${v.kind} vote closes in ${hrs}h with ${Object.keys(v.ballots || {}).length} of ${VOTE_MIN_BALLOTS} ballots.` });
    }
    if (w.pendingFob && !v)
      out.push({ world: id, kind: 'fob', text: `${id}: ground is held and no work has been chosen for it.` });
    const burn = fundBurnPerDay(w);
    if (burn > 0) {
      const d = fundDaysLeft(w);
      if (d === 0) out.push({ world: id, kind: 'dry', text: `${id}: the fund is dry and ground is slipping.` });
      else if (d !== Infinity && d < 3)
        out.push({ world: id, kind: 'low', text: `${id}: the fund covers ${d.toFixed(1)} more days.` });
    }
    for (const [i, z] of (w.zones || []).entries()) {
      const win = z.win && !z.win.resolved ? z.win : null;
      if (!win) continue;
      const hrs = Math.max(0, Math.round((win.closesAt - Date.now()) / 3600000));
      const funders = Object.keys(win.funders || {}).length;
      if (funders < PUSH_MIN_FUNDERS)
        out.push({ world: id, kind: 'window',
          text: `${id}/${z.name}: a window closes in ${hrs}h with ${funders} of ${PUSH_MIN_FUNDERS} funders. It will refund.` });
    }
  }
  return out;
}

export function digestFor(actor) {
  const s = loadReach();
  if (!s.seen) s.seen = {};
  const key = String(actor || 'gm');
  const since = s.seen[key] || 0;
  const events = (s.log || []).filter(e => e.t > since);
  return {
    since,
    away: since ? Date.now() - since : 0,
    events: events.slice(0, 60),
    more: Math.max(0, events.length - 60),
    attention: attention(s),
  };
}

// Marking seen is a separate call from reading, so opening the panel twice in a
// row does not blank the digest the second time before it has been read.
export function markSeen(actor) {
  const s = loadReach();
  if (!s.seen) s.seen = {};
  s.seen[String(actor || 'gm')] = Date.now();
  saveReach();
}

// Payload for clients. Unrevealed worlds do not ship their true name: the GM
// panel gets it because the panel is dev-gated, everyone else gets the
// designation and nothing more.
export function reachPayload(forDev, viewerId, devActor) {
  const s = loadReach();
  const worlds = {};
  for (const id of REACH_WORLDS) {
    const w = s.worlds[id];
    worlds[id] = {
      hive: w.hive, front: w.front, status: w.status,
      revealed: w.revealed,
      taken: w.hive <= 0 ? 1 : 0,
      waves: (w.waves | 0) || WAVES_DEFAULT,
      fund: Math.max(0, w.fund || 0),
      eligible: eligibleCount(w),
      // effJade, never w.jade. See the constant block: a stored dial from
      // before the Coalition declared must not put its uniform on the field.
      jade: effJade(s, w),
      jadeDial: forDev ? Math.max(JADE_MIN, Math.min(1, w.jade === undefined ? 1 : w.jade)) : undefined,
      jadeFwd: w.jadeFwd === 0 ? 0 : 1,
      /* THE ROSTER SHIPS ON EVERY WORLD, composed or not, because a client that
         has to ask "is this one of the composed ones" is a client with two code
         paths for drawing a line and only one of them gets exercised. It is
         derived here for the nine that are not, which costs an object per world
         per payload and buys exactly one rendering path.
         `composed` is for the GM panel alone: it is the difference between a
         line somebody chose and a line the model computed, which is the one
         thing the wire cannot show by its shape. */
      roster: FX.rosterWire(rosterOf(s, w)),
      composed: w.roster ? 1 : 0,
      // at ships so the battlefield can seed a work's position from its own
      // identity rather than from its index in this array. Index seeding means
      // raising a fifth work slides the other four sideways mid engagement.
      fobs: (w.fobs || []).map(f => ({ type: f.type, zone: f.zone | 0, at: f.at | 0 })),
      nodes: (w.nodes || []).map(n => ({ zone: n.zone | 0, at: n.at | 0 })),
      pendingFob: w.pendingFob ? 1 : 0,
      fobOpen: fobOpen(w),
      bonus: fobBonus(w),
      mass: nodeMass(w),
      vote: voteView(w, viewerId),
      burn: fundBurnPerDay(w),
      cover: Math.round(fundCover(w) * 1000) / 1000,
      daysLeft: (function (d) { return d === Infinity ? -1 : Math.round(d * 10) / 10; })(fundDaysLeft(w)),
      zones: (w.zones || []).map(z => ({
        name: z.name, hive: z.hive, intensity: z.intensity, live: z.live,
        cleared: z.cleared | 0,
        // Absolute, so a panel counts down between broadcasts rather than
        // reading a remaining-time figure that was only correct when it was
        // sent. The window length ships once at the top of the payload, which
        // keeps one tunable in one place with two readers.
        waveAt: z.waveAt || 0,
        done: zoneDone(w, z) ? 1 : 0,
        // Coverage is a property of the WORLD's fund, replicated onto each zone
        // because the battlefield is handed a zone and forcesFor takes one. The
        // alternative is widening that signature, and the suite lifts forcesFor
        // out and runs it headless, so its shape is load bearing.
        cover: Math.round(fundCover(w) * 1000) / 1000,
        win: winView(z.win, viewerId),
      })),
      garrison: forDev ? w.garrison : undefined,
      effGarrison: forDev
        ? (w.zones || []).map(z => effGarrison(w, z))
        : undefined,
    };
  }
  return {
    worlds,
    envoy: s.envoy,
    peace: s.peace,
    // Not dev-gated: the client needs it to name the army on every surface, and
    // whether the Coalition is at war is not a secret from the people in it.
    coalIn: s.coalIn ? 1 : 0,
    // Who else is fighting, so the panel can show the list rather than making a
    // GM remember what he declared.
    belligerents: FX.belligerentsOf(s),
    accord: s.accord ? { terms: s.accord.terms, signedAt: s.accord.signedAt } : null,
    demand: s.demand,
    fronts: frontCount(), maxFronts: MAX_FRONTS,
    /* THE ROUTE, SHIPPED EXPLICITLY. The worlds object is already built by
       iterating REACH_WORLDS so its key order is the advance, but a panel that
       depends on object key order depends on a language guarantee about string
       keys rather than on anything this file promised. It is also the ONLY
       thing that tells a client which world is nearest the passage - the ids
       do not, and the one whose id says `gate` is now the farthest.
       openAt travels with it because the panel states the unlock rule on the
       card, and a client-side copy of that number is a second authority on when
       a front is allowed. */
    order: REACH_WORLDS.slice(),
    openAt: REACH_OPEN_AT,
    push: { minFunders: PUSH_MIN_FUNDERS, cap: PUSH_PLAYER_CAP, minCommit: PUSH_MIN_COMMIT },
    donate: { cap: DONATE_DAILY_CAP, min: DONATE_MIN, terms: DONATE_TERMS,
              roomLeft: viewerId ? donateRoom(viewerId) : DONATE_DAILY_CAP },
    fund: { taxPerDay: FUND_TAX_PER_DAY, burnPerDay: FUND_BURN_PER_DAY, driftPerDay: FUND_DRIFT_PER_DAY },
    waveFormMs: WAVE_FORM_MS,
    armed: forDev ? s.armed : undefined,
    log: forDev ? s.log.slice(0, 20) : undefined,
    digest: forDev && devActor ? digestFor(devActor) : undefined,
  };
}
