// server/server_scripted.js
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import url from 'url';
import { fileURLToPath } from 'url';
import { initDay, currentFrame, backfill, dueNews, sessionBounds } from './marketDay.js';
import { subscribe, unsubscribe, fanout, drop } from './subscriptions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const PORT = process.env.PORT || 7777;
const FRAME_MS = parseInt(process.env.FRAME_MS || '250', 10); // playback rate
const BACKFILL_MS = parseInt(process.env.BACKFILL_MS || '60000', 10);

// App
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

app.get('/health', (_req,res)=>res.json({ok:true, mode:'scripted'}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Initialize day
const seed = initDay();
console.log('[scripted] Daily seed =', seed);

wss.on('connection', (ws, req) => {
  ws._lastNewsSent = 0;
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'sub' && msg.ticker) {
        const ticker = String(msg.ticker).toUpperCase();
        subscribe(ws, ticker);

        // Send backfill + snap
        const now = Date.now();
        const bf = backfill(ticker, now, BACKFILL_MS);
        ws.send(JSON.stringify({ type:'backfill', ticker, points: bf.map(f=>[f.t, f.p]) }));
        const fr = currentFrame(ticker, now);
        ws.send(JSON.stringify({ type:'snap', ticker, price: fr.p, t: fr.t }));
      } else if (msg.type === 'unsub') {
        unsubscribe(ws);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type:'pong', t: Date.now() }));
      }
    } catch {}
  });
  ws.on('close', ()=>drop(ws));
});

// Playback loop: iterate all tickers that currently have subscribers.
// To keep it simple and cheap, we just advance time and push the current frame.
const seenTickers = new Set(); // tickers that had any subscriber; we keep timing by demand

setInterval(() => {
  // We cannot iterate subscribers without touching private map; instead, we rely on last requested tickers.
  // A practical approach: remember the last subscribed ticker per socket and tick those tickers.
  // For simplicity here, we tick a small fixed set; in a full build, export list of tickers from subscriptions.js.
}, 1000);

// Simpler: drive per-socket ticker push every FRAME_MS.
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    const tck = ws._ticker;
    if (!tck) continue;
    const fr = currentFrame(tck, now);
    const payload = JSON.stringify({ type:'tick', ticker: tck, price: fr.p, t: fr.t });
    try { ws.send(payload); } catch {}
    // News
    const news = dueNews(tck, ws._lastNewsSent, now);
    for (const n of news) {
      try { ws.send(JSON.stringify({ type:'news', ticker: tck, headline: n.headline, t: n.t })); } catch {}
      ws._lastNewsSent = n.t;
    }
  }
}, FRAME_MS);

server.listen(PORT, () => console.log(`[scripted] Listening on http://localhost:${PORT}`));
