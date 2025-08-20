// server/marketDay.js
// Pre-scripted daily market generator + playback helpers
import crypto from 'crypto';

const TZ = process.env.TZ || 'America/Los_Angeles';
const OPEN_HOUR = 9;   // 9:00
const CLOSE_HOUR = 16; // 16:00
const FRAME_MS = parseInt(process.env.FRAME_MS || '250', 10); // playback granularity

function seededRng(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  let i = 0;
  return () => {
    // xorshift-like from hash bytes
    if (i >= h.length - 8) { h = crypto.createHash('sha256').update(h).digest(); i = 0; }
    let x = 0;
    for (let k = 0; k < 8; k++) x = (x * 256 + h[i++]) >>> 0;
    // map to (0,1)
    return (x + 1) / 4294967297;
  };
}

function normal01(rng) {
  // Box-Muller
  const u = Math.max(rng(), 1e-12);
  const v = Math.max(rng(), 1e-12);
  return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}

function todayOpenCloseMs(now=new Date()) {
  const d = new Date(now);
  d.setMinutes(0,0,0);
  const open = new Date(d); open.setHours(OPEN_HOUR);
  const close = new Date(d); close.setHours(CLOSE_HOUR);
  return [open.getTime(), close.getTime()];
}

const _state = {
  seed: null,
  basePrices: new Map(),  // ticker -> prevClose
  paths: new Map(),       // ticker -> array of frames [{t, p}]
  news: new Map(),        // ticker -> array of {t, headline}
};

export function initDay(seed=null, basePriceProvider=null) {
  // Reset state for the day; lazy-generate per ticker later
  _state.seed = seed ?? Math.floor(Math.random()*1e9);
  _state.paths.clear();
  _state.news.clear();
  _state.basePrices.clear();
  if (basePriceProvider) _state._baseProvider = basePriceProvider;
  return _state.seed;
}

function ensureTickerGenerated(ticker) {
  if (_state.paths.has(ticker)) return;
  // base price
  let prevClose = 100;
  if (_state._baseProvider) {
    const v = _state._baseProvider(ticker);
    if (typeof v === 'number' && v > 0) prevClose = v;
  }
  // build path from open..close at FRAME_MS intervals
  const [openMs, closeMs] = todayOpenCloseMs();
  const steps = Math.max(1, Math.floor((closeMs - openMs) / FRAME_MS));
  const rng = seededRng(_state.seed ^ (ticker.charCodeAt(0) << 5));
  const frames = [];
  let p = prevClose;
  let ema = p;
  for (let i = 0; i <= steps; i++) {
    // drift + noise + occasional shock
    const t = openMs + i*FRAME_MS;
    const drift = 0.00002 * (i/steps - 0.5); // tiny arc
    const noise = 0.0015 * normal01(rng);    // ~0.15% std per frame
    const shock = (rng() < 0.002) ? (0.01 * normal01(rng)) : 0; // rare 1% shock
    const ret = drift + noise + shock;
    p = Math.max(0.01, p * (1 + ret));
    ema = 0.1*p + 0.9*ema;
    frames.push({ t, p: Number(p.toFixed(2)) });
  }
  _state.paths.set(ticker, frames);

  // generate a couple news items aligned to spikes/dips
  const N = Math.min(3, Math.floor(1 + (rng()*3)));
  const headlines = [];
  for (let k=0; k<N; k++) {
    const idx = Math.floor(rng() * (frames.length-2)) + 1;
    const dir = Math.sign(frames[idx].p - frames[idx-1].p) || 1;
    const verb = dir > 0 ? ['surges','climbs','jumps'][Math.floor(rng()*3)] 
                         : ['plunges','sinks','slides'][Math.floor(rng()*3)];
    const cause = dir > 0 ? ['beats forecasts','secures mega-contract','sector upgrade']
                          : ['regulatory probe rumors','missed guidance','exec scandal whispers'];
    headlines.push({ t: frames[idx].t, headline: `${ticker} ${verb} as ${cause}` });
  }
  _state.news.set(ticker, headlines.sort((a,b)=>a.t-b.t));
}

export function currentFrame(ticker, nowMs=Date.now()) {
  ensureTickerGenerated(ticker);
  const frames = _state.paths.get(ticker);
  // clamp to range
  if (!frames || frames.length===0) return { t: nowMs, p: 100 };
  if (nowMs <= frames[0].t) return frames[0];
  if (nowMs >= frames[frames.length-1].t) return frames[frames.length-1];
  // binary search
  let lo=0, hi=frames.length-1;
  while (lo+1<hi) {
    const mid = (lo+hi)>>1;
    if (frames[mid].t <= nowMs) lo = mid; else hi = mid;
  }
  return frames[lo];
}

export function backfill(ticker, nowMs=Date.now(), ms=30000) {
  ensureTickerGenerated(ticker);
  const frames = _state.paths.get(ticker);
  const start = nowMs - ms;
  return frames.filter(f => f.t >= start && f.t <= nowMs);
}

export function dueNews(ticker, lastSentMs, nowMs=Date.now()) {
  ensureTickerGenerated(ticker);
  const list = _state.news.get(ticker) || [];
  return list.filter(n => n.t > (lastSentMs||0) && n.t <= nowMs);
}

export function sessionBounds(now=new Date()) {
  const [openMs, closeMs] = todayOpenCloseMs(now);
  return { openMs, closeMs };
}
