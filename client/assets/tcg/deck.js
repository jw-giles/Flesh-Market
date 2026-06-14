'use strict';
/*
  Deck data model + validation. Pure logic, no engine dependency.

  A deck is { name, faction, cards:[defId,...] }. v1 rules (all tunable here):
    - exactly DECK_SIZE cards
    - single faction identity: every card is the deck's faction OR 'neutral'
    - at most COPY_LIMIT copies of any one card
    - tokens (summon-only) are never deck-legal
  These are the constraints the server will enforce before a match; the
  deck-builder UI calls the same validateDeck so the client and server agree.
*/

const DECK_SIZE = 20;
const COPY_LIMIT = 2;
const FACTIONS = ['coalition', 'syndicate', 'void', 'guild', 'flesh', 'dwarves', 'abaddon'];

function countCopies(cards) {
  const m = Object.create(null);
  for (const id of cards) m[id] = (m[id] || 0) + 1;
  return m;
}

// returns { ok, errors:[...] }
function validateDeck(deck, CARDS) {
  const errors = [];
  if (!deck || typeof deck !== 'object') return { ok: false, errors: ['no deck'] };
  if (!FACTIONS.includes(deck.faction)) errors.push('unknown faction: ' + deck.faction);
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  if (cards.length !== DECK_SIZE) errors.push('deck has ' + cards.length + ' cards, needs ' + DECK_SIZE);

  const counts = countCopies(cards);
  for (const id of Object.keys(counts)) {
    const def = CARDS[id];
    if (!def) { errors.push('unknown card: ' + id); continue; }
    if (def.token) errors.push(def.name + ' is a token and cannot be in a deck');
    else if (def.faction !== 'neutral' && def.faction !== deck.faction)
      errors.push(def.name + ' is ' + def.faction + ', not legal in a ' + deck.faction + ' deck');
    const lim = def.rarity === 'legend' ? 1 : COPY_LIMIT;
    if (counts[id] > lim) errors.push(def.name + ' x' + counts[id] + ' exceeds copy limit ' + lim);
  }
  return { ok: errors.length === 0, errors };
}

// how many more of this card may be added to this deck right now
function copiesAllowed(deck, defId, CARDS) {
  const def = CARDS[defId];
  if (!def || def.token) return 0;
  if (def.faction !== 'neutral' && def.faction !== deck.faction) return 0;
  if (deck.cards.length >= DECK_SIZE) return 0;
  const have = deck.cards.filter((x) => x === defId).length;
  const lim = def.rarity === 'legend' ? 1 : COPY_LIMIT;
  return Math.max(0, lim - have);
}

// the pool of cards legal for a given faction (faction cards + neutrals, no tokens)
function legalPool(faction, CARDS) {
  return Object.keys(CARDS).filter((id) => {
    const d = CARDS[id];
    return !d.token && (d.faction === 'neutral' || d.faction === faction);
  });
}

function deckStats(deck, CARDS) {
  const curve = {}; let units = 0, tactics = 0, neutral = 0, faction = 0;
  for (const id of deck.cards) {
    const d = CARDS[id]; if (!d) continue;
    const c = Math.min(7, d.cost); curve[c] = (curve[c] || 0) + 1;
    if (d.type === 'unit') units++; else tactics++;
    if (d.faction === 'neutral') neutral++; else faction++;
  }
  return { count: deck.cards.length, curve, units, tactics, neutral, faction };
}

// ---- starter decks: one valid 20-card deck per faction (also used by the AI) ----
const STARTER_DECKS = {
  syndicate: { name: 'Syndicate Aggro', faction: 'syndicate', cards: dup({
    s_runner: 2, n_courier: 2, syndicate_skiff: 2, n_dockhand: 2, margin_call: 2,
    s_torcher: 2, n_enforcer: 2, short_squeeze: 2, n_mercenary: 2, s_corsair: 2 }) },
  guild: { name: 'Guild Tempo', faction: 'guild', cards: dup({
    dock_runner: 2, g_market_tip: 2, n_freight_skiff: 2, guild_auditor: 2, hauler_drone: 2,
    n_salvager: 2, g_factor: 2, n_blockade_runner: 2, g_freighter: 2, n_war_barge: 2 }) },
  void: { name: 'Void Attrition', faction: 'void', cards: dup({
    n_courier: 2, n_dockhand: 2, n_guard_post: 2, v_revenant: 2, n_salvager: 2,
    void_augment: 2, liquidation_notice: 2, v_collector: 2, void_harvester: 2, n_war_barge: 2 }) },
  flesh: { name: 'Flesh Sacrifice', faction: 'flesh', cards: dup({
    insolvent_clerk: 2, n_courier: 2, reliquary_acolyte: 2, n_freight_skiff: 2, f_leech: 2,
    flesh_tithe: 2, n_enforcer: 2, f_acolyte_choir: 2, n_mercenary: 2, n_war_barge: 2 }) },
  coalition: { name: 'Coalition Control', faction: 'coalition', cards: dup({
    c_picket: 2, n_courier: 2, n_guard_post: 2, bull_run: 2, c_field_medic: 2,
    n_enforcer: 2, proxy_enforcer: 2, c_rally: 2, coalition_marshal: 2, n_dreadnought: 2 }) },
  dwarves: { name: 'Dwarf Crew', faction: 'dwarves', cards: dup({
    d_picksman: 2, d_brawler: 2, d_oremonger: 2, d_pikeman: 2, d_drummer: 2,
    d_billman: 2, d_coppersmith: 2, d_stoneback: 2, d_master_mason: 1, d_hornblower: 1,
    d_halberdier: 1, d_king_underledger: 1 }) },
  abaddon: { name: 'Abaddon Boss', faction: 'abaddon', cards: dup({
    a_revenant: 1, a_goat: 1, a_warrior: 1, a_vampire: 1, a_witch: 1,
    a_mindflayer: 1, a_wizard: 1, a_beholder: 1, a_lich: 1, a_abomination: 1,
    n_courier: 2, n_dockhand: 2, n_freight_skiff: 2, n_guard_post: 2, n_plated_hull: 2 }) },
};

function dup(map) {
  const out = [];
  for (const id of Object.keys(map)) for (let i = 0; i < map[id]; i++) out.push(id);
  return out;
}

const _deckApi = { DECK_SIZE, COPY_LIMIT, FACTIONS, validateDeck, copiesAllowed, legalPool, deckStats, STARTER_DECKS };
if (typeof module !== 'undefined' && module.exports) module.exports = _deckApi;
if (typeof window !== 'undefined') window.FleshTCGDeck = _deckApi;
