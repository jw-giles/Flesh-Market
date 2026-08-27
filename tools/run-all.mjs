// ═══════════════════════════════════════════════════════════════════════════
// run-all.mjs — every check, one command, and an honest answer about what ran.
//
//   npm run check          (from the repo root)
//   node tools/run-all.mjs
//
// WHY THIS EXISTS. A galaxy swap killed the NPC fleet for a whole session, and
// tools/fleet-check.mjs had been asserting exactly that and failing the entire
// time. Nobody saw it, because running thirteen tools by hand means reading
// thirteen tails, and three of them needed jsdom and died with a module-not-
// found stack that reads as a broken tool rather than a failing assertion.
//
// So the thing this has to do well is not "run the checks". It is to make
// DID NOT RUN as loud as FAILED. A suite that quietly shrinks is worse than one
// that fails, because a shrinking suite still prints green.
//
// A check is any tools/*-check.mjs. Simulations and audits are not checks and
// are deliberately not run here: they print numbers a human reads, and folding
// them in would mean inventing a pass condition they do not have.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const TOOLS = path.join(ROOT, 'tools');
const TIMEOUT_MS = 120_000;

if (!fs.existsSync(path.join(ROOT, 'client/version.json'))) {
  console.error('Run this from the repo root:  node tools/run-all.mjs');
  process.exit(2);
}

const checks = fs.readdirSync(TOOLS)
  .filter(f => f.endsWith('-check.mjs'))
  .sort();

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/version.json'), 'utf8')).version;
console.log(`\nFleshMarket v${version} — ${checks.length} checks\n`);

const results = [];
for (const file of checks) {
  const name = file.replace('-check.mjs', '');
  const r = spawnSync(process.execPath, [path.join('tools', file)], {
    cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT_MS,
  });
  const out = (r.stdout || '') + (r.stderr || '');

  // Three outcomes, and SKIPPED is a first-class one rather than a shrug.
  let status, detail;
  if (r.error && r.error.code === 'ETIMEDOUT') {
    status = 'TIMEOUT'; detail = `exceeded ${TIMEOUT_MS / 1000}s`;
  } else if (/!!\s*NOT RUN\s*!!/.test(out)) {
    status = 'SKIPPED'; detail = 'jsdom not installed';
  } else if (/Cannot find package|ERR_MODULE_NOT_FOUND/.test(out)) {
    // A missing dep that did NOT go through the skip banner. Still not a pass.
    status = 'SKIPPED';
    detail = (out.match(/Cannot find package '([^']+)'/) || [, 'a dependency'])[1] + ' not installed';
  } else if (r.status !== 0) {
    status = 'FAILED';
    detail = (out.match(/^\s*-\s+(.+)$/m) || [, `exit ${r.status}`])[1];
  } else {
    status = 'PASSED';
    const m = out.match(/(\d+)\s+passed/) || out.match(/OK\s+(\d+)\/\d+/);
    detail = m ? `${m[1]} assertions` : 'ok';
  }
  results.push({ name, status, detail, out });

  const tag = { PASSED: '  ok  ', FAILED: ' FAIL ', SKIPPED: ' SKIP ', TIMEOUT: ' TIME ' }[status];
  console.log(`${tag} ${name.padEnd(16)} ${detail}`);
}

const failed  = results.filter(r => r.status === 'FAILED' || r.status === 'TIMEOUT');
const skipped = results.filter(r => r.status === 'SKIPPED');
const total   = results
  .filter(r => r.status === 'PASSED')
  .reduce((a, r) => a + (parseInt((r.out.match(/(\d+)\s+passed/) || r.out.match(/OK\s+(\d+)\//) || [, 0])[1], 10) || 0), 0);

console.log('');
console.log(`${results.length - failed.length - skipped.length}/${results.length} checks green, ${total} assertions.`);

if (skipped.length) {
  // Deliberately not silent and deliberately not fatal. Silent is how the fleet
  // bug survived; fatal would mean a bare clone cannot run the suite at all.
  console.log('');
  console.log(`!! ${skipped.length} CHECK${skipped.length === 1 ? '' : 'S'} DID NOT RUN: ${skipped.map(s => s.name).join(', ')}`);
  console.log('   These assert real behaviour and are currently asserting nothing.');
  console.log('   npm install      (from the repo root) installs what they need.');
}

if (failed.length) {
  console.log('');
  for (const f of failed) {
    console.log(`FAILED  ${f.name}`);
    for (const line of f.out.split('\n').filter(l => /^\s*-\s+/.test(l) || /FAIL/.test(l)).slice(0, 12))
      console.log('        ' + line.trim());
  }
  process.exit(1);
}
process.exit(0);
