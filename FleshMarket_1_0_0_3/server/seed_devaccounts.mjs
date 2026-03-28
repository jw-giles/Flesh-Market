/**
 * seed_devaccounts.mjs
 * Creates the five dev/admin accounts using pre-computed PBKDF2-SHA512 hashes.
 * Plaintext passwords are NOT stored here — only salted hashes.
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
    password_hash: '9875422025307919621916046563085d69b91c3507e9c5f71a8f4b6a07c5270478608c13846e9e46a8a993483f5eddd7afbd53ecf1b9d51c57b5e22ae08d5bf5',
    password_salt: '8f6d090dc5ce55e131460b99e4aba5aa',
    is_prime:      true,   // owner — joins FLSH + Merchants Guild, shown as ★ deep orange
  },
  {
    name:          'DEV-FIXER',
    password_hash: '9eaf727e9f3d6950c8a90074b1443432024354ecc492f202043e43845625fa3bbb90696513bf6eeebad08b4c1aee3e50c916616a82f21feb6978db575849cda4',
    password_salt: '484290cf25faa6feb06ee110849cf833',
  },
  {
    name:          'DEV-SLUT',
    password_hash: '753cd26c0ebaa92d643187dba1c3b206c0db0396454330ef31d4cde8f07bef12298dac497258d7d79d3e6afede77e6adf2a178d75ef49868b06e1948286f3990',
    password_salt: '8bbe7dfb8c7687ae433d7910246877e0',
  },
  {
    name:          'DEV-SMASHER',
    password_hash: '4e3360765bae6a17085bd7b4c8f67014e141c5085e11f3a0071401ff47497d0dfdcd2a59f7ba9a9f20b04914c9581bbb583fcc12f95ebf5b31e40afd2bba901f',
    password_salt: 'cc15b8a5857a25e68727e6171cfc9c3f',
  },
  {
    name:          'DEV-GURU',
    password_hash: '0aa1e266a47528a36f0c934facffce2b319055e2d04ade95cf7a7e8a2d1dd877ac54902523a8fa84103fc78f7c7ed3befcd2528f322effd1804366a9f5e5429b',
    password_salt: '6242c02e86bddb6a6883e2d28d2a2425',
  },
  {
    name:          'DEV-PEAK',
    password_hash: 'b44df26cee7a605a34206bb8cd346701fe65a0b2ab8abf45a321176ff6ea6010979122bc6ae6a12f0f1c08cbdb34d44d9f8854c473d14d19e5b5bf87605eadad',
    password_salt: 'd9a92b6cc5c0290e480461cec084e717',
  },
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

console.log('\nAll dev accounts seeded. No plaintext passwords were written to disk.');
db.close();
