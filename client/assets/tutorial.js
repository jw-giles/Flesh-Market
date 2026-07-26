/* ═══════════════════════════════════════════════════════════════════════════
   TUTORIAL, UNIT-7 Onboarding Protocol
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
      text: `Welcome to the Flesh Market trading network. Your account has been provisioned with an opening balance of <em>Ƒ1,000 Social Credits</em>. This terminal provides access to live stock trading, a <em>120-commodity market</em> with real shipping, shipping contracts, smuggling, faction warfare, casino operations, and an item marketplace. All features are available immediately.<span class="tut-cursor"></span>`,
      callout: 'OBJECTIVE: Accumulate Social Credits, build influence, and climb the network leaderboard.',
      tab: 'market',
    },
    {
      heading: 'STOCK TRADING',
      text: `The ticker feed on the left displays live prices across <em>180+ companies</em> in 8 sectors. Click any stock to view its <em>real-time waveform chart</em> and a detail panel showing sector, HQ colony, dividend status, and your position. Use the <em>★ Watchlist</em> button to filter to your favorites. Prices drift slowly, trends develop over <strong>hours, not minutes</strong>. <em>Market Orders</em> execute instantly. <em>Limit Orders</em> let you set a target price and reserve cash. You get <strong>3 day trades</strong> per 30-minute cycle.`,
      callout: 'Scalping is penalized. Buying and selling the same stock in one cycle costs 2x trade tax.',
      tab: 'market',
    },
    {
      heading: 'MARKET TOOLS',
      text: `Below Limit Orders, <em>Price Alerts</em> let you set notifications for when a stock crosses a target price. The <em>News Feed</em> on the left reports earnings, colony events, and market activity, use the filter bar to search by keyword or tone. The news feed nudges prices, so watch for earnings reports and colony disruptions.`,
      callout: 'Set a price alert on any ticker. You will hear a sound and see a toast when it triggers.',
      tab: 'market',
    },
    {
      heading: 'SHORT SELLING',
      text: `Shorting with the <em>⬇ Short</em> button borrows shares and sells them at market price. You profit if the price drops and you cover cheaper. Requirements: <strong>50% of the short value as cash collateral</strong> stays locked while the position is open, the position accrues a <strong>0.1% borrow fee</strong> on position value every <strong>30 minutes</strong>, and you cannot short more than <strong>500 shares per symbol</strong>. To close, you buy back the symbol. Buying more than your short covers first and the excess is rejected, you must be flat before you can go long. Covering counts as a day trade. <span class="warn">Losses scale with how high the price goes. They are not capped.</span>`,
      callout: 'Borrow fees run until you cover. Sitting on a short that goes sideways will bleed you.',
      tab: 'market',
    },
    {
      heading: 'DIVIDENDS AND ANALYSIS',
      text: `Dividends pay every <em>2 hours</em>. Finance, Insurance, Energy, and Tech sectors pay the full <strong>0.6%</strong> of position value. All other sectors pay a smaller <strong>0.2%</strong> holding dividend. Colony/faction bonuses stack on top, and <em>Merchants Guild</em> members get an additional <strong>+1% per MG member</strong> applied to their total payout. <span class="warn">Hold requirement: shares must be held continuously through the last 7 trading-day snapshots</span> (7 × 30-min cycles, 3.5 hours) to count. Buying right before a dividend and selling after pays nothing; any drop in your position during the window reduces eligibility to that minimum. The <em>🔥 Heatmap</em> tab color-codes the whole market by daily performance. The <em>P&L</em> tab tracks your net worth with a donut chart, position breakdown, sector exposure, and metrics like max drawdown and win rate.`,
      callout: 'New positions pay no dividend until they have survived 7 × 30-min snapshots continuously.',
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
      text: `Three factions compete for colony control. <em style="color:#4ecdc4">The Coalition</em> focuses on stability, control both endpoints of a route for -5% risk. <em style="color:#e74c3c">The Syndicate</em> gets +15% smuggling payout but +5% risk on their own turf. <em style="color:#9b59b6">Void Collective</em> earns 2% of all intercepted cargo as raid income, plus permanent cybernetic conversion with +Ƒ15 passive bonus. <span class="warn">Void conversion is irreversible.</span> All factions earn <em>Ƒ15 per controlled colony</em> every 30 minutes. Faction allegiance is locked for <strong>30 days</strong> after joining.`,
      callout: 'Fund colony control to shift influence. When a faction hits 75%, a 24-hour conquest timer starts.',
      tab: 'galactic',
      galaxySub: 'factions',
    },
    {
      heading: 'THE JADE CIRCUIT',
      text: `Beyond a sealed passage lies a <em>second galaxy</em>. The <em style="color:#7fe3a0">Jade Circuit</em> is sixteen worlds with their own exchange, their own tickers and their own lane network. Toggle to it from the <em>Sector Map</em>. The Circuit trades with itself: <strong>no lane crosses the border</strong>, and its freight flies the <em>Changzheng</em> hull family, CZ-1 through CZ-9, built at Changzheng Yards. You will never see a Coalition hauler over Yujing, or a Circuit hull over New Anchor. Flesh Station's deep scan stops at the passage too, so you can watch a Circuit freighter cross the map and never learn what is in its hold.`,
      callout: 'Circuit worlds run their own prices. What is dear in Coalition space may be cheap behind the passage.',
      tab: 'galactic',
      galaxySub: 'map',
    },
    {
      heading: 'COMMODITY MARKET',
      text: `The <em>Markets</em> tab is the heart of trade: <em>120 commodities</em> across Tech, Med, and Agri, each priced differently at every colony based on who controls it and local demand. The <em>Arbitrage Board</em> shows the best spread per commodity right now, where to buy cheapest and sell dearest. Buy a ship in the <em>Shipyard</em> (commodity trade requires one), buy goods at a cheap colony, then <em>Ship</em> them to a dear one. Shipments run in real time through phases, loading, undocking, transit, dropoff, and can be intercepted en route. NPC trade fleets move prices too, so the board is always shifting, and any colony with a <em>city</em> on it now presses on its own prices: what the city cannot grow, it buys. Prices update live like a stock ticker.`,
      callout: 'Filter the board by class or search by name. Watch NPC ships, each one moves the markets it trades.',
      tab: 'galactic',
      galaxySub: 'markets',
    },
    {
      heading: 'SHIPPING CONTRACTS',
      text: `On the <em>Contracts</em> tab, above Lane Shares, the house lists <em>shipping contracts</em>, options on a lane's commodity spread. You pay a <em>premium</em> for the right to capture a spread by an expiry (1h/4h/8h). If the spread <strong>widens past your strike</strong> before expiry, you exercise for profit; if not, it expires and you lose only the premium. <strong>No ship or cargo needed</strong>, so it's a way into the commodity game before you can afford a hauler. Blockaded lanes carry pricier premiums but bigger swings. <em>Lane Shares</em> still let you buy permanent equity in a lane on a bonding curve, earning a cut of all trade, including contract profits.`,
      callout: 'Contracts are pure market plays. Premiums are priced with a house edge, but players win about half.',
      tab: 'galactic',
      galaxySub: 'contracts',
    },
    {
      heading: 'SMUGGLING & GUARDS',
      text: `The <em>💀 Smuggling</em> tab is the high-risk gamble. Stake credits on a <em>contraband</em> run between colonies (payouts up to ×3), pick a route, and launch. Interception risk runs <strong>15% to 55%+</strong> by lane type, raised by big stakes and lowered by tension (chaos is cover for smugglers). Hire a <em>Guard escort</em> to cut the odds, four tiers from Light to <em>Private Army</em>, cutting risk up to <strong>26%</strong> for a fee of up to 22% of your stake. <span class="warn">The guard fee is paid up front and lost if you're caught, guards die with the cargo. No refund.</span> It's a spend-to-lower-odds bet, not insurance. Runs share a <strong>15-minute cooldown</strong> with nothing else.`,
      callout: 'Blockaded lanes still allow smuggling at +10% risk. Syndicate gets +15% payout but +5% on home turf.',
      tab: 'galactic',
      galaxySub: 'shipping',
    },
    {
      heading: 'CITIES',
      text: `Nineteen colonies now carry a <em>city</em>, reached from the <em>Cities</em> sub-tab or the OPEN CITY button on any colony. Each city is divided into <em>districts</em>, and you do not need to hold office to make money in one. Lease a <em>storefront</em> in any district, or <em>buy out</em> one of the twenty five thousand businesses already trading, and you earn a share of that district's commercial pool every week. A new storefront <strong>ramps up over several weeks</strong>, so an established business bought outright pays from day one. The more <em>separate players</em> trading in a district, the bigger the market gets for everyone in it.`,
      callout: 'The sitting mayor taxes what your shop earns. Check the commerce rate before you sign a lease.',
      tab: 'galactic',
      galaxySub: 'cities',
    },
    {
      heading: 'HOLDING OFFICE',
      text: `Buy the <em>seat</em> on a district and you govern it. A mayor holds office in <strong>one city</strong>, but as many of its districts as they can afford. Four levers, <em>security, politics, services and upkeep</em>, drive six conditions: crime, unrest, corruption, legitimacy, prosperity and output. <em>Develop</em> the district and commission <em>civic works</em> to raise its ceiling and build a skyline visible from orbit. Set the <em>commerce rate</em> between 5% and 25% and <em>favour</em> a trade. You pay a <em>civic bill</em> every week, and a corrupt district costs more to run than its levers claim.`,
      callout: 'Zone districts for food, med or tech and your colony s own commodity prices move. A world that grows its own food is where food is cheap.',
      tab: 'galactic',
      galaxySub: 'cities',
    },
    {
      heading: 'OFFICE IS CONTESTABLE',
      text: `A seat is never safe. Its price tracks <em>legitimacy</em>, so a district that has turned on its administration is <strong>cheap to take</strong>, and one that is well governed is dear. Established shopholders can <em>file a petition</em> against their mayor and push that legitimacy down. Fall behind on the civic bill and the office <span class="warn">vacates on unpaid debt</span>, with the arrears written off and the district open to anyone. Ahead of a blockade a mayor can <em>lay in siege stores</em>, which cover the colony's shortfall while they last and spoil while they sit. If the colony is conquered, <span class="warn">every seat is vacated and every storefront closed</span>.`,
      callout: 'Whoever holds the most capital on a world holds its charter. A charter in the conquering faction s hands spares the city.',
      tab: 'galactic',
      galaxySub: 'cities',
    },
    {
      heading: 'THE STORE',
      text: `The Store tab contains four sections. <em>Titles</em>, purchasable display titles from Ƒ1K to Ƒ50M that show beside your name. <em>Inventory</em>, equip items across 9 gear slots for passive income bonuses. <em>Ƒbay</em>, a player marketplace to buy and sell items. <em>🎰 Slots</em>, the slot machine is the exclusive source of <strong>equipment drops</strong>. Items come in six rarity tiers from Common to Phantom. Every <strong>9 completed day trades</strong> earns a free spin. Patreon members receive monthly spin grants.`,
      callout: 'Equip a full set (Neon Syndicate, Chrome Corp, etc.) for stacking set bonuses.',
      tab: 'store',
    },
    {
      heading: 'THE CASINO',
      text: `Eleven casino games are available. <em>Roulette</em>, 13 bet types with animated wheel. <em>Blackjack</em>, 6-deck shoe with card tracking. <em>Baccarat</em>, Punto Banco with Player, Banker, Tie, and pair bets. <em>Sic Bo</em>, a three-dice betting board. <em>Poker</em>, Texas Hold'em 6-max vs AI. <em>Solitaire</em>, Klondike scored on the cards you move to the foundations. <em>Horse Racing</em>, <em>Chess</em>, <em>Sudoku</em>, <em>Math Quiz</em>, and <em>Minesweeper</em>. All games use your Social Credit balance directly, wins are real, losses are real. No house tokens, no abstraction.`,
      callout: 'Casino winnings are the fastest way to grow early. Also the fastest way to go broke.',
      tab: 'casino',
    },
    {
      heading: 'DRONE MINING',
      text: `The <em>⛏ Mining</em> tab opens an unregulated asteroid extraction zone. Pilot a single drone into the belt, mine ore with your laser, and bring it back to bank. Every faction agreed that mining is where conflict happens, so safe mining is not enforced anywhere. Hostile drones patrol every sector. Drones of <strong>your own faction</strong> leave you alone. Depth bands get richer and more hostile the further you push: <span style="color:#86ff6a">NEAR</span>, <span style="color:#72e09c">MID</span>, <span style="color:#ff9a4a">DEEP</span>, <span style="color:#ff4a4a">VOID</span>. One hostile hit ends the drone. Docking safely refunds the drone's Ƒ1,000 build cost. Fuel does not refill.`,
      callout: 'Your FleshMarket faction determines who shoots at you. The game opens fullscreen, ESC returns.',
      tab: 'mining',
    },
    {
      heading: 'SOCIAL AND ECONOMY',
      text: `The chat panel on the right has channels: <em>Global</em> (5 rooms), <em>Premium</em> (Patreon), <em>Guild</em> (Tier 2+), <em>Whisper</em> (private), and <em>Unmod</em> (18+, unfiltered). <em>Wire Credits</em> lets you send money to other players, <strong>12-hour cooldown</strong>, 2% base tax, and <strong>90% Guild surcharge</strong> above Ƒ10,000. Player-created <strong>Hedge Funds</strong> pool capital with proportional profit sharing. The <em>Merchants Guild</em> (Patreon Tier 2+) grants stacking dividend bonuses. The <em>Presidency</em> costs Ƒ1 billion and pays Ƒ15,000 per cycle.`,
      callout: 'The leaderboard freezes each 30-minute cycle. XP is earned through trading activity.',
      tab: 'market',
    },
    {
      heading: 'INDEX FUNDS',
      text: `A <strong>Capital House</strong> that has grown its NAV to <strong>Ƒ500,000,000</strong> can <em>list on the Index</em> from its owner panel, turning the house into a real ticker anyone can trade. Listing costs a <strong>Ƒ25,000,000</strong> fee (burned) and sells a fixed <strong>100,000-share public float</strong> into the market, so smaller players can buy into a manager's book without joining the house. The ticker's price floats on order flow but is anchored to the house's <em>NAV per share</em>, so a well-run house trades at a <span style=\"color:#5fe08a\">premium</span> and a distrusted one at a <span style=\"color:#ff6b6b\">discount</span> to book value. Open the <em>Index Funds</em> browser beside the History button to see every listed house with its price, NAV per share, and premium or discount. <span class=\"warn\">Index tickers cannot be shorted.</span> If a house delists or disbands, all public holders are bought out at NAV per share.`,
      callout: 'A listed house is a real ticker: chart it, watchlist it, trade it. Its price tracks the manager\u2019s NAV per share.',
      tab: 'guild',
    },
    {
      heading: 'THE FLESH REVENUE SERVICE',
      text: `The <strong>Flesh Revenue Service</strong> assesses a weekly income tax on your gains. Every <strong>Sunday at noon Pacific</strong> it measures how much your taxable net worth (cash plus positions) grew since the last assessment and takes a percentage of that gain, default <strong>15%</strong>. Only growth is taxed, so a flat or losing week owes nothing, and banked losses can offset later gains. When the FRS is collecting, a <strong>🏛 Taxes</strong> button appears in the header where you can clear a balance or <em>prepay</em> ahead of going idle. One shelter worth knowing: money held inside a <em>Capital House</em> is not taxed weekly, it is taxed only when you <strong>withdraw</strong> it.`,
      callout: 'UNIT-7: Compliance is not optional. The FRS sees the tape. Pay on time and trade freely.',
      tab: 'market',
    },
    {
      heading: 'ORIENTATION COMPLETE',
      text: `All systems reviewed. The key principles: <em>holding pays dividends</em>, <em>commodity arbitrage rewards a good eye for spreads</em>, <em>contracts let you trade those spreads without a ship</em>, <em>smuggling is a gamble guards can tilt</em>, <em>a storefront pays without a ship or a seat</em>, <em>office is bought and can be taken back</em>, <em>scalping gets taxed</em>, and <em>shorts bleed fees</em>. Two galaxies are open to you, and the <em>Jade Circuit</em> keeps its own books. Use the <em>★ Watchlist</em> to track stocks, set <em>Price Alerts</em> for targets, check the <em>🔥 Heatmap</em> for market-wide moves, and review <em>P&L</em> for your performance metrics. Report bugs through the 🐛 tab. This tutorial replays via the <em>? Tutorial</em> button in the header.<span class="tut-cursor"></span>`,
      callout: 'UNIT-7: Orientation complete. Your terminal is fully operational. Begin when ready.',
      tab: 'market',
    },
  ];

  // ── Chinese slide content (rendered when jade is on, i.e. _lang==='zh') ──────
  // Parallel to SLIDES by index. renderSlide falls back to English per field if a
  // zh entry is missing. First-pass CN of dense onboarding prose; inline markup,
  // game terms, and Ƒ figures preserved. Native review advised on the prose.
  // No em dashes (U+2014) in this player-facing content.
  const SLIDES_ZH = [
    {
      heading: '终端已激活',
      text: `欢迎接入血肉市场交易网络。您的账户已开通，初始余额为 <em>Ƒ1,000 社会信用点</em>。本终端提供实时股票交易、含真实航运的 <em>120 种大宗商品市场</em>、航运合约、走私、阵营战争、赌场运营，以及物品交易市场。所有功能即刻可用。<span class="tut-cursor"></span>`,
      callout: '目标：积累社会信用点，扩张影响力，攀登网络排行榜。',
    },
    {
      heading: '股票交易',
      text: `左侧的行情列表实时显示 <em>180+ 家公司</em> 的价格，横跨 8 个板块。点击任一股票即可查看其 <em>实时波形图</em> 及详情面板，含板块、总部殖民地、股息状态与您的持仓。用 <em>★ 自选</em> 按钮筛选出关注对象。价格缓慢漂移，趋势以 <strong>小时计，而非分钟</strong> 展开。<em>市价单</em> 即时成交。<em>限价单</em> 让您设定目标价并冻结资金。每个 30 分钟周期内可进行 <strong>3 次日内交易</strong>。`,
      callout: '刷单会被惩罚。同一周期内买入并卖出同一股票，需缴纳 2 倍交易税。',
    },
    {
      heading: '市场工具',
      text: `在限价单下方，<em>价格提醒</em> 让您在股票越过目标价时收到通知。左侧的 <em>新闻推送</em> 报道财报、殖民地事件与市场动态，可用筛选栏按关键词或情绪搜索。新闻推送会推动价格，因此请留意财报与殖民地动荡。`,
      callout: '为任意代码设置价格提醒。触发时您会听到提示音并看到弹窗。',
    },
    {
      heading: '做空',
      text: `用 <em>⬇ 做空</em> 按钮借入股票并按市价卖出。若价格下跌、您以更低价格回补，即可获利。要求如下：仓位持有期间将锁定 <strong>相当于做空价值 50% 的现金保证金</strong>；仓位每 <strong>30 分钟</strong> 按持仓价值计提 <strong>0.1% 借券费</strong>；且每个代码做空不得超过 <strong>500 股</strong>。平仓需买回该代码。买入量超过做空量时先行回补，超出部分将被拒绝，您必须先持平方可做多。回补计入一次日内交易。<span class="warn">亏损随价格上涨而扩大，且无上限。</span>`,
      callout: '借券费在您回补前持续计提。死守一只横盘的空头会让您失血。',
    },
    {
      heading: '股息与分析',
      text: `股息每 <em>2 小时</em> 派发一次。金融、保险、能源与科技板块派发持仓价值的全额 <strong>0.6%</strong>。其余所有板块派发较低的 <strong>0.2%</strong> 持有股息。殖民地与阵营加成在此之上叠加，<em>商人公会</em> 成员每有一名公会成员，其总派发额外获得 <strong>+1%</strong>。<span class="warn">持有要求：股票须连续持有至最近 7 个交易日快照</span>（7 × 30 分钟周期，共 3.5 小时）方可计入。临派息前买入、派息后卖出将一无所获；窗口期内持仓的任何减少都会将资格降至该最低值。<em>🔥 热力图</em> 标签页按当日表现为整个市场着色。<em>盈亏</em> 标签页用环形图追踪您的净值，含持仓明细、板块敞口，以及最大回撤、胜率等指标。`,
      callout: '新仓位在连续存续 7 × 30 分钟快照之前不派发股息。',
    },
    {
      heading: '星系',
      text: `<em>星区地图</em> 显示全部 21 个殖民地、它们的阵营控制与紧张度。殖民地是一切的根基：阵营资金、航运路线与股息加成皆经由它们流转。高紧张度殖民地会触发其总部所在公司的股价下跌。点击地图上任一殖民地，即可查看其详情、控制百分比与总部公司。`,
      callout: '殖民地紧张度超过 50% 便开始冲击股价。超过 90% 则进入危急。',
    },
    {
      heading: '阵营',
      text: `三大阵营争夺殖民地控制权。<em style="color:#4ecdc4">联盟</em> 专注于稳定，同时控制一条路线的两端可获 -5% 风险。<em style="color:#e74c3c">辛迪加</em> 获得 +15% 走私收益，但在自家地盘承受 +5% 风险。<em style="color:#9b59b6">虚空集体</em> 将所有被截获货物的 2% 作为劫掠收入，并附带永久性赛博改造，带来 +Ƒ15 被动加成。<span class="warn">虚空改造不可逆转。</span>所有阵营每 30 分钟从每个受控殖民地获得 <em>Ƒ15</em>。加入后阵营归属锁定 <strong>30 天</strong>。`,
      callout: '为殖民地控制注资以撬动影响力。当某阵营达到 75%，24 小时征服倒计时启动。',
    },
    {
      heading: '玉环',
      text: `封闭的星门之后，是 <em>第二个星系</em>。<em style="color:#7fe3a0">玉环</em> 由十六个世界组成，拥有自己的交易所、自己的代码与自己的航道网。可从 <em>星区地图</em> 切换过去。玉环自成一体：<strong>没有任何航道跨越边界</strong>，其货运一律由 <em>长征</em> 级船体承担，即长征一号至长征九号，全部建于长征船坞。您绝不会在玉京上空见到联合体货轮，也不会在新锚点上空见到玉环船体。血肉站的深层扫描同样止步于星门，因此您可以看着一艘玉环货船横穿地图，却始终无从得知它舱中所载。`,
      callout: '玉环世界自行定价。在联合体空域昂贵之物，星门之后未必如此。',
    },
    {
      heading: '大宗商品市场',
      text: `<em>市场</em> 标签页是贸易的核心：<em>120 种大宗商品</em>，横跨科技、医疗与农业，每种在每个殖民地依据控制方与当地需求而定价不同。<em>套利板</em> 显示当下每种商品的最佳价差，何处买最便宜、何处卖最贵。在 <em>船坞</em> 购入一艘船（大宗商品贸易须有船），在低价殖民地买货，再将其 <em>运往</em> 高价殖民地。运输实时经历各阶段，装载、脱离船坞、运途、卸货，途中可能被截获。NPC 贸易舰队同样会推动价格，因此该板始终在变动；而任何建有 <em>城市</em> 的殖民地如今也会压向自身价格：城市无法自产之物，必须外购。价格如股票行情般实时更新。`,
      callout: '按类别筛选该板或按名称搜索。留意 NPC 舰船，每一艘都在撬动它所交易的市场。',
    },
    {
      heading: '航运合约',
      text: `在 <em>合约</em> 标签页、航道份额上方，商号列出 <em>航运合约</em>，即航道商品价差的期权。您支付一笔 <em>权利金</em>，换取在到期日（1 小时／4 小时／8 小时）前捕获某一价差的权利。若价差在到期前 <strong>扩大越过您的行权价</strong>，您可行权获利；若未越过，合约到期，您仅损失权利金。<strong>无需船只或货物</strong>，因此这是在您买得起货船之前进入大宗商品博弈的一条途径。被封锁的航道权利金更高，但波动更大。<em>航道份额</em> 仍可让您沿一条债券曲线购入某航道的永久权益，赚取所有贸易的分成，包括合约利润。`,
      callout: '合约是纯粹的市场博弈。权利金定价含商号抽水，但玩家约有半数获胜。',
    },
    {
      heading: '走私与护卫',
      text: `<em>💀 走私</em> 标签页是高风险赌局。押注信用点进行一趟殖民地间的 <em>违禁品</em> 运输（赔付高达 ×3），选定路线，然后发船。截获风险依航道类型在 <strong>15% 到 55%+</strong> 之间，大额押注会抬高风险，而紧张度则会降低风险（混乱是走私者的掩护）。雇佣 <em>护卫队</em> 可压低概率，从轻型到 <em>私人军队</em> 共四档，可将风险最多降低 <strong>26%</strong>，费用最高达押注额的 22%。<span class="warn">护卫费预先支付，被抓则损失，护卫随货物一同覆灭。概不退还。</span>这是一场花钱压低概率的赌注，而非保险。各趟运输与其余项目共享 <strong>15 分钟冷却</strong>。`,
      callout: '被封锁的航道仍允许走私，风险 +10%。辛迪加获 +15% 赔付，但在自家地盘 +5%。',
    },
    {
      heading: '城市',
      text: `如今已有十九个殖民地建有 <em>城市</em>，可从 <em>城市</em> 子标签页，或任一殖民地上的「进入城市」按钮进入。每座城市划分为若干 <em>辖区</em>，而您无需担任公职也能在其中获利。在任意辖区租下一间 <em>店面</em>，或直接 <em>收购</em> 已在营业的两万五千余家商号之一，即可每周分得该辖区商业收益池的一份。新开店面需 <strong>数周才能爬满产能</strong>，因此整体收购一家成熟商号可自首日起计收益。一个辖区内交易的 <em>独立玩家</em> 越多，整个市场对其中每个人都越大。`,
      callout: '在任的辖区长会对您店铺的收益课税。签租约前请先看清商业税率。',
    },
    {
      heading: '出任公职',
      text: `买下一个辖区的 <em>席位</em>，您便执掌该地。一名辖区长只能在 <strong>一座城市</strong> 任职，但可在该城内尽其财力购入任意多个辖区。四项施政杠杆，<em>治安、政务、公共服务与维护</em>，驱动六项状况：犯罪、动荡、贪腐、认受度、繁荣与产出。<em>开发</em> 辖区并兴建 <em>市政工程</em>，可抬高其上限，并筑起一片自轨道可见的天际线。将 <em>商业税率</em> 设在 5% 至 25% 之间，并可 <em>扶持</em> 某一行业。您每周须支付 <em>市政账单</em>，而贪腐的辖区，其实际开销高于杠杆所标示的数额。`,
      callout: '将辖区划归食品、医疗或技术，本殖民地自身的大宗商品价格便会随之变动。自产粮食的世界，正是粮食便宜之处。',
    },
    {
      heading: '公职可被夺取',
      text: `席位从无高枕无忧之说。其价格随 <em>认受度</em> 浮动，因此已然离心的辖区 <strong>易于夺取</strong>，而治理有方者则价格高昂。立稳的店主可对其辖区长 <em>提交陈情</em>，压低这一认受度。若市政账单久拖不缴，公职将 <span class="warn">因欠债而自动出缺</span>，欠款一笔勾销，辖区向所有人开放。在封锁到来之前，辖区长可 <em>囤积围城储备</em>，在耗尽前填补本殖民地的缺口，并在存放期间逐步损耗。若殖民地被攻陷，<span class="warn">所有席位一律出缺，所有店面一律关闭</span>。`,
      callout: '在一个世界上资本最雄厚者持有其特许。若特许恰在征服方阵营手中，该城可免于被夺。',
    },
    {
      heading: '商店',
      text: `商店标签页含四个板块。<em>头衔</em>，可购买的展示头衔，从 Ƒ1K 到 Ƒ50M，显示在您名字旁。<em>库存</em>，在 9 个装备槽位配装以获取被动收入加成。<em>Ƒ 集市</em>，玩家买卖物品的市场。<em>🎰 老虎机</em>，<strong>装备掉落</strong> 的唯一来源。物品分六个稀有度等级，从普通到幽灵。每完成 <strong>9 次日内交易</strong> 获赠一次免费旋转。Patreon 成员每月获赠旋转次数。`,
      callout: '配齐整套（霓虹辛迪加、铬合金集团等）以叠加套装加成。',
    },
    {
      heading: '赌场',
      text: `共有十一款赌场游戏。<em>轮盘</em>，13 种投注类型配动画转盘。<em>21 点</em>，六副牌靴含记牌。<em>百家乐</em>，庄闲和与对子投注的 Punto Banco。<em>骰宝</em>，三骰投注盘。<em>扑克</em>，德州扑克 6 人桌对战 AI。<em>接龙</em>，克朗代克玩法，按移入基础牌堆的牌计分。<em>赛马</em>、<em>国际象棋</em>、<em>数独</em>、<em>数学问答</em> 与 <em>扫雷</em>。所有游戏直接使用您的社会信用点余额，赢是真赢，输是真输。无筹码，无抽象。`,
      callout: '赌场赢利是早期增长最快的途径。也是破产最快的途径。',
    },
    {
      heading: '无人机采矿',
      text: `<em>⛏ 采矿</em> 标签页开启一片不受管制的小行星开采区。驾驶单架无人机进入矿带，用激光采矿，再带回银行入账。各阵营一致认定采矿是冲突之地，因此任何地方都不强制安全采矿。敌对无人机在每个星区巡逻。<strong>与您同阵营</strong> 的无人机不会袭击您。深度带越深，越富饶也越凶险：<span style="color:#86ff6a">近</span>、<span style="color:#72e09c">中</span>、<span style="color:#ff9a4a">深</span>、<span style="color:#ff4a4a">虚空</span>。一次敌对命中即终结该无人机。安全对接可退还无人机的 Ƒ1,000 建造成本。燃料不会补充。`,
      callout: '您的血肉市场阵营决定谁会向您开火。游戏全屏开启，ESC 返回。',
    },
    {
      heading: '社交与经济',
      text: `右侧聊天面板含多个频道：<em>全局</em>（5 个房间）、<em>高级</em>（Patreon）、<em>公会</em>（2 级以上）、<em>私语</em>（私密）与 <em>无管制</em>（18+，无过滤）。<em>电汇信用点</em> 让您向其他玩家转账，<strong>12 小时冷却</strong>，2% 基础税，超过 Ƒ10,000 加收 <strong>90% 公会附加费</strong>。玩家创建的 <strong>对冲基金</strong> 汇集资本并按比例分享利润。<em>商人公会</em>（Patreon 2 级以上）授予可叠加的股息加成。<em>总统席位</em> 耗资 Ƒ10 亿，每周期支付 Ƒ15,000。`,
      callout: '排行榜每 30 分钟周期冻结一次。经验值通过交易活动获得。',
    },
    {
      heading: '指数基金',
      text: `将 NAV 增长至 <strong>Ƒ500,000,000</strong> 的 <strong>资本商号</strong> 可从其所有者面板 <em>挂牌上市</em>，把商号变成任何人都能交易的真实代码。挂牌需缴 <strong>Ƒ25,000,000</strong> 费用（销毁），并向市场发售固定的 <strong>100,000 股公众流通盘</strong>，使较小的玩家无需加入商号即可买入某位管理者的账本。代码价格随委托流波动，但锚定于商号的 <em>每股 NAV</em>，因此经营良好的商号相对账面价值以 <span style="color:#5fe08a">溢价</span> 交易，失信的商号则以 <span style="color:#ff6b6b">折价</span> 交易。在历史按钮旁打开 <em>指数基金</em> 浏览器，即可查看每家已挂牌商号的价格、每股 NAV 及溢价或折价。<span class="warn">指数代码不可做空。</span>若某商号退市或解散，所有公众持有者将按每股 NAV 被收购。`,
      callout: '已挂牌的商号是一只真实代码：可绘图、可自选、可交易。其价格跟踪管理者的每股 NAV。',
    },
    {
      heading: '血肉税务局',
      text: `<strong>血肉税务局</strong> 对您的收益征收每周所得税。每 <strong>周日太平洋时间正午</strong>，它衡量您的应税净值（现金加持仓）自上次评估以来增长了多少，并抽取该增长的一定比例，默认 <strong>15%</strong>。仅增长部分被征税，因此持平或亏损的一周无需缴纳，且已入账的亏损可抵扣日后的收益。当税务局正在征收时，标题栏会出现 <strong>🏛 税务</strong> 按钮，您可在此清缴余额或在转入闲置前 <em>预缴</em>。一条值得知晓的避税之道：存放于 <em>资本商号</em> 内的资金不按周征税，仅在您 <strong>提取</strong> 时征税。`,
      callout: 'UNIT-7：合规并非可选。税务局看得见交易记录。按时缴纳，自由交易。',
    },
    {
      heading: '入职完成',
      text: `所有系统已审阅完毕。要点如下：<em>持有派发股息</em>、<em>大宗商品套利犒赏识别价差的好眼力</em>、<em>合约让您无需船只即可交易这些价差</em>、<em>走私是护卫可以扭转的赌局</em>、<em>一间店面无需船只、亦无需公职即可生利</em>、<em>公职可以买来，也可以被夺走</em>、<em>刷单会被征税</em>、<em>空头会持续失血于费用</em>。两个星系向您开放，而 <em>玉环</em> 自记其账。用 <em>★ 自选</em> 追踪股票，为目标设置 <em>价格提醒</em>，查看 <em>🔥 热力图</em> 掌握全市场动向，回顾 <em>盈亏</em> 了解您的表现指标。通过 🐛 标签页报告漏洞。本教程可经标题栏的 <em>? 教程</em> 按钮重播。<span class="tut-cursor"></span>`,
      callout: 'UNIT-7：入职完成。您的终端已全面运行。准备好即可开始。',
    },
  ];

  const BTN_ZH = { skip: '跳过教程', prev: '◂ 上一步', next: '下一步 ▸', begin: '开始交易' };
  const SPEAKER_TITLE_ZH = '入职协议 // 血肉市场终端服务';

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

    // Events. skip/prev use addEventListener, next is set dynamically in renderSlide
    document.getElementById('tut-prev').addEventListener('click', prevSlide);
    document.getElementById('tut-skip').addEventListener('click', dismissTutorial);
  }

  function renderSlide() {
    const slide = SLIDES[currentSlide];
    if (!slide) return;

    // Language-aware content: Chinese when jade is on (_lang==='zh'), per-field English fallback.
    var isZh = (window._lang === 'zh');
    var zhSlide = (isZh && typeof SLIDES_ZH !== 'undefined' && SLIDES_ZH[currentSlide]) ? SLIDES_ZH[currentSlide] : null;
    var field = function(k){ return (zhSlide && zhSlide[k] != null) ? zhSlide[k] : slide[k]; };
    document.getElementById('tut-heading').innerHTML = field('heading');
    document.getElementById('tut-text').innerHTML = field('text');
    document.getElementById('tut-callout').innerHTML = field('callout');

    // Speaker title + Skip label follow the language (English fallback).
    var titleEl = document.querySelector('.tut-speaker-title');
    if (titleEl) titleEl.textContent = (isZh && typeof SPEAKER_TITLE_ZH !== 'undefined') ? SPEAKER_TITLE_ZH : SPEAKER_TITLE;
    var skipEl = document.getElementById('tut-skip');
    if (skipEl) skipEl.textContent = (isZh && typeof BTN_ZH !== 'undefined' && BTN_ZH.skip) ? BTN_ZH.skip : 'SKIP TUTORIAL';

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
      nextBtn.textContent = (isZh && typeof BTN_ZH !== 'undefined' && BTN_ZH.begin) ? BTN_ZH.begin : 'BEGIN TRADING';
      nextBtn.onclick = dismissTutorial;
    } else {
      nextBtn.textContent = (isZh && typeof BTN_ZH !== 'undefined' && BTN_ZH.next) ? BTN_ZH.next : 'NEXT ▸';
      nextBtn.onclick = nextSlide;
    }
    prevBtn.textContent = (isZh && typeof BTN_ZH !== 'undefined' && BTN_ZH.prev) ? BTN_ZH.prev : '◂ PREV';

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
