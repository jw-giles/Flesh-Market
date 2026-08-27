// ═══════════════════════════════════════════════════════════════════════════
// factions.js - what every faction LOOKS like, in one table.
//
// WHY THIS IS A FILE AND NOT THREE MORE ENTRIES IN TWO TABLES. The battlefield
// already said the right thing about this in a comment and then did not do it:
//
//   "SIDE IS NOT FACTION AND MUST NOT BECOME IT ... It also buys the faction
//    war for free later. side stops meaning Coalition and starts meaning
//    belligerent A and B."
//
// That was true of `side`. It was not true of everything else. `fac` was a two
// value tag in practice, and the recolour engine asked `fac === 'coal'` in four
// separate places to decide whether a soldier gets a skin tone, whether his
// optics burn, whether his eye is painted, and whether his tank keeps its
// tracks. Adding a fifth faction meant finding all four and adding a fifth
// branch to each, which is the shape of change that gets three of four done.
//
// So the question each of those branches was really asking becomes a FIELD.
// A faction is a row. Adding one is adding a row, and the four behaviours come
// out of the row rather than out of a chain of equality tests.
//
// WHAT THIS FILE OWNS AND WHAT IT DOES NOT. It owns PAINT: tint, skin policy,
// optics, accents, wireframe colours. It does NOT own who is fighting whom, or
// where, or how much of a line they are - that is server state and it lives in
// server/factions.js and the Reach payload. Same split the terrain layer already
// makes between what cover is SHAPED like (a design decision, hand authored) and
// what a world LOOKS like (a fact about the art, derived). The ids are the seam,
// and tools/faction-check.mjs asserts the two sides agree on them.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* ── The pack's accent palette, measured rather than assumed ──────────────
     THE ENGINEER'S BLUE PIXELS ARE ON HIS WRIST, NOT HIS CHEST, and the shipped
     comment in coalition-sprites.js says otherwise. It reasoned from the ROW
     number alone: "the figure spans rows 16 to 47, his face is at rows 21-23,
     and the blue sits at rows 30-32 - mid-torso."

     The rows are right and the conclusion does not follow, because it never
     looked at the COLUMN. On engineer_idle cell 0 the figure's torso at row 30
     spans x 9 to 20; the blue sits at x 30 to 32, at the extreme forward edge of
     the silhouette, on the arm he is holding out. It is a gauntlet device. The
     torso at that row has no blue on it at all.

     This is not pedantry about a comment. That reading is why `paintsEye`
     exists: the first pass recoloured this blue, got "a man with a red light on
     his sternum", concluded the pixels could not be an optic, and went off and
     built a per-cell face-finding routine to paint an eye instead. The eye
     routine works and stays. But the premise underneath it was wrong, and the
     wrist device is now available as exactly the secondary channel this pass
     needs, rather than being a thing the code believes is a sternum.

     Measured across the troop sheets, cell 0, by colour and position:

       (194,134,42)+(143,96,26)    enforcer FACEPLATE, rows 20-24, over the eyes.
                                   He is fully helmeted, so this is his face.
       (128,157,160)+(86,125,121)  assault GOGGLES, rows 20-21, directly above
                                   his skin at 22-23. Nothing has ever touched
                                   these.
       (100,138,194)+(61,96,147)   engineer WRIST device, rows 29-33 at the
                                   forward edge; also the unshielded enforcer's
                                   pauldron at rows 23-25.
       (51,81,111)+(70,98,103)     the SHIELD panel, rows 23-25, x 24-29 - only
                                   present on enforcer_shielded_* sheets, which
                                   is what identifies it.

     TWO CHANNELS, NOT ONE, because they are two different sentences. OPTIC is
     what is behind the glass, which is a statement about whether these soldiers
     are people. ACCENT is equipment marking, which is a statement about whose
     kit it is. A faction can want one, both or neither. */
  /* THE SHIELD PANEL IS AN OPTIC, NOT AN ACCENT, and putting it in the accent
     channel was the wrong reading of the same trooper. The shielded enforcer's
     faceplate and the panel on the shield he is holding up in front of it are
     the same piece of equipment doing the same job: the thing he sees through.
     Splitting them meant a Coalition trooper burned his faceplate red and kept
     a factory blue panel a hand's width in front of it, and a Guild trooper had
     a blue visor behind a differently-blue shield.

     ACCENT IS NOW EXACTLY WHAT IT SAYS: markings on kit. One source, the
     engineer's wrist device, which the unshielded enforcer also wears on the
     pauldron. */
  var OPTIC_SRC = [
    { lit: [194, 134,  42], dim: [143,  96,  26] },   // enforcer faceplate
    { lit: [128, 157, 160], dim: [ 86, 125, 121] },   // assault goggles
    { lit: [ 51,  81, 111], dim: [ 70,  98, 103] },   // shield panel
  ];
  var ACCENT_SRC = [
    { lit: [100, 138, 194], dim: [ 61,  96, 147] },   // engineer wrist, enforcer pauldron
  ];

  /* ── Skin ─────────────────────────────────────────────────────────────────
     `skin` is a POLICY, not a list, because the reason each faction has the
     range it has is the interesting part and a bare list loses it.

       range   every tone. A treaty of colonies looks like its colonies.
       dark    the lower half of the range only.
       steel   one tone, and it is not skin. A machine has a casing.
       merc    every tone AND the steel casing, in one pool. A company that
               hires anyone hires androids too, and a policy that lists them
               together is how "occasionally" gets expressed without a second
               mechanism: one draw, seven outcomes, one of which is not a
               person. Six humans to one machine is the ratio, and it comes out
               of the pool length rather than a probability nobody can see.
       none    the tone the art ships with. One nation, one look - a STATEMENT
               about that faction, not an omission.

     A soldier's tone is fixed for his life off his index, so he does not change
     appearance when he takes cover, dies, or is reinforced back on. */
  var SKIN_TONES = [
    [[238, 188, 154], [217, 160, 102]],   // as drawn
    [[221, 171, 131], [186, 135,  88]],
    [[190, 142,  99], [148, 102,  63]],
    [[152, 105,  72], [113,  72,  46]],
    [[112,  76,  53], [ 80,  50,  33]],
    [[ 84,  57,  41], [ 58,  37,  25]],
  ];
  /* Steel is a SEVENTH entry rather than a replacement of the first, so an
     index into SKIN_TONES still means what it always meant and no stored or
     cached tone shifts under an existing faction. */
  var STEEL_TONE = [[178, 184, 196], [130, 138, 152]];

  /* ── The table ────────────────────────────────────────────────────────────
     tint    luminance recolour of the uniform. null means the art as drawn, and
             that is how a faction pays nothing: Jade ships green and wears it.
     split   OPTIONAL second grade for pixels below `split.at` luminance. This is
             what makes desert CAMO camo rather than a faction painted sand: a
             flat tint moves every pixel the same way and keeps exactly the
             pattern the artist drew, which on this pack is olive shading and not
             a disruptive pattern. Two grades across a value break gives the kit
             two tones that do not track its shading.
     hull    the Hound's paint. Separate from `tint` because the tank sheet is a
             different palette and its tracks must survive: see isHull.
     skin    policy above.
     optic   what is behind the glass, or null to leave it as drawn.
     opticOn 'augmented' restricts the burn to the sheets that are actually
             helmeted - the enforcer and the engineer. The assault trooper has a
             FACE, and burning his goggles would say he does not. 'all' takes
             every optic on every sheet.
     accent  equipment marking, or null.
     line/heavy/air/blade  the WIREFRAME colours, which have to agree with the
             sprite or the same unit changes faction when it gets far enough away
             to drop past the size cutoff. Not decoration: the same uniform at a
             different level of detail. */
  var FACTIONS = {
    /* The war as it actually stands. Jade ships green and is the only line on
       the ground until the Coalition declares. */
    jade: {
      name: 'Jade Circuit', short: 'JADE', gid: 'jade',
      tint: null, split: null,
      hull: { r: 0.88, g: 1.04, b: 0.70 },
      skin: 'none', optic: null, opticOn: 'none', accent: null,
      line: [86, 180, 140], heavy: [124, 212, 170], air: [160, 232, 198], blade: [192, 240, 216],
    },
    /* ── The Coalition ────────────────────────────────────────────────────
       ONE BLUE, AND IT IS THE ONE IT ALWAYS HAD. The multi-kit pass gave the
       Coalition five dye lots on the reasoning that a treaty quartermaster
       issues one coat across nine colonies and gets nine batches of it. The
       reasoning holds and the picture did not: at field size five values of one
       hue read as a line that is unevenly lit rather than as a line with
       history, and the Coalition is the one faction whose whole identity is
       being ORGANISED. Variation is the Syndicate's trait, and giving it to two
       factions spent it.

       So the kits are gone and the tint is exactly the standard-issue value the
       Coalition wore before them. Kept as `tint` rather than a one-entry `kits`
       array, because a faction that issues a uniform and a faction that does not
       are different KINDS of thing, and collapsing them into "one has a list of
       length one" loses the statement. The Syndicate is now the only row with
       kits again, which is the distinction working.

       GREEN GLASS ON EVERY CLASS. opticOn is 'all' rather than 'augmented': the
       assault trooper gets the visor too. The old gate said his goggles must stay
       as drawn because he has a FACE and burning them would claim otherwise -
       which was the right argument while the optic was RED and meant
       augmentation, something lit behind the glass. It is green now and means
       optics: a sensor package, issued kit, no claim about the man wearing it.
       The argument retired with the colour it was about.

       It also matters at field size. The assault trooper is the most numerous
       unit on any line, so an optic he does not wear is an optic most of the
       army does not have, and the Coalition's two identifying pixels were
       landing on a minority of it.

       The engineer's painted eye follows the optic automatically - it used to be
       a hardcoded red constant, which would have given him a red eye under a
       green faceplate. */
    coal: {
      name: 'Coalition', short: 'COAL', gid: 'coalition',
      tint: { r: 0.62, g: 0.82, b: 1.30, lift: 0.10 },
      split: null,
      hull: { r: 0.60, g: 0.84, b: 1.34 },
      skin: 'range',
      optic: { lit: [86, 244, 118], dim: [30, 132, 62] }, opticOn: 'all',
      accent: null,
      line: [84, 148, 236], heavy: [124, 178, 248], air: [164, 206, 252], blade: [196, 222, 254],
    },
    /* BLACK ARMOUR AND STEEL SKIN. The tint is not zero: a pure black figure at
       twenty pixels is a hole in the ground, and the pack's darks are already
       very dark, so this is a cool near-black with enough lift left for the
       internal shading to keep separating a limb from a torso. The purple is
       both channels, because on a machine the glass and the kit are the same
       manufacture - there is no distinction between what is behind the visor
       and what is bolted to the wrist.

       THE FIRST NUMBERS WERE 0.44/0.46/0.55 WITH A LIFT OF 0.17 AND THEY WERE
       WRONG IN A WAY ONLY MEASUREMENT SHOWS. Driven against the pack's six real
       uniform colours, that grade produced a luminance spread of 23 where Jade's
       is 61 - the figure was dark, and it was also FLAT, because a heavy lift on
       a small multiplier compresses the range instead of moving it. A soldier
       whose shading spans 23 values has no readable limbs at twenty pixels; he
       is a silhouette that happens to be dark grey.

       Dark is a MULTIPLIER problem and flat is a LIFT problem, and lift was
       being asked to solve both. Bigger multiplier, almost no lift: spread back
       to 40 with the darkest uniform value at 25, so the armour still reads
       black against a sand world and the man inside it still has arms. */
    void: {
      name: 'Void Collective', short: 'VOID', gid: 'void',
      tint: { r: 0.66, g: 0.68, b: 0.84, lift: 0.04 }, split: null,
      hull: { r: 0.68, g: 0.70, b: 0.86 },
      skin: 'steel',
      optic: { lit: [186, 104, 246], dim: [112, 52, 158] }, opticOn: 'all',
      accent: { lit: [168, 92, 232], dim: [104, 48, 150] },
      line: [150, 118, 210], heavy: [178, 148, 232], air: [204, 182, 244], blade: [226, 212, 250],
    },
    /* ── The Syndicate ────────────────────────────────────────────────────
       MERCENARIES DO NOT HAVE A UNIFORM, AND THE FIRST PASS GAVE THEM ONE. It
       was a single brown tint, which made them a third army in a different
       colour: a quartermaster's faction with a quartermaster's look, standing
       next to two others that already say that better.

       A COMPANY, NOT AN ARMY. `kits` is drawn per soldier off his own index, so
       a Syndicate line is a mix of whatever its people turned up in. Five
       entries rather than three because three reads as a pattern at forty men
       and five does not; not more than five because past that the line stops
       reading as ONE faction and starts reading as several, which is the
       failure in the other direction and the harder one to see coming.

       The five are deliberately not a spread across the wheel. They are all
       LOW-CHROMA WORKING COLOURS - oxidised, sun-bleached, secondhand - because
       a mercenary in a bright coat is a mercenary who has been shot at less
       than the others. What separates them is HUE at similar value, so they read
       as different men in different surplus rather than as one man lit five
       ways, and no single one of them reads as a nation's colour.

       RED VISORS, AND THEY ARE THE ONLY THING THE COMPANY ISSUES. The first
       pass gave the Syndicate no optic at all, on the reasoning that a company
       hiring anyone has nothing to mark its kit with. That reasoning was fine
       and the picture it produced was not: five mixed low-chroma coats with the
       pack's own gold faceplate on top read as five unrelated men rather than as
       one faction, because NOTHING in the frame said they were together.

       The visor is the fix and it is also the better story. A mercenary company
       does not issue coats; it issues the thing that identifies you as being on
       the contract. So the optic is the one consistent item, and the absence of
       a kit uniform stays exactly as it was - which is now a contrast rather
       than just a gap.

       `opticOn: 'all'`, NOT 'augmented', and that is the load-bearing half. The
       Coalition already burns red, so a shade alone would not separate them: two
       reds at twenty pixels are two reds. What separates them is WHICH CLASSES
       WEAR IT. The Coalition burns only its helmeted classes - its assault
       trooper has a face and keeps his teal goggles - so a Syndicate line with
       red on every class differs on the most numerous unit on the field, which
       is where a distinction actually gets seen.

       The shade is crimson rather than the Coalition's orange-red, chosen on
       measurement rather than by eye: luminance 108 against a kit ceiling of 88,
       so it separates from every coat, and 34 away from the Coalition's own red
       in RGB, which is the most a red can differ from another red while still
       clearing the coats underneath it.

       ACCENT STAYS NULL. The wrist device is kit, and kit is the thing nobody
       issued.

       SKIN IS `merc`: the whole human range PLUS the steel casing in one pool,
       so roughly one in seven is an android. Not a second mechanism - one draw,
       seven outcomes, one of which is not a person. */
    synd: {
      name: 'Syndicate', short: 'SYND', gid: 'syndicate',
      tint: { r: 1.04, g: 0.78, b: 0.54, lift: 0.08 },   // fallback if kits is emptied
      kits: [
        { r: 1.06, g: 0.80, b: 0.54, lift: 0.09 },   // oxidised tan, the closest to the old single tint
        { r: 0.72, g: 0.78, b: 0.70, lift: 0.12 },   // field grey, washed out
        { r: 0.94, g: 0.66, b: 0.62, lift: 0.07 },   // brick, faded
        { r: 0.66, g: 0.80, b: 0.92, lift: 0.10 },   // dull slate blue, ex-navy
        { r: 0.86, g: 0.84, b: 0.56, lift: 0.11 },   // dirty khaki
      ],
      split: null,
      hull: { r: 1.00, g: 0.76, b: 0.52 },
      skin: 'merc',
      optic: { lit: [244, 46, 74], dim: [148, 20, 34] }, opticOn: 'all',
      accent: null,
      line: [176, 132, 84], heavy: [206, 162, 110], air: [228, 194, 150], blade: [240, 218, 188],
    },
    /* DESERT CAMO IS TWO GRADES ACROSS A VALUE BREAK. One grade makes a soldier
       painted sand, because a luminance recolour preserves exactly the shading
       the artist drew and the pack's shading is a fold in a coat, not a pattern.
       Splitting it puts the coat's darks into a dry brown and its lights into
       sand, so the kit carries two tones that do NOT follow its own relief -
       which is the whole visual trick camouflage is doing.
       Blue visor, and no accent: the Guild marks its people, not its equipment. */
    guild: {
      name: 'Merchant Guild', short: 'GUILD', gid: 'guild',
      tint:  { r: 1.18, g: 1.04, b: 0.70, lift: 0.16 },
      split: { at: 58, r: 0.82, g: 0.62, b: 0.40, lift: 0.04 },
      hull:  { r: 1.12, g: 1.00, b: 0.68 },
      skin: 'dark',
      optic: { lit: [92, 168, 246], dim: [40, 92, 162] }, opticOn: 'all',
      accent: null,
      line: [206, 180, 116], heavy: [226, 204, 148], air: [240, 224, 186], blade: [248, 238, 216],
    },
    /* The brood is not a polity and has no kit, so most of this row is null.
       Its colour comes from BROOD_GRADE per creature; the entry exists so that
       facOf() has somewhere to land and so nothing has to special-case it. */
    khai: {
      name: 'Khai\u2019sultull', short: 'KHAI', gid: null,
      tint: { r: 0.98, g: 0.34, b: 0.11, lift: 0, keep: 0 }, split: null,
      hull: null, skin: 'none', optic: null, opticOn: 'none', accent: null,
      line: [194, 85, 31], heavy: [226, 110, 40], air: [236, 146, 64], blade: [214, 112, 44],
    },
  };

  /* Which tones a policy actually offers. Returned as INDICES into SKIN_TONES
     so a soldier's stored tone stays a small integer and the cache key stays
     short, and so 'dark' is visibly a subset of the same range rather than a
     second palette that could drift away from it. */
  var SKIN_POLICY = {
    range: [0, 1, 2, 3, 4, 5],
    dark:  [2, 3, 4, 5],
    steel: [-1],          // -1 addresses STEEL_TONE
    merc:  [0, 1, 2, 3, 4, 5, -1],   // and one of them is not a person
    none:  [],            // the art as drawn: no remap at all
  };
  function skinTones(fac) {
    var f = FACTIONS[fac];
    return SKIN_POLICY[(f && f.skin) || 'none'] || [];
  }
  /* ── Spreading an index over a pool ──────────────────────────────────────
     A STRIDE IS NOT A SPREAD, AND THIS WAS A STRIDE. skinFor used
     `(i * 7 + 3) % len`, which is fine while no pool is 7 long and DEGENERATE
     the moment one is: 7 mod 7 is 0, so every soldier gets index 3 and the
     whole line wears one face. It survived because the pools were 6 and 4 and
     nothing had a common factor with 7. The merc pool is 7, and it collapsed on
     the first run - two hundred men, one tone.

     The failure is silent and it is not obvious from reading the line, because
     the arithmetic looks like it varies. What makes it safe is not a bigger
     prime, which only moves the collision to a different pool length; it is not
     multiplying at all. A hash has no relationship to the modulus, so a pool of
     any length spreads, including lengths nobody has written yet.

     Two rounds of xorshift and a Knuth multiply. Deterministic, cheap, and fixed
     for a given index, which is the only property a soldier's appearance needs:
     he must not change when he takes cover, dies, or is reinforced back on. */
  function spread(i, salt, n) {
    if (n <= 0) return 0;
    var h = ((i | 0) + (salt | 0) * 0x9E3779B1) | 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) | 0;
    h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) | 0;
    h ^= h >>> 16;
    return ((h % n) + n) % n;
  }

  /* A soldier's tone, fixed for his life. */
  function skinFor(fac, i) {
    var pool = skinTones(fac);
    if (!pool.length) return null;
    return pool[spread(i, 1, pool.length)];
  }

  /* ── Which kit this particular soldier is wearing ────────────────────────
     ONE TINT PER FACTION IS A STATEMENT ABOUT ARMIES, AND THE SYNDICATE IS NOT
     ONE. Every other row here is a polity that issues uniforms: the tint is the
     point, and two soldiers looking identical is the correct reading of a
     quartermaster. A mercenary company issues contracts. Men turn up in what
     they already own, so a Syndicate line that matched itself would be saying
     the opposite of what the faction is.

     A row with a `kits` array draws from it per soldier, the same way skin is
     drawn and off the same index, so a man's kit is fixed for his life and does
     not change when he takes cover or is reinforced back on.

     A DIFFERENT SALT FROM skinFor, and that is not decoration: sharing one would
     lock tone to kit, so every soldier in a given coat would have the same face
     and the line would read as five squads rather than as forty individuals. */
  function kitCount(fac) {
    var f = FACTIONS[fac];
    return (f && f.kits && f.kits.length) ? f.kits.length : 0;
  }
  function kitFor(fac, i) {
    var n = kitCount(fac);
    if (!n) return -1;                        // -1: wear the row's own tint
    return spread(i, 2, n);
  }
  /* The grade in force for one soldier: his kit if his faction issues none, the
     row's tint otherwise. One function so the sprite layer never has to know
     which kind of faction it is looking at. */
  function tintFor(fac, kit) {
    var f = FACTIONS[fac];
    if (!f) return null;
    if (f.kits && f.kits.length && kit >= 0) return f.kits[kit % f.kits.length];
    return f.tint || null;
  }
  function toneAt(idx) {
    return idx === -1 ? STEEL_TONE : SKIN_TONES[idx] || null;
  }

  window.FM_FACTIONS   = FACTIONS;
  window.FM_OPTIC_SRC  = OPTIC_SRC;
  window.FM_ACCENT_SRC = ACCENT_SRC;
  window.FM_SKIN_TONES = SKIN_TONES;
  window.FM_STEEL_TONE = STEEL_TONE;
  window.FM_SKIN_POLICY = SKIN_POLICY;
  /* ── The galaxy's id for the same faction ─────────────────────────────────
     TWO NAMESPACES SHIPPED AND NOTHING MAPPED BETWEEN THEM. galaxy.js names
     factions 'coalition', 'syndicate', 'void', 'guild', 'jade', 'fleshstation'
     and keys every colony's control percentage on those; this registry names
     the same factions 'coal', 'synd', 'void', 'guild', 'jade', 'khai' and keys
     every uniform on those. Three of the six collide BY LUCK, which is what
     hid it: 'void' and 'guild' and 'jade' work, 'coalition' and 'syndicate'
     silently do not, and 'fleshstation' has no uniform at all.

     Anything that draws a battle over a COLONY has to cross that gap, and a
     private table at the crossing point would be the sixth copy of a faction's
     identity - the exact arrangement this file was created to end. So the
     galaxy id lives on the row, next to the faction it is true of.

     fleshstation maps to NOTHING, deliberately and explicitly. It is a station
     rather than a polity and it has no kit; returning null lets a caller refuse
     to draw it, where a fallback to coal would put Coalition uniforms on a
     faction that has never had any. tools/faction-check.mjs asserts the map is
     total over galaxy.js's own table. */
  var GALAXY_ID = {};
  (function () {
    for (var k in FACTIONS) if (FACTIONS[k].gid) GALAXY_ID[FACTIONS[k].gid] = k;
  })();
  function fromGalaxy(g) { return GALAXY_ID[g] || null; }
  function toGalaxy(f)   { return (FACTIONS[f] && FACTIONS[f].gid) || null; }

  window.FM_FAC_API = {
    fromGalaxy: fromGalaxy, toGalaxy: toGalaxy,
    skinTones: skinTones, skinFor: skinFor, toneAt: toneAt,
    kitFor: kitFor, kitCount: kitCount, tintFor: tintFor, spread: spread,
    has: function (f) { return !!FACTIONS[f]; },
    name: function (f) { return (FACTIONS[f] && FACTIONS[f].name) || f; },
    short: function (f) { return (FACTIONS[f] && FACTIONS[f].short) || String(f).toUpperCase(); },
  };
})();
