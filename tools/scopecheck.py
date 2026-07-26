# -*- coding: utf-8 -*-
# The check that would have caught the comZ regression: galaxy.js is three
# sibling IIFEs, so a bare identifier declared in one is invisible in another.
# For every line this release changed, resolve each bare identifier against the
# declarations of its OWN IIFE plus globals. Anything else is a ReferenceError
# waiting for a click.
import io, re, sys, difflib

ORIG = '/home/claude/orig/Flesh-Market-main/client/assets/galaxy.js'
NEW = '/home/claude/fm/Flesh-Market-main/client/assets/galaxy.js'

orig = io.open(ORIG, encoding='utf-8').read().split('\n')
new = io.open(NEW, encoding='utf-8').read().split('\n')

# changed/added line numbers in the new file
changed = []
sm = difflib.SequenceMatcher(None, orig, new, autojunk=False)
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag in ('replace', 'insert'):
        changed.extend(range(j1 + 1, j2 + 1))

# IIFE ranges: top-level "(function(){" ... "})();" at column 0
opens, ranges = [], []
for n, l in enumerate(new, 1):
    if re.match(r'^\(function\s*\(', l):
        opens.append(n)
    elif re.match(r'^\}\)\(\);?', l) and opens:
        ranges.append((opens.pop(), n))
ranges.sort()

def iife_of(line):
    best = None
    for a, b in ranges:
        if a <= line <= b and (best is None or (b - a) < (best[1] - best[0])):
            best = (a, b)
    return best

DECL = re.compile(r'\b(?:var|let|const|function)\s+([A-Za-z_$][\w$]*)')
PARAMS = re.compile(r'function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)')

def decls_in(a, b):
    out = set()
    for l in new[a - 1:b]:
        out.update(DECL.findall(l))
        for grp in PARAMS.findall(l):
            out.update(x.strip() for x in grp.split(',') if x.strip())
        out.update(re.findall(r'\bcatch\s*\(\s*([\w$]+)', l))
        out.update(re.findall(r'\bfor\s*\(\s*(?:var|let|const)\s+([\w$]+)', l))
    return out

GLOBALS = set('''window document console Math JSON Object Array String Number Boolean Date RegExp
Error Promise Set Map WeakMap Symbol parseInt parseFloat isNaN isFinite encodeURIComponent
decodeURIComponent setTimeout clearTimeout setInterval clearInterval requestAnimationFrame
cancelAnimationFrame fetch localStorage location navigator alert confirm prompt SVGElement
Image Audio CustomEvent Event XMLHttpRequest URL Blob FileReader performance structuredClone
true false null undefined this new typeof instanceof in of return if else for while do switch
case break continue function var let const try catch finally throw delete void class extends
super yield await async default export import'''.split())

KEY = re.compile(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*(?=\()')  # called identifiers only

problems = []
for ln in changed:
    line = new[ln - 1]
    code = re.sub(r'//.*$', '', line)
    code = re.sub(r"'(\\.|[^'\\])*'", "''", code)
    code = re.sub(r'"(\\.|[^"\\])*"', '""', code)
    rng = iife_of(ln)
    if not rng:
        continue
    scope = decls_in(*rng) | GLOBALS
    for ident in KEY.findall(code):
        if ident in scope:
            continue
        problems.append((ln, ident, line.strip()[:90]))

if problems:
    print('CROSS-SCOPE RISK:')
    for ln, ident, txt in problems:
        print('  line %d: %s()  in  %s' % (ln, ident, txt))
    sys.exit(1)
print('scope check clean: %d changed lines across %d IIFEs' % (len(changed), len(ranges)))
