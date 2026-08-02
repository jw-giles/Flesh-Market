#!/usr/bin/env node
/*
 * mathtest-check.mjs - Guild Numeracy Exams verifier.
 *
 * Run from the repo root:  node tools/mathtest-check.mjs
 * Exit 0 = clean, 1 = at least one FAIL.
 *
 * This exists because the bug it replaces was invisible. The old Math Quiz told
 * the player "Total earned: 800", showed it in the score row for the whole
 * session, and then paid nothing, because the round it needed was already open
 * and the client discarded the error. Nothing on screen was wrong. The number
 * was just never real.
 *
 * So the assertions below are deliberately about the things that were true on
 * screen and false in the ledger:
 *
 *   PAPER    the generator never emits an unanswerable or untypeable question
 *   KEY      the answer key cannot reach the client through publicQuestion
 *   CURVE    a paid paper actually loses money at a failing grade
 *   CAP      the CASINO_CFG backstop cannot clamp an honest perfect paper
 *   WIRE     the client declares no payout and holds no answers
 *   SERVER   the settle path, the cooldown and the gate are server side
 *   I18N     every topic and question template has a catalog entry
 *
 * The fuzz counts are high because generator bugs are per-shape and rare: a
 * divide that lands on 1/3 or a sequence that overflows is one draw in
 * thousands, and a player finds it on day one.
 */
import fs from 'fs';
import path from 'path';
import * as MT from '../server/mathtest.js';

const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
// Comments describe the bug being fixed and therefore quote the very thing the
// grep is looking for. Strip them, or every assertion below is checking the
// prose instead of the code.
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const ok  = (name, cond, detail) => { if (cond) { pass++; } else { fail++; console.log('FAIL  ' + name + (detail ? '  ' + detail : '')); } };
const head = s => console.log('\n' + s);

// ── PAPER: fuzz every exam ───────────────────────────────────────────────────
head('PAPER');
const REPS = 500;
let qTotal = 0;
const badNaN = [], badSelf = [], badType = [], badText = [], badCount = [];
const topicSeen = new Set(), tierSeen = new Set(), tkSeen = new Set();
for (const ex of MT.EXAMS) {
  for (let r = 0; r < REPS; r++) {
    const paper = MT.buildPaper(ex, 'mixed');
    if (paper.length !== ex.count) badCount.push(ex.id);
    for (const q of paper) {
      qTotal++;
      topicSeen.add(q.topic); tierSeen.add(q.tier); if (q.tk) tkSeen.add(q.tk);
      if (!Number.isFinite(q.answer)) { badNaN.push(`${ex.id}/${q.topic}/t${q.tier}: ${q.text}`); continue; }
      if (!MT.isCorrect(q, q.answer)) badSelf.push(`${ex.id}/${q.topic}: ${q.text} = ${q.answer}`);
      // Answers a player has to type. More than three decimal places is a
      // question nobody can answer, which reads as a broken payout, not a hard
      // question, and that is exactly the complaint being fixed here.
      if (Math.abs(Math.round(q.answer * 1000) / 1000 - q.answer) > 1e-9) badType.push(`${ex.id}/${q.topic}/t${q.tier}: ${q.text} = ${q.answer}`);
      if (!q.text || /undefined|NaN|Infinity/.test(q.text)) badText.push(`${ex.id}/${q.topic}: ${q.text}`);
    }
  }
}
ok('paper length matches exam.count', badCount.length === 0, badCount.slice(0, 3).join(', '));
ok('no non-finite answers', badNaN.length === 0, badNaN.slice(0, 3).join(' | '));
ok('every question grades its own answer correct', badSelf.length === 0, badSelf.slice(0, 3).join(' | '));
ok('every answer is typeable at 3 decimal places', badType.length === 0, badType.slice(0, 3).join(' | '));
ok('no placeholder leaked into question text', badText.length === 0, badText.slice(0, 3).join(' | '));
ok('all 10 topics reachable from the exam table', topicSeen.size === MT.TOPICS.length, `saw ${topicSeen.size}`);
ok('all 5 tiers reachable from the exam table', tierSeen.size === 5, `saw ${[...tierSeen].sort().join(',')}`);
console.log(`      ${qTotal.toLocaleString()} questions generated across ${MT.EXAMS.length} exams`);

// A wrong answer must be wrong. Guards a tolerance widened past the gap between
// adjacent plausible answers, which would silently pay for near misses.
let tolBad = 0;
for (const ex of MT.EXAMS) for (let r = 0; r < 60; r++) for (const q of MT.buildPaper(ex, 'mixed')) {
  if (MT.isCorrect(q, q.answer + 1) || MT.isCorrect(q, q.answer - 1)) tolBad++;
  if (MT.isCorrect(q, null) || MT.isCorrect(q, undefined) || MT.isCorrect(q, NaN) || MT.isCorrect(q, 'x')) tolBad++;
}
ok('off-by-one and empty answers are graded wrong', tolBad === 0, `${tolBad} leaks`);

// Topic choice on the free drill actually narrows the paper.
const drill = MT.EXAM_BY_ID.get('drill');
let mixedTopics = new Set(), pickedTopics = new Set();
for (let r = 0; r < 40; r++) {
  MT.buildPaper(drill, 'mixed').forEach(q => mixedTopics.add(q.topic));
  MT.buildPaper(drill, 'algebra').forEach(q => pickedTopics.add(q.topic));
}
ok('drill "mixed" spans multiple topics', mixedTopics.size > 3, `${mixedTopics.size}`);
ok('drill topic choice is honoured', pickedTopics.size === 1 && pickedTopics.has('algebra'), [...pickedTopics].join(','));

// ── KEY: the answer never crosses the wire ───────────────────────────────────
head('KEY');
const sample = MT.buildPaper(MT.EXAM_BY_ID.get('quant'), 'mixed')[0];
const pub = MT.publicQuestion(sample, 20);
ok('publicQuestion strips the answer', !('answer' in pub));
ok('publicQuestion strips the tolerance', !('tol' in pub));
ok('publicQuestion keeps what the client renders', ['i','text','timeSec','reward','tier','topic'].every(k => k in pub));
const pubJson = JSON.stringify(pub);
ok('serialised question does not contain the answer key', !new RegExp('"answer"').test(pubJson));

// ── CURVE: a failing paper has to cost money ─────────────────────────────────
head('CURVE');
ok('F pays nothing', MT.gradeFor(0.59).mult === 0 && MT.gradeFor(0).mult === 0);
ok('grade bands are monotonic', MT.GRADES.every((g, i) => i === 0 || MT.GRADES[i - 1].mult > g.mult));
for (const ex of MT.EXAMS) {
  if (ex.entry === 0) continue;
  // Expected pot for this exam, averaged so a single unlucky draw does not
  // decide whether the economics are right.
  let pot = 0, n = 200;
  for (let r = 0; r < n; r++) pot += MT.buildPaper(ex, 'mixed').reduce((a, q) => a + q.reward, 0);
  pot /= n;
  const net = s => pot * s * MT.gradeFor(s).mult - ex.entry;
  ok(`${ex.id}: a 50% paper loses the entry fee`, net(0.5) <= -ex.entry * 0.99, `net ${Math.round(net(0.5))}`);
  ok(`${ex.id}: a 60% paper still loses money`, net(0.6) < 0, `net ${Math.round(net(0.6))}`);
  ok(`${ex.id}: break even lands between 60% and 80%`, net(0.6) < 0 && net(0.8) > 0,
     `60%:${Math.round(net(0.6))} 80%:${Math.round(net(0.8))}`);
  ok(`${ex.id}: a perfect paper is worth sitting`, net(1.0) > ex.entry * 0.4, `net ${Math.round(net(1.0))}`);
}

// ── CAP: the backstop must not clamp honest play ─────────────────────────────
head('CAP');
for (const ex of MT.EXAMS) {
  const cap = MT.maxGross(ex);
  let worst = 0;
  for (let r = 0; r < 400; r++) {
    const paper = MT.buildPaper(ex, 'mixed');
    const streak = ex.streakEvery ? Math.floor(ex.count / ex.streakEvery) * ex.streakBonus : 0;
    const perfect = (paper.reduce((a, q) => a + q.reward, 0) + streak) * MT.GRADES[0].mult;
    if (perfect > worst) worst = perfect;
  }
  ok(`${ex.id}: cap clears a flawless paper`, cap >= worst, `cap ${cap} vs best ${Math.round(worst)}`);
  ok(`${ex.id}: cap is not absurdly slack`, cap <= worst * 1.6, `cap ${cap} vs best ${Math.round(worst)}`);
}

// ── WIRE: the client decides nothing that costs money ────────────────────────
head('WIRE');
const cli = code(read('client/assets/casino-mathgame.js'));
ok('client never calls CasinoNet.result', !/CasinoNet\s*\.\s*result/.test(cli));
ok('client never calls CasinoNet.bet', !/CasinoNet\s*\.\s*bet/.test(cli));
ok('client sends no payout field', !/payout/.test(cli));
ok('client does not write ME.cash', !/ME\.cash\s*=/.test(cli));
ok('client keeps no localStorage cooldown', !/localStorage/.test(cli));
ok('client has no question generator', !/Math\.random/.test(cli));
ok('client posts answers to the server', /'math_answer'/.test(cli) && /'math_start'/.test(cli));
ok('client can resume an interrupted paper', /'math_resume'/.test(cli));
ok('client can walk out of a paper', /'math_abandon'/.test(cli));

// ── SERVER: the handlers and the fixes they depend on ────────────────────────
head('SERVER');
const srvRaw = read('server/server.js');
const srv = code(srvRaw);
for (const t of ['math_exams', 'math_start', 'math_answer', 'math_resume', 'math_abandon'])
  ok(`server handles ${t}`, new RegExp(`msg\\.type===['"]${t}['"]`).test(srv));
ok('answer keys are held server side only', /const MATH_PAPERS = new Map\(\)/.test(srv));
ok('settlement writes the round itself', /resolveCasinoRound\(round\.id, abandoned \?/.test(srv));
ok('cooldown reads the round ledger, not the client', /getLastCasinoRoundTs\(actor\.id, exam\.game\)/.test(srv));
ok('quant gate reads a real prior result', /getBestCasinoResult\(actor\.id, exam\.gate\.game\)/.test(srv));
ok('a stale open paper is auto-forfeited, not a lockout', /getOpenRoundForGame\(actor\.id, exam\.game\)/.test(srv));
ok('the per-question clock is the server clock', /now - paper\.qSentTs/.test(srv));
ok('out-of-sequence answers are refused', /Out of sequence/.test(srv));
ok('legacy client-scored mathgame rounds are refused', /game === 'mathgame'/.test(srv));
// The hole a live run found and every static check missed: casino_result
// resolved a round by id without asking which game opened it, so any
// server-authoritative round could be settled through the client-declared path
// instead. Solitaire paid 1848 on a 250 buy-in with no cards played.
ok('server-settled games are named', /const SERVER_SETTLED_GAMES = new Set\(\['solitaire'/.test(srv));
ok('solitaire and every exam are in that set', /MathTest\.EXAMS\.map\(e => e\.game\)/.test(srv));
const guarded = [...srv.matchAll(/SERVER_SETTLED_GAMES\.has\(round\.game\)/g)].length;
ok('both client-priced paths check it', guarded === 2, `${guarded} of 2 (casino_result, casino_bet_addon)`);

// The three cross-cutting casino fixes this patch carries. Each guards a
// specific regression, so if the line is rewritten the check names the reason.
// The count is asserted, not just the absence: this check found a THIRD site
// (casino_play, one-shot games) after two had been fixed by reading the file,
// which is the whole argument for asserting a number here.
const guards = [...srv.matchAll(/Number\.isFinite\(cfg\.mult\)/g)].length;
// Four sites: casino_result, casino_play, solitaire_finish, and the exam
// settle. Asserting the count rather than mere absence is what turns "I fixed
// the ones I read" into "I fixed the ones there are".
ok('every payout cap guards a falsy-zero multiplier', guards === 4, `${guards} of 4 sites`);
ok('no falsy-OR fallback survives on any cap', !/cfg\.mult\s*\|\|/.test(srv));
const errAcks = [...srv.matchAll(/casino_result_ack',data:\{ok:false,[^}]*\}/g)].map(m => m[0]);
ok('every failing casino_result_ack echoes its roundId',
   errAcks.length >= 3 && errAcks.every(a => a.includes('roundId')),
   `${errAcks.filter(a => !a.includes('roundId')).length} of ${errAcks.length} missing`);
ok('exam configs are derived from the exam table, not retyped',
   /for \(const ex of MathTest\.EXAMS\) \{\s*\n\s*CASINO_CFG\[ex\.game\]/.test(srv));

const db = code(read('server/db.js'));
ok('db exposes the cooldown query', /export function getLastCasinoRoundTs/.test(db));
ok('db exposes the certification query', /export function getBestCasinoResult/.test(db));

// ── I18N and house style ─────────────────────────────────────────────────────
head('I18N');
const core = read('client/assets/core.js');
const missingTopic = MT.TOPICS.filter(t => !core.includes(`'casino.math.topic.${t.id}'`));
ok('every topic has a catalog entry', missingTopic.length === 0, missingTopic.map(t => t.id).join(', '));
const missingTk = [...tkSeen].filter(k => !core.includes(`'${k}'`));
ok('every question template has a catalog entry', missingTk.length === 0, missingTk.join(', '));
// Server strings reach the player verbatim (exam names, descriptions, symbol
// questions), so the no-em-dash rule applies to mathtest.js even though the
// i18n checker only reads the client.
const mtSrc = read('server/mathtest.js'); // raw: the em dash rule is about bytes, not code
const dashLines = mtSrc.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /\u2014|\\u2014/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
ok('no em dash in server-generated player text', dashLines.length === 0, dashLines.map(([n]) => 'line ' + n).join(', '));
const nameBad = MT.EXAMS.filter(e => !e.name || !e.desc || /\u2014/.test(e.name + e.desc));
ok('every exam has a name and a description', nameBad.length === 0, nameBad.map(e => e.id).join(', '));

console.log(`\nmathtest-check: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
