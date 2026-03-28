# FleshMarket v0.9.5 — Local Bundle

Node.js server (WebSocket + Express) + static client. Runs locally on any OS.

**Requires Node.js v22.5 or newer** — the server uses the built-in `node:sqlite` module added in Node 22.5. Older versions will not work.

---

## Quick Start

### Linux / macOS
```bash
cd server
chmod +x start_server.sh
./start_server.sh
```

### Windows
Double-click `server/start_server.bat` or from a terminal:
```
cd server
start_server.bat
```

Open **http://localhost:7777**

---

## Installing Node.js v22.5+

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# macOS
brew install node

# Any platform (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22
```

---

## Configuration

On first run, `server/.env` is created from `.env.example`. Edit it to configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | 7777 | Port the server listens on |
| `TRADE_TAX_BPS` | 25 | Transfer tax in basis points (25 = 0.25%) |
| `DEV_ACCOUNTS` | (empty) | Comma-separated dev account names. Must include `MrFlesh` — e.g. `MrFlesh,DEV-FIXER` |
| `PATREON_WEBHOOK_SECRET` | (empty) | Leave blank for local dev |

---

## Client Architecture (v0.9.5)

`client/index.html` is a thin shell (~102 KB). All game logic lives in separate files under `client/assets/`.

### Script and CSS Load Order

```
GLOBAL CSS
  style.css                     base layout, colours, fonts, tab/button primitives
  assets/eod-timer.css          end-of-day countdown timer styles

CASINO CSS  (loaded upfront so panes render correctly on first switch)
  assets/casino-roulette.css
  assets/casino-poker.css
  assets/casino-sudoku.css
  assets/casino-mathgame.css
  assets/casino-minesweeper.css

CORE
  assets/core.js                WebSocket, market engine, candlestick chart, tab routing,
                                leaderboard, player state. Sets global: ws, el(), $all(),
                                marketAPI, TICKERS, window.CURRENT, window.__myPlayerId_store,
                                window.__isAdmin_g

MODALS
  assets/sell-modal.css
  assets/market-orders.js       __SellModal and __BuyModal controllers
  [inline]                      sell button DOMContentLoaded wiring
  [inline]                      __PENDING_SALES reconciliation
  assets/short-modal.css
  assets/shorts.js              __Short modal, borrow-fee UI

CHAT
  assets/chat-ui.js             tab switching, room dot indicators
  [inline]                      room/channel state init
  assets/block-users.js         client-side block list

TRADE WIRING
  [inline]                      marketAPI compat shim (must precede trade-limit.js)
  assets/trade-limit.js         3-trades-per-30min rate limiter
  [inline]                      ws message relay for trade-limit

SERVER-MANAGED
  /daytrade_reset_on_refresh.js served by server.js, resets day-trade counter
  [inline]                      leaderboard WS message swallow

AUTH + PERSISTENCE
  assets/fm-auth.js             login/register flow, token management
  assets/leaderboard-local.js   [defer] local leaderboard cache
  assets/funds.js               guild and hedge fund UI
  assets/market-state.js        localStorage helpers, full tab switcher (all 12 tabs),
                                Sets global: window.showTab(), window.getBalance(),
                                window.setBalance(), window.moneyFmt()

SOUND + HUD
  [inline]                      countdown timer
  assets/toast.css
  assets/sound.js               Web Audio engine, V5_SECTOR_NAMES constant, heatmap renderer

ADMIN
  assets/mod-panel.css
  [inline]                      mod panel open/close
  [inline]                      lazy loader (injects galaxy.js, inventory.js, casino scripts)

LATE PANELS
  assets/god-panel.css
  assets/god-panel.js           dev/admin god panel (DEV_ACCOUNTS only)
  assets/inventory.css
  assets/player-profile.css
  assets/player-profile.js      player profile popup

LAZY-LOADED  (injected by the lazy loader on first tab/subtab click)
  assets/galaxy.js              galaxy map, factions, colony UI — triggers on galactic tab
  assets/inventory.js           inventory, slot machine, item market, pixel art data (331 KB)
                                triggers on inventory or store tab
  assets/casino-blackjack.js    loads eagerly on page load (second-most-visited casino tab)
  assets/casino-poker.js        loads on first poker subtab click
  assets/casino-chess.js        loads on first chess subtab click
  assets/casino-sudoku.js       loads on first sudoku subtab click
  assets/casino-mathgame.js     loads on first mathgame subtab click
  assets/casino-minesweeper.js  loads on first minesweeper subtab click
```

---

## Server Tuning

Edit constants near the top of `server/server.js`:

| Constant | Default | Description |
|---|---|---|
| `TICK_MS` | — | Market tick speed |
| `NEWS_MS` | — | Headline cadence |
| `EARNINGS_INTERVAL_MS` | 8 min | Earnings event frequency |
| `IPO_INTERVAL_MS` | 90 min | IPO window frequency |
| `DIVIDEND_INTERVAL_MS` | 2 hr | Dividend payout cycle |
| `BORROW_INTERVAL_MS` | 30 min | Short borrow fee interval |
| `INCOME_INTERVAL_MS` | 30 min | Passive income from equipped items |

---

## Basic Usage

1. Open http://localhost:7777
2. Enter a username and press Join
3. Click a company to load its chart; Buy/Sell to trade
4. Limit Orders panel for set-price orders
5. Transfer tab — wire cash between players (2% tax burned)
6. Heat tab — full market heatmap
7. P&L tab — net worth chart and sector breakdown
8. Casino — Roulette, Blackjack, Poker, Chess, Sudoku, Math Quiz, Minesweeper
9. Galaxy — faction map, colony funding, dividend bonuses
10. Inventory — equipped items, slot machine, item market
11. Guild — hedge funds, proposals, member management

---

## Troubleshooting

**`node:sqlite` error** — Node.js too old. Run `node --version`, need v22.5+. Fix: `nvm install 22 && nvm use 22`

**Blank page / no market data** — Server is not running, or you opened the HTML file directly. Use http://localhost:7777.

**Galaxy map blank on first click** — Hard refresh (Ctrl+Shift+R). If it persists, check console for a `galaxy.js` 404.

**Port already in use** — The launch script handles this automatically. Manual fix: `PORT=8080 node --experimental-sqlite server.js`

---

## Persistence

All player data is stored in `server/fleshmarket.db` (SQLite). Survives server restarts. Delete the `.db` file to wipe and start fresh.

## Dev Accounts

```bash
cd server
node seed_devaccounts.mjs
```

Dev account names must also be set in `DEV_ACCOUNTS` in `.env`. `MrFlesh` is the prime/owner account.
