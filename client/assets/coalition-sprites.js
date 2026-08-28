// ═══════════════════════════════════════════════════════════════════════════
// coalition-sprites.js - the Coalition muster strip.
//
// WHY THIS IS NOT IN THE BATTLEFIELD, since that is the obvious place to put
// a soldier sprite and it is the wrong one. The pack is SINGLE FACING: every
// frame is a right-facing profile. reach-battle.js runs an orbiting camera,
// so a billboarded profile sprite would show a man walking sideways past the
// viewer no matter which way he is actually heading; Doom got away with this
// by shipping eight rotations per pose and this pack has one. There are also
// no Khai'sultull sprites at all, so a side-on battle view would be pixel art
// on one side of the line and wireframe on the other.
//
// WHAT IT IS FOR INSTEAD. A side-on formation is exactly what this art is, and
// the push window is the one place in the game that needs a picture of a
// Coalition formation and nothing else. It answers the question a player is
// actually asking when they decide whether to commit, which is not "how full
// is the bar" but "what does my money put on the ground".
//
// THE STRIP IS DERIVED, NOT DECORATIVE. Its composition comes from the same
// two numbers the battlefield uses: the funded ratio sets the armour and air
// shares, and those decide which figures stand in the line. An unfunded push
// musters riflemen. A funded one musters shield troopers and an engineer with
// a turret. If the model changes, the picture changes with it, because there
// is one model.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var BASE = 'assets/space/troops/';
  var VEH  = 'assets/space/vehicles/';
  /* CACHE BUSTING, and it is here rather than everywhere because these are the
     only assets in the client that were ADDED after players already had a
     cached copy of the page. A browser caches a 404 as readily as a 200: once
     a sheet has been requested before it existed on a host, the miss is
     remembered and the file is never fetched again, however many times it is
     deployed afterwards. A hard refresh clears it; a player who never hard
     refreshes carries the miss indefinitely.

     The constant is bumped by hand, which would rot, so tools/reach-check.mjs
     asserts it equals client/version.json. It cannot silently fall behind. */
  var BUILD = '1.10.1.5';
  /* Published, because the terrain patches need the same cache bust for the
     same reason and a SECOND hand-bumped literal is a second thing to rot.
     reach-battle.js reads this and omits the query entirely if it is absent,
     which is worse than a bust and much better than a stale wrong one. */
  window.FM_BUILD = BUILD;
  var CELL_W = 80, CELL_H = 64, PAD = 16;

  /* ── Sheet geometry ───────────────────────────────────────────────────────
     CELL_W/CELL_H/PAD WERE GLOBAL BECAUSE EVERY SHEET WAS A MAN. The troop pack
     is one pitch: 80x64 cells, 16px of left pad, one row, and a figure standing
     with his feet at a known spot. The moment a vehicle arrives none of that
     holds - the Hound is 250x200 walking and 400x200 firing, on three rows,
     with no pad - so the pitch stops being a constant and becomes a property of
     the sheet. The three globals stay exported because callers use them and
     because they are still exactly right for every troop sheet.

     ax, ay IS THE GROUND CONTACT POINT IN CELL PIXELS, and it is per sheet
     rather than per pack for the same reason. A man's feet and a tank's track
     footprint are not in the same place, and the firing sheet's wider cell puts
     the same tank 150px further right than the walking one. Measured off the
     art, not guessed: the tracks sit at x 64-230 walking and 214-380 firing,
     bottoming at row 159 in both.

     unit IS PIXELS PER WORLD UNIT and it is what keeps a tank the right size
     next to a man. The troop pack draws a 2 metre man in 32 pixels, so 16. The
     Hound is drawn finer: 201 pixels nose to tail for a hull about ten metres
     long with the gun forward, so 20. Rendering each at its own density is what
     makes them agree on screen; forcing one number on both makes whichever lost
     the argument the wrong size forever. */
  var GEOM_DEFAULT = { cw: CELL_W, ch: CELL_H, pad: PAD, cols: 0, ax: 17, ay: 47, unit: 16, base: BASE };
  /* faceLeft: WHICH WAY THE ART IS DRAWN FACING, which is a property of the
     sheet and was being assumed. The troop pack faces right; the Hound faces
     LEFT, barrel to the left, and the battlefield mirrors on one rule for
     everything - so every tank on the field was drawn back to front, driving
     forward and shooting over its own engine deck.

     It looked plausible because a tank is roughly symmetrical in silhouette at
     field size and the gun is thin. Same shape of assumption as the anchor and
     the pixel density before it: one property of one sheet, taken as a property
     of the renderer. */
  var GEOM = {
    hound_walk: { cw: 250, ch: 200, pad: 0, cols: 4, ax: 147, ay: 159, unit: 20, base: VEH, faceLeft: 1 },
    hound_fire: { cw: 400, ch: 200, pad: 0, cols: 8, ax: 297, ay: 159, unit: 20, base: VEH, faceLeft: 1 },
  };

  /* ── One image, many animations ───────────────────────────────────────────
     AN ANIMATION AND A FILE STOPPED BEING THE SAME THING. Every troop animation
     is its own PNG and the Hound's two are as well, so `_img[name]` keyed on the
     animation worked for both. The brood pack ships ONE sheet per creature with
     ONE ANIMATION PER ROW, which is a better shape and which that assumption
     cannot express: nine creatures would have become thirty-odd files, each a
     re-crop of a sheet that was already correct.

     So geometry gains a `sheet`, and the loader keys the IMAGE on that while
     everything else still keys on the animation. A troop animation is its own
     sheet and needs no entry; nothing about the existing path changed.

     ROWS ARE NOT THE SAME LENGTH. crawling_horror's attack is nineteen frames
     and its move is eight, on a sheet as wide as the longest row. That is why
     `frames` comes from the pack's own index via tools/brood-sprites.py rather
     than from dividing the image width, which would count every short row's
     trailing blank cells as frames. Getting that wrong is what made the Hound
     strobe, and it would be four times worse here. */
  var BROOD = 'assets/space/brood/';
  // Pixels per world unit, per sheet. See the note in registerBrood.
  var BROOD_UNIT = {
    horror_s: 15, horror_l: 15,
    hop_s:    12, hop_l:    12,
    fly_s:    11, fly_l:    11,
    grub_s:   12, grub_l:   12,
    egg_l:    26, egg_s:    22,
    splat:    20, splat_b:  20, splat_c:  20,
    splat_d:  30, splat_e:  30,
    proj_s:   10, proj_l:   10,
  };
  function registerBrood(g) {
    for (var sheet in g) {
      var rows = g[sheet];
      /* THE SHEET KEY ITSELF HAS TO BE IN GEOM AND IT WAS NOT. srcFor resolves a
         base directory through geom(name), and sheet() resolves the animation to
         its SHEET first - so it asked geom('horror_s'), which had no entry,
         fell through to GEOM_DEFAULT, and requested the brood art out of
         assets/space/troops/. Every brood sheet 404'd in the real client and
         every creature fell back to wireframe.

         THE BENCH COULD NOT HAVE CAUGHT THIS AND THAT IS THE LESSON. It inlines
         every sheet into FM_TROOP_SRC keyed by filename, and srcFor consults
         that map BEFORE it touches geom. The one code path a self-contained
         bench structurally cannot exercise is the one that turns a name into a
         URL. tools/reach-check.mjs resolves every declared animation to a file
         on disk now, which is the test that does not need a browser. */
      GEOM[sheet] = { sheet: sheet, base: BROOD, cw: 0, ch: 0, pad: 0, cols: 0, unit: 16 };
      for (var anim in rows) {
        var r = rows[anim];
        var key = sheet + '_' + anim;
        GEOM[key] = {
          sheet: sheet, base: BROOD,
          cw: r.cw, ch: r.ch, pad: 0, cols: 0, row: r.row,
          /* ANCHORED BOTTOM-CENTRE, and it has to be measured off the CELL
             rather than off the creature. These sprites are drawn with a bit of
             headroom for wings and raised legs, so the visible body does not
             fill the cell; anchoring on the art's own bounding box would make a
             flyer sink into the ground the moment its wings came down. */
          ax: (r.cw / 2) | 0, ay: r.ch,
          /* ONE PIXEL DENSITY FOR THE WHOLE PACK WAS WRONG AND IT WAS WRONG IN
             THE ONE DIRECTION THAT HIDES ITSELF. At 32 px per world unit a
             space fly is 16px tall and therefore HALF A METRE tall, and the
             size cutoff below then dropped it to a wireframe past about a third
             of the field. So the flyers looked unreplaced: they were tiny where
             you could see them and wireframe where you could not. The projectile
             hit the same wall a patch earlier and got a special case; the right
             fix was never a special case, it was that a pixel density is a
             property of a SHEET, not of a pack.

             Sized by what the creature IS, against a two metre rifleman:

               horror   a spider you would not step over    ~1.6m / ~3.2m
               hop      a crouched thing the size of a dog  ~1.5m / ~2.8m
               fly      wingspan wider than a man is tall   ~1.4m / ~2.9m
               grub     low, long, waist height             ~1.0m
               egg      chest height in a clutch            ~2.4m
               splat    a mark about a man wide             ~1.6m
               proj     a thrown glob                       ~0.8m

             Large and small share a density on purpose, so "large" comes out
             exactly twice the size and means the same thing everywhere. */
          unit: BROOD_UNIT[sheet] || 16,
        };
        FRAMES[key] = r.frames;
      }
    }
  }
  function geom(name) { return GEOM[name] || GEOM_DEFAULT; }
  /* The image key. A sheet-backed animation shares one decode with its siblings;
     everything else is still one file per animation. */
  function imgKey(name) { var g = GEOM[name]; return (g && g.sheet) || name; }

  // Frame counts, measured off the sheets rather than assumed: every animation
  // is (sheetWidth - 16) / 80 frames wide. The three *_static sheets are pose
  // reference art with a different pitch and are deliberately absent.
  var FRAMES = {
  /* The Hound. Walking is four frames in one row. Firing is EIGHT COLUMNS BY
     THREE ROWS AND TWENTY FRAMES, not twenty-four: the last four cells of the
     bottom row are empty, and a naive cols*rows plays four blank frames at the
     end of every shot, which reads as the tank vanishing between rounds. */
  hound_walk:4,
  hound_fire:20,
  assault_auto_shooting:4,
  assault_death:6,
  assault_grenade_throw:3,
  assault_hitted:3,
  assault_idle:4,
  assault_prepare:4,
  assault_single_shot:4,
  assault_sit_auto_shooting:4,
  assault_sit_down:4,
  assault_sit_prepare:4,
  assault_sit_single_shot:4,
  assault_stand_up:4,
  assault_walk:8,
  assault_walk_prepared:8,
  enforcer_bash:4,
  enforcer_cover:4,
  enforcer_death:6,
  enforcer_hitted:3,
  enforcer_idle:4,
  enforcer_prepare:4,
  enforcer_shielded_hitted:3,
  enforcer_shielded_idle:4,
  enforcer_shielded_prepare:4,
  enforcer_shielded_shot:4,
  enforcer_shielded_sit_down:4,
  enforcer_shielded_sit_prepare:4,
  enforcer_shielded_sit_shot:4,
  enforcer_shielded_stand_up:4,
  enforcer_shielded_walk:8,
  enforcer_shielded_walk_prepared:8,
  enforcer_shot:4,
  enforcer_sit_down:4,
  enforcer_sit_prepare:4,
  enforcer_sit_shot:4,
  enforcer_stand_up:4,
  enforcer_walk:8,
  enforcer_walk_prepared:8,
  engineer_auto_shooting:4,
  engineer_death:6,
  engineer_hitted:3,
  engineer_idle:4,
  engineer_maintaining:2,
  engineer_placing_turret:3,
  engineer_prepare:4,
  engineer_single_shot:4,
  engineer_sit_auto_shooting:4,
  engineer_sit_down:4,
  engineer_sit_prepare:4,
  engineer_sit_single_shot:4,
  engineer_stand_up:4,
  engineer_walk:8,
  engineer_walk_prepared:8,
  grenade_explosion:4,
  grenade_flying:4,
  grenade_landing:4,
  turret_auto_shooting:4,
  turret_death:6,
  turret_deconstruct:8,
  turret_deploy:8,
  turret_hitted:3,
  turret_idle:4,
  turret_single_shot:4,  };

  var _img = {}, _pending = {}, _failed = [];
  /* WHERE A SHEET COMES FROM IS OVERRIDABLE. In the client the default path is
     correct, but a standalone page (the battle harness, an OBS overlay) has no
     assets directory beside it, and the failure is silent: every sheet 404s and
     every unit quietly falls back to wireframe, which looks like the sprites
     "not being used" rather than like a broken path. A page that has its art
     inlined sets FM_TROOP_SRC to a name -> src map and this resolves through
     it. */
  function srcFor(name) {
    var m = window.FM_TROOP_SRC;
    if (m && m[name]) return m[name];
    return geom(name).base + name + '.png?v=' + BUILD;
  }
  function sheet(name, onload) {
    name = imgKey(name);
    if (_img[name]) return _img[name];
    if (_pending[name]) return null;
    _pending[name] = 1;
    var im = new Image();
    im.onload = function () { _img[name] = im; if (onload) onload(); };
    im.onerror = function () {
      _pending[name] = 2;
      _failed.push(name);
      /* ONE WARNING PER SHEET, not one warning ever. Warning once globally
         cannot tell you whether a single file is missing or the whole
         directory is, and those need completely different fixes: the first is
         one asset that did not deploy, the second is a broken path. The count
         in the message is what separates them. */
      console.warn('[troops] ' + srcFor(name) + ' failed to load ('
        + _failed.length + ' sheet' + (_failed.length === 1 ? '' : 's')
        + ' so far). Units needing it render as wireframe.');
    };
    im.src = srcFor(name);
    return null;
  }

  // Draw one frame of one animation, bottom-centred on (x, y) at integer
  // scale. Nearest-neighbour is set by the caller once per canvas rather than
  // per draw: toggling imageSmoothingEnabled inside a loop is a state change
  // per figure and this runs every frame.
  // ── Faction tinting ──────────────────────────────────────────────────────
  // Four Coalition classes are sprites rather than wireframes, so a second
  // faction wearing the same kit is not a stroke colour: it is pixels. Doing it
  // as a second set of sheets on disk means an art pass per faction forever.
  // Doing it as a tint means every faction after the first is a hex value.
  //
  // THE CACHE KEY IS FACTION PLUS ANIMATION, not animation. Keying on the
  // animation alone works perfectly until two factions are on screen at once,
  // at which point whichever drew first wins and the other wears its colours.
  // That is a bug that looks like it works, so the key is settled here, before
  // the first tint lands, rather than retrofitted after.
  //
  // source-atop paints only where the sheet is already opaque, so the figure's
  // own alpha survives untouched and no silhouette leaks into the transparent
  // margin. Partial alpha on the fill leaves the original shading reading
  // through, which is what keeps a tinted sheet looking like armour rather than
  // like a decal.
  // Jade Circuit is DARK STEEL: luminance preserved, colour removed, a faint
  // cool cast on top. The first attempt washed the sheet toward a mid grey with
  // a partial source-atop fill, which does not desaturate so much as compress:
  // darks lift, lights drop, and the whole figure lands in a narrow band around
  // the fill value. At field size the turret nearly vanished and the enforcer's
  // shield stopped being a separate object from his body.
  //
  // This keeps every original luminance and throws away only the hue, so the
  // internal shading that makes the pixel art read at 32 pixels survives intact.
  //
  // DONE WITH getImageData RATHER THAN THE 'saturation' BLEND MODE. The blend
  // would be shorter, and it would also render slightly differently depending on
  // how a given browser implements it. This is arithmetic, so it is the same
  // everywhere, and it runs once per faction and animation behind the cache.
  /* WHICH FACTION IS THE UNTINTED ONE HAS FLIPPED, and it is a bigger change
     than a pair of hex values because 'coal' was hardcoded as the identity case
     in the guard below. The art ships GREEN: the troop pack is dark olive
     (mean 48,55,46) and the Hound is dark teal (43,73,73). That is Jade Circuit,
     whose war this is and whose line is the only one on the ground until the
     Coalition declares, so Jade wears the art as drawn and pays nothing.

     Steel is retired. It was written when the Coalition was the default force
     and Jade was the guest wearing a recolour of its kit; with the roles
     inverted, tinting the majority faction every frame to look like the pack
     with its colour removed is work done to make the art worse.

     THE COALITION IS BLUE. Not cyan: FAC.coal's old wireframe teal sat a few
     degrees from the Hound's own turquoise, so a Coalition tank and a Jade tank
     would have been the same vehicle in two shades of the same hue at field
     size. Blue against green against the brood's amber is three hues that
     survive being twenty pixels tall.

     lift IS SMALL BUT NOT ZERO. Pure luminance recolour of an already dark pack
     lands the whole figure in the bottom third and the internal shading stops
     separating. A little lift keeps the highlights doing their job. */
  /* THE UNIFORM TINT IS A COLUMN ON THE FACTION ROW NOW, for the same reason
     the hull grade is: a faction is one row, and a faction spread across four
     tables is four chances to add three of them.

     A faction is untinted when, and only when, its row has no tint. That is how
     Jade pays nothing: the art ships GREEN - the troop pack is dark olive (mean
     48,55,46) and the Hound dark teal (43,73,73) - and Jade Circuit, whose war
     this is and whose line is the only one on the ground until the Coalition
     declares, wears it as drawn.

     lift IS SMALL BUT NOT ZERO on every tinted row. A pure luminance recolour of
     an already dark pack lands the whole figure in the bottom third and the
     internal shading stops separating a limb from a torso. The Void Collective
     needs the most of it precisely because it is the darkest.

     `split` is a SECOND grade for pixels below a luminance break, and it exists
     for exactly one faction. A flat tint moves every pixel the same way, so it
     preserves the artist's shading perfectly - which is right for a uniform and
     useless for CAMOUFLAGE, whose whole trick is carrying tones that do not
     follow the wearer's own relief. Two grades across a value break give the
     Guild's kit a dry brown and a sand that are not the same coat lit twice. */
  function facTint(fac, kit) {
    var api = window.FM_FAC_API;
    if (api && api.tintFor) return api.tintFor(fac, kit === undefined ? -1 : kit);
    var r = ROW(fac); return (r && r.tint) || null;
  }
  function facKits(fac) {
    var api = window.FM_FAC_API;
    return (api && api.kitCount) ? api.kitCount(fac) : 0;
  }
  function facSplit(fac) { var r = ROW(fac); return (r && r.split) || null; }
  var BROOD_FALLBACK = { r: 0.98, g: 0.34, b: 0.11, lift: 0, keep: 0 };
    /* THE BROOD IS AMBER and the creature pack is not: it ships green, blue and
       violet themes and none of them is Khai'sultull. Rather than an art pass
       per creature, the same luminance recolour that gives the Coalition its
       blue gives the brood its orange, so the hive's colour is a hex value.

       THE COST IS REAL AND IS NOT A BUG. A luminance recolour keeps shading and
       throws away hue, so the hopclops loses its yellow eye and the crawling
       horror its pink carapace. The brood's wireframes were already monochrome
       amber, so the field stays coherent, but if a creature ever has to keep two
       hues this is the decision to revisit rather than the place to add a
       special case.

       Warm and slightly lifted: the pack's darks are very dark, and pure
       multiplication puts a whole crawler in the bottom fifth where its legs
       stop separating from its body at field size. */
    /* DARK, and the first pass was not. A warm lift put the creatures at roughly
       the same value as the tinted ground on a dust world, so a hundred of them
       read as scribble on sand rather than as bodies: at field size, value
       separation IS the silhouette and hue does almost nothing for it. Deep and
       saturated, below the plain rather than above it, so a crawler is a dark
       shape with the ground showing between its legs. */
    /* FLAT ORANGE WAS THE PRICE OF A PURE LUMINANCE RECOLOUR and it is not a
       price worth paying now the brood is most of what is on screen. Throwing
       away hue entirely meant a crawler, a hopclops and a grub were the same
       colour at three brightnesses, so a hundred of them read as one substance.

       Two changes. First, `keep` retains some of the ORIGINAL chroma: the pack's
       creatures are genuinely different colours from each other, and letting a
       little of that through gives the swarm variety no tint table could supply.
       Second, the tint is PER SHEET, so each creature sits at its own point on a
       warm range instead of all of them on one hex value. */
  /* The brood's fallback lives above as BROOD_FALLBACK, and the khai ROW carries
     the same numbers so a reader who looks the faction up in the registry gets
     the same answer as the code does. Used for spit rounds and for any creature
     sheet with no per-sheet grade of its own. */
  /* Per-creature grading. A warm family, spread across it rather than stacked on
     one value, so the brood reads as related species and not as one repainted
     model. keep is how much of the pack's own colour survives; the crawler keeps
     most because its carapace has real variation in it, the grub almost none
     because it is a sack.

     THE RANGE IS DELIBERATELY NARROW. These have to read as ONE faction against
     Jade's green and the Coalition's blue at twenty pixels, so the spread is
     within amber - deep red through orange to a sour yellow - and never leaves
     it. Variety inside a hue, not a second palette. */
  var BROOD_GRADE = {
    horror_s: { r: 1.02, g: 0.36, b: 0.13, lift: 0.02, keep: 0.30 },
    horror_l: { r: 0.94, g: 0.30, b: 0.10, lift: 0.00, keep: 0.30 },
    hop_s:    { r: 1.00, g: 0.48, b: 0.12, lift: 0.05, keep: 0.26 },
    hop_l:    { r: 0.96, g: 0.42, b: 0.10, lift: 0.03, keep: 0.26 },
    fly_s:    { r: 0.90, g: 0.26, b: 0.16, lift: 0.04, keep: 0.34 },
    fly_l:    { r: 0.86, g: 0.22, b: 0.14, lift: 0.02, keep: 0.34 },
    grub_s:   { r: 0.86, g: 0.44, b: 0.20, lift: 0.00, keep: 0.14 },
    grub_l:   { r: 0.82, g: 0.40, b: 0.18, lift: 0.00, keep: 0.14 },
    egg_l:    { r: 1.04, g: 0.52, b: 0.14, lift: 0.08, keep: 0.22 },
    egg_s:    { r: 1.04, g: 0.52, b: 0.14, lift: 0.08, keep: 0.22 },
    // The rounds and the mess stay saturated: both are meant to be read fast.
    proj_s:   { r: 1.10, g: 0.52, b: 0.10, lift: 0.14, keep: 0.10 },
    proj_l:   { r: 1.10, g: 0.52, b: 0.10, lift: 0.14, keep: 0.10 },
    splat:    { r: 0.80, g: 0.20, b: 0.10, lift: 0.00, keep: 0.18 },
    splat_b:  { r: 0.80, g: 0.20, b: 0.10, lift: 0.00, keep: 0.18 },
    splat_c:  { r: 0.80, g: 0.20, b: 0.10, lift: 0.00, keep: 0.18 },
    splat_d:  { r: 0.78, g: 0.18, b: 0.09, lift: 0.00, keep: 0.18 },
    splat_e:  { r: 0.78, g: 0.18, b: 0.09, lift: 0.00, keep: 0.18 },
  };
  /* ── The Coalition is people, the Circuit is a nation ─────────────────────
     THE PACK IS A 12-COLOUR INDEXED PALETTE, which is what makes any of this
     precise rather than a guess. Skin, the shield trooper's faceplate and the
     engineer's lens are EXACT RGB values that appear nowhere else, so they can
     be remapped by equality instead of by a hue-and-saturation test that would
     catch a patch of webbing on the wrong frame.

     Measured across every troop sheet:

       (238,188,154) + (217,160,102)   skin. Assault and engineer only.
       (194,134,42)  + (143,96,26)     the shield trooper's faceplate. His face
                                       is fully covered - there is no skin on
                                       any enforcer frame - so this IS his face.
       (100,138,194) + (61,96,147)     the engineer's lens.

     THE COALITION IS MULTIRACIAL AND THE CIRCUIT IS NOT, and that is setting
     rather than decoration: the Coalition is a treaty of colonies and the Jade
     Circuit is one nation. So Coalition infantry draw a skin tone per soldier
     from the range below, and Circuit infantry all wear the tone the art ships
     with. "Everyone looks the same" is a STATEMENT about the Circuit, not an
     omission, and it is the reason the jade branch does nothing here rather
     than a reason to give it a range too.

     A soldier's tone is fixed for his life. It comes off his index, so it does
     not change when he takes cover, dies, or is reinforced back onto the field. */
  /* ── Skin, optics and accents now come from the registry ─────────────────
     THESE WERE FOUR TABLES AND FOUR `fac === 'coal'` TESTS. The tables are in
     client/assets/factions.js now, and the tests became fields on a row, because
     each of them was really asking a question a faction should answer about
     itself: does this faction have a range of skin tones, does it burn its
     optics, does it mark its equipment, what colour is its kit.

     Kept as locals resolved from the registry rather than referenced through
     window on every pixel: the inner loop runs a few million times per sheet. */
  function REG()  { return window.FM_FACTIONS  || {}; }
  function ROW(f) { return REG()[f] || null; }
  var SKIN_SRC = [[238,188,154], [217,160,102]];        // highlight, shadow

  /* AUGMENTATION IS ONE ANSWER TO A GENERAL QUESTION. The Coalition's soldiers
     have something behind the glass and the Circuit's have eyes: that was
     written as `AUG_RED`, a fixed table of two source colours mapping to two red
     ones, gated on `fac === 'coal'`. It is right about the Coalition and it
     cannot say anything about anyone else.

     Two channels now, because they are two different sentences (see the
     measurement note in factions.js). OPTIC is what is behind the glass.
     ACCENT is equipment marking - the engineer's wrist device and the shield
     panel, neither of which anything has ever touched.

     `opticOn: 'augmented'` is what preserves the shipped Coalition exactly. The
     assault trooper has a FACE, so his goggles are not a place to make a claim
     about whether he is a person, and the Coalition leaves them alone. A faction
     of machines has no such distinction and takes 'all'.

     Built once per faction and cached: this is a dozen string keys, and building
     it inside the pixel loop would be a hash lookup per channel per pixel. */
  var _remap = {};
  function remapFor(fac, name) {
    var key = fac + '|' + (augmented(name) ? 'a' : 'p');
    var m = _remap[key];
    if (m) return m;
    var row = ROW(fac);
    m = {};
    if (row) {
      var oSrc = window.FM_OPTIC_SRC || [], aSrc = window.FM_ACCENT_SRC || [];
      var wantOptic = row.optic && (row.opticOn === 'all'
                     || (row.opticOn === 'augmented' && augmented(name)));
      if (wantOptic) for (var i = 0; i < oSrc.length; i++) {
        m[oSrc[i].lit.join(',')] = row.optic.lit;
        m[oSrc[i].dim.join(',')] = row.optic.dim;
      }
      if (row.accent) for (var k = 0; k < aSrc.length; k++) {
        m[aSrc[k].lit.join(',')] = row.accent.lit;
        m[aSrc[k].dim.join(',')] = row.accent.dim;
      }
    }
    _remap[key] = m;
    return m;
  }
  /* Whether a faction has anything at all to remap, so the pixel loop can skip
     the per-pixel key build entirely for Jade and the Syndicate. */
  function hasRemap(fac, name) {
    for (var _ in remapFor(fac, name)) return true;
    return false;
  }
  /* THE EYE TAKES THE FACTION'S OWN OPTIC, NOT A CONSTANT. This was EYE_RED, a
     hardcoded [255,78,60], which was right for exactly as long as the only
     faction that painted an eye burned red. The moment the Coalition's visor
     went green, its engineer would have had a RED eye under a GREEN faceplate -
     one figure, two answers to the same question.
     Falls back to the old constant when a faction paints an eye without
     declaring an optic, which cannot happen today (the caller gates on
     ROW(fac).optic) and would otherwise be a black pixel if it ever did. */
  var EYE_RED = [255, 78, 60];
  function eyeColour(fac) {
    var r = ROW(fac);
    return (r && r.optic && r.optic.lit) || EYE_RED;
  }

  /* THE ENGINEER'S BLUE PIXELS ARE NOT AN EYE, and assuming they were is what
     the first pass shipped. Measured against engineer_idle: the figure spans
     rows 16 to 47, his face is at rows 21-23, and the blue sits at rows 30-32 -
     mid-torso. It is a chest device. Recolouring it produced a man with a red
     light on his sternum, which is a different sentence.

     He has no dedicated eye colour to remap either: his whole face is seven
     pixels of the two skin values, in a twelve-colour palette that never spent
     one on an iris. So the eye is PAINTED, per cell, at the top of his own face:
     find the skin, take its bounding box, and burn the forward-most pixel on the
     upper row. That lands on the face wherever the face is, in every frame of
     every animation, without a per-animation offset table to keep in step.

     Deliberately ONE pixel and deliberately only the engineer. The shield
     trooper is fully helmeted - no skin on any frame - so his faceplate remap IS
     his red eyes, and painting a second thing on him would say something the
     brief did not. The chest device is left alone so the one red thing on him is
     the eye. */
  function augmented(name) {
    return name.indexOf('enforcer') === 0 || name.indexOf('engineer') === 0;
  }
  function paintsEye(name) { return name.indexOf('engineer') === 0; }

  /* One cell's eye. Operates on the ImageData the tint already has open, so it
     costs a second pass over a handful of cells and no extra decode. */
  function burnEye(px, W, cw, ch, cols, pad, frames, tone, eye) {
    for (var f = 0; f < frames; f++) {
      var col = cols ? (f % cols) : f;
      var row = cols ? Math.floor(f / cols) : 0;
      var ox = pad + col * cw, oy = row * ch;
      var minY = 1e9, best = -1, bestX = -1;
      // Pass one: the top of the face.
      for (var y = 0; y < ch; y++) {
        for (var x = 0; x < cw; x++) {
          var i = ((oy + y) * W + (ox + x)) * 4;
          if (!px[i + 3]) continue;
          if (px[i] === tone[0][0] && px[i+1] === tone[0][1] && px[i+2] === tone[0][2] ||
              px[i] === tone[1][0] && px[i+1] === tone[1][1] && px[i+2] === tone[1][2]) {
            if (y < minY) minY = y;
          }
        }
      }
      if (minY > ch) continue;                       // no face in this cell
      /* Pass two: the forward-most skin pixel on the eye line, which is one row
         below the top of the head rather than the top itself - the top row is
         brow and hairline, and a red pixel there reads as a hat. */
      var eyeY = Math.min(ch - 1, minY + 1);
      for (var x2 = 0; x2 < cw; x2++) {
        var j = ((oy + eyeY) * W + (ox + x2)) * 4;
        if (!px[j + 3]) continue;
        if (px[j] === tone[0][0] && px[j+1] === tone[0][1] && px[j+2] === tone[0][2] ||
            px[j] === tone[1][0] && px[j+1] === tone[1][1] && px[j+2] === tone[1][2]) {
          best = j; bestX = x2;                      // keep going: want the last
        }
      }
      if (best >= 0) { px[best] = eye[0]; px[best+1] = eye[1]; px[best+2] = eye[2]; }
    }
  }
  // Skin only exists on these, so an enforcer needs no skin variant and must not
  // get one: a cache key per tone on a sheet with no skin is five identical
  // canvases of a man in a helmet.
  function hasSkin(name) {
    return name.indexOf('assault') === 0 || name.indexOf('engineer') === 0;
  }
  /* WHICH TONE THIS SOLDIER WEARS, off the registry policy rather than off a
     `fac === 'coal'` test. Returns null for a faction whose policy is 'none',
     which is how Jade keeps the tone the art ships with - one nation, one look,
     a statement about the Circuit rather than an omission. */
  function skinIndex(fac, skin) {
    var api = window.FM_FAC_API;
    if (!api || !hasSkinPolicy(fac)) return null;
    return api.skinFor(fac, skin);
  }
  function hasSkinPolicy(fac) {
    var api = window.FM_FAC_API;
    return !!(api && api.skinTones(fac).length);
  }
  function toneOf(idx) {
    var api = window.FM_FAC_API;
    return (idx === null || idx === undefined || !api) ? null : api.toneAt(idx);
  }

  /* ── The Hound wears its faction ──────────────────────────────────────────
     THE TANK MATCHED NEITHER ARMY. Coalition got the flat faction tint, which
     is a full luminance recolour, so its tracks and road wheels turned blue
     along with its hull - a tank painted like a toy. And Jade got the art
     untouched, which is TURQUOISE, while Jade infantry are olive green: the
     armour and the men it was supporting were different colours.

     The hull is separable the same way skin was, and for the same reason - the
     sheet is a 16-colour palette. The hull is a teal family (green and blue
     both well above red, saturated); the running gear is neutral grey at
     effectively zero saturation; the black is outline. So: recolour anything
     saturated, leave anything neutral alone. Tracks stay tracks.

     ACCENTS SURVIVE TOO, and that is deliberate rather than an oversight of the
     rule. The hull is teal, so the orange marker light and the blue lamp are the
     only pixels on the vehicle whose hue is not the hull's - they are the parts
     that read as EQUIPMENT rather than as paint, and repainting them with the
     hull is how a vehicle stops having any. They are matched out by hue. */
  /* THE HULL GRADE IS A COLUMN ON THE FACTION ROW NOW. It was a table of two,
     and every faction added would have needed remembering here as well as in
     FAC_TINT - which is two places to forget, and the tank is exactly the unit
     where forgetting shows, because a wrongly painted Hound is fifty pixels
     wide. A faction whose row has no hull leaves the sheet as drawn. */
  function hullGrade(fac) { var r = ROW(fac); return (r && r.hull) || null; }
  function hulled(name) { return name.indexOf('hound') === 0; }
  /* A hull pixel: saturated, and not one of the two accent hues. Red-dominant
     catches the orange marker; blue-dominant with red very low catches the lamp.
     Everything else saturated on this sheet is paint. */
  function isHull(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 24) return false;                       // outline black
    if ((mx - mn) / mx < 0.22) return false;         // tracks, wheels, grey
    if (r > g && r > b) return false;                // orange marker
    if (b > g + 40 && r < g) return false;           // blue lamp
    return true;
  }

  var _tint = {};
  /* `kit` is the soldier's own kit index for a faction that issues none, and -1
     for every faction that does. It is part of the CACHE KEY, so a Syndicate
     line costs five tinted copies of a sheet rather than one - which is the
     price of the faction not having a uniform and is why no other row pays it. */
  function tinted(name, fac, skin, kit) {
    var im = _img[imgKey(name)];
    if (!im) return null;
    /* Cached per FACTION and per IMAGE, not per animation. Keying the tint on
       the animation would tint one creature's sheet four times over and hold
       four copies of it, for four identical results. */
    name = imgKey(name);
    /* NO FACTION IS HARDCODED AS THE IDENTITY ANY MORE. This read
       `fac === 'coal' || !FAC_TINT[fac]`, so adding a coal tint would have been
       silently ignored: the short-circuit fired before the table was consulted.
       A faction is untinted when, and only when, it has no entry in the table. */
    /* A SHEET CAN NEED WORK WITHOUT ITS FACTION HAVING A TINT. Jade has no
       FAC_TINT entry by design - it wears the art as drawn - and this returned
       the raw image before anything else could look at it, which is why the
       Jade Hound stayed turquoise while Jade infantry were olive. The gate is
       "does this faction need anything doing to this sheet", not "does it have
       a tint". */
    /* "DOES THIS FACTION NEED ANYTHING DOING TO THIS SHEET", not "does it have
       a tint". Jade has no tint by design and its Hound still needs regrading,
       which is the bug this phrasing already fixed once. It now has a third and
       fourth way to be true: a faction can have no tint and still remap its
       optics or its accents. The Syndicate is the one row where all four are
       false on a troop sheet, and it correctly returns the art untouched. */
    if (!fac) return im;
    if (!facTint(fac, kit) && !(hulled(name) && hullGrade(fac))
        && !hasSkinPolicy(fac) && !hasRemap(fac, name)) return im;
    /* SKIN IS IN THE KEY, BUT ONLY WHERE IT CAN CHANGE ANYTHING. Keying every
       sheet on it would hold six identical copies of the enforcer, who has no
       skin on any frame. Same reasoning as the faction key: a cache key has to
       name everything that varies and nothing that does not. */
    var sk = hasSkin(name) ? skinIndex(fac, skin) : null;
    /* null and -1 are DIFFERENT and both are real: null is "this faction does
       not remap skin", -1 is "steel casing". Stringified into the key so they
       cannot collide, which they would if null were coerced to 0. */
    /* The kit index joins the key only where the faction HAS kits, so nothing
       else grows a cache entry or an extra separator it does not need. */
    var kt = facKits(fac) ? (kit === undefined ? -1 : kit) : -1;
    var key = fac + '|' + (sk === null ? 'n' : sk) + '|' + kt + '|' + name;
    var c = _tint[key];
    if (c) return c;
    /* The creature's own grade if it has one, the faction's flat tint otherwise.
       Keyed on the SHEET, which is what a grade is a property of. */
    /* A hull-only sheet reaches here with no faction tint (Jade), so t may be
       undefined; the loop below is guarded on `hull` before it reads t. */
    var t = (fac === 'khai' && (BROOD_GRADE[name] || BROOD_FALLBACK))
            || facTint(fac, kt) || { r:1, g:1, b:1, lift:0 };
    var sp = facSplit(fac);
    try {
      c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      var tx = c.getContext('2d');
      tx.imageSmoothingEnabled = false;
      tx.drawImage(im, 0, 0);
      var d = tx.getImageData(0, 0, c.width, c.height), px = d.data;
      var tone = toneOf(sk);
      var rmap = remapFor(fac, name);
      var doRemap = hasRemap(fac, name);
      var hull = hulled(name) ? hullGrade(fac) : null;
      for (var i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;                   // transparent stays transparent

        /* SKIN AND OPTICS ARE REMAPPED BEFORE THE TINT AND SKIP IT ENTIRELY.
           The faction tint is a luminance recolour, so running it over a face
           would paint the man blue along with his coat - which is the whole
           reason this could not just be another entry in FAC_TINT. Matched by
           equality against the pack's own palette; anything not in it falls
           through to the uniform path untouched. */
        if (tone) {
          if (px[i] === 238 && px[i+1] === 188 && px[i+2] === 154) {
            px[i] = tone[0][0]; px[i+1] = tone[0][1]; px[i+2] = tone[0][2]; continue;
          }
          if (px[i] === 217 && px[i+1] === 160 && px[i+2] === 102) {
            px[i] = tone[1][0]; px[i+1] = tone[1][1]; px[i+2] = tone[1][2]; continue;
          }
        }
        if (doRemap) {
          var arep = rmap[px[i] + ',' + px[i+1] + ',' + px[i+2]];
          if (arep) { px[i] = arep[0]; px[i+1] = arep[1]; px[i+2] = arep[2]; continue; }
        }

        /* The hull path runs INSTEAD of the faction tint, not before it: the
           faction tint would then repaint the tracks it just spared. */
        if (hull) {
          if (isHull(px[i], px[i + 1], px[i + 2])) {
            var hl = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
            px[i]     = Math.min(255, hl * hull.r) | 0;
            px[i + 1] = Math.min(255, hl * hull.g) | 0;
            px[i + 2] = Math.min(255, hl * hull.b) | 0;
          }
          continue;                                  // grey, black and accents untouched
        }

        var l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        /* CAMO IS DECIDED ON THE RAW LUMINANCE, before the lift. Lifting first
           would drag pixels across the break and the pattern would shift with
           the grade rather than sitting on the art's own value structure. */
        var tt = (sp && l < sp.at) ? sp : t;
        if (tt.lift) l = l + (255 - l) * tt.lift;
        var r = l * tt.r, g2 = l * tt.g, b2 = l * tt.b;
        /* KEEP SOME OF THE ORIGINAL COLOUR. A pure luminance recolour is why
           everything came out one flat hue; blending a fraction of the source
           pixel back in returns the variation the artist put there - a yellow
           eye stays yellower than the carapace around it - while the tint still
           decides what family the creature belongs to. */
        if (tt.keep) {
          r  = r  + (px[i]     - r ) * tt.keep;
          g2 = g2 + (px[i + 1] - g2) * tt.keep;
          b2 = b2 + (px[i + 2] - b2) * tt.keep;
        }
        px[i]     = Math.min(255, r)  | 0;
        px[i + 1] = Math.min(255, g2) | 0;
        px[i + 2] = Math.min(255, b2) | 0;
        // alpha untouched: the figure's own edge is the figure's own edge
      }
      /* AFTER the recolour, because it looks for skin at the tone this variant
         actually wears - and before putImageData, so it rides the same upload. */
      /* THE EYE IS PAINTED ONLY WHERE THERE IS A FACE TO PAINT IT ON. It was
         gated on `fac === 'coal'`; the question it was really asking is whether
         this faction burns its optics AND has skin for the router to find. The
         Void Collective has neither a face nor a range - its casing is remapped
         to steel and its optics are handled by the accent channel - so it takes
         no eye, and the Syndicate takes none because it burns nothing. */
      if (tone && sk !== null && sk >= 0 && ROW(fac) && ROW(fac).optic && paintsEye(name)) {
        /* NOT g2. The pixel loop above uses g2 for the green channel, and `var`
           hoists to the function - so a second `var g2` here is the same
           variable, silently. It happens to be harmless in this order and it is
           exactly the kind of thing that stops being harmless when someone moves
           a block. */
        var eg = geom(name);
        burnEye(px, c.width, eg.cw, eg.ch, eg.cols, eg.pad, FRAMES[name] || 1, tone, eyeColour(fac));
      }
      tx.putImageData(d, 0, 0);
    } catch (e) { return im; }   // a tint that throws must not lose the figure
    _tint[key] = c;
    return c;
  }

  /* Where frame f lives on the sheet. cols of 0 means one row, which is every
     troop sheet; anything else wraps. */
  function frameAt(name, frame) {
    var g = geom(name);
    var n = FRAMES[name] || 1;
    var f = ((frame % n) + n) % n;
    /* A ROW-PINNED ANIMATION NEVER WRAPS DOWNWARD. On a shared sheet the row
       below is a different animation, so a frame index past the end must fold
       back along its own row and not walk into the next creature's attack. */
    if (g.row !== undefined) return { sx: f * g.cw, sy: g.row * g.ch, g: g };
    var cols = g.cols || n;
    return { sx: g.pad + (f % cols) * g.cw, sy: Math.floor(f / cols) * g.ch, g: g };
  }

  /* Bottom-centred on (x, y). The original contract, kept because the muster
     strip draws with it and a strip of figures wants them stood on a line. */
  function drawFrame(ctx, name, frame, x, y, scale, fac, skin, kit) {
    var im = tinted(name, fac, skin, kit);
    if (!im) return false;
    var r = frameAt(name, frame), g = r.g;
    ctx.drawImage(im, r.sx, r.sy, g.cw, g.ch,
      Math.round(x - g.cw * scale / 2), Math.round(y - g.ch * scale),
      g.cw * scale, g.ch * scale);
    return true;
  }

  /* Anchored on (x, y), where the anchor is the sheet's own ground contact
     point, with the mirror handled here rather than by the caller.
     THE FLIP HAS TO MIRROR ABOUT THE ANCHOR, not about the cell centre. The
     battlefield used to translate by the cell width and flip the context, which
     is correct only when the figure is centred in its cell. The Hound is not:
     its tracks sit right of centre walking and further right still firing, so
     mirroring about the cell would slide the tank sideways every time it turned
     around, and it would slide by a DIFFERENT amount in each animation. */
  function drawAnchored(ctx, name, frame, x, y, scale, fac, flip, skin, kit) {
    var im = tinted(name, fac, skin, kit);
    if (!im) return false;
    var r = frameAt(name, frame), g = r.g;
    var dw = g.cw * scale, dh = g.ch * scale;
    ctx.save();
    if (flip) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.translate(-x, -y); }
    ctx.drawImage(im, r.sx, r.sy, g.cw, g.ch,
      Math.round(x - g.ax * scale), Math.round(y - g.ay * scale), dw, dh);
    ctx.restore();
    return true;
  }

  // WHO TURNS UP, MIRRORING THE BATTLEFIELD'S ACTUAL SHARES rather than a
  // parallel invention. reach-battle.js holds knifeShare at a constant 0.16:
  // blade troopers are not bought with credits, they are part of any Coalition
  // line. What funding buys there is armShare and heliShare, so what it buys
  // here has to be hardware too.
  //
  // The first version scaled the shield line with the ratio and gated an
  // engineer at 85%, which looked fine and told a different story than the
  // field: it implied money buys melee. It does not. Turrets stand in for the
  // armour and air the strip has no sprites for, the engineer turns up because
  // somebody has to place them, and the shield line stays constant because
  // that is what the model says.
  var SHIELD_SHARE = 0.18;   // matches ENF_SHARE in reach-battle.js
  function roster(ratio, slots) {
    var r = Math.max(0, Math.min(1, ratio || 0));
    var turrets = r >= 0.80 ? 2 : r >= 0.40 ? 1 : 0;
    var eng = turrets ? 1 : 0;
    var body = Math.max(2, slots - turrets - eng);
    var shield = Math.max(1, Math.round(body * SHIELD_SHARE));
    var rifle = Math.max(1, body - shield);
    var out = [];
    for (var i = 0; i < rifle; i++) out.push('assault');
    for (var j = 0; j < shield; j++) out.push('enforcer');
    if (eng) out.push('engineer');
    for (var k = 0; k < turrets; k++) out.push('turret');
    return out;
  }

  var ANIM = {
    assault:  { idle: 'assault_idle',            walk: 'assault_walk',            fire: 'assault_auto_shooting' },
    enforcer: { idle: 'enforcer_shielded_idle',  walk: 'enforcer_shielded_walk',  fire: 'enforcer_shielded_shot' },
    engineer: { idle: 'engineer_idle',           walk: 'engineer_walk',           fire: 'engineer_auto_shooting' },
    turret:   { idle: 'turret_idle',             walk: 'turret_idle',             fire: 'turret_auto_shooting' },
  };

  // Is this sheet decoded and drawable RIGHT NOW? A caller that claims a unit
  // for the sprite layer has to know this before it claims it: drawFrame
  // returning false after the fact means the unit is drawn as neither a sprite
  // nor a wireframe and simply vanishes from the field.
  /* Through the image key, or every brood animation reports not-ready forever:
     the sheet is decoded under 'horror_s' and nothing is ever stored under
     'horror_s_move'. queueSprite asks ready() before claiming a unit off the
     wireframe path, so this returning false is not a missing sprite, it is a
     unit that draws as neither and vanishes. */
  function ready(name) { return !!_img[imgKey(name)]; }

  /* The brood geometry arrives as data rather than as a literal, because the
     frame counts come from the pack's own index and hand-copying thirty of them
     is thirty chances to make the Hound's blank-cel bug again. Fetched once;
     until it lands the brood draws as the wireframes it always did. */
  var _broodReq = 0;
  function loadBrood(cb) {
    if (_broodReq) return;
    _broodReq = 1;
    var src = window.FM_BROOD_GEOM;
    if (src && typeof src === 'object') { registerBrood(src); if (cb) cb(); return; }
    fetch(BROOD + 'geometry.json' + (BUILD ? ('?v=' + BUILD) : ''))
      .then(function (r) { return r.json(); })
      .then(function (g) { registerBrood(g); if (cb) cb(); })
      .catch(function () { _broodReq = 2; });
  }

  // Kick off loading. Safe to call repeatedly; sheet() de-duplicates.
  function preload(cb) {
    var want = ['assault_idle','assault_walk','assault_auto_shooting',
                'enforcer_shielded_idle','enforcer_shielded_walk','enforcer_shielded_shot',
                'engineer_idle','engineer_walk','engineer_auto_shooting',
                'turret_idle','turret_deploy'];
    for (var i = 0; i < want.length; i++) sheet(want[i], cb);
  }

  // Mount a live strip into a canvas. Returns a handle with set(ratio) so the
  // caller can retune it without tearing the animation down; rebuilding on
  // every funding tick would restart every walk cycle in the line.
  function mount(canvas, opts) {
    if (!canvas || !canvas.getContext) return null;
    var o = opts || {};
    var ctx = canvas.getContext('2d');
    var st = { ratio: o.ratio || 0, raf: 0, t: 0, dead: false };
    var scale = o.scale || 1;

    function layout() {
      var slots = Math.max(3, Math.min(o.slots || 9,
        Math.floor(canvas.width / (34 * scale))));
      var names = roster(st.ratio, slots);
      st.line = names.map(function (n, i) {
        return { cls: n, x: (i + 0.5) * (canvas.width / names.length),
                 ph: (i * 7919) % 360, walk: (n !== 'turret' && i % 3 === 0) };
      });

    }
    layout();

    function frame(now) {
      if (st.dead) return;
      st.raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      var base = canvas.height - 2 * scale;
      // Ground line, so the figures stand on something rather than float.
      ctx.strokeStyle = 'rgba(150,124,86,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, base + 0.5); ctx.lineTo(canvas.width, base + 0.5); ctx.stroke();
      for (var i = 0; i < st.line.length; i++) {
        var u = st.line[i];
        var a = ANIM[u.cls];
        var key = u.walk ? a.walk : a.idle;
        var fps = u.walk ? 9 : 5;
        var f = Math.floor((now * 0.001 * fps) + u.ph);
        /* THE STRIP IS THE SAME LINE THE BATTLEFIELD DRAWS, so it wears the
           same faces. Left at the default it mustered six identical pale
           soldiers next to a field of mixed ones, which reads as the preview
           being of a different army than the one the credits buy. Tone off the
           figure's own index, same rule as the battlefield: fixed per figure,
           and prime-stepped so a rank does not walk the list in order. */
        drawFrame(ctx, key, f, u.x, base, scale, u.fac || 'coal', i,
                  (window.FM_FAC_API && window.FM_FAC_API.kitFor)
                    ? window.FM_FAC_API.kitFor(u.fac || 'coal', i) : -1);
      }
    }
    preload(function () { /* redraw happens on the next raf anyway */ });
    st.raf = requestAnimationFrame(frame);

    return {
      set: function (ratio) {
        var r = Math.max(0, Math.min(1, ratio || 0));
        if (Math.abs(r - st.ratio) < 0.02) return;   // ignore jitter
        st.ratio = r; layout();
      },
      stop: function () { st.dead = true; if (st.raf) cancelAnimationFrame(st.raf); },
    };
  }

  window.FMTroops = {
    FRAMES: FRAMES, CELL_W: CELL_W, CELL_H: CELL_H, PAD: PAD,
    geom: geom, frameAt: frameAt, drawAnchored: drawAnchored,
    hasSkin: hasSkin, augmented: augmented, paintsEye: paintsEye,
    hulled: hulled, isHull: isHull, hullGrade: hullGrade,
    skinIndex: skinIndex, hasSkinPolicy: hasSkinPolicy, remapFor: remapFor,
    roster: roster, drawFrame: drawFrame, preload: preload, mount: mount,
    BUILD: BUILD,
    ready: ready, sheet: sheet, srcFor: srcFor, tinted: tinted, facTint: facTint,
    loadBrood: loadBrood, imgKey: imgKey,
    failed: function () { return _failed.slice(); },
    loaded: function () { return Object.keys(_img); },
  };
})();
