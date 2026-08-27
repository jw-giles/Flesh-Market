#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# nature-meshes.py - bake low-poly OBJ props into a compact runtime table.
#
# THE COVER WAS EXTRUDED POLYGONS AND IT LOOKED LIKE BRICK LOAVES. A prism is a
# footprint pushed up: flat top, vertical walls, no silhouette worth the name. At
# four metres a tile and thirty-four of them on a field it reads as masonry
# dropped on a plain, which is the note this replaces.
#
# These are real meshes. Rocks for scatter, mountains for the ground a line
# fights over. Flat-shaded per face from the world palette, so they take their
# colour the same way the ground does and no world needs its own art.
#
# WHAT IS SELECTED AND WHY. Face count is the whole budget: canvas 2D fills one
# polygon per call, so a mesh is priced in draw calls per instance per frame.
#
#   Rock_1..4        7 to 40 faces   scatter, dozens of instances
#   Mountain LOD_Low 103 to 205      major cover, a dozen instances
#   Cliff_1..3       343 to 394      TOO EXPENSIVE for cover; the spire ridge
#                                    only, where there are six of them and they
#                                    are past the haze
#
# Trees, flowers, mushrooms and grass are in the pack and are NOT baked. The
# Reach is a brood world; a pine forest on Ussaleth is a different game. Cactus
# is borderline and left out for the same reason: it reads as Earth desert
# rather than as somewhere the hive dug in. If a Coalition or Circuit world ever
# fights a battle, revisit that - the pack has the art and this tool has the
# table.
#
# LICENCE: CC0 1.0 Universal, stated in the pack's own License.txt. Public
# domain dedication: redistribution and commercial use permitted, attribution
# not required. Credited anyway in ATTRIBUTION.txt, because not being obliged to
# is a poor reason not to.
#
#   python3 tools/nature-meshes.py <pack-dir>
#   python3 tools/nature-meshes.py <pack-dir> --check
# ═══════════════════════════════════════════════════════════════════════════
import os, sys, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'client/assets/space/nature/meshes.json')

# name -> (relative obj path, role). Role decides where the renderer reaches
# for it, and nothing else about the mesh.
PICK = [
    ('rock_a',  'OBJ/Rocks/Rock_1.obj',                  'scatter'),
    ('rock_b',  'OBJ/Rocks/Rock_2.obj',                  'scatter'),
    ('rock_c',  'OBJ/Rocks/Rock_3.obj',                  'scatter'),
    ('rock_d',  'OBJ/Rocks/Rock_4.obj',                  'scatter'),
    ('crag_a',  'OBJ/Terrain/Mountain_1_LOD_Low.obj',    'cover'),
    ('crag_b',  'OBJ/Terrain/Mountain_2_LOD_Low.obj',    'cover'),
    ('ridge_a', 'OBJ/Terrain/Cliff_1.obj',               'far'),
    ('ridge_b', 'OBJ/Terrain/Cliff_2.obj',               'far'),

    ('ridge_c', 'OBJ/Terrain/Cliff_3.obj',               'far'),
    ('rock_e',  'OBJ/Rocks/Rock_5_Snow.obj',             'scatter'),
    ('rock_f',  'OBJ/Rocks/Rock_3_Snow.obj',             'scatter'),

    # ── Standing growth ──────────────────────────────────────────────────
    # THE EARLIER RULE WAS "DEAD AND BARE ONLY" AND IT WAS TOO NARROW. It was
    # written to stop a pine forest appearing on Ussaleth, which is still the
    # right instinct, but it also banned the cactus - and a cactus is exactly
    # what a desert world wants and says nothing about pine forests. The rule
    # is now per TERRAIN rather than per pack: what grows is decided by the
    # world's climate key, so a lava world gets snags and a desert gets cacti
    # and neither can get the other. See FLORA_MIX in reach-battle.js.
    #
    # Face count still decides what is affordable. The pack's willows and oaks
    # run to a thousand faces each and are out on that alone; nothing here is
    # over five hundred, and the renderer spends a per-frame budget nearest
    # first so the expensive ones simply stop drawing at distance.

    # Dead standing timber. Reads on any world: something grew here once.
    ('snag_a',  'OBJ/Trees/Palm_Tree_Dead.obj',          'flora'),   #  66
    ('snag_b',  'OBJ/Trees/Pine_Tree_1_Dead.obj',        'flora'),   # 247
    ('snag_c',  'OBJ/Trees/Tree_1_Dead.obj',             'flora'),   # 204
    ('snag_d',  'OBJ/Trees/Broken_Tree_Dead.obj',        'flora'),   # 293
    ('snag_e',  'OBJ/Trees/Willow_Tree_Dead.obj',        'flora'),   # 310

    # Bare simple trees. Cheap, and at battlefield distance they read as thin
    # standing growth rather than as anything with leaves on it.
    ('tree_a',  'OBJ/Trees/Simple_Tree_6.obj',           'flora'),   #  20
    ('tree_b',  'OBJ/Trees/Simple_Tree_1.obj',           'flora'),   #  36
    ('tree_c',  'OBJ/Trees/Simple_Tree_3.obj',           'flora'),   #  36
    ('tree_d',  'OBJ/Trees/Simple_Tree_2.obj',           'flora'),   #  70

    # Winter forms: bare branches and snow load, for the ice world.
    ('wint_a',  'OBJ/Trees/Simple_Tree_1_Winter.obj',    'flora'),   #  36
    ('wint_b',  'OBJ/Trees/Pine_Tree_1_Winter.obj',      'flora'),   # 181

    # The desert's signature, and the reason the old rule needed loosening.
    ('cact_a',  'OBJ/Plants and flowers/Cactus_Summer.obj', 'flora'),# 436

    ('scrub_a', 'OBJ/Bushes/Bush_3.obj',                 'flora'),   #  22
    ('scrub_b', 'OBJ/Bushes/Bush_2.obj',                 'flora'),   #  26
    ('scrub_c', 'OBJ/Bushes/Bush_6.obj',                 'flora'),   #  64
    ('scrub_d', 'OBJ/Bushes/Bush_1.obj',                 'flora'),   #  80
    ('snowb_a', 'OBJ/Bushes/Bush_3_Snow.obj',            'flora'),   #  22
    ('snowb_b', 'OBJ/Bushes/Bush_2_Snow.obj',            'flora'),   #  26
    ('tuft',    'OBJ/Bushes/Grass_2.obj',                'flora'),   #  30

    # Fungal growth for the wet and the sunless: the rift and the drowned world.
    ('shrm_a',  'OBJ/Plants and flowers/Mushroom_1.obj', 'flora'),   #  27
    ('shrm_b',  'OBJ/Plants and flowers/Mushroom_2.obj', 'flora'),   #  37
]

# Coordinate decimals. Three is about a millimetre on a mesh normalized to unit
# height and knocks roughly a third off the file against six.
DP = 3


def load_obj(path):
    """Vertices and faces. Faces are kept as n-gons: canvas fills a polygon in
    one call whatever its vertex count, so triangulating here would multiply the
    per-frame draw cost by about two for no gain."""
    vs, fs = [], []
    with open(path, 'r', errors='replace') as fh:
        for line in fh:
            if line.startswith('v '):
                p = line.split()
                vs.append([float(p[1]), float(p[2]), float(p[3])])
            elif line.startswith('f '):
                idx = []
                for tok in line.split()[1:]:
                    idx.append(int(tok.split('/')[0]) - 1)
                if len(idx) >= 3:
                    fs.append(idx)
    return vs, fs


def normalize(vs):
    """Sit the mesh on y=0, centre it in x/z, and scale so it is exactly one
    unit tall. The renderer then scales by the height it wants in world units
    and never has to know what the artist's units were.

    HEIGHT, NOT THE BOUNDING BOX DIAGONAL. A prop is placed by how tall it
    stands; normalizing on the diagonal makes a wide flat rock and a narrow tall
    one arrive at different heights from the same scale figure."""
    xs = [v[0] for v in vs]; ys = [v[1] for v in vs]; zs = [v[2] for v in vs]
    cx = (min(xs) + max(xs)) / 2.0
    cz = (min(zs) + max(zs)) / 2.0
    y0 = min(ys)
    h = max(ys) - y0
    if h <= 1e-9:
        h = 1.0
    return [[(v[0] - cx) / h, (v[1] - y0) / h, (v[2] - cz) / h] for v in vs]


def face_normal(vs, f):
    """Newell's method, because these faces are n-gons and are not guaranteed
    planar. A three-point cross product on a slightly bent pentagon picks the
    normal of whichever corner it happened to sample, which flickers between
    frames as the shading term crosses zero."""
    nx = ny = nz = 0.0
    n = len(f)
    for i in range(n):
        a = vs[f[i]]
        b = vs[f[(i + 1) % n]]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return [nx / L, ny / L, nz / L]


def bake(pack):
    out = {}
    for name, rel, role in PICK:
        p = os.path.join(pack, rel)
        if not os.path.exists(p):
            raise SystemExit('missing: ' + rel)
        vs, fs = load_obj(p)
        if not vs or not fs:
            raise SystemExit('empty mesh (geometry may be split across objects): ' + rel)
        vs = normalize(vs)
        # Sorted by face count so the renderer's budget can walk cheapest first.
        out[name] = {
            'role': role,
            'v': [round(c, DP) for v in vs for c in v],
            'f': fs,
            'n': [round(c, 3) for f in fs for c in face_normal(vs, f)],
        }
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: nature-meshes.py <pack-dir> [--check]')
    pack = sys.argv[1]
    # Tolerate being handed either the rar's top folder or its parent.
    if not os.path.exists(os.path.join(pack, 'OBJ')):
        for sub in os.listdir(pack):
            if os.path.exists(os.path.join(pack, sub, 'OBJ')):
                pack = os.path.join(pack, sub)
                break
    data = bake(pack)
    src = json.dumps(data, separators=(',', ':'), sort_keys=True)
    if '--check' in sys.argv:
        have = open(OUT).read() if os.path.exists(OUT) else ''
        if have != src:
            print('meshes.json is STALE. Run: python3 tools/nature-meshes.py <pack-dir>')
            sys.exit(1)
        print('nature meshes current (%d)' % len(data))
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w').write(src)
    tot = sum(len(m['f']) for m in data.values())
    print('wrote %s  (%d meshes, %d faces, %.0f KB)'
          % (os.path.relpath(OUT, ROOT), len(data), tot, len(src) / 1024))
    for k in sorted(data):
        print('   %-9s %-8s %4d faces' % (k, data[k]['role'], len(data[k]['f'])))


main()
