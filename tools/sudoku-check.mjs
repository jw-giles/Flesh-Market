// ═══════════════════════════════════════════════════════════════════════════
// sudoku-check.mjs — the sudoku game, driven rather than read.
//
// TWO SEPARATE FAILURES SHIPPED IN ONE GAME and each hid the other.
//
// The security one: the browser generated the puzzle, held the solution, graded
// itself and told the server what to pay. A Ƒ4,200 cap, a 20s duration floor and
// a cooldown in localStorage were the whole defence.
//
// The correctness one: the generator removed clues at random with no uniqueness
// check, and the client graded by comparing against ITS solution. Measured over
// the shipped clue counts, the share of boards with exactly one completion was
// Easy 53%, Medium 10%, and Hard, Expert and Insane 0%. Above Easy a correct
// solve was told it was wrong unless it reproduced the one hidden grid.
//
// The second is why the first mattered less than it looks: forging the payout
// was close to the only way to be paid for a Hard board. Fixing either alone
// makes things worse, so both are asserted here.
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'fs';
import * as S from '../server/sudoku.js';

let pass = 0; const fails = [];
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); }
}
function section(t) { console.log('\n' + t); }

const srv = fs.readFileSync(new URL('../server/server.js', import.meta.url), 'utf8');
const cli = fs.readFileSync(new URL('../client/assets/casino-sudoku.js', import.meta.url), 'utf8');

section('The client cannot grade what it cannot see');
{
  // The shape of the old bug, stated as absences. These are cheap and they are
  // the ones that would fail loudest if someone restored the old file.
  ok('the client holds no solution', !/\blet\s+[^;\n]*\bsolution\s*[=,;]/.test(cli)
     && !/solution\s*\[/.test(cli));
  ok('and generates no puzzle', !/function generateSudoku/.test(cli));
  // Comment stripped, because the file explains at length that the cooldown USED
   // to live in localStorage and a bare substring match reads that as a use.
  const live = cli.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok('and keeps no cooldown of its own', !/localStorage/.test(live));
  ok('and never names a payout', !/CasinoNet\.result/.test(cli));
  ok('it asks the server to start a board', /call\('sudoku_start'/.test(cli));
  ok('posts the grid back to be graded', /call\('sudoku_finish', \{ roundId: sdkRoundId, grid: userGrid \}/.test(cli));
  ok('and takes hints from the server', /call\('sudoku_hint'/.test(cli));
}

section('The server owns every decision that moves cash');
{
  ok('there is a start handler', /if\(msg\.type==='sudoku_start'\)\{/.test(srv));
  ok('a hint handler', /if\(msg\.type==='sudoku_hint'\)\{/.test(srv));
  ok('and a finish handler that grades', /if\(msg\.type==='sudoku_finish'\)\{/.test(srv));
  ok('the payout comes from the server table, not the message',
     /const reward = Sudoku\.rewardFor\(diff, board\.hints\);/.test(srv)
     && /safeAddCash\(actor, reward\);/.test(srv));

  // THE COOLDOWN IS CHECKED BEFORE THE BOARD IS BUILT. Carving a unique puzzle
  // costs real CPU on the same thread as everything else, so a client that can
  // trigger generation without being entitled to a round can spend it.
  const start = srv.slice(srv.indexOf("if(msg.type==='sudoku_start'){"),
                          srv.indexOf("if(msg.type==='sudoku_hint'){"));
  ok('the start handler resolves as a span', start.length > 400, start.length + ' chars');
  ok('the cooldown is checked before anything is generated',
     start.indexOf('cooldownLeftMs') > 0
     && start.indexOf('cooldownLeftMs') < start.indexOf('Sudoku.generate('));

  // Every tier is settled by the server, so casino_result cannot reach one.
  ok('every tier is in the server-settled set',
     /\.\.\.Sudoku\.DIFFICULTIES\.map\(d => d\.game\)/.test(srv));
  // And the retired shared key cannot be reopened by a stale client.
  ok('the old client-settled round type is refused',
     /game === 'mathgame' \|\| game === 'sudoku'/.test(srv));
  // Per tier caps: the single key meant an Easy round's backstop was the Insane
  // prize, so a forged Easy settlement paid Ƒ4,200 for a Ƒ50 puzzle.
  ok('each tier carries its own payout cap',
     /CASINO_CFG\[d\.game\] = \{ mult: 0, flat: Sudoku\.maxGross\(d\)/.test(srv));
  ok('and the solution is never sent to the client',
     !/solution:\s*board\.solution/.test(srv) && !/puzzle:built\.solution/.test(srv));
}

section('Every generated board has exactly one solution');
{
  // THE ASSERTION THE OLD GENERATOR COULD NOT HAVE PASSED. Random removal put
  // Hard, Expert and Insane at 0% unique, with the median board carrying more
  // than fifty completions.
  let allUnique = true, hitTarget = 0, worstMs = 0, worstClues = 0;
  const N = 6;                                  // per tier, kept low: this is a solver
  for (const d of S.DIFFICULTIES) {
    for (let i = 0; i < N; i++) {
      const t0 = Date.now();
      const g = S.generate(d.clues);
      worstMs = Math.max(worstMs, Date.now() - t0);
      if (S.countSolutions(g.puzzle, 2) !== 1) allUnique = false;
      if (g.clues <= d.clues) hitTarget++;
      worstClues = Math.max(worstClues, g.clues - d.clues);
      if (!S.isSolved(g.puzzle, g.solution)) allUnique = false;
    }
  }
  ok('no board is ambiguous', allUnique);
  ok('and the tiers reach their clue targets',
     hitTarget >= N * S.DIFFICULTIES.length - 2,
     hitTarget + ' of ' + (N * S.DIFFICULTIES.length) + ', worst overshoot ' + worstClues);
  // The budget bounds the worst case rather than the typical one. Blowing it
  // leaves a few more clues on the board, which is easier, never invalid.
  ok('generation stays inside its work budget with headroom',
     worstMs < S.CARVE_BUDGET_MS * 4, worstMs + 'ms worst of ' + S.CARVE_BUDGET_MS + 'ms budget');
}

section('Grading is by validity, which is what solved means');
{
  const { puzzle, solution } = S.generate(33);
  ok('the board\'s own solution grades correct', S.isSolved(puzzle, solution));

  const wrong = solution.slice();
  wrong[80] = wrong[80] === 9 ? 1 : wrong[80] + 1;
  ok('one altered cell grades wrong', !S.isSolved(puzzle, wrong));

  // A GIVEN IS NOT THE PLAYER'S TO CHANGE, and this has to be tested where the
  // check is load bearing. Altering one given inside the stored solution is
  // rejected by the row and column rules anyway, so that version of the test
  // passed with the givens check deleted: it proved nothing. The real attack is
  // submitting a perfectly valid sudoku grid that has nothing to do with the
  // board you were issued.
  const other = S.generate(46).solution;
  const differs = other.some((v, i) => puzzle[i] !== 0 && puzzle[i] !== v);
  ok('a second board differs from this one at a given', differs);
  ok('and an unrelated valid grid is not a solution to this board',
     !S.isSolved(puzzle, other));

  ok('a short grid is rejected', !S.isSolved(puzzle, solution.slice(0, 80)));
  ok('a zero is rejected', !S.isSolved(puzzle, solution.map((v, i) => i === 40 ? 0 : v)));
  ok('a value out of range is rejected', !S.isSolved(puzzle, solution.map((v, i) => i === 40 ? 10 : v)));
  ok('a non integer is rejected', !S.isSolved(puzzle, solution.map((v, i) => i === 40 ? 4.5 : v)));

  // THE FIX FOR THE REJECTED-CORRECT-ANSWER BUG. On a board with more than one
  // completion, any valid completion is a solve. The generator no longer emits
  // one, so the test builds it: strip cells from a solved grid until the board
  // is ambiguous.
  //
  // THE FIRST VERSION HAND CONSTRUCTED IT and got the combinatorics backwards.
  // A swappable rectangle needs its two rows in the SAME band so the box
  // constraint survives the swap, and it required them to be in DIFFERENT ones,
  // so the search never found anything and the test reported one completion.
  // Searching is shorter than the condition and cannot be wrong about it.
  const amb = solution.slice();
  let stripped = 0;
  for (let i = 0; i < 81 && S.countSolutions(amb, 2) < 2; i++) {
    if (amb[i] === 0) continue;
    amb[i] = 0; stripped++;
  }
  const found = S.completions(amb, 3);
  ok('an ambiguous board can be constructed for this test', found.length >= 2,
     found.length + ' completions after stripping ' + stripped);
  // EVERY valid completion has to grade correct, not just the one the generator
  // happened to keep. This is the assertion the old client could not have
  // passed: it compared cell by cell against its own stored grid.
  ok('and every valid completion of it grades correct',
     found.length >= 2 && found.every(g => S.isSolved(amb, g)),
     found.filter(g => !S.isSolved(amb, g)).length + ' rejected');
  // The structural half: nothing in the grader can consult a stored solution,
  // because it is not given one.
  ok('the grader is not handed a solution to compare against',
     /export function isSolved\(puzzle, grid\)/.test(
       fs.readFileSync(new URL('../server/sudoku.js', import.meta.url), 'utf8')));
}

section('Hints are capped where the penalty bottoms out');
{
  // The cap is one below the number of steps, so the last hint a player can
   // take is the last one that leaves them anything to be paid.
  ok('the cap is one short of hinting the prize away', S.HINT_MAX === S.HINT_STEPS - 1,
     S.HINT_MAX + ' of ' + S.HINT_STEPS + ' steps');
  const d = S.DIFF_BY_ID.get(4);
  ok('no hints pays the full prize', S.rewardFor(d, 0) === d.reward);
  // ROUND NUMBERS, and this is the assertion that found the float bug. Written
  // as 1 - used * 0.2, four hints on this board paid Ƒ799 instead of Ƒ800.
  let ladderOk = true, shown = [];
  for (let h = 0; h <= S.HINT_MAX; h++) {
    const want = d.reward * (S.HINT_STEPS - h) / S.HINT_STEPS;
    shown.push(S.rewardFor(d, h));
    if (S.rewardFor(d, h) !== want) ladderOk = false;
  }
  ok('and every step down is exact rather than a float remainder', ladderOk, shown.join(' / '));
  ok('the last hint still leaves something to be paid', S.rewardFor(d, S.HINT_MAX) > 0);
  // UNBOUNDED HINTS AGAINST A FLOORED PENALTY IS A FREE AUTO SOLVE: eighty one
  // hints and the board fills itself for 20% of the prize, with no skill and no
  // cost past the fourth.
  ok('and asking for more than four changes nothing',
     S.rewardFor(d, 81) === S.rewardFor(d, 4));
  ok('the handler refuses past the cap', /if\(board\.hints >= Sudoku\.HINT_MAX\)\{/.test(srv));

  // A hint reveals a cell the player has not got right yet, from the server's
  // own copy, and the handler writes it into the server's grid.
  const { puzzle, solution } = S.generate(39);
  const grid = puzzle.slice();
  const c = S.hintCell(puzzle, solution, grid);
  ok('a hint names an empty cell and its true value',
     c && puzzle[c.index] === 0 && c.value === solution[c.index]);
  ok('and a solved board has nothing left to reveal', S.hintCell(puzzle, solution, solution) === null);
  ok('the handler records the reveal server-side', /board\.grid\[cell\.index\] = cell\.value;/.test(srv));
  // WITHOUT THIS THE HINT IS FREE. Take four hints, then submit a grid with
  // those four cells filled from your own working, and the penalty applies to a
  // board you were handed the answers to either way. Keeping the server's
  // revealed cells means the reveal is a fact about the round, not about the
  // message.
  ok('and a revealed cell cannot be written out of the submission',
     /if\(grid\) for\(let i=0;i<81;i\+\+\) if\(board\.grid\[i\] !== board\.puzzle\[i\]\) grid\[i\] = board\.grid\[i\];/.test(srv));
}

section('The tiers are ordered by difficulty for the first time');
{
  const cl = S.DIFFICULTIES.map(d => d.clues);
  const rw = S.DIFFICULTIES.map(d => d.reward);
  ok('clues fall as the prize rises',
     cl.every((v, i) => i === 0 || v < cl[i - 1]) && rw.every((v, i) => i === 0 || v > rw[i - 1]),
     cl.join('>') + ' for ' + rw.join('<'));
  // The old ladder was 46/35/26/23/17 with no uniqueness, so the seventeen clue
  // Insane board had the MOST completions and was the softest puzzle on the
  // menu while paying the most.
  ok('and no tier asks for fewer clues than greedy unique removal can reach',
     Math.min(...cl) >= 24, 'lowest tier ' + Math.min(...cl));
  ok('each tier has its own round key so cooldowns are per tier',
     new Set(S.DIFFICULTIES.map(d => d.game)).size === S.DIFFICULTIES.length);
  ok('and its own cooldown', S.DIFFICULTIES.every(d => d.cooldownMs > 0));
}

section('The deploy scripts point at the install that exists');
{
  // Not a sudoku property, but it lives here rather than in a new one-assertion
  // file: APP_DIR was /opt/fleshmarket in three scripts while the live server
  // runs from /root/Flesh-Market, and rsync CREATES a missing destination. The
  // failure mode is a second dead copy of the app plus a pm2 reload of the real
  // process, with nothing reported as wrong.
  const dep = (f) => fs.readFileSync(new URL('../deploy/' + f, import.meta.url), 'utf8');
  const noComments = (t) => t.replace(/^\s*#.*$/gm, '');
  for (const f of ['update.sh', 'setup.sh', 'setup_github.sh', 'backup.sh', 'pull_backup.sh']) {
    ok(f + ' does not hardcode a path nothing serves from',
       !/opt\/fleshmarket/.test(noComments(dep(f))));
  }
  ok('and update.sh takes an override like the backup scripts always did',
     /APP_DIR="\$\{FM_APP_DIR:-\/root\/Flesh-Market\}"/.test(dep('update.sh')));
  // THE LINE THAT MATTERS. A wrong path did not fail, it succeeded somewhere
  // useless.
  ok('update.sh refuses a directory with no install in it',
     /if \[ ! -f "\$APP_DIR\/client\/version\.json" \]; then/.test(dep('update.sh')));
  ok('and refuses to rsync a checkout onto itself',
     /= "\$PROJECT_ROOT"\]?; then/.test(dep('update.sh').replace(/\s+/g, ' ')) ||
     /"\$\(cd "\$APP_DIR" && pwd -P\)" = "\$PROJECT_ROOT"/.test(dep('update.sh')));
  // Ownership was baked in as 'fm'. The live box runs as root, so the chown
  // aborted the script under set -e partway through a sync.
  ok('ownership follows the install rather than a name baked into the script',
     /FM_USER="\$\{FM_USER:-\$\(stat -c %U "\$APP_DIR"/.test(dep('update.sh')));
  const readme = fs.readFileSync(new URL('../deploy/DEPLOY_README.md', import.meta.url), 'utf8');
  ok('the README names the real path', /\/root\/Flesh-Market/.test(readme));
  ok('and says ship.sh is the routine path', /use `\.\/ship\.sh`/.test(readme));
}

console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
if (fails.length) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
