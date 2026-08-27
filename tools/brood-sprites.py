#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# brood-sprites.py - bake the Khai'sultull creature sheets and their geometry.
#
# The pack ships one PNG per creature with one ANIMATION PER ROW and a text
# index giving every frame's rect. That is already the right shape, so nothing
# is repacked: the sheet is copied verbatim and this tool reads the index to
# work out, per animation, which row it is on, how many frames it has and what
# the cell size is. Repacking would have meant re-deriving all three by hand and
# getting one of them wrong.
#
# WHY THE INDEX IS PARSED RATHER THAN THE ROWS MEASURED. Rows are not the same
# length: crawling_horror's attack is nineteen frames and its move is eight, on
# one sheet whose width is the longest row. Measuring content would count the
# trailing blank cells of every short row as frames, which is exactly the class
# of bug that made the Hound strobe.
#
# COLOUR IS NOT BAKED. Theme A ships and the client tints it to the brood's
# amber through the same FAC_TINT path the Coalition's blue goes through. That
# keeps one tinting mechanism instead of two, and it means the brood's colour is
# a hex value rather than an art pass. The cost is real and worth stating: the
# tint is a luminance recolour, so the hopclops loses its yellow eye and the
# crawling horror its pink carapace. Monochrome amber is what the brood's
# wireframes already were, so the field stays coherent; if a creature ever needs
# to keep two hues, this is the decision to revisit.
#
# LICENCE: unTied Games (Will Tice). Use in a game is permitted, commercial and
# non-commercial, WITH ATTRIBUTION IN CREDITS. Redistribution of the pack
# contents outside a game or application product is NOT permitted. See
# ATTRIBUTION.txt: this is the strictest of the three unsettled assets and a
# public source repo is the exact case it names.
#
#   python3 tools/brood-sprites.py <pack-dir>
#   python3 tools/brood-sprites.py <pack-dir> --check
# ═══════════════════════════════════════════════════════════════════════════
import os, sys, json, shutil, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'client/assets/space/brood')

# out-name -> (pack folder, [animations to keep])
#
# Theme A throughout. The three themes differ only in hue and the tint discards
# hue, so picking per creature would have been a decision with no visible
# consequence and one more thing to keep straight.
PICK = {
    'horror_s': ('crawling_horror_small_A',  ['idle', 'move', 'attack']),
    'horror_l': ('crawling_horror_large_A',  ['idle', 'move', 'attack']),
    'fly_s':    ('space_fly_small_A',        ['idle', 'attack_start', 'attack_loop', 'attack_end']),
    'fly_l':    ('space_fly_large_A',        ['idle', 'attack_start', 'attack_loop', 'attack_end']),
    'hop_s':    ('hopclops_small_A',         ['idle', 'move', 'jump', 'fall']),
    'hop_l':    ('hopclops_large_A',         ['idle', 'move', 'jump', 'fall']),
    'grub_s':   ('grub_small_A',             ['idle', 'move']),
    'grub_l':   ('grub_large_A',             ['idle', 'move']),
    'egg_l':    ('egg_large_A',              ['idle', 'hatch']),
    'egg_s':    ('egg_small_A',              ['idle', 'hatch']),
    # Six splatter variants ship and one was being used, so every corpse on the
    # field left an identical mark. They are cheap and they are the difference
    # between a battlefield and a stamp.
    'splat':    ('splatter_small_A',         None),      # flat folder, no anims
    'splat_b':  ('splatter_small_B',         None),
    'splat_c':  ('splatter_small_C',         None),
    'splat_d':  ('splatter_large_A',         None),
    'splat_e':  ('splatter_large_B',         None),
    # The spitter's round. Flat folders like splatter: four frames, no
    # sub-animations, so the index records them under '_'.
    'proj_s':   ('projectile_small_A',       None),
    'proj_l':   ('projectile_large_A',       None),
}

LINE = re.compile(r'^(.+?)/(?:(.+?)/)?frame(\d+)\.png\s*=\s*(-?\d+) (-?\d+) (\d+) (\d+)\s*$')


def parse_index(path):
    """animation -> {row, cw, ch, frames}. Frames counted from the index, never
    from the image, for the reason in the header."""
    anims = {}
    with open(path, 'r', errors='replace') as fh:
        for raw in fh:
            m = LINE.match(raw.strip())
            if not m:
                continue
            _, anim, _idx, x, y, w, h = m.groups()
            anim = anim or '_'
            x, y, w, h = int(x), int(y), int(w), int(h)
            a = anims.setdefault(anim, {'row': y // h if h else 0, 'cw': w, 'ch': h, 'frames': 0})
            # A cell size that changes inside one animation would break the grid
            # assumption everything downstream makes. Say so rather than emit it.
            if a['cw'] != w or a['ch'] != h:
                raise SystemExit('ragged cell size in %s/%s' % (path, anim))
            a['frames'] += 1
    return anims


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: brood-sprites.py <pack-dir> [--check]')
    pack = sys.argv[1]
    if not os.path.exists(os.path.join(pack, 'spritesheet')):
        for sub in sorted(os.listdir(pack)):
            if os.path.exists(os.path.join(pack, sub, 'spritesheet')):
                pack = os.path.join(pack, sub)
                break
    sheets = os.path.join(pack, 'spritesheet')
    check = '--check' in sys.argv

    geom, blobs = {}, {}
    for out_name, (folder, keep) in sorted(PICK.items()):
        src = os.path.join(sheets, folder)
        png = os.path.join(src, 'spritesheet.png')
        txt = os.path.join(src, 'spritesheet.txt')
        if not os.path.exists(png):
            raise SystemExit('missing: ' + folder)
        anims = parse_index(txt)
        want = keep if keep else list(anims.keys())
        rows = {}
        for a in want:
            if a not in anims:
                raise SystemExit('%s has no animation %r (has %s)'
                                 % (folder, a, ', '.join(sorted(anims))))
            rows[a] = anims[a]
        geom[out_name] = rows
        blobs[out_name] = open(png, 'rb').read()

    src_json = json.dumps(geom, separators=(',', ':'), sort_keys=True)
    if check:
        bad = []
        p = os.path.join(OUT, 'geometry.json')
        if not os.path.exists(p) or open(p).read() != src_json:
            bad.append('geometry.json')
        for n, b in blobs.items():
            q = os.path.join(OUT, n + '.png')
            if not os.path.exists(q) or open(q, 'rb').read() != b:
                bad.append(n + '.png')
        if bad:
            print('STALE: ' + ', '.join(bad))
            sys.exit(1)
        print('brood sprites current (%d sheets)' % len(blobs))
        return

    os.makedirs(OUT, exist_ok=True)
    total = 0
    for n, b in blobs.items():
        open(os.path.join(OUT, n + '.png'), 'wb').write(b)
        total += len(b)
    open(os.path.join(OUT, 'geometry.json'), 'w').write(src_json)
    print('wrote %d sheets + geometry to %s (%.0f KB)'
          % (len(blobs), os.path.relpath(OUT, ROOT), (total + len(src_json)) / 1024))
    for n in sorted(geom):
        print('   %-9s %s' % (n, ' '.join('%s:%d' % (a, geom[n][a]['frames'])
                                          for a in sorted(geom[n]))))


main()
