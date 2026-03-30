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
  const SLIDES = [
    {
      heading: 'TERMINAL ACTIVATED',
      text: `Welcome to the Flesh Market trading network. Your account has been provisioned with an opening balance of <em>Ƒ1,000 Social Credits</em>. This terminal provides access to live stock trading, inter-colony logistics, faction governance, and casino operations. All features are available immediately. Please review the following orientation materials before proceeding.<span class="tut-cursor"></span>`,
      callout: 'OBJECTIVE: Accumulate Social Credits, build influence, and climb the network leaderboard.',
    },
    {
      heading: 'STOCK TRADING',
      text: `The ticker feed on the left panel displays live company prices across all sectors. Select any stock to view its price chart. <em>Market Orders</em> execute at the current price. <em>Limit Orders</em> allow you to specify a target price for automatic execution. Each player is allocated <strong>3 day trades</strong> per market cycle. The news feed below the chart reports events that affect stock prices directly; monitor it for trading signals.`,
      callout: 'The chart displays OHLC candles for the selected stock. Sector indices rotate on a 23-hour cycle.',
    },
    {
      heading: 'PASSIVE INCOME',
      text: `The system distributes passive income payments every <em>30 minutes</em> to all <strong>currently connected</strong> players. Free accounts receive <em>Ƒ25</em> per cycle. Patreon subscribers receive Ƒ500, Ƒ1,500, or Ƒ10,000 depending on tier. Additional bonuses from equipped items, faction membership, and guild participation are applied on top of the base rate. Players must be connected at the time of distribution to receive payment.`,
      callout: 'Passive income requires an active connection. Offline terminals do not receive distributions.',
    },
    {
      heading: 'FACTIONS',
      text: `Three factions operate across the colony network. <em>The Coalition</em> receives Ƒ75 per colony under its control. <em>The Syndicate</em> provides enhanced smuggling returns. <em>Void Collective</em> offers permanent cybernetic conversion with a <em>+Ƒ15 passive bonus</em> per cycle. <span class="warn">Note: Void conversion is irreversible.</span> Faction selection is available through the Galaxy panel. Colony control shifts based on player influence spending.`,
      callout: 'Your faction determines your bonus structure and available perks. Choose accordingly.',
    },
    {
      heading: 'SMUGGLING',
      text: `The Galaxy panel provides access to inter-colony trade lanes. Select a lane, load cargo, and dispatch your shipment. Successful deliveries generate profit based on lane markup. Intercepted shipments result in full cargo loss. The <em>Merchant Guild</em> operates official trade routes; smuggling lanes offer higher margins at higher risk. A <em>15-minute cooldown</em> applies between shipment runs. Lane risk ratings are displayed before dispatch.`,
      callout: 'Higher risk lanes offer better payouts. Interception rates vary by lane and faction control.',
    },
    {
      heading: 'THE CASINO',
      text: `Five casino games are available: Poker, Minesweeper, Chess, Horse Racing, and the Slot Machine. The <em>Slot Machine</em> is the exclusive source of equipment item drops. Items are distributed across five rarity tiers and can be equipped for passive stat bonuses through the inventory panel. Patreon subscribers receive monthly spin allocations based on their tier level.`,
      callout: 'Equipment drops are only available through slot machine spins. Check inventory for equipped item bonuses.',
    },
    {
      heading: 'GUILDS AND LANE SHARES',
      text: `The <em>Merchants Guild</em> (Patreon Tier 2+) provides a stacking income bonus of <em>+1% per active member</em>. Player-created guilds allow capital pooling and proportional profit distribution among shareholders. <strong>Lane Shares</strong> represent permanent equity positions in trade lanes, with 100 slots available per lane on a bonding curve price structure. Dividends are distributed every 30 minutes, subject to faction war modifiers.`,
      callout: 'Guild membership and lane shares provide additional passive income streams.',
    },
    {
      heading: 'THE PRESIDENCY',
      text: `The office of President of The Coalition may be claimed by any player for <strong>Ƒ1,000,000,000</strong>. The sitting President receives <em>Ƒ15,000 per 30-minute cycle</em>, a unique legendary title, and triggers a market-wide bull rally upon election. The presidency can be claimed by any player willing to meet the cost requirement, replacing the current holder.`,
      callout: 'The Presidency is the highest-yield single position available on the network.',
    },
    {
      heading: 'ORIENTATION COMPLETE',
      text: `All systems have been reviewed. The global chat panel is located on the right side of your terminal. The leaderboard updates at the end of each market cycle. All features covered in this orientation are accessible from your main terminal view. This tutorial can be replayed at any time using the <em>Tutorial</em> button in the top navigation bar.<span class="tut-cursor"></span>`,
      callout: 'UNIT-7: Orientation complete. Your terminal is fully operational. Begin when ready.',
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

    // Events
    document.getElementById('tut-next').addEventListener('click', nextSlide);
    document.getElementById('tut-prev').addEventListener('click', prevSlide);
    document.getElementById('tut-skip').addEventListener('click', dismissTutorial);
  }

  function renderSlide() {
    const slide = SLIDES[currentSlide];
    if (!slide) return;

    document.getElementById('tut-heading').innerHTML = slide.heading;
    document.getElementById('tut-text').innerHTML = slide.text;
    document.getElementById('tut-callout').innerHTML = slide.callout;

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
