
// NPC Trading Strategies (pure functions).
export const Strategies = {
  MomentumChaser(state, ctx) {
    const ret = (state.price - state.ema) / Math.max(1e-6, state.ema);
    const flow = clamp(ret * 15000 * ctx.intensity, -25000, 25000);
    return tagged(flow, "mom");
  },
  MeanReverter(state, ctx) {
    const diff = (state.price - state.sma) / Math.max(1e-6, state.sma);
    const flow = clamp(-diff * 14000 * ctx.intensity, -22000, 22000);
    return tagged(flow, "mean");
  },
  RandomRetail(state, ctx) {
    const jitter = (state.seedRand() - 0.5) * 8000 * ctx.intensity;
    return tagged(jitter, "retail");
  },
  LiquidityProvider(state, ctx) {
    const drift = (state.price - state.last) / Math.max(1e-6, state.last);
    const flow = clamp(-drift * 20000 * ctx.intensity, -18000, 18000);
    return tagged(flow, "mm");
  },
  Whale(state, ctx) {
    const now = state.timeMs;
    const key = `whale:${state.symbol}`;
    const last = ctx.memory.get(key) || 0;
    if (now - last < ctx.cooldowns.whaleMs) return tagged(0, "whale-cd");
    if (state.seedRand() < 0.98) return tagged(0, "whale-idle");
    ctx.memory.set(key, now);
    const dir = state.seedRand() < 0.5 ? -1 : 1;
    const mag = 50000 + state.seedRand() * 120000;
    return tagged(dir * mag * ctx.intensity, "whale");
  },
  NewsSpiker(state, ctx) {
    const now = state.timeMs;
    const key = `news:${state.symbol}`;
    const last = ctx.memory.get(key) || 0;
    const usable = state.news && Math.abs(state.news.sentiment || 0) > 0.25;
    if (!usable || (now - last < ctx.cooldowns.newsSpikerMs)) return tagged(0, "news-idle");
    ctx.memory.set(key, now);
    const sign = Math.sign(state.news.sentiment);
    const mag = 20000 + Math.abs(state.news.sentiment) * 80000;
    return tagged(sign * mag * ctx.intensity, "news");
  }
};

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function tagged(flowUSD, tag) { return { flowUSD, tag }; }
