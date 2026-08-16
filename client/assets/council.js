/* ═══════════════════════════════════════════════════════════════════════════
   COUNCIL CHAMBER, client (1.4.0.0)

   Lives on the Galactic tab rather than the top nav on purpose. The chamber
   operates entirely on colony_state, so it belongs beside the map it moves, and
   the top strip is already twelve tabs against a five slot mobile nav.

   THE ONE RULE THIS FILE EXISTS TO ENFORCE. A bonded clause and a rider must
   never look alike. Bonded renders green, is typed, and the server holds the
   credits behind it. A rider renders amber, is stamped UNBONDED, and the server
   will never act on it. Every place an Accord is drawn, both the composer and
   the signature panel say which is which in words, not just colour, because a
   colourblind player signing a rider they believed was bonded is the exact
   failure that kills the guarantee for everyone.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // PALETTE. The first pass reused the galaxy panel greys (#555 body text on
  // #07070e) and read as switched off. The chamber is the one room in the game
  // where players read long text carefully, so body copy sits at #d6dde6 and
  // #555 is reserved for true metadata like timestamps. Faction colour carries
  // the structure instead of borders doing all the work.
  var CO = {
    bonded: '#42ff7e', rider: '#f0b454', gold:  '#ffce4d', bad: '#ff6a6a',
    text:   '#d6dde6', mute:  '#a8b4c4', dim:   '#5d6878',
    line:   '#1d2634', panel: '#0b1018', deep:  '#060a10'
  };
  // ONE FACTION PALETTE FOR THE WHOLE CHAMBER. These match the server chat colour
  // chain exactly: a delegate whose chair burns one colour in the room and another
  // in chat is telling two stories. Jade has an allegiance but no chair and no
  // seeded colonies, so it colours a speaker and appears nowhere else here.
  var FACTION_COLOR = { coalition:'#4ecdc4', syndicate:'#ff2e63', void:'#c77dff',
                        guild:'#42ff7e', jade:'#e8e4d8', fleshstation:'#ffce4d' };
  // Derived rather than restated. Two tables holding the same four hex values is
  // two tables that will eventually disagree.
  var SEAT_COLOR = { coalition: FACTION_COLOR.coalition, syndicate: FACTION_COLOR.syndicate,
                     void: FACTION_COLOR.void, guild: FACTION_COLOR.guild };
  var SEAT_ORDER = ['coalition','syndicate','void','guild'];

  var st = { seats: [], accords: [], colonies: [], log: [], mySeat: null, isGM: false,
             cfg: null, loaded: false,
             // Chamber rooms. `active` is which pane the player is reading.
             active: 'gallery', rooms: {}, canPost: {}, gmRegents: null, gmVoices: null, proprietor: null,
             myFaction: null, typing: {}, gmAsSeat: null, treasury: null };

  function tok(){ return window.__fmToken || window.FM_TOKEN || localStorage.getItem('fm_token') || ''; }
  function api(){ return location.origin; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function fm(n){ return 'Ƒ' + Math.floor(Number(n)||0).toLocaleString(); }
  function toast(m, c){ if(window.gToast) window.gToast(m, c||CO.gold);
                        else if(window.toast) window.toast(m); else console.log(m); }

  // Colony display name. galaxy.js is IIFE wrapped, so its COLONY_META table is
  // NOT reachable from this file and there is no point pretending otherwise. The
  // authoritative id list arrives from the server in the council state payload;
  // the label is derived from the id. If a friendlier name table is ever exposed
  // globally, read it here first and this falls through unchanged.
  function colonyName(id){
    return String(id||'').replace(/_/g,' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
  }
  function colonyOptions(sel){
    if (!st.colonies.length) return '<option value="">no colonies loaded</option>';
    return st.colonies.map(function(c){
      return '<option value="'+esc(c.id)+'"'+(c.id===sel?' selected':'')+'>'
           + esc(colonyName(c.id)) + ' (' + esc(c.faction) + ')</option>';
    }).join('');
  }

  function timeLeft(ms){
    var d = ms - Date.now();
    if (d <= 0) return 'expired';
    var h = Math.floor(d/3600000), m = Math.ceil((d%3600000)/60000);
    return h > 0 ? (h+'h '+m+'m') : (m+'m');
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  function load(cb){
    fetch(api()+'/api/council/state', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: tok() })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) return;
      st.seats = d.seats||[]; st.accords = d.accords||[]; st.log = d.log||[];
      st.colonies = d.colonies||[];
      st.mySeat = d.mySeat||null; st.isGM = !!d.isGM; st.cfg = d.cfg||null; st.loaded = true;
      st.myFaction = d.myFaction || null;
      render(); if (cb) cb();
    }).catch(function(){});
  }

  function post(path, body, ok){
    body = body || {}; body.token = tok();
    fetch(api()+path, { method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify(body) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || !d.ok) { toast((d && (d.msg || d.error)) || 'Refused by the chamber.', CO.bad); return; }
        if (ok) ok(d);
        load();
      }).catch(function(){ toast('Chamber unreachable.', CO.bad); });
  }

  // ── The chamber itself ─────────────────────────────────────────────────────
  // Drawn rather than imported: an SVG scales to any pane width, themes with the
  // rest of the client, costs no request, and can be driven by live seat state.
  // An occupied chair burns at full faction colour with a glow; a regent held
  // chair is a dashed outline. Reading who is actually in the room is then a
  // glance instead of four label lookups.
  function renderChamber(){
    var W = 900, H = 260;
    // Chairs sit on a single arc facing the viewer, labels directly beneath each,
    // and the table is a FOREGROUND arc drawn below all of it. The first pass put
    // the two inner chairs over the table and their name plates landed on top of
    // the tabletop, which is why the geometry is separated by band here: chairs
    // 84 to 190, plates 190 to 226, table 214 down. Nothing overlaps by accident.
    var seatX = { coalition:118, syndicate:372, void:528, guild:782 };
    var seatY = { coalition:128, syndicate:128, void:128, guild:128 };
    // Short names on the graphic. The full labels collided: "THE VOID COLLECTIVE"
    // is 19 characters and the two inner chairs are 156px apart, so at plate size
    // the middle two plates ran into each other. The roster below carries the
    // long names; the chamber only needs to be legible at a glance.
    var SHORT = { coalition:'COALITION', syndicate:'SYNDICATE', void:'THE VOID', guild:'M. GUILD' };

    var defs = '';
    SEAT_ORDER.forEach(function(id){
      var c = SEAT_COLOR[id];
      defs += '<filter id="cgl-'+id+'" x="-120%" y="-120%" width="340%" height="340%">'
           +  '<feGaussianBlur stdDeviation="6" result="b"/>'
           +  '<feFlood flood-color="'+c+'" flood-opacity="0.9" result="f"/>'
           +  '<feComposite in="f" in2="b" operator="in" result="g"/>'
           +  '<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    });

    var h = '<div style="border:1px solid '+CO.line+';background:'+CO.deep+';margin-bottom:14px;overflow:hidden">';
    h += '<svg viewBox="0 0 '+W+' '+H+'" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block;max-height:262px">';
    h += '<defs>' + defs
      +  '<radialGradient id="cgFloor" cx="50%" cy="26%" r="78%">'
      +  '<stop offset="0%" stop-color="#123449" stop-opacity="0.8"/>'
      +  '<stop offset="55%" stop-color="#08141e" stop-opacity="0.75"/>'
      +  '<stop offset="100%" stop-color="#04070b" stop-opacity="1"/></radialGradient>'
      +  '<linearGradient id="cgTable" x1="0" y1="0" x2="0" y2="1">'
      +  '<stop offset="0%" stop-color="#20344a"/><stop offset="55%" stop-color="#0d1926"/>'
      +  '<stop offset="100%" stop-color="#060b12"/></linearGradient></defs>';

    h += '<rect width="'+W+'" height="'+H+'" fill="url(#cgFloor)"/>';

    // Tiered public gallery. The spectators are the point of the room, so they
    // get drawn rather than implied.
    for (var t = 0; t < 3; t++) {
      h += '<ellipse cx="450" cy="'+(46 - t*16)+'" rx="'+(414 - t*52)+'" ry="'+(30 + t*13)+'" '
         + 'fill="none" stroke="#2f6e8e" stroke-opacity="'+(0.2 - t*0.05).toFixed(2)+'" stroke-width="7"/>';
    }
    for (var g = 0; g < 38; g++) {
      var ga = Math.PI * (0.05 + (g / 37) * 0.9);
      var gx = 450 - Math.cos(ga) * 352, gy = 50 - Math.sin(ga) * 24;
      h += '<circle cx="'+gx.toFixed(1)+'" cy="'+gy.toFixed(1)+'" r="2.3" fill="#5b93b0" opacity="'+(0.14 + (g % 4) * 0.06).toFixed(2)+'"/>';
    }

    // Chairs.
    SEAT_ORDER.forEach(function(id){
      var v = null; st.seats.forEach(function(x){ if (x.seat === id) v = x; });
      if (!v) return;
      var x = seatX[id], y = seatY[id], c = SEAT_COLOR[id];
      var occupied = !v.regent, mine = st.mySeat === id;

      h += '<g style="cursor:pointer" onclick="window.__councilFocusSeat(\''+id+'\')">';
      // High backed chair behind the delegate marker.
      h += '<path d="M '+(x-33)+' '+(y+30)+' L '+(x-33)+' '+(y-14)+' Q '+x+' '+(y-45)+' '+(x+33)+' '+(y-14)
         + ' L '+(x+33)+' '+(y+30)+' Z" fill="'+c+'" fill-opacity="'+(occupied?0.13:0.05)+'" '
         + 'stroke="'+c+'" stroke-opacity="'+(occupied?0.45:0.2)+'" stroke-width="1"/>';

      // The delegate's face, clipped to the chair disc. A regent uses an assigned
      // portrait from the same set players pick from, so nothing in the room
      // reads as "this one is furniture".
      var src = portraitSrc(v.portrait);
      var R = 25;
      // PORTRAIT FRAMING. The source art is 393x397 with the head occupying
      // roughly the middle of the upper two thirds, centred near (50%, 37%). Drawn
      // at 1:1 into a 50px disc that reads as a shoulders-and-background shot with
      // a tiny face in it. Scaling to 1.55x and anchoring that 37% point at the
      // centre of the circle crops to the head, which is the only part worth
      // showing at this size.
      var PS = 1.55, PW = R * 2 * PS;
      if (src) {
        h += '<clipPath id="cclip-'+id+'"><circle cx="'+x+'" cy="'+y+'" r="'+R+'"/></clipPath>';
        h += '<circle cx="'+x+'" cy="'+y+'" r="'+(R+4)+'" fill="'+c+'" opacity="'+(occupied?0.16:0.06)+'"/>';
        // The glow goes on the RING, never on the image. Applying the blur filter
        // to the portrait itself smears the face, which defeats the entire point
        // of putting a face there.
        if (occupied) h += '<circle cx="'+x+'" cy="'+y+'" r="'+R+'" fill="none" stroke="'+c+'" '
           + 'stroke-width="2.5" filter="url(#cgl-'+id+')"/>';
        h += '<image href="'+esc(src)+'" xlink:href="'+esc(src)+'" '
           + 'x="'+(x - PW/2).toFixed(1)+'" y="'+(y - PW*0.37).toFixed(1)+'" '
           + 'width="'+PW.toFixed(1)+'" height="'+PW.toFixed(1)+'" preserveAspectRatio="xMidYMid slice" '
           + 'clip-path="url(#cclip-'+id+')" opacity="'+(occupied?1:0.55)+'"/>';
        h += '<circle cx="'+x+'" cy="'+y+'" r="'+R+'" fill="none" stroke="'+c+'" '
           + 'stroke-opacity="'+(occupied?1:0.5)+'" stroke-width="'+(occupied?2:1.4)+'"'
           + (occupied ? '' : ' stroke-dasharray="3.5 4"') + '/>';
      } else if (occupied) {
        h += '<circle cx="'+x+'" cy="'+y+'" r="13" fill="'+c+'" opacity="0.95" filter="url(#cgl-'+id+')"/>';
      } else {
        h += '<circle cx="'+x+'" cy="'+y+'" r="13" fill="none" stroke="'+c+'" stroke-opacity="0.45" '
           + 'stroke-width="1.4" stroke-dasharray="3.5 4"/>';
      }
      if (mine) h += '<circle cx="'+x+'" cy="'+y+'" r="'+(R+7)+'" fill="none" stroke="'+c+'" stroke-width="1" stroke-opacity="0.8"/>';

      // Faction sigils are DRAWN, not typed. The glyph set in the rest of the
      // client (diamond, lozenge, hexagon) falls back to a tofu box in any font
      // that lacks it, and a chamber with four boxes in it is worse than none.
      // Sigil moved off the face and onto a corner badge once portraits landed.
      var sx = x + 19, sy = y + 18;
      h += '<circle cx="'+sx+'" cy="'+sy+'" r="8" fill="#04070b" stroke="'+c+'" stroke-opacity="0.85" stroke-width="1"/>';
      var sig = '';
      if (id === 'coalition')      sig = '<rect x="'+(sx-3.2)+'" y="'+(sy-3.2)+'" width="6.4" height="6.4" transform="rotate(45 '+sx+' '+sy+')"';
      else if (id === 'syndicate') sig = '<rect x="'+(sx-4)+'" y="'+(sy-2.2)+'" width="8" height="4.4" transform="rotate(45 '+sx+' '+sy+')"';
      else if (id === 'void')      sig = '<circle cx="'+sx+'" cy="'+sy+'" r="3.4"';
      else                         sig = '<polygon points="'+[[sx,sy-4],[sx+3.5,sy-2],[sx+3.5,sy+2],[sx,sy+4],[sx-3.5,sy+2],[sx-3.5,sy-2]].map(function(q){return q[0].toFixed(1)+','+q[1].toFixed(1);}).join(' ')+'"';
      h += sig + ' fill="'+c+'" fill-opacity="'+(occupied ? 1 : 0.5)+'"/>';

      // Name plates. Same band for every chair regardless of chair height, so the
      // four read as a row instead of a staircase.
      h += '<text x="'+x+'" y="184" text-anchor="middle" font-size="10.5" font-family="monospace" '
        +  'letter-spacing="1.9" fill="'+c+'" fill-opacity="'+(occupied ? 0.95 : 0.48)+'">'
        +  esc(SHORT[id] || v.label.toUpperCase()) + '</text>';
      h += '<text x="'+x+'" y="200" text-anchor="middle" font-size="10.5" font-family="monospace" '
        +  'fill="'+(occupied ? CO.text : CO.dim)+'">' + esc(trunc(v.holderName, 20)) + '</text>';
      h += '<line x1="'+x+'" y1="'+(y+32)+'" x2="'+x+'" y2="174" stroke="'+c+'" stroke-opacity="0.2" stroke-width="1"/>';
      h += '</g>';
    });

    // Foreground table. Its arc peaks at y=214, which is BELOW the lowest name
    // plate at y=200. The first cut peaked at 196 and swallowed the middle two
    // plates, which is what made them look like they were lying on the tabletop.
    h += '<path d="M 70 290 A 380 76 0 0 1 830 290 Z" fill="url(#cgTable)" stroke="none"/>';
    h += '<path d="M 70 290 A 380 76 0 0 1 830 290" fill="none" stroke="#4a7ea3" stroke-opacity="0.6" stroke-width="1.5"/>';
    h += '<path d="M 168 290 A 288 46 0 0 1 732 290" fill="none" stroke="#25415a" stroke-opacity="0.75" stroke-width="1"/>';
    h += '<text x="450" y="252" text-anchor="middle" font-size="9" font-family="monospace" letter-spacing="3.6" '
      +  'fill="'+CO.gold+'" fill-opacity="0.5">EVERYTHING SAID HERE IS ON THE RECORD</text>';

    // Scanlines, so the graphic sits inside the CRT rather than on top of it.
    for (var y2 = 0; y2 < H; y2 += 3) {
      h += '<rect x="0" y="'+y2+'" width="'+W+'" height="1" fill="#000" opacity="0.16"/>';
    }
    h += '</svg></div>';
    return h;
  }

  // Portrait ids are sanitised the same way codec.js and player-profile.js do it,
  // because the id reaches an src attribute and it arrives over the wire.
  //
  // THREE SHAPES, matching codec.js:103 so the same id renders identically in
  // both places:
  //   data:...      used as is
  //   item:<id>     the client item catalog, a data URI. Mr. Flesh IS one of
  //                 these: his portrait is the Preserved Brain item art rather
  //                 than a file in the portraits directory.
  //   bare stem     the portraits directory
  function portraitSrc(id){
    var sid = String(id || '');
    if (!sid) return null;
    if (/^data:/.test(sid)) return sid;
    var m = /^item:(.+)$/.exec(sid);
    if (m) { var it = (window.ITEM_CATALOG_CLIENT || {})[m[1]]; return (it && it.img) || null; }
    var clean = sid.replace(/[^a-z0-9_]/gi, '');
    return clean ? ('assets/portraits/' + clean + '.png') : null;
  }

  // Item art is low res pixel sprites. Upscaling them smoothly turns a brain in a
  // jar into a smear, so they get nearest-neighbour. Portraits-dir images are
  // full res and are left alone.
  function isPixelArt(id){ return /^item:/.test(String(id || '')); }
  function portraitStyle(id){
    return isPixelArt(id) ? 'image-rendering:pixelated;image-rendering:crisp-edges;' : '';
  }

  // ITEM_CATALOG_CLIENT lives in the lazy-loaded inventory.js. If a post needs it
  // and it is not loaded, pull it in and re-render once. Guarded by a flag so a
  // room full of Mr. Flesh lines does not queue a load per message.
  var _itemArtPending = false;
  function ensureItemArt(){
    if (window.ITEM_CATALOG_CLIENT || _itemArtPending || !window.lazyLoad) return;
    _itemArtPending = true;
    window.lazyLoad('assets/inventory.js', function(){ renderRooms(); renderTreasury(); });
  }

  function trunc(v, n){ v = String(v||''); return v.length > n ? v.slice(0, n-1) + '\u2026' : v; }

  window.__councilFocusSeat = function(id){
    var el = document.getElementById('cseat-' + id);
    if (el) { el.scrollIntoView({ behavior:'smooth', block:'center' });
              el.style.transition = 'box-shadow .25s';
              el.style.boxShadow = '0 0 0 1px ' + (SEAT_COLOR[id]||CO.gold);
              setTimeout(function(){ el.style.boxShadow = 'none'; }, 1400); }
  };

  // ── Seat roster ────────────────────────────────────────────────────────────
  function renderSeats(){
    var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:9px;margin-bottom:15px">';
    st.seats.forEach(function(v){
      var col = SEAT_COLOR[v.seat] || CO.gold;
      var mine = st.mySeat === v.seat;
      var protectedNow = v.termEndsAt && v.termEndsAt > Date.now();

      h += '<div id="cseat-'+v.seat+'" style="border:1px solid '+(mine?col:CO.line)+';border-left:3px solid '+col+';'
         + 'background:'+CO.panel+';padding:12px 13px">';

      // Face and identity on one row. The portrait is the fastest read on the
      // card, so it leads.
      if (isPixelArt(v.portrait)) ensureItemArt();
      var psrc = portraitSrc(v.portrait);
      h += '<div style="display:flex;gap:11px;align-items:flex-start">';
      if (psrc) {
        h += '<div style="flex:0 0 auto;width:52px;height:52px;border-radius:50%;overflow:hidden;'
           + 'border:2px solid '+col+(v.regent?'55':'');
        h += ';background:#04070b">';
        h += '<img src="'+esc(psrc)+'" alt="" style="'+portraitStyle(v.portrait)+'width:100%;height:100%;object-fit:cover;display:block;'
           + 'opacity:'+(v.regent?'0.62':'1')+'"/>';
        h += '</div>';
      }
      h += '<div style="min-width:0;flex:1">';
      h += '<div style="font-size:.62rem;letter-spacing:.15em;color:'+col+';text-transform:uppercase">'+esc(v.label)+'</div>';
      h += '<div style="font-size:.98rem;color:'+(v.regent?CO.mute:CO.text)+';margin-top:5px;font-weight:'+(v.regent?500:700)+';line-height:1.25">'+esc(v.holderName)+'</div>';

      if (v.regent) {
        h += '<div style="font-size:.62rem;color:'+CO.mute+';letter-spacing:.1em;margin-top:4px">VACANT, HELD IN REGENCY</div>';
      } else if (protectedNow) {
        h += '<div style="font-size:.62rem;color:'+CO.gold+';letter-spacing:.08em;margin-top:4px">SEATED, PROTECTED '+timeLeft(v.termEndsAt)+'</div>';
      } else {
        h += '<div style="font-size:.62rem;color:'+CO.bad+';letter-spacing:.08em;margin-top:4px">TERM LAPSED, CONTESTABLE</div>';
      }
      if (mine) h += '<div style="font-size:.62rem;color:'+col+';letter-spacing:.12em;margin-top:4px">&#9679; YOUR CHAIR</div>';
      h += '</div></div>';

      if (v.title) {
        h += '<div style="margin-top:10px;font-size:.72rem;color:'+CO.text+';line-height:1.6">'
           + '<span style="color:'+CO.mute+'">Held by title</span><br><span style="color:'+col+'">'+esc(v.title)+'</span></div>';
      }
      if (v.note) h += '<div style="font-size:.72rem;color:'+CO.mute+';margin-top:8px;line-height:1.65">'+esc(v.note)+'</div>';

      // EVERY chair is bought as a Legendary title in the Title Market, including
      // these two. Selling them here as well would put offices in two shops. One
      // rack, one place, one mental model: the title IS the chair. This is a
      // signpost, not a second checkout.
      if (v.purchasable && !mine) {
        h += '<div onclick="window.__councilToStore()" '
           + 'style="margin-top:10px;text-align:center;font-size:.7rem;letter-spacing:.09em;padding:8px;'
           + 'border:1px solid '+col+'66;color:'+col+';background:rgba(255,255,255,0.03);cursor:pointer">'
           + (protectedNow ? 'PROTECTED, ' : '') + fm(v.cost) + ' IN TITLE MARKET &rarr;</div>';
      }
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  // ── Accord rendering ───────────────────────────────────────────────────────
  function clauseLine(c){
    return '<div style="font-size:.76rem;color:'+CO.bonded+';padding:5px 0;line-height:1.6">'
         + '&#9679; Fund <b>'+esc(c.factionId)+'</b> on <b>'+esc(colonyName(c.colonyId))+'</b> with '+fm(c.amount)
         + (c.executed && c.result ? ' <span style="color:'+CO.dim+'">('+esc(c.result)+')</span>' : '')
         + '</div>';
  }

  function sideBlock(seat, label, clauses){
    var col = SEAT_COLOR[seat] || CO.gold;
    var h = '<div style="flex:1;min-width:200px">';
    h += '<div style="font-size:.64rem;letter-spacing:.13em;color:'+col+';text-transform:uppercase;margin-bottom:6px">'+esc(label)+' DELIVERS</div>';
    if (!clauses.length) h += '<div style="font-size:.66rem;color:'+CO.dim+'">Nothing bonded on this side.</div>';
    else clauses.forEach(function(c){ h += clauseLine(c); });
    h += '</div>';
    return h;
  }

  function statusChip(a){
    var m = { open:['OPEN', CO.gold], executed:['EXECUTED', CO.bonded],
              pending:['SIGNED, COUNTING DOWN', CO.bad],
              cancelled:['PULLED', CO.mute],
              declined:['REFUSED', CO.bad], withdrawn:['WITHDRAWN', CO.dim],
              expired:['EXPIRED', CO.dim] }[a.status] || [a.status.toUpperCase(), CO.dim];
    return '<span style="font-size:.6rem;letter-spacing:.12em;color:'+m[1]+';border:1px solid '+m[1]+'44;padding:2px 6px">'+m[0]+'</span>';
  }

  function renderAccord(a){
    var pc = SEAT_COLOR[a.proposerSeat] || CO.gold;
    var cc = SEAT_COLOR[a.counterSeat] || CO.gold;
    var open = a.status === 'open';
    var pending = a.status === 'pending';
    var h = '<div style="border:1px solid '+(open?CO.line:'#131320')+';background:'+CO.panel+';margin-bottom:9px;padding:11px 12px">';

    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">';
    h += '<div style="flex:1;min-width:200px">';
    h += '<div style="font-size:.9rem;color:'+CO.text+';line-height:1.4;font-weight:700">'+esc(a.title)+'</div>';
    h += '<div style="font-size:.7rem;color:'+CO.mute+';margin-top:5px;letter-spacing:.04em">'
       + '<span style="color:'+pc+'">'+esc(a.proposerSeat)+'</span> ('+esc(a.proposerName)+') &rarr; '
       + '<span style="color:'+cc+'">'+esc(a.counterSeat)+'</span> &nbsp;&middot;&nbsp; '+esc(a.id)
       + (open ? ' &middot; expires in '+timeLeft(a.expiresAt) : '')
       + (pending ? ' &middot; <span style="color:'+CO.bad+'">executes in '+timeLeft(a.executesAt)+'</span>' : '')
       + '</div></div>';
    h += '<div>'+statusChip(a)+'</div>';
    h += '</div>';

    h += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px solid #12121e">';
    h += sideBlock(a.proposerSeat, a.proposerSeat, a.bonded.proposer);
    h += sideBlock(a.counterSeat,  a.counterSeat,  a.bonded.counter);
    h += '</div>';

    if (a.rider) {
      h += '<div style="margin-top:9px;border-left:2px solid '+CO.rider+';background:#160f04;padding:7px 10px">';
      h += '<div style="font-size:.64rem;letter-spacing:.14em;color:'+CO.rider+';margin-bottom:3px">&#9888; RIDER, UNBONDED</div>';
      h += '<div style="font-size:.78rem;color:#e8c88c;line-height:1.65;white-space:pre-wrap">'+esc(a.rider)+'</div>';
      h += '<div style="font-size:.68rem;color:'+CO.mute+';margin-top:7px;line-height:1.6">The Guild holds nothing against this. It is a stated intention. Break it and the only thing you lose is your name, which is the entire reason anyone writes one.</div>';
      h += '</div>';
    }

    if (pending) {
      h += '<div style="margin-top:10px;border-left:2px solid '+CO.bad+';background:#1a0808;padding:9px 11px">';
      h += '<div style="font-size:.62rem;letter-spacing:.13em;color:'+CO.bad+';margin-bottom:4px">&#9888; SIGNED, NOT YET BINDING</div>';
      h += '<div style="font-size:.74rem;color:'+CO.text+';line-height:1.65">'
         + 'This commits treasury funds to ground that will not be '
         + esc(a.ceding.join(' or ')) + '&#39;s. It executes in <b>'+timeLeft(a.executesAt)+'</b>.'
         + '</div>';
      h += '<div style="font-size:.68rem;color:'+CO.mute+';line-height:1.6;margin-top:6px">'
         + 'Any seated leader of a ceding faction can pull it before the window closes. '
         + 'If their term has lapsed, so can whoever takes the chair off them.'
         + '</div>';
      if (a.canCancel) {
        h += '<div onclick="window.__councilCancel(\''+a.id+'\')" style="margin-top:9px;text-align:center;'
           + 'font-size:.7rem;letter-spacing:.1em;padding:8px;border:1px solid '+CO.bad+'88;color:'+CO.bad+';cursor:pointer">'
           + 'PULL THIS ACCORD</div>';
      }
      h += '</div>';
    }

    if (open && (a.canSign || a.canWithdraw)) {
      h += '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">';
      if (a.canSign) {
        h += '<div onclick="window.__councilSign(\''+a.id+'\')" style="flex:1;min-width:120px;text-align:center;font-size:.64rem;letter-spacing:.1em;padding:7px;border:1px solid '+CO.bonded+'66;color:'+CO.bonded+';cursor:pointer">SIGN AND EXECUTE</div>';
        h += '<div onclick="window.__councilDecline(\''+a.id+'\')" style="flex:1;min-width:120px;text-align:center;font-size:.64rem;letter-spacing:.1em;padding:7px;border:1px solid '+CO.bad+'55;color:'+CO.bad+';cursor:pointer">REFUSE</div>';
      }
      if (a.canWithdraw) {
        h += '<div onclick="window.__councilWithdraw(\''+a.id+'\')" style="flex:1;min-width:120px;text-align:center;font-size:.64rem;letter-spacing:.1em;padding:7px;border:1px solid '+CO.mute+'66;color:'+CO.mute+';cursor:pointer">WITHDRAW</div>';
      }
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  // ── Composer ───────────────────────────────────────────────────────────────
  function clauseRow(side, i, c){
    c = c || { colonyId:'', factionId:'coalition', amount:'' };
    var f = ['coalition','syndicate','void','guild'].map(function(x){
      return '<option value="'+x+'"'+(x===c.factionId?' selected':'')+'>'+x+'</option>'; }).join('');
    return '<div style="display:flex;gap:5px;margin-bottom:5px;flex-wrap:wrap" data-crow="'+side+'">'
      + '<select data-cf="colony" style="flex:2;min-width:120px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:4px 6px;font-size:.66rem;font-family:inherit">'+colonyOptions(c.colonyId)+'</select>'
      + '<select data-cf="faction" style="flex:1;min-width:90px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:4px 6px;font-size:.66rem;font-family:inherit">'+f+'</select>'
      + '<input data-cf="amount" type="number" min="1000" step="1000" value="'+esc(c.amount)+'" placeholder="Ƒ amount" style="flex:1;min-width:90px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:4px 6px;font-size:.66rem;font-family:inherit">'
      + '<div onclick="this.parentNode.remove();window.__councilRecalc()" style="padding:4px 8px;border:1px solid #331a1a;color:'+CO.bad+';font-size:.66rem;cursor:pointer">&times;</div>'
      + '</div>';
  }

  function renderComposer(){
    var my = st.mySeat;
    var actable = st.seats.filter(function(s){ return s.seat === my || (st.isGM && s.regent); });
    if (!actable.length) {
      return '<div style="border:1px solid '+CO.line+';border-left:3px solid '+CO.gold+';background:'+CO.panel+';padding:13px 14px">'
           + '<div style="font-size:.64rem;letter-spacing:.15em;color:'+CO.gold+';text-transform:uppercase;margin-bottom:6px">You are in the gallery</div>'
           + '<div style="font-size:.8rem;color:'+CO.text+';line-height:1.8">'
           + 'Read anything. Sign nothing. Only a seated delegate may table an Accord, and the record above is public precisely so that everyone else can watch them do it.'
           + '</div></div>';
    }
    var fromOpts = actable.map(function(s){
      return '<option value="'+s.seat+'">'+esc(s.label)+(s.regent?' (regent, GM)':'')+'</option>'; }).join('');
    var toOpts = st.seats.map(function(s){
      return '<option value="'+s.seat+'">'+esc(s.label)+'</option>'; }).join('');

    var h = '<div id="councilComposer" style="border:1px solid '+CO.line+';background:'+CO.panel+';padding:12px">';
    h += '<div style="font-size:.6rem;letter-spacing:.15em;color:'+CO.gold+';text-transform:uppercase;margin-bottom:4px">Table an Accord</div>';
    h += '<div style="font-size:.74rem;color:'+CO.mute+';line-height:1.7;margin-bottom:11px">Green clauses are held by the Guild and execute the instant the other chair signs. The amber rider is not held by anyone.</div>';

    h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px">';
    h += '<select id="cpFrom" style="flex:1;min-width:130px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:5px 7px;font-size:.68rem;font-family:inherit">'+fromOpts+'</select>';
    h += '<select id="cpTo" style="flex:1;min-width:130px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:5px 7px;font-size:.68rem;font-family:inherit">'+toOpts+'</select>';
    h += '<select id="cpTtl" style="flex:1;min-width:110px;background:#0a0a14;border:1px solid #333;color:#aaa;padding:5px 7px;font-size:.68rem;font-family:inherit">'
       + '<option value="21600000">Expires 6h</option><option value="86400000">Expires 24h</option>'
       + '<option value="172800000" selected>Expires 48h</option><option value="604800000">Expires 7d</option></select>';
    h += '</div>';

    h += '<input id="cpTitle" maxlength="90" placeholder="What this Accord is called on the record" style="width:100%;box-sizing:border-box;background:#0a0a14;border:1px solid #333;color:#ddd;padding:6px 8px;font-size:.7rem;font-family:inherit;margin-bottom:10px">';

    h += '<div style="display:flex;gap:14px;flex-wrap:wrap">';
    h += '<div style="flex:1;min-width:250px">';
    h += '<div style="font-size:.64rem;letter-spacing:.12em;color:'+CO.bonded+';margin-bottom:5px">BONDED, YOU DELIVER</div>';
    h += '<div id="cpMine"></div>';
    h += '<div onclick="window.__councilAddClause(\'mine\')" style="font-size:.62rem;color:'+CO.bonded+';border:1px dashed '+CO.bonded+'44;padding:5px;text-align:center;cursor:pointer">+ add bonded clause</div>';
    h += '</div>';
    h += '<div style="flex:1;min-width:250px">';
    h += '<div style="font-size:.64rem;letter-spacing:.12em;color:'+CO.bonded+';margin-bottom:5px">BONDED, THEY DELIVER</div>';
    h += '<div id="cpTheirs"></div>';
    h += '<div onclick="window.__councilAddClause(\'theirs\')" style="font-size:.62rem;color:'+CO.bonded+';border:1px dashed '+CO.bonded+'44;padding:5px;text-align:center;cursor:pointer">+ add bonded clause</div>';
    h += '</div>';
    h += '</div>';

    h += '<div style="margin-top:11px;border-left:2px solid '+CO.rider+';background:#160f04;padding:8px 10px">';
    h += '<div style="font-size:.64rem;letter-spacing:.14em;color:'+CO.rider+';margin-bottom:4px">&#9888; RIDER, UNBONDED, OPTIONAL</div>';
    h += '<textarea id="cpRider" maxlength="600" rows="3" placeholder="Anything the server cannot hold. Ceasefires, promises, threats. Write it and mean it, but understand nothing enforces it." style="width:100%;box-sizing:border-box;background:#0d0904;border:1px solid #3a2a10;color:#c9a86a;padding:6px 8px;font-size:.68rem;font-family:inherit;resize:vertical"></textarea>';
    h += '<div style="font-size:.6rem;color:'+CO.mute+';margin-top:5px;line-height:1.55">Recorded, never enforced. This is the half of the Accord that runs on your word.</div>';
    h += '</div>';

    h += '<div id="cpCost" style="font-size:.75rem;color:'+CO.mute+';margin-top:12px;line-height:1.7"></div>';
    h += '<div onclick="window.__councilPropose()" style="margin-top:8px;text-align:center;font-size:.68rem;letter-spacing:.11em;padding:8px;border:1px solid '+CO.gold+'66;color:'+CO.gold+';cursor:pointer">TABLE ACCORD</div>';
    h += '</div>';
    return h;
  }

  function readClauses(containerId){
    var out = [], box = document.getElementById(containerId);
    if (!box) return out;
    box.querySelectorAll('[data-crow]').forEach(function(row){
      var col = row.querySelector('[data-cf="colony"]');
      var fac = row.querySelector('[data-cf="faction"]');
      var amt = row.querySelector('[data-cf="amount"]');
      var a = Math.floor(Number(amt && amt.value) || 0);
      if (!col || !fac || a <= 0) return;
      out.push({ kind:'fund_colony', colonyId: col.value, factionId: fac.value, amount: a });
    });
    return out;
  }

  window.__councilAddClause = function(which){
    var id = which === 'mine' ? 'cpMine' : 'cpTheirs';
    var box = document.getElementById(id); if (!box) return;
    var max = (st.cfg && st.cfg.clausesPerSide) || 4;
    if (box.querySelectorAll('[data-crow]').length >= max) { toast('Four bonded clauses a side is the ceiling.', CO.bad); return; }
    box.insertAdjacentHTML('beforeend', clauseRow(which, box.children.length, null));
    bindClauseInputs();
    window.__councilRecalc();
  };

  window.__councilRecalc = function(){
    var el = document.getElementById('cpCost'); if (!el) return;
    var mine = readClauses('cpMine');
    var esc0 = mine.reduce(function(s,c){ return s + c.amount; }, 0);
    var rate = (st.cfg && st.cfg.notaryRate) || 0.02;
    var fee = Math.ceil(esc0 * rate);
    el.innerHTML = esc0 > 0
      ? 'Escrowed on tabling: <span style="color:'+CO.bonded+'">'+fm(esc0)+'</span> plus a Guild notary fee of <span style="color:'+CO.gold+'">'+fm(fee)+'</span>, total <b style="color:#ddd">'+fm(esc0+fee)+'</b>. '
        + 'Refunded in full if refused, withdrawn or expired.'
      : 'Your side bonds nothing yet. Credits are taken when you table, not when they sign.';
  };

  window.__councilPropose = function(){
    var from = document.getElementById('cpFrom'), to = document.getElementById('cpTo');
    var title = document.getElementById('cpTitle'), rider = document.getElementById('cpRider');
    var ttl = document.getElementById('cpTtl');
    if (!from || !to || !title) return;
    if (from.value === to.value) { toast('A chair cannot treat with itself.', CO.bad); return; }
    if (!title.value.trim()) { toast('Give the Accord a name for the record.', CO.bad); return; }
    var mine = readClauses('cpMine'), theirs = readClauses('cpTheirs');
    if (!mine.length && !theirs.length) { toast('An Accord needs at least one bonded clause. A rider alone is a message.', CO.bad); return; }
    post('/api/council/accord/propose', {
      fromSeat: from.value, counterSeat: to.value, title: title.value.trim(),
      rider: rider ? rider.value : '', expiresInMs: Number(ttl && ttl.value) || 172800000,
      myClauses: mine, theirClauses: theirs
    }, function(d){ toast('Accord '+d.id+' tabled. '+fm(d.escrow+d.notary)+' escrowed.', CO.gold); });
  };

  // Seat purchase moved to the Title Market in 1.4.2.0. This jumps there rather
  // than duplicating the checkout.
  window.__councilToStore = function(){
    try {
      var tab = document.querySelector('[data-tab="store"]');
      if (tab) { tab.click(); return; }
    } catch(e){}
    toast('Open the Store tab, then the Legendary titles rack.', CO.gold);
  };

  window.__councilSign = function(id){
    var a = null; st.accords.forEach(function(x){ if (x.id === id) a = x; });
    if (!a) return;
    var mine = a.bonded.counter.reduce(function(s,c){ return s + Number(c.amount||0); }, 0);
    var rate = (st.cfg && st.cfg.notaryRate) || 0.02;
    var fee = Math.ceil(mine * rate);
    var msg = 'Sign Accord ' + id + '?\n\nSigning executes immediately and cannot be undone.'
            + '\n\nYou deliver: ' + fm(mine) + ' in bonded clauses, plus ' + fm(fee) + ' Guild notary fee.'
            + (a.rider ? '\n\nThis Accord carries a RIDER. The rider is NOT enforced by the server and nothing is held against it.' : '');
    if (!confirm(msg)) return;
    post('/api/council/accord/sign', { accordId: id }, function(){ toast('Accord executed.', CO.bonded); });
  };

  window.__councilCancel = function(id){
    if (!confirm('Pull Accord ' + id + ' before it executes?\n\n'
      + 'Both sides are refunded in full, to whoever paid: treasury money returns to the treasury, '
      + 'personal money returns to the person. This cannot be undone and the other chair will see it.')) return;
    post('/api/council/accord/cancel', { accordId: id }, function(d){
      toast('Pulled. ' + fm(d.refunded) + ' released.', CO.gold);
    });
  };

  window.__councilDecline = function(id){
    if (!confirm('Refuse Accord ' + id + '? The proposer is refunded in full.')) return;
    post('/api/council/accord/decline', { accordId: id }, function(){ toast('Refused.', CO.dim); });
  };

  window.__councilWithdraw = function(id){
    if (!confirm('Withdraw Accord ' + id + '? Your escrow and notary fee are returned in full.')) return;
    post('/api/council/accord/withdraw', { accordId: id }, function(d){ toast('Withdrawn, '+fm(d.refunded)+' returned.', CO.dim); });
  };

  // ── Ledger ─────────────────────────────────────────────────────────────────
  function renderLog(){
    if (!st.log.length) return '';
    var h = '<div style="margin-top:16px;border-top:1px solid '+CO.line+';padding-top:11px">';
    h += '<div style="font-size:.62rem;letter-spacing:.15em;color:'+CO.mute+';text-transform:uppercase;margin-bottom:8px">Chamber Record</div>';
    st.log.slice(0, 20).forEach(function(l){
      var d = new Date(l.ts);
      h += '<div style="font-size:.7rem;color:'+CO.mute+';line-height:1.8">'
         + '<span style="color:#333">'+d.toLocaleDateString()+' '+d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</span> '
         + '<span style="color:#7a7a8a">'+esc(l.event)+'</span> '
         + (l.actor ? '<span style="color:#999">'+esc(l.actor)+'</span> ' : '')
         + (l.detail ? '<span style="color:#555">'+esc(l.detail)+'</span>' : '')
         + '</div>';
    });
    h += '</div>';
    return h;
  }

  // ── Treasury ───────────────────────────────────────────────────────────────
  function loadTreasury(){
    if (!st.myFaction) { st.treasury = null; return; }
    fetch(api()+'/api/council/treasury', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: tok(), faction: st.myFaction })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) return;
      st.treasury = d; renderTreasury();
    }).catch(function(){});
  }

  var TLED = { contribute:['CONTRIBUTED', CO.bonded], fund_colony:['COLONY FUNDED', CO.gold],
               accord_escrow:['ACCORD ESCROW', CO.gold], accord_refund:['ESCROW RETURNED', CO.bonded],
               spend_pending:['COMMITTED, HELD', CO.bad], spend_cancelled:['COMMITMENT PULLED', CO.bonded],
               spend_executed:['COMMITMENT EXECUTED', CO.gold] };

  function renderTreasury(){
    var box = document.getElementById('ctreasWrap');
    if (!box) return;
    if (!st.myFaction || !st.treasury) {
      box.innerHTML = '<div style="border:1px solid '+CO.line+';background:'+CO.panel+';padding:13px 14px;'
        + 'font-size:.74rem;color:'+CO.mute+';line-height:1.7">Align to a faction to see its treasury.</div>';
      return;
    }
    var t = st.treasury;
    var col = FACTION_COLOR[t.faction] || CO.gold;
    var h = '<div style="border:1px solid '+CO.line+';border-left:3px solid '+col+';background:'+CO.panel+';padding:13px 14px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">';
    h += '<div style="font-size:.64rem;letter-spacing:.15em;color:'+col+';text-transform:uppercase">'
       + esc(t.faction)+' Treasury</div>';
    h += '<div style="font-size:1.05rem;color:'+CO.text+';font-weight:700">'+fm(t.balance)+'</div>';
    h += '</div>';
    h += '<div style="font-size:.68rem;color:'+CO.mute+';margin-top:5px;line-height:1.6">'
       + 'Contributed to date '+fm(t.lifetimeIn)+' &middot; spent '+fm(t.lifetimeOut)
       + (t.leader ? ' &middot; directed by <span style="color:'+col+'">'+esc(t.leader)+'</span>'
                   : ' &middot; <span style="color:'+CO.bad+'">no seated leader</span>') + '</div>';

    // The one line that has to be on this panel. Somebody is about to hand over
    // their own money, and the reason it is safe to do so is that nobody can take
    // it out, including the person spending it.
    h += '<div style="font-size:.68rem;color:'+CO.mute+';margin-top:8px;line-height:1.65;border-top:1px solid '+CO.line+';padding-top:8px">'
       + 'Credits here can buy colony control and bond Accords. They can never be withdrawn to anyone, '
       + 'including the leader who spends them. A bad chair can waste this. Nobody can take it.</div>';

    h += '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">';
    h += '<input id="ctreasAmt" type="number" min="10000" step="10000" placeholder="Amount" '
       + 'style="flex:1;min-width:110px;background:#0a0a14;border:1px solid '+CO.line+';color:'+CO.text+';'
       + 'padding:7px 10px;font-size:.76rem;font-family:inherit">';
    h += '<div onclick="window.__treasContribute()" style="flex:0 0 auto;padding:7px 15px;font-size:.7rem;'
       + 'letter-spacing:.09em;border:1px solid '+CO.bonded+'66;color:'+CO.bonded+';cursor:pointer">CONTRIBUTE</div>';
    h += '</div>';

    if (t.leaderIsMe) {
      h += '<div style="margin-top:11px;border-top:1px solid '+CO.line+';padding-top:10px">';
      h += '<div style="font-size:.62rem;letter-spacing:.13em;color:'+col+';text-transform:uppercase;margin-bottom:6px">Direct the treasury</div>';
      h += '<div style="font-size:.68rem;color:'+CO.mute+';line-height:1.6;margin-bottom:8px">'
         + 'Every spend is posted to your faction room and to the floor, under your name.</div>';
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
      h += '<select id="ctreasColony" style="flex:2;min-width:130px;background:#0a0a14;border:1px solid '+CO.line+';color:'+CO.text+';padding:6px 8px;font-size:.72rem;font-family:inherit">'+colonyOptions('')+'</select>';
      var fo = ['coalition','syndicate','void','guild'].map(function(x){
        return '<option value="'+x+'"'+(x===t.faction?' selected':'')+'>'+x+'</option>'; }).join('');
      h += '<select id="ctreasFaction" style="flex:1;min-width:100px;background:#0a0a14;border:1px solid '+CO.line+';color:'+CO.text+';padding:6px 8px;font-size:.72rem;font-family:inherit">'+fo+'</select>';
      h += '<input id="ctreasSpend" type="number" min="1000" step="1000" placeholder="Amount" style="flex:1;min-width:100px;background:#0a0a14;border:1px solid '+CO.line+';color:'+CO.text+';padding:6px 8px;font-size:.72rem;font-family:inherit">';
      h += '<div onclick="window.__treasFund()" style="flex:0 0 auto;padding:6px 14px;font-size:.7rem;letter-spacing:.09em;border:1px solid '+col+'66;color:'+col+';cursor:pointer">FUND</div>';
      h += '</div></div>';
    }

    // Committed but not executed. Sits directly under the balance because a member
    // reading the balance needs to know what is already spoken for.
    if (t.pendingSpends && t.pendingSpends.length) {
      h += '<div style="margin-top:11px;border-left:2px solid '+CO.bad+';background:#1a0808;padding:9px 11px">';
      h += '<div style="font-size:.62rem;letter-spacing:.13em;color:'+CO.bad+';margin-bottom:5px">&#9888; COMMITTED, NOT YET EXECUTED</div>';
      t.pendingSpends.forEach(function(sp){
        h += '<div style="padding:5px 0;border-top:1px solid #2a1010">';
        h += '<div style="font-size:.74rem;color:'+CO.text+';line-height:1.6">'
           + fm(sp.amount) + ' to <b>'+esc(sp.target)+'</b> control on <b>'+esc(colonyName(sp.colonyId))+'</b></div>';
        h += '<div style="font-size:.66rem;color:'+CO.mute+';line-height:1.6">'
           + 'committed by '+esc(sp.by)+' &middot; executes in <span style="color:'+CO.bad+'">'+timeLeft(sp.executesAt)+'</span></div>';
        if (sp.canCancel) {
          h += '<div onclick="window.__treasCancel(\''+sp.id+'\')" style="margin-top:6px;text-align:center;'
             + 'font-size:.68rem;letter-spacing:.09em;padding:6px;border:1px solid '+CO.bad+'88;color:'+CO.bad+';cursor:pointer">'
             + 'PULL THIS COMMITMENT</div>';
        }
        h += '</div>';
      });
      h += '<div style="font-size:.64rem;color:'+CO.mute+';line-height:1.6;margin-top:6px">'
         + 'These credits have already left the balance above and return to it if pulled. '
         + 'Any seated leader of this faction can pull one, including whoever takes the chair.</div>';
      h += '</div>';
    }

    if (t.ledger && t.ledger.length) {
      h += '<div style="margin-top:12px;border-top:1px solid '+CO.line+';padding-top:9px">';
      h += '<div style="font-size:.62rem;letter-spacing:.13em;color:'+CO.mute+';text-transform:uppercase;margin-bottom:6px">Ledger</div>';
      t.ledger.slice(0, 12).forEach(function(l){
        var m = TLED[l.kind] || [l.kind.toUpperCase(), CO.mute];
        var d = new Date(l.ts);
        h += '<div style="font-size:.68rem;color:'+CO.mute+';line-height:1.75">'
           + '<span style="color:'+CO.dim+'">'+d.toLocaleDateString()+'</span> '
           + '<span style="color:'+m[1]+'">'+m[0]+'</span> '
           + '<span style="color:'+(l.amount<0?CO.bad:CO.bonded)+'">'+(l.amount<0?'-':'+')+fm(Math.abs(l.amount))+'</span>'
           + (l.actor ? ' <span style="color:'+CO.text+'">'+esc(l.actor)+'</span>' : '')
           + (l.detail ? ' <span style="color:'+CO.dim+'">'+esc(l.detail)+'</span>' : '')
           + '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    box.innerHTML = h;
  }

  function treasPost(path, body, msg){
    body = body || {}; body.token = tok();
    fetch(api()+path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d || !d.ok) { toast((d && (d.msg || d.error)) || 'Refused.', CO.bad); return; }
        st.treasury = d; renderTreasury(); load();
        if (msg) toast(msg, CO.bonded);
      }).catch(function(){ toast('Treasury unreachable.', CO.bad); });
  }

  window.__treasContribute = function(){
    var el = document.getElementById('ctreasAmt');
    var amt = Math.floor(Number(el && el.value) || 0);
    if (amt < 10000) { toast('Minimum contribution is '+fm(10000)+'.', CO.bad); return; }
    if (!confirm('Contribute '+fm(amt)+' to the '+st.myFaction+' treasury?\n\n'
      + 'This is ONE WAY. Credits in a treasury can buy colony control and bond Accords, '
      + 'and can never be withdrawn to anyone, including you and including the leader.')) return;
    treasPost('/api/council/treasury/contribute', { amount: amt }, 'Contributed '+fm(amt)+'.');
  };

  window.__treasCancel = function(id){
    if (!confirm('Pull this commitment before it executes?\n\n'
      + 'The credits return to the treasury in full. The faction and the other chairs will see it.')) return;
    treasPost('/api/council/treasury/cancel', { spendId: id }, 'Pulled.');
  };

  window.__treasFund = function(){
    var c = document.getElementById('ctreasColony'), f = document.getElementById('ctreasFaction'),
        a = document.getElementById('ctreasSpend');
    var amt = Math.floor(Number(a && a.value) || 0);
    if (!c || !f || amt < 1000) { toast('Minimum spend is '+fm(1000)+'.', CO.bad); return; }
    var ceding = f.value !== st.myFaction;
    var warn = 'Direct '+fm(amt)+' of treasury funds to '+f.value+' control on '+colonyName(c.value)+'?\n\n'
      + 'This is not your money. The spend is posted to your faction room and to the floor under your name.';
    if (ceding) {
      warn += '\n\nTHIS PUTS GROUND IN ANOTHER FACTION\'S HANDS, so it does NOT execute now. '
            + 'It is held for 12 hours, during which any seated leader of your faction can pull it, '
            + 'including whoever takes the chair off you.';
    }
    if (!confirm(warn)) return;
    treasPost('/api/council/treasury/fund',
      { colonyId: c.value, factionId: f.value, amount: amt }, 'Treasury directed.');
  };

  // ── The three surfaces ─────────────────────────────────────────────────────
  // Rendered as one pane with a room switcher rather than three columns side by
  // side. Three columns fit a desktop and nothing else, and the mobile shell is a
  // five slot nav on a 380px viewport. A switcher is the same information in a
  // shape that survives the phone.

  function roomList(){
    var out = [{ id:'floor', label:'THE FLOOR', color: CO.gold, hint:'Delegates only. Permanent record.' },
               { id:'gallery', label:'GALLERY', color: CO.text, hint:'Everyone. The cheap seats.' }];
    if (st.myFaction) {
      var fc = SEAT_COLOR[st.myFaction] || CO.mute;
      out.push({ id:'faction:'+st.myFaction, label: st.myFaction.toUpperCase()+' ROOM',
                 color: fc, hint:'Your faction only. Nobody else can read this.' });
    }
    return out;
  }

  function loadRoom(id, cb){
    fetch(api()+'/api/council/room', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: tok(), room: id })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (!d || !d.ok) return;
      st.rooms[id] = d.posts || [];
      st.canPost[id] = !!d.canPost;
      if (d.gmRegents) st.gmRegents = d.gmRegents;
      if (d.gmVoices)  st.gmVoices  = d.gmVoices;
      if (d.proprietor) st.proprietor = d.proprietor;
      if (d.myFaction !== undefined) st.myFaction = d.myFaction;
      renderRooms(); scrollRoomToEnd(); if (cb) cb();
    }).catch(function(){});
  }

  function scrollRoomToEnd(){
    var b = document.getElementById('croomBody');
    if (b) b.scrollTop = b.scrollHeight;
  }

  // ONE PALETTE, RANK SHOWN BY WEIGHT NOT BY HUE. A delegate and a rank and file
  // member of the same faction render in the SAME colour, because they are the
  // same faction and inventing a second red for the Syndicate would say they are
  // not. What separates them is bold, the seat tag, and a solid portrait ring
  // against a thin one. Giving each rank its own hue would burn eight colours on
  // a distinction two typographic weights already carry.
  function speakerColor(m){
    if (m.seat) return SEAT_COLOR[m.seat] || CO.text;
    if (m.faction) return FACTION_COLOR[m.faction] || CO.text;
    return CO.text;
  }

  function postView(m){
    var col = speakerColor(m);
    var isDelegate = !!m.seat;
    if (isPixelArt(m.portrait)) ensureItemArt();
    var psrc = portraitSrc(m.portrait);
    var t = new Date(m.ts);
    // The name is scaled by the SAME --chat-font-scale the main chat uses, so the
    // A+ / A- control moves everything in the room together rather than leaving
    // the body text growing away from the byline above it.
    var h = '<div class="cmsg" style="display:flex;gap:9px;padding:7px 0;align-items:flex-start">';
    if (psrc) {
      h += '<div style="flex:0 0 auto;width:30px;height:30px;border-radius:50%;overflow:hidden;'
         + 'border:'+(isDelegate?'2px solid '+col:'1px solid '+col+'88')+';background:#04070b">'
         + '<img src="'+esc(psrc)+'" alt="" style="'+portraitStyle(m.portrait)+'width:100%;height:100%;object-fit:cover;display:block"/></div>';
    } else {
      // No portrait picked. Render the speaker's initial in their faction colour
      // rather than an empty dashed ring, which reads as a broken avatar.
      h += '<div style="flex:0 0 auto;width:30px;height:30px;border-radius:50%;display:flex;'
         + 'align-items:center;justify-content:center;border:1px solid '+col+'66;background:#04070b;'
         + 'color:'+col+';font-size:.8rem;font-weight:700">'
         + esc(String(m.name || '?').trim().charAt(0).toUpperCase() || '?') + '</div>';
    }
    h += '<div style="min-width:0;flex:1">';
    h += '<div class="cmname" style="line-height:1.5">'
       + '<span style="color:'+col+';font-weight:'+(isDelegate?800:700)+'">'+esc(m.name)+'</span>'
       + (m.seat ? ' <span style="color:'+col+';opacity:.75">&#9679; '+esc(m.seat).toUpperCase()+'</span>' : '')
       + (m.npc ? ' <span style="color:'+CO.gold+';opacity:.75">NPC</span>' : '')
       + ' <span style="color:'+CO.dim+'">'+t.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'</span>'
       + '</div>';
    h += '<div class="cmbody" style="color:'+CO.text+';line-height:1.6;white-space:pre-wrap;word-break:break-word">'+esc(m.body)+'</div>';
    h += '</div></div>';
    return h;
  }

  // THE COMPOSER GOT DRAFT PRESERVATION AND THE CHAT BOX DID NOT, which is the
  // whole bug: renderRooms rebuilds croomWrap with innerHTML, and every rebuild
  // threw away whatever was half typed in the room input. The pane re-renders on
  // anyone posting, on an accord changing, and on a blind 30 second timer, so in
  // a room with two people in it a sentence gets eaten every few seconds.
  //
  // Caret and scroll go with it. Restoring the text but dropping the cursor to
  // the end is its own small insult when you were editing the middle of a line.
  function captureRoomDraft(){
    var inp = document.getElementById('croomInput');
    var body = document.getElementById('croomBody');
    var asSel = document.getElementById('croomAs');
    if (!inp && !body) return null;
    return {
      text: inp ? inp.value : '',
      selStart: inp ? inp.selectionStart : 0,
      selEnd: inp ? inp.selectionEnd : 0,
      // Only take focus back if the person actually had it. Calling focus() on
      // every render steals the caret out of the Accord composer, or out of the
      // main chat, while somebody is typing there.
      focused: !!(inp && document.activeElement === inp),
      as: asSel ? asSel.value : null,
      // Preserve scroll unless they were already at the bottom, in which case
      // follow new messages down as a chat should.
      scrollTop: body ? body.scrollTop : null,
      atBottom: body ? (body.scrollHeight - body.scrollTop - body.clientHeight < 40) : true,
    };
  }

  function restoreRoomDraft(d){
    if (!d) return;
    var inp = document.getElementById('croomInput');
    if (inp && d.text) {
      inp.value = d.text;
      try { inp.setSelectionRange(d.selStart, d.selEnd); } catch(e){}
    }
    if (inp && d.focused) { try { inp.focus(); } catch(e){} }
    var asSel = document.getElementById('croomAs');
    if (asSel && d.as) asSel.value = d.as;
    var body = document.getElementById('croomBody');
    if (body) body.scrollTop = d.atBottom ? body.scrollHeight : d.scrollTop;
  }

  function renderRooms(){
    var box = document.getElementById('croomWrap');
    if (!box) return;
    var _draft = captureRoomDraft();
    var rl = roomList();
    var active = st.active;
    if (!rl.some(function(r){ return r.id === active; })) { active = st.active = 'gallery'; }
    var meta = rl.filter(function(r){ return r.id === active; })[0];

    var h = '<div style="border:1px solid '+CO.line+';background:'+CO.panel+'">';

    // Scale rules. Same --chat-font-scale variable the main chat uses, so the one
    // control in the chat header and the one here are the same setting.
    h += '<style>#croomBody .cmname{font-size:calc(.68rem * var(--chat-font-scale,1))}'
       + '#croomBody .cmbody{font-size:calc(.82rem * var(--chat-font-scale,1))}</style>';

    // Room switcher, with the text size control on the right.
    h += '<div style="display:flex;align-items:center;border-bottom:1px solid '+CO.line+'">';
    h += '<div style="display:flex;overflow-x:auto;flex:1;min-width:0">';
    rl.forEach(function(r){
      var on = r.id === active;
      h += '<div onclick="window.__councilRoom(\''+r.id+'\')" style="flex:0 0 auto;padding:9px 15px;'
         + 'font-size:.64rem;letter-spacing:.13em;cursor:pointer;white-space:nowrap;'
         + 'color:'+(on?r.color:CO.dim)+';border-bottom:2px solid '+(on?r.color:'transparent')+'">'
         + esc(r.label) + '</div>';
    });
    h += '</div>';
    h += '<div style="flex:0 0 auto;display:flex;gap:4px;padding:0 10px">'
       + '<div onclick="window.__councilFont(-1)" title="Smaller text" style="border:1px solid '+CO.gold+'55;'
       + 'color:'+CO.gold+';font-size:.72rem;font-weight:700;padding:2px 7px;cursor:pointer;user-select:none">A&#8722;</div>'
       + '<div onclick="window.__councilFont(1)" title="Larger text" style="border:1px solid '+CO.gold+'55;'
       + 'color:'+CO.gold+';font-size:.72rem;font-weight:700;padding:2px 7px;cursor:pointer;user-select:none">A+</div>'
       + '</div>';
    h += '</div>';

    h += '<div style="font-size:.66rem;color:'+CO.mute+';padding:8px 13px 0">'+esc(meta.hint)+'</div>';

    var posts = st.rooms[active] || [];
    h += '<div id="croomBody" style="max-height:300px;overflow-y:auto;padding:4px 13px 8px">';
    if (!posts.length) {
      h += '<div style="font-size:.76rem;color:'+CO.mute+';padding:16px 0;line-height:1.6">'
         + (active === 'floor' ? 'The floor has not been addressed.' : 'Nobody has said anything here yet.')
         + '</div>';
    } else {
      posts.forEach(function(m){ h += postView(m); });
    }
    h += '</div>';

    // Typing indicator. Ephemeral and never persisted, so it lives outside the
    // post list rather than being faked as a message.
    var ty = st.typing[active];
    h += '<div id="croomTyping" style="height:16px;padding:0 13px;font-size:.64rem;color:'+CO.mute+';font-style:italic">'
       + (ty ? esc(ty.name) + ' is typing...' : '') + '</div>';

    // Composer.
    if (st.canPost[active]) {
      h += '<div style="display:flex;gap:7px;padding:9px 13px 11px;border-top:1px solid '+CO.line+'">';
      // A GM addressing the floor picks which regent is speaking. The chair is
      // named on the control so nobody sends a line from the wrong mouth.
      if (active === 'floor' && !st.mySeat && ((st.gmRegents && st.gmRegents.length) || st.proprietor)) {
        var opts = '';
        // The proprietor leads the list. He holds no chair, so he is always
        // available and is the voice most likely to be wanted.
        if (st.proprietor) {
          opts += '<option value="'+esc(st.proprietor.id)+'"'
               + (st.gmAsSeat===st.proprietor.id?' selected':'')
               + '>as '+esc(st.proprietor.name)+' (house)</option>';
        }
        opts += (st.gmRegents || []).map(function(sd){
          var sv = null; st.seats.forEach(function(x){ if (x.seat === sd) sv = x; });
          return '<option value="'+sd+'"'+(st.gmAsSeat===sd?' selected':'')+'>as '+esc(sv?sv.holderName:sd)+'</option>';
        }).join('');
        h += '<select id="croomAs" style="flex:0 0 auto;max-width:190px;background:#0a0a14;border:1px solid '+CO.gold+'55;'
           + 'color:'+CO.gold+';padding:6px 8px;font-size:.7rem;font-family:inherit">'+opts+'</select>';
      }
      h += '<input id="croomInput" maxlength="400" placeholder="'
         + (active === 'floor' ? 'Address the chamber. This is permanent.' : 'Say something') + '" '
         + 'style="flex:1;min-width:0;background:#0a0a14;border:1px solid '+CO.line+';color:'+CO.text+';'
         + 'padding:7px 10px;font-size:.78rem;font-family:inherit">';
      h += '<div onclick="window.__councilSend()" style="flex:0 0 auto;padding:7px 15px;font-size:.7rem;'
         + 'letter-spacing:.1em;border:1px solid '+meta.color+'66;color:'+meta.color+';cursor:pointer">SEND</div>';
      h += '</div>';
    } else {
      h += '<div style="padding:9px 13px 11px;border-top:1px solid '+CO.line+';font-size:.72rem;color:'+CO.mute+';line-height:1.6">'
         + (active === 'floor'
             ? 'Only a seated delegate may speak here. You can read every word of it.'
             : 'Align to a faction to use its room.')
         + '</div>';
    }
    h += '</div>';
    box.innerHTML = h;

    var inp = document.getElementById('croomInput');
    if (inp) {
      inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') window.__councilSend(); });
      inp.addEventListener('input', sendTyping);
    }
    var asSel = document.getElementById('croomAs');
    if (asSel) asSel.addEventListener('change', function(){ st.gmAsSeat = asSel.value; });

    restoreRoomDraft(_draft);

    // #croomBody is rebuilt by innerHTML on every render, which drops the inline
    // custom property with it. Re-apply rather than setting it once at boot.
    try { if (window.FMChatFont) window.FMChatFont.apply(); } catch(e){}
  }

  window.__councilFont = function(dir){
    try {
      if (window.FMChatFont) { window.FMChatFont.step(dir); return; }
    } catch(e){}
    toast('Text size control unavailable.', CO.bad);
  };

  var _typingAt = 0;
  function sendTyping(){
    // Throttled hard: this fires on every keystroke and the only thing it needs
    // to do is keep a two second indicator alive.
    if (Date.now() - _typingAt < 1500) return;
    _typingAt = Date.now();
    var asSel = document.getElementById('croomAs');
    send({ type:'council_typing', room: st.active, asSeat: asSel ? asSel.value : undefined });
  }

  function send(payload){
    try {
      if (typeof sendWS === 'function') sendWS(payload);
      else if (window._ws && window._ws.readyState === 1) window._ws.send(JSON.stringify(payload));
    } catch(e){}
  }

  window.__councilRoom = function(id){
    st.active = id;
    renderRooms();
    // An explicit room switch is the one time focusing is what the person meant.
    var inp = document.getElementById('croomInput');
    if (inp) { try { inp.focus(); } catch(e){} }
    loadRoom(id);
  };

  window.__councilSend = function(){
    var inp = document.getElementById('croomInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) return;
    var asSel = document.getElementById('croomAs');
    send({ type:'council_post', room: st.active, text: text,
           asSeat: asSel ? asSel.value : undefined });
    inp.value = '';
    try { inp.focus(); } catch(e){}
  };

  // ── Main render ────────────────────────────────────────────────────────────
  function render(){
    var box = document.getElementById('gCouncilInner');
    if (!box) return;
    if (!st.loaded) { box.innerHTML = '<div style="padding:34px;text-align:center;color:'+CO.mute+';font-size:.72rem;letter-spacing:.12em">CONVENING</div>'; return; }

    var h = '';
    h += renderChamber();
    h += renderSeats();
    h += renderComposer();

    h += '<div id="ctreasWrap" style="margin-top:16px"></div>';
    h += '<div id="croomWrap" style="margin-top:16px"></div>';

    // Pending sits with open, above everything settled: it is the only status
    // with a deadline somebody may need to act before.
    var open = st.accords.filter(function(a){ return a.status === 'open' || a.status === 'pending'; });
    var past = st.accords.filter(function(a){ return a.status !== 'open' && a.status !== 'pending'; });

    h += '<div style="margin-top:18px;font-size:.64rem;letter-spacing:.15em;color:'+CO.gold+';text-transform:uppercase;margin-bottom:8px">On the floor ('+open.length+')</div>';
    if (!open.length) h += '<div style="font-size:.78rem;color:'+CO.mute+';padding:12px 0;line-height:1.65">The floor is clear. No delegate has tabled anything.</div>';
    else open.forEach(function(a){ h += renderAccord(a); });

    if (past.length) {
      h += '<div style="margin-top:18px;font-size:.62rem;letter-spacing:.15em;color:'+CO.mute+';text-transform:uppercase;margin-bottom:8px">Struck from the floor</div>';
      past.slice(0, 15).forEach(function(a){ h += renderAccord(a); });
    }

    h += renderLog();

    // COMPOSER PRESERVATION. The chamber re-renders on every council_dirty
    // broadcast, which fires whenever ANY delegate acts. Blowing away innerHTML
    // would wipe a half typed Accord out from under someone every time an
    // unrelated chair moved, and the person composing a 50,000,000 clause is
    // exactly the person you must not do that to. So the composer is snapshotted
    // before the rewrite and restored after it.
    // Both drafts are captured before the rewrite: the Accord composer AND the
    // room chat box. renderRooms() captures its own again on the way through,
    // which is harmless, but capturing here means a full render cannot lose it
    // even if renderRooms is skipped.
    var draft = captureDraft();
    var roomDraft = captureRoomDraft();
    box.innerHTML = h;
    restoreDraft(draft);
    renderTreasury();
    renderRooms();
    restoreRoomDraft(roomDraft);
  }

  function captureDraft(){
    if (!document.getElementById('cpTitle')) return null;
    var g = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
    return { from: g('cpFrom'), to: g('cpTo'), ttl: g('cpTtl'),
             title: g('cpTitle'), rider: g('cpRider'),
             mine: readClauses('cpMine'), theirs: readClauses('cpTheirs') };
  }

  function restoreDraft(d){
    var mineBox = document.getElementById('cpMine'), theirBox = document.getElementById('cpTheirs');
    if (!mineBox || !theirBox) return;
    var s0 = function(id, v){ var e = document.getElementById(id); if (e && v) e.value = v; };
    if (d) { s0('cpFrom', d.from); s0('cpTo', d.to); s0('cpTtl', d.ttl); s0('cpTitle', d.title); s0('cpRider', d.rider); }

    var mine   = (d && d.mine   && d.mine.length)   ? d.mine   : [null];
    var theirs = (d && d.theirs && d.theirs.length) ? d.theirs : [null];
    mine.forEach(function(c){   mineBox.insertAdjacentHTML('beforeend', clauseRow('mine', 0, c)); });
    theirs.forEach(function(c){ theirBox.insertAdjacentHTML('beforeend', clauseRow('theirs', 0, c)); });
    bindClauseInputs();
    window.__councilRecalc();
  }

  function bindClauseInputs(){
    ['cpMine','cpTheirs'].forEach(function(id){
      var b = document.getElementById(id); if (!b) return;
      b.querySelectorAll('input,select').forEach(function(el){
        el.removeEventListener('change', window.__councilRecalc);
        el.addEventListener('change', window.__councilRecalc);
      });
    });
  }

  // ── Entry points ───────────────────────────────────────────────────────────
  window.__councilOpen = function(){
    render();
    load(function(){
      loadRoom('floor');
      loadRoom('gallery');
      loadTreasury();
      if (st.myFaction) loadRoom('faction:' + st.myFaction);
    });
  };
  window.__councilRefresh = function(){ if (st.loaded) load(); };

  // The server broadcasts council_dirty rather than a full state blob: the state
  // is cheap to fetch and only matters to whoever has the panel open.
  document.addEventListener('fm_ws_msg', function(e){
    try {
      var m = e.detail;
      if (m && m.type === 'council_post' && m.data) {
        var rm = m.data.room;
        if (!st.rooms[rm]) st.rooms[rm] = [];
        st.rooms[rm].push(m.data);
        if (rm !== 'floor' && st.rooms[rm].length > 200) st.rooms[rm].shift();
        st.typing[rm] = null;
        if (rm === st.active) {
          // APPEND, do not rebuild. An incoming message is the most frequent
          // reason this pane redraws, and rebuilding the whole thing to add one
          // line at the bottom is what made typing feel like it was being eaten.
          // The draft is preserved either way now, but not touching the input at
          // all is better than restoring it.
          var body = document.getElementById('croomBody');
          if (body) {
            var wasAtBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
            var empty = body.querySelector('div[style*="padding:16px"]');
            if (empty) body.innerHTML = '';
            body.insertAdjacentHTML('beforeend', postView(m.data));
            if (isPixelArt(m.data.portrait)) ensureItemArt();
            if (wasAtBottom) body.scrollTop = body.scrollHeight;
            var tel = document.getElementById('croomTyping');
            if (tel) tel.textContent = '';
          } else {
            renderRooms(); scrollRoomToEnd();
          }
        }
        return;
      }
      if (m && m.type === 'council_typing' && m.data) {
        var tr = m.data.room;
        st.typing[tr] = { name: m.data.name };
        if (tr === st.active) {
          var el = document.getElementById('croomTyping');
          if (el) el.textContent = m.data.name + ' is typing...';
        }
        clearTimeout(st['_tt_' + tr]);
        st['_tt_' + tr] = setTimeout(function(){
          st.typing[tr] = null;
          var e2 = document.getElementById('croomTyping');
          if (e2 && tr === st.active) e2.textContent = '';
        }, 2600);
        return;
      }
      if (m && m.type === 'treasury_dirty' && m.data) {
        if (m.data.faction === st.myFaction) loadTreasury();
        return;
      }
      if (m && m.type === 'council_dirty') {
        var pane = document.getElementById('gCouncilPane');
        if (!pane || pane.style.display === 'none') return;
        // Defer a full reload while they are mid sentence. council_dirty means an
        // accord or a seat moved, which is worth showing but never worth showing
        // RIGHT NOW at the cost of what somebody is writing. Coalesced so a burst
        // of events results in one reload once they stop typing.
        var ae = document.activeElement;
        if (ae && pane.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
          st._dirtyPending = true;
          clearTimeout(st._dirtyTimer);
          st._dirtyTimer = setTimeout(function(){
            var a2 = document.activeElement;
            var pn = document.getElementById('gCouncilPane');
            if (a2 && pn && pn.contains(a2) && /^(INPUT|TEXTAREA|SELECT)$/.test(a2.tagName)) return;
            st._dirtyPending = false; load();
          }, 4000);
          return;
        }
        load();
      }
    } catch(err){}
  });

  // The only reason this tick exists is to age the relative timestamps: "expires
  // in 47h 58m", "executes in 11h". It was calling render(), which rebuilds the
  // entire pane including both input boxes, on a blind timer whether or not
  // anything had changed. Now it skips entirely while the person is typing
  // anywhere inside the pane, so a redraw can never land mid sentence.
  setInterval(function(){
    var pane = document.getElementById('gCouncilPane');
    if (!pane || pane.style.display === 'none' || !st.loaded) return;
    var ae = document.activeElement;
    if (ae && pane.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    render();
  }, 30000);
})();
