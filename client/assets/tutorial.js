/* ═══════════════════════════════════════════════════════════════════════════
   TUTORIAL — UNIT-7 Onboarding Protocol
   A callous robot walks new players through every mechanic.
   Triggered on first login (tutorial_seen === false in welcome msg).
   ═══════════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── Robot portrait as inline SVG data URI ────────────────────────────────
  // To use a custom image instead, change this to a file path like:
  // const PORTRAIT_SRC = 'assets/space/ui/tutorial_portrait.png';
  const PORTRAIT_SRC = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
<rect width="80" height="80" fill="#060808"/>
<rect x="16" y="8" width="48" height="10" rx="2" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="28" y="4" width="4" height="6" fill="#1a3a1a"/>
<rect x="48" y="4" width="4" height="6" fill="#1a3a1a"/>
<circle cx="32" cy="11" r="2" fill="#2a6a2a"/>
<circle cx="48" cy="11" r="2" fill="#2a6a2a"/>
<rect x="38" y="9" width="4" height="4" rx="1" fill="#3a8a3a" opacity=".6"/>
<rect x="12" y="20" width="56" height="40" rx="3" fill="#0a0f0a" stroke="#1a3a1a" stroke-width="1"/>
<rect x="14" y="22" width="52" height="36" rx="2" fill="#080c08"/>
<rect x="24" y="28" width="12" height="8" rx="1" fill="#0a1a0a" stroke="#2a6a2a" stroke-width=".7"/>
<rect x="44" y="28" width="12" height="8" rx="1" fill="#0a1a0a" stroke="#2a6a2a" stroke-width=".7"/>
<circle cx="30" cy="32" r="3" fill="#1a3a1a"/>
<circle cx="30" cy="32" r="1.5" fill="#3aff3a" opacity=".9"/>
<circle cx="50" cy="32" r="3" fill="#1a3a1a"/>
<circle cx="50" cy="32" r="1.5" fill="#3aff3a" opacity=".9"/>
<rect x="26" y="32" width="8" height=".5" fill="#3aff3a" opacity=".15"/>
<rect x="46" y="32" width="8" height=".5" fill="#3aff3a" opacity=".15"/>
<rect x="34" y="39" width="12" height="2" rx="1" fill="#1a2a1a"/>
<rect x="36" y="39" width="2" height="2" fill="#2a4a2a"/>
<rect x="40" y="39" width="2" height="2" fill="#2a4a2a"/>
<rect x="44" y="39" width="2" height="2" fill="#2a4a2a"/>
<line x1="30" y1="43" x2="30" y2="48" stroke="#1a3a1a" stroke-width=".5"/>
<line x1="40" y1="43" x2="40" y2="48" stroke="#1a3a1a" stroke-width=".5"/>
<line x1="50" y1="43" x2="50" y2="48" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="22" y="48" width="36" height="4" rx="1" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="26" y="49" width="4" height="2" fill="#2a4a2a" opacity=".5"/>
<rect x="32" y="49" width="4" height="2" fill="#2a4a2a" opacity=".5"/>
<rect x="38" y="49" width="4" height="2" fill="#3a8a3a" opacity=".7"/>
<rect x="44" y="49" width="4" height="2" fill="#2a4a2a" opacity=".5"/>
<rect x="50" y="49" width="4" height="2" fill="#2a4a2a" opacity=".5"/>
<rect x="8" y="30" width="6" height="16" rx="1" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="66" y="30" width="6" height="16" rx="1" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="9" y="34" width="4" height="3" fill="#2a4a2a" opacity=".4"/>
<rect x="67" y="34" width="4" height="3" fill="#2a4a2a" opacity=".4"/>
<rect x="20" y="62" width="16" height="10" rx="2" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="44" y="62" width="16" height="10" rx="2" fill="#0a1a0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="36" y="58" width="8" height="6" fill="#0a0f0a" stroke="#1a3a1a" stroke-width=".5"/>
<rect x="22" y="65" width="3" height="3" fill="#1a3a1a" opacity=".4"/>
<rect x="27" y="65" width="3" height="3" fill="#1a3a1a" opacity=".4"/>
<rect x="46" y="65" width="3" height="3" fill="#1a3a1a" opacity=".4"/>
<rect x="51" y="65" width="3" height="3" fill="#1a3a1a" opacity=".4"/>
<line x1="12" y1="76" x2="68" y2="76" stroke="#1a3a1a" stroke-width=".3" opacity=".3"/>
</svg>`)}`;

  // ── Tutorial slide data ──────────────────────────────────────────────────
  // tab: if set, clicks the matching .tab[data-tab] button to switch tabs
  // galaxySub: if set, clicks the galaxy sub-tab (e.g. 'shipping', 'factions')
  const SLIDES = [
    {
      heading: 'TERMINAL ACTIVATED',
      text: `Welcome to the Flesh Market trading network. Your account has been provisioned with an opening balance of <em>Ƒ1,000 Social Credits</em>. This terminal provides access to live stock trading, inter-colony shipping, faction warfare, casino operations, and an item marketplace. All features are available immediately.<span class="tut-cursor"></span>`,
      callout: 'OBJECTIVE: Accumulate Social Credits, build influence, and climb the network leaderboard.',
      tab: 'market',
    },
    {
      heading: 'STOCK TRADING',
      text: `The ticker feed on the left displays live prices across <em>180+ companies</em> in 8 sectors. Click any stock to view its <em>real-time waveform chart</em> and a detail panel showing sector, HQ colony, dividend status, and your position. Use the <em>★ Watchlist</em> button to filter to your favorites. Prices drift slowly — trends develop over <strong>hours, not minutes</strong>. <em>Market Orders</em> execute instantly. <em>Limit Orders</em> let you set a target price and reserve cash. You get <strong>3 day trades</strong> per 30-minute cycle.`,
      callout: 'Scalping is penalized. Buying and selling the same stock in one cycle costs 2x trade tax.',
      tab: 'market',
    },
    {
      heading: 'MARKET TOOLS',
      text: `Below Limit Orders, <em>Price Alerts</em> let you set notifications for when a stock crosses a target price. The <em>News Feed</em> on the left reports earnings, colony events, and market activity — use the filter bar to search by keyword or tone. The news feed nudges prices, so watch for earnings reports and colony disruptions.`,
      callout: 'Set a price alert on any ticker. You will hear a sound and see a toast when it triggers.',
      tab: 'market',
    },
    {
      heading: 'SHORT SELLING',
      text: `You can <em>short sell</em> stocks you don't own using the <em>⬇ Short</em> button. Shorting sells borrowed shares at the current price — you profit when the price drops. Short positions require <strong>50% cash collateral</strong> (margin) and incur a <em>0.1% borrow fee</em> every 30 minutes. Maximum <strong>500 shares short</strong> per symbol. Cover your short by buying back the shares. <span class="warn">Unlimited downside risk if the price rises.</span>`,
      callout: 'Short selling is advanced. Your cash is drained by borrow fees until you cover.',
      tab: 'market',
    },
    {
      heading: 'DIVIDENDS AND ANALYSIS',
      text: `Every stock pays <em>dividends every 2 hours</em>. Finance, Insurance, Energy, and Tech sectors pay <em>0.6%</em> of position value. All other sectors pay <em>0.2%</em>. Faction colony bonuses can boost rates further. The <em>🔥 Heatmap</em> tab shows the entire market color-coded by daily performance. The <em>P&L</em> tab tracks your net worth over time with a donut chart, position breakdown, sector exposure, and <em>performance metrics</em> including max drawdown and win rate.`,
      callout: 'Passive income (Ƒ25/30min for free accounts) requires an active connection. Holding pays.',
      tab: 'heat',
    },
    {
      heading: 'THE GALAXY',
      text: `The <em>Sector Map</em> shows all 21 colonies, their faction control, and tension levels. Colonies are the foundation of everything: faction funding, shipping routes, and dividend bonuses all flow through them. High tension colonies trigger stock drops for headquartered companies. Click any colony on the map to see its details, control percentages, and headquartered companies.`,
      callout: 'Colony tension above 50% starts hitting stock prices. Above 90% it gets critical.',
      tab: 'galactic',
      galaxySub: 'map',
    },
    {
      heading: 'FACTIONS',
      text: `Three factions compete for colony control. <em style="color:#4ecdc4">The Coalition</em> focuses on stability — control both endpoints of a route for -5% risk. <em style="color:#e74c3c">The Syndicate</em> gets +15% smuggling payout but +5% risk on their own turf. <em style="color:#9b59b6">Void Collective</em> earns 2% of all intercepted cargo as raid income, plus permanent cybernetic conversion with +Ƒ15 passive bonus. <span class="warn">Void conversion is irreversible.</span> All factions earn <em>Ƒ15 per controlled colony</em> every 30 minutes. Faction allegiance is locked for <strong>30 days</strong> after joining.`,
      callout: 'Fund colony control to shift influence. When a faction hits 75%, a 24-hour conquest timer starts.',
      tab: 'galactic',
      galaxySub: 'factions',
    },
    {
      heading: 'SHIPPING LANES',
      text: `Move cargo between colonies for profit two ways. <em style="color:#3498db">Shipping</em> is legal commerce — choose a route, pick a cargo tier (Standard ×1.15, Premium ×1.25, Luxury ×1.35), and stake your credits. <em>Insurance</em> costs 5–12% but refunds your stake if cargo is lost. <em style="color:#e74c3c">Smuggling</em> is high-risk contraband with massive payouts up to ×3. Base risk ranges from 15% to 55% depending on lane type. <strong>Lane Shares</strong> let you buy permanent equity in any lane on a bonding curve — dividends flow every 30 minutes. All runs share a <strong>15-minute cooldown</strong>.`,
      callout: 'Blockaded lanes block shipping entirely. Smuggling still works but at +10% extra risk.',
      tab: 'galactic',
      galaxySub: 'shipping',
    },
    {
      heading: 'THE STORE',
      text: `The Store tab contains four sections. <em>Titles</em> — purchasable display titles from Ƒ1K to Ƒ50M that show beside your name. <em>Inventory</em> — equip items across 9 gear slots for passive income bonuses. <em>Ƒbay</em> — a player marketplace to buy and sell items. <em>🎰 Slots</em> — the slot machine is the exclusive source of <strong>equipment drops</strong>. Items come in six rarity tiers from Common to Phantom. Every <strong>9 completed day trades</strong> earns a free spin. Patreon members receive monthly spin grants.`,
      callout: 'Equip a full set (Neon Syndicate, Chrome Corp, etc.) for stacking set bonuses.',
      tab: 'store',
    },
    {
      heading: 'THE CASINO',
      text: `Eight casino games are available. <em>Roulette</em> — 13 bet types with animated wheel. <em>Blackjack</em> — 6-deck shoe with card tracking. <em>Poker</em> — Texas Hold'em 6-max vs AI. <em>Horse Racing</em>, <em>Chess</em>, <em>Sudoku</em>, <em>Math Quiz</em>, and <em>Minesweeper</em>. All games use your Social Credit balance directly — wins are real, losses are real. No house tokens, no abstraction.`,
      callout: 'Casino winnings are the fastest way to grow early. Also the fastest way to go broke.',
      tab: 'casino',
    },
    {
      heading: 'SOCIAL AND ECONOMY',
      text: `The chat panel on the right has channels: <em>Global</em> (5 rooms), <em>Premium</em> (Patreon), <em>Guild</em> (Tier 2+), <em>Whisper</em> (private), and <em>Unmod</em> (18+, unfiltered). <em>Wire Credits</em> lets you send money to other players — <strong>12-hour cooldown</strong>, 2% base tax, and <strong>90% Guild surcharge</strong> above Ƒ10,000. Player-created <strong>Hedge Funds</strong> pool capital with proportional profit sharing. The <em>Merchants Guild</em> (Patreon Tier 2+) grants stacking dividend bonuses. The <em>Presidency</em> costs Ƒ1 billion and pays Ƒ15,000 per cycle.`,
      callout: 'The leaderboard freezes each 30-minute cycle. XP is earned through trading activity.',
      tab: 'market',
    },
    {
      heading: 'ORIENTATION COMPLETE',
      text: `All systems reviewed. The key principles: <em>holding pays dividends</em>, <em>shipping builds steady income</em>, <em>smuggling is a gamble</em>, <em>scalping gets taxed</em>, and <em>shorts bleed fees</em>. Use the <em>★ Watchlist</em> to track stocks, set <em>Price Alerts</em> for targets, check the <em>🔥 Heatmap</em> for market-wide moves, and review <em>P&L</em> for your performance metrics. Report bugs through the 🐛 tab. This tutorial replays via the <em>? Tutorial</em> button in the header.<span class="tut-cursor"></span>`,
      callout: 'UNIT-7: Orientation complete. Your terminal is fully operational. Begin when ready.',
      tab: 'market',
    },
  ];

  const SPEAKER_NAME = 'UNIT-7';
  const SPEAKER_TITLE = 'Onboarding Protocol // Flesh Market Terminal Services';

  let currentSlide = 0;
  let overlayEl = null;

  // ── Build the modal DOM ──────────────────────────────────────────────────
  function buildModal() {
    if (document.getElementById('tutorial-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.innerHTML = `
      <div id="tutorial-modal">
        <div class="tut-portrait-row">
          <div class="tut-portrait" id="tut-portrait-frame">
            <img src="${PORTRAIT_SRC}" alt="UNIT-7" style="width:100%;height:100%;object-fit:cover;image-rendering:pixelated;">
          </div>
          <div class="tut-speaker">
            <div class="tut-speaker-name">${SPEAKER_NAME}</div>
            <div class="tut-speaker-title">${SPEAKER_TITLE}</div>
          </div>
        </div>
        <div class="tut-body">
          <h3 class="tut-heading" id="tut-heading"></h3>
          <p class="tut-text" id="tut-text"></p>
          <div class="tut-callout" id="tut-callout"></div>
        </div>
        <div class="tut-steps" id="tut-steps"></div>
        <div class="tut-controls">
          <button class="tut-skip" id="tut-skip">SKIP TUTORIAL</button>
          <div style="display:flex;gap:8px">
            <button class="tut-btn" id="tut-prev" style="display:none">◂ PREV</button>
            <button class="tut-btn primary" id="tut-next">NEXT ▸</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlayEl = overlay;

    // Build step dots
    const dotsEl = document.getElementById('tut-steps');
    for (let i = 0; i < SLIDES.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'tut-dot' + (i === 0 ? ' active' : '');
      dot.dataset.idx = i;
      dotsEl.appendChild(dot);
    }

    // Events — skip/prev use addEventListener, next is set dynamically in renderSlide
    document.getElementById('tut-prev').addEventListener('click', prevSlide);
    document.getElementById('tut-skip').addEventListener('click', dismissTutorial);
  }

  function renderSlide() {
    const slide = SLIDES[currentSlide];
    if (!slide) return;

    document.getElementById('tut-heading').innerHTML = slide.heading;
    document.getElementById('tut-text').innerHTML = slide.text;
    document.getElementById('tut-callout').innerHTML = slide.callout;

    // Navigate to the correct tab by clicking its button directly
    if (slide.tab) {
      try {
        var tabBtn = document.querySelector('.tab[data-tab="' + slide.tab + '"]');
        if (tabBtn) tabBtn.click();
      } catch(e) {}
    }
    // Navigate to galaxy sub-tab if specified (after a short delay for lazy load)
    if (slide.galaxySub) {
      setTimeout(function() {
        try {
          var subBtn = document.querySelector('[data-gstab="' + slide.galaxySub + '"]');
          if (subBtn) subBtn.click();
        } catch(e) {}
      }, 300);
    }

    // Update dots
    const dots = document.querySelectorAll('.tut-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === currentSlide);
      d.classList.toggle('seen', i < currentSlide);
    });

    // Prev/Next button states
    const prevBtn = document.getElementById('tut-prev');
    const nextBtn = document.getElementById('tut-next');
    prevBtn.style.display = currentSlide > 0 ? '' : 'none';

    if (currentSlide === SLIDES.length - 1) {
      nextBtn.textContent = 'BEGIN TRADING';
      nextBtn.onclick = dismissTutorial;
    } else {
      nextBtn.textContent = 'NEXT ▸';
      nextBtn.onclick = nextSlide;
    }

    // Re-trigger slide animation
    const body = document.querySelector('.tut-body');
    body.style.animation = 'none';
    body.offsetHeight; // reflow
    body.style.animation = 'tutSlideUp .3s ease';
  }

  function nextSlide() {
    if (currentSlide < SLIDES.length - 1) {
      currentSlide++;
      renderSlide();
    }
  }

  function prevSlide() {
    if (currentSlide > 0) {
      currentSlide--;
      renderSlide();
    }
  }

  function dismissTutorial() {
    if (overlayEl) {
      overlayEl.classList.remove('active');
      overlayEl.style.display = 'none';
    }
    // Persist to server
    const token = window.FM_TOKEN || window.ME?.token || window.ME?.id;
    if (token) {
      fetch('/api/tutorial/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
  }

  function showTutorial() {
    buildModal();
    currentSlide = 0;
    renderSlide();
    overlayEl.classList.add('active');
    overlayEl.style.display = 'flex';
  }

  // ── Hook into welcome message ───────────────────────────────────────────

  function checkTutorial(msg) {
    if (msg && msg.type === 'welcome' && msg.data && msg.data.id) {
      if (!msg.data.tutorial_seen) {
        setTimeout(showTutorial, 600);
      }
    }
  }

  // ── Attach to WS message stream ─────────────────────────────────────────
  // core.js dispatches 'fm_ws_msg' on document for every parsed WS message.
  document.addEventListener('fm_ws_msg', (e) => {
    checkTutorial(e.detail);
  });

  // ── Expose for replay from settings / god panel ─────────────────────────
  window.showTutorial = showTutorial;
  window.dismissTutorial = dismissTutorial;

})();
