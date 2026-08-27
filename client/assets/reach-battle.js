// ═══════════════════════════════════════════════════════════════════════════
// reach-battle.js - live battlefield viewer for a Khai'sultull engagement.
//
// This is the standalone mockup's renderer, ported. It is DECORATION: it draws
// what the server says is happening and decides nothing. Zone control, world
// control and every casualty that matters arrive over the wire from reach.js.
// Attrition between anonymous wireframes resolves locally because it has no
// economic consequence, exactly as the ambient Verbattan patrols do.
//
// Opened from a Reach world's surface panel. window.reachWatch(colonyId, zone).
// ═══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

var RB = { open:false, colony:null, zone:0, raf:null, tickIv:null, mode:'battle' };

// Harness shims. The mockup owned a fake server and a killfeed; here the real
// server owns the first and the second does not exist, so both are inert.
var SV = { front:0.5, vol:0.55, disp:0.5, tick:0, wave:0,
           seed:(Math.random()*4294967296)>>>0, cmd:{name:'', rank:''} };
function feedRow(){}

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

var cv=document.getElementById('rbCanvas'), ctx=cv?cv.getContext('2d'):null;
let W=0,H=0,DPR=1,focal=800;
function resize(){
  const r=cv.getBoundingClientRect();
  DPR=Math.min(window.devicePixelRatio||1,2);
  W=Math.max(1,r.width|0); H=Math.max(1,r.height|0);
  cv.width=W*DPR; cv.height=H*DPR; ctx.setTransform(DPR,0,0,DPR,0,0);
  focal=(H*0.5)/Math.tan(0.52);           // ~60 deg vertical fov
}
if(cv && window.ResizeObserver) new ResizeObserver(resize).observe(cv);

/* World: x across, y up, z depth. z=0 is our baseline, z=FIELD_D the hive. */
/* A BIGGER FIELD, because the bunching was partly a supply problem. Thirty
   terrain features carry about sixty cover positions, and two hundred and
   thirty units were competing for them, so the line collapsed onto the few
   rocks that existed. More ground and more cover spreads the same army out
   instead of stacking it. */
const FIELD_W=420, FIELD_D=320;
const NEAR=0.75;

const cam={x:0,y:30,z:-58,yaw:0,pitch:-0.20,mode:'orbit',orbA:0,orbR:150,orbH:44};
const F=[0,0,1], R=[1,0,0], U=[0,1,0];
function camBasis(){
  const cy=Math.cos(cam.yaw), sy=Math.sin(cam.yaw);
  const cp=Math.cos(cam.pitch), sp=Math.sin(cam.pitch);
  F[0]=sy*cp; F[1]=sp; F[2]=cy*cp;
  R[0]=cy;    R[1]=0;  R[2]=-sy;
  /* U = F x R, not R x F. Reversed, U[1] evaluates to -cos(pitch), so the up
     vector points down at every pitch and the whole scene renders inverted. */
  U[0]=F[1]*R[2]-F[2]*R[1];
  U[1]=F[2]*R[0]-F[0]*R[2];
  U[2]=F[0]*R[1]-F[1]*R[0];
}
const _a=[0,0,0], _b=[0,0,0];
function toView(x,y,z,o){
  const dx=x-cam.x, dy=y-cam.y, dz=z-cam.z;
  o[0]=dx*R[0]+dy*R[1]+dz*R[2];
  o[1]=dx*U[0]+dy*U[1]+dz*U[2];
  o[2]=dx*F[0]+dy*F[1]+dz*F[2];
}
let segCount=0;
/* One segment, view-clipped at the near plane and projected. Every piece of
   geometry in the scene goes through this. */
function seg(path,ax,ay,az,bx,by,bz){
  toView(ax,ay,az,_a); toView(bx,by,bz,_b);
  let x0=_a[0],y0=_a[1],z0=_a[2], x1=_b[0],y1=_b[1],z1=_b[2];
  if(z0<NEAR && z1<NEAR) return;
  if(z0<NEAR){ const t=(NEAR-z0)/(z1-z0); x0+=(x1-x0)*t; y0+=(y1-y0)*t; z0=NEAR; }
  else if(z1<NEAR){ const t=(NEAR-z1)/(z0-z1); x1+=(x0-x1)*t; y1+=(y0-y1)*t; z1=NEAR; }
  const sx0=W*0.5+x0/z0*focal, sy0=H*0.5-y0/z0*focal;
  const sx1=W*0.5+x1/z1*focal, sy1=H*0.5-y1/z1*focal;
  if((sx0<-2000&&sx1<-2000)||(sx0>W+2000&&sx1>W+2000)) return;
  if((sy0<-2000&&sy1<-2000)||(sy0>H+2000&&sy1>H+2000)) return;
  path.moveTo(sx0,sy0); path.lineTo(sx1,sy1);
  segCount++;
}
/* normalized field coords -> world */
function wx(x){ return (x-0.5)*FIELD_W; }
function wz(y){ return (1-y)*FIELD_D; }

/* ── the Reach ────────────────────────────────────────────────────────────
   Ten worlds, and the terrain key each one already declares in the shipped
   COLONY_VISUAL table. The battlefield reads that key, so the ground a world
   fights on is the same ground its city view draws. Before this the generator
   rolled four generic kinds and every world looked identical. */
const WORLDS = [
  { id:'ks_gate_reach', tag:"Sahn'tekk", terrain:'dust',    hive:0.35 },
  { id:'ks_02',         tag:"Ussaleth", terrain:'dust',    hive:0.55 },
  { id:'ks_03',         tag:"Khai'ru", terrain:'dust',    hive:0.90 },
  { id:'ks_04',         tag:"Tessul", terrain:'veins',   hive:0.50 },
  { id:'ks_05',         tag:"Zhaal'un", terrain:'rift',    hive:0.70 },
  { id:'ks_06',         tag:"Marokketh", terrain:'dust',    hive:0.20 },
  { id:'ks_07',         tag:"Ossuveth", terrain:'ocean',   hive:0.95 },
  { id:'ks_08',         tag:"Nikkathaal", terrain:'ice',     hive:0.80 },
  { id:'ks_09',         tag:"Thennsur", terrain:'dust',    hive:0.45 },
  { id:'ks_10',         tag:"Vesskanoth", terrain:'tether',  hive:0.60 },
];
var worldIdx = 1;
function world(){ return WORLDS[worldIdx]; }

/* FOUR COPIES OF THE TERRAIN TABLE SHIPPED: COLONY_VISUAL server-side, the
   REACH_TERRAIN galaxy.js exposes, another in god-panel.js, and the one in
   WORLDS above. Four copies is three chances to drift, and the WORLDS copy is
   the one nothing else reads, so it becomes the fallback and the shared table
   becomes the authority. Not deleted: this file loads independently of
   galaxy.js and must not draw a featureless plain because a script was slow. */
function terrainKey(colonyId){
  var t = window.REACH_TERRAIN && window.REACH_TERRAIN[colonyId];
  if (t) return t;
  for (var i=0;i<WORLDS.length;i++) if (WORLDS[i].id === colonyId) return WORLDS[i].terrain;
  return 'dust';
}
function worldTerrain(){ return terrainKey(world().id); }

/* Feature vocabulary per terrain. Each world type fights differently because
   its cover is shaped differently: a station has hard geometric blocks and no
   sky, a rift is chasms you cannot cross, dust is boulders and low ridges. */
const TERRAIN_KIND = {
  dust:    ['ridge','boulder','boulder','crater','wreck'],
  veins:   ['seam','seam','ridge','boulder','wreck'],
  rift:    ['chasm','chasm','ridge','boulder','crater'],
  ice:     ['pressure','pressure','ridge','crater','boulder'],
  station: ['block','block','block','wreck','ridge'],
  tether:  ['anchor','ridge','boulder','wreck','block'],
  // Flooded terraces and the shelf above them. Without this entry an ocean
  // world fell through to dust and fought over boulders and craters.
  ocean:   ['pressure','pressure','block','wreck','crater'],
};
/* ── The world's own colour ───────────────────────────────────────────────
   SHAPE AND COLOUR ARE TWO DIFFERENT AUTHORINGS AND ONLY ONE OF THEM IS A
   DESIGN DECISION. What cover is shaped like on a rift world is a decision:
   chasms you cannot cross fight differently from boulders. What a rift world
   LOOKS like is not a decision, it is a fact about the sprite the player was
   staring at ninety seconds ago in the system view.

   Those were two hand-written tables and they had drifted. Four of the ten:

     ks_02, ks_06   desert_2 sprite, mean (228,76,40) RED    - drew tan
     ks_04          lava_2   sprite, mean (197,96,53) ORANGE - drew gold
     ks_05          barren_2 sprite, mean (131,253,224) TEAL - drew violet

   So colour comes off the art now. tools/planet-palette.mjs samples the
   shipped frames and emits planet-palette.js; this file looks the world up by
   the same COLONY_PLANET folder the galaxy map draws it from. A world cannot
   change colour between being looked at and being fought over, because there is
   nothing left to keep in sync.

   The old table survives as the fallback ONLY. If planet-palette.js has not
   loaded, or the world has no sprite entry, the field still draws in something
   defensible rather than in black. */
const TERRAIN_COL = {
  dust:'rgba(150,124,86,0.55)',   veins:'rgba(198,150,60,0.60)',
  rift:'rgba(150,110,180,0.55)',  ice:'rgba(130,190,215,0.55)',
  station:'rgba(120,150,170,0.60)', tether:'rgba(190,74,52,0.58)',
  ocean:'rgba(96,178,214,0.58)',
};

function rgba(c, a){ return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

/* Resolved once per engagement rather than per frame: the lookup is three
   property reads but the fallback path builds strings, and this runs inside
   draw(). Reseeding a world reseeds this. */
var PAL = null;
function paletteFor(colonyId){
  var tbl = window.PLANET_PALETTE;
  var body = window.COLONY_PLANET && window.COLONY_PLANET[colonyId];
  var p = (tbl && body && tbl[body.folder]) || (tbl && window.PLANET_PALETTE_DEFAULT) || null;
  if (p) return p;
  /* No palette file. Derive something from the legacy terrain colour so the
     horizon is still the right family rather than a grey slab. */
  var m = /rgba\((\d+),(\d+),(\d+)/.exec(TERRAIN_COL[terrainKey(colonyId)] || '');
  var c = m ? [ +m[1], +m[2], +m[3] ] : [122,132,150];
  var k = function(f){ return [ Math.round(c[0]*f), Math.round(c[1]*f), Math.round(c[2]*f) ]; };
  return { sky:k(0.16), horizon:k(0.42), ground:k(0.13), far:k(0.24), rock:c, edge:k(1.25) };
}

/* ── terrain ──────────────────────────────────────────────────────────── */
/* ── Ground, and why it is drawn in horizontal bands ──────────────────────
   The field was a flat colour with wireframes over it. It is a tiled surface
   now: fourteen greyscale patches in client/assets/space/terrain, tinted at
   runtime from the world's own planet palette, laid down by a repeating pattern.

   MODE 7, AND IT IS EXACT HERE RATHER THAN AN APPROXIMATION. The camera has no
   roll, so R[1] is zero, so a ray's vertical component depends only on the
   screen ROW and never on the column. Every pixel across one scanline therefore
   meets the ground plane at the same depth, and the map from screen x to world
   position along that row is exactly affine. One transformed fillRect per band
   instead of a per-pixel sample: about 250 draw calls a frame against 600,000.

   THE MOMENT ANYTHING ROLLS THE CAMERA THIS BECOMES WRONG, silently, as a
   shear. Nothing in this renderer rolls; if something ever does, this path has
   to become quad subdivision and there is no cheap patch for it.

   TILE_M IS FOUR METRES AND THAT IS A COMPROMISE, recorded here so nobody
   "corrects" it later. A 64px tile of this kind is drawn as about one pace. At
   an honest 1.5m the field needs sixty thousand of them and the grain is
   invisible past thirty metres; at twelve the tile is larger than a tank and
   the ground reads as an aerial photograph. Four is where grain survives to mid
   field and a tile is a squad frontage. It is the only setting that works. */
const TILE_M = 4;                 // world units per 64px tile
const PATCH_TILES = 8;            // patch is 8x8 tiles, 512px
const PATCH_PX = PATCH_TILES * 64;
const BAND_PX = 2;                // screen rows per ground band

/* Sheets load independently of everything else and a missing one falls back to
   the wireframe cover this file drew before 1.5.3.0. FM_TERRAIN_SRC exists for
   the same reason FM_TROOP_SRC does: a standalone harness has no assets
   directory beside it, and the failure is otherwise silent. */
var TER_BASE = 'assets/space/terrain/';
var _terImg = {}, _terPend = {};
function terSheet(key){
  if(_terImg[key] !== undefined) return _terImg[key];
  if(_terPend[key]) return null;
  _terPend[key] = 1;
  var m = window.FM_TERRAIN_SRC;
  /* NO HARDCODED FALLBACK VERSION. A literal here is a second copy of the build
     number that nothing asserts, and a stale cache bust is worse than none: it
     pins every client to whichever build the literal last said. FM_BUILD comes
     from coalition-sprites.js, which reach-check already ties to version.json.
     Absent, the query is dropped and the browser caches normally. */
  var bust = window.FM_BUILD ? ('?v=' + window.FM_BUILD) : '';
  var src = (m && m[key]) || (TER_BASE + key + '.png' + bust);
  var im = new Image();
  im.onload  = function(){ _terImg[key] = im;   PATS = null; };
  im.onerror = function(){ _terImg[key] = null; PATS = null; };
  im.src = src;
  return null;
}

/* Tinted patterns, rebuilt when the world changes rather than per frame.
   'color' composite takes hue and saturation from the fill and luminosity from
   underneath, so a greyscale patch keeps all of its grain and takes all of its
   colour from the palette. That is the whole reason one patch set covers every
   world in the galaxy instead of needing one per body.

   AND THEN THE LUMINANCE HAS TO COME DOWN TO MEET THE SKY. 'color' preserves
   the patch's own brightness; the patches are lit like a bright day and every
   planet palette is crushed dark so wireframes stay legible over it. Without
   the multiply pass the result is a noon-lit plain under a dusk sky, which
   reads as two images rather than as one place. */
var PATS = null;
/* Whether the solid ground is actually up this frame. Read by the side queue and
   by the wireframe fallback, so it lives at module scope rather than inside
   draw(): a sheet that fails to load has to take the sides down with it or the
   field is quads floating on a flat colour. */
var SOLID = false;
function lumOf(c){ return (0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]) / 255; }
function tintedPattern(key, tint, wantLum){
  var im = terSheet(key);
  if(!im) return null;
  var c = document.createElement('canvas');
  c.width = c.height = PATCH_PX;
  var g = c.getContext('2d');
  g.drawImage(im, 0, 0, PATCH_PX, PATCH_PX);
  g.globalCompositeOperation = 'color';
  g.fillStyle = 'rgb(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ')';
  g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  /* MEASURE, DO NOT GUESS. This was a multiply by wantLum*255*1.9, where 1.9
     was a constant tuned by eye against one patch on one world. It is wrong for
     every other patch, because the patches do not share a mean: sand ash is lit
     far brighter than basalt, so the same multiplier leaves one world's plain
     washed out and another's black. Measuring costs one 1x1 downscale and makes
     the target mean an actual target instead of a hope. */
  var probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  var pg = probe.getContext('2d', { willReadFrequently: true });
  pg.drawImage(c, 0, 0, 1, 1);
  var mean = 0.5;
  try {
    var d = pg.getImageData(0, 0, 1, 1).data;
    mean = (0.2126*d[0] + 0.7152*d[1] + 0.0722*d[2]) / 255;
  } catch(e){}                                  // tainted canvas: fall back blind
  var f = Math.max(0.05, Math.min(2.4, wantLum / Math.max(0.02, mean)));
  if(f < 0.995){
    g.globalCompositeOperation = 'multiply';
    var k = Math.max(0, Math.min(255, Math.round(f * 255)));
    g.fillStyle = 'rgb(' + k + ',' + k + ',' + k + ')';
    g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  } else if(f > 1.005){
    /* Lighten by screening rather than by turning the multiply up past one,
       which does nothing. A patch darker than the world it has to cover happens
       on the ice and station sets. */
    g.globalCompositeOperation = 'screen';
    var k2 = Math.max(0, Math.min(255, Math.round((1 - 1/f) * 255)));
    g.fillStyle = 'rgb(' + k2 + ',' + k2 + ',' + k2 + ')';
    g.fillRect(0, 0, PATCH_PX, PATCH_PX);
  }
  g.globalCompositeOperation = 'source-over';
  return ctx.createPattern(c, 'repeat');
}
function buildPatterns(){
  var p = PAL || (PAL = paletteFor(RB.colony));
  var t = worldTerrain();
  /* Targets derived from the palette rather than set by hand, and clamped at
     both ends. Above the palette's own ground figure because that was derived
     for a FLAT fill and a surface with its own light and shade reads darker at
     the same mean; below the rock figure because rock is the value a lit CLIFF
     FACE takes, and a whole plain at cliff brightness is a desert of snow.
     The clamps are what stop a world with a freak palette going to either
     extreme: no plain is ever a black void or a white sheet. */
  var clamp = function(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); };
  /* THE GROUND WAS DARK ON EVERY WORLD AND THE REASON HAS EXPIRED. The targets
     came from 1.5.2.0, where the whole field was stroked wireframes and value
     had to be crushed or a one-pixel line disappeared into the plain. Every
     unit is an opaque sprite now, and an opaque sprite reads against anything.

     Crushing survived the thing it was for, which is how an ice world and an
     ocean world both came out the same brown-black: the clamp at 0.34 was doing
     more of the work than the palette was, so worlds converged instead of
     diverging. Roughly doubled, and the ceiling raised well clear of where any
     Reach palette lands, so what separates Nikkathaal from Ussaleth is the
     palette again rather than a shared limit.

     TINTED AGAINST HORIZON, NOT GROUND. planet-palette derives `ground` as the
     DARK end of a body's range - the value a surface takes in its own shadow -
     and using it as the tint for a fully lit plain was asking the shadow colour
     to describe the whole world. horizon is the lit value, which is what a plain
     under a sky actually is. */
  /* BRIGHTNESS COMES FROM `mean`, WHICH IS THE ONLY UNNORMALIZED FIGURE THERE
     IS. Every other palette entry is pinned to a fixed target luminance by the
     generator, so tinting from `horizon` gave an ice world and a lava world the
     same value and the clamp did the rest: all ten Reach worlds landed on 0.36
     and the ground was uniformly dark whatever the planet was. mean is the art's
     own brightness, so Nikkathaal is a bright world and Tessul is not.

     HUE STILL COMES FROM THE NORMALIZED ENTRY. mean is a mean: on a body with a
     strong terminator it drifts toward whichever hemisphere was lit, and the
     normalized values were derived precisely to be stable against that. Value
     from one, colour from the other. */
  var m = p.mean || p.horizon;
  PATS = {
    base: tintedPattern(t + '_base', p.horizon, clamp(lumOf(m) * 0.52, 0.16, 0.66)),
    rock: tintedPattern(t + '_rock', p.rock,    clamp(lumOf(m) * 0.62, 0.20, 0.76)),
  };
  return PATS;
}
function pats(){ return PATS || buildPatterns(); }

function horizonY(){ return H*0.5 + Math.tan(cam.pitch)*focal; }

/* One band pass over a horizontal plane at world height planeY, optionally
   clipped. planeY is what lets a feature's TOP be drawn by the same code as the
   ground: a ridge top is another horizontal plane, six metres up. */
function bandPass(pattern, planeY, clipPath, bounded){
  if(!pattern) return;
  var eye = cam.y - planeY;
  if(eye <= 0.05) return;                     // camera at or below the plane
  var hy = horizonY();
  var y0 = Math.max(0, Math.floor(hy) + 1);
  try {
    pattern.setTransform(new DOMMatrix().scale((TILE_M * PATCH_TILES) / PATCH_PX));
  } catch(e){}                                // older engines: pattern draws 1:1

  for(var y = y0; y < H; y += BAND_PX){
    var yb = y + BAND_PX;
    var dyA = (H*0.5 - y )*U[1] + focal*F[1];
    var dyB = (H*0.5 - yb)*U[1] + focal*F[1];
    if(dyA >= -1e-6 || dyB >= -1e-6) continue;
    var tA = -eye/dyA, tB = -eye/dyB;
    if(tA <= 0 || tB <= 0 || tA > 40000) continue;

    var ax = cam.x + tA*((0 - W*0.5)*R[0] + (H*0.5 - y)*U[0] + focal*F[0]);
    var az = cam.z + tA*((0 - W*0.5)*R[2] + (H*0.5 - y)*U[2] + focal*F[2]);
    var e1x = tA*R[0]*W, e1z = tA*R[2]*W;                       // (0,y) -> (W,y)
    var cx2 = cam.x + tB*((0 - W*0.5)*R[0] + (H*0.5 - yb)*U[0] + focal*F[0]);
    var cz2 = cam.z + tB*((0 - W*0.5)*R[2] + (H*0.5 - yb)*U[2] + focal*F[2]);
    var e2x = cx2 - ax, e2z = cz2 - az;                         // (0,y) -> (0,y+BAND)

    var det = e1x*e2z - e1z*e2x;
    if(!det || !isFinite(det)) continue;
    var L00 =  W*e2z/det,    L01 = -W*e2x/det;
    var L10 = -BAND_PX*e1z/det, L11 =  BAND_PX*e1x/det;

    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, W, BAND_PX + 0.5); ctx.clip();
    if(clipPath) ctx.clip(clipPath);
    ctx.transform(L00, L10, L01, L11, 0 - (L00*ax + L01*az), y - (L10*ax + L11*az));
    ctx.fillStyle = pattern;
    /* THE PLAIN DOES NOT STOP WHERE THE FIELD DOES. Filling only the playable
       420x320 leaves a hard straight edge across the middle distance: the orbit
       camera hides it behind haze and a low one does not, where it reads as the
       world being a rug on a floor. The pattern repeats for nothing, so the
       ground runs well past the fight and FIELD_W/FIELD_D stay what they always
       were, a gameplay extent rather than a visible one. */
    if(bounded) ctx.fillRect(-FIELD_W*0.5, 0, FIELD_W, FIELD_D);
    else        ctx.fillRect(-FIELD_W*2.5, -FIELD_D*1.5, FIELD_W*5, FIELD_D*5);
    ctx.restore();
  }
}

var terrain=[], slots=[], terCount=52;
var hiveCities=[];
function genTerrain(seed){
  const rnd=mulberry32(seed^0x9E3779B9);
  terrain=[]; slots=[];
  for(let i=0;i<terCount;i++){
    const pool=TERRAIN_KIND[worldTerrain()]||TERRAIN_KIND.dust;
    const kind=pool[(rnd()*pool.length)|0];
    const cx=0.05+rnd()*0.90, cy=0.08+rnd()*0.84;
    let w,h,ht;
    if(kind==='ridge'){ w=0.09+rnd()*0.13; h=0.022+rnd()*0.02; ht=3.2+rnd()*3.4; }
    else if(kind==='boulder'){ w=0.035+rnd()*0.05; h=0.026+rnd()*0.03; ht=3.6+rnd()*4.4; }
    else if(kind==='crater'){ w=0.06+rnd()*0.08; h=0.032+rnd()*0.03; ht=-1.6-rnd()*1.4; }
    // seam: a long low ore outcrop, wide frontage and almost no height
    else if(kind==='seam'){ w=0.14+rnd()*0.16; h=0.014+rnd()*0.012; ht=1.6+rnd()*1.6; }
    // chasm: a hole, deeper and longer than a crater, and impassable
    else if(kind==='chasm'){ w=0.10+rnd()*0.14; h=0.030+rnd()*0.034; ht=-5.0-rnd()*4.0; }
    // pressure ridge: ice thrown up in a long wall
    else if(kind==='pressure'){ w=0.12+rnd()*0.16; h=0.016+rnd()*0.014; ht=4.2+rnd()*3.0; }
    // block: station decking. Hard cover, right angles, no weathering.
    else if(kind==='block'){ w=0.05+rnd()*0.07; h=0.040+rnd()*0.05; ht=4.0+rnd()*3.0; }
    // anchor: a tether footing, tall and narrow
    else if(kind==='anchor'){ w=0.03+rnd()*0.03; h=0.020+rnd()*0.02; ht=9.0+rnd()*7.0; }
    else { w=0.05+rnd()*0.07; h=0.024+rnd()*0.024; ht=3.0+rnd()*3.2; }
    const n = kind==='crater'||kind==='chasm' ? 9
            : kind==='block' ? 4
            : kind==='ridge'||kind==='seam'||kind==='pressure' ? 7 : 6;
    const pts=[];
    if(kind==='block'){
      // Decking is fabricated. No jitter, or a station reads like a quarry.
      pts.push([cx-w*0.5,cy-h*0.5],[cx+w*0.5,cy-h*0.5],[cx+w*0.5,cy+h*0.5],[cx-w*0.5,cy+h*0.5]);
    } else {
      for(let k=0;k<n;k++){
        const a=(k/n)*Math.PI*2, j=0.72+rnd()*0.5;
        pts.push([cx+Math.cos(a)*w*0.5*j, cy+Math.sin(a)*h*0.5*j]);
      }
    }
    const heavy=(kind==='ridge'||kind==='wreck'||kind==='pressure'||kind==='block')&&w>0.09;
    /* Which mesh this feature wears and how it is turned, decided ONCE at
       generation off the same seeded rng as everything else. Picking per frame
       would make a rock spin; picking per open would make Ussaleth a different
       place every time you looked at it, which is the property genTerrain
       exists to prevent. */
    const feat={kind,cx,cy,w,h,ht,pts,heavy,slotIdx:[],
                meshPick:(rnd()*997)|0, meshRot:rnd()*Math.PI*2};
    terrain.push(feat);
    const per=Math.min(30,Math.max(5,Math.round(w*150)));
    for(let k=0;k<per;k++){
      const t=(k+0.5)/per, sx=cx-w*0.42+w*0.84*t;
      /* Heavy positions are berms, not the whole ridge. Marking every slot on
         a qualifying feature made heavy 56% of all positions, because wide
         features are exactly the ones that generate the most slots and also
         the ones that qualify. A big ridge has a few hull-down spots. */
      const hv = heavy && (k%2===0);
      feat.slotIdx.push(slots.length,slots.length+1);
      slots.push({x:sx,y:cy+h*0.52+0.006,face:1,heavy:hv,owner:-1,f:i});
      slots.push({x:sx,y:cy-h*0.52-0.006,face:-1,heavy:hv,owner:-1,f:i});
    }
  }
  /* The collision index is part of generating terrain, not a thing a caller
     remembers to do afterwards. genTerrain is the only writer of `terrain`, so
     it is also the only place the grid can go stale. */
  buildTerGrid();
}

/* ── The field has edges, and the depth offsets did not know it ───────────
   CL.front is z.hive/100 and NOTHING ELSE (see reachWatch). server/reach.js
   seeds every zone at hive:100 and relights a cleared one at hive:100, so the
   first thing anyone ever sees on a new front is front = 0.95, the top of the
   clamp. Every depth offset in stepField is measured off front as a FLAT
   CONSTANT: a tank stands at front+0.20, front+0.30 once it has been hit, an
   engineer's band tops out at front+0.40+fwd. At 0.95 those are 1.15, 1.25 and
   1.41, and wz(y)=(1-y)*FIELD_D maps anything past 1 to negative z - behind our
   own baseline, on top of the camera. Nothing clamped it, so the tank drove
   backwards out of the world and kept fighting from off screen: still alive,
   still acquiring, still counted against the funding a player had just paid
   for. That is the reversing armour.

   The mirror is equally real and only looks rarer because a zone has to be
   nearly won to reach it: at front=0.05 a spitter's band floor is front-0.22 =
   -0.17, off the far edge, and the brood walks out the other side.

   SCALED, NOT CLAMPED. Clamping puts the engineer, the tank and the rifleman
   all on 0.98 and the line loses its layering exactly when it is most pinned.
   Offsets are multiplied by the room that actually exists instead, so an army
   with its back against the baseline reads as stacked up with no depth - which
   is what pinned looks like - while still keeping who stands in front of whom.

   The two DEPTH_NEED figures are the deepest offset each side asks for. They
   are the only numbers here that have to be kept in step with the band block
   below, which is why tools/reach-terrain-check.mjs asserts them against it. */
const Y_LO = 0.02, Y_HI = 0.98;
/* The usable travel of the front. Not 0 to 1 and not the old 0.05 to 0.95: an
   army needs ground BEHIND the line to stand in, and at 0.95 there is none.

   ONE FUNCTION, BECAUSE THERE WERE TWO COPIES OF THIS AND ONLY ONE GOT FIXED.
   reachWatch set the front when an engagement opened and the two second tick set
   it again from live state, each with its own copy of the clamp. So widening the
   range in reachWatch alone would have looked like it worked for two seconds and
   then been silently overwritten, every tick, forever.

   The duplicate had also been carrying `(Z.hive||50)` since before that bug was
   found and fixed at the other site: a zone at hive 0 - every hive-held metre
   taken, the whole point of the layer - fell through to the 50 default and drew
   its line at midfield on every tick. Fixing one of two copies is not fixing
   anything, and this is what that looks like three patches later. */
const REACH_FRONT_LO = 0.20, REACH_FRONT_HI = 0.80;
function frontFor(hive){
  /* typeof, not `||`: zero is a real reading and the most meaningful one there
     is. Absent falls back to the middle of the range rather than to a literal
     0.5, so the default moves with the range instead of drifting out of it. */
  var h = (typeof hive === 'number' && isFinite(hive)) ? hive : 50;
  return REACH_FRONT_LO + Math.max(0, Math.min(1, h/100)) * (REACH_FRONT_HI - REACH_FRONT_LO);
}
/* THE WIDEST OFFSET ON EACH SIDE, WHICH IS NOT ALWAYS A BAND. This was 0.220
   on the hive line, taken off the spitter band, and it was wrong the moment the
   tank standoff was made side-aware: a struck tank asks for 0.30, so a hive tank
   scaled against 0.220 still crossed the far edge between hive 8 and hive 31.
   Caught by running the arithmetic, not by reading it. The number is the
   maximum over every offset measured off front on that side, bands and
   standoffs together. */
const DEPTH_NEED_HOME = 0.455;   // eng hi 0.40 + jade fwd 0.055
const DEPTH_NEED_HIVE = 0.300;   // struck tank standoff (spit band is only 0.22)
function roomK(side, front){
  const room = side===1 ? (Y_HI-front) : (front-Y_LO);
  const need = side===1 ? DEPTH_NEED_HOME : DEPTH_NEED_HIVE;
  return Math.max(0, Math.min(1, room/need));
}

/* ── Solid ground, in the movement sense ──────────────────────────────────
   Every feature on every map was scenery as far as pathing was concerned. The
   cover half of terrain has worked for a long time - genTerrain hangs two
   firing positions per metre of frontage off each feature, pickFeature takes a
   fireteam to one weighted toward its objective, COVER_STOP eats frontal fire
   at a claimed slot - but a unit that had not claimed a slot walked straight
   through the rock the slot was on. Riflemen crossed station decking, tanks
   drove through chasms the generator's own comment calls impassable.

   WHICH KINDS BLOCK IS DECIDED BY KIND, NOT BY MAP, and that is what makes this
   cover every world without a per-world table to drift. TERRAIN_KIND already
   gives all seven terrains their feature vocabulary out of one shared set of
   kinds, so a rule keyed on kind is automatically a rule on dust, veins, rift,
   ice, station, tether and ocean at once.

   A crater is the exception and it is a deliberate one. It is shallow, it is
   the only feature you fight from INSIDE rather than behind, and making it
   solid would turn the one piece of cover on the field that reads as shelter
   into a wall men walk around. A chasm is five to nine deep and does block.

   The hull is the ellipse the feature was generated from, not its jittered
   outline. The outline reaches to w*0.5*1.22 on its widest lobe, so the
   collision shape sits slightly INSIDE the mesh. That is the correct direction
   to be wrong in: slots are placed at cy +/- h*0.52, just outside the hull, so
   every cover position stays reachable. A hull that matched the lobes would
   have men unable to reach the cover the same rock provides. */
const PASSABLE_KIND = { crater:1 };
function blocksMove(f){ return !PASSABLE_KIND[f.kind]; }

/* Features bucketed by x so a unit tests three or four of them and not fifty
   two. Seven hundred units against fifty two features every frame is thirty six
   thousand ellipse tests, and this loop is already the heaviest thing in the
   client. */
const TGRID_N = 16;
var terGrid = null;
function buildTerGrid(){
  terGrid = new Array(TGRID_N);
  for(let i=0;i<TGRID_N;i++) terGrid[i] = [];
  for(let i=0;i<terrain.length;i++){
    const f = terrain[i];
    if(!blocksMove(f)) continue;
    const a = Math.max(0, Math.floor((f.cx-f.w*0.5)*TGRID_N));
    const b = Math.min(TGRID_N-1, Math.floor((f.cx+f.w*0.5)*TGRID_N));
    for(let c=a;c<=b;c++) terGrid[c].push(i);
  }
}
function terCell(x){ return Math.max(0, Math.min(TGRID_N-1, (x*TGRID_N)|0)); }

/* Displace a unit out of anything solid it has ended the frame inside of.
   Called ONCE, in its own pass after the unit loop, rather than at each place a
   position is written. There are four such places today and the next branch
   somebody adds would be the fifth: one pass cannot be forgotten by code that
   does not exist yet. A unit is inside a rock for at most one frame, which at
   sixty is not a thing anyone sees. */
function pushOut(u){
  if(u.alt > 0) return;                       // flying over it
  let col = terGrid && terGrid[terCell(u.x)];
  if(!col || !col.length) return;
  /* A hull is wider than a man. Armour is given more standoff than infantry so
     a tank reads as parked beside the ridge rather than shaved into it. */
  const pad = u.cls==='tank' ? 0.012 : u.cls==='turret' ? 0.006 : 0.004;
  /* FEATURES OVERLAP, so one pass is not a resolution. genTerrain scatters
     fifty two hulls over the field with no separation rule at all, and on veins
     a seam is up to 0.30 wide: clearing the rock a man is standing in routinely
     puts him inside the one next to it. Four sweeps clears every cluster the
     generator actually produces on all seven terrains, measured rather than
     guessed, and it bails the moment nothing moved so the normal case - a unit
     touching nothing, which is most of them - costs one distance test. */
  for(let pass=0; pass<4; pass++){
    let hit = 0;
    for(let n=0;n<col.length;n++){
      const f = terrain[col[n]];
      const rx = f.w*0.5+pad, ry = f.h*0.5+pad;
      const dx = (u.x-f.cx)/rx, dy = (u.y-f.cy)/ry;
      const d2 = dx*dx+dy*dy;
      if(d2 >= 1) continue;
      hit = 1;
      /* Spawned exactly on the centre. There is no normal to push along, so
         pick one. reviveAsHive scatters across the whole field and will land a
         rusher inside a boulder eventually. */
      if(d2 < 1e-9){ u.x = f.cx+rx; continue; }
      const s = 1/Math.sqrt(d2);
      u.x = f.cx + dx*s*rx;
      u.y = f.cy + dy*s*ry;
    }
    if(!hit) break;
    /* Sliding out of one hull can carry a unit into a NEIGHBOURING column, and
       the bucket list was resolved for where he started. */
    const c2 = terGrid[terCell(u.x)];
    if(c2 && c2 !== col) col = c2;
  }
}

/* AROUND, RATHER THAN INTO AND THEN ALONG. Push-out on its own makes a man
   walk at a rock, stop dead, and slide sideways along its face until he clears
   it, which reads as scraping past rather than as going round. One look-ahead
   fixes the read: if a solid feature is straddling my lane between me and the
   depth I am walking to, steer at its nearer edge first and let the objective
   reassert itself once I am past.

   This is deliberately NOT a path search. Seven hundred units cannot afford one
   and do not need one, because the line already has objective-directed lateral
   motion for the detour to ride on. It is applied only on the objective advance
   and never on the approach to a claimed slot: that slot is ON a feature face
   by construction, so an avoidance term there would fight the thing it is
   walking to. */
function avoidX(u, tx, ty){
  const col = terGrid && terGrid[terCell(u.x)];
  if(!col || !col.length) return tx;
  const dirY = ty > u.y ? 1 : ty < u.y ? -1 : 0;
  if(!dirY) return tx;
  for(let n=0;n<col.length;n++){
    const f = terrain[col[n]];
    const rx = f.w*0.5, ry = f.h*0.5;
    if(Math.abs(f.cx-u.x) > rx) continue;          // not in my lane
    const gap = (f.cy-u.y)*dirY;
    if(gap < 0 || gap > ry+0.09) continue;         // behind me, or not yet my problem
    return Math.max(0.02, Math.min(0.98,
      f.cx + (u.x >= f.cx ? 1 : -1)*(rx+0.014)));
  }
  return tx;
}

/* ── hive cities ──────────────────────────────────────────────────────────
   Khai'sultull settlement, drawn as chitin rather than architecture: no right
   angles, no repeated modules, no windows. A city is a nest mound with a spire
   over it, ribbed arches leaning inward, and tunnel mouths at ground level
   that the brood comes out of.

   They are not scenery. A city is the deepest hive cover on the map, it seeds
   its own firing positions, and its mouths are where rushers spawn from, so a
   world with a city on it fights differently from one without. */
/* ── camps ───────────────────────────────────────────────────────────────
   CAMPS ARE A DISPLAY OF SERVER CONTROL, NOT A SECOND SOURCE OF IT. This is
   the whole design constraint and it is worth stating plainly, because the
   obvious version of this feature is the wrong one: camps that are captured
   client-side and then decide where the front sits would make the client an
   authority on ground state, and the server already owns that. Two authorities
   on one number is how a client starts disagreeing with the server about who
   holds a zone.

   So ownership is a PURE FUNCTION of the front the server sent. A camp behind
   the line is ours, a camp beyond it is theirs, and that is the entire rule.
   Nothing here can move the front; the front moves these. When the server says
   hive control fell, camps flip, and the flip is the picture of the fall.

   Positions are fixed along the depth axis and seeded per zone, so the same
   ground always has the same camps and a viewer who looks away and back sees
   the same map. */
const CAMP_N=5;
var camps=[];
function genCamps(seed){
  const rnd=mulberry32(seed^0xC0FFEE);
  camps.length=0;
  for(let i=0;i<CAMP_N;i++){
    camps.push({
      y: 0.10 + (i/(CAMP_N-1))*0.80,
      x: 0.20 + rnd()*0.60,
      r: 10 + rnd()*5,
      sd: (rnd()*1e9)|0,
      own: 0,          // last owner seen, for detecting a flip
      flash: 0,        // ms remaining on the flip banner
    });
  }
}
/* Coalition holds the near end of the field, so a camp is ours when it lies
   behind the front and theirs when it lies beyond it. CL.front is the hive
   fraction the server reports. */
function campOwner(c){ return c.y > CL.front ? 1 : -1; }
function campsHeld(side){
  let n=0; for(const c of camps) if(campOwner(c)===side) n++; return n;
}
/* The rearmost camp we hold, which is where reinforcements come from. If we
   hold none, they come on at the map edge as before. */
function rallyY(side){
  let best=null;
  for(const c of camps){
    if(campOwner(c)!==side) continue;
    if(best===null || (side===1 ? c.y>best : c.y<best)) best=c.y;
  }
  return best;
}
function stepCamps(dt){
  for(const c of camps){
    const o=campOwner(c);
    if(c.own===0){ c.own=o; continue; }
    if(o!==c.own){
      c.own=o; c.flash=2600;
      blast(c.x,c.y,BLAST*1.4);
      flash(c.x,c.y,o,0,1);
    } else if(c.flash>0) c.flash-=dt;
  }
}

/* ── works ────────────────────────────────────────────────────
   WHAT THE ROOM VOTED FOR, STANDING ON THE GROUND IT WAS VOTED ONTO. Four
   works have been in the server since the FOB vote shipped, they price pushes
   and scale repels and raise ceilings, and until now the only place any of it
   was visible was a line of text in the GM panel. A player could vote for a
   Spire, get the discount, and never see the thing they bought.

   THEY ARE NOT COVER AND THEY SEED NO FIRING POSITIONS, which is the opposite
   of the choice made for hive cities, and the difference is worth stating. A
   hive city has no server side effect at all, so cover is the only way it can
   mean anything. A work already means something: bastion raises the armour
   ceiling, pad the air ceiling and cuts the strike timer, cut softens a repel,
   spire discounts the push. Handing it cover as well would price the same
   structure twice, once in a number the server computes and once in a
   simulation the client runs, and the two would never agree.

   POSITION IS SEEDED FROM THE WORK'S OWN IDENTITY, not from where it sits in
   the array. A work is one of four types and each stands once per world, so
   the type is the identity; a mound has no type and carries the timestamp it
   was raised at. Index seeding would slide every standing work sideways the
   moment another went up. */
var works=[], mounds=[];
function hashStr(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h|0;
}
function genWorks(world, zoneIdx){
  works.length=0; mounds.length=0;
  if(!world) return;
  const zi=zoneIdx|0;
  const fl=(world.fobs||[]).filter(f=>(f.zone|0)===zi);
  for(const f of fl){
    const rnd=mulberry32(CL.seed ^ hashStr('fob:'+f.type));
    works.push({
      type:f.type,
      // The near end of the field is ours. A work stands on ground already
      // taken, which is behind the line and out of the fighting.
      x:0.16+rnd()*0.68,
      // Kept off the very near edge. A work is deep enough that its own depth
      // extent cannot push geometry behind the Coalition baseline, where the
      // near plane clips it and half a bastion disappears at some camera
      // angles and not others.
      y:0.875+rnd()*0.065,
      r:12+rnd()*4,
      sd:(rnd()*1e9)|0,
    });
  }
  const nl=(world.nodes||[]).filter(n=>(n.zone|0)===zi);
  for(const n of nl){
    const rnd=mulberry32(CL.seed ^ hashStr('node:'+(n.at|0)));
    mounds.push({
      x:0.14+rnd()*0.72,
      y:0.06+rnd()*0.075,
      r:10+rnd()*4,
      sd:(rnd()*1e9)|0,
      /* A CLUTCH ROUND THE MOUND. The data model has always called these
         spawning mounds and the wireframe drew a closed dome, which is a
         building. The pack has an egg with a hatch animation, so what a
         spawning mound looks like is eggs.

         Positions seeded off the mound's own seed, so a mound is the same mound
         every time the zone is opened, and offset outward: they sit AROUND the
         dome, not on it, because a clutch on top of the crown reads as decoration
         and a clutch at the foot reads as something the mound produced. */
      eggs:(function(){
        const out=[], n=4+((rnd()*4)|0);
        for(let k=0;k<n;k++){
          const a=rnd()*6.283, rr=1.0+rnd()*0.55;
          out.push({ dx:Math.cos(a)*rr, dz:Math.sin(a)*rr*0.7,
                     ph:(rnd()*40)|0, sc:0.8+rnd()*0.5 });
        }
        return out;
      })(),
    });
  }
}

function genHiveCities(seed){
  hiveCities=[];
  const rnd=mulberry32(seed^0x51ED2701);
  // Scale with how much of the world the brood still holds. A world nearly
  // taken has one holdout mound; an untouched one is dense with them.
  const held=world().hive;
  const n=Math.max(1,Math.round(1+held*4));
  for(let i=0;i<n;i++){
    const cx=0.10+rnd()*0.80;
    // Cities sit on the brood side, deeper the more they hold.
    const cy=0.04+rnd()*0.30*held;
    const r=0.030+rnd()*0.030;
    const spire=16+rnd()*22;
    const arches=4+((rnd()*4)|0);
    const mouths=2+((rnd()*3)|0);
    const lean=0.5+rnd()*0.5;
    const c={cx,cy,r,spire,arches,mouths,lean,seed:(rnd()*1e9)|0,slotIdx:[]};
    hiveCities.push(c);
    // Firing positions around the mound skirt, brood face only.
    const per=5+((rnd()*4)|0);
    const fi=terrain.length;
    terrain.push({kind:'hive',cx,cy,w:r*2,h:r*1.3,ht:spire*0.35,
                  pts:ringPts(cx,cy,r,r*0.62,9,rnd),heavy:true,slotIdx:[],city:i});
    const feat=terrain[fi];
    for(let k=0;k<per;k++){
      const a=(k+0.5)/per*Math.PI*2;
      const sx=cx+Math.cos(a)*r*1.15, sy=cy+Math.sin(a)*r*0.75;
      feat.slotIdx.push(slots.length,slots.length+1);
      slots.push({x:sx,y:sy+0.006,face:1, heavy:false,owner:-1,f:fi});
      slots.push({x:sx,y:sy-0.006,face:-1,heavy:k%2===0,owner:-1,f:fi});
    }
  }
}
function ringPts(cx,cy,rx,ry,n,rnd){
  const pts=[];
  for(let k=0;k<n;k++){
    const a=(k/n)*Math.PI*2, j=0.78+rnd()*0.44;
    pts.push([cx+Math.cos(a)*rx*j, cy+Math.sin(a)*ry*j]);
  }
  return pts;
}

/* ── units ────────────────────────────────────────────────────────────── */
var units=[], cap=700, batched=true, showGrid=true, showSlots=false;
var rushShare=0.30, armShare=0.12, flyerShare=0.022;  // derived, see applyGarrison

/* ── What the brood sends ─────────────────────────────────────────────────
   ONE FUNCTION, TWO CALLERS. The seeding loop and the reinforcement path each
   had their own copy of this ladder, written slightly differently, so adding a
   creature meant editing both and any divergence would have shown up as a
   reinforcement wave with a different composition to the one it replaced. That
   is the kind of drift that reads as a bug in the war model rather than as a
   typo in a share table.

   THE NEW CREATURES COME OUT OF RUSH AND SPIT, not out of thin air. Total brood
   count is set by garrison and control and is not touched here; what changed is
   that the same number of bodies is now a more varied set of them. Heavies stay
   rare on purpose: a brute or a large fly reads as an event, and it stops doing
   that the moment there are twenty of them. */
/* WHICH CLASS TABLE AN AWAY UNIT DRAWS FROM IS A PROPERTY OF ITS FACTION, not
   of its side. The away side was the brood because it had always been the
   brood, so every class table, sprite table and animation router on that half
   of the field asked `side === -1` and got the right answer by coincidence. Put
   the Syndicate on the away line and every one of their soldiers would have been
   a crawling horror.

   A polity on the away side draws INFANTRY: the same class mix the home line
   uses, minus the things funding buys. There is no funding on the away side -
   nobody is buying the enemy gunships - so it is riflemen, shield troopers and
   the occasional engineer, which is what a garrison is. */
function awayClass(rnd, fac){
  if(isBroodFac(fac)) return broodClass(rnd);
  var r = rnd();
  if(r < 0.10) return 'eng';
  if(r < 0.34) return 'enf';
  return 'inf';
}
function broodClass(rnd){
  var r = rnd();
  var wingShare  = flyerShare * 0.30;      // the large fly, rarest thing airborne
  var bruteShare = rushShare  * 0.16;
  var leapShare  = rushShare  * 0.26;
  var grubShare  = rushShare  * 0.14;
  var mawShare   = rushShare  * 0.05;      // the rarest thing on the ground
  var rushRest   = rushShare - bruteShare - leapShare - grubShare - mawShare;
  var t = 0;
  if(r < (t += wingShare))  return 'wing';
  if(r < (t += flyerShare)) return 'flyer';
  if(r < (t += bruteShare)) return 'brute';
  if(r < (t += leapShare))  return 'leap';
  if(r < (t += mawShare))   return 'maw';
  if(r < (t += grubShare))  return 'grub';
  if(r < (t += rushRest))   return 'rush';
  return 'spit';
}

/* ── Factions ─────────────────────────────────────────────────────────────
   SIDE IS NOT FACTION AND MUST NOT BECOME IT. u.side is +1 and -1 in two dozen
   places and is used arithmetically, including -p.side in the damage path, so a
   third value there breaks combat in ways that are hard to see. Faction is a
   separate tag: side says which line you are on, fac says whose uniform you are
   wearing. Two factions can share a side, which is the whole point.

   It also buys the faction war for free later. side stops meaning Coalition and
   starts meaning belligerent A and B; Coalition against Jade is side 1 fac coal
   against side -1 fac jade, on the same arithmetic, with no combat code
   touched.

   COLOUR KEYS ON FAC, NOT SIDE, everywhere. The brood's amber is a faction
   colour too, not "whatever side minus one happens to draw as". */
/* THE WIREFRAME COLOURS HAVE TO AGREE WITH THE SPRITES OR THE SAME UNIT CHANGES
   FACTION WHEN IT GETS FAR ENOUGH AWAY. Infantry draw as sprites near the camera
   and as wireframe past the size cutoff, so these are not decoration: they are
   the same three uniforms at a different level of detail.

   Jade is GREEN because the art ships green and Jade no longer wears a recolour
   of anyone's kit. Coalition is BLUE because its old teal sat a few degrees from
   the Hound's own turquoise, and two factions in two shades of one hue is not a
   distinction at twenty pixels. Grey steel is retired with the Jade tint.

   Blue, green, amber: three hues far enough apart to survive haze, distance and
   a tinted ground. */
/* THE FIFTH COPY OF A FACTION'S IDENTITY, and the last one to move. The
   wireframe colours were a private table here while the sprite tints were a
   private table in coalition-sprites.js, which is precisely the arrangement the
   comment above warns against: the same unit changing faction when it drops past
   the sprite size cutoff is what happens when those two disagree, and nothing
   made them agree except somebody editing both.

   One row per faction in client/assets/factions.js now, carrying the tint AND
   the wireframe colours, so they cannot drift. This is a live view of that
   table, built once, with the old three kept as a FALLBACK for the same reason
   the god panel keeps a terrain fallback: reach-battle.js can be parsed before
   factions.js has loaded, and a free reference would draw a black field rather
   than a wrong one. tools/faction-check.mjs asserts the fallback agrees with the
   registry, so it cannot rot into a second authority. */
var FAC_FALLBACK = {
  coal: { line:[84,148,236],  heavy:[124,178,248], air:[164,206,252], blade:[196,222,254] },
  jade: { line:[86,180,140],  heavy:[124,212,170], air:[160,232,198], blade:[192,240,216] },
  khai: { line:[194,85,31],   heavy:[226,110,40],  air:[236,146,64],  blade:[214,112,44]  },
};
var FAC = new Proxy({}, {
  get: function(_, f){
    var r = window.FM_FACTIONS && window.FM_FACTIONS[f];
    if (r) return r;
    return FAC_FALLBACK[f] || FAC_FALLBACK.jade;
  },
  has: function(_, f){
    return !!((window.FM_FACTIONS && window.FM_FACTIONS[f]) || FAC_FALLBACK[f]);
  }
});
function facOf(u){ return u.fac || (u.side===1 ? 'jade' : 'khai'); }

/* Which skin tone a soldier wears. FIXED FOR HIS LIFE, off his index, so he does
   not change appearance when he takes cover, dies, or is reinforced back onto
   the field - which is what a per-frame or per-spawn roll would do and which
   reads as a different man arriving.

   COALITION ONLY, DELIBERATELY. The Coalition is a treaty of colonies and the
   Jade Circuit is one nation, so the Circuit's line is uniformly the tone the
   art ships with. That is a statement about the Circuit, not an omission, and it
   is why this returns a constant for them rather than a narrower range.

   The multiplier is prime against the tone count so consecutive indices do not
   walk the list in order and produce visible banding along a fireteam. */
/* Which kit a soldier turned up in. -1 for every faction that issues uniforms,
   which is all of them but the Syndicate. Off the same index as his tone and
   fixed for his life, so he does not change coats when he takes cover. */
function kitOf(u){
  var api = window.FM_FAC_API;
  return (api && api.kitFor) ? api.kitFor(u.fac, u.i||0) : -1;
}
function skinOf(u){
  /* THE POLICY MOVED TO THE ROW AND THE INDEX MATH WENT WITH IT. This was
     `if(u.fac !== 'coal') return 0;` plus a modulo six, which is two assertions
     the caller had no business making: that exactly one faction has a range, and
     that every range is six long. The Guild's is four and the Void's is a single
     steel casing.

     Still fixed for a soldier's life, still off his index, because a per-frame
     or per-spawn roll reads as a different man arriving. Returns 0 rather than
     null on the fallback path: the sprite layer resolves the policy itself and
     ignores this when the faction has none, so the value only has to be a
     stable integer. */
  var api = window.FM_FAC_API;
  if(!api) return u.fac === 'coal' ? ((u.i||0) * 7 + 3) % 6 : 0;
  var t = api.skinFor(u.fac, u.i||0);
  return t === null ? 0 : t;
}

/* HOW MUCH OF THE FRIENDLY LINE IS JADE, and it starts at ONE.
   This defaulted to zero, which meant a battlefield opened before any server
   payload arrived, or on a world the GM had never touched, drew a full
   Coalition line in a war the Coalition has not joined. The Reach war is Jade
   Circuit's: their FTL programme made the contact, the brood came back down the
   line at them, and until the Coalition declares there is no Coalition on the
   ground. 1 is the war as it actually stands; anything below it is the server
   saying the Coalition has entered and sent this much here.

   Server-authoritative through effJade. This value is paint. */
var jadeFrac = 1;
/* Whether the Coalition is in the war at all, off the payload root. Distinct
   from jadeFrac being below 1: a declared Coalition that has committed nothing
   to THIS world still names the alliance differently on every label. */
var coalIn = 0;

/* ── The roster, and what it replaces ────────────────────────────────────
   `jadeFrac` IS A SCALAR AND A SCALAR CANNOT NAME ANYBODY. `rnd() < jadeFrac ?
   'jade' : 'coal'` works only because there are exactly two candidates and the
   reader already knows which two; it has no way to express a Void and Guild
   line, and no way at all to express an away side that is not the brood.

   The server ships a roster on every world now, composed or derived, so this is
   a view onto it rather than a second model. jadeFrac survives as a DERIVED
   value because the funding strip and a handful of labels read it, and deriving
   it from the roster is how those keep working without either becoming a second
   authority on the same fact. */
var ROSTER = { home:[{fac:'jade',share:1}], away:[{fac:'khai',share:1}], fwd:'jade' };

/* Weighted draw from a side's line. Walks the cumulative share, which is the
   cheapest correct sampler for a list this short and, unlike a lookup table,
   costs nothing to rebuild when a GM changes the mix mid engagement.

   FALLS BACK TO THE SIDE'S HISTORICAL DEFAULT rather than to undefined. A unit
   with no faction draws no uniform and no wireframe colour, so an empty roster
   would delete an army from the screen; the old two-faction answer is at least
   an army. */
function pickFac(side, rnd){
  const L = side===1 ? ROSTER.home : ROSTER.away;
  if(!L || !L.length) return side===1 ? 'jade' : 'khai';
  let r = (rnd ? rnd() : Math.random()), acc = 0;
  for(let i=0;i<L.length;i++){ acc += L[i].share; if(r < acc) return L[i].fac; }
  return L[L.length-1].fac;
}

/* Is this faction a creature rather than a polity. THE CLASS TABLE USED TO ASK
   `side === -1` AND THAT WAS THE SAME MISTAKE AS EVERYWHERE ELSE, one level
   deeper: the away side was the brood because the away side had always been the
   brood. Put the Syndicate on the away line and every unit would have been a
   crawling horror wearing a creature sheet.

   It reads the registry rather than a list here, so `brood` is declared once,
   next to the faction it is true of. */
function isBroodFac(f){
  var reg = window.FM_FACTIONS_SRV || null;   // present only if a build ever ships one
  if(reg && reg[f]) return !!reg[f].brood;
  return f === 'khai';
}

/* Whose colour the side's non-unit objects take: works, camps, the things that
   are ours and have no faction of their own. The head of the roster is already
   ordered heaviest first by the server, so this is a read rather than a scan. */
function facOfSide(side){
  const L = side===1 ? ROSTER.home : ROSTER.away;
  return (L && L.length) ? L[0].fac : (side===1 ? 'jade' : 'khai');
}

/* What to call the army on screen. Every hardcoded COALITION string in this
   file was a lie for the entire pre-entry phase of the war, which is the phase
   the game is actually in. */
function armyName(){ return coalIn ? 'COALITION' : 'JADE CIRCUIT'; }
/* Which faction's colour ground-level friendly objects take: works, camps, the
   things that are OURS but are not units and so have no u.fac of their own.
   Whoever is the majority of the line owns the look of the base it fights from. */
function homeFac(){ return facOfSide(1); }
/* Who stands in front. Posture is literally a depth offset: the band clamp
   decides who is nearest the enemy, so "support" and "lead the charge" is one
   number rather than a system. */
var jadeForward = 1;
/* GUNSHIPS ARE OFF THE FRONT-LINE ROSTER, TEMPORARILY. The gunship is the last
   wireframe unit on the field and there is no art for one, so it is the only
   thing left that looks unfinished. Benched rather than deleted: the model, the
   flight code, the brood's air arm that hunts it, and the share curve that ties
   it to funding are all still here and all still correct.

   THE AIRSTRIKE IS NOT AFFECTED and that matters, because it was carrying the
   real job. Funding has to buy something you can SEE, and jets crossing the
   field with bombs are a louder answer to "what did my credits do" than four
   gunships loitering ever were. So the visible payoff for committing credits
   survives the removal, which is the thing that would have made this a bad
   trade if it did not.

   HELI_SHARE_BENCHED is the one line to change back. Restoring it is not a
   rewrite, it is a number, and that is deliberate: this is waiting on art. */
const HELI_SHARE_BENCHED = true;
var heliShare=0, engShare=0.02, turretShare=0;
/* The shield line is not bought with credits, it is what a Coalition line is
   made of. Constant across the whole funding range, which is the property the
   retired blade trooper share had and the one that matters. */
const ENF_SHARE=0.18;

/* ── What the Coalition can put on the ground ────────────────────────────
   The field used to be an unconditional 350 v 350 regardless of who held the
   zone or whether anyone had paid for the push, which made the battlefield a
   screensaver bolted to a war rather than a picture of it. Two things move it
   now, and they are different kinds of thing.

   CONTROL sets the baseline. Holding more of a zone means having more on it.
   That is not a reward, it is just what holding ground means, and it applies
   whether or not a window is open.

   FUNDING is the lever players actually pull, and it is the larger of the two
   on purpose: a fully funded push roughly doubles the Coalition presence and
   is the difference between a line that moves and one that does not. It also
   changes the COMPOSITION rather than only the count. An unfunded push is
   infantry with almost no armour. A funded one lands tanks and gunships. That
   is the visible payoff for committing credits, and it has to be visible or
   the window is a progress bar with no consequence anyone can see.

   RATIO, NOT ABSOLUTE CREDITS. The target already scales on garrison and on
   how much of the zone the brood still holds, so pool/target is the honest
   measure of "did we bring enough for THIS ground". Ƒ7m against a cheap zone
   and Ƒ7m against Vesskanoth are not the same push and must not draw the same.

   NOTHING HERE IS AUTHORITATIVE. Every input is a number the server sent, and
   the output is how many wireframes get drawn. Same rule the attrition model
   states above: a client number that cannot change a quantity a player can
   withdraw is a picture, and this is a picture. */
var FORCE = { coalFrac:0.5, fundRatio:0, pool:0, target:0, funders:0, windowOpen:false };

function forcesFor(zone){
  var hive = Math.max(0, Math.min(1, (zone && zone.hive != null ? zone.hive : 50)/100));
  var w = zone && zone.win;
  /* A RESOLVED window still counts while it is the most recent thing that
     happened here. Credits that carried a push do not evaporate the instant
     the clock stops, and blanking the field back to a skeleton the moment a
     window closes would read as the reinforcements being deleted. A window
     that was REFUSED for want of funders is different: nothing was spent and
     nothing landed. */
  var spent = w && w.resolved !== 'unanswered' && w.resolved !== 'cancelled';
  var live  = !!(w && w.open);
  var wr = (w && (live || spent) && w.target > 0)
    ? Math.max(0, Math.min(1, w.pool / w.target)) : 0;
  /* THE FUND IS THE STANDING ARMY AND THE WINDOW IS THE OFFENSIVE. Between
     pushes the field used to fall back to a skeleton, which read as the war
     stopping rather than as the war continuing without a push on. Coverage is
     how much of this world's daily burn the fund is meeting, so a funded world
     holds a real line with nobody pushing, and a dry one thins out on its own
     without a decay constant having to be invented for it.

     The greater of the two, not the sum: a push does not stop being a push
     because the standing budget is healthy, and a healthy budget does not stop
     mattering because nobody is pushing. */
  var cover = (zone && zone.cover != null) ? Math.max(0, Math.min(1, zone.cover)) : 0;
  var ratio = Math.max(wr, cover);

  /* 0.28 outnumbered on ground the brood entirely holds with nothing paid,
     0.76 on ground we mostly hold with the window covered. */
  /* Brood mounds are mass and nothing else, which is the one passive that
     cannot create a dead end: more brood is always answerable with more force,
     where a stacked price penalty could put a world past reach entirely. */
  var frac = 0.28 + 0.22*(1-hive) + 0.26*ratio - (typeof BROOD_MASS === 'number' ? BROOD_MASS : 0);
  return {
    coalFrac: Math.max(0.20, Math.min(0.78, frac)),
    fundRatio: ratio,
    pool: (w && w.pool) || 0,
    target: (w && w.target) || 0,
    funders: (w && w.funders) || 0,
    /* The minimum rides at the ROOT of the payload under push, not on the
       window, because it is a constant of the war rather than a property of
       one push. Reading it off the window silently yielded zero. */
    minFunders: (typeof window !== 'undefined' && window._REACH
                 && window._REACH.push && window._REACH.push.minFunders) || 0,
    closesAt: (w && w.closesAt) || 0,
    outcome: (w && w.outcome) || '',
    cover: cover,
    windowOpen: live,
  };
}

/* Armour and air are what money buys. Infantry is the floor and always shows
   up; a tank is a thing somebody paid for. */
/* Standing works on this world, read off the payload. Held here rather than
   passed through applyFunding's signature because the suite lifts that function
   out and runs it headless, so its shape is load bearing. */
var FOB_BONUS = { arm:0, air:0, strike:1, repel:1, price:1 };
var BROOD_MASS = 0;
function applyWorks(world){
  var b = world && world.bonus;
  FOB_BONUS = { arm:(b&&b.arm)||0, air:(b&&b.air)||0, strike:(b&&b.strike)||1,
                repel:(b&&b.repel)||1, price:(b&&b.price)||1 };
  BROOD_MASS = (world && world.mass) || 0;
  /* The structures behind those numbers. applyWorks already ran on every state
     refresh, so a work raised mid engagement appears without a reseed and a
     mound cleared by the push that just carried disappears the same way. */
  genWorks(world, RB.zone);
  /* JADE COMES OFF THE PAYLOAD NOW. It shipped as a console function, which
     meant it was client local: it did not survive a refresh, nobody else saw
     it, and the GM setting it on one machine changed nothing for anyone
     watching. reachJade() still works as an override for the bench and for
     poking at it live, but the server is the authority. */
  if (world && world.jade !== undefined) {
    /* NOT `|| 0`. jade is a fraction and 0 is a legal value, but so is the
       field being absent on an old payload, and the falsy test could not tell
       those apart: an absent field became an all-Coalition line rather than the
       all-Jade one the war is in. Explicit undefined check. */
    jadeFrac = Math.max(0, Math.min(1, Number(world.jade)));
    if (!isFinite(jadeFrac)) jadeFrac = 1;
    jadeForward = world.jadeFwd === 0 ? 0 : 1;
  }
  /* THE ROSTER IS THE LINE NOW, and jadeFrac above is kept only because the
     funding strip and a few labels still read it. Taken whole from the payload
     rather than merged, because a partial roster is a line with a faction
     missing from it and there is no sensible way to guess which.

     A payload with no roster is a server that predates this, and the honest
     reading is the war as it stood: an all-Jade line against the brood, which
     is exactly what rosterFromReach derives for an undeclared Coalition. */
  if (world && world.roster && world.roster.home && world.roster.home.length) {
    ROSTER = {
      home: world.roster.home.slice(),
      away: (world.roster.away && world.roster.away.length)
              ? world.roster.away.slice() : [{ fac:'khai', share:1 }],
      fwd: world.roster.fwd || null,
    };
  } else if (world) {
    ROSTER = {
      home: jadeFrac >= 1 ? [{fac:'jade',share:1}]
            : [{fac:'coal',share:1-jadeFrac},{fac:'jade',share:jadeFrac}],
      away: [{ fac:'khai', share:1 }],
      fwd: jadeForward ? 'jade' : 'coal',
    };
  }
  /* Entry lives on the payload ROOT, not on the world, because it is one fact
     about the whole war. Read defensively: a payload without it is a server
     that predates the gate, and the honest reading of that is "not declared". */
  coalIn = (window._REACH && window._REACH.coalIn) ? 1 : 0;
}

function applyFunding(ratio){
  var r = Math.max(0, Math.min(1, ratio));
  /* Read defensively: the suite lifts this function out and runs it headless
     against the force model, where the module scope does not come with it. A
     free reference to FOB_BONUS there is a crash rather than a failed
     assertion, which is a worse way to find out. */
  var FB = (typeof FOB_BONUS !== 'undefined' && FOB_BONUS) ? FOB_BONUS : { arm:0, air:0 };
  /* THE FIELD CONVERGES ON THESE OVER A FEW MINUTES, because reinforcement
     replaces losses at the CURRENT shares rather than the ones the field was
     seeded with. That drift is the funding display doing its job: fund a
     window and the line slowly becomes an armoured one. The magnitude was
     wrong though, not the mechanism. At 0.17 a fully funded field converges on
     about seventy-five tanks, which is an armour column with some infantry
     attached rather than an infantry battle with armour in it. */
  /* A FOB RAISES THE CEILING, IT DOES NOT ADD A SHARE. Funding still decides
     where inside the range a field lands; a Bastion decides how high the range
     goes. Adding flat share instead would put armour on an unfunded field,
     which says money is not what buys a tank. */
  armShare    = 0.04 + (0.07 + FB.arm)*r;   // tanks:    4% to 11%, more with a Bastion
  // Computed either way, so the Pad's air bonus still has a value to modify and
  // nothing downstream sees an undefined share; zeroed at the end if benched.
  heliShare   = 0.008 + (0.028 + FB.air)*r; // gunships: under 4% at most, more with a Pad
  /* READ DEFENSIVELY, for the reason applyFunding already documents two
     functions down: the suite LIFTS this function out and runs it headless
     against the force model, where the module scope does not come with it. A
     free reference to a module const there is a crash, not a failed assertion,
     which is a worse way to find out. */
  if(typeof HELI_SHARE_BENCHED === 'undefined' || HELI_SHARE_BENCHED) heliShare = 0;
  engShare    = 0.02 + 0.04*r;   // engineers, who bring the emplacements
  /* NOT a share of the field any more. Emplacements are built by engineers, so
     the funded ratio buys ENGINEERS and how many guns each may run, and the
     turret count falls out of that. Seeding them directly produced guns that
     nobody had put there. */
  turretShare = 0;
}
var CL={front:0.5,vol:0.55,disp:0.5,seed:SV.seed,wave:SV.wave};

/* TEMPO scales every clock in the sim. Combat was running at arcade speed:
   infantry firing three times a second and crossing open ground at a sprint.
   At 0.35 a bound takes several seconds, an aimed shot is one every three,
   and a tank reloads for about twelve. */
var TEMPO=0.24;
/* Bench instrumentation. Held at module scope beside TEMPO because that is the
   other thing they are about: how fast the simulation runs and whether it runs
   at all. Both default to "run normally", so a client that never touches them
   behaves exactly as it always did. */
var _rbHold=0, _rbStep=0;
var TEMPO_BASE=TEMPO;
var BLAST=9.0;                                  // world units

/* ── Objectives: ground worth standing on ─────────────────────────────────
   THE LINE HAD DEPTH AND NO WIDTH. The band clamp has always decided how far up
   the field a man may stand, and it does that well: nobody wanders into the
   hive and nobody sits at the baseline. Nothing at all decided where he stood
   ACROSS it. A unit with no cover slot took `u.x += u.vx * dt` and bounced off
   the field edges, so the whole army diffused into an even wash of men from one
   side to the other. Correct depth, no shape. At field size that reads as a
   crowd milling in a strip rather than as a line fighting for anything.

   An objective is a named piece of ground both sides want. Units are assigned
   to one, converge on it, and hold it, which produces the three things that
   were missing and could not be got by tuning the wander:

     CONCENTRATION. Men bunch where the ground is worth having and the gaps
     between are actually empty, so the eye can find the fight.
     CONTEST. Two sides converge on the same points, so a front is a set of
     places under pressure rather than a depth band with a gradient.
     PERSISTENCE. A held objective stays held. Somebody has to arrive and push
     the holders off it, which is what makes taking ground legible.

   THEY ARE DERIVED, NOT AUTHORED. Read off the terrain the generator already
   made, so a rift world contests chasm mouths and a dust world contests ridges,
   with no per-world data and nothing for a designer to keep in sync.

   NOTHING HERE IS AUTHORITATIVE. Same rule as the rest of this file: zone
   control and every casualty that matters arrive over the wire. This decides
   where wireframes stand. */
var objectives = [];

function genObjectives(){
  objectives = [];
  /* The biggest cover on the field, because that is what is worth holding and
     it is also what a player can SEE being held. Small scatter is not an
     objective; it is what you shelter behind on the way to one. */
  const cand = [];
  for(let i=0;i<terrain.length;i++){
    const f = terrain[i];
    if(f.kind==='hive') continue;
    if(f.ht < 0) continue;                       // a hole is not a position
    cand.push({ i, w: f.w * (1 + f.ht*0.05), x: f.cx, y: f.cy });
  }
  cand.sort((a,b)=>b.w-a.w);

  /* SPREAD ACROSS THE FRONTAGE, not just "the six biggest". Taking the top six
     by size alone clustered every objective into whichever corner the generator
     happened to put its wide features in, and the other half of the field went
     back to being empty for a different reason. Bucketed by x so the contested
     points span the ground. */
  const N = 5;
  for(let b=0;b<N;b++){
    const lo = b/N, hi = (b+1)/N;
    let best = null;
    for(const c of cand) if(c.x>=lo && c.x<hi){ best = c; break; }
    objectives.push(best
      ? { x: best.x, y: best.y, f: best.i, hold: 0, press: 0 }
      /* A bucket with no cover in it still gets an objective. Open ground
         between two strongpoints is exactly the ground an attack goes through,
         and leaving a hole in the assignment map put nobody there at all. */
      : { x: lo + 0.5/N, y: 0.5, f: -1, hold: 0, press: 0 });
  }
}

/* Assign a unit to an objective. Nearest in x, but biased AGAINST whichever is
   already crowded, or the whole army converges on the one nearest the middle
   and the flanks empty out. The bias is deliberately weak: men should prefer
   the ground in front of them, and only spill sideways when it is full. */
function pickObjective(u){
  if(!objectives.length) return -1;
  let best = -1, bestC = 1e9;
  for(let i=0;i<objectives.length;i++){
    const o = objectives[i];
    const load = u.side===1 ? o.hold : o.press;
    const c = Math.abs(o.x - u.x) + load * 0.010;
    if(c < bestC){ bestC = c; best = i; }
  }
  return best;
}

/* Recounted each step rather than incremented on assignment. A count kept by
   bookkeeping drifts the moment a unit dies, is reinforced, or is reclassified,
   and a crowding term computed from a drifted count is worse than none: it
   pushes men away from ground that is actually empty. This is one pass over the
   array and it is always right. */
function tallyObjectives(){
  for(let i=0;i<objectives.length;i++){ objectives[i].hold = 0; objectives[i].press = 0; }
  for(let i=0;i<units.length;i++){
    const u = units[i];
    if(u.dead>0 || u.obj===undefined || u.obj<0) continue;
    const o = objectives[u.obj];
    if(!o) continue;
    if(u.side===1) o.hold++; else o.press++;
  }
}

const S_HOLD=0, S_BOUND=1, S_SUPP=2, S_PINNED=3;

/* ── attrition ──────────────────────────────────────────────────────────
   Until now every death on the field came from the server, a handful per
   second, and the line looked like two crowds trading pixels forever.

   The rule was "the server decides who died." That rule stays, narrowed to
   what it was actually protecting: any death with an ECONOMIC consequence.
   The front, the war chest, and every entry in the killfeed remain purely
   server-authoritative and no client number feeds back into them. Mass
   attrition between anonymous wireframes has no economic consequence at
   all - the same reason the ambient Verbattan patrols were never given a
   server tick - so it resolves locally and the field can look like a front
   line instead of a stalemate.

   The test to apply when porting this: if a client-computed number can
   change a quantity a player can withdraw, it belongs on the server. Local
   kills change nothing but the picture.                                  */
/* brute is a crawling horror that has to be chewed through; grub is a body that
   arrives whatever you do to it; leap trades toughness for closing speed; wing
   is the large fly and costs more to bring down than the small one. */
const HP={inf:2,enf:6,eng:2,turret:9,tank:14,heli:11,spit:2,rush:3,flyer:3,
          brute:9,grub:7,leap:3,wing:6,maw:16};

/* ── The brood, as creatures rather than as three wireframes ──────────────
   Every Khai'sultull unit was a wireframe of one of three shapes, and the shapes
   were named for what they did rather than for what they were. The art pack
   gives them bodies, and the bodies come with their OWN animation sets, which is
   the thing that decides the roster: a creature can only credibly do what it has
   frames for.

   WHAT EACH CREATURE HAS, AND THEREFORE WHAT IT IS:

     crawling_horror  idle / move / ATTACK, front-facing, many legs
                      It has a strike. It is the melee rusher. Small is the
                      existing rush; large is a new heavy that takes the same
                      role slower and with more to chew through.

     space_fly        idle / attack_start / attack_LOOP / attack_end, winged
                      A start, a sustained loop and an end is a STRAFING RUN,
                      not a peck. It replaces the flyer wireframe and it runs
                      the three phases in order rather than looping one.

     hopclops         idle / move / JUMP / FALL, one eye, no attack
                      Jump and fall and no strike is a LEAPER: it closes in
                      bounds and hits on arrival. Reading it as a spitter would
                      have meant firing from an idle pose forever.

     grub             idle / move only
                      No strike at all. So it is a body: slow, tough, and it
                      hurts you by arriving. That is a real unit and it is also
                      an honest reading of art with two animations, rather than
                      inventing an attack it cannot show.

     egg              idle / HATCH
                      The data model already has brood spawning mounds. An egg
                      with a hatch animation is that, drawn.

   SPIT STAYS A WIREFRAME. Nothing in the pack fires anything: the projectile
   art is a round with no shooter. Giving the spitter a hopclops body and having
   it shoot from an idle pose would look worse than the wireframe does, so the
   one class with no matching creature keeps what it had. That is the whole
   reason this list is short. */
const BROOD_SPRITE = {
  rush:  'horror_s',
  brute: 'horror_l',
  /* The large grub. Same job as the small one - a body that hurts you by
     arriving - and having both means the small grub reads as its young rather
     than as the only kind there is. */
  maw:   'grub_l',
  flyer: 'fly_s',
  wing:  'fly_l',
  /* THE SPITTER GETS A BODY, AND THE EARLIER DECISION NOT TO GIVE IT ONE WAS
     WRONG ON THE NUMBERS. The reasoning held - nothing in the pack fires
     anything, and a creature shooting from an idle pose looks worse than a
     wireframe - but it was applied to a class carrying 299 of about 380 brood
     units. Roughly four in five of the enemy stayed a wireframe, so the field
     read as "the bugs are still wireframes" no matter how many creature types
     were wired behind it. A principle that is right about one unit and wrong
     about the other seventy-nine percent of the army is wrong.

     The hopclops IS a ranged creature: one huge eye, an open mouth, and no
     strike animation at all, which is the shape of something that hits you from
     over there. The pack ships PROJECTILE art with no shooter attached, which is
     the other half of the same reading. So the spitter fires the pack's own
     round and uses jump and fall to reposition between shots.

     Small hops and spits, large pounces. Same creature, two sizes, two jobs,
     which is what the pack drew. */
  spit:  'hop_s',
  leap:  'hop_l',
  grub:  'grub_s',
};

/* Which animation, from what the unit is doing. Every one of these is a row on
   the creature's own sheet; nothing here can name an animation the pack does
   not have, because tools/brood-sprites.py refuses to bake a missing one. */
function broodAnim(u){
  const c = BROOD_SPRITE[u.cls];
  if(!c) return null;
  const moving = (u.mv||0) > 0.000018;

  if(u.cls==='flyer' || u.cls==='wing'){
    /* THE STRAFING RUN IS THREE PHASES IN ORDER, not a loop with decoration.
       start winds up, loop sustains, end recovers. Driven off the time since the
       attack began so it plays through once and settles, the same one-shot rule
       the Hound's gun needed and for the same reason. */
    if(u.atkT > 0){
      const t = 1 - (u.atkT / BROOD_ATK_MS);
      return c + (t < 0.28 ? '_attack_start' : t < 0.78 ? '_attack_loop' : '_attack_end');
    }
    return c + '_idle';
  }
  /* A DEAD CREATURE SPLATTERS. No creature in the pack has a death animation,
     and the generic wireframe X that every other unit dies as reads as a
     casualty MARKER rather than as a thing that just burst. The pack ships
     splatter, which is exactly what a brood body leaves.

     Played once off deadAt and then held on its last frame, because the mark
     stays on the ground for as long as the corpse counts toward attrition, and
     a looping splatter is a puddle that keeps exploding.

     The sheet's animation name is literally '_': the pack ships splatter as a
     flat folder with no sub-animations, so brood-sprites.py records it under
     that rather than inventing a name its index does not contain. Hence the
     doubled underscore in the key. */
  /* The mark is picked off the unit's own index - fixed for its life, so a
     corpse does not change shape while you look at it - and the big variants go
     to the big creatures, because a brute should not leave a rifleman's mark. */
  if(u.dead>0) return BIG_CLS[u.cls]
    ? (((u.i||0) & 1) ? 'splat_e_' : 'splat_d_')
    : SPLATS[(u.i||0) % SPLATS.length];
  if(u.cls==='leap' || u.cls==='spit'){
    /* In the air it is jumping or falling, and which one is decided by whether
       it is still going up. u.vy is the only thing that knows.

       A SPITTER USES THE SAME FRAMES FOR A DIFFERENT REASON: the leaper hops to
       reach you, the spitter hops to stop being where it just fired from. Same
       animation, and the difference is in the movement code, not here. */
    if(u.alt > 0.4) return c + (u.vy > 0 ? '_jump' : '_fall');
    return c + (moving ? '_move' : '_idle');
  }
  if(u.cls==='rush' || u.cls==='brute'){
    if(u.mel >= 0 && u.melT > 0) return c + '_attack';
    return c + (moving ? '_move' : '_idle');
  }
  return c + (moving ? '_move' : '_idle');
}

/* How long an attack animation owns the unit. One number because every brood
   strike is the same beat; if a creature ever needs its own, this becomes a
   table and broodAnim reads it. */
const BROOD_ATK_MS = 900;
/* hound_fire is twenty frames at 55ms. Named rather than repeated, because the
   frame picker and the animation chooser both need it and disagreeing about it
   is what cut the animation short. */
const HOUND_FIRE_MS = 20 * 55;

/* The brood classes that close and strike. A set rather than a chain of string
   comparisons, because the melee path is tested in six separate places and a
   new creature must not need six edits to be able to fight. */
const MELEE_CLS = { rush:1, brute:1, leap:1, grub:1, maw:1 };
/* ONE SPLATTER FOR EVERY CORPSE MADE THE FIELD A STAMP. Five ship. */
const SPLATS = ['splat__', 'splat_b_', 'splat_c_'];
const BIG_CLS = { brute:1, maw:1, wing:1 };

const DMG={rifle:1,shell:6,spike:1,cannon:2,swipe:2,bash:2,claw:2,bomb:9};

/* Cover was a parking spot: it decided where a unit stood and nothing else.
   A round from the covered arc now has a good chance of being stopped by the
   rock, and a round from the flank or from above is not. That makes position
   quality real, makes flanking matter, and gives armour and air a job that
   rifles cannot do - blast ignores cover entirely. */
const COVER_STOP=0.55;
function hurt(idx,amount,by,fromY,ignoreCover){
  /* Flag the hit pose here rather than at each caller: every path that hurts
     somebody goes through this one function, so there is one place to be
     right. */
  { const _v=units[idx]; if(_v&&_v.dead<=0) _v.hitT=260; }
  /* Stamped so a sprite death plays once from its first frame and holds the
     last, instead of looping and standing the dead back up every second. */
  const u=units[idx];
  if(!u||u.dead>0) return false;
  if(!ignoreCover && u.slot>=0 && fromY!==undefined && u.st!==S_BOUND){
    const enemyIsBelow = u.side===1;
    const frontal = enemyIsBelow ? (fromY < u.y) : (fromY > u.y);
    if(frontal && Math.random()<COVER_STOP){
      u.sup=Math.min(2600,u.sup+520);
      return false;
    }
  }
  u.hp-=amount;
  if(u.hp>0){ u.sup=Math.min(2600,u.sup+420); return false; }
  u.dead=1; u.deadAt=_sprT; u.doomed=0; releaseSlot(u);
  if(u.cls==='heli') u.crash=1;
  if(by!==undefined) u.killedBy=by;
  localKills++;
  return true;
}

const PMAX=1400;
const rounds=new Array(PMAX);
for(let i=0;i<PMAX;i++) rounds[i]={on:0,x:0,y:0,z:0,tz:0,tx:0,ty:0,t:0,dur:1,side:1,heavy:0,doom:-1,kills:0,arc:0,tgt:-1,dmg:0,spr:0};
let pHead=0,pLive=0;
const SHOTS_PER_SEC=560;
let fireBudget=0;

/* ── airstrikes ─────────────────────────────────────────────────────────
   Jets are not units. They are transient, they never hold ground, and they
   exist to break entrenched positions that rifles cannot touch now that
   cover stops frontal fire. A run comes in high and fast along an axis,
   walks a stick of bombs across it, and egresses off the map. Blast ignores
   cover, which is the whole point of calling one in. */
const JETS=new Array(6);
for(let i=0;i<6;i++) JETS[i]={on:0,x:0,y:0,alt:0,dx:0,dy:0,hdg:0,left:0,cd:0,t:0,tx:0,ty:0,released:0};
const BOMBS=new Array(64);
for(let i=0;i<64;i++) BOMBS[i]={on:0,x:0,y:0,alt:0,vy:0,t:0,dx:0,dy:0};
let bmHead=0;
let strikeCd=26000;

function callStrike(atX,atY){
  const j=JETS.find(k=>!k.on);
  if(!j) return false;
  const tx = atX!==undefined ? atX : 0.15+Math.random()*0.70;
  /* Same offset-past-the-edge family as the depth bands: on a nearly won zone
     front is 0.05, so the default aimpoint was -0.07 and the stick walked off
     the map. A strike with no named target lands short of the line, never
     behind the world. */
  const ty = atY!==undefined ? atY
           : Math.max(Y_LO, CL.front-0.02-Math.random()*0.10);
  const ang = (Math.random()-0.5)*1.1;          // run-in axis, roughly north
  j.on=1; j.t=0;
  j.alt=52+Math.random()*16;
  j.dx=Math.sin(ang)*0.0060; j.dy=-Math.cos(ang)*0.0060;
  /* Lead-in was 150 steps of travel, which put the jet 0.9 off the map and
     the bounds check culled it before a single frame rendered. It now spawns
     just off the near edge and releases on proximity to the aim point rather
     than on a frame countdown, which is robust to any speed change. */
  j.x = tx - j.dx*62; j.y = ty - j.dy*62;
  j.tx=tx; j.ty=ty;
  j.hdg=Math.atan2(j.dx*FIELD_W,-j.dy*FIELD_D);
  j.left=5+((Math.random()*4)|0);
  j.cd=0;
  return true;
}
function stepStrikes(dt,dtRaw){
  strikeCd-=dtRaw;
  if(strikeCd<=0){ strikeCd=(24000+Math.random()*22000)*FOB_BONUS.strike;
    if(callStrike()) feedRow(armyName()+' AIR <span class="x">·</span>strike inbound','big'); }

  for(let i=0;i<6;i++){
    const j=JETS[i]; if(!j.on) continue;
    j.t+=dtRaw;
    j.x+=j.dx*dtRaw*0.06; j.y+=j.dy*dtRaw*0.06;
    j.alt+=(30-j.alt)*0.004;
    const toTgt=Math.hypot((j.x-j.tx)*1.2,(j.y-j.ty));
    if(j.left>0 && (toTgt<0.11 || j.released)){
      j.released=1;
      j.cd-=dtRaw;
      if(j.cd<=0){
        j.cd=95;
        const b=BOMBS[bmHead]; bmHead=(bmHead+1)%64;
        b.on=1; b.x=j.x; b.y=j.y; b.alt=j.alt; b.vy=0; b.t=0;
        b.dx=j.dx*0.45; b.dy=j.dy*0.45;
        j.left--;
      }
    }
    if(j.y<-0.35||j.y>1.35||j.x<-0.4||j.x>1.4||j.t>16000){ j.on=0; j.released=0; }
  }
  for(let i=0;i<64;i++){
    const b=BOMBS[i]; if(!b.on) continue;
    b.t+=dtRaw; b.vy+=dtRaw*0.055;
    b.alt-=b.vy*dtRaw*0.0016;
    b.x+=b.dx*dtRaw*0.06; b.y+=b.dy*dtRaw*0.06;
    if(b.alt<=0){
      b.on=0;
      blast(b.x,b.y,BLAST*2.3);
      flash(b.x,b.y,1,0,1);
      suppressNear(b.x,b.y,BLAST*4.2,2.2);
      damageNear(b.x,b.y,BLAST*2.1,-1,DMG.bomb);
      damageNear(b.x,b.y,BLAST*1.1,1,DMG.bomb);   // short rounds hit our own
    }
  }
}

const flashes=new Array(200);
for(let i=0;i<200;i++) flashes[i]={on:0,x:0,y:0,t:0,side:1,mel:0,big:0};
let fHead=0;
const blasts=new Array(40);
for(let i=0;i<40;i++) blasts[i]={on:0,x:0,y:0,t:0,r:0};
let bHead=0;

function fire(u,tx,ty,doomIdx,heavy,kills,tgt,dmg,tz){
  const p=rounds[pHead]; pHead=(pHead+1)%PMAX;
  if(!p.on) pLive++;
  p.on=1; p.x=u.x; p.y=u.y; p.z=u.alt||0; p.tx=tx; p.ty=ty; p.tz=tz||0; p.t=0;
  p.tgt=tgt===undefined?-1:tgt; p.dmg=dmg||0;
  p.side=u.side; p.heavy=heavy?1:0; p.doom=doomIdx==null?-1:doomIdx; p.kills=kills||0;
  /* A round fired by a unit the sprite layer draws needs no wireframe tracer:
     the shooting sheets have the muzzle flash and the bullets painted into
     them already, which is why the pack ships No Flashes variants for people
     who want to draw their own. Two sets of bullets for one shot is why the
     Coalition line looked like it was firing lasers. */
  p.spr = (SPRITE_CLS[u.cls] || BROOD_SPRITE[u.cls]) ? 1 : 0;
  /* A sprite unit gets its muzzle flash painted into the sheet. A wireframe one
     has nothing, so without this a tank fired a line out of a silent hull. */
  if(!p.spr) flash(u.x,u.y,u.side,0,!!heavy);
  /* WHEN the shot happened, not just that it did. u.fire is a decaying recoil
     term that the wireframe models read as a displacement; the Hound's firing
     sheet is a one-shot cel animation and needs an origin to count frames from.
     Stamped for every unit rather than only for tanks: it costs a number and it
     is the thing any future one-shot animation will want. */
  u.fireAt = performance.now();
  p.dur=(u.side===1?(heavy?420:230):460)*(0.85+Math.random()*0.3)/Math.max(0.35,TEMPO*1.6);
  p.arc=u.side===1?0:0.012+Math.random()*0.014;
  u.fire=1;
}
function flash(x,y,side,mel,big){
  const f=flashes[fHead]; fHead=(fHead+1)%200;
  f.on=1; f.x=x; f.y=y; f.t=0; f.side=side; f.mel=mel?1:0; f.big=big?1:0;
}
function blast(x,y,r){
  const b=blasts[bHead]; bHead=(bHead+1)%40;
  b.on=1; b.x=x; b.y=y; b.t=0; b.r=r;
}
function releaseSlot(u){
  if(u.slot>=0){ if(slots[u.slot]&&slots[u.slot].owner===u.i) slots[u.slot].owner=-1; u.slot=-1; }
}

/* THE BROOD'S AIR ARM IS THE MIRROR OF THE COALITION'S and it was not sized
   like one. Flyers were seeded at a flat seven percent while a gunship never
   exceeds three and a half even fully funded, so the sky held anywhere from
   two to nine flyers for every gunship. That is not an answer to air. That is
   an air force with an infantry problem attached, and it is why the thing
   built to hunt gunships was the thing you noticed first on that side.

   Funding buys the Coalition its gunships. Nobody buys the Khai'sultull
   anything, which is the whole point of reviveAsHive having no funding term,
   so the brood's equivalent lever is the world's own garrison. The flyer share
   is derived from it on the SAME CURVE heliShare uses against funding, which
   makes the two air arms scale against their own side's input and land in the
   same range as each other. Spitters absorb the difference, since they are the
   else branch of the draw. */
function applyGarrison(){
  var g = Math.max(0, Math.min(1, garrisonOf()/100));
  flyerShare = 0.008 + 0.028*g;
}

function seedField(){
  const rnd=mulberry32(CL.seed);
  genTerrain(CL.seed);
  genSpires(CL.seed);
  genFlora(CL.seed);
  genObjectives();
  genHiveCities(CL.seed);
  genCamps(CL.seed);
  units.length=0;
  applyWorks((window._REACH && window._REACH.worlds && window._REACH.worlds[RB.colony]) || null);
  applyFunding(FORCE.fundRatio);
  applyGarrison();
  const n=cap, half=Math.max(40, Math.min(n-40, Math.round(n*FORCE.coalFrac)));
  for(let i=0;i<n;i++){
    const side=i<half?1:-1;
    /* FACTION IS DRAWN BEFORE CLASS, because on the away side the class table
       now depends on it: a brood faction draws creatures and a polity draws
       infantry. Drawn the other way round, a Syndicate soldier gets a crawling
       horror's class and then a uniform, which is the exact bug this pass is
       about arriving one line later. */
    const fac = pickFac(side, rnd);
    let cls;
    if(side===1){ const r=rnd();
      cls = r<heliShare ? 'heli'
          : r<heliShare+armShare ? 'tank'
          : r<heliShare+armShare+turretShare ? 'turret'
          : r<heliShare+armShare+turretShare+engShare ? 'eng'
          : r<heliShare+armShare+turretShare+engShare+ENF_SHARE ? 'enf' : 'inf'; }
    else { cls = awayClass(rnd, fac); }
    units.push({
      i, side, cls, fac,
      team: (i/4)|0,
      x:rnd(), y: side===1 ? 0.86+rnd()*0.14 : rnd()*0.14,
      alt: cls==='heli' ? 16+rnd()*8
         : cls==='wing'  ? 16+rnd()*12
         : cls==='flyer' ? 12+rnd()*10 : 0,
      vy:0, atkT:0,
      hp: HP[cls], hpMax: HP[cls], crash:0, killedBy:-1,
      vx:(rnd()-0.5)*0.0022,
      /* Ground movement cut ~40%. Slower here reads as deliberate; slowing
         the exchanges too would have made the field quieter, which is the
         opposite of what a front line looks like. */
      sp: cls==='turret'? 0
        : cls==='rush' ? 0.0019+rnd()*0.0014
        : cls==='leap' ? 0.0026+rnd()*0.0016
        : cls==='brute'? 0.0011+rnd()*0.0008
        : cls==='grub' ? 0.0007+rnd()*0.0005
       : cls==='maw'  ? 0.0005+rnd()*0.0004
        : cls==='maw'  ? 0.0005+rnd()*0.0004
        : cls==='wing' ? 0.0028+rnd()*0.0016
        : cls==='flyer'? 0.0034+rnd()*0.0020
        : cls==='heli' ? 0.0024+rnd()*0.0014
        : cls==='tank' ? 0.0008+rnd()*0.0006
        : cls==='enf'  ? 0.0019+rnd()*0.0012
        : 0.0015+rnd()*0.0013,
      ph:rnd()*Math.PI*2, sk:0.5+rnd(),
      cd:rnd()*3000, fire:0, dead:0, doomed:0, obj:-1, objT:0,
      slot:-1, mel:-1, melT:0, swipes:0, pinned:0,
      st:S_BOUND, stT:rnd()*4000, sup:0, dash:0,
      place:0, built:0, deploy:0, hitT:0, nadeT:0, nade:4000+rnd()*9000,
      hdg: side===1 ? 0 : Math.PI,
      aim:-1
    });
  }
  for(let i=0;i<PMAX;i++) rounds[i].on=0;
  for(let i=0;i<40;i++) blasts[i].on=0;
  pLive=0;
}

/* ── Reinforcement ───────────────────────────────────────────────────────
   Committing credits mid engagement has to show, and a reseed is the wrong
   way to show it: reseeding teleports every surviving unit to the baseline
   and restarts the fight, which reads as the viewer glitching rather than as
   help arriving. Reinforcements come on at the Coalition edge and walk in,
   the way reinforcements do.

   THEY REVIVE THE DEAD RATHER THAN GROWING THE ARRAY. Nothing is spliced out
   of `units` when it dies, so the array is a fixed `cap` of slots with a dead
   flag, and the cheapest correct way to add a live unit is to take a slot
   that is no longer using itself. That keeps the draw cost flat no matter how
   long a window is funded, which matters because this loop is already the
   heaviest thing in the client. */
/* NAMED FOR THE SIDE, NOT FOR A FACTION. This was reviveAsCoalition while its
   very first line assigned u.fac from jadeFrac, so the name asserted a uniform
   the body did not necessarily give it. That is the exact drift that let a
   Coalition line seed into a war the Coalition has not joined: a reader checking
   whether the default was right read the name and stopped. Home means side 1. */
function reviveAsHome(u, rnd, force){
  var r = rnd();
  /* Replacement draws from the CURRENT mix, which is why the line visibly turns
     from grey to teal as funding lands and drifts back when it stops. Same
     mechanism the funding display already relies on, pointed at faction. */
  u.fac = pickFac(1, rnd);
  var cls = force ? force
          : r<heliShare ? 'heli'
          : r<heliShare+armShare ? 'tank'
          : r<heliShare+armShare+turretShare ? 'turret'
          : r<heliShare+armShare+turretShare+engShare ? 'eng'
          : r<heliShare+armShare+turretShare+engShare+ENF_SHARE ? 'enf' : 'inf';
  u.side = 1; u.cls = cls;
  u.dead = 0; u.doomed = 0; u.killedBy = -1; u.crash = 0;
  /* Fields a recycled corpse already has but a freshly pushed slot does not.
     Set unconditionally so both paths produce an identical unit. */
  if (u.team === undefined) u.team = (u.i/4)|0;
  u.hdg = 0; u.aim = -1; u.sup = 0; u.dash = 0; u.melT = 0; u.swipes = 0;
  u.place = 0; u.built = 0; u.deploy = 0; u.hitT = 0; u.nadeT = 0;
  u.nade = 4000+rnd()*9000;
  u.hp = HP[cls]; u.hpMax = HP[cls];
  u.x = 0.06+rnd()*0.88;
  /* An emplacement is dug in where it is useful, not marched on from the rear:
     it has no speed and would sit at the back edge forever. */
  /* REINFORCEMENTS COME FROM THE REARMOST CAMP WE HOLD, which is what makes a
     camp read as a spawn point without it being one in any authoritative
     sense: the camp is derived from the server's front, so where men appear is
     derived from it too. Holding none puts them back on the map edge. */
  const rly = rallyY(1);
  u.y = cls==='turret' ? Math.min(0.92, CL.front+0.10+rnd()*0.12)
                       : (rly!==null ? Math.min(0.98, rly+0.02+rnd()*0.05)
                                     : 0.94+rnd()*0.06);
  u.alt = cls==='heli' ? 16+rnd()*8 : 0;
  u.sp = cls==='turret' ? 0
       : cls==='heli' ? 0.0024+rnd()*0.0014
       : cls==='tank' ? 0.0008+rnd()*0.0006
       : cls==='enf'  ? 0.0019+rnd()*0.0012
       : 0.0015+rnd()*0.0013;
  u.vx=(rnd()-0.5)*0.0022; u.ph=rnd()*Math.PI*2; u.sk=0.5+rnd();
  u.cd=rnd()*3000; u.fire=0;
  /* A reinforcement arrives with orders. Left at -1 it would pick one on its
     first bound, which is a beat later and looks like a man wandering on. */
  u.obj=-1; u.objT=0;
  releaseSlot(u); u.slot=-1; u.mel=-1; u.melT=0; u.swipes=0; u.pinned=0;
  u.st=S_BOUND; u.stT=rnd()*4000; u.sup=0; u.dash=0;
  u.hdg=0; u.aim=-1;
}

/* Move the live Coalition count toward what the funding now supports. Only
   ever adds: a window that closes does not vaporise men who are already on
   the ground, and taking them away would be the same teleport problem in
   reverse. Attrition is what reduces a side, and attrition is the sim's job. */
var _reinRnd = mulberry32(0x5EED);
/* How many emplacements exist, and the ceiling. The ceiling is a safety rail
   on the draw loop rather than a design number: engineers are the design
   number. */
/* HOW MANY EMPLACEMENTS MAY STAND. This was a flat 48 and the field reached
   67, because turretLive is recomputed once at the top of stepField and every
   engineer in the same frame then read the same stale number and built anyway.
   It is incremented on the spot now.

   The ceiling itself was also far too high: 48 static guns is a seventh of the
   Coalition standing still. It scales with what the funding actually bought,
   which is engineers, and is capped low enough that emplacements stay a
   feature of the line rather than the line itself. */
/* The world's garrison, as the payload reports it. The battlefield is handed a
   zone, not a world, so this reaches for the world the zone belongs to. */
function garrisonOf(){
  var S = window._REACH && window._REACH.worlds && window._REACH.worlds[RB.colony];
  return (S && typeof S.garrison === 'number') ? S.garrison : 50;
}
var turretLive=0;
function turretCeiling(){
  return Math.max(2, Math.min(20, Math.round(6 + FORCE.fundRatio*14)));
}
function spawnTurretAt(x,y){
  let idx=-1;
  for(let i=0;i<units.length;i++) if(units[i].dead){ idx=i; break; }
  if(idx<0){
    if(units.length>=Math.round(cap*1.12)) return -1;
    idx=units.length; units.push({ i:idx, team:(idx/4)|0 });
  }
  const u=units[idx];
  reviveAsHome(u,_reinRnd,'turret');
  turretLive++;                      // counted NOW, not at the next frame's recount
  u.x=Math.max(0.03,Math.min(0.97,x));
  u.y=Math.max(0.05,Math.min(0.96,y));
  u.deploy=900;                       // plays turret_deploy once, then idles
  return idx;
}
/* Revive a dead slot as brood. The garrison is what puts them there, so this
   is the mirror of reviveAsHome and deliberately has no funding term:
   nobody buys the Khai'sultull anything. */
function reviveAsHive(u, rnd){
  var fac = pickFac(-1, rnd);
  var r = rnd();
  var cls = awayClass(function(){ return r; }, fac);
  u.side = -1; u.cls = cls; u.fac = fac;
  u.dead = 0; u.doomed = 0; u.killedBy = -1; u.crash = 0;
  u.hp = HP[cls]; u.hpMax = HP[cls];
  u.x = 0.05+rnd()*0.90;
  const hly = rallyY(-1);
  u.y = hly!==null ? Math.max(0.02, hly-0.02-rnd()*0.05) : rnd()*0.06;
  u.alt = cls==='wing' ? 16+rnd()*12 : cls==='flyer' ? 12+rnd()*10 : 0;
  u.vy = 0; u.atkT = 0;
  u.sp = cls==='rush' ? 0.0019+rnd()*0.0014
       : cls==='leap' ? 0.0026+rnd()*0.0016
       : cls==='brute'? 0.0011+rnd()*0.0008
       : cls==='grub' ? 0.0007+rnd()*0.0005
       : cls==='wing' ? 0.0028+rnd()*0.0016
       : cls==='flyer'? 0.0034+rnd()*0.0020
       : 0.0015+rnd()*0.0013;
  u.vx=(rnd()-0.5)*0.0022; u.ph=rnd()*Math.PI*2; u.sk=0.5+rnd();
  u.cd=rnd()*3000; u.fire=0;
  /* A reinforcement arrives with orders. Left at -1 it would pick one on its
     first bound, which is a beat later and looks like a man wandering on. */
  u.obj=-1; u.objT=0;
  releaseSlot(u); u.slot=-1; u.mel=-1; u.melT=0; u.swipes=0; u.pinned=0;
  u.st=S_BOUND; u.stT=rnd()*4000; u.sup=0; u.dash=0;
  u.hdg=Math.PI; u.aim=-1;
  u.place=0; u.built=0; u.deploy=0; u.hitT=0; u.nadeT=0; u.nade=1e9;
}

function reinforceToward(targetLive){
  var live = 0, hiveLive = 0, deadIdx = [], haveTur = 0, haveEng = 0;
  for (var i=0;i<units.length;i++){
    var u = units[i];
    if (u.side===1 && !u.dead){ live++;
      if (u.cls==='turret') haveTur++; else if (u.cls==='eng') haveEng++; }
    else if (u.side===-1 && !u.dead) hiveLive++;
    else if (u.dead) deadIdx.push(i);
  }
  /* HARDWARE IS PLACED, NOT WAITED FOR. Reinforcement fills dead slots with a
     random draw from the current shares, which is right for bodies and wrong
     for what funding actually buys: at a realistic attrition rate the first
     emplacement would take many minutes to come up by chance, so a player who
     just committed sees nothing change. Emplacements and their engineers fill
     their quota FIRST, so covering a window puts hardware on the ground while
     the person who paid for it is still watching. */
  var wantEng = Math.round(cap * FORCE.coalFrac * engShare);
  var quota = [];
  for (var e=haveEng;e<wantEng;e++) quota.push('eng');

  var want = Math.min(targetLive, cap - 40) - live;
  if (want <= 0 && !quota.length) return 0;
  if (want <= 0) want = Math.min(quota.length, 6);
  /* A cap on how much lands at once. Ƒ2.5m arriving as forty men appearing in
     one frame is a pop; as a stream over a few ticks it is a landing. */
  /* A DEAD SLOT IS NOT ALWAYS AVAILABLE, and the quota must not wait for one.
     seedField fills every slot alive, so a freshly opened engagement has zero
     dead until casualties start: funding it in the first minute could place
     nothing at all, which is the exact moment a player is watching for their
     money to do something. Recycle a corpse when there is one, and otherwise
     grow the array for the quota only, bounded, because that is a handful of
     emplacements and not an infinite faucet. Only ENGINEERS come through here
     now; the guns themselves are built on the ground by the engineers. */
  var CEIL = Math.round(cap*1.12);
  var placed = 0, cursor = 0;
  want = Math.min(want, 24);
  for (var k=0;k<want;k++){
    var forced = quota[k] || null;
    if (cursor < deadIdx.length){ reviveAsHome(units[deadIdx[cursor++]], _reinRnd, forced); placed++; }
    else if (forced && units.length < CEIL){
      var nu = { i:units.length, team:(units.length/4)|0 };
      reviveAsHome(nu, _reinRnd, forced);
      units.push(nu); placed++;
    }
  }

  /* THE BROOD MUST BE REPLACED TOO, and nothing was doing it. Only the
     Coalition was ever reinforced, so a zone held for a few minutes drained to
     an all-Coalition field with a handful of survivors being chased around it:
     in a sixty second soak the brood went from 442 to 310 and was heading to
     zero. That is a picture of a war already won, on ground the server still
     says is contested.

     The brood is topped up from GARRISON rather than from funding, because
     nobody buys the Khai'sultull anything. A dug-in garrison replaces its
     losses fast; a thin one does not, which is the same number that already
     decides how hard they push back. */
  var wantHive = Math.round(cap * (1 - FORCE.coalFrac));
  var short = Math.min(wantHive - hiveLive, 4 + Math.round((garrisonOf()/100)*14));
  for (var m=0; m<short && cursor<deadIdx.length; m++){
    reviveAsHive(units[deadIdx[cursor++]], _reinRnd); placed++;
  }
  return placed;
}

/* A fireteam takes a rock together. Claiming slots individually spread the
   line into an even smear and sent men diagonally across the map to reach a
   position forty metres from one their own squad already held. Teams now
   hold a feature, and prefer one near their own lane. */
const teamFeat=Object.create(null);
function pickFeature(u,lo,hi,wantHeavy){
  const rec=teamFeat[u.team];
  if(rec && terrain[rec.f] && rec.until>performance.now()){
    const f=terrain[rec.f];
    if(f.cy>=lo-0.04 && f.cy<=hi+0.04 && (!wantHeavy||f.heavy)) return rec.f;
  }
  /* COVER IS CHOSEN TOWARD THE OBJECTIVE, not merely nearest. Nearest alone is
     what let a team dig in behind whatever rock it happened to be standing by
     and stop, which is the "holds a position nobody cares about" case: the
     objective term makes a fireteam bound from cover to cover in a DIRECTION.
     Weighted below the distance term on purpose. A man does not walk past three
     rocks to reach the fourth because it is nearer the flag. */
  const o = (u.obj!==undefined && u.obj>=0) ? objectives[u.obj] : null;
  let best=-1,bd=9;
  for(let i=0;i<terrain.length;i++){
    const f=terrain[i];
    if(f.cy<lo||f.cy>hi) continue;
    if(wantHeavy&&!f.heavy) continue;
    let d=Math.abs(f.cx-u.x)*1.4+Math.abs(f.cy-u.y);
    if(o) d += Math.abs(f.cx-o.x)*0.55;
    if(d<bd){bd=d;best=i;}
  }
  if(best>=0) teamFeat[u.team]={f:best,until:performance.now()+22000+Math.random()*16000};
  return best;
}
function claimOnFeature(u,fi,lo,hi,wantHeavy){
  let best=-1,bd=9;
  const idx=terrain[fi].slotIdx;
  for(let n=0;n<idx.length;n++){
    const j=idx[n], s=slots[j];
    if(s.owner>=0||s.face!==u.side) continue;
    if(wantHeavy&&!s.heavy) continue;
    if(s.y<lo-0.05||s.y>hi+0.05) continue;
    const d=Math.abs(s.x-u.x);
    if(d<bd){bd=d;best=j;}
  }
  if(best>=0){ slots[best].owner=u.i; u.slot=best; }
  return best;
}
function claimSlot(u,lo,hi,wantHeavy){
  let best=-1,bd=9;
  for(let k=0;k<40;k++){
    const j=(Math.random()*slots.length)|0, s=slots[j];
    if(!s||s.owner>=0||s.face!==u.side) continue;
    if(wantHeavy&&!s.heavy) continue;
    if(s.y<lo||s.y>hi) continue;
    const d=Math.abs(s.x-u.x)*2.2+Math.abs(s.y-u.y);   // lane first, depth second
    if(d<bd){bd=d;best=j;}
  }
  if(best>=0){ slots[best].owner=u.i; u.slot=best; }
  return best;
}
/* ── What a shield trooper closes on ──────────────────────────────────────
   IT LOOKED FOR MELEE_CLS AND NOTHING ELSE, AND MELEE_CLS IS BROOD-ONLY:
   rush, brute, leap, grub, maw. So a shield trooper facing enemy INFANTRY or an
   enemy SHIELD TROOPER found nothing to fight, kept u.mel at -1, and fell into
   the hold branch - drifting sideways along the line past men it should have
   been bashing. Humans against humans, the shield line simply did not engage.

   IT ALSO HAD NO SIDE FILTER. `!MELEE_CLS[v.cls]` was the only test, so the
   nearest rusher was a target whoever owned it. That was safe only while every
   melee class was on one side by definition; put the brood on a home roster and
   a Coalition shield trooper starts bashing his own escort.

   AND THE SCAN WAS THIRTY-FOUR RANDOM DRAWS out of seven hundred units, which is
   the third instance of that pattern found in this file. Even after fixing the
   class filter it would have missed the man standing next to it most of the
   time - the reason the flyers and the turret were rewritten the same way two
   patches ago.

   PREFERS WHAT IS CHARGING HIM. A shield is for stopping the thing that closes,
   so a rusher outranks a rifleman at equal distance; but a rifleman at arm's
   length still gets bashed, which is the part that was missing entirely. */
function nearestBash(u){
  const col = tgtIdx[u.side===1?0:1];
  if(!col) return -1;
  const c0 = Math.max(0, Math.min(TGT_COLS-1, (u.x*TGT_COLS)|0));
  let best=-1, bd=1e9;
  const REACH = 0.055;
  for(let c=Math.max(0,c0-2); c<=Math.min(TGT_COLS-1,c0+2); c++){
    const list=col[c];
    for(let k=0;k<list.length;k++){
      const q=list[k], v=units[q];
      if(!v||v.dead>0||v.doomed||v.alt>0) continue;   // nothing bashes an aircraft
      const d=Math.hypot(v.x-u.x, v.y-u.y);
      if(d>REACH) continue;
      /* Halved for a charging class, which is a preference and not a filter:
         at equal range the rusher wins, at arm's length the rifleman still
         loses. A filter is what caused this bug in the first place. */
      const score = MELEE_CLS[v.cls] ? d*0.5 : d;
      if(score<bd){bd=score;best=q;}
    }
  }
  return best;
}

/* ── What a flying thing is for ───────────────────────────────────────────
   THE FLYERS HUNTED `cls === 'heli'` AND NOTHING ELSE, AND GUNSHIPS ARE BENCHED.
   HELI_SHARE_BENCHED has been true since the airstrike replaced them, so that
   class does not spawn, so the search never found anything, so every flyer fell
   into the idle branch below and drifted along front-0.16 bouncing off the
   walls for the entire engagement. They were not misbehaving; they were looking
   for a unit type that no longer exists.

   ARMOUR FIRST, WHICH IS WHAT THEY SHOULD ALWAYS HAVE BEEN FOR. A gunship was
   the only air target on the field, so "hunt the heli" happened to also mean
   "hunt the thing infantry cannot answer". Tanks and turrets are that thing now:
   armour is what a line cannot deal with on its own, and something diving it is
   the reason a push buys air cover.

   IT ALSO HAD NO SIDE FILTER. The old scan took any heli within thirty random
   samples, friendly or not, which was harmless only because there was never more
   than one air unit in play. Prey is enemy-only now, and it goes through the
   same spatial index every other target search uses.

   THE RANDOM SAMPLE WAS THE SECOND HALF OF THE BUG and would have survived
   fixing the first. Thirty draws out of seven hundred units finds one of eight
   tanks about a third of the time, so a flyer that "targets tanks" by sampling
   would still spend most of its life idle - the same fault pickTarget was fixed
   for, in a different function. rebuildTargets already keeps enemies bucketed by
   column; this reads it. */
const AIR_PREY = { heli:3, tank:2, turret:1 };
function airPrey(v,u){
  return !!v && v.dead<=0 && !v.doomed && v.side!==u.side && !!AIR_PREY[v.cls];
}
/* Nearest, with armour weighted so a flyer crosses the field for a tank rather
   than settling on the turret it happens to be over. Falls back to any enemy
   only when NO armour is left standing: a flyer with nothing to do is the bug
   being fixed, and strafing infantry is what the brood does when the guns are
   gone. */
function nearestPrey(u){
  const col = tgtIdx[u.side===1?0:1];
  if(!col) return -1;
  const c0 = Math.max(0, Math.min(TGT_COLS-1, (u.x*TGT_COLS)|0));
  let best=-1, bd=1e9, anyBest=-1, anyD=1e9;
  /* Widened all the way across rather than three columns, because armour is
     rare and a flyer is fast: an air unit that will not cross the map for the
     only tank on the field is an air unit that idles again. */
  for(let w=0; w<TGT_COLS; w++){
    for(let sgn=-1; sgn<=1; sgn+=2){
      const c=c0+w*sgn;
      if(c<0||c>=TGT_COLS) continue;
      const list=col[c];
      for(let k=0;k<list.length;k++){
        const q=list[k], v=units[q];
        if(!v||v.dead>0||v.doomed) continue;
        const d=Math.abs(v.x-u.x)*1.6+Math.abs(v.y-u.y);
        if(d<anyD){anyD=d;anyBest=q;}
        const w8=AIR_PREY[v.cls];
        if(!w8) continue;
        const score=d/w8;
        if(score<bd){bd=score;best=q;}
      }
      if(w===0) break;                       // centre column counted once
    }
  }
  return best>=0 ? best : anyBest;
}

/* ── Everyone shoots at, and faces, the nearest enemy ─────────────────────
   THE MEN TURNED AROUND AT RANDOM AND THIS IS WHY. Two faults compounding, and
   neither is in the facing code, which was doing exactly what it was told.

   FIRST, pickTarget WAS A RANDOM SAMPLE. It drew twenty-six units out of about
   seven hundred and took the nearest of THOSE. The odds that a sample of
   twenty-six contains the actual nearest enemy are small, so every shot picked
   a different, usually distant, enemy - and the shooter turned to face it. Not a
   facing bug: a facing instruction that was being handed a new random direction
   every few seconds. The nearest enemy is almost always in front of you, so
   picking one properly is most of what makes a line look like a line.

   SECOND, FACING WAS A SIDE EFFECT OF SHOOTING. u.aim was only written when a
   round was fired, and between shots a unit faced `front` - straight up the
   field. So the sequence was: face front, fire at a random enemy and snap
   toward it, hold, snap back to front, fire at a different random enemy. The
   snapping back was as visible as the snapping out.

   THE FIX FOR BOTH IS ONE THING: know who is actually nearest, cheaply, all the
   time. Facing then follows the enemy rather than the trigger.

   BUCKETED BY x, REBUILT ONCE PER STEP. A full scan is seven hundred units per
   query and there are hundreds of queries a second; a random sample is cheap and
   wrong. Thirty-two columns across the field, and a query reads its own column
   and its neighbours, which is a few dozen candidates and the right answer
   almost always. Rebuild cost is one pass over the array, which the step already
   does several of. */
const TGT_COLS = 32;
var tgtIdx = [null, null];               // [side -1][side +1], by index+1
function rebuildTargets(){
  for(let s=0;s<2;s++){
    if(!tgtIdx[s]){ tgtIdx[s] = []; for(let c=0;c<TGT_COLS;c++) tgtIdx[s].push([]); }
    for(let c=0;c<TGT_COLS;c++) tgtIdx[s][c].length = 0;
  }
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.dead>0 || u.doomed) continue;
    const c = Math.max(0, Math.min(TGT_COLS-1, (u.x*TGT_COLS)|0));
    tgtIdx[u.side===1?1:0][c].push(i);
  }
}

/* The nearest live enemy, or -1. band limits how far up or down the field a
   target may be, which is what stops a rifleman shooting over the hive; pass 0
   to ignore depth entirely.

   WIDENS RATHER THAN GIVES UP. Reading three columns finds a target on a busy
   field and finds nothing at all on a thin one, and a unit that finds nothing
   falls back to facing front - which is the flip-flop this replaces. So the
   search grows outward until it has a candidate or has read the field. */
function nearestEnemy(side, x, y, band){
  const idx = tgtIdx[side===1?0:1];
  if(!idx) return -1;
  const home = Math.max(0, Math.min(TGT_COLS-1, (x*TGT_COLS)|0));
  let best=-1, bd=1e9;
  for(let r=1; r<=TGT_COLS; r++){
    for(let c=home-r+1; c<=home+r-1; c++){
      if(c<0 || c>=TGT_COLS) continue;
      if(r>1 && c>home-r+1 && c<home+r-1) continue;   // only the new edges
      const col = idx[c];
      for(let k=0;k<col.length;k++){
        const j=col[k], v=units[j];
        if(!v || v.dead>0 || v.doomed) continue;
        if(band && Math.abs(v.y-y)>band) continue;
        const dx=v.x-x, dy=(v.y-y)*0.5;
        const d=dx*dx+dy*dy;
        if(d<bd){ bd=d; best=j; }
      }
    }
    /* Stop as soon as a ring produced something AND the next ring could not
       beat it. A column is 1/32 of the field wide, so anything beyond the ring
       that found the best candidate is at least that far out in x. */
    if(best>=0 && Math.sqrt(bd) <= r/TGT_COLS) break;
  }
  return best;
}

/* Who a unit is looking at. Refreshed on a slow, jittered timer rather than
   every frame: the answer barely changes between frames, and re-picking every
   frame makes a man twitch between two enemies at nearly equal range. Jittered
   so the whole line does not re-acquire in lockstep.

   THIS IS SEPARATE FROM FIRING ON PURPOSE. It is what he is looking at, and he
   looks at it whether or not his weapon is ready. */
function acquire(u, dt, band){
  u.aimT = (u.aimT||0) - dt;
  const v = u.aim>=0 ? units[u.aim] : null;
  const stale = !v || v.dead>0 || v.doomed;
  if(stale || u.aimT<=0){
    u.aim = nearestEnemy(u.side, u.x, u.y, band||0);
    u.aimT = 380 + Math.random()*520;
  }
  return u.aim;
}

/* Kept as the name the rest of the file calls, so the change is one function
   rather than a rename across a dozen call sites. */
function pickTarget(side,x,y,band){ return nearestEnemy(side,x,y,band); }
/* Suppression: near misses stop a unit shooting and put it low behind its
   cover for a few seconds. This is what makes the fight look like a fight
   rather than two crowds trading pixels at a constant rate. */
function suppressNear(x,y,r,mult){
  const r2=r*r; let n=0;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.dead>0||u.cls==='heli') continue;
    const dx=(u.x-x)*FIELD_W, dy=(u.y-y)*FIELD_D;
    const d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    u.sup=Math.min(2600,u.sup+(1-Math.sqrt(d2)/r)*900*(mult||1));
    n++;
  }
  return n;
}

/* Turn rate is bounded so units pivot rather than snap. */
function faceToward(u,tx,ty,dt){
  const dx=wx(tx)-wx(u.x), dz=wz(ty)-wz(u.y);
  if(dx*dx+dz*dz<0.01) return;
  const want=Math.atan2(dx,dz);
  let d=want-u.hdg;
  while(d>Math.PI) d-=Math.PI*2;
  while(d<-Math.PI) d+=Math.PI*2;
  u.hdg+=Math.max(-0.006*dt,Math.min(0.006*dt,d));
  if(u.hdg>Math.PI) u.hdg-=Math.PI*2;
  else if(u.hdg<-Math.PI) u.hdg+=Math.PI*2;
}

let coverCount=0,meleeCount=0,supCount=0,boundCount=0,localKills=0,airCount=0,shieldCount=0;

function stepField(dtRaw){
  const dt=dtRaw*TEMPO;
  const front=CL.front;
  fireBudget=Math.min(140,fireBudget+SHOTS_PER_SEC*(0.12+CL.vol*0.88)*dtRaw/1000);
  coverCount=0; meleeCount=0; supCount=0; boundCount=0; airCount=0; shieldCount=0;
  tallyObjectives();
  rebuildTargets();
  turretLive=0;
  for(let i=0;i<units.length;i++)
    if(units[i].cls==='turret'&&units[i].dead<=0) turretLive++;

  for(let i=0;i<units.length;i++){
    const u=units[i];

    if(u.dead>0){
      u.dead-=dt*0.0011;
      if(u.dead<=0){
        u.dead=0; u.doomed=0; u.fire=0; u.mel=-1; u.swipes=0; u.pinned=0; u.sup=0;
        u.hp=u.hpMax; u.crash=0; u.killedBy=-1;
        if(u.cls==='heli') u.alt=16+Math.random()*8;
        if(u.cls==='flyer') u.alt=12+Math.random()*10;
        u.st=S_BOUND; u.stT=800+Math.random()*2400;
        releaseSlot(u);
        // Rushers come out of a hive city mouth if there is one on this world.
        // A brood that reinforces from a hole in the ground reads completely
        // differently from one that walks in from the horizon.
        if(MELEE_CLS[u.cls] && hiveCities.length){
          const c=hiveCities[(Math.random()*hiveCities.length)|0];
          u.x=Math.max(0.02,Math.min(0.98,c.cx+(Math.random()-0.5)*c.r*2.2));
          u.y=Math.max(0.01,c.cy+(Math.random()-0.5)*c.r*1.2);
        } else {
          const rear = u.side===1 ? Math.min(0.99,CL.front+0.30)
                                  : Math.max(0.01,CL.front-0.30);
          u.y = rear + (Math.random()-0.5)*0.06;
          u.x = Math.max(0.02,Math.min(0.98,u.x+(Math.random()-0.5)*0.16));
        }
      }
      continue;
    }
    /* WHETHER A MAN IS WALKING IS A FACT ABOUT HIS POSITION, not about his
       state flag. The animation used to be chosen from u.st and u.sup, and
       neither tracks movement reliably: a unit BOUNDING with sup>900 played the
       crouch while walking, and S_PINNED moves every frame but has no case at
       all so it fell through to idle. Both slid across the ground in a
       stationary pose. Measured here, once, from the position last frame, so
       every branch below is covered including the ones that `continue` early
       and any added later. */
    const _mvd = Math.hypot(u.x-(u.px===undefined?u.x:u.px), u.y-(u.py===undefined?u.y:u.py));
    u.mv = u.mv===undefined ? 0 : u.mv*0.6 + (_mvd/Math.max(1,dtRaw))*0.4;
    u.px = u.x; u.py = u.y;
    if(u.fire>0) u.fire=Math.max(0,u.fire-dtRaw*0.010);
    /* Pose timers, in milliseconds, decayed alongside the muzzle flash. These
       exist only to hold an animation long enough to be seen: a hit that lasts
       one frame is a hit nobody saw. */
    if(u.hitT>0)  u.hitT =Math.max(0,u.hitT -dtRaw);
    if(u.nadeT>0) u.nadeT=Math.max(0,u.nadeT-dtRaw);
    /* THE GRENADE TIMER HAS TO DRAIN IN REAL TIME. It used to be decremented
       inside the aimed-fire block, which is only reached after the weapon
       cooldown has elapsed, so it lost one frame of time per three seconds of
       real time: a four second timer took twelve and a half MINUTES. That is
       why no grenade was ever thrown. A cooldown counts seconds, so it has to
       be decremented where seconds are counted. */
    if(u.nade>0) u.nade=Math.max(0,u.nade-dtRaw);
    u.ph += dtRaw*0.006*u.sk*(1+CL.vol*0.5);
    if(u.sup>0) u.sup=Math.max(0,u.sup-dt);

    /* gunships: crash out when killed, spiralling down */
    if(u.cls==='heli'&&u.crash){
      u.alt-=dt*0.020; u.ph+=dt*0.02;
      u.x+=Math.sin(u.ph*0.6)*0.0004;
      if(u.alt<=0){ u.alt=0; u.crash=0; u.dead=Math.min(u.dead,0.8);
                    blast(u.x,u.y,BLAST*0.7); flash(u.x,u.y,1,0,1); }
      continue;
    }

    /* flyers: the brood's answer to air. They ignore the ground entirely and
       run down gunships, which is the only counter the Coalition air wing
       previously had no reason to fear. */
    if(u.cls==='flyer' || u.cls==='wing'){
      airCount++;
      /* The strafing run winds down on its own clock. It is set when a strike
         lands and it is what broodAnim reads to pick start, loop or end, so a
         run plays through once rather than the animation flickering on and off
         with the melee timer. */
      if(u.atkT>0) u.atkT-=dt;
      let j=u.aim;
      if(j<0||!units[j]||units[j].dead>0||!airPrey(units[j],u)){
        j=nearestPrey(u);
        u.aim=j;
      }
      if(j>=0){
        const v=units[j];
        const dx=v.x-u.x, dy=v.y-u.y, L=Math.hypot(dx,dy)||1;
        u.x+=dx/L*u.sp*dt*0.055; u.y+=dy/L*u.sp*dt*0.055;
        u.alt+=(v.alt-u.alt)*0.03;
        faceToward(u,v.x,v.y,dt);
        if(L<0.012){
          u.melT-=dt;
          if(u.melT<=0){ u.melT=700+Math.random()*500; u.atkT=BROOD_ATK_MS;
            /* The large fly hits harder for the same reason it is rarer and
               takes twice as long to shoot down: it has to be worth noticing. */
            flash(v.x,v.y,-1,1,u.cls==='wing');
            hurt(j,DMG.claw*(u.cls==='wing'?2:1),i,undefined,true); }
        }
      }else{
        const hold=front-0.16;
        u.y+=Math.sign(hold-u.y)*u.sp*dt*0.04;
        u.x+=u.vx*dt*0.08;
        if(u.x<0.06||u.x>0.94) u.vx*=-1;
        u.alt+=((14)-u.alt)*0.02;
        faceToward(u,u.x+u.vx*40,u.y,dt);
      }
      continue;
    }

    /* ── The leaper's bound ───────────────────────────────────────────
       A hopclops has jump and fall frames and no strike, so it closes in hops
       and hits on arrival. The arc is real vertical motion rather than a
       cosmetic bob: broadAnim picks jump or fall off the sign of u.vy, so a
       fake arc would show the wrong frame on the way down.

       Gravity is applied BEFORE the melee branch runs, not after, or a leaper
       that reaches contact mid-air lands the following frame and reads as
       hitting from above nothing. */
    if((u.cls==='leap' || u.cls==='spit') && u.dead<=0){
      if(u.alt>0 || u.vy>0){
        u.vy -= dt*0.00075;
        u.alt = Math.max(0, u.alt + u.vy*dt*0.06);
        if(u.alt<=0){ u.vy=0; u.hopCd=520+Math.random()*900; }
      } else {
        u.hopCd=(u.hopCd||0)-dt;
        // Only bound when there is somewhere to be: a leaper hopping on the
        // spot at the back of the field is a twitch, not a behaviour.
        /* A SPITTER HOPS AFTER FIRING, NOT WHILE MOVING. The leaper's gate is
           "am I going somewhere"; the spitter's is "have I just given away where
           I am". Gating both on movement left the spitters, which mostly hold a
           firing position, sitting perfectly still and never using the jump
           frames the creature is built around. */
        const wants = u.cls==='spit' ? (u.fire>0.35) : ((u.mv||0)>0.000010);
        if(u.hopCd<=0 && wants){ u.vy=0.62+Math.random()*0.28; u.alt=0.01;
          u.hopCd = u.cls==='spit' ? 1400+Math.random()*1800 : 520+Math.random()*900; }
      }
    }

    /* SHIELD TROOPERS screen the riflemen. They hold just behind the firing
       positions and go out to meet any rusher that closes, which is what the
       line needed: infantry in cover cannot defend themselves at contact range
       and were simply being overrun. This is the blade trooper's job unchanged,
       carried over to the class that replaced it. */
    if(u.cls==='enf'){
      shieldCount++;
      let j=u.mel;
      if(j>=0&&(!units[j]||units[j].dead>0||units[j].side===u.side)) { j=-1; u.mel=-1; }
      if(j<0){ j=nearestBash(u); if(j>=0) u.mel=j; }
      /* THIS BRANCH NEVER SET u.st, which did not matter while the class was
         drawn as a wireframe: nothing read the state to pick geometry. It
         matters now. The sprite layer chooses an animation from u.st, so a
         shield trooper left in the S_BOUND it was seeded with played the walk
         cycle permanently, whether it was closing on a rusher, standing on the
         line or hitting something. The state is the animation now, so it has
         to be true. */
      if(j>=0){
        const v=units[j];
        const dx=v.x-u.x, dy=v.y-u.y, L=Math.hypot(dx,dy)||1;
        faceToward(u,v.x,v.y,dt);
        if(L>0.010){
          u.st=S_BOUND;                      // closing: walking
          u.x+=dx/L*u.sp*dt*0.055; u.y+=dy/L*u.sp*dt*0.055;
        } else{
          u.st=S_HOLD;                       // at contact: bashing
          meleeCount++;
          u.melT-=dt;
          if(u.melT<=0){ u.melT=560+Math.random()*420;
            /* u.side, not a literal 1. The flash is coloured by whose blow it
               is, and an away-side shield trooper was striking in home colours. */
            flash(v.x,v.y,u.side,1,0); hurt(j,DMG.bash,i,undefined,true); }
        }
      }else{
        /* THE LINE HE MARCHES TO IS ON HIS OWN SIDE OF THE FRONT. This was
           `front+0.055`, a hardcoded home-side offset, so an away shield trooper
           walked ACROSS the front and stood in the home line - which is exactly
           the "shield enemies seem to join the attacking line" report, and it
           was never a targeting fault at all. He was doing what he was told. */
        const hold=front+(u.side===1?1:-1)*0.055;
        const gap=Math.abs(hold-u.y);
        u.st = gap>0.012 ? S_BOUND : S_HOLD; // marching up, or stood on the line
        u.y+=Math.sign(hold-u.y)*Math.min(gap,u.sp*dt*0.045);
        u.x+=u.vx*dt*0.05;
        if(u.x<0.03||u.x>0.97) u.vx*=-1;
        faceToward(u,u.x,front,dt);
      }
      continue;
    }

    /* gunships: no cover, orbit the friendly shoulder, burst then reset */
    if(u.cls==='heli'){
      const hold=front+0.13;
      u.y += Math.sign(hold-u.y)*Math.min(Math.abs(hold-u.y),u.sp*dt*0.06);
      u.x += u.vx*dt*0.10;
      if(u.x<0.06||u.x>0.94) u.vx*=-1;
      u.alt=17+Math.sin(u.ph*0.35)*3;
      faceToward(u,u.x+u.vx*40,u.y-0.12,dt);
      u.cd-=dt;
      if(u.cd<=0&&fireBudget>=1){
        u.burst=(u.burst||0)+1;
        u.cd = u.burst>=5 ? (u.burst=0, 3600*(0.7+Math.random())) : 150;
        /* A FLYER ON APPROACH IS THE PRIORITY TARGET, and this was looking for
           one the same way the flyers were looking for gunships: twenty random
           draws out of seven hundred units, which finds a specific rare class
           about as often as not. Now that flyers actually hunt armour, the
           turret is the thing they hunt, so the turret has to be able to see
           them coming. Scanned properly, enemy-only, through the same index. */
        let j=-1,bd=0.10;
        {
          const col=tgtIdx[u.side===1?0:1];
          const c0=Math.max(0,Math.min(TGT_COLS-1,(u.x*TGT_COLS)|0));
          for(let c=Math.max(0,c0-3);c<=Math.min(TGT_COLS-1,c0+3);c++){
            const list=col?col[c]:null; if(!list) continue;
            for(let k=0;k<list.length;k++){
              const q=list[k], v=units[q];
              if(!v||v.dead>0||(v.cls!=='flyer'&&v.cls!=='wing')) continue;
              const d=Math.hypot(v.x-u.x,v.y-u.y);
              if(d<bd){bd=d;j=q;}
            }
          }
        }
        /* u.side, NOT A LITERAL 1. A turret asked for side 1's enemies whoever
           owned it, which was harmless only because awayClass never returns
           'turret' - a bug waiting on a content change, and the same shape as
           the three side-versus-faction faults already found in this file. */
        if(j<0) j=pickTarget(u.side,u.x,front,0.18);
        if(j>=0){ fireBudget-=1;
          fire(u,units[j].x+(Math.random()-0.5)*0.015,units[j].y,null,0,0,j,DMG.cannon,units[j].alt); }
      }
      continue;
    }

    /* rushers: dash-pause rather than a constant sprint, then melee */
    /* MELEE IS A BEHAVIOUR, NOT A CLASS NAME. rush, brute, leap and grub all
       close and strike; they differ in speed, toughness and what they look like
       doing it. Testing the name meant three new creatures walked to contact and
       then stood there, because the whole melee branch was gated on one string. */
    if(MELEE_CLS[u.cls]){
      if(u.mel>=0){
        const v=units[u.mel];
        if(!v||v.dead>0||v.doomed){ u.mel=-1; u.swipes=0; }
        else{
          meleeCount++;
          u.x+=(v.x-u.x)*0.08; u.y+=(v.y-u.y+0.005)*0.08;
          faceToward(u,v.x,v.y,dt);
          if(v.slot>=0) releaseSlot(v);
          v.pinned=900; v.st=S_PINNED;
          u.melT-=dt;
          if(u.melT<=0){
            u.melT=520+Math.random()*380; u.swipes++;
            flash(v.x,v.y,-1,1,0);
            hurt(u.mel,DMG.swipe,i,undefined,true);
            if(u.swipes>=3+((Math.random()*3)|0)){ u.mel=-1; u.swipes=0; u.cd=1800; }
          }
          continue;
        }
      }
      u.dash-=dt;
      if(u.dash<=-900){ u.dash=700+Math.random()*700; }
      const moving = u.dash>0;
      const j=pickTarget(-1,u.x,front,0.34);
      if(j>=0){
        const v=units[j];
        const dx=v.x-u.x, dy=v.y-u.y, L=Math.hypot(dx,dy)||1;
        if(moving){
          const jink=Math.sin(u.ph*2.2)*0.35;
          u.x+=(dx/L+jink)*u.sp*dt*0.055;
          u.y+=dy/L*u.sp*dt*0.055;
        }
        faceToward(u,v.x,v.y,dt);
        if(L<0.013){ u.mel=j; u.melT=380; }
      }else if(moving){
        u.y+=Math.sign(front-u.y)*u.sp*dt*0.05;
      }
      continue;
    }

    /* driven off a position: fall back before taking another */
    if(u.pinned>0){
      u.pinned-=dt;
      u.y += u.side===1 ? u.sp*dt*0.05 : -u.sp*dt*0.05;
      if(u.pinned<=0) u.st=S_BOUND;
      continue;
    }

    /* ── engineers place emplacements ────────────────────────────────
       TURRET COUNT IS NOT A FLAT SHARE OF THE FIELD ANY MORE. It is what the
       engineers on the ground can put up, which makes it scale on BOTH things
       that should move it: funding decides how many each engineer can run, and
       how many engineers are alive is the disposition of the force.

       An engineer walks his band, and when the position is short of guns he
       stops and builds one. That is the placing animation doing real work
       rather than decorating a spawn, and it is why an emplacement appears
       where a technician is standing instead of materialising in open ground. */
    if(u.cls==='eng'){
      if(u.place>0){
        u.place-=dt;
        u.st=S_HOLD;
        faceToward(u,u.x,front,dt);
        if(u.place<=0){
          /* RE-CHECK THE CEILING AT COMPLETION, not only when the build began.
             Thirty engineers can all start a fourteen hundred millisecond build
             in the same frame while the count is under the ceiling, and all
             thirty then finish: a limit of twenty produced thirty-seven guns.
             A permit granted is not a permit still valid. */
          if(turretLive < turretCeiling()){
            const t=spawnTurretAt(u.x,Math.min(0.94,u.y-0.02));
            if(t>=0) u.built++;
          }
        }
        continue;
      }
      /* An engineer is not infantry and should not be occupying a firing
         position: twenty-seven of twenty-seven were sitting in cover that
         riflemen needed. */
      if(u.slot>=0){ releaseSlot(u); u.slot=-1; }
      /* One gun per engineer unfunded, up to three when the window is covered. */
      const allow=1+Math.floor(FORCE.fundRatio*2);
      if(u.built<allow && turretLive<turretCeiling() && u.y>front+0.10 && Math.random()<0.02){
        u.place=1400; u.st=S_HOLD; continue;
      }
    }

    /* ── armour ──────────────────────────────────────────────────────
       A TANK WAS USING THE INFANTRY PATH, which meant it claimed a cover slot
       and drove to it. Twelve of twelve were sitting in cover, which is wrong
       twice over: armour does not hide behind a rock, and every slot a tank
       takes is one a rifleman needed. Sixty positions were being contested by
       two hundred and thirty units.

       It holds a standoff line instead, traverses along it looking for an
       angle, and backs off the line when it has just been hit. Its gun already
       outranges everything else on the field, so standing off is also how it
       should be fighting. */
    if(u.cls==='tank'){
      if(u.slot>=0){ releaseSlot(u); u.slot=-1; }
      /* THE STANDOFF IS MEASURED BACKWARDS FROM THE LINE, SO IT NEEDS GROUND TO
         MEASURE INTO. Flat, this was front+0.20 and front+0.30, and a zone opens
         at front=0.95: the tank reversed to 1.15 and left the field. Scaled by
         the room behind the line it collapses toward the line instead, which is
         a tank with its back to the wall and nowhere to stand off to.

         SIGNED BY SIDE as well. broodClass never returns 'tank' today so this
         branch has only ever run for side 1, and the flat `front +` was right by
         accident. It stops being right the day the hive gets armour, and a bug
         that waits for a content change is worse than one that fires now. */
      const dirH = u.side===1 ? 1 : -1;
      const stand = front + dirH*(u.hitT>0 ? 0.30 : 0.20)*roomK(u.side, front);
      const gap = stand - u.y;
      if(Math.abs(gap) > 0.008){
        u.st = S_BOUND;
        u.y += Math.sign(gap)*Math.min(Math.abs(gap), u.sp*dt*0.05);
      } else {
        u.st = S_HOLD;
        u.x += u.vx*dt*0.018;                    // traverse, looking for an angle
        if(u.x<0.05||u.x>0.95) u.vx*=-1;
      }
      if(u.aim>=0 && units[u.aim] && units[u.aim].dead<=0)
        faceToward(u,units[u.aim].x,units[u.aim].y,dt);
      else { const lk = acquire(u, dt, 0);
             if(lk>=0) faceToward(u,units[lk].x,units[lk].y,dt);
             else faceToward(u,u.x,front,dt); }
      u.cd-=dt;
      if(u.cd>0) continue;
      if(fireBudget<1){ u.cd=200; continue; }
      u.cd = 9000*(0.75+Math.random()*0.5);
      const tj=pickTarget(u.side,u.x,front,0.44);
      if(tj<0) continue;
      u.aim=tj; fireBudget-=1;
      fire(u,units[tj].x+(Math.random()-0.5)*0.010,units[tj].y,null,true,0,tj,DMG.shell,units[tj].alt);
      continue;
    }

    /* ── emplacements ────────────────────────────────────────────────
       AN EMPLACEMENT DOES NOT MANOEUVRE, and dropping it into the infantry
       path was not a cosmetic mistake. That path puts a unit into S_BOUND,
       claims it a cover slot and walks it there at u.sp. A turret's speed is
       zero, so it never arrived, never left S_BOUND, and BOUNDING UNITS DO NOT
       FIRE: every emplacement on the field was a gun that had never shot,
       playing a walk cycle on the spot, while holding a cover position a
       rifleman could have used.

       It holds where it was dug in, keeps its slot free for infantry, and
       reaches further than a man because that is what it is for. */
    if(u.cls==='turret'){
      if(u.slot>=0) releaseSlot(u);
      u.slot=-1; u.st=S_HOLD; u.stT=6000;
      /* A gun being bolted down is not a gun that is shooting. */
      if(u.deploy>0){ u.deploy-=dt; continue; }
      if(u.aim>=0 && units[u.aim] && units[u.aim].dead<=0)
        faceToward(u,units[u.aim].x,units[u.aim].y,dt);
      else { const lk = acquire(u, dt, 0);
             if(lk>=0) faceToward(u,units[lk].x,units[lk].y,dt);
             else faceToward(u,u.x,front,dt); }
      if(Math.abs(u.y-front)>0.34) continue;
      u.cd-=dt;
      if(u.cd>0) continue;
      if(fireBudget<1){ u.cd=200; continue; }
      u.cd = 2200*(0.6+Math.random()*0.8);
      const tj=pickTarget(u.side,u.x,front,0.30);
      if(tj<0) continue;
      u.aim=tj; fireBudget-=1;
      fire(u,units[tj].x+(Math.random()-0.5)*0.018,units[tj].y,
           null,false,0,tj,DMG.rifle,units[tj].alt);
      continue;
    }

    const isTank=u.cls==='tank';
    /* Coalition holds depth ABOVE the front, the brood below it. These bands
       were written under the old inverted convention and never updated when
       the front was redefined. Every ground unit was therefore marching to a
       position on the enemy's side of the line: the two armies walked through
       each other continuously, nobody ever settled, and the bounding count
       sat at a third of the field permanently. */
    /* An engineer is a technician with a carbine, not a rifleman. He works
       behind the firing line, which is also where his emplacements are, so his
       band sits deeper than the infantry's rather than on top of it. */
    const isEng=u.cls==='eng';
    /* POSTURE IS A DEPTH OFFSET AND NOTHING MORE. Whether the Coalition is
       supporting Jade or leading the charge is the question of who stands
       nearer the enemy, and the band clamp is already the thing that decides
       that. One number, and the picture answers it without a word of UI. */
    /* POSTURE IS ABOUT WHICHEVER FACTION HOLDS THE FORWARD BAND, not about Jade.
       This read `u.fac==='jade'` on one branch and `jadeFrac>0` on the other,
       which is two spellings of "is this the Jade case" and neither survives a
       line with no Jade on it at all. The roster names the forward faction, so
       the question is now simply whether this man is it. Zero when nobody is
       named or when only one faction is present, because a posture is a
       relationship between two parts of a line and a line with one part has
       none. */
    const fwdFac = ROSTER.fwd;
    const fwd = (u.side!==1 || !fwdFac || ROSTER.home.length < 2) ? 0
              : (u.fac === fwdFac ? -0.055 : 0.055);
    /* Same room scaling as the tank standoff, and for the same reason: an
       engineer's band topped out at front+0.40+fwd, which is 1.41 on a zone that
       has just opened. Scaling rather than clamping keeps eng behind tank behind
       rifleman all the way down to a pinned line, where a clamp would stack all
       three on 0.98. DEPTH_NEED_HOME/HIVE are the widest offsets on these two
       lines; changing a number here means changing one of those. */
    const rk = roomK(u.side, front);
    /* ROOM SCALING ONLY GUARDS THE DIRECTION IT MEASURES. It is the depth
       BEHIND the line, so it says nothing about `fwd`, which is signed and can
       point the other way: the jade-forward posture is -0.055 against an
       infantry floor of 0.015, so at front=0.05 the home band floor came out at
       0.010, below the field. Found by running the numbers over every hive
       percentage, not by reading the expression.

       Worth stating plainly rather than burying, because the clamp hides it:
       that posture offset is LARGER than the infantry floor it is added to, so
       jade-forward already stands home infantry about 0.04 past the front, on
       ground campOwner says the hive holds, at every front position and not just
       this one. That is a posture question and not an edge-of-map question, so
       it is left exactly as it was rather than quietly redesigned here. */
    /* ── The band is nearly twice as deep as it was ──────────────────────
       MOVING THE FRONT WAS THE SMALLER HALF OF THIS AND IT IS WORTH BEING
       EXPLICIT ABOUT WHICH LEVER DID THE WORK. Below about hive 50 the front
       already had all the room it needed and the line STILL stood in 0.165 of
       depth, because that is simply how wide the band was: infantry ran from
       front+0.015 to front+0.18 and no further. Relocating the front fixes the
       crushed case and does nothing at all for the ordinary one.

       Infantry now run to +0.32 and the hive line to -0.30, so a line occupies
       0.305 of the field where it occupied 0.165. Riflemen spread back toward
       the engineers instead of stacking on the first sixth of the available
       ground.

       IT COSTS NOTHING IN THE SCALING BUDGET. DEPTH_NEED_HOME is the widest
       offset on the side, which is the ENGINEER's 0.40 plus the jade posture -
       infantry at 0.32 is still inside it, so roomK is unchanged and no other
       band moves. On the hive side 0.30 is exactly DEPTH_NEED_HIVE, which is the
       struck tank standoff, so that one is at its ceiling and cannot widen
       further without raising the constant too. */
    const lo = Math.max(Y_LO, Math.min(Y_HI, u.side===1 ? front+((isTank?0.10:isEng?0.16:0.015)+fwd)*rk : front-(u.cls==='spit'?0.30:0.30)*rk));
    const hi = Math.max(Y_LO, Math.min(Y_HI, u.side===1 ? front+((isTank?0.36:isEng?0.40:0.32)+fwd)*rk : front-(u.cls==='spit'?0.03:0.02)*rk));

    /* WHO IS ENTITLED TO A FIRING POSITION. Releasing a slot in the engineer
       branch did nothing, because the generic path below immediately claimed
       another one: engineers were still twenty-seven of twenty-seven in cover.
       The rule has to live where the claiming happens.

       And not every rifleman should be digging in either. With cover
       everywhere, sixty percent of the line was static behind a rock at any
       moment, which is a firing line and not an assault. A third of the
       infantry never takes cover: they advance and shoot from the open, so
       there is always a body of men moving forward for the rest to support. */
    const noCover = (u.cls==='eng') || (u.cls==='inf' && (u.i%3)===0);
    if(noCover && u.slot>=0){ releaseSlot(u); u.slot=-1; }
    let s = (!noCover && u.slot>=0) ? slots[u.slot] : null;
    if(s&&slots[u.slot].owner!==u.i){ u.slot=-1; s=null; }
    if(s&&(s.y<lo-0.06||s.y>hi+0.06)){ releaseSlot(u); s=null; u.st=S_BOUND; }

    /* ── bounding overwatch ───────────────────────────────────────────
       A fireteam holds its position for a long beat, then bounds forward
       to the next one. Teams are staggered by index so roughly a third of
       the line is moving at any moment and the rest is shooting, instead
       of everybody drifting toward the enemy at the same speed forever. */
    u.stT-=dt;
    /* ORDERS ARE REVIEWED, NOT FIXED FOR LIFE. Without this a unit assigned to
       an objective at spawn walks to it and stays there while the front moves
       past, which is the other half of the "won't move" complaint. Reviewed on
       a long, jittered timer so a line does not re-task in unison and swap
       flanks visibly. */
    u.objT-=dt;
    if(u.obj<0 || u.objT<=0){ u.obj=pickObjective(u); u.objT=9000+Math.random()*11000; }
    if(u.sup>900 && s){ u.st=S_SUPP; }
    else if(u.st===S_SUPP && u.sup<=420){ u.st=S_HOLD; u.stT=2600+Math.random()*3600; }
    /* A position being hammered is a position to leave. Previously a pinned-
       down squad sat in the same slot indefinitely soaking it. */
    if(u.st===S_SUPP && u.sup>2300){
      teamFeat[u.team]=null; releaseSlot(u);
      u.st=S_BOUND; u.stT=3400+Math.random()*3000; u.sup=1400;
    }

    /* HOLD has no movement code: it assumes a slot. A unit that failed to
       find one and timed out of BOUND landed in HOLD with s === null and then
       stood perfectly still, firing from the open, until its team phase came
       round again. That is the "won't move while the enemy advances" case.
       No slot means keep bounding. */
    if(u.st===S_HOLD && !s && !noCover){ u.st=S_BOUND; u.stT=Math.max(u.stT,1500); }

    if(u.st===S_HOLD && u.stT<=0){
      /* The comment on this block claims roughly a third of the line is moving
         at any moment. Measured, it was eleven percent: the phase window is
         nine seconds wide and the holds are long, so a team waits out most of
         its own turn. Faster cycle, and the men who never dig in hold for half
         as long, because pushing forward is the whole of their job. */
      const teamPhase=(u.team*7)%3;
      if(teamPhase!==((performance.now()/5000)|0)%3){ u.stT=900; }
      else { releaseSlot(u); u.st=S_BOUND;
             u.stT=(noCover?1600:3000)+Math.random()*(noCover?1600:3200); }
    }
    if(u.st===S_BOUND){
      boundCount++;
      if(!s && !noCover){
        const fi=pickFeature(u,lo,hi,isTank);
        let got = fi>=0 ? claimOnFeature(u,fi,lo,hi,isTank) : -1;
        if(got<0) got=claimSlot(u,lo,hi,isTank);
        s=got>=0?slots[got]:null;
      }
      if(s){
        const d=Math.hypot(s.x-u.x,s.y-u.y);
        if(d>0.004){
          faceToward(u,s.x,s.y,dt);
          u.x+=(s.x-u.x)/d*u.sp*dt*0.055;
          u.y+=(s.y-u.y)/d*u.sp*dt*0.055;
        }else{ u.x=s.x; u.y=s.y; u.st=S_HOLD; u.stT=3200+Math.random()*4200; }
      }else{
        /* NO SLOT MEANS ADVANCE ON THE OBJECTIVE, not drift. This was
           `u.x += u.vx*dt` with a bounce off the field edges, which is a random
           walk: correct depth, no width, and an army that spreads into an even
           wash from one flank to the other. Depth still comes from the band;
           width now comes from the ground the unit was told to take.

           The lateral term is deliberately slower than the forward one. Men
           close on an objective at an angle rather than sliding sideways along
           the front and then walking straight up it, and the difference is
           visible at field size. */
        if(u.obj===undefined || u.obj<0) u.obj=pickObjective(u);
        const o=objectives[u.obj];
        const t=(lo+hi)*0.5;
        u.y+=Math.sign(t-u.y)*Math.min(Math.abs(t-u.y),u.sp*dt*0.04);
        if(o){
          /* Steer at the near edge of anything solid straddling the lane rather
             than at the objective through it. Face where he is actually walking,
             or a column rounding a ridge is a column of men looking sideways. */
          const ox=avoidX(u,o.x,t);
          const dx=ox-u.x;
          u.x+=Math.sign(dx)*Math.min(Math.abs(dx),u.sp*dt*0.026);
          faceToward(u,ox,t,dt);
        } else {
          u.x+=u.vx*dt*0.05;
          if(u.x<0.02||u.x>0.98) u.vx*=-1;
        }
        if(u.stT<=0){ u.st=S_HOLD;
          u.stT=(noCover?1100:2400)+Math.random()*(noCover?1300:3000); }
      }
      continue;                                   // bounding units do not fire
    }

    if(u.st===S_SUPP){ supCount++; if(s){ coverCount++; } continue; }
    /* The idle bob was sub-centimetre in world terms, but the sprite layer
       rounds to whole pixels, so at close range it landed as a one pixel twitch
       on and off rather than a settle. A man holding a position is still; his
       animation is what moves. */
    if(s){ coverCount++; u.y=s.y; u.x=s.x; }
    /* LOOK BEFORE YOU SHOOT. This used to read u.aim, which was only written
       when a round was fired - so between shots the man faced `front` and then
       snapped to whatever the next random target happened to be. Acquiring here
       means he is already looking at the nearest enemy when his weapon comes
       ready, and keeps looking at it after. */
    const look = acquire(u, dt, 0);
    if(look>=0) faceToward(u,units[look].x,units[look].y,dt);
    else faceToward(u,u.x,front,dt);

    /* aimed fire from the position */
    const reach=isTank?0.42:(u.cls==='spit'?0.26:0.20);
    if(Math.abs(u.y-front)>reach) continue;
    u.cd-=dt;
    if(u.cd>0) continue;
    if(fireBudget<1){ u.cd=200; continue; }
    /* A MAIN GUN EVERY TEN SECONDS IS A TANK PARKED, NOT A TANK FIGHTING. The
       old figure was set when armour was a rare wireframe silhouette and each
       shell was meant to land as an event; a funded push now puts a dozen
       Hounds on the field with a firing animation, and at that rate most of
       them are idle most of the time and the animation almost never plays.

       Four and a half seconds is still far slower than a rifle at three, so a
       tank still reads as heavy - it is the cadence of a gun being reloaded
       rather than of one being parked. */
    u.cd = isTank ? 4500*(0.75+Math.random()*0.5)
         : u.side===1 ? 3000*(0.6+Math.random()*0.9)
         : 4200*(0.6+Math.random()*0.9);
    /* A grenade is thrown at a CROWD, and only by riflemen: the shield line
       has its hands full and an engineer is carrying tools. */
    if(u.cls==='inf' && u.side===1){
      if(u.nade<=0){
        const nt=nadeTarget(u);
        if(nt){ u.nade=9000+Math.random()*11000; u.nadeT=420;
                faceToward(u,nt[0],nt[1],dt); throwNade(u,nt[0],nt[1]);
                u.cd=1600; continue; }
        u.nade=2200;
      }
    }
    /* SHOOT AT WHAT HE IS LOOKING AT. Drawing a fresh target here was the other
       half of the turning: he would face one enemy, then fire at a different one
       and snap round to it. The acquired target is used if it is inside the
       weapon's depth band, and only if it is not does he look for another. */
    let j = u.aim;
    const vv = j>=0 ? units[j] : null;
    if(!vv || vv.dead>0 || vv.doomed || Math.abs(vv.y-front) > (isTank?0.44:0.24))
      j = pickTarget(u.side,u.x,front,isTank?0.44:0.24);
    if(j<0) continue;
    u.aim=j; u.aimT=Math.max(u.aimT||0, 260);
    fireBudget-=1;
    fire(u,units[j].x+(Math.random()-0.5)*(isTank?0.010:0.024),units[j].y,
         null,isTank,0,j,isTank?DMG.shell:(u.side===1?DMG.rifle:DMG.spike),units[j].alt);
  }

  /* ── ground is solid ─────────────────────────────────────────────────
     One pass, after every branch above has finished writing positions. The
     unit loop has four separate places that move a unit and the branch
     somebody adds next month will be the fifth; a pass that runs after all of
     them is the only version that cannot be forgotten. Dead units are skipped
     because a corpse lying half in a rock is not a thing worth a frame. */
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.dead>0) continue;
    pushOut(u);
    if(u.x<0.01) u.x=0.01; else if(u.x>0.99) u.x=0.99;
    /* The last word on the edges. Room scaling means nothing should reach
       these any more, and that is exactly why they are here: this is the rail
       that turns the next depth-offset mistake into a unit pressed against the
       baseline instead of one that drives off the map still firing. */
    if(u.y<Y_LO) u.y=Y_LO; else if(u.y>Y_HI) u.y=Y_HI;
  }

  /* rounds */
  for(let i=0;i<PMAX;i++){
    const p=rounds[i]; if(!p.on) continue;
    p.t+=dt;
    if(p.t<p.dur) continue;
    p.on=0; pLive--;
    /* local damage: a round that was aimed at somebody hurts them */
    if(p.tgt>=0 && p.dmg>0){
      const v=units[p.tgt];
      if(v && v.dead<=0){
        const dx=(v.x-p.tx)*FIELD_W, dy=(v.y-p.ty)*FIELD_D;
        if(dx*dx+dy*dy < 36) hurt(p.tgt,p.dmg,-1,p.y);
      }
    }
    if(p.heavy){
      /* Tank round: a shell, not a bullet. Everything inside the radius is
         suppressed, and if the server credited a multi-kill this is the
         round that carries it, so the count in the feed matches the number
         of wireframes that actually come apart. */
      blast(p.tx,p.ty,BLAST);
      flash(p.tx,p.ty,p.side,0,1);
      suppressNear(p.tx,p.ty,BLAST*1.9,1.5);
      damageNear(p.tx,p.ty,BLAST,-p.side,DMG.shell);
      if(p.kills>0) killNear(p.tx,p.ty,BLAST,-p.side,p.kills,p.doom);
      else if(p.doom>=0){ const v=units[p.doom]; if(v){ v.dead=1; v.deadAt=_sprT; v.doomed=0; releaseSlot(v); } }
    }else{
      flash(p.tx,p.ty,p.side,0,0);
      suppressNear(p.tx,p.ty,9.5,1.15);
      if(p.doom>=0){ const v=units[p.doom]; if(v){ v.dead=1; v.deadAt=_sprT; v.doomed=0; releaseSlot(v); } }
    }
  }
  stepStrikes(dt,dtRaw);
  stepNades(dt);
  stepCamps(dt);
  for(let i=0;i<200;i++){ const f=flashes[i]; if(f.on){ f.t+=dtRaw; if(f.t>(f.mel?260:190)) f.on=0; } }
  for(let i=0;i<40;i++){ const b=blasts[i]; if(b.on){ b.t+=dtRaw; if(b.t>620) b.on=0; } }
}

/* Shells hurt everything in the radius, scaled by distance from the centre. */
function damageNear(x,y,r,side,base){
  const r2=r*r;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.side!==side||u.dead>0||u.alt>4) continue;
    const dx=(u.x-x)*FIELD_W, dy=(u.y-y)*FIELD_D;
    const d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    hurt(i, Math.max(1,Math.round(base*(1-Math.sqrt(d2)/r))), -1, undefined, true);
  }
}

function killNear(x,y,r,side,n,firstIdx){
  const r2=r*r; let got=0;
  if(firstIdx>=0){ const v=units[firstIdx];
    if(v&&v.dead<=0){ v.dead=1; v.deadAt=_sprT; v.doomed=0; releaseSlot(v); got++; } }
  for(let i=0;i<units.length&&got<n;i++){
    const u=units[i];
    if(u.side!==side||u.dead>0||u.doomed||i===firstIdx) continue;
    const dx=(u.x-x)*FIELD_W, dy=(u.y-y)*FIELD_D;
    if(dx*dx+dy*dy>r2) continue;
    u.dead=1; u.deadAt=_sprT; releaseSlot(u); got++;
  }
}

/* Server decided this side lost somebody. Client stages it. */
function dropUnit(side,n){
  const front=CL.front;
  let best=-1,bd=9;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.side!==side||u.dead>0||u.doomed) continue;
    const d=Math.abs(u.y-front);
    if(d<bd){bd=d;best=i;}
  }
  if(best<0) return;
  const victim=units[best];

  if(side===1){
    for(let i=0;i<units.length;i++){
      const u=units[i];
      if(MELEE_CLS[u.cls]&&u.mel===best&&u.dead<=0){
        victim.dead=1; victim.deadAt=_sprT; releaseSlot(victim); u.mel=-1;
        flash(victim.x,victim.y,-1,1,0); return;
      }
    }
  }
  /* a multi-kill against the brood gets routed through armour so the blast
     does the work; a single kill goes to whoever is nearest */
  const wantTank = side===-1 && n>1;
  let sh=-1,sd=9;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.side===side||u.dead>0||MELEE_CLS[u.cls]) continue;
    if(wantTank&&u.cls!=='tank') continue;
    const d=Math.abs(u.x-victim.x)+Math.abs(u.y-victim.y)*0.6;
    if(d<sd){sd=d;sh=i;}
  }
  if(sh<0&&wantTank){
    for(let i=0;i<units.length;i++){
      const u=units[i];
      if(u.side===side||u.dead>0||MELEE_CLS[u.cls]) continue;
      const d=Math.abs(u.x-victim.x)+Math.abs(u.y-victim.y)*0.6;
      if(d<sd){sd=d;sh=i;}
    }
  }
  if(sh<0){ victim.dead=1; victim.deadAt=_sprT; releaseSlot(victim); return; }
  victim.doomed=1;
  const shooter=units[sh], hv=shooter.cls==='tank';
  fire(shooter,victim.x,victim.y,best,hv,hv?(n||1):0,undefined,0,victim.alt);
}

/* ── grenades ────────────────────────────────────────────────────────────
   A rifleman throws when the ground in front of him is CROWDED, not on a
   timer. That is what makes it read as a decision rather than an effect: you
   see one go out because a knot of rushers formed, and you see the knot come
   apart. The pack ships the throw, the arc, the landing and the burst, so all
   four are used rather than only the explosion.

   Damage goes through damageNear, the same call an airstrike uses, so a
   grenade cannot invent a kill rule of its own. */
const NADE_MAX=40, NADE_R=0.045, NADE_DMG=5;
const NADES=new Array(NADE_MAX);
for(let i=0;i<NADE_MAX;i++) NADES[i]={on:0,x:0,y:0,tx:0,ty:0,t:0,dur:0,land:0};
let nadeHead=0;
function throwNade(u,tx,ty){
  const g=NADES[nadeHead]; nadeHead=(nadeHead+1)%NADE_MAX;
  g.on=1; g.x=u.x; g.y=u.y; g.tx=tx; g.ty=ty;
  g.t=0; g.dur=900+Math.hypot(tx-u.x,ty-u.y)*1400; g.land=0;
}
function stepNades(dt){
  for(let i=0;i<NADE_MAX;i++){
    const g=NADES[i]; if(!g.on) continue;
    g.t+=dt;
    if(g.land>0){ g.land-=dt; if(g.land<=0) g.on=0; continue; }
    if(g.t>=g.dur){
      g.land=520;
      blast(g.tx,g.ty,BLAST*0.7);
      damageNear(g.tx,g.ty,NADE_R,-1,NADE_DMG);
    }
  }
}
/* How crowded is it in front of this man? A full scan per rifleman per frame
   is a nested loop over the whole field, so this samples.

   IT SAMPLED WITH RANDOM PICKS AND THEREFORE NEVER FIRED. Twenty-six random
   draws out of seven hundred units, needing four of them to land in a box that
   holds a few percent of the field, clears the bar under one percent of the
   time: a rifleman would have thrown roughly once every hundred probes, which
   at one probe every couple of seconds is once an hour. The mechanic existed
   and was invisible.

   A STRIDE INSTEAD OF A DICE ROLL. Walking the array with a fixed step from a
   rotating offset covers the whole field evenly over a handful of frames for
   the same cost, and cannot get unlucky. */
let _nadeScan=0;
function nadeTarget(u){
  let bx=0,by=0,n=0;
  const L=units.length, step=5;
  _nadeScan=(_nadeScan+7)%step;
  for(let k=_nadeScan;k<L;k+=step){
    const v=units[k];
    if(!v||v.dead>0||v.side===u.side) continue;
    if(Math.abs(v.x-u.x)>0.13) continue;
    const dy=u.y-v.y;
    if(dy<0.02||dy>0.24) continue;
    bx+=v.x; by+=v.y; n++;
    if(n>=8) break;
  }
  return n>=3 ? [bx/n,by/n,n] : null;
}

/* ── Coalition sprites ───────────────────────────────────────────────────
   The Coalition ground line is drawn from the pixel pack; tanks, gunships and
   every Khai'sultull unit stay wireframe.

   THE PACK IS SINGLE FACING and this renderer has a moving camera, so the two
   have to be reconciled rather than wished away. Two things do it.

   First, HORIZONTAL FLIP. A profile sprite is correct from either flank, so
   the unit's forward vector is taken into view space and the sprite is mirrored
   when that vector points left of screen. That buys two of the eight rotations
   a sprite of this kind would normally ship.

   Second, THE CAMERA IS KEPT OFF THE AXIS. The remaining six rotations are the
   ones where you are looking up or down the line of advance, and there is no
   art for them: a man walking away from you would still be drawn in profile.
   So cinematic no longer picks a yaw at random, it picks a flank. That is a
   real constraint on the camera and it is also how you would shoot a line of
   infantry on purpose, which is why it costs nothing to look at.

   IF THE SHEETS ARE NOT LOADED, EVERY UNIT FALLS BACK TO WIREFRAME. This file
   loads independently of coalition-sprites.js and must not draw an empty field
   because an image was slow.

   SPRITES ARE OPAQUE, so unlike the stroked wireframes they cannot be batched
   and must be painted back to front. They are collected with their depth and
   sorted once per frame. */
const SPRITE_CLS={inf:'assault',enf:'enforcer',eng:'engineer',turret:'turret',tank:'hound'};
/* Kept for the muster strip and for anything still measuring a man. The
   battlefield takes its anchor and its pixel density from the SHEET now, via
   FMTroops.geom, because a tank's track footprint is not a rifleman's feet and
   the Hound is drawn at a finer pitch than the troop pack. */
const SPR_ANCHOR_X=17, SPR_ANCHOR_Y=47, SPR_MAN_PX=32, SPR_MAN_WORLD=2.0;
const _sprites=[];
let _sprWarn=0;

function sprAnim(u){
  /* WHICH SHEET PACK A UNIT DRAWS FROM IS ITS FACTION'S QUESTION, AND THIS ASKED
     ITS SIDE'S. Third time this exact mistake has surfaced, and the first two
     fixes went to the class table and the sprite GATE while this - the thing
     that actually names the animation - was left asking `u.side === -1`.

     The consequence is the whole of "humans versus humans loads wireframes". Put
     a polity on the away line and every one of its soldiers arrives here with
     cls 'inf', 'enf' or 'eng', gets routed into broodAnim because of its SIDE,
     finds no BROOD_SPRITE entry for a rifleman, and returns null. queueSprite
     then reports failure and the unit drops to the wireframe path - where the
     draw switch has only a Coalition and a Jade variant, so a Void rifleman
     draws in Coalition blue as well. Both halves of the screenshot, one line.

     A brood unit with no creature entry - the spitter - still falls through and
     stays a wireframe, which is the intended outcome and not a gap. */
  if(isBroodFac(u.fac)){ const b=broodAnim(u); return b; }
  const c=SPRITE_CLS[u.cls];
  /* THE HOUND HAS TWO SHEETS AND NO DEATH ANIMATION. A tank that dies keeps its
     last firing frame rather than reaching for a sheet that does not exist,
     because sprAnim naming a missing animation puts the unit on neither the
     sprite path nor the wireframe one and it disappears off the field. The
     wreck is handled where every other dead unit is. */
  /* THE FIRING SHEET RUNS ON ITS OWN CLOCK, NOT ON u.fire. u.fire is a recoil
     term that decays over about a hundred milliseconds, while hound_fire is
     twenty frames at 55ms - eleven hundred milliseconds of muzzle flash and
     clearing smoke. So the sheet was cut off after the first two frames and the
     tank appeared to snap back to walking mid-flash, which at one shot every ten
     seconds meant the firing animation was effectively never seen at all.

     Driven off fireAt, which is the stamp the frame picker already uses. */
  if(c==='hound'){
    const since = _sprT - (u.fireAt || -1e9);
    return (since < HOUND_FIRE_MS || u.dead>0) ? 'hound_fire' : 'hound_walk';
  }
  if(c==='turret')
    return u.dead>0 ? 'turret_death'
         : u.deploy>0 ? 'turret_deploy'
         : u.hitT>0 ? 'turret_hitted'
         : (u.fire>0 ? 'turret_auto_shooting' : 'turret_idle');
  const shield = c==='enforcer' ? '_shielded' : '';
  if(u.dead>0) return c==='enforcer' ? 'enforcer_death' : c+'_death';
  /* A hit registers for a beat. The pack ships it, it is one of the few things
     that makes a line look like it is taking casualties rather than quietly
     deleting men, and nothing was using it. */
  if(u.hitT>0) return c==='enforcer' ? 'enforcer_shielded_hitted' : c+'_hitted';
  if(c==='engineer' && u.place>0) return 'engineer_placing_turret';
  if(u.nadeT>0) return c==='assault' ? 'assault_grenade_throw' : c+'_auto_shooting';
  if(u.fire>0) return c==='enforcer' ? 'enforcer_shielded_shot'
             : c+'_auto_shooting';
  /* Bash only at CONTACT. u.mel is set the moment a rusher is picked out,
     which can be a third of the field away, so keying the animation on it
     alone had shield troopers swinging at nothing the whole way in. */
  if(u.mel>=0 && u.st===S_HOLD && c==='enforcer') return 'enforcer_bash';
  /* MOVING beats everything below. A crouch is a thing you do while still. */
  const moving = (u.mv||0) > 0.000018;
  if(!moving && (u.st===S_SUPP || u.sup>900))
    return c==='enforcer' ? 'enforcer_shielded_sit_prepare' : c+'_sit_prepare';
  if(moving) return c==='enforcer' ? 'enforcer_shielded_walk' : c+'_walk';
  return c==='enforcer' ? 'enforcer_shielded_idle' : c+'_idle';
}
/* A death plays once and holds its last frame. Looping it would have the dead
   standing back up every second. */
function sprFrame(u,anim,T){
  const n=(window.FMTroops&&window.FMTroops.FRAMES[anim])||1;
  if(u.dead>0){
    const k=Math.floor((T-(u.deadAt||T))/110);
    return Math.min(n-1,Math.max(0,k));
  }
  /* THE OFFSET MUST BE CONSTANT. This used u.ph, which reads like a per-unit
     phase and is not one: u.ph is ADVANCED every step to drive the idle bob and
     the rotor spin. Feeding it into the frame index meant the index was pushed
     by a term that moves on its own, so a five frame per second idle actually
     cycled at about twenty-seven, unevenly. Every stationary soldier was
     flickering through his idle loop several times a second. That is the
     stutter.

     u.i is the unit's index in the array: fixed for its whole life and
     different for every unit, which is all a phase offset has to be. */
  /* THE FIRING SHEET IS A ONE-SHOT, NOT A LOOP. hound_fire is a muzzle flash and
     twenty frames of smoke clearing; run as a free-running cycle it re-fires
     three times a second and the tank is a strobe. It is driven off the time
     since the shot instead, and it holds the last frame once the smoke is gone
     rather than wrapping back to the flash. */
  if(anim === 'hound_fire'){
    const since = T - (u.fireAt || T);
    return Math.min(n - 1, Math.max(0, Math.floor(since / 55)));
  }
  /* Brood strikes are one-shots off their own timers for the same reason the
     Hound's gun is: a strike run as a free cycle re-triggers several times a
     second and reads as a twitch rather than as a blow landing. */
  if(anim.indexOf('splat') === 0){
    const since = T - (u.deadAt || T);
    return Math.min(n-1, Math.max(0, Math.floor(since / 70)));
  }
  if(anim.indexOf('_attack') >= 0){
    const since = anim.indexOf('horror') === 0
      ? (BROOD_ATK_MS - Math.max(0, u.melT||0))
      : (BROOD_ATK_MS - Math.max(0, u.atkT||0));
    return Math.min(n-1, Math.max(0, Math.floor(since / (BROOD_ATK_MS/n))));
  }
  const fps = ((u.mv||0) > 0.000018) ? 9 : (u.fire>0 ? 12 : 5);
  return Math.floor(T*0.001*fps + (u.i||0)*0.37);
}
var _animSeen=Object.create(null);
function queueSprite(u){
  const T=window.FMTroops;
  if(!T) return false;
  const anim=sprAnim(u);
  if(!anim || !T.FRAMES[anim]) return false;
  /* CLAIM ONLY WHAT CAN ACTUALLY BE PAINTED. drawFrame reports failure after
     the fact, and by then the unit has been taken off the wireframe path: it
     is drawn as neither and disappears from the field. Ask first, and let the
     wireframe have it until the sheet is decoded. */
  if(!T.ready(anim)){ T.sheet(anim); return false; }
  const gx=wx(u.x), gz=wz(u.y);
  toView(gx,0,gz,_p3);
  if(_p3[2]<NEAR) return true;                 // behind camera: drawn nowhere, correctly
  const sx=W*0.5+_p3[0]/_p3[2]*focal, sy=H*0.5-_p3[1]/_p3[2]*focal;
  /* SCALE COMES OFF THE SHEET, not off a constant sized for a rifleman. g.unit
     is that sheet's pixels per world unit: 16 for the troop pack, 20 for the
     Hound, which is drawn finer. Forcing one figure on both makes whichever
     lost the argument permanently the wrong size, and a tank the size of a man
     is the more embarrassing of the two ways to get it wrong. */
  const g=T.geom(anim);
  const scale=focal/(_p3[2]*g.unit);
  /* Lowered from 3. The cutoff is a SCREEN size and that is right, but it was
     tuned against troop sheets whose cell is 64px tall; a brood cell is 12 to 48,
     so the same threshold retired a creature at a third of the distance it
     retired a rifleman. Two pixels is where a sprite stops carrying more than a
     wireframe does, and with the densities fixed above almost nothing reaches it
     inside the field. */
  if(scale*g.ch<2) return false;               // too small to read: let wireframe do it
  /* Mirror when the unit's own forward vector points left of screen - AGAINST
     THE WAY THE SHEET IS DRAWN. This asked only "does he face left" and mirrored
     if so, which is right for art drawn facing right and exactly wrong for art
     drawn facing left. The Hound is drawn facing left, so every tank on the
     field was reversed: driving forward and shooting over its own engine deck.
     A tank is near enough symmetrical at field size that it read as fine. */
  toView(gx+Math.sin(u.hdg)*4,0,gz+Math.cos(u.hdg)*4,_pf);
  const fx=(W*0.5+_pf[0]/Math.max(NEAR,_pf[2])*focal)-sx;
  const flip = g.faceLeft ? (fx>0) : (fx<0);
  _animSeen[anim]=(_animSeen[anim]||0)+1;
  _sprites.push({z:_p3[2],a:anim,f:sprFrame(u,anim,_sprT),x:sx,y:sy,s:scale,flip:flip,
                 fc:facOf(u),sk:skinOf(u),kt:kitOf(u)});
  return true;
}
const _pf=[0,0,0];
let _sprT=0;
/* The grenade in flight, its landing and its burst. Queued into the same
   sorted list as the soldiers so a grenade behind a man is behind him. */
function queueNades(){
  const T=window.FMTroops;
  if(!T) return;
  for(let i=0;i<NADE_MAX;i++){
    const g=NADES[i]; if(!g.on) continue;
    let anim, fr;
    if(g.land>0){ anim='grenade_explosion'; fr=Math.floor((520-g.land)/70); }
    else{
      const k=Math.min(1,g.t/g.dur);
      anim = k>0.94 ? 'grenade_landing' : 'grenade_flying';
      fr=Math.floor(g.t/90);
    }
    if(!T.FRAMES[anim]||!T.ready(anim)){ T.sheet(anim); continue; }
    const k=Math.min(1,g.t/g.dur);
    const px=g.x+(g.tx-g.x)*k, py=g.y+(g.ty-g.y)*k;
    const arc=g.land>0?0:Math.sin(k*Math.PI)*9;
    toView(wx(px),arc,wz(py),_p3);
    if(_p3[2]<NEAR) continue;
    const sc=(SPR_MAN_WORLD*focal/_p3[2])/SPR_MAN_PX;
    if(sc*64<3) continue;
    _sprites.push({z:_p3[2],a:anim,f:fr,
      x:W*0.5+_p3[0]/_p3[2]*focal, y:H*0.5-_p3[1]/_p3[2]*focal,
      s:sc,flip:false});
  }
}

/* Feature SIDES go into the sprite queue, which is the only depth-sorted list
   this renderer has. That is what buys back occlusion: the thing that actually
   hides a man standing behind a ridge is the ridge's near face, and here that
   face is a quad which sorts against him and paints over him.

   WHAT THIS DOES NOT COVER, stated plainly rather than discovered later: the
   wireframe units are drawn in three batched depth BANDS, not painter-sorted,
   because batching is what keeps a four hundred unit field at twelve stroke
   calls. So a tank or a brood rusher behind a ridge still draws over it. The
   infantry are the numerous ones and the ones that get lost behind cover, so
   this is most of the value for none of the rewrite; the rest waits until the
   unit pipeline is worth unbatching. */
/* The clutches, queued with everything else so an egg behind a rock is behind
   it. Idle only: the hatch animation exists and is deliberately not used here,
   because a mound that hatches on a loop is a mound perpetually about to do
   something. When a wave actually spawns off a node it will have a moment to
   play, and that is the moment it is for. */
function queueEggs(){
  const T=window.FMTroops;
  if(!T || !T.FRAMES['egg_l_idle']) return;
  if(!T.ready('egg_l_idle')){ T.sheet('egg_l_idle'); return; }
  const g=T.geom('egg_l_idle');
  for(let m=0;m<mounds.length;m++){
    const md=mounds[m];
    if(!md.eggs) continue;
    const X=wx(md.x), Z=wz(md.y), R=md.r;
    for(let k=0;k<md.eggs.length;k++){
      const e=md.eggs[k];
      if(!project(X+e.dx*R, 0, Z+e.dz*R, _p3e)) continue;
      const scale=focal/(_p3e[2]*g.unit)*e.sc;
      if(scale*g.ch<2) continue;
      /* Counted, like everything else. _animSeen is incremented inside
         queueSprite, so anything that pushes into _sprites directly is invisible
         to the bench's animations-seen readout - which is the panel I actually
         use to tell whether art is live. A readout that silently under-reports
         is worse than none: it says "not drawing" about something that is. */
      _animSeen['egg_l_idle'] = (_animSeen['egg_l_idle']||0) + 1;
      _sprites.push({ z:_p3e[2], a:'egg_l_idle',
        f:Math.floor(_sprT*0.001*4)+e.ph, x:_p3e[0], y:_p3e[1],
        s:scale, flip:false, fc:'khai' });
    }
  }
}
const _p3e=[0,0,0], _p3r=[0,0,0];

/* One brood round, queued as a sprite. Returns false when the sheet is not up
   yet so the caller can fall back to the wireframe claw rather than drawing
   nothing, which is the difference between "the art is still loading" and "the
   brood stopped shooting". */
function queueBroodRound(p, X, Y, Z){
  const T=window.FMTroops;
  const key = p.heavy ? 'proj_l__' : 'proj_s__';
  if(!T || !T.FRAMES[key]) return false;
  if(!T.ready(key)){ T.sheet(key); return false; }
  if(!project(X, Y, Z, _p3r)) return true;      // behind camera: correctly nowhere
  const g=T.geom(key);
  const scale=focal/(_p3r[2]*g.unit);
  if(scale*g.ch<1.2) return false;              // too small to read: claw is cheaper
  _animSeen[key]=(_animSeen[key]||0)+1;
  _sprites.push({ z:_p3r[2], a:key, f:Math.floor(p.t*0.06), x:_p3r[0], y:_p3r[1],
                  s:scale, flip:false, fc:'khai' });
  return true;
}

function queueSides(){
  if(!SOLID) return;
  /* MESH FIRST, PRISM ONLY IF THE MESH DECLINED. A feature whose kind has no
     mesh entry, or whose mesh has not finished loading, still gets its extruded
     body: the alternative is a hole in the cover where a ridge should be, and a
     hole in cover is worse than a brick loaf. Craters and chasms never had a
     body and still do not; they are drawn by sinkPasses. */
  for(let i=0;i<terrain.length;i++){
    const f = terrain[i];
    if(f.kind === 'hive' || f.ht <= 0.2) continue;
    if(!pushMesh(f, _sprites)) pushSides(f, _sprites);
  }
  queueFlora(_sprites);
}

function drawSprites(){
  queueNades();
  queueEggs();
  queueSides();
  if(!_sprites.length) return;
  _sprites.sort((a,b)=>b.z-a.z);               // back to front
  ctx.imageSmoothingEnabled=false;
  for(let i=0;i<_sprites.length;i++){
    const q=_sprites[i];
    if(q.kind==='side'){ paintSide(q); continue; }
    if(q.kind==='face'){ paintFace(q); continue; }
    /* ONE CALL, AND THE MIRROR LIVES IN THE SHEET LAYER NOW. This used to
       translate by the CELL WIDTH and flip the context, which is correct only
       while every figure is centred in an 80px cell. The Hound is not centred in
       either of its cells and is not centred in the SAME PLACE in the two of
       them, so mirroring about the cell slid the tank sideways whenever it
       turned around, by a different amount walking than firing. drawAnchored
       mirrors about the sheet's own ground contact point, which is the only
       point that has to stay still. */
    window.FMTroops.drawAnchored(ctx,q.a,q.f,q.x,q.y,q.s,q.fc,q.flip,q.sk,q.kt);
  }
  ctx.imageSmoothingEnabled=true;
  _sprites.length=0;
}

/* ── 3D geometry ───────────────────────────────────────────────────────
   Geometry is authored in local space with +z forward, then rotated by the
   unit's heading. Previously every model was oriented by side alone, so a
   rifleman engaging a target forty metres to his flank still pointed his
   weapon straight down the field. */
let _hc=1,_hs=0,_ox=0,_oz=0;
function setPose(X,Z,h){ _hc=Math.cos(h); _hs=Math.sin(h); _ox=X; _oz=Z; }
function rseg(p,ax,ay,az,bx,by,bz){
  seg(p, _ox+ax*_hc+az*_hs, ay, _oz-ax*_hs+az*_hc,
         _ox+bx*_hc+bz*_hs, by, _oz-bx*_hs+bz*_hc);
}
/* Screen-space projection of a single point. Returns null when
   the point is behind the near plane. */
const _p3=[0,0,0];
function projPoint(x,y,z){
  toView(x,y,z,_p3);
  if(_p3[2]<NEAR) return null;
  return [W*0.5+_p3[0]/_p3[2]*focal, H*0.5-_p3[1]/_p3[2]*focal, _p3[2]];
}
/* Same thing without the allocation. projPoint returns a fresh array, which is
   fine at a few dozen calls a frame and is not fine for solid terrain: thirty
   four features is roughly eight hundred vertex projections per frame, and a
   short-lived array each is a garbage pause you can see as a hitch on an
   orbiting camera. Writes into the caller's buffer and returns a boolean. */
function project(x,y,z,o){
  toView(x,y,z,_p3);
  if(_p3[2]<NEAR) return false;
  o[0]=W*0.5+_p3[0]/_p3[2]*focal;
  o[1]=H*0.5-_p3[1]/_p3[2]*focal;
  o[2]=_p3[2];
  return true;
}

/* ── Coalition infantry ──────────────────────────────────────────────────
   Was seven segments: a spine, two arms off the head, two legs off the
   ankles, a rifle floating at shoulder height and a stub for a skull. It
   read as a stick figure because it was one, and at a cine camera's closest
   pass that is what the audience is looking at.

   THE COST IS PAID ONLY WHERE IT SHOWS. The draw loop already sorts every
   unit into one of three depth bands to fade the far ones, and that band is
   computed from view-space z before any geometry is authored. So it is
   handed to the model function as a level of detail tier for free: the near
   band gets the articulated soldier, the middle band a reduced one, and the
   far band keeps the original stick, because at two hundred metres a knee
   joint is one pixel of nothing.

   PROPORTIONS ARE FRACTIONS OF h, not absolute offsets, so the crouch under
   suppression scales the whole figure instead of shortening the spine and
   leaving the arms hanging where they were. */
function gInf(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const low=(u.st===S_SUPP||u.sup>900)?0.45:1;
  const h=2.0*low, rec=u.fire>0?0.35*u.fire:0;

  if(lod>=2){                                   // far: unchanged silhouette
    rseg(p,0,0,0, 0,h,0);
    rseg(p,0,h,0, -0.5,h*0.55,0.4);
    rseg(p,0,h,0,  0.5,h*0.55,0.4);
    rseg(p,0,0,0, -0.6,0,-0.5);
    rseg(p,0,0,0,  0.6,0,-0.5);
    rseg(p,0.4,h*0.8,-rec, 0.4,h*0.8,2.1-rec);
    rseg(p,0,h,0, 0,h+0.55,0);
    return;
  }

  const HIP=h*0.47, CH=h*0.74, SH=h*0.81, NK=h*0.86, HD=h*0.94;
  /* Stride only while actually bounding. A line of men jogging on the spot
     in cover is worse than no walk cycle at all. */
  const mv=(u.st===S_BOUND)?1:0;
  const gait=Math.sin(u.ph*5.5)*mv, gait2=Math.cos(u.ph*5.5)*mv;

  rseg(p,-0.20,HIP,0,  0.20,HIP,0);                       // pelvis
  rseg(p,-0.20,HIP,0, -0.24,HIP*0.5, gait*0.34);          // left thigh
  rseg(p,-0.24,HIP*0.5,gait*0.34, -0.26,0, gait*0.55);    // left shin
  rseg(p, 0.20,HIP,0,  0.24,HIP*0.5,-gait*0.34);          // right thigh
  rseg(p, 0.24,HIP*0.5,-gait*0.34, 0.26,0,-gait*0.55);    // right shin

  rseg(p,0,HIP,0, 0,CH,0.04);                             // spine
  rseg(p,0,CH,0.04, 0,SH,0);
  rseg(p,-0.40,SH,0, 0.40,SH,0);                          // shoulder line
  rseg(p,-0.40,SH,0, -0.20,HIP,0);                        // torso sides
  rseg(p, 0.40,SH,0,  0.20,HIP,0);

  if(lod===0){
    rseg(p,-0.28,CH,0.17, 0.28,CH,0.17);                  // chest plate
    rseg(p,-0.28,CH,0.17, -0.36,SH,0.02);
    rseg(p, 0.28,CH,0.17,  0.36,SH,0.02);
    rseg(p,-0.26,SH*0.98,-0.20, 0.26,SH*0.98,-0.20);      // pack, back face
    rseg(p,-0.26,SH*0.98,-0.20, -0.24,HIP*1.18,-0.16);
    rseg(p, 0.26,SH*0.98,-0.20,  0.24,HIP*1.18,-0.16);
  }

  rseg(p,0,SH,0, 0,NK,0);                                 // neck
  rseg(p,-0.19,HD,0.06,  0.19,HD,0.06);                   // helmet ring
  rseg(p, 0.19,HD,0.06,  0,HD,-0.20);
  rseg(p, 0,HD,-0.20,   -0.19,HD,0.06);
  rseg(p,0,NK,0, 0,HD+h*0.06,-0.03);                      // crown
  if(lod===0) rseg(p,-0.19,HD,0.06, 0.19,HD,0.06+0.10);   // brim

  /* Rifle shouldered and actually held: butt into the shoulder pocket, both
     hands on it, muzzle where the tracer leaves from. */
  const gz=0.30-rec, mz=1.95-rec, sz=-0.50-rec;
  rseg(p, 0.15,CH+0.06,sz,  0.15,CH+0.06,gz);             // stock to grip
  rseg(p, 0.15,CH+0.06,gz,  0.14,CH+0.08,mz);             // receiver + barrel
  rseg(p, 0.34,SH,0, 0.24,CH-0.02,gz*0.6);                // right upper arm
  rseg(p, 0.24,CH-0.02,gz*0.6, 0.16,CH+0.04,gz);          // forearm to grip
  rseg(p,-0.34,SH,0, -0.06,CH-0.06,0.55);                 // left upper arm
  rseg(p,-0.06,CH-0.06,0.55, 0.12,CH+0.04,1.15-rec);      // forearm to handguard
  if(lod===0){
    rseg(p,0.15,CH+0.04,gz+0.10, 0.16,CH-0.26,gz+0.02);   // magazine
    rseg(p,0.14,CH+0.08,1.45-rec, 0.14,CH+0.20,1.45-rec); // front sight
    rseg(p,0.15,CH+0.08,sz+0.06, 0.16,CH-0.10,sz+0.14);   // butt plate
  }
}
/* ── Coalition armour ────────────────────────────────────────────────────
   It was a box with a smaller box on it and a line for a gun: twenty-four
   segments, and from any angle except dead side-on it read as a crate. Armour
   is the one Coalition unit that is genuinely large on screen and there are
   only ever a dozen or so of them, so detail here is close to free and the
   payoff is that a tank looks like a tank at the range the cine camera picks.

   Built as a real hull: a sloped glacis, sponsons over the tracks, running
   gear with road wheels between a drive sprocket and an idler, a turret with a
   mantlet the gun actually passes through, a cupola, stowage and an exhaust.
   The barrel recoils into the mantlet rather than sliding through open air. */
function gTank(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const w=2.6, l=4.6, hh=1.5;
  const rec=u.fire>0?0.9*u.fire:0;
  const tw=1.55, tl=2.05, th=hh+1.15;

  if(lod>=2){                                    // far: the old cheap crate
    rseg(p,-w,0,-l,  w,0,-l); rseg(p, w,0,-l,  w,0, l);
    rseg(p, w,0, l, -w,0, l); rseg(p,-w,0, l, -w,0,-l);
    rseg(p,-w,hh,-l,  w,hh,-l); rseg(p, w,hh,-l,  w,hh, l);
    rseg(p, w,hh, l, -w,hh, l); rseg(p,-w,hh, l, -w,hh,-l);
    rseg(p,-w,0,-l,-w,hh,-l); rseg(p, w,0,-l, w,hh,-l);
    rseg(p, w,0, l, w,hh, l); rseg(p,-w,0, l,-w,hh, l);
    rseg(p,-tw,hh,-tl,  tw,hh,-tl); rseg(p, tw,hh,-tl,  tw,hh, tl);
    rseg(p, tw,hh, tl, -tw,hh, tl); rseg(p,-tw,hh, tl, -tw,hh,-tl);
    rseg(p,0,th-0.3,tl*0.6-rec, 0,th-0.3,tl*0.6+6.2-rec);
    return;
  }

  /* Lower hull, with the front plate raked back the way a glacis is. */
  const gz=l*0.72;                                // where the glacis meets the deck
  rseg(p,-w,0,-l,  w,0,-l); rseg(p, w,0,-l,  w,0, l);
  rseg(p, w,0, l, -w,0, l); rseg(p,-w,0, l, -w,0,-l);
  rseg(p,-w,hh,-l,  w,hh,-l);
  rseg(p,-w,hh,-l, -w,hh, gz); rseg(p, w,hh,-l,  w,hh, gz);
  rseg(p,-w,hh, gz,  w,hh, gz);                   // deck lip
  rseg(p,-w,hh, gz, -w*0.86,0.30, l);             // glacis
  rseg(p, w,hh, gz,  w*0.86,0.30, l);
  rseg(p,-w*0.86,0.30,l, w*0.86,0.30,l);
  rseg(p,-w,0,-l,-w,hh,-l); rseg(p, w,0,-l, w,hh,-l);
  rseg(p,-w,0, l,-w*0.86,0.30,l); rseg(p, w,0, l, w*0.86,0.30,l);

  /* Running gear. A drive sprocket aft, an idler forward and road wheels
     between them, with the track line resting on top of the lot. */
  const RW=[-l*0.62,-l*0.30,0,l*0.30,l*0.62];
  for(const side of [-1,1]){
    const sx=side*(w+0.16);
    rseg(p,sx,0.95,-l,  sx,0.95, l);              // track top run
    rseg(p,sx,0.10,-l*0.86, sx,0.10, l*0.86);     // ground run
    rseg(p,sx,0.95,-l, sx,0.10,-l*0.86);          // rear wrap
    rseg(p,sx,0.95, l, sx,0.10, l*0.86);          // front wrap
    if(lod===0){
      for(const rz of RW){                        // road wheels, as small rings
        rseg(p,sx,0.62,rz-0.34, sx,0.62,rz+0.34);
        rseg(p,sx,0.20,rz-0.34, sx,0.20,rz+0.34);
        rseg(p,sx,0.62,rz-0.34, sx,0.20,rz-0.34);
        rseg(p,sx,0.62,rz+0.34, sx,0.20,rz+0.34);
      }
      rseg(p,sx,0.30,-l*0.90, sx,0.86,-l*0.90);   // sprocket
      rseg(p,sx,0.30, l*0.90, sx,0.86, l*0.90);   // idler
    }
    rseg(p,side*w,hh,-l*0.55, sx,0.98,-l*0.55);   // sponson brackets
    rseg(p,side*w,hh, l*0.20, sx,0.98, l*0.20);
  }

  /* Turret: six sided, so it is not a second crate, with a mantlet face. */
  const T=[[-tw,-tl],[-tw*0.72,tl*0.86],[tw*0.72,tl*0.86],[tw,-tl]];
  for(let i=0;i<T.length-1;i++){
    rseg(p,T[i][0],hh,T[i][1],   T[i+1][0],hh,T[i+1][1]);
    rseg(p,T[i][0],th,T[i][1]*0.82, T[i+1][0],th,T[i+1][1]*0.82);
    rseg(p,T[i][0],hh,T[i][1],   T[i][0]*0.86,th,T[i][1]*0.82);
  }
  rseg(p,T[0][0],hh,T[0][1], T[3][0],hh,T[3][1]);
  rseg(p,T[0][0]*0.86,th,T[0][1]*0.82, T[3][0]*0.86,th,T[3][1]*0.82);
  rseg(p,T[3][0],hh,T[3][1], T[3][0]*0.86,th,T[3][1]*0.82);

  /* Mantlet, and the gun through it. The recoil moves the barrel, not the
     mantlet, which is what stops it reading as a sliding stick. */
  const my=th-0.35, mz=tl*0.86;
  rseg(p,-0.62,my-0.34,mz, 0.62,my-0.34,mz);
  rseg(p,-0.62,my+0.34,mz, 0.62,my+0.34,mz);
  rseg(p,-0.62,my-0.34,mz, -0.62,my+0.34,mz);
  rseg(p, 0.62,my-0.34,mz,  0.62,my+0.34,mz);
  rseg(p,0,my,mz-rec, 0,my,mz+5.9-rec);
  if(lod===0){
    rseg(p,-0.16,my,mz+5.2-rec, -0.16,my,mz+5.9-rec);   // muzzle brake
    rseg(p, 0.16,my,mz+5.2-rec,  0.16,my,mz+5.9-rec);
    rseg(p,-0.16,my,mz+5.2-rec,  0.16,my,mz+5.2-rec);
    rseg(p,-0.16,my,mz+5.9-rec,  0.16,my,mz+5.9-rec);
    /* Cupola, stowage on the bustle, exhaust on the left sponson. */
    rseg(p,-0.42,th,-0.55, 0.10,th,-0.55);
    rseg(p,-0.42,th+0.42,-0.55, 0.10,th+0.42,-0.55);
    rseg(p,-0.42,th,-0.55, -0.42,th+0.42,-0.55);
    rseg(p, 0.10,th,-0.55,  0.10,th+0.42,-0.55);
    rseg(p,-0.42,th+0.42,-0.55, -0.16,th+0.42,-0.20);
    rseg(p,-tw*0.8,th,-tl*0.92,  tw*0.8,th,-tl*0.92);   // bustle rack
    rseg(p,-tw*0.8,th-0.30,-tl*1.18, tw*0.8,th-0.30,-tl*1.18);
    rseg(p,-tw*0.8,th,-tl*0.92, -tw*0.8,th-0.30,-tl*1.18);
    rseg(p, tw*0.8,th,-tl*0.92,  tw*0.8,th-0.30,-tl*1.18);
    rseg(p,-w*0.92,hh+0.10,-l*0.60, -w*0.92,hh+0.10,-l*0.20);
    rseg(p,-w*0.92,hh+0.42,-l*0.60, -w*0.92,hh+0.42,-l*0.20);
    rseg(p, tw*0.6,th,0.2, tw*0.6,th+1.7,-0.5);         // antenna
  }
}

/* ── Emplacement, wireframe ──────────────────────────────────────────────
   The fallback an emplacement is drawn with when its sprite sheet has not
   decoded, or is missing from the server, or the figure is too small on screen
   to be worth an image.

   THIS FUNCTION WAS DELETED BY ACCIDENT IN 1.4.8.4 and the crash it caused is
   the reason the dispatch is now checked. Rebuilding the tank replaced the
   span of text from gTank to the gunship header, and this sat inside that
   span. Nothing complained: a case arm calling an undefined function is
   perfectly valid JavaScript right up until that arm runs, and this one only
   runs when a turret exists AND its sheet is unavailable. So it survived every
   check and every headless run, and then took the whole render loop down a few
   seconds into a funded battle, which is exactly when the first turret goes
   up. */
/* THE FOUR WORKS, EACH A DIFFERENT KIND OF THING AT A GLANCE. They are not
   variations on a compound: a bastion is walls, a pad is a flat strip, a cut is
   a hole in the ground with nothing above grade, and a spire is the tallest
   object on the map. Silhouette carries the identification, because there is no
   text layer on this field and adding one for four structures is not worth the
   pass. The panel names them; the field shows them apart. */
function gWork(p,k){
  const X=wx(k.x), Z=wz(k.y), R=k.r;
  const rnd=mulberry32(k.sd);
  if(k.type==='pad'){
    // A STRIP, so the long axis does the talking. Flat, wide, and the only
    // work with an airframe parked on it.
    const L=R*1.9, Wd=R*0.62;
    seg(p,X-L,0.2,Z-Wd, X+L,0.2,Z-Wd);
    seg(p,X-L,0.2,Z+Wd, X+L,0.2,Z+Wd);
    seg(p,X-L,0.2,Z-Wd, X-L,0.2,Z+Wd);
    seg(p,X+L,0.2,Z-Wd, X+L,0.2,Z+Wd);
    for(let i=-3;i<=3;i++){                       // centreline
      const cx=X+i*(L/4);
      seg(p,cx-L*0.06,0.25,Z, cx+L*0.06,0.25,Z);
    }
    seg(p,X-L*0.9,0,Z-Wd*1.5, X-L*0.9,5.2,Z-Wd*1.5);   // mast
    seg(p,X-L*0.9,5.2,Z-Wd*1.5, X-L*0.9+2.4,4.6,Z-Wd*1.5);
    const ax=X+L*0.35, az=Z;                      // parked airframe
    seg(p,ax-3.4,1.5,az, ax+3.4,1.5,az);
    seg(p,ax+3.4,1.5,az, ax+2.0,2.6,az);
    seg(p,ax-3.4,1.5,az, ax-2.2,2.6,az);
    seg(p,ax-2.2,2.6,az, ax+2.0,2.6,az);
    seg(p,ax,2.6,az, ax,4.0,az);                  // rotor mast
    for(let i=0;i<6;i++){                         // rotor disc
      const a0=i/6*6.283, a1=(i+1)/6*6.283;
      seg(p,ax+Math.cos(a0)*5,4.0,az+Math.sin(a0)*3.4,
            ax+Math.cos(a1)*5,4.0,az+Math.sin(a1)*3.4);
    }
    return;
  }
  if(k.type==='cut'){
    // DUG IN MEANS NOTHING ABOVE GRADE. The whole work is a trench line read
    // as negative space, which is why it has no tall element at all: it is the
    // one silhouette on the field defined by what is missing from it.
    let px=X-R*1.6, pz=Z-R*0.5;
    for(let i=1;i<=7;i++){
      const x=X-R*1.6+(R*3.2)*(i/7);
      const z=Z+(i%2?R*0.45:-R*0.45);
      seg(p,px,-0.9,pz, x,-0.9,z);                // trench floor
      seg(p,px,0.35,pz, x,0.35,z);                // spoil lip
      seg(p,px,-0.9,pz, px,0.35,pz);              // wall tie
      px=x; pz=z;
    }
    seg(p,px,-0.9,pz, px,0.35,pz);
    for(let t=0;t<4;t++){                         // sandbagged bays
      const bx=X-R*1.2+rnd()*R*2.4, bz=Z+(rnd()-0.5)*R*0.9;
      seg(p,bx-1.5,0.35,bz, bx+1.5,0.35,bz);
      seg(p,bx-1.5,0.9,bz,  bx+1.5,0.9,bz);
      seg(p,bx-1.5,0.35,bz, bx-1.5,0.9,bz);
      seg(p,bx+1.5,0.35,bz, bx+1.5,0.9,bz);
    }
    return;
  }
  if(k.type==='spire'){
    // THE TALLEST THING ON THE MAP, and that is the point: a relay you can see
    // from anywhere on the field is a relay that can see the field.
    const HT=22, base=R*0.42;
    const leg=[[-1,-1],[1,-1],[1,1],[-1,1]];
    for(let i=0;i<4;i++){
      const [ax,az]=leg[i];
      seg(p,X+ax*base,0,Z+az*base*0.7, X+ax*base*0.18,HT,Z+az*base*0.18*0.7);
    }
    for(let lv=1;lv<=3;lv++){                     // braced bays
      const t0=lv/4, t1=(lv-1)/4;
      const s0=base*(1-t0*0.82), s1=base*(1-t1*0.82);
      const y0=HT*t0, y1=HT*t1;
      for(let i=0;i<4;i++){
        const a=leg[i], b=leg[(i+1)%4];
        seg(p,X+a[0]*s0,y0,Z+a[1]*s0*0.7, X+b[0]*s0,y0,Z+b[1]*s0*0.7);
        seg(p,X+a[0]*s1,y1,Z+a[1]*s1*0.7, X+b[0]*s0,y0,Z+b[1]*s0*0.7);
      }
    }
    for(let i=0;i<8;i++){                         // dish
      const a0=i/8*6.283, a1=(i+1)/8*6.283, dr=3.6;
      seg(p,X+Math.cos(a0)*dr,HT+1.4+Math.sin(a0)*dr*0.5,Z+2.2,
            X+Math.cos(a1)*dr,HT+1.4+Math.sin(a1)*dr*0.5,Z+2.2);
    }
    seg(p,X,HT,Z, X,HT+1.4,Z+2.2);
    for(let i=0;i<3;i++){                         // guys
      const a=i/3*6.283;
      seg(p,X,HT*0.72,Z, X+Math.cos(a)*R*1.5,0,Z+Math.sin(a)*R*1.05);
    }
    return;
  }
  // BASTION: walls with corner towers and armour staged inside. Broad and
  // shallow as an effect, and broad and low as a shape.
  const w2=R*1.25, d2=R*0.78;
  const corner=[[-w2,-d2],[w2,-d2],[w2,d2],[-w2,d2]];
  for(let i=0;i<4;i++){
    const a=corner[i], b=corner[(i+1)%4];
    seg(p,X+a[0],1.5,Z+a[1], X+b[0],1.5,Z+b[1]);   // parapet
    seg(p,X+a[0],0,Z+a[1],   X+a[0],1.5,Z+a[1]);   // wall foot
    for(let t=1;t<4;t++){                          // revetment ties
      const tx=X+a[0]+(b[0]-a[0])*t/4, tz=Z+a[1]+(b[1]-a[1])*t/4;
      seg(p,tx,0,tz, tx,1.5,tz);
    }
  }
  for(let i=0;i<4;i++){                            // corner towers
    const a=corner[i], tw=2.0;
    seg(p,X+a[0]-tw,1.5,Z+a[1]-tw*0.7, X+a[0]-tw,5.0,Z+a[1]-tw*0.7);
    seg(p,X+a[0]+tw,1.5,Z+a[1]-tw*0.7, X+a[0]+tw,5.0,Z+a[1]-tw*0.7);
    seg(p,X+a[0]-tw,5.0,Z+a[1]-tw*0.7, X+a[0]+tw,5.0,Z+a[1]-tw*0.7);
    seg(p,X+a[0]-tw,5.0,Z+a[1]+tw*0.7, X+a[0]+tw,5.0,Z+a[1]+tw*0.7);
    seg(p,X+a[0]-tw,5.0,Z+a[1]-tw*0.7, X+a[0]-tw,5.0,Z+a[1]+tw*0.7);
    seg(p,X+a[0]+tw,5.0,Z+a[1]-tw*0.7, X+a[0]+tw,5.0,Z+a[1]+tw*0.7);
  }
  for(let h=0;h<2;h++){                            // staged hulls
    const hx=X-w2*0.42+h*w2*0.84, hz=Z+(rnd()-0.5)*d2*0.5;
    seg(p,hx-3.2,0.8,hz-1.6, hx+3.2,0.8,hz-1.6);
    seg(p,hx-3.2,0.8,hz+1.6, hx+3.2,0.8,hz+1.6);
    seg(p,hx-3.2,0.8,hz-1.6, hx-3.2,0.8,hz+1.6);
    seg(p,hx+3.2,0.8,hz-1.6, hx+3.2,0.8,hz+1.6);
    seg(p,hx-2.0,2.1,hz, hx+2.0,2.1,hz);
    seg(p,hx-3.2,0.8,hz-1.6, hx-2.0,2.1,hz);
    seg(p,hx+3.2,0.8,hz-1.6, hx+2.0,2.1,hz);
  }
}

/* A SPAWNING MOUND, WHICH IS NOT THE BROOD CAMP. gCamp already draws a low
   mound with spines for held ground, and a node needed to read as a different
   object or the feature is invisible: taller, closed, ribbed like the hive
   cities because that is the brood's architectural idiom, with one maw facing
   the Coalition end and drag trails leading out of it. A mound is the reason a
   world costs more, and it should look like a source rather than a marker. */
function gMound(p,m){
  const X=wx(m.x), Z=wz(m.y), R=m.r;
  const rnd=mulberry32(m.sd);
  const HT=R*0.95;
  const N=7;
  const skirt=[];
  for(let i=0;i<N;i++){
    const a=i/N*6.283, rr=R*(0.82+rnd()*0.30);
    skirt.push([X+Math.cos(a)*rr, Z+Math.sin(a)*rr*0.7]);
  }
  for(let i=0;i<N;i++){                            // skirt
    const a=skirt[i], b=skirt[(i+1)%N];
    seg(p,a[0],0,a[1], b[0],0,b[1]);
  }
  for(let i=0;i<N;i++){                            // ribs bowing to a closed crown
    const a=skirt[i];
    const mx=X+(a[0]-X)*0.55, mz=Z+(a[1]-Z)*0.55;
    seg(p,a[0],0,a[1], mx,HT*0.66,mz);
    seg(p,mx,HT*0.66,mz, X,HT,Z);
  }
  for(let i=0;i<N;i++){                            // banding
    const a=skirt[i], b=skirt[(i+1)%N];
    seg(p,X+(a[0]-X)*0.55,HT*0.66,Z+(a[1]-Z)*0.55,
          X+(b[0]-X)*0.55,HT*0.66,Z+(b[1]-Z)*0.55);
  }
  // The maw, facing the near end of the field, which is where they come out.
  const mw=R*0.42;
  seg(p,X-mw,0,Z+R*0.62, X-mw*0.7,HT*0.42,Z+R*0.52);
  seg(p,X+mw,0,Z+R*0.62, X+mw*0.7,HT*0.42,Z+R*0.52);
  seg(p,X-mw*0.7,HT*0.42,Z+R*0.52, X+mw*0.7,HT*0.42,Z+R*0.52);
  for(let t=0;t<3;t++){                            // drag trails toward our line
    const tx=X+(rnd()-0.5)*R*0.9;
    seg(p,tx,0.05,Z+R*0.66, tx+(rnd()-0.5)*R*0.6,0.05,Z+R*1.7);
  }
}

/* A camp, drawn as whoever currently holds it. A Coalition firebase is a
   revetment with tents and a mast; a brood camp is a mound with spines. They
   have to read as different KINDS of thing at a glance, because the point of
   the feature is telling who holds what across the depth of the field without
   anyone reading a number. */
function gCamp(p,c,own){
  const X=wx(c.x), Z=wz(c.y), R=c.r;
  const rnd=mulberry32(c.sd);
  if(own===1){
    const N=8; let px=0,pz=0;                    // octagonal berm, so it reads as built
    for(let i=0;i<=N;i++){
      const a=i/N*6.283, x=X+Math.cos(a)*R, z=Z+Math.sin(a)*R*0.7;
      if(i){ seg(p,px,0.9,pz, x,0.9,z); seg(p,px,0,pz, px,0.9,pz); }
      px=x; pz=z;
    }
    for(let t=0;t<3;t++){                        // tents
      const a=rnd()*6.283, d=R*0.45*rnd();
      const tx=X+Math.cos(a)*d, tz=Z+Math.sin(a)*d*0.7;
      seg(p,tx-1.6,0,tz-1.2, tx,2.2,tz);
      seg(p,tx+1.6,0,tz-1.2, tx,2.2,tz);
      seg(p,tx-1.6,0,tz+1.2, tx,2.2,tz);
      seg(p,tx+1.6,0,tz+1.2, tx,2.2,tz);
      seg(p,tx-1.6,0,tz-1.2, tx-1.6,0,tz+1.2);
      seg(p,tx+1.6,0,tz-1.2, tx+1.6,0,tz+1.2);
    }
    seg(p,X,0,Z-R*0.5, X,6.5,Z-R*0.5);           // mast
    seg(p,X,6.5,Z-R*0.5, X+2.2,5.7,Z-R*0.5);
  } else {
    const N=7; let px=0,pz=0;                    // mound, in the brood's idiom
    for(let i=0;i<=N;i++){
      const a=i/N*6.283, rr=R*(0.72+rnd()*0.34);
      const x=X+Math.cos(a)*rr, z=Z+Math.sin(a)*rr*0.7;
      if(i){ seg(p,px,0.5,pz, x,0.5,z); seg(p,px,0,pz, px,0.5,pz); }
      px=x; pz=z;
    }
    for(let t=0;t<5;t++){                        // spines
      const a=rnd()*6.283, d=R*0.55*rnd();
      const sx=X+Math.cos(a)*d, sz=Z+Math.sin(a)*d*0.7;
      seg(p,sx,0,sz, sx+(rnd()-0.5)*1.6, 3.0+rnd()*3.4, sz+(rnd()-0.5)*1.6);
    }
  }
}

function gTurret(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const rec=u.fire>0?0.5*u.fire:0;
  const dep=u.deploy>0?Math.min(1,1-u.deploy/900):1;   // rises as it deploys
  const h=0.95*dep;

  rseg(p,-0.95,0,-0.95, 0.95,0,-0.95);                 // baseplate
  rseg(p, 0.95,0,-0.95, 0.95,0, 0.95);
  rseg(p, 0.95,0, 0.95,-0.95,0, 0.95);
  rseg(p,-0.95,0, 0.95,-0.95,0,-0.95);
  if(lod===0){
    rseg(p,-0.95,0,-0.95, -0.55,0.18,-0.55);           // legs to the collar
    rseg(p, 0.95,0,-0.95,  0.55,0.18,-0.55);
    rseg(p, 0.95,0, 0.95,  0.55,0.18, 0.55);
    rseg(p,-0.95,0, 0.95, -0.55,0.18, 0.55);
  }
  rseg(p,-0.55,0.18,-0.55, 0.55,0.18,-0.55);
  rseg(p, 0.55,0.18,-0.55, 0.55,0.18, 0.55);
  rseg(p, 0.55,0.18, 0.55,-0.55,0.18, 0.55);
  rseg(p,-0.55,0.18, 0.55,-0.55,0.18,-0.55);

  rseg(p,0,0.18,0, 0,h,0);                             // mast
  rseg(p,-0.50,h,-0.42, 0.50,h,-0.42);                 // receiver box
  rseg(p, 0.50,h,-0.42, 0.42,h, 0.46);
  rseg(p, 0.42,h, 0.46,-0.42,h, 0.46);
  rseg(p,-0.42,h, 0.46,-0.50,h,-0.42);
  rseg(p,-0.42,h+0.44,-0.34, 0.42,h+0.44,-0.34);
  rseg(p,-0.50,h,-0.42, -0.42,h+0.44,-0.34);
  rseg(p, 0.50,h,-0.42,  0.42,h+0.44,-0.34);
  rseg(p,0,h+0.22,0.30-rec, 0,h+0.22,2.30-rec);        // barrel
  if(lod===0){
    rseg(p,-0.14,h+0.22,1.95-rec, -0.14,h+0.22,2.30-rec);
    rseg(p, 0.14,h+0.22,1.95-rec,  0.14,h+0.22,2.30-rec);
    rseg(p,-0.34,h+0.10,-0.40, -0.34,h+0.10,-1.05);    // ammo feed
    rseg(p, 0.34,h+0.10,-0.40,  0.34,h+0.10,-1.05);
    rseg(p,-0.34,h+0.10,-1.05,  0.34,h+0.10,-1.05);
  }
}

/* ── Coalition gunship ───────────────────────────────────────────────────
   STAYS WIREFRAME, and not for want of art. A gunship is the worst possible
   case for a single-facing sprite: it holds a lateral orbit and reverses at
   the field edge, so it is flying left half the time and right the other half
   while the camera orbits independently. Two facings cannot cover that. It
   also banks, and there is no banked frame in any side-view pack. The rotor
   is the other half: a still blade reads as a crashed helicopter, and a
   wireframe disc can actually turn.

   What it was: a flat quad, a boom, two skids and a two-line rotor. Twelve
   segments and no silhouette. What it is now: a nose that comes to a point, a
   faceted canopy, a chin turret that tracks with the hull, stub wings carrying
   pods, a tapering boom to a fin, a tail rotor turning on its own axis, and a
   four blade main disc with a mast and hub. */
function gHeli(p,u,lod){
  const X=wx(u.x), Z=wz(u.y), Y=u.alt;
  setPose(X,Z,u.hdg);
  const spin=u.ph*9, c=Math.cos(spin)*5.6, s2=Math.sin(spin)*5.6;

  if(lod>=2){                                    // far: readable silhouette only
    rseg(p,-1.2,Y,-2.4,  1.2,Y,-2.4);
    rseg(p, 1.2,Y,-2.4,  0.9,Y+1.0, 2.6);
    rseg(p, 0.9,Y+1.0, 2.6, -0.9,Y+1.0, 2.6);
    rseg(p,-0.9,Y+1.0, 2.6, -1.2,Y,-2.4);
    rseg(p,0,Y+0.4,-2.4, 0,Y+0.4,-8.0);
    rseg(p, c,Y+2.0, s2, -c,Y+2.0,-s2);
    rseg(p,-s2,Y+2.0, c,  s2,Y+2.0,-c);
    rseg(p,0,Y+1.0,0, 0,Y+2.0,0);
    return;
  }

  const B=Y, T=Y+1.5;                            // belly and spine
  /* Hull: a hexagonal section rather than a box, so it reads as a fuselage
     from every angle the orbit can reach instead of only from the side. */
  rseg(p,-1.15,B+0.5,-2.2,  1.15,B+0.5,-2.2);    // aft belly
  rseg(p,-1.15,B+0.5,-2.2, -1.25,B+1.1, 0.2);
  rseg(p, 1.15,B+0.5,-2.2,  1.25,B+1.1, 0.2);
  rseg(p,-1.25,B+1.1, 0.2, -0.55,B+0.75, 3.1);   // taper to the nose
  rseg(p, 1.25,B+1.1, 0.2,  0.55,B+0.75, 3.1);
  rseg(p,-0.55,B+0.75,3.1,  0.55,B+0.75,3.1);
  rseg(p,-1.15,T,-2.2,      1.15,T,-2.2);        // spine
  rseg(p,-1.15,T,-2.2, -1.25,T+0.15, 0.2);
  rseg(p, 1.15,T,-2.2,  1.25,T+0.15, 0.2);
  rseg(p,-1.25,T+0.15,0.2, -0.5,T-0.35, 3.1);    // canopy facets
  rseg(p, 1.25,T+0.15,0.2,  0.5,T-0.35, 3.1);
  rseg(p,-0.5,T-0.35,3.1,   0.5,T-0.35,3.1);
  rseg(p,-1.15,B+0.5,-2.2, -1.15,T,-2.2);        // verticals
  rseg(p, 1.15,B+0.5,-2.2,  1.15,T,-2.2);
  rseg(p,-0.55,B+0.75,3.1, -0.5,T-0.35,3.1);
  rseg(p, 0.55,B+0.75,3.1,  0.5,T-0.35,3.1);

  /* Chin turret, slung under the nose and pointed where the hull is pointed. */
  const rec=u.fire>0?0.5*u.fire:0;
  rseg(p,0,B+0.35,2.5, 0,B+0.35,3.4-rec);
  rseg(p,-0.35,B+0.55,2.5, 0.35,B+0.55,2.5);
  rseg(p,-0.35,B+0.55,2.5, 0,B+0.25,2.9);
  rseg(p, 0.35,B+0.55,2.5, 0,B+0.25,2.9);

  /* Stub wings and pods. This is the line that says gunship rather than
     transport, and it was the thing most missing. */
  rseg(p,-1.2,B+1.0,-0.5, -2.9,B+1.15,-0.7);
  rseg(p, 1.2,B+1.0,-0.5,  2.9,B+1.15,-0.7);
  if(lod===0){
    rseg(p,-2.9,B+1.15,-0.7, -2.9,B+0.75,-0.7);
    rseg(p,-2.9,B+0.75,-0.7, -2.35,B+0.75, 0.5);
    rseg(p,-2.35,B+0.75,0.5, -2.35,B+1.15, 0.5);
    rseg(p, 2.9,B+1.15,-0.7,  2.9,B+0.75,-0.7);
    rseg(p, 2.9,B+0.75,-0.7,  2.35,B+0.75, 0.5);
    rseg(p, 2.35,B+0.75,0.5,  2.35,B+1.15, 0.5);
  }

  /* Boom, tapering, to a fin and a tail rotor that turns on its own axis. */
  rseg(p,-0.55,B+1.0,-2.2, -0.28,B+1.05,-7.6);
  rseg(p, 0.55,B+1.0,-2.2,  0.28,B+1.05,-7.6);
  rseg(p,-0.55,T-0.15,-2.2, -0.28,B+1.5,-7.6);
  rseg(p, 0.55,T-0.15,-2.2,  0.28,B+1.5,-7.6);
  rseg(p,-0.28,B+1.05,-7.6,  0.28,B+1.05,-7.6);
  rseg(p, 0,B+1.5,-7.6, 0,B+3.0,-8.6);           // fin
  rseg(p, 0,B+3.0,-8.6, 0,B+1.2,-8.4);
  const tc=Math.cos(spin*1.6)*1.5, ts=Math.sin(spin*1.6)*1.5;
  rseg(p, 0.30,B+2.1+tc,-8.1+ts,  0.30,B+2.1-tc,-8.1-ts);
  if(lod===0){
    rseg(p, 0.30,B+2.1+ts,-8.1-tc, 0.30,B+2.1-ts,-8.1+tc);
    /* Horizontal stabiliser, and the shroud the tail rotor turns inside. */
    rseg(p,-1.25,B+1.35,-6.9,  1.25,B+1.35,-6.9);
    rseg(p,-1.25,B+1.35,-6.9, -0.95,B+1.35,-7.5);
    rseg(p, 1.25,B+1.35,-6.9,  0.95,B+1.35,-7.5);
    rseg(p, 0.30,B+3.5,-8.5, 0.30,B+0.9,-8.0);
  }

  /* Engine housings either side of the mast, and the exhausts they vent
     through. This is the mass that makes the machine look powered rather than
     like a cabin with a fan bolted on. */
  if(lod===0){
    for(const side of [-1,1]){
      const ex=side*0.62;
      rseg(p,ex-0.28*side,T,-1.5, ex+0.30*side,T,-1.5);
      rseg(p,ex-0.28*side,T+0.55,-1.4, ex+0.30*side,T+0.55,-1.4);
      rseg(p,ex-0.28*side,T,-1.5, ex-0.28*side,T+0.55,-1.4);
      rseg(p,ex+0.30*side,T,-1.5, ex+0.30*side,T+0.55,-1.4);
      rseg(p,ex-0.28*side,T+0.55,-1.4, ex,T+0.42,0.6);
      rseg(p,ex+0.30*side,T+0.55,-1.4, ex,T+0.42,0.6);
      rseg(p,ex,T+0.28,-1.55, ex+side*0.5,T+0.10,-2.35);   // exhaust stack
    }
    /* Sensor ball under the nose, which is what a modern gunship aims with. */
    rseg(p,-0.30,B+0.45,3.0, 0.30,B+0.45,3.0);
    rseg(p,-0.30,B+0.45,3.0, 0,B+0.05,3.15);
    rseg(p, 0.30,B+0.45,3.0, 0,B+0.05,3.15);
    rseg(p,0,B+0.05,3.15, 0,B+0.20,3.55);
  }

  /* Mast, hub and a four blade disc. The blades DROOP: a rotor at rest coning
     slightly under its own weight is most of what separates a helicopter from
     a spinning cross. */
  const dp=0.22;
  rseg(p,0,T,0, 0,T+0.95,0);
  rseg(p,-0.3,T+0.8,-0.3, 0.3,T+0.8,0.3);
  rseg(p,-0.3,T+0.8, 0.3, 0.3,T+0.8,-0.3);
  rseg(p, c,T+0.95-dp, s2, -c,T+0.95-dp,-s2);
  rseg(p,-s2,T+0.95-dp, c,  s2,T+0.95-dp,-c);
  if(lod===0){
    const d=0.7071;
    rseg(p, (c+s2)*d,T+0.95-dp,(s2-c)*d, -(c+s2)*d,T+0.95-dp,-(s2-c)*d);
    rseg(p, (c-s2)*d,T+0.95-dp,(s2+c)*d, -(c-s2)*d,T+0.95-dp,-(s2+c)*d);
    /* Blade roots angled up to the hub, so the disc is coned rather than flat. */
    rseg(p,0,T+0.95,0,  c*0.30,T+0.95-dp*0.3, s2*0.30);
    rseg(p,0,T+0.95,0, -c*0.30,T+0.95-dp*0.3,-s2*0.30);
    rseg(p,0,T+0.95,0, -s2*0.30,T+0.95-dp*0.3, c*0.30);
    rseg(p,0,T+0.95,0,  s2*0.30,T+0.95-dp*0.3,-c*0.30);
  }

  /* Skids on struts, not two floating lines. */
  rseg(p,-1.5,B-1.15,-1.5, -1.5,B-1.15,1.8);
  rseg(p, 1.5,B-1.15,-1.5,  1.5,B-1.15,1.8);
  rseg(p,-1.1,B+0.5,-1.0, -1.5,B-1.15,-1.1);
  rseg(p,-1.1,B+0.5, 1.2, -1.5,B-1.15, 1.3);
  rseg(p, 1.1,B+0.5,-1.0,  1.5,B-1.15,-1.1);
  rseg(p, 1.1,B+0.5, 1.2,  1.5,B-1.15, 1.3);
}
/* ── Brood spitter, the Censer ──────────────────────────────────
   THIS IS THE UNIT THE PLAYER ACTUALLY SEES. Rushers are three in ten and
   flyers are now under four in a hundred, so the else branch of the brood draw
   takes very nearly two thirds of that side of the field. The majority unit
   was eight segments of flat diamond on three legs, drawn identically at every
   range: the most numerous thing out there was the worst drawn thing out
   there, and the rusher rebuild made that gap wider rather than closing it.

   Built on the rusher's frame now. The blade trooper is drawn from the
   rifleman's skeleton on purpose, because they are the same soldiers with
   different kit and a shared frame is what makes a mixed line read as one army
   instead of two unrelated sprite sets. The brood had no such frame: a rusher
   was one flat diamond and a spitter was a different flat diamond, two shapes
   that happened to share a colour.

   What differs is what the thorax carries. A rusher carries scythes, a spitter
   carries a swollen abdomen and the spout that empties it. */
function gSpit(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const low=u.sup>900?0.72:1, B=1.05*low;

  if(lod>=2){
    rseg(p,0,B,1.7,      1.30,B,-0.4);
    rseg(p,1.30,B,-0.4,  0,B,-2.9);
    rseg(p,0,B,-2.9,    -1.30,B,-0.4);
    rseg(p,-1.30,B,-0.4, 0,B,1.7);
    rseg(p,0,B+0.30,-1.4, 0,B+1.55,1.1);
    rseg(p,-1.30,B,-0.4, -2.20,0,0.2);
    rseg(p, 1.30,B,-0.4,  2.20,0,0.2);
    rseg(p,0,B,-2.9,      0,0,-3.6);
    return;
  }

  broodFrame(p,u,lod,B,1.30);

  /* The head is carried low and forward, under the spout rather than in front
     of it, which is what stops the two reading as one long snout. */
  rseg(p,0,B,1.9,           0,B-0.10,2.4);
  rseg(p,0,B-0.05,2.4,     -0.38,B-0.15,2.8);
  rseg(p,-0.38,B-0.15,2.8,  0,B-0.25,3.1);
  rseg(p,0,B-0.25,3.1,      0.38,B-0.15,2.8);
  rseg(p,0.38,B-0.15,2.8,   0,B-0.05,2.4);

  /* The spout, which is the silhouette. It rides up off the swollen abdomen
     and settles slowly, so a spitter is identifiable from behind. */
  const l=Math.sin(u.ph)*0.22;
  rseg(p,0,B+0.20,-1.2,     0,B+1.30,-0.4);
  rseg(p,0,B+1.30,-0.4,     0,B+1.55,1.0+l);
  rseg(p,0,B+1.55,1.0+l,    0,B+1.32,1.8+l);
  if(lod===0){
    rseg(p,-0.22,B+1.50,0.9+l,  0.22,B+1.50,0.9+l);
    rseg(p,-0.22,B+1.50,0.9+l,  0,B+1.32,1.8+l);
    rseg(p, 0.22,B+1.50,0.9+l,  0,B+1.32,1.8+l);
  }
}
/* ── Brood rusher, the Scythe ───────────────────────────────────
   Ten segments of diamond and stick, at every distance, because it was the
   only class on the field that never took a level of detail tier. It is also
   the most numerous thing out there, so it was simultaneously the least drawn
   unit and the one seen most often.

   Built as an insect now: an abdomen and a thorax meeting at a waist, a head
   with mandibles that close when it makes contact, two scythe arms with a
   real elbow, and six legs on an alternating tripod rather than four sticks
   pointing outward.

   THE FAR TIER COSTS EXACTLY WHAT THE OLD MODEL COST, ten segments, so a
   swarm at depth is no more expensive than it was before the rebuild. Every
   segment this adds is spent inside the near band, where a handful of them
   are, and none of it is spent at two hundred units where most of them are.

   THE SWING STOPS AT THE FAR TIER. The claws used to animate off
   Math.sin(u.ph*7) regardless of distance, and at that range the amplitude
   lands under a pixel: the same fault as the cover bob that was taken out of
   the sprite path, arrived at from the other direction. A far rusher holds
   its pose. */
function gRush(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const mel=u.mel>=0, B=1.15;

  if(lod>=2){
    /* Far: a wedge with two hooks over it and four legs under it. The head is
       the point of the body rather than a part, and nothing moves. */
    rseg(p,0,B,2.0,     1.1,B,-0.2);
    rseg(p,1.1,B,-0.2,  0,B,-2.4);
    rseg(p,0,B,-2.4,   -1.1,B,-0.2);
    rseg(p,-1.1,B,-0.2, 0,B,2.0);
    rseg(p,-0.7,B,0.8, -1.2,B+1.9,2.3);
    rseg(p, 0.7,B,0.8,  1.2,B+1.9,2.3);
    rseg(p,-1.1,B,-0.2, -2.1,0,0.5);
    rseg(p, 1.1,B,-0.2,  2.1,0,0.5);
    rseg(p,-0.8,B,-1.4, -1.8,0,-1.9);
    rseg(p, 0.8,B,-1.4,  1.8,0,-1.9);
    return;
  }

  broodFrame(p,u,lod,B,1);

  /* Mandibles hang open while it is running and close when it is in contact,
     which is the only tell at a glance that a rusher has reached something. */
  const mo=mel?0.12:0.55;
  rseg(p,0,B,1.9,        0,B+0.10,2.5);
  rseg(p,0,B+0.15,2.5,  -0.45,B,2.9);
  rseg(p,-0.45,B,2.9,    0,B-0.10,3.3);
  rseg(p,0,B-0.10,3.3,   0.45,B,2.9);
  rseg(p,0.45,B,2.9,     0,B+0.15,2.5);
  rseg(p,-0.45,B,2.9,  -0.35-mo,B-0.05,3.9);
  rseg(p, 0.45,B,2.9,   0.35+mo,B-0.05,3.9);
  if(lod===0){
    rseg(p,-0.35-mo,B-0.05,3.9, -0.10-mo*0.4,B-0.05,4.3);
    rseg(p, 0.35+mo,B-0.05,3.9,  0.10+mo*0.4,B-0.05,4.3);
  }

  /* Scythe arms. The elbow is real, so the blade rotates about it and the
     edge leads. The old pair slid sideways on a sine without ever changing
     which way they pointed, the same mistake the sword had before 1.4.8.1. */
  const sw=mel?Math.sin(u.ph*7)*0.9:0.10;
  for(let s=-1;s<=1;s+=2){
    const ex=s*0.95, ez=1.6+sw*0.5;
    const tx=s*1.25+s*sw*0.6, tz=3.0+sw;
    rseg(p, s*0.55,B+0.15,1.2,  ex,B+1.05,ez);
    rseg(p, ex,B+1.05,ez,       tx,B+1.70,tz);
    if(lod===0){
      rseg(p, ex,B+1.05,ez,          s*1.05,B+1.20,ez+0.9);
      rseg(p, s*1.05,B+1.20,ez+0.9,  tx,B+1.70,tz);
    }
  }
}

/* ── The brood skeleton ───────────────────────────────────────────
   Abdomen, thorax and six legs on an alternating tripod, where the front and
   rear of one side travel with the middle leg of the other. Six legs on a
   single sine in unison is the thing that makes a model read as a toy.

   bulge swells the abdomen without moving the legs or the thorax, because a
   spitter is a rusher carrying something, not a differently proportioned
   animal. It sits AFTER gSpit in the file on purpose: the gunship's own
   assertions slice from gHeli up to the first gSpit, so anything placed in
   that span silently widens the slice and the gunship checks start passing
   against text that is not the gunship. */
function broodFrame(p,u,lod,B,bulge){
  const w=bulge||1;
  const g1=Math.sin(u.ph*4.4)*0.55, g2=-g1;

  rseg(p,0,B,-2.4*w,        -0.85*w,B,-1.7*w);
  rseg(p,-0.85*w,B,-1.7*w,  -1.05*w,B,-0.7*w);
  rseg(p,-1.05*w,B,-0.7*w,   0,B,-0.3);
  rseg(p,0,B,-0.3,           1.05*w,B,-0.7*w);
  rseg(p,1.05*w,B,-0.7*w,    0.85*w,B,-1.7*w);
  rseg(p,0.85*w,B,-1.7*w,    0,B,-2.4*w);
  if(lod===0){
    rseg(p,0,B,-2.4*w,          0,B+0.45*w,-1.8*w);
    rseg(p,0,B+0.45*w,-1.8*w,   0,B+0.35*w,-0.6);
    rseg(p,0,B+0.35*w,-0.6,     0,B,-0.3);
  }

  rseg(p,0,B,-0.3,          -1.00,B+0.10,0.4);
  rseg(p,-1.00,B+0.10,0.4,  -0.80,B+0.10,1.5);
  rseg(p,-0.80,B+0.10,1.5,   0,B,1.9);
  rseg(p,0,B,1.9,            0.80,B+0.10,1.5);
  rseg(p,0.80,B+0.10,1.5,    1.00,B+0.10,0.4);
  rseg(p,1.00,B+0.10,0.4,    0,B,-0.3);

  const LEG=[[1.00,0.4, 2.00,1.0, 2.50,1.4],
             [1.05,-0.9, 2.15,-0.9, 2.70,-1.0],
             [0.85,-1.9, 1.90,-2.4, 2.30,-3.0]];
  for(let i=0;i<3;i++){
    const L=LEG[i];
    for(let s=-1;s<=1;s+=2){
      const g=(i===1)===(s<0)?g1:g2;
      if(lod===0){
        rseg(p, s*L[0],B,L[1],        s*L[2],B*0.62,L[3]+g);
        rseg(p, s*L[2],B*0.62,L[3]+g, s*L[4],0,L[5]+g*1.7);
      } else {
        rseg(p, s*L[0],B,L[1],        s*L[4],0,L[5]+g*1.7);
      }
    }
  }
}
/* ── Coalition blade trooper ─────────────────────────────────────────────
   Same body as the rifleman, which is the point: they are the same soldiers
   with different kit, and drawing them from a shared skeleton is what makes
   a mixed line read as one army rather than two unrelated sprite sets.

   THE SWORD IS THE WHOLE MODEL, so it gets built as a blade and not a line:
   two edges converging to a point, a fuller down the middle, a crossguard
   across the grip and a pommel behind the hand. A single segment reads as a
   stick held at an angle at any distance where you can see it at all.

   The swing is a real arc rather than a wobble. The old one oscillated the
   hand's x by a sine, so the blade slid sideways through the air without
   ever changing which way it pointed. This rotates the blade about the grip
   through an overhead cut, so the edge leads. */
function swordAt(p,gx,gy,gz,ang,len,lod){
  const c=Math.cos(ang), sN=Math.sin(ang);
  const tx=gx, ty=gy+c*len, tz=gz+sN*len;            // tip
  const bx=gx, by=gy+c*0.16, bz=gz+sN*0.16;          // just past the guard
  rseg(p, bx-0.075,by,bz, tx,ty,tz);                 // edge, near side
  rseg(p, bx+0.075,by,bz, tx,ty,tz);                 // edge, far side
  if(lod===0){
    rseg(p, bx-0.075,by,bz, bx+0.075,by,bz);         // ricasso
    rseg(p, gx,gy+c*0.55,gz+sN*0.55, tx,ty,tz);      // fuller
  }
  rseg(p, gx-0.22,gy+c*0.10,gz+sN*0.10,             // crossguard
          gx+0.22,gy+c*0.10,gz+sN*0.10);
  rseg(p, gx,gy,gz, gx-c*0.22,gy-c*0.22,gz-sN*0.22); // grip to pommel
}
function gKnife(p,u,lod){
  const X=wx(u.x), Z=wz(u.y);
  setPose(X,Z,u.hdg);
  const low=(u.st===S_SUPP||u.sup>900)?0.55:1;
  const h=1.9*low;
  const mel=u.mel>=0;
  /* Overhead cut when engaged, blade carried low and forward when not. */
  const ang = mel ? (-0.35+Math.sin(u.ph*8)*1.15) : 0.95;

  if(lod>=2){
    const sw=mel?Math.sin(u.ph*8)*1.0:0.15;
    rseg(p,0,0,0, 0,h,0);
    rseg(p,0,h,0, -0.45,h*0.5,0.35);
    rseg(p,0,h,0,  0.45,h*0.5,0.35);
    rseg(p,0,0,0, -0.55,0,-0.45);
    rseg(p,0,0,0,  0.55,0,-0.45);
    rseg(p,0,h,0, 0,h+0.5,0);
    rseg(p,0.45,h*0.5,0.35, 0.45+sw,h*0.95,1.5);
    rseg(p,0.45+sw,h*0.95,1.5, 0.30+sw,h*1.15,2.2);
    return;
  }

  const HIP=h*0.47, CH=h*0.74, SH=h*0.81, NK=h*0.86, HD=h*0.94;
  const mv=(u.st===S_BOUND)?1:0;
  const gait=Math.sin(u.ph*6.2)*mv;

  rseg(p,-0.20,HIP,0,  0.20,HIP,0);
  rseg(p,-0.20,HIP,0, -0.24,HIP*0.5, gait*0.38);
  rseg(p,-0.24,HIP*0.5,gait*0.38, -0.26,0, gait*0.60);
  rseg(p, 0.20,HIP,0,  0.24,HIP*0.5,-gait*0.38);
  rseg(p, 0.24,HIP*0.5,-gait*0.38, 0.26,0,-gait*0.60);

  rseg(p,0,HIP,0, 0,CH,0.04);
  rseg(p,0,CH,0.04, 0,SH,0);
  rseg(p,-0.40,SH,0, 0.40,SH,0);
  rseg(p,-0.40,SH,0, -0.20,HIP,0);
  rseg(p, 0.40,SH,0,  0.20,HIP,0);
  if(lod===0){
    rseg(p,-0.28,CH,0.17, 0.28,CH,0.17);
    rseg(p,-0.28,CH,0.17, -0.36,SH,0.02);
    rseg(p, 0.28,CH,0.17,  0.36,SH,0.02);
  }

  rseg(p,0,SH,0, 0,NK,0);
  rseg(p,-0.19,HD,0.06,  0.19,HD,0.06);
  rseg(p, 0.19,HD,0.06,  0,HD,-0.20);
  rseg(p, 0,HD,-0.20,   -0.19,HD,0.06);
  rseg(p,0,NK,0, 0,HD+h*0.06,-0.03);

  /* Sword arm. The grip travels with the swing so the shoulder, elbow and
     hand stay a plausible chain instead of the hand teleporting. */
  const gy=CH+0.10+Math.max(0,-Math.sin(ang))*0.30;
  const gz=0.34+Math.max(0,Math.sin(ang))*0.34;
  rseg(p, 0.34,SH,0,  0.40,CH-0.04,gz*0.45);        // upper arm
  rseg(p, 0.40,CH-0.04,gz*0.45, 0.20,gy,gz);        // forearm to grip
  swordAt(p,0.20,gy,gz,ang,1.55,lod);
  if(mel) rseg(p,-0.34,SH,0, 0.08,gy-0.10,gz-0.12); // off hand joins the hilt
  else {
    rseg(p,-0.34,SH,0, -0.44,CH-0.06,0.30);         // buckler on the forearm
    rseg(p,-0.44,CH-0.06,0.30, -0.30,CH+0.10,0.52);
    rseg(p,-0.30,CH+0.10,0.52, -0.22,CH-0.16,0.50);
    rseg(p,-0.22,CH-0.16,0.50, -0.44,CH-0.06,0.30);
  }
  if(lod===0) rseg(p,-0.22,HIP+0.04,-0.10, -0.30,HIP-0.34,-0.46); // scabbard
}
/* ── Brood flyer, the Lancet ────────────────────────────────────
   Nine segments and no tier: a line for a body, four for one pair of wings,
   two claws and a sting. It is the only unit that spends its whole life above
   the terrain, which means it is the only silhouette on the field regularly
   seen against empty sky with nothing behind it to hide in.

   Four wings on two offset beats, a segmented abdomen tapering into the
   sting, a head with mandibles, and legs carried tucked rather than hanging.
   The far tier is six segments, three FEWER than the flat model it replaces,
   because at that range a flyer is a cross with a tail and the claws were
   never visible to begin with. */
function gFlyer(p,u,lod){
  const X=wx(u.x), Z=wz(u.y), Y=u.alt;
  setPose(X,Z,u.hdg);
  const b=Math.sin(u.ph*11)*0.9, b2=Math.sin(u.ph*11+1.1)*0.7;

  if(lod>=2){
    rseg(p,0,Y,2.0,       0,Y,-3.6);
    rseg(p,0,Y,-3.6,      0,Y+0.40,-4.6);
    rseg(p, 0.50,Y,0.6,   3.20,Y+b,-0.6);
    rseg(p,-0.50,Y,0.6,  -3.20,Y+b,-0.6);
    rseg(p, 0.45,Y,-0.4,  2.40,Y-b2,-2.0);
    rseg(p,-0.45,Y,-0.4, -2.40,Y-b2,-2.0);
    return;
  }

  rseg(p,0,Y,1.4,            -0.70,Y+0.15,0.4);  // thorax
  rseg(p,-0.70,Y+0.15,0.4,    0,Y,-0.6);
  rseg(p,0,Y,-0.6,            0.70,Y+0.15,0.4);
  rseg(p,0.70,Y+0.15,0.4,     0,Y,1.4);

  rseg(p,0,Y,1.4,        0,Y+0.05,2.0);          // head
  rseg(p,0,Y+0.10,2.0,  -0.35,Y,2.4);
  rseg(p,-0.35,Y,2.4,    0,Y-0.10,2.8);
  rseg(p,0,Y-0.10,2.8,   0.35,Y,2.4);
  rseg(p,0.35,Y,2.4,     0,Y+0.10,2.0);
  if(lod===0){
    rseg(p,-0.35,Y,2.4, -0.70,Y,3.1);            // mandibles
    rseg(p, 0.35,Y,2.4,  0.70,Y,3.1);
  }

  rseg(p,-0.50,Y,-0.6,  -0.38,Y,-1.9);           // abdomen, tapering
  rseg(p,-0.38,Y,-1.9,  -0.25,Y,-3.1);
  rseg(p,-0.25,Y,-3.1,   0,Y+0.12,-4.0);
  rseg(p, 0.50,Y,-0.6,   0.38,Y,-1.9);
  rseg(p, 0.38,Y,-1.9,   0.25,Y,-3.1);
  rseg(p, 0.25,Y,-3.1,   0,Y+0.12,-4.0);
  if(lod===0){
    rseg(p,-0.38,Y,-1.9,  0.38,Y,-1.9);          // segment rings
    rseg(p,-0.25,Y,-3.1,  0.25,Y,-3.1);
  }
  rseg(p,0,Y+0.12,-4.0,  0,Y+0.45,-4.9);         // sting
  if(lod===0) rseg(p,0,Y+0.45,-4.9, 0,Y+0.26,-4.55);

  /* Fore and hind wings run on the same period offset by about a sixth of a
     cycle, so the four never line up into two. */
  for(let s=-1;s<=1;s+=2){
    rseg(p, s*0.55,Y+0.20,0.7,      s*3.30,Y+b,-0.5);
    rseg(p, s*3.30,Y+b,-0.5,        s*1.55,Y+b*0.6,-1.8);
    if(lod===0) rseg(p, s*1.55,Y+b*0.6,-1.8, s*0.55,Y+0.20,0.7);
    rseg(p, s*0.50,Y+0.05,-0.4,     s*2.55,Y-b2,-2.0);
    rseg(p, s*2.55,Y-b2,-2.0,       s*1.10,Y-b2*0.5,-2.9);
    if(lod===0) rseg(p, s*1.10,Y-b2*0.5,-2.9, s*0.50,Y+0.05,-0.4);
  }

  if(lod===0) for(let s=-1;s<=1;s+=2){
    rseg(p, s*0.45,Y,0.6,   s*0.75,Y-0.70,0.2);  // legs, tucked
    rseg(p, s*0.40,Y,-0.1,  s*0.65,Y-0.70,-0.5);
  }
}
function gJet(p,j){
  const X=wx(j.x), Z=wz(j.y), Y=j.alt;
  setPose(X,Z,j.hdg);
  rseg(p,0,Y,6.0,  1.0,Y,-1.5);          // fuselage
  rseg(p,1.0,Y,-1.5, 0.7,Y,-4.6);
  rseg(p,0.7,Y,-4.6,-0.7,Y,-4.6);
  rseg(p,-0.7,Y,-4.6,-1.0,Y,-1.5);
  rseg(p,-1.0,Y,-1.5, 0,Y,6.0);
  rseg(p,0.9,Y,0.6,   5.4,Y-0.3,-3.4);   // delta wings
  rseg(p,5.4,Y-0.3,-3.4, 1.0,Y,-4.2);
  rseg(p,-0.9,Y,0.6, -5.4,Y-0.3,-3.4);
  rseg(p,-5.4,Y-0.3,-3.4,-1.0,Y,-4.2);
  rseg(p,0,Y,-2.6, 0,Y+2.6,-4.6);        // tail
  rseg(p,0,Y+2.6,-4.6, 0,Y,-4.6);
  rseg(p,1.9,Y-0.2,-1.0, 3.0,Y-0.2,-3.2);
  rseg(p,-1.9,Y-0.2,-1.0,-3.0,Y-0.2,-3.2);
}
function gBomb(p,b){
  const X=wx(b.x), Z=wz(b.y), Y=b.alt;
  seg(p,X,Y,Z, X,Y+1.6,Z-0.4);
  seg(p,X-0.5,Y+1.6,Z-0.2, X+0.5,Y+1.6,Z-0.6);
}
function gHiveCity(p,c){
  const X=wx(c.cx), Z=wz(c.cy);
  const RX=c.r*FIELD_W, RZ=c.r*0.66*FIELD_D;
  const rnd=mulberry32(c.seed);
  const N=11;
  // Mound: a closed ribbed dome, not a cylinder. Each rib bows outward and
  // meets the others at a single crown, so the silhouette is organic.
  const crownY=c.spire*0.42;
  for(let k=0;k<N;k++){
    const a=(k/N)*Math.PI*2, a2=((k+1)/N)*Math.PI*2;
    const j=0.80+rnd()*0.4, j2=0.80+rnd()*0.4;
    const x1=X+Math.cos(a)*RX*j,  z1=Z+Math.sin(a)*RZ*j;
    const x2=X+Math.cos(a2)*RX*j2,z2=Z+Math.sin(a2)*RZ*j2;
    seg(p,x1,0,z1, x2,0,z2);                       // skirt
    const mx=(x1+X)*0.5, mz=(z1+Z)*0.5;
    seg(p,x1,0,z1, mx,crownY*0.62,mz);             // rib, bowing in
    seg(p,mx,crownY*0.62,mz, X,crownY,Z);
  }
  // Spire. Tapered, kinked, leaning: it is grown, not built.
  const lx=Math.cos(c.seed)*c.lean*RX*0.25, lz=Math.sin(c.seed)*c.lean*RZ*0.25;
  const k1=[X+lx*0.4, crownY+c.spire*0.42, Z+lz*0.4];
  const k2=[X+lx,     crownY+c.spire*0.80, Z+lz];
  const tip=[X+lx*1.5,crownY+c.spire,      Z+lz*1.5];
  seg(p,X,crownY,Z, k1[0],k1[1],k1[2]);
  seg(p,k1[0],k1[1],k1[2], k2[0],k2[1],k2[2]);
  seg(p,k2[0],k2[1],k2[2], tip[0],tip[1],tip[2]);
  for(let k=0;k<4;k++){                            // spire ribs
    const a=(k/4)*Math.PI*2;
    seg(p,X+Math.cos(a)*RX*0.22,crownY,Z+Math.sin(a)*RZ*0.22, k1[0],k1[1],k1[2]);
  }
  // Arches leaning in over the mound, the way a ribcage closes.
  for(let k=0;k<c.arches;k++){
    const a=(k/c.arches)*Math.PI*2 + c.lean;
    const ox=X+Math.cos(a)*RX*1.35, oz=Z+Math.sin(a)*RZ*1.35;
    const apx=X+Math.cos(a)*RX*0.45, apz=Z+Math.sin(a)*RZ*0.45;
    const apy=crownY*0.95+c.spire*0.18;
    seg(p,ox,0,oz, ox*0.6+apx*0.4, apy*0.55, oz*0.6+apz*0.4);
    seg(p,ox*0.6+apx*0.4, apy*0.55, oz*0.6+apz*0.4, apx,apy,apz);
    seg(p,apx,apy,apz, X,crownY+c.spire*0.10,Z);
  }
  // Tunnel mouths at ground level. This is where the brood comes out.
  for(let k=0;k<c.mouths;k++){
    const a=(k/c.mouths)*Math.PI*2 + 0.7;
    const mx=X+Math.cos(a)*RX*0.92, mz=Z+Math.sin(a)*RZ*0.92;
    const wq=RX*0.16, hq=crownY*0.30;
    seg(p,mx-wq,0,mz, mx-wq*0.7,hq,mz);
    seg(p,mx-wq*0.7,hq,mz, mx+wq*0.7,hq,mz);
    seg(p,mx+wq*0.7,hq,mz, mx+wq,0,mz);
  }
}
function gDead(p,u){
  const X=wx(u.x), Z=wz(u.y);
  seg(p,X-1.3,0.1,Z-0.8, X+1.3,0.1,Z+0.8);
  seg(p,X-0.9,0.1,Z+0.9, X+0.9,0.1,Z-0.9);
}
function gPrism(p,f){
  const n=f.pts.length, ht=f.ht;
  if(f.kind==='crater'){
    /* Craters have negative height. Drawing them like every other prism put
       the "top" face underground and the verticals dangled below the plane,
       which read as floating geometry rather than a hole. A crater is a rim
       at ground level and a depressed floor inside it. */
    const cxp=wx(f.cx), czp=wz(f.cy);
    for(let k=0;k<n;k++){
      const a=f.pts[k], b=f.pts[(k+1)%n];
      const ax=wx(a[0]),az=wz(a[1]),bx=wx(b[0]),bz=wz(b[1]);
      seg(p,ax,0.35,az, bx,0.35,bz);                             // raised rim
      const ix=cxp+(ax-cxp)*0.45, iz=czp+(az-czp)*0.45;
      const jx=cxp+(bx-cxp)*0.45, jz=czp+(bz-czp)*0.45;
      seg(p,ix,ht,iz, jx,ht,jz);                                 // floor
      if(k%2===0) seg(p,ax,0.35,az, ix,ht,iz);                   // wall
    }
    return;
  }
  for(let k=0;k<n;k++){
    const a=f.pts[k], b=f.pts[(k+1)%n];
    const ax=wx(a[0]),az=wz(a[1]),bx=wx(b[0]),bz=wz(b[1]);
    seg(p,ax,0,az,bx,0,bz);
    seg(p,ax,ht,az,bx,ht,bz);
    if(k%2===0||f.kind==='ridge') seg(p,ax,0,az,ax,ht,az);
  }
}

/* ── Solid cover, and the ordering problem it creates ─────────────────────
   Features were wireframe prisms: outlines you could see straight through. That
   worked because nothing occluded anything, so nothing needed sorting. Solid
   geometry has no such luxury, and getting the order wrong is not subtle - a
   rifleman standing behind a six metre ridge draws on top of it and reads as a
   ghost.

   THE SPLIT IS BY WHAT KIND OF SURFACE IT IS, not by what kind of object.

     TOPS are horizontal planes, so they go through bandPass at the feature's own
     height and get real tiled ground with the texture stuck to the world. They
     are painted with the ground, in height buckets, because a band pass is a
     full-screen operation and doing one per feature would be thirty-four of them.

     SIDES are vertical quads, so they cannot be a horizontal plane pass at all.
     They are flat-filled with a shaded rock colour and, crucially, they go into
     the SAME depth-sorted list as the units. That is what buys back the
     occlusion: what actually hides a man standing behind a ridge is the ridge's
     near face, and that face is now a sorted quad that paints over him.

   BUCKETS, AND WHY FIVE. Feature heights are continuous, so an exact pass per
   height is a pass per feature. Quantising to five buckets means five band
   passes for the whole field and a top drawn at most a metre from where it
   should be, which is invisible against a surface with its own relief. */
const TOP_BUCKETS = 5;

/* Screen-space footprint of one feature's top face, or null if any vertex is
   behind the near plane. Returning null rather than a clipped polygon is
   deliberate: a feature straddling the near plane is a metre from the camera and
   is going to be wrong whatever we do, and a half-clipped polygon is wrong in a
   way that flickers. */
var _fp = [0,0,0];
function topPoly(f, path){
  const n = f.pts.length, h = Math.max(0, f.ht);
  let started = false;
  for(let k = 0; k < n; k++){
    if(!project(wx(f.pts[k][0]), h, wz(f.pts[k][1]), _fp)) return false;
    if(!started){ path.moveTo(_fp[0], _fp[1]); started = true; }
    else path.lineTo(_fp[0], _fp[1]);
  }
  if(!started) return false;
  path.closePath();
  return true;
}

/* Raised features grouped into height buckets, each bucket one clip path and one
   band pass. Rebuilt per frame because the projection moves; cheap, since it is
   thirty-four polygons of six points. */
function topPasses(){
  const P = pats();
  if(!P || !P.rock) return;
  let lo = Infinity, hi = -Infinity;
  for(let i = 0; i < terrain.length; i++){
    const f = terrain[i];
    if(f.kind === 'hive' || f.ht <= 0.2) continue;
    if(f.ht < lo) lo = f.ht;
    if(f.ht > hi) hi = f.ht;
  }
  if(!isFinite(lo)) return;
  const span = Math.max(0.001, hi - lo);
  for(let b = 0; b < TOP_BUCKETS; b++){
    const bLo = lo + span * b / TOP_BUCKETS;
    const bHi = lo + span * (b + 1) / TOP_BUCKETS + (b === TOP_BUCKETS - 1 ? 0.001 : 0);
    const path = new Path2D();
    let any = false, sum = 0, cnt = 0;
    for(let i = 0; i < terrain.length; i++){
      const f = terrain[i];
      if(f.kind === 'hive' || f.ht <= 0.2) continue;
      /* A MESH FEATURE HAS NO FLAT TOP TO PASS GROUND OVER. The band pass
         paints a horizontal plane clipped to a footprint; a crag's top is a
         jagged surface at forty different heights, so laying tiled ground over
         its footprint at one height puts a flat lid across the peaks. Meshes
         are shaded by their own faces and are skipped here. */
      if(MESHES && KIND_MESH[f.kind]) continue;
      if(f.ht < bLo || f.ht >= bHi) continue;
      if(topPoly(f, path)){ any = true; sum += f.ht; cnt++; }
    }
    if(any) bandPass(P.rock, sum / cnt, path, true);
  }
}

/* Sunk features: a crater or a chasm is a hole, and a hole is the one thing on
   this field that is genuinely dark. Filled with the sky colour at depth-scaled
   opacity rather than with black, so a hole on Zhaal'un is a teal shadow and a
   hole on Ussaleth is a red one. A chasm at -9 goes nearly opaque; a crater at
   -1.6 barely darkens. */
function sinkPasses(){
  const p = PAL || (PAL = paletteFor(RB.colony));
  for(let i = 0; i < terrain.length; i++){
    const f = terrain[i];
    if(f.kind === 'hive' || f.ht >= -0.2) continue;
    const path = new Path2D();
    const n = f.pts.length;
    let started = false, ok = true;
    for(let k = 0; k < n; k++){
      if(!project(wx(f.pts[k][0]), 0, wz(f.pts[k][1]), _fp)){ ok = false; break; }
      if(!started){ path.moveTo(_fp[0], _fp[1]); started = true; }
      else path.lineTo(_fp[0], _fp[1]);
    }
    if(!ok || !started) continue;
    path.closePath();
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = rgba(p.sky, Math.min(0.88, 0.22 + Math.abs(f.ht) * 0.075));
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    // A rim, because a hole with no lip reads as a stain on the ground.
    ctx.strokeStyle = rgba(p.edge, 0.30);
    ctx.lineWidth = 1.1;
    ctx.stroke(path);
  }
}

/* Side quads, emitted into the shared depth list. One quad per edge of a raised
   feature, back-face culled and shaded by facing so a prism reads as a solid
   with a lit side and a dark one rather than as a flat sticker. */
const _sq = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
const SUN = [0.55, 0.0, -0.84];        // fixed key light, normalized in xz
function pushSides(f, out){
  const n = f.pts.length, h = f.ht;
  if(f.kind === 'hive' || h <= 0.2) return;
  for(let k = 0; k < n; k++){
    const a = f.pts[k], b = f.pts[(k + 1) % n];
    const ax = wx(a[0]), az = wz(a[1]), bx = wx(b[0]), bz = wz(b[1]);
    // Outward normal of this edge in xz. Winding is generated counterclockwise
    // in feature space, so the outward normal is the edge rotated one way and
    // the check below is what decides which.
    let nx = -(bz - az), nz = (bx - ax);
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    const ox = mx - wx(f.cx), oz = mz - wz(f.cy);
    if(nx * ox + nz * oz < 0){ nx = -nx; nz = -nz; }      // force it outward
    // Back-face cull: a face pointing away from the camera is never visible on
    // a closed prism, and drawing it means painting the far wall over the near.
    if(nx * (mx - cam.x) + nz * (mz - cam.z) > 0) continue;
    if(!project(ax, 0, az, _sq[0])) continue;
    if(!project(bx, 0, bz, _sq[1])) continue;
    if(!project(bx, h, bz, _sq[2])) continue;
    if(!project(ax, h, az, _sq[3])) continue;
    out.push({
      z: Math.min(_sq[0][2], _sq[1][2]),
      kind: 'side',
      lit: Math.max(0, nx * SUN[0] + nz * SUN[2]),
      p: [_sq[0][0], _sq[0][1], _sq[1][0], _sq[1][1],
          _sq[2][0], _sq[2][1], _sq[3][0], _sq[3][1]],
    });
  }
}
function paintSide(it){
  const p = PAL || (PAL = paletteFor(RB.colony));
  const q = it.p;
  /* A SIDE IS ALWAYS DARKER THAN A TOP AND THE FIRST VERSION HAD IT BACKWARDS.
     Shading ran 0.42 to 1.0 of the way toward the rock value, which on a world
     whose rock is (255,138,76) made every wall hotter than the sunlit surface
     above it, and thirty-four features came out as glowing orange cardboard.
     A horizontal face catches the sky and a vertical one does not; that is not
     an art preference, it is where the light is.

     So the range is low and narrow: mostly ground, a little rock on the lit
     flank. Anchoring the dark end on GROUND rather than on black keeps a
     shadowed wall the same material as the plain it stands on, where black
     faces read as holes cut out of the world. */
  const k = 0.18 + it.lit * 0.42;
  const mix = (a, b) => Math.round(a + (b - a) * k);
  const c = [ mix(p.far[0], p.rock[0]), mix(p.far[1], p.rock[1]), mix(p.far[2], p.rock[2]) ];
  ctx.beginPath();
  ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]);
  ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]);
  ctx.closePath();
  ctx.fillStyle = rgba(c, 0.97); ctx.fill();
  /* A vertical darkening from the top edge down to the footing. Free ambient
     occlusion: it is what stops a prism reading as a flat sticker and it costs
     one gradient. q[6],q[7] is the top-near corner and q[0],q[1] the bottom. */
  const gd = ctx.createLinearGradient(q[6], q[7], q[0], q[1]);
  gd.addColorStop(0, rgba(p.ground, 0));
  gd.addColorStop(1, rgba(p.ground, 0.55));
  ctx.fillStyle = gd; ctx.fill();
  // A lip along the top edge only, which is the one that reads as an edge.
  ctx.beginPath();
  ctx.moveTo(q[6], q[7]); ctx.lineTo(q[4], q[5]);
  ctx.strokeStyle = rgba(p.edge, 0.22); ctx.lineWidth = 1; ctx.stroke();
}

/* ── Cover is meshes now, not extruded footprints ─────────────────────────
   THE PRISMS LOOKED LIKE BRICK LOAVES AND THAT WAS INHERENT, not a shading
   problem. A prism is a polygon pushed straight up: flat top, vertical walls,
   one silhouette from every angle. Thirty-four of them on a plain reads as
   masonry dropped on the ground, and no amount of tinting the sides fixes a
   shape that has no shape.

   These are low-poly meshes, CC0, flat-shaded per face from the same planet
   palette the ground uses. The generator is untouched: a feature still has a
   kind, a footprint, a height and a set of cover slots, and the AI still reads
   all four. Only what gets DRAWN at that spot changed, which is why nothing
   about cover behaviour moved with it.

   FACE COUNT IS THE ENTIRE BUDGET. Canvas fills one polygon per call, so a mesh
   costs draw calls per instance per frame. Scatter rocks are 7 to 40 faces and
   there can be dozens; crags are 103 to 205 and there are a dozen; the 350-plus
   cliffs are the far ridge only, where there are six and they sit behind the
   haze. Back-face culling removes about half of what is left. */
var MESHES = null, _meshPend = 0;
function loadMeshes(){
  if(MESHES || _meshPend) return MESHES;
  _meshPend = 1;
  var src = window.FM_NATURE_SRC || ('assets/space/nature/meshes.json'
            + (window.FM_BUILD ? ('?v=' + window.FM_BUILD) : ''));
  if(typeof src === 'object'){ MESHES = src; return MESHES; }
  fetch(src).then(function(r){ return r.json(); })
            .then(function(j){ MESHES = j; })
            .catch(function(){ _meshPend = 2; });   // wireframe keeps the field
  return null;
}

/* Which mesh a feature kind wears, and how tall it stands. Height is taken from
   the feature's OWN ht rather than from the mesh, so a ridge the generator made
   six metres tall is six metres tall whichever rock is standing on it and the
   cover slots still line up with something. */
var KIND_MESH = {
  ridge:    ['crag_a','crag_b'],
  pressure: ['crag_a','crag_b'],
  block:    ['crag_b','crag_a'],
  anchor:   ['crag_b'],
  seam:     ['rock_d','rock_c'],
  boulder:  ['rock_d','rock_c','rock_b'],
  wreck:    ['rock_c','rock_b','rock_a'],
};

/* ── What grows here ──────────────────────────────────────────────────────
   THE OLD RULE WAS "DEAD AND BARE ONLY" AND IT WAS TOO NARROW. It was written
   to stop a pine forest appearing on Ussaleth, which is still right, but it
   also banned the cactus - and a cactus is exactly what a desert world wants
   and says nothing at all about pine forests. The rule was doing its job by
   banning a category when the thing it actually cared about was CLIMATE.

   So growth is decided by the world's terrain key, which is already the
   climate statement the palette and the ground patches read. A lava world gets
   dead pines and no cacti; a desert gets cacti and no fungus; the drowned world
   gets fungus and no timber. Nothing can appear on a world whose recipe does not
   name it, which is a stronger guarantee than a blanket ban and a more useful
   one, because it can say yes.

   HEIGHT IS A PROPERTY OF THE MESH, NOT A SHARED ROLL. Every prop used to take
   the same 1-to-5 metre range, which put mushrooms the size of trees next to
   bushes the size of mushrooms. A cactus is two to three metres, a dead pine is
   six to nine, a tuft of grass is knee high, and those are facts about the
   object rather than about where it happens to be standing. */
const FLORA_SPEC = {
  //          height range   width ratio   how dark against rock
  snag_a:   { h:[4.0, 7.5],  w:[0.55,0.85], tone:0.34 },   // dead palm
  snag_b:   { h:[5.0, 9.0],  w:[0.60,0.95], tone:0.36 },   // dead pine
  snag_c:   { h:[4.5, 8.0],  w:[0.70,1.10], tone:0.34 },   // dead broadleaf
  snag_d:   { h:[2.4, 4.5],  w:[0.90,1.40], tone:0.38 },   // snapped trunk
  snag_e:   { h:[4.0, 7.0],  w:[0.90,1.30], tone:0.36 },   // dead willow
  tree_a:   { h:[2.6, 5.0],  w:[0.55,0.90], tone:0.30 },
  tree_b:   { h:[3.0, 6.0],  w:[0.55,0.90], tone:0.30 },
  tree_c:   { h:[3.0, 6.0],  w:[0.55,0.90], tone:0.30 },
  tree_d:   { h:[3.5, 6.5],  w:[0.60,1.00], tone:0.30 },
  wint_a:   { h:[3.0, 5.5],  w:[0.55,0.90], tone:0.16 },   // snow load: paler
  wint_b:   { h:[4.0, 7.5],  w:[0.60,0.95], tone:0.16 },
  cact_a:   { h:[1.8, 3.4],  w:[0.45,0.75], tone:0.26 },
  scrub_a:  { h:[0.7, 1.5],  w:[1.10,1.80], tone:0.32 },
  scrub_b:  { h:[0.8, 1.7],  w:[1.10,1.80], tone:0.32 },
  scrub_c:  { h:[0.9, 1.9],  w:[1.00,1.60], tone:0.32 },
  scrub_d:  { h:[1.0, 2.1],  w:[1.00,1.60], tone:0.32 },
  snowb_a:  { h:[0.7, 1.5],  w:[1.10,1.80], tone:0.14 },
  snowb_b:  { h:[0.8, 1.7],  w:[1.10,1.80], tone:0.14 },
  tuft:     { h:[0.4, 0.9],  w:[1.20,2.00], tone:0.28 },
  shrm_a:   { h:[0.5, 1.4],  w:[0.90,1.50], tone:0.22 },
  shrm_b:   { h:[0.6, 1.8],  w:[0.90,1.50], tone:0.22 },
};

/* Per climate: how much grows, and what. Weights are relative within a world;
   the low ground cover is deliberately common and the timber deliberately not,
   because a field of evenly spaced trees is an orchard.

   THE DESERT GETS CACTI AND THE ICE WORLD GETS NEITHER TIMBER NOR SCRUB, and
   those are the two ends of what this table is for. Everything is still tinted
   by the planet palette, so a "cactus" on Ussaleth is a red silhouette the
   shape of a cactus rather than a green one imported from Earth. */
const FLORA_MIX = {
  dust:    { n: 64, pool: [['tuft',5],['scrub_a',4],['scrub_b',3],['cact_a',3],
                           ['snag_a',2],['scrub_d',2],['tree_a',1]] },
  veins:   { n: 46, pool: [['tuft',3],['scrub_b',3],['scrub_c',3],['snag_d',3],
                           ['snag_b',2],['snag_c',1]] },
  rift:    { n: 52, pool: [['tuft',4],['scrub_a',4],['shrm_a',3],['shrm_b',2],
                           ['scrub_c',2],['snag_e',1]] },
  tether:  { n: 44, pool: [['tuft',4],['scrub_a',3],['scrub_b',3],['snag_c',2],
                           ['snag_d',2],['tree_b',1]] },
  station: { n: 18, pool: [['tuft',5],['scrub_b',2],['scrub_a',2]] },
  ocean:   { n: 50, pool: [['tuft',4],['scrub_a',3],['shrm_a',3],['shrm_b',2],
                           ['snag_a',2],['scrub_c',2]] },
  ice:     { n: 34, pool: [['snowb_a',4],['snowb_b',3],['wint_a',2],['wint_b',1],
                           ['tuft',1]] },
};

function pickWeighted(pool, r){
  let tot = 0;
  for(let i=0;i<pool.length;i++) tot += pool[i][1];
  let t = r * tot;
  for(let i=0;i<pool.length;i++){ t -= pool[i][1]; if(t<=0) return pool[i][0]; }
  return pool[pool.length-1][0];
}

var flora = [];
function genFlora(seed){
  flora = [];
  const mix = FLORA_MIX[worldTerrain()];
  if(!mix) return;
  const rnd = mulberry32(seed ^ 0xF10AA);
  for(let i=0;i<mix.n;i++){
    const name = pickWeighted(mix.pool, rnd());
    const sp = FLORA_SPEC[name];
    if(!sp) continue;
    flora.push({
      name: name,
      x: 0.02 + rnd()*0.96,
      y: 0.02 + rnd()*0.96,
      h: sp.h[0] + rnd()*(sp.h[1]-sp.h[0]),
      wr: sp.w[0] + rnd()*(sp.w[1]-sp.w[0]),
      rot: rnd()*Math.PI*2,
      tone: sp.tone,
    });
  }
}

/* A PER-FRAME FACE BUDGET, SPENT NEAREST FIRST. Cacti and dead pines are 436
   and 247 faces, against a bush at 22, so "how many props" stopped being a
   useful cap the moment the pack was used properly: sixty bushes and sixty
   cacti are the same count and a twentyfold difference in cost.

   So the budget is in FACES. Props are sorted by depth and drawn until it is
   spent, which means the expensive ones near the camera are always drawn and
   the expensive ones at the back are the first thing dropped - which is also
   the right order visually, because that is where they are least visible.

   Sorting sixty items a frame is nothing next to projecting them. */
const FLORA_FACE_BUDGET = 900;
const _fv = [0,0,0];
var _floraSort = [];
function queueFlora(out){
  if(!MESHES || !flora.length) return;
  _floraSort.length = 0;
  for(let i=0;i<flora.length;i++){
    const f = flora[i];
    const m = MESHES[f.name];
    if(!m) continue;
    const X = wx(f.x), Z = wz(f.y);
    if(!project(X, f.h*0.5, Z, _fv)) continue;
    // Screen-height cull first: it is one divide and it removes most of the
    // field before anything gets sorted or projected properly.
    if((f.h*focal)/_fv[2] < 5) continue;
    _floraSort.push({ f:f, m:m, X:X, Z:Z, z:_fv[2] });
  }
  _floraSort.sort((a,b)=>a.z-b.z);
  let budget = FLORA_FACE_BUDGET;
  for(let i=0;i<_floraSort.length;i++){
    const it = _floraSort[i];
    if(budget <= 0) break;
    budget -= it.m.f.length;
    pushMeshAt(it.m, it.X, it.Z, it.f.h, it.f.h*it.f.wr, it.f.h*it.f.wr,
               it.f.rot, out, it.f.tone);
  }
}

var _mv = [0,0,0], _mn = [0,0,0];
/* One instance, painted back to front within itself. A convex-ish low-poly
   prop sorts acceptably on face depth alone; these are rocks, not architecture,
   and a wrong face on a boulder is invisible where a wrong wall on a building
   is not. */
function pushMesh(f, out){
  if(!MESHES) return false;
  var pool = KIND_MESH[f.kind];
  if(!pool) return false;
  var name = pool[f.meshPick % pool.length];
  var m = MESHES[name];
  if(!m) return false;

  var h = Math.abs(f.ht) * 1.15;
  var X = wx(f.cx), Z = wz(f.cy);
  /* HEIGHT LEADS, FOOTPRINT ONLY MODULATES. Driving the horizontal scale from
     the footprint alone made a boulder fifteen metres across and four tall: a
     slab, not a rock, and it dominated the field so completely that the men
     fighting over it were incidental. The footprint is a GAMEPLAY extent - it
     is what the cover slots are laid out along - and it was never sized to be a
     silhouette. So the mesh is sized off its height, which is what a prop reads
     as, and the footprint stretches it by a bounded factor so a wide ridge is
     still wider than a boulder. */
  var wr = Math.max(0.55, Math.min(2.2, (f.w * FIELD_W) / Math.max(1, h * 2.4)));
  var dr = Math.max(0.55, Math.min(2.2, (f.h * FIELD_D) / Math.max(1, h * 2.4)));
  var sx = h * 1.15 * wr;
  var sz = h * 1.15 * dr;

  return pushMeshAt(m, X, Z, h, sx, sz, f.meshRot, out, 0);
}

/* The body of pushMesh, taking an explicit transform. Split out so flora can use
   the same projection, culling and shading path as cover: two copies of a
   back-face cull is two places for it to be wrong in a way nobody sees. */
function pushMeshAt(m, X, Z, h, sx, sz, rot, out, tone){
  var ca = Math.cos(rot), sa = Math.sin(rot);
  var V = m.v, F = m.f, N = m.n, np = 0;
  for(var i=0;i<F.length;i++){
    var face = F[i];
    // Back-face cull in world space, before any projection work.
    var nx0 = N[i*3], ny0 = N[i*3+1], nz0 = N[i*3+2];
    var nx = (nx0*ca - nz0*sa), nz = (nx0*sa + nz0*ca);
    var v0 = face[0]*3;
    var wx0 = X + (V[v0]*ca - V[v0+2]*sa)*sx;
    var wy0 = V[v0+1]*h;
    var wz0 = Z + (V[v0]*sa + V[v0+2]*ca)*sz;
    if(nx*(wx0-cam.x) + ny0*(wy0-cam.y) + nz*(wz0-cam.z) > 0) continue;

    var pts = [], ok = true, zmin = 1e9;
    for(var k=0;k<face.length;k++){
      var vi = face[k]*3;
      var px = X + (V[vi]*ca - V[vi+2]*sa)*sx;
      var py = V[vi+1]*h;
      var pz = Z + (V[vi]*sa + V[vi+2]*ca)*sz;
      if(!project(px,py,pz,_mv)){ ok = false; break; }
      pts.push(_mv[0], _mv[1]);
      if(_mv[2] < zmin) zmin = _mv[2];
    }
    if(!ok) continue;
    out.push({ z: zmin, kind:'face', tone: tone||0,
               lit: Math.max(0, nx*SUN[0] + ny0*0.42 + nz*SUN[2]), p: pts });
    np++;
  }
  return np > 0;
}

function paintFace(it){
  const p = PAL || (PAL = paletteFor(RB.colony));
  /* Same shading law the prism sides used, and for the same reason: anchored on
     GROUND at the dark end so a shadowed face is the same material as the plain
     it stands on. The upward term in lit is what separates a top face from a
     wall without needing two code paths. */
  /* Narrower and darker than the prism sides used. A mesh presents faces at
     every angle, so the same range that read as gentle shading on four flat
     walls turns into a boulder lit like hot metal: the top faces all land near
     the maximum at once. Rock is the value a LIT CLIFF FACE takes, and most of
     a rock is not that. */
  /* Widened and lifted with the ground. These meshes were shaded to sit on a
     plain at a fifth of the brightness it now has; left alone they read as black
     paper cut-outs on a lit desert. The dark end anchors on `far` rather than on
     `ground` for the same reason the ground tint does: `ground` is a shadow
     value and a rock face in daylight is not in shadow. */
  /* tone darkens a face toward the ground value. Growth is dead matter, not
     rock, and at the rock's brightness a stand of snags reads as a stone circle;
     one term keeps them the same MATERIAL family and a shade below it. */
  const k = (0.16 + it.lit * 0.46) * (1 - (it.tone||0));
  const mix = (a,b) => Math.round(a + (b-a)*k);
  const c = [ mix(p.far[0], p.rock[0]), mix(p.far[1], p.rock[1]), mix(p.far[2], p.rock[2]) ];
  const q = it.p;
  ctx.beginPath();
  ctx.moveTo(q[0], q[1]);
  for(let i=2;i<q.length;i+=2) ctx.lineTo(q[i], q[i+1]);
  ctx.closePath();
  ctx.fillStyle = rgba(c, 1);
  ctx.fill();
  /* Stroked in its own fill colour, one pixel. Not decoration: canvas
     antialiases polygon edges, and abutting faces of one mesh leave a hairline
     of whatever is behind them along every shared edge. The mesh looks cracked.
     Stroking the same colour closes the seam and costs nothing else. */
  ctx.strokeStyle = rgba(c, 1); ctx.lineWidth = 1; ctx.stroke();
}

/* ── The far spires ───────────────────────────────────────────────────────
   A HORIZON WITH NOTHING ON IT IS A HORIZON THAT SAYS THE WORLD ENDS AT THE
   FIELD. Six brood spires stand well beyond the fighting: too far to reach, too
   far to shoot, there to say the hive goes on past the ground being contested
   and that what is being taken is one clearing in something much larger.

   THEY ARE THE HIVE'S OWN LANGUAGE AT DISTANCE, NOT SCENERY MOUNTAINS. Chitin,
   not architecture: a mound with a spire over it, ribbed arches leaning inward,
   no right angles and no repeated modules, exactly as gHiveCity draws them
   close up. A nature-pack mountain on the skyline would have been cheaper and
   would have said the wrong thing, which is that the far country is empty.

   Drawn in the brood's amber against the sky rather than in the world palette,
   because they are not ground. That is also what keeps them readable through
   the haze that is deliberately eating everything else at that depth. */
var spires = [];
function genSpires(seed){
  const rnd = mulberry32(seed ^ 0x5B17E0);
  spires = [];
  const n = 6;
  for(let i=0;i<n;i++){
    /* Spread across the back and BEYOND the field, at depths well past
       FIELD_D. Far enough that parallax on an orbiting camera is slow, which is
       what makes distance read; close enough to subtend something. */
    const t = (i + 0.5) / n;
    spires.push({
      x: (t - 0.5) * FIELD_W * 3.4 + (rnd() - 0.5) * FIELD_W * 0.35,
      z: FIELD_D * (2.2 + rnd() * 2.6),
      h: FIELD_D * (0.30 + rnd() * 0.30),
      r: FIELD_D * (0.055 + rnd() * 0.055),
      lean: (rnd() - 0.5) * 0.34,
      ribs: 6 + ((rnd()*4)|0),
      /* Phase into the profile noise. Without it spireR is the same function
         for every spire and six mounds are one mound drawn six times, which the
         eye picks out instantly on a skyline. */
      ph: rnd() * 6.283,
    });
  }
}

/* ── The spire profile ────────────────────────────────────────────────────
   THE FIRST VERSION DREW PYRAMIDS. A ring of base points and straight lines to
   a tip is a cone, and a cone on a skyline is Egypt, not a hive. What makes the
   brood's architecture read is that it is GROWN: a wide flared foot, a waist
   that pinches, a spire that leans, and no two the same.

   So the silhouette comes from a profile function sampled up the height rather
   than from a base ring. Flare near the foot, pinch at the waist, taper to a
   tip, with per-spire noise on top so six of them are six shapes. */
function spireR(s, t){
  // t is 0 at the foot and 1 at the tip.
  const flare = 1.90 * Math.pow(1 - t, 1.9);
  const shaft = 0.34 * Math.pow(1 - t, 0.55);
  const waist = 1 - 0.30 * Math.exp(-Math.pow((t - 0.30) / 0.16, 2));
  const wob   = 1 + 0.16 * Math.sin(t * 9.1 + s.ph) + 0.09 * Math.sin(t * 17.3 + s.ph * 2.1);
  return s.r * (flare + shaft) * waist * wob;
}
function spireX(s, t){ return s.x + s.lean * s.h * Math.pow(t, 1.35); }

/* The rib cage, drawn over the filled mass. Arches that spring from the foot,
   lean inward through the waist and meet at the tip. */
function gSpire(path, s){
  const STEP = 9;
  for(let i=0;i<s.ribs;i++){
    const a = (i / s.ribs) * Math.PI * 2 + s.ph * 0.3;
    let px=0, py=0, pz=0, have=false;
    for(let k=0;k<=STEP;k++){
      const t = k/STEP;
      const rr = spireR(s, t);
      const X = spireX(s, t) + Math.cos(a) * rr;
      const Y = s.h * t;
      const Z = s.z + Math.sin(a) * rr * 0.82;
      if(have) seg(path, px,py,pz, X,Y,Z);
      px=X; py=Y; pz=Z; have=true;
    }
  }
  // Growth bands round the waist. Without them it is a wire tepee again.
  for(const t of [0.20, 0.38, 0.58, 0.78]){
    const rr = spireR(s, t), ox = spireX(s, t), Y = s.h * t;
    for(let a=0;a<10;a++){
      const t0=a/10*Math.PI*2, t1=(a+1)/10*Math.PI*2;
      seg(path, ox+Math.cos(t0)*rr, Y, s.z+Math.sin(t0)*rr*0.82,
                ox+Math.cos(t1)*rr, Y, s.z+Math.sin(t1)*rr*0.82);
    }
  }
}

/* The filled mass. Traced as a screen-space outline up the left of the profile
   and back down the right, which is what a swept solid actually looks like from
   any one direction. Filling the rib cage instead leaves the gaps between ribs
   transparent and the shape reads as torn. */
const _sp = [0,0,0];
function gSpireBody(path, s){
  const STEP = 16;
  const L = [], R = [];
  for(let k=0;k<=STEP;k++){
    const t = k/STEP;
    const rr = spireR(s, t), ox = spireX(s, t), Y = s.h * t;
    if(!project(ox - rr, Y, s.z, _sp)) return;
    L.push([_sp[0], _sp[1]]);
    if(!project(ox + rr, Y, s.z, _sp)) return;
    R.push([_sp[0], _sp[1]]);
  }
  path.moveTo(L[0][0], L[0][1]);
  for(let k=1;k<L.length;k++) path.lineTo(L[k][0], L[k][1]);
  for(let k=R.length-1;k>=0;k--) path.lineTo(R[k][0], R[k][1]);
  path.closePath();
}

function paintSpires(){
  if(!spires.length) return;
  const p = PAL || (PAL = paletteFor(RB.colony));
  /* SILHOUETTE FIRST, WIRE SECOND, and the first version had only the wire.
     Amber line work at a third alpha is invisible against Ussaleth's sky, which
     is amber: the spires were drawn every frame and could not be seen. A distant
     mass is a DARK SHAPE AGAINST THE SKY before it is any kind of detail, so the
     body is filled at the horizon value darkened, and the ribs go over it. */
  const body = new Path2D();
  for(let i=0;i<spires.length;i++) gSpireBody(body, spires[i]);
  const dk = [ Math.round(p.horizon[0]*0.32), Math.round(p.horizon[1]*0.30), Math.round(p.horizon[2]*0.34) ];
  ctx.fillStyle = rgba(dk, 0.88);
  ctx.fill(body);
  const path = new Path2D();
  for(let i=0;i<spires.length;i++) gSpire(path, spires[i]);
  ctx.strokeStyle = `rgba(${FAC.khai.line.join(',')},0.30)`;
  ctx.lineWidth = 1.1;
  ctx.stroke(path);
}



/* ── Showing a war instead of a row of flags ───────────────────────────────
   CAMPS WERE THE ONLY PICTURE OF ZONE CONTROL AND THEY WERE A HOLD-THE-LINE
   PICTURE. A strip of props across the field, each owned by one side, flipping
   as the front passes over them: that is a capture-point game, and it says the
   fight is about a fixed number of discrete things. The Reach is not that. A
   world is taken over weeks by grinding waves, and what a player needs to read
   off the field is how far in the line has got and where it is under pressure,
   not which of six huts is currently orange.

   So control is drawn ON THE GROUND, and the ground is already a band pass.
   Three things, and each answers a question a flag could not:

     THE HELD BAND. Everything short of the front is tinted toward the holding
     faction, fading out as it approaches the line. That is "how much of this
     ground is actually ours", continuous, and it moves when the war moves
     rather than in six steps.

     PRESSURE AT THE OBJECTIVES. Each objective gets a patch whose colour is who
     is winning there and whose intensity is how hard it is being contested.
     A quiet flank is faint; a place where two lines are grinding is bright. That
     is the thing camps were reaching for and could not express, because a camp
     has two states and a fight has a temperature.

     THE FRONT ITSELF stays the wavering line it already was.

   NO ART, WHICH IS THE POINT. Everything here is a gradient on a plane that is
   already being drawn. There was no art for a firebase and there is none for a
   flag either; inventing some means another pack and another licence.

   IT IS ALSO STILL DECORATION. Same rule as the rest of this file: control
   arrives over the wire and this draws it. Nothing here decides anything. */
function paintControl(){
  const p = PAL || (PAL = paletteFor(RB.colony));
  const hy = horizonY();
  if(hy >= H) return;

  const ours = FAC[homeFac()].line, theirs = FAC.khai.line;

  /* The held band, as a screen-space wash between the horizon and the near
     plane. Deliberately NOT a projected quad: at this alpha the difference is
     invisible and a quad costs a clip and a transform every frame, on the one
     effect that is meant to sit under everything and never be looked at. */
  const fy = frontScreenY();
  if(fy > hy){
    const g = ctx.createLinearGradient(0, fy, 0, H);
    g.addColorStop(0,    rgba(ours, 0));
    g.addColorStop(0.45, rgba(ours, 0.055));
    g.addColorStop(1,    rgba(ours, 0.13));
    ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
  }
  /* And the brood's half, from the front back to the horizon. Weaker, because
     ground nobody has reached yet is not the same claim as ground being held. */
  if(fy > hy){
    const g2 = ctx.createLinearGradient(0, hy, 0, fy);
    g2.addColorStop(0, rgba(theirs, 0.10));
    g2.addColorStop(1, rgba(theirs, 0));
    ctx.fillStyle = g2; ctx.fillRect(0, hy, W, fy - hy);
  }

  /* Pressure patches. One radial per objective, coloured by who holds it and
     scaled by how contested it is, drawn at the objective's projected position
     so it sits where the fighting is rather than on a grid. */
  if(!objectives.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for(let i=0;i<objectives.length;i++){
    const o = objectives[i];
    const total = o.hold + o.press;
    if(total < 3) continue;                       // nobody is there: nothing to say
    if(!project(wx(o.x), 0.2, wz(o.y), _pc)) continue;
    /* Radius in SCREEN space from the world radius, so a patch shrinks with
       distance like everything else. A fixed screen radius would make the far
       objectives look like the loud ones. */
    const r = (OBJ_R * focal) / _pc[2];
    if(r < 6 || r > W) continue;
    const lead = (o.hold - o.press) / total;      // -1 theirs, +1 ours
    const col = lead >= 0 ? ours : theirs;
    /* Contest is how EVEN it is, not how many are there. Twenty against twenty
       is a battle; twenty against nobody is a car park, and the second one
       should be quiet even though it is busy. */
    const contest = 1 - Math.abs(lead);
    const a = 0.05 + contest * 0.16 + Math.min(0.06, total / 400);
    const gr = ctx.createRadialGradient(_pc[0], _pc[1], 0, _pc[0], _pc[1], r);
    gr.addColorStop(0,   rgba(col, a));
    gr.addColorStop(0.55, rgba(col, a * 0.45));
    gr.addColorStop(1,   rgba(col, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(_pc[0]-r, _pc[1]-r, r*2, r*2);
  }
  ctx.restore();
}
const _pc = [0,0,0];
const OBJ_R = 46;                                 // world units, an objective's reach

/* Screen row of the front line, at the field's centre. The front is a wavering
   band rather than a straight edge, so this takes the middle of it: the wash it
   drives is a hundred pixels tall and a metre of waver is not visible in it. */
function frontScreenY(){
  if(!project(0, 0, wz(CL.front), _pc)) return H;
  return _pc[1];
}

let strokeCalls=0;

/* ── The world under the war ──────────────────────────────────────────────
   The field was a black void with wireframes on it. Every world was the same
   void, which is the strongest possible statement that where you are fighting
   does not matter, and the whole point of the Reach is that it does.

   THIS IS A HORIZON, NOT A BACKDROP IMAGE. The split between sky and ground is
   computed from the camera, so it swings when the camera pitches and the ground
   reads as ground rather than as a painted lower half. Any horizontal ray has
   dy=0, and against the basis this file already builds that lands at
   H/2 + tan(pitch)*focal, which is the whole of the maths.

   VALUE IS CRUSHED ON PURPOSE and the palette tool does it, not this function.
   A sky at the sprite's own luminance is a sky you cannot see a stroked
   wireframe against, and the units losing legibility is a worse outcome than
   the world being slightly darker than orbit suggests. Hue is at full fidelity;
   Ussaleth is red, Zhaal'un is teal, and nothing about that is negotiable by a
   renderer that wants more contrast. */
function paintWorld(){
  const p = PAL || (PAL = paletteFor(RB.colony));
  const hy = H*0.5 + Math.tan(cam.pitch)*focal;
  const skyH = Math.max(0, Math.min(H, hy));

  if(skyH > 0){
    const g = ctx.createLinearGradient(0, Math.min(0, hy - H*1.1), 0, hy);
    g.addColorStop(0,   rgba(p.sky, 1));
    g.addColorStop(0.78, rgba(p.sky, 1));
    g.addColorStop(1,   rgba(p.horizon, 1));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, skyH);
  }
  if(skyH < H){
    /* Ground runs from the horizon's own colour down to the near plane, where
       it is darkest. That direction is not a style choice: distance is haze and
       haze is bright, so a ground that got lighter toward the camera would read
       as a ceiling. */
    const g = ctx.createLinearGradient(0, hy, 0, Math.max(hy + 8, H));
    g.addColorStop(0,    rgba(p.far, 1));
    g.addColorStop(0.35, rgba(p.ground, 1));
    g.addColorStop(1,    rgba(p.ground, 1));
    ctx.fillStyle = g; ctx.fillRect(0, skyH, W, H - skyH);
  }
  /* The horizon line itself, thin and at the world's brightest. Without it the
     two gradients meet in a soft band and the eye reads fog, not a planet. */
  if(hy > -2 && hy < H + 2){
    ctx.fillStyle = rgba(p.edge, 0.30);
    ctx.fillRect(0, hy - 0.6, W, 1.2);
  }
}

/* Distance haze, laid over the terrain and UNDER the units. Far features sink
   toward the horizon colour, which is what makes FIELD_D read as three hundred
   metres rather than as a flat sheet of strokes. Units are deliberately painted
   after it: a man at the far edge of the field still has to be findable. */
function paintHaze(){
  const p = PAL || (PAL = paletteFor(RB.colony));
  const hy = H*0.5 + Math.tan(cam.pitch)*focal;
  if(hy >= H) return;
  const g = ctx.createLinearGradient(0, hy, 0, Math.min(H, hy + H*0.55));
  g.addColorStop(0,   rgba(p.far, 0.72));
  g.addColorStop(0.5, rgba(p.far, 0.26));
  g.addColorStop(1,   rgba(p.far, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, hy), W, Math.min(H, hy + H*0.55) - Math.max(0, hy));
}

function draw(){
  _sprT = performance.now();
  ctx.clearRect(0,0,W,H);
  strokeCalls=0; segCount=0;
  camBasis();
  paintWorld();

  if(showGrid){
    const g=new Path2D();
    const NX=16,NZ=14;
    for(let i=0;i<=NX;i++){ const x=-FIELD_W/2+FIELD_W*i/NX;
      seg(g,x,0,0,x,0,FIELD_D); }
    for(let j=0;j<=NZ;j++){ const z=FIELD_D*j/NZ;
      seg(g,-FIELD_W/2,0,z,FIELD_W/2,0,z); }
    ctx.strokeStyle='rgba(56,64,80,0.34)'; ctx.lineWidth=1; ctx.stroke(g); strokeCalls++;
  }

  /* GROUND. The whole plain first, then the tops of everything standing on it,
     then the holes cut into it. Sides are NOT here: they are vertical, they
     cannot be a horizontal plane pass, and they have to sort against the units,
     so they are pushed into the shared depth list further down. */
  const P = pats();
  SOLID = !!(P && P.base);
  if(SOLID){
    bandPass(P.base, 0, null, false);
    topPasses();
    sinkPasses();
  }

  /* WIREFRAME IS THE FALLBACK NOW, not the look. It draws when the patches have
     not loaded, have failed, or are absent from the build entirely, which is the
     state this repo is in until the tile pack's licence is resolved. Removing
     client/assets/space/terrain breaks nothing except the appearance. */
  if(!SOLID){
    const ter=new Path2D();
    for(let i=0;i<terrain.length;i++) if(terrain[i].kind!=='hive') gPrism(ter,terrain[i]);
    ctx.strokeStyle=(PAL||(PAL=paletteFor(RB.colony))) ? rgba(PAL.rock,0.72)
                  : (TERRAIN_COL[worldTerrain()]||'rgba(92,102,120,0.55)');
    ctx.lineWidth=1; ctx.stroke(ter); strokeCalls++;
  }

  /* Spires BEFORE the haze, so distance eats them the way it eats everything
     else at that depth. Painted after the ground and before the fighting: they
     are the far country, not scenery in front of the line. */
  paintSpires();
  paintHaze();

  /* ── The wireframe scenery is gone ───────────────────────────────────────
     Camps, works, hive settlements and mound domes were all line drawings on a
     field where everything else is now art, and a wireframe building next to a
     pixel-art tank does not read as stylisation, it reads as a placeholder
     somebody forgot. They are removed rather than restyled because there is no
     art for any of them and inventing some would be four more assets to license.

     WHAT THEY WERE FOR IS NOT REMOVED. Camps were how zone control was shown:
     a strip of props that flip as the front moves. That job passes to
     paintControl below, which shows the same thing on the ground itself.

     Their DATA is untouched: camps[], works[], hiveCities[] and mounds[] are
     still generated, still stepped, and the AI still reads them - rushers still
     path to hive settlements, works still bonus the push. Only the drawing
     stopped. The moment there is art for a firebase, one function brings the
     whole thing back.

     Mounds keep their egg clutch, which queueEggs draws. An egg is the only part
     of a spawning mound anyone needed to see.

     gCamp, gWork, gMound and gHiveCity are left defined and unreferenced on
     purpose: deleting them would take their geometry with them, and it is the
     only record of what those things looked like. */

  if(showSlots){
    const sp=new Path2D();
    for(let i=0;i<slots.length;i++){
      const s=slots[i], X=wx(s.x), Z=wz(s.y);
      seg(sp,X-0.8,0.1,Z,X+0.8,0.1,Z);
      if(s.owner>=0) seg(sp,X,0.1,Z-0.8,X,0.1,Z+0.8);
    }
    ctx.strokeStyle='rgba(240,180,84,0.30)'; ctx.stroke(sp); strokeCalls++;
  }

  paintControl();

  // front line on the ground
  const fl=new Path2D();
  const fz=wz(CL.front);
  for(let i=0;i<40;i++){
    const x0=-FIELD_W/2+FIELD_W*i/40, x1=-FIELD_W/2+FIELD_W*(i+1)/40;
    const w0=Math.sin(i*0.7+performance.now()*0.0004)*2.2;
    const w1=Math.sin((i+1)*0.7+performance.now()*0.0004)*2.2;
    seg(fl,x0,0.15,fz+w0,x1,0.15,fz+w1);
  }
  ctx.strokeStyle='rgba(240,180,84,0.34)'; ctx.lineWidth=1.1; ctx.stroke(fl); strokeCalls++;

  /* Depth banding. Everything used to stroke at one alpha regardless of
     distance, which flattened the perspective the renderer had just built.
     Three bands per class, near to far, each its own path and alpha. Costs
     twelve extra stroke calls and nothing else: batching is per path, and
     the band a unit lands in is decided once from its view-space depth. */
  const NB=3, BAND=[70,190];
  const mk=()=>[new Path2D(),new Path2D(),new Path2D()];
  /* pInf/pTank/pHeli/pKnife are gone: they were the Coalition's set, and a
     per-faction allocator makes a named set for one faction a second authority
     on where that faction's geometry goes. What is left here is genuinely not
     per faction - brood classes, which have one faction by definition, and the
     dead, who have no faction that matters at forty percent alpha. */
  const pSpit=mk(),pRush=mk(),pGone=mk(),pFly=mk();
  /* A second faction on the same side needs its own paths, because a path is
     stroked once in one colour. Twelve more Path2D objects and no extra stroke
     work per unit: the band a unit lands in is still decided once. */
  /* AND THERE ARE SIX FACTIONS NOW, NOT TWO. This was a hardcoded second set for
     Jade, so every faction that is not Jade drew in the Coalition's blue the
     moment it dropped past the sprite cutoff - which is precisely the "same unit
     changes faction when it gets far enough away" failure the FAC comment warns
     about, arriving through the fallback instead of through the tables.

     Allocated per faction ON DEMAND rather than up front: a field with one
     faction on each side pays for two sets, not six, and the stroke loop below
     walks what was actually created. */
  const facPaths = Object.create(null);
  function pathsFor(fac){
    var g = facPaths[fac];
    if(!g) g = facPaths[fac] = { inf:mk(), tank:mk(), heli:mk(), knife:mk() };
    return g;
  }
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.y<-0.12||u.y>1.12) continue;
    toView(wx(u.x),u.alt?u.alt+1:1.2,wz(u.y),_p3);
    if(_p3[2]<NEAR) continue;
    const b=_p3[2]<BAND[0]?0:(_p3[2]<BAND[1]?1:2);
    /* Coalition ground goes to the sprite layer when the art is there and the
       figure is big enough on screen to read; everything else, and every
       fallback, stays wireframe. */
    /* Gated on SPRITE_CLS alone this asked the COALITION's table about a brood
       unit, got nothing, and sent every creature to the wireframe branch with
       its sheets sitting decoded and unused. The bench caught it in one glance:
       thirty-one brutes and thirty-eight leapers alive, and not one brood
       animation in the seen list. */
    /* WHICH SHEET PACK A UNIT DRAWS FROM IS ITS FACTION'S QUESTION, and this
       asked its SIDE's. That was the same coincidence as the class table: the
       away side had always been the brood, so `side === -1` meant "creature" by
       accident of there never having been anything else there. An away-side
       polity draws troop sheets, which SPRITE_CLS already routes correctly, and
       the brood test now names the thing it means. */
    if((SPRITE_CLS[u.cls] || (BROOD_SPRITE[u.cls] && isBroodFac(u.fac))) && queueSprite(u)) continue;
    /* The unit's OWN faction picks its path set. `const jd = u.fac === 'jade'`
       was a two-way switch on a six-way fact. */
    const fp = pathsFor(facOf(u));
    if(u.dead>0 && !(u.cls==='heli'&&u.crash)){ gDead(pGone[b],u); }
    else switch(u.cls){
      case 'inf':  gInf(fp.inf[b],u,b); break;
      case 'enf':  gInf(fp.knife[b],u,b); break;
      case 'eng':  gInf(fp.inf[b],u,b); break;
      case 'turret': gTurret(fp.tank[b],u,b); break;
      case 'tank': gTank(fp.tank[b],u,b); break;
      case 'heli': gHeli(fp.heli[b],u,b); break;
      case 'spit': gSpit(pSpit[b],u,b); break;
      /* FALLBACKS, not the look. A brood creature reaches these only when its
         sheet has not decoded yet or is too small on screen to read, and the
         new classes borrow the nearest existing model rather than getting one
         each: a wireframe nobody sees for more than a second is not worth a
         model, and leaving them undrawn would delete them from the field. */
      case 'rush': case 'brute': case 'grub':
                   gRush(pRush[b],u,b); break;
      case 'leap': gRush(pRush[b],u,b); break;
      case 'flyer':case 'wing':
                   gFlyer(pFly[b],u,b); break;
    }
  }

  /* THE BROOD THROWS BARBS, NOT LASER LINES. A spit round was a straight
     segment, which reads as a bolt of energy from a species that has no energy
     weapons anywhere in its design. It is a thrown claw: a curved barb, spun
     end over end along its arc. Built here rather than as a unit model because
     it exists for a few hundred milliseconds and never needs a level of
     detail. */
  function gClaw(path,X,Y,Z,ang,spin){
    const c=Math.cos(spin), sn=Math.sin(spin);
    const L=1.5, w=0.55;
    const hx=Math.cos(ang), hz=Math.sin(ang);
    const px=-hz, pz=hx;
    const P=(t,o)=>[X+hx*t*c-px*o*sn*0.0, Y+o*c*w+t*sn*0.9, Z+hz*t*c-pz*o*sn*0.0];
    const a=P(-L*0.5,0), b=P(L*0.2,0.55), d=P(L*0.5,0);
    seg(path,a[0],a[1],a[2],b[0],b[1],b[2]);
    seg(path,b[0],b[1],b[2],d[0],d[1],d[2]);
    seg(path,a[0],a[1],a[2],d[0],d[1],d[2]);
  }
  const tr=new Path2D(),trH=new Path2D(),sp2=new Path2D();
  for(let i=0;i<PMAX;i++){
    const p=rounds[i]; if(!p.on) continue;
    const k=p.t/p.dur;
    const tail=Math.max(0,k-(p.side===1?(p.heavy?0.14:0.22):0.12));
    const arcA=p.arc?Math.sin(k*Math.PI)*p.arc*90:0;
    const arcB=p.arc?Math.sin(tail*Math.PI)*p.arc*90:0;
    const ax=wx(p.x+(p.tx-p.x)*k), az=wz(p.y+(p.ty-p.y)*k);
    const bx=wx(p.x+(p.tx-p.x)*tail), bz=wz(p.y+(p.ty-p.y)*tail);
    /* A ROUND FIRED AT SOMETHING IN THE AIR HAS TO GO UP. fire() has taken a
       target altitude since it was written and stored it on the round, and
       nothing ever passed one and nothing ever read one: the height ran from
       the shooter's altitude down to the ground and stopped there, so every
       shot at a gunship or a flyer was a tracer skimming the dirt underneath
       it while the thing overhead came apart on its own. Same shape of fault
       as the grenade timer and the preloaded turret sheet: plumbing that
       shipped connected at one end. */
    const ay=1.4+arcA+(p.z?p.z*(1-k):0)+(p.tz?p.tz*k:0);
    const by=1.4+arcB+(p.z?p.z*(1-tail):0)+(p.tz?p.tz*tail:0);
    if(p.side===1){
      if(p.spr) continue;                     // the sheet already drew the shot
      seg(p.heavy?trH:tr,bx,by,bz,ax,ay,az);
    } else {
      /* THE BROOD ROUND IS ART NOW, and the wireframe claw is its fallback. The
         claw was written because a straight segment read as an energy bolt from
         a species that has no energy weapons; the pack ships an actual organic
         round, which says the same thing without being drawn from three
         segments. Queued into the sorted sprite list rather than stroked here,
         so a round passing behind a rock is behind it - which the claw never
         was, because a batched stroke has no depth.

         Large rounds for the heavy shot, small for the rest, matching the two
         projectile sizes the pack ships rather than scaling one of them. */
      if(!queueBroodRound(p, ax, ay, az)) gClaw(sp2,ax,ay,az,Math.atan2(p.tx-p.x,p.ty-p.y),p.t*0.028);
    }
  }

  const jet=new Path2D();
  for(let i=0;i<6;i++) if(JETS[i].on) gJet(jet,JETS[i]);
  for(let i=0;i<64;i++) if(BOMBS[i].on) gBomb(jet,BOMBS[i]);

  const fx=new Path2D(),fh=new Path2D(),fm=new Path2D(),bl=new Path2D();
  for(let i=0;i<200;i++){
    const f=flashes[i]; if(!f.on) continue;
    const life=1-f.t/(f.mel?260:190);
    const r=(f.big?3.2:1.5)*life+0.4, X=wx(f.x), Z=wz(f.y);
    /* fx WAS THE BLUE BULLETS. Friendly muzzle flashes and impacts go into this
       path, and it is stroked pale cyan - the colour of an energy weapon, on an
       army whose sprite sheets draw brass and powder. The tracers were made warm
       two patches ago and this was missed, so the shot was amber and the flash
       at both ends of it was blue. */
    const t=f.mel?fm:(f.side===1?fx:fh);
    seg(t,X-r,0.6,Z,X+r,0.6,Z);
    seg(t,X,0.6-r,Z,X,0.6+r,Z);
    seg(t,X,0.6,Z-r,X,0.6,Z+r);
  }
  for(let i=0;i<40;i++){
    const b=blasts[i]; if(!b.on) continue;
    const k=b.t/620, r=b.r*(0.25+k*0.95), X=wx(b.x), Z=wz(b.y);
    for(let a=0;a<14;a++){                              // shockwave ring
      const a0=a/14*Math.PI*2, a1=(a+1)/14*Math.PI*2;
      seg(bl,X+Math.cos(a0)*r,0.2,Z+Math.sin(a0)*r,
             X+Math.cos(a1)*r,0.2,Z+Math.sin(a1)*r);
    }
    const col=(1-k)*7;
    for(let a=0;a<6;a++){                                // debris column
      const a0=a/6*Math.PI*2;
      seg(bl,X+Math.cos(a0)*1.5,0,Z+Math.sin(a0)*1.5,
             X+Math.cos(a0)*r*0.45,col,Z+Math.sin(a0)*r*0.45);
    }
  }

  {
    ctx.lineWidth=1;
    const FADE=[1,0.62,0.34];
    const band=(paths,r,g2,b2,a)=>{
      for(let k=0;k<NB;k++){
        ctx.strokeStyle=`rgba(${r},${g2},${b2},${(a*FADE[k]).toFixed(3)})`;
        ctx.stroke(paths[k]); strokeCalls++;
      }
    };
    /* Every one of these used to be a literal keyed on side. They read off FAC
       now, so adding a faction is a row in that table rather than a hunt
       through the draw call for hardcoded cyan.
       AND THE LIST IS NO LONGER HAND-WRITTEN EITHER. Two hardcoded blocks meant
       a third faction on the field drew in the first one's colour; the loop
       walks whatever pathsFor actually allocated, so the set of colours stroked
       is exactly the set of factions present. */
    const K=FAC.khai;
    for(var fk in facPaths){
      var FC = FAC[fk], gp = facPaths[fk];
      band(gp.inf  , FC.line[0], FC.line[1], FC.line[2],  0.85);
      band(gp.tank , FC.heavy[0],FC.heavy[1],FC.heavy[2], 0.95);
      band(gp.heli , FC.air[0],  FC.air[1],  FC.air[2],   0.90);
      band(gp.knife, FC.blade[0],FC.blade[1],FC.blade[2], 0.92);
    }
    band(pSpit, K.line[0],K.line[1],K.line[2], 0.88);
    band(pRush, K.heavy[0],K.heavy[1],K.heavy[2], 0.95);
    band(pFly , K.air[0],K.air[1],K.air[2], 0.92);
    band(pGone,90,98,112,0.58);
    /* GUNFIRE IS WARM. The Coalition tracer was a cyan line, which is the
       colour of an energy weapon, and the Coalition does not have one: the
       sprite sheets draw brass and muzzle flash. The sprite units no longer
       draw a tracer at all, so what is left here is the tank and the gunship,
       and those need to read as a shell and a cannon burst rather than as a
       laser. Hot core, warmer body, same shape. */
    ctx.lineWidth=1.1;
    ctx.strokeStyle='rgba(255,214,138,0.80)'; ctx.stroke(tr);    strokeCalls++;
    ctx.lineWidth=2.4;
    ctx.strokeStyle='rgba(255,176,72,0.55)';  ctx.stroke(trH);   strokeCalls++;
    ctx.lineWidth=1.0;
    ctx.strokeStyle='rgba(255,246,214,0.95)'; ctx.stroke(trH);   strokeCalls++;
    ctx.lineWidth=1.1;
    ctx.strokeStyle='rgba(255,140,70,0.88)';  ctx.stroke(sp2);   strokeCalls++;
    ctx.lineWidth=1;
    ctx.strokeStyle='rgba(255,226,168,0.62)'; ctx.stroke(fx);    strokeCalls++;
    ctx.strokeStyle='rgba(255,120,60,0.62)';  ctx.stroke(fh);    strokeCalls++;
    ctx.strokeStyle='rgba(255,196,120,0.82)'; ctx.stroke(fm);    strokeCalls++;
    ctx.lineWidth=1.4;
    ctx.strokeStyle='rgba(255,214,150,0.75)'; ctx.stroke(bl);    strokeCalls++;
    ctx.lineWidth=1.5;
    ctx.strokeStyle='rgba(214,255,252,0.96)'; ctx.stroke(jet);   strokeCalls++;
  }

  /* Sprites last. They are opaque, so a wireframe behind one is covered and a
     wireframe in front of one is not, which is the wrong way round for a tank
     standing between the camera and a rifleman. It is tolerable only because
     the wireframes are line art with nothing to occlude: you see the tank's
     edges through the man rather than the man through a solid tank. Fixing it
     properly means one sorted list for both, which means giving up the batched
     stroking that makes seven hundred wireframes cheap. Not worth it for a
     handful of frames a minute where the two overlap. */
  drawSprites();
}

/* ── camera control ───────────────────────────────────────────────────── */
const keys={};
window.addEventListener('keydown',e=>{
  if(!RB.open) return;
  if(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName)) return;
  keys[e.key.toLowerCase()]=1;
  if(e.key==='1') setCam('orbit');
  if(e.key==='2') setCam('follow');
  if(e.key==='3') setCam('free');
  if(e.key==='4') setCam('cine');
});
window.addEventListener('keyup',e=>{ if(!RB.open) return; keys[e.key.toLowerCase()]=0; });

let drag=false,lx=0,ly=0;
// Deferred: this module is lazy loaded and the overlay canvas is not
// guaranteed to be in the document at load time. Binding at parse time threw
// on a null canvas and took the whole module with it.
function bindCanvas(){
  if(!cv) cv=document.getElementById('rbCanvas');
  if(!cv || cv.__rbBound) return false;
  ctx = cv.getContext('2d');
  cv.__rbBound = 1;
  cv.addEventListener('pointerdown',e=>{ drag=true; lx=e.clientX; ly=e.clientY;
    /* GRABBING THE VIEW TAKES THE VIEW. Cinematic is the right default for a
       stream and the wrong thing to be trapped in: it cuts to its own hotspots
       and ignores the drag entirely, so pulling on the canvas did nothing and
       the camera read as fixed. A drag hands control over. */
    if(cam.mode==='cine'||cam.mode==='follow') setCam('orbit');
    cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup',e=>{ drag=false; cv.classList.remove('drag'); });
  cv.addEventListener('pointermove',e=>{
    if(!drag) return;
    const dx=e.clientX-lx, dy=e.clientY-ly; lx=e.clientX; ly=e.clientY;
    /* Yaw is unbounded, so the orbit goes all the way round; height runs from
       below the dust line to high above it. The sprites are single facing and
       mirror on the flank test, so looking down the axis of advance shows a
       profile where a front or a back belongs. That is a real limitation of
       the art rather than of the camera, and it is better to let somebody look
       and see it than to lock them out of half the field. */
    if(cam.mode==='orbit'){ cam.orbA-=dx*0.005; cam.orbH=Math.max(-24,Math.min(260,cam.orbH-dy*0.6)); }
    else { cam.yaw-=dx*0.004; cam.pitch=Math.max(-1.4,Math.min(1.0,cam.pitch-dy*0.004)); }
  });
  cv.addEventListener('wheel',e=>{
    e.preventDefault();
    const d=Math.sign(e.deltaY);
    if(cam.mode==='orbit') cam.orbR=Math.max(24,Math.min(420,cam.orbR+d*14));
    else { cam.x+=F[0]*-d*10; cam.y+=F[1]*-d*10; cam.z+=F[2]*-d*10; }
  },{passive:false});
  return true;
}

function setCam(m){
  cam.mode=m;
  // The mockup had four camera buttons in its harness. The viewer has none, so
  // every one of these lookups returns null and .classList throws.
  for(const id of ['camOrbit','camFollow','camFree','camCine']){
    const b=document.getElementById(id); if(b) b.classList.remove('on');
  }
  const _cb = document.getElementById(
    m==='orbit'?'camOrbit':m==='follow'?'camFollow':m==='free'?'camFree':'camCine');
  if(_cb) _cb.classList.add('on');
  const _hc = document.getElementById('hCam');
  if(_hc) _hc.textContent =
    m==='orbit' ? 'orbit, drag to swing, scroll to dolly'
    : m==='follow' ? 'follow, locked behind the line'
    : m==='free' ? 'free, WASD to move, drag to look'
    : 'cinematic, cutting to contact';
}

/* Orbit and follow are geometric: neither knows where anything interesting
   is. Cinematic tracks hotspots (a shell that just landed, a knot of melee)
   and cuts between them. This is the mode you leave running on a stream. */
const cine={t:0,x:0,z:0,a:0,r:46,h:14,hold:0};
function pickHotspot(){
  for(let i=0;i<64;i++){
    const b=BOMBS[i];
    if(b.on&&b.alt<40) return [wx(b.x),wz(b.y),74];
  }
  for(let i=0;i<40;i++){
    const b=blasts[(bHead+i)%40];
    if(b.on&&b.t<260) return [wx(b.x),wz(b.y),58];
  }
  let mx=0,mz=0,n=0;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(MELEE_CLS[u.cls]&&u.mel>=0&&u.dead<=0){ mx+=wx(u.x); mz+=wz(u.y); n++; if(n>26) break; }
  }
  if(n>3) return [mx/n,mz/n,42];
  let bx=0,bz=0,c=0;
  for(let i=0;i<units.length;i++){
    const u=units[i];
    if(u.dead<=0&&u.st===S_HOLD&&u.side===1){ bx+=wx(u.x); bz+=wz(u.y); c++; if(c>40) break; }
  }
  return c>4 ? [bx/c,bz/c,60] : [0,wz(CL.front),90];
}

function stepCam(dt){
  const fzw=wz(CL.front);
  if(cam.mode==='cine'){
    cine.hold-=dt;
    if(cine.hold<=0){
      const [hx,hz,r]=pickHotspot();
      cine.x=hx; cine.z=hz; cine.r=r*(0.8+Math.random()*0.5);
      /* A FLANK, NOT A RANDOM YAW. The Coalition line is drawn from profile
         art, and profile art is only correct when the camera is roughly square
         to the axis of advance. Looking up or down the line needs the six
         rotations the pack does not have. Picking one of the two flanks with a
         little jitter keeps every sprite in a pose it actually has, and it is
         how you would frame a line of infantry deliberately anyway. */
      cine.a=(Math.random()<0.5?1:-1)*(Math.PI*0.5)+(Math.random()-0.5)*0.7;
      cine.h=8+Math.random()*26;
      cine.hold=5200+Math.random()*4200;
    }
    cine.a+=dt*0.00011;
    const tx=cine.x+Math.sin(cine.a)*cine.r;
    const tz=cine.z-Math.cos(cine.a)*cine.r;
    cam.x+=(tx-cam.x)*0.05; cam.z+=(tz-cam.z)*0.05; cam.y+=(cine.h-cam.y)*0.04;
    const dx=cine.x-cam.x, dy=2.5-cam.y, dz=cine.z-cam.z;
    cam.yaw=Math.atan2(dx,dz);
    cam.pitch=Math.atan2(dy,Math.hypot(dx,dz));
    return;
  }
  if(cam.mode==='orbit'){
    cam.orbA+=dt*0.00004;
    cam.x=Math.sin(cam.orbA)*cam.orbR;
    cam.z=fzw-Math.cos(cam.orbA)*cam.orbR;
    cam.y=cam.orbH;
    const dx=0-cam.x, dy=2-cam.y, dz=fzw-cam.z;
    cam.yaw=Math.atan2(dx,dz);
    cam.pitch=Math.atan2(dy,Math.hypot(dx,dz));
  }else if(cam.mode==='follow'){
    const tz=fzw-88, ty=34;
    cam.x+=(0-cam.x)*0.03; cam.z+=(tz-cam.z)*0.03; cam.y+=(ty-cam.y)*0.03;
    const dx=0-cam.x, dy=2-cam.y, dz=fzw-cam.z;
    cam.yaw=Math.atan2(dx,dz);
    cam.pitch=Math.atan2(dy,Math.hypot(dx,dz));
  }else{
    const v=dt*0.06*(keys['shift']?3:1);
    camBasis();
    if(keys['w']){ cam.x+=F[0]*v; cam.y+=F[1]*v; cam.z+=F[2]*v; }
    if(keys['s']){ cam.x-=F[0]*v; cam.y-=F[1]*v; cam.z-=F[2]*v; }
    if(keys['a']){ cam.x-=R[0]*v; cam.z-=R[2]*v; }
    if(keys['d']){ cam.x+=R[0]*v; cam.z+=R[2]*v; }
    if(keys['q']) cam.y-=v;
    if(keys['e']) cam.y+=v;
    cam.y=Math.max(1.5,cam.y);
  }
}


// ── public entry ──────────────────────────────────────────────────────────
// Called from the surface panel. Seeds deterministically off the colony id and
// zone index so every client watching the same engagement sees the same ground.
function seedFor(colonyId, zoneIdx){
  var h = 2166136261;
  var str = colonyId + ':' + String(zoneIdx);
  for (var i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function worldIndexFor(colonyId){
  for (var i=0;i<WORLDS.length;i++) if (WORLDS[i].id === colonyId) return i;
  return 0;
}

/* The funding readout. Built lazily rather than added to index.html: this is
   the only thing that reads it, and a node created here cannot drift out of
   sync with the markup that was supposed to contain it. */
function rbPaintFunding(){
  var sub = document.getElementById('rbSub');
  if (!sub || !sub.parentNode) return;
  var el = document.getElementById('rbFund');
  if (!el){
    el = document.createElement('div');
    el.id = 'rbFund';
    el.style.cssText = 'font-size:.6rem;letter-spacing:.12em;margin-top:2px;'
      + "font-family:'Courier New',monospace";
    sub.parentNode.appendChild(el);
  }
  if (RB.mode !== 'battle'){ el.textContent = ''; return; }
  var pct = Math.round(FORCE.fundRatio*100);
  var col = FORCE.fundRatio >= 1 ? '#4ecdc4' : FORCE.fundRatio > 0 ? '#f0b454' : '#4a4842';
  el.style.color = col;
  if (!FORCE.target){
    el.textContent = 'NO PUSH FUNDED \u00b7 ' + armyName() + ' AT BASELINE STRENGTH';
    return;
  }
  /* WHAT A LINE ON THIS STRIP HAS TO EARN is a change in what somebody does in
     the next five minutes. Money in, money needed and the funder count all
     pass, and the funder count passes hardest: it is the one number that can
     tell a player the missing input is their own attendance rather than their
     credits, which is the whole reason PUSH_MIN_FUNDERS exists.

     THE FIELD SHARE LINE IS GONE. coalFrac is a rendering ratio that decides
     how many wireframes get drawn, and putting it on a player strip invited
     people to read the field as a casualty count. It is a picture, and the
     picture must not be quoted back as a statistic. */
  var txt = (FORCE.windowOpen ? 'PUSH FUNDED ' : 'LAST PUSH ')
    + 'ƒ' + Number(FORCE.pool).toLocaleString()
    + ' / ƒ' + Number(FORCE.target).toLocaleString()
    + '  ·  ' + pct + '%  ·  ' + FORCE.funders + ' funder' + (FORCE.funders===1?'':'s');
  if (FORCE.minFunders)
    txt += ' of ' + FORCE.minFunders;
  if (FORCE.closesAt && FORCE.windowOpen){
    var left = Math.max(0, FORCE.closesAt - Date.now());
    txt += '  ·  ' + (left >= 3600000
      ? Math.floor(left/3600000) + 'h ' + Math.floor((left%3600000)/60000) + 'm'
      : Math.floor(left/60000) + 'm ' + Math.floor((left%60000)/1000) + 's') + ' LEFT';
  }
  el.textContent = txt;

  /* A player arriving between windows saw an idle bar and nothing else. The
     server has been writing a plain sentence into win.outcome since windows
     shipped and nothing has ever displayed it. */
  var out = document.getElementById('rbOutcome');
  if (!out){
    out = document.createElement('div');
    out.id = 'rbOutcome';
    out.style.cssText = 'font-size:.58rem;letter-spacing:.06em;margin-top:2px;'
      + 'color:#8f8d84;font-family:\'Courier New\',monospace';
    el.parentNode.appendChild(out);
  }
  out.textContent = (!FORCE.windowOpen && FORCE.outcome) ? FORCE.outcome : '';
}

window.reachWatch = function(colonyId, zoneIdx){
  var R = (window._REACH && window._REACH.worlds && window._REACH.worlds[colonyId]) || null;
  var z = R && R.zones && R.zones[zoneIdx];
  if (!z || !z.live) return;            // quiet zones are not watchable
  /* AND NO FRONT MEANS NO BATTLE, which is a stronger statement than "no live
     zone" and is the one the GM actually makes. A zone carries its own live
     flag and a world carries the front, and until setFront started lighting and
     quieting zones those two could disagree - which is exactly how a war nobody
     had declared was running underneath a quiet map. They agree now, and this
     is here so that a future path that lights a zone without opening a front
     cannot put a battle on screen behind the GM's back. */
  if (!R.front) return;

  var host = document.getElementById('reachBattle');
  if (!host) return;
  host.style.display = 'block';
  RB.open = true; RB.mode = 'battle'; RB.colony = colonyId; RB.zone = zoneIdx;

  document.getElementById('rbTitle').textContent = z.name.toUpperCase();
  document.getElementById('rbSub').textContent =
    (WORLDS[worldIndexFor(colonyId)] || {tag:colonyId}).tag + ' \u00b7 ' +
    terrainKey(colonyId).toUpperCase();

  worldIdx = worldIndexFor(colonyId);
  /* The world's palette is resolved once per engagement, not per frame, and the
     TINTED PATTERNS HAVE TO GO WITH IT. Dropping only PAL left the ground and
     the feature tops holding the previous world's tint while the sides, which
     read PAL live, took the new one: opening Nikkathaal after Ussaleth gave an
     ice world grey cliffs standing on red desert. Two caches for one fact means
     both are cleared in the same place, always. */
  PAL = paletteFor(colonyId); PATS = null;
  loadMeshes();
  if(window.FMTroops && window.FMTroops.loadBrood) window.FMTroops.loadBrood();
  // Intensity drives how loud it looks; control drives where the line sits.
  /* ZERO IS A REAL READING ON BOTH OF THESE and `||` cannot tell it from an
     absent field. A zone at hive 0 - every hive-held metre taken, which is the
     entire point of the layer - fell through to the 50 default and drew its line
     at midfield, i.e. the picture said the fight was even on ground that had
     just been cleared. The server relights a cleared zone at 100 so this is
     usually stepped over rather than seen, and a defect you only see when a
     player is winning hardest is still a defect. Same for a zone the GM has
     quieted to intensity 0. */
  const zi = typeof z.intensity === 'number' ? z.intensity : 50;
  const zh = typeof z.hive      === 'number' ? z.hive      : 50;
  SV.vol = Math.max(0.05, Math.min(1, zi/100));
  CL.vol = SV.vol;
  /* ── The line does not go all the way to the wall any more ───────────────
     THE FRONT MAPPED HIVE PERCENT ONTO 0.05-0.95, and at the top of that range
     there is no field left to stand in. A zone opens at hive 100, so front
     opened at 0.95, so roomK had 0.03 of depth to scale 0.455 of offsets into
     and the ENTIRE HOME LINE OCCUPIED 0.011 OF THE FIELD - seven hundred men in
     a stripe one percent deep. That is the huddle.

     Mapped onto 0.20-0.80 instead. The worst case goes from 0.011 to 0.121, an
     eleven-fold difference, and the line still travels 0.60 of the field across
     a whole war - more than enough to read who is winning at a glance, which is
     the property this mapping exists to preserve and the reason it is not simply
     pinned to midfield. A front that never moves is a picture that has stopped
     reporting anything.

     STILL A PURE FUNCTION OF z.hive AND STILL MONOTONIC. Every camp, every
     ownership test and the whole advance rule read this, so what matters is that
     more hive control still means a front further back, without exception. */
  CL.front = frontFor(zh);
  SV.front = CL.front;
  WORLDS[worldIdx].hive = CL.front;
  CL.seed = seedFor(colonyId, zoneIdx);
  cap = 700;
  FORCE = forcesFor(z);
  rbPaintFunding();

  // Start decoding the troop sheets the moment an engagement opens. Nothing
  // else in this file loads an image, and until they are decoded every
  // Coalition unit falls back to wireframe rather than vanishing.
  if(window.FMTroops) window.FMTroops.preload();
  bindCanvas();
  resize();
  seedField();
  setCam('cine');

  if (RB.raf) cancelAnimationFrame(RB.raf);
  var last = performance.now(), acc = 0, frames = 0;
  (function loop(now){
    if (!RB.open) return;
    var dt = Math.min(64, now - last); last = now;
    frames++; acc += dt;
    if (acc > 500){
      var f = Math.round(frames*1000/acc); frames = 0; acc = 0;
      /* FPS, UNIT COUNT, COVER COUNT AND CAMPS HELD ARE FRAME DIAGNOSTICS
         wearing a player's clothes. Two of them describe the renderer and the
         other two describe a simulation this file states outright is a picture.
         None of them answers a question a player has. They stay, because the
         first phone that stutters will want them back, but they stay behind the
         debug flag that already exists for exactly this. */
      var el = document.getElementById('rbStat');
      if (el) el.textContent = (window._fmReachStats
        ? f + ' fps \u00b7 ' + units.length + ' units \u00b7 '
          + Math.round(coverCount) + ' in cover \u00b7 '
          + campsHeld(1) + '/' + CAMP_N + ' camps held'
        : '');
    }
    /* PAUSE AND SINGLE STEP, FOR THE BENCH ONLY. The camera keeps running while
       the sim is held, which is deliberate and is most of the value: a frozen
       field you can orbit is how you check whether a fireteam is actually behind
       the rock it claimed, and a frozen field you cannot move around is a
       screenshot. _rbStep is a countdown of frames to run before holding again.

       Nothing in the client can set these. reachWatch never touches them and the
       god panel has no path to them, so a shipped build runs the branch that was
       always there with a flag that is always zero. */
    if (!_rbHold || _rbStep > 0){
      if (_rbHold) _rbStep--;
      stepField(dt);
    }
    stepCam(dt); draw();
    RB.raf = requestAnimationFrame(loop);
  })(last);

  // Re-read the zone from live state rather than drifting on its own.
  if (RB.tickIv) clearInterval(RB.tickIv);
  RB.tickIv = setInterval(function(){
    var S = (window._REACH && window._REACH.worlds && window._REACH.worlds[RB.colony]) || null;
    var Z = S && S.zones && S.zones[RB.zone];
    if (!Z || !Z.live) { window.reachWatchClose(); return; }
    CL.front = frontFor(Z.hive);
    CL.vol   = Math.max(0.05, Math.min(1, (Z.intensity||50)/100));
    // Funding moves while you watch. Re-derive, retune the composition so the
    // NEXT arrivals reflect what has been paid, and walk the count toward it.
    FORCE = forcesFor(Z);
    applyWorks(S);
    applyFunding(FORCE.fundRatio);
    applyGarrison();
    reinforceToward(Math.round(cap * FORCE.coalFrac));
    rbPaintFunding();
  }, 2000);
};

// SURVEY MODE. The same ground and the same settlement, with no war on it.
// A brood world has no city view because it has no city, and until now that
// meant opening one showed nothing at all. This is what is actually there: the
// hive works, drawn in the brood's own colour, on the world's own terrain.
//
// It reuses the battlefield's geometry rather than duplicating it, because the
// hive a player surveys and the hive they fight through have to be the same
// hive or the two views quietly disagree.
window.reachSurvey = function(colonyId){
  var host = document.getElementById('reachBattle');
  if (!host) return;
  host.style.display = 'block';
  RB.open = true; RB.mode = 'survey'; RB.colony = colonyId; RB.zone = -1;

  var wi = worldIndexFor(colonyId);
  PAL = paletteFor(colonyId); PATS = null;
  loadMeshes();
  if(window.FMTroops && window.FMTroops.loadBrood) window.FMTroops.loadBrood();
  var R = (window._REACH && window._REACH.worlds && window._REACH.worlds[colonyId]) || null;
  var named = R && R.revealed;
  document.getElementById('rbTitle').textContent =
    (named ? 'HIVE WORKS' : 'UNSURVEYED SETTLEMENT');
  document.getElementById('rbSub').textContent =
    (WORLDS[wi] || {tag:colonyId}).tag + ' \u00b7 ' +
    terrainKey(colonyId).toUpperCase() + ' \u00b7 SURVEY';
  // Survey mode has no war on it, so it has no funding readout either. Left
  // painted, the last engagement's numbers would sit over a peaceful hive.
  rbPaintFunding();

  worldIdx = wi;
  // How much the brood holds drives how many works stand. A world nearly taken
  // has one holdout mound; an untouched one is dense with them.
  WORLDS[worldIdx].hive = R ? Math.max(0.05, Math.min(1, (R.hive||100)/100)) : 1;
  CL.front = 0.02;            // the line is off the map: nothing is contested here
  CL.vol = 0;
  CL.seed = seedFor(colonyId, 'survey');
  cap = 0;                    // no units at all

  bindCanvas();
  resize();
  seedField();
  setCam('orbit');
  cam.orbR = 210; cam.orbH = 58;

  if (RB.raf) cancelAnimationFrame(RB.raf);
  var last = performance.now();
  (function loop(now){
    if (!RB.open) return;
    var dt = Math.min(64, now - last); last = now;
    stepCam(dt); draw();
    var el = document.getElementById('rbStat');
    if (el) el.textContent = hiveCities.length + ' hive works \u00b7 '
      + terrain.filter(function(t){ return t.kind!=='hive'; }).length + ' features \u00b7 unarmed survey';
    RB.raf = requestAnimationFrame(loop);
  })(last);
};

/* Inspection hook for the standalone harness. Reclassifying live units is not
   a thing the game ever does, so this is deliberately not reachable from the
   client: it exists so a line of one class can be judged on its own while the
   models are being worked on. */
/* The Jade commitment dial. Writing it retunes the NEXT arrivals rather than
   repainting the field, so the line turns over across a reinforcement cycle the
   way funding already does. */
window.reachJade = function(frac, forward){
  jadeFrac = Math.max(0, Math.min(1, Number(frac)||0));
  if (forward !== undefined) jadeForward = forward ? 1 : 0;
  return { jadeFrac: jadeFrac, jadeForward: jadeForward };
};

window._fmReachDebug = {
  forceCoalClass: function(cls){
    for (var i=0;i<units.length;i++){
      var u=units[i];
      if (u.side!==1 || u.dead) continue;
      u.cls=cls; u.hp=HP[cls]; u.hpMax=HP[cls]; u.alt=0;
    }
  },
  anims: function(){ return _animSeen; },
  /* Facing churn, for the bench. The complaint this measures is "men turn
     around at random", so what it reports is how far a heading MOVED between two
     samples - not where it points. A line facing the enemy has a low median
     here; a line re-acquiring random targets does not. */
  /* AIM QUALITY, which is the thing the complaint is actually about. Heading
     churn turned out not to separate the two implementations - most units are
     bounding and their facing follows their movement either way - so what this
     measures is whether the man is shooting at the enemy who is ACTUALLY
     nearest. A random sample of twenty-six out of seven hundred usually is not,
     and each new wrong answer is a turn. */
  aimQuality: function(){
    var n=0, exact=0, sum=0, far=0;
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0 || u.aim<0) continue;
      var v=units[u.aim];
      if(!v || v.dead>0) continue;
      var best=-1, bd=1e9;
      for(var k=0;k<units.length;k++){
        var w=units[k];
        if(!w||w.side===u.side||w.dead>0||w.doomed) continue;
        var dx=w.x-u.x, dy=(w.y-u.y)*0.5, d=dx*dx+dy*dy;
        if(d<bd){bd=d;best=k;}
      }
      if(best<0) continue;
      var dx2=v.x-u.x, dy2=(v.y-u.y)*0.5;
      var have=Math.sqrt(dx2*dx2+dy2*dy2), want=Math.sqrt(bd);
      n++; if(best===u.aim) exact++;
      var r = want>1e-6 ? have/want : 1;
      sum+=r; if(r>3) far++;
    }
    return { targets:n, exactNearest:n?+(exact/n).toFixed(3):0,
             meanDistanceRatio:n?+(sum/n).toFixed(2):0,
             overThreeTimesTooFar:n?+(far/n).toFixed(3):0 };
  },
  hdgSample: function(){
    var out = [];
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0) continue;
      out.push([u.i, u.hdg, u.aim]);
    }
    return out;
  },
  /* Live counts for the bench. Read-only and derived, so it can be polled at
     whatever rate a panel likes without perturbing anything it is measuring. */
  counts: function(){
    var by = {}, alive = 0;
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0) continue;
      alive++;
      by[u.cls] = (by[u.cls]||0) + 1;
    }
    by.alive = alive;
    by.dead = units.length - alive;
    by.mounds = mounds.length;
    /* Flora drawn vs flora generated, which is the number the face budget makes
       interesting: it is the count that falls as a world's props get dearer, and
       it is invisible from the screenshot because the ones dropped are the ones
       furthest away. */
    by.flora = flora.length;
    by.floraDrawn = _floraSort.length;
    by.works = works.length;
    by.objectives = objectives.length;
    by.meshes = MESHES ? Object.keys(MESHES).length : 0;
    by.solid = SOLID ? 1 : 0;
    return by;
  },
  /* Faction mix on the field. The bench's Coalition toggle is exactly the kind
     of control whose effect is easy to assert and hard to see, so it gets a
     number rather than only a screenshot. */
  /* WHO IS ON WHICH SIDE, which is the readout the "shield enemies joined the
     attacking line" report needed and nobody had. facMix counts factions and
     says nothing about sides, so a faction standing on the wrong half of the
     field looks exactly like a faction standing on the right one. */
  sides: function(){
    var o={home:{},away:{},crossed:0};
    var R=(ROSTER||{home:[],away:[]});
    var onHome={}, onAway={};
    (R.home||[]).forEach(function(e){ onHome[e.fac]=1; });
    (R.away||[]).forEach(function(e){ onAway[e.fac]=1; });
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0) continue;
      var k=u.side===1?'home':'away', f=facOf(u);
      o[k][f]=(o[k][f]||0)+1;
      /* A unit whose faction is not on the roster for the side it is standing
         on. Reinforcement draws from the live roster, so this should be zero
         once the men seeded before a roster change have died off. */
      if(u.side===1 ? !onHome[f] : !onAway[f]) o.crossed++;
    }
    o.roster={home:Object.keys(onHome),away:Object.keys(onAway)};
    return o;
  },
  facMix: function(){
    var o = { jade:0, coal:0, khai:0 };
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0) continue;
      var f=facOf(u);
      if(o[f]===undefined) o[f]=0;
      o[f]++;
    }
    return o;
  },
  /* HOW MANY LIVE UNITS ARE STANDING INSIDE SOLID TERRAIN. The collision pass
     runs once per frame after the whole unit loop, and its correctness is
     invisible: a body half inside a rock at field size looks like a body beside
     a rock. This counts them, so the bench can show a number that should be
     zero and is the only way to see the pass working from outside it. */
  stuck: function(){
    var n=0;
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0 || u.alt>0) continue;
      var col = terGrid && terGrid[terCell(u.x)];
      if(!col) continue;
      for(var k=0;k<col.length;k++){
        var f=terrain[col[k]];
        var dx=(u.x-f.cx)/(f.w*0.5), dy=(u.y-f.cy)/(f.h*0.5);
        if(dx*dx+dy*dy < 0.94){ n++; break; }   // inside the hull, past the pad
      }
    }
    return n;
  },
  /* THE DEEPEST AND SHALLOWEST LIVE UNIT ON EACH SIDE. The tanks used to reverse
     off the map at front 0.95 and keep firing from behind the camera, which was
     invisible precisely because they were off screen. Anything outside 0..1 here
     is that bug back. */
  depth: function(){
    var o={front:+CL.front.toFixed(3), home:[1,0], away:[1,0], off:0};
    for(var i=0;i<units.length;i++){
      var u=units[i];
      if(u.dead>0) continue;
      var k=u.side===1?'home':'away';
      if(u.y<o[k][0]) o[k][0]=+u.y.toFixed(3);
      if(u.y>o[k][1]) o[k][1]=+u.y.toFixed(3);
      if(u.y<0||u.y>1) o.off++;
    }
    return o;
  },
  /* ── Running the simulation slowly, or not at all ──────────────────────
     THE AI IS THE HARDEST THING IN THIS FILE TO JUDGE AND THE EASIEST TO
     MISJUDGE. Bounding overwatch, cover claiming, suppression and target
     acquisition all resolve faster than a person can follow at full tempo, so
     what a reviewer actually reports is an IMPRESSION of the aggregate - "the
     line looks static", "men turn around at random" - and those impressions
     have been wrong here before in both directions. Heading churn was measured
     and turned out not to separate two implementations at all.

     Slowing it down is not a nicety. At a fifth speed a bound is a man walking
     to a rock, and either he arrives at one on his own side of it or he does
     not. */
  tempo: function(v){
    if (v !== undefined) TEMPO = Math.max(0.01, Math.min(2, Number(v)||0.01));
    return { tempo:+TEMPO.toFixed(3), base:TEMPO_BASE, hold:!!_rbHold };
  },
  pause: function(on){
    _rbHold = on === undefined ? (_rbHold ? 0 : 1) : (on ? 1 : 0);
    if (!_rbHold) _rbStep = 0;
    return !!_rbHold;
  },
  /* Advance a held simulation by n frames. The camera never stops, so this is a
     way to walk one exchange forward and look at it from three angles. */
  step: function(n){ _rbHold = 1; _rbStep = Math.max(1, n|0 || 1); return _rbStep; },

  /* THE FRAME COUNTERS, WHICH HAVE EXISTED SINCE THE BOUNDING WORK AND HAVE
     NEVER BEEN READABLE FROM OUTSIDE THIS FILE. stepField writes all of them
     every frame and exactly one - coverCount - reaches a human, through the fps
     line, behind a debug flag. The other six describe the AI: how much of the
     line is moving, how much is pinned, how much is in contact.

     `bound` is the one worth watching. The comment on that block claims about a
     third of the line is moving at any moment; measured, it was eleven percent,
     and the fix for that was tuning a phase window against a number nobody could
     see. This is that number. */
  field: function(){
    var live=0, home=0, away=0;
    for(var i=0;i<units.length;i++){ var u=units[i];
      if(u.dead>0) continue; live++; if(u.side===1) home++; else away++; }
    return { live:live, home:home, away:away,
             bound:boundCount, cover:coverCount, supp:supCount,
             melee:meleeCount, air:airCount, shield:shieldCount,
             /* CUMULATIVE SINCE THE MODULE LOADED, not per frame. stepField
                zeroes the other six at the top of every pass and deliberately
                does not zero this one, so a caller wanting a RATE has to
                difference it. Said here because a field called `kills` sitting
                beside six per-frame counters reads as per-frame and is not. */
             kills:localKills,
             boundPct: live ? +(boundCount/live*100).toFixed(1) : 0,
             coverPct: live ? +(coverCount/live*100).toFixed(1) : 0 };
  },
  /* Cover supply against cover demand, which is the pressure the whole bounding
     model sits under. Sixty positions contested by two hundred and thirty units
     is what collapsed the line onto a few rocks and is why terCount went up. */
  slots: function(){
    var total=slots.length, taken=0, heavy=0, heavyTaken=0;
    for(var i=0;i<slots.length;i++){
      if(slots[i].heavy) heavy++;
      if(slots[i].owner>=0){ taken++; if(slots[i].heavy) heavyTaken++; }
    }
    return { total:total, taken:taken, heavy:heavy, heavyTaken:heavyTaken,
             pct: total ? +(taken/total*100).toFixed(1) : 0 };
  },
  /* What the ground is made of, by kind, and how much of it blocks. The
     collision rule is keyed on kind rather than on map precisely so that it
     covers all seven terrains out of one table, and this is how you check that
     claim on a terrain rather than trusting it. */
  terrain: function(){
    var byKind={}, blocking=0;
    for(var i=0;i<terrain.length;i++){
      var f=terrain[i];
      byKind[f.kind]=(byKind[f.kind]||0)+1;
      if(blocksMove(f)) blocking++;
    }
    return { features:terrain.length, blocking:blocking, kinds:byKind,
             objectives:objectives.length };
  },
  /* Reclassify the AWAY line, the mirror of forceCoalClass. It only ever had
     the home one, which was fine while the away side was always creatures and
     is not now: judging whether an away polity's shield troopers hold a line
     correctly means being able to make them all shield troopers. */
  forceAwayClass: function(cls){
    for (var i=0;i<units.length;i++){
      var u=units[i];
      if (u.side!==-1 || u.dead) continue;
      u.cls=cls; u.hp=HP[cls]; u.hpMax=HP[cls];
      u.alt = (cls==='wing'||cls==='flyer') ? 14 : 0;
    }
  },
  nades: function(){ var n=0; for(var i=0;i<NADE_MAX;i++) if(NADES[i].on) n++; return n; },
  built: function(){ var b=0; for(var i=0;i<units.length;i++) if(units[i].built) b+=units[i].built; return b; },
  camps: function(){
    return camps.map(function(c){
      return { y:+c.y.toFixed(3), owner:campOwner(c)===1?homeFac():'hive', flash:c.flash>0 };
    });
  },
  campsHeld: function(){ return campsHeld(1); },
  states: function(){
    var o={};
    for (var i=0;i<units.length;i++){ var u=units[i];
      if(u.dead||u.side!==1) continue;
      var k=u.cls; o[k]=o[k]||{n:0,bound:0,hold:0,supp:0,slot:0,fired:0,aim:0};
      o[k].n++;
      if(u.st===1) o[k].bound++; else if(u.st===0) o[k].hold++; else if(u.st===2) o[k].supp++;
      if(u.slot>=0) o[k].slot++;
      if(u.aim>=0) o[k].aim++;
    }
    return o;
  },
  probe: function(){
    var dead=0, liveC=0;
    for (var i=0;i<units.length;i++){ var u=units[i];
      if(u.dead) dead++; else if(u.side===1) liveC++; }
    return { dead:dead, liveCoal:liveC, coalFrac:FORCE.coalFrac,
             fundRatio:FORCE.fundRatio, turretShare:turretShare, engShare:engShare,
             wantTur:Math.round(cap*FORCE.coalFrac*turretShare), cap:cap };
  },
  /* THE SECOND counts WAS SILENTLY WINNING AND HAD BEEN SINCE 1.5.6.0. Two keys
     of the same name in one object literal is not an error in any mode - the
     later one simply replaces the earlier - so the richer counts() added for the
     bench has been dead ever since, and every reading taken from it this whole
     time came from this four-line one. It reported class tallies, which look
     entirely plausible, so nothing ever looked wrong.

     That is the second time the bench has quietly under-reported: the first was
     _animSeen missing anything that bypassed queueSprite. The pattern is the
     same and worth naming - an instrument that returns a SUBSET of the truth is
     more dangerous than one that returns nothing, because nothing prompts a
     question and a plausible subset does not. reach-check now asserts there is
     exactly one counts key. */
};

/* The overlay has camera buttons now, so setCam needs a handle from outside
   the IIFE. The keyboard shortcuts stay; nobody discovers a keyboard shortcut
   on a canvas that has no visible controls. */
window.rbSetCam = function(m){ setCam(m); };

window.reachWatchClose = function(){
  RB.open = false; RB.mode = 'battle';
  if (RB.raf) { cancelAnimationFrame(RB.raf); RB.raf = null; }
  if (RB.tickIv) { clearInterval(RB.tickIv); RB.tickIv = null; }
  var host = document.getElementById('reachBattle');
  if (host) host.style.display = 'none';
};

window.addEventListener('keydown', function(e){
  if (e.key === 'Escape' && RB.open) window.reachWatchClose();
});

})();
