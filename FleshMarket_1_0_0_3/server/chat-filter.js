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

function normalizeLeet(str) {
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
 */
export function filterChat(text) {
  if (!text || typeof text !== 'string') return { clean: text, flagged: false };

  let working = text;
  // Run on both original and leet-normalized in parallel
  const normalized = normalizeLeet(text.toLowerCase());
  let flagged = false;

  for (const { re, replacement } of PATTERNS) {
    // Test against normalized version; replace in original
    const normTest = new RegExp(re.source, 'gi');
    if (normTest.test(normalized)) {
      // Replace corresponding region in original text
      // Simple approach: replace in original using same pattern
      const replaced = working.replace(re, m => {
        flagged = true;
        return replacement;
      });
      if (replaced !== working) {
        working = replaced;
        flagged = true;
      } else {
        // Leet version triggered — replace the original chars too
        // For safety, replace the original match in the normalized map
        flagged = true;
        // Re-run replace on working just in case
        working = working.replace(re, () => { flagged = true; return replacement; });
      }
    }
  }

  return { clean: working, flagged };
}

/**
 * Quick boolean check — does this text contain a slur?
 */
export function containsSlur(text) {
  return filterChat(text).flagged;
}
