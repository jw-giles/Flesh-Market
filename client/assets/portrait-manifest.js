// Auto-generated portrait manifest.
// window.FM_PORTRAITS = { groups:[[label,[ids]]], all:[ids], credits:{label:{name,url}},
//                         frame:{id:[headWidth, headCentreX, subjectTop]} }
//
// credits is keyed by GROUP LABEL. A group with no entry renders no credit line
// rather than inheriting somebody else's, because a wrong attribution is worse
// than a missing one.
//
// frame COVERS 97 OF THE 257 PORTRAITS and that is deliberate: the scan set minus
// scan31. See the note on FMPortraitFrame below for why the other 161 are better
// off without it. Three numbers per portrait, normalised 0..1 against the source
// image: the width of the widest point in the top 45% of the subject, the
// horizontal centre of that band, and the top of the alpha silhouette. Measured
// off the PNGs at build time, not authored by hand.
// ── The Khai'sultull portraits are not in here, and that is deliberate ──────
// THE HIVE IS NOT A COSTUME. prawn1 sat in the ordinary selectable set, so any
// account could put on the face of the thing the entire war layer is about. The
// Reach reads as a standing threat because exactly ONE VOICE speaks with that
// face; a station full of them is a joke about the enemy rather than the enemy.
//
// The PNG stays on disk and stays in the server's PORTRAIT_SET, because the boot
// sweep clears any stored id that no longer names a file and deleting the art
// would strip the portrait off the account already wearing it. What changed is
// that the picker never lists it and /api/portrait refuses it: it is assigned
// through the dev_portrait command in God Mode and nowhere else. See
// DEV_PORTRAITS in server.js.
window.FM_PORTRAITS = {"groups": [["Corporate", ["corpo1", "corpo2", "corpo3", "corpo4", "corpo5", "corpo6", "corpo7"]], ["Cyborg", ["cyborg1", "cyborg2", "cyborg3", "cyborg4", "cyborg5", "cyborg6", "cyborg7", "cyborg8", "cyborg9", "cyborg10", "cyborg11"]], ["Hacker", ["hacker1", "hacker2", "hacker3", "hacker4", "hacker5", "hacker6", "hacker7", "hacker8", "hacker9", "hacker10", "hacker11"]], ["S'weet Addict", ["nanoinfected1", "nanoinfected2", "nanoinfected3", "nanoinfected4"]], ["Street", ["punk1", "punk2", "punk3", "punk4", "punk5", "punk6", "punk7", "punk8", "punk9", "punk10", "punk11", "punk12", "punk13", "punk14", "punk15", "punk16", "punk17", "punk18", "punk19", "punk20", "punk21", "punk22", "punk23", "punk24", "punk25", "punk26", "punk27"]], ["Colonist", ["scan1", "scan2", "scan3", "scan4", "scan5", "scan6", "scan7", "scan8", "scan9", "scan10", "scan11", "scan12", "scan13", "scan14", "scan15", "scan16", "scan17", "scan18", "scan19", "scan20", "scan21", "scan22", "scan23", "scan24", "scan25", "scan26", "scan27", "scan28", "scan29", "scan30", "scan31", "scan32", "scan33", "scan34", "scan35", "scan36", "scan37", "scan38", "scan39", "scan40", "scan41", "scan42", "scan43", "scan44", "scan45", "scan46", "scan47", "scan48", "scan49", "scan50", "scan51", "scan52", "scan53", "scan54", "scan55", "scan56", "scan57", "scan58", "scan59", "scan60", "scan61", "scan62", "scan63", "scan64", "scan65", "scan66", "scan67", "scan68", "scan69", "scan70", "scan71", "scan72", "scan73", "scan74", "scan75", "scan76", "scan77", "scan78", "scan79", "scan80", "scan82", "scan83", "scan84", "scan85", "scan86", "scan87", "scan89", "scan90", "scan91", "scan92", "scan93", "scan94", "scan95", "scan96", "scan97", "scan98", "scan99", "scan100"]], ["Synthetic", ["droid1", "droid2", "droid3", "droid4", "droid6", "droid7", "droid8", "droid9", "droid10", "droid11", "droid12", "droid13", "droid14", "droid15", "droid16", "droid17", "droid18", "droid19", "droid20", "droid21", "droid22", "droid23", "droid24", "droid25", "droid26", "droid27", "droid28", "droid29", "droid30", "droid31", "droid32", "droid33", "droid34", "droid35", "droid36", "droid37", "droid38", "droid39", "droid40", "droid41", "droid42", "droid43", "droid44", "droid45", "droid46", "droid47", "droid48", "droid49", "droid50", "droid51", "droid52", "droid53", "droid54", "droid55", "droid56", "droid57", "droid58", "droid59", "droid60", "droid61", "droid62", "droid63", "droid64", "droid65", "droid66", "droid67", "droid68", "droid69", "droid70", "droid71", "droid72", "droid73", "droid74", "droid75", "droid76", "droid77", "droid78", "droid79", "droid80", "droid81", "droid82", "droid83", "droid84", "droid85", "droid86", "droid87", "droid88", "droid89", "droid90", "droid91", "droid92", "droid93", "droid94", "droid95", "droid96", "droid97", "droid98", "droid99", "droid100"]]], "all": ["corpo1", "corpo2", "corpo3", "corpo4", "corpo5", "corpo6", "corpo7", "cyborg1", "cyborg2", "cyborg3", "cyborg4", "cyborg5", "cyborg6", "cyborg7", "cyborg8", "cyborg9", "cyborg10", "cyborg11", "hacker1", "hacker2", "hacker3", "hacker4", "hacker5", "hacker6", "hacker7", "hacker8", "hacker9", "hacker10", "hacker11", "nanoinfected1", "nanoinfected2", "nanoinfected3", "nanoinfected4", "punk1", "punk2", "punk3", "punk4", "punk5", "punk6", "punk7", "punk8", "punk9", "punk10", "punk11", "punk12", "punk13", "punk14", "punk15", "punk16", "punk17", "punk18", "punk19", "punk20", "punk21", "punk22", "punk23", "punk24", "punk25", "punk26", "punk27", "scan1", "scan2", "scan3", "scan4", "scan5", "scan6", "scan7", "scan8", "scan9", "scan10", "scan11", "scan12", "scan13", "scan14", "scan15", "scan16", "scan17", "scan18", "scan19", "scan20", "scan21", "scan22", "scan23", "scan24", "scan25", "scan26", "scan27", "scan28", "scan29", "scan30", "scan31", "scan32", "scan33", "scan34", "scan35", "scan36", "scan37", "scan38", "scan39", "scan40", "scan41", "scan42", "scan43", "scan44", "scan45", "scan46", "scan47", "scan48", "scan49", "scan50", "scan51", "scan52", "scan53", "scan54", "scan55", "scan56", "scan57", "scan58", "scan59", "scan60", "scan61", "scan62", "scan63", "scan64", "scan65", "scan66", "scan67", "scan68", "scan69", "scan70", "scan71", "scan72", "scan73", "scan74", "scan75", "scan76", "scan77", "scan78", "scan79", "scan80", "scan82", "scan83", "scan84", "scan85", "scan86", "scan87", "scan89", "scan90", "scan91", "scan92", "scan93", "scan94", "scan95", "scan96", "scan97", "scan98", "scan99", "scan100", "droid1", "droid2", "droid3", "droid4", "droid6", "droid7", "droid8", "droid9", "droid10", "droid11", "droid12", "droid13", "droid14", "droid15", "droid16", "droid17", "droid18", "droid19", "droid20", "droid21", "droid22", "droid23", "droid24", "droid25", "droid26", "droid27", "droid28", "droid29", "droid30", "droid31", "droid32", "droid33", "droid34", "droid35", "droid36", "droid37", "droid38", "droid39", "droid40", "droid41", "droid42", "droid43", "droid44", "droid45", "droid46", "droid47", "droid48", "droid49", "droid50", "droid51", "droid52", "droid53", "droid54", "droid55", "droid56", "droid57", "droid58", "droid59", "droid60", "droid61", "droid62", "droid63", "droid64", "droid65", "droid66", "droid67", "droid68", "droid69", "droid70", "droid71", "droid72", "droid73", "droid74", "droid75", "droid76", "droid77", "droid78", "droid79", "droid80", "droid81", "droid82", "droid83", "droid84", "droid85", "droid86", "droid87", "droid88", "droid89", "droid90", "droid91", "droid92", "droid93", "droid94", "droid95", "droid96", "droid97", "droid98", "droid99", "droid100"], "credits": {"Corporate": {"name": "subotai", "url": "https://subotai-khudozhnik.itch.io/"}, "Cyborg": {"name": "subotai", "url": "https://subotai-khudozhnik.itch.io/"}, "Hacker": {"name": "subotai", "url": "https://subotai-khudozhnik.itch.io/"}, "S'weet Addict": {"name": "subotai", "url": "https://subotai-khudozhnik.itch.io/"}, "Street": {"name": "subotai", "url": "https://subotai-khudozhnik.itch.io/"}, "Colonist": {"name": "gatlingart", "url": "https://gatlingart.itch.io/"}, "Synthetic": {"name": "gatlingart", "url": "https://gatlingart.itch.io/"}}, "frame": {"scan1": [0.547, 0.486, 0.03], "scan2": [0.674, 0.509, 0.03], "scan3": [0.799, 0.487, 0.03], "scan4": [0.738, 0.548, 0.03], "scan5": [0.573, 0.478, 0.03], "scan6": [0.702, 0.391, 0.03], "scan7": [0.718, 0.513, 0.03], "scan8": [0.824, 0.464, 0.03], "scan9": [0.555, 0.513, 0.03], "scan10": [0.776, 0.417, 0.03], "scan11": [0.71, 0.524, 0.03], "scan12": [0.669, 0.583, 0.096], "scan13": [0.697, 0.5, 0.03], "scan14": [0.728, 0.528, 0.03], "scan15": [0.891, 0.52, 0.03], "scan16": [0.598, 0.506, 0.03], "scan17": [0.807, 0.494, 0.03], "scan18": [0.804, 0.543, 0.068], "scan19": [0.728, 0.523, 0.03], "scan20": [0.733, 0.49, 0.03], "scan21": [0.733, 0.393, 0.03], "scan22": [0.616, 0.505, 0.03], "scan23": [0.585, 0.398, 0.03], "scan24": [0.723, 0.462, 0.03], "scan25": [0.858, 0.443, 0.083], "scan26": [0.593, 0.55, 0.03], "scan27": [0.743, 0.482, 0.03], "scan28": [0.616, 0.533, 0.091], "scan29": [0.751, 0.483, 0.03], "scan30": [0.962, 0.5, 0.06], "scan32": [0.832, 0.567, 0.068], "scan33": [0.707, 0.541, 0.03], "scan34": [0.809, 0.48, 0.03], "scan35": [0.7, 0.529, 0.03], "scan36": [0.608, 0.425, 0.03], "scan37": [0.575, 0.533, 0.03], "scan38": [0.827, 0.524, 0.154], "scan39": [0.674, 0.552, 0.03], "scan40": [0.672, 0.508, 0.088], "scan41": [0.88, 0.515, 0.03], "scan42": [0.807, 0.539, 0.03], "scan43": [0.794, 0.505, 0.03], "scan44": [0.715, 0.57, 0.058], "scan45": [0.7, 0.519, 0.03], "scan46": [0.72, 0.468, 0.03], "scan47": [0.562, 0.517, 0.03], "scan48": [0.651, 0.602, 0.03], "scan49": [0.557, 0.494, 0.03], "scan50": [0.733, 0.523, 0.03], "scan51": [0.723, 0.508, 0.03], "scan52": [0.601, 0.475, 0.111], "scan53": [0.567, 0.506, 0.06], "scan54": [0.674, 0.445, 0.093], "scan55": [0.868, 0.506, 0.03], "scan56": [0.845, 0.497, 0.03], "scan57": [0.613, 0.506, 0.03], "scan58": [0.718, 0.508, 0.03], "scan59": [0.59, 0.52, 0.03], "scan60": [0.649, 0.504, 0.03], "scan61": [0.595, 0.541, 0.03], "scan62": [0.735, 0.417, 0.03], "scan63": [0.575, 0.556, 0.03], "scan64": [0.682, 0.541, 0.03], "scan65": [0.674, 0.501, 0.03], "scan66": [0.766, 0.506, 0.03], "scan67": [0.743, 0.49, 0.03], "scan68": [0.656, 0.48, 0.03], "scan69": [0.73, 0.445, 0.03], "scan70": [0.756, 0.471, 0.096], "scan71": [0.628, 0.565, 0.03], "scan72": [0.606, 0.38, 0.03], "scan73": [0.746, 0.532, 0.03], "scan74": [0.567, 0.481, 0.101], "scan75": [0.58, 0.492, 0.03], "scan76": [0.728, 0.475, 0.03], "scan77": [0.786, 0.542, 0.03], "scan78": [0.626, 0.525, 0.03], "scan79": [0.768, 0.538, 0.03], "scan80": [0.628, 0.483, 0.03], "scan82": [0.677, 0.441, 0.04], "scan83": [0.888, 0.458, 0.04], "scan84": [0.774, 0.541, 0.03], "scan85": [0.885, 0.508, 0.03], "scan86": [0.758, 0.51, 0.03], "scan87": [0.695, 0.506, 0.03], "scan89": [0.819, 0.469, 0.03], "scan90": [0.809, 0.497, 0.03], "scan91": [0.875, 0.452, 0.033], "scan92": [0.613, 0.555, 0.03], "scan93": [0.71, 0.608, 0.03], "scan94": [0.913, 0.473, 0.03], "scan95": [0.735, 0.524, 0.03], "scan96": [0.952, 0.49, 0.063], "scan97": [0.835, 0.505, 0.03], "scan98": [0.774, 0.495, 0.03], "scan99": [0.924, 0.481, 0.03], "scan100": [0.669, 0.458, 0.076]}};

// WHAT THIS IS FOR, AND WHAT IT IS NOT FOR.
//
// Every ring that shows a face (council chairs, council cards, chat avatars) used
// to zoom by one constant, 1.55x anchored 37% down. The scan set is drawn tighter
// in frame than that constant assumes and a fixed zoom either cropped faces off or
// left them small depending on which artist drew them. So the scan portraits get a
// measured head box and everything else renders 1:1, no crop.
//
// THE MEASUREMENT ASSUMES A HUMAN BUST: a head narrower than the shoulders, so the
// widest point in the top of the silhouette IS the head. Two places that does not
// hold, both found by rendering every portrait the rule zoomed past 1.25x and
// looking at them rather than trusting the number:
//
//   THE DROID SET. A machine bust is head all the way down; the plating IS the
//   silhouette. The rule reads their narrow crowns as small heads and zooms in on
//   them, hardest on the most machine-like: droid16 came out at 2.79x, framed on a
//   blank curve of helmet with the robot entirely out of shot. All 99 render 1:1.
//
//   scan31. Hooded and heavily bearded, so it measures like a machine rather than
//   like the other 97 humans: a narrow crown over a wide beard-and-shoulder mass,
//   which the rule read as a small head and zoomed 1.39x into, cutting the crown.
//   Excluded by name in the generator. It is the only human that fails this way.
//
// The two art sets were NEVER measured together, which was an earlier mistake
// worth not repeating: the number does not mean the same thing across sets, so
// normalising them to a shared target zoomed the tightly-drawn art in hard to make
// small honest numbers match large inflated ones.
//
// Returns multipliers of the CONTAINER, so an SVG caller multiplies by the disc
// diameter and a CSS caller writes them as percentages; both get identical
// geometry. At 1:1 the CSS reduces to plain object-fit:cover, which is what these
// surfaces did before any framing existed.
window.FMPortraitFrame = function (id) {
  var FALLBACK = { scale: 1, ox: 0, oy: 0 };
  var f = (window.FM_PORTRAITS && window.FM_PORTRAITS.frame) ? window.FM_PORTRAITS.frame[id] : null;
  if (!f) return FALLBACK;
  var TARGET = 0.78, HEADROOM = 0.16;
  // Clamped at both ends: never below 1x (which would letterbox the container)
  // and never past 3.2x, so one bad measurement cannot zoom into a nostril.
  var s = TARGET / Math.max(f[0], 0.18);
  s = Math.max(1, Math.min(s, 3.2));
  // COVERAGE BEATS IDEAL PLACEMENT. A portrait drawn hard against the top of its
  // frame wants a positive vertical offset, which would leave a bare crescent of
  // background inside the ring. Offsets are clamped so the image always spans the
  // container on both axes; the head shifts a few percent off its ideal spot
  // rather than the ring showing a hole.
  function fit(v) { return Math.max(1 - s, Math.min(v, 0)); }
  return { scale: s, ox: fit(0.5 - f[1] * s), oy: fit(HEADROOM - f[2] * s) };
};
