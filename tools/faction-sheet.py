#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════════════════
# faction-sheet.py  ->  tools/out/faction-sheet.png
#
# EVERY FACTION AGAINST EVERY CLASS, ON ONE IMAGE, SO COLOUR CAN BE ARGUED
# ABOUT RATHER THAN DESCRIBED.
#
# The recolour is judged three ways today and none of them is looking at it:
# faction-check drives the grade and asserts a luminance spread, the bench
# parades five figures at 2.6x, and the battlefield draws them at twenty pixels
# through haze. The first is a number, the second needs a browser and a server,
# and the third is where a mistake is least visible. A contact sheet is the
# missing one.
#
# ── THE THING THIS FILE IS MOST AT RISK OF ────────────────────────────────
# BEING A SECOND RECOLOUR ENGINE. coalition-sprites.js owns tinted(); if the
# numbers or the arithmetic were retyped here, this sheet would eventually show
# a game that does not exist - which is the exact failure that made the battle
# bench worthless for three patches running.
#
# So: every number is EXTRACTED from client/assets/factions.js at run time, and
# the arithmetic is a direct transcription of the pixel loop in tinted(), kept
# to the same order of operations. tools/faction-check.mjs asserts the two agree
# on real pack colours. It is still a transcription and that is still a risk;
# what it is not is a place where a colour can be chosen.
#
#   python3 tools/faction-sheet.py
# ══════════════════════════════════════════════════════════════════════════
import json
import os
import re
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit('needs pillow: pip install pillow --break-system-packages')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACS = os.path.join(ROOT, 'client/assets/factions.js')
TROOPS = os.path.join(ROOT, 'client/assets/space/troops')
VEH = os.path.join(ROOT, 'client/assets/space/vehicles')
OUT = os.path.join(ROOT, 'tools/out/faction-sheet.png')


# ── Lifting the tables ────────────────────────────────────────────────────
# By brace matching, the same way the bench manifest lifts COLONY_PLANET out of
# galaxy.js. A regex per field would need one per field and would break on the
# first reordering.
def lift(src, decl, open_ch='{', close_ch='}'):
    i = src.index(decl)
    start = src.index(open_ch, i)
    d = 0
    for k in range(start, len(src)):
        if src[k] == open_ch:
            d += 1
        elif src[k] == close_ch:
            d -= 1
            if d == 0:
                return src[start:k + 1]
    raise ValueError('unbalanced ' + decl)


def js_obj(text):
    """The registry is hand-written JS, not JSON: unquoted keys, trailing
    commas, comments, and one \\u escape in a faction name. Normalised rather
    than parsed properly, because a real JS parser is a dependency and this
    only has to read a table whose shape is asserted elsewhere."""
    t = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    # TRAILING comments too, not just whole-line ones. The registry annotates
    # values in place - `dim: [143, 96, 26] },   // enforcer faceplate` - and a
    # line-start-only strip leaves those behind, which is what broke the first
    # run. No string in these tables contains '//', so this is safe here and
    # would not be in a file with URLs.
    t = re.sub(r'//[^\n]*', '', t)
    t = re.sub(r'(?m)([{,]\s*)([A-Za-z_][\w]*)\s*:', r'\1"\2":', t)
    t = re.sub(r",(\s*[}\]])", r"\1", t)
    t = t.replace("\\u2019", "\u2019")
    t = re.sub(r"'([^']*)'", r'"\1"', t)
    return json.loads(t)


src = open(FACS, encoding='utf-8').read()
FACTIONS = js_obj(lift(src, 'var FACTIONS = '))
OPTIC_SRC = js_obj(lift(src, 'var OPTIC_SRC = ', '[', ']'))
ACCENT_SRC = js_obj(lift(src, 'var ACCENT_SRC = ', '[', ']'))
SKIN_TONES = js_obj(lift(src, 'var SKIN_TONES = ', '[', ']'))
STEEL_TONE = js_obj(lift(src, 'var STEEL_TONE = ', '[', ']'))
SKIN_POLICY = js_obj(lift(src, 'var SKIN_POLICY = '))


def spread(i, salt, n):
    # A STRIDE IS NOT A SPREAD. Transcribed from factions.js: `(i*7+3) % len`
    # collapses the moment a pool length shares a factor with the multiplier,
    # and the merc pool is 7 long - two hundred men, one face. A hash has no
    # relationship to the modulus, so any pool length spreads.
    if n <= 0:
        return 0
    m32 = 0xFFFFFFFF
    h = (i + salt * 0x9E3779B1) & m32
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & m32
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & m32
    h ^= h >> 16
    # JS does the modulo on a SIGNED 32-bit value, so match the sign before
    # wrapping or half the indices land on a different bucket than the game.
    sh = h - 0x100000000 if h >= 0x80000000 else h
    return ((sh % n) + n) % n


# ── The recolour, transcribed from tinted() ───────────────────────────────
# Order of operations matters and is the whole reason this is a transcription
# and not a reimplementation: the accent remap runs BEFORE the grade and skips
# the pixel entirely, the camo split is decided on RAW luminance before the
# lift, and `keep` reads whichever grade is actually in force.
def skin_for(fac, i):
    pool = SKIN_POLICY.get(FACTIONS[fac].get('skin') or 'none', [])
    if not pool:
        return None
    return pool[spread(i, 1, len(pool))]


def kit_count(fac):
    return len(FACTIONS[fac].get('kits') or [])


def kit_for(fac, i):
    # -1 means "wear the row's own tint", which is every faction that issues
    # uniforms. A different salt from skin, or tone would lock to kit and the
    # line would read as five squads rather than as forty individuals.
    n = kit_count(fac)
    return -1 if not n else spread(i, 2, n)


def tint_for(fac, kit):
    # A faction that issues kit wears its row tint; one that does not wears
    # whatever this particular soldier turned up in.
    row = FACTIONS[fac]
    kits = row.get('kits') or []
    if kits and kit >= 0:
        return kits[kit % len(kits)]
    return row.get('tint')


def tone_at(idx):
    return STEEL_TONE if idx == -1 else (SKIN_TONES[idx] if idx is not None else None)


def remap_for(fac, augmented):
    row = FACTIONS[fac]
    m = {}
    want_optic = row.get('optic') and (
        row.get('opticOn') == 'all' or (row.get('opticOn') == 'augmented' and augmented))
    if want_optic:
        for o in OPTIC_SRC:
            m[tuple(o['lit'])] = row['optic']['lit']
            m[tuple(o['dim'])] = row['optic']['dim']
    if row.get('accent'):
        for a in ACCENT_SRC:
            m[tuple(a['lit'])] = row['accent']['lit']
            m[tuple(a['dim'])] = row['accent']['dim']
    return m


AUGMENTED = ('enforcer', 'engineer')
HAS_SKIN = ('assault', 'engineer')


def tint(im, fac, name, skin_idx, kit_idx=-1):
    row = FACTIONS.get(fac)
    if not row:
        return im
    t, sp = tint_for(fac, kit_idx), row.get('split')
    hull = row.get('hull') if name.startswith('hound') else None
    aug = name.startswith(AUGMENTED)
    rmap = remap_for(fac, aug)
    tone = tone_at(skin_idx) if name.startswith(HAS_SKIN) else None
    src_hi, src_lo = SKIN_TONES[0][0], SKIN_TONES[0][1]

    if not t and not hull and not rmap and not tone:
        return im
    out = im.copy()
    px = out.load()
    W, H = out.size
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if rmap:
                rep = rmap.get((r, g, b))
                if rep:
                    px[x, y] = (rep[0], rep[1], rep[2], a)
                    continue
            if tone:
                if (r, g, b) == tuple(src_hi):
                    px[x, y] = (tone[0][0], tone[0][1], tone[0][2], a); continue
                if (r, g, b) == tuple(src_lo):
                    px[x, y] = (tone[1][0], tone[1][1], tone[1][2], a); continue
            grade = hull or t
            if not grade:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            tt = sp if (sp and not hull and lum < sp['at']) else grade
            l = lum
            if tt.get('lift'):
                l = l + (255 - l) * tt['lift']
            nr, ng, nb = l * tt['r'], l * tt['g'], l * tt['b']
            if tt.get('keep'):
                k = tt['keep']
                nr += (r - nr) * k
                ng += (g - ng) * k
                nb += (b - nb) * k
            px[x, y] = (min(255, int(nr)), min(255, int(ng)), min(255, int(nb)), a)
    return out


# ── The sheet ─────────────────────────────────────────────────────────────
# One row per faction, one column per class, at a size a colour can be argued
# about. The classes are the ones that carry the channels: the enforcer has BOTH
# the faceplate the optic burns and the shield panel the accent marks, the
# engineer has the wrist device, the assault has skin and goggles, the Hound is
# the only thing the hull grade touches.
CELLS = [
    ('assault_idle', 'ASSAULT', 0),
    ('assault_idle', 'ASSAULT', 2),
    ('enforcer_shielded_idle', 'SHIELD', 0),
    ('enforcer_idle', 'ENFORCER', 0),
    ('engineer_idle', 'ENGINEER', 0),
    ('engineer_idle', 'ENGINEER', 4),
    ('turret_idle', 'TURRET', 0),
    ('hound_walk', 'HOUND', 0),
]
SCALE = 3
PAD = 10
LABEL_W = 88
HEAD_H = 20


def first_frame(name):
    """Sheets are horizontal strips of square-ish frames. The cell height is the
    image height and the frame width equals it for the troop pack; the Hound is
    drawn at a finer pitch so its frames are wider. Taken from the file rather
    than from a table, so a re-export cannot silently shift every crop."""
    d = VEH if name.startswith('hound') else TROOPS
    p = os.path.join(d, name + '.png')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGBA')
    W, H = im.size
    fw = H if W >= H else W
    return im.crop((0, 0, min(fw, W), H))


frames = [(n, lab, sk, first_frame(n)) for n, lab, sk in CELLS]
missing = [n for n, _, _, f in frames if f is None]
if missing:
    print('missing sheets, cells will be blank: ' + ', '.join(sorted(set(missing))))
frames = [f for f in frames if f[3] is not None]
if not frames:
    sys.exit('no troop sheets found under ' + TROOPS)

cw = max(f[3].width for f in frames) * SCALE + PAD
ch = max(f[3].height for f in frames) * SCALE + PAD
# The brood has no kit and takes no uniform, so it is not a row here.
facs = [f for f in FACTIONS if not FACTIONS[f].get('brood')]

W = LABEL_W + cw * len(frames) + PAD
H = HEAD_H + ch * len(facs) + PAD
sheet = Image.new('RGBA', (W, H), (14, 14, 12, 255))
dr = ImageDraw.Draw(sheet)

for ci, (name, lab, sk, fr) in enumerate(frames):
    x = LABEL_W + ci * cw
    dr.text((x + 4, 6), lab + ('' if sk == 0 else ' t%d' % sk), fill=(120, 118, 108))

for ri, fac in enumerate(facs):
    y = HEAD_H + ri * ch
    row = FACTIONS[fac]
    line = row.get('line') or [136, 136, 136]
    dr.rectangle([0, y, 3, y + ch - 4], fill=tuple(line))
    dr.text((8, y + 6), row.get('short', fac.upper()), fill=tuple(line))
    dr.text((8, y + 20), row.get('skin', '?'), fill=(96, 94, 86))
    dr.text((8, y + 32), 'optic ' + str(row.get('opticOn')), fill=(96, 94, 86))
    if row.get('split'):
        dr.text((8, y + 44), 'camo split', fill=(96, 94, 86))
    for ci, (name, lab, sk, fr) in enumerate(frames):
        idx = skin_for(fac, sk) if name.startswith(HAS_SKIN) else None
        cell = tint(fr, fac, name, idx, kit_for(fac, sk))
        cell = cell.resize((cell.width * SCALE, cell.height * SCALE), Image.NEAREST)
        sheet.alpha_composite(cell, (LABEL_W + ci * cw + PAD // 2, y + PAD // 2))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
sheet.save(OUT)
print('wrote %s  (%dx%d, %d factions x %d cells)' % (OUT, W, H, len(facs), len(frames)))

# ── A SECOND SHEET, FOR THE FACTION THAT HAS NO UNIFORM ───────────────────
# One cell per faction is the right density for five armies and the wrong one
# for a mercenary company: the Syndicate's whole point is that its men do NOT
# match, and a single sample of a five-kit, seven-tone faction shows one of
# thirty-five possibilities and tells you nothing about the other thirty-four.
#
# So any faction with `kits` also gets a squad sheet: consecutive soldier
# indices, exactly as seedField hands them out, so this is the line as it will
# actually stand rather than a curated selection of the nicest pairs.
def squad_sheet(fac, n=16):
    row = FACTIONS[fac]
    cells = [('assault_idle', 'ASSAULT'), ('enforcer_shielded_idle', 'SHIELD'),
             ('engineer_idle', 'ENGINEER')]
    fr = {c[0]: first_frame(c[0]) for c in cells}
    fr = {k: v for k, v in fr.items() if v is not None}
    if not fr:
        return None
    cwid = max(v.width for v in fr.values()) * SCALE + 6
    chei = max(v.height for v in fr.values()) * SCALE + 6
    Wq = 54 + cwid * n
    Hq = 18 + chei * len(fr)
    img = Image.new('RGBA', (Wq, Hq), (14, 14, 12, 255))
    d = ImageDraw.Draw(img)
    d.text((6, 4), row.get('short', fac.upper()) + '  SQUAD  soldiers 0-' + str(n - 1)
           + '   ' + str(kit_count(fac)) + ' kits x '
           + str(len(SKIN_POLICY.get(row.get('skin') or 'none', []))) + ' tones',
           fill=(150, 146, 134))
    for ri, (name, lab) in enumerate([c for c in cells if c[0] in fr]):
        y = 18 + ri * chei
        d.text((6, y + 6), lab, fill=(110, 108, 100))
        for i in range(n):
            idx = skin_for(fac, i) if name.startswith(HAS_SKIN) else None
            cell = tint(fr[name], fac, name, idx, kit_for(fac, i))
            cell = cell.resize((cell.width * SCALE, cell.height * SCALE), Image.NEAREST)
            img.alpha_composite(cell, (54 + i * cwid, y))
            if ri == 0:
                d.text((54 + i * cwid + 2, Hq - 12),
                       'k%d t%s' % (kit_for(fac, i), 'A' if idx == -1 else str(idx)),
                       fill=(90, 88, 80))
    return img


for fac in facs:
    if not kit_count(fac):
        continue
    q = squad_sheet(fac)
    if q is None:
        continue
    qp = os.path.join(os.path.dirname(OUT), fac + '-squad.png')
    q.save(qp)
    print('wrote %s  (%dx%d)' % (qp, q.width, q.height))
