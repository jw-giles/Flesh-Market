'use strict';
/*
  Card art mapping (client concern; the engine and card data stay art-free).
  Each card resolves to one image:
    - character Assets (people, agents, augments) -> a cyberpunk portrait
    - ships, structures, drones, and spells -> an RPG element face keyed by element
  Art is served as static files under art/, not inlined, so the same mapping works
  for the real in-game client.

  Entry form: defId: ['portrait', name] | ['element', elementKey]
  Cards not listed fall back to their element face (ELEMENT_FALLBACK handles the
  few elements we have no dedicated art for).
*/

const ART_BASE = 'assets/tcg/art/';
const ELEMENT_ART = ['fire', 'water', 'thunder', 'void', 'earth', 'heal', 'plant', 'attack', 'poison', 'sound'];
const ELEMENT_FALLBACK = { soul: 'void', heart: 'poison', light: 'thunder' };

const CARD_ART = {
  // ----- Neutral -----
  n_courier: ['portrait', 'fancy2'],
  n_dockhand: ['portrait', 'techpunk3'],
  n_enforcer: ['portrait', 'gunner1'],
  n_salvager: ['portrait', 'techpunk5'],
  n_mercenary: ['portrait', 'gunner4'],
  n_venom_drone: ['portrait', 'drone1'],
  n_freight_skiff: ['element', 'water'],
  n_guard_post: ['element', 'earth'],
  n_blockade_runner: ['element', 'water'],
  n_war_barge: ['element', 'earth'],
  n_dreadnought: ['element', 'attack'],
  n_plated_hull: ['element', 'earth'],
  // ----- Merchant Guild -----
  dock_runner: ['portrait', 'hacker1'],
  guild_auditor: ['portrait', 'hacker2'],
  g_factor: ['portrait', 'fancy3'],
  g_market_tip: ['element', 'water'],
  hauler_drone: ['element', 'earth'],
  g_freighter: ['element', 'earth'],
  // ----- Syndicate -----
  s_runner: ['portrait', 'hacker3'],
  s_torcher: ['portrait', 'gunner3'],
  s_corsair: ['portrait', 'gunner2'],
  s_twinblade: ['portrait', 'katana1'],
  syndicate_skiff: ['element', 'fire'],
  margin_call: ['element', 'fire'],
  short_squeeze: ['element', 'thunder'],
  // ----- Void Collective -----
  v_revenant: ['portrait', 'techpunk1'],
  void_augment: ['portrait', 'right_arm'],
  void_harvester: ['portrait', 'four_arms'],
  v_collector: ['portrait', 'fancy1'],
  v_corroder: ['portrait', 'mantis_arm'],
  liquidation_notice: ['element', 'void'],
  v_husk: ['element', 'void'],
  // ----- Flesh Station -----
  insolvent_clerk: ['portrait', 'techpunk2'],
  reliquary_acolyte: ['portrait', 'techpunk4'],
  f_leech: ['portrait', 'cyber1'],
  f_acolyte_choir: ['portrait', 'cyber2'],
  f_sanguine_priest: ['portrait', 'fancy4'],
  flesh_tithe: ['element', 'poison'],
  f_siphon: ['element', 'poison'],
  // ----- Coalition -----
  proxy_enforcer: ['portrait', 'gunner1'],
  coalition_marshal: ['portrait', 'katana2'],
  c_field_medic: ['portrait', 'handgun'],
  c_aegis_guard: ['portrait', 'cyber2'],
  c_lightbearer: ['portrait', 'fancy4'],
  c_picket: ['element', 'earth'],
  bull_run: ['element', 'thunder'],
  c_rally: ['element', 'thunder'],
  // ----- Abaddon Collection (legendary; the Masters) -----
  a_beholder: ['master', 'beholder1'],
  a_mindflayer: ['master', 'mindflayer1'],
  a_lich: ['master', 'lich1'],
  a_goat: ['master', 'goatman'],
  a_revenant: ['master', 'revenant1'],
  a_vampire: ['master', 'vampire1'],
  a_warrior: ['master', 'warrior1'],
  a_witch: ['master', 'witch1'],
  a_wizard: ['master', 'wizard1'],
  a_abomination: ['master', 'abomination'],
  // ----- Dwarves (vintage archival portraits) -----
  d_picksman: ['dwarf', 'dwarf1'], d_oremonger: ['dwarf', 'dwarf4'], d_ledgerhand: ['dwarf', 'dwarf2'],
  d_pikeman: ['dwarf', 'soldier1'], d_shieldsman: ['dwarf', 'soldier2'], d_billman: ['dwarf', 'soldier3'],
  d_brawler: ['dwarf', 'fighter1'], d_breaker: ['dwarf', 'fighter2'], d_stoneback: ['dwarf', 'dwarf3'],
  d_deepminer: ['dwarf', 'dwarf5'], d_apprentice_smith: ['dwarf', 'artisan1'], d_toolwright: ['dwarf', 'artisan2'],
  d_porter: ['dwarf', 'traveler1'], d_runner: ['dwarf', 'traveler2'], d_almoner: ['dwarf', 'priest1'],
  d_chaplain: ['dwarf', 'priest2'], d_drummer: ['dwarf', 'musician1'], d_halberdier: ['dwarf', 'soldier4'],
  d_squire: ['dwarf', 'knight1'], d_coppersmith: ['dwarf', 'dwarf6'], d_crossbow: ['dwarf', 'soldier5'],
  d_outrider: ['dwarf', 'traveler3'], d_mason: ['dwarf', 'artisan3'], d_tunneler: ['dwarf', 'dwarf7'],
  d_foreman: ['dwarf', 'artisan4'], d_master_mason: ['dwarf', 'artisan5'], d_piper: ['dwarf', 'musician2'],
  d_hornblower: ['dwarf', 'musician3'], d_confessor: ['dwarf', 'priest3'], d_warpriest: ['dwarf', 'priest4'],
  d_ironguard: ['dwarf', 'knight2'], d_vanguard: ['dwarf', 'knight3'], d_pathfinder: ['dwarf', 'traveler4'],
  d_caravaneer: ['dwarf', 'traveler5'], d_captain: ['dwarf', 'soldier6'], d_berserker: ['dwarf', 'fighter3'],
  d_engineer: ['dwarf', 'artisan6'], d_guildwright: ['dwarf', 'dwarf8'], d_quartermaster: ['dwarf', 'artisan7'],
  d_reliquarian: ['dwarf', 'priest5'], d_grand_artificer: ['dwarf', 'artisan8'], d_maestro: ['dwarf', 'musician4'],
  d_high_almoner: ['dwarf', 'priest6'], d_lord_marshal: ['dwarf', 'knight4'], d_wayfinder: ['dwarf', 'traveler6'],
  d_oracle: ['dwarf', 'priest7'], d_king_underledger: ['dwarf', 'nobledwarf1'], d_high_guildmaster: ['dwarf', 'nobledwarf2'],
  d_lord_treasurer: ['dwarf', 'nobledwarf3'], d_exile_prince: ['dwarf', 'traveler7'],
};

// returns { url, portrait } ; portrait=true means a transparent full figure
function cardArt(defId, def) {
  const m = CARD_ART[defId];
  if (m) {
    if (m[0] === 'portrait') return { url: ART_BASE + 'portraits/' + m[1] + '.png', portrait: true };
    if (m[0] === 'master') return { url: ART_BASE + 'masters/' + m[1] + '.png', portrait: true };
    if (m[0] === 'dwarf') return { url: ART_BASE + 'dwarves/' + m[1] + '.png', portrait: true };
    return { url: ART_BASE + 'elements/' + m[1] + '.png', portrait: false };
  }
  const el = (def && def.element) || 'attack';
  const key = ELEMENT_ART.indexOf(el) >= 0 ? el : (ELEMENT_FALLBACK[el] || 'attack');
  return { url: ART_BASE + 'elements/' + key + '.png', portrait: false };
}

if (typeof window !== 'undefined') window.FleshTCGArt = { cardArt, CARD_ART, ART_BASE };
if (typeof module !== 'undefined' && module.exports) module.exports = { cardArt, CARD_ART, ART_BASE };
