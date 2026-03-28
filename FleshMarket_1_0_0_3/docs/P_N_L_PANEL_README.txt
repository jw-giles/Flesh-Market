Flesh Market – P&L Panel Integration (Injected)

Added files:
  - client/assets/pnl-panel.css
  - client/assets/pnl-panel.js

If the P&L panel doesn't appear, ensure your P&L tab contains:
  <div id="pnl-root"></div>
and the following in your HTML:
  <link rel="stylesheet" href="client/assets/pnl-panel.css">
  <script src="client/assets/pnl-panel.js"></script>
  (Mount snippet was auto-injected if a matching HTML file was found.)

Patched on-trade realized P&L to use MARK-to-market basis by default. Toggle in pnl_stream/pnl-store.js via REALIZE_AGAINST.

UI wired: Unrealized P&L and Close Winners/Losers now use the same REALIZE_AGAINST basis as pnl-store.

Realized P&L now supports negatives. Panel shows them in red.
