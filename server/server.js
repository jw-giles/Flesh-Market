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
import path from 'path';
import url  from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

import { filterChat } from './chat-filter.js';

import {
  initDB, setupTransactions,
  createPlayerSync, getPlayer, getPlayerByName,
  getPlayerByPatreonEmail, getPlayerByPatreonMemberId,
  isNameAvailable, touchPlayer, renamePlayer, markTutorialSeen,
  savePlayerFn, recordNetWorthFn,
  getNetWorthHistory, getLeaderboard,
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
  fundDepositFn, fundWithdrawFn,
  getFundActivity, logFundActivity,
  kickFundMember,
  initFundPolls, createFundPoll, getFundPolls, voteFundPoll, closeFundPoll, expireOldFundPolls,
  setDevAccount, isDevAccount, syncDevAccounts,
  isAdminAccount, setAdminAccount, isOwnerAccount, initModerationTable,
  setMute, clearMute, isMuted, getMuteExpiry,
  setBan, isBanned, getModerationRecord,
  setDunce, clearDunce, isDunced, getDunceRecord,
  FUND_CREATE_COST, FUND_SLOT_COST, FUND_BASE_SLOTS, FLSH_TRADE_PCT,
  // Galaxy
  seedColoniesIfEmpty, getAllColonyStates, getColonyState, updateColonyState,
  recordFactionFunding, getColonyTopFunders, getPlayerFactionFunding,
  setPlayerFaction, getPlayerFaction, getPlayerFactionData, getPlayerFactionsBulk,
  setVoidLocked, isVoidLocked, setVoidPresidentEscaped, isVoidPresidentEscaped,
  // Lane Shares
  getLaneShareCount, getLaneShares, getAllLaneShares, getPlayerShare,
  buyLaneShare, sellLaneShare, voidLaneSharesByLane, addShareDividend, getLaneShareSummaries,
  // Item System
  ITEM_CATALOG, RARITY_CONFIG, ITEM_SLOTS,
  initItemTables, rollItemDrop, giveItem,
  getInventory, getEquipped, equipItem, unequipItem, getEquippedPassiveBonus, getPassiveIncome,
  getSlotRecord, addSpins, recordMilestoneTrade, useSpinAndDrop, grantMonthlySpins,
  listItemOnMarket, getMarketListings, buyMarketItem, cancelMarketListing, getPatreonSubscribers,
  getTutorialSeen,
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

function savePlayer(p) { try { savePlayerFn(p); } catch(e) { console.error('savePlayer:', e); } }
function recordNetWorth(id, net, cash, equity) { try { recordNetWorthFn(id, net, cash, equity); } catch(e) {} }

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT          = process.env.PORT || 7777;
const TICK_MS       = 500;
const NEWS_MS       = 7132;
const START_CASH    = 1000;
const TAX_RATE      = 0.02;
const MAX_SHARES    = 1_000_000;
const TRADE_TAX_BPS = parseInt(process.env.TRADE_TAX_BPS || '25', 10);
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
setInterval(() => {
  for (const c of companies) {
    if (c._special) continue;
    // Shift the spawn reference to current price — gravity now measures from the last 6h open
    c._spawnLnP = c.lnP;
    c._trendCheckLnP = c.lnP;
  }
  console.log('[Gravity] Spawn references rolled to current prices.');
}, GRAVITY_REFERENCE_INTERVAL_MS);

// v5.0 config
const EARNINGS_INTERVAL_MS  = 8  * 60 * 1000;  // 8 minutes
const DIVIDEND_INTERVAL_MS  = 2  * 60 * 60 * 1000; // 2 hours
const BORROW_INTERVAL_MS    = 30 * 60 * 1000;   // 30 minutes
const BORROW_RATE           = 0.001;  // 0.1% of position value per 30min
const SHORT_MARGIN_RATE     = 0.50;   // 50% of short value required as cash collateral
const MAX_SHORT_PER_SYM     = 500;    // hard cap: max shares short per symbol per player
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
const companies=NAMES.map((n,i)=>({id:i,name:n,symbol:symbolize(n),price:rng(8,60),ohlc:[],lnP:0,sigma:0.035+seededRand()*0.020,mu:-0.0004+seededRand()*0.0004,kappa:0.015+seededRand()*0.015,sector:(i%8),offset:-0.3+seededRand()*0.6}));
(()=>{const used=new Set(),letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';for(const c of companies){let sym=c.symbol.replace(/[^A-Z]/g,'').slice(0,4);if(sym.length<3)sym=(sym+'FMKT').slice(0,3);let k=0;while(used.has(sym)){sym=k<26?sym.slice(0,3)+letters[k]:sym.slice(0,2)+letters[Math.floor((k-26)/26)%26]+letters[(k-26)%26];sym=sym.slice(0,4);k++;}c.symbol=sym;used.add(sym);}})();
const SECTOR_TARGETS = [15, 25, 35, 45, 20, 55, 30, 70]; // varied anchors per sector
const SECTORS=new Array(8).fill(0).map((_,i)=>({lnIndex:Math.log(SECTOR_TARGETS[i]*(0.8+0.4*seededRand())),sigma:0.012+seededRand()*0.012,mu:-0.0001+seededRand()*0.0002,kappa:0.004+seededRand()*0.004,target:SECTOR_TARGETS[i]}));
companies.forEach(c=>{c.lnP=Math.log(c.price); c._spawnLnP=c.lnP;});

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
  const severity = band === 3 ? 0.06 : band === 2 ? 0.035 : 0.015;
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
  const headline = `⚠ TENSION ${bandLabel} [${tension}%] at ${cName} — ${targets.length} companies affected, supply chains under strain`;
  pushHeadline(headline, 'bad', '⚠');
  broadcast({ type: 'tension_event', data: { colonyId, band, tension, bandLabel, affected: targets.length } });
}

// ─── Smuggling Run System ─────────────────────────────────────────────────────
const activeSmuggling = new Map();
const SMUGGLE_COOLDOWN_MS = 15 * 60_000;
const _lastSmuggle = new Map();

const CARGO_TYPES = [
  { id:'synth_organs',      name:'Synth Organs',          baseMult:1.8, riskMod:0.10 },
  { id:'contraband_arms',   name:'Contraband Arms',       baseMult:2.2, riskMod:0.15 },
  { id:'data_cores',        name:'Encrypted Data Cores',  baseMult:1.5, riskMod:0.05 },
  { id:'rare_minerals',     name:'Rare Minerals',         baseMult:1.6, riskMod:0.08 },
  { id:'sweet_wine',        name:"S'weet Wine",           baseMult:3.0, riskMod:0.20 },
  { id:'black_market_tech', name:'Black Market Tech',     baseMult:2.5, riskMod:0.18 },
];

const LANE_RISK = {
  corporate: { intercept:0.08, durSec:30,  payMult:1.0 },
  grey:      { intercept:0.18, durSec:45,  payMult:1.5 },
  contested: { intercept:0.30, durSec:60,  payMult:2.0 },
  dark:      { intercept:0.40, durSec:90,  payMult:3.0 },
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

function resolveSmuggling(playerId) {
  const run = activeSmuggling.get(playerId);
  if (!run) return;
  activeSmuggling.delete(playerId);

  const p = getPlayer(playerId);
  if (!p) return;

  const laneRisk = LANE_RISK[run.laneType] || LANE_RISK.grey;
  const cargo = CARGO_TYPES.find(c => c.id === run.cargoId) || CARGO_TYPES[0];

  const fromState = getColonyState(run.from) || { tension:0 };
  const toState   = getColonyState(run.to)   || { tension:0 };
  const avgTension = ((fromState.tension||0) + (toState.tension||0)) / 2;
  const tensionBonus = avgTension / 500;

  const laneKey = getLaneKey(run.from, run.to);
  const blockade = activeBlockades.get(laneKey);
  const blockadeBonus = (blockade && blockade.active) ? 0.25 : 0;

  const interceptChance = Math.min(0.85, laneRisk.intercept + cargo.riskMod + tensionBonus + blockadeBonus);
  const intercepted = Math.random() < interceptChance;

  const sockets = playerSockets.get(playerId);
  if (intercepted) {
    const headline = `Smuggling run intercepted: ${cargo.name} cargo seized on ${run.from.replace(/_/g,' ')} → ${run.to.replace(/_/g,' ')} lane`;
    pushHeadline(headline, 'bad', '🚨');
    if (sockets) {
      const msg = JSON.stringify({ type:'smuggling_result', data:{
        success:false, stake:run.stake, cargo:cargo.name,
        from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
        cash: p.cash,
      }});
      // Also push portfolio so P&L updates immediately after interception
      const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
      for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
    }
  } else {
    const payout = Math.round(run.stake * cargo.baseMult * laneRisk.payMult * 100) / 100;
    safeAddCash(p, payout);
    savePlayer(p);
    const headline = `Smuggling run cleared: ${cargo.name} delivered via ${run.laneType} lane`;
    pushHeadline(headline, 'good', '📦');
    if (sockets) {
      const msg = JSON.stringify({ type:'smuggling_result', data:{
        success:true, stake:run.stake, payout, cargo:cargo.name,
        from:run.from, to:run.to, interceptChance:Math.round(interceptChance*100),
        cash: p.cash,
      }});
      // Also push portfolio so P&L updates immediately
      const pfMsg = JSON.stringify({type:'portfolio',data:snapshotPortfolio(p)});
      for (const ws of sockets) { try { if(ws.readyState===1) { ws.send(msg); ws.send(pfMsg); } } catch(e){} }
    }
  }
}

// ─── Blockade System ──────────────────────────────────────────────────────────
const activeBlockades = new Map();
const BLOCKADE_THRESHOLD   = 50000;
const BLOCKADE_DURATION_MS = 2 * 60 * 60 * 1000;
const BLOCKADE_STOCK_HIT   = 0.03;

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
      c.lnP -= BLOCKADE_STOCK_HIT + Math.random() * 0.01;
      c.price = Math.max(0.5, Math.exp(c.lnP));
    }
  }

  const headline = `⛔ BLOCKADE ACTIVE: ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} shipping lane locked down — supply chains disrupted`;
  pushHeadline(headline, 'bad', '⛔');
  broadcast({ type:'blockade_update', data:{ laneKey, active:true, expiresAt:blk.expiresAt, faction:blk.faction, pool:blk.pool } });

  blk.timer = setTimeout(() => { expireBlockade(laneKey); }, BLOCKADE_DURATION_MS);
}

function expireBlockade(laneKey) {
  const blk = activeBlockades.get(laneKey);
  if (!blk) return;
  if (blk.timer) clearTimeout(blk.timer);
  activeBlockades.delete(laneKey);
  const [colA, colB] = laneKey.split('|');
  pushHeadline(`Blockade on ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} lane expires — trade flow restored`, 'good', '✅');
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
    pushHeadline(`Counter-blockade breaks the ${colA.replace(/_/g,' ')} ↔ ${colB.replace(/_/g,' ')} lockdown — trade resumes`, 'good', '💥');
    broadcast({ type:'blockade_update', data:{ laneKey, active:false, broken:true } });
    return true;
  }
  broadcast({ type:'blockade_update', data:{ laneKey, active:true, pool:blk.pool, faction:blk.faction } });
  return false;
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
    saveGalaxySystemsState({ smuggling, blockades, savedAt: Date.now() });
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
        _lastSmuggle.set(run.playerId, run.startTs || now);
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
        if (blk.active && blk.expiresAt) {
          const remaining = blk.expiresAt - now;
          if (remaining <= 0) { expireBlockade(blk.laneKey); }
          else { restored.timer = setTimeout(() => expireBlockade(blk.laneKey), remaining); }
        }
      }
      if (data.blockades.length) console.log(`[Galaxy restore] ${data.blockades.length} blockades restored`);
    }

    // Lane shares restored from SQLite automatically
    const shareCount = getAllLaneShares().length;
    if (shareCount) console.log(`[Galaxy restore] ${shareCount} lane shares in DB`);

    console.log('[Galaxy] Systems state restored');
  } catch(e) { console.error('[Galaxy restore]', e); }
}

// ─── FLSH company (absurd dev valuation — Ƒ1,000,000,000/share) ─────────────────
// _special:true — excluded from GBM tick. Price drifts via its own slow random walk.
const FLSH_COMPANY = {
  id: 9999, name: 'FLSH Capital', symbol: 'FLSH',
  price: 1_000_000_000, lnP: Math.log(1_000_000_000),
  sigma: 0.0008, mu: 0.00002,
  ohlc: [], _special: true
};
companies.push(FLSH_COMPANY);

// ─── Abaddon cluster special companies ────────────────────────────────────────
// SWT — S'weet (Lustandia wine). Trades like a normal ticker but at higher price levels.
const SWT_COMPANY = {
  id: 9998, name: "S'weet", symbol: 'SWT',
  price: 280, lnP: Math.log(280), _spawnLnP: Math.log(280),
  sigma: 0.030, mu: 0.00002, kappa: 0.07,
  offset: 2.23,
  ohlc: [], sector: 7,
};
companies.push(SWT_COMPANY);

// BRNC — Baron Corps (Gluttonis material refining). Trades like a normal ticker.
const BRNC_COMPANY = {
  id: 9997, name: 'Baron Corps', symbol: 'BRNC',
  price: 65, lnP: Math.log(65), _spawnLnP: Math.log(65),
  sigma: 0.025, mu: -0.00005, kappa: 0.07,
  offset: 0.77,
  ohlc: [], sector: 3,
};
companies.push(BRNC_COMPANY);

function updateFLSHPrice() {
  // FLSH runs its own slow random walk, completely decoupled from sector mean-reversion.
  // Volatility: tiny per-tick drift (±0.08% 1σ) + rare 1% shock (1% chance/tick)
  const f = FLSH_COMPANY;
  const eps = randn() * f.sigma;           // normal daily micro-drift
  f.lnP += f.mu + eps;
  if (Math.random() < 0.01) {              // rare ±1% shock
    f.lnP += randn() * 0.01;
  }
  // Hard floor at Ƒ500M — it will never crash to zero
  f.lnP = Math.max(Math.log(500_000_000), f.lnP);
  const prev = f.price;
  f.price = Math.exp(f.lnP);
  const now = Date.now();
  const open=prev, close=f.price;
  const high=Math.max(open,close)*(1+Math.abs(randn()*0.0002));
  const low =Math.min(open,close)*(1-Math.abs(randn()*0.0002));
  if (!Array.isArray(f.ohlc)) f.ohlc=[];
  f.ohlc.push({t:now,o:open,h:high,l:low,c:close,v:0});
  if (f.ohlc.length>400) f.ohlc.shift();
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
      if(Array.isArray(s.ohlc))    c.ohlc =s.ohlc;
    }
  }
  if(Array.isArray(data.headlines))headlines.push(...data.headlines.slice(-200));
  console.log('[Market] State restored');
}
restoreMarketState();
// One-time fixup: if SWT/BRNC have exploded prices from the old special-ticker bug, reset them
for (const sc of [SWT_COMPANY, BRNC_COMPANY]) {
  if (sc.price > 5000) {
    console.log(`[FIXUP] ${sc.symbol} price was Ƒ${sc.price.toFixed(2)} — resetting to compiled default`);
    sc.price = sc === SWT_COMPANY ? 280 : 65;
    sc.lnP = Math.log(sc.price);
    sc._spawnLnP = sc.lnP;
  }
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
        broadcastToPlayer(playerId, {type:'error',data:{msg:'❌ Limit order skipped — day-trade limit reached.'}});
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
  const magnitude = 0.06 + Math.random() * 0.14; // 6–20%
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
  pushHeadline(`EARNINGS: ${c.name} (${c.symbol}) ${beat ? 'beats' : 'misses'} — ${dir}${(magnitude*100).toFixed(1)}% @ Ƒ${newPrice.toFixed(2)}`, tone, c.symbol);

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
    };
    // fleshstation colony is always controlled by fleshstation — no bonuses granted here
    if (colony.faction === 'fleshstation') continue;
    const leading = ['coalition','syndicate','void'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition');
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

    for (const [sym, qty] of Object.entries(actor.holdings || {})) {
      if (!qty || qty <= 0) continue;
      const c = companies.find(x => x.symbol === sym);
      if (!c) continue;
      const s = c.sector;
      // Base dividend (Finance/Insurance/Energy/Tech)
      if (DIVIDEND_SECTORS.has(s)) {
        const baseRate = DIVIDEND_RATE + (sectorBonus[s] || 0);
        dividend += c.price * qty * baseRate;
      }
      // Faction-specific bonus sectors (Biotech=1, Manufacturing=3, Logistics=5, Misc=7)
      // that aren't in DIVIDEND_SECTORS but have colony bonuses
      else if (sectorBonus[s]) {
        dividend += c.price * qty * sectorBonus[s];
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

// ─── REST: Auth ───────────────────────────────────────────────────────────────

app.post('/api/register',(req,res)=>{
  try{
    const {name,password}=req.body||{};
    if(!name||!name.trim()) return res.status(400).json({ok:false,error:'name_required'});
    if(!password||password.length<4) return res.status(400).json({ok:false,error:'password_too_short'});
    const trimmed=name.trim().slice(0,32);
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
    res.json({ok:true,token:player.id,name:player.name,cash:player.cash,xp:player.xp,level:player.level,title:player.title,faction:player.faction||null,patreon_tier:player.patreon_tier||0,is_dev:!!(isDevAccount(player.id)),is_admin:!!(isAdminAccount(player.id)),is_prime:!!(isOwnerAccount(player.id)),void_locked:!!(isVoidLocked(player.id))});
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
  res.json({ok:true,id:p.id,name:p.name,cash:p.cash,holdings:p.holdings,xp:p.xp,level:p.level,title:p.title,faction:p.faction||null,patreon_tier:p.patreon_tier||0,is_dev:!!(isDevAccount(p.id)),is_admin:!!(isAdminAccount(p.id)),is_dunced:!!(isDunced(p.id)),is_prime:!!(isOwnerAccount(p.id)),void_locked:!!(isVoidLocked(p.id))});
});

app.post('/api/rename',(req,res)=>{
  try{
    const tok=tokenFrom(req);
    const p=tok?getPlayer(tok):null;
    if(!p) return res.status(401).json({ok:false,error:'unauthorized'});
    const name=String(req.body?.name||req.query.name||'').trim().slice(0,32);
    if(!name) return res.status(400).json({ok:false,error:'invalid_name'});
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
    const email   = body?.included?.find(i=>i.type==='user')?.attributes?.email || null;
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
      const expiresAt = Date.now() + 40*24*60*60*1000; // 40 days — buffer for late Patreon billing
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
    maxMembers: fund.max_members,
    memberCount: members.length,
    savingsRate: fund.savings_rate,
    members: members.map(m=>({
      name:m.name, shares:m.shares, value:m.shares*spp,
      deposited: m.deposited || 0,
      pct: totalShares>0?(m.shares/totalShares*100).toFixed(1):'0.0',
      patreon_tier:m.patreon_tier,
      isOwner: m.player_id === fund.owner_id,
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
    // For player funds: only the owner can withdraw
    if (fund.type === 'player' && fund.owner_id !== actor.id)
      return res.status(403).json({ ok:false, error:'owner_only_withdraw' });
    const pct = Math.min(1, Math.max(0.01, Number(req.body?.pct)||0));
    const priceMap = buildPriceMap();
    const nav = getFundNAVById(fund.id, priceMap);
    const cashOut = fundWithdrawFn(fund.id, actor.id, pct, nav);
    const snap    = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    try {
      const fresh = getPlayer(actor.id);
      if (fresh) broadcastToPlayer(actor.id, { type:'portfolio', data: snapshotPortfolio(fresh) });
    } catch(_) {}
    res.json({ ok:true, cashOut });
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
    // Withdraw their shares first so they get their money back
    try {
      const priceMap = buildPriceMap();
      const nav = getFundNAVById(fund.id, priceMap);
      fundWithdrawFn(fund.id, target.id, 1.0, nav);
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
    if (fund.owner_id !== actor.id)
      return res.status(403).json({ ok:false, error:'owner_only' });
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
    if (fund.type==='player'  && fund.owner_id !== actor.id) return res.status(403).json({ ok:false, error:'owner_only' });
    if (fund.type==='flsh'    && !isDevAccount(actor.id))    return res.status(403).json({ ok:false, error:'dev_only' });
    if (fund.type==='patreon' && !isGuildEligible(actor))   return res.status(403).json({ ok:false, error:'guild_only' });
    const { side, symbol, qty } = req.body || {};
    if (!['buy','sell'].includes(side)) return res.status(400).json({ ok:false, error:'invalid_side' });
    const sym = String(symbol||'').toUpperCase();
    const c   = companies.find(x => x.symbol === sym && !x._special);
    if (!c) return res.status(400).json({ ok:false, error:'unknown_symbol' });
    const q   = Math.max(1, Math.floor(Number(qty)||0));
    const fundCash = fund.cash;
    const haveQty  = getFundPortfolio(fund.id).find(h=>h.symbol===sym)?.qty || 0;
    if (side==='buy') {
      const cost = c.price * q;
      if (fundCash < cost) return res.status(400).json({ ok:false, error:'insufficient_fund_cash', have:fundCash, need:cost });
      setFundCashById(fund.id, fundCash - cost);
      setFundPortfolioQty(fund.id, sym, haveQty + q);
      logFundActivity(fund.id,'trade_buy',actor.id,sym,q,c.price,cost,`Buy ${q}× ${sym} @ Ƒ${c.price.toFixed(2)}`);
      pushHeadline(`${fund.name}: bought ${q}× ${sym} @ Ƒ${c.price.toFixed(2)}`, 'good', sym);
    } else {
      const sellQty = Math.min(q, haveQty);
      if (sellQty <= 0) return res.status(400).json({ ok:false, error:'no_holdings' });
      const proceeds = c.price * sellQty;
      setFundCashById(fund.id, fundCash + proceeds);
      setFundPortfolioQty(fund.id, sym, haveQty - sellQty);
      logFundActivity(fund.id,'trade_sell',actor.id,sym,sellQty,c.price,proceeds,`Sell ${sellQty}× ${sym} @ Ƒ${c.price.toFixed(2)}`);
      pushHeadline(`${fund.name}: sold ${sellQty}× ${sym} @ Ƒ${c.price.toFixed(2)}`, 'neutral', sym);
    }
    if (fund.type==='flsh') updateFLSHPrice();
    const snap = fundDetailSnapshot(fund.id, actor.id);
    broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
    res.json({ ok:true, fund: snap });
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

      return res.status(403).json({ ok: false, error: 'VOID LOCKED — Your cybernetic conversion is permanent. Only the Merchant Guild can extract you.' });
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
    const VALID = ['coalition','syndicate','void'];
    if (!VALID.includes(factionId)) return res.status(400).json({ ok: false, error: 'invalid_faction' });

    // Deduct cash
    p.cash = Math.round((p.cash - amt) * 100) / 100;
    savePlayer(p);

    // Record funding
    recordFactionFunding(p.id, colonyId, factionId, amt);

    // Adjust control %
    const boost = Math.min(12, Math.max(1, Math.round(amt / 80000)));
    const ctrl = {
      coalition: colony.control_coalition,
      syndicate: colony.control_syndicate,
      void:      colony.control_void,
    };
    ctrl[factionId] = Math.min(95, ctrl[factionId] + boost);
    const others = VALID.filter(f => f !== factionId);
    const half = Math.floor(boost / 2);
    others.forEach((f, i) => {
      ctrl[f] = Math.max(1, ctrl[f] - (i === 0 ? Math.ceil(boost/2) : half));
    });
    // Normalize to 100
    const total = ctrl.coalition + ctrl.syndicate + ctrl.void;
    if (total !== 100) {
      const diff = 100 - total;
      ctrl[factionId] = Math.min(99, ctrl[factionId] + diff);
    }

    // Update tension
    const newTension = Math.min(95, colony.tension + Math.round(boost * 1.8));
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

    res.json({ ok: true, cash: p.cash, colonyId, factionId, boost, newControl: ctrl });
  } catch(e) {
    console.error('[Galaxy] fund error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Dunce: self-redeem (player pays 45% of net worth to escape) ──────────────
app.post('/api/dunce/redeem', (req, res) => {
  try {
    const { token } = req.body || {};
    const p = token ? getPlayer(token) : null;
    if (!p) return res.status(401).json({ ok: false, error: 'not_logged_in' });
    if (!isDunced(p.id)) return res.status(400).json({ ok: false, error: 'not_dunced' });

    const equity = Object.entries(p.holdings||{}).reduce((acc,[sym,qty])=>{
      const co = companies.find(x=>x.symbol===sym); return acc+(co?co.price*Math.abs(qty):0);
    },0);
    const netWorth = p.cash + equity;
    const fine = Math.round(netWorth * 0.45 * 100) / 100;

    if (p.cash < fine) {
      return res.status(400).json({ ok: false, error: 'insufficient_cash', fine, cash: p.cash,
        msg: `You need Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} cash on hand (45% of net worth Ƒ${netWorth.toLocaleString(undefined,{maximumFractionDigits:2})}).` });
    }

    p.cash = Math.round((p.cash - fine) * 100) / 100;
    savePlayer(p);
    clearDunce(p.id);

    // Record net worth after fine
    try {
      recordNetWorth(p.id, p.cash + equity, p.cash, equity);
      broadcastToPlayer(p.id, { type: 'portfolio', data: snapshotPortfolio(p) });
    } catch(_) {}

    broadcastToPlayer(p.id, { type: 'undunced', data: { msg: `You paid Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} and escaped the dunce corner.` } });
    broadcastToAdmins({ type: 'admin_log', data: { action: 'dunce_redeemed', player: p.name, fine } });
    broadcast({ type: 'chat', data: { id: Math.random().toString(36).slice(2), t: Date.now(), user: 'SYSTEM',
      text: `🎓 ${p.name} paid Ƒ${fine.toLocaleString(undefined,{maximumFractionDigits:2})} to escape the dunce corner.`, badge: '🎓', color: '#888', channel: 'global' } });

    res.json({ ok: true, fine, newCash: p.cash });
  } catch(e) {
    console.error('[Dunce] redeem error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ─── Dev Communications ───────────────────────────────────────────────────────
// In-memory store for reports (persisted to DB would be ideal but MVP in-mem)
const bugReports   = []; // { id, text, reporter, ts, upvotes: Set, resolved }
const playerReports= []; // { id, target, reason, reporter, ts, reviewed }
const devRequests  = []; // { id, player, message, ts, handled }
let   devCommsIdSeq = 1;

app.get('/api/comms/bugs', (req, res) => {
  res.json({ ok: true, bugs: bugReports.map(b => ({
    ...b, upvotes: b.upvotes.size, canUpvote: true
  })).sort((a,b) => b.upvotes - a.upvotes) });
});

app.post('/api/comms/bugs/report', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const text = String(req.body?.text || '').slice(0, 500);
  if (!text) return res.status(400).json({ ok: false, error: 'text_required' });
  const bug = { id: devCommsIdSeq++, text, reporter: p.name, ts: Date.now(), upvotes: new Set([p.id]), resolved: false };
  bugReports.unshift(bug);
  if (bugReports.length > 200) bugReports.pop();
  res.json({ ok: true, id: bug.id });
});

app.post('/api/comms/bugs/upvote', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const bug = bugReports.find(b => b.id === Number(req.body?.id));
  if (!bug) return res.status(404).json({ ok: false, error: 'not_found' });
  bug.upvotes.has(p.id) ? bug.upvotes.delete(p.id) : bug.upvotes.add(p.id);
  res.json({ ok: true, upvotes: bug.upvotes.size });
});

app.post('/api/comms/bugs/resolve', requireAdmin, (req, res) => {
  const bug = bugReports.find(b => b.id === Number(req.body?.id));
  if (!bug) return res.status(404).json({ ok: false, error: 'not_found' });
  bug.resolved = !bug.resolved;
  res.json({ ok: true, resolved: bug.resolved });
});

app.get('/api/comms/reports', requireAdmin, (req, res) => {
  res.json({ ok: true, reports: playerReports });
});

app.post('/api/comms/reports/file', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const target = String(req.body?.target || '').slice(0, 60);
  const reason = String(req.body?.reason || '').slice(0, 400);
  if (!target || !reason) return res.status(400).json({ ok: false, error: 'missing_fields' });
  const report = { id: devCommsIdSeq++, target, reason, reporter: p.name, ts: Date.now(), reviewed: false };
  playerReports.unshift(report);
  if (playerReports.length > 500) playerReports.pop();
  broadcastToAdmins({ type: 'player_report', data: { target, reporter: p.name, reason } });
  res.json({ ok: true });
});

app.get('/api/comms/requests', requireAdmin, (req, res) => {
  res.json({ ok: true, requests: devRequests });
});

app.post('/api/comms/requests/submit', requirePlayer, (req, res) => {
  const p = getPlayer(tokenFrom(req));
  const message = String(req.body?.message || '').slice(0, 400);
  if (!message) return res.status(400).json({ ok: false, error: 'message_required' });
  const req2 = { id: devCommsIdSeq++, player: p.name, message, ts: Date.now(), handled: false };
  devRequests.unshift(req2);
  if (devRequests.length > 200) devRequests.pop();
  broadcastToAdmins({ type: 'dev_request', data: { player: p.name, message } });
  res.json({ ok: true });
});

app.post('/api/comms/requests/handle', requireAdmin, (req, res) => {
  const r = devRequests.find(x => x.id === Number(req.body?.id));
  if (!r) return res.status(404).json({ ok: false, error: 'not_found' });
  r.handled = true;
  res.json({ ok: true });
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
      items, equipped: equipped || {}, passiveBonus: passive });
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

// Server-wide admin broadcast message
app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: 'text_required' });
    broadcast({ type: 'admin_broadcast', data: {
      text: String(text).slice(0, 500),
      from: req.admin.name,
      t: Date.now()
    }});
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
app.get('/state',(req,res)=>{res.json({companies:companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price})),headlines:headlines.slice(-30),time:Date.now()});});
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

// ── Chat history ring buffer (30 min window, max 200 msgs) ──────────────────
const CHAT_HISTORY = [];
const CHAT_HISTORY_MS = 30 * 60 * 1000; // 30 minutes
function pushChatHistory(msg) {
  const now = Date.now();
  CHAT_HISTORY.push({ ...msg, _ts: now });
  // Prune messages older than 30 min
  while (CHAT_HISTORY.length && (now - CHAT_HISTORY[0]._ts) > CHAT_HISTORY_MS) {
    CHAT_HISTORY.shift();
  }
  if (CHAT_HISTORY.length > 200) CHAT_HISTORY.shift();
}
function getChatHistory() {
  const cutoff = Date.now() - CHAT_HISTORY_MS;
  return CHAT_HISTORY.filter(m => m._ts >= cutoff);
}

function broadcast(msg){const data=JSON.stringify(msg);wss.clients.forEach(ws=>{if(ws.readyState===1)ws.send(data);});
  // Track chat messages for new-login history
  if (msg.type === 'chat' || msg.type === 'system_message') pushChatHistory(msg);
}

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

function pushHeadline(text,tone,symbol){
  const item={id:uuidv4(),t:Date.now(),text,tone,symbol};
  headlines.push(item); if(headlines.length>200)headlines.shift();
  broadcast({type:'news',data:item});
}

// ─── Headlines ────────────────────────────────────────────────────────────────

const THEMES_GOOD=['beats earnings expectations','announces dividend increase','opens new facility','expands into new market','signs multi-year contract','reports record user growth','launches new product line','receives safety certification','secures strategic partnership','approved for government grant','wins major infrastructure bid'];
const THEMES_BAD=['issues profit warning','faces regulatory probe','exec resignation rattles investors','data breach under investigation','suffers supply-chain disruption','product recall announced','union strike impacts operations','lawsuit filed by competitors','credit downgrade issued'];
const THEMES_WEIRD=['synthetic organ breakthrough','raided by maritime police','blackout from toxic spill','pirate tolls spike on key route','grey-market profits surge','smuggler network rumor denied','unexplained cargo manifest leak','enforcer contract renewed quietly','colony audit delayed indefinitely'];

function genHeadline(){
  const c=pick(companies),r=Math.random();
  const themes=r<0.45?THEMES_GOOD:(r<0.9?THEMES_BAD:THEMES_WEIRD);
  const tone=themes===THEMES_GOOD?'good':(themes===THEMES_BAD?'bad':'neutral');
  if(themes===THEMES_GOOD){c.lnP+=0.02+Math.random()*0.06;c.price=Math.max(0.5,Math.exp(c.lnP));}
  else if(themes===THEMES_BAD){c.lnP-=0.02+Math.random()*0.06;c.price=Math.max(0.5,Math.exp(c.lnP));}
  pushHeadline(`${c.name} (${c.symbol}): ${pick(themes)}`,tone,c.symbol);
}

// ─── Market sim ───────────────────────────────────────────────────────────────

function stepMarket(){
  if (global._marketFrozen) return; // Market halted by admin
  _rollHourIfNeeded(new Date());
  const now=Date.now();

  // ── Sector index step with GARCH-style vol clustering ────────────────────
  for(let s=0;s<SECTORS.length;s++){
    const S=SECTORS[s];
    // Rare sector-wide shock — 0.15% chance per tick, bigger magnitude
    const sectorShock = Math.random()<0.0015 ? randn()*0.05 : 0;
    const eps = randn()*S.sigma + sectorShock;
    // Mean-reversion back toward per-sector target
    const sectorTarget = Math.log(S.target || 30);
    S.lnIndex += S.mu + S.kappa*(sectorTarget - S.lnIndex) + eps;
    // Ceiling: log(200) so sectors have room to move
    S.lnIndex = Math.max(Math.log(3), Math.min(Math.log(200), S.lnIndex));
    // GARCH vol decay
    S.sigma = Math.max(0.006, Math.min(0.09, 0.92*S.sigma + 0.08*Math.abs(eps)));
  }

  companies.forEach(c=>{
    if (c._special) return;
    const S    = SECTORS[c.sector||0];
    const base = S.lnIndex + (c.offset||0);

    // Idiosyncratic shock — fatter tails for real price action
    const u    = Math.random();
    const tail = u < 0.02 ? 2.5 : (u < 0.08 ? 1.5 : 1.0);
    const eps  = randn() * (c.sigma||0.035) * tail;

    // If admin recently set price, use stronger mean-reversion toward admin target
    const kappa = c._adminBias ? 0.002 : (c.kappa||0.025);
    const mu    = c._adminBias
      ? (c._adminBias > 0 ? 0.0002 : -0.0002)
      : Math.min(0.0003, c.mu||0);   // allow slight upward drift

    // Mean-reversion toward sector base
    const target = c._adminBias ? c._adminTargetLnP : base;
    let delta = mu + kappa*(target - c.lnP) + eps;

    // ── ANTI-RUNAWAY GRAVITY ──────────────────────────────────────────────
    // Measure lifetime gain from spawn price
    const spawnLnP   = c._spawnLnP || c.lnP;
    const lifetimeGain = c.lnP - spawnLnP; // in log-space; ln(10)≈2.3 = +900%

    // Graduated gravity: kicks in at +400% (ln≈1.6), softer pull
    if (lifetimeGain > 1.6 && !c._adminBias) {
      const gravityStrength = Math.min(0.08, (lifetimeGain - 1.6) * 0.025);
      delta -= gravityStrength;
    }

    // Emergency brake: if up >1500% from spawn, mean-revert toward spawn+500%
    if (lifetimeGain > 2.77 && !c._adminBias) { // ln(16) ≈ 2.77
      const emergencyTarget = spawnLnP + 1.79; // spawn × 6 (+500%)
      delta += 0.05 * (emergencyTarget - c.lnP);
    }

    c.lnP += delta;

    // Decay admin bias over time (~20 min at 500ms tick = ~2400 ticks)
    if (c._adminBias) {
      c._adminBiasDecay = (c._adminBiasDecay || 2400) - 1;
      if (c._adminBiasDecay <= 0) {
        c.offset = c.lnP - S.lnIndex;
        c._adminBias = 0;
        c._adminTargetLnP = null;
        c._adminBiasDecay = 0;
      }
    }

    // Hard price floor/ceiling: Ƒ0.50 – Ƒ5000
    c.lnP = Math.max(Math.log(0.50), Math.min(Math.log(5000), c.lnP));

    // Vol clustering: wider range, slower decay for sustained moves
    const absEps = Math.abs(eps);
    c.sigma = Math.max(0.012, Math.min(0.14,
      0.92*(c.sigma||0.035) + 0.06*absEps + 0.02*0.035
    ));

    // Rare idiosyncratic event (0.15%/tick), meaningful magnitude
    if(Math.random()<0.0015){
      const eventMag = 0.05 + Math.random()*0.12;  // 5–17% move
      c.lnP += (Math.random()<0.5?1:-1) * eventMag;
      c.lnP = Math.max(Math.log(0.50), Math.min(Math.log(5000), c.lnP));
      c.sigma = Math.min(0.14, c.sigma * 2.2);     // vol spike on event
    }

    const prev=c.price;
    c.price=Math.max(0.50, Math.exp(c.lnP));

    // ── Graduated reversal pressure every +50% above spawn ───────────────
    // Each time price clears another +50% above spawn, 40% chance of downward nudge
    if (!c._trendCheckLnP) c._trendCheckLnP = c._spawnLnP || c.lnP;
    if (c.lnP >= c._trendCheckLnP + 0.405) {  // +50% in log-space (ln(1.5)≈0.405)
      c._trendCheckLnP = c.lnP;
      if (Math.random() < 0.40) {
        const pullback = 0.08 + Math.random() * 0.10; // 8–18% pullback
        c.lnP -= pullback;
        c.sigma = Math.min(0.10, (c.sigma || 0.025) * 1.5);
        c.price = Math.max(0.50, Math.exp(c.lnP));
        console.log(`[GRAVITY] ${c.symbol} @ Ƒ${c.price.toFixed(0)} — +${((Math.exp(c.lnP - (c._spawnLnP||0))-1)*100).toFixed(0)}% pullback triggered`);
      }
    }
    // Reset checkpoint if price drops significantly below it
    if (c.lnP < c._trendCheckLnP - 0.3) c._trendCheckLnP = c.lnP;

    // ── Stock Split at Ƒ5000 ─────────────────────────────────────────────
    if (c.price >= 4999 && !c._splitting) {
      c._splitting = true;
      const SPLIT_RATIO = 1000; // 1 share → 1000 shares at Ƒ5
      c.price = 5;
      c.lnP = Math.log(5);
      c._trendCheckLnP = Math.log(5);
      c._spawnLnP = Math.log(5); // reset gain tracking post-split
      // Adjust all player holdings
      players.forEach(p => {
        if (!p.holdings || !p.holdings[c.symbol]) return;
        const oldQty = p.holdings[c.symbol];
        p.holdings[c.symbol] = oldQty * SPLIT_RATIO;
        // Adjust cost basis per share (same total cost, more shares)
        if (p.basisC && p.basisC[c.symbol]) {
          // basisC is total cents paid — stays the same, shares multiplied
          // no change needed since basisC tracks total cost not per-share
        }
        savePlayer(p);
      });
      broadcast({ type: 'chat_system', data: { text: `📊 STOCK SPLIT: ${c.symbol} hit Ƒ5,000 — splits 1:${SPLIT_RATIO}. All holders now have ${SPLIT_RATIO}× shares at Ƒ5.` }});
      console.log(`[SPLIT] ${c.symbol} — 1:${SPLIT_RATIO} split executed`);
      setTimeout(() => { c._splitting = false; }, 10000);
    }

    // OHLC with realistic intrabar range proportional to vol
    const range = c.price * c.sigma * (0.5 + Math.random());
    const open=prev, close=c.price;
    const high=Math.max(open,close) + range*0.5;
    const low =Math.max(0.10, Math.min(open,close) - range*0.5);
    if(!Array.isArray(c.ohlc))c.ohlc=[];
    c.ohlc.push({t:now,o:open,h:high,l:low,c:close,v:0});
    if(c.ohlc.length>400)c.ohlc.shift();
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
    if (pfd?.faction === 'coalition') {
      const colonies = getAllColonyStates().filter(c => {
        if (c.id === 'flesh_station') return false;
        const ctrl = {coalition:c.control_coalition||0,syndicate:c.control_syndicate||0,void:c.control_void||0};
        return ['coalition','syndicate','void'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition') === 'coalition';
      });
      const coalBonus = colonies.length * 75;
      if (coalBonus > 0) { passiveIncome.coalitionBonus = coalBonus; passiveIncome.total += coalBonus; }
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
  return {
    cash: player.cash, positions, equity, net: player.cash + equity,
    shortExposure, sectorBreakdown: sectorMap,
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
  console.log(`[Leaderboard] Snapshot taken — ${_leaderboardSnapshot.length} players`);
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
    ws.send(JSON.stringify({type:'welcome',data:{id:player.id,name:player.name,cash:player.cash,faction:player.faction||null,is_dunced:isDunced(player.id),dunce_reason:(()=>{try{return getDunceRecord(player.id)?.dunce_reason||'';}catch(_){return '';}})(),is_prime:!!(isOwnerAccount(player.id)),is_dev:!!(isDevAccount(player.id)),is_admin:!!(isAdminAccount(player.id)),void_locked:!!(isVoidLocked(player.id)),tutorial_seen:getTutorialSeen(player.id)}}));
    ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(player)}));
    ws.send(JSON.stringify({type:'president_state',data:{holder:president}}));
    // Send last 30min of chat history to new connection
    const hist = getChatHistory();
    if (hist.length) ws.send(JSON.stringify({type:'chat_history',data:{messages:hist}}));
    // Send open limit orders on connect
    ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(player.id)}));
    // Auto-enroll dev/admin accounts into guild on connect
    if (isDevAccount(player.id) || isAdminAccount(player.id)) {
      try { syncFundMembership(); } catch(_) {}
    }
  }else{
    ws.send(JSON.stringify({type:'welcome',data:{id:null,name:'Guest',cash:START_CASH}}));
  }

  ws.send(JSON.stringify({type:'init',data:{companies:companies.map(c=>({id:c.id,name:c.name,symbol:c.symbol,price:c.price,sector:c.sector,hq:c.hq||null})).sort((a,b)=>a.name.localeCompare(b.name)),headlines:headlines.slice(-30),leaderboard:_leaderboardSnapshot||getLeaderboard(companies)}}));

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

      // Day-trade gate — server-authoritative
      if(_dtRemaining(actor.id) <= 0){
        ws.send(JSON.stringify({type:'error',data:{msg:'❌ Day-trade limit reached (3 per cycle). Resets at next EOD.'}}));
        ws.send(JSON.stringify({type:'dt_update',data:{dayTradesRemaining:0}}));
        return;
      }

      if(side==='buy'){
        const costC=toCents(c.price)*qty,taxC=Math.floor(costC*TRADE_TAX_BPS/10000),totalC=costC+taxC,total=fromCents(totalC);
        if(actor.cash>=total){
          safeAddCash(actor,-total);FMI.treasury+=(taxC/100);FMI.hourlyTaxAccrual+=(taxC/100);
          actor.holdings=actor.holdings||{};
          actor.holdings[s]=(actor.holdings[s]||0)+qty;
          actor.basisC=actor.basisC||{};actor.basisC[s]=(actor.basisC[s]||0)+costC;
          actor.xp += Math.max(3, Math.min(50, Math.floor(fromCents(costC) / 20)));
          try{addFundCash('FLSH', fromCents(costC)*FLSH_TRADE_PCT);}catch(_){}
          // Day-trade: issue buy ticket (covering a short = round trip)
          { const dt=_dtGet(actor.id); if(dt.shortTickets[s]>0){dt.shortTickets[s]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);} else {dt.tickets[s]=(dt.tickets[s]||0)+1;} }
          broadcastTradeFeed({side:'buy',symbol:s,qty,price:c.price});
                }
      } else if(side==='sell'){
        const have=actor.holdings?.[s]||0;
        if(have>=qty){
          actor.holdings[s]=have-qty;
          if(actor.holdings[s]<=0)delete actor.holdings[s];
          const grossC=toCents(c.price)*qty,taxC=Math.floor(grossC*TRADE_TAX_BPS/10000);
          safeAddCash(actor,fromCents(grossC-taxC));FMI.treasury+=(taxC/100);FMI.hourlyTaxAccrual+=(taxC/100);
          try{addFundCash('FLSH', fromCents(grossC)*FLSH_TRADE_PCT);}catch(_){}
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
          { const dt=_dtGet(actor.id); if(dt.tickets[s]>0){dt.tickets[s]--;dt.roundTrips=Math.min(DAY_TRADE_CAP,dt.roundTrips+1);} }
          broadcastTradeFeed({side:'sell',symbol:s,qty,price:c.price});
            } else if(qty>0) {
          // SHORT SELL — sell more than owned
          const shortQty = qty - Math.max(0, have);
          const curShort = Math.abs(Math.min(0, have)); // existing short shares
          const newTotalShort = curShort + shortQty;

          // Guard: max short per symbol
          if (newTotalShort > MAX_SHORT_PER_SYM) {
            ws.send(JSON.stringify({type:'error',data:{msg:`Short cap exceeded. Max ${MAX_SHORT_PER_SYM} shares short per symbol.`}}));
            return;
          }
          // Guard: margin requirement — need 50% of short value in cash
          const shortValue = c.price * shortQty;
          const marginNeeded = shortValue * SHORT_MARGIN_RATE;
          if (actor.cash < marginNeeded) {
            ws.send(JSON.stringify({type:'error',data:{msg:`Insufficient margin. Need Ƒ${marginNeeded.toFixed(2)} collateral for this short.`}}));
            return;
          }
          // Clear long position first
          if(have>0){
            const grossC=toCents(c.price)*have,taxC=Math.floor(grossC*TRADE_TAX_BPS/10000);
            safeAddCash(actor,fromCents(grossC-taxC));FMI.treasury+=(taxC/100);
            actor.basisC=actor.basisC||{};delete actor.basisC[s];
          }
          // Enter short position
          actor.holdings=actor.holdings||{};
          actor.holdings[s]=(actor.holdings[s]||0) - shortQty;
          // Credit proceeds for shorted shares
          const shortGrossC=toCents(c.price)*shortQty,shortTaxC=Math.floor(shortGrossC*TRADE_TAX_BPS/10000);
          safeAddCash(actor,fromCents(shortGrossC-shortTaxC));FMI.treasury+=(shortTaxC/100);
          // Track avg short entry price in basisC (stored as negative to flag short)
          actor.basisC=actor.basisC||{};
          actor.basisC[s]=(actor.basisC[s]||0) - toCents(c.price)*shortQty;
          actor.xp+=3;
          // Day-trade: opening short issues a short ticket
          { const dt=_dtGet(actor.id); dt.shortTickets[s]=(dt.shortTickets[s]||0)+1; }
          broadcastTradeFeed({side:'sell',symbol:s,qty,price:c.price});
                }
      }

      actor.level=calcLevel(actor.xp);
      savePlayer(actor);
      // Send day-trade remaining after every trade
      ws.send(JSON.stringify({type:'dt_update',data:{dayTradesRemaining:_dtRemaining(actor.id)}}));
      try{
        const equity=Object.entries(actor.holdings||{}).reduce((acc,[sym,qty])=>{const co=companies.find(x=>x.symbol===sym);return acc+(co?co.price*Math.abs(qty):0);},0);
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
        1: ['Marked Subscriber','Premium Wage Slave'],
        2: ['Officer of the Guild','Merchant of the 7th Ward'],
        3: ['Corporate Apex Predator','Sovereign of the Ledger'],
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
        pushHeadline(`⬡ ${president.name} REMOVED FROM OFFICE — ${actor.name} SEIZES THE PRESIDENCY`, 'bad', null);
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
        if (!c._special) { c.lnP += 0.04 * (0.5 + Math.random()); c.price = Math.max(0.5, Math.exp(c.lnP)); }
      }
      pushHeadline(`⬡ ${actor.name} ELECTED PRESIDENT OF THE COALITION — MARKETS SURGE`, 'good', null);
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

    // ── Transfer ─────────────────────────────────────────────────────────────
    if(msg.type==='transfer'){
      const{toName,amount}=msg;
      const amt=Math.max(1,Math.floor(Number(amount)||0));
      if(!toName||!amt)return;
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
      // Update sender portfolio
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      const feeNote=guildTax>0?` (Ƒ${baseFee.toLocaleString()} tax + Ƒ${guildTax.toLocaleString()} Guild surcharge)`:baseFee>0?` (Ƒ${baseFee.toLocaleString()} tax sink)`:' (no fee — CEO tier)';
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
    if(msg.type==='chart'){const s=String(msg.symbol||'').toUpperCase(),c=companies.find(x=>x.symbol===s);if(c)ws.send(JSON.stringify({type:'chart',data:{symbol:s,ohlc:c.ohlc.slice(-200)}}));}

    // ── Request state ─────────────────────────────────────────────────────────
    if(msg.type==='request_state'){
      ws.send(JSON.stringify({type:'portfolio',data:snapshotPortfolio(actor)}));
      ws.send(JSON.stringify({type:'leaderboard',data:_leaderboardSnapshot||getLeaderboard(companies)}));
      ws.send(JSON.stringify({type:'orders',data:getPlayerOrders(playerId)}));
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
        ack(`✓ ${sym} drifting toward Ƒ${price.toFixed(2)} (currently Ƒ${oldPrice.toFixed(2)}) — chart will show natural movement over ~40s`);
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
        pushHeadline(`[GOD EVENT] ${label} — all tickers affected (${(pct*100).toFixed(1)}%)`, direction === 'pump' ? 'good' : 'bad', null);
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
        if (c && tone === 'good')    { c.lnP += 0.02 + Math.random() * 0.04; c.price = Math.max(0.5, Math.exp(c.lnP)); }
        else if (c && tone === 'bad'){ c.lnP -= 0.02 + Math.random() * 0.04; c.price = Math.max(0.5, Math.exp(c.lnP)); }
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

      // ── god_broadcast: styled broadcast with GOD badge ────────────────────
      else if (cmd === 'god_broadcast') {
        const text = String(msg.text || '').trim().slice(0, 500);
        if (!text) return err('Text required.');
        broadcast({ type: 'admin_broadcast', data: { text, from: `⚡ ${actor.name}`, t: Date.now(), is_god: true } });
        ack(`✓ God broadcast sent.`);
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
          ack('✓ Market frozen — no tick or trading until unfreeze.');
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
        ack(`✓ Transfer tax set to ${bps}bps (${(bps/100).toFixed(2)}%) — effective immediately`);
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
        const coalition = Math.max(0, Math.min(100, Number(msg.coalition) || 0));
        const syndicate = Math.max(0, Math.min(100, Number(msg.syndicate) || 0));
        const voidCtrl  = Math.max(0, Math.min(100, Number(msg.void) || 0));
        try {
          const current = getColonyState(colonyId) || {};
          const contested = syndicate > 10 || voidCtrl > 10 || (coalition < 80 && (syndicate + voidCtrl) > 20);
          updateColonyState(colonyId, { ...current, id: colonyId,
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
          updateColonyState(colonyId, { ...current, id: colonyId, tension, contested: tension > 50 });
          broadcast({ type: 'colony_update', data: { id: colonyId, tension, contested: tension > 50 } });
          ack(`✓ ${colonyId} tension → ${tension}%`);
        } catch(e) { err('Colony update failed: ' + e.message); }
      }

      // ── reset_colony: reset faction control for a colony ─────────────────
      else if (cmd === 'reset_colony') {
        const colonyId = String(msg.colony || '').toLowerCase().replace(/ /g,'_');
        try {
          updateColonyState(colonyId, { id: colonyId, control_coalition: 0, control_syndicate: 0, control_void: 0, coalition: 0, contested: false, tension: 0, war_chest: 0 });
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
          badge:'🎓',color:'#ff4444',channel:'dunce',title:actor.title||null,is_dunced:true}};
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
      else if (_isEscaped) {
        const pFaction = getPlayerFaction(actor.id);
        chatColor = pFaction === 'syndicate' ? '#e74c3c' : null;
      }
      else if (_isCyborg) chatColor = actor.patreon_tier === 2 ? '#2ecc71' : '#9b59b6';
      else chatColor = tier?.chatColor || null;
      const chatText = channel==='unmod' ? rawText : text;
      // For all channels (except dunce), include room number (1-15) for multi-room support
      const chatRoom = channel !== 'dunce' ? Math.min(5, Math.max(1, parseInt(msg.room) || 1)) : undefined;
      const payload={type:'chat',data:{id:uuidv4(),t:Date.now(),user:actor.name,text:chatText,badge:chatBadge,color:chatColor,channel,title:actor.title||null,is_dev:_isDev,is_prime:_isOwner,...(chatRoom !== undefined && {room:chatRoom})}};
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
      if (!from || !to || !cargoId || !stake) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Missing fields' })); return; }
      if (activeSmuggling.has(actor.id)) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Run already in progress' })); return; }
      const lastRun = _lastSmuggle.get(actor.id) || 0;
      if (Date.now() - lastRun < SMUGGLE_COOLDOWN_MS) {
        const remaining = Math.ceil((SMUGGLE_COOLDOWN_MS - (Date.now() - lastRun)) / 1000);
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        ws.send(JSON.stringify({ type:'smuggling_error', error:`Cooldown active — ${mins}m ${secs}s remaining` }));
        return;
      }
      const lane = findLane(from, to);
      if (!lane) { ws.send(JSON.stringify({ type:'smuggling_error', error:'No lane exists' })); return; }
      const cargo = CARGO_TYPES.find(c => c.id === cargoId);
      if (!cargo) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Unknown cargo' })); return; }
      const amt = Math.max(100, Math.min(10_000_000, Math.round(Number(stake) * 100) / 100));
      if (!Number.isFinite(amt)) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Invalid stake amount' })); return; }
      if (actor.cash < amt) { ws.send(JSON.stringify({ type:'smuggling_error', error:'Insufficient funds' })); return; }
      // Deduct stake
      actor.cash = Math.round((actor.cash - amt) * 100) / 100;
      savePlayer(actor);
      const laneRisk = LANE_RISK[lane.type] || LANE_RISK.grey;
      const durMs = laneRisk.durSec * 1000;
      const resolveTs = Date.now() + durMs;
      activeSmuggling.set(actor.id, { from, to, cargoId, stake: amt, laneType: lane.type, startTs: Date.now(), resolveTs });
      _lastSmuggle.set(actor.id, Date.now());
      // Set timer
      setTimeout(() => resolveSmuggling(actor.id), durMs);
      ws.send(JSON.stringify({ type:'smuggling_started', data: { from, to, cargo: cargo.name, stake: amt, laneType: lane.type, resolveTs, durSec: laneRisk.durSec, cash: actor.cash } }));
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

// Reset prevClose at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) resetDailyPrevClose();
}, 60_000);

// Passive income every 30 minutes
setInterval(()=>{
  try{
    // Reset day-trade counters for all players at each 30-min cycle
    _dtResetAll();
    broadcast({type:'dt_update',data:{dayTradesRemaining:DAY_TRADE_CAP}});

    const result=creditPassiveIncome(new Set(playerSockets.keys()));
    const {count, payouts, guildMemberCount} = result;

    // ── Coalition colony control bonus (flat per controlled colony) ─────────
    let colonyStates = [];
    let playerFactions = {};
    try { colonyStates = getAllColonyStates(); } catch(_) {}
    try { playerFactions = getPlayerFactionsBulk(); } catch(_) {}

    // Count Coalition-controlled colonies for passive bonus
    const coalitionColonies = colonyStates.filter(c => {
      if (c.id === 'flesh_station') return false;
      const ctrl = {coalition:c.control_coalition||0,syndicate:c.control_syndicate||0,void:c.control_void||0};
      const leading = ['coalition','syndicate','void'].reduce((b,f)=>ctrl[f]>ctrl[b]?f:b,'coalition');
      return leading === 'coalition';
    });
    const COALITION_COLONY_BONUS = 75; // Ƒ per controlled colony per 30min

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

        // Coalition colony control bonus
        let coalBonus = 0;
        if (playerFactions[payout.id]?.faction === 'coalition' && coalitionColonies.length > 0) {
          coalBonus = coalitionColonies.length * COALITION_COLONY_BONUS;
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
            return ['coalition','syndicate','void'].reduce((b,f) => ctrl[f] > ctrl[b] ? f : b, 'coalition');
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
          incomeText = `⚡ Dev passive: +Ƒ${payout.total.toLocaleString()} — FLSH Capital dividend`;
        } else if (coalBonus > 0) {
          incomeText = `+Ƒ${payout.total} passive  ·  +Ƒ${coalBonus} Coalition colony control (${coalitionColonies.length} colony)`;
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

    // ── Guild fund profit distribution (player funds only) ───────────────────
    // Every 30min, distribute 10% of fund savings interest proportionally to members
    try {
      const priceMap = buildPriceMap();
      for (const fund of getAllFunds()) {
        if (fund.type !== 'player') continue;
        const nav = getFundNAVById(fund.id, priceMap);
        if (nav <= 0) continue;
        const totalShares = getTotalFundSharesById(fund.id);
        if (totalShares <= 0) continue;
        // Distribute a small fraction of NAV (0.01% every 30min = ~0.48%/day) to members
        const DIST_RATE = 0.0001; // 0.01% of NAV every 30min
        const totalDist = Math.round(nav * DIST_RATE * 100) / 100;
        if (totalDist < 0.01) continue;
        // Only distribute if fund has enough cash
        const fundCash = getFundCashById(fund.id);
        if (fundCash < totalDist) continue;
        setFundCashById(fund.id, fundCash - totalDist);
        const members = getFundMemberships(fund.id);
        for (const m of members) {
          if (!m.shares || m.shares <= 0) continue;
          // Only credit online players — no offline accumulation
          if (!playerSockets.has(m.player_id)) continue;
          const share = m.shares / totalShares;
          const payout_amt = Math.round(totalDist * share * 100) / 100;
          if (payout_amt < 0.01) continue;
          const mp = getPlayer(m.player_id); if (!mp) continue;
          mp.cash = Math.round((mp.cash + payout_amt) * 100) / 100;
          savePlayerFn(mp);
          const mSockets = playerSockets.get(m.player_id);
          if (mSockets && mSockets.size > 0) {
            const msg = JSON.stringify({ type:'income', data:{ base:payout_amt, bonus:0, total:payout_amt, text:`+Ƒ${payout_amt} guild fund share (${fund.name})` }});
            for (const ws of mSockets) { try { if(ws.readyState===1) ws.send(msg); } catch(_) {} }
          }
        }
        logFundActivity(fund.id, 'distribution', null, null, null, null, totalDist, `30-min profit share distributed to ${members.length} members`);
        const snap = fundDetailSnapshot(fund.id, null);
        broadcastToFundMembers(fund.id, { type:'fund_update', data:{ fundId:fund.id, ...snap }});
      }
    } catch(e) { console.error('[Guild dist error]', e); }

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
}, INCOME_INTERVAL_MS);

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

// Fund savings interest — hourly
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

// ─── Galaxy: Hourly tension tick + conquest resolution ────────────────────────
function runGalaxyTick() {
  try {
    const colonies = getAllColonyStates();
    const now = Date.now();
    for (const c of colonies) {
      const ctrl = { coalition: c.control_coalition, syndicate: c.control_syndicate, void: c.control_void };
      const leading = ['coalition','syndicate','void'].reduce((best, f) => ctrl[f] > ctrl[best] ? f : best, 'coalition');
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
        const FACTION_NAMES = { coalition:'Coalition', syndicate:'Syndicate', void:'Void Collective', fleshstation:'Flesh Station' };
        const cName = COLONY_NAMES[c.id] || c.id;
        const fName = FACTION_NAMES[newFaction] || newFaction;
        const oldName = FACTION_NAMES[oldFaction] || oldFaction;
        const headline = `${fName} seizes ${cName} from ${oldName} — power shifts in the outer sectors`;
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
      pushHeadline(`⚠ CONQUEST VOID: ${totalVoided} lane shares destroyed — ${cName} colony seized, all connected lane contracts voided`, 'bad', '💀');
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
  console.log(`║  Flesh Market v5.0  — port ${PORT}      ║`);
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
