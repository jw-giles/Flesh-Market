#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# city-meshes.py — bakes a palette-textured low-poly FBX kit into the mesh
# format this renderer already draws.
#
#     python3 tools/city-meshes.py <pack-dir>
#     python3 tools/city-meshes.py <pack-dir> --check
#
# *** WHY THIS PACK AND NOT THE TEXTURED ONE: THE RENDERER CANNOT MAP A
#     TEXTURE ONTO A WALL CORRECTLY, AND NEVER WILL. ***
#
# Canvas 2D can only draw an image through an AFFINE transform. A rectangle
# seen in perspective is a general quad, which is a PROJECTIVE map, and no
# affine can express it. Subdividing the wall makes each piece nearly affine
# and the error shrinks - it never reaches zero, and the pieces that remain are
# exactly the "curved" bowing and the hairline gaps along the seams. That is
# not a tuning problem and no amount of extra subdivision closes it; it is what
# happens when you ask a 2D canvas to do a 3D job.
#
# A PALETTE-TEXTURED MESH SIDESTEPS THE WHOLE THING. Every face's UVs point at
# one flat swatch in a 1024px palette, so a face has exactly ONE colour - and a
# flat-filled polygon is something canvas 2D draws EXACTLY, with no warping and
# no seams, at any angle and any distance. This is the same path the nature
# pack already takes through paintFace, and the nature meshes have never bowed
# or gapped once.
#
# So the baker resolves each polygon's UV to its palette colour here, at build
# time, and ships colours rather than texture coordinates. The runtime does no
# texturing at all.
#
# WHAT IT PRODUCES, per mesh, matching client/assets/space/nature/meshes.json:
#     v     flat vertex list, x y z
#     f     polygons as vertex index lists
#     n     one normal per face, flat
#     c     one palette colour per face          <- new
#     e     one emissive colour per face, or 0   <- new
#     role  what the piece is, from its name
# ═══════════════════════════════════════════════════════════════════════════
import json
import os
import re
import struct
import sys
import zlib

from PIL import Image

# ── binary FBX 7.x reader ──────────────────────────────────────────────────
# Enough of the format to walk Objects/Geometry. Properties may be
# zlib-deflated arrays, which is the only part that is not obvious.


def _prop(f):
    t = f.read(1).decode('ascii')
    if t == 'Y': return struct.unpack('<h', f.read(2))[0]
    if t == 'C': return struct.unpack('<?', f.read(1))[0]
    if t == 'I': return struct.unpack('<i', f.read(4))[0]
    if t == 'F': return struct.unpack('<f', f.read(4))[0]
    if t == 'D': return struct.unpack('<d', f.read(8))[0]
    if t == 'L': return struct.unpack('<q', f.read(8))[0]
    if t in 'fdlib':
        n, enc, cl = struct.unpack('<III', f.read(12))
        raw = f.read(cl)
        if enc:
            raw = zlib.decompress(raw)
        fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': '?'}[t]
        return list(struct.unpack('<%d%s' % (n, fmt), raw))
    if t in 'SR':
        n = struct.unpack('<I', f.read(4))[0]
        b = f.read(n)
        return b.decode('utf-8', 'replace') if t == 'S' else b
    raise ValueError('unknown FBX property type ' + repr(t))


def _node(f, ver):
    W = 8 if ver >= 7500 else 4
    fmtw = '<Q' if W == 8 else '<I'
    hdr = f.read(3 * W + 1)
    if len(hdr) < 3 * W + 1:
        return None
    end = struct.unpack(fmtw, hdr[0:W])[0]
    nprop = struct.unpack(fmtw, hdr[W:2 * W])[0]
    nlen = hdr[3 * W]
    if end == 0 and nprop == 0 and nlen == 0:
        return None                       # the null sentinel that ends a list
    name = f.read(nlen).decode('ascii', 'replace')
    props = [_prop(f) for _ in range(nprop)]
    kids = []
    while f.tell() < end - 13:
        k = _node(f, ver)
        if k is None:
            break
        kids.append(k)
    if f.tell() < end:
        f.seek(end)
    return {'name': name, 'props': props, 'kids': kids}


def read_fbx(path):
    with open(path, 'rb') as f:
        head = f.read(27)
        if not head.startswith(b'Kaydara FBX Binary'):
            raise SystemExit(path + ': not a binary FBX')
        ver = struct.unpack('<I', head[23:27])[0]
        root = []
        while True:
            n = _node(f, ver)
            if n is None:
                break
            root.append(n)
    return ver, root


def walk(nodes, name):
    for n in nodes:
        if n['name'] == name:
            yield n
        for r in walk(n['kids'], name):
            yield r


# ── geometry ───────────────────────────────────────────────────────────────
def polygons(idx):
    """FBX marks the last index of a polygon by bitwise NOT. Undo that."""
    out, cur = [], []
    for i in idx:
        if i < 0:
            cur.append(~i)
            out.append(cur)
            cur = []
        else:
            cur.append(i)
    return out


def face_normal(v, poly):
    ax, ay, az = v[poly[0] * 3:poly[0] * 3 + 3]
    bx, by, bz = v[poly[1] * 3:poly[1] * 3 + 3]
    cx, cy, cz = v[poly[2] * 3:poly[2] * 3 + 3]
    ux, uy, uz = bx - ax, by - ay, bz - az
    wx, wy, wz = cx - ax, cy - ay, cz - az
    nx, ny, nz = uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx
    L = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
    return [round(nx / L, 4), round(ny / L, 4), round(nz / L, 4)]


ROLE = [
    (r'wall', 'wall'), (r'window', 'window'), (r'door', 'door'),
    (r'roof', 'roof'), (r'stair', 'stair'), (r'pavement|curb|crossing', 'ground'),
    (r'road|line', 'road'), (r'lamp', 'lamp'), (r'fence', 'fence'),
    (r'sign', 'sign'), (r'bin|barrel|sewer', 'prop'), (r'tree', 'tree'),
]


def role_of(name):
    low = name.lower()
    for pat, r in ROLE:
        if re.search(pat, low):
            return r
    return 'prop'


def material_colours(root):
    """Diffuse colour of every Material node, in file order.

    THE MODERN CITY PACK SHIPS NO TEXTURES AT ALL - 70 FBX files and not one
    image - so the palette lookup this baker was built around does not exist
    for it. What it does carry is a Material per surface with a DiffuseColor,
    and a LayerElementMaterial that assigns one ByPolygon. That is the same
    information arriving by a different route: one flat colour per face, which
    is the only thing this renderer can draw anyway.
    """
    out = []
    for m in walk(root, 'Material'):
        rgb = (0.8, 0.8, 0.8)
        for p70 in walk(m['kids'], 'P'):
            pr = p70['props']
            if pr and isinstance(pr[0], str) and pr[0] == 'DiffuseColor':
                vals = [x for x in pr[4:7] if isinstance(x, (int, float))]
                if len(vals) == 3:
                    rgb = tuple(vals)
        out.append(rgb)
    return out


def model_transform(m):
    """Lcl Scaling and Translation off a Model node.

    *** THE FIRST BAKE OF THIS PACK CAME OUT WITH EVERY BUILDING EXACTLY 2x2
    UNITS. *** That is the giveaway: the meshes are authored as unit cubes and
    ALL of their shape lives in the Model's Lcl Scaling, which the palette
    baker never had to read because that pack bakes its transforms into the
    geometry. Ignoring it does not distort a building slightly - it turns a
    sixty storey tower and a corner shop into the same box.
    """
    sc, tr = [1.0, 1.0, 1.0], [0.0, 0.0, 0.0]
    for p70 in walk(m['kids'], 'P'):
        pr = p70['props']
        if not pr or not isinstance(pr[0], str):
            continue
        vals = [x for x in pr[4:7] if isinstance(x, (int, float))]
        if len(vals) != 3:
            continue
        if pr[0] == 'Lcl Scaling':
            sc = vals
        elif pr[0] == 'Lcl Translation':
            tr = vals
    return sc, tr


def bake_materials(path):
    """Bake one untextured FBX using its per-polygon material colours."""
    ver, root = read_fbx(path)
    cols = material_colours(root)
    geos = list(walk(root, 'Geometry'))
    models = [m for m in walk(root, 'Model')]
    names, xforms = [], []
    for m in models:
        nm = ''
        for p in m['props']:
            if isinstance(p, str) and p:
                nm = p.split('\x00')[0]
                break
        names.append(nm)
        xforms.append(model_transform(m))
    out = {}
    for gi, g in enumerate(geos):
        k = {x['name']: x for x in g['kids']}
        if 'Vertices' not in k or 'PolygonVertexIndex' not in k:
            continue
        v = list(k['Vertices']['props'][0])
        sc, tr = xforms[gi] if gi < len(xforms) else ([1, 1, 1], [0, 0, 0])
        # *** AND THIS PACK IS Z-UP. *** building_12 spans z -1..59 and y -1..1:
        # the height is on Z, which is the Blender convention and not the one
        # this renderer uses. Scale, translate, then swap to Y-up in one pass,
        # so nothing downstream has to know which pack a mesh came from.
        for _i in range(0, len(v), 3):
            x = v[_i] * sc[0] + tr[0]
            y = v[_i+1] * sc[1] + tr[1]
            z = v[_i+2] * sc[2] + tr[2]
            v[_i], v[_i+1], v[_i+2] = x, z, -y
        polys = polygons(k['PolygonVertexIndex']['props'][0])
        matIdx = None
        if 'LayerElementMaterial' in k:
            mk = {x['name']: x for x in k['LayerElementMaterial']['kids']}
            if 'Materials' in mk:
                matIdx = mk['Materials']['props'][0]
        faces, norms, cvals, emis = [], [], [], []
        for pi, p in enumerate(polys):
            mi = 0
            if matIdx:
                mi = matIdx[pi] if len(matIdx) > pi else matIdx[0]
            rgb = cols[mi] if mi < len(cols) else (0.8, 0.8, 0.8)
            r = min(255, int(rgb[0] * 255)); gg = min(255, int(rgb[1] * 255))
            b = min(255, int(rgb[2] * 255))
            faces.append(p)
            norms.extend(face_normal(v, p))
            cvals.append((r << 16) | (gg << 8) | b)
            emis.append(0)
        nm = names[gi] if gi < len(names) and names[gi] else ('mesh%d' % gi)
        out[nm] = {'v': [round(x, 4) for x in v], 'f': faces, 'n': norms,
                   'c': cvals, 'e': emis, 'role': role_of(nm)}
    return out


def bake(pack):
    fbx_path = None
    for f in os.listdir(pack):
        if f.lower().endswith('.fbx'):
            fbx_path = os.path.join(pack, f)
    if not fbx_path:
        raise SystemExit(pack + ': no .fbx found')
    pal_path = os.path.join(pack, 'palette.png')
    emi_path = os.path.join(pack, 'paletteEmission.png')
    if not os.path.exists(pal_path):
        raise SystemExit(pack + ': no palette.png - this baker is for palette '
                                'textured kits only, see the header')
    pal = Image.open(pal_path).convert('RGB')
    emi = Image.open(emi_path).convert('RGB') if os.path.exists(emi_path) else None
    PW, PH = pal.size

    ver, root = read_fbx(fbx_path)
    geos = list(walk(root, 'Geometry'))
    # Geometry carries no name; the Model of the same index does. Pairing by
    # order is what the exporter guarantees and is what every reader does.
    models = [m for m in walk(root, 'Model')]
    names = []
    for m in models:
        nm = ''
        for p in m['props']:
            if isinstance(p, str) and p:
                nm = p.split('\x00')[0]
                break
        names.append(nm)

    out = {}
    for gi, g in enumerate(geos):
        k = {x['name']: x for x in g['kids']}
        if 'Vertices' not in k or 'PolygonVertexIndex' not in k:
            continue
        v = k['Vertices']['props'][0]
        idx = k['PolygonVertexIndex']['props'][0]
        polys = polygons(idx)

        uv = uvidx = None
        if 'LayerElementUV' in k:
            uk = {x['name']: x for x in k['LayerElementUV']['kids']}
            if 'UV' in uk:
                uv = uk['UV']['props'][0]
            if 'UVIndex' in uk:
                uvidx = uk['UVIndex']['props'][0]

        cols, emis, norms, faces = [], [], [], []
        pv = 0                     # running polygon-vertex counter, for UVs
        for p in polys:
            # ── the palette lookup, and it is the whole point of this baker ──
            # Sample at the polygon's UV CENTROID rather than at a corner: the
            # swatches are separated by dark gridlines in the atlas and a
            # corner sample lands on the line often enough to matter, which
            # would put a black face in the middle of a wall.
            r = gr = b = 128
            er = eg = eb = 0
            if uv:
                us = vs = 0.0
                for j in range(len(p)):
                    ui = uvidx[pv + j] if uvidx else (pv + j)
                    if ui < 0:
                        continue
                    us += uv[ui * 2]
                    vs += uv[ui * 2 + 1]
                us /= len(p)
                vs /= len(p)
                px = min(PW - 1, max(0, int(us * PW)))
                py = min(PH - 1, max(0, int((1.0 - vs) * PH)))
                r, gr, b = pal.getpixel((px, py))
                if emi:
                    er, eg, eb = emi.getpixel((px, py))
            pv += len(p)
            faces.append(p)
            norms.extend(face_normal(v, p))
            cols.append((r << 16) | (gr << 8) | b)
            emis.append((er << 16) | (eg << 8) | eb)

        nm = names[gi] if gi < len(names) else ('mesh%d' % gi)
        if not nm:
            nm = 'mesh%d' % gi
        out[nm] = {
            'v': [round(x, 4) for x in v],
            'f': faces,
            'n': norms,
            'c': cols,
            'e': emis,
            'role': role_of(nm),
        }
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: city-meshes.py <pack-dir> [--check] [--materials <out.json>]')
    pack = sys.argv[1]
    check = '--check' in sys.argv
    if '--materials' in sys.argv:
        # A directory of untextured single-mesh FBX files, each baked from its
        # own material colours and keyed on its filename.
        dest2 = sys.argv[sys.argv.index('--materials') + 1]
        allm = {}
        for f in sorted(os.listdir(pack)):
            if not f.lower().endswith('.fbx'):
                continue
            got = bake_materials(os.path.join(pack, f))
            stem = os.path.splitext(f)[0]
            if len(got) == 1:
                allm[stem] = list(got.values())[0]
            else:
                for kk, vv in got.items():
                    allm[stem + '/' + kk] = vv
        blob = json.dumps(allm, separators=(',', ':'))
        faces = sum(len(m['f']) for m in allm.values())
        print('meshes %d  faces %d  %.0f kB' % (len(allm), faces, len(blob)/1024))
        if check:
            if not os.path.exists(dest2) or open(dest2).read() != blob:
                print('FAIL: ' + dest2 + ' is stale or missing'); raise SystemExit(1)
            print('city-meshes(materials): green'); raise SystemExit(0)
        os.makedirs(os.path.dirname(dest2), exist_ok=True)
        with open(dest2, 'w') as fh:
            fh.write(blob)
        print('wrote', dest2)
        raise SystemExit(0)
    meshes = bake(pack)
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(here, '..', 'client', 'assets', 'space', 'city',
                        'kit.json')
    faces = sum(len(m['f']) for m in meshes.values())
    verts = sum(len(m['v']) // 3 for m in meshes.values())
    roles = {}
    for m in meshes.values():
        roles[m['role']] = roles.get(m['role'], 0) + 1
    lit = sum(1 for m in meshes.values() if any(e for e in m['e']))
    print('meshes %d  faces %d  verts %d  with emissive %d'
          % (len(meshes), faces, verts, lit))
    print('roles:', json.dumps(roles, sort_keys=True))
    blob = json.dumps(meshes, separators=(',', ':'))
    if check:
        if not os.path.exists(dest):
            print('FAIL: kit.json is not shipped')
            raise SystemExit(1)
        if open(dest).read() != blob:
            print('FAIL: kit.json is stale.  python3 tools/city-meshes.py <pack>')
            raise SystemExit(1)
        print('city-meshes: green')
    else:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w') as f:
            f.write(blob)
        print('wrote', os.path.relpath(dest, os.path.join(here, '..')),
              '%.0f kB' % (len(blob) / 1024))


if __name__ == '__main__':
    main()
