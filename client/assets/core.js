
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

function fmt(n){ return 'Ƒ' + (Math.round(n*100)/100).toLocaleString(); }


// ── Company Lore ──────────────────────────────────────────────────────────────
// Keyed by company name (trailing numbers already stripped server-side).
// Descriptions are shown in the ticker list when a company is selected.
const COMPANY_LORE = {
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
  TICKERS.filter(t => !q || t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    .forEach(t => {
      const row = document.createElement('div');
      const isActive = t.symbol === CURRENT;
      row.className = 'ticker' + (isActive ? ' active' : '');
      const pct = t.pct != null ? t.pct : 0;
      const pctColor = pct >= 0 ? '#86ff6a' : '#ff6b6b';
      const pctSign = pct >= 0 ? '+' : '';
      const priceLabel = isActive
        ? `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
            <span class="px" style="font-size:.95rem;font-weight:700;color:#fff">${fmt(t.price)}</span>
            <span style="font-size:.68rem;color:${pctColor};opacity:.9">${pctSign}${pct.toFixed(2)}%</span>
           </div>`
        : `<div class="px">${fmt(t.price)}</div>`;
      const loreName = t.name.replace(/\d+$/, '').trim();
      const loreText = COMPANY_LORE[loreName] || '';
      row.innerHTML = `<div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:4px">
          <span class="sym">${t.symbol}</span><span class="muted"> — ${loreName}</span>
        </div>
        ${isActive && loreText ? `<div style="font-size:.72rem;color:#9ab;line-height:1.55;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.07);padding-bottom:2px;opacity:.85">${loreText}</div>` : ''}
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
        sendWS({type:'chart', symbol:t.symbol});
        // Re-render to update active highlight and price badge
        renderTickers();
      };
      box.appendChild(row);
    });
}

function renderNews(item) {
  const box = el('#news');
  if (!box) { console.warn('renderNews: #news not mounted'); return; }
  const div = document.createElement('div');
  const tone = item.tone === 'good' ? 'green' : (item.tone === 'bad' ? 'red' : '');
  div.innerHTML = `<div class="${tone}">${new Date(item.t).toLocaleTimeString()} — ${item.text}</div>`;
  box.prepend(div);
  while (box.children.length > 100) box.removeChild(box.lastChild);
}

const _TIER_BADGES = {1:'★',2:'⚖',3:'♛'};
const _TIER_COLORS = {1:'#c8a040',2:'#2ecc71',3:'#ffd700'};
const _DEV_BADGE   = '⚙';
const _DEV_COLOR   = '#4da6ff';
const _OWNER_BADGE = '★';
const _OWNER_COLOR = '#ff6a00';

// ── Leaderboard: stable in-place update (no flicker) ─────────────────────────
// Rows are keyed by player id; only text/color values are updated in place.
// Layout/order only shifts when rank actually changes.
const _lbRows = new Map(); // id → { row, els }
let _lbLastData = [];

function renderBoard(data) {
  const box = el('#board');
  if (!box) return;

  // First call or player list changed — do a full rebuild
  const incomingIds = data.map(p => p.id).join(',');
  const existingIds = _lbLastData.map(p => p.id).join(',');
  if (incomingIds !== existingIds) {
    box.innerHTML = '';
    _lbRows.clear();
    data.forEach((p, i) => {
      const row = document.createElement('div');
      row.dataset.pid = p.id;
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;border:1px solid #1a1208;border-radius:6px;background:#050403;min-width:0';
      // Create fixed child spans by role
      const rankEl  = document.createElement('span'); rankEl.style.cssText = 'opacity:.5;min-width:24px;text-align:right';
      const badgeEl = document.createElement('span');
      const nameEl  = document.createElement('b'); nameEl.style.flex = '1';
      const netEl   = document.createElement('span'); netEl.style.color = '#ffb547';
      const levelEl = document.createElement('span'); levelEl.className = 'muted'; levelEl.style.fontSize = '.72rem';
      row.appendChild(rankEl); row.appendChild(badgeEl); row.appendChild(nameEl);
      row.appendChild(netEl);  row.appendChild(levelEl);
      box.appendChild(row);
      _lbRows.set(p.id, { row, rankEl, badgeEl, nameEl, netEl, levelEl });
    });
  }

  // In-place value update — no DOM create/destroy
  data.forEach((p, i) => {
    const els = _lbRows.get(p.id);
    if (!els) return;
    const isOwner = !!(p.is_prime);
    const isDev   = !isOwner && !!(p.is_dev || p.is_admin);
    const tier    = p.patreon_tier || 0;
    const color   = isOwner ? _OWNER_COLOR : (isDev ? _DEV_COLOR : (_TIER_COLORS[tier] || '#d4b87a'));
    const rank    = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const badge   = isOwner ? _OWNER_BADGE : (isDev ? _DEV_BADGE : (_TIER_BADGES[tier] || ''));
    els.rankEl.textContent  = rank;
    els.badgeEl.textContent = badge;
    els.badgeEl.style.color = color;
    els.nameEl.textContent  = p.name;
    els.nameEl.style.color  = color;
    els.netEl.textContent   = fmt(p.net);
    els.levelEl.textContent = ` Lv.${p.level}`;
  });

  _lbLastData = data;
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
      xpLbl.textContent = title ? `Lv.${lv} · ${title}  ${rem.toLocaleString()} / ${needed.toLocaleString()} XP`
                                : `Lv.${lv}  ${rem.toLocaleString()} / ${needed.toLocaleString()} XP`;
    }
  } catch(_) {}
  const box = el('#positions');
  box.innerHTML = '';
  p.positions.forEach(po => {
    const row = document.createElement('div');
    row.innerHTML = `${po.sym} — ${po.qty} @ ${fmt(po.px)} = ${fmt(po.val)}`;
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

// Palette for up to 12 positions (hue steps, desaturated game palette)
const PNL_COLORS = [
  '#e6a832','#5b9bd5','#8fce6a','#c97fd4','#e06b5a','#4ecdc4',
  '#f0c96a','#7eb8e6','#a8d86e','#d48fd4','#e08a6a','#6cd4c4'
];

let EQUITY = []; // kept for legacy compat — nothing writes to it now

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

  const cx = S/2, cy = S/2, ro = S/2 - 10, ri = ro * 0.58;

  // Build slices: positions + cash
  const slices = posArr.map((p, i) => ({
    label: p.sym, value: Math.max(0, p.value),
    color: PNL_COLORS[i % PNL_COLORS.length]
  }));
  if (cashNow > 0) slices.push({ label: 'CASH', value: cashNow, color: 'rgba(212,184,122,0.7)' });

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
    if (sweep <= 0) return;
    ctx.beginPath();
    ctx.moveTo(cx + ri*Math.cos(ang+GAP/2), cy + ri*Math.sin(ang+GAP/2));
    ctx.arc(cx, cy, ro, ang+GAP/2, ang+sweep);
    ctx.arc(cx, cy, ri, ang+sweep, ang+GAP/2, true);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    // label if slice > 8%
    if (s.value / total > 0.08) {
      const midA = ang + sweep/2 + GAP/2;
      const lr = (ro+ri)/2;
      const lx = cx + lr*Math.cos(midA), ly = cy + lr*Math.sin(midA);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.label, lx, ly);
    }
    ang += sweep + GAP;
  });

  // Centre: net worth
  ctx.fillStyle = '#0a0804';
  ctx.beginPath(); ctx.arc(cx,cy,ri-2,0,Math.PI*2); ctx.fill();
  const fmtC = v => v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'k':v.toFixed(0);
  ctx.fillStyle = '#d4b87a'; ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Ƒ'+fmtC(netWorth), cx, cy-7);
  ctx.fillStyle = 'rgba(212,184,122,0.4)'; ctx.font = '8px monospace';
  ctx.fillText('NET WORTH', cx, cy+7);
}

// ── Bars: per-position % gain/loss (horizontal) ──────────────────────────────
function _drawBars(posArr) {
  const canvas = document.getElementById('pnl-bars');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth  || 400;
  const H = canvas.clientHeight || 180;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);

  if (!posArr.length) {
    ctx.fillStyle = 'rgba(212,184,122,0.2)'; ctx.font = '11px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('No open positions', W/2, H/2);
    return;
  }

  const PAD_L = 52, PAD_R = 58, PAD_T = 12, PAD_B = 10;
  const plotW = W - PAD_L - PAD_R;
  const n = posArr.length;
  const rowH = Math.min(28, Math.floor((H - PAD_T - PAD_B) / n));
  const barH = Math.max(4, rowH - 6);

  // Find max abs % for scaling
  let maxAbs = 0.001;
  for (const p of posArr) { if (Math.abs(p.gainPct) > maxAbs) maxAbs = Math.abs(p.gainPct); }
  // Always show at least ±5% range so a flat position isn't a full-width bar
  maxAbs = Math.max(maxAbs, 5);

  // Zero line
  const zeroX = PAD_L + plotW/2;
  ctx.strokeStyle = 'rgba(212,184,122,0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(zeroX, PAD_T-4); ctx.lineTo(zeroX, H-PAD_B+4); ctx.stroke();
  ctx.setLineDash([]);

  // Axis labels
  ctx.fillStyle = 'rgba(212,184,122,0.28)'; ctx.font = '8px monospace'; ctx.textBaseline = 'top';
  ctx.textAlign = 'left';  ctx.fillText('+'+maxAbs.toFixed(0)+'%', W-PAD_R+4, PAD_T);
  ctx.textAlign = 'right'; ctx.fillText('-'+maxAbs.toFixed(0)+'%', PAD_L-4,    PAD_T);

  posArr.forEach((p, i) => {
    const y = PAD_T + i * rowH + (rowH - barH) / 2;
    const pct = Math.max(-maxAbs, Math.min(maxAbs, p.gainPct));
    const barPx = (Math.abs(pct) / maxAbs) * (plotW/2);
    const isPos = pct >= 0;
    const color = isPos ? PNL_COLORS[i % PNL_COLORS.length] : '#e06b5a';

    // Background track
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(PAD_L, y, plotW, barH);

    // Bar (grows left from zero for negative, right for positive)
    const bx = isPos ? zeroX : zeroX - barPx;
    ctx.fillStyle = color + (isPos ? 'cc' : '99');
    ctx.fillRect(bx, y, barPx, barH);

    // Thin edge glow
    ctx.fillStyle = color;
    if (isPos) ctx.fillRect(bx + barPx - 1, y, 1, barH);
    else       ctx.fillRect(bx, y, 1, barH);

    // Symbol label (left)
    ctx.fillStyle = '#d4b87a'; ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(p.sym, PAD_L - 4, y + barH/2);

    // % label (right)
    const sign = pct >= 0 ? '+' : '';
    ctx.fillStyle = isPos ? color : '#e06b5a';
    ctx.textAlign = 'left';
    ctx.fillText(sign + pct.toFixed(2)+'%', W - PAD_R + 4, y + barH/2);
  });
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

// ─── liveUpdatePnL: re-renders P&L display on every price tick ───────────────
function liveUpdatePnL(tickData, portfolioSnap) {
  const box = el('#pnlBox');
  if (!box) return;

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
  const kpiBar = `<div style="display:flex;gap:18px;flex-wrap:wrap;padding:8px 4px 10px;border-bottom:1px solid #2a1a04;margin-bottom:8px">
    ${kpi('Net Worth', fmt(netWorth), '#ffb547')}
    ${kpi('Equity',    fmt(equity),   '#d4b87a')}
    ${kpi('Cash',      fmt(cashNow),  '#d4b87a')}
    ${kpi('Unrealized P&L', uplSign+fmt(Math.abs(totalUPL)), uplColor)}
    ${kpi('Daily Income', fmt(dailyIncome), '#51cf66')}
  </div>${(window.gPlayerFaction && window.gPlayerFaction !== 'null') ? `<div style="display:flex;align-items:center;gap:6px;padding:4px 4px 8px;margin-bottom:2px;font-size:.64rem;opacity:.75">
    <span style="color:${window.gPlayerFaction==='coalition'?'#4ecdc4':window.gPlayerFaction==='syndicate'?'#e74c3c':window.gPlayerFaction==='void'?'#9b59b6':'#ffd700'}">⬡</span>
    <span style="color:#888">Faction:</span>
    <span style="color:${window.gPlayerFaction==='coalition'?'#4ecdc4':window.gPlayerFaction==='syndicate'?'#e74c3c':window.gPlayerFaction==='void'?'#9b59b6':'#ffd700'};letter-spacing:.06em">${window.gPlayerFaction==='coalition'?'THE COALITION':window.gPlayerFaction==='syndicate'?'THE SYNDICATE':window.gPlayerFaction==='void'?'VOID COLLECTIVE':window.gPlayerFaction==='fleshstation'?'FLESH STATION ⚡':'—'}</span>
    <span style="color:#555;font-size:.58rem">colony bonuses active</span>
  </div>` : ''}`;

  // ── Position rows ─────────────────────────────────────────────────────────
  const posRows = posArr.map(p => {
    const uplSign2 = p.upl >= 0 ? '+' : '';
    const pctSign  = p.gainPct >= 0 ? '+' : '';
    return `<div class="pnl-pos-row" style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #1a1208">
      <span style="font-weight:700;color:#ffb547;min-width:52px">${p.sym}</span>
      <span class="muted" style="min-width:60px;font-size:.8rem">${p.qty} @ Ƒ${p.avg.toFixed(2)}</span>
      <span style="min-width:72px;color:#d4b87a">Ƒ${p.last.toFixed(2)}</span>
      <span style="min-width:80px;color:#d4b87a">${fmt(p.value)}</span>
      <span style="min-width:80px;color:${p.upl>=0?'#86ff6a':'#ff6b6b'}">${uplSign2}${fmt(p.upl)}</span>
      <span style="min-width:60px;font-size:.78rem;color:${p.gainPct>=0?'#86ff6a':'#ff6b6b'}">${pctSign}${p.gainPct.toFixed(2)}%</span>
    </div>`;
  });

  const header = posRows.length
    ? `<div style="display:flex;justify-content:space-between;padding:2px 0 5px;font-size:.68rem;letter-spacing:.09em;text-transform:uppercase;opacity:.35">
        <span style="min-width:52px">Symbol</span>
        <span style="min-width:60px">Position</span>
        <span style="min-width:72px">Last</span>
        <span style="min-width:80px">Value</span>
        <span style="min-width:80px">Unr. P&L</span>
        <span style="min-width:60px">Gain%</span>
      </div>` : '';

  const empty = !posRows.length
    ? `<div style="padding:18px 0;text-align:center;opacity:.35;font-size:.82rem">No open positions</div>` : '';

  box.innerHTML = kpiBar + header + posRows.join('') + empty;
}

function drawChart() {
  const canvas = el('#chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.clientWidth || canvas.offsetWidth || 600;
  const H = canvas.height = canvas.clientHeight || canvas.offsetHeight || 300;
  // If canvas still has no size, schedule a retry and bail
  if (W < 10 || H < 10) { setTimeout(drawChart, 100); return; }
  ctx.fillStyle = '#0a0804';
  ctx.fillRect(0,0,W,H);

  if (!OHLC.length) {
    ctx.fillStyle = '#3a2a0a';
    ctx.font = '13px monospace';
    ctx.fillText('Loading chart…', W/2 - 50, H/2);
    return;
  }
  const min = Math.min(...OHLC.map(d=>d.l));
  const max = Math.max(...OHLC.map(d=>d.h));
  const pad = (max-min)*0.1 || 1;
  const low = min - pad, high = max + pad;

  const n = OHLC.length;
  const cw = W / n;

  // grid
  ctx.strokeStyle = '#2b200a';
  ctx.lineWidth = 1;
  for (let i=0;i<6;i++){
    const y = i * (H/5);
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }

  // candles
  for (let i=0;i<n;i++){
    const d = OHLC[i];
    const x = i * cw + cw*0.5;
    const yH = H - ( (d.h - low) / (high - low) ) * H;
    const yL = H - ( (d.l - low) / (high - low) ) * H;
    const yO = H - ( (d.o - low) / (high - low) ) * H;
    const yC = H - ( (d.c - low) / (high - low) ) * H;
    // wick
    ctx.strokeStyle = '#d4a05e';
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    // body
    const up = d.c >= d.o;
    ctx.fillStyle = up ? '#86ff6a' : '#ff6b6b';
    const top = Math.min(yO, yC);
    const h = Math.max(2, Math.abs(yC - yO));
    ctx.fillRect(x - cw*0.35, top, cw*0.7, h);
  }

  // symbol label
  ctx.fillStyle = '#ffd089';
  ctx.fillText(CURRENT || '—', 8, 14);
}

// Redraw chart on resize so it's never blank after layout changes
try {
  const _chartCanvas = document.getElementById('chart');
  if (_chartCanvas) {
    new ResizeObserver(() => { if (OHLC.length) drawChart(); }).observe(_chartCanvas);
  }
} catch(e) {}

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
  const color    = isOwner ? _OWNER_COLOR : (isDev ? _DEV_COLOR : (item.color || '#d4b87a'));
  const badge    = rawBadge ? `<span style="margin-right:3px;opacity:.9;color:${color}">${rawBadge}</span>` : '';

  let text = String(item.text || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const myName = (ME && ME.name) ? ME.name : '';
  if (myName) {
    const re = new RegExp(`(@${myName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    text = text.replace(re, `<span class="chat-mention">$1</span>`);
    if (re.test(item.text || '')) try { playSound && playSound('mention'); } catch(e) {}
  }
  text = text.replace(/@([A-Za-z0-9_\-]+)/g, '<span style="color:#ffdb70;opacity:.8">@$1</span>');

  const isSystem = item.user === 'SYSTEM';
  const titleTag = (!isSystem && item.title) ? ` <span style="font-size:.72rem;opacity:.65;color:${color}">[${item.title}]</span>` : '';
  const nameStyle = `color:${color};${(__isAdmin_g && !isSystem) ? 'cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px' : ''}`;
  const userSpan  = `<b class="chat-username" data-user="${item.user}" style="${nameStyle}">${item.user}${titleTag}</b>`;

  // Block button (shown on hover, client-side only)
  const blockBtnHtml = (!isSystem && item.user !== (ME && ME.name))
    ? `<span class="chat-block-btn" title="Block this user" style="display:none;margin-left:6px;cursor:pointer;opacity:.5;font-size:.7rem;color:#ff6644;user-select:none" data-block-user="${item.user}">🚫</span>`
    : '';
  div.className = 'cm chat-msg';
  div.dataset.user = item.user || '';
  div.innerHTML = `${badge}${userSpan}: <span style="color:#c8a86a">${text}</span>${blockBtnHtml}`;

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
        if (confirm('Block ' + uname + '? Their messages will be hidden for you. (Client-side only — resets on full page reload)')) {
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

  const ph = box.querySelector('.chat-ph');
  if (ph) ph.remove();
  box.appendChild(div);
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
    const _galTab = el('#galacticTab'); if(_galTab) _galTab.style.display = sel==='galactic'?'block':'none';
    if (sel==='guild') { loadGuildDirectory(); }
    if (sel==='bugs') { if(window.bugsTabLoad) window.bugsTabLoad(); else lazyLoad('assets/dev-comms.js', ()=>window.bugsTabLoad&&window.bugsTabLoad()); }
    // ensure the equity line renders when the P&L tab becomes visible
    if (sel==='pnl') { setTimeout(()=>{ try { drawEquity(); } catch(e){} }, 0); }
  });

  // Casino subtabs — lazy script loading
  // Scripts for roulette and blackjack load immediately (default views).
  // All others inject their <script> tag on first click, then init.
  const CASINO_PANES = ['roulette','blackjack','poker','horseraces','chess','sudoku','mathgame','minesweeper'];
  const CASINO_SCRIPTS = {
    'blackjack':   'assets/casino-blackjack.js',
    'poker':       'assets/casino-poker.js',
    'chess':       'assets/casino-chess.js',
    'sudoku':      'assets/casino-sudoku.js',
    'mathgame':    'assets/casino-mathgame.js',
    'minesweeper': 'assets/casino-minesweeper.js',
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

el('#xfer').onclick = ()=>{
  ws.send(JSON.stringify({type:'transfer', toName:el('#toName').value, amount:Number(el('#amt').value||0)}));
};

// Chat wiring handled by unified chat system below
// (sendChatMsg, channel routing, @mention — see Chat System script)

el('#search').addEventListener('input', renderTickers);

// ─── Dunce System (client) — defined early so WS handlers can call it ────────
window.__IS_DUNCED = false;

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
});
ws.addEventListener('message', (ev)=>{
  const _evData = ev && ev.data != null ? ev.data : (ev && ev.detail && ev.detail.data);
  let msg; try { msg = JSON.parse(_evData); } catch(e) { return; }
  if (msg.type === 'welcome') {
    ME = msg.data;
    // Ensure token/id fields are populated for inventory system
    if (!ME.token) ME.token = window.FM_TOKEN || '';
    if (!ME.id)    ME.id    = window.FM_TOKEN || '';
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
    msg.data.leaderboard && renderBoard(msg.data.leaderboard);
    msg.data.headlines && msg.data.headlines.slice(-10).forEach(renderNews);
    // Auto-select first stock on load so chart is never blank
    if (!CURRENT && TICKERS.length) {
      CURRENT = TICKERS[0].symbol;
      try { el('#sym').value = CURRENT; } catch(e) {}
      sendWS({ type: 'chart', symbol: CURRENT });
    }
    // Seed heatmap data immediately
    window.TICKERS = TICKERS;
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
      try { updateBottomTicker(); } catch(e) {}
    }
    renderTickers();
    // Append new candle to live chart instead of re-requesting full OHLC every tick
    if (CURRENT && Array.isArray(msg.data)) {
      const tick = msg.data.find(t => t && t.symbol === CURRENT);
      if (tick && OHLC.length) {
        const last = OHLC[OHLC.length - 1];
        const now  = Date.now();
        // Start a new candle every 30s, otherwise extend current
        if (now - last.t > 30000) {
          OHLC.push({ t: now, o: last.c, h: tick.price, l: tick.price, c: tick.price, v: 0 });
          if (OHLC.length > 300) OHLC.shift();
        } else {
          last.h = Math.max(last.h, tick.price);
          last.l = Math.min(last.l, tick.price);
          last.c = tick.price;
        }
        drawChart();
      }
    }
  }
  if (msg.type === 'news') {
    renderNews(msg.data);
  }
  if (msg.type === 'leaderboard') {
    renderBoard(msg.data);
  }
  if (msg.type === 'portfolio') {
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
      // Sync faction to galaxy module
      if (msg.data.faction && typeof window.gPlayerFaction !== 'undefined') {
        window.gPlayerFaction = msg.data.faction;
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
  }
  if (msg.type === 'chart') {
    if (msg.data && msg.data.ohlc) {
      OHLC = msg.data.ohlc;
      drawChart();
    }
  }
  if (msg.type === 'chat') addChat(msg.data);
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
    const colors    = {0:'#888',1:'#c8a040',2:'#2ecc71',3:'#ffd700'};
    const glyphs    = {1:'★',2:'⚖',3:'♛'};
    const color = colors[d.tier] || '#ffb547';
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
    const color = hasBonus ? '#4ecdc4' : (isPatreon ? '#ffb547' : '#888');
    const badge = hasBonus ? '⚖' : (isPatreon ? 'Ƒ' : 'Ƒ');
    addChat({ user: 'SYSTEM', text: d.text, badge, color });
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
    addChat({ user: 'SYSTEM', text: `✅ Limit ${d.side.toUpperCase()} filled: ${d.qty}× ${d.symbol} @ Ƒ${d.fillPrice.toFixed(2)}`, badge:'⚡', color:'#86ff6a' });
  }
  if (msg.type === 'earnings_alert') {
    const d = msg.data;
    playSound(d.beat ? 'buy' : 'sell');
    const dir = d.beat ? '▲' : '▼';
    const color = d.beat ? '#86ff6a' : '#ff6a6a';
    showToast(`${dir} EARNINGS: ${d.symbol} ${d.beat?'BEAT':'MISS'} ${dir}${d.magnitude}% → Ƒ${d.newPrice.toFixed(2)}`, color);
  }
  if (msg.type === 'dividend') {
    playSound('buy');
    showToast(`💰 Dividend received: +Ƒ${msg.data.amount.toFixed(2)}`, '#4ecdc4');
    addChat({ user: 'SYSTEM', text: `💰 Dividend: +Ƒ${msg.data.amount.toFixed(2)}`, badge:'Ƒ', color:'#4ecdc4' });
  }
  if (msg.type === 'borrow_fee') {
    showToast(`📉 Short borrow fee: -Ƒ${msg.data.amount.toFixed(2)}`, '#ff9966');
  }
  if (msg.type === 'chat_system') {
    addChat({ user: 'SYSTEM', text: msg.data.text, badge:'⚡', color:'#86ff6a' });
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
      pane.appendChild(row); pane.scrollTop=pane.scrollHeight;
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
});

// ===== Casino: Roulette (European, single zero) — IMPROVED =====
(function(){
  const pane = document.getElementById('casino-roulette');
  if (!pane) return;

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
  .rl-info-row span{color:#8ab}.rl-info-row strong{color:#e6c27a}
  .rl-bet-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .rl-bet-row input{width:90px;padding:5px 8px;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;font-size:.85rem;font-family:monospace;border-radius:4px}
  .rl-chips{display:flex;gap:4px;flex-wrap:wrap;margin-top:2px}
  .rl-chips button{padding:4px 9px;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:4px;font-family:monospace;font-size:.78rem;transition:background .15s}
  .rl-chips button:hover{background:#2a2200}
  .rl-bet-type-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .rl-bet-type-row select,.rl-bet-type-row input{padding:5px 8px;background:#0d0d08;border:1px solid #4a3a10;color:#e6c27a;font-size:.82rem;font-family:monospace;border-radius:4px}
  #rl-action-row{display:flex;gap:8px;flex-wrap:wrap}
  #rl-action-row button{padding:7px 18px;background:#1a1500;border:1px solid #5a4a10;color:#e6c27a;cursor:pointer;border-radius:5px;font-family:monospace;font-size:.85rem;transition:background .15s,border-color .15s}
  #rl-action-row button:hover{background:#2a2200}
  #rl-spin-btn{border-color:#8a6a00!important;color:#ffd700!important}
  #rl-spin-btn:hover{background:#2a2000!important;border-color:#c8a000!important}
  #rl-clear-btn{border-color:#6a2020!important;color:#ff9090!important}
  #rl-clear-btn:hover{background:#2a0808!important}
  #rl-bets-list{max-height:160px;overflow-y:auto;display:flex;flex-direction:column;gap:3px}
  .rl-bet-item{display:flex;justify-content:space-between;align-items:center;padding:3px 8px;border-radius:4px;background:#0d0a00;border:1px solid #2a1a00;font-size:.78rem}
  .rl-bet-item .rl-bi-label{color:#c8a060}
  .rl-bet-item .rl-bi-amt{color:#e6c27a}
  .rl-bet-item .rl-bi-del{cursor:pointer;color:#884040;margin-left:6px;font-size:.7rem}
  .rl-bet-item .rl-bi-del:hover{color:#ff6060}
  #rl-result-banner{padding:8px 14px;border-radius:8px;font-size:.95rem;display:none;margin-top:4px;text-align:center;letter-spacing:.05em}
  #rl-result-banner.win{background:#0a2a0a;border:1px solid #2a6a2a;color:#4eff4e}
  #rl-result-banner.lose{background:#2a0808;border:1px solid #6a1a1a;color:#ff6b6b}
  #rl-result-banner.neutral{background:#1a1500;border:1px solid #5a5000;color:#ffeb80}
  #rl-log{max-height:90px;overflow-y:auto;font-size:.72rem;color:#7a8a6a;line-height:1.5;margin-top:4px}
  #rl-log div{border-bottom:1px solid #1a1a0a;padding:1px 0}
  /* Number grid for straight bets */
  .rl-num-grid{display:grid;grid-template-columns:repeat(13,1fr);gap:2px;margin-top:6px}
  .rl-num-cell{width:22px;height:20px;border-radius:3px;border:1px solid #2a1a00;display:flex;align-items:center;justify-content:center;font-size:.6rem;cursor:pointer;font-family:monospace;transition:filter .12s}
  .rl-num-cell:hover{filter:brightness(1.6)}
  .rl-num-cell.red-cell{background:#5a1010;color:#ff9090}
  .rl-num-cell.black-cell{background:#1a1a1a;color:#b0b0b0}
  .rl-num-cell.green-cell{background:#0a3a0a;color:#80ff80}
  .rl-num-cell.selected-num{outline:2px solid #ffd700;filter:brightness(1.8)}
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
        <div id="lastResult" class="muted" style="font-size:.85rem;letter-spacing:.06em;text-align:center">Last: —</div>
      </div>
      <div id="rl-controls">
        <div class="rl-info-row">
          <span>Balance: <strong id="rouletteBalance">—</strong></span>
          <span>Bets Total: <strong id="rl-bets-total">Ƒ0</strong></span>
          <span id="rl-last-net" style="display:none"></span>
        </div>
        <!-- Bet amount + quick chips -->
        <div>
          <div class="rl-label">Bet Amount</div>
          <div class="rl-bet-row">
            <input id="betAmount" type="number" min="1" value="10"/>
          </div>
          <div class="rl-chips">
            <button onclick="rlAddToAmount(5)">+5</button>
            <button onclick="rlAddToAmount(10)">+10</button>
            <button onclick="rlAddToAmount(25)">+25</button>
            <button onclick="rlAddToAmount(100)">+100</button>
            <button onclick="rlAddToAmount(500)">+500</button>
            <button onclick="document.getElementById('betAmount').value=1">Min</button>
            <button onclick="rlSetMax()">Max</button>
          </div>
        </div>
        <!-- Bet type -->
        <div>
          <div class="rl-label">Bet Type</div>
          <div class="rl-bet-type-row">
            <select id="betType">
              <option value="red">Red (1:1)</option>
              <option value="black">Black (1:1)</option>
              <option value="odd">Odd (1:1)</option>
              <option value="even">Even (1:1)</option>
              <option value="low">Low 1–18 (1:1)</option>
              <option value="high">High 19–36 (1:1)</option>
              <option value="dozen1">1st 12 · 1–12 (2:1)</option>
              <option value="dozen2">2nd 12 · 13–24 (2:1)</option>
              <option value="dozen3">3rd 12 · 25–36 (2:1)</option>
              <option value="col1">Column 1 (2:1)</option>
              <option value="col2">Column 2 (2:1)</option>
              <option value="col3">Column 3 (2:1)</option>
              <option value="straight">Straight Up (35:1)</option>
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
          <button id="placeBet" onclick="rlPlaceBet()">+ Add Bet</button>
          <button id="rl-spin-btn" onclick="rlSpin()">🎰 Spin</button>
          <button id="rl-clear-btn" onclick="rlClearBets()">✕ Clear</button>
        </div>
        <!-- Bet slip -->
        <div>
          <div class="rl-label">Active Bets</div>
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
    try{ if(window.ws&&window.ws.readyState===1) window.ws.send(JSON.stringify({type:'casino',sync:Number(newVal)||0})); }catch(_e){}
    refreshRouletteBalance();
  }
  function adjustBalance(delta){ setBalance(getBalance()+delta); }
  function refreshRouletteBalance(){
    const lbl=document.getElementById('rouletteBalance');
    if(lbl) lbl.textContent=fmtLocal(getBalance());
  }

  // ── Bet slip ────────────────────────────────────────────────────
  const bets=[];
  let lastResults=[];

  function colorOf(n){ if(n===0) return 'green'; return REDS.has(n)?'red':'black'; }

  function betLabel(b){
    const labels={red:'Red',black:'Black',odd:'Odd',even:'Even',low:'Low 1–18',high:'High 19–36',
      dozen1:'1st 12',dozen2:'2nd 12',dozen3:'3rd 12',col1:'Column 1',col2:'Column 2',col3:'Column 3'};
    if(b.type==='straight') return `Straight ${b.pick}`;
    return labels[b.type]||b.type;
  }

  function renderBets(){
    const box=document.getElementById('rl-bets-list');
    const totEl=document.getElementById('rl-bets-total');
    if(!box) return;
    const total=bets.reduce((s,b)=>s+b.amount,0);
    if(totEl) totEl.textContent=fmtLocal(total);
    if(!bets.length){ box.innerHTML='<div class="muted" style="font-size:.8rem">No bets yet.</div>'; return; }
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
    ctx.shadowColor='#ffd700'; ctx.shadowBlur=10;
    ctx.beginPath();
    ctx.moveTo(cx, cy-(R+1));
    ctx.lineTo(cx-10, cy-(R-16));
    ctx.lineTo(cx+10, cy-(R-16));
    ctx.closePath();
    ctx.fillStyle='#ffd700'; ctx.fill();
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
    const payout=payoutFor(result);
    const net=payout-totalBet;
    adjustBalance(payout);
    const lastEl=document.getElementById('lastResult');
    if(lastEl) lastEl.textContent=`Last: ${result} (${col})`;
    const banner=document.getElementById('rl-result-banner');
    if(banner){
      banner.style.display='block';
      if(payout>0){
        banner.className='rl-result-banner win';
        banner.textContent=`✓ ${result} ${col.toUpperCase()} — Won ${fmtLocal(net)} (paid ${fmtLocal(payout)})`;
      } else {
        banner.className='rl-result-banner lose';
        banner.textContent=`✗ ${result} ${col.toUpperCase()} — No win`;
      }
      setTimeout(()=>{ if(banner) banner.style.display='none'; },4000);
    }
    rlLog(`${result} (${col}) — ${payout>0?`+${fmtLocal(net)}`:'No win'} | bet ${fmtLocal(totalBet)}`);
    updateHistory(result);
    bets.length=0;
    renderBets(); refreshRouletteBalance();
  }

  // ── Place Bet ───────────────────────────────────────────────────────
  window.rlPlaceBet=function(){
    if(spinning) return;
    const betAmount=document.getElementById('betAmount');
    const betType=document.getElementById('betType');
    const straightNum=document.getElementById('straightNum');
    const amt=Math.max(1,Number(betAmount.value||0));
    if(amt>getBalance()){ rlLog('Insufficient funds.'); return; }
    const type=betType.value;
    let pick=null;
    if(type==='straight'){
      const n=Math.max(0,Math.min(36,Number(straightNum.value||0)));
      pick=n;
    } else { pick=type; }
    bets.push({type,pick,amount:amt});
    adjustBalance(-amt);
    renderBets(); refreshRouletteBalance();
    rlLog(`Bet placed: ${betLabel({type,pick})} — ${fmtLocal(amt)}`);
  };

  // ── Spin ────────────────────────────────────────────────────────────
  window.rlSpin=function(){
    if(spinning) return;
    if(!bets.length){ rlLog('Place a bet first.'); return; }
    const lastEl=document.getElementById('lastResult');
    if(lastEl) lastEl.textContent='Spinning…';
    const banner=document.getElementById('rl-result-banner'); if(banner) banner.style.display='none';
    const idx=Math.floor(Math.random()*ORDER.length);
    startSpin(idx);
  };

  const _origRP=(typeof renderPositions==='function')?renderPositions:null;
  if(_origRP){ window.renderPositions=function(p){ _origRP(p); refreshRouletteBalance(); }; }

  draw();
  refreshRouletteBalance();
  renderBets();
})();
  // Time control selector behavior handled in chess IIFE below

