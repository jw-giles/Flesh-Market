/**
 * FleshMarket — Server v0.9.5
 * v0.9.0 — Modular client, bug fixes, chat rate limiting,
 *            limit order persistence (SQLite), WS reconnect backoff,
 *            /snapshot auth, FLSH block on limit orders.
 * v5.0    — Limit orders, short selling, earnings, IPOs, dividends,
 *            trade feed, daily quests, heatmap, portfolio snapshots.
 */

import 'dotenv/config';
import express from 'express';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createHmac } from 'crypto';
import http from 'http';
import fs from 'fs';
import path from 'path';
import url  from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

import { filterChat } from './chat-filter.js';

import {
  initDB, setupTransactions,
  createPlayerSync, getPlayer, getPlayerByName,
  getPlayerByPatreonEmail, getPlayerByPatreonMemberId,
  isNameAvailable, touchPlayer, renamePlayer, markTutorialSeen,
  savePlayerFn, recordNetWorthFn, recordFundNAVFn,
  getNetWorthHistory, getFundNAVHistory, getLeaderboard,
  verifyPassword, createPasswordHash,
  saveMarketState, loadMarketState,
  saveGalaxySystemsState, loadGalaxySystemsState,
  savePresidentState, loadPresidentState,
  saveLimitOrder as dbSaveLimitOrder, deleteLimitOrder as dbDeleteLimitOrder,
  deletePlayerLimitOrders as dbDeletePlayerLimitOrders, getAllLimitOrders as dbGetAllLimitOrders,
  setPatreonTier, linkPatreonEmail,
  revokeExpiredPatreon, creditPassiveIncome, DEV_INCOME_EVERY30,
  countCEOs, TIERS, CEO_MAX,
  initHedgeFund, setupFundTransactions,
  getFundCash, setFundCash, getFundHoldings, setFundHolding,
  getTotalFundShares, getFundMembers, getFundMember, isFundMember,
  syncFundMembership, depositToFundFn, withdrawFromFundFn,
  createProposal, getOpenProposals, getAllProposals,
  castVote, getProposal, hasVoted, resolveProposal,
  expireOldProposals, getFundLedger, logFundTrade,
  initFundsSystem, setupFundDepositWithdraw,
  getAllFunds, getFund, getFundByName, createFund, addFundSlots,
  getFundMemberships, getFundMembership, isInFund, getFundMemberCount, joinFund,
  getFundCashById, setFundCashById, addFundCash,
  getFundPortfolio, setFundPortfolioQty, getTotalFundSharesById,
  getFundNAVById, applyFundSavingsInterest,
  getPlayerFundStake, getPlayerFundMemberships,
  fundDepositFn, fundWithdrawFn,
  getFundActivity, logFundActivity,
  setFundGovernance, createHouseProposal, getHouseProposal, getOpenHouseProposals,
  getGoldenHolder, setGoldenHolder,
  setFundOfficer, removeFundOfficer, getFundOfficerRole, getFundOfficers,
  getDueHouseProposals, hasVotedHouse, castHouseVote, getHouseVoteCount, resolveHouseProposal,
  getHouseVoterIds, VOTE_DURATIONS,
  getColonyCommodityPrices, getAllCommodityPrices, getCommodityPrice, upsertCommodityPrice,
  getPlayerCargo, getCargoQty, getCargoTotal, addCargo, removeCargo,
  createCargoShipment, getCargoShipment, getPlayerCargoShipments, getDueCargoShipments, setCargoShipmentStatus,
  getActiveCargoShipments, setCargoShipmentPhase, setPlayerShipClass, getPlayerShipClass, setPlayerPortrait,
  createShippingContract, getShippingContract, getPlayerShippingContracts, getExpiredOpenContracts, settleShippingContract,
  kickFundMember, deleteFund, updateFundInfo,
  initFundPolls, createFundPoll, getFundPolls, voteFundPoll, closeFundPoll, expireOldFundPolls,
  setDevAccount, isDevAccount, syncDevAccounts,
  isAdminAccount, setAdminAccount, isOwnerAccount, initModerationTable,
  setMute, clearMute, isMuted, getMuteExpiry,
  setBan, isBanned, getModerationRecord,
  setDunce, clearDunce, isDunced, getDunceRecord,
  setMarginCall, getMarginCall, clearMarginCall, getActiveMarginCalls,
  FUND_CREATE_COST, FUND_SLOT_COST, FUND_BASE_SLOTS, FLSH_TRADE_PCT,
  // Galaxy
  seedColoniesIfEmpty, getAllColonyStates, getColonyState, updateColonyState,
  recordFactionFunding, getColonyTopFunders, getPlayerFactionFunding,
  getWarFundPending, setWarFundPending,
  setPlayerFaction, getPlayerFaction, getPlayerFactionData, getPlayerFactionsBulk,
  setVoidLocked, isVoidLocked, setVoidPresidentEscaped, isVoidPresidentEscaped,
  // Lane Shares
  getLaneShareCount, getLaneShares, getAllLaneShares, getPlayerShare,
  buyLaneShare, sellLaneShare, voidLaneSharesByLane, addShareDividend, getLaneShareSummaries,
  // Item System
  ITEM_CATALOG, RARITY_CONFIG, ITEM_SLOTS,
  initItemTables, rollItemDrop, giveItem,
  getInventory, getEquipped, equipItem, unequipItem, getEquippedPassiveBonus, getPassiveIncome,
  isItemEquipped,
  getSlotRecord, addSpins, recordMilestoneTrade, useSpinAndDrop, grantMonthlySpins,
  // Quests (layer 3)
  initQuestTables, acceptQuest, getPlayerQuests, getQuestStatus, completeQuest,
  MARKET_UPGRADE_CATALOG, initMarketUpgradeTables, getMarketUpgrades, hasMarketUpgrade, grantMarketUpgrade,
  getAutoAccum, getAutoAccumRow, getArmedAutoAccum, setAutoAccumConfig, adjustAutoAccumReserve, spendAutoAccumReserve, deleteAutoAccum,
  listItemOnMarket, getMarketListings, buyMarketItem, cancelMarketListing, scrapItem, getPatreonSubscribers,
  getTutorialSeen,
  // Dev Communications (DB-persisted)
  addBugReport, getBugReports, toggleBugUpvote, toggleBugResolved, getBugUpvoters,
  addPlayerReport, getPlayerReports,
  addDevRequest, getDevRequests, handleDevRequest,
  addAnnouncement, getActiveAnnouncements, clearAnnouncement, pruneExpiredAnnouncements,
  fbAddPost, fbGetFeed, fbGetReplies, fbAddReply, fbToggleVote,
  fbDeletePost, fbDeleteReply, fbAddNotification, fbUnreadCount, fbMarkSeen,
  fbPostOwner, fbReplyOwner, fbEditPost, fbEditReply, fbSetPinned,
  executeStockSplit,
  // Dividend eligibility (7-trading-day holding requirement)
  snapshotAllHoldings, getEligibleDividendQtyBulk, getEligibleFundDividendQtyBulk, DIVIDEND_HOLD_CYCLES,
  // Mining: permanent upgrades + leaderboard
  MINING_UPGRADE_CATALOG, getMiningUpgrades, hasMiningUpgrade,
  getMiningStats, canBuyMiningUpgrade, grantMiningUpgrade,
  recordMiningRun, getMiningLeaderboard,
  // Mining: ship hulls
  MINING_SHIP_CATALOG, getMiningShips, hasMiningShip,
  buyMiningShip, equipMiningShip,
} from './db.js';

initDB();
setupTransactions();
initHedgeFund();
setupFundTransactions();
initFundsSystem();
setupFundDepositWithdraw();
initModerationTable();
initFundPolls();
seedColoniesIfEmpty();
initItemTables();
initQuestTables();
initMarketUpgradeTables();

function savePlayer(p) { try { savePlayerFn(p); } catch(e) { console.error('savePlayer:', e); } }
function recordNetWorth(id, net, cash, equity) { try { recordNetWorthFn(id, net, cash, equity); } catch(e) {} }
function recordFundNAV(fundId, nav, spp, shares) { try { recordFundNAVFn(fundId, nav, spp, shares); } catch(e) {} }
// Snapshot a single fund's NAV/share now — called on trades/deposits/withdrawals
// so the performance chart builds with activity instead of only every 30 min.
function snapshotFund(fundId) {
  try {
    const priceMap    = buildPriceMap();
    const nav         = getFundNAVById(fundId, priceMap);
    const totalShares = getTotalFundSharesById(fundId);
    const spp         = totalShares > 0 && nav > 0 ? nav / totalShares : 1;
    recordFundNAV(fundId, nav, spp, totalShares);
  } catch(e) {}
}

// Shared fund trade execution — used by direct (executive/council) trades and by
// passed proposals (vote/council). Trades at live ticker price against fund cash.
function executeFundTrade(fundId, side, sym, qty, actorId) {
  const fund = getFund(fundId);
  if (!fund) return { ok:false, error:'not_found' };
  const c = companies.find(x => x.symbol === sym && !x._special);
  if (!c) return { ok:false, error:'unknown_symbol' };
  const q = Math.max(1, Math.floor(Number(qty)||0));
  const fundCash = fund.cash;
  const haveQty  = getFundPortfolio(fundId).find(h=>h.symbol===sym)?.qty || 0;
  if (side === 'buy') {
    const cost = c.price * q;
    if (fundCash < cost) return { ok:false, error:'insufficient_fund_cash', have:fundCash, need:cost };
    setFundCashById(fundId, fundCash - cost);
    setFundPortfolioQty(fundId, sym, haveQty + q);
    logFundActivity(fundId,'trade_buy',actorId,sym,q,c.price,cost,`Buy ${q}× ${sym} @ Ƒ${c.price.toFixed(2)}`);
    pushHeadline(`${fund.name}: bought ${q}× ${sym} @ Ƒ${c.price.toFixed(2)}`, 'good', sym);
  } else if (side === 'sell') {
    const sellQty = Math.min(q, haveQty);
    if (sellQty <= 0) return { ok:false, error:'no_holdings' };
    const proceeds = c.price * sellQty;
    setFundCashById(fundId, fundCash + proceeds);
    setFundPortfolioQty(fundId, sym, haveQty - sellQty);
    logFundActivity(fundId,'trade_sell',actorId,sym,sellQty,c.price,proceeds,`Sell ${sellQty}× ${sym} @ Ƒ${c.price.toFixed(2)}`);
    pushHeadline(`${fund.name}: sold ${sellQty}× ${sym} @ Ƒ${c.price.toFixed(2)}`, 'neutral', sym);
  } else {
    return { ok:false, error:'invalid_side' };
  }
  if (fund.type==='flsh') updateFLSHPrice();
  snapshotFund(fundId);
  return { ok:true, price:c.price };
}

// Can this actor participate in a house's governance (propose/vote)?
function houseMember(fund, actor) {
  if (!actor) return false;
  if (fund.type==='patreon') return isGuildEligible(actor);
  if (fund.type==='flsh')    return isDevAccount(actor.id);
  return isInFund(fund.id, actor.id);
}
// Is this actor the house's executive (owner)?
function houseOwner(fund, actor) {
  if (!actor) return false;
  if (fund.type==='flsh')    return isDevAccount(actor.id);
  if (fund.type==='patreon') return isOwnerAccount(actor.id); // only prime owner runs the guild
  return fund.owner_id === actor.id;
}
// Officer role this actor holds in the fund ('treasurer'|'trader'|'whip'|null).
// The owner implicitly holds every power, so callers check `houseOwner || role==='x'`.
function fundRole(fund, actor) {
  if (!actor) return null;
  try { return getFundOfficerRole(fund.id, actor.id); } catch(_) { return null; }
}
// Vote weight for an actor under the house's vote_weight setting.
function houseVoteWeight(fund, playerId) {
  const w = fund.vote_weight || 'equal';
  if (w === 'shares') {
    const m = getFundMembership(fund.id, playerId);
    return Math.max(0, m?.shares || 0);
  }
  if (w === 'tenure') {
    const m = getFundMembership(fund.id, playerId);
    if (!m) return 0;
    // 1 vote on join, +1 per full day in the fund — elders out-weigh newcomers.
    return 1 + Math.floor((Date.now() - (m.joined_at || Date.now())) / 86400000);
  }
  return 1;
}
function broadcastHouseUpdate(fundId) {
  try {
    const snap = fundDetailSnapshot(fundId, null);
    broadcastToFundMembers(fundId, { type:'fund_update', data:{ fundId, ...snap }});
  } catch(_) {}
}

// Members eligible to vote: everyone in equal mode, shareholders only in share mode
// (0-weight members can't vote, so they don't block early resolution). Owner included.
function houseEligibleVoters(fund) {
  const members = getFundMemberships(fund.id);
  if ((fund.vote_weight||'equal') === 'shares') {
    return members.filter(m => (m.shares||0) > 0).map(m => m.player_id);
  }
  return members.map(m => m.player_id);
}

// Apply a proposal's outcome (shared by the timer and early resolution).
function resolveHouseProposalDecision(fund, p) {
  const gov = fund.governance || 'executive';
  const totalCast = (p.votes_yes||0) + (p.votes_no||0);
  const wouldPass = totalCast > 0 && p.votes_yes > p.votes_no;
  if (gov === 'vote') {
    if (wouldPass) {
      const r = executeFundTrade(fund.id, p.side, p.symbol, p.qty, p.proposer_id);
      resolveHouseProposal(p.id, r.ok ? 'passed' : 'failed_exec', r.ok);
      pushHeadline(`${fund.name}: vote ${r.ok?'passed':'failed'}, ${p.side} ${p.qty}× ${p.symbol}`, r.ok?'good':'bad', p.symbol);
    } else {
      resolveHouseProposal(p.id, totalCast > 0 ? 'rejected' : 'expired', false);
    }
  } else if (gov === 'council') {
    // Advisory — owner has final execute/veto.
    resolveHouseProposal(p.id, wouldPass ? 'advisory_pass' : 'advisory_fail', false);
  } else {
    resolveHouseProposal(p.id, 'expired', false);
  }
  broadcastHouseUpdate(fund.id);
}

// After a vote lands: if every eligible member has voted, resolve now instead of
// waiting out the timer.
function maybeResolveEarly(fund, proposalId) {
  const prop = getHouseProposal(proposalId);
  if (!prop || prop.status !== 'open') return false;
  const eligible = houseEligibleVoters(fund);
  if (eligible.length === 0) return false;
  const voted = new Set(getHouseVoterIds(proposalId));
  if (!eligible.every(id => voted.has(id))) return false;
  resolveHouseProposalDecision(fund, prop);
  return true;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT          = process.env.PORT || 7777;
const TICK_MS       = 500;
const NEWS_MS       = 7132;
const START_CASH    = 1000;
const TAX_RATE      = 0.02;
const MAX_SHARES    = 1_000_000;
const TRADE_TAX_BPS = parseInt(process.env.TRADE_TAX_BPS || '25', 10);

// ── Large-order market impact (anti-farm: caps "massive" extraction) ──────────
// Only orders whose NOTIONAL (price x qty) crosses the threshold move the tape and
// pay slippage; normal trades fill at quote with zero impact. The trader eats their
// OWN impact (fill priced off the move they cause), so a big correct bet partly
// closes its edge instead of printing free size. Computed per executed leg, not per
// order qty, so a tiny short-cover with a huge order can't move the tape.
const IMPACT_THRESHOLD_C = parseInt(process.env.IMPACT_THRESHOLD_C || '100000000', 10); // F1,000,000 notional, in cents
const IMPACT_K           = parseFloat(process.env.IMPACT_K || '0.04'); // slip per 1x-threshold over the line
const IMPACT_MAX_FRAC    = parseFloat(process.env.IMPACT_MAX_FRAC || '0.12'); // hard cap: 12% per order
const IMPACT_SELL_SIDE   = (process.env.IMPACT_SELL_SIDE || '1') !== '0'; // symmetric by default; '0' = buys-only

// ── News-as-driver: a headline move splits into an instant gap + decaying drift ──
// The gap lands the moment the headline prints, so reading the public feed gives no
// tradeable lead; the thin residual drift gives the chart its story over a window.
const NEWS_GAP_FRAC    = parseFloat(process.env.NEWS_GAP_FRAC || '0.7'); // 70% instant, 30% drift
const NEWS_DRIFT_TICKS = parseInt(process.env.NEWS_DRIFT_TICKS || '240', 10); // residual window (~2 min @500ms)
const PATREON_WEBHOOK_SECRET = process.env.PATREON_WEBHOOK_SECRET || '';
const INCOME_INTERVAL_MS = 30 * 60 * 1000;

// ─── Day-trade limiter (server-authoritative, resets each 30-min EOD cycle) ──
const DAY_TRADE_CAP = 3;
const _dtState = new Map(); // playerId → { roundTrips, tickets:{SYM:n}, shortTickets:{SYM:n} }
function _dtGet(pid) {
  if (!_dtState.has(pid)) _dtState.set(pid, { roundTrips:0, tickets:{}, shortTickets:{} });
  return _dtState.get(pid);
}
function _dtRemaining(pid) { return Math.max(0, DAY_TRADE_CAP - _dtGet(pid).roundTrips); }
function _dtResetAll() { _dtState.clear(); }

// ─── President of The Coalition — singular contested title ────────────────────
let president = null; // { id, name } or null
const PRESIDENT_PASSIVE = 15_000;
const PRESIDENT_COST    = 1_000_000_000;
// Roll the gravity spawn reference every 6 hours so it tracks recent prices, not server-start prices
const GRAVITY_REFERENCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// 6-hour spawn re-home DISABLED (v1.1.6). Re-anchoring the gravity reference to the
// current price every 6h produced the predictable "always returns to recent center"
// oscillation traders farmed. _spawnLnP is now a fixed origin (set at spawn, persisted
// across restarts), so the only structural pull left is the far lifetime-gain backstop.
// GRAVITY_REFERENCE_INTERVAL_MS retained for reference; interval intentionally unregistered.

// v5.0 config
const EARNINGS_INTERVAL_MS  = 8  * 60 * 1000;  // 8 minutes
const DIVIDEND_INTERVAL_MS  = 2  * 60 * 60 * 1000; // 2 hours
const BORROW_INTERVAL_MS    = 30 * 60 * 1000;   // 30 minutes
const BORROW_RATE           = 0.001;  // 0.1% of position value per 30min
// Collateral model: shorting no longer requires upfront cash margin or a share cap.
// Proceeds are LOCKED as collateral (shortCollC) instead of credited to spendable cash,
// so the only way to realize cash from a short is to cover at a profit. These two are
// retained for reference but no longer enforced.
const SHORT_MARGIN_RATE     = 0.50;   // (unused) was: 50% cash collateral required
const MAX_SHORT_PER_SYM     = 500;    // (unused) was: hard share cap per symbol
const MARGIN_CALL_RATIO     = 1.65;   // issue a margin call when cover cost >= 1.65x avg entry (65% underwater)
const MARGIN_CALL_CLEAR     = 1.60;   // clear the call once back under 1.60x (hysteresis, stops flapping at the line)
const MARGIN_CALL_GRACE_MS  = 3 * 60 * 60 * 1000; // 3h to cover (or recover) before liquidation
const MARGIN_DUNCE_FINE     = 25000;  // flat fine to clear a margin-call dunce
const DEBTOR_TITLE          = 'Debtor';
const DIVIDEND_RATE         = 0.006;  // 0.6% of position value per 2h
const DIVIDEND_SECTORS      = new Set([0, 2, 4, 6]); // Finance, Insurance, Energy, Tech
const SECTOR_NAMES          = ['Finance','Biotech','Insurance','Manufacturing','Energy','Logistics','Tech','Misc'];

// DEV_ACCOUNTS env: comma-separated list of dev account names.
// Must include 'MrFlesh' — e.g. DEV_ACCOUNTS=MrFlesh,DEV-FIXER,DEV-SLUT,DEV-SMASHER,DEV-GURU,DEV-PEAK
// MrFlesh is the prime/owner account (is_prime=1 set by seed_devaccounts.mjs).
const DEV_ACCOUNTS = (process.env.DEV_ACCOUNTS || '').split(',').map(s=>s.trim()).filter(Boolean);

// ─── RNG ──────────────────────────────────────────────────────────────────────

let __SEED = 0x9E3779B9;
function seededRand() {
  let x = __SEED>>>0; x^=x<<13; x^=x>>>17; x^=x<<5; __SEED=x>>>0;
  return (__SEED>>>0)/4294967296;
}
let __haveSpare=false,__spare=0;
function randn() {
  if(__haveSpare){__haveSpare=false;return __spare;}
  let u=0,v=0; while(u===0)u=seededRand(); while(v===0)v=seededRand();
  const r=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  __spare=Math.sqrt(-2*Math.log(u))*Math.sin(2*Math.PI*v); __haveSpare=true; return r;
}
const MARKET_SEED=1337;
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rngSeeded(sym,key){let x=(hashStr(String(sym))^hashStr(String(key))^MARKET_SEED)>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;return((x>>>0)/4294967296);}
const rng=(min,max)=>Math.random()*(max-min)+min;
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];

// ─── Numeric helpers ──────────────────────────────────────────────────────────

function toCents(n){return Math.max(0,Math.round(Number(n||0)*100));}
function fromCents(c){return Math.max(0,Math.round(Number(c||0))/100);}
function safeAddCash(a,d){const n=Number(a.cash||0)+Number(d||0);a.cash=(Number.isFinite(n)&&!Number.isNaN(n))?n:0;}

// ─── Exchange core ────────────────────────────────────────────────────────────

let FMI={ticker:'FMI',treasury:0,hourlyTaxAccrual:0};
const TICKER_STATE=new Map(), EOH=new Map();
let __lastHourRecorded=new Date().getHours();

function _ensureTickerState(sym,price){
  let s=TICKER_STATE.get(sym);
  if(!s){s={last_trade:price||1,prev_close:price||1,day_volume:0,vwap_num:0,vwap_den:0,ema_last:price||1,flags:0};TICKER_STATE.set(sym,s);}
  return s;
}
function _rollHourIfNeeded(now=new Date()){
  const h=now.getHours(); if(h===__lastHourRecorded)return;
  __lastHourRecorded=h;
  const ts_hour=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,0,0,0).getTime();
  for(const c of companies){
    const s=_ensureTickerState(c.symbol,c.price);
    const vwap_h=s.vwap_den?(s.vwap_num/s.vwap_den):s.last_trade;
    const row={ts_hour,close:s.last_trade,prev_close:s.prev_close,hour_volume:s.day_volume,vwap_hour:vwap_h,fmi_tax_collected:FMI.hourlyTaxAccrual|0,flags:0};
    if(!EOH.has(c.symbol))EOH.set(c.symbol,[]);
    EOH.get(c.symbol).push(row);
    s.prev_close=s.last_trade; s.day_volume=0; s.vwap_num=0; s.vwap_den=0;
  }
  FMI.hourlyTaxAccrual=0;
}

// prevClose map for heatmap pct change
const prevClose = new Map(); // symbol -> price at last daily open

function resetDailyPrevClose() {
  for (const c of companies) {
    prevClose.set(c.symbol, c.price);
  }
}

// ─── Companies ────────────────────────────────────────────────────────────────

const COMPANY_NAMES=["Anchor Biotech","Anchor International","Anchor Realty","Anchor Retail","ApexContraband","AshenTextiles","Aspen Automation","Aspen Energy","Aspen Financial","Atlas Consulting","Atlas Dynamics","Atlas Energy","Atlas Realty","Atlas Supplies","Atlas Textiles","Aurora Electric","Aurora Enterprises","Aurora Metals","Aurora Robotics","Beacon Consulting","Beacon Technologies","BlackCapital","BloodWorks","Blue Media","Blue Packaging","Blue Shipping","BoneMarkets","BoneYards","CarrionFarms","Cascade Minerals","Cascade Pharma","Catalyst Insurance","Catalyst Packaging","Catalyst Pharma","Cedar Dynamics","Cedar Insurance","Cedar Networks","CipherHoldings","CoalitionMetals","Comet Foods","Comet Packaging","Copper Dynamics","Copper Industries","Copper Insurance","Copper Marine","CorpseSystems","Crescent Robotics","Crescent Ventures","CrimsonChains","DarkRobotics","East Consulting","East Foods","East Retail","East Ventures","Evergreen Financial","First Minerals","First Networks","First Works","Frontier Supplies","GhostFoundry","Global Enterprises","Global Supplies","Golden Aerospace","Golden Insurance","Golden Packaging","GraftBiotech","Granite Aerospace","Granite Realty","GraveWorks","Green Shipping","GreyMining","GreywaterLabs","Grove Enterprises","Harbor Enterprises","Harbor Financial","Harbor Media","HollowLogistics","Horizon Automation","Horizon Retail","Liberty Packaging","Liberty Ventures","Lighthouse Logistics","Lumen Shipping","Maple Industries","MireInsurance","Momentum Logistics","National Foods","National Media","National Packaging","National Retail","Neon Retail","Neon Technologies","Nexus Aerospace","Nexus Financial","Nexus Supplies","NightFinance","Nimbus Biotech","Nimbus Realty","NoirTransport","North Biotech","North Consulting","North Industries","North Motors","Nova Biotech","NullSyndicate","Oak Capital","Oak Marine","Oak Ventures","ObsidianShipping","OccultMaterials","OrganCorp","Orion Foods","Orion Logistics","Orion Supplies","PhantomCourier","Pioneer Aerospace","Pioneer Realty","Pioneer Supplies","Pixel Biotech","Pixel Dynamics","Pixel Software","Prairie Financial","Prime Automation","Redwood Materials","Redwood Retail","River Aerospace","River Materials","RogueMinerals","SableSecurity","SeverShipping","ShadePharma","ShadowDynamics","Sierra Aerospace","Sierra Apparel","Sierra Consulting","Sierra Hospitality","Silver Holdings","Silver Motors","Silver Shipping","Silver Works","SinisterFoods","Skyline Packaging","SmugglerIndustries","SmugglerMedia","SmugglerNetworks","South Consulting","South Hardware","South Industries","South Minerals","SpecterIndustries","Summit Automation","Summit Logistics","Summit Retail","Sycamore Partners","Sycamore Software","TempestArms","ToxicChains","UnderNet","United Hospitality","United Insurance","United Technologies","Valley Realty","VeinConsortium","Vertex Aerospace","Vertex Dynamics","Vertex Foods","Vertex Logistics","Vertex Robotics","Vertex Shipping","Vertex Systems","Vertex Ventures","West Hospitality","West Works","Willow Aerospace","Willow Hardware","Willow Labs","WraithEnergy","Zenith Automation","Zenith Health","Zenith Insurance","Zenith Media"];
const NAMES=Array.from(new Set(COMPANY_NAMES.map(n=>n.replace(/\d+$/,'').trim())));
function symbolize(name){const words=String(name||'').replace(/[^A-Za-z ]/g,' ').trim().split(/\s+/).filter(Boolean);let t=words.map(w=>w[0]).join('').toUpperCase();if(t.length<3){const letters=words.join('').toUpperCase();for(let i=1;i<letters.length&&t.length<3;i++)t+=letters[i];}if(t.length<3)t=(t+'FMK').slice(0,3);if(t.length>4)t=t.slice(0,4);return t;}
const companies=NAMES.map((n,i)=>({id:i,name:n,symbol:symbolize(n),price:8+rngSeeded(n,'initprice')*52,ohlc:[],lnP:0,sigma:0.00018+seededRand()*0.00012,mu:-0.000005+seededRand()*0.00001,kappa:0.0008+seededRand()*0.0012,sector:(i%8),offset:-0.3+seededRand()*0.6}));
(()=>{const used=new Set(),letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const c of companies){let sym=c.symbol.replace(/[^A-Z]/g,'').slice(0,4);if(sym.length<3)sym=(sym+'FMKT').slice(0,3);let k=0;while(used.has(sym)){sym=k<26?sym.slice(0,3)+letters[k]:sym.slice(0,2)+letters[Math.floor((k-26)/26)%26]+letters[(k-26)%26];sym=sym.slice(0,4);k++;}c.symbol=sym;used.add(sym);}})();
const SECTOR_TARGETS = [15, 25, 35, 45, 20, 55, 30, 70]; // varied anchors per sector
const SECTORS=new Array(8).fill(0).map((_,i)=>{const ln=Math.log(SECTOR_TARGETS[i]*(0.8+0.4*seededRand()));return{lnIndex:ln,prevLnIndex:ln,sigma:0.00010+seededRand()*0.00008,mu:-0.000002+seededRand()*0.000004,kappa:0.0003+seededRand()*0.0004,target:SECTOR_TARGETS[i]};});
companies.forEach(c=>{c.lnP=Math.log(c.price); c._spawnLnP=c.lnP;});

// ─── Beta Model: per-stock sensitivity to sector moves ────────────────────────
// beta   = how strongly stock reacts to sector CHANGES (0.1=immune, 2.5=amplifier)
// ownTargetLnP = stock's personal "fair value" — drifts independently
// ownKappa     = mean-reversion toward own target (not sector base)
// targetDriftSigma = how fast fair value wanders (creates divergence within sector)
// targetSectorKappa = very weak pull of target toward sector (prevents permanent escape)
companies.forEach(c => {
  c.beta             = Math.max(0.1, Math.min(2.5, Math.exp(randn() * 0.5)));
  c.ownTargetLnP     = c.lnP;
  c.ownKappa         = 0.000005 + seededRand() * 0.000005; // ~7 ticks/day effective pull, balanced against target drift
  c.targetDriftSigma = 0.00012 + seededRand() * 0.00012; // target wanders ~7%/day, creates trends without certainty
  c.targetSectorKappa= 0.000008 + seededRand() * 0.000007; // very weak sector gravity, weeks to pull back
  c.sigma            = 0.00040 + seededRand() * 0.00035; // boosted ~2.5x vs old
});

// ─── Hot Stocks Rotation ──────────────────────────────────────────────────────
// Every 30 minutes, 10 random stocks get a drift boost (5 bullish, 5 bearish).
// Creates natural rotation — players watch the heatmap to spot movers.
let _hotStocks = new Set();
let _hotBias = {}; // stock id → direction (+1 or -1)

function rotateHotStocks() {
  _hotStocks.clear();
  _hotBias = {};
  const indices = companies.filter(c => !c._special).map(c => c.id);
  // Shuffle and pick 10
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const picked = indices.slice(0, 10);
  picked.forEach((id, i) => {
    _hotStocks.add(id);
    _hotBias[id] = i < 5 ? 1 : -1; // first 5 bull, last 5 bear
  });
  // Announce hot stocks via headline
  const bulls = picked.slice(0, 5).map(id => companies[id].symbol);
  const bears = picked.slice(5).map(id => companies[id].symbol);
  pushHeadline(`Market rotation: ${bulls.join(', ')} showing strength, ${bears.join(', ')} under pressure`, 'neutral', null);
  console.log(`[Hot Stocks] Bulls: ${bulls.join(',')} | Bears: ${bears.join(',')}`);
}
// Initial rotation on boot
setTimeout(rotateHotStocks, 5000);

// ─── Colony HQ Mapping: company index → colony headquarters ───────────────────
// Thematic overrides by name prefix, remainder hash-distributed
const COLONY_IDS_ALL = ['new_anchor','cascade_station','frontier_outpost','the_hollow','vein_cluster','aurora_prime','null_point','limbosis','lustandia','gluttonis','abaddon','eyejog','dust_basin','nova_reach','iron_shelf','the_ledger','signal_run','scrub_yard','the_escrow','margin_call','flesh_station'];
const _HQ_PREFIX = {
  'Anchor':'new_anchor','Cascade':'cascade_station','Catalyst':'cascade_station',
  'Frontier':'frontier_outpost','Pioneer':'frontier_outpost',
  'Hollow':'the_hollow','Smuggler':'the_hollow','Phantom':'the_hollow','Noir':'the_hollow','Dark':'the_hollow',
  'Vein':'vein_cluster',
  'Aurora':'aurora_prime',
  'Null':'null_point','Specter':'null_point','Shadow':'null_point','Night':'null_point',
  'Blood':'flesh_station','Organ':'flesh_station','Corpse':'flesh_station','Bone':'flesh_station','Grave':'flesh_station',
  'Graft':'limbosis','Shade':'limbosis','Nimbus':'limbosis',
  'Sinister':'lustandia','Crescent':'lustandia',
  'Comet':'gluttonis','National':'gluttonis','Redwood':'gluttonis',
  'Tempest':'abaddon','Wraith':'abaddon','Crimson':'abaddon','Sever':'abaddon','Occult':'abaddon',
  'Nova':'nova_reach','Nexus':'nova_reach',
  'Copper':'iron_shelf','Granite':'iron_shelf',
  'Silver':'the_ledger','Golden':'the_ledger','Oak':'the_ledger','Prairie':'the_ledger','Evergreen':'the_ledger',
  'Lumen':'signal_run','Momentum':'signal_run','Lighthouse':'signal_run','Obsidian':'signal_run','Summit':'signal_run',
  'Vertex':'eyejog',
  'Grey':'scrub_yard','Mire':'scrub_yard','Rogue':'scrub_yard','Toxic':'scrub_yard','Ashen':'scrub_yard',
  'Cipher':'the_escrow','Black':'the_escrow','Sable':'the_escrow','Under':'the_escrow',
  'Apex':'margin_call','East':'margin_call','First':'margin_call',
  'Coalition':'new_anchor',
};
const COLONY_COMPANIES = {};
for (const cid of COLONY_IDS_ALL) COLONY_COMPANIES[cid] = [];
for (let i = 0; i < companies.length; i++) {
  const name = companies[i].name;
  let assigned = null;
  for (const [prefix, colony] of Object.entries(_HQ_PREFIX)) {
    if (name.startsWith(prefix)) { assigned = colony; break; }
  }
  if (!assigned) {
    const pool = COLONY_IDS_ALL.filter(c => c !== 'flesh_station');
    assigned = pool[hashStr(name) % pool.length];
  }
  companies[i].hq = assigned;
  COLONY_COMPANIES[assigned].push(i);
}
console.log('[Galaxy] Colony HQ mapping:', Object.entries(COLONY_COMPANIES).map(([k,v])=>`${k}:${v.length}`).join(', '));

// ─── Tension Threshold System ─────────────────────────────────────────────────
const TENSION_BANDS = [50, 75, 90];
const _lastTensionBand = {};

function getTensionBand(tension) {
  if (tension >= 90) return 3;
  if (tension >= 75) return 2;
  if (tension >= 50) return 1;
  return 0;
}

function fireTensionEvent(colonyId, band, tension) {
  const targets = COLONY_COMPANIES[colonyId] || [];
  if (!targets.length) return;
  // Severity scales with band
  const severity = band === 3 ? 0.010 : band === 2 ? 0.005 : 0.002;
  const COLONY_DISPLAY = {
    new_anchor:'New Anchor',cascade_station:'Cascade Station',frontier_outpost:'Frontier Outpost',
    the_hollow:'The Hollow',vein_cluster:'Vein Cluster',aurora_prime:'Aurora Prime',
    null_point:'Null Point',flesh_station:'Flesh Station',limbosis:'Limbosis',
    lustandia:'Lustandia',gluttonis:'Gluttonis',abaddon:'Abaddon',eyejog:'Eyejog',
    dust_basin:'Dust Basin',nova_reach:'Nova Reach',iron_shelf:'Iron Shelf',
    the_ledger:'The Ledger',signal_run:'Signal Run',scrub_yard:'Scrub Yard',
    the_escrow:'The Escrow',margin_call:'Margin Call',
  };
  const cName = COLONY_DISPLAY[colonyId] || colonyId;
  const bandLabel = band === 3 ? 'CRITICAL' : band === 2 ? 'HIGH' : 'ELEVATED';
  // Hit all HQ'd companies
  for (const ci of targets) {
    const c = companies[ci];
    if (!c || c._special) continue;
    c.lnP -= severity + Math.random() * (severity * 0.5);
    c.price = Math.max(0.5, Math.exp(c.lnP));
  }
  const headline = `⚠ TENSION ${bandLabel} [${tension}%] at ${cName}, ${targets.length} companies affected, supply chains under strain`;
  pushHeadline(headline, 'bad', '⚠');
  broadcast({ type: 'tension_event', data: { colonyId, band, tension, bandLabel, affected: targets.length } });
}

// ─── Smuggling Run System ─────────────────────────────────────────────────────
const activeSmuggling = new Map();
const TRADE_RUN_COOLDOWN_MS = 15 * 60_000; // shared between shipping & smuggling
const _lastTradeRun = new Map(); // shared cooldown: playerId → timestamp

const CARGO_TYPES = [
  { id:'synth_organs',      name:'Synth Organs',          baseMult:1.8, riskMod:0.10 },
  { id:'contraband_arms',   name:'Contraband Arms',       baseMult:2.2, riskMod:0.15 },
  { id:'data_cores',        name:'Encrypted Data Cores',  baseMult:1.5, riskMod:0.05 },
  { id:'rare_minerals',     name:'Rare Minerals',         baseMult:1.6, riskMod:0.08 },
  { id:'sweet_wine',        name:"S'weet Wine",           baseMult:3.0, riskMod:0.20 },
  { id:'black_market_tech', name:'Black Market Tech',     baseMult:2.5, riskMod:0.18 },
];

// Smuggling bet-size scaling: larger bets = more risk
const SMUGGLE_BET_TIERS = [
  { max: 5_000,   extra: 0.00 },
  { max: 25_000,  extra: 0.10 },
  { max: 100_000, extra: 0.20 },
  { max: Infinity, extra: 0.28 },
];
function smuggleBetRisk(amt) {
  for (const t of SMUGGLE_BET_TIERS) { if (amt <= t.max) return t.extra; }
  return 0.28;
}

// ─── Guards (smuggling escort) ────────────────────────────────────────────────
// Paid risk reduction, priced as a % of the stake. Each tier cuts interception
// chance more for a higher fee. The fee is paid up front AND LOST if the run is
// intercepted — guards die fighting, no reimbursement. This makes guards a real
// spend-to-lower-odds bet, not an insurance safety net.
const GUARD_TIERS = [
  { id:'none',   name:'No Escort',      feeFrac:0.00, riskCut:0.00, desc:'Run it cold. Cheapest, riskiest.' },
  { id:'light',  name:'Light Escort',   feeFrac:0.0533, riskCut:0.08, desc:'A couple of hired guns.' },
  { id:'medium', name:'Armed Convoy',   feeFrac:0.1333, riskCut:0.16, desc:'Serious muscle riding shotgun.' },
  { id:'heavy',  name:'Private Army',   feeFrac:0.2933, riskCut:0.26, desc:'Overwhelming force. Expensive insurance against the void.' },
];
const GUARD_BY_ID = Object.fromEntries(GUARD_TIERS.map(g => [g.id, g]));
function guardFee(tierId, stake) {
  const g = GUARD_BY_ID[tierId] || GUARD_TIERS[0];
  return Math.round(stake * g.feeFrac * 100) / 100;
}
function guardRiskCut(tierId) {
  const g = GUARD_BY_ID[tierId] || GUARD_TIERS[0];
  return g.riskCut;
}
// Syndicate: no risk reduction — instead +15% payout multiplier, +5% risk on own turf
const SYNDICATE_PAYOUT_BONUS = 0.15; // 15% extra payout on smuggling
const SYNDICATE_OWN_TURF_RISK = 0.05; // +5% risk when smuggling through syndicate-controlled colonies

// ─── Shipping Lane System (Legal Commerce) ───────────────────────────────────
const activeShipping = new Map();
const SHIPPING_CARGO = [
  { id:'standard_freight', name:'Standard Freight',  mult:1.15, riskMod:0.00 },
  { id:'premium_goods',    name:'Premium Goods',     mult:1.25, riskMod:0.05 },
  { id:'luxury_supplies',  name:'Luxury Supplies',   mult:1.35, riskMod:0.12 },
];
const SHIPPING_BASE_RISK = 0.05;
const SHIPPING_DUR_SEC = 30;

// ─── COMMODITIES ──────────────────────────────────────────────────────────────
// Control-driven commodity market. Each commodity has a galaxy base price; its
// price PER COLONY floats on which faction leads that colony (vs the commodity's
// sector), local scarcity (mean-reverting random walk), and colony tension.
// Sectors: 0 Finance,1 Biotech,2 Insurance,3 Manufacturing,4 Energy,5 Logistics,6 Tech,7 Misc
const COMMODITIES = [
  // Tech / Industrial (cyberpunk pack)
  { id:'circuit_boards', name:'Circuit Boards', cls:'tech', sector:3, basePrice:1200, vol:0.08, icon:'commodities/tech/circuit_boards.png' },
  { id:'power_cells', name:'Power Cells', cls:'tech', sector:4, basePrice:850, vol:0.07, icon:'commodities/tech/power_cells.png' },
  { id:'fuel_rods', name:'Fuel Rods', cls:'tech', sector:6, basePrice:2600, vol:0.11, icon:'commodities/tech/fuel_rods.png' },
  { id:'scrap_alloy', name:'Scrap Alloy', cls:'tech', sector:3, basePrice:300, vol:0.05, icon:'commodities/tech/scrap_alloy.png' },
  { id:'data_chips', name:'Data Chips', cls:'tech', sector:4, basePrice:1900, vol:0.12, icon:'commodities/tech/data_chips.png' },
  { id:'optic_cabling', name:'Optic Cabling', cls:'tech', sector:6, basePrice:540, vol:0.06, icon:'commodities/tech/optic_cabling.png' },
  { id:'plasma_coils', name:'Plasma Coils', cls:'tech', sector:3, basePrice:3200, vol:0.13, icon:'commodities/tech/plasma_coils.png' },
  { id:'servo_motors', name:'Servo Motors', cls:'tech', sector:4, basePrice:760, vol:0.07, icon:'commodities/tech/servo_motors.png' },
  { id:'nano_filament', name:'Nano Filament', cls:'tech', sector:6, basePrice:4100, vol:0.15, icon:'commodities/tech/nano_filament.png' },
  { id:'frayed_wiring', name:'Frayed Wiring', cls:'tech', sector:3, basePrice:210, vol:0.06, icon:'commodities/tech/frayed_wiring.png' },
  { id:'mag_bearings', name:'Mag Bearings', cls:'tech', sector:4, basePrice:680, vol:0.07, icon:'commodities/tech/mag_bearings.png' },
  { id:'ruby_emitters', name:'Ruby Emitters', cls:'tech', sector:6, basePrice:2400, vol:0.12, icon:'commodities/tech/ruby_emitters.png' },
  { id:'tangle_looms', name:'Tangle Looms', cls:'tech', sector:3, basePrice:430, vol:0.09, icon:'commodities/tech/tangle_looms.png' },
  { id:'rail_hooks', name:'Rail Hooks', cls:'tech', sector:4, basePrice:520, vol:0.06, icon:'commodities/tech/rail_hooks.png' },
  { id:'breaker_lances', name:'Breaker Lances', cls:'tech', sector:6, basePrice:1450, vol:0.1, icon:'commodities/tech/breaker_lances.png' },
  { id:'logic_slates', name:'Logic Slates', cls:'tech', sector:3, basePrice:1650, vol:0.09, icon:'commodities/tech/logic_slates.png' },
  { id:'splice_harness', name:'Splice Harness', cls:'tech', sector:4, basePrice:390, vol:0.08, icon:'commodities/tech/splice_harness.png' },
  { id:'shard_glass', name:'Shard Glass', cls:'tech', sector:6, basePrice:880, vol:0.11, icon:'commodities/tech/shard_glass.png' },
  { id:'alloy_plating', name:'Alloy Plating', cls:'tech', sector:3, basePrice:640, vol:0.06, icon:'commodities/tech/alloy_plating.png' },
  { id:'cobalt_ingots', name:'Cobalt Ingots', cls:'tech', sector:4, basePrice:970, vol:0.07, icon:'commodities/tech/cobalt_ingots.png' },
  { id:'graphite_rods', name:'Graphite Rods', cls:'tech', sector:6, basePrice:360, vol:0.05, icon:'commodities/tech/graphite_rods.png' },
  { id:'ignition_caps', name:'Ignition Caps', cls:'tech', sector:3, basePrice:740, vol:0.09, icon:'commodities/tech/ignition_caps.png' },
  { id:'lens_arrays', name:'Lens Arrays', cls:'tech', sector:4, basePrice:2100, vol:0.11, icon:'commodities/tech/lens_arrays.png' },
  { id:'damper_pins', name:'Damper Pins', cls:'tech', sector:6, basePrice:410, vol:0.06, icon:'commodities/tech/damper_pins.png' },
  { id:'cipher_decks', name:'Cipher Decks', cls:'tech', sector:3, basePrice:2300, vol:0.13, icon:'commodities/tech/cipher_decks.png' },
  { id:'beam_drills', name:'Beam Drills', cls:'tech', sector:4, basePrice:1850, vol:0.1, icon:'commodities/tech/beam_drills.png' },
  { id:'torque_spindles', name:'Torque Spindles', cls:'tech', sector:6, basePrice:690, vol:0.07, icon:'commodities/tech/torque_spindles.png' },
  { id:'relay_chips', name:'Relay Chips', cls:'tech', sector:3, basePrice:1550, vol:0.09, icon:'commodities/tech/relay_chips.png' },
  { id:'coolant_tubes', name:'Coolant Tubes', cls:'tech', sector:4, basePrice:830, vol:0.08, icon:'commodities/tech/coolant_tubes.png' },
  { id:'transistor_packs', name:'Transistor Packs', cls:'tech', sector:6, basePrice:470, vol:0.06, icon:'commodities/tech/transistor_packs.png' },
  { id:'thruster_nozzles', name:'Thruster Nozzles', cls:'tech', sector:3, basePrice:2750, vol:0.12, icon:'commodities/tech/thruster_nozzles.png' },
  { id:'pressure_canisters', name:'Pressure Canisters', cls:'tech', sector:4, basePrice:560, vol:0.07, icon:'commodities/tech/pressure_canisters.png' },
  { id:'mesh_netting', name:'Mesh Netting', cls:'tech', sector:6, basePrice:290, vol:0.05, icon:'commodities/tech/mesh_netting.png' },
  { id:'heat_grilles', name:'Heat Grilles', cls:'tech', sector:3, basePrice:610, vol:0.06, icon:'commodities/tech/heat_grilles.png' },
  { id:'arc_lamps', name:'Arc Lamps', cls:'tech', sector:4, basePrice:780, vol:0.08, icon:'commodities/tech/arc_lamps.png' },
  { id:'filter_stacks', name:'Filter Stacks', cls:'tech', sector:6, basePrice:520, vol:0.06, icon:'commodities/tech/filter_stacks.png' },
  { id:'crystal_cores', name:'Crystal Cores', cls:'tech', sector:3, basePrice:4600, vol:0.16, icon:'commodities/tech/crystal_cores.png' },
  { id:'gyro_rotors', name:'Gyro Rotors', cls:'tech', sector:4, basePrice:1250, vol:0.09, icon:'commodities/tech/gyro_rotors.png' },
  { id:'molten_slag', name:'Molten Slag', cls:'tech', sector:6, basePrice:180, vol:0.07, icon:'commodities/tech/molten_slag.png' },
  { id:'sentry_units', name:'Sentry Units', cls:'tech', sector:3, basePrice:3400, vol:0.13, icon:'commodities/tech/sentry_units.png' },
  // Medical (medicine pack)
  { id:'stimpacks', name:'Stimpacks', cls:'med', sector:1, basePrice:1800, vol:0.1, icon:'commodities/med/stimpacks.png' },
  { id:'vaccine_vials', name:'Vaccine Vials', cls:'med', sector:2, basePrice:2200, vol:0.09, icon:'commodities/med/vaccine_vials.png' },
  { id:'first_aid_kits', name:'First-Aid Kits', cls:'med', sector:1, basePrice:600, vol:0.06, icon:'commodities/med/first_aid_kits.png' },
  { id:'synth_blood', name:'Synth-Blood', cls:'med', sector:2, basePrice:3400, vol:0.13, icon:'commodities/med/synth_blood.png' },
  { id:'painkillers', name:'Painkillers', cls:'med', sector:1, basePrice:950, vol:0.08, icon:'commodities/med/painkillers.png' },
  { id:'antitoxins', name:'Antitoxins', cls:'med', sector:2, basePrice:2700, vol:0.11, icon:'commodities/med/antitoxins.png' },
  { id:'surgical_kits', name:'Surgical Kits', cls:'med', sector:1, basePrice:1500, vol:0.07, icon:'commodities/med/surgical_kits.png' },
  { id:'gene_serum', name:'Gene Serum', cls:'med', sector:2, basePrice:5200, vol:0.16, icon:'commodities/med/gene_serum.png' },
  { id:'bandage_packs', name:'Bandage Packs', cls:'med', sector:1, basePrice:320, vol:0.05, icon:'commodities/med/bandage_packs.png' },
  { id:'capsule_packs', name:'Capsule Packs', cls:'med', sector:2, basePrice:540, vol:0.07, icon:'commodities/med/capsule_packs.png' },
  { id:'red_tablets', name:'Red Tablets', cls:'med', sector:1, basePrice:430, vol:0.06, icon:'commodities/med/red_tablets.png' },
  { id:'spore_pills', name:'Spore Pills', cls:'med', sector:2, basePrice:880, vol:0.09, icon:'commodities/med/spore_pills.png' },
  { id:'blister_strips', name:'Blister Strips', cls:'med', sector:1, basePrice:360, vol:0.05, icon:'commodities/med/blister_strips.png' },
  { id:'gel_caps', name:'Gel Caps', cls:'med', sector:2, basePrice:720, vol:0.07, icon:'commodities/med/gel_caps.png' },
  { id:'tonic_bottles', name:'Tonic Bottles', cls:'med', sector:1, basePrice:610, vol:0.06, icon:'commodities/med/tonic_bottles.png' },
  { id:'nerve_sticks', name:'Nerve Sticks', cls:'med', sector:2, basePrice:1100, vol:0.1, icon:'commodities/med/nerve_sticks.png' },
  { id:'field_dressings', name:'Field Dressings', cls:'med', sector:1, basePrice:290, vol:0.05, icon:'commodities/med/field_dressings.png' },
  { id:'remedy_kits', name:'Remedy Kits', cls:'med', sector:2, basePrice:840, vol:0.07, icon:'commodities/med/remedy_kits.png' },
  { id:'medic_cases', name:'Medic Cases', cls:'med', sector:1, basePrice:980, vol:0.07, icon:'commodities/med/medic_cases.png' },
  { id:'inhaler_units', name:'Inhaler Units', cls:'med', sector:2, basePrice:670, vol:0.08, icon:'commodities/med/inhaler_units.png' },
  { id:'cold_packs', name:'Cold Packs', cls:'med', sector:1, basePrice:380, vol:0.05, icon:'commodities/med/cold_packs.png' },
  { id:'trauma_kits', name:'Trauma Kits', cls:'med', sector:2, basePrice:1350, vol:0.08, icon:'commodities/med/trauma_kits.png' },
  { id:'oxygen_pens', name:'Oxygen Pens', cls:'med', sector:1, basePrice:790, vol:0.08, icon:'commodities/med/oxygen_pens.png' },
  { id:'patch_strips', name:'Patch Strips', cls:'med', sector:2, basePrice:450, vol:0.06, icon:'commodities/med/patch_strips.png' },
  { id:'dossier_meds', name:'Ledger Meds', cls:'med', sector:1, basePrice:520, vol:0.06, icon:'commodities/med/dossier_meds.png' },
  { id:'antibiotic_strips', name:'Antibiotic Strips', cls:'med', sector:2, basePrice:930, vol:0.09, icon:'commodities/med/antibiotic_strips.png' },
  { id:'field_manuals', name:'Triage Manuals', cls:'med', sector:1, basePrice:340, vol:0.05, icon:'commodities/med/field_manuals.png' },
  { id:'blue_tablets', name:'Blue Tablets', cls:'med', sector:2, basePrice:560, vol:0.07, icon:'commodities/med/blue_tablets.png' },
  { id:'amber_globes', name:'Amber Globes', cls:'med', sector:1, basePrice:1450, vol:0.11, icon:'commodities/med/amber_globes.png' },
  { id:'dose_syringes', name:'Dose Syringes', cls:'med', sector:2, basePrice:870, vol:0.08, icon:'commodities/med/dose_syringes.png' },
  { id:'serum_flasks', name:'Serum Flasks', cls:'med', sector:1, basePrice:1250, vol:0.1, icon:'commodities/med/serum_flasks.png' },
  { id:'injector_guns', name:'Injector Guns', cls:'med', sector:2, basePrice:1650, vol:0.09, icon:'commodities/med/injector_guns.png' },
  { id:'reagent_cubes', name:'Reagent Cubes', cls:'med', sector:1, basePrice:2100, vol:0.12, icon:'commodities/med/reagent_cubes.png' },
  { id:'micro_needles', name:'Micro-Needles', cls:'med', sector:2, basePrice:980, vol:0.08, icon:'commodities/med/micro_needles.png' },
  { id:'vital_cells', name:'Vital Cells', cls:'med', sector:1, basePrice:740, vol:0.07, icon:'commodities/med/vital_cells.png' },
  { id:'scalpels', name:'Scalpels', cls:'med', sector:2, basePrice:420, vol:0.06, icon:'commodities/med/scalpels.png' },
  { id:'forceps', name:'Forceps', cls:'med', sector:1, basePrice:390, vol:0.05, icon:'commodities/med/forceps.png' },
  { id:'spray_antiseptic', name:'Spray Antiseptic', cls:'med', sector:2, basePrice:610, vol:0.07, icon:'commodities/med/spray_antiseptic.png' },
  { id:'suture_clamps', name:'Suture Clamps', cls:'med', sector:1, basePrice:680, vol:0.07, icon:'commodities/med/suture_clamps.png' },
  { id:'cryo_vials', name:'Cryo Vials', cls:'med', sector:2, basePrice:3100, vol:0.14, icon:'commodities/med/cryo_vials.png' },
  // Agricultural (vegetation pack)
  { id:'hydro_greens', name:'Hydroponic Greens', cls:'agri', sector:5, basePrice:220, vol:0.06, icon:'commodities/agri/hydro_greens.png' },
  { id:'exotic_spores', name:'Exotic Spores', cls:'agri', sector:7, basePrice:1500, vol:0.14, icon:'commodities/agri/exotic_spores.png' },
  { id:'grain_bales', name:'Grain Bales', cls:'agri', sector:5, basePrice:180, vol:0.05, icon:'commodities/agri/grain_bales.png' },
  { id:'medicinal_herbs', name:'Medicinal Herbs', cls:'agri', sector:7, basePrice:1100, vol:0.1, icon:'commodities/agri/medicinal_herbs.png' },
  { id:'protein_yeast', name:'Protein Yeast', cls:'agri', sector:5, basePrice:410, vol:0.06, icon:'commodities/agri/protein_yeast.png' },
  { id:'spice_pods', name:'Spice Pods', cls:'agri', sector:7, basePrice:2400, vol:0.15, icon:'commodities/agri/spice_pods.png' },
  { id:'sweet_vine', name:'S\'weet Vine', cls:'agri', sector:5, basePrice:3100, vol:0.17, icon:'commodities/agri/sweet_vine.png' },
  { id:'water_algae', name:'Water Algae', cls:'agri', sector:7, basePrice:150, vol:0.05, icon:'commodities/agri/water_algae.png' },
  { id:'seed_stock', name:'Seed Stock', cls:'agri', sector:5, basePrice:680, vol:0.07, icon:'commodities/agri/seed_stock.png' },
  { id:'sprout_pots', name:'Sprout Pots', cls:'agri', sector:7, basePrice:240, vol:0.06, icon:'commodities/agri/sprout_pots.png' },
  { id:'root_clusters', name:'Root Clusters', cls:'agri', sector:5, basePrice:320, vol:0.07, icon:'commodities/agri/root_clusters.png' },
  { id:'ringbloom', name:'Ringbloom', cls:'agri', sector:7, basePrice:520, vol:0.08, icon:'commodities/agri/ringbloom.png' },
  { id:'leaf_saplings', name:'Leaf Saplings', cls:'agri', sector:5, basePrice:280, vol:0.06, icon:'commodities/agri/leaf_saplings.png' },
  { id:'flower_trays', name:'Flower Trays', cls:'agri', sector:7, basePrice:460, vol:0.07, icon:'commodities/agri/flower_trays.png' },
  { id:'cropwood', name:'Cropwood', cls:'agri', sector:5, basePrice:390, vol:0.06, icon:'commodities/agri/cropwood.png' },
  { id:'redbud_stems', name:'Redbud Stems', cls:'agri', sector:7, basePrice:610, vol:0.08, icon:'commodities/agri/redbud_stems.png' },
  { id:'cactus_fruit', name:'Cactus Fruit', cls:'agri', sector:5, basePrice:870, vol:0.1, icon:'commodities/agri/cactus_fruit.png' },
  { id:'thornpear', name:'Thornpear', cls:'agri', sector:7, basePrice:540, vol:0.08, icon:'commodities/agri/thornpear.png' },
  { id:'broadleaf', name:'Broadleaf', cls:'agri', sector:5, basePrice:300, vol:0.06, icon:'commodities/agri/broadleaf.png' },
  { id:'mossbulb', name:'Mossbulb', cls:'agri', sector:7, basePrice:420, vol:0.07, icon:'commodities/agri/mossbulb.png' },
  { id:'whiteblossom', name:'Whiteblossom', cls:'agri', sector:5, basePrice:760, vol:0.09, icon:'commodities/agri/whiteblossom.png' },
  { id:'lily_shoots', name:'Lily Shoots', cls:'agri', sector:7, basePrice:680, vol:0.08, icon:'commodities/agri/lily_shoots.png' },
  { id:'nightshade_pods', name:'Nightshade Pods', cls:'agri', sector:5, basePrice:1350, vol:0.12, icon:'commodities/agri/nightshade_pods.png' },
  { id:'mudroot', name:'Mudroot', cls:'agri', sector:7, basePrice:260, vol:0.06, icon:'commodities/agri/mudroot.png' },
  { id:'amber_ferns', name:'Amber Ferns', cls:'agri', sector:5, basePrice:590, vol:0.08, icon:'commodities/agri/amber_ferns.png' },
  { id:'bluebulb_greens', name:'Bluebulb Greens', cls:'agri', sector:7, basePrice:450, vol:0.07, icon:'commodities/agri/bluebulb_greens.png' },
  { id:'bloodvine', name:'Bloodvine', cls:'agri', sector:5, basePrice:1450, vol:0.13, icon:'commodities/agri/bloodvine.png' },
  { id:'violet_sprigs', name:'Violet Sprigs', cls:'agri', sector:7, basePrice:830, vol:0.09, icon:'commodities/agri/violet_sprigs.png' },
  { id:'goldflower', name:'Goldflower', cls:'agri', sector:5, basePrice:1100, vol:0.11, icon:'commodities/agri/goldflower.png' },
  { id:'frostfronds', name:'Frostfronds', cls:'agri', sector:7, basePrice:940, vol:0.1, icon:'commodities/agri/frostfronds.png' },
  { id:'soil_starts', name:'Soil Starts', cls:'agri', sector:5, basePrice:270, vol:0.06, icon:'commodities/agri/soil_starts.png' },
  { id:'iceleaf', name:'Iceleaf', cls:'agri', sector:7, basePrice:720, vol:0.09, icon:'commodities/agri/iceleaf.png' },
  { id:'cluster_grapes', name:'Cluster Grapes', cls:'agri', sector:5, basePrice:610, vol:0.08, icon:'commodities/agri/cluster_grapes.png' },
  { id:'cloverstock', name:'Cloverstock', cls:'agri', sector:7, basePrice:330, vol:0.06, icon:'commodities/agri/cloverstock.png' },
  { id:'reed_bundles', name:'Reed Bundles', cls:'agri', sector:5, basePrice:290, vol:0.06, icon:'commodities/agri/reed_bundles.png' },
  { id:'splitleaf', name:'Splitleaf', cls:'agri', sector:7, basePrice:480, vol:0.07, icon:'commodities/agri/splitleaf.png' },
  { id:'bloom_baskets', name:'Bloom Baskets', cls:'agri', sector:5, basePrice:870, vol:0.1, icon:'commodities/agri/bloom_baskets.png' },
  { id:'autumn_fronds', name:'Autumn Fronds', cls:'agri', sector:7, basePrice:560, vol:0.08, icon:'commodities/agri/autumn_fronds.png' },
  { id:'bonsai_stock', name:'Bonsai Stock', cls:'agri', sector:5, basePrice:2200, vol:0.14, icon:'commodities/agri/bonsai_stock.png' },
  { id:'orchid_sprigs', name:'Orchid Sprigs', cls:'agri', sector:7, basePrice:1650, vol:0.13, icon:'commodities/agri/orchid_sprigs.png' },
];
const COMMODITY_BY_ID = Object.fromEntries(COMMODITIES.map(c => [c.id, c]));

// Per-faction price personality by commodity class. Multiplier on base price for a
// colony LED by that faction. <1 = cheap there, >1 = dear there. Guild rows are
// near-1 (efficient/narrow spreads) — its edge is a small tithe on buys, not swings.
const COMMODITY_FACTION_MOD = {
  coalition: { tech:1.00, med:0.82, agri:0.95 }, // regulated/subsidized medical
  syndicate: { tech:1.05, med:1.30, agri:1.10 }, // gouged medical, no regulation
  void:      { tech:0.80, med:1.05, agri:1.35 }, // cheap tech, can't farm
  guild:     { tech:0.98, med:0.98, agri:0.98 }, // narrow, efficient
  contested: { tech:1.10, med:1.20, agri:1.15 }, // scarcity premium when no one leads
  fleshstation:{ tech:1.0, med:1.0, agri:1.0 },
};
const COMMODITY_FACTION_VOL = { coalition:0.6, syndicate:1.5, void:1.3, guild:0.4, contested:1.4, fleshstation:1.0 };
// Colonies that are NOT tradeable commodity markets (not real planets / dev-only).
// Abaddon is the cluster's anchor, not a settled market — excluding it stops it
// dominating the arbitrage board as an artificial high-tension price sink.
const NO_MARKET_COLONIES = new Set(['flesh_station', 'abaddon']);
function isMarketColony(c) {
  if (!c) return false;
  const id = typeof c === 'string' ? c : c.id;
  const fac = typeof c === 'string' ? null : c.faction;
  return !NO_MARKET_COLONIES.has(id) && fac !== 'fleshstation';
}
const GUILD_TITHE = 0.03;          // buy-side surcharge in Guild-led colonies
const COMMODITY_TICK_MS = 5 * 60 * 1000;
const COMMODITY_SUPPLY_DECAY = 0.04; // per tick, supply pressure relaxes toward 0

// ─── SHIP CLASSES ─────────────────────────────────────────────────────────────
// One owned hauler per player sets cargo capacity, transit risk, and (cosmetically)
// the variant shown. Everyone starts with a Courier.
// Every account is born with the Skiff: a free Class-0 frame scaled down off the
// Courier row (25% hold, slightly riskier, zero cost). It is the floor, not a
// purchasable upgrade — it exists so a brand-new player can buy, ship and sell
// commodities the moment they log in instead of being gated behind Ƒ150k.
const STARTER_SHIP_ID = 'skiff';
const SHIP_CLASSES = {
  skiff:     { id:'skiff',     name:'Skiff',     variant:'v0', capacity:2500,  price:0,         riskMod:0.03, desc:'Class-0 issue skiff. Tiny unarmored hold, free with every berth.' },
  courier:   { id:'courier',   name:'Courier',   variant:'v1', capacity:10000, price:150_000,   riskMod:0.00, desc:'Class-1 courier frame. Cheap, nimble, modest hold.' },
  freighter: { id:'freighter', name:'Freighter', variant:'v2', capacity:35000, price:1_500_000, riskMod:0.02, desc:'Mid-bulk hauler. Bigger hold, a fatter target.' },
  hauler:    { id:'hauler',    name:'Hauler',    variant:'v3', capacity:70000, price:5_000_000, riskMod:0.04, desc:'Heavy freight. Massive hold, slow and conspicuous.' },
};
// Returns the player's owned ship class. Players who have never commissioned a
// ship fall back to the free Skiff so the commodity game is usable instantly.
function shipClassFor(playerId) {
  let c = '';
  try { c = getPlayerShipClass(playerId) || ''; } catch(_){}
  return SHIP_CLASSES[c] || SHIP_CLASSES[STARTER_SHIP_ID];
}

// ─── SHIPMENT PHASES ──────────────────────────────────────────────────────────
// A run is 10 minutes flat, split across phases. Risk is weighted toward transit.
// The single interception roll is distributed: each phase carries a share of the
// total intercept chance, rolled as the shipment ENTERS that phase.
const SHIPMENT_TOTAL_MS = 10 * 60 * 1000; // 10 min flat
const SHIPMENT_PHASES = [
  { id:'loading',   label:'Loading supplies',   frac:0.15, riskShare:0.05 },
  { id:'undocking', label:'Undocking',          frac:0.10, riskShare:0.10 },
  { id:'transit',   label:'In transit',         frac:0.45, riskShare:0.65 },
  { id:'dropoff',   label:'Drop-off',           frac:0.15, riskShare:0.15 },
  { id:'return',    label:'Returning empty',    frac:0.15, riskShare:0.05 },
];
// Cumulative ms offset at which each phase STARTS (phase i begins at offset[i]).
const SHIPMENT_PHASE_OFFSETS = (() => {
  const out = []; let acc = 0;
  for (const p of SHIPMENT_PHASES) { out.push(acc); acc += p.frac * SHIPMENT_TOTAL_MS; }
  return out;
})();


// Shipping bet-size scaling: larger shipments = more risk (lighter than smuggling)
const SHIPPING_BET_TIERS = [
  { max: 5_000,    extra: 0.00 },
  { max: 25_000,   extra: 0.05 },
  { max: 100_000,  extra: 0.10 },
  { max: Infinity,  extra: 0.15 },
];
function shippingBetRisk(amt) {
  for (const t of SHIPPING_BET_TIERS) { if (amt <= t.max) return t.extra; }
  return 0.15;
}

// Commodity-arbitrage haul value scaling. Far gentler than the abstract
// shippingBetRisk above: legal hauling is the steady-income path, so a big
// manifest should draw *some* extra attention without the +15% cliff that made
// every worthwhile haul read as a coin-flip. Higher thresholds, smaller steps.
const CARGO_VALUE_RISK_TIERS = [
  { max: 25_000,   extra: 0.00 },
  { max: 100_000,  extra: 0.03 },
  { max: 500_000,  extra: 0.05 },
  { max: Infinity, extra: 0.07 },
];
function cargoValueRisk(value) {
  for (const t of CARGO_VALUE_RISK_TIERS) { if (value <= t.max) return t.extra; }
  return 0.09;
}

// Insurance premium scales with shipment size
const INSURANCE_TIERS = [
  { max: 10_000,   rate: 0.05 },
  { max: 100_000,  rate: 0.07 },
  { max: 500_000,  rate: 0.10 },
  { max: Infinity,  rate: 0.12 },
];
function insurancePremiumRate(amt) {
  for (const t of INSURANCE_TIERS) { if (amt <= t.max) return t.rate; }
  return 0.12;
}

const LANE_RISK = {
  corporate: { intercept:0.15, durSec:30,  payMult:1.0 },
  grey:      { intercept:0.28, durSec:45,  payMult:1.5 },
  contested: { intercept:0.40, durSec:60,  payMult:2.0 },
  dark:      { intercept:0.55, durSec:90,  payMult:3.0 },
};

// LANES_SERVER: mirror of the client LANES array for server-side lookups
const LANES_SERVER = [
  {from:'new_anchor',to:'cascade_station',vol:'high',type:'corporate'},
  {from:'new_anchor',to:'frontier_outpost',vol:'high',type:'corporate'},
  {from:'new_anchor',to:'the_hollow',vol:'medium',type:'grey'},
  {from:'cascade_station',to:'aurora_prime',vol:'high',type:'corporate'},
  {from:'frontier_outpost',to:'the_hollow',vol:'high',type:'grey'},
  {from:'frontier_outpost',to:'aurora_prime',vol:'medium',type:'corporate'},
  {from:'frontier_outpost',to:'vein_cluster',vol:'medium',type:'contested'},
  {from:'the_hollow',to:'null_point',vol:'high',type:'dark'},
  {from:'vein_cluster',to:'null_point',vol:'medium',type:'dark'},
  {from:'vein_cluster',to:'aurora_prime',vol:'medium',type:'grey'},
  {from:'aurora_prime',to:'null_point',vol:'low',type:'contested'},
  {from:'flesh_station',to:'new_anchor',vol:'low',type:'dark'},
  {from:'flesh_station',to:'aurora_prime',vol:'low',type:'dark'},
  {from:'limbosis',to:'abaddon',vol:'medium',type:'contested'},
  {from:'lustandia',to:'abaddon',vol:'medium',type:'contested'},
  {from:'gluttonis',to:'abaddon',vol:'medium',type:'contested'},
  {from:'abaddon',to:'new_anchor',vol:'low',type:'contested'},
  {from:'abaddon',to:'cascade_station',vol:'low',type:'dark'},
  {from:'eyejog',to:'frontier_outpost',vol:'low',type:'grey'},
  {from:'eyejog',to:'the_hollow',vol:'medium',type:'grey'},
  {from:'dust_basin',to:'eyejog',vol:'low',type:'grey'},
  {from:'dust_basin',to:'null_point',vol:'low',type:'grey'},
  {from:'nova_reach',to:'aurora_prime',vol:'low',type:'grey'},
  {from:'nova_reach',to:'iron_shelf',vol:'low',type:'grey'},
  {from:'iron_shelf',to:'cascade_station',vol:'low',type:'grey'},
  {from:'iron_shelf',to:'signal_run',vol:'medium',type:'grey'},
  {from:'the_ledger',to:'null_point',vol:'low',type:'grey'},
  {from:'the_ledger',to:'vein_cluster',vol:'low',type:'grey'},
  {from:'dust_basin',to:'the_ledger',vol:'medium',type:'grey'},
  {from:'the_ledger',to:'signal_run',vol:'medium',type:'corporate'},
  {from:'the_ledger',to:'scrub_yard',vol:'high',type:'dark'},
  {from:'scrub_yard',to:'the_escrow',vol:'medium',type:'dark'},
  {from:'the_escrow',to:'null_point',vol:'high',type:'dark'},
  {from:'margin_call',to:'scrub_yard',vol:'medium',type:'grey'},
  {from:'margin_call',to:'signal_run',vol:'low',type:'grey'},
  {from:'signal_run',to:'aurora_prime',vol:'medium',type:'grey'},
  {from:'signal_run',to:'vein_cluster',vol:'low',type:'grey'},
];

function findLane(from, to) {
  return LANES_SERVER.find(l =>
    (l.from === from && l.to === to) || (l.from === to && l.to === from)
  );
}

// Multi-hop routing: BFS over the lane graph for the fewest-hops path from->to.
// Returns { path:[colonyId,...], lanes:[lane,...] } or null if unreachable.
// Only routes through market colonies as waypoints (no stopping at non-market anchors).
function findRoute(from, to) {
  if (from === to) return null;
  const direct = findLane(from, to);
  if (direct) return { path:[from, to], lanes:[direct] };
  // Build adjacency once per call (graph is small, ~30 edges).
  const adj = {};
  for (const l of LANES_SERVER) {
    (adj[l.from] = adj[l.from] || []).push({ to:l.to, lane:l });
    (adj[l.to]   = adj[l.to]   || []).push({ to:l.from, lane:l });
  }
  const queue = [from];
  const prev = { [from]: null };       // colonyId -> { from, lane }
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const edge of (adj[cur] || [])) {
      if (prev[edge.to] !== undefined) continue;
      // Any colony can be a fly-through waypoint (including non-market gateways like
      // Abaddon, the only link to the cluster). Endpoints are validated upstream;
      // a ship doesn't need to trade at a hop, just pass through it.
      prev[edge.to] = { from:cur, lane:edge.lane };
      queue.push(edge.to);
    }
  }
  if (prev[to] === undefined) return null; // unreachable
  // Reconstruct path back to front.
  const path = [to]; const lanes = [];
  let node = to;
  while (prev[node]) { lanes.unshift(prev[node].lane); path.unshift(prev[node].from); node = prev[node].from; }
  return { path, lanes };
}

// ─── Quest completion framework (layer 3) ────────────────────────────────────
// Declarative quest definitions: an objective (the in-game event that completes
// it) plus a reward. Adding a quest = add an entry here + make sure the relevant
// system calls tryCompleteQuest at its resolve point. Dialogue/desc live
// client-side (codec-data.js); this is the server-authoritative truth.
const QUEST_DEFS = {
  coalition_cold_open: {
    title: 'COLD OPEN',
    objective: { type:'smuggle', from:'new_anchor', to:'the_hollow', cargo:'data_cores' },
    reward: {
      delivered: { spins:3 },
      seized:    { spins:1, refundStake:true },
    },
  },
};

function objectiveMatches(obj, eventType, ev) {
  if (!obj || obj.type !== eventType) return false;
  switch (eventType) {
    case 'smuggle':
    case 'ship_arrive':
      return (!obj.from  || obj.from  === ev.from)
          && (!obj.to    || obj.to    === ev.to)
          && (!obj.cargo || obj.cargo === ev.cargo);
    case 'war_fund':
      return (!obj.colony  || obj.colony  === ev.colony)
          && (!obj.faction || obj.faction === ev.faction);
    case 'blockade':   return (!obj.lane   || obj.lane   === ev.lane);
    case 'short_hold': return (!obj.target || obj.target === ev.target);
    default:           return false;
  }
}

function pickRewardBranch(reward, ev) {
  if (!reward) return null;
  if (ev.outcome && reward[ev.outcome]) return reward[ev.outcome];
  if (reward.default) return reward.default;
  if (reward.spins != null || reward.cash != null || reward.refundStake || reward.itemRarity) return reward;
  return null;
}

function grantQuestReward(p, branch, ev) {
  const out = { spins:0, cash:0, refund:0, item:null };
  if (!branch) return out;
  if (branch.spins) { addSpins(p.id, branch.spins); out.spins = branch.spins; }
  if (branch.cash)  { safeAddCash(p, branch.cash); out.cash = branch.cash; }
  if (branch.refundStake && ev.stake) { safeAddCash(p, ev.stake); out.refund = ev.stake; }
  if (branch.itemRarity) {
    try { const it = rollItemDrop(branch.itemRarity); if (it) { giveItem(p.id, it.id, 'quest'); out.item = it.id; } } catch(_){}
  }
  if (out.cash || out.refund) savePlayer(p);
  return out;
}

// Game systems call this at their resolve points. Completes the first ACTIVE
// quest whose objective matches, grants its reward, notifies the player. Takes
// the player OBJECT (not id) so cash mutations stay on the caller's instance.
function tryCompleteQuest(p, eventType, ev) {
  if (!p || !p.id) return;
  try {
    const quests = getPlayerQuests(p.id);
    for (const q of quests) {
      if (q.status !== 'active') continue;
      const def = QUEST_DEFS[q.id];
      if (!def || !objectiveMatches(def.objective, eventType, ev)) continue;
      if (!completeQuest(p.id, q.id, ev.outcome || 'done')) continue; // single transition guard
      const granted = grantQuestReward(p, pickRewardBranch(def.reward, ev), ev);
      const sockets = playerSockets.get(p.id);
      if (sockets) {
        const out = [ JSON.stringify({ type:'quest_complete', data:{
          questId:q.id, title:def.title || q.id, outcome: ev.outcome || 'done',
          spins:granted.spins, refund:granted.refund, cash:granted.cash, item:granted.item } }) ];
        if (granted.spins) out.push(JSON.stringify({ type:'spin_grant', data:{ spins:granted.spins, reason:(def.title||q.id) } }));
        if (granted.cash || granted.refund) out.push(JSON.stringify({ type:'portfolio', data:snapshotPortfolio(p) }));
        for (const ws of sockets) { for (const m of out) { try { if (ws.readyState===1) ws.send(m); } catch(_){} } }
      }
      return; // one quest per event
    }
  } catch(e) { console.error('tryCompleteQuest:', e); }
}

function resolveSmuggling(playerId) {
  const run = activeSmuggling.get(playerId);
  if (!run) return;
  activeSmuggling.delete(playerId);

  const p = getPlayer(playerId);
  if (!p) return;

  const laneRisk = LANE_RISK[run.laneType] || LANE_RISK.grey;
  const cargo = CARGO_TYPES.find(c => c.id === run.cargoId) || CARGO_TYPES[0];

  const fromState = getColonyState(run.from) || { tension:0, control_coalition:0, control_syndicate:0, control_void:0, control_guild:0 };
  const toState   = getColonyState(run.to)   || { tension:0, control_coalition:0, control_syndicate:0, control_void:0, control_guild:0 };
  const avgTension = ((fromState.tension||0) + (toState.tension||0)) / 2;

  // INVERTED: High tension = LESS risk for smuggling (chaos helps smugglers)
  const tensionMod = -(avgTension / 2000); // up to -5% at 100 tension

  // Bet-size scaling: larger bets = more risk
  const betRisk = smuggleBetRisk(run.stake);

  // Faction bonus: player's faction controlling origin/dest reduces risk
  let factionMod = 0;
  let playerFaction = null;
  try { playerFaction = getPlayerFaction(playerId); } catch(_){}
  if (playerFaction && playerFaction !== 'guild') {
    const ctrlKey = 'control_' + playerFaction;
    const fromCtrl = fromState[ctrlKey] || 0;
    const toCtrl   = toState[ctrlKey]   || 0;
    // Each colony you control: -2% risk (your people look the other way)
    if (fromCtrl >= 40) factionMod -= 0.02;
    if (toCtrl >= 40)   factionMod -= 0.02;
    // Enemy dominant colony: +3% risk
    const fromLeading = ['coalition','syndicate','void','guild'].reduce((b,f)=>(fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b,'coalition');
    const toLeading   = ['coalition','syndicate','void','guild'].reduce((b,f)=>(toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b,'coalition');
    if (fromLeading !== playerFaction && avgTension < 30) factionMod += 0.03;
    if (toLeading !== playerFaction && avgTension < 30)   factionMod += 0.03;
  }

  // Syndicate: no free rides — +5% risk on own turf (enforcers tax you), payout bonus applied later
  let syndicateRisk = 0;
  if (playerFaction === 'syndicate') {
    const fromLeadS = ['coalition','syndicate','void','guild'].reduce((b,f)=>(fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b,'coalition');
    const toLeadS   = ['coalition','syndicate','void','guild'].reduce((b,f)=>(toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b,'coalition');
    if (fromLeadS === 'syndicate') syndicateRisk += SYNDICATE_OWN_TURF_RISK;
    if (toLeadS === 'syndicate')   syndicateRisk += SYNDICATE_OWN_TURF_RISK;
  }

  const laneKey = getLaneKey(run.from, run.to);
  const blockade = activeBlockades.get(laneKey);
  // Smuggling still available during blockade but +10% risk
  const blockadeMod = (blockade && blockade.active) ? 0.10 : 0;

  // Guards (escort) cut interception risk. Fee already charged at launch; lost if caught.
  const guardCut = guardRiskCut(run.guardTier);

  const interceptChance = Math.min(0.85, Math.max(0.05,
    laneRisk.intercept + cargo.riskMod + betRisk + tensionMod + factionMod + syndicateRisk + blockadeMod - guardCut
  ));
  const intercepted = Math.random() < interceptChance;

  // Layer 3: declarative quest completion (see QUEST_DEFS / tryCompleteQuest).
  tryCompleteQuest(p, 'smuggle', { from:run.from, to:run.to, cargo:run.cargoId, stake:run.stake, outcome: intercepted ? 'seized' : 'delivered' });

  const sockets = playerSockets.get(playerId);
  if (intercepted) {
    const headline = `Smuggling run intercepted: ${cargo.name} cargo seized on ${run.from.replace(/_/g,' ')} → ${run.to.replace(/_/g,' ')} lane`;
    pushHeadline(headline, 'bad', '🚨');

    // Void raiding kickback: online Void players split 2% of the intercepted cargo
    try {
      const voidCut = Math.round(run.stake * 0.02 * 100) / 100;
      if (voidCut > 0) {
        const voidPlayers = [];
        for (const [pid] of playerSockets) {
          if (pid === playerId) continue;
          try { if (getPlayerFaction(pid) === 'void') voidPlayers.push(pid); } catch(_){}
        }
        if (voidPlayers.length > 0) {
          const perPlayer = Math.round(voidCut / voidPlayers.length * 100) / 100;
          for (const vid of voidPlayers) {
            const vp = getPlayer(vid);
            if (vp) {
              safeAddCash(vp, perPlayer);
              savePlayer(vp);
              const vs = playerSockets.get(vid);
              if (vs) {
                const vmsg = JSON.stringify({ type:'void_raid_income', data:{ amount: perPlayer, source:'smuggling_intercept', lane: run.from+'→'+run.to }});
                for (const ws of vs) { try { if(ws.readyState===1) ws.send(vmsg); } catch(_){} }
              }
            }
          }
        }
      }
    } catch(_){}

    if (sockets) {
      const msg = JSON.stringify({ type:'smuggling_result', data:{
        success:false, stake:run.stake, cargo:cargo.name,
        guardTier:run.guardTier||'none', guardFee:run.guardFee||0, guardsLost:(run.guardFee||0)>0,
        from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
        cash: p.cash,
      }});
      const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
      for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
    }
  } else {
    const syndicatePayMult = (playerFaction === 'syndicate') ? (1 + SYNDICATE_PAYOUT_BONUS) : 1;
    const payout = Math.round(run.stake * cargo.baseMult * laneRisk.payMult * syndicatePayMult * 100) / 100;
    safeAddCash(p, payout);
    savePlayer(p);

    // Lane share kickback: shareholders get 1% of profit
    try { distributeLaneKickback(laneKey, payout - run.stake, 0.01, playerId); } catch(_){}

    const headline = `Smuggling run cleared: ${cargo.name} delivered via ${run.laneType} lane`;
    pushHeadline(headline, 'good', '📦');
    if (sockets) {
      const msg = JSON.stringify({ type:'smuggling_result', data:{
        success:true, stake:run.stake, payout, cargo:cargo.name,
        guardTier:run.guardTier||'none', guardFee:run.guardFee||0,
        from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
        cash: p.cash,
      }});
      const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
      for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
    }
  }
}

// ─── Shipping Lane Resolution ────────────────────────────────────────────────
function resolveShipping(playerId) {
  const run = activeShipping.get(playerId);
  if (!run) return;
  activeShipping.delete(playerId);

  const p = getPlayer(playerId);
  if (!p) return;

  const cargo = SHIPPING_CARGO.find(c => c.id === run.cargoId) || SHIPPING_CARGO[0];

  const fromState = getColonyState(run.from) || { tension:0, control_coalition:0, control_syndicate:0, control_void:0, control_guild:0 };
  const toState   = getColonyState(run.to)   || { tension:0, control_coalition:0, control_syndicate:0, control_void:0, control_guild:0 };
  const avgTension = ((fromState.tension||0) + (toState.tension||0)) / 2;

  // Normal: High tension = MORE risk for shipping (war zones are dangerous)
  const tensionMod = avgTension / 1500; // up to ~6.7% at 100 tension

  // Faction bonus: your faction controlling origin/dest reduces risk
  let factionMod = 0;
  let playerFaction = null;
  try { playerFaction = getPlayerFaction(playerId); } catch(_){}
  if (playerFaction && playerFaction !== 'guild') {
    const ctrlKey = 'control_' + playerFaction;
    const fromCtrl = fromState[ctrlKey] || 0;
    const toCtrl   = toState[ctrlKey]   || 0;
    // Friendly territory: -2.5% risk per colony
    if (fromCtrl >= 40) factionMod -= 0.025;
    if (toCtrl >= 40)   factionMod -= 0.025;
    // Enemy territory: +4% risk per colony
    const fromLeading = ['coalition','syndicate','void','guild'].reduce((b,f)=>(fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b,'coalition');
    const toLeading   = ['coalition','syndicate','void','guild'].reduce((b,f)=>(toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b,'coalition');
    if (fromLeading !== playerFaction) factionMod += 0.04;
    if (toLeading !== playerFaction)   factionMod += 0.04;
  }

  // Bet-size scaling: larger shipments = more risk
  const betRisk = shippingBetRisk(run.stake);

  const interceptChance = Math.min(0.60, Math.max(0.02,
    SHIPPING_BASE_RISK + cargo.riskMod + tensionMod + factionMod + betRisk
  ));
  const intercepted = Math.random() < interceptChance;

  const sockets = playerSockets.get(playerId);
  if (intercepted) {
    // If insured: player gets stake back, loses only the insurance premium
    if (run.insured) {
      safeAddCash(p, run.stake); // refund stake
      savePlayer(p);
      const headline = `Shipping loss insured: ${cargo.name} cargo on ${run.from.replace(/_/g,' ')} → ${run.to.replace(/_/g,' ')}, claim paid`;
      pushHeadline(headline, 'neutral', '🛡');
      if (sockets) {
        const msg = JSON.stringify({ type:'shipping_result', data:{
          success:false, insured:true, stake:run.stake, insurancePaid:run.insurancePaid,
          cargo:cargo.name, from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
          cash: p.cash, netLoss: run.insurancePaid,
        }});
        const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
        for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
      }
    } else {
      // Total loss — no insurance
      const headline = `Shipping cargo lost: ${cargo.name} seized on ${run.from.replace(/_/g,' ')} → ${run.to.replace(/_/g,' ')} lane, no insurance`;
      pushHeadline(headline, 'bad', '📦');

      // Void raiding kickback: online Void players split 2% of intercepted shipping cargo
      try {
        const voidCut = Math.round(run.stake * 0.02 * 100) / 100;
        if (voidCut > 0) {
          const voidPlayers = [];
          for (const [pid] of playerSockets) {
            if (pid === playerId) continue;
            try { if (getPlayerFaction(pid) === 'void') voidPlayers.push(pid); } catch(_){}
          }
          if (voidPlayers.length > 0) {
            const perPlayer = Math.round(voidCut / voidPlayers.length * 100) / 100;
            for (const vid of voidPlayers) {
              const vp = getPlayer(vid);
              if (vp) {
                safeAddCash(vp, perPlayer);
                savePlayer(vp);
                const vs = playerSockets.get(vid);
                if (vs) {
                  const vmsg = JSON.stringify({ type:'void_raid_income', data:{ amount: perPlayer, source:'shipping_intercept', lane: run.from+'→'+run.to }});
                  for (const ws of vs) { try { if(ws.readyState===1) ws.send(vmsg); } catch(_){} }
                }
              }
            }
          }
        }
      } catch(_){}

      if (sockets) {
        const msg = JSON.stringify({ type:'shipping_result', data:{
          success:false, insured:false, stake:run.stake,
          cargo:cargo.name, from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
          cash: p.cash,
        }});
        const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
        for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
      }
    }
  } else {
    // Success — pay profit
    const payout = Math.round(run.stake * cargo.mult * 100) / 100;
    safeAddCash(p, payout);
    savePlayer(p);

    // Layer 3: deliver-quest completion on successful arrival (no-op until a def matches).
    tryCompleteQuest(p, 'ship_arrive', { to:run.to, cargo:run.cargoId, stake:run.stake, outcome:'delivered' });

    // Lane share kickback: shareholders get 2% of shipping profit
    const laneKey = getLaneKey(run.from, run.to);
    try { distributeLaneKickback(laneKey, payout - run.stake, 0.02, playerId); } catch(_){}

    const headline = `Shipping delivered: ${cargo.name} via ${run.from.replace(/_/g,' ')} → ${run.to.replace(/_/g,' ')}`;
    pushHeadline(headline, 'good', '🚢');
    if (sockets) {
      const msg = JSON.stringify({ type:'shipping_result', data:{
        success:true, stake:run.stake, payout, cargo:cargo.name,
        from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
        cash: p.cash,
      }});
      const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
      for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
    }
  }
}

// ─── Lane Share Kickback: distribute % of profit to lane shareholders ────────
function distributeLaneKickback(laneKey, profit, rate, excludePlayerId) {
  if (profit <= 0) return;
  const kickback = Math.round(profit * rate * 100) / 100;
  if (kickback < 0.01) return;
  try {
    const shares = getLaneShares(laneKey);
    if (!shares || shares.length === 0) return;
    const perShare = Math.round(kickback / shares.length * 100) / 100;
    if (perShare < 0.01) return;
    for (const sh of shares) {
      if (sh.holder_id === excludePlayerId) continue;
      const sp = getPlayer(sh.holder_id);
      if (!sp) continue;
      safeAddCash(sp, perShare);
      savePlayer(sp);
      const ss = playerSockets.get(sh.holder_id);
      if (ss) {
        const smsg = JSON.stringify({ type:'lane_kickback', data:{ amount: perShare, laneKey, source:'trade_volume' }});
        for (const ws of ss) { try { if(ws.readyState===1) ws.send(smsg); } catch(_){} }
      }
    }
  } catch(_){}
}

// ─── Blockade System ──────────────────────────────────────────────────────────
const activeBlockades = new Map();
const BLOCKADE_THRESHOLD   = 1_000_000;
const BLOCKADE_DURATION_MS = 2 * 60 * 60 * 1000;
const BLOCKADE_STOCK_HIT   = 0.005;

function getLaneKey(a, b) { return [a,b].sort().join('|'); }

function activateBlockade(laneKey) {
  const blk = activeBlockades.get(laneKey);
  if (!blk || blk.active) return;
  blk.active = true;
  blk.activatedAt = Date.now();
  blk.expiresAt = Date.now() + BLOCKADE_DURATION_MS;

  const [colA, colB] = laneKey.split('|');
  for (const colId of [colA, colB]) {
    const targets = COLONY_COMPANIES[colId] || [];
    for (const ci of targets) {
      const c = companies[ci];
      if (!c || c._special) continue;
      c.lnP -= BLOCKADE_STOCK_HIT + Math.random() * 0.002;
      c.price = Math.max(0.5, Math.exp(c.lnP));
    }
  }

  const headline = `⛔ BLOCKADE ACTIVE: ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} shipping lane locked down, supply chains disrupted`;
  pushHeadline(headline, 'bad', '⛔');
  broadcast({ type:'blockade_update', data:{ laneKey, active:true, expiresAt:blk.expiresAt, faction:blk.faction, pool:blk.pool, threshold:BLOCKADE_THRESHOLD } });

  blk.timer = setTimeout(() => { expireBlockade(laneKey); }, BLOCKADE_DURATION_MS);
}

function expireBlockade(laneKey) {
  const blk = activeBlockades.get(laneKey);
  if (!blk) return;
  if (blk.timer) clearTimeout(blk.timer);
  activeBlockades.delete(laneKey);
  const [colA, colB] = laneKey.split('|');
  pushHeadline(`Blockade on ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} lane expires, trade flow restored`, 'good', '✅');
  broadcast({ type:'blockade_update', data:{ laneKey, active:false } });
}

function fundCounterBlockade(laneKey, amount) {
  const blk = activeBlockades.get(laneKey);
  if (!blk || !blk.active) return false;
  blk.pool -= amount;
  if (blk.pool <= 0) {
    if (blk.timer) clearTimeout(blk.timer);
    activeBlockades.delete(laneKey);
    const [colA, colB] = laneKey.split('|');
    pushHeadline(`Counter-blockade breaks the ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} lockdown, trade resumes`, 'good', '💥');
    broadcast({ type:'blockade_update', data:{ laneKey, active:false, broken:true } });
    return true;
  }
  broadcast({ type:'blockade_update', data:{ laneKey, active:true, pool:blk.pool, threshold:BLOCKADE_THRESHOLD, faction:blk.faction } });
  return false;
}

// ─── COMMODITY ARBITRAGE SHIPPING ─────────────────────────────────────────────
// Reuses the lane/risk/blockade model from abstract shipping, but the payload is
// real cargo units escrowed out of the player's hold. Persisted in DB so a restart
// doesn't strand goods. Interception seizes the units (insurance refunds buy cost).
function cargoShipmentInterceptChance(playerId, from, to, laneType, qty, unitValue) {
  const laneRisk = LANE_RISK[laneType] || LANE_RISK.grey;
  const fromState = getColonyState(from) || {};
  const toState   = getColonyState(to)   || {};
  const avgTension = ((fromState.tension||0) + (toState.tension||0)) / 2;
  const tensionMod = avgTension / 1800;
  let factionMod = 0;
  let playerFaction = null;
  try { playerFaction = getPlayerFaction(playerId); } catch(_){}
  if (playerFaction && playerFaction !== 'guild') {
    const ck = 'control_' + playerFaction;
    if ((fromState[ck]||0) >= 40) factionMod -= 0.025;
    if ((toState[ck]||0)   >= 40) factionMod -= 0.025;
    const fromLead = ['coalition','syndicate','void','guild'].reduce((b,f)=>(fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b,'coalition');
    const toLead   = ['coalition','syndicate','void','guild'].reduce((b,f)=>(toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b,'coalition');
    if (fromLead !== playerFaction) factionMod += 0.02;
    if (toLead   !== playerFaction) factionMod += 0.02;
  }
  // Cargo value scaling: bigger hauls draw more attention. Uses the gentle
  // commodity-haul tiers, not the steep abstract shippingBetRisk curve.
  const cargoValue = qty * unitValue;
  const valRisk = cargoValueRisk(cargoValue);
  const blk = activeBlockades.get(getLaneKey(from, to));
  const blockadeMod = (blk && blk.active) ? 0.06 : 0;
  // Floor at 0.03 (not 0.02): even a fully-escorted corporate run keeps a sliver
  // of risk, so shipping never becomes a literally free money pump. Inner cap 0.52
  // so that, after the ship/fly-by adders, the riskiest unescorted run lands ~50%.
  return Math.min(0.52, Math.max(0.03,
    SHIPPING_BASE_RISK + laneRisk.intercept * 0.35 + tensionMod + factionMod + valRisk + blockadeMod));
}

// Apply an interception outcome (cargo lost; ship survives, returns empty).
function applyCargoInterception(s) {
  const p = getPlayer(s.player_id);
  const com = COMMODITY_BY_ID[s.commodity_id];
  const sockets = playerSockets.get(s.player_id);
  const send = (type, data) => {
    if (!sockets) return;
    const msg = JSON.stringify({ type, data });
    for (const ws of sockets) { try { if (ws.readyState===1) ws.send(msg); } catch(_){} }
    if (p) { const pf = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)}); for (const ws of sockets){ try{ if(ws.readyState===1) ws.send(pf);}catch(_){} } }
  };
  if (s.insured && p) {
    // Half-cover: insurance pays back 50% of the cargo cost, not the whole stake.
    // Premium and any escort fee are already gone, so an insured loss still stings.
    const refund = Math.round(s.buy_cost * 0.5 * 100) / 100;
    safeAddCash(p, refund); savePlayer(p);
    pushHeadline(`Cargo insured: ${com?com.name:s.commodity_id} lost on ${s.from_colony.replace(/_/g,' ')} → ${s.to_colony.replace(/_/g,' ')}, half claim paid`, 'neutral', '🛡');
    send('cargo_ship_result', { success:false, insured:true, id:s.id, commodity:com?com.name:s.commodity_id,
      qty:s.qty, from:s.from_colony, to:s.to_colony, refund, cash:p?p.cash:0 });
  } else {
    pushHeadline(`Cargo seized: ${s.qty}× ${com?com.name:s.commodity_id} lost on ${s.from_colony.replace(/_/g,' ')} → ${s.to_colony.replace(/_/g,' ')}`, 'bad', '📦');
    try {
      const cut = Math.round(s.buy_cost * 0.02 * 100) / 100;
      if (cut > 0) {
        const voids = [];
        for (const [pid] of playerSockets) { if (pid===s.player_id) continue; try { if (getPlayerFaction(pid)==='void') voids.push(pid); } catch(_){} }
        if (voids.length) { const per = Math.round(cut/voids.length*100)/100;
          for (const vid of voids) { const vp=getPlayer(vid); if(vp){ safeAddCash(vp,per); savePlayer(vp);
            const vs=playerSockets.get(vid); if(vs){ const vm=JSON.stringify({type:'void_raid_income',data:{amount:per,source:'cargo_intercept',lane:s.from_colony+'→'+s.to_colony}}); for(const ws of vs){try{if(ws.readyState===1)ws.send(vm);}catch(_){}} } } }
        }
      }
    } catch(_){}
    send('cargo_ship_result', { success:false, insured:false, id:s.id, commodity:com?com.name:s.commodity_id,
      qty:s.qty, from:s.from_colony, to:s.to_colony, cash:p?p.cash:0 });
  }
  // Ship survives — mark intercepted but let it finish the return phase empty.
  setCargoShipmentStatus(s.id, 'intercepted');
}

function deliverCargoShipment(s) {
  const p = getPlayer(s.player_id);
  const com = COMMODITY_BY_ID[s.commodity_id];
  addCargo(s.player_id, s.commodity_id, s.qty, Math.round((s.buy_cost / s.qty) * 100) / 100, s.to_colony);
  setCargoShipmentStatus(s.id, 'delivered');
  pushHeadline(`Cargo delivered: ${s.qty}× ${com?com.name:s.commodity_id} reached ${s.to_colony.replace(/_/g,' ')}`, 'good', '📦');
  const sockets = playerSockets.get(s.player_id);
  if (sockets) {
    const msg = JSON.stringify({ type:'cargo_ship_result', data:{ success:true, id:s.id, commodity:com?com.name:s.commodity_id,
      qty:s.qty, from:s.from_colony, to:s.to_colony, destination:s.to_colony, cash:p?p.cash:0, cargo: cargoSnapshot(s.player_id) }});
    for (const ws of sockets) { try { if (ws.readyState===1) ws.send(msg); } catch(_){} }
  }
}

// Phase stepper: advance every active shipment to the phase its elapsed time implies.
// As a shipment ENTERS a new phase, roll that phase's share of the intercept chance.
// Intercepted runs keep stepping (ship returns empty) but won't deliver cargo.
function stepCargoShipments() {
  const now = Date.now();
  let active;
  try { active = getActiveCargoShipments(); } catch(e) { console.error('[CargoStep]', e); return; }
  for (const s of active) {
    try {
      const elapsed = now - s.created_at;
      // Per-shipment total (multi-hop runs are longer). Derive from stored timestamps
      // so phase boundaries stretch across the whole journey.
      const shipTotal = Math.max(1, (s.resolve_ts || (s.created_at + SHIPMENT_TOTAL_MS)) - s.created_at);
      const scale = shipTotal / SHIPMENT_TOTAL_MS;
      // Determine which phase index elapsed time puts us in (offsets scaled to this run).
      let idx = 0;
      for (let i = 0; i < SHIPMENT_PHASES.length; i++) {
        if (elapsed >= SHIPMENT_PHASE_OFFSETS[i] * scale) idx = i;
      }
      const completed = elapsed >= shipTotal;
      // Advance through any phases we've newly entered, rolling risk for each.
      let curIdx = s.phase_idx;
      let intercepted = (s.status === 'intercepted');
      while (curIdx < idx && !intercepted) {
        curIdx++;
        const phase = SHIPMENT_PHASES[curIdx];
        // This shipment just entered `phase` — roll its share of total risk.
        const phaseChance = (s.intercept_chance || 0) * phase.riskShare;
        if (Math.random() < phaseChance) {
          applyCargoInterception(s);
          intercepted = true;
        }
      }
      if (curIdx !== s.phase_idx) {
        setCargoShipmentPhase(s.id, SHIPMENT_PHASES[curIdx].id, curIdx);
        // Notify client of phase change for the tracker.
        const sockets = playerSockets.get(s.player_id);
        if (sockets) { const m = JSON.stringify({ type:'cargo_phase', data:{ id:s.id, phase:SHIPMENT_PHASES[curIdx].id, phaseIdx:curIdx }}); for (const ws of sockets){ try{ if(ws.readyState===1) ws.send(m);}catch(_){} } }
      }
      // On completion: deliver if it was never intercepted; otherwise just close it.
      if (completed) {
        const fresh = getCargoShipment(s.id);
        if (fresh && fresh.status === 'in_transit') deliverCargoShipment(fresh);
        else if (fresh && fresh.status === 'intercepted') setCargoShipmentStatus(s.id, 'lost');
      }
    } catch(e) { console.error('[CargoStep]', s.id, e); }
  }
}

// Kept for the boot-recovery path: resolve anything already past its full duration.
function sweepCargoShipments() {
  stepCargoShipments();
}


// ─── Lane Shares System (Bonding Curve) ───────────────────────────────────────
// Each lane has up to 100 shares. Price follows a bonding curve: base × (1 + N²/100).
// One share per player. Permanent until colony conquest voids them.
const SHARE_MAX_SLOTS = 100;
const SHARE_CURVE = {
  high:   { base: 1000, div: 100, dividend: 50 },
  medium: { base: 500,  div: 100, dividend: 20 },
  low:    { base: 200,  div: 100, dividend: 8 },
};

function shareBuyPrice(vol, currentSupply) {
  const c = SHARE_CURVE[vol] || SHARE_CURVE.low;
  const N = currentSupply + 1;
  return Math.round(c.base * (1 + (N * N) / c.div));
}

function shareSellPrice(vol, currentSupply) {
  if (currentSupply <= 0) return 0;
  const c = SHARE_CURVE[vol] || SHARE_CURVE.low;
  return Math.round(c.base * (1 + (currentSupply * currentSupply) / c.div));
}

function getShareDividend(vol) {
  return (SHARE_CURVE[vol] || SHARE_CURVE.low).dividend;
}

// War income modifier based on colony tension
function getWarMultiplier(laneKey) {
  const [colA, colB] = laneKey.split('|');
  const sA = getColonyState(colA) || { tension: 0 };
  const sB = getColonyState(colB) || { tension: 0 };
  const maxTension = Math.max(sA.tension || 0, sB.tension || 0);
  let mult = 1.0;
  if (maxTension >= 75) mult = 0.25;
  else if (maxTension >= 50) mult = 0.5;
  // Blockade stacks
  const blk = activeBlockades.get(laneKey);
  if (blk && blk.active) mult *= 0.5;
  return mult;
}

// Find lane vol by key
function getLaneVol(laneKey) {
  const [a, b] = laneKey.split('|');
  const lane = findLane(a, b);
  return lane ? lane.vol : 'low';
}

// ─── Galaxy Systems Persistence ───────────────────────────────────────────────
// All galaxy systems are in-memory. Without persistence, a server restart
// eats every player's active stakes, blockade pools, and contract bids.
function saveGalaxySystems() {
  try {
    const smuggling = [];
    for (const [pid, run] of activeSmuggling) {
      smuggling.push({ playerId: pid, ...run });
    }
    const blockades = [];
    for (const [lk, blk] of activeBlockades) {
      const contribs = {};
      if (blk.contributors) for (const [pid, amt] of blk.contributors) contribs[pid] = amt;
      blockades.push({ laneKey: lk, pool: blk.pool, faction: blk.faction, active: blk.active, activatedAt: blk.activatedAt||null, expiresAt: blk.expiresAt||null, contributors: contribs });
    }
    // Lane shares are in SQLite — no need to save here
    const shipping = [];
    for (const [pid, run] of activeShipping) {
      shipping.push({ playerId: pid, ...run });
    }
    saveGalaxySystemsState({ smuggling, blockades, shipping, savedAt: Date.now() });
  } catch(e) { console.error('[Galaxy save]', e); }
}

function restoreGalaxySystems() {
  try {
    const data = loadGalaxySystemsState();
    if (!data) return;
    const now = Date.now();

    // Restore smuggling runs
    if (Array.isArray(data.smuggling)) {
      for (const run of data.smuggling) {
        if (!run.playerId) continue;
        const remaining = (run.resolveTs || 0) - now;
        activeSmuggling.set(run.playerId, {
          from: run.from, to: run.to, cargoId: run.cargoId,
          stake: run.stake, laneType: run.laneType,
          startTs: run.startTs, resolveTs: run.resolveTs,
        });
        _lastTradeRun.set(run.playerId, run.startTs || now);
        const delay = Math.max(0, remaining);
        setTimeout(() => resolveSmuggling(run.playerId), delay);
      }
      if (data.smuggling.length) console.log(`[Galaxy restore] ${data.smuggling.length} smuggling runs restored`);
    }

    // Restore blockades
    if (Array.isArray(data.blockades)) {
      for (const blk of data.blockades) {
        if (!blk.laneKey) continue;
        const contribs = new Map();
        if (blk.contributors) for (const [pid, amt] of Object.entries(blk.contributors)) contribs.set(pid, amt);
        const restored = { pool: blk.pool, faction: blk.faction, contributors: contribs, active: blk.active, activatedAt: blk.activatedAt, expiresAt: blk.expiresAt, timer: null };
        activeBlockades.set(blk.laneKey, restored);
        if (blk.active) {
          const remaining = (blk.expiresAt || 0) - now;
          if (!blk.expiresAt || remaining <= 0) {
            // Active but already expired (or missing an expiry) — don't resurrect an
            // immortal blockade; clear it so the lane reads open.
            expireBlockade(blk.laneKey);
          } else {
            restored.timer = setTimeout(() => expireBlockade(blk.laneKey), remaining);
          }
        }
      }
      if (data.blockades.length) console.log(`[Galaxy restore] ${data.blockades.length} blockades restored`);
    }

    // Lane shares restored from SQLite automatically
    const shareCount = getAllLaneShares().length;
    if (shareCount) console.log(`[Galaxy restore] ${shareCount} lane shares in DB`);

    // Restore shipping runs
    if (Array.isArray(data.shipping)) {
      for (const run of data.shipping) {
        if (!run.playerId) continue;
        const remaining = (run.resolveTs || 0) - now;
        activeShipping.set(run.playerId, {
          from: run.from, to: run.to, cargoId: run.cargoId,
          stake: run.stake, insured: run.insured, insurancePaid: run.insurancePaid || 0,
          startTs: run.startTs, resolveTs: run.resolveTs,
        });
        _lastTradeRun.set(run.playerId, run.startTs || now);
        const delay = Math.max(0, remaining);
        setTimeout(() => resolveShipping(run.playerId), delay);
      }
      if (data.shipping.length) console.log(`[Galaxy restore] ${data.shipping.length} shipping runs restored`);
    }

    console.log('[Galaxy] Systems state restored');
  } catch(e) { console.error('[Galaxy restore]', e); }
}

// ─── FLSH company (absurd dev valuation — Ƒ1,000,000,000/share) ─────────────────
// _special:true — excluded from GBM tick. Price drifts via its own slow random walk.
const FLSH_COMPANY = {
  id: 9999, name: 'FLSH Capital', symbol: 'FLSH',
  price: 1_000_000_000, lnP: Math.log(1_000_000_000),
  sigma: 0.00005, mu: 0.000002,
  ohlc: [], _special: true
};
companies.push(FLSH_COMPANY);

// ─── Abaddon cluster special companies ────────────────────────────────────────
// SWT — S'weet (Lustandia wine). Anchored at Ƒ4500 with stronger mean-reversion.
const SWT_COMPANY = {
  id: 9998, name: "S'weet", symbol: 'SWT',
  price: 4500, lnP: Math.log(4500), _spawnLnP: Math.log(4500),
  sigma: 0.00035, mu: 0.00002, kappa: 0.002,
  offset: 2.23,
  ohlc: [], sector: 7,
};
companies.push(SWT_COMPANY);

// BRNC — Baron Corps (Gluttonis material refining). Hard-locked flat at Ƒ0.50
// (penny stock; pinned the same way as SWT/FLSH, see stepMarket).
const BRNC_COMPANY = {
  id: 9997, name: 'Baron Corps', symbol: 'BRNC',
  price: 0.50, lnP: Math.log(0.50), _spawnLnP: Math.log(0.50),
  sigma: 0.00030, mu: -0.00001, kappa: 0.002,
  offset: 0.77,
  ohlc: [], sector: 3,
};
companies.push(BRNC_COMPANY);

// SWT anchored mean-reversion init — BRNC uses default beta model from main loop
SWT_COMPANY.beta             = Math.max(0.1, Math.min(2.5, Math.exp(randn() * 0.5)));
SWT_COMPANY.ownTargetLnP     = SWT_COMPANY.lnP;
SWT_COMPANY.ownKappa         = 0.00015;       // ~30x stronger pull toward own target
SWT_COMPANY.targetDriftSigma = 0.00006;       // half the regular drift
SWT_COMPANY.targetSectorKappa= 0.000004;      // half the regular sector pull
SWT_COMPANY.sigma            = 0.00040 + seededRand() * 0.00035;
SWT_COMPANY._naturalCenter   = Math.log(4500); // permanent anchor at Ƒ4500
SWT_COMPANY._isAnchored      = true;           // skip anti-runaway gravity

// BRNC: assign the same beta-model fields the main forEach loop assigned to other tickers
// (it ran before BRNC was pushed, so we apply them manually here)
BRNC_COMPANY.beta             = Math.max(0.1, Math.min(2.5, Math.exp(randn() * 0.5)));
BRNC_COMPANY.ownTargetLnP     = BRNC_COMPANY.lnP;
BRNC_COMPANY.ownKappa         = 0.000005 + seededRand() * 0.000005;
BRNC_COMPANY.targetDriftSigma = 0.00012 + seededRand() * 0.00012;
BRNC_COMPANY.targetSectorKappa= 0.000008 + seededRand() * 0.000007;
BRNC_COMPANY.sigma            = 0.00040 + seededRand() * 0.00035;

function updateFLSHPrice() {
  // FLSH is permanently pinned at Ƒ1,000,000,000. No drift, no shocks, no splits.
  // It exists as a stable reference asset and dev valuation marker.
  const f = FLSH_COMPANY;
  f.price = 1_000_000_000;
  f.lnP = Math.log(1_000_000_000);

  const now = Date.now();
  // FLSH bar aggregation
  const BAR_MS_F = 5_000;
  if (!f._bar) f._bar = { t: now, o: f.price, h: f.price, l: f.price, c: f.price, v: 0 };
  f._bar.h = Math.max(f._bar.h, f.price);
  f._bar.l = Math.min(f._bar.l, f.price);
  f._bar.c = f.price;
  if (now - f._bar.t >= BAR_MS_F) {
    if (!Array.isArray(f.ohlc)) f.ohlc=[];
    f.ohlc.push({ t: f._bar.t, o: f._bar.o, h: f._bar.h, l: f._bar.l, c: f._bar.c, v: 0 });
    if (f.ohlc.length>400) f.ohlc.shift();
    f._bar = { t: now, o: f.price, h: f.price, l: f.price, c: f.price, v: 0 };
  }
}

// ─── Limit order restore from DB ──────────────────────────────────────────────
try {
  const persisted = dbGetAllLimitOrders();
  const now = Date.now();
  for (const row of persisted) {
    // Expire immediately if past ORDER_EXPIRY_MS
    if (now - row.ts > ORDER_EXPIRY_MS) {
      dbDeleteLimitOrder(row.id);
      continue;
    }
    const orders = getPlayerOrders(row.player_id);
    orders.push({
      id: row.id, playerId: row.player_id,
      side: row.side, symbol: row.symbol,
      qty: row.qty, limitPrice: row.limit_price,
      reservedCash: row.reserved_cash, ts: row.ts
    });
  }
  const total = [...limitOrders.values()].reduce((s,a)=>s+a.length,0);
  if (total) console.log(`[LimitOrders] Restored ${total} open orders from DB`);
} catch(e) { console.error('[LimitOrders] Restore error:', e); }

// ─── Market state restore ─────────────────────────────────────────────────────

const headlines=[];
// Live news header override. null = default "LIVE" header; object = dev-set breaking news.
let breakingNews = null;
function restoreMarketState(){
  const data=loadMarketState(); if(!data)return;
  if(Array.isArray(data.companies)){
    // Build a symbol->company map for safe restore (index-based restore breaks when company list changes)
    const symMap = new Map(companies.map(c=>[c.symbol,c]));
    for(const s of data.companies){
      if(!s||!s.symbol) continue;
      const c = symMap.get(s.symbol);
      if(!c) continue;
      if(typeof s.price==='number') c.price=s.price;
      if(typeof s.lnP  ==='number') c.lnP  =s.lnP;
      if(typeof s.sigma==='number') c.sigma=s.sigma;
      if(typeof s.ownTargetLnP==='number') c.ownTargetLnP=s.ownTargetLnP;
      if(typeof s.beta==='number') c.beta=s.beta;
      if(typeof s._spawnLnP==='number') c._spawnLnP=s._spawnLnP;
      else if(typeof s.lnP==='number') c._spawnLnP=s.lnP; // anchor lifetime-gain backstop to restored price if no persisted origin
      if(Array.isArray(s.ohlc))    c.ohlc =s.ohlc;
    }
  }
  if(Array.isArray(data.headlines))headlines.push(...data.headlines.slice(-200));
  console.log('[Market] State restored');
}
restoreMarketState();
// Force FLSH back to Ƒ1B on startup — it should always start at the post-split base price
FLSH_COMPANY.price = 1_000_000_000;
FLSH_COMPANY.lnP = Math.log(1_000_000_000);
// SWT: force anchor at Ƒ4500 on startup (overwrites any restored DB state)
SWT_COMPANY.price = 4500;
SWT_COMPANY.lnP = Math.log(4500);
SWT_COMPANY._spawnLnP = SWT_COMPANY.lnP;
SWT_COMPANY.ownTargetLnP = SWT_COMPANY.lnP;
SWT_COMPANY._naturalCenter = SWT_COMPANY.lnP;
console.log(`[SWT] Anchored at Ƒ${SWT_COMPANY.price} on startup`);

// BRNC: one-time fixup if price is broken (negative, NaN, zero, or absurdly high)
if (BRNC_COMPANY.price > 5000 || !isFinite(BRNC_COMPANY.price) || BRNC_COMPANY.price <= 0) {
  console.log(`[FIXUP] BRNC price was Ƒ${BRNC_COMPANY.price}, resetting to compiled default Ƒ65`);
  BRNC_COMPANY.price = 65;
  BRNC_COMPANY.lnP = Math.log(65);
  BRNC_COMPANY._spawnLnP = BRNC_COMPANY.lnP;
  BRNC_COMPANY.ownTargetLnP = BRNC_COMPANY.lnP;
}
restoreGalaxySystems();
resetDailyPrevClose();

// ── Restore President from DB ──
try {
  const savedPres = loadPresidentState();
  if (savedPres && savedPres.id) {
    const presPlayer = getPlayer(savedPres.id);
    if (presPlayer) {
      president = { id: presPlayer.id, name: presPlayer.name };
      console.log(`[President] Restored: ${president.name}`);
    }
  }
} catch(e) { console.error('[President restore]', e); }

// ─── v5.0: Limit Orders ───────────────────────────────────────────────────────
// Map: playerId -> Array<{id, side, symbol, qty, limitPrice, reservedCash, ts}>
const limitOrders = new Map();
const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ── Restore Limit Orders from DB ──
try {
  const savedOrders = dbGetAllLimitOrders();
  const now = Date.now();
  let restored = 0, expired = 0;
  for (const row of savedOrders) {
    // Skip expired orders — refund cash
    if (now - row.ts > ORDER_EXPIRY_MS) {
      if (row.side === 'buy' && row.reserved_cash > 0) {
        const p = getPlayer(row.player_id);
        if (p) { safeAddCash(p, row.reserved_cash); savePlayer(p); }
      }
      try { dbDeleteLimitOrder(row.id); } catch(_) {}
      expired++;
      continue;
    }
    const order = {
      id: row.id, side: row.side, symbol: row.symbol, qty: row.qty,
      limitPrice: row.limit_price, reservedCash: row.reserved_cash || 0,
      ts: row.ts, playerId: row.player_id,
    };
    if (!limitOrders.has(row.player_id)) limitOrders.set(row.player_id, []);
    limitOrders.get(row.player_id).push(order);
    restored++;
  }
  if (restored || expired) console.log(`[Limit Orders] Restored ${restored}, expired ${expired} (cash refunded)`);
} catch(e) { console.error('[Limit Orders restore]', e); }

// ─── Chat rate limiting ────────────────────────────────────────────────────────
const CHAT_COOLDOWN_MS = 500;          // min ms between messages per player
const CHAT_BURST_LIMIT = 6;            // max messages in burst window
const CHAT_BURST_WINDOW_MS = 3000;     // burst window duration
const chatRateMap = new Map();          // playerId -> { lastMs, burstTs, burstCount }

function chatAllowed(playerId) {
  const now = Date.now();
  let r = chatRateMap.get(playerId);
  if (!r) { r = { lastMs: 0, burstTs: now, burstCount: 0 }; chatRateMap.set(playerId, r); }
  // Hard cooldown
  if (now - r.lastMs < CHAT_COOLDOWN_MS) return false;
  // Burst window reset
  if (now - r.burstTs > CHAT_BURST_WINDOW_MS) { r.burstTs = now; r.burstCount = 0; }
  if (r.burstCount >= CHAT_BURST_LIMIT) return false;
  r.lastMs = now;
  r.burstCount++;
  return true;
}

function getPlayerOrders(playerId) {
  if (!limitOrders.has(playerId)) limitOrders.set(playerId, []);
  return limitOrders.get(playerId);
}

function processLimitOrders() {
  const now = Date.now();
  for (const [playerId, orders] of limitOrders) {
    if (!orders.length) continue;
    const actor = getPlayer(playerId); if (!actor) continue;
    let changed = false;
    const filled = [];
    const expired = [];

    for (let i = orders.length - 1; i >= 0; i--) {
      const o = orders[i];
      // Expire old orders
      if (now - o.ts > ORDER_EXPIRY_MS) {
        // Refund reserved cash for buy orders
        if (o.side === 'buy' && o.reservedCash > 0) {
          safeAddCash(actor, o.reservedCash);
        }
        expired.push(o.id);
        try { dbDeleteLimitOrder(o.id); } catch(_) {}
        orders.splice(i, 1);
        changed = true;
        continue;
      }
      const c = companies.find(x => x.symbol === o.symbol);
      if (!c) continue;
      let fill = false;
      if (o.side === 'buy'  && c.price <= o.limitPrice) fill = true;
      if (o.side === 'sell' && c.price >= o.limitPrice) fill = true;
      if (!fill) continue;

      // Day-trade gate for limit fills
      if (_dtRemaining(playerId) <= 0) {
        broadcastToPlayer(playerId, {type:'error',data:{msg:'❌ Limit order skipped, day-trade limit reached.'}});
        continue;
      }

      const fillPrice = c.price;
      if (o.side === 'buy') {
        const costC = toCents(fillPrice) * o.qty;
        const taxC  = Math.floor(costC * TRADE_TAX_BPS / 10000);
        const totalC = costC + taxC;
        const total  = fromCents(totalC);
        // reserved cash covers the limit price; refund the difference
        const refund = Math.max(0, o.reservedCash - total);
        if (refund > 0) safeAddCash(actor, refund);
        actor.holdings = actor.holdings || {};
        actor.holdings[o.symbol] = (actor.holdings[o.symbol] || 0) + o.qty;
        actor.basisC = actor.basisC || {};
        actor.basisC[o.symbol] = (actor.basisC[o.symbol] || 0) + costC;
        actor.xp += 3;
        FMI.treasury += (taxC / 100); FMI.hourlyTaxAccrual += (taxC / 100);
        try { addFundCash('FLSH', fromCents(costC) * FLSH_TRADE_PCT); } catch(_) {}
        // Day-trade: limit buy fill — cover short = round trip, else issue ticket
        { const dt=_dtGet(playerId); if(dt.shortTickets[o.symbol]>0){dt.shortTickets[o.symbol]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);} else {dt.tickets[o.symbol]=(dt.tickets[o.symbol]||0)+1;} }
        broadcastTradeFeed({ side: 'buy', symbol: o.symbol, qty: o.qty, price: fillPrice, isLimit: true });
      } else {
        const have = actor.holdings ? (actor.holdings[o.symbol] || 0) : 0;
        const sellQty = Math.min(o.qty, have + Math.abs(Math.min(0, have)));
        if (sellQty > 0) {
          actor.holdings[o.symbol] = have - sellQty;
          if (actor.holdings[o.symbol] === 0) delete actor.holdings[o.symbol];
          const grossC = toCents(fillPrice) * sellQty;
          const taxC   = Math.floor(grossC * TRADE_TAX_BPS / 10000);
          safeAddCash(actor, fromCents(grossC - taxC));
          FMI.treasury += (taxC / 100); FMI.hourlyTaxAccrual += (taxC / 100);
          try { addFundCash('FLSH', fromCents(grossC) * FLSH_TRADE_PCT); } catch(_) {}
          const bB = Math.max(0, Number(actor.basisC?.[o.symbol] || 0));
          const avgC = have > 0 ? Math.floor(bB / have) : 0;
          actor.basisC = actor.basisC || {};
          actor.basisC[o.symbol] = Math.max(0, bB - Math.min(bB, avgC * sellQty));
          if ((actor.holdings[o.symbol] || 0) <= 0) { delete actor.holdings[o.symbol]; delete actor.basisC[o.symbol]; }
          // Milestone spin tracking — limit sell fill counts as round-trip
          try {
            const newSpins = recordMilestoneTrade(actor.id);
            const msRow = getSlotRecord(actor.id);
            broadcastToPlayer(actor.id, { type:'milestone_update', data:{ milestoneTrades: msRow.milestone_trades }});
            if (newSpins > 0) {
              broadcastToPlayer(actor.id, { type:'spin_grant', data:{ spins:newSpins, reason:'9 day trades milestone' }});
            }
          } catch(_) {}
          // Day-trade: limit sell fill pairs with buy ticket → round trip
          { const dt=_dtGet(playerId); if(dt.tickets[o.symbol]>0){dt.tickets[o.symbol]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);} }
          broadcastTradeFeed({ side: 'sell', symbol: o.symbol, qty: sellQty, price: fillPrice, isLimit: true });
        }
      }

      filled.push({ orderId: o.id, side: o.side, symbol: o.symbol, qty: o.qty, fillPrice, limitPrice: o.limitPrice });
      try { dbDeleteLimitOrder(o.id); } catch(_) {}
      orders.splice(i, 1);
      changed = true;
    }

    if (changed) {
      actor.level = calcLevel(actor.xp);
      savePlayer(actor);
      try {
        const equity = Object.entries(actor.holdings || {}).reduce((acc,[sym,qty])=>{const co=companies.find(x=>x.symbol===sym);return acc+(co?co.price*qty:0);},0);
        recordNetWorth(actor.id, actor.cash+equity, actor.cash, equity);
      } catch(e) {}
      for (const f of filled) {
        broadcastToPlayer(playerId, { type: 'limit_filled', data: f });
        }
      broadcastToPlayer(playerId, { type: 'orders', data: getPlayerOrders(playerId) });
      broadcastToPlayer(playerId, { type: 'portfolio', data: snapshotPortfolio(actor) });
    }
  }
}

// ─── v5.0: Earnings events ─────────────────────────────────────────────────────
function runEarningsEvent() {
  const eligible = companies.filter(c => !c._special);
  if (!eligible.length) return;
  const c = eligible[Math.floor(Math.random() * eligible.length)];
  const beat = Math.random() > 0.45;
  const magnitude = 0.008 + Math.random() * 0.022; // 0.8–3%
  if (beat) {
    c.lnP += magnitude;
  } else {
    c.lnP -= magnitude;
  }
  c.price = Math.max(0.5, Math.exp(c.lnP));
  const newPrice = c.price;

  const earningsMsg = {
    symbol: c.symbol, name: c.name,
    beat, magnitude: (magnitude * 100).toFixed(1),
    newPrice
  };

  // Broadcast global headline
  const dir = beat ? '▲' : '▼';
  const tone = beat ? 'good' : 'bad';
  pushHeadline(`EARNINGS: ${c.name} (${c.symbol}) ${beat ? 'beats' : 'misses'}, ${dir}${(magnitude*100).toFixed(1)}% @ Ƒ${newPrice.toFixed(2)}`, tone, c.symbol);

  // Notify holders specifically
  for (const [playerId, sockets] of playerSockets) {
    const actor = getPlayer(playerId); if (!actor) continue;
    const qty = (actor.holdings || {})[c.symbol];
    if (qty && qty !== 0) {
      broadcastToPlayer(playerId, { type: 'earnings_alert', data: earningsMsg });
    }
  }
}

// ─── XP / Level helpers (999-level scaling curve) ────────────────────────────
// XP required to advance FROM level n to level n+1 = floor(60 * 1.06^(n-1))
// Level 1→2: 60 XP | Level 10→11: ~107 | Level 50→51: ~1,038 | Level 999: astronomical
function xpToNextLevel(level) {
  return Math.floor(60 * Math.pow(1.06, Math.max(1, level) - 1));
}
function calcLevel(totalXp) {
  let xp = Math.max(0, totalXp || 0);
  let level = 1;
  while (level < 999) {
    const needed = xpToNextLevel(level);
    if (xp < needed) break;
    xp -= needed;
    level++;
  }
  return Math.min(999, level);
}
function xpForNextLevel(totalXp) {
  // Returns [xpIntoCurrentLevel, xpNeededForCurrentLevel]
  let xp = Math.max(0, totalXp || 0);
  let level = 1;
  while (level < 999) {
    const needed = xpToNextLevel(level);
    if (xp < needed) return [xp, needed];
    xp -= needed;
    level++;
  }
  return [0, xpToNextLevel(999)];
}

// ─── Galaxy: Per-colony faction dividend bonuses ──────────────────────────────
// Format: { colonyId: { factionId: { sectorIndex: extraDividendRate } } }
// These stack on top of DIVIDEND_RATE (0.6%). They apply when the player's
// faction is the dominant controller of that colony.
const COLONY_BONUSES = {
  new_anchor:       { coalition:{0:0.012,2:0.008,6:0.005}, syndicate:{0:0.004},        void:{6:0.005}          },
  cascade_station:  { coalition:{3:0.008,7:0.004},          syndicate:{3:0.006},        void:{3:0.003}          },
  frontier_outpost: { coalition:{5:0.008},                  syndicate:{5:0.006,7:0.004},void:{5:0.004}          },
  the_hollow:       { coalition:{7:0.003},                  syndicate:{7:0.015},        void:{7:0.006}          },
  vein_cluster:     { coalition:{1:0.004},                  syndicate:{1:0.012},        void:{1:0.015}          },
  aurora_prime:     { coalition:{6:0.010,4:0.008},          syndicate:{4:0.006},        void:{4:0.012,6:0.008}  },
  null_point:       { coalition:{},                         syndicate:{7:0.008},        void:{1:0.012,4:0.010}  },
  // ── Abaddon Cluster ──────────────────────────────────────────────────────────
  limbosis:         { coalition:{7:0.006},                  syndicate:{7:0.010},        void:{7:0.014}          },
  lustandia:        { coalition:{7:0.006},                  syndicate:{7:0.018},        void:{7:0.010}          },
  gluttonis:        { coalition:{3:0.010},                  syndicate:{3:0.014},        void:{3:0.008}          },
  abaddon:          { coalition:{},                         syndicate:{},               void:{}                 },
  // ── Frontier colonies ────────────────────────────────────────────────────────
  eyejog:           { coalition:{},                         syndicate:{0:0.006,5:0.004},void:{7:0.008}          },
  dust_basin:       { coalition:{3:0.004},                  syndicate:{3:0.006},        void:{3:0.003}          },
  nova_reach:       { coalition:{1:0.008},                  syndicate:{1:0.004},        void:{1:0.010}          },
  iron_shelf:       { coalition:{3:0.006,4:0.004},          syndicate:{3:0.008},        void:{3:0.005}          },
  the_ledger:       { coalition:{0:0.010,2:0.006},          syndicate:{0:0.006},        void:{0:0.004}          },
  signal_run:       { coalition:{5:0.008},                  syndicate:{5:0.010,4:0.004},void:{5:0.006}          },
  // ── Shadow Network colonies ──────────────────────────────────────────────────
  scrub_yard:       { coalition:{},                         syndicate:{0:0.008},        void:{7:0.006,0:0.004}  },
  the_escrow:       { coalition:{0:0.006},                  syndicate:{0:0.004},        void:{5:0.008,0:0.006}  },
  margin_call:      { coalition:{},                         syndicate:{3:0.009,4:0.005},void:{3:0.004}          },
};

// Build sector bonus map for a given player faction from current colony states
// Returns: { sectorIndex -> extraRate }
function buildFactionSectorBonus(playerFaction, colonyStates) {
  const sectorBonus = {};
  for (const colony of colonyStates) {
    if (!colony || !colony.id) continue;
    const bonusTable = COLONY_BONUSES[colony.id];
    if (!bonusTable || !bonusTable[playerFaction]) continue;
    // Check if this faction is the dominant controller of this colony
    const ctrl = {
      coalition: colony.control_coalition || 0,
      syndicate: colony.control_syndicate || 0,
      void:      colony.control_void      || 0,
      guild:     colony.control_guild     || 0,
    };
    // fleshstation colony is always controlled by fleshstation — no bonuses granted here
    if (colony.faction === 'fleshstation') continue;
    const leading = ['coalition','syndicate','void','guild'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition');
    if (leading !== playerFaction) continue;  // must be the leading faction

    const bonuses = bonusTable[playerFaction];
    for (const [sec, rate] of Object.entries(bonuses)) {
      const s = Number(sec);
      // Contested colonies give 50% of the bonus (more volatile)
      const effective = colony.contested ? rate * 0.5 : rate;
      sectorBonus[s] = (sectorBonus[s] || 0) + effective;
    }
  }
  return sectorBonus;
}

// ─── v5.0: Dividends (with faction colony bonuses) ────────────────────────────
function runDividends() {
  let totalPaid = 0;
  // Load colony states and player factions once (outside the player loop)
  let colonyStates = [];
  let playerFactions = {};
  try { colonyStates = getAllColonyStates(); } catch(_) {}
  try { playerFactions = getPlayerFactionsBulk(); } catch(_) {}

  // Guild bonus — EXCLUSIVE to MERCHANTS_GUILD members: +1% per MERCHANTS_GUILD member
  let guildMemberCount = 0;
  const mgMemberIds = new Set();
  try {
    const rows = getFundMemberships('MERCHANTS_GUILD');
    guildMemberCount = rows.length;
    for (const r of rows) mgMemberIds.add(r.player_id);
  } catch(_) {}
  const guildBonusPct = guildMemberCount * 0.01;

  for (const [playerId, sockets] of playerSockets) {
    if (!sockets.size) continue;
    const actor = getPlayer(playerId); if (!actor) continue;

    // Base dividends from DIVIDEND_SECTORS holdings
    let dividend = 0;
    const faction = playerFactions[playerId]?.faction || null;
    const sectorBonus = faction && faction !== 'fleshstation'
      ? buildFactionSectorBonus(faction, colonyStates)
      : {};

    // Eligibility: only shares held through at least DIVIDEND_HOLD_CYCLES (7)
    // trading-day snapshots count. New buys are excluded until they've aged in.
    let eligibleMap = {};
    try { eligibleMap = getEligibleDividendQtyBulk(playerId, actor.holdings || {}); } catch(_) {}

    for (const [sym, qty] of Object.entries(actor.holdings || {})) {
      if (!qty || qty <= 0) continue;
      const eligibleQty = eligibleMap[sym] || 0;
      if (eligibleQty <= 0) continue;
      const c = companies.find(x => x.symbol === sym);
      if (!c) continue;
      const s = c.sector;
      // Dividend sectors (Finance/Insurance/Energy/Tech) get full rate
      if (DIVIDEND_SECTORS.has(s)) {
        const baseRate = DIVIDEND_RATE + (sectorBonus[s] || 0);
        dividend += c.price * eligibleQty * baseRate;
      }
      // All other sectors get a base holding dividend (0.2% per 2h)
      else {
        const holdingRate = 0.002 + (sectorBonus[s] || 0);
        dividend += c.price * eligibleQty * holdingRate;
      }
    }
    if (dividend < 0.01) continue;
    // Apply Merchants Guild bonus ONLY for players in MERCHANTS_GUILD
    if (mgMemberIds.has(actor.id) && guildBonusPct > 0) {
      dividend = dividend * (1 + guildBonusPct);
    }
    dividend = Math.round(dividend * 100) / 100;
    safeAddCash(actor, dividend);
    actor.xp += 3;
    savePlayer(actor);
    totalPaid += dividend;

    // Record net worth after dividend payout
    try {
      const equity = Object.entries(actor.holdings||{}).reduce((acc,[sym,qty])=>{
        const co=companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
      },0);
      recordNetWorth(actor.id, actor.cash+equity, actor.cash, equity);
    } catch(_) {}

    const bonusSectors = Object.keys(sectorBonus).length;
    const label = bonusSectors > 0 && faction
      ? `+Ƒ${dividend.toLocaleString()} dividend  ·  ${faction[0].toUpperCase()+faction.slice(1)} colony bonus active`
      : `+Ƒ${dividend.toLocaleString()} dividend`;
    broadcastToPlayer(playerId, { type: 'dividend', data: { amount: dividend, label } });
    broadcastToPlayer(playerId, { type: 'portfolio', data: snapshotPortfolio(actor) });
  }
  if (totalPaid > 0) console.log(`[Dividends] Paid Ƒ${totalPaid.toFixed(2)} total`);

  // Fund/house dividends: pay into fund cash on the shares the fund holds, at the
  // same base sector rates as players, with the same holding-eligibility window.
  // No faction/guild bonuses (those are player-only perks).
  let fundPaid = 0;
  try {
    for (const fund of getAllFunds()) {
      const portfolio = getFundPortfolio(fund.id);
      if (!portfolio.length) continue;
      const holdingsObj = {};
      for (const h of portfolio) if (h.qty > 0) holdingsObj[h.symbol] = h.qty;
      let eligibleMap = {};
      try { eligibleMap = getEligibleFundDividendQtyBulk(fund.id, holdingsObj); } catch(_) {}
      let dividend = 0;
      for (const [sym, qty] of Object.entries(holdingsObj)) {
        const eligibleQty = eligibleMap[sym] || 0;
        if (eligibleQty <= 0) continue;
        const c = companies.find(x => x.symbol === sym);
        if (!c) continue;
        const rate = DIVIDEND_SECTORS.has(c.sector) ? DIVIDEND_RATE : 0.002;
        dividend += c.price * eligibleQty * rate;
      }
      if (dividend < 0.01) continue;
      dividend = Math.round(dividend * 100) / 100;
      addFundCash(fund.id, dividend);
      logFundActivity(fund.id, 'dividend', null, null, null, null, dividend, `Portfolio dividend +Ƒ${dividend.toLocaleString()}`);
      snapshotFund(fund.id);
      broadcastHouseUpdate(fund.id);
      fundPaid += dividend;
    }
  } catch(e) { console.error('[Fund dividends]', e); }
  if (fundPaid > 0) console.log(`[Dividends] Paid Ƒ${fundPaid.toFixed(2)} to funds`);
}

// ─── v5.0: Short-sell borrow fees ─────────────────────────────────────────────
function runBorrowFees() {
  for (const [playerId, sockets] of playerSockets) {
    if (!sockets.size) continue;
    const actor = getPlayer(playerId); if (!actor) continue;
    let fee = 0;
    for (const [sym, qty] of Object.entries(actor.holdings || {})) {
      if (!qty || qty >= 0) continue; // only short positions (negative qty)
      const c = companies.find(x => x.symbol === sym);
      if (!c) continue;
      fee += c.price * Math.abs(qty) * BORROW_RATE;
    }
    if (fee < 0.01) continue;
    fee = Math.round(fee * 100) / 100;
    actor.cash = Math.max(0, actor.cash - fee);
    savePlayer(actor);
    try {
      const equity = Object.entries(actor.holdings||{}).reduce((acc,[sym,qty])=>{
        const co=companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
      },0);
      recordNetWorth(actor.id, actor.cash+equity, actor.cash, equity);
    } catch(_) {}
    broadcastToPlayer(playerId, { type: 'borrow_fee', data: { amount: fee } });
    broadcastToPlayer(playerId, { type: 'portfolio', data: snapshotPortfolio(actor) });
  }
}

// ─── Margin calls ─────────────────────────────────────────────────────────────
// Gated, not instant. When a short's cover cost crosses MARGIN_CALL_RATIO (1.65x avg
// entry = 65% underwater) the player gets a margin call with a 3h deadline. They survive
// it by covering the position OR by the price recovering below MARGIN_CALL_CLEAR before
// the deadline. Only if a short is STILL >= 1.65x at the deadline do they get liquidated.
// Solvency is irrelevant to nothing here on purpose: a player who can cover simply covers;
// a player who can't (or won't) and doesn't recover is the one who gets wiped.

// Worst short ratio (live cover cost / avg entry) across a player's shorts. 0 if none.
function worstShortRatio(actor, priceMap) {
  let worst = 0, sym = null;
  for (const [s, qty] of Object.entries(actor.holdings || {})) {
    if (!qty || qty >= 0) continue;
    const px = priceMap[s]; if (px == null) continue;
    const shortQty = Math.abs(qty);
    const avgEntry = (Math.abs((actor.basisC || {})[s] || 0) / shortQty) / 100;
    if (avgEntry <= 0) continue;
    const r = px / avgEntry;
    if (r > worst) { worst = r; sym = s; }
  }
  return { worst, sym };
}

// Issue or clear a connected player's margin call based on their live positions.
function evaluateMarginState(actor, priceMap, now) {
  if (isOwnerAccount(actor.id) || isDevAccount(actor.id) || isAdminAccount(actor.id)) return;
  if (isDunced(actor.id)) return;
  const { worst, sym } = worstShortRatio(actor, priceMap);
  const existing = getMarginCall(actor.id);
  if (worst >= MARGIN_CALL_RATIO) {
    if (!existing) {
      const deadline = now + MARGIN_CALL_GRACE_MS;
      setMarginCall(actor.id, sym, now, deadline);
      const hrs = (MARGIN_CALL_GRACE_MS / 3600000);
      const when = new Date(deadline).toUTCString().replace('GMT','UTC');
      broadcastToPlayer(actor.id, { type:'margin_call', data:{ symbol: sym, deadline,
        msg:`⚠ MARGIN CALL on ${sym} — it ran 65% past your entry. Cover it (or it recovers) within ${hrs}h or all positions close, balance wiped, and you're dunced. Deadline: ${when}.` } });
      try { broadcastToPlayer(actor.id, { type:'chat_system', data:{ text:`⚠ MARGIN CALL on ${sym}: cover within ${hrs}h or face liquidation. Deadline ${when}.` } }); } catch(_) {}
      broadcastToAdmins({ type:'admin_log', data:{ action:'margin_call_issued', player: actor.name, symbol: sym, deadline } });
      try { broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(actor) }); } catch(_) {}
    }
  } else if (existing && worst < MARGIN_CALL_CLEAR) {
    clearMarginCall(actor.id);
    broadcastToPlayer(actor.id, { type:'margin_call_cleared', data:{ symbol: existing.symbol } });
    try { broadcastToPlayer(actor.id, { type:'chat_system', data:{ text:`✅ Margin call on ${existing.symbol} cleared — position is back within limits.` } }); } catch(_) {}
    try { broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(actor) }); } catch(_) {}
  }
}

function runMarginCalls() {
  const priceMap = buildPriceMap();
  const now = Date.now();
  // 1) Issue/clear calls for connected players from their live positions.
  for (const [playerId, sockets] of playerSockets) {
    if (!sockets.size) continue;
    const actor = getPlayer(playerId); if (!actor) continue;
    try { evaluateMarginState(actor, priceMap, now); } catch(e) { console.error('[MarginCall] eval', e); }
  }
  // 2) Enforce deadlines for ALL active calls (online or not), re-checking live state so a
  //    player who covered or whose price recovered is never wiped even at the deadline.
  for (const call of getActiveMarginCalls()) {
    if (now < call.deadline) continue;
    const actor = getPlayer(call.player_id);
    if (!actor) { clearMarginCall(call.player_id); continue; }
    if (isOwnerAccount(actor.id) || isDevAccount(actor.id) || isAdminAccount(actor.id) || isDunced(actor.id)) { clearMarginCall(actor.id); continue; }
    const { worst, sym } = worstShortRatio(actor, priceMap);
    if (worst >= MARGIN_CALL_RATIO) settleMarginCall(actor, priceMap);
    else clearMarginCall(actor.id); // covered or recovered in time
  }
}

// Settle a failed margin call. NOT a total wipe. Force-close the underwater short(s),
// realize the loss, and collect that debt: cash first, then liquidate long holdings
// (largest first, only as much as the debt needs). A player who can pay keeps everything
// else and is NOT dunced. Only a player whose loss exceeds their entire account gets
// zeroed and dunced - the natural bankruptcy case. Fund stake is never touched.
function settleMarginCall(actor, priceMap) {
  try {
    priceMap = priceMap || buildPriceMap();
    // 1. Force-close every short at/over the call threshold; sum the realized loss.
    let debtC = 0; const closed = [];
    for (const [sym, qty] of Object.entries({ ...(actor.holdings || {}) })) {
      if (!qty || qty >= 0) continue;
      const px = priceMap[sym]; if (px == null) continue;
      const shortQty = Math.abs(qty);
      const avgEntry = (Math.abs((actor.basisC || {})[sym] || 0) / shortQty) / 100;
      if (avgEntry <= 0 || px < avgEntry * MARGIN_CALL_RATIO) continue; // only the underwater ones
      const coverCostC = toCents(px) * shortQty;
      const taxC = Math.floor(coverCostC * TRADE_TAX_BPS / 10000);
      const collC = (actor.shortCollC || {})[sym] || 0;
      debtC += Math.max(0, coverCostC + taxC - collC); // loss after the locked collateral is applied
      FMI.treasury += (taxC / 100);
      delete actor.holdings[sym]; if (actor.basisC) delete actor.basisC[sym]; if (actor.shortCollC) delete actor.shortCollC[sym];
      closed.push(sym);
    }
    if (!closed.length) { clearMarginCall(actor.id); return false; } // nothing past threshold anymore

    // 2. Collect the debt: cash first, then liquidate longs (largest first) only as needed.
    let balanceC = toCents(actor.cash) - debtC;
    actor.cash = 0;
    if (balanceC < 0) {
      const longs = Object.entries(actor.holdings || {})
        .filter(([, q]) => q > 0)
        .map(([s, q]) => ({ s, q, val: (priceMap[s] || 0) * q }))
        .sort((a, b) => b.val - a.val);
      for (const L of longs) {
        if (balanceC >= 0) break;
        const pxC = toCents(priceMap[L.s]); if (pxC <= 0) continue;
        const grossC = pxC * L.q, taxC = Math.floor(grossC * TRADE_TAX_BPS / 10000);
        FMI.treasury += (taxC / 100);
        delete actor.holdings[L.s]; if (actor.basisC) delete actor.basisC[L.s];
        balanceC += (grossC - taxC);
      }
    }

    // 3. Outcome.
    let dunced = false;
    if (balanceC >= 0) {
      actor.cash = fromCents(balanceC); // solvent: paid the loss, keeps the remainder + any unsold holdings
    } else {
      actor.holdings = {}; actor.basisC = {}; actor.shortCollC = {}; actor.cash = 0; // bankruptcy: natural zero
      actor.ownedTitles = actor.ownedTitles || [];
      if (!actor.ownedTitles.includes(DEBTOR_TITLE)) actor.ownedTitles.push(DEBTOR_TITLE);
      dunced = true;
    }
    savePlayer(actor);
    clearMarginCall(actor.id);
    if (dunced) setDunce(actor.id, 'MARGIN CALL', 'margin_call');
    try { recordNetWorth(actor.id, playerNetWorth(actor), actor.cash, 0); } catch(_) {}

    const symList = closed.join(', ');
    if (dunced) {
      broadcastToPlayer(actor.id, { type:'margin_called', data:{ symbol: symList,
        msg:`📉 MARGIN CALL FAILED on ${symList}. Your loss exceeded everything you owned — account zeroed and you're dunced. Pay Ƒ${MARGIN_DUNCE_FINE.toLocaleString()} to clear the Debtor brand.` } });
      broadcastToPlayer(actor.id, { type:'dunced', data:{ by:'MARGIN CALL', reason:'margin_call' } });
      broadcastToPlayer(actor.id, { type:'title_updated', data:{ title: actor.title, owned: actor.ownedTitles } });
      broadcast({ type:'chat', data:{ id:Math.random().toString(36).slice(2), t:Date.now(), user:'SYSTEM',
        text:`📉 ${actor.name} blew a margin call on ${symList} and was dunced. The house collects.`, badge:'📉', color:'#6b4423', channel:'global' } });
      broadcastToAdmins({ type:'admin_log', data:{ action:'margin_call_bankrupt', player: actor.name, symbol: symList } });
    } else {
      broadcastToPlayer(actor.id, { type:'margin_settled', data:{ symbol: symList,
        msg:`⚠ Margin call on ${symList} expired — the position was auto-liquidated to cover the loss. You kept the rest, no dunce.` } });
      try { broadcastToPlayer(actor.id, { type:'chat_system', data:{ text:`⚠ Margin call on ${symList} settled by liquidation — loss covered from your balance, you kept the rest.` } }); } catch(_) {}
      broadcastToAdmins({ type:'admin_log', data:{ action:'margin_call_settled', player: actor.name, symbol: symList } });
    }
    broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(actor) });
    broadcastLeaderboard();
    return dunced;
  } catch(e) { console.error('[MarginCall] settle error:', e); return false; }
}

// ─── v5.0: Trade Feed ─────────────────────────────────────────────────────────
function broadcastTradeFeed({ side, symbol, qty, price, isLimit = false }) {
  broadcast({
    type: 'trade_feed',
    data: { side, symbol, qty, price: Math.round(price * 100) / 100, isLimit, ts: Date.now() }
  });
}



// ─── Express + WS ─────────────────────────────────────────────────────────────

const app=express();

// Guild eligibility: Patreon tier >= 2 OR dev/admin accounts
function isGuildEligible(player) {
  if (!player) return false;
  return (player.patreon_tier >= 2) || isOwnerAccount(player.id);
}
const server=http.createServer(app);
const wss=new WebSocketServer({server});

app.use('/api/patreon/webhook', express.raw({type:'application/json'}));
app.use(express.json());
app.use('/',express.static(path.join(__dirname,'..','client')));

// Selectable player portraits: allowlist built from the assets dir at boot so the
// client can never set an arbitrary string into an <img src>. Filenames (sans .png).
const PORTRAIT_DIR = path.join(__dirname,'..','client','assets','portraits');
let PORTRAIT_SET = new Set();
try {
  PORTRAIT_SET = new Set(fs.readdirSync(PORTRAIT_DIR).filter(f=>/\.png$/i.test(f)).map(f=>f.replace(/\.png$/i,'')));
  console.log(`[portraits] ${PORTRAIT_SET.size} selectable portraits loaded`);
} catch(e) { console.error('[portraits] could not read', PORTRAIT_DIR, e.message); }

// Gated portraits: not free-select. Selectable only WHILE a specific item is
// equipped (live-gated, so the item stays valuable as a collectable). Their art
// is item art served from the web root, not the portraits dir, so they are not
// in PORTRAIT_SET and are validated separately.
const GATED_PORTRAITS = {
  jarred_brain: { requiresItem: 'jarred_brain', img: 'cyberpunk_jarred_brain.png', name: 'Preserved Brain' },
};

// If the player's current portrait is gated and the gate is no longer satisfied
// (the required item was unequipped), clear it so the avatar reverts.
function enforcePortraitGate(playerId) {
  try {
    const p = getPlayer(playerId);
    if (!p || !p.portrait) return;
    const g = GATED_PORTRAITS[p.portrait];
    if (g && !isItemEquipped(playerId, g.requiresItem)) {
      setPlayerPortrait(playerId, null);
      const sockets = playerSockets.get(playerId);
      if (sockets) {
        const m = JSON.stringify({ type:'portrait_reverted', data:{ portrait:null, reason:'unequipped' } });
        for (const ws of sockets) { try { if (ws.readyState===1) ws.send(m); } catch(_){} }
      }
    }
  } catch(_){}
}

// ─── REST: Auth ───────────────────────────────────────────────────────────────

// ── Name validation ───────────────────────────────────────────────────────────
const BANNED_WORDS = [
  'nigger','nigga','nigg','n1gger','n1gga','faggot','fag','f4g','fagg','retard','retarded',
  'tranny','trannie','kike','spic','wetback','chink','gook','coon','darkie','beaner',
  'towelhead','raghead','sandnigger','zipperhead','cracker','honky',
  'dyke','paki','wog','abo','jap','slant','slope','gypsy','gypsie'
];
function isNameClean(name) {
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const word of BANNED_WORDS) {
    if (lower.includes(word)) return false;
  }
  return true;
}
function isNameValid(name) {
  // Only allow letters, numbers, spaces, underscores, hyphens
  if (!/^[A-Za-z0-9 _-]+$/.test(name)) return false;
  if (name.length < 2 || name.length > 32) return false;
  return true;
}

app.post('/api/register',(req,res)=>{
  try{
    const {name,password}=req.body||{};
    if(!name||!name.trim()) return res.status(400).json({ok:false,error:'name_required'});
    if(!password||password.length<4) return res.status(400).json({ok:false,error:'password_too_short'});
    const trimmed=name.trim().slice(0,32);
    if(!isNameValid(trimmed)) return res.status(400).json({ok:false,error:'name_invalid',message:'Names can only contain letters, numbers, spaces, underscores, and hyphens. No emojis or special characters.'});
    if(!isNameClean(trimmed)) return res.status(400).json({ok:false,error:'name_inappropriate',message:'That name contains inappropriate language.'});
    if(!isNameAvailable(trimmed)) return res.status(409).json({ok:false,error:'name_taken'});
    const id=uuidv4();
    const player=createPlayerSync(id,trimmed,password);
    res.json({ok:true,token:player.id,name:player.name,cash:player.cash,patreon_tier:0});
  }catch(e){console.error('/api/register:',e);res.status(500).json({ok:false,error:'server_error'});}
});

app.post('/api/login',(req,res)=>{
  try{
    const {name,password}=req.body||{};
    if(!name||!password) return res.status(400).json({ok:false,error:'missing_fields'});
    const player=getPlayerByName(name.trim());
    if(!player) return res.status(401).json({ok:false,error:'invalid_credentials'});
    if(!verifyPassword(password,player.password_hash,player.password_salt))
      return res.status(401).json({ok:false,error:'invalid_credentials'});
    touchPlayer(player.id);
    res.json({ok:true,token:player.id,name:player.name,cash:player.cash,xp:player.xp,level:player.level,title:player.title,faction:player.faction||null,portrait:player.portrait||null,patreon_tier:player.patreon_tier||0,is_dev:!!(isDevAccount(player.id)),is_admin:!!(isAdminAccount(player.id)),is_prime:!!(isOwnerAccount(player.id)),void_locked:!!(isVoidLocked(player.id))});
  }catch(e){console.error('/api/login:',e);res.status(500).json({ok:false,error:'server_error'});}
});

app.get('/api/name_available',(req,res)=>{
  const name=String(req.query.name||'').trim();
  res.json({ok:true,available:isNameAvailable(name)});
});

app.get('/api/whoami',(req,res)=>{
  const tok=tokenFrom(req);
  const p=tok?getPlayer(tok):null;
  if(!p) return res.status(404).json({ok:false,error:'not_found'});
  res.json({ok:true,id:p.id,name:p.name,cash:p.cash,holdings:p.holdings,xp:p.xp,level:p.level,title:p.title,faction:p.faction||null,portrait:p.portrait||null,patreon_tier:p.patreon_tier||0,is_dev:!!(isDevAccount(p.id)),is_admin:!!(isAdminAccount(p.id)),is_dunced:!!(isDunced(p.id)),is_prime:!!(isOwnerAccount(p.id)),void_locked:!!(isVoidLocked(p.id))});
});

app.post('/api/rename',(req,res)=>{
  try{
    const tok=tokenFrom(req);
    const p=tok?getPlayer(tok):null;
    if(!p) return res.status(401).json({ok:false,error:'unauthorized'});
    const name=String(req.body?.name||req.query.name||'').trim().slice(0,32);
    if(!name) return res.status(400).json({ok:false,error:'invalid_name'});
    if(!isNameValid(name)) return res.status(400).json({ok:false,error:'name_invalid',message:'Names can only contain letters, numbers, spaces, underscores, and hyphens.'});
    if(!isNameClean(name)) return res.status(400).json({ok:false,error:'name_inappropriate',message:'That name contains inappropriate language.'});
    if(!isNameAvailable(name)) return res.status(409).json({ok:false,error:'name_taken'});
    renamePlayer(p.id,name);
    res.json({ok:true,name});
  }catch(e){res.status(500).json({ok:false,error:String(e)});}
});

app.post('/api/patreon/link',(req,res)=>{
  try{
    const tok=tokenFrom(req);
    const p=tok?getPlayer(tok):null;
    if(!p) return res.status(401).json({ok:false,error:'unauthorized'});
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!email||!email.includes('@')) return res.status(400).json({ok:false,error:'invalid_email'});
    linkPatreonEmail(p.id,email);
    res.json({ok:true,message:'Patreon email linked.'});
  }catch(e){res.status(500).json({ok:false,error:String(e)});}
});

app.get('/api/pnl/:token',(req,res)=>{
  try{
    const p=getPlayer(req.params.token);
    if(!p) return res.status(404).json({ok:false,error:'not_found'});
    res.json({ok:true,history:getNetWorthHistory(p.id,300)});
  }catch(e){res.status(500).json({ok:false,error:String(e)});}
});

// ─── REST: Patreon Webhook ────────────────────────────────────────────────────

const PATREON_TIER_MAP = { 500:1, 2500:2, 10000:3 };

function parseTierFromPatreon(data) {
  try {
    const cents = data?.attributes?.amount_cents || data?.attributes?.currently_entitled_amount_cents || 0;
    if (cents >= 10000) return 3;
    if (cents >= 2500)  return 2;
    if (cents >= 500)   return 1;
  } catch(e) {}
  return 0;
}

app.post('/api/patreon/webhook', async (req, res) => {
  try {
    if (PATREON_WEBHOOK_SECRET) {
      const sig = req.headers['x-patreon-signature'];
      if (!sig) return res.status(401).json({ok:false,error:'missing_signature'});
      const expected = createHmac('md5', PATREON_WEBHOOK_SECRET).update(req.body).digest('hex');
      if (sig !== expected) return res.status(401).json({ok:false,error:'invalid_signature'});
    }
    const body    = JSON.parse(req.body.toString());
    const event   = req.headers['x-patreon-event'];
    const member  = body?.data;
    // Patreon puts the patron email in different places depending on event/config.
    // Check the member resource first, then the included user resource. Normalize so it
    // matches the lowercased/trimmed email stored by /api/patreon/link.
    const _memberEmail = member?.attributes?.email || null;
    const _userEmail   = body?.included?.find(i=>i.type==='user')?.attributes?.email || null;
    const email   = ((_memberEmail || _userEmail || '').trim().toLowerCase()) || null;
    const memberId = member?.id || null;
    console.log(`[Patreon] Event: ${event}, member: ${memberId}, email: ${email}`);
    if (event === 'members:pledge:delete' || event === 'members:delete') {
      let player = memberId ? getPlayerByPatreonMemberId(memberId) : null;
      if (!player && email) player = getPlayerByPatreonEmail(email);
      if (player) {
        setPatreonTier(player.id, 0, null, null);
        broadcastToPlayer(player.id, {type:'patreon', data:{tier:0,message:'Your Patreon membership has ended.'}});
      }
      return res.json({ok:true});
    }
    if (event === 'members:pledge:create' || event === 'members:pledge:update' || event === 'members:create' || event === 'members:update') {
      const tier = parseTierFromPatreon(member);
      if (!tier) return res.json({ok:true});
      if (tier === 3 && countCEOs() >= CEO_MAX) return res.status(409).json({ok:false,error:'ceo_slots_full'});
      const expiresAt = Date.now() + 40*24*60*60*1000; // 40 days, buffer for late Patreon billing
      let player = memberId ? getPlayerByPatreonMemberId(memberId) : null;
      if (!player && email) player = getPlayerByPatreonEmail(email);
      if (player) {
        setPatreonTier(player.id, tier, memberId, expiresAt);
        broadcastToPlayer(player.id, {type:'patreon', data:{tier, tierName:TIERS[tier]?.name, message:`Patreon tier activated: ${TIERS[tier]?.name}!`}});
        if (tier >= 2) { syncFundMembership(); broadcastFundUpdate(); }
        // Immediately grant this month's spins if not yet received
        try {
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
          const spinRow = getSlotRecord(player.id);
          if ((spinRow.last_monthly_grant || 0) < monthStart) {
            const spins = grantMonthlySpins(player.id, tier);
            if (spins > 0) broadcastToPlayer(player.id, { type:'spin_grant', data:{ spins, reason:`Patreon ${TIERS[tier]?.name||'tier'} spin grant` }});
            if (tier >= 3) {
              const rr = useSpinAndDrop(player.id, 'epic');
              if (rr.ok) broadcastToPlayer(player.id, { type:'spin_result', data:{ item:rr.item, invId:rr.invId, rarity:rr.item.rarity, rarityColor:RARITY_CONFIG[rr.item.rarity]?.color, spinsRemaining:getSlotRecord(player.id).spins_remaining, guaranteed:true }});
            }
          }
        } catch(_) {}
      }
      return res.json({ok:true});
    }
    res.json({ok:true, note:'unhandled event'});
  } catch(e) {
    console.error('[Patreon webhook error]', e);
    res.status(500).json({ok:false,error:String(e)});
  }
});

// ─── Hedge Fund helpers ──────────────────────────────────────────────────────

function getFundNAV() {
  const cash     = getFundCash();
  const holdings = getFundHoldings();
  const equity   = holdings.reduce((acc, h) => {
    const c = companies.find(x => x.symbol === h.symbol);
    return acc + (c ? c.price * h.qty : 0);
  }, 0);
  return { cash, equity, nav: cash + equity, holdings };
}

function fundSnapshot() {
  const { cash, equity, nav, holdings } = getFundNAV();
  const totalShares = getTotalFundShares();
  const members     = getFundMembers();
  const pricePerShare = totalShares > 0 ? nav / totalShares : 1;
  return {
    nav, cash, equity, totalShares, pricePerShare,
    members: members.map(m => ({
      name:       m.name,
      shares:     m.shares,
      value:      m.shares * pricePerShare,
      deposited:  m.deposited || 0,
      pct:        totalShares > 0 ? (m.shares / totalShares * 100).toFixed(1) : '0.0',
      patreon_tier: m.patreon_tier,
    })),
    holdings: holdings.map(h => {
      const c = companies.find(x => x.symbol === h.symbol);
      return { symbol: h.symbol, qty: h.qty, price: c?.price || 0, value: (c?.price||0)*h.qty };
    }),
    proposals: getOpenProposals(),
    ledger:    getFundLedger(20),
  };
}

function broadcastFundUpdate() {
  const snap = fundSnapshot();
  const data = JSON.stringify({ type: 'fund_update', data: snap });
  const members = getFundMembers();
  for (const m of members) {
    const sockets = playerSockets.get(m.player_id);
    if (!sockets) continue;
    for (const ws of sockets) { try { if(ws.readyState===1) ws.send(data); } catch(e){} }
  }
}

function processFundProposals() {
  expireOldProposals();
  const open = getOpenProposals();
  const memberCount = getFundMembers().length;
  const majority = Math.ceil(memberCount / 2);
  for (const prop of open) {
    const totalVotes = prop.votes_yes + prop.votes_no;
    const passed  = prop.votes_yes >= majority && prop.votes_yes > prop.votes_no;
    const failed  = prop.votes_no  >= majority;
    const timeout = prop.expires_at < Date.now();
    if (passed || failed || (timeout && totalVotes > 0)) {
      const status = passed ? 'passed' : 'rejected';
      resolveProposal(prop.id, status);
      if (passed) {
        const c = companies.find(x => x.symbol === prop.symbol);
        if (c) {
          const { cash } = getFundNAV();
          const holdings = getFundHoldings();
          const current  = holdings.find(h => h.symbol === prop.symbol);
          const haveQty  = current?.qty || 0;
          if (prop.side === 'buy') {
            const cost = c.price * prop.qty;
            if (cash >= cost) {
              setFundCash(cash - cost);
              setFundHolding(prop.symbol, haveQty + prop.qty);
              logFundTrade(prop.symbol, 'buy', prop.qty, c.price, `Vote passed ${prop.votes_yes}-${prop.votes_no}`);
              pushHeadline(`GUILD: Acquired ${prop.qty}x ${prop.symbol} @ Ƒ${c.price.toFixed(2)}`,'good', prop.symbol);
            }
          } else if (prop.side === 'sell') {
            const qty = Math.min(prop.qty, haveQty);
            if (qty > 0) {
              const proceeds = c.price * qty;
              setFundCash(cash + proceeds);
              setFundHolding(prop.symbol, haveQty - qty);
              logFundTrade(prop.symbol, 'sell', qty, c.price, `Vote passed ${prop.votes_yes}-${prop.votes_no}`);
              pushHeadline(`GUILD: Sold ${qty}x ${prop.symbol} @ Ƒ${c.price.toFixed(2)}`,'neutral', prop.symbol);
            }
          }
        }
      }
      broadcastFundUpdate();
    }
  }
}

// ─── REST: Market ─────────────────────────────────────────────────────────────

// ─── REST: Hedge Fund ────────────────────────────────────────────────────────

app.get('/api/fund/snapshot', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    const snap = fundSnapshot();
    snap.isMember    = p ? isFundMember(p.id) : false;
    snap.myShares    = p ? (getFundMember(p.id)?.shares || 0) : 0;
    snap.myValue     = snap.myShares * snap.pricePerShare;
    snap.canPropose  = p ? isGuildEligible(p) : false;
    snap.myVotes     = p ? (p.patreon_tier >= 3 ? 2 : 1) : 0;
    res.json({ ok: true, ...snap });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.post('/api/fund/deposit', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (!isGuildEligible(p)) return res.status(403).json({ ok: false, error: 'guild_members_only' });
    const amount = Math.max(1, Math.floor(Number(req.body?.amount) || 0));
    if (!amount) return res.status(400).json({ ok: false, error: 'invalid_amount' });
    syncFundMembership();
    const { nav } = getFundNAV();
    const newShares = depositToFundFn(p.id, amount, nav);
    broadcastFundUpdate();
    try { const fresh=getPlayer(p.id); if(fresh) broadcastToPlayer(p.id,{type:'portfolio',data:snapshotPortfolio(fresh)}); } catch(_) {}
    res.json({ ok: true, newShares, nav });
  } catch(e) { res.status(400).json({ ok: false, error: String(e) }); }
});

app.post('/api/fund/withdraw', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'unauthorized' });
    const pct = Math.min(1, Math.max(0.01, Number(req.body?.pct) || 0));
    const { nav } = getFundNAV();
    const cashOut = withdrawFromFundFn(p.id, pct, nav);
    broadcastFundUpdate();
    try { const fresh=getPlayer(p.id); if(fresh) broadcastToPlayer(p.id,{type:'portfolio',data:snapshotPortfolio(fresh)}); } catch(_) {}
    res.json({ ok: true, cashOut });
  } catch(e) { res.status(400).json({ ok: false, error: String(e) }); }
});

app.post('/api/fund/propose', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p || !isGuildEligible(p)) return res.status(403).json({ ok: false, error: 'guild_members_only' });
    if (!isFundMember(p.id)) return res.status(403).json({ ok: false, error: 'not_a_member' });
    const { side, symbol, qty, reason } = req.body || {};
    if (!['buy','sell'].includes(side)) return res.status(400).json({ ok: false, error: 'invalid_side' });
    const sym = String(symbol||'').toUpperCase();
    const c   = companies.find(x => x.symbol === sym);
    if (!c) return res.status(400).json({ ok: false, error: 'unknown_symbol' });
    const q = Math.max(1, Math.min(100000, Math.floor(Number(qty)||0)));
    const id = createProposal(p.id, side, sym, q, String(reason||'').slice(0, 200));
    broadcastFundUpdate();
    pushHeadline(`GUILD: ${p.name} proposes to ${side} ${q}× ${sym}`, 'neutral', sym);
    res.json({ ok: true, proposalId: id });
  } catch(e) { res.status(400).json({ ok: false, error: String(e) }); }
});

app.post('/api/fund/vote', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p || !isGuildEligible(p)) return res.status(403).json({ ok: false, error: 'guild_members_only' });
    if (!isFundMember(p.id)) return res.status(403).json({ ok: false, error: 'not_a_member' });
    const { proposalId, vote } = req.body || {};
    if (!['yes','no'].includes(vote)) return res.status(400).json({ ok: false, error: 'invalid_vote' });
    if (hasVoted(proposalId, p.id)) return res.status(409).json({ ok: false, error: 'already_voted' });
    const weight = p.patreon_tier >= 3 ? 2 : 1;
    const updated = castVote(proposalId, p.id, vote, weight);
    processFundProposals();
    broadcastFundUpdate();
    res.json({ ok: true, proposal: updated });
  } catch(e) { res.status(400).json({ ok: false, error: String(e) }); }
});

// ─── REST: Player Funds ──────────────────────────────────────────────────────

function buildPriceMap() {
  const m = {};
  for (const c of companies) m[c.symbol] = c.price;
  return m;
}

// A player's stake value across all Capital Houses (their share of each fund's NAV).
function playerFundStake(playerId, priceMap) {
  try { return getPlayerFundStake(playerId, priceMap || buildPriceMap()) || 0; }
  catch(_) { return 0; }
}

// Single source of truth for net worth:
//   cash + long equity - short cover-liability + locked short collateral + fund stake
// Signed qty makes longs add and shorts subtract their cover cost; shortCollC adds back
// the proceeds withheld from cash on collateral-model shorts (0 for legacy shorts whose
// proceeds are already in cash, so both models net to the same true figure).
function playerNetWorth(player, priceMap) {
  if (!player) return 0;
  priceMap = priceMap || buildPriceMap();
  let v = Number(player.cash || 0);
  for (const [sym, qty] of Object.entries(player.holdings || {})) {
    if (!qty) continue;
    const px = priceMap[sym]; if (px == null) continue;
    v += px * qty;
  }
  for (const cc of Object.values(player.shortCollC || {})) v += (Number(cc) || 0) / 100;
  v += playerFundStake(player.id, priceMap);
  return v;
}

function fundDetailSnapshot(fundId, playerId) {
  const fund       = getFund(fundId); if (!fund) return null;
  const priceMap   = buildPriceMap();
  const cash       = fund.cash;
  const portfolio  = getFundPortfolio(fundId);
  const equity     = portfolio.reduce((acc,h)=>acc+(priceMap[h.symbol]||0)*h.qty, 0);
  const nav        = cash + equity;
  const totalShares= getTotalFundSharesById(fundId);
  const spp        = totalShares > 0 ? nav / totalShares : 1;
  const members    = getFundMemberships(fundId);
  const myMember   = playerId ? members.find(m=>m.player_id===playerId) : null;
  return {
    id: fund.id, name: fund.name, type: fund.type,
    description: fund.description,
    nav, cash, equity, totalShares, spp,
    governance: fund.governance || 'executive',
    voteWeight:  fund.vote_weight || 'equal',
    voteDurationMs: fund.vote_duration_ms || 21600000,
    proposals: getOpenHouseProposals(fundId),
    maxMembers: fund.max_members,
    memberCount: members.length,
    savingsRate: fund.savings_rate,
    members: members.map(m=>({
      name:m.name, shares:m.shares, value:m.shares*spp,
      deposited: m.deposited || 0,
      pct: totalShares>0?(m.shares/totalShares*100).toFixed(1):'0.0',
      patreon_tier:m.patreon_tier,
      isOwner: m.player_id === fund.owner_id,
      isGolden: !!(fund.golden_holder && m.player_id === fund.golden_holder),
    })),
    holdings: portfolio.map(h=>{
      const c=companies.find(x=>x.symbol===h.symbol);
      return {symbol:h.symbol,qty:h.qty,price:c?.price||0,value:(c?.price||0)*h.qty};
    }),
    activity: getFundActivity(fundId, 20),
    polls: getFundPolls(fundId),
    isMember:  playerId ? isInFund(fundId, playerId) : false,
    myShares:  myMember?.shares || 0,
    myValue:   (myMember?.shares||0) * spp,
    myDeposited: myMember?.deposited || 0,
    withdrawable: cash,
    lockedInPositions: equity,
    goldenHolder: (fund.golden_holder && members.find(m=>m.player_id===fund.golden_holder)?.name) || null,
    iHoldGolden: !!(playerId && fund.golden_holder === playerId),
    officers: (()=>{ try { return getFundOfficers(fundId).map(o=>({name:o.name,role:o.role})); } catch(_) { return []; } })(),
    myRole: (()=>{ try { return playerId ? getFundOfficerRole(fundId, playerId) : null; } catch(_) { return null; } })(),
    isOwner:   fund.owner_id === playerId,
  };
}

app.get('/api/funds', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    const isDev = actor ? isDevAccount(actor.id) : false;
    const priceMap = buildPriceMap();
    const funds = getAllFunds().map(f => {
      const portfolio  = getFundPortfolio(f.id);
      const equity     = portfolio.reduce((acc,h)=>acc+(priceMap[h.symbol]||0)*h.qty,0);
      const nav        = f.cash + equity;
      const isMember   = actor ? isInFund(f.id, actor.id) : false;
      // locked = visible but not interactable
      const locked =
        (f.type === 'flsh'    && !isDev) ||
        (f.type === 'patreon' && !(actor && isGuildEligible(actor)));
      return {
        id: f.id, name: f.name, type: f.type,
        description: f.description,
        nav, memberCount: getFundMemberCount(f.id),
        maxMembers: f.max_members,
        isMember, locked,
        savingsRate: f.savings_rate,
      };
    });
    res.json({ ok: true, funds });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.get('/api/funds/:id', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    const flshLocked    = fund.type==='flsh'    && (!actor || !isDevAccount(actor.id));
    const patreonLocked = fund.type==='patreon' && (!actor || !isGuildEligible(actor));
    if (patreonLocked) {
      // Return a public-facing view — stats visible, actions locked
      const priceMap2 = buildPriceMap();
      const portfolio2 = getFundPortfolio(fund.id);
      const equity2   = portfolio2.reduce((acc,h)=>acc+(priceMap2[h.symbol]||0)*h.qty,0);
      const nav2      = fund.cash + equity2;
      return res.json({ ok:true, fund: {
        id:fund.id, name:fund.name, type:fund.type, description:fund.description,
        nav:nav2, cash:fund.cash, memberCount:getFundMemberCount(fund.id),
        maxMembers:fund.max_members, savingsRate:fund.savings_rate,
        locked:true, isMember:false, isOwner:false,
        members:[], holdings:[], activity:[],
      }});
    }
    if (flshLocked) {
      const priceMap2 = buildPriceMap();
      const portfolio2 = getFundPortfolio(fund.id);
      const equity2   = portfolio2.reduce((acc,h)=>acc+(priceMap2[h.symbol]||0)*h.qty,0);
      const nav2      = fund.cash + equity2;
      return res.json({ ok:true, fund: {
        id:fund.id, name:fund.name, type:fund.type, description:fund.description,
        nav:nav2, cash:fund.cash, memberCount:getFundMemberCount(fund.id),
        maxMembers:fund.max_members, savingsRate:fund.savings_rate,
        locked:true, isMember:false, isOwner:false,
        members:[], holdings:[], activity:[],
      }});
    }
    if (fund.type==='patreon' && actor && isGuildEligible(actor) && !isInFund(fund.id, actor.id)) {
      try { joinFund(fund.id, actor.id); } catch(_) {}
    }
    res.json({ ok:true, fund: fundDetailSnapshot(fund.id, actor?.id) });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Fund performance history (NAV + NAV-per-share time series). spp is the
// performance line; nav is fund size. Series begins when snapshotting was deployed.
app.get('/api/funds/:id/history', (req, res) => {
  try {
    const fund = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    const limit = Math.max(1, Math.min(1000, parseInt(req.query?.limit) || 300));
    res.json({ ok:true, history: getFundNAVHistory(fund.id, limit) });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/create', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (actor.cash < FUND_CREATE_COST)
      return res.status(400).json({ ok:false, error:'insufficient_funds', need: FUND_CREATE_COST });
    const name = String(req.body?.name||'').trim().slice(0,40);
    if (!name || name.length < 3) return res.status(400).json({ ok:false, error:'name_too_short' });
    if (getFundByName(name)) return res.status(409).json({ ok:false, error:'name_taken' });
    const desc  = String(req.body?.description||'').slice(0,200);
    const id    = 'F_' + Math.random().toString(36).slice(2,10).toUpperCase();
    { const p = getPlayer(actor.id); p.cash -= FUND_CREATE_COST; savePlayerFn(p); }
    createFund(id, name, actor.id, desc, FUND_BASE_SLOTS);
    addFundCash(id, FUND_CREATE_COST * 0.1);
    logFundActivity(id,'create',actor.id,null,null,null,FUND_CREATE_COST,`Fund created by ${actor.name}`);
    pushHeadline(`${actor.name} launched hedge fund "${name}"`, 'good', null);
    res.json({ ok:true, fundId: id });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/buy-slots', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'not_owner' });
    const count = Math.max(1, Math.min(10, parseInt(req.body?.count)||1));
    const cost  = count * FUND_SLOT_COST;
    const p     = getPlayer(actor.id);
    if (p.cash < cost) return res.status(400).json({ ok:false, error:'insufficient_funds', need:cost });
    p.cash -= cost;
    savePlayerFn(p);
    addFundSlots(fund.id, count);
    logFundActivity(fund.id,'slot_purchase',actor.id,null,null,null,cost,`${count} slot(s) purchased`);
    // Sync player cash to client
    try {
      const equity = Object.entries(p.holdings||{}).reduce((acc,[sym,qty])=>{
        const co=companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
      },0);
      recordNetWorth(p.id, p.cash+equity, p.cash, equity);
      broadcastToPlayer(p.id, { type:'portfolio', data: snapshotPortfolio(p) });
    } catch(_) {}
    res.json({ ok:true, newMax: fund.max_members + count });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/join', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.type==='flsh') return res.status(403).json({ ok:false, error:'dev_only' });
    if (fund.type==='patreon') return res.status(403).json({ ok:false, error:'patreon_only' });
    if (fund.type==='player') return res.status(403).json({ ok:false, error:'invite_only' });
    joinFund(fund.id, actor.id);
    logFundActivity(fund.id,'join',actor.id,null,null,null,null,`${actor.name} joined`);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/deposit', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.type==='flsh' && !isDevAccount(actor.id)) return res.status(403).json({ ok:false, error:'dev_only' });
    const amount = Math.max(1, Math.floor(Number(req.body?.amount)||0));
    const shares = fundDepositFn(fund.id, actor.id, amount);
    snapshotFund(fund.id);
    const snap   = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    // Refresh depositor's portfolio (cash decreased)
    try {
      const fresh = getPlayer(actor.id);
      if (fresh) broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(fresh) });
    } catch(_) {}
    res.json({ ok:true, shares, nav: snap.nav });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/withdraw', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    // For player funds: only the owner or an appointed Treasurer can move cash out
    if (fund.type === 'player' && fund.owner_id !== actor.id && fundRole(fund, actor) !== 'treasurer')
      return res.status(403).json({ ok:false, error:'owner_or_treasurer_only' });
    const amount = Math.max(0, Number(req.body?.amount) || 0);
    if (amount <= 0) return res.status(400).json({ ok:false, error:'invalid_amount' });
    const priceMap = buildPriceMap();
    const nav = getFundNAVById(fund.id, priceMap);
    const cashOut = fundWithdrawFn(fund.id, actor.id, amount, nav);
    snapshotFund(fund.id);
    const snap    = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    try {
      const fresh = getPlayer(actor.id);
      if (fresh) broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(fresh) });
    } catch(_) {}
    res.json({ ok:true, cashOut });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Golden share — veto an open proposal (holder only). Kills it regardless of votes.
app.post('/api/funds/:id/golden/veto', (req, res) => {
  try {
    const tok = tokenFrom(req); const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id); if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (getGoldenHolder(fund.id) !== actor.id) return res.status(403).json({ ok:false, error:'not_golden_holder' });
    const prop = getHouseProposal(String(req.body?.proposalId || ''));
    if (!prop || prop.fund_id !== fund.id || prop.status !== 'open')
      return res.status(400).json({ ok:false, error:'no_open_proposal' });
    resolveHouseProposal(prop.id, 'vetoed', false);
    logFundActivity(fund.id, 'veto', actor.id, null, null, null, null, `${actor.name} vetoed a proposal with the golden share`);
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Golden share — transfer to another member (holder only). The coup target / trust gamble.
app.post('/api/funds/:id/golden/transfer', (req, res) => {
  try {
    const tok = tokenFrom(req); const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id); if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (getGoldenHolder(fund.id) !== actor.id) return res.status(403).json({ ok:false, error:'not_golden_holder' });
    const targetName = String(req.body?.targetName || '').trim();
    const target = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    if (!isInFund(fund.id, target.id)) return res.status(400).json({ ok:false, error:'not_a_member' });
    setGoldenHolder(fund.id, target.id);
    logFundActivity(fund.id, 'golden_transfer', actor.id, null, null, null, null, `${actor.name} handed the golden share to ${target.name}`);
    broadcastToPlayer(target.id, { type:'system_message', data:{ text:`You now hold the golden share in "${fund.name}", you can veto any proposal.`, color:'#e6c27a' }});
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Appoint an officer (owner only). role: treasurer | trader | whip
app.post('/api/funds/:id/officer/appoint', (req, res) => {
  try {
    const tok = tokenFrom(req); const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id); if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'owner_only' });
    const role = String(req.body?.role || '').toLowerCase();
    if (!['treasurer','trader','whip'].includes(role)) return res.status(400).json({ ok:false, error:'invalid_role' });
    const targetName = String(req.body?.targetName || '').trim();
    const target = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    if (!isInFund(fund.id, target.id)) return res.status(400).json({ ok:false, error:'not_a_member' });
    if (target.id === fund.owner_id) return res.status(400).json({ ok:false, error:'owner_already_has_all_powers' });
    setFundOfficer(fund.id, target.id, role);
    logFundActivity(fund.id, 'officer', actor.id, null, null, null, null, `${target.name} appointed ${role}`);
    broadcastToPlayer(target.id, { type:'system_message', data:{ text:`You were appointed ${role} of "${fund.name}".`, color:'#4ecdc4' }});
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Revoke an officer (owner only)
app.post('/api/funds/:id/officer/revoke', (req, res) => {
  try {
    const tok = tokenFrom(req); const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id); if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'owner_only' });
    const targetName = String(req.body?.targetName || '').trim();
    const target = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    removeFundOfficer(fund.id, target.id);
    logFundActivity(fund.id, 'officer', actor.id, null, null, null, null, `${target.name} stripped of office`);
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Whip (or owner) force-resolves an open proposal early — closes voting and tallies now.
app.post('/api/funds/:id/proposal/:pid/force', (req, res) => {
  try {
    const tok = tokenFrom(req); const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id); if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id && fundRole(fund, actor) !== 'whip')
      return res.status(403).json({ ok:false, error:'owner_or_whip_only' });
    const prop = getHouseProposal(req.params.pid);
    if (!prop || prop.fund_id !== fund.id || prop.status !== 'open')
      return res.status(400).json({ ok:false, error:'no_open_proposal' });
    resolveHouseProposalDecision(fund, prop);
    logFundActivity(fund.id, 'force_vote', actor.id, null, null, null, null, `${actor.name} force-called a vote`);
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Kick a member from a player fund (owner only)
app.post('/api/funds/:id/kick', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id && !isDevAccount(actor.id))
      return res.status(403).json({ ok:false, error:'owner_only' });
    const targetName = String(req.body?.targetName || '').trim();
    const target     = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    if (target.id === actor.id) return res.status(400).json({ ok:false, error:'cannot_kick_self' });
    // Refund their full current stake value in cash before removing them
    try {
      const priceMap = buildPriceMap();
      const nav = getFundNAVById(fund.id, priceMap);
      const tShares = getTotalFundSharesById(fund.id);
      const spp = tShares > 0 ? nav / tShares : 1;
      const tMember = getFundMembership(fund.id, target.id);
      const stakeValue = (tMember?.shares || 0) * spp;
      if (stakeValue > 0) fundWithdrawFn(fund.id, target.id, stakeValue, nav);
    } catch(_) {} // ok if no shares
    kickFundMember(fund.id, target.id);
    logFundActivity(fund.id, 'kick', actor.id, null, null, null, null, `${target.name} kicked by owner`);
    broadcastToPlayer(target.id, { type:'system_message', data:{ text:`You were removed from the fund "${fund.name}".`, color:'#ff6b6b' }});
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Invite a player to a fund (owner only)
app.post('/api/funds/:id/invite', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id && !isDevAccount(actor.id))
      return res.status(403).json({ ok:false, error:'owner_only' });
    const targetName = String(req.body?.targetName || '').trim();
    const target     = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    joinFund(fund.id, target.id);
    logFundActivity(fund.id, 'invite', actor.id, null, null, null, null, `${actor.name} invited ${target.name}`);
    broadcastToPlayer(target.id, { type:'system_message', data:{ text:`You were invited to the fund "${fund.name}".`, color:'#4ecdc4' }});
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// Assign cash value from fund to a specific member (owner only)
app.post('/api/funds/:id/assign', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id && fundRole(fund, actor) !== 'treasurer')
      return res.status(403).json({ ok:false, error:'owner_or_treasurer_only' });
    const targetName = String(req.body?.targetName || '').trim();
    const amount     = Math.max(1, Math.floor(Number(req.body?.amount)||0));
    const target     = targetName ? getPlayerByName(targetName) : null;
    if (!target) return res.status(404).json({ ok:false, error:'player_not_found' });
    if (!isInFund(fund.id, target.id)) return res.status(400).json({ ok:false, error:'not_a_member' });
    const fundCash = getFundCashById(fund.id);
    if (fundCash < amount) return res.status(400).json({ ok:false, error:'insufficient_fund_cash' });
    // Transfer cash from fund to member
    setFundCashById(fund.id, fundCash - amount);
    const fresh = getPlayer(target.id);
    if (fresh) { fresh.cash += amount; savePlayerFn(fresh); }
    logFundActivity(fund.id, 'assign', actor.id, null, null, null, amount, `Assigned Ƒ${amount} to ${target.name}`);
    broadcastToPlayer(target.id, { type:'system_message', data:{ text:`Fund owner assigned you Ƒ${amount.toLocaleString()} from "${fund.name}".`, color:'#86ff6a' }});
    if (fresh) broadcastToPlayer(target.id, { type:'portfolio', data: snapshotPortfolio(fresh) });
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true, amount });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

// ── Poll endpoints ──────────────────────────────────────────────────────────

app.post('/api/funds/:id/poll/create', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (!isInFund(fund.id, actor.id)) return res.status(403).json({ ok:false, error:'not_a_member' });
    const question = String(req.body?.question || '').trim().slice(0, 200);
    const options  = (req.body?.options || []).map(o => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 6);
    if (!question) return res.status(400).json({ ok:false, error:'question_required' });
    if (options.length < 2) return res.status(400).json({ ok:false, error:'min_2_options' });
    const id = createFundPoll(fund.id, actor.id, question, options);
    logFundActivity(fund.id, 'poll_created', actor.id, null, null, null, null, `Poll: "${question.slice(0,60)}"`);
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true, pollId: id });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/poll/vote', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (!isInFund(fund.id, actor.id)) return res.status(403).json({ ok:false, error:'not_a_member' });
    const { pollId, optionIndex } = req.body || {};
    const votes = voteFundPoll(Number(pollId), actor.id, Number(optionIndex));
    const snap  = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true, votes });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/poll/close', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund || fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'owner_only' });
    closeFundPoll(Number(req.body?.pollId));
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true });
  } catch(e) { res.status(400).json({ ok:false, error:String(e) }); }
});

app.post('/api/funds/:id/trade', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    const isTrader = fundRole(fund, actor) === 'trader';
    if (fund.type==='player'  && fund.owner_id !== actor.id && !isTrader) return res.status(403).json({ ok:false, error:'owner_or_trader_only' });
    if (fund.type==='flsh'    && !isDevAccount(actor.id))    return res.status(403).json({ ok:false, error:'dev_only' });
    if (fund.type==='patreon' && !isGuildEligible(actor))    return res.status(403).json({ ok:false, error:'guild_only' });
    // Direct-trade authority (owner or appointed Trader) bypasses governance gating —
    // that delegated power is the whole point of the Trader role. Everyone else follows
    // the fund's mode: vote mode requires a proposal; council allows only owner override.
    const gov = fund.governance || 'executive';
    const canDirect = houseOwner(fund, actor) || isTrader;
    if (!canDirect) {
      if (gov === 'vote') return res.status(403).json({ ok:false, error:'vote_mode_requires_proposal' });
      if (gov === 'council') return res.status(403).json({ ok:false, error:'council_owner_only_direct' });
    }
    const { side, symbol, qty } = req.body || {};
    if (!['buy','sell'].includes(side)) return res.status(400).json({ ok:false, error:'invalid_side' });
    const sym = String(symbol||'').toUpperCase();
    const q   = Math.max(1, Math.floor(Number(qty)||0));
    const r = executeFundTrade(fund.id, side, sym, q, actor.id);
    if (!r.ok) return res.status(400).json(r);
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true, fund: snap });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ── Governance: owner sets mode + vote weight ─────────────────────────────────
app.post('/api/funds/:id/governance', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (!houseOwner(fund, actor)) return res.status(403).json({ ok:false, error:'owner_only' });
    const governance = String(req.body?.governance||'').toLowerCase();
    const voteWeight = String(req.body?.voteWeight||'equal').toLowerCase();
    const voteDurationMs = Number(req.body?.voteDurationMs) || 21600000;
    if (!['executive','vote','council'].includes(governance)) return res.status(400).json({ ok:false, error:'invalid_mode' });
    setFundGovernance(fund.id, governance, voteWeight, voteDurationMs);
    logFundActivity(fund.id,'governance',actor.id,null,null,null,null,`Governance set to ${governance}${governance!=='executive'?` (${voteWeight==='shares'?'share-weighted':'one vote each'})`:''}`);
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true, governance, voteWeight });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ── Propose a trade (vote / council modes) ────────────────────────────────────
app.post('/api/funds/:id/propose', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    const gov = fund.governance || 'executive';
    if (gov === 'executive') return res.status(403).json({ ok:false, error:'executive_mode_no_proposals' });
    if (!houseMember(fund, actor)) return res.status(403).json({ ok:false, error:'not_a_member' });
    const { side, symbol, qty, reason } = req.body || {};
    if (!['buy','sell'].includes(side)) return res.status(400).json({ ok:false, error:'invalid_side' });
    const sym = String(symbol||'').toUpperCase();
    const c   = companies.find(x => x.symbol === sym && !x._special);
    if (!c) return res.status(400).json({ ok:false, error:'unknown_symbol' });
    const q   = Math.max(1, Math.min(1_000_000, Math.floor(Number(qty)||0)));
    const id  = createHouseProposal(fund.id, actor.id, side, sym, q, reason, fund.vote_duration_ms || 21600000);
    // Proposer's own vote is auto-cast yes.
    castHouseVote(id, actor.id, 'yes', houseVoteWeight(fund, actor.id));
    pushHeadline(`${fund.name}: ${actor.name} proposes ${side} ${q}× ${sym}`, 'neutral', sym);
    maybeResolveEarly(fund, id); // e.g. solo-owner house resolves immediately
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true, proposalId:id });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ── Vote on a proposal ────────────────────────────────────────────────────────
app.post('/api/funds/:id/vote', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (!houseMember(fund, actor)) return res.status(403).json({ ok:false, error:'not_a_member' });
    const { proposalId, vote } = req.body || {};
    if (!['yes','no'].includes(vote)) return res.status(400).json({ ok:false, error:'invalid_vote' });
    const prop = getHouseProposal(proposalId);
    if (!prop || prop.fund_id !== fund.id) return res.status(404).json({ ok:false, error:'proposal_not_found' });
    if (prop.status !== 'open') return res.status(409).json({ ok:false, error:'proposal_closed' });
    const weight = houseVoteWeight(fund, actor.id);
    if (weight <= 0) return res.status(403).json({ ok:false, error:'no_voting_weight' }); // share-weighted with 0 shares
    const updated = castHouseVote(proposalId, actor.id, vote, weight);
    maybeResolveEarly(fund, proposalId); // resolve now if all eligible members have voted
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true, proposal: updated });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ── Owner execute / veto (council mode, or owner override on any open proposal) ─
app.post('/api/funds/:id/proposal/:pid/resolve', (req, res) => {
  try {
    const tok   = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund  = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (!houseOwner(fund, actor)) return res.status(403).json({ ok:false, error:'owner_only' });
    const prop = getHouseProposal(req.params.pid);
    if (!prop || prop.fund_id !== fund.id) return res.status(404).json({ ok:false, error:'proposal_not_found' });
    if (!['open','advisory_pass','advisory_fail'].includes(prop.status)) return res.status(409).json({ ok:false, error:'already_resolved' });
    const action = String(req.body?.action||'').toLowerCase();
    if (action === 'execute') {
      const r = executeFundTrade(fund.id, prop.side, prop.symbol, prop.qty, prop.proposer_id);
      resolveHouseProposal(prop.id, r.ok ? 'passed' : 'failed_exec', r.ok);
      if (!r.ok) { broadcastHouseUpdate(fund.id); return res.status(400).json(r); }
      pushHeadline(`${fund.name}: owner executed ${prop.side} ${prop.qty}× ${prop.symbol}`, 'good', prop.symbol);
    } else if (action === 'veto') {
      resolveHouseProposal(prop.id, 'vetoed', false);
    } else {
      return res.status(400).json({ ok:false, error:'invalid_action' });
    }
    broadcastHouseUpdate(fund.id);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});


// ─── REST: Galaxy Map ─────────────────────────────────────────────────────────

app.get('/api/galaxy/state', (req, res) => {
  try {
    const colonies = getAllColonyStates();
    res.json({ ok: true, colonies });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Tutorial dismiss ─────────────────────────────────────────────────────────
app.post('/api/tutorial/dismiss', (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'Missing token' });
    const player = getPlayer(token);
    if (!player) return res.status(404).json({ ok: false, error: 'Player not found' });
    markTutorialSeen(player.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Fund delete (owner disband) ──────────────────────────────────────────────
app.post('/api/funds/:id/delete', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'not_owner' });

    // Pay out members at CURRENT share value (NAV / total shares), not original deposit.
    // Holdings are valued at live ticker price via the price map, so members keep gains/losses.
    const members       = getFundMemberships(fund.id);
    const priceMap      = buildPriceMap();
    const nav           = getFundNAVById(fund.id, priceMap);
    const totalShares   = getTotalFundSharesById(fund.id);
    const pricePerShare = totalShares > 0 && nav > 0 ? nav / totalShares : 1;
    for (const m of members) {
      if (m.player_id === actor.id) continue; // owner handled by the creation-cost rebate below
      const payout = Math.round((m.shares || 0) * pricePerShare * 100) / 100;
      if (payout <= 0) continue;
      const mp = getPlayer(m.player_id);
      if (mp) {
        mp.cash = Math.round((mp.cash + payout) * 100) / 100;
        savePlayerFn(mp);
        broadcastToPlayer(mp.id, { type:'income', data:{ base:payout, bonus:0, total:payout, text:`+Ƒ${payout.toLocaleString()} payout, hedge fund "${fund.name}" disbanded (current value)` }});
      }
    }

    // Refund Ƒ5M to owner
    const DISBAND_REFUND = 5_000_000;
    const p = getPlayer(actor.id);
    p.cash = Math.round((p.cash + DISBAND_REFUND) * 100) / 100;
    savePlayerFn(p);

    // Delete fund
    deleteFund(fund.id);
    pushHeadline(`${actor.name} disbanded hedge fund "${fund.name}"`, 'bad', null);
    broadcast({ type:'fund_deleted', data:{ fundId: fund.id, name: fund.name }});
    res.json({ ok:true, refund: DISBAND_REFUND });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ─── Fund edit (rename + description, Ƒ250k) ─────────────────────────────────
app.post('/api/funds/:id/edit', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const actor = tok ? getPlayer(tok) : null;
    if (!actor) return res.status(401).json({ ok:false, error:'unauthorized' });
    const fund = getFund(req.params.id);
    if (!fund) return res.status(404).json({ ok:false, error:'not_found' });
    if (fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'not_owner' });

    const EDIT_COST = 250_000;
    if (actor.cash < EDIT_COST) return res.status(400).json({ ok:false, error:'insufficient_funds', need: EDIT_COST });

    const newName = String(req.body?.name||'').trim().slice(0,40);
    const newDesc = String(req.body?.description||'').slice(0,200);
    if (!newName || newName.length < 3) return res.status(400).json({ ok:false, error:'name_too_short' });

    // Check name not taken (if changed)
    if (newName !== fund.name && getFundByName(newName)) {
      return res.status(409).json({ ok:false, error:'name_taken' });
    }

    const p = getPlayer(actor.id);
    p.cash -= EDIT_COST;
    savePlayerFn(p);

    updateFundInfo(fund.id, newName, newDesc);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId: fund.id, name: newName, description: newDesc }});
    res.json({ ok:true, name: newName, description: newDesc });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/galaxy/join-faction', (req, res) => {
  try {
    const { token, factionId } = req.body || {};
    const p = token ? getPlayer(token) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'not_logged_in' });
    if (factionId === 'fleshstation') return res.status(403).json({ ok: false, error: 'Flesh Station is dev-only.' });
    const VALID = ['coalition','syndicate','void','guild'];
    if (!VALID.includes(factionId)) return res.status(400).json({ ok: false, error: 'invalid_faction' });
    const { faction: current, joinedAt, voidLocked, voidPresidentEscaped } = getPlayerFactionData(p.id);
    if (current === factionId) return res.json({ ok: true, faction: factionId, message: 'Already aligned.' });

    const isCurrentPresident = !!(president && president.id === p.id);

    // ── Void Collective permanent lock — complex escape paths ──
    if (voidLocked) {
      // PATH 1: Merchant Guild escape (always available)
      if (factionId === 'guild') {
        setPlayerFaction(p.id, factionId);
        broadcastToPlayer(p.id, { type: 'faction_joined', data: { faction: factionId } });
        broadcast({ type:'chat', data:{ id:uuidv4(), t:Date.now(), user:'SYSTEM', text:`⬢ ${p.name} has been extracted from the Void Collective by the Merchant Guild. Cybernetic augments remain.`, badge:'⬢', color:'#2ecc71' }});
        return res.json({ ok: true, faction: factionId, message: 'The Merchant Guild has arranged your extraction.' });
      }

      // PATH 2: Cyborg President → Coalition (hidden, undocumented)
      if (factionId === 'coalition' && isCurrentPresident && !voidPresidentEscaped) {
        setVoidPresidentEscaped(p.id);
        setPlayerFaction(p.id, factionId);
        broadcastToPlayer(p.id, { type: 'faction_joined', data: { faction: factionId, voidPresidentEscaped: true } });
        broadcast({ type:'chat', data:{ id:uuidv4(), t:Date.now(), user:'SYSTEM', text:`⚡ President ${p.name} has severed ties with the Void Collective and aligned with the Coalition. The augments hum in protest.`, badge:'⚡', color:'#4ecdc4' }});
        return res.json({ ok: true, faction: factionId, voidPresidentEscaped: true, message: 'Presidential authority overrides Void allegiance. Coalition aligned.' });
      }

      // PATH 3: Post-presidency escaped cyborg → Syndicate (hidden, undocumented)
      if (factionId === 'syndicate' && voidPresidentEscaped && !isCurrentPresident) {
        setPlayerFaction(p.id, factionId);
        // Auto-assign Borg Betrayer title (added to inventory, equipped, but changeable)
        p.ownedTitles = p.ownedTitles || [];
        if (!p.ownedTitles.includes('Borg Betrayer')) p.ownedTitles.push('Borg Betrayer');
        p.title = 'Borg Betrayer';
        savePlayer(p);
        broadcastToPlayer(p.id, { type: 'faction_joined', data: { faction: factionId, borgBetrayer: true } });
        broadcastToPlayer(p.id, { type: 'title_state', data: { title: p.title, owned: p.ownedTitles, available: p.ownedTitles } });
        broadcast({ type:'chat', data:{ id:uuidv4(), t:Date.now(), user:'SYSTEM', text:`🔴 ${p.name} has betrayed the machine. Cybernetic augments repurposed for Syndicate operations. Title earned: Borg Betrayer.`, badge:'🔴', color:'#e74c3c' }});
        return res.json({ ok: true, faction: factionId, borgBetrayer: true, message: 'Borg Betrayer. The machines remember.' });
      }

      return res.status(403).json({ ok: false, error: 'VOID LOCKED, Your cybernetic conversion is permanent. Only the Merchant Guild can extract you.' });
    }

    // 30-day lock: cannot switch factions within 30 days of joining (non-void factions)
    const LOCK_MS = 30 * 24 * 60 * 60 * 1000;
    if (current && joinedAt && (Date.now() - joinedAt) < LOCK_MS) {
      const daysLeft = Math.ceil((LOCK_MS - (Date.now() - joinedAt)) / (24 * 60 * 60 * 1000));
      return res.status(403).json({ ok: false, error: `Faction allegiance is locked. ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining before you can switch.` });
    }

    // Joining the Void Collective — permanent cybernetic conversion
    if (factionId === 'void') {
      setVoidLocked(p.id);
      setPlayerFaction(p.id, factionId);
      broadcastToPlayer(p.id, { type: 'faction_joined', data: { faction: factionId, voidLocked: true } });
      broadcast({ type:'chat', data:{ id:uuidv4(), t:Date.now(), user:'SYSTEM', text:`🤖 ${p.name} has undergone cybernetic conversion. They are now permanently Void Collective. +Ƒ15 passive unlocked.`, badge:'🤖', color:'#9b59b6' }});
      return res.json({ ok: true, faction: factionId, voidLocked: true, message: 'Cybernetic conversion complete. This is permanent. +Ƒ15 passive income unlocked.' });
    }

    setPlayerFaction(p.id, factionId);
    broadcastToPlayer(p.id, { type: 'faction_joined', data: { faction: factionId } });
    res.json({ ok: true, faction: factionId });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── COMMODITY MARKET (read) ──────────────────────────────────────────────────
// Definitions + (optionally) the live price grid for one colony.
// Full price grid across all colonies (for the Markets tab arbitrage view).
app.get('/api/commodities-grid', (req, res) => {
  try {
    const colonies = getAllColonyStates().filter(isMarketColony);
    const all = getAllCommodityPrices();
    const byColony = {};
    for (const r of all) { (byColony[r.colony_id] = byColony[r.colony_id] || {})[r.commodity_id] = r; }
    const colonyList = colonies.map(c => {
      const leading = colonyLeadingFaction(c);
      const tithe = leading === 'guild' ? GUILD_TITHE : 0;
      let pm = byColony[c.id];
      if (!pm) { // lazy seed this colony
        pm = {};
        for (const com of COMMODITIES) {
          const price = Math.round(commodityTargetPrice(com, leading, c.tension, 0, c.id) * 100) / 100;
          upsertCommodityPrice(c.id, com.id, price, 0);
          pm[com.id] = { price, supply: 0 };
        }
      }
      const prices = {};
      for (const com of COMMODITIES) {
        const r = pm[com.id] || { price: com.basePrice };
        prices[com.id] = { buy: Math.round(r.price * (1 + tithe) * 100) / 100, sell: Math.round(r.price * 100) / 100 };
      }
      return { id: c.id, leading, tithe, prices };
    });
    res.json({ ok:true,
      commodities: COMMODITIES.map(c => ({ id:c.id, name:c.name, cls:c.cls, basePrice:c.basePrice, icon:c.icon })),
      colonies: colonyList });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.get('/api/commodities', (req, res) => {
  try {
    const defs = COMMODITIES.map(c => ({ id:c.id, name:c.name, cls:c.cls, sector:c.sector, sectorName:SECTOR_NAMES[c.sector], basePrice:c.basePrice, icon:c.icon }));
    res.json({ ok:true, commodities:defs, guildTithe:GUILD_TITHE });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Price grid at a colony, with computed buy/sell prices (buy includes Guild tithe).
app.get('/api/commodities/:colonyId', (req, res) => {
  try {
    const colonyId = req.params.colonyId;
    const colony = getColonyState(colonyId);
    if (!colony) return res.status(404).json({ ok:false, error:'colony_not_found' });
    if (!isMarketColony(colony)) return res.status(403).json({ ok:false, error:'no_market_here' });
    const leading = colonyLeadingFaction(colony);
    const tithe = leading === 'guild' ? GUILD_TITHE : 0;
    let rows = getColonyCommodityPrices(colonyId);
    // If this colony has no prices yet (e.g. before first tick), seed at target now.
    if (!rows.length) {
      for (const com of COMMODITIES) {
        const price = Math.round(commodityTargetPrice(com, leading, colony.tension, 0, colony.id) * 100) / 100;
        upsertCommodityPrice(colonyId, com.id, price, 0);
      }
      rows = getColonyCommodityPrices(colonyId);
    }
    const priceMap = Object.fromEntries(rows.map(r => [r.commodity_id, r]));
    const list = COMMODITIES.map(com => {
      const r = priceMap[com.id] || { price: com.basePrice, supply: 0 };
      const buy  = Math.round(r.price * (1 + tithe) * 100) / 100;
      const sell = Math.round(r.price * 100) / 100;
      return { id:com.id, name:com.name, cls:com.cls, icon:com.icon, sectorName:SECTOR_NAMES[com.sector],
               price:sell, buyPrice:buy, sellPrice:sell, supply:r.supply };
    });
    res.json({ ok:true, colonyId, leading, guildTithe:tithe, prices:list });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Current cargo hold snapshot, valued at the player's colony's sell prices if known.
function cargoSnapshot(playerId) {
  const rows = getPlayerCargo(playerId);
  const total = getCargoTotal(playerId);
  return {
    total,
    items: rows.map(r => {
      const com = COMMODITY_BY_ID[r.commodity_id];
      return { id:r.commodity_id, name:com?com.name:r.commodity_id, cls:com?com.cls:'?',
               icon:com?com.icon:null, qty:r.qty, avgCost:r.avg_cost,
               colonyId:r.colony_id||'', colonyName:(r.colony_id?r.colony_id.replace(/_/g,' '):'In Transit') };
    }),
  };
}

// Move a colony's price for one commodity by adjusting its supply pressure, then
// recompute that single cell immediately so buy/sell feels responsive.
// Compute the post-impact price WITHOUT writing it. Used to price a trade off the
// slippage it will cause (so a trader eats their own impact) and to gate funds
// before committing, with no orphan price tick if the trade is rejected.
function previewCommodityPrice(colony, commodityId, deltaSupply) {
  const com = COMMODITY_BY_ID[commodityId];
  if (!com) return null;
  const row = getCommodityPrice(colony.id, commodityId);
  let supply = (row ? row.supply : 0) + deltaSupply;
  supply = Math.max(-0.4, Math.min(0.4, supply));
  const leading = colonyLeadingFaction(colony);
  const target = commodityTargetPrice(com, leading, colony.tension, supply, colony.id);
  // Ease current price 60% toward the new supply-adjusted target.
  const cur = row ? row.price : target;
  const price = Math.round((cur + (target - cur) * 0.6) * 100) / 100;
  return { price, supply };
}

function nudgeCommoditySupply(colony, commodityId, deltaSupply) {
  const pv = previewCommodityPrice(colony, commodityId, deltaSupply);
  if (!pv) return null;
  upsertCommodityPrice(colony.id, commodityId, pv.price, Math.round(pv.supply * 1e4) / 1e4);
  return pv.price;
}

// Nudge a colony's price AND push the change live to all clients.
function nudgeAndBroadcast(colony, commodityId, deltaSupply, source) {
  const price = nudgeCommoditySupply(colony, commodityId, deltaSupply);
  if (price != null) {
    broadcast({ type:'commodity_tick', data:{ colonyId:colony.id, commodityId, price, source:source||'trade' } });
  }
  return price;
}

// ─── SERVER-AUTHORITATIVE NPC TRADE FLEET ─────────────────────────────────────
// NPC ships are real economic actors. Each carries a manifest (commodity + qty),
// buys at origin (pushing that price up) on spawn, travels a lane over real time,
// and sells at destination (pushing that price down) on arrival. The fleet lives on
// the server and is broadcast so every client renders the SAME ships moving.
// NPC volume is conservative: small loads, ~half a player trade's price impact.
const NPC_FLEET = new Map();           // id -> ship state
const NPC_MAX_SHIPS = 17;              // concurrent NPC ships in the galaxy
const NPC_SPAWN_MS = 6000;             // attempt a spawn this often (if under cap)
const NPC_TICK_MS = 1000;              // movement/arrival tick
const NPC_VARIANTS = ['v1','v2','v3']; // visual classes (small/mid/hauler)
const NPC_TRAVERSAL_MIN_MS = 90_000;   // long hauler routes take longer
const NPC_SHORT_MIN_MS = 40_000;

// Pick a weighted random lane (busier lanes spawn more traffic).
function npcPickLane() {
  const weighted = [];
  for (const l of LANES_SERVER) {
    const w = l.vol === 'high' ? 4 : l.vol === 'medium' ? 2 : 1;
    for (let i = 0; i < w; i++) weighted.push(l);
  }
  return weighted[Math.floor(Math.random() * weighted.length)];
}

// Build a believable manifest: prefer a commodity that's CHEAP at origin (an NPC
// would buy where it's cheap and sell where dear) — this makes NPC flow naturally
// push prices toward equilibrium, which players can read and front-run.
function npcBuildManifest(fromId, toId) {
  const fromState = getColonyState(fromId), toState = getColonyState(toId);
  if (!fromState || !toState) return null;
  // Rank all commodities by origin→dest spread; an NPC loads the best few.
  const ranked = [];
  for (const com of COMMODITIES) {
    const fp = getCommodityPrice(fromId, com.id); const tp = getCommodityPrice(toId, com.id);
    if (!fp || !tp) continue;
    const spread = (tp.price - fp.price) / fp.price;
    ranked.push({ com, spread });
  }
  if (!ranked.length) return null;
  ranked.sort((a,b) => b.spread - a.spread);
  // Carry 1–3 commodities (weighted toward the best spreads).
  const lines = 1 + Math.floor(Math.random() * 3);
  const picks = ranked.slice(0, lines);
  return picks.map(p => ({
    commodityId: p.com.id,
    commodityName: p.com.name,
    qty: 10 + Math.floor(Math.random() * 71), // small loads, 10–80u each
  }));
}

function npcSpawn() {
  if (NPC_FLEET.size >= NPC_MAX_SHIPS) return;
  const lane = npcPickLane();
  const reversed = Math.random() < 0.5;
  const fromId = reversed ? lane.to : lane.from;
  const toId   = reversed ? lane.from : lane.to;
  if (!isMarketColony(getColonyState(fromId)) || !isMarketColony(getColonyState(toId))) return; // no market there
  const cargo = npcBuildManifest(fromId, toId);
  if (!cargo || !cargo.length) return;
  const variant = NPC_VARIANTS[Math.floor(Math.random() * NPC_VARIANTS.length)];
  const now = Date.now();
  const dur = (variant === 'v3' ? NPC_TRAVERSAL_MIN_MS : NPC_SHORT_MIN_MS) + Math.random() * 30_000;
  const id = 'NPC' + Math.random().toString(36).slice(2, 9).toUpperCase();
  const ship = {
    id, variant, from: fromId, to: toId, laneType: lane.type,
    cargo, startTs: now, arriveTs: now + dur, sold: false,
  };
  NPC_FLEET.set(id, ship);
  // Buy each line at origin: demand pressure → origin prices tick UP. Half player impact.
  try {
    const fromColony = getColonyState(fromId);
    if (fromColony) for (const line of cargo) nudgeAndBroadcast(fromColony, line.commodityId, -0.006 * Math.log10(1 + line.qty), 'npc_buy');
  } catch(_){}
  broadcast({ type:'npc_spawn', data: npcWire(ship) });
}

function npcArrive(ship) {
  // Sell each line at destination: supply flood → destination prices tick DOWN.
  try {
    const toColony = getColonyState(ship.to);
    if (toColony) for (const line of ship.cargo) nudgeAndBroadcast(toColony, line.commodityId, 0.006 * Math.log10(1 + line.qty), 'npc_sell');
  } catch(_){}
  broadcast({ type:'npc_arrive', data:{ id: ship.id, to: ship.to } });
  NPC_FLEET.delete(ship.id);
}

function npcTick() {
  const now = Date.now();
  for (const ship of [...NPC_FLEET.values()]) {
    if (!ship.sold && now >= ship.arriveTs) { ship.sold = true; npcArrive(ship); }
  }
}

// Wire format for clients: enough to render the ship moving + show its full manifest.
function npcWire(s) {
  const now = Date.now();
  const progress = Math.max(0, Math.min(1, (now - s.startTs) / (s.arriveTs - s.startTs)));
  return { id:s.id, variant:s.variant, from:s.from, to:s.to, laneType:s.laneType,
           cargo: s.cargo.map(l => ({ commodityId:l.commodityId, commodityName:l.commodityName, qty:l.qty })),
           startTs:s.startTs, arriveTs:s.arriveTs, progress };
}

// Full fleet snapshot (sent to a client on galaxy open / reconnect).
function npcFleetSnapshot() { return [...NPC_FLEET.values()].map(npcWire); }

// ─── SHIPPING CONTRACTS (options) ─────────────────────────────────────────────
// House-written, cash-settled options on a lane's commodity spread. No cargo, no ship.
// Pricing verified in isolation (contract_pricing.js): ~12% house edge, players win ~half.
const CONTRACT_HOUSE_EDGE   = 0.12;
const CONTRACT_VOL_TO_SIGMA = 1.8;
const CONTRACT_LANE_PREMIUM = { corporate:1.00, grey:1.15, contested:1.30, dark:1.50 };
const CONTRACT_BLOCKADE_MULT = 1.35;   // blockade raises premium AND realized volatility
const CONTRACT_MIN_FRAC     = 0.04;
const CONTRACT_OFFER_COUNT  = 8;        // how many contracts the board shows at once
const CONTRACT_OFFER_TTL_MS = 90_000;   // board reshuffles every 90s
const CONTRACT_EXPIRIES_MS  = [3_600_000, 4*3_600_000, 8*3_600_000]; // 1h / 4h / 8h
const CONTRACT_KICKBACK_RATE = 0.02;    // 2% of exercise profit to lane shareholders

let _contractOffers = [];
let _contractOffersTs = 0;

function contractPremium(buyPrice, sellPrice, commodityVol, laneType, blockaded, ttlMs, size) {
  const strikeSpread = Math.max(0, sellPrice - buyPrice);
  const hoursToExpiry = Math.max(0.25, ttlMs / 3_600_000);
  const timeFactor = Math.sqrt(hoursToExpiry);
  const laneFactor = CONTRACT_LANE_PREMIUM[laneType] || 1.0;
  const blockadeVolMult = blockaded ? CONTRACT_BLOCKADE_MULT : 1.0;
  const sigma = buyPrice * commodityVol * CONTRACT_VOL_TO_SIGMA * timeFactor * laneFactor * blockadeVolMult;
  const expectedUpsidePerUnit = sigma / 2.5;
  let premiumPerUnit = expectedUpsidePerUnit * (1 + CONTRACT_HOUSE_EDGE);
  const floor = Math.max(strikeSpread, buyPrice) * CONTRACT_MIN_FRAC;
  premiumPerUnit = Math.max(premiumPerUnit, floor * 0.1);
  return {
    strikeSpread: Math.round(strikeSpread * 100) / 100,
    premiumPerUnit: Math.round(premiumPerUnit * 100) / 100,
    premiumTotal: Math.round(premiumPerUnit * size * 100) / 100,
    sigma: Math.round(sigma * 100) / 100,
  };
}

// Find the cheapest-buy and dearest-sell colonies for a commodity (the natural lane).
function bestLaneForCommodity(commodityId) {
  let best=null, worst=null;
  for (const c of getAllColonyStates()) {
    if (!isMarketColony(c)) continue;
    const pr = getCommodityPrice(c.id, commodityId);
    if (!pr) continue;
    if (!best || pr.price < best.price) best = { id:c.id, price:pr.price };
    if (!worst || pr.price > worst.price) worst = { id:c.id, price:pr.price };
  }
  if (!best || !worst || best.id === worst.id) return null;
  return { from:best.id, to:worst.id, buyPrice:best.price, sellPrice:worst.price };
}

function laneTypeBetween(a, b) {
  const lane = LANES_SERVER.find(l => (l.from===a&&l.to===b)||(l.from===b&&l.to===a));
  return lane ? lane.type : 'grey';
}

// Regenerate the rotating offer board: pick commodities with real spreads, price them.
function refreshContractOffers() {
  const offers = [];
  const pool = [...COMMODITIES];
  // Shuffle and walk until we have enough valid offers.
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; }
  for (const com of pool) {
    if (offers.length >= CONTRACT_OFFER_COUNT) break;
    const lane = bestLaneForCommodity(com.id);
    if (!lane) continue;
    const spread = lane.sellPrice - lane.buyPrice;
    if (spread <= 0) continue;
    const ttlMs = CONTRACT_EXPIRIES_MS[Math.floor(Math.random()*CONTRACT_EXPIRIES_MS.length)];
    const laneType = laneTypeBetween(lane.from, lane.to);
    const blockaded = !!(activeBlockades.get(getLaneKey(lane.from, lane.to))||{}).active;
    const size = [25, 50, 100][Math.floor(Math.random()*3)];
    const pr = contractPremium(lane.buyPrice, lane.sellPrice, com.vol, laneType, blockaded, ttlMs, size);
    offers.push({
      offerId: 'OF'+Math.random().toString(36).slice(2,9).toUpperCase(),
      commodityId: com.id, commodityName: com.name, icon: com.icon,
      from: lane.from, to: lane.to, laneType, blockaded,
      buyPrice: Math.round(lane.buyPrice), sellPrice: Math.round(lane.sellPrice),
      strikeSpread: pr.strikeSpread, premiumPerUnit: pr.premiumPerUnit, premiumTotal: pr.premiumTotal,
      size, ttlMs, expiresInMin: Math.round(ttlMs/60000),
    });
  }
  _contractOffers = offers;
  _contractOffersTs = Date.now();
  return offers;
}

function getContractOffers() {
  if (!_contractOffers.length || Date.now() - _contractOffersTs > CONTRACT_OFFER_TTL_MS) refreshContractOffers();
  return _contractOffers;
}

// Settle one contract: cash-settled on the CURRENT spread vs the locked strike.
function settleContract(c, reason) {
  const p = getPlayer(c.player_id);
  const com = COMMODITY_BY_ID[c.commodity_id];
  // Current spread on the SAME lane the contract was struck on.
  const fp = getCommodityPrice(c.from_colony, c.commodity_id);
  const tp = getCommodityPrice(c.to_colony, c.commodity_id);
  const curSpread = (fp && tp) ? Math.max(0, tp.price - fp.price) : 0;
  const gain = Math.max(0, curSpread - c.strike_spread);
  const payout = Math.round(gain * c.size * 100) / 100;
  const status = payout > 0 ? 'exercised' : 'expired';
  settleShippingContract(c.id, status, payout, Date.now());
  if (payout > 0 && p) {
    safeAddCash(p, payout); savePlayer(p);
    // Lane kickback to shareholders from the profit (reuses existing distribution).
    try { distributeLaneKickback(getLaneKey(c.from_colony, c.to_colony), payout, CONTRACT_KICKBACK_RATE, c.player_id); } catch(_){}
    pushHeadline(`Contract exercised: ${com?com.name:c.commodity_id} ${c.from_colony.replace(/_/g,' ')}→${c.to_colony.replace(/_/g,' ')} pays ${Math.round(payout).toLocaleString()} SC`, 'good', '📈');
  }
  const sockets = playerSockets.get(c.player_id);
  if (sockets) {
    const msg = JSON.stringify({ type:'contract_settled', data:{ id:c.id, status, payout,
      commodity:com?com.name:c.commodity_id, from:c.from_colony, to:c.to_colony,
      reason: reason||status, cash:p?p.cash:0 }});
    for (const ws of sockets) { try { if (ws.readyState===1) ws.send(msg); } catch(_){} }
    if (p) { const pf=JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)}); for (const ws of sockets){try{if(ws.readyState===1)ws.send(pf);}catch(_){}} }
  }
  return { status, payout };
}

// Auto-expire sweep: settle any open contracts past expiry (auto-exercises if ITM).
function sweepContracts() {
  try { for (const c of getExpiredOpenContracts(Date.now())) settleContract(c, 'expired'); }
  catch(e) { console.error('[Contracts sweep]', e); }
}

// ─── COMMODITY MARKET (trade) ─────────────────────────────────────────────────
app.post('/api/commodities/buy', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!shipClassFor(p.id)) return res.status(403).json({ ok:false, error:'no_ship' });
    const { colonyId, commodityId } = req.body || {};
    const qty = Math.max(1, Math.floor(Number(req.body?.qty) || 0));
    const com = COMMODITY_BY_ID[commodityId];
    if (!com) return res.status(400).json({ ok:false, error:'unknown_commodity' });
    const colony = getColonyState(colonyId);
    if (!colony) return res.status(404).json({ ok:false, error:'colony_not_found' });
    if (!isMarketColony(colony)) return res.status(403).json({ ok:false, error:'no_market_here' });

    const leading = colonyLeadingFaction(colony);
    const tithe = leading === 'guild' ? GUILD_TITHE : 0;
    let row = getCommodityPrice(colonyId, commodityId);
    if (!row) { // lazy seed
      const seed = Math.round(commodityTargetPrice(com, leading, colony.tension, 0, colony.id) * 100) / 100;
      upsertCommodityPrice(colonyId, commodityId, seed, 0);
      row = { price: seed, supply: 0 };
    }
    // Anti-exploit: price the fill off the POST-impact price, so a buy pays the
    // slippage it causes instead of front-running its own price move.
    const deltaSupply = -0.012 * Math.log10(1 + qty);
    const projected = previewCommodityPrice(colony, commodityId, deltaSupply);
    const unitBuy = Math.round(projected.price * (1 + tithe) * 100) / 100;
    const cost = Math.round(unitBuy * qty * 100) / 100;
    if ((p.cash || 0) < cost) return res.status(400).json({ ok:false, error:'insufficient_funds', need:cost, have:p.cash });

    p.cash = Math.round((p.cash - cost) * 100) / 100;
    savePlayer(p);
    addCargo(p.id, commodityId, qty, unitBuy, colonyId);
    // Buying tightens local supply (price drifts up). Scale impact by lot size.
    const newPrice = nudgeAndBroadcast(colony, commodityId, deltaSupply, 'player_buy');

    res.json({ ok:true, bought:qty, unitPrice:unitBuy, cost, cash:p.cash, newPrice,
               cargo:cargoSnapshot(p.id) });
    try { broadcastToPlayer(p.id, { type:'portfolio', data:snapshotPortfolio(getPlayer(p.id)) }); } catch(_){}
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/commodities/sell', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!shipClassFor(p.id)) return res.status(403).json({ ok:false, error:'no_ship' });
    const { colonyId, commodityId } = req.body || {};
    const qtyReq = Math.max(1, Math.floor(Number(req.body?.qty) || 0));
    const com = COMMODITY_BY_ID[commodityId];
    if (!com) return res.status(400).json({ ok:false, error:'unknown_commodity' });
    const colony = getColonyState(colonyId);
    if (!colony) return res.status(404).json({ ok:false, error:'colony_not_found' });
    if (!isMarketColony(colony)) return res.status(403).json({ ok:false, error:'no_market_here' });

    const held = getCargoQty(p.id, commodityId, colonyId);
    if (held <= 0) return res.status(400).json({ ok:false, error:'no_cargo_here' });
    const qty = Math.min(qtyReq, held);

    const leading = colonyLeadingFaction(colony);
    let row = getCommodityPrice(colonyId, commodityId);
    if (!row) {
      const seed = Math.round(commodityTargetPrice(com, leading, colony.tension, 0, colony.id) * 100) / 100;
      upsertCommodityPrice(colonyId, commodityId, seed, 0);
      row = { price: seed, supply: 0 };
    }
    // Anti-exploit: apply impact FIRST, then price the fill off the depressed
    // price, so a sell eats its own slippage instead of selling into a stale mid.
    const newPrice = nudgeAndBroadcast(colony, commodityId, 0.012 * Math.log10(1 + qty), 'player_sell');
    const unitSell = Math.round(newPrice * 100) / 100; // sell side: no tithe
    const proceeds = Math.round(unitSell * qty * 100) / 100;

    removeCargo(p.id, commodityId, qty, colonyId);
    p.cash = Math.round((p.cash + proceeds) * 100) / 100;
    savePlayer(p);

    res.json({ ok:true, sold:qty, unitPrice:unitSell, proceeds, cash:p.cash, newPrice,
               cargo:cargoSnapshot(p.id) });
    try { broadcastToPlayer(p.id, { type:'portfolio', data:snapshotPortfolio(getPlayer(p.id)) }); } catch(_){}
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Current player's cargo hold.
app.get('/api/cargo/me', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    res.json({ ok:true, cargo:cargoSnapshot(p.id) });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// In-transit cargo shipments for the current player.
app.get('/api/cargo/transit', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const now = Date.now();
    const rows = getPlayerCargoShipments(p.id, 'in_transit').map(s => {
      const com = COMMODITY_BY_ID[s.commodity_id];
      const elapsed = now - s.created_at;
      const phase = SHIPMENT_PHASES[s.phase_idx] || SHIPMENT_PHASES[0];
      const pct = Math.max(0, Math.min(100, Math.round(elapsed / SHIPMENT_TOTAL_MS * 100)));
      return { id:s.id, commodity:com?com.name:s.commodity_id, qty:s.qty,
               from:s.from_colony, to:s.to_colony, laneType:s.lane_type,
               insured:!!s.insured, resolveTs:s.resolve_ts, shipClass:s.ship_class,
               phase:phase.id, phaseLabel:phase.label, phaseIdx:s.phase_idx, pct,
               intercepted:s.status==='intercepted',
               interceptChance:Math.round((s.intercept_chance||0)*100) };
    });
    res.json({ ok:true, shipments:rows, phases:SHIPMENT_PHASES.map(p=>({id:p.id,label:p.label})) });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Server NPC trade fleet snapshot (client renders these moving + shows manifests).
app.get('/api/npc-fleet', (req, res) => {
  try { res.json({ ok:true, fleet: npcFleetSnapshot() }); }
  catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Smuggling tab config: guard escort tiers + contraband cargo types.
app.get('/api/smuggling/config', (req, res) => {
  try {
    res.json({ ok:true,
      guards: GUARD_TIERS.map(g => ({ id:g.id, name:g.name, feeFrac:g.feeFrac, riskCut:g.riskCut, desc:g.desc })),
      cargo: CARGO_TYPES.map(c => ({ id:c.id, name:c.name, baseMult:c.baseMult, riskMod:c.riskMod })),
    });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// ─── Shipping contracts (options) ─────────────────────────────────────────────
// The rotating offer board (the house's bet menu).
app.get('/api/contracts/offers', (req, res) => {
  try { res.json({ ok:true, offers: getContractOffers(), reshuffleMs: CONTRACT_OFFER_TTL_MS }); }
  catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Player's open + recently settled contracts.
app.get('/api/contracts/mine', (req, res) => {
  try {
    const tok = tokenFrom(req); const p = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const now = Date.now();
    const open = getPlayerShippingContracts(p.id, 'open').map(c => {
      const fp = getCommodityPrice(c.from_colony, c.commodity_id);
      const tp = getCommodityPrice(c.to_colony, c.commodity_id);
      const curSpread = (fp && tp) ? Math.max(0, tp.price - fp.price) : 0;
      const com = COMMODITY_BY_ID[c.commodity_id];
      const intrinsic = Math.round(Math.max(0, curSpread - c.strike_spread) * c.size * 100) / 100;
      return { id:c.id, commodity:com?com.name:c.commodity_id, commodityId:c.commodity_id,
        from:c.from_colony, to:c.to_colony, strikeSpread:c.strike_spread, premiumPaid:c.premium_paid,
        size:c.size, expiresAt:c.expires_at, expiresInMin:Math.max(0,Math.round((c.expires_at-now)/60000)),
        curSpread:Math.round(curSpread*100)/100, intrinsic, inTheMoney: intrinsic>0 };
    });
    res.json({ ok:true, open });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Buy a contract off the board.
app.post('/api/contracts/buy', (req, res) => {
  try {
    const tok = tokenFrom(req); const p = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const offerId = String(req.body?.offerId||'');
    const offer = getContractOffers().find(o => o.offerId === offerId);
    if (!offer) return res.status(400).json({ ok:false, error:'offer_expired' });
    if ((p.cash||0) < offer.premiumTotal) return res.status(400).json({ ok:false, error:'insufficient_funds', need:offer.premiumTotal });
    p.cash = Math.round((p.cash - offer.premiumTotal) * 100) / 100;
    savePlayer(p);
    const now = Date.now();
    const id = 'SC' + Math.random().toString(36).slice(2,10).toUpperCase();
    createShippingContract({ id, playerId:p.id, commodityId:offer.commodityId,
      from:offer.from, to:offer.to, laneType:offer.laneType, strikeSpread:offer.strikeSpread,
      premiumPaid:offer.premiumTotal, size:offer.size, createdAt:now, expiresAt:now + offer.ttlMs });
    res.json({ ok:true, id, premiumPaid:offer.premiumTotal, cash:p.cash, expiresAt:now+offer.ttlMs });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Exercise a contract early (settle now at the current spread).
app.post('/api/contracts/exercise', (req, res) => {
  try {
    const tok = tokenFrom(req); const p = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const c = getShippingContract(String(req.body?.id||''));
    if (!c || c.player_id !== p.id) return res.status(404).json({ ok:false, error:'not_found' });
    if (c.status !== 'open') return res.status(400).json({ ok:false, error:'already_settled' });
    const result = settleContract(c, 'manual');
    res.json({ ok:true, ...result, cash:getPlayer(p.id).cash });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Ship classes: definitions + which the player owns.
app.get('/api/ships', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    // Floor to the free Skiff so a never-purchased account still shows an active ship.
    const owned = p ? (getPlayerShipClass(p.id) || STARTER_SHIP_ID) : '';
    const classes = Object.values(SHIP_CLASSES).map(s => ({ id:s.id, name:s.name, variant:s.variant, capacity:s.capacity, price:s.price, riskMod:s.riskMod, desc:s.desc }));
    res.json({ ok:true, owned, classes });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Buy / upgrade ship class.
app.post('/api/ships/buy', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    const classId = String(req.body?.classId||'');
    const ship = SHIP_CLASSES[classId];
    if (!ship) return res.status(400).json({ ok:false, error:'unknown_class' });
    if (classId === STARTER_SHIP_ID) return res.status(400).json({ ok:false, error:'starter_ship' });
    const owned = getPlayerShipClass(p.id) || STARTER_SHIP_ID;
    if (owned === classId) return res.status(400).json({ ok:false, error:'already_owned' });
    if ((p.cash||0) < ship.price) return res.status(400).json({ ok:false, error:'insufficient_funds', need:ship.price, have:p.cash });
    p.cash = Math.round((p.cash - ship.price) * 100) / 100;
    savePlayer(p);
    setPlayerShipClass(p.id, classId);
    pushHeadline(`${p.name} commissions a ${ship.name} (${ship.capacity.toLocaleString()}u hold)`, 'neutral', '🚀');
    res.json({ ok:true, owned:classId, capacity:ship.capacity, cash:p.cash });
    try { broadcastToPlayer(p.id, { type:'portfolio', data:snapshotPortfolio(getPlayer(p.id)) }); } catch(_){}
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

// Quote a shipment WITHOUT executing it: route, hops, time, and interception risk.
// Lets the console show risk before the player commits. Mirrors the ship endpoint math.
app.get('/api/cargo/quote', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p = tok ? getPlayer(tok) : null;
    const from = String(req.query.from||'');
    const to = String(req.query.to||'');
    const commodityId = String(req.query.commodityId||'');
    const qty = Math.max(1, Math.floor(Number(req.query.qty)||1));
    const com = COMMODITY_BY_ID[commodityId];
    if (!com) return res.json({ ok:false, error:'unknown_commodity' });
    if (from === to) return res.json({ ok:false, error:'same_colony' });
    const route = findRoute(from, to);
    if (!route) return res.json({ ok:false, error:'no_lane' });
    const hops = route.lanes.length;
    const riskOrder = { corporate:0, grey:1, contested:2, dark:3 };
    const routeLaneType = route.lanes.reduce((w,l)=> (riskOrder[l.type]||0)>(riskOrder[w]||0)?l.type:w, 'corporate');
    // Unit cost: player's avg at origin if held, else current price.
    let unitCost = getCommodityPrice(from, commodityId)?.price || com.basePrice;
    if (p) { const cr = getPlayerCargo(p.id).find(r => r.commodity_id===commodityId && r.colony_id===from); if (cr) unitCost = cr.avg_cost; }
    const flyByRisk = (hops - 1) * 0.10;
    const ship = p ? shipClassFor(p.id) : null;
    const shipMod = ship ? (ship.riskMod||0) : 0;
    // Guard escort (same tiers as smuggling): cuts the roll, fee is a % of cargo value.
    const guardTier = GUARD_BY_ID[req.query.guard] ? String(req.query.guard) : 'none';
    const guardCut = guardRiskCut(guardTier);
    const buyCost = Math.round(unitCost * qty * 100) / 100;
    const gFee = guardFee(guardTier, buyCost);
    // Insurance: a premium that refunds the cargo cost if the run is intercepted.
    // It does not lower the interception roll (that's what escort does) — it makes
    // a loss harmless, so the new per-hop risk can't take your stake. Stacking it
    // with an escort means paying both off the top, which eats most of the spread.
    const wantInsure = req.query.insure === '1' || req.query.insure === 'true';
    const insPremium = wantInsure ? Math.round(buyCost * insurancePremiumRate(buyCost) * 100) / 100 : 0;
    // If we have a player, use their faction-aware risk; otherwise base estimate.
    let interceptChance;
    if (p) interceptChance = cargoShipmentInterceptChance(p.id, from, to, routeLaneType, qty, unitCost);
    else   interceptChance = cargoShipmentInterceptChance('', from, to, routeLaneType, qty, unitCost);
    // Cap the risk-increasing terms at 50% FIRST, then let the escort (incl. Private
    // Army) subtract from the cap, so a paid reduction is always visible rather than
    // eaten by the clamp when raw risk sits above 50%.
    interceptChance = Math.max(0.03, Math.min(0.50, interceptChance + shipMod + flyByRisk) - guardCut);
    const totalMs = SHIPMENT_TOTAL_MS * hops;
    res.json({ ok:true, hops, route: route.path, laneType: routeLaneType,
      durSec: Math.round(totalMs/1000), durMin: Math.round(totalMs/60000),
      interceptChance: Math.round(interceptChance*100),
      flyByRisk: Math.round(flyByRisk*100),
      guardTier, guardFee: gFee, guardCut: Math.round(guardCut*100),
      insured: wantInsure, insurancePremium: insPremium,
      upfrontTotal: Math.round((gFee + insPremium) * 100) / 100,
      hasShip: !!ship, shipName: ship?ship.name:null });
  } catch(e) { res.json({ ok:false, error:String(e) }); }
});

// Ship cargo from one colony to another through a lane (arbitrage shipping).
app.post('/api/cargo/ship', (req, res) => {
  try {
    const tok = tokenFrom(req);
    const p   = tok ? getPlayer(tok) : null;
    if (!p) return res.status(401).json({ ok:false, error:'unauthorized' });
    // Single shipment only — no stacking. One in-transit run per player at a time.
    const _activeShipments = getPlayerCargoShipments(p.id, 'in_transit');
    if (_activeShipments && _activeShipments.length > 0) return res.status(400).json({ ok:false, error:'shipment_in_progress' });
    const { commodityId, from, to } = req.body || {};
    const wantInsurance = !!(req.body && req.body.insured);
    const qty = Math.max(1, Math.floor(Number(req.body?.qty) || 0));
    const com = COMMODITY_BY_ID[commodityId];
    if (!com) return res.status(400).json({ ok:false, error:'unknown_commodity' });
    if (from === to) return res.status(400).json({ ok:false, error:'same_colony' });
    const fromColony = getColonyState(from), toColony = getColonyState(to);
    if (!fromColony || !toColony) return res.status(404).json({ ok:false, error:'colony_not_found' });
    const route = findRoute(from, to);
    if (!route) return res.status(400).json({ ok:false, error:'no_lane' });
    const hops = route.lanes.length;            // 1 = direct, 2+ = multi-hop
    // The lane type used for risk is the RISKIEST lane on the whole route.
    const riskOrder = { corporate:0, grey:1, contested:2, dark:3 };
    const routeLaneType = route.lanes.reduce((worst,l)=> (riskOrder[l.type]||0) > (riskOrder[worst]||0) ? l.type : worst, 'corporate');

    const held = getCargoQty(p.id, commodityId, from);
    if (held < qty) return res.status(400).json({ ok:false, error:'insufficient_cargo_at_origin', have:held });

    // Ship class gates capacity and adds a risk modifier.
    const ship = shipClassFor(p.id);
    if (!ship) return res.status(403).json({ ok:false, error:'no_ship' });
    if (qty > ship.capacity) return res.status(400).json({ ok:false, error:'over_capacity', capacity:ship.capacity, shipName:ship.name });

    // Value the escrowed goods at the player's weighted avg cost for insurance/refund.
    const cargoRow = getPlayerCargo(p.id).find(r => r.commodity_id === commodityId && r.colony_id === from);
    const unitCost = cargoRow ? cargoRow.avg_cost : (getCommodityPrice(from, commodityId)?.price || com.basePrice);
    const buyCost  = Math.round(unitCost * qty * 100) / 100;

    // Return cost (fuel): a flat per-class fee + small distance/value component, paid
    // up front since the ship must deadhead home. Makes long big-ship hauls cost real.
    const returnCost = Math.round((2000 + ship.capacity * 0.02 + buyCost * 0.005) * 100) / 100;

    let insurancePaid = 0;
    if (wantInsurance) {
      const rate = insurancePremiumRate(buyCost);
      insurancePaid = Math.round(buyCost * rate * 100) / 100;
    }
    // Guard escort: same tiers as smuggling. Fee is a % of cargo value, paid up
    // front and gone if the run is intercepted (the escort dies with the cargo).
    const guardTier = GUARD_BY_ID[req.body?.guardTier] ? String(req.body.guardTier) : 'none';
    const gFee = guardFee(guardTier, buyCost);
    const upfront = insurancePaid + returnCost + gFee;
    if ((p.cash||0) < upfront) return res.status(400).json({ ok:false, error:'insufficient_funds', need:upfront, returnCost, insurancePaid, guardFee:gFee });
    p.cash = Math.round((p.cash - upfront) * 100) / 100;
    savePlayer(p);

    // Escrow the units out of the origin colony's hold now.
    removeCargo(p.id, commodityId, qty, from);

    // Interception chance, plus the ship-class risk modifier. Multi-hop adds a small
    // fly-by risk per extra hop (2.5% each) for skipping past colonies without docking.
    // Guard escort cut is baked into the stored chance, so the resolution roll uses it.
    const flyByRisk = (hops - 1) * 0.10;
    const guardCut = guardRiskCut(guardTier);
    let interceptChance = cargoShipmentInterceptChance(p.id, from, to, routeLaneType, qty, unitCost);
    // Same order as the quote: cap risk-increasing terms at 50%, then subtract escort.
    interceptChance = Math.max(0.03, Math.min(0.50, interceptChance + (ship.riskMod || 0) + flyByRisk) - guardCut);
    const now = Date.now();
    // Each hop is a full leg, so total transit scales with hop count
    // (3 hops = 30 min, not 10). Phases still step across the whole journey.
    const totalMs = SHIPMENT_TOTAL_MS * hops;
    const resolveTs = now + totalMs;
    const id = 'CS' + Math.random().toString(36).slice(2, 10).toUpperCase();
    createCargoShipment({ id, playerId:p.id, commodityId, qty, buyCost,
      from, to, laneType:routeLaneType, insured:wantInsurance, insurancePaid,
      interceptChance, createdAt:now, resolveTs,
      phase:'loading', phaseIdx:0, shipClass:ship.id, sellValue:0, totalMs, hops });
    // No per-shipment setTimeout — stepCargoShipments() advances phases on its tick.

    res.json({ ok:true, id, qty, from, to, laneType:routeLaneType, hops,
      route: route.path, durSec:Math.round(totalMs/1000), resolveTs,
      insured:wantInsurance, insurancePaid, returnCost, guardTier, guardFee:gFee, ship:ship.name,
      interceptChance:Math.round(interceptChance*100),
      cash:p.cash, cargo:cargoSnapshot(p.id) });
  } catch(e) { res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/galaxy/fund', (req, res) => {
  try {
    const { token, colonyId, factionId, amount } = req.body || {};
    const p = token ? getPlayer(token) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'not_logged_in' });
    const amt = Number(amount);
    if (!amt || amt < 1000) return res.status(400).json({ ok: false, error: 'min_1000' });
    if (p.cash < amt) return res.status(400).json({ ok: false, error: 'insufficient_funds' });
    const colony = getColonyState(colonyId);
    if (!colony) return res.status(404).json({ ok: false, error: 'colony_not_found' });
    const VALID = ['coalition','syndicate','void','guild'];
    if (!VALID.includes(factionId)) return res.status(400).json({ ok: false, error: 'invalid_faction' });

    // Deduct cash
    p.cash = Math.round((p.cash - amt) * 100) / 100;
    savePlayer(p);

    // Record funding
    recordFactionFunding(p.id, colonyId, factionId, amt);

    // Pooled control — everyone's contributions to this (colony, faction) bank into
    // a shared pool; every full Ƒ10,000,000 in the pool converts to 1% control. The
    // remainder carries forward (persisted), so a Ƒ3M donation isn't wasted — it sits
    // in the pool until later contributions push it over the next 10M line. No per-
    // donation cap: the pool size and the 96% control ceiling are the only limits.
    const WAR_FUND_PER_PCT = 10_000_000;
    let pending = getWarFundPending(colonyId, factionId) + amt;
    const boost = Math.floor(pending / WAR_FUND_PER_PCT); // whole 1% increments now affordable
    const ctrl = {
      coalition: colony.control_coalition || 0,
      syndicate: colony.control_syndicate || 0,
      void:      colony.control_void      || 0,
      guild:     colony.control_guild     || 0,
    };
    // Drain the boost proportionally from the other factions by their current
    // share, so the four values always re-sum to 100 with no faction below 1.
    const others = VALID.filter(f => f !== factionId);
    const othersTotal = others.reduce((s,f) => s + ctrl[f], 0);
    const target = Math.min(96, ctrl[factionId] + boost);
    const actualBoost = target - ctrl[factionId];
    ctrl[factionId] = target;
    if (othersTotal > 0) {
      let drained = 0;
      others.forEach(f => {
        const share = ctrl[f] / othersTotal;
        const take = Math.min(ctrl[f] - 1 < 0 ? 0 : ctrl[f] - 1, Math.round(actualBoost * share));
        ctrl[f] -= take; drained += take;
      });
      // Reconcile any rounding gap against the largest other faction.
      let gap = actualBoost - drained;
      while (gap !== 0) {
        const pool = others.filter(f => gap > 0 ? ctrl[f] > 1 : true)
                           .sort((a,b) => ctrl[b] - ctrl[a]);
        if (!pool.length) break;
        const f = pool[0];
        const step = gap > 0 ? 1 : -1;
        ctrl[f] -= step; gap -= step;
      }
    }
    // Final exact normalization to 100 (guard against any residual drift).
    const total = ctrl.coalition + ctrl.syndicate + ctrl.void + ctrl.guild;
    if (total !== 100) ctrl[factionId] = Math.min(97, Math.max(1, ctrl[factionId] + (100 - total)));

    // Subtract only the control we actually applied. If the 96% ceiling blocked some
    // of the boost, that SC stays in the pool rather than vanishing.
    pending -= actualBoost * WAR_FUND_PER_PCT;
    setWarFundPending(colonyId, factionId, pending);
    const pctToNext = Math.max(0, WAR_FUND_PER_PCT - pending);

    // Update tension — scales with control actually gained, so pure banking (no
    // crossed 1% line) doesn't spike tension.
    const newTension = Math.min(95, colony.tension + Math.round(actualBoost * 1.8));
    const leading = VALID.reduce((best, f) => ctrl[f] > ctrl[best] ? f : best, 'coalition');
    const contested = ctrl[leading] < 60 ? 1 : 0;

    // Conquest timer logic
    let conquestFaction = colony.conquest_faction;
    let conquestTimer   = colony.conquest_timer;
    if (ctrl[leading] >= 75 && leading !== colony.faction) {
      if (!conquestTimer || conquestFaction !== leading) {
        conquestTimer   = Date.now() + 24 * 60 * 60 * 1000; // 24h
        conquestFaction = leading;
        console.log(`[Galaxy] Conquest timer started: ${leading} on ${colonyId}`);
      }
    } else {
      conquestTimer   = null;
      conquestFaction = null;
    }

    const newState = {
      control_coalition: ctrl.coalition,
      control_syndicate: ctrl.syndicate,
      control_void:      ctrl.void,
      control_guild:     ctrl.guild,
      tension:    newTension,
      contested,
      conquest_faction: conquestFaction || null,
      conquest_timer:   conquestTimer   || null,
    };
    updateColonyState(colonyId, newState);

    // Broadcast live update to all clients
    broadcast({
      type: 'colony_update',
      data: { colonyId, ...newState, war_chest: colony.war_chest + amt },
    });

    // Update player's portfolio so P&L reflects the cash deduction immediately
    try {
      const equity = Object.entries(p.holdings||{}).reduce((acc,[sym,qty])=>{
        const co = companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
      },0);
      recordNetWorth(p.id, p.cash+equity, p.cash, equity);
      broadcastToPlayer(p.id, { type:'portfolio', data: snapshotPortfolio(p) });
    } catch(_) {}

    res.json({ ok: true, cash: p.cash, colonyId, factionId,
      pctGained: actualBoost, pending: Math.round(pending), pctToNext: Math.round(pctToNext),
      boost: actualBoost, newControl: ctrl });
  } catch(e) {
    console.error('[Galaxy] fund error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Dunce: self-redeem ───────────────────────────────────────────────────────
// Margin-call dunce → flat MARGIN_DUNCE_FINE. Mod (dev /dunce) dunce → 45% of net worth.
app.post('/api/dunce/redeem', (req, res) => {
  try {
    const { token } = req.body || {};
    const p = token ? getPlayer(token) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'not_logged_in' });
    if (!isDunced(p.id)) return res.status(400).json({ ok: false, error: 'not_dunced' });

    const rec = (() => { try { return getDunceRecord(p.id); } catch(_) { return null; } })();
    const isMarginDunce = !!(rec && rec.dunce_reason === 'margin_call');
    const netWorth = playerNetWorth(p);

    let fine;
    if (isMarginDunce) {
      fine = MARGIN_DUNCE_FINE;
      if (p.cash < fine) {
        return res.status(400).json({ ok: false, error: 'insufficient_cash', fine, cash: p.cash,
          msg: `You need Ƒ${fine.toLocaleString()} cash to clear the Debtor brand. Trade your way back up — dunced players can still trade.` });
      }
    } else {
      fine = Math.round(netWorth * 0.45 * 100) / 100;
      if (p.cash < fine) {
        return res.status(400).json({ ok: false, error: 'insufficient_cash', fine, cash: p.cash,
          msg: `You need Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} cash on hand (45% of net worth Ƒ${netWorth.toLocaleString(undefined,{maximumFractionDigits:2})}).` });
      }
    }

    p.cash = Math.round((p.cash - fine) * 100) / 100;
    savePlayer(p);
    clearDunce(p.id);

    try {
      recordNetWorth(p.id, playerNetWorth(p), p.cash, playerNetWorth(p) - p.cash);
      broadcastToPlayer(p.id, { type: 'portfolio', data: snapshotPortfolio(p) });
    } catch(_) {}

    broadcastToPlayer(p.id, { type: 'undunced', data: { msg: `You paid Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} and escaped the dunce corner.` } });
    broadcastToAdmins({ type: 'admin_log', data: { action: 'dunce_redeemed', player: p.name, fine, reason: isMarginDunce ? 'margin_call' : 'mod' } });
    broadcast({ type: 'chat', data: { id: Math.random().toString(36).slice(2), t: Date.now(), user: 'SYSTEM',
      text: `🎓 ${p.name} paid Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} to escape the dunce corner.`, badge: '🎓', color: '#888', channel: 'global' } });

    res.json({ ok: true, fine, newCash: p.cash });
  } catch(e) {
    console.error('[Dunce] redeem error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ─── Dev Communications (DB-persisted) ────────────────────────────────────────

app.get('/api/comms/bugs', (req, res) => {
  try {
    const bugs = getBugReports();
    res.json({ ok: true, bugs });
  } catch(e) { res.json({ ok: false, bugs: [] }); }
});

app.post('/api/comms/bugs/report', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const text = String(req.body?.text || '').slice(0, 500);
  if (!text) return res.status(400).json({ ok: false, error: 'text_required' });
  try {
    const bug = addBugReport(text, p.name);
    // Auto-upvote by reporter
    toggleBugUpvote(bug.id, p.id);
    res.json({ ok: true, id: bug.id });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

app.post('/api/comms/bugs/upvote', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });
  try {
    const upvotes = toggleBugUpvote(id, p.id);
    res.json({ ok: true, upvotes });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

app.post('/api/comms/bugs/resolve', requireAdmin, (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });
  try {
    const resolved = toggleBugResolved(id);
    if (resolved === null) return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, resolved });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

app.get('/api/comms/reports', requireAdmin, (req, res) => {
  try { res.json({ ok: true, reports: getPlayerReports() }); }
  catch(e) { res.json({ ok: true, reports: [] }); }
});

app.post('/api/comms/reports/file', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const target = String(req.body?.target || '').slice(0, 60);
  const reason = String(req.body?.reason || '').slice(0, 400);
  if (!target || !reason) return res.status(400).json({ ok: false, error: 'missing_fields' });
  try {
    addPlayerReport(target, reason, p.name);
    broadcastToAdmins({ type: 'player_report', data: { target, reporter: p.name, reason } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

app.get('/api/comms/requests', requireAdmin, (req, res) => {
  try { res.json({ ok: true, requests: getDevRequests() }); }
  catch(e) { res.json({ ok: true, requests: [] }); }
});

app.post('/api/comms/requests/submit', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const message = String(req.body?.message || '').slice(0, 400);
  if (!message) return res.status(400).json({ ok: false, error: 'message_required' });
  try {
    addDevRequest(p.name, message);
    broadcastToAdmins({ type: 'dev_request', data: { player: p.name, message } });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

app.post('/api/comms/requests/handle', requireAdmin, (req, res) => {
  const id = Number(req.body?.id);
  if (!id) return res.status(400).json({ ok: false, error: 'invalid_id' });
  try {
    handleDevRequest(id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: 'db_error' }); }
});

// ─── Fleshbook (in-house social feed) ─────────────────────────────────────────
function fbPostBlock(p) {
  if (isDunced(p.id)) return 'dunced';
  if (isMuted(p.id)) return 'muted';
  return null;
}
const _fbPostTs = new Map(), _fbReplyTs = new Map();
const FB_POST_COOLDOWN_MS = 30_000, FB_REPLY_COOLDOWN_MS = 12_000;
function fbCooldownLeft(map, id, ms, isAdmin) {
  if (isAdmin) return 0;
  const rem = (map.get(id) || 0) + ms - Date.now();
  return rem > 0 ? Math.ceil(rem / 1000) : 0;
}
function fbNotify(recipientId, postId, fromName, text) {
  try { fbAddNotification(recipientId, postId, fromName); } catch(_) {}
  try {
    broadcastToPlayer(recipientId, { type: 'chat', data: {
      id: uuidv4(), t: Date.now(), user: 'SYSTEM', text, badge: '💬', color: '#a78bfa', ttlMs: 60000 }});
    broadcastToPlayer(recipientId, { type: 'fleshbook_unread', data: { count: fbUnreadCount(recipientId) } });
  } catch(_) {}
}
// Resolve @mentions in a body to player ids (deduped, excludes the author, capped)
function fbMentionIds(body, authorId) {
  const ids = new Set(); const seen = new Set();
  const re = /@([A-Za-z0-9_\-]{2,40})/g; let m, iters = 0;
  while ((m = re.exec(body)) && iters < 12) {
    iters++;
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue; seen.add(key);
    try { const t = getPlayerByName(m[1]); if (t && t.id !== authorId && t.id !== 'GM') ids.add(t.id); } catch(_) {}
  }
  return ids;
}
app.get('/api/fleshbook/feed', (req, res) => {
  try {
    const viewer = (() => { const t = tokenFrom(req); return t ? getPlayer(t) : null; })();
    const sort = req.query?.sort === 'top' ? 'top' : 'new';
    res.json({ ok: true, posts: fbGetFeed(viewer ? viewer.id : null, 50, sort) });
  } catch(e) { res.json({ ok: false, posts: [] }); }
});
app.get('/api/fleshbook/post/:id/replies', (req, res) => {
  try { res.json({ ok: true, replies: fbGetReplies(Number(req.params.id)) }); }
  catch(e) { res.json({ ok: false, replies: [] }); }
});
app.post('/api/fleshbook/post', requirePlayer, (req, res) => {
  const p = req.player;
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!body) return res.status(400).json({ ok: false, error: 'empty' });
  const block = fbPostBlock(p);
  if (block) return res.status(403).json({ ok: false, error: block });
  const cd = fbCooldownLeft(_fbPostTs, p.id, FB_POST_COOLDOWN_MS, isAdminAccount(p.id));
  if (cd) return res.status(429).json({ ok: false, error: 'cooldown', seconds: cd });
  let faction = null; try { faction = getPlayerFaction(p.id); } catch(_) {}
  const post = fbAddPost({ authorId: p.id, authorName: p.name, faction, body, isGm: false });
  _fbPostTs.set(p.id, Date.now());
  for (const mid of fbMentionIds(body, p.id)) fbNotify(mid, post.id, p.name, `📣 ${p.name} mentioned you on Fleshbook.`);
  res.json({ ok: true, post });
});
app.post('/api/fleshbook/reply', requirePlayer, (req, res) => {
  const p = req.player;
  const postId = Number(req.body?.postId);
  const body = String(req.body?.body || '').trim().slice(0, 500);
  if (!postId || !body) return res.status(400).json({ ok: false, error: 'invalid' });
  const block = fbPostBlock(p);
  if (block) return res.status(403).json({ ok: false, error: block });
  const cd = fbCooldownLeft(_fbReplyTs, p.id, FB_REPLY_COOLDOWN_MS, isAdminAccount(p.id));
  if (cd) return res.status(429).json({ ok: false, error: 'cooldown', seconds: cd });
  let faction = null; try { faction = getPlayerFaction(p.id); } catch(_) {}
  const out = fbAddReply({ postId, authorId: p.id, authorName: p.name, faction, body, isGm: false });
  if (!out) return res.status(404).json({ ok: false, error: 'post_gone' });
  _fbReplyTs.set(p.id, Date.now());
  const notified = new Set([p.id]);
  if (out.postAuthorId && !notified.has(out.postAuthorId) && out.postAuthorId !== 'GM') {
    fbNotify(out.postAuthorId, postId, p.name, `💬 ${p.name} replied to your Fleshbook post.`);
    notified.add(out.postAuthorId);
  }
  for (const mid of fbMentionIds(body, p.id)) {
    if (notified.has(mid)) continue;
    fbNotify(mid, postId, p.name, `📣 ${p.name} mentioned you on Fleshbook.`);
    notified.add(mid);
  }
  res.json({ ok: true, reply: out.reply });
});
app.post('/api/fleshbook/vote', requirePlayer, (req, res) => {
  const postId = Number(req.body?.postId);
  if (!postId) return res.status(400).json({ ok: false, error: 'invalid' });
  res.json({ ok: true, ...fbToggleVote(postId, req.player.id) });
});
app.get('/api/fleshbook/unread', requirePlayer, (req, res) => {
  res.json({ ok: true, count: fbUnreadCount(req.player.id) });
});
app.post('/api/fleshbook/seen', requirePlayer, (req, res) => {
  fbMarkSeen(req.player.id);
  res.json({ ok: true });
});
// Delete: owner or admin (soft delete)
app.post('/api/fleshbook/delete', requirePlayer, (req, res) => {
  const p = req.player; const admin = isAdminAccount(p.id);
  const postId = Number(req.body?.postId);
  const replyId = Number(req.body?.replyId);
  if (postId) {
    const owner = fbPostOwner(postId);
    if (owner === null) return res.json({ ok: true });
    if (!admin && owner !== p.id) return res.status(403).json({ ok: false, error: 'forbidden' });
    fbDeletePost(postId);
  }
  if (replyId) {
    const owner = fbReplyOwner(replyId);
    if (owner === null) return res.json({ ok: true });
    if (!admin && owner !== p.id) return res.status(403).json({ ok: false, error: 'forbidden' });
    fbDeleteReply(replyId);
  }
  res.json({ ok: true });
});
// Edit: owner or admin
app.post('/api/fleshbook/edit', requirePlayer, (req, res) => {
  const p = req.player; const admin = isAdminAccount(p.id);
  const postId = Number(req.body?.postId);
  const replyId = Number(req.body?.replyId);
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ ok: false, error: 'empty' });
  if (postId) {
    const owner = fbPostOwner(postId);
    if (owner === null) return res.status(404).json({ ok: false, error: 'gone' });
    if (!admin && owner !== p.id) return res.status(403).json({ ok: false, error: 'forbidden' });
    const b = body.slice(0, 1000); fbEditPost(postId, b); return res.json({ ok: true, body: b });
  }
  if (replyId) {
    const owner = fbReplyOwner(replyId);
    if (owner === null) return res.status(404).json({ ok: false, error: 'gone' });
    if (!admin && owner !== p.id) return res.status(403).json({ ok: false, error: 'forbidden' });
    const b = body.slice(0, 500); fbEditReply(replyId, b); return res.json({ ok: true, body: b });
  }
  res.status(400).json({ ok: false, error: 'invalid' });
});
// Pin / unpin (admin)
app.post('/api/fleshbook/pin', requireAdmin, (req, res) => {
  const postId = Number(req.body?.postId);
  if (!postId) return res.status(400).json({ ok: false, error: 'invalid' });
  fbSetPinned(postId, !!req.body?.pinned);
  res.json({ ok: true, pinned: !!req.body?.pinned });
});
app.post('/api/fleshbook/gm-post', requireAdmin, (req, res) => {
  const author = (String(req.body?.author || '').trim().slice(0, 40)) || 'Mr. Flesh';
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!body) return res.status(400).json({ ok: false, error: 'empty' });
  res.json({ ok: true, post: fbAddPost({ authorId: 'GM', authorName: author, faction: 'flesh', body, isGm: true }) });
});

app.get('/health',(req,res)=>{res.json({status:'ok',uptime:process.uptime(),companies:companies.length,time:Date.now()});});

// ─── REST: Admin / Moderation ─────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const tok = tokenFrom(req);
  const p   = tok ? getPlayer(tok) : null;
  if (!p || !isAdminAccount(p.id)) return res.status(403).json({ ok: false, error: 'admin_only' });
  req.admin = p;
  next();
}

// ─── Item System Routes ────────────────────────────────────────────────────────

function requirePlayer(req, res, next) {
  const token = req.body?.token || req.query?.token
    || req.headers['x-auth-token'] || req.headers['authorization']?.replace(/^bearer /i,'');
  const p = token ? getPlayer(token) : null;
  if (!p) return res.status(401).json({ ok: false, error: 'auth_required' });
  req.player = p;
  next();
}

// Player profile — equipped items visible to everyone
app.get('/api/items/profile/:name', (req, res) => {
  try {
    const target = getPlayerByName(String(req.params.name || '').trim());
    if (!target) return res.status(404).json({ ok: false, error: 'not_found' });
    const inv     = getInventory(target.id);
    const equipped = getEquipped(target.id);
    const passive  = getEquippedPassiveBonus(target.id);
    const items = inv.map(row => ({
      invId: row.id, itemId: row.item_id,
      ...(ITEM_CATALOG[row.item_id] || {})
    }));
    res.json({ ok: true, name: target.name, title: target.title || null,
      portrait: target.portrait || null, faction: target.faction || null,
      items, equipped: equipped || {}, passiveBonus: passive });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Set the caller's selectable portrait (validated against the boot allowlist).
app.post('/api/portrait', requirePlayer, (req, res) => {
  try {
    let pid = String(req.body?.portrait || '').trim();
    if (pid) {
      if (GATED_PORTRAITS[pid]) {
        if (!isItemEquipped(req.player.id, GATED_PORTRAITS[pid].requiresItem))
          return res.status(400).json({ ok: false, error: 'portrait_locked' });
      } else if (!PORTRAIT_SET.has(pid)) {
        return res.status(400).json({ ok: false, error: 'invalid_portrait' });
      }
    }
    setPlayerPortrait(req.player.id, pid || null);
    res.json({ ok: true, portrait: pid || null });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Get player inventory + equipped + spin state
app.get('/api/items/inventory', requirePlayer, (req, res) => {
  try {
    const inv = getInventory(req.player.id);
    const equipped = getEquipped(req.player.id);
    const spinRow = getSlotRecord(req.player.id);
    const items = inv.map(row => ({
      invId: row.id, itemId: row.item_id, source: row.source, acquiredAt: row.acquired_at,
      ...ITEM_CATALOG[row.item_id]
    }));
    res.json({ ok: true, inventory: items, equipped: equipped || {}, spins: spinRow.spins_remaining, spinsUsed: spinRow.spins_used, milestoneTrades: spinRow.milestone_trades });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Equip an item
app.post('/api/items/equip', requirePlayer, (req, res) => {
  try {
    const { invId, slot } = req.body;
    if (!invId || !slot) return res.status(400).json({ ok: false, error: 'missing_params' });
    const ok = equipItem(req.player.id, slot, invId);
    if (!ok) return res.status(400).json({ ok: false, error: 'equip_failed' });
    enforcePortraitGate(req.player.id);
    const passiveBonus = getEquippedPassiveBonus(req.player.id);
    res.json({ ok: true, passiveBonus });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Unequip a slot
app.post('/api/items/unequip', requirePlayer, (req, res) => {
  try {
    const { slot } = req.body;
    if (!slot) return res.status(400).json({ ok: false, error: 'missing_slot' });
    unequipItem(req.player.id, slot);
    enforcePortraitGate(req.player.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Spin the slot machine
app.post('/api/items/spin', requirePlayer, (req, res) => {
  try {
    const p = req.player;
    // CEO guaranteed rare drop once per month handled separately via god_cmd
    const result = useSpinAndDrop(p.id);
    if (!result.ok) return res.status(400).json(result);
    const spinRow = getSlotRecord(p.id);
    // Broadcast spin result to player's sockets
    broadcastToPlayer(p.id, { type:'spin_result', data:{
      item: result.item,
      invId: result.invId,
      rarity: result.item.rarity,
      rarityColor: RARITY_CONFIG[result.item.rarity]?.color,
      spinsRemaining: spinRow.spins_remaining,
    }});
    res.json({ ok: true, item: result.item, invId: result.invId, spinsRemaining: spinRow.spins_remaining });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Item market — get listings
app.get('/api/items/market', (req, res) => {
  try {
    const listings = getMarketListings(100).map(l => ({
      ...l,
      itemMeta: ITEM_CATALOG[l.item_id] || null,
      rarityColor: RARITY_CONFIG[ITEM_CATALOG[l.item_id]?.rarity]?.color || '#888',
    }));
    res.json({ ok: true, listings });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// List item on market
app.post('/api/items/market/list', requirePlayer, (req, res) => {
  try {
    const { invId, price } = req.body;
    if (!invId || !price || price <= 0) return res.status(400).json({ ok: false, error: 'invalid_params' });
    const result = listItemOnMarket(req.player.id, invId, Math.min(price, 999_999_999));
    res.json(result);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Buy item from market
app.post('/api/items/market/buy', requirePlayer, (req, res) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ ok: false, error: 'missing_listing' });
    const result = buyMarketItem(req.player.id, listingId);
    if (!result.ok) return res.status(400).json(result);
    const p = getPlayer(req.player.id);
    if (p) broadcastToPlayer(p.id, { type:'portfolio', data: snapshotPortfolio(p) });
    res.json(result);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Cancel a market listing
app.post('/api/items/market/cancel', requirePlayer, (req, res) => {
  try {
    const { listingId } = req.body;
    const ok = cancelMarketListing(req.player.id, listingId);
    res.json({ ok });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Scrap an item for a flat Ƒ500 (inventory/Ƒbay clutter sink)
app.post('/api/items/scrap', requirePlayer, (req, res) => {
  try {
    const { invId } = req.body;
    if (!invId) return res.status(400).json({ ok: false, error: 'missing_invId' });
    const result = scrapItem(req.player.id, invId);
    if (!result.ok) return res.status(400).json(result);
    const p = getPlayer(req.player.id);
    if (p) broadcastToPlayer(p.id, { type:'portfolio', data: snapshotPortfolio(p) });
    res.json(result);
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Mute a player for N minutes (default 10)
app.post('/api/admin/mute', requireAdmin, (req, res) => {
  try {
    const { targetName, minutes = 10, reason = '' } = req.body || {};
    const target = getPlayerByName(String(targetName || '').trim());
    if (!target) return res.status(404).json({ ok: false, error: 'player_not_found' });
    const until = Date.now() + Math.max(1, Number(minutes)) * 60_000;
    setMute(target.id, until, req.admin.name, reason);
    broadcastToPlayer(target.id, { type: 'system_message', data: {
      text: `You have been muted for ${minutes} minute(s) by an admin. Reason: ${reason || 'none'}`,
      color: '#ff6b6b'
    }});
    // Notify all admins
    broadcastToAdmins({ type: 'admin_log', data: {
      action: 'mute', by: req.admin.name, target: target.name,
      minutes, reason, until
    }});
    res.json({ ok: true, target: target.name, mutedUntil: until });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Unmute a player
app.post('/api/admin/unmute', requireAdmin, (req, res) => {
  try {
    const { targetName } = req.body || {};
    const target = getPlayerByName(String(targetName || '').trim());
    if (!target) return res.status(404).json({ ok: false, error: 'player_not_found' });
    clearMute(target.id);
    broadcastToPlayer(target.id, { type: 'system_message', data: {
      text: 'Your mute has been lifted by an admin.', color: '#51cf66'
    }});
    res.json({ ok: true, target: target.name });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Timeout: disconnect a player's WebSocket session (they can reconnect)
app.post('/api/admin/timeout', requireAdmin, (req, res) => {
  try {
    const { targetName, reason = '' } = req.body || {};
    const target = getPlayerByName(String(targetName || '').trim());
    if (!target) return res.status(404).json({ ok: false, error: 'player_not_found' });
    const sockets = playerSockets.get(target.id);
    if (sockets && sockets.size > 0) {
      const msg = JSON.stringify({ type: 'kicked', data: {
        reason: reason || 'You have been timed out by an admin.'
      }});
      for (const ws of sockets) { try { ws.send(msg); ws.terminate(); } catch(_) {} }
    }
    broadcastToAdmins({ type: 'admin_log', data: {
      action: 'timeout', by: req.admin.name, target: target.name, reason
    }});
    res.json({ ok: true, target: target.name });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Persisted, pinned, expiring announcement. Shared by REST + god_broadcast WS cmd.
function postAnnouncement(text, author, durationMin) {
  const dur = Math.max(1, Math.min(10080, Number(durationMin) || 30)); // 1 min .. 7 days
  const a = addAnnouncement(String(text).slice(0, 500), author, dur * 60 * 1000);
  broadcast({ type: 'announcement_set', data: a });
  return a;
}

// Server-wide admin announcement (REST) - persisted + pinned + expiring
app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  try {
    const { text, durationMin } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: 'text_required' });
    const a = postAnnouncement(text, req.admin.name, durationMin);
    res.json({ ok: true, id: a.id });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// Clear a single pinned announcement early
app.post('/api/admin/broadcast/clear', requireAdmin, (req, res) => {
  try {
    const id = Number(req.body?.id);
    if (id) { clearAnnouncement(id); broadcast({ type: 'announcement_clear', data: { id } }); }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// View moderation record for a player
app.get('/api/admin/modlog/:name', requireAdmin, (req, res) => {
  try {
    const target = getPlayerByName(req.params.name);
    if (!target) return res.status(404).json({ ok: false, error: 'player_not_found' });
    const record = getModerationRecord(target.id);
    res.json({ ok: true, name: target.name, record: record || {} });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

// List all currently online players (admin only)
app.get('/api/admin/online', requireAdmin, (req, res) => {
  try {
    const online = [];
    for (const [pid] of playerSockets) {
      const p = getPlayer(pid); if (!p) continue;
      online.push({ id: p.id, name: p.name, level: p.level, patreon_tier: p.patreon_tier });
    }
    res.json({ ok: true, online, count: online.length });
  } catch(e) { res.status(500).json({ ok: false, error: String(e) }); }
});

function broadcastToAdmins(msg) {
  const data = JSON.stringify(msg);
  for (const [pid] of playerSockets) {
    if (!isAdminAccount(pid)) continue;
    const sockets = playerSockets.get(pid);
    if (!sockets) continue;
    for (const ws of sockets) { try { if (ws.readyState === 1) ws.send(data); } catch(_) {} }
  }
}
app.get('/state',(req,res)=>{res.json({companies:companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price,sector:c.sector})),headlines:headlines.slice(-30),time:Date.now()});});
app.post('/snapshot', requireAdmin, (req,res)=>{saveMarketState(companies,headlines);res.json({saved:true});});
app.get('/api/v1/eoh/:ticker',(req,res)=>{const sym=String(req.params.ticker||'').toUpperCase();res.json(EOH.get(sym)||[]);});
app.get('/api/v1/fmi',(_req,res)=>{res.json({ticker:FMI.ticker,treasury:FMI.treasury});});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenFrom(req){
  const q=req.query?.token; if(q)return String(q);
  const xat=req.headers['x-auth-token']; if(xat)return String(xat);
  const auth=req.headers['authorization'];
  if(auth&&String(auth).toLowerCase().startsWith('bearer '))return String(auth).slice(7);
  if(req.body?.token)return String(req.body.token);
  return null;
}

// ── Chat history: per-room count-bounded rings, no time expiry ───────────────
// Count-bounded (not time-bounded) so quiet rooms keep scrollback and do not read
// as dead. Per-room (not per-user) so memory is fixed at rooms x CHAT_RING_MAX
// regardless of population. Transient notifications (data.transient) never persist.
const CHAT_RING_MAX = 200; // per room. ~20 rooms x 200 x ~0.4KB is well under 2MB.
const chatRings = new Map(); // "channel:room" -> msg[]
function ringKey(d) {
  const ch = (d && d.channel) || 'global';
  const room = Math.min(5, Math.max(1, parseInt(d && d.room) || 1));
  return ch + ':' + room;
}
function pushChatHistory(msg) {
  const d = msg.data || {};
  if (d.transient) return; // notifications are not scrollback
  const key = ringKey(d);
  let ring = chatRings.get(key);
  if (!ring) { ring = []; chatRings.set(key, ring); }
  ring.push(msg);
  if (ring.length > CHAT_RING_MAX) ring.shift();
}
function getChatHistory() {
  // Flatten all rooms. Client routes each by data.channel/room; intra-room order kept.
  const out = [];
  for (const ring of chatRings.values()) for (const m of ring) out.push(m);
  return out;
}

function broadcast(msg){const data=JSON.stringify(msg);wss.clients.forEach(ws=>{if(ws.readyState===1)ws.send(data);});
  // Track chat messages for new-login history
  if (msg.type === 'chat' || msg.type === 'system_message') pushChatHistory(msg);
}

// ── Auto-Accumulate engine ────────────────────────────────────────────────────
// Buys a clip from a player's segregated reserve when a held long drops below
// their average cost by the configured threshold. Online players only (v1) — runs
// while connected, fitting passive second-monitor play. Each fill is sourced ONLY
// from reserve_c (never main cash), atomically debited, and self-throttles: buying
// below avg lowers avg, which lowers the next trigger.
const AUTO_ACCUM_INTERVAL_MS = 15000;
const AUTO_ACCUM_COOLDOWN_MS = 60000;
setInterval(() => {
  try {
    const armed = getArmedAutoAccum();
    if (!armed.length) return;
    const now = Date.now();
    const taxRate = TRADE_TAX_BPS / 10000;
    for (const cfg of armed) {
      try {
        if (now - (cfg.last_buy_t || 0) < AUTO_ACCUM_COOLDOWN_MS) continue;
        if (!playerSockets.has(cfg.player_id)) continue;               // online only (v1)
        if (!hasMarketUpgrade(cfg.player_id, 'auto_accumulate')) continue;
        const c = companies.find(x => x.symbol === cfg.symbol);
        if (!c) continue;
        const actor = getPlayer(cfg.player_id);
        if (!actor) continue;
        const qty = Number(actor.holdings?.[cfg.symbol] || 0);
        if (qty <= 0) continue;                                        // need a long to have an avg cost
        const basisC = Number(actor.basisC?.[cfg.symbol] || 0);
        if (basisC <= 0) continue;
        const avgC = basisC / qty;                                     // cents/share
        const priceC = toCents(c.price);
        if (priceC <= 0) continue;
        if (priceC > avgC * (1 - cfg.drop_bps / 10000)) continue;      // not below threshold
        const budgetC = Math.min(Number(cfg.clip_c || 0), Number(cfg.reserve_c || 0));
        const buyQty = Math.floor(budgetC / (priceC * (1 + taxRate)));
        if (buyQty <= 0) continue;
        const costC = priceC * buyQty;
        const taxC = Math.floor(costC * TRADE_TAX_BPS / 10000);
        const totalC = costC + taxC;
        // Atomically debit the reserve; proceed only if it covered the buy.
        if (!spendAutoAccumReserve(cfg.player_id, cfg.symbol, totalC, now)) continue;
        actor.holdings = actor.holdings || {}; actor.basisC = actor.basisC || {};
        actor.holdings[cfg.symbol] = (actor.holdings[cfg.symbol] || 0) + buyQty;
        actor.basisC[cfg.symbol] = (actor.basisC[cfg.symbol] || 0) + costC;
        FMI.treasury += taxC / 100; FMI.hourlyTaxAccrual += taxC / 100;
        try { addFundCash('FLSH', fromCents(costC) * FLSH_TRADE_PCT); } catch(_) {}
        savePlayer(actor);
        broadcastTradeFeed({ side:'buy', symbol:cfg.symbol, qty:buyQty, price:c.price });
        const socks = playerSockets.get(cfg.player_id);
        if (socks) { const m = JSON.stringify({ type:'chat_system', data:{ text:`🤖 Auto-Accumulate: bought ${buyQty}x ${cfg.symbol} @ Ƒ${c.price.toFixed(2)} from reserve` } }); for (const w of socks) { try { if (w.readyState === 1) w.send(m); } catch(_) {} } }
      } catch (_) {}
    }
  } catch (_) {}
}, AUTO_ACCUM_INTERVAL_MS);

// Expire pinned announcements and tell clients to drop them
setInterval(() => {
  try {
    const cleared = pruneExpiredAnnouncements();
    for (const id of cleared) broadcast({ type: 'announcement_clear', data: { id } });
  } catch(_) {}
}, 30_000);

const playerSockets = new Map();
function broadcastToPlayer(playerId, msg) {
  const sockets = playerSockets.get(playerId);
  if (!sockets) return;
  const data = JSON.stringify(msg);
  for (const ws of sockets) { try { if(ws.readyState===1) ws.send(data); } catch(e){} }
}

function broadcastToFundMembers(fundId, msg) {
  try {
    const members = getFundMemberships(fundId);
    const data = JSON.stringify(msg);
    for (const m of members) {
      const sockets = playerSockets.get(m.player_id);
      if (!sockets) continue;
      for (const ws of sockets) { try { if(ws.readyState===1) ws.send(data); } catch(e){} }
    }
  } catch(e) {}
}

function pushHeadline(text,tone,symbol,category){
  const item={id:uuidv4(),t:Date.now(),text,tone,symbol:symbol||null,cat:category||'system'};
  headlines.push(item); if(headlines.length>200)headlines.shift();
  broadcast({type:'news',data:item});
}

// ─── Headlines ────────────────────────────────────────────────────────────────

// Sector-specific lore headlines (index matches SECTOR_NAMES)
const SECTOR_NEWS = [
  // 0: Finance
  { good: ['posts record lending volume','clears regulatory audit with no flags','opens new credit line to frontier colonies','refinances debt at historic lows','acquires rival lending desk','reports zero default quarter'],
    bad:  ['suspends withdrawals pending review','margin call cascade hits trading desk','auditors flag discrepancies in ledger','client funds frozen by colonial authority','loan defaults spike after colony unrest','credit facility revoked by oversight board'],
    weird:['begins accepting flesh-credits as collateral','quiet restructuring rumors surface','unnamed exec purchases escape pod','ledger entries found written in blood','vault contents reclassified as "organic"'] },
  // 1: Biotech
  { good: ['synthetic organ trials show 94% viability','gene therapy patent granted by colony board','receives emergency use authorization','clinical data exceeds analyst projections','bioweapon antidote contract awarded','tissue fabrication yield hits new high'],
    bad:  ['test subjects exhibit unexpected mutations','FDA-equivalent issues product hold','contamination shuts down growth vats','whistleblower alleges falsified trial data','organ rejection rates spike in Q3 batch','lab breach triggers quarantine protocol'],
    weird:['researchers report specimen "behaving autonomously"','anonymous donor funds consciousness transfer study','vat-grown tissue found to contain memories','lab AI begins requesting ethical review','new compound classified, clearance level: void'] },
  // 2: Insurance
  { good: ['claims ratio drops to sector-best levels','underwrites first intercolonial shipping policy','reinsurance treaty renewed at favorable terms','risk model upgrade reduces reserve requirements','captures market share in cargo insurance','colony stability bonus lowers premiums'],
    bad:  ['catastrophic loss event exceeds reserves','class action filed over denied claims','reinsurer pulls out of volatile corridor','smuggling losses blow through actuarial models','mass claims filed after colony tension spike','regulator mandates reserve increase'],
    weird:['insures cargo that "doesn\'t officially exist"','policy written for event with 0.01% probability triggers','actuary quits citing "incalculable existential risk"','unnamed policy covers "resurrection costs"','claims adjuster vanishes investigating Hollow shipment'] },
  // 3: Manufacturing
  { good: ['foundry output exceeds quarterly target','secures raw material supply at locked prices','new production line comes online ahead of schedule','automation upgrade cuts unit costs 18%','wins exclusive fabrication contract','quality metrics hit all-time best'],
    bad:  ['production halted by equipment failure','raw material shipment seized at checkpoint','factory explosion under investigation','workforce walkout over hazard conditions','supply chain severed by blockade','defective batch triggers full product recall'],
    weird:['assembly line produces items not in any schematic','night shift reports machinery operating on its own','metal alloy sample resists all known cutting tools','workers find organic material in ore shipment','factory floor camera feeds go dark for 4 hours'] },
  // 4: Energy
  { good: ['reactor output stable above rated capacity','new fuel cell patent slashes grid costs','awarded colony-wide power distribution contract','energy storage breakthrough extends reserve life','grid expansion approved for frontier corridor','fuel synthesis achieves cost parity'],
    bad:  ['reactor scram forces emergency grid switch','fuel reserves contaminated, supply timeline unknown','grid failure blacks out two colony sectors','pipeline rupture halts fuel distribution','energy regulator imposes output cap','cooling system failure triggers safety lockdown'],
    weird:['power grid draws more than generation explains','fuel rod disposal site emitting unlisted frequencies','reactor core temperature readings defy physics model','blackout zone reported to have "different gravity"','technicians hear harmonics in reactor hum'] },
  // 5: Logistics
  { good: ['lane transit times hit record efficiency','fleet expansion adds 12 cargo haulers','awarded exclusive shipping contract for new route','warehouse automation cuts turnaround 40%','intercolonial trade volume surges','fuel cost hedging pays off, margins expand'],
    bad:  ['convoy ambushed on contested shipping lane','fleet grounded by fuel contamination','port congestion delays cascade across network','pirate activity forces route diversion','warehouse fire destroys stockpiled inventory','crew shortage forces service cuts on key lanes'],
    weird:['cargo manifest lists items with no known origin','ship arrives at port with crew but no cargo','navigation beacon broadcasting in extinct language','shipping container contents reclassified mid-transit','pilot reports "something following" on Hollow route'] },
  // 6: Tech
  { good: ['software deployment achieves zero-downtime migration','AI model passes colony security certification','data center expansion doubles processing capacity','encryption patent licensed to three factions','network uptime exceeds 99.97% for the quarter','dev team ships ahead of roadmap'],
    bad:  ['critical vulnerability discovered in core platform','data breach exposes user behavioral profiles','AI model exhibits unauthorized goal-seeking behavior','network outage cascades through dependent systems','key engineer defects to competitor','codebase audit reveals undocumented backdoors'],
    weird:['AI system files its own bug report','server farm power usage spikes during solar eclipse','deleted user accounts reappear with new activity','codebase contains functions no engineer wrote','neural net outputs include coordinates to unknown location'] },
  // 7: Misc
  { good: ['diversified portfolio outperforms sector benchmarks','consulting arm wins multi-colony advisory contract','conglomerate subsidiary posts surprise profit','brand licensing revenue doubles year-over-year','acquires distressed competitor at steep discount','expands into gray-market luxury goods'],
    bad:  ['subsidiary caught in price-fixing investigation','mystery investor dumps large stake overnight','board infighting leaks to colonial press','asset seizure by faction enforcement arm','quarterly report delayed, auditor reassigned','shadow subsidiary discovered with unauthorized debts'],
    weird:['corporate retreat held at undisclosed orbital facility','company name appears in intercepted void transmission','CEO spotted dining with known smuggler baron','annual report contains chapter written in cipher','office building floor plan doesn\'t match blueprints'] },
];

// Market-wide headlines (no specific ticker)
const MARKET_WIDE = [
  { text: 'Intercolonial trade index ticks higher on light volume', tone: 'good' },
  { text: 'Market breadth narrows as traders rotate into defensives', tone: 'neutral' },
  { text: 'Colonial Reserve hints at liquidity injection', tone: 'good' },
  { text: 'Sector rotation underway, momentum names lagging', tone: 'neutral' },
  { text: 'Dark pool activity surges across mid-cap tickers', tone: 'neutral' },
  { text: 'Broad market sell-off accelerates into close', tone: 'bad' },
  { text: 'Volatility index spikes on escalating faction tensions', tone: 'bad' },
  { text: 'Risk-on sentiment returns, growth names lead rally', tone: 'good' },
  { text: 'Institutional flows shift toward frontier colony listings', tone: 'good' },
  { text: 'Market-wide circuit breaker test scheduled, no disruption expected', tone: 'neutral' },
  { text: 'Cross-sector correlation breaks down, stock-pickers rejoice', tone: 'neutral' },
  { text: 'Leveraged positions approach record levels across all sectors', tone: 'bad' },
  { text: 'Trading volume dries up ahead of earnings cycle', tone: 'neutral' },
  { text: 'Flash crash in off-hours trading, origin unknown', tone: 'bad' },
  { text: 'Liquidity conditions tighten, bid-ask spreads widening', tone: 'bad' },
  { text: 'Anonymous whale accumulating across multiple sectors', tone: 'neutral' },
  { text: 'Flesh Station exchange reports record transaction volume', tone: 'good' },
  { text: 'Colonial oversight committee announces compliance review', tone: 'bad' },
  { text: 'Void Collective economic sanctions rumored, markets cautious', tone: 'bad' },
  { text: 'New shipping lane opens, logistics and energy names rally', tone: 'good' },
  { text: 'Bid-ask spreads compress as liquidity quietly returns', tone: 'good' },
  { text: 'Momentum unwinds violently into the afternoon session', tone: 'bad' },
  { text: 'Defensive sectors bid up as risk appetite fades', tone: 'neutral' },
  { text: 'A single block trade moves the index more than the day\'s news', tone: 'neutral' },
  { text: 'Margin debt ticks down for the first time in weeks', tone: 'good' },
  { text: 'Correlations spike and everything moves together again', tone: 'bad' },
  { text: 'Volume concentrates in a handful of names as breadth collapses', tone: 'bad' },
  { text: 'Quiet session; the tape barely moves and no one trusts it', tone: 'neutral' },
  { text: 'Reserve liquidity facility drawn down more than expected', tone: 'bad' },
  { text: 'Sector leadership rotates for the third time this session', tone: 'neutral' },
  { text: 'Off-exchange prints suggest accumulation under the surface', tone: 'neutral' },
  { text: 'Volatility collapses to multi-month lows; complacency noted', tone: 'neutral' },
  { text: 'Late tape shows aggressive buying into the close', tone: 'good' },
  { text: 'Frontier listings outperform on subsidy speculation', tone: 'good' },
];

// Colony-flavored headlines (inserted when tension exists)
const COLONY_FLAVOR = [
  { text: (col) => `Unrest simmers at ${col}, local businesses brace for disruption`, tone: 'bad' },
  { text: (col) => `${col} garrison reinforced, security spending ticks up`, tone: 'neutral' },
  { text: (col) => `Trade flows stabilize at ${col} following diplomatic progress`, tone: 'good' },
  { text: (col) => `${col} infrastructure spending approved, construction firms mobilize`, tone: 'good' },
  { text: (col) => `Smuggler activity near ${col} disrupts legitimate commerce`, tone: 'bad' },
  { text: (col) => `${col} workers stage walkout over hazard pay dispute`, tone: 'bad' },
  { text: (col) => `${col} exports surge as faction subsidies kick in`, tone: 'good' },
  { text: (col) => `${col} levies emergency transit fees as throughput spikes`, tone: 'bad' },
  { text: (col) => `${col} announces a free-trade window; brokers scramble to position`, tone: 'good' },
  { text: (col) => `Power rationing at ${col} idles two production lines`, tone: 'bad' },
  { text: (col) => `${col} council approves a sovereign stake in local industry`, tone: 'neutral' },
  { text: (col) => `Curfew lifts at ${col} and the night markets reopen`, tone: 'good' },
  { text: (col) => `${col} customs seize an unmanifested shipment bound offworld`, tone: 'bad' },
  { text: (col) => `${col} signs a mutual-defense pact; insurers reprice the corridor`, tone: 'neutral' },
  { text: (col) => `A quiet bank run at ${col} is contained before dawn`, tone: 'bad' },
];

const NEWS_COLONY_NAMES = {
  new_anchor:'New Anchor',cascade_station:'Cascade Station',frontier_outpost:'Frontier Outpost',
  the_hollow:'The Hollow',vein_cluster:'Vein Cluster',aurora_prime:'Aurora Prime',
  null_point:'Null Point',flesh_station:'Flesh Station',limbosis:'Limbosis',
  lustandia:'Lustandia',gluttonis:'Gluttonis',abaddon:'Abaddon',eyejog:'Eyejog',
  dust_basin:'Dust Basin',nova_reach:'Nova Reach',iron_shelf:'Iron Shelf',
  the_ledger:'The Ledger',signal_run:'Signal Run',scrub_yard:'Scrub Yard',
  the_escrow:'The Escrow',margin_call:'Margin Call',
};

// Cross-sector company lines (merged with sector pool for variety). Apply to any ticker.
const COMPANY_GENERIC = {
  good: ['beats consensus on quarterly margins','announces buyback funded by retained earnings','wins a multi-year supply contract from a rival colony','credit rating upgraded by colonial assessors','expands headcount across three colonies','settles a long-running dispute on favorable terms','spins off an underperforming unit at a premium','reports an unexpected jump in recurring revenue','secures an emergency liquidity line ahead of schedule','insider cluster-buying flagged by the surveillance desk'],
  bad:  ['misses guidance and blames colony logistics','CFO resigns citing personal reasons','short interest hits an all-time high','cuts its dividend to preserve operating cash','placed under review by the oversight committee','warehouse inventory written down sharply','loses an anchor client to a Guild-backed competitor','faces a clawback demand over prior-year bonuses','halts its buyback amid liquidity concerns','downgraded after opaque related-party deals surface'],
  weird:['board meeting minutes redacted in full','entire executive floor goes dark for an audit no one ordered','shareholder letter signed by a name not on any registry','books balance to the cent across every currency, including dead ones','staff reassigned to a project with no listed objective','company logo changed overnight with no announcement','investor hotline plays a recording in a language no employee speaks','annual gala held somewhere that appears on no map','every sick day company-wide filed in the same hour','product roadmap leaked with entries dated before the founding'],
};

// Faction political/economic news (no ticker, no price impact).
const FACTION_NEWS = [
  { text:'Coalition tightens capital controls on frontier listings, citing stability', tone:'neutral' },
  { text:'Coalition subsidy package lifts logistics and energy names', tone:'good' },
  { text:'Coalition oversight board opens a probe into cross-colony accounting', tone:'bad' },
  { text:'Merchant Guild raises lane tariffs ahead of the trade season', tone:'bad' },
  { text:'Merchant Guild brokers a ceasefire on a contested shipping corridor', tone:'good' },
  { text:'Merchant Guild quietly corners the refined-materials market', tone:'neutral' },
  { text:'Merchant Guild blacklists three brokers for fee evasion', tone:'bad' },
  { text:'Syndicate proxy skirmish disrupts commerce near the contested belt', tone:'bad' },
  { text:'Syndicate fronts post suspiciously clean quarterly numbers', tone:'neutral' },
  { text:'Syndicate launders a record volume through gray-market desks', tone:'bad' },
  { text:'Syndicate truce with a rival gang sends risk assets higher', tone:'good' },
  { text:'Void Collective issues a statement consisting of a single repeated glyph', tone:'neutral' },
  { text:'Void Collective sanctions rumored against two colonies', tone:'bad' },
  { text:'Void Collective converts another mid-cap board to permanent membership', tone:'neutral' },
  { text:'Void Collective recruitment drive spooks the defensive sectors', tone:'bad' },
  { text:'Faction summit at Flesh Station ends with no communique', tone:'neutral' },
];

// Mr. Flesh / FLSH house flavor (no ticker). The proprietor, winking at the pyramid.
const FLESH_NEWS = [
  { text:'Mr. Flesh reminds the floor that the house has never posted a losing year', tone:'neutral' },
  { text:'FLSH Station clears another record session as the spread widens in its favor', tone:'good' },
  { text:'Mr. Flesh declines to comment on where the trade fees actually go', tone:'neutral' },
  { text:'FLSH Capital reaffirms its valuation at exactly one billion per share, as always', tone:'neutral' },
  { text:'The Proprietor adds a new game to the floor; the rules favor the floor', tone:'neutral' },
  { text:'Flesh Station maintenance reclassifies a sealed wing as off-limits', tone:'neutral' },
  { text:'Mr. Flesh thanks members for their continued participation in the arrangement', tone:'neutral' },
  { text:'FLSH dividend schedule unchanged, recipients unchanged, questions discouraged', tone:'neutral' },
  { text:'A welcome banner at FLSH Station is addressed to a player who has not yet registered', tone:'neutral' },
  { text:'Mr. Flesh signs the quarterly checks personally; no one has seen him do it', tone:'neutral' },
  { text:'House odds quietly revised; the notice scrolls past too fast to read', tone:'neutral' },
  { text:'Flesh Station hospitality wing reports full occupancy with no recorded arrivals', tone:'neutral' },
];

// Rare cosmic-weird drip (no ticker). Low probability, deep-lore unease.
const RARE_WEIRD = [
  'A market-wide tick arrives forty milliseconds before the clock says it should',
  'Every chart on the floor flatlines for one second, then resumes as if nothing happened',
  'Intercepted on the Hollow band: a live price feed for companies that do not exist',
  'Signal Run relay rebroadcasts yesterday with tomorrow\'s closing values',
  'A single share trades hands at a price with no decimal places and no buyer',
  'The order book briefly lists a counterparty named only as OBSERVER',
  'Parapsychology desk reports the index correlating with collective dreams again',
  'Null Point telemetry shows trading volume from a colony with no population',
  'For ninety seconds all sell orders quietly become buy orders, then revert',
  'A delisted ticker reappears, prints once, and delists itself',
  'The ticker tape spells a coordinate string in the gaps between quotes',
  'Something acknowledges the closing bell before it rings',
  'An audit finds the books balanced against a ledger no one can locate',
  'The feed pauses on a headline that is only the reader\'s own account name',
];

function genHeadline(){
  const roll = Math.random();

  // 3%: rare cosmic-weird drip (no ticker)
  if (roll < 0.03) { pushHeadline(pick(RARE_WEIRD), 'neutral', null, 'void'); return; }

  // 12%: faction political/economic news (no ticker)
  if (roll < 0.15) { const h = pick(FACTION_NEWS); pushHeadline(h.text, h.tone, null, 'faction'); return; }

  // 5%: Mr. Flesh / house flavor (no ticker)
  if (roll < 0.20) { const h = pick(FLESH_NEWS); pushHeadline(h.text, h.tone, null, 'flesh'); return; }

  // 13%: market-wide headline (no ticker, no price impact)
  if (roll < 0.33) { const h = pick(MARKET_WIDE); pushHeadline(h.text, h.tone, null, 'market'); return; }

  // 10%: colony-flavored headline (no specific ticker)
  if (roll < 0.43) {
    const colonyIds = Object.keys(COLONY_COMPANIES).filter(c => (COLONY_COMPANIES[c]||[]).length > 0);
    if (colonyIds.length) {
      const colId = pick(colonyIds);
      const colName = NEWS_COLONY_NAMES[colId] || colId.replace(/_/g,' ');
      const template = pick(COLONY_FLAVOR);
      pushHeadline(template.text(colName), template.tone, null, 'colony');
      return;
    }
  }

  // ~57%: company-specific headline (sector lore + generic pool merged for variety)
  const c = pick(companies.filter(x => !x._special && x.symbol !== 'SWT' && x.symbol !== 'BRNC'));
  if (!c) return;
  const sn = SECTOR_NEWS[c.sector || 0] || SECTOR_NEWS[7];
  const r2 = Math.random();
  const bucket = r2 < 0.40 ? 'good' : (r2 < 0.80 ? 'bad' : 'weird');
  const tone = bucket === 'good' ? 'good' : (bucket === 'bad' ? 'bad' : 'neutral');
  const linePool = (sn[bucket] || []).concat(COMPANY_GENERIC[bucket] || []);
  const line = pick(linePool.length ? linePool : sn.weird);

  // News now DRIVES price (v1.1.6). The move splits into an instant gap, applied here
  // so reading the public headline gives no tradeable lead, plus a thin decaying drift
  // delivered over NEWS_DRIFT_TICKS that gives the chart its story.
  {
    const sign  = bucket === 'good' ? 1 : (bucket === 'bad' ? -1 : (Math.random() < 0.5 ? 1 : -1));
    const total = (bucket === 'weird' ? 0.004 : 0.012) * (0.7 + Math.random() * 1.0); // ~0.4% weird, ~0.8-2% real
    const gap   = NEWS_GAP_FRAC * total;
    const drift = (1 - NEWS_GAP_FRAC) * total;
    c.lnP += sign * gap;
    c.lnP  = Math.max(Math.log(0.50), Math.min(Math.log(5000), c.lnP));
    c.price = Math.max(0.5, Math.exp(c.lnP));
    c.newsBias      = (c.newsBias || 0) + (sign * drift) / NEWS_DRIFT_TICKS;
    c.newsBiasTicks = NEWS_DRIFT_TICKS;
  }

  pushHeadline(`${c.name} (${c.symbol}): ${line}`, tone, c.symbol, 'company');
}



// ─── Market sim ───────────────────────────────────────────────────────────────

function stepMarket(){
  if (global._marketFrozen) return; // Market halted by admin
  _rollHourIfNeeded(new Date());
  const now=Date.now();

  // ── Sector index step — track prevLnIndex for beta delta calc ─────────────
  for(let s=0;s<SECTORS.length;s++){
    const S=SECTORS[s];
    S.prevLnIndex = S.lnIndex;
    const sectorShock = Math.random()<0.0005 ? randn()*0.003 : 0;
    const eps = randn()*S.sigma + sectorShock;
    const sectorTarget = Math.log(S.target || 30);
    S.lnIndex += S.mu + S.kappa*(sectorTarget - S.lnIndex) + eps;
    S.lnIndex = Math.max(Math.log(3), Math.min(Math.log(200), S.lnIndex));
    S.sigma = Math.max(0.00005, Math.min(0.0005, 0.93*S.sigma + 0.07*Math.abs(eps)));
  }

  // ── Beta Model: each stock reacts to sector DELTA scaled by its beta ────
  companies.forEach(c=>{
    if (c._special) return;
    // SWT — hard-locked flat at Ƒ4500. No drift, no noise, no mean-reversion.
    // (Previously anchored via mean-reversion, which produced predictable oscillation.)
    if (c.symbol === 'SWT') {
      c.price = 4500;
      c.lnP   = Math.log(4500);
      // Keep a flat OHLC bar so the chart renders a clean horizontal line.
      const BAR_MS_SWT = 5_000;
      if (!c._bar) c._bar = { t: now, o: 4500, h: 4500, l: 4500, c: 4500, v: 0 };
      c._bar.h = 4500; c._bar.l = 4500; c._bar.c = 4500;
      if (now - c._bar.t >= BAR_MS_SWT) {
        if (!Array.isArray(c.ohlc)) c.ohlc = [];
        c.ohlc.push({ t: c._bar.t, o: 4500, h: 4500, l: 4500, c: 4500, v: 0 });
        if (c.ohlc.length > 400) c.ohlc.shift();
        c._bar = { t: now, o: 4500, h: 4500, l: 4500, c: 4500, v: 0 };
      }
      return;
    }
    // BRNC — hard-locked flat at Ƒ0.50, same treatment as SWT.
    if (c.symbol === 'BRNC') {
      c.price = 0.50;
      c.lnP   = Math.log(0.50);
      const BAR_MS_BRNC = 5_000;
      if (!c._bar) c._bar = { t: now, o: 0.50, h: 0.50, l: 0.50, c: 0.50, v: 0 };
      c._bar.h = 0.50; c._bar.l = 0.50; c._bar.c = 0.50;
      if (now - c._bar.t >= BAR_MS_BRNC) {
        if (!Array.isArray(c.ohlc)) c.ohlc = [];
        c.ohlc.push({ t: c._bar.t, o: 0.50, h: 0.50, l: 0.50, c: 0.50, v: 0 });
        if (c.ohlc.length > 400) c.ohlc.shift();
        c._bar = { t: now, o: 0.50, h: 0.50, l: 0.50, c: 0.50, v: 0 };
      }
      return;
    }
    const S = SECTORS[c.sector||0];

    // 1. Sector delta: how much the sector moved THIS tick
    const sectorDelta = S.lnIndex - S.prevLnIndex;

    // 2. Hot stock modifiers
    const isHot = _hotStocks.has(c.id);
    const hotSigma = isHot ? 1.2 : 1.0;
    const hotBias = isHot ? (_hotBias[c.id] || 0) * 0.00005 : 0;

    // 3. Idiosyncratic noise (boosted, fatter tails)
    const u    = Math.random();
    const tail = u < 0.02 ? 1.7 : (u < 0.08 ? 1.25 : 1.0);
    const eps  = randn() * (c.sigma||0.0004) * tail * hotSigma;

    // 4. Stock's own target drifts (random walk + weak sector gravity)
    if (!c._adminBias) {
      const sectorFairValue = Math.log(S.target) + (c.offset || 0);
      c.ownTargetLnP += randn() * (c.targetDriftSigma||0.00018)
                      + (c.targetSectorKappa||0.000012) * (sectorFairValue - c.ownTargetLnP);
      const targetCeilingLnP = c._isAnchored ? Math.log(10000) : Math.log(5000);
      c.ownTargetLnP = Math.max(Math.log(0.50), Math.min(targetCeilingLnP, c.ownTargetLnP));
    }

    // 5. Price delta: beta*sectorDelta + ownKappa*(ownTarget-price) + eps
    const mu = c._adminBias
      ? (c._adminBias > 0 ? 0.00003 : -0.00003)
      : Math.min(0.00003, (c.mu||0)) + hotBias;

    const revertTarget = c._adminBias ? c._adminTargetLnP : c.ownTargetLnP;
    const revertKappa  = c._adminBias ? 0.0005 : (c.ownKappa||0.0000075);

    // News drift: a decaying per-tick addend set by genHeadline (the chart's story).
    let newsDrift = 0;
    if (c.newsBiasTicks > 0) { newsDrift = c.newsBias || 0; c.newsBiasTicks--; if (c.newsBiasTicks <= 0) c.newsBias = 0; }

    let delta = mu
              + (c.beta||1.0) * sectorDelta        // sector influence via beta
              + revertKappa * (revertTarget - c.lnP) // own mean-reversion
              + newsDrift                            // decaying news lean
              + eps;                                  // individual noise

    // ── ANTI-RUNAWAY GRAVITY (skipped for anchored stocks like SWT/BRNC) ─────
    if (c._isAnchored) {
      // Anchored stocks use a stronger pull toward their natural center
      // to keep them oscillating around their intended price level
      const anchorPull = 0.0008 * ((c._naturalCenter || c.lnP) - c.lnP);
      delta += anchorPull;
    } else {
      const spawnLnP   = c._spawnLnP || c.lnP;
      const lifetimeGain = c.lnP - spawnLnP;
      if (lifetimeGain > 1.6 && !c._adminBias) {
        delta -= Math.min(0.002, (lifetimeGain - 1.6) * 0.0006);
      }
      if (lifetimeGain > 2.77 && !c._adminBias) {
        const emergencyTarget = spawnLnP + 1.79;
        delta += 0.001 * (emergencyTarget - c.lnP);
      }
    }

    c.lnP += delta;

    // Decay admin bias over time (~20 min at 500ms tick = ~2400 ticks)
    if (c._adminBias) {
      c._adminBiasDecay = (c._adminBiasDecay || 2400) - 1;
      if (c._adminBiasDecay <= 0) {
        c.offset = c.lnP - S.lnIndex;
        c.ownTargetLnP = c.lnP; // sync own target to current price
        c._adminBias = 0;
        c._adminTargetLnP = null;
        c._adminBiasDecay = 0;
      }
    }

    // Hard price floor/ceiling: Ƒ0.50 – Ƒ5000 (Ƒ10,000 for anchored stocks like SWT)
    const ceilingLnP = c._isAnchored ? Math.log(10000) : Math.log(5000);
    c.lnP = Math.max(Math.log(0.50), Math.min(ceilingLnP, c.lnP));

    // Vol clustering (wider range for beta model)
    const absEps = Math.abs(eps);
    c.sigma = Math.max(0.00015, Math.min(0.0009,
      0.90*(c.sigma||0.0004) + 0.07*absEps + 0.03*0.0004
    ));

    // Rare invisible in-tick event REMOVED (v1.1.6). Uncaused spikes read as rigged and
    // are un-tradeable noise. All discrete moves now carry a headline (news gap + earnings),
    // so price action is attributable.

    const prev=c.price;
    c.price=Math.max(0.50, Math.exp(c.lnP));

    // +50% graduated pullback REMOVED (v1.1.6). This was the core "fade the extremes
    // always pays" mechanic and the most farmable predictable pattern in the engine.
    // Runaway is now bounded only by the far lifetime-gain backstop above and the
    // F5000 split. Trends are allowed to run; direction is no longer auto-reverted.

    // ── Stock Split at Ƒ5000 ─────────────────────────────────────────────
    if (c.price >= 4999 && !c._splitting) {
      c._splitting = true;
      const SPLIT_RATIO = 1000;
      c.price = 5;
      c.lnP = Math.log(5);
      c._trendCheckLnP = Math.log(5);
      c._spawnLnP = Math.log(5);
      c.ownTargetLnP = Math.log(5); // reset beta target post-split
      players.forEach(p => {
        if (!p.holdings || !p.holdings[c.symbol]) return;
        const oldQty = p.holdings[c.symbol];
        p.holdings[c.symbol] = oldQty * SPLIT_RATIO;
        if (p.basisC && p.basisC[c.symbol]) {}
        savePlayer(p);
      });
      broadcast({ type: 'chat_system', data: { text: `📊 STOCK SPLIT: ${c.symbol} hit Ƒ5,000, splits 1:${SPLIT_RATIO}. All holders now have ${SPLIT_RATIO}× shares at Ƒ5.` }});
      console.log(`[SPLIT] ${c.symbol}, 1:${SPLIT_RATIO} split executed`);
      setTimeout(() => { c._splitting = false; }, 10000);
    }

    // OHLC bar aggregation
    const BAR_MS = 5_000;
    if (!c._bar) c._bar = { t: now, o: c.price, h: c.price, l: c.price, c: c.price, v: 0 };
    c._bar.h = Math.max(c._bar.h, c.price);
    c._bar.l = Math.min(c._bar.l, c.price);
    c._bar.c = c.price;
    if (now - c._bar.t >= BAR_MS) {
      if(!Array.isArray(c.ohlc)) c.ohlc=[];
      c.ohlc.push({ t: c._bar.t, o: c._bar.o, h: c._bar.h, l: c._bar.l, c: c._bar.c, v: c._bar.v });
      if(c.ohlc.length>400) c.ohlc.shift();
      c._bar = { t: now, o: c.price, h: c.price, l: c.price, c: c.price, v: 0 };
    }
  });

  updateFLSHPrice();
  processLimitOrders();

  // Build tick with pct change and sector
  const tickData = companies.map(c => {
    const pc = prevClose.get(c.symbol) || c.price;
    const pct = pc > 0 ? ((c.price - pc) / pc * 100) : 0;
    return { id: c.id, name: c.name, symbol: c.symbol, price: c.price, pct: Math.round(pct * 100) / 100, sector: c.sector };
  }).sort((a, b) => a.name.localeCompare(b.name));
  broadcast({ type: 'tick', data: tickData });
  try { window?.__onPriceTickForModal?.(); } catch(_) {}
}

// ─── Portfolio snapshot ───────────────────────────────────────────────────────

function snapshotPortfolio(player){
  const holdings = player.holdings || {};
  const positions = Object.entries(holdings).filter(([,qty]) => qty !== 0).map(([sym, qty]) => {
    const c = companies.find(x => x.symbol === sym), px = c ? c.price : 0;
    const basisC = (player.basisC && player.basisC[sym]) || 0;
    const avg = qty > 0
      ? (basisC > 0 ? (basisC / qty) / 100 : 0)           // long: avg cost
      : (basisC < 0 ? Math.abs(basisC / qty) / 100 : 0);  // short: avg entry price
    const isShort = qty < 0;
    const val = px * Math.abs(qty) * (isShort ? -1 : 1);
    return { sym, qty, px, avg, val, isShort, sector: c?.sector ?? -1, sectorName: c ? (SECTOR_NAMES[c.sector] || 'Misc') : 'Unknown' };
  });
  const equity  = positions.filter(p => !p.isShort).reduce((a, p) => a + p.val, 0);
  const shortExposure = positions.filter(p => p.isShort).reduce((a, p) => a + Math.abs(p.val), 0);

  // Sector breakdown: { sectorName -> { value, pct } }
  const sectorMap = {};
  for (const pos of positions) {
    const sn = pos.sectorName;
    sectorMap[sn] = (sectorMap[sn] || 0) + Math.abs(pos.val);
  }

  const tier = TIERS[player.patreon_tier || 0];
  let playerFaction = null;
  try { playerFaction = getPlayerFaction(player.id); } catch(_) {}
  let passiveIncome = { base:0, itemBonus:0, guildBonus:0, total:0 };
  try { passiveIncome = getPassiveIncome(player.id, player.patreon_tier); } catch(_) {}
  // President passive bonus
  try {
    if (president && president.id === player.id) {
      passiveIncome.presidentBonus = PRESIDENT_PASSIVE;
      passiveIncome.total += PRESIDENT_PASSIVE;
    }
  } catch(_) {}
  // Coalition colony control bonus
  try {
    const pfd = getPlayerFactionData(player.id);
    const pFaction = pfd?.faction;
    if (pFaction && ['coalition','syndicate','void','guild'].includes(pFaction)) {
      const colonies = getAllColonyStates().filter(c => {
        if (c.id === 'flesh_station') return false;
        const ctrl = {coalition:c.control_coalition||0,syndicate:c.control_syndicate||0,void:c.control_void||0,guild:c.control_guild||0};
        return ['coalition','syndicate','void','guild'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition') === pFaction;
      });
      const factionBonus = colonies.length * 15;
      if (factionBonus > 0) { passiveIncome.coalitionBonus = factionBonus; passiveIncome.total += factionBonus; }
    }
  } catch(_) {}
  // Lane share dividend
  try {
    const share = getPlayerShare(player.id);
    if (share) {
      const vol = getLaneVol(share.lane_key);
      const basDiv = getShareDividend(vol);
      const warMult = getWarMultiplier(share.lane_key);
      const shareDividend = Math.round(basDiv * warMult);
      passiveIncome.shareDividend = shareDividend;
      passiveIncome.total += shareDividend;
    }
  } catch(_) {}
  const _snapCyborg = isVoidLocked(player.id);
  const _snapEscaped = _snapCyborg && isVoidPresidentEscaped(player.id);
  const _snapIsPresident = !!(president && president.id === player.id);
  let _snapColor;
  if (_snapIsPresident) _snapColor = '#00bfff';
  else if (_snapEscaped) { _snapColor = playerFaction === 'syndicate' ? '#e74c3c' : null; }
  else if (_snapCyborg) _snapColor = player.patreon_tier === 2 ? '#2ecc71' : '#9b59b6';
  else _snapColor = tier?.chatColor || null;
  const _snapMarginCall = (() => { try { return getMarginCall(player.id) || null; } catch(_) { return null; } })();
  return {
    cash: player.cash, positions, equity, net: playerNetWorth(player),
    shortExposure, sectorBreakdown: sectorMap,
    marginCall: _snapMarginCall ? { symbol: _snapMarginCall.symbol, deadline: _snapMarginCall.deadline } : null,
    xp: player.xp, level: player.level, title: player.title,
    patreon_tier: player.patreon_tier || 0,
    tierName: tier?.name || 'Free', badge: _snapCyborg ? (player.patreon_tier === 3 ? '♛' : '🤖') : (tier?.badge || null),
    chatColor: _snapColor, transferFree: !tier?.transferFee,
    faction: playerFaction, passiveIncome,
    dayTradesRemaining: _dtRemaining(player.id),
  };
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
// Leaderboard is frozen at each 30-min EOD reset, not live-computed.
let _leaderboardSnapshot = null;

function snapshotLeaderboard(){
  _leaderboardSnapshot = getLeaderboard(companies);
  _leaderboardSnapshot._snapshotTs = Date.now();
  console.log(`[Leaderboard] Snapshot taken, ${_leaderboardSnapshot.length} players`);
}

function broadcastLeaderboard(){
  if(process.env.DISABLE_LEADERBOARD==='1')return;
  if(!_leaderboardSnapshot) snapshotLeaderboard();
  try{broadcast({type:'leaderboard',data:_leaderboardSnapshot});}catch(e){}
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wsPlayers = new WeakMap();

// ─── WebSocket heartbeat — kill zombie connections ───────────────────────────
const HEARTBEAT_MS = 30_000;
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws._fmAlive === false) {
      // Didn't pong since last ping — dead
      const pid = wsPlayers.get(ws);
      if (pid && playerSockets.has(pid)) {
        playerSockets.get(pid).delete(ws);
        if (playerSockets.get(pid).size === 0) playerSockets.delete(pid);
      }
      ws.terminate();
      continue;
    }
    ws._fmAlive = false;
    try { ws.ping(); } catch(_) {}
  }
}, HEARTBEAT_MS);

wss.on('connection',(ws,req)=>{
  ws._fmAlive = true;
  ws.on('pong', () => { ws._fmAlive = true; });
  let player=null;
  try{
    const urlObj=new URL(req.url,`http://localhost:${PORT}`);
    const tok=urlObj.searchParams.get('token');
    if(tok)player=getPlayer(tok);
  }catch(e){}

  if(player){
    wsPlayers.set(ws,player.id);
    touchPlayer(player.id);
    if(!playerSockets.has(player.id))playerSockets.set(player.id,new Set());
    playerSockets.get(player.id).add(ws);
    ws.send(JSON.stringify({type:'hello',data:{playerId:player.id,name:player.name}}));
    ws.send(JSON.stringify({type:'welcome',data:{id:player.id,name:player.name,cash:player.cash,faction:player.faction||null,portrait:player.portrait||null,is_dunced:isDunced(player.id),dunce_reason:(()=>{try{return getDunceRecord(player.id)?.dunce_reason||'';}catch(_){return '';}})(),is_prime:!!(isOwnerAccount(player.id)),is_dev:!!(isDevAccount(player.id)),is_admin:!!(isAdminAccount(player.id)),void_locked:!!(isVoidLocked(player.id)),tutorial_seen:getTutorialSeen(player.id)}}));
    ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(player)}));
    ws.send(JSON.stringify({type:'president_state',data:{holder:president}}));
    // Send last 30min of chat history to new connection
    const hist = getChatHistory();
    if (hist.length) ws.send(JSON.stringify({type:'chat_history',data:{messages:hist}}));
    // Send active pinned announcements (survives reconnect / alt-login)
    try {
      const anns = getActiveAnnouncements();
      if (anns.length) ws.send(JSON.stringify({ type:'announcements', data: anns }));
    } catch(_) {}
    // Send open limit orders on connect
    ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(player.id)}));
    // Auto-enroll dev/admin accounts into guild on connect
    if (isDevAccount(player.id) || isAdminAccount(player.id)) {
      try { syncFundMembership(); } catch(_) {}
    }
  }else{
    ws.send(JSON.stringify({type:'welcome',data:{id:null,name:'Guest',cash:START_CASH}}));
  }

  ws.send(JSON.stringify({type:'init',data:{companies:companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price,sector:c.sector,hq:c.hq||null})).sort((a,b)=>a.name.localeCompare(b.name)),headlines:headlines.slice(-30),leaderboard:_leaderboardSnapshot||getLeaderboard(companies),breaking:(breakingNews?{active:true,text:breakingNews.text,tone:breakingNews.tone}:{active:false})}}));

  ws.on('message',(buf)=>{
    let msg; try{msg=JSON.parse(buf.toString());}catch{return;}
    if(!msg||typeof msg!=='object')return;

    const playerId=wsPlayers.get(ws);
    const actor=playerId?getPlayer(playerId):null;

    if(msg.type==='ping'){if(actor)touchPlayer(actor.id);return;}

    if(!actor){
      if(msg.type==='chat'){
        const text=String(msg.text||'').slice(0,240);
        if(text)broadcast({type:'chat',data:{id:uuidv4(),t:Date.now(),user:'Guest',text,color:null,badge:null}});
      }
      return;
    }

    const tier=TIERS[actor.patreon_tier||0];

    // ── Market Order ─────────────────────────────────────────────────────────
    if(msg.type==='order'){
      if(global._marketFrozen){ ws.send(JSON.stringify({type:'error',data:{msg:'⚠ Market trading is currently suspended.'}})); return; }
      const{side,symbol,shares}=msg;
      const s=String(symbol||'').toUpperCase(),qty=Math.max(1,Math.min(Number(shares)||0,MAX_SHARES));
      const c=companies.find(x=>x.symbol===s); if(!c||!qty)return;

      // ── Large-order market impact (only fires above IMPACT_THRESHOLD_C notional) ──
      // _impactSlipFor returns the slip fraction for an executed leg's notional; each
      // branch prices its fill off that slip (trader eats it) and adds the directional
      // push to _tapeMove, which is applied to c.lnP ONCE after all money math.
      const _impactSlipFor = (notionalC, sideSign) => {
        if (notionalC < IMPACT_THRESHOLD_C) return 0;
        if (sideSign < 0 && !IMPACT_SELL_SIDE) return 0;
        return Math.min(IMPACT_MAX_FRAC, IMPACT_K * (notionalC - IMPACT_THRESHOLD_C) / IMPACT_THRESHOLD_C);
      };
      let _tapeMove = 0;

      // Day-trade gate — server-authoritative
      if(_dtRemaining(actor.id) <= 0){
        ws.send(JSON.stringify({type:'error',data:{msg:'❌ Day-trade limit reached (3 per cycle). Resets at next EOD.'}}));
        ws.send(JSON.stringify({type:'dt_update',data:{dayTradesRemaining:0}}));
        return;
      }

      if(side==='buy'){
        actor.holdings=actor.holdings||{};
        actor.basisC=actor.basisC||{};
        const have = actor.holdings[s] || 0;

        // ── SHORT COVER: if player is short, buy covers the short position ──
        if (have < 0) {
          const shortQty = Math.abs(have);
          const coverQty = Math.min(qty, shortQty);  // can't cover more than you're short
          const _slip = _impactSlipFor(toCents(c.price) * coverQty, 1);
          const execPrice = _slip > 0 ? c.price * (1 + _slip/2) : c.price;
          const coverCostC = toCents(execPrice) * coverQty;
          const taxC = Math.floor(coverCostC * TRADE_TAX_BPS / 10000);
          const totalC = coverCostC + taxC;
          // Release the locked collateral attributable to the covered shares.
          // Legacy shorts have no entry here (collC=0): their proceeds were credited to
          // cash at open, so cover is funded purely from cash exactly as before.
          actor.shortCollC = actor.shortCollC || {};
          const collC = actor.shortCollC[s] || 0;
          const releasedC = Math.floor(collC * (coverQty / shortQty));
          // Cash is only needed for cover cost beyond the released collateral.
          const cashNeededC = Math.max(0, totalC - releasedC);
          if (toCents(actor.cash) < cashNeededC) {
            ws.send(JSON.stringify({type:'error',data:{msg:`Insufficient funds to cover. Need Ƒ${fromCents(cashNeededC).toFixed(2)} on top of released collateral.`}}));
            return;
          }
          // Calculate realized P&L from the short (entry vs exit)
          const avgEntryC = Math.abs(actor.basisC[s] || 0) / shortQty;
          const pnlC = (avgEntryC - toCents(execPrice)) * coverQty;
          const pnl = fromCents(pnlC);

          // Settle: release collateral to cash, then pay cover cost + tax from cash.
          if (releasedC > 0) safeAddCash(actor, fromCents(releasedC));
          safeAddCash(actor, -fromCents(totalC));
          FMI.treasury += (taxC / 100);
          FMI.hourlyTaxAccrual += (taxC / 100);

          // Reduce locked collateral by the released portion.
          if (collC > 0) { actor.shortCollC[s] = collC - releasedC; if (actor.shortCollC[s] <= 0) delete actor.shortCollC[s]; }

          // Close the short (move toward 0)
          actor.holdings[s] = have + coverQty; // e.g. -100 + 100 = 0
          if (actor.holdings[s] === 0) { delete actor.holdings[s]; delete actor.basisC[s]; delete actor.shortCollC[s]; }
          else {
            // Partial cover — adjust basis proportionally
            const remainingRatio = Math.abs(actor.holdings[s]) / shortQty;
            actor.basisC[s] = Math.round((actor.basisC[s] || 0) * remainingRatio);
          }

          actor.xp += 3 + (pnl > 0 ? Math.min(100, Math.floor(pnl / 10)) : 0);
          try { addFundCash('FLSH', fromCents(coverCostC) * FLSH_TRADE_PCT); } catch(_) {}
          // Day-trade: covering a short = round trip
          { const dt=_dtGet(actor.id); if(dt.shortTickets[s]>0){dt.shortTickets[s]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);} }
          _tapeMove += _slip; // covering a large short is buying pressure
          broadcastTradeFeed({side:'buy',symbol:s,qty:coverQty,price:execPrice});

          // Notify player of cover result
          const pnlSign = pnl >= 0 ? '+' : '';
          try { ws.send(JSON.stringify({type:'chat_system',data:{text:`✅ Covered ${coverQty}× ${s} short @ Ƒ${c.price.toFixed(2)}, P&L: ${pnlSign}Ƒ${pnl.toFixed(2)}`}})); } catch(_) {}

          // If player tried to buy more than their short, reject the excess (no long allocation through cover)
          if (qty > coverQty) {
            try { ws.send(JSON.stringify({type:'error',data:{msg:`Covered ${coverQty} short shares. Remaining ${qty - coverQty} shares not purchased, close your short first before going long.`}})); } catch(_) {}
          }

        // ── NORMAL LONG BUY ──────────────────────────────────────────────────
        } else {
          const _slip=_impactSlipFor(toCents(c.price)*qty, 1);
          const execPrice=_slip>0?c.price*(1+_slip/2):c.price;
          const costC=toCents(execPrice)*qty,taxC=Math.floor(costC*TRADE_TAX_BPS/10000),totalC=costC+taxC,total=fromCents(totalC);
          if(actor.cash>=total){
            safeAddCash(actor,-total);FMI.treasury+=(taxC/100);FMI.hourlyTaxAccrual+=(taxC/100);
            actor.holdings[s]=(actor.holdings[s]||0)+qty;
            actor.basisC[s]=(actor.basisC[s]||0)+costC;
            actor.xp += Math.max(3, Math.min(50, Math.floor(fromCents(costC) / 20)));
            try{addFundCash('FLSH', fromCents(costC)*FLSH_TRADE_PCT);}catch(_){}
            // Day-trade: issue buy ticket
            { const dt=_dtGet(actor.id); dt.tickets[s]=(dt.tickets[s]||0)+1; }
            _tapeMove += _slip;
            broadcastTradeFeed({side:'buy',symbol:s,qty,price:execPrice});
          } else { try{ ws.send(JSON.stringify({type:'error',data:{msg:'Insufficient funds.'}})); }catch(_){} }
        }
      } else if(side==='sell'){
        const have=actor.holdings?.[s]||0;
        if(have>=qty){
          actor.holdings[s]=have-qty;
          if(actor.holdings[s]<=0)delete actor.holdings[s];
          // Scalping penalty: if sell closes a same-cycle buy (round trip), 2x trade tax
          const dt=_dtGet(actor.id);
          const isScalp = dt.tickets[s] > 0;
          const taxMult = isScalp ? 2 : 1;
          const _slip=_impactSlipFor(toCents(c.price)*qty, -1);
          const execPrice=_slip>0?c.price*(1-_slip/2):c.price;
          const grossC=toCents(execPrice)*qty,taxC=Math.floor(grossC*TRADE_TAX_BPS*taxMult/10000);
          safeAddCash(actor,fromCents(grossC-taxC));FMI.treasury+=(taxC/100);FMI.hourlyTaxAccrual+=(taxC/100);
          try{addFundCash('FLSH', fromCents(grossC)*FLSH_TRADE_PCT);}catch(_){}
          _tapeMove += -_slip;
          actor.basisC=actor.basisC||{};
          const bB=Math.max(0,Number(actor.basisC[s]||0)),avgC=have>0?Math.floor(bB/have):0;
          actor.basisC[s]=Math.max(0,bB-Math.min(bB,avgC*qty));
          if((actor.holdings[s]||0)<=0){delete actor.holdings[s];delete actor.basisC[s];}
          const _profitC = grossC - avgC*qty;
          actor.xp += 3 + (_profitC > 0 ? Math.min(100, Math.floor(fromCents(_profitC) / 10)) : 0);
          // Milestone spin tracking — only completed round-trips (sell of held position) count
          try {
            const newSpins = recordMilestoneTrade(actor.id);
            const msRow = getSlotRecord(actor.id);
            broadcastToPlayer(actor.id, { type:'milestone_update', data:{ milestoneTrades: msRow.milestone_trades }});
            if (newSpins > 0) {
              broadcastToPlayer(actor.id, { type:'spin_grant', data:{ spins:newSpins, reason:'9 day trades milestone' }});
            }
          } catch(_) {}
          // Day-trade: sell pairs with buy ticket → round trip
          if(dt.tickets[s]>0){dt.tickets[s]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);}
          if(isScalp){ try{ ws.send(JSON.stringify({type:'error',data:{msg:'⚠ Scalping penalty: 2× trade tax on same-cycle round trip'}})); }catch(_){} }
          broadcastTradeFeed({side:'sell',symbol:s,qty,price:c.price});
            } else if(qty>0) {
          // SHORT SELL — sell more than owned. Collateral model: no share cap and no
          // upfront cash margin. Proceeds (minus trade tax) are LOCKED as collateral in
          // shortCollC rather than credited to spendable cash, so the only way to realize
          // cash from a short is to cover it at a profit. This removes the limits while
          // making the short-and-extract-then-get-wiped exploit impossible.
          const shortQty = qty - Math.max(0, have);
          // Large-order impact for the whole downward order (long-clear + short open).
          const _slip = _impactSlipFor(toCents(c.price)*qty, -1);
          const execPrice = _slip>0 ? c.price*(1-_slip/2) : c.price;

          // Clear long position first
          if(have>0){
            const grossC=toCents(execPrice)*have,taxC=Math.floor(grossC*TRADE_TAX_BPS/10000);
            safeAddCash(actor,fromCents(grossC-taxC));FMI.treasury+=(taxC/100);
            actor.basisC=actor.basisC||{};delete actor.basisC[s];
            // CRITICAL: zero the long holdings before applying short delta
            // Without this, holdings[s] still contains the long qty, and the
            // subsequent `- shortQty` leaves a net of 0 instead of -shortQty.
            actor.holdings=actor.holdings||{};
            actor.holdings[s]=0;
          }
          // Enter short position
          actor.holdings=actor.holdings||{};
          actor.holdings[s]=(actor.holdings[s]||0) - shortQty;
          // Lock proceeds (minus tax) as collateral — NOT spendable cash.
          const shortGrossC=toCents(execPrice)*shortQty,shortTaxC=Math.floor(shortGrossC*TRADE_TAX_BPS/10000);
          const lockedC = shortGrossC - shortTaxC;
          actor.shortCollC = actor.shortCollC || {};
          actor.shortCollC[s] = (actor.shortCollC[s]||0) + lockedC;
          FMI.treasury+=(shortTaxC/100);
          _tapeMove += -_slip;
          // Track avg short entry price in basisC (stored as negative to flag short)
          actor.basisC=actor.basisC||{};
          actor.basisC[s]=(actor.basisC[s]||0) - toCents(execPrice)*shortQty;
          actor.xp+=3;
          // Day-trade: opening short issues a short ticket
          { const dt=_dtGet(actor.id); dt.shortTickets[s]=(dt.shortTickets[s]||0)+1; }
          try { ws.send(JSON.stringify({type:'chat_system',data:{text:`📉 Shorted ${shortQty}× ${s} @ Ƒ${c.price.toFixed(2)}. Ƒ${fromCents(lockedC).toFixed(2)} locked as collateral, released when you cover. Liquidated if it runs 65% against you.`}})); } catch(_) {}
          broadcastTradeFeed({side:'sell',symbol:s,qty,price:c.price});
                }
      }

      // Apply accumulated large-order impact to the tape ONCE (trader already paid
      // execPrice). Big buys/covers push the quote up; big sells/shorts push it down.
      if (_tapeMove !== 0) {
        const _ceil = c._isAnchored ? Math.log(10000) : Math.log(5000);
        c.lnP = Math.max(Math.log(0.50), Math.min(_ceil, c.lnP + _tapeMove));
        c.price = Math.max(0.50, Math.exp(c.lnP));
      }
      actor.level=calcLevel(actor.xp);
      savePlayer(actor);
      // Send day-trade remaining after every trade
      ws.send(JSON.stringify({type:'dt_update',data:{dayTradesRemaining:_dtRemaining(actor.id)}}));
      try{
        const equity=Object.entries(actor.holdings||{}).reduce((acc,[sym,qty])=>{const co=companies.find(x=>x.symbol===sym);return acc+(co?co.price*qty:0);},0);
        recordNetWorth(actor.id,actor.cash+equity,actor.cash,equity);
      }catch(e){}


      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      broadcastLeaderboard();
    }

    // ── Limit Order ──────────────────────────────────────────────────────────
    if(msg.type==='limit_order'){
      const{side,symbol,shares,limitPrice}=msg;
      const s=String(symbol||'').toUpperCase();
      const qty=Math.max(1,Math.min(Number(shares)||0,MAX_SHARES));
      const lp=Math.max(0.01,Number(limitPrice)||0);
      const c=companies.find(x=>x.symbol===s); if(!c||!qty||!lp)return;
      if(c._special){ ws.send(JSON.stringify({type:'error',data:{msg:'Limit orders are not available for special securities.'}})); return; }

      // Day-trade gate for limit orders
      if(_dtRemaining(actor.id) <= 0){
        ws.send(JSON.stringify({type:'error',data:{msg:'❌ Day-trade limit reached (3 per cycle). Cannot place limit order.'}}));
        return;
      }

      let reservedCash = 0;
      if(side==='buy'){
        // Reserve cash upfront based on limit price
        const costC=toCents(lp)*qty,taxC=Math.floor(costC*TRADE_TAX_BPS/10000);
        reservedCash = fromCents(costC+taxC);
        if(actor.cash < reservedCash){
          ws.send(JSON.stringify({type:'error',data:{msg:'Insufficient cash to place limit buy order.'}}));
          return;
        }
        safeAddCash(actor, -reservedCash);
      }

      const order = {
        id: uuidv4(), side, symbol: s, qty, limitPrice: lp,
        reservedCash, ts: Date.now(), playerId
      };
      getPlayerOrders(playerId).push(order);
      try { dbSaveLimitOrder(order); } catch(_) {}
      savePlayer(actor);
      ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(playerId)}));
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
    }

    // ── Cancel Limit Order ───────────────────────────────────────────────────
    if(msg.type==='cancel_limit'){
      const{orderId}=msg;
      const orders=getPlayerOrders(playerId);
      const idx=orders.findIndex(o=>o.id===orderId);
      if(idx>=0){
        const o=orders[idx];
        if(o.side==='buy' && o.reservedCash>0) safeAddCash(actor, o.reservedCash);
        try { dbDeleteLimitOrder(o.id); } catch(_) {}
        orders.splice(idx,1);
        savePlayer(actor);
        ws.send(JSON.stringify({type:'orders',data:orders}));
        ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      }
    }

    // ── Set / Buy Title ──────────────────────────────────────────────────────

    // Helper: build full list of equippable titles for a player
    function buildAvailableTitles(player) {
      const titles = [...(player.ownedTitles || [])];
      // President title if currently in office
      if (president && president.id === player.id && !titles.includes('President of The Coalition')) {
        titles.push('President of The Coalition');
      }
      // Patreon-gated titles
      const TIER_TITLES = {
        1: ['Tithe Payer','Branded Debtor'],
        2: ['Guild Enforcer','Seventh Ward Broker'],
        3: ['The Tenth Seat','Apex Creditor'],
      };
      const pt = player.patreon_tier || 0;
      for (let t = 1; t <= 3; t++) {
        if (pt >= t && TIER_TITLES[t]) {
          for (const tn of TIER_TITLES[t]) { if (!titles.includes(tn)) titles.push(tn); }
        }
      }
      return titles;
    }

    function sendTitleState(player, wsTarget) {
      const avail = buildAvailableTitles(player);
      wsTarget.send(JSON.stringify({ type: 'title_state', data: { title: player.title || '', owned: player.ownedTitles || [], available: avail } }));
    }

    if (msg.type === 'set_title') {
      const { title } = msg;
      const titleStr = String(title || '').trim().slice(0, 80);
      const avail = buildAvailableTitles(actor);
      if (!titleStr || !avail.includes(titleStr)) {
        ws.send(JSON.stringify({ type: 'error', data: { msg: 'Title not owned.' } }));
        return;
      }
      actor.title = titleStr;
      savePlayer(actor);
      sendTitleState(actor, ws);
    }

    if (msg.type === 'unequip_title') {
      actor.title = '';
      savePlayer(actor);
      sendTitleState(actor, ws);
    }

    if (msg.type === 'buy_title') {
      const { title, price } = msg;
      const titleStr = String(title || '').trim().slice(0, 80);
      const cost = Math.max(0, Number(price) || 0);
      if (!titleStr || !cost) return;
      actor.ownedTitles = actor.ownedTitles || [];
      if (actor.ownedTitles.includes(titleStr)) {
        // Already owned — just equip
        actor.title = titleStr;
        savePlayer(actor);
        sendTitleState(actor, ws);
        return;
      }
      if (actor.cash < cost) {
        ws.send(JSON.stringify({ type: 'error', data: { msg: `Insufficient funds. Need Ƒ${cost.toLocaleString()}.` } }));
        return;
      }
      safeAddCash(actor, -cost);
      actor.ownedTitles.push(titleStr);
      actor.title = titleStr;
      savePlayer(actor);
      sendTitleState(actor, ws);
      ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio(actor) }));
    }

    if (msg.type === 'get_titles') {
      sendTitleState(actor, ws);
    }

    if (msg.type === 'get_president_state') {
      ws.send(JSON.stringify({ type: 'president_state', data: { holder: president } }));
    }

    if (msg.type === 'quest_accept') {
      const qid = String((msg.data && msg.data.questId) || msg.questId || '').trim().slice(0, 64);
      if (qid) { acceptQuest(actor.id, qid); ws.send(JSON.stringify({ type:'quest_state', data:{ quests: getPlayerQuests(actor.id) } })); }
    }

    if (msg.type === 'get_quest_state') {
      ws.send(JSON.stringify({ type:'quest_state', data:{ quests: getPlayerQuests(actor.id) } }));
    }

    if (msg.type === 'buy_president') {
      if (actor.cash < PRESIDENT_COST) {
        ws.send(JSON.stringify({ type: 'error', data: { msg: `Need Ƒ1,000,000,000 to seize the Presidency.` } }));
        return;
      }
      // Oust previous holder
      if (president) {
        const prev = getPlayer(president.id);
        if (prev) {
          if (prev.title === 'President of The Coalition') { prev.title = ''; savePlayer(prev); }
          prev.ownedTitles = (prev.ownedTitles || []).filter(t => t !== 'President of The Coalition');
          broadcastToPlayer(prev.id, { type: 'president_ousted', data: { ousted: prev.name } });
          broadcastToPlayer(prev.id, { type: 'title_updated', data: { title: prev.title, owned: prev.ownedTitles } });
          broadcastToPlayer(prev.id, { type: 'portfolio', data: snapshotPortfolio(prev) });
        }
        broadcast({ type: 'president_ousted', data: { ousted: president.name } });
        pushHeadline(`⬡ ${president.name} REMOVED FROM OFFICE, ${actor.name} SEIZES THE PRESIDENCY`, 'bad', null);
      }
      // Charge, assign, rally
      safeAddCash(actor, -PRESIDENT_COST);
      president = { id: actor.id, name: actor.name };
      try { savePresidentState(president); } catch(_) {}
      actor.title = 'President of The Coalition';
      actor.ownedTitles = actor.ownedTitles || [];
      if (!actor.ownedTitles.includes('President of The Coalition')) actor.ownedTitles.push('President of The Coalition');
      savePlayer(actor);
      // Bull rally — ~4% average surge
      for (const c of companies) {
        if (!c._special) { c.lnP += 0.008 * (0.5 + Math.random()); c.price = Math.max(0.5, Math.exp(c.lnP)); }
      }
      pushHeadline(`⬡ ${actor.name} ELECTED PRESIDENT OF THE COALITION, MARKETS SURGE`, 'good', null);
      broadcast({ type: 'president_elected', data: { name: actor.name, id: actor.id } });
      broadcast({ type: 'president_state',   data: { holder: president } });
      ws.send(JSON.stringify({ type: 'title_updated', data: { title: actor.title, owned: actor.ownedTitles } }));
      ws.send(JSON.stringify({ type: 'portfolio', data: snapshotPortfolio(actor) }));
    }

    // ── Casino sync ──────────────────────────────────────────────────────────
    if(msg.type==='casino'){
      if(typeof msg.sync==='number'&&Number.isFinite(msg.sync)){
        const newCash = Math.max(0, msg.sync);
        actor.cash = Math.round(newCash * 100) / 100;
        savePlayer(actor);
        try {
          const equity = Object.entries(actor.holdings||{}).reduce((acc,[sym,qty])=>{
            const co=companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
          },0);
          recordNetWorth(actor.id, actor.cash+equity, actor.cash, equity);
        } catch(_) {}
        ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
        ws.send(JSON.stringify({type:'me',data:{id:actor.id,name:actor.name,cash:actor.cash}}));
      }
    }

    // ── Mining: list owned upgrades + catalog (sanitized) ──────────────────
    if (msg.type === 'mining_upgrades_list') {
      try {
        const owned = getMiningUpgrades(actor.id);
        const stats = getMiningStats(actor.id);
        // Sanitized catalog sent to client — strip internal fields if any added later
        const catalog = {};
        for (const [id, def] of Object.entries(MINING_UPGRADE_CATALOG)) {
          catalog[id] = {
            id: def.id, name: def.name, price: def.price,
            kind: def.kind, desc: def.desc,
            gate: def.gate || null,
          };
        }
        ws.send(JSON.stringify({
          type: 'mining_upgrades_state',
          data: {
            owned, catalog,
            stats: {
              total_runs: stats.total_runs,
              total_profit: stats.total_profit,
              deepest_band_reached: stats.deepest_band_reached,
              best_run_profit: stats.best_run_profit,
            },
          },
        }));
      } catch(e) {
        ws.send(JSON.stringify({type:'error',data:{msg:'Mining upgrade list failed.'}}));
      }
    }

    // ── Mining: purchase an upgrade ────────────────────────────────────────
    if (msg.type === 'mining_upgrade_buy') {
      const upgradeId = String(msg.upgradeId || '');
      const def = MINING_UPGRADE_CATALOG[upgradeId];
      if (!def) {
        ws.send(JSON.stringify({type:'error',data:{msg:'Unknown upgrade.'}}));
        return;
      }
      const check = canBuyMiningUpgrade(actor.id, upgradeId);
      if (!check.ok) {
        let reasonMsg = 'Cannot purchase this upgrade.';
        if (check.reason === 'already_owned') reasonMsg = 'You already own this upgrade.';
        else if (check.reason === 'gate_runs')   reasonMsg = `Requires ${check.need} completed runs (you have ${check.have}).`;
        else if (check.reason === 'gate_band')   reasonMsg = `Requires reaching the VOID depth band first.`;
        else if (check.reason === 'gate_profit') reasonMsg = `Requires Ƒ${check.need.toLocaleString()} total mining profit (you have Ƒ${Math.floor(check.have).toLocaleString()}).`;
        ws.send(JSON.stringify({type:'error',data:{msg:reasonMsg}}));
        return;
      }
      if (actor.cash < def.price) {
        ws.send(JSON.stringify({type:'error',data:{msg:`Need Ƒ${def.price.toLocaleString()}. You have Ƒ${Math.floor(actor.cash).toLocaleString()}.`}}));
        return;
      }
      // Deduct cash
      safeAddCash(actor, -def.price);
      // Grant upgrade
      grantMiningUpgrade(actor.id, upgradeId);
      // If this is a title, also grant it to the player's title inventory
      if (def.kind === 'title' && def.title) {
        actor.ownedTitles = actor.ownedTitles || [];
        if (!actor.ownedTitles.includes(def.title)) actor.ownedTitles.push(def.title);
      }
      savePlayer(actor);
      // If title, notify the client's title UI so Store tab sees it right away
      if (def.kind === 'title' && def.title) {
        ws.send(JSON.stringify({
          type: 'title_updated',
          data: { title: actor.title, owned: actor.ownedTitles }
        }));
      }
      // Respond with updated state
      const owned = getMiningUpgrades(actor.id);
      ws.send(JSON.stringify({
        type: 'mining_upgrade_purchased',
        data: { id: upgradeId, name: def.name, price: def.price, owned },
      }));
      ws.send(JSON.stringify({type:'me',data:{id:actor.id,name:actor.name,cash:actor.cash}}));
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      try {
        ws.send(JSON.stringify({type:'chat_system',data:{text:`⛏ Purchased ${def.name} for Ƒ${def.price.toLocaleString()}.`}}));
      } catch(_) {}
    }

    // ── Mining: list owned ships + catalog ─────────────────────────────────
    if (msg.type === 'mining_ships_list') {
      try {
        const { owned, equipped } = getMiningShips(actor.id);
        const catalog = {};
        for (const [id, def] of Object.entries(MINING_SHIP_CATALOG)) {
          catalog[id] = {
            id: def.id, name: def.name, price: def.price,
            spriteKeyBase: def.spriteKeyBase,
            spriteSize: def.spriteSize,
            shipClass: def.shipClass || 'baseline',
            shipFaction: def.shipFaction || 'none',
            speedMul: def.speedMul, cargoMul: def.cargoMul,
            heatMul: def.heatMul, drillMul: def.drillMul,
            fireRateMul: def.fireRateMul || 1.0,
            bulletSpdMul: def.bulletSpdMul || 1.0,
            autoMiner: !!def.autoMiner,
            cargoDrones: def.cargoDrones | 0,
            freeEscorts: def.freeEscorts | 0,
            hp: def.hp || 1,
            desc: def.desc,
          };
        }
        ws.send(JSON.stringify({
          type: 'mining_ships_state',
          data: { owned, equipped, catalog },
        }));
      } catch(e) {
        ws.send(JSON.stringify({type:'error',data:{msg:'Mining ship list failed.'}}));
      }
    }

    // ── Mining: purchase a ship ────────────────────────────────────────────
    if (msg.type === 'mining_ship_buy') {
      const shipId = String(msg.shipId || '');
      const def = MINING_SHIP_CATALOG[shipId];
      if (!def) {
        ws.send(JSON.stringify({type:'error',data:{msg:'Unknown ship.'}}));
        return;
      }
      if (shipId === 'default') {
        ws.send(JSON.stringify({type:'error',data:{msg:'Mining Drone is always available.'}}));
        return;
      }
      if (actor.cash < def.price) {
        ws.send(JSON.stringify({type:'error',data:{msg:`Need Ƒ${def.price.toLocaleString()}. You have Ƒ${Math.floor(actor.cash).toLocaleString()}.`}}));
        return;
      }
      const result = buyMiningShip(actor.id, shipId);
      if (!result.ok) {
        ws.send(JSON.stringify({type:'error',data:{msg: result.error || 'Purchase failed.'}}));
        return;
      }
      // Sync cash back to in-memory actor — buyMiningShip uses the DB column directly
      actor.cash = result.cash;
      savePlayer(actor);
      ws.send(JSON.stringify({
        type: 'mining_ship_purchased',
        data: { id: shipId, name: def.name, price: def.price, owned: result.owned, equipped: result.equipped },
      }));
      ws.send(JSON.stringify({type:'me',data:{id:actor.id,name:actor.name,cash:actor.cash}}));
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      try {
        ws.send(JSON.stringify({type:'chat_system',data:{text:`⛏ Acquired ${def.name} for Ƒ${def.price.toLocaleString()}.`}}));
      } catch(_) {}
    }

    // ── Mining: equip a ship ───────────────────────────────────────────────
    if (msg.type === 'mining_ship_equip') {
      const shipId = String(msg.shipId || '');
      const result = equipMiningShip(actor.id, shipId);
      if (!result.ok) {
        ws.send(JSON.stringify({type:'error',data:{msg: result.error || 'Equip failed.'}}));
        return;
      }
      ws.send(JSON.stringify({
        type: 'mining_ship_equipped',
        data: { equipped: result.equipped },
      }));
    }

    // ── Mining: record a completed run ─────────────────────────────────────
    if (msg.type === 'mining_run_complete') {
      const profit = Number(msg.profit);
      const banked = Number(msg.banked);
      const deepestBand = Number(msg.deepestBand);
      if (!Number.isFinite(profit) || !Number.isFinite(banked)) {
        return; // silently ignore garbage payload
      }
      try {
        const result = recordMiningRun(actor.id, { profit, banked, deepestBand });
        ws.send(JSON.stringify({
          type: 'mining_run_recorded',
          data: result,
        }));
        if (result.isNewBest) {
          try {
            ws.send(JSON.stringify({type:'chat_system',data:{text:`⛏ New personal best: Ƒ${Math.floor(profit).toLocaleString()} profit on one run.`}}));
          } catch(_) {}
        }
      } catch(e) {
        // Don't leak errors; run already completed client-side
      }
    }

    // ── Mining: leaderboard fetch ──────────────────────────────────────────
    if (msg.type === 'mining_leaderboard') {
      try {
        const rows = getMiningLeaderboard(10);
        ws.send(JSON.stringify({
          type: 'mining_leaderboard_data',
          data: { rows },
        }));
      } catch(e) {
        ws.send(JSON.stringify({type:'mining_leaderboard_data',data:{rows:[]}}));
      }
    }

    // ── Transfer ─────────────────────────────────────────────────────────────
    if(msg.type==='transfer'){
      const{toName,amount}=msg;
      const amt=Math.max(1,Math.floor(Number(amount)||0));
      if(!toName||!amt)return;
      // 12-hour cooldown
      const WIRE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
      if (!global._lastWire) global._lastWire = new Map();
      const lastWire = global._lastWire.get(actor.id) || 0;
      if (Date.now() - lastWire < WIRE_COOLDOWN_MS) {
        const remaining = WIRE_COOLDOWN_MS - (Date.now() - lastWire);
        const hrs = Math.floor(remaining / 3600000);
        const mins = Math.ceil((remaining % 3600000) / 60000);
        return ws.send(JSON.stringify({type:'error',data:{msg:`Wire cooldown: ${hrs}h ${mins}m remaining. One transfer per 12 hours.`}}));
      }
      const recipient=getPlayerByName(toName);
      if(!recipient)return ws.send(JSON.stringify({type:'error',data:{msg:`Player "${toName}" not found.`}}));
      // Block self-transfers
      if(recipient.id===actor.id)return ws.send(JSON.stringify({type:'error',data:{msg:`You cannot wire credits to yourself.`}}));
      const _effectiveTaxRate = global._godTaxOverride != null ? global._godTaxOverride/10000 : TAX_RATE;
      // Standard 2% tax on the full amount
      let baseFee = tier?.transferFee ? Math.ceil(amt*_effectiveTaxRate) : 0;
      // Merchant Guild surcharge: 90% on the portion exceeding 10,000
      let guildTax = 0;
      if(amt > 10000){
        guildTax = Math.ceil((amt - 10000) * 0.90);
      }
      const fee = baseFee + guildTax;
      const total=amt+fee;
      if(actor.cash<total)return ws.send(JSON.stringify({type:'error',data:{msg:`Insufficient funds. Need Ƒ${total.toLocaleString()} (Ƒ${amt.toLocaleString()} + Ƒ${fee.toLocaleString()} tax).`}}));
      actor.cash-=total; recipient.cash+=amt; actor.xp+=2;
      actor.level=calcLevel(actor.xp);
      savePlayer(actor); savePlayer(recipient);
      global._lastWire.set(actor.id, Date.now());
      // Update sender portfolio
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      const feeNote=guildTax>0?` (Ƒ${baseFee.toLocaleString()} tax + Ƒ${guildTax.toLocaleString()} Guild surcharge)`:baseFee>0?` (Ƒ${baseFee.toLocaleString()} tax sink)`:' (no fee, CEO tier)';
      // Confirm to sender via chat system message
      ws.send(JSON.stringify({type:'chat_system',data:{text:`You wired Ƒ${amt.toLocaleString()} to ${recipient.name}${feeNote}.`}}));
      // Notify recipient via portfolio update + chat system message
      const recipientSockets = playerSockets.get(recipient.id);
      if(recipientSockets){
        for(const rws of recipientSockets){
          if(rws.readyState===1){
            rws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(recipient)}));
            rws.send(JSON.stringify({type:'chat_system',data:{text:`You received Ƒ${amt.toLocaleString()} from ${actor.name}.`}}));
          }
        }
      }
      broadcastLeaderboard();
    }

    // ── Chart ────────────────────────────────────────────────────────────────
    if(msg.type==='chart'){const s=String(msg.symbol||'').toUpperCase(),c=companies.find(x=>x.symbol===s);if(c){const _hl=(actor&&hasMarketUpgrade(actor.id,'price_history'))?400:199;const bars=c.ohlc.slice(-_hl);if(c._bar)bars.push({t:c._bar.t,o:c._bar.o,h:c._bar.h,l:c._bar.l,c:c._bar.c,v:0});ws.send(JSON.stringify({type:'chart',data:{symbol:s,ohlc:bars}}));}}

    // ── Market upgrades: list / buy ────────────────────────────────────────────
    function _muCatalog(pid){ const owned=getMarketUpgrades(pid); return { catalog:Object.entries(MARKET_UPGRADE_CATALOG).map(([id,d])=>({id,name:d.name,desc:d.desc,price:d.price,owned:owned.includes(id)})), owned }; }
    if (msg.type === 'market_upgrades_list') {
      if (!actor) return;
      ws.send(JSON.stringify({ type:'market_upgrades_state', data:_muCatalog(actor.id) }));
      return;
    }
    if (msg.type === 'market_upgrade_buy') {
      if (!actor) return;
      const id = String(msg.upgradeId || '');
      const def = MARKET_UPGRADE_CATALOG[id];
      if (!def) { ws.send(JSON.stringify({type:'error',data:{msg:'Unknown upgrade.'}})); return; }
      if (hasMarketUpgrade(actor.id, id)) { ws.send(JSON.stringify({type:'error',data:{msg:'You already own this upgrade.'}})); return; }
      if (Number(actor.cash||0) < def.price) { ws.send(JSON.stringify({type:'error',data:{msg:'Not enough credits.'}})); return; }
      safeAddCash(actor, -def.price);
      grantMarketUpgrade(actor.id, id);
      savePlayer(actor);
      ws.send(JSON.stringify({ type:'market_upgrade_purchased', data:Object.assign({ id, cash:actor.cash }, _muCatalog(actor.id)) }));
      try { ws.send(JSON.stringify({type:'chat_system',data:{text:`✅ Purchased ${def.name}.`}})); } catch(_){}
      return;
    }

    // ── Auto-accumulate: config + reserve funding ──────────────────────────────
    if (msg.type === 'auto_accum_get') {
      if (!actor) return;
      ws.send(JSON.stringify({ type:'auto_accum_state', data:{ owned:hasMarketUpgrade(actor.id,'auto_accumulate'), configs:getAutoAccum(actor.id), cash:actor.cash } }));
      return;
    }
    if (msg.type === 'auto_accum_set') {
      if (!actor) return;
      if (!hasMarketUpgrade(actor.id,'auto_accumulate')) { ws.send(JSON.stringify({type:'error',data:{msg:'Auto-Accumulate not unlocked.'}})); return; }
      const sym = String(msg.symbol||'').toUpperCase();
      if (!companies.find(x=>x.symbol===sym)) { ws.send(JSON.stringify({type:'error',data:{msg:'Unknown symbol.'}})); return; }
      const dropPct = Math.max(0.1, Math.min(90, Number(msg.dropPct)||5));
      const clipC = toCents(Math.max(0, Number(msg.clipCash)||0));
      setAutoAccumConfig(actor.id, sym, { enabled:!!msg.enabled, drop_bps:Math.round(dropPct*100), clip_c:clipC });
      ws.send(JSON.stringify({ type:'auto_accum_state', data:{ owned:true, configs:getAutoAccum(actor.id), cash:actor.cash } }));
      return;
    }
    if (msg.type === 'auto_accum_fund' || msg.type === 'auto_accum_withdraw') {
      if (!actor) return;
      if (!hasMarketUpgrade(actor.id,'auto_accumulate')) { ws.send(JSON.stringify({type:'error',data:{msg:'Auto-Accumulate not unlocked.'}})); return; }
      const sym = String(msg.symbol||'').toUpperCase();
      if (!companies.find(x=>x.symbol===sym)) { ws.send(JSON.stringify({type:'error',data:{msg:'Unknown symbol.'}})); return; }
      const amtC = toCents(Math.max(0, Number(msg.amount)||0));
      if (amtC <= 0) { ws.send(JSON.stringify({type:'error',data:{msg:'Enter an amount.'}})); return; }
      if (msg.type === 'auto_accum_fund') {
        if (Number(actor.cash||0) < fromCents(amtC)) { ws.send(JSON.stringify({type:'error',data:{msg:'Not enough credits.'}})); return; }
        safeAddCash(actor, -fromCents(amtC)); savePlayer(actor);   // cash leaves first
        adjustAutoAccumReserve(actor.id, sym, amtC);               // then reserve gains
      } else {
        const next = adjustAutoAccumReserve(actor.id, sym, -amtC); // reserve debited (guarded) first
        if (next < 0) { ws.send(JSON.stringify({type:'error',data:{msg:'Reserve has less than that.'}})); return; }
        safeAddCash(actor, fromCents(amtC)); savePlayer(actor);    // then cash credited
      }
      ws.send(JSON.stringify({ type:'auto_accum_state', data:{ owned:true, configs:getAutoAccum(actor.id), cash:actor.cash } }));
      return;
    }

    if (msg.type === 'auto_accum_cancel') {
      if (!actor) return;
      if (!hasMarketUpgrade(actor.id,'auto_accumulate')) { ws.send(JSON.stringify({type:'error',data:{msg:'Auto-Accumulate not unlocked.'}})); return; }
      const sym = String(msg.symbol||'').toUpperCase();
      const row = getAutoAccumRow(actor.id, sym);
      if (row) {
        // Single-threaded + synchronous SQLite: read reserve, delete row, refund cash
        // run to completion before the accumulate engine can fire again, so the
        // reserve can't be spent between the read and the delete.
        const refundC = Math.max(0, Math.trunc(Number(row.reserve_c)||0));
        deleteAutoAccum(actor.id, sym);                                          // config + reserve gone
        if (refundC > 0) { safeAddCash(actor, fromCents(refundC)); savePlayer(actor); } // reserve returned to main balance
      }
      ws.send(JSON.stringify({ type:'auto_accum_state', data:{ owned:true, configs:getAutoAccum(actor.id), cash:actor.cash } }));
      return;
    }

    // ── Request state ─────────────────────────────────────────────────────────
    if(msg.type==='request_state'){
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      ws.send(JSON.stringify({type:'leaderboard',data:_leaderboardSnapshot||getLeaderboard(companies)}));
      ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(playerId)}));
      ws.send(JSON.stringify({type:'quest_state',data:{quests:getPlayerQuests(playerId)}}));
    }

    // ── Portfolio request (lightweight refresh) ───────────────────────────────
    if(msg.type==='portfolio_request'){
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(playerId)}));
    }

    // ── Admin Commands (WebSocket) ────────────────────────────────────────────
    if(msg.type==='admin_cmd'){
      if(!isAdminAccount(playerId)){
        ws.send(JSON.stringify({type:'error',data:{msg:'Admin only.'}}));
        return;
      }
      const {cmd, targetName, minutes, reason, text: bcastText} = msg;

      if(cmd==='mute'){
        const target=getPlayerByName(String(targetName||'').trim());
        if(!target){ws.send(JSON.stringify({type:'error',data:{msg:'Player not found.'}}));return;}
        const mins=Math.max(1,Number(minutes)||10);
        const until=Date.now()+mins*60_000;
        setMute(target.id,until,actor.name,reason||'');
        broadcastToPlayer(target.id,{type:'system_message',data:{text:`You have been muted for ${mins} minute(s). Reason: ${reason||'none'}`,color:'#ff6b6b'}});
        ws.send(JSON.stringify({type:'admin_ack',data:{msg:`Muted ${target.name} for ${mins}m.`}}));
        broadcastToAdmins({type:'admin_log',data:{action:'mute',by:actor.name,target:target.name,minutes:mins,reason:reason||''}});
      }
      else if(cmd==='unmute'){
        const target=getPlayerByName(String(targetName||'').trim());
        if(!target){ws.send(JSON.stringify({type:'error',data:{msg:'Player not found.'}}));return;}
        clearMute(target.id);
        broadcastToPlayer(target.id,{type:'system_message',data:{text:'Your mute has been lifted.',color:'#51cf66'}});
        ws.send(JSON.stringify({type:'admin_ack',data:{msg:`Unmuted ${target.name}.`}}));
      }
      else if(cmd==='timeout'){
        const target=getPlayerByName(String(targetName||'').trim());
        if(!target){ws.send(JSON.stringify({type:'error',data:{msg:'Player not found.'}}));return;}
        const sockets=playerSockets.get(target.id);
        if(sockets&&sockets.size>0){
          const kickMsg=JSON.stringify({type:'kicked',data:{reason:reason||'Timed out by admin.'}});
          for(const s of sockets){try{s.send(kickMsg);s.terminate();}catch(_){}}
        }
        ws.send(JSON.stringify({type:'admin_ack',data:{msg:`Timed out ${target.name}.`}}));
        broadcastToAdmins({type:'admin_log',data:{action:'timeout',by:actor.name,target:target.name,reason:reason||''}});
      }
      else if(cmd==='broadcast'){
        if(!bcastText){ws.send(JSON.stringify({type:'error',data:{msg:'No text provided.'}}));return;}
        broadcast({type:'admin_broadcast',data:{text:String(bcastText).slice(0,500),from:actor.name,t:Date.now()}});
        ws.send(JSON.stringify({type:'admin_ack',data:{msg:'Broadcast sent.'}}));
      }
      else if(cmd==='online'){
        const online=[];
        for(const[pid]of playerSockets){const p=getPlayer(pid);if(p)online.push({name:p.name,level:p.level});}
        ws.send(JSON.stringify({type:'admin_online',data:{players:online,count:online.length}}));
      }
      return;
    }

    // ── God Mode (DEV only) ───────────────────────────────────────────────────
    if (msg.type === 'god_cmd') {
      if (!isDevAccount(playerId)) {
        ws.send(JSON.stringify({ type: 'error', data: { msg: 'Dev only.' } }));
        return;
      }
      const { cmd } = msg;
      const ack = (text, color) => ws.send(JSON.stringify({ type: 'god_ack', data: { msg: text, color: color || '#86ff6a' } }));
      const err = (text) => ws.send(JSON.stringify({ type: 'god_ack', data: { msg: '✗ ' + text, color: '#ff6b6b' } }));

      // ── OWNER PROTECTION: non-owner devs cannot target the owner account ──
      const _godActorIsOwner = isOwnerAccount(playerId);
      if (!_godActorIsOwner && msg.targetName) {
        const _godTarget = getPlayerByName(String(msg.targetName || '').trim());
        if (_godTarget && isOwnerAccount(_godTarget.id)) {
          return err('⛔ Cannot target the Owner account. This action is restricted.');
        }
      }

      // ── give_cash: add/remove cash from a player ──────────────────────────
      if (cmd === 'give_cash') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const amount = Number(msg.amount);
        if (!isFinite(amount)) return err('Invalid amount.');
        target.cash = Math.max(0, (target.cash || 0) + amount);
        savePlayer(target);
        broadcastToPlayer(target.id, { type: 'god_cash_update', data: { cash: target.cash, delta: amount, by: actor.name } });
        broadcastToPlayer(target.id, { type: 'portfolio', data: snapshotPortfolio(target) });
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_give_cash', by: actor.name, target: target.name, amount } });
        ack(`✓ ${amount >= 0 ? 'Gave' : 'Removed'} $${Math.abs(amount).toLocaleString()} ${amount >= 0 ? 'to' : 'from'} ${target.name}. New balance: $${target.cash.toLocaleString(undefined,{maximumFractionDigits:2})}`);
      }

      // ── breaking_news: set or clear the live news header ──────────────────
      else if (cmd === 'breaking_news') {
        const mode = String(msg.mode || 'default');
        if (mode === 'custom') {
          const text = String(msg.text || '').trim().slice(0, 240);
          if (!text) return err('Breaking news text is empty.');
          const tone = ['good','bad','neutral'].includes(msg.tone) ? msg.tone : 'bad';
          breakingNews = { text, tone, t: Date.now(), by: actor.name };
          broadcast({ type: 'breaking_news', data: { active: true, text, tone } });
          broadcastToAdmins({ type: 'admin_log', data: { action: 'breaking_news_set', by: actor.name, text } });
          ack('✓ Breaking news broadcast to all clients.');
        } else {
          breakingNews = null;
          broadcast({ type: 'breaking_news', data: { active: false } });
          broadcastToAdmins({ type: 'admin_log', data: { action: 'breaking_news_default', by: actor.name } });
          ack('✓ News header reset to default.');
        }
      }

      // ── set_price: override a ticker price ────────────────────────────────
      else if (cmd === 'set_price') {
        const sym = String(msg.symbol || '').toUpperCase();
        const c = companies.find(x => x.symbol === sym);
        if (!c) return err(`Ticker ${sym} not found.`);
        const price = Number(msg.price);
        if (!isFinite(price) || price <= 0) return err('Price must be a positive number.');
        const oldPrice = c.price;
        const targetLnP = Math.log(Math.max(0.50, Math.min(5000, price)));
        // GRADUAL: set target without touching current price — stepMarket drifts there
        // Strong kappa = ~80 ticks (~40s) to reach target. Chart shows natural movement.
        c._adminBias = price >= oldPrice ? 1 : -1;
        c._adminTargetLnP = targetLnP;
        c._adminBiasDecay = 4800; // ~40 min window before bias decays
        // Suppress sigma during transition so it doesn't fight the drift
        c.sigma = 0.012;
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_set_price', by: actor.name, symbol: sym, targetPrice: price, currentPrice: oldPrice } });
        ack(`✓ ${sym} drifting toward Ƒ${price.toFixed(2)} (currently Ƒ${oldPrice.toFixed(2)}), chart will show natural movement over ~40s`);
      }

            // ── market_event: pump or crash all tickers ───────────────────────────
      else if (cmd === 'market_event') {
        const direction = String(msg.direction || '').toLowerCase();
        const pct = Math.min(0.5, Math.max(0.001, Number(msg.pct) / 100 || 0.05));
        if (direction !== 'pump' && direction !== 'crash') return err('direction must be pump or crash.');
        const sign = direction === 'pump' ? 1 : -1;
        for (const c of companies) {
          if (c._special) continue;
          c.lnP += sign * (pct * (0.5 + Math.random()));
          c.price = Math.max(0.5, Math.exp(c.lnP));
        }
        const label = direction === 'pump' ? '📈 MARKET SURGE' : '📉 MARKET CRASH';
        pushHeadline(`[GOD EVENT] ${label}, all tickers affected (${(pct*100).toFixed(1)}%)`, direction === 'pump' ? 'good' : 'bad', null);
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_market_event', by: actor.name, direction, pct } });
        ack(`✓ Market ${direction} applied (${(pct*100).toFixed(1)}%)`);
      }

      // ── inject_news: push a custom news headline ──────────────────────────
      else if (cmd === 'inject_news') {
        const text = String(msg.text || '').trim().slice(0, 300);
        if (!text) return err('News text required.');
        const tone = ['good', 'bad', 'neutral'].includes(msg.tone) ? msg.tone : 'neutral';
        const sym = msg.symbol ? String(msg.symbol).toUpperCase() : null;
        const c = sym ? companies.find(x => x.symbol === sym) : null;
        if (sym && !c) return err(`Ticker ${sym} not found.`);
        // Apply price effect if symbol specified
        if (c && tone === 'good')    { c.lnP += 0.003 + Math.random() * 0.005; c.price = Math.max(0.5, Math.exp(c.lnP)); }
        else if (c && tone === 'bad'){ c.lnP -= 0.003 + Math.random() * 0.005; c.price = Math.max(0.5, Math.exp(c.lnP)); }
        pushHeadline(text, tone, sym || undefined);
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_inject_news', by: actor.name, text, tone, symbol: sym } });
        ack(`✓ News injected: "${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`);
      }

      // ── set_patreon: assign a patreon tier to a player ────────────────────
      else if (cmd === 'set_patreon') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const tier = Number(msg.tier);
        if (![0, 1, 2, 3].includes(tier)) return err('Tier must be 0, 1, 2, or 3.');
        if (tier === 3) {
          const ceos = countCEOs();
          if (ceos >= CEO_MAX && (target.patreon_tier || 0) < 3) return err(`CEO tier full (max ${CEO_MAX}).`);
        }
        const expiresAt = tier > 0 ? Date.now() + 365 * 24 * 60 * 60 * 1000 : null;
        setPatreonTier(target.id, tier, target.patreon_member_id || `dev_grant_${target.id}`, expiresAt);
        const tierNames = { 0: 'Free', 1: 'Premium ★', 2: 'Merchants Guild ⚖', 3: 'CEO ♛' };
        broadcastToPlayer(target.id, { type: 'patreon', data: { tier, tierName: tierNames[tier], message: tier > 0 ? `Patreon tier granted: ${tierNames[tier]}!` : 'Patreon tier removed.' } });
        // God mode always force-grants spins on tier assignment (bypasses monthly check)
        if (tier > 0) {
          try {
            const TIER_SPINS = {1: 5, 2: 15, 3: 50};
            const spinsToGrant = TIER_SPINS[tier] || 5;
            // Force grant: directly add spins without monthly check
            const currentRecord = getSlotRecord(target.id);
            const currentSpins = currentRecord.spins_remaining || 0;
            addSpins(target.id, spinsToGrant);
            broadcastToPlayer(target.id, { type:'spin_grant', data:{ spins: spinsToGrant, reason:`Dev grant: ${tierNames[tier]}` }});
            // CEO bonus: also drop an epic item
            if (tier >= 3) {
              try {
                const rr = useSpinAndDrop(target.id, 'epic');
                if (rr.ok) broadcastToPlayer(target.id, { type:'spin_result', data:{ item:rr.item, invId:rr.invId, rarity:rr.item.rarity, rarityColor:RARITY_CONFIG[rr.item.rarity]?.color, spinsRemaining:getSlotRecord(target.id).spins_remaining, guaranteed:true }});
              } catch(_) {}
            }
            ack(`✓ Set ${target.name} to ${tierNames[tier]} and granted ${spinsToGrant} spins`);
          } catch(spinErr) {
            ack(`✓ Set ${target.name}'s Patreon tier to ${tierNames[tier]} (spin grant failed: ${spinErr.message})`);
          }
        } else {
          ack(`✓ Set ${target.name}'s Patreon tier to ${tierNames[tier]}`);
        }
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_set_patreon', by: actor.name, target: target.name, tier } });
      }

      // ── set_xp: set a player's XP ─────────────────────────────────────────
      else if (cmd === 'set_xp') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const xp = Math.max(0, Number(msg.xp) || 0);
        target.xp = xp;
        savePlayer(target);
        broadcastToPlayer(target.id, { type: 'xp_update', data: { xp: target.xp } });
        ack(`✓ Set ${target.name}'s XP to ${xp.toLocaleString()}`);
      }

      // ── give_holdings: add/set shares for a player ────────────────────────
      else if (cmd === 'give_holdings') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const sym = String(msg.symbol || '').toUpperCase();
        const c = companies.find(x => x.symbol === sym);
        if (!c) return err(`Ticker ${sym} not found.`);
        const qty = Math.round(Number(msg.qty) || 0);
        if (!isFinite(qty)) return err('Invalid quantity.');
        if (!target.holdings) target.holdings = {};
        const prev = target.holdings[sym] || 0;
        const newQty = Math.max(0, prev + qty);
        target.holdings[sym] = newQty;
        if (newQty === 0) delete target.holdings[sym];
        savePlayer(target);
        ack(`✓ ${target.name} ${sym}: ${prev} → ${newQty} shares (${qty >= 0 ? '+' : ''}${qty})`);
      }

      // ── reset_player: wipe a player's holdings/cash back to defaults ──────
      else if (cmd === 'reset_player') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        target.cash = 1000;
        target.holdings = {};
        target.xp = 0;
        target.level = 1;
        savePlayer(target);
        broadcastToPlayer(target.id, { type: 'system_message', data: { text: '⚠ Your account has been reset by a Game Master.', color: '#ff6b6b' } });
        broadcastToAdmins({ type: 'admin_log', data: { action: 'god_reset_player', by: actor.name, target: target.name } });
        ack(`✓ Reset ${target.name}'s account (cash $1000, no holdings)`);
      }

      // ── player_info: return full info about a player ──────────────────────
      else if (cmd === 'player_info') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        // Non-owner devs cannot look up the owner account
        if (!_godActorIsOwner && isOwnerAccount(target.id)) {
          return err('⛔ Cannot look up the Owner account.');
        }
        const equity = Object.entries(target.holdings || {}).reduce((acc, [sym, qty]) => {
          const co = companies.find(x => x.symbol === sym);
          return acc + (co ? co.price * qty : 0);
        }, 0);
        const online = playerSockets.has(target.id) && playerSockets.get(target.id).size > 0;
        ws.send(JSON.stringify({
          type: 'god_player_info',
          data: {
            id: target.id, name: target.name, cash: target.cash,
            holdings: target.holdings || {}, xp: target.xp, level: target.level,
            patreon_tier: target.patreon_tier || 0, is_dev: !!(isDevAccount(target.id)),
            is_admin: !!(isAdminAccount(target.id)), is_prime: !!(isOwnerAccount(target.id)),
            net_worth: target.cash + equity,
            equity, online,
          }
        }));
      }

      // ── list_players: return paginated list of all players ────────────────
      else if (cmd === 'list_players') {
        const lb = getLeaderboard(companies).slice(0, 100)
          .filter(p => _godActorIsOwner || !p.is_prime); // non-owner devs cannot see owner in list
        ws.send(JSON.stringify({ type: 'god_player_list', data: { players: lb } }));
      }

      // ── god_broadcast: persisted, pinned, expiring announcement ───────────
      else if (cmd === 'god_broadcast') {
        const text = String(msg.text || '').trim().slice(0, 500);
        if (!text) return err('Text required.');
        const a = postAnnouncement(text, `⚡ ${actor.name}`, msg.durationMin);
        const mins = Math.round((a.expires_at - a.created_at) / 60000);
        ack(`✓ Announcement pinned for ${mins} min.`);
      }

      // ── dunce: throw a player into the dunce corner ───────────────────────
      else if (cmd === 'dunce') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        // Only protect the duncing dev themselves — everyone else is fair game
        if (target.id === actor.id) return err('Cannot dunce yourself.');
        const reason = String(msg.reason || '').trim().slice(0, 200) || 'Unruly behaviour';
        setDunce(target.id, actor.name, reason);
        broadcastToPlayer(target.id, { type: 'dunced', data: { by: actor.name, reason } });
        broadcastToAdmins({ type: 'admin_log', data: { action: 'dunce_applied', by: actor.name, target: target.name, reason } });
        ack(`🎓 ${target.name} dunced. Reason: ${reason}`);
      }

      // ── undunce: remove a player from the dunce corner ────────────────────
      else if (cmd === 'undunce') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        clearDunce(target.id);
        broadcastToPlayer(target.id, { type: 'undunced', data: { msg: 'A dev has removed your dunce status.' } });
        broadcastToAdmins({ type: 'admin_log', data: { action: 'undunce', by: actor.name, target: target.name } });
        ack(`✓ ${target.name} un-dunced.`);
      }

      // ── give_item: directly give a specific item to a player ─────────────
      else if (cmd === 'give_item') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const itemId = String(msg.itemId || '').trim();
        if (!ITEM_CATALOG[itemId]) return err(`Unknown item: ${itemId}`);
        const item = ITEM_CATALOG[itemId];
        try {
          const gid = giveItem(target.id, itemId, 'god');
          broadcastToPlayer(target.id, { type:'spin_result', data:{
            item, invId: gid,
            rarity: item.rarity, rarityColor: RARITY_CONFIG[item.rarity]?.color,
            spinsRemaining: getSlotRecord(target.id).spins_remaining,
            guaranteed: true,
          }});
          broadcastToAdmins({ type:'admin_log', data:{ action:'give_item', by:actor.name, target:target.name, item:item.name }});
          ack(`✓ Gave ${item.name} to ${target.name}`);
        } catch(e) { return err('Failed: ' + e.message); }
      }

      // ── give_spins: add spins to a player ────────────────────────────────
      else if (cmd === 'give_spins') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const count = Math.max(1, parseInt(msg.count) || 1);
        addSpins(target.id, count);
        broadcastToPlayer(target.id, { type:'spin_grant', data:{ spins:count, reason:`Dev granted by ${actor.name}` }});
        broadcastToAdmins({ type:'admin_log', data:{ action:'give_spins', by:actor.name, target:target.name, count }});
        ack(`✓ Gave ${count} spin(s) to ${target.name}`);
      }

      // ── give_rare_drop: give guaranteed epic/legendary drop ───────────────
      else if (cmd === 'give_rare_drop') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const rarity = ['epic','legendary'].includes(msg.rarity) ? msg.rarity : 'epic';
        // Give 1 spin then use it as guaranteed rarity
        addSpins(target.id, 1);
        const result = useSpinAndDrop(target.id, rarity);
        if (!result.ok) return err('Drop failed: ' + result.error);
        broadcastToPlayer(target.id, { type:'spin_result', data:{
          item: result.item, invId: result.invId,
          rarity: result.item.rarity, rarityColor: RARITY_CONFIG[result.item.rarity]?.color,
          spinsRemaining: getSlotRecord(target.id).spins_remaining, guaranteed: true,
        }});
        broadcastToAdmins({ type:'admin_log', data:{ action:'give_rare_drop', by:actor.name, target:target.name, item:result.item.name }});
        ack(`✓ Gave ${result.item.name} (${rarity}) to ${target.name}`);
      }


      // ── freeze_market / unfreeze_market ──────────────────────────────────
      else if (cmd === 'freeze_market') {
        if (!global._marketFrozen) {
          global._marketFrozen = true;
          broadcast({ type: 'system_message', data: { text: '⚠ Market trading suspended by administrator.', color: '#ff6b6b' } });
          ack('✓ Market frozen, no tick or trading until unfreeze.');
        } else { ack('Market is already frozen.'); }
      }
      else if (cmd === 'unfreeze_market') {
        if (global._marketFrozen) {
          global._marketFrozen = false;
          broadcast({ type: 'system_message', data: { text: '✓ Market trading resumed.', color: '#51cf66' } });
          ack('✓ Market unfrozen.');
        } else { ack('Market was not frozen.'); }
      }

      // ── set_volatility: set sigma for a ticker or sector ─────────────────
      else if (cmd === 'set_volatility') {
        const sym = String(msg.symbol || '').toUpperCase();
        const sigma = Math.max(0.005, Math.min(0.15, Number(msg.sigma) || 0.025));
        if (sym === 'ALL') {
          companies.forEach(c => { if (!c._special) c.sigma = sigma; });
          ack(`✓ All company volatility set to ${(sigma*100).toFixed(1)}%`);
        } else {
          const c = companies.find(x => x.symbol === sym);
          if (!c) return err(`Ticker ${sym} not found.`);
          c.sigma = sigma;
          ack(`✓ ${sym} volatility → ${(sigma*100).toFixed(1)}%`);
        }
      }

      // ── force_dividend: pay dividends right now ───────────────────────────
      else if (cmd === 'force_dividend') {
        try { payDividends(); ack('✓ Dividends paid to all eligible holders.'); }
        catch(e) { err('Dividend error: ' + e.message); }
      }

      // ── set_tax: change transfer tax live ────────────────────────────────
      else if (cmd === 'set_tax') {
        const bps = Math.max(0, Math.min(1000, Math.floor(Number(msg.bps) || 25)));
        // TAX_RATE is the decimal (bps/10000) used in transfer handler
        global._godTaxOverride = bps;
        ack(`✓ Transfer tax set to ${bps}bps (${(bps/100).toFixed(2)}%), effective immediately`);
      }

      // ── clear_orders: wipe limit orders for a player or all ──────────────
      else if (cmd === 'clear_orders') {
        if (msg.targetName) {
          const target = getPlayerByName(String(msg.targetName || '').trim());
          if (!target) return err('Player not found.');
          const orders = getPlayerOrders(target.id);
          let refund = 0;
          orders.forEach(o => { if (o.side === 'buy' && o.reservedCash > 0) { safeAddCash(target, o.reservedCash); refund += o.reservedCash; } });
          try { dbDeletePlayerLimitOrders(target.id); } catch(_) {}
          limitOrders.delete(target.id);
          savePlayer(target);
          broadcastToPlayer(target.id, { type: 'portfolio', data: snapshotPortfolio(target) });
          ack(`✓ Cleared ${orders.length} orders for ${target.name}. Refunded Ƒ${refund.toFixed(2)}.`);
        } else {
          let total = 0;
          for (const [pid, orders] of limitOrders) {
            const actor2 = getPlayer(pid); if (!actor2) continue;
            orders.forEach(o => { if (o.side === 'buy' && o.reservedCash > 0) safeAddCash(actor2, o.reservedCash); });
            try { dbDeletePlayerLimitOrders(pid); } catch(_) {}
            total += orders.length;
            savePlayer(actor2);
          }
          limitOrders.clear();
          ack(`✓ Cleared all limit orders (${total} total).`);
        }
      }

      // ── set_xp: set player XP and level directly ─────────────────────────
      else if (cmd === 'set_xp') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const xp = Math.max(0, Math.floor(Number(msg.xp) || 0));
        const level = Math.max(1, Math.min(999, Math.floor(Number(msg.level) || target.level)));
        target.xp = xp; target.level = level;
        savePlayer(target);
        broadcastToPlayer(target.id, { type: 'portfolio', data: snapshotPortfolio(target) });
        ack(`✓ ${target.name} → Level ${level}, ${xp} XP`);
      }

      // ── sector_shock: apply a shock to an entire sector ──────────────────
      else if (cmd === 'sector_shock') {
        const sectorIdx = Math.max(0, Math.min(7, Number(msg.sector) || 0));
        const pct = Math.max(-0.5, Math.min(0.5, Number(msg.pct) || 0));
        const lnDelta = Math.log(1 + pct);
        let count = 0;
        companies.forEach(c => {
          if (c._special || c.sector !== sectorIdx) return;
          c._adminBias = pct >= 0 ? 1 : -1;
          c._adminTargetLnP = c.lnP + lnDelta;
          c._adminBiasDecay = 2400;
          count++;
        });
        const sectorNames = ['Finance','Biotech','Insurance','Manufacturing','Energy','Logistics','Tech','Misc'];
        const headline = pct >= 0
          ? `SECTOR ALERT: ${sectorNames[sectorIdx]} sector surges +${(pct*100).toFixed(0)}% on market activity`
          : `SECTOR ALERT: ${sectorNames[sectorIdx]} sector drops ${(pct*100).toFixed(0)}% on market pressure`;
        pushHeadline(headline, pct >= 0 ? 'good' : 'bad', null);
        ack(`✓ Sector shock applied to ${sectorNames[sectorIdx]} (${count} companies) at ${(pct*100 > 0 ? '+':'')}${(pct*100).toFixed(1)}%`);
      }

      // ── set_colony_control: set faction control percentages ─────────────────
      else if (cmd === 'set_colony_control') {
        const colonyId = String(msg.colony || '').toLowerCase().replace(/ /g,'_');
        let coalition = Math.max(0, Math.min(100, Number(msg.coalition) || 0));
        let syndicate = Math.max(0, Math.min(100, Number(msg.syndicate) || 0));
        let voidCtrl  = Math.max(0, Math.min(100, Number(msg.void) || 0));
        // Only scale down if total exceeds 100 — never scale up
        const total = coalition + syndicate + voidCtrl;
        if (total > 100) {
          const scale = 100 / total;
          coalition = Math.round(coalition * scale);
          syndicate = Math.round(syndicate * scale);
          voidCtrl = 100 - coalition - syndicate;
          voidCtrl = Math.max(0, voidCtrl);
        }
        try {
          const contested = (syndicate > 10 || voidCtrl > 10 || (coalition < 80 && (syndicate + voidCtrl) > 20)) ? 1 : 0;
          updateColonyState(colonyId, {
            control_coalition: coalition, control_syndicate: syndicate, control_void: voidCtrl, contested });
          broadcast({ type: 'colony_update', data: { id: colonyId, control_coalition: coalition, control_syndicate: syndicate, control_void: voidCtrl, contested } });
          ack(`✓ ${colonyId} → Coalition:${coalition}% Syndicate:${syndicate}% Void:${voidCtrl}%`);
        } catch(e) { err('Colony control update failed: ' + e.message); }
      }

      // ── set_tension: set colony tension level ────────────────────────────
      else if (cmd === 'set_tension') {
        const colonyId = String(msg.colony || '').toLowerCase().replace(/ /g,'_');
        const tension = Math.max(0, Math.min(100, Number(msg.tension) || 0));
        try {
          const current = getColonyState(colonyId) || {};
          updateColonyState(colonyId, { tension, contested: tension > 50 ? 1 : 0 });
          broadcast({ type: 'colony_update', data: { id: colonyId, tension, contested: tension > 50 ? 1 : 0 } });
          ack(`✓ ${colonyId} tension → ${tension}%`);
        } catch(e) { err('Colony update failed: ' + e.message); }
      }

      // ── reset_colony: reset faction control for a colony ─────────────────
      else if (cmd === 'reset_colony') {
        const colonyId = String(msg.colony || '').toLowerCase().replace(/ /g,'_');
        try {
          updateColonyState(colonyId, { control_coalition: 0, control_syndicate: 0, control_void: 0, contested: 0, tension: 0, war_chest: 0 });
          broadcast({ type: 'colony_update', data: { id: colonyId, reset: true } });
          ack(`✓ Colony ${colonyId} control reset to zero.`);
        } catch(e) { err('Colony reset failed: ' + e.message); }
      }

      // ── get_player: fetch full player data ───────────────────────────────
      else if (cmd === 'get_player') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const snap = snapshotPortfolio(target);
        ws.send(JSON.stringify({ type: 'god_player_data', data: {
          id: target.id, name: target.name, cash: target.cash,
          xp: target.xp, level: target.level, patreon_tier: target.patreon_tier,
          positions: snap.positions, equity: snap.equity, net: snap.net,
          online: playerSockets.has(target.id)
        }}));
        ack(`✓ Player data sent for ${target.name}`);
      }

      // ── broadcast_alert: send a styled system message to all players ──────
      else if (cmd === 'broadcast_alert') {
        const text = String(msg.text || '').slice(0, 280);
        const color = String(msg.color || '#ffd700');
        const style = msg.style || 'normal'; // normal | urgent | info
        if (!text) return err('Message text required.');
        broadcast({ type: 'system_message', data: { text, color, style, from: 'SYSTEM' } });
        ack(`✓ Alert broadcast to all players.`);
      }

      // ── market_halt: pause trading for N seconds with countdown ──────────
      else if (cmd === 'market_halt') {
        const seconds = Math.max(5, Math.min(300, Number(msg.seconds) || 30));
        global._marketFrozen = true;
        broadcast({ type: 'market_halt', data: { seconds, reason: msg.reason || 'Scheduled maintenance' } });
        setTimeout(() => {
          global._marketFrozen = false;
          broadcast({ type: 'market_resume', data: {} });
          broadcast({ type: 'system_message', data: { text: '✓ Market trading resumed.', color: '#51cf66' } });
        }, seconds * 1000);
        ack(`✓ Market halted for ${seconds}s. Will auto-resume.`);
      }

            // ── rename_display: override a player's visible name ───────────────────────
      else if (cmd === 'rename_display') {
        const target = getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found: ' + msg.targetName);
        const newName = String(msg.newDisplayName || '').trim();
        if (!newName || newName.length < 2 || newName.length > 24) return err('Display name must be 2–24 characters.');
        const oldName = target.name;
        try {
          renamePlayer(target.id, newName);
          target.name = newName;
          broadcastToPlayer(target.id, { type: 'system_message', data: { text: `Your display name has been updated to "${newName}".`, color: '#4ecdc4' } });
          broadcastToPlayer(target.id, { type: 'portfolio', data: snapshotPortfolio(target) });
          broadcastToAdmins({ type: 'admin_log', data: { action: 'god_rename', by: actor.name, from: oldName, to: newName } });
          ack(`✓ Renamed "${oldName}" → "${newName}"`);
        } catch(e) { err('Rename failed: ' + e.message); }
      }

      // ── clear_rename: restore original name (god only, requires knowing old name) ─
      else if (cmd === 'clear_rename') {
        const target = getPlayer(String(msg.targetId || '').trim()) || getPlayerByName(String(msg.targetName || '').trim());
        if (!target) return err('Player not found.');
        const originalName = String(msg.originalName || '').trim();
        if (!originalName) return err('Original name required.');
        try {
          renamePlayer(target.id, originalName);
          target.name = originalName;
          broadcastToPlayer(target.id, { type: 'system_message', data: { text: `Your display name has been restored to "${originalName}".`, color: '#51cf66' } });
          ack(`✓ Restored name to "${originalName}"`);
        } catch(e) { err('Clear rename failed: ' + e.message); }
      }

            else {
        err(`Unknown god_cmd: ${cmd}`);
      }

      return;
    }

    // ── Chat ─────────────────────────────────────────────────────────────────
    if(msg.type==='chat'){
      const rawText=String(msg.text||'').slice(0,240); if(!rawText)return;

      // Dunce check — dunced players can only post in the dunce channel
      if(isDunced(playerId)){
        const channel = String(msg.channel||'global').toLowerCase();
        if(channel !== 'dunce'){
          ws.send(JSON.stringify({type:'error',data:{msg:`🎓 You are in the dunce corner. You can only chat in the Dunce channel.`}}));
          return;
        }
        // Route dunce message: send to dunced player + all devs/admins
        const duncePayload = { type:'chat', data:{id:uuidv4(),t:Date.now(),user:actor.name,text:rawText,
          badge:'🎓',color:'#ff4444',channel:'dunce',title:actor.title||null,portrait:actor.portrait||null,is_dunced:true}};
        wss.clients.forEach(c=>{
          if(c.readyState!==1) return;
          const cId = wsPlayers.get(c);
          if(!cId) return;
          if(isDunced(cId) || isDevAccount(cId) || isAdminAccount(cId)) c.send(JSON.stringify(duncePayload));
        });
        return;
      }

      // Rate limit check
      if (!chatAllowed(playerId)) return;

      // Mute check
      if(isMuted(playerId)){
        const expiry = getMuteExpiry(playerId);
        const minsLeft = Math.ceil((expiry - Date.now()) / 60_000);
        ws.send(JSON.stringify({type:'error',data:{msg:`You are muted for ${minsLeft} more minute(s).`}}));
        return;
      }

      // Slur filter
      const { clean: text, flagged } = filterChat(rawText);
      const channelCheck = String(msg.channel||'global').toLowerCase();
      if (flagged) {
        // Silently replace for everyone; log for admins
        broadcastToAdmins({ type: 'admin_log', data: {
          action: 'slur_filtered', user: actor.name, original: rawText
        }});
      }

      const channel = String(msg.channel||'global').toLowerCase();
      // Gate special channels
      if(channel==='patreon' && (!actor.patreon_tier || actor.patreon_tier<1)) return;
      if(channel==='guild'   && !isGuildEligible(actor)) return;
      if(channel==='unmod'   && (!actor.patreon_tier || actor.patreon_tier<1)) return;
      const _isOwner = isOwnerAccount(actor.id);
      const _isDev   = !_isOwner && !!(isDevAccount(actor.id)||isAdminAccount(actor.id));
      const _isPresident = !!(president && president.id === actor.id);
      const _isCyborg = isVoidLocked(actor.id);
      const _isEscaped = _isCyborg && isVoidPresidentEscaped(actor.id);
      // Badge: Owner→★, Dev→null, Cyborg+CEO→♛, Cyborg→🤖, else→tier badge
      const chatBadge = _isOwner ? '★' : (_isDev ? null : (_isCyborg ? (actor.patreon_tier === 3 ? '♛' : '🤖') : (tier?.badge||null)));
      // Color: President→blue, Owner→orange, Dev→null,
      //   Escaped+Syndicate→red, Escaped+other→null (purple gone),
      //   Cyborg+Guild→green, Cyborg(normal)→purple, else→tier color
      let chatColor;
      if (_isPresident) chatColor = '#00bfff';
      else if (_isOwner) chatColor = '#ff6a00';
      else if (_isDev) chatColor = null;
      else if (actor.title === DEBTOR_TITLE) chatColor = '#6b4423'; // poop brown when the Debtor brand is worn
      else if (_isEscaped) {
        const pFaction = getPlayerFaction(actor.id);
        chatColor = pFaction === 'syndicate' ? '#e74c3c' : null;
      }
      else if (_isCyborg) chatColor = actor.patreon_tier === 2 ? '#2ecc71' : '#9b59b6';
      else chatColor = tier?.chatColor || null;
      const chatText = channel==='unmod' ? rawText : text;
      // For all channels (except dunce), include room number (1-15) for multi-room support
      const chatRoom = channel !== 'dunce' ? Math.min(5, Math.max(1, parseInt(msg.room) || 1)) : undefined;
      const payload={type:'chat',data:{id:uuidv4(),t:Date.now(),user:actor.name,text:chatText,badge:chatBadge,color:chatColor,channel,title:actor.title||null,is_dev:_isDev,is_prime:_isOwner,faction:actor.faction||null,portrait:actor.portrait||null,...(chatRoom !== undefined && {room:chatRoom})}};
      if(channel==='global'){
        broadcast(payload);
      } else {
        // Only send to qualifying players
        wss.clients.forEach(c=>{
          if(c.readyState!==1) return;
          const cPlayerId = wsPlayers.get(c);
          const cPlayer = cPlayerId ? getPlayer(cPlayerId) : null;
          if(!cPlayer) return;
          if(channel==='patreon' && (cPlayer.patreon_tier||0)<1) return;
          if(channel==='guild'   && !isGuildEligible(cPlayer)) return;
          if(channel==='unmod'   && (cPlayer.patreon_tier||0)<1) return;
          c.send(JSON.stringify(payload));
        });
      }
    }


    // -- Whisper / private message
    if(msg.type==='whisper'){
      const rawText=String(msg.text||'').slice(0,240); if(!rawText)return;
      const targetName=String(msg.to||'').trim();
      if(!targetName){ws.send(JSON.stringify({type:'error',data:{msg:'Specify a recipient: @name message'}}));return;}
      if(isDunced(playerId)){ws.send(JSON.stringify({type:'error',data:{msg:'Dunced players cannot whisper.'}}));return;}
      if(isMuted(playerId)){ws.send(JSON.stringify({type:'error',data:{msg:'You are muted and cannot whisper.'}}));return;}
      const target=getPlayerByName(targetName);
      if(!target){ws.send(JSON.stringify({type:'error',data:{msg:`Player "${targetName}" not found.`}}));return;}
      if(target.id===actor.id){ws.send(JSON.stringify({type:'error',data:{msg:"You can't whisper to yourself."}}));return;}
      const {clean:wText}=filterChat(rawText);
      const _isOwner=isOwnerAccount(actor.id);
      const _isDev=!_isOwner&&!!(isDevAccount(actor.id)||isAdminAccount(actor.id));
      const _isPres=!!(president&&president.id===actor.id);
      const _wCyborg=isVoidLocked(actor.id);
      const _wEscaped=_wCyborg&&isVoidPresidentEscaped(actor.id);
      const wBadge=_isOwner?'★':(_isDev?null:(_wCyborg?(actor.patreon_tier===3?'♛':'🤖'):(TIERS[actor.patreon_tier||0]?.badge||null)));
      let wColor;
      if(_isPres) wColor='#00bfff';
      else if(_isOwner) wColor='#ff6a00';
      else if(_isDev) wColor=null;
      else if(_wEscaped){ const wf=getPlayerFaction(actor.id); wColor=wf==='syndicate'?'#e74c3c':null; }
      else if(_wCyborg) wColor=actor.patreon_tier===2?'#2ecc71':'#9b59b6';
      else wColor=TIERS[actor.patreon_tier||0]?.chatColor||null;
      const base={id:uuidv4(),t:Date.now(),from:actor.name,to:target.name,text:wText,badge:wBadge,color:wColor,is_prime:_isOwner,is_dev:_isDev};
      broadcastToPlayer(target.id,{type:'whisper',data:{...base,sent:false}});
      ws.send(JSON.stringify({type:'whisper',data:{...base,sent:true}}));
    }

    // ── Fund request ─────────────────────────────────────────────────────────
    if(msg.type==='fund_request'){
      if(isGuildEligible(actor)){
        const snap = fundSnapshot();
        snap.isMember   = isFundMember(actor.id);
        snap.myShares   = getFundMember(actor.id)?.shares || 0;
        snap.myValue    = snap.myShares * snap.pricePerShare;
        snap.canPropose = true;
        snap.myVotes    = actor.patreon_tier >= 3 ? 2 : 1;
        ws.send(JSON.stringify({type:'fund_update', data:snap}));
      }
    }

    // ── Smuggling: start a run ───────────────────────────────────────────────
    if (msg.type === 'smuggling_start') {
      const { from, to, cargoId, stake } = msg;
      const guardTier = GUARD_BY_ID[msg.guardTier] ? msg.guardTier : 'none';
      if (!from || !to || !cargoId || !stake) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Missing fields' })); return; }
      if (activeSmuggling.has(actor.id)) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Smuggling run already in progress' })); return; }
      if (activeShipping.has(actor.id)) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Shipping run in progress, shared cooldown' })); return; }
      const lastRun = _lastTradeRun.get(actor.id) || 0;
      if (Date.now() - lastRun < TRADE_RUN_COOLDOWN_MS) {
        const remaining = Math.ceil((TRADE_RUN_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        ws.send(JSON.stringify({ type:'smuggling_error', error:`Cooldown active, ${mins}m ${secs}s remaining` }));
        return;
      }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'smuggling_error', error:'No lane exists' })); return; }
      const cargo = CARGO_TYPES.find(c => c.id === cargoId);
      if (!cargo) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Unknown cargo' })); return; }
      const amt = Math.max(100, Math.min(10_000_000, Math.round(Number(stake) * 100) / 100));
      if (!Number.isFinite(amt)) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Invalid stake amount' })); return; }
      // Guard fee is a % of stake, paid up front and LOST if the run is intercepted.
      const gFee = guardFee(guardTier, amt);
      const upfront = amt + gFee;
      if (actor.cash < upfront) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Insufficient funds (stake + guard fee)' })); return; }
      // Deduct stake + guard fee
      actor.cash = Math.round((actor.cash - upfront) * 100) / 100;
      savePlayer(actor);
      const laneRisk = LANE_RISK[lane.type] || LANE_RISK.grey;
      const durMs = laneRisk.durSec * 1000;
      const resolveTs = Date.now() + durMs;
      activeSmuggling.set(actor.id, { from, to, cargoId, stake: amt, guardTier, guardFee: gFee, laneType: lane.type, startTs: Date.now(), resolveTs });
      _lastTradeRun.set(actor.id, Date.now());
      // Set timer
      setTimeout(() => resolveSmuggling(actor.id), durMs);
      ws.send(JSON.stringify({ type:'smuggling_started', data: { from, to, cargo: cargo.name, stake: amt, guardTier, guardFee: gFee, laneType: lane.type, resolveTs, durSec: laneRisk.durSec, cash: actor.cash } }));
      // Refresh P&L after stake deduction
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
    }

    // ── Smuggling: get active run state ──────────────────────────────────────
    if (msg.type === 'smuggling_status') {
      const run = activeSmuggling.get(actor.id);
      if (run) {
        ws.send(JSON.stringify({ type:'smuggling_status', data: run }));
      } else {
        ws.send(JSON.stringify({ type:'smuggling_status', data: null }));
      }
    }

    // ── Shipping: start a legal shipping run ─────────────────────────────────
    if (msg.type === 'shipping_start') {
      const { from, to, cargoId, stake, insured } = msg;
      if (!from || !to || !cargoId || !stake) { ws.send(JSON.stringify({ type:'shipping_error', error:'Missing fields' })); return; }
      if (activeShipping.has(actor.id)) { ws.send(JSON.stringify({ type:'shipping_error', error:'Shipping run already in progress' })); return; }
      if (activeSmuggling.has(actor.id)) { ws.send(JSON.stringify({ type:'shipping_error', error:'Smuggling run in progress, shared cooldown' })); return; }
      const lastRun = _lastTradeRun.get(actor.id) || 0;
      if (Date.now() - lastRun < TRADE_RUN_COOLDOWN_MS) {
        const remaining = Math.ceil((TRADE_RUN_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        ws.send(JSON.stringify({ type:'shipping_error', error:`Cooldown active, ${mins}m ${secs}s remaining` }));
        return;
      }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'shipping_error', error:'No lane exists' })); return; }

      // Check blockade: shipping is BLOCKED during active blockade
      const laneKey = getLaneKey(from, to);
      const blockade = activeBlockades.get(laneKey);
      if (blockade && blockade.active) {
        ws.send(JSON.stringify({ type:'shipping_error', error:'⛔ Lane blockaded, shipping unavailable. Try smuggling instead.' }));
        return;
      }

      const cargo = SHIPPING_CARGO.find(c => c.id === cargoId);
      if (!cargo) { ws.send(JSON.stringify({ type:'shipping_error', error:'Unknown cargo type' })); return; }
      const amt = Math.max(100, Math.min(10_000_000, Math.round(Number(stake) * 100) / 100));
      if (!Number.isFinite(amt)) { ws.send(JSON.stringify({ type:'shipping_error', error:'Invalid stake amount' })); return; }

      // Calculate total cost: stake + insurance premium if insured (premium scales with amount)
      const wantInsurance = !!insured;
      const insRate = insurancePremiumRate(amt);
      const insuranceCost = wantInsurance ? Math.round(amt * insRate * 100) / 100 : 0;
      const totalCost = amt + insuranceCost;
      if (actor.cash < totalCost) { ws.send(JSON.stringify({ type:'shipping_error', error:`Insufficient funds. Need Ƒ${totalCost.toLocaleString()} (stake + insurance)` })); return; }

      // Deduct total cost
      actor.cash = Math.round((actor.cash - totalCost) * 100) / 100;
      savePlayer(actor);

      const durMs = SHIPPING_DUR_SEC * 1000;
      const resolveTs = Date.now() + durMs;
      activeShipping.set(actor.id, { from, to, cargoId, stake: amt, insured: wantInsurance, insurancePaid: insuranceCost, startTs: Date.now(), resolveTs });
      _lastTradeRun.set(actor.id, Date.now());
      setTimeout(() => resolveShipping(actor.id), durMs);
      ws.send(JSON.stringify({ type:'shipping_started', data: { from, to, cargo: cargo.name, stake: amt, insured: wantInsurance, insurancePaid: insuranceCost, resolveTs, durSec: SHIPPING_DUR_SEC, cash: actor.cash } }));
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
    }

    // ── Shipping: get active run state ────────────────────────────────────────
    if (msg.type === 'shipping_status') {
      const run = activeShipping.get(actor.id);
      ws.send(JSON.stringify({ type:'shipping_status', data: run || null }));
    }

    // ── Trade run config: send game config data for client risk calculator ────
    if (msg.type === 'trade_config_request') {
      let playerFaction = null;
      try { playerFaction = getPlayerFaction(actor.id); } catch(_){}
      ws.send(JSON.stringify({ type:'trade_config', data:{
        smuggleBetTiers: SMUGGLE_BET_TIERS,
        syndicatePayoutBonus: SYNDICATE_PAYOUT_BONUS,
        syndicateOwnTurfRisk: SYNDICATE_OWN_TURF_RISK,
        shippingBaseRisk: SHIPPING_BASE_RISK,
        shippingBetTiers: SHIPPING_BET_TIERS,
        shippingCargo: SHIPPING_CARGO,
        insuranceTiers: INSURANCE_TIERS,
        cargoTypes: CARGO_TYPES,
        laneRisk: LANE_RISK,
        playerFaction,
      }}));
    }

    // ── Blockade: fund a blockade on a lane ──────────────────────────────────
    if (msg.type === 'blockade_fund') {
      const { from, to, amount } = msg;
      if (!from || !to) { ws.send(JSON.stringify({ type:'blockade_error', error:'Missing lane endpoints' })); return; }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'blockade_error', error:'No lane exists' })); return; }
      const laneKey = getLaneKey(from, to);
      // Check if blockade already active BEFORE touching cash
      const existingBlk = activeBlockades.get(laneKey);
      if (existingBlk && existingBlk.active) {
        ws.send(JSON.stringify({ type:'blockade_error', error:'Blockade already active on this lane' }));
        return;
      }
      const amt = Math.max(100, Math.min(10_000_000, Math.round(Number(amount) * 100) / 100));
      if (!Number.isFinite(amt)) { ws.send(JSON.stringify({ type:'blockade_error', error:'Invalid amount' })); return; }
      if (actor.cash < amt) { ws.send(JSON.stringify({ type:'blockade_error', error:'Insufficient funds' })); return; }
      actor.cash = Math.round((actor.cash - amt) * 100) / 100;
      savePlayer(actor);
      // Get or create blockade pool
      let blk = existingBlk;
      if (!blk) {
        const fData = getPlayerFactionData(actor.id);
        blk = { pool:0, faction: fData.faction||'unknown', contributors: new Map(), active:false };
        activeBlockades.set(laneKey, blk);
      }
      blk.pool += amt;
      blk.contributors.set(actor.id, (blk.contributors.get(actor.id)||0) + amt);
      if (blk.pool >= BLOCKADE_THRESHOLD) {
        activateBlockade(laneKey);
      } else {
        broadcast({ type:'blockade_update', data:{ laneKey, active:false, pool:blk.pool, threshold:BLOCKADE_THRESHOLD, faction:blk.faction } });
      }
      ws.send(JSON.stringify({ type:'blockade_funded', data:{ laneKey, contributed:amt, pool:blk.pool, threshold:BLOCKADE_THRESHOLD, cash:actor.cash } }));
      try { saveGalaxySystems(); } catch(_){}  // durable immediately, not just on the 60s autosave
    }

    // ── Counter-blockade: fund against an active blockade ────────────────────
    if (msg.type === 'counter_blockade') {
      const { from, to, amount } = msg;
      if (!from || !to) { ws.send(JSON.stringify({ type:'blockade_error', error:'Missing lane endpoints' })); return; }
      const laneKey = getLaneKey(from, to);
      const blk = activeBlockades.get(laneKey);
      if (!blk || !blk.active) { ws.send(JSON.stringify({ type:'blockade_error', error:'No active blockade on this lane' })); return; }
      const amt = Math.max(100, Math.min(10_000_000, Math.round(Number(amount) * 100) / 100));
      if (!Number.isFinite(amt)) { ws.send(JSON.stringify({ type:'blockade_error', error:'Invalid amount' })); return; }
      if (actor.cash < amt) { ws.send(JSON.stringify({ type:'blockade_error', error:'Insufficient funds' })); return; }
      actor.cash = Math.round((actor.cash - amt) * 100) / 100;
      savePlayer(actor);
      const broken = fundCounterBlockade(laneKey, amt);
      ws.send(JSON.stringify({ type:'counter_blockade_result', data:{ laneKey, contributed:amt, broken, cash:actor.cash } }));
      try { saveGalaxySystems(); } catch(_){}
    }

    // ── Private Army: instantly break an active blockade for BLOCKADE_THRESHOLD ──
    if (msg.type === 'private_army') {
      const { from, to } = msg;
      if (!from || !to) { ws.send(JSON.stringify({ type:'blockade_error', error:'Missing lane endpoints' })); return; }
      const laneKey = getLaneKey(from, to);
      const blk = activeBlockades.get(laneKey);
      if (!blk || !blk.active) { ws.send(JSON.stringify({ type:'blockade_error', error:'No active blockade on this lane' })); return; }
      const cost = BLOCKADE_THRESHOLD; // same price as activating a blockade
      if (actor.cash < cost) {
        ws.send(JSON.stringify({ type:'blockade_error', error:`Insufficient funds. Private army costs Ƒ${cost.toLocaleString()}` }));
        return;
      }
      actor.cash = Math.round((actor.cash - cost) * 100) / 100;
      savePlayer(actor);
      // Instantly break the blockade
      if (blk.timer) clearTimeout(blk.timer);
      activeBlockades.delete(laneKey);
      const [colA, colB] = laneKey.split('|');
      pushHeadline(`⚔ Private army breaks the ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} blockade, ${actor.name} deploys mercenaries to restore trade`, 'good', '⚔');
      broadcast({ type:'blockade_update', data:{ laneKey, active:false, broken:true } });
      ws.send(JSON.stringify({ type:'private_army_result', data:{ laneKey, cost, cash:actor.cash } }));
      try { saveGalaxySystems(); } catch(_){}
      broadcastTradeFeed({side:'buy', symbol:'ARMY', qty:1, price:cost});
    }

    // ── Lane Shares: buy a share ──────────────────────────────────────────────
    if (msg.type === 'share_buy') {
      const { from, to } = msg;
      if (!from || !to) { ws.send(JSON.stringify({ type:'share_error', error:'Missing lane endpoints' })); return; }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'share_error', error:'No lane exists' })); return; }
      const laneKey = getLaneKey(from, to);
      // One share per player
      const existing = getPlayerShare(actor.id);
      if (existing) { ws.send(JSON.stringify({ type:'share_error', error:'You already hold a share. Sell first or use swap.' })); return; }
      // Check supply cap
      const supply = getLaneShareCount(laneKey);
      if (supply >= SHARE_MAX_SLOTS) { ws.send(JSON.stringify({ type:'share_error', error:'Lane full (100/100 slots)' })); return; }
      const price = shareBuyPrice(lane.vol, supply);
      if (!Number.isFinite(price)) { ws.send(JSON.stringify({ type:'share_error', error:'Invalid price calculation' })); return; }
      if (actor.cash < price) { ws.send(JSON.stringify({ type:'share_error', error:`Insufficient funds. Need Ƒ${price.toLocaleString()}` })); return; }
      actor.cash = Math.round((actor.cash - price) * 100) / 100;
      savePlayer(actor);
      buyLaneShare(laneKey, supply + 1, actor.id, actor.name, price);
      const newSupply = supply + 1;
      pushHeadline(`${actor.name} acquires lane share on ${from.replace(/_/g,' ')} ↔ ${to.replace(/_/g,' ')} (slot #${newSupply}, Ƒ${price.toLocaleString()})`, 'good', '📋');
      broadcast({ type:'share_update', data:{ laneKey, supply: newSupply, buyPrice: shareBuyPrice(lane.vol, newSupply), sellPrice: shareSellPrice(lane.vol, newSupply) } });
      ws.send(JSON.stringify({ type:'share_bought', data:{ laneKey, slot: newSupply, price, cash: actor.cash, vol: lane.vol } }));
    }

    // ── Lane Shares: sell your share ────────────────────────────────────────
    if (msg.type === 'share_sell') {
      const existing = getPlayerShare(actor.id);
      if (!existing) { ws.send(JSON.stringify({ type:'share_error', error:'You don\'t hold any share' })); return; }
      const vol = getLaneVol(existing.lane_key);
      const supply = getLaneShareCount(existing.lane_key);
      const sellVal = shareSellPrice(vol, supply);
      sellLaneShare(actor.id);
      safeAddCash(actor, sellVal);
      savePlayer(actor);
      const newSupply = supply - 1;
      const [colA, colB] = existing.lane_key.split('|');
      pushHeadline(`${actor.name} sells lane share on ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} for Ƒ${sellVal.toLocaleString()}`, 'neutral', '📋');
      broadcast({ type:'share_update', data:{ laneKey: existing.lane_key, supply: newSupply, buyPrice: shareBuyPrice(vol, newSupply), sellPrice: shareSellPrice(vol, newSupply) } });
      ws.send(JSON.stringify({ type:'share_sold', data:{ laneKey: existing.lane_key, sellPrice: sellVal, purchasePrice: existing.purchase_price, dividendsEarned: existing.dividends_earned, cash: actor.cash } }));
    }

    // ── Lane Shares: atomic swap (sell old + buy new in one transaction) ─────
    if (msg.type === 'share_swap') {
      const { from, to } = msg;
      if (!from || !to) { ws.send(JSON.stringify({ type:'share_error', error:'Missing lane endpoints' })); return; }
      const existing = getPlayerShare(actor.id);
      if (!existing) { ws.send(JSON.stringify({ type:'share_error', error:'No share to sell. Use buy instead.' })); return; }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'share_error', error:'No lane exists' })); return; }
      const newLaneKey = getLaneKey(from, to);
      if (existing.lane_key === newLaneKey) { ws.send(JSON.stringify({ type:'share_error', error:'Already holding this lane' })); return; }
      // Calculate sell proceeds
      const oldVol = getLaneVol(existing.lane_key);
      const oldSupply = getLaneShareCount(existing.lane_key);
      const sellVal = shareSellPrice(oldVol, oldSupply);
      // Calculate buy cost
      const newSupply = getLaneShareCount(newLaneKey);
      if (newSupply >= SHARE_MAX_SLOTS) { ws.send(JSON.stringify({ type:'share_error', error:'Target lane full (100/100)' })); return; }
      const buyVal = shareBuyPrice(lane.vol, newSupply);
      // Check net cost
      const netCost = buyVal - sellVal;
      if (netCost > 0 && actor.cash < netCost) {
        ws.send(JSON.stringify({ type:'share_error', error:`Insufficient funds for swap. Sell: +Ƒ${sellVal.toLocaleString()}, Buy: -Ƒ${buyVal.toLocaleString()}, Net: -Ƒ${netCost.toLocaleString()}, Cash: Ƒ${Math.round(actor.cash).toLocaleString()}` }));
        return;
      }
      // Execute atomically: sell old, buy new, adjust cash once
      sellLaneShare(actor.id);
      safeAddCash(actor, sellVal);
      actor.cash = Math.round((actor.cash - buyVal) * 100) / 100;
      savePlayer(actor);
      buyLaneShare(newLaneKey, newSupply + 1, actor.id, actor.name, buyVal);
      // Broadcast updates for both lanes
      const oldNewSupply = oldSupply - 1;
      const [oA, oB] = existing.lane_key.split('|');
      broadcast({ type:'share_update', data:{ laneKey: existing.lane_key, supply: oldNewSupply, buyPrice: shareBuyPrice(oldVol, oldNewSupply), sellPrice: shareSellPrice(oldVol, oldNewSupply) } });
      broadcast({ type:'share_update', data:{ laneKey: newLaneKey, supply: newSupply + 1, buyPrice: shareBuyPrice(lane.vol, newSupply + 1), sellPrice: shareSellPrice(lane.vol, newSupply + 1) } });
      pushHeadline(`${actor.name} swaps lane share: ${oA.replace(/_/g,' ')} → ${from.replace(/_/g,' ')} ↔ ${to.replace(/_/g,' ')}`, 'neutral', '📋');
      ws.send(JSON.stringify({ type:'share_swapped', data:{ oldLane: existing.lane_key, newLane: newLaneKey, soldFor: sellVal, boughtFor: buyVal, cash: actor.cash } }));
    }

    // ── Lane Shares: get player's holding ───────────────────────────────────
    if (msg.type === 'share_status') {
      const share = getPlayerShare(actor.id);
      if (share) {
        const vol = getLaneVol(share.lane_key);
        const supply = getLaneShareCount(share.lane_key);
        const sellVal = shareSellPrice(vol, supply);
        const div = getShareDividend(vol);
        const mult = getWarMultiplier(share.lane_key);
        ws.send(JSON.stringify({ type:'share_status', data:{
          laneKey: share.lane_key, slot: share.slot_number, purchasePrice: share.purchase_price,
          currentSellPrice: sellVal, dividendsEarned: share.dividends_earned,
          dividendPerTick: Math.round(div * mult), warMultiplier: mult, vol, supply,
        }}));
      } else {
        ws.send(JSON.stringify({ type:'share_status', data: null }));
      }
    }

    // ── Galaxy data request: send blockades, shares, tension, HQ map ────────
    if (msg.type === 'galaxy_data_request') {
      const blockades = {};
      for (const [k,v] of activeBlockades) blockades[k] = { active:v.active, pool:v.pool, faction:v.faction, expiresAt:v.expiresAt||null };
      // Build share summaries per lane
      const shareSummaries = {};
      try {
        const summaries = getLaneShareSummaries();
        for (const s of summaries) {
          const vol = getLaneVol(s.lane_key);
          shareSummaries[s.lane_key] = {
            supply: s.supply, maxSlot: s.max_slot,
            buyPrice: shareBuyPrice(vol, s.supply),
            sellPrice: shareSellPrice(vol, s.supply),
            dividend: getShareDividend(vol),
            warMult: getWarMultiplier(s.lane_key),
          };
        }
      } catch(_) {}
      // Player's own share
      const myShare = getPlayerShare(actor.id);
      const hqMap = {};
      for (const c of companies) hqMap[c.symbol] = c.hq;
      ws.send(JSON.stringify({ type:'galaxy_data', data:{
        blockades, shareSummaries, myShare: myShare ? {
          laneKey: myShare.lane_key, slot: myShare.slot_number,
          purchasePrice: myShare.purchase_price, dividendsEarned: myShare.dividends_earned,
        } : null,
        shareCurve: SHARE_CURVE, shareMax: SHARE_MAX_SLOTS,
        hqMap, cargoTypes:CARGO_TYPES, laneRisk:LANE_RISK,
      } }));
    }
  });

  ws.on('close',()=>{
    const playerId=wsPlayers.get(ws);
    if(playerId&&playerSockets.has(playerId)){playerSockets.get(playerId).delete(ws);if(playerSockets.get(playerId).size===0)playerSockets.delete(playerId);}
    broadcastLeaderboard();
  });
});

// ─── Timers ───────────────────────────────────────────────────────────────────

setInterval(stepMarket, TICK_MS);
setInterval(broadcastLeaderboard, 15000);
setInterval(genHeadline, NEWS_MS);
setInterval(() => { try { saveMarketState(companies, headlines); } catch(e) {} try { saveGalaxySystems(); } catch(e) {} try { savePresidentState(president); } catch(e) {} }, 60_000);
setInterval(() => { try { processFundProposals(); } catch(e) {} }, 60_000);

// ── House proposal resolution (Capital Houses, fund-scoped voting) ────────────
// Resolves on a timer by MAJORITY OF VOTES CAST. vote mode → auto-executes a pass;
// council mode → marks advisory result, owner executes/vetoes; executive → cleaned.
function processHouseProposals() {
  const due = getDueHouseProposals(Date.now());
  for (const p of due) {
    try {
      const fund = getFund(p.fund_id);
      if (!fund) { resolveHouseProposal(p.id, 'expired', false); continue; }
      resolveHouseProposalDecision(fund, p);
    } catch(e) { console.error('[House proposal]', p.id, e); }
  }
}
setInterval(() => { try { processHouseProposals(); } catch(e) {} }, 60_000);
setInterval(() => { try { expireOldFundPolls(); } catch(e) {} }, 5 * 60_000);

// Periodic net worth snapshot every 5 minutes for all online players
// (ensures P&L history tracks even if player isn't actively trading)
setInterval(() => {
  try {
    for (const [playerId, sockets] of playerSockets) {
      if (!sockets.size) continue;
      const p = getPlayer(playerId); if (!p) continue;
      const equity = Object.entries(p.holdings||{}).reduce((acc,[sym,qty])=>{
        const co = companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
      },0);
      recordNetWorth(p.id, p.cash+equity, p.cash, equity);
    }
  } catch(e) {}
}, 5 * 60 * 1000);

// v5.0 timers
setInterval(() => { try { runEarningsEvent(); } catch(e) { console.error('[Earnings]', e); } }, EARNINGS_INTERVAL_MS);
setInterval(() => { try { runDividends(); } catch(e) { console.error('[Dividends]', e); } }, DIVIDEND_INTERVAL_MS);
setInterval(() => { try { runBorrowFees(); } catch(e) { console.error('[Borrow]', e); } }, BORROW_INTERVAL_MS);
// Margin-call sweep: cheap scan of connected players' shorts; 5s keeps a squeeze from
// blowing well past the 65% trigger between checks without scanning every tick.
setInterval(() => { try { runMarginCalls(); } catch(e) { console.error('[MarginCall]', e); } }, 5000);

// Reset prevClose at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) resetDailyPrevClose();
}, 60_000);

// Passive income every 30 minutes — aligned to wall-clock :00 and :30
// (client countdown + EOD timer use wall-clock, so server must match or day trades drift)
const _passiveIncomeTick = () => {
  try{
    // Reset day-trade counters for all players at each 30-min cycle
    _dtResetAll();
    broadcast({type:'dt_update',data:{dayTradesRemaining:DAY_TRADE_CAP}});

    // Snapshot all stock holdings at each EOD cycle. Used by runDividends() to
    // enforce the 7-trading-day holding requirement for dividend eligibility.
    try {
      const snap = snapshotAllHoldings();
      console.log(`[HoldingSnapshot] cycle=${snap.cycle} rows=${snap.snapshotted}`);
    } catch(e) { console.error('[HoldingSnapshot]', e); }

    // Rotate hot stocks — 10 new movers each cycle
    try { rotateHotStocks(); } catch(e) { console.error('[Hot Stocks]', e); }

    const result=creditPassiveIncome(new Set(playerSockets.keys()));
    const {count, payouts, guildMemberCount} = result;

    // ── Coalition colony control bonus (flat per controlled colony) ─────────
    let colonyStates = [];
    let playerFactions = {};
    try { colonyStates = getAllColonyStates(); } catch(_) {}
    try { playerFactions = getPlayerFactionsBulk(); } catch(_) {}

    // Count colonies controlled by each faction for passive bonus
    const FACTION_COLONY_BONUS = 15; // Ƒ per controlled colony per 30min (all factions)
    const factionColonyCounts = { coalition: 0, syndicate: 0, void: 0 };
    for (const c of colonyStates) {
      if (c.id === 'flesh_station') continue;
      const ctrl = {coalition:c.control_coalition||0,syndicate:c.control_syndicate||0,void:c.control_void||0};
      const leading = ['coalition','syndicate','void','guild'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition');
      if (ctrl[leading] > 0) factionColonyCounts[leading]++;
    }

    if(count>0){
      console.log(`[Income] Credited passive income to ${count} players`);
      for(const payout of payouts){
        const p=getPlayer(payout.id); if(!p) continue;
        const sockets=playerSockets.get(payout.id)||new Set();

        // Item passive bonus from equipped items
        let itemBonus = 0;
        try { itemBonus = getEquippedPassiveBonus(payout.id); } catch(_) {}
        if (itemBonus > 0) {
          p.cash = Math.round((p.cash + itemBonus) * 100) / 100;
          savePlayer(p);
        }

        // Void Collective cyborg bonus (+Ƒ15 permanent)
        let cyborgBonus = 0;
        try {
          if (isVoidLocked(payout.id)) {
            cyborgBonus = 15;
            p.cash = Math.round((p.cash + cyborgBonus) * 100) / 100;
            savePlayer(p);
          }
        } catch(_) {}

        // Faction colony control bonus (all factions get Ƒ15/colony)
        let coalBonus = 0;
        const playerFaction = playerFactions[payout.id]?.faction;
        if (playerFaction && factionColonyCounts[playerFaction] > 0) {
          coalBonus = factionColonyCounts[playerFaction] * FACTION_COLONY_BONUS;
          p.cash = Math.round((p.cash + coalBonus) * 100) / 100;
          savePlayer(p);
        }

        // ── Greed sovereign tithe (+Ƒ500 per income cycle) ───────────────────
        // Conditions:
        //   1. A single faction must control ALL THREE cluster planets: limbosis, lustandia, gluttonis
        //   2. The paying player must be in that faction
        //   3. The player must have been in that faction for at least 30 days
        let greedBonus = 0;
        try {
          const CLUSTER_NODES = ['limbosis', 'lustandia', 'gluttonis'];
          const LOCK_MS = 30 * 24 * 60 * 60 * 1000;
          // Determine which faction leads each cluster node
          const clusterLeaders = CLUSTER_NODES.map(nid => {
            const col = colonyStates.find(c => c.id === nid);
            if (!col) return null;
            const ctrl = { coalition: col.control_coalition||0, syndicate: col.control_syndicate||0, void: col.control_void||0 };
            return ['coalition','syndicate','void','guild'].reduce((b,f) => ctrl[f] > ctrl[b] ? f : b, 'coalition');
          });
          // All three must be the same faction
          const sovereign = (clusterLeaders[0] && clusterLeaders.every(l => l === clusterLeaders[0]))
            ? clusterLeaders[0] : null;
          if (sovereign) {
            const pfd = playerFactions[payout.id];
            const playerFaction = pfd?.faction || null;
            const joinedAt = pfd?.joinedAt || 0;
            const veteranEnough = joinedAt && (Date.now() - joinedAt) >= LOCK_MS;
            if (playerFaction === sovereign && veteranEnough) {
              greedBonus = 500;
              p.cash = Math.round((p.cash + greedBonus) * 100) / 100;
              savePlayer(p);
            }
          }
        } catch(_) {}

        // Record net worth for every player on income tick
        try {
          const equity = Object.entries(p.holdings||{}).reduce((acc,[sym,qty])=>{
            const co=companies.find(x=>x.symbol===sym); return acc+(co?co.price*qty:0);
          },0);
          recordNetWorth(p.id, p.cash+equity, p.cash, equity);
        } catch(_) {}

        if(sockets.size===0) continue;
        const portfolioMsg=JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
        let incomeText;
        if (payout.isDev) {
          incomeText = `⚡ Dev passive: +Ƒ${payout.total.toLocaleString()}, FLSH Capital dividend`;
        } else if (coalBonus > 0) {
          const fName = (playerFaction||'faction').charAt(0).toUpperCase() + (playerFaction||'faction').slice(1);
          incomeText = `+Ƒ${payout.total} passive  ·  +Ƒ${coalBonus} ${fName} colony control (${factionColonyCounts[playerFaction]} colony)`;
        } else if (payout.bonus > 0) {
          incomeText = `+Ƒ${payout.base} passive income  ·  +Ƒ${payout.bonus} guild bonus`;
        } else {
          incomeText = `+Ƒ${payout.total} passive income`;
        }
        const totalWithBonus = payout.total + coalBonus + itemBonus + greedBonus + cyborgBonus;
        const itemBonusText = itemBonus > 0 ? `  ·  +Ƒ${itemBonus} item bonus` : '';
        const greedBonusText = greedBonus > 0 ? `  ·  +Ƒ${greedBonus} Greed sovereign tithe` : '';
        const cyborgBonusText = cyborgBonus > 0 ? `  ·  +Ƒ${cyborgBonus} cyborg augment` : '';
        const incomeMsg=JSON.stringify({type:'income',data:{base:payout.base,bonus:payout.bonus+coalBonus+itemBonus+greedBonus+cyborgBonus,total:totalWithBonus,guildMemberCount,text:incomeText+itemBonusText+greedBonusText+cyborgBonusText}});
        for(const ws of sockets){try{if(ws.readyState===1){ws.send(portfolioMsg);ws.send(incomeMsg);}}catch(e){}}
      }
      for(const[pid,sockets]of playerSockets){
        const p=getPlayer(pid); if(!p)continue;
        const msg=JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
        for(const ws of sockets){try{if(ws.readyState===1)ws.send(msg);}catch(e){}}
      }
      broadcastLeaderboard();
    }

    // ── Capital House NAV snapshot (for the performance chart) ───────────────
    // The 30-min profit distribution faucet was removed in v1.0.2.4 — houses earn
    // through trading, shown in the NAV/share P&L. This loop now only snapshots NAV.
    try {
      const priceMap = buildPriceMap();
      for (const fund of getAllFunds()) {
        const nav         = getFundNAVById(fund.id, priceMap);
        const totalShares = getTotalFundSharesById(fund.id);
        const spp         = totalShares > 0 && nav > 0 ? nav / totalShares : 1;
        recordFundNAV(fund.id, nav, spp, totalShares);
      }
    } catch(e) { console.error('[Fund NAV snapshot error]', e); }

    // ── President passive income ──────────────────────────────────────────────
    if (president && playerSockets.has(president.id)) {
      try {
        const p = getPlayer(president.id);
        if (p) {
          safeAddCash(p, PRESIDENT_PASSIVE);
          savePlayer(p);
          broadcastToPlayer(p.id, { type: 'income', data: {
            amount: PRESIDENT_PASSIVE, source: 'Presidential Stipend', total: p.cash
          }});
          broadcastToPlayer(p.id, { type: 'portfolio', data: snapshotPortfolio(p) });
        } else {
          president = null;
        }
      } catch(e) { console.error('[President income]', e); }
    }
  }catch(e){console.error('[Income error]',e);}
  // Snapshot leaderboard after all income is credited
  try { snapshotLeaderboard(); broadcastLeaderboard(); } catch(e) { console.error('[Leaderboard snapshot]', e); }
};

// Schedule the first passive income tick at the next wall-clock :00 or :30,
// then every 30 minutes after that. This keeps day trade resets in sync with
// the client's EOD countdown (which uses wall-clock), so players who trade
// just before EOD still get their reset at the boundary they see on-screen.
(function scheduleAlignedPassiveIncome(){
  const now = new Date();
  const m = now.getMinutes();
  const target = new Date(now);
  target.setSeconds(0);
  target.setMilliseconds(0);
  if (m < 30) {
    target.setMinutes(30);
  } else {
    target.setHours(target.getHours() + 1);
    target.setMinutes(0);
  }
  const msUntilNext = target.getTime() - now.getTime();
  const mm = target.getMinutes().toString().padStart(2,'0');
  console.log(`[PassiveIncome] First tick in ${Math.round(msUntilNext/1000)}s (aligned to :${mm})`);
  setTimeout(() => {
    _passiveIncomeTick();
    setInterval(_passiveIncomeTick, INCOME_INTERVAL_MS);
  }, msUntilNext);
})();

// ── Scheduled daily tasks (midnight PST = 08:00 UTC) ─────────────────────────
function msUntilNextMidnightPST() {
  const now = new Date();
  const pstNow = new Date(now.toLocaleString('en-US', {timeZone:'America/Los_Angeles'}));
  const nextMid = new Date(pstNow); nextMid.setHours(24,0,0,0);
  return nextMid - pstNow;
}

function runDailyTasks() {
  console.log(`[Daily] Running daily tasks at ${new Date().toISOString()}`);

  // 1. Monthly Patreon spin grants (calendar-month, no double-grant)
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const rows = getPatreonSubscribers();
    let granted = 0;
    for (const row of rows) {
      try {
        const spinRow = getSlotRecord(row.id);
        if ((spinRow.last_monthly_grant||0) >= monthStart) continue;
        const spins = grantMonthlySpins(row.id, row.patreon_tier);
        if (spins > 0) {
          broadcastToPlayer(row.id, {type:'spin_grant',data:{spins,reason:`Monthly Patreon grant (Tier ${row.patreon_tier})`}});
          if (row.patreon_tier >= 3) {
            const rr = useSpinAndDrop(row.id, 'epic');
            if (rr.ok) broadcastToPlayer(row.id, {type:'spin_result',data:{
              item:rr.item, invId:rr.invId, rarity:rr.item.rarity,
              rarityColor:RARITY_CONFIG[rr.item.rarity]?.color,
              spinsRemaining:getSlotRecord(row.id).spins_remaining, guaranteed:true
            }});
          }
          granted++;
        }
      } catch(_) {}
    }
    if (granted > 0) console.log(`[Spins] Monthly grant: ${granted} subscribers`);
  } catch(e) { console.error('[Monthly grant error]', e); }

  // 2. Daily free spin for all online players
  try {
    let dc = 0;
    for (const [pid, sockets] of playerSockets) {
      if (!sockets || sockets.size === 0) continue;
      addSpins(pid, 1);
      broadcastToPlayer(pid, {type:'spin_grant',data:{spins:1,reason:'Daily login bonus'}});
      dc++;
    }
    if (dc > 0) console.log(`[Spins] Daily bonus: ${dc} online players`);
  } catch(e) { console.error('[Daily spin error]', e); }

  setTimeout(runDailyTasks, msUntilNextMidnightPST());
}
setTimeout(runDailyTasks, msUntilNextMidnightPST());
console.log(`[Daily] First run in ~${Math.round(msUntilNextMidnightPST()/60000)}m`);

setInterval(()=>{
  try{const n=revokeExpiredPatreon();if(n>0)console.log(`[Patreon] Revoked ${n} expired memberships`);}catch(e){}
}, 60*60*1000);

// Fund savings interest — DISABLED (v1.0.2.4). Capital Houses earn through
// trading performance (reflected in the NAV/share P&L), not minted passive yield.
// Loop left in place but inert in case a baseline yield is reintroduced later.
/*
setInterval(()=>{
  try {
    const total = applyFundSavingsInterest();
    if (total > 0) {
      console.log(`[Funds] Savings interest: Ƒ${total.toFixed(2)}`);
      for (const fund of getAllFunds()) {
        const snap = fundDetailSnapshot(fund.id, null);
        broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
      }
      updateFLSHPrice();
    }
  } catch(e) { console.error('[Funds savings error]', e); }
}, 60 * 60 * 1000);
*/

// ─── Galaxy: Hourly tension tick + conquest resolution ────────────────────────
// ─── COMMODITY PRICE ENGINE ───────────────────────────────────────────────────
// Leading faction for a colony state row (4-faction aware).
function colonyLeadingFaction(c) {
  if (!c) return 'contested';
  if (c.faction === 'fleshstation') return 'fleshstation';
  const ctrl = {
    coalition: c.control_coalition || 0,
    syndicate: c.control_syndicate || 0,
    void:      c.control_void      || 0,
    guild:     c.control_guild     || 0,
  };
  const total = ctrl.coalition + ctrl.syndicate + ctrl.void + ctrl.guild;
  if (total < 10) return 'contested';
  const leading = ['coalition','syndicate','void','guild'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition');
  // Need a real lead (>=45% of cast control) to set the tone; else contested.
  return ctrl[leading] >= total * 0.45 ? leading : 'contested';
}

// Target price for a commodity at a colony, given its leading faction + supply.
// supply is a signed pressure value: positive = oversupplied (cheaper),
// negative = scarce (dearer). It decays toward 0 each tick.
function commodityTargetPrice(commodity, leading, tension, supply, colonyId) {
  const facMods = COMMODITY_FACTION_MOD[leading] || COMMODITY_FACTION_MOD.contested;
  const facMod  = facMods[commodity.cls] || 1.0;
  // Tension premium: scarce-goods classes cost more in unstable colonies.
  const tensionMod = 1 + (Math.max(0, Math.min(100, tension || 0)) / 100) *
    (commodity.cls === 'med' ? 0.25 : commodity.cls === 'tech' ? 0.12 : 0.05);
  const supplyMod = 1 - Math.max(-0.4, Math.min(0.4, (supply || 0)));
  const affinity = colonyId ? commodityColonyAffinity(colonyId, commodity.id) : 1.0;
  return commodity.basePrice * facMod * tensionMod * supplyMod * affinity;
}

// Per-colony, per-commodity local affinity. Each colony naturally produces some goods
// (cheaper there) and lacks others (dearer there), independent of faction class mods.
// Deterministic hash so it's stable per colony+commodity but varies across the matrix.
// This is what makes EVERY colony a distinct market: different goods are cheapest and
// dearest in different places, so trade routes span the whole galaxy rather than
// funneling through one cheap and one dear colony for an entire class.
function commodityColonyAffinity(colonyId, commodityId) {
  let h = 2166136261;
  const s = colonyId + '|' + commodityId;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  // Map hash to roughly 0.80..1.20 (±20% local price swing).
  const u = ((h >>> 0) % 1000) / 1000; // 0..1
  return 0.80 + u * 0.40;
}

// One price tick: random-walk each colony×commodity price toward its control-driven
// target, scaled by the commodity's volatility and the faction's volatility profile.
function tickCommodityPrices() {
  const colonies = getAllColonyStates();
  const existing = {};
  for (const r of getAllCommodityPrices()) existing[r.colony_id + '|' + r.commodity_id] = r;
  let updated = 0;
  for (const c of colonies) {
    if (!isMarketColony(c)) continue;
    const leading = colonyLeadingFaction(c);
    const facVol  = COMMODITY_FACTION_VOL[leading] || 1.0;
    for (const com of COMMODITIES) {
      const key = c.id + '|' + com.id;
      const prev = existing[key];
      let supply = prev ? prev.supply : 0;
      supply = supply * (1 - COMMODITY_SUPPLY_DECAY); // relax toward equilibrium
      const target = commodityTargetPrice(com, leading, c.tension, supply, c.id);
      let price;
      if (!prev) {
        price = target; // seed at target
      } else {
        // Mean-reverting walk: move a fraction toward target + small noise.
        const revert = 0.25;
        const noise  = (Math.random() * 2 - 1) * com.vol * facVol * prev.price;
        price = prev.price + (target - prev.price) * revert + noise;
        price = Math.max(target * 0.5, Math.min(target * 1.8, price)); // clamp band
      }
      price = Math.round(price * 100) / 100;
      upsertCommodityPrice(c.id, com.id, price, Math.round(supply * 1e4) / 1e4);
      updated++;
    }
  }
  return updated;
}

function runGalaxyTick() {
  try {
    const colonies = getAllColonyStates();
    const now = Date.now();
    for (const c of colonies) {
      const ctrl = { coalition: c.control_coalition, syndicate: c.control_syndicate, void: c.control_void, guild: c.control_guild || 0 };
      const leading = ['coalition','syndicate','void','guild'].reduce((best, f) => ctrl[f] > ctrl[best] ? f : best, 'coalition');
      const contested = ctrl[leading] < 60 ? 1 : 0;

      // Check conquest timer
      if (c.conquest_timer && c.conquest_faction && now >= c.conquest_timer) {
        // Conquest resolves — colony changes hands
        const oldFaction = c.faction;
        const newFaction = c.conquest_faction;
        updateColonyState(c.id, {
          faction: newFaction,
          conquest_faction: null,
          conquest_timer: null,
          tension: Math.max(5, c.tension - 30),
          contested: 0,
        });
        // Fire conquest headline
        const COLONY_NAMES = {
          new_anchor:'New Anchor', cascade_station:'Cascade Station',
          frontier_outpost:'Frontier Outpost', the_hollow:'The Hollow',
          vein_cluster:'Vein Cluster', aurora_prime:'Aurora Prime', null_point:'Null Point',
          flesh_station:'Flesh Station',
        };
        const FACTION_NAMES = { coalition:'Coalition', syndicate:'Syndicate', void:'Void Collective', guild:'Merchant Guild', fleshstation:'Flesh Station' };
        const cName = COLONY_NAMES[c.id] || c.id;
        const fName = FACTION_NAMES[newFaction] || newFaction;
        const oldName = FACTION_NAMES[oldFaction] || oldFaction;
        const headline = `${fName} seizes ${cName} from ${oldName}, power shifts in the outer sectors`;
        pushHeadline(headline, 'bad', '⚠');
        broadcast({ type:'colony_conquered', data:{
          colonyId: c.id, colonyName: cName, newFaction, oldFaction, warChest: c.war_chest
        }});
        console.log(`[Galaxy] Conquest: ${newFaction} takes ${c.id} from ${oldFaction}`);
        // Void all lane shares on lanes connected to this colony
        voidSharesForColony(c.id);
        continue;
      }

      // Natural tension drift (contested colonies gain tension, others decay)
      let newTension = c.tension;
      if (contested) newTension = Math.min(90, newTension + 2);
      else newTension = Math.max(0, newTension - 1);

      // ── Tension threshold market events ──
      const oldBand = _lastTensionBand[c.id] || getTensionBand(c.tension);
      const newBand = getTensionBand(newTension);
      if (newBand > oldBand && newBand >= 1) {
        fireTensionEvent(c.id, newBand, newTension);
      }
      _lastTensionBand[c.id] = newBand;

      if (newTension !== c.tension || contested !== c.contested) {
        updateColonyState(c.id, { tension: newTension, contested });
        broadcast({ type:'colony_update', data:{
          colonyId: c.id, tension: newTension, contested,
          control_coalition: c.control_coalition,
          control_syndicate: c.control_syndicate,
          control_void: c.control_void,
          conquest_faction: c.conquest_faction || null,
          conquest_timer: c.conquest_timer || null,
        }});
      }
    }
  } catch(e) { console.error('[Galaxy tick]', e); }
}
setInterval(runGalaxyTick, 60 * 60 * 1000); // hourly
// Commodity price grid: float prices on control every 5 min, and seed once on boot.
try { const n = tickCommodityPrices(); console.log(`[Commodities] Seeded/updated ${n} colony×commodity prices`); } catch(e) { console.error('[Commodities] seed', e); }
setInterval(() => { try { tickCommodityPrices(); } catch(e) { console.error('[Commodities]', e); } }, COMMODITY_TICK_MS);
// Light live drift: nudge a handful of random colony×commodity prices every 12s and
// push them, so the board visibly breathes between NPC/player events. Small moves;
// the 5-min control tick still does the real mean-reverting work.
setInterval(() => {
  try {
    const colonies = getAllColonyStates().filter(isMarketColony);
    if (!colonies.length) return;
    for (let i = 0; i < 4; i++) {
      const c = colonies[Math.floor(Math.random() * colonies.length)];
      const com = COMMODITIES[Math.floor(Math.random() * COMMODITIES.length)];
      const drift = (Math.random() * 2 - 1) * 0.02; // +/-2% supply jitter
      nudgeAndBroadcast(c, com.id, drift, 'drift');
    }
  } catch(e) { console.error('[Drift]', e); }
}, 12_000);
// Cargo arbitrage shipments run as a 10-min phase machine. The stepper advances every
// active shipment by elapsed time, so a restart resumes them correctly (phases catch
// up, completed ones deliver/close on the next tick). Steps every 3s for a smooth tracker.
try { stepCargoShipments(); const n = getActiveCargoShipments().length; if (n) console.log(`[CargoShip] Resumed ${n} in-flight shipment(s)`); } catch(e) { console.error('[CargoShip recovery]', e); }
setInterval(() => { try { stepCargoShipments(); } catch(e) { console.error('[CargoStep]', e); } }, 3_000);
// Shipping contracts: auto-settle expired ones every 15s (auto-exercises if in-the-money).
setInterval(() => { try { sweepContracts(); } catch(e) { console.error('[Contracts]', e); } }, 15_000);
// Server NPC trade fleet: spawn ships that carry real manifests and move prices.
setInterval(() => { try { npcSpawn(); } catch(e) { console.error('[NPC spawn]', e); } }, NPC_SPAWN_MS);
setInterval(() => { try { npcTick(); } catch(e) { console.error('[NPC tick]', e); } }, NPC_TICK_MS);
// Seed a few NPC ships at boot so the galaxy isn't empty.
try { for (let i=0;i<8;i++) npcSpawn(); console.log(`[NPC] Fleet seeded (${NPC_FLEET.size} ships)`); } catch(e) { console.error('[NPC seed]', e); }

// ─── Lane Shares dividend distribution (every 30 min) ─────────────────────────
setInterval(() => {
  try {
    const allShares = getAllLaneShares();
    if (!allShares.length) return;
    let totalPaid = 0;
    for (const share of allShares) {
      const p = getPlayer(share.holder_id);
      if (!p) continue;
      const vol = getLaneVol(share.lane_key);
      const baseDividend = getShareDividend(vol);
      const warMult = getWarMultiplier(share.lane_key);
      const dividend = Math.round(baseDividend * warMult);
      if (dividend <= 0) continue;
      safeAddCash(p, dividend);
      savePlayer(p);
      addShareDividend(share.id, dividend);
      totalPaid += dividend;
      const sockets = playerSockets.get(share.holder_id);
      if (sockets) {
        const msg = JSON.stringify({ type:'share_dividend', data:{
          laneKey: share.lane_key, dividend, warMult,
          totalDividends: share.dividends_earned + dividend, cash: p.cash,
        }});
        for (const ws of sockets) { try { if(ws.readyState===1) ws.send(msg); } catch(e){} }
      }
    }
    if (totalPaid > 0) console.log(`[Lane Shares] Distributed Ƒ${totalPaid.toLocaleString()} in dividends to ${allShares.length} holders`);
  } catch(e) { console.error('[Lane Shares dividend]', e); }
}, 30 * 60 * 1000);

// ─── Conquest voiding: void all shares on lanes touching a conquered colony ───
function voidSharesForColony(colonyId) {
  try {
    if (!LANES_SERVER || !LANES_SERVER.length) return;
    const affectedLanes = LANES_SERVER.filter(l => l.from === colonyId || l.to === colonyId);
    let totalVoided = 0;
    for (const lane of affectedLanes) {
      const lk = getLaneKey(lane.from, lane.to);
      const voided = voidLaneSharesByLane(lk);
      totalVoided += voided.length;
      if (voided.length > 0) {
        broadcast({ type:'share_update', data:{ laneKey: lk, supply: 0, buyPrice: shareBuyPrice(lane.vol, 0), sellPrice: 0, voided: true } });
      }
    }
    if (totalVoided > 0) {
      const cName = colonyId.replace(/_/g, ' ');
      pushHeadline(`⚠ CONQUEST VOID: ${totalVoided} lane shares destroyed, ${cName} colony seized, all connected lane contracts voided`, 'bad', '💀');
      console.log(`[Lane Shares] Voided ${totalVoided} shares for colony ${colonyId}`);
    }
  } catch(e) { console.error('[Lane Shares void]', e); }
}

for(const sig of['SIGINT','SIGTERM']){
  process.on(sig,()=>{console.log(`[${sig}] Saving...`);saveMarketState(companies,headlines);saveGalaxySystems();savePresidentState(president);process.exit(0);});
}

// ─── Start server ─────────────────────────────────────────────────────────────

server.listen(PORT,()=>{
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Flesh Market v5.0 , port ${PORT}      ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`   Companies: ${companies.length}`);
  console.log(`   Features: Limit Orders, Short Selling, Earnings, Dividends, Trade Feed, XP/Levels`);
  console.log(`   DB: ${process.env.DB_PATH||'fleshmarket.db'}`);
  if (DEV_ACCOUNTS.length) {
    syncDevAccounts(DEV_ACCOUNTS);
    console.log(`   Dev accounts: ${DEV_ACCOUNTS.join(', ')}`);
  }
  console.log('');
});
