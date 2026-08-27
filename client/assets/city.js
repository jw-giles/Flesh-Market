// FleshMarket City Charters, client module (1.2.6.0).
// Renders the CITY section on the colony detail card and the full city
// management overlay. All prices, rules and SECTOR GEOMETRY live on the
// server: city_data carries the polygons, this file only draws what it is
// given and sends intent. There is deliberately no geometry mirror here.
(function(){
'use strict';

var T=function(k,fb){return window.t?window.t(k,fb):fb;};
var F=function(n){return '\u0192'+Number(Math.round(n)).toLocaleString();};
function fm(n){
  var g=n<0?'-':''; n=Math.abs(Number(n)||0);
  if(n>=1e12) return g+'\u0192'+(n/1e12).toFixed(2)+'T';
  if(n>=1e9)  return g+'\u0192'+(n/1e9).toFixed(2)+'B';
  if(n>=1e6)  return g+'\u0192'+(n/1e6).toFixed(1)+'M';
  if(n>=1e3)  return g+'\u0192'+Math.round(n/1e3)+'k';
  return g+'\u0192'+Math.round(n);
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

// ── State ────────────────────────────────────────────────────────────────────
var cSum = {};          // colonyId -> latest summary
var cData = null;       // full city_data for the open overlay
var cOpen = null;       // colonyId of the open overlay, or null
var cPendingLevers = null;
var cRefreshTimer = null;
var cSummariesAsked = false;

var SECTORS = [];       // merged geometry + live lot state
var sel = 0;            // selected sector index
var cPendingCut = null; // mayor's unsaved commerce rate
var hlOwner = null;     // highlight-holder owner id, or null

var KIND_COLOR = { export:'#9dff5a', food:'#ffb547', med:'#4ecdc4', tech:'#a78bfa' };
// Content nouns. These are not chrome, so they live here rather than in the
// I18N key table, mirrored by a ZH lookup that falls through to English.
var ZH = function(){ return window._lang === 'zh'; };
var KIND_LABEL_EN = { export:'Export', food:'Agri', med:'Medical', tech:'Tech' };
var KIND_LABEL_ZH = { export:'货运', food:'农业', med:'医疗', tech:'科技' };
var KIND_LABEL = new Proxy({}, { get:function(_,k){
  return (ZH() ? KIND_LABEL_ZH[k] : null) || KIND_LABEL_EN[k] || k; } });
var FACTION_LABEL_EN = { coalition:'Coalition', syndicate:'Syndicate', void:'Void Collective',
  guild:'Merchants Guild', jade:'The Jade Circuit' };
var FACTION_LABEL_ZH = { coalition:'联合体', syndicate:'辛迪加', void:'虚空集体',
  guild:'商人公会', jade:'翡翠回路' };
var FACTION_LABEL = new Proxy({}, { get:function(_,k){
  return (ZH() ? FACTION_LABEL_ZH[k] : null) || FACTION_LABEL_EN[k] || k; } });
// jade was missing entirely, so a Circuit world printed the raw id in the
// wrong-faction notice and fell through to the default tint on the map.
var FACTION_COL = { coalition:{r:70,g:250,b:132}, syndicate:{r:240,g:170,b:84},
  void:{r:190,g:130,b:255}, guild:{r:255,g:206,b:77}, jade:{r:232,g:228,b:216},
  contested:{r:255,g:106,b:106} };

var STAGES_EN=[
 {n:'VACANT',      d:'Cleared ground. Survey markers only.'},
 {n:'SETTLEMENT',  d:'Scattered low structures on open plate.'},
 {n:'DISTRICT',    d:'Blocks fill in. Individual towers rise.'},
 {n:'PLATFORM',    d:'Sector is decked. Towers share one raised podium.'},
 {n:'CONURBATION', d:'Structures fuse. A central mass dominates the cell.'},
 {n:'ARCOLOGY',    d:'Max level. One sealed superstructure. Every owner holds a floor band.'}
];
var STAGES_ZH=[
 {n:'空地',   d:'已平整的地面。只有勘测标记。'},
 {n:'聚落',   d:'开阔基台上零散的低矮建筑。'},
 {n:'辖区',   d:'街区填满，单体高塔立起。'},
 {n:'平台',   d:'区块已架起整层基座，高塔共用一座抬升平台。'},
 {n:'集合都市',d:'建筑相互融合，一座中心巨体主宰整个区块。'},
 {n:'方舟城', d:'最高层级。单一封闭巨构，每位持有者占据一条楼层带。'}
];
var STAGES = new Proxy([], { get:function(_,k){
  if(k==='length') return STAGES_EN.length;
  var i=Number(k); if(!isFinite(i)) return undefined;
  return (ZH() ? STAGES_ZH[i] : null) || STAGES_EN[i]; } });
// Fraction gates, not averages: a lone whale at max tier cannot pull a sector
// up a stage on its own. The arcology is a monument to a community.
var GATES=[null,[1,0.25],[3,0.50],[5,0.60],[7,0.70],[9,0.80]];

var OWNER_PALETTE=[
 {r:255,g:206,b:77},{r:66,g:255,b:126},{r:120,g:200,b:255},{r:240,g:150,b:110},
 {r:180,g:130,b:255},{r:255,g:140,b:190},{r:150,g:230,b:190},{r:210,g:190,b:120},
 {r:255,g:120,b:120},{r:130,g:220,b:255},{r:200,g:255,b:130},{r:235,g:175,b:255}];
function ownerCol(id){
  if(!id) return {r:120,g:150,b:130};
  var h=2166136261;
  for(var i=0;i<id.length;i++){ h^=id.charCodeAt(i); h=Math.imul(h,16777619); }
  return OWNER_PALETTE[(h>>>0)%OWNER_PALETTE.length];
}
function rgbs(c,a){ return 'rgba('+c.r+','+c.g+','+c.b+','+a+')'; }

function sendCity(o){
  try{
    if(typeof sendWS==='function') sendWS(o);
    else if(window._ws && window._ws.readyState===1) window._ws.send(JSON.stringify(o));
  }catch(e){}
}
// gToast lives inside an IIFE in galaxy.js. The bare identifier is not
// visible from this file, so this used to be a silent no-op for every city
// notification. window.gToast is the exported handle.
function toast(msg,color){
  var f = window.gToast || (typeof gToast==='function' ? gToast : null);
  if (f) f(msg, color||'#9dff5a');
}
function syncCash(cash){
  if(typeof cash!=='number') return;
  try{
    if(typeof ME==='object'&&ME) ME.cash=cash;
    var el=document.getElementById('cash');
    if(el) el.textContent='\u0192'+Number(cash).toLocaleString(undefined,{maximumFractionDigits:2});
    try{ liveUpdatePnL(null,null); }catch(_){}
  }catch(_){}
}
function askSummaries(){
  if(cSummariesAsked) return;
  cSummariesAsked=true;
  sendCity({type:'city_summaries_request'});
}
function myId(){ return (window.ME&&window.ME.id)||null; }

// ── Colony detail card section ───────────────────────────────────────────────
window.renderCityCard=function(colonyId){
  var host=document.getElementById('gColonyDetailInner'); if(!host) return;
  askSummaries();
  var s=cSum[colonyId];
  if(!s){ var stale=document.getElementById('gCityCard'); if(stale) stale.remove(); return; }
  var wrap=document.createElement('div');
  wrap.id='gCityCard';
  var h='<div style="margin-top:12px;border:1px solid #1e2a12;background:#0a0f06;padding:8px 10px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center">';
  h+='<span style="font-size:.68rem;letter-spacing:.14em;color:#9dff5a">'+T('city.header','CITY CHARTER')+'</span>';
  h+='<button onclick="window.cityOpen(\''+colonyId+'\')" style="background:transparent;border:1px solid #2a3a1a;color:#9dff5a;padding:3px 9px;cursor:pointer;font-size:.62rem;font-family:inherit;letter-spacing:.08em">'+T('city.open','OPEN CITY')+' &#x25B8;</button>';
  h+='</div>';
  h+='<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:.66rem;color:#7a8a6a;margin-top:6px">';
  h+='<span>'+T('city.class','Class')+': <b style="color:#ffb547">'+String(s.cls).toUpperCase()+'</b></span>';
  h+='<span>'+T('city.pop','Pop')+': <b style="color:#ccc">'+s.pop+'M</b></span>';
  h+='<span>'+T('city.book','Book')+': <b style="color:#9dff5a">'+fm(s.book)+'</b></span>';
  h+='<span>'+T('city.districts','Districts')+': <b style="color:#ccc">'+s.mayors+'/'+s.districts+'</b></span>';
  h+='</div>';
  h+='<div style="display:flex;gap:12px;font-size:.62rem;color:#666;margin-top:4px">';
  h+='<span>'+T('city.output','Output')+' <b style="color:'+(s.output>60?'#9dff5a':s.output>30?'#ffb547':'#e74c3c')+'">'+s.output+'</b></span>';
  h+='<span>'+T('city.unrest','Unrest')+' <b style="color:'+(s.unrest<40?'#9dff5a':s.unrest<70?'#ffb547':'#e74c3c')+'">'+s.unrest+'</b></span>';
  h+='<span>'+T('city.shopsWord','Shops')+': <b style="color:#ffb547">'+s.shops+'</b></span>';
  h+='</div>';
  if(s.locked){
    var days=Math.max(0,Math.ceil((s.stripAt-Date.now())/864e5));
    h+='<div style="border:1px solid #e74c3c;color:#e74c3c;font-size:.64rem;padding:3px 7px;margin-top:6px">&#9888; '
      +T('city.occupiedBy','OCCUPIED BY')+' '+(FACTION_LABEL[s.locked]||s.locked).toUpperCase()
      +(Date.now()<s.stripAt?(', '+T('city.salvageIn','salvage begins in')+' '+days+'d'):(', '+T('city.stripping','city being stripped')))+'</div>';
  }
  if(s.blockade>0){
    h+='<div style="color:#e74c3c;font-size:.62rem;margin-top:4px">&#9888; '+T('city.blockaded','Supply lanes blockaded')+', '+T('city.food','food')+' '+s.food+'% '+T('city.med','med')+' '+s.med+'% '+T('city.tech','tech')+' '+s.tech+'%</div>';
  }
  h+='</div>';
  wrap.innerHTML=h;
  var old=document.getElementById('gCityCard'); if(old) old.remove();
  host.appendChild(wrap);
};

// ── Geometry helpers (operate on server-sent polygons only) ──────────────────
function centroid(p){
  var a=0,cx=0,cy=0;
  for(var i=0;i<p.length;i++){var q=p[(i+1)%p.length];
    var f=p[i][0]*q[1]-q[0]*p[i][1]; a+=f; cx+=(p[i][0]+q[0])*f; cy+=(p[i][1]+q[1])*f;}
  a*=0.5; if(Math.abs(a)<1e-9) return [p[0][0],p[0][1]];
  return [cx/(6*a), cy/(6*a)];
}
function insetPoly(p,f){var c=centroid(p);
  return p.map(function(v){return [c[0]+(v[0]-c[0])*(1-f), c[1]+(v[1]-c[1])*(1-f)];});}
function inPoly(p,x,y){var c=false;
  for(var i=0,j=p.length-1;i<p.length;j=i++)
    if(((p[i][1]>y)!==(p[j][1]>y))&&(x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]))c=!c;
  return c;}
function bboxOf(p){var a=[1e9,1e9,-1e9,-1e9];
  p.forEach(function(v){a[0]=Math.min(a[0],v[0]);a[1]=Math.min(a[1],v[1]);
    a[2]=Math.max(a[2],v[0]);a[3]=Math.max(a[3],v[1]);});return a;}
function seedFromId(str){
  var h=2166136261>>>0;
  for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  return h>>>0;
}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ── Merge server geometry with live district state ──────────────────────────
function buildSectors(){
  SECTORS=[];
  if(!cData||!cData.geometry) return;
  var byIdx={};
  (cData.districts||[]).forEach(function(d){ byIdx[d.idx]=d; });
  var shopsBy={};
  (cData.shops||[]).forEach(function(sh){
    (shopsBy[sh.district]=shopsBy[sh.district]||[]).push(sh);
  });
  cData.geometry.sectors.forEach(function(sec,si){
    var d=byIdx[si]||{};
    SECTORS.push({
      poly:sec.poly, ctr:sec.ctr, bb:bboxOf(sec.poly),
      n:(d.name||sec.name), zone:(d.zone||sec.zone), zb:sec.zb||0, ang:sec.ang,
      blocks:sec.blocks||[],
      idx:si, d:d, shops:(shopsBy[si]||[]),
      dev:d.dev||1, baseline:d.baseline||1, works:d.worksLv||0, mayor:d.mayor||null,
      mayorName:d.mayorName||null, mine:!!d.mine
    });
  });
  if(sel>=SECTORS.length) sel=0;
}

// Stage is read off development, which is the population baseline plus what
// the mayor has built on top of it. Nothing here is authoritative: the server
// sends dev, this only decides how it draws.
// Civic works read as development for staging purposes at half weight, so a
// district somebody has poured billions into decks out even where population
// alone would leave it low rise.
function stageOf(s){
  var d=(s.dev||1)+(s.works||0)*0.5;
  if(d>=13) return 5;
  if(d>=11) return 4;
  if(d>=8)  return 3;
  if(d>=5)  return 2;
  if(d>=2)  return 1;
  return 0;
}
function meanTier(s){ return (s.dev||1); }
function sectorBook(s){ return (s.d&&s.d.invested)||0; }
// Colour a district by its mayor so the political map is readable at a glance.
function districtOwners(){
  var seen={}, out=[];
  SECTORS.forEach(function(s){
    if(!s.mayor||seen[s.mayor]) return;
    seen[s.mayor]=1;
    out.push({ id:s.mayor, n:s.mayorName||'?', c:ownerCol(s.mayor) });
  });
  return out;
}

// ── Projection and prism render ──────────────────────────────────────────────
// The projection is fitted to whatever box the canvas gets, rather than a
// fixed 1180x720 frame that left the city small in a wide column. autoFrame()
// solves S, HZ, OX and OY so the world plate plus building headroom exactly
// fills the canvas.
var S=2.18, HZ=2.5, CW=1180, CH=720, OX=590, OY=292, ZB=0;
var DPR=1;
var HEAD_Z=78;              // vertical allowance for towers, in world z units (raised for civic works)
function autoFrame(){
  var W=world();
  var pts=[[6,6],[W.w-6,6],[W.w-6,W.h-6],[6,W.h-6]];
  var minU=1e9,maxU=-1e9,minV=1e9,maxV=-1e9;
  pts.forEach(function(p){
    var u=p[0]-p[1], v=(p[0]+p[1])*0.5;
    if(u<minU)minU=u; if(u>maxU)maxU=u;
    if(v<minV)minV=v; if(v>maxV)maxV=v;
  });
  var spanU=Math.max(1,maxU-minU), spanV=Math.max(1,maxV-minV);
  var HZ_RATIO=1.147;                       // keep towers proportional to the plate
  var pad=0.96;
  // height budget: plate depth plus the headroom the tallest towers need
  var sW=(CW*pad)/spanU;
  var sH=(CH*pad)/(spanV + HEAD_Z*HZ_RATIO);
  S=Math.max(0.35,Math.min(sW,sH));
  HZ=S*HZ_RATIO;
  OX=CW/2 - (minU+maxU)/2*S;
  var top=minV*S - HEAD_Z*HZ, bot=maxV*S;
  OY=(CH-(bot-top))/2 - top;
}
var cv=null, ctx=null;
// Map view. Same interaction as the galaxy map: wheel zooms toward the cursor,
// drag pans. tx/ty are device pixels so the maths stays in one space.
var view={z:1, tx:0, ty:0};
var VIEW_MIN=0.55, VIEW_MAX=6;


function px(x,y){return OX+(x-y)*S;}
function py(x,y,z){return OY+(x+y)*S*0.5-(z+ZB)*HZ;}
function pth(pts){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);
  for(var i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();}
function rgba(c,a,k){k=k||1;return 'rgba('+Math.round(c.r*k)+','+Math.round(c.g*k)+','+Math.round(c.b*k)+','+a+')';}
function glow(col,blur,fn){ctx.save();ctx.shadowColor=col;ctx.shadowBlur=blur;fn();ctx.restore();}

function prism(poly,h,c,o){
  o=o||{};
  var edges=[];
  for(var i=0;i<poly.length;i++){
    var p=poly[i],q=poly[(i+1)%poly.length];
    var nx=q[1]-p[1], ny=-(q[0]-p[0]);
    var L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
    edges.push({p:p,q:q,d:(p[0]+p[1]+q[0]+q[1])/2,sh:0.17+0.22*Math.max(0,nx)+0.15*Math.max(0,ny)});
  }
  edges.sort(function(a,b){return a.d-b.d;});
  edges.forEach(function(e){
    ctx.fillStyle=rgba(c,o.a||0.30,e.sh);
    pth([[px(e.p[0],e.p[1]),py(e.p[0],e.p[1],h)],[px(e.q[0],e.q[1]),py(e.q[0],e.q[1],h)],
         [px(e.q[0],e.q[1]),py(e.q[0],e.q[1],0)],[px(e.p[0],e.p[1]),py(e.p[0],e.p[1],0)]]);
    ctx.fill();
    if(o.stroke!==false){ctx.strokeStyle=rgba(c,(o.sa||0.4)*0.6);ctx.lineWidth=1;ctx.stroke();}
  });
  ctx.fillStyle=rgba(c,o.at||0.42,0.62);
  pth(poly.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],h)];}));ctx.fill();
  if(o.stroke!==false){ctx.strokeStyle=rgba(c,o.sa||0.5);ctx.lineWidth=1;ctx.stroke();}
  if(o.bands&&h>7){
    ctx.strokeStyle=rgba(c,0.18);ctx.lineWidth=1;
    for(var lv=(o.bandStep||3);lv<h;lv+=(o.bandStep||3)){
      pth(poly.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],lv)];}));ctx.stroke();
    }
  }
}
function boxAt(l,h,c,o){
  o=o||{};var x=l.x,y=l.y,w=l.w,d=l.d;
  ctx.fillStyle=rgba(c,o.a||0.30,0.34);
  pth([[px(x+w,y),py(x+w,y,h)],[px(x+w,y+d),py(x+w,y+d,h)],
       [px(x+w,y+d),py(x+w,y+d,0)],[px(x+w,y),py(x+w,y,0)]]);ctx.fill();
  ctx.fillStyle=rgba(c,o.a||0.30,0.20);
  pth([[px(x,y+d),py(x,y+d,h)],[px(x+w,y+d),py(x+w,y+d,h)],
       [px(x+w,y+d),py(x+w,y+d,0)],[px(x,y+d),py(x,y+d,0)]]);ctx.fill();
  ctx.fillStyle=rgba(c,o.at||0.42,0.62);
  pth([[px(x,y),py(x,y,h)],[px(x+w,y),py(x+w,y,h)],
       [px(x+w,y+d),py(x+w,y+d,h)],[px(x,y+d),py(x,y+d,h)]]);ctx.fill();
  ctx.strokeStyle=rgba(c,o.sa||0.5);ctx.lineWidth=1;ctx.stroke();
}

// ── Buildings ────────────────────────────────────────────────────────────────
// A city reads as a city because of silhouette, not because of boxes. Towers
// step inward as they rise, carry something on the roof, and light their
// windows on a grid rather than a scatter. Everything is derived from a
// per-block deterministic seed so a district looks the same every frame and
// on every client.

function blockRng(l){
  var h=2166136261;
  var k=(l.x*7919+l.y*104729)|0;
  h^=k; h=Math.imul(h,16777619);
  h^=(h>>>13); h=Math.imul(h,16777619);
  return mulberry32(h>>>0);
}
// Grid of lit windows up the two faces the viewer can see.
function windows(x,y,w,d,z0,z1,c,rng,dens){
  var warm='rgba(255,206,77,0.9)', cool=rgba(c,0.85,1.35);
  for(var wy=y+0.6;wy<y+d-0.25;wy+=0.85){
    for(var wz=z0+0.9;wz<z1-0.5;wz+=1.15){
      if(rng()>dens) continue;
      ctx.fillStyle=rng()<0.32?warm:cool;
      ctx.fillRect(px(x+w,wy)-1,py(x+w,wy,wz)-1,2,2);
    }
  }
  for(var wx=x+0.6;wx<x+w-0.25;wx+=0.85){
    for(var wz2=z0+0.9;wz2<z1-0.5;wz2+=1.15){
      if(rng()>dens*0.7) continue;
      ctx.fillStyle=rng()<0.28?warm:cool;
      ctx.fillRect(px(wx,y+d)-1,py(wx,y+d,wz2)-1,2,2);
    }
  }
}
// A single structure: stepped mass, roof furniture, lit windows.
function tower(l,h,c,o){
  o=o||{};
  var rng=blockRng(l);
  var a=o.a||0.30, at=o.at||0.42, sa=o.sa||0.5;
  // Contact shadow so towers sit on the plate instead of floating over it.
  if(o.ao!==false){
    ctx.fillStyle='rgba(0,0,0,0.30)';
    pth([[px(l.x-0.3,l.y-0.3),py(l.x-0.3,l.y-0.3,0)],
         [px(l.x+l.w+0.3,l.y-0.3),py(l.x+l.w+0.3,l.y-0.3,0)],
         [px(l.x+l.w+0.3,l.y+l.d+0.3),py(l.x+l.w+0.3,l.y+l.d+0.3,0)],
         [px(l.x-0.3,l.y+l.d+0.3),py(l.x-0.3,l.y+l.d+0.3,0)]]);ctx.fill();
  }
  // Setbacks: taller means more steps, each one narrower.
  var steps = h>10 ? 3 : h>5.5 ? 2 : 1;
  var z=0;
  for(var i=0;i<steps;i++){
    var f=i*(0.13+rng()*0.06);
    var top = h*((i+1)/steps) * (i===steps-1?1:(0.94+rng()*0.10));
    var seg={ x:l.x+l.w*f*0.5, y:l.y+l.d*f*0.5, w:l.w*(1-f), d:l.d*(1-f) };
    // side faces
    ctx.fillStyle=rgba(c,a,0.34);
    pth([[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,top)],[px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,top)],
         [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,z)],[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,z)]]);ctx.fill();
    ctx.fillStyle=rgba(c,a,0.19);
    pth([[px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,top)],[px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,top)],
         [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,z)],[px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,z)]]);ctx.fill();
    // roof slab, lighter so the skyline edge reads
    ctx.fillStyle=rgba(c,at,0.66);
    pth([[px(seg.x,seg.y),py(seg.x,seg.y,top)],[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,top)],
         [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,top)],[px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,top)]]);ctx.fill();
    ctx.strokeStyle=rgba(c,sa,1.15);ctx.lineWidth=1;ctx.stroke();
    if(o.lights&&top-z>1.6) windows(seg.x,seg.y,seg.w,seg.d,z,top,c,rng,o.dens||0.3);
    z=top;
  }
  // Roof furniture. Masts on the tall ones, tanks and vents on the rest.
  if(o.roof===false) return;
  var cx=l.x+l.w/2, cy=l.y+l.d/2;
  if(h>9){
    var mh=h+1.6+rng()*2.4;
    ctx.strokeStyle=rgba(c,0.75,1.3);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(px(cx,cy),py(cx,cy,h));ctx.lineTo(px(cx,cy),py(cx,cy,mh));ctx.stroke();
    if(o.lights) glow('rgba(255,120,110,0.9)',7,function(){
      ctx.fillStyle='rgba(255,150,140,0.95)';
      ctx.beginPath();ctx.arc(px(cx,cy),py(cx,cy,mh),1.5,0,6.284);ctx.fill();});
  } else if(h>3.2&&rng()<0.55){
    var tw=l.w*0.28, td=l.d*0.28, tx=l.x+l.w*0.2+rng()*l.w*0.3, ty=l.y+l.d*0.2+rng()*l.d*0.3;
    ctx.fillStyle=rgba(c,a*1.1,0.30);
    pth([[px(tx+tw,ty),py(tx+tw,ty,h+0.9)],[px(tx+tw,ty+td),py(tx+tw,ty+td,h+0.9)],
         [px(tx+tw,ty+td),py(tx+tw,ty+td,h)],[px(tx+tw,ty),py(tx+tw,ty,h)]]);ctx.fill();
    ctx.fillStyle=rgba(c,at,0.62);
    pth([[px(tx,ty),py(tx,ty,h+0.9)],[px(tx+tw,ty),py(tx+tw,ty,h+0.9)],
         [px(tx+tw,ty+td),py(tx+tw,ty+td,h+0.9)],[px(tx,ty+td),py(tx,ty+td,h+0.9)]]);ctx.fill();
    ctx.strokeStyle=rgba(c,sa*0.8);ctx.lineWidth=1;ctx.stroke();
  }
}

function ownerBands(poly,c,sh,topH,f){
  if(!sh.list.length)return;
  var q=insetPoly(poly,f), z=0;
  var best=null,bd=-1e9;
  for(var i=0;i<q.length;i++){var p1=q[i],p2=q[(i+1)%q.length];
    var dd=(p1[0]+p1[1]+p2[0]+p2[1])/2; if(dd>bd){bd=dd;best=[p1,p2];}}
  sh.list.forEach(function(o){
    var hh=topH*o.f; if(hh<0.9){z+=hh;return;}
    ctx.fillStyle=rgbs(o.c,0.52);
    pth([[px(best[0][0],best[0][1]),py(best[0][0],best[0][1],z+hh)],
         [px(best[1][0],best[1][1]),py(best[1][0],best[1][1],z+hh)],
         [px(best[1][0],best[1][1]),py(best[1][0],best[1][1],z)],
         [px(best[0][0],best[0][1]),py(best[0][0],best[0][1],z)]]);
    ctx.fill();
    ctx.strokeStyle=rgbs(o.c,0.85);ctx.lineWidth=1;ctx.stroke();
    z+=hh;
  });
}
function zoneBase(z){
  if(z==='industrial')return {r:255,g:186,b:78};
  if(z==='residential')return {r:118,g:214,b:172};
  return {r:70,g:250,b:132};
}
function factionTint(){
  if(!cData) return FACTION_COL.coalition;
  if(cData.contested) return FACTION_COL.contested;
  return FACTION_COL[cData.colonyFaction]||FACTION_COL.coalition;
}

// ── Arcologies ───────────────────────────────────────────────────────────────
function arcIndustrial(p,c,sh){
  [[0.02,5],[0.15,13],[0.32,19],[0.50,24]].forEach(function(s2){
    prism(insetPoly(p,s2[0]),s2[1],c,{a:0.32,at:0.40,sa:0.5,bands:true,bandStep:2.2});});
  ownerBands(p,c,sh,24,0.50);
  var ct=centroid(p),rng=mulberry32(301);
  for(var i=0;i<3;i++){
    var q=insetPoly(p,0.90);
    var off=[(rng()-0.5)*10,(rng()-0.5)*8];
    var st=q.map(function(v){return [v[0]+off[0],v[1]+off[1]];});
    prism(st,24+9+i*3,c,{a:0.36,at:0.5,sa:0.7,stroke:true});
    (function(off2,i2){ glow('rgba(255,150,70,1)',13,function(){
      ctx.fillStyle='rgba(255,175,95,0.95)';
      ctx.beginPath();ctx.arc(px(ct[0]+off2[0],ct[1]+off2[1]),py(ct[0]+off2[0],ct[1]+off2[1],24+10+i2*3),2.6,0,6.284);
      ctx.fill();});})(off,i);
  }
}
function arcResidential(p,c,sh){
  [[0.02,4],[0.11,9],[0.21,14],[0.33,19],[0.46,24],[0.60,28]].forEach(function(s2,i){
    var q=insetPoly(p,s2[0]);
    prism(q,s2[1],c,{a:0.30,at:0.38,sa:0.45});
    if(i<5){ctx.strokeStyle='rgba(120,235,160,0.42)';ctx.lineWidth=1.4;
      pth(q.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],s2[1])];}));ctx.stroke();}
  });
  ownerBands(p,c,sh,28,0.60);
  prism(insetPoly(p,0.82),34,c,{a:0.34,at:0.5,sa:0.6});
  var ct=centroid(p);
  glow('rgba(180,255,215,1)',14,function(){ctx.fillStyle='rgba(215,255,235,0.95)';
    ctx.beginPath();ctx.arc(px(ct[0],ct[1]),py(ct[0],ct[1],35),2.8,0,6.284);ctx.fill();});
}
function arcCommercial(p,c,sh){
  [[0.03,6],[0.24,17],[0.46,26]].forEach(function(s2,i){
    prism(insetPoly(p,s2[0]),s2[1],c,{a:0.30,at:0.46,sa:0.55,bands:i>0,bandStep:3.6});});
  ownerBands(p,c,sh,26,0.46);
  prism(insetPoly(p,0.68),34,c,{a:0.34,at:0.55,sa:0.7,bands:true,bandStep:4});
  prism(insetPoly(p,0.86),41,c,{a:0.38,at:0.62,sa:0.8});
  var ct=centroid(p);
  ctx.strokeStyle='rgba(255,244,200,0.8)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(px(ct[0],ct[1]),py(ct[0],ct[1],41));
  ctx.lineTo(px(ct[0],ct[1]),py(ct[0],ct[1],48));ctx.stroke();
  glow('rgba(255,244,200,1)',16,function(){ctx.fillStyle='rgba(255,255,235,0.98)';
    ctx.beginPath();ctx.arc(px(ct[0],ct[1]),py(ct[0],ct[1],49),3.2,0,6.284);ctx.fill();});
}

// Two-ended box, z0 to z1. The trade forms stack segments, so they need an
// explicit floor as well as a ceiling; boxAt above is the z0=0 shorthand.
function box(l,z0,z1,c,o){
  o=o||{};
  var x=l.x,y=l.y,w=l.w,d=l.d;
  ctx.fillStyle=rgba(c,o.a,0.34);
  pth([[px(x+w,y),py(x+w,y,z1)],[px(x+w,y+d),py(x+w,y+d,z1)],
       [px(x+w,y+d),py(x+w,y+d,z0)],[px(x+w,y),py(x+w,y,z0)]]);ctx.fill();
  ctx.fillStyle=rgba(c,o.a,0.18);
  pth([[px(x,y+d),py(x,y+d,z1)],[px(x+w,y+d),py(x+w,y+d,z1)],
       [px(x+w,y+d),py(x+w,y+d,z0)],[px(x,y+d),py(x,y+d,z0)]]);ctx.fill();
  ctx.fillStyle=rgba(c,o.at,o.roofK||0.66);
  pth([[px(x,y),py(x,y,z1)],[px(x+w,y),py(x+w,y,z1)],
       [px(x+w,y+d),py(x+w,y+d,z1)],[px(x,y+d),py(x,y+d,z1)]]);ctx.fill();
  if(o.stroke!==false){ctx.strokeStyle=rgba(c,o.sa,1.2);ctx.lineWidth=o.lw||1;ctx.stroke();}
}

// ── Trade architecture ──────────────────────────────────────────────────────
// A district builds in the style of what it trades, and investment raises a
// landmark at its centre. Both signals are real: the mayor nominates a
// favoured trade, and storefronts carry a category, so the skyline is a
// readout of the district's economy rather than decoration.
//
// Signed off from the standalone look harness; the dials it exposed are fixed
// here at the values the look was approved at.
var GLOW=1, LIT=0.45;
var TRADE_COL={
  export:{r:255,g:186,b:78},    // amber, freight and industry
  food:  {r:120,g:230,b:130},   // green, growing decks
  med:   {r:150,g:225,b:235},   // pale cyan, clean rooms
  tech:  {r:170,g:150,b:255}    // violet, data
};
var TRADES=['export','food','med','tech'];
// Tiers 4 and 5 are civic works only. Nothing a population can do reaches them.
var LANDMARK_NAME_EN={
  export:['','Freight Hall','Bonded Yard','Grand Terminus','The Ten Thousand Docks','The Ledger Eternal'],
  food:  ['','Market Hall','Grand Market','Cathedral of Grain','The Endless Granary','The Feast of Ages'],
  med:   ['','Infirmary','Sanatorium','The White Ward','The Long Quiet','The Mercy Engine'],
  tech:  ['','Relay','Data Vault','The Cathedral Array','The Oracle Spire','The Waking Mind']
};
var LANDMARK_NAME_ZH={
  export:['','货运厅','保税仓','宏大终点站','万埠码头','永恒账簿'],
  food:  ['','市集厅','大市场','谷物圣殿','无尽粮仓','万世宴'],
  med:   ['','医务所','疗养院','白色病区','长眠堂','慈悲引擎'],
  tech:  ['','中继站','数据穹库','圣殿阵列','神谕尖塔','觉醒之心']
};
var LANDMARK_NAME = new Proxy({}, { get:function(_,k){
  return (ZH() ? LANDMARK_NAME_ZH[k] : null) || LANDMARK_NAME_EN[k]; } });

function prismN(cx,cy,r,z0,z1,sides,c,o){
  o=o||{};
  var pts=[];
  for(var i=0;i<sides;i++){
    var a=(i/sides)*6.2832+(o.rot||0);
    pts.push([cx+Math.cos(a)*r, cy+Math.sin(a)*r]);
  }
  var edges=[];
  for(var j=0;j<pts.length;j++){
    var p=pts[j],q=pts[(j+1)%pts.length];
    edges.push({p:p,q:q,d:(p[0]+p[1]+q[0]+q[1])/2});
  }
  edges.sort(function(a,b){return a.d-b.d;});
  edges.forEach(function(e,i){
    ctx.fillStyle=rgba(c,o.a||0.3,0.20+0.22*(i/edges.length));
    pth([[px(e.p[0],e.p[1]),py(e.p[0],e.p[1],z1)],[px(e.q[0],e.q[1]),py(e.q[0],e.q[1],z1)],
         [px(e.q[0],e.q[1]),py(e.q[0],e.q[1],z0)],[px(e.p[0],e.p[1]),py(e.p[0],e.p[1],z0)]]);
    ctx.fill();
  });
  ctx.fillStyle=rgba(c,o.at||0.44,0.66);
  pth(pts.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],z1)];}));ctx.fill();
  if(o.stroke!==false){ctx.strokeStyle=rgba(c,o.sa||0.5,1.15);ctx.lineWidth=1;ctx.stroke();}
  return pts;
}

function strips(x,y,w,d,z0,z1,c,rng,dens){
  for(var wy=y+0.55;wy<y+d-0.2;wy+=0.62){
    if(rng()>dens) continue;
    ctx.strokeStyle=rgba(c,(0.55+rng()*0.4)*GLOW,1.6);
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(px(x+w,wy),py(x+w,wy,z0+0.6));
    ctx.lineTo(px(x+w,wy),py(x+w,wy,z1-0.5));
    ctx.stroke();
  }
  for(var wx=x+0.55;wx<x+w-0.2;wx+=0.62){
    if(rng()>dens*0.6) continue;
    ctx.strokeStyle=rgba(c,(0.4+rng()*0.35)*GLOW,1.4);
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(px(wx,y+d),py(wx,y+d,z0+0.6));
    ctx.lineTo(px(wx,y+d),py(wx,y+d,z1-0.5));
    ctx.stroke();
  }
}

function shadow(l){
  ctx.fillStyle='rgba(0,0,0,0.36)';
  pth([[px(l.x-0.4,l.y-0.4),py(l.x-0.4,l.y-0.4,0)],
       [px(l.x+l.w+0.4,l.y-0.4),py(l.x+l.w+0.4,l.y-0.4,0)],
       [px(l.x+l.w+0.4,l.y+l.d+0.4),py(l.x+l.w+0.4,l.y+l.d+0.4,0)],
       [px(l.x-0.4,l.y+l.d+0.4),py(l.x-0.4,l.y+l.d+0.4,0)]]);ctx.fill();
}

function formChimney(l,h,c,rng){
  var cx=l.x+l.w/2, cy=l.y+l.d/2;
  var r=Math.min(l.w,l.d)*0.16;
  var hh=Math.max(4,h*1.7);
  // squat plinth so it does not float
  box({x:cx-r*2.2,y:cy-r*2.2,w:r*4.4,d:r*4.4},0,0.8,c,{a:0.32,at:0.42,sa:0.5});
  prismN(cx,cy,r,0.8,hh,8,c,{a:0.34,at:0.46,sa:0.55});
  // hazard banding
  ctx.strokeStyle=rgba(c,0.55,1.35);ctx.lineWidth=1;
  for(var b=hh*0.45;b<hh;b+=1.4) prismN(cx,cy,r*1.06,b,b+0.02,8,c,{a:0,at:0,sa:0.6});
  // flared crown
  prismN(cx,cy,r*1.5,hh,hh+0.55,8,c,{a:0.36,at:0.5,sa:0.6});
  // flare, the thing that makes it read as burning
  glow('rgba(255,150,60,0.95)',13*GLOW,function(){
    ctx.fillStyle='rgba(255,190,110,'+(0.9*GLOW).toFixed(2)+')';
    ctx.beginPath();ctx.arc(px(cx,cy),py(cx,cy,hh+1.0),1.5+rng()*0.8,0,6.284);ctx.fill();
    ctx.strokeStyle='rgba(255,170,80,'+(0.5*GLOW).toFixed(2)+')';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(px(cx,cy),py(cx,cy,hh+0.5));
    ctx.lineTo(px(cx,cy),py(cx,cy,hh+2.4));ctx.stroke();});
}

function formCoolingTower(l,h,c,rng){
  var cx=l.x+l.w/2, cy=l.y+l.d/2;
  var R=Math.min(l.w,l.d)*0.46;
  var hh=Math.max(3,h*1.05);
  // waisted profile: wide foot, pinched middle, flared lip
  var rings=7;
  for(var i=0;i<rings;i++){
    var t=i/(rings-1);
    var r=R*(1-0.45*Math.sin(t*Math.PI*0.86));
    var r2=R*(1-0.45*Math.sin(Math.min(1,(i+1)/(rings-1))*Math.PI*0.86));
    var z0=hh*t, z1=hh*Math.min(1,(i+1)/(rings-1));
    prismN(cx,cy,(r+r2)/2,z0,z1,12,c,{a:0.30,at:0.0,sa:0.34,stroke:i===rings-1});
  }
  prismN(cx,cy,R*0.62,hh,hh+0.3,12,c,{a:0.34,at:0.46,sa:0.55});
  // vented steam
  glow(rgba(c,0.6,1.2),10*GLOW,function(){
    ctx.strokeStyle=rgba(c,0.35*GLOW,1.4);ctx.lineWidth=1.5;
    prismN(cx,cy,R*0.62,hh+0.3,hh+0.32,12,c,{a:0,at:0,sa:0.5});});
}

function formTankFarm(l,h,c,rng){
  // several squat drums on a shared pad, with a walkway
  var pad={x:l.x-0.3,y:l.y-0.3,w:l.w+0.6,d:l.d+0.6};
  ctx.fillStyle=rgba(c,0.16,0.4);
  pth([[px(pad.x,pad.y),py(pad.x,pad.y,0)],[px(pad.x+pad.w,pad.y),py(pad.x+pad.w,pad.y,0)],
       [px(pad.x+pad.w,pad.y+pad.d),py(pad.x+pad.w,pad.y+pad.d,0)],
       [px(pad.x,pad.y+pad.d),py(pad.x,pad.y+pad.d,0)]]);ctx.fill();
  var n=2+Math.floor(rng()*2);
  for(var i=0;i<n;i++){
    var tx=l.x+l.w*(0.28+0.44*(i%2)), ty=l.y+l.d*(0.28+0.44*Math.floor(i/2));
    var r=Math.min(l.w,l.d)*0.2, th=Math.max(0.9,h*0.30)*(0.8+rng()*0.4);
    prismN(tx,ty,r,0,th,10,c,{a:0.34,at:0.5,sa:0.55});
    ctx.strokeStyle=rgba(c,0.4,1.3);ctx.lineWidth=1;
    prismN(tx,ty,r*1.04,th*0.55,th*0.55+0.02,10,c,{a:0,at:0,sa:0.5});
  }
}

function formFoundry(l,h,c,rng){
  // sawtooth shed with molten light bleeding through the north lights
  var hh=Math.max(1.4,h*0.5);
  box(l,0,hh,c,{a:0.30,at:0.0,sa:0.5});
  var teeth=Math.max(3,Math.round(l.d/1.1));
  for(var i=0;i<teeth;i++){
    var y0=l.y+(l.d/teeth)*i, y1=y0+(l.d/teeth)*0.96;
    // sloped face
    ctx.fillStyle=rgba(c,0.42,0.72);
    pth([[px(l.x,y0),py(l.x,y0,hh)],[px(l.x+l.w,y0),py(l.x+l.w,y0,hh)],
         [px(l.x+l.w,y1),py(l.x+l.w,y1,hh+0.62)],[px(l.x,y1),py(l.x,y1,hh+0.62)]]);ctx.fill();
    // glazed riser, lit from within
    glow('rgba(255,150,60,0.85)',7*GLOW,function(){
      ctx.strokeStyle='rgba(255,170,90,'+(0.55*GLOW+0.2).toFixed(2)+')';ctx.lineWidth=1.6;
      ctx.beginPath();ctx.moveTo(px(l.x,y1),py(l.x,y1,hh+0.62));
      ctx.lineTo(px(l.x+l.w,y1),py(l.x+l.w,y1,hh+0.62));ctx.stroke();});
  }
  ctx.strokeStyle=rgba(c,0.5,1.1);ctx.lineWidth=1;
  pth([[px(l.x,l.y),py(l.x,l.y,hh)],[px(l.x+l.w,l.y),py(l.x+l.w,l.y,hh)],
       [px(l.x+l.w,l.y+l.d),py(l.x+l.w,l.y+l.d,hh)],[px(l.x,l.y+l.d),py(l.x,l.y+l.d,hh)]]);ctx.stroke();
}

function formPipeRack(l,h,c,rng){
  // low trestle carrying pipe runs, the connective tissue of a plant
  var hh=Math.max(1.1,h*0.26);
  var n=3;
  for(var i=0;i<n;i++){
    var yy=l.y+l.d*(0.25+0.25*i);
    ctx.strokeStyle=rgba(c,0.55,1.25);ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(px(l.x-0.6,yy),py(l.x-0.6,yy,hh));
    ctx.lineTo(px(l.x+l.w+0.6,yy),py(l.x+l.w+0.6,yy,hh));ctx.stroke();
  }
  ctx.strokeStyle=rgba(c,0.42,1);ctx.lineWidth=1;
  for(var t=0;t<=2;t++){
    var xx=l.x+l.w*(t/2);
    ctx.beginPath();ctx.moveTo(px(xx,l.y+l.d*0.2),py(xx,l.y+l.d*0.2,0));
    ctx.lineTo(px(xx,l.y+l.d*0.2),py(xx,l.y+l.d*0.2,hh+0.25));
    ctx.lineTo(px(xx,l.y+l.d*0.8),py(xx,l.y+l.d*0.8,hh+0.25));
    ctx.lineTo(px(xx,l.y+l.d*0.8),py(xx,l.y+l.d*0.8,0));ctx.stroke();
  }
}

function formMegaBlock(l,h,c,rng){
  // spans well past its own footprint on purpose
  var g=2.3;
  var big={x:l.x-l.w*(g-1)/2, y:l.y-l.d*(g-1)/2, w:l.w*g, d:l.d*g};
  var hh=Math.max(8,h*2.9);
  shadow(big);
  var dark={r:c.r*0.22,g:c.g*0.24,b:c.b*0.30};
  var steps=4, z=0;
  for(var i=0;i<steps;i++){
    var f=i*0.11;
    var seg={x:big.x+big.w*f*0.5,y:big.y+big.d*f*0.5,w:big.w*(1-f),d:big.d*(1-f)};
    var top=hh*((i+1)/steps);
    box(seg,z,top,dark,{a:0.92,at:0.95,sa:0,roofK:1.0,stroke:false});
    // horizontal light bands, the signature
    for(var b=z+0.9;b<top-0.4;b+=1.25){
      ctx.strokeStyle=rgba(c,(0.30+rng()*0.45)*GLOW,1.7);
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,b));
      ctx.lineTo(px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,b));
      ctx.lineTo(px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,b));
      ctx.stroke();
    }
    ctx.strokeStyle=rgba(c,0.55,1.5);ctx.lineWidth=1;
    pth([[px(seg.x,seg.y),py(seg.x,seg.y,top)],[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,top)],
         [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,top)],
         [px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,top)]]);ctx.stroke();
    z=top;
  }
  // crown beacon
  var cx=big.x+big.w/2, cy=big.y+big.d/2;
  glow(rgba(c,1,1.6),14*GLOW,function(){
    ctx.fillStyle=rgba(c,0.95,1.8);
    ctx.beginPath();ctx.arc(px(cx,cy),py(cx,cy,hh+1.2),1.8,0,6.284);ctx.fill();});
  l.__tall={x:cx,y:cy,z:hh};   // remembered so traffic lanes can link tower tops
}

function formHoloTower(l,h,c,rng){
  var sh=0.6;
  var t={x:l.x+l.w*(1-sh)/2,y:l.y+l.d*(1-sh)/2,w:l.w*sh,d:l.d*sh};
  var hh=Math.max(4,h*1.8);
  shadow(t);
  var dark={r:c.r*0.25,g:c.g*0.27,b:c.b*0.34};
  box(t,0,hh,dark,{a:0.9,at:0.92,sa:0,stroke:false});
  ctx.strokeStyle=rgba(c,0.5,1.5);ctx.lineWidth=1;
  pth([[px(t.x,t.y),py(t.x,t.y,hh)],[px(t.x+t.w,t.y),py(t.x+t.w,t.y,hh)],
       [px(t.x+t.w,t.y+t.d),py(t.x+t.w,t.y+t.d,hh)],[px(t.x,t.y+t.d),py(t.x,t.y+t.d,hh)]]);ctx.stroke();
  // a vast advertising panel down one face
  var z0=hh*0.28, z1=hh*0.86;
  glow(rgba(c,1,1.7),12*GLOW,function(){
    ctx.fillStyle=rgba(c,0.30*GLOW,1.8);
    pth([[px(t.x+t.w,t.y+t.d*0.12),py(t.x+t.w,t.y+t.d*0.12,z1)],
         [px(t.x+t.w,t.y+t.d*0.88),py(t.x+t.w,t.y+t.d*0.88,z1)],
         [px(t.x+t.w,t.y+t.d*0.88),py(t.x+t.w,t.y+t.d*0.88,z0)],
         [px(t.x+t.w,t.y+t.d*0.12),py(t.x+t.w,t.y+t.d*0.12,z0)]]);ctx.fill();
    ctx.strokeStyle=rgba(c,0.8*GLOW,1.9);ctx.lineWidth=1;
    for(var b=z0+0.5;b<z1;b+=0.9){
      ctx.beginPath();
      ctx.moveTo(px(t.x+t.w,t.y+t.d*0.12),py(t.x+t.w,t.y+t.d*0.12,b));
      ctx.lineTo(px(t.x+t.w,t.y+t.d*0.88),py(t.x+t.w,t.y+t.d*0.88,b));ctx.stroke();
    }});
  l.__tall={x:t.x+t.w/2,y:t.y+t.d/2,z:hh};
}

function formStackedArc(l,h,c,rng){
  // tiered mass with deep light wells between the tiers
  var hh=Math.max(3,h*1.3);
  var dark={r:c.r*0.28,g:c.g*0.30,b:c.b*0.38};
  shadow(l);
  var tiers=3, z=0;
  for(var i=0;i<tiers;i++){
    var f=i*0.18;
    var seg={x:l.x+l.w*f*0.5,y:l.y+l.d*f*0.5,w:l.w*(1-f),d:l.d*(1-f)};
    var top=hh*((i+1)/tiers)*(0.92+rng()*0.14);
    box(seg,z,top,dark,{a:0.9,at:0.92,sa:0,stroke:false});
    // lit undercut where each tier overhangs the one above
    glow(rgba(c,0.9,1.6),6*GLOW,function(){
      ctx.strokeStyle=rgba(c,0.7*GLOW,1.7);ctx.lineWidth=1.4;
      pth([[px(seg.x,seg.y),py(seg.x,seg.y,top)],[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,top)],
           [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,top)],
           [px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,top)]]);ctx.stroke();});
    z=top;
  }
  windows(l.x,l.y,l.w,l.d,0,hh*0.6,c,rng,0.22+LIT*0.4,0.85);
}

function formLowTech(l,h,c,rng){
  // the small stuff that makes the big stuff look big
  var hh=Math.max(0.7,h*0.42);
  var dark={r:c.r*0.3,g:c.g*0.32,b:c.b*0.4};
  box(l,0,hh,dark,{a:0.88,at:0.9,sa:0,stroke:false});
  ctx.strokeStyle=rgba(c,0.45,1.5);ctx.lineWidth=1;
  pth([[px(l.x,l.y),py(l.x,l.y,hh)],[px(l.x+l.w,l.y),py(l.x+l.w,l.y,hh)],
       [px(l.x+l.w,l.y+l.d),py(l.x+l.w,l.y+l.d,hh)],[px(l.x,l.y+l.d),py(l.x,l.y+l.d,hh)]]);ctx.stroke();
  windows(l.x,l.y,l.w,l.d,0,hh,c,rng,0.3+LIT*0.4,0.8);
}

function drawTraffic(tall,c){
  if(tall.length<2) return;
  for(var i=0;i<tall.length-1;i++){
    var a=tall[i], b=tall[i+1];
    var za=a.z*0.72, zb=b.z*0.72;
    glow(rgba(c,0.9,1.6),7*GLOW,function(){
      ctx.strokeStyle=rgba(c,0.18*GLOW,1.5);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(px(a.x,a.y),py(a.x,a.y,za));
      ctx.lineTo(px(b.x,b.y),py(b.x,b.y,zb));ctx.stroke();});
    var rng=mulberry32(((a.x*7919+b.y*104729)|0)>>>0);
    for(var k=0;k<3;k++){
      var t=rng();
      var tx=a.x+(b.x-a.x)*t, ty=a.y+(b.y-a.y)*t, tz=za+(zb-za)*t;
      glow(rgba(c,1,1.8),6*GLOW,function(){
        ctx.fillStyle=rgba(c,0.95,1.9);
        ctx.fillRect(px(tx,ty)-1.2,py(tx,ty,tz)-1.2,2.4,2.4);});
    }
  }
}

function formTerraceFarm(l,h,c,rng){
  var tiers=Math.max(2,Math.round(h*0.45));
  var z=0;
  for(var i=0;i<tiers;i++){
    var f=i*0.14;
    var seg={x:l.x+l.w*f*0.5,y:l.y+l.d*f*0.5,w:l.w*(1-f),d:l.d*(1-f)};
    box(seg,z,z+0.75,c,{a:0.24,at:0.30,sa:0.4});
    ctx.strokeStyle=rgba(c,(0.55+rng()*0.3)*GLOW,1.5);ctx.lineWidth=1.5;
    pth([[px(seg.x,seg.y),py(seg.x,seg.y,z+0.75)],[px(seg.x+seg.w,seg.y),py(seg.x+seg.w,seg.y,z+0.75)],
         [px(seg.x+seg.w,seg.y+seg.d),py(seg.x+seg.w,seg.y+seg.d,z+0.75)],
         [px(seg.x,seg.y+seg.d),py(seg.x,seg.y+seg.d,z+0.75)]]);ctx.stroke();
    z+=0.95;
  }
}

function formGlasshouse(l,h,c,rng){
  var hh=Math.max(1.2,h*0.34);
  var cx=l.x+l.w/2, cy=l.y+l.d/2, r=Math.min(l.w,l.d)*0.55;
  prismN(cx,cy,r,0,hh,8,c,{a:0.22,at:0.30,sa:0.45});
  prismN(cx,cy,r*0.72,hh,hh+0.7,8,c,{a:0.26,at:0.36,sa:0.5});
  prismN(cx,cy,r*0.4,hh+0.7,hh+1.15,8,c,{a:0.3,at:0.44,sa:0.55});
  glow(rgba(c,0.9,1.5),8*GLOW,function(){
    ctx.strokeStyle=rgba(c,0.7*GLOW,1.5);ctx.lineWidth=1;
    prismN(cx,cy,r*0.72,hh,hh+0.02,8,c,{a:0,at:0,sa:0.7});});
}

function formSilo(l,h,c,rng){
  var cx=l.x+l.w/2, cy=l.y+l.d/2, r=Math.min(l.w,l.d)*0.34;
  var hh=Math.max(2,h*0.9);
  prismN(cx,cy,r,0,hh,10,c,{a:0.30,at:0.44,sa:0.5});
  ctx.strokeStyle=rgba(c,0.45*GLOW,1.4);ctx.lineWidth=1;
  for(var b=1.2;b<hh;b+=1.5){ prismN(cx,cy,r*1.02,b,b+0.02,10,c,{a:0,at:0,sa:0.5}); }
}

function formCleanTower(l,h,c,rng){
  var cx=l.x+l.w/2, cy=l.y+l.d/2, r=Math.min(l.w,l.d)*0.42;
  var hh=Math.max(2,h*1.05);
  prismN(cx,cy,r,0,hh*0.86,12,c,{a:0.26,at:0.40,sa:0.45});
  prismN(cx,cy,r*0.7,hh*0.86,hh,12,c,{a:0.3,at:0.5,sa:0.5});
  windows(l.x,l.y,l.w,l.d,0,hh*0.86,c,rng,0.08+LIT*0.16,1.6);
  glow('rgba(200,255,255,0.9)',9*GLOW,function(){
    ctx.fillStyle=rgba(c,0.95,1.6);
    ctx.beginPath();ctx.arc(px(cx,cy),py(cx,cy,hh+0.5),1.6,0,6.284);ctx.fill();});
}

function formMedBlock(l,h,c,rng){
  var hh=Math.max(1.1,h*0.5);
  box(l,0,hh,c,{a:0.28,at:0.42,sa:0.48});
  var cx=l.x+l.w, cy=l.y+l.d*0.5, cz=hh*0.6;
  glow('rgba(200,255,255,0.9)',7*GLOW,function(){
    ctx.strokeStyle=rgba(c,0.95*GLOW,1.6);ctx.lineWidth=1.6;
    ctx.beginPath();
    ctx.moveTo(px(cx,cy-0.5),py(cx,cy-0.5,cz));ctx.lineTo(px(cx,cy+0.5),py(cx,cy+0.5,cz));
    ctx.moveTo(px(cx,cy),py(cx,cy,cz-0.55));ctx.lineTo(px(cx,cy),py(cx,cy,cz+0.55));
    ctx.stroke();});
}

// Tiers 1 to 3 come from development and top out with it. Tiers 4 and 5 exist
// ONLY above civic works, which is what makes a monumented city legible from
// across the map: nothing a merely large population can do reaches them.
function landmarkTier(dev,works){
  var w=works||0;
  if(w>=5) return 5;
  if(w>=3) return 4;
  if(dev>=13) return 3;
  if(dev>=10) return 2;
  if(dev>=6)  return 1;
  return 0;
}

function drawLandmark(s,trade,tier,dev){
  if(!tier) return;
  var c=TRADE_COL[trade];
  var cx=s.ctr[0], cy=s.ctr[1];
  var scale=[0,1,1.5,2.1,2.9,3.8][tier]||1;
  var h=(6+dev*0.9)*scale*1*0.42;
  var r=4.4*scale;
  var foot={x:cx-r,y:cy-r,w:r*2,d:r*2};
  shadow(foot);
  if(trade==='food'){
    prismN(cx,cy,r,0,h*0.5,10,c,{a:0.28,at:0.36,sa:0.5});
    prismN(cx,cy,r*0.78,h*0.5,h*0.76,10,c,{a:0.3,at:0.42,sa:0.55});
    prismN(cx,cy,r*0.45,h*0.76,h,10,c,{a:0.34,at:0.5,sa:0.6});
    glow(rgba(c,1,1.5),13*GLOW,function(){
      ctx.strokeStyle=rgba(c,0.8*GLOW,1.6);ctx.lineWidth=1.6;
      prismN(cx,cy,r*0.78,h*0.5,h*0.5+0.02,10,c,{a:0,at:0,sa:0.85});});
  } else if(trade==='med'){
    prismN(cx,cy,r*0.8,0,h*0.9,14,c,{a:0.26,at:0.4,sa:0.5});
    prismN(cx,cy,r*0.5,h*0.9,h*1.06,14,c,{a:0.32,at:0.5,sa:0.6});
    glow('rgba(210,255,255,0.95)',15*GLOW,function(){
      ctx.strokeStyle=rgba(c,0.95*GLOW,1.7);ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(px(cx,cy-1.5),py(cx,cy-1.5,h*1.2));ctx.lineTo(px(cx,cy+1.5),py(cx,cy+1.5,h*1.2));
      ctx.moveTo(px(cx,cy),py(cx,cy,h*1.2-1.6));ctx.lineTo(px(cx,cy),py(cx,cy,h*1.2+1.6));
      ctx.stroke();});
  } else if(trade==='tech'){
    // A pyramid that dwarfs the district. Dark mass, lit edges, banded faces.
    var dark={r:c.r*0.20,g:c.g*0.22,b:c.b*0.30};
    var H=h*1.7, steps=6, z=0;
    for(var i=0;i<steps;i++){
      var rr=r*(1.35-1.05*(i/steps));
      var top=H*((i+1)/steps);
      box({x:cx-rr,y:cy-rr,w:rr*2,d:rr*2},z,top,dark,{a:0.94,at:0.96,sa:0,stroke:false});
      glow(rgba(c,0.9,1.6),7*GLOW,function(){
        ctx.strokeStyle=rgba(c,0.72*GLOW,1.8);ctx.lineWidth=1.3;
        pth([[px(cx-rr,cy-rr),py(cx-rr,cy-rr,top)],[px(cx+rr,cy-rr),py(cx+rr,cy-rr,top)],
             [px(cx+rr,cy+rr),py(cx+rr,cy+rr,top)],[px(cx-rr,cy+rr),py(cx-rr,cy+rr,top)]]);ctx.stroke();});
      for(var b2=z+0.8;b2<top-0.3;b2+=1.1){
        ctx.strokeStyle=rgba(c,0.26*GLOW,1.7);ctx.lineWidth=1;
        ctx.beginPath();
        ctx.moveTo(px(cx+rr,cy-rr),py(cx+rr,cy-rr,b2));
        ctx.lineTo(px(cx+rr,cy+rr),py(cx+rr,cy+rr,b2));
        ctx.lineTo(px(cx-rr,cy+rr),py(cx-rr,cy+rr,b2));ctx.stroke();
      }
      z=top;
    }
    glow(rgba(c,1,1.9),20*GLOW,function(){
      ctx.fillStyle=rgba(c,0.98,2);
      ctx.beginPath();ctx.arc(px(cx,cy),py(cx,cy,H+1.6),2.4,0,6.284);ctx.fill();
      ctx.strokeStyle=rgba(c,0.5*GLOW,1.9);ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(px(cx,cy),py(cx,cy,H));
      ctx.lineTo(px(cx,cy),py(cx,cy,H+4.5));ctx.stroke();});
  } else {
    // export: a works. Long hall, a rank of stacks along it, gantry overhead.
    box({x:cx-r,y:cy-r*0.62,w:r*2,d:r*1.24},0,h*0.42,c,{a:0.30,at:0.42,sa:0.55});
    // sawtooth roof over the hall
    var teeth=Math.max(4,Math.round(r*1.24/1.1));
    for(var t=0;t<teeth;t++){
      var y0=cy-r*0.62+(r*1.24/teeth)*t, y1=y0+(r*1.24/teeth)*0.95;
      ctx.fillStyle=rgba(c,0.44,0.72);
      pth([[px(cx-r,y0),py(cx-r,y0,h*0.42)],[px(cx+r,y0),py(cx+r,y0,h*0.42)],
           [px(cx+r,y1),py(cx+r,y1,h*0.42+0.7)],[px(cx-r,y1),py(cx-r,y1,h*0.42+0.7)]]);ctx.fill();
      glow('rgba(255,150,60,0.8)',6*GLOW,function(){
        ctx.strokeStyle='rgba(255,175,95,'+(0.5*GLOW+0.2).toFixed(2)+')';ctx.lineWidth=1.4;
        ctx.beginPath();ctx.moveTo(px(cx-r,y1),py(cx-r,y1,h*0.42+0.7));
        ctx.lineTo(px(cx+r,y1),py(cx+r,y1,h*0.42+0.7));ctx.stroke();});
    }
    // rank of stacks
    for(var i2=0;i2<tier+1;i2++){
      var sx2=cx-r*0.6+ (r*1.2)*(i2/Math.max(1,tier));
      var sy2=cy-r*0.85;
      prismN(sx2,sy2,r*0.11,0,h*1.25,8,c,{a:0.34,at:0.48,sa:0.6});
      glow('rgba(255,150,60,0.95)',11*GLOW,function(){
        ctx.fillStyle='rgba(255,195,120,'+(0.9*GLOW).toFixed(2)+')';
        ctx.beginPath();ctx.arc(px(sx2,sy2),py(sx2,sy2,h*1.25+0.9),1.4,0,6.284);ctx.fill();});
    }
    // gantry spanning the works
    ctx.strokeStyle=rgba(c,0.72,1.3);ctx.lineWidth=2;
    [[cx-r,cy-r*0.62],[cx+r,cy-r*0.62],[cx+r,cy+r*0.62],[cx-r,cy+r*0.62]].forEach(function(p){
      ctx.beginPath();ctx.moveTo(px(p[0],p[1]),py(p[0],p[1],h*0.42));
      ctx.lineTo(px(p[0],p[1]),py(p[0],p[1],h*0.92));ctx.stroke();});
    ctx.beginPath();ctx.moveTo(px(cx-r,cy-r*0.62),py(cx-r,cy-r*0.62,h*0.92));
    ctx.lineTo(px(cx+r,cy+r*0.62),py(cx+r,cy+r*0.62,h*0.92));ctx.stroke();
  }
}

var FORMS={
  // ordered [common, common, occasional, rare] and drawn 72/18/10
  export:[formTankFarm,formFoundry,formCoolingTower,formChimney],
  food:  [formTerraceFarm,formGlasshouse,formTerraceFarm,formSilo],
  med:   [formMedBlock,formCleanTower,formMedBlock,formCleanTower],
  tech:  [formLowTech,formStackedArc,formHoloTower,formMegaBlock]
};

// What a district builds in. Three sources in priority order, because all
// three are real and they take over from each other as a district develops:
//   1. the mayor's nominated favoured trade, the explicit political choice
//   2. failing that, whatever its storefronts actually trade in most
//   3. failing that, a stable per-district default, so a city under NPC
//      administration still reads as a varied place on day one and then
//      visibly morphs as players specialise it
function districtTrade(s){
  var d=s.d||{};
  if(d.favoured && TRADE_COL[d.favoured]) return d.favoured;
  var shops=s.shops||[];
  if(shops.length){
    var n={};
    for(var i=0;i<shops.length;i++) n[shops[i].kind]=(n[shops[i].kind]||0)+1;
    var best=null, bv=0;
    for(var k in n){ if(n[k]>bv){ bv=n[k]; best=k; } }
    if(best && TRADE_COL[best]) return best;
  }
  var r=mulberry32(seedFromId('trade:'+(cOpen||'')+':'+(s.idx||0)));
  r();
  return TRADES[Math.floor(r()*TRADES.length)];
}

function drawSector(s){
  ZB=s.zb||0;
  var st=stageOf(s), c=zoneBase(s.zone), on=(SECTORS[sel]===s), ft=factionTint();
  var held=s.mayor?ownerCol(s.mayor):null;
  var hi = !hlOwner || s.mayor===hlOwner;
  var a = hi?1:0.26;
  var trade=districtTrade(s);
  var tc=TRADE_COL[trade]||c;

  // Ground plate, tinted by whoever governs it.
  ctx.fillStyle=rgba(held||ft,(on?0.20:(held?0.13:0.07))*a,0.55);
  pth(s.poly.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],0)];}));ctx.fill();

  var dev=s.dev||1, works=s.works||0, blocks=s.blocks||[];
  // Development fills the ground; works go UP. Once every footprint is built
  // there is nowhere left to spread, so the only thing billions can buy is
  // height, which is the intended read on a well funded city.
  var lift=1+works*0.34;
  var fill=clamp(dev/14,0.14,1);
  var built=Math.min(blocks.length,Math.max(1,Math.floor(blocks.length*fill)));

  ctx.strokeStyle=rgba(on?(held||tc):(held||ft),(on?0.95:(held?0.62:0.42))*a);
  ctx.lineWidth=on?2:(held?1.6:1);
  if(cData&&cData.contested)ctx.setLineDash([4,3]);
  pth(s.poly.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],0)];}));
  ctx.stroke();ctx.setLineDash([]);

  if(!blocks.length){ZB=0;return;}

  // Podium once the district is decked.
  var base=0;
  if(st>=3){
    base = st>=4?5.4:3.6;
    prism(insetPoly(s.poly,st>=4?0.035:0.05),base,tc,{a:0.30*a,at:0.26*a,sa:0.5*a});
  }

  var lm=landmarkTier(dev,works);
  var lmR=5.5*[0,1,1.5,2.1][lm];
  var kit=FORMS[trade]||FORMS.export;
  var tall=[];
  for(var bi=0;bi<built;bi++){
    var l=blocks[bi], rng=blockRng(l);
    var h=Math.pow(dev,1.20)*0.30*l.hv*(l.tall?1.75:1)*(0.72+rng()*0.62)
          *(l.tall?lift:1+(lift-1)*0.45);
    if(h<0.4) continue;
    // keep the landmark's ground clear so it is not buried
    if(lm && Math.hypot(l.x-s.ctr[0], l.y-s.ctr[1]) < lmR) continue;
    if(!hi){
      // dimmed while another holder is highlighted: silhouette only
      boxAt(l,base+h,tc,{a:0.09,at:0.12,sa:0.16});
      continue;
    }
    var pick=rng(), form;
    if(pick<0.72)      form=kit[Math.floor(rng()*2)];
    else if(pick<0.90) form=kit[2];
    else               form=kit[3];
    form(l,base+h,tc,rng);
    if(l.__tall){ tall.push(l.__tall); l.__tall=null; }
  }

  // Plant infrastructure ties an industrial district together.
  if(hi && trade==='export'){
    for(var pi=0;pi<built;pi+=4){
      var pl=blocks[pi];
      if(!pl) continue;
      if(lm && Math.hypot(pl.x-s.ctr[0], pl.y-s.ctr[1]) < lmR) continue;
      formPipeRack(pl,2.2,tc,blockRng(pl));
    }
  }
  // Air traffic between the tall structures.
  if(hi && trade==='tech') drawTraffic(tall,tc);
  if(hi && lm) drawLandmark(s,trade,lm,dev*(1+works*0.16));
  ZB=0;
}

// ── Backdrop and terrain ─────────────────────────────────────────────────────
function world(){ return (cData&&cData.geometry&&cData.geometry.world)||{w:230,h:170}; }
function bounds(){ var W=world(); return [[6,6],[W.w-6,6],[W.w-6,W.h-6],[6,W.h-6]]; }
function chanC(y){return 118+Math.sin(y*0.052)*20+Math.sin(y*0.15)*6;}
function chanW(y){return 9+Math.sin(y*0.09)*3;}

function drawStars(){
  var rng=mulberry32(0xB007);
  for(var i=0;i<250;i++){var x=rng()*CW,y=rng()*CH*0.6,b=rng();
    ctx.fillStyle='rgba(182,255,207,'+(0.10+b*0.46).toFixed(2)+')';
    ctx.fillRect(x|0,y|0,b>0.96?2:1,b>0.96?2:1);}
  // A faint disc used to sit here as a moon. It read as an unexplained empty
  // circle rather than a celestial body, so it is gone.

}
function drawTerrain(){
  var Tn=(cData&&cData.geometry&&cData.geometry.terrain)||'dust';
  var W=world(), WW=W.w, WH=W.h;
  var plate=bounds().map(function(v){return [px(v[0],v[1]),py(v[0],v[1],0)];});
  if(Tn==='station'){
    pth(plate);ctx.fillStyle='rgba(8,20,14,0.80)';ctx.fill();
    glow('rgba(66,255,126,0.7)',10,function(){
      ctx.strokeStyle='rgba(66,255,126,0.5)';ctx.lineWidth=2;ctx.stroke();});
    ctx.strokeStyle='rgba(66,255,126,0.12)';ctx.lineWidth=1;
    for(var x=6;x<=WW-6;x+=14){ctx.beginPath();
      ctx.moveTo(px(x,6),py(x,6,0));ctx.lineTo(px(x,WH-6),py(x,WH-6,0));ctx.stroke();}
    for(var y=6;y<=WH-6;y+=14){ctx.beginPath();
      ctx.moveTo(px(6,y),py(6,y,0));ctx.lineTo(px(WW-6,y),py(WW-6,y,0));ctx.stroke();}
    return;
  }
  var base={dust:'rgba(46,34,16,0.55)',veins:'rgba(20,38,24,0.6)',rift:'rgba(22,16,34,0.62)',
            ice:'rgba(16,38,44,0.55)',tether:'rgba(16,40,26,0.55)',
            ocean:'rgba(10,34,52,0.62)'}[Tn]||'rgba(20,38,24,0.6)';
  pth(plate);ctx.fillStyle=base;ctx.fill();
  ctx.strokeStyle='rgba(47,159,74,0.26)';ctx.lineWidth=1;ctx.stroke();
  if(Tn==='dust'){var rng=mulberry32(0xD05);ctx.strokeStyle='rgba(220,170,90,0.10)';
    for(var i=0;i<24;i++){var y0=6+rng()*(WH-12);ctx.beginPath();
      for(var x2=6;x2<=WW-6;x2+=8){var yy=y0+Math.sin(x2*0.055+i)*4.5;
        if(x2===6)ctx.moveTo(px(x2,yy),py(x2,yy,0));else ctx.lineTo(px(x2,yy),py(x2,yy,0));}
      ctx.stroke();}}
  if(Tn==='veins'){var r2=mulberry32(0x7E1);
    glow('rgba(255,206,77,0.9)',9,function(){ctx.strokeStyle='rgba(255,206,77,0.5)';
      for(var v=0;v<7;v++){var x=14+r2()*(WW-28),y=8,w=1.2+r2()*1.6;
        ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(px(x,y),py(x,y,0));
        while(y<WH-8){y+=7+r2()*9;x=clamp(x+(r2()-0.5)*22,8,WW-8);
          ctx.lineTo(px(x,y),py(x,y,0));}ctx.stroke();}});}
  if(Tn==='rift'){
    var rc=function(y){return 104+Math.sin(y*0.041)*26+Math.sin(y*0.13)*7;};
    var rw=function(y){return 11+Math.sin(y*0.07)*4;};
    var pts=[],y3;
    for(y3=6;y3<=WH-6;y3+=3)pts.push([px(rc(y3)-rw(y3),y3),py(rc(y3)-rw(y3),y3,0)]);
    for(y3=WH-6;y3>=6;y3-=3)pts.push([px(rc(y3)+rw(y3),y3),py(rc(y3)+rw(y3),y3,0)]);
    pth(pts);ctx.fillStyle='rgba(6,2,14,0.92)';ctx.fill();
    glow('rgba(190,130,255,0.9)',14,function(){
      ctx.strokeStyle='rgba(190,130,255,0.5)';ctx.lineWidth=2;ctx.stroke();});
    var r3=mulberry32(0x4D2);ctx.fillStyle='rgba(210,160,255,0.5)';
    for(var i3=0;i3<80;i3++){var yy3=6+r3()*(WH-12),xx3=rc(yy3)+(r3()-0.5)*rw(yy3)*1.4;
      ctx.fillRect(px(xx3,yy3)|0,py(xx3,yy3,0)|0,2,1);}}
  if(Tn==='ice'){var pts2=[],y4;
    for(y4=6;y4<=WH-6;y4+=3)pts2.push([px(chanC(y4)-chanW(y4),y4),py(chanC(y4)-chanW(y4),y4,0)]);
    for(y4=WH-6;y4>=6;y4-=3)pts2.push([px(chanC(y4)+chanW(y4),y4),py(chanC(y4)+chanW(y4),y4,0)]);
    pth(pts2);ctx.fillStyle='rgba(28,96,126,0.45)';ctx.fill();
    ctx.strokeStyle='rgba(140,225,250,0.4)';ctx.lineWidth=1;ctx.stroke();}
  // Ocean: open water with a swell running across it and a shelf line. Not ice
  // channels tinted blue; a world that is water rather than a world with water
  // on it, which is the difference KS-07 needed.
  if(Tn==='ocean'){
    var ro=mulberry32(0x0CEA);
    ctx.strokeStyle='rgba(90,180,220,0.13)';ctx.lineWidth=1;
    for(var so=0;so<26;so++){
      var yb=6+ro()*(WH-12);ctx.beginPath();
      for(var xo=6;xo<=WW-6;xo+=7){
        var yy2=yb+Math.sin(xo*0.035+so*1.7)*5.5+Math.sin(xo*0.11+so)*1.8;
        if(xo===6)ctx.moveTo(px(xo,yy2),py(xo,yy2,0));else ctx.lineTo(px(xo,yy2),py(xo,yy2,0));
      }
      ctx.stroke();
    }
    glow('rgba(140,225,250,0.7)',8,function(){
      ctx.strokeStyle='rgba(140,225,250,0.30)';ctx.lineWidth=1.6;ctx.beginPath();
      for(var xs=6;xs<=WW-6;xs+=6){
        var ys=WH*0.34+Math.sin(xs*0.026)*16+Math.sin(xs*0.07)*4;
        if(xs===6)ctx.moveTo(px(xs,ys),py(xs,ys,0));else ctx.lineTo(px(xs,ys),py(xs,ys,0));
      }
      ctx.stroke();});
  }
  if(Tn==='tether'){ctx.strokeStyle='rgba(120,200,150,0.12)';ctx.lineWidth=6;
    for(var a=0;a<8;a++){var th=a/8*6.283+0.2;
      ctx.beginPath();ctx.moveTo(px(WW/2,WH/2),py(WW/2,WH/2,0));
      ctx.lineTo(px(WW/2+Math.cos(th)*100,WH/2+Math.sin(th)*74),
                 py(WW/2+Math.cos(th)*100,WH/2+Math.sin(th)*74,0));ctx.stroke();}}
}
function drawTether(){
  if(!cData||!cData.geometry||cData.geometry.terrain!=='tether')return;
  var W=world();
  var x=px(W.w/2,W.h/2), yb=py(W.w/2,W.h/2,6);
  var g=ctx.createLinearGradient(0,yb,0,0);
  g.addColorStop(0,'rgba(255,206,77,0.55)');g.addColorStop(1,'rgba(255,206,77,0.04)');
  ctx.strokeStyle=g;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(x,yb);ctx.lineTo(x,0);ctx.stroke();
  glow('rgba(255,206,77,0.9)',10,function(){
    for(var i=1;i<=6;i++){var yy=yb-yb*(i/7),r=13-i*1.5;
      ctx.strokeStyle='rgba(255,206,77,'+(0.42-i*0.05).toFixed(2)+')';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.ellipse(x,yy,Math.max(3,r),Math.max(1.2,r*0.34),0,0,6.284);ctx.stroke();}});
}
function drawSkyways(){
  ZB=0;
  for(var i=0;i<SECTORS.length;i++)for(var j=i+1;j<SECTORS.length;j++){
    var a=SECTORS[i],b=SECTORS[j];
    if(Math.hypot(a.ctr[0]-b.ctr[0],a.ctr[1]-b.ctr[1])>58) continue;
    var za=15+(a.zb||0), zb2=15+(b.zb||0);
    ctx.strokeStyle='rgba(120,200,150,0.26)';ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(px(a.ctr[0],a.ctr[1]),py(a.ctr[0],a.ctr[1],a.zb||0));
    ctx.lineTo(px(a.ctr[0],a.ctr[1]),py(a.ctr[0],a.ctr[1],za));ctx.stroke();
    ctx.beginPath();ctx.moveTo(px(b.ctr[0],b.ctr[1]),py(b.ctr[0],b.ctr[1],b.zb||0));
    ctx.lineTo(px(b.ctr[0],b.ctr[1]),py(b.ctr[0],b.ctr[1],zb2));ctx.stroke();
    (function(a2,b2,za2,zb3){ glow('rgba(150,255,190,0.5)',6,function(){
      ctx.strokeStyle='rgba(150,255,190,0.32)';ctx.lineWidth=2.4;
      ctx.beginPath();ctx.moveTo(px(a2.ctr[0],a2.ctr[1]),py(a2.ctr[0],a2.ctr[1],za2));
      ctx.lineTo(px(b2.ctr[0],b2.ctr[1]),py(b2.ctr[0],b2.ctr[1],zb3));ctx.stroke();});})(a,b,za,zb2);
    var rng=mulberry32((i*911)^(j*577));
    for(var k=0;k<2;k++){var t=rng();
      var tx=a.ctr[0]+(b.ctr[0]-a.ctr[0])*t, ty=a.ctr[1]+(b.ctr[1]-a.ctr[1])*t, tz=za+(zb2-za)*t;
      ctx.fillStyle='rgba(255,240,190,0.85)';
      ctx.fillRect(px(tx,ty)-1.5,py(tx,ty,tz)-1.5,3,3);}
  }
}
function viewScale(){ return DPR*view.z; }
// Canvas device pixel -> world units, the inverse of the transform below.
function toWorld(devX,devY){
  var k=viewScale();
  return [ (devX-view.tx)/k, (devY-view.ty)/k ];
}
function draw(){
  if(!cv||!ctx) return;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#010401';ctx.fillRect(0,0,cv.width,cv.height);
  var k=viewScale();
  ctx.setTransform(k,0,0,k,view.tx,view.ty);ctx.imageSmoothingEnabled=false;
  ctx.save(); ctx.setTransform(DPR,0,0,DPR,0,0);
  ZB=0; drawStars(); ctx.restore();
  drawTerrain(); drawSkyways(); drawTether();
  SECTORS.forEach(drawSector); ZB=0;
  SECTORS.forEach(function(s){
    var c=TRADE_COL[districtTrade(s)]||zoneBase(s.zone),on=(SECTORS[sel]===s),st=stageOf(s);
    var bb=s.bb, tx=px(bb[0],bb[1])+4, ty=py(bb[0],bb[1],s.zb||0)+4;
    ctx.fillStyle='rgba(1,4,1,0.72)';ctx.fillRect(tx-3,ty-2,s.n.length*6.3+14,21);
    ctx.fillStyle=rgba(c,on?1:0.76);ctx.font='11px "Share Tech Mono", monospace';
    ctx.fillText(s.n.toUpperCase(),tx,ty+9);
    ctx.fillStyle='rgba(95,143,112,0.95)';ctx.font='9px "IBM Plex Mono", monospace';
    ctx.fillText(STAGES[st].n,tx,ty+18);
  });
}

// ── Interior view ────────────────────────────────────────────────────────────
// Ownership is granular at every stage. Below PLATFORM the sector reads as a
// plan of individual holdings. At CONURBATION and above the structure is one
// mass, so the honest view is a vertical section: the same owners, stacked as
// levels. Nothing is merged in the data, only in the render.
// The frontage. Every storefront in the selected district, vacancies included.
// This is where a quarter gets its character, because the names are the
// players' own, so it is HTML rather than canvas: selectable, readable, and it
// survives a panel rebuild without rebinding anything.
function renderFrontageBox(){
  if(!SECTORS.length||!cData) return '';
  var s=SECTORS[sel], d=s.d||{};
  var shops=(s.shops||[]).slice().sort(function(a,b){return b.net-a.net;});
  var slots=d.slots||0, free=Math.max(0,slots-shops.length);
  var h='<p class="cyt">'+T('city.frontage','The frontage')+' <span class="sub">&middot; '
    +shops.length+' '+T('city.of','of')+' '+slots+' '+T('city.let','let')+'</span></p>';
  if(!shops.length){
    h+='<div class="cynote">'+T('city.noFrontage','No storefronts occupied. All frontage vacant.')+'</div>';
    return h;
  }
  var canBuy = !cData.summary.locked;
  h+='<div class="cyshops">';
  shops.slice(0,40).forEach(function(sh){
    var oc=sh.npc?{r:120,g:150,b:130}:ownerCol(sh.owner);
    h+='<div class="cyshop'+(sh.mine?' mine':'')+(sh.npc?' npc':'')+'" style="border-left-color:'+rgbs(oc,0.9)+'"'
      +(sh.descr?' title="'+esc(sh.descr)+'"':'')+'>'
      +'<span class="n">'+esc(sh.name)+'</span>'
      +'<span class="m">'+(KIND_LABEL[sh.kind]||sh.kind)+' &middot; '
      +(sh.npc?T('city.npcRun','independent'):esc(sh.ownerName||'?'))+'</span>'
      +'<span class="v">'+fm(sh.net)+'/wk'
      +((sh.npc&&canBuy)?('<button class="cybtn" style="padding:1px 6px;font-size:10px;margin:2px 0 0 0;display:block" onclick="window.cityBuyShop('+sh.id+',\''+esc(String(sh.name).replace(/'/g,''))+'\','+sh.buyout+')">'
        +T('city.buy','BUY')+' '+fm(sh.buyout)+'</button>'):'')
      +'</span></div>';
  });
  h+='</div>';
  if(shops.length>40) h+='<div class="cynote">'+T('city.andMore','and')+' '+(shops.length-40)+' '+T('city.more','more')+'</div>';
  if(free>0) h+='<div class="cynote">'+free+' '+T('city.vacantFrontage','vacant frontages')+'</div>';
  h+='<p class="cynote">'+T('city.npcHint','Independent firms are established and trade at full rate. Buying one transfers its position and income immediately. A newly leased frontage opens at a fraction of full trade and climbs over roughly twelve weeks.')+'</p>';
  return h;
}

// ── Overlay shell ────────────────────────────────────────────────────────────
// The Cities tab is the only home. There used to be a modal overlay as well,
// sharing these renderers through a second set of chrome; it is gone. Two
// hosts meant the stylesheet had to be scoped to both, the scoping was written
// as a selector-list prefix, and selector lists do not distribute: every rule
// ended up applying its declarations to the overlay element itself. One of
// them set height:3px on a position:fixed inset:0 element, which drew a green
// line across the whole page instead of a city. One home, one selector.
var _stylesIn = false;
function ensureStyles(){
  if(_stylesIn) return;
  _stylesIn = true;
  var css=document.createElement('style');
  css.id='fmCityStyles';
  var SCOPE='.fmcity';
  css.textContent=[
    '.fmcity{--cy-green:#42ff7e;--cy-pale:#b6ffcf;--cy-amber:#f0b454;--cy-gold:#ffce4d;',
    ' --cy-bad:#ff6a6a;--cy-muted:#9af2bf;--cy-hr:#0a3315;--cy-s2:#04160a;--cy-edge:#2f9f4a;',
    ' --cy-pbg:rgba(9,32,17,0.5);--cy-dim:#5f8f70;}',
    'SCOPE .cyp{background:var(--cy-pbg);border:1px solid var(--cy-edge);border-radius:2px;',
    ' box-shadow:0 0 10px #1aff5e14, inset 0 0 1px #1aff5e44;padding:10px 12px;margin-bottom:10px}',
    'SCOPE .cyt{color:var(--cy-amber);letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin:0 0 8px}',
    'SCOPE .cyt .sub{color:var(--cy-dim);text-transform:none;letter-spacing:0}',
    'SCOPE .cykv{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-bottom:1px dotted #0a331580}',
    'SCOPE .cykv:last-child{border-bottom:0}',
    'SCOPE .cykv .k{color:var(--cy-muted)}',
    'SCOPE .cykv .v{color:var(--cy-pale);text-align:right;white-space:nowrap}',
    'SCOPE .v.gold{color:var(--cy-gold)}',
    'SCOPE .v.good{color:#9bffba}',
    'SCOPE .v.amber{color:var(--cy-amber)}',
    'SCOPE .v.bad{color:var(--cy-bad)}',
    'SCOPE .num{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px}',
    'SCOPE .cvwrap{position:relative;background:#010401;border:1px solid var(--cy-hr);overflow:hidden}',
    'SCOPE canvas{display:block;width:100%;height:auto;cursor:pointer;image-rendering:pixelated}',
    'SCOPE .hud{position:absolute;left:10px;top:9px;pointer-events:none}',
    'SCOPE .hud .st{display:block;font-size:18px;color:var(--cy-gold);letter-spacing:.07em;line-height:1.1}',
    'SCOPE .hud .sub{display:block;font-size:11px;color:var(--cy-dim);letter-spacing:.06em;margin-top:2px}',
    'SCOPE .hud .sub b{color:var(--cy-amber);font-weight:400}',
    'SCOPE .ctab{display:flex;gap:5px;margin-bottom:10px;flex-wrap:wrap}',
    'SCOPE .ctab button{flex:1 1 120px;min-width:118px;background:var(--cy-s2);border:1px solid var(--cy-edge);',
    ' color:var(--cy-muted);font:inherit;font-size:11px;padding:5px 7px;cursor:pointer;border-radius:2px;text-align:left;line-height:1.2}',
    'SCOPE .ctab button b{display:block;color:var(--cy-pale);font-size:12px}',
    'SCOPE .ctab button .m{font-size:9px;color:var(--cy-dim);font-family:"IBM Plex Mono",monospace}',
    'SCOPE .ctab button[aria-pressed="true"]{border-color:var(--cy-gold);background:#0a2413}',
    'SCOPE .ctab button[aria-pressed="true"] b{color:var(--cy-gold)}',
    'SCOPE .cybtn{background:var(--cy-s2);border:1px solid var(--cy-edge);color:var(--cy-amber);',
    ' padding:5px 11px;font:inherit;font-size:12px;cursor:pointer;border-radius:2px;margin:3px 4px 0 0}',
    'SCOPE .cybtn:hover:not(:disabled){color:var(--cy-gold);border-color:var(--cy-gold)}',
    'SCOPE .cybtn:disabled{opacity:.4;cursor:default}',
    'SCOPE .cybtn.hot{border-color:#7a3030;color:var(--cy-bad)}',
    'SCOPE .gate{margin-top:7px}',
    'SCOPE .gate .gh{display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px}',
    'SCOPE .gate .gh .gn{color:var(--cy-pale)}',
    'SCOPE .gate .gh .gv{font-family:"IBM Plex Mono",monospace;color:var(--cy-amber)}',
    'SCOPE .gate .bar{height:9px;background:#010401;border:1px solid var(--cy-hr);position:relative;overflow:hidden}',
    'SCOPE .gate .bar i{position:absolute;top:0;bottom:0;left:0;background:rgba(66,255,126,0.35);border-right:1px solid var(--cy-green)}',
    'SCOPE .gate .hint{font-size:10px;color:var(--cy-dim);margin-top:2px}',
    'SCOPE .slist{max-height:210px;overflow:auto}',
    'SCOPE .srow{width:100%;text-align:left;background:transparent;border:1px solid transparent;',
    ' border-left:3px solid #2f9f4a44;color:inherit;font:inherit;font-size:12px;padding:5px 8px;cursor:pointer;display:block;margin-bottom:2px}',
    'SCOPE .srow:hover{background:#04160a;border-color:#2f9f4a55;border-left-color:var(--cy-amber)}',
    'SCOPE .srow[aria-current="true"]{background:#04160a;border-color:var(--cy-edge);border-left-color:var(--cy-gold)}',
    'SCOPE .srow .a{display:flex;justify-content:space-between;gap:8px}',
    'SCOPE .srow .nm{color:var(--cy-pale)}',
    'SCOPE .srow .tg{font-family:"IBM Plex Mono",monospace;font-size:11px}',
    'SCOPE .srow .b{font-size:10px;color:var(--cy-dim);margin-top:1px}',
    'SCOPE .orow{display:grid;grid-template-columns:10px 1fr auto;gap:7px;align-items:center;font-size:11.5px;padding:2px 0}',
    'SCOPE .odot{width:10px;height:10px;border:1px solid var(--cy-hr)}',
    'SCOPE .oname{color:var(--cy-pale);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'SCOPE .oval{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--cy-muted)}',
    'SCOPE .obar{height:3px;background:#010401;border:1px solid var(--cy-hr);margin:0 0 3px}',
    'SCOPE .obar i{display:block;height:100%}',
    'SCOPE .cynote{font-size:11px;color:var(--cy-dim);margin-top:7px}',
    'SCOPE .zbadge{display:inline-block;font-size:9.5px;padding:1px 6px;border:1px solid var(--cy-hr);',
    ' border-radius:2px;color:var(--cy-dim);margin-left:6px;letter-spacing:.05em}',
    'SCOPE input[type=range]{flex:1;min-width:110px;accent-color:#f0b454;background:transparent;height:20px}',
    'SCOPE .cygrid{display:grid;grid-template-columns:1fr 330px;gap:10px;align-items:start}',
    '@media(max-width:1060px){SCOPE .cygrid{grid-template-columns:1fr}}',
    // ── v3 layout: colony rail | map + district strip | detail ──
    'SCOPE .cywrap{display:grid;grid-template-columns:0px minmax(0,1fr) 300px;gap:0 10px;align-items:stretch;height:calc(100% - 42px)}',
    'SCOPE .cywrap.railopen{grid-template-columns:210px minmax(0,1fr) 300px;gap:0 10px}',
    'SCOPE .cyrail{overflow:hidden;transition:none}',
    'SCOPE .cywrap:not(.railopen) .cyrail{border:0;padding:0;width:0}',
    '@media(max-width:1100px){SCOPE .cywrap,SCOPE .cywrap.railopen{grid-template-columns:minmax(0,1fr)}',
    ' SCOPE .cyside{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px;align-items:start}}',
    '@media(max-width:820px){SCOPE .cyrail{max-height:150px}}',
    'SCOPE .cyhead{display:flex;justify-content:space-between;align-items:center;gap:10px;',
    ' border-bottom:1px solid var(--cy-hr);padding-bottom:8px;margin-bottom:10px}',
    'SCOPE .cytitle{font-size:1rem;letter-spacing:.16em;color:var(--cy-green);font-weight:bold}',
    'SCOPE .cysub{font-size:12px;color:var(--cy-amber);letter-spacing:.1em}',
    'SCOPE .cyx{background:transparent;border:1px solid #333;color:#888;padding:3px 10px;cursor:pointer;font:inherit;font-size:13px}',
    'SCOPE .cywrap.railopen .cyrail{max-height:100%;overflow-y:auto;overflow-x:hidden;border:1px solid var(--cy-edge);background:var(--cy-pbg);border-radius:2px;padding:5px}',
    'SCOPE .cyrow{width:100%;text-align:left;background:transparent;border:1px solid transparent;',
    ' border-left:3px solid #2f9f4a33;color:inherit;font:inherit;font-size:12px;padding:5px 7px;cursor:pointer;display:block;margin-bottom:2px}',
    'SCOPE .cyrow:hover{background:#04160a;border-color:#2f9f4a55;border-left-color:var(--cy-amber)}',
    'SCOPE .cyrow[aria-current="true"]{background:#0a2413;border-color:var(--cy-edge);border-left-color:var(--cy-gold)}',
    'SCOPE .cyrow .a{display:flex;justify-content:space-between;gap:6px}',
    'SCOPE .cyrow .nm{color:var(--cy-pale);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'SCOPE .cyrow .tg{font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:var(--cy-muted)}',
    'SCOPE .cyrow .b{font-size:9.5px;color:var(--cy-dim);margin-top:1px;display:block}',
    'SCOPE .cystrip{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}',
    'SCOPE .cychip{flex:1 1 96px;min-width:92px;background:var(--cy-s2);border:1px solid var(--cy-edge);',
    ' color:var(--cy-muted);font:inherit;font-size:10.5px;padding:4px 6px;cursor:pointer;border-radius:2px;text-align:left;line-height:1.25}',
    'SCOPE .cychip b{display:block;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'SCOPE .cychip span{font-family:"IBM Plex Mono",monospace;font-size:9px;color:var(--cy-dim)}',
    'SCOPE .cychip[aria-current="true"]{border-color:var(--cy-gold);background:#0a2413}',
    'SCOPE .cywarn{border:1px solid var(--cy-bad);color:var(--cy-bad);font-size:12.5px;padding:5px 9px;margin-bottom:8px}',
    '#gCitiesPane.fmfull{position:fixed;inset:0;z-index:9000;background:#010401;',
    ' padding:10px 14px;overflow:hidden;display:block}',
    'SCOPE .cyexit{background:var(--cy-s2);border:1px solid var(--cy-edge);color:var(--cy-amber);',
    ' font:inherit;font-size:12px;padding:4px 11px;cursor:pointer;border-radius:2px}',
    'SCOPE .cyexit:hover{border-color:var(--cy-gold);color:var(--cy-gold)}',
    'SCOPE .cyside{display:flex;flex-direction:column;max-height:100%;overflow-y:auto;overflow-x:hidden;padding-right:4px}',
    'SCOPE .cyzoom{display:flex;align-items:center;gap:4px;margin-top:6px}',
    'SCOPE .cyzoom .cybtn{margin:0;padding:3px 9px;font-size:12px}',
    'SCOPE .cymid{min-width:0;display:flex;flex-direction:column;min-height:0}',
    'SCOPE .cvwrap{flex:1;min-height:220px}',
    'SCOPE .cvwrap canvas{width:100%;height:100%;display:block}',
    'SCOPE .cyshops{max-height:230px;overflow:auto;margin-top:4px}',
    'SCOPE .cyshop{display:grid;grid-template-columns:1fr auto;gap:2px 8px;border-left:3px solid var(--cy-edge);',
    ' background:#04160a88;padding:3px 7px;margin-bottom:3px;border-radius:2px}',
    'SCOPE .cyshop.mine{background:#0a2413}',
    'SCOPE .cyshop.npc{opacity:.86;border-left-style:dashed}',
    'SCOPE .cyshop .n{color:var(--cy-pale);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    'SCOPE .cyshop .m{grid-column:1;font-size:9.5px;color:var(--cy-dim)}',
    'SCOPE .cyshop .v{grid-row:1/3;align-self:center;font-family:"IBM Plex Mono",monospace;font-size:10.5px;color:#9bffba}'
  ].join('').split('SCOPE').join(SCOPE);
  document.head.appendChild(css);
}

window.cityTabLoad=function(){
  ensureStyles();
  var host=document.getElementById('citiesTabInner');
  if(!host) return;
  host.className='fmcity';
  cHost=host; cEmbedded=true;
  askSummaries();
  if(!cOpen){
    // Open on the busiest world the player already has a stake in, else the capital.
    var ids=Object.keys(cSum);
    var mine=ids.filter(function(id){return (cSum[id].mayors||0)>0;});
    cOpen=(mine[0]||ids.sort(function(a,b){return (cSum[b].pop||0)-(cSum[a].pop||0);})[0]||'new_anchor');
    cData=null;
  }
  renderCity();
  sendCity({type:'city_data_request', colonyId:cOpen});
};

// Select a colony. Called both from the rail inside the tab and from the OPEN
// CITY button on a planet card, which now switches to the tab rather than
// throwing a modal over the galaxy map.
window.cityOpen=function(colonyId){
  cOpen=colonyId; cData=null; cPendingLevers=null; cPendingCut=null; SECTORS=[]; sel=0; hlOwner=null;
  var host=document.getElementById('citiesTabInner');
  // The cities view is a galaxy SUB tab: #citiesTabInner lives inside
  // #gCitiesPane, which is switched by [data-gstab="cities"]. This used to look
  // for [data-tab="cities"], which has never existed in the markup. The main
  // tab list is galactic/market/casino and so on; cities is not in it. So
  // querySelector returned null every time, the pane stayed display:none, and
  // renderCity painted into a hidden container. That is why OPEN CITY on a
  // colony card did nothing at all.
  //
  // Clicking the sub tab is also what enters the fullscreen city view and calls
  // cityTabLoad, which renders and requests using the cOpen set just above, so
  // there is nothing left to do here afterwards.
  if(host && host.offsetParent === null){
    // Defensive: if the galaxy tab itself is not the active one, the fixed
    // position city pane would still be inside a display:none ancestor.
    var gpane=document.getElementById('gMapPane');
    if(!gpane || gpane.offsetParent === null){
      var main=document.querySelector('[data-tab="galactic"]');
      if(main) main.click();
    }
    var stab=document.querySelector('[data-gstab="cities"]');
    if(stab){ stab.click(); return; }
  }
  if(host){ host.className='fmcity'; cHost=host; cEmbedded=true; }
  ensureStyles();
  renderCity();
  sendCity({type:'city_data_request', colonyId:colonyId});
};
// Kept because the planet card and older markup still reference it.
window.cityClose=function(){
  var btn=document.querySelector('[data-tab="galactic"]');
  if(btn) btn.click();
};
// Leaves the fullscreen city view and returns to the galaxy map.
window.cityLeaveFull=function(){
  try{ document.body.style.overflow=''; }catch(_){}
  var pane=document.getElementById('gCitiesPane');
  if(pane) pane.classList.remove('fmfull');
};
window.cityExit=function(){
  var btn=document.querySelector('[data-gstab="map"]');
  if(btn) btn.click();
};
window.cityPick=function(id){
  if(cRailOpen) window.cityRailToggle();
  window.cityOpen(id);
};
// Debug hook: lets the harness measure how much of the canvas the city fills.
window.__cityFrame=function(){
  var W=world();
  var corners=[[6,6],[W.w-6,6],[W.w-6,W.h-6],[6,W.h-6]];
  var xs=corners.map(function(c){return px(c[0],c[1]);});
  var ys=corners.map(function(c){return py(c[0],c[1],0);});
  return { S:S, HZ:HZ, OX:OX, OY:OY, CW:CW, CH:CH,
           minX:Math.min.apply(null,xs), maxX:Math.max.apply(null,xs),
           minY:Math.min.apply(null,ys), maxY:Math.max.apply(null,ys) };
};
window.cityStock=function(cls){
  var d=SECTORS[sel]; if(!d||!cOpen) return;
  sendCity({type:'city_stock',colonyId:cOpen,district:d.idx,cls:cls,weeks:1});
};
window.cityPetition=function(){
  var d=SECTORS[sel]; if(!d||!cOpen) return;
  sendCity({type:'city_petition',colonyId:cOpen,district:d.idx});
};
window.cityRailToggle=function(){
  cRailOpen=!cRailOpen;
  try{ localStorage.setItem('fm_city_rail', cRailOpen?'1':'0'); }catch(_){}
  var w=document.getElementById('cityWrap');
  if(w) w.classList.toggle('railopen', cRailOpen);
  var b=document.getElementById('cityRailBtn');
  if(b) b.innerHTML=(cRailOpen?'&#9666; ':'&#9656; ')+T('city.switchColony','SWITCH COLONY');
  setTimeout(fit,0);
};
window.citySelSector=function(i){ sel=i; cPendingLevers=null; cPendingCut=null; draw(); refreshPanels(); };
window.cityHighlight=function(){
  var owners=cityOwners();
  if(!owners.length){ hlOwner=null; }
  else{
    var idx=owners.findIndex(function(o){return o.id===hlOwner;});
    hlOwner = idx>=owners.length-1 ? null : owners[idx+1].id;
  }
  draw(); refreshPanels();
};

function bar(label,val,goodLow){
  var col = goodLow ? (val<40?'#9dff5a':val<70?'#ffb547':'#e74c3c')
                    : (val>60?'#9dff5a':val>30?'#ffb547':'#e74c3c');
  return '<div style="margin:3px 0"><div style="display:flex;justify-content:space-between;font-size:11px;color:#9af2bf"><span>'+label+'</span><span style="color:'+col+'">'+val+'</span></div>'
    +'<div style="height:4px;background:#010401;border:1px solid #0a3315"><div style="height:100%;width:'+Math.max(2,Math.min(100,val))+'%;background:'+col+'"></div></div></div>';
}

// One renderer, two homes: the Cities tab and the overlay opened from a planet
// card. Everything below is identical in both; only the chrome differs.
var cRailOpen = (function(){ try{ return localStorage.getItem('fm_city_rail')==='1'; }catch(_){ return false; } })();
var cHost = null;      // element currently holding the city UI
var cEmbedded = false; // true when living in the tab rather than the overlay

// Collapsed state per panel, persisted. Panels are rebuilt wholesale on every
// refresh, so the global collapsible initialiser in index.html never sees them;
// this keeps its markup and behaviour but drives it from here.
var cFold = (function(){
  try { return JSON.parse(localStorage.getItem('fm_city_folds')||'{}') || {}; }
  catch(_) { return {}; }
})();
function saveFolds(){ try{ localStorage.setItem('fm_city_folds', JSON.stringify(cFold)); }catch(_){} }
window.cityFold=function(id){
  cFold[id]=!cFold[id];
  saveFolds();
  var el=document.getElementById(id);
  if(el) el.classList.toggle('collapsed', !!cFold[id]);
};

function cyp(id, html){
  // Skip the panel entirely when it has nothing to say. The old layout wrapped
  // every section unconditionally, which left an empty bordered box on screen
  // whenever a section had no content for this player.
  if(!html) return '';
  // Split the leading title off so it can become the collapse toggle. Every
  // panel below is written the same way, so this is reliable rather than clever.
  var m = html.match(/^\s*<p class="cyt">([\s\S]*?)<\/p>([\s\S]*)$/);
  if(!m) return '<div class="cyp" id="'+id+'">'+html+'</div>';
  return '<div class="cyp collapsible'+(cFold[id]?' collapsed':'')+'" id="'+id+'">'
    + '<p class="cyt collapse-toggle" role="button" tabindex="0" onclick="window.cityFold(\''+id+'\')"'
    + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();window.cityFold(\''+id+'\')}">'
    + '<span class="collapse-chevron">&#9656;</span>' + m[1] + '</p>'
    + '<div class="collapse-body">' + m[2] + '</div></div>';
}

function renderCity(){
  var host = cHost || document.getElementById('citiesTabInner');
  if(!host||!cOpen) return;
  host.style.height='100%';
  host.style.display='flex';
  host.style.flexDirection='column';
  var d=cData;
  var meta=(window.COLONY_META&&window.COLONY_META[cOpen])||{name:cOpen};
  var cname=(window.colonyNameZh?window.colonyNameZh(cOpen,meta.name):meta.name)||cOpen;
  var h='';

  // ── header ──
  h+='<div class="cyhead">';
  h+='<div><span class="cytitle">'+esc(String(cname).toUpperCase())+'</span>';
  if(d) h+=' <span class="cysub">'+esc(String(d.summary.cls).toUpperCase())+' &middot; '+d.summary.pop+'M '+T('city.citizens','CITIZENS')
    +' &middot; '+d.summary.mayors+'/'+d.summary.districts+' '+T('city.governed','governed')+'</span>';
  h+='</div>';
  h+='<span style="display:flex;gap:6px;align-items:center">';
  h+='<button class="cybtn" id="cityRailBtn" onclick="window.cityRailToggle()">'
    +(cRailOpen?'&#9666; ':'&#9656; ')+T('city.switchColony','SWITCH COLONY')+'</button>';
  h+='<button class="cyexit" onclick="window.cityExit()">'+T('city.exit','EXIT')+' &#10005;</button>';
  h+='</span>';
  h+='</div>';

  if(!d){ h+='<div class="cynote" style="padding:20px 0">'+T('city.loading','Charter registry loading...')+'</div>'; host.innerHTML=h; return; }

  h+='<div class="cywrap'+(cRailOpen?' railopen':'')+'" id="cityWrap">';

  // ── left rail: colonies. Collapsed by default so the map owns the width. ──
  h+='<div class="cyrail" id="cityRail">'+railHtml()+'</div>';

  // ── centre: map + district strip ──
  h+='<div class="cymid">';
  if(d.summary.locked){
    var days=Math.max(0,Math.ceil((d.summary.stripAt-Date.now())/864e5));
    h+='<div class="cywarn">&#9888; '+T('city.occupiedBy','OCCUPIED BY')+' '+(FACTION_LABEL[d.summary.locked]||d.summary.locked).toUpperCase()+'. '
      +(Date.now()<d.summary.stripAt
        ? T('city.occupiedHint','All seats vacated. Salvage begins in')+' '+days+'d.'
        : T('city.strippingHint','Occupation forces are removing mayoral development.'))+'</div>';
  }
  h+='<div class="cvwrap"><canvas id="cityCv" width="1180" height="720" role="img" aria-label="'
    +T('city.mapAria','Isometric view of the city')+'"></canvas>';
  h+='<div class="hud"><span class="st" id="cityHStage">-</span>'
    +'<span class="sub"><b id="cityHSec">-</b> &middot; <span id="cityHOwn">-</span> &middot; '
    +'<span id="cityHLots">0</span> '+T('city.shopsLower','shops')+' &middot; <span id="cityHBook">-</span></span></div>';
  h+='</div>';
  h+='<div class="cyzoom">'
    +'<button class="cybtn" onclick="window.cityZoom(1.25)" title="'+T('city.zoomIn','Zoom in')+'">+</button>'
    +'<button class="cybtn" onclick="window.cityZoom(0.8)" title="'+T('city.zoomOut','Zoom out')+'">&minus;</button>'
    +'<button class="cybtn" onclick="window.cityZoomReset()">'+T('city.reset','RESET VIEW')+'</button>'
    +'<span class="cynote" style="margin:0 0 0 6px">'+T('city.zoomHint','wheel to zoom, drag to pan')+'</span></div>';
  h+='<div class="cystrip" id="cityStrip">'+stripHtml()+'</div>';
  h+='</div>';

  // ── right: detail ──
  h+='<div class="cyside" id="citySide">';
  h+=cyp('citySecBox',   renderSectorBox());
  h+=cyp('cityMayorBox', renderMayorBox());
  h+=cyp('cityCondBox',  renderConditionBox());
  h+=cyp('cityCommerceBox', renderCommerceBox());
  h+=cyp('cityFrontBox',    renderFrontageBox());
  h+=cyp('cityMyShopsBox',  renderMyShopsBox());
  h+=cyp('cityCharterBox',  renderCharterBox());
  h+=cyp('cityWarBox',   renderWarBox());
  h+='</div>';

  h+='</div>';
  host.innerHTML=h;
  bindCanvases();
  fit();
  refreshPanels();
}
// Back-compat name used by the WS handlers.
function renderOverlay(){ renderCity(); }

// Colony rail. Replaces a wall of nineteen buttons that ate two rows and could
// not be scanned. Sorted by weight, showing the two numbers that matter.
function railHtml(){
  var ids=Object.keys(cSum);
  ids.sort(function(a,b){ return (cSum[b].pop||0)-(cSum[a].pop||0) || a.localeCompare(b); });
  return ids.map(function(id){
    var sm=cSum[id];
    var meta=(window.COLONY_META&&window.COLONY_META[id])||{name:id};
    var nm=(window.colonyNameZh?window.colonyNameZh(id,meta.name):meta.name)||id;
    var open=(sm.districts||0)-(sm.mayors||0);
    return '<button class="cyrow" aria-current="'+(id===cOpen)+'" onclick="window.cityPick(\''+esc(id)+'\')">'
      +'<span class="a"><span class="nm">'+esc(nm)+'</span>'
      +'<span class="tg">'+(sm.pop||0)+'M</span></span>'
      +'<span class="b">'+esc(String(sm.cls||'').toUpperCase())+' &middot; '
      +(open>0?('<b style="color:#ffce4d">'+open+' '+T('city.openSeats','open')+'</b>'):T('city.allHeld','all held'))
      +' &middot; '+(sm.shops||0)+' '+T('city.shopsLower','shops')+'</span></button>';
  }).join('');
}

// District chips under the map. Horizontal and compact, so a twelve district
// capital fits on one line instead of a scrolling column.
function stripHtml(){
  return SECTORS.map(function(x,i){
    var d=x.d||{};
    var col=d.mine?'#ffce4d':d.mayor?rgbs(ownerCol(d.mayor),1):'#5f8f70';
    return '<button class="cychip" aria-current="'+(i===sel)+'" onclick="window.citySelSector('+i+')">'
      +'<b style="color:'+col+'">'+esc(x.n)+'</b>'
      +'<span>D'+(d.dev||0).toFixed(1)+' &middot; '+(d.shops||0)+'/'+(d.slots||0)+'</span></button>';
  }).join('');
}

function renderSectorBox(){
  if(!SECTORS.length||!cData) return '<p class="cyt">'+T('city.district','District')+'</p><div class="cynote">'+T('city.noDistricts','Survey pending.')+'</div>';
  var s=SECTORS[sel], d=s.d||{}, st=stageOf(s);
  var trade=districtTrade(s), lmt=landmarkTier(d.dev||1,d.worksLv||0);
  var h='<p class="cyt">'+esc(s.n)+' <span class="zbadge">'+esc(String(s.zone).toUpperCase())+'</span></p>';
  h+='<div class="cykv"><span class="k">'+T('city.buildsIn','Builds in')+'</span>'
    +'<span class="v" style="color:'+rgbs(TRADE_COL[trade],1)+'">'+(KIND_LABEL[trade]||trade)
    +(d.favoured===trade?(' <span style="color:#5f8f70">('+T('city.zoned','zoned')+')</span>'):'')+'</span></div>';
  if(lmt) h+='<div class="cykv"><span class="k">'+T('city.landmark','Landmark')+'</span>'
    +'<span class="v gold">'+esc(LANDMARK_NAME[trade][lmt])+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.mayor','Mayor')+'</span><span class="v '+(d.mayor?'gold':'')+'">'
    +(d.mayor?esc(d.mayorName||'?')+(d.mine?' ('+T('city.you','you')+')':''):T('city.npcAdmin','colonial administration'))+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.stage','Stage')+'</span><span class="v gold">'+STAGES[st].n+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.development','Development')+'</span><span class="v num">D'+(d.dev||0).toFixed(1)
    +' <span style="color:#5f8f70">('+T('city.baseWord','base')+' D'+(d.baseline||0)+')</span></span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.citizens2','Citizens')+'</span><span class="v num">'+(d.pop||0)+'M</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.builtValue','Built value')+'</span><span class="v num">'+fm(d.invested||0)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.seatPrice','Seat price')+'</span><span class="v num gold">'+fm(d.seat||0)+'</span></div>';
  h+='<p class="cynote">'+STAGES[st].d+'</p>';

  var locked=cData.summary.locked;
  if(locked){ h+='<p class="cynote" style="color:#ff6a6a">'+T('city.occupiedSeats','Seats are suspended under occupation.')+'</p>'; return h; }

  if(!d.mine){
    var wrongFac = cData.colonyFaction && cData.myFaction !== cData.colonyFaction;
    if(wrongFac){
      h+='<p class="cynote">'+T('city.wrongFaction','Only')+' <b style="color:#b6ffcf">'+esc(FACTION_LABEL[cData.colonyFaction]||cData.colonyFaction)+'</b> '+T('city.mayHold','members may hold office on this world.')+'</p>';
    } else if(d.mayor && !d.takeable){
      h+='<p class="cynote">'+T('city.grace','Incumbent is within the protected holding period.')+'</p>';
    } else if(cData.myCity && cData.myCity!==cData.colonyId){
      h+='<p class="cynote">'+T('city.oneCity','You hold office on')+' <b style="color:#ffce4d">'
        +esc(String(cData.myCity).replace(/_/g,' '))+'</b>. '
        +T('city.oneCity2','A mayor governs one city. Give up that seat before taking one here.')+'</p>';
    } else {
      h+='<button class="cybtn" style="border-color:#ffce4d;color:#ffce4d" onclick="window.cityBuySeat()">'
        +(d.mayor?T('city.unseat','UNSEAT THE MAYOR'):T('city.takeSeat','TAKE THE SEAT'))+' &middot; '+fm(d.seat||0)+'</button>';
      if(d.mayor) h+='<p class="cynote">'+T('city.compNote','The sitting mayor is compensated')+' '+fm(d.compensation||0)+' '
        +T('city.compNote2','of their invested capital. The buyer pays the full seat price.')+'</p>';
      else h+='<p class="cynote">'+T('city.vacantNote','Run by colonial administration, which holds every lever at a fixed middling setting. It does not fail, and it does not improve.')+'</p>';
    }
    h+=petitionHtml(d);
    return h;
  }

  // Sitting mayor's tools.
  h+='<div class="cykv" style="border-top:1px solid #0a3315;margin-top:6px;padding-top:6px"><span class="k">'+T('city.take','Commerce taken')+'</span><span class="v num good">'+fm(d.take||0)+'/wk</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.civicBill','Civic bill')+'</span><span class="v num bad">'+fm(d.bill||0)+'/wk</span></div>';
  if((d.skim||0)>0.001){
    h+='<div class="cykv"><span class="k" style="padding-left:8px">'+T('city.billBase','Services cost')+'</span>'
      +'<span class="v num">'+fm(d.billBase||0)+'/wk</span></div>';
    h+='<div class="cykv"><span class="k" style="padding-left:8px">'+T('city.skim','Lost to corruption')+'</span>'
      +'<span class="v num bad">'+fm((d.bill||0)-(d.billBase||0))+'/wk ('+Math.round((d.skim||0)*100)+'%)</span></div>';
  }
  h+='<div class="cykv"><span class="k">'+T('city.net','Net')+'</span><span class="v num '+((d.take-d.bill)>=0?'good':'bad')+'">'+fm((d.take||0)-(d.bill||0))+'/wk</span></div>';
  if(d.arrears>0) h+='<div class="cykv"><span class="k">'+T('city.arrears','Arrears')+'</span><span class="v num bad">'+fm(d.arrears)+'</span></div>';
  // A mayor may build a fixed number of levels above the district's population
  // baseline, not up to an absolute ceiling. Past that the cost of a level runs
  // away from what it returns.
  var maxLv=(cData.tune.devLevels==null?4:cData.tune.devLevels);
  var built=Math.max(0,(d.dev||0)-(d.baseline||0));
  if(built < maxLv-0.001 && (d.dev||0) < cData.tune.devMax){
    h+='<button class="cybtn" style="border-color:#ffce4d;color:#ffce4d" onclick="window.cityInvest()">'
      +T('city.develop','DEVELOP')+' &rarr; D'+(Math.floor(d.dev)+1)+' &middot; '+fm(d.nextLevel||0)+'</button>';
    h+='<p class="cynote">'+T('city.devLeft','Levels built')+': '+Math.round(built)+' '+T('city.of','of')+' '+maxLv+'</p>';
  } else {
    h+='<p class="cynote">'+window.tf('city.fullyDeveloped','Development at maximum. A district takes {n} levels above its population baseline and no more.',{n:maxLv})+'</p>';
  }
  // Civic works. Deliberately presented as what it is: a sink that buys no
  // income at all, so nobody commissions one expecting a return.
  var wMax=(cData.tune.worksMax==null?8:cData.tune.worksMax);
  var wLv=d.worksLv||0;
  h+='<div class="cykv" style="border-top:1px solid #0a3315;margin-top:6px;padding-top:6px">'
    +'<span class="k">'+T('city.works','Civic works')+'</span>'
    +'<span class="v num gold">'+(wLv>0?('W'+wLv.toFixed(1)+' &middot; '+fm(d.works||0)):T('city.none3','none'))+'</span></div>';
  if(wLv < wMax-0.001 && (d.nextWorks||0)>0){
    h+='<button class="cybtn" style="border-color:#ffce4d;color:#ffce4d" onclick="window.cityWorks()">'
      +T('city.commission','COMMISSION WORKS')+' &rarr; W'+(Math.floor(wLv)+1)+' &middot; '+fm(d.nextWorks||0)+'</button>';
  } else {
    h+='<p class="cynote">'+T('city.worksDone','Every civic work this district can hold is built.')+'</p>';
  }
  h+='<p class="cynote">'+T('city.worksHint','Returns no commerce. Lowers unrest, raises prosperity, adds local supply, and raises what an invader pays for every point of control here. Never refunded, never salvaged by an occupier.')+'</p>';
  h+=storesHtml(d);
  h+=contestHtml();
  h+='<button class="cybtn" onclick="window.cityRenameDistrict()">'+T('city.rename','RENAME')+'</button>';
  return h;
}

// ── Watching the fight for this colony ──────────────────────────────────────
// A COLONY THAT IS BEING CONTESTED HAS NOWHERE TO LOOK AT THAT, and it is the
// only part of the war with no picture. The war fund has a number, control has
// a percentage, capture has a message in the feed, and the fighting those three
// describe has never been drawn anywhere.
//
// This opens the viewer and nothing else. It is not a command, it does not
// commit anyone, it costs nothing and it changes nothing - the button is shown
// only when TWO factions actually hold ground here, because a battlefield with
// one belligerent is a mirror match and the game does not have those.
function contested(){
  if(!cData) return null;
  var c=cData.control;
  if(!c && window.gState && cOpen) c=window.gState[cOpen];
  if(!c || !window.CB || !window.CB.rosterFor || !cOpen) return null;
  return window.CB.rosterFor(cOpen);
}
function contestHtml(){
  var r=contested();
  if(!r) return '';
  var api=window.FM_FAC_API;
  var nm=function(f){ return api?api.short(f):String(f).toUpperCase(); };
  return '<div class="cykv" style="border-top:1px solid #0a3315;margin-top:6px;padding-top:6px">'
    +'<span class="k">'+T('city.contested','Contested')+'</span>'
    +'<span class="v num">'+nm(r.home)+' '+r.homePct.toFixed(0)+'% &middot; '
    +nm(r.away)+' '+r.awayPct.toFixed(0)+'%</span></div>'
    +'<button class="cybtn" style="border-color:#4ecdc4;color:#4ecdc4" '
    +'onclick="window.cityWatch&&window.cityWatch(\''+cOpen+'\')">'
    +T('city.watchEngagement','WATCH ENGAGEMENT')+'</button>'
    +'<p class="cynote">'+T('city.watchNote','Shows the ground being fought over. Opens a viewer; commits nothing and costs nothing.')+'</p>';
}

function storesHtml(d){
  if(!d||!d.mine||!cData||!cData.stock) return '';
  var h='<div class="cykv" style="border-top:1px solid #0a3315;margin-top:6px;padding-top:6px">'
    +'<span class="k">'+T('city.stores','Siege stores')+'</span><span class="v"></span></div>';
  ['food','med','tech'].forEach(function(k){
    var st=cData.stock[k]||{}, w=st.weeks||0;
    h+='<div class="cykv"><span class="k" style="padding-left:8px">'+(KIND_LABEL[k]||k)+'</span>'
      +'<span class="v '+(w>0?'good':'')+'">'
      +(w>0?window.tf('city.storesWeeks','{n} weeks of cover',{n:w}):T('city.storesNone','none held'))
      +'</span></div>';
    h+='<button class="cybtn" style="padding:1px 6px;font-size:10px;margin:1px 0 3px 8px"'
      +' onclick="window.cityStock(\''+k+'\')">'+T('city.layIn','LAY IN ONE WEEK')+' &middot; '+fm(st.weekCost||0)+'</button>';
  });
  h+='<p class="cynote">'+T('city.storesNote','Cover counts as local supply while it lasts and spoils at 14% a week. A lane can close faster than a district can be rezoned.')+'</p>';
  return h;
}

function renderMayorBox(){
  if(!cData||!SECTORS.length) return '';
  var s=SECTORS[sel], d=s.d||{};
  if(!d.mine) return '';
  var h='<p class="cyt">'+T('city.office','Mayoral office')+' <span class="sub">&middot; '+esc(s.n)+'</span></p>';
  // Commerce cut inside the band.
  var cut=Math.round((d.cut||0.12)*100), lo=Math.round(cData.tune.cutMin*100), hi=Math.round(cData.tune.cutMax*100);
  h+='<div style="display:flex;align-items:center;gap:8px;margin-top:3px"><span style="font-size:11px;color:#9af2bf;width:78px">'+T('city.cut','Commerce cut')+'</span>'
    +'<input type="range" min="'+lo+'" max="'+hi+'" value="'+cut+'" oninput="window.cityCutPreview(this.value)">'
    +'<span id="cityCutVal" class="num" style="color:#ffce4d;width:34px;text-align:right">'+cut+'%</span></div>';
  h+='<button class="cybtn" onclick="window.cityApplyCut()">'+T('city.applyCut','SET RATE')+'</button>';
  h+='<p class="cynote">'+T('city.cutHint','Sets the mayoral share of storefront gross, within the band shown. Higher rates raise revenue per shop; lower rates attract tenants from neighbouring districts.')+'</p>';
  // Zoning.
  h+='<div style="font-size:11px;color:#5f8f70;margin-top:8px">'+T('city.favoured','Favoured trade')+' &middot; +'
    +Math.round(cData.tune.favourBonus*100)+'% / -'+Math.round(cData.tune.favourPenalty*100)+'%</div>';
  ['export','food','med','tech'].forEach(function(k){
    var on=d.favoured===k;
    h+='<button class="cybtn" style="'+(on?'border-color:#ffce4d;color:#ffce4d':'')+'" onclick="window.citySetFavoured(\''+k+'\')">'
      +(KIND_LABEL[k]||k).toUpperCase()+'</button>';
  });
  h+='<button class="cybtn" onclick="window.citySetFavoured(\'\')">'+T('city.none2','NONE')+'</button>';
  h+='<p class="cynote">'+T('city.favourHint','The favoured trade earns the bonus shown; all others take the penalty. Also determines which civic good this district produces for colony supply.')+'</p>';
  // Levers.
  h+='<p class="cyt" style="margin:9px 0 4px">'+T('city.policy','DISTRICT POLICY')+'</p>';
  var lv=cPendingLevers||d.levers||{};
  // Civic Subsidy is gone. It was a slider the player could move that no part
  // of the simulation, the civic bill or the commerce model ever read.
  [['security',T('city.lvSecurity','Security')],['politics',T('city.lvPolitics','Politics')],
   ['services',T('city.lvServices','Services')],['upkeep',T('city.lvUpkeep','Upkeep')]].forEach(function(pair){
    var k=pair[0];
    h+='<div style="display:flex;align-items:center;gap:8px;margin-top:3px"><span style="font-size:11px;color:#9af2bf;width:78px">'+pair[1]+'</span>'
      +'<input type="range" min="0" max="100" value="'+(lv[k]||0)+'" oninput="window.cityLever(\''+k+'\',this.value)">'
      +'<span id="cityLv_'+k+'" class="num" style="color:#ffce4d;width:26px;text-align:right">'+(lv[k]||0)+'</span></div>';
  });
  h+='<p class="cynote">'+T('city.leverHint','Each lever raises one scalar and lowers another. Total lever intensity sets the weekly civic bill.')+'</p>';
  h+='<button class="cybtn" style="border-color:#ffce4d;color:#ffce4d" onclick="window.cityApplyLevers()">'+T('city.applyPolicy','APPLY POLICY')+'</button>';
  return h;
}

function renderConditionBox(){
  if(!SECTORS.length) return '';
  var sc=(SECTORS[sel].d||{}).scalars||{};
  var h='<p class="cyt">'+T('city.condition','District condition')+'</p>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">';
  h+='<div>'+bar(T('city.output','Output'),sc.output||0,false)+bar(T('city.prosperity','Prosperity'),sc.prosperity||0,false)+'</div>';
  h+='<div>'+bar(T('city.unrest','Unrest'),sc.unrest||0,true)+bar(T('city.crime','Crime'),sc.crime||0,true)+'</div>';
  h+='</div>';
  var s=cData.summary;
  h+='<div style="font-size:11.5px;color:#9af2bf;margin-top:6px">'+T('city.supply','Supply')+' ('+T('city.cityWide','city wide')+'): '
    +T('city.food','food')+' <b style="color:'+(s.food>85?'#9dff5a':s.food>50?'#ffb547':'#e74c3c')+'">'+s.food+'%</b> &middot; '
    +T('city.med','med')+' <b style="color:'+(s.med>85?'#9dff5a':s.med>50?'#ffb547':'#e74c3c')+'">'+s.med+'%</b> &middot; '
    +T('city.tech','tech')+' <b style="color:'+(s.tech>85?'#9dff5a':s.tech>50?'#ffb547':'#e74c3c')+'">'+s.tech+'%</b>'
    +(s.blockade>0?' <span style="color:#ff6a6a">&#9888; '+T('city.blockaded','Supply lanes blockaded')+'</span>':'')+'</div>';
  h+='<p class="cynote">'+T('city.supplyHint2','Supply is met by imports plus local production. Under blockade, only districts with a favoured civic trade produce.')+'</p>';
  return h;
}

function renderCommerceBox(){
  if(!SECTORS.length||!cData) return '';
  var s=SECTORS[sel], d=s.d||{};
  var free=Math.max(0,(d.slots||0)-(d.shops||0));
  var h='<p class="cyt">'+T('city.commerce','Commerce')+' <span class="sub">&middot; '+T('city.cityNeeds','what this district wants')+'</span></p>';
  h+='<div class="cykv"><span class="k">'+T('city.pool','Consumer spend')+'</span><span class="v num gold">'+fm(d.pool||0)+'/wk</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.storefronts','Storefronts')+'</span><span class="v num">'+(d.shops||0)+' '+T('city.of','of')+' '+(d.slots||0)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.vacant','Vacant frontage')+'</span><span class="v num '+(free>0?'good':'bad')+'">'+free+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.lease','Lease')+'</span><span class="v num">'+fm(d.lease||0)+'</span></div>';
  // Jade Circuit export bonus. Shown on Circuit ground whether or not the
  // viewer qualifies, because it is a reason to consider joining.
  if(cData.jade){
    var mine=cData.myFaction==='jade';
    h+='<div class="cykv"><span class="k">'+T('city.circuit','Circuit export bonus')+'</span>'
      +'<span class="v num '+(mine?'good':'')+'" style="'+(mine?'':'color:#5f8f70')+'">+'
      +Math.round((cData.jadeBonus||0.05)*100)+'%'+(mine?'':' '+T('city.circuitNo','(Circuit only)'))+'</span></div>';
    h+='<p class="cynote">'+T('city.circuitHint','Jade Circuit members take the bonus on export trade in Circuit cities. It does not travel: it applies here, on Circuit ground.')+'</p>';
  }
  if(d.favoured) h+='<div class="cykv"><span class="k">'+T('city.favoured','Favoured trade')+'</span><span class="v gold">'+(KIND_LABEL[d.favoured]||d.favoured)+'</span></div>';
  if(free>0&&!cData.summary.locked){
    h+='<div style="margin-top:7px;font-size:11px;color:#5f8f70">'+T('city.openShop','Open a storefront here')+'</div>';
    h+='<input id="cityShopName" maxlength="40" placeholder="'+T('city.shopNamePh','Shop name')+'" style="width:100%;margin-top:4px;background:#04160a;border:1px solid #2f9f4a;color:#b6ffcf;font:inherit;font-size:12px;padding:4px 6px;border-radius:2px">';
    h+='<input id="cityShopDesc" maxlength="200" placeholder="'+T('city.shopDescPh','Description, optional')+'" style="width:100%;margin-top:4px;background:#04160a;border:1px solid #2f9f4a;color:#b6ffcf;font:inherit;font-size:12px;padding:4px 6px;border-radius:2px">';
    ['export','food','med','tech'].forEach(function(k){
      h+='<button class="cybtn" onclick="window.cityLease(\''+k+'\')">'+(KIND_LABEL[k]||k).toUpperCase()+'</button>';
    });
  }
  h+='<p class="cynote">'+T('city.commerceHint','Demand is always present; only its distribution across trades changes. Shortages shift the split toward the scarce good over several weeks.')+'</p>';
  return h;
}

function renderMyShopsBox(){
  if(!cData) return '';
  var mine=(cData.shops||[]).filter(function(x){return x.mine;});
  var h='<p class="cyt">'+T('city.myShops','Your storefronts')+' <span class="sub">&middot; '+mine.length+'</span></p>';
  if(!mine.length){
    h+='<div class="cynote">'+T('city.noShops','You hold no storefronts in this city. Lease a vacant frontage or buy an established business from any district.')+'</div>';
    return h;
  }
  var tot=0;
  mine.forEach(function(sh){
    tot+=sh.net;
    var dn=SECTORS[sh.district]?SECTORS[sh.district].n:('district '+sh.district);
    h+='<div class="cykv"><span class="k"><b style="color:#b6ffcf">'+esc(sh.name)+'</b> <span style="color:#5f8f70">'+(KIND_LABEL[sh.kind]||sh.kind)+' &middot; '+esc(dn)+'</span></span>'
      +'<span class="v num good">'+fm(sh.net)+'/wk'
      +'<button class="cybtn" style="padding:1px 6px;font-size:10px;margin:0 0 0 6px" onclick="window.cityCloseShop('+sh.id+')">'+T('city.close','close')+'</button></span></div>';
  });
  h+='<div class="cykv"><span class="k">'+T('city.total','Total')+'</span><span class="v num gold">'+fm(tot)+'/wk</span></div>';
  h+='<p class="cynote">'+T('city.decayHint','Returns diminish with each additional storefront held in the same district.')+'</p>';
  return h;
}

function renderWarBox(){
  var d=cData; if(!d||!d.war) return '';
  var w=d.war, net=w.stripYield-w.trigger;
  var ratio=w.book>0?(w.trigger/w.book*100):0;
  var h='<p class="cyt">'+T('city.war','War')+' <span class="sub">&middot; '+T('city.liveNumbers','live numbers')+'</span></p>';
  h+='<div class="cykv"><span class="k">'+T('city.cityBook','Mayoral investment')+'</span><span class="v num">'+fm(w.book)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.warRate','War fund rate')+'</span><span class="v num gold">'+fm(w.rate)+' /pt</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.costTrigger','Cost to trigger')+'</span><span class="v num">'+fm(w.trigger)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.stripYield','Full strip yield')+'</span><span class="v num bad">'+fm(w.stripYield)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.raiderNet','Raider net')+'</span><span class="v num '+(net>0?'bad':'good')+'">'+(net>=0?'+':'')+fm(net)+'</span></div>';
  h+='<p class="cynote">'+(net>0
    ? T('city.warBad','Salvage currently exceeds the cost of taking this colony. This is a balance fault; report it.')
    : T('city.warGood2','Salvage is limited to mayoral investment. Baseline development is not strippable, so the take is below the cost of taking the colony.'))+'</p>';
  return h;
}

function renderSectorList(){
  var held=SECTORS.filter(function(x){return x.mayor;}).length;
  var h='<p class="cyt">'+T('city.districts','Districts')+' <span class="sub">&middot; '+SECTORS.length+' &middot; '+held+' '+T('city.governed','governed')+'</span></p>';
  h+='<div class="slist">'+SECTORS.map(function(x,i){
    var d=x.d||{};
    return '<button class="srow" aria-current="'+(i===sel)+'" onclick="window.citySelSector('+i+')">'
      +'<span class="a"><span class="nm">'+esc(x.n)+'</span><span class="tg" style="color:'
      +(d.mine?'#ffce4d':d.mayor?rgbs(ownerCol(d.mayor),1):'#5f8f70')+'">D'+(d.dev||0).toFixed(1)+'</span></span>'
      +'<span class="b">'+esc(x.zone)+' &middot; '+(d.mayor?esc(d.mayorName||'?'):T('city.vacantWord','vacant'))
      +' &middot; '+(d.shops||0)+'/'+(d.slots||0)+'</span></button>';
  }).join('')+'</div>';
  return h;
}

// A shopholder's lever on the mayor. Legitimacy prices the seat, so a district
// that has turned on its administration is cheap to take.
function petitionHtml(d){
  if(!d || !d.mayor || d.mine) return '';
  var shops=(cData.shops||[]).filter(function(sh){ return sh.district===d.idx && sh.mine; });
  if(!shops.length) return '';
  var lg=(d.scalars&&d.scalars.legitimacy!=null)?d.scalars.legitimacy:null;
  var h='<div class="cykv" style="border-top:1px solid #0a3315;margin-top:6px;padding-top:6px">'
    +'<span class="k">'+T('city.legit','Legitimacy')+'</span>'
    +'<span class="v num '+(lg!=null&&lg<40?'bad':lg!=null&&lg>65?'good':'')+'">'+(lg==null?'-':lg)+'</span></div>';
  h+='<button class="cybtn" onclick="window.cityPetition()">'+T('city.petition','FILE A PETITION')+'</button>';
  h+='<p class="cynote">'+T('city.petitionNote','An established shopholder may put their name to a complaint. It pushes legitimacy down, and legitimacy is what a seat is priced on. One filing a day, and it washes out unless the discontent is sustained.')+'</p>';
  return h;
}

// The row carries structured params and the English sentence the server built.
// Prefer the template, fall back to the English. The fallback is what keeps the
// rows written before 1.6.2.4, which have no params at all, still readable.
var HIST_FALLBACK={
  stock:'{who} lays in {cls} stores',
  seated:'{who} takes the seat of {where}',
  ousted:'{who} unseats {prev}',
  invest:'{who} develops the district',
  works:'{who} commissions civic works, level {lv}',
  petition:'{who} petitions against the administration of {where}',
  charter:'{who} takes the charter of the colony',
  charterVacant:'the charter of the colony falls vacant'
};
function histLine(r){
  var p=r.params;
  if(p && HIST_FALLBACK[r.kind] && window.tf){
    return window.tf('city.hist.'+r.kind, HIST_FALLBACK[r.kind], p);
  }
  return String(r.detail||r.kind);
}

function renderHistoryBox(){
  if(!cData||!cData.history||!cData.history.length) return '';
  var h='<p class="cyt">'+T('city.history','District record')+'</p>';
  var rows=cData.history.slice(0,10);
  h+='<div style="font-size:.6rem;line-height:1.55;color:#7a9a7a">';
  rows.forEach(function(r){
    var when=new Date(r.ts);
    h+='<div style="display:flex;gap:6px"><span style="color:#3f5f3f;flex-shrink:0">'
      +String(when.getMonth()+1).padStart(2,'0')+'/'+String(when.getDate()).padStart(2,'0')
      +'</span><span>'+esc(histLine(r))+'</span></div>';
  });
  h+='</div>';
  return h;
}

function renderCharterBox(){
  if(!cData) return '';
  var s=cData.summary;
  var h='<p class="cyt">'+T('city.cityHeader','The city')+'</p>';
  h+='<div class="cykv"><span class="k">'+T('city.class','Class')+'</span><span class="v gold">'+String(s.cls).toUpperCase()+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.citizens3','Citizens')+'</span><span class="v num">'+s.pop+'M</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.districts','Districts')+'</span><span class="v num">'+s.districts+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.governed2','Under mayors')+'</span><span class="v num">'+s.mayors+' '+T('city.of','of')+' '+s.districts+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.storefronts','Storefronts')+'</span><span class="v num">'+s.shops+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.mayoralInv','Mayoral investment')+'</span><span class="v num">'+fm(s.book)+'</span></div>';
  h+='<div class="cykv"><span class="k">'+T('city.charter','Charter held by')+'</span><span class="v gold">'
    +(cData.charterName?esc(cData.charterName):T('city.charterNone','VACANT'))+'</span></div>';
  // What the world is short of. Positive means it buys that class in and its
  // prices for it are firm; negative means it grows more than it eats and is
  // where that class is cheap. This is the same number the commodity grid reads.
  if(cData.civic){
    var lbl={food:T('city.food','Food'),med:T('city.med','Medical'),tech:T('city.tech','Technical')};
    ['food','med','tech'].forEach(function(k){
      var v=cData.civic[k]||0;
      var txt=v>0.02?(T('city.imports','imports')+' '+Math.round(v*100)+'%')
             :v<-0.02?(T('city.exports','exports')+' '+Math.round(-v*100)+'%')
             :T('city.balanced','balanced');
      h+='<div class="cykv"><span class="k">'+lbl[k]+'</span><span class="v '+(v>0.02?'bad':v<-0.02?'good':'')+'">'+txt+'</span></div>';
    });
    h+='<p class="cynote">'+T("city.civicNote","What the city cannot grow it buys, and that shows up in this colony's own commodity prices. Zone districts to a trade and the world becomes the cheap place to buy it.")+'</p>';
  }
  h+='<p class="cynote">'+T('city.cityNote','Cities are permanent and cannot be destroyed. Players hold mayoral office over individual districts; seats are contestable and revert on default.')+'</p>';
  return h;
}

function setHtml(id,html){ var e=document.getElementById(id); if(e) e.innerHTML=html; }

function sideHtml(){
  return cyp('citySecBox',      renderSectorBox())
       + cyp('cityMayorBox',    renderMayorBox())
       + cyp('cityCondBox',     renderConditionBox())
       + cyp('cityCommerceBox', renderCommerceBox())
       + cyp('cityFrontBox',    renderFrontageBox())
       + cyp('cityMyShopsBox',  renderMyShopsBox())
       + cyp('cityCharterBox',  renderCharterBox())
       + cyp('cityHistBox',     renderHistoryBox())
       + cyp('cityWarBox',      renderWarBox());
}

function refreshPanels(){
  if(!cData) return;
  var s=SECTORS[sel];
  if(s){
    var d=s.d||{}, e;
    if((e=document.getElementById('cityHStage'))) e.textContent=STAGES[stageOf(s)].n;
    if((e=document.getElementById('cityHSec'))) e.textContent=s.n;
    if((e=document.getElementById('cityHOwn'))) e.textContent=d.mayor?(d.mayorName||'?'):T('city.vacantWord','vacant');
    if((e=document.getElementById('cityHLots'))) e.textContent=(d.shops||0)+'/'+(d.slots||0);
    if((e=document.getElementById('cityHBook'))) e.textContent='D'+(d.dev||0).toFixed(1);
  }
  // Whole column at once. Panels legitimately appear and vanish (the mayoral
  // office only exists while you hold the seat), and patching them one id at a
  // time silently dropped any panel that was empty when the page was built.
  setHtml('citySide', sideHtml());
  setHtml('cityStrip', stripHtml());
  setHtml('cityRail', railHtml());
}

function bindCanvases(){
  cv=document.getElementById('cityCv');
  ctx=cv?cv.getContext('2d'):null;
  if(cv&&!cv._cityBound){
    cv._cityBound=true;
    cv.addEventListener('click',function(e){
      if(_dragMoved) return;           // a pan should not also select
      var r=cv.getBoundingClientRect();
      var w=toWorld((e.clientX-r.left)*(cv.width/r.width),(e.clientY-r.top)*(cv.height/r.height));
      var x=w[0], y=w[1];
      for(var i=SECTORS.length-1;i>=0;i--){
        ZB=SECTORS[i].zb||0;
        var g=SECTORS[i].poly.map(function(v){return [px(v[0],v[1]),py(v[0],v[1],0)];});
        ZB=0;
        if(inPoly(g,x,y)){ sel=i; cPendingLevers=null; cPendingCut=null; draw(); refreshPanels(); return; }
      }
    });
  }
}
var _dragMoved=false;
function bindMapView(){
  if(!cv || cv._cityView) return;
  cv._cityView=true;
  cv.style.cursor='grab';
  cv.addEventListener('wheel',function(e){
    e.preventDefault();
    var r=cv.getBoundingClientRect();
    var devX=(e.clientX-r.left)*(cv.width/r.width);
    var devY=(e.clientY-r.top)*(cv.height/r.height);
    var before=toWorld(devX,devY);
    view.z=clamp(view.z*(e.deltaY>0?0.88:1.136),VIEW_MIN,VIEW_MAX);
    // hold the world point under the cursor still
    var k=viewScale();
    view.tx=devX-before[0]*k;
    view.ty=devY-before[1]*k;
    draw();
  },{passive:false});
  var panning=false, lastX=0, lastY=0;
  cv.addEventListener('mousedown',function(e){
    if(e.button!==0) return;
    panning=true; _dragMoved=false; lastX=e.clientX; lastY=e.clientY;
    cv.style.cursor='grabbing'; e.preventDefault();
  });
  window.addEventListener('mousemove',function(e){
    if(!panning) return;
    var r=cv.getBoundingClientRect();
    var sx=cv.width/r.width, sy=cv.height/r.height;
    var dx=(e.clientX-lastX)*sx, dy=(e.clientY-lastY)*sy;
    if(Math.abs(e.clientX-lastX)+Math.abs(e.clientY-lastY)>2) _dragMoved=true;
    lastX=e.clientX; lastY=e.clientY;
    view.tx+=dx; view.ty+=dy;
    draw();
  });
  window.addEventListener('mouseup',function(){
    if(!panning) return;
    panning=false; if(cv) cv.style.cursor='grab';
    setTimeout(function(){ _dragMoved=false; },0);
  });
  // Touch: one finger pans, two pinch.
  var tPrev=null, tDist=0;
  cv.addEventListener('touchstart',function(e){
    if(e.touches.length===1){ tPrev=[e.touches[0].clientX,e.touches[0].clientY]; }
    else if(e.touches.length===2){
      tDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
    }
  },{passive:true});
  cv.addEventListener('touchmove',function(e){
    var r=cv.getBoundingClientRect(), sx=cv.width/r.width, sy=cv.height/r.height;
    if(e.touches.length===1&&tPrev){
      view.tx+=(e.touches[0].clientX-tPrev[0])*sx;
      view.ty+=(e.touches[0].clientY-tPrev[1])*sy;
      tPrev=[e.touches[0].clientX,e.touches[0].clientY];
      e.preventDefault(); draw();
    } else if(e.touches.length===2){
      var nd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      if(tDist>0){
        var mx=((e.touches[0].clientX+e.touches[1].clientX)/2-r.left)*sx;
        var my=((e.touches[0].clientY+e.touches[1].clientY)/2-r.top)*sy;
        var before=toWorld(mx,my);
        view.z=clamp(view.z*(nd/tDist),VIEW_MIN,VIEW_MAX);
        var k=viewScale();
        view.tx=mx-before[0]*k; view.ty=my-before[1]*k;
      }
      tDist=nd; e.preventDefault(); draw();
    }
  },{passive:false});
  cv.addEventListener('touchend',function(){ tPrev=null; tDist=0; },{passive:true});
}
window.cityZoom=function(f){
  if(!cv) return;
  var mx=cv.width/2, my=cv.height/2, before=toWorld(mx,my);
  view.z=clamp(view.z*f,VIEW_MIN,VIEW_MAX);
  var k=viewScale();
  view.tx=mx-before[0]*k; view.ty=my-before[1]*k;
  draw();
};
window.cityZoomReset=function(){ view.z=1; view.tx=0; view.ty=0; draw(); };

function fit(){
  if(!cv) return;
  var box=cv.parentNode;
  var w=(box&&box.clientWidth)||cv.clientWidth;
  var h=(box&&box.clientHeight)||0;
  if(!w) return;
  // Fall back to a wide aspect only when the container has no height to give.
  if(!h||h<80) h=Math.round(w*0.62);
  DPR=Math.min(2,window.devicePixelRatio||1);
  CW=w; CH=h;
  cv.width=Math.round(w*DPR); cv.height=Math.round(h*DPR);
  cv.style.width='100%'; cv.style.height='100%';
  autoFrame();
  bindMapView();
  draw();
}
window.addEventListener('resize',function(){ if(cOpen&&cData) fit(); });

// ── Actions ──────────────────────────────────────────────────────────────────
function curDistrict(){ return SECTORS[sel] ? SECTORS[sel].idx : null; }
function dmsg(type,extra){
  var idx=curDistrict();
  if(cOpen==null||idx==null) return;
  var o={type:type,colonyId:cOpen,district:idx};
  if(extra) for(var k in extra) o[k]=extra[k];
  sendCity(o);
}
window.cityBuySeat=function(){
  var s=SECTORS[sel]; if(!s) return;
  var d=s.d||{};
  var msg = d.mayor
    ? window.tf('city.confirmOust','Unseat {who} of {where} for {price}? They receive {comp} in compensation.',{who:(d.mayorName||'the mayor'),where:s.n,price:fm(d.seat),comp:fm(d.compensation)})
    : window.tf('city.confirmSeat','Take the mayoral charter of {where} for {price}?',{where:s.n,price:fm(d.seat)});
  if(!window.confirm(msg)) return;
  dmsg('city_buy_seat');
};
window.cityInvest=function(){ dmsg('city_invest'); };
window.cityWorks=function(){
  var s=SECTORS[sel]; if(!s) return;
  var d=s.d||{};
  if(!window.confirm(window.tf('city.confirmWorks','Commission civic works in {where} for {price}? This buys no income and is never refunded.',{where:s.n,price:fm(d.nextWorks||0)}))) return;
  dmsg('city_works');
};
window.cityRenameDistrict=function(){
  var s=SECTORS[sel]; if(!s) return;
  var n=window.prompt(T('city.renamePrompt','New name for this district:'), s.n);
  if(n==null) return;
  dmsg('city_rename_district',{name:String(n).slice(0,40)});
};
window.cityCutPreview=function(v){
  var e=document.getElementById('cityCutVal'); if(e) e.textContent=Math.round(Number(v)||0)+'%';
  cPendingCut=Math.round(Number(v)||0)/100;
};
window.cityApplyCut=function(){
  if(cPendingCut==null){ toast(T('city.noChanges','No changes.'),'#ffb547'); return; }
  dmsg('city_set_cut',{cut:cPendingCut});
};
window.citySetFavoured=function(k){ dmsg('city_set_favoured',{favoured:k}); };
window.cityLease=function(kind){
  var nm=document.getElementById('cityShopName');
  var ds=document.getElementById('cityShopDesc');
  var name=nm?String(nm.value||'').trim():'';
  if(name.length<3){ toast(T('city.needName','Give the shop a name first.'),'#ffb547'); if(nm) nm.focus(); return; }
  dmsg('city_lease_shop',{kind:kind,name:name,descr:ds?String(ds.value||''):''});
};
window.cityBuyShop=function(id,current,cost){
  var n=window.prompt(T('city.buyPrompt','Buy this business for ')+fm(cost)+'. '+T('city.buyPrompt2','Trading name:'), current||'');
  if(n==null) return;
  n=String(n).trim();
  if(n.length<3){ toast(T('city.needName','Give the shop a name first.'),'#ffb547'); return; }
  sendCity({type:'city_buy_shop',colonyId:cOpen,shopId:id,name:n.slice(0,40),descr:''});
};
window.cityCloseShop=function(id){
  if(!window.confirm(T('city.confirmClose','Close this storefront? The lease is not refunded.'))) return;
  sendCity({type:'city_close_shop',colonyId:cOpen,shopId:id});
};
window.cityLever=function(k,v){
  if(!cData) return;
  var d=(SECTORS[sel]&&SECTORS[sel].d)||{};
  if(!cPendingLevers) cPendingLevers=Object.assign({},d.levers||{});
  cPendingLevers[k]=Math.max(0,Math.min(100,Math.round(Number(v)||0)));
  var el=document.getElementById('cityLv_'+k); if(el) el.textContent=cPendingLevers[k];
};
window.cityApplyLevers=function(){
  if(!cPendingLevers){ toast(T('city.noPolicyChanges','No policy changes.'),'#ffb547'); return; }
  dmsg('city_set_levers',{levers:cPendingLevers});
};

// ── WS wiring ────────────────────────────────────────────────────────────────
function adoptData(d){
  var keepSel=sel;
  cData=d;
  cSum[d.colonyId]=d.summary;
  cPendingLevers=null; cPendingCut=null;
  buildSectors();
  sel=Math.min(keepSel,Math.max(0,SECTORS.length-1));
}
document.addEventListener('fm_ws_msg',function(e){
  var msg=e.detail; if(!msg) return;

  if(msg.type==='city_summaries'&&Array.isArray(msg.data)){
    msg.data.forEach(function(s){ cSum[s.colonyId]=s; });
    try{ if(window.gSelected&&document.getElementById('gCityCard')) window.renderCityCard(window.gSelected); }catch(_){}
    if(cOpen&&cData) setHtml('cityTabs',tabsHtml());
  }

  if(msg.type==='city_update'&&msg.data&&msg.data.colonyId){
    cSum[msg.data.colonyId]=msg.data;
    try{ if(window.gSelected===msg.data.colonyId&&document.getElementById('gCityCard')) window.renderCityCard(msg.data.colonyId); }catch(_){}
    if(cOpen===msg.data.colonyId&&cData){
      if(cRefreshTimer) clearTimeout(cRefreshTimer);
      cRefreshTimer=setTimeout(function(){ if(cOpen) sendCity({type:'city_data_request',colonyId:cOpen}); },900);
    }
  }

  if(msg.type==='city_data'&&msg.data){
    if(cOpen===msg.data.colonyId){
      var first=!cData;
      adoptData(msg.data);
      if(first) renderOverlay();
      else { draw(); refreshPanels(); setHtml('cityCharterBox',renderCharterBox()); setHtml('cityWarBox',renderWarBox()); }
    }
  }

  if(msg.type==='city_ousted'&&msg.data){
    toast(window.tf('city.oustedMsg','{who} has unseated you as mayor of {where}. Compensation {comp}.',{who:msg.data.by,where:msg.data.name,comp:fm(msg.data.compensation)}),'#e74c3c');
    if(cOpen===msg.data.colonyId) sendCity({type:'city_data_request',colonyId:cOpen});
  }

  if(msg.type==='city_lapsed'&&msg.data){
    toast(window.tf('city.lapsedMsg','You have lost the charter of {where} to unpaid civic debt.',{where:msg.data.name}),'#e74c3c');
    if(cOpen===msg.data.colonyId) sendCity({type:'city_data_request',colonyId:cOpen});
  }

  // The server drops a frame rather than the socket when a connection outruns
  // its budget, and it says so at most once every few seconds. Without this the
  // dropped message just looks like the button did nothing.
  if(msg.type==='rate_limited'){
    toast(T('city.rateLimited','Too many requests. Slow down a moment.'),'#e8b84a');
    return;
  }

  if(msg.type==='city_petitioned'&&msg.data){
    toast(window.tf('city.petitionedMsg','{who} has petitioned against your administration of {where}.',
      {who:msg.data.by,where:msg.data.name}),'#e8b84a');
    if(cOpen===msg.data.colonyId) sendCity({type:'city_data_request',colonyId:cOpen});
  }

  if(msg.type==='city_ack'&&msg.data){
    if(msg.data.ok){
      syncCash(msg.data.cash);
      if(msg.data.city&&cOpen===msg.data.city.colonyId){
        adoptData(msg.data.city);
        draw(); refreshPanels();
        setHtml('cityCharterBox',renderCharterBox());
        setHtml('cityWarBox',renderWarBox());
      }
      var msgs={ seat:T('city.seatTaken','Seat acquired.'),
                 invest:T('city.developed','Development approved.'),
                 cut:T('city.cutSet','Commerce rate set.'),
                 favoured:T('city.favourSet','Favoured trade set.'),
                 rename:T('city.renamed','District renamed.'),
                 lease:T('city.shopOpened','Storefront opened.'),
                 renameShop:T('city.shopRenamed','Storefront renamed.'),
                 buyshop:T('city.shopBought','Business acquired. It continues trading at its established rate.'),
                 close:T('city.shopClosed','Storefront closed.'),
                 works:T('city.worksBuilt','Civic works commissioned.'),
                 levers:T('city.policyApplied','District policy applied.') };
      toast(msgs[msg.data.action]||T('city.done','Done.'),'#9dff5a');
    } else {
      toast(msg.data.error||T('city.error','City registry error.'),'#e74c3c');
    }
  }
});

// Ask for summaries once the socket exists (galaxy tab may open later).
var _cityBootTries=0;
var _cityBoot=setInterval(function(){
  _cityBootTries++;
  if(window._ws&&window._ws.readyState===1){ askSummaries(); clearInterval(_cityBoot); }
  else if(_cityBootTries>120) clearInterval(_cityBoot);
},1000);

})();
