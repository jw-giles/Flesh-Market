
# Flesh Market — Local Everything Bundle

This package includes a **Node.js server** (WebSocket + Express) and a **static client** you can open in your browser.

- Fast procedural market ticks (~2.5× speed)
- Headline-driven price drift (with 1/4 contrarian odds)
- Chatroom
- Leaderboard with XP/leveling
- Transfers with 2% tax sink
- P&L tab
- Searchable company list
- Amber CRT UI
- Simple candlestick chart (canvas)

## 0) Prereqs
- **Node.js 18+** installed (https://nodejs.org)
- Windows: use the `start_server.bat`
- macOS/Linux: use the `start_server.sh` (may need `chmod +x start_server.sh`)

## 1) Start the server
```
cd server
npm install
npm start
```
The server serves the static client and opens a WebSocket on **http://localhost:7777**.

## 2) Open the client
Just navigate to:
- http://localhost:7777

(You can also open `client/index.html` directly, but the WebSocket expects the server above.)

## 3) Basic usage
- Enter a name (top-right) and press **Join**.
- Click a company in the left list to load its chart.
- Place **Buy/Sell** orders in the center.
- Use **Transfer** on the right to wire cash (2% tax is burned).
- Chat in the chatroom.
- Switch to the **P&L** tab for a quick net-worth snapshot.

## 4) Ports / Firewalls
- If you need a different port, set `PORT=8080` (or any port) before starting:
  - Windows PowerShell: `$env:PORT=8080; npm start`
  - macOS/Linux: `PORT=8080 npm start`

## 5) Optional tweaks
- Tick speed: edit `TICK_MS` in `server/server.js`
- Headline cadence: edit `NEWS_MS` in `server/server.js`
- Transfer tax: edit `TAX_RATE` in `server/server.js`
- Max order size: edit `MAX_SHARES_PER_ORDER`

## 6) Persistence
This demo keeps state **in memory** (reset when the server restarts).
If you want cross-session persistence, bolt on a DB (e.g., Postgres + Redis).
I can ship a docker-compose upgrade if you want to persist names/portfolios.

## 7) Troubleshooting
- **Blank page or no data**: Make sure `npm start` is running and you’re visiting `http://localhost:7777` (not the file URL).
- **Port in use**: Choose a different `PORT` (see section 4).
- **Corporate/VPN firewall**: Allow local WebSocket connections.

Enjoy!


Added scripted market server:
- Run with: `node server/server_scripted.js`
- WebSocket endpoint: `/ws` with messages `{type:'sub', ticker:'ORGX'}`
