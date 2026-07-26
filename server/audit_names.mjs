#!/usr/bin/env node
// Content audit for player-authored text already sitting in the database.
//
// The creation-path filter added in 1.3.0.0 only guards NEW entries. Anything
// created before it keeps whatever it was called. This walks every authored
// field and REPORTS what fails the filter. It deliberately does not rename
// anything: false positives on real names are common (Scunthorpe, and every
// player whose handle happens to contain a substring), and silently renaming
// somebody's fund would be a worse failure than the thing it fixes.
//
//   node audit_names.mjs                  report against the default DB
//   DB_PATH=/path/to.db node audit_names.mjs
//   node audit_names.mjs --csv > flagged.csv
//
// Exit code is 0 when nothing is flagged, 1 when something is, so it can gate
// a deploy if you ever want it to.

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { containsSlur, normalizeLeet } from './chat-filter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'fleshmarket.db');
const CSV = process.argv.includes('--csv');

// Mirrors isNameClean in server.js. Kept in step by hand; if that list moves,
// move this one.
const BANNED_WORDS = [
  'nigger','nigga','nigg','n1gger','n1gga','faggot','fag','f4g','fagg','retard','retarded',
  'tranny','trannie','kike','spic','wetback','chink','gook','coon','darkie','beaner',
  'towelhead','raghead','sandnigger','zipperhead','cracker','honky',
  'dyke','paki','wog','abo','jap','slant','slope','gypsy','gypsie'
];
function isNameClean(name) {
  const lower = String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
  return !BANNED_WORDS.some(w => lower.includes(w));
}
function isTextClean(text) {
  const t = String(text == null ? '' : text);
  if (!t.trim()) return true;
  if (!isNameClean(t)) return false;
  try { if (!isNameClean(normalizeLeet(t.toLowerCase()))) return false; } catch (_) {}
  try { if (containsSlur(t)) return false; } catch (_) {}
  return true;
}

// Every table and column carrying text a player chose. Add to this list when a
// new authored field ships.
const TARGETS = [
  { table: 'players',        id: 'id',        cols: ['name'],                 label: 'player name' },
  { table: 'funds',          id: 'id',        cols: ['name', 'description'],  label: 'fund' },
  { table: 'city_shops',     id: 'id',        cols: ['name', 'descr'],        label: 'storefront' },
  { table: 'city_districts', id: 'colony_id', cols: ['name'],                 label: 'district' },
];

function tableExists(db, t) {
  try {
    return !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  } catch (_) { return false; }
}
function colExists(db, t, c) {
  try { return db.prepare(`PRAGMA table_info(${t})`).all().some(r => r.name === c); }
  catch (_) { return false; }
}

const db = new DatabaseSync(DB_PATH);
const flagged = [];
let scanned = 0;

for (const target of TARGETS) {
  if (!tableExists(db, target.table)) continue;
  const cols = target.cols.filter(c => colExists(db, target.table, c));
  if (!cols.length) continue;
  const idCol = colExists(db, target.table, target.id) ? target.id : cols[0];
  const rows = db.prepare(`SELECT ${idCol} AS _id, ${cols.join(', ')} FROM ${target.table}`).all();
  for (const row of rows) {
    for (const c of cols) {
      const val = row[c];
      if (val == null || String(val).trim() === '') continue;
      scanned++;
      if (!isTextClean(val)) {
        flagged.push({ label: target.label, table: target.table, id: row._id, column: c, value: String(val) });
      }
    }
  }
}
db.close();

if (CSV) {
  console.log('table,id,column,value');
  for (const f of flagged) {
    console.log([f.table, f.id, f.column, '"' + f.value.replace(/"/g, '""') + '"'].join(','));
  }
} else {
  console.log(`Content audit: ${DB_PATH}`);
  console.log(`Scanned ${scanned} authored text fields across ${TARGETS.length} tables.`);
  if (!flagged.length) {
    console.log('Nothing flagged.');
  } else {
    console.log(`\n${flagged.length} entries need a human decision:\n`);
    for (const f of flagged) {
      console.log(`  [${f.label}] ${f.table}.${f.column}  id=${f.id}`);
      console.log(`     ${JSON.stringify(f.value)}`);
    }
    console.log('\nNothing has been changed. Review each one, then rename by hand.');
    console.log('Expect false positives: real words contain other words.');
  }
}
process.exit(flagged.length ? 1 : 0);
