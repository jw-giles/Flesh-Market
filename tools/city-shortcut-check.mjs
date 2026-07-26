// city-shortcut-check
//
// Drives the real index.html markup through jsdom: opens a colony's city the
// way the OPEN CITY button on the colony detail card does, and asserts the
// cities pane actually becomes VISIBLE, not merely that a request went out.
//
// The bug this was written for sent the city_data_request correctly and still
// showed the player nothing, because the pane it rendered into was display:none
// the whole time. Asserting on the websocket traffic alone would have passed.
//
// Requires jsdom, which is not a project dependency:
//   npm i jsdom && node tools/city-shortcut-check.mjs
// Run from the repo root.
import fs from 'fs';
import { JSDOM } from 'jsdom';

const ROOT = process.cwd();
let pass = 0, fail = 0; const failures = [];
const ok = (n, c, d) => { if (c) { pass++; console.log('  PASS  ' + n); }
  else { fail++; failures.push(n + (d ? '  [' + d + ']' : '')); console.log('  FAIL  ' + n + (d ? '  [' + d + ']' : '')); } };

const html = fs.readFileSync(ROOT + '/client/index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;

// jsdom has no layout, so offsetParent is always null. Emulate it from the
// inline display chain, which is exactly what the real code is testing for.
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', {
  get() {
    let el = this;
    while (el && el !== doc.body) {
      if (el.style && el.style.display === 'none') return null;
      el = el.parentElement;
    }
    return el ? doc.body : null;
  }, configurable: true
});

// Minimal globals the two modules touch.
window.ME = { id: 'p1', name: 'Tester', cash: 1e12, faction: 'coalition' };
window._lang = 'en';
window.t = (k, fb) => (fb !== undefined ? fb : k);
window.tf = (k, fb, v) => { let s = fb; if (v) for (const k2 in v) s = s.split('{' + k2 + '}').join(v[k2]); return s; };
const sent = [];
window.sendWS = o => sent.push(o);
window._ws = { readyState: 1, send: s => sent.push(JSON.parse(s)) };
window.gToast = () => {};
window.requestAnimationFrame = cb => 0;
window.cancelAnimationFrame = () => {};
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? { width: 800, height: 600 } : () => ({})) });

const run = src => {
  try { window.eval(src); }
  catch (e) { console.log('  (module threw during load: ' + e.message + ')'); }
};
run(fs.readFileSync(ROOT + '/client/assets/city.js', 'utf8'));

// Wire the MAIN tab handler the way core.js does. #galacticTab is display:none
// in the raw markup, and display:none on an ancestor kills the subtree however
// the city pane is positioned, so the shortcut has to reach this too.
doc.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const sel = tab.getAttribute('data-tab');
    const gt = doc.getElementById('galacticTab');
    if (gt) gt.style.display = sel === 'galactic' ? 'flex' : 'none';
  });
});

// Wire the galaxy sub tab handler the same way galaxy.js does, since loading
// all of galaxy.js needs far more of the app than this test is about.
doc.querySelectorAll('.galaxy-stab').forEach(btn => {
  btn.addEventListener('click', () => {
    const t = btn.getAttribute('data-gstab');
    const mp = doc.getElementById('gMapPane'), cyp = doc.getElementById('gCitiesPane');
    if (mp) mp.style.display = t === 'map' ? 'flex' : 'none';
    if (cyp) { cyp.style.display = t === 'cities' ? 'block' : 'none';
               cyp.classList.toggle('fmfull', t === 'cities'); }
    if (t === 'cities') { if (window.cityTabLoad) window.cityTabLoad(); }
    else if (window.cityLeaveFull) window.cityLeaveFull();
  });
});

console.log('== Markup the shortcut depends on ==');
ok('the cities sub tab control exists', !!doc.querySelector('[data-gstab="cities"]'));
ok('there is no [data-tab="cities"] main tab, which is what the old code looked for',
   !doc.querySelector('[data-tab="cities"]'));
ok('the cities pane and its inner host exist',
   !!doc.getElementById('gCitiesPane') && !!doc.getElementById('citiesTabInner'));

console.log('\n== Starting state: galaxy tab open, map sub tab, cities hidden ==');
doc.querySelector('[data-tab="galactic"]').click();
doc.getElementById('gMapPane').style.display = 'flex';
doc.getElementById('gCitiesPane').style.display = 'none';
ok('the galaxy tab is on screen to begin with',
   doc.getElementById('gMapPane').offsetParent !== null);
ok('the cities host starts off screen', doc.getElementById('citiesTabInner').offsetParent === null);

console.log('\n== Render a colony card and click OPEN CITY ==');
// Seed one summary so renderCityCard draws, exactly as a city_summaries would.
window.eval(`window.__test_seed = function(id){
  var msg = { type:'city_summaries', data:[{ colonyId:id, cls:'city', pop:380, book:0,
    districts:9, mayors:0, shops:1143, unrest:27, crime:40, output:59, prosperity:50,
    food:100, med:100, tech:100, blockade:0, locked:null, stripAt:0, layout:'radial',
    terrain:'dust', works:0, jade:0 }] };
  if (window.__cityOnMsg) window.__cityOnMsg(msg);
};`);

// The module listens on the app's message bus; drive renderCityCard directly
// after seeding cSum through the same summaries path the app uses.
const seeded = window.eval(`
  (function(){
    try {
      var ev = new window.MessageEvent('message');
      return typeof window.renderCityCard === 'function';
    } catch(e){ return false; }
  })()
`);
ok('the city module exposes renderCityCard and cityOpen',
   typeof window.renderCityCard === 'function' && typeof window.cityOpen === 'function');

sent.length = 0;
window.cityOpen('aurora_prime');

const pane = doc.getElementById('gCitiesPane');
const host = doc.getElementById('citiesTabInner');
ok('the cities pane is now displayed', pane.style.display === 'block', pane.style.display);
ok('it entered the fullscreen city view', pane.classList.contains('fmfull'));
ok('the map pane was hidden', doc.getElementById('gMapPane').style.display === 'none');
ok('the city host is now on screen', host.offsetParent !== null);
const req = sent.filter(m => m && m.type === 'city_data_request');
ok('a city_data_request was sent', req.length > 0, JSON.stringify(sent.map(s => s.type)));
ok('it asked for the colony the card was showing',
   req.length > 0 && req[req.length - 1].colonyId === 'aurora_prime',
   req.length ? String(req[req.length - 1].colonyId) : 'none');

console.log('\n== A second shortcut while already inside the city view ==');
sent.length = 0;
window.cityOpen('vein_cluster');
const req2 = sent.filter(m => m && m.type === 'city_data_request');
ok('switching colonies from inside the view still requests',
   req2.length > 0 && req2[req2.length - 1].colonyId === 'vein_cluster',
   req2.length ? String(req2[req2.length - 1].colonyId) : 'none');
ok('the pane stayed open', doc.getElementById('gCitiesPane').style.display === 'block');

console.log('\n== The shortcut from a cold start, galaxy tab not even open ==');
doc.querySelector('[data-gstab="map"]').click();
doc.querySelector('[data-tab="market"]').click();
ok('the galaxy tab is closed', doc.getElementById('galacticTab').style.display === 'none');
sent.length = 0;
window.cityOpen('the_hollow');
ok('the shortcut reopens the galaxy tab',
   doc.getElementById('galacticTab').style.display === 'flex',
   doc.getElementById('galacticTab').style.display);
ok('and lands in the city view on screen',
   doc.getElementById('citiesTabInner').offsetParent !== null);
const req3 = sent.filter(m => m && m.type === 'city_data_request');
ok('asking for the right colony', req3.length > 0 && req3[req3.length-1].colonyId === 'the_hollow',
   req3.length ? String(req3[req3.length-1].colonyId) : 'none');

console.log('\n== Leaving ==');
doc.querySelector('[data-gstab="map"]').click();
ok('exiting drops fullscreen', !doc.getElementById('gCitiesPane').classList.contains('fmfull'));
ok('the map comes back', doc.getElementById('gMapPane').style.display === 'flex');

console.log('\n---------------------------------------------');
console.log(`${pass} passed, ${fail} failed`);
failures.forEach(f => console.log('  - ' + f));
process.exit(fail ? 1 : 0);
