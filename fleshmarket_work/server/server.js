
import express from 'express';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import path from 'path';
import url from 'url';
import fs from 'fs';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Config ---

// ===== Realistic seeded RNG (deterministic) =====
let __SEED = 0x9E3779B9;
function reseed(n){ __SEED = (n>>>0) || 0x9E3779B9; }
function seededRand(){
  // xorshift32
  let x = __SEED >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  __SEED = x >>> 0;
  return (__SEED >>> 0) / 4294967296;
}
let __haveSpare = false, __spare = 0;
function randn(){
  // Box-Muller using seededRand
  if (__haveSpare){ __haveSpare=false; return __spare; }
  let u=0,v=0; while(u===0) u=seededRand(); while(v===0) v=seededRand();
  const r = Math.sqrt(-2.0*Math.log(u)) * Math.cos(2*Math.PI*v);
  __spare = Math.sqrt(-2.0*Math.log(u)) * Math.sin(2*Math.PI*v);
  __haveSpare = true;
  return r;
}

// --- Deterministic market params ---
const MARKET_SEED = 1337;
let TICK_INDEX = 0;
const MARKET_START = Date.now();

function hashStr(s){
  let h = 2166136261 >>> 0;
  for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngSeeded(sym, key){
  let x = (hashStr(String(sym)) ^ hashStr(String(key)) ^ MARKET_SEED) >>> 0;
  // xorshift32
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return ((x >>> 0) / 4294967296);
}
function rangeSeeded(sym, key, a, b){ return a + rngSeeded(sym,key) * (b - a); }
function priceAtFor(c, step){
  // deterministic sinusoid + drift
  const base = c.basePrice;
  const amp = c.amp;
  const w   = c.omega;
  const ph  = c.phase;
  const tr  = c.trend;
  const sin = Math.sin(w*step + ph);
  // tiny hash jitter
  const jit = (rngSeeded(c.symbol, step) - 0.5) * 0.2;
  const p = Math.max(0.5, base + amp*sin + tr*step + jit);
  return p;
}
const PORT = process.env.PORT || 7777;
const TICK_MS = 500;         // market tick ~2.5x "fast"
const NEWS_MS = 7132;        // fast headline cadence
const START_CASH = 10_000;
const TAX_RATE = 0.02;       // 2% transfer tax sink
const MAX_SHARES_PER_ORDER = 50;

// --- App/Static ---
const app = express();

// === Exchange Core: Spec v1 minimal state ===
const TRADE_TAX_BPS = parseInt(process.env.TRADE_TAX_BPS ? process.env.TRADE_TAX_BPS : "25", 10); // 0.25% default (25 bps)
let FMI = { ticker:'FMI', treasury: 0, hourlyTaxAccrual: 0 };

const TICKER_STATE = new Map();
const EOH = new Map();
let __lastHourRecorded = new Date().getHours();

function _ensureTickerState(sym, price) {
  let s = TICKER_STATE.get(sym);
  if (!s) { s = { last_trade: price||1, prev_close: price||1, day_volume: 0, vwap_num: 0, vwap_den: 0, ema_last: price||1, flags: 0 }; TICKER_STATE.set(sym, s); }
  return s;
}
function _recordTrade(sym, price, shares=0) {
  const s = _ensureTickerState(sym, price);
  s.last_trade = price;
  s.day_volume += Math.max(0, Math.floor(shares)||0);
  s.vwap_num += price * (shares||1);
  s.vwap_den += (shares||1);
  s.ema_last = (s.ema_last*0.9) + (price*0.1);
}
function _rollHourIfNeeded(now = new Date()) {
  const h = now.getHours();
  if (h === __lastHourRecorded) return;
  __lastHourRecorded = h;
  const ts_hour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 0, 0).getTime();
  for (const c of companies) {
    const s = _ensureTickerState(c.symbol, c.price);
    const hour_volume = s.day_volume;
    const vwap_hour = s.vwap_den ? (s.vwap_num / s.vwap_den) : s.last_trade;
    const row = { ts_hour, close: s.last_trade, prev_close: s.prev_close, hour_volume, vwap_hour, fmi_tax_collected: FMI.hourlyTaxAccrual|0, flags: 0 };
    if (!EOH.has(c.symbol)) EOH.set(c.symbol, []);
    EOH.get(c.symbol).push(row);
    // prep next hour
    s.prev_close = s.last_trade;
    s.day_volume = 0; s.vwap_num = 0; s.vwap_den = 0;
  }
  FMI.hourlyTaxAccrual = 0;
}

// REST endpoints
app.get('/api/v1/eoh/:ticker', (req, res) => {
  try {
    const sym = String(req.params.ticker||'').toUpperCase();
    const arr = EOH.get(sym) || [];
    let from = req.query.from ? Date.parse(req.query.from) : null;
    let to   = req.query.to   ? Date.parse(req.query.to)   : null;
    res.json(arr.filter(r => (!from || r.ts_hour>=from) && (!to || r.ts_hour<=to)));
  } catch(e){ res.status(500).json({error:'server_error'}); }
});
app.get('/api/v1/state/:ticker', (req,res)=>{
  try {
    const sym = String(req.params.ticker||'').toUpperCase();
    const s = _ensureTickerState(sym, (companies.find(x=>x.symbol===sym)||{}).price||1);
    res.json(s);
  } catch(e){ res.status(500).json({error:'server_error'}); }
});
app.get('/api/v1/fmi', (req,res)=>{ res.json({ ticker: FMI.ticker, treasury: FMI.treasury }); });
app.use('/', express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- Persistence (lightweight JSON autosave) ---
// --- Player persistence (simple tokens) ---
const PLAYERS_FILE = path.join(__dirname, 'players.json');
/** playersById: { [playerId]: { id, name, cash, holdings, xp, level, createdAt, updatedAt } } */
let playersById = Object.create(null);

// Fast index for case-insensitive uniqueness
let nameToId = Object.create(null);

function rebuildNameIndex() {
  nameToId = Object.create(null);
  for (const [id, p] of Object.entries(playersById)) {
    if (!p?.name) continue;
    nameToId[p.name.toLowerCase()] = id;
  }
}

function isNameAvailable(name) {
  const k = String(name||'').trim().toLowerCase();
  if (!k) return false;
  return !nameToId[k];
}

function ensureUniqueName(base) {
  let n = String(base||'Player').trim().slice(0,24);
  if (isNameAvailable(n)) return n;
  // deterministically derive a suffix from uuid without adding length > 24 too much
  // prefer letters only for aesthetics
  function lettersOnly(s){ return (s||'').replace(/[^A-Za-z]/g,''); }
  let tries = 0;
  while (!isNameAvailable(n)) {
    const suf = lettersOnly(uuidv4()).slice(0,4) || 'ABCD';
    n = (String(base||'Player').trim().slice(0,19) + '-' + suf).slice(0,24);
    if (++tries > 20) break;
  }
  return n;
}


function loadPlayersSync() {
  try {
    if (!fs.existsSync(PLAYERS_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(PLAYERS_FILE, 'utf-8'));
    if (data && typeof data === 'object') playersById = data;
    console.log('Players restored from', PLAYERS_FILE, 'count=', Object.keys(playersById).length);
    rebuildNameIndex();
    return true;
  } catch (e) {
    console.error('Failed to load players:', e);
    return false;
  }
}

function savePlayersSync() {
  try {
    fs.writeFileSync(PLAYERS_FILE, JSON.stringify(playersById));
    rebuildNameIndex();
    return true;
  } catch (e) {
    console.error('Failed to save players:', e);
    return false;
  }
}

// Init load
setTimeout(loadPlayersSync, 0);
// Save players periodically (every 60s)
setInterval(savePlayersSync, 60_000);

function createPlayer(name='Player') {
  const id = uuidv4();
  const uniq = ensureUniqueName(name);
  const p = { id, name: uniq, cash: START_CASH, holdings: {}, xp:0, level:1, createdAt: Date.now(), updatedAt: Date.now() };
  playersById[id] = p;
  return p;
}

function getPlayer(id) {
  return playersById[id] || null;
}

function touchPlayer(id) {
  const p = getPlayer(id);
  if (p) { p.updatedAt = Date.now(); }
  return p;
}

// Claim/WhoAmI endpoints (bearer or query token)
app.post('/claim', (req, res) => {
  // Disabled: legacy name-based join removed in favor of login system.
  res.status(410).json({ ok:false, error:'deprecated', message:'Name-based join is disabled. Use proper login.' });
});

function tokenFrom(req) {
  const q = req.query?.token;
  if (q) return String(q);
  const auth = req.headers['authorization'];
  if (auth && String(auth).toLowerCase().startsWith('bearer ')) return String(auth).slice(7);
  return null;
}

app.get('/whoami', (req, res) => {
  const tok = tokenFrom(req);
  const p = tok ? getPlayer(tok) : null;
  if (!p) return res.status(404).json({ ok:false, error:'not_found' });
  res.json({ ok:true, id: p.id, name: p.name, cash:p.cash, holdings:p.holdings, xp:p.xp, level:p.level, updatedAt:p.updatedAt });
});

const STATE_FILE = path.join(__dirname, 'state.json');

function saveStateSync() {
  try {
    const state = {
      companies: companies.map(c => ({
        id: c.id, name: c.name, symbol: c.symbol, price: c.price, drift: c.drift, ohlc: c.ohlc
      })),
      headlines,
      savedAt: Date.now()
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Failed to save state:', e);
    return false;
  }
}

function loadStateSync() {
  try {
    if (!fs.existsSync(STATE_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if (Array.isArray(data?.companies)) {
      // Replace fields on existing companies by index
      for (let i = 0; i < Math.min(companies.length, data.companies.length); i++) {
        const s = data.companies[i];
        const c = companies[i];
        if (!c || !s) continue;
        c.price = typeof s.price === 'number' ? s.price : c.price;
        c.drift = typeof s.drift === 'number' ? s.drift : c.drift;
        c.ohlc = Array.isArray(s.ohlc) ? s.ohlc : c.ohlc;
      }
    }
    if (Array.isArray(data?.headlines)) {
      headlines.splice(0, headlines.length, ...data.headlines.slice(-200));
    }
    console.log('State restored from', STATE_FILE);
    return true;
  } catch (e) {
    console.error('Failed to load state:', e);
    return false;
  }
}

// Try to restore once at boot
setTimeout(loadStateSync, 0);

// Autosave every 60s
setInterval(saveStateSync, 60_000);

// Graceful save on exit signals
for (const sig of ['SIGINT','SIGTERM']) {
  process.on(sig, () => {
    console.log('Received', sig, '— saving state...');
    saveStateSync();
    process.exit(0);
  });
}

// HTTP helpers
app.get('/state', (req, res) => {
  try {
    const ok = {
      companies: companies.map(c => ({ id: c.id, name: c.name, symbol: c.symbol, price: c.price, drift: c.drift })),
      headlines: headlines.slice(-30),
      time: Date.now()
    };
    res.json(ok);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post('/snapshot', (req, res) => {
  const ok = saveStateSync();
  res.json({ saved: ok, file: STATE_FILE });
});


// --- Simple in-memory state (persist while server runs) ---
const rng = (min, max) => Math.random() * (max - min) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// Dystopian illegal-adjacent companies
const COMPANY_NAMES = [
  'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks', 'OrganTech', 'VeinFabrication', 'BoneGroup', 'DarkFutures', 'BlackBiotech', 'GreyLabs', 'PhantomPharma', 'SpecterMedia', 'HollowCorp', 'CrimsonConsortium', 'BloodMarkets', 'ShadowRobotics', 'NullCapital', 'NightMining', 'AshCourier', 'IronIndustries', 'RustLogistics', 'ToxicChains', 'GraveWorks', 'ViceDynamics', 'ObsidianShipping', 'AbyssInsurance', 'CryptSystems', 'WraithNetworks', 'ViralTech', 'NeuroFabrication', 'BioGroup', 'SynthFutures', 'CoreBiotech', 'ChainLabs', 'SalvagePharma', 'SmugglerMedia', 'CartelCorp', 'HazardConsortium', 'DecayMarkets', 'RotRobotics', 'SeverCapital', 'MireMining', 'CorpseCourier', 'LimbIndustries', 'OrganLogistics', 'VeinChains', 'BoneWorks', 'DarkDynamics', 'BlackShipping', 'GreyInsurance', 'PhantomSystems', 'SpecterNetworks', 'HollowTech', 'CrimsonFabrication', 'BloodGroup', 'ShadowFutures', 'NullBiotech', 'NightLabs', 'AshPharma', 'IronMedia', 'RustCorp', 'ToxicConsortium', 'GraveMarkets', 'ViceRobotics', 'ObsidianCapital', 'AbyssMining', 'CryptCourier', 'WraithIndustries', 'ViralLogistics', 'NeuroChains', 'BioWorks', 'SynthDynamics', 'CoreShipping', 'ChainInsurance', 'SalvageSystems', 'SmugglerNetworks', 'CartelTech', 'HazardFabrication', 'DecayGroup', 'RotFutures', 'SeverBiotech', 'MireLabs', 'CorpsePharma', 'LimbMedia', 'OrganCorp', 'VeinConsortium', 'BoneMarkets', 'DarkRobotics', 'BlackCapital', 'GreyMining', 'PhantomCourier', 'SpecterIndustries', 'HollowLogistics', 'CrimsonChains', 'BloodWorks', 'ShadowDynamics', 'NullShipping', 'NightInsurance', 'AshSystems', 'IronNetworks', 'RustTech', 'ToxicFabrication', 'GraveGroup', 'ViceFutures', 'ObsidianBiotech', 'AbyssLabs', 'CryptPharma', 'WraithMedia', 'ViralCorp', 'NeuroConsortium', 'BioMarkets', 'SynthRobotics', 'CoreCapital', 'ChainMining', 'SalvageCourier', 'SmugglerIndustries', 'CartelLogistics', 'HazardChains', 'DecayWorks', 'RotDynamics', 'SeverShipping', 'MireInsurance', 'CorpseSystems', 'LimbNetworks'
];

/** Ensure 1000 companies while keeping display names numberless */
const TARGET_COMPANY_COUNT = 1000;
const NAMES = (() => {
  // sanitize just in case; keep original names visible without digits
  const base = COMPANY_NAMES.map(n => n.replace(/\d+$/, ''));
  const out = [];
  for (let i = 0; i < TARGET_COMPANY_COUNT; i++) {
    out.push(base[i % base.length]);
  }
  return out;
})();



function symbolize(name) {
  // ticker: take letters from words, ensure 3-5 length, uppercase
  const letters = name.replace(/[^A-Za-z ]/g,'').split(' ').map(w => w[0] || '').join('');
  let t = (letters + name.replace(/[^A-Za-z]/g,'')).toUpperCase();
  t = [...new Set(t)].join(''); // keep order, remove repeats
  t = t.slice(0, 4);
  if (t.length < 3) t = (t + 'FMKT').slice(0,3);
  return t;
}

const companies = NAMES.map((n, i) => ({
  id: i,
  name: n,
  symbol: symbolize(n),
  // start price around 8..60
  price: rng(8, 60),
  ohlc: [],
  // log-price & process params
  lnP: 0,          // will set after price
  sigma: 0.03 + seededRand()*0.04,   // daily-ish vol feel
  mu: -0.0005 + seededRand()*0.0015, // small drift
  kappa: 0.04 + seededRand()*0.08,   // mean reversion strength
  sector: (i % 8),                   // 8 sectors
  offset: -0.3 + seededRand()*0.6    // idiosyncratic deviation from sector mean
}));


// Enforce unique letter-only 4-char symbols even when names repeat
(() => {
  const used = new Set();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const c of companies) {
    let sym = c.symbol.replace(/[^A-Z]/g, '').slice(0,4);
    if (sym.length < 3) sym = (sym + 'FMKT').slice(0,3);
    let k = 0;
    while (used.has(sym)) {
      if (k < 26) {
        sym = sym.slice(0,3) + letters[k];
      } else {
        const a = letters[Math.floor((k-26)/26) % 26];
        const b = letters[(k-26) % 26];
        sym = sym.slice(0,2) + a + b;
      }
      k++;
      // Ensure still 3-4 chars
      sym = sym.slice(0,4);
    }
    c.symbol = sym;
    used.add(sym);
  }
})()
// ===== Sector state (8 simple indices) =====
const SECTORS = new Array(8).fill(0).map((_,i)=>({
  lnIndex: Math.log(20 + 20*seededRand()), // starting level
  sigma: 0.015 + seededRand()*0.02,
  mu: -0.0002 + seededRand()*0.0008
}));

// Initialize lnP from price
companies.forEach(c=>{ c.lnP = Math.log(c.price); });
;
const users = new Map(); // id -> {name, cash, holdings: {sym: shares}, badges:Set, xp, level, pnl}
const chat = []; // last messages
const headlines = []; // recent news

function ensureUser(id) {
  const now = Date.now();
  if (!users.has(id)) {
    users.set(id, { 
      id,
      name: 'Guest-' + id.slice(0,4),
      cash: START_CASH,
      holdings: {},
      badges: new Set(),
      xp: 0,
      level: 1,
      pnl: 0,
      updatedAt: now
    });
  } else {
    try { users.get(id).updatedAt = now; } catch(e){}
  }
  return users.get(id);
}


function pushHeadline(text, tone) {
  const item = { id: uuidv4(), t: Date.now(), text, tone };
  headlines.push(item);
  if (headlines.length > 200) headlines.shift();
  broadcast({ type: 'news', data: item });
}

function genHeadline() {
  const c = pick(companies);
  const themesGood = [
    'wins shady procurement contract', 'posts record grey-market profits',
    'secures offshore tax haven', 'announces synthetic organ breakthrough',
    'smuggler network expands into new corridor', 'absorbs competitor quietly',
    'bribes rumored to have streamlined customs'
  ];
  const themesBad = [
    'raided by maritime police', 'exec disappears mid-audit',
    'supply chain seized at border', 'lawsuit over counterfeit implants',
    'pirate tolls spike on key route', 'toxic spill prompts blackout',
    'key bribes fail to clear regulators'
  ];
  const good = Math.random() < 0.5;
  const msg = `${c.symbol}: ${pick(good ? themesGood : themesBad)}`;
  pushHeadline(msg, good ? 'good' : 'bad');

  // 3-in-4 chance price moves in expected direction, 1-in-4 contrarian
  const follow = Math.random() < 0.75 ? (good ? 1 : -1) : (good ? -1 : 1);
  c.drift += follow * rng(0.01, 0.05);
  c.drift = Math.max(-0.08, Math.min(0.12, c.drift));
}

function stepMarket() {

  _rollHourIfNeeded(new Date());
  const now = Date.now();
  // Evolve sectors first (small GBM on log-index)
  for (let s=0; s<SECTORS.length; s++){
    const S = SECTORS[s];
    const eps = randn() * S.sigma;
    S.lnIndex += S.mu + eps;
    // softly vary sector sigma (vol clustering)
    S.sigma = Math.max(0.006, Math.min(0.06, 0.92*S.sigma + 0.08*Math.abs(eps)));
  }
  // Evolve each company
  companies.forEach(c => {
    const S = SECTORS[c.sector||0];
    const base = (S.lnIndex + (c.offset||0));
    const eps = randn() * (c.sigma||0.03);
    // OU on log price around sector base
    c.lnP += (c.mu||0) + (c.kappa||0.06) * (base - c.lnP) + eps;
    // vol clustering
    c.sigma = Math.max(0.01, Math.min(0.12, 0.90*(c.sigma||0.03) + 0.10*Math.abs(eps)));
    // small jump with low probability
    if (seededRand() < 0.01){
      c.lnP += (randn() * 2.0 * (c.sigma||0.03));
    }
    const prev = c.price;
    c.price = Math.max(0.5, Math.exp(c.lnP));
    // candle
    const open = prev;
    const close = c.price;
    const high = Math.max(open, close) + 0.12 + Math.abs(randn()*0.05);
    const low  = Math.max(0.5, Math.min(open, close) - 0.12 - Math.abs(randn()*0.05));
    if (!Array.isArray(c.ohlc)) c.ohlc = [];
    c.ohlc.push({ t: now, o: open, h: high, l: low, c: close, v: 0 });
    if (c.ohlc.length > 400) c.ohlc.shift();
  });
  broadcast({ type: 'tick', data: companies.map(({id,name,symbol,price})=>({id,name,symbol,price})) });

}



function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

function leaderboard() {

  const cutoff = Date.now() - 2*60*1000; // last 2 minutes = "current"
  const arr = Array.from(users.values())
    .filter(u => (u.updatedAt||0) >= cutoff)
    .map(u => {
      const equity = Object.entries(u.holdings||{}).reduce((acc,[sym,qty]) => {
        const c = companies.find(x => x.symbol === sym);
        return acc + (c ? c.price*qty : 0);
      }, 0);
      const net = u.cash + equity;
      return { id: u.id, name: u.name, net, xp: (u.xp||0), level: (u.level||1) };
    });
  arr.sort((a,b)=>b.net-a.net);
  return arr.slice(0, 20);
}


// Timers
setInterval(stepMarket, TICK_MS);

function broadcastLeaderboard(){ try{ broadcast({ type:'leaderboard', data: leaderboard() }); }catch(e){} }
setInterval(broadcastLeaderboard, 5000);

setInterval(genHeadline, NEWS_MS);

// --- WebSocket protocol ---
// {type:'order', side:'buy'|'sell', symbol, shares}
// {type:'transfer', toName, amount}
// {type:'chart', symbol}
// {type:'chat', text}
// {type:'request_state'}
wss.on('connection', (ws, req) => {
  // Attach player if token present in query (?token=...)
  try {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const tok = urlObj.searchParams.get('token');
    let player = tok ? getPlayer(tok) : null;
    if (!player) {
      const name = urlObj.searchParams.get('name') || 'Player'; // uniqueness enforced in createPlayer
      player = createPlayer(name);
      console.log('Auto-created player for connection', player.id);
    }
    ws._playerId = player.id;
    touchPlayer(player.id);
    try { ws.send(JSON.stringify({ type:'hello', data: { playerId: player.id, name: player.name } })); } catch {}
  } catch (e) {
    console.warn('Player attach failed:', e);
  }

  const id = uuidv4();
  const user = ensureUser(id);
  user.updatedAt = Date.now();
  ws._ephemeralUserId = id;
// Mirror persisted player into ephemeral user for live views
try {
  if (ws._playerId && playersById[ws._playerId]) {
    const p = playersById[ws._playerId];
    user.name = p.name;
    user.cash = p.cash;
    user.holdings = Object.assign({}, p.holdings || {});
  }
} catch(e) { console.warn('mirror persisted player failed', e); }


  // greet
  ws.send(JSON.stringify({ type: 'welcome', data: { id, name: user.name, cash: user.cash } }));
  // send snapshot
  ws.send(JSON.stringify({ type: 'init', data: { tick: TICK_INDEX, marketStart: MARKET_START,
    companies: companies.map(c => ({id:c.id, name:c.name, symbol:c.symbol, price:c.price})),
    headlines,
    leaderboard: leaderboard()
  }}));

   
  try { ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio.call(ws, ensureUser(id)) })); } catch(e) {}
ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    // Heartbeat from clients keeps them "current" for leaderboard
    if (msg.type === 'ping') {
      const u = ensureUser(id);
      u.updatedAt = Date.now();
      // Throttle: don't spam broadcasts; only every 5 seconds
      if (!u._lastPingBroadcast || (Date.now() - u._lastPingBroadcast) > 5000) {
        u._lastPingBroadcast = Date.now();
        broadcast({ type: 'leaderboard', data: leaderboard() });
      }
      return;
    }


    const u = ensureUser(id);
    u.updatedAt = Date.now();
    const actor = (ws._playerId && playersById[ws._playerId]) ? playersById[ws._playerId] : u;
    if (msg.type === 'casino') {
      try {
        if (typeof msg.sync === 'number' && Number.isFinite(msg.sync)) {
          actor.cash = Math.max(0, Number(msg.sync));
          savePlayersSync();
          ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio.call(ws, actor) }));
          ws.send(JSON.stringify({ type: 'me', data: { id, name: actor.name, cash: actor.cash } }));
        }
      } catch(e){ console.warn('casino sync failed', e); }
    }
    if (msg.type === 'order') {
      const { side, symbol, shares } = msg;
      const s = String(symbol || '').toUpperCase();
      const qty = Math.max(1, Math.min(Number(shares)||0, MAX_SHARES_PER_ORDER));
      const c = companies.find(x => x.symbol === s);
      if (!c || !qty) return;
      if (side === 'buy') {
        const cost = c.price * qty;
        const tax = Math.floor(cost * TRADE_TAX_BPS / 10000);
        const total = cost + tax;
        if (actor.cash >= total) {
          actor.cash -= total;
          FMI.treasury += tax; FMI.hourlyTaxAccrual += tax;
          actor.holdings[s] = (actor.holdings[s]||0) + qty;
          actor.xp += 1;
        }
      } else if (side === 'sell') {
        const have = actor.holdings[s]||0;
        if (have >= qty) {
          actor.holdings[s] = have - qty;
          if (actor.holdings[s] <= 0) { delete actor.holdings[s]; }
          const gross = c.price * qty;
          const tax = Math.floor(gross * TRADE_TAX_BPS / 10000);
          u.cash += (gross - tax);
          FMI.treasury += tax; FMI.hourlyTaxAccrual += tax;
          actor.xp += 1;
        }
      }
      actor.level = 1 + Math.floor(actor.xp/25);
      ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio.call(ws, actor) }));
      broadcast({ type: 'leaderboard', data: leaderboard() });
    }


    if (msg.type === 'transfer') {
      const { toName, amount } = msg;
      const amt = Math.max(1, Math.floor(Number(amount)||0));
      if (!toName || !amt) return;
      const fee = Math.ceil(amt * TAX_RATE);
      const total = amt + fee;
      if (actor.cash < total) return;
      // find or create recipient by name (simple demo)
      let recipient = Object.values(playersById || {}).find(x => x.name === toName);
      if (!recipient) { const p = createPlayer(toName.slice(0,20)); recipient = p; }
      actor.cash -= total;
      recipient.cash += amt;
      actor.xp += 2;
      ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio.call(ws, actor) }));
      broadcast({ type: 'leaderboard', data: leaderboard() });
      pushHeadline(`${u.name} wired ¤${amt} to ${recipient.name} (¤${fee} tax sink)`, 'neutral');
    }

    if (msg.type === 'chart') {
      const { symbol } = msg;
      const s = String(symbol||'').toUpperCase();
      const c = companies.find(x => x.symbol === s);
      if (c) ws.send(JSON.stringify({ type: 'chart', data: { symbol: s, ohlc: c.ohlc.slice(-200) } }));
    }

    if (msg.type === 'request_state') {
      ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio.call(ws, actor) }));
      ws.send(JSON.stringify({ type: 'leaderboard', data: leaderboard() }));
    }

    if (msg.type === 'chat') {
      const text = String(msg.text||'').slice(0, 240);
      if (!text) return;
      const item = { id: uuidv4(), t: Date.now(), user: u.name, text };
      chat.push(item);
      if (chat.length > 200) chat.shift();
      broadcast({ type: 'chat', data: item });
    }
  });

  ws.on('close', () => {
    try {
      const id = ws._ephemeralUserId;
      if (id && users.has(id)) {
        users.delete(id);
        broadcast({ type: 'leaderboard', data: leaderboard() });
      }
    } catch(e){}
  });
});

function snapshotPortfolio(u) {
  // If the user has a persisted playerId, prefer that state
  if (this && this._playerId && playersById[this._playerId]) {
    const p = playersById[this._playerId];
    const positions = Object.entries(p.holdings).filter(([sym,qty])=>qty>0).map(([sym,qty]) => {
      const c = companies.find(x => x.symbol === sym);
      const px = c ? c.price : 0;
      return { sym, qty, px, val: px*qty };
    });
    const equity = positions.reduce((a,p)=>a+p.val,0);
    const net = p.cash + equity;
    return { cash: p.cash, positions, equity, net, xp: p.xp, level: p.level };
  }

  const positions = Object.entries(actor.holdings).filter(([sym,qty])=>qty>0).map(([sym,qty]) => {
    const c = companies.find(x => x.symbol === sym);
    const px = c ? c.price : 0;
    return { sym, qty, px, val: px*qty };
  });
  const equity = positions.reduce((a,p)=>a+p.val,0);
  const net = u.cash + equity;
  return { cash: u.cash, positions, equity, net, xp: actor.xp, level: actor.level };
}


// Lightweight health check endpoint for ops
app.get('/health', (req, res) => {
  try {
    const uptime = process.uptime();
    res.json({ status: 'ok', uptime, companies: companies?.length ?? 0, users: users?.size ?? 0, time: Date.now() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: String(e) });
  }
});

// Check name availability
app.get('/name_available', (req, res) => {
  // Disabled: legacy name availability check not used.
  res.status(410).json({ ok:false, error:'deprecated' });
});

// Rename current player (requires token)
app.post('/rename', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const name = (req.query.name || req.headers['x-name'] || '')+'';
    if (!name.trim()) return res.status(400).json({ ok:false, error:'invalid_name' });
    if (!isNameAvailable(name)) return res.status(409).json({ ok:false, error:'name_taken' });
    // Update index: remove old, add new
    delete nameToId[p.name.toLowerCase()];
    p.name = ensureUniqueName(name); // ensureUniqueName will return requested name if free
    nameToId[p.name.toLowerCase()] = p.id;
    p.updatedAt = Date.now();
    savePlayersSync();
    res.json({ ok:true, id:p.id, name:p.name });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});
server.listen(PORT, () => {
  console.log(`Flesh Market server running at http://localhost:${PORT}`);
  console.log(`Serving static client from /client`);
});