#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# terrain-patches.py - bake the shippable ground patches from a 64px tile pack.
#
# WHAT SHIPS IS NOT THE PACK. Fourteen 512x512 greyscale patches ship, two per
# terrain key, and the 114-tile source pack stays out of the repo entirely.
# Three reasons and all three matter:
#
#   LICENCE SURFACE. The pack arrived with no licence file. Fourteen derived
#   textures are a smaller and more clearly-attributable footprint on a public
#   repo than 114 verbatim files, and the repo carries an ATTRIBUTION.txt naming
#   the source either way. This does NOT make an unlicensed pack licensed: see
#   the note in that file. It only limits what has to be sorted out.
#
#   GREYSCALE IS THE POINT, NOT A SIZE TRICK. The client tints at runtime with
#   the 'color' composite, which takes hue and saturation from the fill and
#   luminosity from underneath. Feed it a patch that already has an Earth hue and
#   the two fight; feed it pure luminance and the palette decides the colour
#   completely. One patch then serves a red desert, a teal rift and an ice world.
#
#   DETERMINISM. Baking at runtime means the shuffle depends on whenever the
#   pattern happened to be built. Baked once, Ussaleth looks like Ussaleth.
#
# THE LAYOUT RULES ARE THE MOCKUP'S, and they were arrived at by getting them
# wrong first. A flat shuffle of four tiles chequers light against dark at
# exactly the frequency the eye is best at spotting, so: a full base coat of ONE
# dominant tile, per-cell random flips to break the 64px grid, then variants at
# partial alpha so edges blend instead of butting.
#
#   python3 tools/terrain-patches.py <tile-pack-dir>
#   python3 tools/terrain-patches.py <tile-pack-dir> --check
# ═══════════════════════════════════════════════════════════════════════════
import os, sys, hashlib
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'client/assets/space/terrain')

PATCH, TILEPX = 8, 64          # 8x8 tiles -> 512px, repeated by the client
SIZE = PATCH * TILEPX

# Structure only. Colour is the planet palette's job at runtime, so what is
# picked here is grain and contrast. First entry is the DOMINANT tile and gets
# the full base coat; the rest are sprinkled over it.
RECIPE = {
    'dust':    {'base': ['sand ash', 'pebbles', 'dryland', 'sand'],
                'rock': ['cliff', 'granite cliff', 'caveCliff2']},
    'veins':   {'base': ['basalt', 'cave gravel 5', 'gravel', 'stone tile'],
                'rock': ['quartzite cliff', 'cliff', 'granite cliff']},
    'rift':    {'base': ['gravel', 'cave gravel 2', 'stone tile', 'clay'],
                'rock': ['granite cliff', 'caveCliff2', 'cliff']},
    'ice':     {'base': ['permasnow', 'snow', 'ice', 'pebbles'],
                'rock': ['cliff ice', 'granite cliff', 'caveCliff2']},
    'ocean':   {'base': ['shallowwater', 'water', 'mud', 'cave gravel 2'],
                'rock': ['cliff', 'granite cliff', 'deepocean']},
    # station and tether have no Reach world yet, but COLONY_VISUAL declares them
    # on Coalition and Circuit colonies and the faction war will want them. Baked
    # now so a later world is a data row rather than a new art pass.
    'station': {'base': ['granite floor', 'granite tile', 'stone tile', 'quartzite tile'],
                'rock': ['cliff', 'granite cliff', 'caveCliff2']},
    'tether':  {'base': ['clay', 'gravel', 'pebbles', 'sand ash'],
                'rock': ['quartzite cliff', 'granite cliff', 'cliff']},
}


def mulberry32(a):
    a &= 0xFFFFFFFF
    def imul(x, y):
        return ((x * y) & 0xFFFFFFFF)
    def nxt():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t = (t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF
        t ^= a
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return nxt


def grey(im):
    """Luminance only. The runtime tint supplies every scrap of hue."""
    return im.convert('RGBA').convert('LA').convert('RGBA')


def bake(pack, names, seed):
    rnd = mulberry32(seed)
    tiles = {}
    for n in names:
        p = os.path.join(pack, n + '.png')
        if not os.path.exists(p):
            raise SystemExit('missing tile: ' + n + '.png')
        tiles[n] = grey(Image.open(p).resize((TILEPX, TILEPX)))
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 255))
    dom = tiles[names[0]]

    def cell(im, x, y, alpha):
        t = im
        if rnd() < 0.5:
            t = t.transpose(Image.FLIP_LEFT_RIGHT)
        if rnd() < 0.5:
            t = t.transpose(Image.FLIP_TOP_BOTTOM)
        if alpha < 1.0:
            a = t.getchannel('A').point(lambda v: int(v * alpha))
            t = t.copy(); t.putalpha(a)
        out.alpha_composite(t, (x * TILEPX, y * TILEPX))

    # Pass one: base coat everywhere. Variants MODIFY ground, they do not BE it.
    for y in range(PATCH):
        for x in range(PATCH):
            cell(dom, x, y, 1.0)
    # Pass two: sprinkle, at partial alpha so edges blend rather than butt.
    for y in range(PATCH):
        for x in range(PATCH):
            if rnd() > 0.34:
                continue
            pick = names[1 + int(rnd() * (len(names) - 1))]
            # Alpha kept LOW. At 0.28-0.62 the sprinkle survived tinting as a
            # visible chequer of light and dark squares at exactly the frequency
            # the eye picks out best, which is the artifact the base coat was
            # added to kill in the first place. Variation, not patchwork.
            cell(tiles[pick], x, y, 0.16 + rnd() * 0.22)
    # 8-bit grey on disk. The alpha channel carried nothing by this point and
    # the client only ever reads luminance.
    return out.convert('L')


def build(pack):
    files = {}
    for key, rc in sorted(RECIPE.items()):
        seed = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
        files[key + '_base.png'] = bake(pack, rc['base'], seed ^ 0xBEEF)
        files[key + '_rock.png'] = bake(pack, rc['rock'], seed ^ 0x5EED)
    return files


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: terrain-patches.py <tile-pack-dir> [--check]')
    pack = sys.argv[1]
    check = '--check' in sys.argv
    files = build(pack)
    os.makedirs(OUT, exist_ok=True)
    stale = []
    total = 0
    for name, im in files.items():
        path = os.path.join(OUT, name)
        import io
        buf = io.BytesIO()
        im.save(buf, 'PNG', optimize=True)
        data = buf.getvalue()
        total += len(data)
        if check:
            have = open(path, 'rb').read() if os.path.exists(path) else b''
            if have != data:
                stale.append(name)
        else:
            open(path, 'wb').write(data)
    if check:
        if stale:
            print('STALE: ' + ', '.join(stale))
            sys.exit(1)
        print('terrain patches current (%d files)' % len(files))
    else:
        print('wrote %d patches to %s (%.0f KB total)'
              % (len(files), os.path.relpath(OUT, ROOT), total / 1024))


main()
