/**
 * mobile.js — FleshMarket Mobile Enhancements
 * Collapsible panel sections, mobile bottom nav, touch optimizations.
 * Only activates at ≤900px viewport width.
 */
(function(){
'use strict';

const IS_MOBILE = () => window.innerWidth <= 900;

// ═══════════════════════════════════════════════════════════════════════════════
// 1. COLLAPSIBLE SECTIONS — tickers/news/chat collapse on mobile
// ═══════════════════════════════════════════════════════════════════════════════

function wrapCollapsible(containerSelector, headingText, startCollapsed) {
  const container = document.querySelector(containerSelector);
  if (!container) return;

  // Don't double-wrap
  if (container.previousElementSibling && container.previousElementSibling.classList.contains('fm-collapse-head')) return;

  const head = document.createElement('div');
  head.className = 'fm-collapse-head' + (startCollapsed ? ' collapsed' : '');
  head.textContent = headingText;

  container.classList.add('fm-collapse-body');
  if (startCollapsed) container.classList.add('collapsed');

  container.parentNode.insertBefore(head, container);

  head.addEventListener('click', () => {
    const isCollapsed = head.classList.toggle('collapsed');
    container.classList.toggle('collapsed', isCollapsed);
  });
}

function initCollapsibles() {
  if (!IS_MOBILE()) return;

  // Wrap the left panel sections
  const leftPanel = document.querySelector('.grid > .panel:first-child');
  if (leftPanel) {
    // Find the tickers list and news
    const tickerH2 = leftPanel.querySelector('h2');
    const tickerList = leftPanel.querySelector('#tickers');
    const searchInput = leftPanel.querySelector('#search');
    const watchBar = leftPanel.querySelector('#watchlist-bar');
    const newsDiv = leftPanel.querySelector('#news');

    // Wrap tickers section (search + watchlist + list)
    if (tickerList && !tickerList.dataset.mobileWrapped) {
      tickerList.dataset.mobileWrapped = '1';
      const tickerWrap = document.createElement('div');
      tickerWrap.className = 'fm-collapse-body';
      tickerWrap.id = 'mobile-ticker-wrap';
      // Move search, watchlist bar, and ticker list into wrap
      if (watchBar) tickerWrap.appendChild(watchBar);
      if (searchInput) tickerWrap.appendChild(searchInput);
      tickerWrap.appendChild(tickerList);
      // Also move news filter if present
      const newsFilter = leftPanel.querySelector('#newsFilter');
      if (newsFilter && newsFilter.parentElement) {
        // The filter wrap is after the News h2, leave it there
      }
      const insertBefore = leftPanel.querySelector('hr') || leftPanel.querySelector('h2:nth-of-type(2)');
      if (insertBefore) leftPanel.insertBefore(tickerWrap, insertBefore);
      else leftPanel.appendChild(tickerWrap);

      const head = document.createElement('div');
      head.className = 'fm-collapse-head';
      head.textContent = 'Companies';
      tickerWrap.parentNode.insertBefore(head, tickerWrap);
      // Hide the original h2 to avoid duplicate heading
      if (tickerH2) tickerH2.style.display = 'none';
      head.addEventListener('click', () => {
        const c = head.classList.toggle('collapsed');
        tickerWrap.classList.toggle('collapsed', c);
      });
    }

    // Wrap news section
    if (newsDiv && !newsDiv.dataset.mobileWrapped) {
      newsDiv.dataset.mobileWrapped = '1';
      // Hide original News h2 and hr separator
      const newsH2 = Array.from(leftPanel.querySelectorAll('h2')).find(h => h.textContent.trim() === 'News');
      if (newsH2) newsH2.style.display = 'none';
      const hr = leftPanel.querySelector('hr');
      if (hr) hr.style.display = 'none';
      // Also hide the news filter wrap (it's between h2 and #news) — move it inside the collapsible
      const newsFilterWrap = newsH2 && newsH2.nextElementSibling;
      if (newsFilterWrap && newsFilterWrap.id !== 'news' && newsFilterWrap.querySelector('#newsFilter')) {
        newsDiv.insertBefore(newsFilterWrap, newsDiv.firstChild);
      }
      const newsHead = document.createElement('div');
      newsHead.className = 'fm-collapse-head collapsed';
      newsHead.textContent = 'News Feed';
      newsDiv.classList.add('fm-collapse-body', 'collapsed');
      newsDiv.parentNode.insertBefore(newsHead, newsDiv);
      newsHead.addEventListener('click', () => {
        const c = newsHead.classList.toggle('collapsed');
        newsDiv.classList.toggle('collapsed', c);
      });
    }
  }

  // Make transfer section collapsible
  const xferSection = document.querySelector('#transferSection');
  if (xferSection && !xferSection.dataset.mobileWrapped) {
    xferSection.dataset.mobileWrapped = '1';
    const xHead = document.createElement('div');
    xHead.className = 'fm-collapse-head collapsed';
    xHead.textContent = 'Wire Credits';
    const xBody = document.createElement('div');
    xBody.className = 'fm-collapse-body collapsed';
    // Move children into body
    while (xferSection.firstChild) xBody.appendChild(xferSection.firstChild);
    xferSection.appendChild(xHead);
    xferSection.appendChild(xBody);
    xHead.addEventListener('click', () => {
      const c = xHead.classList.toggle('collapsed');
      xBody.classList.toggle('collapsed', c);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. MOBILE BOTTOM NAV — quick tab switching
// ═══════════════════════════════════════════════════════════════════════════════

function initMobileNav() {
  if (document.getElementById('mobileNav')) return;

  const nav = document.createElement('div');
  nav.id = 'mobileNav';
  nav.innerHTML = `<div class="mnav-items">
    <button class="mnav-btn active" data-mtab="market" onclick="mobileNavTo('market')">
      <span class="mnav-icon">📊</span>Market
    </button>
    <button class="mnav-btn" data-mtab="heat" onclick="mobileNavTo('heat')">
      <span class="mnav-icon">🔥</span>Heat
    </button>
    <button class="mnav-btn" data-mtab="casino" onclick="mobileNavTo('casino')">
      <span class="mnav-icon">🎰</span>Casino
    </button>
    <button class="mnav-btn" data-mtab="galactic" onclick="mobileNavTo('galactic')">
      <span class="mnav-icon">⬡</span>Galaxy
    </button>
    <button class="mnav-btn" data-mtab="store" onclick="mobileNavTo('store')">
      <span class="mnav-icon">🛒</span>Store
    </button>
    <button class="mnav-btn" data-mtab="pnl" onclick="mobileNavTo('pnl')">
      <span class="mnav-icon">📈</span>P&L
    </button>
  </div>`;
  document.body.appendChild(nav);

  window.mobileNavTo = function(tab) {
    // Use existing showTab if available
    if (typeof showTab === 'function') showTab(tab);
    else {
      const tabEl = document.querySelector(`.tab[data-tab="${tab}"]`);
      if (tabEl) tabEl.click();
    }
    // Scroll center panel into view
    const centerPanel = document.querySelector('.grid > .panel:nth-child(2)');
    if (centerPanel) centerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Update active state
    nav.querySelectorAll('.mnav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mtab === tab);
    });
  };

  // Sync mobile nav with desktop tab clicks
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab[data-tab]');
    if (!tab) return;
    const name = tab.dataset.tab;
    nav.querySelectorAll('.mnav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mtab === name);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TOUCH OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════════════════════════

function applyTouchOptimizations() {
  if (!IS_MOBILE()) return;

  // Prevent double-tap zoom on buttons
  document.addEventListener('touchend', (e) => {
    if (e.target.closest('button, .btn, .tab, .subtab, .chat-tab, .mnav-btn')) {
      e.preventDefault();
      e.target.click();
    }
  }, { passive: false });

  // Make ticker rows taller for touch targets
  const style = document.createElement('style');
  style.textContent = `
    @media (pointer: coarse) {
      .ticker { min-height: 36px; padding: 4px 6px; }
      .btn, button { min-height: 32px; }
      .tab, .subtab, .chat-tab { min-height: 28px; }
      .wl-star { font-size: 1.1rem !important; padding: 0 6px !important; }
      .news-line { min-height: 28px; padding: 4px 6px; }
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. VIEWPORT HEIGHT FIX — Safari 100vh bug
// ═══════════════════════════════════════════════════════════════════════════════

function fixViewportHeight() {
  function setVH() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  setVH();
  window.addEventListener('resize', setVH);
  window.addEventListener('orientationchange', () => setTimeout(setVH, 100));
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════

function init() {
  fixViewportHeight();
  initMobileNav();
  if (IS_MOBILE()) {
    initCollapsibles();
    applyTouchOptimizations();
  }
  // Re-check on resize (orientation change etc.)
  let _lastMobile = IS_MOBILE();
  window.addEventListener('resize', () => {
    const now = IS_MOBILE();
    if (now && !_lastMobile) {
      initCollapsibles();
      applyTouchOptimizations();
    }
    _lastMobile = now;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
} else {
  setTimeout(init, 300);
}

})();
