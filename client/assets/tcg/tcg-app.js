/* Corpo-Cards - FleshMarket's in-game trading card game.
   One mount off this module:
     window.tcgTabLoad()  -> the Corpo-Cards tab, rendered into #arenaTab.
   Views: Play / Decks / Collection / Rules / Card Packs / Ƒbay. The pack store
   (Card Packs) and its opening reveal used to live in the Store tab and now sit here.
   Pack buying is server-authoritative; the client only displays. PvE matches run the
   engine client-side. Classes are cc-* prefixed to avoid colliding with the game CSS. */
(function () {
  if (window.__corpoInit) return;
  window.__corpoInit = true;

  var Engine = null, CARDS = null, D = null, AI = null, ART = null;
  var CCVER = Date.now();            // cache-bust for tcg dep scripts so deploys always load fresh
  var depsReady = false;
  var state = { cash: 0, collection: [], decks: [], packs: [], cardListings: [], myCardListings: [] };
  var activeMount = null;            // 'store' | 'arena'
  var arenaView = 'play';            // 'play' | 'decks' | 'collection'
  var inMatch = false;
  var builder = { open: false, slot: 0, deck: null };

  var FAC = ['coalition', 'syndicate', 'void', 'guild', 'flesh', 'dwarves', 'abaddon'];
  var FAC_DESC = { coalition: 'Defense, buffs, healing', syndicate: 'Aggression, burn, reach', void: 'Attrition, scaling, removal', guild: 'Tempo, card draw, value', flesh: 'Sacrifice, drain, death value', dwarves: 'Tribe, anthems, swarm', abaddon: 'Legendary bombs, top-heavy' };
  // reveal wrapper tint per faction (the pack-cover sprite that peels open on pack-opening)
  var FAC_WRAP = { coalition: 'blue', syndicate: 'orange', void: 'purple', guild: 'green', flesh: 'red', dwarves: 'gold', abaddon: 'white', neutral: 'lightblue' };
  var KW = { 'taunt': 'TAUNT', 'rush': 'RUSH', 'charge': 'CHARGE', 'windfury': 'W.FURY', 'divine shield': 'SHIELD', 'poisonous': 'POISON', 'lifesteal': 'LIFESTEAL' };

  // =====================================================================  CSS
  var CSS = `
  .cc-root{font-family:'Courier New',ui-monospace,monospace;color:#9fb3ad;font-size:13px}
  .cc-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;flex-wrap:wrap;padding:2px}
  .cc-ttl{color:#5cf08a;letter-spacing:.12em;font-weight:700;text-transform:uppercase;text-shadow:0 0 10px rgba(92,240,138,.3)}
  .cc-ttl small{display:block;color:#5d6f6a;font-size:10px;letter-spacing:.18em;margin-top:2px}
  .cc-cash{font-weight:700;color:#ffd23f;font-size:.95rem}
  .cc-nav{display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid #13202a;flex-wrap:wrap}
  .cc-nav button{background:none;border:none;border-bottom:2px solid transparent;color:#5d8f6f;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;cursor:pointer;font-family:inherit}
  .cc-nav button.on{color:#7df0a6;border-bottom-color:#2f7d4f}
  .cc-msg{color:#ff8a8a;font-size:.8rem;min-height:1.1em;margin:0 2px 6px}
  .cc-empty{color:#5d6f6a;padding:26px;text-align:center;border:1px dashed #13202a;border-radius:10px}
  .cc-btn{background:#0a1a10;border:1px solid #2f7d4f;color:#5cf08a;font-family:inherit;font-size:12px;letter-spacing:.05em;padding:7px 13px;border-radius:5px;cursor:pointer}
  .cc-btn:hover:not(:disabled){background:#10301c}
  .cc-btn:disabled{opacity:.35;cursor:not-allowed}
  .cc-btn.amber{border-color:#7a5418;color:#f0a43c;background:#1a1206}
  .cc-btn.red{border-color:#6a1a1a;color:#ff5c5c;background:#1a0808}
  .cc-btn.sm{padding:4px 9px;font-size:11px}
  /* card */
  .cc-card{position:relative;width:104px;height:158px;border:2px solid #13202a;border-radius:9px;overflow:hidden;background:#05070b;flex:0 0 auto;transition:transform .1s,box-shadow .1s}
  .cc-card .art{position:absolute;inset:0;overflow:hidden}
  .cc-card .art::before{content:'';position:absolute;inset:0;background:radial-gradient(125% 80% at 50% 18%,var(--tint,#1a2230),#05070b 78%);z-index:0}
  .cc-card .art img{position:absolute;z-index:1;display:block}
  .cc-card .art img.cc-bg{top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0;image-rendering:pixelated;filter:none}
  .cc-card.cc-portrait .art img{top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:top center;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))}
  .cc-card.cc-element .art img{top:0;left:0;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;opacity:.96}
  .cc-card .cost{position:absolute;top:4px;left:4px;width:22px;height:22px;border-radius:50%;background:rgba(8,16,34,.82);border:2px solid #f0a43c;color:#f0a43c;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:3}
  .cc-card .kwc{position:absolute;top:4px;right:4px;display:flex;flex-direction:column;gap:2px;align-items:flex-end;z-index:3}
  .cc-card .kwc span{font-size:8px;letter-spacing:.03em;background:rgba(3,16,8,.82);color:#5cf08a;border:1px solid #2f7d4f;border-radius:3px;padding:0 3px;line-height:1.45}
  .cc-card .info{position:absolute;left:0;right:0;bottom:0;padding:13px 6px 22px;background:linear-gradient(180deg,transparent 0%,rgba(4,6,11,.28) 52%,rgba(4,6,11,.56) 100%);z-index:2}
  .cc-card.cc-spell .info{padding-bottom:6px}
  .cc-card .nm{font-size:10px;font-weight:700;color:#fff;line-height:1.12;text-shadow:-0.5px -0.5px 0 #000,0.5px -0.5px 0 #000,-0.5px 0.5px 0 #000,0.5px 0.5px 0 #000,0 0 3px #000,0 1px 2px #000}
  .cc-card .tx{font-size:8.5px;color:#d7e2dc;line-height:1.2;margin-top:2px;max-height:30px;overflow:hidden;text-shadow:-0.5px -0.5px 0 rgba(0,0,0,.95),0.5px -0.5px 0 rgba(0,0,0,.95),-0.5px 0.5px 0 rgba(0,0,0,.95),0.5px 0.5px 0 rgba(0,0,0,.95),0 0 3px #000}
  .cc-card .atk,.cc-card .hp{position:absolute;bottom:3px;width:20px;height:20px;border-radius:50%;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;z-index:4;text-shadow:0 1px 2px #000}
  .cc-card .atk{left:3px;background:rgba(26,18,6,.9);border:1.5px solid #f0a43c;color:#f0a43c}
  .cc-card .hp{right:3px;background:rgba(26,6,6,.9);border:1.5px solid #ff5c5c;color:#ff5c5c}
  .cc-card .badge{position:absolute;top:-7px;right:-7px;background:#0a1428;border:2px solid #2f7d4f;color:#5cf08a;font-size:11px;font-weight:700;border-radius:10px;padding:0 6px;z-index:6}
  .cc-card .qty{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.7);color:#cfe;border:1px solid #13202a;border-radius:9px;font-size:9px;font-weight:700;padding:0 6px;z-index:5}
  .cc-card.cc-f-coalition{border-color:#4aa3ff;--tint:#13283f}
  .cc-card.cc-f-syndicate{border-color:#ff7a3c;--tint:#3a1d10}
  .cc-card.cc-f-void{border-color:#b97bff;--tint:#281438}
  .cc-card.cc-f-guild{border-color:#5cf08a;--tint:#103020}
  .cc-card.cc-f-flesh{border-color:#ff5c8a;--tint:#3a1020}
  .cc-card.cc-f-neutral{border-color:#9fb3ad;--tint:#1a2230}
  .cc-card.cc-f-dwarves{border-color:#c79a3a;--tint:#2a2113}
  .cc-card.cc-f-abaddon{border-color:#9162dc;--tint:#22113a}
  .cc-card.cc-abaddon{--tint:#22113a;border-color:#9162dc;box-shadow:0 0 9px rgba(145,98,220,.35)}
  .cc-card.cc-foil .art::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(115deg,transparent 36%,rgba(150,230,255,.4) 48%,transparent 62%);background-size:250% 250%;animation:ccfoil 3.2s linear infinite}
  @keyframes ccfoil{0%{background-position:120% 0}100%{background-position:-50% 0}}
  .cc-card.cc-shiny{border-color:#fff}
  .cc-card.cc-shiny .art::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:color-dodge;opacity:.55;background:linear-gradient(115deg,rgba(255,0,128,.5),rgba(255,210,0,.5),rgba(0,230,160,.5),rgba(80,160,255,.5),rgba(200,80,255,.5));background-size:300% 300%;animation:ccshine 2.6s linear infinite}
  .cc-card .shtag{position:absolute;top:4px;left:50%;transform:translateX(-50%);z-index:7;font-size:8px;font-weight:700;letter-spacing:.12em;color:#0a0a0a;background:linear-gradient(90deg,#fff,#bdf);border-radius:7px;padding:0 6px}
  @keyframes ccshine{0%{background-position:0% 50%}100%{background-position:300% 50%}}
  .cc-card.cc-mini{width:66px;height:96px;border-radius:7px}
  .cc-card.cc-mini .info{display:none}
  .cc-card.cc-mini .cost{width:17px;height:17px;font-size:10px;top:2px;left:2px;border-width:1.5px}
  .cc-card.cc-mini .kwc span{font-size:7px;padding:0 2px;line-height:1.3}
  .cc-card.cc-mini .atk,.cc-card.cc-mini .hp{width:17px;height:17px;font-size:10px;bottom:2px;border-width:1.5px}
  .cc-card.cc-mini .atk{left:2px}.cc-card.cc-mini .hp{right:2px}
  .cc-card.cc-click{cursor:pointer}.cc-card.cc-click:hover{transform:translateY(-6px)}
  .cc-card.cc-full{opacity:.4;cursor:not-allowed}.cc-card.cc-full:hover{transform:none}
  .cc-card.cc-playable{box-shadow:0 0 0 1px #2f7d4f}
  .cc-card.cc-canatk{cursor:pointer;box-shadow:0 0 10px rgba(92,240,138,.5)}.cc-card.cc-canatk:hover{transform:translateY(-4px)}
  .cc-card.cc-sel{transform:translateY(-8px);box-shadow:0 0 0 2px #5cf08a,0 8px 16px rgba(0,0,0,.6)}
  .cc-card.cc-tgt{cursor:pointer;box-shadow:0 0 10px rgba(255,92,92,.6);border-color:#ff5c5c}
  /* store */
  .cc-packs{display:flex;gap:16px;flex-wrap:wrap}
  .cc-pack{width:200px;border:1px solid #2a3b30;border-radius:12px;overflow:hidden;background:#070d0a;display:flex;flex-direction:column}
  .cc-pack .pwrap{height:150px;position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 90% at 50% 20%,var(--pt,#14352a),#05080b);overflow:hidden}
  .cc-pack.pk-premium .pwrap{--pt:#2a1840}
  .cc-pack .psig{font-size:2.6rem;color:#7df0a6;opacity:.9;text-shadow:0 0 18px rgba(125,240,166,.5);font-weight:700}
  .cc-pack.pk-premium .psig{color:#c79bff;text-shadow:0 0 18px rgba(199,155,255,.5)}
  .cc-pack.pk-guild_crate .pwrap{--pt:#2a2113}
  .cc-pack.pk-guild_crate .psig{color:#e0bd63;text-shadow:0 0 18px rgba(224,189,99,.5)}
  .cc-pack.pk-vault .pwrap{--pt:#0e2230}
  .cc-pack.pk-vault .psig{color:#9fd8ff;text-shadow:0 0 20px rgba(159,216,255,.6)}
  .cc-pack .pscan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.18) 2px 3px);pointer-events:none}
  .cc-pack .pbody{padding:10px 12px;display:flex;flex-direction:column;gap:6px;flex:1}
  .cc-pack .pname{font-weight:700;color:#dfeae6;font-size:.92rem}
  .cc-pack .pblurb{color:#8aa;font-size:.72rem;line-height:1.3;flex:1}
  .cc-pack .pbuy{background:#0b2417;border:1px solid #2e6f43;color:#7df0a6;border-radius:7px;padding:8px;font-family:inherit;font-weight:700;cursor:pointer}
  .cc-pack .pbuy:hover:not(:disabled){background:#13351f}
  .cc-pack .pbuy:disabled{opacity:.45;cursor:not-allowed}
  /* collection */
  .cc-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
  .cc-tools select{background:#0a1410;color:#cfe;border:1px solid #13202a;border-radius:6px;padding:5px 8px;font-family:inherit;font-size:.74rem}
  .cc-stat{color:#5d8f6f;font-size:.74rem;margin-left:auto}
  .cc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:12px}
  /* builder */
  .cc-frow{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
  .cc-fbtn{flex:1;min-width:120px;border:1px solid #13202a;background:#06090d;color:#9fb3ad;padding:10px;border-radius:8px;cursor:pointer;text-align:center;font-family:inherit;font-size:12px;letter-spacing:.08em}
  .cc-fbtn:hover{background:#0b1118}
  .cc-fbtn.sel{box-shadow:inset 0 0 0 2px currentColor}
  .cc-fbtn small{display:block;color:#5d6f6a;font-size:10px;margin-top:3px}
  .cc-fbtn.coalition{color:#4aa3ff}.cc-fbtn.syndicate{color:#ff7a3c}.cc-fbtn.void{color:#b97bff}.cc-fbtn.guild{color:#5cf08a}.cc-fbtn.flesh{color:#ff5c8a}.cc-fbtn.dwarves{color:#c79a3a}.cc-fbtn.abaddon{color:#9162dc}
  .cc-bmain{display:grid;grid-template-columns:1fr 320px;gap:14px}
  .cc-pool{display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;padding:10px;border:1px solid #13202a;border-radius:8px;background:#06090d;min-height:200px}
  .cc-ph{width:100%;font-size:10px;letter-spacing:.16em;color:#5d6f6a;margin-bottom:2px}
  .cc-deckcol{border:1px solid #13202a;border-radius:8px;background:#06090d;padding:10px;display:flex;flex-direction:column;gap:8px;height:fit-content;position:sticky;top:10px}
  .cc-dhead{display:flex;align-items:baseline;justify-content:space-between}
  .cc-dcount{font-size:20px;font-weight:700;color:#5cf08a}.cc-dcount.bad{color:#ff5c5c}
  .cc-dcount small{font-size:11px;color:#5d6f6a;font-weight:400}
  .cc-valid{font-size:11px}.cc-valid.ok{color:#5cf08a}.cc-valid.bad{color:#ff5c5c}
  .cc-errs{font-size:10.5px;color:#ff5c5c;line-height:1.4;max-height:90px;overflow:auto}
  .cc-curve{display:flex;align-items:flex-end;gap:3px;height:46px;border-bottom:1px solid #13202a;padding-bottom:2px}
  .cc-curve .bar{flex:1;background:linear-gradient(180deg,#2f7d4f,#0a1a10);border-top:1px solid #5cf08a;position:relative;min-height:2px}
  .cc-curve .bar span{position:absolute;bottom:-15px;left:0;right:0;text-align:center;font-size:9px;color:#5d6f6a}
  .cc-curve .bar b{position:absolute;top:-13px;left:0;right:0;text-align:center;font-size:9px;color:#5cf08a}
  .cc-dlist{display:flex;flex-direction:column;gap:3px;max-height:300px;overflow:auto;margin-top:10px}
  .cc-drow{display:flex;align-items:center;gap:7px;padding:4px 6px;border:1px solid #13202a;border-radius:5px;background:#080d12;cursor:pointer;font-size:11.5px}
  .cc-drow:hover{background:#120a0a;border-color:#3a1a1a}
  .cc-drow .qc{color:#f0a43c;font-weight:700;width:26px}
  .cc-drow .dc{width:18px;height:18px;border-radius:50%;background:#0a1428;border:1px solid #f0a43c;color:#f0a43c;font-size:10px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
  .cc-drow .dn{flex:1;color:#9fb3ad}.cc-drow .rm{color:#ff5c5c;font-weight:700}
  .cc-dact{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center}
  .cc-name{background:#0a1410;color:#cfe;border:1px solid #13202a;border-radius:6px;padding:6px 8px;font-family:inherit;font-size:.78rem;flex:1;min-width:90px}
  /* deck cards (saved deck list) */
  .cc-decks{display:flex;flex-direction:column;gap:8px}
  .cc-deckrow{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #13202a;border-radius:8px;background:#06090d}
  .cc-deckrow .dt{flex:1}
  .cc-deckrow .dt b{color:#dfeae6}.cc-deckrow .dt small{display:block;color:#5d6f6a;font-size:.68rem;letter-spacing:.06em;text-transform:uppercase}
  /* table (play) */
  .cc-hero{display:flex;align-items:center;gap:14px;padding:5px 12px;border:1px solid #13202a;border-radius:8px;background:#06090d;margin:3px 0}
  .cc-hero.cc-tgt{cursor:pointer;border-color:#ff5c5c;box-shadow:0 0 12px rgba(255,92,92,.35)}
  .cc-solv{font-size:18px;font-weight:700;color:#ff5c5c}.cc-solv .lab{font-size:9px;color:#5d6f6a;letter-spacing:.14em;display:block;font-weight:400}
  .cc-meta{margin-left:auto;color:#5d6f6a;font-size:11px;text-align:right;line-height:1.5}
  .cc-board{display:flex;gap:8px;min-height:88px;padding:6px;border:1px dashed #13202a;border-radius:8px;align-items:center;flex-wrap:wrap}
  .cc-lane{font-size:10px;color:#5d6f6a;letter-spacing:.14em;margin:4px 0 1px}
  .cc-mid{display:grid;grid-template-columns:1fr 290px;gap:10px;margin:5px 0}
  .cc-hint{padding:8px 12px;border:1px solid #7a5418;background:#160f04;border-radius:8px;color:#f0a43c;font-size:12px;min-height:38px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .cc-log{border:1px solid #13202a;border-radius:8px;background:#06090d;padding:8px;height:104px;overflow:auto;font-size:11px;line-height:1.5}
  .cc-log .e{color:#5d6f6a}.cc-log .e.play{color:#5cf08a}.cc-log .e.atk{color:#f0a43c}.cc-log .e.die{color:#ff5c5c}.cc-log .e.dmg{color:#ffcaca}.cc-log .e.turn{color:#9fb3ad;border-top:1px solid #13202a;margin-top:3px;padding-top:3px}
  .cc-banner{text-align:center;padding:14px;border-radius:8px;font-size:18px;font-weight:700;letter-spacing:.1em;margin:8px 0;display:none}
  .cc-banner.on{display:block}.cc-banner.win{background:#07210f;border:1px solid #2f7d4f;color:#5cf08a}.cc-banner.lose{background:#260a0a;border:1px solid #6a1a1a;color:#ff5c5c}
  .cc-controls{display:flex;gap:8px;align-items:center;margin-top:5px;flex-wrap:wrap}
  .cc-rules{max-width:680px;font-size:13px;line-height:1.6;padding:4px 2px}
  .cc-rsec{margin:0 0 14px}
  .cc-rh{font-size:11px;letter-spacing:.14em;color:#5cf08a;text-transform:uppercase;margin-bottom:4px;font-weight:700}
  .cc-rules p{margin:0;color:#9fb3ad}
  .cc-kw{margin:0;display:grid;grid-template-columns:max-content 1fr;gap:3px 14px}
  .cc-kw dt{color:#f0a43c;font-weight:700}
  .cc-kw dd{margin:0;color:#9fb3ad}
  .cc-fb-h{font-size:11px;letter-spacing:.14em;color:#5cf08a;text-transform:uppercase;margin:6px 2px 8px;font-weight:700}
  .cc-fb-grid{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px}
  .cc-fb-cell{display:inline-flex;flex-direction:column;gap:6px;width:104px}
  .cc-fb-ft{display:flex;flex-direction:column;align-items:stretch;gap:4px;width:104px}
  .cc-fb-ft .cc-btn{width:100%}
  .cc-fb-price{color:#f0c84c;font-weight:700;font-size:.74rem;white-space:nowrap;text-align:center;overflow:hidden;text-overflow:ellipsis}
  .cc-fb-seller{color:#5d6f6a;font-size:.66rem;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:104px}
  .cc-ovl{position:fixed;inset:0;background:rgba(2,6,4,.74);display:flex;align-items:center;justify-content:center;z-index:9999}
  .cc-ovl-box{background:#0b120d;border:1px solid #1f3a28;border-radius:6px;padding:16px 18px;width:300px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,.6)}
  .cc-ovl-ttl{color:#9fb3ad;font-weight:700;font-size:.92rem;margin-bottom:4px}
  .cc-ovl-sub{color:#5d6f6a;font-size:.72rem;line-height:1.4}
  .cc-ovl-inp{flex:1;background:#06100a;border:1px solid #244;color:#cfe;padding:7px 9px;border-radius:4px;font-family:inherit;font-size:.86rem;min-width:0}
  /* reveal overlay (global, on body) */
  .cc-reveal{position:fixed;inset:0;z-index:99999;background:rgba(2,4,7,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:'Courier New',ui-monospace,monospace}
  .cc-reveal h3{color:#7df0a6;letter-spacing:.14em;text-transform:uppercase;font-size:1rem;margin:0}
  .cc-reveal .row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:680px}
  .cc-reveal .slot{perspective:800px}
  .cc-reveal .slot.cc-unwrap{position:relative;width:150px;height:170px;display:flex;align-items:center;justify-content:center}
  .cc-reveal .cc-wrapimg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;z-index:2;transition:opacity .28s ease;filter:drop-shadow(0 3px 7px rgba(0,0,0,.5))}
  .cc-reveal .cc-unwrap-card{position:absolute;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.82) translateY(6px);transition:opacity .32s ease,transform .32s cubic-bezier(.3,1.5,.5,1);z-index:1}
  .cc-reveal .slot.cc-unwrap.opened .cc-wrapimg{opacity:0;pointer-events:none}
  .cc-reveal .slot.cc-unwrap.opened .cc-unwrap-card{opacity:1;transform:scale(1) translateY(0);z-index:3}
  .cc-flip{width:104px;height:158px;position:relative;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,1.4,.5,1);transform:rotateY(180deg)}
  .cc-flip.revealed{transform:rotateY(0deg)}
  .cc-flip .face{position:absolute;inset:0;backface-visibility:hidden;border-radius:9px;overflow:hidden}
  .cc-flip .back{transform:rotateY(180deg);background:radial-gradient(120% 90% at 50% 30%,#15352a,#05080b);border:2px solid #2a3b30;display:flex;align-items:center;justify-content:center}
  .cc-flip .back span{font-size:2.4rem;color:#46d07d;opacity:.85;font-weight:700}
  .cc-reveal .gl-legend .cc-card{box-shadow:0 0 22px 4px rgba(199,155,255,.7)}
  .cc-reveal .gl-epic .cc-card{box-shadow:0 0 18px 3px rgba(150,120,255,.55)}
  .cc-reveal .gl-shiny .cc-card{box-shadow:0 0 24px 5px rgba(180,230,255,.8)}
  `;
  var artPreloaded = false;
  function preloadArt() {
    if (artPreloaded) return; artPreloaded = true;
    var seen = {};
    for (var id in CARDS) {
      var d = CARDS[id]; if (!d || d.token) continue;
      var url = 'assets/tcg/bg/' + (d.element || 'attack') + '-' + (FAC_WRAP[d.faction] || 'lightblue') + '.png';
      if (!seen[url]) { seen[url] = 1; var im = new Image(); im.src = url; }
    }
  }
  function injectCSS() { if (!document.getElementById('cc-css')) { var s = document.createElement('style'); s.id = 'cc-css'; s.textContent = CSS; document.head.appendChild(s); } preloadArt(); }

  // =====================================================================  deps + ws
  function loadScript(src, cb) {
    var ex = document.querySelector('script[data-cc="' + src + '"]');
    if (ex) { if (ex.dataset.loaded) cb(); else ex.addEventListener('load', cb); return; }
    var s = document.createElement('script'); s.src = src + '?v=' + CCVER; s.dataset.cc = src;
    s.onload = function () { s.dataset.loaded = '1'; cb(); };
    document.head.appendChild(s);
  }
  function ensureDeps(cb) {
    if (depsReady) { cb(); return; }
    var seq = ['assets/tcg/cards.js', 'assets/tcg/card-art.js', 'assets/tcg/engine.js', 'assets/tcg/deck.js', 'assets/tcg/ai.js'];
    (function next(i) {
      if (i >= seq.length) {
        CARDS = (window.FleshTCGCards || {}).CARDS || {};
        ART = (window.FleshTCGArt || {}).cardArt;
        Engine = (window.FleshTCGEngine || {}).Engine;
        D = window.FleshTCGDeck; AI = window.FleshTCGAI;
        depsReady = true; cb(); return;
      }
      loadScript(seq[i], function () { next(i + 1); });
    })(0);
  }
  function send(o) { try { window.ws && window.ws.readyState === 1 && window.ws.send(JSON.stringify(o)); } catch (_) {} }
  function onMsg(ev) {
    var m; try { m = JSON.parse(ev.data); } catch (_) { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'tcg_collection') { state.cash = m.data.cash; state.collection = m.data.collection || []; state.decks = m.data.decks || []; state.packs = m.data.packs || []; setMsg(''); refresh(); }
    else if (m.type === 'tcg_pack_opened') { state.cash = m.data.cash; openReveal(m.data.cards || []); }
    else if (m.type === 'tcg_decks') { state.decks = m.data.decks || []; if (activeMount === 'arena' && !inMatch) { if (builder.open) builder.open = false; renderArena(); } }
    else if (m.type === 'tcg_error') { setMsg(m.data && m.data.msg || 'Error'); }
    else if (m.type === 'tcg_card_listings') {
      state.cardListings = m.data.listings || []; state.myCardListings = m.data.mine || [];
      if (m.data.collection) state.collection = m.data.collection;
      if (activeMount === 'arena' && !inMatch && arenaView !== 'rules') renderArena();
    }
    else if (m.type === 'tcg_card_bought') {
      if (m.data.collection) state.collection = m.data.collection;
      if (m.data.cash != null) state.cash = m.data.cash;
      if (m.data.listings) state.cardListings = m.data.listings;
      if (m.data.mine) state.myCardListings = m.data.mine;
      var bn = CARDS[m.data.card] ? CARDS[m.data.card].name : 'card';
      setMsg('Bought ' + bn + (m.data.variant === 'shiny' ? ' (shiny)' : '') + ' for ' + fmtF(m.data.price) + '.');
      if (activeMount === 'arena' && !inMatch) renderArena();
    }
    else if (m.type === 'tcg_card_sold') {
      var sn = CARDS[m.data.card] ? CARDS[m.data.card].name : 'a card';
      setMsg('Sold ' + sn + (m.data.variant === 'shiny' ? ' (shiny)' : '') + ' for ' + fmtF(m.data.price) + '.');
      if (activeMount === 'arena' && !inMatch) renderArena();
    }
  }
  function refresh() {
    if (activeMount === 'arena') { if (inMatch || builder.open) return; renderArena(); }
  }

  // =====================================================================  helpers
  function fmtF(n) { return 'Ƒ' + Math.round(Number(n) || 0).toLocaleString('en-US'); }
  function setMsg(t) { var e = document.querySelector('.cc-msg'); if (e) e.textContent = t || ''; }
  function ownedMap() { var m = {}; state.collection.forEach(function (r) { m[r.card_id] = (m[r.card_id] || 0) + r.qty; }); return m; }
  // A saved deck is only playable if you currently own (un-listed) every card it uses.
  // state.collection already reflects listing (a listed copy is decremented out of qty),
  // so a listed card lowers available copies and any deck needing it becomes unplayable
  // until the listing is cancelled (qty returns) or sold (qty stays down, replace the card).
  function deckAvailability(cards) {
    if (!cards || !cards.length) return { ok: true, missing: 0, listed: 0 };
    var need = {}; cards.forEach(function (id) { need[id] = (need[id] || 0) + 1; });
    var have = ownedMap();
    var listedCount = {}; (state.myCardListings || []).forEach(function (L) { listedCount[L.card_id] = (listedCount[L.card_id] || 0) + 1; });
    var missing = 0, listed = 0;
    Object.keys(need).forEach(function (id) {
      var deficit = need[id] - (have[id] || 0);
      if (deficit > 0) { missing += deficit; listed += Math.min(deficit, listedCount[id] || 0); }
    });
    return { ok: missing === 0, missing: missing, listed: listed };
  }
  // word for the deck-row reason: "listed" when the shortfall is fully explained by
  // the player's own active listings, otherwise "unavailable" (a card was sold off).
  function availWord(av) { return av.listed >= av.missing ? 'listed' : 'unavailable'; }
  function el(tag, cls, html) { var d = document.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }

  function cardEl(c, opts) {
    opts = opts || {};
    var def = (c && c.def) || (typeof c === 'string' ? CARDS[c] : (c && c.defId ? CARDS[c.defId] : null)) || c;
    if (!def || !def.faction) return el('div', 'cc-card');
    var art = ART ? ART(def.id, def) : { url: '', portrait: false };
    var d = el('div', 'cc-card cc-f-' + def.faction + (art.portrait ? ' cc-portrait' : ' cc-element') + (def.type === 'tactic' ? ' cc-spell' : '') + (opts.mini ? ' cc-mini' : ''));
    if (def.rarity === 'epic' || def.rarity === 'legend') d.classList.add('cc-foil');
    if (def.set === 'abaddon') d.classList.add('cc-abaddon');
    if (opts.shiny) d.classList.add('cc-shiny');
    d.title = def.name + (def.text ? ': ' + def.text : '');
    var a = el('div', 'art');
    var bgcol = FAC_WRAP[def.faction] || 'lightblue';
    var bgimg = new Image(); bgimg.className = 'cc-bg'; bgimg.alt = '';
    bgimg.onerror = function () { this.remove(); };
    bgimg.src = 'assets/tcg/bg/' + (def.element || 'attack') + '-' + bgcol + '.png';
    a.appendChild(bgimg);
    if (art.url && art.portrait) { var img = new Image(); img.src = art.url; img.alt = def.name; img.loading = 'lazy'; a.appendChild(img); }
    d.appendChild(a);
    if (opts.shiny) d.appendChild(el('div', 'shtag', 'SHINY'));
    d.appendChild(el('div', 'cost', def.cost));
    var kws = (def.keywords || []).slice();
    if (opts.live && def.type === 'unit' && kws.indexOf('divine shield') >= 0 && !c.divineShield) kws = kws.filter(function (k) { return k !== 'divine shield'; });
    if (kws.length) { var k = el('div', 'kwc'); kws.forEach(function (x) { k.appendChild(el('span', null, KW[x] || x.toUpperCase())); }); d.appendChild(k); }
    d.appendChild(el('div', 'info', '<div class="nm">' + def.name + '</div>' + (def.text ? '<div class="tx">' + def.text + '</div>' : '')));
    if (def.type === 'unit') {
      d.appendChild(el('div', 'atk', opts.live ? c.attack : def.attack));
      d.appendChild(el('div', 'hp', opts.live ? c.health : def.health));
    }
    if (opts.badge) d.appendChild(el('div', 'badge', opts.badge));
    if (opts.qty && opts.qty > 1) d.appendChild(el('div', 'qty', '×' + opts.qty));
    return d;
  }

  // =====================================================================  STORE (Store tab)
  function renderPacks(body) {
    body.innerHTML = '';
    body.appendChild(el('div', null, '<div style="color:#5d6f6a;font-size:.76rem;margin:0 2px 12px">Buy packs to grow your collection, then build decks in <b style="color:#7df0a6">Decks</b> and play in <b style="color:#7df0a6">Play</b>.</div>'));
    var packs = el('div', 'cc-packs');
    if (!state.packs.length) { packs.appendChild(el('div', 'cc-empty', 'Loading packs…')); }
    state.packs.forEach(function (p) {
      var afford = Number(state.cash) >= Number(p.price);
      var pk = el('div', 'cc-pack pk-' + p.id,
        '<div class="pwrap"><div class="psig">Ƒ</div><div class="pscan"></div></div>' +
        '<div class="pbody"><div class="pname">' + p.name + '</div><div class="pblurb">' + (p.blurb || '') + '</div>' +
        '<button class="pbuy"' + (afford ? '' : ' disabled') + '>' + (afford ? 'Buy · ' + fmtF(p.price) : 'Need ' + fmtF(p.price)) + '</button></div>');
      pk.querySelector('.pbuy').onclick = function () { setMsg(''); send({ type: 'tcg_buy_pack', pack: p.id }); };
      packs.appendChild(pk);
    });
    body.appendChild(packs);
  }

  // =====================================================================  pack opening
  function wrapBaseFor(def) {
    var color = FAC_WRAP[(def && def.faction)] || 'lightblue';
    var elem = (def && def.element) || 'attack';
    return 'assets/tcg/wrap/' + elem + '-' + color + '/';
  }
  function playUnwrap(s) {
    for (var n = 2; n <= 8; n++) { var im = new Image(); im.src = s.base + n + '.png'; } // warm cache
    var frame = 1;
    var iv = setInterval(function () {
      frame++;
      if (frame > 8) {
        clearInterval(iv);
        var open = function () { s.slot.classList.add('opened'); };
        if (s.bg && !s.bg.complete) { s.bg.addEventListener('load', open, { once: true }); s.bg.addEventListener('error', open, { once: true }); setTimeout(open, 1500); }
        else setTimeout(open, 40);
        return;
      }
      s.wimg.src = s.base + frame + '.png';
    }, 55);
  }
  function openReveal(cards) {
    injectCSS();
    var ov = el('div', 'cc-reveal');
    ov.appendChild(el('h3', null, 'Pack Opened'));
    var row = el('div', 'row'); var slots = [];
    cards.forEach(function (c) {
      var def = CARDS[c.card];
      var slot = el('div', 'slot cc-unwrap');
      if (c.variant === 'shiny') slot.classList.add('gl-shiny'); else if (c.rarity === 'legend') slot.classList.add('gl-legend'); else if (c.rarity === 'epic') slot.classList.add('gl-epic');
      var base = wrapBaseFor(def);
      var holder = el('div', 'cc-unwrap-card'); holder.appendChild(cardEl(c.card, { shiny: c.variant === 'shiny' }));
      var bgi = holder.querySelector('img.cc-bg');
      var wimg = new Image(); wimg.className = 'cc-wrapimg'; wimg.alt = ''; wimg.src = base + '1.png';
      wimg.onerror = function () { slot.classList.add('opened'); }; // missing wrapper -> just show the card
      slot.appendChild(holder); slot.appendChild(wimg);
      row.appendChild(slot); slots.push({ slot: slot, wimg: wimg, base: base, bg: bgi });
    });
    ov.appendChild(row);
    var done = el('button', 'cc-btn', 'Continue');
    done.onclick = function () { ov.remove(); send({ type: 'tcg_collection' }); };
    ov.appendChild(done);
    document.body.appendChild(ov);
    slots.forEach(function (s, i) { setTimeout(function () { playUnwrap(s); }, 220 + i * 340); });
  }

  // =====================================================================  CORPO-CARDS tab: Play / Decks / Collection / Rules / Card Packs / Ƒbay
  function arenaRoot() { return document.getElementById('arenaTab'); }
  function renderArena() {
    var r = arenaRoot(); if (!r) return;
    inMatch = false;
    r.innerHTML = '';
    var wrap = el('div', 'cc-root'); wrap.style.cssText = 'padding:10px;max-width:1040px;margin:0 auto';
    wrap.appendChild(el('div', 'cc-top', '<div class="cc-ttl">Corpo-Cards<small>The Arena</small></div><div class="cc-cash">' + fmtF(state.cash) + '</div>'));
    var nav = el('div', 'cc-nav');
    [['play', 'Play'], ['decks', 'Decks'], ['collection', 'Collection'], ['rules', 'Rules'], ['packs', 'Card Packs'], ['fbay', 'Ƒbay']].forEach(function (v) {
      var b = el('button', arenaView === v[0] ? 'on' : null, v[1]); b.onclick = function () { arenaView = v[0]; builder.open = false; if (v[0] === 'fbay') send({ type: 'tcg_card_listings' }); renderArena(); }; nav.appendChild(b);
    });
    wrap.appendChild(nav);
    wrap.appendChild(el('div', 'cc-msg'));
    var body = el('div');
    if (arenaView === 'play') renderPlayPicker(body);
    else if (arenaView === 'decks') { if (builder.open) renderBuilder(body); else renderDeckList(body); }
    else if (arenaView === 'rules') renderRules(body);
    else if (arenaView === 'packs') renderPacks(body);
    else if (arenaView === 'fbay') renderFbay(body);
    else renderCollection(body);
    wrap.appendChild(body);
    r.appendChild(wrap);
  }

  function renderRules(body) {
    body.innerHTML =
      '<div class="cc-rules">' +
        '<div class="cc-rsec"><div class="cc-rh">Objective</div><p>Reduce the opposing House to 0 Solvency to liquidate it and win. Your own House also opens at 30 Solvency. If it reaches 0 first, you are liquidated.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">The Turn</div><p>Each turn you gain 1 Liquidity, refill to your current maximum, and draw 1 card. Liquidity tops out at 10. Spend it to deploy Assets and play Orders from your hand.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Assets</div><p>Assets are the units you deploy to the board, up to 7 at once. A freshly deployed Asset cannot attack the turn it arrives unless it has Charge or Rush. On your turn an Asset may attack an enemy Asset or strike the enemy House directly. It deals its Attack to the target, and the target deals its Attack back. An Asset is destroyed when its health reaches 0.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Orders</div><p>Orders are one-shot plays. They resolve at once and never sit on the board.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Battlecry and Deathrattle</div><p>Battlecry fires when an Asset is deployed. Deathrattle fires when an Asset is destroyed.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Keywords</div><dl class="cc-kw">' +
          '<dt>Taunt</dt><dd>Enemies must deal with this Asset before they can attack your other Assets or your House.</dd>' +
          '<dt>Charge</dt><dd>Can attack any target the turn it is deployed.</dd>' +
          '<dt>Rush</dt><dd>Can attack enemy Assets the turn it is deployed, but not the enemy House.</dd>' +
          '<dt>Divine Shield</dt><dd>The first hit it would take is voided, then the shield breaks.</dd>' +
          '<dt>Lifesteal</dt><dd>Damage it deals also restores that much Solvency to your House.</dd>' +
          '<dt>Poisonous</dt><dd>Any Asset it damages is destroyed outright.</dd>' +
          '<dt>Windfury</dt><dd>Can attack twice per turn.</dd>' +
        '</dl></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Decks</div><p>A deck holds 20 cards: up to 2 copies of a card, or a single copy of a Legendary. Build from one faction plus Neutral cards.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Fatigue</div><p>If your portfolio is empty and you still must draw, your House takes escalating Solvency damage on every draw. Decks do not run out quietly.</p></div>' +
        '<div class="cc-rsec"><div class="cc-rh">Factions</div><p>Coalition, Syndicate, Void Collective, Merchant Guild, Flesh Station, Dwarves, and Abaddon. Each leans on a different edge.</p></div>' +
      '</div>';
  }

  function openListDialog(cardId, variant) {
    var def = CARDS[cardId]; if (!def) return;
    var ov = el('div', 'cc-ovl');
    var box = el('div', 'cc-ovl-box');
    box.appendChild(el('div', 'cc-ovl-ttl', 'List ' + def.name + (variant === 'shiny' ? ' (shiny)' : '')));
    box.appendChild(el('div', 'cc-ovl-sub', 'Sell one copy on Ƒbay for Social Credits. Set any price.'));
    var row = el('div'); row.style.cssText = 'display:flex;gap:6px;align-items:center;margin:12px 0';
    var pf = el('span', null, 'Ƒ'); pf.style.cssText = 'color:#f0c84c;font-weight:700;font-size:1rem';
    var inp = document.createElement('input'); inp.type = 'number'; inp.min = '1'; inp.step = '1'; inp.placeholder = 'Price'; inp.className = 'cc-ovl-inp';
    row.appendChild(pf); row.appendChild(inp); box.appendChild(row);
    var btns = el('div'); btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    var cancel = el('button', 'cc-btn sm amber', 'Cancel'); cancel.onclick = function () { ov.remove(); };
    var list = el('button', 'cc-btn sm', 'List');
    list.onclick = function () { var p = Math.floor(Number(inp.value) || 0); if (!(p > 0)) { inp.focus(); return; } send({ type: 'tcg_list_card', card: cardId, variant: variant, price: p }); ov.remove(); };
    inp.onkeydown = function (e) { if (e.key === 'Enter') list.onclick(); };
    btns.appendChild(cancel); btns.appendChild(list); box.appendChild(btns);
    ov.appendChild(box); ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    document.body.appendChild(ov); inp.focus();
  }

  function renderFbay(body) {
    body.innerHTML = '';
    var intro = el('div'); intro.style.cssText = 'color:#5d6f6a;font-size:.76rem;margin:0 2px 12px';
    intro.innerHTML = 'Buy and sell Corpo-Cards for Social Credits. Cards come only from packs, and you can list yours at any price. To sell, open your <b style="color:#7df0a6">Collection</b> and click a card.';
    body.appendChild(intro);
    var myIds = {}; (state.myCardListings || []).forEach(function (L) { myIds[L.id] = 1; });
    if (state.myCardListings && state.myCardListings.length) {
      body.appendChild(el('div', 'cc-fb-h', 'Your listings'));
      var myg = el('div', 'cc-fb-grid');
      state.myCardListings.forEach(function (L) {
        if (!CARDS[L.card_id]) return;
        var cell = el('div', 'cc-fb-cell');
        cell.appendChild(cardEl(L.card_id, { shiny: L.variant === 'shiny' }));
        var ft = el('div', 'cc-fb-ft');
        ft.appendChild(el('span', 'cc-fb-price', fmtF(L.price)));
        var cancel = el('button', 'cc-btn sm amber', 'Cancel');
        cancel.onclick = function () { send({ type: 'tcg_cancel_card_listing', listing: L.id }); };
        ft.appendChild(cancel); cell.appendChild(ft); myg.appendChild(cell);
      });
      body.appendChild(myg);
    }
    body.appendChild(el('div', 'cc-fb-h', 'Market'));
    var listings = (state.cardListings || []).filter(function (L) { return !myIds[L.id] && CARDS[L.card_id]; });
    if (!listings.length) { body.appendChild(el('div', 'cc-empty', 'No cards listed by other players right now.')); return; }
    var g = el('div', 'cc-fb-grid');
    listings.forEach(function (L) {
      var cell = el('div', 'cc-fb-cell');
      cell.appendChild(cardEl(L.card_id, { shiny: L.variant === 'shiny' }));
      var ft = el('div', 'cc-fb-ft');
      ft.appendChild(el('span', 'cc-fb-price', fmtF(L.price)));
      var buy = el('button', 'cc-btn sm', 'Buy');
      buy.onclick = function () { send({ type: 'tcg_buy_card', listing: L.id }); };
      ft.appendChild(buy); cell.appendChild(ft);
      var sl = el('div', 'cc-fb-seller'); sl.textContent = L.seller_name || '\u2014'; cell.appendChild(sl);
      g.appendChild(cell);
    });
    body.appendChild(g);
  }

  function playableDecks() {
    var out = [];
    state.decks.forEach(function (dk) { if (dk.cards && dk.cards.length === D.DECK_SIZE) out.push({ kind: 'saved', name: dk.name, faction: dk.faction, cards: dk.cards }); });
    FAC.forEach(function (f) { var s = D.STARTER_DECKS[f]; if (s) out.push({ kind: 'starter', name: 'Starter: ' + f.charAt(0).toUpperCase() + f.slice(1), faction: f, cards: s.cards.slice() }); });
    return out;
  }
  function renderPlayPicker(body) {
    body.appendChild(el('div', null, '<div style="color:#5d6f6a;font-size:.76rem;margin:0 2px 10px">Pick a deck and play a match against the AI. Starter decks are always available; build your own in <b style="color:#7df0a6">Decks</b>.</div>'));
    var list = el('div', 'cc-decks');
    playableDecks().forEach(function (dk) {
      var row = el('div', 'cc-deckrow');
      var isStarter = dk.kind === 'starter';
      var av = isStarter ? { ok: true, missing: 0, listed: 0 } : deckAvailability(dk.cards);
      var sub = dk.faction + ' · ' + dk.cards.length + ' cards' + (isStarter ? ' · prebuilt' : (av.ok ? '' : ' · ' + av.missing + ' ' + availWord(av)));
      row.appendChild(el('div', 'dt', '<b>' + dk.name + '</b><small>' + sub + '</small>'));
      var play = el('button', 'cc-btn sm', 'Play ▶'); play.disabled = !av.ok; play.onclick = function () { startMatch(dk.cards, isStarter); }; row.appendChild(play);
      list.appendChild(row);
    });
    body.appendChild(list);
  }

  // ---- collection ----
  function renderCollection(body) {
    var owned = state.collection.slice();
    var tools = el('div', 'cc-tools');
    var fsel = el('select'); fsel.innerHTML = '<option value="">All factions</option>' + ['coalition', 'syndicate', 'void', 'guild', 'flesh', 'dwarves', 'abaddon', 'neutral'].map(function (f) { return '<option value="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</option>'; }).join('');
    var lab = el('label'); lab.style.cssText = 'color:#9cf;font-size:.74rem;display:flex;gap:4px;align-items:center;cursor:pointer'; lab.innerHTML = '<input type="checkbox"> Shiny only'; var shIn = lab.querySelector('input');
    var stat = el('div', 'cc-stat');
    tools.appendChild(fsel); tools.appendChild(lab); tools.appendChild(stat); body.appendChild(tools);
    var hint = el('div'); hint.style.cssText = 'color:#5d6f6a;font-size:.72rem;margin:0 2px 8px'; hint.textContent = 'Click a card to list it on Ƒbay.'; body.appendChild(hint);
    var grid = el('div', 'cc-grid'); body.appendChild(grid);
    function draw() {
      grid.innerHTML = '';
      var fac = fsel.value, shinyOnly = shIn.checked;
      var rows = owned.filter(function (r) { var def = CARDS[r.card_id]; if (!def) return false; if (fac && def.faction !== fac) return false; if (shinyOnly && r.variant !== 'shiny') return false; return true; });
      rows.sort(function (a, b) { var da = CARDS[a.card_id], db = CARDS[b.card_id]; return (da.cost - db.cost) || da.name.localeCompare(db.name) || (a.variant === 'shiny' ? 1 : -1); });
      var distinct = 0, total = 0, shiny = 0;
      if (!rows.length) grid.innerHTML = '<div class="cc-empty">No cards yet. Open a pack in the Store → Corpo-Cards.</div>';
      rows.forEach(function (r) { distinct++; total += r.qty; if (r.variant === 'shiny') shiny += r.qty; var c = cardEl(r.card_id, { shiny: r.variant === 'shiny', qty: r.qty }); c.classList.add('cc-click'); c.title = 'List on Ƒbay'; c.onclick = function () { openListDialog(r.card_id, r.variant); }; grid.appendChild(c); });
      stat.textContent = distinct + ' shown · ' + total + ' cards · ' + shiny + ' shiny';
    }
    fsel.onchange = draw; shIn.onchange = draw; draw();
  }

  // ---- decks: saved list ----
  function renderDeckList(body) {
    var head = el('div'); head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px';
    head.innerHTML = '<div style="color:#5d6f6a;font-size:.76rem;flex:1">Build decks from cards you own. Decks are saved to your account.</div>';
    var nb = el('button', 'cc-btn sm', '+ New Deck'); nb.onclick = function () { var slot = firstFreeSlot(); builder.open = true; builder.slot = slot; builder.deck = { name: 'Deck ' + (slot + 1), faction: 'syndicate', cards: [] }; renderArena(); }; head.appendChild(nb);
    body.appendChild(head);
    var list = el('div', 'cc-decks');
    if (!state.decks.length) list.appendChild(el('div', 'cc-empty', 'No saved decks. Make one with “+ New Deck”. (You need to own the cards you put in it. Open packs in the Store.)'));
    state.decks.forEach(function (dk) {
      var sized = dk.cards && dk.cards.length === D.DECK_SIZE;
      var av = sized ? deckAvailability(dk.cards) : { ok: true, missing: 0, listed: 0 };
      var valid = sized && av.ok;
      var reason = !sized ? ' · incomplete' : (!av.ok ? ' · ' + av.missing + ' ' + availWord(av) : '');
      var row = el('div', 'cc-deckrow');
      row.appendChild(el('div', 'dt', '<b>' + dk.name + '</b><small>' + dk.faction + ' · ' + (dk.cards ? dk.cards.length : 0) + '/' + D.DECK_SIZE + reason + '</small>'));
      var ed = el('button', 'cc-btn sm', 'Edit'); ed.onclick = function () { builder.open = true; builder.slot = dk.slot; builder.deck = { name: dk.name, faction: dk.faction, cards: dk.cards.slice() }; renderArena(); }; row.appendChild(ed);
      var pl = el('button', 'cc-btn sm', 'Play ▶'); pl.disabled = !valid; pl.onclick = function () { startMatch(dk.cards, false); }; row.appendChild(pl);
      var del = el('button', 'cc-btn sm red', '✕'); del.onclick = function () { send({ type: 'tcg_delete_deck', slot: dk.slot }); }; row.appendChild(del);
      list.appendChild(row);
    });
    body.appendChild(list);
  }
  function firstFreeSlot() { var used = {}; state.decks.forEach(function (d) { used[d.slot] = 1; }); for (var i = 0; i < 9; i++) if (!used[i]) return i; return 0; }

  // ---- builder (collection-gated) ----
  function renderBuilder(body) {
    var dk = builder.deck, own = ownedMap();
    // faction row
    var frow = el('div', 'cc-frow');
    FAC.forEach(function (f) {
      var b = el('button', 'cc-fbtn ' + f + (dk.faction === f ? ' sel' : ''), f.toUpperCase() + '<small>' + FAC_DESC[f] + '</small>');
      b.onclick = function () { if (dk.faction !== f) { dk.cards = dk.cards.filter(function (id) { return CARDS[id].faction === 'neutral'; }); dk.faction = f; } renderArena(); };
      frow.appendChild(b);
    });
    body.appendChild(frow);
    var main = el('div', 'cc-bmain');
    // pool (owned + legal)
    var pool = el('div', 'cc-pool'); pool.appendChild(el('div', 'cc-ph', 'YOUR CARDS (' + dk.faction.toUpperCase() + ' + NEUTRAL)'));
    var ids = D.legalPool(dk.faction, CARDS).filter(function (id) { return (own[id] || 0) > 0; }).sort(function (a, b) { var d1 = CARDS[a], d2 = CARDS[b]; return (d1.cost - d2.cost) || (d1.name < d2.name ? -1 : 1); });
    if (!ids.length) pool.appendChild(el('div', 'cc-empty', 'You own no ' + dk.faction + '/neutral cards yet. Open packs in the Store → Corpo-Cards.'));
    ids.forEach(function (id) {
      var have = dk.cards.filter(function (x) { return x === id; }).length;
      var rulesLeft = D.copiesAllowed(dk, id, CARDS);            // limit - have (faction/legend aware)
      var ownLeft = (own[id] || 0) - have;                        // can't add more than you own
      var canAdd = Math.min(rulesLeft, ownLeft);
      var c = cardEl(id, { badge: have ? have + '/' + (own[id]) : null });
      if (canAdd > 0) { c.classList.add('cc-click'); c.onclick = function () { dk.cards.push(id); renderArena(); }; }
      else c.classList.add('cc-full');
      pool.appendChild(c);
    });
    main.appendChild(pool);
    // deck column
    var col = el('div', 'cc-deckcol');
    var v = D.validateDeck(dk, CARDS);
    col.appendChild(el('div', 'cc-dhead', '<div class="cc-dcount' + (dk.cards.length === D.DECK_SIZE ? '' : ' bad') + '">' + dk.cards.length + '<small>/' + D.DECK_SIZE + '</small></div><div class="cc-valid ' + (v.ok ? 'ok' : 'bad') + '">' + (v.ok ? 'VALID' : 'INVALID') + '</div>'));
    col.appendChild(el('div', 'cc-errs', v.ok ? '' : v.errors.slice(0, 5).map(function (e) { return '• ' + e; }).join('<br>')));
    var bav = deckAvailability(dk.cards);
    if (bav.missing > 0) { var bw = availWord(bav); col.appendChild(el('div', null, '<div style="color:#f0a43c;font-size:10px;margin-top:2px;line-height:1.4">' + bav.missing + ' card' + (bav.missing > 1 ? 's' : '') + ' in this deck ' + (bav.missing > 1 ? 'are' : 'is') + ' ' + bw + (bw === 'listed' ? ' on Ƒbay. Unlist to play, or swap ' : '. Swap ') + (bav.missing > 1 ? 'them' : 'it') + ' out to play.</div>')); }
    // curve
    var st = D.deckStats(dk, CARDS), curve = el('div', 'cc-curve'); var max = 1; for (var k = 0; k <= 7; k++) max = Math.max(max, st.curve[k] || 0);
    for (var cc = 0; cc <= 7; cc++) { var n = st.curve[cc] || 0; var bar = el('div', 'bar'); bar.style.height = (8 + (n / max) * 34) + 'px'; bar.innerHTML = (n ? '<b>' + n + '</b>' : '') + '<span>' + (cc === 7 ? '7+' : cc) + '</span>'; curve.appendChild(bar); }
    col.appendChild(curve);
    col.appendChild(el('div', 'cc-ph', 'DECK'));
    var dl = el('div', 'cc-dlist');
    var counts = {}; dk.cards.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
    var uniq = Object.keys(counts).sort(function (a, b) { var d1 = CARDS[a], d2 = CARDS[b]; return (d1.cost - d2.cost) || (d1.name < d2.name ? -1 : 1); });
    if (!uniq.length) dl.innerHTML = '<div style="color:#5d6f6a;font-size:11px;font-style:italic">empty: add cards from the left</div>';
    uniq.forEach(function (id) {
      var r = el('div', 'cc-drow', '<span class="qc">' + counts[id] + 'x</span><span class="dc">' + CARDS[id].cost + '</span><span class="dn">' + CARDS[id].name + '</span><span class="rm">−</span>');
      r.onclick = function () { var i = dk.cards.lastIndexOf(id); if (i >= 0) dk.cards.splice(i, 1); renderArena(); };
      dl.appendChild(r);
    });
    col.appendChild(dl);
    // actions: name + save + cancel
    var act = el('div', 'cc-dact');
    var nameIn = el('input', 'cc-name'); nameIn.value = dk.name; nameIn.maxLength = 40; nameIn.oninput = function () { dk.name = nameIn.value; };
    act.appendChild(nameIn);
    var save = el('button', 'cc-btn sm', 'Save'); save.disabled = !v.ok; save.onclick = function () { builder.open = false; send({ type: 'tcg_save_deck', slot: builder.slot, deck: { name: dk.name || 'Deck', faction: dk.faction, cards: dk.cards } }); }; act.appendChild(save);
    var cancel = el('button', 'cc-btn sm amber', 'Cancel'); cancel.onclick = function () { builder.open = false; renderArena(); }; act.appendChild(cancel);
    col.appendChild(act);
    col.appendChild(el('div', null, '<div style="color:#5d6f6a;font-size:10px;margin-top:6px;line-height:1.5">20 cards, one faction + neutrals, max 2 of a card (1 for legendaries), and only cards you own. Same rules the server enforces.</div>'));
    main.appendChild(col);
    body.appendChild(main);
  }

  // =====================================================================  PLAY (PvE, engine client-side)
  var E = null, sel = null, logCursor = 0, aiFaction = null, lastDeck = null, lastDeckStarter = false;
  function startMatch(deckCards, isStarter) {
    if (!isStarter) { var avSt = deckAvailability(deckCards); if (!avSt.ok) { setMsg('That deck has ' + avSt.missing + ' card' + (avSt.missing > 1 ? 's' : '') + ' ' + availWord(avSt) + (avSt.listed >= avSt.missing ? ' on Ƒbay. Unlist to play.' : '. Unlist or replace to play.')); return; } }
    lastDeck = deckCards.slice(); lastDeckStarter = !!isStarter;
    aiFaction = FAC[(Math.random() * FAC.length) | 0];
    E = new Engine(CARDS, { seed: (Math.random() * 1e9) | 0 });
    E.setupGame([deckCards.slice(), D.STARTER_DECKS[aiFaction].cards.slice()]);
    sel = null; logCursor = 0;
    inMatch = true;
    buildTable();
    E.startTurn(0); flushLog(); renderTable();
  }
  function tref(id) { return document.getElementById(id); }
  function buildTable() {
    var r = arenaRoot(); if (!r) return;
    r.innerHTML = '';
    var w = el('div', 'cc-root'); w.style.cssText = 'padding:6px 10px;max-width:1040px;margin:0 auto';
    w.innerHTML =
      '<div class="cc-top"><div class="cc-ttl">Corpo-Cards<small>Match</small></div><button class="cc-btn sm amber" id="cc-leave">← Back</button></div>' +
      '<div class="cc-lane" id="cc-foeName">OPPONENT</div><div class="cc-hero" id="cc-foeHero"></div><div class="cc-board" id="cc-foeBoard"></div>' +
      '<div class="cc-mid"><div><div class="cc-hint" id="cc-hint">Your move.</div><div class="cc-banner" id="cc-banner"></div></div><div class="cc-log" id="cc-log"></div></div>' +
      '<div class="cc-board" id="cc-myBoard"></div><div class="cc-hero" id="cc-myHero"></div>' +
      '<div class="cc-lane">YOUR HAND</div><div class="cc-board" id="cc-myHand" style="border-style:solid"></div>' +
      '<div class="cc-controls"><button class="cc-btn" id="cc-endturn">End turn</button><button class="cc-btn amber sm" id="cc-rematch">Rematch</button><span id="cc-turnInfo" style="color:#5d6f6a;font-size:11px"></span></div>';
    r.appendChild(w);
    tref('cc-endturn').onclick = endTurn;
    tref('cc-rematch').onclick = function () { startMatch(lastDeck, lastDeckStarter); };
    tref('cc-leave').onclick = function () { inMatch = false; E = null; renderArena(); };
  }
  function legalCardTargets(eid) { var o = []; [E.players[1].hero, E.players[0].hero].forEach(function (h) { if (E.canPlay(0, eid, h.eid).ok) o.push(h.eid); }); E.players[0].board.concat(E.players[1].board).forEach(function (u) { if (E.canPlay(0, eid, u.eid).ok) o.push(u.eid); }); return o; }
  function legalAttackTargets(eid) { var o = []; if (E.canAttack(0, eid, E.players[1].hero.eid).ok) o.push(E.players[1].hero.eid); E.players[1].board.forEach(function (u) { if (E.canAttack(0, eid, u.eid).ok) o.push(u.eid); }); return o; }
  function clickHand(c) { if (E.winner !== null || E.active !== 0) return; if (c.def.cost > E.players[0].mana) return; if (!c.def.targeting) { E.playCard(0, c.eid); after(); return; } if (!legalCardTargets(c.eid).length) { setHint('No legal target for ' + c.def.name + '.'); return; } sel = { mode: 'cardTarget', eid: c.eid }; renderTable(); }
  function clickMyUnit(u) { if (E.winner !== null || E.active !== 0) return; if (sel && sel.mode === 'attack' && sel.eid === u.eid) { sel = null; renderTable(); return; } if (!legalAttackTargets(u.eid).length) return; sel = { mode: 'attack', eid: u.eid }; renderTable(); }
  function clickTarget(eid) { if (!sel) return; if (sel.mode === 'cardTarget') E.playCard(0, sel.eid, eid); else E.attack(0, sel.eid, eid); sel = null; after(); }
  function after() { flushLog(); renderTable(); }
  window.__ccCancel = function () { sel = null; renderTable(); };
  function endTurn() { if (E.winner !== null || E.active !== 0) return; sel = null; E.endTurn(); flushLog(); renderTable(); if (E.winner !== null) return; setHint('Opponent is acting…'); setTimeout(aiTurn, 550); }
  function aiTurn() { AI.takeTurn(E, 1); flushLog(); renderTable(); if (E.winner !== null) return; E.endTurn(); flushLog(); renderTable(); }
  function nameOf(eid) { for (var p = 0; p < 2; p++) { var b = E.players[p].board.concat(E.players[p].graveyard).find(function (x) { return x.eid === eid; }); if (b) return b.def.name; if (E.players[p].hero.eid === eid) return 'House'; } return '#' + eid; }
  function setHint(t) { var h = tref('cc-hint'); if (h) h.innerHTML = '<span>' + t + '</span>'; }
  function renderTable() {
    if (!E || !tref('cc-foeHero')) return;
    var v = E.view(0);
    var atkT = sel ? (sel.mode === 'attack' ? legalAttackTargets(sel.eid) : sel.mode === 'cardTarget' ? legalCardTargets(sel.eid) : []) : [];
    var fh = tref('cc-foeHero'); fh.className = 'cc-hero' + (atkT.indexOf(E.players[1].hero.eid) >= 0 ? ' cc-tgt' : '');
    fh.innerHTML = '<div class="cc-solv">' + v.foe.hero.health + '<span class="lab">SOLVENCY</span></div><div class="cc-meta">Liquidity ' + v.foe.mana + '/' + v.foe.maxMana + '<br>Hand ' + v.foe.handCount + ' · Portfolio ' + v.foe.deckCount + '</div>';
    fh.onclick = function () { clickTarget(E.players[1].hero.eid); };
    var fb = tref('cc-foeBoard'); fb.innerHTML = ''; E.players[1].board.forEach(function (u) { var c = cardEl(u, { live: true, mini: true }); if (atkT.indexOf(u.eid) >= 0) { c.classList.add('cc-tgt'); c.onclick = function () { clickTarget(u.eid); }; } fb.appendChild(c); });
    if (!E.players[1].board.length) fb.innerHTML = '<span style="color:#5d6f6a;font-size:11px">no enemy Assets</span>';
    var mb = tref('cc-myBoard'); mb.innerHTML = ''; E.players[0].board.forEach(function (u) { var c = cardEl(u, { live: true, mini: true }); var cv = v.you.board.find(function (x) { return x.eid === u.eid; }); if (cv && cv.canAttack) c.classList.add('cc-canatk'); if (sel && sel.mode === 'attack' && sel.eid === u.eid) c.classList.add('cc-sel'); if (atkT.indexOf(u.eid) >= 0) { c.classList.add('cc-tgt'); c.onclick = function () { clickTarget(u.eid); }; } else c.onclick = function () { clickMyUnit(u); }; mb.appendChild(c); });
    if (!E.players[0].board.length) mb.innerHTML = '<span style="color:#5d6f6a;font-size:11px">no Assets deployed</span>';
    var mh = tref('cc-myHero'); mh.className = 'cc-hero' + (atkT.indexOf(E.players[0].hero.eid) >= 0 ? ' cc-tgt' : ''); mh.innerHTML = '<div class="cc-solv">' + v.you.hero.health + '<span class="lab">SOLVENCY</span></div><div class="cc-meta">Liquidity ' + v.you.mana + '/' + v.you.maxMana + '<br>Portfolio ' + v.you.deckCount + '</div>';
    mh.onclick = function () { if (atkT.indexOf(E.players[0].hero.eid) >= 0) clickTarget(E.players[0].hero.eid); };
    var hd = tref('cc-myHand'); hd.innerHTML = ''; E.players[0].hand.forEach(function (c) { var x = cardEl(c); var aff = c.def.cost <= E.players[0].mana && E.active === 0 && E.winner === null; if (aff && (c.def.type !== 'unit' || E.players[0].board.length < 7)) x.classList.add('cc-playable'); if (sel && sel.mode === 'cardTarget' && sel.eid === c.eid) x.classList.add('cc-sel'); x.classList.add('cc-click'); x.onclick = function () { clickHand(c); }; hd.appendChild(x); });
    if (!E.players[0].hand.length) hd.innerHTML = '<span style="color:#5d6f6a;font-size:11px">empty hand</span>';
    if (E.winner !== null) { var b = tref('cc-banner'); b.className = 'cc-banner on ' + (E.winner === 0 ? 'win' : 'lose'); b.textContent = E.winner === 0 ? 'VICTORY: opponent liquidated' : E.winner === 1 ? 'DEFEAT: your House is insolvent' : 'DRAW'; setHint('Game over. Rematch, or go Back to your decks.'); }
    else if (sel && sel.mode === 'cardTarget') { setHint('Select a target. <button class="cc-btn sm" onclick="window.__ccCancel()">Cancel</button>'); }
    else if (sel && sel.mode === 'attack') { setHint('Select an enemy to attack. <button class="cc-btn sm" onclick="window.__ccCancel()">Cancel</button>'); }
    else if (E.active === 0) { setHint('Your move. Play a card, attack with a glowing Asset, or end turn.'); }
    tref('cc-endturn').disabled = (E.active !== 0 || E.winner !== null);
    tref('cc-turnInfo').textContent = 'Turn ' + E.turnNumber + (E.active === 0 ? ' (you)' : ' (opponent)') + ' · vs ' + aiFaction.toUpperCase();
    tref('cc-foeName').textContent = 'OPPONENT (AI: ' + aiFaction.toUpperCase() + ' starter)';
  }
  function flushLog() {
    var box = tref('cc-log'); if (!box) return;
    for (var i = logCursor; i < E.log.length; i++) {
      var ev = E.log[i], line = null, cls = '';
      switch (ev.type) {
        case 'TURN_START': line = 'Turn ' + ev.turn + ' : Player ' + ev.player; cls = 'turn'; break;
        case 'CARD_PLAYED': line = (ev.player === 0 ? 'You' : 'AI') + ' play ' + CARDS[ev.defId].name; cls = 'play'; break;
        case 'ATTACK_DECLARED': line = nameOf(ev.attacker) + ' → ' + nameOf(ev.defender); cls = 'atk'; break;
        case 'UNIT_SUMMONED': if (CARDS[ev.defId] && CARDS[ev.defId].token) { line = '  + ' + CARDS[ev.defId].name + ' token'; } break;
        case 'UNIT_DIED': line = '  x ' + CARDS[ev.defId].name + ' dies'; cls = 'die'; break;
        case 'DAMAGE_DEALT': if (ev.targetKind === 'hero') { line = '  ' + ev.amount + ' to P' + ev.owner + ' House'; cls = 'dmg'; } break;
        case 'HEALED': if (ev.amount) { line = '  +' + ev.amount + ' healed'; } break;
        case 'FATIGUE': line = '  fatigue ' + ev.amount + ' to P' + ev.player; cls = 'dmg'; break;
        case 'GAME_OVER': line = '>>> ' + (ev.winner === 'draw' ? 'DRAW' : 'Player ' + ev.winner + ' wins'); cls = 'turn'; break;
      }
      if (line) { var d = el('div', 'e ' + cls); d.textContent = line; box.appendChild(d); }
    }
    logCursor = E.log.length; box.scrollTop = box.scrollHeight;
  }

  // =====================================================================  entry
  window.tcgTabLoad = function () {
    injectCSS(); activeMount = 'arena';
    var r = arenaRoot(); if (r && !r.dataset.ccInit) { r.dataset.ccInit = '1'; r.innerHTML = '<div class="cc-root" style="padding:10px"><div class="cc-empty">Loading Corpo-Cards…</div></div>'; }
    ensureDeps(function () { if (!inMatch) renderArena(); send({ type: 'tcg_collection' }); send({ type: 'tcg_card_listings' }); });
  };

  if (window.ws && window.ws.addEventListener) window.ws.addEventListener('message', onMsg);
})();
