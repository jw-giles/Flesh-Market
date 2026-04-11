
// ════════════════════════════════════════════════════════════
//  GALAXY MAP  —  Patch I  (Planets, FleshStation, Passives)
// ════════════════════════════════════════════════════════════
(function(){
'use strict';

// ── Factions ──────────────────────────────────────────────────────────────────
var FACTIONS = {
  coalition:{
    id:'coalition', name:'The Coalition', short:'COALITION', color:'#4ecdc4', dim:'#1a4f4d', bg:'#061a1a', sym:'◇', devOnly:false,
    desc:'The legitimate face of interstellar commerce. Coalition colonies enforce corporate law and pay dividends on schedule.',
    bonusSummary:'Colony dividend bonuses: Finance, Insurance &amp; Tech sectors + ƒ15/colony passive income',
  },
  syndicate:{
    id:'syndicate', name:'The Syndicate', short:'SYNDICATE', color:'#e74c3c', dim:'#4d1a1a', bg:'#1a0606', sym:'◈', devOnly:false,
    desc:'A distributed criminal network. No inspections, no tariffs — just a cut of every deal passing through Syndicate space.',
    bonusSummary:'Colony dividend bonuses on controlled territory + ƒ15/colony passive income',
  },
  void:{
    id:'void', name:'The Void Collective', short:'THE VOID', color:'#9b59b6', dim:'#2d1a40', bg:'#0d0617', sym:'◆', devOnly:false,
    desc:"Data-cult anarchists running NullSyndicate relays from uncharted debris fields. Nobody audits them.",
    bonusSummary:'Colony dividend bonuses: Biotech &amp; Energy sectors + ƒ15/colony passive income + permanent +ƒ15 cyborg augment',
  },
  fleshstation:{
    id:'fleshstation', name:'Flesh Station', short:'FLESH STN', color:'#ffd700', dim:'#4d3a00', bg:'#1a1200', sym:'⬡', devOnly:true,
    desc:'An impenetrable megastructure. Home of Mr. Flesh. No faction, no tariffs, no rules.',
    bonusSummary:'⚡ Dev-only: passive income multiplied &amp; all colony data readable in real time',
  },
  guild:{
    id:'guild', name:'Merchant Guild', short:'M.GUILD', color:'#2ecc71', dim:'#0d3320', bg:'#061a0d', sym:'⬢', devOnly:false,
    desc:'The oldest trade network in the settled systems. The Merchant Guild controls inter-colony commerce through tolls, licenses, and selective enforcement. Colonies hate them. Colonies need them.',
    bonusSummary:'⚡ Patreon Only: Trade fee reductions + passive commerce income across all faction territories',
  },
};

// ── Colony Planet Definitions ─────────────────────────────────────────────────
// Each colony (star system) has 1–4 planets.
// Planet bonus describes what it grants when its parent faction controls the colony.
// sectorId matches server SECTOR_NAMES: 0=Finance,1=Biotech,2=Insurance,3=Mfg,4=Energy,5=Logistics,6=Tech,7=Misc
var COLONY_META = {
  new_anchor: {
    name:'New Anchor', x:470, y:154, pop:'12.4B',
    lore:'Coalition administrative capital. Faction representatives maintain offices here; treaties are signed here and enforced elsewhere. Revenue comes from licensing, arbitration fees, and the percentage taken on every regulated transaction in the inner systems.',
    companies:['Anchor Biotech','Anchor International','Nexus Financial','Catalyst Insurance'],
    planets:[
      { name:'Anchor Prime',   sector:0, sectorName:'Finance',   icon:'◉',
        bonus:'Coalition: +1.2% Finance dividends',        contestBonus:'Contested: +0.6%' },
      { name:'Catalyst II',    sector:2, sectorName:'Insurance', icon:'◎',
        bonus:'Coalition: +0.8% Insurance dividends',      contestBonus:'Contested: +0.4%' },
      { name:'Nexus Relay',    sector:6, sectorName:'Tech',      icon:'◌',
        bonus:'Any faction: +0.5% Tech dividends',         contestBonus:'Contested: +0.3%' },
    ],
  },
  cascade_station: {
    name:'Cascade Station', x:780, y:126, pop:'3.1B',
    lore:'Three tidally-locked moons in permanent tidal rotation. No atmosphere worth filtering. Cascade Minerals extracts ore; Vertex Aerospace moves it. Everyone else pays the orbital elevator toll.',
    companies:['Cascade Minerals','Cascade Pharma','Vertex Aerospace','CoalitionMetals'],
    planets:[
      { name:'Cascade Alpha',  sector:3, sectorName:'Manufacturing', icon:'◉',
        bonus:'Coalition: +0.8% Manufacturing dividends',  contestBonus:'Contested: +0.4%' },
      { name:'Ore Deep',       sector:7, sectorName:'Misc',          icon:'◌',
        bonus:'Coalition: +0.4% Misc dividends',           contestBonus:'Contested: +0.2%' },
    ],
  },
  frontier_outpost: {
    name:'Frontier Outpost', x:220, y:266, pop:'890M',
    lore:'Last Coalition-regulated waypoint before open space. All three factions run supply operations through here. None will allow a rival to hold it; the result is a permanent low-level standoff managed through licensed contractors.',
    companies:['Frontier Supplies','HollowLogistics','Lighthouse Logistics','Momentum Logistics'],
    planets:[
      { name:'Waypoint I',     sector:5, sectorName:'Logistics',  icon:'◉',
        bonus:'Coalition: +0.8% | Syndicate: +0.6% Logistics dividends', contestBonus:'Contested: bonus active for leading faction' },
      { name:'Supply Depot',   sector:7, sectorName:'Misc',       icon:'◌',
        bonus:'Syndicate: +0.4% Misc dividends',           contestBonus:'Contested: +0.3%' },
    ],
  },
  the_hollow: {
    name:'The Hollow', x:300, y:476, pop:'1.6B',
    lore:'Dead rock hollowed out by an operation that stopped filing paperwork in year three. HollowLogistics runs the docks and sets the rates. Pirate contractors handle enforcement. Coalition jurisdiction has been attempted twice; both attempts are listed under unsolved incidents.',
    companies:['SmugglerIndustries','SmugglerNetworks','PhantomCourier','NoirTransport','ApexContraband'],
    planets:[
      { name:'Hollow Core',    sector:7, sectorName:'Gray Bazaar', icon:'◉',
        bonus:'Syndicate: +1.5% Misc dividends',           contestBonus:'Contested: +0.8%' },
      { name:"Pirate's Rest",  sector:7, sectorName:'Gray Bazaar', icon:'◌', isStation:true,
        bonus:'Void: +0.6% Misc dividends',                contestBonus:'Contested: +0.3%' },
    ],
  },
  vein_cluster: {
    name:'Vein Cluster', x:650, y:490, pop:'4.8B',
    lore:'Tidally locked. The main moon faces permanent darkness on the inhabited side. VeinConsortium owns the orbital processing ring; what gets refined there does not appear on standard manifests. BloodWorks and OrganCorp both distribute downstream.',
    companies:['VeinConsortium','BloodWorks','GraftBiotech','OrganCorp','BoneMarkets','CarrionFarms'],
    planets:[
      { name:'BloodWorks Stn', sector:1, sectorName:'Biotech',    icon:'◉',
        bonus:'Void: +1.5% | Syndicate: +1.2% Biotech dividends', contestBonus:'Contested: leading faction gets +0.8%' },
      { name:'GraftLab II',    sector:1, sectorName:'Biotech',    icon:'◎',
        bonus:'Coalition: +0.4% Biotech dividends',        contestBonus:'Contested: +0.2%' },
      { name:'Organ Depot',    sector:1, sectorName:'Biotech',    icon:'◌',
        bonus:'Any faction: +0.3% Biotech dividends',      contestBonus:'Contested: +0.2%' },
    ],
  },
  aurora_prime: {
    name:'Aurora Prime', x:820, y:364, pop:'18.3B',
    lore:'Inner-system relay hub. Aurora Electric holds the power grid; Neon Technologies controls the data infrastructure. WraithEnergy operates the fusion plants under a supply agreement Aurora Electric has disputed for eleven years. The Coalition administers the licensing and takes the fees.',
    companies:['Aurora Electric','Neon Technologies','WraithEnergy','Zenith Automation'],
    planets:[
      { name:'Aurora Relay',   sector:6, sectorName:'Tech',       icon:'◉',
        bonus:'Coalition: +1.0% Tech dividends',           contestBonus:'Contested: +0.5%' },
      { name:'Fusion Core',    sector:4, sectorName:'Energy',     icon:'◎',
        bonus:'Coalition: +0.8% | Void: +1.2% Energy dividends',  contestBonus:'Contested: leading gets +0.6%' },
      { name:'Neon Hub',       sector:6, sectorName:'Tech',       icon:'◌',
        bonus:'Void: +0.8% Tech dividends',                contestBonus:'Contested: +0.4%' },
      { name:'WraithGrid',     sector:4, sectorName:'Energy',     icon:'◍',
        bonus:'Void: +1.0% Energy dividends',              contestBonus:'Contested: +0.5%' },
    ],
  },
  null_point: {
    name:'Null Point', x:480, y:560, pop:'420M',
    lore:'Debris field with no Coalition sensor coverage. NullSyndicate operates a data relay network from inside the wreckage. UnderNet and SmugglerNetworks both route traffic through here. No logs are kept. Requests for operational records are not acknowledged.',
    companies:['NullSyndicate','UnderNet','CipherHoldings','ShadowDynamics','GhostFoundry'],
    planets:[
      { name:'The Null',       sector:1, sectorName:'Biotech',    icon:'◉',
        bonus:'Void: +1.2% Biotech dividends',             contestBonus:'Contested: +0.6%' },
      { name:'CipherDeep',     sector:4, sectorName:'Energy',     icon:'◌',
        bonus:'Void: +1.0% Energy dividends',              contestBonus:'Contested: +0.5%' },
    ],
  },
  // ── Abaddon Cluster ──────────────────────────────────────────────────────────
  limbosis: {
    name:'Limbosis', x:295, y:38, pop:'Unknown',
    lore:'The fog never lifts and nobody who understood why ever came back. Limbosis was abandoned after the last Corporate War and the colonists did not leave quietly. What they left behind was a planetary defense grid rated equivalent to Flesh Station. It still runs. Nobody is maintaining it. Any faction that holds Limbosis controls the only weapons platform in the cluster capable of making Abaddon indefensible for everyone else. The relics are not ruins. They are the wreckage of the last four attempts to take this place by force.',
    companies:[],
    planets:[
      { name:'Fog Bastion',    sector:7, sectorName:'Gray Bazaar', icon:'◎',
        bonus:'Any faction: grey-market passive income',        contestBonus:'Contested: +0.5%' },
      { name:'Relic Deep',     sector:7, sectorName:'Gray Bazaar', icon:'◌',
        bonus:'Void: +1.4% Gray Bazaar dividends',             contestBonus:'Contested: +0.7%' },
    ],
  },
  lustandia: {
    name:'Lustandia', x:490, y:100, pop:'22.7B',
    lore:"A beacon of social decadence. A planet this full of hedonism insists upon its own defense, and defends well. Lustandia produces S'weet, a wine exclusive to its borders. Those who have tasted it speak of visions, fulfilled wishes, and abilities that defy explanation. To secure Lustandia is to secure S'weet for trade. It is a vital economy.",
    companies:["S'weet"],
    planets:[
      { name:"S'weet Vineyard",  sector:7, sectorName:'Gray Bazaar', icon:'◉',
        bonus:"Syndicate: +1.8% Gray Bazaar dividends, S'weet trade monopoly", contestBonus:'Contested: +0.9%' },
      { name:'Pleasure Quarter', sector:7, sectorName:'Gray Bazaar', icon:'◌',
        bonus:'Any faction: +1.0% Gray Bazaar dividends',      contestBonus:'Contested: +0.5%' },
    ],
  },
  gluttonis: {
    name:'Gluttonis', x:685, y:38, pop:'8.9B',
    lore:'An eternally dark planet run by material barons. Sixty percent of all rare material refining in the known galaxy is performed here. Without Gluttonis, transport ships across every faction cease to trade. Baron Corps controls the orbital refineries. Whoever holds this planet holds the fuel of the entire galactic economy.',
    companies:['Baron Corps'],
    planets:[
      { name:'Baron Refinery I', sector:3, sectorName:'Iron Foundries', icon:'◉',
        bonus:'Coalition: +1.0% | Syndicate: +1.4% Manufacturing dividends', contestBonus:'Contested: leading gets +0.7%' },
      { name:'Dark Core',        sector:3, sectorName:'Iron Foundries', icon:'◌',
        bonus:'Any faction: +0.8% Manufacturing dividends',    contestBonus:'Contested: +0.4%' },
    ],
  },
  abaddon: {
    name:'Abaddon', x:490, y:22, pop:'SOVEREIGN',
    lore:'Every faction has a different name for what they want here. The Coalition calls it a forward seat of law. The Syndicate calls it a transit tax node. The Void Collective calls it a clean signal zone. All three are telling the truth and none of them are telling all of it. Abaddon without Limbosis is a position with no cover. Holding this system means holding a grid that can threaten anything in range, including the inner systems. The factions understand this. They do not say it aloud because saying it means admitting what kind of war this actually is. Control of this cluster requires all three planets. Lose Limbosis and Abaddon becomes a target, not a throne.',
    companies:[],
    planets:[
      { name:'Greed', sector:7, sectorName:'Gray Bazaar', icon:'♦',
        bonus:'Requires full cluster control (Limbosis + Lustandia + Gluttonis). Grants +Ƒ500 per income cycle to faction members with 30 or more days of continuous allegiance.',
        contestBonus:'Ye who hold sovereign over this place, reign countless worlds who shall forever go unmourned.' },
    ],
  },
  // ── New Frontier Colonies (uncontrolled) ─────────────────────────────────
  eyejog: {
    name:'Eyejog', x:110, y:430, pop:'2.3B',
    lore:'Eyejog is the seat of the Merchant Guild. They rule the red-hazed sky and control from afar with the gifts of imported decadence — drinking and lounging as rivers of money coat their balances daily. You would be a fool to cross their webs of control.',
    companies:['Oak Capital','Oak Ventures','Sycamore Partners','Sycamore Software'],
    planets:[
      { name:'Guild Market',  sector:0, sectorName:'Capital Syndicate', icon:'◉',
        bonus:'Merchant Guild: Trade fee exemptions', contestBonus:'Cannot be contested — Guild sovereign territory' },
      { name:'Sand Exchange', sector:5, sectorName:'Transit Guild',    icon:'◌',
        bonus:'Merchant Guild: +0.6% Logistics dividends', contestBonus:'Cannot be contested' },
    ],
  },
  dust_basin: {
    name:'Dust Basin', x:80, y:590, pop:'610M',
    lore:'Extraction territory at the outer edge of settled space. Three mining consortiums share one orbital elevator and compete for the same ore contracts. Infrastructure maintenance is disputed. Output is not.',
    companies:['Aurora Metals','GreyMining','First Minerals','South Minerals','RogueMinerals'],
    planets:[
      { name:'Crater Base Alpha', sector:3, sectorName:'Iron Foundries', icon:'◉',
        bonus:'Any faction: +0.4% Manufacturing dividends', contestBonus:'Contested: +0.6%' },
      { name:'Ore Platform 7',    sector:3, sectorName:'Iron Foundries', icon:'◌',
        bonus:'Any faction: +0.3% Manufacturing dividends', contestBonus:'Contested: +0.4%' },
    ],
  },
  nova_reach: {
    name:'Nova Reach', x:960, y:460, pop:'310M',
    lore:'Outer-rim research installation. Coalition licensing jurisdiction has not been formally established here; three biotech firms treat this as a feature. Compounds produced here do not appear in licensed pharmaceutical registries.',
    companies:['Nimbus Biotech','North Biotech','Nova Biotech','GreywaterLabs','Willow Labs'],
    planets:[
      { name:'Cryo Station One', sector:1, sectorName:'Flesh & Gene', icon:'◉',
        bonus:'Any faction: +0.5% Biotech dividends', contestBonus:'Contested: +0.7%' },
      { name:'Lab Ring Kappa',   sector:1, sectorName:'Flesh & Gene', icon:'◌',
        bonus:'Any faction: +0.3% Biotech dividends', contestBonus:'Contested: +0.4%' },
    ],
  },
  iron_shelf: {
    name:'Iron Shelf', x:920, y:600, pop:'1.2B',
    lore:'Manufacturing corridor across three barren moons. Primary output: ship components, aerospace parts, weapons systems. Buyers across all three factions; none of them discuss it publicly. North Industries runs the largest facility. Output does not stop during faction conflicts.',
    companies:['Nexus Aerospace','Pioneer Aerospace','River Aerospace','Golden Aerospace','Granite Aerospace','Willow Aerospace'],
    planets:[
      { name:'Forge Station',  sector:3, sectorName:'Iron Foundries', icon:'◉',
        bonus:'Any faction: +0.6% Manufacturing dividends', contestBonus:'Contested: +0.8%' },
      { name:'Drydock Omega',  sector:5, sectorName:'Transit Guild',  icon:'◌',
        bonus:'Any faction: +0.4% Logistics dividends',    contestBonus:'Contested: +0.5%' },
    ],
  },
  the_ledger: {
    name:'The Ledger', x:350, y:650, pop:'6.7B',
    lore:'Financial administration center for the outer systems. Insurance underwriters, venture funds, and realty developers control the local colonial government. Elections are held on schedule. Candidates are approved in advance.',
    companies:['United Insurance','Zenith Insurance','Cedar Insurance','Copper Insurance','Oak Capital','Prairie Financial','Harbor Financial'],
    planets:[
      { name:'Exchange Tier',  sector:0, sectorName:'Capital Syndicate', icon:'◉',
        bonus:'Coalition: +0.8% Finance dividends',        contestBonus:'Contested: +0.5%' },
      { name:'Underwriting Hub',sector:2, sectorName:'Indemnity Brokers',icon:'◎',
        bonus:'Any faction: +0.6% Insurance dividends',    contestBonus:'Contested: +0.4%' },
      { name:'Realty Commons', sector:7, sectorName:'Gray Bazaar',      icon:'◌',
        bonus:'Syndicate: +0.5% Misc dividends',           contestBonus:'Contested: +0.3%' },
    ],
  },
  signal_run: {
    name:'Signal Run', x:720, y:640, pop:'2.8B',
    lore:'Gas giant relay hub on the primary freight corridor between inner and outer systems. Controls the fastest transit lanes in settled space. Holding Signal Run sets the cargo schedule for the outer rim; every faction has tried, none have held it past two elections.',
    companies:['Blue Shipping','Copper Marine','Oak Marine','Vertex Logistics','Vertex Shipping','Summit Logistics','Orion Logistics'],
    planets:[
      { name:'Relay Alpha',   sector:5, sectorName:'Transit Guild',    icon:'◉',
        bonus:'Any faction: +0.7% Logistics dividends',   contestBonus:'Contested: +0.9%' },
      { name:'Depot Ring',    sector:6, sectorName:'Neural Networks',  icon:'◎',
        bonus:'Any faction: +0.4% Tech dividends',         contestBonus:'Contested: +0.5%' },
      { name:'Fuel Platform', sector:4, sectorName:'Power Cartels',    icon:'◌',
        bonus:'Any faction: +0.5% Energy dividends',       contestBonus:'Contested: +0.6%' },
    ],
  },
  scrub_yard: {
    name:'Scrub Yard', x:200, y:790, pop:'180M',
    lore:'Administrative registry for shell companies and holding structures. Seventeen thousand registered entities; combined verified employment is under four hundred. Atmospheric processors have run on expired Coalition permits since the 11th Corporate War. Revenue is financial transit fees. The Coalition has not sent an inspector in six years.',
    companies:['BlackCapital','NightFinance','MireInsurance','SableSecurity','SmugglerMedia'],
    planets:[
      { name:'Shell Block Nine',  sector:0, sectorName:'Finance',  icon:'◉',
        bonus:'Syndicate: +0.8% Finance dividends',     contestBonus:'Contested: +0.5%' },
      { name:'Fog Station Kappa', sector:7, sectorName:'Misc',     icon:'◌',
        bonus:'Any faction: +0.3% Misc dividends',      contestBonus:'Contested: +0.2%' },
    ],
  },
  the_escrow: {
    name:'The Escrow', x:430, y:870, pop:'90M',
    lore:'Deep-ocean data vault colony. Every financial contract in the outer systems has a mirror record stored here; the ocean is three kilometers deep, the servers are deeper. Formally neutral. Has been occupied by four factions; all four declared it neutral when they left. Audits have been requested nine times and denied each time on procedural grounds.',
    companies:['Silver Holdings','SpecterIndustries','OccultMaterials','ApexContraband'],
    planets:[
      { name:'Vault Deep One',    sector:0, sectorName:'Finance',  icon:'◉',
        bonus:'Any faction: +0.6% Finance dividends',   contestBonus:'Contested: +0.8%' },
      { name:'Relay Shelf',       sector:5, sectorName:'Logistics', icon:'◌',
        bonus:'Any faction: +0.3% Logistics dividends', contestBonus:'Contested: +0.4%' },
    ],
  },
  margin_call: {
    name:'Margin Call', x:600, y:800, pop:'240M',
    lore:'Industrial lava world operating as a debt collection and asset liquidation center. When The Ledger calls a debt, physical collateral transfer orders process here. The Syndicate runs enforcement operations on the collection floor. The smelters run continuously. Profitable at all points in the economic cycle.',
    companies:['BoneYards','CrimsonChains','GraveWorks','ObsidianShipping','ToxicChains'],
    planets:[
      { name:'Furnace Deck Alpha', sector:3, sectorName:'Manufacturing', icon:'◉',
        bonus:'Syndicate: +0.9% Manufacturing dividends', contestBonus:'Contested: +0.6%' },
      { name:'Smelter Ring Two',   sector:4, sectorName:'Energy',        icon:'◌',
        bonus:'Syndicate: +0.5% Energy dividends',        contestBonus:'Contested: +0.4%' },
    ],
  },

  flesh_station: {
    name:'Flesh Station', x:600, y:320, pop:'DEV',
    lore:'An impenetrable megastructure. Its defense grid runs laser arrays through an aggressive targeting AI drawing power from several black hole generators. Neutrino mapping software enables infinite-range target acquisition, with an effective strike range of ten to one-hundred light years. No known technology has defeated its defenses. Serves as neutral ground for Diplomats and is the home of Mr. Flesh.',
    companies:['FLSH Capital','Flesh Station'],
    planets:[
      { name:'Flesh Station Alpha', sector:6, sectorName:'Tech', icon:'⬡',
        bonus:'Dev accounts only: ⚡ passive income multiplier', contestBonus:'Cannot be contested' },
    ],
  },
};
window._FM_COLONY_META = COLONY_META;  // exposed for ship manifest system
window._FM_BLOCKADES = {};             // live blockade state from server
window._FM_SHARES = {};               // live share state from server
window._FM_MY_SHARE = null;            // player's current share holding

var LANES=[
  {from:'new_anchor',      to:'cascade_station',  vol:'high',  type:'corporate'},
  {from:'new_anchor',      to:'frontier_outpost', vol:'high',  type:'corporate'},
  {from:'new_anchor',      to:'the_hollow',       vol:'medium',type:'grey'},
  {from:'cascade_station', to:'aurora_prime',     vol:'high',  type:'corporate'},
  {from:'frontier_outpost',to:'the_hollow',       vol:'high',  type:'grey'},
  {from:'frontier_outpost',to:'aurora_prime',     vol:'medium',type:'corporate'},
  {from:'frontier_outpost',to:'vein_cluster',     vol:'medium',type:'contested'},
  {from:'the_hollow',      to:'null_point',       vol:'high',  type:'dark'},
  {from:'vein_cluster',    to:'null_point',       vol:'medium',type:'dark'},
  {from:'vein_cluster',    to:'aurora_prime',     vol:'medium',type:'grey'},
  {from:'aurora_prime',    to:'null_point',       vol:'low',   type:'contested'},
  {from:'flesh_station',   to:'new_anchor',       vol:'low',   type:'dark'},
  {from:'flesh_station',   to:'aurora_prime',     vol:'low',   type:'dark'},
  // Abaddon cluster
  {from:'limbosis',        to:'abaddon',          vol:'medium',type:'contested'},
  {from:'lustandia',       to:'abaddon',          vol:'medium',type:'contested'},
  {from:'gluttonis',       to:'abaddon',          vol:'medium',type:'contested'},
  {from:'abaddon',         to:'new_anchor',       vol:'low',   type:'contested'},
  {from:'abaddon',         to:'cascade_station',  vol:'low',   type:'dark'},
  // New frontier lanes
  {from:'eyejog',          to:'frontier_outpost', vol:'low',   type:'grey'},
  {from:'eyejog',          to:'the_hollow',       vol:'medium',type:'grey'},
  {from:'dust_basin',      to:'eyejog',           vol:'low',   type:'grey'},
  {from:'dust_basin',      to:'null_point',       vol:'low',   type:'grey'},
  {from:'nova_reach',      to:'aurora_prime',     vol:'low',   type:'grey'},
  {from:'nova_reach',      to:'iron_shelf',       vol:'low',   type:'grey'},
  {from:'iron_shelf',      to:'cascade_station',  vol:'low',   type:'grey'},
  {from:'iron_shelf',      to:'signal_run',       vol:'medium',type:'grey'},
  {from:'the_ledger',      to:'null_point',       vol:'low',   type:'grey'},
  {from:'the_ledger',      to:'vein_cluster',     vol:'low',   type:'grey'},
  // The Ledger shadow network lanes
  {from:'dust_basin',      to:'the_ledger',       vol:'medium',type:'grey'},
  {from:'the_ledger',      to:'signal_run',       vol:'medium',type:'corporate'},
  {from:'the_ledger',      to:'scrub_yard',       vol:'high',  type:'dark'},
  {from:'scrub_yard',      to:'the_escrow',       vol:'medium',type:'dark'},
  {from:'the_escrow',      to:'null_point',       vol:'high',  type:'dark'},
  {from:'margin_call',     to:'scrub_yard',       vol:'medium',type:'grey'},
  {from:'margin_call',     to:'signal_run',       vol:'low',   type:'grey'},
  {from:'signal_run',      to:'aurora_prime',     vol:'medium',type:'grey'},
  {from:'signal_run',      to:'vein_cluster',     vol:'low',   type:'grey'},
];
var LANE_COLOR={corporate:'#4ecdc4',grey:'#999',dark:'#9b59b6',contested:'#f39c12'};
window._FM_LANES = LANES;  // exposed for smuggling/blockade/contract panels

// Matches COLONY_BONUSES on server
var SECTOR_BONUS_TABLE = {
  new_anchor:       { coalition:{0:'+1.2%',2:'+0.8%',6:'+0.5%'}, syndicate:{0:'+0.4%'},             void:{6:'+0.5%'}              },
  cascade_station:  { coalition:{3:'+0.8%',7:'+0.4%'},            syndicate:{3:'+0.6%'},             void:{3:'+0.3%'}              },
  frontier_outpost: { coalition:{5:'+0.8%'},                       syndicate:{5:'+0.6%',7:'+0.4%'},  void:{5:'+0.4%'}              },
  the_hollow:       { coalition:{7:'+0.3%'},                       syndicate:{7:'+1.5%'},             void:{7:'+0.6%'}              },
  vein_cluster:     { coalition:{1:'+0.4%'},                       syndicate:{1:'+1.2%'},             void:{1:'+1.5%'}              },
  aurora_prime:     { coalition:{6:'+1.0%',4:'+0.8%'},             syndicate:{4:'+0.6%'},             void:{4:'+1.2%',6:'+0.8%'}    },
  null_point:       { coalition:{},                                 syndicate:{7:'+0.8%'},             void:{1:'+1.2%',4:'+1.0%'}    },
  // Abaddon Cluster
  limbosis:         { coalition:{7:'+0.6%'},                       syndicate:{7:'+1.0%'},             void:{7:'+1.4%'}              },
  lustandia:        { coalition:{7:'+0.6%'},                       syndicate:{7:'+1.8%'},             void:{7:'+1.0%'}              },
  gluttonis:        { coalition:{3:'+1.0%'},                       syndicate:{3:'+1.4%'},             void:{3:'+0.8%'}              },
  abaddon:          { coalition:{},                                 syndicate:{},                      void:{}                       },
  // Frontier colonies
  eyejog:           { coalition:{},                                 syndicate:{0:'+0.6%',5:'+0.4%'},  void:{7:'+0.8%'}              },
  dust_basin:       { coalition:{3:'+0.4%'},                        syndicate:{3:'+0.6%'},             void:{3:'+0.3%'}              },
  nova_reach:       { coalition:{1:'+0.8%'},                        syndicate:{1:'+0.4%'},             void:{1:'+1.0%'}              },
  iron_shelf:       { coalition:{3:'+0.6%',4:'+0.4%'},              syndicate:{3:'+0.8%'},             void:{3:'+0.5%'}              },
  the_ledger:       { coalition:{0:'+1.0%',2:'+0.6%'},              syndicate:{0:'+0.6%'},             void:{0:'+0.4%'}              },
  signal_run:       { coalition:{5:'+0.8%'},                        syndicate:{5:'+1.0%',4:'+0.4%'},  void:{5:'+0.6%'}              },
  // Shadow network colonies
  scrub_yard:       { coalition:{},                                 syndicate:{0:'+0.8%'},             void:{7:'+0.6%',0:'+0.4%'}   },
  the_escrow:       { coalition:{0:'+0.6%'},                        syndicate:{0:'+0.4%'},             void:{5:'+0.8%',0:'+0.6%'}   },
  margin_call:      { coalition:{},                                 syndicate:{3:'+0.9%',4:'+0.5%'},  void:{3:'+0.4%'}              },
};
var SECTOR_NAMES = ['The Capital Syndicate','Flesh & Gene Corps','The Indemnity Brokers','The Iron Foundries','Power Cartels','The Transit Guild','Neural Networks Inc.','The Gray Bazaar'];
// Short aliases used where space is tight (planet tags, sub-headers)
var SECTOR_SHORT  = ['Capital Syn.','Flesh & Gene','Indemnity','Iron Foundries','Power Cartels','Transit Guild','Neural Net.','Gray Bazaar'];
function sectorLoreName(id){ return SECTOR_NAMES[Number(id)] || '?'; }
function sectorShortName(id){ return SECTOR_SHORT[Number(id)] || '?'; }

// Runtime state
// ─── Galaxy Map ───────────────────────────────────────────────────────────────
var gState={}, gSelected=null, gPlayerFaction=null, gToken=null;

// ── Space Assets: Planet Mapping ──────────────────────────────────────────
var COLONY_PLANET = {
  // ── Core systems ────────────────────────────────────────────────────────
  new_anchor:       {folder:'animated/terran_1',       frames:120}, // Coalition capital, Earth-like
  cascade_station:  {folder:'animated/barren_1',       frames:60},  // Three tidally-locked mining moons
  frontier_outpost: {folder:'animated/barren_4',       frames:60},  // Last regulated stop, rocky
  the_hollow:       {folder:'animated/barren_2',       frames:60},  // Dead rock bored out by pirates
  vein_cluster:     {folder:'animated/barren_3',       frames:60},  // Tidally locked grey moon — permanent night side faces viewer
  aurora_prime:     {folder:'animated/gas_giant_3',    frames:60},  // Gas giant relay/fusion hub
  null_point:       {folder:'animated/tundra_2',       frames:60},  // Cold debris field data haven
  // ── Abaddon cluster ─────────────────────────────────────────────────────
  limbosis:         {folder:'animated/tundra_1',       frames:60},  // Fog-covered, abandoned, frozen
  lustandia:        {folder:'animated/forest_clouds_1',frames:120}, // Lush hedonist vineyard world
  gluttonis:        {folder:'animated/lava_3',         frames:60},  // Dark industrial refinery world
  abaddon:          {folder:'static/black_hole',       frames:8},   // Black hole sovereign
  flesh_station:    {folder:'static/tech',             frames:12},  // Megastructure
  // ── Frontier colonies ───────────────────────────────────────────────────
  eyejog:           {folder:'animated/desert_2',       frames:60},  // Guild desert world
  dust_basin:       {folder:'animated/desert_1',       frames:60},  // Barren dust/desert extraction
  nova_reach:       {folder:'animated/ocean_no_clouds',frames:60},  // Cold ocean world research labs
  iron_shelf:       {folder:'animated/barren_1',        frames:60},  // Barren manufacturing moons
  the_ledger:       {folder:'animated/terran_no_clouds_1',       frames:60}, // Financial capital, civilized
  signal_run:       {folder:'animated/gas_giant_2',       frames:60},  // Gas giant freight relay hub
  // ── Shadow Network colonies ─────────────────────────────────────────────
  scrub_yard:       {folder:'animated/forest_clouds_2',       frames:120},  // Fog-shrouded shell-company world
  the_escrow:       {folder:'animated/ice',             frames:60},  // Cold deep-ocean data vault world
  margin_call:       {folder:'animated/lava_1',       frames:60},  // Industrial lava smelter world
};

var COLONY_BANNER = {
  // Core systems — landscape matches planet type exactly
  new_anchor:'terran_1',        cascade_station:'barren_1',
  frontier_outpost:'barren_3',  the_hollow:'barren_2',
  vein_cluster:'barren_3',      aurora_prime:'gas_giant_rings_2',
  null_point:'arctic_1',        limbosis:'tundra_1',
  lustandia:'forest_1',         gluttonis:'lava_2',
  abaddon:'space_station_1',    flesh_station:'space_station_2',
  // Frontier — matched to planet type
  iron_shelf:'barren_1',        // barren mining moons ✓
  the_ledger:'terran_1',        // civilized world ✓
  signal_run:'gas_giant_rings_1', // gas giant relay ✓
  eyejog:'desert_2',            // guild desert world ✓
  dust_basin:'desert_1',        // dusty extraction world ✓
  nova_reach:'ocean_1',         // cold ocean research labs ✓
  scrub_yard:'tundra_1',        // fog-shrouded shell-company world ✓
  the_escrow:'arctic_1',         // cold deep-ocean vault world ✓
  margin_call:'lava_2',         // industrial lava smelter world ✓
};

// sector id → 16x16 icon filename (no extension)
var SECTOR_PLANET_ICON = {
  0:'Terran',      // Finance — settled capital world
  1:'Forest2',     // Biotech — organic green world
  2:'Terran2',     // Insurance — stable inhabited world
  3:'Barren4',     // Manufacturing — dark rocky asteroid
  4:'Lava3',       // Energy — orange lava world
  5:'GasGiant4',   // Logistics — pink gas giant relay world
  6:'Tech',        // Tech — orbital station
  7:'Asteroid2',   // Gray Bazaar — neutral blue-grey asteroid/rock
};

// ── Animation state ────────────────────────────────────────────────────────
var gPlanetImgEls = {};   // colonyId -> SVG <image> element on map
var gPlanetAnims  = {};   // colonyId -> setTimeout id
var gDetailAnimT  = null; // setTimeout id for detail panel planet

function spPlanetSrc(colonyId, frame){
  var p = COLONY_PLANET[colonyId]; if(!p) return '';
  return 'assets/space/planets/' + p.folder + '/' + frame + '.png';
}

function spStartMapAnim(id){
  if(gPlanetAnims[id]) return; // already running
  var p = COLONY_PLANET[id]; if(!p) return;
  var frame = 1;
  function tick(){
    var el = gPlanetImgEls[id]; if(!el){ delete gPlanetAnims[id]; return; }
    el.setAttribute('href', spPlanetSrc(id, frame));
    frame = (frame % p.frames) + 1;
    gPlanetAnims[id] = setTimeout(tick, id==='abaddon'?180:id==='flesh_station'?120:80);
  }
  tick();
}

function spStopMapAnim(id){
  if(gPlanetAnims[id]){ clearTimeout(gPlanetAnims[id]); delete gPlanetAnims[id]; }
  var el = gPlanetImgEls[id]; if(!el) return;
  el.setAttribute('href', spPlanetSrc(id, 1));
}

function spClearAllMapAnims(){
  Object.keys(gPlanetAnims).forEach(function(id){ spStopMapAnim(id); });
}

function spStartDetailAnim(colonyId){
  if(gDetailAnimT){ clearTimeout(gDetailAnimT); gDetailAnimT=null; }
  var img = document.getElementById('gDetailPlanetImg'); if(!img) return;
  var p = COLONY_PLANET[colonyId]; if(!p) return;
  img.style.setProperty('--pc', (window.FACTIONS&&window.FACTIONS[window.gPlayerFaction||'coalition']||{}).color||'#4ecdc4');
  var frame = 1;
  function tick(){
    var i = document.getElementById('gDetailPlanetImg'); if(!i){ gDetailAnimT=null; return; }
    i.setAttribute('src', spPlanetSrc(colonyId, frame));
    frame = (frame % p.frames) + 1;
    gDetailAnimT = setTimeout(tick, p.frames===8?180:p.frames===12?120:80);
  }
  tick();
}

// Loading spinner for galaxy fetch
var gSpinTimer = null;
function spShowSpinner(){
  var s=document.getElementById('gLoadSpinner'); if(s) s.setAttribute('opacity','1');
  var img=document.getElementById('gSpinImg'); if(!img) return;
  var frame=1;
  function tick(){
    if(!document.getElementById('gLoadSpinner')) return;
    img.setAttribute('href','assets/space/ui/loading_wheel/loading_whee'+frame+'.png');
    frame=(frame%11)+1;
    gSpinTimer=setTimeout(tick,80);
  }
  tick();
}
function spHideSpinner(){
  if(gSpinTimer){clearTimeout(gSpinTimer);gSpinTimer=null;}
  var s=document.getElementById('gLoadSpinner'); if(s) s.setAttribute('opacity','0');
}
// Fade in nebula
function spFadeNebula(){
  var n=document.getElementById('gNebula'); if(n) n.setAttribute('opacity','0.45');
}


// ════════════════════════════════════════════════════════════════════════════
// SPACE SYSTEM VIEW + SURFACE VIEW ENGINE
// ════════════════════════════════════════════════════════════════════════════

// ── Data Maps ────────────────────────────────────────────────────────────────
var SP_COLONY_SUN = {
  new_anchor:1, cascade_station:8, frontier_outpost:5,
  the_hollow:15, vein_cluster:12, aurora_prime:3,
  null_point:20, limbosis:18, lustandia:6, gluttonis:24,
  abaddon:null, flesh_station:null,
  eyejog:5, dust_basin:8, nova_reach:20,
  iron_shelf:18, the_ledger:1, signal_run:3,
  scrub_yard:15, the_escrow:6, margin_call:12,
};

// sector id → city number (for parallax)
var SP_SECTOR_CITY = {0:2,1:5,2:1,3:6,4:4,5:3,6:7,7:8};

// city → layer files (excludes composite)
var SP_CITY_LAYERS = {
  1:['1.png','2.png','3.png','4.png','5.png','6.png'],
  2:['1.png','2.png','3.png','4.png','5.png','6.png','7.png'],
  3:['1.png','2.png','3.png','4.png','5.png','6.png'],
  4:['1.png','2.png','3.png','4.png','5.png','7.png','8.png'],
  5:['1.png','2.png','3.png','4.png','5.png','6.png'],
  6:['1.png','2.png','3.png','4.png','5.png','6.png','7.png'],
  7:['1.png','2.png','3.png','4.png','5.png','6.png'],
  8:['1.png','2.png','3.png','4.png','5.png','6.png']
};

// colony → landscape image (for planets without city)
var SP_COLONY_LANDSCAPE = {
  new_anchor:'terran_1', cascade_station:'barren_1',
  frontier_outpost:'barren_3', the_hollow:'barren_3',
  vein_cluster:'barren_3', aurora_prime:'gas_giant_1',
  null_point:'arctic_1', limbosis:'tundra_1',
  lustandia:'forest_1', gluttonis:'lava_2',
  abaddon:'space_station_1', flesh_station:'space_station_2'
};

// sector id → planet type (for surface backdrop on non-city planets)
var SP_SECTOR_LANDSCAPE = {
  0:'barren_1',1:'lava_2',2:'barren_2',3:'barren_3',
  4:'lava_1',5:'barren_3',6:'arctic_1',7:'tundra_1'
};

// ── State ────────────────────────────────────────────────────────────────────
var spCurrentColony = null;
var spCurrentPlanetIdx = null;
var spParallaxAnim = null;
var spMouseX = 0, spMouseY = 0;
var spHUDRefreshTimer = null;
var spStarSeeded = false;

// ── Star canvas for system view ───────────────────────────────────────────────
function spSeedSystemStars(){
  if(spStarSeeded) return;
  var canvas = document.getElementById('spStarCanvas');
  if(!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  var ctx = canvas.getContext('2d');
  // Varied star sizes: mostly tiny, some medium, occasional bright
  for(var i=0;i<500;i++){
    var x = Math.random()*canvas.width;
    var y = Math.random()*canvas.height;
    var r = i<400 ? Math.random()*0.9+0.2 : Math.random()*1.8+0.8; // mostly small
    var a = i<400 ? Math.random()*0.5+0.15 : Math.random()*0.6+0.4;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,'+a+')';
    ctx.fill();
  }
  spStarSeeded = true;
}

// ── Open System View ──────────────────────────────────────────────────────────
// Colonies that ARE a single celestial body — no star + orbiting planets
var SP_SINGLE_BODY = {lustandia:1, limbosis:1, gluttonis:1, abaddon:1, flesh_station:1, eyejog:1};
// Station-orbit: large planet + space station orbiting it, zones as module cards
var SP_STATION_ORBIT = {aurora_prime:1, the_hollow:1, vein_cluster:1};
// Which space station image to use per colony
var SP_STATION_IMG = {
  aurora_prime:'assets/space/planets/static/tech/3.png',
  the_hollow:'assets/space/planets/static/tech/11.png',
  vein_cluster:'assets/space/planets/static/tech/10.png'
};

// Background nebula per colony faction feel
var SP_COLONY_BG = {
  // Star-system colonies — varied by sun/planet mood
  new_anchor:'blue.png',          // yellow sun, terran planets → warm blue
  cascade_station:'blue_purple.png', // blue sun, barren moons → cold
  frontier_outpost:'blue_purple.png',// blue sun, dark rocky
  aurora_prime:'blue.png',        // yellow-warm sun, gas giant
  null_point:'blue_purple.png',   // blue-green sun, ice
  nova_reach:'blue.png',          // blue-green sun, ocean world
  the_ledger:'blue.png',          // yellow sun, terran → clean blue
  signal_run:'blue.png',          // yellow sun, gas giant
  iron_shelf:'blue_purple.png',   // green sun, barren
  dust_basin:'blue_purple.png',   // blue sun, barren desert
  // SP_STATION_ORBIT / special
  the_hollow:'purple.png',        // red sun, dead rock
  vein_cluster:'purple.png',      // red sun, grey moon
  // SP_SINGLE_BODY
  lustandia:'blue.png',           // blue sun, lush vineyard
  limbosis:'blue_purple.png',     // dim sun, frozen tundra
  gluttonis:'purple.png',         // dark star, industrial
  abaddon:'purple.png',           // black hole
  flesh_station:'blue_purple.png',// megastructure
  eyejog:'blue_purple.png',       // blue sun, desert
  scrub_yard:'purple.png',        // cold violet star, fog tundra
  the_escrow:'blue_purple.png',   // blue star, cold ocean
  margin_call:'purple.png',       // red star, lava world
  eyejog:'purple.png',          dust_basin:'blue_purple.png',
};


window.spOpenSystem = function(colonyId){
  // Flesh Station is not visitable — no solar system
  if(colonyId === 'flesh_station') return;
  spCurrentColony = colonyId;
  spCurrentPlanetIdx = null;
  var m = COLONY_META[colonyId]; if(!m) return;
  var s = gState[colonyId]||{};
  var fac = getLeadingFaction(s);
  var f = FACTIONS[fac]||FACTIONS.coalition;

  // Reset stars for fresh field each system visit
  spStarSeeded = false;
  spSeedSystemStars();

  var sysView = document.getElementById('spSystemView');
  var bg = SP_COLONY_BG[colonyId] || 'blue_purple.png';
  // Star-system colonies get a deep dark space look; single-body/station get nebula
  // Derive star-system colonies automatically: everything NOT in SP_SINGLE_BODY or SP_STATION_ORBIT
  if(!SP_SINGLE_BODY[colonyId] && !SP_STATION_ORBIT[colonyId]){
    sysView.style.backgroundImage = 'none';
    sysView.style.background = '#000';
  } else {
    sysView.style.backgroundImage = 'url(assets/space/backgrounds/'+bg+')';
    sysView.style.backgroundSize = 'cover';
  }

  var stage = document.getElementById('spSolarStage');
  stage.innerHTML = '';

  if(SP_STATION_ORBIT[colonyId]){
    // ── STATION-ORBIT MODE: large planet + orbiting space station ──────────────
    document.getElementById('spSysBarTitle').textContent = m.name.toUpperCase();
    document.getElementById('spSysBarSub').textContent = 'POP ' + m.pop + ' · STATION COMPLEX';

    var pData = COLONY_PLANET[colonyId];
    var zones  = m.planets || [];
    var f2 = f; // alias for closure

    // Flex layout: planet left, zone cards right
    var layout = document.createElement('div');
    layout.style.cssText = 'display:flex;align-items:flex-start;gap:40px;padding:24px 40px;'
      +'flex-wrap:wrap;justify-content:center;max-width:900px;';

    // --- Sun (top-left corner, atmospheric) ---
    var soSunNum = SP_COLONY_SUN[colonyId];
    var soSunImg = document.createElement('img');
    soSunImg.setAttribute('draggable','false');
    soSunImg.src = soSunNum ? 'assets/space/planets/suns/'+soSunNum+'.png' : 'assets/space/planets/suns/1.png';
    soSunImg.style.cssText='position:absolute;top:20px;left:20px;width:48px;height:48px;image-rendering:pixelated;z-index:1;opacity:0.7;filter:drop-shadow(0 0 10px '+f.color+'88)';
    stage.appendChild(soSunImg);

    // --- Large planet (left) ---
    var pCol = document.createElement('div');
    pCol.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;flex-shrink:0;position:relative;';

    var pSize2 = 140;
    var pImg2 = document.createElement('img');
    pImg2.setAttribute('draggable','false');
    pImg2.style.cssText = 'width:'+pSize2+'px;height:'+pSize2+'px;image-rendering:pixelated;'
      +'filter:drop-shadow(0 0 20px '+f.color+')';
    if(pData){
      pImg2.src = 'assets/space/planets/'+pData.folder+'/1.png';
      var soFrame=1, soTimer=null;
      (function animSO(){
        soTimer=setTimeout(function(){
          soFrame=(soFrame%pData.frames)+1;
          pImg2.src='assets/space/planets/'+pData.folder+'/'+soFrame+'.png';
          animSO();
        }, pData.frames===8?180:pData.frames===12?120:80);
      })();
      sysView._spBodyTimerStop = function(){ clearTimeout(soTimer); };
    } else {
      pImg2.src = 'assets/space/planets/static/tech/1.png';
    }
    pCol.appendChild(pImg2);

    // Space station: orbits the planet image — positioned relative to pCol
    var stnWrap = document.createElement('div');
    stnWrap.style.cssText = 'position:absolute;left:50%;top:'+(pSize2/2)+'px;width:0;height:0;pointer-events:none;z-index:10;';
    var stnArm = document.createElement('div');
    stnArm.style.cssText = 'position:absolute;left:0;top:0;';
    var stnImg = document.createElement('img');
    stnImg.setAttribute('draggable','false');
    var stnSize = 32;
    stnImg.style.cssText = 'position:absolute;width:'+stnSize+'px;height:'+stnSize+'px;'
      +'image-rendering:pixelated;transform:translateX(-'+(stnSize/2)+'px) translateY(-'+(stnSize/2)+'px);'
      +'filter:drop-shadow(0 0 4px #ffffffcc);z-index:inherit;';
    // Use colony-specific station sprite if available, else default tech cycle
    var stnSrc = SP_STATION_IMG[colonyId] || 'assets/space/planets/static/tech/3.png';
    stnImg.src = stnSrc;
    var stnTimer = null; // no frame cycling for static station sprites
    stnArm.appendChild(stnImg);
    stnWrap.appendChild(stnArm);
    pCol.style.position = 'relative';
    pCol.appendChild(stnWrap);
    // rAF orbit — elliptical, tilt 0.38
    var stnAngle=1.2, stnOrbitR=pSize2/2+150, stnTilt=0.38;
    var prevStop2=sysView._spBodyTimerStop;
    sysView._spBodyTimerStop=function(){if(prevStop2)prevStop2();clearTimeout(stnTimer);};
    (function stnOrbitLoop(){
      requestAnimationFrame(function tick(){
        if(!document.getElementById('spSystemView').classList.contains('sp-open')) return;
        stnAngle+=0.018;
        var ox=Math.cos(stnAngle)*stnOrbitR;
        var oy=Math.sin(stnAngle)*stnOrbitR*stnTilt;
        stnArm.style.transform='translate('+ox.toFixed(1)+'px,'+oy.toFixed(1)+'px)';
        stnArm.style.zIndex=oy>0?'12':'2'; // in front when below equator
        requestAnimationFrame(tick);
      });
    })();

    var pName2 = document.createElement('div');
    pName2.style.cssText = 'font-size:.72rem;letter-spacing:.16em;color:'+f.color+';text-align:center';
    pName2.textContent = m.name.toUpperCase();
    pCol.appendChild(pName2);
    layout.appendChild(pCol);

    // --- Zone cards (right) ---
    var zCol = document.createElement('div');
    zCol.style.cssText = 'display:flex;flex-direction:column;gap:10px;min-width:200px;flex:1;max-width:340px;';
    var zHdr = document.createElement('div');
    zHdr.style.cssText = 'font-size:.62rem;letter-spacing:.14em;color:#444;margin-bottom:4px';
    zHdr.textContent = 'STATION MODULES';
    zCol.appendChild(zHdr);

    zones.forEach(function(zone, idx){
      var card = document.createElement('button');
      card.style.cssText = 'background:#07070ecc;border:1px solid '+f2.dim+';color:'+f2.color+';'
        +'padding:10px 14px;cursor:pointer;font-family:inherit;border-radius:4px;'
        +'display:flex;align-items:center;gap:10px;text-align:left;width:100%;'
        +'transition:border-color .15s,background .15s';
      card.onmouseover = function(){ this.style.borderColor=f2.color; this.style.background='#0a0a18cc'; };
      card.onmouseout  = function(){ this.style.borderColor=f2.dim;   this.style.background='#07070ecc'; };

      var zIcon = document.createElement('img');
      zIcon.src = 'assets/space/planets/icons/'+_spIconForSector(zone.sector, colonyId, zone.name);
      zIcon.setAttribute('draggable','false');
      zIcon.style.cssText = 'width:20px;height:20px;image-rendering:pixelated;flex-shrink:0;pointer-events:none';
      card.appendChild(zIcon);

      var zInfo = document.createElement('div');
      zInfo.style.cssText = 'flex:1;pointer-events:none;';
      zInfo.innerHTML = '<div style="font-size:.72rem;letter-spacing:.08em">'+zone.name+'</div>'
        +'<div style="font-size:.62rem;color:#555;margin-top:2px">'+sectorShortName(zone.sector)+'</div>';
      card.appendChild(zInfo);

      var zArrow = document.createElement('div');
      zArrow.style.cssText = 'font-size:.65rem;color:#333;pointer-events:none';
      zArrow.textContent = 'ENTER ›';
      card.appendChild(zArrow);

      (function(i){ card.onclick = function(e){ e.stopPropagation(); spOpenSurface(colonyId, i); }; })(idx);
      zCol.appendChild(card);
    });
    layout.appendChild(zCol);
    stage.appendChild(layout);

  } else if(SP_SINGLE_BODY[colonyId]){
    // ── SINGLE BODY MODE: planet orbits its star, zones in HUD on click ──────
    document.getElementById('spSysBarTitle').textContent = m.name.toUpperCase();
    document.getElementById('spSysBarSub').textContent = 'POP ' + m.pop + ' · ' + m.planets.length + ' ZONE' + (m.planets.length!==1?'S':'');

    var pData = COLONY_PLANET[colonyId];
    var zones = m.planets || [];
    var sbSunNum = SP_COLONY_SUN[colonyId];

    // ── Star (Abaddon/FleshStation get their own center) ──────────────────
    var sbSun = document.createElement('img');
    sbSun.setAttribute('draggable','false');
    if(colonyId==='abaddon'){
      sbSun.style.cssText='position:absolute;width:90px;height:90px;image-rendering:pixelated;z-index:2;filter:drop-shadow(0 0 20px #f39c12)';
      // Cycle black hole
      var bhF=1,bhT=null;
      (function animBH2(){
        sbSun.src='assets/space/planets/static/black_hole/'+bhF+'.png';
        bhT=setTimeout(function(){bhF=(bhF%8)+1;animBH2();},180);
      })();
      sysView._spBodyTimerStop=function(){clearTimeout(bhT);};
    } else if(colonyId==='flesh_station'){
      sbSun.style.cssText='position:absolute;width:90px;height:90px;image-rendering:pixelated;z-index:2;filter:drop-shadow(0 0 20px #ffd700)';
      var fsF=1,fsT=null;
      (function animFS(){
        sbSun.src='assets/space/planets/static/tech/'+fsF+'.png';
        fsT=setTimeout(function(){fsF=(fsF%12)+1;animFS();},120);
      })();
      sysView._spBodyTimerStop=function(){clearTimeout(fsT);};
    } else if(sbSunNum){
      sbSun.style.cssText='position:absolute;width:70px;height:70px;image-rendering:pixelated;z-index:2;filter:drop-shadow(0 0 16px '+f.color+')';
      sbSun.src='assets/space/planets/suns/'+sbSunNum+'.png';
    } else {
      sbSun.style.cssText='position:absolute;width:70px;height:70px;image-rendering:pixelated;z-index:2;filter:drop-shadow(0 0 16px #ffcc44)';
      sbSun.src='assets/space/planets/suns/1.png';
    }
    stage.appendChild(sbSun);

    // ── SVG orbit ellipse ────────────────────────────────────────────────
    var sbSVGNS='http://www.w3.org/2000/svg';
    var sbOSVG=document.createElementNS(sbSVGNS,'svg');
    sbOSVG.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1;width:100%;height:100%;';
    var stW2=stage.offsetWidth||window.innerWidth; var stH2=stage.offsetHeight||(window.innerHeight-40);
    sbOSVG.setAttribute('viewBox','0 0 '+stW2+' '+stH2);
    stage.insertBefore(sbOSVG,stage.firstChild);
    var sbTilt=0.42;
    var sbR=Math.round(stW2*0.30);
    var sbGrp=document.createElementNS(sbSVGNS,'g');
    sbGrp.setAttribute('transform','translate('+(stW2/2)+','+(stH2/2)+')');
    sbOSVG.appendChild(sbGrp);
    var sbEl=document.createElementNS(sbSVGNS,'ellipse');
    sbEl.setAttribute('cx','0');sbEl.setAttribute('cy','0');
    sbEl.setAttribute('rx',String(sbR));sbEl.setAttribute('ry',String(sbR*sbTilt));
    sbEl.setAttribute('fill','none');sbEl.setAttribute('stroke','rgba(255,255,255,0.14)');
    sbEl.setAttribute('stroke-width','1.2');sbGrp.appendChild(sbEl);

    // ── Single planet orbiting ────────────────────────────────────────────
    var sbWrap=document.createElement('div'); sbWrap.className='sp-orbit-wrap';
    var sbArm=document.createElement('div'); sbArm.className='sp-orbit-arm';
    var sbBtn=document.createElement('button'); sbBtn.className='sp-planet-btn';
    sbBtn.style.cssText='position:absolute;transform:translateX(-28px) translateY(-28px);width:56px;height:56px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;padding:0;cursor:pointer;border-radius:50%;';
    var sbPI=document.createElement('img'); sbPI.setAttribute('draggable','false');
    sbPI.style.cssText='width:48px;height:48px;image-rendering:pixelated;pointer-events:none;filter:drop-shadow(0 0 8px '+f.color+'cc)';
    // Animate planet
    if(pData){
      sbPI.src='assets/space/planets/'+pData.folder+'/1.png';
      var sbPF=1,sbPT=null;
      var prevStop=sysView._spBodyTimerStop;
      (function animSBP(){
        sbPF=(sbPF%pData.frames)+1; sbPI.src='assets/space/planets/'+pData.folder+'/'+sbPF+'.png';
        sbPT=setTimeout(animSBP,pData.frames===8?180:pData.frames===12?120:80);
      })();
      sysView._spBodyTimerStop=function(){if(prevStop)prevStop();clearTimeout(sbPT);};
    } else { sbPI.src='assets/space/planets/icons/Barren.png'; }
    sbBtn.appendChild(sbPI);
    // Click planet → open first zone HUD
    sbBtn.onclick=function(e){e.stopPropagation();spOpenSurface(colonyId,0);};
    // Name label
    var sbLbl=document.createElement('div');
    sbLbl.style.cssText='position:absolute;left:0;top:32px;font-size:9px;letter-spacing:.07em;color:'+f.color+';white-space:nowrap;transform:translateX(-50%);pointer-events:none;text-shadow:0 1px 4px #000;font-family:inherit;font-weight:bold';
    sbLbl.textContent=m.name.toUpperCase();
    // Sector badge showing zones count
    var sbBadge=document.createElement('div');
    sbBadge.style.cssText='position:absolute;left:0;top:44px;font-size:8px;padding:1px 4px;border:1px solid rgba(255,255,255,.12);border-radius:2px;color:#666;background:rgba(0,0,0,.65);white-space:nowrap;transform:translateX(-50%);pointer-events:none';
    sbBadge.textContent=zones.length+' ZONE'+(zones.length!==1?'S':'');
    sbArm.appendChild(sbBtn); sbArm.appendChild(sbLbl); sbArm.appendChild(sbBadge);
    sbArm.dataset.orbitR=String(sbR);
    sbArm.dataset.speed='0.00018';
    sbArm.dataset.angle='0.8';
    sbWrap.appendChild(sbArm); stage.appendChild(sbWrap);

    // ── Gluttonis: 4 orbital refineries ──────────────────────────────────────
    if(colonyId === 'gluttonis'){
      var stationAngles = [0.3, 0.3 + Math.PI*0.5, 0.3 + Math.PI, 0.3 + Math.PI*1.5];
      var stationOrbitR = sbR + 20; // slightly outside planet orbit
      var stationAssets = [
        'assets/space/planets/static/tech/3.png',
        'assets/space/planets/static/tech/12.png',
        'assets/space/planets/static/tech/1.png',
        'assets/space/planets/static/tech/5.png',
      ];
      stationAngles.forEach(function(angle, si){
        // Draw orbit ellipse for this station (subtle)
        if(si === 0){
          var stEl = document.createElementNS(sbSVGNS,'ellipse');
          stEl.setAttribute('cx','0'); stEl.setAttribute('cy','0');
          stEl.setAttribute('rx',String(stationOrbitR)); stEl.setAttribute('ry',String(stationOrbitR*sbTilt));
          stEl.setAttribute('fill','none'); stEl.setAttribute('stroke','rgba(255,180,0,0.10)');
          stEl.setAttribute('stroke-width','0.7'); stEl.setAttribute('stroke-dasharray','3 6');
          (typeof sbGrp!=='undefined'?sbGrp:sbOSVG).appendChild(stEl);
        }
        var stWrap = document.createElement('div'); stWrap.className = 'sp-orbit-wrap';
        var stArm  = document.createElement('div'); stArm.className  = 'sp-orbit-arm';
        var stImg  = document.createElement('img');
        stImg.setAttribute('draggable','false');
        stImg.src = stationAssets[si];
        stImg.style.cssText = 'width:8px;height:8px;image-rendering:pixelated;pointer-events:none;'
          + 'filter:drop-shadow(0 0 2px #f39c12) brightness(1.3);position:absolute;'
          + 'transform:translateX(-4px) translateY(-4px);';
        stArm.appendChild(stImg);
        stArm.dataset.orbitR = String(stationOrbitR);
        stArm.dataset.speed  = '0.000095'; // slower than planet
        stArm.dataset.angle  = String(angle);
        stWrap.appendChild(stArm);
        stage.appendChild(stWrap);
      });
    }

    spStartOrbitRAF();

  } else {
    // ── STAR SYSTEM MODE: sun center + orbiting planets ────────────────────────
    document.getElementById('spSysBarTitle').textContent = m.name.toUpperCase();
    document.getElementById('spSysBarSub').textContent = m.planets.length + ' PLANET' + (m.planets.length!==1?'S':'') + ' · POP ' + m.pop;

    var sunNum  = SP_COLONY_SUN[colonyId];
    // Per-colony sun sizes for visual drama
    var SUN_SIZES = {new_anchor:100,the_ledger:96,signal_run:96,cascade_station:80,
      frontier_outpost:80,null_point:72,iron_shelf:72,nova_reach:72,dust_basin:72};
    var sunPx = SUN_SIZES[colonyId] || 80;

    var sun = document.createElement('img');
    sun.id = 'spSunImg';
    sun.setAttribute('draggable','false');
    sun.style.cssText = 'position:absolute;width:'+sunPx+'px;height:'+sunPx+'px;'
      +'image-rendering:pixelated;z-index:2;'
      +'transform:translate(-50%,-50%);left:50%;top:50%;';
    if(sunNum){
      sun.src = 'assets/space/planets/suns/'+sunNum+'.png';
      sun.style.filter = 'drop-shadow(0 0 28px '+f.color+') drop-shadow(0 0 60px '+f.color+'55)';
    } else {
      sun.src = 'assets/space/planets/suns/1.png';
      sun.style.filter = 'drop-shadow(0 0 28px #ffcc44) drop-shadow(0 0 60px #ffcc4433)';
    }
    stage.appendChild(sun);

    // ── Orbit temperature ordering ───────────────────────────────────────────
    var HEAT_RANK = {4:1,3:2,1:3,0:4,2:5,7:6,6:7,5:8};
    var planets = (m.planets || []).slice();
    var sorted = planets.slice().sort(function(a,b){ return (HEAT_RANK[a.sector]||5)-(HEAT_RANK[b.sector]||5); });
    var allStations = planets.every(function(p){ return !!_spIconForZoneName(p.name); });

    // ── Compute orbit radii from actual stage size ───────────────────────────
    var stageW = stage.offsetWidth  || window.innerWidth;
    var stageH = stage.offsetHeight || (window.innerHeight - 40);
    var halfW = stageW / 2;
    var halfH = stageH / 2;
    var tilt = 0.48; // closer to top-down view like reference image
    var maxR = halfW * 0.87; // planets reach near screen edge

    // Sun size for this colony (needed to ensure primaryR clears it)
    var SUN_SIZES2 = {new_anchor:100,the_ledger:96,signal_run:96,cascade_station:80,
      frontier_outpost:80,null_point:72,iron_shelf:72,nova_reach:72,dust_basin:72};
    var sunPx2 = SUN_SIZES2[colonyId] || 80;

    // Per-colony primary orbital distance based on planet type and lore:
    //   dust_basin    = desert_1,  hot inner dust world     → inner (0.28)
    //   new_anchor    = terran_1,  Earth-like goldilocks    → mid   (0.38)
    //   the_ledger    = terran_1,  civilised financial hub  → mid   (0.38)
    //   signal_run    = gas_giant, relay hub mid-corridor   → mid   (0.42)
    //   cascade_station= barren,   tidally-locked Mars-like → outer (0.45)
    //   iron_shelf    = barren,    heavy manufacturing moons→ outer (0.46)
    //   frontier_outpost= barren3, dark rocky last stop     → outer (0.48)
    //   nova_reach    = ocean,     cold fringe research     → far   (0.52)
    //   null_point    = ice,       frozen debris field      → far   (0.62)
    var COLONY_PRIMARY_R = {
      dust_basin:        0.28,
      new_anchor:        0.38,
      the_ledger:        0.38,
      signal_run:        0.42,
      cascade_station:   0.45,
      iron_shelf:        0.46,
      frontier_outpost:  0.48,
      nova_reach:        0.52,
      null_point:        0.62,
      scrub_yard:        0.55,  // tundra, cold outer world
      the_escrow:        0.50,  // cold ocean, outer-mid
      margin_call:       0.32,  // lava, hot inner world
    };
    var primaryFrac = COLONY_PRIMARY_R[colonyId] || 0.38;
    // Always ensure planet clears the sun's visual edge with meaningful gap
    var primaryR2 = Math.max(Math.round(maxR * primaryFrac), Math.round(sunPx2 / 2) + 70);

    // Zone planets: start well beyond primary body, spread to maxR
    // Use log-like spacing to mimic real solar system (inner planets closer together)
    var nZ = planets.length;
    // Zone planets start beyond primary body — gap scales so outer-orbit worlds
    // still get decent spread even when primaryR2 is large (ice/ocean worlds)
    var primaryGap = Math.max(60, Math.round((maxR - primaryR2) * 0.18));
    var innerStart = primaryR2 + primaryGap;
    var outerEnd = maxR * 0.96;
    var span = outerEnd - innerStart;
    var orbitSlots = [];
    for(var si2=0;si2<6;si2++){
      // Logarithmic-ish spacing: 0,1,2,3,4,5 → spread out more toward outer
      var t2 = nZ<=1 ? 0.5 : si2/(Math.max(nZ-1,1)*1.1);
      t2 = Math.min(t2, 1.0);
      orbitSlots.push(Math.round(innerStart + span * Math.min(0.97, (Math.pow(t2+0.15,0.75)))));
    }
    if(allStations) orbitSlots = orbitSlots.map(function(r){ return Math.round(r*1.08); });
    var planetOrbitR = {};
    sorted.forEach(function(p,si){ planetOrbitR[planets.indexOf(p)] = orbitSlots[si]||(innerStart+si*Math.round(span/Math.max(nZ,1))); });

    // ── SVG orbit ring canvas — viewBox matches actual stage pixel size ────────
    var svgNS = 'http://www.w3.org/2000/svg';
    var orbitSVG = document.createElementNS(svgNS,'svg');
    orbitSVG.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:1;width:100%;height:100%;';
    // viewBox centred at (halfW, halfH) = stage centre
    orbitSVG.setAttribute('viewBox','0 0 '+stageW+' '+stageH);
    // All orbits drawn in a group at stage centre
    var orbitG = document.createElementNS(svgNS,'g');
    orbitG.setAttribute('transform','translate('+halfW+','+halfH+')');
    orbitSVG.appendChild(orbitG);

    // Zone planet orbit ellipses
    planets.forEach(function(p,i){
      var r = planetOrbitR[i]||(220+i*110);
      var el=document.createElementNS(svgNS,'ellipse');
      el.setAttribute('cx','0');el.setAttribute('cy','0');
      el.setAttribute('rx',String(r));el.setAttribute('ry',String(r*tilt));
      el.setAttribute('fill','none');el.setAttribute('stroke','rgba(255,255,255,0.14)');
      el.setAttribute('stroke-width','1.2');
      orbitG.appendChild(el);
    });

    // Primary body orbit ellipse
    var primaryPData = COLONY_PLANET[colonyId];
    var primaryR = primaryR2;
    if(primaryPData){
      var pEl=document.createElementNS(svgNS,'ellipse');
      pEl.setAttribute('cx','0');pEl.setAttribute('cy','0');
      pEl.setAttribute('rx',String(primaryR));pEl.setAttribute('ry',String(primaryR*tilt));
      pEl.setAttribute('fill','none');pEl.setAttribute('stroke','rgba(255,255,255,0.08)');
      pEl.setAttribute('stroke-width','0.8');
      orbitG.appendChild(pEl);
    }
    stage.insertBefore(orbitSVG, stage.firstChild);

    // ── Primary colony body ───────────────────────────────────────────────────
    if(primaryPData){
      var pWrap=document.createElement('div'); pWrap.className='sp-orbit-wrap';
      var pArm=document.createElement('div'); pArm.className='sp-orbit-arm';
      var pBtn=document.createElement('button'); pBtn.className='sp-planet-btn';
      var pHit=56;
      pBtn.style.cssText='position:absolute;transform:translateX(-'+(pHit/2)+'px) translateY(-'+(pHit/2)+'px);'
        +'width:'+pHit+'px;height:'+pHit+'px;display:flex;align-items:center;justify-content:center;'
        +'border:none;background:transparent;padding:0;cursor:pointer;border-radius:50%;';
      var pBtnIcon=document.createElement('img');
      pBtnIcon.setAttribute('draggable','false');
      pBtnIcon.style.cssText='width:48px;height:48px;image-rendering:pixelated;pointer-events:none;'
        +'filter:drop-shadow(0 0 8px '+f.color+'dd)';
      var primF=1, primT=null;
      pBtnIcon.src='assets/space/planets/'+primaryPData.folder+'/1.png';
      (function animPrim(){
        primF=(primF%primaryPData.frames)+1;
        pBtnIcon.src='assets/space/planets/'+primaryPData.folder+'/'+primF+'.png';
        primT=setTimeout(animPrim,primaryPData.frames===8?180:primaryPData.frames===12?120:80);
      })();
      var prevPrim=sysView._spBodyTimerStop;
      sysView._spBodyTimerStop=function(){if(prevPrim)prevPrim();clearTimeout(primT);};
      pBtn.appendChild(pBtnIcon);
      pBtn.onclick=function(e){e.stopPropagation();spOpenSurface(colonyId,0);};
      pArm.appendChild(pBtn);
      pArm.dataset.orbitR=String(primaryR);
      pArm.dataset.speed='0.00022';
      pArm.dataset.angle='0.4';
      pWrap.appendChild(pArm); stage.appendChild(pWrap);
    }

    // ── Zone planets ──────────────────────────────────────────────────────────
    planets.forEach(function(p, i){
      var orbitR = planetOrbitR[i]||(220+i*110);
      var wrap=document.createElement('div'); wrap.className='sp-orbit-wrap';
      var arm=document.createElement('div'); arm.className='sp-orbit-arm';

      var hitSize=60;
      var pImg=document.createElement('button'); pImg.className='sp-planet-btn';
      pImg.style.cssText='position:absolute;transform:translateX(-'+(hitSize/2)+'px) translateY(-'+(hitSize/2)+'px);'
        +'width:'+hitSize+'px;height:'+hitSize+'px;display:flex;align-items:center;justify-content:center;'
        +'border:none;background:transparent;padding:0;cursor:pointer;border-radius:50%;';
      var pIcon=document.createElement('img');
      var isStation = !!(p.isStation || _spIconForZoneName(p.name));
      if(isStation){
        pIcon.style.cssText='width:22px;height:22px;image-rendering:pixelated;pointer-events:none;filter:drop-shadow(0 0 5px #ffffffcc)';
        var stF2=1;
        pIcon.src='assets/space/planets/static/tech/1.png';
        (function animStSec(){
          stF2=(stF2%12)+1;
          pIcon.src='assets/space/planets/static/tech/'+stF2+'.png';
          var stT2=setTimeout(animStSec,120);
          var prevSec=sysView._spBodyTimerStop;
          sysView._spBodyTimerStop=function(){if(prevSec)prevSec();clearTimeout(stT2);};
        })();
      } else {
        pIcon.style.cssText='width:36px;height:36px;image-rendering:pixelated;pointer-events:none;filter:drop-shadow(0 0 8px '+f.color+'bb)';
        pIcon.src='assets/space/planets/icons/'+_spIconForSector(p.sector, null, p.name);
      }
      pIcon.setAttribute('draggable','false');
      pImg.appendChild(pIcon);
      (function(idx){ pImg.onclick=function(e){ e.stopPropagation(); spOpenSurface(colonyId,idx); }; })(i);

      var lbl=document.createElement('div');
      lbl.style.cssText='position:absolute;left:0;top:'+(hitSize/2+6)+'px;font-size:10px;letter-spacing:.07em;color:'+f.color
        +';white-space:nowrap;transform:translateX(-50%);pointer-events:none;text-shadow:0 1px 6px #000;font-family:inherit;font-weight:bold';
      lbl.textContent=p.name;

      var heatRank=HEAT_RANK[p.sector]||5;
      arm.dataset.orbitR=String(orbitR);
      arm.dataset.speed=String(0.00032/(heatRank*0.5+0.5));
      arm.dataset.angle=String(i*2.09+0.6);
      arm.appendChild(pImg); arm.appendChild(lbl);
      wrap.appendChild(arm); stage.appendChild(wrap);
    });

    // ── Decorative moons — lore-accurate small bodies orbiting primary ────────
    var MOON_DEF = {
      // Moons orbit near their primary planet — rFracs match primaryFrac ± small offset
      cascade_station: {n:3, icons:['Barren.png','Barren2.png','Asteroid.png'],
        rFracs:[0.40,0.45,0.50], speeds:[0.00009,0.00007,0.00005], angles:[1.0,2.5,4.8]},
      iron_shelf:      {n:3, icons:['Barren.png','Barren2.png','Barren3.png'],
        rFracs:[0.41,0.47,0.53], speeds:[0.00009,0.00006,0.00005], angles:[0.5,2.0,4.2]},
      nova_reach:      {n:2, icons:['Asteroid2.png','Ice.png'],
        rFracs:[0.47,0.53], speeds:[0.00008,0.00005], angles:[1.5,4.0]},
      null_point:      {n:2, icons:['Asteroid3.png','Asteroid4.png'],
        rFracs:[0.56,0.63], speeds:[0.00013,0.00009], angles:[2.0,5.0]},
    };
    var mDef = MOON_DEF[colonyId];
    if(mDef){
      for(var mi=0; mi<mDef.n; mi++){
        var mR = Math.round(maxR * mDef.rFracs[mi]);
        // Draw orbit ellipse for this moon
        var mEl=document.createElementNS(svgNS,'ellipse');
        mEl.setAttribute('cx','0'); mEl.setAttribute('cy','0');
        mEl.setAttribute('rx',String(mR)); mEl.setAttribute('ry',String(mR*tilt));
        mEl.setAttribute('fill','none'); mEl.setAttribute('stroke','rgba(255,255,255,0.06)');
        mEl.setAttribute('stroke-width','0.6'); orbitG.appendChild(mEl);
        // Moon orbit arm
        var mWrap=document.createElement('div'); mWrap.className='sp-orbit-wrap';
        var mArm=document.createElement('div'); mArm.className='sp-orbit-arm';
        var mImg=document.createElement('img');
        mImg.src='assets/space/planets/icons/'+mDef.icons[mi];
        mImg.setAttribute('draggable','false');
        mImg.style.cssText='width:8px;height:8px;image-rendering:pixelated;'
          +'position:absolute;transform:translateX(-4px) translateY(-4px);'
          +'filter:drop-shadow(0 0 2px rgba(200,200,220,0.5));pointer-events:none;';
        mArm.dataset.orbitR=String(mR);
        mArm.dataset.speed=String(mDef.speeds[mi]);
        mArm.dataset.angle=String(mDef.angles[mi]);
        mArm.appendChild(mImg);
        mWrap.appendChild(mArm); stage.appendChild(mWrap);
      }
    }

    spStartOrbitRAF();
  }

  sysView.classList.add('sp-open');
  document.body.style.overflow = 'hidden';
};

// ── rAF orbit driver ─────────────────────────────────────────────────────────
var spOrbitRAF = null;
var spOrbitLastT = null;
function spStartOrbitRAF(){
  if(spOrbitRAF){ cancelAnimationFrame(spOrbitRAF); spOrbitRAF=null; }
  spOrbitLastT = null;
  function tick(t){
    var sysView = document.getElementById('spSystemView');
    if(!sysView || !sysView.classList.contains('sp-open')){ spOrbitRAF=null; return; }
    var dt = spOrbitLastT ? Math.min(t - spOrbitLastT, 50) : 16;
    spOrbitLastT = t;
    sysView.querySelectorAll('.sp-orbit-arm[data-orbit-r]').forEach(function(arm){
      var r     = parseFloat(arm.dataset.orbitR);
      var speed = parseFloat(arm.dataset.speed);
      var angle = parseFloat(arm.dataset.angle) + speed * dt;
      arm.dataset.angle = String(angle);
      var tiltFactor = 0.38;
      var x = Math.cos(angle) * r;
      var y = Math.sin(angle) * r * tiltFactor;
      // Z-depth for layering: planets below center appear in front
      var zDepth = Math.round(50 + y);
      arm.style.zIndex = String(zDepth);
      arm.style.transform = 'translate('+x.toFixed(1)+'px,'+y.toFixed(1)+'px)';
    });
    spOrbitRAF = requestAnimationFrame(tick);
  }
  spOrbitRAF = requestAnimationFrame(tick);
}

// Station keyword list for zone name detection
var SP_STATION_KEYWORDS = ['station','relay','hub','platform','ring','grid','core',
  'array','stn','dock','complex','port','drydock','exchange','relic'];
// Note: removed 'depot','base','forge','cryo','lab','market' — these can be surface zones on planets
function _spIconForZoneName(zoneName){
  if(!zoneName) return null;
  var low = zoneName.toLowerCase();
  for(var ki=0; ki<SP_STATION_KEYWORDS.length; ki++){
    if(low.indexOf(SP_STATION_KEYWORDS[ki])!==-1) return 'Tech.png';
  }
  return null;
}
function _spIconForSector(sector, colonyId, zoneName){
  // Station-orbit colonies: all zones are station modules
  if(colonyId && (SP_STATION_ORBIT[colonyId] || colonyId==='flesh_station')){
    return 'Tech.png';
  }
  // Name-based station detection
  if(zoneName){ var ni=_spIconForZoneName(zoneName); if(ni) return ni; }
  // Sector-based fallback
  // 0=Finance→Terran capital, 1=Biotech→Forest/organic, 2=Insurance→Terran2,
  // 3=Manufacturing→Barren industrial, 4=Energy→Lava, 5=Logistics→Barren2,
  // 6=Tech→Tech2, 7=Gray Bazaar→Tundra
  var map = {0:'Terran',1:'Forest2',2:'Terran2',3:'Barren4',4:'Lava3',5:'GasGiant4',6:'Tech',7:'Asteroid2'};
  return (map[sector]||'Barren')+'.png';
}

function _spPlanetFolderForSector(sector, colonyId){
  var city = SP_SECTOR_CITY[sector];
  return city ? 'cities/city_'+city : null;
}

window.spCloseSystem = function(){
  if(spOrbitRAF){ cancelAnimationFrame(spOrbitRAF); spOrbitRAF=null; }
  var v = document.getElementById('spSystemView');
  if(v && v._spBodyTimerStop){ v._spBodyTimerStop(); v._spBodyTimerStop=null; }
  v.classList.remove('sp-open');
  spCloseSurface();
  document.body.style.overflow = '';
};

// ── Open Surface View ─────────────────────────────────────────────────────────
// ── Planet detail HUD (inline in system view — no surface overlay) ───────────
window.spOpenSurface = function(colonyId, planetIdx){
  spCurrentColony = colonyId;
  spCurrentPlanetIdx = planetIdx;
  var m = COLONY_META[colonyId]; if(!m) return;
  var planet = m.planets[planetIdx]; if(!planet) return;
  var s = gState[colonyId]||{};
  var fac = getLeadingFaction(s);
  var f = FACTIONS[fac]||FACTIONS.coalition;

  // For single-body: show zone selector tabs at top of HUD
  var isBodyCol = SP_SINGLE_BODY[colonyId];
  var hudTitle = document.getElementById('spHUDPlanetName');
  hudTitle.textContent = planet.name.toUpperCase();
  var hudZoneTabs = document.getElementById('spHUDZoneTabs');
  if(hudZoneTabs){
    if(isBodyCol && m.planets.length > 1){
      hudZoneTabs.style.display='flex';
      hudZoneTabs.innerHTML='';
      m.planets.forEach(function(z,zi){
        var tab=document.createElement('button');
        tab.style.cssText='flex:1;background:'+(zi===planetIdx?'#0a0a18':'transparent')+';border:0;border-bottom:1px solid '+(zi===planetIdx?f.color:'#1a1a2e')+';color:'+(zi===planetIdx?f.color:'#555')+';padding:5px 4px;cursor:pointer;font-size:.62rem;font-family:inherit;letter-spacing:.06em';
        tab.textContent=z.name;
        (function(zii){ tab.onclick=function(){spOpenSurface(colonyId,zii);}; })(zi);
        hudZoneTabs.appendChild(tab);
      });
    } else {
      hudZoneTabs.style.display='none';
    }
  }
  // Populate inline system HUD
  document.getElementById('spHUDPlanetName').textContent = planet.name.toUpperCase();
  document.getElementById('spHUDColony').textContent = m.name.toUpperCase() + ' SYSTEM';
  var secEl = document.getElementById('spHUDSector');
  secEl.innerHTML = '<span style="color:'+f.color+';font-size:.72rem;letter-spacing:.08em">'+sectorLoreName(planet.sector)+'</span>';

  spUpdateHUDControl(colonyId, f, s);
  spUpdateHUDPrices(colonyId);
  spBuildFundButtons(colonyId, f, s);

  // Show inline HUD panel
  var hud = document.getElementById('spSysHUD');
  if(hud) hud.style.transform = 'translateX(0)';

  if(spHUDRefreshTimer) clearInterval(spHUDRefreshTimer);
  spHUDRefreshTimer = setInterval(function(){ spUpdateHUDPrices(colonyId); }, 2000);
};

window.spCloseSurface = function(){
  var hud = document.getElementById('spSysHUD');
  if(hud) hud.style.transform = 'translateX(100%)';
  if(spHUDRefreshTimer){ clearInterval(spHUDRefreshTimer); spHUDRefreshTimer=null; }
};

// ── Parallax ──────────────────────────────────────────────────────────────────
function spParallax(e){
  var stage = document.getElementById('spCityStage');
  var rect = stage.getBoundingClientRect();
  var cx = rect.left + rect.width/2;
  var cy = rect.top + rect.height/2;
  var dx = (e.clientX - cx) / (rect.width/2);
  var dy = (e.clientY - cy) / (rect.height/2);
  var layers = stage.querySelectorAll('.sp-city-layer');
  layers.forEach(function(layer){
    var depth = parseFloat(layer.dataset.depth||0);
    var maxShift = 40;
    var tx = -dx * depth * maxShift;
    var ty = -dy * depth * maxShift * 0.5;
    layer.style.transform = 'translate('+tx.toFixed(1)+'px,'+ty.toFixed(1)+'px)';
  });
}

// ── HUD: Prices ───────────────────────────────────────────────────────────────
function spUpdateHUDPrices(colonyId){
  var m = COLONY_META[colonyId]; if(!m) return;
  var list = document.getElementById('spPriceList'); if(!list) return;
  var companies = (m.companies||[]).slice(0,6);
  if(!companies.length){ list.innerHTML='<div style="font-size:.68rem;color:#333">No listed operators</div>'; return; }
  var tickers = window.TICKERS || [];
  list.innerHTML = companies.map(function(name){
    var sym = name.replace(/\s+/g,'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,8);
    // Find matching ticker
    var t = tickers.find(function(tk){ return tk.name===name || (tk.symbol&&tk.symbol.toUpperCase()===sym); });
    var price = t ? t.price : null;
    var pct = t ? t.pct : null;
    var priceHtml = price!=null
      ? '<span class="sp-price-val">Ƒ'+(price>=10000?(price/1000).toFixed(1)+'k':price.toFixed(2))+'</span>'
       +'<span class="sp-price-pct" style="color:'+(pct>=0?'#86ff6a':'#ff6b6b')+'">'+(pct!=null?((pct>=0?'+':'')+pct.toFixed(1)+'%'):'')+'</span>'
      : '<span style="font-size:.65rem;color:#333">—</span>';
    var clickSym = t ? t.symbol : sym;
    var clickJs = 'try{var s=document.getElementById(\'sym\');'
      +'if(s)s.value=\''+clickSym+'\';'
      +'window.CURRENT=\''+clickSym+'\';'
      +'sendWS({type:\'chart\',symbol:\''+clickSym+'\'});'
      +'window.spCloseSurface&&window.spCloseSurface();'
      +'window.spCloseSystem&&window.spCloseSystem();'
      +'window.showTab&&window.showTab(\'market\');}catch(e){}';
    return '<div class="sp-price-row" onclick="'+clickJs+'" style="cursor:pointer" '
      +'onmouseover="this.style.background=\'#0d0d1a\'" onmouseout="this.style.background=\'\'">'
      +'<div><div class="sp-price-sym">'+clickSym+'</div>'
      +'<div class="sp-price-name">'+name+'</div></div>'
      +'<div style="text-align:right">'+priceHtml+'</div>'
      +'</div>';
  }).join('');
}

// ── HUD: Control bars ─────────────────────────────────────────────────────────
function spUpdateHUDControl(colonyId, f, s){
  var el = document.getElementById('spCtrlBars'); if(!el) return;
  var ctrl = {coalition:s.control_coalition||0, syndicate:s.control_syndicate||0, void:s.control_void||0};
  var fundFactions = ['coalition','syndicate','void'];
  el.innerHTML = fundFactions.map(function(fid){
    var fc = FACTIONS[fid]; var p = ctrl[fid]||0;
    return '<div class="sp-ctrl-bar-wrap">'
      +'<div class="sp-ctrl-label"><span style="color:'+fc.color+'">'+fc.short+'</span><span style="color:#555">'+p+'%</span></div>'
      +'<div class="sp-ctrl-bar"><div class="sp-ctrl-fill" style="background:'+fc.color+';width:'+p+'%"></div></div>'
      +'</div>';
  }).join('');
}

// ── HUD: Fund buttons ─────────────────────────────────────────────────────────
function spBuildFundButtons(colonyId, f, s){
  var el = document.getElementById('spFundBtns'); if(!el) return;
  var ctrl = {coalition:s.control_coalition||0, syndicate:s.control_syndicate||0, void:s.control_void||0};
  el.innerHTML = ['coalition','syndicate','void'].map(function(fid){
    var fc = FACTIONS[fid];
    return '<div class="sp-fund-row" id="spFR_'+colonyId+'_'+fid+'">'
      +'<button class="sp-fund-btn" style="border-color:'+fc.dim+';color:'+fc.color
      +'" onclick="spShowFundInput(\''+colonyId+'\',\''+fid+'\')">'
      +fc.short+' · '+(ctrl[fid]||0)+'%</button></div>';
  }).join('');
}

window.spShowFundInput = function(cid, fid){
  var fc = FACTIONS[fid];
  var row = document.getElementById('spFR_'+cid+'_'+fid); if(!row) return;
  row.innerHTML='<div style="display:flex;gap:4px">'
    +'<input id="spFA_'+cid+'_'+fid+'" type="number" placeholder="Amount (Ƒ)"'
    +' style="flex:1;background:#0a0a14;border:1px solid '+fc.color+'44;color:#ccc;padding:4px 6px;font-size:.64rem;font-family:inherit;outline:none;border-radius:2px"/>'
    +'<button onclick="spDoFund(\''+cid+'\',\''+fid+'\')" style="background:'+fc.dim+';border:1px solid '+fc.color+';color:'+fc.color+';padding:4px 8px;cursor:pointer;font-size:.6rem;font-family:inherit;border-radius:2px">SEND</button>'
    +'<button onclick="spBuildFundButtons(\''+cid+'\',null,gState[\''+cid+'\']||{})" style="background:transparent;border:1px solid #333;color:#555;padding:4px 6px;cursor:pointer;font-size:.6rem;font-family:inherit;border-radius:2px">✕</button>'
    +'</div>';
  setTimeout(function(){ var i=document.getElementById('spFA_'+cid+'_'+fid); if(i)i.focus(); },30);
};

window.spDoFund = function(cid, fid){
  var inp = document.getElementById('spFA_'+cid+'_'+fid);
  var amt = inp ? Number(inp.value) : 0;
  if(!amt||amt<1000){ if(typeof gToast==='function') gToast('Minimum: Ƒ 1,000','#e74c3c'); return; }
  if(!gToken){ if(typeof gToast==='function') gToast('Log in to fund factions','#e74c3c'); return; }
  fetch(apiBase()+'/api/galaxy/fund',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({colonyId:cid,faction:fid,amount:amt,token:gToken})})
    .then(function(r){return r.json();}).then(function(d){
      if(d.ok){
        if(typeof gToast==='function') gToast('Funded '+FACTIONS[fid].short,'#4ecdc4');
        galaxyFetch();
        setTimeout(function(){
          var s=gState[cid]||{};
          var f=FACTIONS[getLeadingFaction(s)];
          spUpdateHUDControl(cid,f,s);
          spBuildFundButtons(cid,f,s);
        },800);
      } else {
        if(typeof gToast==='function') gToast(d.error||'Fund failed','#e74c3c');
      }
    }).catch(function(){ if(typeof gToast==='function') gToast('Connection error','#e74c3c'); });
};

var gMapActive=false, gAnimRaf=null, gAnimT=0, gStarsSeeded=false;
var spOrbitRAF=null, spOrbitLastT=null;

function apiBase(){ return location.origin; }


// ── Galaxy Map Pan / Drag ─────────────────────────────────────────────────────
(function(){
  var svg, isPanning=false, startX, startY, vbX=-150, vbY=-80, vbW=1200, vbH=873; // zoomed out to show full map (vbH = vbW*800/1100)
  var minX=-200, minY=-120, maxX=700, maxY=550; // pan bounds covering all colonies
  var minZoom=600, maxZoom=1400; // vbW range
  function clampView(){
    vbX=Math.max(minX,Math.min(maxX,vbX));
    vbY=Math.max(minY,Math.min(maxY,vbY));
  }
  function applyView(){
    clampView();
    svg.setAttribute('viewBox',vbX.toFixed(1)+' '+vbY.toFixed(1)+' '+vbW.toFixed(1)+' '+(vbW*800/1100).toFixed(1));
  }
  function initPan(){
    svg = document.getElementById('galaxySVG'); if(!svg) return;
    svg.style.cursor='grab';
    // Scroll wheel zoom
    svg.addEventListener('wheel', function(e){
      e.preventDefault();
      var rect=svg.getBoundingClientRect();
      // Mouse pos in SVG coords
      var mx=(e.clientX-rect.left)/rect.width*vbW+vbX;
      var my=(e.clientY-rect.top)/rect.height*(vbW*800/1100)+vbY;
      var factor=e.deltaY>0?1.12:0.89;
      var newW=Math.max(minZoom,Math.min(maxZoom,vbW*factor));
      // Adjust vbX/vbY so mouse point stays fixed
      vbX=mx-(mx-vbX)*(newW/vbW);
      vbY=my-(my-vbY)*(newW/vbW);
      vbW=newW;
      applyView();
    },{passive:false});
    svg.addEventListener('mousedown', function(e){
      if(e.button!==0) return;
      isPanning=true; startX=e.clientX; startY=e.clientY;
      svg.style.cursor='grabbing'; e.preventDefault();
    });
    window.addEventListener('mousemove', function(e){
      if(!isPanning) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      startX=e.clientX; startY=e.clientY;
      // Convert screen px to SVG units
      var rect = svg.getBoundingClientRect();
      var scaleX = vbW / rect.width;
      var scaleY = vbH / rect.height;
      vbX = Math.max(minX, Math.min(maxX, vbX - dx*scaleX));
      vbY = Math.max(minY, Math.min(maxY, vbY - dy*scaleY));
      applyView();
    });
    window.addEventListener('mouseup', function(){ isPanning=false; if(svg) svg.style.cursor='grab'; });
    // Touch support
    svg.addEventListener('touchstart', function(e){
      if(e.touches.length!==1) return;
      isPanning=true; startX=e.touches[0].clientX; startY=e.touches[0].clientY;
    },{passive:true});
    svg.addEventListener('touchmove', function(e){
      if(!isPanning||e.touches.length!==1) return;
      var dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
      startX=e.touches[0].clientX; startY=e.touches[0].clientY;
      var rect=svg.getBoundingClientRect();
      vbX=Math.max(minX,Math.min(maxX,vbX-dx*(vbW/rect.width)));
      vbY=Math.max(minY,Math.min(maxY,vbY-dy*(vbH/rect.height)));
      applyView();
    },{passive:true});
    svg.addEventListener('touchend', function(){ isPanning=false; });
  }
  // Init after DOM ready
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initPan);
  else setTimeout(initPan, 500);


// ══════════════════════════════════════════════════════════════════════════════
// ── Asset definitions ─────────────────────────────────────────────────────────
var SHIP_TYPES = {
  v1: {
    body:   ['assets/space/ships/v1_body_1.png','assets/space/ships/v1_body_2.png','assets/space/ships/v1_body_3.png'],
    thrust: ['assets/space/ships/v1_thrust_1.png','assets/space/ships/v1_thrust_2.png','assets/space/ships/v1_thrust_3.png'],
    w: 24, h: 13, thrustW: 8, thrustH: 8,
    thrustOffX: -10, thrustOffY: 0.5,  // relative to ship centre, thrust sits behind
    traversal: false,
    speed: 22,   // SVG units per second
    frameMs: 140
  },
  v2: {
    body:   ['assets/space/ships/v2_body_1.png','assets/space/ships/v2_body_2.png','assets/space/ships/v2_body_3.png'],
    thrust: ['assets/space/ships/v2_thrust_1.png','assets/space/ships/v2_thrust_2.png','assets/space/ships/v2_thrust_3.png'],
    w: 24, h: 17, thrustW: 8, thrustH: 6,
    thrustOffX: -10, thrustOffY: 3.5,
    traversal: false,
    speed: 18,
    frameMs: 160
  },
  v3: {
    body:      ['assets/space/ships/v3_body_1.png','assets/space/ships/v3_body_2.png','assets/space/ships/v3_body_3.png'],
    thrustB:   ['assets/space/ships/v3_thrust_back_1.png','assets/space/ships/v3_thrust_back_2.png','assets/space/ships/v3_thrust_back_3.png'],
    thrustBot: ['assets/space/ships/v3_thrust_bot_1.png','assets/space/ships/v3_thrust_bot_2.png','assets/space/ships/v3_thrust_bot_3.png'],
    w: 36, h: 18, thrustW: 12, thrustH: 18, thrustBotW: 18, thrustBotH: 14,
    thrustOffX: -12, thrustOffY: 0,
    thrustBotOffX: 9, thrustBotOffY: 14,
    traversal: true,
    speed: 12,   // slower — these are big haulers
    frameMs: 120
  }
};

// ── Which lanes get which ship types ─────────────────────────────────────────
// high vol → v1 + v2 both; medium → one of v1/v2; low → v1 only; traversal routes → v3
var TRAVERSAL_ROUTES = [
  // Long cross-cluster routes for the big freighter
  {from:'gluttonis',      to:'aurora_prime'},
  {from:'gluttonis',      to:'cascade_station'},
  {from:'limbosis',       to:'new_anchor'},
  {from:'iron_shelf',     to:'new_anchor'},
  {from:'signal_run',     to:'aurora_prime'},
  {from:'nova_reach',     to:'cascade_station'},
  // Shadow network long haulers
  {from:'the_ledger',     to:'null_point'},
  {from:'the_escrow',     to:'null_point'},
  {from:'dust_basin',     to:'signal_run'},
];

// ── Active ships ──────────────────────────────────────────────────────────────
var gShipList = [];   // { el, thrustEl, thrustBotEl, type, from, to, t, frameIdx, frameTick, direction }
var gShipRAF  = null;
var gShipLastT = null;
var gShipActive = false;

// ── SVG <image> helpers ───────────────────────────────────────────────────────
var svgNS = 'http://www.w3.org/2000/svg';

function mkImg(href, w, h) {
  var el = document.createElementNS(svgNS, 'image');
  el.setAttribute('href', href);
  el.setAttribute('width',  String(w));
  el.setAttribute('height', String(h));
  el.setAttribute('image-rendering', 'pixelated');
  return el;
}

// ── Spawn one ship on a lane ──────────────────────────────────────────────────
function spawnShip(lane, typeKey, reversed) {
  var g = document.getElementById('gShips'); if (!g) return;
  var meta = COLONY_META;
  var from = reversed ? lane.to   : lane.from;
  var to   = reversed ? lane.from : lane.to;
  var a    = meta[from], b = meta[to];
  if (!a || !b) return;

  var def = SHIP_TYPES[typeKey];
  var dx = b.x - a.x, dy = b.y - a.y;
  var angle = Math.atan2(dy, dx); // radians, 0 = right

  // Group element to hold ship + thrust together
  var grp = document.createElementNS(svgNS, 'g');
  grp.setAttribute('opacity', '0');  // fade in

  // Engine glow — visible even at tiny scale
  var glowCol = def.traversal ? '#f39c12' : (Math.random() < 0.5 ? '#4ecdc4' : '#9b59b6');
  var glowR   = def.traversal ? 3.5 : 2;
  var glowEl  = document.createElementNS(svgNS, 'ellipse');
  glowEl.setAttribute('rx', String(glowR));
  glowEl.setAttribute('ry', String(glowR * 0.6));
  glowEl.setAttribute('fill', glowCol);
  glowEl.setAttribute('opacity', '0.85');
  glowEl.setAttribute('filter', def.traversal ? 'url(#gf-contested)' : 'url(#gf-coalition)');
  // Position glow at thrust port in ship-local space (set after w/h known)
  glowEl.setAttribute('cx', '0');
  glowEl.setAttribute('cy', (def.h / 2).toFixed(1));
  grp.appendChild(glowEl);

  // Thrust (rendered first so it's behind)
  var thrustEl = null, thrustBotEl = null;
  if (def.thrust) {
    thrustEl = mkImg(def.thrust[0], def.thrustW, def.thrustH);
    grp.appendChild(thrustEl);
  }
  if (def.thrustB) {
    thrustEl = mkImg(def.thrustB[0], def.thrustW, def.thrustH);
    grp.appendChild(thrustEl);
  }
  if (def.thrustBot) {
    thrustBotEl = mkImg(def.thrustBot[0], def.thrustBotW, def.thrustBotH);
    grp.appendChild(thrustBotEl);
  }

  // Ship body
  var bodyEl = mkImg(def.body[0], def.w, def.h);
  grp.appendChild(bodyEl);

  g.appendChild(grp);

  var ship = {
    grp: grp, bodyEl: bodyEl, glowEl: glowEl,
    thrustEl: thrustEl, thrustBotEl: thrustBotEl,
    def: def, typeKey: typeKey,
    fromId: from, toId: to,
    ax: a.x, ay: a.y, bx: b.x, by: b.y,
    angle: angle,
    t: 0,         // 0..1 journey progress
    frameIdx: 0,
    frameTick: 0,
    done: false,
    opacity: 0
  };
  gShipList.push(ship);

  // Make ship clickable — open manifest modal
  grp.style.cursor = 'pointer';
  grp.addEventListener('click', function(e) {
    e.stopPropagation();
    if (window.openShipManifest) window.openShipManifest(ship);
  });
}

// ── Position one ship ─────────────────────────────────────────────────────────
function positionShip(ship, dt) {
  var def = ship.def;
  var dist = Math.sqrt(Math.pow(ship.bx-ship.ax,2) + Math.pow(ship.by-ship.ay,2));
  if (dist < 1) { ship.done = true; return; }

  // Advance journey
  var speed = def.speed / dist; // fraction of journey per second
  ship.t = Math.min(1, ship.t + speed * dt * 0.001);

  // Fade in first 5% of journey, fade out last 5%
  ship.opacity = ship.t < 0.05 ? ship.t / 0.05 : ship.t > 0.95 ? (1 - ship.t) / 0.05 : 1;
  ship.grp.setAttribute('opacity', ship.opacity.toFixed(2));

  if (ship.t >= 1) { ship.done = true; return; }

  var cx = ship.ax + (ship.bx - ship.ax) * ship.t;
  var cy = ship.ay + (ship.by - ship.ay) * ship.t;
  var a  = ship.angle;
  var w  = def.w, h = def.h;

  // Ship faces right by default.
  // - If heading right (|angle| < 90°): no flip, tilt gently
  // - If heading left: flip horizontally, tilt gently
  // Tilt clamped to ±25° so ships never go upside down
  var goingLeft = Math.abs(a) > Math.PI / 2;
  var tiltAngle = Math.atan2(ship.by - ship.ay, Math.abs(ship.bx - ship.ax));
  if (goingLeft) tiltAngle = Math.atan2(ship.ay - ship.by, Math.abs(ship.bx - ship.ax));
  var maxTilt = 28 * Math.PI / 180;
  tiltAngle = Math.max(-maxTilt, Math.min(maxTilt, tiltAngle));
  var tiltDeg = tiltAngle * 180 / Math.PI;
  var flipX = goingLeft ? -1 : 1;

  ship.grp.setAttribute('transform',
    'translate(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ') ' +
    'rotate(' + tiltDeg.toFixed(1) + ') ' +
    'scale(' + flipX + ',1) ' +
    'translate(' + (-w/2).toFixed(1) + ',' + (-h/2).toFixed(1) + ')'
  );

  // Position thrust — behind the ship (negative x in ship-local space)
  if (ship.thrustEl) {
    var tof = def.thrustOffX || 0;
    var toy = (h/2 - def.thrustH/2) + (def.thrustOffY || 0);
    ship.thrustEl.setAttribute('x', String(tof));
    ship.thrustEl.setAttribute('y', toy.toFixed(1));
  }
  if (ship.thrustBotEl) {
    ship.thrustBotEl.setAttribute('x', String(def.thrustBotOffX || 0));
    ship.thrustBotEl.setAttribute('y', String(def.thrustBotOffY || 0));
  }

  // Pulse engine glow
  if (ship.glowEl) {
    var pulse = 0.65 + 0.25 * Math.sin(ship.t * 60 + (ship.glowPhase || 0));
    ship.glowEl.setAttribute('opacity', pulse.toFixed(2));
  }

  // Animate frames
  ship.frameTick += dt;
  if (ship.frameTick >= def.frameMs) {
    ship.frameTick = 0;
    ship.frameIdx  = (ship.frameIdx + 1) % 3;
    ship.bodyEl.setAttribute('href', def.body[ship.frameIdx]);
    if (ship.thrustEl && def.thrust)   ship.thrustEl.setAttribute('href', def.thrust[ship.frameIdx]);
    if (ship.thrustEl && def.thrustB)  ship.thrustEl.setAttribute('href', def.thrustB[ship.frameIdx]);
    if (ship.thrustBotEl)              ship.thrustBotEl.setAttribute('href', def.thrustBot[ship.frameIdx]);
  }
}

// ── Tick loop ─────────────────────────────────────────────────────────────────
function shipTick(t) {
  if (!gShipActive) { gShipRAF = null; return; }
  var dt = gShipLastT ? Math.min(t - gShipLastT, 80) : 16;
  gShipLastT = t;

  // Update all ships
  for (var i = gShipList.length - 1; i >= 0; i--) {
    var ship = gShipList[i];
    positionShip(ship, dt);
    if (ship.done) {
      if (ship.grp.parentNode) ship.grp.parentNode.removeChild(ship.grp);
      gShipList.splice(i, 1);
    }
  }

  gShipRAF = requestAnimationFrame(shipTick);
}

// ── Spawn scheduler ───────────────────────────────────────────────────────────
var gShipSpawnTimer = null;
var gNextTraversalIdx = 0;

function scheduleNextSpawn() {
  if (!gShipActive) return;
  var delay = 5000 + Math.random() * 8000; // 5–13s between spawns for better spacing
  gShipSpawnTimer = setTimeout(spawnNext, delay);
}

function laneDist(lane) {
  var a = COLONY_META[lane.from], b = COLONY_META[lane.to || lane.from];
  if (!a || !b) return 0;
  return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

function spawnNext() {
  if (!gShipActive) return;

  // 28% chance: traversal hauler (v3) on a long cross-cluster route
  var roll = Math.random();
  if (roll < 0.28) {
    var route = TRAVERSAL_ROUTES[gNextTraversalIdx % TRAVERSAL_ROUTES.length];
    gNextTraversalIdx++;
    spawnShip(route, 'v3', Math.random() < 0.5);

  } else {
    // Small freighter — weighted by volume (high=4, medium=2, low=0.5)
    var weighted = [];
    LANES.forEach(function(l) {
      var w = l.vol === 'high' ? 4 : l.vol === 'medium' ? 2 : 0.5;
      for (var i = 0; i < w * 2; i++) weighted.push(l);
    });
    var lane = weighted[Math.floor(Math.random() * weighted.length)];

    // Pick ship type by distance: long routes get v2, short get v1
    var dist = laneDist(lane);
    var typeKey = dist > 320 ? 'v2' : 'v1';
    spawnShip(lane, typeKey, Math.random() < 0.5);
  }

  scheduleNextSpawn();
}

// ── Public API ────────────────────────────────────────────────────────────────
window.gShipTrafficStart = function() {
  if (gShipActive) return;
  gShipActive  = true;
  gShipLastT   = null;
  // Seed a few ships immediately at random points on their journeys
  var seeds = [
    {lane: LANES[0], type:'v1', rev:false},
    {lane: LANES[3], type:'v2', rev:true},
    {lane: LANES[6], type:'v1', rev:false},
    {lane: TRAVERSAL_ROUTES[0], type:'v3', rev:false},
    {lane: TRAVERSAL_ROUTES[2], type:'v3', rev:true},
  ];
  seeds.forEach(function(s){
    spawnShip(s.lane, s.type, s.rev);
    // Advance them mid-journey so map isn't empty on open
    var ship = gShipList[gShipList.length-1];
    if (ship) ship.t = 0.1 + Math.random() * 0.7;
  });
  gShipRAF = requestAnimationFrame(shipTick);
  scheduleNextSpawn();
};

window.gShipTrafficStop = function() {
  gShipActive = false;
  if (gShipRAF)       { cancelAnimationFrame(gShipRAF); gShipRAF = null; }
  if (gShipSpawnTimer){ clearTimeout(gShipSpawnTimer);   gShipSpawnTimer = null; }
  var g = document.getElementById('gShips');
  if (g) g.innerHTML = '';
  gShipList = [];
};

})();
function galaxyFetch(){
  // Pre-seed Eyejog as guild-controlled (sovereign, not server-tracked)
  if(!gState['eyejog']) gState['eyejog'] = {id:'eyejog', faction:'guild', control_guild:100, control_coalition:0, control_syndicate:0, control_void:0, contested:false};
  spShowSpinner();
  fetch(apiBase()+'/api/galaxy/state').then(function(r){return r.json();}).then(function(d){
    spHideSpinner(); spFadeNebula();
    if(d.ok&&d.colonies){ d.colonies.forEach(function(c){ gState[c.id]=c; }); gRenderAll(); }
  }).catch(function(){ spHideSpinner(); });
}

// Sub-tab switching
function initSubTabs(){
  document.querySelectorAll('.galaxy-stab').forEach(function(btn){
    btn.addEventListener('click',function(){
      var t=btn.getAttribute('data-gstab');
      document.querySelectorAll('.galaxy-stab').forEach(function(b){
        b.style.borderBottomColor='transparent'; b.style.color='#555';
      });
      btn.style.borderBottomColor='#4ecdc4'; btn.style.color='#4ecdc4';
      var mp=document.getElementById('gMapPane');
      var fp=document.getElementById('gFactionsPane');
      var sp=document.getElementById('gShippingPane');
      var cp=document.getElementById('gContractsPane');
      if(mp) mp.style.display=t==='map'?'flex':'none';
      if(fp) fp.style.display=t==='factions'?'block':'none';
      if(sp) sp.style.display=t==='shipping'?'block':'none';
      if(cp) cp.style.display=t==='contracts'?'block':'none';
      if(t==='factions') renderFactionList();
      if(t==='contracts') renderContractsTable();
      if(t==='shipping') window.renderShippingTab();
    });
  });
}

function hookShowTab(){
  var orig=window.showTab; if(!orig) return;
  window.showTab=function(name){
    orig(name);
    if(name==='galactic') onGalaxyOpen();
    else { gMapActive=false; if(window.gShipTrafficStop) window.gShipTrafficStop(); }

  };
}

function onGalaxyOpen(){
  gMapActive=true;
  // Pick up token from core.js — galaxy.js is lazy-loaded so fm:authed may have fired already
  if(!gToken && window.__fmToken) gToken = window.__fmToken;
  if(!gPlayerFaction && window.ME && window.ME.faction) gPlayerFaction = window.ME.faction;
  if(!gStarsSeeded){ seedStars(); gStarsSeeded=true; }
  spFadeNebula();
  if(Object.keys(gState).length===0) galaxyFetch();
  else gRenderAll();
  startAnim();
  // Start ship traffic when map opens
  if(window.gShipTrafficStart) setTimeout(window.gShipTrafficStart, 400);
  // Request galaxy systems data (blockades, contracts, HQ map)
  _sendWSGalaxy({type:'galaxy_data_request'});
  _sendWSGalaxy({type:'trade_config_request'});
  // Refresh lanes every 2s while an active run exists (animates the ship dot)
  if(window._activeLaneRefreshIv) clearInterval(window._activeLaneRefreshIv);
  window._activeLaneRefreshIv = setInterval(function(){
    if(!gMapActive){ clearInterval(window._activeLaneRefreshIv); return; }
    if(window._activeShipRun || window._activeSmugRun) renderLanes();
  }, 2000);
}

function gRenderAll(){
  // Ensure eyejog always shows as guild sovereign
  if(!gState['eyejog']) gState['eyejog'] = {id:'eyejog', faction:'guild', control_guild:100, control_coalition:0, control_syndicate:0, control_void:0, contested:false};
  renderLanes(); renderMap();
}

// Stars
function seedStars(){
  var g=document.getElementById('gStars'); if(!g||g.childElementCount>0) return;
  for(var i=0;i<220;i++){
    var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx',((Math.sin(i*2.39)*0.5+0.5)*1000).toFixed(1));
    c.setAttribute('cy',((Math.cos(i*1.61)*0.5+0.5)*700).toFixed(1));
    c.setAttribute('r',(0.5+(i%5)*0.38).toFixed(1));
    c.setAttribute('fill','#fff');
    c.setAttribute('opacity',(0.05+(i%7)*0.055).toFixed(2));
    g.appendChild(c);
  }
}

// Lane animation
function startAnim(){
  if(gAnimRaf) return;
  function tick(){
    gAnimT+=0.4;
    document.querySelectorAll('.g-la').forEach(function(el){
      el.setAttribute('stroke-dashoffset',(-gAnimT*(parseFloat(el.getAttribute('data-spd'))||1)).toFixed(1));
    });
    gAnimRaf=gMapActive?requestAnimationFrame(tick):null;
  }
  gAnimRaf=requestAnimationFrame(tick);
}

// Render lanes
// Blend two hex colors at given ratio (0=a, 1=b)
function blendHex(hexA, hexB, t){
  var pa=hexA.replace('#',''), pb=hexB.replace('#','');
  var ra=parseInt(pa.slice(0,2),16), ga=parseInt(pa.slice(2,4),16), ba2=parseInt(pa.slice(4,6),16);
  var rb=parseInt(pb.slice(0,2),16), gb=parseInt(pb.slice(2,4),16), bb2=parseInt(pb.slice(4,6),16);
  var r=Math.round(ra+(rb-ra)*t), g2=Math.round(ga+(gb-ga)*t), b3=Math.round(ba2+(bb2-ba2)*t);
  return '#'+[r,g2,b3].map(function(v){return ('0'+v.toString(16)).slice(-2);}).join('');
}

// Get faction dominance for a colony (returns faction id or null if contested/neutral)
function colonyDominant(id){
  var s=gState[id]; if(!s) return null;
  var co=s.control_coalition||0, sy=s.control_syndicate||0, vo=s.control_void||0;
  var total=co+sy+vo; if(total<10) return null;  // barely contested, treat as neutral
  var thresh=total*0.45;  // must hold 45% to be considered dominant
  if(co>thresh && co>sy && co>vo) return 'coalition';
  if(sy>thresh && sy>co && sy>vo) return 'syndicate';
  if(vo>thresh && vo>co && vo>sy) return 'void';
  return null;  // genuinely contested
}

function renderLanes(){
  var g=document.getElementById('gLanes'); if(!g) return; g.innerHTML='';
  LANES.forEach(function(l){
    var a=COLONY_META[l.from],b=COLONY_META[l.to]; if(!a||!b) return;
    var baseCol=LANE_COLOR[l.type];

    // Dynamic faction tint: check who controls the endpoints
    var domA=colonyDominant(l.from), domB=colonyDominant(l.to);
    var col=baseCol;
    if(domA && domB){
      if(domA===domB){
        // Both endpoints same faction — blend lane color toward that faction
        var fCol=(FACTIONS[domA]||{}).color||baseCol;
        col=blendHex(baseCol,fCol,0.55);
      } else {
        // Split control — contested amber tint
        col=blendHex(baseCol,'#f39c12',0.40);
      }
    } else if(domA || domB){
      // One end has a dominant faction — subtle tint
      var fCol=(FACTIONS[domA||domB]||{}).color||baseCol;
      col=blendHex(baseCol,fCol,0.30);
    }
    var sw=l.vol==='high'?2.4:l.vol==='medium'?1.7:1.1;
    var dash=l.vol==='high'?'14 8':l.vol==='medium'?'9 10':'5 12';
    var spd=l.vol==='high'?1.2:0.7;
    var gl=document.createElementNS('http://www.w3.org/2000/svg','line');
    ['x1','y1','x2','y2'].forEach(function(a2,i){ gl.setAttribute(a2,[a.x,a.y,b.x,b.y][i]); });
    gl.setAttribute('stroke',col);gl.setAttribute('stroke-width',sw*3.5);gl.setAttribute('opacity','0.06');
    g.appendChild(gl);
    // Invisible wide hitbox for clicking
    var hit=document.createElementNS('http://www.w3.org/2000/svg','line');
    ['x1','y1','x2','y2'].forEach(function(a2,i){ hit.setAttribute(a2,[a.x,a.y,b.x,b.y][i]); });
    hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','14');hit.setAttribute('cursor','pointer');
    hit.addEventListener('click',(function(f,t){ return function(){ window._gSelectLane(f,t); }; })(l.from,l.to));
    g.appendChild(hit);
    var ln=document.createElementNS('http://www.w3.org/2000/svg','line');
    ['x1','y1','x2','y2'].forEach(function(a2,i){ ln.setAttribute(a2,[a.x,a.y,b.x,b.y][i]); });
    ln.setAttribute('stroke',col);ln.setAttribute('stroke-width',sw);
    ln.setAttribute('stroke-dasharray',dash);ln.setAttribute('stroke-dashoffset','0');ln.setAttribute('opacity','0.6');
    ln.classList.add('g-la');ln.setAttribute('data-spd',spd);
    g.appendChild(ln);

    // Blockade indicator: red pulsing X at lane midpoint
    var lk=[l.from,l.to].sort().join('|');
    if(window._FM_BLOCKADES && window._FM_BLOCKADES[lk]){
      var mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
      var bTxt=document.createElementNS('http://www.w3.org/2000/svg','text');
      bTxt.setAttribute('x',mx);bTxt.setAttribute('y',my+3);
      bTxt.setAttribute('text-anchor','middle');bTxt.setAttribute('fill','#e74c3c');
      bTxt.setAttribute('font-size','14');bTxt.setAttribute('font-weight','bold');
      bTxt.setAttribute('class','g-blk-pulse');bTxt.textContent='\u26D4';
      g.appendChild(bTxt);
    }
    // Share indicator: blue number at lane midpoint showing supply
    var shData = window._FM_SHARES && window._FM_SHARES[lk];
    if(shData && shData.supply > 0){
      var cx2=(a.x+b.x)/2+(window._FM_BLOCKADES&&window._FM_BLOCKADES[lk]?12:0);
      var cy2=(a.y+b.y)/2;
      var cTxt=document.createElementNS('http://www.w3.org/2000/svg','text');
      cTxt.setAttribute('x',cx2);cTxt.setAttribute('y',cy2+3);
      cTxt.setAttribute('text-anchor','middle');cTxt.setAttribute('fill','#3498db');
      cTxt.setAttribute('font-size','9');cTxt.textContent=shData.supply;
      g.appendChild(cTxt);
    }

    // Active shipping/smuggling run: flash the lane + show animated ship
    var activeRun=null;
    if(window._activeShipRun && window._activeShipRun.from===l.from && window._activeShipRun.to===l.to) activeRun=window._activeShipRun;
    if(window._activeShipRun && window._activeShipRun.from===l.to && window._activeShipRun.to===l.from) activeRun=window._activeShipRun;
    if(window._activeSmugRun && window._activeSmugRun.from===l.from && window._activeSmugRun.to===l.to) activeRun=window._activeSmugRun;
    if(window._activeSmugRun && window._activeSmugRun.from===l.to && window._activeSmugRun.to===l.from) activeRun=window._activeSmugRun;
    if(activeRun){
      var runCol=activeRun.type==='shipping'?'#3498db':'#e74c3c';
      // Pulsing glow line over the lane
      var glow=document.createElementNS('http://www.w3.org/2000/svg','line');
      ['x1','y1','x2','y2'].forEach(function(a2,i){ glow.setAttribute(a2,[a.x,a.y,b.x,b.y][i]); });
      glow.setAttribute('stroke',runCol);glow.setAttribute('stroke-width','4');
      glow.setAttribute('opacity','0.5');glow.setAttribute('class','g-active-lane-pulse');
      g.appendChild(glow);
      // Animated ship dot: position based on elapsed time
      var elapsed=Date.now()-(activeRun.resolveTs-(activeRun.durSec*1000));
      var progress=Math.min(1,Math.max(0,elapsed/(activeRun.durSec*1000)));
      var fromC=COLONY_META[activeRun.from], toC=COLONY_META[activeRun.to];
      if(fromC&&toC){
        var sx=fromC.x+(toC.x-fromC.x)*progress;
        var sy=fromC.y+(toC.y-fromC.y)*progress;
        // Ship dot
        var ship=document.createElementNS('http://www.w3.org/2000/svg','circle');
        ship.setAttribute('cx',sx);ship.setAttribute('cy',sy);ship.setAttribute('r','5');
        ship.setAttribute('fill',runCol);ship.setAttribute('class','g-ship-dot');
        ship.setAttribute('cursor','pointer');
        ship.addEventListener('click',function(){
          var left=Math.max(0,Math.ceil((activeRun.resolveTs-Date.now())/1000));
          var label=activeRun.type==='shipping'?'SHIPPING':'SMUGGLING';
          var det=label+': '+activeRun.cargo+'\nStake: \u0192'+Number(activeRun.stake).toLocaleString()+'\nTime left: '+left+'s';
          if(activeRun.insured) det+='\nInsured';
          gToast(det,runCol);
        });
        g.appendChild(ship);
        // Trail glow
        var trail=document.createElementNS('http://www.w3.org/2000/svg','circle');
        trail.setAttribute('cx',sx);trail.setAttribute('cy',sy);trail.setAttribute('r','10');
        trail.setAttribute('fill','none');trail.setAttribute('stroke',runCol);
        trail.setAttribute('stroke-width','1.5');trail.setAttribute('opacity','0.3');
        trail.setAttribute('class','g-ship-trail');
        g.appendChild(trail);
      }
    }
  });
}

// Helper: get leading faction for a colony
function getLeadingFaction(s){
  if(!s) return 'coalition';
  if(s.faction==='fleshstation') return 'fleshstation';
  if(s.faction==='guild') return 'guild';
  var ctrl={coalition:s.control_coalition||0,syndicate:s.control_syndicate||0,void:s.control_void||0};
  return ['coalition','syndicate','void'].reduce(function(b,f){ return ctrl[f]>ctrl[b]?f:b; },'coalition');
}

// Render colony nodes (star systems) — add small planet rings around each
function renderMap(){
  // Stop all running planet animations before rebuilding DOM
  spClearAllMapAnims();
  gPlanetImgEls = {};

  var g=document.getElementById('gColonies'); if(!g) return; g.innerHTML='';
  Object.keys(COLONY_META).forEach(function(id){
    var m=COLONY_META[id];
    var _defaultFaction = id==='flesh_station'?'fleshstation':id==='eyejog'?'guild':'coalition';
    var s=gState[id]||{faction:_defaultFaction};
    var fac=getLeadingFaction(s);
    var f=FACTIONS[fac]||FACTIONS.coalition;
    var contested=s.contested && id!=='flesh_station';
    var sel=(gSelected===id);
    var r=id==='flesh_station'?14:18;
    var filterStr='url(#gf-'+(contested?'contested':fac==='guild'?'guild':fac.replace('fleshstation','dev'))+')';
    var pData=COLONY_PLANET[id];

    var isFrontierCol = ['dust_basin','nova_reach','iron_shelf','the_ledger','signal_run'].indexOf(id)!==-1;
    var grp=document.createElementNS('http://www.w3.org/2000/svg','g');
    grp.setAttribute('cursor','pointer');
    grp.setAttribute('filter',filterStr);
    if(isFrontierCol) grp.setAttribute('opacity','0.55');

    // Large invisible hit area so user doesn't have to click a thin ring
    var hitCircle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    hitCircle.setAttribute('cx',m.x);hitCircle.setAttribute('cy',m.y);hitCircle.setAttribute('r',r+16);
    hitCircle.setAttribute('fill','transparent');hitCircle.setAttribute('stroke','none');
    grp.appendChild(hitCircle);

    // Outer glow ring
    var or2=document.createElementNS('http://www.w3.org/2000/svg','circle');
    or2.setAttribute('cx',m.x);or2.setAttribute('cy',m.y);or2.setAttribute('r',r+5);
    or2.setAttribute('fill','none');or2.setAttribute('stroke',f.color);
    or2.setAttribute('stroke-width','1');or2.setAttribute('opacity',sel?'0.65':'0.18');
    grp.appendChild(or2);

    // Planet orbit rings — only for multi-body star systems, not single-body worlds
    var planets=m.planets||[];
    var showOrbits = !SP_SINGLE_BODY[id];
    if(showOrbits){
      if(SP_STATION_ORBIT[id]){
        // Station complex: draw ONE orbit ring with ONE station icon
        var sOrbitR = r + 14;
        var sOrc = document.createElementNS('http://www.w3.org/2000/svg','circle');
        sOrc.setAttribute('cx',m.x);sOrc.setAttribute('cy',m.y);sOrc.setAttribute('r',sOrbitR);
        sOrc.setAttribute('fill','none');sOrc.setAttribute('stroke',f.color);
        sOrc.setAttribute('stroke-width','0.6');sOrc.setAttribute('opacity','0.18');
        sOrc.setAttribute('stroke-dasharray','2 5');sOrc.setAttribute('pointer-events','none');
        grp.appendChild(sOrc);
        // Single station icon on the orbit ring
        var sAngle = (s.tension||0) * Math.PI / 180;
        var spx = m.x + sOrbitR * Math.cos(sAngle);
        var spy = m.y + sOrbitR * Math.sin(sAngle);
        var stnPd = document.createElementNS('http://www.w3.org/2000/svg','image');
        stnPd.setAttribute('href','assets/space/planets/static/tech/3.png');
        stnPd.setAttribute('x',(spx-4).toFixed(1));stnPd.setAttribute('y',(spy-4).toFixed(1));
        stnPd.setAttribute('width','8');stnPd.setAttribute('height','8');
        stnPd.setAttribute('opacity','0.9');stnPd.setAttribute('pointer-events','none');
        stnPd.style.imageRendering='pixelated';
        grp.appendChild(stnPd);
      } else {
        planets.forEach(function(p,i){
          var orbitR=r+10+(i*8);
          var orc=document.createElementNS('http://www.w3.org/2000/svg','circle');
          orc.setAttribute('cx',m.x);orc.setAttribute('cy',m.y);orc.setAttribute('r',orbitR);
          orc.setAttribute('fill','none');orc.setAttribute('stroke',f.color);
          orc.setAttribute('stroke-width','0.5');orc.setAttribute('opacity','0.12');
          orc.setAttribute('stroke-dasharray','3 6');orc.setAttribute('pointer-events','none');
          grp.appendChild(orc);
          // Tiny planet icon on orbit
          var angle = (i * 137.5 + (s.tension||0)) * Math.PI / 180;
          var px2=m.x + orbitR * Math.cos(angle);
          var py2=m.y + orbitR * Math.sin(angle);
          var stationIcon = (_spIconForZoneName ? _spIconForZoneName(p.name) : null) || (p.isStation ? 'Tech.png' : null);
          var iconName = stationIcon ? stationIcon.replace('.png','') : SECTOR_PLANET_ICON[p.sector];
          if(iconName){
            var pd2=document.createElementNS('http://www.w3.org/2000/svg','image');
            pd2.setAttribute('href','assets/space/planets/icons/'+iconName+'.png');
            pd2.setAttribute('x',(px2-4).toFixed(1));pd2.setAttribute('y',(py2-4).toFixed(1));
            pd2.setAttribute('width','8');pd2.setAttribute('height','8');
            pd2.setAttribute('opacity','0.85');pd2.setAttribute('pointer-events','none');
            pd2.style.imageRendering='pixelated';
            grp.appendChild(pd2);
          } else {
            var pd=document.createElementNS('http://www.w3.org/2000/svg','circle');
            pd.setAttribute('cx',px2.toFixed(1));pd.setAttribute('cy',py2.toFixed(1));
            pd.setAttribute('r', contested ? '3.5' : '2.5');
            pd.setAttribute('fill',f.color);pd.setAttribute('opacity','0.7');
            pd.setAttribute('pointer-events','none');
            grp.appendChild(pd);
          }
        });
      }
    }

    // ── Planet image (replaces star circle + symbol) ────────────────────
    var ci;
    if(pData){
      // SVG <image> for the planet sprite
      ci=document.createElementNS('http://www.w3.org/2000/svg','image');
      ci.setAttribute('href', spPlanetSrc(id, 1));
      ci.setAttribute('x', m.x - r);
      ci.setAttribute('y', m.y - r);
      ci.setAttribute('width', r*2);
      ci.setAttribute('height', r*2);
      ci.style.imageRendering='pixelated';
      ci.setAttribute('pointer-events','none');
      grp.appendChild(ci);
      // Store reference for animation
      gPlanetImgEls[id] = ci;

      // Faction stroke ring over the planet
      var strokeRing=document.createElementNS('http://www.w3.org/2000/svg','circle');
      strokeRing.setAttribute('cx',m.x);strokeRing.setAttribute('cy',m.y);strokeRing.setAttribute('r',r);
      strokeRing.setAttribute('fill','none');strokeRing.setAttribute('stroke',f.color);
      strokeRing.setAttribute('stroke-width', sel ? '2.5' : '1.5');
      strokeRing.setAttribute('opacity', sel ? '0.9' : '0.55');
      strokeRing.setAttribute('pointer-events','none');
      grp.appendChild(strokeRing);
    } else {
      // Fallback: original circle
      ci=document.createElementNS('http://www.w3.org/2000/svg','circle');
      ci.setAttribute('cx',m.x);ci.setAttribute('cy',m.y);ci.setAttribute('r',r);
      ci.setAttribute('fill',f.dim+'cc');ci.setAttribute('stroke',f.color);ci.setAttribute('stroke-width','2');
      grp.appendChild(ci);
      // Faction symbol text
      var sym=document.createElementNS('http://www.w3.org/2000/svg','text');
      sym.setAttribute('x',m.x);sym.setAttribute('y',m.y+5);
      sym.setAttribute('text-anchor','middle');sym.setAttribute('font-size','13');
      sym.setAttribute('fill',f.color);sym.setAttribute('pointer-events','none');
      sym.textContent=f.sym;
      grp.appendChild(sym);
    }

    // Name label
    var lbl=document.createElementNS('http://www.w3.org/2000/svg','text');
    var labelY=m.y + r + (planets.length > 0 ? planets.length*8+18 : 16);
    lbl.setAttribute('y',labelY);
    var lblAnchor = m.x < 100 ? 'start' : (m.x > 980 ? 'end' : 'middle');
    var lblX = m.x < 100 ? m.x - r + 4 : (m.x > 980 ? m.x + r - 4 : m.x);
    lbl.setAttribute('x', lblX);
    lbl.setAttribute('text-anchor', lblAnchor);
    lbl.setAttribute('font-size','13');
    lbl.setAttribute('fill',id==='flesh_station'?'#ffd700':'#ccc');
    lbl.setAttribute('letter-spacing','1.2');lbl.setAttribute('pointer-events','none');
    lbl.textContent=m.name.toUpperCase();
    grp.appendChild(lbl);

    // Planet count badge
    if(planets.length>0){
      var badge=document.createElementNS('http://www.w3.org/2000/svg','text');
      badge.setAttribute('x',m.x+r+2);badge.setAttribute('y',m.y-r+3);
      badge.setAttribute('font-size','10');badge.setAttribute('fill',f.color);
      badge.setAttribute('opacity','0.7');badge.setAttribute('pointer-events','none');
      badge.textContent=planets.length+'p';
      grp.appendChild(badge);
    }

    // Contested marker
    if(contested){
      var wt=document.createElementNS('http://www.w3.org/2000/svg','text');
      wt.setAttribute('x',m.x-r-8);wt.setAttribute('y',m.y-r+5);
      wt.setAttribute('font-size','12');wt.setAttribute('fill','#f39c12');
      wt.setAttribute('pointer-events','none');wt.textContent='!';
      grp.appendChild(wt);
    }
    // New frontier colonies — show ◇ UNCLAIMED badge
    if(['eyejog','dust_basin','nova_reach','iron_shelf','the_ledger','signal_run'].indexOf(id)!==-1){
      var uncl=document.createElementNS('http://www.w3.org/2000/svg','text');
      uncl.setAttribute('x',m.x);uncl.setAttribute('y',m.y+r+28+(planets.length>0?planets.length*8:0));
      uncl.setAttribute('text-anchor','middle');uncl.setAttribute('font-size','9');
      uncl.setAttribute('fill','#555');uncl.setAttribute('letter-spacing','1.5');
      uncl.setAttribute('pointer-events','none');uncl.textContent='FRONTIER';
      grp.appendChild(uncl);
    }
    // Eyejog — special guild amber marker
    if(id==='eyejog'){
      var gmark=document.createElementNS('http://www.w3.org/2000/svg','text');
      gmark.setAttribute('x',m.x);gmark.setAttribute('y',m.y+r+38+(planets.length>0?planets.length*8:0));
      gmark.setAttribute('text-anchor','middle');gmark.setAttribute('font-size','9');
      gmark.setAttribute('fill','#2ecc71');gmark.setAttribute('opacity','0.7');
      gmark.setAttribute('pointer-events','none');gmark.textContent='⬢ M.GUILD';
      grp.appendChild(gmark);
    }

    // Flesh Station gold pulse ring
    if(id==='flesh_station'){
      var pulse=document.createElementNS('http://www.w3.org/2000/svg','circle');
      pulse.setAttribute('cx',m.x);pulse.setAttribute('cy',m.y);pulse.setAttribute('r',r+2);
      pulse.setAttribute('fill','none');pulse.setAttribute('stroke','#ffd700');
      pulse.setAttribute('stroke-width','1');pulse.setAttribute('opacity','0.4');
      pulse.setAttribute('pointer-events','none');
      grp.appendChild(pulse);
    }

    // Hover / click events
    grp.addEventListener('click',function(){ selectColony(id); });
    grp.addEventListener('mouseenter',function(){
      or2.setAttribute('opacity','0.55');
      spStartMapAnim(id);
    });
    grp.addEventListener('mouseleave',function(){
      or2.setAttribute('opacity', gSelected===id ? '0.65' : '0.18');
      if(gSelected !== id) spStopMapAnim(id);
    });
    g.appendChild(grp);
  });

  // Re-animate currently selected colony
  if(gSelected && gPlanetImgEls[gSelected]){
    spStartMapAnim(gSelected);
  }
}

// Colony detail panel
function selectColony(id){
  gSelected=id; renderMap(); renderLanes(); renderDetail(id);
}
window.renderDetail=function(id){ renderDetail(id); };

function renderDetail(id){
  var el=document.getElementById('gColonyDetailInner'); if(!el) return;
  var m=COLONY_META[id]; if(!m) return;
  var s=gState[id]||{faction:(id==='flesh_station'?'fleshstation':'coalition')};
  var fac=getLeadingFaction(s);
  var f=FACTIONS[fac]||FACTIONS.coalition;
  var isFlesh=(id==='flesh_station');
  var isEyejog=(id==='eyejog');
  var isFrontier=['dust_basin','nova_reach','iron_shelf','the_ledger','signal_run'].indexOf(id)!==-1;
  var ctrl={coalition:s.control_coalition||0, syndicate:s.control_syndicate||0, void:s.control_void||0, guild:s.control_guild||0};
  var tension=s.tension||0; var contested=s.contested&&!isFlesh; var wc=s.war_chest||0;

  var h='';
  h+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px">'
   +'<span style="font-size:.92rem;letter-spacing:.16em;color:'+f.color+';font-weight:bold">'+m.name.toUpperCase()+'</span>'
   +(isFlesh||isEyejog?'':'<button onclick="spOpenSystem(\''+id+'\');" '
   +'style="background:transparent;border:1px solid #2a2a3e;color:#8888aa;padding:3px 8px;cursor:pointer;font-size:.65rem;font-family:inherit;letter-spacing:.08em;border-radius:2px;white-space:nowrap;flex-shrink:0" '
   +'onmouseover="this.style.borderColor=\'#4ecdc4\';this.style.color=\'#4ecdc4\'" '
   +'onmouseout="this.style.borderColor=\'#2a2a3e\';this.style.color=\'#8888aa\'">&#x2B22; SYSTEM</button>')
   +'</div>';
  h+='<div style="font-size:.76rem;color:#555;letter-spacing:.1em;margin-bottom:10px">'+(isFlesh?'MEGASTRUCTURE':'')+'</div>';

  if(contested) h+='<div style="border:1px solid #f39c12;color:#f39c12;font-size:.72rem;padding:4px 8px;margin-bottom:10px">&#9888; CONTESTED — Faction war active</div>';
  if(isFlesh)   h+='<div style="border:1px solid #ffd70066;color:#ffd700;font-size:.72rem;padding:4px 8px;margin-bottom:10px">&#9889; HOME OF MR. FLESH — Cannot be contested or funded</div>';
  if(isEyejog)  h+='<div style="border:1px solid #2ecc7166;color:#2ecc71;font-size:.72rem;padding:4px 8px;margin-bottom:10px">⬢ MERCHANT GUILD SOVEREIGN — <a href="https://www.patreon.com" target="_blank" style="color:#2ecc71">PATREON ONLY</a></div>';

  // Space Asset: landscape banner
  var banner = COLONY_BANNER[id];
  if(banner){
    h+='<img src="assets/space/landscapes/'+banner+'.png" class="space-banner" alt="">';
  }
  // Space Asset: large animated planet in detail panel
  var pData2 = COLONY_PLANET[id];
  if(pData2){
    var pColor2 = f.color||'#4ecdc4';
    h+='<div class="space-detail-planet"><img id="gDetailPlanetImg" src="assets/space/planets/'+pData2.folder+'/1.png" style="width:64px;height:64px;image-rendering:pixelated;filter:drop-shadow(0 0 10px '+pColor2+')"></div>';
  }
  h+='<div style="font-size:.78rem;color:#777;line-height:1.6;margin-bottom:12px;border-left:2px solid '+f.dim+';padding-left:8px">'+m.lore+'</div>';

  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-bottom:12px">';
  h+='<div><div style="font-size:.66rem;color:#555;letter-spacing:.08em">POPULATION</div><div style="font-size:.84rem;color:#ccc">'+m.pop+'</div></div>';
  if(!isFlesh) h+='<div><div style="font-size:.66rem;color:#555;letter-spacing:.08em">TENSION</div><div style="font-size:.84rem;color:'+(tension>40?'#f39c12':'#ccc')+'">'+tension+'%</div></div>';
  h+='</div>';

  // Planets grid
  h+='<div style="margin-bottom:14px"><div style="font-size:.68rem;color:#555;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">'+(SP_STATION_ORBIT[id]?'Station Modules':'Planets ('+m.planets.length+')')+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr;gap:5px">';
  var _isSingleBody = SP_SINGLE_BODY[id];
  m.planets.forEach(function(p, pidx){
    var pCol = FACTIONS[fac] ? f.color : '#888';
    // Single-body colonies (Eyejog, Lustandia, etc) have no system view — render as static info cards
    if(_isSingleBody){
      h+='<div style="background:#0a0a12;border:1px solid '+f.dim+';border-radius:2px;padding:6px 8px">';
    } else {
      h+='<div onclick="spOpenSystem(\''+id+'\');setTimeout(function(){spOpenSurface(\''+id+'\','+pidx+')},400);" '
        +'style="background:#0a0a12;border:1px solid '+f.dim+';border-radius:2px;padding:6px 8px;cursor:pointer;transition:border-color .15s" '
        +'onmouseover="this.style.borderColor=\''+f.color+'\';this.style.background=\'#0d0d18\'" '
        +'onmouseout="this.style.borderColor=\''+f.dim+'\';this.style.background=\'#0a0a12\'">';
    }
    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
    var pIcon16 = (p.isStation || _spIconForZoneName(p.name)) ? 'Tech2' : SECTOR_PLANET_ICON[p.sector];
    var pIconHtml = pIcon16 ? '<img src="assets/space/planets/icons/'+pIcon16+'.png" class="space-picon">' : (p.icon+' ');
    h+='<span style="display:flex;align-items:center;gap:3px;font-size:.76rem;color:'+pCol+';letter-spacing:.06em">'+pIconHtml+p.name+'</span>';
    if(!_isSingleBody) h+='<span style="font-size:.68rem;color:#444;letter-spacing:.06em">ENTER ›</span>';
    h+='</div>';
    h+='<div style="font-size:.70rem;color:#888;line-height:1.5">'+p.bonus+'</div>';
    if(contested) h+='<div style="font-size:.68rem;color:#f39c12;margin-top:2px">'+p.contestBonus+'</div>';
    h+='</div>';
  });
  h+='</div></div>';

  // Active bonus callout for player's faction
  if(gPlayerFaction && gPlayerFaction===fac && !isFlesh){
    var bonusMap=SECTOR_BONUS_TABLE[id]&&SECTOR_BONUS_TABLE[id][gPlayerFaction];
    if(bonusMap && Object.keys(bonusMap).length){
      h+='<div style="background:'+f.dim+'44;border:1px solid '+f.color+'55;border-radius:2px;padding:6px 10px;margin-bottom:12px">';
      h+='<div style="font-size:.68rem;color:'+f.color+';letter-spacing:.1em;margin-bottom:4px">&#10003; YOUR FACTION BONUS ACTIVE</div>';
      Object.entries(bonusMap).forEach(function(entry){
        var secName=SECTOR_NAMES[Number(entry[0])]||'?';
        h+='<div style="font-size:.72rem;color:#bbb">'+secName+' dividends: <span style="color:'+f.color+'">'+entry[1]+'</span></div>';
      });
      h+='</div>';
    }
  }

  // Control bars (not for flesh station)
  if(!isFlesh && !isEyejog){
    if(wc>0) h+='<div style="font-size:.68rem;color:#555;letter-spacing:.08em;margin-bottom:2px">WAR CHEST</div><div style="font-size:.82rem;color:#f39c12;margin-bottom:10px">&#401;'+Math.round(wc).toLocaleString()+'</div>';
    h+='<div style="margin-bottom:12px"><div style="font-size:.68rem;color:#555;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">Faction Control</div>';
    var detailFactions=['coalition','syndicate','void'];
    if(ctrl.guild||0) detailFactions.push('guild');
    detailFactions.forEach(function(fid){
      var fc=FACTIONS[fid]; var p2=ctrl[fid]||0;
      h+='<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:.70rem;margin-bottom:2px"><span style="color:'+fc.color+'">'+fc.short+'</span><span style="color:#555">'+p2+'%</span></div>';
      h+='<div style="background:#111;height:4px;border-radius:1px"><div style="background:'+fc.color+';width:'+p2+'%;height:100%;border-radius:1px;transition:width .4s ease"></div></div></div>';
    });
    h+='</div>';

    h+='<div style="margin-bottom:12px"><div style="font-size:.68rem;color:#555;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">Key Operators</div>';
    m.companies.slice(0,4).forEach(function(co){ h+='<div style="font-size:.74rem;color:#666;padding:2px 0;border-bottom:1px solid #111">'+co+'</div>'; });
    if(m.companies.length>4) h+='<div style="font-size:.68rem;color:#444;padding-top:3px">+'+(m.companies.length-4)+' more</div>';
    h+='</div>';

    if(isEyejog){
      h+='<div style="margin-top:10px;padding:10px 12px;border:1px solid #2ecc71aa;border-radius:4px;background:#061a0d">'
       +'<div style="font-size:.72rem;color:#2ecc71;letter-spacing:.1em;margin-bottom:6px">⬢ MERCHANT GUILD SOVEREIGN TERRITORY</div>'
       +'<div style="font-size:.68rem;color:#1a8c4a;line-height:1.6">Eyejog cannot be contested or captured. The Merchant Guild holds permanent sovereignty. Patreon supporters may align with the Guild across all contested colonies.</div>'
       +'<div style="margin-top:8px"><a href="https://www.patreon.com" target="_blank" style="font-size:.68rem;color:#2ecc71;letter-spacing:.08em;text-decoration:none;border:1px solid #2ecc7166;padding:3px 10px;border-radius:2px">⬢ JOIN THE GUILD →</a></div>'
       +'</div>';
    } else if(!isFlesh){
      h+='<div><div style="font-size:.68rem;color:#555;letter-spacing:.1em;margin-bottom:8px;text-transform:uppercase">Fund a Faction</div>';
      ['coalition','syndicate','void'].forEach(function(fid){
        var fc=FACTIONS[fid];
        h+='<div style="margin-bottom:5px" id="gFR_'+id+'_'+fid+'"><button onclick="window.gShowFund(\''+id+'\',\''+fid+'\')" style="width:100%;background:transparent;border:1px solid '+fc.dim+';color:'+fc.color+';padding:5px 8px;cursor:pointer;font-size:.73rem;letter-spacing:.06em;font-family:inherit;text-align:left">'+fc.name+' — '+(ctrl[fid]||0)+'% ctrl</button></div>';
      });
      h+='</div>';
    }
  } else {
    // Flesh Station: show companies, no funding
    h+='<div><div style="font-size:.68rem;color:#555;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">Core Systems</div>';
    m.companies.forEach(function(co){ h+='<div style="font-size:.74rem;color:#ffd70066;padding:2px 0;border-bottom:1px solid #1a1200">'+co+'</div>'; });
    h+='</div>';
  }

  el.innerHTML=h;
  // Start animated planet in detail panel
  if(COLONY_PLANET[id]) setTimeout(function(){ spStartDetailAnim(id); }, 0);

  // ── Append Galaxy Systems panels (smuggling, blockade, contracts) ──
  if (!isFlesh && !isEyejog) {
    var sysDiv = document.createElement('div');
    sysDiv.id = 'gSysPanels_'+id;
    sysDiv.style.cssText = 'margin-top:14px;border-top:1px solid #1a1a2e;padding-top:10px';

    var connLanes = [];
    if (window._FM_LANES) {
      window._FM_LANES.forEach(function(l) { if (l.from===id || l.to===id) connLanes.push(l); });
    }

    var sh = '';
    // ── SHIPPING/SMUGGLING — moved to Shipping tab ──
    sh += '<div style="margin-bottom:14px">';
    sh += '<div style="font-size:.66rem;color:#3498db;padding:8px;border:1px solid #1a1a2e;border-radius:3px;text-align:center;cursor:pointer" onclick="document.querySelector(\'[data-gstab=shipping]\').click()">📦 Open Shipping &amp; Smuggling Tab →</div>';
    sh += '<div id="gSmugStatus" style="font-size:.66rem;color:#555;margin-top:6px"></div>';
    sh += '</div>';

    // ── BLOCKADE PANEL ──
    sh += '<div style="margin-bottom:14px">'
      +'<div style="font-size:.68rem;color:#f39c12;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">\u26D4 BLOCKADES</div>';
    if (connLanes.length > 0) {
      sh += '<select id="gBlkLane" style="width:100%;background:#0a0a14;border:1px solid #333;color:#aaa;padding:4px;font-size:.64rem;font-family:inherit;margin-bottom:4px">';
      connLanes.forEach(function(l) {
        var dest = l.from===id ? l.to : l.from;
        var dn = (COLONY_META[dest]||{name:dest}).name;
        var lk = [l.from,l.to].sort().join('|');
        var st = (window._FM_BLOCKADES && window._FM_BLOCKADES[lk]) ? ' [ACTIVE]' : '';
        sh += '<option value="'+l.from+'|'+l.to+'">'+dn+st+'</option>';
      });
      sh += '</select>'
        +'<div style="display:flex;gap:4px;margin-bottom:4px">'
        +'<input id="gBlkAmt" type="number" placeholder="Fund (\u0192)" style="flex:1;background:#0a0a14;border:1px solid #f39c1244;color:#ccc;padding:4px;font-size:.64rem;font-family:inherit;outline:none">'
        +'<button onclick="window._gFundBlockade()" style="background:#2d1a00;border:1px solid #f39c12;color:#f39c12;padding:4px 8px;cursor:pointer;font-size:.58rem;font-family:inherit;letter-spacing:.06em">FUND</button>'
        +'<button onclick="window._gCounterBlk()" style="background:#0a1a2d;border:1px solid #3498db;color:#3498db;padding:4px 8px;cursor:pointer;font-size:.56rem;font-family:inherit;letter-spacing:.04em">COUNTER</button>'
        +'</div>'
        +'<div style="font-size:.60rem;color:#444">\u01925\u0030k activates a 2-hour blockade</div>';
    }
    sh += '</div>';

    // ── LANE SHARES PANEL ──
    sh += '<div style="margin-bottom:14px">'
      +'<div style="font-size:.82rem;color:#3498db;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">\uD83D\uDCCB LANE SHARES</div>';
    if (connLanes.length > 0) {
      connLanes.forEach(function(l) {
        var dest = l.from===id ? l.to : l.from;
        var dn = (COLONY_META[dest]||{name:dest}).name;
        var lk = [l.from,l.to].sort().join('|');
        var shd = (window._FM_SHARES||{})[lk] || {supply:0};
        var sup = shd.supply||0;
        var isMine = window._FM_MY_SHARE && window._FM_MY_SHARE.laneKey===lk;
        sh += '<div onclick="window._gSelectLane(\''+l.from+'\',\''+l.to+'\')" style="display:flex;justify-content:space-between;align-items:center;padding:5px 6px;margin-bottom:3px;background:#0a0a14;border:1px solid '+(isMine?'#3498db44':'#1a1a2e')+';cursor:pointer;border-radius:2px"'
          +' onmouseover="this.style.borderColor=\'#3498db\'" onmouseout="this.style.borderColor=\''+(isMine?'#3498db44':'#1a1a2e')+'\'">'
          +'<span style="font-size:.66rem;color:#aaa">'+dn+'</span>'
          +'<span style="font-size:.62rem;color:'+(sup>50?'#f39c12':'#555')+'">'+sup+'/100'+(isMine?' \u2605':'')+'</span>'
          +'</div>';
      });
      sh += '<div style="font-size:.58rem;color:#444;margin-top:3px">Click a lane for details \u2014 or use Contracts tab</div>';
    }
    sh += '</div>';

    sysDiv.innerHTML = sh;
    el.appendChild(sysDiv);
  }
}

window.gShowFund=function(cid,fid){
  var fc=FACTIONS[fid]; var row=document.getElementById('gFR_'+cid+'_'+fid); if(!row) return;
  row.innerHTML='<div style="display:flex;gap:4px"><input id="gFA_'+cid+'_'+fid+'" type="number" placeholder="Amount (&#401;)" style="flex:1;background:#0a0a14;border:1px solid '+fc.color+'44;color:#ccc;padding:4px 6px;font-size:.64rem;font-family:inherit;outline:none"/>'
    +'<button onclick="window.gDoFund(\''+cid+'\',\''+fid+'\')" style="background:'+fc.dim+';border:1px solid '+fc.color+';color:'+fc.color+';padding:4px 8px;cursor:pointer;font-size:.58rem;font-family:inherit">SEND</button>'
    +'<button onclick="renderDetail(\''+cid+'\')" style="background:transparent;border:1px solid #333;color:#555;padding:4px 6px;cursor:pointer;font-size:.58rem;font-family:inherit">&#10005;</button></div>';
  setTimeout(function(){ var i=document.getElementById('gFA_'+cid+'_'+fid); if(i) i.focus(); },40);
};

window.gDoFund=function(cid,fid){
  var inp=document.getElementById('gFA_'+cid+'_'+fid);
  var amt=inp?Number(inp.value):0;
  if(!amt||amt<1000){ gToast('Minimum: \u0192 1,000','#e74c3c'); return; }
  if(!gToken){ gToast('Log in to fund factions','#e74c3c'); return; }
  fetch(apiBase()+'/api/galaxy/fund',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:gToken,colonyId:cid,factionId:fid,amount:amt})
  }).then(function(r){return r.json();}).then(function(d){
    if(d.ok){
      // Immediately update client cash so P&L doesn't wait for WS round-trip
      if(typeof d.cash==='number'){
        if(typeof ME==='object'&&ME) ME.cash=d.cash;
        if(typeof window.__MY_CASH!=='undefined') window.__MY_CASH=d.cash;
        var cashEl=document.getElementById('cash');
        if(cashEl) cashEl.textContent='\u0192'+Number(d.cash).toLocaleString(undefined,{maximumFractionDigits:2});
        try{ liveUpdatePnL(null,null); }catch(_){}
        // Refresh portfolio so passive income counters recalculate (Syndicate colony bonus etc.)
        if(_gSyncPortfolioTimer) clearTimeout(_gSyncPortfolioTimer);
        _gSyncPortfolioTimer = setTimeout(function(){ _sendWSGalaxy({type:'portfolio_request'}); }, 500);
      }
      // Update gState optimistically before WS echo
      if(gState[cid]&&d.newControl){
        gState[cid].control_coalition=d.newControl.coalition;
        gState[cid].control_syndicate=d.newControl.syndicate;
        gState[cid].control_void=d.newControl.void;
        gState[cid].war_chest=(gState[cid].war_chest||0)+amt;
      }
      gToast('\u0192'+Number(amt).toLocaleString()+' deployed to '+FACTIONS[fid].name,FACTIONS[fid].color);
      renderDetail(cid); renderMap();
    } else {
      gToast(d.error||'Error','#e74c3c');
    }
  }).catch(function(){ gToast('Network error','#e74c3c'); });
};

// Factions panel
function renderFactionList(){
  var el=document.getElementById('gFactionList'); if(!el) return;
  var h='';
  // Main factions first, then fleshstation
  ['coalition','syndicate','void','guild','fleshstation'].forEach(function(fid){
    var f=FACTIONS[fid];
    var isP=(gPlayerFaction===fid);
    var isFlesh=(fid==='fleshstation');
    var myC=Object.values(gState).filter(function(c){
      if(isFlesh) return c.faction==='fleshstation';
      var leading=getLeadingFaction(c);
      return leading===fid && c.id!=='flesh_station';
    });
    var cont=myC.filter(function(c){return c.contested;}).length;
    var wc=myC.reduce(function(s,c){return s+(c.war_chest||0);},0);

    h+='<div style="background:'+(isP?f.bg:'#07070e')+';border:1px solid '+(isP?f.color:f.dim)+';border-radius:2px;padding:14px;margin-bottom:12px;position:relative">';

    var isGuild=(fid==='guild');
    // Dev-only banner
    if(isFlesh){
      h+='<div style="position:absolute;top:8px;right:10px;font-size:.70rem;color:#ffd700;border:1px solid #ffd70044;padding:2px 7px;letter-spacing:.08em">DEV ONLY</div>';
    }
    if(isGuild){
      h+='<div style="position:absolute;top:8px;right:10px;font-size:.70rem;color:#2ecc71;border:1px solid #2ecc7144;padding:2px 7px;letter-spacing:.08em">⬢ PATREON</div>';
    }

    h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    h+='<div style="font-size:1.0rem;letter-spacing:.16em;color:'+f.color+';font-weight:bold">'+f.sym+' '+f.name.toUpperCase()+'</div>';
    if(isP){
      h+='<div style="font-size:.72rem;color:'+f.color+';border:1px solid '+f.color+';padding:3px 8px">&#10003; ALIGNED</div>';
    } else if(isGuild){
      h+='<a href="https://www.patreon.com" target="_blank" style="background:'+f.dim+';border:1px solid '+f.color+';color:'+f.color+';padding:4px 12px;cursor:pointer;font-size:.76rem;letter-spacing:.08em;font-family:inherit;text-decoration:none">JOIN ON PATREON ›</a>';
    } else if(!isFlesh){
      if(fid==='void'){
        h+='<button onclick="window.gJoinFaction(\'void\')" style="background:'+f.dim+';border:1px solid '+f.color+';color:'+f.color+';padding:4px 12px;cursor:pointer;font-size:.76rem;letter-spacing:.08em;font-family:inherit">\u26A0 CONVERT</button>';
      } else {
        h+='<button onclick="window.gJoinFaction(\''+fid+'\')" style="background:'+f.dim+';border:1px solid '+f.color+';color:'+f.color+';padding:4px 12px;cursor:pointer;font-size:.76rem;letter-spacing:.08em;font-family:inherit">JOIN</button>';
      }
    } else {
      h+='<div style="font-size:.70rem;color:#666;border:1px solid #333;padding:3px 8px">LOCKED</div>';
    }
    h+='</div>';

    h+='<div style="font-size:.82rem;color:#aaa;line-height:1.6;margin-bottom:10px">'+f.desc+'</div>';

    // Void Collective permanent conversion warning
    if(fid==='void' && !isP){
      h+='<div style="background:#2d1a4022;border:1px solid #9b59b644;padding:8px 10px;margin-bottom:10px;border-radius:2px">';
      h+='<div style="font-size:.72rem;color:#e74c3c;letter-spacing:.08em;margin-bottom:4px">\u26A0 PERMANENT CYBERNETIC CONVERSION</div>';
      h+='<div style="font-size:.70rem;color:#9b59b6;line-height:1.5">Joining the Void Collective permanently converts your account into a cyborg. You receive a robot badge next to your name and +\u019215 passive income forever. <span style="color:#e74c3c">This cannot be reversed.</span> The only way to leave is through the Merchant Guild (Patreon).</div>';
      h+='</div>';
    }
    if(fid==='void' && isP){
      h+='<div style="background:#2d1a4022;border:1px solid #9b59b644;padding:8px 10px;margin-bottom:10px;border-radius:2px">';
      h+='<div style="font-size:.72rem;color:#9b59b6;letter-spacing:.08em">CYBORG AUGMENTS ACTIVE \u2014 +\u019215/30min permanent</div>';
      h+='</div>';
    }
    h+='<div style="background:#ffffff05;border:1px solid '+f.dim+';padding:6px 10px;margin-bottom:10px">';
    h+='<div style="font-size:.68rem;color:#666;letter-spacing:.08em;margin-bottom:4px">ACTIVE BONUSES</div>';
    h+='<div style="font-size:.82rem;color:'+f.color+'">'+f.bonusSummary+'</div></div>';

    h+='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">';
    h+='<div style="background:#ffffff04;padding:5px;text-align:center"><div style="font-size:.66rem;color:#666">SYSTEMS</div><div style="font-size:.82rem;color:#bbb">'+myC.length+'</div></div>';
    if(!isFlesh){
      h+='<div style="background:#ffffff04;padding:5px;text-align:center"><div style="font-size:.66rem;color:#666">CONTESTED</div><div style="font-size:.96rem;color:'+(cont?'#f39c12':'#ccc')+'">'+cont+'</div></div>';
      h+='<div style="background:#ffffff04;padding:5px;text-align:center"><div style="font-size:.66rem;color:#666">WAR CHEST</div><div style="font-size:.82rem;color:#ccc">&#401;'+Math.round(wc).toLocaleString()+'</div></div>';
    } else {
      h+='<div style="background:#ffffff04;padding:5px;text-align:center;grid-column:span 2"><div style="font-size:.66rem;color:#666">STATUS</div><div style="font-size:.78rem;color:#ffd700">PERMANENT CONTROL</div></div>';
    }
    h+='</div>';

    // Planet count for this faction
    var planetCount=myC.reduce(function(s,c){ var mn=COLONY_META[c.id]; return s+(mn?mn.planets.length:0); },0);
    if(planetCount>0){
      h+='<div style="font-size:.72rem;color:#666;margin-bottom:5px">'+planetCount+' planet'+(planetCount!==1?'s':'')+' in '+myC.length+' system'+(myC.length!==1?'s':'')+'</div>';
    }

    // System chips
    h+='<div style="display:flex;flex-wrap:wrap;gap:4px">';
    myC.forEach(function(c){
      var mn=COLONY_META[c.id]; if(!mn) return;
      var pCount=mn.planets.length;
      h+='<span style="font-size:.72rem;color:'+(c.contested?'#f39c12':f.color)+';background:#ffffff04;border:1px solid '+(c.contested?'#f39c1230':f.dim)+';padding:2px 6px">';
      h+=(c.contested?'! ':'')+mn.name+' ('+pCount+'p)</span>';
    });
    h+='</div></div>';
  });
  el.innerHTML=h;
}

window.gJoinFaction=function(fid){
  if(!gToken){ gToast('Log in to join a faction','#e74c3c'); return; }
  if(fid==='void'){
    if(!confirm('\u26A0 PERMANENT CYBERNETIC CONVERSION\n\nJoining the Void Collective will:\n\u2022 Permanently lock your account to this faction\n\u2022 Give you a cyborg badge\n\u2022 Grant +\u019215 passive income forever\n\nThe ONLY way to leave is through the Merchant Guild (Patreon).\n\nThis CANNOT be undone. Are you sure?')) return;
  }
  fetch(apiBase()+'/api/galaxy/join-faction',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({token:gToken,factionId:fid})
  }).then(function(r){return r.json();}).then(function(d){
    if(d.ok){
      gPlayerFaction=fid;
      if(d.voidLocked) window._FM_VOID_LOCKED=true;
      gToast('Aligned with '+FACTIONS[fid].name+(d.voidLocked?' \u2014 Cybernetic conversion complete':''),FACTIONS[fid].color);
      renderFactionList();
    }
    else gToast(d.error||'Error','#e74c3c');
  }).catch(function(){ gToast('Network error','#e74c3c'); });
};

// WS live updates
document.addEventListener('fm_ws_msg',function(e){
  var msg=e.detail; if(!msg) return;
  if(msg.type==='colony_update'&&msg.data&&msg.data.colonyId){
    var d=msg.data; if(!gState[d.colonyId]) gState[d.colonyId]={id:d.colonyId};
    Object.keys(d).forEach(function(k){ gState[d.colonyId][k]=d[k]; });
    if(gMapActive){ renderMap(); if(gSelected===d.colonyId) renderDetail(d.colonyId); }
  }
  if(msg.type==='colony_conquered'&&msg.data){
    var fn=FACTIONS[msg.data.newFaction]||{name:'?',color:'#f39c12'};
    gToast(fn.name+' seizes '+msg.data.colonyName+'!',fn.color);
    // Auto-inject a news headline for the conquest
    var conquestNews = {
      t: Date.now(),
      tone: 'good',
      text: '🏴 COLONY REPORT: '+fn.name+' establish control of '+msg.data.colonyName+' — faction bonuses now active for aligned investors, rival factions withdrawing'
    };
    renderNews(conquestNews);
    galaxyFetch();
    // Refresh passive income — colony control changed
    setTimeout(function(){ _sendWSGalaxy({type:'portfolio_request'}); }, 800);
  }
  if(msg.type==='welcome'&&msg.data&&msg.data.faction){
    gPlayerFaction=msg.data.faction;
  }
  if(msg.type==='faction_joined'&&msg.data&&msg.data.faction){
    gPlayerFaction=msg.data.faction;
    // Refresh passive income — faction changed affects Syndicate bonus etc.
    setTimeout(function(){ _sendWSGalaxy({type:'portfolio_request'}); }, 500);
  }

  // ── Galaxy Systems WS handlers ──
  if(msg.type==='smuggling_result'&&msg.data){
    var d=msg.data;
    _gSyncCash(d.cash);
    if(d.success){
      gToast('Smuggling cleared! +\u0192'+Number(d.payout).toLocaleString()+' ('+d.cargo+')','#2ecc71');
    } else {
      gToast('INTERCEPTED! Lost \u0192'+Number(d.stake).toLocaleString()+' — '+d.cargo+' cargo seized','#e74c3c');
    }
    window._activeSmugRun=null;
    if(gMapActive) renderLanes();
    window._shippingAddLog(d);
    var ss=document.getElementById('gSmugStatus');
    if(ss) ss.innerHTML = d.success
      ? '<span style="color:#2ecc71">\u2713 Delivered '+d.cargo+' — \u0192'+Number(d.payout).toLocaleString()+' earned ('+d.interceptChance+'% risk)</span>'
      : '<span style="color:#e74c3c">\u2718 Intercepted — \u0192'+Number(d.stake).toLocaleString()+' lost ('+d.interceptChance+'% risk)</span>';
  }
  if(msg.type==='smuggling_started'&&msg.data){
    var d2=msg.data;
    _gSyncCash(d2.cash);
    gToast('Smuggling run launched — '+d2.cargo+' via '+d2.laneType+' lane','#e74c3c');
    window._activeSmugRun={from:d2.from,to:d2.to,cargo:d2.cargo,stake:d2.stake,resolveTs:d2.resolveTs,durSec:d2.durSec,type:'smuggling'};
    if(gMapActive) renderLanes();
    var ss2=document.getElementById('gSmugStatus');
    if(ss2){
      var secLeft=d2.durSec;
      ss2.innerHTML='<span style="color:#e74c3c">EN ROUTE — '+secLeft+'s remaining...</span>';
      var _smgIv=setInterval(function(){
        secLeft--;
        if(secLeft<=0){ clearInterval(_smgIv); ss2.innerHTML='<span style="color:#555">Resolving...</span>'; window._activeSmugRun=null; if(gMapActive) renderLanes(); return; }
        ss2.innerHTML='<span style="color:#e74c3c">EN ROUTE — '+secLeft+'s remaining...</span>';
      },1000);
    }
  }
  if(msg.type==='smuggling_error') gToast(msg.error||'Smuggling error','#e74c3c');

  // ── Shipping WS handlers ──
  if(msg.type==='shipping_result'&&msg.data){
    var sd=msg.data;
    _gSyncCash(sd.cash);
    if(sd.success){
      gToast('Shipping delivered! +\u0192'+Number(sd.payout).toLocaleString()+' ('+sd.cargo+')','#2ecc71');
    } else if(sd.insured){
      gToast('Cargo lost but INSURED — only lost \u0192'+Number(sd.insurancePaid||sd.netLoss||0).toLocaleString()+' premium','#f39c12');
    } else {
      gToast('CARGO LOST! \u0192'+Number(sd.stake).toLocaleString()+' gone — no insurance','#e74c3c');
    }
    window._activeShipRun=null;
    if(gMapActive) renderLanes();
    window._shippingAddLog(sd);
    try{ window.renderShippingTab(); }catch(_){}
  }
  if(msg.type==='shipping_started'&&msg.data){
    var sd2=msg.data;
    _gSyncCash(sd2.cash);
    var insLabel=sd2.insured?' (insured)':'';
    gToast('Shipping run launched — '+sd2.cargo+insLabel,'#3498db');
    window._activeShipRun={from:sd2.from,to:sd2.to,cargo:sd2.cargo,stake:sd2.stake,insured:sd2.insured,resolveTs:sd2.resolveTs,durSec:sd2.durSec,type:'shipping'};
    if(gMapActive) renderLanes();
    // Start countdown timer
    window._shipCountdownIv && clearInterval(window._shipCountdownIv);
    window._shipCountdownIv=setInterval(function(){
      if(!window._activeShipRun) { clearInterval(window._shipCountdownIv); return; }
      var left=Math.max(0,Math.ceil((window._activeShipRun.resolveTs-Date.now())/1000));
      var el=document.getElementById('gShipCountdownTimer');
      if(el) el.textContent=left>0?'EN ROUTE — '+left+'s remaining...':'Resolving...';
      if(left<=0){ clearInterval(window._shipCountdownIv); window._activeShipRun=null; if(gMapActive) renderLanes(); }
    },1000);
    try{ window.renderShippingTab(); }catch(_){}
  }
  if(msg.type==='shipping_error') gToast(msg.error||'Shipping error','#e74c3c');
  if(msg.type==='shipping_status'){
    window._activeShipRun=msg.data||null;
    try{ window.renderShippingTab(); }catch(_){}
  }

  // ── Void raid income ──
  if(msg.type==='void_raid_income'&&msg.data){
    gToast('\u2620 Void raid: +\u0192'+Number(msg.data.amount).toLocaleString()+' from intercepted cargo on '+msg.data.lane.replace(/_/g,' '),'#9b59b6');
    _gSyncCash(undefined); // trigger portfolio refresh
  }
  // ── Lane share kickback ──
  if(msg.type==='lane_kickback'&&msg.data){
    gToast('\uD83D\uDCB0 Lane kickback: +\u0192'+Number(msg.data.amount).toLocaleString()+' from trade volume','#3498db');
    _gSyncCash(undefined);
  }
  // ── Trade config (risk calculator data) ──
  if(msg.type==='trade_config'&&msg.data){
    window._FM_TRADE_CONFIG=msg.data;
    try{ window.renderShippingTab(); }catch(_){}
  }
  if(msg.type==='blockade_update'&&msg.data){
    var bd=msg.data;
    window._FM_BLOCKADES = window._FM_BLOCKADES||{};
    if(bd.active) window._FM_BLOCKADES[bd.laneKey]={active:true,pool:bd.pool,faction:bd.faction,expiresAt:bd.expiresAt};
    else delete window._FM_BLOCKADES[bd.laneKey];
    if(bd.broken) gToast('Blockade broken! Trade flow restored','#2ecc71');
    else if(bd.active) gToast('Blockade active on '+bd.laneKey.replace(/\|/g,' \u2194 ').replace(/_/g,' '),'#f39c12');
    if(gMapActive) renderLanes();
  }
  if(msg.type==='blockade_funded'&&msg.data){
    _gSyncCash(msg.data.cash);
    gToast('\u0192'+Number(msg.data.contributed).toLocaleString()+' invested in blockade (pool: \u0192'+Number(msg.data.pool).toLocaleString()+'/50,000)','#f39c12');
  }
  if(msg.type==='blockade_error') gToast(msg.error||'Blockade error','#e74c3c');
  if(msg.type==='counter_blockade_result'&&msg.data){
    _gSyncCash(msg.data.cash);
    gToast(msg.data.broken?'Blockade broken!':'Counter-funded \u0192'+Number(msg.data.contributed).toLocaleString(),msg.data.broken?'#2ecc71':'#3498db');
  }
  // ── Lane Shares WS handlers ──
  if(msg.type==='share_update'&&msg.data){
    var sd=msg.data;
    window._FM_SHARES = window._FM_SHARES||{};
    if(sd.voided) delete window._FM_SHARES[sd.laneKey];
    else window._FM_SHARES[sd.laneKey]={supply:sd.supply,buyPrice:sd.buyPrice,sellPrice:sd.sellPrice};
    if(gMapActive) renderLanes();
    try{ renderContractsTable(); }catch(_){}
  }
  if(msg.type==='share_bought'&&msg.data){
    _gSyncCash(msg.data.cash);
    window._FM_MY_SHARE={laneKey:msg.data.laneKey,slot:msg.data.slot,purchasePrice:msg.data.price,dividendsEarned:0};
    gToast('Share acquired! Slot #'+msg.data.slot+' on '+msg.data.laneKey.replace(/\|/g,' \u2194 ').replace(/_/g,' ')+' — \u0192'+Number(msg.data.price).toLocaleString(),'#3498db');
    try{ renderContractsTable(); }catch(_){}
  }
  if(msg.type==='share_sold'&&msg.data){
    _gSyncCash(msg.data.cash);
    var gain=msg.data.sellPrice-msg.data.purchasePrice;
    var divs=msg.data.dividendsEarned||0;
    window._FM_MY_SHARE=null;
    gToast('Share sold for \u0192'+Number(msg.data.sellPrice).toLocaleString()+' (P&L: '+(gain>=0?'+':'')+'\u0192'+Number(gain).toLocaleString()+', dividends: \u0192'+Number(divs).toLocaleString()+')',gain>=0?'#2ecc71':'#e74c3c');
    try{ renderContractsTable(); }catch(_){}
  }
  if(msg.type==='share_swapped'&&msg.data){
    _gSyncCash(msg.data.cash);
    window._FM_MY_SHARE={laneKey:msg.data.newLane,slot:0,purchasePrice:msg.data.boughtFor,dividendsEarned:0};
    gToast('Swapped! Sold \u0192'+Number(msg.data.soldFor).toLocaleString()+' \u2192 Bought \u0192'+Number(msg.data.boughtFor).toLocaleString(),'#3498db');
    try{ renderContractsTable(); }catch(_){}
  }
  if(msg.type==='share_dividend'&&msg.data){
    _gSyncCash(msg.data.cash);
    if(window._FM_MY_SHARE) window._FM_MY_SHARE.dividendsEarned=msg.data.totalDividends;
    var wmLabel=msg.data.warMult<1?' (war: \u00d7'+msg.data.warMult+')':'';
    gToast('Dividend: +\u0192'+Number(msg.data.dividend).toLocaleString()+wmLabel,'#2ecc71');
  }
  if(msg.type==='share_status'&&msg.data){
    window._FM_MY_SHARE=msg.data;
    try{ renderContractsTable(); }catch(_){}
  }
  if(msg.type==='share_error') gToast(msg.error||'Share error','#e74c3c');
  if(msg.type==='tension_event'&&msg.data){
    var te=msg.data;
    var cMeta=COLONY_META[te.colonyId];
    gToast('\u26A0 Tension '+te.bandLabel+' at '+(cMeta?cMeta.name:te.colonyId)+' — '+te.affected+' stocks hit','#f39c12');
  }
  if(msg.type==='galaxy_data'&&msg.data){
    window._FM_BLOCKADES = msg.data.blockades||{};
    window._FM_SHARES = msg.data.shareSummaries||{};
    window._FM_MY_SHARE = msg.data.myShare||null;
    if(msg.data.shareCurve) window._FM_SHARE_CURVE = msg.data.shareCurve;
    if(msg.data.cargoTypes) window._FM_CARGO_TYPES = msg.data.cargoTypes;
    if(gMapActive) renderLanes();
    try{ renderContractsTable(); }catch(_){}
  }
});

// ── Lane Shares Market Table ──────────────────────────────────────────────────
var LANE_TYPE_COLOR = {corporate:'#4ecdc4',grey:'#999',dark:'#9b59b6',contested:'#f39c12'};
var LANE_RISK = {corporate:{intercept:0.15},grey:{intercept:0.28},contested:{intercept:0.40},dark:{intercept:0.55}};
var VOL_LABEL = {high:'HIGH',medium:'MED',low:'LOW'};
var SHARE_DIVIDEND_CLIENT = {high:50,medium:20,low:8};

function _colonyName(id){
  var m = COLONY_META[id];
  return m ? m.name : id.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();});
}

function _shareBuyPrice(vol, supply){
  var cfg = (window._FM_SHARE_CURVE||{})[vol] || {base:200,div:100};
  var N = supply + 1;
  return Math.round(cfg.base * (1 + (N*N) / cfg.div));
}
function _shareSellPrice(vol, supply){
  if(supply<=0) return 0;
  var cfg = (window._FM_SHARE_CURVE||{})[vol] || {base:200,div:100};
  return Math.round(cfg.base * (1 + (supply*supply) / cfg.div));
}

function renderContractsTable(){
  var el = document.getElementById('gContractsTable');
  if(!el || !window._FM_LANES) return;

  var filterType = (document.getElementById('gCtrFilterType')||{}).value || '';
  var filterStatus = (document.getElementById('gCtrFilterStatus')||{}).value || '';
  var sortKey = (document.getElementById('gCtrSort')||{}).value || 'vol';
  var shares = window._FM_SHARES || {};
  var myShare = window._FM_MY_SHARE;
  var VOL_RANK = {high:3,medium:2,low:1};

  var rows = [];
  window._FM_LANES.forEach(function(l){
    var lk = [l.from,l.to].sort().join('|');
    var sh = shares[lk] || {supply:0};
    var blk = window._FM_BLOCKADES && window._FM_BLOCKADES[lk];
    var isMine = myShare && myShare.laneKey === lk;
    if(filterType && l.type !== filterType) return;
    if(filterStatus === 'open' && sh.supply >= 100) return;
    if(filterStatus === 'held' && sh.supply === 0) return;
    if(filterStatus === 'mine' && !isMine) return;
    rows.push({
      from:l.from, to:l.to, type:l.type, vol:l.vol, laneKey:lk,
      supply: sh.supply||0, buyPrice: sh.buyPrice || _shareBuyPrice(l.vol, sh.supply||0),
      sellPrice: sh.sellPrice || _shareSellPrice(l.vol, sh.supply||0),
      dividend: SHARE_DIVIDEND_CLIENT[l.vol]||8, blockaded:!!(blk&&blk.active), isMine:isMine,
    });
  });

  rows.sort(function(a,b){
    if(a.isMine && !b.isMine) return -1;
    if(!a.isMine && b.isMine) return 1;
    if(sortKey==='vol') return (VOL_RANK[b.vol]||0)-(VOL_RANK[a.vol]||0);
    if(sortKey==='supply') return (b.supply||0)-(a.supply||0);
    if(sortKey==='price') return (b.buyPrice||0)-(a.buyPrice||0);
    if(sortKey==='type'){ var o={dark:0,contested:1,grey:2,corporate:3}; return (o[a.type]||9)-(o[b.type]||9); }
    return 0;
  });

  var h = '';

  if(myShare){
    var mLk = myShare.laneKey;
    var mSh = shares[mLk]||{supply:0};
    var mVol = 'low';
    if(window._FM_LANES) window._FM_LANES.forEach(function(l){ if([l.from,l.to].sort().join('|')===mLk) mVol=l.vol; });
    var mSellPrice = mSh.sellPrice || _shareSellPrice(mVol, mSh.supply||0);
    var mGain = mSellPrice - (myShare.purchasePrice||0);
    var mDivs = myShare.dividendsEarned||0;
    var mTotal = mGain + mDivs;
    var gainCol = mGain>=0?'#2ecc71':'#e74c3c';
    var parts = mLk.split('|');
    h += '<div style="background:#0a0a1a;border:1px solid #3498db44;border-radius:4px;padding:12px;margin-bottom:14px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    h += '<div style="font-size:.78rem;color:#3498db;letter-spacing:.1em">\uD83D\uDCCB YOUR POSITION</div>';
    h += '<button onclick="window._gSellShare()" style="background:#1a0a0a;border:1px solid #e74c3c88;color:#e74c3c;padding:4px 14px;cursor:pointer;font-size:.72rem;font-family:inherit;border-radius:2px">SELL</button>';
    h += '</div>';
    h += '<div style="font-size:.82rem;color:#ccc;margin-bottom:6px">'+_colonyName(parts[0])+' \u2194 '+_colonyName(parts[1])+'</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;font-size:.72rem">';
    h += '<div><div style="color:#555;font-size:.62rem">PAID</div><div style="color:#aaa">\u0192'+Number(myShare.purchasePrice||0).toLocaleString()+'</div></div>';
    h += '<div><div style="color:#555;font-size:.62rem">VALUE</div><div style="color:#3498db">\u0192'+Number(mSellPrice).toLocaleString()+'</div></div>';
    h += '<div><div style="color:#555;font-size:.62rem">GAIN</div><div style="color:'+gainCol+'">'+(mGain>=0?'+':'')+'\u0192'+Number(mGain).toLocaleString()+'</div></div>';
    h += '<div><div style="color:#555;font-size:.62rem">DIVIDENDS</div><div style="color:#2ecc71">\u0192'+Number(mDivs).toLocaleString()+'</div></div>';
    h += '</div>';
    h += '<div style="margin-top:6px;font-size:.68rem;color:#555">Total return: <span style="color:'+(mTotal>=0?'#2ecc71':'#e74c3c')+'">'+(mTotal>=0?'+':'')+'\u0192'+Number(mTotal).toLocaleString()+'</span></div>';
    h += '</div>';
  }

  h += '<div style="display:grid;grid-template-columns:2.5fr 0.8fr 0.7fr 0.8fr 1.2fr 0.6fr;gap:0;font-size:.78rem;letter-spacing:.05em">';
  h += '<div style="color:#555;padding:7px 8px;border-bottom:1px solid #1a1a2e;text-transform:uppercase;font-size:.68rem">Route</div>';
  h += '<div style="color:#555;padding:7px 6px;border-bottom:1px solid #1a1a2e;text-transform:uppercase;font-size:.68rem">Type</div>';
  h += '<div style="color:#555;padding:7px 6px;border-bottom:1px solid #1a1a2e;text-transform:uppercase;font-size:.68rem">Slots</div>';
  h += '<div style="color:#555;padding:7px 6px;border-bottom:1px solid #1a1a2e;text-transform:uppercase;font-size:.68rem">Div</div>';
  h += '<div style="color:#555;padding:7px 6px;border-bottom:1px solid #1a1a2e;text-transform:uppercase;font-size:.68rem;text-align:right">Price</div>';
  h += '<div style="color:#555;padding:7px 6px;border-bottom:1px solid #1a1a2e;font-size:.68rem"></div>';

  rows.forEach(function(r){
    var tc = LANE_TYPE_COLOR[r.type]||'#888';
    var rowBg = r.isMine ? '#0a0a22' : (r.supply>0 ? '#0a0a14' : '#07070e');
    var borderCol = r.isMine ? '#3498db33' : '#111';
    var pctFull = Math.round(r.supply/100*100);
    var barCol = pctFull>80?'#e74c3c':pctFull>50?'#f39c12':'#2ecc71';
    var hasMyShare = !!myShare;

    h += '<div style="padding:8px;border-bottom:1px solid '+borderCol+';background:'+rowBg+';cursor:pointer" onclick="window._gSelectLane(\''+r.from+'\',\''+r.to+'\')">'
      +'<span style="color:#ccc">'+_colonyName(r.from)+'</span>'
      +'<span style="color:#444"> \u2194 </span>'
      +'<span style="color:#ccc">'+_colonyName(r.to)+'</span>'
      +(r.blockaded?'<span style="color:#e74c3c"> \u26D4</span>':'')
      +(r.isMine?'<span style="color:#3498db"> \u2605</span>':'')
      +'</div>';
    h += '<div style="padding:8px 6px;border-bottom:1px solid '+borderCol+';background:'+rowBg+'"><span style="color:'+tc+'">'+r.type+'</span></div>';
    h += '<div style="padding:8px 6px;border-bottom:1px solid '+borderCol+';background:'+rowBg+'">'
      +'<div style="color:#aaa;margin-bottom:2px">'+r.supply+'/100</div>'
      +'<div style="background:#111;height:3px;border-radius:1px;width:50px"><div style="background:'+barCol+';width:'+pctFull+'%;height:100%;border-radius:1px"></div></div>'
      +'</div>';
    h += '<div style="padding:8px 6px;border-bottom:1px solid '+borderCol+';background:'+rowBg+';color:#2ecc71">\u0192'+r.dividend+'</div>';
    h += '<div style="padding:8px 6px;border-bottom:1px solid '+borderCol+';background:'+rowBg+';text-align:right">'
      +'<div style="color:#3498db">\u0192'+Number(r.buyPrice).toLocaleString()+'</div>'
      +'<div style="font-size:.62rem;color:#555">sell: \u0192'+Number(r.sellPrice).toLocaleString()+'</div>'
      +'</div>';
    h += '<div style="padding:7px 4px;border-bottom:1px solid '+borderCol+';background:'+rowBg+';text-align:center">';
    if(r.isMine){
      h += '<button onclick="event.stopPropagation();window._gSellShare()" style="background:#1a0a0a;border:1px solid #e74c3c88;color:#e74c3c;padding:5px 10px;cursor:pointer;font-size:.68rem;font-family:inherit;border-radius:2px">SELL</button>';
    } else if(r.supply>=100){
      h += '<span style="color:#555;font-size:.68rem">FULL</span>';
    } else if(hasMyShare){
      h += '<button onclick="event.stopPropagation();window._gSwapShare(\''+r.from+'\',\''+r.to+'\')" style="background:#0a1020;border:1px solid #f39c1288;color:#f39c12;padding:5px 10px;cursor:pointer;font-size:.68rem;font-family:inherit;border-radius:2px">SWAP</button>';
    } else {
      h += '<button onclick="event.stopPropagation();window._gBuyShare(\''+r.from+'\',\''+r.to+'\')" style="background:#0a1020;border:1px solid #3498db66;color:#3498db;padding:5px 10px;cursor:pointer;font-size:.68rem;font-family:inherit;border-radius:2px">BUY</button>';
    }
    h += '</div>';
  });

  h += '</div>';
  el.innerHTML = h;
}

window._gBuyShare = function(from, to){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  _sendWSGalaxy({type:'share_buy',from:from,to:to});
};
window._gSellShare = function(){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  _sendWSGalaxy({type:'share_sell'});
};
window._gSwapShare = function(from, to){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  _sendWSGalaxy({type:'share_swap',from:from,to:to});
};

document.addEventListener('DOMContentLoaded',function(){
  ['gCtrFilterType','gCtrFilterStatus','gCtrSort'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('change', renderContractsTable);
  });
});
if(document.readyState !== 'loading'){
  ['gCtrFilterType','gCtrFilterStatus','gCtrSort'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('change', renderContractsTable);
  });
}

window._gSelectLane = function(from, to){
  var el = document.getElementById('gColonyDetailInner');
  if(!el) return;
  var lane = null;
  if(window._FM_LANES){
    window._FM_LANES.forEach(function(l){
      if((l.from===from && l.to===to)||(l.from===to && l.to===from)) lane=l;
    });
  }
  if(!lane) return;
  var lk = [from,to].sort().join('|');
  var sh = (window._FM_SHARES||{})[lk] || {supply:0};
  var blk = (window._FM_BLOCKADES||{})[lk];
  var myShare = window._FM_MY_SHARE;
  var isMine = myShare && myShare.laneKey === lk;
  var tc = LANE_TYPE_COLOR[lane.type]||'#888';
  var supply = sh.supply||0;
  var buyP = sh.buyPrice || _shareBuyPrice(lane.vol, supply);
  var sellP = sh.sellPrice || _shareSellPrice(lane.vol, supply);
  var div = SHARE_DIVIDEND_CLIENT[lane.vol]||8;
  var risk = LANE_RISK[lane.type]||{intercept:0.18};
  gSelected = null;

  var h = '';
  h += '<div style="font-size:.88rem;letter-spacing:.14em;color:'+tc+';font-weight:bold;margin-bottom:4px">SHIPPING LANE</div>';
  h += '<div style="font-size:.78rem;color:#aaa;margin-bottom:12px">'+_colonyName(from)+' \u2194 '+_colonyName(to)+'</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-bottom:14px">';
  h += '<div><div style="font-size:.66rem;color:#555">TYPE</div><div style="font-size:.84rem;color:'+tc+'">'+lane.type.toUpperCase()+'</div></div>';
  h += '<div><div style="font-size:.66rem;color:#555">VOLUME</div><div style="font-size:.84rem;color:'+(lane.vol==='high'?'#2ecc71':lane.vol==='medium'?'#f39c12':'#888')+'">'+lane.vol.toUpperCase()+'</div></div>';
  h += '<div><div style="font-size:.66rem;color:#555">DIVIDEND</div><div style="font-size:.84rem;color:#2ecc71">\u0192'+div+'/tick</div></div>';
  h += '<div><div style="font-size:.66rem;color:#555">BASE RISK</div><div style="font-size:.84rem;color:#e74c3c">'+Math.round(risk.intercept*100)+'%</div></div>';
  h += '</div>';
  if(blk && blk.active) h += '<div style="border:1px solid #e74c3c;color:#e74c3c;font-size:.72rem;padding:6px 8px;margin-bottom:10px">\u26D4 BLOCKADE ACTIVE \u2014 shipping blocked, smuggling +10% risk, dividends halved</div>';
  h += '<div style="font-size:.82rem;color:#3498db;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">\uD83D\uDCCB LANE SHARES</div>';
  var pctFull = Math.round(supply/100*100);
  var barCol = pctFull>80?'#e74c3c':pctFull>50?'#f39c12':'#2ecc71';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:.78rem;color:#aaa">'+supply+'/100 slots</span>';
  h += '<div style="flex:1;background:#111;height:4px;border-radius:2px"><div style="background:'+barCol+';width:'+pctFull+'%;height:100%;border-radius:2px"></div></div></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">';
  h += '<div style="background:#0a0a1a;border:1px solid #3498db44;padding:8px;border-radius:2px;text-align:center"><div style="font-size:.62rem;color:#555">BUY PRICE</div><div style="font-size:.88rem;color:#3498db">\u0192'+Number(buyP).toLocaleString()+'</div></div>';
  h += '<div style="background:#0a0a1a;border:1px solid #2ecc7144;padding:8px;border-radius:2px;text-align:center"><div style="font-size:.62rem;color:#555">SELL PRICE</div><div style="font-size:.88rem;color:#2ecc71">\u0192'+Number(sellP).toLocaleString()+'</div></div>';
  h += '</div>';
  if(isMine){
    var mGain = sellP-(myShare.purchasePrice||0);
    h += '<div style="background:#0a0a22;border:1px solid #3498db33;padding:8px;border-radius:2px;margin-bottom:10px">';
    h += '<div style="font-size:.68rem;color:#3498db;margin-bottom:4px">\u2605 YOU HOLD THIS LANE</div>';
    h += '<div style="font-size:.72rem;color:#888">Paid: \u0192'+Number(myShare.purchasePrice||0).toLocaleString()+' \u2014 Gain: <span style="color:'+(mGain>=0?'#2ecc71':'#e74c3c')+'">'+(mGain>=0?'+':'')+'\u0192'+Number(mGain).toLocaleString()+'</span></div>';
    h += '<button onclick="window._gSellShare()" style="width:100%;margin-top:6px;background:#1a0a0a;border:1px solid #e74c3c88;color:#e74c3c;padding:6px;cursor:pointer;font-size:.72rem;font-family:inherit;border-radius:2px">SELL SHARE</button></div>';
  } else if(supply>=100){
    h += '<div style="font-size:.72rem;color:#555;margin-bottom:10px">Lane full \u2014 100/100 slots</div>';
  } else if(myShare){
    h += '<button onclick="window._gSwapShare(\''+from+'\',\''+to+'\')" style="width:100%;margin-bottom:10px;background:#0a1020;border:1px solid #f39c12;color:#f39c12;padding:6px;cursor:pointer;font-size:.72rem;font-family:inherit;border-radius:2px">SWAP HERE (\u0192'+Number(buyP).toLocaleString()+')</button>';
  } else {
    h += '<button onclick="window._gBuyShare(\''+from+'\',\''+to+'\')" style="width:100%;margin-bottom:10px;background:#0a1020;border:1px solid #3498db;color:#3498db;padding:6px;cursor:pointer;font-size:.72rem;font-family:inherit;border-radius:2px">BUY SHARE (\u0192'+Number(buyP).toLocaleString()+')</button>';
  }
  h += '<div style="margin-top:10px;font-size:.66rem;color:#3498db;padding:8px;border:1px solid #1a1a2e;border-radius:3px;text-align:center;cursor:pointer;margin-bottom:10px" onclick="document.querySelector(\'[data-gstab=shipping]\').click()">📦 Ship / Smuggle this lane →</div>';
  h += '<div style="margin-top:10px;font-size:.68rem;color:#f39c12;letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">\u26D4 BLOCKADE</div>';
  h += '<div style="display:flex;gap:4px"><input id="gLaneBlkAmt" type="number" placeholder="Fund (\u0192)" style="flex:1;background:#0a0a14;border:1px solid #f39c1244;color:#ccc;padding:4px;font-size:.64rem;font-family:inherit;outline:none;border-radius:2px">'
    +'<button onclick="window._gLaneBlkFund(\''+from+'\',\''+to+'\')" style="background:#2d1a00;border:1px solid #f39c12;color:#f39c12;padding:4px 8px;cursor:pointer;font-size:.58rem;font-family:inherit;border-radius:2px">FUND</button>'
    +'<button onclick="window._gLaneBlkCounter(\''+from+'\',\''+to+'\')" style="background:#0a1a2d;border:1px solid #3498db;color:#3498db;padding:4px 8px;cursor:pointer;font-size:.56rem;font-family:inherit;border-radius:2px">COUNTER</button></div>';
  el.innerHTML = h;
};

window._gLaneSmugRun = function(from, to){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var cSel = document.getElementById('gLaneSmugCargo');
  var sInp = document.getElementById('gLaneSmugStake');
  var stake = sInp ? Number(sInp.value) : 0;
  if(!stake || stake < 100){ gToast('Min stake: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'smuggling_start',from:from,to:to,cargoId:cSel?cSel.value:'synth_organs',stake:stake});
};
window._gLaneBlkFund = function(from, to){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var inp = document.getElementById('gLaneBlkAmt');
  var amt = inp ? Number(inp.value) : 0;
  if(!amt || amt < 100){ gToast('Min: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'blockade_fund',from:from,to:to,amount:amt});
};
window._gLaneBlkCounter = function(from, to){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var inp = document.getElementById('gLaneBlkAmt');
  var amt = inp ? Number(inp.value) : 0;
  if(!amt || amt < 100){ gToast('Min: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'counter_blockade',from:from,to:to,amount:amt});
};

// ── Galaxy Systems: cash sync helper ──
var _gSyncPortfolioTimer = null;
function _gSyncCash(cash){
  if(typeof cash!=='number') return;
  if(typeof ME==='object'&&ME) ME.cash=cash;
  if(typeof window.__MY_CASH!=='undefined') window.__MY_CASH=cash;
  var cashEl=document.getElementById('cash');
  if(cashEl) cashEl.textContent='\u0192'+Number(cash).toLocaleString(undefined,{maximumFractionDigits:2});
  try{ liveUpdatePnL(null,null); }catch(_){}
  // Debounced portfolio refresh so passive income counters recalculate
  if(_gSyncPortfolioTimer) clearTimeout(_gSyncPortfolioTimer);
  _gSyncPortfolioTimer = setTimeout(function(){
    _sendWSGalaxy({type:'portfolio_request'});
  }, 500);
}

// ── Galaxy Systems: action handlers ──
function _sendWSGalaxy(payload){
  try{ if(typeof sendWS==='function') sendWS(payload);
  else if(window._ws && window._ws.readyState===1) window._ws.send(JSON.stringify(payload));
  }catch(e){}
}

window._gStartSmuggle = function(){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var lnSel=document.getElementById('gSmugLane'); if(!lnSel) return;
  var parts=lnSel.value.split('|'); // from|to|type
  var cSel=document.getElementById('gSmugCargo');
  var sInp=document.getElementById('gSmugStake');
  var stake=sInp?Number(sInp.value):0;
  if(!stake||stake<100){ gToast('Min stake: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'smuggling_start',from:parts[0],to:parts[1],cargoId:cSel?cSel.value:'synth_organs',stake:stake});
};

window._gFundBlockade = function(){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var lnSel=document.getElementById('gBlkLane'); if(!lnSel) return;
  var parts=lnSel.value.split('|');
  var aInp=document.getElementById('gBlkAmt');
  var amt=aInp?Number(aInp.value):0;
  if(!amt||amt<100){ gToast('Min: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'blockade_fund',from:parts[0],to:parts[1],amount:amt});
};

window._gCounterBlk = function(){
  if(!gToken){ gToast('Log in first','#e74c3c'); return; }
  var lnSel=document.getElementById('gBlkLane'); if(!lnSel) return;
  var parts=lnSel.value.split('|');
  var aInp=document.getElementById('gBlkAmt');
  var amt=aInp?Number(aInp.value):0;
  if(!amt||amt<100){ gToast('Min: \u0192100','#e74c3c'); return; }
  _sendWSGalaxy({type:'counter_blockade',from:parts[0],to:parts[1],amount:amt});
};

document.addEventListener('fm:authed',function(e){
  if(e.detail&&e.detail.token) gToken=e.detail.token;
  if(e.detail&&e.detail.faction) gPlayerFaction=e.detail.faction;
});

function gToast(msg,color){
  color=color||'#4ecdc4';
  var t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0a0a14;border:1px solid '+color+';color:'+color+';padding:8px 20px;font-size:.72rem;letter-spacing:.1em;font-family:inherit;z-index:9999;pointer-events:none;animation:gTI .2s ease';
  t.textContent=msg; document.body.appendChild(t);
  setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); },3000);
}

var gs=document.createElement('style');
gs.textContent='@keyframes gTI{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}} @keyframes gBlkPulse{0%,100%{opacity:.6}50%{opacity:1}} .g-blk-pulse{animation:gBlkPulse 1.2s ease-in-out infinite} @keyframes gLanePulse{0%,100%{opacity:.2;stroke-width:3}50%{opacity:.7;stroke-width:5}} .g-active-lane-pulse{animation:gLanePulse .8s ease-in-out infinite} @keyframes gShipPing{0%{r:5;opacity:.8}100%{r:16;opacity:0}} .g-ship-trail{animation:gShipPing 1.5s ease-out infinite} .g-ship-dot{filter:drop-shadow(0 0 4px currentColor)}';
document.head.appendChild(gs);

document.addEventListener('DOMContentLoaded',function(){
  initSubTabs();
  setTimeout(hookShowTab, 0);
  var galTab=document.querySelector('[data-tab="galactic"]');
  if(galTab) galTab.addEventListener('click',function(){ setTimeout(onGalaxyOpen,0); });
});


// ══════════════════════════════════════════════════════════════════════════════
// GALAXY SHIP TRAFFIC  —  small freighters on lanes, large traversal ships// ══════════════════════════════════════════════════════════════════════════════
// Expose init for lazy-loading: if galaxy.js loads AFTER the tab click,
// the lazy loader calls window.__galaxyOpen() directly.
window.__galaxyOpen = function(){ setTimeout(onGalaxyOpen, 0); };

// Also hook showTab now if DOMContentLoaded already fired (lazy-load case)
if(document.readyState !== 'loading'){
  initSubTabs();
  setTimeout(hookShowTab, 0);
}

// Bridge: expose galaxy internals for shipping tab (lives in a separate IIFE)
window._galaxy = {
  get state(){ return gState; },
  get faction(){ return gPlayerFaction; },
  get token(){ return gToken; },
  toast: function(m,c){ gToast(m,c); },
  send: function(p){ _sendWSGalaxy(p); },
  meta: COLONY_META,
};

})();

// ═══════════════════════════════════════════════════════════════════════════════
// SHIP MANIFEST SYSTEM — click any ship on the galaxy map to intercept its data
// ═══════════════════════════════════════════════════════════════════════════════
(function() {

// ── Detail sprite definitions ─────────────────────────────────────────────────
var DETAIL_SPRITES = {
  v1: {
    body:   ['assets/space/ships/v1_detail_1.png','assets/space/ships/v1_detail_2.png','assets/space/ships/v1_detail_3.png'],
    thrust: ['assets/space/ships/v1_detail_thrust1.png','assets/space/ships/v1_detail_thrust2.png','assets/space/ships/v1_detail_thrust3.png'],
    w: 176, h: 96, tw: 48, th: 48,
    thrustX: -42, thrustY: 24,
    scale: 2
  },
  v2: {
    body:   ['assets/space/ships/v2_detail_1.png','assets/space/ships/v2_detail_2.png','assets/space/ships/v2_detail_3.png'],
    thrust: ['assets/space/ships/v2_detail_thrust1.png','assets/space/ships/v2_detail_thrust2.png','assets/space/ships/v2_detail_thrust3.png'],
    w: 176, h: 125, tw: 81, th: 58,
    thrustX: -68, thrustY: 34,
    scale: 2
  },
  v3: {
    body:      ['assets/space/ships/v3_detail_1.png','assets/space/ships/v3_detail_2.png','assets/space/ships/v3_detail_3.png'],
    thrustB:   ['assets/space/ships/v3_detail_thrustback1.png','assets/space/ships/v3_detail_thrustback2.png','assets/space/ships/v3_detail_thrustback3.png'],
    thrustBot: ['assets/space/ships/v3_detail_thrustbot1.png','assets/space/ships/v3_detail_thrustbot2.png','assets/space/ships/v3_detail_thrustbot3.png'],
    w: 329, h: 160, tbw: 32, tbh: 47, tbow: 66, tboh: 51,
    thrustBX: -26, thrustBY: 56,
    thrustBotX: 60, thrustBotY: 109,   // 109+51=160 = body height, stays within bounds
    scale: 1
  }
};

// ── Colony cargo profiles — what each system produces and receives ────────────
var CARGO_PROFILES = {
  new_anchor: {
    exports: [
      'Coalition licensing documentation (Class-A)',
      'Regulated arbitration filings — batch {N}',
      'Inner-system transit permits (bulk)',
      'Nexus Financial — settlement ledgers',
      'Catalyst Insurance — underwriting packets',
    ],
    imports: [
      'Raw ore feedstock — unprocessed',
      'Unlicensed goods — pending classification',
      'Diplomatic courier pouches (sealed)',
      'Coalition payroll credits — encrypted',
    ]
  },
  cascade_station: {
    exports: [
      'Refined titanium alloy — {N}.{M}t',
      'Processed ore pellets (Grade 7)',
      'Vertex Aerospace — hull plating components',
      'Cascade Minerals — raw extract batch',
      'Orbital elevator tolls — cleared manifest',
    ],
    imports: [
      'Atmospheric processing supplies',
      'Coalition-bonded labor contracts',
      'Mining equipment — replacement parts',
      'Cascade Pharma — compound reagents',
    ]
  },
  frontier_outpost: {
    exports: [
      'Cross-faction supply coordination logs',
      'HollowLogistics — docking fee receipts',
      'Emergency ration stockpile (licensed)',
      'Frontier Supplies — resupply manifest',
    ],
    imports: [
      'Contested territory provisions',
      'Licensed contractor equipment',
      'Multi-faction relay hardware',
      'Standoff maintenance supplies',
    ]
  },
  the_hollow: {
    exports: [
      'Cargo manifest: [REDACTED BY PORT AUTHORITY]',
      'HollowLogistics — rate schedule (private)',
      'PhantomCourier — unlisted freight',
      'Container batch 7-7-VOID — contents unverified',
      'ApexContraband — transit clearance (forged)',
      'SmugglerNetworks — route data, encrypted',
    ],
    imports: [
      'Pirate contractor supplies — no manifest',
      'Enforcement equipment (unlicensed)',
      '[RECORD NOT FOUND]',
      'Unknown — docking AI flagged, overridden',
    ]
  },
  aurora_prime: {
    exports: [
      'Aurora Electric — power grid contracts',
      'Neon Technologies — data infrastructure uplinks',
      'WraithEnergy — fusion plant output certs',
      'Inner-system relay licensing (annual)',
      'Zenith Automation — control system bundles',
    ],
    imports: [
      'Fuel cell feedstock — outer rim grade',
      'Coalition licensing fee — inbound',
      'WraithEnergy raw supply (disputed)',
      'Tech component assemblies',
    ]
  },
  null_point: {
    exports: [
      'NullSyndicate — data relay packet (no logs)',
      'UnderNet — encrypted routing bundle',
      'CipherHoldings — anonymised ledgers',
      'ShadowDynamics — signal relay manifest [NULL]',
      '[RECORD PURGED]',
    ],
    imports: [
      'Unknown origin — flagged by Coalition sensor ghost',
      'GhostFoundry hardware (unregistered)',
      'Dark-net relay components',
      '[MANIFEST: NONE]',
    ]
  },
  limbosis: {
    exports: [
      'Relic Deep — artifact extraction batch (unclassified)',
      'Fog Bastion — weapons platform maintenance log',
      '[WARNING: ORIGIN SYSTEM FLAGGED]',
      'Defense grid status — CLASSIFIED',
    ],
    imports: [
      'Nobody has docked at Limbosis in {N} standard cycles',
      'Last known inbound: Corporate War 15 survivor vessel',
      '[APPROACH VECTOR HAZARDOUS]',
    ]
  },
  lustandia: {
    exports: [
      "S'weet Reserve — Vintage 94 · {N} cases",
      "S'weet Vineyard — Pleasure Export License",
      'Pleasure Quarter — entertainment contracts ({N} units)',
      "S'weet uncut concentrate — {N}.{M}L (restricted)",
      'Hedonism sector permits — inner system distribution',
    ],
    imports: [
      'Luxury goods — unrestricted import',
      'Entertainment technology — licensed',
      'Defense system components (self-funded)',
      "Raw ingredients for S'weet fermentation process",
    ]
  },
  gluttonis: {
    exports: [
      'Baron Corps — refined rare materials · {N}.{M}t',
      'Orbital refinery output — Class-Omega grade',
      'Fuel catalyst canisters (unlisted specification)',
      'Baron Refinery I — batch manifest [PROPRIETARY]',
      'Dark Core extraction — unmarked containers · {N}t',
      'Universal fuel feedstock — all factions cleared',
    ],
    imports: [
      'Labor contract shipment — outer rim sourced',
      'Baron Corps — supply chain inputs (dark)',
      'Refinery maintenance equipment',
      'Power cell arrays — high consumption rated',
    ]
  },
  abaddon: {
    exports: [
      '[ABADDON TRANSIT AUTHORITY: NO MANIFEST REQUIRED]',
      'Sovereign freight — inspection exemption filed',
      'Contested zone goods — faction clearance varies',
      'Greed Station — holding pattern cargo',
    ],
    imports: [
      'All three factions running parallel supply ops',
      'Coalition forward supplies — unacknowledged',
      'Syndicate transit goods — tariff disputed',
      'Void Collective — signal zone hardware',
    ]
  },
  eyejog: {
    exports: [
      'Merchant Guild — trade toll receipts · {N}k SC',
      'Guild Market licensing — {N} new registrations',
      'Oak Capital — portfolio redistribution',
      'Sycamore Partners — investment mandate packets',
      'Sand Exchange — inter-colony fee schedule',
      'Guild transit levy — mandatory, all routes',
    ],
    imports: [
      'Tribute flow from controlled colonies',
      'Sycamore Software — infrastructure contracts',
      'Guild-approved luxury goods (personal use)',
      'Decadence supplies — unrestricted (Guild privilege)',
    ]
  },
  dust_basin: {
    exports: [
      'Aurora Metals — ore extract · {N}.{M}t',
      'GreyMining — disputed contract output',
      'First Minerals — Ore Platform 7 batch',
      'South Minerals — elevator shared manifest',
      'RogueMinerals — off-schedule extraction log',
    ],
    imports: [
      'Mining equipment (disputed ownership)',
      'Orbital elevator maintenance supplies',
      'Labor rotation — outer rim contractors',
      'Infrastructure — infrastructure dispute pending',
    ]
  },
  nova_reach: {
    exports: [
      'Nimbus Biotech — unlicensed compound batch',
      'North Biotech — research output (unregistered)',
      'Nova Biotech — synthesis log (no Coalition stamp)',
      'GreywaterLabs — compound · {N}.{M}g [CLASS UNKNOWN]',
      'Willow Labs — biotech reagents (outer rim grade)',
    ],
    imports: [
      'Research equipment — no import license',
      'Coalition-restricted reagents (smuggled)',
      'Lab Ring Kappa — supply manifest (sealed)',
      'Experimental substrate materials',
    ]
  },
  iron_shelf: {
    exports: [
      'North Industries — ship component batch · {N} units',
      'Nexus Aerospace — hull segment manifest',
      'Pioneer Aerospace — weapons systems (buyer undisclosed)',
      'River Aerospace — aerospace parts · {N}.{M}t',
      'Drydock Omega — completed vessel components',
      'Forge Station — manufacturing output (all factions)',
    ],
    imports: [
      'Raw metal feedstock — Gluttonis grade',
      'Precision tooling components',
      'Coalition, Syndicate, Void purchase orders (simultaneous)',
      'Forge Station — energy supply contracts',
    ]
  },
  the_ledger: {
    exports: [
      'BlackCapital — shell entity registration · {N} filings',
      'NightFinance — holding structure documents',
      'MireInsurance — policy batch (offshore grade)',
      'Shell Block Nine — {N},000 registered entities: manifest blank',
      'SableSecurity — enforcement contracts (undisclosed)',
    ],
    imports: [
      'Clean credits — laundering intake',
      'Coalition inspection deferral notices',
      'SmugglerMedia — influence contract shipment',
      'Off-book financial instruments',
    ]
  },
  signal_run: {
    exports: [
      'Orion Logistics — freight corridor schedule',
      'Blue Shipping — outer rim cargo manifest',
      'Vertex Logistics — transit lane allocation',
      'Relay Alpha — cargo schedule (outer rim)',
      'Copper Marine — bulk freight · {N}.{M}t',
      'Summit Logistics — hub routing data',
    ],
    imports: [
      'Outer rim supply loads — all factions',
      'Depot Ring — neural net cargo (tech)',
      'Fuel Platform — power cell restocking',
      'Transit lane access fees — inbound',
    ]
  },
  the_escrow: {
    exports: [
      'Silver Holdings — data vault access log',
      'SpecterIndustries — contract mirror records',
      'OccultMaterials — outer system financial instruments',
      'ApexContraband — audited holdings [DENIED × 9]',
      'Vault Deep One — outer system ledger mirror',
    ],
    imports: [
      'Financial data — all outer system contracts',
      'Coalition audit requests [AUTO-DECLINED]',
      'Ocean-depth server maintenance supplies',
      'Encrypted financial instruments — all origins',
    ]
  },
  flesh_station: {
    exports: [
      '[FLESH STATION: SOVEREIGN TERRITORY — NO MANIFEST FILED]',
      'Mr. Flesh — personal freight (unexamined)',
      'Station internal — data feed (this terminal)',
      'Outbound: unknown · Volume: unlogged',
    ],
    imports: [
      'Everything. Flesh Station sets its own tariffs.',
      'Inbound logs: classified at station level',
      '[YOU ARE READING THIS FROM INSIDE THE STATION]',
    ]
  },
  scrub_yard: {
    exports: [
      'BlackCapital — shell entity registration · {N} filings',
      'NightFinance — holding structure documents',
      'MireInsurance — policy batch (offshore grade)',
      'Shell Block Nine — {N},000 registered entities: manifest blank',
      'SableSecurity — enforcement contracts (undisclosed)',
      'SmugglerMedia — influence contract shipment',
    ],
    imports: [
      'Clean credits — laundering intake',
      'Coalition inspection deferral notices',
      'Off-book financial instruments',
      'Transit fee income — all routes',
    ]
  },
  margin_call: {
    exports: [
      'BoneYards — liquidated asset batch · {N} units',
      'CrimsonChains — debt enforcement manifest',
      'GraveWorks — physical collateral transfer order',
      'ObsidianShipping — recovered goods · {N}.{M}t',
      'ToxicChains — smelter output (collateral processed)',
    ],
    imports: [
      'The Ledger — debt collection orders (inbound)',
      'Syndicate enforcement personnel rotation',
      'Smelter feedstock — collateral grade',
      'Asset seizure paperwork — all outer systems',
    ]
  },
  vein_cluster: {
    exports: [
      'VeinConsortium — orbital ring output [OFF-MANIFEST]',
      'BloodWorks — processed biologics · {N}.{M}kg',
      'OrganCorp — tissue batch (distribution downstream)',
      'GraftBiotech — graft substrate · {N} units',
      'BoneMarkets — skeletal components (industrial grade)',
      'CarrionFarms — protein extract · {N}t',
    ],
    imports: [
      'Biological source material (origin undisclosed)',
      'Orbital processing supplies — VeinConsortium only',
      'CarrionFarms — feedstock (unlisted)',
      'Cold-chain transport units',
    ]
  }
};

// Fallback for any unlisted colony
var GENERIC_CARGO = {
  exports: [
    'Mixed freight · {N}.{M}t',
    'Inter-colony goods — standard manifest',
    'Commercial cargo batch {N}',
    'Bulk materials — unclassified',
  ],
  imports: [
    'Inbound general freight',
    'Colony resupply batch',
    'Mixed goods — standard receipt',
  ]
};

// ── Ship class flavour text ───────────────────────────────────────────────────
var SHIP_CLASS = {
  v1: { name: 'Light Courier', hull: 'Class-1 Courier Frame', crew: Math.floor(Math.random()*3)+2 },
  v2: { name: 'Mid-Range Freighter', hull: 'Class-2 Merchant Hull', crew: Math.floor(Math.random()*6)+4 },
  v3: { name: 'Deep-Space Hauler', hull: 'Class-3 Heavy Transport', crew: Math.floor(Math.random()*12)+8 }
};

// ── Seeded random (so same ship gets same manifest per trip) ──────────────────
function seededRand(seed) {
  var x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function pickCargo(colonyId, direction, seed, count) {
  var profile = CARGO_PROFILES[colonyId] || GENERIC_CARGO;
  var pool = direction === 'export' ? profile.exports : profile.imports;
  var result = [];
  for (var i = 0; i < count; i++) {
    var idx = Math.floor(seededRand(seed + i * 7.3) * pool.length);
    var item = pool[idx];
    // Fill in random numbers
    var n = Math.floor(seededRand(seed + i * 3.1) * 90) + 10;
    var m = Math.floor(seededRand(seed + i * 5.7) * 9) + 1;
    item = item.replace('{N}', n).replace('{M}', m);
    if (result.indexOf(item) === -1) result.push(item);
  }
  return result;
}

// ── Manifest generator ────────────────────────────────────────────────────────
function generateManifest(fromId, toId, typeKey, seed) {
  var meta     = window._FM_COLONY_META || {};
  var fromMeta = meta[fromId] || { name: fromId };
  var toMeta   = meta[toId]   || { name: toId };

  var exportItems = pickCargo(fromId, 'export', seed, 3);
  var importItems = pickCargo(toId,   'import', seed + 100, 2);

  // Combine: ship is carrying exports from origin + imports destined for destination
  var allCargo = exportItems.concat(importItems);

  // Add one mystery item on grey/dark routes
  var isGrey = (fromId === 'the_hollow' || toId === 'the_hollow' ||
                fromId === 'null_point'  || toId === 'null_point'  ||
                fromId === 'the_ledger'  || toId === 'the_ledger');
  if (isGrey) allCargo.push('[LINE ITEM ' + (allCargo.length+1) + ': RECORD EXPUNGED]');

  var cls = SHIP_CLASS[typeKey] || SHIP_CLASS.v1;
  var crewCount = Math.floor(seededRand(seed + 99) * (cls.crew)) + 2;

  // Generate ship ident
  var prefixes = ['FM-','VX-','SC-','KR-','NL-','GH-','DK-','OR-'];
  var prefix = prefixes[Math.floor(seededRand(seed + 11) * prefixes.length)];
  var ident = prefix + (Math.floor(seededRand(seed + 22) * 8999) + 1000);

  return {
    ident: ident,
    className: cls.name,
    hull: cls.hull,
    crew: crewCount,
    fromName: fromMeta.name || fromId,
    toName: toMeta.name || toId,
    cargo: allCargo,
    fromLore: fromMeta.lore || '',
    toLore: toMeta.lore || ''
  };
}

// ── Modal HTML injection ──────────────────────────────────────────────────────
function injectManifestModal() {
  if (document.getElementById('ship-manifest-modal')) return;

  var style = document.createElement('style');
  style.textContent = [
    '#ship-manifest-modal{',
      'display:none;position:fixed;inset:0;z-index:9999;',
      'background:rgba(0,0,0,0.88);',
      'align-items:center;justify-content:center;',
    '}',
    '#ship-manifest-modal.open{display:flex;}',
    '#smm-inner{',
      'display:flex;flex-direction:row;gap:0;',
      'max-width:820px;width:96vw;max-height:90vh;',
      'background:#0a0a0f;border:1px solid #1e2a1e;',
      'border-radius:4px;overflow:hidden;',
      'font-family:inherit;',
    '}',
    '#smm-ship-pane{',
      'flex:0 0 360px;min-width:260px;',
      'background:linear-gradient(180deg,#060c18 0%,#040810 60%,#020408 100%);',
      'display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;padding:24px 16px;position:relative;overflow:visible;',
      'border-right:1px solid #1a2a1a;min-height:320px;',
    '}',
    '#smm-stars{position:absolute;inset:0;pointer-events:none;}',
    '#smm-ship-canvas{',
      'position:relative;z-index:2;',
      'max-width:100%;',
      'image-rendering:pixelated;image-rendering:crisp-edges;',
    '}',
    '#smm-ship-label{',
      'position:relative;z-index:2;margin-top:18px;text-align:center;',
    '}',
    '#smm-ship-label .sml-ident{',
      'font-size:.7rem;letter-spacing:.18em;color:#3d7a3d;font-family:monospace;',
    '}',
    '#smm-ship-label .sml-class{',
      'font-size:.85rem;color:#7ab87a;margin-top:3px;',
    '}',
    '#smm-ship-label .sml-hull{',
      'font-size:.65rem;color:#2a5a2a;margin-top:2px;letter-spacing:.05em;',
    '}',
    '#smm-manifest-pane{',
      'flex:1;overflow-y:auto;padding:20px 22px;',
      'display:flex;flex-direction:column;gap:14px;',
    '}',
    '#smm-close{',
      'position:absolute;top:10px;right:14px;',
      'background:transparent;border:none;',
      'color:#2a4a2a;font-size:1.1rem;cursor:pointer;',
      'font-family:monospace;letter-spacing:.05em;z-index:10;',
      'padding:4px 8px;',
    '}',
    '#smm-close:hover{color:#4ecdc4;}',
    '.smm-section-title{',
      'font-size:.6rem;letter-spacing:.2em;color:#2a5a2a;',
      'text-transform:uppercase;margin-bottom:6px;font-family:monospace;',
    '}',
    '.smm-route-box{',
      'background:#050e05;border:1px solid #1a2a1a;',
      'padding:10px 14px;border-radius:2px;',
    '}',
    '.smm-route-row{',
      'display:flex;align-items:baseline;gap:8px;',
      'font-size:.75rem;color:#4a8a4a;margin-bottom:4px;',
    '}',
    '.smm-route-row:last-child{margin-bottom:0;}',
    '.smm-route-label{',
      'font-size:.6rem;color:#2a4a2a;letter-spacing:.1em;',
      'text-transform:uppercase;min-width:32px;font-family:monospace;',
    '}',
    '.smm-route-val{color:#7ab87a;}',
    '.smm-cargo-list{',
      'background:#050e05;border:1px solid #1a2a1a;',
      'padding:10px 14px;border-radius:2px;',
    '}',
    '.smm-cargo-item{',
      'display:flex;gap:8px;',
      'font-size:.72rem;color:#5a8a5a;padding:4px 0;',
      'border-bottom:1px solid #0d1a0d;',
      'font-family:monospace;',
    '}',
    '.smm-cargo-item:last-child{border-bottom:none;}',
    '.smm-cargo-idx{color:#1e3a1e;min-width:18px;}',
    '.smm-crew-row{',
      'font-size:.68rem;color:#2a5a2a;',
      'border-top:1px solid #1a2a1a;padding-top:10px;',
      'font-family:monospace;letter-spacing:.05em;',
    '}',
    '.smm-terminal-header{',
      'font-size:.65rem;color:#1e3a1e;letter-spacing:.12em;',
      'font-family:monospace;border-bottom:1px solid #0d180d;padding-bottom:8px;',
    '}',
  ].join('');
  document.head.appendChild(style);

  var modal = document.createElement('div');
  modal.id = 'ship-manifest-modal';
  modal.innerHTML = [
    '<div id="smm-inner">',
      '<div id="smm-ship-pane">',
        '<canvas id="smm-stars"></canvas>',
        '<canvas id="smm-ship-canvas"></canvas>',
        '<div id="smm-ship-label">',
          '<div class="sml-ident" id="smm-ident"></div>',
          '<div class="sml-class" id="smm-class"></div>',
          '<div class="sml-hull"  id="smm-hull"></div>',
        '</div>',
      '</div>',
      '<div id="smm-manifest-pane">',
        '<button id="smm-close">✕ CLOSE</button>',
        '<div class="smm-terminal-header" id="smm-header"></div>',
        '<div>',
          '<div class="smm-section-title">Route</div>',
          '<div class="smm-route-box" id="smm-route"></div>',
        '</div>',
        '<div>',
          '<div class="smm-section-title">Cargo Manifest — Intercepted</div>',
          '<div class="smm-cargo-list" id="smm-cargo"></div>',
        '</div>',
        '<div class="smm-crew-row" id="smm-crew"></div>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(modal);

  document.getElementById('smm-close').addEventListener('click', closeManifest);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeManifest();
  });
}

// ── Starfield ─────────────────────────────────────────────────────────────────
function drawStars(canvas) {
  canvas.width  = canvas.offsetWidth  || 340;
  canvas.height = canvas.offsetHeight || 400;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 140 random stars, seeded by canvas size for consistency
  for (var i = 0; i < 140; i++) {
    var x = seededRand(i * 7.1) * canvas.width;
    var y = seededRand(i * 3.7) * canvas.height;
    var r = seededRand(i * 5.3) < 0.85 ? 0.5 : 1;
    var a = 0.3 + seededRand(i * 11.9) * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,220,200,' + a + ')';
    ctx.fill();
  }
}

// ── Ship canvas animator ──────────────────────────────────────────────────────
var _smmRAF = null;
var _smmFrameIdx = 0;
var _smmFrameTick = 0;
var _smmLastT = null;
var _smmSprites = null;  // { body: [img,img,img], thrust?: [...], thrustB?: [...], thrustBot?: [...] }
var _smmDef = null;

function loadSpriteImages(urls, cb) {
  var imgs = new Array(urls.length);
  var loaded = 0;
  urls.forEach(function(url, i) {
    var img = new Image();
    img.onload = function() { loaded++; if (loaded === urls.length) cb(imgs); };
    img.onerror = function() { loaded++; if (loaded === urls.length) cb(imgs); };
    img.src = url;
    imgs[i] = img;
  });
}

function startShipAnim(canvas, typeKey) {
  if (_smmRAF) { cancelAnimationFrame(_smmRAF); _smmRAF = null; }
  var def = DETAIL_SPRITES[typeKey];
  if (!def) return;
  _smmDef = def;
  _smmFrameIdx = 0;
  _smmFrameTick = 0;
  _smmLastT = null;

  var toLoad = { body: def.body.slice() };
  if (def.thrust)    toLoad.thrust    = def.thrust.slice();
  if (def.thrustB)   toLoad.thrustB   = def.thrustB.slice();
  if (def.thrustBot) toLoad.thrustBot = def.thrustBot.slice();

  // Load all sprite sets in parallel
  var keys = Object.keys(toLoad);
  var done = 0;
  var loaded = {};
  keys.forEach(function(k) {
    loadSpriteImages(toLoad[k], function(imgs) {
      loaded[k] = imgs;
      done++;
      if (done === keys.length) {
        _smmSprites = loaded;
        _smmRAF = requestAnimationFrame(function loop(t) {
          var dt = _smmLastT ? Math.min(t - _smmLastT, 80) : 16;
          _smmLastT = t;
          _smmFrameTick += dt;
          if (_smmFrameTick >= 120) {  // ~8fps for that chunky pixel feel
            _smmFrameTick = 0;
            _smmFrameIdx = (_smmFrameIdx + 1) % 3;
          }
          renderShipCanvas(canvas, def, _smmSprites, _smmFrameIdx);
          _smmRAF = requestAnimationFrame(loop);
        });
      }
    });
  });
}

function renderShipCanvas(canvas, def, sprites, frameIdx) {
  var scale = def.scale;
  var bw = def.w * scale, bh = def.h * scale;
  var padX = 20, padY = 20;

  // Compute actual extents of every sprite so canvas is never too small
  var minX = 0, maxX = bw, maxY = bh;

  if (def.thrustX !== undefined) {
    var tx0 = def.thrustX * scale;
    minX = Math.min(minX, tx0);
    maxX = Math.max(maxX, tx0 + def.tw * scale);
    maxY = Math.max(maxY, def.thrustY * scale + def.th * scale);
  }
  if (def.thrustBX !== undefined) {
    var tbx0 = def.thrustBX * scale;
    minX = Math.min(minX, tbx0);
    maxX = Math.max(maxX, tbx0 + def.tbw * scale);
    maxY = Math.max(maxY, def.thrustBY * scale + def.tbh * scale);
  }
  if (def.thrustBotX !== undefined) {
    maxX = Math.max(maxX, def.thrustBotX * scale + def.tbow * scale);
    maxY = Math.max(maxY, def.thrustBotY * scale + def.tboh * scale);
  }

  var leftPad  = padX + Math.max(0, -minX);
  var cw = leftPad + maxX + padX;
  var ch = padY + maxY + padY;

  canvas.width  = cw;
  canvas.height = ch;
  // CSS: scale down to fit pane if needed, keep pixelated
  canvas.style.maxWidth  = '100%';
  canvas.style.imageRendering = 'pixelated';

  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingEnabled = false;

  var bx = leftPad, by = padY;

  if (sprites.thrustB && sprites.thrustB[frameIdx]) {
    var tbw = def.tbw * scale, tbh = def.tbh * scale;
    ctx.drawImage(sprites.thrustB[frameIdx], bx + def.thrustBX * scale, by + def.thrustBY * scale, tbw, tbh);
  }
  if (sprites.thrustBot && sprites.thrustBot[frameIdx]) {
    ctx.drawImage(sprites.thrustBot[frameIdx], bx + def.thrustBotX * scale, by + def.thrustBotY * scale, def.tbow * scale, def.tboh * scale);
  }
  if (sprites.thrust && sprites.thrust[frameIdx]) {
    ctx.drawImage(sprites.thrust[frameIdx], bx + def.thrustX * scale, by + def.thrustY * scale, def.tw * scale, def.th * scale);
  }

  if (sprites.body && sprites.body[frameIdx]) {
    ctx.drawImage(sprites.body[frameIdx], bx, by, bw, bh);
  }

  // Engine glow
  var glowX = bx + (def.thrustX !== undefined ? def.thrustX * scale + def.tw * scale * 0.5 : 0);
  var glowY  = by + bh * 0.5;
  var pulse  = 0.4 + 0.3 * Math.sin(Date.now() * 0.004);
  var grad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 18 * scale * 0.4);
  grad.addColorStop(0, 'rgba(78,205,196,' + pulse + ')');
  grad.addColorStop(1, 'rgba(78,205,196,0)');
  ctx.beginPath();
  ctx.arc(glowX, glowY, 18 * scale * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

function stopShipAnim() {
  if (_smmRAF) { cancelAnimationFrame(_smmRAF); _smmRAF = null; }
  _smmSprites = null;
}

// ── Open / close manifest ─────────────────────────────────────────────────────
function closeManifest() {
  var modal = document.getElementById('ship-manifest-modal');
  if (modal) modal.classList.remove('open');
  stopShipAnim();
}

window.openShipManifest = function(ship) {
  injectManifestModal();

  var modal   = document.getElementById('ship-manifest-modal');
  var fromId  = ship.fromId || 'flesh_station';
  var toId    = ship.toId   || 'new_anchor';
  var typeKey = ship.typeKey || 'v1';

  // Seed from route + journey progress so each visible ship is unique
  var seed = (fromId.charCodeAt(0) * 17 + toId.charCodeAt(0) * 31 + Math.floor(ship.t * 100)) || 42;
  var manifest = generateManifest(fromId, toId, typeKey, seed);

  // Header
  document.getElementById('smm-header').textContent =
    'FLESH STATION — INTERNAL TRANSIT LOG — VESSEL ' + manifest.ident + ' — INTERCEPTED IN TRANSIT';

  // Ident panel
  document.getElementById('smm-ident').textContent  = '[ ' + manifest.ident + ' ]';
  document.getElementById('smm-class').textContent  = manifest.className;
  document.getElementById('smm-hull').textContent   = manifest.hull;

  // Route
  var routeBox = document.getElementById('smm-route');
  routeBox.innerHTML = [
    '<div class="smm-route-row"><span class="smm-route-label">FROM</span><span class="smm-route-val">' + manifest.fromName + '</span></div>',
    '<div class="smm-route-row"><span class="smm-route-label">TO</span><span class="smm-route-val">' + manifest.toName + '</span></div>',
  ].join('');

  // Cargo
  var cargoBox = document.getElementById('smm-cargo');
  cargoBox.innerHTML = manifest.cargo.map(function(item, i) {
    return '<div class="smm-cargo-item"><span class="smm-cargo-idx">' + (i+1).toString().padStart(2,'0') + '</span><span>' + item + '</span></div>';
  }).join('');

  // Crew
  document.getElementById('smm-crew').textContent =
    'CREW COMPLEMENT: ' + manifest.crew + ' REGISTERED  //  MANIFEST EXTRACTED VIA FLESH STATION DEEP-SCAN — NOT VISIBLE TO CREW';

  // Stars
  var starCanvas = document.getElementById('smm-stars');
  modal.classList.add('open');
  setTimeout(function() { drawStars(starCanvas); }, 10);

  // Ship animation
  var shipCanvas = document.getElementById('smm-ship-canvas');
  startShipAnim(shipCanvas, typeKey);
};

// ─── SHIPPING TAB ────────────────────────────────────────────────────────────
window._shippingLog = window._shippingLog || [];
window._shippingAddLog = function(d){
  window._shippingLog.unshift({ts:Date.now(),success:d.success,insured:d.insured,stake:d.stake,payout:d.payout,cargo:d.cargo,from:d.from,to:d.to,risk:d.interceptChance,type:d.payout?'shipping':'shipping'});
  if(window._shippingLog.length>30) window._shippingLog.length=30;
};

window.renderShippingTab = function(){
  var el=document.getElementById('gShippingInner');
  if(!el) return;

  // Request config if we don't have it yet
  if(!window._FM_TRADE_CONFIG){
    window._galaxy.send({type:'trade_config_request'});
  }

  var LANES = window._FM_LANES || [];
  var cfg = window._FM_TRADE_CONFIG || {};
  var pFac = cfg.playerFaction || window._galaxy.faction || '';
  var isSynd = pFac === 'syndicate';
  var isVoid = pFac === 'void';

  // Build unique route list
  var routes = [];
  var seen = {};
  LANES.forEach(function(l){
    var key = l.from+'|'+l.to;
    if(!seen[key]){ seen[key]=1; routes.push(l); }
  });

  // Active run status
  var activeSmug = null;
  var activeShip = window._activeShipRun || null;
  // Check smuggling status
  var smugStatus = document.getElementById('gSmugStatus');

  var h = '';

  // ── CSS ──
  h += '<style>';
  h += '#gShipTab{font-family:"Courier New","Lucida Console",monospace;font-size:.82rem}';
  h += '.ship-mode-btn{padding:10px 22px;font-size:.82rem;letter-spacing:.1em;cursor:pointer;border:1px solid #333;background:#0a0a14;color:#555;text-transform:uppercase;font-family:inherit;transition:all .15s}';
  h += '.ship-mode-btn.active-ship{border-color:#3498db;color:#3498db;background:#0a1a2d}';
  h += '.ship-mode-btn.active-smug{border-color:#e74c3c;color:#e74c3c;background:#2d0a0a}';
  h += '.ship-section{margin-top:14px;padding:14px;border:1px solid #1a1a2e;border-radius:4px;background:#07070e}';
  h += '.ship-label{font-size:.74rem;letter-spacing:.12em;color:#888;text-transform:uppercase;margin-bottom:6px}';
  h += '.ship-select,.ship-input{width:100%;background:#0a0a14;border:1px solid #333;color:#ccc;padding:8px 10px;font-size:.82rem;font-family:inherit;margin-bottom:8px;border-radius:2px}';
  h += '.ship-risk-bar{height:8px;background:#1a1a2e;border-radius:4px;overflow:hidden;margin:6px 0 10px}';
  h += '.ship-risk-fill{height:100%;border-radius:4px;transition:width .3s}';
  h += '.ship-run-btn{width:100%;padding:12px;font-size:.88rem;letter-spacing:.1em;cursor:pointer;font-family:inherit;border-radius:3px;text-transform:uppercase;transition:all .15s;margin-top:10px}';
  h += '.ship-run-btn:hover{filter:brightness(1.2)}';
  h += '.ship-run-btn:disabled{opacity:.3;cursor:not-allowed}';
  h += '.ship-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.78rem;margin-top:10px}';
  h += '.ship-info-cell{padding:8px 10px;background:#0a0a14;border:1px solid #1a1a2e;border-radius:2px}';
  h += '.ship-info-cell .lbl{color:#888;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase}';
  h += '.ship-info-cell .val{color:#e6c27a;font-size:.88rem;font-weight:bold;margin-top:3px}';
  h += '.ship-log-entry{padding:6px 8px;border-bottom:1px solid #0f0f1a;font-size:.76rem;display:flex;justify-content:space-between}';
  h += '.ship-faction-tip{padding:12px;border:1px solid #1a1a2e;border-radius:3px;font-size:.74rem;color:#888;line-height:1.8;margin-top:12px}';
  h += '.ship-active-run{padding:14px;border:2px solid;border-radius:6px;text-align:center;margin-bottom:12px}';
  h += '.ins-checkbox{margin-right:8px;accent-color:#3498db;width:16px;height:16px}';
  h += '</style>';

  h += '<div id="gShipTab">';

  // ── Mode toggle ──
  h += '<div style="display:flex;gap:0;margin-bottom:4px">';
  h += '<button class="ship-mode-btn active-ship" id="gShipModeShip" onclick="window._gShipMode(\'ship\')">🚢 Shipping Lanes</button>';
  h += '<button class="ship-mode-btn" id="gShipModeSmug" onclick="window._gShipMode(\'smug\')">📦 Smuggling Runs</button>';
  h += '</div>';

  // ── Active run display ──
  if(activeShip){
    var secLeft = Math.max(0,Math.ceil((activeShip.resolveTs - Date.now())/1000));
    h += '<div class="ship-active-run" style="border-color:#3498db;background:#0a1a2d">';
    h += '<div style="font-size:.82rem;color:#3498db;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px">SHIPPING IN TRANSIT</div>';
    h += '<div style="color:#aaa;font-size:.78rem">'+activeShip.cargo+(activeShip.insured?' 🛡 Insured':' ⚠ Uninsured')+'</div>';
    h += '<div style="color:#e6c27a;font-size:.9rem;font-weight:bold;margin-top:4px" id="gShipTimer">'+secLeft+'s</div>';
    h += '</div>';
  }

  // ── SHIPPING MODE PANE ──
  h += '<div id="gShipPane">';

  // Route selector
  h += '<div class="ship-section">';
  h += '<div class="ship-label">Select Route</div>';
  h += '<select class="ship-select" id="gShipRoute" onchange="window._gShipCalcRisk()">';
  routes.forEach(function(l){
    var fn=(window._galaxy.meta[l.from]||{name:l.from}).name;
    var tn=(window._galaxy.meta[l.to]||{name:l.to}).name;
    var lk=[l.from,l.to].sort().join('|');
    var blk=(window._FM_BLOCKADES||{})[lk];
    var blkLabel=blk&&blk.active?' ⛔ BLOCKADED':'';
    h += '<option value="'+l.from+'|'+l.to+'|'+l.type+'">'+fn+' → '+tn+' ('+l.type+')'+blkLabel+'</option>';
  });
  h += '</select>';

  // Cargo selector
  h += '<div class="ship-label">Cargo Type</div>';
  h += '<select class="ship-select" id="gShipCargo" onchange="window._gShipCalcRisk()">';
  h += '<option value="standard_freight">Standard Freight (×1.15 / +0% risk)</option>';
  h += '<option value="premium_goods">Premium Goods (×1.25 / +5% risk)</option>';
  h += '<option value="luxury_supplies">Luxury Supplies (×1.35 / +12% risk)</option>';
  h += '</select>';

  // Stake + Insurance
  h += '<div class="ship-label">Cargo Value (Stake)</div>';
  h += '<input class="ship-input" type="number" id="gShipStake" placeholder="Ƒ amount" min="100" onchange="window._gShipCalcRisk()" oninput="window._gShipCalcRisk()"/>';
  h += '<div style="display:flex;align-items:center;margin-bottom:8px">';
  h += '<input type="checkbox" class="ins-checkbox" id="gShipInsure" onchange="window._gShipCalcRisk()"/>';
  h += '<label for="gShipInsure" style="font-size:.78rem;color:#3498db;cursor:pointer">🛡 Insure cargo (5–12% premium — refunds stake if lost)</label>';
  h += '</div>';

  // Risk display
  h += '<div class="ship-label">Estimated Risk</div>';
  h += '<div class="ship-risk-bar"><div class="ship-risk-fill" id="gShipRiskFill" style="width:8%;background:#2ecc71"></div></div>';
  h += '<div style="display:flex;justify-content:space-between;font-size:.76rem">';
  h += '<span style="color:#555" id="gShipRiskPct">~8%</span>';
  h += '<span style="color:#555" id="gShipRiskDetail">base rate</span>';
  h += '</div>';

  // Info grid
  h += '<div class="ship-info-grid" id="gShipInfoGrid">';
  h += '<div class="ship-info-cell"><div class="lbl">Potential Profit</div><div class="val" id="gShipProfit">—</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">Insurance Cost</div><div class="val" id="gShipInsCost">—</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">Total Cost</div><div class="val" id="gShipTotalCost">—</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">EV / Run</div><div class="val" id="gShipEV">—</div></div>';
  h += '</div>';

  // RUN button
  h += '<button class="ship-run-btn" id="gShipRunBtn" style="background:#0a1a2d;border:1px solid #3498db;color:#3498db" onclick="window._gStartShipping()">🚢 Launch Shipping Run</button>';
  h += '</div>'; // close ship-section
  h += '</div>'; // close gShipPane

  // ── SMUGGLING MODE PANE ──
  h += '<div id="gSmugPane" style="display:none">';
  h += '<div class="ship-section">';
  h += '<div class="ship-label">Select Route</div>';
  h += '<select class="ship-select" id="gSmugRoute" onchange="window._gSmugCalcRisk()">';
  routes.forEach(function(l){
    var fn=(window._galaxy.meta[l.from]||{name:l.from}).name;
    var tn=(window._galaxy.meta[l.to]||{name:l.to}).name;
    h += '<option value="'+l.from+'|'+l.to+'|'+l.type+'">'+fn+' → '+tn+' ('+l.type+')</option>';
  });
  h += '</select>';

  // Contraband selector
  h += '<div class="ship-label">Contraband</div>';
  h += '<select class="ship-select" id="gSmugCargo2" onchange="window._gSmugCalcRisk()">';
  h += '<option value="data_cores">Data Cores (×1.5 / +5% risk)</option>';
  h += '<option value="rare_minerals">Rare Minerals (×1.6 / +8% risk)</option>';
  h += '<option value="synth_organs">Synth Organs (×1.8 / +10% risk)</option>';
  h += '<option value="contraband_arms">Contraband Arms (×2.2 / +15% risk)</option>';
  h += '<option value="black_market_tech">Black Market Tech (×2.5 / +18% risk)</option>';
  h += '<option value="sweet_wine">S\'weet Wine (×3.0 / +20% risk)</option>';
  h += '</select>';

  // Stake
  h += '<div class="ship-label">Stake</div>';
  h += '<input class="ship-input" type="number" id="gSmugStake2" placeholder="Ƒ amount" min="100" onchange="window._gSmugCalcRisk()" oninput="window._gSmugCalcRisk()"/>';

  if(isSynd){
    h += '<div style="font-size:.74rem;color:#e74c3c;margin-bottom:6px">💀 Syndicate: +15% payout bonus · +5% risk on own turf · No free rides</div>';
  }

  // Risk display
  h += '<div class="ship-label">Estimated Risk</div>';
  h += '<div class="ship-risk-bar"><div class="ship-risk-fill" id="gSmugRiskFill" style="width:18%;background:#e74c3c"></div></div>';
  h += '<div style="display:flex;justify-content:space-between;font-size:.76rem">';
  h += '<span style="color:#555" id="gSmugRiskPct">~18%</span>';
  h += '<span style="color:#555" id="gSmugRiskDetail">base + cargo</span>';
  h += '</div>';

  // Info grid
  h += '<div class="ship-info-grid" id="gSmugInfoGrid">';
  h += '<div class="ship-info-cell"><div class="lbl">Potential Payout</div><div class="val" id="gSmugPayout">—</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">Bet-Size Penalty</div><div class="val" id="gSmugBetPenalty">+0%</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">Faction Mod</div><div class="val" id="gSmugFacMod">—</div></div>';
  h += '<div class="ship-info-cell"><div class="lbl">EV / Run</div><div class="val" id="gSmugEV">—</div></div>';
  h += '</div>';

  // RUN button
  h += '<button class="ship-run-btn" id="gSmugRunBtn" style="background:#2d0a0a;border:1px solid #e74c3c;color:#e74c3c" onclick="window._gStartSmuggling2()">📦 Launch Smuggling Run</button>';
  h += '</div>'; // close ship-section
  h += '</div>'; // close gSmugPane

  // ── Faction tips ──
  h += '<div class="ship-faction-tip">';
  h += '<div style="color:#4ecdc4;margin-bottom:6px;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase">How Factions Affect Trade</div>';
  h += '<div><span style="color:#4ecdc4">Coalition</span> — Stable colonies reduce shipping risk. Control both endpoints for -5% risk.</div>';
  h += '<div><span style="color:#e74c3c">Syndicate</span> — +15% payout on smuggling, but +5% risk on own turf. No free rides.</div>';
  h += '<div><span style="color:#9b59b6">Void</span> — Earn 2% of all intercepted cargo (shipping & smuggling) as raid income.</div>';
  h += '<div style="margin-top:4px"><span style="color:#f39c12">Tension</span> — High tension helps smugglers, hurts shippers. Low tension is the opposite.</div>';
  h += '<div><span style="color:#e74c3c">Blockades</span> — Block shipping entirely. Smuggling still works at +10% risk.</div>';
  h += '<div><span style="color:#3498db">Lane Shares</span> — Shareholders earn 1-2% of all trade profit on their lane.</div>';
  h += '</div>';

  // ── Run History ──
  h += '<div class="ship-section" style="margin-top:10px">';
  h += '<div class="ship-label">Run History</div>';
  h += '<div id="gShipLog" style="max-height:120px;overflow-y:auto">';
  if(window._shippingLog.length===0){
    h += '<div style="font-size:.74rem;color:#444;text-align:center;padding:12px">No runs yet</div>';
  } else {
    window._shippingLog.forEach(function(entry){
      var col = entry.success?'#2ecc71':(entry.insured?'#f39c12':'#e74c3c');
      var label = entry.success?'DELIVERED':(entry.insured?'INSURED LOSS':'LOST');
      h += '<div class="ship-log-entry"><span style="color:'+col+'">'+label+'</span><span style="color:#555">'+entry.cargo+'</span>';
      h += '<span style="color:#aaa">\u0192'+(entry.success?Number(entry.payout||0).toLocaleString():'-'+Number(entry.stake).toLocaleString())+'</span>';
      h += '<span style="color:#444">'+entry.risk+'%</span></div>';
    });
  }
  h += '</div></div>';

  // ── Active run countdown ──
  if(window._activeShipRun || window._activeSmugRun){
    var ar = window._activeShipRun || window._activeSmugRun;
    var arLeft = Math.max(0, Math.ceil(((ar.resolveTs || 0) - Date.now()) / 1000));
    var arColor = ar.type === 'shipping' ? '#3498db' : '#e74c3c';
    var arLabel = ar.type === 'shipping' ? '🚢 SHIPPING' : '📦 SMUGGLING';
    var arFrom = (window._galaxy.meta[ar.from]||{name:ar.from}).name;
    var arTo = (window._galaxy.meta[ar.to]||{name:ar.to}).name;
    h += '<div class="ship-section" style="border-color:'+arColor+';text-align:center;margin-bottom:10px">';
    h += '<div style="color:'+arColor+';font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">'+arLabel+' RUN ACTIVE</div>';
    h += '<div style="color:#ccc;font-size:.78rem;margin-bottom:4px">'+arFrom+' → '+arTo+' ('+ar.cargo+')</div>';
    h += '<div style="color:#aaa;font-size:.76rem">Stake: \u0192'+Number(ar.stake).toLocaleString()+(ar.insured?' · Insured':'')+'</div>';
    h += '<div id="gShipCountdownTimer" style="color:'+arColor+';font-size:.88rem;font-weight:bold;margin-top:8px">'+(arLeft>0?'EN ROUTE — '+arLeft+'s remaining...':'Resolving...')+'</div>';
    h += '</div>';
  }

  // ── Cooldown timer ──
  h += '<div style="text-align:center;margin-top:8px;font-size:.76rem;color:#666" id="gShipCooldown"></div>';

  h += '</div>'; // close gShipTab
  el.innerHTML = h;

  // Start timer for active run
  if(activeShip){
    var tmEl=document.getElementById('gShipTimer');
    if(tmEl){
      var _stIv=setInterval(function(){
        var sl=Math.max(0,Math.ceil((activeShip.resolveTs-Date.now())/1000));
        if(sl<=0){ clearInterval(_stIv); tmEl.textContent='Resolving...'; window._activeShipRun=null; return; }
        tmEl.textContent=sl+'s';
      },500);
    }
  }

  // Initial risk calc
  try{ window._gShipCalcRisk(); }catch(_){}
  try{ window._gSmugCalcRisk(); }catch(_){}
};

// ── Mode toggle ──
window._gShipMode = function(mode){
  var sp=document.getElementById('gShipPane');
  var sm=document.getElementById('gSmugPane');
  var bs=document.getElementById('gShipModeShip');
  var bm=document.getElementById('gShipModeSmug');
  if(mode==='ship'){
    if(sp) sp.style.display='block'; if(sm) sm.style.display='none';
    if(bs){ bs.className='ship-mode-btn active-ship'; }
    if(bm){ bm.className='ship-mode-btn'; }
  } else {
    if(sp) sp.style.display='none'; if(sm) sm.style.display='block';
    if(bs){ bs.className='ship-mode-btn'; }
    if(bm){ bm.className='ship-mode-btn active-smug'; }
  }
};

// ── Shipping risk calculator ──
window._gShipCalcRisk = function(){
  var routeSel=document.getElementById('gShipRoute');
  var cargoSel=document.getElementById('gShipCargo');
  var stakeInp=document.getElementById('gShipStake');
  var insChk=document.getElementById('gShipInsure');
  if(!routeSel||!cargoSel||!stakeInp) return;

  var parts=routeSel.value.split('|');
  var from=parts[0],to=parts[1],ltype=parts[2];
  var cargoId=cargoSel.value;
  var stake=Number(stakeInp.value)||0;
  var insured=insChk&&insChk.checked;

  // Cargo risk
  var cargoRisks={standard_freight:0,premium_goods:0.05,luxury_supplies:0.12};
  var cargoMults={standard_freight:1.15,premium_goods:1.25,luxury_supplies:1.35};
  var cRisk=cargoRisks[cargoId]||0;
  var cMult=cargoMults[cargoId]||1.15;

  // Tension mod
  var fromState=window._galaxy.state[from]||{tension:0};
  var toState=window._galaxy.state[to]||{tension:0};
  var avgT=((fromState.tension||0)+(toState.tension||0))/2;
  var tensionMod=avgT/1500;

  // Faction mod
  var fMod=0;
  var pFac=window._galaxy.faction||'';
  if(pFac&&pFac!=='guild'){
    var ck='control_'+pFac;
    if((fromState[ck]||0)>=40) fMod-=0.025;
    if((toState[ck]||0)>=40) fMod-=0.025;
    var facs=['coalition','syndicate','void'];
    var fromLead=facs.reduce(function(b,f){return (fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b;},'coalition');
    var toLead=facs.reduce(function(b,f){return (toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b;},'coalition');
    if(fromLead!==pFac) fMod+=0.04;
    if(toLead!==pFac) fMod+=0.04;
  }

  // Blockade check
  var lk=[from,to].sort().join('|');
  var blk=(window._FM_BLOCKADES||{})[lk];
  var blocked=blk&&blk.active;

  // Bet-size scaling: larger shipments = more risk
  var betRisk=0;
  if(stake<=5000) betRisk=0;
  else if(stake<=25000) betRisk=0.05;
  else if(stake<=100000) betRisk=0.10;
  else betRisk=0.15;

  var totalRisk=Math.min(0.60,Math.max(0.02, 0.18+cRisk+tensionMod+fMod+betRisk));
  var riskPct=Math.round(totalRisk*100);

  // Display
  var rFill=document.getElementById('gShipRiskFill');
  var rPct=document.getElementById('gShipRiskPct');
  var rDetail=document.getElementById('gShipRiskDetail');
  if(rFill){
    rFill.style.width=riskPct+'%';
    rFill.style.background=riskPct>25?'#e74c3c':riskPct>15?'#f39c12':'#2ecc71';
  }
  if(rPct) rPct.textContent=riskPct+'%'+(blocked?' ⛔ BLOCKED':'');
  var details=[];
  if(tensionMod>0.005) details.push('tension +'+Math.round(tensionMod*100)+'%');
  if(fMod<0) details.push('faction '+Math.round(fMod*100)+'%');
  if(fMod>0) details.push('enemy +'+Math.round(fMod*100)+'%');
  if(betRisk>0) details.push('size +'+Math.round(betRisk*100)+'%');
  if(rDetail) rDetail.textContent=details.length?details.join(', '):'base rate';

  // Insurance premium scales with shipment size
  var insRate=0.05;
  if(stake>500000) insRate=0.12;
  else if(stake>100000) insRate=0.10;
  else if(stake>10000) insRate=0.07;

  // Info grid
  var profit=stake>0?Math.round(stake*cMult-stake):0;
  var insCost=insured?Math.round(stake*insRate):0;
  var totalCost=stake+insCost;
  var ev=stake>0?Math.round(((1-totalRisk)*profit - totalRisk*(insured?insCost:stake))):0;
  var profitEl=document.getElementById('gShipProfit');
  var insEl=document.getElementById('gShipInsCost');
  var totalEl=document.getElementById('gShipTotalCost');
  var evEl=document.getElementById('gShipEV');
  if(profitEl) profitEl.textContent='\u0192'+profit.toLocaleString();
  if(insEl) insEl.textContent=insured?'\u0192'+insCost.toLocaleString():'none';
  if(totalEl) totalEl.textContent='\u0192'+totalCost.toLocaleString();
  if(evEl){ evEl.textContent=(ev>=0?'+':'')+'\u0192'+ev.toLocaleString(); evEl.style.color=ev>=0?'#2ecc71':'#e74c3c'; }

  // Disable run if blocked
  var runBtn=document.getElementById('gShipRunBtn');
  if(runBtn){
    if(blocked){ runBtn.disabled=true; runBtn.textContent='⛔ Lane Blockaded'; }
    else { runBtn.disabled=false; runBtn.textContent='🚢 Launch Shipping Run'; }
  }
};

// ── Smuggling risk calculator ──
window._gSmugCalcRisk = function(){
  var routeSel=document.getElementById('gSmugRoute');
  var cargoSel=document.getElementById('gSmugCargo2');
  var stakeInp=document.getElementById('gSmugStake2');
  if(!routeSel||!cargoSel||!stakeInp) return;

  var parts=routeSel.value.split('|');
  var from=parts[0],to=parts[1],ltype=parts[2];
  var cargoId=cargoSel.value;
  var stake=Number(stakeInp.value)||0;

  // Lane base risk
  var laneRisks={corporate:0.15,grey:0.28,contested:0.40,dark:0.55};
  var lanePayMults={corporate:1.0,grey:1.5,contested:2.0,dark:3.0};
  var baseRisk=laneRisks[ltype]||0.28;
  var payMult=lanePayMults[ltype]||1.5;

  // Cargo risk+mult
  var cargoData={synth_organs:{r:0.10,m:1.8},contraband_arms:{r:0.15,m:2.2},data_cores:{r:0.05,m:1.5},rare_minerals:{r:0.08,m:1.6},sweet_wine:{r:0.20,m:3.0},black_market_tech:{r:0.18,m:2.5}};
  var cd=cargoData[cargoId]||{r:0.05,m:1.5};

  // Bet-size scaling
  var betExtra=0;
  if(stake<=5000) betExtra=0;
  else if(stake<=25000) betExtra=0.10;
  else if(stake<=100000) betExtra=0.20;
  else betExtra=0.28;

  // Tension (inverted for smuggling)
  var fromState=window._galaxy.state[from]||{tension:0};
  var toState=window._galaxy.state[to]||{tension:0};
  var avgT=((fromState.tension||0)+(toState.tension||0))/2;
  var tensionMod=-(avgT/2000);

  // Faction mod
  var fMod=0;
  var pFac=window._galaxy.faction||'';
  var isSynd=pFac==='syndicate';
  if(pFac&&pFac!=='guild'){
    var ck='control_'+pFac;
    if((fromState[ck]||0)>=40) fMod-=0.02;
    if((toState[ck]||0)>=40) fMod-=0.02;
    var facs=['coalition','syndicate','void'];
    var fromLead=facs.reduce(function(b,f){return (fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b;},'coalition');
    var toLead=facs.reduce(function(b,f){return (toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b;},'coalition');
    if(fromLead!==pFac&&avgT<30) fMod+=0.03;
    if(toLead!==pFac&&avgT<30) fMod+=0.03;
  }
  // Syndicate: +5% risk on own turf, no risk reduction
  var syndRisk=0;
  if(isSynd){
    var facs2=['coalition','syndicate','void'];
    var fL=facs2.reduce(function(b,f){return (fromState['control_'+f]||0)>(fromState['control_'+b]||0)?f:b;},'coalition');
    var tL=facs2.reduce(function(b,f){return (toState['control_'+f]||0)>(toState['control_'+b]||0)?f:b;},'coalition');
    if(fL==='syndicate') syndRisk+=0.05;
    if(tL==='syndicate') syndRisk+=0.05;
  }

  // Blockade
  var lk=[from,to].sort().join('|');
  var blk=(window._FM_BLOCKADES||{})[lk];
  var blockadeMod=(blk&&blk.active)?0.10:0;

  var totalRisk=Math.min(0.85,Math.max(0.05, baseRisk+cd.r+betExtra+tensionMod+fMod+syndRisk+blockadeMod));
  var riskPct=Math.round(totalRisk*100);
  var syndPayMult=isSynd?1.15:1;
  var payout=stake>0?Math.round(stake*cd.m*payMult*syndPayMult):0;

  // Display
  var rFill=document.getElementById('gSmugRiskFill');
  var rPctEl=document.getElementById('gSmugRiskPct');
  var rDetail=document.getElementById('gSmugRiskDetail');
  if(rFill){
    rFill.style.width=Math.min(100,riskPct)+'%';
    rFill.style.background=riskPct>40?'#e74c3c':riskPct>25?'#f39c12':'#2ecc71';
  }
  if(rPctEl) rPctEl.textContent=riskPct+'%'+(blockadeMod?' +10% blockade':'');
  var details=[];
  if(betExtra>0) details.push('bet-size +'+Math.round(betExtra*100)+'%');
  if(tensionMod<-0.005) details.push('tension '+Math.round(tensionMod*100)+'%');
  if(fMod!==0) details.push('faction '+(fMod>0?'+':'')+Math.round(fMod*100)+'%');
  if(syndRisk>0) details.push('synd turf +'+Math.round(syndRisk*100)+'%');
  if(isSynd) details.push('+15% payout');
  if(rDetail) rDetail.textContent=details.length?details.join(', '):'base + cargo';

  var payEl=document.getElementById('gSmugPayout');
  var betPen=document.getElementById('gSmugBetPenalty');
  var facMod=document.getElementById('gSmugFacMod');
  var evEl=document.getElementById('gSmugEV');
  if(payEl) payEl.textContent='\u0192'+payout.toLocaleString()+(isSynd?' (+15%)':'');
  if(betPen) betPen.textContent='+'+(Math.round(betExtra*100))+'%';
  if(facMod){
    var fm=Math.round((fMod+syndRisk)*100);
    facMod.textContent=(fm>0?'+':'')+fm+'%';
    facMod.style.color=fm<0?'#2ecc71':fm>0?'#e74c3c':'#555';
  }
  if(evEl){
    var ev=stake>0?Math.round((1-totalRisk)*(payout-stake)-totalRisk*stake):0;
    evEl.textContent=(ev>=0?'+':'')+'\u0192'+ev.toLocaleString();
    evEl.style.color=ev>=0?'#2ecc71':'#e74c3c';
  }
};

// ── Launch shipping ──
window._gStartShipping = function(){
  if(!window._galaxy.token){ window._galaxy.toast('Log in first','#e74c3c'); return; }
  var routeSel=document.getElementById('gShipRoute');
  var cargoSel=document.getElementById('gShipCargo');
  var stakeInp=document.getElementById('gShipStake');
  var insChk=document.getElementById('gShipInsure');
  if(!routeSel||!stakeInp) return;
  var parts=routeSel.value.split('|');
  var stake=Number(stakeInp.value)||0;
  if(!stake||stake<100){ window._galaxy.toast('Min stake: \u0192100','#e74c3c'); return; }
  window._galaxy.send({type:'shipping_start',from:parts[0],to:parts[1],cargoId:cargoSel?cargoSel.value:'standard_freight',stake:stake,insured:!!(insChk&&insChk.checked)});
};

// ── Launch smuggling from shipping tab ──
window._gStartSmuggling2 = function(){
  if(!window._galaxy.token){ window._galaxy.toast('Log in first','#e74c3c'); return; }
  var routeSel=document.getElementById('gSmugRoute');
  var cargoSel=document.getElementById('gSmugCargo2');
  var stakeInp=document.getElementById('gSmugStake2');
  if(!routeSel||!stakeInp) return;
  var parts=routeSel.value.split('|');
  var stake=Number(stakeInp.value)||0;
  if(!stake||stake<100){ window._galaxy.toast('Min stake: \u0192100','#e74c3c'); return; }
  window._galaxy.send({type:'smuggling_start',from:parts[0],to:parts[1],cargoId:cargoSel?cargoSel.value:'synth_organs',stake:stake});
};

})();
