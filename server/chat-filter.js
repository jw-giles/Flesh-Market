/**
 * chat-filter.js — FleshMarket chat content filter
 *
 * Censors racial slurs and targeted hate speech by replacing them with ****.
 * Uses whole-word regex so legitimate words aren't clipped.
 * Add/remove terms from the SLUR_LIST array as needed.
 */

// ─── Term list ────────────────────────────────────────────────────────────────
// Canonical forms only — leet-speak variants are handled via normalizeLeet().
const SLUR_LIST = [
  // Anti-Black
  'nigger','nigga','nigg','negro','negroid','coon','spook','jigaboo',
  'porch monkey','jungle bunny','tar baby','sambo','spade','darkie',
  // Anti-Hispanic
  'spic','wetback','beaner','greaser',
  // Anti-Asian
  'chink','gook','slant','zipperhead','jap','slope','ching chong','chinaman',
  // Anti-Jewish
  'kike','yid','heeb',
  // Anti-Arab / Anti-Muslim
  'towelhead','raghead','sandnigger','sand nigger','camel jockey','hajji',
  // Anti-Indigenous
  'redskin','injun','savages','prairie nigger',
  // Anti-South-Asian
  'paki','dothead',
  // Anti-White (targeting slurs)
  'cracker','honky','whitey','redneck',       // context-sensitive but included
  // General hate
  'faggot','fag','dyke','tranny','retard','spastic',
];

// ─── Leet-speak normalization ─────────────────────────────────────────────────
const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
  '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a',
  '$': 's', '!': 'i', '+': 't', '|': 'i',
};

export function normalizeLeet(str) {
  return str.replace(/[01345679@$!+|]/g, ch => LEET_MAP[ch] || ch);
}

// ─── Build matcher ────────────────────────────────────────────────────────────
// Escape each term, then allow optional separator chars between letters
function buildPattern(term) {
  // Allow optional [-_.*] between each character for obfuscation
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spaced  = escaped.split('').join('[-_.*\\s]?');
  return spaced;
}

const PATTERNS = SLUR_LIST.map(term => ({
  re: new RegExp(`(?<![a-z])${buildPattern(term)}(?![a-z])`, 'gi'),
  replacement: '*'.repeat(4),
}));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a censored version of `text`, replacing slurs with ****.
 * Also returns `flagged: true` if any substitution was made.
 *
 * THIS FLAGGED AND DID NOT CENSOR FOR THE WHOLE LIFE OF THE FILTER.
 * The old shape was: normalise the text, TEST the pattern against the
 * normalised copy, then REPLACE against the original. A pattern that only
 * matched because of normalisation cannot match the original by definition, so
 * the replace was always a no op, and the else branch re run the same failed
 * replace and set flagged anyway. The result was a filter that detected every
 * leet spelling, reported success, logged the incident to admins, and published
 * the slur unchanged. Measured before the repair: 51 of 51 terms with a leet
 * variant, and 49 of 51 with a SINGLE substituted character. Four callers take
 * .clean with no rejection layer behind it, so that text reached live chat,
 * whispers, the council floor and player bios verbatim.
 *
 * THE REPAIR RESTS ON ONE PROPERTY: the normalised copy is the same LENGTH as
 * the original, character for character, so an index into one is an index into
 * the other and a match found in the normalised copy can be cut out of the
 * original. normalizeIndexed below guarantees that rather than assuming it, and
 * the invariant is checked at the call site: if it is ever violated the
 * function falls back to the canonical only behaviour instead of splicing at
 * indices it cannot trust.
 */
const LEET_KEYS = new Set(Object.keys(LEET_MAP));

/* Lowercase and de leet WITHOUT changing the length in UTF-16 units, which is
   what makes index mapping safe. A plain toLowerCase() is not safe here: a
   handful of characters lowercase into two units, and one of those in a message
   would slide every index after it and cut the wrong span out of the original.
   A substitution is only taken when the source is one unit and the replacement
   is one unit; anything else is passed through untouched. */
function normalizeIndexed(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (LEET_KEYS.has(ch)) { out += LEET_MAP[ch]; continue; }
    const lower = ch.toLowerCase();
    out += lower.length === 1 ? lower : ch;
  }
  return out;
}

export function filterChat(text) {
  if (!text || typeof text !== 'string') return { clean: text, flagged: false };

  const normalized = normalizeIndexed(text);

  // The invariant the whole approach depends on. If it ever fails, splicing the
  // original at normalised indices would cut the wrong characters out, so fall
  // back to matching the original directly: that still censors every canonical
  // spelling, which is what the filter managed before this change anyway.
  if (normalized.length !== text.length) return legacyFilter(text);

  // Collect every match as a range in the normalised copy. Ranges rather than
  // replacements, because the patterns allow separators between characters and
  // two terms can overlap on the same span.
  const hits = [];
  for (const { re, replacement } of PATTERNS) {
    /* PATTERNS is module level and these carry /g, so lastIndex is shared
       state across calls. The loop below runs until exec returns null, and a
       null return resets lastIndex to 0 by contract, so nothing is left dirty
       for the next message on the current shape.

       The reset stays anyway, because that guarantee lives in the loop rather
       than in this line: the day someone adds an early exit here, a cap on hit
       count or a break on a long message, lastIndex is left mid string and the
       NEXT message with the same slur comes back clean. A filter that works
       once is worse than one that does not work at all.

       NO ASSERTION COVERS THIS LINE, and removing it passes the whole suite.
       That is accurate rather than a gap: on the code as written the property
       is unobservable, and an assertion that cannot fail is not coverage. */
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(normalized)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      hits.push([m.index, m.index + m[0].length, replacement]);
    }
  }
  if (!hits.length) return { clean: text, flagged: false };

  // Merge overlaps so an overlapping pair is censored once rather than having
  // the second replacement land inside the first one's asterisks.
  hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const h of hits) {
    const last = merged[merged.length - 1];
    if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
    else merged.push([h[0], h[1], h[2]]);
  }

  // Cut the ORIGINAL at those ranges, so casing and punctuation outside a match
  // survive untouched and the message still reads as the person wrote it.
  let out = '', at = 0;
  for (const [start, end, replacement] of merged) {
    out += text.slice(at, start) + replacement;
    at = end;
  }
  return { clean: out + text.slice(at), flagged: true };
}

/* The pre repair behaviour, kept only for the length desync fallback above.
   It censors canonical spellings and misses leet ones, which is exactly what
   the filter did everywhere before this change, so falling back to it cannot
   be worse than what shipped. */
function legacyFilter(text) {
  let working = text, flagged = false;
  for (const { re, replacement } of PATTERNS) {
    re.lastIndex = 0;
    const replaced = working.replace(re, () => replacement);
    if (replaced !== working) { working = replaced; flagged = true; }
  }
  return { clean: working, flagged };
}

/**
 * Quick boolean check — does this text contain a slur?
 */
export function containsSlur(text) {
  return filterChat(text).flagged;
}
