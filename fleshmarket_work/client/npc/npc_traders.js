
import { Strategies } from './strategies.js';

export function createNPCEngine(opts = {}) {
  const config = opts.config || null;
  let settings = null;
  let lastStepMs = 0;
  const memory = new Map();
  const rnd = mulberry32(opts.seed || 1337);
  const onVolume = typeof opts.onVolume === 'function' ? opts.onVolume : () => {};

  async function loadConfig() {
    if (settings) return settings;
    if (config) { settings = config; return settings; }
    settings = await fetchJSON('npc_config.json', {
      enabled: true, tick_ms: 250, globalIntensity: 1.0, maxAgents: 100,
      liquidity: 50000, impact: 0.0025, noise: 0.1,
      inventoryLimitUSD: 200000, cooldowns: { newsSpikerMs: 15000, whaleMs: 45000 },
      strategyMix: { MomentumChaser: 0.3, MeanReverter: 0.25, RandomRetail: 0.25, LiquidityProvider: 0.15, Whale: 0.03, NewsSpiker: 0.02 }
    });
    return settings;
  }

  const agentPool = [];
  let built = false;

  function buildAgents(cfg) {
    if (built) return;
    const mix = normalizeMix(cfg.strategyMix);
    const names = Object.keys(mix);
    for (let i = 0; i < cfg.maxAgents; i++) {
      const pick = pickWeighted(names, names.map(n => mix[n]), rnd);
      agentPool.push({ strategy: pick, inventoryUSD: 0 });
    }
    built = true;
  }

  function apply(symbol, stateIn) {
    if (!stateIn || !stateIn.price || !symbol) return zeroResp();
    const now = stateIn.timeMs || Date.now();
    if (now - lastStepMs <  (settings?.tick_ms || 250)) return zeroResp();
    lastStepMs = now;

    const seedRand = stateIn.seedRand || (() => rnd());
    const state = { ...stateIn, symbol, mid: stateIn.price, seedRand };

    const cfg = settings;
    let net = 0;
    let tags = {};
    const ctxBase = {
      liquidity: cfg.liquidity,
      intensity: cfg.globalIntensity,
      inventoryLimitUSD: cfg.inventoryLimitUSD,
      cooldowns: cfg.cooldowns,
      memory
    };

    for (let i = 0; i < agentPool.length; i++) {
      const a = agentPool[i];
      const stratFn = Strategies[a.strategy];
      if (!stratFn) continue;
      const ctx = { ...ctxBase, inventory: a.inventoryUSD };
      const { flowUSD, tag } = stratFn(state, ctx);
      if (flowUSD !== 0) {
        const after = a.inventoryUSD + flowUSD;
        if (Math.abs(after) <= ctx.inventoryLimitUSD) {
          a.inventoryUSD = after;
          net += flowUSD + gaussian(0, cfg.noise * 1000.0, seedRand);
          tags[tag] = (tags[tag] || 0) + flowUSD;
        }
      }
    }

    const pressure = Math.tanh(net / Math.max(1e-6, cfg.liquidity));
    const dPrice = state.price * (cfg.impact * pressure);
    const vol = Math.abs(net) / Math.max(1, state.price);
    try { onVolume(symbol, vol); } catch (_) {}

    return { dPrice, pressure, netFlowUSD: net, debug: { byTag: tags, agents: agentPool.length } };
  }

  function zeroResp() { return { dPrice: 0, pressure: 0, netFlowUSD: 0, debug: { byTag: {}, agents: agentPool.length } }; }

  async function init() { const cfg = await loadConfig(); buildAgents(cfg); return api; }
  function getSnapshot() { return { settings, agentPool: agentPool.map(a => ({ strategy: a.strategy, inventoryUSD: Math.round(a.inventoryUSD) })) }; }
  function restoreSnapshot(snap) {
    if (!snap) return;
    settings = snap.settings || settings;
    if (snap.agentPool && Array.isArray(snap.agentPool)) {
      agentPool.length = 0;
      for (const a of snap.agentPool) agentPool.push({ strategy: a.strategy, inventoryUSD: a.inventoryUSD || 0 });
      built = true;
    }
  }
  const api = { init, apply, getSnapshot, restoreSnapshot };
  return api;
}

async function fetchJSON(url, fallback) {
  try { const r = await fetch(url); if (!r.ok) throw new Error(r.statusText); return await r.json(); }
  catch (e) { return fallback; }
}
function normalizeMix(m) { const out = {}; let s = 0; for (const k in m) s += m[k]; for (const k in m) out[k] = m[k] / (s || 1); return out; }
function pickWeighted(items, weights, rnd) { const r = rnd(); let acc = 0; for (let i = 0; i < items.length; i++) { acc += weights[i]; if (r <= acc) return items[i]; } return items[items.length - 1]; }
function gaussian(mu, sigma, rand) { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v); return mu + z * sigma; }
function mulberry32(a) { return function(){ var t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
