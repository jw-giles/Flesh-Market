#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# terrain-synth.py — generates ground patches from nothing but numbers.
#
#     python3 tools/terrain-synth.py            # writes the patches
#     python3 tools/terrain-synth.py --check    # verifies the shipped ones
#
# WHY THIS EXISTS ALONGSIDE terrain-patches.py, WHICH ALREADY BAKES PATCHES.
# terrain-patches.py bakes from the CODESPREE tile pack, and that pack has two
# problems this repo has been carrying for a while. The first is in
# ATTRIBUTION.txt: the licence is UNREAD, so the derived patches are unlicensed
# rather than permissive, and that file says in as many words to treat the
# directory as unshippable. The second is smaller and more immediate: THERE IS
# NO GRASS IN IT. The recipe has sand, gravel, basalt, snow, water and clay. A
# Coalition garden world has been drawing its fields with `dust_base` tinted
# green, which is gravel wearing a costume, and that is most of why the ground
# reads flat no matter what is done to the palette on top of it.
#
# Everything here is arithmetic. No source art, no pack, no licence question,
# nothing to resolve before it ships. It is also the only way to get a patch
# that is actually GRASS rather than a stone tile with the hue moved.
#
# SEAMLESS BY CONSTRUCTION, NOT BY BLENDING. Every octave is a lattice whose
# period divides the image, so the wrap is exact rather than cross-faded. A
# blended seam is visible as a soft band once the pattern is tiled at forty
# metres and looked at down a street.
#
# THE RANGE IS DELIBERATELY WIDE. Measured, the tinted dust patch spans
# luminance 41 to 65 - a 24-value range - which is why a plain reads as a flat
# mat however much fine noise is on it. These are authored with roughly twice
# that spread, so the crush in buildPatterns has something left to crush.
# ═══════════════════════════════════════════════════════════════════════════
import hashlib
import os
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   '..', 'client', 'assets', 'space', 'terrain')
SIZE = 512


def rng(seed):
    return np.random.default_rng(seed)


def lattice(period, seed, size=SIZE):
    """One octave of value noise on a wrapping lattice.

    The lattice is `period` cells across and the corner values are indexed
    modulo `period`, so the right edge interpolates back into the left. That is
    what makes the tile seamless without any blending pass.
    """
    r = rng(seed)
    g = r.random((period, period)).astype(np.float32)
    # smoothstep interpolation: cheaper than cubic and has no overshoot, which
    # matters because overshoot clips and clipping is visible as flat patches
    t = (np.arange(size, dtype=np.float32) * period / size)
    i0 = np.floor(t).astype(np.int32) % period
    i1 = (i0 + 1) % period
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i0, i0)] * (1 - f)[None, :] + g[np.ix_(i0, i1)] * f[None, :]
    b = g[np.ix_(i1, i0)] * (1 - f)[None, :] + g[np.ix_(i1, i1)] * f[None, :]
    return a * (1 - f)[:, None] + b * f[:, None]


def fbm(octaves, seed, size=SIZE):
    """Sum of lattices at doubling period and halving amplitude."""
    out = np.zeros((size, size), dtype=np.float32)
    amp, tot = 1.0, 0.0
    for k, period in enumerate(octaves):
        out += lattice(period, seed + k * 7919, size) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def blades(count, seed, size=SIZE, length=9, spread=0.55):
    """Short directional strokes, wrapped.

    A GRASS TILE IS NOT NOISE. Noise gives you dirt with variation in it; what
    makes a field read as a field is that it is covered in thousands of small
    ALIGNED objects, and that alignment drifts slowly across the surface. So
    the strokes take their direction from a low frequency field rather than
    from a uniform random draw: neighbouring blades lean the same way, and the
    lean changes over a few metres, exactly as grass lies.
    """
    r = rng(seed)
    img = np.zeros((size, size), dtype=np.float32)
    lean = fbm([2, 4], seed ^ 0x51DE, size) * 2 * np.pi
    xs = r.integers(0, size, count)
    ys = r.integers(0, size, count)
    lens = r.integers(max(2, length // 2), length + 1, count)
    jitter = (r.random(count).astype(np.float32) - 0.5) * spread
    val = 0.35 + r.random(count).astype(np.float32) * 0.65
    for n in range(count):
        x0, y0 = int(xs[n]), int(ys[n])
        ang = float(lean[y0, x0]) + float(jitter[n])
        dx, dy = np.cos(ang), np.sin(ang)
        L = int(lens[n])
        # taper the stroke so a blade has a tip rather than a blunt end
        for s in range(L):
            x = int(round(x0 + dx * s)) % size
            y = int(round(y0 + dy * s)) % size
            img[y, x] = max(img[y, x], val[n] * (1.0 - s / (L + 1.0)))
    return img


def norm(a, lo=0.0, hi=1.0):
    mn, mx = float(a.min()), float(a.max())
    if mx - mn < 1e-6:
        return np.full_like(a, (lo + hi) * 0.5)
    return lo + (a - mn) / (mx - mn) * (hi - lo)


def grass_base(seed):
    """Turf seen from above.

    Three scales, and each is doing a nameable job:
      clumps   where the sward is thick and where it is thin
      blades   the aligned strokes that make it grass and not dirt
      speck    fine break-up so it does not band at close range
    """
    clumps = fbm([2, 4, 8], seed ^ 0xC10B)
    speck = fbm([64, 128], seed ^ 0x50EC)
    bl = blades(26000, seed ^ 0xB1AD, length=10)
    bl2 = blades(12000, seed ^ 0xB1AE, length=5)
    a = (0.34 + clumps * 0.42)
    a = a + (bl * 0.30 + bl2 * 0.18) * (0.55 + clumps * 0.75)
    a = a + (speck - 0.5) * 0.10
    # A few bare scrapes: turf is never total, and the scrapes are what stop it
    # reading as carpet.
    bare = fbm([3, 6], seed ^ 0xBA7E)
    a = a * (1.0 - np.clip((bare - 0.72) * 3.0, 0, 1) * 0.55)
    return norm(a, 0.10, 0.94)


def grass_rock(seed):
    """The second pass: coarser, used at a larger tile for broad variation.

    Same material, LOWER frequency and LESS blade. It is not stone here - on a
    grass world the `_rock` slot is the tussock and bare-earth layer that the
    base patch is modulated against, which is why it is generated from the same
    ingredients rather than from a different one.
    """
    coarse = fbm([2, 3, 6], seed ^ 0x0C0A)
    bl = blades(9000, seed ^ 0x7055, length=14, spread=0.9)
    earth = fbm([16, 32], seed ^ 0xEA27)
    a = 0.30 + coarse * 0.55 + bl * 0.22 + (earth - 0.5) * 0.14
    return norm(a, 0.08, 0.92)


PATCHES = {
    'grass_base': grass_base,
    'grass_rock': grass_rock,
}


def build():
    out = {}
    for name, fn in sorted(PATCHES.items()):
        seed = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)
        a = np.clip(fn(seed), 0, 1)
        out[name + '.png'] = Image.fromarray((a * 255).astype(np.uint8), 'L')
    return out


def seam_error(im):
    """How far the tile is from wrapping. Zero is exact; this asserts it."""
    a = np.asarray(im, dtype=np.float32)
    # difference across the wrap, against the difference one column in, so a
    # naturally busy texture does not read as a seam
    wrap = np.abs(a[:, 0] - a[:, -1]).mean()
    inner = np.abs(a[:, 1] - a[:, 0]).mean()
    wrap_v = np.abs(a[0, :] - a[-1, :]).mean()
    inner_v = np.abs(a[1, :] - a[0, :]).mean()
    return max(wrap / max(inner, 1e-3), wrap_v / max(inner_v, 1e-3))


def main():
    check = '--check' in sys.argv
    files = build()
    bad = 0
    for name, im in files.items():
        path = os.path.join(OUT, name)
        a = np.asarray(im, dtype=np.float32)
        se = seam_error(im)
        print('%-16s mean %.3f  range %d-%d  seam x%.2f'
              % (name, a.mean() / 255, a.min(), a.max(), se))
        # A seamless tile's wrap difference should be indistinguishable from an
        # ordinary neighbouring-column difference. Anything past 1.5 is a seam
        # you will see once it is tiled down a street.
        if se > 1.5:
            print('   FAIL: visible seam'); bad = 1
        if a.max() - a.min() < 140:
            print('   FAIL: range too narrow, it will read flat'); bad = 1
        if check:
            if not os.path.exists(path):
                print('   FAIL: not shipped'); bad = 1
            else:
                have = np.asarray(Image.open(path).convert('L'))
                if not np.array_equal(have, np.asarray(im)):
                    print('   FAIL: shipped copy differs from the generator'); bad = 1
        else:
            im.save(path)
            print('   wrote', os.path.relpath(path))
    raise SystemExit(1 if bad else 0)


if __name__ == '__main__':
    main()
