// FleshMarket TCG - pack economy (server-authoritative).
// The server owns prices, rarity odds, and the shiny roll; the client only
// displays results. Tune PACKS freely; prices are in Ƒ (player cash).
//
// cards.js is a dual CommonJS/browser file (module.exports + window global).
// Load it through createRequire so it always resolves on the CommonJS loader,
// independent of Node's ESM syntax-detection. A plain default import of this
// file returns undefined on Node 22.5/22.6 (no auto-detect), which would crash
// the server on boot; createRequire works on every supported Node.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CARDS } = require('../../client/assets/tcg/cards.js');

const RARITY_ORDER = ['common', 'rare', 'epic', 'legend'];

// Prices are in Ƒ (player cash) and are the main economy lever; tune freely.
// Curve assumes a typical player clears ~100k in a few days and is a millionaire
// inside a week or two, so anything that reliably rolls Epic/Legend is priced high.
export const PACKS = {
  starter: {
    id: 'starter', name: 'Starter Pack', price: 25000, size: 5,
    weights: { common: 88, rare: 11, epic: 1, legend: 0 },
    dwarfBias: 0.15,                       // Dwarves much rarer in the cheap on-ramp pack
    floorSlots: 0,                         // no guarantee; cheap on-ramp
    shiny: 0.02,
    blurb: 'Five cards. Cheap entry, mostly commons. Rarely better.',
  },
  standard: {
    id: 'standard', name: 'Standard Pack', price: 150000, size: 5,
    weights: { common: 64, rare: 28, epic: 7, legend: 1 },
    dwarfBias: 0.4,                        // Dwarves reduced in the mid pack
    floorRarity: 'rare', floorSlots: 1,    // at least one rare-or-better
    shiny: 0.04,
    blurb: 'Five cards. At least one Rare. Small chance of Shiny.',
  },
  premium: {
    id: 'premium', name: 'Premium Pack', price: 750000, size: 5,
    weights: { common: 35, rare: 42, epic: 18, legend: 5 },
    dwarfBias: 0.8,                        // Dwarves only lightly reduced at the premium tier
    floorRarity: 'epic', floorSlots: 1,    // at least one epic-or-better
    shiny: 0.09,
    blurb: 'Five cards, strong odds. At least one Epic. Higher Shiny chance.',
  },
  guild_crate: {
    id: 'guild_crate', name: 'Guild Crate', price: 500000, size: 5,
    faction: 'dwarves',                    // pulls only from the Dwarves set
    weights: { common: 52, rare: 34, epic: 11, legend: 3 },
    floorRarity: 'rare', floorSlots: 1,
    shiny: 0.10,
    blurb: 'Five Dwarves only. At least one Rare. Best for building the Dwarf deck.',
  },
  vault: {
    id: 'vault', name: 'The Vault', price: 5000000, size: 5,
    weights: { common: 15, rare: 35, epic: 35, legend: 15 },
    floorRarity: 'legend', floorSlots: 1,  // guarantees at least one Legendary
    shiny: 0.15,
    blurb: 'Five cards, top odds. Guaranteed Legendary. Highest Shiny chance.',
  },
};

// deck-legal pools grouped by rarity (tokens excluded). buildPool(filter) lets a
// pack draw from a restricted slice (e.g. a faction-only crate).
function buildPool(filter) {
  const p = { common: [], rare: [], epic: [], legend: [] };
  for (const id of Object.keys(CARDS)) {
    const c = CARDS[id];
    if (c.token) continue;
    if (filter && !filter(c)) continue;
    const r = c.rarity || 'common';
    if (p[r]) p[r].push(id);
  }
  return p;
}
const POOL = buildPool(null);
const POOL_BY_FACTION = {};
function poolFor(pack) {
  if (!pack.faction) return POOL;
  if (!POOL_BY_FACTION[pack.faction]) POOL_BY_FACTION[pack.faction] = buildPool((c) => c.faction === pack.faction);
  return POOL_BY_FACTION[pack.faction];
}

function weightedRarity(weights, rng) {
  let total = 0;
  for (const r of RARITY_ORDER) total += (weights[r] || 0);
  let x = rng() * total;
  for (const r of RARITY_ORDER) {
    const w = weights[r] || 0;
    if (w <= 0) continue;
    if (x < w) return r;
    x -= w;
  }
  return 'common';
}

// rarity restricted to floorRarity-and-above, weights preserved
function floorWeights(weights, floorRarity) {
  const minIdx = RARITY_ORDER.indexOf(floorRarity);
  const w = {};
  for (let i = 0; i < RARITY_ORDER.length; i++) {
    const r = RARITY_ORDER[i];
    w[r] = i >= minIdx ? (weights[r] || 0) : 0;
  }
  // if the configured weights gave the floor band zero mass, force the floor rarity
  let any = false;
  for (const r of RARITY_ORDER) if (w[r] > 0) any = true;
  if (!any) w[floorRarity] = 1;
  return w;
}

function pickCard(rarity, rng, pool, dwarfBias) {
  pool = pool || POOL;
  dwarfBias = (dwarfBias == null) ? 1 : dwarfBias;
  let band = pool[rarity];
  if (!band || !band.length) {
    // fall back down to the nearest non-empty band within this pool
    for (let i = RARITY_ORDER.indexOf(rarity); i >= 0; i--) {
      if (pool[RARITY_ORDER[i]] && pool[RARITY_ORDER[i]].length) { band = pool[RARITY_ORDER[i]]; break; }
    }
  }
  if (!band || !band.length) return undefined;
  if (dwarfBias === 1) return band[Math.floor(rng() * band.length)];
  // weighted pick: down-weight (or up-weight) Dwarves within the rolled rarity band
  let total = 0;
  const w = new Array(band.length);
  for (let i = 0; i < band.length; i++) {
    const c = CARDS[band[i]];
    w[i] = (c && c.faction === 'dwarves') ? dwarfBias : 1;
    total += w[i];
  }
  let x = rng() * total;
  for (let i = 0; i < band.length; i++) { if (x < w[i]) return band[i]; x -= w[i]; }
  return band[band.length - 1];
}

// Returns an array of { card, variant, rarity } of length pack.size.
export function rollPack(packId, rng = Math.random) {
  const pack = PACKS[packId];
  if (!pack) throw new Error('unknown pack: ' + packId);
  const pool = poolFor(pack);
  const out = [];
  for (let i = 0; i < pack.size; i++) {
    const guaranteed = i >= pack.size - (pack.floorSlots || 0);
    const weights = guaranteed ? floorWeights(pack.weights, pack.floorRarity) : pack.weights;
    const rarity = weightedRarity(weights, rng);
    const card = pickCard(rarity, rng, pool, pack.dwarfBias);
    const variant = rng() < (pack.shiny || 0) ? 'shiny' : 'normal';
    out.push({ card, variant, rarity: CARDS[card] ? (CARDS[card].rarity || 'common') : rarity });
  }
  return out;
}

export function packInfo() {
  return Object.values(PACKS).map((p) => ({ id: p.id, name: p.name, price: p.price, size: p.size, blurb: p.blurb }));
}

export function packPrice(packId) { return PACKS[packId] ? PACKS[packId].price : null; }
