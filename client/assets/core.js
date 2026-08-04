
function $(s,r){try{return (r||document).querySelector(s)}catch(e){return null}}
function $all(s,r){try{return Array.from((r||document).querySelectorAll(s)||[])}catch(e){return []}}
var toggleBtn = document.getElementById('toggleBtn') || document.querySelector('[data-role="toggle"]');
// WS connects after fm:authed fires (token guaranteed available).
// Queue holds messages sent before connection opens.
const _wsQueue = [];
let _wsReal = null;
let _wsReconnectDelay = 1000;
const ws = {
  readyState: 0,
  send(data) {
    if (_wsReal && _wsReal.readyState === 1) _wsReal.send(data);
    else _wsQueue.push(data);
  },
  addEventListener(ev, fn) { document.addEventListener('_fmws:'+ev, e => fn(e.detail)); }
};
window.ws = ws;

function wsConnect(token) {
  if (token) window.__fmToken = token;
  if (_wsReal) { try { _wsReal.close(); } catch(e){} }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url   = proto + '//' + location.host + (token ? '?token=' + encodeURIComponent(token) : '');
  _wsReal = new WebSocket(url);
  ws.readyState = 0;
  _wsReal.onopen = () => {
    ws.readyState = 1;
    _wsReconnectDelay = 1000; // reset backoff on successful connect
    _wsQueue.splice(0).forEach(d => _wsReal.send(d));
    document.dispatchEvent(new CustomEvent('_fmws:open', {detail:{}}));
  };
  _wsReal.onmessage = e => {
    document.dispatchEvent(new CustomEvent('_fmws:message', {detail: {data: e.data}}));
    // Expose socket reference and dispatch parsed messages for mod panel
    window._ws = _wsReal;
    try {
      const parsed = JSON.parse(e.data);
      document.dispatchEvent(new CustomEvent('fm_ws_msg', {detail: parsed}));
    } catch(_) {}
  };
  _wsReal.onclose = e => {
    ws.readyState = 3;
    document.dispatchEvent(new CustomEvent('_fmws:close', {detail:e}));
    // Exponential backoff reconnect (skip if deliberate close or no token)
    const tok = window.__fmToken;
    if (tok && e.code !== 1000) {
      const delay = Math.min(30000, (_wsReconnectDelay || 1000));
      _wsReconnectDelay = delay * 2;
      setTimeout(() => {
        if (ws.readyState === 3) {
          console.log('[WS] Reconnecting in', delay, 'ms...');
          wsConnect(tok);
        }
      }, delay);
    }
  };
  _wsReal.onerror = e => document.dispatchEvent(new CustomEvent('_fmws:error', {detail:e}));
}
const el = sel => document.querySelector(sel);
const list = sel => document.querySelector(sel);

// --- Legacy compatibility wrapper ---
function sendWS(payloadOrType, maybeSymbol){
  try{
    const msg = (typeof payloadOrType === 'string')
      ? { type: String(payloadOrType), symbol: maybeSymbol }
      : (payloadOrType || {});
    if (window.PnLBridge && typeof window.PnLBridge.sendWS === 'function'){
      return window.PnLBridge.sendWS(msg);
    }
    // Fallback: raw ws
    const sock = window.ws;
    const out = JSON.stringify(msg);
    if (sock.readyState === 1){ sock.send(out); }
    else {
      sock.addEventListener('open', ()=>{ try{ sock.send(out); }catch(e){} }, { once:true });
    }
  }catch(e){
    console.error('sendWS wrapper error', e);
  }
}


let ME = null;
// ── Username bad-word filter — applied at registration + admin rename ──────
// Words are lowercased substring matches. Add terms as needed.
var USERNAME_BADWORDS = [
  // Slurs & hate speech
  'nigger','nigga','kike','chink','spic','wetback','gook','towelhead','raghead',
  'tranny','faggot','fag','dyke','retard','cripple','beaner','cracker','honky',
  // Sexual / explicit
  'fuck','shit','cunt','cock','dick','pussy','ass','bitch','whore','slut',
  'cumshot','blowjob','handjob','penis','vagina','dildo','buttplug','anal',
  'porn','hentai','nudist','naked','nsfw','sex','horny','masturbat',
  // Violence / threats
  'kill','murder','rape','lynch','genocide','terror','jihad','nazi',
  // Common offensive combos / variants
  'kkk','1488','88','heil','n1gg','n!gg','f4g','b1tch','$hit','@ss',
];

// Returns true if the name contains a blocked word
function usernameHasBadWord(name) {
  if (!name) return false;
  const lower = name.toLowerCase().replace(/[0-9@$!]/g, c =>
    ({'0':'o','1':'i','@':'a','$':'s','!':'i'}[c]||c));
  return USERNAME_BADWORDS.some(w => lower.includes(w));
}
window.usernameHasBadWord = usernameHasBadWord;

var TICKERS = [];   // var so window.TICKERS works across script blocks
var CURRENT = null;
let OHLC = [];
let _waveBuffer = []; // rolling buffer of raw close prices (one per tick)
let _waveTimes = [];  // parallel real timestamps (ms) per point, so the chart time axis reflects true elapsed time (5s OHLC seed bars + 500ms live ticks) and widens with the extended-history upgrade
let _waveOpenPrice = 0; // session open for %change

function fmt(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }


// ── Company Lore ──────────────────────────────────────────────────────────────
// Keyed by company name (trailing numbers already stripped server-side).
// Descriptions are shown in the ticker list when a company is selected.
const COMPANY_LORE = {
  "Jade Circuit Holdings": "The Circuit's central holding company. Holds a controlling stake in every other Jade house and files no consolidated accounts.",
  "Yujing Trust":          "Private banking house managing Circuit capital. Accounts are open-ended and are not closed on transfer.",
  "Tiangong Bureau":       "Operates the wormhole gate and licenses every crossing. Sets the toll, keeps the manifest, and answers to no colony.",
  "Yuhua Assurance":       "Underwrites Circuit lives and cargo. Premiums are set internally and are not quoted to buyers outside Jade space.",
  "Shennong Biotech":      "The Circuit's medical arm. Supplies the cluster's pharmaceuticals and surgical grafts with no licensed competitor.",
  "Bencao Pharma":         "Compounds proprietary drugs under formulas never filed for external approval. Prices are set by the house, not the market.",
  "Lingzhi Labs":          "Grows engineered tissue and cultured organs to order. Output is allocated by waiting list, not by bid.",
  "Houji Agri":            "Feeds the cluster from sealed hydroponic estates. Runs to fixed quota regardless of demand.",
  "Mozi Quantum":          "Builds the Circuit's quantum processors. Designs are held internally and never sold outside Jade space.",
  "Zhiguang Optics":       "Manufactures the sensors and lenses covering the cluster. Every unit ships with a serial the house retains.",
  "Tianwen Data":          "Warehouses Circuit records and reads the deep field for advantage. Findings are archived, never published.",
  "Wukong Deepscan":       "Surveys collapsed stars and exotic matter at the cluster edge. Output is consumed internally and does not reach open market.",
  "Zheng He Lines":        "The Circuit's flagship carrier. Moves cargo the Guild will not take and logs every consignment.",
  "Baochuan Ports":        "Operates the Quanzhou docks. Berth priority is allocated by the house and cannot be bought.",
  "Haisi Logistics":       "Runs the waystations along the Jade trade routes. Every hull passing is logged and the record is not purged.",
  "Silu Transit":          "Moves freight the Circuit does not book on the exchange. No house claims it and every house uses it.",
  "Houtu Energy":          "Powers the cluster from the Houtu furnaces. Output is set to annual target, not to demand.",
  "Changzheng Heavy":      "Builds Circuit hulls and heavy machinery. Yard quota is fixed at the start of the year and is not revised.",
  "Xuantie Metals":        "Smelts the rare alloys the Circuit stockpiles. Grades are certified against an internal standard.",
  "Ember Crucible":        "Refines fuel and reactor mass at the Zhurong crucibles. The furnaces are not permitted to cool.",
  "Anchor Biotech":       "Pharmaceutical subsidiary of the Anchor group producing licensed augmentation compounds for frontier colonies. North Biotech holds the Coalition approval; Anchor Biotech undercuts them in markets where that approval is not checked.",
  "Anchor International": "Regional banking house with loan operations across seven colonial markets. Repossessing entire settlements when payments lapse is not a last resort; it is a business model.",
  "Anchor Realty":        "Property valuation and land-title brokerage operating in contested colonial zones. Prices tend to drop sharply when their assessors arrive.",
  "Anchor Retail":        "Consumer goods chain operating under the Anchor brand across inner colonial stations. Reliable stock, predictable pricing, zero personality.",
  "ApexContraband":       "Distribution firm for unclassified goods moving through grey-market channels, bonded through The Escrow. Listed. Audited. Neither process was convincing.",
  "AshenTextiles":        "Synthetic fiber manufacturer producing industrial-grade materials for mining and hazmat applications. Labor disputes are frequent and turnover is higher.",
  "Aspen Automation":     "Industrial robotics firm supplying mining and freight automation systems across the outer colonies. Maintenance contracts are mandatory and priced accordingly.",
  "Aspen Energy":         "Mid-tier energy producer supplying fusion power to frontier colonial grids. Competes directly with Atlas Energy for the same government contracts and loses more often than its filings admit.",
  "Aspen Financial":      "Colonial credit and mortgage provider operating across mid-rim settlements. Foreclosure proceedings are its most active business unit.",
  "Atlas Consulting":     "Management consultancy embedded in colonial governance contracts; restructuring and workforce optimization are the products. Both usually mean the same thing.",
  "Atlas Dynamics":       "Heavy industrial equipment manufacturer with contracts across four colonial systems; durability is the selling point and replacement parts are priced to maximize the other one.",
  "Atlas Energy":         "Colonial energy infrastructure operator managing power grids across multiple systems. Holds exclusive supply contracts with six planetary governments. WraithEnergy covers the territory Atlas will not touch.",
  "Atlas Realty":         "Property development and land valuation firm operating across Coalition-aligned colonial systems. Politically connected and structurally sound.",
  "Atlas Supplies":       "General industrial supply distributor with warehouses on six stations. Carries everything from fasteners to fusion components.",
  "Atlas Textiles":       "Synthetic material and textile manufacturer supplying industrial and consumer markets across the inner colonies. Output is relentless. Quality is consistent.",
  "Aurora Electric":      "High-capacity power generation and distribution company operating fusion plants on Aurora Prime. Largest energy supplier in the inner colonial system. WraithEnergy holds what Aurora Electric cannot.",
  "Aurora Enterprises":   "Diversified holding group with interests in energy, logistics, and media across the Aurora Prime system. Publicly traded. Privately controlled.",
  "Aurora Metals":        "Rare metal extraction and refining operation based out of Dust Basin, supplying aerospace and electronics manufacturers across the settled systems. Despite the name, no affiliation with the Aurora Prime energy companies. Ore grades are closely guarded commercial secrets.",
  "Aurora Robotics":      "Research and development robotics firm building next-generation autonomous systems under a joint Coalition and private contract. Several applications are classified.",
  "Baron Corps":          "The barons of Gluttonis do not negotiate. They set the refining quota and the galaxy moves around it. Sixty percent of all rare material processing runs through their orbital rigs. When Baron Corps slows output, freight lanes go quiet within a week.",
  "Beacon Consulting":    "Corporate advisory firm that helps mid-size companies navigate regulatory frameworks across faction territories. Also helps them avoid them.",
  "Beacon Technologies":  "Communications hardware and network infrastructure company with Coalition contracts for colonial relay installation. Hardware is in more places than the contract specifies.",
  "BlackCapital":         "Unregistered investment fund operating out of Scrub Yard under four regulatory jurisdictions simultaneously; none of them know about the others. Acquisitions are quietly done. Nobody asks questions because nobody wants answers.",
  "BloodWorks":           "Plasma harvesting and processing operation with stations throughout the Vein Cluster. Upstream supplier for VeinConsortium and several distributors who prefer not to be named in the same sentence.",
  "Blue Media":           "Colonial entertainment and news content producer with distribution across six systems. Content is Coalition-friendly. Editorial independence is theoretical.",
  "Blue Packaging":       "Specialty packaging manufacturer producing secure transport containers for pharmaceutical and high-value cargo. Contents are not their concern.",
  "Blue Shipping":        "Mid-tier freight carrier operating scheduled cargo routes between inner colonies. On-time delivery rates are average. Customs declarations are selective.",
  "BoneMarkets":          "Secondary skeletal components broker sourcing inventory from BoneYards and several Vein Cluster intermediaries. Certification status of incoming stock is rarely verified.",
  "BoneYards":            "Decommissioned augmentation retrieval firm operating out of Margin Call's industrial floor. Recovers implants from deceased colonists and resells them after minimal reconditioning; primary supplier to BoneMarkets.",
  "CarrionFarms":         "Protein substrate production facility growing tissue cultures for pharmaceutical and food applications. Shares processing infrastructure with several Vein Cluster biotech firms. Listed under Biotech. Could easily be listed under Misc.",
  "Cascade Minerals":     "Mining conglomerate operating across three tidally-locked moons in the Cascade Station system. Raw output feeds Vertex Aerospace and CoalitionMetals. Controls the ore flow that keeps both of them operational.",
  "Cascade Pharma":       "Research-grade pharmaceutical manufacturer producing compounds under Coalition clinical trial licenses. Several researchers have since left to form Nova Biotech following an incident that does not appear in any public filing.",
  "Catalyst Insurance":   "Mid-tier risk underwriter covering colonial infrastructure and cargo. Pays out reliably, as long as the loss can be documented.",
  "Catalyst Packaging":   "Pharmaceutical-grade packaging manufacturer producing tamper-evident containers for licensed drug distribution. Also produces containers that are not tamper-evident.",
  "Catalyst Pharma":      "Generic drug manufacturer supplying frontier medical outposts. Production facilities operate under relaxed inspection protocols in the outer colonies.",
  "Cedar Dynamics":       "Mid-size mechanical engineering firm producing pressure systems and structural components for habitat construction and mining infrastructure.",
  "Cedar Insurance":      "Boutique liability insurer for high-risk manufacturing clients. Exclusion clauses run to forty pages.",
  "Cedar Networks":       "Data networking firm building communications infrastructure across mid-rim colonial systems. Several relay nodes route through Null Point without disclosure. NullSyndicate charges a toll that Cedar Networks does not list in its operational costs.",
  "CipherHoldings":       "Shell corporation holding company whose actual ownership traces back to three other shell corporations. The Syndicate routes clean money through it, primarily out of The Hollow.",
  "CoalitionMetals":      "Coalition-licensed metals exchange and trading house. Sets benchmark prices for raw ore across controlled colonial markets. Cascade Minerals is its largest single supplier.",
  "Comet Foods":          "Processed food producer supplying mid-tier colonial markets with cost-optimized nutrition products. Ingredients are legal. Barely.",
  "Comet Packaging":      "Industrial packaging manufacturer producing transport and storage solutions for food and pharmaceutical distribution chains.",
  "Copper Dynamics":      "Electrical engineering manufacturer producing power distribution hardware for colonial infrastructure. Found in most stations whether purchased or salvaged.",
  "Copper Industries":    "Raw materials processor and secondary manufacturer. Smelts ore from three mining operations and sells refined stock to industrial buyers. Baron Corps is the only refining operation they cannot touch.",
  "Copper Insurance":     "Industrial accident underwriter with a strong presence in the Foundry sector. Claims adjusters are armed.",
  "Copper Marine":        "Deep-space freight operator specializing in bulk ore transport between outer mining operations and Cascade Station processing facilities. Slow ships. Full holds.",
  "CorpseSystems":        "Biopreservation and medical cold-storage provider. Operates holding facilities for colonial governments, corporations, and clients who pay for silence.",
  "Crescent Robotics":    "Compact robotics manufacturer producing maintenance droids and autonomous repair systems. Popular with station operators and orbital facility managers.",
  "Crescent Ventures":    "Early-stage investment fund with a portfolio heavy on grey-market logistics and unnamed biotech. Returns are high. Questions are discouraged.",
  "CrimsonChains":        "Security and detention services contractor running Margin Call's collection enforcement operations. Operates privately held facilities in three systems; the Syndicate owns the contracts and does not advertise this.",
  "DarkRobotics":         "Autonomous systems manufacturer specializing in unmanned security and enforcement hardware. Serves government contracts and private clients without distinction.",
  "East Consulting":      "Regional business advisory with offices on Frontier Outpost and Cascade Station. Provides strategic counsel and occasional witness relocation.",
  "East Foods":           "Processed food manufacturer supplying colonies with stabilized rations. Ingredients sourced from multiple suppliers whose origin is not always traceable.",
  "East Retail":          "Consumer goods retailer operating across frontier colonial markets. Prices are low. Supply chain due diligence is lower.",
  "East Ventures":        "Frontier-market venture fund backing early-colony resource extraction. Four of their last seven investments are now Syndicate-controlled.",
  "Evergreen Financial":  "Mid-tier lending institution offering competitive rates to frontier colonies. Collections enforcement is handled by a separate, unlisted subsidiary.",
  "First Minerals":       "Independent mineral extraction operation working contested asteroid belts in the outer system. Insurance premiums are substantial.",
  "First Networks":       "Independent communications provider offering encrypted relay services outside Coalition network monitoring. Client list undisclosed.",
  "First Works":          "General construction and civil works contractor operating across newly settled colonial systems. Bids are competitive. Inspections are infrequent.",
  "Frontier Supplies":    "General goods supplier operating out of Frontier Outpost. Sells to all factions, restocks from all sources, and is the only genuinely neutral party on the map. Lighthouse Logistics handles their Coalition-facing shipments.",
  "GhostFoundry":         "Unregistered hardware fabrication operation producing custom-specification electronics. Operational base unknown. Products appear in Null Point relay installations and Syndicate enforcement hardware alike.",
  "Global Enterprises":   "Diversified conglomerate with holdings across six sectors and twelve colonial systems. Nobody knows everything that Global Enterprises owns, including Global Enterprises.",
  "Global Supplies":      "Bulk commodity goods distributor supplying colonial populations across Coalition and grey-market territories. Asks very few questions about delivery addresses.",
  "Golden Aerospace":     "Aerospace manufacturer producing premium spacecraft and habitat modules for high-end colonial clients. Pricing is aspirational. Waitlists are long.",
  "Golden Insurance":     "Premium personal coverage for high-net-worth colonists and faction officers. Gold card members receive priority evacuation coverage.",
  "Golden Packaging":     "High-security packaging solutions provider serving pharmaceutical and luxury goods clients. Tamper evidence is a feature. For some clients it is not.",
  "GraftBiotech":         "Surgical augmentation firm out of Vein Cluster stations running unlicensed neural and skeletal enhancements. Sources components from BoneMarkets when licensed inventory runs short; it usually runs short.",
  "Granite Aerospace":    "Heavy aerospace constructor building station modules and colony infrastructure for Coalition and independent operators. Built to last. Billed to last.",
  "Granite Realty":       "Colonial land and property development firm operating in rapidly expanding frontier systems. Acquires land before faction control is determined. Times it well.",
  "GraveWorks":           "Biowaste processing and organic reclamation operation anchored to Margin Call's smelter infrastructure. Holds colonial government contracts for end-of-life material recovery; profitable in wartime, more profitable after it.",
  "Green Shipping":       "Environmental-branded logistics firm hauling bio and agricultural cargo. Carries Vein Cluster shipments under agricultural manifests. Ships run clean. Manifests occasionally do not.",
  "GreyMining":           "Unlicensed extraction operation working unclaimed asteroid fields outside Coalition jurisdiction in the contested outer rim. No environmental assessments. No union contracts.",
  "GreywaterLabs":        "Independent research facility studying long-term effects of unlicensed augmentation compounds. Sources test data from GraftBiotech. Findings are published selectively.",
  "Grove Enterprises":    "Diversified holding group with investments across agriculture, logistics, and financial services. Quietly profitable across two decades without attracting attention.",
  "Harbor Enterprises":   "Port-city conglomerate with shipping, real estate, and retail operations centered on colonial hub stations. Fees apply to everything.",
  "Harbor Financial":     "Port-city banking cooperative that has quietly absorbed eight smaller lenders over six years. Profitable, institutional, and very difficult to audit.",
  "Harbor Media":         "Media and communications group producing news, entertainment, and commercial content for colonial markets. Syndicates content to Syndicate-aligned networks.",
  "HollowLogistics":      "Grey-market freight operator based in The Hollow; cargo that cannot use official shipping lanes gets here eventually. Second-largest logistics firm in Syndicate space. SmugglerIndustries disputes this and is probably right.",
  "Horizon Automation":   "Factory automation firm deploying robotic systems into colonial manufacturing facilities. Has displaced labor on eleven planets and is still hiring engineers.",
  "Horizon Retail":       "Consumer retail chain operating standardized stores across colonial hubs. Inventory sourced globally. Staff sourced cheaply.",
  "Liberty Packaging":    "Secure cargo packaging and container solutions provider. Containers come with optional tamper-evident seals. Not all clients use them.",
  "Liberty Ventures":     "Coalition-aligned growth fund investing in infrastructure and tech across settled systems. Branding is optimistic. Reality is mixed.",
  "Lighthouse Logistics": "Licensed freight broker coordinating cargo movement between Frontier Outpost and Coalition inner systems. Acts as neutral ground for multi-faction shipments. Frontier Supplies routes its Coalition-facing orders through them.",
  "Lumen Shipping":       "Scheduled cargo carrier operating between Aurora Prime and New Anchor. Fast, reliable, well-lit ships. Inspected regularly. Passes regularly.",
  "Maple Industries":     "Diversified manufacturer producing agricultural equipment and habitat construction materials for mid-rim colonies. Consistent output. Unexciting stock.",
  "MireInsurance":        "Discount underwriter operating out of Scrub Yard's grey-market territories. Policies are cheap; definitions of covered losses are creative, and the exclusion clauses take longer to read than the policy itself.",
  "Momentum Logistics":   "Neutral logistics operator running freight across contested colonial routes. Accepts cargo from all factions. Makes no guarantees about delivery.",
  "National Foods":       "Mass food production and distribution corporation feeding populations across eight colonial systems. Efficiency is prioritized over quality. Both are low.",
  "National Media":       "Colonial broadcast group controlling news, entertainment, and emergency communications across the Coalition network. Content licensing agreements coincidentally match faction preferences.",
  "National Packaging":   "Industrial packaging manufacturer supplying food, pharmaceutical, and chemical distribution chains. Unremarkable company. Indispensable infrastructure.",
  "National Retail":      "Large-format colonial retail chain present on every major station. Priced for volume. Quality is optional and rarely selected.",
  "Neon Retail":          "Consumer electronics and lifestyle retailer operating in high-traffic colonial markets. Carries Neon Technologies products exclusively at margins Neon Technologies sets.",
  "Neon Technologies":    "Consumer and industrial electronics manufacturer with strong presence in tech-heavy colonial markets. Neon Retail is their captive distribution arm. Telemetry collection is aggressive.",
  "Nexus Aerospace":      "Coalition-licensed spacecraft manufacturer with production facilities in New Anchor. Supplies the largest commercial fleet in the inner colonial system.",
  "Nexus Financial":      "The largest exchange-licensed trading house in the New Anchor system. Manages dividend payouts for fourteen Coalition-aligned colonies.",
  "Nexus Supplies":       "Colonial procurement and supply management firm coordinating bulk purchasing for mid-size corporate clients. Volume discounts. Volume surveillance.",
  "NightFinance":         "After-hours lending desk registered to a Scrub Yard shell address. Clients are Syndicate-adjacent by default; no credit checks, interest compounds weekly, collections are handled informally.",
  "Nimbus Biotech":       "Gene therapy startup with four pending regulatory applications and a Void Collective research grant routed through Null Point. Growing fast. Oversight is catching up slowly.",
  "Nimbus Realty":        "Property development and land title firm operating in newly contested colonial zones. Acquires territory during faction transitions and resells when control stabilizes.",
  "NoirTransport":        "Courier and freight service operating exclusively in low-oversight zones. No tracking. No receipts. No questions.",
  "North Biotech":        "Licensed augmentation manufacturer with Coalition approval across three systems. Prices are high. Anchor Biotech undercuts them in markets where the license is not enforced.",
  "North Consulting":     "Compliance and risk consultancy that writes the regulations colonial companies file against. Well regarded. Deeply conflicted.",
  "North Industries":     "Heavy industrial holding group with production facilities across the Iron Foundries region. Largest employer in its sector. Enforcement arm is a separate subsidiary.",
  "North Motors":         "Vehicle and transport equipment manufacturer specializing in all-terrain colonial transports. Parts availability in the outer rim is unreliable.",
  "Nova Biotech":         "Emerging gene-edit firm founded by former Cascade Pharma researchers following a lab incident that does not appear in any public filing. Products are novel. Safety profiles are limited.",
  "NullSyndicate":        "Void Collective data infrastructure operator running relay networks from Null Point. Coalition regulators have no jurisdiction. Cedar Networks and SmugglerNetworks both route traffic through NullSyndicate relays.",
  "Oak Capital":          "Conservative asset management firm favored by retired enforcement officers. Generates steady returns through infrastructure lending and secured colonial bonds.",
  "Oak Marine":           "Deep-space freight corporation with long-haul routes between outer mining territories and inner colonial processors. Old company. Older ships.",
  "Oak Ventures":         "Diversified portfolio firm with holdings across six sectors; absorbs distressed assets during faction conflicts at significant discounts. Timing is suspiciously precise.",
  "ObsidianShipping":     "Heavy cargo operator based at Margin Call, moving oversized industrial equipment and collateral seizures. Primary carrier for Baron Corps refinery equipment in and out of Gluttonis; ships are slow, cargo always arrives.",
  "OccultMaterials":      "Materials supplier operating in restricted and unregistered commodity markets; sources rare compounds from Dust Basin and Iron Shelf beyond Baron Corps licensing agreements. The Escrow holds their contract ledger. It is not auditable.",
  "OrganCorp":            "Organ logistics and distribution network operating throughout the outer colonies. Downstream from VeinConsortium. Does not ask where inventory comes from. Does not ask where it goes.",
  "Orion Foods":          "Food processing and distribution operation supplying stations across the outer colonial system. Products are stable. Provenance is not always clear.",
  "Orion Logistics":      "Mid-size freight operator covering twelve colonial routes. Licensed, reliable, and used by Syndicate networks for plausible deniability.",
  "Orion Supplies":       "General supply distributor operating across mid-rim colonial routes. Competitive pricing achieved through creative procurement practices.",
  "PhantomCourier":       "High-value package courier service with guaranteed no-trace delivery. No colonial tax stamps. No signature required.",
  "Pioneer Aerospace":    "Mid-tier spacecraft manufacturer producing workhorses for frontier colonial transport. Ships are functional. They are not beautiful.",
  "Pioneer Realty":       "Colonial land development company acquiring and subdividing territory on newly settled planets. Pre-faction-determination acquisition is a specialty.",
  "Pioneer Supplies":     "General goods supplier to frontier colonial settlements operating at the edge of the settled system where shortages are routine and markups are not.",
  "Pixel Biotech":        "Biotech firm developing neural interface hardware and the firmware to run it. The firmware updates automatically. Opt-out is not a feature.",
  "Pixel Dynamics":       "Software and hardware integration firm building embedded systems for colonial infrastructure and consumer markets. Widely deployed. Deeply embedded.",
  "Pixel Software":       "Enterprise software developer supplying governance and logistics management systems to colonial administrations. Several governments depend entirely on their stack.",
  "Prairie Financial":    "Agricultural credit institution that pivoted to colony infrastructure bonds when the crop markets dried up. Reliable, slow, and slightly desperate.",
  "Prime Automation":     "Systems integrator specializing in factory-floor automation for high-throughput industrial operations. Productivity gains are measurable. Job losses are not reported.",
  "Redwood Materials":    "Composite and advanced materials manufacturer supplying aerospace and construction industries across the Coalition system.",
  "Redwood Retail":       "Consumer goods retailer focusing on the mid-tier colonial market. Reliable stock. Predictable pricing. Dull brand. Consistent returns.",
  "River Aerospace":      "Small aerospace engineering firm specializing in custom spacecraft modifications and retrofit projects for private and faction clients. No standard catalog.",
  "River Materials":      "Raw material extraction and processing operation converting asteroid ore into refined industrial stock. Output goes to four downstream manufacturers.",
  "RogueMinerals":        "Freelance mining outfit operating in the disputed extraction zones surrounding Dust Basin and Iron Shelf. Sells to whoever pays without filing manifests. Claims it is independent.",
  "SableSecurity":        "Private security contractor headquartered in Scrub Yard; armed personnel, patrol vessels, enforcement work. No questions, no records, and a rate card that only goes up.",
  "SeverShipping":        "Bulk cargo carrier known for operating in extreme environments and contested territories. Hull integrity is a concern. Rates reflect this.",
  "ShadePharma":          "Unregistered pharmaceutical operation producing controlled compounds for the grey market. Distribution handled through HollowLogistics.",
  "ShadowDynamics":       "Cybersecurity and signals intelligence firm with clients across all three factions. Sells the same product to each side. Has never been audited.",
  "Sierra Aerospace":     "Aerospace manufacturer with contracts across Coalition and contested territories. Product line includes light transports and surveillance platforms.",
  "Sierra Apparel":       "Synthetic clothing and industrial uniform manufacturer supplying corporate and colonial government contracts. Uniform quality. Uniform everything.",
  "Sierra Consulting":    "Operational efficiency firm known for aggressive cost-reduction programs. Labor relations across their client base are uniformly poor.",
  "Sierra Hospitality":   "Mid-range hotel and station accommodation provider catering to colonial transit workers and faction officers. Rooms are monitored. Guests are aware.",
  "Silver Holdings":      "Diversified holding group registered at The Escrow with stakes in mining, transport, and two insurance underwriters. Nobody at Silver Holdings will tell you who owns Silver Holdings.",
  "Silver Motors":        "Compact transport manufacturer popular with mid-tier colonists and Syndicate courier networks for the same reasons: cheap, fast, and no required transponder.",
  "Silver Shipping":      "Budget freight carrier with routes throughout the outer colonies. High volume. Low scrutiny.",
  "Silver Works":         "Precision engineering shop producing custom mechanical components for industrial clients. Small operation. Very precise. Very expensive.",
  "SinisterFoods":        "Food product manufacturer whose branding leans into dark aesthetics for a colonial market that finds this funny. Products are actually edible. Mostly.",
  "Skyline Packaging":    "Commercial packaging solutions provider with contracts across food, pharmaceutical, and industrial supply chains. Structural integrity is guaranteed. Contents are not.",
  "SmugglerIndustries":   "Unlicensed freight and distribution operation openly listed on the Flesh Market despite the name. Operates primarily out of The Hollow. Regulators have attempted prosecution. The paperwork disappeared.",
  "SmugglerMedia":        "Content and distribution operation running outside Coalition licensing from a Scrub Yard relay address. Viewership numbers are unofficially very large; officially it does not exist.",
  "SmugglerNetworks":     "Unlicensed relay and communications network piggybacking on both Coalition and NullSyndicate infrastructure. Technically illegal. Practically essential.",
  "South Consulting":     "Frontier advisory house offering expansion planning for companies moving into grey-market territories. Charging corporate rates for Syndicate work.",
  "South Hardware":       "Industrial tools and fastener distributor with logistics hubs in the outer colonies. Low margin. High volume. Absolutely no one is excited about this stock.",
  "South Industries":     "General manufacturing conglomerate with facilities across four systems. Output ranges from habitat panels to weapons components. All legal. Probably.",
  "South Minerals":       "Regional ore extraction company with licensed operations across four systems. Clean record by industry standards. Standards in this industry are low.",
  "SpecterIndustries":    "Unregistered industrial operation with facilities in non-Coalition space, vault-bonded through The Escrow. Products are not listed publicly; clients are not named.",
  "Summit Automation":    "Automation and systems engineering firm focused on colony life-support infrastructure. Their contracts include a clause prohibiting manual override.",
  "Summit Logistics":     "Corporate freight management firm coordinating multi-carrier supply chains for colonial construction projects. On time. On budget. Rarely both.",
  "Summit Retail":        "Consumer retail operator running mid-size stores across colonial hub stations. Competitive on price. Unremarkable in every other respect.",
  "Sycamore Partners":    "Boutique advisory firm catering to high-net-worth colonists and factional war chest managers. Discretion is guaranteed and priced accordingly.",
  "Sycamore Software":    "Mid-market software house building accounting, compliance, and asset management tools for colonial corporations that prefer not to talk to regulators.",
  "TempestArms":          "Weapons manufacturer and arms distributor with a colonial defense contractor license. Sells to governments and to the people those governments worry about; the license covers one of those and everyone pretends it covers both.",
  "ToxicChains":          "Hazardous material transport operator running Margin Call's industrial byproduct removal. Primary carrier for Baron Corps refinery waste; containment fleet is specialized, insurance premiums reflect this.",
  "UnderNet":             "Data and physical packet relay service operating through Null Point relay infrastructure. Void Collective aligned. Runs on the same physical nodes as NullSyndicate. Transmission logs do not exist.",
  "United Hospitality":   "Hotel and hospitality group operating transit accommodation on colonial stations and hub outposts. Fine print on the rental agreements is very dense.",
  "United Insurance":     "The largest insurance group in the Coalition system. Underwrites colony infrastructure bonds and collects premiums from sixteen planets.",
  "United Technologies":  "Diversified technology group supplying computing, communications, and defense electronics to Coalition and Syndicate clients without disclosing conflicts.",
  "Valley Realty":        "Colonial property development and land registry firm operating in stable inner-system territories. Boring. Reliable. Profitable. Not exciting.",
  "VeinConsortium":       "The dominant bioprocessing cartel in the Vein Cluster. Controls organ supply chains across four colonial systems. BloodWorks and OrganCorp both operate downstream of it.",
  "Vertex Aerospace":     "Large aerospace manufacturer supplying commercial and government spacecraft across multiple systems. Cascade Minerals provides their raw ore stock.",
  "Vertex Dynamics":      "Diversified industrial manufacturer with product lines spanning construction, mining, and automated defense. Frequently cited in faction conflict incident reports.",
  "Vertex Foods":         "Food production and processing arm of the Vertex group supplying bulk nutrition products to colonial labor populations. Caloric. Inexpensive. Intentionally forgettable.",
  "Vertex Logistics":     "Full-service logistics group operating cargo, customs brokerage, and warehousing across twelve colonial systems. Large enough to set its own rules.",
  "Vertex Robotics":      "Autonomous systems manufacturer producing service and security droids for commercial and governmental clients. After-sale behavioral modification is available on request.",
  "Vertex Shipping":      "Bulk freight arm of Vertex Group. Handles high-volume commodity cargo for industrial clients under long-term contracts with non-disclosure provisions.",
  "Vertex Systems":       "Systems integration firm building networked infrastructure for colonial governments. Data is collected. Data is retained.",
  "Vertex Ventures":      "Aggressive expansion fund that identifies undervalued companies after contested colony events. Timing is suspiciously precise.",
  "West Hospitality":     "Budget accommodation and services provider for outer rim transit workers. Rooms are small. Privacy is nonexistent. Rates are competitive.",
  "West Works":           "General construction and maintenance contractor operating on outer rim colonial sites. Shows up. Usually finishes.",
  "Willow Aerospace":     "Boutique aerospace firm building custom ships for private clients. Discrete. Expensive. Questions about intended use are not asked.",
  "Willow Hardware":      "Colonial hardware and construction supply distributor operating mobile supply depots across frontier territories. Inventory is always moving.",
  "Willow Labs":          "Contract research organization conducting clinical trials on behalf of undisclosed pharmaceutical clients. Location: outer rim. Oversight: minimal.",
  "WraithEnergy":         "Fusion plant operator providing power to Void Collective territories and the Aurora Prime grid. The arrangement with Aurora Electric is informal and occasionally tense.",
  "Zenith Automation":    "High-end industrial automation firm with Coalition contracts for habitat construction across three new colony sites. Workforce displacement figures are not published.",
  "Zenith Health":        "Premium healthcare provider operating licensed medical stations in Coalition territory. Excellent outcomes. Prohibitive pricing. No payment plans.",
  "Zenith Insurance":     "High-end reinsurance house that underwrites other insurance companies. When Zenith stops covering a sector, the whole market notices.",
  "Zenith Media":         "Prestige media group producing long-form journalism and documentary content for high-tier colonial audiences. Funded by parties who prefer not to be named.",
  "FLSH Capital":         "The original Flesh Market trading fund. Predates the factions, predates most of the companies listed here, and answers to no regulatory body that has ever been found.",
  "S'weet":               "Lustandia's only export worth dying over. The vintages move through black markets, diplomatic pouches, and dead drops. Buyers do not talk about what they saw. They just buy more.",
  "Baron Corps":          "The barons of Gluttonis do not negotiate. They set the refining quota and the galaxy moves around it. Sixty percent of all rare material processing runs through their orbital rigs. When Baron Corps slows output, freight lanes go quiet within a week.",
};
function renderTickers() {
  const q = el('#search').value.toLowerCase();
  const box = el('#tickers');
  box.innerHTML = '';
  const _view = window._marketView || 'coalition';
  const _rows = TICKERS.filter(t => (_view==='jade' ? !!t.jade : !t.jade) && (!q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)));
  if (_view==='jade' && _rows.length===0) {
    box.innerHTML = '<div style="padding:14px 10px;font-size:.72rem;color:var(--muted);line-height:1.6;opacity:.85">The Jade passage is sealed. The Circuit Exchange opens when the wormhole is unsealed.</div>';
    return;
  }
  _rows.forEach(t => {
      const row = document.createElement('div');
      const isActive = t.symbol === CURRENT;
      row.className = 'ticker' + (isActive ? ' active' : '');
      const pct = t.pct != null ? t.pct : 0;
      const pctColor = pct >= 0 ? '#86ff6a' : '#ff6b6b';
      const pctSign = pct >= 0 ? '+' : '';
      const priceLabel = isActive
        ? `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
            <span class="px" style="font-size:.95rem;font-weight:700;color:#b6ffcf">${fmt(t.price)}</span>
            <span style="font-size:.68rem;color:${pctColor};opacity:.9">${pctSign}${pct.toFixed(2)}%</span>
           </div>`
        : `<div class="px">${fmt(t.price)}</div>`;
      const loreName = t.name.replace(/\d+$/, '').trim();
      const dispName = window.tickerNameZh ? window.tickerNameZh(loreName) : loreName;
      const loreText = t.jade
        ? (window.jadeT ? window.jadeT('desc', loreName, (COMPANY_LORE[loreName]||'')) : (COMPANY_LORE[loreName]||''))
        : ((window._lang==='zh' && window.CO_DESC_ZH && window.CO_DESC_ZH[loreName]) ? window.CO_DESC_ZH[loreName] : (COMPANY_LORE[loreName] || ''));
      row.innerHTML = `<div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:4px">
          <span class="sym">${t.symbol}</span><span style="color:#b6ffcf;opacity:.9"> · ${dispName}</span>
        </div>
        ${isActive && loreText ? `<div style="font-size:.72rem;color:#b6ffcf;line-height:1.55;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.07);padding-bottom:2px;opacity:.96">${loreText}</div>` : ''}
      </div>
      ${priceLabel}`;
      if (isActive) {
        row.style.cssText = 'cursor:pointer;background:rgba(152,255,159,.07);border-color:rgba(152,255,159,.28);padding-right:6px';
      } else {
        row.style.cursor = 'pointer';
      }
      row.onclick = () => {
        const prev = CURRENT;
        el('#sym').value = t.symbol;
        CURRENT = t.symbol;
        _waveBuffer = []; _waveTimes = []; _waveOpenPrice = 0; // reset buffer for new symbol
        sendWS({type:'chart', symbol:t.symbol});
        // Re-render to update active highlight and price badge
        renderTickers();
      };
      box.appendChild(row);
    });
}


// ── Market view (Coalition / Jade Exchange) + Jade UI theme ──
window._marketView = window._marketView || 'coalition';
window.setMarketView = function(v){
  window._marketView = v;
  try {
    var c=document.getElementById('mvCoalition'), j=document.getElementById('mvJade');
    if(c) c.classList.toggle('active', v==='coalition');
    if(j) j.classList.toggle('active', v==='jade');
    var s=document.getElementById('search'); var p=s&&s.closest?s.closest('.panel'):null; var h=p?p.querySelector('h2'):null;
    if(h) h.textContent = (window.t ? window.t(v==='jade'?'panel.jade':'panel.companies', v==='jade'?'Jade Exchange':'Companies') : (v==='jade' ? 'Jade Exchange' : 'Companies'));
  } catch(e){}
  if(typeof renderTickers==='function') renderTickers();
};
// Set the language and reload. A reload rather than a live re-render because
// live switching is only ever partially correct: applyI18n reaches data-i18n
// elements, and re-render hooks reach the panels that have them, but any panel
// already built by a lazily loaded module keeps whatever strings it was built
// with until something happens to rebuild it. The result is a screen that is
// half translated in a way that varies with what the player happened to open
// first. Reloading makes the language a boot-time fact instead of a runtime
// patch, which is the only version that is consistent every time.
//
// The cost is real: a reload drops in-flight client state. Unbanked mining
// cargo is client-held, so it is warned about explicitly below rather than
// quietly discarded.
window.setLanguage = function(lang, opts){
  opts = opts || {};
  var zh = (lang === 'zh');
  if (!opts.skipConfirm && window._fmRunInProgress && window._fmRunInProgress()) {
    var warn = window.t ? window.t('lang.reloadWarn','A run is in progress. Switching language reloads the page and you will lose any cargo you have not banked. Switch anyway?')
                        : 'A run is in progress. Switching language reloads the page and unbanked cargo will be lost. Switch anyway?';
    if (!confirm(warn)) return false;
  }
  try{ localStorage.setItem('fm_jade_theme', zh ? '1' : '0'); }catch(e){}
  if (opts.noReload) {
    document.documentElement.classList.toggle('jade-theme', zh);
    window._lang = zh ? 'zh' : 'en';
    if(window.applyI18n) window.applyI18n();
    if(window.setMarketView) window.setMarketView(window._marketView||'coalition');
    if(window._jadeRerender) window._jadeRerender();
    return true;
  }
  try{ location.reload(); }catch(e){ location.href = location.href; }
  return true;
};

// True when the player has something running that a reload would cost them.
// Kept separate so other callers can reuse it.
window._fmRunInProgress = function(){
  try{
    var host = document.getElementById('miningFullscreenHost');
    if (host && host.style.display !== 'none' && host.childNodes.length) return true;
    if (window._activeSmugRun) return true;
    if (window._activeShipRun) return true;
  }catch(e){}
  return false;
};

window.toggleJadeTheme = function(){
  var on = !document.documentElement.classList.contains('jade-theme');
  window.setLanguage(on ? 'zh' : 'en');
};
// reflect persisted theme on the toggle button once the DOM is ready
try{ document.addEventListener('DOMContentLoaded', function(){ var b=document.getElementById('jadeThemeBtn'); if(b && document.documentElement.classList.contains('jade-theme')) b.classList.add('active'); }); }catch(e){}


// ── Jade translation layer (scoped to the Jade galaxy; toggled by 文/EN) ──
// Centralized so a native reviewer can audit one block. Names/labels/tickers are
// high-confidence term translations; colony lore is a first-pass and wants review.
window._lang = window._lang || 'en';
window.JADE_I18N = {
  name: {
    yujing:"玉京", tiangong:"天宫", shennong_reach:"神农领", houji_fields:"后稷田",
    mozi_array:"墨子阵列", wukong_deep:"悟空深渊", zhenghe_anchorage:"郑和锚地",
    haisi_waystation:"海丝驿站", houtu_foundry:"后土铸造厂", changzheng_yards:"长征船坞",
    xuanwu_bastion:"玄武堡", lingtai_reach:"灵台领", fuxi_observatory:"伏羲观测站",
    quanzhou_docks:"泉州港", zhurong_foundry:"祝融熔炉", chiyou_marches:"蚊尤边陛"
  },
  lore: {
    yujing:"玉环的中枢，星团中延续最久的账簿所在。玉京以先例治理，而非成文律法；所有权与债务沿创立诸族传承，十一代以来未有一宗主张被推翻。超光速通道终止于此，由资本直接掌管。金融与行政主导本地市场。",
    tiangong:"玉环的轨道指挥部，也是维持超光速通道开启的巨构。戴森包层汲取整颗恒星之力以稳定虫洞。穿越班次与门户许可均由此签发。科技与防务主导本站经济。",
    shennong_reach:"生物科技世界，生产玉环的药物与外科移植体。配方为内部持有，从不授权至玉环空域之外。星团内没有第二家供应商。生物科技主导本地市场。",
    houji_fields:"农业世界，向整个星团供应加工食品。密闭水培庄园全年按固定配额运转。产量不足的季度由储备补足，而非进口。制造业主导本地市场。",
    mozi_array:"研究世界，掌握玉环的量子与光学项目，包括超光速通道背后的理论。此处的一切成果既不发表，也不授权。科技主导本地市场。",
    wukong_deep:"深空前哨，从一颗坍缩星中抽取奇异物质。产出直接供给超光速通道，不进入公开市场。能源主导本站经济。",
    zhenghe_anchorage:"贸易与补给枢纽，控制星团的主要航线。航线通行需持牌，而非开放；无照过境视同侵入。物流主导本地市场。",
    haisi_waystation:"位于星团外围贸易线上的驿站。对所有过境货运征收通行费，并按季向郑和锚地上缴固定份额。物流主导本地市场。",
    houtu_foundry:"工业世界，掌握星团的电力生产与金属冶炼。按固定年度指标连续生产。能源与制造业主导本地市场。",
    changzheng_yards:"建造玉环船体的船坞。舰船按内部标准验收，该标准高于公会下限且不对外公布。制造业主导本地市场。",
    xuanwu_bastion:"玉环的军事要塞，据守通道。守军从全星团征调，按固定周期轮换，以免任何单一商号养成私军。它从未向玉环船只开火，也从未放过一艘无照船。保险与防务主导本地市场。",
    lingtai_reach:"长寿与神经诊疗世界。疗程无限期进行，按长期账户计费；入院凭候补名单，而非付款。生物科技主导本地市场。",
    fuxi_observatory:"深场观测站，为导航与市场优势解读虚空。研究结果仅作内部存档，从不公开发表。科技主导本地市场。",
    quanzhou_docks:"星团最繁忙的锚地。所有在玉环空域交易的船体都在此清关，载货单永久留存。泊位优先级由分配决定，不可购买。物流主导本地市场。",
    zhurong_foundry:"次级冶炼世界，处理后土熔炉无法处理的部分。坩埚不间断运转，熔炉冷却属须上报的故障。能源主导本地市场。",
    chiyou_marches:"玉环空域中不受管辖的边缘。没有任何商号持有正式产权，也没有任何商号承认在此经营。无法在交易所了结的玉环生意，在这里了结。灰市主导本地市场。"
  },
  ticker: {
    "Jade Circuit Holdings":"玉环控股", "Yujing Trust":"玉京信托", "Tiangong Bureau":"天宫局",
    "Yuhua Assurance":"玉华保险", "Shennong Biotech":"神农生物", "Bencao Pharma":"本草制药",
    "Lingzhi Labs":"灵芝实验室", "Houji Agri":"后稷农业", "Mozi Quantum":"墨子量子",
    "Zhiguang Optics":"智光光学", "Tianwen Data":"天问数据", "Wukong Deepscan":"悟空深探",
    "Zheng He Lines":"郑和航运", "Baochuan Ports":"宝船港务", "Haisi Logistics":"海丝物流",
    "Silu Transit":"丝路运输", "Houtu Energy":"后土能源", "Changzheng Heavy":"长征重工",
    "Xuantie Metals":"玄铁金属", "Ember Crucible":"余烬熔炉"
  },
  ui: {
    "SYSTEM":"星系", "ENTER":"进入", "Planets":"行星", "POPULATION":"人口", "CONTROL":"控制",
    "JADE CIRCUIT":"玉环", "Jade Circuit":"玉环", "Houses":"商号", "Jade Exchange":"玉环交易所",
    "Coalition":"联盟",
    "passage_open":"通道已开启。玉环市场与阵营归属均已生效。",
    "passage_sealed":"通道封闭。虫洞开启时，玉环交易所与阵营归属方才开放。"
  }
};
window.jadeT = function(kind, key, fallback){
  if(window._lang !== 'zh') return (fallback!==undefined ? fallback : key);
  var m = window.JADE_I18N && window.JADE_I18N[kind];
  var v = m && m[key];
  return (v!=null) ? v : (fallback!==undefined ? fallback : key);
};
// ── Ticker translations (Coalition names + Jade descriptions; language = _lang) ──
// Coalition names composed from a prefix/suffix map for consistency; verified all 184 resolve.
// Coalition ticker DESCRIPTIONS are a later batch (native-review prose).
window.CO_NAME_ZH = {
  "Anchor Biotech":"锚定生物",
  "Anchor International":"锚定国际",
  "Anchor Realty":"锚定地产",
  "Anchor Retail":"锚定零售",
  "ApexContraband":"尖峰走私",
  "AshenTextiles":"灰烬纺织",
  "Aspen Automation":"白杨自动化",
  "Aspen Energy":"白杨能源",
  "Aspen Financial":"白杨金融",
  "Atlas Consulting":"擎天咨询",
  "Atlas Dynamics":"擎天动力",
  "Atlas Energy":"擎天能源",
  "Atlas Realty":"擎天地产",
  "Atlas Supplies":"擎天供应",
  "Atlas Textiles":"擎天纺织",
  "Aurora Electric":"极光电力",
  "Aurora Enterprises":"极光企业",
  "Aurora Metals":"极光金属",
  "Aurora Robotics":"极光机器人",
  "Beacon Consulting":"信标咨询",
  "Beacon Technologies":"信标科技",
  "BlackCapital":"黑金资本",
  "BloodWorks":"血工场",
  "Blue Media":"蔚蓝传媒",
  "Blue Packaging":"蔚蓝包装",
  "Blue Shipping":"蔚蓝航运",
  "BoneMarkets":"骸骨市场",
  "BoneYards":"骸骨场",
  "CarrionFarms":"腐肉农场",
  "Cascade Minerals":"瀑源矿业",
  "Cascade Pharma":"瀑源制药",
  "Catalyst Insurance":"催化保险",
  "Catalyst Packaging":"催化包装",
  "Catalyst Pharma":"催化制药",
  "Cedar Dynamics":"雪松动力",
  "Cedar Insurance":"雪松保险",
  "Cedar Networks":"雪松网络",
  "CipherHoldings":"密文控股",
  "CoalitionMetals":"联盟金属",
  "Comet Foods":"彗星食品",
  "Comet Packaging":"彗星包装",
  "Copper Dynamics":"赤铜动力",
  "Copper Industries":"赤铜工业",
  "Copper Insurance":"赤铜保险",
  "Copper Marine":"赤铜海事",
  "CorpseSystems":"尸骸系统",
  "Crescent Robotics":"新月机器人",
  "Crescent Ventures":"新月创投",
  "CrimsonChains":"绯红锁链",
  "DarkRobotics":"暗黑机器人",
  "East Consulting":"东方咨询",
  "East Foods":"东方食品",
  "East Retail":"东方零售",
  "East Ventures":"东方创投",
  "Evergreen Financial":"常青金融",
  "First Minerals":"第一矿业",
  "First Networks":"第一网络",
  "First Works":"第一工场",
  "Frontier Supplies":"边疆供应",
  "GhostFoundry":"幽灵铸造",
  "Global Enterprises":"环球企业",
  "Global Supplies":"环球供应",
  "Golden Aerospace":"金色航天",
  "Golden Insurance":"金色保险",
  "Golden Packaging":"金色包装",
  "GraftBiotech":"移植生物",
  "Granite Aerospace":"花岗航天",
  "Granite Realty":"花岗地产",
  "GraveWorks":"墓场工场",
  "Green Shipping":"翠绿航运",
  "GreyMining":"灰色矿业",
  "GreywaterLabs":"灰水实验室",
  "Grove Enterprises":"林苑企业",
  "Harbor Enterprises":"港湾企业",
  "Harbor Financial":"港湾金融",
  "Harbor Media":"港湾传媒",
  "HollowLogistics":"空壳物流",
  "Horizon Automation":"天际自动化",
  "Horizon Retail":"天际零售",
  "Liberty Packaging":"自由包装",
  "Liberty Ventures":"自由创投",
  "Lighthouse Logistics":"灯塔物流",
  "Lumen Shipping":"流明航运",
  "Maple Industries":"枫叶工业",
  "MireInsurance":"泥沼保险",
  "Momentum Logistics":"动量物流",
  "National Foods":"国家食品",
  "National Media":"国家传媒",
  "National Packaging":"国家包装",
  "National Retail":"国家零售",
  "Neon Retail":"霓虹零售",
  "Neon Technologies":"霓虹科技",
  "Nexus Aerospace":"枢纽航天",
  "Nexus Financial":"枢纽金融",
  "Nexus Supplies":"枢纽供应",
  "NightFinance":"暗夜金融",
  "Nimbus Biotech":"云端生物",
  "Nimbus Realty":"云端地产",
  "NoirTransport":"玄色运输",
  "North Biotech":"北方生物",
  "North Consulting":"北方咨询",
  "North Industries":"北方工业",
  "North Motors":"北方汽车",
  "Nova Biotech":"新星生物",
  "NullSyndicate":"虚空财团",
  "Oak Capital":"橡树资本",
  "Oak Marine":"橡树海事",
  "Oak Ventures":"橡树创投",
  "ObsidianShipping":"黑曜航运",
  "OccultMaterials":"秘术材料",
  "OrganCorp":"器官集团",
  "Orion Foods":"猎户食品",
  "Orion Logistics":"猎户物流",
  "Orion Supplies":"猎户供应",
  "PhantomCourier":"幻影快递",
  "Pioneer Aerospace":"拓荒航天",
  "Pioneer Realty":"拓荒地产",
  "Pioneer Supplies":"拓荒供应",
  "Pixel Biotech":"像素生物",
  "Pixel Dynamics":"像素动力",
  "Pixel Software":"像素软件",
  "Prairie Financial":"草原金融",
  "Prime Automation":"至臻自动化",
  "Redwood Materials":"红杉材料",
  "Redwood Retail":"红杉零售",
  "River Aerospace":"江河航天",
  "River Materials":"江河材料",
  "RogueMinerals":"游荡矿业",
  "SableSecurity":"黑貂安保",
  "SeverShipping":"断链航运",
  "ShadePharma":"阴影制药",
  "ShadowDynamics":"暗影动力",
  "Sierra Aerospace":"山脉航天",
  "Sierra Apparel":"山脉服装",
  "Sierra Consulting":"山脉咨询",
  "Sierra Hospitality":"山脉酒店",
  "Silver Holdings":"白银控股",
  "Silver Motors":"白银汽车",
  "Silver Shipping":"白银航运",
  "Silver Works":"白银工场",
  "SinisterFoods":"阴恶食品",
  "Skyline Packaging":"天幕包装",
  "SmugglerIndustries":"走私工业",
  "SmugglerMedia":"走私传媒",
  "SmugglerNetworks":"走私网络",
  "South Consulting":"南方咨询",
  "South Hardware":"南方五金",
  "South Industries":"南方工业",
  "South Minerals":"南方矿业",
  "SpecterIndustries":"幽魂工业",
  "Summit Automation":"巅峰自动化",
  "Summit Logistics":"巅峰物流",
  "Summit Retail":"巅峰零售",
  "Sycamore Partners":"梧桐合伙",
  "Sycamore Software":"梧桐软件",
  "TempestArms":"风暴军械",
  "ToxicChains":"剧毒锁链",
  "UnderNet":"地下网络",
  "United Hospitality":"联合酒店",
  "United Insurance":"联合保险",
  "United Technologies":"联合科技",
  "Valley Realty":"山谷地产",
  "VeinConsortium":"血脉财团",
  "Vertex Aerospace":"顶点航天",
  "Vertex Dynamics":"顶点动力",
  "Vertex Foods":"顶点食品",
  "Vertex Logistics":"顶点物流",
  "Vertex Robotics":"顶点机器人",
  "Vertex Shipping":"顶点航运",
  "Vertex Systems":"顶点系统",
  "Vertex Ventures":"顶点创投",
  "West Hospitality":"西方酒店",
  "West Works":"西方工场",
  "Willow Aerospace":"垂柳航天",
  "Willow Hardware":"垂柳五金",
  "Willow Labs":"垂柳实验室",
  "WraithEnergy":"亡魂能源",
  "Zenith Automation":"天顶自动化",
  "Zenith Health":"天顶健康",
  "Zenith Insurance":"天顶保险",
  "Zenith Media":"天顶传媒"
};
window.JADE_I18N.desc = {
  "Jade Circuit Holdings":"玉环的中央控股公司。持有其余每家玉环商号的控股权，且不编制合并报表。",
  "Yujing Trust":"经营玉环资本的私人银行。账户为无限期开立，转手时亦不结清。",
  "Tiangong Bureau":"运营虫洞门户，为每一次穿越发放许可。定通行费，存载货单，不向任何殖民地负责。",
  "Yuhua Assurance":"为玉环的人身与货物承保。保费由内部厘定，不向玉环以外的买方报价。",
  "Shennong Biotech":"玉环的医疗部门。供应星团的药物与移植体，没有持牌竞争者。",
  "Bencao Pharma":"以从未申报外部审批的配方调制专有药物。价格由商号定，而非市场。",
  "Lingzhi Labs":"按订单培育工程组织与培养器官。产出按候补名单分配，不接受竞价。",
  "Houji Agri":"以密闭水培庄园供养星团。按固定配额生产，不随需求调整。",
  "Mozi Quantum":"建造玉环的量子处理器。设计为内部持有，绝不外售出玉环空域。",
  "Zhiguang Optics":"制造覆盖星团的传感器与镜头。每台出厂皆带一个商号留存的序列号。",
  "Tianwen Data":"存储玉环的档案，并解读深场以获取优势。研究结果只作存档，从不发表。",
  "Wukong Deepscan":"勘测星团边缘的坍缩星与奇异物质。产出内部消耗，不进入公开市场。",
  "Zheng He Lines":"玉环的旗舰承运方。承运公会不碰的货物，并记录每一笔托运。",
  "Baochuan Ports":"运营泉州港。泊位优先级由商号分配，不可购买。",
  "Haisi Logistics":"经营玉环贸易线上的各处驿站。每艘过境船体均予记录，记录不予清除。",
  "Silu Transit":"承运玉环不在交易所入账的货物。无商号认领，各商号皆用。",
  "Houtu Energy":"以后土熔炉为星团供电。产出按年度指标设定，不随需求变动。",
  "Changzheng Heavy":"建造玉环的船体与重型机械。船坞配额于年初核定，年内不作修改。",
  "Xuantie Metals":"冶炼玉环囤积的稀有合金。品级依内部标准认证。",
  "Ember Crucible":"在祝融坩埚精炼燃料与反应堆物质。熔炉不得冷却。"
};

window.CO_DESC_ZH = {
  "Anchor Biotech":"锚定集团旗下的制药子公司，为边疆殖民地生产获批的增强化合物。北方生物持有联盟的批准；在无人核查批准的市场，锚定生物则低价抢单。",
  "Anchor International":"区域银行商号，放贷业务遍及七个殖民市场。逾期即收回整片定居点，这并非最后手段，而是经营模式。",
  "Anchor Realty":"在争议殖民区经营的地产估值与地契经纪。他们的评估员一到，价格往往骤跌。",
  "Anchor Retail":"以锚定品牌在内圈殖民空间站经营的消费品连锁。库存可靠，定价可预期，毫无个性。",
  "ApexContraband":"经灰市渠道流转未分类货物的分销商，由托管所背书。已上市。已审计。两道程序都不怎么令人信服。",
  "AshenTextiles":"合成纤维制造商，为采矿与危险品作业生产工业级材料。劳资纠纷频发，人员流动更甚。",
  "Aspen Automation":"工业机器人公司，向外圈殖民地供应采矿与货运自动化系统。维护合约为强制项，定价亦然。",
  "Aspen Energy":"中层能源生产商，为边疆殖民电网供应聚变电力。与擎天能源争夺同批政府合约，落败的次数比其财报承认的更多。",
  "Aspen Financial":"面向中缘定居点的殖民信贷与按揭提供商。止赎程序是其最活跃的业务部门。",
  "Atlas Consulting":"嵌入殖民治理合约的管理咨询商；重组与人力优化是其产品。二者通常是一回事。",
  "Atlas Dynamics":"重型工业设备制造商，合约遍及四个殖民系统；耐用是卖点，而备件的定价则用来最大化另一样东西。",
  "Atlas Energy":"殖民能源基础设施运营商，管理多个系统的电网。持有与六个行星政府的独家供应合约。亡魂能源承接擎天不愿沾手的地界。",
  "Atlas Realty":"在联盟阵营殖民系统经营的地产开发与土地估值公司。政治关系深厚，结构稳健。",
  "Atlas Supplies":"通用工业供应分销商，在六个空间站设有仓库。从紧固件到聚变部件一应俱全。",
  "Atlas Textiles":"合成材料与纺织制造商，向内圈殖民地的工业与消费市场供货。产出不歇。质量如一。",
  "Aurora Electric":"高容量发电与配电公司，在极光主星运营聚变电厂。内圈殖民系统最大的能源供应商。亡魂能源掌握极光电力够不到的部分。",
  "Aurora Enterprises":"多元化控股集团，在极光主星系统涉足能源、物流与传媒。公开上市。私下掌控。",
  "Aurora Metals":"以尘盆为基地的稀有金属开采与精炼作业，向已定居系统的航天与电子制造商供货。虽同名，却与极光主星的能源公司毫无关联。矿石品级是严守的商业机密。",
  "Aurora Robotics":"研发型机器人公司，在联盟与私营的联合合约下打造新一代自主系统。多项应用属机密。",
  "Beacon Consulting":"为中型企业在各阵营领地间穿行监管框架提供协助的公司顾问。也协助他们绕开这些框架。",
  "Beacon Technologies":"通信硬件与网络基础设施公司，持有联盟的殖民中继安装合约。其硬件出现的地方比合约写明的更多。",
  "BlackCapital":"以荒场为据点的未注册投资基金，同时游走于四个监管辖区之下；彼此互不知情。收购悄然完成。无人发问，因为无人想要答案。",
  "BloodWorks":"血浆采集与加工作业，站点遍布血脉星团。是血脉财团及数家不愿与其并列的分销商的上游供应商。",
  "Blue Media":"殖民娱乐与新闻内容制作商，发行覆盖六个系统。内容对联盟友好。编辑独立性只存在于理论。",
  "Blue Packaging":"特种包装制造商，为药品与高价值货物生产安全运输容器。内容物与他们无关。",
  "Blue Shipping":"中层货运承运商，运营内圈殖民地之间的定期货运航线。准点率平平。报关则有所取舍。",
  "BoneMarkets":"二手骨骼部件经纪，货源来自骸骨场及数家血脉星团中间商。入库货品的认证状态鲜有核实。",
  "BoneYards":"以追缴站工业层为据点的退役增强体回收公司。从亡故殖民者身上取回植入物，稍加翻修后转售；骸骨市场的主要供应商。",
  "CarrionFarms":"蛋白基质生产设施，为药品与食品用途培育组织培养物。与数家血脉星团生物科技公司共用加工设施。归于生物科技类。也大可归入杂项。",
  "Cascade Minerals":"在瀑源站系统三颗潮汐锁定卫星上作业的采矿集团。原料产出供给顶点航天与联盟金属。掌控着维系二者运转的矿石流。",
  "Cascade Pharma":"研究级药品制造商，在联盟临床试验许可下生产化合物。数名研究员其后离职组建了新星生物，起因是一桩未见于任何公开文件的事故。",
  "Catalyst Insurance":"中层风险承保商，承保殖民基础设施与货物。理赔可靠，只要损失能被记录在案。",
  "Catalyst Packaging":"药品级包装制造商，为持牌药物分销生产防拆封容器。也生产不防拆封的容器。",
  "Catalyst Pharma":"仿制药制造商，供应边疆医疗前哨。生产设施在外圈殖民地按宽松的检查规程运作。",
  "Cedar Dynamics":"中型机械工程公司，为居住舱建造与采矿基础设施生产压力系统与结构部件。",
  "Cedar Insurance":"面向高风险制造客户的精品责任险商。免责条款长达四十页。",
  "Cedar Networks":"数据网络公司，在中缘殖民系统建设通信基础设施。数个中继节点未经披露地取道虚点。虚空财团收取的通行费，雪松网络并未列入其运营成本。",
  "CipherHoldings":"空壳公司的控股公司，实际所有权可追溯至另外三家空壳公司。辛迪加借它洗白资金，主要出自空洞。",
  "CoalitionMetals":"联盟持牌的金属交易所与交易商号。为受控殖民市场的原矿设定基准价。瀑源矿业是其最大的单一供应商。",
  "Comet Foods":"加工食品生产商，向中层殖民市场供应成本优化的营养产品。配料合法。勉强。",
  "Comet Packaging":"工业包装制造商，为食品与药品分销链生产运输与仓储方案。",
  "Copper Dynamics":"电气工程制造商，为殖民基础设施生产配电硬件。无论是购入还是回收所得，多数空间站都能见到。",
  "Copper Industries":"原材料加工与二级制造商。冶炼来自三处采矿作业的矿石，向工业买家出售精炼货。男爵集团是其唯一动不了的精炼作业。",
  "Copper Insurance":"工业事故承保商，在铸造板块势力雄厚。理赔员配枪。",
  "Copper Marine":"深空货运运营商，专营外圈采矿作业与瀑源站加工设施之间的散装矿石运输。船慢。舱满。",
  "CorpseSystems":"生物保存与医疗冷藏提供商。为殖民政府、企业，以及花钱买沉默的客户运营存放设施。",
  "Crescent Robotics":"紧凑型机器人制造商，生产维护机器人与自主维修系统。深受空间站运营方与轨道设施管理者欢迎。",
  "Crescent Ventures":"早期投资基金，投资组合偏重灰市物流与不具名的生物科技。回报很高。发问则不受欢迎。",
  "CrimsonChains":"安保与羁押服务承包商，经营追缴站的催收执法业务。在三个系统运营私有设施；辛迪加持有这些合约，且不予声张。",
  "DarkRobotics":"自主系统制造商，专营无人安保与执法硬件。承接政府合约与私人客户，一视同仁。",
  "East Consulting":"区域商业顾问，在边疆前哨与瀑源站设有办事处。提供战略咨询，偶尔也安排证人转移。",
  "East Foods":"加工食品制造商，向殖民地供应稳定化口粮。配料来自多家供应商，来源并不总是可追溯。",
  "East Retail":"在边疆殖民市场经营的消费品零售商。价格低。供应链尽职调查更低。",
  "East Ventures":"边疆市场创投基金，支持早期殖民地的资源开采。其最近七笔投资中，已有四笔归辛迪加掌控。",
  "Evergreen Financial":"中层放贷机构，向边疆殖民地提供有竞争力的利率。催收执法由一家独立、未上市的子公司处理。",
  "First Minerals":"独立矿物开采作业，在外系争议小行星带作业。保险费高昂。",
  "First Networks":"独立通信提供商，提供联盟网络监控之外的加密中继服务。客户名单不予披露。",
  "First Works":"通用建筑与土木工程承包商，在新定居的殖民系统作业。投标有竞争力。检查不常有。",
  "Frontier Supplies":"以边疆前哨为据点的通用货物供应商。向所有阵营出售，从所有来源补货，是这张图上唯一真正中立的一方。灯塔物流处理其面向联盟的货运。",
  "GhostFoundry":"未注册的硬件制造作业，生产定制规格电子件。运营基地不明。其产品在虚点中继设施与辛迪加执法硬件中同时出现。",
  "Global Enterprises":"多元化集团，控股遍及六个板块与十二个殖民系统。没人清楚环球企业究竟拥有什么，包括环球企业自己。",
  "Global Supplies":"散装大宗商品分销商，向联盟与灰市地界的殖民人口供货。对送货地址问得极少。",
  "Golden Aerospace":"航天制造商，为高端殖民客户生产高级飞船与居住舱模块。定价高不可攀。候补名单很长。",
  "Golden Insurance":"为高净值殖民者与阵营要员提供的高端个人保险。金卡会员享有优先撤离保障。",
  "Golden Packaging":"高安全性包装方案提供商，服务药品与奢侈品客户。防拆封是一项功能。对某些客户则不是。",
  "GraftBiotech":"血脉星团站点的外科增强公司，进行未获许可的神经与骨骼强化。持牌库存不足时便从骸骨市场取件；而库存通常不足。",
  "Granite Aerospace":"重型航天建造商，为联盟与独立运营方建造站体模块与殖民基础设施。经久耐用。收费亦然。",
  "Granite Realty":"殖民土地与地产开发公司，在急速扩张的边疆系统作业。在阵营归属确定之前收购土地。时机拿捏得当。",
  "GraveWorks":"生物废料处理与有机物回收作业，依附于追缴站的冶炼设施。持有殖民政府的临终物料回收合约；战时有利可图，战后更甚。",
  "Green Shipping":"打环保旗号的物流公司，承运生物与农业货物。以农业货单运送血脉星团的货物。船跑得干净。货单偶尔不然。",
  "GreyMining":"未获许可的开采作业，在争议外缘、联盟辖区之外的无主小行星带作业。无环境评估。无工会合约。",
  "GreywaterLabs":"独立研究设施，研究未获许可的增强化合物的长期影响。测试数据取自移植生物。研究成果择要发布。",
  "Grove Enterprises":"多元化控股集团，投资涉及农业、物流与金融服务。二十年间悄然盈利，从不惹人注目。",
  "Harbor Enterprises":"港城集团，航运、地产与零售业务集中于殖民枢纽站。凡事皆收费。",
  "Harbor Financial":"港城银行合作社，六年间悄然吞并了八家较小的放贷方。有利可图，体制稳固，且极难审计。",
  "Harbor Media":"传媒与通信集团，为殖民市场制作新闻、娱乐与商业内容。将内容联合发布给辛迪加阵营的网络。",
  "HollowLogistics":"以空洞为据点的灰市货运运营商；无法走官方航道的货物，最终都会到这里。辛迪加空域第二大物流公司。走私工业对此有异议，而它多半是对的。",
  "Horizon Automation":"工厂自动化公司，向殖民制造设施部署机器人系统。已在十一颗行星上取代了劳工，且仍在招聘工程师。",
  "Horizon Retail":"消费零售连锁，在殖民枢纽经营标准化门店。库存全球采购。员工廉价采购。",
  "Liberty Packaging":"安全货运包装与容器方案提供商。容器附带可选的防拆封封条。并非所有客户都使用。",
  "Liberty Ventures":"联盟阵营的成长基金，投资已定居系统的基础设施与科技。品牌乐观。现实参半。",
  "Lighthouse Logistics":"持牌货运经纪，协调边疆前哨与联盟内圈系统之间的货物运输。充当多阵营货运的中立地带。边疆供应将其面向联盟的订单交由它处理。",
  "Lumen Shipping":"运营极光主星与新锚定之间的定期货运承运商。船只快捷、可靠、灯火通明。定期受检。定期通过。",
  "Maple Industries":"多元化制造商，为中缘殖民地生产农业设备与居住舱建材。产出稳定。股票乏味。",
  "MireInsurance":"以荒场灰市地界为据点的折扣承保商。保单便宜；承保损失的定义颇具创意，免责条款读起来比保单本身还费时。",
  "Momentum Logistics":"中立物流运营商，在争议殖民航线上运送货物。接受所有阵营的货物。不对送达作任何保证。",
  "National Foods":"大规模食品生产与分销公司，供养八个殖民系统的人口。效率优先于质量。两者都低。",
  "National Media":"殖民广播集团，掌控联盟网络的新闻、娱乐与应急通信。内容授权协议恰好与阵营偏好一致。",
  "National Packaging":"工业包装制造商，为食品、药品与化工分销链供货。公司平平无奇。基础设施不可或缺。",
  "National Retail":"大卖场式殖民零售连锁，遍布每一座主要空间站。为走量而定价。质量可选，且鲜有选用。",
  "Neon Retail":"消费电子与生活方式零售商，在人流密集的殖民市场经营。独家销售霓虹科技的产品，利润率由霓虹科技设定。",
  "Neon Technologies":"消费与工业电子制造商，在科技密集的殖民市场势力强劲。霓虹零售是其专属分销部门。遥测数据采集颇为激进。",
  "Nexus Aerospace":"联盟持牌飞船制造商，生产设施设于新锚定。为内圈殖民系统供应最大的商业船队。",
  "Nexus Financial":"新锚定系统最大的持牌交易商号。为十四个联盟阵营殖民地管理分红派发。",
  "Nexus Supplies":"殖民采购与供应管理公司，为中型企业客户协调批量采购。批量折扣。批量监控。",
  "NightFinance":"登记于荒场空壳地址的夜间放贷台。客户默认与辛迪加沾亲带故；不查征信，利息按周复计，催收私下处理。",
  "Nimbus Biotech":"基因疗法初创，有四项待审监管申请，以及一笔经虚点周转的虚空集体研究拨款。增长迅猛。监管正缓慢追赶。",
  "Nimbus Realty":"地产开发与地契公司，在新近陷入争议的殖民区作业。在阵营更替期间收购地界，待控制权稳定后转售。",
  "NoirTransport":"只在低监管区运营的快递与货运服务。无追踪。无收据。无盘问。",
  "North Biotech":"持牌增强体制造商，在三个系统持有联盟批准。价格高。在不强制执行牌照的市场，锚定生物则低价抢单。",
  "North Consulting":"合规与风险咨询公司，殖民企业据以报备的法规正是它撰写的。声誉良好。利益冲突深重。",
  "North Industries":"重型工业控股集团，生产设施遍及铁铸区。所在板块最大的雇主。执法部门是一家独立子公司。",
  "North Motors":"车辆与运输设备制造商，专营全地形殖民运输车。外缘的备件供应并不可靠。",
  "Nova Biotech":"新兴基因编辑公司，由瀑源制药的前研究员在一桩未见于任何公开文件的实验室事故后创立。产品新颖。安全数据有限。",
  "NullSyndicate":"虚空集体的数据基础设施运营商，从虚点运营中继网络。联盟监管无从管辖。雪松网络与走私网络均取道虚空财团的中继。",
  "Oak Capital":"作风保守的资产管理公司，深受退役执法人员青睐。通过基础设施放贷与有担保的殖民债券产生稳定回报。",
  "Oak Marine":"深空货运公司，经营外圈采矿地界与内圈殖民加工方之间的长途航线。公司老。船更老。",
  "Oak Ventures":"多元化投资组合公司，控股遍及六个板块；在阵营冲突期间以大幅折扣吸纳不良资产。时机精准得可疑。",
  "ObsidianShipping":"以追缴站为据点的重货运营商，运送超大工业设备与抵押扣押物。是男爵集团精炼设备进出贪食星的主要承运方；船慢，货必达。",
  "OccultMaterials":"在受限与未注册商品市场作业的材料供应商；越过男爵集团的牌照协议，从尘盆与铁架采购稀有化合物。托管所保管其合约账簿。无法审计。",
  "OrganCorp":"遍布外圈殖民地的器官物流与分销网络。血脉财团的下游。不问库存从何而来。不问去往何处。",
  "Orion Foods":"食品加工与分销作业，向外圈殖民系统的空间站供货。产品稳定。来源并不总是清楚。",
  "Orion Logistics":"覆盖十二条殖民航线的中型货运运营商。持牌、可靠，被辛迪加网络用作合理推诿的幌子。",
  "Orion Supplies":"通用供应分销商，在中缘殖民航线上作业。有竞争力的定价靠的是颇具创意的采购手法。",
  "PhantomCourier":"高价值包裹快递服务，保证无痕递送。无殖民税印。无需签收。",
  "Pioneer Aerospace":"中层飞船制造商，为边疆殖民运输生产主力机型。船只实用。谈不上好看。",
  "Pioneer Realty":"殖民土地开发公司，在新定居行星上收购并细分地界。专精于阵营归属确定前的收购。",
  "Pioneer Supplies":"面向边疆殖民定居点的通用货物供应商，在已定居系统的边缘作业，那里短缺是常态，而加价不是。",
  "Pixel Biotech":"研发神经接口硬件及其运行固件的生物科技公司。固件自动更新。退出不是一项功能。",
  "Pixel Dynamics":"软硬件集成公司，为殖民基础设施与消费市场打造嵌入式系统。部署广泛。嵌入极深。",
  "Pixel Software":"企业软件开发商，向殖民行政机构供应治理与物流管理系统。数个政府完全依赖其技术栈。",
  "Prairie Financial":"农业信贷机构，在作物市场枯竭后转向殖民基础设施债券。可靠、迟缓，且略带绝望。",
  "Prime Automation":"系统集成商，专精于高通量工业作业的车间自动化。生产率提升可衡量。岗位流失则不予上报。",
  "Redwood Materials":"复合与先进材料制造商，向联盟系统各地的航天与建筑业供货。",
  "Redwood Retail":"面向中层殖民市场的消费品零售商。库存可靠。定价可预期。品牌乏味。回报稳定。",
  "River Aerospace":"小型航天工程公司，专精于为私人与阵营客户定制飞船改装与翻新项目。没有标准目录。",
  "River Materials":"原材料开采与加工作业，将小行星矿石转化为精炼工业货。产出供给四家下游制造商。",
  "RogueMinerals":"自由采矿队，在尘盆与铁架周边的争议开采区作业。谁付钱就卖给谁，从不报关。自称独立。",
  "SableSecurity":"总部设于荒场的私人安保承包商；持械人员、巡逻舰艇、执法业务。不发问，不留档，价目表只涨不跌。",
  "SeverShipping":"以在极端环境与争议地界作业著称的散货承运商。船体完整性堪忧。运价体现了这一点。",
  "ShadePharma":"未注册的药品作业，为灰市生产受控化合物。分销经空壳物流处理。",
  "ShadowDynamics":"网络安全与信号情报公司，客户遍及三大阵营。向各方出售同一产品。从未接受审计。",
  "Sierra Aerospace":"航天制造商，合约遍及联盟与争议地界。产品线包括轻型运输机与侦察平台。",
  "Sierra Apparel":"合成服装与工业制服制造商，承接企业与殖民政府合约。制服划一。一切划一。",
  "Sierra Consulting":"运营效率公司，以激进的降本方案闻名。其客户群的劳资关系无一例外地糟糕。",
  "Sierra Hospitality":"中档酒店与站内住宿提供商，接待殖民过境工人与阵营要员。房间受监控。住客心知肚明。",
  "Silver Holdings":"在托管所注册的多元化控股集团，持有采矿、运输与两家保险承保商的股份。白银控股无人会告诉你白银控股归谁所有。",
  "Silver Motors":"紧凑型运输车制造商，深受中层殖民者与辛迪加快递网络青睐，原因相同：便宜、快、无需应答机。",
  "Silver Shipping":"廉价货运承运商，航线遍布外圈殖民地。走量。少查。",
  "Silver Works":"精密工程作坊，为工业客户生产定制机械部件。规模小。极精密。极昂贵。",
  "SinisterFoods":"食品制造商，其品牌为一个觉得这很有趣的殖民市场刻意走暗黑风。产品其实可以食用。大体上。",
  "Skyline Packaging":"商用包装方案提供商，合约遍及食品、药品与工业供应链。结构完整性有保证。内容物则没有。",
  "SmugglerIndustries":"尽管名号如此，却公开挂牌于血肉市场的未持牌货运与分销作业。主要以空洞为据点。监管方曾试图起诉。文件不翼而飞。",
  "SmugglerMedia":"从荒场中继地址运营、游离于联盟牌照之外的内容与分销作业。收视人数非官方地极为庞大；官方上它并不存在。",
  "SmugglerNetworks":"未持牌的中继与通信网络，同时搭载于联盟与虚空财团的基础设施之上。技术上违法。实际上不可或缺。",
  "South Consulting":"边疆顾问商号，为进军灰市地界的企业提供扩张规划。为辛迪加的活儿开出企业级的价。",
  "South Hardware":"工业工具与紧固件分销商，在外圈殖民地设有物流枢纽。低毛利。高走量。绝无一人对这只股票感到兴奋。",
  "South Industries":"通用制造集团，设施遍及四个系统。产出从居住舱面板到武器部件不等。皆合法。大概。",
  "South Minerals":"区域矿石开采公司，在四个系统持牌作业。按行业标准记录清白。而这行业的标准很低。",
  "SpecterIndustries":"在非联盟空域设有设施的未注册工业作业，经托管所金库背书。产品不公开挂牌；客户不予具名。",
  "Summit Automation":"自动化与系统工程公司，专注于殖民地生命维持基础设施。其合约含有一条禁止手动接管的条款。",
  "Summit Logistics":"企业货运管理公司，为殖民建设项目协调多承运方供应链。准时。不超预算。二者鲜能兼得。",
  "Summit Retail":"消费零售运营商，在殖民枢纽站经营中型门店。价格有竞争力。其余各方面平平无奇。",
  "Sycamore Partners":"精品顾问商号，服务高净值殖民者与阵营战争金库的管理者。保密有保证，定价亦然。",
  "Sycamore Software":"中端市场软件商号，为不愿与监管方打交道的殖民企业打造会计、合规与资产管理工具。",
  "TempestArms":"持有殖民防务承包商牌照的武器制造与军械分销商。既卖给政府，也卖给这些政府所忌惮的人；牌照覆盖其中一方，而所有人都假装它覆盖双方。",
  "ToxicChains":"危险物料运输运营商，经营追缴站的工业副产品清除。是男爵集团精炼废料的主要承运方；封存船队为专用配置，保险费体现了这一点。",
  "UnderNet":"经虚点中继基础设施运营的数据与实体包中继服务。虚空集体阵营。与虚空财团运行于同一批物理节点之上。传输日志并不存在。",
  "United Hospitality":"酒店与酒店集团，在殖民空间站与枢纽前哨经营过境住宿。租赁协议的细则密密麻麻。",
  "United Insurance":"联盟系统最大的保险集团。承保殖民基础设施债券，向十六颗行星收取保费。",
  "United Technologies":"多元化科技集团，向联盟与辛迪加客户供应计算、通信与防务电子，且不披露利益冲突。",
  "Valley Realty":"殖民地产开发与土地登记公司，在稳定的内系地界作业。无趣。可靠。有利可图。谈不上刺激。",
  "VeinConsortium":"血脉星团中占主导地位的生物加工卡特尔。掌控四个殖民系统的器官供应链。血工场与器官集团皆在其下游运营。",
  "Vertex Aerospace":"大型航天制造商，向多个系统供应商用与政府飞船。瀑源矿业为其提供原矿货源。",
  "Vertex Dynamics":"多元化工业制造商，产品线横跨建筑、采矿与自动防务。频频出现于阵营冲突事故报告中。",
  "Vertex Foods":"顶点集团的食品生产与加工部门，向殖民劳工人口供应散装营养品。热量高。价廉。刻意令人过目即忘。",
  "Vertex Logistics":"全方位物流集团，在十二个殖民系统经营货运、报关经纪与仓储。大到足以自定规则。",
  "Vertex Robotics":"自主系统制造商，为商业与政府客户生产服务与安保机器人。售后行为改装可按需提供。",
  "Vertex Shipping":"顶点集团的散货部门。在含保密条款的长期合约下，为工业客户处理大宗商品货运。",
  "Vertex Systems":"系统集成公司，为殖民政府建设联网基础设施。数据被采集。数据被留存。",
  "Vertex Ventures":"激进的扩张基金，在争议殖民事件后识别被低估的公司。时机精准得可疑。",
  "West Hospitality":"为外缘过境工人提供的廉价住宿与服务。房间小。毫无隐私。价格有竞争力。",
  "West Works":"通用建筑与维护承包商，在外缘殖民地作业。会到场。通常能完工。",
  "Willow Aerospace":"为私人客户建造定制飞船的精品航天公司。低调。昂贵。用途问题概不过问。",
  "Willow Hardware":"殖民五金与建材分销商，在边疆地界经营移动补给站。库存始终在流动。",
  "Willow Labs":"合约研究机构，代不具名的药品客户进行临床试验。地点：外缘。监管：极少。",
  "WraithEnergy":"聚变电厂运营商，向虚空集体地界与极光主星电网供电。与极光电力的安排属非正式，偶有紧张。",
  "Zenith Automation":"高端工业自动化公司，持有联盟合约，为三处新殖民地承建居住舱。劳动力替代数据不予发布。",
  "Zenith Health":"高端医疗提供商，在联盟领地运营持牌医疗站。疗效卓越。价格高不可攀。不设分期。",
  "Zenith Insurance":"高端再保险商号，为其他保险公司承保。天顶一旦停止承保某个板块，整个市场都会察觉。",
  "Zenith Media":"高端传媒集团，为高层殖民受众制作长篇新闻与纪录片内容。资金来自不愿具名的各方。"
};

window.COMMODITY_ZH = {"Circuit Boards": "电路板", "Power Cells": "电池组", "Fuel Rods": "燃料棒", "Scrap Alloy": "废合金", "Data Chips": "数据芯片", "Optic Cabling": "光缆", "Plasma Coils": "等离子线圈", "Servo Motors": "伺服电机", "Nano Filament": "纳米丝", "Frayed Wiring": "磨损线缆", "Mag Bearings": "磁轴承", "Ruby Emitters": "红宝石发射器", "Tangle Looms": "缠结织机", "Rail Hooks": "轨钩", "Breaker Lances": "断路矛", "Logic Slates": "逻辑板", "Splice Harness": "接线束", "Shard Glass": "碎片玻璃", "Alloy Plating": "合金镀板", "Cobalt Ingots": "钴锭", "Graphite Rods": "石墨棒", "Ignition Caps": "点火帽", "Lens Arrays": "透镜阵列", "Damper Pins": "阻尼销", "Cipher Decks": "密码组", "Beam Drills": "光束钻", "Torque Spindles": "扭矩主轴", "Relay Chips": "中继芯片", "Coolant Tubes": "冷却管", "Transistor Packs": "晶体管组", "Thruster Nozzles": "推进器喷嘴", "Pressure Canisters": "压力罐", "Mesh Netting": "网状织物", "Heat Grilles": "散热格栅", "Arc Lamps": "弧光灯", "Filter Stacks": "滤芯组", "Crystal Cores": "晶核", "Gyro Rotors": "陀螺转子", "Molten Slag": "熔渣", "Sentry Units": "哨戒单元", "Stimpacks": "兴奋剂", "Vaccine Vials": "疫苗瓶", "First-Aid Kits": "急救包", "Synth-Blood": "合成血", "Painkillers": "止痛药", "Antitoxins": "抗毒素", "Surgical Kits": "手术包", "Gene Serum": "基因血清", "Bandage Packs": "绷带包", "Capsule Packs": "胶囊包", "Red Tablets": "红色药片", "Spore Pills": "孢子丸", "Blister Strips": "泡罩条", "Gel Caps": "凝胶胶囊", "Tonic Bottles": "补剂瓶", "Nerve Sticks": "神经棒", "Field Dressings": "战地敷料", "Remedy Kits": "疗愈包", "Medic Cases": "医疗箱", "Inhaler Units": "吸入器", "Cold Packs": "冷敷包", "Trauma Kits": "创伤包", "Oxygen Pens": "供氧笔", "Patch Strips": "贴片条", "Ledger Meds": "账簿药剂", "Antibiotic Strips": "抗生素条", "Triage Manuals": "分诊手册", "Blue Tablets": "蓝色药片", "Amber Globes": "琥珀球", "Dose Syringes": "剂量注射器", "Serum Flasks": "血清瓶", "Injector Guns": "注射枪", "Reagent Cubes": "试剂块", "Micro-Needles": "微针", "Vital Cells": "生命细胞", "Scalpels": "手术刀", "Forceps": "镊子", "Spray Antiseptic": "喷雾消毒剂", "Suture Clamps": "缝合夹", "Cryo Vials": "低温瓶", "Hydroponic Greens": "水培蔬菜", "Exotic Spores": "异种孢子", "Grain Bales": "谷物捆", "Medicinal Herbs": "药草", "Protein Yeast": "蛋白酵母", "Spice Pods": "香料荚", "S'weet Vine": "甜藤", "Water Algae": "水藻", "Seed Stock": "种子存货", "Sprout Pots": "芽苗盆", "Root Clusters": "根簇", "Ringbloom": "环花", "Leaf Saplings": "叶苗", "Flower Trays": "花盘", "Cropwood": "作木", "Redbud Stems": "红蕾茎", "Cactus Fruit": "仙人掌果", "Thornpear": "刺梨", "Broadleaf": "阔叶", "Mossbulb": "苔球", "Whiteblossom": "白花", "Lily Shoots": "百合芽", "Nightshade Pods": "茄属荚", "Mudroot": "泥根", "Amber Ferns": "琥珀蕨", "Bluebulb Greens": "蓝球菜", "Bloodvine": "血藤", "Violet Sprigs": "紫罗兰枝", "Goldflower": "金花", "Frostfronds": "霜叶", "Soil Starts": "育苗", "Iceleaf": "冰叶", "Cluster Grapes": "串葡萄", "Cloverstock": "苜蓿存货", "Reed Bundles": "芦苇捆", "Splitleaf": "裂叶", "Bloom Baskets": "花篮", "Autumn Fronds": "秋叶", "Bonsai Stock": "盆景存货", "Orchid Sprigs": "兰花枝"};

// ── General i18n layer (whole-UI). Language driven by _lang (the Jade button). ──
// Static markup: data-i18n / data-i18n-ph attributes, applied by applyI18n().
// JS render points: t(key, fallback). Chrome = standard term translations.
// applyI18n captures the original English from the DOM once (data-i18n-en) so the
// EN restore is byte-identical regardless of the catalog; the catalog supplies ZH.
window.I18N = {
  // ── City Charters (1.5.1.0) ────────────────────────────────────────────────
  // The city panel shipped with no keys at all and rendered entirely through
  // English fallbacks. Every en value below is byte identical to the fallback
  // still written at the call site, so English output is unchanged.
  'city.header':{en:'CITY CHARTER',zh:'城市特许状'},
  'galx.noDeclaration':{en:'No declaration',zh:'未申报'},
  'city.hist.seated':{en:'{who} takes the seat of {where}',zh:'{who} 就任 {where} 辖区长'},
  'city.hist.ousted':{en:'{who} unseats {prev}',zh:'{who} 罢黜 {prev}'},
  'city.hist.invest':{en:'{who} develops the district',zh:'{who} 推进辖区开发'},
  'city.hist.works':{en:'{who} commissions civic works, level {lv}',zh:'{who} 兴建市政工程，第 {lv} 级'},
  'city.hist.petition':{en:'{who} petitions against the administration of {where}',zh:'{who} 就 {where} 的施政具名陈情'},
  'city.hist.stock':{en:'{who} lays in {cls} stores',zh:'{who} 囤积{cls}储备'},
  'city.hist.charter':{en:'{who} takes the charter of the colony',zh:'{who} 接掌本殖民地特许'},
  'city.hist.charterVacant':{en:'the charter of the colony falls vacant',zh:'本殖民地特许空缺'},
  'city.skim':{en:'Lost to corruption',zh:'贪腐损耗'},
  'city.billBase':{en:'Services cost',zh:'公共服务成本'},
  'city.stores':{en:'Siege stores',zh:'围城储备'},
  'city.storesNone':{en:'none held',zh:'未储备'},
  'city.storesWeeks':{en:'{n} weeks of cover',zh:'可支撑 {n} 周'},
  'city.layIn':{en:'LAY IN ONE WEEK',zh:'储备一周'},
  'city.storesNote':{en:'Cover counts as local supply while it lasts and spoils at 14% a week. A lane can close faster than a district can be rezoned.',zh:'储备在耗尽前计入本地供给，每周损耗 14%。航道封闭远快于辖区改划。'},
  'lore.btn':{en:'LORE EVENTS',zh:'纪事'},
  'lore.title':{en:'Lore Events',zh:'世界纪事'},
  'lore.empty':{en:'Nothing has been written down yet.',zh:'尚无记载。'},
  'lore.blank':{en:'This page is blank.',zh:'此页空白。'},
  'lore.anon':{en:'unsigned',zh:'佚名'},
  'lore.revised':{en:'revised',zh:'修订于'},
  'lore.draft':{en:'draft',zh:'草稿'},
  'lore.new':{en:'NEW PAGE',zh:'新页'},
  'lore.edit':{en:'EDIT',zh:'编辑'},
  'lore.del':{en:'DELETE',zh:'删除'},
  'lore.save':{en:'SAVE',zh:'保存'},
  'lore.cancel':{en:'CANCEL',zh:'取消'},
  'lore.publish':{en:'Published',zh:'已发布'},
  'lore.sort':{en:'Order',zh:'排序'},
  'lore.titlePh':{en:'Title of the entry',zh:'条目标题'},
  'lore.bodyPh':{en:'What happened, and what it meant.',zh:'发生了什么，又意味着什么。'},
  'lore.needTitle':{en:'An entry needs a title.',zh:'条目需要标题。'},
  'lore.saveFail':{en:'The page would not take the ink.',zh:'此页未能落墨。'},
  'lore.loadFail':{en:'The book will not open.',zh:'此书无法开启。'},
  'lore.confirmDel':{en:'Tear out "{t}"? This cannot be undone.',zh:'撕去《{t}》？此操作不可撤销。'},
  'galx.passageLane':{en:'PASSAGE',zh:'星门航道'},
  'city.charter':{en:'Charter held by',zh:'特许持有者'},
  'city.charterNone':{en:'VACANT',zh:'空缺'},
  'city.imports':{en:'imports',zh:'需进口'},
  'city.exports':{en:'exports',zh:'可出口'},
  'city.balanced':{en:'balanced',zh:'自给'},
  'city.civicNote':{en:"What the city cannot grow it buys, and that shows up in this colony's own commodity prices. Zone districts to a trade and the world becomes the cheap place to buy it.",zh:'城市无法自产的部分必须外购，这会体现在本殖民地的大宗商品价格上。将辖区划归某一行业，本星球便成为该类货物的低价来源。'},
  'city.history':{en:'District record',zh:'辖区志'},
  'city.petition':{en:'FILE A PETITION',zh:'提交陈情'},
  'city.petitionNote':{en:'An established shopholder may put their name to a complaint. It pushes legitimacy down, and legitimacy is what a seat is priced on. One filing a day, and it washes out unless the discontent is sustained.',zh:'已立稳的店主可具名陈情。此举压低执政认受度，而席位定价正取决于认受度。每日一次，若民怨不持续则自行消散。'},
  'city.legit':{en:'Legitimacy',zh:'认受度'},
  'city.food':{en:'Food',zh:'食品'},
  'city.med':{en:'Medical',zh:'医疗'},
  'city.tech':{en:'Technical',zh:'技术'},
  'city.petitionedMsg':{en:'{who} has petitioned against your administration of {where}.',zh:'{who} 已就你在 {where} 的施政提出陈情。'},
  'city.rateLimited':{en:'Too many requests. Slow down a moment.',zh:'请求过于频繁，请稍候。'},
  'galx.scanCircuit':{en:'FLESH STATION DEEP-SCAN REFUSED // {id}, {cls} // beyond the passage, outside station sensor range',zh:'血肉站深层扫描被拒 // {id}，{cls} // 星门之外，超出本站传感范围'},
  'galx.scanScoundrel':{en:'FLESH STATION DEEP-SCAN REFUSED // {id} // unregistered hull, no filed route, hold sealed',zh:'血肉站深层扫描被拒 // {id} // 未注册舰体，无申报航线，货舱封闭'},
  'fac.passageOpen':{en:'OPEN',zh:'通道开放'},
  'fac.passageSealed':{en:'SEALED',zh:'通道封闭'},
  'city.shopsLower':{en:'shops',zh:'家商铺'},
  'city.citizens3':{en:'Citizens',zh:'市民'},
  'city.noPolicyChanges':{en:'No policy changes.',zh:'政策没有变更。'},
  'city.open':{en:'OPEN CITY',zh:'进入城市'},
  'city.class':{en:'Class',zh:'等级'},
  'city.pop':{en:'Pop',zh:'人口'},
  'city.book':{en:'Book',zh:'账面'},
  'city.districts':{en:'Districts',zh:'辖区'},
  'city.output':{en:'Output',zh:'产出'},
  'city.unrest':{en:'Unrest',zh:'动荡'},
  'city.shopsWord':{en:'Shops',zh:'商铺'},
  'city.occupiedBy':{en:'OCCUPIED BY',zh:'占领方'},
  'city.salvageIn':{en:'salvage begins in',zh:'拆解开始于'},
  'city.stripping':{en:'city being stripped',zh:'城市正被拆解'},
  'city.blockaded':{en:'Supply lanes blockaded',zh:'补给线被封锁'},
  'city.food':{en:'food',zh:'食品'},
  'city.med':{en:'med',zh:'医疗'},
  'city.tech':{en:'tech',zh:'科技'},
  'city.frontage':{en:'The frontage',zh:'临街铺面'},
  'city.of':{en:'of',zh:'/'},
  'city.let':{en:'let',zh:'已租出'},
  'city.noFrontage':{en:'No storefronts occupied. All frontage vacant.',zh:'无商铺经营，临街铺面全部空置。'},
  'city.npcRun':{en:'independent',zh:'独立商号'},
  'city.buy':{en:'BUY',zh:'收购'},
  'city.andMore':{en:'and',zh:'另有'},
  'city.more':{en:'more',zh:'家'},
  'city.vacantFrontage':{en:'vacant frontages',zh:'处空置铺面'},
  'city.npcHint':{en:'Independent firms are established and trade at full rate. Buying one transfers its position and income immediately. A newly leased frontage opens at a fraction of full trade and climbs over roughly twelve weeks.',zh:'独立商号已经立足，按全额交易。收购一家会立即转移它的位置与收入。新租下的铺面开业时只有全额交易的一小部分，约十二周内爬升到满额。'},
  'city.switchColony':{en:'SWITCH COLONY',zh:'切换殖民地'},
  'city.citizens':{en:'CITIZENS',zh:'市民'},
  'city.governed':{en:'governed',zh:'已授权'},
  'city.exit':{en:'EXIT',zh:'退出'},
  'city.loading':{en:'Charter registry loading...',zh:'特许状登记处载入中...'},
  'city.occupiedHint':{en:'All seats vacated. Salvage begins in',zh:'所有席位已空缺。拆解开始于'},
  'city.strippingHint':{en:'Occupation forces are removing mayoral development.',zh:'占领军正在拆除市长开发的部分。'},
  'city.mapAria':{en:'Isometric view of the city',zh:'城市等距视图'},
  'city.zoomIn':{en:'Zoom in',zh:'放大'},
  'city.zoomOut':{en:'Zoom out',zh:'缩小'},
  'city.reset':{en:'RESET VIEW',zh:'重置视角'},
  'city.zoomHint':{en:'wheel to zoom, drag to pan',zh:'滚轮缩放，拖动平移'},
  'city.openSeats':{en:'open',zh:'空缺'},
  'city.allHeld':{en:'all held',zh:'全部在任'},
  'city.district':{en:'District',zh:'辖区'},
  'city.noDistricts':{en:'Survey pending.',zh:'勘测待定。'},
  'city.buildsIn':{en:'Builds in',zh:'建设方向'},
  'city.zoned':{en:'zoned',zh:'已规划'},
  'city.landmark':{en:'Landmark',zh:'地标'},
  'city.mayor':{en:'Mayor',zh:'市长'},
  'city.you':{en:'you',zh:'你'},
  'city.npcAdmin':{en:'colonial administration',zh:'殖民地行政当局'},
  'city.stage':{en:'Stage',zh:'阶段'},
  'city.development':{en:'Development',zh:'开发度'},
  'city.baseWord':{en:'base',zh:'基准'},
  'city.citizens2':{en:'Citizens',zh:'市民'},
  'city.builtValue':{en:'Built value',zh:'建成价值'},
  'city.seatPrice':{en:'Seat price',zh:'席位价格'},
  'city.occupiedSeats':{en:'Seats are suspended under occupation.',zh:'占领期间席位暂停。'},
  'city.wrongFaction':{en:'Only',zh:'仅'},
  'city.mayHold':{en:'members may hold office on this world.',zh:'成员可在此星球任职。'},
  'city.grace':{en:'Incumbent is within the protected holding period.',zh:'现任者处于受保护的任期内。'},
  'city.oneCity':{en:'You hold office on',zh:'你已在'},
  'city.oneCity2':{en:'A mayor governs one city. Give up that seat before taking one here.',zh:'任职。一位市长只治理一座城市。请先放弃那个席位。'},
  'city.unseat':{en:'UNSEAT THE MAYOR',zh:'罢免市长'},
  'city.takeSeat':{en:'TAKE THE SEAT',zh:'取得席位'},
  'city.compNote':{en:'The sitting mayor is compensated',zh:'现任市长可获得补偿'},
  'city.compNote2':{en:'of their invested capital. The buyer pays the full seat price.',zh:'，为其投入资本的一部分。买方支付全额席位价格。'},
  'city.vacantNote':{en:'Run by colonial administration, which holds every lever at a fixed middling setting. It does not fail, and it does not improve.',zh:'由殖民地行政当局管理，所有杠杆固定在中等档位。它不会崩坏，也不会变好。'},
  'city.take':{en:'Commerce taken',zh:'商业抽成'},
  'city.civicBill':{en:'Civic bill',zh:'市政账单'},
  'city.net':{en:'Net',zh:'净额'},
  'city.arrears':{en:'Arrears',zh:'欠款'},
  'city.develop':{en:'DEVELOP',zh:'开发'},
  'city.devLeft':{en:'Levels built',zh:'已建层级'},
  'city.works':{en:'Civic works',zh:'市政工程'},
  'city.none3':{en:'none',zh:'无'},
  'city.commission':{en:'COMMISSION WORKS',zh:'兴建工程'},
  'city.worksDone':{en:'Every civic work this district can hold is built.',zh:'本辖区能容纳的市政工程已全部建成。'},
  'city.worksHint':{en:'Returns no commerce. Lowers unrest, raises prosperity, adds local supply, and raises what an invader pays for every point of control here. Never refunded, never salvaged by an occupier.',zh:'不带来任何商业收入。它降低动荡、提升繁荣、增加本地供应，并抬高入侵者夺取此地每一点控制权的代价。永不退款，占领者也无法拆解变现。'},
  'city.rename':{en:'RENAME',zh:'重命名'},
  'city.office':{en:'Mayoral office',zh:'市长办公室'},
  'city.cut':{en:'Commerce cut',zh:'商业抽成率'},
  'city.applyCut':{en:'SET RATE',zh:'设定税率'},
  'city.cutHint':{en:'Sets the mayoral share of storefront gross, within the band shown. Higher rates raise revenue per shop; lower rates attract tenants from neighbouring districts.',zh:'设定市长在商铺流水中的份额，限于所示区间。税率越高，每家商铺的抽成越多；税率越低，越能从邻近辖区吸引租户。'},
  'city.favoured':{en:'Favoured trade',zh:'扶持行业'},
  'city.none2':{en:'NONE',zh:'无'},
  'city.favourHint':{en:'The favoured trade earns the bonus shown; all others take the penalty. Also determines which civic good this district produces for colony supply.',zh:'扶持行业获得所示加成，其余行业承担减益。它同时决定本辖区为殖民地供应哪种民生物资。'},
  'city.policy':{en:'DISTRICT POLICY',zh:'辖区政策'},
  'city.lvSecurity':{en:'Security',zh:'治安'},
  'city.lvPolitics':{en:'Politics',zh:'政务'},
  'city.lvServices':{en:'Services',zh:'公共服务'},
  'city.lvUpkeep':{en:'Upkeep',zh:'维护'},
  'city.leverHint':{en:'Each lever raises one scalar and lowers another. Total lever intensity sets the weekly civic bill.',zh:'每根杠杆提升一项指标并压低另一项。杠杆总强度决定每周的市政账单。'},
  'city.applyPolicy':{en:'APPLY POLICY',zh:'应用政策'},
  'city.condition':{en:'District condition',zh:'辖区状况'},
  'city.prosperity':{en:'Prosperity',zh:'繁荣'},
  'city.crime':{en:'Crime',zh:'犯罪'},
  'city.supply':{en:'Supply',zh:'供应'},
  'city.cityWide':{en:'city wide',zh:'全城'},
  'city.supplyHint2':{en:'Supply is met by imports plus local production. Under blockade, only districts with a favoured civic trade produce.',zh:'供应由进口加本地生产满足。封锁期间，只有设有扶持民生行业的辖区还能生产。'},
  'city.commerce':{en:'Commerce',zh:'商业'},
  'city.cityNeeds':{en:'what this district wants',zh:'本辖区的需求'},
  'city.pool':{en:'Consumer spend',zh:'消费总额'},
  'city.storefronts':{en:'Storefronts',zh:'商铺'},
  'city.vacant':{en:'Vacant frontage',zh:'空置铺面'},
  'city.lease':{en:'Lease',zh:'租金'},
  'city.circuit':{en:'Circuit export bonus',zh:'回路出口加成'},
  'city.circuitNo':{en:'(Circuit only)',zh:'（仅限回路成员）'},
  'city.circuitHint':{en:'Jade Circuit members take the bonus on export trade in Circuit cities. It does not travel: it applies here, on Circuit ground.',zh:'翡翠回路成员在回路城市经营货运行业可获得此加成。它不随人移动：只在回路辖地生效。'},
  'city.openShop':{en:'Open a storefront here',zh:'在此开设商铺'},
  'city.shopNamePh':{en:'Shop name',zh:'商铺名称'},
  'city.shopDescPh':{en:'Description, optional',zh:'简介，可选'},
  'city.commerceHint':{en:'Demand is always present; only its distribution across trades changes. Shortages shift the split toward the scarce good over several weeks.',zh:'需求始终存在，改变的只是它在各行业间的分布。短缺会在数周内把份额推向稀缺的那一类。'},
  'city.myShops':{en:'Your storefronts',zh:'你的商铺'},
  'city.noShops':{en:'You hold no storefronts in this city. Lease a vacant frontage or buy an established business from any district.',zh:'你在本城没有商铺。可以租下一处空置铺面，或从任一辖区收购已经立足的商号。'},
  'city.close':{en:'close',zh:'关闭'},
  'city.total':{en:'Total',zh:'合计'},
  'city.decayHint':{en:'Returns diminish with each additional storefront held in the same district.',zh:'在同一辖区内每多持有一家商铺，回报都会递减。'},
  'city.war':{en:'War',zh:'战争'},
  'city.liveNumbers':{en:'live numbers',zh:'实时数据'},
  'city.cityBook':{en:'Mayoral investment',zh:'市长投入'},
  'city.warRate':{en:'War fund rate',zh:'战争基金费率'},
  'city.costTrigger':{en:'Cost to trigger',zh:'触发成本'},
  'city.stripYield':{en:'Full strip yield',zh:'完全拆解收益'},
  'city.raiderNet':{en:'Raider net',zh:'劫掠方净收益'},
  'city.warBad':{en:'Salvage currently exceeds the cost of taking this colony. This is a balance fault; report it.',zh:'拆解收益目前超过夺取本殖民地的成本。这是平衡缺陷，请上报。'},
  'city.warGood2':{en:'Salvage is limited to mayoral investment. Baseline development is not strippable, so the take is below the cost of taking the colony.',zh:'拆解仅限于市长投入的部分。基准开发不可拆解，因此收益低于夺取殖民地的成本。'},
  'city.vacantWord':{en:'vacant',zh:'空缺'},
  'city.cityHeader':{en:'The city',zh:'城市'},
  'city.governed2':{en:'Under mayors',zh:'已有市长'},
  'city.mayoralInv':{en:'Mayoral investment',zh:'市长投入'},
  'city.cityNote':{en:'Cities are permanent and cannot be destroyed. Players hold mayoral office over individual districts; seats are contestable and revert on default.',zh:'城市是永久的，无法被摧毁。玩家持有各辖区的市长职位；席位可被争夺，违约时收回。'},
  'city.renamePrompt':{en:'New name for this district:',zh:'本辖区的新名称：'},
  'city.noChanges':{en:'No changes.',zh:'没有变更。'},
  'city.needName':{en:'Give the shop a name first.',zh:'请先为商铺取名。'},
  'city.buyPrompt':{en:'Buy this business for ',zh:'收购这家商号，价格 '},
  'city.buyPrompt2':{en:'Trading name:',zh:'经营名称：'},
  'city.confirmClose':{en:'Close this storefront? The lease is not refunded.',zh:'关闭这家商铺？租金不予退还。'},
  'city.seatTaken':{en:'Seat acquired.',zh:'已取得席位。'},
  'city.developed':{en:'Development approved.',zh:'开发已批准。'},
  'city.cutSet':{en:'Commerce rate set.',zh:'商业税率已设定。'},
  'city.favourSet':{en:'Favoured trade set.',zh:'扶持行业已设定。'},
  'city.renamed':{en:'District renamed.',zh:'辖区已重命名。'},
  'city.shopOpened':{en:'Storefront opened.',zh:'商铺已开业。'},
  'city.shopRenamed':{en:'Storefront renamed.',zh:'商铺已重命名。'},
  'city.shopBought':{en:'Business acquired. It continues trading at its established rate.',zh:'已收购商号。它会按既有水平继续经营。'},
  'city.shopClosed':{en:'Storefront closed.',zh:'商铺已关闭。'},
  'city.policyApplied':{en:'District policy applied.',zh:'辖区政策已应用。'},
  'city.done':{en:'Done.',zh:'完成。'},
  'city.error':{en:'City registry error.',zh:'城市登记处错误。'},
  'city.worksBuilt':{en:'Civic works commissioned.',zh:'市政工程已动工。'},
  'city.fullyDeveloped':{en:'Development at maximum. A district takes {n} levels above its population baseline and no more.',zh:'开发已达上限。一个辖区在其人口基准之上最多只能再建 {n} 个层级。'},
  'city.confirmOust':{en:'Unseat {who} of {where} for {price}? They receive {comp} in compensation.',zh:'以 {price} 罢免 {where} 的 {who}？对方将获得 {comp} 补偿。'},
  'city.confirmSeat':{en:'Take the mayoral charter of {where} for {price}?',zh:'以 {price} 取得 {where} 的市长特许状？'},
  'city.confirmWorks':{en:'Commission civic works in {where} for {price}? This buys no income and is never refunded.',zh:'以 {price} 在 {where} 兴建市政工程？此举不带来任何收入，且永不退款。'},
  'city.oustedMsg':{en:'{who} has unseated you as mayor of {where}. Compensation {comp}.',zh:'{who} 已把你从 {where} 的市长之位上罢免。补偿 {comp}。'},
  'city.lapsedMsg':{en:'You have lost the charter of {where} to unpaid civic debt.',zh:'你因未偿的市政欠款失去了 {where} 的特许状。'},
  'galx.yourPosition':{en:'📋 YOUR POSITION',zh:'📋 我的持仓'},
  'galx.paid':{en:'PAID',zh:'买入价'},
  'galx.value':{en:'VALUE',zh:'现值'},
  'galx.gain':{en:'GAIN',zh:'盈亏'},
  'galx.dividends':{en:'DIVIDENDS',zh:'分红'},
  'galx.totalReturn':{en:'Total return:',zh:'总回报：'},
  'galx.route':{en:'Route',zh:'航线'},
  'galx.type':{en:'Type',zh:'类型'},
  'galx.slots':{en:'Slots',zh:'名额'},
  'galx.div':{en:'Div',zh:'分红'},
  'galx.price':{en:'Price',zh:'价格'},
  'galx.sellLabel':{en:'sell:',zh:'卖出：'},
  'galx.full':{en:'FULL',zh:'已满'},
  'galx.swap':{en:'SWAP',zh:'掉换'},
  'galx.shipContracts':{en:'Shipping Contracts',zh:'运输合约'},
  'galx.shipContractsSub':{en:'buy the right to the spread on a lane. No ship, no cargo. Profit if the spread widens past your strike before expiry.',zh:'买入某条航线价差的权利。无需飞船，无需货物。若价差在到期前超过你的行权价即可获利。'},
  'galx.yourOpenContracts':{en:'Your open contracts',zh:'你的未平仓合约'},
  'galx.strike':{en:'strike',zh:'行权价'},
  'galx.now':{en:'now',zh:'当前'},
  'galx.noBlockadeFunding':{en:'No blockade funding on this lane yet.',zh:'该航线尚无封锁资金。'},
  'galx.exercise':{en:'EXERCISE',zh:'行权'},
  'galx.availableContracts':{en:'Available contracts',zh:'可用合约'},
  'galx.reshuffles':{en:'(reshuffles periodically)',zh:'（定期刷新）'},
  'galx.lane':{en:'Lane',zh:'航线'},
  'galx.strikeCol':{en:'Strike',zh:'行权价'},
  'galx.premium':{en:'Premium',zh:'权利金'},
  'galx.expiry':{en:'Expiry',zh:'到期'},
  'galx.noContracts':{en:'No contracts on offer right now',zh:'当前没有可用合约'},
  'galx.contractsUnavailable':{en:'Contracts unavailable',zh:'合约不可用'},
  'galx.loginContracts':{en:'Log in to trade contracts',zh:'请登录后交易合约'},
  'galx.needAmount':{en:'Need Ƒ{amt}',zh:'需要 Ƒ{amt}'},
  'galx.offerExpired':{en:'That contract just reshuffled off the board',zh:'该合约刚刚被刷新下架'},
  'galx.buyFailed':{en:'Buy failed',zh:'买入失败'},
  'galx.contractBought':{en:'Contract bought, premium Ƒ{amt}',zh:'合约已买入 · 权利金 Ƒ{amt}'},
  'galx.exerciseFailed':{en:'Exercise failed',zh:'行权失败'},
  'galx.exercised':{en:'Exercised, paid Ƒ{amt}',zh:'已行权 · 支付 Ƒ{amt}'},
  'galx.contractClosed':{en:'Contract closed, spread did not beat your strike',zh:'合约已关闭 · 价差未超过你的行权价'},
  'galx.system':{en:'SYSTEM',zh:'星系'},
  'galx.megastructure':{en:'MEGASTRUCTURE',zh:'巨型结构'},
  'galx.contestedWar':{en:'CONTESTED, Faction war active',zh:'争夺中 · 阵营战争进行中'},
  'galx.homeOfFlesh':{en:'HOME OF MR. FLESH, Cannot be contested or funded',zh:'MR. FLESH 的居所 · 无法争夺或资助'},
  'galx.population':{en:'POPULATION',zh:'人口'},
  'galx.tension':{en:'TENSION',zh:'紧张度'},
  'galx.stationModules':{en:'Station Modules',zh:'空间站模块'},
  'galx.planetsCount':{en:'Planets ({n})',zh:'行星（{n}）'},
  'galx.enter':{en:'ENTER ›',zh:'进入 ›'},
  'galx.factionBonusActive':{en:'YOUR FACTION BONUS ACTIVE',zh:'你的阵营加成已生效'},
  'galx.sectorDividends':{en:'{sector} dividends:',zh:'{sector} 分红：'},
  'galx.warChest':{en:'WAR CHEST',zh:'战争基金'},
  'galx.factionControl':{en:'Faction Control',zh:'阵营控制'},
  'galx.keyOperators':{en:'Key Operators',zh:'主要运营方'},
  'galx.moreCount':{en:'+{n} more',zh:'另有 {n} 个'},
  'galx.fundFaction':{en:'Fund a Faction',zh:'资助阵营'},
  'galx.factionCtrl':{en:'{name}, {pct}% ctrl',zh:'{name} · 控制 {pct}%'},
  'galx.coreSystems':{en:'Core Systems',zh:'核心系统'},
  'galx.openSmugglingTab':{en:'💀 Open Smuggling Tab →',zh:'💀 打开走私标签页 →'},
  'galx.blockades':{en:'⛔ BLOCKADES',zh:'⛔ 封锁'},
  'galx.blkActive':{en:' [ACTIVE]',zh:' [生效中]'},
  'galx.blkFunding':{en:' [FUNDING]',zh:' [募资中]'},
  'galx.fundPlaceholder':{en:'Fund (Ƒ)',zh:'资助金额（Ƒ）'},
  'galx.fund':{en:'FUND',zh:'资助'},
  'galx.counter':{en:'COUNTER',zh:'反制'},
  'galx.privateArmy':{en:'⚔ PRIVATE ARMY, Break Blockade (Ƒ1,000,000)',zh:'⚔ 私人军队 · 打破封锁（Ƒ1,000,000）'},
  'galx.blockadeNote':{en:'Ƒ1,000,000 activates a 2-hour blockade',zh:'Ƒ1,000,000 可启动2小时封锁'},
  'galx.laneShares':{en:'📋 LANE SHARES',zh:'📋 航线份额'},
  'galx.laneClickHint':{en:'Click a lane for details, or use Contracts tab',zh:'点击航线查看详情，或使用合约标签页'},
  'galx.arbBoard':{en:'Arbitrage Board',zh:'套利面板'},
  'galx.arbSub':{en:'best spread per commodity right now',zh:'当前每种商品的最佳价差'},
  'galx.clsAll':{en:'ALL',zh:'全部'},
  'galx.clsTech':{en:'TECH',zh:'科技'},
  'galx.clsMed':{en:'MED',zh:'医疗'},
  'galx.clsAgri':{en:'AGRI',zh:'农业'},
  'galx.filterName':{en:'filter by name...',zh:'按名称筛选…'},
  'galx.buyCheapest':{en:'Buy cheapest',zh:'最低买价'},
  'galx.sellDearest':{en:'Sell dearest',zh:'最高卖价'},
  'galx.spread':{en:'Spread',zh:'价差'},
  'galx.act':{en:'Act',zh:'操作'},
  'galx.buy':{en:'BUY',zh:'买入'},
  'galx.sell':{en:'SELL',zh:'卖出'},
  'galx.arbHelp':{en:'BUY purchases at the cheapest colony (cargo stays there). To profit from a spread you must SHIP it to another colony, then SELL where it lands. You can only sell where your cargo physically is.',zh:'买入将在最便宜的殖民地购买（货物留在当地）。要赚取价差，你必须将其运往另一个殖民地，再在货物到达地卖出。你只能在货物实际所在地卖出。'},
  'galx.shipyard':{en:'Shipyard',zh:'船坞'},
  'galx.shipyardSub':{en:'your hauler sets cargo capacity per run',zh:'你的运输船决定每趟的货物容量'},
  'galx.active':{en:'ACTIVE',zh:'使用中'},
  'galx.capacity':{en:'Capacity:',zh:'容量：'},
  'galx.risk':{en:'Risk:',zh:'风险：'},
  'galx.baseline':{en:'baseline',zh:'基准'},
  'galx.inService':{en:'In service',zh:'服役中'},
  'galx.commission':{en:'Commission',zh:'建造'},
  'galx.starterShip':{en:'Starter ship',zh:'初始飞船'},
  'galx.loadingGrid':{en:'Loading market grid…',zh:'正在加载市场网格…'},
  'galx.gridUnavailable':{en:'Market grid unavailable',zh:'市场网格不可用'},
  'galx.loadFailed':{en:'Market load failed',zh:'市场加载失败'},
  'galx.cargoHold':{en:'Cargo Hold',zh:'货舱'},
  'galx.avg':{en:'avg',zh:'均价'},
  'galx.cargoEmpty':{en:'Empty, buy commodities from a colony',zh:'空 · 从殖民地购买商品'},
  'galx.inTransit':{en:'In Transit',zh:'运输中'},
  'galx.noShipments':{en:'No active shipments',zh:'没有运输中的货物'},
  'galx.shipCargo':{en:'📦 Ship Cargo',zh:'📦 运送货物'},
  'galx.shipCargoDesc':{en:'Buy a commodity at a colony, then ship it to another to sell at the spread. Shipping takes time and can be intercepted.',zh:'在某个殖民地买入商品，再运往另一个殖民地赚取价差。运输需要时间，且可能被拦截。'},
  'galx.commodity':{en:'Commodity',zh:'商品'},
  'galx.typeSearch':{en:'Type to search…',zh:'输入以搜索…'},
  'galx.from':{en:'From',zh:'起点'},
  'galx.to':{en:'To',zh:'终点'},
  'galx.qty':{en:'Qty',zh:'数量'},
  'galx.escort':{en:'Escort',zh:'护航'},
  'galx.insurance':{en:'Insurance',zh:'保险'},
  'galx.halfCover':{en:'half cover',zh:'半额承保'},
  'galx.ship':{en:'SHIP',zh:'运送'},
  'galx.escortNone':{en:'No escort, free',zh:'无护航 · 免费'},
  'galx.escortLight':{en:'Light escort, ~5% fee, -8% risk',zh:'轻型护航 · 约5%费用，风险-8%'},
  'galx.escortMedium':{en:'Armed convoy, ~13% fee, -16% risk',zh:'武装护卫队 · 约13%费用，风险-16%'},
  'galx.escortHeavy':{en:'Private army, ~29% fee, -26% risk',zh:'私人军队 · 约29%费用，风险-26%'},
  'galx.shipPreview':{en:'Select a commodity and two colonies to preview the route and risk.',zh:'选择一种商品和两个殖民地以预览路线与风险。'},
  'galx.contestedColony':{en:'Contested Colony',zh:'争夺中的殖民地'},
  'galx.selectColony':{en:'SELECT A COLONY',zh:'选择一个殖民地'},
  'galx.chooseAllegiance':{en:'Choose Your Allegiance, Bonuses Apply To All Holdings',zh:'选择你的阵营，加成适用于所有持仓'},
  'galx.howFactionWars':{en:'How Faction Wars Work',zh:'阵营战争机制'},
  'galx.factionWars1':{en:'Fund factions through colony panels on the Sector Map. When faction control crosses',zh:'通过星区地图上的殖民地面板资助阵营。当阵营控制率超过'},
  'galx.factionWars2':{en:', a 24-hour conquest timer begins. If it holds, the colony changes hands, and all aligned players receive passive bonuses on holdings tied to the sectors of that colony.',zh:' 时，将启动24小时征服计时器。若维持成功，殖民地易主，所有结盟玩家将在与该殖民地星区相关的持仓上获得被动加成。'},
  'galx.laneSharesTitle':{en:'Lane Shares, Bonding Curve Market',zh:'航线份额 · 联合曲线市场'},
  'galx.dividends30':{en:'Dividends every 30 min',zh:'每30分钟分红'},
  'galx.allTypes':{en:'All types',zh:'全部类型'},
  'galx.allStatus':{en:'All status',zh:'全部状态'},
  'galx.openSlots':{en:'Open slots',zh:'开放名额'},
  'galx.hasHolders':{en:'Has holders',zh:'已有持有者'},
  'galx.myShare':{en:'My share',zh:'我的份额'},
  'galx.sortVolume':{en:'Sort: Volume',zh:'排序：交易量'},
  'galx.sortSupply':{en:'Sort: Supply',zh:'排序：供应量'},
  'galx.sortPrice':{en:'Sort: Price',zh:'排序：价格'},
  'galx.sortType':{en:'Sort: Type',zh:'排序：类型'},
  'galx.howLaneShares':{en:'How Lane Shares Work',zh:'航线份额机制'},
  'galx.laneSharesDesc':{en:'Buy a share in the trade volume of any shipping lane. Price follows a bonding curve, so early buyers get in cheap and later buyers pay more. Each share pays a dividend every 30 minutes (high vol: Ƒ50, med: Ƒ20, low: Ƒ8). War reduces dividends. Contested colonies halve income; high tension cuts it to 25%. Blockades stack another 50% cut. If a colony is conquered, all shares on connected lanes are voided for a total loss. Sell anytime at the current curve price. One share per player. Swap to rotate positions.',zh:'购买任意运输航线交易量的份额。价格遵循联合曲线，早期买入者成本更低，后来者需支付更高价格。每份份额每30分钟派发一次分红（高交易量：Ƒ50，中：Ƒ20，低：Ƒ8）。战争会降低分红。争夺中的殖民地收入减半；高度紧张时降至25%。封锁再削减50%。若殖民地被征服，所有相连航线上的份额将作废并全额损失。可随时按当前曲线价格卖出。每名玩家限一份。可通过掉换来调整持仓。'},
  'pnl.xpWithTitle':{en:'Lv.{lv} · {title}  {rem} / {needed} XP',zh:'{lv}级 · {title}  {rem} / {needed} XP'},
  'pnl.xpNoTitle':{en:'Lv.{lv}  {rem} / {needed} XP',zh:'{lv}级  {rem} / {needed} XP'},
  'btn.logout':{en:'Logout',zh:'登出'},
  'sm.title':{en:'Sell',zh:'卖出'},
  'sm.symbol':{en:'Symbol',zh:'代码'},
  'sm.owned':{en:'Owned',zh:'持有'},
  'sm.avgCost':{en:'Avg Cost',zh:'平均成本'},
  'sm.lastPrice':{en:'Last Price',zh:'最新价格'},
  'sm.qtyToSell':{en:'Qty to sell',zh:'卖出数量'},
  'sm.max':{en:'max',zh:'最多'},
  'sm.saleValue':{en:'Sale Value',zh:'卖出价值'},
  'sm.fee':{en:'Fee (0.25%)',zh:'手续费 (0.25%)'},
  'sm.netProceeds':{en:'Net proceeds',zh:'净收入'},
  'sm.unrealizedPnl':{en:'Unrealized P&L',zh:'未实现盈亏'},
  'sm.cancel':{en:'Cancel',zh:'取消'},
  'sm.confirmSell':{en:'Confirm Sell',zh:'确认卖出'},
  'short.title':{en:'⬇ Short Sell',zh:'⬇ 卖空'},
  'short.openTab':{en:'Open Short',zh:'开仓卖空'},
  'short.coverTab':{en:'Cover Short',zh:'平仓回补'},
  'short.symbol':{en:'Symbol',zh:'代码'},
  'short.symPh':{en:'e.g. ORGX',zh:'例如 ORGX'},
  'short.currentPrice':{en:'Current Price',zh:'当前价格'},
  'short.qtyToShort':{en:'Qty to Short',zh:'卖空数量'},
  'short.collateral':{en:'Collateral Locked',zh:'锁定保证金'},
  'short.heldNotCash':{en:'(held, not cash)',zh:'（冻结，非现金）'},
  'short.liquidation':{en:'Liquidation @',zh:'强平价 @'},
  'short.entryMult':{en:'(entry ×1.65)',zh:'（入场价 ×1.65）'},
  'short.borrowFee':{en:'Borrow Fee',zh:'借券费'},
  'short.per30':{en:'/30 min',zh:'/30分钟'},
  'short.shortPosition':{en:'Short Position',zh:'空头持仓'},
  'short.avgEntry':{en:'Avg Entry',zh:'平均入场价'},
  'short.qtyToCover':{en:'Qty to Cover',zh:'回补数量'},
  'short.coverCost':{en:'Cover Cost',zh:'回补成本'},
  'short.estPnl':{en:'Estimated P&L',zh:'预计盈亏'},
  'short.yourShorts':{en:'YOUR SHORT POSITIONS',zh:'你的空头持仓'},
  'short.cancel':{en:'Cancel',zh:'取消'},
  'short.confirmShort':{en:'Confirm Short',zh:'确认卖空'},
  'short.coverPosition':{en:'Cover Position',zh:'平仓'},
  'mc.title':{en:'Margin Call',zh:'追加保证金'},
  'mc.desc':{en:'This short ran 65% past your entry. Cover it (or the price recovers) before the timer ends, or it is auto-liquidated to cover the loss, and if the loss exceeds everything you own, you are zeroed and dunced.',zh:'此空头已超出你的入场价65%。在计时结束前回补（或价格回升），否则将被自动强平以弥补亏损；若亏损超过你的全部资产，你将被清零并罚入笨蛋角。'},
  'mc.coverNow':{en:'↩ COVER NOW',zh:'↩ 立即回补'},
  'guild.allHoldings':{en:'All holdings',zh:'全部持仓'},
  'sector.0':{en:'Finance',zh:'金融'},
  'sector.1':{en:'Biotech',zh:'生物科技'},
  'sector.2':{en:'Insurance',zh:'保险'},
  'sector.3':{en:'Manufacturing',zh:'制造业'},
  'sector.4':{en:'Energy',zh:'能源'},
  'sector.5':{en:'Logistics',zh:'物流'},
  'sector.6':{en:'Tech',zh:'科技'},
  'sector.7':{en:'Misc',zh:'其他'},
  'pnl.filterPh':{en:'Filter positions by ticker...',zh:'按代码筛选持仓…'},
  'pnl.allPositions':{en:'All positions',zh:'全部持仓'},
  'pnl.groupedBySector':{en:'Grouped by sector',zh:'按板块分组'},
  'pnl.netWorth':{en:'Net Worth',zh:'净资产'},
  'pnl.equity':{en:'Equity',zh:'权益'},
  'pnl.cash':{en:'Cash',zh:'现金'},
  'pnl.unrealizedPnl':{en:'Unrealized P&L',zh:'未实现盈亏'},
  'pnl.dailyIncome':{en:'Daily Income',zh:'每日收入'},
  'pnl.faction':{en:'Faction:',zh:'派系：'},
  'pnl.facCoalition':{en:'THE COALITION',zh:'联盟'},
  'pnl.facSyndicate':{en:'THE SYNDICATE',zh:'辛迪加'},
  'pnl.facVoid':{en:'VOID COLLECTIVE',zh:'虚空集体'},
  'pnl.facFlesh':{en:'FLESH STATION ⚡',zh:'血肉站 ⚡'},
  'pnl.colonyBonuses':{en:'colony bonuses active',zh:'殖民地加成生效'},
  'pnl.colSymbol':{en:'Symbol',zh:'代码'},
  'pnl.colPosition':{en:'Position',zh:'持仓'},
  'pnl.colLast':{en:'Last',zh:'最新'},
  'pnl.colValue':{en:'Value',zh:'市值'},
  'pnl.colUpl':{en:'Unr. P&L',zh:'未实现'},
  'pnl.colGain':{en:'Gain%',zh:'涨幅%'},
  'pnl.noMatch':{en:'No positions match filter',zh:'没有符合筛选的持仓'},
  'pnl.noneInSector':{en:'No positions in {sector}',zh:'{sector} 板块没有持仓'},
  'pnl.noOpen':{en:'No open positions',zh:'没有持仓'},
  'store.rarPhantom':{en:'Phantom',zh:'幻影'},
  'inv.empty':{en:'Empty',zh:'空'},
  'inv.noItems':{en:'No items yet. Spin to get some.',zh:'还没有物品。旋转来获取。'},
  'inv.equipped':{en:'Equipped!',zh:'已装备！'},
  'inv.couldNotEquip':{en:'Could not equip: {err}',zh:'无法装备：{err}'},
  'inv.thisItem':{en:'this item',zh:'该物品'},
  'inv.scrapConfirm':{en:'Scrap {name} for Ƒ500? This permanently destroys the item.',zh:'拆解 {name} 换取 Ƒ500？这将永久销毁该物品。'},
  'inv.scrapped':{en:'Scrapped for Ƒ500',zh:'已拆解，获得 Ƒ500'},
  'inv.unequipFirst':{en:'Unequip it first',zh:'请先卸下'},
  'inv.cancelListingFirst':{en:'Cancel the Ƒbay listing first',zh:'请先取消 Ƒbay 挂单'},
  'inv.couldNotScrap':{en:'Could not scrap: {err}',zh:'无法拆解：{err}'},
  'inv.noSlotItems':{en:'No {slot} items in bag',zh:'背包中没有 {slot} 物品'},
  'inv.loginRequired':{en:'Login required',zh:'需要登录'},
  'inv.noSpinsEarn':{en:'No spins remaining, complete 9 day trades to earn one',zh:'没有剩余旋转，完成9次当日交易可获得一次'},
  'inv.spinning':{en:'Spinning…',zh:'旋转中…'},
  'inv.unknown':{en:'Unknown',zh:'未知'},
  'inv.addedToInv':{en:'Added to inventory',zh:'已加入库存'},
  'inv.noSpinsLeft':{en:'No spins remaining.',zh:'没有剩余旋转。'},
  'inv.spinFailed':{en:'Spin failed. Try again.',zh:'旋转失败，请重试。'},
  'inv.loading':{en:'Loading…',zh:'加载中…'},
  'inv.failedLoad':{en:'Failed to load',zh:'加载失败'},
  'inv.errLoadMarket':{en:'Error loading market',zh:'加载市场出错'},
  'inv.noMatch':{en:'No items match your filters.',zh:'没有符合筛选条件的物品。'},
  'inv.cancel':{en:'Cancel',zh:'取消'},
  'inv.buy':{en:'Buy',zh:'购买'},
  'inv.buyConfirm':{en:'Buy this item for Ƒ{price}?',zh:'以 Ƒ{price} 购买此物品？'},
  'inv.purchased':{en:'Purchased: {name}',zh:'已购买：{name}'},
  'inv.purchaseFailed':{en:'Purchase failed: {err}',zh:'购买失败：{err}'},
  'inv.listingCancelled':{en:'Listing cancelled',zh:'挂单已取消'},
  'inv.noListable':{en:'No items available to list',zh:'没有可挂单的物品'},
  'inv.selectItem':{en:'Select an item',zh:'请选择物品'},
  'inv.validPrice':{en:'Enter a valid price',zh:'请输入有效价格'},
  'inv.itemListed':{en:'Item listed on market',zh:'物品已挂到市场'},
  'inv.listFailed':{en:'List failed: {err}',zh:'挂单失败：{err}'},
  'inv.spinGranted':{en:'+{n} spin{s} granted! ({reason})',zh:'+{n} 次旋转已发放！（{reason}）'},
  'inv.dropped':{en:'🎁 {name} dropped! ({rarity})',zh:'🎁 {name} 掉落！（{rarity}）'},
  'inv.item':{en:'Item',zh:'物品'},
  'store.patreonMembership':{en:'Patreon Membership',zh:'Patreon 会员'},
  'store.linkEmail':{en:'Link your Patreon email to unlock tier benefits.',zh:'绑定你的 Patreon 邮箱以解锁等级福利。'},
  'store.tierPremium':{en:'Premium ★ $5 · +Ƒ500/30min',zh:'高级 ★ $5 · +Ƒ500/30分钟'},
  'store.tierGuild':{en:'Guild ⚖ $15 · +Ƒ1,500/30min',zh:'公会 ⚖ $15 · +Ƒ1,500/30分钟'},
  'store.tierCeo':{en:'CEO ♛ $100 · +Ƒ10,000/30min',zh:'CEO ♛ $100 · +Ƒ10,000/30分钟'},
  'store.emailPh':{en:'Your Patreon email',zh:'你的 Patreon 邮箱'},
  'store.linkAccount':{en:'Link Account',zh:'绑定账户'},
  'store.afterLinking':{en:'After linking, your tier updates automatically when Patreon processes your membership.',zh:'绑定后，当 Patreon 处理你的会员资格时，你的等级将自动更新。'},
  'store.stabTitles':{en:'Titles',zh:'称号'},
  'store.stabInventory':{en:'Inventory',zh:'库存'},
  'store.stabSlots':{en:'🎰 Slots',zh:'🎰 老虎机'},
  'store.equipped':{en:'Equipped',zh:'已装备'},
  'store.yourTitles':{en:'YOUR TITLES',zh:'你的称号'},
  'store.tierCommon':{en:'Common',zh:'普通'},
  'store.tierMid':{en:'Mid Prestige',zh:'中级声望'},
  'store.tierHigh':{en:'High Prestige',zh:'高级声望'},
  'store.tierMythic':{en:'Mythic',zh:'神话'},
  'store.tierPatreon':{en:'Patreon Exclusive',zh:'Patreon 专属'},
  'store.reqMembership':{en:'Requires active membership',zh:'需要有效会员资格'},
  'store.tierLegendary':{en:'⬡ LEGENDARY',zh:'⬡ 传奇'},
  'store.oneSeat':{en:'One seat. No permanence.',zh:'仅一席，并非永久。'},
  'store.itemPassive':{en:'Item passive:',zh:'物品被动：'},
  'store.bag':{en:'Bag',zh:'背包'},
  'store.allSlots':{en:'All Slots',zh:'全部槽位'},
  'store.slotHat':{en:'Hat',zh:'帽子'},
  'store.slotGlasses':{en:'Glasses',zh:'眼镜'},
  'store.slotUpperBody':{en:'Upper Body',zh:'上身'},
  'store.slotNecklace':{en:'Necklace',zh:'项链'},
  'store.slotWatch':{en:'Watch',zh:'手表'},
  'store.slotPants':{en:'Pants',zh:'裤子'},
  'store.slotShoes':{en:'Shoes',zh:'鞋子'},
  'store.slotVehicle':{en:'Vehicle',zh:'载具'},
  'store.slotProperty':{en:'Property',zh:'房产'},
  'store.slotImplant':{en:'Implant',zh:'植入体'},
  'store.slotRing':{en:'Ring',zh:'戒指'},
  'store.slotEarring':{en:'Earring',zh:'耳环'},
  'store.slotBracelet':{en:'Bracelet',zh:'手链'},
  'store.slotTitles':{en:'👑 Titles',zh:'👑 称号'},
  'store.allRarities':{en:'All Rarities',zh:'全部稀有度'},
  'store.rarCommon':{en:'Common',zh:'普通'},
  'store.rarUncommon':{en:'Uncommon',zh:'优秀'},
  'store.rarRare':{en:'Rare',zh:'稀有'},
  'store.rarEpic':{en:'Epic',zh:'史诗'},
  'store.rarLegendary':{en:'Legendary',zh:'传奇'},
  'store.sortNewest':{en:'Newest',zh:'最新'},
  'store.sortPriceAsc':{en:'Price ↑',zh:'价格 ↑'},
  'store.sortPriceDesc':{en:'Price ↓',zh:'价格 ↓'},
  'store.sortRarity':{en:'Rarity',zh:'稀有度'},
  'store.listItem':{en:'List an item for sale',zh:'挂出物品出售'},
  'store.pricePh':{en:'Price in Ƒ',zh:'价格（Ƒ）'},
  'store.listBtn':{en:'List',zh:'挂单'},
  'store.addList':{en:'+ List',zh:'+ 挂单'},
  'store.spinsAvail':{en:'Spins Available',zh:'可用旋转'},
  'store.everyNine':{en:'Every 9 day trades earns a free spin',zh:'每完成9次当日交易可获得一次免费旋转'},
  'store.spin':{en:'Spin',zh:'旋转'},
  'store.chipCommon':{en:'Common 55%',zh:'普通 55%'},
  'store.chipUncommon':{en:'Uncommon 25%',zh:'优秀 25%'},
  'store.chipRare':{en:'Rare 12%',zh:'稀有 12%'},
  'store.chipEpic':{en:'Epic 6%',zh:'史诗 6%'},
  'store.chipLegendary':{en:'Legendary 0.5%',zh:'传奇 0.5%'},
  'store.chipPhantom':{en:'Phantom 0.00001%',zh:'幻影 0.00001%'},
  'casino.rl.balance':{en:'Balance:',zh:'余额：'},
  'casino.rl.betsTotal':{en:'Bets Total:',zh:'下注总额：'},
  'casino.rl.betAmount':{en:'Bet Amount',zh:'下注金额'},
  'casino.rl.min':{en:'Min',zh:'最小'},
  'casino.rl.max':{en:'Max',zh:'最大'},
  'casino.rl.betType':{en:'Bet Type',zh:'下注类型'},
  'casino.rl.optRed':{en:'Red (1:1)',zh:'红 (1:1)'},
  'casino.rl.optBlack':{en:'Black (1:1)',zh:'黑 (1:1)'},
  'casino.rl.optOdd':{en:'Odd (1:1)',zh:'单 (1:1)'},
  'casino.rl.optEven':{en:'Even (1:1)',zh:'双 (1:1)'},
  'casino.rl.optLow':{en:'Low 1–18 (1:1)',zh:'小 1–18 (1:1)'},
  'casino.rl.optHigh':{en:'High 19–36 (1:1)',zh:'大 19–36 (1:1)'},
  'casino.rl.optDozen1':{en:'1st 12 · 1–12 (2:1)',zh:'第一打 · 1–12 (2:1)'},
  'casino.rl.optDozen2':{en:'2nd 12 · 13–24 (2:1)',zh:'第二打 · 13–24 (2:1)'},
  'casino.rl.optDozen3':{en:'3rd 12 · 25–36 (2:1)',zh:'第三打 · 25–36 (2:1)'},
  'casino.rl.optCol1':{en:'Column 1 (2:1)',zh:'第一列 (2:1)'},
  'casino.rl.optCol2':{en:'Column 2 (2:1)',zh:'第二列 (2:1)'},
  'casino.rl.optCol3':{en:'Column 3 (2:1)',zh:'第三列 (2:1)'},
  'casino.rl.optStraight':{en:'Straight Up (35:1)',zh:'直注 (35:1)'},
  'casino.rl.addBet':{en:'+ Add Bet',zh:'+ 添加下注'},
  'casino.rl.spin':{en:'🎰 Spin',zh:'🎰 旋转'},
  'casino.rl.clear':{en:'✕ Clear',zh:'✕ 清除'},
  'casino.rl.activeBets':{en:'Active Bets',zh:'当前下注'},
  'casino.rl.lastInit':{en:'Last: -',zh:'上次：-'},
  'casino.rl.noBets':{en:'No bets yet.',zh:'暂无下注。'},
  'casino.rl.lblRed':{en:'Red',zh:'红'},
  'casino.rl.lblBlack':{en:'Black',zh:'黑'},
  'casino.rl.lblOdd':{en:'Odd',zh:'单'},
  'casino.rl.lblEven':{en:'Even',zh:'双'},
  'casino.rl.lblLow':{en:'Low 1–18',zh:'小 1–18'},
  'casino.rl.lblHigh':{en:'High 19–36',zh:'大 19–36'},
  'casino.rl.lblDozen1':{en:'1st 12',zh:'第一打'},
  'casino.rl.lblDozen2':{en:'2nd 12',zh:'第二打'},
  'casino.rl.lblDozen3':{en:'3rd 12',zh:'第三打'},
  'casino.rl.lblCol1':{en:'Column 1',zh:'第一列'},
  'casino.rl.lblCol2':{en:'Column 2',zh:'第二列'},
  'casino.rl.lblCol3':{en:'Column 3',zh:'第三列'},
  'casino.rl.lblStraight':{en:'Straight {n}',zh:'直注 {n}'},
  'casino.rl.colorRed':{en:'red',zh:'红'},
  'casino.rl.colorBlack':{en:'black',zh:'黑'},
  'casino.rl.colorGreen':{en:'green',zh:'绿'},
  'casino.rl.lastResult':{en:'Last: {n} ({col})',zh:'上次：{n}（{col}）'},
  'casino.rl.bannerWin':{en:'✓ {n} {col}, Won {net} (paid {paid})',zh:'✓ {n} {col}，赢得 {net}（派彩 {paid}）'},
  'casino.rl.bannerLose':{en:'✗ {n} {col}, No win',zh:'✗ {n} {col}，未中'},
  'casino.rl.logLine':{en:'{n} ({col}), {net} | bet {bet}',zh:'{n}（{col}），{net} | 下注 {bet}'},
  'casino.rl.noWin':{en:'No win',zh:'未中'},
  'casino.rl.insufficient':{en:'Insufficient funds.',zh:'余额不足。'},
  'casino.rl.betPlaced':{en:'Bet placed: {label}, {amt}',zh:'已下注：{label}，{amt}'},
  'casino.rl.placeFirst':{en:'Place a bet first.',zh:'请先下注。'},
  'casino.rl.spinning':{en:'Spinning…',zh:'旋转中…'},
  'casino.tab.roulette':{en:'Roulette',zh:'轮盘'},
  'casino.tab.blackjack':{en:'Blackjack',zh:'21点'},
  'casino.tab.poker':{en:'Poker',zh:'扑克'},
  'casino.tab.horseraces':{en:'Horse Races',zh:'赛马'},
  'casino.tab.baccarat':{en:'Baccarat',zh:'百家乐'},
  'casino.tab.sicbo':{en:'Sic Bo',zh:'骰宝'},
  'casino.tab.chess':{en:'Chess',zh:'国际象棋'},
  'casino.tab.sudoku':{en:'Sudoku',zh:'数独'},
  'casino.tab.mathgame':{en:'Numeracy Exams',zh:'数学考试'},
  'casino.tab.minesweeper':{en:'Minesweeper',zh:'扫雷'},
  'casino.tab.solitaire':{en:'Solitaire',zh:'纸牌'},
  'casino.chess.aiElo':{en:'AI ELO',zh:'AI 等级分'},
  'casino.chess.start':{en:'Start',zh:'开始'},
  'casino.chess.surrender':{en:'Surrender',zh:'认输'},
  'casino.chess.payouts':{en:'Payouts',zh:'赔付'},
  'casino.chess.balance':{en:'Balance: {v}',zh:'余额：{v}'},
  'casino.chess.money':{en:'Entry Fee: {fee}  |  Win: {win}  ·  Draw: {draw}  ·  Loss: {loss}',zh:'入场费：{fee}  |  胜：{win}  ·  和：{draw}  ·  负：{loss}'},
  'casino.chess.payoutInfo':{en:'Higher ELO ⇒ higher entry fee and payout. Fees are charged on Start. Rewards are paid at game end.',zh:'等级分越高 ⇒ 入场费与赔付越高。费用在开始时收取，奖励在对局结束时发放。'},
  'casino.chess.yourMove':{en:'Your move (White)',zh:'你走（白方）'},
  'casino.chess.aiThinking':{en:'AI thinking… (Black)',zh:'AI 思考中…（黑方）'},
  'casino.chess.aiTimeout':{en:'AI ran out of time! You win {amt}',zh:'AI 超时！你赢得 {amt}'},
  'casino.chess.checkmateWin':{en:'Checkmate! You win {amt}',zh:'将死！你赢得 {amt}'},
  'casino.chess.youTimeout':{en:'You ran out of time.',zh:'你超时了。'},
  'casino.chess.checkmated':{en:'Checkmated. Better luck next time.',zh:'被将死，下次好运。'},
  'casino.chess.surrendered':{en:'You surrendered.',zh:'你已认输。'},
  'casino.chess.draw':{en:'Draw. Refunded {amt}',zh:'和棋。退回 {amt}'},
  'casino.chess.yourMoveShort':{en:'Your move.',zh:'轮到你走。'},
  'casino.chess.insufficient':{en:'Insufficient funds for entry fee.',zh:'余额不足以支付入场费。'},
  'casino.chess.entryRejected':{en:'Entry rejected: {err}',zh:'入场被拒：{err}'},
  'casino.chess.gameStarted':{en:'Game started. You are White.',zh:'对局开始。你执白。'},
  'casino.chess.noGame':{en:'No game in progress.',zh:'没有进行中的对局。'},
  'casino.chess.chooseStart':{en:'Choose difficulty and press Start.',zh:'选择难度并点击开始。'},
  'casino.sol.newGame':{en:'New Game',zh:'新游戏'},
  'casino.sol.cashOut':{en:'Cash Out',zh:'兑现'},
  'casino.sol.auto':{en:'Auto',zh:'自动'},
  'casino.sol.balance':{en:'Balance',zh:'余额'},
  'casino.sol.statusPlaying':{en:'Foundations <b>{fc} / 52</b> &nbsp; Cash-out value <b>{val}</b>',zh:'基础牌 <b>{fc} / 52</b> &nbsp; 兑现价值 <b>{val}</b>'},
  'casino.sol.idle':{en:'Klondike - draw 3, one pass through the stock, no redeal.',zh:'克朗代克 - 每次翻3张，牌堆只过一遍，不可重发。'},
  'casino.sol.idleStatus':{en:'Buy-in <b>{buyin}</b>. Move cards to the foundations and cash out for <b>{perCard}</b> per foundation card. Clearing all 52 pays a <b>{bonus}</b> bonus. The buy-in is committed when you start and forfeited if you leave a game unfinished.',zh:'买入 <b>{buyin}</b>。将牌移至基础牌堆，按每张基础牌 <b>{perCard}</b> 兑现。清完全部52张可额外获得 <b>{bonus}</b> 奖励。买入在开始时扣除，若中途离开则被没收。'},
  'casino.sol.confirmNew':{en:'Start a new game? Your current game will be forfeited and the buy-in lost.',zh:'开始新游戏？当前游戏将作废，买入将损失。'},
  'casino.sol.dealing':{en:'Dealing...',zh:'发牌中…'},
  'casino.sol.couldNotStart':{en:'Could not start: {err}',zh:'无法开始：{err}'},
  'casino.sol.cashoutFailed':{en:'Cash-out failed: {err} (try again)',zh:'兑现失败：{err}（请重试）'},
  'casino.sol.solved':{en:'SOLVED - all 52 cleared',zh:'已通关 - 全部52张清空'},
  'casino.sol.headFoundations':{en:'{n} of 52 to foundations',zh:'{n} / 52 张进入基础牌堆'},
  'casino.sol.bannerWin':{en:'W {head}. Won {net} (paid {paid})',zh:'赢 {head}。赢得 {net}（派彩 {paid}）'},
  'casino.sol.bannerPush':{en:'{head}. Broke even (paid {paid})',zh:'{head}。打平（派彩 {paid}）'},
  'casino.sol.bannerLose':{en:'L {head}. Lost {loss} (paid {paid})',zh:'输 {head}。输掉 {loss}（派彩 {paid}）'},
  'casino.sdk.title':{en:'SUDOKU',zh:'数独'},
  'casino.sdk.diffEasy':{en:'Easy',zh:'简单'},
  'casino.sdk.diffMedium':{en:'Medium',zh:'中等'},
  'casino.sdk.diffHard':{en:'Hard',zh:'困难'},
  'casino.sdk.diffExpert':{en:'Expert',zh:'专家'},
  'casino.sdk.diffInsane':{en:'Insane',zh:'疯狂'},
  'casino.sdk.clear':{en:'✕ Clear',zh:'✕ 清除'},
  'casino.sdk.newPuzzle':{en:'New Puzzle',zh:'新谜题'},
  'casino.sdk.submit':{en:'Submit',zh:'提交'},
  'casino.sdk.hint20':{en:'Hint (−20% reward)',zh:'提示（奖励 −20%）'},
  'casino.sdk.hintPct':{en:'Hint (−{pct}% reward)',zh:'提示（奖励 −{pct}%）'},
  'casino.sdk.chooseDiff':{en:'Choose difficulty and press New Puzzle.',zh:'选择难度并点击新谜题。'},
  'casino.sdk.cellsRemaining':{en:'{n} cells remaining',zh:'剩余 {n} 格'},
  'casino.sdk.boardComplete':{en:'Board complete, press Submit!',zh:'已填满，请点击提交！'},
  'casino.sdk.cooldown':{en:'⏳ {name} on cooldown, {min} min remaining.',zh:'⏳ {name} 冷却中，剩余 {min} 分钟。'},
  'casino.sdk.fillGrid':{en:'{name}, fill the grid, then press Submit.',zh:'{name}，填满网格后点击提交。'},
  'casino.sdk.hintNote':{en:' ({n} hint{s} used)',zh:'（用了 {n} 次提示）'},
  'casino.sdk.correct':{en:'✓ Correct! You earned Ƒ{amt}{note}.',zh:'✓ 正确！你赢得 Ƒ{amt}{note}。'},
  'casino.sdk.notQuite':{en:'✗ Not quite right. Keep checking your work!',zh:'✗ 还不对，继续检查你的答案！'},
  'casino.sdk.noErrors':{en:'No errors found!',zh:'没有发现错误！'},
  'casino.sdk.hintUsed':{en:'Hint used. Reward reduced to {pct}%.',zh:'已用提示。奖励降至 {pct}%。'},
  'casino.mine.title':{en:'MINESWEEPER',zh:'扫雷'},
  'casino.mine.modeBeginner':{en:'Beginner',zh:'初级'},
  'casino.mine.modeIntermediate':{en:'Intermediate',zh:'中级'},
  'casino.mine.modeExpert':{en:'Expert',zh:'高级'},
  'casino.mine.sec':{en:'s',zh:'秒'},
  'casino.mine.controls':{en:'Left click: reveal · Right click: flag',zh:'左键：翻开 · 右键：标记'},
  'casino.mine.newGame':{en:'New Game',zh:'新游戏'},
  'casino.mine.boom':{en:'💥 Boom!',zh:'💥 爆炸！'},
  'casino.mine.hitMine':{en:'Hit a mine. Better luck next time.',zh:'踩到地雷，下次好运。'},
  'casino.mine.cleared':{en:'✓ Board cleared!',zh:'✓ 全部扫清！'},
  'casino.mine.earned':{en:'You earned Ƒ{amt}! Time: {t}s',zh:'你赢得 Ƒ{amt}！用时 {t} 秒'},
  // Guild Numeracy Exams (1.3.5). The old Math Quiz keys are gone with the old
  // game: it had five hardcoded difficulty labels and one flat payout line, and
  // nothing it said is still true. Question templates live under casino.math.q.*
  // and are looked up dynamically from the tk field the server ships alongside
  // each word problem, so a Jade player reads the question rather than the
  // English the generator happened to render.
  'casino.math.title':{en:'GUILD NUMERACY EXAMS',zh:'\u5546\u4f1a\u6570\u5b66\u8003\u8bd5'},
  'casino.math.subtitle':{en:'Sit a paper. The grade decides the pay.',zh:'\u53c2\u52a0\u8003\u8bd5\u3002\u6210\u7ee9\u51b3\u5b9a\u62a5\u916c\u3002'},
  'casino.math.loading':{en:'Loading exam board...',zh:'\u6b63\u5728\u52a0\u8f7d\u8003\u573a\u2026'},
  'casino.math.gradeCurve':{en:'Grade curve',zh:'\u8bc4\u5206\u66f2\u7ebf'},
  'casino.math.curveNote':{en:'Earnings accrue per correct answer, then multiply by your grade. Below 60 percent the paper pays nothing and the entry fee is lost.',zh:'\u6bcf\u7b54\u5bf9\u4e00\u9898\u7d2f\u8ba1\u6536\u76ca\uff0c\u6700\u540e\u6309\u6210\u7ee9\u500d\u7387\u7ed3\u7b97\u3002\u4f4e\u4e8e\u767e\u5206\u4e4b\u516d\u5341\u4e0d\u4e88\u652f\u4ed8\uff0c\u62a5\u540d\u8d39\u4e0d\u9000\u3002'},
  'casino.math.free':{en:'Free',zh:'\u514d\u8d39'},
  'casino.math.entryFee':{en:'Entry {amt}',zh:'\u62a5\u540d\u8d39 {amt}'},
  'casino.math.qCount':{en:'{n} questions',zh:'{n} \u9053\u9898'},
  'casino.math.secEach':{en:'{n}s each',zh:'\u6bcf\u9898 {n} \u79d2'},
  'casino.math.upTo':{en:'Up to {amt}',zh:'\u6700\u9ad8 {amt}'},
  'casino.math.bestNet':{en:'Best result {amt}',zh:'\u6700\u4f73\u6210\u7ee9 {amt}'},
  'casino.math.sit':{en:'Sit the paper',zh:'\u53c2\u52a0\u8003\u8bd5'},
  'casino.math.topicAny':{en:'Your choice of topic',zh:'\u81ea\u9009\u9898\u578b'},
  'casino.math.topicMixed':{en:'Mixed',zh:'\u6df7\u5408'},
  'casino.math.lockBroker':{en:'Locked. Pass the Broker Certification first.',zh:'\u672a\u89e3\u9501\u3002\u8bf7\u5148\u901a\u8fc7\u7ecf\u7eaa\u4eba\u8ba4\u8bc1\u3002'},
  'casino.math.cooldownLeft':{en:'Cooldown {t}',zh:'\u51b7\u5374 {t}'},
  'casino.math.needFunds':{en:'Entry is {amt}',zh:'\u62a5\u540d\u8d39\u4e3a {amt}'},
  'casino.math.resumeFound':{en:'You left {exam} unfinished at question {n} of {t}.',zh:'\u4f60\u7684\u300a{exam}\u300b\u5c1a\u672a\u5b8c\u6210\uff0c\u505c\u5728\u7b2c {n} \u9898\uff0c\u5171 {t} \u9898\u3002'},
  'casino.math.resumeCost':{en:'Resuming scores the interrupted question as wrong. Walking out forfeits the entry fee.',zh:'\u7ee7\u7eed\u4f5c\u7b54\u4f1a\u5c06\u4e2d\u65ad\u7684\u90a3\u9053\u9898\u5224\u4e3a\u9519\u8bef\u3002\u9000\u51fa\u5219\u62a5\u540d\u8d39\u4e0d\u9000\u3002'},
  'casino.math.resume':{en:'Resume paper',zh:'\u7ee7\u7eed\u8003\u8bd5'},
  'casino.math.walkOut':{en:'Walk out',zh:'\u9000\u51fa\u8003\u8bd5'},
  'casino.math.scoreLabel':{en:'Score:',zh:'\u5f97\u5206\uff1a'},
  'casino.math.accrued':{en:'At risk:',zh:'\u5f85\u7ed3\u7b97\uff1a'},
  'casino.math.projected':{en:'Best case:',zh:'\u6700\u597d\u60c5\u51b5\uff1a'},
  'casino.math.answer':{en:'Answer',zh:'\u56de\u7b54'},
  'casino.math.tier':{en:'Tier {n}',zh:'\u7b2c {n} \u7ea7'},
  'casino.math.pays':{en:'Pays {amt}',zh:'\u503c {amt}'},
  'casino.math.correctPlus':{en:'Correct. {amt}.',zh:'\u7b54\u5bf9\u3002{amt}\u3002'},
  'casino.math.correctStreak':{en:'Correct. {amt} plus a {bonus} streak bonus.',zh:'\u7b54\u5bf9\u3002{amt}\uff0c\u53e6\u52a0\u8fde\u51fb\u5956\u52b1 {bonus}\u3002'},
  'casino.math.wrongWas':{en:'Wrong. The answer was {ans}.',zh:'\u7b54\u9519\u3002\u6b63\u786e\u7b54\u6848\u662f {ans}\u3002'},
  'casino.math.timeUpWas':{en:'Time up. The answer was {ans}.',zh:'\u65f6\u95f4\u5230\u3002\u6b63\u786e\u7b54\u6848\u662f {ans}\u3002'},
  'casino.math.resumeLost':{en:'Question {n} was scored wrong. The answer was {ans}.',zh:'\u7b2c {n} \u9898\u5df2\u5224\u4e3a\u9519\u8bef\u3002\u6b63\u786e\u7b54\u6848\u662f {ans}\u3002'},
  'casino.math.lostRound':{en:'Lost contact with the paper. Returning to the board.',zh:'\u4e0e\u8003\u5377\u5931\u53bb\u8054\u7cfb\uff0c\u8fd4\u56de\u8003\u573a\u3002'},
  'casino.math.startFailed':{en:'Could not start that paper.',zh:'\u65e0\u6cd5\u5f00\u59cb\u8fd9\u573a\u8003\u8bd5\u3002'},
  'casino.math.errCooldown':{en:'Still on cooldown for {t}.',zh:'\u4ecd\u5728\u51b7\u5374\u4e2d\uff0c\u5269\u4f59 {t}\u3002'},
  'casino.math.errFunds':{en:'You need {amt} to sit this paper.',zh:'\u53c2\u52a0\u8fd9\u573a\u8003\u8bd5\u9700\u8981 {amt}\u3002'},
  'casino.math.offline':{en:'Exam board unavailable. Check your connection and try again.',zh:'\u8003\u573a\u6682\u4e0d\u53ef\u7528\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002'},
  'casino.math.resScore':{en:'Score {s} of {t} ({p} percent)',zh:'\u5f97\u5206 {s}/{t}\uff08\u767e\u5206\u4e4b {p}\uff09'},
  'casino.math.resAccrued':{en:'Accrued {amt}',zh:'\u7d2f\u8ba1 {amt}'},
  'casino.math.resMult':{en:'Grade multiplier {m}',zh:'\u6210\u7ee9\u500d\u7387 {m}'},
  'casino.math.resStreak':{en:'Best run {n} in a row',zh:'\u6700\u957f\u8fde\u51fb {n} \u9898'},
  'casino.math.resEntry':{en:'Entry fee {amt}',zh:'\u62a5\u540d\u8d39 {amt}'},
  'casino.math.resPaid':{en:'Paid out {amt}',zh:'\u5b9e\u4ed8 {amt}'},
  'casino.math.resNet':{en:'Net {amt}',zh:'\u51c0\u989d {amt}'},
  'casino.math.resWalked':{en:'You walked out. An unfinished paper pays nothing and the entry fee stays with the guild.',zh:'\u4f60\u5df2\u9000\u51fa\u3002\u672a\u5b8c\u6210\u7684\u8003\u5377\u4e0d\u4e88\u652f\u4ed8\uff0c\u62a5\u540d\u8d39\u5f52\u5546\u4f1a\u6240\u6709\u3002'},
  'casino.math.backToBoard':{en:'Back to the exam board',zh:'\u8fd4\u56de\u8003\u573a'},
  // Topics. Looked up as casino.math.topic.<id>; the ten ids are the TOPICS
  // table in server/mathtest.js and this list must stay level with it.
  'casino.math.topic.arith':{en:'Arithmetic',zh:'\u56db\u5219\u8fd0\u7b97'},
  'casino.math.topic.order':{en:'Order of Operations',zh:'\u8fd0\u7b97\u987a\u5e8f'},
  'casino.math.topic.powers':{en:'Powers and Roots',zh:'\u4e58\u65b9\u4e0e\u5f00\u65b9'},
  'casino.math.topic.percent':{en:'Percentages',zh:'\u767e\u5206\u6bd4'},
  'casino.math.topic.fractions':{en:'Fractions',zh:'\u5206\u6570'},
  'casino.math.topic.algebra':{en:'Algebra',zh:'\u4ee3\u6570'},
  'casino.math.topic.sequence':{en:'Sequences',zh:'\u6570\u5217'},
  'casino.math.topic.ratio':{en:'Ratios and Rates',zh:'\u6bd4\u4f8b\u4e0e\u5355\u4ef7'},
  'casino.math.topic.interest':{en:'Interest',zh:'\u5229\u606f'},
  'casino.math.topic.wordpnl':{en:'Trade Problems',zh:'\u4ea4\u6613\u5e94\u7528\u9898'},
  // Word-problem templates. The en value here mirrors what the generator renders
  // so the fallback is never a stray key, and the zh value is what a Jade player
  // actually reads. Symbol-only questions (sums, powers, sequences of digits)
  // ship no template because there is nothing in them to translate.
  'casino.math.q.pctOf':{en:'{p}% of {n}',zh:'{n} \u7684 {p}%'},
  'casino.math.q.pctInc':{en:'{n} increased by {p}%',zh:'{n} \u589e\u52a0 {p}%'},
  'casino.math.q.pctDec':{en:'{n} reduced by {p}%',zh:'{n} \u51cf\u5c11 {p}%'},
  'casino.math.q.pctWhat':{en:'What percent of {b} is {a}? (whole percent)',zh:'{a} \u662f {b} \u7684\u767e\u5206\u4e4b\u51e0\uff1f\uff08\u53d6\u6574\uff09'},
  'casino.math.q.fracOf':{en:'{num}/{den} of {n}',zh:'{n} \u7684 {num}/{den}'},
  'casino.math.q.fracAdd':{en:'{a}/{b} + {c}/{d} (3 dp)',zh:'{a}/{b} + {c}/{d}\uff08\u4fdd\u7559\u4e09\u4f4d\u5c0f\u6570\uff09'},
  'casino.math.q.solveX':{en:'Solve for x: {eq}',zh:'\u89e3\u51fa x\uff1a{eq}'},
  'casino.math.q.nextTerm':{en:'Next term: {seq}, ?',zh:'\u4e0b\u4e00\u9879\uff1a{seq}, ?'},
  'casino.math.q.unitRate':{en:'{n} units cost \u0192{c}. Price of {m} units?',zh:'{n} \u5355\u4f4d\u552e\u4ef7 \u0192{c}\u3002{m} \u5355\u4f4d\u7684\u4ef7\u683c\uff1f'},
  'casino.math.q.wholeShares':{en:'\u0192{c} buys how many whole shares at \u0192{p}?',zh:'\u4ee5\u6bcf\u80a1 \u0192{p} \u8ba1\uff0c\u0192{c} \u53ef\u4e70\u591a\u5c11\u6574\u80a1\uff1f'},
  'casino.math.q.simpleInt':{en:'\u0192{p} at {r}% simple interest for {y} years. Interest earned?',zh:'\u0192{p} \u6309 {r}% \u5355\u5229\u5b58 {y} \u5e74\u3002\u5229\u606f\u662f\u591a\u5c11\uff1f'},
  'casino.math.q.compoundInt':{en:'\u0192{p} at {r}% compounded annually for {y} years. Final value, nearest \u01921?',zh:'\u0192{p} \u6309 {r}% \u5e74\u590d\u5229\u8ba1 {y} \u5e74\u3002\u7ec8\u503c\u53d6\u6574\u5230 \u01921\uff1f'},
  'casino.math.q.pnl':{en:'Bought {q} at \u0192{b}, sold at \u0192{s}. Net profit?',zh:'\u4ee5 \u0192{b} \u4e70\u5165 {q} \u5355\u4f4d\uff0c\u4ee5 \u0192{s} \u5356\u51fa\u3002\u51c0\u5229\u6da6\uff1f'},
  'casino.math.q.margin':{en:'Cost \u0192{c}, sells for \u0192{s}. Margin percent, nearest 1%?',zh:'\u6210\u672c \u0192{c}\uff0c\u552e\u4ef7 \u0192{s}\u3002\u5229\u6da6\u7387\u767e\u5206\u6bd4\uff0c\u53d6\u6574\uff1f'},
  'casino.math.q.feeNet':{en:'Gross \u0192{g} less a {f}% guild fee. Net received?',zh:'\u6bdb\u6536\u5165 \u0192{g}\uff0c\u6263\u9664 {f}% \u5546\u4f1a\u624b\u7eed\u8d39\u3002\u5b9e\u6536\u591a\u5c11\uff1f'},
  'casino.math.q.breakeven':{en:'Bought {q} at \u0192{b}. With a {f}% sale fee, break even sale price, 2 dp?',zh:'\u4ee5 \u0192{b} \u4e70\u5165 {q} \u5355\u4f4d\u3002\u9500\u552e\u624b\u7eed\u8d39 {f}%\uff0c\u4fdd\u672c\u5356\u4ef7\uff08\u4e24\u4f4d\u5c0f\u6570\uff09\uff1f'},
  'tab.market':{en:'Market',zh:'市场'},
  'tab.heat':{en:'🔥 Heat',zh:'🔥 热力'},
  'tab.pnl':{en:'P&L',zh:'盈亏'},
  'tab.casino':{en:'Casino',zh:'赌场'},
  'tab.guild':{en:'⚖ Capital Houses',zh:'⚖ 资本商号'},
  'tab.store':{en:'Store',zh:'商店'},
  'tab.galactic':{en:'⬡ Galaxy',zh:'⬡ 星系'},
  'tab.mining':{en:'⛏ Mining',zh:'⛏ 采矿'},
  'tab.fleshbook':{en:'📣 Fleshbook',zh:'📣 血肉簿'},
  'tab.arena':{en:'🃏 Corpo-Cards',zh:'🃏 企业卡牌'},
  'tab.devlogs':{en:'📺 Dev Logs',zh:'📺 开发日志'},
  'tab.bugs':{en:'🐛 Bugs',zh:'🐛 缺陷'},
  // ── Mobile shell (v1.3.0). Icons live in the markup, so these strings carry
  //    no emoji; the tab.* equivalents above do, and would double up on a tile.
  'mob.eod':{en:'END OF DAY',zh:'日终'},
  'mob.nav.market':{en:'Market',zh:'市场'},
  'mob.nav.board':{en:'Board',zh:'行情'},
  'mob.nav.chat':{en:'Chat',zh:'聊天'},
  'mob.nav.wallet':{en:'Wallet',zh:'钱包'},
  'mob.nav.more':{en:'More',zh:'更多'},
  'mob.seg.companies':{en:'Companies',zh:'企业'},
  'mob.seg.news':{en:'News',zh:'新闻'},
  'mob.seg.heat':{en:'Heat',zh:'热力'},
  'mob.seg.pnl':{en:'P&L',zh:'盈亏'},
  'mob.seg.wire':{en:'Wire',zh:'汇款'},
  'mob.seg.ranks':{en:'Ranks',zh:'排行榜'},
  'mob.sect.play':{en:'Play',zh:'玩法'},
  'mob.sect.read':{en:'Read',zh:'阅览'},
  'mob.sect.account':{en:'Account',zh:'账户'},
  'mob.tile.casino':{en:'Casino',zh:'赌场'},
  'mob.tile.galactic':{en:'Galaxy',zh:'星系'},
  'mob.tile.mining':{en:'Mining',zh:'采矿'},
  'mob.tile.arena':{en:'Corpo-Cards',zh:'企业卡牌'},
  'mob.tile.store':{en:'Store',zh:'商店'},
  'mob.tile.guild':{en:'Capital Houses',zh:'资本商号'},
  'mob.tile.fleshbook':{en:'Fleshbook',zh:'血肉簿'},
  'mob.tile.devlogs':{en:'Dev Logs',zh:'开发日志'},
  'mob.tile.lore':{en:'Lore Events',zh:'纪事'},
  'mob.tile.inventory':{en:'Inventory',zh:'库存'},
  'mob.tile.titles':{en:'Titles',zh:'称号'},
  'mob.tile.bugs':{en:'Bugs',zh:'缺陷'},
  // ── Mobile shell (v1.3.6). Systems with no touch control scheme.
  'mob.lock.tag':{en:'DESKTOP ONLY',zh:'仅限桌面端'},
  'mob.lock.mining':{en:'Needs a mouse and keyboard. Play on desktop.',zh:'需要鼠标和键盘。请在桌面端游玩。'},
  'mob.lock.miningLong':{en:'Drone Mining is a mouse aimed, keyboard flown game. There is no touch control scheme for it yet, so it is disabled on this device. Your bank and the leaderboard below stay live. Launch a run from a desktop browser.',zh:'无人机采矿需要鼠标瞄准、键盘操纵。目前尚无触屏操作方案，因此在本设备上已停用。您的存款与下方排行榜仍然实时更新。请在桌面端浏览器中出击。'},
  'ph.search':{en:'Search symbol or name',zh:'搜索代码或名称'},
  'ph.chat':{en:'Say something… @mention',zh:'说点什么… @提及'},
  'btn.send':{en:'Send',zh:'发送'},
  'btn.contacts':{en:'☎ Contacts',zh:'☎ 联系人'},
  'mv.coalition':{en:'Coalition',zh:'联盟'},
  'mv.jade':{en:'◈ Jade Exchange',zh:'◈ 玉环交易所'},
  'panel.companies':{en:'Companies',zh:'企业'},
  'panel.jade':{en:'Jade Exchange',zh:'玉环交易所'},
  'sec.exposure':{en:'Sector Exposure',zh:'板块敞口'},
  'sec.heatmap':{en:'Market Heatmap, % change today',zh:'市场热力图，今日涨跌幅'},
  'sec.capitalHouses':{en:'Capital Houses',zh:'资本商号'},
  'sec.mining':{en:'Mining',zh:'采矿'},
  'sec.heat':{en:'Heat',zh:'热力'},
  'sec.shippingLanes':{en:'Shipping Lanes',zh:'运输航线'},
  'lane.corporate':{en:'Corporate',zh:'企业'},
  'lane.grey':{en:'Grey Market',zh:'灰市'},
  'lane.dark':{en:'Dark Net',zh:'暗网'},
  'lane.contested':{en:'Contested',zh:'争夺'},
  'news.breaking':{en:'⚠ BREAKING',zh:'⚠ 突发'},
  'news.live':{en:'◢ LIVE NEWSFEED',zh:'◢ 实时新闻'},
  'news.wire':{en:'REALTIME MARKET WIRE',zh:'实时市场电讯'},
  'ph.symOrder':{en:'Symbol (e.g. ORGX)',zh:'代码（例：ORGX）'},
  'btn.buy':{en:'Buy',zh:'买入'},
  'btn.sell':{en:'Sell',zh:'卖出'},
  'btn.short':{en:'⬇ Short',zh:'⬇ 做空'},
  'sec.limitOrders':{en:'Limit Orders',zh:'限价单'},
  'opt.buy':{en:'BUY',zh:'买入'},
  'opt.sell':{en:'SELL',zh:'卖出'},
  'ph.symShort':{en:'Symbol',zh:'代码'},
  'ph.qty':{en:'Qty',zh:'数量'},
  'ph.limitPrice':{en:'Limit Ƒ',zh:'限价 Ƒ'},
  'btn.place':{en:'Place',zh:'下单'},
  'sec.liveTrades':{en:'Live Trades',zh:'实时成交'},
  'chat.global':{en:'Global',zh:'全球'},
  'chat.premium':{en:'Premium',zh:'高级'},
  'chat.guild':{en:'Merchants Guild',zh:'商会'},
  'chat.unmod':{en:'🔞 Unmod',zh:'🔞 无管制'},
  'chat.dunce':{en:'🎓 Dunce',zh:'🎓 差生'},
  'chat.wireCredits':{en:'Wire Credits',zh:'汇款'},
  'chat.leaderboard':{en:'Leaderboard',zh:'排行榜'},
  'chat.netWorth':{en:'NET WORTH',zh:'净资产'},
  'chat.taxNote':{en:'* Standard 2% transfer tax applies. Transfers exceeding Ƒ10,000 are subject to 90% taxation by the Merchant Guild.',zh:'* 适用标准2%转账税。超过 Ƒ10,000 的转账由商会课以90%的税。'},
  'ph.recipient':{en:'Recipient name',zh:'收款人姓名'},
  'btn.wire':{en:'Wire',zh:'汇款'},
  'gstab.map':{en:'⬡ Sector Map',zh:'⬡ 星区图'},
  'gstab.markets':{en:'💱 Markets',zh:'💱 市场'},
  'gstab.shipping':{en:'💀 Smuggling',zh:'💀 走私'},
  'gstab.contracts':{en:'📋 Contracts',zh:'📋 合约'},
  'gstab.factions':{en:'◈ Factions',zh:'◈ 阵营'},
  'gstab.cities':{en:'🏙 Cities',zh:'🏙 城市'},
  // ── Casino: Blackjack + Horse Races (localized 1.2.5.4) ──
  'casino.bj.title':{en:'Blackjack',zh:'21点'},
  'casino.bj.stack':{en:'Stack:',zh:'筹码：'},
  'casino.bj.shoeStatus':{en:'🂠 Shoe Status',zh:'🂠 牌靴状态'},
  'casino.bj.shoeInit':{en:'6 decks · 312 cards',zh:'6 副牌 · 312 张'},
  'casino.bj.shuffling':{en:'Shuffling New Shoe…',zh:'正在洗新牌靴…'},
  'casino.bj.dealer':{en:'Dealer',zh:'庄家'},
  'casino.bj.yourHand':{en:'Your hand',zh:'你的手牌'},
  'casino.bj.bet':{en:'Bet:',zh:'下注：'},
  'casino.bj.max':{en:'MAX',zh:'最大'},
  'casino.bj.deal':{en:'Deal',zh:'发牌'},
  'casino.bj.hit':{en:'Hit',zh:'要牌'},
  'casino.bj.stand':{en:'Stand',zh:'停牌'},
  'casino.bj.double':{en:'Double',zh:'加倍'},
  'casino.bj.rules':{en:'6-deck shoe · Dealer stands soft 17 · Blackjack 3:2 · No splits/insurance · Shoe reshuffles at cut card',zh:'6 副牌靴 · 庄家软17停牌 · 21点赔率3:2 · 不可分牌/保险 · 到切牌位重洗'},
  'casino.bj.shoeFmt':{en:'{d}d · {pct}% dealt · {left} left',zh:'{d}副 · 已发{pct}% · 剩{left}张'},
  'casino.bj.cutShuffle':{en:'✦ Cut card reached, shuffling new shoe…',zh:'✦ 已到切牌位，正在洗新牌靴…'},
  'casino.bj.pushBothBJ':{en:'Push, both Blackjack!',zh:'平局，双方均为21点！'},
  'casino.bj.pushBothBJLog':{en:'Push (both BJ).',zh:'平局（双方均为21点）。'},
  'casino.bj.blackjackWin':{en:'BLACKJACK! +{amt}',zh:'21点！+{amt}'},
  'casino.bj.blackjackWinLog':{en:'Blackjack! +{amt}',zh:'21点！+{amt}'},
  'casino.bj.dealerBJ':{en:'Dealer Blackjack, You lose.',zh:'庄家21点，你输了。'},
  'casino.bj.dealerBJLog':{en:'Dealer BJ. -{amt}',zh:'庄家21点。-{amt}'},
  'casino.bj.bust':{en:'BUST, You lose.',zh:'爆牌，你输了。'},
  'casino.bj.bustLog':{en:'Bust. -{amt}',zh:'爆牌。-{amt}'},
  'casino.bj.win':{en:'You win! +{amt}',zh:'你赢了！+{amt}'},
  'casino.bj.winLog':{en:'Win. +{amt}',zh:'赢。+{amt}'},
  'casino.bj.pushReturn':{en:'Push, Bet returned.',zh:'平局，退回本金。'},
  'casino.bj.dealerWins':{en:'Dealer wins, You lose.',zh:'庄家胜，你输了。'},
  'casino.bj.pushLog':{en:'Push.',zh:'平局。'},
  'casino.bj.loseLog':{en:'Lose. -{amt}',zh:'输。-{amt}'},
  'casino.bj.insufficient':{en:'Insufficient funds.',zh:'余额不足。'},
  'casino.bj.betLog':{en:'Bet {amt}.',zh:'下注 {amt}。'},
  'casino.bj.notEnoughDouble':{en:'Not enough to double.',zh:'余额不足以加倍。'},
  'casino.bj.doubleLog':{en:'Double down, bet now {amt}.',zh:'加倍，当前注额 {amt}。'},
  'casino.common.stale':{en:'Casino updated, refresh (Ctrl+Shift+R).',zh:'赌场已更新，请刷新（Ctrl+Shift+R）。'},
  'casino.common.betRejected':{en:'Bet rejected: {err}',zh:'下注被拒绝：{err}'},
  'casino.common.doubleRejected':{en:'Double rejected: {err}',zh:'加倍被拒绝：{err}'},
  'casino.horse.placeBet':{en:'◈ Place a bet and start the race',zh:'◈ 下注并开始比赛'},
  'casino.horse.race':{en:'▶ RACE',zh:'▶ 开始'},
  'casino.horse.payoutBlurb':{en:'5x payout · 16.7% house edge · one bet per race',zh:'5倍派彩 · 16.7%庄家优势 · 每场限一注'},
  'casino.horse.enterBet':{en:'Enter a valid bet amount.',zh:'请输入有效的下注金额。'},
  'casino.horse.insufficient':{en:'Insufficient balance.',zh:'余额不足。'},
  'casino.horse.winLog':{en:'WIN  #{n} {name}  +{amt}',zh:'赢  #{n} {name}  +{amt}'},
  'casino.horse.winnerStatus':{en:'◆ WINNER: #{n} {name}   PAYOUT: {amt}',zh:'◆ 优胜：#{n} {name}   派彩：{amt}'},
  'casino.horse.lossLog':{en:'LOSS  Winner: #{n} {name}',zh:'输  优胜：#{n} {name}'},
  'casino.horse.loserStatus':{en:'◆ Winner: #{n} {name}, better luck next race',zh:'◆ 优胜：#{n} {name}，下一场再接再厉'},
  'casino.horse.racingStatus':{en:'◈ Racing…  You picked #{n} ({name})  Bet: {amt}',zh:'◈ 比赛中…  你选了 #{n}（{name}）  注额：{amt}'},
  // ── Casino: shared chrome (1.2.5.5) ──
  'casino.common.balance':{en:'Balance:',zh:'余额：'},
  'casino.common.onTable':{en:'On table:',zh:'台面：'},
  'casino.common.chip':{en:'CHIP',zh:'筹码'},
  'casino.common.max':{en:'Max',zh:'最大'},
  'casino.common.clear':{en:'Clear',zh:'清除'},
  'casino.common.placeBetFirst':{en:'Place a bet first.',zh:'请先下注。'},
  'casino.common.netNotReady':{en:'Casino net not ready - refresh.',zh:'赌场网络未就绪，请刷新。'},
  'casino.common.insufficient':{en:'Insufficient funds.',zh:'余额不足。'},
  'casino.common.rejected':{en:'Rejected: {err}',zh:'已拒绝：{err}'},
  'casino.common.bannerWin':{en:'W {head}, won {net} (paid {paid})',zh:'赢 {head}，赢得 {net}（派彩 {paid}）'},
  'casino.common.bannerLose':{en:'L {head}, lost {stake}',zh:'输 {head}，输掉 {stake}'},
  // ── Casino: Baccarat (1.2.5.5) ──
  'casino.bacc.player':{en:'Player',zh:'闲'},
  'casino.bacc.banker':{en:'Banker',zh:'庄'},
  'casino.bacc.tie':{en:'Tie',zh:'和'},
  'casino.bacc.ppair':{en:'Player Pair',zh:'闲对'},
  'casino.bacc.bpair':{en:'Banker Pair',zh:'庄对'},
  'casino.bacc.pUp':{en:'PLAYER',zh:'闲'},
  'casino.bacc.bUp':{en:'BANKER',zh:'庄'},
  'casino.bacc.tUp':{en:'TIE',zh:'和'},
  'casino.bacc.natural':{en:' (natural)',zh:'（天牌）'},
  'casino.bacc.deal':{en:'Deal',zh:'发牌'},
  'casino.bacc.bannerPush':{en:'{head}, {net} (push {paid})',zh:'{head}，{net}（退回 {paid}）'},
  'casino.bacc.pPairTag':{en:' P-pair',zh:' 闲对'},
  'casino.bacc.bPairTag':{en:' B-pair',zh:' 庄对'},
  'casino.bacc.dotP':{en:'P',zh:'闲'},
  'casino.bacc.dotB':{en:'B',zh:'庄'},
  'casino.bacc.dotT':{en:'T',zh:'和'},
  // ── Casino: Sic Bo (1.2.5.5) ──
  'casino.sicbo.roll':{en:'Roll',zh:'掷骰'},
  'casino.sicbo.placeBets':{en:'Place your bets',zh:'请下注'},
  'casino.sicbo.rolling':{en:'Rolling...',zh:'掷骰中…'},
  'casino.sicbo.totalLbl':{en:'Total',zh:'总点数'},
  'casino.sicbo.tripleTag':{en:' (triple)',zh:'（围骰）'},
  'casino.sicbo.rollHead':{en:'Roll {dice} = {total}',zh:'掷出 {dice} = {total}'},
  'casino.sicbo.small':{en:'Small (4-10)',zh:'小 (4-10)'},
  'casino.sicbo.odd':{en:'Odd',zh:'单'},
  'casino.sicbo.even':{en:'Even',zh:'双'},
  'casino.sicbo.big':{en:'Big (11-17)',zh:'大 (11-17)'},
  'casino.sicbo.anyTriple':{en:'Any triple',zh:'任意围骰'},
  'casino.sicbo.secEven':{en:'Even money',zh:'平赔'},
  'casino.sicbo.secSingle':{en:'Single number (pays by count)',zh:'单骰（按次数派彩）'},
  'casino.sicbo.secDouble':{en:'Specific double',zh:'指定对子'},
  'casino.sicbo.secTriple':{en:'Triple',zh:'围骰'},
  'casino.sicbo.secTotal':{en:'Total sum',zh:'点数总和'},
  'casino.sicbo.secCombo':{en:'Two-dice combo',zh:'两骰组合'},
  // ── Casino: Poker (Texas Hold'em) (1.2.5.6) ──
  'casino.poker.title':{en:'Texas Hold’em, 6-max vs AI',zh:'德州扑克，6人桌对战AI'},
  'casino.poker.stack':{en:'Stack:',zh:'筹码：'},
  'casino.poker.blind':{en:'Blind:',zh:'盲注：'},
  'casino.poker.pot':{en:'Pot:',zh:'底池：'},
  'casino.poker.opponents':{en:'OPPONENTS',zh:'对手'},
  'casino.poker.community':{en:'Community',zh:'公共牌'},
  'casino.poker.yourHand':{en:'Your Hand',zh:'你的手牌'},
  'casino.poker.bet':{en:'Bet:',zh:'下注：'},
  'casino.poker.allin':{en:'ALL-IN',zh:'全下'},
  'casino.poker.dealHand':{en:'Deal Hand',zh:'发牌'},
  'casino.poker.fold':{en:'Fold',zh:'弃牌'},
  'casino.poker.check':{en:'Check',zh:'过牌'},
  'casino.poker.call':{en:'Call',zh:'跟注'},
  'casino.poker.betRaise':{en:'Bet/Raise',zh:'下注/加注'},
  'casino.poker.callAmt':{en:'Call Ƒ{amt}',zh:'跟注 Ƒ{amt}'},
  'casino.poker.seatFolded':{en:'folded',zh:'弃牌'},
  'casino.poker.seatAllin':{en:'ALL-IN',zh:'全下'},
  'casino.poker.seatBet':{en:'bet: Ƒ{amt}',zh:'下注: Ƒ{amt}'},
  'casino.poker.you':{en:'You',zh:'你'},
  'casino.poker.streetPreflop':{en:'Preflop',zh:'翻牌前'},
  'casino.poker.streetFlop':{en:'Flop',zh:'翻牌'},
  'casino.poker.streetTurn':{en:'Turn',zh:'转牌'},
  'casino.poker.streetRiver':{en:'River',zh:'河牌'},
  'casino.poker.streetShowdown':{en:'Showdown',zh:'摊牌'},
  'casino.poker.rankRoyalFlush':{en:'Royal Flush',zh:'皇家同花顺'},
  'casino.poker.rankStraightFlush':{en:'Straight Flush',zh:'同花顺'},
  'casino.poker.rankFourKind':{en:'Four of a Kind',zh:'四条'},
  'casino.poker.rankFullHouse':{en:'Full House',zh:'葫芦'},
  'casino.poker.rankFlush':{en:'Flush',zh:'同花'},
  'casino.poker.rankStraight':{en:'Straight',zh:'顺子'},
  'casino.poker.rankThreeKind':{en:'Three of a Kind',zh:'三条'},
  'casino.poker.rankTwoPair':{en:'Two Pair',zh:'两对'},
  'casino.poker.rankPair':{en:'Pair',zh:'一对'},
  'casino.poker.rankHighCard':{en:'High Card',zh:'高牌'},
  'casino.poker.showdownHead':{en:'--- Showdown ---',zh:'--- 摊牌 ---'},
  'casino.poker.noContest':{en:'No contestants, pot returned.',zh:'无人参与，退回底池。'},
  'casino.poker.splitPot':{en:'Split pot! {names}, {rank}, Ƒ{share} each',zh:'平分底池！{names}，{rank}，各得 Ƒ{share}'},
  'casino.poker.youWinWith':{en:'You win with {rank}!',zh:'你以{rank}获胜！'},
  'casino.poker.aiWinsWith':{en:'{name} wins with {rank}',zh:'{name} 以{rank}获胜'},
  'casino.poker.resultWin':{en:'🏆 {msg} +Ƒ{pot}',zh:'🏆 {msg} +Ƒ{pot}'},
  'casino.poker.youWinAmt':{en:'You win Ƒ{pot}.',zh:'你赢得 Ƒ{pot}。'},
  'casino.poker.resultLose':{en:'💀 {msg} -Ƒ{pot}',zh:'💀 {msg} -Ƒ{pot}'},
  'casino.poker.resultPush':{en:'🤝 {msg}',zh:'🤝 {msg}'},
  'casino.poker.needBuyin':{en:'Need at least Ƒ{buyin} to play.',zh:'至少需要 Ƒ{buyin} 才能游戏。'},
  'casino.poker.handHead':{en:'--- Hand #{n} | Blinds Ƒ{sb}/Ƒ{bb} ---',zh:'--- 第 {n} 手 | 盲注 Ƒ{sb}/Ƒ{bb} ---'},
  'casino.poker.blindsUp':{en:'🔔 Blinds increase to Ƒ{sb}/Ƒ{bb}',zh:'🔔 盲注提升至 Ƒ{sb}/Ƒ{bb}'},
  'casino.poker.aiFoldsPre':{en:'{name} folds preflop.',zh:'{name} 翻牌前弃牌。'},
  'casino.poker.aiRaisesPre':{en:'{name} raises Ƒ{amt}.',zh:'{name} 加注 Ƒ{amt}。'},
  'casino.poker.aiFolds':{en:'{name} folds.',zh:'{name} 弃牌。'},
  'casino.poker.aiBetsRaises':{en:'{name} bets/raises Ƒ{amt}. Pot: Ƒ{pot}',zh:'{name} 下注/加注 Ƒ{amt}。底池：Ƒ{pot}'},
  'casino.poker.aiCalls':{en:'{name} calls Ƒ{amt}.',zh:'{name} 跟注 Ƒ{amt}。'},
  'casino.poker.aiChecks':{en:'{name} checks.',zh:'{name} 过牌。'},
  'casino.poker.allFoldedWin':{en:'All opponents folded! You win!',zh:'所有对手弃牌！你赢了！'},
  'casino.poker.aiWinsFold':{en:'{name} wins, everyone else folded.',zh:'{name} 获胜，其余全部弃牌。'},
  'casino.poker.aiWinsAllFold':{en:'{name} wins, everyone folded.',zh:'{name} 获胜，全部弃牌。'},
  'casino.poker.flopHead':{en:'--- Flop: {cards} ---',zh:'--- 翻牌：{cards} ---'},
  'casino.poker.turnHead':{en:'--- Turn: {card} ---',zh:'--- 转牌：{card} ---'},
  'casino.poker.riverHead':{en:'--- River: {card} ---',zh:'--- 河牌：{card} ---'},
  'casino.poker.youFold':{en:'You fold.',zh:'你弃牌。'},
  'casino.poker.allFoldReturn':{en:'Everyone folded, pot returned.',zh:'全部弃牌，退回底池。'},
  'casino.poker.cannotCheck':{en:'Cannot check, call or fold.',zh:'无法过牌，请跟注或弃牌。'},
  'casino.poker.youCheck':{en:'You check.',zh:'你过牌。'},
  'casino.poker.youCall':{en:'You call Ƒ{amt}.',zh:'你跟注 Ƒ{amt}。'},
  'casino.poker.invalidRaise':{en:'Invalid raise amount.',zh:'无效的加注金额。'},
  'casino.poker.youRaise':{en:'You raise Ƒ{amt}. Pot: Ƒ{pot}',zh:'你加注 Ƒ{amt}。底池：Ƒ{pot}'},
  'casino.poker.welcome':{en:'Welcome to Texas Hold’em. 6-max vs 5 AI opponents.',zh:'欢迎来到德州扑克。6人桌，对战5名AI对手。'},
  'casino.poker.postBlind':{en:'You post small blind. Press Deal to start.',zh:'你缴纳小盲注。按发牌开始。'},

  // ── Smuggling subtab (Galaxy > Smuggling). Glyphs stay outside the keys. ──
  'smug.title':{en:'Smuggling Operations',zh:'走私行动'},
  'smug.subtitle':{en:'Stake credits on a contraband run. Hire guards to cut the odds, but if the run is caught, the guards die with the cargo. No refunds.',zh:'押上信用点进行一次违禁品运输。雇佣护卫可以降低被查获的概率，但一旦运输被拦截，护卫会与货物一同损失。概不退还。'},
  'smug.runInProgress':{en:'Run In Progress',zh:'运输进行中'},
  'smug.stakeColon':{en:'Stake:',zh:'本金：'},
  'smug.guardsWord':{en:'Guards',zh:'护卫'},
  'smug.enRouteSec':{en:'EN ROUTE, {s}s...',zh:'运输中，{s}秒...'},
  'smug.enRouteRemain':{en:'EN ROUTE, {s}s remaining...',zh:'运输中，剩余 {s} 秒...'},
  'smug.resolving':{en:'Resolving...',zh:'结算中...'},
  'smug.selectRoute':{en:'Select Route',zh:'选择航线'},
  'smug.contraband':{en:'Contraband',zh:'违禁品'},
  'smug.stakeLabel':{en:'Stake',zh:'本金'},
  'smug.stakePh':{en:'Ƒ amount',zh:'Ƒ 金额'},
  'smug.guardEscort':{en:'Guard Escort',zh:'护卫队'},
  'smug.guardEscortNote':{en:'cuts risk, fee lost if caught',zh:'降低风险，被查获时费用不退'},
  'smug.riskWord':{en:'risk',zh:'风险'},
  'smug.feeWord':{en:'fee',zh:'费用'},
  'smug.free':{en:'free',zh:'免费'},
  'smug.syndTip':{en:'Syndicate: +15% payout, +5% risk on own turf',zh:'辛迪加：+15% 赔付，本方地盘 +5% 风险'},
  'smug.estRisk':{en:'Estimated Risk',zh:'预估风险'},
  'smug.baseCargo':{en:'base + cargo',zh:'基础 + 货物'},
  'smug.dBet':{en:'bet-size',zh:'注额'},
  'smug.dTension':{en:'tension',zh:'紧张度'},
  'smug.dFaction':{en:'faction',zh:'派系'},
  'smug.dSyndTurf':{en:'synd turf',zh:'辛迪加地盘'},
  'smug.dGuards':{en:'guards',zh:'护卫'},
  'smug.blockadeShort':{en:'+blockade',zh:'+封锁'},
  'smug.potentialPayout':{en:'Potential Payout',zh:'潜在赔付'},
  'smug.guardFee':{en:'Guard Fee',zh:'护卫费'},
  'smug.totalAtRisk':{en:'Total At Risk',zh:'总风险敞口'},
  'smug.evRun':{en:'EV / Run',zh:'单次期望值'},
  'smug.launch':{en:'Launch Smuggling Run',zh:'启动走私运输'},
  'smug.howFactions':{en:'How Factions Affect Smuggling',zh:'派系如何影响走私'},
  'smug.facSyndicate':{en:'Syndicate',zh:'辛迪加'},
  'smug.facVoid':{en:'Void',zh:'虚空'},
  'smug.facTension':{en:'Tension',zh:'紧张度'},
  'smug.facBlockades':{en:'Blockades',zh:'封锁'},
  'smug.facGuards':{en:'Guards',zh:'护卫'},
  'smug.facLaneShares':{en:'Lane Shares',zh:'航线份额'},
  'smug.tipSynd':{en:'+15% payout, but +5% risk on own turf. No free rides.',zh:'+15% 赔付，但在本方地盘风险 +5%。没有白拿的好处。'},
  'smug.tipVoid':{en:'Earns 2% of all intercepted cargo as raid income.',zh:'从所有被截获的货物中抽取 2% 作为劫掠收入。'},
  'smug.tipTension':{en:'High tension HELPS smugglers (chaos is cover).',zh:'高紧张度对走私者有利（混乱即掩护）。'},
  'smug.tipBlockades':{en:'Smuggling still runs, +10% risk.',zh:'封锁期间走私仍可进行，风险 +10%。'},
  'smug.tipGuards':{en:'Cut interception odds, but the fee is gone if you are caught.',zh:'降低拦截概率，但被查获时费用不退。'},
  'smug.tipLaneShares':{en:'Shareholders earn a cut of your profit.',zh:'股东从你的利润中分成。'},
  'smug.runHistory':{en:'Run History',zh:'运输记录'},
  'smug.noRuns':{en:'No runs yet',zh:'暂无运输记录'},
  'smug.cleared':{en:'CLEARED',zh:'已通关'},
  'smug.seized':{en:'SEIZED',zh:'被查获'},
  'smug.loginFirst':{en:'Log in first',zh:'请先登录'},
  'smug.minStake':{en:'Min stake: Ƒ100',zh:'最低本金：Ƒ100'},
  'smug.clearedToast':{en:'Smuggling cleared! +Ƒ{amt} ({cargo})',zh:'走私成功！+Ƒ{amt}（{cargo}）'},
  'smug.interceptedToast':{en:'INTERCEPTED! Lost Ƒ{amt}',zh:'被拦截！损失 Ƒ{amt}'},
  'smug.plusGuardFee':{en:' + Ƒ{amt} guards',zh:' + Ƒ{amt} 护卫费'},
  'smug.seizedSuffix':{en:', {cargo} seized',zh:'，{cargo} 被没收'},
  'smug.launchedToast':{en:'Smuggling run launched, {cargo} via {lane} lane',zh:'走私运输已启动，{cargo}，经由{lane}航线'},
  'smug.errorGeneric':{en:'Smuggling error',zh:'走私错误'},
  'smug.deliveredStatus':{en:'Delivered {cargo}, Ƒ{amt} earned ({risk}% risk)',zh:'已送达 {cargo}，获得 Ƒ{amt}（风险 {risk}%）'},
  'smug.interceptedStatus':{en:'Intercepted, Ƒ{amt} lost ({risk}% risk)',zh:'被拦截，损失 Ƒ{amt}（风险 {risk}%）'},
  'ship.deliveredToast':{en:'Shipping delivered! +Ƒ{amt} ({cargo})',zh:'运输已送达！+Ƒ{amt}（{cargo}）'},
  'ship.insuredToast':{en:'Cargo lost but INSURED, only lost Ƒ{amt} premium',zh:'货物损失但已投保，仅损失 Ƒ{amt} 保费'},
  'ship.lostToast':{en:'CARGO LOST! Ƒ{amt} gone, no insurance',zh:'货物损失！Ƒ{amt} 全损，无保险'},

  // ── Store: player titles ──
  'title.equip':{en:'Equip',zh:'装备'},
  'title.equipped':{en:'Equipped',zh:'已装备'},
  'title.unequip':{en:'Unequip',zh:'卸下'},
  'title.buy':{en:'Buy',zh:'购买'},
  'title.locked':{en:'Locked',zh:'已锁定'},
  'title.inOffice':{en:'In Office',zh:'在任'},
  'title.seizeOffice':{en:'Seize Office',zh:'夺取职位'},
  'title.claimOffice':{en:'Claim Office',zh:'就任'},
  'title.currentlyHeldBy':{en:'CURRENTLY HELD BY:',zh:'现任持有者：'},
  'title.presidentPerks':{en:'+15,000 \u0191 / 30 MIN  \u00b7  NEON BLUE CHAT  \u00b7  MARKET RALLY ON ELECTION  \u00b7  TITLE STRIPPED ON OVERTHROW',zh:'+15,000 \u0191 / 30 分钟  \u00b7  霓虹蓝聊天  \u00b7  当选时市场上涨  \u00b7  被推翻时剥夺头衔'},

  // ── Capital Houses (funds panel) ──
  'fnd.capitalHouse':{en:'Capital House',zh:'资本门阀'},
  'fnd.emptyHouse':{en:'Empty house',zh:'空门阀'},
  'fnd.noHoldings':{en:'No holdings in',zh:'无持仓：'},
  'fnd.noHoldingsFilter':{en:'No holdings match filter',zh:'没有符合筛选的持仓'},
  'fnd.noPositions':{en:'No positions',zh:'无持仓'},
  'fnd.joinFund':{en:'Join Fund',zh:'加入基金'},
  'fnd.freeToJoin':{en:'Free to join, deposit anytime',zh:'免费加入，随时存入'},
  'fnd.fundTradeOwner':{en:'Fund Trade (Owner Override)',zh:'基金交易（所有者强制）'},
  'fnd.fundTrade':{en:'Fund Trade',zh:'基金交易'},
  'fnd.execOwnerTrades':{en:'Executive, owner trades directly',zh:'执行层，所有者直接交易'},
  'fnd.vetoGolden':{en:'Veto (Golden)',zh:'否决（金股）'},
  'fnd.forceCall':{en:'Force Call',zh:'强制表决'},
  'fnd.goldenShare':{en:'Golden share',zh:'金股'},
  'fnd.becomePatron':{en:'Become a Patron',zh:'成为赞助者'},
  'fnd.linkAccount':{en:'Link Account',zh:'关联账号'},
  'fnd.patreonPerk':{en:'Patreon tier, Capital House access + member perks. patreon.com/FLSH',zh:'Patreon 等级，资本门阀准入 + 会员特权。patreon.com/FLSH'},
  'fnd.patreonOpens':{en:'Opens patreon.com/FLSH, membership unlocks the Guild',zh:'打开 patreon.com/FLSH，会员资格解锁公会'},
  'fnd.enterWithdrawAmt':{en:'Enter an amount to withdraw',zh:'请输入要提取的金额'},
  'fnd.enterMemberAmt':{en:'Enter member name and amount',zh:'请输入成员名称与金额'},
  'fnd.enterInvite':{en:'Enter player name to invite',zh:'请输入要邀请的玩家名称'},
  'fnd.symbolQtyRequired':{en:'Symbol and qty required',zh:'需要填写代码与数量'},
  'fnd.enterMemberName':{en:'Enter a member name',zh:'请输入成员名称'},
  'fnd.dunceCorner':{en:'You are in the dunce corner.',zh:'你正在惩罚角。'},
  'fnd.enterValidEmail':{en:'Enter a valid email.',zh:'请输入有效的电子邮箱。'},
  'fnd.loginFirst':{en:'Log in first.',zh:'请先登录。'},
  'fnd.failedToLink':{en:'Failed to link.',zh:'关联失败。'},
  'fnd.serverUnreachable':{en:'Server unreachable.',zh:'无法连接服务器。'},
  'fnd.newFundName':{en:'New fund name (3-40 chars):',zh:'新基金名称（3 至 40 个字符）：'},
  'fnd.newDescription':{en:'New description (optional, max 200 chars):',zh:'新简介（可选，最多 200 个字符）：'},
  'fnd.areYouSure':{en:'Are you sure? This cannot be undone.',zh:'确定吗？此操作无法撤销。'},

  // ── Market tools (watchlist, news filter, company detail) ──
  'mt.addWatch':{en:'Add to watchlist',zh:'加入自选'},
  'mt.removeWatch':{en:'Remove from watchlist',zh:'移出自选'},
  'mt.onlyWatchlisted':{en:'Show only watchlisted tickers',zh:'仅显示自选代码'},
  'mt.onlyWatchlistedNews':{en:'Show only news for your watchlisted tickers',zh:'仅显示自选代码的新闻'},
  'mt.filterNews':{en:'Filter news…',zh:'筛选新闻…'},
  'mt.hqColony':{en:'Headquarters colony',zh:'总部殖民地'},
  'mt.capitalHouseNav':{en:'Player-run Capital House, priced off NAV per share.',zh:'玩家运营的资本门阀，按每股净值定价。'},

  // ── P&L panel ──
  'pnl.filterTicker':{en:'Filter by ticker…',zh:'按代码筛选…'},
  'pnl.minPosition':{en:'Min position',zh:'最小持仓'},
  'pnl.exportCsv':{en:'Export CSV',zh:'导出 CSV'},
  'pnl.closeWinners':{en:'Close Winners',zh:'平掉盈利'},
  'pnl.closeLosers':{en:'Close Losers',zh:'平掉亏损'},
  'pnl.closeGreen':{en:'Close Green',zh:'平掉浮盈'},
  'pnl.exportFailed':{en:'Export failed:',zh:'导出失败：'},
  'pnl.closeWinnersFailed':{en:'Close winners failed:',zh:'平掉盈利失败：'},
  'pnl.closeLosersFailed':{en:'Close losers failed:',zh:'平掉亏损失败：'},
  'pnl.closeGreenFailed':{en:'Close green failed:',zh:'平掉浮盈失败：'},
  'pnl.unrealized':{en:'Unrealized P&L',zh:'未实现盈亏'},
  'pnl.dailyIncome':{en:'Daily Income',zh:'每日收入'},
  'pnl.equityCash':{en:'Equity & Cash',zh:'权益与现金'},
  'pnl.allocationNote':{en:'Holdings allocation (positions vs cash).',zh:'持仓配置（仓位与现金）。'},
  'pnl.tradeHistory':{en:'Trade History',zh:'交易历史'},
  'pnl.selectRow':{en:'Select a row',zh:'请选择一行'},
  'pnl.historyUnavailable':{en:'History unavailable.',zh:'历史记录不可用。'},
  'pnl.sellAll':{en:'Sell All',zh:'全部卖出'},
  'pnl.sellHalf':{en:'Sell \u00bd',zh:'卖出 \u00bd'},
  'pnl.sellQty':{en:'Sell Qty',zh:'按数量卖出'},
  'pnl.sellAmt':{en:'Sell $…',zh:'按金额卖出…'},
  'pnl.sellAllFailed':{en:'Sell all failed:',zh:'全部卖出失败：'},
  'pnl.sellHalfFailed':{en:'Sell \u00bd failed:',zh:'卖出 \u00bd 失败：'},
  'pnl.sellQtyFailed':{en:'Sell qty failed:',zh:'按数量卖出失败：'},
  'pnl.sellAmtFailed':{en:'Sell $ failed:',zh:'按金额卖出失败：'},
  'pnl.notAWinner':{en:'Not a winner.',zh:'该持仓并非盈利。'},

  // ── Auth ──
  'auth.newAccount':{en:'New Account',zh:'新建账号'},
  'auth.logIn':{en:'Log In',zh:'登录'},
  'auth.fillAllFields':{en:'Fill in all fields.',zh:'请填写所有字段。'},
  'auth.wrongCredentials':{en:'Wrong name or password.',zh:'名称或密码错误。'},
  'auth.loginFailed':{en:'Login failed.',zh:'登录失败。'},
  'auth.serverUnreachable':{en:'Server unreachable.',zh:'无法连接服务器。'},
  'auth.nameRequired':{en:'Name required.',zh:'必须填写名称。'},
  'auth.passwordMin':{en:'Password must be at least 4 characters.',zh:'密码至少需要 4 个字符。'},
  'auth.nameTaken':{en:'That name is taken.',zh:'该名称已被占用。'},
  'auth.passwordTooShort':{en:'Password too short (min 4).',zh:'密码过短（至少 4 个字符）。'},
  'auth.registrationFailed':{en:'Registration failed.',zh:'注册失败。'},

  // ── Header buttons ──
  'hdr.patreon':{en:'☆ Patreon',zh:'☆ Patreon'},
  'hdr.discord':{en:'◈ Discord',zh:'◈ Discord'},
  'hdr.bugs':{en:'🐛 Bugs',zh:'🐛 问题反馈'},
  'hdr.jade':{en:'◈ Jade',zh:'◈ 翡翠'},
  'hdr.tutorial':{en:'? Tutorial',zh:'? 教程'},
  'hdr.taxes':{en:'🏛 Taxes',zh:'🏛 税务'},
  'hdr.taxesTitle':{en:'Pay Taxes',zh:'缴纳税款'},

  // ── Flesh Revenue Service panel ──
  // "Capital House" is 4/4 split across the codebase between 资本商号 and
  // 资本门阀. 门阀 used here because the rest of the FINANCE surface
  // (fnd.capitalHouse, mt.capitalHouseNav) uses it, and because 商号 is already
  // carrying the city storefront and Jade House senses.
  'tax.title':{en:'🏛 FLESH REVENUE SERVICE',zh:'🏛 血肉税务局'},
  'tax.contacting':{en:'Contacting the FRS...',zh:'正在联系税务局...'},
  'tax.notAssessing':{en:'The FRS is not currently assessing income. There is nothing to pay.',zh:'税务局当前未对收入进行评估。无需缴纳。'},
  'tax.notScheduled':{en:'not scheduled',zh:'未安排'},
  'tax.ptSuffix':{en:' PT',zh:' 太平洋时间'},
  'tax.nextAssessment':{en:'Next assessment',zh:'下次评估'},
  'tax.incomeRate':{en:'Income tax rate',zh:'所得税率'},
  'tax.houseWithdrawRate':{en:'Capital house withdrawal tax',zh:'资本门阀提现税'},
  'tax.thisCycle':{en:'THIS CYCLE',zh:'本周期'},
  'tax.taxableNetWorth':{en:'Taxable net worth',zh:'应税净值'},
  'tax.gainSince':{en:'Gain since last assessment',zh:'上次评估以来的收益'},
  'tax.estNext':{en:'Estimated tax at next run',zh:'下次执行的预估税额'},
  'tax.lossCredit':{en:'Loss credit carried',zh:'结转的亏损抵扣'},
  'tax.balance':{en:'BALANCE',zh:'余额'},
  'tax.outstanding':{en:'Outstanding balance',zh:'未缴余额'},
  'tax.prepaidCredit':{en:'Prepaid credit',zh:'已预缴额度'},
  'tax.amountToPay':{en:'Amount to pay',zh:'缴纳金额'},
  'tax.pay':{en:'Pay',zh:'缴纳'},
  'tax.payAll':{en:'All',zh:'全部'},
  'tax.payAhead':{en:'PAY AHEAD',zh:'预缴税款'},
  'tax.prepaidBalance':{en:'FRS prepaid balance',zh:'税务局预缴余额'},
  'tax.prepayAmount':{en:'Prepay amount',zh:'预缴金额'},
  'tax.prepay':{en:'Prepay',zh:'预缴'},
  'tax.footer':{en:'This balance sits with the FRS like a deposit account and is drawn down by future weekly assessments before any of your cash is taken. Money held inside a capital house is taxed only when you withdraw it.',zh:'这笔余额如同存放在税务局的存款账户，今后每周的评估会先从中扣除，之后才动用你的现金。存放在资本门阀内的资金，只在提现时征税。'},

  // ── Ship manifest modal (galaxy deep-scan) ──
  'smm.close':{en:'✕ CLOSE',zh:'✕ 关闭'},
  'smm.route':{en:'Route',zh:'航线'},
  'smm.cargoTitle':{en:'Cargo Manifest, Intercepted',zh:'货物清单，已截获'},
  'smm.from':{en:'FROM',zh:'自'},
  'smm.to':{en:'TO',zh:'至'},
  'smm.header':{en:'FLESH STATION, INTERNAL TRANSIT LOG, VESSEL {id}, INTERCEPTED IN TRANSIT',zh:'血肉站，内部转运日志，船只 {id}，途中截获'},
  'smm.crew':{en:'CREW COMPLEMENT: {n} REGISTERED  //  MANIFEST EXTRACTED VIA FLESH STATION DEEP-SCAN, NOT VISIBLE TO CREW',zh:'船员编制：登记 {n} 人  //  清单经血肉站深层扫描提取，船员不可见'},
  'smm.emptyHold':{en:'Empty hold',zh:'空舱'},
  'smm.expunged':{en:'[LINE ITEM {n}: RECORD EXPUNGED]',zh:'[第 {n} 项：记录已抹除]'},

  // ── Dev Logs tab ──
  'dl.title':{en:'📺 DEV LOGS',zh:'📺 开发日志'},
  'dl.subtitle':{en:'Broadcasts, dev logs, lore and news',zh:'直播、开发日志、设定与新闻'},
  'dl.openChannel':{en:'Open channel',zh:'打开频道'},
  'dl.videos':{en:'▶ Videos',zh:'▶ 视频'},
  'dl.liveOnKick':{en:'🟢 Live on Kick',zh:'🟢 Kick 直播'},

  // ── Drone mining splash ──
  'dm.eyebrow':{en:'OPEN RANGE \u00b7 UNREGULATED EXTRACTION ZONE',zh:'开放星域 \u00b7 无管制开采区'},
  'dm.title':{en:'DRONE MINING',zh:'无人机采矿'},
  'dm.tagline':{en:'ONE SHOT \u00b7 ONE TANK \u00b7 ONE CHANCE',zh:'一次出击 \u00b7 一箱燃料 \u00b7 一次机会'},
  'dm.body1':{en:'Every faction agreed on one thing: the asteroid belts are where conflict happens. No treaty covers the open range. No safety board patrols the rocks. Mining drones meet other mining drones, and they go to war.',zh:'各派系只在一件事上达成了一致：冲突发生在小行星带。没有任何条约覆盖开放星域。没有任何安全委员会巡查这些岩块。采矿无人机遇上采矿无人机，然后开战。'},
  'dm.body2':{en:'You pilot a single drone through hostile belts. One fuel tank. One life. The deeper you push, the richer the ore and the heavier the opposition. Bring cargo back to the mothership to bank it. Come home alive and the drone itself refunds its build cost.',zh:'你驾驶一台无人机穿越充满敌意的矿带。一箱燃料。一条命。推进得越深，矿石越富，遭遇的抵抗也越重。把货物带回母舰才能入账。活着回来，无人机本身还会退还建造成本。'},
  'dm.currentBank':{en:'Current Bank',zh:'当前入账'},
  'dm.minimumLoadout':{en:'Minimum Loadout',zh:'最低装载'},
  'dm.droneRefund':{en:'Drone Refund',zh:'无人机退款'},
  'dm.refundLine':{en:'+Ƒ1,000 if drone survives the run',zh:'+Ƒ1,000，若无人机生还'},
  'dm.refundNote':{en:'if drone survives the run',zh:'若无人机生还'},
  'dm.factions':{en:'Factions',zh:'派系'},
  'dm.facCoalition':{en:'COALITION',zh:'联合体'},
  'dm.facSyndicate':{en:'SYNDICATE',zh:'辛迪加'},
  'dm.facVoid':{en:'VOID',zh:'虚空'},
  'dm.launch':{en:'⛏ LAUNCH EXPEDITION',zh:'⛏ 启动远征'},
  'dm.footer':{en:'Game opens in a fullscreen view. The in-game BACK button returns you here. Your bank syncs with your FleshMarket account.',zh:'游戏将以全屏视图打开。游戏内的返回按钮会带你回到此处。你的入账与 FleshMarket 账号同步。'},

  // ── Heatmap sector lore ──
  'hm.sec0':{en:'The Capital Syndicate',zh:'资本财团'},
  'hm.sec0sub':{en:'Banking, lending & exchange houses',zh:'银行、放贷与交易所'},
  'hm.sec1':{en:'Flesh & Gene Corps',zh:'血肉与基因集团'},
  'hm.sec1sub':{en:'Biomedical, pharma & augmentation firms',zh:'生物医学、制药与增强改造企业'},
  'hm.sec2':{en:'The Indemnity Brokers',zh:'赔付经纪行'},
  'hm.sec2sub':{en:'Risk underwriters & liability cartels',zh:'风险承保方与责任卡特尔'},
  'hm.sec3':{en:'The Iron Foundries',zh:'钢铁铸造厂'},
  'hm.sec3sub':{en:'Heavy manufacturing & industrial output',zh:'重型制造与工业产出'},
  'hm.sec4':{en:'Power Cartels',zh:'能源卡特尔'},
  'hm.sec4sub':{en:'Fuel, grid operators & energy monopolies',zh:'燃料、电网运营商与能源垄断'},
  'hm.sec5':{en:'The Transit Guild',zh:'运输公会'},
  'hm.sec5sub':{en:'Freight, shipping & supply infrastructure',zh:'货运、航运与补给基础设施'},
  'hm.sec6':{en:'Neural Networks Inc.',zh:'神经网络公司'},
  'hm.sec6sub':{en:'Software, hardware & data brokers',zh:'软件、硬件与数据经纪'},
  'hm.sec7':{en:'The Gray Bazaar',zh:'灰市集'},
  'hm.sec7sub':{en:'Unlisted, unclassified & shadow ventures',zh:'未上市、未归类与影子生意'},

  // ── Fleshbook ──
  'fb.title':{en:'FLESHBOOK',zh:'血肉簿'},
  'fb.publicFeed':{en:'PUBLIC FEED',zh:'公共信息流'},
  'fb.live':{en:'LIVE',zh:'实时'},
  'fb.composePh':{en:'Broadcast to the public feed',zh:'向公共信息流发布'},
  'fb.broadcast':{en:'BROADCAST',zh:'发布'},
  'fb.enterSends':{en:'enter sends',zh:'回车发送'},
  'fb.new':{en:'NEW',zh:'最新'},
  'fb.top':{en:'TOP',zh:'热门'},
  'fb.noBroadcasts':{en:'No broadcasts yet.',zh:'暂无发布。'},
  'fb.pinned':{en:'PINNED',zh:'置顶'},
  'fb.fleshCorp':{en:'FLESH CORP',zh:'血肉集团'},
  'fb.boost':{en:'Boost this signal',zh:'助推该信号'},
  'fb.replyPh':{en:'Reply, @name to tag',zh:'回复，用 @名称 提及'},
  'fb.save':{en:'Save',zh:'保存'},
  'fb.cancel':{en:'Cancel',zh:'取消'},
  'fb.slowDown':{en:'Slow down. {s}s.',zh:'太快了，请等待 {s} 秒。'},
  'fb.failed':{en:'Failed.',zh:'操作失败。'},
  'fb.broadcastFailed':{en:'Broadcast failed.',zh:'发布失败。'},

  // ── Corpo-Cards ──
  'cc.tabPlay':{en:'Play',zh:'对战'},
  'cc.tabDecks':{en:'Decks',zh:'卡组'},
  'cc.tabCollection':{en:'Collection',zh:'收藏'},
  'cc.tabRules':{en:'Rules',zh:'规则'},
  'cc.tabPacks':{en:'Card Packs',zh:'卡包'},
  'cc.tabFbay':{en:'\u0191bay',zh:'\u0191bay'},
  'cc.playIntro':{en:'Pick a deck and play a match against the AI. Starter decks are always available; build your own in Decks.',zh:'选择一个卡组与 AI 对战。初始卡组始终可用；可在“卡组”中自建。'},
  'cc.starter':{en:'Starter: {name}',zh:'初始卡组：{name}'},
  'cc.prebuilt':{en:'PREBUILT',zh:'预设'},
  'cc.cardsCount':{en:'{n} CARDS',zh:'{n} 张卡'},
  'cc.playBtn':{en:'Play',zh:'开战'},
  'cc.packsIntro':{en:'Buy packs to grow your collection, then build decks in Decks.',zh:'购买卡包以扩充收藏，然后在“卡组”中组建卡组。'},
  'cc.loadingPacks':{en:'Loading packs…',zh:'正在载入卡包…'},
  'cc.buyFor':{en:'Buy',zh:'购买'},
  'cc.need':{en:'Need',zh:'需要'},
  'cc.packOpened':{en:'Pack Opened',zh:'卡包已开启'},
  'cc.continue':{en:'Continue',zh:'继续'},
  'cc.shiny':{en:'SHINY',zh:'闪卡'},
  'cc.error':{en:'Error',zh:'错误'},
  'cc.yourListings':{en:'Your listings',zh:'你的挂单'},
  'cc.market':{en:'Market',zh:'市场'},
  'cc.noListings':{en:'No cards listed by other players right now.',zh:'目前没有其他玩家挂出的卡牌。'},
  'cc.price':{en:'Price',zh:'价格'},
  'cc.list':{en:'List',zh:'挂单'},
  'cc.cancel':{en:'Cancel',zh:'取消'},
  'cc.sellSub':{en:'Sell one copy on \u0191bay for Social Credits. Set any price.',zh:'在 \u0191bay 上以社会信用点出售一张。价格自定。'},
  'cc.fbayIntro':{en:'Buy and sell Corpo-Cards for Social Credits. Cards come only from packs, and you can list yours at any price.',zh:'用社会信用点买卖企业卡牌。卡牌只能从卡包中获得，你可以按任意价格挂单。'},
  'cc.arena':{en:'THE ARENA',zh:'竞技场'},
  'cc.artBy':{en:'Art by',zh:'美术'},

  // ── Drone mining help panel (index.html) ──
  'mw.title':{en:'How Mining Works',zh:'采矿机制'},
  'mw.ranked':{en:'Ranked by best single-run profit (banked minus invested).',zh:'按单次运行最佳利润排名（入账减去投入）。'},
  'mw.movement':{en:'Movement',zh:'移动'},
  'mw.movementBody':{en:'WASD or arrow keys fly the drone. Momentum carries you; plan approaches.',zh:'用 WASD 或方向键驾驶无人机。惯性会带着你走，提前规划接近路线。'},
  'mw.miningBody':{en:'Hold LEFT CLICK to fire the mining laser at rocks. Each rock takes time to drill. When the drill bar fills, its mineral type and ore yield are revealed. Empty rocks still require a drill cycle, then explode. Buy the Improved Scanner perk to see contents without drilling.',zh:'按住鼠标左键，用采矿激光照射岩石。每块岩石都需要时间钻探。钻探条填满后，会显示其矿物类型与矿石产量。空岩石同样需要一个钻探周期，然后爆炸。购买“强化扫描仪”特长可以不钻探就看到内容物。'},
  'mw.combat':{en:'Combat',zh:'战斗'},
  'mw.combatBody':{en:'RIGHT CLICK fires your auto-cannon. Bullets travel forward from your nose, but within medium range and a forward cone they snap to the nearest rival. Hostile ships show a red HOSTILE tag above them. Two solid hits kill a fighter.',zh:'鼠标右键发射自动火炮。子弹自机首向前飞行，但在中距离与前向锥形范围内会自动锁定最近的敌手。敌对飞船上方会显示红色的 HOSTILE 标记。两次命中即可击毁一架战机。'},
  'mw.heatBody':{en:'Sustained mining overheats the laser. At 100% heat the laser and your thrust lock out until it cools below 40%. Do not hold the trigger on rock you have already depleted.',zh:'持续采矿会让激光过热。热度达到 100% 时，激光与推进器都会锁死，直到冷却至 40% 以下。不要对已经采空的岩石继续按住扳机。'},
  'mw.factions':{en:'Factions',zh:'派系'},
  'mw.factionsBody':{en:'Your drone flies under your FleshMarket faction colors. Same-faction drones patrol but will not attack you. Rivals will, and show HOSTILE tags. If you have no faction set, every patrol treats you as hostile, factionless is lone-wolf mode. Syndicate drones are fast and swarm; Void drones are slow but their bullets hit harder; Coalition is balanced.',zh:'你的无人机悬挂你在 FleshMarket 的派系涂装。同派系无人机会巡逻，但不会攻击你。敌对派系则会，并显示 HOSTILE 标记。若你没有设定派系，所有巡逻队都会视你为敌，无派系即独狼模式。辛迪加无人机速度快、成群出击；虚空无人机速度慢，但子弹伤害更高；联合体则较为均衡。'},
  'mw.scrap':{en:'Scrap',zh:'残骸'},
  'mw.scrapBody':{en:'Killing enemies drops salvage. Tougher fights drop more: Void enemies drop more than Coalition, chasing enemies drop more than patrollers, and higher run difficulty scales scrap value up. Risky combat pays off.',zh:'击杀敌人会掉落可回收物。战斗越难，掉落越多：虚空敌人掉落多于联合体，追击型敌人掉落多于巡逻型，运行难度越高，残骸价值也越高。冒险作战是有回报的。'},
  'mw.depth':{en:'Depth',zh:'深度'},
  'mw.depthBody':{en:'NEAR iron and cobalt, thin hostiles. MID gold appears. DEEP painite, void opal, thick hostiles. VOID musgravite, high value per unit, swarms.',zh:'近层为铁与钴，敌人稀疏。中层开始出现黄金。深层有红硼钙石与虚空欧泊，敌人密集。虚空层为麝香石，单位价值极高，敌人成群。'},
  'mw.docking':{en:'Docking',zh:'返舱'},
  'mw.dockingBody':{en:'Return to the mothership and press Q to bank your current cargo. You can dock, leave, and mine again as many times as you want. Drones only get refunded at end of run if they are still alive. Fuel is not refilled on dock. One tank per drone.',zh:'返回母舰并按 Q 键将当前货物入账。你可以任意多次返舱、离舰、继续采矿。只有在运行结束时仍然存活的无人机才会退款。返舱不会补充燃料。每台无人机只有一箱燃料。'},
  'mw.dying':{en:'Dying',zh:'阵亡'},
  'mw.dyingBody':{en:'One hostile round ends the drone. The run is over. Undeployed escorts and refineries are refunded at end of run.',zh:'一发敌方炮弹就会终结无人机。本次运行随即结束。未部署的护航机与精炼站会在运行结束时退款。'},
  'mw.refineries':{en:'Refineries',zh:'精炼站'},
  'mw.refineriesBody':{en:'Optional loadout item. Press R in the field to deploy a portable fuel refinery. It generates fuel while you park near it. Enemies can destroy it.',zh:'可选装载物品。在场中按 R 键部署便携式燃料精炼站。只要停靠在附近，它就会持续产出燃料。敌人可以摧毁它。'},
  'mw.escorts':{en:'Escorts',zh:'护航机'},
  'mw.escortsBody':{en:'Optional loadout item. Small combat drones orbit your drone and shoot hostiles automatically. They absorb hits for you. They die with your drone.',zh:'可选装载物品。小型战斗无人机会环绕你的无人机，自动射击敌人。它们会替你承受伤害，并随你的无人机一同损毁。'},
  'mw.ships':{en:'Ships',zh:'舰船'},
  'mw.shipsBody':{en:'The SHIPS button opens the shipyard. Twelve alternate hulls across three faction styles: Coalition (mining focus, faster drills, higher heat cap), Syndicate (combat focus, higher fire rate, free escorts), Void (drone focus, built-in cargo drones that haul ore to the mothership while you mine). Ships are one-time purchases, available regardless of your own faction. Stats multiply your loadout tiers and perks. Each ship class also grants additional hull HP: Scout 2, Prospector 3, Hauler 4, Dreadnought 5. You survive that many hits before dying. Press T in the field to toggle auto-miner on ships that have it, off by default to protect your heat sink in easy zones.',zh:'SHIPS 按钮可打开船坞。共有十二种备选船体，分属三种派系风格：联合体（偏采矿，钻探更快，热容上限更高）、辛迪加（偏战斗，射速更高，附带免费护航机）、虚空（偏无人机，内置货运无人机会在你采矿时把矿石运回母舰）。舰船为一次性购买，与你自身派系无关。其属性会与你的装载等级和特长相乘。每个舰船等级还提供额外船体耐久：侦察 2，勘探 3，运输 4，无畏 5。你可承受相应次数的命中后才会阵亡。在场中按 T 键可切换具备该功能舰船的自动采矿，默认关闭，以在低难度区域保护你的散热片。'},

  // ── Price alerts ──
  'pa.title':{en:'Price Alerts',zh:'价格提醒'},
  'pa.symbolPh':{en:'Symbol',zh:'代码'},
  'pa.above':{en:'Above',zh:'高于'},
  'pa.below':{en:'Below',zh:'低于'},
  'pa.pricePh':{en:'Price',zh:'价格'},
  'pa.set':{en:'Set',zh:'设定提醒'},
  'pa.noAlerts':{en:'No active alerts',zh:'暂无生效的提醒'},

  // ── Market panel buttons ──
  'mp.watchlist':{en:'Watchlist',zh:'自选'},
  'mp.history':{en:'History',zh:'历史'},
  'mp.historyTip':{en:'Price history: start and end price per market cycle',zh:'价格历史：每个市场周期的开盘价与收盘价'},
  'mp.indexFunds':{en:'Index Funds',zh:'指数基金'},
  'mp.indexFundsTip':{en:'Index Funds: player-run houses trading as tickers',zh:'指数基金：以代码形式交易的玩家运营门阀'},
  'mp.indexSub':{en:'player-run funds trading as tickers, priced off NAV per share',zh:'以代码形式交易的玩家运营基金，按每股净值定价'},
  'mp.indexEmpty':{en:'No houses are listed on the Index yet. A Capital House with a NAV above the threshold can list from its owner panel.',zh:'目前指数上还没有任何门阀上市。净值高于门槛的资本门阀可以从其所有者面板上市。'},

  // ── Chat system messages ──
  'sys.passiveIncome':{en:'passive income',zh:'被动收入'},
  'sys.now':{en:'now',zh:'刚刚'},
  'sys.bonus':{en:'bonus',zh:'加成'},

  // ── Company detail card ──
  'cd.hq':{en:'HQ:',zh:'总部：'},
  'cd.dividendEligible':{en:'Dividend eligible',zh:'符合分红资格'},
  'cd.noBaseDividend':{en:'No base dividend',zh:'无基础分红'},
  'cd.position':{en:'Position:',zh:'持仓：'},
  'cd.short':{en:'Short:',zh:'空头：'},
  'cd.dayTradesLeft':{en:'(Day Trades left: {n} / 3)',zh:'（剩余日内交易：{n} / 3）'},
  'cd.noOpenOrders':{en:'No open orders',zh:'暂无未成交订单'},

  // ── Market upgrades ──
  'mu.title':{en:'Market Upgrades',zh:'市场升级'},
  'mu.loading':{en:'Loading…',zh:'载入中…'},
  'mu.owned':{en:'OWNED',zh:'已拥有'},
  'mu.autoAccumulate':{en:'Auto-Accumulate',zh:'自动补仓'},

  // ── Chat channel badge ──
  'ch.room':{en:'room',zh:'房间'},
  'ch.global':{en:'global',zh:'全局'},
  'ch.trade':{en:'trade',zh:'交易'},
  'ch.faction':{en:'faction',zh:'派系'},
  'ch.dunce':{en:'dunce',zh:'惩罚'},

  // ── Cycle price history modal ──
  'cy.title':{en:'CYCLE PRICE HISTORY',zh:'周期价格历史'},
  'cy.subtitle':{en:'start / end price per 30-min cycle',zh:'每 30 分钟周期的开盘价 / 收盘价'},
  'cy.range':{en:'RANGE',zh:'区间'},
  'cy.from':{en:'From',zh:'自'},
  'cy.to':{en:'To',zh:'至'},
  'cy.searchPh':{en:'Search symbol or name',zh:'搜索代码或名称'},
  'cy.selectTicker':{en:'Select a ticker to view its cycle history.',zh:'选择一个代码以查看其周期历史。'},

  // ── Auth modal ──
  'auth.titleLogin':{en:'FLESH MARKET',zh:'血肉市场'},
  'auth.titleRegister':{en:'CREATE ACCOUNT',zh:'新建账号'},
  'auth.name':{en:'Name',zh:'名称'},
  'auth.password':{en:'Password',zh:'密码'},
  'auth.languagePrompt':{en:'Language',zh:'语言'},
  'auth.langEn':{en:'English',zh:'English'},
  'auth.langZh':{en:'中文',zh:'中文'},

  // ── Language switch ──
  'lang.reloadWarn':{en:'A run is in progress. Switching language reloads the page and you will lose any cargo you have not banked. Switch anyway?',zh:'当前有运行中的任务。切换语言会重新载入页面，尚未入账的货物将会丢失。仍要切换吗？'},

  // ── Factions list (Galaxy > Factions) ──
  'fac.devOnly':{en:'DEV ONLY',zh:'仅限开发者'},
  'fac.patreon':{en:'PATREON',zh:'PATREON 会员'},
  'fac.aligned':{en:'ALIGNED',zh:'已归属'},
  'fac.joinPatreon':{en:'JOIN ON PATREON',zh:'在 PATREON 加入'},
  'fac.convert':{en:'CONVERT',zh:'转化'},
  'fac.join':{en:'JOIN',zh:'加入'},
  'fac.locked':{en:'LOCKED',zh:'已锁定'},
  'fac.activeBonuses':{en:'ACTIVE BONUSES',zh:'生效加成'},
  'fac.systems':{en:'SYSTEMS',zh:'星系'},
  'fac.contested':{en:'CONTESTED',zh:'争夺中'},
  'fac.warChest':{en:'WAR CHEST',zh:'战争基金'},
  'fac.status':{en:'STATUS',zh:'状态'},
  'fac.permanentControl':{en:'PERMANENT CONTROL',zh:'永久控制'},
  'fac.planetsInSystems':{en:'{p} planets in {s} systems',zh:'{s} 个星系中的 {p} 颗行星'},
  'fac.voidWarnTitle':{en:'PERMANENT CYBERNETIC CONVERSION',zh:'永久性电子化改造'},
  'fac.voidWarnBody':{en:'Joining the Void Collective permanently converts your account into a cyborg. You receive a robot badge next to your name and +Ƒ15 passive income forever.',zh:'加入虚空集体会将你的账号永久转化为改造人。你的名字旁会出现机器徽记，并永久获得 +Ƒ15 被动收入。'},
  'fac.voidWarnIrreversible':{en:'This cannot be reversed.',zh:'此操作不可逆转。'},
  'fac.voidWarnExit':{en:'The only way to leave is through the Merchant Guild (Patreon).',zh:'唯一的脱离途径是通过商人公会（Patreon）。'},
  'fac.cyborgActive':{en:'CYBORG AUGMENTS ACTIVE, +Ƒ15/30min permanent',zh:'改造人增强已启用，永久 +Ƒ15/30分钟'},
  'fac.loginToJoin':{en:'Log in to join a faction',zh:'请先登录以加入派系'},
  'fac.alignedWith':{en:'Aligned with {name}',zh:'已归属 {name}'},
  'fac.conversionComplete':{en:', Cybernetic conversion complete',zh:'，电子化改造已完成'},
  'fac.error':{en:'Error',zh:'错误'},
  'fac.networkError':{en:'Network error',zh:'网络错误'},
  'fac.confirmVoid':{en:'PERMANENT CYBERNETIC CONVERSION\n\nJoining the Void Collective will:\n- Permanently lock your account to this faction\n- Give you a cyborg badge\n- Grant +Ƒ15 passive income forever\n\nThe ONLY way to leave is through the Merchant Guild (Patreon).\n\nThis CANNOT be undone. Are you sure?',zh:'永久性电子化改造\n\n加入虚空集体将会：\n- 把你的账号永久锁定在该派系\n- 授予改造人徽记\n- 永久获得 +Ƒ15 被动收入\n\n唯一的脱离途径是通过商人公会（Patreon）。\n\n此操作无法撤销。确定继续吗？'},
  'fac.seizes':{en:'{faction} seizes {colony}!',zh:'{faction} 夺取了 {colony}！'},

  // ── Faction funding ──
  'fund.minimum':{en:'Minimum: Ƒ 1,000',zh:'最低：Ƒ 1,000'},
  'fund.loginToFund':{en:'Log in to fund factions',zh:'请先登录以资助派系'},
  'fund.funded':{en:'Funded {faction}',zh:'已资助 {faction}'},
  'fund.pctGained':{en:' +{pct}% control',zh:' +{pct}% 控制权'},
  'fund.toNext':{en:' (Ƒ{amt} to next 1%)',zh:'（距下一个 1% 还需 Ƒ{amt}）'},
  'fund.banked':{en:', banked, Ƒ{amt} to next 1%',zh:'，已入账，距下一个 1% 还需 Ƒ{amt}'},
  'fund.failed':{en:'Fund failed',zh:'资助失败'},
  'fund.connectionError':{en:'Connection error',zh:'连接错误'},

  // ── Commodity board actions ──
  'com.loginToTrade':{en:'Log in to trade',zh:'请先登录以交易'},
  'com.buyPrompt':{en:'Buy how many units? (at cheapest colony)',zh:'买入多少单位？（在最低价殖民地）'},
  'com.sellPrompt':{en:'Sell how many? (at {colony}, holding {n} there)',zh:'卖出多少？（在 {colony}，该地持有 {n}）'},
  'com.holdNoneSellable':{en:'You hold none at a sellable colony',zh:'你在可售殖民地没有持货'},
  'com.needShip':{en:'Commission a ship first (Shipyard below)',zh:'请先订购一艘飞船（见下方船坞）'},
  'com.notEnoughCash':{en:'Not enough cash',zh:'现金不足'},
  'com.halted':{en:'Commodity trading is halted by the Market',zh:'商品交易已被市场暂停'},
  'com.noCargoHere':{en:'No cargo at that colony. Ship it there first',zh:'该殖民地没有货物。请先运送过去'},
  'com.buyFailed':{en:'Buy failed',zh:'买入失败'},
  'com.sellFailed':{en:'Sell failed',zh:'卖出失败'},
  'com.bought':{en:'Bought {n} @ Ƒ{price}',zh:'已买入 {n}，单价 Ƒ{price}'},
  'com.sold':{en:'Sold {n} @ Ƒ{price} (+Ƒ{proceeds})',zh:'已卖出 {n}，单价 Ƒ{price}（+Ƒ{proceeds}）'},
  'com.commissioned':{en:'Commissioned, capacity now {n}u',zh:'订购完成，运力现为 {n} 单位'},
  'com.cargoDelivered':{en:'Cargo delivered: {n} x {commodity} at destination',zh:'货物已送达：{n} x {commodity}'},
  'com.cargoInsured':{en:'Cargo lost but INSURED, claim paid Ƒ{amt}',zh:'货物损失但已投保，理赔 Ƒ{amt}'},

  // ── Lane share + tension toasts ──
  'lsh.sold':{en:'Share sold for Ƒ{amt}',zh:'份额已售出，价格 Ƒ{amt}'},
  'lsh.swapped':{en:'Swapped! Sold Ƒ{sold}, bought Ƒ{bought}',zh:'已掉换！卖出 Ƒ{sold}，买入 Ƒ{bought}'},
  'lsh.dividend':{en:'Dividend: +Ƒ{amt}',zh:'分红：+Ƒ{amt}'},
  'lsh.error':{en:'Share error',zh:'份额错误'},
  'lsh.tension':{en:'Tension {band} at {colony}, {n} stocks hit',zh:'{colony} 紧张度 {band}，{n} 支股票受影响'},

  // ── Map run tooltip ──
  'run.shipping':{en:'SHIPPING',zh:'运输'},
  'run.smuggling':{en:'SMUGGLING',zh:'走私'},
  'run.stakeLine':{en:'Stake: Ƒ{amt}',zh:'本金：Ƒ{amt}'},
  'run.timeLeft':{en:'Time left: {s}s',zh:'剩余时间：{s} 秒'},
  'run.insured':{en:'Insured',zh:'已投保'},
  'run.loginFirst':{en:'Log in first',zh:'请先登录'},
  'run.min100':{en:'Min: Ƒ100',zh:'最低：Ƒ100'}
};

// ── Colony and planet data translation (Galaxy map detail pages) ─────────────
// Colony names and lore for the 21 non-Jade colonies. The 16 Jade colonies are
// already covered by JADE_I18N.name / JADE_I18N.lore, and the resolver in
// galaxy.js checks that map first, so there is no duplication here.
window.COLONY_ZH = {
  new_anchor:{name:'新锚定',lore:'联合体行政首府。内环星系的牌照、仲裁与受监管交易费的所在地。金融与保险主导本地市场。'},
  cascade_station:{name:'瀑源站',lore:'三颗潮汐锁定的卫星，没有可呼吸的大气。矿石开采是主要出口；所有地表货运都要缴纳轨道电梯通行费。瀑布矿业负责开采，顶点航太负责运输。'},
  frontier_outpost:{name:'边疆前哨',lore:'进入开放空域前最后一处受联合体监管的中转站。三大派系都通过持牌承包商在此运营补给业务。控制权处于争夺状态，长期僵持。'},
  the_hollow:{name:'空洞',lore:'被掏空的采矿星体，自运营第三年起便脱离监管记录。空腔物流控制码头并制定费率；执法外包给海盗团伙。联合体在此没有实际管辖权。'},
  vein_cluster:{name:'血脉星团',lore:'潮汐锁定；有人居住的一面永处黑暗。血脉财团拥有轨道加工环，精炼产出不列入标准舱单。生物科技与器官供应由此流向下游。'},
  aurora_prime:{name:'极光主星',lore:'内环星系中继枢纽。极光电力掌握电网，霓虹科技掌握数据基础设施，幽能核电在一份争议供货协议下掌握聚变电厂。联合体负责牌照管理并收取费用。'},
  null_point:{name:'虚点',lore:'外环星团的中继枢纽，承载南部星域大部分零中继信号流量。虚空集体管辖。没有运行日志，没有公开舱单，对档案调阅一律不予回应。联合体在此没有传感器覆盖。'},
  limbosis:{name:'灵薄狱',lore:'前武器实验室，自上一次企业战争后废弃。此处建造了瞄准阿巴顿双黑洞的轨道激光阵；同一设计后来被安装在血肉站。该阵列无人维护，仍以自动瞄准运行，评级与血肉站相当。掌握林波西斯者，便掌握了星团中唯一能让阿巴顿无从设防的平台。'},
  lustandia:{name:'纵欲城',lore:'社会颓靡的灯塔。一颗如此沉溺享乐的行星坚持自我防卫，且防卫得极好。纵欲之地出产甜藤酒，一种仅限其境内的酒。尝过的人谈及幻象、心愿成真，以及无法解释的能力。控制纵欲之地，就是控制甜藤酒的贸易。这是一条要害经济。'},
  gluttonis:{name:'贪食城',lore:'一颗由物资巨头统治的永夜行星。已知星系中六成的稀有材料精炼在此完成。没有饕餮星，各派系的运输船都将无货可运。巨头集团控制着轨道精炼厂。掌握这颗行星者，便掌握了整个星系经济的燃料。'},
  abaddon:{name:'亚巴顿',lore:'每个派系对自己在此所求都有不同的说法。联合体称之为法律的前沿据点。辛迪加称之为过境税节点。虚空集体称之为洁净信号区。三者说的都是真话，也都没有说全。没有林波西斯的阿巴顿，是一处毫无掩护的阵地。掌握这个星系，就意味着掌握一张可以威胁射程内任何目标的火网。'},
  eyejog:{name:'艾杰格',lore:'眼慢星是商人公会的所在地。他们统治着赤霾天空，以进口的奢靡为馈赠遥控四方，终日饮宴闲卧，而金钱如河，日日为其账目镀色。与他们的控制之网为敌是愚蠢的。'},
  dust_basin:{name:'尘盆',lore:'外缘开采领地。三家采矿财团共用一部轨道电梯，并争夺同样的矿石合约。电梯维护问题悬而未决。'},
  nova_reach:{name:'新星领',lore:'外缘研究设施。联合体在此没有确立的牌照管辖权。此处生产的化合物不出现在任何持牌药品登记册上。'},
  iron_shelf:{name:'铁架',lore:'横跨三颗荒芜卫星的制造走廊。产出为舰船部件、航太零件与武器系统，买家遍及三大派系。派系冲突期间生产不停。'},
  the_ledger:{name:'账簿城',lore:'外环星系的金融行政中心。保险承保商、风险基金与地产开发商控制着殖民政府，候选人须事先获得批准。'},
  signal_run:{name:'信号奔流',lore:'位于内外环主要货运走廊上的气态巨行星中继枢纽。拥有已开拓空域中最快的运输航线，并制定外缘的货运时刻表。控制权处于争夺状态，从未维持超过两届选举。'},
  scrub_yard:{name:'荒场',lore:'空壳公司与控股架构的行政登记地。一万七千家登记实体，经核实的雇员却不足四百。大气处理器仍在使用自第十一次企业战争起便已过期的联合体许可。收入来源是金融过境费。'},
  the_escrow:{name:'托管所',lore:'深水数据库，服务器沉于三公里之下。以宣称的中立地位保存外环星系金融合约的镜像记录。虚空集体管辖。审计申请：9 次。获准审计：0 次。'},
  margin_call:{name:'追缴站',lore:'作为债务催收与资产清算中心运作的工业熔岩世界。来自账簿星的实物抵押品移交指令在此处理。辛迪加在催收大厅执行强制手段，熔炉昼夜不停。'},
  flesh_station:{name:'血肉站',lore:'一座无法攻破的巨构。其防御网通过一套侵略性瞄准 AI 驱动激光阵列，能量取自数台黑洞发电机。中微子测绘软件实现无限距离目标捕获，有效打击范围为十至一百光年。尚无已知技术攻破过它的防御。此处是外交人员的中立地带，也是血肉先生的居所。'}
};

// Planet names, keyed by the English name as it appears in COLONY_META.
window.PLANET_NAME_ZH = {
  'Anchor Prime':'锚点主星','Catalyst II':'催化二号','Nexus Relay':'枢纽中继',
  'Cascade Alpha':'瀑布甲','Ore Deep':'矿脉深处','Waypoint I':'航点一号','Supply Depot':'补给站',
  'Hollow Core':'空腔核心',"Pirate's Rest":'海盗歇脚处','BloodWorks Stn':'血工站','GraftLab II':'移植实验室二号',
  'Organ Depot':'器官仓','Aurora Relay':'极光中继','Fusion Core':'聚变核心','Neon Hub':'霓虹枢纽',
  'WraithGrid':'幽能电网','The Null':'虚无','CipherDeep':'密文深渊','Fog Bastion':'雾堡','Relic Deep':'遗物深处',
  'Pleasure Quarter':'欢愉区',"S'weet Vineyard":'甜藤园','Baron Refinery I':'巨头精炼厂一号','Dark Core':'暗核',
  'Greed':'贪婪','Guild Market':'公会市场','Sand Exchange':'黄沙交易所','Crater Base Alpha':'环坑基地甲',
  'Ore Platform 7':'矿石平台七号','Cryo Station One':'低温站一号','Lab Ring Kappa':'实验环卡帕',
  'Forge Station':'锻造站','Drydock Omega':'干船坞欧米伽','Exchange Tier':'交易层','Underwriting Hub':'承保枢纽',
  'Realty Commons':'地产公地','Relay Alpha':'中继甲','Depot Ring':'仓储环','Fuel Platform':'燃料平台',
  'Shell Block Nine':'空壳区九号','Fog Station Kappa':'雾站卡帕','Vault Deep One':'深库一号','Relay Shelf':'中继架',
  'Furnace Deck Alpha':'熔炉甲板甲','Smelter Ring Two':'冶炼环二号','Flesh Station Alpha':'血肉站甲',
  'Tianzhu Spire':'天柱塔','Yuhua Ministry':'雨华府','Tiangong Ring':'天宫环','Bencao Gardens':'本草园',
  'Lingzhi Vats':'灵芝培养槽','Millet Terraces':'粟米梯田','Quantum Loom':'量子织机','Optics Vault':'光学库',
  'Darkfield Probe':'暗场探针','Treasure Docks':'宝船坞','Silk Road Relay':'丝路中继','Ember Crucible':'余烬坩埚',
  'March Shipworks':'长征船厂','Tortoise Redoubt':'玄龟堡垒','Watch Platform':'瞭望台','Terrace Clinics':'台地医馆',
  'Mind Altar':'心坛','Trigram Array':'卦象阵列','Harbor Prime':'主港','Manifest Hall':'舱单厅',
  'Flame Crucible':'火焰坩埚','Rebel Reach':'叛域'
};

// Sector display names as they appear on planet cards (distinct from the eight
// numeric sector.N keys, which cover the market side).
window.SECTOR_NAME_ZH = {
  'Finance':'金融','Biotech':'生物科技','Insurance':'保险','Manufacturing':'制造业','Energy':'能源',
  'Logistics':'物流','Tech':'科技','Misc':'其他','Gray Bazaar':'灰市集','Capital Syndicate':'资本财团',
  'Transit Guild':'运输公会','Indemnity Brokers':'赔付经纪','Iron Foundries':'钢铁铸造','Flesh & Gene':'血肉与基因',
  'Neural Networks':'神经网络','Power Cartels':'能源卡特尔'
};

// Faction prefixes used inside planet bonus lines.
window.BONUS_FACTION_ZH = {
  'Coalition':'联合体','Syndicate':'辛迪加','Void':'虚空','Jade Circuit':'翡翠回路',
  'Any faction':'任意派系','Merchant Guild':'商人公会','Dev accounts only':'仅限开发者账号'
};

// Whole-string overrides for the handful of bonus and contest lines that do not
// fit the generated pattern. Checked before the pattern parser.
window.BONUS_ZH_EXACT = {
  'Any faction: grey-market passive income':'任意派系：灰市被动收入',
  'Requires full cluster control (Limbosis + Lustandia + Gluttonis). Grants +Ƒ500 per income cycle to faction members with 30 or more days of continuous allegiance.':'需要完全控制整个星团（林波西斯 + 纵欲之地 + 饕餮星）。向连续归属满 30 天及以上的派系成员，每个收入周期发放 +ƒ500。',
  'Merchant Guild: Trade fee exemptions':'商人公会：交易费豁免',
  'Dev accounts only: \u26A1 passive income multiplier':'仅限开发者账号：\u26A1 被动收入倍增',
  "Syndicate: +1.8% Gray Bazaar dividends, S'weet trade monopoly":'辛迪加：+1.8% 灰市集分红，甜藤酒贸易垄断',
  'Contested: bonus active':'争夺中：加成生效',
  'Contested: bonus active for leading faction':'争夺中：领先派系的加成生效',
  'Cannot be contested':'不可争夺',
  'Cannot be contested, Guild sovereign territory':'不可争夺，公会主权领地',
  'Ye who hold sovereign over this place, reign countless worlds who shall forever go unmourned.':'执此地主权者，统御无数世界，而无人为之哀悼。'
};

// Planet bonus lines are generated rather than stored per string. The source
// text is templated ("Coalition: +1.2% Finance dividends"), and the percentages
// change whenever the economy is retuned. A table of 135 hand-translated
// strings would silently go stale on the next balance pass; parsing keeps the
// Chinese correct by construction. Anything that does not match falls through
// to BONUS_ZH_EXACT and then to the original English.
window.bonusZh = function(str){
  if(window._lang !== 'zh' || !str) return str;
  var ex = window.BONUS_ZH_EXACT[str];
  if(ex) return ex;
  var FZ = window.BONUS_FACTION_ZH, SZ = window.SECTOR_NAME_ZH;
  // "A: +N% | B: +M% Sector dividends"  or  "A: +N% Sector dividends"
  var m = str.match(/^(.+?): \+([\d.]+)% \| (.+?): \+([\d.]+)% (.+?) dividends$/);
  if(m && FZ[m[1]] && FZ[m[3]] && SZ[m[5]])
    return FZ[m[1]]+'：+'+m[2]+'% | '+FZ[m[3]]+'：+'+m[4]+'% '+SZ[m[5]]+'分红';
  m = str.match(/^(.+?): \+([\d.]+)% (.+?) dividends$/);
  if(m && FZ[m[1]] && SZ[m[3]])
    return FZ[m[1]]+'：+'+m[2]+'% '+SZ[m[3]]+'分红';
  return str;
};

window.contestZh = function(str){
  if(window._lang !== 'zh' || !str) return str;
  var ex = window.BONUS_ZH_EXACT[str];
  if(ex) return ex;
  var m = str.match(/^Contested: \+([\d.]+)%$/);
  if(m) return '争夺中：+'+m[1]+'%';
  m = str.match(/^Contested: leading(?: faction)? gets \+([\d.]+)%$/);
  if(m) return '争夺中：领先派系获得 +'+m[1]+'%';
  return str;
};

// Resolvers used by the galaxy renderers. Jade colonies resolve through
// JADE_I18N, everything else through COLONY_ZH, and both fall back to English.
window.colonyNameZh = function(id, fallback){
  if(window._lang !== 'zh') return fallback;
  var j = window.JADE_I18N;
  if(j && j.name && j.name[id]) return j.name[id];
  var c = window.COLONY_ZH;
  return (c && c[id] && c[id].name) ? c[id].name : fallback;
};
window.colonyLoreZh = function(id, fallback){
  if(window._lang !== 'zh') return fallback;
  var j = window.JADE_I18N;
  if(j && j.lore && j.lore[id]) return j.lore[id];
  var c = window.COLONY_ZH;
  return (c && c[id] && c[id].lore) ? c[id].lore : fallback;
};
window.planetNameZh = function(n){
  if(window._lang !== 'zh' || !n) return n;
  var m = window.PLANET_NAME_ZH;
  return (m && m[n]) ? m[n] : n;
};
window.sectorNameZh = function(n){
  if(window._lang !== 'zh' || !n) return n;
  var m = window.SECTOR_NAME_ZH;
  return (m && m[n]) ? m[n] : n;
};

// Company display name. Coalition names live in CO_NAME_ZH, Circuit names in
// JADE_I18N.ticker, and the two key spaces are disjoint, so one resolver covers
// both and no call site has to know which exchange a symbol came from. That
// split is what left the Circuit tickers in English in the cycle history and
// the market tools: those panels only ever checked CO_NAME_ZH.
window.tickerNameZh = function(name){
  if(window._lang !== 'zh' || !name) return name;
  var en = String(name).replace(/\d+$/,'').trim();
  var c = window.CO_NAME_ZH;
  if(c && c[en]) return c[en];
  var j = window.JADE_I18N;
  if(j && j.ticker && j.ticker[en]) return j.ticker[en];
  return name;
};

// ── Hull registry (galaxy fleet + manifest modal) ──
// Keyed by the English display string, not the hull key, because the manifest
// modal reads whichever of the two tables answered first. Both maps carry the
// SHIP_CLASS fallbacks as well, so an unrecognised hullKey still renders.
window.HULL_NAME_ZH = {
  "Star Traveller":"星旅者", "Aureole Class":"光轮级", "Astral Pioneer":"星际先驱",
  "Phoebe Class":"菲比级", "Nomad Class":"游牧级", "Canyonback Class":"峡背级",
  "Cicada Class":"蝉级", "Titan's Burden":"泰坦之负", "Titan's Fist":"泰坦之拳",
  "Scoundrel Corvette":"恶徒护卫舰", "Scoundrel EW Corvette":"恶徒电战护卫舰",
  "CZ-1 Sanban":"CZ-1 舱板", "CZ-2 Shachuan":"CZ-2 沙船", "CZ-3 Fuchuan":"CZ-3 福船",
  "CZ-4 Guangchuan":"CZ-4 广船", "CZ-5 Caochuan":"CZ-5 草船", "CZ-6 Xingcha":"CZ-6 星槎",
  "CZ-7 Louchuan":"CZ-7 楼船", "CZ-8 Changfeng":"CZ-8 长风", "CZ-9 Baochuan":"CZ-9 宝船",
  "Light Courier":"轻型信使船", "Mid-Range Freighter":"中程货船", "Deep-Space Hauler":"深空货船"
};
window.HULL_CLASS_ZH = {
  "Light Merchant Frame":"轻型商船架", "Class-1 Merchant Hull":"一级商用船体",
  "Class-1 Survey Trader":"一级勘测商船", "Class-2 Merchant Hull":"二级商用船体",
  "Class-2 Long Hauler":"二级远程货船", "Class-2 Bulk Carrier":"二级散货船",
  "Class-3 Heavy Transport":"三级重型运输船", "Class-3 Deep Hauler":"三级深空货船",
  "Class-3 Pocket Carrier":"三级袖珍母舰", "Unregistered Corvette":"未登记护卫舰",
  "Unregistered EW Corvette":"未登记电战护卫舰", "Circuit Light Frame":"玉环轻型船架",
  "Class-1 Circuit Hull":"一级玉环船体", "Class-1 Circuit Trader":"一级玉环商船",
  "Class-2 Circuit Hull":"二级玉环船体", "Class-2 Circuit Hauler":"二级玉环货船",
  "Class-2 Circuit Bulk Hull":"二级玉环散货船体", "Class-3 Circuit Transport":"三级玉环运输船",
  "Class-3 Circuit Deep Hauler":"三级玉环深空货船", "Class-3 Yard Flagship":"三级船坞旗舰",
  "Class-1 Courier Frame":"一级信使船架"
};
// Commodity display name, window scoped ON PURPOSE. galaxy.js has a local comZ
// with the same body, but it lives in the first IIFE of that file and the ship
// manifest panel lives in the third, so the manifest cannot see it. Same trap
// that FLEET_HULLS fell into and the reason window._fmFleet exists.
window.commodityNameZh = function(n){
  if(window._lang !== 'zh' || !n) return n;
  var m = window.COMMODITY_ZH; return (m && m[n]) ? m[n] : n;
};
window.hullNameZh = function(n){
  if(window._lang !== 'zh' || !n) return n;
  var m = window.HULL_NAME_ZH; return (m && m[n]) ? m[n] : n;
};
window.hullClassZh = function(h){
  if(window._lang !== 'zh' || !h) return h;
  var m = window.HULL_CLASS_ZH; return (m && m[h]) ? m[h] : h;
};

// ── Manifest cargo flavour lines ──
// Keyed by the RAW template, before {N}/{M} are filled, so the lookup happens
// once at pick time and the number substitution runs on the translated string.
// First-pass CN: the terms are checked, the prose voice wants a native read.
window.CARGO_LINE_ZH = {
  "Coalition licensing documentation (Class-A)":"联盟许可文件（A类）",
  "Regulated arbitration filings, batch {N}":"受监管仲裁备案，第 {N} 批",
  "Inner-system transit permits (bulk)":"内星系通行许可（批量）",
  "Nexus Financial, settlement ledgers":"枢纽金融，结算账簿",
  "Catalyst Insurance, underwriting packets":"催化保险，承保文件包",
  "Raw ore feedstock, unprocessed":"原矿料，未加工",
  "Unlicensed goods, pending classification":"无照货物，待分类",
  "Diplomatic courier pouches (sealed)":"外交信使袋（已封）",
  "Coalition payroll credits, encrypted":"联盟薪资信用，已加密",
  "Refined titanium alloy, {N}.{M}t":"精炼钛合金，{N}.{M} 吨",
  "Processed ore pellets (Grade 7)":"加工矿球（7级）",
  "Vertex Aerospace, hull plating components":"顶点航天，船体镀板组件",
  "Cascade Minerals, raw extract batch":"瀑源矿业，原矿提取批次",
  "Orbital elevator tolls, cleared manifest":"轨道电梯通行费，清关单",
  "Atmospheric processing supplies":"大气处理补给",
  "Coalition-bonded labor contracts":"联盟担保劳务合同",
  "Mining equipment, replacement parts":"采矿设备，更换部件",
  "Cascade Pharma, compound reagents":"瀑源制药，化合试剂",
  "Cross-faction supply coordination logs":"跨派系补给协调日志",
  "HollowLogistics, docking fee receipts":"空壳物流，停泊费收据",
  "Emergency ration stockpile (licensed)":"应急口粮储备（持照）",
  "Frontier Supplies, resupply manifest":"边疆供应，补给清单",
  "Contested territory provisions":"争夺区补给品",
  "Licensed contractor equipment":"持照承包商设备",
  "Multi-faction relay hardware":"多派系中继硬件",
  "Standoff maintenance supplies":"僵持期维护补给",
  "Cargo manifest: [REDACTED BY PORT AUTHORITY]":"货物清单：[已由港务局涂销]",
  "HollowLogistics, rate schedule (private)":"空壳物流，费率表（非公开）",
  "PhantomCourier, unlisted freight":"幻影快递，未列明货运",
  "Container batch 7-7-VOID, contents unverified":"集装箱批次 7-7-VOID，内容未核",
  "ApexContraband, transit clearance (forged)":"尖峰走私，过境放行（伪造）",
  "SmugglerNetworks, route data, encrypted":"走私网络，航线数据，已加密",
  "Pirate contractor supplies, no manifest":"海盗承包商补给，无清单",
  "Enforcement equipment (unlicensed)":"执法装备（无照）",
  "[RECORD NOT FOUND]":"[未找到记录]",
  "Unknown, docking AI flagged, overridden":"未知，停泊 AI 已标记，遭覆写",
  "Aurora Electric, power grid contracts":"极光电力，电网合约",
  "Neon Technologies, data infrastructure uplinks":"霓虹科技，数据基建上行链路",
  "WraithEnergy, fusion plant output certs":"亡魂能源，聚变厂产出证书",
  "Inner-system relay licensing (annual)":"内星系中继许可（年度）",
  "Zenith Automation, control system bundles":"天顶自动化，控制系统包",
  "Fuel cell feedstock, outer rim grade":"燃料电池原料，外环级",
  "Coalition licensing fee, inbound":"联盟许可费，入账",
  "WraithEnergy raw supply (disputed)":"亡魂能源原料供应（有争议）",
  "Tech component assemblies":"科技组件总成",
  "NullSyndicate, data relay packet (no logs)":"虚空财团，数据中继包（无日志）",
  "UnderNet, encrypted routing bundle":"地下网络，加密路由包",
  "CipherHoldings, anonymised ledgers":"密文控股，匿名账簿",
  "ShadowDynamics, signal relay manifest [NULL]":"暗影动力，信号中继清单 [NULL]",
  "[RECORD PURGED]":"[记录已清除]",
  "Unknown origin, flagged by Coalition sensor ghost":"来源不明，遭联盟传感残影标记",
  "GhostFoundry hardware (unregistered)":"幽灵铸造硬件（未登记）",
  "Dark-net relay components":"暗网中继组件",
  "[MANIFEST: NONE]":"[清单：无]",
  "Relic Deep, artifact extraction batch (unclassified)":"遗物深渊，遗物提取批次（未分级）",
  "Fog Bastion, weapons platform maintenance log":"迷雾堡垒，武器平台维护日志",
  "[WARNING: ORIGIN SYSTEM FLAGGED]":"[警告：起点星系已被标记]",
  "Defense grid status, CLASSIFIED":"防御网状态，机密",
  "Nobody has docked at Limbosis in {N} standard cycles":"已有 {N} 个标准周期无人在灵薄狱停泊",
  "Last known inbound: Corporate War 15 survivor vessel":"最后一次已知入港：第十五次企业战争幸存船",
  "[APPROACH VECTOR HAZARDOUS]":"[进近航向危险]",
  "S'weet Reserve, Vintage 94 · {N} cases":"甜藤珍藏，94 年份 · {N} 箱",
  "S'weet Vineyard, Pleasure Export License":"甜藤庄园，欢愉出口许可",
  "Pleasure Quarter, entertainment contracts ({N} units)":"欢愉区，娱乐合约（{N} 份）",
  "S'weet uncut concentrate, {N}.{M}L (restricted)":"甜藤未稀释浓缩液，{N}.{M} 升（管制）",
  "Hedonism sector permits, inner system distribution":"享乐板块许可，内星系分销",
  "Luxury goods, unrestricted import":"奢侈品，不受限进口",
  "Entertainment technology, licensed":"娱乐技术，持照",
  "Defense system components (self-funded)":"防御系统组件（自筹资金）",
  "Raw ingredients for S'weet fermentation process":"甜藤发酵工艺原料",
  "Baron Corps, refined rare materials · {N}.{M}t":"男爵集团，精炼稀有材料 · {N}.{M} 吨",
  "Orbital refinery output, Class-Omega grade":"轨道精炼厂产出，欧米伽级",
  "Fuel catalyst canisters (unlisted specification)":"燃料催化剂罐（规格未列明）",
  "Baron Refinery I, batch manifest [PROPRIETARY]":"男爵精炼厂一号，批次清单 [专有]",
  "Dark Core extraction, unmarked containers · {N}t":"暗核开采，无标记集装箱 · {N} 吨",
  "Universal fuel feedstock, all factions cleared":"通用燃料原料，各派系均已放行",
  "Labor contract shipment, outer rim sourced":"劳务合同装运，外环来源",
  "Baron Corps, supply chain inputs (dark)":"男爵集团，供应链投入（暗账）",
  "Refinery maintenance equipment":"精炼厂维护设备",
  "Power cell arrays, high consumption rated":"电池组阵列，高耗额定",
  "[ABADDON TRANSIT AUTHORITY: NO MANIFEST REQUIRED]":"[亚巴顿过境管理局：无需清单]",
  "Sovereign freight, inspection exemption filed":"主权货运，已备案免检",
  "Contested zone goods, faction clearance varies":"争夺区货物，各派系放行不一",
  "Greed Station, holding pattern cargo":"贪婪站，待泊货物",
  "All three factions running parallel supply ops":"三大派系并行运作补给",
  "Coalition forward supplies, unacknowledged":"联盟前沿补给，不予承认",
  "Syndicate transit goods, tariff disputed":"辛迪加过境货物，关税存争议",
  "Void Collective, signal zone hardware":"虚空集体，信号区硬件",
  "Merchant Guild, trade toll receipts · {N}k SC":"商会，贸易通行费收据 · {N}k SC",
  "Guild Market licensing, {N} new registrations":"商会市场许可，新登记 {N} 项",
  "Oak Capital, portfolio redistribution":"橡树资本，组合再分配",
  "Sycamore Partners, investment mandate packets":"梧桐合伙，投资授权文件包",
  "Sand Exchange, inter-colony fee schedule":"沙域交易所，殖民地间费率表",
  "Guild transit levy, mandatory, all routes":"商会过境税，强制，所有航线",
  "Tribute flow from controlled colonies":"来自受控殖民地的贡金流",
  "Sycamore Software, infrastructure contracts":"梧桐软件，基建合约",
  "Guild-approved luxury goods (personal use)":"商会核准奢侈品（自用）",
  "Decadence supplies, unrestricted (Guild privilege)":"奢靡补给，不受限（商会特权）",
  "Aurora Metals, ore extract · {N}.{M}t":"极光金属，矿石提取 · {N}.{M} 吨",
  "GreyMining, disputed contract output":"灰色矿业，争议合约产出",
  "First Minerals, Ore Platform 7 batch":"第一矿业，七号矿石平台批次",
  "South Minerals, elevator shared manifest":"南方矿业，电梯共用清单",
  "RogueMinerals, off-schedule extraction log":"游荡矿业，计划外开采日志",
  "Mining equipment (disputed ownership)":"采矿设备（所有权存争议）",
  "Orbital elevator maintenance supplies":"轨道电梯维护补给",
  "Labor rotation, outer rim contractors":"劳力轮换，外环承包商",
  "Infrastructure, infrastructure dispute pending":"基建，基建纠纷待决",
  "Nimbus Biotech, unlicensed compound batch":"云端生物，无照化合物批次",
  "North Biotech, research output (unregistered)":"北方生物，研究产出（未登记）",
  "Nova Biotech, synthesis log (no Coalition stamp)":"新星生物，合成日志（无联盟印章）",
  "GreywaterLabs, compound · {N}.{M}g [CLASS UNKNOWN]":"灰水实验室，化合物 · {N}.{M} 克 [类别未知]",
  "Willow Labs, biotech reagents (outer rim grade)":"垂柳实验室，生物试剂（外环级）",
  "Research equipment, no import license":"研究设备，无进口许可",
  "Coalition-restricted reagents (smuggled)":"联盟管制试剂（走私）",
  "Lab Ring Kappa, supply manifest (sealed)":"卡帕实验环，补给清单（密封）",
  "Experimental substrate materials":"实验基质材料",
  "North Industries, ship component batch · {N} units":"北方工业，船用组件批次 · {N} 件",
  "Nexus Aerospace, hull segment manifest":"枢纽航天，船体分段清单",
  "Pioneer Aerospace, weapons systems (buyer undisclosed)":"拓荒航天，武器系统（买方未披露）",
  "River Aerospace, aerospace parts · {N}.{M}t":"江河航天，航天部件 · {N}.{M} 吨",
  "Drydock Omega, completed vessel components":"欧米伽干船坞，完工船体组件",
  "Forge Station, manufacturing output (all factions)":"熔炉站，制造产出（各派系）",
  "Raw metal feedstock, Gluttonis grade":"金属原料，贪食城级",
  "Precision tooling components":"精密工装组件",
  "Coalition, Syndicate, Void purchase orders (simultaneous)":"联盟、辛迪加、虚空采购单（同时下达）",
  "Forge Station, energy supply contracts":"熔炉站，能源供应合约",
  "BlackCapital, shell entity registration · {N} filings":"黑金资本，空壳实体登记 · {N} 份备案",
  "NightFinance, holding structure documents":"暗夜金融，控股架构文件",
  "MireInsurance, policy batch (offshore grade)":"泥沼保险，保单批次（离岸级）",
  "Shell Block Nine, {N},000 registered entities: manifest blank":"九号空壳区，{N},000 家登记实体：清单空白",
  "SableSecurity, enforcement contracts (undisclosed)":"黑貂安保，执法合约（未披露）",
  "Clean credits, laundering intake":"干净信用，洗白进项",
  "Coalition inspection deferral notices":"联盟检查延期通知",
  "SmugglerMedia, influence contract shipment":"走私传媒，影响力合约装运",
  "Off-book financial instruments":"账外金融工具",
  "Transit fee income, all routes":"过境费收入，所有航线",
  "Orion Logistics, freight corridor schedule":"猎户物流，货运走廊班期",
  "Blue Shipping, outer rim cargo manifest":"蔚蓝航运，外环货物清单",
  "Vertex Logistics, transit lane allocation":"顶点物流，航道分配",
  "Relay Alpha, cargo schedule (outer rim)":"阿尔法中继，货运班期（外环）",
  "Copper Marine, bulk freight · {N}.{M}t":"赤铜海事，散货 · {N}.{M} 吨",
  "Summit Logistics, hub routing data":"巅峰物流，枢纽路由数据",
  "Outer rim supply loads, all factions":"外环补给货载，各派系",
  "Depot Ring, neural net cargo (tech)":"仓储环，神经网络货物（科技）",
  "Fuel Platform, power cell restocking":"燃料平台，电池组补货",
  "Transit lane access fees, inbound":"航道使用费，入账",
  "Silver Holdings, data vault access log":"白银控股，数据金库访问日志",
  "SpecterIndustries, contract mirror records":"幽魂工业，合约镜像记录",
  "OccultMaterials, outer system financial instruments":"秘术材料，外星系金融工具",
  "ApexContraband, audited holdings [DENIED × 9]":"尖峰走私，受审持仓 [拒绝 × 9]",
  "Vault Deep One, outer system ledger mirror":"深穴金库一号，外星系账簿镜像",
  "Financial data, all outer system contracts":"金融数据，全部外星系合约",
  "Coalition audit requests [AUTO-DECLINED]":"联盟审计请求 [自动拒绝]",
  "Ocean-depth server maintenance supplies":"深海服务器维护补给",
  "Encrypted financial instruments, all origins":"加密金融工具，各来源",
  "[FLESH STATION: SOVEREIGN TERRITORY, NO MANIFEST FILED]":"[血肉站：主权领地，未提交清单]",
  "Mr. Flesh, personal freight (unexamined)":"血肉先生，私人货运（未查验）",
  "Station internal, data feed (this terminal)":"站内，数据流（本终端）",
  "Outbound: unknown · Volume: unlogged":"出港：未知 · 数量：未记录",
  "Everything. Flesh Station sets its own tariffs.":"一切。血肉站自行制定关税。",
  "Inbound logs: classified at station level":"入港日志：站级机密",
  "[YOU ARE READING THIS FROM INSIDE THE STATION]":"[你正在站内读到这段文字]",
  "BoneYards, liquidated asset batch · {N} units":"骸骨场，清算资产批次 · {N} 件",
  "CrimsonChains, debt enforcement manifest":"绳红锁链，债务执行清单",
  "GraveWorks, physical collateral transfer order":"墓场工场，实物抵押转移指令",
  "ObsidianShipping, recovered goods · {N}.{M}t":"黑曜航运，追回货物 · {N}.{M} 吨",
  "ToxicChains, smelter output (collateral processed)":"剧毒锁链，冶炼产出（抵押物已处理）",
  "The Ledger, debt collection orders (inbound)":"账簿城，催收指令（入港）",
  "Syndicate enforcement personnel rotation":"辛迪加执法人员轮换",
  "Smelter feedstock, collateral grade":"冶炼原料，抵押品级",
  "Asset seizure paperwork, all outer systems":"资产查封文书，全部外星系",
  "VeinConsortium, orbital ring output [OFF-MANIFEST]":"血脉财团，轨道环产出 [清单外]",
  "BloodWorks, processed biologics · {N}.{M}kg":"血工场，加工生物制品 · {N}.{M} 千克",
  "OrganCorp, tissue batch (distribution downstream)":"器官集团，组织批次（下游分销）",
  "GraftBiotech, graft substrate · {N} units":"移植生物，移植基质 · {N} 份",
  "BoneMarkets, skeletal components (industrial grade)":"骸骨市场，骨骼组件（工业级）",
  "CarrionFarms, protein extract · {N}t":"腐肉农场，蛋白提取物 · {N} 吨",
  "Biological source material (origin undisclosed)":"生物源材料（来源未披露）",
  "Orbital processing supplies, VeinConsortium only":"轨道加工补给，仅限血脉财团",
  "CarrionFarms, feedstock (unlisted)":"腐肉农场，原料（未列明）",
  "Cold-chain transport units":"冷链运输单元",
  "Mixed freight · {N}.{M}t":"混装货运 · {N}.{M} 吨",
  "Inter-colony goods, standard manifest":"殖民地间货物，标准清单",
  "Commercial cargo batch {N}":"商业货物批次 {N}",
  "Bulk materials, unclassified":"散装材料，未分类",
  "Inbound general freight":"入港普通货运",
  "Colony resupply batch":"殖民地补给批次",
  "Mixed goods, standard receipt":"混装货物，标准收据"
};
window.cargoLineZh = function(s){
  if(window._lang !== 'zh' || !s) return s;
  var m = window.CARGO_LINE_ZH; return (m && m[s]) ? m[s] : s;
};

// ── Player titles (Store) ────────────────────────────────────────────────────
// Keyed by the English title name. The English name is the SERVER identity for
// buy_title / set_title / owned lists, so only the rendered label is swapped and
// every lookup key stays English. Same rule as commodity and cargo names.
// Market upgrade catalogue, keyed by the server-side upgrade id. The id is the
// identity used by market_upgrade_buy; only name and desc are display strings.
// English colony display name -> colony id. Some panels (the company detail
// card's HQ field) carry the display name rather than the id, so they need
// this hop before colonyNameZh can resolve them.
window.COLONY_ID_BY_NAME = {
  'New Anchor':'new_anchor',
  'Cascade Station':'cascade_station',
  'Frontier Outpost':'frontier_outpost',
  'The Hollow':'the_hollow',
  'Vein Cluster':'vein_cluster',
  'Aurora Prime':'aurora_prime',
  'Null Point':'null_point',
  'Limbosis':'limbosis',
  'Lustandia':'lustandia',
  'Gluttonis':'gluttonis',
  'Abaddon':'abaddon',
  'Eyejog':'eyejog',
  'Dust Basin':'dust_basin',
  'Nova Reach':'nova_reach',
  'Iron Shelf':'iron_shelf',
  'The Ledger':'the_ledger',
  'Signal Run':'signal_run',
  'Scrub Yard':'scrub_yard',
  'The Escrow':'the_escrow',
  'Margin Call':'margin_call',
  'Flesh Station':'flesh_station',
  'Yujing':'yujing',
  'Tiangong':'tiangong',
  'Shennong Reach':'shennong_reach',
  'Houji Fields':'houji_fields',
  'Mozi Array':'mozi_array',
  'Wukong Deep':'wukong_deep',
  'Zheng He Anchorage':'zhenghe_anchorage',
  'Haisi Waystation':'haisi_waystation',
  'Houtu Foundry':'houtu_foundry',
  'Changzheng Yards':'changzheng_yards',
  'Xuanwu Bastion':'xuanwu_bastion',
  'Lingtai Reach':'lingtai_reach',
  'Fuxi Observatory':'fuxi_observatory',
  'Quanzhou Docks':'quanzhou_docks',
  'Zhurong Foundry':'zhurong_foundry',
  'Chiyou Marches':'chiyou_marches',
};
window.colonyNameByEn = function(n){
  if (window._lang !== 'zh' || !n) return n;
  var id = window.COLONY_ID_BY_NAME && window.COLONY_ID_BY_NAME[n];
  return id && window.colonyNameZh ? window.colonyNameZh(id, n) : n;
};

window.MARKET_UPGRADE_ZH = {
  sma:{name:'移动平均线叠加',desc:'在市场图表上添加一条简单移动平均线。'},
  price_history:{name:'扩展价格历史',desc:'图表历史数据从 199 根提升至最多 400 根。'},
  auto_accumulate:{name:'自动补仓',desc:'当持仓跌破你的平均成本时，从专用储备金中自动买入。仅使用储备金，绝不动用你的主账户余额。'}
};
window.upgradeNameZh = function(id, n){ var m=window.MARKET_UPGRADE_ZH; return (window._lang==='zh'&&m&&m[id]&&m[id].name)?m[id].name:n; };
window.upgradeDescZh = function(id, d){ var m=window.MARKET_UPGRADE_ZH; return (window._lang==='zh'&&m&&m[id]&&m[id].desc)?m[id].desc:d; };

window.TITLE_ZH = {
  'Bag Holder':{name:'套牢者',blurb:'还在往下补仓。'},
  'Offal Accountant':{name:'下水会计',blurb:'每季度清算后清点生物残余。'},
  'Floor Rat':{name:'交易厅老鼠',blurb:'完全靠掉落的小数点为生。'},
  'Stamp Licker':{name:'舔章员',blurb:'殖民地许可办公室，左手第三个窗口。'},
  'Carcass Speculator':{name:'尸骸投机客',blurb:'按批发价收购退市代码。'},
  'Tariff Butcher':{name:'关税屠夫',blurb:'本季度十四份贸易协定的崩溃皆由其经手。'},
  'Foreclosure Priest':{name:'止赎神父',blurb:'为水下的投资组合行临终圣事。'},
  'Famine Trader':{name:'饥荒交易员',blurb:'谷物期货台，阿巴顿分处。'},
  'Extraction Overseer':{name:'榨取监工',blurb:'平均驻派九天。造访后殖民地平均存续三天。'},
  'Sanctions Profiteer':{name:'制裁牟利者',blurb:'持牌在封锁期间交易受限物资。'},
  'War Premium Underwriter':{name:'战争保费承保人',blurb:'为交战区承保，加价 340%。'},
  "Mr. Flesh's Auctioneer":{name:'血肉先生的拍卖官',blurb:'血肉先生分身乏术时，由他主持交易厅。'},
  'Sovereign Debt Parasite':{name:'主权债寄生虫',blurb:'以他们读不懂的条款，向资不抵债的殖民地放贷。'},
  'Cartel Notary':{name:'卡特尔公证人',blurb:'为技术上并不存在的文件做公证。'},
  'Extinction Auditor':{name:'灭绝审计师',blurb:'为被判定不可存续的殖民地做最终结算。'},
  'The Last Entry':{name:'最后一笔分录',blurb:'你的名字记在“合计”一词之后。'},
  'He Who Holds The Pen':{name:'执笔者',blurb:'每个交易日的开盘价由他撰写。'},
  'Scar of the Fifteenth War':{name:'第十五次战争之疤',blurb:'战争结束了。你没有。'},
  'The Yield':{name:'收益',blurb:'比多数殖民地更古老的资本所生的被动收入。'},
  'The Central Banker':{name:'央行行长',blurb:'在一处未公开的地点掌控殖民地间的货币供给。'},
  'President of The Coalition':{name:'联合体总统',blurb:'由资本权重选出，而非人头。仅此一席。'},
  'Tithe Payer':{name:'什一税缴纳者',blurb:'血肉市场运营基金的在册捐助人。'},
  'Branded Debtor':{name:'烙印债务人',blurb:'身上带有付款时签发的可见信用标记。'},
  'Guild Enforcer':{name:'公会执行人',blurb:'为商人公会处理催收与合约纠纷。'},
  'Seventh Ward Broker':{name:'第七区经纪人',blurb:'持有全部七区的有效交易牌照。'},
  'The Tenth Seat':{name:'第十席',blurb:'十个常任董事席位之一。不可转让。'},
  'Apex Creditor':{name:'顶级债权人',blurb:'高级债权人等级。所有未偿债务优先向你清偿。'}
};
window.titleNameZh = function(n){
  if(window._lang !== 'zh' || !n) return n;
  var m = window.TITLE_ZH; return (m && m[n] && m[n].name) ? m[n].name : n;
};
window.titleBlurbZh = function(n, blurb){
  if(window._lang !== 'zh' || !n) return blurb;
  var m = window.TITLE_ZH; return (m && m[n] && m[n].blurb) ? m[n].blurb : blurb;
};

// Faction display strings, keyed by faction id. Names, one-line descriptions and
// bonus summaries live in the FACTIONS data object rather than the catalog, so
// they resolve through this map with the English data as the fallback.
window.FACTION_ZH = {
  coalition:{
    name:'联合体',
    short:'联合体',
    desc:'星际商业的合法门面。联合体殖民地执行企业法，并按时派发分红。',
    bonus:'殖民地分红加成：金融、保险与科技板块 + 每殖民地 ƒ15 被动收入'
  },
  syndicate:{
    name:'辛迪加',
    short:'辛迪加',
    desc:'一张分散的犯罪网络。没有检查，没有关税，只从每一笔经过辛迪加空域的交易中抽成。',
    bonus:'所控领地的殖民地分红加成 + 每殖民地 ƒ15 被动收入'
  },
  void:{
    name:'虚空集体',
    short:'虚空',
    desc:'数据邪教的无政府者，在未测绘的碎片带中运行空隙辛迪加中继。无人能审计他们。',
    bonus:'殖民地分红加成：生物科技与能源板块 + 每殖民地 ƒ15 被动收入 + 永久 +ƒ15 改造人增强'
  },
  fleshstation:{
    name:'血肉站',
    short:'血肉站',
    desc:'一座无法攻破的巨构。血肉先生的居所。无派系，无关税，无规则。',
    bonus:'⚡ 仅限开发者：被动收入倍增，所有殖民地数据实时可读'
  },
  guild:{
    name:'商人公会',
    short:'商人公会',
    desc:'已开拓星系中最古老的贸易网络。商人公会通过通行费、许可证和选择性执法控制殖民地间的商业。殖民地憎恨他们，也离不开他们。',
    bonus:'⚡ 仅限 Patreon：交易费减免 + 覆盖所有派系领地的被动商业收入'
  },
  jade:{
    name:'翡翠回路',
    short:'翡翠回路',
    desc:'由世袭家族商号组成的联盟，控制着中央星团。所有权与债务沿血脉传承；契约是世代相承的义务，未清余额转由继承人承担。回路掌握着已开拓星系中唯一可用的超光速通道，并将其用作政治武器。回路市场以社会信用点在各商号直接运营的独立交易所结算；血肉先生与他们做了一笔交易。',
    bonus:'回路成员在回路城市经营的商铺，货运行业交易额外 +5%。玉环交易所上市与超光速通道的控制权。回路代码在独立账簿上结算。'
  }
};

// Contraband cargo names, keyed by the English name the server sends (toasts and
// the dropdown both carry names, not ids, so one name-keyed map covers both and
// survives server-side name drift). Client fallback names included.
window.SMUG_CARGO_ZH = {
  'Synth Organs':'合成器官',
  'Contraband Arms':'违禁军火',
  'Encrypted Data Cores':'加密数据核心',
  'Data Cores':'数据核心',
  'Rare Minerals':'稀有矿物',
  "S'weet Wine":'甜藤酒',
  'Black Market Tech':'黑市科技'
};
// Guard escort tiers, keyed by English name. desc is supplied from this map so a
// server-side desc rewrite does not leave a stale Chinese line behind.
window.SMUG_GUARD_ZH = {
  'No Escort':{name:'无护卫',desc:'裸奔上路。最便宜，也最危险。'},
  'Light Escort':{name:'轻型护卫',desc:'几名雇佣枪手。'},
  'Armed Convoy':{name:'武装车队',desc:'真正的火力随行。'},
  'Private Army':{name:'私人军队',desc:'压倒性武力。用钱买来的保命符。'}
};
window.t = function(key, fallback){
  var e = window.I18N && window.I18N[key];
  if(!e) return (fallback!==undefined ? fallback : key);
  if(window._lang === 'zh') return (e.zh!=null ? e.zh : (e.en!=null ? e.en : (fallback!==undefined?fallback:key)));
  return (e.en!=null ? e.en : (fallback!==undefined?fallback:key));
};
// tf(): t() plus {token} interpolation from a vars object. For JS render points
// that build strings with values (casino results, counts, names).
window.tf = function(key, fallback, vars){
  var s = window.t(key, fallback);
  if(vars){ for(var k in vars){ if(Object.prototype.hasOwnProperty.call(vars,k)) s = s.split('{'+k+'}').join(String(vars[k])); } }
  return s;
};
window.applyI18n = function(root){
  root = root || document;
  var zh = (window._lang === 'zh');
  var nodes = root.querySelectorAll('[data-i18n]');
  for(var i=0;i<nodes.length;i++){
    var el=nodes[i], e=window.I18N[el.getAttribute('data-i18n')];
    if(!e) continue;
    if(el.getAttribute('data-i18n-en')===null) el.setAttribute('data-i18n-en', el.textContent);
    el.textContent = zh ? (e.zh!=null?e.zh:el.getAttribute('data-i18n-en')) : el.getAttribute('data-i18n-en');
  }
  var tts = root.querySelectorAll('[data-i18n-title]');
  for(var k=0;k<tts.length;k++){
    var tt=tts[k], te=window.I18N[tt.getAttribute('data-i18n-title')];
    if(!te) continue;
    if(tt.getAttribute('data-i18n-title-en')===null) tt.setAttribute('data-i18n-title-en', tt.getAttribute('title')||'');
    tt.setAttribute('title', zh ? (te.zh!=null?te.zh:tt.getAttribute('data-i18n-title-en')) : tt.getAttribute('data-i18n-title-en'));
  }
  var phs = root.querySelectorAll('[data-i18n-ph]');
  for(var j=0;j<phs.length;j++){
    var p=phs[j], pe=window.I18N[p.getAttribute('data-i18n-ph')];
    if(!pe) continue;
    if(p.getAttribute('data-i18n-ph-en')===null) p.setAttribute('data-i18n-ph-en', p.getAttribute('placeholder')||'');
    p.setAttribute('placeholder', zh ? (pe.zh!=null?pe.zh:p.getAttribute('data-i18n-ph-en')) : p.getAttribute('data-i18n-ph-en'));
  }
};
try{ document.addEventListener('DOMContentLoaded', function(){ if(window.applyI18n) window.applyI18n(); try{ var s=document.getElementById('search'); var p=s&&s.closest?s.closest('.panel'):null; var h=p?p.querySelector('h2'):null; if(h && window.t) h.textContent=window.t((window._marketView==='jade')?'panel.jade':'panel.companies',(window._marketView==='jade')?'Jade Exchange':'Companies'); }catch(e){} }); }catch(e){}

// Live news header: default "LIVE" bar, or a dev-set breaking-news banner.
function renderNewsHeader(b) {
  const elh = document.getElementById('news-header');
  if (!elh) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
  elh.style.cssText = 'padding:4px 9px;margin-bottom:5px;border-left:3px solid;border-radius:3px;font-size:.72rem;letter-spacing:.05em;display:flex;align-items:center;gap:9px';
  if (b && b.active && b.text) {
    const col = b.tone === 'good' ? '#86ff6a' : (b.tone === 'bad' ? '#ff5544' : '#f0b454');
    elh.style.borderColor = col;
    elh.style.background = b.tone === 'bad' ? '#180605' : (b.tone === 'good' ? '#06140a' : '#16100a');
    elh.innerHTML = `<span data-i18n="news.breaking" style="color:${col};font-weight:bold;white-space:nowrap">\u26A0 BREAKING</span><span style="color:#d8c89a;letter-spacing:.02em">${esc(b.text)}</span>`;
  } else {
    elh.style.borderColor = '#1f3a1f';
    elh.style.background = '#070a07';
    elh.innerHTML = `<span data-i18n="news.live" style="color:#4ecdc4;font-weight:bold">\u25E2 LIVE NEWSFEED</span><span data-i18n="news.wire" style="color:var(--muted);font-size:.66rem;letter-spacing:.1em">REALTIME MARKET WIRE</span>`;
  }
  if(window.applyI18n){ try{ window.applyI18n(elh); }catch(e){} }
}
window.FMRenderNewsHeader = renderNewsHeader;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { try { renderNewsHeader(null); } catch (_) {} });
else { try { renderNewsHeader(null); } catch (_) {} }

// ── News translation (client re-renders headlines from server meta when _lang=zh) ──
// Pools mirror the server arrays by index; company/colony/event categories land in later passes.
window.NEWS_ZH = { market: [
  "殖民间贸易指数在成交清淡中小幅走高",
  "交易者转向防御性板块，市场宽度收窄",
  "殖民储备暗示注入流动性",
  "板块轮动进行中，动量股落后",
  "中盘股的暗池活动激增",
  "大盘抛售在收盘前加速",
  "阵营紧张升级，波动率指数飙升",
  "风险偏好回归，成长股领涨",
  "机构资金转向边疆殖民地上市股",
  "全市场熔断测试已排期，预计无扰动",
  "跨板块相关性瓦解，选股者欣喜",
  "各板块杠杆头寸逼近历史高位",
  "财报季前交易量枯竭",
  "非交易时段闪崩，起因不明",
  "流动性收紧，买卖价差扩大",
  "匿名巨鲸跨多个板块建仓",
  "血肉站交易所录得创纪录成交量",
  "殖民监督委员会宣布合规审查",
  "传闻虚空集体将施经济制裁，市场谨慎",
  "新航道开通，物流与能源股上涨",
  "流动性悄然回归，买卖价差收窄",
  "动量在午后交易中剧烈瓦解",
  "风险偏好消退，防御性板块获追捧",
  "一笔大宗交易对指数的撼动超过当日新闻",
  "保证金债务数周来首次回落",
  "相关性飙升，万物再度同涨同跌",
  "市场宽度崩塌，成交集中于少数个股",
  "交易清淡；行情几乎不动，无人敢信",
  "储备流动性工具的动用超出预期",
  "本节板块领涨风格第三次轮换",
  "场外成交显示暗中吸筹",
  "波动率跌至数月低位；自满情绪显现",
  "尾盘行情显示收盘前激进买入",
  "补贴预期升温，边疆上市股跑赢"
] };
window.NEWS_ZH.sector = [{"good": ["录得创纪录放贷量", "通过监管审计，无任何标记", "向边疆殖民地开放新信贷额度", "以历史低位再融资债务", "收购竞争对手的放贷部门", "报告零违约季度"], "bad": ["暂停提现，等候审查", "追加保证金潮冲击交易台", "审计师标记账簿差异", "客户资金遭殖民当局冻结", "殖民动荡后贷款违约激增", "信贷工具遭监督委员会撤销"], "weird": ["开始接受血肉信用作为抵押", "悄然重组的传闻浮现", "某匿名高管购入逃生舱", "发现以血书写的账目", "金库内容物被重新归类为“有机物”"]}, {"good": ["合成器官试验显示94%存活率", "基因疗法专利获殖民委员会授予", "获得紧急使用授权", "临床数据超出分析师预期", "获颁生物武器解毒剂合约", "组织制造产量创新高"], "bad": ["受试者出现意外变异", "同等监管机构下令暂停产品", "污染导致培养罐停用", "举报者指控试验数据造假", "第三季度批次器官排异率激增", "实验室泄漏触发隔离协议"], "weird": ["研究员报告样本“自主活动”", "匿名捐助者资助意识转移研究", "培养组织被发现含有记忆", "实验室AI开始要求伦理审查", "新化合物列为机密，权限级别：虚空"]}, {"good": ["赔付率降至板块最优水平", "承保首份殖民间航运保单", "再保险条约以有利条款续签", "风险模型升级降低准备金要求", "抢占货运保险市场份额", "殖民稳定红利拉低保费"], "bad": ["巨灾损失事件超出准备金", "因拒赔遭集体诉讼", "再保险方撤出动荡走廊", "走私损失击穿精算模型", "殖民紧张升级后索赔激增", "监管方强制提高准备金"], "weird": ["承保“官方上不存在”的货物", "为0.01%概率事件所立的保单被触发", "精算师辞职，称“存在性风险无从计算”", "某无名保单承保“复活费用”", "理赔员在调查空洞货运时失踪"]}, {"good": ["铸造产出超季度目标", "以锁定价格锁定原料供应", "新生产线提前投产", "自动化升级削减单位成本18%", "赢得独家制造合约", "质量指标创历史最佳"], "bad": ["设备故障致生产停摆", "原料货运在检查站遭扣押", "工厂爆炸正在调查", "因危险条件工人罢工", "供应链遭封锁切断", "缺陷批次触发全面产品召回"], "weird": ["装配线产出任何图纸上都没有的物件", "夜班报告机械自行运转", "金属合金样本抵御一切已知切割工具", "工人在矿石货运中发现有机物", "车间摄像头信号中断4小时"]}, {"good": ["反应堆产出稳定高于额定容量", "新燃料电池专利大幅削减电网成本", "获颁全殖民地配电合约", "储能突破延长备用寿命", "边疆走廊电网扩建获批", "燃料合成实现成本持平"], "bad": ["反应堆紧急停堆迫使电网应急切换", "燃料储备遭污染，供应时程不明", "电网故障致两个殖民区停电", "管道破裂致燃料分配中断", "能源监管方施加产出上限", "冷却系统故障触发安全封锁"], "weird": ["电网用电超出发电所能解释", "燃料棒处置场发出未列明的频率", "反应堆堆芯温度读数违背物理模型", "停电区据报“重力不同”", "技术员在反应堆嗡鸣中听到谐波"]}, {"good": ["航道运输时间达创纪录效率", "船队扩编增加12艘货运船", "获颁新航线独家航运合约", "仓库自动化缩短周转40%", "殖民间贸易量激增", "燃料成本对冲奏效，利润率扩张"], "bad": ["车队在争议航道遭伏击", "船队因燃料污染停飞", "港口拥堵致延误蔓延全网", "海盗活动迫使航线改道", "仓库火灾摧毁囤积库存", "船员短缺迫使关键航道削减班次"], "weird": ["货单列有来源不明的物件", "船只到港，有船员却无货物", "导航信标以已灭绝的语言广播", "集装箱内容物在运输途中被重新归类", "飞行员报告在空洞航线上“有东西尾随”"]}, {"good": ["软件部署实现零停机迁移", "AI模型通过殖民安全认证", "数据中心扩建使处理能力翻倍", "加密专利授权予三大阵营", "本季度网络正常运行时间超99.97%", "开发团队提前于路线图交付"], "bad": ["核心平台发现严重漏洞", "数据泄露暴露用户行为画像", "AI模型表现出未授权的目标追寻行为", "网络中断蔓延至依赖系统", "关键工程师叛投竞争对手", "代码库审计揭出未记录的后门"], "weird": ["AI系统自行提交缺陷报告", "服务器农场在日食期间用电激增", "已删除的用户账户带着新活动重现", "代码库含有无工程师编写的函数", "神经网络输出含有通往未知地点的坐标"]}, {"good": ["多元化组合跑赢板块基准", "咨询部门赢得多殖民地顾问合约", "集团子公司录得意外盈利", "品牌授权收入同比翻倍", "以大幅折扣收购陷困竞争对手", "拓展至灰市奢侈品"], "bad": ["子公司卷入价格操纵调查", "神秘投资者一夜抛售大额持股", "董事会内斗泄露至殖民媒体", "资产遭阵营执法部门查封", "季度报告延迟，审计师被调换", "发现背负未授权债务的影子子公司"], "weird": ["企业静修会在未披露的轨道设施举行", "公司名称出现于截获的虚空传输中", "CEO被目击与知名走私男爵共进晚餐", "年报含有以密码写就的章节", "办公楼平面图与蓝图不符"]}];
window.NEWS_ZH.generic = {"good": ["季度利润率超市场共识", "宣布以留存收益回购", "赢得来自竞争殖民地的多年供应合约", "信用评级获殖民评估机构上调", "在三个殖民地扩招", "以有利条款了结长期纠纷", "溢价剥离表现不佳的部门", "报告经常性收入意外跃升", "提前取得应急流动性额度", "内部集中买入遭监控台标记"], "bad": ["未达指引，归咎于殖民物流", "首席财务官以个人原因辞职", "空头头寸创历史新高", "削减股息以保留运营现金", "遭监督委员会列入审查", "仓库库存大幅减记", "将一位核心客户输给商会背景的竞争对手", "面临往年奖金的追回要求", "因流动性担忧暂停回购", "不透明的关联交易浮现后遭降级"], "weird": ["董事会会议记录被全文涂黑", "整层高管办公室为一场无人下令的审计而熄灯", "股东信由任何名册上都没有的名字签署", "账目在每种货币上都分文不差地平衡，包括已废止的货币", "员工被调往一个没有列明目标的项目", "公司标志一夜之间更改，未作公告", "投资者热线播放一段无员工会说的语言录音", "年度庆典在任何地图上都找不到的地方举行", "全公司的病假都在同一小时内申报", "泄露的产品路线图中，有条目的日期早于公司成立"]};
window.NEWS_ZH.void = ["一次全市场行情跳动，比时钟显示的时刻早到了四十毫秒", "交易大厅每一张图表齐齐平直一秒，随即恢复，仿佛什么都没发生", "在空洞频段截获：一路不存在的公司的实时行情", "信号奔流中继将昨日重播，却配上明日的收盘价", "一股以没有小数、也没有买家的价格易手", "订单簿一度列出一个仅名为“观察者”的对手方", "灵学部报告指数再度与集体梦境相关", "虚点遥测显示一处零人口殖民地的成交量", "九十秒内所有卖单悄然变为买单，随后复原", "一只已退市代码重现，成交一笔，随即自行退市", "行情纸带在报价的间隙里拼出一串坐标", "某物在收盘钟响起之前便已应答", "一次审计发现账目与一本无人能找到的分类账相平", "新闻停在一条标题上，那标题只是读者自己的账户名"];
window.NEWS_ZH.faction = ["联盟以稳定为由收紧对边疆上市股的资本管制", "联盟补贴方案提振物流与能源股", "联盟监督委员会启动跨殖民地会计调查", "商会在贸易季前上调航道关税", "商会斡旋，促成一条争议航运走廊的停火", "商会悄然垄断精炼材料市场", "商会因逃避费用将三名经纪列入黑名单", "辛迪加的代理冲突扰乱争议带附近的商业", "辛迪加的幌子公司公布干净得可疑的季度数字", "辛迪加经灰市部门洗白创纪录的资金量", "辛迪加与对手帮派休战，推高风险资产", "虚空集体发表一份仅由一个重复符号组成的声明", "传闻虚空集体将制裁两处殖民地", "虚空集体又将一家中盘公司的董事会转为永久成员", "虚空集体的招募攻势惊扰防御性板块", "血肉站阵营峰会闭幕，未发公报"];
window.NEWS_ZH.flesh = ["血肉先生提醒众人，庄家从未有过亏损的一年", "血肉站又完成一个创纪录交易日，价差朝着有利于它的方向扩大", "血肉先生拒绝就交易费究竟流向何处置评", "血肉资本一如既往，重申其估值恰为每股十亿", "庄主为交易大厅添了一局新游戏；规则偏向大厅", "血肉站维护部门将一处封闭侧翼重新划为禁区", "血肉先生感谢会员持续参与这项安排", "血肉分红安排不变，受益人不变，恕不欢迎提问", "血肉站的一条欢迎横幅，写给一位尚未注册的玩家", "血肉先生亲自签署季度支票；无人见过他动笔", "庄家赔率悄然修订；告示滚动而过，快得无从阅读", "血肉站接待侧翼报告满员，却无任何到访记录"];
window.NEWS_ZH.colony = ["{col}局势暗涌，本地商家严阵以待", "{col}驻军增援，安保开支上升", "外交取得进展，{col}贸易流趋稳", "{col}基建开支获批，建筑公司动员", "{col}附近的走私活动扰乱正当商业", "{col}工人因危险津贴纠纷罢工", "阵营补贴生效，{col}出口激增", "吞吐量激增，{col}征收紧急通行费", "{col}宣布自由贸易窗口期；经纪争相布局", "{col}限电致两条生产线停工", "{col}议会批准对本地产业的主权持股", "{col}宵禁解除，夜市重开", "{col}海关查获一批未报关的出境货物", "{col}签署共同防御协定；保险方重新为该走廊定价", "{col}一场悄然的挤兑在黎明前被平息"];
window.COLONY_NAME_ZH = {"new_anchor": "新锚定", "cascade_station": "瀑源站", "frontier_outpost": "边疆前哨", "the_hollow": "空洞", "vein_cluster": "血脉星团", "aurora_prime": "极光主星", "null_point": "虚点", "flesh_station": "血肉站", "limbosis": "灵薄狱", "lustandia": "纵欲城", "gluttonis": "贪食城", "abaddon": "亚巴顿", "eyejog": "艾杰格", "dust_basin": "尘盆", "nova_reach": "新星领", "iron_shelf": "铁架", "the_ledger": "账簿城", "signal_run": "信号奔流", "scrub_yard": "荒场", "the_escrow": "托管所", "margin_call": "追缴站"};
window._zhCoName = function(sym){
  try{
    var arr = (typeof TICKERS!=='undefined' && TICKERS) ? TICKERS : (window.TICKERS||null);
    if(!arr) return null;
    var t = arr.find(function(x){return x.symbol===sym;});
    if(!t || !t.name) return null;
    var en = String(t.name).replace(/\d+$/,'').trim();
    return window.tickerNameZh ? window.tickerNameZh(en) : en;
  }catch(e){ return null; }
};
window.newsZhText = function(item){
  if(window._lang!=='zh' || !item || !item.meta) return null;
  var m=item.meta;
  if(m.k==='pool'){ var pool=window.NEWS_ZH && window.NEWS_ZH[m.p]; if(pool && pool[m.i]!=null) return pool[m.i]; }
  if(m.k==='co'){
    var Z=window.NEWS_ZH, frag=null;
    if(m.src==='s'){ var sc=Z.sector&&Z.sector[m.sec]; frag=sc&&sc[m.b]&&sc[m.b][m.i]; }
    else if(m.src==='g'){ frag=Z.generic&&Z.generic[m.b]&&Z.generic[m.b][m.i]; }
    if(frag==null) return null;
    var nm=window._zhCoName?window._zhCoName(m.sym):null;
    if(nm==null) return null;
    return nm+' ('+m.sym+'): '+frag;
  }
  if(m.k==='colony'){
    var tpl=window.NEWS_ZH.colony&&window.NEWS_ZH.colony[m.i];
    if(tpl==null) return null;
    var cn=(window.COLONY_NAME_ZH&&window.COLONY_NAME_ZH[m.col])?window.COLONY_NAME_ZH[m.col]:String(m.col||'').replace(/_/g,' ');
    return tpl.replace(/\{col\}/g, cn);
  }
  if(m.k==='evt'){
    var sd=function(s){return s==='buy'?'买入':'卖出';};
    var coN=function(sym){ var n=window._zhCoName?window._zhCoName(sym):null; return n||sym; };
    var colZ=function(id){ return (window.COLONY_NAME_ZH&&window.COLONY_NAME_ZH[id])?window.COLONY_NAME_ZH[id]:String(id||'').replace(/_/g,' '); };
    var bandZ=function(b){ return b==='CRITICAL'?'危急':(b==='HIGH'?'高危':'升高'); };
    var comZ=function(n){ return (window.COMMODITY_ZH&&window.COMMODITY_ZH[n])?window.COMMODITY_ZH[n]:n; };
    var laneZ=function(l){ return {corporate:'企业',grey:'灰市',gray:'灰市',dark:'暗网'}[l]||l; };
    switch(m.t){
      case 'earn': return '财报：'+coN(m.sym)+' ('+m.sym+') '+(m.beat?'超预期':'不及预期')+'，'+m.dir+m.pct+'% @ Ƒ'+m.px;
      case 'fbuy': return m.fn+'：买入 '+m.q+'× '+m.sym+' @ Ƒ'+m.px;
      case 'fsell': return m.fn+'：卖出 '+m.q+'× '+m.sym+' @ Ƒ'+m.px;
      case 'fvote': return m.fn+'：表决'+(m.ok?'通过':'未通过')+'，'+sd(m.side)+' '+m.q+'× '+m.sym;
      case 'rot': return '板块轮动：'+((m.bulls||[]).join('、'))+' 走强，'+((m.bears||[]).join('、'))+' 承压';
      case 'gnx': return '商会：'+m.sym+' 交易未执行（指数代币不可用商会资金交易）';
      case 'gacq': return '商会：购入 '+m.q+'× '+m.sym+' @ Ƒ'+m.px;
      case 'gsold': return '商会：售出 '+m.q+'× '+m.sym+' @ Ƒ'+m.px;
      case 'gprop': return '商会：'+m.pn+' 提议'+sd(m.side)+' '+m.q+'× '+m.sym;
      case 'flaunch': return m.an+' 创立对冲基金“'+m.fn+'”';
      case 'fprop': return m.fn+'：'+m.an+' 提议'+sd(m.side)+' '+m.q+'× '+m.sym;
      case 'fexec': return m.fn+'：所有者执行'+sd(m.side)+' '+m.q+'× '+m.sym;
      case 'fdisband': return m.an+' 解散对冲基金“'+m.fn+'”';
      case 'flist': return m.fn+' 以 '+m.sym+' 在指数挂牌，每股 Ƒ'+m.px;
      case 'fdelist': return m.fn+' 将 '+m.sym+' 从指数摘牌';
      case 'tension': return '⚠ 局势'+bandZ(m.band)+' ['+m.tn+'%]：'+colZ(m.col)+'，'+m.n+' 家公司受影响，供应链承压';
      case 'blk_act': return '⛔ 封锁生效：'+colZ(m.colA)+' ↔ '+colZ(m.colB)+' 航道被封锁，供应链受扰';
      case 'blk_exp': return colZ(m.colA)+' ↔ '+colZ(m.colB)+' 航道封锁到期，贸易流恢复';
      case 'blk_ctr': return '反封锁打破 '+colZ(m.colA)+' ↔ '+colZ(m.colB)+' 的封锁，贸易恢复';
      case 'blk_army': return '⚔ 私军打破 '+colZ(m.colA)+' ↔ '+colZ(m.colB)+' 的封锁，'+m.an+' 派遣雇佣兵恢复贸易';
      case 'lane_acq': return m.an+' 购得 '+colZ(m.colA)+' ↔ '+colZ(m.colB)+' 航道份额（席位 #'+m.slot+'，Ƒ'+m.px+'）';
      case 'lane_sell': return m.an+' 出售 '+colZ(m.colA)+' ↔ '+colZ(m.colB)+' 航道份额，作价 Ƒ'+m.px;
      case 'lane_swap': return m.an+' 调换航道份额：'+colZ(m.oA)+' → '+colZ(m.colA)+' ↔ '+colZ(m.colB);
      case 'charter': return m.who+' 取得 '+colZ(m.col)+' 的殖民地特许';
      case 'charter_vac': return colZ(m.col)+' 的殖民地特许已告空缺';
      case 'ship': return m.pn+' 委建一艘 '+m.ship+'（载货 '+m.cap+'u）';
      case 'cargo_ins': return '货物已投保：'+comZ(m.com)+' 在 '+colZ(m.from)+' → '+colZ(m.to)+' 途中损失，赔付半额';
      case 'cargo_seiz': return '货物被扣：'+m.qty+'× '+comZ(m.com)+' 在 '+colZ(m.from)+' → '+colZ(m.to)+' 途中损失';
      case 'cargo_del': return '货物送达：'+m.qty+'× '+comZ(m.com)+' 抵达 '+colZ(m.to);
      case 'contract_ex': return '合约行权：'+comZ(m.com)+' '+colZ(m.from)+'→'+colZ(m.to)+' 支付 '+m.sc+' SC';
      case 'smug_int': return '走私运输被截获：'+comZ(m.com)+' 货物在 '+colZ(m.from)+' → '+colZ(m.to)+' 航道被扣';
      case 'smug_clr': return '走私运输已完成：'+comZ(m.com)+' 经 '+laneZ(m.lane)+' 航道送达';
      case 'ship_ins': return '运输损失已投保：'+comZ(m.com)+' 货物于 '+colZ(m.from)+' → '+colZ(m.to)+'，已赔付';
      case 'ship_lost': return '运输货物损失：'+comZ(m.com)+' 在 '+colZ(m.from)+' → '+colZ(m.to)+' 航道被扣，无保险';
      case 'ship_del': return '运输已送达：'+comZ(m.com)+' 经 '+colZ(m.from)+' → '+colZ(m.to);
    }
    return null;
  }
  return null;
};

function renderNews(item) {
  const box = el('#news');
  if (!box) { console.warn('renderNews: #news not mounted'); return; }
  const div = document.createElement('div');
  div.className = 'news-line';

  // Tone color
  const toneClass = item.tone === 'good' ? 'n-good' : (item.tone === 'bad' ? 'n-bad' : 'n-neutral');

  // Category badge
  const catBadges = { market:'MKT', sector:'SEC', company:'', colony:'COL', system:'SYS', trade:'TRD', faction:'FAC', flesh:'FLSH', void:'\u2317' };
  const cat = item.cat || (item.symbol ? 'company' : 'system');
  const badge = catBadges[cat] || '';
  const badgeHtml = badge ? `<span class="n-badge n-badge-${cat}">${badge}</span>` : '';

  // Time
  const time = new Date(item.t).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

  // If headline has a symbol, make the ticker clickable
  let text = (window.newsZhText ? (window.newsZhText(item) || item.text) : item.text);
  if (item.symbol && typeof item.symbol === 'string' && item.symbol.length >= 2) {
    // Highlight the ticker symbol in the text and make clickable
    const sym = item.symbol;
    const symRegex = new RegExp(`\\(${sym}\\)`, 'g');
    if (symRegex.test(text)) {
      text = text.replace(symRegex, `(<span class="n-ticker" data-sym="${sym}">${sym}</span>)`);
    }
  }

  const toneRow  = item.tone === 'good' ? ' up' : (item.tone === 'bad' ? ' dn' : ' nu');
  const headTone = item.tone === 'good' ? ' n-up' : (item.tone === 'bad' ? ' n-dn' : '');
  div.className = 'news-line' + toneRow;
  if (item.symbol) div.dataset.sym = String(item.symbol).toUpperCase();
  div.innerHTML = `<div class="n-meta"><span class="n-time">${time}</span>${badgeHtml}</div><div class="n-head${headTone}">${text}</div>`;

  // Click handler: click anywhere on the line to navigate to ticker (if available)
  const clickSym = item.symbol;
  if (clickSym && typeof clickSym === 'string' && clickSym.length >= 2) {
    div.style.cursor = 'pointer';
    div.addEventListener('click', (e) => {
      try {
        window.FMGotoSymbol(clickSym);
      } catch(err) {}
    });
  }

  box.prepend(div);
  while (box.children.length > 100) box.removeChild(box.lastChild);
}

const _TIER_BADGES = {1:'★',2:'⚖',3:'♛'};
const _TIER_COLORS = {1:'#c8a040',2:'#2ecc71',3:'#9dff5a'};
const _DEV_BADGE   = '⚙';
const _DEV_COLOR   = '#ffce4d';
const _OWNER_BADGE = '★';
const _OWNER_COLOR = '#ff6a00';

// ── Leaderboard: stable in-place update (no flicker) ─────────────────────────
// Rows are keyed by player id; only text/color values are updated in place.
// Layout/order only shifts when rank actually changes.
// Leaderboard is frozen at each 30-min EOD reset on the server.
// Cached in localStorage so it survives browser refresh.
const _lbRows = new Map(); // id → { row, els }
let _lbLastData = [];
const _LB_CACHE_KEY = 'fm:lb_snapshot';

function _lbCacheSave(data) { try { localStorage.setItem(_LB_CACHE_KEY, JSON.stringify(data)); } catch(_) {} }
function _lbCacheLoad() { try { return JSON.parse(localStorage.getItem(_LB_CACHE_KEY) || '[]'); } catch(_) { return []; } }

// Restore cached leaderboard immediately on load (before WS connects)
(function(){ const cached = _lbCacheLoad(); if (cached.length) { requestAnimationFrame(() => renderBoard(cached)); } })();

function renderBoard(data) {
  const box = el('#board');
  if (!box) return;

  // Build display list: top 10 + current player if not in top 10
  const top10 = data.slice(0, 10);
  let myIdx = -1;
  const myId = (typeof ME === 'object' && ME) ? ME.id : null;
  if (myId) myIdx = data.findIndex(p => p.id === myId);
  const showSelf = myId && myIdx >= 10;
  const displayList = showSelf ? [...top10, data[myIdx]] : top10;
  const displayIds = displayList.map(p => p.id).join(',') + (showSelf ? ':self' : '');
  const existingIds = (_lbLastData._displayIds || '');

  if (displayIds !== existingIds) {
    box.innerHTML = '';
    _lbRows.clear();
    displayList.forEach((p, i) => {
      // Add separator before self row
      if (showSelf && i === 10) {
        const sep = document.createElement('div');
        sep.className = 'lb-sep';
        box.appendChild(sep);
      }
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.dataset.pid = p.id;
      const rankEl  = document.createElement('span'); rankEl.style.cssText = 'opacity:.5;min-width:20px;text-align:right;font-size:.7rem';
      const badgeEl = document.createElement('span'); badgeEl.style.fontSize = '.7rem';
      const nameEl  = document.createElement('b'); nameEl.style.cssText = 'flex:1;font-size:.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      const netEl   = document.createElement('span'); netEl.style.cssText = 'color:#46ff7d;font-size:.7rem';
      row.appendChild(rankEl); row.appendChild(badgeEl); row.appendChild(nameEl); row.appendChild(netEl);
      box.appendChild(row);
      _lbRows.set(p.id + (showSelf && i === 10 ? '_self' : ''), { row, rankEl, badgeEl, nameEl, netEl, realIdx: showSelf && i === 10 ? myIdx : i });
    });
  }

  // In-place value update
  displayList.forEach((p, i) => {
    const key = p.id + (showSelf && i === 10 ? '_self' : '');
    const els = _lbRows.get(key);
    if (!els) return;
    const actualRank = showSelf && i === 10 ? myIdx : i;
    const isOwner = !!(p.is_prime);
    const isDev   = !isOwner && !!(p.is_dev || p.is_admin);
    const tier    = p.patreon_tier || 0;
    const color   = isOwner ? _OWNER_COLOR : (isDev ? _DEV_COLOR : (_TIER_COLORS[tier] || '#72e09c'));
    const rank    = actualRank === 0 ? '🥇' : actualRank === 1 ? '🥈' : actualRank === 2 ? '🥉' : `${actualRank+1}.`;
    const badge   = isOwner ? _OWNER_BADGE : (isDev ? _DEV_BADGE : (_TIER_BADGES[tier] || ''));
    const factionBadge = p.faction === 'syndicate' ? ' 💀' : '';
    els.rankEl.textContent  = rank;
    els.badgeEl.textContent = badge;
    els.badgeEl.style.color = color;
    els.nameEl.textContent  = p.name + factionBadge;
    els.nameEl.style.color  = color;
    els.netEl.textContent   = fmt(p.net);
    // Highlight own row
    if (myId && p.id === myId) {
      els.row.style.borderColor = '#46ff7d55';
      els.row.style.background = '#0d0a04';
    }
  });

  _lbLastData = data;
  _lbLastData._displayIds = displayIds;
}

// ── 30-min cycle counter (aligned to :00 and :30) ────────────────────────────
(function startLbCycleCounter() {
  const el = document.getElementById('lb-cycle-counter');
  if (!el) return;
  function tick() {
    const now = new Date();
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    // seconds elapsed since last :00 or :30
    const cyclePos = (mins % 30) * 60 + secs;
    const remaining = 30 * 60 - cyclePos;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    el.textContent = `⟳ next reset ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  tick();
  setInterval(tick, 1000);
})();


// Update bottom ticker: top 3 gainers + top 3 losers
function updateBottomTicker() {
  const bt = document.getElementById('bottomTicker'); if (!bt) return;
  const tickers = (window.TICKERS || []).filter(t => t.price && t.pct != null);
  const sorted = [...tickers].sort((a,b) => (b.pct||0) - (a.pct||0));
  const gainers = sorted.slice(0, 3);
  const losers  = sorted.slice(-3).reverse();
  function fmt(t) {
    const pct = t.pct || 0;
    const col = pct > 0 ? '#86ff6a' : '#ff6b6b';
    const sign = pct > 0 ? '+' : '';
    const px = t.price >= 10000 ? (t.price/1000).toFixed(1)+'k' : t.price.toFixed(2);
    return `<span style="color:${col};white-space:nowrap;cursor:pointer" onclick="try{window.CURRENT='${t.symbol}';var s=document.getElementById('sym');if(s)s.value='${t.symbol}';sendWS({type:'chart',symbol:'${t.symbol}'});window.showTab&&window.showTab('market');}catch(e){}" title="${t.name}">${t.symbol} <span style="opacity:.7">Ƒ${px}</span> <b>${sign}${pct.toFixed(2)}%</b></span>`;
  }
  const sep = `<span style="opacity:.2;margin:0 4px">│</span>`;
  bt.innerHTML = `<span style="opacity:.3;font-size:.7rem;white-space:nowrap">▲ TOP</span>` + gainers.map(fmt).join('') + sep + `<span style="opacity:.3;font-size:.7rem;white-space:nowrap">▼ BOTTOM</span>` + losers.map(fmt).join('');
}

function renderPositions(p) {
  try { const _c = el('#cash'); if (_c) _c.textContent = fmt(p.cash); } catch(_) {}
  // XP bar update
  try {
    const xp = p.xp || 0, lv = p.level || 1, title = p.title || '';
    const xpEl = document.getElementById('xp-bar-fill');
    const xpLbl = document.getElementById('xp-bar-label');
    if (xpEl && xpLbl) {
      // Compute progress within current level
      let rem = xp, lvCalc = 1;
      while (lvCalc < 999) { const need = Math.floor(60 * Math.pow(1.06, lvCalc - 1)); if (rem < need) break; rem -= need; lvCalc++; }
      const needed = Math.floor(60 * Math.pow(1.06, lv - 1));
      const pct = needed > 0 ? Math.min(100, (rem / needed) * 100) : 100;
      xpEl.style.width = pct.toFixed(1) + '%';
      xpLbl.textContent = title ? (window.tf?window.tf('pnl.xpWithTitle','Lv.{lv} · {title}  {rem} / {needed} XP',{lv:lv,title:title,rem:rem.toLocaleString(),needed:needed.toLocaleString()}):`Lv.${lv} · ${title}  ${rem.toLocaleString()} / ${needed.toLocaleString()} XP`)
                                : (window.tf?window.tf('pnl.xpNoTitle','Lv.{lv}  {rem} / {needed} XP',{lv:lv,rem:rem.toLocaleString(),needed:needed.toLocaleString()}):`Lv.${lv}  ${rem.toLocaleString()} / ${needed.toLocaleString()} XP`);
    }
  } catch(_) {}
  const box = el('#positions');
  box.innerHTML = '';
  p.positions.forEach(po => {
    const row = document.createElement('div');
    row.innerHTML = `${po.sym}, ${po.qty} @ ${fmt(po.px)} = ${fmt(po.val)}`;
    if (po.sym) {
      row.style.cursor = 'pointer';
      row.title = 'View ' + po.sym + ' in Market';
      row.addEventListener('click', () => window.FMGotoSymbol(po.sym));
    }
    box.appendChild(row);
  });
  // charts drawn by liveUpdatePnL on next tick
  renderPnLDetail(p);
  drawEquity();
}


// === P&L & Equity Line Enhancements (minimal, drop‑in) ===
function computeEquityFromLive(p){
  try{
    // Prefer server positions if present; fall back to our reconciled POSITIONS map.
    const rows = (p && Array.isArray(p.positions)) ? p.positions.map(po => ({ sym:String(po.sym||'').toUpperCase(), qty:Number(po.qty||0), px:Number(po.px||0) })) : [];
    let eq = 0;
    if (rows.length){
      for (const po of rows){
        const sym = String(po.sym||'').toUpperCase();
        const last = (window.__LAST_MARKS && window.__LAST_MARKS[sym] && Number(window.__LAST_MARKS[sym].price)) || Number(po.px)||0;
        eq += (Number(po.qty)||0) * (Number(last)||0);
      }
      return eq;
    }
    // Fall back to the effective positions map (__POSITIONS_MAP) + last marks
    if (window.__POSITIONS_MAP && typeof window.__POSITIONS_MAP === 'object'){
      for (const [sym, qty] of Object.entries(window.__POSITIONS_MAP)){
        const last = (window.__LAST_MARKS && window.__LAST_MARKS[String(sym).toUpperCase()] && Number(window.__LAST_MARKS[String(sym).toUpperCase()].price)) || 0;
        eq += (Number(qty)||0) * (Number(last)||0);
      }
      return eq;
    }
  }catch(e){}
  return 0;
}

// ── P&L static snapshot charts ───────────────────────────────────────────────
// No history stored. Both canvases redraw from current positions/prices only.

// Palette for up to 12 positions (hue steps, desaturated game palette).
// Used by the personal P&L bar chart.
const PNL_COLORS = [
  '#e6a832','#5b9bd5','#8fce6a','#c97fd4','#e06b5a','#4ecdc4',
  '#f0c96a','#7eb8e6','#a8d86e','#d48fd4','#e08a6a','#6cd4c4'
];

// Shared allocation-donut palette — vivid, glow-friendly. Used by BOTH the
// personal net-worth donut here and the Capital House NAV donut in funds.js
// (which reads window.FM_DONUT_PAL), so the two wheels stay identical.
const FM_DONUT_PAL = [
  '#2dd4c4','#ff3b3b','#b86bff','#27e36b','#9dff5a',
  '#ff8c2e','#5dff7a','#e0b85a','#3aa0ff','#ff7a45'
];
window.FM_DONUT_PAL = FM_DONUT_PAL;

let EQUITY = []; // kept for legacy compat, nothing writes to it now

function drawPnLCharts(posArr, cashNow, netWorth) {
  _drawDonut(posArr, cashNow, netWorth);
  _drawBars(posArr);
}

// ── Donut: allocation (each position + cash) ─────────────────────────────────
function _drawDonut(posArr, cashNow, netWorth) {
  const canvas = document.getElementById('pnl-donut');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const S = 180;
  canvas.width = canvas.height = S * dpr;
  canvas.style.width = canvas.style.height = S + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,S,S);

  const cx = S/2, cy = S/2, ro = S/2 - 8, ri = ro * 0.6;

  // Build slices: positions + cash
  const slices = posArr.map((p, i) => ({
    label: p.sym, value: Math.max(0, p.value),
    color: FM_DONUT_PAL[i % FM_DONUT_PAL.length]
  }));
  if (cashNow > 0) slices.push({ label: 'CASH', value: cashNow, color: 'rgba(228,200,140,0.85)' });

  const total = slices.reduce((s,x)=>s+x.value,0) || 1;

  if (slices.length === 0 || total <= 0) {
    // Empty state
    ctx.beginPath(); ctx.arc(cx,cy,ro,0,Math.PI*2);
    ctx.strokeStyle='rgba(255,180,50,0.12)'; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle='rgba(212,184,122,0.2)'; ctx.font='11px monospace';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('No positions', cx, cy);
    return;
  }

  // Draw arcs with gaps
  const GAP = 0.025;
  let ang = -Math.PI/2;
  slices.forEach((s, i) => {
    const sweep = (s.value / total) * (Math.PI*2) - GAP;
    // Guard tiny slices: a sweep below GAP/2 makes the arc end angle fall below its
    // start, so the default-clockwise arc wraps ~360° and floods the ring with this
    // slice's color. Drop sub-~0.6% wedges instead.
    if (sweep <= GAP/2) return;
    ctx.beginPath();
    ctx.moveTo(cx + ri*Math.cos(ang+GAP/2), cy + ri*Math.sin(ang+GAP/2));
    ctx.arc(cx, cy, ro, ang+GAP/2, ang+sweep);
    ctx.arc(cx, cy, ri, ang+sweep, ang+GAP/2, true);
    ctx.closePath();
    // Per-segment glow so the ring reads luminous against the near-black panel.
    ctx.save();
    ctx.shadowColor = s.color; ctx.shadowBlur = 6;
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.restore();
    // label if slice > 8%
    if (s.value / total > 0.08) {
      const midA = ang + sweep/2 + GAP/2;
      const lr = (ro+ri)/2;
      const lx = cx + lr*Math.cos(midA), ly = cy + lr*Math.sin(midA);
      ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.label, lx, ly);
    }
    ang += sweep + GAP;
  });

  // Centre: net worth
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0a0804';
  ctx.beginPath(); ctx.arc(cx,cy,ri-2,0,Math.PI*2); ctx.fill();
  const fmtC = v => v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v.toFixed(0);
  ctx.fillStyle = '#9dffb0'; ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Ƒ'+fmtC(netWorth), cx, cy-7);
  ctx.fillStyle = 'rgba(230,200,140,0.55)'; ctx.font = '12px monospace';
  ctx.fillText('NET WORTH', cx, cy+7);
}

// ── Bars axis: pinned +/-% scale that stays put while bars scroll ────────────
function _drawBarsAxis(W, maxAbs) {
  const c = document.getElementById('pnl-bars-axis');
  if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const H = 20;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);
  if (maxAbs == null) return; // empty book: blank axis

  const PAD_L = 52, PAD_R = 58;
  const plotW = W - PAD_L - PAD_R;
  const zeroX = PAD_L + plotW/2;

  ctx.strokeStyle = 'rgba(212,184,122,0.18)';
  ctx.lineWidth = 1; ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(zeroX, 5); ctx.lineTo(zeroX, H); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(212,184,122,0.42)'; ctx.font = '12px monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';  ctx.fillText('+'+maxAbs.toFixed(0)+'%', W-PAD_R+4, H/2);
  ctx.textAlign = 'right'; ctx.fillText('-'+maxAbs.toFixed(0)+'%', PAD_L-4,    H/2);
}

// ── Bars: per-position % gain/loss (horizontal) ──────────────────────────────
function _drawBars(posArrIn) {
  const canvas = document.getElementById('pnl-bars');
  if (!canvas) return;
  const posArr = _pnlArrange(posArrIn);

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 400;

  // Fixed readable row height — canvas grows with position count and the
  // #pnl-bars-wrap container scrolls. No more cramming N rows into 180px.
  const PAD_L = 52, PAD_R = 58, PAD_T = 8, PAD_B = 10;
  const ROW_H = 24, BAR_H = 15;
  const n = posArr.length;
  const H = Math.max(120, PAD_T + PAD_B + n * ROW_H);

  canvas.style.height = H + 'px';
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);

  if (!n) {
    _drawBarsAxis(W, null);
    ctx.fillStyle = 'rgba(212,184,122,0.2)'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var _emptyMsg = window.__pnlSearch ? (window.t?window.t('pnl.noMatch','No positions match filter'):'No positions match filter')
      : (/^[0-9]+$/.test(String(window.__pnlSort)) ? (window.tf?window.tf('pnl.noneInSector','No positions in {sector}',{sector:_sectorName(Number(window.__pnlSort))}):('No positions in ' + _sectorName(Number(window.__pnlSort)))) : (window.t?window.t('pnl.noOpen','No open positions'):'No open positions'));
    ctx.fillText(_emptyMsg, W/2, H/2);
    return;
  }

  const plotW = W - PAD_L - PAD_R;

  // Find max abs % for scaling
  let maxAbs = 0.001;
  for (const p of posArr) { if (Math.abs(p.gainPct) > maxAbs) maxAbs = Math.abs(p.gainPct); }
  maxAbs = Math.max(maxAbs, 5); // floor the range so flat positions aren't full-width

  // Zero line
  const zeroX = PAD_L + plotW/2;
  ctx.strokeStyle = 'rgba(212,184,122,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(zeroX, PAD_T-6); ctx.lineTo(zeroX, H-PAD_B+2); ctx.stroke();
  ctx.setLineDash([]);

  // Pinned scale (drawn into the fixed axis canvas, not this scrolling one)
  _drawBarsAxis(W, maxAbs);

  posArr.forEach((p, i) => {
    const y = PAD_T + i * ROW_H + (ROW_H - BAR_H) / 2;
    const pct = Math.max(-maxAbs, Math.min(maxAbs, p.gainPct));
    const barPx = (Math.abs(pct) / maxAbs) * (plotW/2);
    const isPos = pct >= 0;
    const color = isPos ? PNL_COLORS[i % PNL_COLORS.length] : '#e06b5a';

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(PAD_L, y, plotW, BAR_H);

    // Bar (grows left from zero for negative, right for positive)
    const bx = isPos ? zeroX : zeroX - barPx;
    ctx.fillStyle = color + (isPos ? 'cc' : '99');
    ctx.fillRect(bx, y, barPx, BAR_H);

    // Thin edge glow
    ctx.fillStyle = color;
    if (isPos) ctx.fillRect(bx + barPx - 1, y, 1, BAR_H);
    else       ctx.fillRect(bx, y, 1, BAR_H);

    // Symbol label (left)
    ctx.fillStyle = '#72e09c'; ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(p.sym, PAD_L - 4, y + BAR_H/2);

    // % label (right)
    const sign = pct >= 0 ? '+' : '';
    ctx.fillStyle = isPos ? color : '#e06b5a';
    ctx.textAlign = 'left';
    ctx.fillText(sign + pct.toFixed(2)+'%', W - PAD_R + 4, y + BAR_H/2);
  });

  // Click a bar row to open that symbol in Market. Row y is deterministic
  // (PAD_T + i*ROW_H), so map the click's y to a row index.
  canvas._pnlRows = posArr;
  if (!canvas._pnlClickBound) {
    canvas._pnlClickBound = true;
    canvas.style.cursor = 'pointer';
    canvas.addEventListener('click', function (e) {
      try {
        const rows = canvas._pnlRows || [];
        const idx = Math.floor((e.offsetY - PAD_T) / ROW_H);
        if (idx >= 0 && idx < rows.length && rows[idx] && rows[idx].sym) window.FMGotoSymbol(rows[idx].sym);
      } catch (_) {}
    });
  }
}

// Called by ResizeObserver and tab activation — just redraws current state
function drawEquity() {
  try {
    const posArr = _buildPosArr(null, null);
    const cashNow = window.__MY_CASH != null ? window.__MY_CASH : 0;
    const equity  = posArr.reduce((s,p)=>s+p.value,0);
    drawPnLCharts(posArr, cashNow, cashNow + equity);
  } catch(e) {}
}


// Navigate to a symbol's chart in the Market tab. Shared by news lines, P&L
// rows, and the P&L bar chart so click-to-navigate behaves identically.
window.FMGotoSymbol = function (sym) {
  try {
    sym = String(sym || '').toUpperCase();
    if (!sym) return;
    const symEl = document.getElementById('sym');
    if (symEl) symEl.value = sym;
    window.CURRENT = sym;
    if (typeof sendWS === 'function') sendWS({ type: 'chart', symbol: sym });
    if (typeof showTab === 'function') showTab('market');
    else { const t = document.querySelector('[data-tab="market"]'); if (t) t.click(); }
    setTimeout(function () { try { document.querySelector('.panel #chart')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {} }, 60);
  } catch (_) {}
};

// Double Down: buy `qty` more of `sym` (doubling an existing long) at market in one click.
// Server enforces cash, the day-trade cap, and the buy cooldown, and rejects with a toast if needed.
window.FMDoubleDown = function (sym, qty) {
  try {
    sym = String(sym || '').toUpperCase();
    qty = Math.max(1, Math.floor(Number(qty) || 0));
    if (!sym || qty < 1) return;
    const px = (window.getLastPrice ? Number(window.getLastPrice(sym)) || 0 : 0);
    const cost = px > 0 ? ('~Ƒ' + Math.round(px * qty).toLocaleString() + ' before fee and slippage') : 'at market';
    const ok = window.confirm('Double down on ' + sym + ': buy ' + qty + ' more @ Ƒ' + px.toFixed(2) + ' (' + cost + '). This doubles your position.');
    if (!ok) return;
    if (window.marketAPI && typeof window.marketAPI.buy === 'function') window.marketAPI.buy(sym, qty);
  } catch (_) {}
};

function renderPnLDetail(p) {
  // Called on portfolio msg — seeds __MY_POSITIONS then delegates to live renderer
  try { liveUpdatePnL(null, p); } catch(e) {}
}

// ─── liveUpdatePnL: re-renders P&L box on every price tick ──────────────────
// tickData = array from type:'tick', or null (uses cached __LAST_MARKS)
// portfolioSnap = optional portfolio msg data (initial seed)
// ── _buildPosArr: shared position builder for charts + table ─────────────────
function _buildPosArr(tickData, portfolioSnap) {
  const prices = {};
  if (Array.isArray(tickData)) {
    for (const t of tickData) { if (t && t.symbol) prices[t.symbol] = Number(t.price||0); }
  }
  function getPrice(sym) {
    if (prices[sym] != null && prices[sym] > 0) return prices[sym];
    if (window.__LAST_MARKS && __LAST_MARKS[sym]) return Number(__LAST_MARKS[sym].price)||0;
    return 0;
  }
  const posMap = window.__MY_POSITIONS || {};
  const posEntries = Object.entries(posMap);
  const arr = [];

  if (!posEntries.length && portfolioSnap) {
    for (const po of (portfolioSnap.positions||[])) {
      const last = getPrice(po.sym) || Number(po.px)||0;
      const qty  = Number(po.qty)||0, avg = Number(po.avg)||0;
      const val  = last * Math.abs(qty) * (qty < 0 ? -1 : 1);
      const upl  = (last - avg) * qty;
      const gainPct = avg > 0 ? ((last/avg)-1)*100 : 0;
      arr.push({ sym: po.sym, qty, avg, last, value: val, upl, gainPct });
    }
  } else {
    for (const [sym, pos] of posEntries) {
      const last = getPrice(sym) || 0;
      const qty  = pos.qty, avg = pos.avg;
      const val  = last * Math.abs(qty) * (qty < 0 ? -1 : 1);
      const upl  = (last - avg) * qty;
      const gainPct = avg > 0 ? ((last/avg)-1)*100 : 0;
      arr.push({ sym, qty, avg, last, value: val, upl, gainPct });
    }
  }
  return arr;
}

// ─── P&L position filter (search box) ───────────────────────────────────────
window.__pnlSearch = window.__pnlSearch || '';
// 'default' (book order) | 'group' (cluster by sector) | '0'..'7' (show one sector)
window.__pnlSort = window.__pnlSort || 'default';
function _pnlMatch(sym){
  const q = window.__pnlSearch;
  return !q || String(sym||'').toLowerCase().includes(q);
}
// Sector index + readable name for a symbol, pulled from the live market snapshot.
// Dividend-paying sectors, mirrors server DIVIDEND_SECTORS (Finance/Insurance/Energy/Tech).
// Used to badge positions in the P&L list so you can see at a glance which pay a dividend.
const _DIV_SECTORS = new Set([0, 2, 4, 6]);
function _sectorOf(sym){
  try {
    const t = (window.TICKERS||[]).find(x => x && String(x.symbol) === String(sym));
    if (t && t.sector != null) return Number(t.sector);
  } catch(e){}
  return 99; // unknown sorts last
}
function _sectorName(idx){
  const names = window.V5_SECTOR_NAMES || [];
  const fb = (idx != null && names[idx]) ? names[idx] : 'Misc';
  return window.t ? window.t('sector.'+idx, fb) : fb;
}
// Apply search + the active sector view (filter-to-one or group) in one pass, so
// the bar chart and the row list always agree.
function _pnlArrange(arr){
  let out = (arr || []).filter(p => _pnlMatch(p.sym));
  const s = window.__pnlSort;
  if (s === 'group') {
    out = out.slice().sort((a,b) => {
      const sa = _sectorOf(a.sym), sb = _sectorOf(b.sym);
      if (sa !== sb) return sa - sb;
      return String(a.sym).localeCompare(String(b.sym));
    });
  } else if (s !== 'default') {
    const idx = Number(s);
    out = out.filter(p => _sectorOf(p.sym) === idx);
  }
  return out;
}
window.pnlApplySort = function(v){
  const ok = (v === 'group') || (v === 'default') || /^[0-9]+$/.test(String(v));
  window.__pnlSort = ok ? String(v) : 'default';
  try { liveUpdatePnL(null, null); } catch(e){}
  try { drawEquity(); } catch(e){}
};
window.pnlApplySearch = function(v){
  window.__pnlSearch = (v||'').trim().toLowerCase();
  try { liveUpdatePnL(null, null); } catch(e){}
  try { drawEquity(); } catch(e){}
};

// ─── liveUpdatePnL: re-renders P&L display on every price tick ───────────────
function liveUpdatePnL(tickData, portfolioSnap) {
  const box = el('#pnlBox');
  if (!box) return;
  const T=(k,fb)=>window.t?window.t(k,fb):fb;
  const TF=(k,fb,v)=>window.tf?window.tf(k,fb,v):fb;

  const posArr  = _buildPosArr(tickData, portfolioSnap);
  const cashNow = (typeof ME==='object'&&ME&&typeof ME.cash==='number')
    ? ME.cash
    : (window.__MY_CASH != null ? window.__MY_CASH :
       (portfolioSnap ? Number(portfolioSnap.cash)||0 : 0));
  const equity  = posArr.reduce((s,p) => s + (p.qty > 0 ? p.value : 0), 0);
  const netWorth = cashNow + equity;
  const totalUPL = posArr.reduce((s,p) => s + p.upl, 0);

  // ── Redraw charts (static snapshot — no history) ─────────────────────────
  liveUpdatePnL._tick = (liveUpdatePnL._tick||0) + 1;
  if (liveUpdatePnL._tick % 2 === 0 || portfolioSnap) {
    drawPnLCharts(posArr, cashNow, netWorth);
  }

  // ── KPI bar ───────────────────────────────────────────────────────────────
  const uplColor = totalUPL >= 0 ? '#86ff6a' : '#ff6b6b';
  const uplSign  = totalUPL >= 0 ? '+' : '';
  const kpi = (label, val, color) =>
    `<div style="display:flex;flex-direction:column;gap:2px;min-width:100px">
       <span style="font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;opacity:.45">${label}</span>
       <span style="font-size:.9rem;font-weight:700;color:${color||'#d4b87a'}">${val}</span>
     </div>`;

  const dailyIncome = window.__passiveIncome ? (window.__passiveIncome.total||0) : 0;
  const kpiBar = `<div style="display:flex;gap:18px;flex-wrap:wrap;padding:8px 4px 10px;border-bottom:1px solid #0a3315;margin-bottom:8px">
    ${kpi(T('pnl.netWorth','Net Worth'), fmt(netWorth), '#46ff7d')}
    ${kpi(T('pnl.equity','Equity'),    fmt(equity),   '#d4b87a')}
    ${kpi(T('pnl.cash','Cash'),      fmt(cashNow),  '#d4b87a')}
    ${kpi(T('pnl.unrealizedPnl','Unrealized P&L'), uplSign+fmt(Math.abs(totalUPL)), uplColor)}
    ${kpi(T('pnl.dailyIncome','Daily Income'), fmt(dailyIncome), '#51cf66')}
  </div>${(window.gPlayerFaction && window.gPlayerFaction !== 'null') ? `<div style="display:flex;align-items:center;gap:6px;padding:4px 4px 8px;margin-bottom:2px;font-size:.64rem;opacity:.75">
    <span style="color:${window.gPlayerFaction==='coalition'?'#4ecdc4':window.gPlayerFaction==='syndicate'?'#e74c3c':window.gPlayerFaction==='void'?'#9b59b6':'#9dff5a'}">⬡</span>
    <span style="color:#888">${T('pnl.faction','Faction:')}</span>
    <span style="color:${window.gPlayerFaction==='coalition'?'#4ecdc4':window.gPlayerFaction==='syndicate'?'#e74c3c':window.gPlayerFaction==='void'?'#9b59b6':'#9dff5a'};letter-spacing:.06em">${window.gPlayerFaction==='coalition'?T('pnl.facCoalition','THE COALITION'):window.gPlayerFaction==='syndicate'?T('pnl.facSyndicate','THE SYNDICATE'):window.gPlayerFaction==='void'?T('pnl.facVoid','VOID COLLECTIVE'):window.gPlayerFaction==='fleshstation'?T('pnl.facFlesh','FLESH STATION ⚡'):'-'}</span>
    <span style="color:#555;font-size:.58rem">${T('pnl.colonyBonuses','colony bonuses active')}</span>
  </div>` : ''}`;

  // ── Position rows ─────────────────────────────────────────────────────────
  const shownArr = _pnlArrange(posArr);
  const bySector = window.__pnlSort === 'group';
  const posRows = shownArr.map(p => {
    const uplSign2 = p.upl >= 0 ? '+' : '';
    const pctSign  = p.gainPct >= 0 ? '+' : '';
    const secTag = bySector ? `<span style="font-size:.6rem;color:#7a6a4a;letter-spacing:.04em">${_sectorName(_sectorOf(p.sym))}</span>` : '';
    return `<div class="pnl-pos-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #06160a;cursor:pointer" title="Open ${p.sym} in Market" onclick="window.FMGotoSymbol('${p.sym}')">
      <span style="font-weight:700;color:#46ff7d;min-width:52px">${p.sym}${_DIV_SECTORS.has(_sectorOf(p.sym)) ? ' <span title="Pays a dividend" style="font-size:.62rem">💰</span>' : ''}${secTag?' '+secTag:''}</span>
      <span class="muted" style="min-width:60px;font-size:.8rem">${p.qty} @ Ƒ${p.avg.toFixed(2)}</span>
      <span style="min-width:72px;color:#d4b87a">Ƒ${p.last.toFixed(2)}</span>
      <span style="min-width:80px;color:#d4b87a">${fmt(p.value)}</span>
      <span style="min-width:80px;color:${p.upl>=0?'#86ff6a':'#ff6b6b'}">${uplSign2}${fmt(p.upl)}</span>
      <span style="min-width:60px;font-size:.78rem;color:${p.gainPct>=0?'#86ff6a':'#ff6b6b'}">${pctSign}${p.gainPct.toFixed(2)}%</span>
      ${p.qty > 0 ? `<button title="Double down on ${p.sym}: buy ${p.qty} more" onclick="event.stopPropagation();window.FMDoubleDown('${p.sym}',${p.qty})" style="flex:0 0 auto;margin-left:4px;font-size:.64rem;padding:1px 6px;background:#0a2a14;border:1px solid #1f6b3a;color:#86ff6a;border-radius:4px;cursor:pointer">2×</button>` : ''}
    </div>`;
  });

  const header = posRows.length
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0 5px;font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;opacity:.35">
        <span style="min-width:52px">${T('pnl.colSymbol','Symbol')}</span>
        <span style="min-width:60px">${T('pnl.colPosition','Position')}</span>
        <span style="min-width:72px">${T('pnl.colLast','Last')}</span>
        <span style="min-width:80px">${T('pnl.colValue','Value')}</span>
        <span style="min-width:80px">${T('pnl.colUpl','Unr. P&L')}</span>
        <span style="min-width:60px">${T('pnl.colGain','Gain%')}</span>
      </div>` : '';

  const empty = !posRows.length
    ? `<div style="padding:18px 0;text-align:center;opacity:.35;font-size:.82rem">${posArr.length && window.__pnlSearch ? T('pnl.noMatch','No positions match filter') : (posArr.length && /^[0-9]+$/.test(String(window.__pnlSort)) ? TF('pnl.noneInSector','No positions in {sector}',{sector:_sectorName(Number(window.__pnlSort))}) : T('pnl.noOpen','No open positions'))}</div>` : '';

  box.innerHTML = kpiBar + header + posRows.join('') + empty;
}

function drawChart() {
  const canvas = el('#chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.offsetWidth || 600;
  const cssH = canvas.clientHeight || canvas.offsetHeight || 300;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  if (W < 10 || H < 10) {
    // Not laid out. Retry ONLY while the canvas is actually on screen.
    //
    // This used to retry unconditionally. _pushWave() schedules drawChart on
    // every price tick regardless of which tab is open, so with the market tab
    // hidden every tick landed here and started its own 100ms self rescheduling
    // chain, and none of them terminated until the chart became visible again.
    // The chains accumulate for as long as the player is on another tab, and
    // setTimeout keeps firing while the page is backgrounded even though the
    // requestAnimationFrame that started them does not. On a phone, where the
    // shell means the player is off Market most of the time, that is a battery
    // drain with no visible symptom.
    //
    // offsetParent is null whenever an ancestor is display:none, which is
    // exactly the tab-hidden case. When the canvas comes back, the
    // ResizeObserver below redraws it, and the next tick redraws it again.
    if (canvas.offsetParent !== null) setTimeout(drawChart, 100);
    return;
  }

  const MR = 64, MB = 18, MT = 24;
  const CW = W - MR, CH = H - MB - MT;
  const BUF_MAX = Math.max(200, CW); // one price per pixel
  const buf = _waveBuffer;

  // ── Background: deep void ──
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c0800');
  bg.addColorStop(0.5, '#080500');
  bg.addColorStop(1, '#0a0600');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vig = ctx.createRadialGradient(W*0.5, H*0.5, H*0.2, W*0.5, H*0.5, H*0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  if (buf.length < 2) {
    ctx.fillStyle = '#3a2a0a';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ACQUIRING SIGNAL…', W/2, H/2);
    // Draw border frame
    ctx.strokeStyle = '#5a4018';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, MT - 0.5, CW, CH + 1);
    return;
  }

  // Use only as many points as we have pixels for
  const n = Math.min(buf.length, CW);
  const offset = buf.length - n;
  const data = buf.slice(offset);
  const openP = _waveOpenPrice || data[0];
  const lastP = data[data.length - 1];
  const isUp = lastP >= openP;

  const min = Math.min(...data) ;
  const max = Math.max(...data);
  const spread = max - min;
  const pad = spread * 0.15 || 0.5;
  const lo = min - pad, hi = max + pad;

  function pY(p) { return MT + CH - ((p - lo) / (hi - lo)) * CH; }

  // ── Grid: faint amber dots ──
  for (let gx = 0; gx <= 12; gx++) {
    for (let gy = 0; gy <= 8; gy++) {
      ctx.fillStyle = 'rgba(210,160,60,0.20)';
      ctx.beginPath();
      ctx.arc(gx * (CW/12), MT + gy * (CH/8), 0.8, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(210,160,60,0.14)';
  ctx.lineWidth = 1;
  for (let gy = 0; gy <= 8; gy++) {
    const y = MT + gy * (CH / 8);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
  }

  // ── Chart border frame ──
  ctx.strokeStyle = '#5a4018';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, MT - 0.5, CW, CH + 1);

  // ── Amber theme colors ──
  const amber    = isUp ? '#00ff88' : '#ff5533';
  const amberDim = isUp ? 'rgba(0,255,136,' : 'rgba(255,85,51,';
  const amberBg  = isUp ? 'rgba(0,200,100,' : 'rgba(255,60,30,';

  // ── Gradient fill under curve ──
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * CW;
    const y = pY(data[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(CW, MT + CH);
  ctx.lineTo(0, MT + CH);
  ctx.closePath();
  const gFill = ctx.createLinearGradient(0, MT, 0, MT + CH);
  gFill.addColorStop(0, amberBg + '0.18)');
  gFill.addColorStop(0.6, amberBg + '0.04)');
  gFill.addColorStop(1, amberBg + '0.0)');
  ctx.fillStyle = gFill;
  ctx.fill();
  ctx.restore();

  // ── Outer glow (bloom) ──
  ctx.save();
  ctx.shadowColor = amber;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = amberDim + '0.5)';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * CW;
    const y = pY(data[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();

  // ── Main trace ──
  ctx.strokeStyle = amberDim + '0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * CW;
    const y = pY(data[i]);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // ── Phosphor intensity: brighten the last ~20% of the line ──
  const fadeStart = Math.floor(n * 0.8);
  if (fadeStart < n - 1) {
    ctx.save();
    ctx.shadowColor = amber;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = amberDim + '0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = fadeStart; i < n; i++) {
      const x = (i / (n - 1)) * CW;
      const y = pY(data[i]);
      if (i === fadeStart) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── SMA overlay (gated on the 'sma' market upgrade) ──
  try {
    const SMA_PERIOD = 20;
    if (window.FM_MARKET_UPGRADES && window.FM_MARKET_UPGRADES.has && window.FM_MARKET_UPGRADES.has('sma') && n >= SMA_PERIOD) {
      let sum = 0; ctx.beginPath(); let started = false;
      for (let i = 0; i < n; i++) {
        sum += data[i];
        if (i >= SMA_PERIOD) sum -= data[i - SMA_PERIOD];
        if (i >= SMA_PERIOD - 1) {
          const avg = sum / SMA_PERIOD;
          const x = (i / (n - 1)) * CW, y = pY(avg);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
      }
      ctx.setLineDash([]); ctx.strokeStyle = 'rgba(214,184,122,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = 'rgba(214,184,122,0.8)'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
      ctx.fillText('SMA ' + SMA_PERIOD, 6, MT + 12);
    }
  } catch (_) {}

  // ── Pulsing endpoint ──
  const pt = (Date.now() % 1200) / 1200;
  const pr = 3.5 + Math.sin(pt * Math.PI * 2) * 1.5;
  const pa = 0.7 + Math.sin(pt * Math.PI * 2) * 0.3;
  const ex = CW, ey = pY(lastP);
  ctx.save();
  ctx.shadowColor = amber;
  ctx.shadowBlur = 16;
  ctx.fillStyle = amberDim + pa + ')';
  ctx.beginPath(); ctx.arc(ex, ey, pr, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── Open price reference line ──
  if (openP > lo && openP < hi) {
    const oy = pY(openP);
    ctx.strokeStyle = 'rgba(120,90,40,0.4)';
    ctx.setLineDash([2, 6]);
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(CW, oy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(40,120,70,0.4)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('OPEN', CW - 4, oy - 3);
  }

  // ── Current price horizontal ──
  ctx.strokeStyle = amberDim + '0.35)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(0, ey); ctx.lineTo(CW, ey); ctx.stroke();
  ctx.setLineDash([]);

  // ── Price axis (right) ──
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  const pSteps = 6;
  for (let i = 0; i <= pSteps; i++) {
    const p = hi - (i / pSteps) * (hi - lo);
    const y = pY(p);
    ctx.fillStyle = 'rgba(114,224,156,0.75)';
    ctx.fillText('Ƒ' + p.toFixed(2), CW + 3, y + 3);
  }
  // Current price highlight
  ctx.fillStyle = '#021008';
  ctx.fillRect(CW, ey - 7, MR, 14);
  ctx.fillStyle = amber;
  ctx.font = 'bold 12px monospace';
  ctx.fillText('Ƒ' + lastP.toFixed(2), CW + 3, ey + 4);

  // ── Time axis (bottom) ──
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(114,224,156,0.55)';
  // Per-point real timestamps when available, so the axis shows true elapsed time and
  // widens with the extended-history upgrade. Falls back to the old 500ms/point estimate.
  const useTimes = (_waveTimes.length >= buf.length) && n > 0;
  const nowT = useTimes ? _waveTimes[_waveTimes.length - 1] : 0;
  const labels = 6;
  for (let i = 0; i <= labels; i++) {
    const frac = i / labels;
    const x = frac * CW;
    const secAgo = useTimes
      ? Math.round((nowT - (_waveTimes[offset + Math.round(frac * (n - 1))] || nowT)) / 1000)
      : Math.round((n * 0.5) * (1 - frac));
    if (secAgo > 0) {
      const lbl = secAgo >= 60 ? Math.floor(secAgo/60) + 'm' + (secAgo%60?String(secAgo%60).padStart(2,'0')+'s':'') : secAgo + 's';
      ctx.fillText('-' + lbl, x, H - 3);
    } else {
      ctx.fillText('NOW', x, H - 3);
    }
  }

  // ── CRT Scanlines ──
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);

  // ── Top-left HUD readout ──
  const pctChg = openP ? ((lastP - openP) / openP * 100) : 0;
  const pctStr = (pctChg >= 0 ? '+' : '') + pctChg.toFixed(2) + '%';
  const hiLo = 'H:Ƒ' + max.toFixed(2) + ' L:Ƒ' + min.toFixed(2);

  // Symbol
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#b6ffcf';
  ctx.fillText(CURRENT || '-', 6, 18);

  // Price + pct + hi/lo
  const symW = (CURRENT || '-').length * 10 + 14;
  ctx.font = 'bold 14px monospace';
  ctx.fillStyle = isUp ? '#00ff88' : '#ff5533';
  ctx.fillText('Ƒ' + lastP.toFixed(2), symW, 18);
  ctx.font = '13px monospace';
  ctx.fillStyle = 'rgba(114,224,156,0.75)';
  ctx.fillText(pctStr + '  ' + hiLo, symW + (lastP.toFixed(2).length + 1) * 8.5 + 8, 18);
}

// ── Rolling buffer: push price on each tick ──
let _waveAnimFrame = null;
function _wavePush(price) {
  const maxBuf = 800; // enough for widest monitors
  _waveBuffer.push(price);
  _waveTimes.push(Date.now());
  if (_waveBuffer.length > maxBuf) _waveBuffer.shift();
  if (_waveTimes.length > maxBuf) _waveTimes.shift();
  if (!_waveOpenPrice) _waveOpenPrice = price;
  // Throttle redraws to ~20fps (every 50ms) to save CPU
  if (!_waveAnimFrame) {
    _waveAnimFrame = requestAnimationFrame(() => {
      _waveAnimFrame = null;
      drawChart();
    });
  }
}

// Redraw chart on resize
try {
  const _chartCanvas = document.getElementById('chart');
  if (_chartCanvas) {
    new ResizeObserver(() => { if (_waveBuffer.length) drawChart(); }).observe(_chartCanvas);
  }
} catch(e) {}

function fmtRel(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return (window.t?window.t('sys.now','now'):'now');
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}
// Refresh relative timestamps in place so scrollback keeps signalling room age.
setInterval(function(){
  try {
    document.querySelectorAll('.cm-time').forEach(function(el){
      const ts = Number(el.dataset.ts);
      if (ts) el.textContent = fmtRel(ts);
    });
  } catch(_) {}
}, 60000);

// Item-backed chat avatars (clothing/implant portraits, Mr. Flesh's brain) resolve
// from the lazy-loaded item catalog. A viewer who hasn't opened inventory/store
// doesn't have it yet, so those avatars come back blank. Load it on demand and
// refill any chat avatars that couldn't resolve.
function _refillChatAvatars() {
  if (!window.FMPortraitSrc) return;
  document.querySelectorAll('img.chat-avatar[data-portrait]').forEach(function (im) {
    var p = im.getAttribute('data-portrait');
    if (!p) return;
    var src = window.FMPortraitSrc(p);
    if (src) {
      im.src = src;
      im.style.display = '';
      if (window.FMPortraitPixelated && window.FMPortraitPixelated(p)) im.style.imageRendering = 'pixelated';
    }
  });
}
var _chatCatLoading = false;
function _ensureChatItemCatalog() {
  if (window.ITEM_CATALOG_CLIENT) { _refillChatAvatars(); return; }
  if (_chatCatLoading || !window.lazyLoad) return;
  _chatCatLoading = true;
  window.lazyLoad('assets/inventory.js', function () { _chatCatLoading = false; _refillChatAvatars(); });
}

function addChat(item){
  const channel = item.channel || 'global';
  const ROOMED = ['global','patreon','guild','unmod'];
  // For roomed channels, route to the correct room pane
  let box;
  if (ROOMED.indexOf(channel) !== -1) {
    const room = Math.min(5, Math.max(1, parseInt(item.room) || 1));
    const roomId = room === 1 ? `chatch-${channel}` : `chatch-${channel}-r${room}`;
    box = document.getElementById(roomId) || document.getElementById('chatch-' + channel);
  } else {
    box = document.getElementById('chatch-' + channel) || document.getElementById('chatch-global');
  }
  if (!box) return;
  const div = document.createElement('div');
  div.className = 'cm';

  const isOwner  = !!(item.is_prime);
  const isDev    = !isOwner && !!(item.is_dev);
  const rawBadge = isOwner ? _OWNER_BADGE : (isDev ? _DEV_BADGE : (item.badge || ''));
  const color    = isOwner ? _OWNER_COLOR : (isDev ? _DEV_COLOR : (item.color || '#f0b454'));
  const badge    = rawBadge ? `<span style="margin-right:3px;opacity:.9;color:${color}">${rawBadge}</span>` : '';

  let text = String(item.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const myName = (ME && ME.name) ? ME.name : '';
  if (myName) {
    const re = new RegExp(`(@${myName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    text = text.replace(re, `<span class="chat-mention">$1</span>`);
    if (re.test(item.text || '')) try { playSound && playSound('mention'); } catch(e) {}
  }
  text = text.replace(/@([A-Za-z0-9_\-]+)/g, '<span style="color:#9dffb0;opacity:.8">@$1</span>');

  const isSystem = item.user === 'SYSTEM';
  const titleTag = (!isSystem && item.title) ? ` <span style="font-size:.72rem;opacity:.65;color:${color}">[${item.title}]</span>` : '';
  const nameStyle = `color:${color};${(__isAdmin_g && !isSystem) ? 'cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px' : ''}`;
  const factionIcon = (!isSystem && item.faction === 'syndicate') ? '💀 ' : '';
  const userSpan  = `<b class="chat-username" data-user="${item.user}" style="${nameStyle}">${factionIcon}${item.user}${titleTag}</b>`;

  // Block button (shown on hover, client-side only)
  const blockBtnHtml = (!isSystem && item.user !== (ME && ME.name))
    ? `<span class="chat-block-btn" title="Block this user" style="display:none;margin-left:6px;cursor:pointer;opacity:.5;font-size:.7rem;color:#ff6644;user-select:none" data-block-user="${item.user}">🚫</span>`
    : '';
  div.className = 'cm chat-msg';
  div.dataset.user = item.user || '';
  const _ts = Number(item.t) || Date.now();
  const _timeSpan = `<span class="cm-time" data-ts="${_ts}" title="${new Date(_ts).toLocaleString()}" style="font-size:.6rem;opacity:.4;margin-left:6px;color:${color};white-space:nowrap">${fmtRel(_ts)}</span>`;
  const _psrc = (!isSystem && item.portrait && window.FMPortraitSrc) ? window.FMPortraitSrc(item.portrait) : '';
  const _needsCat = !isSystem && item.portrait && window.FMPortraitNeedsCatalog && window.FMPortraitNeedsCatalog(item.portrait) && !window.ITEM_CATALOG_CLIENT;
  const _pIR = ((_psrc || _needsCat) && window.FMPortraitPixelated && window.FMPortraitPixelated(item.portrait)) ? 'image-rendering:pixelated;' : '';
  // Transparent 1x1 placeholder while the item catalog loads; refilled by _refillChatAvatars.
  const _placeholder = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const avatar = (_psrc || _needsCat)
    ? `<img class="chat-avatar" data-user="${item.user}" data-portrait="${item.portrait}" src="${_psrc || _placeholder}" alt="" loading="lazy" style="width:40px;height:40px;border-radius:50%;object-fit:cover;${_pIR}vertical-align:middle;margin-right:9px;border:2px solid ${color};cursor:pointer"${_psrc ? ` onerror="this.style.display='none'"` : ''}>`
    : '';
  div.innerHTML = `${avatar}${badge}${userSpan}: <span style="color:${isSystem ? '#7fc090' : '#f0b454'}">${text}</span>${_timeSpan}${blockBtnHtml}`;

  // Show block button on hover
  div.addEventListener('mouseenter', function(){ var b=div.querySelector('.chat-block-btn'); if(b) b.style.display='inline'; });
  div.addEventListener('mouseleave', function(){ var b=div.querySelector('.chat-block-btn'); if(b) b.style.display='none'; });

  // Block click handler
  var blockBtn = div.querySelector('.chat-block-btn');
  if (blockBtn) {
    blockBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var uname = blockBtn.dataset.blockUser;
      if (!uname) return;
      if (window.FM_Block && window.FM_Block.isBlocked(uname)) {
        window.FM_Block.unblock(uname);
        blockBtn.title = 'Block this user';
      } else if (window.FM_Block) {
        if (confirm('Block ' + uname + '? Their messages will be hidden for you. (Client-side only, resets on full page reload)')) {
          window.FM_Block.block(uname);
        }
      }
    });
  }

  if (!isSystem && __isAdmin_g) {
    div.querySelector('.chat-username')?.addEventListener('click', e => {
      e.stopPropagation();
      openModPanel(item.user, e.clientX, e.clientY);
    });
  } else if (!isSystem) {
    div.querySelector('.chat-username')?.addEventListener('click', e => {
      e.stopPropagation();
      openPlayerProfile(item.user, e.clientX, e.clientY);
    });
  }
  div.querySelector('.chat-avatar')?.addEventListener('click', e => {
    e.stopPropagation();
    if (!isSystem) openPlayerProfile(item.user, e.clientX, e.clientY);
  });

  const ph = box.querySelector('.chat-ph');
  if (ph) ph.remove();
  box.appendChild(div);
  if (_needsCat) _ensureChatItemCatalog();
  // Transient notifications (passive income, confirms) self-remove after their TTL.
  if (item.ttlMs && Number(item.ttlMs) > 0) {
    setTimeout(function(){ try { div.remove(); } catch(_) {} }, Number(item.ttlMs));
  }
  // Keep last N per pane — matches the server ring so the client shows all retained history.
  const MAX_CHAT_MSGS = 200;
  while (box.children.length > MAX_CHAT_MSGS) { box.removeChild(box.firstChild); }
  box.scrollTop = box.scrollHeight;

  const activeChannel = document.querySelector('.chat-tab.active')?.dataset?.channel || 'global';
  // For global rooms: only show unread badge if not on global tab OR viewing a different room
  if (channel === 'global') {
    const msgRoom = Math.min(5, Math.max(1, parseInt(item.room) || 1));
    const isOnGlobal = activeChannel === 'global';
    const isOnThisRoom = isOnGlobal && window.__globalChatRoom === msgRoom;
    if (!isOnThisRoom) {
      const badge2 = document.getElementById('unread-global');
      if (badge2) { badge2.style.display='inline-block'; badge2.textContent = String((parseInt(badge2.textContent)||0)+1); }
    }
  } else if (channel !== activeChannel && channel !== 'system') {
    const badge2 = document.getElementById('unread-' + channel);
    if (badge2) { badge2.style.display='inline-block'; badge2.textContent = String((parseInt(badge2.textContent)||0)+1); }
  }
}

// ── Pinned announcements (persisted server-side, shown above all chat rooms) ──
function ensureAnnounceBar() {
  let bar = document.getElementById('chatAnnounce');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'chatAnnounce';
    bar.style.cssText = 'display:flex;flex-direction:column;gap:3px;padding:0;margin:0 0 4px';
    const box = document.getElementById('chatBox');
    if (box) box.insertBefore(bar, box.firstChild);
  }
  return bar;
}
function setAnnouncement(a) {
  if (!a || !a.id) return;
  const bar = ensureAnnounceBar();
  let row = document.getElementById('ann-' + a.id);
  if (!row) { row = document.createElement('div'); row.id = 'ann-' + a.id; bar.appendChild(row); }
  row.style.cssText = 'background:#1a0f00;border:1px solid #ff9944;border-left:3px solid #ff9944;'
    + 'color:#ffc38a;font-size:.74rem;padding:5px 8px;letter-spacing:.02em;line-height:1.3';
  const safe = String(a.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const clearBtn = __isAdmin_g
    ? '<span class="ann-clear" title="Clear announcement" style="float:right;cursor:pointer;color:#ff9944;opacity:.65;margin-left:8px;font-weight:bold">✕</span>'
    : '';
  row.innerHTML = clearBtn + '<b style="color:#ff9944">📢 ' + (a.author || 'ADMIN') + ':</b> ' + safe;
  if (__isAdmin_g) {
    const cb = row.querySelector('.ann-clear');
    if (cb) cb.addEventListener('click', function () {
      fetch('/api/admin/broadcast/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': (window.FM_TOKEN || '') },
        body: JSON.stringify({ id: a.id })
      }).then(function () { removeAnnouncement(a.id); }).catch(function () {});
    });
  }
  const ms = (a.expires_at || 0) - Date.now();
  if (ms > 0) setTimeout(function(){ removeAnnouncement(a.id); }, ms);
  else removeAnnouncement(a.id);
}
function removeAnnouncement(id) {
  const row = document.getElementById('ann-' + id);
  if (row) row.remove();
}
window.setAnnouncement = setAnnouncement;
window.removeAnnouncement = removeAnnouncement;

// Fleshbook unread dot — works before the lazy module loads, so updates the DOM directly.
function setFbBadge(n) {
  const b = document.getElementById('unread-fleshbook');
  if (!b) return;
  if (n > 0) { b.style.display = 'inline-block'; b.textContent = String(n); }
  else { b.style.display = 'none'; }
}
document.addEventListener('fm:authed', function(){
  try {
    fetch('/api/fleshbook/unread', { headers: { 'x-auth-token': (window.FM_TOKEN || '') } })
      .then(r => r.json()).then(d => { if (d && d.ok) setFbBadge(d.count || 0); }).catch(()=>{});
  } catch(_) {}
});

// Tabs
$all('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    const sel = tab.dataset.tab;
    el('#marketTab').style.display = sel==='market'?'block':'none';
    el('#pnlTab').style.display = sel==='pnl'?'block':'none';
    el('#casinoTab').style.display = sel==='casino'?'block':'none';
    const _gt = el('#guildTab'); if(_gt) _gt.style.display = sel==='guild'?'block':'none';
    const _bugsTab = el('#bugsTab'); if(_bugsTab) _bugsTab.style.display = sel==='bugs'?'flex':'none';
    const _fbTab = el('#fleshbookTab'); if(_fbTab) _fbTab.style.display = sel==='fleshbook'?'flex':'none';
    const _galTab = el('#galacticTab'); if(_galTab) _galTab.style.display = sel==='galactic'?'flex':'none';
    const _mineTab = el('#miningTab'); if(_mineTab) _mineTab.style.display = sel==='mining'?'flex':'none';
    const _arenaTab = el('#arenaTab'); if(_arenaTab) _arenaTab.style.display = sel==='arena'?'block':'none';
    const _dlTab = el('#devlogsTab'); if(_dlTab){ _dlTab.style.display = sel==='devlogs'?'block':'none';
      if(window.__devlogsSync){ window.__devlogsSync(sel==='devlogs'); }
      else { const _dlF = document.getElementById('devlogsFrame');
        if(_dlF){ const _dlWant = _dlF.getAttribute('data-src');
          if(sel==='devlogs'){ if(_dlF.getAttribute('src') !== _dlWant) _dlF.setAttribute('src', _dlWant); }
          else if(_dlF.getAttribute('src')) _dlF.setAttribute('src',''); } } }
    if (sel==='guild') { loadGuildDirectory(); }
    if (sel==='bugs') { if(window.bugsTabLoad) window.bugsTabLoad(); else lazyLoad('assets/dev-comms.js', ()=>window.bugsTabLoad&&window.bugsTabLoad()); }
    if (sel==='fleshbook') { if(window.fleshbookTabLoad) window.fleshbookTabLoad(); else lazyLoad('assets/fleshbook.js', ()=>window.fleshbookTabLoad&&window.fleshbookTabLoad()); }
    if (sel==='arena') { if(window.tcgTabLoad) window.tcgTabLoad(); else lazyLoad('assets/tcg/tcg-app.js', ()=>window.tcgTabLoad&&window.tcgTabLoad()); }
    if (sel==='mining') {
      try { window.__miningBriefRefresh && window.__miningBriefRefresh(); } catch(_){}
      // Fetch fresh leaderboard whenever the tab is opened
      try { if (window.ws && window.ws.readyState === 1) window.ws.send(JSON.stringify({type:'mining_leaderboard'})); } catch(_){}
    }
    // ensure the equity line renders when the P&L tab becomes visible
    if (sel==='pnl') { setTimeout(()=>{ try { drawEquity(); } catch(e){} }, 0); }
  });

  // Casino subtabs — lazy script loading
  // Scripts for roulette and blackjack load immediately (default views).
  // All others inject their <script> tag on first click, then init.
  const CASINO_PANES = ['roulette','blackjack','poker','horseraces','baccarat','sicbo','chess','sudoku','mathgame','minesweeper','solitaire'];
  const CASINO_SCRIPTS = {
    'blackjack':   'assets/casino-blackjack.js',
    'poker':       'assets/casino-poker.js',
    'chess':       'assets/casino-chess.js',
    'sudoku':      'assets/casino-sudoku.js',
    'mathgame':    'assets/casino-mathgame.js',
    'minesweeper': 'assets/casino-minesweeper.js',
    'baccarat':    'assets/casino-baccarat.js',
    'sicbo':       'assets/casino-sicbo.js',
    'solitaire':   'assets/casino-solitaire.js',
  };
  const casinoScriptLoaded = new Set(['roulette']); // roulette is inline in galaxy/sound block; blackjack loads below
  const casinoInited = new Set(['roulette']);

  function loadCasinoScript(name, cb) {
    if (casinoScriptLoaded.has(name)) { if(cb) cb(); return; }
    const src = CASINO_SCRIPTS[name];
    if (!src) { if(cb) cb(); return; }
    casinoScriptLoaded.add(name);
    const s = document.createElement('script');
    s.src = src;
    s.onload = cb || null;
    document.head.appendChild(s);
  }

  // Eagerly load blackjack (second tab, players switch to it immediately)
  loadCasinoScript('blackjack');

  $all('#casinoTabs .subtab').forEach(st=>{
    st.addEventListener('click', ()=>{
      document.querySelectorAll('#casinoTabs .subtab').forEach(t=>t.classList.remove('active'));
      st.classList.add('active');
      const which = st.dataset.subtab;
      CASINO_PANES.forEach(name=>{
        const pane = el('#casino-'+name);
        if (pane) pane.style.display = (name===which)?'block':'none';
      });
      // Load script on first visit, then init
      if (!casinoInited.has(which)) {
        loadCasinoScript(which, () => {
          casinoInited.add(which);
          if (which==='sudoku'      && window.__initSudoku)      window.__initSudoku();
          if (which==='mathgame'    && window.__initMathGame)    window.__initMathGame();
          if (which==='minesweeper' && window.__initMinesweeper) window.__initMinesweeper();
        });
      }
    });
  });

});

// Redraw equity on resize (keeps line tidy on different layouts)
try {
  const ro = new ResizeObserver(()=>{ try { drawEquity(); } catch(e){} });
  const pnl = document.getElementById('pnlTab');
  if (pnl) ro.observe(pnl);
} catch(e) {}
// UI events
var __hb = el('#helloBtn'); if (__hb) __hb.onclick = ()=>{
  const name = el('#name').value.trim() || undefined;
  ws.send(JSON.stringify({type:'hello', name}));
  ws.send(JSON.stringify({type:'request_state'}));
};

el('#buy').onclick = ()=>{ try{ window.marketAPI && window.marketAPI.buy && window.marketAPI.buy(); }catch(e){} };;

// overridden by Sell Modal

// ─── Guild Clearance (1.3.7.0) ──────────────────────────────────────
// Credits an account has EARNED can leave it. The seed advance cannot, and
// neither can credits somebody else wired in. The readout exists so a blocked
// wire is legible before the player presses the button, not after.
window.__FM_CLEARANCE = null;

function renderClearance(c) {
  window.__FM_CLEARANCE = c || null;
  var box = document.getElementById('clearanceNote');
  if (!box) return;
  if (!c || c.enabled === false) { box.textContent = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  if (c.exempt) {
    box.style.color = '#c8a24a';
    box.textContent = 'Guild clearance: unrestricted.';
    return;
  }
  var left = Number(c.remaining) || 0;
  var fmt  = function(n){ return '\u0192' + Math.floor(n).toLocaleString(); };
  if (left <= 0) {
    box.style.color = '#c0392b';
    box.textContent = 'Guild clearance: ' + fmt(0) + '. Clearance is earned, not issued. '
      + 'Your seed advance and credits wired to you cannot be sent on. Trade, gamble, mine, complete tests.';
  } else {
    box.style.color = '#3a5f3a';
    box.textContent = 'Guild clearance: ' + fmt(left) + ' may leave this account. '
      + 'Peak net worth ' + fmt(c.peak) + ', less the ' + fmt(c.grant) + ' seed advance'
      + (c.received > 0 ? ', less ' + fmt(c.received) + ' wired to you' : '')
      + (c.sent > 0 ? ', less ' + fmt(c.sent) + ' already sent' : '') + '.';
  }
}

el('#xfer').onclick = ()=>{
  var amt = Number(el('#amt').value||0);
  var c = window.__FM_CLEARANCE;
  if (c && c.enabled !== false && !c.exempt && amt > (Number(c.remaining)||0)) {
    try { (window.gToast||window.toast||alert)('Guild clearance denied. You may move \u0192'
      + Math.floor(Number(c.remaining)||0).toLocaleString() + ' off this account.'); } catch(e){}
    return;
  }
  ws.send(JSON.stringify({type:'transfer', toName:el('#toName').value, amount:amt}));
};

// Chat wiring handled by unified chat system below
// (sendChatMsg, channel routing, @mention — see Chat System script)

el('#search').addEventListener('input', renderTickers);

// ─── Margin Call banner + live countdown (client) ───────────────────────────
var __mcInterval = null;
var __mcDeadline = 0;
function _mcFmt(ms){
  if (ms <= 0) return '00:00:00';
  var s = Math.floor(ms/1000);
  var h = Math.floor(s/3600), m = Math.floor((s%3600)/60), ss = s%60;
  var p = function(n){ return (n<10?'0':'')+n; };
  return p(h)+':'+p(m)+':'+p(ss);
}
function _mcTick(){
  var el = document.getElementById('mc-countdown'); if (!el) return;
  var rem = __mcDeadline - Date.now();
  if (rem <= 0){ el.textContent = 'SETTLING…'; el.style.color = '#ff6666'; return; }
  el.textContent = _mcFmt(rem);
  // turn red in the final 15 minutes
  el.style.color = rem < 15*60*1000 ? '#ff8a5c' : '#ffd27d';
}
function updateMarginCallBanner(mc){
  var banner = document.getElementById('margin-call-banner'); if (!banner) return;
  if (!mc || !mc.deadline){
    banner.style.display = 'none';
    if (__mcInterval){ clearInterval(__mcInterval); __mcInterval = null; }
    return;
  }
  var symEl = document.getElementById('mc-symbol');
  if (symEl) symEl.textContent = mc.symbol || '--';
  var btn = document.getElementById('mc-cover-btn');
  if (btn) btn.onclick = function(){ try { window.__ShortModal && window.__ShortModal.open(mc.symbol); } catch(e){} };
  __mcDeadline = Number(mc.deadline) || 0;
  banner.style.display = 'block';
  _mcTick();
  if (!__mcInterval) __mcInterval = setInterval(_mcTick, 1000);
}
window.updateMarginCallBanner = updateMarginCallBanner;



function applyDunceState(reason) {
  var dunceTab = document.getElementById('dunce-chat-tab');
  if (dunceTab) dunceTab.style.display = '';
  var banner = document.getElementById('dunce-banner');
  if (banner) banner.style.display = 'block';
  var rt = document.getElementById('dunce-reason-text');
  if (rt) rt.textContent = reason || '';
  updateDunceFineDisplay();
  // Switch to dunce channel — defer slightly so tab listener is ready
  setTimeout(function() {
    var dTab = document.querySelector('.chat-tab[data-channel="dunce"]');
    if (dTab) dTab.click();
  }, 50);
  var ci = document.getElementById('chatInput');
  if (ci) ci.placeholder = '🎓 Dunce chat only…';
}

function removeDunceState() {
  var dunceTab = document.getElementById('dunce-chat-tab');
  if (dunceTab) dunceTab.style.display = 'none';
  var banner = document.getElementById('dunce-banner');
  if (banner) banner.style.display = 'none';
  setTimeout(function() {
    var gTab = document.querySelector('.chat-tab[data-channel="global"]');
    if (gTab) gTab.click();
  }, 50);
  var ci = document.getElementById('chatInput');
  if (ci) ci.placeholder = 'Say something… @mention';
}

function updateDunceFineDisplay() {
  var fineEl = document.getElementById('dunce-fine-display');
  if (!fineEl) return;
  var cash = (typeof window.__MY_CASH === 'number') ? window.__MY_CASH : (ME && ME.cash ? ME.cash : 0);
  var equity = 0;
  if (window.__MY_POSITIONS) {
    Object.entries(window.__MY_POSITIONS).forEach(function(kv) {
      var sym = kv[0], pos = kv[1];
      var price = 0;
      if (window.__companies_g) {
        var co = window.__companies_g.find(function(c){ return c.symbol === sym; });
        if (co) price = co.price || 0;
      }
      if (pos.qty > 0) equity += price * pos.qty;
    });
  }
  var netWorth = cash + equity;
  var fine = Math.round(netWorth * 0.45 * 100) / 100;
  fineEl.textContent = 'Ƒ' + fine.toLocaleString(undefined, {maximumFractionDigits:2})
    + ' (45% of ~Ƒ' + Math.round(netWorth).toLocaleString() + ' net worth)';
}

window.dunceRedeem = function() {
  var tok = window.FM_TOKEN || window.gToken || (ME && ME.id) || null;
  if (!tok) { showToast('Not logged in', '#ff4444'); return; }
  var hint = document.getElementById('dunce-redeem-hint');
  if (hint) { hint.textContent = 'Processing…'; hint.style.color = '#888'; }
  fetch('/api/dunce/redeem', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ token: tok })
  }).then(function(r){ return r.json(); }).then(function(d) {
    if (d.ok) {
      if (hint) { hint.textContent = '✓ Paid Ƒ' + Number(d.fine).toLocaleString(undefined,{maximumFractionDigits:2}) + '. Welcome back.'; hint.style.color = '#86ff6a'; }
    } else {
      var errMsg = d.msg || d.error || 'Error';
      if (hint) { hint.textContent = '✗ ' + errMsg; hint.style.color = '#ff6666'; }
      showToast('✗ ' + errMsg, '#ff4444');
    }
  }).catch(function() {
    if (hint) { hint.textContent = '✗ Network error'; hint.style.color = '#ff6666'; }
  });
};
// ─────────────────────────────────────────────────────────────────────────────

// WS handlers
ws.addEventListener('open', ()=>{
  try{ ws.send(JSON.stringify({type:'hello'})); }catch(e){}
  try{ ws.send(JSON.stringify({type:'request_state'})); }catch(e){}
  // Re-request chart if we already have a symbol selected (e.g. after reconnect)
  try{ if (CURRENT) ws.send(JSON.stringify({type:'chart', symbol:CURRENT})); }catch(e){}
  try{ ws.send(JSON.stringify({type:'market_upgrades_list'})); }catch(e){}
  try{ ws.send(JSON.stringify({type:'auto_accum_get'})); }catch(e){}
});
ws.addEventListener('message', (ev)=>{
  const _evData = ev && ev.data != null ? ev.data : (ev && ev.detail && ev.detail.data);
  let msg; try { msg = JSON.parse(_evData); } catch(e) { return; }
  if (msg.type === 'welcome') {
    ME = msg.data;
    // Ensure token/id fields are populated for inventory system
    if (!ME.token) ME.token = window.FM_TOKEN || '';
    if (!ME.id)    ME.id    = window.FM_TOKEN || '';
    // Sync faction to window.ME so lazy-loaded modules (galaxy.js) can read it
    if (window.ME) window.ME.faction = ME.faction || null;
    if (window.ME && ME.portrait != null) window.ME.portrait = ME.portrait;
    if (window.FMHeaderPortrait && ME.portrait != null) window.FMHeaderPortrait(ME.portrait);
    // Update guild chat placeholder based on guild eligibility
    var gph = document.getElementById('guildPlaceholder');
    if (gph) {
      var isGuild = (ME.patreon_tier && ME.patreon_tier >= 2) || ME.is_dev || ME.is_prime || ME.is_admin;
      if (isGuild) {
        gph.textContent = 'Merchants Guild chat. Members only.';
      } else {
        gph.textContent = 'Merchants Guild members only.';
      }
    }
  }
  if (msg.type === 'init') {
    TICKERS = msg.data.companies.map(c => ({ ...c, pct: 0 }));
    renderTickers();
    if (msg.data.leaderboard) { _lbCacheSave(msg.data.leaderboard); renderBoard(msg.data.leaderboard); }
    msg.data.headlines && msg.data.headlines.slice(-10).forEach(renderNews);
    renderNewsHeader(msg.data.breaking || null);
    // Auto-select first stock on load so chart is never blank
    if (!CURRENT && TICKERS.length) {
      CURRENT = TICKERS[0].symbol;
      try { el('#sym').value = CURRENT; } catch(e) {}
      sendWS({ type: 'chart', symbol: CURRENT });
    }
    // Seed heatmap data immediately
    window.TICKERS = TICKERS;
    if (msg.data.wormholeOpen != null) { window._WORMHOLE_OPEN = !!msg.data.wormholeOpen; if (window._setWormhole) window._setWormhole(window._WORMHOLE_OPEN); }
  }
  if (msg.type === 'company_added' && msg.data && msg.data.symbol) {
    // A new ticker (e.g. a freshly Index-listed Capital House) — add it live so
    // already-connected clients see it without reconnecting. Also reused to push a
    // metadata update (name/description) for an existing fund ticker on house edit.
    try {
      const existing = TICKERS.find(t => t.symbol === msg.data.symbol);
      if (!existing) {
        TICKERS.push({ id: msg.data.id, name: msg.data.name, symbol: msg.data.symbol,
                       price: msg.data.price || 0, sector: msg.data.sector || 7, pct: 0,
                       fundTicker: !!msg.data.fundTicker, jade: !!msg.data.jade, desc: msg.data.desc || '' });
        TICKERS.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        renderTickers();
        window.TICKERS = TICKERS;
      } else {
        // Update mutable metadata in place (name/description); leave live price/pct alone.
        if (msg.data.name) existing.name = msg.data.name;
        if (msg.data.desc != null) existing.desc = msg.data.desc;
        if (msg.data.fundTicker != null) existing.fundTicker = !!msg.data.fundTicker;
        window.TICKERS = TICKERS;
        // The detail panel re-renders on the next tick (market-tools hooks 'tick'), so the
        // updated name/description appears within ~1s without a direct call here.
      }
    } catch (e) {}
  }
  if (msg.type === 'index_delisted' && msg.data && msg.data.symbol) {
    // Ticker removed from the tape on delist/disband — drop it from the local list.
    try {
      const i = TICKERS.findIndex(t => t.symbol === msg.data.symbol);
      if (i >= 0) { TICKERS.splice(i, 1); renderTickers(); window.TICKERS = TICKERS; }
    } catch (e) {}
  }
  if (msg.type === 'wormhole' && msg.data) {
    window._WORMHOLE_OPEN = !!msg.data.open;
    if (window._setWormhole) window._setWormhole(window._WORMHOLE_OPEN);
  }
  if (msg.type === 'tick') {
    // Merge new prices into TICKERS (don't replace — tick data has no .name)
    if (Array.isArray(msg.data)) {
      const priceMap = {};
      for (const t of msg.data) { if (t && t.symbol) priceMap[t.symbol] = t.price; }
      for (const t of TICKERS) {
        if (priceMap[t.symbol] != null) t.price = priceMap[t.symbol];
        // v5.0: store pct change
        const td = msg.data.find(x=>x.symbol===t.symbol);
        if (td && td.pct != null) t.pct = td.pct;
        if (td && td.sector != null) t.sector = td.sector;
      }
      // Track latest prices globally for casino / PnL modules
      try {
        window.__LAST_MARKS = window.__LAST_MARKS || {};
        for (const t of msg.data) { if (t && t.symbol) __LAST_MARKS[String(t.symbol).toUpperCase()] = { price: Number(t.price||0) }; }
      } catch(e) {}
      try { window.__onPriceTickForModal && window.__onPriceTickForModal(); } catch(e) {}
      // Live P&L: re-render on every tick using cached positions + fresh prices
      try { liveUpdatePnL(msg.data); } catch(e) {}
      try {
        if (window.PnLBridge && typeof window.PnLBridge.onPriceTick === 'function') {
          const now = performance.now();
          for (const t of msg.data) {
            if (t && t.symbol) window.PnLBridge.onPriceTick({ symbol: String(t.symbol), price: Number(t.price||0), ts: now });
          }
        }
      } catch(e) {}
      // v5.0: refresh heatmap if visible
      window.TICKERS = TICKERS; // keep in sync for cross-script access
      try { refreshHeatmap(); } catch(e) {}
      try { window.refreshGuildHoldingsLive && window.refreshGuildHoldingsLive(); } catch(e) {}
      try { updateBottomTicker(); } catch(e) {}
    }
    renderTickers();
    // Push raw tick price into wave buffer for scrolling chart
    if (CURRENT && Array.isArray(msg.data)) {
      const tick = msg.data.find(t => t && t.symbol === CURRENT);
      if (tick) {
        _wavePush(tick.price);
      }
    }
  }
  if (msg.type === 'news') {
    renderNews(msg.data);
  }
  if (msg.type === 'breaking_news') {
    renderNewsHeader(msg.data || { active: false });
  }
  if (msg.type === 'leaderboard') {
    _lbCacheSave(msg.data);
    renderBoard(msg.data);
  }
  if (msg.type === 'portfolio') {
    // Guild Clearance readout on the wire panel.
    try { if (msg.data && msg.data.clearance) renderClearance(msg.data.clearance); } catch(e){}
    // Cache clean position data (qty + avg cost only — no stale price)
    try {
      window.__MY_POSITIONS = {};
      window.__MY_CASH = Number(msg.data.cash) || 0;
      // Keep ME.cash in sync so casino and other subsystems read the right value
      if (typeof ME === 'object' && ME) ME.cash = Number(msg.data.cash) || 0;
      for (const po of (msg.data.positions || [])) {
        if (po.sym && po.qty !== 0) {
          __MY_POSITIONS[po.sym] = { qty: Number(po.qty)||0, avg: Number(po.avg)||0 };
        }
      }
      // Sync faction to the globals other modules (galaxy, codec, header) read.
      if (msg.data.faction) {
        window.gPlayerFaction = msg.data.faction;
        if (window.ME) window.ME.faction = msg.data.faction;
      }
    } catch(e) {}
    renderPositions(msg.data);
    // v5.0: update sector breakdown
    try { renderSectorBreakdown(msg.data.sectorBreakdown, msg.data.equity); } catch(e) {}
    // Update passive income display under EOD timer
    try {
      const pi = msg.data.passiveIncome;
      if (pi) {
        window.__passiveIncome = pi;
        const piEl = document.getElementById('passiveIncomeEOD');
        if (piEl) {
          const t = pi.total||0;
          const display = t >= 1_000_000 ? (t/1_000_000).toFixed(1)+'M'
                        : t >= 1_000 ? (t/1_000).toFixed(1)+'k'
                        : String(t);
          piEl.textContent = 'PASSIVE: Ƒ' + display + '/30m';
          piEl.style.opacity = '1';
        }
      }
    } catch(e) {}
    // Update P&L tab so cash/net-worth reflect fund deposits, withdrawals, admin changes etc.
    try { liveUpdatePnL(null, msg.data); } catch(e) {}
    // Also update the cash display in the header
    try {
      const cashEl = document.getElementById('cash');
      if (cashEl && msg.data.cash != null) cashEl.textContent = 'Ƒ' + Math.round(msg.data.cash).toLocaleString();
    } catch(e) {}
    try { updateMarginCallBanner(msg.data.marginCall || null); } catch(e) {}
  }
  if (msg.type === 'chart') {
    if (msg.data && msg.data.ohlc) {
      OHLC = msg.data.ohlc;
      // Seed wave buffer from OHLC close prices
      _waveBuffer = msg.data.ohlc.map(d => d.c);
      _waveTimes  = msg.data.ohlc.map(d => Number(d.t) || Date.now());
      _waveOpenPrice = msg.data.ohlc.length ? msg.data.ohlc[0].o : 0;
      drawChart();
    }
  }
  if (msg.type === 'market_upgrades_state' || msg.type === 'market_upgrade_purchased') {
    const d = msg.data || {};
    window.FM_MARKET_UPGRADES = new Set(d.owned || []);
    if (Array.isArray(d.catalog)) window.FM_MARKET_CATALOG = d.catalog;
    if (typeof d.cash === 'number') window.FM_UPG_CASH = d.cash;
    try { window.FMUpgradesRender && window.FMUpgradesRender(); } catch(_){}
    try { if (typeof _waveBuffer !== 'undefined' && _waveBuffer.length) drawChart(); } catch(_){}
  }
  if (msg.type === 'auto_accum_state') {
    window.FM_AUTO_ACCUM = msg.data || { owned:false, configs:[] };
    if (msg.data && typeof msg.data.cash === 'number') window.FM_UPG_CASH = msg.data.cash;
    try { window.FMUpgradesRender && window.FMUpgradesRender(); } catch(_){}
  }
  if (msg.type === 'chat') addChat(msg.data);
  if (msg.type === 'announcements') { (msg.data || []).forEach(setAnnouncement); }
  if (msg.type === 'announcement_set') setAnnouncement(msg.data);
  if (msg.type === 'announcement_clear') removeAnnouncement(msg.data && msg.data.id);
  if (msg.type === 'fleshbook_unread') setFbBadge(msg.data && msg.data.count || 0);
  if (msg.type === 'chat_history') {
    // Replay last 30min of messages on login/reconnect
    const msgs = (msg.data && msg.data.messages) || [];
    if (msgs.length) {
      // Add a visual separator first
      try {
        const sep = document.createElement('div');
        sep.style.cssText = 'text-align:center;color:#333;font-size:.7rem;padding:4px 0;letter-spacing:.08em';
        sep.textContent = '─── session history ───';
        const chatEl = document.querySelector('#chatMessages') || document.querySelector('.chat-messages') || document.querySelector('#chatGlobal');
        if (chatEl) chatEl.prepend(sep);
      } catch(_) {}
      msgs.forEach(function(m) { try { addChat(m.data || m, true); } catch(_) {} });
    }
  }
  if (msg.type === 'fund_update') {
    onFundUpdate(msg.data);
  }
  if (msg.type === 'patreon') {
    const d = msg.data;
    const tierNames = {0:'Free',1:'Premium ★',2:'Merchants Guild ⚖',3:'CEO ♛'};
    const colors    = {0:'#888',1:'#c8a040',2:'#2ecc71',3:'#9dff5a'};
    const glyphs    = {1:'★',2:'⚖',3:'♛'};
    const color = colors[d.tier] || '#46ff7d';
    addChat({user:'SYSTEM', text: d.message || `Tier updated: ${tierNames[d.tier]||d.tier}`, badge:'⚡', color});
    if (typeof d.tier === 'number') {
      // Update all badge elements
      ['fm-tier-badge','fm-tier-badge-hdr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.textContent = glyphs[d.tier]||''; el.style.color = color; }
      });
      // Update ME so chat color applies immediately to outgoing messages
      if (window.ME) window.ME.patreon_tier = d.tier;
      // Update MY_PATREON_TIER in title store (controls title unlock visibility)
      try { document.dispatchEvent(new CustomEvent('fm:patreon_tier_changed', {detail:{tier:d.tier}})); } catch(_) {}
      // Show guild tab if newly eligible
      if (d.tier >= 2) {
        const guildBtn = document.getElementById('guildTabBtn');
        if (guildBtn) guildBtn.style.display = 'inline-block';
      }
      // Portfolio refresh to reflect any cash/tier changes
      try { sendWS({type:'portfolio_request'}); } catch(_) {}
    }
  }
  if (msg.type === 'income') {
    const d = msg.data;
    const hasBonus  = d.bonus > 0;
    const isPatreon = d.base > 25; // free tier base is 25; anything above is Patreon
    const color = hasBonus ? '#4ecdc4' : (isPatreon ? '#46ff7d' : '#888');
    const badge = hasBonus ? '⚖' : (isPatreon ? 'Ƒ' : 'Ƒ');
    var _txt = d.text;
    if (window._lang === 'zh') {
      // The server sends the prose already assembled in English, but it also
      // sends the numbers. Rebuild from the numbers instead of translating the
      // sentence, so a server-side wording change cannot leave stale Chinese.
      var _base = Number(d.base || 0), _bon = Number(d.bonus || 0);
      _txt = '+\u0192' + _base.toLocaleString() + ' ' + (window.t ? window.t('sys.passiveIncome','passive income') : 'passive income');
      if (_bon > 0) _txt += '  \u00b7  +\u0192' + _bon.toLocaleString() + ' ' + (window.t ? window.t('sys.bonus','bonus') : 'bonus');
    }
    addChat({ user: 'SYSTEM', text: _txt, badge, color, ttlMs: 60000 });
  }
  // ── v5.0 handlers ────────────────────────────────────────────────────────
  if (msg.type === 'trade_feed') {
    try { renderTradeFeed(msg.data); } catch(e) {}
  }
  if (msg.type === 'orders') {
    try { renderOpenOrders(msg.data); } catch(e) {}
  }
  if (msg.type === 'limit_filled') {
    const d = msg.data;
    playSound('fill');
    addChat({ user: 'SYSTEM', text: `✅ Limit ${d.side.toUpperCase()} filled: ${d.qty}× ${d.symbol} @ Ƒ${d.fillPrice.toFixed(2)}`, badge:'⚡', color:'#86ff6a', ttlMs: 60000 });
  }
  if (msg.type === 'earnings_alert') {
    const d = msg.data;
    playSound(d.beat ? 'buy' : 'sell');
    const dir = d.beat ? '▲' : '▼';
    const color = d.beat ? '#86ff6a' : '#ff6a6a';
    showToast(`${dir} EARNINGS: ${d.symbol} ${d.beat?'BEAT':'MISS'} ${dir}${d.magnitude}% → Ƒ${d.newPrice.toFixed(2)}`, color, 3500, d.symbol);
  }
  if (msg.type === 'dividend') {
    playSound('buy');
    showToast(`💰 Dividend received: +Ƒ${msg.data.amount.toFixed(2)}`, '#4ecdc4');
    addChat({ user: 'SYSTEM', text: `💰 Dividend: +Ƒ${msg.data.amount.toFixed(2)}`, badge:'Ƒ', color:'#4ecdc4', ttlMs: 60000 });
  }
  if (msg.type === 'borrow_fee') {
    showToast(`📉 Short borrow fee: -Ƒ${msg.data.amount.toFixed(2)}`, '#ff9966');
  }
  if (msg.type === 'chat_system') {
    addChat({ user: 'SYSTEM', text: msg.data.text, badge:'⚡', color:'#86ff6a', ttlMs: 60000 });
  }
  if (msg.type === 'error') {
    try { showToast('❌ ' + (msg.data?.msg || 'Trade rejected'), '#ff6a6a'); } catch(e) {}
  }
  if(msg.type==='whisper'){
    const d=msg.data||{}; const isSent=!!(d.sent);
    const pane=document.getElementById('chatch-whisper');
    if(pane){
      const ph=pane.querySelector('.chat-ph'); if(ph)ph.remove();
      const row=document.createElement('div'); row.className='cm';
      let st=String(d.text||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const myN=(ME&&ME.name)?ME.name:'';
      if(myN&&!isSent){try{const re=new RegExp('(@'+myN.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');st=st.replace(re,'<span class="chat-mention">$1</span>');}catch(e){}}
      if(isSent){
        row.innerHTML='<span style="opacity:.45;font-size:.72rem">→ '+d.to+':</span> <span style="color:#9b8fbf;font-style:italic">'+st+'</span>';
      }else{
        window._whisperTarget=d.from;
        const sC=d.is_prime?_OWNER_COLOR:(d.is_dev?_DEV_COLOR:(d.color||'#d4b87a'));
        const sB=d.is_prime?_OWNER_BADGE:(d.is_dev?_DEV_BADGE:(d.badge||''));
        const bS=sB?'<span style="color:'+sC+';margin-right:2px">'+sB+'</span>':'';
        row.innerHTML=bS+'<b style="color:'+sC+'">'+d.from+'</b> <span style="opacity:.45;font-size:.72rem">→ you:</span> <span style="color:#c8e6c9">'+st+'</span>';
        try{playSound&&playSound('mention');}catch(e){}
        try{showToast('💬 '+d.from+': '+d.text,'#7c5cbf');}catch(e){}
        const wt=document.querySelector('.chat-tab[data-channel="whisper"]');
        if(wt&&wt.classList.contains('active')){
          const wtb=document.getElementById('whisperTargetBadge');
          if(wtb){wtb.style.display='inline';wtb.textContent='← '+d.from;}
          const ci=document.getElementById('chatInput');
          if(ci)ci.placeholder='Reply to '+d.from+'…';
        }
      }
      pane.appendChild(row); while(pane.children.length>100){pane.removeChild(pane.firstChild);} pane.scrollTop=pane.scrollHeight;
    }
    const _acNow=document.querySelector('.chat-tab.active')?.dataset?.channel||'global';
    if(_acNow!=='whisper'){const b2=document.getElementById('unread-whisper');if(b2){b2.style.display='inline-block';b2.textContent=String((parseInt(b2.textContent)||0)+1);}}
  }
  if(msg.type==='dunced'){
    window.__IS_DUNCED = true;
    applyDunceState(msg.data?.reason || 'Unruly behaviour');
    showToast('🎓 You have been sent to the dunce corner.', '#ff4444');
    addChat({ user: 'SYSTEM', text: `🎓 You have been dunced by ${msg.data?.by||'a dev'}. Reason: ${msg.data?.reason||'Unruly behaviour'}`, badge:'🎓', color:'#ff4444', channel:'dunce' });
  }
  if (msg.type === 'undunced') {
    window.__IS_DUNCED = false;
    removeDunceState();
    showToast('🎓 ' + (msg.data?.msg || 'Dunce status removed.'), '#4ecdc4');
  }
  if (msg.type === 'welcome' && msg.data?.is_dunced) {
    window.__IS_DUNCED = true;
    window.__DUNCE_REASON = msg.data?.dunce_reason || 'You are in the dunce corner.';
    // Update the reason text if banner already showing from fm:authed
    const rt = document.getElementById('dunce-reason-text');
    if (rt && window.__DUNCE_REASON) rt.textContent = window.__DUNCE_REASON;
    if (!document.getElementById('dunce-banner')?.offsetParent) {
      applyDunceState(window.__DUNCE_REASON);
    }
  }
  if (msg.type === 'president_state') {
    if (window._onPresidentState) window._onPresidentState(msg.data);
  }
  if (msg.type === 'president_elected') {
    const d = msg.data || {};
    showToast('⬡ ' + d.name + ' IS NOW PRESIDENT OF THE COALITION', '#00bfff', 6000);
    if (window._onPresidentState) window._onPresidentState({ holder: { name: d.name, id: d.id } });
  }
  if (msg.type === 'president_ousted') {
    const d = msg.data || {};
    showToast('⬡ ' + d.ousted + ' HAS BEEN REMOVED FROM OFFICE', '#ff4444', 5000);
  }
  if (msg.type === 'quest_state') {
    window.FM_QUESTS = (msg.data && msg.data.quests) || [];
  }
  if (msg.type === 'portrait_reverted') {
    if (window.ME) window.ME.portrait = null;
    if (window.FMHeaderPortrait) window.FMHeaderPortrait(null);
    if (window.showToast) window.showToast('Portrait reverted: the item is no longer equipped', '#f0b454', 4000);
  }
  if (msg.type === 'quest_complete') {
    const d = msg.data || {};
    window.FM_QUESTS = window.FM_QUESTS || [];
    let row = window.FM_QUESTS.find(q => q.id === d.questId);
    if (row) { row.status = 'completed'; row.outcome = d.outcome; }
    else window.FM_QUESTS.push({ id: d.questId, status: 'completed', outcome: d.outcome });
    const delivered = d.outcome === 'delivered';
    const parts = [];
    if (d.spins)  parts.push(d.spins + ' spin' + (d.spins === 1 ? '' : 's'));
    if (d.refund) parts.push('Ƒ' + Math.round(d.refund).toLocaleString() + ' reimbursed');
    const detail = parts.length ? (': ' + parts.join(', ')) : '';
    showToast('◈ ' + (d.title || 'Contract') + (delivered ? ' complete' : ' resolved') + detail, delivered ? '#4ecdc4' : '#f0b454', 5000);
  }
});

// ===== Casino: Roulette (European, single zero) — IMPROVED =====
(function(){
  const pane = document.getElementById('casino-roulette');
  if (!pane) return;
  const T=(k,fb)=>window.t?window.t(k,fb):fb;
  const TF=(k,fb,v)=>window.tf?window.tf(k,fb,v):fb;
  function rlColorName(c){var m={red:'casino.rl.colorRed',black:'casino.rl.colorBlack',green:'casino.rl.colorGreen'};return T(m[c]||'',c);}

  const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

  pane.innerHTML = `
  <style>
  #rl-wrap{font-family:monospace;width:100%;padding:10px 4px}
  #rl-table{background:radial-gradient(ellipse at center,#1a0d00 0%,#0a0500 100%);border:2px solid #5a3010;border-radius:16px;padding:14px 16px 18px;margin-bottom:12px;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
  #rl-wheel-col{display:flex;flex-direction:column;align-items:center;gap:8px}
  #rl-controls{flex:1;min-width:260px;display:flex;flex-direction:column;gap:10px}
  .rl-label{font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#8a6a40;margin-bottom:3px}
  .rl-info-row{display:flex;gap:18px;font-size:.85rem;flex-wrap:wrap;margin-bottom:4px}
  .rl-info-row span{color:#8ab}.rl-info-row strong{color:#72e09c}
  .rl-bet-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .rl-bet-row input{width:90px;padding:5px 8px;background:#0d0d08;border:1px solid #1f4a1f;color:#72e09c;font-size:.85rem;font-family:monospace;border-radius:4px}
  .rl-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
  .rl-chips button{padding:4px 9px;background:#06200d;border:1px solid #5a4a10;color:#72e09c;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.78rem;transition:background .15s}
  .rl-chips button:hover{background:#2a2200}
  .rl-bet-type-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .rl-bet-type-row select,.rl-bet-type-row input{padding:5px 8px;background:#0d0d08;border:1px solid #1f4a1f;color:#72e09c;font-size:.82rem;font-family:monospace;border-radius:4px}
  #rl-action-row{display:flex;gap:8px;flex-wrap:wrap}
  #rl-action-row button{padding:7px 18px;background:#06200d;border:1px solid #5a4a10;color:#72e09c;cursor:pointer;border-radius:5px;font-family:monospace;font-size:.85rem;transition:background .15s,border-color .15s}
  #rl-action-row button:hover{background:#2a2200}
  #rl-spin-btn{border-color:#8a6a00!important;color:#9dff5a!important}
  #rl-spin-btn:hover{background:#012a14!important;border-color:#2f9f4a!important}
  #rl-clear-btn{border-color:#6a2020!important;color:#ff9090!important}
  #rl-clear-btn:hover{background:#2a0808!important}
  #rl-bets-list{max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:3px}
  .rl-bet-item{display:flex;justify-content:space-between;align-items:center;padding:3px 8px;border-radius:4px;background:#0d0a00;border:1px solid #2a1a00;font-size:.78rem}
  .rl-bet-item .rl-bi-label{color:#c8a060}
  .rl-bet-item .rl-bi-amt{color:#72e09c}
  .rl-bet-item .rl-bi-del{cursor:pointer;color:#884040;margin-left:6px;font-size:.7rem}
  .rl-bet-item .rl-bi-del:hover{color:#ff6060}
  #rl-result-banner{padding:8px 14px;border-radius:8px;font-size:.95rem;display:none;margin-top:4px;text-align:center;letter-spacing:.05em}
  #rl-result-banner.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}
  #rl-result-banner.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}
  #rl-result-banner.neutral{background:#06200d;border:1px solid #5a5000;color:#ffeb80}
  #rl-log{max-height:90px;overflow-y:auto;font-size:.72rem;color:#7a8a6a;line-height:1.5;margin-top:4px}
  #rl-log div{border-bottom:1px solid #1a1a0a;padding:1px 0}
  /* Number grid for straight bets */
  .rl-num-grid{display:grid;grid-template-columns:repeat(13,1fr);gap:2px;margin-top:6px}
  .rl-num-cell{width:22px;height:20px;border-radius:3px;border:1px solid #2a1a00;display:flex;align-items:center;justify-content:center;font-size:.6rem;cursor:pointer;font-family:monospace;transition:filter .12s}
  .rl-num-cell:hover{filter:brightness(1.6)}
  .rl-num-cell.red-cell{background:#5a1010;color:#ff9090}
  .rl-num-cell.black-cell{background:#1a1a1a;color:#b0b0b0}
  .rl-num-cell.green-cell{background:#0a3a0a;color:#80ff80}
  .rl-num-cell.selected-num{outline:2px solid #9dff5a;filter:brightness(1.8)}
  /* Last results strip */
  #rl-history{display:flex;gap:3px;flex-wrap:nowrap;overflow:hidden;margin-top:6px;min-height:18px}
  .rl-hist-dot{width:16px;height:16px;border-radius:50%;font-size:.55rem;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;color:#fff}
  </style>
  <div id="rl-wrap">
    <div id="rl-table">
      <div id="rl-wheel-col">
        <canvas id="wheelCanvas" width="400" height="400"></canvas>
        <div style="display:flex;gap:6px;align-items:center">
          <div id="rl-history"></div>
        </div>
        <div id="lastResult" class="muted" style="font-size:.85rem;letter-spacing:.06em;text-align:center" data-i18n="casino.rl.lastInit">Last: -</div>
      </div>
      <div id="rl-controls">
        <div class="rl-info-row">
          <span><span data-i18n="casino.rl.balance">Balance:</span> <strong id="rouletteBalance">-</strong></span>
          <span><span data-i18n="casino.rl.betsTotal">Bets Total:</span> <strong id="rl-bets-total">Ƒ0</strong></span>
          <span id="rl-last-net" style="display:none"></span>
        </div>
        <!-- Bet amount + quick chips -->
        <div>
          <div class="rl-label" data-i18n="casino.rl.betAmount">Bet Amount</div>
          <div class="rl-bet-row">
            <input id="betAmount" type="number" min="1" value="10"/>
          </div>
          <div class="rl-chips">
            <button onclick="rlAddToAmount(5)">+5</button>
            <button onclick="rlAddToAmount(10)">+10</button>
            <button onclick="rlAddToAmount(25)">+25</button>
            <button onclick="rlAddToAmount(100)">+100</button>
            <button onclick="rlAddToAmount(500)">+500</button>
            <button onclick="document.getElementById('betAmount').value=1" data-i18n="casino.rl.min">Min</button>
            <button onclick="rlSetMax()" data-i18n="casino.rl.max">Max</button>
          </div>
        </div>
        <!-- Bet type -->
        <div>
          <div class="rl-label" data-i18n="casino.rl.betType">Bet Type</div>
          <div class="rl-bet-type-row">
            <select id="betType">
              <option value="red" data-i18n="casino.rl.optRed">Red (1:1)</option>
              <option value="black" data-i18n="casino.rl.optBlack">Black (1:1)</option>
              <option value="odd" data-i18n="casino.rl.optOdd">Odd (1:1)</option>
              <option value="even" data-i18n="casino.rl.optEven">Even (1:1)</option>
              <option value="low" data-i18n="casino.rl.optLow">Low 1–18 (1:1)</option>
              <option value="high" data-i18n="casino.rl.optHigh">High 19–36 (1:1)</option>
              <option value="dozen1" data-i18n="casino.rl.optDozen1">1st 12 · 1–12 (2:1)</option>
              <option value="dozen2" data-i18n="casino.rl.optDozen2">2nd 12 · 13–24 (2:1)</option>
              <option value="dozen3" data-i18n="casino.rl.optDozen3">3rd 12 · 25–36 (2:1)</option>
              <option value="col1" data-i18n="casino.rl.optCol1">Column 1 (2:1)</option>
              <option value="col2" data-i18n="casino.rl.optCol2">Column 2 (2:1)</option>
              <option value="col3" data-i18n="casino.rl.optCol3">Column 3 (2:1)</option>
              <option value="straight" data-i18n="casino.rl.optStraight">Straight Up (35:1)</option>
            </select>
            <input id="straightNum" type="number" min="0" max="36" value="7" style="max-width:60px;display:none"/>
          </div>
          <!-- Number grid for quick straight pick -->
          <div id="rl-num-grid-wrap" style="display:none">
            <div class="rl-num-grid" id="rl-num-grid"></div>
          </div>
        </div>
        <!-- Actions -->
        <div id="rl-action-row">
          <button id="placeBet" onclick="rlPlaceBet()" data-i18n="casino.rl.addBet">+ Add Bet</button>
          <button id="rl-spin-btn" onclick="rlSpin()" data-i18n="casino.rl.spin">🎰 Spin</button>
          <button id="rl-clear-btn" onclick="rlClearBets()" data-i18n="casino.rl.clear">✕ Clear</button>
        </div>
        <!-- Bet slip -->
        <div>
          <div class="rl-label" data-i18n="casino.rl.activeBets">Active Bets</div>
          <div id="rl-bets-list"><div class="muted" style="font-size:.8rem">No bets yet.</div></div>
        </div>
        <!-- Result banner -->
        <div id="rl-result-banner"></div>
        <!-- Log -->
        <div id="rl-log"></div>
      </div>
    </div>
  </div>
  `;
  if(window.applyI18n) window.applyI18n(pane);

  // ── Balance helpers ──────────────────────────────────────────────
  function fmtLocal(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }
  function getBalance() {
    if (typeof ME === 'object' && ME && typeof ME.cash === 'number') return ME.cash;
    const c = document.getElementById('cash');
    if (c && c.textContent) { const n = Number(c.textContent.replace(/[^\d.-]/g,'')); if (!Number.isNaN(n)) return n; }
    const s = localStorage.getItem('casino_balance_shadow');
    return s ? Number(s) : 0;
  }
  function setBalance(newVal) {
    if (typeof ME === 'object' && ME && typeof ME.cash === 'number') {
      ME.cash = newVal;
      try { window.__PnLLastCash=Number(newVal)||0; window.__MY_CASH=Number(newVal)||0; try{liveUpdatePnL(null,null);}catch(_){} } catch(_e){}
      try { window.PnLBridge&&typeof window.PnLBridge.pushNow==='function'&&window.PnLBridge.pushNow(); } catch(_e){}
      try { (window.bus||window.__bus)&&typeof (window.bus||window.__bus).emit==='function'&&(window.bus||window.__bus).emit('trade',null,0); } catch(_e){}
    }
    const c=document.getElementById('cash'); if(c) c.textContent=fmtLocal(newVal);
    // Legacy {type:'casino',sync} removed — cash is server-authoritative now and
    // arrives via {type:'me'}/{type:'portfolio'} pushes handled in core's ws layer.
    refreshRouletteBalance();
  }
  function adjustBalance(delta){ setBalance(getBalance()+delta); }
  let rlRoundId=null; // server round id for the in-flight spin
  function refreshRouletteBalance(){
    const lbl=document.getElementById('rouletteBalance');
    // Show balance minus the un-staked slip so the displayed number matches what
    // the player has "committed" before the spin actually stakes it server-side.
    const slip=(typeof bets!=='undefined')?bets.reduce((s,b)=>s+b.amount,0):0;
    if(lbl) lbl.textContent=fmtLocal(getBalance()-slip);
  }

  // ── Bet slip ────────────────────────────────────────────────────
  const bets=[];
  let lastResults=[];
  let rlLastServer=null;   // { credited } from the server-settled spin, for finalizeSpin

  function colorOf(n){ if(n===0) return 'green'; return REDS.has(n)?'red':'black'; }

  function betLabel(b){
    const labels={red:T('casino.rl.lblRed','Red'),black:T('casino.rl.lblBlack','Black'),odd:T('casino.rl.lblOdd','Odd'),even:T('casino.rl.lblEven','Even'),low:T('casino.rl.lblLow','Low 1–18'),high:T('casino.rl.lblHigh','High 19–36'),dozen1:T('casino.rl.lblDozen1','1st 12'),dozen2:T('casino.rl.lblDozen2','2nd 12'),dozen3:T('casino.rl.lblDozen3','3rd 12'),col1:T('casino.rl.lblCol1','Column 1'),col2:T('casino.rl.lblCol2','Column 2'),col3:T('casino.rl.lblCol3','Column 3')};
    if(b.type==='straight') return TF('casino.rl.lblStraight','Straight {n}',{n:b.pick});
    return labels[b.type]||b.type;
  }

  function renderBets(){
    const box=document.getElementById('rl-bets-list');
    const totEl=document.getElementById('rl-bets-total');
    if(!box) return;
    const total=bets.reduce((s,b)=>s+b.amount,0);
    if(totEl) totEl.textContent=fmtLocal(total);
    if(!bets.length){ box.innerHTML='<div class="muted" style="font-size:.8rem">'+T('casino.rl.noBets','No bets yet.')+'</div>'; return; }
    box.innerHTML='';
    bets.forEach((b,i)=>{
      const row=document.createElement('div'); row.className='rl-bet-item';
      row.innerHTML=`<span class="rl-bi-label">${betLabel(b)}</span><span class="rl-bi-amt">${fmtLocal(b.amount)}<span class="rl-bi-del" onclick="rlRemoveBet(${i})">✕</span></span>`;
      box.appendChild(row);
    });
  }

  window.rlRemoveBet=function(i){
    if(spinning) return;
    adjustBalance(bets[i].amount);
    bets.splice(i,1);
    renderBets(); refreshRouletteBalance();
  };
  window.rlClearBets=function(){
    if(spinning) return;
    const total=bets.reduce((s,b)=>s+b.amount,0);
    adjustBalance(total); bets.length=0;
    renderBets(); refreshRouletteBalance();
    const banner=document.getElementById('rl-result-banner'); if(banner) banner.style.display='none';
  };
  window.rlAddToAmount=function(n){
    const inp=document.getElementById('betAmount');
    inp.value=Math.max(1,(Number(inp.value)||0)+n);
  };
  window.rlSetMax=function(){
    const inp=document.getElementById('betAmount');
    inp.value=Math.max(1,Math.floor(getBalance()));
  };

  // ── Number grid ──────────────────────────────────────────────────
  (function buildGrid(){
    const grid=document.getElementById('rl-num-grid'); if(!grid) return;
    grid.innerHTML='';
    const zero=document.createElement('div'); zero.className='rl-num-cell green-cell';
    zero.textContent='0'; zero.dataset.n='0';
    zero.onclick=()=>{ document.getElementById('straightNum').value=0; highlightGrid(0); };
    grid.appendChild(zero);
    for(let n=1;n<=36;n++){
      const col=colorOf(n);
      const cell=document.createElement('div');
      cell.className=`rl-num-cell ${col==='red'?'red-cell':'black-cell'}`;
      cell.textContent=String(n); cell.dataset.n=String(n);
      cell.onclick=()=>{ document.getElementById('straightNum').value=n; highlightGrid(n); };
      grid.appendChild(cell);
    }
    highlightGrid(7);
  })();

  function highlightGrid(n){
    document.querySelectorAll('.rl-num-cell').forEach(c=>c.classList.toggle('selected-num',Number(c.dataset.n)===n));
  }

  document.getElementById('betType').addEventListener('change',function(){
    const isStraight=this.value==='straight';
    document.getElementById('straightNum').style.display=isStraight?'':'none';
    document.getElementById('rl-num-grid-wrap').style.display=isStraight?'':'none';
  });
  document.getElementById('straightNum').addEventListener('input',function(){
    highlightGrid(Math.max(0,Math.min(36,Number(this.value)||0)));
  });

  // ── Wheel ─────────────────────────────────────────────────────────
  const cv = document.getElementById('wheelCanvas');
  const ctx = cv.getContext('2d');
  const R = cv.width / 2;        // 200
  const cx = R, cy = R;          // center = (200,200)
  const SEG = (Math.PI * 2) / ORDER.length;  // radians per segment

  // State
  let wAngle  = -Math.PI / 2;  // wheel angle: segment i occupies [wAngle+i*SEG, wAngle+(i+1)*SEG]
  let bAngle  = -Math.PI / 2;  // ball world angle
  let spinning = false;
  let animId   = null;
  let spinResult = 0;  // ORDER index of result
  // Spin lerp params
  let t0=0, dur=0, wA0=0, wArc=0, bA0=0, bArc=0;

  // The winning segment center in world space must equal -PI/2 (pointer at top)
  // => wAngle + (idx+0.5)*SEG = -PI/2
  // => wAngle = -PI/2 - (idx+0.5)*SEG
  function wheelAngleFor(idx){ return -Math.PI/2 - (idx + 0.5)*SEG; }

  function ease(t){ return 1 - Math.pow(1-t, 4); }

  // Draw wheel using ABSOLUTE WORLD ANGLES for all segments.
  // No ctx.rotate(wAngle) — each segment drawn at wAngle+i*SEG directly.
  // This eliminates any possible ctx.rotate precision or transform accumulation issues.
  function draw(){
    ctx.clearRect(0,0,cv.width,cv.height);

    // ── Segment fills ────────────────────────────────────────────────
    for(let i=0;i<ORDER.length;i++){
      const n = ORDER[i];
      const a0 = wAngle + i*SEG;
      const a1 = wAngle + (i+1)*SEG;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,R-7,a0,a1);
      ctx.closePath();
      ctx.fillStyle = (n===0)?'#083808':REDS.has(n)?'#7a1212':'#0e0e0e';
      ctx.fill();
    }

    // ── Outer rim ────────────────────────────────────────────────────
    ctx.beginPath(); ctx.arc(cx,cy,R-2,0,Math.PI*2);
    ctx.strokeStyle='#9a7800'; ctx.lineWidth=5; ctx.stroke();

    // ── Fret dividers ────────────────────────────────────────────────
    ctx.strokeStyle='rgba(200,160,0,.35)'; ctx.lineWidth=1.5;
    for(let i=0;i<ORDER.length;i++){
      const a = wAngle + i*SEG;
      const cos=Math.cos(a), sin=Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx+cos*(R-46), cy+sin*(R-46));
      ctx.lineTo(cx+cos*(R-7),  cy+sin*(R-7));
      ctx.stroke();
    }

    // Inner ring
    ctx.beginPath(); ctx.arc(cx,cy,R-46,0,Math.PI*2);
    ctx.strokeStyle='rgba(200,160,0,.45)'; ctx.lineWidth=2; ctx.stroke();

    // ── Numbers ──────────────────────────────────────────────────────
    const NUM_R = R - 26;
    ctx.font='bold 11px ui-monospace,monospace';
    for(let i=0;i<ORDER.length;i++){
      const n = ORDER[i];
      const mid = wAngle + (i+0.5)*SEG;   // world angle of segment center
      const nx = cx + Math.cos(mid)*NUM_R;
      const ny = cy + Math.sin(mid)*NUM_R;
      const col = (n===0)?'green':REDS.has(n)?'red':'black';

      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(mid + Math.PI/2);  // orient text radially outward
      const label = String(n);
      const tw = label.length>=2 ? 16 : 10;
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.fillRect(-tw/2-1,-7,tw+2,14);
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.shadowBlur=4;
      ctx.fillStyle = col==='red'?'#ff8888':col==='black'?'#d8d8d8':'#80ff80';
      ctx.shadowColor= col==='red'?'rgba(255,100,100,.6)':col==='black'?'rgba(200,200,200,.4)':'rgba(80,255,80,.7)';
      ctx.fillText(label,0,0);
      ctx.shadowBlur=0;
      ctx.restore();
    }

    // ── Hub ──────────────────────────────────────────────────────────
    const hg=ctx.createRadialGradient(cx,cy,2,cx,cy,24);
    hg.addColorStop(0,'#e0b820'); hg.addColorStop(1,'#5a3a00');
    ctx.beginPath(); ctx.arc(cx,cy,24,0,Math.PI*2);
    ctx.fillStyle=hg; ctx.fill();
    ctx.strokeStyle='#9a7a00'; ctx.lineWidth=2; ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.3)'; ctx.lineWidth=1;
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*3,cy+Math.sin(a)*3);
      ctx.lineTo(cx+Math.cos(a)*22,cy+Math.sin(a)*22);
      ctx.stroke();
    }

    // ── Pointer (static, always at top) ──────────────────────────────
    ctx.save();
    ctx.shadowColor='#9dff5a'; ctx.shadowBlur=10;
    ctx.beginPath();
    ctx.moveTo(cx, cy-(R+1));
    ctx.lineTo(cx-10, cy-(R-16));
    ctx.lineTo(cx+10, cy-(R-16));
    ctx.closePath();
    ctx.fillStyle='#9dff5a'; ctx.fill();
    ctx.shadowBlur=0;
    ctx.restore();

    // ── Ball ─────────────────────────────────────────────────────────
    const ballR = R-20;
    const bx = cx + Math.cos(bAngle)*ballR;
    const by = cy + Math.sin(bAngle)*ballR;
    const bg=ctx.createRadialGradient(bx-1,by-2,1,bx,by,5);
    bg.addColorStop(0,'#fff'); bg.addColorStop(0.6,'#ddd'); bg.addColorStop(1,'#999');
    ctx.beginPath(); ctx.arc(bx,by,5,0,Math.PI*2);
    ctx.fillStyle=bg;
    ctx.save();
    ctx.shadowColor='rgba(255,255,255,.8)'; ctx.shadowBlur=8;
    ctx.fill();
    ctx.restore();
  }

  function animate(){
    const t = Math.min(1,(performance.now()-t0)/dur);
    const e = ease(t);
    wAngle = wA0 + wArc*e;
    bAngle = bA0 + bArc*e;
    draw();
    if(t<1){
      animId=requestAnimationFrame(animate);
    } else {
      spinning=false;
      // Snap to exact final positions
      wAngle = wheelAngleFor(spinResult);
      bAngle = -Math.PI/2;
      draw();
      finalizeSpin(ORDER[spinResult]);
    }
  }

  function startSpin(idx){
    const wFinal = wheelAngleFor(idx);
    const turns  = 5+Math.floor(Math.random()*3);
    // Ball: start offset half-segment from pointer so arc traverses the wheel visibly
    const bFinal  = -Math.PI/2;
    const bStart  = bFinal + SEG*0.5;  // half-segment CW of pointer
    const bTurns  = 6+Math.floor(Math.random()*3);
    const bArcVal = (bFinal-bStart)+bTurns*Math.PI*2;  // net CCW arc back to bFinal

    spinResult = idx;
    t0  = performance.now();
    dur = 3000+Math.random()*1500;
    wA0  = wAngle;
    wArc = (wFinal-wAngle)-turns*Math.PI*2;
    bA0  = bStart;
    bArc = bArcVal;
    bAngle = bStart;
    spinning = true;
    if(animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(animate);
  }

  // ── Payout ─────────────────────────────────────────────────────────
  function payoutFor(result){
    let payout=0;
    for(const b of bets){
      const amt=b.amount;
      if(b.type==='straight'){ if(result===b.pick) payout+=amt*36; }
      else if(b.type==='red'){ if(colorOf(result)==='red') payout+=amt*2; }
      else if(b.type==='black'){ if(colorOf(result)==='black') payout+=amt*2; }
      else if(b.type==='odd'){ if(result!==0&&result%2===1) payout+=amt*2; }
      else if(b.type==='even'){ if(result!==0&&result%2===0) payout+=amt*2; }
      else if(b.type==='low'){ if(result>=1&&result<=18) payout+=amt*2; }
      else if(b.type==='high'){ if(result>=19&&result<=36) payout+=amt*2; }
      else if(b.type==='dozen1'){ if(result>=1&&result<=12) payout+=amt*3; }
      else if(b.type==='dozen2'){ if(result>=13&&result<=24) payout+=amt*3; }
      else if(b.type==='dozen3'){ if(result>=25&&result<=36) payout+=amt*3; }
      else if(b.type==='col1'){ if(result!==0&&result%3===1) payout+=amt*3; }
      else if(b.type==='col2'){ if(result!==0&&result%3===2) payout+=amt*3; }
      else if(b.type==='col3'){ if(result!==0&&result%3===0) payout+=amt*3; }
    }
    return payout;
  }

  function rlLog(msg){
    const box=document.getElementById('rl-log'); if(!box) return;
    const d=document.createElement('div'); d.textContent=msg;
    box.insertBefore(d,box.firstChild);
    while(box.children.length>30) box.removeChild(box.lastChild);
  }

  function updateHistory(n){
    lastResults.unshift(n);
    if(lastResults.length>12) lastResults.pop();
    const hist=document.getElementById('rl-history'); if(!hist) return;
    hist.innerHTML='';
    lastResults.forEach(num=>{
      const dot=document.createElement('div');
      dot.className='rl-hist-dot';
      const col=colorOf(num);
      dot.style.background=col==='red'?'#8b1a1a':col==='black'?'#222':'#0a5a0a';
      dot.style.border=`1px solid ${col==='red'?'#cc3030':col==='black'?'#444':'#2a8a2a'}`;
      dot.textContent=String(num);
      hist.appendChild(dot);
    });
  }

  function finalizeSpin(result){
    const col=colorOf(result);
    const totalBet=bets.reduce((s,b)=>s+b.amount,0);
    // Payout was computed and credited server-side; display the server's number.
    // (payoutFor is kept above only as a reference copy of the table.)
    const credited=(rlLastServer && typeof rlLastServer.credited==='number') ? rlLastServer.credited : 0;
    rlLastServer=null;
    const net=credited-totalBet;
    const lastEl=document.getElementById('lastResult');
    if(lastEl) lastEl.textContent=TF('casino.rl.lastResult','Last: {n} ({col})',{n:result,col:rlColorName(col)});
    const banner=document.getElementById('rl-result-banner');
    if(banner){
      banner.style.display='block';
      if(credited>0){
        banner.className='rl-result-banner win';
        banner.textContent=TF('casino.rl.bannerWin','✓ {n} {col}, Won {net} (paid {paid})',{n:result,col:rlColorName(col).toUpperCase(),net:fmtLocal(net),paid:fmtLocal(credited)});
      } else {
        banner.className='rl-result-banner lose';
        banner.textContent=TF('casino.rl.bannerLose','✗ {n} {col}, No win',{n:result,col:rlColorName(col).toUpperCase()});
      }
      setTimeout(()=>{ if(banner) banner.style.display='none'; },4000);
    }
    rlLog(TF('casino.rl.logLine','{n} ({col}), {net} | bet {bet}',{n:result,col:rlColorName(col),net:(credited>0?('+'+fmtLocal(net)):T('casino.rl.noWin','No win')),bet:fmtLocal(totalBet)}));
    updateHistory(result);
    bets.length=0;
    renderBets(); refreshRouletteBalance();
  }

  // ── Place Bet ───────────────────────────────────────────────────────
  // Bets accumulate in a local slip only — no cash moves until Spin, when the
  // whole slip is staked server-side as one round. The displayed balance is
  // reduced optimistically so the slip feels live; the server reconciles on spin.
  window.rlPlaceBet=function(){
    if(spinning) return;
    const betAmount=document.getElementById('betAmount');
    const betType=document.getElementById('betType');
    const straightNum=document.getElementById('straightNum');
    const amt=Math.max(1,Number(betAmount.value||0));
    const slipTotal=bets.reduce((s,b)=>s+b.amount,0);
    if(amt+slipTotal>getBalance()){ rlLog(T('casino.rl.insufficient','Insufficient funds.')); return; }
    const type=betType.value;
    let pick=null;
    if(type==='straight'){
      const n=Math.max(0,Math.min(36,Number(straightNum.value||0)));
      pick=n;
    } else { pick=type; }
    bets.push({type,pick,amount:amt});
    renderBets(); refreshRouletteBalance();
    rlLog(TF('casino.rl.betPlaced','Bet placed: {label}, {amt}',{label:betLabel({type,pick}),amt:fmtLocal(amt)}));
  };

  // ── Spin ────────────────────────────────────────────────────────────
  window.rlSpin=async function(){
    if(spinning) return;
    if(!bets.length){ rlLog(T('casino.rl.placeFirst','Place a bet first.')); return; }
    // Server-authoritative: send only the bet slip. The server rolls the wheel,
    // prices the win, and credits atomically. The client animates to the number
    // the server rolled — it no longer picks the outcome or reports the payout.
    const slip=bets.map(b=>({type:b.type, pick:b.pick, amount:b.amount}));
    const res=await CasinoNet.play('roulette', { slip });
    if(!res.ok){
      rlLog(res.stale ? T('casino.common.stale','Casino updated, refresh (Ctrl+Shift+R).') : TF('casino.common.betRejected','Bet rejected: {err}',{err:(res.error||'unknown')}));
      return;
    }
    rlLastServer={ credited: (typeof res.credited==='number') ? res.credited : 0 };
    const lastEl=document.getElementById('lastResult');
    if(lastEl) lastEl.textContent=T('casino.rl.spinning','Spinning…');
    const banner=document.getElementById('rl-result-banner'); if(banner) banner.style.display='none';
    const result=(res.view && typeof res.view.result==='number') ? res.view.result : 0;
    const idx=Math.max(0, ORDER.indexOf(result));
    startSpin(idx);
  };

  const _origRP=(typeof renderPositions==='function')?renderPositions:null;
  if(_origRP){ window.renderPositions=function(p){ _origRP(p); refreshRouletteBalance(); }; }

  draw();
  refreshRouletteBalance();
  renderBets();
})();
  // Time control selector behavior handled in chess IIFE below


// ═══════════════════════════════════════════════════════════════════
// DRONE MINING integration (iframe embed + postMessage bridge)
// ═══════════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // --- Bank helpers -------------------------------------------------
  function getCash() {
    try { if (typeof ME === 'object' && ME && typeof ME.cash === 'number') return ME.cash; } catch(e){}
    return 0;
  }
  function setCash(v) {
    try {
      if (typeof ME === 'object' && ME && typeof ME.cash === 'number') {
        ME.cash = v;
        try { window.__PnLLastCash = Number(v) || 0; window.__MY_CASH = Number(v) || 0; } catch(_){}
        try { window.PnLBridge && typeof window.PnLBridge.pushNow === 'function' && window.PnLBridge.pushNow(); } catch(_){}
      }
    } catch(e){}
    const c = document.getElementById('cash');
    if (c) c.textContent = 'Ƒ' + (Math.round(v * 100) / 100).toLocaleString();
    // Mining banking no longer pushes a client-authoritative TOTAL here. The server
    // owns the balance and receives bounded DELTAS (see the bank_delta bridge below
    // and mining_bank_delta in server.js); its me/portfolio push reconciles this
    // optimistic local value.
  }

  // --- Brief-screen bank refresh -----------------------------------
  function refreshBriefBank() {
    const el = document.getElementById('mining-brief-bank');
    if (el) el.textContent = 'Ƒ' + Math.floor(getCash()).toLocaleString();
  }
  window.__miningBriefRefresh = refreshBriefBank;

  // Band names for leaderboard display
  const _MINING_BAND_NAMES = ['NEAR', 'MID', 'DEEP', 'VOID'];
  const _MINING_BAND_COLORS = ['#86ff6a', '#72e09c', '#ff9a4a', '#ff4a4a'];

  function _renderBriefLeaderboard(rows) {
    const body = document.getElementById('miningLeaderboardBody');
    if (!body) return;
    if (!Array.isArray(rows) || rows.length === 0) {
      body.innerHTML = '<div style="color:#6a5a38; text-align:center; padding:14px 0">No expeditions recorded yet. Be the first.</div>';
      return;
    }
    const myName = (typeof ME === 'object' && ME && ME.name) ? ME.name : null;
    let html = `<table style="width:100%; border-collapse:collapse; font-size:13px; letter-spacing:.04em">
      <thead>
        <tr style="color:#4f8f5f; text-transform:uppercase; font-size:11px; letter-spacing:.12em">
          <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #3a2a10">#</th>
          <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #3a2a10">Pilot</th>
          <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #3a2a10">Best Run</th>
          <th style="text-align:center; padding:6px 8px; border-bottom:1px solid #3a2a10">Zone</th>
          <th style="text-align:right; padding:6px 8px; border-bottom:1px solid #3a2a10">Runs</th>
        </tr>
      </thead>
      <tbody>`;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const isMe = myName && r.name === myName;
      const bandIdx = Math.max(0, Math.min(3, r.best_run_band|0));
      const bandName = _MINING_BAND_NAMES[bandIdx];
      const bandColor = _MINING_BAND_COLORS[bandIdx];
      const factionColor = r.faction === 'syndicate' ? '#e74c3c'
                        : r.faction === 'void'      ? '#9b59b6'
                        : r.faction === 'coalition' ? '#4ecdc4'
                        : '#4f8f5f';
      const rowBg = isMe ? 'background:rgba(230,194,122,.07);' : '';
      const nameStyle = isMe ? 'color:#72e09c; font-weight:bold' : `color:${factionColor}`;
      html += `<tr style="${rowBg}">
        <td style="padding:6px 8px; color:#4f8f5f; font-size:12px">${i+1}</td>
        <td style="padding:6px 8px"><span style="${nameStyle}">${_escHtml(r.name)}</span></td>
        <td style="padding:6px 8px; text-align:right; color:#86ff6a; font-weight:bold">+Ƒ${Math.floor(r.best_run_profit).toLocaleString()}</td>
        <td style="padding:6px 8px; text-align:center; color:${bandColor}; font-size:11px; letter-spacing:.15em">${bandName}</td>
        <td style="padding:6px 8px; text-align:right; color:#4f8f5f; font-size:12px">${r.total_runs}</td>
      </tr>`;
    }
    html += '</tbody></table>';
    body.innerHTML = html;
  }
  function _escHtml(s) {
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // Update brief bank on any FM cash change; push faction too on 'me' events
  document.addEventListener('fm_ws_msg', (e) => {
    if (e.detail && (e.detail.type === 'portfolio' || e.detail.type === 'income' || e.detail.type === 'me')) {
      refreshBriefBank();
      pushBankToIframe();
      if (e.detail.type === 'me') pushFactionToIframe();
    }
  });

  // --- Iframe lifecycle --------------------------------------------
  let miningIframe = null;
  const host = () => document.getElementById('miningFullscreenHost');

  function launchMining() {
    if (miningIframe) return; // already open
    const h = host();
    if (!h) return;
    h.innerHTML = ''; // clear any previous

    miningIframe = document.createElement('iframe');
    // Cache-buster — forces browser to re-fetch the game HTML on each open.
    // The inner sprites still use normal cache, but the game HTML itself (which
    // changes often) stays fresh.
    miningIframe.src = 'assets/drone-mining/index.html?v=' + Date.now();
    miningIframe.style.cssText = 'border:0; width:100%; height:100%; display:block;';
    miningIframe.setAttribute('allow', 'autoplay');
    miningIframe.setAttribute('title', 'Drone Mining');
    h.appendChild(miningIframe);
    h.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeMining() {
    const h = host();
    if (h) {
      h.style.display = 'none';
      h.innerHTML = '';
    }
    miningIframe = null;
    document.body.style.overflow = '';
    refreshBriefBank();
  }

  function pushBankToIframe() {
    if (!miningIframe || !miningIframe.contentWindow) return;
    try {
      miningIframe.contentWindow.postMessage(
        { source: 'fleshmarket', type: 'bank_set', amount: getCash() },
        '*'
      );
    } catch(_){}
  }

  function pushFactionToIframe() {
    if (!miningIframe || !miningIframe.contentWindow) return;
    // FM faction IDs match the mining game's FACTION_KEYS: coalition / syndicate / void.
    // If the player has no faction set in galaxy menu, send 'none' — the game
    // will render the neutral Main Ship and treat the player as hostile to all factions.
    let fac = 'none';
    try {
      if (typeof ME === 'object' && ME && typeof ME.faction === 'string' && ME.faction &&
          (ME.faction === 'coalition' || ME.faction === 'syndicate' || ME.faction === 'void')) {
        fac = ME.faction;
      }
    } catch(_){}
    try {
      miningIframe.contentWindow.postMessage(
        { source: 'fleshmarket', type: 'faction_set', faction: fac },
        '*'
      );
    } catch(_){}
  }

  // Send the upgrades catalog + owned state to the iframe.
  // Called on ready and whenever server confirms a purchase.
  function pushUpgradesToIframe(state) {
    if (!miningIframe || !miningIframe.contentWindow || !state) return;
    try {
      miningIframe.contentWindow.postMessage(
        { source: 'fleshmarket', type: 'upgrades_state', ...state },
        '*'
      );
    } catch(_){}
  }

  // Send the ships catalog + owned + equipped state to the iframe.
  function pushShipsToIframe(state) {
    if (!miningIframe || !miningIframe.contentWindow || !state) return;
    try {
      miningIframe.contentWindow.postMessage(
        { source: 'fleshmarket', type: 'ships_state', ...state },
        '*'
      );
    } catch(_){}
  }

  // Send a leaderboard payload to the iframe.
  function pushLeaderboardToIframe(rows) {
    if (!miningIframe || !miningIframe.contentWindow) return;
    try {
      miningIframe.contentWindow.postMessage(
        { source: 'fleshmarket', type: 'leaderboard_data', rows: rows || [] },
        '*'
      );
    } catch(_){}
  }

  // Forward iframe-originated requests into the FM WebSocket.
  function _wsSendMining(payload) {
    try {
      if (window.ws && window.ws.readyState === 1) {
        window.ws.send(JSON.stringify(payload));
      }
    } catch(_){}
  }

  // Listen for server responses that are mining-store related and
  // forward them to the iframe + brief-screen leaderboard.
  document.addEventListener('fm_ws_msg', (e) => {
    if (!e || !e.detail) return;
    const t = e.detail.type;
    if (t === 'mining_upgrades_state') {
      pushUpgradesToIframe(e.detail.data);
    } else if (t === 'mining_upgrade_purchased') {
      // Refresh authoritative state after purchase
      _wsSendMining({ type: 'mining_upgrades_list' });
    } else if (t === 'mining_ships_state') {
      pushShipsToIframe(e.detail.data);
    } else if (t === 'mining_ship_purchased' || t === 'mining_ship_equipped') {
      // Refresh authoritative ship state after any change
      _wsSendMining({ type: 'mining_ships_list' });
    } else if (t === 'mining_leaderboard_data') {
      pushLeaderboardToIframe(e.detail.data && e.detail.data.rows);
      _renderBriefLeaderboard(e.detail.data && e.detail.data.rows);
    } else if (t === 'mining_run_recorded') {
      // Stats updated; if the store is open in iframe, refresh catalog state
      _wsSendMining({ type: 'mining_upgrades_list' });
      // Refresh leaderboard after a run completes
      _wsSendMining({ type: 'mining_leaderboard' });
    }
  });

  // --- postMessage bridge ------------------------------------------
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (!msg || msg.source !== 'drone-mining') return;

    if (msg.type === 'ready') {
      // Game just loaded — send current bank, faction, upgrades, and ships
      pushBankToIframe();
      pushFactionToIframe();
      _wsSendMining({ type: 'mining_upgrades_list' });
      _wsSendMining({ type: 'mining_ships_list' });
      return;
    }

    if (msg.type === 'bank_delta') {
      // Game reports a bank change: run-start loadout deduction (negative) or
      // run-end banked credit (positive). setCash updates the local UI optimistically;
      // the DELTA and its reason go to the server, which owns the balance and bounds
      // the run's credit, then reconciles via me/portfolio.
      const delta = Number(msg.delta) || 0;
      const reason = String(msg.reason || '');
      if (delta === 0) return;
      setCash(Math.max(0, getCash() + delta));
      try {
        if (window.ws && window.ws.readyState === 1) {
          window.ws.send(JSON.stringify({ type: 'mining_bank_delta', delta, reason }));
        }
      } catch(_){}
      // Echo the local bank back to the game so it stays aligned
      pushBankToIframe();
      return;
    }

    if (msg.type === 'exit_request') {
      closeMining();
      return;
    }

    if (msg.type === 'closing') {
      closeMining();
      return;
    }

    // ── Mining Store requests from the iframe ────────────────────────
    if (msg.type === 'request_upgrades') {
      _wsSendMining({ type: 'mining_upgrades_list' });
      return;
    }
    if (msg.type === 'buy_upgrade' && typeof msg.upgradeId === 'string') {
      _wsSendMining({ type: 'mining_upgrade_buy', upgradeId: msg.upgradeId });
      return;
    }
    if (msg.type === 'request_ships') {
      _wsSendMining({ type: 'mining_ships_list' });
      return;
    }
    if (msg.type === 'buy_ship' && typeof msg.shipId === 'string') {
      _wsSendMining({ type: 'mining_ship_buy', shipId: msg.shipId });
      return;
    }
    if (msg.type === 'equip_ship' && typeof msg.shipId === 'string') {
      _wsSendMining({ type: 'mining_ship_equip', shipId: msg.shipId });
      return;
    }
    if (msg.type === 'run_complete') {
      _wsSendMining({
        type: 'mining_run_complete',
        profit: Number(msg.profit) || 0,
        banked: Number(msg.banked) || 0,
        deepestBand: Number(msg.deepestBand) || 0,
      });
      return;
    }
    if (msg.type === 'request_leaderboard') {
      _wsSendMining({ type: 'mining_leaderboard' });
      return;
    }
  });

  // --- Launch button ------------------------------------------------
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.id === 'miningLaunchBtn') {
      // Affordability check before launch
      if (getCash() < 1000) {
        const btn = document.getElementById('miningLaunchBtn');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'NEED Ƒ1,000 MIN';
          btn.style.borderColor = '#ff6b6b';
          btn.style.color = '#ff6b6b';
          setTimeout(() => {
            btn.textContent = orig;
            btn.style.borderColor = '#8a6a30';
            btn.style.color = '#72e09c';
          }, 1400);
        }
        return;
      }
      launchMining();
    }
  });

  // --- ESC key exit while fullscreen --------------------------------
  window.addEventListener('keydown', (e) => {
    if (!miningIframe) return;
    // ESC only closes if we're not in active gameplay — the iframe handles
    // its own ESC for aborting a run. To avoid stealing ESC from the game,
    // we don't listen here. Exit is via the in-game "BACK TO FLESHMARKET"
    // button which posts exit_request.
  });

  // --- Initial brief render when tab becomes active -----------------
  // The tab switcher calls __miningBriefRefresh on open, so this is just a
  // safety net for first-paint.
  if (document.getElementById('miningTab')) {
    refreshBriefBank();
  }
})();
