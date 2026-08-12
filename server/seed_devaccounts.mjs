/**
 * seed_devaccounts.mjs
 * Seeds the active dev/admin accounts and retires the decommissioned ones.
 * Plaintext passwords are NOT stored here - only salted PBKDF2-SHA512 hashes.
 * Idempotent: safe to re-run.
 * Usage: node seed_devaccounts.mjs
 */

import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import url  from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH   = process.env.DB_PATH || path.join(__dirname, 'fleshmarket.db');

// ─── Pre-hashed credentials (PBKDF2-SHA512, 100k iterations, unique salts) ───
// Plaintext passwords are stored separately by the server owner ONLY.
// Do NOT add plaintext passwords here.

// is_prime = true  →  owner account (deep-orange ★, not the ⚙ dev badge)
// is_prime = false →  regular dev/admin (⚙ blue badge)
const DEV_ACCOUNTS = [
  {
    name:          'MrFlesh',
    password_hash: 'bbb8f2aee95ac6fce34f3f295bf4cf448faaa2b5908f156e93f9c257d2a4cbba050bf1ba8f4881ce5fedb2fc6f04f01a94fdfbb8d6844bfcbaee99324780aa69',
    password_salt: 'd0fb81bed5c9b1ca26fc41315042df70',
    is_prime:      true,   // owner — joins FLSH + Merchants Guild, shown as ★ deep orange
  },
  {
    name:          'DEV-SMASHER',
    password_hash: 'c39ae1079e8c18ccaca19fffc0f214c3f804e37ae84ed4926e604ed1b1dda4374e482e00de65ea5a6233421fa06e91e10d5a8354dbb6917920237663e2d20c4a',
    password_salt: 'c0ac22304438fb6dcd46eba79605ce81',
  },
];

// ─── Retired accounts ─────────────────────────────────────────────────────────
// Former collaborators. The player rows are KEPT (deleting them trips the
// non-cascading foreign keys on fund_proposals.proposer_id, fund_votes.player_id
// and funds.owner_id, and orphans their trade and chat history), but every
// privilege is stripped and the login is permanently sealed.
//
// password_hash below is 64 bytes of random data, not the hash of any password.
// No plaintext exists that produces it, so these accounts cannot be logged into
// by anyone, including the owner. To revive one, re-issue a real hash.
const RETIRED_ACCOUNTS = [
  { name: 'DEV-FIXER',
    password_hash: 'f84946325ff7d135d01faf951bd08fa8eb0d181aea41515dd98452b4d062f2306f60389d1f85d4a4d8784faf5b14ad4c849f0fc27283c11e8dc447f8477b68ab',
    password_salt: 'd72334048927e5a658987c13119c215f' },
  { name: 'DEV-SLUT',
    password_hash: '82a110a3fc3a85d7c65251cc8dbe7060529cde1f2077ee90b0a2c078287177e42882eaa9d4429ce48c1e012631c3d7857d6b2a67d47960a6072dcc8ca188894e',
    password_salt: '4ed217bef32ce690f3d0acafaafbc349' },
  { name: 'DEV-GURU',
    password_hash: 'eb03246cac020a386839defcf4d0e8bc2446a3bd4121320bda5d9c01fb3685ad443451fb3dae1761a4f308cbbb373443220a141d8e7fea729ed2abd7dfe9e363',
    password_salt: 'c87525054219d7c60c1af2aade579202' },
  { name: 'DEV-PEAK',
    password_hash: '99ec9e0a7c733f835c0edb762c7b54d8f1c2d98d4065f6a7cf79fe93e4a31693ba70f480a6693a53e48cc2644f2ebc5a457a9afc87f2af728cebdc9af4ab0933',
    password_salt: 'fa26e817f5de0d6634da7e8888ef01e7' },
];

// ─── DB bootstrap ─────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH);

try { db.exec('ALTER TABLE players ADD COLUMN is_dev   INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
try { db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0'); } catch(_) {}
try { db.exec('ALTER TABLE players ADD COLUMN is_prime INTEGER NOT NULL DEFAULT 0'); } catch(_) {}

function stmt(sql) { return db.prepare(sql); }

function getPlayerByName(name) {
  return db.prepare('SELECT * FROM players WHERE LOWER(name)=LOWER(?) LIMIT 1').get(name) || null;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

let ownerPlayerId = null;

for (const acct of DEV_ACCOUNTS) {
  const isPrime = !!(acct.is_prime);
  const existing = getPlayerByName(acct.name);

  if (existing) {
    stmt(`UPDATE players SET
      is_dev=1, is_admin=1, is_prime=?,
      patreon_tier=3,
      password_hash=?, password_salt=?
      WHERE id=?`
    ).run(isPrime ? 1 : 0, acct.password_hash, acct.password_salt, existing.id);
    if (isPrime) ownerPlayerId = existing.id;
    console.log(`[update] ${acct.name} — hash + flags refreshed${isPrime ? ' (OWNER ★)' : ''}`);
    continue;
  }

  const id = uuidv4();
  stmt(`INSERT INTO players
    (id, name, password_hash, password_salt, cash, xp, level, badges, patreon_tier, is_dev, is_admin, is_prime, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, acct.name, acct.password_hash, acct.password_salt,
        1000, 0, 1, '[]', 3, 1, 1, isPrime ? 1 : 0, Date.now(), Date.now());

  if (isPrime) ownerPlayerId = id;
  console.log(`[create] ${acct.name}${isPrime ? ' (OWNER ★)' : ''}`);
}

// ─── Retire ───────────────────────────────────────────────────────────────────
// Order matters: patreon_tier must go to 0 BEFORE fund membership is pruned.
// syncFundMembership() auto-enrols anyone with patreon_tier>=2 into
// MERCHANTS_GUILD, and revokeExpiredPatreon() never expires tier 3 (it is
// treated as lifetime CEO). A retired dev left on tier 3 would therefore be
// removed from the guild by the dev-exclusion sweep, then immediately re-added
// by the patron sweep on the next tick, ending up with deposit, withdraw and
// proposal rights on the guild fund that it does not have today.

for (const acct of RETIRED_ACCOUNTS) {
  const p = getPlayerByName(acct.name);
  if (!p) { console.log(`[skip]   ${acct.name} — no such account`); continue; }
  if (p.is_prime) { console.log(`[guard]  ${acct.name} — is_prime, refusing to retire`); continue; }

  stmt(`UPDATE players SET
    is_dev=0, is_admin=0, is_prime=0,
    patreon_tier=0, patreon_member_id=NULL, patreon_expires_at=NULL,
    password_hash=?, password_salt=?,
    updated_at=?
    WHERE id=?`
  ).run(acct.password_hash, acct.password_salt, Date.now(), p.id);

  try { stmt(`UPDATE players SET faction=NULL WHERE id=? AND faction='fleshstation'`).run(p.id); } catch(_) {}
  try { stmt(`DELETE FROM fund_memberships WHERE player_id=? AND fund_id IN ('FLSH','MERCHANTS_GUILD')`).run(p.id); } catch(_) {}

  console.log(`[retire] ${acct.name} — login sealed, dev/admin/tier stripped, funds cleared`);
}

// ─── Guild ownership — set MrFlesh as MERCHANTS_GUILD owner ───────────────────
// Also strip non-prime devs from Merchants Guild (devs belong in FLSH only).
if (ownerPlayerId) {
  try {
    stmt(`UPDATE funds SET owner_id=? WHERE id='MERCHANTS_GUILD'`).run(ownerPlayerId);
    console.log(`[guild] MERCHANTS_GUILD owner set to MrFlesh`);

    // Ensure MrFlesh is a member of both funds
    const inMG = stmt(`SELECT 1 FROM fund_memberships WHERE fund_id='MERCHANTS_GUILD' AND player_id=?`).get(ownerPlayerId);
    if (!inMG) {
      stmt(`INSERT OR IGNORE INTO fund_memberships(fund_id,player_id,shares,deposited,joined_at) VALUES('MERCHANTS_GUILD',?,0,0,?)`).run(ownerPlayerId, Date.now());
    }
    const inFL = stmt(`SELECT 1 FROM fund_memberships WHERE fund_id='FLSH' AND player_id=?`).get(ownerPlayerId);
    if (!inFL) {
      stmt(`INSERT OR IGNORE INTO fund_memberships(fund_id,player_id,shares,deposited,joined_at) VALUES('FLSH',?,0,0,?)`).run(ownerPlayerId, Date.now());
    }

    // Remove non-prime devs from MERCHANTS_GUILD (they belong in FLSH only)
    stmt(`DELETE FROM fund_memberships
          WHERE fund_id='MERCHANTS_GUILD'
          AND player_id IN (
            SELECT id FROM players WHERE (is_dev=1 OR is_admin=1) AND is_prime=0
          ) AND player_id != ?`).run(ownerPlayerId);
    console.log(`[guild] Non-prime devs removed from MERCHANTS_GUILD`);
  } catch(e) {
    console.log(`[guild] Note: fund tables may not exist yet — run after server starts once. (${e.message})`);
  }
}

// ─── Audit ────────────────────────────────────────────────────────────────────
// Anything still carrying dev or admin that is not in DEV_ACCOUNTS is unexpected.
try {
  const active = DEV_ACCOUNTS.map(a => a.name.toLowerCase());
  const flagged = stmt(`SELECT name FROM players WHERE is_dev=1 OR is_admin=1 OR is_prime=1`).all();
  const strays = flagged.filter(r => !active.includes(String(r.name).toLowerCase()));
  if (strays.length) {
    console.log(`\n[WARN] Unexpected privileged accounts still present: ${strays.map(r=>r.name).join(', ')}`);
    console.log(`       Check DEV_ACCOUNTS in .env and the dev panel.`);
  } else {
    console.log(`\n[audit] Privileged accounts: ${flagged.map(r=>r.name).join(', ')}`);
  }
} catch(_) {}

console.log('\nDev accounts seeded and retirements applied. No plaintext passwords were written to disk.');
db.close();
