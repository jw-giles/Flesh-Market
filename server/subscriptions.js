// server/subscriptions.js
// Per-socket single-ticker subscription registry
const sets = new Map(); // ticker -> Set(ws)

export function subscribe(ws, ticker) {
  unsubscribe(ws);
  if (!ticker) return;
  let s = sets.get(ticker);
  if (!s) { s = new Set(); sets.set(ticker, s); }
  s.add(ws);
  ws._ticker = ticker;
}

export function unsubscribe(ws) {
  const t = ws._ticker;
  if (t && sets.has(t)) {
    const s = sets.get(t);
    s.delete(ws);
    if (s.size === 0) sets.delete(t);
  }
  ws._ticker = null;
}

export function fanout(ticker, payloadBuffer) {
  const s = sets.get(ticker);
  if (!s) return 0;
  let sent = 0;
  for (const ws of s) {
    if (ws.readyState === ws.OPEN) { try { ws.send(payloadBuffer); sent++; } catch {} }
  }
  return sent;
}

export function drop(ws) { unsubscribe(ws); }

export function subscribersCount(ticker) {
  const s = sets.get(ticker);
  return s ? s.size : 0;
}
