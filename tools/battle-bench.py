#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# battle-bench.py - bake the standalone battlefield bench.
#
# THE BENCH EXISTED AND WAS NOT IN THE REPO. Every visual change since 1.5.2.0
# was checked on a harness assembled by hand outside the tree, which meant the
# one tool that could answer "does this look right" was the one thing nobody but
# its author could run. This bakes it as a deliverable.
#
# SELF-CONTAINED ON PURPOSE. Every sheet, patch and mesh is inlined as base64,
# so the file opens from disk over file:// with no server, no asset directory
# and no build step. That matters because the failure it has to survive is a
# missing asset path, and a bench that silently falls back to wireframe while
# you are trying to look at a sprite is worse than no bench.
#
# IT RUNS THE SHIPPED CODE. reach-battle.js and coalition-sprites.js are
# inlined verbatim, not reimplemented. A bench with its own renderer tests the
# bench. The only things stubbed are the server payload and the two client
# tables the galaxy bundle would normally publish, and those are stubbed with
# the same values the real client uses.
#
#   python3 tools/battle-bench.py            -> tools/battle-bench.html
# ═══════════════════════════════════════════════════════════════════════════
import base64, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'battle-bench.html')


def b64(p):
    return 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()


def read(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()


def sheets():
    out = {}
    for d in ('client/assets/space/troops',
              'client/assets/space/vehicles',
              'client/assets/space/brood'):
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for f in sorted(os.listdir(full)):
            if f.endswith('.png'):
                out[f[:-4]] = b64(os.path.join(full, f))
    return out


def terrain():
    out = {}
    full = os.path.join(ROOT, 'client/assets/space/terrain')
    if os.path.isdir(full):
        for f in sorted(os.listdir(full)):
            if f.endswith('.png'):
                out[f[:-4]] = b64(os.path.join(full, f))
    return out


def optional_json(rel, default):
    p = os.path.join(ROOT, rel)
    return json.loads(open(p).read()) if os.path.exists(p) else default


def battle_panel():
    """The bench binds the real panel markup, ids and all, rather than a copy.
    A copy drifts, and the first thing that breaks is a button the renderer
    still writes to and the bench no longer has."""
    html = read('client/index.html')
    m = re.search(r'<div id="reachBattle".*?\n</div>', html, re.S)
    if not m:
        raise SystemExit('could not find the reachBattle panel in client/index.html')
    return m.group(0).replace('display:none', 'display:block')


def build():
    return (TEMPLATE
            .replace('/*__SPRITES__*/', json.dumps(sheets()))
            .replace('/*__TERRAIN__*/', json.dumps(terrain()))
            .replace('/*__MESHES__*/', json.dumps(
                optional_json('client/assets/space/nature/meshes.json', {})))
            .replace('/*__BROOD__*/', json.dumps(
                optional_json('client/assets/space/brood/geometry.json', {})))
            .replace('/*__PANEL__*/', battle_panel())
            .replace('/*__PALETTE__*/', read('client/assets/planet-palette.js'))
            .replace('/*__SPRITEJS__*/', read('client/assets/coalition-sprites.js'))
            .replace('/*__BATTLEJS__*/', read('client/assets/reach-battle.js'))
            .replace('/*__VERSION__*/', json.loads(read('client/version.json'))['version']))


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>FleshMarket battle bench /*__VERSION__*/</title>
<style>
  html,body{margin:0;height:100%;background:#04050a;overflow:hidden;
            font-family:'Courier New',monospace;color:#d8d2c4}
  #reachBattle{display:block!important}
  #bench{position:fixed;right:0;top:0;bottom:0;width:250px;z-index:99999;
         background:#07070cf2;border-left:1px solid #23232b;padding:10px 12px;
         overflow-y:auto;font-size:.62rem;letter-spacing:.04em}
  #bench h4{margin:14px 0 6px;font-size:.56rem;letter-spacing:.16em;color:#4a4842;
            font-weight:normal;border-top:1px solid #1c1c24;padding-top:9px}
  #bench h4:first-child{border-top:0;margin-top:0;padding-top:0}
  #bench button{background:#0b0b10;color:#c9c7bd;border:1px solid #2a2a33;
        font-family:inherit;font-size:.56rem;letter-spacing:.06em;padding:3px 7px;
        cursor:pointer;margin:0 3px 3px 0}
  #bench button:hover{border-color:#4a4a55;color:#e8e4d8}
  #bench button.on{border-color:#4ecdc4;color:#4ecdc4}
  #bench input[type=range]{width:100%;margin:2px 0 6px}
  #bench .row{display:flex;justify-content:space-between;color:#8f8d84;margin:1px 0}
  #bench .row b{color:#c9c7bd;font-weight:normal}
  #bench .warn{color:#c2551f;line-height:1.45;margin-top:8px}
</style></head><body>

/*__PANEL__*/

<div id="bench"></div>

<script>
/* Assets first: the modules below look for these on window and fall back to
   network paths that do not exist beside a file:// page. */
window.FM_TROOP_SRC   = /*__SPRITES__*/;
window.FM_TERRAIN_SRC = /*__TERRAIN__*/;
window.FM_NATURE_SRC  = /*__MESHES__*/;
window.FM_BROOD_GEOM  = /*__BROOD__*/;

/* The two tables galaxy.js publishes. Stubbed with the real values rather than
   with placeholders, so the bench draws the worlds the game draws. */
window.COLONY_PLANET = {
  ks_gate_reach:{folder:'animated/desert_1'}, ks_02:{folder:'animated/desert_2'},
  ks_03:{folder:'animated/desert_1'},         ks_04:{folder:'animated/lava_2'},
  ks_05:{folder:'animated/barren_2'},         ks_06:{folder:'animated/desert_2'},
  ks_07:{folder:'animated/ocean_clouds'},     ks_08:{folder:'animated/ice'},
  ks_09:{folder:'animated/desert_1'},         ks_10:{folder:'animated/barren_4'}};
window.REACH_TERRAIN = {
  ks_gate_reach:'dust', ks_02:'dust',  ks_03:'dust',  ks_04:'veins', ks_05:'rift',
  ks_06:'dust',         ks_07:'ocean', ks_08:'ice',   ks_09:'dust',  ks_10:'tether'};

/* A server payload, shaped exactly like reachPayload's. Editable live from the
   panel, which is the whole point: funding, garrison and Jade share are the
   three inputs the force model reads and the bench exists to sweep them. */
var WORLDS = ['ks_gate_reach','ks_02','ks_03','ks_04','ks_05','ks_06','ks_07','ks_08','ks_09','ks_10'];
window._REACH = { coalIn:0, worlds:{}, waveFormMs:0,
  push:{minFunders:1,cap:5e7,minCommit:1e5} };
function mkWorld(){
  return { hive:60, front:1, status:'contested', revealed:1, taken:0, waves:6,
    fund:0, eligible:4, jade:1, jadeFwd:1,
    /* Works and nodes are not empty by default any more. Empty is a legal state
       and it is also the one state in which several systems draw nothing at all,
       so a bench that starts there quietly tests less than it looks like it
       does: the egg clutches never appeared once because `nodes` was `[]`, and
       nothing was actually wrong. Seeded with some of each, toggleable below. */
    fobs:[{type:'fob',zone:0,at:1}], nodes:[{zone:0,at:1},{zone:0,at:2}], pendingFob:0,
    fobOpen:[], bonus:{arm:0,air:0,strike:1,repel:1,price:1}, mass:0, vote:null,
    burn:0, cover:1, daysLeft:-1,
    zones:[{ name:'BENCH', hive:55, intensity:70, live:1, cleared:0, waveAt:0,
             done:0, win:null }] };
}
WORLDS.forEach(function(id){ window._REACH.worlds[id] = mkWorld(); });
</script>

<script>/*__PALETTE__*/</script>
<script>/*__SPRITEJS__*/</script>
<script>/*__BATTLEJS__*/</script>

<script>
(function(){
'use strict';
var el = document.getElementById('bench');
/* Mirrors COAL_ENTRY_JADE in server/reach.js. Duplicated rather than imported
   because the bench has no server; reach-check asserts the two agree, so it
   cannot drift silently the way the two terrain tables once did. */
var COAL_ENTRY_JADE = 0.6;
var S = { world:'ks_02', zone:0, jade:1, coalIn:0, fund:0, garrison:50, hive:55,
          intensity:70, forceCls:null, nodes:2, fobs:1 };

function W(){ return window._REACH.worlds[S.world]; }

/* Reopening is how a change is applied, because that is how the real client
   applies one: reachWatch re-seeds terrain, palette, patterns and the force
   model from the payload. A bench that poked module state directly would test a
   path the game never takes. */
function apply(){
  var w = W();
  w.jade = S.jade; w.hive = S.hive;
  w.nodes = []; for (var n = 0; n < S.nodes; n++) w.nodes.push({ zone:0, at:n+1 });
  w.fobs  = []; for (var f = 0; f < S.fobs;  f++) w.fobs.push({ type:'fob', zone:0, at:f+1 });
  w.zones[0].hive = S.hive; w.zones[0].intensity = S.intensity;
  w.zones[0].win = S.fund > 0
    ? { open:1, pool:S.fund, target:6e6, funders:4, endsAt:Date.now()+9e5, state:'open' }
    : null;
  window._REACH.coalIn = S.coalIn;
  if (window.reachWatchClose) window.reachWatchClose();
  setTimeout(function(){
    window.reachWatch(S.world, S.zone);
    if (S.forceCls && window._fmReachDebug) window._fmReachDebug.forceCoalClass(S.forceCls);
  }, 40);
}

function group(title){ var h=document.createElement('h4'); h.textContent=title; el.appendChild(h); return h; }
function btn(label, active, fn){
  var b=document.createElement('button'); b.textContent=label;
  if(active) b.className='on';
  b.onclick=function(){ fn(); render(); };
  return b;
}
function slider(label, min, max, step, get, set){
  var r=document.createElement('div'); r.className='row';
  r.innerHTML='<span>'+label+'</span><b>'+get()+'</b>'; el.appendChild(r);
  var i=document.createElement('input');
  i.type='range'; i.min=min; i.max=max; i.step=step; i.value=get();
  i.oninput=function(){ r.querySelector('b').textContent=this.value; };
  i.onchange=function(){ set(Number(this.value)); apply(); };
  el.appendChild(i);
}

var CLASSES = ['inf','enf','eng','turret','tank','heli'];

function render(){
  el.innerHTML='';
  group('WORLD');
  WORLDS.forEach(function(id){
    el.appendChild(btn(id.replace('ks_','').replace('gate_reach','GATE').toUpperCase(),
      S.world===id, function(){ S.world=id; apply(); }));
  });

  group('WAR');
  /* THE BUTTON FLIPPED coalIn AND NOTHING ON SCREEN CHANGED, which is a bench
     that reports state rather than shows it. coalIn only gates whether the
     per-world share MEANS anything; the share itself stayed at 100% Jade, so
     declaring the Coalition produced an all-Jade line with a different label.

     The bench now does what the server does on entry: an untouched world takes
     a default mix. Same constant, so what you see here is what a world looks
     like the moment the GM declares. The slider below still sweeps it. */
  el.appendChild(btn(S.coalIn?'COALITION IN':'JADE ALONE', !!S.coalIn,
    function(){
      S.coalIn = S.coalIn ? 0 : 1;
      S.jade = S.coalIn ? COAL_ENTRY_JADE : 1;
      apply();
    }));
  if(S.coalIn) slider('jade share % (rest is Coalition)', 25, 100, 5,
    function(){ return Math.round(S.jade*100); },
    function(v){ S.jade=v/100; });
  slider('push funding \u0192m', 0, 12, 0.5,
    function(){ return S.fund/1e6; }, function(v){ S.fund=v*1e6; });
  slider('zone hive %', 5, 95, 5, function(){ return S.hive; }, function(v){ S.hive=v; });
  slider('intensity', 5, 100, 5, function(){ return S.intensity; }, function(v){ S.intensity=v; });

  group('BROOD WORKS');
  el.appendChild(btn(S.nodes ? 'MOUNDS ' + S.nodes : 'NO MOUNDS', !!S.nodes,
    function(){ S.nodes = (S.nodes + 1) % 4; apply(); }));
  el.appendChild(btn(S.fobs ? 'WORKS ' + S.fobs : 'NO WORKS', !!S.fobs,
    function(){ S.fobs = (S.fobs + 1) % 3; apply(); }));

  group('FORCE THE LINE');
  el.appendChild(btn('mixed', !S.forceCls, function(){ S.forceCls=null; apply(); }));
  CLASSES.forEach(function(c){
    el.appendChild(btn(c, S.forceCls===c, function(){ S.forceCls=c; apply(); }));
  });

  group('LIVE');
  var d=window._fmReachDebug;
  var counts = d && d.counts ? d.counts() : null;
  if(counts) for(var k in counts){
    var r=document.createElement('div'); r.className='row';
    r.innerHTML='<span>'+k+'</span><b>'+counts[k]+'</b>'; el.appendChild(r);
  }
  var seen = d && d.anims ? d.anims() : null;
  if(seen){
    group('ANIMATIONS SEEN');
    var keys=Object.keys(seen).sort();
    if(!keys.length){
      var n=document.createElement('div'); n.className='row';
      n.innerHTML='<span>none</span><b>wireframe only</b>'; el.appendChild(n);
    }
    keys.forEach(function(a){
      var r=document.createElement('div'); r.className='row';
      r.innerHTML='<span>'+a+'</span><b>'+seen[a]+'</b>'; el.appendChild(r);
    });
  }
  var failed = window.FMTroops && window.FMTroops.failed ? window.FMTroops.failed() : [];
  if(failed && failed.length){
    var f=document.createElement('div'); f.className='warn';
    f.textContent='SHEETS FAILED: '+failed.join(', ');
    el.appendChild(f);
  }
}

window.addEventListener('load', function(){
  setTimeout(function(){ apply(); render(); setInterval(render, 1500); }, 200);
});
})();
</script>
</body></html>
"""

if __name__ == '__main__':
    open(OUT, 'w', encoding='utf-8').write(build())
    print('wrote %s (%.0f KB)' % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) / 1024))
