// ═══════════════════════════════════════════════════════════════════════════
// reach-hive.js - the hive works, drawn as a CITY.
//
// A Khai'sultull settlement is a place, not a battlefield feature. Drawing it
// with the battlefield's wireframe made every brood world read as a firefight
// even when nothing was happening on it, and it looked nothing like what a
// Coalition world shows when you open its city.
//
// So this uses the city view's own idiom: the same isometric projection, the
// same terrain plate keyed off the world's terrain, the same massing language.
// What changes is the architecture. Coalition cities are blocks on a grid of
// districts. A hive is towers: tapered, leaning, ribbed, clustered around
// brood spires, with skyways strung between them and flyers working the air.
//
// Terrain comes from the world, exactly as it does for a Coalition city, so a
// hive on ice does not look like a hive on dust.
// ═══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';

var HV = { open:false, colony:null, raf:null, t:0 };
var cv=null, ctx=null;
var CW=1180, CH=720;
var S=2.18, HZ=2.5, OX=590, OY=292;
var WW=230, WH=170;

// ── projection: identical to the city view's ───────────────────────────────
function px(x,y){ return OX+(x-y)*S; }
function py(x,y,z){ return OY+(x+y)*S*0.5-(z)*HZ; }
function pth(pts){ ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.closePath(); }
function rgba(c,a,k){ k=k||1; return 'rgba('+Math.round(c.r*k)+','+Math.round(c.g*k)+','+Math.round(c.b*k)+','+a+')'; }
function glow(col,blur,fn){ ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=blur; fn(); ctx.restore(); }

function mulberry32(a){
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function seedFromId(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}

// Chitin. Warm, dark, one hue: a hive is grown from one material.
var CHIT   = {r:194,g:85, b:31};
var CHIT_D = {r:120,g:52, b:20};
var GLOWC  = {r:255,g:176,b:96};

// ── terrain, keyed off the world exactly as the city view is ──────────────
// The same six keys COLONY_VISUAL uses, plus ocean. A hive on ice must not
// look like a hive on dust, for the same reason a Coalition city does not.
// TETHER IS DEEP RED IN THE REACH AND GREEN AT NEW ANCHOR, deliberately, and
// this file is the correct place for that divergence because it renders Reach
// worlds and nothing else. A terrain key is a shape vocabulary, not a colour:
// Vesskanoth and New Anchor are both anchored ground and they are not the same
// biome, and the palette is what says so. city.js keeps its own tether green
// for the Coalition and Circuit cities, and the check asserts the two never get
// unified by somebody tidying up.
var TERRAIN_BASE = {
  dust:  'rgba(46,34,16,0.55)',  veins:'rgba(30,26,10,0.60)',
  rift:  'rgba(22,16,34,0.62)',  ice:  'rgba(16,38,44,0.55)',
  tether:'rgba(52,12,10,0.60)',  station:'rgba(12,18,24,0.62)',
  ocean: 'rgba(10,30,48,0.62)',
};
// THE PLATE COLOUR NOW COMES OFF THE PLANET ART, for the same reason the
// battlefield's does: a survey and an engagement on the same world have to be
// the same world, and both of them have to be the body the player just looked
// at in the system view. TERRAIN_BASE above stays as the fallback for a body
// with no sprite entry and for the case where planet-palette.js has not loaded.
// The DETAIL passes below are untouched: those are shape, and shape is authored.
var HPAL = null;
function palOf(colonyId){
  var tbl = window.PLANET_PALETTE;
  var body = window.COLONY_PLANET && window.COLONY_PLANET[colonyId];
  return (tbl && body && tbl[body.folder]) || (tbl && window.PLANET_PALETTE_DEFAULT) || null;
}
function prgba(c,a){ return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')'; }
function bounds(){ return [[6,6],[WW-6,6],[WW-6,WH-6],[6,WH-6]]; }

function drawStars(seed){
  var rng=mulberry32(seed^0xB007);
  for(var i=0;i<230;i++){
    var x=rng()*CW, y=rng()*CH*0.55, b=rng();
    ctx.fillStyle='rgba(226,180,140,'+(0.06+b*0.34).toFixed(2)+')';
    ctx.fillRect(x|0,y|0,b>0.96?2:1,b>0.96?2:1);
  }
}

function drawTerrain(terrain, seed){
  var plate=bounds().map(function(v){ return [px(v[0],v[1]),py(v[0],v[1],0)]; });
  pth(plate);
  ctx.fillStyle=HPAL ? prgba(HPAL.ground,0.82) : (TERRAIN_BASE[terrain]||TERRAIN_BASE.dust);
  ctx.fill();
  ctx.strokeStyle='rgba(194,85,31,0.22)'; ctx.lineWidth=1; ctx.stroke();
  var r=mulberry32(seed^0xD05);

  if(terrain==='dust'){
    ctx.strokeStyle='rgba(220,170,90,0.10)';
    for(var i=0;i<26;i++){
      var y0=6+r()*(WH-12); ctx.beginPath();
      for(var x2=6;x2<=WW-6;x2+=8){
        var yy=y0+Math.sin(x2*0.055+i)*4.5;
        if(x2===6) ctx.moveTo(px(x2,yy),py(x2,yy,0)); else ctx.lineTo(px(x2,yy),py(x2,yy,0));
      }
      ctx.stroke();
    }
  } else if(terrain==='veins'){
    glow('rgba(255,206,77,0.9)',9,function(){
      ctx.strokeStyle='rgba(255,206,77,0.45)';
      for(var v=0;v<8;v++){
        var x=14+r()*(WW-28), y=8, w=1.2+r()*1.6;
        ctx.lineWidth=w; ctx.beginPath(); ctx.moveTo(px(x,y),py(x,y,0));
        while(y<WH-8){ y+=7+r()*9; x=Math.max(8,Math.min(WW-8,x+(r()-0.5)*22)); ctx.lineTo(px(x,y),py(x,y,0)); }
        ctx.stroke();
      }
    });
  } else if(terrain==='rift'){
    var rc=function(y){ return 104+Math.sin(y*0.041)*26+Math.sin(y*0.13)*7; };
    var rw=function(y){ return 11+Math.sin(y*0.07)*4; };
    var pts=[],y3;
    for(y3=6;y3<=WH-6;y3+=3) pts.push([px(rc(y3)-rw(y3),y3),py(rc(y3)-rw(y3),y3,0)]);
    for(y3=WH-6;y3>=6;y3-=3) pts.push([px(rc(y3)+rw(y3),y3),py(rc(y3)+rw(y3),y3,0)]);
    pth(pts); ctx.fillStyle='rgba(6,2,14,0.92)'; ctx.fill();
    glow('rgba(190,130,255,0.9)',14,function(){
      ctx.strokeStyle='rgba(190,130,255,0.45)'; ctx.lineWidth=2; ctx.stroke(); });
  } else if(terrain==='ice'){
    ctx.strokeStyle='rgba(140,225,250,0.20)'; ctx.lineWidth=1;
    for(var k=0;k<14;k++){
      var yb=8+r()*(WH-16); ctx.beginPath();
      for(var xi=6;xi<=WW-6;xi+=10){
        var yi=yb+Math.sin(xi*0.08+k*2.1)*3.2;
        if(xi===6) ctx.moveTo(px(xi,yi),py(xi,yi,0)); else ctx.lineTo(px(xi,yi),py(xi,yi,0));
      }
      ctx.stroke();
    }
  } else if(terrain==='ocean'){
    ctx.strokeStyle='rgba(90,180,220,0.15)'; ctx.lineWidth=1;
    for(var so=0;so<26;so++){
      var yo=6+r()*(WH-12); ctx.beginPath();
      for(var xo=6;xo<=WW-6;xo+=7){
        var yy2=yo+Math.sin(xo*0.035+so*1.7)*5.5+Math.sin(xo*0.11+so)*1.8;
        if(xo===6) ctx.moveTo(px(xo,yy2),py(xo,yy2,0)); else ctx.lineTo(px(xo,yy2),py(xo,yy2,0));
      }
      ctx.stroke();
    }
  } else if(terrain==='station'){
    ctx.strokeStyle='rgba(120,150,170,0.14)'; ctx.lineWidth=1;
    for(var gx1=6;gx1<=WW-6;gx1+=14){ ctx.beginPath();
      ctx.moveTo(px(gx1,6),py(gx1,6,0)); ctx.lineTo(px(gx1,WH-6),py(gx1,WH-6,0)); ctx.stroke(); }
    for(var gy1=6;gy1<=WH-6;gy1+=14){ ctx.beginPath();
      ctx.moveTo(px(6,gy1),py(6,gy1,0)); ctx.lineTo(px(WW-6,gy1),py(WW-6,gy1,0)); ctx.stroke(); }
  } else if(terrain==='tether'){
    ctx.strokeStyle='rgba(214,78,54,0.13)'; ctx.lineWidth=6;
    for(var a=0;a<8;a++){
      var th=a/8*6.283+0.2; ctx.beginPath();
      ctx.moveTo(px(WW/2,WH/2),py(WW/2,WH/2,0));
      ctx.lineTo(px(WW/2+Math.cos(th)*100,WH/2+Math.sin(th)*74),
                 py(WW/2+Math.cos(th)*100,WH/2+Math.sin(th)*74,0));
      ctx.stroke();
    }
  }
}

// ── a hive tower ───────────────────────────────────────────────────────────
// Tapered and leaning, ribbed up its height, capped with a crown of spines.
// Built as stacked rings rather than a prism, so it narrows the way something
// grown narrows instead of the way something built does.
function tower(cx, cy, h, rad, lean, rnd, isSpire){
  var LEAN_X = Math.cos(lean)*h*0.055, LEAN_Y = Math.sin(lean)*h*0.055;
  var RINGS = Math.max(5, Math.round(h/5));
  var N = 7;
  var prev=null;
  for(var s=0;s<=RINGS;s++){
    var t=s/RINGS;
    var z=h*t;
    var rr=rad*(1-t*(isSpire?0.86:0.62))*(0.92+Math.sin(t*7+lean)*0.08);
    var ox=cx+LEAN_X*t*t, oy=cy+LEAN_Y*t*t;
    var ring=[];
    for(var k=0;k<N;k++){
      var a=(k/N)*Math.PI*2+lean*0.4;
      var j=0.86+((s*7+k*13)%5)*0.05;
      ring.push([ox+Math.cos(a)*rr*j, oy+Math.sin(a)*rr*j*0.72, z]);
    }
    if(prev){
      for(var q=0;q<N;q++){
        var p1=prev[q], p2=prev[(q+1)%N], c1=ring[q], c2=ring[(q+1)%N];
        var shade=0.16+0.30*(0.5+Math.cos((q/N)*Math.PI*2)*0.5);
        ctx.fillStyle=rgba(CHIT, 0.34, shade);
        pth([[px(p1[0],p1[1]),py(p1[0],p1[1],p1[2])],
             [px(p2[0],p2[1]),py(p2[0],p2[1],p2[2])],
             [px(c2[0],c2[1]),py(c2[0],c2[1],c2[2])],
             [px(c1[0],c1[1]),py(c1[0],c1[1],c1[2])]]);
        ctx.fill();
      }
      // rib between rings, the seam a growth line leaves
      ctx.strokeStyle=rgba(CHIT_D,0.42); ctx.lineWidth=1;
      pth(ring.map(function(v){ return [px(v[0],v[1]),py(v[0],v[1],v[2])]; }));
      ctx.stroke();
    }
    prev=ring;
  }
  // crown of spines
  var top=prev, tx=cx+LEAN_X, ty=cy+LEAN_Y;
  ctx.strokeStyle=rgba(CHIT,0.66); ctx.lineWidth=1.2;
  for(var c=0;c<N;c+=1){
    var v=top[c];
    ctx.beginPath();
    ctx.moveTo(px(v[0],v[1]),py(v[0],v[1],v[2]));
    ctx.lineTo(px(tx,ty),py(tx,ty,h+rad*(isSpire?2.6:1.3)));
    ctx.stroke();
  }
  // lit apertures up the shaft
  glow('rgba(255,176,96,0.8)',6,function(){
    ctx.fillStyle=rgba(GLOWC,0.55);
    for(var w=0;w<Math.round(h/6);w++){
      var t2=0.18+ (w/Math.max(1,Math.round(h/6)))*0.7;
      var a2=(w*2.3)%(Math.PI*2);
      var rr2=rad*(1-t2*0.62)*0.9;
      var wx=cx+LEAN_X*t2*t2+Math.cos(a2)*rr2, wy=cy+LEAN_Y*t2*t2+Math.sin(a2)*rr2*0.72;
      ctx.fillRect(px(wx,wy)-1, py(wx,wy,h*t2)-1, 2, 2);
    }
  });
  return { x:tx, y:ty, h:h+rad*(isSpire?2.6:1.3) };
}

// ── the settlement ─────────────────────────────────────────────────────────
var CITY = { towers:[], flyers:[], terrain:'dust' };

function buildCity(colonyId, terrain, hold){
  var rnd=mulberry32(seedFromId('hive:'+colonyId));
  CITY.towers=[]; CITY.flyers=[]; CITY.terrain=terrain;
  // Clusters, not a grid. A hive groups around brood spires and thins out.
  var clusters=Math.max(2, Math.round(2+hold*4));
  for(var c=0;c<clusters;c++){
    var cx=26+rnd()*(WW-52), cy=22+rnd()*(WH-44);
    var spireH=44+rnd()*40;
    CITY.towers.push({x:cx,y:cy,h:spireH,r:5.5+rnd()*2.2,lean:rnd()*6.28,spire:true});
    var n=4+((rnd()*7)|0);
    for(var i=0;i<n;i++){
      var a=rnd()*6.28, d=8+rnd()*24;
      CITY.towers.push({
        x:Math.max(10,Math.min(WW-10,cx+Math.cos(a)*d)),
        y:Math.max(10,Math.min(WH-10,cy+Math.sin(a)*d*0.8)),
        h:14+rnd()*30, r:3.2+rnd()*2.6, lean:rnd()*6.28, spire:false
      });
    }
  }
  // Painter's order: far to near, so nothing in front is overdrawn by
  // something behind it. The city view sorts the same way.
  CITY.towers.sort(function(a,b){ return (a.x+a.y)-(b.x+b.y); });

  // Ambient flyers, orbiting the towers they belong to.
  var big=CITY.towers.filter(function(t){ return t.spire || t.h>26; });
  for(var f=0;f<Math.round(18+hold*26);f++){
    var host=big[(rnd()*big.length)|0] || CITY.towers[0];
    CITY.flyers.push({
      hx:host.x, hy:host.y,
      r:9+rnd()*20, z:8+rnd()*(host.h*0.9),
      a:rnd()*6.28, sp:(0.00030+rnd()*0.00075)*(rnd()<0.5?-1:1),
      bob:rnd()*6.28, s:0.9+rnd()*0.7
    });
  }
}

function drawFlyers(t){
  // Two paths: one behind the towers, one in front, split on depth so a flyer
  // on the far side of a spire is not drawn over it.
  var far=[], near=[];
  for(var i=0;i<CITY.flyers.length;i++){
    var f=CITY.flyers[i];
    var a=f.a+t*f.sp;
    var x=f.hx+Math.cos(a)*f.r, y=f.hy+Math.sin(a)*f.r*0.72;
    var z=f.z+Math.sin(t*0.0016+f.bob)*3.2;
    (Math.sin(a)<0?far:near).push([x,y,z,f.s,a,t*0.02+f.bob]);
  }
  function paint(list,alpha){
    ctx.strokeStyle='rgba(238,150,86,'+alpha+')'; ctx.lineWidth=1;
    ctx.beginPath();
    for(var k=0;k<list.length;k++){
      var d=list[k], X=px(d[0],d[1]), Y=py(d[0],d[1],d[2]), s=d[3];
      var beat=Math.sin(d[5]*9)*s*1.9;
      ctx.moveTo(X-s*1.6,Y); ctx.lineTo(X+s*1.6,Y);           // body
      ctx.moveTo(X-s*0.4,Y); ctx.lineTo(X-s*2.6,Y-beat);      // wings
      ctx.moveTo(X+s*0.4,Y); ctx.lineTo(X+s*2.6,Y+beat);
    }
    ctx.stroke();
  }
  return { far:function(){ paint(far,0.35); }, near:function(){ paint(near,0.62); } };
}

function drawSkyways(){
  // Strung between neighbouring towers: the thing that makes it a settlement
  // rather than a field of separate objects.
  ctx.strokeStyle=rgba(CHIT_D,0.34); ctx.lineWidth=1;
  for(var i=0;i<CITY.towers.length;i++){
    var a=CITY.towers[i];
    if(!a.spire) continue;
    for(var j=0;j<CITY.towers.length;j++){
      var b=CITY.towers[j];
      if(b===a || b.spire) continue;
      var d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d>28) continue;
      var za=a.h*0.62, zb=b.h*0.78;
      ctx.beginPath();
      ctx.moveTo(px(a.x,a.y),py(a.x,a.y,za));
      var mx=(a.x+b.x)/2, my=(a.y+b.y)/2, mz=Math.min(za,zb)*0.86;
      ctx.quadraticCurveTo(px(mx,my),py(mx,my,mz), px(b.x,b.y),py(b.x,b.y,zb));
      ctx.stroke();
    }
  }
}

function render(){
  if(!ctx) return;
  ctx.clearRect(0,0,CW,CH);
  var g=ctx.createLinearGradient(0,0,0,CH);
  if(HPAL){
    /* Sky at the top, the world's own horizon glow where it meets the plate.
       Deeper than the battlefield's because this view looks UP at a settlement
       rather than across a field, so more of the frame is sky and a bright one
       would swallow the spires. */
    g.addColorStop(0, prgba(HPAL.sky,1));
    g.addColorStop(0.62, prgba(HPAL.sky,1));
    g.addColorStop(1, prgba(HPAL.horizon,1));
  } else {
    g.addColorStop(0,'#0a0604'); g.addColorStop(1,'#050303');
  }
  ctx.fillStyle=g; ctx.fillRect(0,0,CW,CH);
  drawStars(seedFromId('hive:'+HV.colony));
  drawTerrain(CITY.terrain, seedFromId('hive:'+HV.colony));

  var fly=drawFlyers(HV.t);
  fly.far();
  drawSkyways();
  var rnd=mulberry32(seedFromId('hive:'+HV.colony));
  for(var i=0;i<CITY.towers.length;i++){
    var tw=CITY.towers[i];
    tower(tw.x,tw.y,tw.h,tw.r,tw.lean,rnd,tw.spire);
  }
  fly.near();
}

// ── entry ──────────────────────────────────────────────────────────────────
window.reachHive = function(colonyId){
  var host=document.getElementById('reachHive');
  if(!host) return;
  cv=document.getElementById('rhCanvas');
  if(!cv) return;
  ctx=cv.getContext('2d');
  host.style.display='block';
  HV.open=true; HV.colony=colonyId; HV.t=0;

  var R=(window._REACH && window._REACH.worlds && window._REACH.worlds[colonyId]) || null;
  var hold=R ? Math.max(0.05,Math.min(1,(R.hive||100)/100)) : 1;
  var terrain=(window.REACH_TERRAIN && window.REACH_TERRAIN[colonyId]) || 'dust';
  HPAL = palOf(colonyId);

  var tEl=document.getElementById('rhTitle');
  var sEl=document.getElementById('rhSub');
  if(tEl) tEl.textContent = (R && R.revealed) ? 'HIVE WORKS' : 'UNSURVEYED SETTLEMENT';
  if(sEl) sEl.textContent = colonyId.toUpperCase().replace(/_/g,' ') + ' \u00b7 ' + terrain.toUpperCase();

  buildCity(colonyId, terrain, hold);
  var cEl=document.getElementById('rhCount');
  if(cEl) cEl.textContent = CITY.towers.length + ' structures \u00b7 '
    + CITY.towers.filter(function(t){ return t.spire; }).length + ' brood spires \u00b7 '
    + CITY.flyers.length + ' in the air';

  if(HV.raf) cancelAnimationFrame(HV.raf);
  var last=performance.now();
  (function loop(now){
    if(!HV.open) return;
    HV.t += Math.min(64, now-last); last=now;
    render();
    HV.raf=requestAnimationFrame(loop);
  })(last);
};

window.reachHiveClose = function(){
  HV.open=false;
  if(HV.raf){ cancelAnimationFrame(HV.raf); HV.raf=null; }
  var host=document.getElementById('reachHive');
  if(host) host.style.display='none';
};

window.addEventListener('keydown', function(e){
  if(e.key==='Escape' && HV.open) window.reachHiveClose();
});

// Exposed for the checks.
window.__reachHiveState = function(){ return { open:HV.open, colony:HV.colony,
  towers:CITY.towers.length, spires:CITY.towers.filter(function(t){return t.spire;}).length,
  flyers:CITY.flyers.length, terrain:CITY.terrain }; };

})();
